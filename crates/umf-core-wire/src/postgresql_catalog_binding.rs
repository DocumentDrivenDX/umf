//! Scratch tagged-wire binding for native PostgreSQL catalog capture operations.
use crate::{decode, encode, field, result_envelope};
use umf_core::{postgresql_catalog as pg, Context, EngineError, Utf16, Value};
pub const PROFILE: &str = "umf.postgresql-catalog-wire/1";
fn error(message: &str) -> EngineError {
    EngineError::new("REQUEST", Utf16::default(), message)
}
fn required<'a>(v: &'a Value, k: &str) -> Result<&'a Value, EngineError> {
    field(v, k).ok_or_else(|| error(&format!("{k} is required")))
}
fn string<'a>(v: &'a Value, k: &str) -> Result<&'a Utf16, EngineError> {
    match field(v, k) {
        Some(Value::String(s)) => Ok(s),
        _ => Err(error(&format!("{k} must be a string"))),
    }
}
fn allowed(op: &str) -> Option<&'static [&'static str]> {
    Some(match op {
        "postgresql.import" => &["profile", "op", "source", "id"],
        "postgresql.inspect"
        | "postgresql.export"
        | "postgresql.columns"
        | "postgresql.reconstruction" => &["profile", "op", "document"],
        "postgresql.getNode" => &["profile", "op", "document", "pointer"],
        "postgresql.findRelation" => &["profile", "op", "document", "schema", "name"],
        "postgresql.edit" => &["profile", "op", "document", "path", "text"],
        "postgresql.dependencies" => &["profile", "op", "document", "side", "object"],
        "postgresql.facetType" => &["profile", "op", "native"],
        "postgresql.facetPredicate" => &["profile", "op", "native", "columnName"],
        "postgresql.facetCatalog" | "postgresql.cardinalityCatalog" | "postgresql.keyCatalog" => {
            &["profile", "op", "source"]
        }
        "postgresql.cardinalityType" => &["profile", "op", "source", "schema", "relation", "name"],
        "postgresql.cardinalityCorrelate" => &["profile", "op", "source", "document"],
        "postgresql.facetCorrelate" => &["profile", "op", "source", "document", "datumFormat"],
        "postgresql.resolvedPredicate" => &[
            "profile",
            "op",
            "native",
            "serverVersion",
            "encoding",
            "datumFormat",
        ],
        _ => return None,
    })
}
fn validate<'a>(request: &'a Value, ctx: &mut Context<'_>) -> Result<&'static str, EngineError> {
    let Value::Object(fields) = request else {
        return Err(error("PostgreSQL request must be an object"));
    };
    if string(request, "profile")? != &Utf16::from(PROFILE) {
        return Err(error("PostgreSQL catalog wire profile is required"));
    }
    let op = string(request, "op")?;
    let names = [
        "postgresql.import",
        "postgresql.inspect",
        "postgresql.export",
        "postgresql.columns",
        "postgresql.getNode",
        "postgresql.findRelation",
        "postgresql.edit",
        "postgresql.reconstruction",
        "postgresql.dependencies",
        "postgresql.facetType",
        "postgresql.facetPredicate",
        "postgresql.facetCatalog",
        "postgresql.cardinalityCatalog",
        "postgresql.cardinalityType",
        "postgresql.keyCatalog",
        "postgresql.resolvedPredicate",
        "postgresql.cardinalityCorrelate",
        "postgresql.facetCorrelate",
    ];
    let op = names
        .into_iter()
        .find(|candidate| op.units().iter().copied().eq(candidate.encode_utf16()))
        .ok_or_else(|| error("Unknown PostgreSQL catalog operation"))?;
    let allowed = allowed(op).unwrap();
    let mut seen = std::collections::BTreeSet::new();
    for (name, _) in fields {
        ctx.charge_work(name.len().saturating_add(1), Utf16::default())?;
        if !seen.insert(name) || !allowed.iter().any(|known| name == &Utf16::from(*known)) {
            return Err(error("PostgreSQL request has unknown or duplicate members"));
        }
    }
    match op {
        "postgresql.import" => {
            let source = string(request, "source")?;
            string(request, "id")?;
            if source.len() > ctx.limits().max_text_units {
                return Err(EngineError::new(
                    "RESOURCE_LIMIT",
                    Utf16::default(),
                    "PostgreSQL source exceeds the text limit",
                ));
            }
        }
        "postgresql.inspect"
        | "postgresql.export"
        | "postgresql.columns"
        | "postgresql.reconstruction" => {
            required(request, "document")?;
        }
        "postgresql.getNode" => {
            required(request, "document")?;
            string(request, "pointer")?;
        }
        "postgresql.findRelation" => {
            required(request, "document")?;
            string(request, "schema")?;
            string(request, "name")?;
        }
        "postgresql.edit" => {
            required(request, "document")?;
            string(request, "path")?;
            let text = string(request, "text")?;
            if text.len() > ctx.limits().max_text_units {
                return Err(EngineError::new(
                    "RESOURCE_LIMIT",
                    Utf16::default(),
                    "PostgreSQL replacement exceeds the text limit",
                ));
            }
        }
        "postgresql.dependencies" => {
            required(request, "document")?;
        }
        "postgresql.facetType" => {
            required(request, "native")?;
        }
        "postgresql.facetPredicate" => {
            required(request, "native")?;
            string(request, "columnName")?;
        }
        "postgresql.facetCatalog" | "postgresql.cardinalityCatalog" | "postgresql.keyCatalog" => {
            string(request, "source")?;
        }
        "postgresql.cardinalityType" => {
            string(request, "source")?;
            string(request, "schema")?;
            string(request, "relation")?;
            string(request, "name")?;
        }
        "postgresql.cardinalityCorrelate" => {
            string(request, "source")?;
            required(request, "document")?;
        }
        "postgresql.facetCorrelate" => {
            string(request, "source")?;
            required(request, "document")?;
            string(request, "datumFormat")?;
        }
        "postgresql.resolvedPredicate" => {
            required(request, "native")?;
            required(request, "serverVersion")?;
            string(request, "encoding")?;
            string(request, "datumFormat")?;
        }
        _ => unreachable!(),
    }
    Ok(op)
}

