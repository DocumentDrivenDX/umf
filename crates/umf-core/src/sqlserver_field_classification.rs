// SPDX-License-Identifier: MIT OR Apache-2.0
//! Native-owned classification of a captured SQL Server catalog column as a
//! core Field. The catalog is the authority for membership; all source and
//! authored UMF content remains in the receipt.
use crate::{
    context::Context,
    engine::{Capabilities, Engine},
    error::EngineError,
    registry::Registry,
    schema::CompiledSchema,
    serialization::{self, Format},
    sqlserver_adapter as sqlserver,
    value::{copy_json, Utf16, Value},
};
use std::{
    collections::BTreeSet,
    sync::{Arc, OnceLock},
};

const RESULT_SCHEMA: &str =
    include_str!("../../../spec/core/sqlserver-field-classification.schema.json");
const KIND_SCHEMA: &str = include_str!("../../../spec/core/kind-operation-v6.schema.json");
const RECOVERY: &str = "Original assertion and native fragment retained in source; reclassify with corrected provenance";
const NATIVE_VERSION: &str = "16.0.4295.3";
const SUBSET: &str =
    "Captured catalog column membership; excludes raw DDL and native constraint/value equivalence";

fn u(s: &str) -> Utf16 {
    Utf16::from(s)
}
fn t(s: &str) -> Value {
    Value::string_utf8(s)
}
fn obj(v: Vec<(&str, Value)>) -> Value {
    Value::Object(v.into_iter().map(|(k, v)| (u(k), v)).collect())
}
fn get<'a>(v: &'a Value, k: &str) -> Option<&'a Value> {
    if let Value::Object(m) = v {
        m.iter().find(|(x, _)| x == &u(k)).map(|(_, v)| v)
    } else {
        None
    }
}
fn get_mut<'a>(v: &'a mut Value, k: &str) -> Option<&'a mut Value> {
    if let Value::Object(m) = v {
        m.iter_mut().find(|(x, _)| x == &u(k)).map(|(_, v)| v)
    } else {
        None
    }
}
fn text<'a>(v: &'a Value, k: &str) -> Option<&'a Utf16> {
    match get(v, k) {
        Some(Value::String(s)) => Some(s),
        _ => None,
    }
}
fn array<'a>(v: &'a Value, k: &str) -> Option<&'a [Value]> {
    match get(v, k) {
        Some(Value::Array(a)) => Some(a),
        _ => None,
    }
}
fn err(code: &str, path: &str, message: &str) -> EngineError {
    EngineError::new(code, u(path), message)
}
fn copy_text(value: &Utf16, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    ctx.charge_work(value.len(), Utf16::default())?;
    Ok(value.clone())
}
fn append_text(base: &Utf16, suffix: &str, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    let suffix: Vec<u16> = suffix.encode_utf16().collect();
    ctx.charge_work(base.len().saturating_add(suffix.len()), base.clone())?;
    let mut units = Vec::with_capacity(base.len().saturating_add(suffix.len()));
    units.extend_from_slice(base.units());
    units.extend(suffix);
    Ok(Utf16::new(units))
}
fn read_json(s: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    serialization::read_json_value(&s.encode_utf16().collect::<Vec<_>>(), Format::Json, ctx)
}
fn set(v: &mut Value, k: &str, n: Value) -> Result<(), EngineError> {
    let Value::Object(m) = v else {
        return Err(err("SQLSERVER_FIELD_TARGET", "", "Expected object"));
    };
    if let Some((_, old)) = m.iter_mut().find(|(x, _)| x == &u(k)) {
        *old = n
    } else {
        m.push((u(k), n));
    }
    Ok(())
}
fn equal(a: &Value, b: &Value, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    fn canon(v: &Value, c: &mut Context<'_>) -> Result<Value, EngineError> {
        match v {
            Value::Array(a) => {
                let mut out = Vec::with_capacity(a.len());
                for x in a {
                    c.charge_work(1, u(""))?;
                    out.push(canon(x, c)?);
                }
                Ok(Value::Array(out))
            }
            Value::Object(m) => {
                let mut out = Vec::with_capacity(m.len());
                for (k, v) in m {
                    c.charge_work(k.len().saturating_add(1), u(""))?;
                    out.push((k.clone(), canon(v, c)?));
                }
                out.sort_by(|a, b| a.0.cmp(&b.0));
                Ok(Value::Object(out))
            }
            _ => copy_json(v, c),
        }
    }
    Ok(canon(a, ctx)? == canon(b, ctx)?)
}
struct Runtime {
    result: CompiledSchema,
    request: CompiledSchema,
}
fn runtime(engine: &Engine, ctx: &mut Context<'_>) -> Result<Arc<Runtime>, EngineError> {
    static CACHE: OnceLock<Arc<Runtime>> = OnceLock::new();
    if ctx.profile() == crate::context::ResourceProfile::Cooperative
        && ctx.limits() == crate::context::Limits::ordinary()
    {
        if let Some(r) = CACHE.get() {
            return Ok(Arc::clone(r));
        }
    }
    ctx.charge_work(1, u(""))?;
    let mut resources = engine.schema_resources_with_context(ctx)?;
    resources.entries.push((
        u("urn:umf:core:kind-operation:6.0.0"),
        read_json(KIND_SCHEMA, ctx)?,
    ));
    let schema = read_json(RESULT_SCHEMA, ctx)?;
    let result = CompiledSchema::compile(&schema, &resources, ctx)?;
    let req = get(
        get(&schema, "properties").unwrap_or(&Value::Null),
        "request",
    )
    .ok_or_else(|| err("SCHEMA", "", "request schema missing"))?;
    let request = CompiledSchema::compile(req, &resources, ctx)?;
    let ready = Arc::new(Runtime { result, request });
    if ctx.profile() == crate::context::ResourceProfile::Cooperative
        && ctx.limits() == crate::context::Limits::ordinary()
    {
        let _ = CACHE.set(Arc::clone(&ready));
    }
    Ok(ready)
}
fn validate(
    v: &Value,
    s: &CompiledSchema,
    ctx: &mut Context<'_>,
    code: &str,
) -> Result<(), EngineError> {
    if s.validate(v, ctx)?.is_empty() {
        Ok(())
    } else {
        Err(err(
            code,
            "",
            "Value does not match the pinned SQL Server Field classification schema",
        ))
    }
}
fn tagged_node_text<'a>(v: &'a Value) -> Option<&'a Utf16> {
    if text(v, "kind") == Some(&u("string")) {
        text(v, "value")
    } else {
        None
    }
}
fn tagged_node_number(v: &Value) -> Option<u64> {
    if text(v, "kind") != Some(&u("number")) {
        return None;
    }
    let Value::String(token) = get(v, "value")? else {
        return None;
    };
    let token = token.to_utf8().ok()?;
    if token.is_empty() || !token.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    let value = token.parse::<u64>().ok()?;
    (value <= 9_007_199_254_740_991).then_some(value)
}

