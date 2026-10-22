use pyo3::exceptions::PyRuntimeError;
use pyo3::prelude::*;
use pyo3::types::PyBytes;
use std::time::{SystemTime, UNIX_EPOCH};

#[pyfunction]
fn run(request_json: &str) -> String {
    umf_rust_spike_core::run_with_clock(request_json, now_ms, None)
}

#[pyfunction]
fn run_with_validator(py: Python<'_>, request_json: &str, callback: PyObject) -> PyResult<String> {
    run_with_control(py, request_json, None, Some(callback))
}

#[pyfunction(signature = (request_json, should_cancel=None, callback=None))]
fn run_with_control(
    py: Python<'_>,
    request_json: &str,
    should_cancel: Option<PyObject>,
    callback: Option<PyObject>,
) -> PyResult<String> {
    let mut cancellation_error = None;
    let mut cancellation = || match should_cancel.as_ref() {
        None => false,
        Some(callback) => match callback.call0(py) {
            Ok(value) => value.extract::<bool>(py).unwrap_or(false),
            Err(error) => {
                cancellation_error = Some(error);
                true
            }
        },
    };
    let mut callback_error = None;
    let mut validator = |units: &[u16]| {
        let Some(callback) = callback.as_ref() else {
            return Err("validator callback is missing".to_owned());
        };
        let source = py_text(py, units).map_err(|error| {
            callback_error = Some(error);
            "could not construct callback source text".to_owned()
        })?;
        match callback.call1(py, (source,)) {
            Ok(_) => Ok(()),
            Err(error) => {
                callback_error = Some(error);
                Err("trusted validator callback failed".to_owned())
            }
        }
    };
    let result = umf_rust_spike_core::run_with_control(
        request_json,
        now_ms,
        &mut cancellation,
        Some(&mut validator),
    );
    drop(validator);
    drop(cancellation);
    if let Some(error) = cancellation_error {
        return Err(error);
    }
    if let Some(error) = callback_error {
        return Err(error);
    }
    result.map_err(PyRuntimeError::new_err)
}

fn py_text(py: Python<'_>, units: &[u16]) -> PyResult<PyObject> {
    let mut bytes = Vec::with_capacity(units.len() * 2);
    for unit in units {
        bytes.extend_from_slice(&unit.to_le_bytes());
    }
    Ok(PyBytes::new(py, &bytes)
        .call_method1("decode", ("utf-16-le", "surrogatepass"))?
        .unbind())
}

fn now_ms() -> Option<u64> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()
        .map(|duration| duration.as_millis() as u64)
}

#[pymodule]
fn _umf_rust_spike(module: &Bound<'_, PyModule>) -> PyResult<()> {
    module.add_function(wrap_pyfunction!(run, module)?)?;
    module.add_function(wrap_pyfunction!(run_with_validator, module)?)?;
    module.add_function(wrap_pyfunction!(run_with_control, module)?)?;
    module.add("ENGINE_VERSION", "r1-structural-schema-spike/0.1.0")?;
    Ok(())
}
