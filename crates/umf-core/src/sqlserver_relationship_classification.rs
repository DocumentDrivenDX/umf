// SPDX-License-Identifier: MIT OR Apache-2.0
//! Native-owned observations of captured SQL Server foreign-key relationships.
//! Trust flags and tuple matches remain evidence, not authored relationship meaning.
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
use std::sync::{Arc, OnceLock};

const RESULT_SCHEMA: &str =
    include_str!("../../../spec/core/sqlserver-relationship-classification.schema.json");
const NATIVE_VERSION: &str = "16.0.4295.3";
const EXTENSION: &str = "umf.sqlserver.relationships";
const SUBSET: &str = "SQL Server 2022 captured FK observations and authored integral-key FK/junction new tables; no lifecycle/minimum or native equivalence inference";
const RECOVERY: &str =
    "Original native archive and unknown content recover exactly from verified receipt";

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
    if let Value::Object(fields) = v {
        fields
            .iter()
            .find(|(key, _)| key == &u(k))
            .map(|(_, value)| value)
    } else {
        None
    }
}
fn get_mut<'a>(v: &'a mut Value, k: &str) -> Option<&'a mut Value> {
    if let Value::Object(fields) = v {
        fields
            .iter_mut()
            .find(|(key, _)| key == &u(k))
            .map(|(_, value)| value)
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
        Some(Value::Array(xs)) => Some(xs),
        _ => None,
    }
}
fn boolv(v: &Value, k: &str) -> bool {
    matches!(get(v, k), Some(Value::Bool(true)))
}
fn number(v: &Value, k: &str) -> Option<u64> {
    let Value::Number(n) = get(v, k)? else {
        return None;
    };
    if n.is_finite() && *n >= 0.0 && n.fract() == 0.0 && *n <= 9_007_199_254_740_991.0 {
        Some(*n as u64)
    } else {
        None
    }
}
fn err(code: &str, path: &str, message: &str) -> EngineError {
    EngineError::new(code, u(path), message)
}
fn set(v: &mut Value, k: &str, n: Value) -> Result<(), EngineError> {
    let Value::Object(fields) = v else {
        return Err(err("SQLSERVER_RELATIONSHIP_TARGET", "", "Expected object"));
    };
    if let Some((_, old)) = fields.iter_mut().find(|(key, _)| key == &u(k)) {
        *old = n;
    } else {
        fields.push((u(k), n));
    }
    Ok(())
}
fn read_json(source: &Utf16, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    serialization::read_json_value(source.units(), Format::Json, ctx)
}
fn capture_value(tagged: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let kind = text(tagged, "kind").ok_or_else(|| {
        err(
            "SQLSERVER_RELATIONSHIP_CAPTURE",
            "",
            "Tagged capture node kind is required",
        )
    })?;
    match kind.to_utf8().ok().as_deref() {
        Some("null") => Ok(Value::Null),
        Some("boolean") => match get(tagged, "value") {
            Some(Value::Bool(value)) => Ok(Value::Bool(*value)),
            _ => Err(err(
                "SQLSERVER_RELATIONSHIP_CAPTURE",
                "",
                "Tagged boolean value is malformed",
            )),
        },
        Some("string") => match get(tagged, "value") {
            Some(Value::String(value)) => {
                ctx.charge_text(value.len(), Utf16::default())?;
                Ok(Value::String(value.clone()))
            }
            _ => Err(err(
                "SQLSERVER_RELATIONSHIP_CAPTURE",
                "",
                "Tagged string value is malformed",
            )),
        },
        Some("number") => match get(tagged, "value") {
            Some(Value::String(token)) => {
                ctx.charge_text(token.len(), Utf16::default())?;
                let text = token.to_utf8().map_err(|_| {
                    err(
                        "SQLSERVER_RELATIONSHIP_CAPTURE",
                        "",
                        "Tagged numeric token is not UTF-8",
                    )
                })?;
                let number = text.parse::<f64>().ok().filter(|n| {
                    n.is_finite() && n.fract() == 0.0 && n.abs() <= 9_007_199_254_740_991.0
                });
                if let Some(number) = number {
                    Ok(Value::Number(number))
                } else {
                    Ok(Value::String(token.clone()))
                }
            }
            _ => Err(err(
                "SQLSERVER_RELATIONSHIP_CAPTURE",
                "",
                "Tagged number value is malformed",
            )),
        },
        Some("array") => {
            let items = arr(tagged, "items").ok_or_else(|| {
                err(
                    "SQLSERVER_RELATIONSHIP_CAPTURE",
                    "",
                    "Tagged array items are malformed",
                )
            })?;
            ctx.charge_work(items.len(), Utf16::default())?;
            let mut out = Vec::with_capacity(items.len());
            for item in items {
                out.push(capture_value(item, ctx)?);
            }
            Ok(Value::Array(out))
        }
        Some("object") => {
            let Value::Object(members) = get(tagged, "members").ok_or_else(|| {
                err(
                    "SQLSERVER_RELATIONSHIP_CAPTURE",
                    "",
                    "Tagged object members are malformed",
                )
            })?
            else {
                return Err(err(
                    "SQLSERVER_RELATIONSHIP_CAPTURE",
                    "",
                    "Tagged object members are malformed",
                ));
            };
            ctx.charge_work(members.len(), Utf16::default())?;
            let mut out = Vec::with_capacity(members.len());
            for (key, value) in members {
                out.push((key.clone(), capture_value(value, ctx)?));
            }
            Ok(Value::Object(out))
        }
        _ => Err(err(
            "SQLSERVER_RELATIONSHIP_CAPTURE",
            "",
            "Unknown tagged SQL Server capture node kind",
        )),
    }
}
fn equal(a: &Value, b: &Value, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    fn canon(v: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
        match v {
            Value::Array(xs) => {
                let mut out = Vec::with_capacity(xs.len());
                for x in xs {
                    ctx.charge_work(1, Utf16::default())?;
                    out.push(canon(x, ctx)?);
                }
                Ok(Value::Array(out))
            }
            Value::Object(fields) => {
                let mut out = Vec::with_capacity(fields.len());
                for (k, v) in fields {
                    ctx.charge_work(k.len().saturating_add(1), Utf16::default())?;
                    out.push((k.clone(), canon(v, ctx)?));
                }
                out.sort_by(|a, b| a.0.cmp(&b.0));
                Ok(Value::Object(out))
            }
            _ => copy_json(v, ctx),
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
        if let Some(x) = CACHE.get() {
            return Ok(Arc::clone(x));
        }
    }
    let resources = engine.schema_resources_with_context(ctx)?;
    let schema = read_json(&u(RESULT_SCHEMA), ctx)?;
    let result = CompiledSchema::compile(&schema, &resources, ctx)?;
    let request_schema = get(
        get(&schema, "properties").unwrap_or(&Value::Null),
        "request",
    )
    .ok_or_else(|| err("SCHEMA", "", "request schema missing"))?;
    let request = CompiledSchema::compile(request_schema, &resources, ctx)?;
    let ready = Arc::new(Runtime { result, request });
    if ctx.profile() == crate::context::ResourceProfile::Cooperative
        && ctx.limits() == crate::context::Limits::ordinary()
    {
        return Ok(crate::resource_cache::publish_completed(&CACHE, ready));
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
            "Value does not match the pinned SQL Server Relationship classification schema",
        ))
    }
}
fn binding() -> Value {
    obj(vec![
        ("id", t(EXTENSION)),
        ("version", t("1.0.0")),
        ("nativeVersion", t(NATIVE_VERSION)),
        ("subset", t(SUBSET)),
    ])
}
fn loss(
    out: &mut Vec<Value>,
    path: &str,
    value: &Value,
    reason: &str,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    out.push(obj(vec![
        ("path", t(path)),
        ("value", copy_json(value, ctx)?),
        ("reason", t(reason)),
        ("outcome", t("unknown")),
        ("recovery", t(RECOVERY)),
    ]));
    Ok(())
}
fn native_id(module: &str, element: &Value) -> Option<Value> {
    text(element, "id").map(|id| {
        obj(vec![
            ("module", t(module)),
            ("element", Value::String(id.clone())),
        ])
    })
}
fn table_path(table: usize) -> String {
    format!("/tables/{table}")
}
fn field_path(table: usize, column: usize) -> String {
    format!("/tables/{table}/columns/{column}")
}
fn field_reference(columns: &[Value], path: &str) -> Option<Value> {
    columns
        .iter()
        .find(|c| text(c, "path").is_some_and(|p| p == &u(path)))
        .and_then(|c| get(c, "element"))
        .and_then(|e| native_id("sqlserver.columns", e))
}
fn classified_body(
    input: &Value,
    request: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(engine, ctx)?;
    validate(request, &rt.request, ctx, "SQLSERVER_RELATIONSHIP_REQUEST")?;
    let source = copy_json(input, ctx)?;
    let request = copy_json(request, ctx)?;
    let inspected = engine.validate_document(&source, registry, caps, ctx)?;
    if !inspected.valid || text(&source, "umf") != Some(&u("0.10.0")) {
        return Err(err(
            "SQLSERVER_RELATIONSHIP_SOURCE",
            "",
            "Valid current 0.10.0 envelope required",
        ));
    }
    let native_text = text(&request, "nativeSource").ok_or_else(|| {
        err(
            "SQLSERVER_RELATIONSHIP_REQUEST",
            "/nativeSource",
            "Native source required",
        )
    })?;
    let catalog = sqlserver::SqlServerCatalog::import(native_text, ctx)?;
    let exported = sqlserver::export_document(&source, ctx)?;
    let canonical_native = catalog.export(ctx)?;
    if canonical_native != exported {
        return Err(err(
            "SQLSERVER_RELATIONSHIP_ARCHIVE",
            "/nativeSource",
            "Native archive differs from retained catalog",
        ));
    }
    let capture_root = get(&source, "extensions")
        .and_then(|extensions| get(extensions, "umf.sqlserver"))
        .and_then(|capture| get(capture, "root"))
        .ok_or_else(|| {
            err(
                "SQLSERVER_RELATIONSHIP_CAPTURE",
                "/extensions/umf.sqlserver/root",
                "Retained tagged SQL Server capture root is required",
            )
        })?;
    let native = capture_value(capture_root, ctx)?;
    if !matches!(get(&native,"profile"),Some(Value::String(v)) if v==&u("sqlserver-catalog-v3"))
        || !matches!(get(&native,"state"),Some(Value::String(v)) if v==&u("captured"))
        || text(&native, "serverVersion") != Some(&u(NATIVE_VERSION))
    {
        return Err(err(
            "SQLSERVER_RELATIONSHIP_PROFILE",
            "/nativeSource",
            "Captured v3 catalog on SQL Server 16.0.4295.3 required",
        ));
    }
    let tables = arr(&native, "tables").ok_or_else(|| {
        err(
            "SQLSERVER_RELATIONSHIP_CORRELATION",
            "/tables",
            "Captured table inventory unavailable",
        )
    })?;
    let constraint_meta = sqlserver::constraint_metadata_value(&catalog, ctx)?;
    let column_meta = sqlserver::column_metadata_value(&catalog, ctx)?;
    let views = arr(&constraint_meta, "tables").ok_or_else(|| {
        err(
            "SQLSERVER_RELATIONSHIP_CORRELATION",
            "/tables",
            "Constraint metadata unavailable",
        )
    })?;
    let columns = match &column_meta {
        Value::Array(xs) => xs.as_slice(),
        _ => {
            return Err(err(
                "SQLSERVER_RELATIONSHIP_CORRELATION",
                "/columns",
                "Column metadata unavailable",
            ))
        }
    };
    let mut result = obj(vec![
        ("operation", t("classify-sqlserver-relationships")),
        ("version", t("1.0.0")),
        ("status", t("classified")),
        ("source", copy_json(&source, ctx)?),
        ("request", copy_json(&request, ctx)?),
        ("binding", binding()),
        ("observations", Value::Array(vec![])),
        ("residuals", Value::Array(vec![])),
        ("diagnostics", Value::Array(vec![])),
    ]);
    let mut observations = Vec::new();
    let mut residuals = Vec::new();
    let mut blocked = false;
    loss(&mut residuals,"/nativeSource",get(&request,"nativeSource").unwrap_or(&Value::Null),"All unclaimed native catalog refinements remain retained; capture is permission-limited and not authenticated live state",ctx)?;
    for (ti, table) in tables.iter().enumerate() {
        ctx.charge_work(1, u(&table_path(ti)))?;
        let view = views.get(ti).ok_or_else(|| {
            err(
                "SQLSERVER_RELATIONSHIP_CORRELATION",
                "/tables",
                "Constraint table metadata missing",
            )
        })?;
        let table_path_value = table_path(ti);
        let foreign_available = matches!(
            get(view, "available").and_then(|x| get(x, "foreign_keys")),
            Some(Value::Bool(true))
        );
        if !foreign_available {
            blocked = true;
            loss(
                &mut residuals,
                &table_path_value,
                table,
                "FK inventory unavailable; absence is not an empty inventory",
                ctx,
            )?;
            continue;
        }
        let foreign_keys = arr(table, "foreign_keys").unwrap_or(&[]);
        let view_foreign_keys = arr(view, "foreign_keys").unwrap_or(&[]);
        if foreign_keys.len() != view_foreign_keys.len() {
            return Err(err(
                "SQLSERVER_RELATIONSHIP_CORRELATION",
                &table_path_value,
                "Native and derived FK inventories disagree",
            ));
        }
        for (fi, fk) in foreign_keys.iter().enumerate() {
            ctx.charge_work(1, u(&format!("{table_path_value}/foreign_keys/{fi}")))?;
            let path = format!("{table_path_value}/foreign_keys/{fi}");
            let schema = text(fk, "referenced_schema").cloned().unwrap_or_default();
            let target_name = text(fk, "referenced_table").cloned().unwrap_or_default();
            let target_index = tables.iter().position(|candidate| {
                text(candidate, "schema") == Some(&schema)
                    && text(candidate, "name") == Some(&target_name)
            });
            let target = target_index.and_then(|i| tables.get(i));
            let source_columns = arr(fk, "columns").unwrap_or(&[]);
            ctx.charge_work(source_columns.len(), u(&path))?;
            let mut ordered: Vec<&Value> = source_columns.iter().collect();
            ordered.sort_by_key(|col| number(col, "ordinal").unwrap_or(u64::MAX));
            let mut source_fields = Vec::new();
            let mut target_fields = Vec::new();
            let mut resolved = !ordered.is_empty() && target.is_some();
            for (index, col) in ordered.iter().enumerate() {
                if number(col, "ordinal") != Some(index as u64 + 1) {
                    return Err(err(
                        "SQLSERVER_RELATIONSHIP_CORRELATION",
                        &path,
                        "FK ordinals must be contiguous",
                    ));
                }
                let column_id = number(col, "column_id");
                let column_name = text(col, "column_name");
                let source_index = arr(table, "columns").unwrap_or(&[]).iter().position(|c| {
                    number(c, "column_id") == column_id && text(c, "name") == column_name
                });
                let Some(source_index) = source_index else {
                    return Err(err(
                        "SQLSERVER_RELATIONSHIP_CORRELATION",
                        &path,
                        "FK source column does not match captured identity",
                    ));
                };
                let source_ref = field_reference(columns, &field_path(ti, source_index))
                    .ok_or_else(|| {
                        err(
                            "SQLSERVER_RELATIONSHIP_CORRELATION",
                            "/columns",
                            "Missing copied source Field",
                        )
                    })?;
                source_fields.push(source_ref);
                if let (Some(target), Some(target_index)) = (target, target_index) {
                    let target_column_id = number(col, "referenced_column_id");
                    let target_column_name = text(col, "referenced_column_name");
                    let target_columns = arr(target, "columns").unwrap_or(&[]);
                    let target_column_index = target_columns.iter().position(|c| {
                        number(c, "column_id") == target_column_id
                            && text(c, "name") == target_column_name
                    });
                    let Some(target_column_index) = target_column_index else {
                        return Err(err(
                            "SQLSERVER_RELATIONSHIP_CORRELATION",
                            &path,
                            "FK target column does not match captured identity",
                        ));
                    };
                    let target_ref =
                        field_reference(columns, &field_path(target_index, target_column_index))
                            .ok_or_else(|| {
                                err(
                                    "SQLSERVER_RELATIONSHIP_CORRELATION",
                                    "/columns",
                                    "Missing copied target Field",
                                )
                            })?;
                    target_fields.push(target_ref);
                    let left = &arr(table, "columns").unwrap()[source_index];
                    let right = &target_columns[target_column_index];
                    for property in [
                        "system_type_id",
                        "user_type_id",
                        "type_schema",
                        "type_name",
                        "base_type_name",
                        "is_user_defined",
                        "is_assembly_type",
                        "max_length",
                        "precision",
                        "scale",
                        "collation_name",
                    ] {
                        if get(left, property) != get(right, property) {
                            resolved = false;
                        }
                    }
                }
            }
            let mut referenced_keys = Vec::new();
            let mut active_key_candidate = false;
            if let Some(target) = target {
                let keys = arr(target, "keys").unwrap_or(&[]);
                let target_view = views.get(target_index.unwrap()).ok_or_else(|| {
                    err(
                        "SQLSERVER_RELATIONSHIP_CORRELATION",
                        "/tables",
                        "Target constraint metadata missing",
                    )
                })?;
                let view_keys = arr(target_view, "keys").unwrap_or(&[]);
                for (ki, key) in keys.iter().enumerate() {
                    ctx.charge_work(
                        1,
                        u(&format!("/tables/{}/keys/{ki}", target_index.unwrap())),
                    )?;
                    let key_columns = arr(key, "columns").unwrap_or(&[]);
                    ctx.charge_work(
                        key_columns.len(),
                        u(&format!(
                            "/tables/{}/keys/{ki}/columns",
                            target_index.unwrap()
                        )),
                    )?;
                    let mut tuple: Vec<&Value> = key_columns.iter().collect();
                    tuple.sort_by_key(|column| number(column, "key_ordinal").unwrap_or(u64::MAX));
                    let matches = tuple.len() == ordered.len()
                        && tuple.iter().zip(ordered.iter()).all(|(k, fk)| {
                            number(k, "column_id") == number(fk, "referenced_column_id")
                                && text(k, "name") == text(fk, "referenced_column_name")
                        });
                    if matches {
                        let native_key = view_keys.get(ki).ok_or_else(|| {
                            err(
                                "SQLSERVER_RELATIONSHIP_CORRELATION",
                                "/tables",
                                "Missing copied target Key",
                            )
                        })?;
                        referenced_keys.push(obj(vec![
                            (
                                "path",
                                t(&format!("/tables/{}/keys/{ki}", target_index.unwrap())),
                            ),
                            ("nativeKey", copy_json(native_key, ctx)?),
                        ]));
                        if !boolv(key, "is_disabled") {
                            active_key_candidate = true;
                        }
                    }
                }
            }
            if !active_key_candidate {
                resolved = false;
            }
            let delete = text(fk, "delete_action").cloned().ok_or_else(|| {
                err(
                    "SQLSERVER_RELATIONSHIP_CORRELATION",
                    &path,
                    "FK delete action is unavailable",
                )
            })?;
            let update = text(fk, "update_action").cloned().ok_or_else(|| {
                err(
                    "SQLSERVER_RELATIONSHIP_CORRELATION",
                    &path,
                    "FK update action is unavailable",
                )
            })?;
            let known_action = |action: &Utf16| {
                ["NO_ACTION", "CASCADE", "SET_NULL", "SET_DEFAULT"]
                    .iter()
                    .any(|candidate| action == &u(candidate))
            };
            let known_actions = known_action(&delete) && known_action(&update);
            let enforcement = if boolv(fk, "is_disabled") {
                "disabled"
            } else if !known_actions || !resolved {
                "unknown"
            } else if boolv(fk, "is_not_trusted") {
                "enabled-untrusted"
            } else {
                "enabled-trusted"
            };
            let native_fk = view_foreign_keys.get(fi).ok_or_else(|| {
                err(
                    "SQLSERVER_RELATIONSHIP_CORRELATION",
                    &path,
                    "Missing copied native FK",
                )
            })?;
            observations.push(obj(vec![
                ("nativePath", t(&path)),
                (
                    "table",
                    obj(vec![
                        (
                            "schema",
                            copy_json(get(table, "schema").unwrap_or(&Value::Null), ctx)?,
                        ),
                        (
                            "name",
                            copy_json(get(table, "name").unwrap_or(&Value::Null), ctx)?,
                        ),
                    ]),
                ),
                (
                    "name",
                    copy_json(get(fk, "name").unwrap_or(&Value::Null), ctx)?,
                ),
                ("nativeForeignKey", copy_json(native_fk, ctx)?),
                ("referencedKeys", Value::Array(referenced_keys)),
                ("sourceFields", Value::Array(source_fields)),
                ("targetFields", Value::Array(target_fields)),
                ("enforcement", t(enforcement)),
                ("authorIntent", t("unknown")),
                ("provenance", t("inferred")),
                ("deleteAction", Value::String(delete)),
                ("updateAction", Value::String(update)),
                (
                    "notForReplication",
                    Value::Bool(boolv(fk, "is_not_for_replication")),
                ),
                (
                    "resolution",
                    t(if resolved {
                        "captured-tuple-candidate"
                    } else {
                        "unresolved"
                    }),
                ),
            ]));
            loss(&mut residuals,&path,native_fk,"Native actions/trust/replication exceptions and nullable-composite bypass remain native; FK does not establish lifecycle, participation minima or authored stable identity. Matching captured Keys are tuple candidates, not authenticated comparator or Key identity proofs; unequal captured type/collation refinements produce unknown enforcement, and key_index_id is not captured",ctx)?;
        }
    }
    let existing_extension = get(&source, "extensions").and_then(|x| get(x, EXTENSION));
    if let Some(existing) = existing_extension {
        blocked = true;
        loss(
            &mut residuals,
            "/extensions/umf.sqlserver.relationships",
            existing,
            "Existing observations cannot be overwritten",
            ctx,
        )?;
    }
    if let Some(vocab) = get(&source, "vocabularies").and_then(|x| get(x, EXTENSION)) {
        if text(vocab, "version") != Some(&u("1.0.0")) {
            blocked = true;
            loss(
                &mut residuals,
                "/vocabularies/umf.sqlserver.relationships",
                vocab,
                "Unsupported classification vocabulary",
                ctx,
            )?;
        }
    }
    let strict = text(&request, "mode") == Some(&u("strict"));
    if blocked || strict {
        set(&mut result, "status", t("blocked"))?;
    } else {
        let mut target = copy_json(&source, ctx)?;
        if get(&target, "vocabularies").is_none() {
            set(&mut target, "vocabularies", Value::Object(vec![]))?;
        }
        let vocab = get_mut(&mut target, "vocabularies").ok_or_else(|| {
            err(
                "SQLSERVER_RELATIONSHIP_TARGET",
                "/vocabularies",
                "Expected object",
            )
        })?;
        if get(vocab, EXTENSION).is_none() {
            let mut version = obj(vec![("version", t("1.0.0"))]);
            set(vocab, EXTENSION, version)?;
        }
        if get(&target, "extensions").is_none() {
            set(&mut target, "extensions", Value::Object(vec![]))?;
        }
        ctx.charge_work(observations.len(), u("/observations"))?;
        let mut target_observations = Vec::with_capacity(observations.len());
        for observation in &observations {
            target_observations.push(copy_json(observation, ctx)?);
        }
        let mut extension = obj(vec![
            ("origin", t("classified")),
            ("binding", binding()),
            ("observations", Value::Array(target_observations)),
        ]);
        let extensions = get_mut(&mut target, "extensions").ok_or_else(|| {
            err(
                "SQLSERVER_RELATIONSHIP_TARGET",
                "/extensions",
                "Expected object",
            )
        })?;
        set(extensions, EXTENSION, extension)?;
        set(&mut result, "target", target)?;
    }
    let severity = if blocked || strict {
        "error"
    } else {
        "warning"
    };
    let mut diagnostics = Vec::with_capacity(residuals.len());
    for residual in &residuals {
        diagnostics.push(obj(vec![
            ("code", t("SQLSERVER_RELATIONSHIP_RESIDUAL")),
            (
                "path",
                copy_json(
                    get(residual, "path").ok_or_else(|| {
                        err(
                            "SQLSERVER_RELATIONSHIP_RESULT",
                            "/residuals",
                            "Residual path missing",
                        )
                    })?,
                    ctx,
                )?,
            ),
            (
                "message",
                copy_json(
                    get(residual, "reason").ok_or_else(|| {
                        err(
                            "SQLSERVER_RELATIONSHIP_RESULT",
                            "/residuals",
                            "Residual reason missing",
                        )
                    })?,
                    ctx,
                )?,
            ),
            ("severity", t(severity)),
        ]));
    }
    set(&mut result, "observations", Value::Array(observations))?;
    set(&mut result, "residuals", Value::Array(residuals))?;
    set(&mut result, "diagnostics", Value::Array(diagnostics))?;
    validate(&result, &rt.result, ctx, "SQLSERVER_RELATIONSHIP_RESULT")?;
    Ok(result)
}
pub fn classify(
    input: &Value,
    request: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    classified_body(input, request, engine, registry, caps, ctx)
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
    validate(receipt, &rt.result, ctx, "SQLSERVER_RELATIONSHIP_RECEIPT")?;
    if text(receipt, "status") != Some(&u("classified")) {
        return Err(err(
            "SQLSERVER_RELATIONSHIP_RECEIPT",
            "/status",
            "Expected complete classified receipt",
        ));
    }
    let source = get(receipt, "source").ok_or_else(|| {
        err(
            "SQLSERVER_RELATIONSHIP_RECEIPT",
            "/source",
            "Source required",
        )
    })?;
    let request = get(receipt, "request").ok_or_else(|| {
        err(
            "SQLSERVER_RELATIONSHIP_RECEIPT",
            "/request",
            "Request required",
        )
    })?;
    let expected = classified_body(source, request, engine, registry, caps, ctx)?;
    if !equal(receipt, &expected, ctx)? {
        return Err(err(
            "SQLSERVER_RELATIONSHIP_RECEIPT",
            "",
            "Classification disagrees with retained native source",
        ));
    }
    let target = get(receipt, "target").ok_or_else(|| {
        err(
            "SQLSERVER_RELATIONSHIP_RECEIPT",
            "/target",
            "Target required",
        )
    })?;
    if !equal(current, target, ctx)? {
        return Err(err(
            "SQLSERVER_RELATIONSHIP_STALE",
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
        get(&checked, "request").ok_or_else(|| {
            err(
                "SQLSERVER_RELATIONSHIP_RECEIPT",
                "/request",
                "Request required",
            )
        })?,
        "nativeSource",
    )
    .cloned()
    .ok_or_else(|| {
        err(
            "SQLSERVER_RELATIONSHIP_RECEIPT",
            "/request/nativeSource",
            "Native source required",
        )
    })
}
