// SPDX-License-Identifier: MIT OR Apache-2.0
//! Opt-in, read-only evaluator for the current `umf.actions.rules/1` subset.
//!
//! This operation evaluates one already selected rule. It never authorizes an
//! action, mutates caller state, or changes the default action inspection path.

use umf_core::literal::CanonicalInteger;
use umf_core::{Context, EngineError, Utf16, Value};

use super::{
    action_rule_error, check_scalar_dependencies, exact_members, expression_type_checked,
    find_element, read_action_expression, string_member, ExprFamily,
};
use crate::{generation::value, resources::CodegenResources};

#[derive(Clone, Debug, PartialEq)]
enum RuntimeValue {
    Absent,
    Json(Value),
    Integer(CanonicalInteger),
}

/// Evaluate one rules/1 boolean expression against an immutable JSON-like
/// state snapshot. `document`, `action`, `rule`, and `state` are caller-owned
/// values; the function copies/adopts state only after compile-time checks.
///
/// This is an opt-in current-core 0.10.0 operation. It implements the bounded
/// rules/1 scalar/frame/link subset and does not claim executor, transaction,
/// authorization, or host snapshot semantics. `Context` controls work,
/// cancellation, deadlines and resource bounds per invocation.
pub fn evaluate_action_rule(
    resources: &CodegenResources,
    document: &Value,
    action: &Value,
    rule: &Value,
    phase: &str,
    state: &Value,
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    let document = umf_core::copy_json(document, ctx)?;
    let action = super::admit_unified_action(resources, action, ctx)?;
    let rule = umf_core::copy_json(rule, ctx)?;
    let mut capabilities = super::NoCapabilities;
    let validation = resources.engine().validate_document(
        &document,
        &umf_core::Registry::new(),
        &mut capabilities,
        ctx,
    )?;
    if !validation.valid {
        return Err(action_rule_error(
            "ACTION_RULE_SOURCE",
            "Expected valid exact core 0.10.0 document",
            "",
        ));
    }
    // Match the predecessor's compile-before-runtime-state refusal order.
    if phase != "pre" && phase != "post" {
        return Err(action_rule_error(
            "ACTION_RULE_PHASE",
            "Expected pre/post phase",
            "",
        ));
    }
    if !exact_members(&rule, &["language", "version", "expression", "references"])
        || string_member(&rule, "language")
            .and_then(|v| v.to_utf8().ok())
            .as_deref()
            != Some("umf.actions.rules")
        || string_member(&rule, "version")
            .and_then(|v| v.to_utf8().ok())
            .as_deref()
            != Some("1")
    {
        return Err(action_rule_error(
            "ACTION_RULE_PROFILE",
            "Unsupported exact rule language/version",
            "",
        ));
    }
    let Some(text) = string_member(&rule, "expression") else {
        return Err(action_rule_error(
            "ACTION_RULE_SYNTAX",
            "Expected exact rule expression text",
            "",
        ));
    };
    if text.is_empty() || text.len() > 65_536 {
        return Err(action_rule_error(
            "LIMIT",
            "Expression text exceeds bounded profile",
            "",
        ));
    }
    let references = value::array(value::get(&rule, "references").unwrap_or(&Value::Null))
        .ok_or_else(|| {
            action_rule_error("ACTION_RULE_SYNTAX", "Rule references must be an array", "")
        })?;
    for reference in references {
        ctx.charge_work(1, Utf16::default())?;
        let valid = exact_members(reference, &["parameter"])
            || exact_members(reference, &["output"])
            || exact_members(reference, &["record"])
            || exact_members(reference, &["relationship"]);
        if !valid {
            return Err(action_rule_error(
                "ACTION_RULE_DEPENDENCY",
                "Unknown dependency annotation",
                "",
            ));
        }
    }
    let expression = read_action_expression(text, ctx).map_err(|error| {
        if error.code == "SYNTAX" {
            action_rule_error("ACTION_RULE_SYNTAX", "Invalid JSON syntax", "")
        } else {
            error
        }
    })?;
    check_scalar_dependencies(&expression, &action, &document, &rule, phase, "", ctx)?;
    let mut nodes = 0;
    let ty_result = expression_type_checked(
        resources,
        &expression,
        &document,
        &action,
        phase,
        "",
        1,
        &mut nodes,
        Some(&rule),
        ctx,
    );
    let ty = match ty_result {
        Ok(value) => value,
        Err(mut error) if error.code == "CORE_SCHEMA_PROPERTIES" => {
            // The TypeScript literal checker reports scalar-policy failures at
            // the operation root even when the literal is nested in an AST.
            error.path = Utf16::default();
            return Err(error);
        }
        Err(error) => return Err(error),
    };
    if ty.family != ExprFamily::Boolean {
        return Err(action_rule_error(
            "ACTION_RULE_TYPE",
            "Conditions require a boolean result",
            "",
        ));
    }

    // A fresh core copy is local to this call. All subsequent state reads are
    // from this snapshot, so the caller's Value is never modified.
    let state = umf_core::copy_json(state, ctx)?;
    validate_inputs(resources, &document, &action, &state, ctx)?;
    let result = evaluate_node(
        resources,
        &document,
        &action,
        phase,
        &state,
        &expression,
        ctx,
    )?;
    as_bool(result)
}

fn is_falsy(value: &Value) -> bool {
    match value {
        Value::Null | Value::Bool(false) => true,
        Value::Number(number) => *number == 0.0 || number.is_nan(),
        Value::String(text) => text.is_empty(),
        _ => false,
    }
}

fn validate_inputs(
    resources: &CodegenResources,
    document: &Value,
    action: &Value,
    state: &Value,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    for (group, declaration, required_code) in [
        ("inputs", "parameters", "ACTION_PARAMETER"),
        ("outputs", "outputs", "ACTION_PARAMETER"),
    ] {
        let Some(supplied) = value::get(state, group) else {
            if group == "outputs" {
                continue;
            }
            return Err(action_rule_error(
                "ACTION_PARAMETER",
                "Inputs must be an exact parameter map",
                "",
            ));
        };
        if group == "outputs" && is_falsy(supplied) {
            continue;
        }
        // The predecessor first rejects every unknown key, then validates
        // supplied values in declaration order (not map insertion order).
        let Some(entries) = value::object(supplied) else {
            return Err(action_rule_error(
                "ACTION_PARAMETER",
                "Inputs must be an exact parameter map",
                "",
            ));
        };
        let declared =
            value::array(value::get(action, declaration).unwrap_or(&Value::Null)).unwrap_or(&[]);
        for (id, _supplied_value) in entries {
            ctx.charge_work(id.len().saturating_add(1), Utf16::default())?;
            if !declared
                .iter()
                .any(|parameter| string_member(parameter, "id") == Some(id))
            {
                return Err(action_rule_error(
                    required_code,
                    "Unknown input/output identity",
                    "",
                ));
            }
        }
        for parameter in declared {
            let Some(id) = string_member(parameter, "id") else {
                continue;
            };
            let id_text = id.to_utf8().unwrap_or_default();
            let Some(supplied_value) = value::get(supplied, &id_text) else {
                if value::get(parameter, "required") == Some(&Value::Bool(true)) {
                    return Err(action_rule_error(
                        required_code,
                        "Required value is absent",
                        &format!("/inputs/{id_text}"),
                    ));
                }
                continue;
            };
            if string_member(parameter, "kind").is_some_and(|kind| kind == &Utf16::from("value")) {
                let field_ref = value::get(parameter, "field").unwrap_or(&Value::Null);
                let module = string_member(field_ref, "module")
                    .cloned()
                    .unwrap_or_default();
                let element = string_member(field_ref, "element")
                    .cloned()
                    .unwrap_or_default();
                let field = find_field(document, &module, &element).ok_or_else(|| {
                    action_rule_error(
                        "ACTION_PARAMETER",
                        "Input value domain is not qualified",
                        "",
                    )
                })?;
                if !super::action_literal_wrapper(resources, supplied_value, ctx)? {
                    return Err(action_rule_error(
                        "ACTION_PARAMETER",
                        "Expected exact typed literal",
                        "",
                    ));
                }
                require_schema_literal(resources, document, field, supplied_value, ctx)?;
            } else {
                match validate_entity_input(resources, document, parameter, supplied_value, ctx) {
                    Err(error)
                        if error.is_control_failure()
                            || !error.code.starts_with("ACTION_PARAMETER") =>
                    {
                        return Err(error);
                    }
                    Err(_) => {
                        return Err(action_rule_error(
                            "ACTION_PARAMETER",
                            "Entity input must carry the declared exact Key",
                            "",
                        ));
                    }
                    Ok(()) => {}
                }
            }
        }
    }
    Ok(())
}

