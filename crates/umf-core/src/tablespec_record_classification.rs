// SPDX-License-Identifier: MIT OR Apache-2.0
//! Atomic native-owned classification of a TableSpec table and its column members.
use crate::{
    context::{Context, Limits, ResourceProfile},
    engine::{Capabilities, Engine},
    error::EngineError,
    registry::Registry,
    schema::CompiledSchema,
    serialization::{self, Format},
    tablespec_adapter::TableSpecRuntime,
    value::{copy_json, Utf16, Value},
};
use std::sync::{Arc, OnceLock};

const RESULT_SCHEMA: &str =
    include_str!("../../../spec/core/tablespec-record-classification.schema.json");
const KIND_SCHEMA: &str = include_str!("../../../spec/core/kind-operation-v6.schema.json");
const RECOVERY: &str =
    "Source and native fragments retained; resolve conflict then recompute whole record classification";
const NATIVE_VERSION: &str = "647e8e566ad78b864282ec65c0b0b2237aa63084";
const SUBSET: &str =
    "Captured table defines named column members; contextual groups and execution remain native";

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
fn err(code: &str, path: &str, message: impl Into<String>) -> EngineError {
    EngineError::new(code, u(path), message.into())
}
fn read_json(s: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    serialization::read_json_value(&s.encode_utf16().collect::<Vec<_>>(), Format::Json, ctx)
}
fn set(v: &mut Value, k: &str, value: Value) -> Result<(), EngineError> {
    let Value::Object(fields) = v else {
        return Err(err("TABLESPEC_RECORD_TARGET", "", "Expected object"));
    };
    if let Some((_, old)) = fields.iter_mut().find(|(name, _)| name == &u(k)) {
        *old = value;
    } else {
        fields.push((u(k), value));
    }
    Ok(())
}
fn equal(a: &Value, b: &Value, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    fn canonical(value: &Value, ctx: &mut Context<'_>, depth: usize) -> Result<Value, EngineError> {
        if depth > ctx.limits().max_depth {
            return Err(err("LIMIT", "", "Canonicalization depth exceeded"));
        }
        match value {
            Value::Array(items) => {
                let mut out = Vec::with_capacity(items.len());
                for item in items {
                    ctx.charge_work(1, u(""))?;
                    out.push(canonical(item, ctx, depth + 1)?);
                }
                Ok(Value::Array(out))
            }
            Value::Object(fields) => {
                let mut out = Vec::with_capacity(fields.len());
                for (key, value) in fields {
                    ctx.charge_work(key.len().saturating_add(1), u(""))?;
                    out.push((key.clone(), canonical(value, ctx, depth + 1)?));
                }
                out.sort_by(|a, b| a.0.cmp(&b.0));
                Ok(Value::Object(out))
            }
            _ => copy_json(value, ctx),
        }
    }
    Ok(canonical(a, ctx, 0)? == canonical(b, ctx, 0)?)
}

