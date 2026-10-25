use std::{cell::RefCell, collections::HashMap, rc::Rc};

use num_bigint::BigInt;
use pyo3::{
    exceptions::PyValueError,
    prelude::*,
    types::{PyBool, PyBytes, PyDict, PyFloat, PyInt, PyList, PyString, PyTuple},
};
use umf_core::{
    Capabilities, CapabilityError, Context, Diagnostic, Engine, EngineError, PythonDiagnosticText,
    Registry, ResourceSet, SemanticContext, Severity, Utf16, Value,
};
use umf_core::{
    PythonCompiledSchema, PythonConsumerValue, PythonSchemaPathSegment, PythonSchemaResources,
};

mod python_value;
mod related_keys;

fn semantic_field<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    let Value::Object(fields) = value else {
        return None;
    };
    fields
        .iter()
        .find(|(key, _)| key == &Utf16::from(name))
        .map(|(_, value)| value)
}

struct PythonSemanticTypeValidator<'py> {
    py: Python<'py>,
    dispatcher: PyObject,
}
impl umf_core::core_semantic_types::SemanticTypeValidator for PythonSemanticTypeValidator<'_> {
    fn validate(
        &mut self,
        token: u64,
        value: &Value,
        definition: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, CapabilityError> {
        let request = umf_core_wire::encode_semantic_validator_request(value, definition, ctx)
            .map_err(CapabilityError::Engine)?;
        let response = self
            .dispatcher
            .bind(self.py)
            .call1((token, request))
            .map_err(|error| capability_py_error(self.py, error, ctx))?;
        let response: String = response
            .extract()
            .map_err(|error| capability_py_error(self.py, error, ctx))?;
        let response = umf_core_wire::decode(&response, ctx).map_err(CapabilityError::Engine)?;
        let reported = match semantic_field(&response, "reportedWork") {
            Some(Value::Number(number))
                if number.is_finite()
                    && *number >= 0.0
                    && number.fract() == 0.0
                    && *number <= 9_007_199_254_740_991.0 =>
            {
                *number as usize
            }
            _ => {
                return Err(CapabilityError::Engine(EngineError::new(
                    "HOST_CONTROL",
                    Utf16::default(),
                    "Invalid semantic validator reported work",
                )));
            }
        };
        ctx.charge_work(reported, Utf16::default())
            .map_err(CapabilityError::Engine)?;
        let status = match semantic_field(&response, "status") {
            Some(Value::String(text)) => text.to_utf8().ok(),
            _ => None,
        };
        match status.as_deref() {
            Some("returned") => semantic_field(&response, "result")
                .cloned()
                .ok_or_else(|| CapabilityError::Host(Utf16::from("Value is not JSON-compatible"))),
            Some("threw") => Err(CapabilityError::Host(
                match semantic_field(&response, "message") {
                    Some(Value::String(text)) => text.clone(),
                    _ => Utf16::default(),
                },
            )),
            Some("resource") => {
                let code = match semantic_field(&response, "code") {
                    Some(Value::String(text)) => text
                        .to_utf8()
                        .unwrap_or_else(|_| "RESOURCE_LIMIT".to_owned()),
                    _ => "RESOURCE_LIMIT".to_owned(),
                };
                let message = match semantic_field(&response, "message") {
                    Some(Value::String(text)) => text.to_utf8().unwrap_or_default(),
                    _ => String::new(),
                };
                Err(CapabilityError::Engine(EngineError::new(
                    code,
                    Utf16::default(),
                    message,
                )))
            }
            _ => Err(CapabilityError::Host(Utf16::from(
                "Malformed semantic validator response",
            ))),
        }
    }
}

#[pyfunction]
#[pyo3(signature = (wire_json, dispatcher, *, max_work=None, meter=None, is_cancelled=None, now=None, deadline_ms=None))]
fn execute_semantic_value_wire(
    py: Python<'_>,
    wire_json: &str,
    dispatcher: PyObject,
    max_work: Option<usize>,
    meter: Option<PyObject>,
    is_cancelled: Option<PyObject>,
    now: Option<PyObject>,
    deadline_ms: Option<u64>,
) -> PyResult<String> {
    for (name, callback) in [
        ("dispatcher", Some(&dispatcher)),
        ("meter", meter.as_ref()),
        ("is_cancelled", is_cancelled.as_ref()),
        ("now", now.as_ref()),
    ] {
        if callback.is_some_and(|value| !value.bind(py).is_callable()) {
            return Err(PyValueError::new_err(format!("{name} must be callable")));
        }
    }
    if deadline_ms.is_some() && now.is_none() {
        return Err(PyValueError::new_err("now is required with deadline_ms"));
    }
    let state = Rc::new(RefCell::new(PythonWorkControl {
        py,
        max_work,
        charged: 0,
        meter,
        is_cancelled,
        now,
        host_callback_failed: false,
    }));
    let mut meter_hook = {
        let state = state.clone();
        move |amount| state.borrow_mut().meter(amount)
    };
    let mut cancel_hook = {
        let state = state.clone();
        move || state.borrow_mut().cancelled()
    };
    let mut clock_hook = {
        let state = state.clone();
        move || state.borrow_mut().clock()
    };
    let mut ctx = Context::ordinary();
    if max_work.is_some() || state.borrow().meter.is_some() {
        ctx = ctx.with_meter(&mut meter_hook);
    }
    if state.borrow().is_cancelled.is_some() {
        ctx = ctx.with_fallible_cancellation(&mut cancel_hook);
    }
    if let Some(deadline) = deadline_ms {
        ctx = ctx.with_fallible_clock(&mut clock_hook, deadline);
    }
    let mut validator = PythonSemanticTypeValidator { py, dispatcher };
    Ok(umf_core_wire::semantic_value::execute_with_context(
        wire_json,
        &mut validator,
        &mut ctx,
    ))
}

fn python_bigint(
    py: Python<'_>,
    value: &Bound<'_, PyAny>,
    context: &mut Context<'_>,
) -> PyResult<BigInt> {
    if !value.is_exact_instance_of::<PyInt>() {
        return Err(PyValueError::new_err("integer metadata required"));
    }
    let bits: usize = value
        .call_method0("bit_length")?
        .extract()
        .map_err(|_| PyValueError::new_err("integer metadata cannot be represented"))?;
    context
        .charge_work(bits.saturating_add(1), Utf16::default())
        .map_err(py_error)?;
    let byte_len = bits
        .saturating_add(8)
        .checked_div(8)
        .unwrap_or(usize::MAX)
        .max(1);
    let kwargs = PyDict::new_bound(py);
    kwargs.set_item("signed", true)?;
    let bytes = value
        .call_method("to_bytes", (byte_len, "little"), Some(&kwargs))?
        .downcast_into::<PyBytes>()?;
    Ok(BigInt::from_signed_bytes_le(bytes.as_bytes()))
}
#[pyfunction]
fn access_values_profile_version() -> &'static str {
    "umf-access-values/0.1.0"
}

#[pyfunction]
fn access_values_string_profile_version() -> &'static str {
    "umf-access-string/0.1.0"
}

#[pyclass(name = "ReviewedParameterScanner")]
struct PyReviewedParameterScanner {
    scanner: umf_core::reviewed_parameters::Scanner,
}

fn reviewed_scanner_error(error: umf_core::reviewed_parameters::Error) -> PyErr {
    match error {
        umf_core::reviewed_parameters::Error::Allocation => {
            pyo3::exceptions::PyMemoryError::new_err("reviewed SQL ordinal allocation failed")
        }
        _ => PyValueError::new_err("reviewed scanner protocol error"),
    }
}

#[pymethods]
impl PyReviewedParameterScanner {
    #[new]
    fn new(py: Python<'_>, sql: &Bound<'_, PyString>) -> PyResult<Self> {
        let length = unsafe { pyo3::ffi::PyUnicode_GetLength(sql.as_ptr()) };
        if length < 0 {
            return Err(PyErr::fetch(py));
        }
        let length = length as usize;
        if length > isize::MAX as usize / std::mem::size_of::<u32>() {
            return Err(pyo3::exceptions::PyMemoryError::new_err(
                "reviewed SQL exceeds Rust scanner capacity",
            ));
        }
        let mut codepoints = Vec::new();
        codepoints.try_reserve_exact(length).map_err(|_| {
            pyo3::exceptions::PyMemoryError::new_err("reviewed SQL scanner allocation failed")
        })?;
        for index in 0..length {
            let codepoint = unsafe { pyo3::ffi::PyUnicode_ReadChar(sql.as_ptr(), index as isize) };
            if codepoint == u32::MAX {
                if PyErr::occurred(py) {
                    return Err(PyErr::fetch(py));
                }
                return Err(PyValueError::new_err("invalid CPython code point"));
            }
            codepoints.push(codepoint);
        }
        let scanner = umf_core::reviewed_parameters::Scanner::new(codepoints)
            .map_err(|_| PyValueError::new_err("invalid CPython code-point vector"))?;
        Ok(Self { scanner })
    }

    #[pyo3(signature = (python_isalnum=None))]
    fn next(&mut self, py: Python<'_>, python_isalnum: Option<bool>) -> PyResult<Py<PyDict>> {
        use umf_core::reviewed_parameters::Event;
        let event = self.scanner.next(python_isalnum);
        let dict = PyDict::new_bound(py);
        match event {
            Ok(Event::NeedPythonIsAlnum { index }) => {
                dict.set_item("kind", "need_python_isalnum")?;
                dict.set_item("index", index)?;
            }
            Ok(Event::Placeholder { start, end, digits }) => {
                dict.set_item("kind", "placeholder")?;
                dict.set_item("start", start)?;
                dict.set_item("end", end)?;
                dict.set_item("digits", digits)?;
            }
            Ok(Event::Done) => dict.set_item("kind", "done")?,
            Err(error) if error.python_code().is_some() => {
                dict.set_item("kind", "error")?;
                dict.set_item("code", error.python_code())?;
                dict.set_item("message", error.python_message())?;
            }
            Err(error) => return Err(reviewed_scanner_error(error)),
        }
        Ok(dict.unbind())
    }
}

#[pyfunction]
fn access_reviewed_parameter_profile_version() -> &'static str {
    "umf-access-reviewed-transport/0.1.0"
}

#[pyfunction]
fn access_values_validate_string(py: Python<'_>, value: &Bound<'_, PyAny>) -> PyResult<bool> {
    if !value.is_exact_instance_of::<PyString>() {
        return Err(PyValueError::new_err("string carrier required"));
    }
    let string = value
        .downcast::<PyString>()
        .map_err(|_| PyValueError::new_err("string carrier required"))?;
    let length = unsafe { pyo3::ffi::PyUnicode_GetLength(string.as_ptr()) };
    if length < 0 {
        return Err(PyErr::fetch(py));
    }
    let mut index = 0;
    // The exact string is immutable and `index` stays within the length just
    // returned by CPython, so ReadChar has no expected failure case here. Keep
    // the sentinel/PyErr check in case the C API nevertheless reports one.
    let codepoints = std::iter::from_fn(|| {
        if index >= length {
            return None;
        }
        let codepoint = unsafe { pyo3::ffi::PyUnicode_ReadChar(string.as_ptr(), index) };
        index += 1;
        if codepoint == u32::MAX && PyErr::occurred(py) {
            index = length;
        }
        Some(codepoint)
    });
    let mut context = Context::ordinary();
    let valid = umf_core::access_values::validate_unicode_scalar_stream(codepoints, &mut context)
        .map_err(py_error)?;
    if PyErr::occurred(py) {
        return Err(PyErr::fetch(py));
    }
    Ok(valid)
}

#[pyfunction]
fn operation_values_profile_version() -> &'static str {
    umf_core::operation_values::PROFILE_VERSION
}

#[pyfunction]
fn avro_fields_profile_version() -> &'static str {
    "umf-r5-avro-fields/0.1.0"
}

#[pyfunction]
fn iceberg_schema_profile_version() -> &'static str {
    umf_core_wire::ICEBERG_SCHEMA_PROFILE
}

#[pyfunction]
#[pyo3(signature = (wire_json, control=None))]
fn execute_iceberg_wire(
    py: Python<'_>,
    wire_json: &str,
    control: Option<PyObject>,
) -> PyResult<String> {
    if control
        .as_ref()
        .is_some_and(|value| !value.bind(py).is_callable())
    {
        return Err(PyValueError::new_err("control must be callable"));
    }
    let Some(control) = control else {
        return Ok(umf_core_wire::execute_iceberg_wire(wire_json));
    };
    let mut hook = |amount: usize| {
        let outcome = control
            .bind(py)
            .call1((amount,))
            .map_err(|error| py_exception_engine_error(py, "METER_FAILURE", error))?;
        if outcome.is_none() {
            return Ok(());
        }
        let (code, message, path): (String, String, String) = outcome
            .extract()
            .map_err(|error| py_exception_engine_error(py, "METER_FAILURE", error))?;
        let mut error = EngineError::new(code, Utf16::from(path), Utf16::from(message));
        error.python_message_origin = None;
        Err(error)
    };
    Ok(umf_core_wire::execute_iceberg_wire_with_control(
        wire_json, &mut hook,
    ))
}

#[pyfunction]
fn protobuf_inspect_profile_version() -> &'static str {
    umf_core_wire::PROTOBUF_INSPECT_PROFILE
}

#[pyfunction]
fn avro_inspect_profile_version() -> &'static str {
    umf_core_wire::AVRO_INSPECT_PROFILE
}

#[pyfunction]
fn avro_candidate_profile_version() -> &'static str {
    umf_core_wire::AVRO_CANDIDATE_PROFILE
}

#[pyfunction]
#[pyo3(signature = (wire_json, control=None))]
fn execute_avro_inspect_wire(
    py: Python<'_>,
    wire_json: &str,
    control: Option<PyObject>,
) -> PyResult<String> {
    if control
        .as_ref()
        .is_some_and(|value| !value.bind(py).is_callable())
    {
        return Err(PyValueError::new_err("control must be callable"));
    }
    let Some(control) = control else {
        return Ok(umf_core_wire::execute_avro_inspect_wire(wire_json));
    };
    let mut hook = |amount: usize| {
        let outcome = control
            .bind(py)
            .call1((amount,))
            .map_err(|error| py_exception_engine_error(py, "METER_FAILURE", error))?;
        if outcome.is_none() {
            return Ok(());
        }
        let (code, message, path): (String, String, String) = outcome
            .extract()
            .map_err(|error| py_exception_engine_error(py, "METER_FAILURE", error))?;
        let mut error = EngineError::new(code, Utf16::from(path), Utf16::from(message));
        error.python_message_origin = None;
        Err(error)
    };
    Ok(umf_core_wire::execute_avro_inspect_wire_with_control(
        wire_json, &mut hook,
    ))
}

#[pyfunction]
#[pyo3(signature = (wire_json, control=None))]
fn execute_avro_candidate_wire(
    py: Python<'_>,
    wire_json: &str,
    control: Option<PyObject>,
) -> PyResult<String> {
    if control
        .as_ref()
        .is_some_and(|value| !value.bind(py).is_callable())
    {
        return Err(PyValueError::new_err("control must be callable"));
    }
    let Some(control) = control else {
        return Ok(umf_core_wire::execute_avro_candidate_wire(wire_json));
    };
    let mut hook = |amount: usize| {
        let outcome = control
            .bind(py)
            .call1((amount,))
            .map_err(|error| py_exception_engine_error(py, "METER_FAILURE", error))?;
        if outcome.is_none() {
            return Ok(());
        }
        let (code, message, path): (String, String, String) = outcome
            .extract()
            .map_err(|error| py_exception_engine_error(py, "METER_FAILURE", error))?;
        let mut error = EngineError::new(code, Utf16::from(path), Utf16::from(message));
        error.python_message_origin = None;
        Err(error)
    };
    Ok(umf_core_wire::execute_avro_candidate_wire_with_control(
        wire_json, &mut hook,
    ))
}

#[pyfunction]
fn json_schema_profile_version() -> &'static str {
    umf_core_wire::JSON_SCHEMA_PROFILE
}

