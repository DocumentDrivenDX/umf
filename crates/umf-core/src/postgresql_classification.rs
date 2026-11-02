// SPDX-License-Identifier: MIT OR Apache-2.0
//! Rust-owned PostgreSQL catalog Field and Record classification.
use crate::{
    context::Context,
    core_kind,
    engine::{Capabilities, Engine, ResourceSet, SemanticContext},
    error::{Diagnostic, EngineError},
    postgresql_catalog as pg,
    registry::Registry,
    schema::CompiledSchema,
    serialization::{self, Format},
    value::{copy_json, Utf16, Value},
};

const FIELD_SCHEMA: &str =
    include_str!("../../../spec/core/postgresql-field-classification.schema.json");
const RECORD_SCHEMA: &str =
    include_str!("../../../spec/core/postgresql-record-classification.schema.json");
const CARDINALITY_SCHEMA: &str =
    include_str!("../../../spec/core/postgresql-cardinality-classification.schema.json");
const NULLABILITY_SCHEMA: &str =
    include_str!("../../../spec/core/postgresql-nullability-classification.schema.json");
const NULLABILITY_OPERATION_SCHEMA: &str =
    include_str!("../../../spec/core/nullability-operation-v5.schema.json");
const NULLABILITY_PACKAGE: &str =
    include_str!("../../../spec/extensions/postgresql-nullability/package.json");
const NULLABILITY_RECOVERY: &str = "Retain the complete source and native archive; unknown native meaning is not replaced by the core label";
const NULLABILITY_BASIS: &str = "Captured declarations for stored relation values; not query results, omitted inputs or live enforcement verification";
const KIND_SCHEMA: &str = include_str!("../../../spec/core/kind-operation-v6.schema.json");
const CARDINALITY_OPERATION_SCHEMA: &str =
    include_str!("../../../spec/core/cardinality-operation-v4.schema.json");
const NATIVE_JSON_SCHEMA: &str = include_str!("../../../spec/core/native-json.schema.json");
const PACKAGE: &str = include_str!("../../../spec/extensions/postgresql-catalog/package.json");
const CARDINALITY_PACKAGE: &str =
    include_str!("../../../spec/extensions/postgresql-cardinality/package.json");
const FIELD_RECOVERY: &str = "Original assertion and native fragment retained in source; reclassify with corrected provenance";
const RECORD_RECOVERY: &str = "Source and native fragments retained; resolve conflict then recompute whole record classification";
const CARDINALITY_RECOVERY: &str = "Retain original native archive and author assertions; classification does not replace native meaning";

