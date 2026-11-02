//! Opt-in CONTRACT-049 schema-property inspection and declaration.
//! The operation retains source and unknown content and never classifies native storage.
use crate::host_json::{HostHandle, HostJsonReflection, copy_host_json};
use crate::{
    context::Context,
    engine::{Capabilities, Engine, SemanticContext},
    error::{Diagnostic, EngineError, Severity},
    registry::Registry,
    value::{Utf16, Value, copy_json},
};

fn k(s: &str) -> Utf16 {
    Utf16::from(s)
}
fn text(s: &str) -> Value {
    Value::string_utf8(s)
}
fn object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(name, value)| (k(name), value))
            .collect(),
    )
}
fn get<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    match value {
        Value::Object(fields) => fields
            .iter()
            .find(|(key, _)| key == &k(name))
            .map(|(_, value)| value),
        _ => None,
    }
}
fn err(code: &str, message: impl Into<String>, path: &str) -> EngineError {
    EngineError::new(code, k(path), message.into())
}
fn unknown(key: &Utf16, path: &str) -> EngineError {
    let mut full = path.encode_utf16().collect::<Vec<_>>();
    full.extend(key.units());
    let mut message = "Unknown relevant qualifier: "
        .encode_utf16()
        .collect::<Vec<_>>();
    message.extend(key.units());
    EngineError::new(
        "CORE_SCHEMA_PROPERTY_UNKNOWN",
        Utf16::new(full),
        Utf16::new(message),
    )
}
fn no_caps() -> impl Capabilities {
    struct Empty;
    impl Capabilities for Empty {
        fn validate_extension(
            &mut self,
            _: u64,
            _: &Value,
            _: &SemanticContext,
        ) -> Result<Vec<Diagnostic>, Utf16> {
            Ok(Vec::new())
        }
    }
    Empty
}
fn validation_json(diagnostics: Vec<Diagnostic>) -> Value {
    Value::Array(
        diagnostics
            .into_iter()
            .map(|d| {
                object(vec![
                    ("code", Value::String(d.code.clone())),
                    ("path", Value::String(d.path.clone())),
                    (
                        "message",
                        Value::String(
                            if d.code == k("SEMANTIC_TYPE_STRUCTURE")
                                && d.path.to_utf8().unwrap_or_default().ends_with("/aliases")
                                && d.message
                                    .to_utf8()
                                    .unwrap_or_default()
                                    .starts_with("must NOT have duplicate items")
                            {
                                k("must pass \"uniqueItems\" keyword validation")
                            } else {
                                d.message
                            },
                        ),
                    ),
                    (
                        "severity",
                        text(match d.severity {
                            Severity::Error => "error",
                            Severity::Warning => "warning",
                        }),
                    ),
                ])
            })
            .collect(),
    )
}
fn validate_source(
    source: &Value,
    engine: &Engine,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let mut caps = no_caps();
    let validation = engine.validate_document(source, &Registry::default(), &mut caps, ctx)?;
    if get(source, "umf") != Some(&text("0.10.0")) || !validation.valid {
        return Err(err(
            "CORE_SCHEMA_PROPERTIES",
            "Expected valid current 0.10.0 envelope",
            "",
        ));
    }
    Ok(validation_json(validation.diagnostics))
}
fn known(
    value: &Value,
    allowed: &[&str],
    path: &str,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let Value::Object(fields) = value else {
        return Err(err("CORE_SCHEMA_PROPERTIES", "Expected object", path));
    };
    for (key, _) in fields {
        if !allowed.iter().any(|name| key == &k(name)) {
            ctx.charge_text(key.len().saturating_mul(2).saturating_add(48), k(path))?;
            let mut unknown_path = path.to_owned();
            unknown_path.push('/');
            return Err(unknown(key, &unknown_path));
        }
    }
    Ok(())
}
#[derive(Clone, Copy)]
enum Scope {
    Document,
    Module,
    Element,
}
struct Located {
    source: Value,
    identity: Value,
    node_path: String,
    path: String,
    scope: Scope,
    diagnostics: Value,
}
fn locate(
    source_input: &Value,
    identity_input: &Value,
    engine: &Engine,
    ctx: &mut Context<'_>,
) -> Result<Located, EngineError> {
    let source = copy_json(source_input, ctx)?;
    let identity = copy_json(identity_input, ctx)?;
    locate_copied(source, identity, engine, ctx)
}

