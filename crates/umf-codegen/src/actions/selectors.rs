// SPDX-License-Identifier: MIT OR Apache-2.0
//! Rust-owned compiler and typed identity operations for actions/keys/1.
use super::{
    action_literal_errors, action_literal_wrapper, exact_members, find_element,
    read_action_expression, string_member,
};
use crate::value::array_items;
use crate::{canonical::canonical_json, generation::value, resources::CodegenEngine};
use umf_core::{Context, EngineError, Registry, Utf16, Value};

fn err(code: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}
fn at(code: &str, path: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::from(path), message)
}
fn arr(value: &Value) -> &[Value] {
    array_items(value).unwrap_or(&[])
}
fn text<'a>(value: &'a Value, key: &str) -> Option<&'a Utf16> {
    string_member(value, key)
}
fn same_ref(a: &Value, b: &Value) -> bool {
    text(a, "module") == text(b, "module") && text(a, "element") == text(b, "element")
}
fn exact_object(value: &Value, keys: &[&str], path: &str) -> Result<(), EngineError> {
    if exact_members(value, keys) {
        Ok(())
    } else {
        Err(at(
            "ACTION_SELECTOR_SYNTAX",
            path,
            "Unknown or missing selector member",
        ))
    }
}
fn selected_key<'a>(
    document: &'a Value,
    reference: &Value,
) -> Result<(&'a Value, &'a Value), EngineError> {
    exact_object(reference, &["module", "element", "key"], "/reference")?;
    let module = text(reference, "module").ok_or_else(|| {
        at(
            "ACTION_REFERENCE",
            "/reference/module",
            "Exact Record and stable Key must resolve",
        )
    })?;
    let element = text(reference, "element").ok_or_else(|| {
        at(
            "ACTION_REFERENCE",
            "/reference/element",
            "Exact Record and stable Key must resolve",
        )
    })?;
    let key_id = text(reference, "key").ok_or_else(|| {
        at(
            "ACTION_REFERENCE",
            "/reference/key",
            "Exact Record and stable Key must resolve",
        )
    })?;
    let Some((record, _, _)) = find_element(document, module, element) else {
        return Err(at(
            "ACTION_REFERENCE",
            "/reference",
            "Exact Record and stable Key must resolve",
        ));
    };
    if string_member(record, "kind")
        .and_then(|v| v.to_utf8().ok())
        .as_deref()
        != Some("record")
    {
        return Err(at(
            "ACTION_REFERENCE",
            "/reference",
            "Exact Record and stable Key must resolve",
        ));
    }
    let key = arr(value::get(record, "keys").unwrap_or(&Value::Null))
        .iter()
        .find(|key| text(key, "id") == Some(key_id))
        .ok_or_else(|| {
            at(
                "ACTION_REFERENCE",
                "/reference",
                "Exact Record and stable Key must resolve",
            )
        })?;
    Ok((record, key))
}

