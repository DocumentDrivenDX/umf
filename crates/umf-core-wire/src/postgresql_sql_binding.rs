//! Raw SQL adapter wire, intentionally separate from catalog-capture wire.
use crate::{decode, encode, field, result_envelope};
use umf_core::{postgresql_sql_runtime as sql, Context, EngineError, Utf16, Value};

pub const PROFILE: &str = "umf.postgresql-sql-wire/1";

fn error(message: &str) -> EngineError {
    EngineError::new("REQUEST", Utf16::default(), message)
}
fn string<'a>(value: &'a Value, name: &str) -> Result<&'a Utf16, EngineError> {
    match field(value, name) {
        Some(Value::String(s)) => Ok(s),
        _ => Err(error(&format!("{name} must be a string"))),
    }
}
fn required<'a>(value: &'a Value, name: &str) -> Result<&'a Value, EngineError> {
    field(value, name).ok_or_else(|| error(&format!("{name} is required")))
}
fn validate(request: &Value, ctx: &mut Context<'_>) -> Result<&'static str, EngineError> {
    let Value::Object(fields) = request else {
        return Err(error("PostgreSQL SQL request must be an object"));
    };
    if string(request, "profile")? != &Utf16::from(PROFILE) {
        return Err(error("PostgreSQL SQL wire profile is required"));
    }
    let name = string(request, "op")?
        .to_utf8()
        .map_err(|_| error("Operation name must be ASCII"))?;
    let (op, allowed): (&str, &[&str]) = match name.as_str() {
        "postgresql-sql.import" => ("postgresql-sql.import", &["profile", "op", "source", "id"]),
        "postgresql-sql.export" => ("postgresql-sql.export", &["profile", "op", "document"]),
        "postgresql-sql.getSource" => ("postgresql-sql.getSource", &["profile", "op", "document"]),
        "postgresql-sql.getNode" => (
            "postgresql-sql.getNode",
            &["profile", "op", "document", "pointer"],
        ),
        "postgresql-sql.editNode" => (
            "postgresql-sql.editNode",
            &["profile", "op", "document", "pointer", "text"],
        ),
        "postgresql-sql.inspect" => ("postgresql-sql.inspect", &["profile", "op", "document"]),
        "postgresql-sql.inspectPayload" => (
            "postgresql-sql.inspectPayload",
            &["profile", "op", "payload"],
        ),
        "postgresql-sql.validateAst" => ("postgresql-sql.validateAst", &["profile", "op", "ast"]),
        _ => return Err(error("Unknown PostgreSQL SQL operation")),
    };
    let mut seen = std::collections::BTreeSet::new();
    for (key, _) in fields {
        ctx.charge_work(key.len().saturating_add(1), Utf16::default())?;
        if !seen.insert(key) || !allowed.iter().any(|item| key == &Utf16::from(*item)) {
            return Err(error(
                "PostgreSQL SQL request has unknown or duplicate members",
            ));
        }
    }
    match op {
        "postgresql-sql.import" => {
            let source = string(request, "source")?;
            string(request, "id")?;
            if source.len() > ctx.limits().max_text_units {
                return Err(EngineError::new(
                    "RESOURCE_LIMIT",
                    Utf16::default(),
                    "SQL source exceeds the text limit",
                ));
            }
        }
        "postgresql-sql.export" | "postgresql-sql.getSource" | "postgresql-sql.inspect" => {
            required(request, "document")?;
        }
        "postgresql-sql.getNode" => {
            required(request, "document")?;
            string(request, "pointer")?;
        }
        "postgresql-sql.editNode" => {
            required(request, "document")?;
            string(request, "pointer")?;
            string(request, "text")?;
        }
        "postgresql-sql.validateAst" => {
            required(request, "ast")?;
        }
        "postgresql-sql.inspectPayload" => {
            required(request, "payload")?;
        }
        _ => unreachable!(),
    }
    Ok(op)
}

fn execute(
    request: &Value,
    backend: &dyn umf_core::parser_backend_protocol::PostgresqlParserBackend,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    match validate(request, ctx)? {
        "postgresql-sql.import" => sql::import_postgresql_sql(
            string(request, "source")?,
            string(request, "id")?,
            backend,
            ctx,
        ),
        "postgresql-sql.export" => Ok(Value::String(sql::export_postgresql_sql(
            required(request, "document")?,
            backend,
            ctx,
        )?)),
        "postgresql-sql.getSource" => {
            sql::get_postgresql_source(required(request, "document")?, ctx)
        }
        "postgresql-sql.getNode" => sql::get_postgresql_node(
            required(request, "document")?,
            string(request, "pointer")?,
            ctx,
        ),
        "postgresql-sql.editNode" => sql::edit_postgresql_node(
            required(request, "document")?,
            string(request, "pointer")?,
            string(request, "text")?,
            ctx,
        ),
        "postgresql-sql.inspect" => {
            sql::inspect_postgresql_sql(required(request, "document")?, ctx)
        }
        "postgresql-sql.inspectPayload" => Ok(Value::Array(sql::inspect_postgresql_sql_payload(
            required(request, "payload")?,
            ctx,
        )?)),
        "postgresql-sql.validateAst" => {
            sql::validate_postgresql_ast(required(request, "ast")?, ctx)
        }
        _ => Err(error("Unknown PostgreSQL SQL operation")),
    }
}

pub fn execute_wire_with_backend(
    wire: &str,
    backend: &dyn umf_core::parser_backend_protocol::PostgresqlParserBackend,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    let result = (|| {
        let mut ctx = Context::ordinary().with_host_control(control);
        let request = ctx.with_tagged_transport_limit(|ctx| decode(wire, ctx))?;
        let output = execute(&request, backend, &mut ctx)?;
        encode(&output, &mut ctx)
    })();
    result_envelope(result)
}
