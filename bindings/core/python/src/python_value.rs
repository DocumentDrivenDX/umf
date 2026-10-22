use num_bigint::BigInt;
use pyo3::{
    exceptions::PyValueError,
    prelude::*,
    types::{PyBool, PyBytes, PyDict, PyFloat, PyInt, PyList, PyString},
};
use umf_core::{Context, EngineError, PyText, PythonConsumerValue, Utf16};

fn invalid(message: &str) -> EngineError {
    EngineError::new("PYTHON_VALUE", Utf16::default(), message)
}

pub fn from_python(
    py: Python<'_>,
    value: &Bound<'_, PyAny>,
    ctx: &mut Context<'_>,
    depth: usize,
    count: &mut usize,
) -> Result<PythonConsumerValue, EngineError> {
    if depth > ctx.limits().max_depth {
        return Err(EngineError::new(
            "LIMIT",
            Utf16::default(),
            "Python consumer value nesting exceeds the admission limit",
        ));
    }
    *count = count.saturating_add(1);
    ctx.check_tree_value_count(*count, Utf16::default())?;
    ctx.charge_work(1, Utf16::default())?;

    if value.is_none() {
        return Ok(PythonConsumerValue::Null);
    }
    if value.is_exact_instance_of::<PyBool>() {
        return value
            .extract::<bool>()
            .map(PythonConsumerValue::Bool)
            .map_err(|_| invalid("Could not read Python bool"));
    }
    if value.is_exact_instance_of::<PyInt>() {
        let bits: usize = value
            .call_method0("bit_length")
            .and_then(|result| result.extract())
            .map_err(|_| invalid("Could not read Python integer size"))?;
        ctx.charge_work(bits, Utf16::default())?;
        let byte_len = bits
            .saturating_add(8)
            .checked_div(8)
            .unwrap_or(usize::MAX)
            .max(1);
        let kwargs = PyDict::new_bound(py);
        kwargs
            .set_item("signed", true)
            .map_err(|_| invalid("Could not prepare Python integer conversion"))?;
        let bytes = value
            .call_method("to_bytes", (byte_len, "little"), Some(&kwargs))
            .map_err(|_| invalid("Could not convert Python integer bytes"))?
            .downcast_into::<PyBytes>()
            .map_err(|_| invalid("Could not convert Python integer bytes"))?;
        return Ok(PythonConsumerValue::Integer(BigInt::from_signed_bytes_le(
            bytes.as_bytes(),
        )));
    }
    if value.is_exact_instance_of::<PyFloat>() {
        return value
            .extract::<f64>()
            .map(|number| PythonConsumerValue::Float(number.to_bits()))
            .map_err(|_| invalid("Could not read Python float bits"));
    }
    if value.is_exact_instance_of::<PyString>() {
        return text_from_python(value, ctx);
    }
    if value.is_exact_instance_of::<PyList>() {
        let list = value
            .downcast::<PyList>()
            .map_err(|_| invalid("Could not access Python list"))?;
        let mut items = Vec::new();
        for item in list.iter() {
            items.push(from_python(py, &item, ctx, depth + 1, count)?);
        }
        return Ok(PythonConsumerValue::Array(items));
    }
    if value.is_exact_instance_of::<PyDict>() {
        let dict = value
            .downcast::<PyDict>()
            .map_err(|_| invalid("Could not access Python dict"))?;
        let mut members = Vec::new();
        for (key, child) in dict.iter() {
            if !key.is_exact_instance_of::<PyString>() {
                return Err(EngineError::new(
                    "UNSUPPORTED_KEY",
                    Utf16::default(),
                    "Python consumer object keys must be exact strings",
                ));
            }
            let key = text_from_python(&key, ctx)?;
            let PythonConsumerValue::String(key) = key else {
                unreachable!()
            };
            let child = from_python(py, &child, ctx, depth + 1, count)?;
            members.push((key, child));
        }
        return Ok(PythonConsumerValue::Object(members));
    }
    Err(EngineError::new(
        "UNSUPPORTED_VALUE",
        Utf16::default(),
        "Python consumer values must be exact built-in JSON values",
    ))
}

fn text_from_python(
    value: &Bound<'_, PyAny>,
    ctx: &mut Context<'_>,
) -> Result<PythonConsumerValue, EngineError> {
    pytext_from_python(value, ctx).map(PythonConsumerValue::String)
}

