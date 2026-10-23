use std::{cell::RefCell, collections::HashMap, rc::Rc};

use pyo3::{
    exceptions::PyValueError,
    prelude::*,
    types::{PyBool, PyBytes, PyDict, PyFloat, PyInt, PyList, PyTuple},
};
use num_bigint::BigInt;
use umf_core::{
    Capabilities, CapabilityError, Context, Diagnostic, Engine, EngineError, PythonDiagnosticText,
    Registry, ResourceSet, SemanticContext, Severity, Utf16, Value,
};
use umf_core::{
    PythonCompiledSchema, PythonConsumerValue, PythonSchemaPathSegment, PythonSchemaResources,
};

mod python_value;

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
    let byte_len = bits.saturating_add(8).checked_div(8).unwrap_or(usize::MAX).max(1);
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
fn operation_values_profile_version() -> &'static str {
    umf_core::operation_values::PROFILE_VERSION
}

#[pyfunction]
fn operation_canonical(json_text: &str) -> PyResult<String> {
    umf_core::operation_values::canonical(json_text).map_err(|e| PyValueError::new_err(e.to_string()))
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
    let bits = value.call_method0("bit_length").ok()?.extract::<usize>().ok()?;
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
fn access_stream_page_size_minimum_valid(
    exact_integer: bool,
) -> bool {
    umf_core::access_stream::minimum_carrier_is_valid(exact_integer)
}

#[pyfunction]
fn access_stream_page_size_minimum_comparison_valid(matches_minimum: bool) -> bool {
    umf_core::access_stream::minimum_value_is_valid(matches_minimum)
}

#[pyfunction]
fn access_stream_page_size_minimum_exact_value_valid(value: &Bound<'_, PyAny>) -> bool {
    exact_stream_integer(value).is_some_and(|integer| {
        umf_core::access_stream::minimum_exact_value_is_valid(&integer)
    })
}

#[pyfunction]
fn access_stream_page_size_maximum_valid(
    exact_integer: bool,
) -> bool {
    umf_core::access_stream::maximum_carrier_is_valid(exact_integer)
}

#[pyfunction]
fn access_stream_page_size_maximum_comparison_valid(within_closed_range: bool) -> bool {
    umf_core::access_stream::maximum_value_is_valid(within_closed_range)
}

#[pyfunction]
fn access_stream_page_size_maximum_exact_value_valid(value: &Bound<'_, PyAny>) -> bool {
    exact_stream_integer(value).is_some_and(|integer| {
        umf_core::access_stream::maximum_exact_value_is_valid(&integer)
    })
}

#[pyfunction]
fn access_stream_page_size_row_cap_valid(
    exact_integer: bool,
    maximum_fits: bool,
) -> bool {
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
        return Err(PyValueError::new_err("exact boolean allowed-value carriers required"));
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
        return Err(PyValueError::new_err("exact integer allowed-value carriers required"));
    }
    let mut context = Context::ordinary();
    let left = python_bigint(py, left, &mut context)?;
    let right = python_bigint(py, right, &mut context)?;
    Ok(umf_core::access_constraints::equal_integer(&left, &right))
}

#[pyfunction]
fn access_constraints_equal_text(left: &Bound<'_, PyAny>, right: &Bound<'_, PyAny>) -> PyResult<bool> {
    if !left.is_exact_instance_of::<pyo3::types::PyString>()
        || !right.is_exact_instance_of::<pyo3::types::PyString>()
    {
        return Err(PyValueError::new_err("exact string allowed-value carriers required"));
    }
    let left = left.extract::<String>()?;
    let right = right.extract::<String>()?;
    Ok(umf_core::access_constraints::equal_text(&left, &right))
}

