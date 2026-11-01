// SPDX-License-Identifier: MIT OR Apache-2.0
//! Native-owned classification of declared TableSpec column cardinality.
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
    include_str!("../../../spec/core/tablespec-cardinality-classification.schema.json");
const CARDINALITY_SCHEMA: &str =
    include_str!("../../../spec/core/cardinality-operation-v4.schema.json");
const RECOVERY: &str = "Retain original native archive and author assertions; classification does not replace native meaning";
const NATIVE_VERSION: &str = "647e8e566ad78b864282ec65c0b0b2237aa63084";
const SUBSET: &str = "Declared column shape under selected metadata profile; not whole-model validation, item typing or execution equivalence";
const BASIS: &str = "Explicit native data_type and uncoerced dimension under selected metadata profile; item and execution semantics remain native";

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
        return Err(err("TABLESPEC_CARDINALITY_TARGET", "", "Expected object"));
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
        u("urn:umf:core:cardinality-operation:4.0.0"),
        read_json(CARDINALITY_SCHEMA, ctx)?,
    ));
    resources.entries.push((u("urn:umf:native-json:0.1.0"), read_json(include_str!("../../../spec/core/native-json.schema.json"), ctx)?));
    let schema = read_json(RESULT_SCHEMA, ctx)?;
    let result = CompiledSchema::compile(&schema, &resources, ctx)?;
    let req = get(
        get(&schema, "properties").unwrap_or(&Value::Null),
        "request",
    )
    .ok_or_else(|| err("SCHEMA", "", "Cardinality request schema missing"))?;
    let request = CompiledSchema::compile(req, &resources, ctx)?;
    let ready = Arc::new(Runtime { result, request });
    if ctx.profile() == ResourceProfile::Cooperative && ctx.limits() == Limits::ordinary() {
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
            "Value does not match pinned TableSpec Cardinality classification schema",
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
            "TABLESPEC_CARDINALITY_CAPTURE",
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
        ("code", t("TABLESPEC_CARDINALITY_UNRESOLVED")),
        ("path", Value::String(path)),
        ("message", t(reason)),
        ("severity", t("warning")),
    ]));
    Ok(())
}
fn native_member<'a>(column: &'a Value, name: &str) -> Option<&'a Value> {
    get(get(column, "members")?, name)
}
fn native_text<'a>(node: &'a Value) -> Option<&'a Utf16> {
    (text(node, "kind") == Some(&u("string")))
        .then(|| text(node, "value"))
        .flatten()
}
fn dimension_is_positive_integer(node: Option<&Value>) -> bool {
    let Some(node) = node else { return false };
    if text(node, "kind") != Some(&u("number")) {
        return false;
    }
    let Some(Value::String(value)) = get(node, "value") else {
        return false;
    };
    let s = value.to_utf8().ok();
    s.is_some_and(|s| {
        !s.is_empty() && s.bytes().all(|b| b.is_ascii_digit()) && s.as_bytes()[0] != b'0'
    })
}
fn dimension_absent(node: Option<&Value>) -> bool {
    node.is_none_or(|n| text(n, "kind") == Some(&u("null")))
}
fn control_error(e: &EngineError) -> bool {
    e.is_control_failure() || e.code == "LIMIT" || e.code == "CAPACITY"
}

