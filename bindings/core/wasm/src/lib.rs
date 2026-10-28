use js_sys::Function;
use umf_core::{
    context::TransportUsage,
    copy_json,
    gregorian_date::{parse_gregorian_date, truncate_gregorian_date},
    rfc3339_exact_instant::parse_rfc3339_exact_instant,
    Capabilities, CapabilityError, Context, Diagnostic, EngineError, ResourceProfile,
    SemanticContext, Severity, Utf16, Value,
};
use wasm_bindgen::prelude::*;

mod core_key_tuple;
mod core_key_verification;
mod core_record_type_verification;
mod host_json;
mod javascript_numeric_runtime;
mod json_schema_import_session;
mod json_schema_runtime;
mod protobuf_document;
mod protobuf_source;
mod record_members_inspection;
mod sec_projection;

const HOST_READ_FRAME_EVENT: &str = "__umf_host_read_v3_frame__";
const HOST_READ_ARRAY_ITEM_EVENT: &str = "__umf_host_read_v3_array_item__";

/// Opt-in CONTRACT-052 generated schema. The caller parses the string to receive a fresh JS value.
#[wasm_bindgen(js_name = "domainPackSchemaJson")]
pub fn domain_pack_schema_json(version: &str) -> Result<String, JsValue> {
    umf_core::domain_pack_schema::domain_pack_schema_json(version)
        .map_err(|error| JsValue::from_str(&error.code))
}

/// Default-route schema graph with Rust-owned intra-result alias metadata.
#[wasm_bindgen(js_name = domainPackSchemaGraphJson)]
pub fn domain_pack_schema_graph_json() -> Result<String, JsValue> {
    umf_core::domain_pack_schema::domain_pack_schema_graph_json()
        .map_err(|error| JsValue::from_str(&error.code))
}

#[wasm_bindgen(js_name = datasetSourceSchemaGraphJson)]
pub fn dataset_source_schema_graph_json() -> Result<String, JsValue> {
    umf_core::domain_pack_schema::dataset_source_schema_graph_json()
        .map_err(|error| JsValue::from_str(&error.code))
}

#[wasm_bindgen(js_name = artifactCollectionSchemaGraphJson)]
pub fn artifact_collection_schema_graph_json() -> Result<String, JsValue> {
    umf_core::domain_pack_schema::artifact_collection_schema_graph_json()
        .map_err(|error| JsValue::from_str(&error.code))
}

#[wasm_bindgen(js_name = domainPackLoaderSchemaGraphJson)]
pub fn domain_pack_loader_schema_graph_json() -> Result<String, JsValue> {
    umf_core::domain_pack_loader_schemas::domain_pack_loader_schema_graph_json()
        .map_err(|error| JsValue::from_str(&error.code))
}

#[wasm_bindgen(js_name = loaderInventorySchemaGraphJson)]
pub fn loader_inventory_schema_graph_json() -> Result<String, JsValue> {
    umf_core::domain_pack_loader_schemas::loader_inventory_schema_graph_json()
        .map_err(|error| JsValue::from_str(&error.code))
}

/// Pure CONTRACT-057 loader inspection; accepts the JSON copied by the JS host wrapper.
#[wasm_bindgen(js_name = inspectDomainPackLoaderWire)]
pub fn inspect_domain_pack_loader_wire(input_json: &str) -> Result<String, JsValue> {
    umf_core::domain_pack_loader_inspection::inspect_domain_pack_loader_wire(input_json)
        .map_err(|_| JsValue::from_str("Malformed loader inspection JSON"))
}

/// Pure CONTRACT-052/053 pack-profile inspection after host JSON admission.
#[wasm_bindgen(js_name = inspectDomainPackProfileWire)]
pub fn inspect_domain_pack_profile_wire(input_json: &str) -> Result<String, JsValue> {
    umf_core::domain_pack_profile_inspection::inspect_domain_pack_profile_wire(input_json)
        .map_err(|_| JsValue::from_str("Malformed domain-pack profile inspection JSON"))
}

#[wasm_bindgen(js_name = accessRrfProfileVersion)]
pub fn access_rrf_profile_version() -> String {
    umf_core_wire::access_rrf_binding::PROFILE.to_owned()
}

#[wasm_bindgen(js_name = accessTemporalProfileVersion)]
pub fn access_temporal_profile_version() -> String {
    umf_core::access_temporal::ACCESS_TEMPORAL_PROFILE.to_owned()
}

#[wasm_bindgen(js_name = executeAccessTemporalWire)]
pub fn execute_access_temporal_wire(wire_json: &str) -> String {
    umf_core_wire::access_temporal_binding::execute_access_temporal_wire(wire_json)
}
#[wasm_bindgen(js_name = executeAccessRrfWire)]
pub fn execute_access_rrf_wire(wire_json: &str, control_dispatcher: Option<Function>) -> String {
    if let Some(dispatcher) = control_dispatcher {
        let mut control = WasmControl { dispatcher };
        let mut hook = |amount| control.check(amount);
        umf_core_wire::access_rrf_binding::execute_wire_with_control(wire_json, &mut hook)
    } else {
        umf_core_wire::access_rrf_binding::execute_wire(wire_json)
    }
}

fn temporal_value(value: &JsValue) -> Value {
    value
        .as_string()
        .map_or(Value::Null, |text| Value::String(Utf16::from(text)))
}

#[wasm_bindgen(js_name = temporalParseGregorianDateWire)]
pub fn temporal_parse_gregorian_date_wire(token: JsValue) -> String {
    match parse_gregorian_date(&temporal_value(&token)) {
        Ok(date) => format!("OK|{}|{}|{}", date.year(), date.month(), date.day()),
        Err(error) => format!("ERR|{}|{}", error.name(), error.message()),
    }
}

#[wasm_bindgen(js_name = temporalTruncateGregorianDateWire)]
pub fn temporal_truncate_gregorian_date_wire(token: JsValue, unit: JsValue) -> String {
    let token = temporal_value(&token);
    if let Err(error) = parse_gregorian_date(&token) {
        return format!("ERR|{}|{}", error.name(), error.message());
    }
    let unit = temporal_value(&unit);
    match truncate_gregorian_date(&token, &unit) {
        Ok(result) => format!("OK|{}", result.to_utf8().expect("truncated date is ASCII")),
        Err(error) => format!("ERR|{}|{}", error.name(), error.message()),
    }
}

