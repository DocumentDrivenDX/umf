//! Draft per-runtime FFI façade for the asynchronous PostgreSQL parser.
//! The Rust `ParserSession` must be owned by one binding/runtime instance.

use umf_core::context::TransportUsage;
use umf_core::parser_backend_protocol::{ParserRequest, ParserResponse, ParserSession, ParserWork};
use umf_core::{Context, EngineError, Utf16, Value};

pub const PROFILE: &str = "umf.postgresql-parser-wire/1";

pub fn prepare_parse(
    session: &mut ParserSession,
    sql: Utf16,
    operation: Value,
    usage: TransportUsage,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let (token, request) = session.prepare_parse(sql, operation, usage, ctx)?;
    Ok(object(vec![
        ("profile", Value::string_utf8(PROFILE)),
        ("token", Value::string_utf8(token.to_string())),
        ("backend", Value::string_utf8(request.backend)),
        ("astVersion", Value::Number(request.ast_version as f64)),
        ("work", Value::string_utf8("parse")),
        (
            "sql",
            match request.work {
                ParserWork::Parse { sql } => Value::String(sql),
                _ => {
                    return Err(error(
                        "Parser session created an inconsistent parse request",
                    ));
                }
            },
        ),
    ]))
}

pub fn prepare_deparse(
    session: &mut ParserSession,
    tree: Value,
    operation: Value,
    usage: TransportUsage,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let (token, request) = session.prepare_deparse(tree, operation, usage, ctx)?;
    Ok(object(vec![
        ("profile", Value::string_utf8(PROFILE)),
        ("token", Value::string_utf8(token.to_string())),
        ("backend", Value::string_utf8(request.backend)),
        ("astVersion", Value::Number(request.ast_version as f64)),
        ("work", Value::string_utf8("deparse")),
        (
            "tree",
            match request.work {
                ParserWork::Deparse { tree } => tree,
                _ => {
                    return Err(error(
                        "Parser session created an inconsistent deparse request",
                    ));
                }
            },
        ),
    ]))
}

pub fn complete_parse(
    session: &mut ParserSession,
    token: &Utf16,
    tree: Value,
    ctx: &mut Context<'_>,
) -> Result<(Value, Value, TransportUsage), EngineError> {
    let token = parse_token(token)?;
    let completion = session.complete(token, ParserResponse::Parsed { tree }, ctx)?;
    let (operation, response, usage) = completion.into_parts();
    let ParserResponse::Parsed { tree } = response else {
        return Err(error(
            "Parser response kind does not match parse continuation",
        ));
    };
    Ok((operation, tree, usage))
}

pub fn complete_deparse(
    session: &mut ParserSession,
    token: &Utf16,
    sql: Utf16,
    ctx: &mut Context<'_>,
) -> Result<(Value, Utf16, TransportUsage), EngineError> {
    let token = parse_token(token)?;
    let completion = session.complete(token, ParserResponse::Deparsed { sql }, ctx)?;
    let (operation, response, usage) = completion.into_parts();
    let ParserResponse::Deparsed { sql } = response else {
        return Err(error(
            "Parser response kind does not match deparse continuation",
        ));
    };
    Ok((operation, sql, usage))
}

/// Start the asynchronous parse/edit/deparse/reparse sequence. The original
/// request and replacement remain in ParserSession; the host sees only each
/// bounded parser call and opaque token.
pub fn prepare_sql_edit(
    session: &mut ParserSession,
    sql: Utf16,
    pointer: Utf16,
    replacement_json: Utf16,
    usage: TransportUsage,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    ctx.charge_text(sql.len(), Utf16::default())?;
    ctx.charge_work(sql.len(), Utf16::default())?;
    let path = umf_core::native_json::native_pointer(&pointer, ctx)?;
    let replacement = umf_core::serialization::read_json_value(
        replacement_json.units(),
        umf_core::serialization::Format::Json,
        ctx,
    )?;
    let operation = object(vec![
        ("kind", Value::string_utf8("sql-edit")),
        ("phase", Value::string_utf8("parse-original")),
        ("sourceSql", Value::String(sql.clone())),
        ("pointer", Value::String(pointer)),
        ("replacement", replacement),
    ]);
    let (token, request) = session.prepare_parse(sql, operation, usage, ctx)?;
    Ok(request_value(token, request))
}

