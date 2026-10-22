use js_sys::Function;
use umf_core::{
    Capabilities, CapabilityError, Context, Diagnostic, EngineError, ResourceProfile,
    SemanticContext, Severity, Utf16, Value,
};
use wasm_bindgen::prelude::*;

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
    format!("{{\"charged\":\"{charged}\",\"chunks\":{chunks:?},\"refused\":{refused},\"refusalCalls\":{calls}}}")
}

#[wasm_bindgen(js_name = copyJsonWire)]
pub fn copy_json_wire(wire_json: &str) -> Result<String, JsValue> {
    Ok(umf_core_wire::copy_wire_envelope(wire_json))
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
            ))
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

struct WasmControl {
    dispatcher: Function,
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

struct WasmCapabilities {
    dispatcher: Function,
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
                        ))
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