/// Compile one declared selector using the same Rust Action analyzer used by
/// inspection; no TypeScript selector validator is consulted.
pub fn compile_action_selector(
    engine: &CodegenEngine<'_>,
    document_input: &Value,
    action_input: &Value,
    frame_input: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let document = umf_core::copy_json(document_input, ctx)?;
    let mut capabilities = super::NoCapabilities;
    let validation = engine.resources().engine().validate_document(
        &document,
        &Registry::new(),
        &mut capabilities,
        ctx,
    )?;
    if !validation.valid {
        return Err(err(
            "ACTION_SELECTOR_SOURCE",
            "Expected valid exact core 0.10.0 document",
        ));
    }
    let action = super::admit_unified_action(engine.resources(), action_input, ctx)?;
    let frame = umf_core::copy_json(frame_input, ctx)?;
    let frame_id = text(&frame, "id").ok_or_else(|| {
        at(
            "ACTION_SELECTOR_FRAME",
            "/frame/id",
            "Selector frame requires an exact identity",
        )
    })?;
    exact_object(
        value::get(&frame, "record").unwrap_or(&Value::Null),
        &["module", "element"],
        "/frame/record",
    )?;
    let mut parameter_ids = std::collections::BTreeSet::new();
    for parameter in arr(value::get(&action, "parameters").unwrap_or(&Value::Null)) {
        if text(parameter, "id").is_none_or(|id| !parameter_ids.insert(id.clone())) {
            return Err(err(
                "ACTION_SELECTOR_SYNTAX",
                "Duplicate input identity is ambiguous",
            ));
        }
    }
    let mut frame_ids = std::collections::BTreeSet::new();
    for candidate in ["reads", "writes"]
        .iter()
        .flat_map(|name| arr(value::get(&action, name).unwrap_or(&Value::Null)))
    {
        if text(candidate, "id").is_none_or(|id| !frame_ids.insert(id.clone())) {
            return Err(err(
                "ACTION_SELECTOR_SYNTAX",
                "Duplicate frame identity is ambiguous",
            ));
        }
    }
    let mut is_declared = false;
    let frame_canonical = canonical_json(&frame, ctx)?;
    for candidate in ["reads", "writes"]
        .iter()
        .flat_map(|name| arr(value::get(&action, name).unwrap_or(&Value::Null)))
    {
        if canonical_json(candidate, ctx)? == frame_canonical {
            is_declared = true;
            break;
        }
    }
    if !is_declared {
        return Err(at(
            "ACTION_SELECTOR_FRAME",
            "/frame",
            "Selector must retain an exact declared frame",
        ));
    }
    let selector = value::get(&frame, "selector").ok_or_else(|| {
        at(
            "ACTION_SELECTOR_SYNTAX",
            "/frame/selector",
            "Selector declaration is required",
        )
    })?;
    exact_object(
        selector,
        &["language", "version", "expression", "references"],
        "/frame/selector",
    )?;
    if text(selector, "language")
        .and_then(|v| v.to_utf8().ok())
        .as_deref()
        != Some("umf.actions.keys")
        || text(selector, "version")
            .and_then(|v| v.to_utf8().ok())
            .as_deref()
            != Some("1")
    {
        return Err(at(
            "ACTION_SELECTOR_PROFILE",
            "/frame/selector",
            "Unsupported exact selector language/version",
        ));
    }
    if !matches!(value::get(&frame, "maxEntities"), Some(Value::Number(n)) if *n == 1.0) {
        return Err(at(
            "ACTION_SELECTOR_BOUND",
            "/frame/maxEntities",
            "keys/1 selects exactly one identity",
        ));
    }
    let references = array_items(value::get(selector, "references").unwrap_or(&Value::Null))
        .ok_or_else(|| {
            at(
                "ACTION_SELECTOR_SYNTAX",
                "/frame/selector/references",
                "Expected dependency array",
            )
        })?;
    for reference in references {
        if !exact_members(reference, &["parameter"]) {
            return Err(at(
                "ACTION_SELECTOR_DEPENDENCY",
                "/frame/selector/references",
                "keys/1 cannot consult outputs or business state",
            ));
        }
        let id = text(reference, "parameter").ok_or_else(|| {
            at(
                "ACTION_SELECTOR_SYNTAX",
                "/frame/selector/references",
                "Expected exact nonempty identity",
            )
        })?;
        if !arr(value::get(&action, "parameters").unwrap_or(&Value::Null))
            .iter()
            .any(|p| text(p, "id") == Some(id))
        {
            return Err(at(
                "ACTION_REFERENCE",
                "/frame/selector/references",
                "Selector dependency must resolve a parameter",
            ));
        }
    }
    let expression = text(selector, "expression").ok_or_else(|| {
        at(
            "ACTION_SELECTOR_SYNTAX",
            "/frame/selector/expression",
            "Expected exact selector expression text",
        )
    })?;
    if expression.is_empty() || expression.len() > 65_536 {
        return Err(at(
            "LIMIT",
            "/frame/selector/expression",
            "Expression text exceeds bounded profile",
        ));
    }
    let parsed = read_action_expression(expression, ctx).map_err(|failure| {
        if failure.code == "LIMIT" {
            failure
        } else {
            at(
                "ACTION_SELECTOR_SYNTAX",
                "/frame/selector/expression",
                "Invalid JSON syntax",
            )
        }
    })?;
    let ast = if let Some(entity) = value::get(&parsed, "entity") {
        exact_object(&parsed, &["entity"], "/frame/selector/expression")?;
        let id = match entity {
            Value::String(s) => s,
            _ => {
                return Err(at(
                    "ACTION_SELECTOR_SYNTAX",
                    "/frame/selector/expression/entity",
                    "Expected exact nonempty identity",
                ))
            }
        };
        let parameter = arr(value::get(&action, "parameters").unwrap_or(&Value::Null))
            .iter()
            .find(|p| text(p, "id") == Some(id));
        let target = parameter.and_then(|p| value::get(p, "target"));
        if parameter
            .and_then(|p| text(p, "kind"))
            .and_then(|s| s.to_utf8().ok())
            .as_deref()
            != Some("entity")
            || target.is_none_or(|target| !same_ref(target, value::get(&frame, "record").unwrap()))
        {
            return Err(at(
                "ACTION_SELECTOR_TYPE",
                "/frame/selector/expression",
                "Entity selector must reference the frame Record",
            ));
        }
        if !references
            .iter()
            .any(|r| exact_members(r, &["parameter"]) && text(r, "parameter") == Some(id))
        {
            return Err(at(
                "ACTION_SELECTOR_DEPENDENCY",
                "/frame/selector/expression",
                "Selector parameter dependency is undeclared",
            ));
        }
        let target = target.unwrap();
        selected_key(&document, target)?;
        Value::Object(vec![(
            Utf16::from("entity"),
            umf_core::copy_json(&Value::String(id.clone()), ctx)?,
        )])
    } else {
        exact_object(
            &parsed,
            &["key", "components"],
            "/frame/selector/expression",
        )?;
        let key_id = text(&parsed, "key")
            .filter(|s| !s.is_empty())
            .ok_or_else(|| {
                at(
                    "ACTION_SELECTOR_SYNTAX",
                    "/frame/selector/expression/key",
                    "Expected exact Key and ordered components",
                )
            })?;
        let components = array_items(value::get(&parsed, "components").unwrap_or(&Value::Null))
            .ok_or_else(|| {
                at(
                    "ACTION_SELECTOR_SYNTAX",
                    "/frame/selector/expression/components",
                    "Expected exact Key and ordered components",
                )
            })?;
        let record_ref = value::get(&frame, "record").unwrap();
        let key_ref = Value::Object(vec![
            (
                Utf16::from("module"),
                umf_core::copy_json(
                    &Value::String(text(record_ref, "module").unwrap().clone()),
                    ctx,
                )?,
            ),
            (
                Utf16::from("element"),
                umf_core::copy_json(
                    &Value::String(text(record_ref, "element").unwrap().clone()),
                    ctx,
                )?,
            ),
            (
                Utf16::from("key"),
                umf_core::copy_json(&Value::String(key_id.clone()), ctx)?,
            ),
        ]);
        let (_, key) = selected_key(&document, &key_ref)?;
        let fields = arr(value::get(key, "fields").unwrap_or(&Value::Null));
        if fields.len() != components.len() {
            return Err(at(
                "ACTION_SELECTOR_ARITY",
                "/frame/selector/expression/components",
                "Components must match declared Key order/count",
            ));
        }
        let mut normalized = Vec::with_capacity(components.len());
        for (index, component) in components.iter().enumerate() {
            let field = &fields[index];
            if let Some(input) = value::get(component, "input") {
                exact_object(
                    component,
                    &["input"],
                    "/frame/selector/expression/components",
                )?;
                let id = match input {
                    Value::String(s) if !s.is_empty() => s,
                    _ => {
                        return Err(at(
                            "ACTION_SELECTOR_SYNTAX",
                            "/frame/selector/expression/components/input",
                            "Expected exact nonempty identity",
                        ))
                    }
                };
                let parameter = arr(value::get(&action, "parameters").unwrap_or(&Value::Null))
                    .iter()
                    .find(|p| text(p, "id") == Some(id));
                let exact_field = parameter
                    .and_then(|p| value::get(p, "field"))
                    .is_some_and(|f| same_ref(f, field));
                let required = parameter
                    .is_some_and(|p| value::get(p, "required") == Some(&Value::Bool(true)));
                let is_value = parameter
                    .and_then(|p| text(p, "kind"))
                    .and_then(|s| s.to_utf8().ok())
                    .as_deref()
                    == Some("value");
                if !exact_field || !required || !is_value {
                    return Err(at(
                        "ACTION_SELECTOR_TYPE",
                        "/frame/selector/expression/components",
                        "Key component needs a required input of the exact Field",
                    ));
                }
                if !references
                    .iter()
                    .any(|r| exact_members(r, &["parameter"]) && text(r, "parameter") == Some(id))
                {
                    return Err(at(
                        "ACTION_SELECTOR_DEPENDENCY",
                        "/frame/selector/expression/components",
                        "Selector parameter dependency is undeclared",
                    ));
                }
                normalized.push(Value::Object(vec![(
                    Utf16::from("input"),
                    umf_core::copy_json(&Value::String(id.clone()), ctx)?,
                )]));
            } else if let Some(literal) = value::get(component, "literal") {
                exact_object(
                    component,
                    &["literal"],
                    "/frame/selector/expression/components",
                )?;
                if !action_literal_wrapper(engine.resources(), literal, ctx)? {
                    return Err(at(
                        "ACTION_SELECTOR_TYPE",
                        "/frame/selector/expression/components",
                        "Key component needs an exact typed literal wrapper",
                    ));
                }
                let module = text(field, "module").ok_or_else(|| {
                    at(
                        "ACTION_REFERENCE",
                        "/frame/selector/expression/components",
                        "Exact model dependency does not resolve",
                    )
                })?;
                let element = text(field, "element").ok_or_else(|| {
                    at(
                        "ACTION_REFERENCE",
                        "/frame/selector/expression/components",
                        "Exact model dependency does not resolve",
                    )
                })?;
                let field_def = find_element(&document, module, element)
                    .map(|(e, _, _)| e)
                    .ok_or_else(|| {
                        at(
                            "ACTION_REFERENCE",
                            "/frame/selector/expression/components",
                            "Exact model dependency does not resolve",
                        )
                    })?;
                if !action_literal_errors(engine.resources(), &document, field_def, literal, ctx)?
                    .is_empty()
                {
                    return Err(at(
                        "ACTION_SELECTOR_TYPE",
                        "/frame/selector/expression/components",
                        "Literal does not satisfy the declared Key Field",
                    ));
                }
                if literal == &Value::Null {
                    return Err(at(
                        "ACTION_SELECTOR_TYPE",
                        "/frame/selector/expression/components",
                        "Key components cannot be null",
                    ));
                }
                normalized.push(Value::Object(vec![(
                    Utf16::from("literal"),
                    umf_core::copy_json(literal, ctx)?,
                )]));
            } else {
                return Err(at(
                    "ACTION_SELECTOR_SYNTAX",
                    "/frame/selector/expression/components",
                    "Expected exactly one component binding",
                ));
            }
        }
        Value::Object(vec![
            (
                Utf16::from("key"),
                umf_core::copy_json(&Value::String(key_id.clone()), ctx)?,
            ),
            (Utf16::from("components"), Value::Array(normalized)),
        ])
    };
    Ok(Value::Object(vec![
        (
            Utf16::from("language"),
            Value::string_utf8("umf.actions.keys"),
        ),
        (Utf16::from("version"), Value::string_utf8("1")),
        (Utf16::from("expression"), Value::String(expression.clone())),
        (
            Utf16::from("frame"),
            umf_core::copy_json(&Value::String(frame_id.clone()), ctx)?,
        ),
        (Utf16::from("ast"), ast),
    ]))
}

