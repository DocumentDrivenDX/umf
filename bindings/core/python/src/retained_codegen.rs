//! Private Python ownership for the existing shared compiled-resource handle.
//! No callbacks or Python resource references survive construction.
use std::cell::{Cell, RefCell};

use pyo3::{
    exceptions::{PyBaseException, PyTypeError, PyValueError},
    prelude::*,
    types::{PyDict, PyString, PyTuple},
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

// Retain the first Python failure by reference. Failed controls never flow
// through an unbounded JSON error encoder or a second metering attempt.
struct RetainedControl {
    first: RefCell<Option<PyErr>>,
}
impl RetainedControl {
    fn new() -> Self {
        Self {
            first: RefCell::new(None),
        }
    }
    fn denied() -> EngineError {
        EngineError::new("HOST_CONTROL", Utf16::default(), "Owner control refused")
    }
    fn owner_error(
        py: Python<'_>,
        code: &Bound<'_, PyAny>,
        message: &Bound<'_, PyAny>,
        path: &Bound<'_, PyAny>,
    ) -> PyErr {
        match py
            .import_bound("umf._rust")
            .and_then(|m| m.getattr("UmfCoreError"))
            .and_then(|class| class.call1((code, message, path)))
        {
            Ok(value) => PyErr::from_value_bound(value),
            Err(error) => error,
        }
    }
    fn fixed_error(py: Python<'_>, message: &str) -> PyErr {
        Self::owner_error(
            py,
            PyString::new_bound(py, "METER_FAILURE").as_any(),
            PyString::new_bound(py, message).as_any(),
            PyString::new_bound(py, "").as_any(),
        )
    }
    fn check(
        &self,
        py: Python<'_>,
        callback: &Bound<'_, PyAny>,
        amount: usize,
        phase: &str,
    ) -> Result<(), EngineError> {
        if self.first.borrow().is_some() {
            return Err(Self::denied());
        }
        let outcome = callback.call1((amount, phase));
        let failure = match outcome {
            Ok(value) if value.is_none() => return Ok(()),
            Ok(value) => {
                if let Ok(original) = callback.getattr("failure") {
                    if original.is_instance_of::<PyBaseException>() {
                        *self.first.borrow_mut() = Some(PyErr::from_value_bound(original));
                        return Err(Self::denied());
                    }
                }
                if let Ok(tuple) = value.downcast::<PyTuple>() {
                    if tuple.len() == 3 {
                        let fields = (
                            tuple.get_item(0).expect("checked tuple index"),
                            tuple.get_item(1).expect("checked tuple index"),
                            tuple.get_item(2).expect("checked tuple index"),
                        );
                        if fields.0.is_exact_instance_of::<PyString>()
                            && fields.1.is_exact_instance_of::<PyString>()
                            && fields.2.is_exact_instance_of::<PyString>()
                        {
                            Self::owner_error(py, &fields.0, &fields.1, &fields.2)
                        } else {
                            Self::fixed_error(py, "Malformed owner control outcome")
                        }
                    } else {
                        Self::fixed_error(py, "Malformed owner control outcome")
                    }
                } else {
                    Self::fixed_error(py, "Malformed owner control outcome")
                }
            }
            Err(error) => {
                // Preserve the common exact-string exception argument by
                // reference; never stringify an arbitrary host exception here.
                let args = error.value_bound(py).getattr("args");
                if let Ok(args) = args {
                    if let Ok(tuple) = args.downcast::<PyTuple>() {
                        if tuple.len() == 1 {
                            if let Ok(text) = tuple.get_item(0) {
                                if text.is_exact_instance_of::<PyString>() {
                                    let code = PyString::new_bound(py, "METER_FAILURE");
                                    let path = PyString::new_bound(py, "");
                                    *self.first.borrow_mut() = Some(Self::owner_error(
                                        py,
                                        code.as_any(),
                                        &text,
                                        path.as_any(),
                                    ));
                                    return Err(Self::denied());
                                }
                            }
                        }
                    }
                }
                Self::fixed_error(py, "Owner control callback failed")
            }
        };
        *self.first.borrow_mut() = Some(failure);
        Err(Self::denied())
    }
    fn take(&self) -> Option<PyErr> {
        self.first.borrow_mut().take()
    }
}

// The helper's only non-control failures are fixed internal encoder failures.
// A control denial is returned from RetainedControl before reaching this path.
fn bounded_encoder_error(error: EngineError) -> PyErr {
    if error.code.len() <= 64 && error.message.len() <= 256 && error.path.len() <= 256 {
        py_error(error)
    } else {
        PyValueError::new_err("Bounded native envelope encoder failed")
    }
}

fn python_response(
    py: Python<'_>,
    text: &str,
    ctx: &mut Context<'_>,
) -> Result<PyObject, EngineError> {
    // Explicit PyString construction keeps its allocation in the same lifetime.
    ctx.charge_work(text.len(), Utf16::default())?;
    let result = PyString::new_bound(py, text).into_any().unbind();
    ctx.charge_work(0, Utf16::default())?;
    Ok(result)
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
    ) -> PyResult<PyObject> {
        if !control.is_callable() {
            return Err(PyTypeError::new_err("Owner control must be callable"));
        }
        let failure = RetainedControl::new();
        let phase = Cell::new("native-request-decode");
        let mut hook = |amount| failure.check(py, control, amount, phase.get());
        let result = {
            let mut ctx = Context::ordinary().with_host_control(&mut hook);
            let inner = ctx
                .with_tagged_transport_limit(|ctx| umf_core_wire::decode(wire_json, ctx))
                .and_then(|request| {
                    phase.set("native-inspector-and-result-encoding");
                    self.handle.execute_request_with_context(request, &mut ctx)
                });
            // Do not size or encode even an error after a terminal control refusal.
            if failure.first.borrow().is_some() {
                Err(RetainedControl::denied())
            } else {
                phase.set("native-result-envelope");
                umf_core_wire::result_envelope_with_context(inner, &mut ctx)
                    .and_then(|text| python_response(py, &text, &mut ctx))
            }
        };
        if let Some(error) = failure.take() {
            return Err(error);
        }
        result.map_err(bounded_encoder_error)
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
    let failure = RetainedControl::new();
    let phase = Cell::new("native-resource-conversion");
    let mut hook = |amount| failure.check(py, control, amount, phase.get());
    let result = {
        let mut ctx = Context::ordinary().with_host_control(&mut hook);
        let built = ctx
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
            .and_then(|raw| {
                phase.set("native-resource-compilation");
                let handle = CodegenResourcesHandle::from_resources_with_context(raw, &mut ctx)?;
                ctx.charge_work(1, Utf16::default())?;
                ctx.charge_work(0, Utf16::default())?;
                Ok(RetainedCodegenResources { handle })
            });
        match built {
            Ok(handle) => Ok(handle),
            Err(error) if failure.first.borrow().is_some() => {
                // Placeholder is never published: the original first Python
                // failure is returned below without formatting/encoding it.
                let _ = error;
                Err(PyValueError::new_err("Owner construction refused"))
            }
            Err(error) => {
                phase.set("native-result-envelope");
                match umf_core_wire::result_envelope_with_context(Err(error), &mut ctx)
                    .and_then(|text| python_response(py, &text, &mut ctx))
                {
                    Ok(text) => {
                        let exception = ctx
                            .charge_work(1, Utf16::default())
                            .map_err(|_| PyValueError::new_err("Owner error transport refused"))
                            .and_then(|_| {
                                py.get_type_bound::<PyValueError>()
                                    .call1((text,))
                                    .map(PyErr::from_value_bound)
                            });
                        match exception {
                            Ok(error) => {
                                let checked = ctx.charge_work(0, Utf16::default());
                                if checked.is_err() {
                                    Err(PyValueError::new_err("Owner error publication refused"))
                                } else {
                                    Err(error)
                                }
                            }
                            Err(error) => Err(error),
                        }
                    }
                    Err(_) => Err(PyValueError::new_err("Owner error transport refused")),
                }
            }
        }
    };
    if let Some(error) = failure.take() {
        return Err(error);
    }
    result
}