pub fn pytext_from_python(
    value: &Bound<'_, PyAny>,
    ctx: &mut Context<'_>,
) -> Result<PyText, EngineError> {
    let codepoint_count = value
        .len()
        .map_err(|_| invalid("Could not read Python string length"))?;
    ctx.charge_work(codepoint_count, Utf16::default())?;
    let bytes = value
        .call_method1("encode", ("utf-32-le", "surrogatepass"))
        .map_err(|_| invalid("Could not encode Python string code points"))?
        .downcast_into::<PyBytes>()
        .map_err(|_| invalid("Could not encode Python string code points"))?;
    let raw = bytes.as_bytes();
    if raw.len() % 4 != 0 {
        return Err(invalid(
            "Python string code points had an invalid byte length",
        ));
    }
    let codepoints = raw
        .chunks_exact(4)
        .map(|unit| u32::from_le_bytes([unit[0], unit[1], unit[2], unit[3]]))
        .collect::<Vec<_>>();
    // This is a copy of an already-admitted host value, not source/output
    // text. Meter the allocation work without imposing the source profile's
    // 4M UTF-16 source/output ceiling on copied values.
    ctx.charge_work(codepoints.len(), Utf16::default())?;
    PyText::from_codepoints(codepoints)
}

pub fn to_python(
    py: Python<'_>,
    value: &PythonConsumerValue,
    ctx: &mut Context<'_>,
) -> PyResult<PyObject> {
    match value {
        PythonConsumerValue::Null => Ok(py.None()),
        PythonConsumerValue::Bool(value) => {
            Ok(value.into_pyobject(py)?.to_owned().into_any().unbind())
        }
        PythonConsumerValue::Integer(value) => {
            let bits = usize::try_from(value.bits()).unwrap_or(usize::MAX);
            ctx.charge_work(bits, Utf16::default()).map_err(py_error)?;
            let bytes = value.to_signed_bytes_le();
            ctx.charge_work(bytes.len(), Utf16::default())
                .map_err(py_error)?;
            let bytes = PyBytes::new_bound(py, &bytes);
            let kwargs = PyDict::new_bound(py);
            kwargs.set_item("signed", true)?;
            Ok(py
                .get_type::<PyInt>()
                .call_method("from_bytes", (bytes, "little"), Some(&kwargs))?
                .unbind())
        }
        PythonConsumerValue::Float(bits) => Ok(py
            .get_type::<PyFloat>()
            .call1((f64::from_bits(*bits),))?
            .unbind()),
        PythonConsumerValue::String(text) => text_to_python(py, text, ctx),
        PythonConsumerValue::Array(items) => {
            let output = PyList::empty_bound(py);
            for item in items {
                ctx.charge_work(1, Utf16::default()).map_err(py_error)?;
                output.append(to_python(py, item, ctx)?)?;
            }
            Ok(output.unbind().into())
        }
        PythonConsumerValue::Object(members) => {
            let output = PyDict::new_bound(py);
            for (key, value) in members {
                ctx.charge_work(1, Utf16::default()).map_err(py_error)?;
                let key = text_to_python(py, key, ctx)?;
                output.set_item(key, to_python(py, value, ctx)?)?;
            }
            Ok(output.unbind().into())
        }
    }
}

fn text_to_python(py: Python<'_>, text: &PyText, ctx: &mut Context<'_>) -> PyResult<PyObject> {
    // Charge before allocating the per-codepoint list and joined output.
    let cost = text.codepoints().len().checked_mul(2).ok_or_else(|| {
        py_error(EngineError::new(
            "LIMIT",
            Utf16::default(),
            "Python text copy cost overflow",
        ))
    })?;
    ctx.charge_work(cost, Utf16::default()).map_err(py_error)?;
    let chr = py.import_bound("builtins")?.getattr("chr")?;
    let output = PyList::empty_bound(py);
    for codepoint in text.codepoints() {
        output.append(chr.call1((*codepoint,))?)?;
    }
    Ok(PyString::new_bound(py, "")
        .call_method1("join", (output,))?
        .unbind()
        .into())
}

fn py_error(error: EngineError) -> PyErr {
    PyValueError::new_err(umf_core_wire::error_envelope(error))
}
