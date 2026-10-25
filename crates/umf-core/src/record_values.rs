// SPDX-License-Identifier: MIT OR Apache-2.0
//! Opt-in logical membership/presence checks for core Record values.
//! This does not check physical rows, defaults, keys, or dataset uniqueness.
use crate::{
    context::Context,
    engine::{Capabilities, Engine},
    error::{Diagnostic, EngineError, Severity},
    host_json::{copy_host_json, HostHandle, HostJsonReflection},
    registry::Registry,
    value::{copy_json, Utf16, Value},
};
use std::collections::{BTreeMap, BTreeSet};

fn k(s: &str) -> Utf16 {
    Utf16::from(s)
}
fn get<'a>(v: &'a Value, n: &str) -> Option<&'a Value> {
    match v {
        Value::Object(m) => m.iter().find(|(x, _)| x == &k(n)).map(|(_, v)| v),
        _ => None,
    }
}
fn text(v: Option<&Value>) -> Option<&Utf16> {
    match v {
        Some(Value::String(s)) => Some(s),
        _ => None,
    }
}
fn obj(items: Vec<(&str, Value)>) -> Value {
    Value::Object(items.into_iter().map(|(n, v)| (k(n), v)).collect())
}
fn s(v: &str) -> Value {
    Value::string_utf8(v)
}
fn diag(code: &str, path: &str, message: &str, severity: Severity) -> Diagnostic {
    Diagnostic {
        code: k(code),
        path: k(path),
        python_source_path: false,
        message: k(message),
        severity,
        python_text_origin: None,
    }
}
fn diag_utf16(code: &str, path: Utf16, message: Utf16, severity: Severity) -> Diagnostic {
    Diagnostic {
        code: k(code),
        path,
        python_source_path: false,
        message,
        severity,
        python_text_origin: None,
    }
}
fn validation(valid: bool, complete: bool, diagnostics: Vec<Diagnostic>) -> Value {
    obj(vec![
        ("valid", Value::Bool(valid)),
        ("complete", Value::Bool(complete)),
        (
            "diagnostics",
            Value::Array(
                diagnostics
                    .into_iter()
                    .map(|d| {
                        obj(vec![
                            ("code", Value::String(d.code)),
                            ("path", Value::String(d.path)),
                            ("message", Value::String(d.message)),
                            (
                                "severity",
                                s(match d.severity {
                                    Severity::Error => "error",
                                    Severity::Warning => "warning",
                                }),
                            ),
                        ])
                    })
                    .collect(),
            ),
        ),
    ])
}
fn ptr(value: &Utf16) -> Utf16 {
    let mut units = Vec::with_capacity(value.len());
    for unit in value.units() {
        match *unit {
            0x007e => units.extend([0x007e, 0x0030]),
            0x002f => units.extend([0x007e, 0x0031]),
            other => units.push(other),
        }
    }
    Utf16::new(units)
}
fn identity_key(v: &Value) -> Option<(Utf16, Utf16)> {
    Some((
        text(get(v, "module"))?.clone(),
        text(get(v, "element"))?.clone(),
    ))
}
fn find_element<'a>(source: &'a Value, module: &Utf16, element: &Utf16) -> Option<&'a Value> {
    let Value::Array(modules) = get(source, "modules")? else {
        return None;
    };
    let m = modules
        .iter()
        .find(|m| text(get(m, "id")) == Some(module))?;
    let Value::Array(elements) = get(m, "elements")? else {
        return None;
    };
    elements
        .iter()
        .find(|e| text(get(e, "id")) == Some(element))
}
fn make_error(code: &str, message: &str, path: &str) -> EngineError {
    EngineError::new(code, k(path), message)
}
fn child_path(path: &Utf16, key: &Utf16) -> Utf16 {
    let mut units = path.units().to_vec();
    units.push('/' as u16);
    for u in key.units() {
        match *u {
            0x7e => units.extend([0x7e, 0x30]),
            0x2f => units.extend([0x7e, 0x31]),
            other => units.push(other),
        }
    }
    Utf16::new(units)
}
fn first_structural_limit_path(
    value: &Value,
    ctx: &mut Context<'_>,
    limit: usize,
) -> Result<Utf16, EngineError> {
    fn visit(
        value: &Value,
        path: &Utf16,
        ctx: &mut Context<'_>,
        limit: usize,
        count: &mut usize,
        depth: usize,
    ) -> Result<Option<Utf16>, EngineError> {
        ctx.charge_work(1, path.clone())?;
        *count = count.saturating_add(1);
        if *count > limit || depth > ctx.limits().max_depth {
            return Ok(Some(path.clone()));
        }
        match value {
            Value::Array(items) => {
                for (i, item) in items.iter().enumerate() {
                    let p = child_path(path, &Utf16::from(i.to_string()));
                    if let Some(p) = visit(item, &p, ctx, limit, count, depth + 1)? {
                        return Ok(Some(p));
                    }
                }
            }
            Value::Object(items) => {
                for (key, item) in items {
                    let p = child_path(path, key);
                    if let Some(p) = visit(item, &p, ctx, limit, count, depth + 1)? {
                        return Ok(Some(p));
                    }
                }
            }
            _ => {}
        }
        Ok(None)
    }
    let mut count = 0;
    Ok(visit(value, &Utf16::default(), ctx, limit, &mut count, 0)?.unwrap_or_default())
}