pub(crate) fn classify_table_spec_cardinality(
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
        "TABLESPEC_CARDINALITY_REQUEST",
    )?;
    let source = copy_json(input, ctx)?;
    let request = copy_json(request_in, ctx)?;
    let validation = adapter.inspect(&source, ctx)?;
    if !validation.valid || text(&source, "umf") != Some(&u("0.10.0")) {
        return Err(err(
            "TABLESPEC_CARDINALITY_SOURCE",
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
                "TABLESPEC_CARDINALITY_REQUEST",
                "/column",
                "Expected nonnegative safe integer",
            ))
        }
    };
    let native = adapter.get_column(&source, column_index, ctx)?;
    if text(&native, "kind") != Some(&u("object")) {
        return Err(err(
            "TABLESPEC_CARDINALITY_COLUMN",
            "/column",
            "Expected native column object",
        ));
    }
    let modules = array(&source, "modules").ok_or_else(|| {
        err(
            "TABLESPEC_CARDINALITY_SOURCE",
            "/modules",
            "Modules required",
        )
    })?;
    let mi = modules
        .iter()
        .position(|m| text(m, "id") == Some(&u("table")))
        .ok_or_else(|| {
            err(
                "TABLESPEC_CARDINALITY_SOURCE",
                "/modules",
                "Table module required",
            )
        })?;
    let elements = array(&modules[mi], "elements").ok_or_else(|| {
        err(
            "TABLESPEC_CARDINALITY_SOURCE",
            "/modules/elements",
            "Table elements required",
        )
    })?;
    let element = elements.get(column_index).ok_or_else(|| {
        err(
            "TABLESPEC_CARDINALITY_COLUMN",
            "/column",
            "Column index does not exist",
        )
    })?;
    let profile = text(&request, "profile").ok_or_else(|| {
        err(
            "TABLESPEC_CARDINALITY_REQUEST",
            "/profile",
            "Profile required",
        )
    })?;
    let mode = text(&request, "mode")
        .ok_or_else(|| err("TABLESPEC_CARDINALITY_REQUEST", "/mode", "Mode required"))?;
    let ideal = u(&format!(
        "/modules/{mi}/elements/{column_index}/cardinality"
    ));
    let native_path = format!(
        "/extensions/umf.tablespec/root/members/columns/items/{column_index}/members/data_type"
    );
    let base = u(&native_path);
    let native_parent = u(&native_path.replace("/members/data_type", ""));
    let mut cardinality = u("unspecified");
    let mut interpretation = "unknown";
    let mut outcome = "unknown";
    let mut reason = None;
    let ty = native_member(&native, "data_type").and_then(native_text);
    let dimension = native_member(&native, "dimension");
    let scalar = [
        "VARCHAR",
        "DECIMAL",
        "INTEGER",
        "DATE",
        "DATETIME",
        "TIMESTAMP",
        "BOOLEAN",
        "TEXT",
        "CHAR",
        "FLOAT",
    ];
    if profile == &u("unresolved") {
        reason = Some(
            "No metadata profile selected; native schema/runtime differences remain unresolved"
                .to_owned(),
        )
    } else if !ty.is_some_and(|v| scalar.iter().any(|s| v == &u(s)) || v == &u("EMBEDDING")) {
        reason=Some("Unsupported native data_type; helper fallback and EMBEDDING prefix matching do not establish a declaration".to_owned());
        interpretation = "unsupported"
    } else if !dimension_absent(dimension) && !dimension_is_positive_integer(dimension) {
        reason=Some("Dimension is not an uncoerced positive integer token; native normalization is not an authored declaration".to_owned())
    } else if profile == &u("runtime-model")
        && ((ty == Some(&u("EMBEDDING")) && dimension_absent(dimension))
            || (ty != Some(&u("EMBEDDING")) && !dimension_absent(dimension)))
    {
        reason=Some("Runtime model requires a dimension on EMBEDDING and rejects dimensions on scalar columns".to_owned());
        interpretation = "unsupported"
    } else {
        cardinality = if ty == Some(&u("EMBEDDING")) {
            u("array")
        } else {
            u("one")
        };
        interpretation = "declared";
        outcome = "exact"
    }
    let mut residuals = Vec::new();
    let mut diagnostics = Vec::new();
    if let Some(reason) = &reason {
        loss(
            native_parent,
            &native,
            reason,
            &mut residuals,
            &mut diagnostics,
            ctx,
        )?;
        if interpretation == "unsupported" {
            outcome = "not-expressible"
        }
    }
    let mut conflict = None;
    if text(element, "kind") != Some(&u("field")) {
        conflict=Some("Selected native member must already be an explicit Field; this operation does not replace its kind".to_owned())
    }
    if let Some(author) = get(&request, "author") {
        match crate::cardinality::verify_core_cardinality_declaration(
            author, &source, engine, registry, caps, ctx,
        ) {
            Ok(verified) => {
                let id = get(&verified, "identity").unwrap_or(&Value::Null);
                let provenance = get(&verified, "provenance").unwrap_or(&Value::Null);
                if text(id, "module") != Some(&u("table"))
                    || text(id, "element") != text(element, "id")
                {
                    conflict = Some("Author receipt identifies a different member".to_owned())
                } else if text(provenance, "cardinality") != Some(&cardinality) {
                    conflict=Some("Authored cardinality differs from the native observation; neither assertion may be overwritten".to_owned())
                }
            }
            Err(e) if control_error(&e) => return Err(e),
            Err(e) => conflict = Some(format!("Author provenance is invalid or stale: {}", e.code)),
        }
    } else if has(element, "cardinality") {
        conflict = Some(
            "Existing cardinality requires verified author provenance before native classification"
                .to_owned(),
        )
    }
    if has(
        get(element, "extensions").unwrap_or(&Value::Null),
        "umf.tablespec.cardinality",
    ) {
        conflict = Some(
            "Existing binding scope cannot be overwritten; reclassify from its retained source"
                .to_owned(),
        )
    }
    let vocab = get(
        get(&source, "vocabularies").unwrap_or(&Value::Null),
        "umf.tablespec.cardinality",
    );
    if vocab.and_then(|v| text(v, "version")).is_some_and(|v| v != &u("1.0.0")) {
        conflict = Some("Existing binding vocabulary version is incompatible".to_owned())
    }
    if cardinality == u("array") && has(element, "scalarType") {
        conflict = Some(
            "Array classification cannot erase or relocate an existing scalar assertion".to_owned(),
        )
    }
    if has(element, "itemType") {
        let p = u(&String::from_utf16_lossy(ideal.units()).replace("/cardinality", "/itemType"));
        loss(p,get(element,"itemType").unwrap(),"This observation does not classify or confirm item/value meaning; retained author item references stay independent",&mut residuals,&mut diagnostics,ctx)?
    }
    let has_conflict = conflict.is_some();
    if let Some(reason) = conflict {
        let v = get(element, "cardinality").cloned().unwrap_or(Value::Null);
        loss(
            ideal.clone(),
            &v,
            &reason,
            &mut residuals,
            &mut diagnostics,
            ctx,
        )?;
        outcome = "unknown"
    }
    let blocked = has_conflict || mode == &u("strict") && !residuals.is_empty();
    for diagnostic in &mut diagnostics {
        set(
            diagnostic,
            "severity",
            t(if blocked { "error" } else { "warning" }),
        )?;
        if text(diagnostic, "path") == Some(&ideal) {
            set(diagnostic, "code", t("TABLESPEC_CARDINALITY_CONFLICT"))?
        }
    }
    let mut result = obj(vec![
        ("operation", t("classify-tablespec-cardinality")),
        ("version", t("1.0.0")),
        ("status", t(if blocked { "blocked" } else { "classified" })),
        ("source", copy_json(&source, ctx)?),
        ("request", copy_json(&request, ctx)?),
        (
            "binding",
            obj(vec![
                ("id", t("umf.tablespec.cardinality")),
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
                ("nativePath", Value::String(base.clone())),
                ("nativeFragment", native),
                ("cardinality", Value::String(cardinality.clone())),
                ("interpretation", t(interpretation)),
                ("outcome", t(outcome)),
                ("basis", t(BASIS)),
            ]),
        ),
        ("residuals", Value::Array(residuals)),
        ("diagnostics", Value::Array(diagnostics)),
    ]);
    if !blocked {
        let identity = crate::cardinality::Identity {
            module: u("table"),
            element: text(element, "id").cloned().ok_or_else(|| {
                err(
                    "TABLESPEC_CARDINALITY_SOURCE",
                    "/modules/elements/id",
                    "Column identity required",
                )
            })?,
        };
        let declaration = crate::cardinality::declare_core_cardinality(
            &source,
            &identity,
            &obj(vec![("cardinality", Value::String(cardinality))]),
            engine,
            registry,
            caps,
            ctx,
        )?;
        let mut target = copy_json(
            get(&declaration, "target").ok_or_else(|| {
                err(
                    "TABLESPEC_CARDINALITY_TARGET",
                    "",
                    "Core cardinality target missing",
                )
            })?,
            ctx,
        )?;
        if let Some(vocabs) = get_mut(&mut target, "vocabularies") {
            set(
                vocabs,
                "umf.tablespec.cardinality",
                obj(vec![("version", t("1.0.0"))]),
            )?
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
                    "TABLESPEC_CARDINALITY_TARGET",
                    "/modules/elements",
                    "Selected Field missing",
                )
            })?;
        let extension = obj(vec![
            ("origin", t("classified")),
            (
                "binding",
                obj(vec![
                    ("id", t("umf.tablespec.cardinality")),
                    ("version", t("1.0.0")),
                ]),
            ),
            ("profile", Value::String(profile.clone())),
            ("interpretation", t(interpretation)),
            ("nativePath", Value::String(base)),
            ("basis", t(BASIS)),
        ]);
        set(
            get_mut(selected, "extensions").ok_or_else(|| {
                err(
                    "TABLESPEC_CARDINALITY_TARGET",
                    "/modules/elements/extensions",
                    "Extensions missing",
                )
            })?,
            "umf.tablespec.cardinality",
            extension,
        )?;
        if !adapter.inspect(&target, ctx)?.valid {
            return Err(err(
                "TABLESPEC_CARDINALITY_TARGET",
                "",
                "Classification would violate core constraints",
            ));
        }
        let _ = archive(&target, adapter, ctx)?;
        set(&mut result, "target", target)?
    }
    validate(&result, &rt.result, ctx, "TABLESPEC_CARDINALITY_RESULT")?;
    Ok(result)
}