#[pyfunction]
#[pyo3(signature = (wire_json, control=None))]
fn execute_json_schema_wire(
    py: Python<'_>,
    wire_json: &str,
    control: Option<PyObject>,
) -> PyResult<String> {
    if control
        .as_ref()
        .is_some_and(|value| !value.bind(py).is_callable())
    {
        return Err(PyValueError::new_err("control must be callable"));
    }
    let Some(control) = control else {
        return Ok(umf_core_wire::execute_json_schema_wire(wire_json));
    };
    let mut hook = |amount: usize| {
        let outcome = control
            .bind(py)
            .call1((amount,))
            .map_err(|error| py_exception_engine_error(py, "METER_FAILURE", error))?;
        if outcome.is_none() {
            return Ok(());
        }
        let (code, message, path): (String, String, String) = outcome
            .extract()
            .map_err(|error| py_exception_engine_error(py, "METER_FAILURE", error))?;
        let mut error = EngineError::new(code, Utf16::from(path), Utf16::from(message));
        error.python_message_origin = None;
        Err(error)
    };
    Ok(umf_core_wire::execute_json_schema_wire_with_control(
        wire_json, &mut hook,
    ))
}

#[pyfunction]
#[pyo3(signature = (wire_json, control=None))]
fn execute_protobuf_inspect_wire(
    py: Python<'_>,
    wire_json: &str,
    control: Option<PyObject>,
) -> PyResult<String> {
    if control
        .as_ref()
        .is_some_and(|value| !value.bind(py).is_callable())
    {
        return Err(PyValueError::new_err("control must be callable"));
    }
    let Some(control) = control else {
        return Ok(umf_core_wire::execute_protobuf_inspect_wire(wire_json));
    };
    let mut hook = |amount: usize| {
        let outcome = control
            .bind(py)
            .call1((amount,))
            .map_err(|error| py_exception_engine_error(py, "METER_FAILURE", error))?;
        if outcome.is_none() {
            return Ok(());
        }
        let (code, message, path): (String, String, String) = outcome
            .extract()
            .map_err(|error| py_exception_engine_error(py, "METER_FAILURE", error))?;
        let mut error = EngineError::new(code, Utf16::from(path), Utf16::from(message));
        error.python_message_origin = None;
        Err(error)
    };
    Ok(umf_core_wire::execute_protobuf_inspect_wire_with_control(
        wire_json, &mut hook,
    ))
}

#[pyfunction]
#[pyo3(signature = (root, dependencies=None, *, max_work=None, meter=None, is_cancelled=None, now=None, deadline_ms=None))]
fn avro_fields_derive(
    py: Python<'_>,
    root: &Bound<'_, PyAny>,
    dependencies: Option<&Bound<'_, PyAny>>,
    max_work: Option<usize>,
    meter: Option<PyObject>,
    is_cancelled: Option<PyObject>,
    now: Option<PyObject>,
    deadline_ms: Option<u64>,
) -> PyResult<PyObject> {
    let empty_dependencies = PyTuple::empty_bound(py);
    let dependencies = dependencies.unwrap_or(empty_dependencies.as_any());
    for (name, callback) in [
        ("meter", meter.as_ref()),
        ("is_cancelled", is_cancelled.as_ref()),
        ("now", now.as_ref()),
    ] {
        if callback.is_some_and(|value| !value.bind(py).is_callable()) {
            return Err(PyValueError::new_err(format!("{name} must be callable")));
        }
    }
    if deadline_ms.is_some() && now.is_none() {
        return Err(PyValueError::new_err("now is required with deadline_ms"));
    }
    if !dependencies.is_exact_instance_of::<PyList>()
        && !dependencies.is_exact_instance_of::<PyTuple>()
    {
        return Err(PyValueError::new_err(
            "dependencies must be a list or tuple",
        ));
    }

    let hook_meter = max_work.is_some() || meter.is_some();
    let hook_cancel = is_cancelled.is_some();
    let hook_clock = deadline_ms.is_some();
    let state = Rc::new(RefCell::new(PythonWorkControl {
        py,
        max_work,
        charged: 0,
        meter,
        is_cancelled,
        now,
        host_callback_failed: false,
    }));
    let mut meter_hook = {
        let state = state.clone();
        move |amount| state.borrow_mut().meter(amount)
    };
    let mut cancel_hook = {
        let state = state.clone();
        move || state.borrow_mut().cancelled()
    };
    let mut clock_hook = {
        let state = state.clone();
        move || state.borrow_mut().clock()
    };
    let mut context = Context::ordinary();
    if hook_meter {
        context = context.with_meter(&mut meter_hook);
    }
    if hook_cancel {
        context = context.with_fallible_cancellation(&mut cancel_hook);
    }
    if hook_clock {
        context = context.with_fallible_clock(
            &mut clock_hook,
            deadline_ms.expect("deadline requires clock"),
        );
    }

    let admit_tree = |value: &Bound<'_, PyAny>,
                      context: &mut Context<'_>|
     -> PyResult<umf_core::native_json::NativeJsonTree> {
        let mut count = 0;
        let value = python_value::from_python(py, value, context, 0, &mut count)
            .map_err(py_error)?
            .project_schema_to_core(context)
            .map_err(py_error)?;
        umf_core::native_json::NativeJsonTree::from_tagged_value(&value, context).map_err(py_error)
    };

    let root = admit_tree(root, &mut context)?;
    let mut dependency_ids = Vec::new();
    let mut dependency_trees = Vec::new();
    for dependency in dependencies.try_iter()? {
        let dependency = dependency?;
        let pair = if dependency.is_exact_instance_of::<PyTuple>() {
            dependency.downcast::<PyTuple>()?
        } else {
            return Err(PyValueError::new_err(
                "each dependency must be an exact (id, tagged_tree) tuple",
            ));
        };
        if pair.len() != 2 || !pair.get_item(0)?.is_exact_instance_of::<PyString>() {
            return Err(PyValueError::new_err(
                "each dependency must be an exact (string_id, tagged_tree) tuple",
            ));
        }
        let id_text =
            python_value::pytext_from_python(&pair.get_item(0)?, &mut context).map_err(py_error)?;
        // `to_utf16` charges the complete UTF-16 length before allocating its
        // unit vector. The preceding Python-text admission is also charged
        // before its host-string conversion, so oversized IDs cannot bypass
        // the invocation meter, budget, cancellation, or deadline checks.
        dependency_ids.push(id_text.to_utf16(&mut context).map_err(py_error)?);
        dependency_trees.push(admit_tree(&pair.get_item(1)?, &mut context)?);
    }
    let dependencies = dependency_ids
        .iter()
        .zip(&dependency_trees)
        .map(|(id, root)| umf_core::avro_fields::AvroDependency { id, root })
        .collect::<Vec<_>>();
    let fields = umf_core::avro_fields::derive_avro_fields(&root, &dependencies, &mut context)
        .map_err(py_error)?;

    let output = PyList::empty_bound(py);
    for field in fields {
        let item = PyDict::new_bound(py);
        item.set_item("path", py_text(py, &field.path, &mut context)?)?;
        item.set_item("record", py_text(py, &field.record, &mut context)?)?;
        if let Some(id) = &field.dependency_id {
            item.set_item("dependencyId", py_text(py, id, &mut context)?)?;
        }
        let native = field
            .native_field
            .tagged_value_preserving_extras(&mut context)
            .map_err(py_error)?;
        item.set_item(
            "nativeField",
            descriptor_value_to_python(py, &native, &mut context)?,
        )?;
        let element = PyDict::new_bound(py);
        element.set_item(
            "id",
            field
                .element_id
                .to_utf8()
                .map_err(|_| PyValueError::new_err("Avro element identifier is not valid UTF-8"))?,
        )?;
        element.set_item("name", py_text(py, &field.name, &mut context)?)?;
        if let Some(description) = &field.description {
            element.set_item("description", py_text(py, description, &mut context)?)?;
        }
        if let Some(scalar_type) = field.scalar_type {
            element.set_item("scalarType", scalar_type.as_str())?;
        }
        element.set_item("extensions", PyDict::new_bound(py))?;
        item.set_item("element", element)?;
        output.append(item)?;
    }
    Ok(output.unbind().into())
}

// R6 outcome-values shard. Python owns preimage construction and call ordering;
// these bindings accept bytes only and never retain secret material.
#[pyfunction]
fn outcome_values_profile_version() -> &'static str {
    umf_core::outcome_values::PROFILE_VERSION
}

#[pyfunction]
fn outcome_values_capabilities() -> Vec<&'static str> {
    umf_core::outcome_values::CAPABILITIES.to_vec()
}

#[pyfunction]
fn outcome_values_hmac_sha256(
    secret: &Bound<'_, PyBytes>,
    message: &Bound<'_, PyBytes>,
) -> Vec<u8> {
    umf_core::outcome_values::hmac_sha256(secret.as_bytes(), message.as_bytes()).to_vec()
}

#[pyfunction]
fn outcome_values_slot_sha256(message: &Bound<'_, PyBytes>) -> Vec<u8> {
    umf_core::outcome_values::slot_sha256(message.as_bytes()).to_vec()
}

#[pyfunction]
fn outcome_values_signature_matches(
    left: &Bound<'_, PyBytes>,
    right: &Bound<'_, PyBytes>,
) -> PyResult<bool> {
    let left: [u8; 32] = left
        .as_bytes()
        .try_into()
        .map_err(|_| PyValueError::new_err("outcome signature must be 32 bytes"))?;
    let right: [u8; 32] = right
        .as_bytes()
        .try_into()
        .map_err(|_| PyValueError::new_err("outcome signature must be 32 bytes"))?;
    Ok(umf_core::outcome_values::signature_matches(&left, &right))
}

#[pyfunction]
fn operation_canonical(json_text: &str) -> PyResult<String> {
    umf_core::operation_values::canonical(json_text)
        .map_err(|e| PyValueError::new_err(e.to_string()))
}

fn operation_python_node(
    value: &Bound<'_, PyAny>,
    limit: usize,
    depth: usize,
    lower_bound: &mut usize,
) -> PyResult<umf_core::native_json::NativeJsonNode> {
    use umf_core::{native_json::NativeJsonNode as Node, value::Utf16};

    if depth > 128 {
        return Err(PyValueError::new_err("native wire frame bound exceeded"));
    }
    let add_lower = |amount: usize, total: &mut usize| -> PyResult<()> {
        *total = total.saturating_add(amount);
        if *total > limit {
            return Err(PyValueError::new_err("native wire frame bound exceeded"));
        }
        Ok(())
    };
    if value.is_none() {
        add_lower(4, lower_bound)?;
        return Ok(Node::Null);
    }
    if value.is_exact_instance_of::<PyBool>() {
        let item = value.extract::<bool>()?;
        add_lower(if item { 4 } else { 5 }, lower_bound)?;
        return Ok(Node::Boolean(item));
    }
    if value.is_exact_instance_of::<PyInt>() {
        let bits: usize = value.call_method0("bit_length")?.extract()?;
        add_lower(bits / 4, lower_bound)?;
        let token: String = value.str()?.extract()?;
        add_lower(token.len().saturating_sub(bits / 4), lower_bound)?;
        return Ok(Node::Number(token));
    }
    if value.is_exact_instance_of::<PyFloat>() {
        let number = value.extract::<f64>()?;
        if !number.is_finite() {
            return Err(PyValueError::new_err("invalid operation JSON"));
        }
        let token: String = value.str()?.extract()?;
        add_lower(token.len(), lower_bound)?;
        return Ok(Node::Number(token));
    }
    if value.is_exact_instance_of::<pyo3::types::PyString>() {
        let chars: usize = value.len()?;
        add_lower(chars.saturating_add(2), lower_bound)?;
        let text: String = value.extract()?;
        return Ok(Node::String(Utf16::from_utf8(&text)));
    }
    if value.is_exact_instance_of::<PyList>() || value.is_exact_instance_of::<PyTuple>() {
        let length = if value.is_exact_instance_of::<PyList>() {
            value.downcast::<PyList>()?.len()
        } else {
            value.downcast::<PyTuple>()?.len()
        };
        add_lower(length.saturating_sub(1) + 2, lower_bound)?;
        let mut result = Vec::with_capacity(length.min(limit));
        for item in value.try_iter()? {
            let item = item?;
            result.push(operation_python_node(&item, limit, depth + 1, lower_bound)?);
        }
        return Ok(Node::Array(result));
    }
    if value.is_exact_instance_of::<PyDict>() {
        let dict = value.downcast::<PyDict>()?;
        add_lower(dict.len().saturating_sub(1) + 2, lower_bound)?;
        let mut result = Vec::with_capacity(dict.len().min(limit));
        for (key, item) in dict.iter() {
            if !key.is_exact_instance_of::<pyo3::types::PyString>() {
                return Err(PyValueError::new_err("invalid operation JSON"));
            }
            let chars: usize = key.len()?;
            add_lower(chars.saturating_add(3), lower_bound)?;
            let text: String = key.extract()?;
            let child = operation_python_node(&item, limit, depth + 1, lower_bound)?;
            result.push((Utf16::from_utf8(&text), child));
        }
        return Ok(Node::Object(result));
    }
    Err(PyValueError::new_err("invalid operation JSON"))
}

fn operation_size_limit(limit: &Bound<'_, PyAny>) -> PyResult<usize> {
    if limit.is_exact_instance_of::<PyBool>() {
        return Ok(usize::from(limit.extract::<bool>()?));
    }
    if limit.is_exact_instance_of::<PyInt>() {
        if limit.call_method1("__lt__", (0,))?.extract::<bool>()? {
            return Err(PyValueError::new_err("native wire frame bound exceeded"));
        }
        let bits: usize = limit.call_method0("bit_length")?.extract()?;
        if bits > usize::BITS as usize {
            return Ok(usize::MAX);
        }
        return Ok(limit.extract::<usize>().unwrap_or(usize::MAX));
    }
    if limit.is_exact_instance_of::<PyFloat>() {
        let number = limit.extract::<f64>()?;
        if number.is_nan() || number == f64::INFINITY {
            return Ok(usize::MAX);
        }
        if number < 0.0 || number == f64::NEG_INFINITY {
            return Err(PyValueError::new_err("native wire frame bound exceeded"));
        }
        return Ok(number as usize);
    }
    Err(pyo3::exceptions::PyTypeError::new_err(
        "frame limit must be an integer or float",
    ))
}

#[pyfunction]
fn operation_bounded_size(value: &Bound<'_, PyAny>, limit: &Bound<'_, PyAny>) -> PyResult<usize> {
    let limit = operation_size_limit(limit)?;
    let mut lower_bound = 0usize;
    let node = operation_python_node(value, limit, 0, &mut lower_bound)?;
    umf_core::operation_values::bounded_size_node(&node, limit)
        .map_err(|e| PyValueError::new_err(e.to_string()))
}

#[pyfunction]
fn operation_digest(json_text: &str) -> PyResult<String> {
    umf_core::operation_values::digest(json_text).map_err(|e| PyValueError::new_err(e.to_string()))
}

#[pyfunction]
fn operation_loads(raw_utf8: &Bound<'_, PyBytes>) -> PyResult<String> {
    let raw = std::str::from_utf8(raw_utf8.as_bytes())
        .map_err(|_| PyValueError::new_err("invalid operation JSON"))?;
    umf_core::operation_values::loads(raw).map_err(|e| PyValueError::new_err(e.to_string()))
}

#[pyfunction]
fn operation_token_encode(
    secret: &Bound<'_, PyBytes>,
    scope_json: &str,
    after_json: &str,
) -> PyResult<String> {
    umf_core::operation_values::token_encode(secret.as_bytes(), scope_json, after_json)
        .map_err(|e| PyValueError::new_err(e.to_string()))
}

#[pyfunction]
fn operation_token_decode(secret: &Bound<'_, PyBytes>, token: &str) -> PyResult<String> {
    umf_core::operation_values::token_decode(secret.as_bytes(), token)
        .map_err(|e| PyValueError::new_err(e.to_string()))
}

#[pyfunction]
fn operation_key_literal_mode(
    py: Python<'_>,
    carrier: &Bound<'_, PyAny>,
    value_is_none: bool,
) -> PyResult<&'static str> {
    if !carrier.is_exact_instance_of::<PyString>() {
        return Err(PyValueError::new_err("exact string carrier required"));
    }
    let carrier = if value_is_none {
        Utf16::default()
    } else {
        extract_utf16(py, carrier)?
    };
    umf_core::operation_values::key_literal_mode(&carrier, value_is_none)
        .map(|mode| match mode {
            umf_core::operation_values::KeyLiteralMode::String => "string",
            umf_core::operation_values::KeyLiteralMode::Boolean => "boolean",
            umf_core::operation_values::KeyLiteralMode::PassThrough => "pass-through",
        })
        .map_err(|e| PyValueError::new_err(e.to_string()))
}

