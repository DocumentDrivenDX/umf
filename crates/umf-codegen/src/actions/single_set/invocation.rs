use super::codec::*;
use super::common::*;
use super::prepare::{prepared_value, selected_pins};
use crate::resources::CodegenEngine;
use umf_core::{Context, EngineError, Value};

impl CodegenEngine<'_> {
    pub fn admit_generated_action_invocation(
        &self,
        request: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let mut node_count = 0;
        let mut estimated_bytes = 0;
        check_tree(request, 0, &mut node_count, &mut estimated_bytes, ctx)?;
        let _admitted_request = umf_core::copy_json(request, ctx)?;
        exact_object(
            request,
            &["source", "model", "action", "authorization", "invocation"],
            "",
        )?;
        let prepare_request = obj(vec![
            (
                "source",
                get(request, "source")
                    .cloned()
                    .ok_or_else(|| invalid("/source"))?,
            ),
            (
                "model",
                get(request, "model")
                    .cloned()
                    .ok_or_else(|| invalid("/model"))?,
            ),
            (
                "action",
                get(request, "action")
                    .cloned()
                    .ok_or_else(|| invalid("/action"))?,
            ),
            (
                "authorization",
                get(request, "authorization")
                    .cloned()
                    .ok_or_else(|| invalid("/authorization"))?,
            ),
        ]);
        let pins = selected_pins(self, &prepare_request, ctx)?;
        let invocation = get(request, "invocation").ok_or_else(|| invalid("/invocation"))?;
        let kind = owned_text(
            get(invocation, "kind").ok_or_else(|| invalid("/invocation/kind"))?,
            "/invocation/kind",
        )?;
        match kind.as_str() {
            "apply" => exact_object(
                invocation,
                &[
                    "contract",
                    "schema",
                    "kind",
                    "action",
                    "inputs",
                    "idempotency_key",
                ],
                "/invocation",
            )?,
            "validate" => exact_object(
                invocation,
                &["contract", "schema", "kind", "action", "inputs"],
                "/invocation",
            )?,
            _ => return Err(unsupported("/invocation/kind")),
        }
        let wire_action_value =
            get(invocation, "action").ok_or_else(|| invalid("/invocation/action"))?;
        if !matches!(wire_action_value, Value::String(value) if !value.is_empty() && value.len() <= 513)
        {
            return Err(invalid("/invocation/action"));
        }
        let wire_action = owned_text(wire_action_value, "/invocation/action")?;
        if owned_text(
            get(invocation, "contract").ok_or_else(|| invalid("/invocation/contract"))?,
            "/invocation/contract",
        )? != "umf.access/1"
            || owned_text(
                get(invocation, "schema").ok_or_else(|| invalid("/invocation/schema"))?,
                "/invocation/schema",
            )? != owned_text(
                get(&pins.source, "sha256").ok_or_else(|| invalid("/source/sha256"))?,
                "/source/sha256",
            )?
            || wire_action != pins.wire_action
        {
            return Err(integrity("/invocation"));
        }
        if kind == "apply" {
            match get(invocation, "idempotency_key")
                .ok_or_else(|| invalid("/invocation/idempotency_key"))?
            {
                Value::Null => {}
                Value::String(key)
                    if !key.is_empty() && key.len() <= 256 && key.to_utf8().is_ok() => {}
                _ => return Err(invalid("/invocation/idempotency_key")),
            }
        }
        let map = get(invocation, "inputs").ok_or_else(|| invalid("/invocation/inputs"))?;
        let expected = vec![pins.entity_parameter.clone(), pins.assignment_input.clone()];
        let values = input_members(map, &expected, "/invocation/inputs")?;
        let entity_value = values
            .iter()
            .find(|(key, _)| key == &pins.entity_parameter)
            .map(|(_, value)| *value)
            .ok_or_else(|| invalid("/invocation/inputs"))?;
        let assignment_value = values
            .iter()
            .find(|(key, _)| key == &pins.assignment_input)
            .map(|(_, value)| *value)
            .ok_or_else(|| invalid("/invocation/inputs"))?;
        let key_field_id = field_identity(&pins.key_fields[0])?.1;
        exact_object(entity_value, &[&key_field_id], "/invocation/inputs/entity")?;
        let key_value = owned_text(
            get(entity_value, &key_field_id).ok_or_else(|| invalid("/invocation/inputs/entity"))?,
            "/invocation/inputs/entity",
        )?;
        let assignment_value = owned_text(assignment_value, "/invocation/inputs/value")?;
        let (components, tuple) = key_components(self, &pins, &key_value, ctx)?;
        let assignment = admit_string(
            self,
            &pins.document,
            &pins.assignment_field,
            &assignment_value,
            ctx,
        )?;
        let inputs = typed_input_map(&pins, &key_value, &assignment_value);
        let digest = invocation_digest(&pins.model, &pins.action, &inputs, ctx)?;
        Ok(obj(vec![
            ("profile", strval("umf.actions.single-set-invocation/1")),
            ("preparation", prepared_value(&pins)),
            ("inputs", inputs),
            ("entity", create_result_entity(&pins, components, tuple)),
            (
                "assignments",
                array([obj(vec![
                    ("input", strval(&pins.assignment_input)),
                    ("field", pins.assignment_field.clone()),
                    ("literal", assignment),
                    ("native", strval(&assignment_value)),
                ])]),
            ),
            (
                "inputSha256Profile",
                strval("umf.actions.generated-invocation/1"),
            ),
            ("inputSha256", strval(digest)),
            ("executionVerified", Value::Bool(false)),
        ]))
    }
}

fn input_members<'a>(
    value: &'a Value,
    expected: &[String],
    path: &str,
) -> Result<Vec<(String, &'a Value)>, EngineError> {
    let members = crate::value::object_members(value).ok_or_else(|| invalid(path))?;
    if members.len() != expected.len() {
        return Err(unsupported(path));
    }
    let mut pairs = Vec::with_capacity(members.len());
    let mut seen = std::collections::BTreeSet::new();
    for (key, value) in members {
        if key.is_empty() || key.len() > 256 {
            return Err(invalid(path));
        }
        let key = key.to_utf8().map_err(|_| invalid(path))?;
        if !expected.iter().any(|expected| expected == &key) || !seen.insert(key.clone()) {
            return Err(unsupported(path));
        }
        pairs.push((key, value));
    }
    Ok(pairs)
}
