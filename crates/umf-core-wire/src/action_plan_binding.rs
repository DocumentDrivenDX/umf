// SPDX-License-Identifier: MIT OR Apache-2.0
//! Closed, staged Action Plan host protocol.
use crate::{decode, encode, field, result_envelope};
use std::collections::BTreeMap;
use umf_core::{
    action_plan_adapter::{
        ActionPlanPendingInspection, ActionPlanRuntime, ActionPlanSelectionRequest,
    },
    context::TransportUsage,
    Context, EngineError, Utf16, Value,
};

pub const PROFILE: &str = "umf.actions-plan-wire/1";

enum Pending {
    Model {
        artifact: Value,
        document: Value,
        action_pin: Value,
    },
    Registry {
        request: ActionPlanSelectionRequest,
        state: ActionPlanPendingInspection,
    },
    Selection(ActionPlanPendingInspection),
}

pub struct Session {
    runtime: Option<ActionPlanRuntime>,
    pending: BTreeMap<u64, Pending>,
    usage: BTreeMap<u64, TransportUsage>,
    manifest_assessment: Option<(Value, Value, Value)>,
    verified_plan_inspection: Option<Value>,
    next_token: u64,
}

impl Default for Session {
    fn default() -> Self {
        Self::new()
    }
}

impl Session {
    pub fn new() -> Self {
        Self {
            runtime: None,
            pending: BTreeMap::new(),
            usage: BTreeMap::new(),
            manifest_assessment: None,
            verified_plan_inspection: None,
            next_token: 1,
        }
    }
    fn runtime(&mut self, ctx: &mut Context<'_>) -> Result<&mut ActionPlanRuntime, EngineError> {
        if self.runtime.is_none() {
            self.runtime = Some(ActionPlanRuntime::new(ctx)?);
        }
        Ok(self.runtime.as_mut().expect("initialized above"))
    }
    fn token(&mut self) -> Result<u64, EngineError> {
        if self.pending.len() >= 16 {
            return Err(error("Action Plan pending-operation bound exceeded"));
        }
        let token = self.next_token;
        self.next_token = self
            .next_token
            .checked_add(1)
            .ok_or_else(|| error("Action Plan token exhausted"))?;
        Ok(token)
    }
    fn cancel(&mut self, token: u64) {
        self.pending.remove(&token);
        self.usage.remove(&token);
    }
}

pub fn execute_wire_with_session(
    session: &mut Session,
    wire: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    let result = {
        let mut ctx = Context::ordinary().with_host_control(control);
        let mut active = None;
        let work = (|| {
            let request = ctx.with_tagged_transport_limit(|ctx| decode(wire, ctx))?;
            let decode_work = ctx.charged_work();
            let decode_steps = ctx.constraint_steps();
            if let Some(token) = completion_token(&request)? {
                active = Some(token);
                let usage = session
                    .usage
                    .get(&token)
                    .ok_or_else(|| error("No Action Plan operation is pending"))?;
                ctx.carry_transport_usage(
                    usage.charged_work().saturating_add(decode_work),
                    usage.constraint_steps().saturating_add(decode_steps),
                );
            }
            let output = execute(session, &request, &mut ctx)?;
            if active.is_none() {
                active = pending_token(&output);
            }
            if let Some(token) = active {
                if session.pending.contains_key(&token) {
                    if let Some(usage) = session.usage.get_mut(&token) {
                        usage.capture(&ctx);
                    }
                }
            }
            match encode(&output, &mut ctx) {
                Ok(encoded) => Ok(encoded),
                Err(e) => {
                    if let Some(token) = pending_token(&output) {
                        session.cancel(token);
                    }
                    Err(e)
                }
            }
        })();
        if let Some(token) = active {
            if session.pending.contains_key(&token) {
                if let Some(usage) = session.usage.get_mut(&token) {
                    usage.capture(&ctx);
                }
            } else {
                session.usage.remove(&token);
            }
        }
        work
    };
    result_envelope(result)
}

pub fn busy_session_envelope() -> String {
    result_envelope(Err(EngineError::new(
        "PAP_SESSION_BUSY",
        Utf16::default(),
        "Action Plan session is already processing",
    )))
}

