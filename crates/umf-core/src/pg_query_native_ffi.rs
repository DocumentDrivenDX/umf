//! Narrow native adapter for the pinned libpg_query 17-6.1.0 C ABI.
//!
//! The `native-postgresql` feature links the bundled static artifact from
//! the pinned `pg_query` dependency. The ABI layouts and exported symbols
//! match `pg_query.h` from tag 17-6.1.0.

// Keep the bundled C archive link metadata from pg_query in this host-only graph.
use pg_query as _;
use serde_json::Value;
use std::ffi::{CStr, CString};
use std::os::raw::{c_char, c_int};

use crate::parser_backend_protocol::PostgresqlParserBackend;
use crate::postgresql_proto_json::{
    ast_to_protobuf_bounded, protobuf_to_ast_bounded, BoundedCodecError,
};
use crate::{Context, EngineError, Utf16, Value as CoreValue};

pub const POSTGRESQL_AST_VERSION: i32 = 170004;
const MAX_PROTO_AST_BYTES: usize = 32 * 1024 * 1024;
pub const LIBPG_QUERY_C_IDENTITY: &str =
    crate::parser_backend_protocol::NATIVE_PARSER_BACKEND_IDENTITY;

#[derive(Default)]
pub struct NativePgQueryBackend;

impl PostgresqlParserBackend for NativePgQueryBackend {
    fn identity(&self) -> &'static str {
        LIBPG_QUERY_C_IDENTITY
    }

    fn parse(&self, sql: &Utf16, ctx: &mut Context<'_>) -> Result<CoreValue, EngineError> {
        if sql.len() > ctx.limits().max_text_units {
            return Err(native_error(
                "POSTGRESQL_SQL_SIZE",
                "SQL exceeds the parser limit",
            ));
        }
        ctx.charge_text(sql.len(), Utf16::default())?;
        ctx.charge_work(sql.len(), Utf16::default())?;
        let sql = sql
            .to_utf8()
            .map_err(|_| native_error("POSTGRESQL_SOURCE", "SQL contains invalid UTF-16"))?;
        let ast = parse_sql_with_context(&sql, ctx)?;
        serde_to_core(&ast, ctx)
    }

    fn deparse(&self, tree: &CoreValue, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
        let ast = core_to_serde(tree, ctx)?;
        deparse_ast(&ast, ctx).map(Utf16::from)
    }

    fn codec_round_trip(
        &self,
        tree: &CoreValue,
        ctx: &mut Context<'_>,
    ) -> Result<CoreValue, EngineError> {
        let ast = core_to_serde(tree, ctx)?;
        let protobuf = ast_to_protobuf_bounded(&ast, ctx).map_err(codec_engine_error)?;
        let decoded = protobuf_to_ast_bounded(&protobuf, ctx).map_err(codec_engine_error)?;
        if decoded != ast {
            return Err(native_error(
                "POSTGRESQL_CODEC_LOSS",
                "Native protobuf conversion changed the parser AST",
            ));
        }
        serde_to_core(&decoded, ctx)
    }
}

fn codec_engine_error(error: BoundedCodecError) -> EngineError {
    match error {
        BoundedCodecError::Engine(error) => error,
        BoundedCodecError::Codec(error) => native_error("POSTGRESQL_PROTOBUF", &error.0),
    }
}

fn core_to_serde(value: &CoreValue, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let text =
        crate::serialization::write_json_value(value, crate::serialization::Format::Json, ctx)?;
    ctx.charge_work(text.len(), Utf16::default())?;
    let text = text
        .to_utf8()
        .map_err(|_| native_error("POSTGRESQL_ENCODING", "AST contains invalid UTF-16"))?;
    serde_json::from_str(&text)
        .map_err(|error| native_error("POSTGRESQL_AST", &format!("Invalid AST JSON: {error}")))
}