pub fn prepare_sql_import(
    session: &mut ParserSession,
    source_sql: Utf16,
    id: Utf16,
    usage: TransportUsage,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    if source_sql.units().contains(&0) || source_sql.len() > ctx.limits().max_text_units {
        return Err(error("SQL source is invalid or exceeds the text limit"));
    }
    ctx.charge_text(source_sql.len().saturating_add(id.len()), Utf16::default())?;
    ctx.charge_work(source_sql.len().saturating_add(id.len()), Utf16::default())?;
    let operation = object(vec![
        ("kind", Value::string_utf8("sql-import")),
        ("sourceSql", Value::String(source_sql.clone())),
        ("id", Value::String(id)),
    ]);
    let (token, request) = session.prepare_parse(source_sql, operation, usage, ctx)?;
    Ok(request_value(token, request))
}

pub fn complete_sql_import(
    session: &mut ParserSession,
    token: &Utf16,
    tree: Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let completion = session.complete(parse_token(token)?, ParserResponse::Parsed { tree }, ctx)?;
    let (operation, response, _) = completion.into_parts();
    if field(&operation, "kind") != Some(&Value::string_utf8("sql-import")) {
        return Err(error("Parser continuation is not a SQL import"));
    }
    let ParserResponse::Parsed { tree } = response else {
        return Err(error("SQL import expected a parse response"));
    };
    let source = match field(&operation, "sourceSql") {
        Some(Value::String(v)) => v,
        _ => return Err(error("SQL import source is missing")),
    };
    let id = match field(&operation, "id") {
        Some(Value::String(v)) => v,
        _ => return Err(error("SQL import id is missing")),
    };
    let document = umf_core::postgresql_sql_runtime::document_from_ast(source, id, &tree, ctx)?;
    Ok(object(vec![
        ("done", Value::Bool(true)),
        ("document", document),
    ]))
}

pub fn prepare_sql_export(
    session: &mut ParserSession,
    document: &Value,
    usage: TransportUsage,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let tree = umf_core::postgresql_sql_runtime::prepare_export_tree(document, ctx)?;
    let operation_tree = umf_core::copy_json(&tree, ctx)?;
    let operation = object(vec![
        ("kind", Value::string_utf8("sql-export")),
        ("phase", Value::string_utf8("codec")),
        ("tree", operation_tree),
    ]);
    let (token, request) = session.prepare_codec_round_trip(tree, operation, usage, ctx)?;
    Ok(request_value(token, request))
}