fn u(s: &str) -> Utf16 {
    Utf16::from(s)
}
fn t(s: &str) -> Value {
    Value::string_utf8(s)
}
fn obj(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(fields.into_iter().map(|(k, v)| (u(k), v)).collect())
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
fn arr<'a>(v: &'a Value, k: &str) -> Option<&'a [Value]> {
    match get(v, k) {
        Some(Value::Array(a)) => Some(a),
        _ => None,
    }
}
fn error(code: &str, path: &str, message: impl Into<Utf16>) -> EngineError {
    EngineError::new(code, u(path), message)
}
fn read_json(source: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    serialization::read_json_value(
        &source.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        ctx,
    )
}
fn set(v: &mut Value, k: &str, value: Value) -> Result<(), EngineError> {
    let Value::Object(m) = v else {
        return Err(error(
            "POSTGRESQL_CLASSIFICATION_TARGET",
            "",
            "Expected an object",
        ));
    };
    if let Some((_, old)) = m.iter_mut().find(|(x, _)| x == &u(k)) {
        *old = value
    } else {
        m.push((u(k), value));
    }
    Ok(())
}
fn copy_text(v: &Utf16, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    ctx.charge_work(v.len(), Utf16::default())?;
    Ok(v.clone())
}
fn append(base: &Utf16, suffix: &str, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    let tail = suffix.encode_utf16().collect::<Vec<_>>();
    ctx.charge_work(base.len().saturating_add(tail.len()), Utf16::default())?;
    let mut out = base.units().to_vec();
    out.extend(tail);
    Ok(Utf16::new(out))
}
fn equal(a: &Value, b: &Value, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    fn canon(v: &Value, c: &mut Context<'_>) -> Result<Value, EngineError> {
        match v {
            Value::Array(a) => {
                let mut out = Vec::with_capacity(a.len());
                for x in a {
                    c.charge_work(1, Utf16::default())?;
                    out.push(canon(x, c)?);
                }
                Ok(Value::Array(out))
            }
            Value::Object(m) => {
                let mut out = Vec::with_capacity(m.len());
                for (k, v) in m {
                    c.charge_work(k.len().saturating_add(1), Utf16::default())?;
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

struct NoCallbacks;
impl Capabilities for NoCallbacks {
    fn validate_extension(
        &mut self,
        _: u64,
        _: &Value,
        _: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        Ok(Vec::new())
    }
}
struct Runtime {
    engine: Engine,
    registry: Registry,
    field: CompiledSchema,
    field_request: CompiledSchema,
    record: CompiledSchema,
    record_request: CompiledSchema,
    cardinality: CompiledSchema,
    cardinality_request: CompiledSchema,
    nullability: CompiledSchema,
    nullability_request: CompiledSchema,
}
fn runtime(ctx: &mut Context<'_>) -> Result<Runtime, EngineError> {
    let core = |source: &str, ctx: &mut Context<'_>| read_json(source, ctx);
    let engine = Engine::new(
        ResourceSet::new(
            core(include_str!("../../../spec/core/schema.json"), ctx)?,
            core(
                include_str!("../../../spec/core/semantic-type-reference.schema.json"),
                ctx,
            )?,
            core(
                include_str!("../../../spec/core/extension-package.schema.json"),
                ctx,
            )?,
            core(
                include_str!("../../../spec/metamodel/generated/core-constraints.json"),
                ctx,
            )?,
            core(
                include_str!("../../../spec/metamodel/generated/domain-policy.json"),
                ctx,
            )?,
        ),
        ctx,
    )?;
    let resources = engine.schema_resources_with_context(ctx)?;
    let package = read_json(PACKAGE, ctx)?;
    let mut registry = Registry::new();
    registry.register(&package, Some(47), engine.package_schema(), &resources, ctx)?;
    let cardinality_package = read_json(CARDINALITY_PACKAGE, ctx)?;
    registry.register(
        &cardinality_package,
        Some(48),
        engine.package_schema(),
        &resources,
        ctx,
    )?;
    let nullability_package = read_json(NULLABILITY_PACKAGE, ctx)?;
    registry.register(
        &nullability_package,
        Some(49),
        engine.package_schema(),
        &resources,
        ctx,
    )?;
    let mut schemas = resources.clone();
    schemas.entries.push((
        u("urn:umf:core:kind-operation:6.0.0"),
        read_json(KIND_SCHEMA, ctx)?,
    ));
    schemas.entries.push((
        u("urn:umf:core:cardinality-operation:4.0.0"),
        read_json(CARDINALITY_OPERATION_SCHEMA, ctx)?,
    ));
    schemas.entries.push((
        u("urn:umf:native-json:0.1.0"),
        read_json(NATIVE_JSON_SCHEMA, ctx)?,
    ));
    schemas.entries.push((u("urn:umf:core:nullability-operation:5.0.0"), read_json(NULLABILITY_OPERATION_SCHEMA, ctx)?));
    let fs = read_json(FIELD_SCHEMA, ctx)?;
    let rs = read_json(RECORD_SCHEMA, ctx)?;
    let field = CompiledSchema::compile(&fs, &schemas, ctx)?;
    let record = CompiledSchema::compile(&rs, &schemas, ctx)?;
    let cs = read_json(CARDINALITY_SCHEMA, ctx)?;
    let cardinality = CompiledSchema::compile(&cs, &schemas, ctx)?;
    let ns = read_json(NULLABILITY_SCHEMA, ctx)?;
    let nullability = CompiledSchema::compile(&ns, &schemas, ctx)?;
    let field_request = CompiledSchema::compile(
        get(get(&fs, "properties").unwrap_or(&Value::Null), "request")
            .ok_or_else(|| error("SCHEMA", "", "Field request schema missing"))?,
        &schemas,
        ctx,
    )?;
    let record_request = CompiledSchema::compile(
        get(get(&rs, "properties").unwrap_or(&Value::Null), "request")
            .ok_or_else(|| error("SCHEMA", "", "Record request schema missing"))?,
        &schemas,
        ctx,
    )?;
    let cardinality_request = CompiledSchema::compile(
        get(get(&cs, "properties").unwrap_or(&Value::Null), "request")
            .ok_or_else(|| error("SCHEMA", "", "Cardinality request schema missing"))?,
        &schemas,
        ctx,
    )?;
    let nullability_request = CompiledSchema::compile(
        get(get(&ns, "properties").unwrap_or(&Value::Null), "request")
            .ok_or_else(|| error("SCHEMA", "", "Nullability request schema missing"))?,
        &schemas,
        ctx,
    )?;
    Ok(Runtime {
        engine,
        registry,
        field,
        field_request,
        record,
        record_request,
        cardinality,
        cardinality_request,
        nullability,
        nullability_request,
    })
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
        Err(error(
            code,
            "",
            "Value does not match the pinned PostgreSQL classification schema",
        ))
    }
}
fn validate_document(
    source: &Value,
    rt: &Runtime,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let mut caps = NoCallbacks;
    let valid = rt
        .engine
        .validate_document(source, &rt.registry, &mut caps, ctx)?;
    if !valid.valid || text(source, "umf") != Some(&u("0.10.0")) {
        return Err(error(
            "POSTGRESQL_FIELD_VERSION",
            "",
            "Valid current 0.10.0 envelope required",
        ));
    }
    Ok(())
}

fn classify_field_inner(
    source: &Value,
    request: &Value,
    rt: &Runtime,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    validate(request, &rt.field_request, ctx, "POSTGRESQL_FIELD_REQUEST")?;
    validate_document(source, rt, ctx)?;
    let exported = pg::export_document(source, ctx)?;
    let native_source = text(request, "nativeSource").ok_or_else(|| {
        error(
            "POSTGRESQL_FIELD_REQUEST",
            "/nativeSource",
            "Native source required",
        )
    })?;
    let captured = pg::PostgresqlCatalogCapture::import(native_source, ctx)?;
    if captured.export(ctx)? != exported {
        return Err(error(
            "POSTGRESQL_FIELD_ARCHIVE",
            "/nativeSource",
            "Native archive differs from captured tree",
        ));
    }
    let version = pg::get_node(source, &u("/serverVersion"), ctx)?;
    if text(&version, "kind") != Some(&u("number")) || text(&version, "value") != Some(&u("170004"))
    {
        return Err(error(
            "POSTGRESQL_FIELD_SERVER",
            "/serverVersion",
            "This binding requires PostgreSQL 17.4",
        ));
    }
    let column = text(request, "column").ok_or_else(|| {
        error(
            "POSTGRESQL_FIELD_REQUEST",
            "/column",
            "Column path required",
        )
    })?;
    let metadata = captured
        .columns(ctx)?
        .into_iter()
        .find(|c| &c.path == column)
        .ok_or_else(|| {
            error(
                "POSTGRESQL_FIELD_COLUMN",
                "/column",
                "Captured column path not found",
            )
        })?;
    let modules = arr(source, "modules")
        .ok_or_else(|| error("POSTGRESQL_FIELD_METADATA", "/modules", "Modules required"))?;
    let mi = modules
        .iter()
        .position(|m| text(m, "id") == Some(&u("postgresql.columns")))
        .ok_or_else(|| {
            error(
                "POSTGRESQL_FIELD_METADATA",
                "/modules",
                "Derived column module is required",
            )
        })?;
    let elems = arr(&modules[mi], "elements").ok_or_else(|| {
        error(
            "POSTGRESQL_FIELD_METADATA",
            "/modules/elements",
            "Elements required",
        )
    })?;
    let ei = elems
        .iter()
        .position(|e| text(e, "id") == text(&metadata.element, "id"))
        .ok_or_else(|| {
            error(
                "POSTGRESQL_FIELD_METADATA",
                "/modules/elements",
                "Derived column is required",
            )
        })?;
    let element = &elems[ei];
    let id = text(element, "id")
        .ok_or_else(|| error("POSTGRESQL_FIELD_METADATA", "/id", "Column id required"))?;
    let ideal = append(
        &append(
            &append(&u("/modules"), &format!("/{mi}/elements/{ei}"), ctx)?,
            "/kind",
            ctx,
        )?,
        "",
        ctx,
    )?;
    let binding=obj(vec![("id",t("umf.postgresql.catalog.field")),("version",t("1.0.0")),("nativeVersion",t("17.4")),("subset",t("Captured catalog column membership; excludes raw DDL and native constraint/value equivalence"))]);
    let mapping = obj(vec![
        ("origin", t("classified")),
        ("kind", t("field")),
        ("idealPath", Value::String(ideal.clone())),
        ("nativePath", Value::String(copy_text(&metadata.path, ctx)?)),
        ("nativeFragment", copy_json(&metadata.native_column, ctx)?),
        ("basis", t("checked-catalog-column-membership")),
        ("outcome", t("exact")),
    ]);
    let mut result = obj(vec![
        ("operation", t("classify-postgresql-field")),
        ("version", t("1.0.0")),
        ("status", t("classified")),
        ("source", copy_json(source, ctx)?),
        ("request", copy_json(request, ctx)?),
        ("binding", binding),
        ("mapping", mapping),
        ("residuals", Value::Array(vec![])),
        ("diagnostics", Value::Array(vec![])),
    ]);
    let mut reason = None;
    if let Some(author) = get(request, "author") {
        let mut caps = NoCallbacks;
        match core_kind::verify_core_kind_declaration(
            author,
            source,
            &rt.engine,
            &rt.registry,
            &mut caps,
            ctx,
        ) {
            Ok(verified) => {
                let identity = get(&verified, "identity").unwrap_or(&Value::Null);
                let provenance = get(&verified, "provenance").unwrap_or(&Value::Null);
                if text(identity, "module") != Some(&u("postgresql.columns"))
                    || text(identity, "element") != Some(id)
                {
                    reason = Some(String::from("Author receipt identifies another column"));
                } else if text(provenance, "kind") != Some(&u("field")) {
                    reason = Some(String::from(
                        "Authored kind conflicts with native catalog column membership",
                    ));
                }
            }
            Err(e) if e.is_control_failure() || e.code == "LIMIT" || e.code == "CAPACITY" => {
                return Err(e)
            }
            Err(e) => reason = Some(format!("Invalid or stale author provenance: {}", e.code)),
        }
    } else if get(element, "kind").is_some() {
        reason = Some(String::from(
            "Existing kind needs verified author provenance; native observation cannot replace it",
        ));
    }
    if let Some(reason) = reason {
        set(&mut result, "status", t("blocked"))?;
        set(
            get_mut(&mut result, "mapping").unwrap(),
            "outcome",
            t("unknown"),
        )?;
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
                ("recovery", t(FIELD_RECOVERY)),
            ])]),
        )?;
        set(
            &mut result,
            "diagnostics",
            Value::Array(vec![obj(vec![
                ("code", t("POSTGRESQL_FIELD_CONFLICT")),
                ("path", Value::String(ideal)),
                ("message", t(&reason)),
                ("severity", t("error")),
            ])]),
        )?;
    } else {
        let mut target = copy_json(source, ctx)?;
        let selected = get_mut(&mut target, "modules")
            .and_then(|x| {
                if let Value::Array(a) = x {
                    a.get_mut(mi)
                } else {
                    None
                }
            })
            .and_then(|m| get_mut(m, "elements"))
            .and_then(|x| {
                if let Value::Array(a) = x {
                    a.get_mut(ei)
                } else {
                    None
                }
            })
            .ok_or_else(|| {
                error(
                    "POSTGRESQL_FIELD_TARGET",
                    "/modules",
                    "Selected column missing",
                )
            })?;
        set(selected, "kind", t("field"))?;
        set(&mut result, "target", target)?;
    }
    validate(&result, &rt.field, ctx, "POSTGRESQL_FIELD_RESULT")?;
    Ok(result)
}

pub fn classify_field(
    source: &Value,
    request: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(ctx)?;
    let source = copy_json(source, ctx)?;
    let request = copy_json(request, ctx)?;
    classify_field_inner(&source, &request, &rt, ctx)
}
pub fn verify_field(
    receipt: &Value,
    current: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(ctx)?;
    validate(receipt, &rt.field, ctx, "POSTGRESQL_FIELD_RECEIPT")?;
    if text(receipt, "status") != Some(&u("classified")) {
        return Err(error(
            "POSTGRESQL_FIELD_RECEIPT",
            "/status",
            "Expected complete classified receipt",
        ));
    }
    let expected = classify_field_inner(
        get(receipt, "source")
            .ok_or_else(|| error("POSTGRESQL_FIELD_RECEIPT", "/source", "Source required"))?,
        get(receipt, "request")
            .ok_or_else(|| error("POSTGRESQL_FIELD_RECEIPT", "/request", "Request required"))?,
        &rt,
        ctx,
    )?;
    if !equal(receipt, &expected, ctx)? {
        return Err(error(
            "POSTGRESQL_FIELD_RECEIPT",
            "",
            "Classification disagrees with checked native source",
        ));
    }
    if !equal(
        current,
        get(receipt, "target")
            .ok_or_else(|| error("POSTGRESQL_FIELD_RECEIPT", "/target", "Target required"))?,
        ctx,
    )? {
        return Err(error(
            "POSTGRESQL_FIELD_STALE",
            "",
            "Target changed; recompute classification from retained native source",
        ));
    }
    copy_json(receipt, ctx)
}
pub fn recover_field(
    receipt: &Value,
    current: &Value,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    let checked = verify_field(receipt, current, ctx)?;
    text(
        get(&checked, "request").unwrap_or(&Value::Null),
        "nativeSource",
    )
    .cloned()
    .ok_or_else(|| {
        error(
            "POSTGRESQL_FIELD_RECEIPT",
            "/request/nativeSource",
            "Retained native source required",
        )
    })
}