pub fn classify(
    input: &Value,
    request: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(engine, ctx)?;
    validate(request, &rt.request, ctx, "SQLSERVER_FIELD_REQUEST")?;
    let source = copy_json(input, ctx)?;
    let request = copy_json(request, ctx)?;
    let valid = engine.validate_document(&source, registry, caps, ctx)?;
    if !valid.valid || text(&source, "umf") != Some(&u("0.10.0")) {
        return Err(err(
            "SQLSERVER_FIELD_VERSION",
            "",
            "Valid current 0.10.0 envelope required",
        ));
    }
    let archive = sqlserver::export_document(&source, ctx)?;
    let native_source = text(&request, "nativeSource").ok_or_else(|| {
        err(
            "SQLSERVER_FIELD_REQUEST",
            "/nativeSource",
            "Native source required",
        )
    })?;
    let native_catalog = sqlserver::SqlServerCatalog::import(native_source, ctx)?;
    let canonical_native = native_catalog.export(ctx)?;
    if canonical_native != archive {
        return Err(err(
            "SQLSERVER_FIELD_ARCHIVE",
            "/nativeSource",
            "Native archive differs from captured tree",
        ));
    }
    let payload = get(
        get(&source, "extensions").ok_or_else(|| {
            err(
                "SQLSERVER_FIELD_CAPTURE",
                "/extensions",
                "Extensions required",
            )
        })?,
        "umf.sqlserver",
    )
    .ok_or_else(|| {
        err(
            "SQLSERVER_FIELD_CAPTURE",
            "/extensions/umf.sqlserver",
            "SQL Server capture required",
        )
    })?;
    let root = get(payload, "root").ok_or_else(|| {
        err(
            "SQLSERVER_FIELD_CAPTURE",
            "/extensions/umf.sqlserver/root",
            "Native capture root required",
        )
    })?;
    let root_members = get(root, "members").ok_or_else(|| {
        err(
            "SQLSERVER_FIELD_CAPTURE",
            "/root/members",
            "Native object members required",
        )
    })?;
    let server_version = get(root_members, "serverVersion").and_then(tagged_node_text);
    if server_version != Some(&u(NATIVE_VERSION)) {
        return Err(err(
            "SQLSERVER_FIELD_SERVER",
            "/serverVersion",
            "This binding requires SQL Server 16.0.4295.3",
        ));
    }
    let column = text(&request, "column")
        .ok_or_else(|| err("SQLSERVER_FIELD_REQUEST", "/column", "Column path required"))?;
    let metadata = sqlserver::catalog_from_document(&source, ctx)?;
    let rows = sqlserver::column_metadata_value(&metadata, ctx)?;
    let row_values = match &rows {
        Value::Array(a) => a,
        _ => {
            return Err(err(
                "SQLSERVER_FIELD_METADATA",
                "",
                "Column metadata array required",
            ))
        }
    };
    let field = row_values
        .iter()
        .find(|x| text(x, "path") == Some(column))
        .ok_or_else(|| {
            err(
                "SQLSERVER_FIELD_COLUMN",
                "/column",
                "Captured column path not found",
            )
        })?;
    let element = get(field, "element")
        .ok_or_else(|| err("SQLSERVER_FIELD_METADATA", "", "Column identity missing"))?;
    let element_id = text(element, "id")
        .ok_or_else(|| err("SQLSERVER_FIELD_METADATA", "", "Column element id missing"))?;
    let modules = array(&source, "modules")
        .ok_or_else(|| err("SQLSERVER_FIELD_METADATA", "/modules", "Modules required"))?;
    let mi = modules
        .iter()
        .position(|m| text(m, "id") == Some(&u("sqlserver.columns")))
        .ok_or_else(|| {
            err(
                "SQLSERVER_FIELD_METADATA",
                "/modules",
                "Derived column module required",
            )
        })?;
    let elements = array(&modules[mi], "elements")
        .ok_or_else(|| err("SQLSERVER_FIELD_METADATA", "/elements", "Elements required"))?;
    let ei = elements
        .iter()
        .position(|e| text(e, "id") == Some(element_id))
        .ok_or_else(|| {
            err(
                "SQLSERVER_FIELD_METADATA",
                "/elements",
                "Derived column element required",
            )
        })?;
    let element = &elements[ei];
    let ideal = u(&format!("/modules/{mi}/elements/{ei}/kind"));
    let binding = obj(vec![
        ("id", t("umf.sqlserver.catalog.field")),
        ("version", t("1.0.0")),
        ("nativeVersion", t(NATIVE_VERSION)),
        ("subset", t(SUBSET)),
    ]);
    let mut result = obj(vec![
        ("operation", t("classify-sqlserver-field")),
        ("version", t("1.0.0")),
        ("status", t("classified")),
        ("source", copy_json(&source, ctx)?),
        ("request", copy_json(&request, ctx)?),
        ("binding", binding),
        (
            "mapping",
            obj(vec![
                ("origin", t("classified")),
                ("kind", t("field")),
                ("idealPath", Value::String(ideal.clone())),
                ("nativePath", copy_json(get(field, "path").unwrap(), ctx)?),
                (
                    "nativeFragment",
                    copy_json(get(field, "nativeColumn").unwrap(), ctx)?,
                ),
                ("basis", t("checked-catalog-column-membership")),
                ("outcome", t("exact")),
            ]),
        ),
        ("residuals", Value::Array(vec![])),
        ("diagnostics", Value::Array(vec![])),
    ]);
    let mut reason = None;
    if let Some(author) = get(&request, "author") {
        match crate::core_kind::verify_core_kind_declaration(
            author, &source, engine, registry, caps, ctx,
        ) {
            Ok(v) => {
                let ident = get(&v, "identity").unwrap_or(&Value::Null);
                let prov = get(&v, "provenance").unwrap_or(&Value::Null);
                if text(ident, "module") != Some(&u("sqlserver.columns"))
                    || text(ident, "element") != Some(element_id)
                    || text(prov, "kind") != Some(&u("field"))
                {
                    reason = Some("Author receipt does not assert this Field role".to_owned());
                }
            }
            Err(e) if e.is_control_failure() || e.code == "LIMIT" => return Err(e),
            Err(e) => reason = Some(format!("Author provenance is invalid or stale: {}", e.code)),
        }
    } else if get(element, "kind").is_some() {
        reason=Some("Existing kind requires verified author provenance; native-only observation cannot replace it".to_owned());
    }
    if let Some(reason) = reason {
        set(&mut result, "status", t("blocked"))?;
        if let Some(mapping) = get_mut(&mut result, "mapping") {
            set(mapping, "outcome", t("unknown"))?;
        }
        let value = get(element, "kind")
            .map(|v| copy_json(v, ctx))
            .transpose()?
            .unwrap_or(Value::Null);
        set(
            &mut result,
            "residuals",
            Value::Array(vec![obj(vec![
                ("path", Value::String(ideal.clone())),
                ("value", value),
                ("reason", t(&reason)),
                ("recovery", t(RECOVERY)),
            ])]),
        )?;
        set(
            &mut result,
            "diagnostics",
            Value::Array(vec![obj(vec![
                ("code", t("SQLSERVER_FIELD_CONFLICT")),
                ("path", Value::String(ideal)),
                ("message", t(&reason)),
                ("severity", t("error")),
            ])]),
        )?;
    } else {
        let mut target = copy_json(&source, ctx)?;
        let selected = get_mut(&mut target, "modules")
            .and_then(|v| {
                if let Value::Array(a) = v {
                    a.get_mut(mi)
                } else {
                    None
                }
            })
            .and_then(|m| get_mut(m, "elements"))
            .and_then(|v| {
                if let Value::Array(a) = v {
                    a.get_mut(ei)
                } else {
                    None
                }
            })
            .ok_or_else(|| {
                err(
                    "SQLSERVER_FIELD_TARGET",
                    "/modules",
                    "Selected column disappeared",
                )
            })?;
        set(selected, "kind", t("field"))?;
        set(&mut result, "target", target)?;
    }
    validate(&result, &rt.result, ctx, "SQLSERVER_FIELD_RESULT")?;
    Ok(result)
}

