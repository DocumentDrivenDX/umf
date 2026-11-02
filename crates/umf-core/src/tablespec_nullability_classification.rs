// SPDX-License-Identifier: MIT OR Apache-2.0
//! Native-owned classification of declared TableSpec nullability.
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
    include_str!("../../../spec/core/tablespec-nullability-classification.schema.json");
const NULLABILITY_SCHEMA: &str =
    include_str!("../../../spec/core/nullability-operation-v5.schema.json");
const RECOVERY: &str = "Retain the complete source and native archive; unknown native meaning is not replaced by the core label";
const NATIVE_VERSION: &str = "647e8e566ad78b864282ec65c0b0b2237aa63084";
const SUBSET: &str = "Declared nullable metadata in an explicitly selected profile/context; explicit null-value carrier; no omitted-member or native enforcement equivalence";
const BASIS: &str =
    "Native declaration under selected profile and context; not runtime coercion or row validation";

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
fn array<'a>(v: &'a Value, k: &str) -> Option<&'a [Value]> {
    match get(v, k) {
        Some(Value::Array(a)) => Some(a),
        _ => None,
    }
}
fn text<'a>(v: &'a Value, k: &str) -> Option<&'a Utf16> {
    match get(v, k) {
        Some(Value::String(s)) => Some(s),
        _ => None,
    }
}
fn has(v: &Value, k: &str) -> bool {
    matches!(v,Value::Object(m) if m.iter().any(|(n,_)|n==&u(k)))
}
fn set(v: &mut Value, k: &str, n: Value) -> Result<(), EngineError> {
    let Value::Object(m) = v else {
        return Err(err("TABLESPEC_NULLABILITY_TARGET", "", "Expected object"));
    };
    if let Some((_, old)) = m.iter_mut().find(|(x, _)| x == &u(k)) {
        *old = n
    } else {
        m.push((u(k), n))
    }
    Ok(())
}
fn err(code: &str, path: &str, message: impl Into<String>) -> EngineError {
    EngineError::new(code, u(path), message.into())
}
fn read_json(s: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let units = s.encode_utf16().collect::<Vec<_>>();
    ctx.charge_text(units.len(), u(""))?;
    serialization::read_json_value(&units, Format::Json, ctx)
}
fn equal(a: &Value, b: &Value, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    fn canonical(v: &Value, ctx: &mut Context<'_>, depth: usize) -> Result<Value, EngineError> {
        if depth > ctx.limits().max_depth {
            return Err(err("LIMIT", "", "Canonicalization depth exceeded"));
        }
        match v {
            Value::Array(a) => {
                let mut o = Vec::with_capacity(a.len());
                for x in a {
                    ctx.charge_work(1, u(""))?;
                    o.push(canonical(x, ctx, depth + 1)?)
                }
                Ok(Value::Array(o))
            }
            Value::Object(m) => {
                let mut o = Vec::with_capacity(m.len());
                for (k, v) in m {
                    ctx.charge_work(k.len().saturating_add(1), u(""))?;
                    o.push((k.clone(), canonical(v, ctx, depth + 1)?))
                }
                o.sort_by(|a, b| a.0.cmp(&b.0));
                Ok(Value::Object(o))
            }
            _ => copy_json(v, ctx),
        }
    }
    Ok(canonical(a, ctx, 0)? == canonical(b, ctx, 0)?)
}
struct Runtime {
    result: CompiledSchema,
    request: CompiledSchema,
}
fn native_json_schema(ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let mut schema = read_json(
        include_str!("../../../spec/core/native-json.schema.json"),
        ctx,
    )?;
    let Value::Object(fields) = &mut schema else {
        return Err(err(
            "SCHEMA",
            "",
            "Pinned native-json schema must be an object",
        ));
    };
    ctx.charge_work(fields.len(), u(""))?;
    fields.retain(|(name, _)| name != &u("example"));
    Ok(schema)
}
fn runtime(engine: &Engine, ctx: &mut Context<'_>) -> Result<Arc<Runtime>, EngineError> {
    static CACHE: OnceLock<Arc<Runtime>> = OnceLock::new();
    if ctx.profile() == ResourceProfile::Cooperative && ctx.limits() == Limits::ordinary() {
        if let Some(v) = CACHE.get() {
            return Ok(Arc::clone(v));
        }
    }
    ctx.charge_work(1, u(""))?;
    let mut resources = engine.schema_resources_with_context(ctx)?;
    resources.entries.push((
        u("urn:umf:core:nullability-operation:5.0.0"),
        read_json(NULLABILITY_SCHEMA, ctx)?,
    ));
    resources
        .entries
        .push((u("urn:umf:native-json:0.1.0"), native_json_schema(ctx)?));
    let schema = read_json(RESULT_SCHEMA, ctx)?;
    let result = CompiledSchema::compile(&schema, &resources, ctx)?;
    let req = get(
        get(&schema, "properties").unwrap_or(&Value::Null),
        "request",
    )
    .ok_or_else(|| err("SCHEMA", "", "Nullability request schema missing"))?;
    let request = CompiledSchema::compile(req, &resources, ctx)?;
    let ready = Arc::new(Runtime { result, request });
    if ctx.profile() == ResourceProfile::Cooperative && ctx.limits() == Limits::ordinary() {
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
            "Value does not match pinned TableSpec Nullability classification schema",
        ))
    }
}
fn archive(
    source: &Value,
    adapter: &TableSpecRuntime,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let payload = get(
        get(source, "extensions").unwrap_or(&Value::Null),
        "umf.tablespec",
    )
    .ok_or_else(|| {
        err(
            "TABLESPEC_NULLABILITY_CAPTURE",
            "/extensions/umf.tablespec",
            "TableSpec capture required",
        )
    })?;
    if get(payload, "splitFiles").is_some() {
        adapter.export_bundle(source, ctx)
    } else {
        Ok(Value::String(adapter.export(source, ctx)?))
    }
}
fn loss(
    path: Utf16,
    value: &Value,
    reason: &str,
    residuals: &mut Vec<Value>,
    diagnostics: &mut Vec<Value>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    residuals.push(obj(vec![
        ("path", Value::String(path.clone())),
        ("value", copy_json(value, ctx)?),
        ("reason", t(reason)),
        ("recovery", t(RECOVERY)),
    ]));
    diagnostics.push(obj(vec![
        ("code", t("TABLESPEC_NULLABILITY_UNRESOLVED")),
        ("path", Value::String(path)),
        ("message", t(reason)),
        ("severity", t("warning")),
    ]));
    Ok(())
}
fn native_member<'a>(column: &'a Value, name: &str) -> Option<&'a Value> {
    get(get(column, "members")?, name)
}
fn control_error(e: &EngineError) -> bool {
    e.is_control_failure() || e.code == "LIMIT" || e.code == "CAPACITY"
}

