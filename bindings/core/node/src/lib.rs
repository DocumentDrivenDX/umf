use napi::{Env, Error, JsFunction, JsString, JsUnknown, Result as NapiResult, ValueType};
use napi_derive::napi;
use std::{cell::RefCell, rc::Rc};
use umf_core::{
    context::TransportUsage,
    copy_json,
    gregorian_date::{parse_gregorian_date, truncate_gregorian_date},
    rfc3339_exact_instant::parse_rfc3339_exact_instant,
    Capabilities, CapabilityError, Context, Diagnostic, EngineError, ResourceProfile,
    SemanticContext, Severity, Utf16, Value,
};

mod core_key_tuple;
mod core_key_verification;
mod core_record_type_verification;
mod host_json;
mod javascript_numeric_runtime;
mod json_schema_import_session_runtime;
mod json_schema_runtime;
mod protobuf_document;
mod protobuf_source;
mod read_json_value;
mod read_json_value_host;
mod record_members_inspection;

const HOST_READ_FRAME_EVENT: &str = "__umf_host_read_v3_frame__";
const HOST_READ_ARRAY_ITEM_EVENT: &str = "__umf_host_read_v3_array_item__";

#[napi(js_name = "accessRrfProfileVersion")]
pub fn access_rrf_profile_version() -> String {
    umf_core_wire::access_rrf_binding::PROFILE.to_owned()
}

/// Opt-in CONTRACT-052 canonical schema resource; the JS wrapper parses a fresh value.
#[napi(js_name = "domainPackSchemaJson")]
pub fn domain_pack_schema_json(version: String) -> NapiResult<String> {
    umf_core::domain_pack_schema::domain_pack_schema_json(&version)
        .map(str::to_owned)
        .map_err(|error| Error::from_reason(error.code))
}
#[napi(js_name = "executeAccessRrfWire")]
pub fn execute_access_rrf_wire(
    env: Env,
    wire_json: String,
    control_dispatcher: Option<JsFunction>,
) -> NapiResult<String> {
    if let Some(dispatcher) = control_dispatcher {
        let mut control = NodeControl { env, dispatcher };
        let mut hook = |amount| control.check(amount);
        Ok(umf_core_wire::access_rrf_binding::execute_wire_with_control(&wire_json, &mut hook))
    } else {
        Ok(umf_core_wire::access_rrf_binding::execute_wire(&wire_json))
    }
}

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
        Ok(umf_core_wire::execute_bit128_wire_with_control(
            &wire_json, &mut hook,
        ))
    } else {
        Ok(umf_core_wire::execute_bit128_wire(&wire_json))
    }
}

#[napi(js_name = "jsonNumberProfileVersion")]
pub fn json_number_profile_version() -> String {
    umf_core_wire::json_number_binding::JSON_NUMBER_PROFILE.to_owned()
}

#[napi(js_name = "executeJsonNumberWire")]
pub fn execute_json_number_wire(
    env: Env,
    wire_json: String,
    control_dispatcher: Option<JsFunction>,
) -> NapiResult<String> {
    if let Some(dispatcher) = control_dispatcher {
        let mut control = NodeControl { env, dispatcher };
        let mut hook = |amount| control.check(amount);
        Ok(
            umf_core_wire::json_number_binding::execute_json_number_wire_with_control(
                &wire_json, &mut hook,
            ),
        )
    } else {
        Ok(umf_core_wire::json_number_binding::execute_json_number_wire(&wire_json))
    }
}

#[napi(js_name = "executeCodegenHostReadV3Wire")]
pub fn execute_codegen_host_read_v3_wire(
    env: Env,
    wire_json: String,
    profile: String,
    dispatcher: JsFunction,
    control_dispatcher: Option<JsFunction>,
) -> String {
    let profile = match profile.as_str() {
        "cooperative" => ResourceProfile::Cooperative,
        "hard-isolated" => ResourceProfile::HardIsolated,
        _ => {
            return umf_core_wire::error_envelope(EngineError::new(
                "RESOURCE_PROFILE",
                Utf16::default(),
                "Unknown resource profile",
            ));
        }
    };
    let control =
        control_dispatcher.map(|dispatcher| Rc::new(RefCell::new(NodeControl { env, dispatcher })));
    let mut host = NodeHostRead {
        env,
        dispatcher,
        control: control.clone(),
        transport_usage: TransportUsage::default(),
    };
    if let Some(control) = control {
        let mut hook = |amount| control.borrow_mut().check(amount);
        umf_core_wire::execute_codegen_host_read_v3_wire_with_control(
            &wire_json, profile, &mut host, &mut hook,
        )
    } else {
        let mut no_control = |_amount| Ok(());
        umf_core_wire::execute_codegen_host_read_v3_wire_with_control(
            &wire_json,
            profile,
            &mut host,
            &mut no_control,
        )
    }
}

