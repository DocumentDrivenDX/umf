use super::common::*;
use super::record_shape::RecordShape;
use crate::value::{array_items, string_member};
use umf_core::{Context, EngineError, Value};

pub(super) struct ActionShape {
    pub(super) entity_parameter_id: String,
    pub(super) assignment_input: String,
    pub(super) assignment_field: Value,
    pub(super) frame_id: String,
    pub(super) frame_record: Value,
    pub(super) frame_fields: Vec<Value>,
}

struct ParameterShape {
    entity_parameter_id: String,
    assignment_input: String,
    assignment_field: Value,
}

struct WriteShape {
    frame_id: String,
    frame_fields: Vec<Value>,
}

pub(super) fn select_action(
    document: &Value,
    action: &Value,
    record: &RecordShape,
    module_id: &str,
    ctx: &mut Context<'_>,
) -> Result<ActionShape, EngineError> {
    exact_object(
        action,
        &[
            "id",
            "name",
            "description",
            "parameters",
            "outputs",
            "preconditions",
            "postconditions",
            "failures",
            "reads",
            "writes",
            "binding",
            "authorization",
            "attribution",
            "atomicity",
            "idempotency",
            "result",
        ],
        "/action",
    )?;
    validate_action_contract(action)?;
    let parameters = select_parameters(document, action, record, module_id)?;
    let write = select_write(
        action,
        &parameters.entity_parameter_id,
        &parameters.assignment_input,
        &parameters.assignment_field,
        &record.record_ref,
        ctx,
    )?;
    Ok(ActionShape {
        entity_parameter_id: parameters.entity_parameter_id,
        assignment_input: parameters.assignment_input,
        assignment_field: parameters.assignment_field,
        frame_id: write.frame_id,
        frame_record: record.record_ref.clone(),
        frame_fields: write.frame_fields,
    })
}

fn select_parameters(
    document: &Value,
    action: &Value,
    record: &RecordShape,
    module_id: &str,
) -> Result<ParameterShape, EngineError> {
    let record_id = &record.record_id;
    let key_id = &record.key_id;
    let key_field = &record.key_field;
    let members = &record.members;
    let parameters =
        array_items(get(action, "parameters").ok_or_else(|| unsupported("/action/parameters"))?)
            .ok_or_else(|| unsupported("/action/parameters"))?;
    if parameters.len() != 2 {
        return Err(unsupported("/action/parameters"));
    }
    let entity_parameters = parameters
        .iter()
        .filter(|parameter| {
            string_member(parameter, "kind")
                .and_then(|v| v.to_utf8().ok())
                .as_deref()
                == Some("entity")
        })
        .collect::<Vec<_>>();
    let value_parameters = parameters
        .iter()
        .filter(|parameter| {
            string_member(parameter, "kind")
                .and_then(|v| v.to_utf8().ok())
                .as_deref()
                == Some("value")
        })
        .collect::<Vec<_>>();
    if entity_parameters.len() != 1 || value_parameters.len() != 1 {
        return Err(unsupported("/action/parameters"));
    }
    let entity_parameter = entity_parameters[0];
    exact_object(
        entity_parameter,
        &["id", "kind", "target", "required"],
        "/action/parameters/entity",
    )?;
    let value_parameter = value_parameters[0];
    exact_object(
        value_parameter,
        &["id", "kind", "field", "required"],
        "/action/parameters/value",
    )?;
    if get(entity_parameter, "required") != Some(&Value::Bool(true))
        || get(value_parameter, "required") != Some(&Value::Bool(true))
    {
        return Err(unsupported("/action/parameters"));
    }
    let entity_parameter_id = bounded_identifier(
        get(entity_parameter, "id").ok_or_else(|| unsupported("/action/parameters"))?,
        "/action/parameters",
    )?;
    if !key_ref_matches(
        get(entity_parameter, "target")
            .ok_or_else(|| unsupported("/action/parameters/entity/target"))?,
        &module_id,
        &record_id,
        &key_id,
        "/action/parameters/entity/target",
    )? {
        return Err(unsupported("/action/parameters/entity/target"));
    }
    let assignment_field = get(value_parameter, "field")
        .ok_or_else(|| unsupported("/action/parameters/value/field"))?
        .clone();
    let assignment_field_model = require_supported_string_field(
        &document,
        &assignment_field,
        "/action/parameters/value/field",
    )?;
    if get(&assignment_field_model, "allowedValues").is_none()
        && get(&assignment_field_model, "facets")
            .and_then(|facets| get(facets, "length"))
            .is_none()
    {
        return Err(unsupported("/action/parameters/value/field"));
    }
    if same_ref(&assignment_field, key_field)
        || !members
            .iter()
            .any(|member| same_ref(member, &assignment_field))
    {
        return Err(unsupported("/action/parameters/value/field"));
    }
    let assignment_input = bounded_identifier(
        get(value_parameter, "id").ok_or_else(|| unsupported("/action/parameters/value/id"))?,
        "/action/parameters/value/id",
    )?;
    if entity_parameter_id == assignment_input {
        return Err(unsupported("/action/parameters"));
    }

    Ok(ParameterShape {
        entity_parameter_id,
        assignment_input,
        assignment_field,
    })
}

