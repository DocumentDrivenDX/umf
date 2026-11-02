// SPDX-License-Identifier: MIT OR Apache-2.0
//! Closed tagged-wire profiles for native SHACL and OWL adapters.
use std::collections::BTreeSet;

use crate::{decode, encode, field, result_envelope};
use umf_core::{rdf::RdfRuntime, shacl_owl_native as native, Context, EngineError, Utf16, Value};

pub const SHACL_PROFILE: &str = "umf.shacl-wire/1";
pub const OWL_PROFILE: &str = "umf.owl-wire/1";
pub const SHACL_OPERATIONS: &[&str] = &[
    "shacl.import",
    "shacl.inspect",
    "shacl.inspectPayload",
    "shacl.export",
    "shacl.getQuads",
    "shacl.editQuad",
    "shacl.getPropertyPath",
    "shacl.evaluatePropertyPath",
    "shacl.getTargetNodes",
    "shacl.getShapeMetadata",
    "shacl.validate",
];
pub const OWL_OPERATIONS: &[&str] = &[
    "owl.import",
    "owl.inspect",
    "owl.inspectPayload",
    "owl.export",
    "owl.getQuads",
    "owl.editQuad",
    "owl.getOntologyHeaders",
    "owl.getExpressionView",
    "owl.getListAxioms",
    "owl.getSpecialAxioms",
    "owl.getAxiomAnnotations",
    "owl.getDeclarations",
];