fn admitted_source(
    engine: &CodegenEngine<'_>,
    document_input: &Value,
    action_input: &Value,
    ctx: &mut Context<'_>,
) -> Result<(Value, Value), EngineError> {
    let document = umf_core::copy_json(document_input, ctx)?;
    let mut capabilities = super::NoCapabilities;
    let validation = engine.resources().engine().validate_document(
        &document,
        &Registry::new(),
        &mut capabilities,
        ctx,
    )?;
    if !validation.valid {
        return Err(err(
            "ACTION_PARAMETER",
            "Expected valid exact core 0.10.0 document",
        ));
    }
    let action = super::admit_unified_action(engine.resources(), action_input, ctx)?;
    Ok((document, action))
}

fn key_tuple(
    engine: &CodegenEngine<'_>,
    document: &Value,
    identity: &Value,
    values: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let mut capabilities = super::NoCapabilities;
    umf_core::core_key_tuple::encode_core_key_tuple(
        document,
        identity,
        values,
        None,
        engine.resources().engine(),
        &Registry::new(),
        &mut capabilities,
        ctx,
    )
}

fn admit_inputs(
    engine: &CodegenEngine<'_>,
    document: &Value,
    action: &Value,
    supplied_input: &Value,
    outputs: bool,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let supplied = umf_core::copy_json(supplied_input, ctx)?;
    let Value::Object(fields) = &supplied else {
        return Err(err(
            "ACTION_PARAMETER",
            "Inputs must be an exact parameter map",
        ));
    };
    let parameters_name = if outputs { "outputs" } else { "parameters" };
    let parameters = arr(value::get(action, parameters_name).unwrap_or(&Value::Null));
    let mut ids = std::collections::BTreeSet::new();
    for parameter in parameters {
        let id = text(parameter, "id").ok_or_else(|| {
            err(
                "ACTION_PARAMETER",
                "Parameter identity must be a nonempty string",
            )
        })?;
        if !ids.insert(id.clone()) {
            return Err(err(
                "ACTION_PARAMETER",
                "Duplicate parameter identity is ambiguous",
            ));
        }
    }
    for (key, _) in fields {
        if !ids.contains(key) {
            return Err(err("ACTION_PARAMETER", "Unknown input/output identity"));
        }
    }
    for parameter in parameters {
        let id = text(parameter, "id").ok_or_else(|| {
            err(
                "ACTION_PARAMETER",
                "Parameter identity must be a nonempty string",
            )
        })?;
        let supplied_value = fields
            .iter()
            .find(|(key, _)| key == id)
            .map(|(_, value)| value);
        let Some(supplied_value) = supplied_value else {
            if value::get(parameter, "required") == Some(&Value::Bool(true)) {
                return Err(at(
                    "ACTION_PARAMETER",
                    &format!("/inputs/{}", id.to_utf8().unwrap_or_default()),
                    "Required value is absent",
                ));
            }
            continue;
        };
        match text(parameter, "kind")
            .and_then(|kind| kind.to_utf8().ok())
            .as_deref()
        {
            Some("value") => {
                if !action_literal_wrapper(engine.resources(), supplied_value, ctx)? {
                    return Err(err("ACTION_PARAMETER", "Expected exact typed literal"));
                }
                let field = value::get(parameter, "field")
                    .ok_or_else(|| err("ACTION_PARAMETER", "Exact Field reference is required"))?;
                exact_object(field, &["module", "element"], "/parameter/field")?;
                let module = text(field, "module")
                    .ok_or_else(|| err("ACTION_REFERENCE", "Exact Field must resolve"))?;
                let element = text(field, "element")
                    .ok_or_else(|| err("ACTION_REFERENCE", "Exact Field must resolve"))?;
                let field_def = find_element(document, module, element)
                    .map(|(value, _, _)| value)
                    .ok_or_else(|| err("ACTION_REFERENCE", "Exact Field must resolve"))?;
                let scalar = text(field_def, "scalarType").and_then(|v| v.to_utf8().ok());
                let cardinality = text(field_def, "cardinality").and_then(|v| v.to_utf8().ok());
                let nullability = text(field_def, "nullability").and_then(|v| v.to_utf8().ok());
                if !matches!(
                    scalar.as_deref(),
                    Some("boolean" | "integer" | "decimal" | "string" | "binary")
                ) || cardinality.as_deref() != Some("one")
                    || !matches!(nullability.as_deref(), Some("required" | "absent-allowed"))
                {
                    return Err(err(
                        "ACTION_PARAMETER",
                        "Input value domain is not qualified",
                    ));
                }
                if !action_literal_errors(
                    engine.resources(),
                    document,
                    field_def,
                    supplied_value,
                    ctx,
                )?
                .is_empty()
                {
                    return Err(err(
                        "ACTION_PARAMETER",
                        "Typed literal does not satisfy the declared Field",
                    ));
                }
            }
            Some("entity") => {
                let target = value::get(parameter, "target")
                    .ok_or_else(|| err("ACTION_PARAMETER", "Exact entity Key is required"))?;
                exact_object(target, &["module", "element", "key"], "/parameter/target")?;
                exact_object(supplied_value, &["key", "components"], "/inputs")?;
                let key = value::get(supplied_value, "key")
                    .ok_or_else(|| err("ACTION_PARAMETER", "Exact entity Key is required"))?;
                exact_object(key, &["module", "element", "key"], "/inputs/key")?;
                if canonical_json(target, ctx)? != canonical_json(key, ctx)? {
                    return Err(err(
                        "ACTION_PARAMETER",
                        "Entity input must carry the declared exact Key",
                    ));
                }
                selected_key(document, key)?;
                let components = value::get(supplied_value, "components")
                    .ok_or_else(|| err("ACTION_PARAMETER", "Entity Key values are required"))?;
                if !matches!(components, Value::Array(_)) {
                    return Err(err(
                        "ACTION_PARAMETER",
                        "Entity Key values must be an array",
                    ));
                }
                key_tuple(engine, document, key, components, ctx)?;
            }
            _ => return Err(err("ACTION_PARAMETER", "Unknown parameter kind")),
        }
    }
    Ok(supplied)
}

