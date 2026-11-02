// SPDX-License-Identifier: MIT OR Apache-2.0
//! Opt-in tagged-wire dispatcher for the current RDF dataset kernels.
//! Registry objects are intentionally not projected: they carry typed Rust
//! capability state that does not yet have a shared registry wire DTO.

use std::sync::{Arc, OnceLock};

use umf_core::{
    error::Validation,
    rdf::{self, RdfRuntime},
    Context, EngineError, Utf16, Value,
};

use crate::{decode, encode, field, result_envelope, text_field};

pub const PROFILE: &str = "umf-r9-rdf-preservation/0.1.0";

fn request_error(message: &str) -> EngineError {
    EngineError::new("REQUEST", Utf16::default(), message)
}

fn rdf_error(code: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}

fn member<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    let Value::Object(fields) = value else {
        return None;
    };
    fields
        .iter()
        .find(|(key, _)| key == &Utf16::from(name))
        .map(|(_, value)| value)
}

fn object(fields: impl IntoIterator<Item = (&'static str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(key, value)| (Utf16::from(key), value))
            .collect(),
    )
}

fn validation_value(validation: Validation) -> Value {
    object([
        ("valid", Value::Bool(validation.valid)),
        ("complete", Value::Bool(validation.complete)),
        (
            "diagnostics",
            Value::Array(
                validation
                    .diagnostics
                    .into_iter()
                    .map(|diagnostic| rdf::rdf_diagnostic_value(&diagnostic))
                    .collect(),
            ),
        ),
    ])
}

struct RuntimeCache;
impl RuntimeCache {
    fn shared(ctx: &mut Context<'_>) -> Result<Arc<RdfRuntime>, EngineError> {
        static RUNTIME: OnceLock<Arc<RdfRuntime>> = OnceLock::new();
        // Check control before touching a successful ordinary-runtime cache.
        ctx.charge_work(1, Utf16::default())?;
        let ordinary = ctx.profile() == umf_core::context::ResourceProfile::Cooperative
            && ctx.limits() == umf_core::context::Limits::ordinary();
        if ordinary {
            if let Some(runtime) = RUNTIME.get() {
                return Ok(Arc::clone(runtime));
            }
        }
        // Build outside OnceLock so reentrant host callbacks cannot wait on
        // initialization while a cache lock is held.
        let runtime = Arc::new(RdfRuntime::new(ctx)?);
        if ordinary {
            let _ = RUNTIME.set(Arc::clone(&runtime));
        }
        Ok(runtime)
    }
}

fn require_document(request: &Value) -> Result<&Value, EngineError> {
    field(request, "document").ok_or_else(|| request_error("document is required"))
}

fn string_field<'a>(request: &'a Value, name: &str) -> Result<&'a Utf16, EngineError> {
    match field(request, name) {
        Some(Value::String(value)) => Ok(value),
        _ => Err(request_error(&format!("{name} must be a string"))),
    }
}

fn options<'a>(request: &'a Value, required: bool) -> Result<Option<&'a Value>, EngineError> {
    let Some(value) = field(request, "options") else {
        return if required {
            Err(request_error("options is required"))
        } else {
            Ok(None)
        };
    };
    if !matches!(value, Value::Object(_)) {
        return Err(request_error("options must be an object"));
    }
    Ok(Some(value))
}

fn option_string<'a>(options: &'a Value, name: &str) -> Result<Option<&'a Utf16>, EngineError> {
    match member(options, name) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(value)) => Ok(Some(value)),
        Some(_) => Err(request_error(&format!("options.{name} must be a string"))),
    }
}

fn required_option_string<'a>(options: &'a Value, name: &str) -> Result<&'a Utf16, EngineError> {
    match member(options, name) {
        Some(Value::String(value)) => Ok(value),
        _ => Err(request_error(&format!("options.{name} must be a string"))),
    }
}

fn validate_members(
    value: &Value,
    allowed: &[&str],
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let Value::Object(fields) = value else {
        return Err(request_error("RDF request must be an object"));
    };
    let mut seen = std::collections::BTreeSet::new();
    for (index, (name, _)) in fields.iter().enumerate() {
        ctx.charge_work(name.len().saturating_add(1), Utf16::default())?;
        let levels = (usize::BITS - (index + 1).leading_zeros()) as usize + 1;
        ctx.charge_work(
            name.len()
                .saturating_add(1)
                .saturating_mul(levels)
                .saturating_mul(16),
            Utf16::default(),
        )?;
        if !allowed
            .iter()
            .any(|candidate| name == &Utf16::from(*candidate))
            || !seen.insert(name)
        {
            return Err(request_error(
                "RDF request has an unknown or duplicate member",
            ));
        }
    }
    Ok(())
}