fn locate_copied(
    source: Value,
    identity: Value,
    engine: &Engine,
    ctx: &mut Context<'_>,
) -> Result<Located, EngineError> {
    // The TypeScript predecessor validates the source before inspecting the
    // identity shape, so malformed source always wins over identity errors.
    let diagnostics = validate_source(&source, engine, ctx)?;
    let fields = match &identity {
        Value::Object(fields) => fields,
        _ => {
            return Err(err(
                "CORE_SCHEMA_PROPERTIES",
                "Expected object",
                "/identity",
            ));
        }
    };
    let scope = match get(&identity, "scope") {
        Some(Value::String(v)) if v == &k("document") => Some(Scope::Document),
        Some(Value::String(v)) if v == &k("module") => Some(Scope::Module),
        Some(Value::String(v)) if v == &k("element") => Some(Scope::Element),
        _ => None,
    };
    // TypeScript checks known members against the scope-derived allowlist
    // before it reports a missing/invalid explicit identity. Preserve object
    // insertion order so the first unknown key wins exactly as it does there.
    let allowed: &[&str] = match scope {
        Some(Scope::Document) => &["scope"],
        Some(Scope::Module) => &["scope", "module"],
        Some(Scope::Element) => &["scope", "module", "element"],
        None => &[],
    };
    known(&identity, allowed, "/identity", ctx)?;
    let scope =
        scope.ok_or_else(|| err("CORE_SCHEMA_PROPERTIES", "Explicit identity required", ""))?;
    if fields.len() != allowed.len() {
        return Err(err(
            "CORE_SCHEMA_PROPERTIES",
            "Explicit identity required",
            "",
        ));
    }
    if matches!(scope, Scope::Document) {
        return Ok(Located {
            source,
            identity,
            node_path: String::new(),
            path: String::new(),
            scope,
            diagnostics,
        });
    }
    let module = match get(&identity, "module") {
        Some(Value::String(v)) if !v.is_empty() => v,
        _ => {
            return Err(err(
                "CORE_SCHEMA_PROPERTIES",
                "Nonempty module ID required",
                "",
            ));
        }
    };
    let modules = match get(&source, "modules") {
        Some(Value::Array(v)) => v,
        _ => return Err(err("CORE_SCHEMA_PROPERTIES", "Module not found", "")),
    };
    let mi = modules
        .iter()
        .position(|item| get(item, "id") == Some(&Value::String(module.clone())))
        .ok_or_else(|| err("CORE_SCHEMA_PROPERTIES", "Module not found", ""))?;
    if matches!(scope, Scope::Module) {
        return Ok(Located {
            source,
            identity,
            node_path: format!("/modules/{mi}"),
            path: format!("/modules/{mi}"),
            scope,
            diagnostics,
        });
    }
    let element = match get(&identity, "element") {
        Some(Value::String(v)) if !v.is_empty() => v,
        _ => {
            return Err(err(
                "CORE_SCHEMA_PROPERTIES",
                "Nonempty element ID required",
                "",
            ));
        }
    };
    let elements = match get(&modules[mi], "elements") {
        Some(Value::Array(v)) => v,
        _ => return Err(err("CORE_SCHEMA_PROPERTIES", "Element not found", "")),
    };
    let ei = elements
        .iter()
        .position(|item| get(item, "id") == Some(&Value::String(element.clone())))
        .ok_or_else(|| err("CORE_SCHEMA_PROPERTIES", "Element not found", ""))?;
    Ok(Located {
        source,
        identity,
        node_path: format!("/modules/{mi}/elements/{ei}"),
        path: format!("/modules/{mi}/elements/{ei}"),
        scope,
        diagnostics,
    })
}
fn selected<'a>(source: &'a Value, node_path: &str) -> Option<&'a Value> {
    let parts = node_path
        .split('/')
        .filter(|x| !x.is_empty())
        .collect::<Vec<_>>();
    let mut node = source;
    for (depth, part) in parts.iter().enumerate() {
        let index = if depth % 2 == 1 {
            part.parse::<usize>().ok()
        } else {
            None
        };
        node = if let Some(i) = index {
            match node {
                Value::Array(a) => a.get(i)?,
                _ => return None,
            }
        } else {
            get(node, part)?
        };
    }
    Some(node)
}
fn selected_mut<'a>(source: &'a mut Value, node_path: &str) -> Option<&'a mut Value> {
    fn walk<'a>(v: &'a mut Value, parts: &[&str], depth: usize) -> Option<&'a mut Value> {
        if parts.is_empty() {
            return Some(v);
        }
        if depth % 2 == 1 {
            let i = parts[0].parse::<usize>().ok()?;
            let a = match v {
                Value::Array(a) => a,
                _ => return None,
            };
            return walk(a.get_mut(i)?, &parts[1..], depth + 1);
        }
        let fields = match v {
            Value::Object(fields) => fields,
            _ => return None,
        };
        let index = fields
            .iter()
            .position(|(k, _)| k == &Utf16::from(parts[0]))?;
        walk(&mut fields[index].1, &parts[1..], depth + 1)
    }
    walk(
        source,
        &node_path
            .split('/')
            .filter(|x| !x.is_empty())
            .collect::<Vec<_>>(),
        0,
    )
}
const PROPERTY_NAMES: [&str; 5] = ["title", "aliases", "examples", "allowedValues", "default"];
pub fn inspect_core_schema_properties(
    source: &Value,
    identity: &Value,
    engine: &Engine,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let located = locate(source, identity, engine, ctx)?;
    inspect_located(located, ctx)
}