/// Admit a standalone declaration and source snapshot for prepared identity use.
pub fn admit_action_declaration(
    engine: &CodegenEngine<'_>,
    document_input: &Value,
    action_input: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let (_, action) = admitted_source(engine, document_input, action_input, ctx)?;
    Ok(action)
}

/// Admit typed Action input or output values without consulting a store.
pub fn admit_action_inputs(
    engine: &CodegenEngine<'_>,
    document_input: &Value,
    action_input: &Value,
    inputs: &Value,
    outputs: bool,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let (document, action) = admitted_source(engine, document_input, action_input, ctx)?;
    admit_inputs(engine, &document, &action, inputs, outputs, ctx)
}

/// Resolve one frame identity from its exact compiled selector and typed inputs.
pub fn select_action_identity(
    engine: &CodegenEngine<'_>,
    document_input: &Value,
    action_input: &Value,
    frame_input: &Value,
    inputs_input: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let compiled = compile_action_selector(engine, document_input, action_input, frame_input, ctx)?;
    let (document, action) = admitted_source(engine, document_input, action_input, ctx)?;
    let inputs = admit_inputs(engine, &document, &action, inputs_input, false, ctx)?;
    let ast = value::get(&compiled, "ast").unwrap();
    let frame = umf_core::copy_json(frame_input, ctx)?;
    let mut entity = if let Some(parameter) = text(ast, "entity") {
        let key = parameter.to_utf8().unwrap_or_default();
        let value = value::get(&inputs, &key)
            .ok_or_else(|| err("ACTION_PARAMETER", "Required entity input is absent"))?;
        umf_core::copy_json(value, ctx)?
    } else {
        let record = value::get(&frame, "record").unwrap();
        let key_id = text(ast, "key").unwrap();
        let components = arr(value::get(ast, "components").unwrap_or(&Value::Null));
        let values = components
            .iter()
            .map(|component| -> Result<Value, EngineError> {
                if let Some(input) = text(component, "input") {
                    let key = input.to_utf8().unwrap_or_default();
                    let value = value::get(&inputs, &key)
                        .ok_or_else(|| err("ACTION_PARAMETER", "Required Key input is absent"))?;
                    Ok(umf_core::copy_json(value, ctx)?)
                } else {
                    Ok(umf_core::copy_json(
                        value::get(component, "literal").ok_or_else(|| {
                            err("ACTION_SELECTOR_SYNTAX", "Key literal is absent")
                        })?,
                        ctx,
                    )?)
                }
            })
            .collect::<Result<Vec<_>, _>>()?;
        Value::Object(vec![
            (
                Utf16::from("key"),
                Value::Object(vec![
                    (
                        Utf16::from("module"),
                        umf_core::copy_json(value::get(record, "module").unwrap(), ctx)?,
                    ),
                    (
                        Utf16::from("element"),
                        umf_core::copy_json(value::get(record, "element").unwrap(), ctx)?,
                    ),
                    (Utf16::from("key"), Value::String(key_id.clone())),
                ]),
            ),
            (Utf16::from("components"), Value::Array(values)),
        ])
    };
    exact_object(&entity, &["key", "components"], "/identity")?;
    let identity = value::get(&entity, "key").unwrap();
    let values = value::get(&entity, "components").unwrap();
    let receipt = key_tuple(engine, &document, identity, values, ctx)?;
    let tuple_hex = umf_core::copy_json(
        value::get(&receipt, "bytesHex")
            .ok_or_else(|| err("ACTION_PARAMETER", "Core Key tuple receipt is malformed"))?,
        ctx,
    )?;
    // Return fresh admitted data so callers cannot mutate a cached declaration.
    entity = umf_core::copy_json(&entity, ctx)?;
    Ok(Value::Object(vec![
        (Utf16::from("entity"), entity),
        (Utf16::from("tupleHex"), tuple_hex),
    ]))
}

