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
        "postgresql.prepareFieldProjection" | "postgresql.prepareRecordProjection" => {
            &["profile", "op", "author", "request"]
        }
        "postgresql.completeFieldProjection" | "postgresql.completeRecordProjection" => {
            &["profile", "op", "prepared", "target"]
        }
        "postgresql.prepareFieldRecovery" | "postgresql.prepareRecordRecovery" => {
            &["profile", "op", "receipt"]
        }
        "postgresql.recoverFieldProjection" | "postgresql.recoverRecordProjection" => {
            &["profile", "op", "receipt", "fresh", "nativeText"]
        }
        "postgresql.prepareCardinalityProjection" => &["profile", "op", "author", "request"],
        "postgresql.completeCardinalityProjection" => &["profile", "op", "prepared", "target"],
        "postgresql.prepareCardinalityRecovery" => &["profile", "op", "receipt"],
        "postgresql.recoverCardinalityProjection" => {
            &["profile", "op", "receipt", "fresh", "nativeText"]
        }
        "postgresql.prepareNullabilityProjection" => &[
            "profile", "op", "author", "request",
        ],
        "postgresql.completeNullabilityProjection" => &[
            "profile", "op", "prepared", "target",
        ],
        "postgresql.prepareNullabilityRecovery" => &["profile", "op", "receipt"],
        "postgresql.recoverNullabilityProjection" => &[
            "profile", "op", "receipt", "fresh", "nativeText",
        ],
        "postgresql.projectFieldWithNativeBackend"
        | "postgresql.projectRecordWithNativeBackend"
        | "postgresql.projectCardinalityWithNativeBackend" => {
            &["profile", "op", "author", "request"]
        }
        "postgresql.projectNullabilityWithNativeBackend" => {
            &["profile", "op", "author", "request"]
        }
        "postgresql.recoverFieldWithNativeBackend"
        | "postgresql.recoverRecordWithNativeBackend"
        | "postgresql.recoverCardinalityWithNativeBackend" => {
            &["profile", "op", "receipt", "nativeText"]
        }
        "postgresql.recoverNullabilityWithNativeBackend" => {
            &["profile", "op", "receipt", "nativeText"]
        }
        "postgresql.classifyField"
        | "postgresql.classifyRecord"
        | "postgresql.classifyCardinality"
        | "postgresql.classifyNullability"
        | "postgresql.classifyComposite" => &["profile", "op", "source", "request"],
        "postgresql.prepareDdlParserRequest" => &["profile", "op", "source", "request"],
        "postgresql.classifyDdlRecord" => &["profile", "op", "source", "request", "parser"],
        "postgresql.getDdlDeclarations" => &["profile", "op", "document"],
        "postgresql.prepareKeyParserRequests" | "postgresql.prepareKeyCorrelation" => {
            &["profile", "op", "source", "request"]
        }
        "postgresql.prepareRelationshipParserRequests" => &["profile", "op", "source", "request"],
        "postgresql.classifyRelationships" => &["profile", "op", "source", "request", "parser"],
        "postgresql.verifyRelationshipClassification" | "postgresql.recoverRelationshipSource" => {
            &["profile", "op", "receipt", "current", "parser"]
        }
        "postgresql.prepareFacetParserRequests" => &["profile", "op", "request"],
        "postgresql.classifyKeys" | "postgresql.classifyFacets" | "postgresql.keyCorrelate" => {
            &["profile", "op", "source", "request", "parser"]
        }
        "postgresql.verifyCompositeClassification"
        | "postgresql.recoverCompositeCapture"
        | "postgresql.verifyFieldClassification"
        | "postgresql.recoverFieldCapture"
        | "postgresql.verifyRecordClassification"
        | "postgresql.recoverRecordCapture"
        | "postgresql.verifyCardinalityClassification"
        | "postgresql.recoverCardinalitySource"
        | "postgresql.verifyNullabilityClassification"
        | "postgresql.recoverNullabilitySource" => &["profile", "op", "receipt", "current"],
        "postgresql.verifyKeyClassification"
        | "postgresql.recoverKeySource"
        | "postgresql.verifyFacetClassification"
        | "postgresql.recoverFacetSource" => &["profile", "op", "receipt", "current", "parser"],
        "postgresql.verifyDdlKinds" | "postgresql.recoverDdlKinds" => {
            &["profile", "op", "receipt", "current", "parser"]
        }
        "postgresql.inspect"
        | "postgresql.export"
        | "postgresql.columns"
        | "postgresql.reconstruction" => &["profile", "op", "document"],
        "postgresql.inspectPayload" => &["profile", "op", "payload"],
        "postgresql.getNode" => &["profile", "op", "document", "pointer"],
        "postgresql.findRelation" => &["profile", "op", "document", "schema", "name"],
        "postgresql.edit" | "postgresql.proposeCatalogEdit" => {
            &["profile", "op", "document", "path", "text"]
        }
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
        "postgresql.prepareFieldProjection",
        "postgresql.completeFieldProjection",
        "postgresql.recoverFieldProjection",
        "postgresql.prepareRecordProjection",
        "postgresql.completeRecordProjection",
        "postgresql.recoverRecordProjection",
        "postgresql.prepareFieldRecovery",
        "postgresql.prepareRecordRecovery",
        "postgresql.prepareCardinalityProjection",
        "postgresql.completeCardinalityProjection",
        "postgresql.prepareCardinalityRecovery",
        "postgresql.recoverCardinalityProjection",
        "postgresql.prepareNullabilityProjection",
        "postgresql.completeNullabilityProjection",
        "postgresql.prepareNullabilityRecovery",
        "postgresql.recoverNullabilityProjection",
        "postgresql.projectFieldWithNativeBackend",
        "postgresql.projectRecordWithNativeBackend",
        "postgresql.projectCardinalityWithNativeBackend",
        "postgresql.projectNullabilityWithNativeBackend",
        "postgresql.recoverFieldWithNativeBackend",
        "postgresql.recoverRecordWithNativeBackend",
        "postgresql.recoverCardinalityWithNativeBackend",
        "postgresql.recoverNullabilityWithNativeBackend",
        "postgresql.classifyComposite",
        "postgresql.getDdlDeclarations",
        "postgresql.prepareDdlParserRequest",
        "postgresql.classifyDdlRecord",
        "postgresql.verifyDdlKinds",
        "postgresql.recoverDdlKinds",
        "postgresql.verifyCompositeClassification",
        "postgresql.recoverCompositeCapture",
        "postgresql.classifyField",
        "postgresql.verifyFieldClassification",
        "postgresql.recoverFieldCapture",
        "postgresql.classifyRecord",
        "postgresql.verifyRecordClassification",
        "postgresql.recoverRecordCapture",
        "postgresql.classifyCardinality",
        "postgresql.verifyCardinalityClassification",
        "postgresql.recoverCardinalitySource",
        "postgresql.classifyNullability",
        "postgresql.verifyNullabilityClassification",
        "postgresql.recoverNullabilitySource",
        "postgresql.prepareKeyParserRequests",
        "postgresql.prepareKeyCorrelation",
        "postgresql.keyCorrelate",
        "postgresql.classifyKeys",
        "postgresql.verifyKeyClassification",
        "postgresql.recoverKeySource",
        "postgresql.prepareFacetParserRequests",
        "postgresql.prepareRelationshipParserRequests",
        "postgresql.classifyRelationships",
        "postgresql.verifyRelationshipClassification",
        "postgresql.recoverRelationshipSource",
        "postgresql.classifyFacets",
        "postgresql.verifyFacetClassification",
        "postgresql.recoverFacetSource",
        "postgresql.inspect",
        "postgresql.inspectPayload",
        "postgresql.export",
        "postgresql.columns",
        "postgresql.getNode",
        "postgresql.findRelation",
        "postgresql.edit",
        "postgresql.proposeCatalogEdit",
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
        "postgresql.prepareFieldProjection" | "postgresql.prepareRecordProjection" => {
            required(request, "author")?;
            required(request, "request")?;
        }
        "postgresql.completeFieldProjection" | "postgresql.completeRecordProjection" => {
            required(request, "prepared")?;
            required(request, "target")?;
        }
        "postgresql.prepareFieldRecovery" | "postgresql.prepareRecordRecovery" => {
            required(request, "receipt")?;
        }
        "postgresql.prepareCardinalityProjection" => {
            required(request, "author")?;
            required(request, "request")?;
        }
        "postgresql.completeCardinalityProjection" => {
            required(request, "prepared")?;
            required(request, "target")?;
        }
        "postgresql.prepareCardinalityRecovery" => {
            required(request, "receipt")?;
        }
        "postgresql.recoverCardinalityProjection" => {
            required(request, "receipt")?;
            required(request, "fresh")?;
            string(request, "nativeText")?;
        }
        "postgresql.prepareNullabilityProjection" => {
            required(request, "author")?;
            required(request, "request")?;
        }
        "postgresql.completeNullabilityProjection" => {
            required(request, "prepared")?;
            required(request, "target")?;
        }
        "postgresql.prepareNullabilityRecovery" => {
            required(request, "receipt")?;
        }
        "postgresql.recoverNullabilityProjection" => {
            required(request, "receipt")?;
            required(request, "fresh")?;
            string(request, "nativeText")?;
        }
        "postgresql.projectFieldWithNativeBackend"
        | "postgresql.projectRecordWithNativeBackend"
        | "postgresql.projectCardinalityWithNativeBackend" => {
            required(request, "author")?;
            required(request, "request")?;
        }
        "postgresql.projectNullabilityWithNativeBackend" => {
            required(request, "author")?;
            required(request, "request")?;
        }
        "postgresql.recoverFieldWithNativeBackend"
        | "postgresql.recoverRecordWithNativeBackend"
        | "postgresql.recoverCardinalityWithNativeBackend" => {
            required(request, "receipt")?;
            string(request, "nativeText")?;
        }
        "postgresql.recoverNullabilityWithNativeBackend" => {
            required(request, "receipt")?;
            string(request, "nativeText")?;
        }
        "postgresql.recoverFieldProjection" | "postgresql.recoverRecordProjection" => {
            required(request, "receipt")?;
            required(request, "fresh")?;
            string(request, "nativeText")?;
        }
        "postgresql.classifyField"
        | "postgresql.classifyRecord"
        | "postgresql.classifyCardinality"
        | "postgresql.classifyNullability"
        | "postgresql.classifyComposite" => {
            required(request, "source")?;
            required(request, "request")?;
        }
        "postgresql.classifyDdlRecord" => {
            required(request, "source")?;
            required(request, "request")?;
        }
        "postgresql.verifyDdlKinds" | "postgresql.recoverDdlKinds" => {
            required(request, "receipt")?;
            required(request, "current")?;
        }
        "postgresql.verifyCompositeClassification"
        | "postgresql.recoverCompositeCapture"
        | "postgresql.verifyFieldClassification"
        | "postgresql.recoverFieldCapture"
        | "postgresql.verifyRecordClassification"
        | "postgresql.recoverRecordCapture"
        | "postgresql.verifyCardinalityClassification"
        | "postgresql.recoverCardinalitySource"
        | "postgresql.verifyNullabilityClassification"
        | "postgresql.recoverNullabilitySource" => {
            required(request, "receipt")?;
            required(request, "current")?;
        }
        "postgresql.prepareKeyParserRequests"
        | "postgresql.prepareKeyCorrelation"
        | "postgresql.classifyKeys"
        | "postgresql.keyCorrelate" => {
            required(request, "source")?;
            required(request, "request")?;
        }
        "postgresql.prepareFacetParserRequests" => {
            required(request, "request")?;
        }
        "postgresql.prepareRelationshipParserRequests" => {
            required(request, "source")?;
            required(request, "request")?;
        }
        "postgresql.classifyRelationships" => {
            required(request, "source")?;
            required(request, "request")?;
        }
        "postgresql.classifyFacets" => {
            required(request, "source")?;
            required(request, "request")?;
        }
        "postgresql.verifyKeyClassification"
        | "postgresql.recoverKeySource"
        | "postgresql.verifyFacetClassification"
        | "postgresql.recoverFacetSource"
        | "postgresql.verifyRelationshipClassification"
        | "postgresql.recoverRelationshipSource" => {
            required(request, "receipt")?;
            required(request, "current")?;
        }
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
        "postgresql.getDdlDeclarations" => {
            required(request, "document")?;
        }
        "postgresql.prepareDdlParserRequest" => {
            required(request, "source")?;
            required(request, "request")?;
        }
        "postgresql.inspect"
        | "postgresql.export"
        | "postgresql.columns"
        | "postgresql.reconstruction" => {
            required(request, "document")?;
        }
        "postgresql.inspectPayload" => {
            required(request, "payload")?;
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
        "postgresql.edit" | "postgresql.proposeCatalogEdit" => {
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
    if !umf_core::parser_backend_protocol::backend_identity_is_admitted(backend.identity()) {
        return Err(EngineError::new(
            "POSTGRESQL_BACKEND",
            Utf16::default(),
            "Pinned PostgreSQL parser backend required",
        ));
    }
    // An explicit parser response remains an explicit caller capability. The
    // native backend is selected only when the caller supplied none.
    if field(request, "parser").is_some()
        && matches!(
            op,
            "postgresql.classifyDdlRecord"
                | "postgresql.verifyDdlKinds"
                | "postgresql.recoverDdlKinds"
                | "postgresql.classifyKeys"
                | "postgresql.keyCorrelate"
                | "postgresql.verifyKeyClassification"
                | "postgresql.recoverKeySource"
                | "postgresql.classifyFacets"
                | "postgresql.verifyFacetClassification"
                | "postgresql.recoverFacetSource"
                | "postgresql.classifyRelationships"
                | "postgresql.verifyRelationshipClassification"
                | "postgresql.recoverRelationshipSource"
        )
    {
        return execute_validated(request, op, ctx);
    }
    match op {
        "postgresql.projectFieldWithNativeBackend" => {
            umf_core::postgresql_authored_projection::project_field_with_backend(
                required(request, "author")?,
                required(request, "request")?,
                backend,
                ctx,
            )
        }
        "postgresql.projectRecordWithNativeBackend" => {
            umf_core::postgresql_authored_projection::project_record_with_backend(
                required(request, "author")?,
                required(request, "request")?,
                backend,
                ctx,
            )
        }
        "postgresql.projectCardinalityWithNativeBackend" => {
            umf_core::postgresql_authored_projection::project_cardinality_with_backend(
                required(request, "author")?,
                required(request, "request")?,
                backend,
                ctx,
            )
        }
        "postgresql.projectNullabilityWithNativeBackend" => {
            umf_core::postgresql_authored_projection::project_nullability_with_backend(
                required(request, "author")?,
                required(request, "request")?,
                backend,
                ctx,
            )
        }
        "postgresql.recoverFieldWithNativeBackend" => {
            umf_core::postgresql_authored_projection::recover_field_with_backend(
                required(request, "receipt")?,
                required(request, "nativeText")?,
                backend,
                ctx,
            )
        }
        "postgresql.recoverRecordWithNativeBackend" => {
            umf_core::postgresql_authored_projection::recover_record_with_backend(
                required(request, "receipt")?,
                required(request, "nativeText")?,
                backend,
                ctx,
            )
        }
        "postgresql.recoverCardinalityWithNativeBackend" => {
            umf_core::postgresql_authored_projection::recover_cardinality_with_backend(
                required(request, "receipt")?,
                required(request, "nativeText")?,
                backend,
                ctx,
            )
        }
        "postgresql.recoverNullabilityWithNativeBackend" => {
            umf_core::postgresql_authored_projection::recover_nullability_with_backend(
                required(request, "receipt")?,
                required(request, "nativeText")?,
                backend,
                ctx,
            )
        }
        "postgresql.classifyDdlRecord" => {
            let prepared = umf_core::postgresql_ddl_classification::prepare_parser_request(
                required(request, "source")?,
                required(request, "request")?,
                ctx,
            )?;
            let sql = string(&prepared, "sql")?;
            let ast = backend.parse(sql, ctx)?;
            umf_core::postgresql_ddl_classification::classify(
                required(request, "source")?,
                required(request, "request")?,
                &ast,
                ctx,
            )
        }
        "postgresql.verifyDdlKinds" | "postgresql.recoverDdlKinds" => {
            let receipt = required(request, "receipt")?;
            let prepared = umf_core::postgresql_ddl_classification::prepare_parser_request(
                required(receipt, "source")?,
                required(receipt, "request")?,
                ctx,
            )?;
            let ast = backend.parse(string(&prepared, "sql")?, ctx)?;
            if op == "postgresql.verifyDdlKinds" {
                umf_core::postgresql_ddl_classification::verify(
                    receipt,
                    required(request, "current")?,
                    &ast,
                    ctx,
                )
            } else {
                Ok(Value::String(
                    umf_core::postgresql_ddl_classification::recover(
                        receipt,
                        required(request, "current")?,
                        &ast,
                        ctx,
                    )?,
                ))
            }
        }
        "postgresql.classifyKeys" => {
            let source = required(request, "source")?;
            let req = required(request, "request")?;
            let prepared = umf_core::postgresql_keys_classification::prepare_key_parser_requests(
                source, req, ctx,
            )?;
            let parser = parser_responses_from_prepared(&prepared, backend, ctx)?;
            umf_core::postgresql_keys_classification::classify_keys(source, req, &parser, ctx)
        }
        "postgresql.keyCorrelate" => {
            let source = required(request, "source")?;
            let req = required(request, "request")?;
            let prepared = umf_core::postgresql_keys_classification::prepare_catalog_correlation(
                source, req, ctx,
            )?;
            let parser = parser_responses_from_prepared(&prepared, backend, ctx)?;
            umf_core::postgresql_keys_classification::correlate_catalog(source, req, &parser, ctx)
        }
        "postgresql.verifyKeyClassification" | "postgresql.recoverKeySource" => {
            let receipt = required(request, "receipt")?;
            let prepared = umf_core::postgresql_keys_classification::prepare_key_parser_requests(
                required(receipt, "source")?,
                required(receipt, "request")?,
                ctx,
            )?;
            let parser = parser_responses_from_prepared(&prepared, backend, ctx)?;
            if op == "postgresql.verifyKeyClassification" {
                umf_core::postgresql_keys_classification::verify_keys(
                    receipt,
                    required(request, "current")?,
                    &parser,
                    ctx,
                )
            } else {
                umf_core::postgresql_keys_classification::recover_keys(
                    receipt,
                    required(request, "current")?,
                    &parser,
                    ctx,
                )
            }
        }
        "postgresql.classifyFacets" => {
            let source = required(request, "source")?;
            let req = required(request, "request")?;
            let prepared =
                umf_core::postgresql_facets_classification::prepare_parser_requests(req, ctx)?;
            let parser = parser_responses_from_prepared(&prepared, backend, ctx)?;
            umf_core::postgresql_facets_classification::classify(source, req, &parser, ctx)
        }
        "postgresql.verifyFacetClassification" | "postgresql.recoverFacetSource" => {
            let receipt = required(request, "receipt")?;
            let prepared = umf_core::postgresql_facets_classification::prepare_parser_requests(
                required(receipt, "request")?,
                ctx,
            )?;
            let parser = parser_responses_from_prepared(&prepared, backend, ctx)?;
            if op == "postgresql.verifyFacetClassification" {
                umf_core::postgresql_facets_classification::verify(
                    receipt,
                    required(request, "current")?,
                    &parser,
                    ctx,
                )
            } else {
                umf_core::postgresql_facets_classification::recover(
                    receipt,
                    required(request, "current")?,
                    &parser,
                    ctx,
                )
            }
        }
        "postgresql.classifyRelationships" => {
            let source = required(request, "source")?;
            let req = required(request, "request")?;
            let prepared =
                umf_core::postgresql_relationship_classification::prepare_parser_requests(
                    source, req, ctx,
                )?;
            let parser = parser_responses_from_prepared(&prepared, backend, ctx)?;
            umf_core::postgresql_relationship_classification::classify(source, req, &parser, ctx)
        }
        "postgresql.verifyRelationshipClassification" | "postgresql.recoverRelationshipSource" => {
            let receipt = required(request, "receipt")?;
            let prepared =
                umf_core::postgresql_relationship_classification::prepare_parser_requests(
                    required(receipt, "source")?,
                    required(receipt, "request")?,
                    ctx,
                )?;
            let parser = parser_responses_from_prepared(&prepared, backend, ctx)?;
            if op == "postgresql.verifyRelationshipClassification" {
                umf_core::postgresql_relationship_classification::verify(
                    receipt,
                    required(request, "current")?,
                    &parser,
                    ctx,
                )
            } else {
                umf_core::postgresql_relationship_classification::recover(
                    receipt,
                    required(request, "current")?,
                    &parser,
                    ctx,
                )
            }
        }
        "postgresql.facetCorrelate" => pg::correlate_facet_catalog_with_backend(
            required(request, "document")?,
            string(request, "source")?,
            string(request, "datumFormat")?,
            backend,
            ctx,
        ),
        _ => execute_validated(request, op, ctx),
    }
}

fn parser_responses_from_prepared(
    prepared: &Value,
    backend: &dyn umf_core::parser_backend_protocol::PostgresqlParserBackend,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let Some(Value::Array(queries)) = field(prepared, "queries") else {
        return Err(EngineError::new(
            "POSTGRESQL_BACKEND_RESPONSE",
            Utf16::default(),
            "Rust parser request list is malformed",
        ));
    };
    let mut responses = Vec::with_capacity(queries.len());
    for query in queries {
        let id = match field(query, "id") {
            Some(Value::String(id)) => id.clone(),
            _ => {
                return Err(EngineError::new(
                    "POSTGRESQL_BACKEND_RESPONSE",
                    Utf16::default(),
                    "Rust parser request lacks an id",
                ))
            }
        };
        let sql = match field(query, "sql") {
            Some(Value::String(sql)) => sql.clone(),
            _ => {
                return Err(EngineError::new(
                    "POSTGRESQL_BACKEND_RESPONSE",
                    Utf16::default(),
                    "Rust parser request lacks SQL",
                ))
            }
        };
        ctx.charge_work(id.len().saturating_add(sql.len()), Utf16::default())?;
        let ast = backend.parse(&sql, ctx)?;
        responses.push(Value::Object(vec![
            (Utf16::from("id"), Value::String(id)),
            (Utf16::from("sql"), Value::String(sql)),
            (Utf16::from("ast"), ast),
        ]));
    }
    Ok(Value::Object(vec![(
        Utf16::from("responses"),
        Value::Array(responses),
    )]))
}

fn execute(request: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let op = validate(request, ctx)?;
    execute_validated(request, op, ctx)
}
fn execute_validated(
    request: &Value,
    op: &str,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    match op {
        "postgresql.prepareFieldProjection" => {
            umf_core::postgresql_authored_projection::prepare_field_projection(
                required(request, "author")?,
                required(request, "request")?,
                ctx,
            )
        }
        "postgresql.completeFieldProjection" => {
            umf_core::postgresql_authored_projection::complete_field_projection(
                required(request, "prepared")?,
                required(request, "target")?,
                ctx,
            )
        }
        "postgresql.prepareFieldRecovery" => {
            umf_core::postgresql_authored_projection::prepare_field_recovery(
                required(request, "receipt")?,
                ctx,
            )
        }
        "postgresql.recoverFieldProjection" => {
            umf_core::postgresql_authored_projection::recover_field_projection(
                required(request, "receipt")?,
                required(request, "fresh")?,
                required(request, "nativeText")?,
                ctx,
            )
        }
        "postgresql.prepareRecordProjection" => {
            umf_core::postgresql_authored_projection::prepare_record_projection(
                required(request, "author")?,
                required(request, "request")?,
                ctx,
            )
        }
        "postgresql.completeRecordProjection" => {
            umf_core::postgresql_authored_projection::complete_record_projection(
                required(request, "prepared")?,
                required(request, "target")?,
                ctx,
            )
        }
        "postgresql.prepareRecordRecovery" => {
            umf_core::postgresql_authored_projection::prepare_record_recovery(
                required(request, "receipt")?,
                ctx,
            )
        }
        "postgresql.recoverRecordProjection" => {
            umf_core::postgresql_authored_projection::recover_record_projection(
                required(request, "receipt")?,
                required(request, "fresh")?,
                required(request, "nativeText")?,
                ctx,
            )
        }
        "postgresql.prepareCardinalityProjection" => {
            umf_core::postgresql_authored_projection::prepare_cardinality_projection(
                required(request, "author")?,
                required(request, "request")?,
                ctx,
            )
        }
        "postgresql.completeCardinalityProjection" => {
            umf_core::postgresql_authored_projection::complete_cardinality_projection(
                required(request, "prepared")?,
                required(request, "target")?,
                ctx,
            )
        }
        "postgresql.prepareCardinalityRecovery" => {
            umf_core::postgresql_authored_projection::prepare_cardinality_recovery(
                required(request, "receipt")?,
                ctx,
            )
        }
        "postgresql.recoverCardinalityProjection" => {
            umf_core::postgresql_authored_projection::recover_cardinality_projection(
                required(request, "receipt")?,
                required(request, "fresh")?,
                required(request, "nativeText")?,
                ctx,
            )
        }
        "postgresql.prepareNullabilityProjection" => {
            umf_core::postgresql_authored_projection::prepare_nullability_projection(
                required(request, "author")?,
                required(request, "request")?,
                ctx,
            )
        }
        "postgresql.completeNullabilityProjection" => {
            umf_core::postgresql_authored_projection::complete_nullability_projection(
                required(request, "prepared")?,
                required(request, "target")?,
                ctx,
            )
        }
        "postgresql.prepareNullabilityRecovery" => {
            umf_core::postgresql_authored_projection::prepare_nullability_recovery(
                required(request, "receipt")?,
                ctx,
            )
        }
        "postgresql.recoverNullabilityProjection" => {
            umf_core::postgresql_authored_projection::recover_nullability_projection(
                required(request, "receipt")?,
                required(request, "fresh")?,
                required(request, "nativeText")?,
                ctx,
            )
        }
        "postgresql.projectFieldWithNativeBackend"
        | "postgresql.projectRecordWithNativeBackend"
        | "postgresql.projectCardinalityWithNativeBackend"
        | "postgresql.recoverFieldWithNativeBackend"
        | "postgresql.recoverRecordWithNativeBackend"
        | "postgresql.recoverCardinalityWithNativeBackend" => Err(EngineError::new(
            "POSTGRESQL_BACKEND",
            Utf16::default(),
            "This operation requires an admitted PostgreSQL parser backend",
        )),
        "postgresql.projectNullabilityWithNativeBackend"
        | "postgresql.recoverNullabilityWithNativeBackend" => Err(EngineError::new(
            "POSTGRESQL_BACKEND",
            Utf16::default(),
            "This operation requires an admitted PostgreSQL parser backend",
        )),
        "postgresql.classifyComposite" => umf_core::postgresql_composite_classification::classify(
            required(request, "source")?,
            required(request, "request")?,
            ctx,
        ),
        "postgresql.getDdlDeclarations" => umf_core::postgresql_ddl_classification::declarations(
            required(request, "document")?,
            ctx,
        ),
        "postgresql.prepareDdlParserRequest" => {
            umf_core::postgresql_ddl_classification::prepare_parser_request(
                required(request, "source")?,
                required(request, "request")?,
                ctx,
            )
        }
        "postgresql.classifyDdlRecord" => umf_core::postgresql_ddl_classification::classify(
            required(request, "source")?,
            required(request, "request")?,
            required(request, "parser")?,
            ctx,
        ),
        "postgresql.verifyDdlKinds" => umf_core::postgresql_ddl_classification::verify(
            required(request, "receipt")?,
            required(request, "current")?,
            required(request, "parser")?,
            ctx,
        ),
        "postgresql.recoverDdlKinds" => Ok(Value::String(
            umf_core::postgresql_ddl_classification::recover(
                required(request, "receipt")?,
                required(request, "current")?,
                required(request, "parser")?,
                ctx,
            )?,
        )),
        "postgresql.verifyCompositeClassification" => {
            umf_core::postgresql_composite_classification::verify(
                required(request, "receipt")?,
                required(request, "current")?,
                ctx,
            )
        }
        "postgresql.recoverCompositeCapture" => Ok(Value::String(
            umf_core::postgresql_composite_classification::recover(
                required(request, "receipt")?,
                required(request, "current")?,
                ctx,
            )?,
        )),
        "postgresql.classifyField" => umf_core::postgresql_classification::classify_field(
            required(request, "source")?,
            required(request, "request")?,
            ctx,
        ),
        "postgresql.verifyFieldClassification" => {
            umf_core::postgresql_classification::verify_field(
                required(request, "receipt")?,
                required(request, "current")?,
                ctx,
            )
        }
        "postgresql.recoverFieldCapture" => Ok(Value::String(
            umf_core::postgresql_classification::recover_field(
                required(request, "receipt")?,
                required(request, "current")?,
                ctx,
            )?,
        )),
        "postgresql.classifyRecord" => umf_core::postgresql_classification::classify_record(
            required(request, "source")?,
            required(request, "request")?,
            ctx,
        ),
        "postgresql.verifyRecordClassification" => {
            umf_core::postgresql_classification::verify_record(
                required(request, "receipt")?,
                required(request, "current")?,
                ctx,
            )
        }
        "postgresql.recoverRecordCapture" => Ok(Value::String(
            umf_core::postgresql_classification::recover_record(
                required(request, "receipt")?,
                required(request, "current")?,
                ctx,
            )?,
        )),
        "postgresql.classifyCardinality" => {
            umf_core::postgresql_classification::classify_cardinality(
                required(request, "source")?,
                required(request, "request")?,
                ctx,
            )
        }
        "postgresql.verifyCardinalityClassification" => {
            umf_core::postgresql_classification::verify_cardinality(
                required(request, "receipt")?,
                required(request, "current")?,
                ctx,
            )
        }
        "postgresql.recoverCardinalitySource" => {
            umf_core::postgresql_classification::recover_cardinality(
                required(request, "receipt")?,
                required(request, "current")?,
                ctx,
            )
        }
        "postgresql.classifyNullability" => {
            umf_core::postgresql_classification::classify_nullability(
                required(request, "source")?,
                required(request, "request")?,
                ctx,
            )
        }
        "postgresql.verifyNullabilityClassification" => {
            umf_core::postgresql_classification::verify_nullability(
                required(request, "receipt")?,
                required(request, "current")?,
                ctx,
            )
        }
        "postgresql.recoverNullabilitySource" => Ok(Value::String(
            umf_core::postgresql_classification::recover_nullability(
                required(request, "receipt")?,
                required(request, "current")?,
                ctx,
            )?,
        )),
        "postgresql.prepareKeyParserRequests" => {
            umf_core::postgresql_keys_classification::prepare_key_parser_requests(
                required(request, "source")?,
                required(request, "request")?,
                ctx,
            )
        }
        "postgresql.prepareKeyCorrelation" => {
            umf_core::postgresql_keys_classification::prepare_catalog_correlation(
                required(request, "source")?,
                required(request, "request")?,
                ctx,
            )
        }
        "postgresql.keyCorrelate" => umf_core::postgresql_keys_classification::correlate_catalog(
            required(request, "source")?,
            required(request, "request")?,
            required(request, "parser")?,
            ctx,
        ),
        "postgresql.prepareFacetParserRequests" => {
            umf_core::postgresql_facets_classification::prepare_parser_requests(
                required(request, "request")?,
                ctx,
            )
        }
        "postgresql.prepareRelationshipParserRequests" => {
            umf_core::postgresql_relationship_classification::prepare_parser_requests(
                required(request, "source")?,
                required(request, "request")?,
                ctx,
            )
        }
        "postgresql.classifyRelationships" => {
            umf_core::postgresql_relationship_classification::classify(
                required(request, "source")?,
                required(request, "request")?,
                required(request, "parser")?,
                ctx,
            )
        }
        "postgresql.verifyRelationshipClassification" => {
            umf_core::postgresql_relationship_classification::verify(
                required(request, "receipt")?,
                required(request, "current")?,
                required(request, "parser")?,
                ctx,
            )
        }
        "postgresql.recoverRelationshipSource" => {
            umf_core::postgresql_relationship_classification::recover(
                required(request, "receipt")?,
                required(request, "current")?,
                required(request, "parser")?,
                ctx,
            )
        }
        "postgresql.classifyFacets" => umf_core::postgresql_facets_classification::classify(
            required(request, "source")?,
            required(request, "request")?,
            required(request, "parser")?,
            ctx,
        ),
        "postgresql.verifyFacetClassification" => {
            umf_core::postgresql_facets_classification::verify(
                required(request, "receipt")?,
                required(request, "current")?,
                required(request, "parser")?,
                ctx,
            )
        }
        "postgresql.recoverFacetSource" => umf_core::postgresql_facets_classification::recover(
            required(request, "receipt")?,
            required(request, "current")?,
            required(request, "parser")?,
            ctx,
        ),
        "postgresql.classifyKeys" => umf_core::postgresql_keys_classification::classify_keys(
            required(request, "source")?,
            required(request, "request")?,
            required(request, "parser")?,
            ctx,
        ),
        "postgresql.verifyKeyClassification" => {
            umf_core::postgresql_keys_classification::verify_keys(
                required(request, "receipt")?,
                required(request, "current")?,
                required(request, "parser")?,
                ctx,
            )
        }
        "postgresql.recoverKeySource" => umf_core::postgresql_keys_classification::recover_keys(
            required(request, "receipt")?,
            required(request, "current")?,
            required(request, "parser")?,
            ctx,
        ),
        "postgresql.import" => {
            let capture = pg::PostgresqlCatalogCapture::import(string(request, "source")?, ctx)?;
            pg::document_value(string(request, "id")?, &capture, ctx)
        }
        "postgresql.inspect" => pg::inspect_document(required(request, "document")?, ctx),
        "postgresql.inspectPayload" => pg::inspect_payload(required(request, "payload")?, ctx),
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
        "postgresql.proposeCatalogEdit" => {
            let document = pg::propose_edit(
                required(request, "document")?,
                string(request, "path")?,
                string(request, "text")?,
                ctx,
            )?;
            let validation = pg::inspect_document(&document, ctx)?;
            Ok(Value::Object(vec![
                (Utf16::from("document"), document),
                (Utf16::from("validation"), validation),
            ]))
        }
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