#[pyfunction]
fn operation_native_token_classify(kind: &str, token: &str) -> PyResult<&'static str> {
    let kind = match kind {
        "integer" => umf_core::operation_values::NativeTokenKind::Integer,
        "decimal" => umf_core::operation_values::NativeTokenKind::Decimal,
        "uuid" => umf_core::operation_values::NativeTokenKind::Uuid,
        "bits128" => umf_core::operation_values::NativeTokenKind::Bits128,
        _ => {
            return Err(PyValueError::new_err(
                "unsupported native result token kind",
            ));
        }
    };
    let mut context = Context::ordinary();
    umf_core::operation_values::native_token_classify(&mut context, kind, token)
        .map(|decision| match decision {
            umf_core::operation_values::NativeTokenDecision::Accepted => "accepted",
            umf_core::operation_values::NativeTokenDecision::Refused => "refused",
            umf_core::operation_values::NativeTokenDecision::DecimalInvalidOperation => {
                "decimal-invalid-operation"
            }
        })
        .map_err(py_error)
}

#[pyfunction]
fn operation_native_result_classify(kind: &str, token: &str) -> PyResult<&'static str> {
    let kind = match kind {
        "date" => umf_core::operation_values::NativeResultKind::Date,
        "timestamp" => umf_core::operation_values::NativeResultKind::Timestamp,
        "float" => umf_core::operation_values::NativeResultKind::FloatDecimal,
        "float-ieee754-binary64-hex" => {
            umf_core::operation_values::NativeResultKind::FloatIeee754Binary64Hex
        }
        _ => {
            return Err(PyValueError::new_err(
                "unsupported native result carrier kind",
            ));
        }
    };
    let mut context = Context::ordinary();
    umf_core::operation_values::native_result_classify(&mut context, kind, token)
        .map(|decision| match decision {
            umf_core::operation_values::NativeResultDecision::Accepted => "accepted",
            umf_core::operation_values::NativeResultDecision::Candidate => "candidate",
            umf_core::operation_values::NativeResultDecision::Refused => "refused",
        })
        .map_err(py_error)
}

#[pyfunction]
fn protobuf_descriptor_profile_version() -> &'static str {
    umf_core::protobuf_descriptor::PROFILE_VERSION
}

#[pyfunction]
fn protobuf_read_descriptor_set(py: Python<'_>, binary: &Bound<'_, PyAny>) -> PyResult<PyObject> {
    if !binary.is_exact_instance_of::<PyBytes>() {
        return Err(py_error(EngineError::new(
            "PROTOBUF_BINARY",
            Utf16::default(),
            "Expected exact bytes carrier",
        )));
    }
    let input = binary.downcast::<PyBytes>()?.as_bytes();
    let mut context = Context::ordinary();
    let value = umf_core::protobuf_descriptor::read_descriptor_set(input, &mut context)
        .map_err(py_error)?;
    descriptor_value_to_python(py, &value, &mut context)
}

#[pyfunction]
fn protobuf_write_descriptor_set(py: Python<'_>, node: &Bound<'_, PyAny>) -> PyResult<PyObject> {
    let mut context = Context::ordinary();
    let mut count = 0usize;
    let admitted =
        python_value::from_python(py, node, &mut context, 0, &mut count).map_err(py_error)?;
    // Projection uses the ordinary UMF value admission profile (safe exact
    // numbers, finite floats, structural limits, and charged string copies).
    let value = admitted
        .project_schema_to_core(&mut context)
        .map_err(py_error)?;
    let bytes = umf_core::protobuf_descriptor::write_descriptor_set(&value, &mut context)
        .map_err(py_error)?;
    Ok(PyBytes::new_bound(py, &bytes).unbind().into())
}

fn descriptor_value_to_python(
    py: Python<'_>,
    value: &Value,
    context: &mut Context<'_>,
) -> PyResult<PyObject> {
    Ok(match value {
        Value::Null => py.None(),
        Value::Bool(value) => value.into_pyobject(py)?.to_owned().into_any().unbind(),
        Value::Number(value) => value.into_pyobject(py)?.to_owned().into_any().unbind(),
        Value::String(value) => py_text(py, value, context)?,
        Value::Array(items) => {
            let result = PyList::empty_bound(py);
            for item in items {
                context.charge_work(1, Utf16::default()).map_err(py_error)?;
                result.append(descriptor_value_to_python(py, item, context)?)?;
            }
            result.unbind().into()
        }
        Value::Object(items) => {
            let result = PyDict::new_bound(py);
            for (key, item) in items {
                context.charge_work(1, Utf16::default()).map_err(py_error)?;
                result.set_item(
                    py_text(py, key, context)?,
                    descriptor_value_to_python(py, item, context)?,
                )?;
            }
            result.unbind().into()
        }
    })
}

#[pyfunction]
fn access_float32_profile_version() -> &'static str {
    "umf-access-float32/0.1.0"
}

#[pyfunction]
fn access_float32_classify(value: &Bound<'_, PyAny>) -> PyResult<u8> {
    if !value.is_exact_instance_of::<PyFloat>() {
        return Err(PyValueError::new_err("binary64 float carrier required"));
    }
    let value = value.extract::<f64>()?;
    Ok(match umf_core::access_values::validate_float32(value) {
        Ok(()) => 0,
        Err(umf_core::access_values::Float32Error::NonFinite) => 1,
        Err(umf_core::access_values::Float32Error::Overflow) => 2,
        Err(umf_core::access_values::Float32Error::Rounding) => 3,
    })
}

#[pyfunction]
fn access_range_profile_version() -> &'static str {
    "umf-access-range/0.1.0"
}

#[pyfunction]
fn access_range_compare_integer(
    py: Python<'_>,
    left: &Bound<'_, PyAny>,
    right: &Bound<'_, PyAny>,
) -> PyResult<i8> {
    if !left.is_exact_instance_of::<PyInt>() || !right.is_exact_instance_of::<PyInt>() {
        return Err(PyValueError::new_err("integer range carrier required"));
    }
    let mut context = Context::ordinary();
    let left = python_bigint(py, left, &mut context)?;
    let right = python_bigint(py, right, &mut context)?;
    Ok(ordering_code(umf_core::access_values::compare_integers(
        &left, &right,
    )))
}

#[pyfunction]
fn access_range_compare_decimal(
    py: Python<'_>,
    left: &Bound<'_, PyAny>,
    right: &Bound<'_, PyAny>,
) -> PyResult<i8> {
    let mut context = Context::ordinary();
    let (left_sign, left_digits, left_exponent) = decimal_range_tuple(py, left, &mut context)?;
    let (right_sign, right_digits, right_exponent) = decimal_range_tuple(py, right, &mut context)?;
    umf_core::access_values::compare_decimal_tuples(
        left_sign,
        &left_digits,
        &left_exponent,
        right_sign,
        &right_digits,
        &right_exponent,
    )
    .map(ordering_code)
    .map_err(|error| PyValueError::new_err(error.to_string()))
}

#[pyfunction]
fn access_constraints_profile_version() -> &'static str {
    "umf-access-constraints/0.1.0"
}

fn exact_stream_integer(value: &Bound<'_, PyAny>) -> Option<BigInt> {
    if !value.is_exact_instance_of::<PyInt>() {
        return None;
    }
    let bits = value
        .call_method0("bit_length")
        .ok()?
        .extract::<usize>()
        .ok()?;
    let byte_len = bits.saturating_add(8).checked_div(8)?.max(1);
    let kwargs = PyDict::new_bound(value.py());
    kwargs.set_item("signed", true).ok()?;
    let bytes = value
        .call_method("to_bytes", (byte_len, "little"), Some(&kwargs))
        .ok()?
        .downcast_into::<PyBytes>()
        .ok()?;
    Some(BigInt::from_signed_bytes_le(bytes.as_bytes()))
}

#[pyfunction]
fn access_stream_page_size_profile_version() -> &'static str {
    "umf-access-stream-page-size/0.1.0"
}

#[pyfunction]
fn access_stream_page_size_request_valid(requested: &Bound<'_, PyAny>) -> bool {
    if requested.is_none() {
        return true;
    }
    let value = exact_stream_integer(requested);
    umf_core::access_stream::request_is_valid(value.as_ref()) && value.is_some()
}

#[pyfunction]
fn access_stream_page_size_missing_domain_valid(requested: bool) -> bool {
    umf_core::access_stream::missing_domain(requested).is_ok()
}

#[pyfunction]
fn access_stream_page_size_domain_type_valid(exact_dict: bool) -> bool {
    umf_core::access_stream::domain_type_is_valid(exact_dict).is_ok()
}

#[pyfunction]
fn access_stream_page_size_domain_keys_valid(matches: bool) -> bool {
    umf_core::access_stream::domain_keys_are_valid(matches).is_ok()
}

#[pyfunction]
fn access_stream_page_size_domain_parameter_valid(matches: bool) -> bool {
    umf_core::access_stream::domain_parameter_is_valid(matches).is_ok()
}

#[pyfunction]
fn access_stream_page_size_minimum_valid(exact_integer: bool) -> bool {
    umf_core::access_stream::minimum_carrier_is_valid(exact_integer)
}

#[pyfunction]
fn access_stream_page_size_minimum_comparison_valid(matches_minimum: bool) -> bool {
    umf_core::access_stream::minimum_value_is_valid(matches_minimum)
}

#[pyfunction]
fn access_stream_page_size_minimum_exact_value_valid(value: &Bound<'_, PyAny>) -> bool {
    exact_stream_integer(value)
        .is_some_and(|integer| umf_core::access_stream::minimum_exact_value_is_valid(&integer))
}

#[pyfunction]
fn access_stream_page_size_maximum_valid(exact_integer: bool) -> bool {
    umf_core::access_stream::maximum_carrier_is_valid(exact_integer)
}

#[pyfunction]
fn access_stream_page_size_maximum_comparison_valid(within_closed_range: bool) -> bool {
    umf_core::access_stream::maximum_value_is_valid(within_closed_range)
}

#[pyfunction]
fn access_stream_page_size_maximum_exact_value_valid(value: &Bound<'_, PyAny>) -> bool {
    exact_stream_integer(value)
        .is_some_and(|integer| umf_core::access_stream::maximum_exact_value_is_valid(&integer))
}

#[pyfunction]
fn access_stream_page_size_row_cap_valid(exact_integer: bool, maximum_fits: bool) -> bool {
    umf_core::access_stream::row_cap_is_valid(exact_integer, maximum_fits)
}

#[pyfunction]
fn access_stream_page_size_slot_count_valid(count: usize) -> bool {
    umf_core::access_stream::slot_count_is_valid(count)
}

#[pyfunction]
fn access_stream_page_size_slot_carrier_valid(matches: bool) -> bool {
    umf_core::access_stream::slot_carrier_is_valid(matches)
}

#[pyfunction]
fn access_stream_page_size_slot_nullability_valid(is_exact_false: bool) -> bool {
    umf_core::access_stream::slot_nullability_is_valid(is_exact_false)
}

#[pyfunction]
fn access_stream_page_size_final_maximum_valid(fits: bool) -> bool {
    umf_core::access_stream::final_maximum_is_valid(fits).is_ok()
}

fn constraint_bound_bigint(
    py: Python<'_>,
    value: &Bound<'_, PyAny>,
    context: &mut Context<'_>,
) -> PyResult<BigInt> {
    if value.is_exact_instance_of::<PyBool>() {
        return Ok(BigInt::from(value.extract::<bool>()? as u8));
    }
    python_bigint(py, value, context)
}

#[pyfunction]
fn access_constraints_length_within(
    py: Python<'_>,
    size: &Bound<'_, PyAny>,
    minimum: Option<&Bound<'_, PyAny>>,
    maximum: Option<&Bound<'_, PyAny>>,
) -> PyResult<bool> {
    if !size.is_exact_instance_of::<PyInt>() {
        return Err(PyValueError::new_err("exact length carrier required"));
    }
    let mut context = Context::ordinary();
    let size = python_bigint(py, size, &mut context)?;
    let size = usize::try_from(size)
        .map_err(|_| PyValueError::new_err("length outside supported range"))?;
    let minimum = if let Some(bound) = minimum {
        let bound = constraint_bound_bigint(py, bound, &mut context)?;
        if !umf_core::access_constraints::length_within(size, Some(&bound), None) {
            return Ok(false);
        }
        Some(bound)
    } else {
        None
    };
    let maximum = maximum
        .map(|bound| constraint_bound_bigint(py, bound, &mut context))
        .transpose()?;
    Ok(umf_core::access_constraints::length_within(
        size,
        minimum.as_ref(),
        maximum.as_ref(),
    ))
}

#[pyfunction]
fn access_constraints_equal_boolean(
    left: &Bound<'_, PyAny>,
    right: &Bound<'_, PyAny>,
) -> PyResult<bool> {
    if !left.is_exact_instance_of::<PyBool>() || !right.is_exact_instance_of::<PyBool>() {
        return Err(PyValueError::new_err(
            "exact boolean allowed-value carriers required",
        ));
    }
    Ok(umf_core::access_constraints::equal_boolean(
        left.extract::<bool>()?,
        right.extract::<bool>()?,
    ))
}

#[pyfunction]
fn access_constraints_equal_integer(
    py: Python<'_>,
    left: &Bound<'_, PyAny>,
    right: &Bound<'_, PyAny>,
) -> PyResult<bool> {
    if !left.is_exact_instance_of::<PyInt>() || !right.is_exact_instance_of::<PyInt>() {
        return Err(PyValueError::new_err(
            "exact integer allowed-value carriers required",
        ));
    }
    let mut context = Context::ordinary();
    let left = python_bigint(py, left, &mut context)?;
    let right = python_bigint(py, right, &mut context)?;
    Ok(umf_core::access_constraints::equal_integer(&left, &right))
}

#[pyfunction]
fn access_constraints_equal_text(
    left: &Bound<'_, PyAny>,
    right: &Bound<'_, PyAny>,
) -> PyResult<bool> {
    if !left.is_exact_instance_of::<pyo3::types::PyString>()
        || !right.is_exact_instance_of::<pyo3::types::PyString>()
    {
        return Err(PyValueError::new_err(
            "exact string allowed-value carriers required",
        ));
    }
    let left = left.extract::<String>()?;
    let right = right.extract::<String>()?;
    Ok(umf_core::access_constraints::equal_text(&left, &right))
}

#[pyfunction]
fn access_constraints_equal_bytes(
    left: &Bound<'_, PyAny>,
    right: &Bound<'_, PyAny>,
) -> PyResult<bool> {
    if !left.is_exact_instance_of::<PyBytes>() || !right.is_exact_instance_of::<PyBytes>() {
        return Err(PyValueError::new_err(
            "exact bytes allowed-value carriers required",
        ));
    }
    let left = left
        .downcast::<PyBytes>()
        .map_err(|_| PyValueError::new_err("exact bytes allowed-value carriers required"))?;
    let right = right
        .downcast::<PyBytes>()
        .map_err(|_| PyValueError::new_err("exact bytes allowed-value carriers required"))?;
    Ok(umf_core::access_constraints::equal_bytes(
        left.as_bytes(),
        right.as_bytes(),
    ))
}

#[pyfunction]
fn access_constraints_equal_decimal(
    py: Python<'_>,
    left: &Bound<'_, PyAny>,
    right: &Bound<'_, PyAny>,
) -> PyResult<bool> {
    let mut context = Context::ordinary();
    let (left_sign, left_digits, left_exponent) = decimal_range_tuple(py, left, &mut context)?;
    let (right_sign, right_digits, right_exponent) = decimal_range_tuple(py, right, &mut context)?;
    umf_core::access_values::validate_decimal_tuple(&left_digits, &left_exponent, None, None)
        .map_err(|error| PyValueError::new_err(error.to_string()))?;
    umf_core::access_values::validate_decimal_tuple(&right_digits, &right_exponent, None, None)
        .map_err(|error| PyValueError::new_err(error.to_string()))?;
    Ok(umf_core::access_constraints::equal_decimal(
        left_sign,
        &left_digits,
        &left_exponent,
        right_sign,
        &right_digits,
        &right_exponent,
    ))
}