fn serde_to_core(value: &Value, ctx: &mut Context<'_>) -> Result<CoreValue, EngineError> {
    let mut writer = BoundedJsonWriter {
        bytes: Vec::new(),
        ctx,
        failure: None,
    };
    let encoded = serde_json::to_writer(&mut writer, value);
    if let Some(error) = writer.failure.take() {
        return Err(error);
    }
    encoded.map_err(|error| {
        native_error(
            "POSTGRESQL_AST",
            &format!("AST JSON encoding failed: {error}"),
        )
    })?;
    let text = String::from_utf8(std::mem::take(&mut writer.bytes))
        .map_err(|_| native_error("POSTGRESQL_ENCODING", "AST JSON was not UTF-8"))?;
    let unit_count = text.encode_utf16().count();
    writer.ctx.charge_text(unit_count, Utf16::default())?;
    let units = text.encode_utf16().collect::<Vec<_>>();
    drop(writer);
    crate::serialization::read_json_value(&units, crate::serialization::Format::Json, ctx)
}

struct BoundedJsonWriter<'a, 'ctx> {
    bytes: Vec<u8>,
    ctx: &'a mut Context<'ctx>,
    failure: Option<EngineError>,
}

impl std::io::Write for BoundedJsonWriter<'_, '_> {
    fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
        let max_bytes = self.ctx.limits().max_text_units.saturating_mul(4);
        if self.bytes.len().saturating_add(bytes.len()) > max_bytes {
            self.failure = Some(native_error(
                "RESOURCE_LIMIT",
                "PostgreSQL AST JSON exceeds the text limit",
            ));
            return Err(std::io::Error::other("AST JSON size limit"));
        }
        if let Err(error) = self.ctx.charge_work(bytes.len(), Utf16::default()) {
            self.failure = Some(error);
            return Err(std::io::Error::other("AST JSON work limit"));
        }
        self.bytes.extend_from_slice(bytes);
        Ok(bytes.len())
    }

    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

fn native_error(code: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}

#[repr(C)]
struct PgQueryError {
    message: *mut c_char,
    funcname: *mut c_char,
    filename: *mut c_char,
    lineno: c_int,
    cursorpos: c_int,
    context: *mut c_char,
}

#[repr(C)]
struct PgQueryProtobuf {
    len: usize,
    data: *mut c_char,
}

#[repr(C)]
struct PgQueryParseResult {
    parse_tree: *mut c_char,
    stderr_buffer: *mut c_char,
    error: *mut PgQueryError,
}

#[repr(C)]
struct PgQueryDeparseResult {
    query: *mut c_char,
    error: *mut PgQueryError,
}

#[link(name = "pg_query")]
unsafe extern "C" {
    fn pg_query_parse(input: *const c_char) -> PgQueryParseResult;
    fn pg_query_deparse_protobuf(parse_tree: PgQueryProtobuf) -> PgQueryDeparseResult;
    fn pg_query_free_parse_result(result: PgQueryParseResult);
    fn pg_query_free_deparse_result(result: PgQueryDeparseResult);
}

/// The crate's feature gate must only be enabled when linking the exact
/// 17-6.1.0 (PostgreSQL 17.4 / AST version 170004) native artifact.
fn parse_sql_with_context(sql: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    parse_sql_inner(sql, Some(ctx)).map_err(|error| match error {
        ParseFailure::Engine(error) => error,
        ParseFailure::Parser(message) => native_error("POSTGRESQL_PARSE", &message),
    })
}

enum ParseFailure {
    Engine(EngineError),
    Parser(String),
}