fn validate_option_members(value: &Value, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    let Value::Object(fields) = value else {
        return Err(request_error("options must be an object"));
    };
    let mut seen = std::collections::BTreeSet::new();
    for (index, (name, _)) in fields.iter().enumerate() {
        ctx.charge_work(name.len().saturating_add(1), Utf16::default())?;
        let levels = (usize::BITS - (index + 1).leading_zeros()) as usize + 1;
        ctx.charge_work(
            name.len()
                .saturating_add(1)
                .saturating_mul(levels)
                .saturating_mul(16),
            Utf16::default(),
        )?;
        if !seen.insert(name) {
            return Err(request_error("RDF options contain duplicate members"));
        }
    }
    Ok(())
}

fn operation_fields(op: &str) -> Option<&'static [&'static str]> {
    Some(match op {
        "rdf.importNQuads"
        | "rdf.importTurtle"
        | "rdf.importTriG"
        | "rdf.importGeneralizedDataset" => &["profile", "op", "source", "options"],
        "rdf.inspect"
        | "rdf.getQuads"
        | "rdf.exportTurtle"
        | "rdf.exportTriG"
        | "rdf.getNamedGraphs"
        | "rdf.inspectGeneralized"
        | "rdf.exportGeneralizedDataset"
        | "rdf.getGeneralizedQuads" => &["profile", "op", "document"],
        "rdf.inspectPayload" => &["profile", "op", "family", "payload"],
        "rdf.exportNQuads" => &["profile", "op", "document", "options"],
        "rdf.editQuad" | "rdf.editGeneralizedQuad" => {
            &["profile", "op", "document", "index", "replacement"]
        }
        "rdf.renameIri" => &["profile", "op", "document", "options"],
        "rdf.mergeDatasets" => &["profile", "op", "documents", "options"],
        _ => return None,
    })
}

fn validate_operation_input(
    op: &str,
    request: &Value,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    match op {
        "rdf.inspectPayload" => {
            match string_field(request, "family")?.to_utf8().as_deref() {
                Ok("rdf" | "generalized-rdf") => {}
                _ => return Err(request_error("family must be rdf or generalized-rdf")),
            }
            if field(request, "payload").is_none() {
                return Err(request_error("payload is required"));
            }
        }
        "rdf.importNQuads"
        | "rdf.importTurtle"
        | "rdf.importTriG"
        | "rdf.importGeneralizedDataset" => {
            string_field(request, "source")?;
            let options = options(request, true)?.unwrap();
            validate_option_members(options, ctx)?;
            required_option_string(options, "id")?;
            if op == "rdf.importTurtle" || op == "rdf.importTriG" {
                required_option_string(options, "baseIRI")?;
            }
        }
        "rdf.exportNQuads" => {
            require_document(request)?;
            if let Some(options) = options(request, false)? {
                validate_option_members(options, ctx)?;
                if !matches!(
                    member(options, "preserveSource"),
                    None | Some(Value::Bool(_))
                ) {
                    return Err(rdf_error("RDF_OPTIONS", "Expected boolean preserveSource"));
                }
            }
        }
        "rdf.editQuad" | "rdf.editGeneralizedQuad" => {
            require_document(request)?;
            let index =
                field(request, "index").ok_or_else(|| request_error("index is required"))?;
            if !matches!(index, Value::Number(number) if number.is_finite() && number.fract() == 0.0 && *number >= 0.0 && *number <= 9_007_199_254_740_991.0)
            {
                return Err(request_error("index must be a non-negative safe integer"));
            }
            if field(request, "replacement").is_none() {
                return Err(request_error("replacement is required"));
            }
        }
        "rdf.renameIri" => {
            require_document(request)?;
            let options = options(request, true)?.unwrap();
            validate_option_members(options, ctx)?;
            required_option_string(options, "from")?;
            required_option_string(options, "to")?;
        }
        "rdf.mergeDatasets" => {
            let documents = field(request, "documents")
                .ok_or_else(|| request_error("documents is required"))?;
            if !matches!(documents, Value::Array(_)) {
                return Err(request_error("documents must be an array"));
            }
            let options = options(request, true)?.unwrap();
            validate_option_members(options, ctx)?;
            required_option_string(options, "id")?;
            required_option_string(options, "graphPolicy")?;
            required_option_string(options, "blankNodePolicy")?;
        }
        _ => {
            require_document(request)?;
        }
    }
    Ok(())
}

