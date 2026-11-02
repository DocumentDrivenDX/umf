// SPDX-License-Identifier: MIT OR Apache-2.0
//! Invocation-scoped trusted semantic value checks over tagged JSON wire.
use umf_core::{
    Capabilities, Context, Diagnostic, Engine, EngineError, ResourceSet, SemanticContext, Utf16,
    Value,
    core_semantic_types::{SemanticTypeRegistry, SemanticTypeValidator},
};

fn fail(code: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}
fn field<'a>(v: &'a Value, name: &str) -> Option<&'a Value> {
    let Value::Object(fields) = v else {
        return None;
    };
    fields
        .iter()
        .find(|(k, _)| k == &Utf16::from(name))
        .map(|(_, v)| v)
}
fn text(v: Option<&Value>) -> Option<String> {
    match v {
        Some(Value::String(s)) => s.to_utf8().ok(),
        _ => None,
    }
}
fn num(v: Option<&Value>) -> Option<u64> {
    match v {
        Some(Value::Number(n))
            if n.is_finite() && *n >= 0.0 && n.fract() == 0.0 && *n <= 9_007_199_254_740_991.0 =>
        {
            Some(*n as u64)
        }
        _ => None,
    }
}
struct NoCapabilities;
impl Capabilities for NoCapabilities {
    fn validate_extension(
        &mut self,
        _: u64,
        _: &Value,
        _: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        Ok(Vec::new())
    }
}

/// Executes `registry/admit`, `registry/lookup`, `registry/check`, or
/// `model/validateCoreSemanticTypeValue`. Entries and tokens are supplied by
/// the caller for this invocation only; no document data selects code.
pub fn execute(
    wire_json: &str,
    validators: &mut dyn SemanticTypeValidator,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    let mut ctx = Context::ordinary().with_host_control(control);
    execute_with_context(wire_json, validators, &mut ctx)
}

