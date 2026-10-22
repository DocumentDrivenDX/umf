// SPDX-License-Identifier: MIT OR Apache-2.0
use serde_json::{json, Value as Json};
use umf_core::{
    python_value::PythonSchemaPathSegment,
    schema::CompiledSchema,
    serialization::{read_python_value, Format},
    Context, EngineError, PyText, PythonConsumerValue as Py, PythonReVersion,
    PythonSchemaEvaluationMode, PythonStructuralError, Utf16,
};
const FROZEN: &str = include_str!("../../../docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-annotation-order-predecessor.json");

fn recipe(value: &Json) -> Py {
    match value["kind"].as_str().unwrap() {
        "float" => Py::Float(u64::from_str_radix(value["bits"].as_str().unwrap(), 16).unwrap()),
        "string" => Py::String(PyText::from_utf8(value["value"].as_str().unwrap())),
        "array" => Py::Array(
            value["items"]
                .as_array()
                .unwrap()
                .iter()
                .map(recipe)
                .collect(),
        ),
        "object" => Py::Object(
            value["members"]
                .as_array()
                .unwrap()
                .iter()
                .map(|member| {
                    (
                        PyText::from_utf8(member[0].as_str().unwrap()),
                        recipe(&member[1]),
                    )
                })
                .collect(),
        ),
        other => panic!("unexpected frozen instance recipe {other}"),
    }
}
fn text(value: &PyText) -> String {
    value
        .codepoints()
        .iter()
        .map(|point| char::from_u32(*point).unwrap())
        .collect()
}
fn signature(error: &PythonStructuralError) -> Json {
    let pointer = text(&error.instance_path);
    let instance_path: Vec<_> = pointer.strip_prefix('/').map_or(Vec::new(), |path| {
        path.split('/')
            .map(|part| Json::String(part.replace("~1", "/").replace("~0", "~")))
            .collect()
    });
    let schema_path: Vec<_> = error
        .schema_path_segments
        .iter()
        .map(|part| match part {
            PythonSchemaPathSegment::Key(key) => json!(text(key)),
            PythonSchemaPathSegment::Index(index) => json!(index),
        })
        .collect();
    json!({"keyword":error.keyword.as_ref().map(text),"instancePath":instance_path,"schemaPath":schema_path})
}
fn assert_terminal(actual: Option<&EngineError>, expected: &Json, id: &str) {
    match expected["status"].as_str().unwrap() {
        "arithmetic-error" => {
            assert_eq!(expected["type"], "ValueError");
            assert_eq!(expected["message"], "cannot convert float NaN to integer");
            let error = actual.unwrap_or_else(|| panic!("{id} missing arithmetic terminal"));
            assert_eq!(error.code, "PYTHON_SCHEMA_ARITHMETIC", "{id}");
            assert_eq!(error.message.to_utf8().unwrap(), "nan-to-integer", "{id}");
        }
        "evaluation-error" => {
            assert!(
                matches!(
                    expected["type"].as_str(),
                    Some("PointerToNowhere" | "_WrappedReferencingError")
                ),
                "{id} unexpected frozen terminal type"
            );
            let error = actual.unwrap_or_else(|| panic!("{id} missing reference terminal"));
            assert_eq!(error.code, "SCHEMA_REF_UNRESOLVED", "{id}");
            assert_eq!(
                error.message.to_utf8().unwrap(),
                "Schema reference target does not exist",
                "{id}"
            );
        }
        "validity" | "valid" | "validation-error" | "end" => {
            assert!(actual.is_none(), "{id} unexpected terminal {actual:?}")
        }
        other => panic!("unexpected frozen result {other}"),
    }
}
#[test]
fn annotation_helper_order_matches_frozen_native_methods() {
    let corpus: Json = serde_json::from_str(FROZEN).unwrap();
    assert_eq!(
        corpus["profile"],
        "umf.r2-sol-python-schema-annotation-order/1"
    );
    assert_eq!(corpus["python"], "3.11.17");
    assert_eq!(corpus["jsonschema"], "4.26.0");
    let cases = corpus["cases"].as_array().unwrap();
    assert_eq!(cases.len(), 53);
    let mut observations = 0;
    for case in cases {
        let id = case["id"].as_str().unwrap();
        assert!(case.get("schemaError").is_none());
        let mut ctx = Context::ordinary();
        let schema = read_python_value(
            &PyText::from_utf8(case["schemaText"].as_str().unwrap()),
            Format::Json,
            &mut ctx,
        )
        .unwrap();
        let compiled = CompiledSchema::compile_python_source(
            &schema,
            &Default::default(),
            false,
            PythonReVersion::V3_11,
            &mut ctx,
        )
        .unwrap();
        let instance = recipe(&case["instanceRecipe"]);
        for (method, mode) in [
            ("is_valid", PythonSchemaEvaluationMode::FirstError),
            ("validate", PythonSchemaEvaluationMode::FirstError),
            ("iterate", PythonSchemaEvaluationMode::AllErrors),
        ] {
            let expected = &case["methods"][method];
            let actual = compiled
                .evaluate(&instance, mode, &mut Context::ordinary())
                .unwrap_or_else(|error| panic!("{id} {method} operational failure: {error}"));
            assert_terminal(actual.terminal_error.as_ref(), expected, id);
            match method {
                "is_valid" if expected["status"] == "validity" => assert_eq!(
                    actual.errors.is_empty(),
                    expected["valid"].as_bool().unwrap(),
                    "{id} is_valid"
                ),
                "validate" if expected["status"] == "validation-error" => {
                    assert_eq!(actual.errors.len(), 1, "{id} first diagnostic count");
                    assert_eq!(
                        signature(&actual.errors[0]),
                        expected["error"],
                        "{id} first diagnostic"
                    );
                }
                "iterate" => assert_eq!(
                    actual.errors.iter().map(signature).collect::<Vec<_>>(),
                    expected["prefix"].as_array().unwrap().clone(),
                    "{id} iterator prefix"
                ),
                _ => assert!(
                    actual.errors.is_empty(),
                    "{id} unexpected diagnostic prefix"
                ),
            }
            observations += 1;
        }
    }
    assert_eq!(observations, 159);
}

#[test]
fn annotation_borrowed_key_scan_admits_work_and_keeps_host_errors_operational() {
    let schema = Py::Object(vec![
        (PyText::from_utf8("unevaluatedProperties"), Py::Bool(false)),
        (PyText::from_utf8(&"x".repeat(300_000)), Py::Bool(true)),
    ]);
    let compiled = CompiledSchema::compile_python_source(
        &schema,
        &Default::default(),
        false,
        PythonReVersion::V3_11,
        &mut Context::ordinary(),
    )
    .unwrap();
    let mut denied = 0;
    let mut meter = |amount: usize| {
        if amount >= 300_000 {
            denied += 1;
            Err(EngineError::new(
                "PYTHON_SCHEMA_ARITHMETIC",
                Utf16::default(),
                "nan-to-integer",
            ))
        } else {
            Ok(())
        }
    };
    let mut ctx = Context::ordinary().with_meter(&mut meter);
    let error = compiled
        .evaluate(
            &Py::Object(Vec::new()),
            PythonSchemaEvaluationMode::FirstError,
            &mut ctx,
        )
        .expect_err(
            "host refusal must remain operational, before the long borrowed-key comparison",
        );
    assert_eq!(error.code, "PYTHON_SCHEMA_ARITHMETIC");
    drop(ctx);
    assert_eq!(denied, 1);
}
