// SPDX-License-Identifier: MIT OR Apache-2.0
//! Closed tagged-wire state machine for the explicitly installed Smithy runtime.
use crate::{decode, encode, field, result_envelope};
use std::collections::BTreeMap;
use umf_core::{
    context::TransportUsage,
    smithy_adapter::{PreparedAssembly, PreparedSelection, SmithyRuntime},
    Context, EngineError, Utf16, Value,
};

pub const PROFILE: &str = "umf.smithy-native-wire/1";

pub fn busy_session_envelope() -> String {
    result_envelope(Err(error("SMITHY_SESSION", "Smithy session is busy")))
}

enum Pending {
    Assembly(PreparedAssembly),
    Selection(PreparedSelection),
}
pub struct Session {
    runtime: Option<SmithyRuntime>,
    pending: BTreeMap<u64, Pending>,
    usage: BTreeMap<u64, TransportUsage>,
    assembled: BTreeMap<u64, (Value, TransportUsage)>,
    next: u64,
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
            assembled: BTreeMap::new(),
            next: 1,
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
        let mut active = None;
        let outcome = (|| {
            let request = ctx.with_tagged_transport_limit(|ctx| decode(wire, ctx))?;
            let decode_work = ctx.charged_work();
            let decode_steps = ctx.constraint_steps();
            if field(&request, "profile") != Some(&s(PROFILE)) {
                return Err(error("SMITHY_PROFILE", "Smithy native profile is required"));
            }
            let op =
                text(field(&request, "op").ok_or_else(|| error("REQUEST", "op is required"))?)?;
            if let Some(token) = field(&request, "token") {
                if matches!(
                    op.as_str(),
                    "smithy.completeAssembly"
                        | "smithy.failAssembly"
                        | "smithy.completeSelection"
                        | "smithy.failSelection"
                        | "smithy.cancel"
                ) {
                    let token = parse_token(token)?;
                    active = Some(token);
                    if let Some(usage) = session.usage.get(&token) {
                        ctx.carry_transport_usage(
                            usage.charged_work().saturating_add(decode_work),
                            usage.constraint_steps().saturating_add(decode_steps),
                        );
                    }
                }
            }
            if op == "smithy.prepareSelection" {
                let handle = parse_token(
                    field(&request, "assemblyToken")
                        .ok_or_else(|| error("REQUEST", "assemblyToken is required"))?,
                )?;
                if let Some((_, usage)) = session.assembled.get(&handle) {
                    ctx.carry_transport_usage(
                        usage.charged_work().saturating_add(decode_work),
                        usage.constraint_steps().saturating_add(decode_steps),
                    );
                }
            }
            let output = execute(session, &request, &op, &mut ctx)?;
            if let Some(Value::String(token)) = field(&output, "token") {
                active = Some(
                    token
                        .to_utf8()
                        .map_err(|_| error("REQUEST", "Invalid token text"))?
                        .parse::<u64>()
                        .map_err(|_| error("REQUEST", "Invalid token"))?,
                );
            }
            if let Some(Value::String(token)) = field(&output, "assemblyToken") {
                active = Some(
                    token
                        .to_utf8()
                        .map_err(|_| error("REQUEST", "Invalid assembly token"))?
                        .parse::<u64>()
                        .map_err(|_| error("REQUEST", "Invalid assembly token"))?,
                );
            }
            match encode(&output, &mut ctx) {
                Ok(wire) => Ok(wire),
                Err(e) => {
                    if let Some(token) = active {
                        session.cancel(token);
                        session.assembled.remove(&token);
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
            } else if let Some((_, usage)) = session.assembled.get_mut(&token) {
                usage.capture(&ctx);
            }
        }
        outcome
    };
    result_envelope(result)
}

fn execute(
    session: &mut Session,
    request: &Value,
    op: &str,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let allowed: &[&str] = match op {
        "smithy.importJson" => &["profile", "op", "source", "id", "dependencies"],
        "smithy.importSources" => &["profile", "op", "files", "id"],
        "smithy.inspect" => &["profile", "op", "document"],
        "smithy.inspectPayload" => &["profile", "op", "payload"],
        "smithy.exportJson" | "smithy.exportSources" | "smithy.exportBundle" => {
            &["profile", "op", "document"]
        }
        "smithy.getNode" => &["profile", "op", "document", "path", "dependencyId"],
        "smithy.editNode" => &[
            "profile",
            "op",
            "document",
            "path",
            "replacement",
            "dependencyId",
        ],
        "smithy.editSource" => &["profile", "op", "document", "path", "source"],
        "smithy.prepareAssembly" => &["profile", "op", "document", "id", "identity"],
        "smithy.completeAssembly" => &["profile", "op", "token", "response"],
        "smithy.failAssembly" => &["profile", "op", "token", "code", "message"],
        "smithy.prepareSelection" => &["profile", "op", "assemblyToken", "selector"],
        "smithy.completeSelection" => &["profile", "op", "token", "response"],
        "smithy.failSelection" => &["profile", "op", "token", "code", "message"],
        "smithy.cancel" => &["profile", "op", "token"],
        _ => return Err(error("REQUEST", "Unknown Smithy operation")),
    };
    let Value::Object(fields) = request else {
        return Err(error("REQUEST", "Request must be an object"));
    };
    let mut seen = std::collections::BTreeSet::new();
    for (k, _) in fields {
        ctx.charge_work(k.len().saturating_add(1), Utf16::default())?;
        if !seen.insert(k) {
            return Err(error("REQUEST", "Duplicate request field"));
        }
        if !allowed
            .iter()
            .any(|name| k.to_utf8().ok().as_deref() == Some(*name))
        {
            return Err(error("REQUEST", "Unknown request field"));
        }
    }
    match op {
        "smithy.importJson" => runtime(session, ctx)?.import_json(
            required(request, "source")?,
            required(request, "id")?,
            field(request, "dependencies"),
            ctx,
        ),
        "smithy.importSources" => runtime(session, ctx)?.import_sources(
            required(request, "files")?,
            required(request, "id")?,
            ctx,
        ),
        "smithy.inspect" => {
            let validation = runtime(session, ctx)?.inspect(required(request, "document")?, ctx)?;
            umf_core::smithy_adapter::validation_value(&validation, ctx)
        }
        "smithy.inspectPayload" => {
            runtime(session, ctx)?.inspect_payload(required(request, "payload")?, ctx)
        }
        "smithy.exportJson" => {
            runtime(session, ctx)?.export(required(request, "document")?, "smithy-json-ast", ctx)
        }
        "smithy.exportSources" => {
            runtime(session, ctx)?.export(required(request, "document")?, "smithy-idl-sources", ctx)
        }
        "smithy.exportBundle" => {
            runtime(session, ctx)?.export_bundle(required(request, "document")?, ctx)
        }
        "smithy.getNode" => runtime(session, ctx)?.get_node(
            required(request, "document")?,
            required(request, "path")?,
            field(request, "dependencyId"),
            ctx,
        ),
        "smithy.editNode" => runtime(session, ctx)?.edit_node(
            required(request, "document")?,
            required(request, "path")?,
            required(request, "replacement")?,
            field(request, "dependencyId"),
            ctx,
        ),
        "smithy.editSource" => runtime(session, ctx)?.edit_source(
            required(request, "document")?,
            required(request, "path")?,
            required(request, "source")?,
            ctx,
        ),
        "smithy.prepareAssembly" => {
            ensure_pending_capacity(session)?;
            let runtime = runtime(session, ctx)?;
            let (document, id, identity) = (
                required(request, "document")?,
                required(request, "id")?,
                required(request, "identity")?,
            );
            let (state, host) = runtime.prepare_assembly(document, id, identity, ctx)?;
            let token = alloc(session)?;
            session.pending.insert(token, Pending::Assembly(state));
            session.usage.insert(token, TransportUsage::default());
            Ok(object(vec![
                ("profile", s(PROFILE)),
                ("token", s(&token.to_string())),
                ("request", host),
            ]))
        }
        "smithy.completeAssembly" => {
            let token = parse_token(required(request, "token")?)?;
            if !matches!(session.pending.get(&token), Some(Pending::Assembly(_))) {
                return Err(error(
                    "SMITHY_SESSION",
                    "Unknown token or operation mismatch",
                ));
            }
            let pending = session
                .pending
                .remove(&token)
                .ok_or_else(|| error("SMITHY_SESSION", "Unknown or consumed token"))?;
            let Pending::Assembly(state) = pending else {
                unreachable!()
            };
            let mut usage = session.usage.remove(&token).unwrap_or_default();
            let runtime = runtime(session, ctx)?;
            let result = runtime.complete_assembly(state, required(request, "response")?, ctx)?;
            if session.assembled.len() >= 8 {
                return Err(error(
                    "SMITHY_SESSION",
                    "Too many retained assemblies; consume or cancel one",
                ));
            }
            {
                let handle = alloc(session)?;
                let saved = copy(&result, ctx)?;
                usage.capture(ctx);
                session.assembled.insert(handle, (saved, usage));
                Ok(object(vec![
                    ("result", result),
                    ("assemblyToken", s(&handle.to_string())),
                ]))
            }
        }
        "smithy.failAssembly" => {
            let token = parse_token(required(request, "token")?)?;
            if !matches!(session.pending.get(&token), Some(Pending::Assembly(_))) {
                return Err(error(
                    "SMITHY_SESSION",
                    "Unknown token or operation mismatch",
                ));
            }
            let Some(Pending::Assembly(state)) = session.pending.remove(&token) else {
                unreachable!()
            };
            session.usage.remove(&token);
            let message = match required(request, "message")? {
                Value::String(message) => message.clone(),
                _ => return Err(error("REQUEST", "message must be text")),
            };
            let code = field(request, "code").unwrap_or(&Value::Null);
            let mut usage = TransportUsage::default();
            let result = runtime(session, ctx)?.fail_assembly(state, code, message, ctx)?;
            if session.assembled.len() >= 8 {
                return Err(error(
                    "SMITHY_SESSION",
                    "Too many retained assemblies; consume or cancel one",
                ));
            }
            let handle = alloc(session)?;
            let saved = copy(&result, ctx)?;
            usage.capture(ctx);
            session.assembled.insert(handle, (saved, usage));
            Ok(object(vec![
                ("result", result),
                ("assemblyToken", s(&handle.to_string())),
            ]))
        }
        "smithy.prepareSelection" => {
            ensure_pending_capacity(session)?;
            let handle = parse_token(required(request, "assemblyToken")?)?;
            let (assembly, _) = session
                .assembled
                .get(&handle)
                .ok_or_else(|| error("SMITHY_SESSION", "Assembly token is unknown or consumed"))?;
            let assembly = copy(assembly, ctx)?;
            let runtime = runtime(session, ctx)?;
            if field(&assembly, "status") == Some(&s("blocked")) {
                let result = runtime.blocked_selection_for_assembly(
                    &assembly,
                    required(request, "selector")?,
                    ctx,
                )?;
                session.assembled.remove(&handle);
                return Ok(object(vec![("result", result)]));
            }
            let (state, host) =
                runtime.prepare_selection(&assembly, required(request, "selector")?, ctx)?;
            session.assembled.remove(&handle);
            let token = alloc(session)?;
            session.pending.insert(token, Pending::Selection(state));
            session.usage.insert(token, TransportUsage::default());
            Ok(object(vec![
                ("profile", s(PROFILE)),
                ("token", s(&token.to_string())),
                ("request", host),
            ]))
        }
        "smithy.completeSelection" => {
            let token = parse_token(required(request, "token")?)?;
            if !matches!(session.pending.get(&token), Some(Pending::Selection(_))) {
                return Err(error(
                    "SMITHY_SESSION",
                    "Unknown token or operation mismatch",
                ));
            }
            let pending = session
                .pending
                .remove(&token)
                .ok_or_else(|| error("SMITHY_SESSION", "Unknown or consumed token"))?;
            let Pending::Selection(state) = pending else {
                unreachable!()
            };
            session.usage.remove(&token);
            runtime(session, ctx)?.complete_selection(state, required(request, "response")?, ctx)
        }
        "smithy.failSelection" => {
            let token = parse_token(required(request, "token")?)?;
            if !matches!(session.pending.get(&token), Some(Pending::Selection(_))) {
                return Err(error(
                    "SMITHY_SESSION",
                    "Unknown token or operation mismatch",
                ));
            }
            let Some(Pending::Selection(state)) = session.pending.remove(&token) else {
                unreachable!()
            };
            session.usage.remove(&token);
            let message = match required(request, "message")? {
                Value::String(message) => message.clone(),
                _ => return Err(error("REQUEST", "message must be text")),
            };
            let code = field(request, "code").unwrap_or(&Value::Null);
            runtime(session, ctx)?.fail_selection(state, code, message, ctx)
        }
        "smithy.cancel" => {
            let token = parse_token(required(request, "token")?)?;
            session.cancel(token);
            session.assembled.remove(&token);
            Ok(object(vec![("cancelled", Value::Bool(true))]))
        }
        _ => unreachable!(),
    }
}
fn runtime<'a>(
    session: &'a mut Session,
    ctx: &mut Context<'_>,
) -> Result<&'a SmithyRuntime, EngineError> {
    if session.runtime.is_none() {
        session.runtime = Some(SmithyRuntime::new(ctx)?);
    }
    Ok(session.runtime.as_ref().unwrap())
}
fn alloc(session: &mut Session) -> Result<u64, EngineError> {
    let n = session.next;
    session.next = session
        .next
        .checked_add(1)
        .ok_or_else(|| error("SMITHY_SESSION", "Token space exhausted"))?;
    Ok(n)
}
fn ensure_pending_capacity(session: &Session) -> Result<(), EngineError> {
    if session.pending.len() >= 16 {
        Err(error(
            "SMITHY_SESSION",
            "Too many pending Smithy operations",
        ))
    } else {
        Ok(())
    }
}
impl Session {
    fn cancel(&mut self, token: u64) {
        self.pending.remove(&token);
        self.usage.remove(&token);
    }
}
fn parse_token(v: &Value) -> Result<u64, EngineError> {
    text(v)?
        .parse()
        .map_err(|_| error("REQUEST", "Invalid Smithy token"))
}
fn text(v: &Value) -> Result<String, EngineError> {
    match v {
        Value::String(s) => s
            .to_utf8()
            .map_err(|_| error("REQUEST", "Expected UTF-8 control string")),
        _ => Err(error("REQUEST", "Expected string")),
    }
}
fn required<'a>(v: &'a Value, key: &str) -> Result<&'a Value, EngineError> {
    field(v, key).ok_or_else(|| error("REQUEST", "Required request value is missing"))
}
fn copy(v: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    umf_core::copy_json(v, ctx)
}
fn s(v: &str) -> Value {
    Value::string_utf8(v)
}
fn object(v: Vec<(&str, Value)>) -> Value {
    Value::Object(v.into_iter().map(|(k, v)| (Utf16::from(k), v)).collect())
}
fn error(code: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}
