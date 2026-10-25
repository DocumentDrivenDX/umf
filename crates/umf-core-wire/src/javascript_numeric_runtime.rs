// SPDX-License-Identifier: MIT OR Apache-2.0
//! Opaque, retained runtime for the staged JavaScript numeric binding.
//!
//! A prepared stage owns the scalar result computed by Rust. The stage is
//! single-use and cannot be reconstructed from a tagged wire payload, which
//! keeps Field validation from accepting caller-forged literals/results.
use std::sync::Arc;

use umf_core::literal::exact_coefficient;
use umf_core::{
    Capabilities, Context, Diagnostic, Engine, EngineError, Registry, ResourceSet, Utf16,
    Validation, Value,
};

pub struct JavascriptNumericRuntime {
    engine: Arc<Engine>,
}

pub struct PreparedJavascriptNumericStage {
    engine: Arc<Engine>,
    literal: Value,
    output: NumericOutput,
    state: StageState,
}

enum NumericOutput {
    Ready(Value),
    LosslessNumber { token: String, integer: bool },
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum StageState {
    Fresh,
    Validated,
    Consumed,
}

struct NoNumericCapabilities;

impl Capabilities for NoNumericCapabilities {
    fn validate_extension(
        &mut self,
        _token: u64,
        _payload: &Value,
        _context: &umf_core::SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        Err(Utf16::from(
            "No extension callback is installed for numeric context validation",
        ))
    }
}

impl JavascriptNumericRuntime {
    pub fn new(resources: Value, ctx: &mut Context<'_>) -> Result<Self, EngineError> {
        let Value::Object(members) = resources else {
            return Err(fail("REQUEST", "Numeric resources must be an object"));
        };
        let mut core = None;
        let mut reference = None;
        let mut package = None;
        let mut constraints = None;
        let mut policy = None;
        for (key, value) in members {
            match key.to_utf8().ok().as_deref() {
                Some("coreSchema") => core = Some(value),
                Some("referenceSchema") => reference = Some(value),
                Some("packageSchema") => package = Some(value),
                Some("constraints") => constraints = Some(value),
                Some("domainPolicy") => policy = Some(value),
                _ => {}
            }
        }
        let resources = ResourceSet::new(
            core.ok_or_else(|| fail("REQUEST", "Numeric resources are incomplete"))?,
            reference.ok_or_else(|| fail("REQUEST", "Numeric resources are incomplete"))?,
            package.ok_or_else(|| fail("REQUEST", "Numeric resources are incomplete"))?,
            constraints.ok_or_else(|| fail("REQUEST", "Numeric resources are incomplete"))?,
            policy.ok_or_else(|| fail("REQUEST", "Numeric resources are incomplete"))?,
        );
        let engine = Engine::new(resources, ctx)?;
        Ok(Self {
            engine: Arc::new(engine),
        })
    }

    pub fn prepare(
        &self,
        operation: &str,
        args: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<PreparedJavascriptNumericStage, EngineError> {
        let (literal, output) = match operation {
            "exactDecimal" => {
                let token = text(args, "token")?;
                let token = umf_core::javascript_numeric::exact_decimal(&token, ctx)?;
                let value = carrier("decimalToken", token);
                (value.clone(), NumericOutput::Ready(value))
            }
            "integerFromBigInt" => {
                let token = text(args, "token")?;
                let token = umf_core::javascript_numeric::integer_from_bigint(&token, ctx)?;
                let value = carrier("integerToken", token);
                (value.clone(), NumericOutput::Ready(value))
            }
            "integerToBigInt" => {
                let token = carrier_token(args, "integerToken")?;
                let output = umf_core::javascript_numeric::integer_to_bigint(&token, ctx)?;
                (
                    carrier("integerToken", token),
                    NumericOutput::Ready(Value::String(Utf16::from(output))),
                )
            }
            "admitJavascriptNumber" => {
                let bits = text(args, "numberBits")?;
                if bits.len() != 16 || !bits.bytes().all(|byte| byte.is_ascii_hexdigit()) {
                    return Err(fail("JAVASCRIPT_NUMERIC", "Expected binary64 bit pattern"));
                }
                let bits = u64::from_str_radix(&bits, 16)
                    .map_err(|_| fail("JAVASCRIPT_NUMERIC", "Expected binary64 bit pattern"))?;
                let scalar_type = text(args, "scalarType")?;
                let token = umf_core::javascript_numeric::admit_javascript_number(
                    f64::from_bits(bits),
                    &scalar_type,
                    ctx,
                )?;
                let name = if scalar_type == "integer" {
                    "integerToken"
                } else {
                    "decimalToken"
                };
                let value = carrier(name, token);
                (value.clone(), NumericOutput::Ready(value))
            }
            "numericToNumberLossless" => {
                let (name, token) = numeric_carrier(args)?;
                let integer = name == "integerToken";
                umf_core::javascript_numeric::exact_decimal(&token, ctx)?;
                if integer {
                    exact_coefficient(&Utf16::from(token.as_str()), 0, None, ctx).map_err(
                        |error| {
                            if error.code == "numeric-rounding" {
                                EngineError::new(
                                    "CORE_SCHEMA_PROPERTIES",
                                    error.path,
                                    "Numeric value would require rounding",
                                )
                            } else {
                                error
                            }
                        },
                    )?;
                }
                (
                    carrier(name, token.clone()),
                    NumericOutput::LosslessNumber { token, integer },
                )
            }
            _ => return Err(fail("REQUEST", "Unknown JavaScript numeric operation")),
        };
        Ok(PreparedJavascriptNumericStage {
            engine: Arc::clone(&self.engine),
            literal,
            output,
            state: StageState::Fresh,
        })
    }
}

impl PreparedJavascriptNumericStage {
    pub fn take_output(&mut self, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
        if self.state == StageState::Consumed {
            return Err(fail(
                "JAVASCRIPT_NUMERIC_STAGE",
                "Prepared numeric stage was already consumed",
            ));
        }
        self.state = StageState::Consumed;
        self.compute_output(ctx)
    }