fn block_record(
    result: &mut Value,
    code: &str,
    path: &Utf16,
    value: &Value,
    reason: &str,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    set(result, "status", t("blocked"))?;
    let residual = obj(vec![
        ("path", Value::String(copy_text(path, ctx)?)),
        ("value", copy_json(value, ctx)?),
        ("reason", t(reason)),
        ("recovery", t(RECORD_RECOVERY)),
    ]);
    if let Some(Value::Array(items)) = get_mut(result, "residuals") {
        items.push(residual);
    }
    let diagnostic = obj(vec![
        ("code", t(code)),
        ("path", Value::String(copy_text(path, ctx)?)),
        ("message", t(reason)),
        ("severity", t("error")),
    ]);
    if let Some(Value::Array(items)) = get_mut(result, "diagnostics") {
        items.push(diagnostic);
    }
    Ok(())
}
fn tagged_child<'a>(v: &'a Value, k: &str) -> Option<&'a Value> {
    get(get(v, "members")?, k)
}
fn tagged_member_text<'a>(v: &'a Value, k: &str) -> Option<&'a Utf16> {
    let node = tagged_child(v, k)?;
    (text(node, "kind") == Some(&u("string")))
        .then(|| text(node, "value"))
        .flatten()
}
fn tagged_array_items(v: &Value) -> Option<&[Value]> {
    if text(v, "kind") == Some(&u("array")) {
        arr(v, "items")
    } else {
        None
    }
}
fn tagged_number(v: &Value, k: &str) -> Option<u64> {
    let node = tagged_child(v, k)?;
    if text(node, "kind") != Some(&u("number")) {
        return None;
    }
    let Value::String(token) = get(node, "value")? else {
        return None;
    };
    let s = token.to_utf8().ok()?;
    if s.is_empty() || !s.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    let n = s.parse::<u64>().ok()?;
    (n <= 9_007_199_254_740_991).then_some(n)
}
pub fn classify_record(
    source: &Value,
    request: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(ctx)?;
    validate(
        request,
        &rt.record_request,
        ctx,
        "POSTGRESQL_RECORD_REQUEST",
    )?;
    validate_document(source, &rt, ctx)?;
    let native_source = text(request, "nativeSource").ok_or_else(|| {
        error(
            "POSTGRESQL_RECORD_REQUEST",
            "/nativeSource",
            "Native source required",
        )
    })?;
    let capture = pg::PostgresqlCatalogCapture::import(native_source, ctx)?;
    if capture.export(ctx)? != pg::export_document(source, ctx)? {
        return Err(error(
            "POSTGRESQL_RECORD_ARCHIVE",
            "/nativeSource",
            "Native archive differs from captured tree",
        ));
    }
    let v = pg::get_node(source, &u("/serverVersion"), ctx)?;
    if text(&v, "kind") != Some(&u("number")) || text(&v, "value") != Some(&u("170004")) {
        return Err(error(
            "POSTGRESQL_RECORD_SERVER",
            "/serverVersion",
            "This binding requires PostgreSQL 17.4",
        ));
    }
    let relation_schema = text(get(request, "relation").unwrap_or(&Value::Null), "schema")
        .ok_or_else(|| {
            error(
                "POSTGRESQL_RECORD_REQUEST",
                "/relation/schema",
                "Relation schema required",
            )
        })?;
    let relation_name =
        text(get(request, "relation").unwrap_or(&Value::Null), "name").ok_or_else(|| {
            error(
                "POSTGRESQL_RECORD_REQUEST",
                "/relation/name",
                "Relation name required",
            )
        })?;
    let native = pg::find_relation(source, relation_schema, relation_name, ctx)?;
    if native == Value::Null {
        return Err(error(
            "POSTGRESQL_RECORD_IDENTITY",
            "/relation",
            "Qualified relation is missing",
        ));
    }
    let columns = capture
        .columns(ctx)?
        .into_iter()
        .filter(|c| &c.schema == relation_schema && &c.relation == relation_name)
        .collect::<Vec<_>>();
    let modules = arr(source, "modules")
        .ok_or_else(|| error("POSTGRESQL_RECORD_METADATA", "/modules", "Modules required"))?;
    let mi = modules
        .iter()
        .position(|m| text(m, "id") == Some(&u("postgresql.columns")))
        .ok_or_else(|| {
            error(
                "POSTGRESQL_RECORD_METADATA",
                "/modules",
                "Derived column module is required",
            )
        })?;
    let mut result=obj(vec![("operation",t("classify-postgresql-record")),("version",t("1.0.0")),("status",t("classified")),("source",copy_json(source,ctx)?),("request",copy_json(request,ctx)?),("binding",obj(vec![("id",t("umf.postgresql.catalog.record")),("version",t("1.0.0")),("nativeVersion",t("17.4")),("subset",t("Captured ordinary/partitioned table member roles; views, composites, raw DDL and execution equivalence excluded"))])),("mappings",Value::Array(vec![])),("residuals",Value::Array(vec![])),("diagnostics",Value::Array(vec![]))]);
    let mut reasons = Vec::<(String, Utf16, Value, String)>::new();
    if arr(source, "modules")
        .unwrap()
        .iter()
        .any(|m| text(m, "id") == text(request, "recordModule"))
    {
        reasons.push((
            "RECORD_IDENTITY_COLLISION".into(),
            u("/modules"),
            copy_json(get(request, "recordModule").unwrap_or(&Value::Null), ctx)?,
            "Requested record module already exists; no merge is implied".into(),
        ));
    }
    if text(&native, "kind") != Some(&u("object")) {
        return Err(error(
            "POSTGRESQL_RECORD_RELATION",
            "/relation",
            "Malformed relation observation",
        ));
    }
    let relation_kind = tagged_member_text(&native, "kind")
        .cloned()
        .unwrap_or_default();
    if ![u("r"), u("p")].contains(&relation_kind) {
        reasons.push((
            "POSTGRESQL_RELATION_UNSUPPORTED".into(),
            u("/relation"),
            copy_json(&native, ctx)?,
            "Only ordinary and partitioned tables are covered by this record binding".into(),
        ));
    }
    let mut names = std::collections::BTreeSet::new();
    let mut last = 0_u64;
    for column in &columns {
        let name = text(&column.element, "name").ok_or_else(|| {
            error(
                "POSTGRESQL_RECORD_METADATA",
                "/name",
                "Column name required",
            )
        })?;
        if name.is_empty() || !names.insert(name.clone()) {
            reasons.push((
                "POSTGRESQL_MEMBER_IDENTITY".into(),
                column.path.clone(),
                copy_json(&column.native_column, ctx)?,
                "Captured table member names must be nonempty and unique".into(),
            ));
        }
        match tagged_number(&column.native_column, "position") {
            Some(n) if n > last => last = n,
            _ => reasons.push((
                "POSTGRESQL_MEMBER_ORDER".into(),
                column.path.clone(),
                copy_json(&column.native_column, ctx)?,
                "Captured column positions must be positive and strictly increasing".into(),
            )),
        }
    }
    let mut authors = std::collections::BTreeMap::<Utf16, Value>::new();
    if let Some(author_list) = arr(request, "authors") {
        for author in author_list {
            let mut caps = NoCallbacks;
            match core_kind::verify_core_kind_declaration(
                author,
                source,
                &rt.engine,
                &rt.registry,
                &mut caps,
                ctx,
            ) {
                Err(e) if e.is_control_failure() || e.code == "LIMIT" || e.code == "CAPACITY" => {
                    return Err(e)
                }
                Err(e) => {
                    let path = text(
                        get(author, "provenance").unwrap_or(&Value::Null),
                        "idealPath",
                    )
                    .cloned()
                    .unwrap_or_default();
                    reasons.push((
                        "STALE_AUTHOR".into(),
                        path,
                        copy_json(author, ctx)?,
                        format!("Author receipt differs from source: {}", e.code),
                    ));
                    continue;
                }
                Ok(_) => (),
            }
            let ident = get(author, "identity").unwrap_or(&Value::Null);
            let module = text(ident, "module");
            let element = text(ident, "element");
            match (element, module) {
                (Some(id), Some(module))
                    if module == &u("postgresql.columns")
                        && columns.iter().any(|c| text(&c.element, "id") == Some(id))
                        && !authors.contains_key(id) =>
                {
                    authors.insert(id.clone(), copy_json(author, ctx)?);
                }
                _ => {
                    let path = text(
                        get(author, "provenance").unwrap_or(&Value::Null),
                        "idealPath",
                    )
                    .cloned()
                    .unwrap_or_default();
                    reasons.push((
                        "AUTHOR_IDENTITY".into(),
                        path,
                        copy_json(author, ctx)?,
                        "Duplicate or unrelated member author receipt".into(),
                    ));
                }
            }
        }
    }
    let mut mappings = Vec::new();
    for column in &columns {
        let id = text(&column.element, "id")
            .ok_or_else(|| error("POSTGRESQL_RECORD_METADATA", "/id", "Column id required"))?;
        let mut fields = vec![
            (u("column"), Value::String(column.path.clone())),
            (
                u("nativeSource"),
                copy_json(get(request, "nativeSource").unwrap(), ctx)?,
            ),
            (u("mode"), copy_json(get(request, "mode").unwrap(), ctx)?),
        ];
        if let Some(author) = authors.get(id) {
            fields.push((u("author"), copy_json(author, ctx)?));
        }
        let field_request = Value::Object(fields);
        let classified = classify_field_inner(source, &field_request, &rt, ctx)?;
        if let Some(mapping) = get(&classified, "mapping") {
            mappings.push(copy_json(mapping, ctx)?);
        }
        if text(&classified, "status") == Some(&u("blocked")) {
            for residual in arr(&classified, "residuals").unwrap_or(&[]) {
                let path = text(residual, "path").cloned().unwrap_or_default();
                let value = get(residual, "value").cloned().unwrap_or(Value::Null);
                let reason = text(residual, "reason")
                    .and_then(|s| s.to_utf8().ok())
                    .unwrap_or_else(|| {
                        "Field role conflicts with native catalog membership".into()
                    });
                reasons.push(("FIELD_KIND_CONFLICT".into(), path, value, reason));
            }
        }
    }
    for (code, path, value, reason) in reasons {
        block_record(&mut result, &code, &path, &value, &reason, ctx)?;
    }
    let relation_list = pg::get_node(source, &u("/snapshot/relations"), ctx)?;
    let relation_index = tagged_array_items(&relation_list)
        .and_then(|items| {
            items.iter().position(|item| {
                tagged_member_text(item, "schema") == Some(relation_schema)
                    && tagged_member_text(item, "name") == Some(relation_name)
            })
        })
        .ok_or_else(|| {
            error(
                "POSTGRESQL_RECORD_IDENTITY",
                "/relation",
                "Qualified relation path is missing",
            )
        })?;
    let native_path = u(&format!("/snapshot/relations/{relation_index}"));
    let ideal_path = u(&format!("/modules/{}/elements/0/kind", modules.len()));
    mappings.push(obj(vec![
        ("origin", t("classified")),
        ("kind", t("record")),
        ("idealPath", Value::String(ideal_path.clone())),
        ("nativePath", Value::String(native_path)),
        ("nativeFragment", copy_json(&native, ctx)?),
        ("basis", t("checked-catalog-table-members")),
        (
            "outcome",
            t(if text(&result, "status") == Some(&u("classified")) {
                "exact"
            } else {
                "unknown"
            }),
        ),
    ]));
    set(&mut result, "mappings", Value::Array(mappings))?;
    if text(&result, "status") == Some(&u("classified")) {
        let mut target = copy_json(source, ctx)?;
        let target_modules = get_mut(&mut target, "modules")
            .and_then(|v| {
                if let Value::Array(a) = v {
                    Some(a)
                } else {
                    None
                }
            })
            .ok_or_else(|| error("POSTGRESQL_RECORD_TARGET", "/modules", "Modules missing"))?;
        let target_columns = target_modules
            .get_mut(mi)
            .and_then(|m| get_mut(m, "elements"))
            .and_then(|v| {
                if let Value::Array(a) = v {
                    Some(a)
                } else {
                    None
                }
            })
            .ok_or_else(|| {
                error(
                    "POSTGRESQL_RECORD_TARGET",
                    "/modules",
                    "Column elements missing",
                )
            })?;
        for column in &columns {
            if let Some(id) = text(&column.element, "id") {
                if let Some(element) = target_columns
                    .iter_mut()
                    .find(|e| text(e, "id") == Some(id))
                {
                    set(element, "kind", t("field"))?;
                }
            }
        }
        let references = columns
            .iter()
            .filter_map(|c| {
                text(&c.element, "id").map(|id| {
                    obj(vec![
                        ("role", t("member")),
                        ("module", t("postgresql.columns")),
                        ("element", Value::String(id.clone())),
                    ])
                })
            })
            .collect();
        let record_element = obj(vec![
            ("id", copy_json(get(request, "recordId").unwrap(), ctx)?),
            ("name", Value::String(copy_text(relation_name, ctx)?)),
            ("kind", t("record")),
            ("extensions", Value::Object(vec![])),
            ("references", Value::Array(references)),
        ]);
        target_modules.push(obj(vec![
            ("id", copy_json(get(request, "recordModule").unwrap(), ctx)?),
            ("namespace", Value::String(copy_text(relation_schema, ctx)?)),
            ("elements", Value::Array(vec![record_element])),
        ]));
        let valid = rt
            .engine
            .validate_document(&target, &rt.registry, &mut NoCallbacks, ctx)?;
        if !valid.valid {
            return Err(error(
                "POSTGRESQL_RECORD_TARGET",
                "/modules",
                "Constructed target violates current core constraints",
            ));
        }
        set(&mut result, "target", target)?;
    }
    validate(&result, &rt.record, ctx, "POSTGRESQL_RECORD_RESULT")?;
    Ok(result)
}
pub fn verify_record(
    receipt: &Value,
    current: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(ctx)?;
    validate(receipt, &rt.record, ctx, "POSTGRESQL_RECORD_RECEIPT")?;
    if text(receipt, "status") != Some(&u("classified")) {
        return Err(error(
            "POSTGRESQL_RECORD_RECEIPT",
            "/status",
            "Expected complete classification receipt",
        ));
    }
    let expected = classify_record(
        get(receipt, "source")
            .ok_or_else(|| error("POSTGRESQL_RECORD_RECEIPT", "/source", "Source required"))?,
        get(receipt, "request")
            .ok_or_else(|| error("POSTGRESQL_RECORD_RECEIPT", "/request", "Request required"))?,
        ctx,
    )?;
    if !equal(receipt, &expected, ctx)? {
        return Err(error(
            "POSTGRESQL_RECORD_RECEIPT",
            "",
            "Classification differs from recomputation",
        ));
    }
    if !equal(
        current,
        get(receipt, "target")
            .ok_or_else(|| error("POSTGRESQL_RECORD_RECEIPT", "/target", "Target required"))?,
        ctx,
    )? {
        return Err(error(
            "POSTGRESQL_RECORD_STALE",
            "",
            "Current model changed",
        ));
    }
    copy_json(receipt, ctx)
}
pub fn recover_record(
    receipt: &Value,
    current: &Value,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    let checked = verify_record(receipt, current, ctx)?;
    text(
        get(&checked, "request").unwrap_or(&Value::Null),
        "nativeSource",
    )
    .cloned()
    .ok_or_else(|| {
        error(
            "POSTGRESQL_RECORD_RECEIPT",
            "/request/nativeSource",
            "Native source required",
        )
    })
}