pub fn verify(
    receipt: &Value,
    current: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(engine, ctx)?;
    validate(receipt, &rt.result, ctx, "SQLSERVER_FIELD_RECEIPT")?;
    if text(receipt, "status") != Some(&u("classified")) {
        return Err(err(
            "SQLSERVER_FIELD_RECEIPT",
            "/status",
            "Expected complete classified receipt",
        ));
    }
    let expected = classify(
        get(receipt, "source")
            .ok_or_else(|| err("SQLSERVER_FIELD_RECEIPT", "/source", "Source required"))?,
        get(receipt, "request")
            .ok_or_else(|| err("SQLSERVER_FIELD_RECEIPT", "/request", "Request required"))?,
        engine,
        registry,
        caps,
        ctx,
    )?;
    if !equal(receipt, &expected, ctx)? {
        return Err(err(
            "SQLSERVER_FIELD_RECEIPT",
            "",
            "Classification disagrees with native source",
        ));
    }
    let target = get(receipt, "target")
        .ok_or_else(|| err("SQLSERVER_FIELD_RECEIPT", "/target", "Target required"))?;
    if !equal(current, target, ctx)? {
        return Err(err(
            "SQLSERVER_FIELD_STALE",
            "",
            "Current model changed; recompute classification",
        ));
    }
    copy_json(receipt, ctx)
}
pub fn recover(
    receipt: &Value,
    current: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    let checked = verify(receipt, current, engine, registry, caps, ctx)?;
    text(
        get(&checked, "request")
            .ok_or_else(|| err("SQLSERVER_FIELD_RECEIPT", "/request", "Request required"))?,
        "nativeSource",
    )
    .cloned()
    .ok_or_else(|| {
        err(
            "SQLSERVER_FIELD_RECEIPT",
            "/request/nativeSource",
            "Native source required",
        )
    })
}
const RECORD_SCHEMA: &str =
    include_str!("../../../spec/core/sqlserver-record-classification.schema.json");
const RECORD_RECOVERY: &str =
    "Source and native fragments retained; resolve conflict then recompute whole record classification";

fn record_runtime(engine: &Engine, ctx: &mut Context<'_>) -> Result<Arc<Runtime>, EngineError> {
    let mut resources = engine.schema_resources_with_context(ctx)?;
    resources.entries.push((
        u("urn:umf:core:kind-operation:6.0.0"),
        read_json(KIND_SCHEMA, ctx)?,
    ));
    let schema = read_json(RECORD_SCHEMA, ctx)?;
    let result = CompiledSchema::compile(&schema, &resources, ctx)?;
    let request = CompiledSchema::compile(
        get(
            get(&schema, "properties").unwrap_or(&Value::Null),
            "request",
        )
        .ok_or_else(|| err("SCHEMA", "", "record request schema missing"))?,
        &resources,
        ctx,
    )?;
    Ok(Arc::new(Runtime { result, request }))
}