/// Inspect already-admitted host operands without charging a second JSON copy.
pub(crate) fn inspect_core_schema_properties_admitted(
    source: Value,
    identity: Value,
    engine: &Engine,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let located = locate_copied(source, identity, engine, ctx)?;
    inspect_located(located, ctx)
}

fn inspect_located(located: Located, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let node = if located.node_path.is_empty() {
        &located.source
    } else {
        selected(&located.source, &located.node_path)
            .ok_or_else(|| err("CORE_SCHEMA_PROPERTIES", "Selected node is absent", ""))?
    };
    let mut properties = Vec::new();
    for name in PROPERTY_NAMES.into_iter().chain(["facets"]) {
        if let Some(value) = get(node, name) {
            properties.push((k(name), copy_json(value, ctx)?));
        }
    }
    Ok(object(vec![
        ("operation", text("inspect-core-schema-properties")),
        ("version", text("2.0.0")),
        ("source", located.source),
        ("identity", located.identity),
        ("path", text(&located.path)),
        ("properties", Value::Object(properties)),
        ("diagnostics", located.diagnostics),
        ("provenance", text("unverified")),
    ]))
}

fn validation_value(valid: bool, complete: bool, diagnostics: Vec<Diagnostic>) -> Value {
    Value::Object(vec![
        (k("valid"), Value::Bool(valid)),
        (k("complete"), Value::Bool(complete)),
        (k("diagnostics"), validation_json(diagnostics)),
    ])
}

/// Convert a Rust admission failure to the Validation diagnostic used by the
/// TypeScript field-value operation. Cooperative-control failures stay errors.
pub(crate) fn field_value_admission_refusal(error: EngineError) -> Result<Value, EngineError> {
    if error.is_control_failure() || matches!(error.code.as_str(), "HOST_JSON_CALLBACK" | "HOST_JSON_BRIDGE" | "HOST_JSON_PROTOCOL") {
        return Err(error);
    }
    Ok(validation_value(false, false, vec![Diagnostic {
        code: Utf16::from(error.code),
        path: error.path,
        python_source_path: false,
        message: error.message,
        severity: Severity::Error,
        python_text_origin: None,
    }]))
}

