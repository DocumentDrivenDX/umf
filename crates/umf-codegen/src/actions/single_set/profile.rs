use super::common::*;
use crate::actions::ActionObligation;
use crate::value::string_member;
use umf_core::{Context, EngineError, Utf16, Value};

pub(super) struct RequestSelection {
    pub(super) source: Value,
    pub(super) model: Value,
    pub(super) action_pin: Value,
    pub(super) authorization_profile: Value,
    pub(super) authorization_resources: Vec<String>,
    pub(super) evidence: Vec<String>,
    pub(super) document: Value,
    pub(super) module_id: String,
    pub(super) action_id: String,
    pub(super) declaration: Value,
    pub(super) obligations: Vec<ActionObligation>,
    pub(super) policy_id: Utf16,
}

pub(super) fn build_pins(
    selection: RequestSelection,
    ctx: &mut Context<'_>,
) -> Result<Pins, EngineError> {
    let RequestSelection {
        source,
        model,
        action_pin,
        authorization_profile,
        authorization_resources,
        evidence,
        document,
        module_id,
        action_id,
        declaration,
        mut obligations,
        policy_id,
    } = selection;
    let auth_profile = &authorization_profile;
    let auth_resources = authorization_resources;
    let record = super::record_shape::select_record(&document, &module_id)?;
    let selected_action =
        super::action_shape::select_action(&document, &declaration, &record, &module_id, ctx)?;
    let entity_parameter_id = selected_action.entity_parameter_id;
    let assignment_input = selected_action.assignment_input;
    let assignment_field = selected_action.assignment_field;
    let frame_id = selected_action.frame_id;
    let frame_record = selected_action.frame_record;
    let frame_fields = selected_action.frame_fields;
    let key_fields = vec![record.key_field.clone()];
    let key_ref = record.key_ref.clone();
    let authorization_declaration =
        get(&declaration, "authorization").ok_or_else(|| unsupported("/action/authorization"))?;
    exact_object(
        authorization_declaration,
        &["kind", "profile", "resources"],
        "/action/authorization",
    )?;
    if string_member(authorization_declaration, "kind")
        .and_then(|v| v.to_utf8().ok())
        .as_deref()
        != Some("policy")
    {
        return Err(unsupported("/action/authorization"));
    }
    let declared_profile = get(authorization_declaration, "profile")
        .ok_or_else(|| unsupported("/action/authorization/profile"))?;
    exact_object(
        declared_profile,
        &["id", "version"],
        "/action/authorization/profile",
    )?;
    bounded_identifier(
        get(declared_profile, "id")
            .ok_or_else(|| unsupported("/action/authorization/profile/id"))?,
        "/action/authorization/profile/id",
    )?;
    bounded_identifier(
        get(declared_profile, "version")
            .ok_or_else(|| unsupported("/action/authorization/profile/version"))?,
        "/action/authorization/profile/version",
    )?;
    let declared_resources = array_text(
        get(authorization_declaration, "resources")
            .ok_or_else(|| unsupported("/action/authorization/resources"))?,
        "/action/authorization/resources",
        false,
    )?;
    if declared_resources != auth_resources
        || get(declared_profile, "id") != get(auth_profile, "id")
        || get(declared_profile, "version") != get(auth_profile, "version")
        || declared_resources != vec![frame_id.clone()]
    {
        return Err(unsupported("/authorization"));
    }

    let mut obligation_values = Vec::with_capacity(obligations.len());
    let mut host_supported = false;
    for obligation in obligations.drain(..) {
        let id = obligation.path.to_utf8().map_err(|_| invalid("/action"))?;
        if id == policy_id.to_utf8().unwrap_or_default() {
            host_supported = true;
        }
        obligation_values.push(obj(vec![
            ("id", Value::String(obligation.path.clone())),
            ("path", Value::String(obligation.path.clone())),
            ("kind", Value::String(obligation.kind)),
            ("status", Value::String(obligation.status)),
        ]));
    }
    if !host_supported {
        return Err(unsupported("/authorization"));
    }
    let output_authorization = obj(vec![
        ("obligation", Value::String(policy_id)),
        ("profile", umf_core::copy_json(auth_profile, ctx)?),
        ("resources", array(auth_resources.iter().map(strval))),
        ("status", strval("supported")),
        ("evidence", array(evidence.iter().map(strval))),
    ]);
    Ok(Pins {
        source,
        model,
        action: action_pin,
        authorization: output_authorization,
        document,
        obligations: obligation_values,
        entity_parameter: entity_parameter_id,
        target: key_ref,
        key_fields,
        assignment_input,
        assignment_field,
        frame_id,
        frame_record,
        frame_fields: frame_fields.to_vec(),
        wire_action: format!("{module_id}.{action_id}"),
    })
}