fn block_cardinality(
    result: &mut Value,
    path: &Utf16,
    value: &Value,
    reason: &str,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    set(result, "status", t("blocked"))?;
    let residual = obj(vec![
        ("path", Value::String(copy_text(path, ctx)?)),
        ("value", copy_json(value, ctx)?),
        ("reason", t(reason)),
        ("recovery", t(CARDINALITY_RECOVERY)),
    ]);
    if let Some(Value::Array(items)) = get_mut(result, "residuals") {
        items.push(residual);
    }
    let diagnostic = obj(vec![
        ("code", t("POSTGRESQL_CARDINALITY_CONFLICT")),
        ("path", Value::String(copy_text(path, ctx)?)),
        ("message", t(reason)),
        ("severity", t("error")),
    ]);
    if let Some(Value::Array(items)) = get_mut(result, "diagnostics") {
        items.push(diagnostic);
    }
    Ok(())
}

fn add_cardinality_loss(
    result: &mut Value,
    path: &Utf16,
    value: &Value,
    reason: &str,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let residual = obj(vec![
        ("path", Value::String(copy_text(path, ctx)?)),
        ("value", copy_json(value, ctx)?),
        ("reason", t(reason)),
        ("recovery", t(CARDINALITY_RECOVERY)),
    ]);
    if let Some(Value::Array(items)) = get_mut(result, "residuals") {
        items.push(residual);
    }
    let diagnostic = obj(vec![
        ("code", t("POSTGRESQL_CARDINALITY_UNRESOLVED")),
        ("path", Value::String(copy_text(path, ctx)?)),
        ("message", t(reason)),
        ("severity", t("warning")),
    ]);
    if let Some(Value::Array(items)) = get_mut(result, "diagnostics") {
        items.push(diagnostic);
    }
    Ok(())
}

