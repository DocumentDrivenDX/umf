//! Staged host-object admission for the four synchronous CONTRACT-049 model
//! operations. The operation owns copy order; hosts only reflect opaque values
//! when Rust requests the next operand.
use crate::{
    context::Context,
    engine::Engine,
    error::EngineError,
    host_json::{copy_host_json, HostHandle, HostJsonReflection},
    schema_properties,
    value::{copy_json, Value, Utf16},
};

fn request_error() -> EngineError {
    EngineError::new(
        "REQUEST",
        Utf16::default(),
        "Unknown Core Schema Properties host operation",
    )
}

/// Execute one of the four default-route operations against opaque host inputs.
/// Handles are assigned without reflection by the JS adapter. `third` is the
/// patch for declare, literal for validate, state for resolve, and unused for
/// inspect.
pub fn execute(
    operation: &str,
    source: HostHandle,
    identity: HostHandle,
    third: HostHandle,
    host: &mut dyn HostJsonReflection,
    engine: &Engine,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    match operation {
        "inspectCoreSchemaProperties" => {
            let source = copy_host_json(source, host, ctx)?;
            let identity = copy_host_json(identity, host, ctx)?;
            schema_properties::inspect_core_schema_properties_admitted(
                source, identity, engine, ctx,
            )
        }
        "declareCoreSchemaProperties" => schema_properties::declare_core_schema_properties_host_json(
            source, identity, third, host, engine, ctx,
        ),
        "validateCoreFieldValue" => {
            let field = copy_host_json(identity, host, ctx);
            let value = match field {
                Ok(field) => match copy_host_json(third, host, ctx) {
                    Ok(value) => (field, value),
                    Err(error) => return Ok(schema_properties::field_value_admission_refusal(error)?),
                },
                Err(error) => return Ok(schema_properties::field_value_admission_refusal(error)?),
            };
            schema_properties::validate_core_field_value_host_json(
                source, value.0, value.1, host, engine, ctx,
            )
        }
        "resolveCoreDefault" => {
            let field = copy_host_json(identity, host, ctx)?;
            let state = copy_host_json(third, host, ctx)?;
            // State and relevant field members precede source reflection;
            // cardinality and required-value semantics follow source admission.
            schema_properties::preflight_core_default_operands(&field, &state, ctx)?;
            let source = copy_host_json(source, host, ctx)?;
            let mut identity = match &field {
                Value::Object(fields) => fields.clone(),
                _ => Vec::new(),
            };
            identity.insert(0, (Utf16::from("scope"), Value::string_utf8("element")));
            copy_json(&Value::Object(identity), ctx)?;
            engine.resolve_core_default_after_preflight(source, field, state, ctx)
        }
        _ => Err(request_error()),
    }
}