fn ordering_code(ordering: std::cmp::Ordering) -> i8 {
    match ordering {
        std::cmp::Ordering::Less => -1,
        std::cmp::Ordering::Equal => 0,
        std::cmp::Ordering::Greater => 1,
    }
}

fn decimal_range_tuple(
    py: Python<'_>,
    value: &Bound<'_, PyAny>,
    context: &mut Context<'_>,
) -> PyResult<(bool, Vec<u8>, BigInt)> {
    let tuple = value
        .downcast::<PyTuple>()
        .map_err(|_| PyValueError::new_err("invalid Decimal coefficient tuple"))?;
    if tuple.len() != 3 {
        return Err(PyValueError::new_err("invalid Decimal coefficient tuple"));
    }
    let sign = tuple.get_item(0)?;
    if !sign.is_exact_instance_of::<PyInt>() {
        return Err(PyValueError::new_err("invalid Decimal coefficient tuple"));
    }
    let sign = python_bigint(py, &sign, context)?;
    let sign = if sign == BigInt::from(0) {
        false
    } else if sign == BigInt::from(1) {
        true
    } else {
        return Err(PyValueError::new_err("invalid Decimal coefficient tuple"));
    };
    let digits = tuple
        .get_item(1)?
        .downcast_into::<PyTuple>()
        .map_err(|_| PyValueError::new_err("invalid Decimal coefficient tuple"))?;
    context
        .charge_work(digits.len(), Utf16::default())
        .map_err(py_error)?;
    let digits = digits
        .iter()
        .map(|digit| {
            if !digit.is_exact_instance_of::<PyInt>() {
                return Err(PyValueError::new_err("invalid Decimal coefficient tuple"));
            }
            digit
                .extract::<u8>()
                .map_err(|_| PyValueError::new_err("invalid Decimal coefficient tuple"))
        })
        .collect::<PyResult<Vec<_>>>()?;
    let exponent = tuple.get_item(2)?;
    let exponent = python_bigint(py, &exponent, context)?;
    Ok((sign, digits, exponent))
}

#[pyfunction]
#[pyo3(signature = (value, bits, signed))]
fn access_values_integer_fits(
    py: Python<'_>,
    value: &Bound<'_, PyAny>,
    bits: Option<&Bound<'_, PyAny>>,
    signed: &Bound<'_, PyAny>,
) -> PyResult<bool> {
    if !value.is_exact_instance_of::<PyInt>() {
        return Err(PyValueError::new_err("invalid integer width"));
    }
    if !signed.is_exact_instance_of::<pyo3::types::PyBool>()
        || bits.is_some_and(|value| !value.is_exact_instance_of::<PyInt>())
    {
        return Err(PyValueError::new_err("invalid authored integer width"));
    }
    let signed = signed.extract::<bool>()?;
    let mut context = Context::ordinary();
    let value = python_bigint(py, value, &mut context)?;
    let bits = bits
        .map(|value| python_bigint(py, value, &mut context))
        .transpose()?;
    umf_core::access_values::integer_fits(&value, bits.as_ref(), signed)
        .map_err(|error| PyValueError::new_err(error.to_string()))
}

#[pyfunction]
#[pyo3(signature = (digits, exponent, precision=None, scale=None))]
fn access_values_validate_decimal(
    py: Python<'_>,
    digits: &Bound<'_, PyAny>,
    exponent: &Bound<'_, PyAny>,
    precision: Option<&Bound<'_, PyAny>>,
    scale: Option<&Bound<'_, PyAny>>,
) -> PyResult<()> {
    let mut context = Context::ordinary();
    let digits = digits
        .downcast::<PyTuple>()
        .map_err(|_| PyValueError::new_err("invalid Decimal coefficient tuple"))?;
    context
        .charge_work(digits.len(), Utf16::default())
        .map_err(py_error)?;
    let digits = digits
        .iter()
        .map(|digit| {
            if !digit.is_exact_instance_of::<PyInt>() {
                return Err(PyValueError::new_err("invalid Decimal coefficient tuple"));
            }
            digit
                .extract::<u8>()
                .map_err(|_| PyValueError::new_err("invalid Decimal coefficient tuple"))
        })
        .collect::<PyResult<Vec<_>>>()?;
    let exponent = python_bigint(py, exponent, &mut context)?;
    let precision = precision
        .map(|value| python_bigint(py, value, &mut context))
        .transpose()?;
    let scale = scale
        .map(|value| python_bigint(py, value, &mut context))
        .transpose()?;
    umf_core::access_values::validate_decimal_tuple(
        &digits,
        &exponent,
        precision.as_ref(),
        scale.as_ref(),
    )
    .map_err(|error| PyValueError::new_err(error.to_string()))
}

/// Generic compiler transport; callbacks are supplied only by the binding caller.
#[pyfunction]
#[pyo3(signature = (wire_json, profile="cooperative", max_work=None, meter=None, is_cancelled=None, now=None, deadline_ms=None, control=None))]
fn execute_codegen_wire(
    py: Python<'_>,
    wire_json: &str,
    profile: &str,
    max_work: Option<usize>,
    meter: Option<PyObject>,
    is_cancelled: Option<PyObject>,
    now: Option<PyObject>,
    deadline_ms: Option<u64>,
    control: Option<PyObject>,
) -> PyResult<String> {
    let profile = match profile {
        "cooperative" => umf_core::ResourceProfile::Cooperative,
        "hard-isolated" => umf_core::ResourceProfile::HardIsolated,
        _ => return Err(PyValueError::new_err("Unknown resource profile")),
    };
    for (name, callback) in [
        ("meter", meter.as_ref()),
        ("is_cancelled", is_cancelled.as_ref()),
        ("now", now.as_ref()),
    ] {
        if callback.is_some_and(|value| !value.bind(py).is_callable()) {
            return Err(PyValueError::new_err(format!("{name} must be callable")));
        }
    }
    if deadline_ms.is_some() && now.is_none() {
        return Err(PyValueError::new_err("now is required with deadline_ms"));
    }
    // No artifact can install a semantic callback through this transport.
    struct NoCallbacks;
    impl Capabilities for NoCallbacks {
        fn validate_extension(
            &mut self,
            _: u64,
            _: &Value,
            _: &SemanticContext,
        ) -> Result<Vec<Diagnostic>, Utf16> {
            Err("No compiler extension callback is registered".into())
        }
    }
    let mut state = PythonWorkControl {
        py,
        max_work,
        charged: 0,
        meter,
        is_cancelled,
        now,
        host_callback_failed: false,
    };
    let mut failure = None;
    let mut control_hook = |amount| {
        let result = (|| {
            if let Some(callback) = &control {
                let outcome = callback
                    .bind(py)
                    .call1((amount,))
                    .map_err(|error| py_exception_engine_error(py, "METER_FAILURE", error))?;
                if !outcome.is_none() {
                    let (code, message, path): (String, Bound<'_, PyAny>, Bound<'_, PyAny>) =
                        outcome.extract().map_err(|error| {
                            py_exception_engine_error(py, "METER_FAILURE", error)
                        })?;
                    let mut ctx = Context::ordinary();
                    let origin = python_value::pytext_from_python(&message, &mut ctx)?;
                    let mut error = EngineError::new(
                        code,
                        extract_utf16(py, &path).map_err(|error| {
                            py_exception_engine_error(py, "METER_FAILURE", error)
                        })?,
                        pytext_utf16(&origin),
                    );
                    error.python_message_origin = Some(origin);
                    return Err(error);
                }
                return Ok(());
            }
            state.meter(amount)?;
            if state.cancelled()? {
                return Err(EngineError::new(
                    "CANCELLED",
                    Utf16::default(),
                    "Operation cancelled by host",
                ));
            }
            if let Some(deadline) = deadline_ms {
                let time = state.clock()?.ok_or_else(|| {
                    EngineError::new(
                        "CLOCK_CAPABILITY_REQUIRED",
                        Utf16::default(),
                        "Host clock capability is required for deadline requests",
                    )
                })?;
                if time > deadline {
                    return Err(EngineError::new(
                        "DEADLINE",
                        Utf16::default(),
                        "Deadline elapsed",
                    ));
                }
            }
            Ok(())
        })();
        if let Err(error) = &result {
            failure = Some(error.clone());
        }
        result
    };
    let response = umf_core_wire::execute_request_with_control(
        wire_json,
        profile,
        &mut NoCallbacks,
        &mut control_hook,
    );
    if let Some(error) = failure {
        return Err(py_error_preserving_origin(
            py,
            error,
            &mut Context::ordinary(),
        ));
    }
    Ok(response)
}

#[pyfunction]
fn access_catalog_custody_profile_version() -> &'static str {
    "umf-access-catalog-custody/0.1.0"
}

#[pyfunction]
fn access_native_column_bindings(py: Python<'_>, target: &Bound<'_, PyAny>) -> PyResult<PyObject> {
    if !target.is_exact_instance_of::<PyDict>() {
        return Err(PyValueError::new_err(
            "native catalog target must be an exact dict",
        ));
    }
    let mut context = Context::ordinary();
    let mut count = 0usize;
    let target =
        python_value::from_python(py, target, &mut context, 0, &mut count).map_err(py_error)?;
    target.admit(&mut context).map_err(py_error)?;
    let response = match umf_core::access_catalog_custody::native_column_bindings(&target) {
        Ok(bindings) => {
            let values = bindings
                .into_iter()
                .map(|binding| {
                    PythonConsumerValue::Object(vec![
                        (
                            umf_core::PyText::from_utf8("sourceId"),
                            PythonConsumerValue::String(binding.source_id),
                        ),
                        (
                            umf_core::PyText::from_utf8("documentJson"),
                            PythonConsumerValue::String(binding.document_json),
                        ),
                        (
                            umf_core::PyText::from_utf8("documentSha256"),
                            PythonConsumerValue::String(binding.document_sha256),
                        ),
                    ])
                })
                .collect();
            PythonConsumerValue::Object(vec![
                (
                    umf_core::PyText::from_utf8("outcome"),
                    PythonConsumerValue::String(umf_core::PyText::from_utf8("returned")),
                ),
                (
                    umf_core::PyText::from_utf8("bindings"),
                    PythonConsumerValue::Array(values),
                ),
            ])
        }
        Err(refusal) => PythonConsumerValue::Object(vec![
            (
                umf_core::PyText::from_utf8("outcome"),
                PythonConsumerValue::String(umf_core::PyText::from_utf8("refused")),
            ),
            (
                umf_core::PyText::from_utf8("code"),
                PythonConsumerValue::String(umf_core::PyText::from_utf8(refusal.code())),
            ),
            (
                umf_core::PyText::from_utf8("message"),
                PythonConsumerValue::String(umf_core::PyText::from_utf8(
                    refusal.predecessor_message(),
                )),
            ),
        ]),
    };
    python_value::to_python(py, &response, &mut context)
}

#[pyfunction]
fn access_catalog_source_join_profile_version() -> &'static str {
    "umf-access-catalog-source-join/0.1.0"
}

#[pyfunction]
fn access_check_native_column_sources(
    py: Python<'_>,
    bindings: &Bound<'_, PyAny>,
    sources: &Bound<'_, PyAny>,
) -> PyResult<PyObject> {
    if !bindings.is_exact_instance_of::<PyList>() {
        return Err(PyValueError::new_err(
            "native binding references must be an exact list",
        ));
    }
    let mut context = Context::ordinary();
    let mut count = 0usize;
    let bindings =
        python_value::from_python(py, bindings, &mut context, 0, &mut count).map_err(py_error)?;
    let sources =
        python_value::from_python(py, sources, &mut context, 0, &mut count).map_err(py_error)?;
    bindings.admit(&mut context).map_err(py_error)?;
    sources.admit(&mut context).map_err(py_error)?;
    let response =
        match umf_core::access_catalog_custody::check_native_column_sources(&bindings, &sources) {
            Ok(()) => PythonConsumerValue::Object(vec![(
                umf_core::PyText::from_utf8("outcome"),
                PythonConsumerValue::String(umf_core::PyText::from_utf8("returned")),
            )]),
            Err(refusal) => PythonConsumerValue::Object(vec![
                (
                    umf_core::PyText::from_utf8("outcome"),
                    PythonConsumerValue::String(umf_core::PyText::from_utf8("refused")),
                ),
                (
                    umf_core::PyText::from_utf8("code"),
                    PythonConsumerValue::String(umf_core::PyText::from_utf8(refusal.code())),
                ),
                (
                    umf_core::PyText::from_utf8("message"),
                    PythonConsumerValue::String(umf_core::PyText::from_utf8(
                        refusal.predecessor_message(),
                    )),
                ),
            ]),
        };
    python_value::to_python(py, &response, &mut context)
}

#[pyfunction]
fn access_catalog_logical_render_profile_version() -> &'static str {
    umf_core::access_logical_render::PROFILE
}

#[pyfunction]
fn access_catalog_render_logical_variant(
    py: Python<'_>,
    input: &Bound<'_, PyAny>,
) -> PyResult<PyObject> {
    if !input.is_exact_instance_of::<PyDict>() {
        return Err(PyValueError::new_err(
            "captured logical render input must be an exact dict",
        ));
    }
    let mut context = Context::ordinary();
    let mut count = 0usize;
    let input = python_value::from_python(py, input, &mut context, 0, &mut count)
        .map_err(py_error)?;
    let response = match umf_core::access_logical_render::render_captured_variant(
        &input,
        &mut context,
    ) {
        Ok(logical_request) => PythonConsumerValue::Object(vec![
            (
                umf_core::PyText::from_utf8("profile"),
                PythonConsumerValue::String(umf_core::PyText::from_utf8(
                    umf_core::access_logical_render::PROFILE,
                )),
            ),
            (
                umf_core::PyText::from_utf8("outcome"),
                PythonConsumerValue::String(umf_core::PyText::from_utf8("rendered")),
            ),
            (
                umf_core::PyText::from_utf8("logicalRequest"),
                PythonConsumerValue::String(umf_core::PyText::from_utf8(&logical_request)),
            ),
        ]),
        Err(umf_core::access_logical_render::LogicalRenderError::Refused(refusal)) => {
            PythonConsumerValue::Object(vec![
                (
                    umf_core::PyText::from_utf8("profile"),
                    PythonConsumerValue::String(umf_core::PyText::from_utf8(
                        umf_core::access_logical_render::PROFILE,
                    )),
                ),
                (
                    umf_core::PyText::from_utf8("outcome"),
                    PythonConsumerValue::String(umf_core::PyText::from_utf8("refused")),
                ),
                (
                    umf_core::PyText::from_utf8("code"),
                    PythonConsumerValue::String(umf_core::PyText::from_utf8(refusal.code)),
                ),
                (
                    umf_core::PyText::from_utf8("message"),
                    PythonConsumerValue::String(umf_core::PyText::from_utf8(&refusal.message)),
                ),
            ])
        }
        Err(umf_core::access_logical_render::LogicalRenderError::Resource(error)) => {
            return Err(py_error(error));
        }
    };
    python_value::to_python(py, &response, &mut context)
}

#[pyfunction]
fn copy_json_wire(wire_json: &str) -> PyResult<String> {
    Ok(umf_core_wire::copy_wire_envelope(wire_json))
}

#[pyfunction]
fn copy_python_consumer_value(py: Python<'_>, value: &Bound<'_, PyAny>) -> PyResult<PyObject> {
    let mut ctx = Context::ordinary();
    let mut count = 0usize;
    let value = python_value::from_python(py, value, &mut ctx, 0, &mut count).map_err(py_error)?;
    python_value::to_python(py, &value, &mut ctx)
}

#[pyfunction]
fn copy_python_json_value(py: Python<'_>, value: &Bound<'_, PyAny>) -> PyResult<PyObject> {
    let mut ctx = Context::ordinary();
    let mut count = 0usize;
    let value = python_value::from_python(py, value, &mut ctx, 0, &mut count).map_err(py_error)?;
    let (projected, snapshot) = value.admit_core_snapshot(&mut ctx).map_err(py_error)?;
    umf_core::value::copy_json(&projected, &mut ctx).map_err(py_error)?;
    python_value::to_python(py, &snapshot, &mut ctx)
}

#[pyclass(module = "umf._rust_core")]
struct NativePythonSchema {
    compiled: PythonCompiledSchema,
}