fn require_schema_literal(
    resources: &CodegenResources,
    document: &Value,
    field: &Value,
    literal: &Value,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    if let Some(diagnostic) =
        super::action_literal_errors(resources, document, field, literal, ctx)?
            .into_iter()
            .next()
    {
        return Err(EngineError::new(
            diagnostic.code.to_utf8().unwrap_or_default(),
            diagnostic.path,
            diagnostic.message,
        ));
    }
    Ok(())
}

fn validate_entity_input(
    resources: &CodegenResources,
    document: &Value,
    parameter: &Value,
    supplied: &Value,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    if !exact_members(supplied, &["key", "components"]) {
        return Err(action_rule_error(
            "ACTION_PARAMETER",
            "Entity input must be an exact object",
            "",
        ));
    }
    let target = value::get(parameter, "target").unwrap_or(&Value::Null);
    let supplied_key = value::get(supplied, "key").unwrap_or(&Value::Null);
    if !exact_members(target, &["module", "element", "key"])
        || !exact_members(supplied_key, &["module", "element", "key"])
        || ["module", "element", "key"]
            .iter()
            .any(|name| string_member(target, name) != string_member(supplied_key, name))
    {
        return Err(action_rule_error(
            "ACTION_PARAMETER",
            "Entity input must carry the declared exact Key",
            "",
        ));
    }
    let module = string_member(target, "module").cloned().unwrap_or_default();
    let element = string_member(target, "element")
        .cloned()
        .unwrap_or_default();
    let record = find_element(document, &module, &element)
        .map(|found| found.0)
        .filter(|r| string_member(r, "kind").is_some_and(|kind| kind == &Utf16::from("record")))
        .ok_or_else(|| {
            action_rule_error(
                "ACTION_PARAMETER",
                "Entity input must carry the declared exact Key",
                "",
            )
        })?;
    let key_id = string_member(target, "key").cloned().unwrap_or_default();
    let key = value::array(value::get(record, "keys").unwrap_or(&Value::Null))
        .unwrap_or(&[])
        .iter()
        .find(|key| string_member(key, "id") == Some(&key_id))
        .ok_or_else(|| {
            action_rule_error(
                "ACTION_PARAMETER",
                "Entity input must carry the declared exact Key",
                "",
            )
        })?;
    let fields = value::array(value::get(key, "fields").unwrap_or(&Value::Null)).unwrap_or(&[]);
    let components = value::array(value::get(supplied, "components").unwrap_or(&Value::Null))
        .ok_or_else(|| {
            action_rule_error(
                "ACTION_PARAMETER",
                "Key tuple components must be an exact ordered array",
                "",
            )
        })?;
    if components.len() != fields.len() {
        return Err(action_rule_error(
            "ACTION_PARAMETER",
            "Key tuple components must match the declared Key",
            "",
        ));
    }
    for (field_ref, literal) in fields.iter().zip(components) {
        ctx.charge_work(1, Utf16::default())?;
        let module = string_member(field_ref, "module")
            .cloned()
            .unwrap_or_default();
        let element = string_member(field_ref, "element")
            .cloned()
            .unwrap_or_default();
        let field = find_field(document, &module, &element).ok_or_else(|| {
            action_rule_error(
                "ACTION_PARAMETER",
                "Key tuple components must match the declared Key",
                "",
            )
        })?;
        if !super::action_literal_wrapper(resources, literal, ctx)? {
            return Err(action_rule_error(
                "ACTION_PARAMETER",
                "Expected exact typed literal",
                "",
            ));
        }
        require_schema_literal(resources, document, field, literal, ctx)?;
    }
    Ok(())
}

fn evaluate_node(
    resources: &CodegenResources,
    document: &Value,
    action: &Value,
    phase: &str,
    state: &Value,
    node: &Value,
    ctx: &mut Context<'_>,
) -> Result<RuntimeValue, EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    if let Some(literal) = value::get(node, "literal") {
        return Ok(RuntimeValue::Json(literal.clone()));
    }
    if let Some(id) = string_member(node, "input") {
        return Ok(value::get(
            value::get(state, "inputs").unwrap_or(&Value::Null),
            &id.to_utf8().unwrap_or_default(),
        )
        .cloned()
        .map(RuntimeValue::Json)
        .unwrap_or(RuntimeValue::Absent));
    }
    if let Some(id) = string_member(node, "output") {
        return Ok(value::get(
            value::get(state, "outputs").unwrap_or(&Value::Null),
            &id.to_utf8().unwrap_or_default(),
        )
        .cloned()
        .map(RuntimeValue::Json)
        .unwrap_or(RuntimeValue::Absent));
    }
    if let Some(state_name) = string_member(node, "state") {
        let state_name = state_name.to_utf8().unwrap_or_default();
        let frame_id = string_member(node, "frame")
            .and_then(|v| v.to_utf8().ok())
            .unwrap_or_default();
        let frame = runtime_frame(state, &state_name, &frame_id)?;
        if value::get(frame, "exists") != Some(&Value::Bool(true)) {
            return Err(action_rule_error(
                "ACTION_RULE_EVALUATION",
                "Absent entity field reads must be guarded with exists",
                "",
            ));
        }
        let field = value::get(node, "field").unwrap_or(&Value::Null);
        let key = field_key(field, ctx)?;
        let Some(literal) = value::get(value::get(frame, "values").unwrap_or(&Value::Null), &key)
        else {
            return Ok(RuntimeValue::Absent);
        };
        let module = string_member(field, "module").cloned().unwrap_or_default();
        let element = string_member(field, "element").cloned().unwrap_or_default();
        let field_def = find_field(document, &module, &element).ok_or_else(|| {
            action_rule_error(
                "ACTION_RULE_EVALUATION",
                "Expected exact typed field literal",
                "",
            )
        })?;
        if !super::action_literal_wrapper(resources, literal, ctx)? {
            return Err(action_rule_error(
                "ACTION_RULE_EVALUATION",
                "Expected exact typed field literal",
                "",
            ));
        }
        require_schema_literal(resources, document, field_def, literal, ctx)?;
        return Ok(RuntimeValue::Json(literal.clone()));
    }
    if let Some(exists) = value::get(node, "exists") {
        let state_name = string_member(exists, "state")
            .and_then(|v| v.to_utf8().ok())
            .unwrap_or_default();
        let frame_id = string_member(exists, "frame")
            .and_then(|v| v.to_utf8().ok())
            .unwrap_or_default();
        let frame = runtime_frame(state, &state_name, &frame_id)?;
        let Some(Value::Bool(exists)) = value::get(frame, "exists") else {
            return Err(action_rule_error(
                "ACTION_RULE_EVALUATION",
                "Frozen frame state is unavailable",
                "",
            ));
        };
        return Ok(RuntimeValue::Json(Value::Object(vec![(
            Utf16::from("boolean"),
            Value::Bool(*exists),
        )])));
    }
    if let Some(linked) = value::get(node, "linked") {
        return evaluate_link(resources, document, action, phase, state, linked, ctx);
    }
    let op = string_member(node, "op")
        .and_then(|v| v.to_utf8().ok())
        .unwrap_or_default();
    let args = value::array(value::get(node, "args").unwrap_or(&Value::Null)).unwrap_or(&[]);
    let first = evaluate_node(resources, document, action, phase, state, &args[0], ctx)?;
    let first_bool = || as_bool(first.clone());
    match op.as_str() {
        "present" => return Ok(bool_value(!matches!(first, RuntimeValue::Absent))),
        "not" => return Ok(bool_value(!first_bool()?)),
        "and" if !first_bool()? => return Ok(bool_value(false)),
        "or" if first_bool()? => return Ok(bool_value(true)),
        _ => {}
    }
    let second = evaluate_node(resources, document, action, phase, state, &args[1], ctx)?;
    match op.as_str() {
        "and" => Ok(bool_value(as_bool(second)?)),
        "or" => Ok(bool_value(as_bool(second)?)),
        "eq" => equality(first, second, ctx),
        "lt" | "le" | "gt" | "ge" => {
            let a = integer(first, ctx)?;
            let b = integer(second, ctx)?;
            let ordering = a.compare(&b);
            Ok(bool_value(match op.as_str() {
                "lt" => ordering.is_lt(),
                "le" => ordering.is_le(),
                "gt" => ordering.is_gt(),
                _ => ordering.is_ge(),
            }))
        }
        "add" | "sub" => {
            let a = integer(first, ctx)?;
            let b = integer(second, ctx)?;
            let value = a.arithmetic(&b, op == "sub", ctx)?;
            // The canonical result already knows its exact signed decimal
            // width, so refuse before formatting or allocating a token.
            if value.decimal_len() > ctx.limits().max_text_units {
                return Err(action_rule_error(
                    "LIMIT",
                    "Expanded arithmetic result exceeds core numeric bound",
                    "",
                ));
            }
            Ok(RuntimeValue::Integer(value))
        }
        _ => Err(action_rule_error(
            "ACTION_RULE_SYNTAX",
            "Unknown operator or wrong arity",
            "",
        )),
    }
}

