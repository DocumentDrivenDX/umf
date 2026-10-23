use napi::{Env, JsFunction, JsString, JsUnknown, Result as NapiResult, ValueType};
use napi_derive::napi;
use umf_core::{
    gregorian_date::{parse_gregorian_date, truncate_gregorian_date},
    rfc3339_exact_instant::{parse_rfc3339_exact_instant, same_rfc3339_exact_instant},
    Capabilities, CapabilityError, Context, Diagnostic, EngineError, ResourceProfile,
    SemanticContext, Severity, Utf16, Value,
};

#[napi(js_name = "copyJsonWire")]
pub fn copy_json_wire(wire_json: String) -> NapiResult<String> {
    Ok(umf_core_wire::copy_wire_envelope(&wire_json))
}

#[napi(js_name = "executeBit128Wire")]
pub fn execute_bit128_wire(
    env: Env,
    wire_json: String,
    control_dispatcher: Option<JsFunction>,
) -> NapiResult<String> {
    if let Some(dispatcher) = control_dispatcher {
        let mut control = NodeControl { env, dispatcher };
        let mut hook = |amount| control.check(amount);
        Ok(umf_core_wire::execute_bit128_wire_with_control(&wire_json, &mut hook))
    } else {
        Ok(umf_core_wire::execute_bit128_wire(&wire_json))
    }
}

#[napi(js_name = "readValueWire")]
pub fn read_value_wire(
    env: Env,
    wire_json: String,
    format: String,
    control_dispatcher: Option<JsFunction>,
) -> NapiResult<String> {
    if let Some(dispatcher) = control_dispatcher {
        let mut control = NodeControl { env, dispatcher };
        let mut hook = |amount| control.check(amount);
        Ok(umf_core_wire::read_value_wire_with_control(
            &wire_json, &format, &mut hook,
        ))
    } else {
        Ok(umf_core_wire::read_value_wire(&wire_json, &format))
    }
}

#[napi(js_name = "writeValueWire")]
pub fn write_value_wire(
    env: Env,
    wire_json: String,
    format: String,
    control_dispatcher: Option<JsFunction>,
) -> NapiResult<String> {
    if let Some(dispatcher) = control_dispatcher {
        let mut control = NodeControl { env, dispatcher };
        let mut hook = |amount| control.check(amount);
        Ok(umf_core_wire::write_value_wire_with_control(
            &wire_json, &format, &mut hook,
        ))
    } else {
        Ok(umf_core_wire::write_value_wire(&wire_json, &format))
    }
}

#[napi(js_name = "engineVersion")]
pub fn engine_version() -> &'static str {
    "umf-core-r2"
}

#[napi(js_name = "temporalParseGregorianDateWire")]
pub fn temporal_parse_gregorian_date_wire(token: JsUnknown) -> NapiResult<String> {
    let token = temporal_value(token)?;
    Ok(match parse_gregorian_date(&token) {
        Ok(date) => format!("OK|{}|{}|{}", date.year(), date.month(), date.day()),
        Err(error) => error.name().to_owned(),
    })
}

#[napi(js_name = "temporalTruncateGregorianDateWire")]
pub fn temporal_truncate_gregorian_date_wire(
    token: JsUnknown,
    unit: JsUnknown,
) -> NapiResult<String> {
    let token = temporal_value(token)?;
    let unit = temporal_value(unit)?;
    Ok(match truncate_gregorian_date(&token, &unit) {
        Ok(result) => format!("OK|{}", result.to_utf8().expect("truncated date is ASCII")),
        Err(error) => error.name().to_owned(),
    })
}

#[napi(js_name = "temporalParseRfc3339ExactInstantWire")]
pub fn temporal_parse_rfc3339_exact_instant_wire(token: JsUnknown) -> NapiResult<String> {
    let token = temporal_value(token)?;
    Ok(match parse_rfc3339_exact_instant(&token) {
        Ok(parsed) => format!(
            "OK|{}|{}|{}|{}",
            parsed.utc_seconds(),
            parsed.fractional_digits(),
            parsed.original_offset(),
            parsed.local_offset_known()
        ),
        Err(error) => error.name().to_owned(),
    })
}