    pub fn validate_context(
        &mut self,
        context: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Validation, EngineError> {
        if self.state != StageState::Fresh {
            return Err(fail(
                "JAVASCRIPT_NUMERIC_STAGE",
                "Prepared numeric stage was already consumed",
            ));
        }
        self.state = StageState::Consumed;
        let document = member(context, "document")?;
        let field = member(context, "field")?;
        let module = text(&field, "module")?;
        let element = text(&field, "element")?;
        let mut capabilities = NoNumericCapabilities;
        let validation = self.engine.validate_core_field_value(
            &document,
            &module,
            &element,
            &self.literal,
            &Registry::new(),
            &mut capabilities,
            ctx,
        )?;
        if validation.valid && validation.complete {
            self.state = StageState::Validated;
        }
        Ok(validation)
    }

    fn compute_output(&self, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
        match &self.output {
            NumericOutput::Ready(value) => Ok(value.clone()),
            NumericOutput::LosslessNumber { token, integer } => {
                let output =
                    umf_core::javascript_numeric::numeric_to_number_lossless(token, *integer, ctx)?;
                Ok(Value::Number(output))
            }
        }
    }
}

fn member(value: &Value, name: &str) -> Result<Value, EngineError> {
    let Value::Object(members) = value else {
        return Err(fail("REQUEST", "Expected object"));
    };
    members
        .iter()
        .find(|(key, _)| key == &Utf16::from(name))
        .map(|(_, value)| value.clone())
        .ok_or_else(|| fail("REQUEST", "Required numeric context member is missing"))
}
fn text(value: &Value, name: &str) -> Result<String, EngineError> {
    match member(value, name)? {
        Value::String(value) => value
            .to_utf8()
            .map_err(|_| fail("JAVASCRIPT_NUMERIC", "Expected text")),
        _ => Err(fail("JAVASCRIPT_NUMERIC", "Expected text")),
    }
}
fn carrier(name: &str, token: String) -> Value {
    Value::Object(vec![(Utf16::from(name), Value::String(Utf16::from(token)))])
}
fn carrier_token(value: &Value, name: &str) -> Result<String, EngineError> {
    let value = member(value, "literal")?;
    let Value::Object(members) = value else {
        return Err(fail("JAVASCRIPT_NUMERIC", "Expected one numeric carrier"));
    };
    if members.len() != 1 || members[0].0 != Utf16::from(name) {
        return Err(fail("JAVASCRIPT_NUMERIC", "Expected integerToken"));
    }
    match &members[0].1 {
        Value::String(token) => token
            .to_utf8()
            .map_err(|_| fail("JAVASCRIPT_NUMERIC", "Expected numeric token text")),
        _ => Err(fail("JAVASCRIPT_NUMERIC", "Expected numeric token text")),
    }
}
fn numeric_carrier(value: &Value) -> Result<(&'static str, String), EngineError> {
    let literal = member(value, "literal")?;
    let Value::Object(members) = literal else {
        return Err(fail("JAVASCRIPT_NUMERIC", "Expected one numeric carrier"));
    };
    if members.len() != 1 {
        return Err(fail("JAVASCRIPT_NUMERIC", "Expected one numeric carrier"));
    }
    let name = match members[0].0.to_utf8().ok().as_deref() {
        Some("integerToken") => "integerToken",
        Some("decimalToken") => "decimalToken",
        _ => return Err(fail("JAVASCRIPT_NUMERIC", "Expected one numeric carrier")),
    };
    match &members[0].1 {
        Value::String(token) => Ok((
            name,
            token
                .to_utf8()
                .map_err(|_| fail("JAVASCRIPT_NUMERIC", "Expected numeric token text"))?,
        )),
        _ => Err(fail("JAVASCRIPT_NUMERIC", "Expected numeric token text")),
    }
}
fn fail(code: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}