#[pymethods]
impl NativePythonSchema {
    #[new]
    #[pyo3(signature = (schema, resources, strict=false, python_minor=None))]
    fn new(
        py: Python<'_>,
        schema: &Bound<'_, PyAny>,
        resources: &Bound<'_, PyAny>,
        strict: bool,
        python_minor: Option<u8>,
    ) -> PyResult<Self> {
        let mut ctx = Context::catalog();
        let mut count = 0;
        let schema =
            python_value::from_python(py, schema, &mut ctx, 0, &mut count).map_err(py_error)?;
        let mut schema_resources = PythonSchemaResources::default();
        {
            if !resources.is_exact_instance_of::<PyList>()
                && !resources.is_exact_instance_of::<PyTuple>()
            {
                return Err(py_error(EngineError::new(
                    "SCHEMA_RESOURCES",
                    Utf16::default(),
                    "Schema resources must be a list or tuple",
                )));
            }
            let items = if resources.is_exact_instance_of::<PyList>() {
                resources
                    .downcast::<PyList>()
                    .map_err(|_| PyValueError::new_err("Invalid resources"))?
                    .iter()
                    .collect::<Vec<_>>()
            } else {
                resources
                    .downcast::<PyTuple>()
                    .map_err(|_| PyValueError::new_err("Invalid resources"))?
                    .iter()
                    .collect::<Vec<_>>()
            };
            for item in items {
                let mut resource_count = 0;
                let converted =
                    python_value::from_python(py, &item, &mut ctx, 0, &mut resource_count)
                        .map_err(py_error)?;
                let PythonConsumerValue::Object(fields) = converted else {
                    return Err(py_error(EngineError::new(
                        "SCHEMA_RESOURCES",
                        Utf16::default(),
                        "Schema resource must be an object",
                    )));
                };
                let mut id = None;
                let mut resource_schema = None;
                for (key, value) in fields {
                    match key.codepoints() {
                        [105, 100] => {
                            if let PythonConsumerValue::String(text) = value {
                                id = Some(text);
                            }
                        }
                        [115, 99, 104, 101, 109, 97] => resource_schema = Some(value),
                        _ => {}
                    }
                }
                let id = id.ok_or_else(|| {
                    py_error(EngineError::new(
                        "SCHEMA_RESOURCES",
                        Utf16::default(),
                        "Schema resource id must be a string",
                    ))
                })?;
                let schema = resource_schema.ok_or_else(|| {
                    py_error(EngineError::new(
                        "SCHEMA_RESOURCES",
                        Utf16::default(),
                        "Schema resource schema is missing",
                    ))
                })?;
                schema_resources.entries.push((id, schema));
            }
        }
        let version = umf_core::PythonReVersion::from_minor(
            python_minor.unwrap_or_else(|| py.version_info().minor),
        )
        .map_err(|error| {
            py_error(EngineError::new(
                error.code(),
                Utf16::default(),
                error.message(),
            ))
        })?;
        let compiled = umf_core::schema::CompiledSchema::compile_python_source(
            &schema,
            &schema_resources,
            strict,
            version,
            &mut ctx,
        )
        .map_err(py_error)?;
        Ok(Self { compiled })
    }

    fn validate(&self, py: Python<'_>, instance: &Bound<'_, PyAny>) -> PyResult<PyObject> {
        let mut ctx = Context::ordinary();
        let mut count = 0;
        let instance =
            python_value::from_python(py, instance, &mut ctx, 0, &mut count).map_err(py_error)?;
        let errors = self
            .compiled
            .validate(&instance, &mut ctx)
            .map_err(py_error)?;
        ctx.charge_work(errors.len(), Utf16::default())
            .map_err(py_error)?;
        let diagnostics = PyList::empty_bound(py);
        for error in errors {
            ctx.charge_work(
                7 + usize::from(error.instance_override.is_some()),
                Utf16::default(),
            )
            .map_err(py_error)?;
            let item = PyDict::new_bound(py);
            item.set_item(
                "instancePath",
                python_value::to_python(
                    py,
                    &PythonConsumerValue::String(error.instance_path),
                    &mut ctx,
                )?,
            )?;
            item.set_item(
                "physicalInstancePath",
                python_value::to_python(
                    py,
                    &PythonConsumerValue::String(error.physical_instance_path),
                    &mut ctx,
                )?,
            )?;
            if let Some(value) = error.instance_override {
                item.set_item(
                    "instanceOverride",
                    python_value::to_python(py, &value, &mut ctx)?,
                )?;
            }
            item.set_item(
                "schemaPath",
                python_value::to_python(
                    py,
                    &PythonConsumerValue::String(error.schema_path),
                    &mut ctx,
                )?,
            )?;
            item.set_item(
                "schemaPathSegments",
                schema_path_segments_to_python(py, error.schema_path_segments, &mut ctx)?,
            )?;
            let keyword = match error.keyword {
                Some(keyword) => {
                    python_value::to_python(py, &PythonConsumerValue::String(keyword), &mut ctx)?
                }
                None => py.None(),
            };
            item.set_item("keyword", keyword)?;
            item.set_item(
                "validatorValue",
                python_value::to_python(py, &error.validator_value, &mut ctx)?,
            )?;
            item.set_item(
                "params",
                python_value::to_python(py, &error.params, &mut ctx)?,
            )?;
            item.set_item(
                "message",
                python_value::to_python(py, &PythonConsumerValue::String(error.message), &mut ctx)?,
            )?;
            diagnostics.append(item)?;
        }
        Ok(diagnostics.unbind().into())
    }

    #[pyo3(signature = (instance, first_error=false))]
    fn evaluate(
        &self,
        py: Python<'_>,
        instance: &Bound<'_, PyAny>,
        first_error: bool,
    ) -> PyResult<(PyObject, Option<String>)> {
        let mut ctx = Context::ordinary();
        let mut count = 0;
        let instance =
            python_value::from_python(py, instance, &mut ctx, 0, &mut count).map_err(py_error)?;
        let mode = if first_error {
            umf_core::PythonSchemaEvaluationMode::FirstError
        } else {
            umf_core::PythonSchemaEvaluationMode::AllErrors
        };
        let evaluation = self
            .compiled
            .evaluate(&instance, mode, &mut ctx)
            .map_err(py_error)?;
        ctx.charge_work(evaluation.errors.len(), Utf16::default())
            .map_err(py_error)?;
        let diagnostics = PyList::empty_bound(py);
        for error in evaluation.errors {
            ctx.charge_work(
                7 + usize::from(error.instance_override.is_some()),
                Utf16::default(),
            )
            .map_err(py_error)?;
            let item = PyDict::new_bound(py);
            item.set_item(
                "instancePath",
                python_value::to_python(
                    py,
                    &PythonConsumerValue::String(error.instance_path),
                    &mut ctx,
                )?,
            )?;
            item.set_item(
                "physicalInstancePath",
                python_value::to_python(
                    py,
                    &PythonConsumerValue::String(error.physical_instance_path),
                    &mut ctx,
                )?,
            )?;
            if let Some(value) = error.instance_override {
                item.set_item(
                    "instanceOverride",
                    python_value::to_python(py, &value, &mut ctx)?,
                )?;
            }
            item.set_item(
                "schemaPath",
                python_value::to_python(
                    py,
                    &PythonConsumerValue::String(error.schema_path),
                    &mut ctx,
                )?,
            )?;
            item.set_item(
                "schemaPathSegments",
                schema_path_segments_to_python(py, error.schema_path_segments, &mut ctx)?,
            )?;
            let keyword = match error.keyword {
                Some(keyword) => {
                    python_value::to_python(py, &PythonConsumerValue::String(keyword), &mut ctx)?
                }
                None => py.None(),
            };
            item.set_item("keyword", keyword)?;
            item.set_item(
                "validatorValue",
                python_value::to_python(py, &error.validator_value, &mut ctx)?,
            )?;
            item.set_item(
                "params",
                python_value::to_python(py, &error.params, &mut ctx)?,
            )?;
            item.set_item(
                "message",
                python_value::to_python(py, &PythonConsumerValue::String(error.message), &mut ctx)?,
            )?;
            diagnostics.append(item)?;
        }
        let terminal = evaluation.terminal_error.map(umf_core_wire::error_envelope);
        Ok((diagnostics.unbind().into(), terminal))
    }
}

fn schema_path_segments_to_python(
    py: Python<'_>,
    segments: Vec<PythonSchemaPathSegment>,
    ctx: &mut Context<'_>,
) -> PyResult<PyObject> {
    ctx.charge_work(segments.len(), Utf16::default())
        .map_err(py_error)?;
    let output = PyList::empty_bound(py);
    for segment in segments {
        match segment {
            PythonSchemaPathSegment::Key(key) => output.append(python_value::to_python(
                py,
                &PythonConsumerValue::String(key),
                ctx,
            )?)?,
            PythonSchemaPathSegment::Index(index) => output.append(index)?,
        }
    }
    Ok(output.unbind().into())
}

#[pyfunction]
fn engine_version() -> &'static str {
    "umf-core-r2"
}

/// Identifies the additive compiler wire protocol independently of core semantics.
#[pyfunction]
fn codegen_protocol_version() -> &'static str {
    "umf-codegen-r3-seven-ops-nine-resources/1"
}

#[pyfunction]
#[pyo3(signature = (kind, year, month, day, hour, minute, second, microsecond, offset_microseconds=None))]
fn access_temporal_canonical_token(
    kind: &str,
    year: u16,
    month: u8,
    day: u8,
    hour: u8,
    minute: u8,
    second: u8,
    microsecond: u32,
    offset_microseconds: Option<i64>,
) -> PyResult<String> {
    umf_core::access_temporal::canonicalize_access_temporal(
        kind,
        year,
        month,
        day,
        hour,
        minute,
        second,
        microsecond,
        offset_microseconds,
    )
    .map_err(|error| PyValueError::new_err(error.to_string()))
}

#[pyfunction]
fn access_temporal_profile_version() -> &'static str {
    "umf-access-temporal/0.1.0"
}

#[pyfunction]
fn read_value_wire(py: Python<'_>, source: &Bound<'_, PyAny>, format: &str) -> PyResult<String> {
    let source = extract_utf16(py, source).map_err(|error| {
        py_error(EngineError::new(
            "SOURCE_ENCODING",
            Utf16::default(),
            py_error_utf16(py, error),
        ))
    })?;
    let format = parse_format(format)?;
    let value =
        umf_core::serialization::read_json_value(source.units(), format, &mut Context::ordinary())
            .map_err(py_error)?;
    umf_core_wire::encode(&value, &mut Context::ordinary()).map_err(py_error)
}

#[pyfunction]
fn write_value(py: Python<'_>, wire_json: &str, format: &str) -> PyResult<PyObject> {
    let format = parse_format(format)?;
    let value = umf_core_wire::decode(wire_json, &mut Context::ordinary()).map_err(py_error)?;
    let mut ctx = Context::ordinary();
    let text =
        umf_core::serialization::write_json_value(&value, format, &mut ctx).map_err(py_error)?;
    py_text(py, &text, &mut ctx).map_err(|error| {
        py_error(EngineError::new(
            "SOURCE_ENCODING",
            Utf16::default(),
            py_error_utf16(py, error),
        ))
    })
}

#[pyfunction]
fn read_python_value(
    py: Python<'_>,
    source: &Bound<'_, PyAny>,
    format: &str,
) -> PyResult<PyObject> {
    let mut ctx = Context::ordinary();
    let source = python_value::pytext_from_python(source, &mut ctx).map_err(py_error)?;
    let value =
        umf_core::serialization::read_python_value(&source, parse_format(format)?, &mut ctx)
            .map_err(py_error)?;
    python_value::to_python(py, &value, &mut ctx)
}

#[pyfunction]
fn write_python_value(
    py: Python<'_>,
    value: &Bound<'_, PyAny>,
    format: &str,
) -> PyResult<PyObject> {
    let mut ctx = Context::ordinary();
    let mut count = 0usize;
    let value = python_value::from_python(py, value, &mut ctx, 0, &mut count).map_err(py_error)?;
    let text = umf_core::serialization::write_python_value(&value, parse_format(format)?, &mut ctx)
        .map_err(py_error)?;
    python_value::to_python(py, &PythonConsumerValue::String(text), &mut ctx)
}

fn schema_resources_from_wire(resources_wire: &str) -> PyResult<umf_core::schema::SchemaResources> {
    let mut transport = umf_core_wire::transport_context();
    let resources_value =
        umf_core_wire::decode(resources_wire, &mut transport).map_err(py_error)?;
    let umf_core::Value::Array(resource_values) = resources_value else {
        return Err(py_error(EngineError::new(
            "SCHEMA_RESOURCES",
            Utf16::default(),
            "Schema resources must be an array",
        )));
    };
    let mut entries = Vec::with_capacity(resource_values.len());
    for resource in resource_values {
        let umf_core::Value::Object(members) = resource else {
            return Err(py_error(EngineError::new(
                "SCHEMA_RESOURCES",
                Utf16::default(),
                "Schema resource must be an object",
            )));
        };
        let id = members
            .iter()
            .find(|(key, _)| *key == Utf16::from("id"))
            .and_then(|(_, value)| match value {
                umf_core::Value::String(value) => Some(value.clone()),
                _ => None,
            })
            .ok_or_else(|| {
                py_error(EngineError::new(
                    "SCHEMA_RESOURCES",
                    Utf16::default(),
                    "Schema resource id must be a string",
                ))
            })?;
        let resource_schema = members
            .iter()
            .find(|(key, _)| *key == Utf16::from("schema"))
            .map(|(_, value)| value.clone())
            .ok_or_else(|| {
                py_error(EngineError::new(
                    "SCHEMA_RESOURCES",
                    Utf16::default(),
                    "Schema resource schema is missing",
                ))
            })?;
        entries.push((id, resource_schema));
    }
    Ok(umf_core::schema::SchemaResources { entries })
}

#[pyfunction]
fn check_schema_wire(
    schema_wire: &str,
    resources_wire: &str,
    strict: bool,
    python_minor: u8,
) -> PyResult<String> {
    let mut transport = umf_core_wire::transport_context();
    let schema = umf_core_wire::decode(schema_wire, &mut transport).map_err(py_error)?;
    let resources = schema_resources_from_wire(resources_wire)?;
    let mut ctx = Context::catalog();
    let version = umf_core::PythonReVersion::from_minor(python_minor).map_err(|error| {
        py_error(EngineError::new(
            error.code(),
            Utf16::default(),
            error.message(),
        ))
    })?;
    let compiled = umf_core::schema::CompiledSchema::compile_python_schema(
        &schema, &resources, strict, version, &mut ctx,
    )
    .map_err(py_error)?;
    drop(compiled);
    Ok(umf_core_wire::result_envelope(Ok("null".to_owned())))
}

#[pyfunction]
fn validate_schema_wire(
    schema_wire: &str,
    instance_wire: &str,
    resources_wire: &str,
    strict: bool,
    python_minor: u8,
) -> PyResult<String> {
    let mut transport = umf_core_wire::transport_context();
    let schema = umf_core_wire::decode(schema_wire, &mut transport).map_err(py_error)?;
    let resources = schema_resources_from_wire(resources_wire)?;
    let mut operation = Context::ordinary();
    let instance = umf_core_wire::decode(instance_wire, &mut operation).map_err(py_error)?;
    let mut ctx = Context::catalog();
    let version = umf_core::PythonReVersion::from_minor(python_minor).map_err(|error| {
        py_error(EngineError::new(
            error.code(),
            Utf16::default(),
            error.message(),
        ))
    })?;
    let compiled = umf_core::schema::CompiledSchema::compile_python_schema(
        &schema, &resources, strict, version, &mut ctx,
    )
    .map_err(py_error)?;
    let errors = compiled
        .validate(&instance, &mut operation)
        .map_err(py_error)?;
    let encoded_errors = umf_core::Value::Array(
        errors
            .into_iter()
            .map(|error| {
                umf_core::Value::Object(vec![
                    (
                        Utf16::from("instancePath"),
                        umf_core::Value::String(error.instance_path),
                    ),
                    (
                        Utf16::from("schemaPath"),
                        umf_core::Value::String(error.schema_path),
                    ),
                    (
                        Utf16::from("keyword"),
                        umf_core::Value::String(Utf16::from(error.keyword)),
                    ),
                    (Utf16::from("params"), error.params),
                    (
                        Utf16::from("message"),
                        umf_core::Value::String(error.message),
                    ),
                ])
            })
            .collect(),
    );
    let wire = umf_core_wire::encode(&encoded_errors, &mut ctx).map_err(py_error)?;
    Ok(umf_core_wire::result_envelope(Ok(wire)))
}