#[napi(js_name = "temporalSameRfc3339ExactInstantWire")]
pub fn temporal_same_rfc3339_exact_instant_wire(
    left: JsUnknown,
    right: JsUnknown,
) -> NapiResult<String> {
    let left = temporal_value(left)?;
    let right = temporal_value(right)?;
    Ok(match same_rfc3339_exact_instant(&left, &right) {
        Ok(same) => format!("OK|{same}"),
        Err(error) => error.name().to_owned(),
    })
}

fn temporal_value(value: JsUnknown) -> NapiResult<Value> {
    if value.get_type()? != ValueType::String {
        return Ok(Value::Null);
    }
    let string: JsString = unsafe { value.cast() };
    let mut units = string.into_utf16()?.as_slice().to_vec();
    // N-API's UTF-16 getter includes a trailing NUL sentinel. Preserve
    // embedded NUL code units and drop only that terminator.
    if units.last() == Some(&0) {
        units.pop();
    }
    Ok(Value::String(Utf16::new(units)))
}

#[napi(js_name = "executeRequestWire")]
pub fn execute_request_wire(
    env: Env,
    wire_json: String,
    profile: String,
    dispatcher: JsFunction,
    control_dispatcher: Option<JsFunction>,
) -> NapiResult<String> {
    let profile = match profile.as_str() {
        "cooperative" => ResourceProfile::Cooperative,
        "hard-isolated" => ResourceProfile::HardIsolated,
        _ => {
            return Ok(umf_core_wire::error_envelope(EngineError::new(
                "RESOURCE_PROFILE",
                Utf16::default(),
                "Unknown resource profile",
            )));
        }
    };
    let mut capabilities = NodeCapabilities { env, dispatcher };
    if let Some(dispatcher) = control_dispatcher {
        let mut control = NodeControl { env, dispatcher };
        let mut hook = |amount| control.check(amount);
        Ok(umf_core_wire::execute_request_with_control(
            &wire_json,
            profile,
            &mut capabilities,
            &mut hook,
        ))
    } else {
        Ok(umf_core_wire::execute_request(
            &wire_json,
            profile,
            &mut capabilities,
        ))
    }
}

#[napi(js_name = "executeIcebergWire")]
pub fn execute_iceberg_wire(
    env: Env,
    wire_json: String,
    control_dispatcher: Option<JsFunction>,
) -> NapiResult<String> {
    if let Some(dispatcher) = control_dispatcher {
        let mut control = NodeControl { env, dispatcher };
        let mut hook = |amount| control.check(amount);
        Ok(umf_core_wire::execute_iceberg_wire_with_control(
            &wire_json, &mut hook,
        ))
    } else {
        Ok(umf_core_wire::execute_iceberg_wire(&wire_json))
    }
}

#[napi(js_name = "icebergSchemaProfileVersion")]
pub fn iceberg_schema_profile_version() -> &'static str {
    umf_core_wire::ICEBERG_SCHEMA_PROFILE
}

#[napi(js_name = "executeProtobufInspectWire")]
pub fn execute_protobuf_inspect_wire(
    env: Env,
    wire_json: String,
    control_dispatcher: Option<JsFunction>,
) -> NapiResult<String> {
    if let Some(dispatcher) = control_dispatcher {
        let mut control = NodeControl { env, dispatcher };
        let mut hook = |amount| control.check(amount);
        Ok(umf_core_wire::execute_protobuf_inspect_wire_with_control(&wire_json, &mut hook))
    } else {
        Ok(umf_core_wire::execute_protobuf_inspect_wire(&wire_json))
    }
}

