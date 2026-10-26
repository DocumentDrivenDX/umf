use super::common::*;
use crate::resources::CodegenEngine;
use crate::value::string_member;
use umf_core::{Context, EngineError, Value};

pub(super) fn selected_pins(
    engine: &CodegenEngine<'_>,
    request: &Value,
    ctx: &mut Context<'_>,
) -> Result<Pins, EngineError> {
    let selection = super::request::parse_request_selection(engine, request, ctx)?;
    super::profile::build_pins(selection, ctx)
}

pub(super) fn prepared_value(pins: &Pins) -> Value {
    obj(vec![
        ("profile", strval("umf.actions.single-set-prepared/1")),
        ("source", pins.source.clone()),
        ("model", pins.model.clone()),
        ("action", pins.action.clone()),
        ("wireAction", strval(&pins.wire_action)),
        ("entityParameter", strval(&pins.entity_parameter)),
        ("target", pins.target.clone()),
        ("keyFields", array(pins.key_fields.clone())),
        (
            "assignments",
            array([obj(vec![
                ("input", strval(&pins.assignment_input)),
                ("field", pins.assignment_field.clone()),
            ])]),
        ),
        (
            "frames",
            array([obj(vec![
                ("id", strval(&pins.frame_id)),
                ("access", strval("write")),
                ("record", pins.frame_record.clone()),
                ("entityParameter", strval(&pins.entity_parameter)),
                ("fields", array(pins.frame_fields.clone())),
            ])]),
        ),
        ("obligations", array(pins.obligations.clone())),
        ("authorization", pins.authorization.clone()),
        (
            "requiredExecutorObligations",
            array(
                pins.obligations
                    .iter()
                    .filter(|item| {
                        matches!(
                            string_member(item, "kind")
                                .and_then(|v| v.to_utf8().ok())
                                .as_deref(),
                            Some(
                                "authorization"
                                    | "attribution"
                                    | "atomicity"
                                    | "idempotency"
                                    | "result"
                            )
                        )
                    })
                    .filter_map(|item| get(item, "id").cloned()),
            ),
        ),
        ("executionVerified", Value::Bool(false)),
    ])
}

impl CodegenEngine<'_> {
    pub fn prepare_single_set_action(
        &self,
        request: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let pins = selected_pins(self, request, ctx)?;
        Ok(prepared_value(&pins))
    }
}