fn execute(
    session: &mut Session,
    request: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let Value::Object(fields) = request else {
        return Err(error("Action Plan request must be an object"));
    };
    if field(request, "profile") != Some(&s(PROFILE)) {
        return Err(error("Action Plan wire profile is required"));
    }
    let op = text(Some(
        field(request, "op").ok_or_else(|| error("Operation is required"))?,
    ))?;
    let allowed: &[&str] = match op.as_str() {
        "actions.prepareModel" => &[
            "profile",
            "op",
            "modelPin",
            "actionPin",
            "models",
            "actions",
        ],
        "actions.prepareInspect" => &[
            "profile",
            "op",
            "artifact",
            "models",
            "actions",
            "selections",
        ],
        "actions.prepareAssess" => &[
            "profile",
            "op",
            "inspection",
            "capabilities",
            "models",
            "actions",
            "selections",
        ],
        "actions.inspectManifest" => &[
            "profile",
            "op",
            "artifact",
            "planInspection",
            "models",
            "actions",
        ],
        "actions.constructManifest" => &[
            "profile",
            "op",
            "request",
            "planInspection",
            "models",
            "actions",
        ],
        "actions.assessManifest" => &[
            "profile",
            "op",
            "supplied",
            "fresh",
            "capabilities",
            "planAssessment",
        ],
        "actions.completeRegistry" => &["profile", "op", "token", "response"],
        "actions.completeSelection" => &["profile", "op", "token", "response"],
        "actions.cancel" => &["profile", "op", "token"],
        _ => return Err(error("Unknown Action Plan operation")),
    };
    let mut names = std::collections::BTreeSet::new();
    for (key, _) in fields {
        ctx.charge_work(key.len() + 1, Utf16::default())?;
        if !names.insert(key) {
            return Err(error("Duplicate Action Plan request member"));
        }
        if !allowed.contains(&key.to_utf8().unwrap_or_default().as_str()) {
            return Err(error("Unknown Action Plan request member"));
        }
    }
    match op.as_str() {
        "actions.prepareModel" => prepare_model(session, request, ctx),
        "actions.prepareInspect" => prepare_inspection(session, request, false, ctx),
        "actions.prepareAssess" => prepare_inspection(session, request, true, ctx),
        "actions.inspectManifest" => {
            let plan = req(request, "planInspection")?;
            let authorized = authorize_plan_inspection(session, plan, ctx)?;
            session.runtime(ctx)?.inspect_manifest(
                req(request, "artifact")?,
                if authorized { plan } else { &Value::Null },
                req(request, "models")?,
                req(request, "actions")?,
                ctx,
            )
        }
        "actions.constructManifest" => {
            let plan = req(request, "planInspection")?;
            if !authorize_plan_inspection(session, plan, ctx)? {
                return Err(EngineError::new(
                    "PAP_ACTION",
                    Utf16::default(),
                    "Fresh Rust Action Plan inspection receipt required",
                ));
            }
            session.runtime(ctx)?.construct_manifest(
                req(request, "request")?,
                plan,
                req(request, "models")?,
                req(request, "actions")?,
                ctx,
            )
        }
        "actions.assessManifest" => {
            let supplied = req(request, "supplied")?;
            let fresh = req(request, "fresh")?;
            let capabilities = req(request, "capabilities")?;
            let plan_assessment = req(request, "planAssessment")?;
            if field(plan_assessment, "compatible") != Some(&Value::Bool(true)) {
                session.manifest_assessment = None;
                return session.runtime(ctx)?.assess_manifest(
                    supplied,
                    fresh,
                    capabilities,
                    plan_assessment,
                    ctx,
                );
            }
            let receipt = session.manifest_assessment.take().ok_or_else(|| {
                EngineError::new(
                    "PAP_ACTION",
                    Utf16::default(),
                    "Fresh Rust Action Plan assessment receipt required",
                )
            });
            let receipt = match receipt {
                Ok(receipt) => receipt,
                Err(refusal) => return session.runtime(ctx)?.blocked_assessment(refusal, ctx),
            };
            let fresh_plan = field(fresh, "plan").unwrap_or(&Value::Null);
            if &receipt.0 != fresh_plan
                || &receipt.1 != capabilities
                || &receipt.2 != plan_assessment
            {
                return session.runtime(ctx)?.blocked_assessment(
                    EngineError::new(
                        "PAP_ACTION",
                        Utf16::default(),
                        "Action Manifest assessment receipt mismatch",
                    ),
                    ctx,
                );
            }
            session.runtime(ctx)?.assess_manifest(
                supplied,
                fresh,
                capabilities,
                plan_assessment,
                ctx,
            )
        }
        "actions.completeRegistry" => complete_registry(session, request, ctx),
        "actions.completeSelection" => complete_selection(session, request, ctx),
        "actions.cancel" => {
            session.cancel(parse_token(
                field(request, "token").ok_or_else(|| error("token required"))?,
            )?);
            Ok(s("cancelled"))
        }
        _ => unreachable!(),
    }
}