#[napi(js_name = "protobufInspectProfileVersion")]
pub fn protobuf_inspect_profile_version() -> &'static str {
    umf_core_wire::PROTOBUF_INSPECT_PROFILE
}

#[napi(js_name = "executeAvroFieldsWire")]
pub fn execute_avro_fields_wire(env: Env, wire_json: String, control_dispatcher: Option<JsFunction>) -> NapiResult<String> {
    if let Some(dispatcher) = control_dispatcher {
        let mut control = NodeControl { env, dispatcher };
        let mut hook = |amount| control.check(amount);
        Ok(umf_core_wire::execute_avro_fields_wire_with_control(&wire_json, &mut hook))
    } else {
        Ok(umf_core_wire::execute_avro_fields_wire(&wire_json))
    }
}

#[napi(js_name = "avroFieldsProfileVersion")]
pub fn avro_fields_profile_version() -> &'static str { umf_core_wire::AVRO_FIELDS_PROFILE }

#[napi(js_name = "executeJavascriptNumericWire")]
pub fn execute_javascript_numeric_wire(
    env: Env,
    wire_json: String,
    control_dispatcher: Option<JsFunction>,
) -> NapiResult<String> {
    if let Some(dispatcher) = control_dispatcher {
        let mut control = NodeControl { env, dispatcher };
        let mut hook = |amount| control.check(amount);
        Ok(umf_core_wire::execute_javascript_numeric_wire_with_control(&wire_json, &mut hook))
    } else {
        Ok(umf_core_wire::execute_javascript_numeric_wire(&wire_json))
    }
}

struct NodeControl {
    env: Env,
    dispatcher: JsFunction,
}

impl NodeControl {
    fn check(&mut self, amount: usize) -> Result<(), EngineError> {
        let amount = self.env.create_double(amount as f64).map_err(|_| {
            EngineError::new(
                "HOST_CONTROL",
                Utf16::default(),
                "Node host control bridge failed",
            )
        })?;
        let args = [amount.into_unknown()];
        let response = self
            .dispatcher
            .call(None, &args)
            .map_err(|_| {
                EngineError::new(
                    "HOST_CONTROL",
                    Utf16::default(),
                    "Node host control bridge failed",
                )
            })?
            .coerce_to_string()
            .and_then(|value| value.into_utf8())
            .and_then(|value| value.as_str().map(str::to_owned))
            .map_err(|_| {
                EngineError::new(
                    "HOST_CONTROL",
                    Utf16::default(),
                    "Node host control returned non-text data",
                )
            })?;
        if response.is_empty() {
            return Ok(());
        }
        let result = umf_core_wire::decode(&response, &mut umf_core_wire::transport_context())
            .map_err(|_| {
                EngineError::new(
                    "HOST_CONTROL",
                    Utf16::default(),
                    "Malformed Node host control result",
                )
            })?;
        if matches!(value_field(&result, "ok"), Some(Value::Bool(true))) {
            return Ok(());
        }
        let code = value_field(&result, "code")
            .and_then(value_text)
            .and_then(|text| text.to_utf8().ok())
            .unwrap_or_else(|| "HOST_CONTROL".to_owned());
        let message = value_field(&result, "message")
            .and_then(value_text)
            .cloned()
            .unwrap_or_else(|| Utf16::from("Host control rejected the operation"));
        let path = value_field(&result, "path")
            .and_then(value_text)
            .cloned()
            .unwrap_or_default();
        Err(EngineError::new(code, path, message))
    }
}

struct NodeCapabilities {
    env: Env,
    dispatcher: JsFunction,
}

