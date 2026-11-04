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
    from_python_policy(py, value, ctx, depth, count, false, &Utf16::default())
}

/// Retained codegen admission uses the strict existing facade numeric/text
/// profile, not the broader Python Schema consumer profile. No Python snapshot.
pub fn from_codegen_resource(
    py: Python<'_>, value: &Bound<'_, PyAny>, ctx: &mut Context<'_>,
    count: &mut usize,
) -> Result<PythonConsumerValue, EngineError> {
    from_python_policy(py, value, ctx, 0, count, true, &Utf16::default())
}


/// Strict retained-facade admission directly into its final owned core tree.
/// Generic Python Schema consumers keep their separate source-origin profile.
pub fn from_codegen_resource_owned(
    py: Python<'_>, value: &Bound<'_, PyAny>, ctx: &mut Context<'_>,
    count: &mut usize,
) -> Result<umf_core::Value, EngineError> {
    fn visit(py: Python<'_>, value: &Bound<'_, PyAny>, ctx: &mut Context<'_>,
        depth: usize, count: &mut usize, path: &Utf16) -> Result<umf_core::Value, EngineError> {
        use umf_core::Value;
        if depth > ctx.limits().max_depth {
            return Err(EngineError::new("LIMIT", path.clone(), "Python consumer value nesting exceeds the admission limit"));
        }
        if depth == 0 { *count = count.saturating_add(1); }
        ctx.check_tree_value_count(*count, path.clone())?;
        ctx.charge_work(1, Utf16::default())?;
        if value.is_none() { return Ok(Value::Null); }
        if value.is_exact_instance_of::<PyBool>() {
            return value.extract::<bool>().map(Value::Bool).map_err(|_| invalid("Could not read Python bool"));
        }
        if value.is_exact_instance_of::<PyInt>() {
            let integer = value.extract::<i64>().ok().filter(|n| n.unsigned_abs() <= 9_007_199_254_740_991)
                .ok_or_else(|| EngineError::new("NUMBER", path.clone(), "Integer is outside the safe binary64 envelope"))?;
            return Ok(Value::Number(integer as f64));
        }
        if value.is_exact_instance_of::<PyFloat>() {
            let number = value.extract::<f64>().map_err(|_| invalid("Could not read Python float bits"))?;
            // Numeric/core projection follows complete strict facade admission,
            // preserving the predecessor's admission-before-projection ordering.
            return Ok(Value::Number(number));
        }
        if value.is_exact_instance_of::<PyString>() {
            return Ok(Value::String(resource_text(value, ctx, true)?.to_utf16(ctx)?));
        }
        if value.is_exact_instance_of::<PyList>() {
            let list = value.downcast::<PyList>().map_err(|_| invalid("Could not access Python list"))?;
            let length = list.len(); *count = count.saturating_add(length);
            ctx.check_tree_value_count(*count, path.clone())?;
            ctx.charge_work(length, Utf16::default())?;
            if list.len() != length { return Err(EngineError::new("REQUEST", path.clone(), "Resource container changed during admission")); }
            let children: Vec<_> = list.iter().collect();
            let mut output = Vec::with_capacity(length);
            for (index, item) in children.into_iter().enumerate() {
                ctx.charge_work(20, path.clone())?;
                let child = resource_child_path(path, &PyText::from_utf8(&index.to_string()), ctx)?;
                output.push(visit(py, &item, ctx, depth + 1, count, &child)?);
            }
            return Ok(Value::Array(output));
        }
        if value.is_exact_instance_of::<PyDict>() {
            let dict = value.downcast::<PyDict>().map_err(|_| invalid("Could not access Python dict"))?;
            let length = dict.len(); *count = count.saturating_add(length);
            ctx.check_tree_value_count(*count, path.clone())?;
            ctx.charge_work(length.saturating_mul(2), Utf16::default())?;
            if dict.len() != length { return Err(EngineError::new("REQUEST", path.clone(), "Resource container changed during admission")); }
            let children: Vec<_> = dict.iter().collect();
            let mut seen = std::collections::BTreeSet::new(); let mut output = Vec::with_capacity(length);
            for (key, child) in children {
                if !key.is_exact_instance_of::<PyString>() {
                    return Err(EngineError::new("UNSUPPORTED_KEY", path.clone(), "JSON object keys must be strings"));
                }
                let text = resource_text(&key, ctx, true)?;
                ctx.charge_work(text.len().saturating_add(1), Utf16::default())?;
                if !seen.insert(text.clone()) { return Err(EngineError::new("DUPLICATE_KEY", Utf16::default(), "Duplicate object key")); }
                let child_path = resource_child_path(path, &text, ctx)?;
                let key = text.to_utf16(ctx)?;
                output.push((key, visit(py, &child, ctx, depth + 1, count, &child_path)?));
            }
            return Ok(Value::Object(output));
        }
        Err(EngineError::new("UNSUPPORTED_VALUE", path.clone(), "Python consumer values must be exact built-in JSON values"))
    }
    let owned = visit(py, value, ctx, 0, count, &Utf16::default())?;
    umf_core::value::admit_owned_json_at(owned, Utf16::from("#"), ctx)
}