pub fn classify_record(
    input: &Value,
    request_in: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = record_runtime(engine, ctx)?;
    validate(request_in, &rt.request, ctx, "SQLSERVER_RECORD_REQUEST")?;
    let source = copy_json(input, ctx)?;
    let request = copy_json(request_in, ctx)?;
    let valid = engine.validate_document(&source, registry, caps, ctx)?;
    if !valid.valid || text(&source, "umf") != Some(&u("0.10.0")) {
        return Err(err(
            "SQLSERVER_RECORD_VERSION",
            "",
            "Valid current 0.10.0 envelope required",
        ));
    }
    let archive = sqlserver::export_document(&source, ctx)?;
    let native_source = text(&request, "nativeSource").ok_or_else(|| {
        err(
            "SQLSERVER_RECORD_REQUEST",
            "/nativeSource",
            "Native source required",
        )
    })?;
    let native_catalog = sqlserver::SqlServerCatalog::import(native_source, ctx)?;
    if native_catalog.export(ctx)? != archive {
        return Err(err(
            "SQLSERVER_RECORD_ARCHIVE",
            "/nativeSource",
            "Native archive differs from captured tree",
        ));
    }
    let payload = get(
        get(&source, "extensions").ok_or_else(|| {
            err(
                "SQLSERVER_RECORD_CAPTURE",
                "/extensions",
                "Extensions required",
            )
        })?,
        "umf.sqlserver",
    )
    .ok_or_else(|| {
        err(
            "SQLSERVER_RECORD_CAPTURE",
            "/extensions/umf.sqlserver",
            "SQL Server capture required",
        )
    })?;
    let root = get(payload, "root").ok_or_else(|| {
        err(
            "SQLSERVER_RECORD_CAPTURE",
            "/extensions/umf.sqlserver/root",
            "Native capture root required",
        )
    })?;
    let root_members = get(root, "members").ok_or_else(|| {
        err(
            "SQLSERVER_RECORD_TABLES",
            "/tables",
            "Captured object members required",
        )
    })?;
    let server_version = get(root_members, "serverVersion").and_then(tagged_node_text);
    if server_version != Some(&u(NATIVE_VERSION)) {
        return Err(err(
            "SQLSERVER_RECORD_SERVER",
            "/serverVersion",
            "This binding requires SQL Server 16.0.4295.3",
        ));
    }
    let relation = get(&request, "relation").ok_or_else(|| {
        err(
            "SQLSERVER_RECORD_REQUEST",
            "/relation",
            "Qualified relation is required",
        )
    })?;
    let relation_schema = text(relation, "schema").ok_or_else(|| {
        err(
            "SQLSERVER_RECORD_REQUEST",
            "/relation/schema",
            "Schema required",
        )
    })?;
    let relation_name = text(relation, "name").ok_or_else(|| {
        err(
            "SQLSERVER_RECORD_REQUEST",
            "/relation/name",
            "Name required",
        )
    })?;
    let tables = get(root_members, "tables")
        .and_then(|v| array(v, "items"))
        .ok_or_else(|| {
            err(
                "SQLSERVER_RECORD_TABLES",
                "/tables",
                "Missing captured table observations",
            )
        })?;
    let matches = tables
        .iter()
        .enumerate()
        .filter(|(_, table)| {
            let Some(members) = get(table, "members") else {
                return false;
            };
            get(members, "schema").and_then(tagged_node_text) == Some(relation_schema)
                && get(members, "name").and_then(tagged_node_text) == Some(relation_name)
        })
        .collect::<Vec<_>>();
    if matches.len() != 1 {
        return Err(err(
            "SQLSERVER_RECORD_IDENTITY",
            "/relation",
            "Qualified relation is missing or ambiguous",
        ));
    }
    let (table_index, native_table) = matches[0];
    let native_path = u(&format!("/tables/{table_index}"));
    let module = text(&request, "recordModule").ok_or_else(|| {
        err(
            "SQLSERVER_RECORD_REQUEST",
            "/recordModule",
            "Module id required",
        )
    })?;
    let record_id = text(&request, "recordId").ok_or_else(|| {
        err(
            "SQLSERVER_RECORD_REQUEST",
            "/recordId",
            "Record id required",
        )
    })?;
    let modules = array(&source, "modules").ok_or_else(|| {
        err(
            "SQLSERVER_RECORD_METADATA",
            "/modules",
            "Modules are required",
        )
    })?;
    let mut result = obj(vec![
        ("operation", t("classify-sqlserver-record")),
        ("version", t("1.0.0")),
        ("status", t("classified")),
        ("source", copy_json(&source, ctx)?),
        ("request", copy_json(&request, ctx)?),
        (
            "binding",
            obj(vec![
                ("id", t("umf.sqlserver.catalog.record")),
                ("version", t("1.0.0")),
                ("nativeVersion", t(NATIVE_VERSION)),
                (
                    "subset",
                    t("Captured table member roles only; permission-limited observations, no native identity/constraint equivalence"),
                ),
            ]),
        ),
        ("mappings", Value::Array(vec![])),
        ("residuals", Value::Array(vec![])),
        ("diagnostics", Value::Array(vec![])),
    ]);
    let mut mappings = Vec::new();
    let mut residuals = Vec::new();
    let mut diagnostics = Vec::new();
    let mut blocked = false;
    let mut add_block = |code: &str,
                         path: &Utf16,
                         value: &Value,
                         reason: &str,
                         ctx: &mut Context<'_>|
     -> Result<(), EngineError> {
        blocked = true;
        residuals.push(obj(vec![
            ("path", Value::String(path.clone())),
            ("value", copy_json(value, ctx)?),
            ("reason", t(reason)),
            ("recovery", t(RECORD_RECOVERY)),
        ]));
        diagnostics.push(obj(vec![
            ("code", t(code)),
            ("path", Value::String(path.clone())),
            ("message", t(reason)),
            ("severity", t("error")),
        ]));
        Ok(())
    };
    let module_id_exists = modules.iter().any(|m| text(m, "id") == Some(module));
    if module_id_exists {
        add_block(
            "RECORD_IDENTITY_COLLISION",
            &u("/modules"),
            &Value::String(module.clone()),
            "Requested record module already exists; no merge is implied",
            ctx,
        )?;
    }
    let metadata = sqlserver::column_metadata_value(&native_catalog, ctx)?;
    let rows = match &metadata {
        Value::Array(values) => values,
        _ => {
            return Err(err(
                "SQLSERVER_RECORD_METADATA",
                "",
                "Column metadata array required",
            ))
        }
    };
    let schema_columns = rows
        .iter()
        .filter(|row| {
            let table = get(row, "table").unwrap_or(&Value::Null);
            text(table, "schema") == Some(relation_schema)
                && text(table, "name") == Some(relation_name)
        })
        .collect::<Vec<_>>();
    let module_index = modules
        .iter()
        .position(|m| text(m, "id") == Some(&u("sqlserver.columns")))
        .ok_or_else(|| {
            err(
                "SQLSERVER_RECORD_METADATA",
                "/modules",
                "Derived column module is required",
            )
        })?;
    let mut seen_names = BTreeSet::new();
    let mut previous_position = 0u64;
    let mut author_by_id = Vec::<(Utf16, &Value)>::new();
    if let Some(Value::Array(authors)) = get(&request, "authors") {
        for author in authors {
            match crate::core_kind::verify_core_kind_declaration(
                author, &source, engine, registry, caps, ctx,
            ) {
                Ok(verified) => {
                    let identity = get(&verified, "identity").unwrap_or(&Value::Null);
                    let author_module = text(identity, "module");
                    let author_id = text(identity, "element");
                    let related = author_module == Some(&u("sqlserver.columns"))
                        && author_id.is_some_and(|id| {
                            schema_columns.iter().any(|r| {
                                text(get(r, "element").unwrap_or(&Value::Null), "id") == Some(id)
                            })
                        });
                    if !related
                        || author_id
                            .is_some_and(|id| author_by_id.iter().any(|(known, _)| known == id))
                    {
                        let author_path = text(
                            get(&verified, "provenance").unwrap_or(&Value::Null),
                            "idealPath",
                        )
                        .cloned()
                        .unwrap_or_else(|| u("/modules"));
                        add_block(
                            "AUTHOR_IDENTITY",
                            &author_path,
                            author,
                            "Duplicate or unrelated member author receipt",
                            ctx,
                        )?;
                    } else if let Some(id) = author_id {
                        author_by_id.push((id.clone(), author));
                    }
                }
                Err(e) if e.is_control_failure() || e.code == "LIMIT" => return Err(e),
                Err(e) => {
                    let path = text(
                        get(author, "provenance").unwrap_or(&Value::Null),
                        "idealPath",
                    )
                    .cloned()
                    .unwrap_or_else(|| u("/modules"));
                    let reason = format!("Author receipt differs from source: {}", e.code);
                    add_block("STALE_AUTHOR", &path, author, &reason, ctx)?;
                }
            }
        }
    }
    let mut referenced_fields = Vec::new();
    for row in schema_columns {
        let element = get(row, "element").unwrap_or(&Value::Null);
        let id = text(element, "id")
            .ok_or_else(|| err("SQLSERVER_RECORD_METADATA", "", "Column element id missing"))?;
        let native_column = get(row, "nativeColumn").unwrap_or(&Value::Null);
        let name = text(element, "name").cloned().unwrap_or_default();
        let position = get(
            get(native_column, "members").unwrap_or(&Value::Null),
            "column_id",
        )
        .and_then(tagged_node_number);
        if name.is_empty() || !seen_names.insert(name.clone()) {
            add_block(
                "SQLSERVER_MEMBER_IDENTITY",
                text(row, "path").unwrap_or(&u("")),
                native_column,
                "Captured table member names must be nonempty and unique",
                ctx,
            )?;
        }
        if let Some(position) = position.filter(|p| *p > previous_position) {
            previous_position = position;
        } else {
            add_block(
                "SQLSERVER_MEMBER_ORDER",
                text(row, "path").unwrap_or(&u("")),
                native_column,
                "Captured column positions must be positive and strictly increasing",
                ctx,
            )?;
        }
        let author = author_by_id
            .iter()
            .find(|(author_id, _)| author_id == id)
            .map(|(_, a)| *a);
        let field_request = obj(vec![
            (
                "column",
                Value::String(copy_text(
                    text(row, "path").ok_or_else(|| {
                        err("SQLSERVER_RECORD_METADATA", "", "Column path missing")
                    })?,
                    ctx,
                )?),
            ),
            (
                "nativeSource",
                Value::String(copy_text(native_source, ctx)?),
            ),
            (
                "mode",
                Value::String(copy_text(
                    text(&request, "mode")
                        .ok_or_else(|| err("SQLSERVER_RECORD_REQUEST", "/mode", "Mode required"))?,
                    ctx,
                )?),
            ),
        ]);
        let mut field_request = field_request;
        if let Some(author) = author {
            set(&mut field_request, "author", copy_json(author, ctx)?)?;
        }
        let classified = classify(&source, &field_request, engine, registry, caps, ctx)?;
        if let Some(mapping) = get(&classified, "mapping") {
            mappings.push(copy_json(mapping, ctx)?);
        }
        if let Some(Value::Array(items)) = get(&classified, "residuals") {
            for item in items {
                let path = text(item, "path").cloned().unwrap_or_else(|| u(""));
                let value = get(item, "value").unwrap_or(&Value::Null);
                let reason = text(item, "reason")
                    .and_then(|reason| reason.to_utf8().ok())
                    .unwrap_or_else(|| {
                        "Field meaning conflicts with captured table membership".to_owned()
                    });
                add_block("FIELD_KIND_CONFLICT", &path, value, &reason, ctx)?;
            }
        }
        referenced_fields.push((u("sqlserver.columns"), id.clone()));
    }
    let ideal_path = u(&format!("/modules/{}/elements/0", modules.len()));
    let record_mapping = obj(vec![
        ("origin", t("classified")),
        ("kind", t("record")),
        (
            "idealPath",
            Value::String(append_text(&ideal_path, "/kind", ctx)?),
        ),
        ("nativePath", Value::String(native_path.clone())),
        ("nativeFragment", copy_json(native_table, ctx)?),
        ("basis", t("checked-catalog-table-members")),
        ("outcome", t(if blocked { "unknown" } else { "exact" })),
    ]);
    mappings.push(record_mapping);
    set(
        &mut result,
        "status",
        t(if blocked { "blocked" } else { "classified" }),
    )?;
    set(&mut result, "mappings", Value::Array(mappings))?;
    set(&mut result, "residuals", Value::Array(residuals))?;
    set(&mut result, "diagnostics", Value::Array(diagnostics))?;
    if !blocked {
        let mut target = copy_json(&source, ctx)?;
        let target_modules = get_mut(&mut target, "modules")
            .and_then(|v| {
                if let Value::Array(a) = v {
                    Some(a)
                } else {
                    None
                }
            })
            .ok_or_else(|| {
                err(
                    "SQLSERVER_RECORD_TARGET",
                    "/modules",
                    "Target modules missing",
                )
            })?;
        let target_fields = get_mut(&mut target_modules[module_index], "elements")
            .and_then(|v| {
                if let Value::Array(a) = v {
                    Some(a)
                } else {
                    None
                }
            })
            .ok_or_else(|| {
                err(
                    "SQLSERVER_RECORD_TARGET",
                    "/elements",
                    "Target fields missing",
                )
            })?;
        for field in target_fields.iter_mut() {
            if referenced_fields
                .iter()
                .any(|(_, id)| text(field, "id") == Some(id))
            {
                set(field, "kind", t("field"))?;
            }
        }
        let references = referenced_fields
            .into_iter()
            .map(|(module, element)| {
                obj(vec![
                    ("role", t("member")),
                    ("module", Value::String(module)),
                    ("element", Value::String(element)),
                ])
            })
            .collect();
        target_modules.push(obj(vec![
            ("id", Value::String(module.clone())),
            ("namespace", Value::String(relation_schema.clone())),
            (
                "elements",
                Value::Array(vec![obj(vec![
                    ("id", Value::String(record_id.clone())),
                    ("name", Value::String(relation_name.clone())),
                    ("kind", t("record")),
                    ("extensions", obj(vec![])),
                    ("references", Value::Array(references)),
                ])]),
            ),
        ]));
        let validation = engine.validate_document(&target, registry, caps, ctx)?;
        if !validation.valid {
            return Err(err(
                "SQLSERVER_RECORD_TARGET",
                "",
                "Native record target violates current core constraints",
            ));
        }
        set(&mut result, "target", target)?;
    }
    validate(&result, &rt.result, ctx, "SQLSERVER_RECORD_RESULT")?;
    Ok(result)
}