/// Host-input field-value route. `field` and `value` have already been copied
/// in predecessor order; source remains opaque until identity admission passes.
pub(crate) fn validate_core_field_value_host_json(
    source_handle: HostHandle,
    field: Value,
    value: Value,
    host: &mut dyn HostJsonReflection,
    engine: &Engine,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    if let Some(validation) = Engine::preflight_core_field_value_identity(&field) {
        return Ok(validation_value(validation.valid, validation.complete, validation.diagnostics));
    }
    let source = match copy_host_json(source_handle, host, ctx) {
        Ok(value) => value,
        Err(error) => return field_value_admission_refusal(error),
    };
    // `locate` in the predecessor copies its synthetic element identity after
    // source copying. Keep that pure copied-tree work in the same Context.
    let mut identity_fields = vec![(k("scope"), text("element"))];
    if let Some(module) = get(&field, "module") { identity_fields.push((k("module"), module.clone())); }
    if let Some(element) = get(&field, "element") { identity_fields.push((k("element"), element.clone())); }
    let copied_identity = match copy_json(&Value::Object(identity_fields), ctx) {
        Ok(value) => value,
        Err(error) => return field_value_admission_refusal(error),
    };
    let field_identity = match copied_identity {
        Value::Object(fields) => Value::Object(fields.into_iter().filter(|(key, _)| key != &k("scope")).collect()),
        _ => unreachable!(),
    };
    let validation = engine.validate_core_field_value_after_admission_with_host(
        source,
        field_identity,
        value,
        host,
        ctx,
    )?;
    Ok(validation_value(validation.valid, validation.complete, validation.diagnostics))
}

/// Validate known default operands before reflecting the source argument.
pub(crate) fn preflight_core_default_operands(
    field: &Value,
    state: &Value,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let Value::Object(state_fields) = state else {
        return Err(err("CORE_SCHEMA_PROPERTIES", "Expected object", "/state"));
    };
    let state_name = get(state, "state").and_then(|value| match value { Value::String(s) => Some(s), _ => None });
    let missing = state_name == Some(&k("missing"));
    let present = state_name == Some(&k("present"));
    for (key, _) in state_fields {
        if key != &k("state") && !(!missing && key == &k("value")) {
            ctx.charge_text(key.len().saturating_mul(2).saturating_add(48), k("/state"))?;
            return Err(unknown(key, "/state/"));
        }
    }
    if (!missing && !present) || (present && get(state, "value").is_none()) ||
        (missing && state_fields.len() != 1) || (present && state_fields.len() != 2) {
        return Err(err("CORE_SCHEMA_PROPERTIES", "Explicit missing/present state required", ""));
    }
    // Only relevant-member admission precedes source. Cardinality and
    // nonempty-value checks remain after source validation in the operation.
    let Value::Object(fields) = field else {
        return Err(err("CORE_SCHEMA_PROPERTIES", "Expected object", "/identity"));
    };
    for (key, _) in fields {
        if key != &k("module") && key != &k("element") {
            ctx.charge_text(key.len().saturating_mul(2).saturating_add(48), k("/identity"))?;
            return Err(unknown(key, "/identity/"));
        }
    }
    Ok(())
}
pub fn declare_core_schema_properties(
    source: &Value,
    identity: &Value,
    patch: &Value,
    engine: &Engine,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let request = copy_json(patch, ctx)?;
    validate_declaration_request(&request, ctx)?;
    let located = locate(source, identity, engine, ctx)?;
    declare_from_located(request, located, engine, ctx)
}

/// Opt-in staged host-input route. The patch is copied and refused before any
/// source reflection; source is then copied before identity, all in one Context.
pub fn declare_core_schema_properties_host_json(
    source: HostHandle,
    identity: HostHandle,
    patch: HostHandle,
    host: &mut dyn HostJsonReflection,
    engine: &Engine,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let request = copy_host_json(patch, host, ctx)?;
    validate_declaration_request(&request, ctx)?;
    let source = copy_host_json(source, host, ctx)?;
    let identity = copy_host_json(identity, host, ctx)?;
    let located = locate_copied(source, identity, engine, ctx)?;
    declare_from_located(request, located, engine, ctx)
}