fn unknown_member(name: &Utf16, base_path: &str) -> EngineError {
    let mut path = base_path.encode_utf16().collect::<Vec<_>>();
    // TypeScript knownSchemaMembers composes this path from the raw key.
    path.extend(name.units());
    let mut message = "Unknown relevant qualifier: "
        .encode_utf16()
        .collect::<Vec<_>>();
    message.extend(name.units());
    EngineError::new(
        "CORE_SCHEMA_PROPERTY_UNKNOWN",
        Utf16::new(path),
        Utf16::new(message),
    )
}

fn check_identity(value: &Value) -> Result<(Utf16, Utf16), EngineError> {
    let Value::Object(fields) = value else {
        return Err(make_error(
            "CORE_SCHEMA_PROPERTIES",
            "Expected object",
            "/identity",
        ));
    };
    for (name, _) in fields {
        if name != &k("module") && name != &k("element") {
            return Err(unknown_member(name, "/identity/"));
        }
    }
    let module = text(get(value, "module"));
    let element = text(get(value, "element"));
    if fields.len() != 2
        || module.is_none_or(Utf16::is_empty)
        || element.is_none_or(Utf16::is_empty)
    {
        return Err(make_error(
            "CORE_RECORD_VALUE_IDENTITY",
            "Explicit qualified identity required",
            "",
        ));
    }
    Ok((module.unwrap().clone(), element.unwrap().clone()))
}

/// Rust core counterpart to `validateCoreRecordValues`; callers opt in explicitly.
pub fn validate_core_record_values(
    engine: &Engine,
    source_input: &Value,
    identity_input: &Value,
    values_input: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let source = copy_json(source_input, ctx)?;
    let identity = copy_json(identity_input, ctx)?;
    let values = copy_json(values_input, ctx)?;
    validate_core_record_values_admitted(engine, source, identity, values, ctx)
}

/// Validate values that have already crossed the Rust-owned host-json admission
/// boundary. The inputs are owned snapshots and are never revisited in the host.
pub fn validate_core_record_values_admitted(
    engine: &Engine,
    source: Value,
    identity: Value,
    values: Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    if get(&source, "umf") != Some(&s("0.10.0")) {
        return Err(make_error(
            "CORE_RECORD_VALUE_SOURCE",
            "Valid current core 0.10.0 source required",
            "",
        ));
    }
    let mut caps = NoCapabilities;
    let document_validation =
        engine.validate_document(&source, &Registry::default(), &mut caps, ctx)?;
    if !document_validation.valid {
        return Err(make_error(
            "CORE_RECORD_VALUE_SOURCE",
            "Valid current core 0.10.0 source required",
            "",
        ));
    }
    let body = evaluate_core_record_values_body(
        engine,
        &source,
        &identity,
        &values,
        &document_validation,
        ctx,
        false,
    )?;
    finalize_record_result(with_full_record_source(body, &source), ctx)
}