fn validate_action_contract(action: &Value) -> Result<(), EngineError> {
    let attribution =
        get(action, "attribution").ok_or_else(|| unsupported("/action/attribution"))?;
    exact_object(attribution, &["subject"], "/action/attribution")?;
    if get(attribution, "subject")
        .and_then(string_value)
        .as_deref()
        != Some("person-required")
        || get(action, "atomicity").and_then(string_value).as_deref() != Some("single-store")
        || get(action, "idempotency").and_then(string_value).as_deref()
            != Some("caller-key-optional")
    {
        return Err(unsupported("/action"));
    }
    let result = get(action, "result").ok_or_else(|| unsupported("/action/result"))?;
    exact_object(
        result,
        &["identities", "version", "receipt"],
        "/action/result",
    )?;
    if string_value(get(result, "identities").unwrap_or(&Value::Null)).as_deref()
        != Some("created-and-changed")
        || string_value(get(result, "version").unwrap_or(&Value::Null)).as_deref()
            != Some("store-opaque")
        || string_value(get(result, "receipt").unwrap_or(&Value::Null)).as_deref()
            != Some("read-at-least")
    {
        return Err(unsupported("/action/result"));
    }

    Ok(())
}

fn select_write(
    action: &Value,
    entity_parameter_id: &str,
    assignment_input: &str,
    assignment_field: &Value,
    record_ref: &Value,
    ctx: &mut Context<'_>,
) -> Result<WriteShape, EngineError> {
    select_binding_effect(
        action,
        entity_parameter_id,
        assignment_input,
        assignment_field,
    )?;
    select_write_frame(
        action,
        entity_parameter_id,
        assignment_field,
        record_ref,
        ctx,
    )
}

fn select_binding_effect(
    action: &Value,
    entity_parameter_id: &str,
    assignment_input: &str,
    assignment_field: &Value,
) -> Result<(), EngineError> {
    let binding = get(action, "binding").ok_or_else(|| unsupported("/action/binding"))?;
    exact_object(binding, &["kind", "profile", "effects"], "/action/binding")?;
    if string_member(binding, "kind")
        .and_then(|v| v.to_utf8().ok())
        .as_deref()
        != Some("recipe")
    {
        return Err(unsupported("/action/binding"));
    }
    let profile = get(binding, "profile").ok_or_else(|| unsupported("/action/binding/profile"))?;
    exact_object(profile, &["id", "version"], "/action/binding/profile")?;
    if bounded_identifier(
        get(profile, "id").ok_or_else(|| unsupported("/action/binding/profile/id"))?,
        "/action/binding/profile/id",
    )? != "graph-write"
        || bounded_identifier(
            get(profile, "version")
                .ok_or_else(|| unsupported("/action/binding/profile/version"))?,
            "/action/binding/profile/version",
        )? != "1"
    {
        return Err(unsupported("/action/binding/profile"));
    }
    let effects =
        array_items(get(binding, "effects").ok_or_else(|| unsupported("/action/binding/effects"))?)
            .ok_or_else(|| unsupported("/action/binding/effects"))?;
    if effects.len() != 1
        || string_member(&effects[0], "kind")
            .and_then(|v| v.to_utf8().ok())
            .as_deref()
            != Some("set")
    {
        return Err(unsupported("/action/binding/effects"));
    }
    let effect = &effects[0];
    exact_object(
        effect,
        &["id", "kind", "entity", "values"],
        "/action/binding/effects/0",
    )?;
    bounded_identifier(
        get(effect, "id").ok_or_else(|| unsupported("/action/binding/effects/0/id"))?,
        "/action/binding/effects/0/id",
    )?;
    let entity_binding =
        get(effect, "entity").ok_or_else(|| unsupported("/action/binding/effects/0/entity"))?;
    exact_object(
        entity_binding,
        &["parameter"],
        "/action/binding/effects/0/entity",
    )?;
    if string_value(get(entity_binding, "parameter").unwrap_or(&Value::Null)).as_deref()
        != Some(entity_parameter_id)
    {
        return Err(unsupported("/action/binding/effects/0/entity"));
    }
    let assignments = array_items(
        get(effect, "values").ok_or_else(|| unsupported("/action/binding/effects/0/values"))?,
    )
    .ok_or_else(|| unsupported("/action/binding/effects/0/values"))?;
    if assignments.len() != 1
        || get(&assignments[0], "field").is_none_or(|field| !same_ref(field, assignment_field))
        || get(&assignments[0], "value")
            .and_then(|v| get(v, "parameter"))
            .and_then(string_value)
            .as_deref()
            != Some(assignment_input)
    {
        return Err(unsupported("/action/binding/effects/0/values"));
    }
    exact_object(
        &assignments[0],
        &["field", "value"],
        "/action/binding/effects/0/values/0",
    )?;
    exact_object(
        get(&assignments[0], "value").unwrap(),
        &["parameter"],
        "/action/binding/effects/0/values/0/value",
    )?;
    for (name, expected_len) in [
        ("preconditions", 0),
        ("postconditions", 0),
        ("outputs", 0),
        ("failures", 0),
        ("reads", 0),
        ("writes", 1),
    ] {
        if array_items(get(action, name).ok_or_else(|| unsupported("/action"))?)
            .is_none_or(|values| values.len() != expected_len)
        {
            return Err(unsupported("/action"));
        }
    }
    Ok(())
}