fn validate_declaration_request(request: &Value, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    known(
        request,
        &[
            "title",
            "aliases",
            "examples",
            "allowedValues",
            "default",
            "facets",
        ],
        "/request",
        ctx,
    )?;
    if !matches!(request, Value::Object(fields) if !fields.is_empty()) {
        return Err(err("CORE_SCHEMA_PROPERTIES", "Empty declaration", ""));
    }
    Ok(())
}

fn declare_from_located(
    request: Value,
    located: Located,
    engine: &Engine,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let mut target = copy_json(&located.source, ctx)?;
    let node = selected_mut(&mut target, &located.node_path)
        .ok_or_else(|| err("CORE_SCHEMA_PROPERTIES", "Selected node is absent", ""))?;
    if !matches!(located.scope, Scope::Element)
        && matches!(&request,Value::Object(fields) if fields.iter().any(|(key,_)| !["title","aliases"].iter().any(|name|key==&Utf16::from(*name))))
    {
        return Err(err(
            "CORE_SCHEMA_PROPERTIES",
            "Value properties apply only to Fields",
            "",
        ));
    }
    if matches!(located.scope, Scope::Element)
        && get(node, "kind") != Some(&text("field"))
        && matches!(&request,Value::Object(fields) if fields.iter().any(|(key,_)| !["title","aliases"].iter().any(|name|key==&Utf16::from(*name))))
    {
        return Err(err(
            "CORE_SCHEMA_PROPERTIES",
            "Value properties apply only to Fields",
            "",
        ));
    }
    let request_fields = match &request {
        Value::Object(r) => r,
        _ => return Err(err("CORE_SCHEMA_PROPERTIES", "Expected object", "/request")),
    };
    for name in PROPERTY_NAMES {
        if let Some((_, value)) = request_fields.iter().find(|(key, _)| key == &k(name)) {
            if name == "default" {
                if let Some(old) = get(node, "default") {
                    known(
                        old,
                        &["value", "on"],
                        &format!("{}/default", located.path),
                        ctx,
                    )?;
                }
            }
            let copied = copy_json(value, ctx)?;
            let target_fields = match node {
                Value::Object(v) => v,
                _ => unreachable!(),
            };
            if let Some(i) = target_fields.iter().position(|(key, _)| key == &k(name)) {
                target_fields[i].1 = copied
            } else {
                target_fields.push((k(name), copied));
            }
        }
    }
    if let Some(facets_patch) = get(&request, "facets") {
        known(
            facets_patch,
            &["length", "collectionSize", "range"],
            "/request/facets",
            ctx,
        )?;
        let old_facets = get(node, "facets")
            .cloned()
            .unwrap_or_else(|| Value::Object(Vec::new()));
        let Value::Object(groups) = facets_patch else {
            return Err(err(
                "CORE_SCHEMA_PROPERTIES",
                "Expected object",
                "/request/facets",
            ));
        };
        let mut facets = match old_facets {
            Value::Object(v) => v,
            _ => {
                return Err(err(
                    "CORE_SCHEMA_PROPERTIES",
                    "Expected object",
                    &(located.path + "/facets"),
                ));
            }
        };
        for (group, changes) in groups {
            let group_name = group.to_utf8().unwrap_or_default();
            let allowed: &[&str] = match group_name.as_str() {
                "length" => &["min", "max", "unit"],
                "range" => &["min", "max", "minInclusive", "maxInclusive"],
                "collectionSize" => &["min", "max"],
                _ => return Err(unknown(group, "/request/facets/")),
            };
            known(
                changes,
                allowed,
                &format!("/request/facets/{group_name}"),
                ctx,
            )?;
            if let Some((_, old)) = facets.iter().find(|(key, _)| key == group) {
                known(
                    old,
                    allowed,
                    &format!("{}/facets/{group_name}", located.path),
                    ctx,
                )?;
                if group_name == "length"
                    && get(old, "unit").is_some()
                    && get(old, "unit") != get(changes, "unit")
                {
                    return Err(err(
                        "CORE_SCHEMA_PROPERTIES",
                        "Length unit changes require a separate explicit migration",
                        "",
                    ));
                }
            }
            let mut merged = match facets
                .iter()
                .find(|(key, _)| key == group)
                .map(|(_, v)| v.clone())
                .unwrap_or_else(|| Value::Object(Vec::new()))
            {
                Value::Object(v) => v,
                _ => {
                    return Err(err(
                        "CORE_SCHEMA_PROPERTIES",
                        "Expected object",
                        &format!("{}/facets/{group_name}", located.path),
                    ));
                }
            };
            let Value::Object(change_fields) = changes else {
                return Err(err(
                    "CORE_SCHEMA_PROPERTIES",
                    "Expected object",
                    &format!("/request/facets/{group_name}"),
                ));
            };
            for (key, value) in change_fields {
                let copied = copy_json(value, ctx)?;
                if let Some(i) = merged.iter().position(|(name, _)| name == key) {
                    merged[i].1 = copied
                } else {
                    merged.push((key.clone(), copied));
                }
            }
            if let Some(i) = facets.iter().position(|(key, _)| key == group) {
                facets[i].1 = Value::Object(merged)
            } else {
                facets.push((group.clone(), Value::Object(merged)));
            }
        }
        if let Value::Object(node_fields) = node {
            if let Some(i) = node_fields.iter().position(|(key, _)| key == &k("facets")) {
                node_fields[i].1 = Value::Object(facets)
            } else {
                node_fields.push((k("facets"), Value::Object(facets)));
            }
        }
    }
    if let Some(Value::Array(values)) = get(&request, "allowedValues") {
        let field = selected(&target, &located.node_path)
            .ok_or_else(|| err("CORE_SCHEMA_PROPERTIES", "Selected node is absent", ""))?;
        for value in values {
            let result = engine.validate_schema_literal_public(&target, field, value, ctx)?;
            if !result.valid {
                let diagnostic = result
                    .diagnostics
                    .iter()
                    .find(|diagnostic| diagnostic.severity == Severity::Error)
                    .expect("invalid literal validation has an error diagnostic");
                return Err(EngineError::new(
                    diagnostic.code.to_utf8().unwrap_or_default(),
                    diagnostic.path.clone(),
                    diagnostic.message.clone(),
                ));
            }
        }
    }
    if let Some(default) = get(&request, "default") {
        if let Some(value) = get(default, "value") {
            let field = selected(&target, &located.node_path)
                .ok_or_else(|| err("CORE_SCHEMA_PROPERTIES", "Selected node is absent", ""))?;
            let result = engine.validate_schema_literal_public(&target, field, value, ctx)?;
            if !result.valid {
                let diagnostic = result
                    .diagnostics
                    .iter()
                    .find(|diagnostic| diagnostic.severity == Severity::Error)
                    .expect("invalid literal validation has an error diagnostic");
                return Err(EngineError::new(
                    diagnostic.code.to_utf8().unwrap_or_default(),
                    diagnostic.path.clone(),
                    diagnostic.message.clone(),
                ));
            }
        }
    }
    validate_edited_source(&target, engine, ctx)?;
    Ok(target)
}

/// Post-edit validation mirrors TypeScript's declaration path: retain the
/// validator's complete ordered diagnostics in the refusal message.
fn validate_edited_source(
    source: &Value,
    engine: &Engine,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let mut caps = no_caps();
    let validation = engine.validate_document(source, &Registry::default(), &mut caps, ctx)?;
    if !validation.valid {
        let diagnostics = validation_json(validation.diagnostics);
        let message = crate::serialization::stringify_compact_metered(&diagnostics, ctx)?;
        return Err(EngineError::new(
            "CORE_SCHEMA_PROPERTIES",
            Utf16::default(),
            message,
        ));
    }
    Ok(())
}
