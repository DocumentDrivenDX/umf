// SPDX-License-Identifier: MIT OR Apache-2.0
//! One-shot Rust-owned TypeSpec compiler host protocol.
use crate::{decode, encode, field, result_envelope};
use std::collections::BTreeMap;
use umf_core::{
    context::TransportUsage,
    typespec_adapter::{
        PreparedTypeSpecInspection, PreparedTypeSpecOperation, PreparedTypeSpecSyntax,
        TypeSpecOperation, TypeSpecRuntime,
    },
    Context, EngineError, Severity, Utf16, Value,
};

pub const PROFILE: &str = "umf.typespec-source-wire/1";
enum Pending {
    Compile {
        token: u64,
        state: PreparedTypeSpecOperation,
    },
    Graph {
        token: u64,
        state: PreparedTypeSpecOperation,
    },
    Emit {
        token: u64,
        state: PreparedTypeSpecOperation,
    },
    Syntax {
        token: u64,
        state: PreparedTypeSpecSyntax,
    },
    Inspection {
        token: u64,
        state: PreparedTypeSpecInspection,
    },
}
pub struct Session {
    runtime: Option<TypeSpecRuntime>,
    pending: BTreeMap<u64, Pending>,
    usage: BTreeMap<u64, TransportUsage>,
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
            next_token: 1,
        }
    }
}

pub fn execute_wire_with_session(
    session: &mut Session,
    wire: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    let result = {
        let mut ctx = Context::ordinary().with_host_control(control);
        let mut tracked_token = None;
        let result = (|| {
            let request = ctx.with_tagged_transport_limit(|ctx| decode(wire, ctx))?;
            let decode_work = ctx.charged_work();
            let decode_steps = ctx.constraint_steps();
            if let Some(token) = completion_token(&request)? {
                tracked_token = Some(token);
                let usage = session
                    .usage
                    .get(&token)
                    .ok_or_else(|| error("No TypeSpec operation is pending"))?;
                ctx.carry_transport_usage(
                    usage.charged_work().saturating_add(decode_work),
                    usage.constraint_steps().saturating_add(decode_steps),
                );
            }
            let output = execute(session, &request, &mut ctx)?;
            let prepared_token = match field(&output, "token") {
                Some(Value::String(token)) => Some(parse_token(&Value::String(token.clone()))?),
                _ => None,
            };
            if prepared_token.is_some() {
                tracked_token = prepared_token;
            }
            match encode(&output, &mut ctx) {
                Ok(value) => Ok((value, prepared_token)),
                Err(e) => {
                    if let Some(Value::String(token)) = field(&output, "token") {
                        if let Ok(token) = parse_token(&Value::String(token.clone())) {
                            session.cancel(token);
                        }
                    }
                    Err(e)
                }
            }
        })();
        if let Some(token) = tracked_token {
            if session.pending.contains_key(&token) {
                if let Some(usage) = session.usage.get_mut(&token) {
                    usage.capture(&ctx);
                }
            }
        }
        result.map(|(wire, _)| wire)
    };
    crate::result_envelope(result)
}

/// Return the normal wire envelope when a binding's session is already in use.
pub fn busy_session_envelope() -> String {
    result_envelope(Err(EngineError::new(
        "TYPESPEC_SESSION_BUSY",
        Utf16::default(),
        "TypeSpec session is already processing an operation",
    )))
}