#[pyfunction]
fn literal_errors_wire(
    document_wire: &str,
    field_wire: &str,
    value_wire: &str,
    enabled: bool,
    policy_wire: &str,
) -> PyResult<String> {
    let mut ctx = Context::ordinary();
    let document = umf_core_wire::decode(document_wire, &mut ctx).map_err(py_error)?;
    let field = umf_core_wire::decode(field_wire, &mut ctx).map_err(py_error)?;
    let value = umf_core_wire::decode(value_wire, &mut ctx).map_err(py_error)?;
    let policy = umf_core_wire::decode(policy_wire, &mut ctx).map_err(py_error)?;
    let policy = umf_core::literal_policy::prepare_policy(&policy, &mut ctx).map_err(py_error)?;
    let diagnostics =
        umf_core::literal::literal_errors(&document, &field, &value, enabled, &policy, &mut ctx)
            .map_err(py_error)?;
    let value = umf_core::Value::Array(diagnostics.into_iter().map(diagnostic_value).collect());
    let wire = umf_core_wire::encode(&value, &mut ctx).map_err(py_error)?;
    Ok(umf_core_wire::result_envelope(Ok(wire)))
}

#[pyfunction]
fn literal_identity_wire(
    field_wire: &str,
    value_wire: &str,
    policy_wire: &str,
) -> PyResult<String> {
    let mut ctx = Context::ordinary();
    let field = umf_core_wire::decode(field_wire, &mut ctx).map_err(py_error)?;
    let value = umf_core_wire::decode(value_wire, &mut ctx).map_err(py_error)?;
    let policy = umf_core_wire::decode(policy_wire, &mut ctx).map_err(py_error)?;
    let policy = umf_core::literal_policy::prepare_policy(&policy, &mut ctx).map_err(py_error)?;
    let identity =
        umf_core::literal::literal_identity(&field, &value, &policy, &mut ctx).map_err(py_error)?;
    let value = identity.map_or(umf_core::Value::Null, umf_core::Value::String);
    let wire = umf_core_wire::encode(&value, &mut ctx).map_err(py_error)?;
    Ok(umf_core_wire::result_envelope(Ok(wire)))
}

#[pyfunction]
fn numeric_interval_wire(
    field_wire: &str,
    range_wire: &str,
    policy_wire: &str,
) -> PyResult<String> {
    let mut ctx = Context::ordinary();
    let field = umf_core_wire::decode(field_wire, &mut ctx).map_err(py_error)?;
    let range = umf_core_wire::decode(range_wire, &mut ctx).map_err(py_error)?;
    let policy = umf_core_wire::decode(policy_wire, &mut ctx).map_err(py_error)?;
    let policy = umf_core::literal_policy::prepare_policy(&policy, &mut ctx).map_err(py_error)?;
    let diagnostics =
        umf_core::literal::numeric_interval(&field, &range, &policy, &mut ctx).map_err(py_error)?;
    let value = umf_core::Value::Array(diagnostics.into_iter().map(diagnostic_value).collect());
    let wire = umf_core_wire::encode(&value, &mut ctx).map_err(py_error)?;
    Ok(umf_core_wire::result_envelope(Ok(wire)))
}

fn diagnostic_value(diagnostic: Diagnostic) -> umf_core::Value {
    umf_core::Value::Object(vec![
        (
            Utf16::from("code"),
            umf_core::Value::String(diagnostic.code),
        ),
        (
            Utf16::from("path"),
            umf_core::Value::String(diagnostic.path),
        ),
        (
            Utf16::from("message"),
            umf_core::Value::String(diagnostic.message),
        ),
        (
            Utf16::from("severity"),
            umf_core::Value::String(Utf16::from(match diagnostic.severity {
                Severity::Error => "error",
                Severity::Warning => "warning",
            })),
        ),
    ])
}

#[pyclass(module = "umf._rust_core")]
struct NativeEngine {
    engine: Engine,
}

#[pyclass(module = "umf._rust_core")]
struct NativeRegistry {
    package_schema: umf_core::schema::CompiledSchema,
    schema_resources: umf_core::schema::SchemaResources,
    registry: Registry,
    callbacks: HashMap<u64, PyObject>,
    next_token: u64,
}

#[pymethods]
impl NativeEngine {
    #[new]
    fn new(
        core: &str,
        reference: &str,
        package: &str,
        constraints: &str,
        policy: &str,
    ) -> PyResult<Self> {
        let mut core_ctx = Context::catalog();
        let core = umf_core_wire::decode(core, &mut core_ctx).map_err(py_error)?;
        let mut reference_ctx = Context::catalog();
        let reference = umf_core_wire::decode(reference, &mut reference_ctx).map_err(py_error)?;
        let mut package_ctx = Context::catalog();
        let package = umf_core_wire::decode(package, &mut package_ctx).map_err(py_error)?;
        let mut constraints_ctx = Context::catalog();
        let constraints =
            umf_core_wire::decode(constraints, &mut constraints_ctx).map_err(py_error)?;
        let mut policy_ctx = Context::catalog();
        let policy = umf_core_wire::decode(policy, &mut policy_ctx).map_err(py_error)?;
        let mut ctx = Context::catalog();
        let resources = ResourceSet::new(core, reference, package, constraints, policy);
        Engine::new(resources, &mut ctx)
            .map(|engine| Self { engine })
            .map_err(py_error)
    }

    fn registry(&self) -> PyResult<NativeRegistry> {
        let mut ctx = Context::catalog();
        let package_schema = self
            .engine
            .package_schema()
            .snapshot_with_context(&mut ctx)
            .map_err(py_error)?;
        let schema_resources = self
            .engine
            .schema_resources_with_context(&mut ctx)
            .map_err(py_error)?;
        Ok(NativeRegistry {
            package_schema,
            schema_resources,
            registry: self.engine.registry(&mut ctx).map_err(py_error)?,
            callbacks: HashMap::new(),
            next_token: 1,
        })
    }

    fn inspect_extension_kinds(
        &self,
        py: Python<'_>,
        document_wire: &str,
        registry: PyRef<'_, NativeRegistry>,
    ) -> PyResult<String> {
        let mut ctx = Context::ordinary();
        let document = umf_core_wire::decode(document_wire, &mut ctx).map_err(py_error)?;
        let mut capabilities = PythonCapabilities {
            py,
            callbacks: &registry.callbacks,
        };
        let result = self
            .engine
            .inspect_extension_kinds(&document, &registry.registry, &mut capabilities, &mut ctx)
            .map_err(py_error)?;
        umf_core_wire::encode(&result, &mut umf_core_wire::transport_context()).map_err(py_error)
    }
    #[pyo3(signature = (document, registry, *, max_work=None, meter=None, is_cancelled=None, now=None, deadline_ms=None))]
    fn validate_document(
        &self,
        py: Python<'_>,
        document: &Bound<'_, PyAny>,
        registry: PyRef<'_, NativeRegistry>,
        max_work: Option<usize>,
        meter: Option<PyObject>,
        is_cancelled: Option<PyObject>,
        now: Option<PyObject>,
        deadline_ms: Option<u64>,
    ) -> PyResult<PyObject> {
        for (name, callback) in [
            ("meter", meter.as_ref()),
            ("is_cancelled", is_cancelled.as_ref()),
            ("now", now.as_ref()),
        ] {
            if callback.is_some_and(|value| !value.bind(py).is_callable()) {
                return Err(PyValueError::new_err(format!("{name} must be callable")));
            }
        }
        if deadline_ms.is_some() && now.is_none() {
            return Err(PyValueError::new_err("now is required with deadline_ms"));
        }
        let hook_meter = max_work.is_some() || meter.is_some();
        let hook_cancel = is_cancelled.is_some();
        let hook_clock = deadline_ms.is_some();
        let state = Rc::new(RefCell::new(PythonWorkControl {
            py,
            max_work,
            charged: 0,
            meter,
            is_cancelled,
            now,
            host_callback_failed: false,
        }));
        let mut meter_hook = {
            let state = state.clone();
            move |amount| state.borrow_mut().meter(amount)
        };
        let mut cancel_hook = {
            let state = state.clone();
            move || state.borrow_mut().cancelled()
        };
        let mut clock_hook = {
            let state = state.clone();
            move || state.borrow_mut().clock()
        };
        let mut ctx = Context::ordinary();
        if hook_meter {
            ctx = ctx.with_meter(&mut meter_hook);
        }
        if hook_cancel {
            ctx = ctx.with_fallible_cancellation(&mut cancel_hook);
        }
        if hook_clock {
            ctx = ctx.with_fallible_clock(
                &mut clock_hook,
                deadline_ms.expect("clock hook requires deadline"),
            );
        }
        let mut count = 0;
        let document = match python_value::from_python(py, document, &mut ctx, 0, &mut count) {
            Ok(document) => document,
            Err(error) => return Err(py_error_preserving_origin(py, error, &mut ctx)),
        };
        let mut capabilities = PythonCapabilities {
            py,
            callbacks: &registry.callbacks,
        };
        let validation = match self.engine.validate_python_document(
            &document,
            &registry.registry,
            &mut capabilities,
            &mut ctx,
        ) {
            Ok(validation) => validation,
            Err(error) => return Err(py_error_preserving_origin(py, error, &mut ctx)),
        };
        ctx.charge_work(3, Utf16::default()).map_err(py_error)?;
        let result = PyDict::new_bound(py);
        result.set_item("valid", validation.valid)?;
        result.set_item("complete", validation.complete)?;
        ctx.charge_work(validation.diagnostics.len(), Utf16::default())
            .map_err(py_error)?;
        let diagnostics = PyList::empty_bound(py);
        for diagnostic in validation.diagnostics {
            ctx.charge_work(4, diagnostic.path.clone())
                .map_err(py_error)?;
            let item = PyDict::new_bound(py);
            item.set_item(
                "code",
                diagnostic_text_to_python(
                    py,
                    &diagnostic.code,
                    diagnostic
                        .python_text_origin
                        .as_ref()
                        .and_then(|origin| origin.code.as_ref()),
                    &mut ctx,
                )?,
            )?;
            item.set_item(
                "path",
                diagnostic_path_to_python(py, &diagnostic, &mut ctx)?,
            )?;
            item.set_item(
                "message",
                diagnostic_text_to_python(
                    py,
                    &diagnostic.message,
                    diagnostic
                        .python_text_origin
                        .as_ref()
                        .and_then(|origin| origin.message.as_ref()),
                    &mut ctx,
                )?,
            )?;
            item.set_item(
                "severity",
                match diagnostic.severity {
                    Severity::Error => "error",
                    Severity::Warning => "warning",
                },
            )?;
            diagnostics.append(item)?;
        }
        result.set_item("diagnostics", diagnostics)?;
        Ok(result.unbind().into())
    }

    fn core_structure_diagnostics(
        &self,
        py: Python<'_>,
        document: &Bound<'_, PyAny>,
    ) -> PyResult<PyObject> {
        let mut ctx = Context::ordinary();
        let mut count = 0;
        let document =
            python_value::from_python(py, document, &mut ctx, 0, &mut count).map_err(py_error)?;
        let (projected, _) = document.admit_core_snapshot(&mut ctx).map_err(py_error)?;
        let diagnostics = self
            .engine
            .core_structure_diagnostics(&projected, &mut ctx)
            .map_err(py_error)?;
        diagnostics_to_python(py, diagnostics, &mut ctx)
    }

    fn run_core_constraints(
        &self,
        py: Python<'_>,
        document: &Bound<'_, PyAny>,
        registry: PyRef<'_, NativeRegistry>,
    ) -> PyResult<PyObject> {
        let mut ctx = Context::ordinary();
        let mut count = 0;
        let document =
            python_value::from_python(py, document, &mut ctx, 0, &mut count).map_err(py_error)?;
        let mut capabilities = PythonCapabilities {
            py,
            callbacks: &registry.callbacks,
        };
        let diagnostics = self
            .engine
            .run_python_core_constraints(&document, &registry.registry, &mut capabilities, &mut ctx)
            .map_err(py_error)?;
        diagnostics_to_python(py, diagnostics, &mut ctx)
    }

    #[pyo3(signature = (op, args, *, max_work=None, meter=None, is_cancelled=None, now=None, deadline_ms=None))]
    fn semantic_types_operation(
        &self,
        py: Python<'_>,
        op: &str,
        args: &Bound<'_, PyTuple>,
        max_work: Option<usize>,
        meter: Option<PyObject>,
        is_cancelled: Option<PyObject>,
        now: Option<PyObject>,
        deadline_ms: Option<u64>,
    ) -> PyResult<PyObject> {
        for (name, callback) in [
            ("meter", meter.as_ref()),
            ("is_cancelled", is_cancelled.as_ref()),
            ("now", now.as_ref()),
        ] {
            if callback.is_some_and(|value| !value.bind(py).is_callable()) {
                return Err(PyValueError::new_err(format!("{name} must be callable")));
            }
        }
        if deadline_ms.is_some() && now.is_none() {
            return Err(PyValueError::new_err("now is required with deadline_ms"));
        }
        let expected = match op {
            "inspectCoreSemanticTypes"
            | "getCoreSemanticTypes"
            | "verifyCoreSemanticTypeDeclaration" => 2,
            "declareCoreSemanticTypes" => 3,
            "getSemanticTypes" => 3,
            "setSemanticTypes" => 4,
            _ => return Err(PyValueError::new_err("Unknown semantic type operation")),
        };
        if args.len() != expected {
            return Err(PyValueError::new_err(
                "Incorrect semantic type operation arguments",
            ));
        }
        let hook_meter = max_work.is_some() || meter.is_some();
        let hook_cancel = is_cancelled.is_some();
        let hook_clock = deadline_ms.is_some();
        let state = Rc::new(RefCell::new(PythonWorkControl {
            py,
            max_work,
            charged: 0,
            meter,
            is_cancelled,
            now,
            host_callback_failed: false,
        }));
        let mut meter_hook = {
            let state = state.clone();
            move |amount| state.borrow_mut().meter(amount)
        };
        let mut cancel_hook = {
            let state = state.clone();
            move || state.borrow_mut().cancelled()
        };
        let mut clock_hook = {
            let state = state.clone();
            move || state.borrow_mut().clock()
        };
        let mut ctx = Context::ordinary();
        if hook_meter {
            ctx = ctx.with_meter(&mut meter_hook);
        }
        if hook_cancel {
            ctx = ctx.with_fallible_cancellation(&mut cancel_hook);
        }
        if hook_clock {
            ctx = ctx.with_fallible_clock(
                &mut clock_hook,
                deadline_ms.expect("clock hook requires deadline"),
            );
        }
        // Preflight before reflection or conversion of the first caller value.
        ctx.charge_work(1, Utf16::default()).map_err(py_error)?;

        let convert = |index: usize, ctx: &mut Context<'_>| -> PyResult<Value> {
            let item = args.get_item(index)?;
            let mut count = 0;
            let admitted = python_value::from_python(py, &item, ctx, 0, &mut count)
                .map_err(|error| py_error_preserving_origin(py, error, ctx))?;
            admitted
                .project_schema_to_core(ctx)
                .map_err(|error| py_error_preserving_origin(py, error, ctx))
        };
        let mut no_capabilities = NoPythonCapabilities;
        let mut registry = self
            .engine
            .registry(&mut ctx)
            .map_err(|error| py_error_preserving_origin(py, error, &mut ctx))?;
        let result = match op {
            "inspectCoreSemanticTypes" => {
                let document = convert(0, &mut ctx)?;
                let identity = convert(1, &mut ctx)?;
                umf_core::core_semantic_types::inspect_core_semantic_types(&document, &identity, &self.engine, &registry, &mut no_capabilities, &mut ctx)
                    .map(Some)
            }
            "getCoreSemanticTypes" => {
                let document = convert(0, &mut ctx)?;
                let identity = convert(1, &mut ctx)?;
                umf_core::core_semantic_types::get_core_semantic_types(&document, &identity, &self.engine, &registry, &mut no_capabilities, &mut ctx)
            }
            "declareCoreSemanticTypes" => {
                // The TypeScript predecessor admits and validates the types
                // request before reading source or identity.
                let types = convert(2, &mut ctx)?;
                let admit = |index: usize, ctx: &mut Context<'_>| -> Result<Value, EngineError> {
                    let item = args.get_item(index).map_err(|_| EngineError::new("PYTHON_VALUE", Utf16::default(), "Could not access semantic operation argument"))?;
                    let mut count = 0;
                    let value = python_value::from_python(py, &item, ctx, 0, &mut count)?;
                    value.project_schema_to_core(ctx)
                };
                umf_core::core_semantic_types::declare_core_semantic_types_with_inputs(
                    &types, &self.engine, &registry, &mut no_capabilities, &mut ctx,
                    |ctx| Ok((admit(0, ctx)?, admit(1, ctx)?)),
                ).map(Some)
            }
            "verifyCoreSemanticTypeDeclaration" => {
                let receipt = convert(0, &mut ctx)?;
                let current = args.get_item(1)?;
                umf_core::core_semantic_types::verify_core_semantic_type_declaration_with_current(
                    &receipt, &self.engine, &registry, &mut no_capabilities, &mut ctx,
                    |ctx| {
                        let mut count = 0;
                        let admitted = python_value::from_python(py, &current, ctx, 0, &mut count)?;
                        admitted.project_schema_to_core(ctx)
                    },
                ).map(Some)
            }
            "getSemanticTypes" | "setSemanticTypes" => {
                let document = convert(0, &mut ctx)?;
                let module = convert(1, &mut ctx)?;
                let element = convert(2, &mut ctx)?;
                let module = match module { Value::String(text) => text, _ => return Err(PyValueError::new_err("module must be a string")) };
                let element = match element { Value::String(text) => text, _ => return Err(PyValueError::new_err("element must be a string")) };
                if op == "getSemanticTypes" {
                    umf_core::semantic_type_accessors::get_semantic_types_units(&document, &module, &element, &self.engine, &mut ctx).map(Some)
                } else {
                    umf_core::semantic_type_accessors::set_semantic_types_units_optional_with_annotation(
                        &document, &module, &element, &self.engine, &mut ctx,
                        |ctx| {
                            let item = args.get_item(3).map_err(|_| EngineError::new("PYTHON_VALUE", Utf16::default(), "Could not access annotation argument"))?;
                            let mut count = 0;
                            let admitted = python_value::from_python(py, &item, ctx, 0, &mut count)?;
                            let value = admitted.project_schema_to_core(ctx)?;
                            umf_core::copy_json(&value, ctx).map(Some)
                        },
                    ).map(Some)
                }
            }
            _ => unreachable!(),
        }.map_err(|error| py_error_preserving_origin(py, error, &mut ctx))?;
        match result {
            Some(value) => {
                let projected = core_value_to_python_consumer(&value, &mut ctx)
                    .map_err(|error| py_error_preserving_origin(py, error, &mut ctx))?;
                python_value::to_python(py, &projected, &mut ctx)
            }
            None => Ok(py.None()),
        }
    }
}