fn push_rule_dependency(
    dependencies: &mut Vec<Value>,
    item: Value,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let encoded = canonical_json(&item, ctx)?;
    for old in dependencies.iter() {
        if canonical_json(old, ctx)? == encoded {
            return Ok(());
        }
    }
    dependencies.push(item);
    Ok(())
}

fn collect_rule_dependencies(
    node: &Value,
    action: &Value,
    dependencies: &mut Vec<Value>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    if let Some(parameter) = text(node, "input") {
        push_rule_dependency(
            dependencies,
            Value::Object(vec![(
                Utf16::from("parameter"),
                Value::String(parameter.clone()),
            )]),
            ctx,
        )?;
    }
    if let Some(output) = text(node, "output") {
        push_rule_dependency(
            dependencies,
            Value::Object(vec![(Utf16::from("output"), Value::String(output.clone()))]),
            ctx,
        )?;
    }
    if let Some(state) = text(node, "state") {
        let frame_id = text(node, "frame")
            .ok_or_else(|| err("ACTION_RULE_FRAME", "Read frame identity is required"))?;
        let frame = arr(value::get(action, "reads").unwrap_or(&Value::Null))
            .iter()
            .find(|frame| text(frame, "id") == Some(frame_id))
            .ok_or_else(|| {
                err(
                    "ACTION_RULE_FRAME",
                    "Business reads require a declared read frame",
                )
            })?;
        let record = value::get(frame, "record")
            .ok_or_else(|| err("ACTION_RULE_FRAME", "Read frame Record is required"))?;
        push_rule_dependency(
            dependencies,
            Value::Object(vec![(
                Utf16::from("record"),
                umf_core::copy_json(record, ctx)?,
            )]),
            ctx,
        )?;
        let _ = state;
    }
    if let Some(exists) = value::get(node, "exists") {
        let frame_id = text(exists, "frame")
            .ok_or_else(|| err("ACTION_RULE_FRAME", "Read frame identity is required"))?;
        let frame = arr(value::get(action, "reads").unwrap_or(&Value::Null))
            .iter()
            .find(|frame| text(frame, "id") == Some(frame_id))
            .ok_or_else(|| {
                err(
                    "ACTION_RULE_FRAME",
                    "Business reads require a declared read frame",
                )
            })?;
        let record = value::get(frame, "record")
            .ok_or_else(|| err("ACTION_RULE_FRAME", "Read frame Record is required"))?;
        push_rule_dependency(
            dependencies,
            Value::Object(vec![(
                Utf16::from("record"),
                umf_core::copy_json(record, ctx)?,
            )]),
            ctx,
        )?;
    }
    if let Some(linked) = value::get(node, "linked") {
        for slot in ["sourceFrame", "targetFrame"] {
            let frame_id = text(linked, slot)
                .ok_or_else(|| err("ACTION_RULE_FRAME", "Read frame identity is required"))?;
            let frame = arr(value::get(action, "reads").unwrap_or(&Value::Null))
                .iter()
                .find(|frame| text(frame, "id") == Some(frame_id))
                .ok_or_else(|| {
                    err(
                        "ACTION_RULE_FRAME",
                        "Business reads require a declared read frame",
                    )
                })?;
            let record = value::get(frame, "record")
                .ok_or_else(|| err("ACTION_RULE_FRAME", "Read frame Record is required"))?;
            push_rule_dependency(
                dependencies,
                Value::Object(vec![(
                    Utf16::from("record"),
                    umf_core::copy_json(record, ctx)?,
                )]),
                ctx,
            )?;
        }
        let relationship = value::get(linked, "relationship").ok_or_else(|| {
            err(
                "ACTION_RULE_RELATIONSHIP",
                "Relationship dependency is required",
            )
        })?;
        push_rule_dependency(
            dependencies,
            Value::Object(vec![(
                Utf16::from("relationship"),
                umf_core::copy_json(relationship, ctx)?,
            )]),
            ctx,
        )?;
    }
    if let Some(args) = value::get(node, "args") {
        for arg in arr(args) {
            collect_rule_dependencies(arg, action, dependencies, ctx)?;
        }
    }
    Ok(())
}