fn evaluate_link(
    _resources: &CodegenResources,
    _document: &Value,
    _action: &Value,
    _phase: &str,
    state: &Value,
    linked: &Value,
    ctx: &mut Context<'_>,
) -> Result<RuntimeValue, EngineError> {
    let state_name = string_member(linked, "state")
        .and_then(|v| v.to_utf8().ok())
        .unwrap_or_default();
    let snapshot = value::get(state, &state_name).unwrap_or(&Value::Null);
    let links =
        value::array(value::get(snapshot, "links").unwrap_or(&Value::Null)).ok_or_else(|| {
            action_rule_error(
                "ACTION_RULE_EVALUATION",
                "Relationship snapshot is unavailable",
                "",
            )
        })?;
    let relationship = value::get(linked, "relationship").unwrap_or(&Value::Null);
    let module = string_member(relationship, "module");
    let rel = string_member(relationship, "relationship");
    let source = string_member(linked, "sourceFrame");
    let target = string_member(linked, "targetFrame");
    let mut found = false;
    for link in links {
        ctx.charge_work(1, Utf16::default())?;
        if !exact_members(link, &["relationship", "sourceFrame", "targetFrame"]) {
            return Err(action_rule_error(
                "ACTION_RULE_EVALUATION",
                "Malformed relationship snapshot",
                "",
            ));
        }
        let lr = value::get(link, "relationship").unwrap_or(&Value::Null);
        if !exact_members(lr, &["module", "relationship"])
            || string_member(link, "sourceFrame").is_none()
            || string_member(link, "targetFrame").is_none()
            || string_member(lr, "module").is_none()
            || string_member(lr, "relationship").is_none()
        {
            return Err(action_rule_error(
                "ACTION_RULE_EVALUATION",
                "Malformed relationship snapshot",
                "",
            ));
        }
        found |= string_member(link, "sourceFrame") == source
            && string_member(link, "targetFrame") == target
            && string_member(lr, "module") == module
            && string_member(lr, "relationship") == rel;
    }
    let sf = string_member(linked, "sourceFrame")
        .and_then(|v| v.to_utf8().ok())
        .unwrap_or_default();
    let tf = string_member(linked, "targetFrame")
        .and_then(|v| v.to_utf8().ok())
        .unwrap_or_default();
    let source_exists =
        value::get(runtime_frame(state, &state_name, &sf)?, "exists") == Some(&Value::Bool(true));
    let target_exists =
        value::get(runtime_frame(state, &state_name, &tf)?, "exists") == Some(&Value::Bool(true));
    Ok(bool_value(found && source_exists && target_exists))
}

fn runtime_frame<'a>(state: &'a Value, phase: &str, id: &str) -> Result<&'a Value, EngineError> {
    let frame = value::get(
        value::get(value::get(state, phase).unwrap_or(&Value::Null), "frames")
            .unwrap_or(&Value::Null),
        id,
    )
    .ok_or_else(|| {
        action_rule_error(
            "ACTION_RULE_EVALUATION",
            "Frozen frame state is unavailable",
            "",
        )
    })?;
    if !matches!(value::get(frame, "exists"), Some(Value::Bool(_)))
        || !matches!(value::get(frame, "values"), Some(Value::Object(_)))
    {
        return Err(action_rule_error(
            "ACTION_RULE_EVALUATION",
            "Frozen frame state is unavailable",
            "",
        ));
    }
    Ok(frame)
}

fn field_key(field: &Value, ctx: &mut Context<'_>) -> Result<String, EngineError> {
    let key_value = Value::Array(vec![
        Value::String(string_member(field, "module").cloned().unwrap_or_default()),
        Value::String(string_member(field, "element").cloned().unwrap_or_default()),
    ]);
    Ok(
        umf_core::serialization::stringify_compact_metered(&key_value, ctx)?
            .to_utf8()
            .unwrap_or_default(),
    )
}

fn find_field<'a>(document: &'a Value, module: &Utf16, element: &Utf16) -> Option<&'a Value> {
    value::array(value::get(document, "modules")?)
        .unwrap_or(&[])
        .iter()
        .find(|item| string_member(item, "id") == Some(module))
        .and_then(|item| {
            value::array(value::get(item, "elements")?)
                .unwrap_or(&[])
                .iter()
                .find(|entry| {
                    string_member(entry, "id") == Some(element)
                        && string_member(entry, "kind")
                            .is_some_and(|kind| kind == &Utf16::from("field"))
                })
        })
}

fn bool_value(value: bool) -> RuntimeValue {
    RuntimeValue::Json(Value::Object(vec![(
        Utf16::from("boolean"),
        Value::Bool(value),
    )]))
}

fn as_bool(value: RuntimeValue) -> Result<bool, EngineError> {
    if matches!(value, RuntimeValue::Absent) {
        return Err(action_rule_error(
            "ACTION_RULE_EVALUATION",
            "Absent operand must be guarded with present/exists",
            "",
        ));
    }
    let RuntimeValue::Json(Value::Object(fields)) = value else {
        return Err(action_rule_error(
            "ACTION_RULE_EVALUATION",
            "Expected non-null boolean operand",
            "",
        ));
    };
    if fields.len() == 1 && fields[0].0 == Utf16::from("boolean") {
        if let Value::Bool(value) = fields[0].1 {
            return Ok(value);
        }
    }
    Err(action_rule_error(
        "ACTION_RULE_EVALUATION",
        "Expected non-null boolean operand",
        "",
    ))
}