struct NoPythonCapabilities;
impl Capabilities for NoPythonCapabilities {
    fn validate_extension(
        &mut self,
        _: u64,
        _: &Value,
        _: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        Err(Utf16::from("No Python extension callback is registered"))
    }
}

fn core_value_to_python_consumer(
    value: &Value,
    ctx: &mut Context<'_>,
) -> Result<PythonConsumerValue, EngineError> {
    fn text(units: &[u16], ctx: &mut Context<'_>) -> Result<umf_core::PyText, EngineError> {
        ctx.charge_work(units.len(), Utf16::default())?;
        let mut points = Vec::with_capacity(units.len());
        let mut index = 0;
        while index < units.len() {
            let first = units[index];
            if (0xd800..=0xdbff).contains(&first)
                && units
                    .get(index + 1)
                    .is_some_and(|next| (0xdc00..=0xdfff).contains(next))
            {
                let second = units[index + 1];
                points.push(
                    0x10000 + (((u32::from(first) - 0xd800) << 10) | (u32::from(second) - 0xdc00)),
                );
                index += 2;
            } else {
                points.push(u32::from(first));
                index += 1;
            }
        }
        umf_core::PyText::from_codepoints(points)
    }
    ctx.charge_work(1, Utf16::default())?;
    Ok(match value {
        Value::Null => PythonConsumerValue::Null,
        Value::Bool(value) => PythonConsumerValue::Bool(*value),
        Value::Number(value) => PythonConsumerValue::float(*value),
        Value::String(value) => PythonConsumerValue::String(text(value.units(), ctx)?),
        Value::Array(values) => PythonConsumerValue::Array(
            values
                .iter()
                .map(|item| core_value_to_python_consumer(item, ctx))
                .collect::<Result<_, _>>()?,
        ),
        Value::Object(fields) => PythonConsumerValue::Object(
            fields
                .iter()
                .map(|(key, value)| {
                    Ok((
                        text(key.units(), ctx)?,
                        core_value_to_python_consumer(value, ctx)?,
                    ))
                })
                .collect::<Result<_, EngineError>>()?,
        ),
    })
}

fn diagnostics_to_python(
    py: Python<'_>,
    diagnostics: Vec<Diagnostic>,
    ctx: &mut Context<'_>,
) -> PyResult<PyObject> {
    ctx.charge_work(diagnostics.len(), Utf16::default())
        .map_err(py_error)?;
    let output = PyList::empty_bound(py);
    for diagnostic in diagnostics {
        ctx.charge_work(4, diagnostic.path.clone())
            .map_err(py_error)?;
        let item = PyDict::new_bound(py);
        item.set_item(
            "code",
            diagnostic_text_to_python(
                py,
                &diagnostic.code,
                diagnostic
                    .python_text_origin
                    .as_ref()
                    .and_then(|origin| origin.code.as_ref()),
                ctx,
            )?,
        )?;
        item.set_item("path", diagnostic_path_to_python(py, &diagnostic, ctx)?)?;
        item.set_item(
            "message",
            diagnostic_text_to_python(
                py,
                &diagnostic.message,
                diagnostic
                    .python_text_origin
                    .as_ref()
                    .and_then(|origin| origin.message.as_ref()),
                ctx,
            )?,
        )?;
        item.set_item(
            "severity",
            match diagnostic.severity {
                Severity::Error => "error",
                Severity::Warning => "warning",
            },
        )?;
        output.append(item)?;
    }
    Ok(output.unbind().into())
}

fn diagnostic_text_to_python(
    py: Python<'_>,
    text: &Utf16,
    origin: Option<&umf_core::PyText>,
    ctx: &mut Context<'_>,
) -> PyResult<PyObject> {
    if let Some(origin) = origin {
        return python_value::to_python(py, &PythonConsumerValue::String(origin.clone()), ctx);
    }
    py_text(py, text, ctx)
}

fn diagnostic_path_to_python(
    py: Python<'_>,
    diagnostic: &Diagnostic,
    ctx: &mut Context<'_>,
) -> PyResult<PyObject> {
    if let Some(origin) = diagnostic
        .python_text_origin
        .as_ref()
        .and_then(|origin| origin.path.as_ref())
    {
        return python_value::to_python(py, &PythonConsumerValue::String(origin.clone()), ctx);
    }
    if !diagnostic.python_source_path {
        return py_text(py, &diagnostic.path, ctx);
    }
    let decoded = umf_core::python_value::python_path_from_internal(&diagnostic.path);
    let value = PythonConsumerValue::String(decoded);
    python_value::to_python(py, &value, ctx)
}

struct PythonWorkControl<'py> {
    py: Python<'py>,
    max_work: Option<usize>,
    charged: usize,
    meter: Option<PyObject>,
    is_cancelled: Option<PyObject>,
    now: Option<PyObject>,
    host_callback_failed: bool,
}

impl PythonWorkControl<'_> {
    fn meter(&mut self, amount: usize) -> Result<(), EngineError> {
        if self.host_callback_failed {
            return Ok(());
        }
        self.charged = self.charged.saturating_add(amount);
        if self.max_work.is_some_and(|limit| self.charged > limit) {
            return Err(EngineError::new(
                "RESOURCE_LIMIT",
                Utf16::default(),
                "Host work budget exceeded",
            ));
        }
        if amount > 0 {
            if let Some(callback) = &self.meter {
                if let Err(error) = callback.bind(self.py).call1((amount,)) {
                    self.host_callback_failed = true;
                    return Err(py_exception_engine_error(self.py, "METER_FAILURE", error));
                }
            }
        }
        Ok(())
    }

    fn cancelled(&mut self) -> Result<bool, EngineError> {
        if self.host_callback_failed {
            return Ok(false);
        }
        let Some(callback) = &self.is_cancelled else {
            return Ok(false);
        };
        let value = match callback.bind(self.py).call0() {
            Ok(value) => value,
            Err(error) => {
                self.host_callback_failed = true;
                return Err(py_exception_engine_error(
                    self.py,
                    "CANCELLATION_CAPABILITY",
                    error,
                ));
            }
        };
        match value.extract::<bool>() {
            Ok(value) => Ok(value),
            Err(error) => {
                self.host_callback_failed = true;
                Err(py_exception_engine_error(
                    self.py,
                    "CANCELLATION_CAPABILITY",
                    error,
                ))
            }
        }
    }

    fn clock(&mut self) -> Result<Option<u64>, EngineError> {
        if self.host_callback_failed {
            return Ok(Some(0));
        }
        let Some(clock) = &self.now else {
            return Ok(None);
        };
        let value = match clock.bind(self.py).call0() {
            Ok(value) => value,
            Err(error) => {
                self.host_callback_failed = true;
                return Err(py_exception_engine_error(
                    self.py,
                    "CLOCK_CAPABILITY",
                    error,
                ));
            }
        };
        if value.is_none() {
            return Ok(None);
        }
        match value.extract::<u64>() {
            Ok(value) => Ok(Some(value)),
            Err(error) => {
                self.host_callback_failed = true;
                Err(py_exception_engine_error(
                    self.py,
                    "CLOCK_CAPABILITY",
                    error,
                ))
            }
        }
    }
}

#[pymethods]
impl NativeRegistry {
    #[pyo3(signature = (manifest_wire, callback=None, kinds=false))]
    fn register_manifest(
        &mut self,
        manifest_wire: &str,
        callback: Option<PyObject>,
        kinds: bool,
    ) -> PyResult<()> {
        let mut ctx = Context::catalog();
        let manifest = umf_core_wire::decode(manifest_wire, &mut ctx).map_err(py_error)?;
        let token = callback.as_ref().map(|_| self.next_token);
        if kinds {
            self.registry
                .register_kind_package(
                    &manifest,
                    token,
                    &self.package_schema,
                    &self.schema_resources,
                    &mut ctx,
                )
                .map_err(py_error)?;
        } else {
            self.registry
                .register(
                    &manifest,
                    token,
                    &self.package_schema,
                    &self.schema_resources,
                    &mut ctx,
                )
                .map_err(py_error)?;
        }
        if let (Some(token), Some(callback)) = (token, callback) {
            self.callbacks.insert(token, callback);
            self.next_token += 1;
        }
        Ok(())
    }
    fn list_kinds(&self) -> PyResult<String> {
        let mut ctx = Context::ordinary();
        let result = self.registry.list_kinds(&mut ctx).map_err(py_error)?;
        umf_core_wire::encode(&result, &mut umf_core_wire::transport_context()).map_err(py_error)
    }
    fn get_kind(&self, reference_wire: &str) -> PyResult<String> {
        let mut ctx = Context::ordinary();
        let reference = umf_core_wire::decode(reference_wire, &mut ctx).map_err(py_error)?;
        let result = self
            .registry
            .get_kind(&reference, &mut ctx)
            .map_err(py_error)?
            .unwrap_or(Value::Null);
        umf_core_wire::encode(&result, &mut umf_core_wire::transport_context()).map_err(py_error)
    }
    #[pyo3(signature = (id, version, scopes, schema, python_minor, callback=None))]
    fn register(
        &mut self,
        py: Python<'_>,
        id: &Bound<'_, PyAny>,
        version: &Bound<'_, PyAny>,
        scopes: Vec<Bound<'_, PyAny>>,
        schema: &Bound<'_, PyAny>,
        python_minor: u8,
        callback: Option<PyObject>,
    ) -> PyResult<()> {
        let mut ctx = Context::catalog();
        let id = extract_utf16(py, id)?;
        let version = extract_utf16(py, version)?;
        let scopes = scopes
            .iter()
            .map(|scope| extract_utf16(py, scope))
            .collect::<PyResult<Vec<_>>>()?;
        let mut count = 0;
        let schema =
            python_value::from_python(py, schema, &mut ctx, 0, &mut count).map_err(py_error)?;
        let python_schema_resources =
            PythonSchemaResources::from_core(&self.schema_resources, &mut ctx).map_err(py_error)?;
        let token = callback.as_ref().map(|_| self.next_token);
        let python_version =
            umf_core::PythonReVersion::from_minor(python_minor).map_err(|error| {
                py_error(EngineError::new(
                    error.code(),
                    Utf16::default(),
                    error.message(),
                ))
            })?;
        self.registry
            .register_extension_python_source(
                id,
                version,
                scopes,
                schema,
                token.is_some(),
                token,
                python_version,
                &self.package_schema,
                &self.schema_resources,
                &python_schema_resources,
                &mut ctx,
            )
            .map_err(py_error)?;
        if let (Some(token), Some(callback)) = (token, callback) {
            self.callbacks.insert(token, callback);
            self.next_token += 1;
        }
        Ok(())
    }
}

struct PythonCapabilities<'a, 'py> {
    py: Python<'py>,
    callbacks: &'a HashMap<u64, PyObject>,
}

impl PythonCapabilities<'_, '_> {
    fn invoke(
        &mut self,
        token: u64,
        payload: &Value,
        context: &SemanticContext,
        ctx: &mut Context<'_>,
    ) -> Result<Vec<Diagnostic>, CapabilityError> {
        let callback = self.callbacks.get(&token).ok_or_else(|| {
            CapabilityError::Host(Utf16::from("trusted Python callback token is missing"))
        })?;
        let payload = if let Some(source) = context.source_payload.as_deref() {
            python_value::to_python(self.py, source, ctx)
                .map_err(|error| CapabilityError::Host(py_error_utf16(self.py, error)))?
        } else {
            python_value(self.py, payload, ctx)?
        };
        let document = if let Some(source) = context.source_document.as_deref() {
            python_value::to_python(self.py, source, ctx)
                .map_err(|error| CapabilityError::Host(py_error_utf16(self.py, error)))?
        } else {
            python_value(self.py, &context.document, ctx)?
        };
        ctx.charge_work(
            context.path.len().saturating_add(context.scope.len()),
            Utf16::default(),
        )
        .map_err(CapabilityError::Engine)?;
        let path = py_text(self.py, &context.path, ctx)
            .map_err(|error| CapabilityError::Host(py_error_utf16(self.py, error)))?;
        let kwargs = PyDict::new_bound(self.py);
        kwargs
            .set_item("document", document)
            .map_err(|error| CapabilityError::Host(py_error_utf16(self.py, error)))?;
        kwargs
            .set_item("scope", context.scope.as_str())
            .map_err(|error| CapabilityError::Host(py_error_utf16(self.py, error)))?;
        kwargs
            .set_item("path", path)
            .map_err(|error| CapabilityError::Host(py_error_utf16(self.py, error)))?;
        let returned = callback
            .bind(self.py)
            .call1((payload, kwargs))
            .map_err(|error| capability_py_error(self.py, error, ctx))?;
        let items: Vec<Bound<'_, PyAny>> = if let Ok(list) = returned.downcast::<PyList>() {
            ctx.charge_work(list.len(), context.path.clone())
                .map_err(CapabilityError::Engine)?;
            list.iter().collect()
        } else if let Ok(tuple) = returned.downcast::<PyTuple>() {
            ctx.charge_work(tuple.len(), context.path.clone())
                .map_err(CapabilityError::Engine)?;
            tuple.iter().collect()
        } else {
            return Err(CapabilityError::Host(Utf16::from(
                "Extension callback must return Diagnostic objects",
            )));
        };
        items
            .into_iter()
            .map(|item| {
                ctx.charge_work(3, context.path.clone())
                    .map_err(CapabilityError::Engine)?;
                let code_py = item
                    .getattr("code")
                    .map_err(|error| capability_py_error(self.py, error, ctx))?;
                let code = python_value::pytext_from_python(&code_py, ctx)
                    .map_err(CapabilityError::Engine)?;
                let path_py = item
                    .getattr("path")
                    .map_err(|error| capability_py_error(self.py, error, ctx))?;
                let path = python_value::pytext_from_python(&path_py, ctx)
                    .map_err(CapabilityError::Engine)?;
                let message_py = item
                    .getattr("message")
                    .map_err(|error| capability_py_error(self.py, error, ctx))?;
                let message = python_value::pytext_from_python(&message_py, ctx)
                    .map_err(CapabilityError::Engine)?;
                let severity = match item
                    .getattr("severity")
                    .and_then(|v| v.extract::<String>())
                    .map_err(|error| CapabilityError::Host(py_error_utf16(self.py, error)))?
                    .as_str()
                {
                    "error" => Severity::Error,
                    "warning" => Severity::Warning,
                    _ => {
                        return Err(CapabilityError::Host(Utf16::from(
                            "Extension callback diagnostic severity must be error or warning",
                        )));
                    }
                };
                let diagnostic = Diagnostic {
                    code: pytext_utf16(&code),
                    path: pytext_utf16(&path),
                    message: pytext_utf16(&message),
                    severity,
                    python_source_path: false,
                    python_text_origin: Some(PythonDiagnosticText {
                        code: Some(code),
                        path: Some(path),
                        message: Some(message),
                    }),
                };
                Ok(diagnostic)
            })
            .collect()
    }
}