fn prepare_model(
    session: &mut Session,
    request: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let model_pin = req(request, "modelPin")?;
    let action_pin = req(request, "actionPin")?;
    let models = req(request, "models")?;
    let actions = req(request, "actions")?;
    let (artifact, document, action_pin) = {
        let runtime = session.runtime(ctx)?;
        let artifact = runtime.prepare_model(model_pin, action_pin, models, actions, ctx)?;
        let document =
            runtime.model_registry_source(model_pin, action_pin, models, actions, ctx)?;
        (artifact, document, umf_core::copy_json(action_pin, ctx)?)
    };
    let token = session.token()?;
    session.pending.insert(
        token,
        Pending::Model {
            artifact,
            document,
            action_pin,
        },
    );
    session.usage.insert(token, TransportUsage::default());
    let document = match session.pending.get(&token).unwrap() {
        Pending::Model { document, .. } => document,
        _ => unreachable!(),
    };
    match registry_request(token, document, ctx) {
        Ok(output) => Ok(output),
        Err(error) => {
            session.cancel(token);
            Err(error)
        }
    }
}

fn prepare_inspection(
    session: &mut Session,
    request: &Value,
    assess: bool,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    session.verified_plan_inspection = None;
    if assess {
        session.manifest_assessment = None;
    }
    let models = req(request, "models")?;
    let actions = req(request, "actions")?;
    let selections = req(request, "selections")?;
    // Public inspectActionPlan throws only while admitting its input artifact.
    // Once admitted, ordinary plan/original/profile failures become blocked
    // report data and must never authorize a host callback.
    let admitted_source = if assess {
        None
    } else {
        Some(
            session
                .runtime(ctx)?
                .read_inspection_source(req(request, "artifact")?, ctx)?,
        )
    };
    let prepared = if assess {
        session.runtime(ctx)?.prepare_assessment(
            req(request, "inspection")?,
            req(request, "capabilities")?,
            models,
            actions,
            selections,
            ctx,
        )
    } else {
        session.runtime(ctx)?.prepare_inspection(
            req(request, "artifact")?,
            models,
            actions,
            selections,
            ctx,
        )
    };
    let (selection_request, state) = match prepared {
        Ok(value) => value,
        Err(failure) if assess => {
            return session.runtime(ctx)?.blocked_assessment(failure, ctx);
        }
        Err(failure) => {
            return session.runtime(ctx)?.blocked_inspection(
                admitted_source.expect("inspection source admitted before preparation"),
                failure,
                ctx,
            );
        }
    };
    let document = umf_core::copy_json(&state.document, ctx)?;
    let token = session.token()?;
    session.pending.insert(
        token,
        Pending::Registry {
            request: selection_request,
            state,
        },
    );
    session.usage.insert(token, TransportUsage::default());
    match registry_request(token, &document, ctx) {
        Ok(output) => Ok(output),
        Err(error) => {
            session.cancel(token);
            Err(error)
        }
    }
}

fn complete_registry(
    session: &mut Session,
    request: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let token = parse_token(req(request, "token")?)?;
    let response = req(request, "response")?;
    closed_object(
        response,
        &["source", "diagnostics", "actionSemantics", "dddSemantics"],
    )?;
    let pending = session
        .pending
        .remove(&token)
        .ok_or_else(|| error("Unknown or consumed Action Plan token"))?;
    let source = req(response, "source")?;
    let diagnostics = req(response, "diagnostics")?;
    let action_semantics = match req(response, "actionSemantics")? {
        Value::Bool(value) => *value,
        _ => return Err(error("actionSemantics must be boolean")),
    };
    let ddd_semantics = match req(response, "dddSemantics")? {
        Value::Bool(value) => *value,
        _ => return Err(error("dddSemantics must be boolean")),
    };
    match pending {
        Pending::Model {
            artifact,
            document,
            action_pin,
        } => {
            if umf_core::copy_json(source, ctx)? != document {
                return Err(error("Action Plan registry source changed"));
            }
            if !action_semantics {
                return Err(error("Explicit Action semantic registration is required"));
            }
            if session
                .runtime(ctx)?
                .registry_diagnostics_refusal(
                    &document,
                    &action_pin,
                    diagnostics,
                    ddd_semantics,
                    ctx,
                )?
                .is_some()
            {
                return Err(EngineError::new(
                    "PAP_ACTION",
                    Utf16::default(),
                    "Original declaration or model validation failed",
                ));
            }
            Ok(artifact)
        }
        Pending::Registry {
            request: selection,
            mut state,
        } => {
            if umf_core::copy_json(source, ctx)? != state.document {
                return Err(error("Action Plan registry source changed"));
            }
            state.ddd_interpreted = ddd_semantics;
            if !action_semantics {
                let refusal = error("Explicit Action semantic registration is required");
                return session.runtime(ctx)?.block_inspection(state, refusal, ctx);
            }
            let action_pin = req(&state.plan, "action")?;
            if let Some(refusals) = session.runtime(ctx)?.registry_diagnostics_refusal(
                &state.document,
                action_pin,
                diagnostics,
                ddd_semantics,
                ctx,
            )? {
                return session
                    .runtime(ctx)?
                    .block_inspection_with_diagnostics(state, refusals, ctx);
            }
            session.pending.insert(token, Pending::Selection(state));
            session.usage.entry(token).or_default().capture(ctx);
            match selection_request_value(token, &selection, ctx) {
                Ok(output) => Ok(output),
                Err(error) => {
                    session.cancel(token);
                    Err(error)
                }
            }
        }
        Pending::Selection(_) => Err(error("Registry stage already completed")),
    }
}