/// Narrow V3 bridge probe: call the JS-owned closed dispatcher synchronously
/// and return its already-serialized wire response without touching the
/// original host exception value.
#[napi(js_name = "executeCodegenHostReadV3Probe")]
pub fn execute_codegen_host_read_v3_probe(env: Env, dispatcher: JsFunction) -> NapiResult<String> {
    let event = env.create_string("InitialPackage")?;
    let args = [event.into_unknown()];
    dispatcher
        .call(None, &args)?
        .coerce_to_string()?
        .into_utf8()?
        .as_str()
        .map(str::to_owned)
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

#[napi(js_name = "readTypescriptJsonValueWire")]
pub fn read_typescript_json_value_wire(
    env: Env,
    wire_json: String,
    format: String,
    control_dispatcher: Option<JsFunction>,
) -> NapiResult<String> {
    if let Some(dispatcher) = control_dispatcher {
        let mut control = NodeControl { env, dispatcher };
        let mut hook = |amount| control.check(amount);
        Ok(umf_core_wire::read_typescript_json_value_wire_with_control(
            &wire_json, &format, &mut hook,
        ))
    } else {
        Ok(umf_core_wire::read_typescript_json_value_wire(
            &wire_json, &format,
        ))
    }
}

#[napi(js_name = "writeTypescriptJsonValueWire")]
pub fn write_typescript_json_value_wire(
    env: Env,
    wire_json: String,
    format: String,
    control_dispatcher: Option<JsFunction>,
) -> NapiResult<String> {
    if let Some(dispatcher) = control_dispatcher {
        let mut control = NodeControl { env, dispatcher };
        let mut hook = |amount| control.check(amount);
        Ok(
            umf_core_wire::write_typescript_json_value_wire_with_control(
                &wire_json, &format, &mut hook,
            ),
        )
    } else {
        Ok(umf_core_wire::write_typescript_json_value_wire(
            &wire_json, &format,
        ))
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
        Err(error) => format!("ERR|{}|{}", error.name(), error.message()),
    })
}

#[napi(js_name = "temporalTruncateGregorianDateWire")]
pub fn temporal_truncate_gregorian_date_wire(
    token: JsUnknown,
    unit: JsUnknown,
) -> NapiResult<String> {
    let token = temporal_value(token)?;
    let _parsed = match parse_gregorian_date(&token) {
        Ok(parsed) => parsed,
        Err(error) => return Ok(format!("ERR|{}|{}", error.name(), error.message())),
    };
    let unit = temporal_value(unit)?;
    Ok(match truncate_gregorian_date(&token, &unit) {
        Ok(result) => format!("OK|{}", result.to_utf8().expect("truncated date is ASCII")),
        Err(error) => format!("ERR|{}|{}", error.name(), error.message()),
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
        Err(error) => format!("ERR|{}|{}", error.name(), error.message()),
    })
}