fn request(message: &str) -> EngineError {
    EngineError::new("REQUEST", Utf16::default(), message)
}
fn is_ascii(value: &Utf16, expected: &str) -> bool {
    value.units().len() == expected.len()
        && value.units().iter().copied().eq(expected.encode_utf16())
}
fn text<'a>(value: &'a Value, name: &str) -> Result<&'a Utf16, EngineError> {
    match field(value, name) {
        Some(Value::String(s)) => Ok(s),
        _ => Err(request(&format!("{name} must be a string"))),
    }
}
fn required<'a>(value: &'a Value, name: &str) -> Result<&'a Value, EngineError> {
    field(value, name).ok_or_else(|| request(&format!("{name} is required")))
}
fn index(value: &Value, name: &str) -> Result<usize, EngineError> {
    const MAX_SAFE_INTEGER: f64 = 9_007_199_254_740_991.0;
    match field(value, name) {
        Some(Value::Number(value))
            if value.is_finite()
                && value.fract() == 0.0
                && *value >= 0.0
                && *value <= MAX_SAFE_INTEGER
                && *value <= usize::MAX as f64 =>
        {
            Ok(*value as usize)
        }
        _ => Err(request(&format!("{name} must be a nonnegative integer"))),
    }
}
fn operation_fields(op: &str) -> Option<&'static [&'static str]> {
    Some(match op {
        "shacl.import" | "owl.import" => {
            &["profile", "op", "source", "id", "baseIRI", "blankNodeScope"]
        }
        "shacl.inspect" | "owl.inspect" | "shacl.export" | "owl.export" | "shacl.getQuads"
        | "owl.getQuads" => &["profile", "op", "document"],
        "shacl.inspectPayload" | "owl.inspectPayload" => &["profile", "op", "payload"],
        "shacl.editQuad" | "owl.editQuad" => &["profile", "op", "document", "index", "replacement"],
        "shacl.getPropertyPath" | "shacl.getShapeMetadata" => {
            &["profile", "op", "document", "shape"]
        }
        "shacl.evaluatePropertyPath" => &["profile", "op", "shapes", "shape", "data", "focus"],
        "shacl.getTargetNodes" => &["profile", "op", "shapes", "shape", "data"],
        "shacl.validate" => &["profile", "op", "shapes", "data", "id", "blankNodePolicy"],
        "owl.getOntologyHeaders"
        | "owl.getListAxioms"
        | "owl.getSpecialAxioms"
        | "owl.getDeclarations" => &["profile", "op", "document"],
        "owl.getExpressionView" => &["profile", "op", "document", "node"],
        "owl.getAxiomAnnotations" => &["profile", "op", "document", "quadIndex"],
        _ => return None,
    })
}
fn validate_members(
    value: &Value,
    allowed: &[&str],
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let Value::Object(fields) = value else {
        return Err(request("request must be an object"));
    };
    let mut seen = BTreeSet::new();
    for (key, _) in fields {
        ctx.charge_work(key.len().saturating_add(1), Utf16::default())?;
        if !allowed.iter().any(|name| key == &Utf16::from(*name)) || !seen.insert(key) {
            return Err(request("request has an unknown or duplicate member"));
        }
    }
    Ok(())
}
fn preflight(op: &str, request_value: &Value) -> Result<(), EngineError> {
    match op {
        "shacl.import" | "owl.import" => {
            text(request_value, "source")?;
            text(request_value, "id")?;
            text(request_value, "baseIRI")?;
            if let Some(scope) = field(request_value, "blankNodeScope") {
                if !matches!(scope, Value::String(_)) {
                    return Err(request("blankNodeScope must be a string"));
                }
            }
        }
        "shacl.inspect"
        | "owl.inspect"
        | "shacl.export"
        | "owl.export"
        | "shacl.getQuads"
        | "owl.getQuads"
        | "owl.getOntologyHeaders"
        | "owl.getListAxioms"
        | "owl.getSpecialAxioms"
        | "owl.getDeclarations" => {
            required(request_value, "document")?;
        }
        "shacl.inspectPayload" | "owl.inspectPayload" => {
            required(request_value, "payload")?;
        }
        "shacl.editQuad" | "owl.editQuad" => {
            required(request_value, "document")?;
            index(request_value, "index")?;
            required(request_value, "replacement")?;
        }
        "shacl.getPropertyPath" | "shacl.getShapeMetadata" => {
            required(request_value, "document")?;
            required(request_value, "shape")?;
        }
        "shacl.evaluatePropertyPath" => {
            required(request_value, "shapes")?;
            required(request_value, "shape")?;
            required(request_value, "data")?;
            required(request_value, "focus")?;
        }
        "shacl.getTargetNodes" => {
            required(request_value, "shapes")?;
            required(request_value, "shape")?;
            required(request_value, "data")?;
        }
        "shacl.validate" => {
            required(request_value, "shapes")?;
            required(request_value, "data")?;
            text(request_value, "id")?;
            let policy = text(request_value, "blankNodePolicy")?;
            if !is_ascii(policy, "disjoint-inputs") && !is_ascii(policy, "shared-scope") {
                return Err(request(
                    "blankNodePolicy must be disjoint-inputs or shared-scope",
                ));
            }
        }
        "owl.getExpressionView" => {
            required(request_value, "document")?;
            required(request_value, "node")?;
        }
        "owl.getAxiomAnnotations" => {
            required(request_value, "document")?;
            index(request_value, "quadIndex")?;
        }
        _ => return Err(request("unknown operation")),
    }
    Ok(())
}
fn execute(
    request_value: &Value,
    ctx: &mut Context<'_>,
    family: Option<&str>,
) -> Result<Value, EngineError> {
    let profile = text(request_value, "profile")?;
    let op = text(request_value, "op")?;
    let operation = SHACL_OPERATIONS
        .iter()
        .chain(OWL_OPERATIONS)
        .copied()
        .find(|name| is_ascii(op, name))
        .ok_or_else(|| request("unknown operation"))?;
    let expected_profile = if operation.starts_with("shacl.") {
        SHACL_PROFILE
    } else {
        OWL_PROFILE
    };
    if !is_ascii(profile, expected_profile) {
        return Err(request("family wire profile is required"));
    }
    if family.is_some_and(|expected| !operation.starts_with(expected)) {
        return Err(request("operation is not available on this CLI route"));
    }
    validate_members(request_value, operation_fields(operation).unwrap(), ctx)?;
    preflight(operation, request_value)?;
    // No RDF runtime/schema resource is touched until the complete closed
    // request and all required operation arguments have passed admission.
    let runtime = RdfRuntime::new(ctx)?;
    let result = match operation {
        "shacl.import" | "owl.import" => {
            let source = text(request_value, "source")?;
            let id = text(request_value, "id")?;
            let base = text(request_value, "baseIRI")?;
            let scope = match field(request_value, "blankNodeScope") {
                Some(Value::String(s)) => Some(s),
                None => None,
                _ => return Err(request("blankNodeScope must be a string")),
            };
            if operation == "shacl.import" {
                native::import_shacl_turtle(&runtime, source.units(), id, base, scope, ctx)?
            } else {
                native::import_owl_turtle(&runtime, source.units(), id, base, scope, ctx)?
            }
        }
        "shacl.inspect" => {
            native::inspect_shacl_document(required(request_value, "document")?, ctx)?
        }
        "owl.inspect" => native::inspect_owl_document(required(request_value, "document")?, ctx)?,
        "shacl.inspectPayload" => {
            native::inspect_shacl_payload(required(request_value, "payload")?, ctx)?
        }
        "owl.inspectPayload" => {
            native::inspect_owl_payload(required(request_value, "payload")?, ctx)?
        }
        "shacl.export" => Value::String(native::export_shacl_turtle(
            &runtime,
            required(request_value, "document")?,
            ctx,
        )?),
        "owl.export" => Value::String(native::export_owl_turtle(
            &runtime,
            required(request_value, "document")?,
            ctx,
        )?),
        "shacl.getQuads" => {
            native::get_shacl_quads(&runtime, required(request_value, "document")?, ctx)?
        }
        "owl.getQuads" => {
            native::get_owl_quads(&runtime, required(request_value, "document")?, ctx)?
        }
        "shacl.editQuad" | "owl.editQuad" => {
            let document = required(request_value, "document")?;
            let replacement = required(request_value, "replacement")?;
            if operation == "shacl.editQuad" {
                native::propose_shacl_quad_edit(
                    &runtime,
                    document,
                    index(request_value, "index")?,
                    replacement,
                    ctx,
                )?
            } else {
                native::propose_owl_quad_edit(
                    &runtime,
                    document,
                    index(request_value, "index")?,
                    replacement,
                    ctx,
                )?
            }
        }
        "shacl.getPropertyPath" => {
            let path = native::get_shacl_property_path(
                &runtime,
                required(request_value, "document")?,
                required(request_value, "shape")?,
                ctx,
            )?;
            native::shacl_path_value(&path, ctx)?
        }
        "shacl.evaluatePropertyPath" => Value::Array(native::evaluate_shacl_property_path(
            &runtime,
            required(request_value, "shapes")?,
            required(request_value, "shape")?,
            required(request_value, "data")?,
            required(request_value, "focus")?,
            ctx,
        )?),
        "shacl.getTargetNodes" => native::get_shacl_target_nodes(
            &runtime,
            required(request_value, "shapes")?,
            required(request_value, "shape")?,
            required(request_value, "data")?,
            ctx,
        )?,
        "shacl.getShapeMetadata" => native::get_shacl_shape_metadata(
            &runtime,
            required(request_value, "document")?,
            required(request_value, "shape")?,
            ctx,
        )?,
        "shacl.validate" => native::propose_shacl_engine_validation_sync(
            &runtime,
            required(request_value, "shapes")?,
            required(request_value, "data")?,
            text(request_value, "id")?,
            text(request_value, "blankNodePolicy")?,
            ctx,
        )?,
        "owl.getOntologyHeaders" => {
            native::get_owl_ontology_headers(&runtime, required(request_value, "document")?, ctx)?
        }
        "owl.getExpressionView" => native::get_owl_expression_view(
            required(request_value, "document")?,
            required(request_value, "node")?,
            &runtime,
            ctx,
        )?,
        "owl.getListAxioms" => {
            native::get_owl_list_axioms(&runtime, required(request_value, "document")?, ctx)?
        }
        "owl.getSpecialAxioms" => {
            native::get_owl_special_axioms(&runtime, required(request_value, "document")?, ctx)?
        }
        "owl.getAxiomAnnotations" => native::get_owl_axiom_annotations(
            &runtime,
            required(request_value, "document")?,
            index(request_value, "quadIndex")?,
            ctx,
        )?,
        "owl.getDeclarations" => {
            native::get_owl_declarations(&runtime, required(request_value, "document")?, ctx)?
        }
        _ => return Err(request("unknown operation")),
    };
    Ok(result)
}
pub fn execute_wire(wire: &str, family: Option<&str>) -> String {
    let mut no_control = |_: usize| Ok(());
    execute_wire_with_control(wire, family, &mut no_control)
}
pub fn execute_shacl_wire_with_control(
    wire: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    execute_wire_with_control(wire, Some("shacl"), control)
}
pub fn execute_owl_wire_with_control(
    wire: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    execute_wire_with_control(wire, Some("owl"), control)
}
pub fn execute_wire_with_control(
    wire: &str,
    family: Option<&str>,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    let result = (|| {
        let mut ctx = Context::ordinary().with_host_control(control);
        let req = ctx.with_tagged_transport_limit(|ctx| decode(wire, ctx))?;
        let value = execute(&req, &mut ctx, family)?;
        encode(&value, &mut ctx)
    })();
    result_envelope(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use umf_core::rdf;

    fn object(items: impl IntoIterator<Item = (&'static str, Value)>) -> Value {
        Value::Object(
            items
                .into_iter()
                .map(|(key, value)| (Utf16::from(key), value))
                .collect(),
        )
    }
    fn request(
        profile: &str,
        op: &str,
        fields: impl IntoIterator<Item = (&'static str, Value)>,
    ) -> Value {
        let mut members = vec![
            (Utf16::from("profile"), Value::string_utf8(profile)),
            (Utf16::from("op"), Value::string_utf8(op)),
        ];
        members.extend(
            fields
                .into_iter()
                .map(|(key, value)| (Utf16::from(key), value)),
        );
        Value::Object(members)
    }
    fn run(value: Value, family: Option<&str>) -> Result<Value, String> {
        let wire = encode(&value, &mut Context::ordinary()).map_err(|error| error.to_string())?;
        let response = execute_wire(&wire, family);
        let envelope: serde_json::Value =
            serde_json::from_str(&response).map_err(|error| error.to_string())?;
        if envelope["status"] != "ok" {
            return Err(envelope.to_string());
        }
        decode(
            envelope["wire"].as_str().ok_or("wire response missing")?,
            &mut Context::ordinary(),
        )
        .map_err(|error| error.to_string())
    }

    #[test]
    fn shacl_wire_imports_views_and_reports_real_count_violation() {
        let shapes = run(request(SHACL_PROFILE, "shacl.import", [
            ("source", Value::string_utf8("<https://ex.test/Shape> a <http://www.w3.org/ns/shacl#NodeShape> ; <http://www.w3.org/ns/shacl#targetNode> <https://ex.test/alice> ; <http://www.w3.org/ns/shacl#property> _:p .\n_:p <http://www.w3.org/ns/shacl#path> <https://ex.test/name> ; <http://www.w3.org/ns/shacl#minCount> \"1\"^^<http://www.w3.org/2001/XMLSchema#integer> .\n")),
            ("id", Value::string_utf8("shacl-wire-shapes")), ("baseIRI", Value::string_utf8("https://ex.test/")),
        ]), Some("shacl")).unwrap();
        let quads = run(
            request(
                SHACL_PROFILE,
                "shacl.getQuads",
                [("document", shapes.clone())],
            ),
            Some("shacl"),
        )
        .unwrap();
        assert!(matches!(quads, Value::Array(ref rows) if !rows.is_empty()));
        let mut ctx = Context::ordinary();
        let rdf_runtime = RdfRuntime::new(&mut ctx).unwrap();
        let data = rdf::import_rdf_turtle(
            &rdf_runtime,
            &[],
            &Utf16::from("shacl-wire-data"),
            &Utf16::from("https://ex.test/"),
            None,
            &mut ctx,
        )
        .unwrap();
        let report = run(
            request(
                SHACL_PROFILE,
                "shacl.validate",
                [
                    ("shapes", shapes),
                    ("data", data),
                    ("id", Value::string_utf8("shacl-wire-report")),
                    ("blankNodePolicy", Value::string_utf8("disjoint-inputs")),
                ],
            ),
            Some("shacl"),
        )
        .unwrap();
        assert_eq!(
            field(&report, "status"),
            Some(&Value::string_utf8("evaluated"))
        );
        assert_eq!(field(&report, "engineConforms"), Some(&Value::Bool(false)));
        assert!(run(
            request(
                SHACL_PROFILE,
                "shacl.export",
                [("document", Value::Null), ("future", Value::Bool(true)),]
            ),
            Some("shacl")
        )
        .is_err());
    }

    #[test]
    fn owl_wire_imports_inspects_and_rejects_unknown_request_members() {
        let document = run(
            request(
                OWL_PROFILE,
                "owl.import",
                [
                    (
                        "source",
                        Value::string_utf8(
                            "<https://ex.test/s> <https://ex.test/p> <https://ex.test/o> .\n",
                        ),
                    ),
                    ("id", Value::string_utf8("owl-wire")),
                    ("baseIRI", Value::string_utf8("https://ex.test/")),
                ],
            ),
            Some("owl"),
        )
        .unwrap();
        let quads = run(
            request(
                OWL_PROFILE,
                "owl.getQuads",
                [("document", document.clone())],
            ),
            Some("owl"),
        )
        .unwrap();
        assert!(matches!(quads, Value::Array(ref rows) if rows.len() == 1));
        let inspection = run(
            request(OWL_PROFILE, "owl.inspect", [("document", document)]),
            Some("owl"),
        )
        .unwrap();
        assert_eq!(field(&inspection, "complete"), Some(&Value::Bool(false)));
        assert!(run(
            request(
                OWL_PROFILE,
                "owl.inspect",
                [("document", Value::Null), ("unknown", Value::Bool(true)),]
            ),
            Some("owl")
        )
        .is_err());
    }
}