pub fn complete_sql_export(
    session: &mut ParserSession,
    token: &Utf16,
    response: ParserResponse,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let completion = session.complete(parse_token(token)?, response, ctx)?;
    let (operation, response, usage) = completion.into_parts();
    if field(&operation, "kind") != Some(&Value::string_utf8("sql-export")) {
        return Err(error("Parser continuation is not a SQL export"));
    }
    let phase = field(&operation, "phase")
        .and_then(|v| match v {
            Value::String(v) => v.to_utf8().ok(),
            _ => None,
        })
        .ok_or_else(|| error("SQL export phase is missing"))?;
    let tree = umf_core::copy_json(
        field(&operation, "tree").ok_or_else(|| error("SQL export AST is missing"))?,
        ctx,
    )?;
    match (phase.as_str(), response) {
        ("codec", ParserResponse::CodecRoundTripped { .. }) => {
            let next_tree = umf_core::copy_json(&tree, ctx)?;
            let next = object(vec![
                ("kind", Value::string_utf8("sql-export")),
                ("phase", Value::string_utf8("deparse")),
                ("tree", next_tree),
            ]);
            let (token, request) = session.prepare_deparse(tree, next, usage, ctx)?;
            Ok(object(vec![
                ("done", Value::Bool(false)),
                ("request", request_value(token, request)),
            ]))
        }
        ("deparse", ParserResponse::Deparsed { sql }) => {
            ctx.charge_text(sql.len(), Utf16::default())?;
            ctx.charge_work(sql.len(), Utf16::default())?;
            let next = object(vec![
                ("kind", Value::string_utf8("sql-export")),
                ("phase", Value::string_utf8("reparse")),
                ("candidateSql", Value::String(sql.clone())),
                ("tree", tree),
            ]);
            let (token, request) = session.prepare_parse(sql, next, usage, ctx)?;
            Ok(object(vec![
                ("done", Value::Bool(false)),
                ("request", request_value(token, request)),
            ]))
        }
        ("reparse", ParserResponse::Parsed { tree: reparsed }) => {
            umf_core::postgresql_sql_runtime::validate_ast(&reparsed, ctx)?;
            let expected = umf_core::postgresql_sql_runtime::canonical(&tree, true, ctx)?;
            if umf_core::postgresql_sql_runtime::canonical(&reparsed, true, ctx)? != expected {
                return Err(EngineError::new(
                    "POSTGRESQL_ROUND_TRIP",
                    Utf16::default(),
                    "Deparse/reparse changed AST content beyond source offsets",
                ));
            }
            let sql = umf_core::copy_json(
                field(&operation, "candidateSql")
                    .ok_or_else(|| error("Deparsed SQL is missing"))?,
                ctx,
            )?;
            Ok(object(vec![("done", Value::Bool(true)), ("sql", sql)]))
        }
        _ => Err(error("Parser response does not match SQL export phase")),
    }
}