impl Session {
    fn cancel(&mut self, token: u64) {
        self.pending.remove(&token);
        self.usage.remove(&token);
    }
    fn runtime(&mut self, ctx: &mut Context<'_>) -> Result<&TypeSpecRuntime, EngineError> {
        if self.runtime.is_none() {
            self.runtime = Some(TypeSpecRuntime::new(ctx)?);
        }
        Ok(self.runtime.as_ref().expect("initialized above"))
    }
    fn alloc_token(&mut self) -> Result<u64, EngineError> {
        let token = self.next_token;
        self.next_token = self
            .next_token
            .checked_add(1)
            .ok_or_else(|| error("TypeSpec session token exhausted"))?;
        Ok(token)
    }
}
fn execute(
    session: &mut Session,
    request: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let Value::Object(fields) = request else {
        return Err(error("TypeSpec request must be an object"));
    };
    if field(request, "profile") != Some(&s(PROFILE)) {
        return Err(error("TypeSpec source profile is required"));
    }
    let op = text(field(request, "op").ok_or_else(|| error("Operation is required"))?)?;
    let allowed: &[&str] = match op.as_str() {
        "typespec.prepareInspect" => &["profile", "op", "document"],
        "typespec.completeInspect" => &["profile", "op", "token", "response"],
        "typespec.inspectPayload" => &["profile", "op", "payload", "parserDiagnostics"],
        "typespec.prepareImport" => &["profile", "op", "input", "id"],
        "typespec.completeImport" => &["profile", "op", "token", "response"],
        "typespec.export" => &["profile", "op", "document"],
        "typespec.prepareEdit" => &["profile", "op", "document", "path", "text"],
        "typespec.completeEdit" => &["profile", "op", "token", "response"],
        "typespec.prepareCompile" => &["profile", "op", "document"],
        "typespec.completeCompile" => &["profile", "op", "token", "response"],
        "typespec.prepareGraph" => &["profile", "op", "document", "roots"],
        "typespec.completeGraph" => &["profile", "op", "token", "response"],
        "typespec.prepareEmit" => &["profile", "op", "document", "options"],
        "typespec.prepareSyntax" => &["profile", "op", "document", "path"],
        "typespec.completeEmit" => &["profile", "op", "token", "response"],
        "typespec.completeSyntax" => &["profile", "op", "token", "response"],
        "typespec.cancel" => &["profile", "op", "token"],
        _ => return Err(error("Unknown TypeSpec source operation")),
    };
    let mut seen = std::collections::BTreeSet::new();
    for (key, _) in fields {
        ctx.charge_work(key.len() + 1, Utf16::default())?;
        if !seen.insert(key) {
            return Err(error("Duplicate TypeSpec request member"));
        }
        if !allowed.contains(&key.to_utf8().unwrap_or_default().as_str()) {
            return Err(error("Unknown TypeSpec request member"));
        }
    }
    match op.as_str() {
        "typespec.inspectPayload" => {
            let payload = field(request, "payload").ok_or_else(|| error("payload is required"))?;
            let diagnostics = field(request, "parserDiagnostics")
                .ok_or_else(|| error("parserDiagnostics is required"))?;
            let runtime = session.runtime(ctx)?;
            let validation = runtime.inspect_extension_payload(payload, diagnostics, ctx)?;
            Ok(validation_value(validation, ctx)?)
        }
        "typespec.prepareInspect" => prepare_inspection(session, request, false, ctx),
        "typespec.prepareImport" => prepare_import(session, request, ctx),
        "typespec.prepareEdit" => prepare_edit(session, request, ctx),
        "typespec.export" => {
            let document =
                field(request, "document").ok_or_else(|| error("document is required"))?;
            let runtime = session.runtime(ctx)?;
            runtime.export_sources(document, ctx)
        }
        "typespec.cancel" => {
            session.cancel(parse_token(
                field(request, "token").ok_or_else(|| error("token is required"))?,
            )?);
            Ok(s("cancelled"))
        }
        "typespec.prepareCompile" => {
            prepare(session, request, TypeSpecOperation::Compile, None, ctx)
        }
        "typespec.prepareGraph" => prepare(
            session,
            request,
            TypeSpecOperation::SemanticGraph,
            Some("roots"),
            ctx,
        ),
        "typespec.prepareEmit" => prepare(
            session,
            request,
            TypeSpecOperation::EmitJsonSchema,
            Some("options"),
            ctx,
        ),
        "typespec.prepareSyntax" => prepare_syntax(session, request, ctx),
        "typespec.completeCompile"
        | "typespec.completeGraph"
        | "typespec.completeEmit"
        | "typespec.completeSyntax"
        | "typespec.completeInspect"
        | "typespec.completeImport"
        | "typespec.completeEdit" => complete(session, request, op.as_str(), ctx),
        _ => unreachable!(),
    }
}
fn prepare(
    session: &mut Session,
    request: &Value,
    operation: TypeSpecOperation,
    operand_name: Option<&str>,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    if session.pending.len() >= 8 {
        return Err(error("TypeSpec pending operation limit reached"));
    }
    let document = field(request, "document").ok_or_else(|| error("document is required"))?;
    let operands = if let Some(name) = operand_name {
        let value = field(request, name).ok_or_else(|| error("Operation input is required"))?;
        Some(object(vec![(name, copy(value, ctx)?)]))
    } else {
        None
    };
    let state = {
        let runtime = session.runtime(ctx)?;
        runtime.prepare(document, operation, operands.as_ref(), ctx)?
    };
    let request_wire = copy(state.request(), ctx)?;
    let token = session.alloc_token()?;
    session.pending.insert(
        token,
        match operation {
            TypeSpecOperation::Compile => Pending::Compile { token, state },
            TypeSpecOperation::SemanticGraph => Pending::Graph { token, state },
            TypeSpecOperation::EmitJsonSchema => Pending::Emit { token, state },
        },
    );
    session.usage.insert(token, TransportUsage::default());
    Ok(object(vec![
        ("profile", s(PROFILE)),
        ("token", s(&token.to_string())),
        ("request", request_wire),
    ]))
}
fn complete(
    session: &mut Session,
    request: &Value,
    op: &str,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let token = parse_token(field(request, "token").ok_or_else(|| error("token is required"))?)?;
    let pending = session
        .pending
        .remove(&token)
        .ok_or_else(|| error("No TypeSpec operation is pending"))?;
    let state = match (op, pending) {
        ("typespec.completeCompile", Pending::Compile { state, .. })
        | ("typespec.completeGraph", Pending::Graph { state, .. })
        | ("typespec.completeEmit", Pending::Emit { state, .. }) => CompleteState::Operation(state),
        ("typespec.completeSyntax", Pending::Syntax { state, .. }) => CompleteState::Syntax(state),
        ("typespec.completeInspect", Pending::Inspection { state, .. })
            if !state.is_importing() && !state.is_editing() =>
        {
            CompleteState::Inspection(state)
        }
        ("typespec.completeImport", Pending::Inspection { state, .. }) if state.is_importing() => {
            CompleteState::Inspection(state)
        }
        ("typespec.completeEdit", Pending::Inspection { state, .. }) if state.is_editing() => {
            CompleteState::Inspection(state)
        }
        (_, pending) => {
            session.pending.insert(token, pending);
            return Err(error(
                "TypeSpec response operation does not match pending work",
            ));
        }
    };
    session.usage.remove(&token);
    let response = field(request, "response").ok_or_else(|| error("response is required"))?;
    let runtime = session
        .runtime
        .as_ref()
        .ok_or_else(|| error("TypeSpec runtime is unavailable"))?;
    match state {
        CompleteState::Operation(state) => runtime.finish(state, response, ctx),
        CompleteState::Syntax(state) => runtime.finish_syntax(state, response, ctx),
        CompleteState::Inspection(state) => runtime.finish_inspection(state, response, ctx),
    }
}
enum CompleteState {
    Operation(PreparedTypeSpecOperation),
    Syntax(PreparedTypeSpecSyntax),
    Inspection(PreparedTypeSpecInspection),
}
fn prepare_inspection(
    session: &mut Session,
    request: &Value,
    importing: bool,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    if session.pending.len() >= 8 {
        return Err(error("TypeSpec pending operation limit reached"));
    }
    let document = field(request, "document").ok_or_else(|| error("document is required"))?;
    let (state, host_request) = {
        let runtime = session.runtime(ctx)?;
        runtime.prepare_inspection(document, importing, ctx)?
    };
    store_inspection(session, state, host_request)
}
fn prepare_import(
    session: &mut Session,
    request: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    if session.pending.len() >= 8 {
        return Err(error("TypeSpec pending operation limit reached"));
    }
    let input = field(request, "input").ok_or_else(|| error("input is required"))?;
    let id = field(request, "id").ok_or_else(|| error("id is required"))?;
    let (state, host_request) = {
        let runtime = session.runtime(ctx)?;
        runtime.prepare_import(input, id, ctx)?
    };
    store_inspection(session, state, host_request)
}
fn prepare_edit(
    session: &mut Session,
    request: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    if session.pending.len() >= 8 {
        return Err(error("TypeSpec pending operation limit reached"));
    }
    let document = field(request, "document").ok_or_else(|| error("document is required"))?;
    let path = field(request, "path").ok_or_else(|| error("path is required"))?;
    let text = field(request, "text").ok_or_else(|| error("text is required"))?;
    let (state, host_request) = {
        let runtime = session.runtime(ctx)?;
        runtime.prepare_edit_source(document, path, text, ctx)?
    };
    store_inspection(session, state, host_request)
}
fn store_inspection(
    session: &mut Session,
    state: PreparedTypeSpecInspection,
    host_request: Value,
) -> Result<Value, EngineError> {
    let token = session.alloc_token()?;
    session
        .pending
        .insert(token, Pending::Inspection { token, state });
    session.usage.insert(token, TransportUsage::default());
    Ok(object(vec![
        ("profile", s(PROFILE)),
        ("token", s(&token.to_string())),
        ("request", host_request),
    ]))
}
fn prepare_syntax(
    session: &mut Session,
    request: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    if session.pending.len() >= 8 {
        return Err(error("TypeSpec pending operation limit reached"));
    }
    let document = field(request, "document").ok_or_else(|| error("document is required"))?;
    let path = field(request, "path").ok_or_else(|| error("path is required"))?;
    let (state, host_request) = {
        let runtime = session.runtime(ctx)?;
        let state = runtime.prepare_syntax(document, path, ctx)?;
        let host_request = state.request(ctx)?;
        (state, host_request)
    };
    let token = session.alloc_token()?;
    session
        .pending
        .insert(token, Pending::Syntax { token, state });
    session.usage.insert(token, TransportUsage::default());
    Ok(object(vec![
        ("profile", s(PROFILE)),
        ("token", s(&token.to_string())),
        ("request", host_request),
    ]))
}
fn completion_token(request: &Value) -> Result<Option<u64>, EngineError> {
    let Some(op) = field(request, "op") else {
        return Ok(None);
    };
    match text(op)?.as_str() {
        "typespec.completeCompile"
        | "typespec.completeGraph"
        | "typespec.completeEmit"
        | "typespec.completeSyntax"
        | "typespec.completeInspect"
        | "typespec.completeImport"
        | "typespec.completeEdit" => Ok(Some(parse_token(
            field(request, "token").ok_or_else(|| error("token is required"))?,
        )?)),
        _ => Ok(None),
    }
}
fn parse_token(value: &Value) -> Result<u64, EngineError> {
    text(value)?
        .parse()
        .map_err(|_| error("TypeSpec continuation token is invalid"))
}
fn text(value: &Value) -> Result<String, EngineError> {
    match value {
        Value::String(v) => v
            .to_utf8()
            .map_err(|_| error("Expected UTF-8 control text")),
        _ => Err(error("Expected string")),
    }
}
fn copy(value: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    umf_core::copy_json(value, ctx)
}
fn s(text: &str) -> Value {
    Value::string_utf8(text)
}
fn object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(k, v)| (Utf16::from(k), v))
            .collect(),
    )
}
fn error(message: &str) -> EngineError {
    EngineError::new("TYPESPEC_SESSION", Utf16::default(), message)
}
fn validation_value(
    validation: umf_core::Validation,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    ctx.charge_work(validation.diagnostics.len(), Utf16::default())?;
    let mut diagnostics = Vec::with_capacity(validation.diagnostics.len());
    for diagnostic in validation.diagnostics {
        ctx.charge_work(
            diagnostic
                .code
                .len()
                .saturating_add(diagnostic.path.len())
                .saturating_add(diagnostic.message.len()),
            Utf16::default(),
        )?;
        diagnostics.push(object(vec![
            ("code", Value::String(diagnostic.code)),
            ("path", Value::String(diagnostic.path)),
            (
                "severity",
                s(match diagnostic.severity {
                    Severity::Error => "error",
                    Severity::Warning => "warning",
                }),
            ),
            ("message", Value::String(diagnostic.message)),
        ]));
    }
    Ok(object(vec![
        ("valid", Value::Bool(validation.valid)),
        ("complete", Value::Bool(validation.complete)),
        ("diagnostics", Value::Array(diagnostics)),
    ]))
}