fn get_key<'a>(value: &'a Value, key: &Utf16) -> Option<&'a Value> {
    match value {
        Value::Object(fields) => fields
            .iter()
            .find(|(name, _)| name == key)
            .map(|(_, value)| value),
        _ => None,
    }
}
fn pointer_segment(value: &Utf16) -> Utf16 {
    let mut out = Vec::with_capacity(value.len());
    for unit in value.units() {
        match *unit {
            0x007e => out.extend([0x007e, 0x0030]),
            0x002f => out.extend([0x007e, 0x0031]),
            other => out.push(other),
        }
    }
    Utf16::new(out)
}
fn native_boolean(node: Option<&Value>) -> Option<bool> {
    let node = node?;
    if text(node, "kind") != Some(&u("boolean")) {
        return None;
    }
    match get(node, "value") {
        Some(Value::Bool(value)) => Some(*value),
        _ => None,
    }
}
pub(crate) fn classify_table_spec_nullability(
    input: &Value,
    request_in: &Value,
    adapter: &TableSpecRuntime,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(engine, ctx)?;
    validate(
        request_in,
        &rt.request,
        ctx,
        "TABLESPEC_NULLABILITY_REQUEST",
    )?;
    let source = copy_json(input, ctx)?;
    let request = copy_json(request_in, ctx)?;
    let validation = adapter.inspect(&source, ctx)?;
    if !validation.valid || text(&source, "umf") != Some(&u("0.10.0")) {
        return Err(err(
            "TABLESPEC_NULLABILITY_SOURCE",
            "",
            "Valid core 0.10.0 TableSpec document required; migrate explicitly",
        ));
    }
    let _archive = archive(&source, adapter, ctx)?;
    let column_index = match get(&request, "column") {
        Some(Value::Number(n))
            if n.is_finite() && *n >= 0.0 && n.fract() == 0.0 && *n <= 9_007_199_254_740_991.0 =>
        {
            *n as usize
        }
        _ => {
            return Err(err(
                "TABLESPEC_NULLABILITY_REQUEST",
                "/column",
                "Expected nonnegative safe integer",
            ))
        }
    };
    let native = adapter.get_column(&source, column_index, ctx)?;
    if text(&native, "kind") != Some(&u("object")) {
        return Err(err(
            "TABLESPEC_NULLABILITY_COLUMN",
            "/column",
            "Expected native column object",
        ));
    }
    let modules = array(&source, "modules").ok_or_else(|| {
        err(
            "TABLESPEC_NULLABILITY_SOURCE",
            "/modules",
            "Modules required",
        )
    })?;
    let mi = modules
        .iter()
        .position(|m| text(m, "id") == Some(&u("table")))
        .ok_or_else(|| {
            err(
                "TABLESPEC_NULLABILITY_SOURCE",
                "/modules",
                "Table module required",
            )
        })?;
    let elements = array(&modules[mi], "elements").ok_or_else(|| {
        err(
            "TABLESPEC_NULLABILITY_SOURCE",
            "/modules/elements",
            "Table elements required",
        )
    })?;
    let element = elements.get(column_index).ok_or_else(|| {
        err(
            "TABLESPEC_NULLABILITY_COLUMN",
            "/column",
            "Column index does not exist",
        )
    })?;
    let profile = text(&request, "profile").ok_or_else(|| {
        err(
            "TABLESPEC_NULLABILITY_REQUEST",
            "/profile",
            "Profile required",
        )
    })?;
    let context = get(&request, "context").ok_or_else(|| {
        err(
            "TABLESPEC_NULLABILITY_REQUEST",
            "/context",
            "Context required",
        )
    })?;
    let context_text = match context {
        Value::String(s) => Some(s),
        Value::Null => None,
        _ => {
            return Err(err(
                "TABLESPEC_NULLABILITY_REQUEST",
                "/context",
                "Expected string or null",
            ))
        }
    };
    let carrier = text(&request, "carrier").ok_or_else(|| {
        err(
            "TABLESPEC_NULLABILITY_REQUEST",
            "/carrier",
            "Carrier required",
        )
    })?;
    let mode = text(&request, "mode")
        .ok_or_else(|| err("TABLESPEC_NULLABILITY_REQUEST", "/mode", "Mode required"))?;
    let ideal = u(&format!(
        "/modules/{mi}/elements/{column_index}/nullability"
    ));
    let base = u(&format!(
        "/extensions/umf.tablespec/root/members/columns/items/{column_index}/members/nullable"
    ));
    let mut selected = native_member(&native, "nullable");
    let mut native_path = base.clone();
    let mut nullability = "unspecified";
    let mut interpretation = "unknown";
    let mut outcome = "unknown";
    let mut reason: Option<String> = None;
    let declared = if profile == &u("unresolved") {
        reason = Some(
            "No native profile selected; schema/runtime disagreement remains unresolved".to_owned(),
        );
        None
    } else if carrier == &u("unresolved") {
        reason = Some(
            "No explicit absence carrier selected; null and omission are not equated".to_owned(),
        );
        None
    } else if selected.is_none() || text(selected.unwrap(), "kind") == Some(&u("null")) {
        reason = Some("Missing/null nullable metadata is not an availability declaration; native helper defaults are not inferred".to_owned());
        None
    } else if text(selected.unwrap(), "kind") == Some(&u("boolean")) {
        if profile == &u("checked-schema") {
            reason = Some(
                "Checked-in schema rejects scalar booleans; select the runtime profile explicitly"
                    .to_owned(),
            );
            interpretation = "unsupported";
            None
        } else {
            native_boolean(selected)
        }
    } else if text(selected.unwrap(), "kind") == Some(&u("object")) {
        if let Some(context) = context_text {
            let mut path = native_path.into_units();
            path.extend(u("/members/").into_units());
            path.extend(pointer_segment(context).into_units());
            native_path = Utf16::new(path);
            let value = get_key(
                get(selected.unwrap(), "members").unwrap_or(&Value::Null),
                context,
            );
            selected = value;
            if value.is_none() || text(value.unwrap(), "kind") == Some(&u("null")) {
                reason = Some("Selected context has no declared boolean; no default context or permissive default is inferred".to_owned());
                None
            } else if native_boolean(value).is_none() {
                reason = Some("Selected context value is not an exact boolean; native truthiness is not ideal meaning".to_owned());
                interpretation = "unsupported";
                None
            } else {
                native_boolean(value)
            }
        } else {
            reason = Some("Context map requires a selected context; aggregate truthiness is not a context resolver".to_owned());
            None
        }
    } else {
        reason = Some("Native scalar coercion or unsupported nullable shape is not an exact boolean declaration".to_owned());
        interpretation = "unsupported";
        None
    };
    if let Some(value) = declared {
        nullability = if value { "absent-allowed" } else { "required" };
        interpretation = "declared";
        outcome = "exact";
    }
    let mut residuals = Vec::new();
    let mut diagnostics = Vec::new();
    if let Some(reason) = reason.as_deref() {
        loss(
            native_path.clone(),
            selected.unwrap_or(&Value::Null),
            reason,
            &mut residuals,
            &mut diagnostics,
            ctx,
        )?;
        if interpretation == "unsupported" {
            outcome = "not-expressible";
        }
    }
    let mut conflict: Option<String> = None;
    if text(element, "kind") != Some(&u("field")) {
        conflict = Some("Selected native member must already be an explicit Field; this operation does not replace its kind".to_owned());
    }
    if let Some(author) = get(&request, "author") {
        match crate::nullability::verify_core_nullability_declaration(
            author, &source, engine, registry, caps, ctx,
        ) {
            Ok(verified) => {
                let id = get(&verified, "identity").unwrap_or(&Value::Null);
                let provenance = get(&verified, "provenance").unwrap_or(&Value::Null);
                if text(id, "module") != Some(&u("table"))
                    || text(id, "element") != text(element, "id")
                {
                    conflict = Some("Author receipt identifies a different member".to_owned());
                } else if text(provenance, "nullability") != Some(&u(nullability)) {
                    conflict = Some("Authored availability differs from the native observation; neither assertion may be overwritten".to_owned());
                }
            }
            Err(e) if control_error(&e) => return Err(e),
            Err(e) => conflict = Some(format!("Author provenance is invalid or stale: {}", e.code)),
        }
    } else if has(element, "nullability") {
        conflict = Some("Existing availability requires verified author provenance before native classification".to_owned());
    }
    if has(
        get(element, "extensions").unwrap_or(&Value::Null),
        "umf.tablespec.nullability",
    ) {
        conflict = Some(
            "Existing binding scope cannot be overwritten; reclassify from its retained source"
                .to_owned(),
        );
    }
    let vocab = get(
        get(&source, "vocabularies").unwrap_or(&Value::Null),
        "umf.tablespec.nullability",
    );
    if vocab
        .and_then(|v| text(v, "version"))
        .is_some_and(|v| v != &u("1.0.0"))
    {
        conflict = Some("Existing binding vocabulary version is incompatible".to_owned());
    }
    let has_conflict = conflict.is_some();
    if let Some(reason) = conflict {
        let value = get(element, "nullability").unwrap_or(&Value::Null);
        loss(
            ideal.clone(),
            value,
            &reason,
            &mut residuals,
            &mut diagnostics,
            ctx,
        )?;
        outcome = "unknown";
    }
    let blocked = has_conflict || mode == &u("strict") && !residuals.is_empty();
    for diagnostic in &mut diagnostics {
        set(
            diagnostic,
            "severity",
            t(if blocked { "error" } else { "warning" }),
        )?;
        if text(diagnostic, "path") == Some(&ideal) {
            set(diagnostic, "code", t("TABLESPEC_NULLABILITY_CONFLICT"))?;
        }
    }
    let mut result = obj(vec![
        ("operation", t("classify-tablespec-nullability")),
        ("version", t("1.0.0")),
        ("status", t(if blocked { "blocked" } else { "classified" })),
        ("source", copy_json(&source, ctx)?),
        ("request", copy_json(&request, ctx)?),
        (
            "binding",
            obj(vec![
                ("id", t("umf.tablespec.nullability")),
                ("version", t("1.0.0")),
                ("nativeVersion", t(NATIVE_VERSION)),
                ("subset", t(SUBSET)),
            ]),
        ),
        (
            "mapping",
            obj(vec![
                ("origin", t("classified")),
                ("idealPath", Value::String(ideal.clone())),
                ("nativePath", Value::String(native_path.clone())),
                ("nativeFragment", native),
                ("nullability", t(nullability)),
                ("interpretation", t(interpretation)),
                ("outcome", t(outcome)),
                ("context", copy_json(context, ctx)?),
                ("carrier", Value::String(carrier.clone())),
                ("basis", t(BASIS)),
            ]),
        ),
        ("residuals", Value::Array(residuals)),
        ("diagnostics", Value::Array(diagnostics)),
    ]);
    if !blocked {
        let identity = crate::nullability::Identity {
            module: u("table"),
            element: text(element, "id").cloned().ok_or_else(|| {
                err(
                    "TABLESPEC_NULLABILITY_SOURCE",
                    "/modules/elements/id",
                    "Column identity required",
                )
            })?,
        };
        let declaration = crate::nullability::declare_core_nullability(
            &source,
            &identity,
            nullability,
            engine,
            registry,
            caps,
            ctx,
        )?;
        let mut target = copy_json(
            get(&declaration, "target").ok_or_else(|| {
                err(
                    "TABLESPEC_NULLABILITY_TARGET",
                    "",
                    "Core nullability target missing",
                )
            })?,
            ctx,
        )?;
        if let Some(vocabs) = get_mut(&mut target, "vocabularies") {
            set(
                vocabs,
                "umf.tablespec.nullability",
                obj(vec![("version", t("1.0.0"))]),
            )?;
        }
        let selected = get_mut(&mut target, "modules")
            .and_then(|v| {
                if let Value::Array(a) = v {
                    a.get_mut(mi)
                } else {
                    None
                }
            })
            .and_then(|v| get_mut(v, "elements"))
            .and_then(|v| {
                if let Value::Array(a) = v {
                    a.get_mut(column_index)
                } else {
                    None
                }
            })
            .ok_or_else(|| {
                err(
                    "TABLESPEC_NULLABILITY_TARGET",
                    "/modules/elements",
                    "Selected Field missing",
                )
            })?;
        let extension = obj(vec![
            ("origin", t("classified")),
            (
                "binding",
                obj(vec![
                    ("id", t("umf.tablespec.nullability")),
                    ("version", t("1.0.0")),
                ]),
            ),
            ("profile", Value::String(profile.clone())),
            ("context", copy_json(context, ctx)?),
            ("carrier", Value::String(carrier.clone())),
            ("interpretation", t(interpretation)),
            ("nativePath", Value::String(native_path.clone())),
        ]);
        set(
            get_mut(selected, "extensions").ok_or_else(|| {
                err(
                    "TABLESPEC_NULLABILITY_TARGET",
                    "/modules/elements/extensions",
                    "Extensions missing",
                )
            })?,
            "umf.tablespec.nullability",
            extension,
        )?;
        if !adapter.inspect(&target, ctx)?.valid {
            return Err(err(
                "TABLESPEC_NULLABILITY_TARGET",
                "",
                "Classification would violate core constraints",
            ));
        }
        let _ = archive(&target, adapter, ctx)?;
        set(&mut result, "target", target)?;
    }
    validate(&result, &rt.result, ctx, "TABLESPEC_NULLABILITY_RESULT")?;
    Ok(result)
}