struct Runtime {
    result: CompiledSchema,
    request: CompiledSchema,
}
fn runtime(engine: &Engine, ctx: &mut Context<'_>) -> Result<Arc<Runtime>, EngineError> {
    static CACHE: OnceLock<Arc<Runtime>> = OnceLock::new();
    if ctx.profile() == ResourceProfile::Cooperative && ctx.limits() == Limits::ordinary() {
        if let Some(value) = CACHE.get() {
            return Ok(Arc::clone(value));
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
    let request_schema = get(
        get(&schema, "properties").unwrap_or(&Value::Null),
        "request",
    )
    .ok_or_else(|| err("SCHEMA", "", "Record request schema missing"))?;
    let request = CompiledSchema::compile(request_schema, &resources, ctx)?;
    let ready = Arc::new(Runtime { result, request });
    if ctx.profile() == ResourceProfile::Cooperative && ctx.limits() == Limits::ordinary() {
        return Ok(crate::resource_cache::publish_completed(&CACHE, ready));
    }
    Ok(ready)
}
fn validate(
    value: &Value,
    schema: &CompiledSchema,
    ctx: &mut Context<'_>,
    code: &str,
) -> Result<(), EngineError> {
    if schema.validate(value, ctx)?.is_empty() {
        Ok(())
    } else {
        Err(err(
            code,
            "",
            "Value does not match the pinned TableSpec Record classification schema",
        ))
    }
}
fn block(
    status: &mut bool,
    residuals: &mut Vec<Value>,
    diagnostics: &mut Vec<Value>,
    code: &str,
    path: &Utf16,
    value: &Value,
    reason: &str,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    *status = true;
    residuals.push(obj(vec![
        ("path", Value::String(path.clone())),
        ("value", copy_json(value, ctx)?),
        ("reason", t(reason)),
        ("recovery", t(RECOVERY)),
    ]));
    diagnostics.push(obj(vec![
        ("code", t(code)),
        ("path", Value::String(path.clone())),
        ("message", t(reason)),
        ("severity", t("error")),
    ]));
    Ok(())
}

pub(crate) fn classify_table_spec_record(
    input: &Value,
    request_in: &Value,
    adapter: &TableSpecRuntime,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(engine, ctx)?;
    validate(request_in, &rt.request, ctx, "TABLESPEC_RECORD_REQUEST")?;
    let source = copy_json(input, ctx)?;
    let request = copy_json(request_in, ctx)?;
    let validation = adapter.inspect(&source, ctx)?;
    if !validation.valid || text(&source, "umf") != Some(&u("0.10.0")) {
        return Err(err(
            "TABLESPEC_RECORD_VERSION",
            "",
            "Valid current 0.10.0 envelope required",
        ));
    }
    let payload = get(
        get(&source, "extensions").unwrap_or(&Value::Null),
        "umf.tablespec",
    )
    .ok_or_else(|| {
        err(
            "TABLESPEC_RECORD_CAPTURE",
            "/extensions/umf.tablespec",
            "TableSpec capture required",
        )
    })?;
    if get(payload, "splitFiles").is_some() {
        adapter.export_bundle(&source, ctx)?;
    } else {
        adapter.export(&source, ctx)?;
    }
    let native = adapter.get_table(&source, ctx)?;
    let modules = array(&source, "modules")
        .ok_or_else(|| err("TABLESPEC_RECORD_SOURCE", "/modules", "Modules required"))?;
    let module_index = modules
        .iter()
        .position(|m| text(m, "id") == Some(&u("table")))
        .ok_or_else(|| {
            err(
                "TABLESPEC_RECORD_SOURCE",
                "/modules",
                "Table module required",
            )
        })?;
    let table_module = &modules[module_index];
    let elements = array(table_module, "elements").ok_or_else(|| {
        err(
            "TABLESPEC_RECORD_SOURCE",
            "/modules/elements",
            "Table elements required",
        )
    })?;
    let record_module = text(&request, "recordModule")
        .ok_or_else(|| {
            err(
                "TABLESPEC_RECORD_REQUEST",
                "/recordModule",
                "Module id required",
            )
        })?
        .clone();
    let record_id = text(&request, "recordId")
        .ok_or_else(|| {
            err(
                "TABLESPEC_RECORD_REQUEST",
                "/recordId",
                "Record id required",
            )
        })?
        .clone();
    let mode = text(&request, "mode")
        .ok_or_else(|| err("TABLESPEC_RECORD_REQUEST", "/mode", "Mode required"))?
        .clone();
    let mut result = obj(vec![
        ("operation", t("classify-tablespec-record")),
        ("version", t("1.0.0")),
        ("status", t("classified")),
        ("source", copy_json(&source, ctx)?),
        ("request", copy_json(&request, ctx)?),
        (
            "binding",
            obj(vec![
                ("id", t("umf.tablespec.record")),
                ("version", t("1.0.0")),
                ("nativeVersion", t(NATIVE_VERSION)),
                ("subset", t(SUBSET)),
            ]),
        ),
        ("mappings", Value::Array(Vec::new())),
        ("residuals", Value::Array(Vec::new())),
        ("diagnostics", Value::Array(Vec::new())),
    ]);
    let mut blocked = false;
    let mut residuals = Vec::new();
    let mut diagnostics = Vec::new();
    let mut authors = std::collections::BTreeMap::<Utf16, Value>::new();
    let modules = array(&source, "modules")
        .ok_or_else(|| err("TABLESPEC_RECORD_SOURCE", "/modules", "Modules required"))?;
    if modules
        .iter()
        .any(|m| text(m, "id") == Some(&record_module))
    {
        block(
            &mut blocked,
            &mut residuals,
            &mut diagnostics,
            "RECORD_IDENTITY_COLLISION",
            &u("/modules"),
            &Value::String(record_module.clone()),
            "Record module identity already exists; no merge or overwrite is implied",
            ctx,
        )?;
    }
    if let Some(request_authors) = array(&request, "authors") {
        for author in request_authors {
            let author_path = text(
                get(author, "provenance").unwrap_or(&Value::Null),
                "idealPath",
            )
            .cloned()
            .unwrap_or_else(|| u(""));
            match crate::core_kind::verify_core_kind_declaration(
                author, &source, engine, registry, caps, ctx,
            ) {
                Ok(verified) => {
                    let verified_identity = get(&verified, "identity").unwrap_or(&Value::Null);
                    let element_id = text(verified_identity, "element").cloned();
                    let valid_identity = text(verified_identity, "module") == Some(&u("table"))
                        && element_id.as_ref().is_some_and(|id| {
                            elements
                                .iter()
                                .any(|element| text(element, "id") == Some(id))
                        });
                    let key = element_id.unwrap_or_else(|| u(""));
                    if !valid_identity || authors.contains_key(&key) {
                        block(&mut blocked, &mut residuals, &mut diagnostics, "AUTHOR_IDENTITY", &author_path, author, "Author declaration is duplicated or does not identify a captured table member", ctx)?;
                    } else {
                        authors.insert(key, copy_json(author, ctx)?);
                    }
                }
                Err(error)
                    if error.is_control_failure()
                        || error.code == "LIMIT"
                        || error.code == "CAPACITY" =>
                {
                    return Err(error)
                }
                Err(error) => {
                    block(
                        &mut blocked,
                        &mut residuals,
                        &mut diagnostics,
                        "STALE_AUTHOR",
                        &author_path,
                        author,
                        &format!(
                            "Author declaration does not match current source: {}",
                            error.code
                        ),
                        ctx,
                    )?;
                }
            }
        }
    }
    let mut mappings = Vec::new();
    for (column, element) in elements.iter().enumerate() {
        let element_id = text(element, "id").cloned().ok_or_else(|| {
            err(
                "TABLESPEC_RECORD_SOURCE",
                "/modules/elements/id",
                "Column id required",
            )
        })?;
        let author = authors.get(&element_id);
        let field_request = if let Some(author) = author {
            obj(vec![
                ("column", Value::Number(column as f64)),
                ("mode", Value::String(mode.clone())),
                ("author", copy_json(author, ctx)?),
            ])
        } else {
            obj(vec![
                ("column", Value::Number(column as f64)),
                ("mode", Value::String(mode.clone())),
            ])
        };
        let field = crate::tablespec_field_classification::classify_table_spec_field(
            &source,
            &field_request,
            adapter,
            engine,
            registry,
            caps,
            ctx,
        )?;
        mappings.push(copy_json(
            get(&field, "mapping")
                .ok_or_else(|| err("TABLESPEC_RECORD_RESULT", "", "Field mapping missing"))?,
            ctx,
        )?);
        if let Some(field_residuals) = array(&field, "residuals") {
            for residual in field_residuals {
                let path = text(residual, "path").cloned().unwrap_or_else(|| u(""));
                let value = get(residual, "value").unwrap_or(&Value::Null);
                let reason = text(residual, "reason")
                    .and_then(|s| s.to_utf8().ok())
                    .unwrap_or_else(|| "Field membership is conflicted".to_owned());
                block(
                    &mut blocked,
                    &mut residuals,
                    &mut diagnostics,
                    "FIELD_KIND_CONFLICT",
                    &path,
                    value,
                    &reason,
                    ctx,
                )?;
            }
        }
    }
    let record_path = format!("/modules/{}/elements/0", modules.len());
    mappings.push(obj(vec![
        ("origin", t("classified")),
        ("kind", t("record")),
        ("idealPath", t(&format!("{record_path}/kind"))),
        ("nativePath", t("/extensions/umf.tablespec/root")),
        ("nativeFragment", copy_json(&native, ctx)?),
        ("basis", t("checked-native-table-members")),
        ("outcome", t(if blocked { "unknown" } else { "exact" })),
    ]));
    if blocked {
        set(&mut result, "status", t("blocked"))?;
    } else {
        let namespace = get(table_module, "namespace").ok_or_else(|| {
            err(
                "TABLESPEC_RECORD_SOURCE",
                "/modules/table/namespace",
                "Table namespace required",
            )
        })?;
        let mut target = copy_json(&source, ctx)?;
        let target_modules = get_mut(&mut target, "modules")
            .and_then(|v| {
                if let Value::Array(a) = v {
                    Some(a)
                } else {
                    None
                }
            })
            .ok_or_else(|| err("TABLESPEC_RECORD_TARGET", "/modules", "Modules required"))?;
        let target_table = target_modules.get_mut(module_index).ok_or_else(|| {
            err(
                "TABLESPEC_RECORD_TARGET",
                "/modules",
                "Table module missing",
            )
        })?;
        let target_elements = get_mut(target_table, "elements")
            .and_then(|v| {
                if let Value::Array(a) = v {
                    Some(a)
                } else {
                    None
                }
            })
            .ok_or_else(|| {
                err(
                    "TABLESPEC_RECORD_TARGET",
                    "/modules/elements",
                    "Table elements required",
                )
            })?;
        for element in target_elements {
            set(element, "kind", t("field"))?;
        }
        let mut references = Vec::with_capacity(elements.len());
        let mut member_request = Vec::with_capacity(elements.len());
        for element in elements {
            let id = text(element, "id").ok_or_else(|| {
                err(
                    "TABLESPEC_RECORD_SOURCE",
                    "/modules/elements/id",
                    "Column id required",
                )
            })?;
            references.push(obj(vec![
                ("role", t("member")),
                ("module", t("table")),
                ("element", Value::String(id.clone())),
            ]));
            member_request.push(obj(vec![
                ("module", t("table")),
                ("element", Value::String(id.clone())),
            ]));
        }
        target_modules.push(obj(vec![
            ("id", Value::String(record_module.clone())),
            ("namespace", copy_json(namespace, ctx)?),
            (
                "elements",
                Value::Array(vec![obj(vec![
                    ("id", Value::String(record_id.clone())),
                    ("name", copy_json(namespace, ctx)?),
                    ("kind", t("record")),
                    ("extensions", Value::Object(Vec::new())),
                    ("references", Value::Array(references)),
                ])]),
            ),
        ]));
        let identity = crate::core_kind::Identity {
            module: record_module.clone(),
            element: record_id.clone(),
        };
        let kind_receipt = crate::core_kind::declare_core_kind(
            &target, &identity, "record", engine, registry, caps, ctx,
        )
        .map_err(|error| {
            if error.is_control_failure() || error.code == "LIMIT" || error.code == "CAPACITY" {
                error
            } else {
                err(
                    "TABLESPEC_RECORD_TARGET",
                    "",
                    format!("Core Record declaration failed: {}", error.code),
                )
            }
        })?;
        let kind_target = get(&kind_receipt, "target")
            .ok_or_else(|| err("TABLESPEC_RECORD_TARGET", "", "Core Record target missing"))?;
        let identity_value = obj(vec![
            ("module", Value::String(record_module)),
            ("element", Value::String(record_id)),
        ]);
        let membership_receipt = crate::core_keys::declare_core_record_members(
            kind_target,
            &identity_value,
            &Value::Array(member_request),
            engine,
            registry,
            caps,
            ctx,
        )
        .map_err(|error| {
            if error.is_control_failure() || error.code == "LIMIT" || error.code == "CAPACITY" {
                error
            } else {
                err(
                    "TABLESPEC_RECORD_TARGET",
                    "",
                    format!("Core member declaration failed: {}", error.code),
                )
            }
        })?;
        let target = get(&membership_receipt, "target").ok_or_else(|| {
            err(
                "TABLESPEC_RECORD_TARGET",
                "",
                "Core membership target missing",
            )
        })?;
        if !adapter.inspect(target, ctx)?.valid {
            return Err(err(
                "TABLESPEC_RECORD_TARGET",
                "",
                "Classified Record target is invalid",
            ));
        }
        let target_payload = get(
            get(target, "extensions").unwrap_or(&Value::Null),
            "umf.tablespec",
        );
        if target_payload
            .and_then(|payload| get(payload, "splitFiles"))
            .is_some()
        {
            adapter.export_bundle(target, ctx)?;
        } else {
            adapter.export(target, ctx)?;
        }
        set(&mut result, "target", copy_json(target, ctx)?)?;
    }
    set(&mut result, "mappings", Value::Array(mappings))?;
    set(&mut result, "residuals", Value::Array(residuals))?;
    set(&mut result, "diagnostics", Value::Array(diagnostics))?;
    validate(&result, &rt.result, ctx, "TABLESPEC_RECORD_RESULT")?;
    Ok(result)
}

pub(crate) fn verify_table_spec_record_classification(
    receipt: &Value,
    current: &Value,
    adapter: &TableSpecRuntime,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(engine, ctx)?;
    validate(receipt, &rt.result, ctx, "TABLESPEC_RECORD_RECEIPT")?;
    if text(receipt, "status") != Some(&u("classified")) {
        return Err(err(
            "TABLESPEC_RECORD_RECEIPT",
            "/status",
            "Expected complete classified receipt",
        ));
    }
    let source = get(receipt, "source")
        .ok_or_else(|| err("TABLESPEC_RECORD_RECEIPT", "/source", "Source required"))?;
    let request = get(receipt, "request")
        .ok_or_else(|| err("TABLESPEC_RECORD_RECEIPT", "/request", "Request required"))?;
    let expected =
        classify_table_spec_record(source, request, adapter, engine, registry, caps, ctx)?;
    if !equal(receipt, &expected, ctx)? {
        return Err(err(
            "TABLESPEC_RECORD_RECEIPT",
            "",
            "Receipt differs from recomputed classification",
        ));
    }
    let target = get(receipt, "target")
        .ok_or_else(|| err("TABLESPEC_RECORD_RECEIPT", "/target", "Target required"))?;
    if !equal(current, target, ctx)? {
        return Err(err(
            "TABLESPEC_RECORD_STALE",
            "",
            "Current model changed since classification",
        ));
    }
    copy_json(receipt, ctx)
}