fn execute(request: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let op = text_field(request, "op").ok_or_else(|| request_error("op is required"))?;
    if text_field(request, "profile").as_deref() != Some(PROFILE) {
        return Err(request_error("RDF binding profile is required"));
    }
    let allowed = operation_fields(&op).ok_or_else(|| request_error("Unknown RDF operation"))?;
    validate_members(request, allowed, ctx)?;
    validate_operation_input(&op, request, ctx)?;
    let runtime = RuntimeCache::shared(ctx)?;
    Ok(match op.as_str() {
        "rdf.inspectPayload" => {
            let family = string_field(request, "family")?
                .to_utf8()
                .unwrap_or_default();
            let diagnostics = rdf::inspect_rdf_payload(
                &runtime,
                field(request, "payload").unwrap(),
                family == "generalized-rdf",
                ctx,
            )?;
            Value::Array(
                diagnostics
                    .into_iter()
                    .map(|diagnostic| rdf::rdf_diagnostic_value(&diagnostic))
                    .collect(),
            )
        }
        "rdf.importNQuads" => {
            let options = options(request, true)?.unwrap();
            rdf::import_rdf_nquads(
                &runtime,
                string_field(request, "source")?.units(),
                required_option_string(options, "id")?,
                option_string(options, "blankNodeScope")?,
                ctx,
            )?
        }
        "rdf.importTurtle" | "rdf.importTriG" => {
            let options = options(request, true)?.unwrap();
            if op == "rdf.importTurtle" {
                rdf::import_rdf_turtle(
                    &runtime,
                    string_field(request, "source")?.units(),
                    required_option_string(options, "id")?,
                    required_option_string(options, "baseIRI")?,
                    option_string(options, "blankNodeScope")?,
                    ctx,
                )?
            } else {
                rdf::import_rdf_trig(
                    &runtime,
                    string_field(request, "source")?.units(),
                    required_option_string(options, "id")?,
                    required_option_string(options, "baseIRI")?,
                    option_string(options, "blankNodeScope")?,
                    ctx,
                )?
            }
        }
        "rdf.inspect" => validation_value(rdf::inspect_rdf_document(
            &runtime,
            require_document(request)?,
            ctx,
        )?),
        "rdf.getQuads" => rdf::get_rdf_quads(&runtime, require_document(request)?, ctx)?,
        "rdf.exportNQuads" => {
            let preserve =
                options(request, false)?.and_then(|value| match member(value, "preserveSource") {
                    Some(Value::Bool(value)) => Some(*value),
                    _ => None,
                });
            Value::String(rdf::export_rdf_nquads(
                &runtime,
                require_document(request)?,
                preserve,
                ctx,
            )?)
        }
        "rdf.exportTurtle" => Value::String(rdf::export_rdf_turtle(
            &runtime,
            require_document(request)?,
            ctx,
        )?),
        "rdf.exportTriG" => Value::String(rdf::export_rdf_trig(
            &runtime,
            require_document(request)?,
            ctx,
        )?),
        "rdf.getNamedGraphs" => {
            rdf::get_rdf_named_graphs(&runtime, require_document(request)?, ctx)?
        }
        "rdf.editQuad" => {
            let Value::Number(index) = field(request, "index").unwrap() else {
                unreachable!()
            };
            let (document, validation) = rdf::propose_rdf_quad_edit(
                &runtime,
                require_document(request)?,
                *index as usize,
                field(request, "replacement").unwrap(),
                ctx,
            )?;
            object([
                ("document", document),
                ("validation", validation_value(validation)),
            ])
        }
        "rdf.renameIri" => {
            let options = options(request, true)?.unwrap();
            rdf::propose_rdf_iri_rename(
                &runtime,
                require_document(request)?,
                required_option_string(options, "from")?,
                required_option_string(options, "to")?,
                ctx,
            )?
        }
        "rdf.mergeDatasets" => {
            let options = options(request, true)?.unwrap();
            let Value::Array(documents) = field(request, "documents").unwrap() else {
                unreachable!()
            };
            let graph_policy = required_option_string(options, "graphPolicy")?
                .to_utf8()
                .unwrap_or_default();
            let blank_policy = required_option_string(options, "blankNodePolicy")?
                .to_utf8()
                .unwrap_or_default();
            rdf::propose_rdf_dataset_merge(
                &runtime,
                documents,
                required_option_string(options, "id")?,
                &graph_policy,
                &blank_policy,
                ctx,
            )?
        }
        "rdf.inspectGeneralized" => validation_value(rdf::inspect_generalized_rdf_document(
            &runtime,
            require_document(request)?,
            ctx,
        )?),
        "rdf.importGeneralizedDataset" => {
            let options = options(request, true)?.unwrap();
            rdf::import_generalized_rdf_dataset(
                &runtime,
                string_field(request, "source")?.units(),
                required_option_string(options, "id")?,
                option_string(options, "blankNodeScope")?,
                ctx,
            )?
        }
        "rdf.exportGeneralizedDataset" => Value::String(rdf::export_generalized_rdf_dataset(
            &runtime,
            require_document(request)?,
            ctx,
        )?),
        "rdf.getGeneralizedQuads" => {
            rdf::get_generalized_rdf_quads(&runtime, require_document(request)?, ctx)?
        }
        "rdf.editGeneralizedQuad" => {
            let Value::Number(index) = field(request, "index").unwrap() else {
                unreachable!()
            };
            let (document, validation) = rdf::propose_generalized_rdf_quad_edit(
                &runtime,
                require_document(request)?,
                *index as usize,
                field(request, "replacement").unwrap(),
                ctx,
            )?;
            object([
                ("document", document),
                ("validation", validation_value(validation)),
            ])
        }
        _ => return Err(request_error("Unknown RDF operation")),
    })
}

pub fn execute_wire(wire: &str) -> String {
    let mut no_control = |_: usize| Ok(());
    execute_wire_with_control(wire, &mut no_control)
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
