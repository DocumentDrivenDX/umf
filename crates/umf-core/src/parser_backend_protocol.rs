//! Rust-owned parser contract for PostgreSQL catalog SQL operations.
//!
//! The browser package exposes asynchronous parser calls, so the public wire
//! operation is split around the host call. The host receives a bounded request
//! and returns parser output; Rust then re-admits and validates that output
//! against the exact continuation and shared cumulative usage. Native C
//! adapters implement the same `PostgresqlParserBackend` synchronously.

use crate::context::TransportUsage;
use crate::{Context, EngineError, Utf16, Value};
use std::collections::BTreeMap;

pub const PARSER_BACKEND_IDENTITY: &str = "@libpg-query/parser@17.6.10";
pub const PARSER_AST_VERSION: u32 = 170004;
pub const PARSER_PROTOCOL: &str = "umf.postgresql-parser/1";
pub const MAX_PARSER_TEXT_UNITS: usize = 4_000_000;

/// Synchronous backend used by native adapters that can call a vetted
/// PostgreSQL 17.4/libpg_query implementation directly.
pub trait PostgresqlParserBackend {
    fn identity(&self) -> &'static str;
    fn parse(&self, sql: &Utf16, ctx: &mut Context<'_>) -> Result<Value, EngineError>;
    fn deparse(&self, tree: &Value, ctx: &mut Context<'_>) -> Result<Utf16, EngineError>;
    fn codec_round_trip(&self, tree: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError>;
}

/// Work requested from an asynchronous host parser. `tree` is an AST returned
/// by the exact pinned parser, not a user-selected parser dialect.
#[derive(Debug, Clone, PartialEq)]
pub enum ParserWork {
    Parse { sql: Utf16 },
    Deparse { tree: Value },
    CodecRoundTrip { tree: Value },
}

#[derive(Debug, Clone, PartialEq)]
pub struct ParserRequest {
    pub protocol: &'static str,
    pub backend: &'static str,
    pub ast_version: u32,
    pub work: ParserWork,
}

/// Opaque invocation state retained by the binding between prepare and
/// complete. It contains the original admitted input and cumulative resource
/// usage; it must never be reconstructed from the host response.
struct ParserContinuation {
    request: ParserRequest,
    operation: Value,
    usage: TransportUsage,
}

#[derive(Debug, Clone, PartialEq)]
pub enum ParserResponse {
    Parsed { tree: Value },
    Deparsed { sql: Utf16 },
    CodecRoundTripped { tree: Value },
}

/// Per-runtime owner for asynchronous host parser continuations. The host only
/// receives a request and opaque token; the original operation, exact request
/// and cumulative usage remain in this bounded Rust-owned map.
pub struct ParserSession {
    next_token: u64,
    pending: BTreeMap<u64, ParserContinuation>,
}

#[derive(Debug)]
pub struct ParserCompletion {
    operation: Value,
    response: ParserResponse,
    usage: TransportUsage,
}

impl ParserCompletion {
    /// Consumed only by Rust operation code. This object must never cross FFI.
    pub fn into_parts(self) -> (Value, ParserResponse, TransportUsage) {
        (self.operation, self.response, self.usage)
    }
}

impl Default for ParserSession {
    fn default() -> Self {
        Self {
            next_token: 1,
            pending: BTreeMap::new(),
        }
    }
}

impl ParserSession {
    pub const MAX_PENDING: usize = 16;

    pub fn prepare_parse(
        &mut self,
        sql: Utf16,
        operation: Value,
        mut usage: TransportUsage,
        ctx: &mut Context<'_>,
    ) -> Result<(u64, ParserRequest), EngineError> {
        usage.seed(ctx);
        if sql.len() > MAX_PARSER_TEXT_UNITS {
            return Err(parser_error(
                "POSTGRESQL_SQL_SIZE",
                "SQL exceeds the admitted parser input size",
            ));
        }
        ctx.charge_text(sql.len(), Utf16::default())?;
        self.insert(
            ParserRequest {
                protocol: PARSER_PROTOCOL,
                backend: PARSER_BACKEND_IDENTITY,
                ast_version: PARSER_AST_VERSION,
                work: ParserWork::Parse { sql },
            },
            operation,
            usage,
            ctx,
        )
    }

    pub fn prepare_deparse(
        &mut self,
        tree: Value,
        operation: Value,
        mut usage: TransportUsage,
        ctx: &mut Context<'_>,
    ) -> Result<(u64, ParserRequest), EngineError> {
        usage.seed(ctx);
        charge_value(&tree, ctx)?;
        self.insert(
            ParserRequest {
                protocol: PARSER_PROTOCOL,
                backend: PARSER_BACKEND_IDENTITY,
                ast_version: PARSER_AST_VERSION,
                work: ParserWork::Deparse { tree },
            },
            operation,
            usage,
            ctx,
        )
    }

    pub fn prepare_codec_round_trip(
        &mut self,
        tree: Value,
        operation: Value,
        mut usage: TransportUsage,
        ctx: &mut Context<'_>,
    ) -> Result<(u64, ParserRequest), EngineError> {
        usage.seed(ctx);
        charge_value(&tree, ctx)?;
        self.insert(
            ParserRequest {
                protocol: PARSER_PROTOCOL,
                backend: PARSER_BACKEND_IDENTITY,
                ast_version: PARSER_AST_VERSION,
                work: ParserWork::CodecRoundTrip { tree },
            },
            operation,
            usage,
            ctx,
        )
    }

    fn insert(
        &mut self,
        request: ParserRequest,
        operation: Value,
        mut usage: TransportUsage,
        ctx: &mut Context<'_>,
    ) -> Result<(u64, ParserRequest), EngineError> {
        if self.pending.len() >= Self::MAX_PENDING {
            return Err(parser_error(
                "POSTGRESQL_PARSER_BUSY",
                "Too many pending parser calls",
            ));
        }
        match &request.work {
            ParserWork::Parse { sql } => ctx.charge_text(sql.len(), Utf16::default())?,
            ParserWork::Deparse { tree } => charge_value(tree, ctx)?,
            ParserWork::CodecRoundTrip { tree } => charge_value(tree, ctx)?,
        }
        charge_value(&operation, ctx)?;
        usage.capture(ctx);
        let token = self.next_token;
        self.next_token = token.checked_add(1).ok_or_else(|| {
            parser_error("POSTGRESQL_PARSER_BUSY", "Parser token space exhausted")
        })?;
        let host_request = request.clone();
        self.pending.insert(
            token,
            ParserContinuation {
                request,
                operation,
                usage,
            },
        );
        Ok((token, host_request))
    }

    pub fn complete(
        &mut self,
        token: u64,
        response: ParserResponse,
        ctx: &mut Context<'_>,
    ) -> Result<ParserCompletion, EngineError> {
        let continuation = self.pending.remove(&token).ok_or_else(|| {
            parser_error(
                "POSTGRESQL_PARSER_TOKEN",
                "Unknown or completed parser token",
            )
        })?;
        let (operation, response, usage) = admit_response(continuation, response, ctx)?;
        Ok(ParserCompletion {
            operation,
            response,
            usage,
        })
    }

    pub fn cancel(&mut self, token: u64) -> bool {
        self.pending.remove(&token).is_some()
    }
}

/// Validate the returned host value against the exact prepared request and
/// re-charge it under the same limits. Callers then apply the profile-specific
/// AST validation/edit/correlation before exposing a result.
fn admit_response(
    continuation: ParserContinuation,
    response: ParserResponse,
    ctx: &mut Context<'_>,
) -> Result<(Value, ParserResponse, TransportUsage), EngineError> {
    let mut usage = continuation.usage;
    usage.seed(ctx);
    if continuation.request.protocol != PARSER_PROTOCOL
        || continuation.request.backend != PARSER_BACKEND_IDENTITY
        || continuation.request.ast_version != PARSER_AST_VERSION
    {
        return Err(EngineError::new(
            "POSTGRESQL_BACKEND",
            Utf16::default(),
            "Parser continuation does not name the admitted PostgreSQL backend",
        ));
    }
    match (&continuation.request.work, &response) {
        (ParserWork::Parse { .. }, ParserResponse::Parsed { tree }) => {
            if value_number(value_field(tree, "version")) != Some(PARSER_AST_VERSION as f64) {
                return Err(EngineError::new(
                    "POSTGRESQL_AST_VERSION",
                    Utf16::default(),
                    "Parser response has an unexpected PostgreSQL AST version",
                ));
            }
            let Some(Value::Array(statements)) = value_field(tree, "stmts") else {
                return Err(parser_error(
                    "POSTGRESQL_AST_SHAPE",
                    "Parser response must contain the pinned ParseResult statement array",
                ));
            };
            if statements
                .iter()
                .any(|statement| value_field(statement, "stmt").is_none())
            {
                return Err(parser_error(
                    "POSTGRESQL_AST_SHAPE",
                    "Each parser statement must retain its RawStmt stmt member",
                ));
            }
            charge_value(tree, ctx)?;
        }
        (ParserWork::Deparse { .. }, ParserResponse::Deparsed { sql }) => {
            if sql.len() > MAX_PARSER_TEXT_UNITS {
                return Err(EngineError::new(
                    "POSTGRESQL_SQL_SIZE",
                    Utf16::default(),
                    "SQL exceeds the admitted parser output size",
                ));
            }
            ctx.charge_text(sql.len(), Utf16::default())?;
        }
        (
            ParserWork::CodecRoundTrip { tree: expected },
            ParserResponse::CodecRoundTripped { tree },
        ) => {
            charge_value(tree, ctx)?;
            let expected_text = crate::serialization::write_json_value(
                expected,
                crate::serialization::Format::Json,
                ctx,
            )?;
            let output_text = crate::serialization::write_json_value(
                tree,
                crate::serialization::Format::Json,
                ctx,
            )?;
            if expected_text != output_text {
                return Err(EngineError::new(
                    "POSTGRESQL_CODEC_LOSS",
                    Utf16::default(),
                    "Native codec changed parser AST content",
                ));
            }
        }
        _ => {
            return Err(EngineError::new(
                "POSTGRESQL_BACKEND_RESPONSE",
                Utf16::default(),
                "Parser response kind does not match the prepared request",
            ));
        }
    }
    usage.capture(ctx);
    Ok((continuation.operation, response, usage))
}

fn parser_error(code: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}

fn value_field<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    let Value::Object(fields) = value else {
        return None;
    };
    fields
        .iter()
        .find(|(key, _)| key == &Utf16::from(name))
        .map(|(_, value)| value)
}

fn value_number(value: Option<&Value>) -> Option<f64> {
    match value {
        Some(Value::Number(number)) => Some(*number),
        _ => None,
    }
}

fn charge_value(value: &Value, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    fn count(value: &Value, depth: usize, max_depth: usize) -> Result<(usize, usize), EngineError> {
        if depth > max_depth {
            return Err(EngineError::new(
                "POSTGRESQL_AST_DEPTH",
                Utf16::default(),
                "Parser AST exceeds the admitted nesting depth",
            ));
        }
        let mut values = 1usize;
        let mut text = 0usize;
        match value {
            Value::String(value) => text = value.len(),
            Value::Array(items) => {
                for item in items {
                    let (child_values, child_text) = count(item, depth + 1, max_depth)?;
                    values = values.checked_add(child_values).ok_or_else(|| {
                        EngineError::new("LIMIT", Utf16::default(), "AST value count overflow")
                    })?;
                    text = text.checked_add(child_text).ok_or_else(|| {
                        EngineError::new("LIMIT", Utf16::default(), "AST text size overflow")
                    })?;
                }
            }
            Value::Object(fields) => {
                for (key, item) in fields {
                    text = text.checked_add(key.len()).ok_or_else(|| {
                        EngineError::new("LIMIT", Utf16::default(), "AST text size overflow")
                    })?;
                    let (child_values, child_text) = count(item, depth + 1, max_depth)?;
                    values = values.checked_add(child_values).ok_or_else(|| {
                        EngineError::new("LIMIT", Utf16::default(), "AST value count overflow")
                    })?;
                    text = text.checked_add(child_text).ok_or_else(|| {
                        EngineError::new("LIMIT", Utf16::default(), "AST text size overflow")
                    })?;
                }
            }
            Value::Null | Value::Bool(_) | Value::Number(_) => {}
        }
        Ok((values, text))
    }
    let (values, text) = count(value, 0, ctx.limits().max_depth)?;
    ctx.check_tree_value_count(values, Utf16::default())?;
    ctx.charge_work(values, Utf16::default())?;
    ctx.charge_text(text, Utf16::default())
}

#[cfg(test)]
#[path = "parser_backend_protocol_test.rs"]
mod tests;