fn classify_cardinality_inner(
    source: &Value,
    request: &Value,
    rt: &Runtime,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    validate(
        request,
        &rt.cardinality_request,
        ctx,
        "POSTGRESQL_CARDINALITY_REQUEST",
    )?;
    validate_document(source, rt, ctx)?;
    let native_source = text(request, "nativeSource").ok_or_else(|| {
        error(
            "POSTGRESQL_CARDINALITY_REQUEST",
            "/nativeSource",
            "Native source required",
        )
    })?;
    let capture = pg::PostgresqlCatalogCapture::import(native_source, ctx)?;
    if capture.export(ctx)? != pg::export_document(source, ctx)? {
        return Err(error(
            "POSTGRESQL_CARDINALITY_ARCHIVE",
            "/nativeSource",
            "Native archive differs from captured tree",
        ));
    }
    let version = pg::get_node(source, &u("/serverVersion"), ctx)?;
    if text(&version, "kind") != Some(&u("number")) || text(&version, "value") != Some(&u("170004"))
    {
        return Err(error(
            "POSTGRESQL_CARDINALITY_VERSION",
            "/serverVersion",
            "This binding requires PostgreSQL 17.4",
        ));
    }
    let column_path = text(request, "column").ok_or_else(|| {
        error(
            "POSTGRESQL_CARDINALITY_REQUEST",
            "/column",
            "Column path required",
        )
    })?;
    let supplement = text(request, "supplement").ok_or_else(|| {
        error(
            "POSTGRESQL_CARDINALITY_REQUEST",
            "/supplement",
            "Catalog supplement required",
        )
    })?;
    let correspondence = pg::correlate_cardinality_catalog(source, supplement, ctx)?;
    if !matches!(
        get(&correspondence, "qualifiedVersion"),
        Some(Value::Bool(true))
    ) {
        return Err(error(
            "POSTGRESQL_CARDINALITY_VERSION",
            "/supplement/serverVersion",
            "PostgreSQL 17.4 catalog supplement required",
        ));
    }
    let match_row = arr(&correspondence, "matches")
        .and_then(|rows| {
            rows.iter()
                .find(|row| text(row, "column") == Some(column_path))
        })
        .ok_or_else(|| {
            error(
                "POSTGRESQL_CARDINALITY_COLUMN",
                "/column",
                "Column not captured",
            )
        })?;
    let identity = get(match_row, "identity").unwrap_or(&Value::Null);
    let resolved = pg::resolve_cardinality_type(
        supplement,
        text(identity, "schema").ok_or_else(|| {
            error(
                "POSTGRESQL_CARDINALITY_COLUMN",
                "",
                "Schema identity missing",
            )
        })?,
        text(identity, "relation").ok_or_else(|| {
            error(
                "POSTGRESQL_CARDINALITY_COLUMN",
                "",
                "Relation identity missing",
            )
        })?,
        text(identity, "name").ok_or_else(|| {
            error(
                "POSTGRESQL_CARDINALITY_COLUMN",
                "",
                "Column identity missing",
            )
        })?,
        ctx,
    )?;
    let metadata = capture
        .columns(ctx)?
        .into_iter()
        .find(|column| &column.path == column_path)
        .ok_or_else(|| {
            error(
                "POSTGRESQL_CARDINALITY_COLUMN",
                "/column",
                "Column metadata missing",
            )
        })?;
    let modules = arr(source, "modules").ok_or_else(|| {
        error(
            "POSTGRESQL_CARDINALITY_SOURCE",
            "/modules",
            "Modules required",
        )
    })?;
    let mi = modules
        .iter()
        .position(|module| text(module, "id") == Some(&u("postgresql.columns")))
        .ok_or_else(|| {
            error(
                "POSTGRESQL_CARDINALITY_COLUMN",
                "/modules",
                "Derived column module missing",
            )
        })?;
    let elements = arr(&modules[mi], "elements").ok_or_else(|| {
        error(
            "POSTGRESQL_CARDINALITY_SOURCE",
            "/modules/elements",
            "Elements required",
        )
    })?;
    let ei = elements
        .iter()
        .position(|element| text(element, "id") == text(&metadata.element, "id"))
        .ok_or_else(|| {
            error(
                "POSTGRESQL_CARDINALITY_COLUMN",
                "/modules/elements",
                "Derived Field missing",
            )
        })?;
    let element = &elements[ei];
    let id = text(element, "id")
        .ok_or_else(|| error("POSTGRESQL_CARDINALITY_COLUMN", "/id", "Column id missing"))?;
    let ideal = append(
        &append(&u("/modules"), &format!("/{mi}/elements/{ei}"), ctx)?,
        "/cardinality",
        ctx,
    )?;
    let base = append(id, "/nativeType", ctx)?;
    let native_fragment = copy_json(&metadata.native_column, ctx)?;
    let basis = "Explicit captured native type relationships; bounds, rank, item and execution semantics remain native";
    let binding = obj(vec![
        ("id", t("umf.postgresql.cardinality")),
        ("version", t("1.0.0")),
        ("nativeVersion", t("17.4")),
        ("subset", t("Declared column shape under selected metadata profile; not whole-model validation, item typing or execution equivalence")),
    ]);
    let mapping = obj(vec![
        ("origin", t("classified")),
        ("idealPath", Value::String(copy_text(&ideal, ctx)?)),
        ("nativePath", Value::String(copy_text(&base, ctx)?)),
        ("nativeFragment", copy_json(&native_fragment, ctx)?),
        ("cardinality", t("unspecified")),
        ("interpretation", t("unknown")),
        ("outcome", t("unknown")),
        ("basis", t(basis)),
    ]);
    let mut result = obj(vec![
        ("operation", t("classify-postgresql-cardinality")),
        ("version", t("1.0.0")),
        ("status", t("classified")),
        ("source", copy_json(source, ctx)?),
        ("request", copy_json(request, ctx)?),
        ("binding", binding),
        ("mapping", mapping),
        ("residuals", Value::Array(vec![])),
        ("diagnostics", Value::Array(vec![])),
    ]);
    let unresolved = text(request, "profile") == Some(&u("unresolved"));
    let standard_array = matches!(get(&resolved, "standardArray"), Some(Value::Bool(true)));
    let native = get(&resolved, "native").unwrap_or(&Value::Null);
    let native_identity = get(native, "identity").unwrap_or(&Value::Null);
    let native_name = text(native_identity, "name");
    let scalar_native = text(native_identity, "schema") == Some(&u("pg_catalog"))
        && text(native, "kind") == Some(&u("b"))
        && matches!(
            native_name.and_then(|name| name.to_utf8().ok()).as_deref(),
            Some(
                "bool"
                    | "int2"
                    | "int4"
                    | "int8"
                    | "numeric"
                    | "float4"
                    | "float8"
                    | "text"
                    | "varchar"
                    | "bpchar"
                    | "bytea"
                    | "date"
                    | "time"
                    | "timetz"
                    | "timestamp"
                    | "timestamptz"
                    | "uuid"
            )
        );
    let (cardinality, interpretation, outcome) = if unresolved {
        add_cardinality_loss(
            &mut result,
            &base,
            &native_fragment,
            "Stored-value scope is unresolved",
            ctx,
        )?;
        ("unspecified", "unknown", "unknown")
    } else if standard_array {
        add_cardinality_loss(&mut result, &base, &native_fragment, "Native arrays permit variable rank and non-default lower bounds; the ideal sequence does not preserve this layout. Declared dimensions do not enforce rank.", ctx)?;
        ("array", "declared", "approximated")
    } else if scalar_native {
        ("one", "declared", "exact")
    } else {
        add_cardinality_loss(&mut result, &base, &native_fragment, "Native type does not establish a qualified scalar, ideal sequence or exact-string-key map; JSON, vector and other native refinements stay uninterpreted", ctx)?;
        ("unspecified", "unsupported", "not-expressible")
    };
    let selected_extensions = get(element, "extensions").unwrap_or(&Value::Null);
    let mut conflict: Option<String> = None;
    if text(element, "kind") != Some(&u("field")) {
        conflict = Some(String::from("Selected native member must already be an explicit Field; this operation does not replace its kind"));
    }
    if let Some(author) = get(request, "author") {
        let mut caps = NoCallbacks;
        match crate::cardinality::verify_core_cardinality_declaration(
            author,
            source,
            &rt.engine,
            &rt.registry,
            &mut caps,
            ctx,
        ) {
            Ok(verified) => {
                let identity = get(&verified, "identity").unwrap_or(&Value::Null);
                let provenance = get(&verified, "provenance").unwrap_or(&Value::Null);
                if text(identity, "module") != Some(&u("postgresql.columns"))
                    || text(identity, "element") != Some(id)
                {
                    conflict = Some(String::from("Author receipt identifies a different member"));
                } else if text(provenance, "cardinality") != Some(&u(cardinality)) {
                    conflict = Some(String::from("Authored cardinality differs from the native observation; neither assertion may be overwritten"));
                }
            }
            Err(e) if e.is_control_failure() || e.code == "LIMIT" || e.code == "CAPACITY" => {
                return Err(e)
            }
            Err(e) => conflict = Some(format!("Author provenance is invalid or stale: {}", e.code)),
        }
    } else if get(element, "cardinality").is_some() {
        conflict = Some(String::from(
            "Existing cardinality requires verified author provenance before native classification",
        ));
    }
    if get(selected_extensions, "umf.postgresql.cardinality").is_some() {
        conflict = Some(String::from(
            "Existing binding scope cannot be overwritten; reclassify from its retained source",
        ));
    }
    if let Some(version) = get(
        get(source, "vocabularies").unwrap_or(&Value::Null),
        "umf.postgresql.cardinality",
    ) {
        if text(version, "version") != Some(&u("1.0.0")) {
            conflict = Some(String::from(
                "Existing binding vocabulary version is incompatible",
            ));
        }
    }
    if cardinality == "array" && get(element, "scalarType").is_some() {
        conflict = Some(String::from(
            "Array classification cannot erase or relocate an existing scalar assertion",
        ));
    }
    if let Some(item_type) = get(element, "itemType") {
        let item_path = append(
            &u("/modules"),
            &format!("/{mi}/elements/{ei}/itemType"),
            ctx,
        )?;
        add_cardinality_loss(&mut result, &item_path, item_type, "This observation does not classify or confirm item/value meaning; retained author item references stay independent", ctx)?;
    }
    let has_conflict = conflict.is_some();
    if let Some(reason) = conflict {
        let existing = get(element, "cardinality").unwrap_or(&Value::Null);
        block_cardinality(&mut result, &ideal, existing, &reason, ctx)?;
        let mapping = get_mut(&mut result, "mapping").unwrap();
        set(mapping, "outcome", t("unknown"))?;
    }
    set(
        get_mut(&mut result, "mapping").unwrap(),
        "cardinality",
        t(cardinality),
    )?;
    set(
        get_mut(&mut result, "mapping").unwrap(),
        "outcome",
        t(if has_conflict { "unknown" } else { outcome }),
    )?;
    set(
        get_mut(&mut result, "mapping").unwrap(),
        "interpretation",
        t(interpretation),
    )?;
    if text(request, "mode") == Some(&u("strict"))
        && !arr(&result, "residuals").unwrap_or(&[]).is_empty()
    {
        set(&mut result, "status", t("blocked"))?;
        if let Some(Value::Array(diagnostics)) = get_mut(&mut result, "diagnostics") {
            for diagnostic in diagnostics {
                set(diagnostic, "severity", t("error"))?;
            }
        }
    }
    if text(&result, "status") == Some(&u("classified")) {
        let mut target = copy_json(source, ctx)?;
        let vocabularies = get_mut(&mut target, "vocabularies").unwrap();
        if get(vocabularies, "umf.postgresql.cardinality").is_none() {
            set(
                vocabularies,
                "umf.postgresql.cardinality",
                obj(vec![("version", t("1.0.0"))]),
            )?;
        }
        let selected = get_mut(&mut target, "modules")
            .and_then(|v| match v {
                Value::Array(a) => a.get_mut(mi),
                _ => None,
            })
            .and_then(|m| get_mut(m, "elements"))
            .and_then(|v| match v {
                Value::Array(a) => a.get_mut(ei),
                _ => None,
            })
            .ok_or_else(|| {
                error(
                    "POSTGRESQL_CARDINALITY_TARGET",
                    "/modules",
                    "Selected Field is missing",
                )
            })?;
        set(selected, "cardinality", t(cardinality))?;
        let extension = obj(vec![
            ("origin", t("classified")),
            (
                "nativeSupplement",
                Value::String(copy_text(supplement, ctx)?),
            ),
            (
                "binding",
                obj(vec![
                    ("id", t("umf.postgresql.cardinality")),
                    ("version", t("1.0.0")),
                ]),
            ),
            (
                "profile",
                copy_json(get(request, "profile").unwrap_or(&Value::Null), ctx)?,
            ),
            ("interpretation", t(interpretation)),
            ("nativePath", Value::String(base)),
            ("basis", t(basis)),
        ]);
        set(
            get_mut(selected, "extensions").unwrap(),
            "umf.postgresql.cardinality",
            extension,
        )?;
        validate_document(&target, rt, ctx)?;
        set(&mut result, "target", target)?;
    }
    if text(&result, "status") == Some(&u("blocked")) {
        if let Some(Value::Array(diagnostics)) = get_mut(&mut result, "diagnostics") {
            for diagnostic in diagnostics {
                set(diagnostic, "severity", t("error"))?;
            }
        }
    }
    validate(
        &result,
        &rt.cardinality,
        ctx,
        "POSTGRESQL_CARDINALITY_RESULT",
    )?;
    Ok(result)
}

