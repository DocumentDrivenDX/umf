// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::{
    context::WorkMeter, schema::CompiledSchema, Context, EngineError, PyText,
    PythonConsumerValue as Py, PythonReVersion, PythonSchemaEvaluationMode, PythonSchemaResources,
    Utf16,
};

fn schema() -> Py {
    Py::Object(vec![
        (
            PyText::from_utf8("type"),
            Py::String(PyText::from_utf8("number")),
        ),
        (PyText::from_utf8("multipleOf"), Py::Float(0.5f64.to_bits())),
    ])
}

fn compiled() -> umf_core::PythonCompiledSchema {
    let mut ctx = Context::ordinary();
    CompiledSchema::compile_python_source(
        &schema(),
        &PythonSchemaResources::default(),
        false,
        PythonReVersion::V3_11,
        &mut ctx,
    )
    .expect("valid Python consumer schema")
}

#[test]
fn host_error_text_collision_is_not_deferred_as_a_schema_terminal() {
    let compiled = compiled();
    let mut meter = |_work: usize| {
        Err(EngineError::new(
            "PYTHON_SCHEMA_ARITHMETIC",
            Utf16::default(),
            "nan-to-integer",
        ))
    };
    let mut meter: &mut WorkMeter<'_> = &mut meter;
    let mut ctx = Context::ordinary().with_meter(&mut meter);
    let error = compiled
        .evaluate(
            &Py::Float(1.0f64.to_bits()),
            PythonSchemaEvaluationMode::AllErrors,
            &mut ctx,
        )
        .expect_err("host meter error must remain an outer operation error");
    assert_eq!(error.code, "PYTHON_SCHEMA_ARITHMETIC");
    assert_eq!(error.message.to_utf8().unwrap(), "nan-to-integer");
}

#[test]
fn host_cannot_replay_a_previously_trusted_semantic_terminal() {
    let compiled = compiled();
    let mut ordinary = Context::ordinary();
    let result = compiled
        .evaluate(
            &Py::Float(f64::NAN.to_bits()),
            PythonSchemaEvaluationMode::FirstError,
            &mut ordinary,
        )
        .expect("semantic arithmetic terminal is returned in the evaluation result");
    let prior_terminal = result
        .terminal_error
        .expect("NaN multipleOf must create a trusted deferred terminal");
    assert_eq!(prior_terminal.code, "PYTHON_SCHEMA_ARITHMETIC");

    let mut meter = move |_work: usize| Err(prior_terminal.clone());
    let mut meter: &mut WorkMeter<'_> = &mut meter;
    let mut ctx = Context::ordinary().with_meter(&mut meter);
    let error = compiled
        .evaluate(
            &Py::Float(1.0f64.to_bits()),
            PythonSchemaEvaluationMode::AllErrors,
            &mut ctx,
        )
        .expect_err("a host-replayed EngineError must lose trusted semantic provenance");
    assert_eq!(error.code, "PYTHON_SCHEMA_ARITHMETIC");
    assert_eq!(error.message.to_utf8().unwrap(), "nan-to-integer");
}