pub(crate) fn verify_table_spec_nullability_classification(
    receipt_in: &Value,
    current_in: &Value,
    adapter: &TableSpecRuntime,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(engine, ctx)?;
    validate(receipt_in, &rt.result, ctx, "TABLESPEC_NULLABILITY_RECEIPT")?;
    if text(receipt_in, "status") != Some(&u("classified")) {
        return Err(err(
            "TABLESPEC_NULLABILITY_RECEIPT",
            "",
            "Expected complete classified receipt",
        ));
    }
    let receipt = copy_json(receipt_in, ctx)?;
    let source = get(&receipt, "source")
        .ok_or_else(|| err("TABLESPEC_NULLABILITY_RECEIPT", "", "Source missing"))?;
    let request = get(&receipt, "request")
        .ok_or_else(|| err("TABLESPEC_NULLABILITY_RECEIPT", "", "Request missing"))?;
    let expected =
        classify_table_spec_nullability(source, request, adapter, engine, registry, caps, ctx)?;
    if !equal(&receipt, &expected, ctx)? {
        return Err(err(
            "TABLESPEC_NULLABILITY_RECEIPT",
            "",
            "Receipt disagrees with retained source and selected binding",
        ));
    }
    if !equal(
        current_in,
        get(&receipt, "target")
            .ok_or_else(|| err("TABLESPEC_NULLABILITY_RECEIPT", "", "Target missing"))?,
        ctx,
    )? {
        return Err(err(
            "TABLESPEC_NULLABILITY_STALE",
            "",
            "Target changed after classification",
        ));
    }
    Ok(receipt)
}
pub(crate) fn recover_table_spec_nullability_source(
    receipt: &Value,
    current: &Value,
    adapter: &TableSpecRuntime,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let verified = verify_table_spec_nullability_classification(
        receipt, current, adapter, engine, registry, caps, ctx,
    )?;
    archive(
        get(&verified, "source")
            .ok_or_else(|| err("TABLESPEC_NULLABILITY_RECEIPT", "", "Source missing"))?,
        adapter,
        ctx,
    )
}