#[napi(js_name = "temporalSameRfc3339ExactInstantWire")]
pub fn temporal_same_rfc3339_exact_instant_wire(
    left: JsUnknown,
    right: JsUnknown,
) -> NapiResult<String> {
    let left = temporal_value(left)?;
    let parsed_left = match parse_rfc3339_exact_instant(&left) {
        Ok(parsed) => parsed,
        Err(error) => return Ok(format!("ERR|{}|{}", error.name(), error.message())),
    };
    let right = temporal_value(right)?;
    let parsed_right = match parse_rfc3339_exact_instant(&right) {
        Ok(parsed) => parsed,
        Err(error) => return Ok(format!("ERR|{}|{}", error.name(), error.message())),
    };
    let same = parsed_left.utc_seconds() == parsed_right.utc_seconds()
        && parsed_left.fractional_digits() == parsed_right.fractional_digits();
    Ok(format!("OK|{same}"))
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

#[napi(js_name = "executeSemanticValueWire")]
pub fn execute_semantic_value_wire(
    env: Env,
    wire_json: String,
    dispatcher: JsFunction,
    control_dispatcher: Option<JsFunction>,
) -> NapiResult<String> {
    let mut validator = NodeSemanticTypeValidator { env, dispatcher };
    if let Some(dispatcher) = control_dispatcher {
        let mut control = NodeControl { env, dispatcher };
        let mut hook = |amount| control.check(amount);
        Ok(umf_core_wire::semantic_value::execute(
            &wire_json,
            &mut validator,
            &mut hook,
        ))
    } else {
        let mut no_control = |_amount| Ok(());
        Ok(umf_core_wire::semantic_value::execute(
            &wire_json,
            &mut validator,
            &mut no_control,
        ))
    }
}

struct NodeSemanticTypeValidator {
    env: Env,
    dispatcher: JsFunction,
}
impl umf_core::core_semantic_types::SemanticTypeValidator for NodeSemanticTypeValidator {
    fn validate(
        &mut self,
        token: u64,
        value: &Value,
        definition: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, CapabilityError> {
        let wire = umf_core_wire::encode_semantic_validator_request(value, definition, ctx)
            .map_err(CapabilityError::Engine)?;
        let token = self.env.create_double(token as f64).map_err(|_| {
            CapabilityError::Host(Utf16::from("Node semantic validator bridge failed"))
        })?;
        let input = self.env.create_string(&wire).map_err(|_| {
            CapabilityError::Host(Utf16::from("Node semantic validator bridge failed"))
        })?;
        let args = [token.into_unknown(), input.into_unknown()];
        let output = self
            .dispatcher
            .call(None, &args)
            .map_err(|_| CapabilityError::Host(Utf16::default()))?;
        let output = output
            .coerce_to_string()
            .and_then(|v| v.into_utf8())
            .and_then(|v| v.as_str().map(str::to_owned))
            .map_err(|_| CapabilityError::Host(Utf16::default()))?;
        let response = umf_core_wire::decode(&output, ctx).map_err(CapabilityError::Engine)?;
        let reported_work = match value_field(&response, "reportedWork") {
            Some(Value::Number(n))
                if n.is_finite()
                    && *n >= 0.0
                    && n.fract() == 0.0
                    && *n <= 9_007_199_254_740_991.0 =>
            {
                *n as usize
            }
            _ => {
                return Err(CapabilityError::Engine(EngineError::new(
                    "HOST_CONTROL",
                    Utf16::default(),
                    "Invalid semantic validator reported work",
                )))
            }
        };
        ctx.charge_work(reported_work, Utf16::default())
            .map_err(CapabilityError::Engine)?;
        match value_field(&response, "status")
            .and_then(value_text)
            .and_then(|s| s.to_utf8().ok())
            .as_deref()
        {
            Some("returned") => value_field(&response, "result")
                .cloned()
                .ok_or_else(|| CapabilityError::Host(Utf16::from("Value is not JSON-compatible"))),
            Some("threw") => {
                let message = value_field(&response, "message")
                    .and_then(value_text)
                    .cloned()
                    .unwrap_or_default();
                Err(CapabilityError::Host(message))
            }
            Some("resource") => {
                let code = value_field(&response, "code")
                    .and_then(value_text)
                    .and_then(|s| s.to_utf8().ok())
                    .unwrap_or_else(|| "RESOURCE_LIMIT".to_owned());
                let message = value_field(&response, "message")
                    .and_then(value_text)
                    .cloned()
                    .unwrap_or_default();
                Err(CapabilityError::Engine(EngineError::new(
                    code,
                    Utf16::default(),
                    message.to_utf8().unwrap_or_default(),
                )))
            }
            _ => Err(CapabilityError::Host(Utf16::from(
                "Malformed semantic validator response",
            ))),
        }
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

#[napi(js_name = "executeArrowSchemaWire")]
pub fn execute_arrow_schema_wire(
    env: Env,
    wire_json: String,
    control_dispatcher: Option<JsFunction>,
) -> NapiResult<String> {
    if let Some(dispatcher) = control_dispatcher {
        let mut control = NodeControl { env, dispatcher };
        let mut hook = |amount| control.check(amount);
        Ok(umf_core_wire::execute_arrow_schema_wire_with_control(
            &wire_json, &mut hook,
        ))
    } else {
        Ok(umf_core_wire::execute_arrow_schema_wire(&wire_json))
    }
}

#[napi(js_name = "arrowSchemaProfileVersion")]
pub fn arrow_schema_profile_version() -> &'static str {
    umf_core_wire::ARROW_SCHEMA_PROFILE
}

#[napi(js_name = "executeArrowIpcWire")]
pub fn execute_arrow_ipc_wire(
    env: Env,
    wire_json: String,
    control_dispatcher: Option<JsFunction>,
) -> NapiResult<String> {
    if let Some(dispatcher) = control_dispatcher {
        let mut control = NodeControl { env, dispatcher };
        let mut hook = |amount| control.check(amount);
        Ok(umf_core_wire::execute_arrow_ipc_wire_with_control(
            &wire_json, &mut hook,
        ))
    } else {
        Ok(umf_core_wire::execute_arrow_ipc_wire(&wire_json))
    }
}

#[napi(js_name = "arrowIpcProfileVersion")]
pub fn arrow_ipc_profile_version() -> &'static str {
    umf_core_wire::ARROW_IPC_PROFILE
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
        Ok(umf_core_wire::execute_protobuf_inspect_wire_with_control(
            &wire_json, &mut hook,
        ))
    } else {
        Ok(umf_core_wire::execute_protobuf_inspect_wire(&wire_json))
    }
}

#[napi(js_name = "executeArtifactReferencesWire")]
pub fn execute_artifact_references_wire(
    env: Env,
    wire_json: String,
    control_dispatcher: Option<JsFunction>,
) -> NapiResult<String> {
    if let Some(dispatcher) = control_dispatcher {
        let mut control = NodeControl { env, dispatcher };
        let mut hook = |amount| control.check(amount);
        Ok(
            umf_core_wire::artifact_references_binding::execute_wire_with_control(
                &wire_json, &mut hook,
            ),
        )
    } else {
        Ok(umf_core_wire::artifact_references_binding::execute_wire(
            &wire_json,
        ))
    }
}

#[napi(js_name = "protobufInspectProfileVersion")]
pub fn protobuf_inspect_profile_version() -> &'static str {
    umf_core_wire::PROTOBUF_INSPECT_PROFILE
}