pub fn classify_cardinality(
    source: &Value,
    request: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(ctx)?;
    let source = copy_json(source, ctx)?;
    let request = copy_json(request, ctx)?;
    classify_cardinality_inner(&source, &request, &rt, ctx)
}

pub fn verify_cardinality(
    receipt: &Value,
    current: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(ctx)?;
    validate(
        receipt,
        &rt.cardinality,
        ctx,
        "POSTGRESQL_CARDINALITY_RECEIPT",
    )?;
    if text(receipt, "status") != Some(&u("classified")) {
        return Err(error(
            "POSTGRESQL_CARDINALITY_RECEIPT",
            "/status",
            "Expected complete classified receipt",
        ));
    }
    let expected = classify_cardinality_inner(
        get(receipt, "source").ok_or_else(|| {
            error(
                "POSTGRESQL_CARDINALITY_RECEIPT",
                "/source",
                "Source required",
            )
        })?,
        get(receipt, "request").ok_or_else(|| {
            error(
                "POSTGRESQL_CARDINALITY_RECEIPT",
                "/request",
                "Request required",
            )
        })?,
        &rt,
        ctx,
    )?;
    if !equal(receipt, &expected, ctx)? {
        return Err(error(
            "POSTGRESQL_CARDINALITY_RECEIPT",
            "",
            "Classification disagrees with captured native source and catalog",
        ));
    }
    if !equal(
        current,
        get(receipt, "target").ok_or_else(|| {
            error(
                "POSTGRESQL_CARDINALITY_RECEIPT",
                "/target",
                "Target required",
            )
        })?,
        ctx,
    )? {
        return Err(error(
            "POSTGRESQL_CARDINALITY_STALE",
            "",
            "Target changed; recompute from retained native sources",
        ));
    }
    copy_json(receipt, ctx)
}

pub fn recover_cardinality(
    receipt: &Value,
    current: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let checked = verify_cardinality(receipt, current, ctx)?;
    let request = get(&checked, "request").unwrap_or(&Value::Null);
    Ok(obj(vec![
        (
            "nativeSource",
            Value::String(text(request, "nativeSource").cloned().ok_or_else(|| {
                error(
                    "POSTGRESQL_CARDINALITY_RECEIPT",
                    "/request/nativeSource",
                    "Retained archive missing",
                )
            })?),
        ),
        (
            "supplement",
            Value::String(text(request, "supplement").cloned().ok_or_else(|| {
                error(
                    "POSTGRESQL_CARDINALITY_RECEIPT",
                    "/request/supplement",
                    "Retained catalog missing",
                )
            })?),
        ),
    ]))
}

