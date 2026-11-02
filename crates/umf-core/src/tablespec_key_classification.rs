// SPDX-License-Identifier: MIT OR Apache-2.0
//! Native-owned observation of TableSpec primary and alternate key declarations.
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
    include_str!("../../../spec/core/tablespec-key-classification.schema.json");
const RECOVERY: &str = "Original native archive retained; no authored key inferred";
const NATIVE_VERSION: &str = "647e8e566ad78b864282ec65c0b0b2237aa63084";
const SUBSET: &str = "Raw primary_key and unique_constraints declarations only; no pipeline enforcement, comparator equivalence, implicit merge-key adoption or authored identity inference";
const ABSENT_BASIS: &str =
    "No native tuple declaration; effective merge defaults are not authored identity";
const INVALID_BASIS: &str = "Native tuple is not an array of column names";
const EMPTY_BASIS: &str =
    "Empty native tuple is retained; no ideal key or implicit merge default is inferred";
const DECLARED_BASIS: &str = "Native tuple declaration only; comparator, requiredness, enforcement and author intent are not established";
const DECLARED_LOSS: &str =
    "Native declaration cannot establish authored stable identity or exact scoped enforcement";
const EMPTY_LOSS: &str = "An empty tuple is not a nonempty ideal key";

fn u(s: &str) -> Utf16 {
    Utf16::from(s)
}
fn t(s: &str) -> Value {
    Value::string_utf8(s)
}
fn obj(values: Vec<(&str, Value)>) -> Value {
    Value::Object(
        values
            .into_iter()
            .map(|(key, value)| (u(key), value))
            .collect(),
    )
}
fn get<'a>(value: &'a Value, key: &str) -> Option<&'a Value> {
    if let Value::Object(fields) = value {
        fields
            .iter()
            .find(|(name, _)| name == &u(key))
            .map(|(_, value)| value)
    } else {
        None
    }
}
fn get_metered<'a>(
    value: &'a Value,
    key: &str,
    ctx: &mut Context<'_>,
) -> Result<Option<&'a Value>, EngineError> {
    if let Value::Object(fields) = value {
        for (name, value) in fields {
            ctx.charge_work(name.len().saturating_add(1), u(""))?;
            if name == &u(key) {
                return Ok(Some(value));
            }
        }
    }
    Ok(None)
}
fn text_metered<'a>(
    value: &'a Value,
    key: &str,
    ctx: &mut Context<'_>,
) -> Result<Option<&'a Utf16>, EngineError> {
    Ok(match get_metered(value, key, ctx)? {
        Some(Value::String(text)) => Some(text),
        _ => None,
    })
}
fn get_mut<'a>(value: &'a mut Value, key: &str) -> Option<&'a mut Value> {
    if let Value::Object(fields) = value {
        fields
            .iter_mut()
            .find(|(name, _)| name == &u(key))
            .map(|(_, value)| value)
    } else {
        None
    }
}
fn array<'a>(value: &'a Value, key: &str) -> Option<&'a [Value]> {
    match get(value, key) {
        Some(Value::Array(items)) => Some(items),
        _ => None,
    }
}
fn text<'a>(value: &'a Value, key: &str) -> Option<&'a Utf16> {
    match get(value, key) {
        Some(Value::String(text)) => Some(text),
        _ => None,
    }
}
fn set(value: &mut Value, key: &str, next: Value) -> Result<(), EngineError> {
    let Value::Object(fields) = value else {
        return Err(err("TABLESPEC_KEY_TARGET", "", "Expected object"));
    };
    if let Some((_, old)) = fields.iter_mut().find(|(name, _)| name == &u(key)) {
        *old = next;
    } else {
        fields.push((u(key), next));
    }
    Ok(())
}
fn err(code: &str, path: &str, message: impl Into<String>) -> EngineError {
    EngineError::new(code, u(path), message.into())
}
fn read_json(source: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let units = source.encode_utf16().collect::<Vec<_>>();
    ctx.charge_text(units.len(), u(""))?;
    serialization::read_json_value(&units, Format::Json, ctx)
}
fn equal(a: &Value, b: &Value, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    fn canonical(value: &Value, ctx: &mut Context<'_>, depth: usize) -> Result<Value, EngineError> {
        if depth > ctx.limits().max_depth {
            return Err(err("LIMIT", "", "Canonicalization depth exceeded"));
        }
        ctx.charge_work(1, u(""))?;
        match value {
            Value::Array(items) => Ok(Value::Array(
                items
                    .iter()
                    .map(|item| canonical(item, ctx, depth + 1))
                    .collect::<Result<_, _>>()?,
            )),
            Value::Object(fields) => {
                let mut sorted = Vec::with_capacity(fields.len());
                for (key, value) in fields {
                    ctx.charge_work(key.len().saturating_add(1), u(""))?;
                    sorted.push((key.clone(), canonical(value, ctx, depth + 1)?));
                }
                sorted.sort_by(|a, b| a.0.cmp(&b.0));
                Ok(Value::Object(sorted))
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
        if let Some(runtime) = CACHE.get() {
            return Ok(Arc::clone(runtime));
        }
    }
    ctx.charge_work(1, u(""))?;
    let resources = engine.schema_resources_with_context(ctx)?;
    let schema = read_json(RESULT_SCHEMA, ctx)?;
    let result = CompiledSchema::compile(&schema, &resources, ctx)?;
    let properties = get(&schema, "properties")
        .ok_or_else(|| err("SCHEMA", "", "TableSpec Key properties missing"))?;
    let request_schema = get(properties, "request")
        .ok_or_else(|| err("SCHEMA", "", "TableSpec Key request schema missing"))?;
    let request = CompiledSchema::compile(request_schema, &resources, ctx)?;
    let ready = Arc::new(Runtime { result, request });
    if ctx.profile() == ResourceProfile::Cooperative && ctx.limits() == Limits::ordinary() {
        let _ = CACHE.set(Arc::clone(&ready));
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
            "Value does not match pinned TableSpec Key classification schema",
        ))
    }
}
fn archive(
    source: &Value,
    adapter: &TableSpecRuntime,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let extensions = get(source, "extensions").ok_or_else(|| {
        err(
            "TABLESPEC_KEY_CAPTURE",
            "/extensions",
            "Source extensions required",
        )
    })?;
    let payload = get_metered(extensions, "umf.tablespec", ctx)?.ok_or_else(|| {
        err(
            "TABLESPEC_KEY_CAPTURE",
            "/extensions/umf.tablespec",
            "TableSpec capture required",
        )
    })?;
    if get_metered(payload, "splitFiles", ctx)?.is_some() {
        adapter.export_bundle(source, ctx)
    } else {
        Ok(Value::String(adapter.export(source, ctx)?))
    }
}
fn loss(
    path: Utf16,
    value: &Value,
    outcome: &str,
    reason: Utf16,
    residuals: &mut Vec<Value>,
    diagnostics: &mut Vec<Value>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    residuals.push(obj(vec![
        ("path", Value::String(path.clone())),
        ("value", copy_json(value, ctx)?),
        ("outcome", Value::String(u(outcome))),
        ("reason", Value::String(reason.clone())),
        ("recovery", t(RECOVERY)),
    ]));
    diagnostics.push(obj(vec![
        ("code", t("TABLESPEC_KEY_RESIDUAL")),
        ("path", Value::String(path)),
        ("message", Value::String(reason)),
        ("severity", t("warning")),
    ]));
    Ok(())
}
fn quote(value: &Utf16, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    let rendered =
        serialization::write_json_value(&Value::String(value.clone()), Format::Json, ctx)?;
    let mut units = rendered.into_units();
    if units.last() == Some(&(b'\n' as u16)) {
        units.pop();
    }
    Ok(Utf16::new(units))
}
fn join_reason(prefix: &str, quoted: &Utf16, suffix: &str) -> Utf16 {
    let mut units = u(prefix).into_units();
    units.extend_from_slice(quoted.units());
    units.extend(u(suffix).into_units());
    Utf16::new(units)
}
fn tuple(
    node: Option<&Value>,
    path: Utf16,
    kind: &str,
    module_id: &Utf16,
    elements: &[Value],
    observations: &mut Vec<Value>,
    residuals: &mut Vec<Value>,
    diagnostics: &mut Vec<Value>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let mut state = "absent";
    let mut interpretation = "unknown";
    let mut columns = Vec::new();
    let mut resolved = Vec::new();
    let mut basis = ABSENT_BASIS;
    let mut losses: Vec<(&'static str, Utf16)> = Vec::new();
    let should_observe = if kind == "alternate" {
        true
    } else if let Some(value) = node {
        text_metered(value, "kind", ctx)? != Some(&u("null"))
    } else {
        false
    };
    if should_observe {
        let items = if let Some(value) = node {
            if text_metered(value, "kind", ctx)? == Some(&u("array")) {
                get_metered(value, "items", ctx)?.and_then(|items| {
                    if let Value::Array(items) = items {
                        Some(items.as_slice())
                    } else {
                        None
                    }
                })
            } else {
                None
            }
        } else {
            None
        };
        let mut all_strings = items.is_some();
        if let Some(items) = items {
            for item in items {
                ctx.charge_work(1, path.clone())?;
                if text_metered(item, "kind", ctx)? != Some(&u("string")) {
                    all_strings = false;
                    break;
                }
            }
        }
        if all_strings {
            let items =
                items.ok_or_else(|| err("TABLESPEC_KEY_BASIS", "", "Tuple item array missing"))?;
            state = if items.is_empty() {
                "empty"
            } else {
                "declared"
            };
            interpretation = "declared";
            basis = if items.is_empty() {
                EMPTY_BASIS
            } else {
                DECLARED_BASIS
            };
            for item in items {
                ctx.charge_work(1, path.clone())?;
                let name = text_metered(item, "value", ctx)?.ok_or_else(|| {
                    err(
                        "TABLESPEC_KEY_BASIS",
                        "",
                        "String tuple member has no value",
                    )
                })?;
                columns.push(Value::String(name.clone()));
                let mut found = None;
                for element in elements {
                    ctx.charge_work(1, path.clone())?;
                    if text_metered(element, "name", ctx)? == Some(name) {
                        found = Some(element);
                        break;
                    }
                }
                if let Some(element) = found {
                    let id = text_metered(element, "id", ctx)?.ok_or_else(|| {
                        err(
                            "TABLESPEC_KEY_SOURCE",
                            "",
                            "Resolved element identity missing",
                        )
                    })?;
                    resolved.push(obj(vec![
                        ("module", Value::String(module_id.clone())),
                        ("element", Value::String(id.clone())),
                    ]));
                } else {
                    let quoted = quote(name, ctx)?;
                    losses.push((
                        "not-expressible",
                        join_reason(
                            "Unresolved native column ",
                            &quoted,
                            "; implicit meta_* columns remain native",
                        ),
                    ));
                }
            }
            let mut seen: Vec<Utf16> = Vec::new();
            for column in &columns {
                let Value::String(name) = column else {
                    continue;
                };
                ctx.charge_work(1, path.clone())?;
                let mut duplicate = false;
                for candidate in &seen {
                    ctx.charge_work(candidate.len().saturating_add(1), path.clone())?;
                    if candidate == name {
                        duplicate = true;
                        break;
                    }
                }
                if duplicate {
                    losses.push((
                        "not-expressible",
                        u("Repeated native tuple components cannot define an ideal key"),
                    ));
                    break;
                }
                seen.push(name.clone());
            }
            if items.is_empty() {
                losses.push(("not-expressible", u(EMPTY_LOSS)));
            } else {
                losses.push(("unknown", u(DECLARED_LOSS)));
            }
        } else {
            state = "invalid";
            interpretation = "unsupported";
            basis = INVALID_BASIS;
            losses.push(("not-expressible", u(INVALID_BASIS)));
        }
    }
    observations.push(obj(vec![
        ("nativePath", Value::String(path.clone())),
        ("kind", t(kind)),
        ("state", t(state)),
        ("interpretation", t(interpretation)),
        ("columns", Value::Array(columns)),
        ("resolvedFields", Value::Array(resolved)),
        ("enforcement", t("unknown")),
        ("authorIntent", t("unknown")),
        ("basis", t(basis)),
    ]));
    for (outcome, reason) in losses {
        let value =
            node.ok_or_else(|| err("TABLESPEC_KEY_BASIS", "", "Residual tuple value is missing"))?;
        loss(
            path.clone(),
            value,
            outcome,
            reason,
            residuals,
            diagnostics,
            ctx,
        )?;
    }
    Ok(())
}
pub(crate) fn classify_table_spec_keys(
    input: &Value,
    request_in: &Value,
    adapter: &TableSpecRuntime,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(engine, ctx)?;
    validate(request_in, &rt.request, ctx, "TABLESPEC_KEY_REQUEST")?;
    let source = copy_json(input, ctx)?;
    let request = copy_json(request_in, ctx)?;
    let _archive = archive(&source, adapter, ctx)?;
    let table = adapter.get_table(&source, ctx)?;
    if text_metered(&table, "kind", ctx)? != Some(&u("object")) {
        return Err(err(
            "TABLESPEC_KEY_SOURCE",
            "",
            "Expected native table object",
        ));
    }
    let mut observations = Vec::new();
    let mut residuals = Vec::new();
    let mut diagnostics = Vec::new();
    let mut conflict = false;
    let extensions = get_metered(&source, "extensions", ctx)?
        .ok_or_else(|| err("TABLESPEC_KEY_SOURCE", "/extensions", "Extensions required"))?;
    if let Some(existing) = get_metered(extensions, "umf.tablespec.keys", ctx)? {
        conflict = true;
        loss(u("/extensions/umf.tablespec.keys"), existing, "unknown", u("Existing observations must not be overwritten; reclassify the retained original source"), &mut residuals, &mut diagnostics, ctx)?;
    }
    let vocabularies = get_metered(&source, "vocabularies", ctx)?.ok_or_else(|| {
        err(
            "TABLESPEC_KEY_SOURCE",
            "/vocabularies",
            "Vocabularies required",
        )
    })?;
    let vocabulary = get_metered(vocabularies, "umf.tablespec.keys", ctx)?;
    if let Some(vocabulary) = vocabulary {
        let version = get_metered(vocabulary, "version", ctx)?.and_then(|value| {
            if let Value::String(text) = value {
                Some(text)
            } else {
                None
            }
        });
        if version.is_some_and(|version| version != &u("1.0.0")) {
            conflict = true;
            loss(
                u("/vocabularies/umf.tablespec.keys"),
                vocabulary,
                "unknown",
                u("Incompatible existing vocabulary version"),
                &mut residuals,
                &mut diagnostics,
                ctx,
            )?;
        }
    }
    let modules = array(&source, "modules")
        .ok_or_else(|| err("TABLESPEC_KEY_SOURCE", "/modules", "Modules required"))?;
    let mut table_module = None;
    for module in modules {
        ctx.charge_work(1, u("/modules"))?;
        if text_metered(module, "id", ctx)? == Some(&u("table")) {
            table_module = Some(module);
            break;
        }
    }
    let module = table_module
        .ok_or_else(|| err("TABLESPEC_KEY_SOURCE", "/modules", "Table module required"))?;
    let module_id = text_metered(module, "id", ctx)?.cloned().ok_or_else(|| {
        err(
            "TABLESPEC_KEY_SOURCE",
            "/modules/id",
            "Table module ID missing",
        )
    })?;
    let elements = array(module, "elements").ok_or_else(|| {
        err(
            "TABLESPEC_KEY_SOURCE",
            "/modules/elements",
            "Table elements required",
        )
    })?;
    let members = get_metered(&table, "members", ctx)?.ok_or_else(|| {
        err(
            "TABLESPEC_KEY_SOURCE",
            "/extensions/umf.tablespec/root/members",
            "Table members required",
        )
    })?;
    let root = "/extensions/umf.tablespec/root/members/";
    let primary = get_metered(members, "primary_key", ctx)?;
    tuple(
        primary,
        u(&format!("{root}primary_key")),
        "primary",
        &module_id,
        elements,
        &mut observations,
        &mut residuals,
        &mut diagnostics,
        ctx,
    )?;
    let alternates = get_metered(members, "unique_constraints", ctx)?;
    if let Some(alternates) = alternates.filter(|value| text(value, "kind") != Some(&u("null"))) {
        if let Some(items) =
            array(alternates, "items").filter(|_| text(alternates, "kind") == Some(&u("array")))
        {
            for (index, item) in items.iter().enumerate() {
                ctx.charge_work(1, u(&format!("{root}unique_constraints")))?;
                tuple(
                    Some(item),
                    u(&format!("{root}unique_constraints/items/{index}")),
                    "alternate",
                    &module_id,
                    elements,
                    &mut observations,
                    &mut residuals,
                    &mut diagnostics,
                    ctx,
                )?;
            }
        } else {
            tuple(
                Some(alternates),
                u(&format!("{root}unique_constraints")),
                "alternate",
                &module_id,
                elements,
                &mut observations,
                &mut residuals,
                &mut diagnostics,
                ctx,
            )?;
        }
    }
    let mut outcome = "exact";
    if !residuals.is_empty() {
        let mut not_expressible = false;
        for residual in &residuals {
            ctx.charge_work(1, u("/residuals"))?;
            if text_metered(residual, "outcome", ctx)? == Some(&u("not-expressible")) {
                not_expressible = true;
                break;
            }
        }
        outcome = if not_expressible {
            "not-expressible"
        } else {
            "unknown"
        };
    }
    let mode = text(&request, "mode")
        .ok_or_else(|| err("TABLESPEC_KEY_REQUEST", "/mode", "Mode required"))?;
    let blocked = conflict || mode == &u("strict") && !residuals.is_empty();
    for diagnostic in &mut diagnostics {
        set(
            diagnostic,
            "severity",
            t(if blocked { "error" } else { "warning" }),
        )?;
    }
    let mut result = obj(vec![
        ("operation", t("classify-tablespec-keys")),
        ("version", t("1.0.0")),
        ("status", t(if blocked { "blocked" } else { "classified" })),
        ("outcome", t(outcome)),
        ("source", copy_json(&source, ctx)?),
        ("request", copy_json(&request, ctx)?),
        (
            "binding",
            obj(vec![
                ("id", t("umf.tablespec.keys")),
                ("version", t("1.0.0")),
                ("nativeVersion", t(NATIVE_VERSION)),
                ("subset", t(SUBSET)),
            ]),
        ),
        ("observations", Value::Array(observations)),
        ("residuals", Value::Array(residuals)),
        ("diagnostics", Value::Array(diagnostics)),
    ]);
    if !blocked {
        let mut target = copy_json(&source, ctx)?;
        let vocabularies = get_mut(&mut target, "vocabularies").ok_or_else(|| {
            err(
                "TABLESPEC_KEY_TARGET",
                "/vocabularies",
                "Vocabularies missing",
            )
        })?;
        if get(vocabularies, "umf.tablespec.keys").is_none() {
            set(
                vocabularies,
                "umf.tablespec.keys",
                obj(vec![("version", t("1.0.0"))]),
            )?;
        }
        let extensions = get_mut(&mut target, "extensions")
            .ok_or_else(|| err("TABLESPEC_KEY_TARGET", "/extensions", "Extensions missing"))?;
        set(
            extensions,
            "umf.tablespec.keys",
            obj(vec![
                ("origin", t("classified")),
                (
                    "binding",
                    copy_json(
                        get(&result, "binding").ok_or_else(|| {
                            err("TABLESPEC_KEY_TARGET", "/binding", "Binding metadata missing")
                        })?,
                        ctx,
                    )?,
                ),
                (
                    "profile",
                    copy_json(
                        get(&request, "profile").ok_or_else(|| {
                            err("TABLESPEC_KEY_REQUEST", "/profile", "Profile required")
                        })?,
                        ctx,
                    )?,
                ),
                (
                    "observations",
                    copy_json(
                        get(&result, "observations").ok_or_else(|| {
                            err(
                                "TABLESPEC_KEY_TARGET",
                                "/observations",
                                "Observations missing",
                            )
                        })?,
                        ctx,
                    )?,
                ),
            ]),
        )?;
        if !adapter.inspect(&target, ctx)?.valid {
            return Err(err(
                "TABLESPEC_KEY_TARGET",
                "",
                "Invalid classification target",
            ));
        }
        let _ = archive(&target, adapter, ctx)?;
        set(&mut result, "target", target)?;
    }
    validate(&result, &rt.result, ctx, "TABLESPEC_KEY_RESULT")?;
    Ok(result)
}

pub(crate) fn verify_table_spec_key_classification(
    receipt_in: &Value,
    current_in: &Value,
    adapter: &TableSpecRuntime,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(engine, ctx)?;
    validate(receipt_in, &rt.result, ctx, "TABLESPEC_KEY_RECEIPT")?;
    if text(receipt_in, "status") != Some(&u("classified")) {
        return Err(err(
            "TABLESPEC_KEY_RECEIPT",
            "",
            "Expected classified receipt",
        ));
    }
    let receipt = copy_json(receipt_in, ctx)?;
    let source = get(&receipt, "source")
        .ok_or_else(|| err("TABLESPEC_KEY_RECEIPT", "", "Source missing"))?;
    let request = get(&receipt, "request")
        .ok_or_else(|| err("TABLESPEC_KEY_RECEIPT", "", "Request missing"))?;
    let expected = classify_table_spec_keys(source, request, adapter, engine, registry, caps, ctx)?;
    if !equal(&receipt, &expected, ctx)? {
        return Err(err(
            "TABLESPEC_KEY_RECEIPT",
            "",
            "Receipt differs from retained source classification",
        ));
    }
    if !equal(
        current_in,
        get(&receipt, "target")
            .ok_or_else(|| err("TABLESPEC_KEY_RECEIPT", "", "Target missing"))?,
        ctx,
    )? {
        return Err(err(
            "TABLESPEC_KEY_STALE",
            "",
            "Classification target changed",
        ));
    }
    Ok(receipt)
}
pub(crate) fn recover_table_spec_key_source(
    receipt: &Value,
    current: &Value,
    adapter: &TableSpecRuntime,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let verified = verify_table_spec_key_classification(
        receipt, current, adapter, engine, registry, caps, ctx,
    )?;
    archive(
        get(&verified, "source")
            .ok_or_else(|| err("TABLESPEC_KEY_RECEIPT", "", "Source missing"))?,
        adapter,
        ctx,
    )
}
