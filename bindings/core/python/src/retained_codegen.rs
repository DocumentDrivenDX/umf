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
        self.check_with_root(py, callback, amount, phase, None)
    }
    fn check_with_root(
        &self, py: Python<'_>, callback: &Bound<'_, PyAny>, amount: usize,
        phase: &str, root: Option<&str>,
    ) -> Result<(), EngineError> {
        if self.first.borrow().is_some() {
            return Err(Self::denied());
        }
        let outcome = match root {
            Some(root) => callback.call1((amount, phase, root)),
            None => callback.call1((amount, phase)),
        };
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
        self.execute_impl(py, wire_json, control, false)
    }

    /// Bound to the immutable native/wire handle, never a facade mode flag.
    fn resource_source_manifest(&self, py: Python<'_>, control: &Bound<'_, PyAny>) -> PyResult<PyObject> {
        self.source_manifest_impl(py, control)
    }

    /// PRIVATE bounded attribution; never selected by public payload data.
    fn execute_wire_attributed(&self, py: Python<'_>, wire_json: &str, control: &Bound<'_, PyAny>) -> PyResult<PyObject> {
        self.execute_impl(py, wire_json, control, true)
    }
}

impl RetainedCodegenResources {
    fn execute_impl(&self, py: Python<'_>, wire_json: &str, control: &Bound<'_, PyAny>, attributed: bool) -> PyResult<PyObject> {
        if !control.is_callable() {
            return Err(PyTypeError::new_err("Owner control must be callable"));
        }
        let failure = RetainedControl::new();
        let phase = Cell::new("native-request-decode");
        let mut hook = |amount| failure.check(py, control, amount, phase.get());
        let result = {
            let mut ctx = Context::ordinary().with_host_control(&mut hook);
            if attributed { ctx = ctx.with_work_phase_observer(&phase); }
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
    create_codegen_resources_impl(py, resources, control, false)
}

/// PRIVATE constructor observation. Same factory, admission and charge sequence.
#[pyfunction]
pub(super) fn create_codegen_resources_attributed(
    py: Python<'_>, resources: &Bound<'_, PyAny>, control: &Bound<'_, PyAny>,
) -> PyResult<RetainedCodegenResources> {
    create_codegen_resources_impl(py, resources, control, true)
}

fn create_codegen_resources_impl(
    py: Python<'_>, resources: &Bound<'_, PyAny>, control: &Bound<'_, PyAny>, attributed: bool,
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
    let root = Cell::new("conversion");
    let mut hook = |amount| if attributed {
        failure.check_with_root(py, control, amount, phase.get(), Some(root.get()))
    } else { failure.check(py, control, amount, phase.get()) };
    let result = {
        let mut ctx = Context::ordinary().with_host_control(&mut hook);
        if attributed {
            ctx = ctx.with_work_phase_observer(&phase).with_constructor_root_observer(&root);
        }
        let built = ctx.with_catalog_value_limit(|ctx| {
                let length = resources.len();
                ctx.charge_work(length.saturating_mul(2), Utf16::default())?;
                if resources.len() != length {
                    return Err(EngineError::new("REQUEST", Utf16::default(), "Resource container changed during admission"));
                }
                // The facade admits at most the nine named resources plus Saga.
                // Refuse an oversized direct factory request before allocating.
                if resources.len() > 10 {
                    return Err(EngineError::new("REQUEST", Utf16::default(), "Unknown explicit codegen resource"));
                }
                let entries: Vec<_> = resources.iter().collect();
                // Preserve the facade's canonical resource admission order,
                // using the existing shared bridge's single name roster.
                ctx.charge_work(length.saturating_mul(65), Utf16::default())?;
                let mut ordered = Vec::with_capacity(length);
                for (key, value) in entries {
                    if !key.is_exact_instance_of::<PyString>() {
                        return Err(EngineError::new("UNSUPPORTED_KEY", Utf16::default(), "Resource names must be exact strings"));
                    }
                    let text = key.downcast::<PyString>().expect("exact string");
                    let key_length = text.len().map_err(|_| EngineError::new("REQUEST", Utf16::default(), "Could not read resource name"))?;
                    ctx.charge_work(key_length.saturating_mul(CodegenResourcesHandle::RESOURCE_NAMES.len()), Utf16::default())?;
                    let ordinal = text.to_str().ok().and_then(|text| CodegenResourcesHandle::RESOURCE_NAMES.iter().position(|name| text == *name))
                        .ok_or_else(|| EngineError::new("REQUEST", Utf16::default(), "Unknown explicit codegen resource"))?;
                    ordered.push((ordinal, key, value));
                }
                ordered.sort_by_key(|(ordinal, _, _)| *ordinal);
                Ok(ordered)
            }).and_then(|ordered|umf_core::value::OwnedCoreOperation::with_context(&mut ctx,|ctx,operation|{
                // The original all-name checks/sort finish before this operation.
                // All supplied resources finish full conversion+admission BEFORE
                // compilation, including a later companion/Saga failure.
                let fields=ctx.with_catalog_value_limit(|ctx|{
                let length=ordered.len();
                let old_words=std::mem::size_of::<(Utf16,Value)>().div_ceil(std::mem::size_of::<usize>());
                let new_words=std::mem::size_of::<(Utf16,umf_core::value::OwnedCoreJson)>().div_ceil(std::mem::size_of::<usize>());
                ctx.charge_work(length.saturating_mul(new_words.saturating_sub(old_words)).saturating_add(2),Utf16::default())?;
                let mut fields = Vec::with_capacity(length);
                for (_, key, value) in ordered {
                    if !key.is_exact_instance_of::<PyString>() {
                        return Err(EngineError::new(
                            "UNSUPPORTED_KEY",
                            Utf16::default(),
                            "Resource names must be exact strings",
                        ));
                    }
                    let key = python_value::pytext_from_python(&key, ctx)?.to_utf16(ctx)?;
                    let mut count = 0;
                    let value = python_value::from_codegen_resource_admitted(py, &value, ctx, &mut count,operation,&key)?;
                    fields.push((key, value));
                }
                    Ok(fields)
                })?;
                phase.set("native-resource-compilation");
                root.set("unassigned");
                let handle=CodegenResourcesHandle::from_owned_resources_with_context(fields,operation,ctx)?;
                ctx.charge_work(1,Utf16::default())?;
                ctx.charge_work(0,Utf16::default())?;
                Ok(RetainedCodegenResources{handle})
            }));
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

// Dedicated closed-input entry. Existing explicit constructors above are exact.
#[pyfunction]
pub(super) fn create_installed_codegen_resources(
    py: Python<'_>, control: &Bound<'_, PyAny>,
) -> PyResult<RetainedCodegenResources> {
    if !control.is_callable() {
        return Err(PyTypeError::new_err("Owner control must be callable"));
    }
    let failure = RetainedControl::new();
    let phase = Cell::new("native-installed-materialization");
    let mut hook = |amount| failure.check(py, control, amount, phase.get());
    let result = {
        let mut ctx = Context::ordinary().with_host_control(&mut hook).with_work_phase_observer(&phase);
        match CodegenResourcesHandle::from_installed_with_context(&mut ctx) {
            Ok(handle) => {
                ctx.charge_work(std::mem::size_of::<RetainedCodegenResources>().div_ceil(std::mem::size_of::<usize>()).saturating_add(1), Utf16::default())
                    .and_then(|_| ctx.charge_work(0, Utf16::default()))
                    .map(|_| RetainedCodegenResources { handle })
                    .map_err(|_| PyValueError::new_err("Owner installed transport refused"))
            }
            Err(error) if failure.first.borrow().is_some() => {
                let _ = error;
                Err(PyValueError::new_err("Owner construction refused"))
            }
            Err(error) => {
                phase.set("native-result-envelope");
                installed_factory_error(py, error, &mut ctx)
            }
        }
    };
    if let Some(error) = failure.take() { return Err(error); }
    result
}

fn installed_factory_error<T>(py: Python<'_>, error: EngineError, ctx: &mut Context<'_>) -> PyResult<T> {
    let text = umf_core_wire::result_envelope_with_context(Err(error), ctx)
        .and_then(|text| python_response(py, &text, ctx))
        .map_err(|_| PyValueError::new_err("Owner installed transport refused"))?;
    ctx.charge_work(1, Utf16::default()).map_err(|_| PyValueError::new_err("Owner installed transport refused"))?;
    let exception = py.get_type_bound::<PyValueError>().call1((text,)).map(PyErr::from_value_bound)?;
    ctx.charge_work(0, Utf16::default()).map_err(|_| PyValueError::new_err("Owner installed transport refused"))?;
    Err(exception)
}

// Same paid report transport, now requiring the actual opaque native receiver.
impl RetainedCodegenResources {
fn source_manifest_impl(
    &self, py: Python<'_>, control: &Bound<'_, PyAny>,
) -> PyResult<PyObject> {
    if !control.is_callable() { return Err(PyTypeError::new_err("Owner control must be callable")); }
    let failure = RetainedControl::new();
    let phase = Cell::new("native-installed-source-manifest");
    let mut hook = |amount| failure.check(py, control, amount, phase.get());
    let result = {
        let mut ctx = Context::ordinary().with_host_control(&mut hook);
        let inner = self.handle.resource_source_manifest_with_context(&mut ctx)
            .and_then(|value| umf_core_wire::encode(&value, &mut ctx));
        if failure.first.borrow().is_some() {
            Err(PyValueError::new_err("Owner manifest transport refused"))
        } else {
            phase.set("native-result-envelope");
            umf_core_wire::result_envelope_with_context(inner, &mut ctx)
                .and_then(|text| python_response(py, &text, &mut ctx))
                .map_err(|_| PyValueError::new_err("Owner installed transport refused"))
        }
    };
    if let Some(error) = failure.take() { return Err(error); }
    result
}
}