fn tagged_kind(v: &Value) -> Option<&Utf16> {
    text(v, "kind")
}
fn tagged_text(v: &Value) -> Option<&Utf16> {
    if tagged_kind(v) == Some(&u("string")) {
        text(v, "value")
    } else {
        None
    }
}
fn tagged_bool(v: &Value) -> Option<bool> {
    if tagged_kind(v) == Some(&u("boolean")) {
        match get(v, "value") {
            Some(Value::Bool(x)) => Some(*x),
            _ => None,
        }
    } else {
        None
    }
}
fn tagged_items(v: &Value) -> Option<&[Value]> {
    if tagged_kind(v) == Some(&u("array")) {
        arr(v, "items")
    } else {
        None
    }
}
fn tagged_members(v: &Value) -> Option<&Value> {
    if tagged_kind(v) == Some(&u("object")) {
        get(v, "members")
    } else {
        None
    }
}
fn tagged_empty(v: Option<&Value>) -> bool {
    match v {
        Some(x) if tagged_kind(x) == Some(&u("null")) => true,
        Some(x) => tagged_items(x).is_some_and(|items| items.is_empty()),
        None => false,
    }
}
fn tagged_at<'a>(mut node: &'a Value, path: &str) -> Option<&'a Value> {
    for part in path.trim_start_matches('/').split('/') {
        node = match tagged_kind(node)? {
            k if k == &u("object") => get(tagged_members(node)?, part)?,
            k if k == &u("array") => tagged_items(node)?.get(part.parse::<usize>().ok()?)?,
            _ => return None,
        };
    }
    Some(node)
}
fn contains_key(v: &Value, key: &str) -> bool {
    matches!(v,Value::Object(fields) if fields.iter().any(|(k,_)|k==&u(key)))
}
fn nullability_loss(
    result: &mut Value,
    path: Utf16,
    value: &Value,
    reason: &str,
    conflict: bool,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let residual = obj(vec![
        ("path", Value::String(path.clone())),
        ("value", copy_json(value, ctx)?),
        ("reason", t(reason)),
        ("recovery", t(NULLABILITY_RECOVERY)),
    ]);
    let diagnostic = obj(vec![
        (
            "code",
            t(if conflict {
                "POSTGRESQL_NULLABILITY_CONFLICT"
            } else {
                "POSTGRESQL_NULLABILITY_UNRESOLVED"
            }),
        ),
        ("path", Value::String(path)),
        ("message", t(reason)),
        ("severity", t("warning")),
    ]);
    if let Some(Value::Array(items)) = get_mut(result, "residuals") {
        items.push(residual)
    }
    if let Some(Value::Array(items)) = get_mut(result, "diagnostics") {
        items.push(diagnostic)
    }
    Ok(())
}
fn validate_nullability_source(
    source: &Value,
    rt: &Runtime,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    validate_document(source, rt, ctx)
}
fn classify_nullability_inner(
    source: &Value,
    request: &Value,
    rt: &Runtime,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    validate(
        request,
        &rt.nullability_request,
        ctx,
        "POSTGRESQL_NULLABILITY_REQUEST",
    )?;
    validate_nullability_source(source, rt, ctx)?;
    let native_source = text(request, "nativeSource").cloned().ok_or_else(|| {
        error(
            "POSTGRESQL_NULLABILITY_REQUEST",
            "/nativeSource",
            "Native archive must be a string",
        )
    })?;
    let source_capture = pg::catalog_from_document(source, ctx)?;
    let requested_capture = pg::PostgresqlCatalogCapture::import(&native_source, ctx)?;
    let source_root = source_capture.root_tagged(ctx)?;
    let requested_root = requested_capture.root_tagged(ctx)?;
    if !equal(&source_root, &requested_root, ctx)?
        || source_capture.state() != &u("captured")
        || requested_capture.state() != &u("captured")
    {
        return Err(error(
            "POSTGRESQL_NULLABILITY_ARCHIVE",
            "/request/nativeSource",
            "Native text differs from the retained captured catalog",
        ));
    }
    let root_members = tagged_members(&source_root).ok_or_else(|| {
        error(
            "POSTGRESQL_NULLABILITY_PROFILE",
            "",
            "Expected captured catalog root",
        )
    })?;
    let snapshot = get(root_members, "snapshot").ok_or_else(|| {
        error(
            "POSTGRESQL_NULLABILITY_PROFILE",
            "/snapshot",
            "Snapshot missing",
        )
    })?;
    let snapshot_members = tagged_members(snapshot).ok_or_else(|| {
        error(
            "POSTGRESQL_NULLABILITY_PROFILE",
            "/snapshot",
            "Expected snapshot object",
        )
    })?;
    if tagged_kind(get(root_members, "serverVersion").unwrap_or(&Value::Null)) != Some(&u("number"))
        || text(
            get(root_members, "serverVersion").unwrap_or(&Value::Null),
            "value",
        ) != Some(&u("170004"))
        || tagged_text(get(root_members, "profile").unwrap_or(&Value::Null))
            != Some(&u("postgresql-catalog-capture-v1"))
        || tagged_text(get(root_members, "state").unwrap_or(&Value::Null)) != Some(&u("captured"))
        || tagged_text(get(snapshot_members, "profile").unwrap_or(&Value::Null))
            != Some(&u("umf-postgresql-catalog-evidence-17-v3"))
    {
        return Err(error(
            "POSTGRESQL_NULLABILITY_PROFILE",
            "/snapshot/profile",
            "Expected captured PostgreSQL 17.4 catalog evidence profile 17-v3",
        ));
    }
    let columns = source_capture.columns(ctx)?;
    let wanted = text(request, "column").ok_or_else(|| {
        error(
            "POSTGRESQL_NULLABILITY_COLUMN",
            "/request/column",
            "Column path required",
        )
    })?;
    let mut column_index = None;
    for (index, column) in columns.iter().enumerate() {
        ctx.charge_work(1, u("/request/column"))?;
        if &column.path == wanted {
            if column_index.replace(index).is_some() {
                return Err(error(
                    "POSTGRESQL_NULLABILITY_COLUMN",
                    "/request/column",
                    "Native column path is ambiguous",
                ));
            }
        }
    }
    let column = column_index
        .and_then(|index| columns.get(index))
        .ok_or_else(|| {
            error(
                "POSTGRESQL_NULLABILITY_COLUMN",
                "/request/column",
                "Native column not found",
            )
        })?;
    let modules = arr(source, "modules").ok_or_else(|| {
        error(
            "POSTGRESQL_NULLABILITY_SOURCE",
            "/modules",
            "Modules required",
        )
    })?;
    let mi = modules
        .iter()
        .position(|m| text(m, "id") == Some(&u("postgresql.columns")))
        .ok_or_else(|| {
            error(
                "POSTGRESQL_NULLABILITY_COLUMN",
                "/modules",
                "Column module missing",
            )
        })?;
    let elements = arr(&modules[mi], "elements").ok_or_else(|| {
        error(
            "POSTGRESQL_NULLABILITY_COLUMN",
            "/elements",
            "Elements required",
        )
    })?;
    let element_id = text(&column.element, "id").ok_or_else(|| {
        error(
            "POSTGRESQL_NULLABILITY_COLUMN",
            "/id",
            "Column identity missing",
        )
    })?;
    let ei = elements
        .iter()
        .position(|e| text(e, "id") == Some(element_id))
        .ok_or_else(|| {
            error(
                "POSTGRESQL_NULLABILITY_COLUMN",
                "/elements",
                "Derived column member is required",
            )
        })?;
    let element = &elements[ei];
    let native_members = tagged_members(&column.native_column).ok_or_else(|| {
        error(
            "POSTGRESQL_NULLABILITY_COLUMN",
            "/nativeColumn",
            "Expected native column object",
        )
    })?;
    let mut ideal = append(&u("/modules/"), &mi.to_string(), ctx)?;
    ideal = append(&ideal, "/elements/", ctx)?;
    ideal = append(&ideal, &ei.to_string(), ctx)?;
    ideal = append(&ideal, "/nullability", ctx)?;
    let mut native_path = column.path.clone();
    native_path = append(&native_path, "/notNull", ctx)?;
    let flag = get(native_members, "notNull").and_then(tagged_bool);
    let mut nullability = "unspecified";
    let mut interpretation = "unknown";
    let mut outcome = "unknown";
    let mut reason: Option<String> = None;
    let scope = text(request, "scope")
        .cloned()
        .unwrap_or_else(|| u("unresolved"));
    let carrier = text(request, "carrier")
        .cloned()
        .unwrap_or_else(|| u("unresolved"));
    if scope != u("stored-relation") {
        reason=Some("Stored-relation scope required; query outputs and input omission have different availability".into());
    } else if carrier != u("sql-null") {
        reason = Some(
            "Explicit SQL-NULL absence carrier required; omitted members are not equated with NULL"
                .into(),
        );
    } else if column.kind != u("r") && column.kind != u("p") {
        reason =
            Some("Only captured ordinary and partitioned table declarations are supported".into());
        interpretation = "unsupported";
    } else if flag.is_none() {
        reason = Some("Column notNull is missing or is not an exact native boolean".into());
    } else if flag == Some(false) {
        let native_type = get(native_members, "nativeType").and_then(tagged_members);
        let type_name =
            native_type.and_then(|ty| tagged_text(get(ty, "name").unwrap_or(&Value::Null)));
        let type_ok = native_type.is_some_and(|ty| {
            tagged_text(get(ty, "schema").unwrap_or(&Value::Null)) == Some(&u("pg_catalog"))
                && tagged_text(get(ty, "kind").unwrap_or(&Value::Null)) == Some(&u("b"))
                && tagged_text(get(ty, "category").unwrap_or(&Value::Null)) != Some(&u("A"))
                && tagged_kind(get(ty, "dimensions").unwrap_or(&Value::Null)) == Some(&u("number"))
                && text(get(ty, "dimensions").unwrap_or(&Value::Null), "value") == Some(&u("0"))
                && [
                    "bool",
                    "int2",
                    "int4",
                    "int8",
                    "numeric",
                    "float4",
                    "float8",
                    "text",
                    "varchar",
                    "bpchar",
                    "bytea",
                    "date",
                    "time",
                    "timetz",
                    "timestamp",
                    "timestamptz",
                ]
                .iter()
                .any(|n| type_name == Some(&u(n)))
        });
        if !type_ok {
            reason = Some(
                "Domain, array or unresolved native type requires additional availability evidence"
                    .into(),
            );
        } else if tagged_text(get(native_members, "generated").unwrap_or(&Value::Null))
            .is_some_and(|x| !x.is_empty())
            || tagged_text(get(native_members, "identity").unwrap_or(&Value::Null))
                .is_some_and(|x| !x.is_empty())
        {
            reason=Some("Generated/identity behavior is retained separately; a false flag alone is insufficient".into());
        } else {
            let path_text = column.path.to_utf8().map_err(|_| {
                error(
                    "POSTGRESQL_NULLABILITY_COLUMN",
                    "/request/column",
                    "Derived native path is invalid",
                )
            })?;
            let parts: Vec<_> = path_text.split('/').collect();
            let relation_path = if parts.len() >= 5 {
                format!("/snapshot/relations/{}", parts[3])
            } else {
                return Err(error(
                    "POSTGRESQL_NULLABILITY_COLUMN",
                    "/request/column",
                    "Derived relation path is invalid",
                ));
            };
            let relation = tagged_at(&source_root, &relation_path);
            let constraints = relation
                .and_then(tagged_members)
                .and_then(|m| get(m, "constraints"));
            if relation.is_none() || !tagged_empty(constraints) {
                reason=Some("Native relation constraints may prohibit NULL; no arbitrary constraint expression is evaluated".into());
            } else if !tagged_empty(get(snapshot_members, "triggers")) {
                let triggers = get(snapshot_members, "triggers").and_then(tagged_items);
                let mut current = false;
                if let Some(items) = triggers {
                    for trigger in items {
                        ctx.charge_work(1, u("/snapshot/triggers"))?;
                        let m = tagged_members(trigger);
                        let matches_relation = m.and_then(|m| {
                            Some((
                                tagged_text(get(m, "schema")?)?,
                                tagged_text(get(m, "relation")?)?,
                            ))
                        });
                        match matches_relation {
                            Some((schema, relation))
                                if schema != &column.schema || relation != &column.relation => {}
                            _ => {
                                current = true;
                                break;
                            }
                        }
                    }
                }
                if triggers.is_none() || current {
                    reason = Some("Native trigger behavior for this relation is unresolved".into());
                }
            }
            if reason.is_none() {
                let allowed = [
                    "name",
                    "position",
                    "type",
                    "nativeType",
                    "notNull",
                    "identity",
                    "generated",
                    "collation",
                    "default",
                    "comment",
                    "storage",
                    "compression",
                    "acl",
                ];
                if let Value::Object(fields) = native_members {
                    for (key, _) in fields {
                        ctx.charge_work(key.len().saturating_add(1), u("/nativeColumn/members"))?;
                        if !allowed.iter().any(|name| key == &u(name)) {
                            reason=Some("Unknown native column refinement prevents an unconditional absence permission".into());
                            break;
                        }
                    }
                }
            }
        }
    }
    if reason.is_none() {
        nullability = if flag == Some(true) {
            "required"
        } else {
            "absent-allowed"
        };
        interpretation = "declared";
        outcome = "exact";
    }
    let mut result=obj(vec![("operation",t("classify-postgresql-nullability")),("version",t("1.0.0")),("status",t("classified")),("source",copy_json(source,ctx)?),("request",copy_json(request,ctx)?),("binding",obj(vec![("id",t("umf.postgresql.nullability")),("version",t("1.0.0")),("nativeVersion",t("17.4")),("subset",t("Captured PostgreSQL 17.4 stored-column declarations under SQL-NULL absence policy; no query, omission or native equivalence"))])),("mapping",obj(vec![("origin",t("classified")),("idealPath",Value::String(ideal.clone())),("nativePath",Value::String(native_path.clone())),("nativeFragment",copy_json(&column.native_column,ctx)?),("nullability",t("unspecified")),("interpretation",t("unknown")),("outcome",t("unknown")),("scope",Value::String(scope.clone())),("carrier",Value::String(carrier.clone())),("basis",t(NULLABILITY_BASIS))])),("residuals",Value::Array(vec![])),("diagnostics",Value::Array(vec![]))]);
    if let Some(reason) = reason.as_deref() {
        nullability_loss(
            &mut result,
            native_path.clone(),
            &column.native_column,
            reason,
            false,
            ctx,
        )?;
        if interpretation == "unsupported" {
            outcome = "not-expressible";
        }
    }
    if let Some(mapping) = get_mut(&mut result, "mapping") {
        set(mapping, "nullability", t(nullability))?;
        set(mapping, "interpretation", t(interpretation))?;
        set(mapping, "outcome", t(outcome))?;
    }
    let mut conflict: Option<String> = None;
    if text(element, "kind") != Some(&u("field")) {
        conflict=Some("Selected native member must already be an explicit Field; this operation does not replace its kind".into());
    }
    if let Some(author) = get(request, "author") {
        let mut capabilities = NoCallbacks;
        match crate::nullability::verify_core_nullability_declaration(
            author,
            source,
            &rt.engine,
            &rt.registry,
            &mut capabilities,
            ctx,
        ) {
            Ok(verified) => {
                let identity = get(&verified, "identity").unwrap_or(&Value::Null);
                let provenance = get(&verified, "provenance").unwrap_or(&Value::Null);
                if text(identity, "module") != Some(&u("postgresql.columns"))
                    || text(identity, "element") != Some(element_id)
                {
                    conflict = Some("Author receipt identifies a different member".into());
                } else if text(provenance, "nullability") != Some(&u(nullability)) {
                    conflict=Some("Authored availability differs from the native observation; neither assertion may be overwritten".into());
                }
            }
            Err(e) if e.is_control_failure() || e.code == "LIMIT" || e.code == "CAPACITY" => {
                return Err(e)
            }
            Err(e) => conflict = Some(format!("Author provenance is invalid or stale: {}", e.code)),
        }
    } else if contains_key(element, "nullability") {
        conflict=Some("Existing availability requires verified author provenance before native classification".into());
    }
    let extensions = get(element, "extensions").unwrap_or(&Value::Null);
    if get(extensions, "umf.postgresql.nullability").is_some() {
        conflict = Some(
            "Existing binding scope cannot be overwritten; reclassify from its retained source"
                .into(),
        );
    }
    if get(
        get(source, "vocabularies").unwrap_or(&Value::Null),
        "umf.postgresql.nullability",
    )
    .is_some_and(|v| text(v, "version") != Some(&u("1.0.0")))
    {
        conflict = Some("Existing binding vocabulary version is incompatible".into());
    }
    if let Some(reason) = conflict.as_deref() {
        nullability_loss(
            &mut result,
            ideal.clone(),
            get(element, "nullability").unwrap_or(&Value::Null),
            reason,
            true,
            ctx,
        )?;
        if let Some(mapping) = get_mut(&mut result, "mapping") {
            set(mapping, "outcome", t("unknown"))?;
        }
    }
    let default_mode = u("report");
    let mode = text(request, "mode").unwrap_or(&default_mode);
    let blocked = conflict.is_some()
        || (mode == &u("strict") && arr(&result, "residuals").is_some_and(|r| !r.is_empty()));
    set(
        &mut result,
        "status",
        t(if blocked { "blocked" } else { "classified" }),
    )?;
    if let Some(Value::Array(items)) = get_mut(&mut result, "diagnostics") {
        for d in items {
            set(d, "severity", t(if blocked { "error" } else { "warning" }))?;
        }
    }
    if !blocked {
        let mut target = copy_json(source, ctx)?;
        {
            let vocab = get_mut(&mut target, "vocabularies").ok_or_else(|| {
                error(
                    "POSTGRESQL_NULLABILITY_TARGET",
                    "/vocabularies",
                    "Vocabularies required",
                )
            })?;
            if get(vocab, "umf.postgresql.nullability").is_none() {
                set(
                    vocab,
                    "umf.postgresql.nullability",
                    obj(vec![("version", t("1.0.0"))]),
                )?;
            }
        }
        let selected = get_mut(arr_mut_document_module(&mut target, mi)?, "elements");
        let elements = selected
            .and_then(|x| {
                if let Value::Array(a) = x {
                    a.get_mut(ei)
                } else {
                    None
                }
            })
            .ok_or_else(|| {
                error(
                    "POSTGRESQL_NULLABILITY_TARGET",
                    "/modules",
                    "Selected element missing",
                )
            })?;
        set(elements, "nullability", t(nullability))?;
        let element_extensions = get_mut(elements, "extensions").ok_or_else(|| {
            error(
                "POSTGRESQL_NULLABILITY_TARGET",
                "/extensions",
                "Element extensions required",
            )
        })?;
        set(
            element_extensions,
            "umf.postgresql.nullability",
            obj(vec![
                ("origin", t("classified")),
                (
                    "binding",
                    obj(vec![
                        ("id", t("umf.postgresql.nullability")),
                        ("version", t("1.0.0")),
                    ]),
                ),
                ("scope", Value::String(scope)),
                ("carrier", Value::String(carrier)),
                ("interpretation", t(interpretation)),
                ("nativePath", Value::String(native_path)),
            ]),
        )?;
        validate_document(&target, rt, ctx)?;
        set(&mut result, "target", target)?;
    }
    validate(
        &result,
        &rt.nullability,
        ctx,
        "POSTGRESQL_NULLABILITY_RESULT",
    )?;
    Ok(result)
}
fn arr_mut_document_module(document: &mut Value, mi: usize) -> Result<&mut Value, EngineError> {
    get_mut(document, "modules")
        .and_then(|v| {
            if let Value::Array(a) = v {
                a.get_mut(mi)
            } else {
                None
            }
        })
        .ok_or_else(|| {
            error(
                "POSTGRESQL_NULLABILITY_TARGET",
                "/modules",
                "Selected module missing",
            )
        })
}
pub fn classify_nullability(
    source: &Value,
    request: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(ctx)?;
    classify_nullability_inner(source, request, &rt, ctx)
}
pub fn verify_nullability(
    receipt: &Value,
    current: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(ctx)?;
    validate(
        receipt,
        &rt.nullability,
        ctx,
        "POSTGRESQL_NULLABILITY_RECEIPT",
    )?;
    if text(receipt, "status") != Some(&u("classified")) {
        return Err(error(
            "POSTGRESQL_NULLABILITY_RECEIPT",
            "/status",
            "Expected complete classified receipt",
        ));
    }
    let expected = classify_nullability_inner(
        get(receipt, "source").ok_or_else(|| {
            error(
                "POSTGRESQL_NULLABILITY_RECEIPT",
                "/source",
                "Receipt source required",
            )
        })?,
        get(receipt, "request").ok_or_else(|| {
            error(
                "POSTGRESQL_NULLABILITY_RECEIPT",
                "/request",
                "Receipt request required",
            )
        })?,
        &rt,
        ctx,
    )?;
    if !equal(receipt, &expected, ctx)? {
        return Err(error(
            "POSTGRESQL_NULLABILITY_RECEIPT",
            "",
            "Receipt disagrees with retained source and selected binding",
        ));
    }
    if !equal(
        current,
        get(receipt, "target").ok_or_else(|| {
            error(
                "POSTGRESQL_NULLABILITY_RECEIPT",
                "/target",
                "Target required",
            )
        })?,
        ctx,
    )? {
        return Err(error(
            "POSTGRESQL_NULLABILITY_STALE",
            "/target",
            "Target changed after classification",
        ));
    }
    copy_json(receipt, ctx)
}
pub fn recover_nullability(
    receipt: &Value,
    current: &Value,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    let verified = verify_nullability(receipt, current, ctx)?;
    text(
        get(&verified, "request").ok_or_else(|| {
            error(
                "POSTGRESQL_NULLABILITY_RECEIPT",
                "/request",
                "Request required",
            )
        })?,
        "nativeSource",
    )
    .cloned()
    .ok_or_else(|| {
        error(
            "POSTGRESQL_NULLABILITY_RECEIPT",
            "/request/nativeSource",
            "Native source required",
        )
    })
}