#[napi(js_name = "executeAvroInspectWire")]
pub fn execute_avro_inspect_wire(
    env: Env,
    wire_json: String,
    control_dispatcher: Option<JsFunction>,
) -> NapiResult<String> {
    if let Some(dispatcher) = control_dispatcher {
        let mut control = NodeControl { env, dispatcher };
        let mut hook = |amount| control.check(amount);
        Ok(umf_core_wire::execute_avro_inspect_wire_with_control(
            &wire_json, &mut hook,
        ))
    } else {
        Ok(umf_core_wire::execute_avro_inspect_wire(&wire_json))
    }
}

#[napi(js_name = "avroInspectProfileVersion")]
pub fn avro_inspect_profile_version() -> &'static str {
    umf_core_wire::AVRO_INSPECT_PROFILE
}

#[napi(js_name = "executeAvroCandidateWire")]
pub fn execute_avro_candidate_wire(
    env: Env,
    wire_json: String,
    control_dispatcher: Option<JsFunction>,
) -> NapiResult<String> {
    if let Some(dispatcher) = control_dispatcher {
        let mut control = NodeControl { env, dispatcher };
        let mut hook = |amount| control.check(amount);
        Ok(umf_core_wire::execute_avro_candidate_wire_with_control(
            &wire_json, &mut hook,
        ))
    } else {
        Ok(umf_core_wire::execute_avro_candidate_wire(&wire_json))
    }
}

#[napi(js_name = "avroCandidateProfileVersion")]
pub fn avro_candidate_profile_version() -> &'static str {
    umf_core_wire::AVRO_CANDIDATE_PROFILE
}

#[napi(js_name = "executeJsonSchemaWire")]
pub fn execute_json_schema_wire(
    env: Env,
    wire_json: String,
    control_dispatcher: Option<JsFunction>,
) -> NapiResult<String> {
    if let Some(dispatcher) = control_dispatcher {
        let mut control = NodeControl { env, dispatcher };
        let mut hook = |amount| control.check(amount);
        Ok(umf_core_wire::execute_json_schema_wire_with_control(
            &wire_json, &mut hook,
        ))
    } else {
        Ok(umf_core_wire::execute_json_schema_wire(&wire_json))
    }
}

#[napi(js_name = "jsonSchemaProfileVersion")]
pub fn json_schema_profile_version() -> &'static str {
    umf_core_wire::JSON_SCHEMA_PROFILE
}

#[napi(js_name = "executeDocumentComparisonWire")]
pub fn execute_document_comparison_wire(
    env: Env,
    wire_json: String,
    control_dispatcher: Option<JsFunction>,
) -> NapiResult<String> {
    if let Some(dispatcher) = control_dispatcher {
        let mut control = NodeControl { env, dispatcher };
        let mut hook = |amount| control.check(amount);
        Ok(umf_core_wire::execute_document_comparison_wire_with_control(&wire_json, &mut hook))
    } else {
        Ok(umf_core_wire::execute_document_comparison_wire(&wire_json))
    }
}