/// Host-owned `umf.host-json/1` admission followed by the same core semantics.
/// Admission order is source, identity, then values and shares this invocation's
/// Context with document validation, value checks and result construction.
pub fn validate_core_record_values_host_json(
    source: HostHandle,
    identity: HostHandle,
    values: HostHandle,
    host: &mut dyn HostJsonReflection,
    engine: &Engine,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let source = copy_host_json(source, host, ctx)?;
    let identity = copy_host_json(identity, host, ctx)?;
    let values = copy_host_json(values, host, ctx)?;
    validate_core_record_values_admitted(engine, source, identity, values, ctx)
}
pub(crate) fn evaluate_core_record_values_body(
    engine: &Engine,
    source: &Value,
    identity: &Value,
    values_tree: &Value,
    document_validation: &crate::error::Validation,
    ctx: &mut Context<'_>,
    compact: bool,
) -> Result<Value, EngineError> {
    let (module, element) = check_identity(identity)?;
    let Value::Array(values) = values_tree else {
        return Err(make_error(
            "CORE_RECORD_VALUE_INPUT",
            "Explicit field-state array required",
            "",
        ));
    };
    let record = find_element(source, &module, &element)
        .filter(|e| get(e, "kind") == Some(&s("record")))
        .ok_or_else(|| make_error("CORE_RECORD_VALUE_IDENTITY", "Record identity required", ""))?;
    let mut supplied: Vec<((Utf16, Utf16), &Value)> = Vec::new();
    let mut supplied_ids = BTreeSet::new();
    let mut supplied_values = BTreeMap::new();
    let mut diagnostics: Vec<Diagnostic> = document_validation
        .diagnostics
        .iter()
        .filter(|d| {
            d.severity == Severity::Warning
                && !d
                    .code
                    .units()
                    .starts_with(&"EXPERIMENTAL_".encode_utf16().collect::<Vec<_>>())
        })
        .cloned()
        .collect();
    for (i, v) in values.iter().enumerate() {
        ctx.charge_work(1, k("/values"))?;
        let at = format!("/values/{i}");
        let Value::Object(fields) = v else {
            return Err(make_error(
                "CORE_RECORD_VALUE_INPUT",
                "Explicit field-state object required",
                "",
            ));
        };
        let state = text(get(v, "state"))
            .and_then(|x| x.to_utf8().ok())
            .unwrap_or_default();
        let expected = if state == "present" {
            &["field", "state", "value"][..]
        } else {
            &["field", "state"][..]
        };
        for (name, _) in fields {
            if !expected.iter().any(|x| name == &k(x)) {
                return Err(unknown_member(name, &(at.clone() + "/")));
            }
        }
        if !["absent", "present"].contains(&state.as_str())
            || (state == "present" && get(v, "value").is_none())
        {
            return Err(make_error(
                "CORE_RECORD_VALUE_INPUT",
                "Explicit absent/present value required",
                &at,
            ));
        }
        let field_value = get(v, "field")
            .ok_or_else(|| make_error("CORE_SCHEMA_PROPERTIES", "Expected object", "/identity"))?;
        let field = check_identity(field_value)?;
        ctx.charge_work(1, k("/values"))?;
        if !supplied_ids.insert(field.clone()) {
            diagnostics.push(diag(
                "DUPLICATE_RECORD_VALUE",
                &at,
                "Duplicate qualified Field value",
                Severity::Error,
            ));
        } else {
            supplied_values.insert(field.clone(), v);
            supplied.push((field, v));
        }
    }
    let members = get(record, "members").and_then(|v| {
        if let Value::Array(a) = v {
            Some(a)
        } else {
            None
        }
    });
    if members.is_none() {
        diagnostics.push(diag(
            "RECORD_MEMBERS_UNSPECIFIED",
            "/identity",
            "Record member inventory is not declared",
            Severity::Warning,
        ));
    }
    let members = members.cloned().unwrap_or_default();
    let ids: BTreeSet<_> = members.iter().filter_map(identity_key).collect();
    for (id, _) in &supplied {
        ctx.charge_work(1, k("/values"))?;
        if !ids.contains(id) {
            let pair = Value::Array(vec![
                Value::String(id.0.clone()),
                Value::String(id.1.clone()),
            ]);
            let rendered = crate::serialization::stringify_compact_metered(&pair, ctx)?;
            let mut message = "Value is not a declared Record member: "
                .encode_utf16()
                .collect::<Vec<_>>();
            message.extend(rendered.units());
            diagnostics.push(diag_utf16(
                "UNDECLARED_RECORD_VALUE",
                k("/values"),
                Utf16::new(message),
                Severity::Error,
            ));
        }
    }
    let mut element_index = BTreeMap::new();
    if let Some(Value::Array(modules)) = get(source, "modules") {
        for module in modules {
            let Some(module_id) = text(get(module, "id")) else {
                continue;
            };
            if let Some(Value::Array(elements)) = get(module, "elements") {
                for element in elements {
                    let Some(element_id) = text(get(element, "id")) else {
                        continue;
                    };
                    ctx.charge_work(
                        module_id
                            .len()
                            .saturating_add(element_id.len())
                            .saturating_add(1),
                        k("/modules"),
                    )?;
                    element_index.insert((module_id.clone(), element_id.clone()), element);
                }
            }
        }
    }
    let mut field_results = Vec::new();
    for member in &members {
        ctx.charge_work(1, k("/members"))?;
        let Some((fm, fe)) = identity_key(member) else {
            continue;
        };
        let found = supplied_values.get(&(fm.clone(), fe.clone())).copied();
        let state = found
            .and_then(|v| get(v, "state"))
            .unwrap_or(&s("absent"))
            .clone();
        let mut at_units = "/members/".encode_utf16().collect::<Vec<_>>();
        at_units.extend(ptr(&fm).units());
        at_units.push('/' as u16);
        at_units.extend(ptr(&fe).units());
        let at = Utf16::new(at_units);
        let mut local = Vec::new();
        if let Some(field) = element_index
            .get(&(fm.clone(), fe.clone()))
            .copied()
            .filter(|e| get(e, "kind") == Some(&s("field")))
        {
            let null = get(field, "nullability");
            let card = get(field, "cardinality");
            if null != Some(&s("required")) && null != Some(&s("absent-allowed")) {
                local.push(diag_utf16(
                    "RECORD_AVAILABILITY_UNKNOWN",
                    at.clone(),
                    k("Complete availability requires explicit required or absent-allowed"),
                    Severity::Warning,
                ));
            }
            if card != Some(&s("one")) && card != Some(&s("array")) && card != Some(&s("map")) {
                local.push(diag_utf16(
                    "RECORD_CARDINALITY_UNKNOWN",
                    at.clone(),
                    k("Complete shape requires explicit one/array/map"),
                    Severity::Warning,
                ));
            }
            if state == s("absent") {
                if null == Some(&s("required")) {
                    local.push(diag_utf16(
                        "REQUIRED_RECORD_VALUE",
                        at.clone(),
                        k("Required Field is absent; defaults are not applied"),
                        Severity::Error,
                    ));
                }
            } else if let Some(value) = found.and_then(|v| get(v, "value")) {
                let result =
                    engine.validate_core_field_value_admitted(source, field, value, ctx)?;
                local.extend(result.diagnostics.into_iter().map(|mut d| {
                    let mut p = at.units().to_vec();
                    p.extend(d.path.units());
                    d.path = Utf16::new(p);
                    d
                }));
                if !result.complete && local.is_empty() {
                    local.push(diag_utf16(
                        "FIELD_CHECK_INCOMPLETE",
                        at.clone(),
                        k("Original Field checker is incomplete"),
                        Severity::Warning,
                    ));
                }
            }
        } else {
            local.push(diag_utf16(
                "RECORD_MEMBER_INTERPRETATION",
                at.clone(),
                k("Member is not a supported Field"),
                Severity::Warning,
            ));
        }
        diagnostics.extend(local.clone());
        field_results.push(obj(vec![
            (
                "field",
                obj(vec![
                    ("module", Value::String(fm)),
                    ("element", Value::String(fe)),
                ]),
            ),
            ("state", state),
            (
                "validation",
                validation(
                    !local.iter().any(|d| d.severity == Severity::Error),
                    local.is_empty(),
                    local,
                ),
            ),
        ]));
    }
    if matches!(get(record,"keys"),Some(Value::Array(a)) if !a.is_empty()) {
        diagnostics.push(diag(
            "RECORD_KEY_CONTEXT_REQUIRED",
            "/identity",
            "Dataset key equality/uniqueness needs a separately qualified check",
            Severity::Warning,
        ));
    }
    if matches!(get(source,"modules"),Some(Value::Array(ms)) if ms.iter().any(|m|matches!(get(m,"relationships"),Some(Value::Array(a)) if !a.is_empty())))
    {
        diagnostics.push(diag(
            "RECORD_RELATIONSHIP_CONTEXT_REQUIRED",
            "/identity",
            "Relationship/endpoint constraints need a separately qualified dataset check",
            Severity::Warning,
        ));
    }
    let valid = !diagnostics.iter().any(|d| d.severity == Severity::Error);
    let complete = diagnostics.is_empty();
    let mut result_fields = vec![
        ("operation".to_owned(), s("validate-core-record-values")),
        ("version".to_owned(), s("2.0.0")),
    ];
    result_fields.extend([
        ("identity".to_owned(), identity.clone()),
        ("values".to_owned(), values_tree.clone()),
        (
            "documentValidation".to_owned(),
            validation(
                document_validation.valid,
                document_validation.complete,
                document_validation.diagnostics.clone(),
            ),
        ),
        (
            "validation".to_owned(),
            validation(valid, complete, diagnostics),
        ),
        ("fields".to_owned(), Value::Array(field_results)),
    ]);
    if compact {
        result_fields.push(("sourceRef".to_owned(), s("#/source")));
    }
    Ok(Value::Object(
        result_fields
            .into_iter()
            .map(|(name, value)| (k(&name), value))
            .collect(),
    ))
}

fn with_full_record_source(mut body: Value, source: &Value) -> Value {
    if let Value::Object(fields) = &mut body {
        fields.retain(|(name, _)| name != &k("sourceRef"));
        let at = fields
            .iter()
            .position(|(name, _)| name == &k("version"))
            .map_or(0, |i| i + 1);
        fields.insert(at, (k("source"), source.clone()));
    }
    body
}
fn finalize_record_result(result: Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    match copy_json(&result, ctx) {
        Ok(value) => Ok(value),
        Err(mut error)
            if error.code == "LIMIT"
                && (error.message == k("JSON structural value limit exceeded")
                    || error.message == k("JSON nesting depth exceeded")) =>
        {
            if error.message == k("JSON structural value limit exceeded") {
                let limit = ctx.limits().max_values;
                error.path = first_structural_limit_path(&result, ctx, limit)?;
            }
            error.message = k("JSON structural limit exceeded");
            Err(error)
        }
        Err(error) => Err(error),
    }
}

struct NoCapabilities;
impl Capabilities for NoCapabilities {
    fn validate_extension(
        &mut self,
        _: u64,
        _: &Value,
        _: &crate::engine::SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        Ok(Vec::new())
    }
}