fn from_python_policy(
    py: Python<'_>, value: &Bound<'_, PyAny>, ctx: &mut Context<'_>,
    depth: usize, count: &mut usize, codegen: bool, path: &Utf16,
) -> Result<PythonConsumerValue, EngineError> {
    if depth > ctx.limits().max_depth {
        return Err(EngineError::new(
            "LIMIT",
            if codegen { path.clone() } else { Utf16::default() },
            "Python consumer value nesting exceeds the admission limit",
        ));
    }
    // Retained traversal reserves immediate child occurrences before owning
    // their references. This bounds pending frontiers as well as visited nodes.
    // Consumer mode retains its existing nodewise admission unchanged.
    if !codegen || depth == 0 { *count = count.saturating_add(1); }
    ctx.check_tree_value_count(*count, if codegen { path.clone() } else { Utf16::default() })?;
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
        if codegen {
            // _wire admits only +/- (2^53 - 1), even for float-exact larger ints.
            // Exact PyInt extraction never dispatches caller conversion hooks.
            let integer = value.extract::<i64>().ok().filter(|n| n.unsigned_abs() <= 9_007_199_254_740_991)
                .ok_or_else(|| EngineError::new("NUMBER", path.clone(), "Integer is outside the safe binary64 envelope"))?;
            return Ok(PythonConsumerValue::Float((integer as f64).to_bits()));
        }
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
        return resource_text(value, ctx, codegen).map(PythonConsumerValue::String);
    }
    if value.is_exact_instance_of::<PyList>() {
        let list = value
            .downcast::<PyList>()
            .map_err(|_| invalid("Could not access Python list"))?;
        let mut items = Vec::new();
        if codegen {
            // Own exact-container element references before callbacks may reenter
            // and mutate that container. No Python container snapshot is built.
            let length = list.len();
            *count = count.saturating_add(length);
            ctx.check_tree_value_count(*count, path.clone())?;
            ctx.charge_work(length, Utf16::default())?;
            if list.len() != length { return Err(EngineError::new("REQUEST", path.clone(), "Resource container changed during admission")); }
            let children: Vec<_> = list.iter().collect();
            for (index, item) in children.into_iter().enumerate() {
                ctx.charge_work(20, path.clone())?;
                let key = PyText::from_utf8(&index.to_string());
                let child_path = resource_child_path(path, &key, ctx)?;
                items.push(from_python_policy(py, &item, ctx, depth + 1, count, true, &child_path)?);
            }
        } else {
            for item in list.iter() {
                items.push(from_python(py, &item, ctx, depth + 1, count)?);
            }
        }
        return Ok(PythonConsumerValue::Array(items));
    }
    if value.is_exact_instance_of::<PyDict>() {
        let dict = value
            .downcast::<PyDict>()
            .map_err(|_| invalid("Could not access Python dict"))?;
        let mut members = Vec::new();
        if codegen {
            let length = dict.len();
            *count = count.saturating_add(length);
            ctx.check_tree_value_count(*count, path.clone())?;
            ctx.charge_work(length.saturating_mul(2), Utf16::default())?;
            if dict.len() != length { return Err(EngineError::new("REQUEST", path.clone(), "Resource container changed during admission")); }
            let children: Vec<_> = dict.iter().collect();
            let mut seen = std::collections::BTreeSet::new();
            for (key, child) in children {
                if !key.is_exact_instance_of::<PyString>() {
                    return Err(EngineError::new("UNSUPPORTED_KEY", path.clone(), "JSON object keys must be strings"));
                }
                let key = resource_text(&key, ctx, true)?;
                ctx.charge_work(key.len().saturating_add(1), Utf16::default())?;
                if !seen.insert(key.clone()) {
                    return Err(EngineError::new("DUPLICATE_KEY", Utf16::default(), "Duplicate object key"));
                }
                let child_path = resource_child_path(path, &key, ctx)?;
                let child = from_python_policy(py, &child, ctx, depth + 1, count, true, &child_path)?;
                members.push((key, child));
            }
        } else {
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
        }
        return Ok(PythonConsumerValue::Object(members));
    }
    Err(EngineError::new(
        "UNSUPPORTED_VALUE",
        if codegen { path.clone() } else { Utf16::default() },
        "Python consumer values must be exact built-in JSON values",
    ))
}

fn resource_child_path(path: &Utf16, key: &PyText, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    let key = key.to_utf16(ctx)?;
    ctx.charge_work(path.len().saturating_add(key.len().saturating_mul(2)).saturating_add(1), path.clone())?;
    let mut units = Vec::with_capacity(path.len().saturating_add(key.len().saturating_mul(2)).saturating_add(1));
    units.extend_from_slice(path.units()); units.push(47);
    for unit in key.units() {
        match unit { 126 => units.extend_from_slice(&[126, 48]), 47 => units.extend_from_slice(&[126, 49]), other => units.push(*other) }
    }
    Ok(Utf16::new(units))
}

fn resource_text(value: &Bound<'_, PyAny>, ctx: &mut Context<'_>, normalize: bool) -> Result<PyText, EngineError> {
    let text = pytext_from_python(value, ctx)?;
    if !normalize { return Ok(text); }
    // Match the old UTF-16 wire -> Python snapshot: paired surrogates become
    // one scalar, lone surrogates stay exact. This also preserves required-array
    // behavior of the existing schema projection, without its origin collision
    // spelling being triggered by two spellings of the same facade string.
    ctx.charge_work(text.len(), Utf16::default())?;
    let points = text.codepoints();
    let paired = points.windows(2).any(|p| (0xd800..=0xdbff).contains(&p[0]) && (0xdc00..=0xdfff).contains(&p[1]));
    if !paired { return Ok(text); }
    ctx.charge_work(points.len(), Utf16::default())?;
    let mut normalized = Vec::with_capacity(points.len());
    let mut index = 0;
    while index < points.len() {
        let first = points[index];
        if (0xd800..=0xdbff).contains(&first) && index + 1 < points.len() && (0xdc00..=0xdfff).contains(&points[index + 1]) {
            normalized.push(0x10000 + ((first - 0xd800) << 10) + points[index + 1] - 0xdc00);
            index += 2;
        } else { normalized.push(first); index += 1; }
    }
    PyText::from_codepoints(normalized)
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