#[napi(js_name = "documentComparisonProfile")]
pub fn document_comparison_profile() -> &'static str {
    umf_core_wire::DOCUMENT_COMPARISON_PROFILE
}

#[napi(js_name = "executeAvroFieldsWire")]
pub fn execute_avro_fields_wire(
    env: Env,
    wire_json: String,
    control_dispatcher: Option<JsFunction>,
) -> NapiResult<String> {
    if let Some(dispatcher) = control_dispatcher {
        let mut control = NodeControl { env, dispatcher };
        let mut hook = |amount| control.check(amount);
        Ok(umf_core_wire::execute_avro_fields_wire_with_control(
            &wire_json, &mut hook,
        ))
    } else {
        Ok(umf_core_wire::execute_avro_fields_wire(&wire_json))
    }
}

#[napi(js_name = "executeRecordTypeWire")]
pub fn execute_record_type_wire(
    env: Env,
    wire_json: String,
    control_dispatcher: Option<JsFunction>,
) -> NapiResult<String> {
    if let Some(dispatcher) = control_dispatcher {
        let mut control = NodeControl { env, dispatcher };
        let mut hook = |amount| control.check(amount);
        Ok(umf_core_wire::record_type_binding::execute_wire_with_control(&wire_json, &mut hook))
    } else {
        Ok(umf_core_wire::record_type_binding::execute_wire(&wire_json))
    }
}

#[napi(js_name = "recordTypeBindingProfileVersion")]
pub fn record_type_binding_profile_version() -> &'static str {
    umf_core_wire::record_type_binding::PROFILE
}

#[napi(js_name = "avroFieldsProfileVersion")]
pub fn avro_fields_profile_version() -> &'static str {
    umf_core_wire::AVRO_FIELDS_PROFILE
}

#[napi(js_name = "executeJavascriptNumericWire")]
pub fn execute_javascript_numeric_wire(
    env: Env,
    wire_json: String,
    control_dispatcher: Option<JsFunction>,
) -> NapiResult<String> {
    if let Some(dispatcher) = control_dispatcher {
        let mut control = NodeControl { env, dispatcher };
        let mut hook = |amount| control.check(amount);
        Ok(umf_core_wire::execute_javascript_numeric_wire_with_control(
            &wire_json, &mut hook,
        ))
    } else {
        Ok(umf_core_wire::execute_javascript_numeric_wire(&wire_json))
    }
}

#[napi(js_name = "executeSecurityLogicWire")]
pub fn execute_security_logic_wire(
    env: Env,
    wire_json: String,
    control_dispatcher: Option<JsFunction>,
) -> NapiResult<String> {
    if let Some(dispatcher) = control_dispatcher {
        let mut control = NodeControl { env, dispatcher };
        let mut hook = |amount| control.check(amount);
        Ok(
            umf_core_wire::security_logic_binding::execute_security_logic_wire_with_control(
                &wire_json, &mut hook,
            ),
        )
    } else {
        Ok(umf_core_wire::security_logic_binding::execute_security_logic_wire(&wire_json))
    }
}

#[napi(js_name = "executeSecurityFunctionsWire")]
pub fn execute_security_functions_wire(wire_json: String) -> String {
    umf_core_wire::security_functions_binding::execute_security_functions_wire(&wire_json)
}

#[napi(js_name = "executeSecurityProtectionSourceWire")]
pub fn execute_security_protection_source_wire(wire_json: String) -> String {
    umf_core_wire::security_protection_source_binding::execute_security_protection_source_wire(
        &wire_json,
    )
}

#[napi(js_name = "executeSecurityQueryPropertiesWire")]
pub fn execute_security_query_properties_wire(wire_json: String) -> String {
    umf_core_wire::security_queries_binding::execute_security_queries_wire(&wire_json)
}

#[napi(js_name = "executeSecurityProtectionParametersWire")]
pub fn execute_security_protection_parameters_wire(wire_json: String) -> String {
    umf_core_wire::security_parameters_binding::execute_security_parameters_wire(&wire_json)
}