impl NodeCapabilities {
    fn dispatch(&mut self, token: u64, wire: &str) -> std::result::Result<Vec<Diagnostic>, Utf16> {
        let token = self
            .env
            .create_uint32(
                u32::try_from(token)
                    .map_err(|_| Utf16::from("Callback token exceeds the Node bridge range"))?,
            )
            .map_err(|_| Utf16::from("Node callback bridge failed"))?;
        let input = self
            .env
            .create_string(&wire)
            .map_err(|_| Utf16::from("Node callback bridge failed"))?;
        let args = [token.into_unknown(), input.into_unknown()];
        let output = self
            .dispatcher
            .call(None, &args)
            .map_err(|_| Utf16::from("Node callback bridge failed"))?;
        let output = output
            .coerce_to_string()
            .and_then(|value| value.into_utf8())
            .and_then(|value| value.as_str().map(str::to_owned))
            .map_err(|_| Utf16::from("Node callback bridge returned a non-text result"))?;
        let decoded = umf_core_wire::decode(&output, &mut umf_core_wire::transport_context())
            .map_err(|error| error.message)?;
        let ok = match value_field(&decoded, "ok") {
            Some(Value::Bool(value)) => *value,
            _ => return Err(Utf16::from("Malformed Node callback result")),
        };
        if !ok {
            return Err(value_field(&decoded, "message")
                .and_then(value_text)
                .cloned()
                .unwrap_or_else(|| Utf16::from("Node callback failed")));
        }
        let Some(Value::Array(items)) = value_field(&decoded, "diagnostics") else {
            return Err(Utf16::from("Node callback diagnostics must be an array"));
        };
        items
            .iter()
            .map(|item| {
                let code = value_field(item, "code")
                    .and_then(value_text)
                    .cloned()
                    .ok_or_else(|| Utf16::from("Node callback diagnostic code must be text"))?;
                let path = value_field(item, "path")
                    .and_then(value_text)
                    .cloned()
                    .ok_or_else(|| Utf16::from("Node callback diagnostic path must be text"))?;
                let message = value_field(item, "message")
                    .and_then(value_text)
                    .cloned()
                    .ok_or_else(|| Utf16::from("Node callback diagnostic message must be text"))?;
                let severity = match value_field(item, "severity")
                    .and_then(value_text)
                    .and_then(|value| value.to_utf8().ok())
                    .as_deref()
                {
                    Some("error") => Severity::Error,
                    Some("warning") => Severity::Warning,
                    _ => {
                        return Err(Utf16::from(
                            "Node callback severity must be error or warning",
                        ));
                    }
                };
                Ok(Diagnostic {
                    code,
                    path,
                    message,
                    severity,
                    python_source_path: false,
                    python_text_origin: None,
                })
            })
            .collect()
    }
}

impl Capabilities for NodeCapabilities {
    fn validate_extension(
        &mut self,
        token: u64,
        payload: &Value,
        context: &SemanticContext,
    ) -> std::result::Result<Vec<Diagnostic>, Utf16> {
        let mut ctx = umf_core_wire::transport_context();
        let wire = umf_core_wire::encode_callback_request(
            payload,
            &context.document,
            &context.path,
            &context.scope,
            &mut ctx,
        )
        .map_err(|error| error.message)?;
        self.dispatch(token, &wire)
    }

    fn validate_extension_with_context(
        &mut self,
        token: u64,
        payload: &Value,
        context: &SemanticContext,
        ctx: &mut Context<'_>,
    ) -> std::result::Result<Vec<Diagnostic>, CapabilityError> {
        let wire = umf_core_wire::encode_callback_request(
            payload,
            &context.document,
            &context.path,
            &context.scope,
            ctx,
        )
        .map_err(CapabilityError::Engine)?;
        self.dispatch(token, &wire).map_err(CapabilityError::Host)
    }
}

fn value_field<'a>(value: &'a Value, key: &str) -> Option<&'a Value> {
    match value {
        Value::Object(fields) => fields
            .iter()
            .find(|(name, _)| name == &Utf16::from(key))
            .map(|(_, value)| value),
        _ => None,
    }
}
fn value_text(value: &Value) -> Option<&Utf16> {
    match value {
        Value::String(value) => Some(value),
        _ => None,
    }
}