fn select_write_frame(
    action: &Value,
    entity_parameter_id: &str,
    assignment_field: &Value,
    record_ref: &Value,
    ctx: &mut Context<'_>,
) -> Result<WriteShape, EngineError> {
    let write_frames = array_items(get(action, "writes").unwrap()).unwrap();
    let frame = &write_frames[0];
    exact_object(
        frame,
        &[
            "id",
            "record",
            "selector",
            "maxEntities",
            "fields",
            "relationships",
            "create",
            "delete",
        ],
        "/action/writes/0",
    )?;
    let frame_id = bounded_identifier(
        get(frame, "id").ok_or_else(|| unsupported("/action/writes/0/id"))?,
        "/action/writes/0/id",
    )?;
    let frame_fields =
        array_items(get(frame, "fields").ok_or_else(|| unsupported("/action/writes/0/fields"))?)
            .ok_or_else(|| unsupported("/action/writes/0/fields"))?;
    if frame_fields.len() != 1
        || !same_ref(&frame_fields[0], &assignment_field)
        || get(frame, "record").is_none_or(|record| !same_ref(record, &record_ref))
        || get(frame, "maxEntities") != Some(&Value::Number(1.0))
        || get(frame, "create") != Some(&Value::Bool(false))
        || get(frame, "delete") != Some(&Value::Bool(false))
        || array_items(
            get(frame, "relationships")
                .ok_or_else(|| unsupported("/action/writes/0/relationships"))?,
        )
        .is_none_or(|items| !items.is_empty())
    {
        return Err(unsupported("/action/writes/0"));
    }
    let selector =
        get(frame, "selector").ok_or_else(|| unsupported("/action/writes/0/selector"))?;
    exact_object(
        selector,
        &["language", "version", "expression", "references"],
        "/action/writes/0/selector",
    )?;
    if bounded_identifier(
        get(selector, "language")
            .ok_or_else(|| unsupported("/action/writes/0/selector/language"))?,
        "/action/writes/0/selector/language",
    )? != "umf.actions.keys"
        || bounded_identifier(
            get(selector, "version")
                .ok_or_else(|| unsupported("/action/writes/0/selector/version"))?,
            "/action/writes/0/selector/version",
        )? != "1"
    {
        return Err(unsupported("/action/writes/0/selector"));
    }
    let refs = array_items(
        get(selector, "references")
            .ok_or_else(|| unsupported("/action/writes/0/selector/references"))?,
    )
    .ok_or_else(|| unsupported("/action/writes/0/selector/references"))?;
    if refs.len() != 1 {
        return Err(unsupported("/action/writes/0/selector/references"));
    }
    exact_object(
        &refs[0],
        &["parameter"],
        "/action/writes/0/selector/references/0",
    )?;
    if bounded_identifier(
        get(&refs[0], "parameter")
            .ok_or_else(|| unsupported("/action/writes/0/selector/references/0/parameter"))?,
        "/action/writes/0/selector/references/0/parameter",
    )? != entity_parameter_id
    {
        return Err(unsupported("/action/writes/0/selector/references"));
    }
    let expression = string_member(selector, "expression")
        .ok_or_else(|| unsupported("/action/writes/0/selector/expression"))?;
    if !crate::actions::selector_uses_entity_parameter(expression, entity_parameter_id, ctx)? {
        return Err(unsupported("/action/writes/0/selector/expression"));
    }

    Ok(WriteShape {
        frame_id,
        frame_fields: frame_fields.to_vec(),
    })
}