#[napi(js_name = "securityNotScalar")]
pub fn security_not_scalar(
    env: Env,
    value: String,
    control_dispatcher: Option<JsFunction>,
) -> NapiResult<String> {
    if let Some(dispatcher) = control_dispatcher {
        let mut control = NodeControl { env, dispatcher };
        let mut hook = |amount| control.check(amount);
        Ok(
            umf_core_wire::security_logic_binding::execute_security_not_scalar_with_control(
                &value, &mut hook,
            ),
        )
    } else {
        Ok(umf_core_wire::security_logic_binding::execute_security_not_scalar(&value))
    }
}

pub(crate) struct NodeControl {
    pub(crate) env: Env,
    pub(crate) dispatcher: JsFunction,
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

/// Opt-in owner for compiled codegen resources. Setup and calls receive
/// separate explicit control callbacks from the JS wrapper.
#[napi]
pub struct RetainedCodegenResourcesRuntime {
    inner: Option<umf_core_wire::CodegenResourcesHandle>,
}

fn retained_codegen_disposed() -> EngineError {
    EngineError::new(
        "RUST_CODEGEN_HANDLE_DISPOSED",
        Utf16::default(),
        "Retained codegen resources have been disposed",
    )
}

#[napi]
impl RetainedCodegenResourcesRuntime {
    #[napi(constructor)]
    pub fn new(
        env: Env,
        setup_wire: String,
        setup_dispatcher: Option<JsFunction>,
    ) -> napi::Result<Self> {
        let inner = if let Some(dispatcher) = setup_dispatcher {
            let mut control = NodeControl { env, dispatcher };
            let mut hook = |amount| control.check(amount);
            umf_core_wire::CodegenResourcesHandle::new_with_control(&setup_wire, &mut hook)
        } else {
            let mut no_control = |_amount| Ok(());
            umf_core_wire::CodegenResourcesHandle::new_with_control(&setup_wire, &mut no_control)
        }
        .map_err(|error| Error::from_reason(umf_core_wire::error_envelope(error)))?;
        Ok(Self { inner: Some(inner) })
    }

    #[napi]
    pub fn dispose(&mut self) {
        self.inner.take();
    }

    #[napi]
    pub fn execute_wire(
        &self,
        env: Env,
        request_wire: String,
        control_dispatcher: Option<JsFunction>,
    ) -> String {
        if let Some(dispatcher) = control_dispatcher {
            let mut control = NodeControl { env, dispatcher };
            let mut hook = |amount| control.check(amount);
            match &self.inner {
                Some(inner) => inner.execute_with_control(&request_wire, &mut hook),
                None => umf_core_wire::error_envelope(retained_codegen_disposed()),
            }
        } else {
            let mut no_control = |_amount| Ok(());
            match &self.inner {
                Some(inner) => inner.execute_with_control(&request_wire, &mut no_control),
                None => umf_core_wire::error_envelope(retained_codegen_disposed()),
            }
        }
    }

    #[napi]
    pub fn execute_host_read_v3_wire(
        &self,
        env: Env,
        request_wire: String,
        _profile: String,
        dispatcher: JsFunction,
        control_dispatcher: Option<JsFunction>,
    ) -> String {
        let control = control_dispatcher
            .map(|dispatcher| Rc::new(RefCell::new(NodeControl { env, dispatcher })));
        let mut host = NodeHostRead {
            env,
            dispatcher,
            control: control.clone(),
            transport_usage: TransportUsage::default(),
        };
        if let Some(control) = control {
            let mut hook = |amount| control.borrow_mut().check(amount);
            match &self.inner {
                Some(inner) => {
                    inner.execute_host_read_v3_with_control(&request_wire, &mut host, &mut hook)
                }
                None => umf_core_wire::error_envelope(retained_codegen_disposed()),
            }
        } else {
            let mut no_control = |_amount| Ok(());
            match &self.inner {
                Some(inner) => inner.execute_host_read_v3_with_control(
                    &request_wire,
                    &mut host,
                    &mut no_control,
                ),
                None => umf_core_wire::error_envelope(retained_codegen_disposed()),
            }
        }
    }
}

/// Opt-in owner for compiled Arrow schema grammar/resources. Control
/// callbacks are used only during construction or an individual call.
#[napi]
pub struct ArrowSchemaResourcesRuntime {
    inner: Option<umf_core_wire::ArrowSchemaResourcesHandle>,
}

fn arrow_schema_disposed() -> EngineError {
    EngineError::new(
        "RUST_ARROW_SCHEMA_HANDLE_DISPOSED",
        Utf16::default(),
        "Arrow schema resources have been disposed",
    )
}

#[napi]
impl ArrowSchemaResourcesRuntime {
    #[napi(constructor)]
    pub fn new(
        env: Env,
        setup_wire: String,
        setup_dispatcher: Option<JsFunction>,
    ) -> napi::Result<Self> {
        let inner = if let Some(dispatcher) = setup_dispatcher {
            let mut control = NodeControl { env, dispatcher };
            let mut hook = |amount| control.check(amount);
            umf_core_wire::ArrowSchemaResourcesHandle::new_with_control(&setup_wire, &mut hook)
        } else {
            let mut no_control = |_amount| Ok(());
            umf_core_wire::ArrowSchemaResourcesHandle::new_with_control(
                &setup_wire,
                &mut no_control,
            )
        }
        .map_err(|error| Error::from_reason(umf_core_wire::error_envelope(error)))?;
        Ok(Self { inner: Some(inner) })
    }