/// Compile one rules/1 expression using the shared ordered Action analyzer.
pub fn compile_action_rule(
    engine: &CodegenEngine<'_>,
    document_input: &Value,
    action_input: &Value,
    rule_input: &Value,
    phase: &str,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    if !matches!(phase, "pre" | "post") {
        return Err(err("ACTION_RULE_PHASE", "Expected pre/post phase"));
    }
    let (document, action) = admitted_source(engine, document_input, action_input, ctx)?;
    let rule = umf_core::copy_json(rule_input, ctx)?;
    exact_object(
        &rule,
        &["language", "version", "expression", "references"],
        "/rule",
    )?;
    if text(&rule, "language")
        .and_then(|v| v.to_utf8().ok())
        .as_deref()
        != Some("umf.actions.rules")
        || text(&rule, "version")
            .and_then(|v| v.to_utf8().ok())
            .as_deref()
            != Some("1")
    {
        return Err(err(
            "ACTION_RULE_PROFILE",
            "Unsupported exact rule language/version",
        ));
    }
    let source_validation = engine.resources().engine().validate_document(
        &document,
        &Registry::new(),
        &mut super::NoCapabilities,
        ctx,
    )?;
    let mut analysis = super::OrderedActionAnalysis {
        document: &document,
        resources: engine.resources(),
        action: &action,
        path: Utf16::default(),
        ctx,
        warnings: &source_validation.diagnostics,
        visited: std::collections::BTreeSet::new(),
        obligations: Vec::new(),
        obligation_index: std::collections::BTreeMap::new(),
        diagnostic_index: std::collections::BTreeMap::new(),
        validation: umf_core::Validation {
            valid: true,
            complete: true,
            diagnostics: Vec::new(),
        },
        created: Vec::new(),
        deleted: Vec::new(),
    };
    let failure = analysis.compile_rule(&rule, &Utf16::from("/rule"), false, phase, None)?;
    if let Some((code, message)) = failure {
        let message = message
            .to_utf8()
            .unwrap_or_else(|_| "Action rule is not supported".to_owned());
        return Err(EngineError::new(
            code,
            Utf16::from("/rule"),
            message.strip_prefix("UmfError: ").unwrap_or(&message),
        ));
    }
    let expression = text(&rule, "expression")
        .ok_or_else(|| err("ACTION_RULE_SYNTAX", "Rule expression text is required"))?;
    if expression.is_empty() || expression.len() > 65_536 {
        return Err(at(
            "LIMIT",
            "/rule/expression",
            "Expression text exceeds bounded profile",
        ));
    }
    let ast = read_action_expression(expression, analysis.ctx)?;
    let mut dependencies = Vec::new();
    collect_rule_dependencies(&ast, &action, &mut dependencies, analysis.ctx)?;
    Ok(Value::Object(vec![
        (
            Utf16::from("language"),
            Value::string_utf8("umf.actions.rules"),
        ),
        (Utf16::from("version"), Value::string_utf8("1")),
        (Utf16::from("phase"), Value::string_utf8(phase)),
        (Utf16::from("expression"), Value::String(expression.clone())),
        (Utf16::from("ast"), ast),
        (Utf16::from("type"), Value::string_utf8("boolean")),
        (Utf16::from("dependencies"), Value::Array(dependencies)),
    ]))
}