/// Execute a semantic-value request inside a host-assembled invocation
/// Context. Python uses this to carry meter, cancellation and deadline hooks
/// through decode, registration, callback work, and result encoding.
pub fn execute_with_context(
    wire_json: &str,
    validators: &mut dyn SemanticTypeValidator,
    ctx: &mut Context<'_>,
) -> String {
    let result = (|| {
        let request = super::decode(wire_json, ctx)?;
        let op =
            text(field(&request, "op")).ok_or_else(|| fail("REQUEST", "Request op is required"))?;
        let mut entries = SemanticTypeRegistry::default();
        if let Some(Value::Array(items)) = field(&request, "entries") {
            if op == "registry/prepareCheck" {
                // This ordering-only projection intentionally carries no
                // definitions or executable capability tokens.
            } else {
                for item in items {
                    let reference = field(item, "reference")
                        .ok_or_else(|| fail("REQUEST", "Entry reference is required"))?;
                    let definition = field(item, "definition")
                        .ok_or_else(|| fail("REQUEST", "Entry definition is required"))?;
                    let present =
                        matches!(field(item, "validatorPresent"), Some(Value::Bool(true)));
                    let is_function = !present
                        || matches!(field(item, "validatorIsFunction"), Some(Value::Bool(true)));
                    let token = match field(item, "validatorToken") {
                        None | Some(Value::Null) => None,
                        Some(token) => Some(num(Some(token)).ok_or_else(|| {
                            fail(
                                "REQUEST",
                                "Validator token must be a safe nonnegative integer",
                            )
                        })?),
                    };
                    entries.register_host_admitted(
                        reference,
                        definition,
                        present,
                        is_function,
                        token,
                        ctx,
                    )?;
                }
            }
        } else if matches!(
            op.as_str(),
            "registry/admit"
                | "registry/admitReference"
                | "registry/lookup"
                | "registry/prepareCheck"
                | "registry/check"
                | "model/prepareCoreSemanticTypeValue"
                | "model/validateCoreSemanticTypeValue"
        ) {
            return Err(fail("REQUEST", "Entries must be an array"));
        }
        let out = match op.as_str() {
            "registry/admitReference" => {
                let reference = field(&request, "reference")
                    .ok_or_else(|| fail("REQUEST", "Reference is required"))?;
                let mut probe = SemanticTypeRegistry::default();
                let empty = Value::Object(Vec::new());
                probe.register_host_admitted(reference, &empty, false, false, None, ctx)?;
                Value::Null
            }
            "registry/admit" => Value::Array(Vec::new()),
            "registry/lookup" => entries
                .lookup(
                    field(&request, "reference")
                        .ok_or_else(|| fail("REQUEST", "Reference is required"))?,
                    ctx,
                )?
                .unwrap_or(Value::Null),
            "registry/prepareCheck" => {
                let Value::Array(projected) = field(&request, "entries")
                    .ok_or_else(|| fail("REQUEST", "Entries must be an array"))?
                else {
                    return Err(fail("REQUEST", "Entries must be an array"));
                };
                let mut admitted = Vec::with_capacity(projected.len());
                for item in projected {
                    admitted.push((
                        field(item, "reference")
                            .ok_or_else(|| fail("REQUEST", "Entry reference is required"))?
                            .clone(),
                        matches!(field(item, "validatorPresent"), Some(Value::Bool(true)),),
                    ));
                }
                umf_core::core_semantic_types::SemanticTypeRegistry::prepare_check(
                    field(&request, "reference")
                        .ok_or_else(|| fail("REQUEST", "Reference is required"))?,
                    &admitted,
                    ctx,
                )?
                .unwrap_or(Value::Bool(true))
            }
            "registry/check" => entries.check(
                field(&request, "reference")
                    .ok_or_else(|| fail("REQUEST", "Reference is required"))?,
                field(&request, "value")
                    .ok_or_else(|| fail("NON_JSON", "Value is not JSON-compatible"))?,
                validators,
                ctx,
            )?,
            "model/prepareCoreSemanticTypeValue" => {
                let mut resources = field(&request, "resources")
                    .cloned()
                    .ok_or_else(|| fail("REQUEST", "Explicit resources are required"))?;
                let take = |resources: &mut Value, name: &str| -> Result<Value, EngineError> {
                    let Value::Object(fields) = resources else {
                        return Err(fail("REQUEST", "Resources must be an object"));
                    };
                    let Some(index) = fields.iter().position(|(k, _)| k == &Utf16::from(name))
                    else {
                        return Err(fail("REQUEST", "Explicit resource is required"));
                    };
                    Ok(fields.remove(index).1)
                };
                let engine = Engine::new(
                    ResourceSet::new(
                        take(&mut resources, "coreSchema")?,
                        take(&mut resources, "referenceSchema")?,
                        take(&mut resources, "packageSchema")?,
                        take(&mut resources, "constraints")?,
                        take(&mut resources, "domainPolicy")?,
                    ),
                    ctx,
                )?;
                let registry = engine.registry(ctx)?;
                let mut caps = NoCapabilities;
                umf_core::core_semantic_types::prepare_core_semantic_type_value(
                    field(&request, "source")
                        .ok_or_else(|| fail("REQUEST", "Source is required"))?,
                    field(&request, "identity")
                        .ok_or_else(|| fail("REQUEST", "Identity is required"))?,
                    &engine,
                    &registry,
                    &mut caps,
                    ctx,
                )?;
                Value::Bool(true)
            }
            "model/validateCoreSemanticTypeValue" => {
                let mut resources = field(&request, "resources")
                    .cloned()
                    .ok_or_else(|| fail("REQUEST", "Explicit resources are required"))?;
                let take = |resources: &mut Value, name: &str| -> Result<Value, EngineError> {
                    let Value::Object(fields) = resources else {
                        return Err(fail("REQUEST", "Resources must be an object"));
                    };
                    let Some(index) = fields.iter().position(|(k, _)| k == &Utf16::from(name))
                    else {
                        return Err(fail("REQUEST", "Explicit resource is required"));
                    };
                    Ok(fields.remove(index).1)
                };
                let engine = Engine::new(
                    ResourceSet::new(
                        take(&mut resources, "coreSchema")?,
                        take(&mut resources, "referenceSchema")?,
                        take(&mut resources, "packageSchema")?,
                        take(&mut resources, "constraints")?,
                        take(&mut resources, "domainPolicy")?,
                    ),
                    ctx,
                )?;
                let registry = engine.registry(ctx)?;
                let mut caps = NoCapabilities;
                umf_core::core_semantic_types::validate_core_semantic_type_value(
                    field(&request, "source")
                        .ok_or_else(|| fail("REQUEST", "Source is required"))?,
                    field(&request, "identity")
                        .ok_or_else(|| fail("REQUEST", "Identity is required"))?,
                    field(&request, "value")
                        .ok_or_else(|| fail("NON_JSON", "Value is not JSON-compatible"))?,
                    &entries,
                    validators,
                    &engine,
                    &registry,
                    &mut caps,
                    ctx,
                )?
            }
            _ => return Err(fail("REQUEST", "Unknown semantic value operation")),
        };
        super::encode(&out, ctx)
    })();
    super::result_envelope(result)
}

#[cfg(test)]
mod tests {
    use super::num;
    use umf_core::{Context, Utf16, Value};

    #[test]
    fn validator_tokens_are_exact_javascript_safe_integers() {
        assert_eq!(
            num(Some(&Value::Number(9_007_199_254_740_991.0))),
            Some(9_007_199_254_740_991)
        );
        assert_eq!(num(Some(&Value::Number(9_007_199_254_740_992.0))), None);
        assert_eq!(
            num(Some(&Value::Number(18_446_744_073_709_551_616.0))),
            None
        );
        assert_eq!(num(Some(&Value::Number(f64::INFINITY))), None);
        assert_eq!(num(Some(&Value::Number(1.5))), None);
    }

    #[test]
    fn borrowed_validator_pair_matches_ordinary_tagged_object_wire() {
        let value = Value::Object(vec![(
            Utf16::from("x"),
            Value::String(Utf16::from("value")),
        )]);
        let definition = Value::Object(vec![(
            Utf16::from("format"),
            Value::String(Utf16::from("email")),
        )]);
        let expected = Value::Object(vec![
            (Utf16::from("value"), value.clone()),
            (Utf16::from("definition"), definition.clone()),
        ]);
        let actual = super::super::encode_semantic_validator_request(
            &value,
            &definition,
            &mut Context::ordinary(),
        )
        .unwrap();
        let expected = super::super::encode(&expected, &mut Context::ordinary()).unwrap();
        assert_eq!(actual, expected);
    }
}