impl Capabilities for PythonCapabilities<'_, '_> {
    fn validate_extension(
        &mut self,
        token: u64,
        payload: &Value,
        context: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        let mut ctx = umf_core_wire::transport_context();
        self.invoke(token, payload, context, &mut ctx)
            .map_err(|error| match error {
                CapabilityError::Host(message) => message,
                CapabilityError::HostPython { message, .. } => message,
                CapabilityError::Engine(error) => error.message,
            })
    }

    fn validate_extension_with_context(
        &mut self,
        token: u64,
        payload: &Value,
        context: &SemanticContext,
        ctx: &mut Context<'_>,
    ) -> Result<Vec<Diagnostic>, CapabilityError> {
        self.invoke(token, payload, context, ctx)
    }
}

fn python_value(
    py: Python<'_>,
    value: &Value,
    ctx: &mut Context<'_>,
) -> Result<PyObject, CapabilityError> {
    let wire = umf_core_wire::encode(value, ctx).map_err(CapabilityError::Engine)?;
    let json_value = py
        .import_bound("json")
        .and_then(|module| module.getattr("loads"))
        .and_then(|loads| loads.call1((wire,)))
        .map_err(|error| CapabilityError::Host(py_error_utf16(py, error)))?;
    let helper = py
        .import_bound("umf._rust")
        .and_then(|module| module.getattr("_from_wire"))
        .map_err(|error| CapabilityError::Host(py_error_utf16(py, error)))?;
    helper
        .call1((json_value,))
        .map(|value| value.unbind())
        .map_err(|error| CapabilityError::Host(py_error_utf16(py, error)))
}

fn py_text(py: Python<'_>, text: &Utf16, ctx: &mut Context<'_>) -> PyResult<PyObject> {
    let cost = text.len().checked_mul(2).ok_or_else(|| {
        py_error(EngineError::new(
            "LIMIT",
            Utf16::default(),
            "Python UTF-16 conversion cost overflow",
        ))
    })?;
    ctx.charge_work(cost, Utf16::default()).map_err(py_error)?;
    let mut bytes = Vec::with_capacity(text.len() * 2);
    for unit in text.units() {
        bytes.extend_from_slice(&unit.to_le_bytes());
    }
    Ok(PyBytes::new_bound(py, &bytes)
        .call_method1("decode", ("utf-16-le", "surrogatepass"))?
        .unbind())
}

fn extract_utf16(py: Python<'_>, value: &Bound<'_, PyAny>) -> PyResult<Utf16> {
    let encoded = value.call_method1("encode", ("utf-16-le", "surrogatepass"))?;
    let bytes = encoded.downcast::<PyBytes>()?.as_bytes();
    if bytes.len() % 2 != 0 {
        return Err(PyValueError::new_err(
            "UTF-16 encoding has an odd byte count",
        ));
    }
    Ok(Utf16::new(
        bytes
            .chunks_exact(2)
            .map(|unit| u16::from_le_bytes([unit[0], unit[1]]))
            .collect(),
    ))
}

fn pytext_utf16(text: &umf_core::PyText) -> Utf16 {
    let mut units = Vec::new();
    for point in text.codepoints() {
        if *point <= 0xffff {
            units.push(*point as u16);
        } else {
            let value = *point - 0x10000;
            units.push(0xd800 + ((value >> 10) as u16));
            units.push(0xdc00 + ((value & 0x3ff) as u16));
        }
    }
    Utf16::new(units)
}

fn py_exception_engine_error(py: Python<'_>, code: &str, error: PyErr) -> EngineError {
    let origin = error
        .value_bound(py)
        .str()
        .ok()
        .and_then(|value| {
            let mut ctx = Context::ordinary();
            python_value::pytext_from_python(&value, &mut ctx).ok()
        })
        .unwrap_or_else(|| {
            umf_core::PyText::from_codepoints(
                "Python callback failed".chars().map(u32::from).collect(),
            )
            .expect("static valid Python text")
        });
    let mut result = EngineError::new(code, Utf16::default(), pytext_utf16(&origin));
    result.python_message_origin = Some(origin);
    result
}

fn capability_py_error(py: Python<'_>, error: PyErr, ctx: &mut Context<'_>) -> CapabilityError {
    match error.value_bound(py).str() {
        Ok(value) => match python_value::pytext_from_python(&value, ctx) {
            Ok(origin) => CapabilityError::HostPython {
                message: pytext_utf16(&origin),
                source: origin,
            },
            Err(error) => CapabilityError::Engine(error),
        },
        Err(_) => CapabilityError::Host(Utf16::from("Python callback failed")),
    }
}

fn py_error(error: EngineError) -> PyErr {
    PyValueError::new_err(umf_core_wire::error_envelope(error))
}

fn py_error_preserving_origin(py: Python<'_>, error: EngineError, ctx: &mut Context<'_>) -> PyErr {
    let Some(origin) = error.python_message_origin.as_ref() else {
        return py_error(error);
    };
    let message =
        match python_value::to_python(py, &PythonConsumerValue::String(origin.clone()), ctx) {
            Ok(message) => message,
            Err(_) => return py_error(error),
        };
    let path = match py_text(py, &error.path, ctx) {
        Ok(path) => path,
        Err(_) => return py_error(error),
    };
    let value = py
        .import_bound("umf._rust")
        .and_then(|module| module.getattr("UmfCoreError"))
        .and_then(|class| class.call1((error.code.clone(), message, path)));
    match value {
        Ok(value) => PyErr::from_value_bound(value),
        Err(_) => py_error(error),
    }
}

fn parse_format(format: &str) -> PyResult<umf_core::serialization::Format> {
    match format {
        "json" => Ok(umf_core::serialization::Format::Json),
        "yaml" => Ok(umf_core::serialization::Format::Yaml),
        _ => Err(py_error(EngineError::new(
            "FORMAT",
            Utf16::default(),
            "Format must be json or yaml",
        ))),
    }
}

fn py_error_utf16(py: Python<'_>, error: PyErr) -> Utf16 {
    match error
        .value_bound(py)
        .str()
        .and_then(|value| extract_utf16(py, &value))
    {
        Ok(message) => message,
        Err(_) => Utf16::from("Python callback failed"),
    }
}

#[pymodule]
fn _rust_core(module: &Bound<'_, PyModule>) -> PyResult<()> {
    module.add_function(wrap_pyfunction!(execute_semantic_value_wire, module)?)?;
    module.add_function(wrap_pyfunction!(execute_codegen_wire, module)?)?;
    module.add_function(wrap_pyfunction!(copy_json_wire, module)?)?;
    module.add_function(wrap_pyfunction!(
        access_catalog_custody_profile_version,
        module
    )?)?;
    module.add_function(wrap_pyfunction!(access_native_column_bindings, module)?)?;
    module.add_function(wrap_pyfunction!(
        access_catalog_source_join_profile_version,
        module
    )?)?;
    module.add_function(wrap_pyfunction!(
        access_check_native_column_sources,
        module
    )?)?;
    module.add_function(wrap_pyfunction!(access_catalog_logical_render_profile_version, module)?)?;
    module.add_function(wrap_pyfunction!(access_catalog_render_logical_variant, module)?)?;
    module.add_function(wrap_pyfunction!(copy_python_consumer_value, module)?)?;
    module.add_function(wrap_pyfunction!(copy_python_json_value, module)?)?;
    module.add_function(wrap_pyfunction!(engine_version, module)?)?;
    module.add_function(wrap_pyfunction!(codegen_protocol_version, module)?)?;
    module.add_function(wrap_pyfunction!(access_temporal_canonical_token, module)?)?;
    module.add_function(wrap_pyfunction!(access_temporal_profile_version, module)?)?;
    module.add_function(wrap_pyfunction!(access_values_profile_version, module)?)?;
    module.add_function(wrap_pyfunction!(
        access_reviewed_parameter_profile_version,
        module
    )?)?;
    module.add_function(wrap_pyfunction!(
        access_values_string_profile_version,
        module
    )?)?;
    module.add_function(wrap_pyfunction!(access_values_validate_string, module)?)?;
    module.add_function(wrap_pyfunction!(operation_values_profile_version, module)?)?;
    module.add_function(wrap_pyfunction!(avro_fields_profile_version, module)?)?;
    module.add_function(wrap_pyfunction!(iceberg_schema_profile_version, module)?)?;
    module.add_function(wrap_pyfunction!(execute_iceberg_wire, module)?)?;
    module.add_function(wrap_pyfunction!(protobuf_inspect_profile_version, module)?)?;
    module.add_function(wrap_pyfunction!(avro_inspect_profile_version, module)?)?;
    module.add_function(wrap_pyfunction!(execute_avro_inspect_wire, module)?)?;
    module.add_function(wrap_pyfunction!(avro_candidate_profile_version, module)?)?;
    module.add_function(wrap_pyfunction!(execute_avro_candidate_wire, module)?)?;
    module.add_function(wrap_pyfunction!(execute_protobuf_inspect_wire, module)?)?;
    module.add_function(wrap_pyfunction!(json_schema_profile_version, module)?)?;
    module.add_function(wrap_pyfunction!(execute_json_schema_wire, module)?)?;
    module.add_function(wrap_pyfunction!(avro_fields_derive, module)?)?;
    module.add_function(wrap_pyfunction!(outcome_values_profile_version, module)?)?;
    module.add_function(wrap_pyfunction!(outcome_values_capabilities, module)?)?;
    module.add_function(wrap_pyfunction!(outcome_values_hmac_sha256, module)?)?;
    module.add_function(wrap_pyfunction!(outcome_values_slot_sha256, module)?)?;
    module.add_function(wrap_pyfunction!(outcome_values_signature_matches, module)?)?;
    module.add_function(wrap_pyfunction!(operation_canonical, module)?)?;
    module.add_function(wrap_pyfunction!(operation_bounded_size, module)?)?;
    module.add_function(wrap_pyfunction!(operation_digest, module)?)?;
    module.add_function(wrap_pyfunction!(operation_loads, module)?)?;
    module.add_function(wrap_pyfunction!(operation_token_encode, module)?)?;
    module.add_function(wrap_pyfunction!(operation_token_decode, module)?)?;
    module.add_function(wrap_pyfunction!(operation_key_literal_mode, module)?)?;
    module.add_function(wrap_pyfunction!(operation_native_token_classify, module)?)?;
    module.add_function(wrap_pyfunction!(operation_native_result_classify, module)?)?;
    module.add_function(wrap_pyfunction!(
        related_keys::related_keys_profile_version,
        module
    )?)?;
    module.add_function(wrap_pyfunction!(related_keys::related_keys_parse, module)?)?;
    module.add_function(wrap_pyfunction!(
        protobuf_descriptor_profile_version,
        module
    )?)?;
    module.add_function(wrap_pyfunction!(protobuf_read_descriptor_set, module)?)?;
    module.add_function(wrap_pyfunction!(protobuf_write_descriptor_set, module)?)?;
    module.add_function(wrap_pyfunction!(access_float32_profile_version, module)?)?;
    module.add_function(wrap_pyfunction!(access_float32_classify, module)?)?;
    module.add_function(wrap_pyfunction!(access_range_profile_version, module)?)?;
    module.add_function(wrap_pyfunction!(access_range_compare_integer, module)?)?;
    module.add_function(wrap_pyfunction!(access_range_compare_decimal, module)?)?;
    module.add_function(wrap_pyfunction!(
        access_constraints_profile_version,
        module
    )?)?;
    module.add_function(wrap_pyfunction!(
        access_stream_page_size_profile_version,
        module
    )?)?;
    module.add_function(wrap_pyfunction!(
        access_stream_page_size_request_valid,
        module
    )?)?;
    module.add_function(wrap_pyfunction!(
        access_stream_page_size_missing_domain_valid,
        module
    )?)?;
    module.add_function(wrap_pyfunction!(
        access_stream_page_size_domain_type_valid,
        module
    )?)?;
    module.add_function(wrap_pyfunction!(
        access_stream_page_size_domain_keys_valid,
        module
    )?)?;
    module.add_function(wrap_pyfunction!(
        access_stream_page_size_domain_parameter_valid,
        module
    )?)?;
    module.add_function(wrap_pyfunction!(
        access_stream_page_size_minimum_valid,
        module
    )?)?;
    module.add_function(wrap_pyfunction!(
        access_stream_page_size_minimum_comparison_valid,
        module
    )?)?;
    module.add_function(wrap_pyfunction!(
        access_stream_page_size_minimum_exact_value_valid,
        module
    )?)?;
    module.add_function(wrap_pyfunction!(
        access_stream_page_size_maximum_valid,
        module
    )?)?;
    module.add_function(wrap_pyfunction!(
        access_stream_page_size_maximum_comparison_valid,
        module
    )?)?;
    module.add_function(wrap_pyfunction!(
        access_stream_page_size_maximum_exact_value_valid,
        module
    )?)?;
    module.add_function(wrap_pyfunction!(
        access_stream_page_size_row_cap_valid,
        module
    )?)?;
    module.add_function(wrap_pyfunction!(
        access_stream_page_size_slot_count_valid,
        module
    )?)?;
    module.add_function(wrap_pyfunction!(
        access_stream_page_size_slot_carrier_valid,
        module
    )?)?;
    module.add_function(wrap_pyfunction!(
        access_stream_page_size_slot_nullability_valid,
        module
    )?)?;
    module.add_function(wrap_pyfunction!(
        access_stream_page_size_final_maximum_valid,
        module
    )?)?;
    module.add_function(wrap_pyfunction!(access_constraints_length_within, module)?)?;
    module.add_function(wrap_pyfunction!(access_constraints_equal_boolean, module)?)?;
    module.add_function(wrap_pyfunction!(access_constraints_equal_integer, module)?)?;
    module.add_function(wrap_pyfunction!(access_constraints_equal_text, module)?)?;
    module.add_function(wrap_pyfunction!(access_constraints_equal_bytes, module)?)?;
    module.add_function(wrap_pyfunction!(access_constraints_equal_decimal, module)?)?;
    module.add_function(wrap_pyfunction!(access_values_integer_fits, module)?)?;
    module.add_function(wrap_pyfunction!(access_values_validate_decimal, module)?)?;
    module.add_function(wrap_pyfunction!(read_value_wire, module)?)?;
    module.add_function(wrap_pyfunction!(write_value, module)?)?;
    module.add_function(wrap_pyfunction!(read_python_value, module)?)?;
    module.add_function(wrap_pyfunction!(write_python_value, module)?)?;
    module.add_function(wrap_pyfunction!(validate_schema_wire, module)?)?;
    module.add_function(wrap_pyfunction!(check_schema_wire, module)?)?;
    module.add_function(wrap_pyfunction!(literal_errors_wire, module)?)?;
    module.add_function(wrap_pyfunction!(literal_identity_wire, module)?)?;
    module.add_function(wrap_pyfunction!(numeric_interval_wire, module)?)?;
    module.add_class::<NativeEngine>()?;
    module.add_class::<PyReviewedParameterScanner>()?;
    module.add_class::<NativeRegistry>()?;
    module.add_class::<NativePythonSchema>()?;
    Ok(())
}
