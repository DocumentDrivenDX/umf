//! Private Python ownership for the existing shared compiled-resource handle.
//! No callbacks or Python resource references survive construction.
use std::cell::Cell;

use pyo3::{
    exceptions::PyTypeError,
    prelude::*,
    types::{PyDict, PyString},
};
use umf_core::{Context, EngineError, Utf16, Value};
use umf_core_wire::CodegenResourcesHandle;

use super::{extract_utf16, py_error, py_exception_engine_error, pytext_utf16, python_value};

// Shared error protocol with execute_codegen_wire. Diagnostic phase labels do
// not change work amounts or the public one-argument meter capability.
pub(super) fn invoke_control(
    py: Python<'_>,
    control: &Bound<'_, PyAny>,
    amount: usize,
    phase: Option<&str>,
) -> Result<(), EngineError> {
    let outcome = match phase {
        Some(phase) => control.call1((amount, phase)),
        None => control.call1((amount,)),
    }
    .map_err(|error| py_exception_engine_error(py, "METER_FAILURE", error))?;
    if outcome.is_none() {
        return Ok(());
    }
    let (code, message, path): (String, Bound<'_, PyAny>, Bound<'_, PyAny>) = outcome
        .extract()
        .map_err(|error| py_exception_engine_error(py, "METER_FAILURE", error))?;
    let mut ctx = Context::ordinary();
    let origin = python_value::pytext_from_python(&message, &mut ctx)?;
    let mut error = EngineError::new(
        code,
        extract_utf16(py, &path)
            .map_err(|error| py_exception_engine_error(py, "METER_FAILURE", error))?,
        pytext_utf16(&origin),
    );
    error.python_message_origin = Some(origin);
    Err(error)
}

#[pyclass(frozen, module = "umf._rust_core", name = "_CodegenResources")]
pub(super) struct RetainedCodegenResources {
    handle: CodegenResourcesHandle,
}

#[pymethods]
impl RetainedCodegenResources {
    // No #[new], setters, resource getter, external handle argument or pickle.
    fn execute_wire(
        &self,
        py: Python<'_>,
        wire_json: &str,
        control: &Bound<'_, PyAny>,
    ) -> PyResult<String> {
        if !control.is_callable() {
            return Err(PyTypeError::new_err("Owner control must be callable"));
        }
        let mut failure = None;
        let phase = Cell::new("native-request-decode");
        let mut hook = |amount| {
            let result = invoke_control(py, control, amount, Some(phase.get()));
            if let Err(error) = &result {
                failure = Some(error.clone());
            }
            result
        };
        let result = {
            let mut ctx = Context::ordinary().with_host_control(&mut hook);
            ctx.with_tagged_transport_limit(|ctx| umf_core_wire::decode(wire_json, ctx))
                .and_then(|request| {
                    phase.set("native-inspector-and-result-encoding");
                    self.handle.execute_request_with_context(request, &mut ctx)
                })
        };
        if let Some(error) = failure {
            return Err(py_error(error));
        }
        Ok(umf_core_wire::result_envelope(result))
    }
}

#[pyfunction]
pub(super) fn create_codegen_resources(
    py: Python<'_>,
    resources: &Bound<'_, PyAny>,
    control: &Bound<'_, PyAny>,
) -> PyResult<RetainedCodegenResources> {
    if !resources.is_exact_instance_of::<PyDict>() {
        return Err(PyTypeError::new_err(
            "Engine resources must be a plain dict",
        ));
    }
    if !control.is_callable() {
        return Err(PyTypeError::new_err("Owner control must be callable"));
    }
    let resources = resources.downcast::<PyDict>()?;
    let phase = Cell::new("native-resource-conversion");
    let mut hook = |amount| invoke_control(py, control, amount, Some(phase.get()));
    // One context and the SAME host closure span every resource, conversion,
    // compilation and final publication check. Catalog scope restores limits.
    let mut ctx = Context::ordinary().with_host_control(&mut hook);
    let raw = ctx
        .with_catalog_value_limit(|ctx| {
            ctx.charge_work(resources.len(), Utf16::default())?;
            let mut fields = Vec::with_capacity(resources.len());
            for (key, value) in resources.iter() {
                if !key.is_exact_instance_of::<PyString>() {
                    return Err(EngineError::new(
                        "UNSUPPORTED_KEY",
                        Utf16::default(),
                        "Resource names must be exact strings",
                    ));
                }
                let key = python_value::pytext_from_python(&key, ctx)?.to_utf16(ctx)?;
                let mut count = 0;
                let value = python_value::from_python(py, &value, ctx, 0, &mut count)?
                    .project_schema_to_core(ctx)?;
                fields.push((key, value));
            }
            Ok(Value::Object(fields))
        })
        .map_err(py_error)?;
    phase.set("native-resource-compilation");
    let handle =
        CodegenResourcesHandle::from_resources_with_context(raw, &mut ctx).map_err(py_error)?;
    ctx.charge_work(0, Utf16::default()).map_err(py_error)?;
    Ok(RetainedCodegenResources { handle })
}