/// Consume one opaque parser response and either return the next bounded host
/// request or the completed result. A caller cannot skip stages, replace the
/// edit, or reuse a token because each phase comes from retained Rust state.
pub fn complete_sql_edit(
    session: &mut ParserSession,
    token: &Utf16,
    response: ParserResponse,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let completion = session.complete(parse_token(token)?, response, ctx)?;
    let (operation, response, usage) = completion.into_parts();
    if field(&operation, "kind") != Some(&Value::string_utf8("sql-edit")) {
        return Err(error("Parser continuation is not a SQL edit"));
    }
    let phase = field(&operation, "phase")
        .and_then(|v| match v {
            Value::String(s) => s.to_utf8().ok(),
            _ => None,
        })
        .ok_or_else(|| error("SQL edit continuation phase is missing"))?;
    match (phase.as_str(), response) {
        ("parse-original", ParserResponse::Parsed { tree }) => {
            umf_core::postgresql_sql_runtime::validate_ast(&tree, ctx)?;
            let pointer = match field(&operation, "pointer") {
                Some(Value::String(s)) => s,
                _ => return Err(error("SQL edit pointer is missing")),
            };
            let replacement = field(&operation, "replacement")
                .ok_or_else(|| error("SQL edit replacement is missing"))?;
            let path = umf_core::native_json::native_pointer(pointer, ctx)?;
            let mut edited = umf_core::copy_json(&tree, ctx)?;
            umf_core::postgresql_sql_runtime::replace_at(
                &mut edited,
                &path,
                umf_core::copy_json(replacement, ctx)?,
            )?;
            umf_core::postgresql_sql_runtime::validate_ast(&edited, ctx)?;
            let source_sql = umf_core::copy_json(
                field(&operation, "sourceSql").ok_or_else(|| error("Source SQL is missing"))?,
                ctx,
            )?;
            let retained_edited = umf_core::copy_json(&edited, ctx)?;
            let next_operation = object(vec![
                ("kind", Value::string_utf8("sql-edit")),
                ("phase", Value::string_utf8("deparse")),
                ("sourceSql", source_sql),
                ("editedAst", retained_edited),
            ]);
            let (next_token, request) =
                session.prepare_deparse(edited, next_operation, usage, ctx)?;
            Ok(object(vec![
                ("done", Value::Bool(false)),
                ("request", request_value(next_token, request)),
            ]))
        }
        ("deparse", ParserResponse::Deparsed { sql }) => {
            let expected = umf_core::copy_json(
                field(&operation, "editedAst").ok_or_else(|| error("Edited SQL AST is missing"))?,
                ctx,
            )?;
            let source_sql = umf_core::copy_json(
                field(&operation, "sourceSql").ok_or_else(|| error("Source SQL is missing"))?,
                ctx,
            )?;
            ctx.charge_text(sql.len(), Utf16::default())?;
            ctx.charge_work(sql.len(), Utf16::default())?;
            let retained_expected = umf_core::copy_json(&expected, ctx)?;
            let next_operation = object(vec![
                ("kind", Value::string_utf8("sql-edit")),
                ("phase", Value::string_utf8("reparse")),
                ("sourceSql", source_sql),
                ("candidateSql", Value::String(sql.clone())),
                ("editedAst", retained_expected),
            ]);
            let (next_token, request) = session.prepare_parse(sql, next_operation, usage, ctx)?;
            Ok(object(vec![
                ("done", Value::Bool(false)),
                ("request", request_value(next_token, request)),
            ]))
        }
        ("reparse", ParserResponse::Parsed { tree }) => {
            umf_core::postgresql_sql_runtime::validate_ast(&tree, ctx)?;
            let expected =
                field(&operation, "editedAst").ok_or_else(|| error("Edited SQL AST is missing"))?;
            let expected = umf_core::postgresql_sql_runtime::canonical(expected, true, ctx)?;
            let actual = umf_core::postgresql_sql_runtime::canonical(&tree, true, ctx)?;
            if actual != expected {
                return Err(EngineError::new(
                    "POSTGRESQL_ROUND_TRIP",
                    Utf16::default(),
                    "Deparse/reparse changed AST content beyond source offsets",
                ));
            }
            Ok(object(vec![
                ("done", Value::Bool(true)),
                (
                    "result",
                    object(vec![
                        (
                            "sourceSql",
                            umf_core::copy_json(
                                field(&operation, "sourceSql")
                                    .ok_or_else(|| error("Source SQL is missing"))?,
                                ctx,
                            )?,
                        ),
                        (
                            "candidateSql",
                            umf_core::copy_json(
                                field(&operation, "candidateSql")
                                    .ok_or_else(|| error("Candidate SQL is missing"))?,
                                ctx,
                            )?,
                        ),
                        ("ast", tree),
                    ]),
                ),
            ]))
        }
        _ => Err(error("Parser response does not match SQL edit phase")),
    }
}

fn request_value(token: u64, request: ParserRequest) -> Value {
    let mut fields = vec![
        ("profile", Value::string_utf8(PROFILE)),
        ("token", Value::string_utf8(token.to_string())),
        ("backend", Value::string_utf8(request.backend)),
        ("astVersion", Value::Number(request.ast_version as f64)),
    ];
    match request.work {
        ParserWork::Parse { sql } => {
            fields.push(("work", Value::string_utf8("parse")));
            fields.push(("sql", Value::String(sql)));
        }
        ParserWork::Deparse { tree } => {
            fields.push(("work", Value::string_utf8("deparse")));
            fields.push(("tree", tree));
        }
        ParserWork::CodecRoundTrip { tree } => {
            fields.push(("work", Value::string_utf8("codecRoundTrip")));
            fields.push(("tree", tree));
        }
    }
    object(fields)
}

fn field<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    let Value::Object(fields) = value else {
        return None;
    };
    fields
        .iter()
        .find(|(key, _)| key == &Utf16::from(name))
        .map(|(_, value)| value)
}

fn parse_token(token: &Utf16) -> Result<u64, EngineError> {
    token
        .to_utf8()
        .ok()
        .and_then(|value| value.parse().ok())
        .ok_or_else(|| error("Parser continuation token is invalid"))
}

fn object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(key, value)| (Utf16::from(key), value))
            .collect(),
    )
}

fn error(message: &str) -> EngineError {
    EngineError::new("POSTGRESQL_BACKEND", Utf16::default(), message)
}