fn parse_sql_inner(sql: &str, mut ctx: Option<&mut Context<'_>>) -> Result<Value, ParseFailure> {
    let input = CString::new(sql)
        .map_err(|_| ParseFailure::Parser("SQL source contains an interior NUL".to_owned()))?;
    // SAFETY: input is NUL-terminated and alive for the call. The returned
    // result is released with the matching function before returning.
    let result = unsafe { pg_query_parse(input.as_ptr()) };
    let parsed = unsafe {
        (|| -> Result<Value, ParseFailure> {
            if !result.error.is_null() {
                Err(ParseFailure::Parser(copy_error_message(result.error)))
            } else if result.parse_tree.is_null() {
                Err(ParseFailure::Parser(
                    "libpg_query returned no parse tree".to_owned(),
                ))
            } else {
                let bytes = CStr::from_ptr(result.parse_tree).to_bytes();
                if bytes.len() > MAX_PROTO_AST_BYTES {
                    return Err(ParseFailure::Parser(
                        "libpg_query AST exceeds the transport limit".to_owned(),
                    ));
                }
                if let Some(ctx) = ctx.as_deref_mut() {
                    ctx.charge_text(bytes.len(), Utf16::default())
                        .map_err(ParseFailure::Engine)?;
                    ctx.charge_work(bytes.len(), Utf16::default())
                        .map_err(ParseFailure::Engine)?;
                }
                serde_json::from_slice::<Value>(bytes).map_err(|error| {
                    ParseFailure::Parser(format!("libpg_query returned invalid JSON AST: {error}"))
                })
            }
        })()
    };
    // SAFETY: result was returned by pg_query_parse and has not been freed.
    unsafe { pg_query_free_parse_result(result) };
    let ast = parsed?;
    if ast.get("version").and_then(Value::as_i64) != Some(i64::from(POSTGRESQL_AST_VERSION)) {
        return Err(ParseFailure::Parser(
            "libpg_query AST version does not match 170004".to_owned(),
        ));
    }
    Ok(ast)
}

/// Convert the edited C-JSON AST using the pinned `.proto` and ask libpg_query
/// to deparse the resulting protobuf message. The runtime parses that SQL and
/// compares it with the edited AST under its existing source-offset policy.
fn deparse_ast(ast: &Value, ctx: &mut Context<'_>) -> Result<String, EngineError> {
    let protobuf = ast_to_protobuf_bounded(ast, ctx).map_err(codec_engine_error)?;
    let decoded = protobuf_to_ast_bounded(&protobuf, ctx).map_err(codec_engine_error)?;
    if decoded != *ast {
        return Err(native_error(
            "POSTGRESQL_CODEC_LOSS",
            "PostgreSQL AST changed during protobuf encode/decode",
        ));
    }
    let length = protobuf.len();
    let data = protobuf.as_ptr() as *mut c_char;
    // SAFETY: libpg_query deparses the input message synchronously and the
    // borrowed byte slice remains alive and immutable for the duration.
    let result = unsafe { pg_query_deparse_protobuf(PgQueryProtobuf { len: length, data }) };
    let sql = unsafe {
        (|| -> Result<String, EngineError> {
            if !result.error.is_null() {
                Err(native_error(
                    "POSTGRESQL_DEPARSE",
                    &copy_error_message(result.error),
                ))
            } else if result.query.is_null() {
                Err(native_error(
                    "POSTGRESQL_DEPARSE",
                    "libpg_query returned no SQL text",
                ))
            } else {
                let sql = CStr::from_ptr(result.query).to_str().map_err(|_| {
                    native_error("POSTGRESQL_ENCODING", "libpg_query returned non-UTF-8 SQL")
                })?;
                ctx.charge_text(sql.encode_utf16().count(), Utf16::default())?;
                Ok(sql.to_owned())
            }
        })()
    };
    // SAFETY: result was returned by pg_query_deparse_protobuf.
    unsafe { pg_query_free_deparse_result(result) };
    sql
}

unsafe fn copy_error_message(error: *mut PgQueryError) -> String {
    if error.is_null() {
        return "libpg_query failed without an error message".to_owned();
    }
    // SAFETY: the C API owns a valid PgQueryError until its paired free call.
    let message = unsafe { (*error).message };
    if message.is_null() {
        "libpg_query failed without an error message".to_owned()
    } else {
        // SAFETY: message is a NUL-terminated C string owned by the result.
        unsafe { CStr::from_ptr(message) }
            .to_string_lossy()
            .into_owned()
    }
}