fn integer(value: RuntimeValue, ctx: &mut Context<'_>) -> Result<CanonicalInteger, EngineError> {
    if matches!(value, RuntimeValue::Absent) {
        return Err(action_rule_error(
            "ACTION_RULE_EVALUATION",
            "Absent operand must be guarded with present/exists",
            "",
        ));
    }
    if let RuntimeValue::Integer(integer) = value {
        return Ok(integer);
    }
    let RuntimeValue::Json(Value::Object(fields)) = value else {
        return Err(action_rule_error(
            "ACTION_RULE_EVALUATION",
            "Expected non-null integer operand",
            "",
        ));
    };
    if fields.len() != 1 || fields[0].0 != Utf16::from("integerToken") {
        return Err(action_rule_error(
            "ACTION_RULE_EVALUATION",
            "Expected non-null integer operand",
            "",
        ));
    }
    let Value::String(token) = &fields[0].1 else {
        return Err(action_rule_error(
            "ACTION_RULE_EVALUATION",
            "Expected non-null integer operand",
            "",
        ));
    };
    umf_core::literal::exact_coefficient_digits(token, 0, None, ctx)
}

fn is_integer_value(value: &RuntimeValue) -> bool {
    matches!(value, RuntimeValue::Integer(_))
        || matches!(value, RuntimeValue::Json(Value::Object(fields)) if fields.len() == 1 && fields[0].0 == Utf16::from("integerToken"))
}