fn complete_selection(
    session: &mut Session,
    request: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let token = parse_token(req(request, "token")?)?;
    let pending = session
        .pending
        .remove(&token)
        .ok_or_else(|| error("Unknown or consumed Action Plan token"))?;
    let Pending::Selection(state) = pending else {
        return Err(error("Selection stage is not pending"));
    };
    session.usage.remove(&token);
    closed_object(
        req(request, "response")?,
        &["eligible", "dependencies", "diagnostics"],
    )?;
    let receipt = if let Some((inspection, capabilities)) = &state.assessment {
        Some((
            umf_core::copy_json(inspection, ctx)?,
            umf_core::copy_json(capabilities, ctx)?,
        ))
    } else {
        None
    };
    let result =
        session
            .runtime(ctx)?
            .complete_inspection(state, req(request, "response")?, ctx)?;
    if let Some((inspection, capabilities)) = receipt {
        session.manifest_assessment = Some((inspection, capabilities, result.clone()));
    } else if field(&result, "eligible") == Some(&Value::Bool(true)) {
        session.verified_plan_inspection = Some(result.clone());
    }
    Ok(result)
}

fn authorize_plan_inspection(
    session: &mut Session,
    supplied: &Value,
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    let eligible = field(supplied, "eligible") == Some(&Value::Bool(true));
    let receipt = session.verified_plan_inspection.take();
    if !eligible {
        return Ok(true);
    }
    let Some(receipt) = receipt else {
        return Ok(false);
    };
    Ok(umf_core::copy_json(supplied, ctx)? == receipt)
}

fn registry_request(
    token: u64,
    document: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    Ok(object([
        ("stage", s("registry")),
        ("token", s(&token.to_string())),
        ("document", umf_core::copy_json(document, ctx)?),
    ]))
}
fn selection_request_value(
    token: u64,
    request: &ActionPlanSelectionRequest,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    Ok(object([
        ("stage", s("selection")),
        ("token", s(&token.to_string())),
        ("profile", umf_core::copy_json(&request.profile, ctx)?),
        ("artifact", umf_core::copy_json(&request.artifact, ctx)?),
        ("model", umf_core::copy_json(&request.model, ctx)?),
        ("target", umf_core::copy_json(&request.target, ctx)?),
    ]))
}
fn pending_token(output: &Value) -> Option<u64> {
    text(field(output, "token")).ok()?.parse::<u64>().ok()
}
fn completion_token(request: &Value) -> Result<Option<u64>, EngineError> {
    let op = text(Some(
        field(request, "op").ok_or_else(|| error("Operation required"))?,
    ))?;
    if matches!(
        op.as_str(),
        "actions.completeRegistry" | "actions.completeSelection"
    ) {
        Ok(Some(parse_token(req(request, "token")?)?))
    } else {
        Ok(None)
    }
}
fn req<'a>(value: &'a Value, key: &str) -> Result<&'a Value, EngineError> {
    field(value, key).ok_or_else(|| error("Required Action Plan member missing"))
}
fn parse_token(value: &Value) -> Result<u64, EngineError> {
    text(Some(value))?
        .parse()
        .map_err(|_| error("Invalid Action Plan token"))
}
fn text(value: Option<&Value>) -> Result<String, EngineError> {
    match value {
        Some(Value::String(s)) => s
            .to_utf8()
            .map_err(|_| error("Action Plan text must be valid UTF-8")),
        _ => Err(error("Expected Action Plan text")),
    }
}
fn s(value: &str) -> Value {
    Value::string_utf8(value)
}
fn object(fields: impl IntoIterator<Item = (&'static str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(k, v)| (Utf16::from(k), v))
            .collect(),
    )
}
fn closed_object(value: &Value, allowed: &[&str]) -> Result<(), EngineError> {
    let Value::Object(fields) = value else {
        return Err(error("Action Plan stage response must be an object"));
    };
    let mut seen = std::collections::BTreeSet::new();
    for (key, _) in fields {
        if !seen.insert(key) {
            return Err(error("Duplicate Action Plan response member"));
        }
        if !allowed.iter().any(|name| key == &Utf16::from(*name)) {
            return Err(error("Unknown Action Plan response member"));
        }
    }
    Ok(())
}
fn error(message: &str) -> EngineError {
    EngineError::new("PAP_REQUEST", Utf16::default(), message)
}