#[wasm_bindgen(js_name = temporalParseRfc3339ExactInstantWire)]
pub fn temporal_parse_rfc3339_exact_instant_wire(token: JsValue) -> String {
    match parse_rfc3339_exact_instant(&temporal_value(&token)) {
        Ok(parsed) => format!(
            "OK|{}|{}|{}|{}",
            parsed.utc_seconds(),
            parsed.fractional_digits(),
            parsed.original_offset(),
            parsed.local_offset_known()
        ),
        Err(error) => format!("ERR|{}|{}", error.name(), error.message()),
    }
}

#[wasm_bindgen(js_name = temporalSameRfc3339ExactInstantWire)]
pub fn temporal_same_rfc3339_exact_instant_wire(left: JsValue, right: JsValue) -> String {
    let left = temporal_value(&left);
    let parsed_left = match parse_rfc3339_exact_instant(&left) {
        Ok(parsed) => parsed,
        Err(error) => return format!("ERR|{}|{}", error.name(), error.message()),
    };
    let right = temporal_value(&right);
    let parsed_right = match parse_rfc3339_exact_instant(&right) {
        Ok(parsed) => parsed,
        Err(error) => return format!("ERR|{}|{}", error.name(), error.message()),
    };
    format!(
        "OK|{}",
        parsed_left.utc_seconds() == parsed_right.utc_seconds()
            && parsed_left.fractional_digits() == parsed_right.fractional_digits()
    )
}

/// Trusted static-corpus probe used only by the Chromium qualification build.
/// It is feature-gated and is not part of ordinary production WASM artifacts.
#[cfg(feature = "conformance")]
#[wasm_bindgen(js_name = pythonRegexProbe)]
pub fn python_regex_probe(minor: u8, operation: &str, pattern: Vec<u32>, text: Vec<u32>) -> String {
    use umf_core::{PythonReVersion, PythonRegex};

    let mut ctx = Context::ordinary();
    let version = match PythonReVersion::from_minor(minor) {
        Ok(version) => version,
        Err(_) => return "X".to_owned(),
    };
    let regex = match PythonRegex::compile_codepoints_with_context(&pattern, version, &mut ctx) {
        Ok(regex) => regex,
        Err(error) if error.code == "PYTHON_REGEX_SYNTAX" => return "E".to_owned(),
        Err(_) => return "X".to_owned(),
    };
    match operation {
        "compile" => "N".to_owned(),
        "search" => match regex.find_from_codepoints_with_context(&text, 0, &mut ctx) {
            Ok(Some((start, end))) => format!("M\t{start}\t{end}"),
            Ok(None) => "N".to_owned(),
            Err(_) => "X".to_owned(),
        },
        _ => "X".to_owned(),
    }
}

/// Exercise the production counter and host callback path on actual wasm32.
#[cfg(feature = "conformance")]
#[wasm_bindgen(js_name = wideWorkProbe)]
pub fn wide_work_probe() -> String {
    let mut chunks = Vec::new();
    let mut meter = |amount| {
        chunks.push(amount);
        Ok(())
    };
    let mut ctx = Context::ordinary().with_meter(&mut meter);
    let amount = u64::from(u32::MAX) * 2 + 19;
    if ctx.charge_work_u64(amount, Utf16::default()).is_err() {
        return "counter-error".to_owned();
    }
    let charged = ctx.charged_work();
    drop(ctx);
    let mut calls = 0;
    let mut refusal = |_| {
        calls += 1;
        Err(EngineError::new("WIDE_DENIED", Utf16::default(), "denied"))
    };
    let mut denied = Context::ordinary().with_meter(&mut refusal);
    let refused = denied
        .charge_work_u64(amount, Utf16::default())
        .is_err_and(|error| error.code == "WIDE_DENIED");
    drop(denied);
    format!(
        "{{\"charged\":\"{charged}\",\"chunks\":{chunks:?},\"refused\":{refused},\"refusalCalls\":{calls}}}"
    )
}

#[wasm_bindgen(js_name = copyJsonWire)]
pub fn copy_json_wire(wire_json: &str) -> Result<String, JsValue> {
    Ok(umf_core_wire::copy_wire_envelope(wire_json))
}

#[wasm_bindgen(js_name = executeSemanticValueWire)]
pub fn execute_semantic_value_wire(
    wire_json: &str,
    dispatcher: Function,
    control_dispatcher: Option<Function>,
) -> String {
    let mut validator = WasmSemanticTypeValidator { dispatcher };
    if let Some(dispatcher) = control_dispatcher {
        let mut control = WasmControl { dispatcher };
        let mut hook = |amount| control.check(amount);
        umf_core_wire::semantic_value::execute(wire_json, &mut validator, &mut hook)
    } else {
        let mut no_control = |_amount| Ok(());
        umf_core_wire::semantic_value::execute(wire_json, &mut validator, &mut no_control)
    }
}