pub fn verify_record(
    receipt: &Value,
    current: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = record_runtime(engine, ctx)?;
    validate(receipt, &rt.result, ctx, "SQLSERVER_RECORD_RECEIPT")?;
    if text(receipt, "status") != Some(&u("classified")) {
        return Err(err(
            "SQLSERVER_RECORD_RECEIPT",
            "/status",
            "Expected complete classification receipt",
        ));
    }
    let expected = classify_record(
        get(receipt, "source")
            .ok_or_else(|| err("SQLSERVER_RECORD_RECEIPT", "/source", "Source required"))?,
        get(receipt, "request")
            .ok_or_else(|| err("SQLSERVER_RECORD_RECEIPT", "/request", "Request required"))?,
        engine,
        registry,
        caps,
        ctx,
    )?;
    if !equal(receipt, &expected, ctx)? {
        return Err(err(
            "SQLSERVER_RECORD_RECEIPT",
            "",
            "Classification differs from recomputation",
        ));
    }
    let target = get(receipt, "target")
        .ok_or_else(|| err("SQLSERVER_RECORD_RECEIPT", "/target", "Target required"))?;
    if !equal(current, target, ctx)? {
        return Err(err("SQLSERVER_RECORD_STALE", "", "Current model changed"));
    }
    copy_json(receipt, ctx)
}

pub fn recover_record(
    receipt: &Value,
    current: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    let checked = verify_record(receipt, current, engine, registry, caps, ctx)?;
    text(
        get(&checked, "request")
            .ok_or_else(|| err("SQLSERVER_RECORD_RECEIPT", "/request", "Request required"))?,
        "nativeSource",
    )
    .cloned()
    .ok_or_else(|| {
        err(
            "SQLSERVER_RECORD_RECEIPT",
            "/request/nativeSource",
            "Native source required",
        )
    })
}

const CARDINALITY_SCHEMA: &str =
    include_str!("../../../spec/core/sqlserver-cardinality-classification.schema.json");