    #[napi]
    pub fn dispose(&mut self) {
        self.inner.take();
    }

    #[napi]
    pub fn execute_wire(
        &self,
        env: Env,
        request_wire: String,
        control_dispatcher: Option<JsFunction>,
    ) -> String {
        if let Some(dispatcher) = control_dispatcher {
            let mut control = NodeControl { env, dispatcher };
            let mut hook = |amount| control.check(amount);
            match &self.inner {
                Some(inner) => inner.execute_with_control(&request_wire, &mut hook),
                None => umf_core_wire::error_envelope(arrow_schema_disposed()),
            }
        } else {
            let mut no_control = |_amount| Ok(());
            match &self.inner {
                Some(inner) => inner.execute_with_control(&request_wire, &mut no_control),
                None => umf_core_wire::error_envelope(arrow_schema_disposed()),
            }
        }
    }
}

struct NodeHostRead {
    env: Env,
    dispatcher: JsFunction,
    control: Option<Rc<RefCell<NodeControl>>>,
    transport_usage: TransportUsage,
}

impl umf_core_wire::PythonClientHostReadV3 for NodeHostRead {
    fn read(&mut self, event: &str, argument: Option<&str>) -> Result<Value, EngineError> {
        let descriptor_text = self.call_host_dispatcher(event, argument)?;
        let descriptor = umf_core_wire::host_response_frames::HostReadResponseDescriptor::parse(
            &descriptor_text,
        )
        .map_err(|_| {
            host_read_frame_error("Node host-read dispatcher returned invalid descriptor")
        })?;
        let tokens = descriptor
            .tagged_wire_token_count()
            .map_err(|_| host_read_frame_error("Node host-read response accounting overflowed"))?;
        self.charge_host_response(tokens)?;
        let value = match descriptor {
            umf_core_wire::host_response_frames::HostReadResponseDescriptor::Null => Value::Null,
            umf_core_wire::host_response_frames::HostReadResponseDescriptor::Bool(value) => {
                Value::Bool(value)
            }
            umf_core_wire::host_response_frames::HostReadResponseDescriptor::Abort => {
                Value::Object(vec![(
                    Utf16::from("kind"),
                    Value::String(Utf16::from("umf.host-abort/3")),
                )])
            }
            umf_core_wire::host_response_frames::HostReadResponseDescriptor::ResourceLimit {
                path,
            } => {
                return Err(EngineError::new(
                    "RESOURCE_LIMIT",
                    Utf16::from(path),
                    "V4 host-read resource limit exceeded",
                ));
            }
            umf_core_wire::host_response_frames::HostReadResponseDescriptor::String {
                token,
                units,
            } => Value::String(self.read_host_string(token, units)?),
            umf_core_wire::host_response_frames::HostReadResponseDescriptor::StringArray {
                token,
                items,
                units,
            } => {
                let mut values = Vec::new();
                values
                    .try_reserve(items)
                    .map_err(|_| host_read_frame_error("Node host-read array allocation failed"))?;
                let mut observed_units = 0usize;
                for index in 0..items {
                    let argument = format!("{token}:{index}");
                    let item =
                        self.call_host_dispatcher(HOST_READ_ARRAY_ITEM_EVENT, Some(&argument))?;
                    let descriptor =
                        umf_core_wire::host_response_frames::HostReadResponseDescriptor::parse(
                            &item,
                        )
                        .map_err(|_| {
                            host_read_frame_error("Node host-read array descriptor was invalid")
                        })?;
                    let umf_core_wire::host_response_frames::HostReadResponseDescriptor::String {
                        token,
                        units: item_units,
                    } = descriptor
                    else {
                        return Err(host_read_frame_error(
                            "Node host-read array item was not a string",
                        ));
                    };
                    observed_units = observed_units.checked_add(item_units).ok_or_else(|| {
                        host_read_frame_error("Node host-read array length overflowed")
                    })?;
                    if observed_units > units {
                        return Err(host_read_frame_error(
                            "Node host-read array exceeded declared unit count",
                        ));
                    }
                    values.push(Value::String(self.read_host_string(token, item_units)?));
                }
                if umf_core_wire::host_response_frames::verify_string_array_units(
                    units,
                    observed_units,
                )
                .is_err()
                {
                    return Err(host_read_frame_error(
                        "Node host-read array length did not match descriptor",
                    ));
                }
                Value::Array(values)
            }
        };
        self.admit_host_response(value)
    }
}

impl NodeHostRead {
    fn call_host_dispatcher(
        &self,
        event: &str,
        argument: Option<&str>,
    ) -> Result<String, EngineError> {
        let event = self
            .env
            .create_string(event)
            .map_err(|_| host_read_frame_error("Node host-read bridge failed"))?;
        let argument = match argument {
            Some(argument) => self
                .env
                .create_string(argument)
                .map(|value| value.into_unknown()),
            None => self.env.get_undefined().map(|value| value.into_unknown()),
        }
        .map_err(|_| host_read_frame_error("Node host-read bridge failed"))?;
        let args = [event.into_unknown(), argument];
        let output = self
            .dispatcher
            .call(None, &args)
            .map_err(|_| host_read_frame_error("Node host-read bridge failed"))?;
        if output
            .get_type()
            .map_err(|_| host_read_frame_error("Node host-read bridge failed"))?
            != ValueType::String
        {
            return Err(host_read_frame_error(
                "Node host-read dispatcher returned non-text data",
            ));
        }
        let output: JsString = unsafe { output.cast() };
        let utf8 = output
            .into_utf8()
            .map_err(|_| host_read_frame_error("Node host-read descriptor was invalid"))?;
        utf8.as_str()
            .map(str::to_owned)
            .map_err(|_| host_read_frame_error("Node host-read descriptor was invalid"))
    }