#[pyfunction]
fn access_constraints_equal_bytes(left: &Bound<'_, PyAny>, right: &Bound<'_, PyAny>) -> PyResult<bool> {
    if !left.is_exact_instance_of::<PyBytes>() || !right.is_exact_instance_of::<PyBytes>() {
        return Err(PyValueError::new_err("exact bytes allowed-value carriers required"));
    }
    let left = left
        .downcast::<PyBytes>()
        .map_err(|_| PyValueError::new_err("exact bytes allowed-value carriers required"))?;
    let right = right
        .downcast::<PyBytes>()
        .map_err(|_| PyValueError::new_err("exact bytes allowed-value carriers required"))?;
    Ok(umf_core::access_constraints::equal_bytes(left.as_bytes(), right.as_bytes()))
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
        .map_err(|_| PyValueError::new_err("invalid Decimal coefficient tuple"))?
        ;
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
            registry: Registry::new(),
            callbacks: HashMap::new(),
            next_token: 1,
        })
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
                        )))
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
    module.add_function(wrap_pyfunction!(execute_codegen_wire, module)?)?;
    module.add_function(wrap_pyfunction!(copy_json_wire, module)?)?;
    module.add_function(wrap_pyfunction!(copy_python_consumer_value, module)?)?;
    module.add_function(wrap_pyfunction!(copy_python_json_value, module)?)?;
    module.add_function(wrap_pyfunction!(engine_version, module)?)?;
    module.add_function(wrap_pyfunction!(codegen_protocol_version, module)?)?;
    module.add_function(wrap_pyfunction!(access_temporal_canonical_token, module)?)?;
    module.add_function(wrap_pyfunction!(access_temporal_profile_version, module)?)?;
    module.add_function(wrap_pyfunction!(access_values_profile_version, module)?)?;
    module.add_function(wrap_pyfunction!(operation_values_profile_version, module)?)?;
    module.add_function(wrap_pyfunction!(operation_canonical, module)?)?;
    module.add_function(wrap_pyfunction!(operation_bounded_size, module)?)?;
    module.add_function(wrap_pyfunction!(operation_digest, module)?)?;
    module.add_function(wrap_pyfunction!(operation_loads, module)?)?;
    module.add_function(wrap_pyfunction!(operation_token_encode, module)?)?;
    module.add_function(wrap_pyfunction!(operation_token_decode, module)?)?;
    module.add_function(wrap_pyfunction!(access_float32_profile_version, module)?)?;
    module.add_function(wrap_pyfunction!(access_float32_classify, module)?)?;
    module.add_function(wrap_pyfunction!(access_range_profile_version, module)?)?;
    module.add_function(wrap_pyfunction!(access_range_compare_integer, module)?)?;
    module.add_function(wrap_pyfunction!(access_range_compare_decimal, module)?)?;
    module.add_function(wrap_pyfunction!(access_constraints_profile_version, module)?)?;
    module.add_function(wrap_pyfunction!(access_stream_page_size_profile_version, module)?)?;
    module.add_function(wrap_pyfunction!(access_stream_page_size_request_valid, module)?)?;
    module.add_function(wrap_pyfunction!(access_stream_page_size_missing_domain_valid, module)?)?;
    module.add_function(wrap_pyfunction!(access_stream_page_size_domain_type_valid, module)?)?;
    module.add_function(wrap_pyfunction!(access_stream_page_size_domain_keys_valid, module)?)?;
    module.add_function(wrap_pyfunction!(access_stream_page_size_domain_parameter_valid, module)?)?;
    module.add_function(wrap_pyfunction!(access_stream_page_size_minimum_valid, module)?)?;
    module.add_function(wrap_pyfunction!(access_stream_page_size_minimum_comparison_valid, module)?)?;
    module.add_function(wrap_pyfunction!(access_stream_page_size_minimum_exact_value_valid, module)?)?;
    module.add_function(wrap_pyfunction!(access_stream_page_size_maximum_valid, module)?)?;
    module.add_function(wrap_pyfunction!(access_stream_page_size_maximum_comparison_valid, module)?)?;
    module.add_function(wrap_pyfunction!(access_stream_page_size_maximum_exact_value_valid, module)?)?;
    module.add_function(wrap_pyfunction!(access_stream_page_size_row_cap_valid, module)?)?;
    module.add_function(wrap_pyfunction!(access_stream_page_size_slot_count_valid, module)?)?;
    module.add_function(wrap_pyfunction!(access_stream_page_size_slot_carrier_valid, module)?)?;
    module.add_function(wrap_pyfunction!(access_stream_page_size_slot_nullability_valid, module)?)?;
    module.add_function(wrap_pyfunction!(access_stream_page_size_final_maximum_valid, module)?)?;
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
    module.add_class::<NativeRegistry>()?;
    module.add_class::<NativePythonSchema>()?;
    Ok(())
}