const NATIVE_JSON_SCHEMA: &str = include_str!("../../../spec/core/native-json.schema.json");
const CARDINALITY_EXTENSION: &str = "umf.sqlserver.cardinality";
const CARDINALITY_BASIS: &str = "Explicit representation selection and pinned catalog constraint profile; physical column and logical Field remain distinct";
const CARDINALITY_RECOVERY: &str = "Retain original native archive and author assertions; classification does not replace native meaning";
struct CardinalityRuntime {
    result: CompiledSchema,
    request: CompiledSchema,
}
fn cardinality_runtime(
    engine: &Engine,
    ctx: &mut Context<'_>,
) -> Result<Arc<CardinalityRuntime>, EngineError> {
    static CACHE: OnceLock<Arc<CardinalityRuntime>> = OnceLock::new();
    if ctx.profile() == crate::context::ResourceProfile::Cooperative
        && ctx.limits() == crate::context::Limits::ordinary()
    {
        if let Some(runtime) = CACHE.get() {
            return Ok(Arc::clone(runtime));
        }
    }
    ctx.charge_work(1, u(""))?;
    let mut resources = engine.schema_resources_with_context(ctx)?;
    resources.entries.push((
        u("urn:umf:native-json:0.1.0"),
        read_json(NATIVE_JSON_SCHEMA, ctx)?,
    ));
    let schema = read_json(CARDINALITY_SCHEMA, ctx)?;
    let result = CompiledSchema::compile(&schema, &resources, ctx)?;
    let request = CompiledSchema::compile(
        get(
            get(&schema, "properties").unwrap_or(&Value::Null),
            "request",
        )
        .ok_or_else(|| {
            err(
                "SCHEMA",
                "",
                "SQL Server Cardinality request schema missing",
            )
        })?,
        &resources,
        ctx,
    )?;
    let ready = Arc::new(CardinalityRuntime { result, request });
    if ctx.profile() == crate::context::ResourceProfile::Cooperative
        && ctx.limits() == crate::context::Limits::ordinary()
    {
        let _ = CACHE.set(Arc::clone(&ready));
    }
    Ok(ready)
}
fn tagged_bool(v: &Value) -> Option<bool> {
    if text(v, "kind") == Some(&u("boolean")) {
        match get(v, "value") {
            Some(Value::Bool(value)) => Some(*value),
            _ => None,
        }
    } else {
        None
    }
}
fn cardinality_loss(
    residuals: &mut Vec<Value>,
    diagnostics: &mut Vec<Value>,
    path: &Utf16,
    value: &Value,
    reason: &str,
    blocked: bool,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    residuals.push(obj(vec![
        ("path", Value::String(path.clone())),
        ("value", copy_json(value, ctx)?),
        ("reason", t(reason)),
        ("recovery", t(CARDINALITY_RECOVERY)),
    ]));
    diagnostics.push(obj(vec![
        ("code", t("SQLSERVER_CARDINALITY_RESIDUAL")),
        ("path", Value::String(path.clone())),
        ("message", t(reason)),
        ("severity", t(if blocked { "error" } else { "warning" })),
    ]));
    Ok(())
}
fn find_constraint<'a>(
    tables: &'a [Value],
    schema: &Utf16,
    table: &Utf16,
    name: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Option<&'a Value>, EngineError> {
    let mut found = None;
    for entry in tables {
        ctx.charge_work(1, u("/tables"))?;
        let table_info = get(entry, "table").unwrap_or(&Value::Null);
        if text(table_info, "schema") != Some(schema) || text(table_info, "name") != Some(table) {
            continue;
        }
        for check in array(entry, "checks").unwrap_or(&[]) {
            ctx.charge_work(1, u("/checks"))?;
            let members = get(check, "members").unwrap_or(&Value::Null);
            if tagged_node_text(get(members, "name").unwrap_or(&Value::Null)) == Some(name) {
                if found.is_some() {
                    return Ok(None);
                }
                found = Some(check);
            }
        }
    }
    Ok(found)
}
fn check_matches_json_profile(
    column: &Value,
    constraint: &Value,
    profile: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    let native = get(column, "nativeColumn").unwrap_or(&Value::Null);
    let native_members = get(native, "members").unwrap_or(&Value::Null);
    let members = get(constraint, "members").unwrap_or(&Value::Null);
    let column_name = text(get(column, "element").unwrap_or(&Value::Null), "name")
        .and_then(|value| value.to_utf8().ok())
        .ok_or_else(|| {
            err(
                "SQLSERVER_CARDINALITY_COLUMN",
                "",
                "Column name is not a scalar string",
            )
        })?;
    let escaped = column_name.replace(']', "]]");
    let shape = if profile == &u("json-array") {
        "ARRAY"
    } else {
        "OBJECT"
    };
    let expected = u(&format!("(isjson([{escaped}],{shape})=(1))"));
    let parent = get(members, "parent_column_id").and_then(tagged_node_number);
    let column_id = get(native_members, "column_id").and_then(tagged_node_number);
    let parent_matches = parent == Some(0) || parent.is_some() && parent == column_id;
    let required_false = ["is_computed", "is_assembly_type", "is_user_defined"]
        .iter()
        .all(|key| get(native_members, key).and_then(tagged_bool) == Some(false))
        && ["is_disabled", "is_not_trusted", "is_not_for_replication"]
            .iter()
            .all(|key| get(members, key).and_then(tagged_bool) == Some(false));
    ctx.charge_work(
        expected.len().saturating_add(column_name.len()),
        u("/checks"),
    )?;
    Ok(
        tagged_node_text(get(native_members, "type_schema").unwrap_or(&Value::Null))
            == Some(&u("sys"))
            && tagged_node_text(get(native_members, "type_name").unwrap_or(&Value::Null))
                == Some(&u("nvarchar"))
            && tagged_node_text(get(native_members, "base_type_name").unwrap_or(&Value::Null))
                == Some(&u("nvarchar"))
            && parent_matches
            && required_false
            && tagged_node_text(get(members, "definition").unwrap_or(&Value::Null))
                == Some(&expected),
    )
}
pub fn classify_cardinality(
    input: &Value,
    request_in: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = cardinality_runtime(engine, ctx)?;
    validate(
        request_in,
        &rt.request,
        ctx,
        "SQLSERVER_CARDINALITY_REQUEST",
    )?;
    let source = copy_json(input, ctx)?;
    let request = copy_json(request_in, ctx)?;
    let valid = engine.validate_document(&source, registry, caps, ctx)?;
    if !valid.valid || text(&source, "umf") != Some(&u("0.10.0")) {
        return Err(err(
            "SQLSERVER_CARDINALITY_SOURCE",
            "",
            "Valid core 0.10.0 document required",
        ));
    }
    let native_source = text(&request, "nativeSource").ok_or_else(|| {
        err(
            "SQLSERVER_CARDINALITY_REQUEST",
            "/nativeSource",
            "Native source required",
        )
    })?;
    let catalog = sqlserver::SqlServerCatalog::import(native_source, ctx)?;
    if catalog.export(ctx)? != sqlserver::export_document(&source, ctx)? {
        return Err(err(
            "SQLSERVER_CARDINALITY_ARCHIVE",
            "/nativeSource",
            "Native text differs from retained capture",
        ));
    }
    let root = get(
        get(&source, "extensions").unwrap_or(&Value::Null),
        "umf.sqlserver",
    )
    .and_then(|payload| get(payload, "root"))
    .ok_or_else(|| {
        err(
            "SQLSERVER_CARDINALITY_CAPTURE",
            "/extensions/umf.sqlserver/root",
            "Native capture root required",
        )
    })?;
    let root_members = get(root, "members").unwrap_or(&Value::Null);
    if tagged_node_text(get(root_members, "serverVersion").unwrap_or(&Value::Null))
        != Some(&u(NATIVE_VERSION))
        || tagged_node_text(get(root_members, "profile").unwrap_or(&Value::Null))
            != Some(&u("sqlserver-catalog-v3"))
        || tagged_node_text(get(root_members, "state").unwrap_or(&Value::Null))
            != Some(&u("captured"))
    {
        return Err(err(
            "SQLSERVER_CARDINALITY_PROFILE",
            "",
            "Pinned captured catalog-v3 required",
        ));
    }
    let requested_path = text(&request, "column").ok_or_else(|| {
        err(
            "SQLSERVER_CARDINALITY_REQUEST",
            "/column",
            "Column path required",
        )
    })?;
    let columns = sqlserver::column_metadata_value(&catalog, ctx)?;
    let column_rows = match &columns {
        Value::Array(rows) => rows.as_slice(),
        _ => &[],
    };
    let column = column_rows
        .iter()
        .find(|row| text(row, "path") == Some(requested_path))
        .ok_or_else(|| {
            err(
                "SQLSERVER_CARDINALITY_COLUMN",
                "/column",
                "Native column not found",
            )
        })?;
    let element = get(column, "element").unwrap_or(&Value::Null);
    let column_native = get(column, "nativeColumn").unwrap_or(&Value::Null);
    let identity = get(&request, "identity").unwrap_or(&Value::Null);
    let module_id = text(identity, "module").ok_or_else(|| {
        err(
            "SQLSERVER_CARDINALITY_REQUEST",
            "/identity/module",
            "Identity module required",
        )
    })?;
    let element_id = text(identity, "element").ok_or_else(|| {
        err(
            "SQLSERVER_CARDINALITY_REQUEST",
            "/identity/element",
            "Identity element required",
        )
    })?;
    let modules = array(&source, "modules").ok_or_else(|| {
        err(
            "SQLSERVER_CARDINALITY_SOURCE",
            "/modules",
            "Modules required",
        )
    })?;
    let existing_module = modules
        .iter()
        .position(|module| text(module, "id") == Some(module_id));
    let module_index = existing_module.unwrap_or(modules.len());
    let existing_elements = existing_module.and_then(|mi| array(&modules[mi], "elements"));
    let element_index = existing_elements.map_or(0, |items| items.len());
    let ideal_path = u(&format!(
        "/modules/{module_index}/elements/{element_index}/cardinality"
    ));
    let native_path = text(column, "path")
        .cloned()
        .unwrap_or_else(|| requested_path.clone());
    let profile = text(&request, "profile").ok_or_else(|| {
        err(
            "SQLSERVER_CARDINALITY_REQUEST",
            "/profile",
            "Representation profile required",
        )
    })?;
    let constraint_name = match get(&request, "constraint") {
        Some(Value::Null) => None,
        Some(Value::String(value)) => Some(value),
        _ => {
            return Err(err(
                "SQLSERVER_CARDINALITY_REQUEST",
                "/constraint",
                "Constraint name or null required",
            ))
        }
    };
    let mode = text(&request, "mode")
        .ok_or_else(|| err("SQLSERVER_CARDINALITY_REQUEST", "/mode", "Mode required"))?;
    let binding = obj(vec![
        ("id", t("umf.sqlserver.cardinality")),
        ("version", t("1.0.0")),
        ("nativeVersion", t(NATIVE_VERSION)),
        ("subset", t("Declared column shape under selected metadata profile; not whole-model validation, item typing or execution equivalence")),
    ]);
    let mut cardinality = "unspecified";
    let mut interpretation = "unknown";
    let mut outcome = "unknown";
    let mut residuals = Vec::new();
    let mut diagnostics = Vec::new();
    let mut reason: Option<String> = None;
    let mut residual_value: Option<Value> = None;
    if profile == &u("native-scalar")
        && constraint_name.is_none()
        && get(element, "scalarType").is_some()
    {
        cardinality = "one";
        interpretation = "declared";
        outcome = "exact";
    } else if profile == &u("json-array") || profile == &u("json-object") {
        let constraints = sqlserver::constraint_metadata_value(&catalog, ctx)?;
        let tables = array(&constraints, "tables").unwrap_or(&[]);
        let table = get(column, "table").unwrap_or(&Value::Null);
        let matched = if let Some(name) = constraint_name {
            if let (Some(schema), Some(table_name)) = (text(table, "schema"), text(table, "name")) {
                find_constraint(tables, schema, table_name, name, ctx)?
            } else {
                None
            }
        } else {
            None
        };
        let recognized = if let Some(check) = matched {
            check_matches_json_profile(column, check, profile, ctx)?
        } else {
            false
        };
        if recognized {
            cardinality = if profile == &u("json-array") {
                "array"
            } else {
                "map"
            };
            interpretation = "declared";
            outcome = if profile == &u("json-array") {
                "exact"
            } else {
                "approximated"
            };
            if profile == &u("json-object") {
                reason = Some("ISJSON OBJECT permits duplicate keys; the ideal exact-string-key map cannot preserve duplicate members without a residual".into());
                residual_value = matched
                    .and_then(|check| get(check, "members"))
                    .map(|members| copy_json(members, ctx))
                    .transpose()?;
            }
        } else {
            reason = Some("Selected JSON representation requires the exact pinned column/constraint profile with enabled, trusted, non-replication-exempt enforcement; arbitrary expressions and unknown state remain unresolved".into());
        }
    } else {
        reason = Some(
            "Selected representation is unresolved or does not establish a supported native scalar"
                .into(),
        );
    }
    let mut conflict: Option<String> = None;
    if module_id == &u("sqlserver.columns") {
        conflict =
            Some("Logical representation cannot replace or extend the native column module".into());
    }
    if existing_elements.is_some_and(|items| {
        items
            .iter()
            .any(|element| text(element, "id") == Some(element_id))
    }) {
        conflict = Some("Logical Field identity already exists; authored or classified meaning cannot be overwritten".into());
    }
    let vocabularies = get(&source, "vocabularies").unwrap_or(&Value::Null);
    if get(vocabularies, CARDINALITY_EXTENSION)
        .is_some_and(|v| text(v, "version") != Some(&u("1.0.0")))
    {
        conflict = Some("Incompatible binding vocabulary version".into());
    }
    if let Some(reason) = reason.as_deref() {
        cardinality_loss(
            &mut residuals,
            &mut diagnostics,
            &native_path,
            residual_value.as_ref().unwrap_or(column_native),
            reason,
            false,
            ctx,
        )?;
    }
    if let Some(conflict) = conflict.as_deref() {
        cardinality_loss(
            &mut residuals,
            &mut diagnostics,
            &ideal_path,
            &Value::Null,
            conflict,
            false,
            ctx,
        )?;
        outcome = "unknown";
    }
    let blocked = conflict.is_some() || mode == &u("strict") && !residuals.is_empty();
    for diagnostic in &mut diagnostics {
        set(
            diagnostic,
            "severity",
            t(if blocked { "error" } else { "warning" }),
        )?;
    }
    let mapping = obj(vec![
        ("origin", t("classified")),
        ("idealPath", Value::String(ideal_path.clone())),
        ("nativePath", Value::String(native_path.clone())),
        ("nativeFragment", copy_json(column_native, ctx)?),
        ("cardinality", t(cardinality)),
        ("interpretation", t(interpretation)),
        ("outcome", t(outcome)),
        ("basis", t(CARDINALITY_BASIS)),
    ]);
    let mut result = obj(vec![
        ("operation", t("classify-sqlserver-cardinality")),
        ("version", t("1.0.0")),
        ("status", t(if blocked { "blocked" } else { "classified" })),
        ("source", copy_json(&source, ctx)?),
        ("request", copy_json(&request, ctx)?),
        ("binding", binding),
        ("mapping", mapping),
        ("residuals", Value::Array(residuals)),
        ("diagnostics", Value::Array(diagnostics)),
    ]);
    if !blocked {
        let mut target = copy_json(&source, ctx)?;
        if existing_module.is_none() {
            let modules = get_mut(&mut target, "modules")
                .and_then(|v| {
                    if let Value::Array(items) = v {
                        Some(items)
                    } else {
                        None
                    }
                })
                .ok_or_else(|| {
                    err(
                        "SQLSERVER_CARDINALITY_TARGET",
                        "/modules",
                        "Modules required",
                    )
                })?;
            modules.push(obj(vec![
                ("id", Value::String(module_id.clone())),
                ("namespace", t("")),
                ("elements", Value::Array(Vec::new())),
            ]));
        }
        let vocabularies = get_mut(&mut target, "vocabularies").ok_or_else(|| {
            err(
                "SQLSERVER_CARDINALITY_TARGET",
                "/vocabularies",
                "Vocabularies required",
            )
        })?;
        if get(vocabularies, CARDINALITY_EXTENSION).is_none() {
            set(
                vocabularies,
                CARDINALITY_EXTENSION,
                obj(vec![("version", t("1.0.0"))]),
            )?;
        }
        let target_modules = get_mut(&mut target, "modules")
            .and_then(|v| {
                if let Value::Array(items) = v {
                    Some(items)
                } else {
                    None
                }
            })
            .ok_or_else(|| {
                err(
                    "SQLSERVER_CARDINALITY_TARGET",
                    "/modules",
                    "Modules required",
                )
            })?;
        let target_elements = get_mut(&mut target_modules[module_index], "elements")
            .and_then(|v| {
                if let Value::Array(items) = v {
                    Some(items)
                } else {
                    None
                }
            })
            .ok_or_else(|| {
                err(
                    "SQLSERVER_CARDINALITY_TARGET",
                    "/elements",
                    "Elements required",
                )
            })?;
        let name = text(element, "name")
            .cloned()
            .ok_or_else(|| err("SQLSERVER_CARDINALITY_COLUMN", "", "Column name required"))?;
        let mut logical = obj(vec![
            ("id", Value::String(element_id.clone())),
            ("kind", t("field")),
            ("name", Value::String(name)),
            ("cardinality", t(cardinality)),
            (
                "extensions",
                obj(vec![(
                    CARDINALITY_EXTENSION,
                    obj(vec![
                        ("origin", t("classified")),
                        ("physicalColumn", Value::String(requested_path.clone())),
                        (
                            "binding",
                            obj(vec![
                                ("id", t("umf.sqlserver.cardinality")),
                                ("version", t("1.0.0")),
                            ]),
                        ),
                        ("profile", Value::String(profile.clone())),
                        ("interpretation", t(interpretation)),
                        ("nativePath", Value::String(native_path)),
                        ("basis", t(CARDINALITY_BASIS)),
                    ]),
                )]),
            ),
        ]);
        if cardinality == "one" && profile == &u("native-scalar") {
            if let Some(scalar_type) = get(element, "scalarType") {
                set(&mut logical, "scalarType", copy_json(scalar_type, ctx)?)?;
            }
        }
        target_elements.push(logical);
        let valid = engine.validate_document(&target, registry, caps, ctx)?;
        if !valid.valid {
            return Err(err(
                "SQLSERVER_CARDINALITY_TARGET",
                "",
                "Logical Field target violates current core constraints",
            ));
        }
        sqlserver::export_document(&target, ctx)?;
        set(&mut result, "target", target)?;
    }
    validate(&result, &rt.result, ctx, "SQLSERVER_CARDINALITY_RESULT")?;
    Ok(result)
}
pub fn verify_cardinality(
    receipt: &Value,
    current: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = cardinality_runtime(engine, ctx)?;
    validate(receipt, &rt.result, ctx, "SQLSERVER_CARDINALITY_RECEIPT")?;
    if text(receipt, "status") != Some(&u("classified")) {
        return Err(err(
            "SQLSERVER_CARDINALITY_RECEIPT",
            "/status",
            "Complete classified receipt required",
        ));
    }
    let expected = classify_cardinality(
        get(receipt, "source").ok_or_else(|| {
            err(
                "SQLSERVER_CARDINALITY_RECEIPT",
                "/source",
                "Source required",
            )
        })?,
        get(receipt, "request").ok_or_else(|| {
            err(
                "SQLSERVER_CARDINALITY_RECEIPT",
                "/request",
                "Request required",
            )
        })?,
        engine,
        registry,
        caps,
        ctx,
    )?;
    if !equal(receipt, &expected, ctx)? {
        return Err(err(
            "SQLSERVER_CARDINALITY_RECEIPT",
            "",
            "Receipt differs from retained source and request",
        ));
    }
    let target = get(receipt, "target").ok_or_else(|| {
        err(
            "SQLSERVER_CARDINALITY_RECEIPT",
            "/target",
            "Target required",
        )
    })?;
    if !equal(current, target, ctx)? {
        return Err(err("SQLSERVER_CARDINALITY_STALE", "", "Target changed"));
    }
    copy_json(receipt, ctx)
}
pub fn recover_cardinality_source(
    receipt: &Value,
    current: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    let checked = verify_cardinality(receipt, current, engine, registry, caps, ctx)?;
    text(
        get(&checked, "request").unwrap_or(&Value::Null),
        "nativeSource",
    )
    .cloned()
    .ok_or_else(|| {
        err(
            "SQLSERVER_CARDINALITY_RECEIPT",
            "/request/nativeSource",
            "Native source required",
        )
    })
}