    fn read_host_string(&self, token: u64, total_units: usize) -> Result<Utf16, EngineError> {
        use umf_core_wire::host_response_frames::HostReadStringFrames;
        let mut frames = HostReadStringFrames::new(token, total_units)
            .map_err(|_| host_read_frame_error("Node host-read frame header was invalid"))?;
        while let Some((token, offset, maximum)) = frames.request() {
            let argument = format!("{token}:{offset}:{maximum}");
            let frame = self.call_host_dispatcher(HOST_READ_FRAME_EVENT, Some(&argument))?;
            frames
                .append_ascii_frame(&frame)
                .map_err(|_| host_read_frame_error("Node host-read frame was invalid"))?;
        }
        frames
            .finish()
            .map_err(|_| host_read_frame_error("Node host-read frames were incomplete"))
    }

    fn charge_host_response(&mut self, tokens: usize) -> Result<(), EngineError> {
        if let Some(control) = self.control.clone() {
            let mut hook = |amount| control.borrow_mut().check(amount);
            let mut context = umf_core_wire::transport_context().with_host_control(&mut hook);
            self.transport_usage.seed(&mut context);
            let result = context.charge_work(tokens, Utf16::default());
            self.transport_usage.capture(&context);
            result
        } else {
            let mut context = umf_core_wire::transport_context();
            self.transport_usage.seed(&mut context);
            let result = context.charge_work(tokens, Utf16::default());
            self.transport_usage.capture(&context);
            result
        }
    }

    fn admit_host_response(&mut self, value: Value) -> Result<Value, EngineError> {
        if let Some(control) = self.control.clone() {
            let mut hook = |amount| control.borrow_mut().check(amount);
            let mut context = umf_core_wire::transport_context().with_host_control(&mut hook);
            self.transport_usage.seed(&mut context);
            let result = copy_json(&value, &mut context);
            self.transport_usage.capture(&context);
            result
        } else {
            let mut context = umf_core_wire::transport_context();
            self.transport_usage.seed(&mut context);
            let result = copy_json(&value, &mut context);
            self.transport_usage.capture(&context);
            result
        }
    }
}

fn host_read_frame_error(message: &str) -> EngineError {
    EngineError::new("HOST_READ_BRIDGE", Utf16::default(), message)
}

pub(crate) struct NodeCapabilities {
    pub(crate) env: Env,
    pub(crate) dispatcher: JsFunction,
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