struct WasmSemanticTypeValidator {
    dispatcher: Function,
}
impl umf_core::core_semantic_types::SemanticTypeValidator for WasmSemanticTypeValidator {
    fn validate(
        &mut self,
        token: u64,
        value: &Value,
        definition: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, CapabilityError> {
        let wire = umf_core_wire::encode_semantic_validator_request(value, definition, ctx)
            .map_err(CapabilityError::Engine)?;
        let output = self
            .dispatcher
            .call2(
                &JsValue::NULL,
                &JsValue::from_f64(token as f64),
                &JsValue::from_str(&wire),
            )
            .map_err(|_| CapabilityError::Host(Utf16::default()))?;
        let output = output
            .as_string()
            .ok_or_else(|| CapabilityError::Host(Utf16::default()))?;
        let response = umf_core_wire::decode(&output, ctx).map_err(CapabilityError::Engine)?;
        let reported_work: u64 = match value_field(&response, "reportedWork") {
            Some(Value::Number(n))
                if n.is_finite()
                    && *n >= 0.0
                    && n.fract() == 0.0
                    && *n <= 9_007_199_254_740_991.0 =>
            {
                *n as u64
            }
            _ => {
                return Err(CapabilityError::Engine(EngineError::new(
                    "HOST_CONTROL",
                    Utf16::default(),
                    "Invalid semantic validator reported work",
                )))
            }
        };
        ctx.charge_work_u64(reported_work, Utf16::default())
            .map_err(CapabilityError::Engine)?;
        match value_field(&response, "status")
            .and_then(value_text)
            .and_then(|s| s.to_utf8().ok())
            .as_deref()
        {
            Some("returned") => value_field(&response, "result")
                .cloned()
                .ok_or_else(|| CapabilityError::Host(Utf16::from("Value is not JSON-compatible"))),
            Some("threw") => Err(CapabilityError::Host(
                value_field(&response, "message")
                    .and_then(value_text)
                    .cloned()
                    .unwrap_or_default(),
            )),
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

#[wasm_bindgen(js_name = executeBit128Wire)]
pub fn execute_bit128_wire(wire_json: &str, control_dispatcher: Option<Function>) -> String {
    if let Some(dispatcher) = control_dispatcher {
        let mut control = WasmControl { dispatcher };
        let mut hook = |amount| control.check(amount);
        umf_core_wire::execute_bit128_wire_with_control(wire_json, &mut hook)
    } else {
        umf_core_wire::execute_bit128_wire(wire_json)
    }
}

#[wasm_bindgen(js_name = jsonNumberProfileVersion)]
pub fn json_number_profile_version() -> String {
    umf_core_wire::json_number_binding::JSON_NUMBER_PROFILE.to_owned()
}

#[wasm_bindgen(js_name = executeJsonNumberWire)]
pub fn execute_json_number_wire(wire_json: &str, control_dispatcher: Option<Function>) -> String {
    if let Some(dispatcher) = control_dispatcher {
        let mut control = WasmControl { dispatcher };
        let mut hook = |amount| control.check(amount);
        umf_core_wire::json_number_binding::execute_json_number_wire_with_control(
            wire_json, &mut hook,
        )
    } else {
        umf_core_wire::json_number_binding::execute_json_number_wire(wire_json)
    }
}

#[wasm_bindgen(js_name = executeCodegenHostReadV3Wire)]
pub fn execute_codegen_host_read_v3_wire(
    wire_json: &str,
    profile: &str,
    dispatcher: &Function,
    control_dispatcher: Option<Function>,
) -> String {
    let profile = match profile {
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
    let mut host = WasmHostRead {
        dispatcher: dispatcher.clone(),
        control_dispatcher: control_dispatcher.clone(),
        transport_usage: TransportUsage::default(),
    };
    if let Some(dispatcher) = control_dispatcher {
        let mut control = WasmControl { dispatcher };
        let mut hook = |amount| control.check(amount);
        umf_core_wire::execute_codegen_host_read_v3_wire_with_control(
            wire_json, profile, &mut host, &mut hook,
        )
    } else {
        let mut no_control = |_amount| Ok(());
        umf_core_wire::execute_codegen_host_read_v3_wire_with_control(
            wire_json,
            profile,
            &mut host,
            &mut no_control,
        )
    }
}

/// Narrow V3 bridge probe: call the JS-owned closed dispatcher synchronously
/// and return its already-serialized wire response without touching the
/// original host exception value.
#[wasm_bindgen(js_name = executeCodegenHostReadV3Probe)]
pub fn execute_codegen_host_read_v3_probe(dispatcher: &Function) -> Result<String, JsValue> {
    let event = JsValue::from_str("InitialPackage");
    dispatcher
        .call1(&JsValue::NULL, &event)?
        .as_string()
        .ok_or_else(|| JsValue::from_str("Host-read dispatcher returned non-text data"))
}

#[wasm_bindgen(js_name = readValueWire)]
pub fn read_value_wire(
    wire_json: &str,
    format: &str,
    control_dispatcher: Option<Function>,
) -> String {
    if let Some(dispatcher) = control_dispatcher {
        let mut control = WasmControl { dispatcher };
        let mut hook = |amount| control.check(amount);
        umf_core_wire::read_value_wire_with_control(wire_json, format, &mut hook)
    } else {
        umf_core_wire::read_value_wire(wire_json, format)
    }
}

#[wasm_bindgen(js_name = readTypescriptJsonValueWire)]
pub fn read_typescript_json_value_wire(
    wire_json: &str,
    format: &str,
    control_dispatcher: Option<Function>,
) -> String {
    if let Some(dispatcher) = control_dispatcher {
        let mut control = WasmControl { dispatcher };
        let mut hook = |amount| control.check(amount);
        umf_core_wire::read_typescript_json_value_wire_with_control(wire_json, format, &mut hook)
    } else {
        umf_core_wire::read_typescript_json_value_wire(wire_json, format)
    }
}

#[wasm_bindgen(js_name = writeTypescriptJsonValueWire)]
pub fn write_typescript_json_value_wire(
    wire_json: &str,
    format: &str,
    control_dispatcher: Option<Function>,
) -> String {
    if let Some(dispatcher) = control_dispatcher {
        let mut control = WasmControl { dispatcher };
        let mut hook = |amount| control.check(amount);
        umf_core_wire::write_typescript_json_value_wire_with_control(wire_json, format, &mut hook)
    } else {
        umf_core_wire::write_typescript_json_value_wire(wire_json, format)
    }
}

#[wasm_bindgen(js_name = writeValueWire)]
pub fn write_value_wire(
    wire_json: &str,
    format: &str,
    control_dispatcher: Option<Function>,
) -> String {
    if let Some(dispatcher) = control_dispatcher {
        let mut control = WasmControl { dispatcher };
        let mut hook = |amount| control.check(amount);
        umf_core_wire::write_value_wire_with_control(wire_json, format, &mut hook)
    } else {
        umf_core_wire::write_value_wire(wire_json, format)
    }
}

#[wasm_bindgen(js_name = engineVersion)]
pub fn engine_version() -> String {
    "umf-core-r2".to_owned()
}

#[wasm_bindgen(js_name = executeRequestWire)]
pub fn execute_request_wire(
    wire_json: &str,
    profile: &str,
    dispatcher: &Function,
    control_dispatcher: Option<Function>,
) -> String {
    let profile = match profile {
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
    let mut capabilities = WasmCapabilities {
        dispatcher: dispatcher.clone(),
    };
    if let Some(dispatcher) = control_dispatcher {
        let mut control = WasmControl { dispatcher };
        let mut hook = |amount| control.check(amount);
        umf_core_wire::execute_request_with_control(
            wire_json,
            profile,
            &mut capabilities,
            &mut hook,
        )
    } else {
        umf_core_wire::execute_request(wire_json, profile, &mut capabilities)
    }
}

/// Opt-in closed current-core Bit128 Field authoring route. This deliberately
/// accepts one wire operation and does not widen the default request router.
#[wasm_bindgen(js_name = executeCoreBit128FieldRequestWire)]
pub fn execute_core_bit128_field_request_wire(
    wire_json: &str,
    profile: &str,
    dispatcher: &Function,
    control_dispatcher: Option<Function>,
) -> String {
    let profile = match profile {
        "cooperative" => ResourceProfile::Cooperative,
        "hard-isolated" => ResourceProfile::HardIsolated,
        _ => return umf_core_wire::error_envelope(EngineError::new(
            "RESOURCE_PROFILE", Utf16::default(), "Unknown resource profile",
        )),
    };
    let mut capabilities = WasmCapabilities { dispatcher: dispatcher.clone() };
    if let Some(dispatcher) = control_dispatcher {
        let mut control = WasmControl { dispatcher };
        let mut hook = |amount| control.check(amount);
        umf_core_wire::execute_core_bit128_field_request_with_control(
            wire_json, profile, &mut capabilities, &mut hook,
        )
    } else {
        let mut no_control = |_amount| Ok(());
        umf_core_wire::execute_core_bit128_field_request_with_control(
            wire_json, profile, &mut capabilities, &mut no_control,
        )
    }
}

#[wasm_bindgen(js_name = executeIcebergWire)]
pub fn execute_iceberg_wire(wire_json: &str, control_dispatcher: Option<Function>) -> String {
    if let Some(dispatcher) = control_dispatcher {
        let mut control = WasmControl { dispatcher };
        let mut hook = |amount| control.check(amount);
        umf_core_wire::execute_iceberg_wire_with_control(wire_json, &mut hook)
    } else {
        umf_core_wire::execute_iceberg_wire(wire_json)
    }
}

#[wasm_bindgen(js_name = icebergSchemaProfileVersion)]
pub fn iceberg_schema_profile_version() -> String {
    umf_core_wire::ICEBERG_SCHEMA_PROFILE.to_owned()
}

#[wasm_bindgen(js_name = executeArrowSchemaWire)]
pub fn execute_arrow_schema_wire(wire_json: &str, control_dispatcher: Option<Function>) -> String {
    if let Some(dispatcher) = control_dispatcher {
        let mut control = WasmControl { dispatcher };
        let mut hook = |amount| control.check(amount);
        umf_core_wire::execute_arrow_schema_wire_with_control(wire_json, &mut hook)
    } else {
        umf_core_wire::execute_arrow_schema_wire(wire_json)
    }
}

#[wasm_bindgen(js_name = arrowSchemaProfileVersion)]
pub fn arrow_schema_profile_version() -> String {
    umf_core_wire::ARROW_SCHEMA_PROFILE.to_owned()
}

#[wasm_bindgen(js_name = executeArrowIpcWire)]
pub fn execute_arrow_ipc_wire(wire_json: &str, control_dispatcher: Option<Function>) -> String {
    if let Some(dispatcher) = control_dispatcher {
        let mut control = WasmControl { dispatcher };
        let mut hook = |amount| control.check(amount);
        umf_core_wire::execute_arrow_ipc_wire_with_control(wire_json, &mut hook)
    } else {
        umf_core_wire::execute_arrow_ipc_wire(wire_json)
    }
}

#[wasm_bindgen(js_name = arrowIpcProfileVersion)]
pub fn arrow_ipc_profile_version() -> String {
    umf_core_wire::ARROW_IPC_PROFILE.to_owned()
}

#[wasm_bindgen(js_name = executeProtobufInspectWire)]
pub fn execute_protobuf_inspect_wire(
    wire_json: &str,
    control_dispatcher: Option<Function>,
) -> String {
    if let Some(dispatcher) = control_dispatcher {
        let mut control = WasmControl { dispatcher };
        let mut hook = |amount| control.check(amount);
        umf_core_wire::execute_protobuf_inspect_wire_with_control(wire_json, &mut hook)
    } else {
        umf_core_wire::execute_protobuf_inspect_wire(wire_json)
    }
}

#[wasm_bindgen(js_name = executeArtifactReferencesWire)]
pub fn execute_artifact_references_wire(
    wire_json: &str,
    control_dispatcher: Option<Function>,
) -> String {
    if let Some(dispatcher) = control_dispatcher {
        let mut control = WasmControl { dispatcher };
        let mut hook = |amount| control.check(amount);
        umf_core_wire::artifact_references_binding::execute_wire_with_control(wire_json, &mut hook)
    } else {
        umf_core_wire::artifact_references_binding::execute_wire(wire_json)
    }
}

#[wasm_bindgen(js_name = protobufInspectProfileVersion)]
pub fn protobuf_inspect_profile_version() -> String {
    umf_core_wire::PROTOBUF_INSPECT_PROFILE.to_owned()
}

#[wasm_bindgen(js_name = executeJsonSchemaWire)]
pub fn execute_json_schema_wire(wire_json: &str, control_dispatcher: Option<Function>) -> String {
    if let Some(dispatcher) = control_dispatcher {
        let mut control = WasmControl { dispatcher };
        let mut hook = |amount| control.check(amount);
        umf_core_wire::execute_json_schema_wire_with_control(wire_json, &mut hook)
    } else {
        umf_core_wire::execute_json_schema_wire(wire_json)
    }
}

#[wasm_bindgen(js_name = jsonSchemaProfileVersion)]
pub fn json_schema_profile_version() -> String {
    umf_core_wire::JSON_SCHEMA_PROFILE.to_owned()
}

#[wasm_bindgen(js_name = executeDocumentComparisonWire)]
pub fn execute_document_comparison_wire(
    wire_json: &str,
    control_dispatcher: Option<Function>,
) -> String {
    if let Some(dispatcher) = control_dispatcher {
        let mut control = WasmControl { dispatcher };
        let mut hook = |amount| control.check(amount);
        umf_core_wire::execute_document_comparison_wire_with_control(wire_json, &mut hook)
    } else {
        umf_core_wire::execute_document_comparison_wire(wire_json)
    }
}

#[wasm_bindgen(js_name = documentComparisonProfile)]
pub fn document_comparison_profile() -> String {
    umf_core_wire::DOCUMENT_COMPARISON_PROFILE.to_owned()
}

#[wasm_bindgen(js_name = executeAvroFieldsWire)]
pub fn execute_avro_fields_wire(wire_json: &str, control_dispatcher: Option<Function>) -> String {
    if let Some(dispatcher) = control_dispatcher {
        let mut control = WasmControl { dispatcher };
        let mut hook = |amount| control.check(amount);
        umf_core_wire::execute_avro_fields_wire_with_control(wire_json, &mut hook)
    } else {
        umf_core_wire::execute_avro_fields_wire(wire_json)
    }
}

#[wasm_bindgen(js_name = executeRecordTypeWire)]
pub fn execute_record_type_wire(wire_json: &str, control_dispatcher: Option<Function>) -> String {
    if let Some(dispatcher) = control_dispatcher {
        let mut control = WasmControl { dispatcher };
        let mut hook = |amount| control.check(amount);
        umf_core_wire::record_type_binding::execute_wire_with_control(wire_json, &mut hook)
    } else {
        umf_core_wire::record_type_binding::execute_wire(wire_json)
    }
}

#[wasm_bindgen(js_name = recordTypeBindingProfileVersion)]
pub fn record_type_binding_profile_version() -> String {
    umf_core_wire::record_type_binding::PROFILE.to_owned()
}

#[wasm_bindgen(js_name = avroFieldsProfileVersion)]
pub fn avro_fields_profile_version() -> String {
    umf_core_wire::AVRO_FIELDS_PROFILE.to_owned()
}

#[wasm_bindgen(js_name = executeJavascriptNumericWire)]
pub fn execute_javascript_numeric_wire(
    wire_json: &str,
    control_dispatcher: Option<Function>,
) -> String {
    if let Some(dispatcher) = control_dispatcher {
        let mut control = WasmControl { dispatcher };
        let mut hook = |amount| control.check(amount);
        umf_core_wire::execute_javascript_numeric_wire_with_control(wire_json, &mut hook)
    } else {
        umf_core_wire::execute_javascript_numeric_wire(wire_json)
    }
}

#[wasm_bindgen(js_name = executeSecurityLogicWire)]
pub fn execute_security_logic_wire(
    wire_json: &str,
    control_dispatcher: Option<Function>,
) -> String {
    if let Some(dispatcher) = control_dispatcher {
        let mut control = WasmControl { dispatcher };
        let mut hook = |amount| control.check(amount);
        umf_core_wire::security_logic_binding::execute_security_logic_wire_with_control(
            wire_json, &mut hook,
        )
    } else {
        umf_core_wire::security_logic_binding::execute_security_logic_wire(wire_json)
    }
}

#[wasm_bindgen(js_name = executeSecurityFunctionsWire)]
pub fn execute_security_functions_wire(wire_json: &str) -> String {
    umf_core_wire::security_functions_binding::execute_security_functions_wire(wire_json)
}

#[wasm_bindgen(js_name = executeSecurityProtectionSourceWire)]
pub fn execute_security_protection_source_wire(wire_json: &str) -> String {
    umf_core_wire::security_protection_source_binding::execute_security_protection_source_wire(
        wire_json,
    )
}

#[wasm_bindgen(js_name = executeSecurityQueryPropertiesWire)]
pub fn execute_security_query_properties_wire(wire_json: &str) -> String {
    umf_core_wire::security_queries_binding::execute_security_queries_wire(wire_json)
}

#[wasm_bindgen(js_name = executeSecurityProtectionParametersWire)]
pub fn execute_security_protection_parameters_wire(wire_json: &str) -> String {
    umf_core_wire::security_parameters_binding::execute_security_parameters_wire(wire_json)
}

#[wasm_bindgen(js_name = securityNotScalar)]
pub fn security_not_scalar(value: &str, control_dispatcher: Option<Function>) -> String {
    if let Some(dispatcher) = control_dispatcher {
        let mut control = WasmControl { dispatcher };
        let mut hook = |amount| control.check(amount);
        umf_core_wire::security_logic_binding::execute_security_not_scalar_with_control(
            value, &mut hook,
        )
    } else {
        umf_core_wire::security_logic_binding::execute_security_not_scalar(value)
    }
}

pub(crate) struct WasmControl {
    pub(crate) dispatcher: Function,
}

impl WasmControl {
    fn check(&mut self, amount: usize) -> Result<(), EngineError> {
        let output = self
            .dispatcher
            .call1(&JsValue::NULL, &JsValue::from_f64(amount as f64))
            .map_err(|_| {
                EngineError::new(
                    "HOST_CONTROL",
                    Utf16::default(),
                    "WASM host control bridge failed",
                )
            })?;
        let output = output.as_string().ok_or_else(|| {
            EngineError::new(
                "HOST_CONTROL",
                Utf16::default(),
                "WASM host control returned non-text data",
            )
        })?;
        if output.is_empty() {
            return Ok(());
        }
        let result = umf_core_wire::decode(&output, &mut umf_core_wire::transport_context())
            .map_err(|_| {
                EngineError::new(
                    "HOST_CONTROL",
                    Utf16::default(),
                    "Malformed WASM host control result",
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

struct WasmHostRead {
    dispatcher: Function,
    control_dispatcher: Option<Function>,
    transport_usage: TransportUsage,
}

impl umf_core_wire::PythonClientHostReadV3 for WasmHostRead {
    fn read(&mut self, event: &str, argument: Option<&str>) -> Result<Value, EngineError> {
        let descriptor_text = self.call_host_dispatcher(event, argument)?;
        let descriptor = umf_core_wire::host_response_frames::HostReadResponseDescriptor::parse(
            &descriptor_text,
        )
        .map_err(|_| {
            host_read_frame_error("WASM host-read dispatcher returned invalid descriptor")
        })?;
        let tokens = descriptor
            .tagged_wire_token_count()
            .map_err(|_| host_read_frame_error("WASM host-read response accounting overflowed"))?;
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
                    .map_err(|_| host_read_frame_error("WASM host-read array allocation failed"))?;
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
                            host_read_frame_error("WASM host-read array descriptor was invalid")
                        })?;
                    let umf_core_wire::host_response_frames::HostReadResponseDescriptor::String {
                        token,
                        units: item_units,
                    } = descriptor
                    else {
                        return Err(host_read_frame_error(
                            "WASM host-read array item was not a string",
                        ));
                    };
                    observed_units = observed_units.checked_add(item_units).ok_or_else(|| {
                        host_read_frame_error("WASM host-read array length overflowed")
                    })?;
                    if observed_units > units {
                        return Err(host_read_frame_error(
                            "WASM host-read array exceeded declared unit count",
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
                        "WASM host-read array length did not match descriptor",
                    ));
                }
                Value::Array(values)
            }
        };
        self.admit_host_response(value)
    }
}

impl WasmHostRead {
    fn call_host_dispatcher(
        &self,
        event: &str,
        argument: Option<&str>,
    ) -> Result<String, EngineError> {
        let event = JsValue::from_str(event);
        let argument = argument.map_or(JsValue::UNDEFINED, JsValue::from_str);
        let output = self
            .dispatcher
            .call2(&JsValue::NULL, &event, &argument)
            .map_err(|_| host_read_frame_error("WASM host-read bridge failed"))?;
        output
            .as_string()
            .ok_or_else(|| host_read_frame_error("WASM host-read descriptor was not a string"))
    }

    fn read_host_string(&self, token: u64, total_units: usize) -> Result<Utf16, EngineError> {
        use umf_core_wire::host_response_frames::HostReadStringFrames;
        let mut frames = HostReadStringFrames::new(token, total_units)
            .map_err(|_| host_read_frame_error("WASM host-read frame header was invalid"))?;
        while let Some((token, offset, maximum)) = frames.request() {
            let argument = format!("{token}:{offset}:{maximum}");
            let frame = self.call_host_value(HOST_READ_FRAME_EVENT, &argument)?;
            let frame = frame
                .as_string()
                .ok_or_else(|| host_read_frame_error("WASM host-read frame was not text"))?;
            frames
                .append_ascii_frame(&frame)
                .map_err(|_| host_read_frame_error("WASM host-read frame was invalid"))?;
        }
        frames
            .finish()
            .map_err(|_| host_read_frame_error("WASM host-read frames were incomplete"))
    }

    fn call_host_value(&self, event: &str, argument: &str) -> Result<JsValue, EngineError> {
        self.dispatcher
            .call2(
                &JsValue::NULL,
                &JsValue::from_str(event),
                &JsValue::from_str(argument),
            )
            .map_err(|_| host_read_frame_error("WASM host-read frame request failed"))
    }

    fn charge_host_response(&mut self, tokens: usize) -> Result<(), EngineError> {
        if let Some(dispatcher) = self.control_dispatcher.clone() {
            let mut control = WasmControl { dispatcher };
            let mut hook = |amount| control.check(amount);
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
        if let Some(dispatcher) = self.control_dispatcher.clone() {
            let mut control = WasmControl { dispatcher };
            let mut hook = |amount| control.check(amount);
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

pub(crate) struct WasmCapabilities {
    pub(crate) dispatcher: Function,
}

impl WasmCapabilities {
    fn dispatch(&mut self, token: u64, wire: &str) -> std::result::Result<Vec<Diagnostic>, Utf16> {
        let token = JsValue::from_f64(token as f64);
        let input = JsValue::from_str(&wire);
        let output = self
            .dispatcher
            .call2(&JsValue::NULL, &token, &input)
            .map_err(|_| Utf16::from("WASM callback bridge failed"))?;
        let output = output
            .as_string()
            .ok_or_else(|| Utf16::from("WASM callback bridge returned a non-text result"))?;
        let decoded = umf_core_wire::decode(&output, &mut umf_core_wire::transport_context())
            .map_err(|error| error.message)?;
        let ok = match value_field(&decoded, "ok") {
            Some(Value::Bool(value)) => *value,
            _ => return Err(Utf16::from("Malformed WASM callback result")),
        };
        if !ok {
            return Err(value_field(&decoded, "message")
                .and_then(value_text)
                .cloned()
                .unwrap_or_else(|| Utf16::from("WASM callback failed")));
        }
        let Some(Value::Array(items)) = value_field(&decoded, "diagnostics") else {
            return Err(Utf16::from("WASM callback diagnostics must be an array"));
        };
        items
            .iter()
            .map(|item| {
                let code = value_field(item, "code")
                    .and_then(value_text)
                    .cloned()
                    .ok_or_else(|| Utf16::from("WASM callback diagnostic code must be text"))?;
                let path = value_field(item, "path")
                    .and_then(value_text)
                    .cloned()
                    .ok_or_else(|| Utf16::from("WASM callback diagnostic path must be text"))?;
                let message = value_field(item, "message")
                    .and_then(value_text)
                    .cloned()
                    .ok_or_else(|| Utf16::from("WASM callback diagnostic message must be text"))?;
                let severity = match value_field(item, "severity")
                    .and_then(value_text)
                    .and_then(|value| value.to_utf8().ok())
                    .as_deref()
                {
                    Some("error") => Severity::Error,
                    Some("warning") => Severity::Warning,
                    _ => {
                        return Err(Utf16::from(
                            "WASM callback severity must be error or warning",
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

impl Capabilities for WasmCapabilities {
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

/// Exercise bounded schema recursion on actual wasm32 with the production
/// evaluator and ordinary resource profile. This exists only in the isolated
/// conformance build, not the shipped binding surface.
/// Opt-in owner for compiled codegen resources. The JS wrapper provides setup
/// and per-call controls independently; callbacks are never retained here.
#[wasm_bindgen(js_name = RetainedCodegenResourcesRuntime)]
pub struct RetainedCodegenResourcesRuntime {
    inner: Option<umf_core_wire::CodegenResourcesHandle>,
}

#[wasm_bindgen]
impl RetainedCodegenResourcesRuntime {
    #[wasm_bindgen(constructor)]
    pub fn new(setup_wire: String, setup_dispatcher: Option<Function>) -> Result<Self, JsValue> {
        let inner = if let Some(dispatcher) = setup_dispatcher {
            let mut control = WasmControl { dispatcher };
            let mut hook = |amount| control.check(amount);
            umf_core_wire::CodegenResourcesHandle::new_with_control(&setup_wire, &mut hook)
        } else {
            let mut no_control = |_amount| Ok(());
            umf_core_wire::CodegenResourcesHandle::new_with_control(&setup_wire, &mut no_control)
        }
        .map_err(|error| JsValue::from_str(&umf_core_wire::error_envelope(error)))?;
        Ok(Self { inner: Some(inner) })
    }

    #[wasm_bindgen(js_name = executeWire)]
    pub fn execute_wire(
        &self,
        request_wire: String,
        control_dispatcher: Option<Function>,
    ) -> String {
        if let Some(dispatcher) = control_dispatcher {
            let mut control = WasmControl { dispatcher };
            let mut hook = |amount| control.check(amount);
            self.inner.as_ref().map_or_else(
                || {
                    umf_core_wire::error_envelope(EngineError::new(
                        "RUST_CODEGEN_HANDLE_DISPOSED",
                        Utf16::default(),
                        "Retained codegen resources have been disposed",
                    ))
                },
                |inner| inner.execute_with_control(&request_wire, &mut hook),
            )
        } else {
            let mut no_control = |_amount| Ok(());
            self.inner.as_ref().map_or_else(
                || {
                    umf_core_wire::error_envelope(EngineError::new(
                        "RUST_CODEGEN_HANDLE_DISPOSED",
                        Utf16::default(),
                        "Retained codegen resources have been disposed",
                    ))
                },
                |inner| inner.execute_with_control(&request_wire, &mut no_control),
            )
        }
    }

    #[wasm_bindgen(js_name = executeHostReadV3Wire)]
    pub fn execute_host_read_v3_wire(
        &self,
        request_wire: String,
        dispatcher: Function,
        control_dispatcher: Option<Function>,
    ) -> String {
        let mut host = WasmHostRead {
            dispatcher,
            control_dispatcher: control_dispatcher.clone(),
            transport_usage: TransportUsage::default(),
        };
        if let Some(dispatcher) = control_dispatcher {
            let mut control = WasmControl { dispatcher };
            let mut hook = |amount| control.check(amount);
            self.inner.as_ref().map_or_else(
                || {
                    umf_core_wire::error_envelope(EngineError::new(
                        "RUST_CODEGEN_HANDLE_DISPOSED",
                        Utf16::default(),
                        "Retained codegen resources have been disposed",
                    ))
                },
                |inner| {
                    inner.execute_host_read_v3_with_control(&request_wire, &mut host, &mut hook)
                },
            )
        } else {
            let mut no_control = |_amount| Ok(());
            self.inner.as_ref().map_or_else(
                || {
                    umf_core_wire::error_envelope(EngineError::new(
                        "RUST_CODEGEN_HANDLE_DISPOSED",
                        Utf16::default(),
                        "Retained codegen resources have been disposed",
                    ))
                },
                |inner| {
                    inner.execute_host_read_v3_with_control(
                        &request_wire,
                        &mut host,
                        &mut no_control,
                    )
                },
            )
        }
    }
}

/// Opt-in owner for prepared Arrow schema grammar/resources. The JS wrapper
/// supplies setup and per-call controls independently.
#[wasm_bindgen(js_name = ArrowSchemaResourcesRuntime)]
pub struct ArrowSchemaResourcesRuntime {
    inner: Option<umf_core_wire::ArrowSchemaResourcesHandle>,
}

fn arrow_schema_disposed_error() -> EngineError {
    EngineError::new(
        "RUST_ARROW_SCHEMA_HANDLE_DISPOSED",
        Utf16::default(),
        "Arrow schema resources have been disposed",
    )
}

#[wasm_bindgen]
impl ArrowSchemaResourcesRuntime {
    #[wasm_bindgen(constructor)]
    pub fn new(setup_wire: String, setup_dispatcher: Option<Function>) -> Result<Self, JsValue> {
        let inner = if let Some(dispatcher) = setup_dispatcher {
            let mut control = WasmControl { dispatcher };
            let mut hook = |amount| control.check(amount);
            umf_core_wire::ArrowSchemaResourcesHandle::new_with_control(&setup_wire, &mut hook)
        } else {
            let mut no_control = |_amount| Ok(());
            umf_core_wire::ArrowSchemaResourcesHandle::new_with_control(
                &setup_wire,
                &mut no_control,
            )
        }
        .map_err(|error| JsValue::from_str(&umf_core_wire::error_envelope(error)))?;
        Ok(Self { inner: Some(inner) })
    }

    pub fn dispose(&mut self) {
        self.inner.take();
    }

    #[wasm_bindgen(js_name = executeWire)]
    pub fn execute_wire(
        &self,
        request_wire: String,
        control_dispatcher: Option<Function>,
    ) -> String {
        if let Some(dispatcher) = control_dispatcher {
            let mut control = WasmControl { dispatcher };
            let mut hook = |amount| control.check(amount);
            self.inner.as_ref().map_or_else(
                || umf_core_wire::error_envelope(arrow_schema_disposed_error()),
                |inner| inner.execute_with_control(&request_wire, &mut hook),
            )
        } else {
            let mut no_control = |_amount| Ok(());
            self.inner.as_ref().map_or_else(
                || umf_core_wire::error_envelope(arrow_schema_disposed_error()),
                |inner| inner.execute_with_control(&request_wire, &mut no_control),
            )
        }
    }
}

#[cfg(feature = "conformance")]
#[wasm_bindgen(js_name = schemaDepthProbe)]
pub fn schema_depth_probe() -> String {
    use umf_core::{
        PyText, PythonConsumerValue as Py, PythonReVersion, PythonSchemaEvaluationMode,
        PythonSchemaResources,
    };

    fn chain(mut value: Value, nodes: usize) -> Value {
        for _ in 1..nodes {
            value = Value::Object(vec![(Utf16::from("child"), value)]);
        }
        value
    }
    fn pytext(text: &str) -> Py {
        Py::String(PyText::from_utf8(text))
    }
    fn pyobject(members: Vec<(&str, Py)>) -> Py {
        Py::Object(
            members
                .into_iter()
                .map(|(key, value)| (PyText::from_utf8(key), value))
                .collect(),
        )
    }

    let schema_source = r##"{"type":"object","properties":{"child":{"$ref":"#/$defs/node"}},"$defs":{"node":{"type":"object","properties":{"child":{"$ref":"#/$defs/node"}}}}}"##;
    let mut parse_ctx = Context::ordinary();
    let schema_value = match umf_core::serialization::read_json_value(
        &schema_source.encode_utf16().collect::<Vec<_>>(),
        umf_core::serialization::Format::Json,
        &mut parse_ctx,
    ) {
        Ok(schema) => schema,
        Err(_) => return "schema-parse-error".to_owned(),
    };
    let compiled = match umf_core::schema::CompiledSchema::compile(
        &schema_value,
        &umf_core::schema::SchemaResources::default(),
        &mut Context::ordinary(),
    ) {
        Ok(schema) => schema,
        Err(_) => return "core-schema-compile-error".to_owned(),
    };
    let core_accepts_128 = compiled
        .validate(
            &chain(Value::Object(Vec::new()), 65),
            &mut Context::ordinary(),
        )
        .is_ok_and(|errors| errors.is_empty());
    let core_refuses_129 = compiled
        .validate(
            &chain(Value::Object(Vec::new()), 66),
            &mut Context::ordinary(),
        )
        .is_err_and(|error| error.code == "LIMIT");

    let recursive_ref = || pyobject(vec![("$ref", pytext("#/$defs/node"))]);
    let node = pyobject(vec![
        ("type", pytext("object")),
        ("properties", pyobject(vec![("child", recursive_ref())])),
    ]);
    let python_schema = pyobject(vec![
        (
            "$schema",
            pytext("https://json-schema.org/draft/2020-12/schema"),
        ),
        ("type", pytext("object")),
        ("properties", pyobject(vec![("child", recursive_ref())])),
        ("$defs", pyobject(vec![("node", node)])),
    ]);
    let python_compiled = match umf_core::schema::CompiledSchema::compile_python_source(
        &python_schema,
        &PythonSchemaResources::default(),
        false,
        PythonReVersion::V3_11,
        &mut Context::ordinary(),
    ) {
        Ok(schema) => schema,
        Err(_) => return "python-schema-compile-error".to_owned(),
    };
    let py_chain = |nodes| {
        let mut value = pyobject(Vec::new());
        for _ in 1..nodes {
            value = pyobject(vec![("child", value)]);
        }
        value
    };
    let python_accepts_128 = python_compiled
        .evaluate(
            &py_chain(65),
            PythonSchemaEvaluationMode::FirstError,
            &mut Context::ordinary(),
        )
        .is_ok_and(|result| result.errors.is_empty());
    let python_refuses_129 = python_compiled
        .evaluate(
            &py_chain(66),
            PythonSchemaEvaluationMode::FirstError,
            &mut Context::ordinary(),
        )
        .is_err_and(|error| error.code == "LIMIT");

    // Also enter the dedicated annotation visitor at every recursive node.
    // This is separate from the ordinary property/reference recursion above.
    let annotated_node = pyobject(vec![
        ("type", pytext("object")),
        ("properties", pyobject(vec![("child", recursive_ref())])),
        ("unevaluatedProperties", Py::Bool(false)),
    ]);
    let annotated_schema = pyobject(vec![
        (
            "$schema",
            pytext("https://json-schema.org/draft/2020-12/schema"),
        ),
        ("type", pytext("object")),
        ("properties", pyobject(vec![("child", recursive_ref())])),
        ("unevaluatedProperties", Py::Bool(false)),
        ("$defs", pyobject(vec![("node", annotated_node)])),
    ]);
    let annotated_compiled = match umf_core::schema::CompiledSchema::compile_python_source(
        &annotated_schema,
        &PythonSchemaResources::default(),
        false,
        PythonReVersion::V3_11,
        &mut Context::ordinary(),
    ) {
        Ok(schema) => schema,
        Err(_) => return "annotated-schema-compile-error".to_owned(),
    };
    let annotated_accepts_128 = annotated_compiled
        .evaluate(
            &py_chain(65),
            PythonSchemaEvaluationMode::FirstError,
            &mut Context::ordinary(),
        )
        .is_ok_and(|result| result.errors.is_empty() && result.terminal_error.is_none());
    let annotated_refuses_129 = annotated_compiled
        .evaluate(
            &py_chain(66),
            PythonSchemaEvaluationMode::FirstError,
            &mut Context::ordinary(),
        )
        .is_err_and(|error| error.code == "LIMIT");

    if core_accepts_128
        && core_refuses_129
        && python_accepts_128
        && python_refuses_129
        && annotated_accepts_128
        && annotated_refuses_129
    {
        "pass".to_owned()
    } else {
        format!(
            "failed:core128={core_accepts_128},core129={core_refuses_129},python128={python_accepts_128},python129={python_refuses_129},annotation128={annotated_accepts_128},annotation129={annotated_refuses_129}"
        )
    }
}