pub(crate) fn verify_table_spec_cardinality_classification(
    receipt_in: &Value,
    current_in: &Value,
    adapter: &TableSpecRuntime,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(engine, ctx)?;
    validate(receipt_in, &rt.result, ctx, "TABLESPEC_CARDINALITY_RECEIPT")?;
    if text(receipt_in, "status") != Some(&u("classified")) {
        return Err(err(
            "TABLESPEC_CARDINALITY_RECEIPT",
            "",
            "Expected complete classified receipt",
        ));
    }
    let receipt = copy_json(receipt_in, ctx)?;
    let source = get(&receipt, "source")
        .ok_or_else(|| err("TABLESPEC_CARDINALITY_RECEIPT", "", "Source missing"))?;
    let request = get(&receipt, "request")
        .ok_or_else(|| err("TABLESPEC_CARDINALITY_RECEIPT", "", "Request missing"))?;
    let expected =
        classify_table_spec_cardinality(source, request, adapter, engine, registry, caps, ctx)?;
    if !equal(&receipt, &expected, ctx)? {
        return Err(err(
            "TABLESPEC_CARDINALITY_RECEIPT",
            "",
            "Receipt disagrees with retained source and selected binding",
        ));
    }
    if !equal(
        current_in,
        get(&receipt, "target")
            .ok_or_else(|| err("TABLESPEC_CARDINALITY_RECEIPT", "", "Target missing"))?,
        ctx,
    )? {
        return Err(err(
            "TABLESPEC_CARDINALITY_STALE",
            "",
            "Target changed after classification",
        ));
    }
    Ok(receipt)
}
pub(crate) fn recover_table_spec_cardinality_source(
    receipt: &Value,
    current: &Value,
    adapter: &TableSpecRuntime,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let verified = verify_table_spec_cardinality_classification(
        receipt, current, adapter, engine, registry, caps, ctx,
    )?;
    archive(
        get(&verified, "source")
            .ok_or_else(|| err("TABLESPEC_CARDINALITY_RECEIPT", "", "Source missing"))?,
        adapter,
        ctx,
    )
}