/// Parser-dependent native counterpart of the opaque browser ParserSession.
/// The runtime injects the admitted backend; caller input cannot select one.
pub fn execute_with_parser_backend(
    request: &Value,
    backend: &dyn umf_core::parser_backend_protocol::PostgresqlParserBackend,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let op = validate(request, ctx)?;
    match op {
        "postgresql.facetCorrelate" => pg::correlate_facet_catalog_with_backend(
            required(request, "document")?,
            string(request, "source")?,
            string(request, "datumFormat")?,
            backend,
            ctx,
        ),
        _ => execute(request, ctx),
    }
}
fn execute(request: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let op = validate(request, ctx)?;
    match op {
        "postgresql.import" => {
            let capture = pg::PostgresqlCatalogCapture::import(string(request, "source")?, ctx)?;
            pg::document_value(string(request, "id")?, &capture, ctx)
        }
        "postgresql.inspect" => pg::inspect_document(required(request, "document")?, ctx),
        "postgresql.export" => Ok(Value::String(pg::export_document(
            required(request, "document")?,
            ctx,
        )?)),
        "postgresql.columns" => {
            let doc = required(request, "document")?;
            let catalog = pg::catalog_from_document(doc, ctx)?;
            let columns = catalog.columns(ctx)?;
            Ok(Value::Array(
                columns
                    .into_iter()
                    .map(|c| {
                        Value::Object(vec![
                            (Utf16::from("path"), Value::String(c.path)),
                            (
                                Utf16::from("relation"),
                                Value::Object(vec![
                                    (Utf16::from("schema"), Value::String(c.schema)),
                                    (Utf16::from("name"), Value::String(c.relation)),
                                    (Utf16::from("kind"), Value::String(c.kind)),
                                ]),
                            ),
                            (Utf16::from("element"), c.element),
                            (Utf16::from("nativeColumn"), c.native_column),
                        ])
                    })
                    .collect(),
            ))
        }
        "postgresql.getNode" => pg::get_node(
            required(request, "document")?,
            string(request, "pointer")?,
            ctx,
        ),
        "postgresql.findRelation" => pg::find_relation(
            required(request, "document")?,
            string(request, "schema")?,
            string(request, "name")?,
            ctx,
        ),
        "postgresql.edit" => pg::propose_edit(
            required(request, "document")?,
            string(request, "path")?,
            string(request, "text")?,
            ctx,
        ),
        "postgresql.reconstruction" => pg::get_reconstruction(required(request, "document")?, ctx),
        "postgresql.facetType" => pg::inspect_facet_type(required(request, "native")?, ctx),
        "postgresql.facetPredicate" => pg::inspect_facet_predicate(
            required(request, "native")?,
            string(request, "columnName")?,
            ctx,
        ),
        "postgresql.facetCatalog" => pg::inspect_facet_catalog(string(request, "source")?, ctx),
        "postgresql.cardinalityCatalog" => {
            pg::inspect_cardinality_catalog(string(request, "source")?, ctx)
        }
        "postgresql.cardinalityType" => pg::resolve_cardinality_type(
            string(request, "source")?,
            string(request, "schema")?,
            string(request, "relation")?,
            string(request, "name")?,
            ctx,
        ),
        "postgresql.cardinalityCorrelate" => pg::correlate_cardinality_catalog(
            required(request, "document")?,
            string(request, "source")?,
            ctx,
        ),
        "postgresql.facetCorrelate" => pg::correlate_facet_catalog(
            required(request, "document")?,
            string(request, "source")?,
            string(request, "datumFormat")?,
            ctx,
        ),
        "postgresql.keyCatalog" => pg::inspect_key_catalog(string(request, "source")?, ctx),
        "postgresql.resolvedPredicate" => pg::inspect_resolved_predicate(
            required(request, "native")?,
            required(request, "serverVersion")?,
            required(request, "encoding")?,
            required(request, "datumFormat")?,
            ctx,
        ),
        "postgresql.dependencies" => {
            let (side, catalog, ty, identity) =
                match (field(request, "side"), field(request, "object")) {
                    (None | Some(Value::Null), None | Some(Value::Null)) => {
                        (None, None, None, None)
                    }
                    (Some(Value::String(side)), Some(object)) => (
                        Some(side),
                        Some(string(object, "catalog")?),
                        Some(string(object, "type")?),
                        Some(string(object, "identity")?),
                    ),
                    _ => return Err(error("dependencies filter requires both side and object")),
                };
            pg::query_dependencies(
                required(request, "document")?,
                side,
                catalog,
                ty,
                identity,
                ctx,
            )
        }
        _ => Err(error("Unknown PostgreSQL catalog operation")),
    }
}
pub fn execute_wire(wire: &str) -> String {
    let mut control = |_: usize| Ok(());
    execute_wire_with_control(wire, &mut control)
}
pub fn execute_wire_with_control(
    wire: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    let result = (|| {
        let mut ctx = Context::ordinary().with_host_control(control);
        let request = ctx.with_tagged_transport_limit(|ctx| decode(wire, ctx))?;
        let output = execute(&request, &mut ctx)?;
        encode(&output, &mut ctx)
    })();
    result_envelope(result)
}

/// Parser-enabled wire entrypoint used by runtimes that have explicitly
/// admitted a PostgreSQL parser backend. The backend itself is never chosen
/// from request data and receives the same controlled operation context.
pub fn execute_wire_with_parser_backend(
    wire: &str,
    backend: &dyn umf_core::parser_backend_protocol::PostgresqlParserBackend,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    let result = (|| {
        let mut ctx = Context::ordinary().with_host_control(control);
        let request = ctx.with_tagged_transport_limit(|ctx| decode(wire, ctx))?;
        let output = execute_with_parser_backend(&request, backend, &mut ctx)?;
        encode(&output, &mut ctx)
    })();
    result_envelope(result)
}