fn equality(
    a: RuntimeValue,
    b: RuntimeValue,
    ctx: &mut Context<'_>,
) -> Result<RuntimeValue, EngineError> {
    if is_integer_value(&a) && is_integer_value(&b) {
        return Ok(bool_value(
            integer(a, ctx)?.compare(&integer(b, ctx)?).is_eq(),
        ));
    }
    match (a, b) {
        (RuntimeValue::Absent, _) | (_, RuntimeValue::Absent) => Err(action_rule_error(
            "ACTION_RULE_EVALUATION",
            "Absent operand must be guarded with present/exists",
            "",
        )),
        (RuntimeValue::Json(Value::Null), RuntimeValue::Json(Value::Null)) => Ok(bool_value(true)),
        (RuntimeValue::Json(Value::Null), _) | (_, RuntimeValue::Json(Value::Null)) => {
            Ok(bool_value(false))
        }
        (RuntimeValue::Json(Value::Object(a)), RuntimeValue::Json(Value::Object(b)))
            if a.len() == 1 && b.len() == 1 && a[0].0 == b[0].0 =>
        {
            Ok(bool_value(a == b))
        }
        _ => Err(action_rule_error(
            "ACTION_RULE_EVALUATION",
            "No admitted scalar equality",
            "",
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::actions::action_closure_tests;

    fn parse(source: &str) -> Value {
        crate::value::read_source_value(
            &Utf16::from(source),
            umf_core::serialization::Format::Json,
            &mut Context::catalog(),
        )
        .unwrap()
    }

    fn fixture() -> (CodegenResources, Value, Value) {
        let resources = action_closure_tests::resources();
        let mut document = parse(include_str!("../../../../fixtures/actions/approve.json"));
        // Resolve the fixture action using ordered array access, retaining the
        // exact Value tree used by the codegen compiler.
        let modules = value::array(value::get(&document, "modules").unwrap()).unwrap();
        let module = &modules[0];
        let extension =
            value::get(value::get(module, "extensions").unwrap(), "umf.actions").unwrap();
        let mut action =
            value::array(value::get(extension, "actions").unwrap()).unwrap()[0].clone();
        let mut new_fields = Vec::new();
        for (id, scalar, nullability) in [
            ("quantity", "integer", "required"),
            ("flag", "boolean", "absent-allowed"),
            ("wideNumber", "integer", "absent-allowed"),
        ] {
            let mut field = obj(vec![
                ("id", Value::string_utf8(id)),
                ("kind", Value::string_utf8("field")),
                ("scalarType", Value::string_utf8(scalar)),
                ("cardinality", Value::string_utf8("one")),
                ("nullability", Value::string_utf8(nullability)),
                ("extensions", obj(vec![])),
            ]);
            if id == "quantity" {
                set_member(
                    &mut field,
                    "facets",
                    obj(vec![(
                        "integerWidth",
                        obj(vec![
                            ("bits", Value::Number(64.0)),
                            ("signed", Value::Bool(true)),
                        ]),
                    )]),
                );
            }
            new_fields.push(field);
        }
        if let Value::Object(root) = &mut document {
            let modules = root
                .iter_mut()
                .find(|(k, _)| k == &Utf16::from("modules"))
                .unwrap();
            if let Value::Array(modules) = &mut modules.1 {
                if let Value::Object(module) = &mut modules[0] {
                    let elements = module
                        .iter_mut()
                        .find(|(k, _)| k == &Utf16::from("elements"))
                        .unwrap();
                    if let Value::Array(elements) = &mut elements.1 {
                        elements.extend(new_fields);
                    }
                }
            }
        }
        let mut parameters = value::array(value::get(&action, "parameters").unwrap())
            .unwrap()
            .to_vec();
        for id in ["quantity", "flag", "wideNumber"] {
            parameters.push(obj(vec![
                ("id", Value::string_utf8(id)),
                ("kind", Value::string_utf8("value")),
                (
                    "field",
                    obj(vec![
                        ("module", Value::string_utf8("sales")),
                        ("element", Value::string_utf8(id)),
                    ]),
                ),
                ("required", Value::Bool(false)),
            ]));
        }
        set_member(&mut action, "parameters", Value::Array(parameters));
        let mut reads = value::array(value::get(&action, "reads").unwrap())
            .unwrap()
            .to_vec();
        let mut read = value::array(value::get(&action, "writes").unwrap()).unwrap()[0].clone();
        set_member(&mut read, "id", Value::string_utf8("order-read"));
        reads.push(read);
        set_member(&mut action, "reads", Value::Array(reads));
        (resources, document, action)
    }

    fn link_fixture() -> (CodegenResources, Value, Value) {
        let resources = action_closure_tests::resources();
        let document = parse(include_str!(
            "../../../../fixtures/actions/create-link.json"
        ));
        let modules = value::array(value::get(&document, "modules").unwrap()).unwrap();
        let extension = value::get(
            value::get(&modules[0], "extensions").unwrap(),
            "umf.actions",
        )
        .unwrap();
        let mut action =
            value::array(value::get(extension, "actions").unwrap()).unwrap()[0].clone();
        let mut reads = Vec::new();
        for write in value::array(value::get(&action, "writes").unwrap()).unwrap() {
            let mut read = write.clone();
            let id = string_member(write, "id")
                .unwrap()
                .to_utf8()
                .unwrap()
                .replace("write", "read");
            set_member(&mut read, "id", Value::string_utf8(id));
            set_member(&mut read, "create", Value::Bool(false));
            set_member(&mut read, "delete", Value::Bool(false));
            reads.push(read);
        }
        set_member(&mut action, "reads", Value::Array(reads));
        (resources, document, action)
    }

    fn obj(fields: Vec<(&str, Value)>) -> Value {
        Value::Object(
            fields
                .into_iter()
                .map(|(k, v)| (Utf16::from(k), v))
                .collect(),
        )
    }

    fn set_member(target: &mut Value, name: &str, replacement: Value) {
        if let Value::Object(fields) = target {
            if let Some((_, value)) = fields.iter_mut().find(|(key, _)| key == &Utf16::from(name)) {
                *value = replacement;
            } else {
                fields.push((Utf16::from(name), replacement));
            }
        }
    }

    fn rule(expression: &str, refs: Vec<Value>) -> Value {
        obj(vec![
            ("language", Value::string_utf8("umf.actions.rules")),
            ("version", Value::string_utf8("1")),
            ("expression", Value::string_utf8(expression)),
            ("references", Value::Array(refs)),
        ])
    }

    #[test]
    fn evaluates_boolean_short_circuit_and_keeps_input_snapshot_unchanged() {
        let (resources, document, mut action) = fixture();
        let mut parameters = value::array(value::get(&action, "parameters").unwrap())
            .unwrap()
            .to_vec();
        parameters.push(obj(vec![
            ("id", Value::string_utf8("status")),
            ("kind", Value::string_utf8("value")),
            (
                "field",
                obj(vec![
                    ("module", Value::string_utf8("sales")),
                    ("element", Value::string_utf8("status")),
                ]),
            ),
            ("required", Value::Bool(false)),
        ]));
        if let Value::Object(fields) = &mut action {
            fields
                .iter_mut()
                .find(|(k, _)| k == &Utf16::from("parameters"))
                .unwrap()
                .1 = Value::Array(parameters);
        }
        let expression = r#"{"op":"or","args":[{"literal":{"boolean":true}},{"op":"eq","args":[{"input":"status"},{"literal":{"string":"x"}}]}]}"#;
        let refs = vec![obj(vec![("parameter", Value::string_utf8("status"))])];
        let rule = rule(expression, refs);
        let state = obj(vec![
            (
                "inputs",
                obj(vec![
                    ("order", entity_input()),
                    (
                        "status",
                        Value::Object(vec![(Utf16::from("string"), Value::string_utf8("x"))]),
                    ),
                ]),
            ),
            (
                "pre",
                obj(vec![
                    ("frames", obj(vec![])),
                    ("links", Value::Array(vec![])),
                ]),
            ),
        ]);
        let before = state.clone();
        let mut ctx = Context::ordinary();
        assert_eq!(
            evaluate_action_rule(&resources, &document, &action, &rule, "pre", &state, &mut ctx),
            Ok(true)
        );
        assert_eq!(state, before);
    }

    #[test]
    fn compiles_before_reading_runtime_state_and_preserves_refusal_envelope() {
        let (resources, document, mut action) = fixture();
        let mut outputs = value::array(value::get(&action, "outputs").unwrap())
            .unwrap()
            .to_vec();
        outputs.push(obj(vec![
            ("id", Value::string_utf8("out")),
            ("kind", Value::string_utf8("value")),
            (
                "field",
                obj(vec![
                    ("module", Value::string_utf8("sales")),
                    ("element", Value::string_utf8("status")),
                ]),
            ),
            ("required", Value::Bool(true)),
        ]));
        if let Value::Object(fields) = &mut action {
            fields
                .iter_mut()
                .find(|(k, _)| k == &Utf16::from("outputs"))
                .unwrap()
                .1 = Value::Array(outputs);
        }
        let expression = r#"{"op":"eq","args":[{"output":"out"},{"literal":{"string":"x"}}]}"#;
        let rule = rule(
            expression,
            vec![obj(vec![("output", Value::string_utf8("out"))])],
        );
        let invalid_state = Value::Null;
        let mut ctx = Context::ordinary();
        let error = evaluate_action_rule(
            &resources,
            &document,
            &action,
            &rule,
            "pre",
            &invalid_state,
            &mut ctx,
        )
        .unwrap_err();
        assert_eq!(error.code, "ACTION_RULE_DEPENDENCY");
        assert_eq!(
            error.message.to_utf8().unwrap(),
            "Output dependency is forbidden or missing"
        );
        assert_eq!(error.path, Utf16::default());
    }

    #[test]
    fn arithmetic_uses_exact_coefficient_and_enforces_expanded_result_bound() {
        let (resources, document, action) = fixture();
        let expression = r#"{"op":"eq","args":[{"op":"add","args":[{"literal":{"integerToken":"9007199254740992"}},{"literal":{"integerToken":"1"}}]},{"literal":{"integerToken":"9007199254740993"}}]}"#;
        let rule = rule(expression, vec![]);
        let state = obj(vec![("inputs", obj(vec![("order", entity_input())]))]);
        let mut ctx = Context::ordinary();
        assert_eq!(
            evaluate_action_rule(&resources, &document, &action, &rule, "pre", &state, &mut ctx),
            Ok(true)
        );
    }

    #[test]
    fn exponent_integer_tokens_compare_by_exact_coefficient() {
        let (resources, document, action) = fixture();
        let expression = r#"{"op":"eq","args":[{"literal":{"integerToken":"1e3"}},{"literal":{"integerToken":"1000"}}]}"#;
        let rule = rule(expression, vec![]);
        let state = obj(vec![("inputs", obj(vec![("order", entity_input())]))]);
        let mut ctx = Context::ordinary();
        assert_eq!(
            evaluate_action_rule(&resources, &document, &action, &rule, "pre", &state, &mut ctx),
            Ok(true)
        );
    }

    #[test]
    fn cooperative_cancellation_is_a_control_refusal() {
        let (resources, document, action) = fixture();
        let rule = rule(r#"{"literal":{"boolean":true}}"#, vec![]);
        let state = obj(vec![("inputs", obj(vec![("order", entity_input())]))]);
        let mut cancelled = || true;
        let mut ctx = Context::ordinary().with_cancellation(&mut cancelled);
        let error = evaluate_action_rule(
            &resources, &document, &action, &rule, "pre", &state, &mut ctx,
        )
        .unwrap_err();
        assert!(error.is_control_failure());
        assert_eq!(error.code, "CANCELLED");
    }

    #[test]
    fn current_source_review_cases_match_exact_refusals() {
        let packet = parse(include_str!(
            "../../../../tests/rust-core/fixtures/r5-actions/evaluate-action-rule/current-source-review-results.json"
        ));
        let expected = value::array(value::get(&packet, "cases").unwrap()).unwrap();
        let (resources, mut document, mut action) = fixture();

        // Mirror the separately captured current-source TypeScript cohort:
        // a read frame exposes an integer field with a 64-bit width.
        let mut modules = value::array(value::get(&document, "modules").unwrap())
            .unwrap()
            .to_vec();
        let elements = value::array(value::get(&modules[0], "elements").unwrap())
            .unwrap()
            .to_vec();
        let order = elements
            .iter()
            .find(|element| string_member(element, "id") == Some(&Utf16::from("order")))
            .unwrap()
            .clone();
        let mut members = value::array(value::get(&order, "members").unwrap())
            .unwrap()
            .to_vec();
        members.push(obj(vec![
            ("module", Value::string_utf8("sales")),
            ("element", Value::string_utf8("quantity")),
        ]));
        let mut order = order;
        set_member(&mut order, "members", Value::Array(members));
        let mut elements = elements;
        let order_index = elements
            .iter()
            .position(|element| string_member(element, "id") == Some(&Utf16::from("order")))
            .unwrap();
        elements[order_index] = order;
        let mut module = modules[0].clone();
        set_member(&mut module, "elements", Value::Array(elements));
        modules[0] = module;
        set_member(&mut document, "modules", Value::Array(modules));

        let mut reads = value::array(value::get(&action, "reads").unwrap())
            .unwrap()
            .to_vec();
        let mut read = reads[0].clone();
        let mut fields = value::array(value::get(&read, "fields").unwrap())
            .unwrap()
            .to_vec();
        fields.push(obj(vec![
            ("module", Value::string_utf8("sales")),
            ("element", Value::string_utf8("quantity")),
        ]));
        set_member(&mut read, "fields", Value::Array(fields));
        reads[0] = read;
        set_member(&mut action, "reads", Value::Array(reads));

        let ids = [
            "unknown-input-precedes-invalid-known-value",
            "declared-order-precedes-map-order-and-preserves-schema-error",
            "required-input-preserves-exact-predecessor-path",
            "parameter-wrapper-refusal-is-distinct",
            "stored-wrapper-refusal-is-distinct",
            "stored-schema-diagnostic-is-preserved",
            "falsy-output-false-is-ignored",
            "falsy-output-zero-is-ignored",
            "falsy-output-empty-string-is-ignored",
        ];
        let mut actual = Vec::new();
        for id in ids {
            let mut test_action = action.clone();
            if id == "required-input-preserves-exact-predecessor-path" {
                let mut parameters = value::array(value::get(&test_action, "parameters").unwrap())
                    .unwrap()
                    .to_vec();
                let mut quantity = parameters
                    .iter()
                    .find(|parameter| {
                        string_member(parameter, "id") == Some(&Utf16::from("quantity"))
                    })
                    .unwrap()
                    .clone();
                set_member(&mut quantity, "required", Value::Bool(true));
                let index = parameters
                    .iter()
                    .position(|parameter| {
                        string_member(parameter, "id") == Some(&Utf16::from("quantity"))
                    })
                    .unwrap();
                parameters[index] = quantity;
                set_member(&mut test_action, "parameters", Value::Array(parameters));
            }
            let mut inputs = obj(vec![("order", entity_input())]);
            let stored = matches!(
                id,
                "stored-wrapper-refusal-is-distinct" | "stored-schema-diagnostic-is-preserved"
            );
            match id {
                "unknown-input-precedes-invalid-known-value" => {
                    inputs = obj(vec![
                        ("order", entity_input()),
                        ("flag", obj(vec![("other", Value::Bool(true))])),
                        ("intruder", obj(vec![("boolean", Value::Bool(true))])),
                    ]);
                }
                "declared-order-precedes-map-order-and-preserves-schema-error" => {
                    inputs = obj(vec![
                        ("flag", obj(vec![("other", Value::Bool(true))])),
                        (
                            "quantity",
                            obj(vec![(
                                "integerToken",
                                Value::string_utf8("9223372036854775808"),
                            )]),
                        ),
                        ("order", entity_input()),
                    ]);
                }
                "parameter-wrapper-refusal-is-distinct" => set_member(
                    &mut inputs,
                    "quantity",
                    obj(vec![("other", Value::Bool(true))]),
                ),
                _ => {}
            }
            let mut state = obj(vec![
                ("inputs", inputs),
                (
                    "pre",
                    obj(vec![
                        (
                            "frames",
                            obj(vec![(
                                "order-read",
                                obj(vec![
                                    ("exists", Value::Bool(true)),
                                    (
                                        "values",
                                        if stored {
                                            obj(vec![(
                                                "[\"sales\",\"quantity\"]",
                                                if id == "stored-wrapper-refusal-is-distinct" {
                                                    obj(vec![("integerToken", Value::Number(4.0))])
                                                } else {
                                                    obj(vec![(
                                                        "integerToken",
                                                        Value::string_utf8("9223372036854775808"),
                                                    )])
                                                },
                                            )])
                                        } else {
                                            obj(vec![])
                                        },
                                    ),
                                ]),
                            )]),
                        ),
                        ("links", Value::Array(vec![])),
                    ]),
                ),
            ]);
            match id {
                "falsy-output-false-is-ignored" => {
                    set_member(&mut state, "outputs", Value::Bool(false))
                }
                "falsy-output-zero-is-ignored" => {
                    set_member(&mut state, "outputs", Value::Number(0.0))
                }
                "falsy-output-empty-string-is-ignored" => {
                    set_member(&mut state, "outputs", Value::string_utf8(""))
                }
                _ => {}
            }
            let expression = if stored {
                r#"{"op":"gt","args":[{"state":"pre","frame":"order-read","field":{"module":"sales","element":"quantity"}},{"literal":{"integerToken":"0"}}]}"#
            } else {
                r#"{"literal":{"boolean":true}}"#
            };
            let references = if stored {
                vec![obj(vec![(
                    "record",
                    obj(vec![
                        ("module", Value::string_utf8("sales")),
                        ("element", Value::string_utf8("order")),
                    ]),
                )])]
            } else {
                vec![]
            };
            let mut ctx = Context::ordinary();
            let outcome = match evaluate_action_rule(
                &resources,
                &document,
                &test_action,
                &rule(expression, references),
                "pre",
                &state,
                &mut ctx,
            ) {
                Ok(value) => obj(vec![("value", Value::Bool(value))]),
                Err(error) => obj(vec![(
                    "refusal",
                    obj(vec![
                        ("code", Value::string_utf8(error.code)),
                        ("message", Value::String(error.message)),
                        ("path", Value::String(error.path)),
                    ]),
                )]),
            };
            actual.push(obj(vec![
                ("id", Value::string_utf8(id)),
                ("outcome", outcome),
            ]));
            let _ = &mut state;
        }
        assert_eq!(Value::Array(actual), Value::Array(expected.to_vec()));
    }

    #[test]
    fn canonical_arithmetic_and_text_precharge_work() {
        let magnitude_text = "9".repeat(100_000);
        let magnitude = {
            let mut ctx = Context::ordinary();
            umf_core::literal::exact_coefficient_digits(
                &Utf16::from(magnitude_text),
                0,
                None,
                &mut ctx,
            )
            .unwrap()
        };
        let mut denied = |amount: usize| {
            assert!(amount > 0);
            Err(EngineError::new("WORK_BUDGET", Utf16::default(), "denied"))
        };
        let mut ctx = Context::ordinary().with_meter(&mut denied);
        let error = magnitude
            .arithmetic(&magnitude, false, &mut ctx)
            .unwrap_err();
        assert!(error.is_control_failure());
        assert_eq!(error.code, "WORK_BUDGET");
        drop(ctx);

        let mut denied_format = |amount: usize| {
            assert!(amount > 0);
            Err(EngineError::new(
                "FORMAT_BUDGET",
                Utf16::default(),
                "denied",
            ))
        };
        let mut ctx = Context::ordinary().with_meter(&mut denied_format);
        let error = magnitude.to_decimal_string(&mut ctx).unwrap_err();
        assert!(error.is_control_failure());
        assert_eq!(error.code, "FORMAT_BUDGET");
    }

    #[test]
    fn canonical_signed_arithmetic_matches_bigint_oracle_for_small_values() {
        use num_bigint::BigInt;
        for left in -50i64..=50 {
            for right in -50i64..=50 {
                let mut ctx = Context::ordinary();
                let a = umf_core::literal::exact_coefficient_digits(
                    &Utf16::from(left.to_string()),
                    0,
                    None,
                    &mut ctx,
                )
                .unwrap();
                let b = umf_core::literal::exact_coefficient_digits(
                    &Utf16::from(right.to_string()),
                    0,
                    None,
                    &mut ctx,
                )
                .unwrap();
                let sum = a.arithmetic(&b, false, &mut ctx).unwrap();
                let difference = a.arithmetic(&b, true, &mut ctx).unwrap();
                assert_eq!(
                    sum.to_decimal_string(&mut ctx).unwrap(),
                    (BigInt::from(left) + BigInt::from(right)).to_string()
                );
                assert_eq!(
                    difference.to_decimal_string(&mut ctx).unwrap(),
                    (BigInt::from(left) - BigInt::from(right)).to_string()
                );
                assert_eq!(a.compare(&b), BigInt::from(left).cmp(&BigInt::from(right)));
            }
        }
    }

    #[test]
    fn canonical_arithmetic_checks_cancellation_during_long_digit_walk() {
        use std::cell::Cell;
        let token = "9".repeat(200_000);
        let mut parse_ctx = Context::ordinary();
        let value = umf_core::literal::exact_coefficient_digits(
            &Utf16::from(token),
            0,
            None,
            &mut parse_ctx,
        )
        .unwrap();
        let calls = Cell::new(0usize);
        let mut cancelled = || {
            let next = calls.get() + 1;
            calls.set(next);
            next >= 3
        };
        let mut ctx = Context::ordinary().with_cancellation(&mut cancelled);
        let error = value.arithmetic(&value, false, &mut ctx).unwrap_err();
        assert!(error.is_control_failure());
        assert_eq!(error.code, "CANCELLED");
    }

    #[test]
    fn entity_input_validation_preserves_host_control_refusals() {
        let (resources, document, action) = fixture();
        let parameter = &value::array(value::get(&action, "parameters").unwrap()).unwrap()[0];
        let mut deny = |_| Err(EngineError::new("INPUT_BUDGET", Utf16::default(), "denied"));
        let mut ctx = Context::ordinary().with_meter(&mut deny);
        let error =
            validate_entity_input(&resources, &document, parameter, &entity_input(), &mut ctx)
                .unwrap_err();
        assert!(error.is_control_failure());
        assert_eq!(error.code, "INPUT_BUDGET");
    }

    fn entity_input() -> Value {
        entity_input_for("order", "o1")
    }

    fn entity_input_for(record: &str, id: &str) -> Value {
        obj(vec![
            (
                "key",
                obj(vec![
                    ("module", Value::string_utf8("sales")),
                    ("element", Value::string_utf8(record)),
                    ("key", Value::string_utf8("pk")),
                ]),
            ),
            (
                "components",
                Value::Array(vec![Value::Object(vec![(
                    Utf16::from("string"),
                    Value::string_utf8(id),
                )])]),
            ),
        ])
    }

    #[test]
    fn frozen_r5_packet_matches_for_every_rust_representable_case() {
        let cases = parse(include_str!(
            "../../../../tests/rust-core/fixtures/r5-actions/evaluate-action-rule/predecessor-cases.json"
        ));
        let expected = parse(include_str!(
            "../../../../tests/rust-core/fixtures/r5-actions/evaluate-action-rule/predecessor-results.json"
        ));
        let cases = value::array(value::get(&cases, "cases").unwrap()).unwrap();
        let expected = value::array(value::get(&expected, "cases").unwrap()).unwrap();
        let (resources, document, action) = fixture();
        let (_, link_document, link_action) = link_fixture();
        for (index, case) in cases.iter().enumerate() {
            let id = string_member(case, "id").unwrap().to_utf8().unwrap();
            if id == "valid-rule-then-accessor-runtime-state-refuses" {
                continue; // JavaScript accessors cannot be represented by Value.
            }
            let result = evaluate_frozen_case(
                &resources,
                &document,
                &action,
                &link_document,
                &link_action,
                case,
            );
            assert_eq!(result, expected[index], "case {id}");
        }
    }

    #[test]
    fn current_numeric_review_packet_matches_all_predecessor_controls() {
        let cases = parse(include_str!(
            "../../../../tests/rust-core/fixtures/r5-actions/evaluate-action-rule/numeric-source-review-cases.json"
        ));
        let expected = parse(include_str!(
            "../../../../tests/rust-core/fixtures/r5-actions/evaluate-action-rule/numeric-source-review-results.json"
        ));
        let cases = value::array(value::get(&cases, "cases").unwrap()).unwrap();
        let expected = value::array(value::get(&expected, "cases").unwrap()).unwrap();
        let (resources, mut document, mut action) = fixture();
        let mut elements = value::array(
            value::get(
                &value::array(value::get(&document, "modules").unwrap()).unwrap()[0],
                "elements",
            )
            .unwrap(),
        )
        .unwrap()
        .to_vec();
        elements.push(obj(vec![
            ("id", Value::string_utf8("tiny")),
            ("kind", Value::string_utf8("field")),
            ("scalarType", Value::string_utf8("integer")),
            ("cardinality", Value::string_utf8("one")),
            ("nullability", Value::string_utf8("absent-allowed")),
            ("extensions", obj(vec![])),
            (
                "facets",
                obj(vec![(
                    "integerWidth",
                    obj(vec![
                        ("bits", Value::Number(8.0)),
                        ("signed", Value::Bool(true)),
                    ]),
                )]),
            ),
        ]));
        let mut modules = value::array(value::get(&document, "modules").unwrap())
            .unwrap()
            .to_vec();
        let mut module = modules[0].clone();
        set_member(&mut module, "elements", Value::Array(elements));
        modules[0] = module;
        set_member(&mut document, "modules", Value::Array(modules));
        let mut parameters = value::array(value::get(&action, "parameters").unwrap())
            .unwrap()
            .to_vec();
        parameters.push(obj(vec![
            ("id", Value::string_utf8("tiny")),
            ("kind", Value::string_utf8("value")),
            (
                "field",
                obj(vec![
                    ("module", Value::string_utf8("sales")),
                    ("element", Value::string_utf8("tiny")),
                ]),
            ),
            ("required", Value::Bool(false)),
        ]));
        set_member(&mut action, "parameters", Value::Array(parameters));

        for (index, case) in cases.iter().enumerate() {
            let id = string_member(case, "id").unwrap().to_utf8().unwrap();
            let outcome = match string_member(case, "kind")
                .and_then(|v| v.to_utf8().ok())
                .as_deref()
            {
                Some("coefficient") => {
                    let token = string_member(case, "token").unwrap();
                    let scale = value::get(case, "scale")
                        .and_then(|v| match v {
                            Value::Number(n) => Some(*n as i64),
                            _ => None,
                        })
                        .unwrap_or(0);
                    let precision = value::get(case, "precision").and_then(|v| match v {
                        Value::Number(n) => Some(*n as usize),
                        _ => None,
                    });
                    let mut ctx = Context::ordinary();
                    match umf_core::literal::exact_coefficient_digits(
                        token, scale, precision, &mut ctx,
                    )
                    .and_then(|n| n.to_decimal_string(&mut ctx))
                    {
                        Ok(value) => obj(vec![("value", Value::string_utf8(value))]),
                        Err(error) => {
                            let message = match error.code.as_str() {
                                "numeric-exponent" => {
                                    "Numeric exponent exceeds bounded domain".to_owned()
                                }
                                "numeric-precision" => "Numeric value exceeds precision".to_owned(),
                                "numeric-resource" => {
                                    "Numeric value exceeds precision/resource limit".to_owned()
                                }
                                "numeric-rounding" => {
                                    "Numeric value requires unsupported rounding".to_owned()
                                }
                                _ => error.message.to_utf8().unwrap_or_default(),
                            };
                            obj(vec![(
                                "refusal",
                                obj(vec![
                                    ("code", Value::string_utf8("CORE_SCHEMA_PROPERTIES")),
                                    ("message", Value::string_utf8(message)),
                                    ("path", Value::String(error.path)),
                                ]),
                            )])
                        }
                    }
                }
                _ => {
                    let ast = value::get(case, "expression").unwrap();
                    let expression = umf_core::serialization::stringify_compact(ast)
                        .unwrap()
                        .to_utf8()
                        .unwrap();
                    let mut state = obj(vec![
                        ("inputs", obj(vec![("order", entity_input())])),
                        (
                            "pre",
                            obj(vec![
                                ("frames", obj(vec![])),
                                ("links", Value::Array(vec![])),
                            ]),
                        ),
                    ]);
                    let refs = if let Some(input) = value::get(case, "input") {
                        let parameter = string_member(input, "id").unwrap().to_utf8().unwrap();
                        let token = string_member(input, "token").unwrap().clone();
                        let inputs = value::get(&state, "inputs").unwrap();
                        let mut input_entries = value::object(inputs).unwrap().to_vec();
                        input_entries.push((
                            Utf16::from(parameter.clone()),
                            obj(vec![("integerToken", Value::String(token))]),
                        ));
                        set_member(&mut state, "inputs", Value::Object(input_entries));
                        vec![obj(vec![("parameter", Value::string_utf8(parameter))])]
                    } else {
                        vec![]
                    };
                    let references = Value::Array(refs);
                    match evaluate_action_rule(
                        &resources,
                        &document,
                        &action,
                        &rule(&expression, value::array(&references).unwrap().to_vec()),
                        "pre",
                        &state,
                        &mut Context::ordinary(),
                    ) {
                        Ok(value) => obj(vec![("value", Value::Bool(value))]),
                        Err(error) => obj(vec![(
                            "refusal",
                            obj(vec![
                                ("code", Value::string_utf8(error.code)),
                                ("message", Value::String(error.message)),
                                ("path", Value::String(error.path)),
                            ]),
                        )]),
                    }
                }
            };
            assert_eq!(
                obj(vec![("id", Value::string_utf8(id)), ("outcome", outcome)]),
                expected[index],
                "numeric case {}",
                string_member(case, "id").unwrap().to_utf8().unwrap()
            );
        }
    }

    fn evaluate_frozen_case(
        resources: &CodegenResources,
        document: &Value,
        base_action: &Value,
        link_document: &Value,
        link_action: &Value,
        case: &Value,
    ) -> Value {
        let id = string_member(case, "id")
            .and_then(|v| v.to_utf8().ok())
            .unwrap_or_default();
        let ast = value::get(case, "ast").unwrap();
        let mut expression = umf_core::serialization::stringify_compact(ast)
            .unwrap()
            .to_utf8()
            .unwrap();
        let refs = value::array(value::get(case, "references").unwrap_or(&Value::Null))
            .unwrap_or(&[
                obj(vec![("parameter", Value::string_utf8("quantity"))]),
                obj(vec![("parameter", Value::string_utf8("flag"))]),
                obj(vec![(
                    "record",
                    obj(vec![
                        ("module", Value::string_utf8("sales")),
                        ("element", Value::string_utf8("order")),
                    ]),
                )]),
            ])
            .to_vec();
        let fixture_link =
            string_member(case, "fixture").is_some_and(|v| v == &Utf16::from("create-link"));
        let (selected_document, mut action) = if fixture_link {
            (link_document, link_action.clone())
        } else {
            (document, base_action.clone())
        };
        let action_id = string_member(case, "action")
            .and_then(|v| v.to_utf8().ok())
            .unwrap_or_default();
        if action_id == "output" {
            let mut outputs = value::array(value::get(&action, "outputs").unwrap())
                .unwrap()
                .to_vec();
            outputs.push(obj(vec![
                ("id", Value::string_utf8("out")),
                ("kind", Value::string_utf8("value")),
                (
                    "field",
                    obj(vec![
                        ("module", Value::string_utf8("sales")),
                        ("element", Value::string_utf8("status")),
                    ]),
                ),
                ("required", Value::Bool(true)),
            ]));
            set_member(&mut action, "outputs", Value::Array(outputs));
        }
        let state_label = string_member(case, "state")
            .and_then(|v| v.to_utf8().ok())
            .unwrap_or_default();
        let mut inputs = if fixture_link {
            obj(vec![
                (
                    "order-id",
                    Value::Object(vec![(Utf16::from("string"), Value::string_utf8("o1"))]),
                ),
                ("customer", entity_input_for("customer", "c1")),
                ("product", entity_input_for("product", "p1")),
            ])
        } else {
            obj(vec![("order", entity_input())])
        };
        if state_label == "bad-state" || state_label == "invalid-runtime-input" {
            inputs = obj(vec![(
                "missing",
                Value::Object(vec![(Utf16::from("string"), Value::string_utf8("x"))]),
            )]);
        }
        if state_label == "big-overflow" || action_id == "big-number" {
            if let Value::Object(members) = &mut inputs {
                members.push((
                    Utf16::from("wideNumber"),
                    Value::Object(vec![(
                        Utf16::from("integerToken"),
                        Value::string_utf8("9".repeat(4_000_000)),
                    )]),
                ));
            }
        }
        if state_label == "big-boundary" || action_id == "big-number-boundary" {
            if let Value::Object(members) = &mut inputs {
                members.push((
                    Utf16::from("wideNumber"),
                    Value::Object(vec![(
                        Utf16::from("integerToken"),
                        Value::string_utf8("1".repeat(3_999_999)),
                    )]),
                ));
            }
        }
        if state_label == "null-flag" {
            if let Value::Object(members) = &mut inputs {
                members.push((Utf16::from("flag"), Value::Null));
            }
        }
        let mut frame_values = obj(vec![(
            "[\"sales\",\"status\"]",
            Value::Object(vec![(Utf16::from("string"), Value::string_utf8("new"))]),
        )]);
        if state_label == "frame-no-status" {
            frame_values = obj(vec![]);
        }
        if state_label == "invalid-frame-literal" {
            frame_values = obj(vec![(
                "[\"sales\",\"status\"]",
                Value::Object(vec![(Utf16::from("string"), Value::Number(4.0))]),
            )]);
        }
        let mut frames = obj(vec![(
            "order-read",
            obj(vec![
                ("exists", Value::Bool(state_label != "frame-absent")),
                ("values", frame_values),
            ]),
        )]);
        if state_label == "frame-missing" {
            frames = obj(vec![]);
        }
        if state_label == "frame-malformed" {
            frames = obj(vec![(
                "order-read",
                obj(vec![
                    ("exists", Value::string_utf8("yes")),
                    ("values", obj(vec![])),
                ]),
            )]);
        }
        let mut links = Vec::new();
        if state_label == "linked" || state_label == "matching-then-malformed-links" {
            links.push(obj(vec![
                (
                    "relationship",
                    obj(vec![
                        ("module", Value::string_utf8("sales")),
                        ("relationship", Value::string_utf8("order-customer")),
                    ]),
                ),
                ("sourceFrame", Value::string_utf8("order-read")),
                ("targetFrame", Value::string_utf8("customer-read")),
            ]));
        }
        if state_label == "malformed-links" || state_label == "matching-then-malformed-links" {
            links.push(obj(vec![]));
        }
        if fixture_link {
            frames = obj(vec![
                (
                    "order-read",
                    obj(vec![("exists", Value::Bool(true)), ("values", obj(vec![]))]),
                ),
                (
                    "customer-read",
                    obj(vec![("exists", Value::Bool(true)), ("values", obj(vec![]))]),
                ),
            ]);
        }
        let mut state = obj(vec![
            ("inputs", inputs),
            (
                "pre",
                obj(vec![
                    ("frames", frames),
                    (
                        "links",
                        if state_label == "no-links" {
                            Value::Null
                        } else {
                            Value::Array(links)
                        },
                    ),
                ]),
            ),
        ]);
        if state_label == "post-frame-missing" {
            set_member(
                &mut state,
                "post",
                obj(vec![
                    ("frames", obj(vec![])),
                    ("links", Value::Array(vec![])),
                ]),
            );
        }
        if state_label == "post-output" {
            set_member(
                &mut state,
                "outputs",
                obj(vec![(
                    "out",
                    Value::Object(vec![(
                        Utf16::from("string"),
                        Value::string_utf8("approved"),
                    )]),
                )]),
            );
            set_member(
                &mut state,
                "post",
                obj(vec![
                    ("frames", obj(vec![])),
                    ("links", Value::Array(vec![])),
                ]),
            );
        }
        if id == "text-limit-refuses" {
            expression = " ".repeat(65_537);
        }
        if string_member(case, "text").is_some_and(|v| v == &Utf16::from("exact-limit")) {
            expression = format!(
                "{}{}",
                " ".repeat(65_536usize.saturating_sub(expression.encode_utf16().count())),
                expression
            );
        }
        let rule = rule(&expression, refs);
        let phase = string_member(case, "phase")
            .and_then(|v| v.to_utf8().ok())
            .unwrap_or_else(|| "pre".to_owned());
        let mut ctx = Context::ordinary();
        match evaluate_action_rule(
            resources,
            selected_document,
            &action,
            &rule,
            &phase,
            &state,
            &mut ctx,
        ) {
            Ok(value) => obj(vec![
                ("id", Value::string_utf8(id)),
                ("outcome", obj(vec![("value", Value::Bool(value))])),
                ("stateUnchanged", Value::Bool(true)),
            ]),
            Err(error) => obj(vec![
                ("id", Value::string_utf8(id)),
                (
                    "outcome",
                    obj(vec![(
                        "refusal",
                        obj(vec![
                            ("code", Value::string_utf8(error.code)),
                            ("message", Value::String(error.message)),
                            ("path", Value::String(error.path)),
                        ]),
                    )]),
                ),
                ("stateUnchanged", Value::Bool(true)),
            ]),
        }
    }
}
