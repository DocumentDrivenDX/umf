// SPDX-License-Identifier: MIT OR Apache-2.0
use num_bigint::BigInt;
use serde_json::{json, Value as Json};
use umf_core::{
    python_value::PythonSchemaPathSegment,
    schema::CompiledSchema,
    serialization::{self, Format},
    Context, EngineError, PyText, PythonCompiledSchema, PythonConsumerValue as Py, PythonReVersion,
    PythonSchemaEvaluationMode, PythonSchemaResources,
};

const REFERENCES: &str = include_str!("../../../docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-reference-terminals-predecessor.json");
const REFERENCE_INDICES: &str = include_str!("../../../docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-reference-indices-predecessor.json");
const PATH_SEGMENTS: &str = include_str!("../../../docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-path-segments-predecessor.json");

fn recipe(value: &Json) -> Py {
    match value["kind"].as_str().expect("recipe kind") {
        "integer" => Py::Integer(
            BigInt::parse_bytes(value["decimal"].as_str().unwrap().as_bytes(), 10)
                .expect("integer recipe"),
        ),
        "float" => Py::Float(u64::from_str_radix(value["bits"].as_str().unwrap(), 16).unwrap()),
        "string" => Py::String(if let Some(points) = value["points"].as_array() {
            PyText::from_codepoints(
                points
                    .iter()
                    .map(|point| point.as_u64().unwrap() as u32)
                    .collect(),
            )
            .unwrap()
        } else {
            PyText::from_utf8(value["value"].as_str().unwrap())
        }),
        "null" => Py::Null,
        "bool" | "boolean" => Py::Bool(value["value"].as_bool().unwrap()),
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
        other => panic!("unknown frozen recipe {other}"),
    }
}

fn instance(case: &Json, receipt: &Json) -> Py {
    let instance_recipe = &case["instanceRecipe"];
    if instance_recipe.get("kind").is_some() {
        return recipe(instance_recipe);
    }
    let value = recipe(&receipt["instanceValues"][instance_recipe["value"].as_str().unwrap()]);
    match instance_recipe["shape"].as_str().unwrap() {
        "scalar" => value,
        "array" => Py::Array(vec![value]),
        "object" => Py::Object(vec![(PyText::from_utf8("x"), value)]),
        shape => panic!("unknown instance shape {shape}"),
    }
}

fn compile_text(text: &str) -> Result<PythonCompiledSchema, EngineError> {
    let mut ctx = Context::ordinary();
    let source = PyText::from_utf8(text);
    let schema = serialization::read_python_value(&source, Format::Json, &mut ctx)?;
    CompiledSchema::compile_python_source(
        &schema,
        &PythonSchemaResources::default(),
        false,
        PythonReVersion::V3_11,
        &mut ctx,
    )
}

fn compile_recipe(value: &Json) -> Result<PythonCompiledSchema, EngineError> {
    let mut ctx = Context::ordinary();
    let schema = recipe(value);
    CompiledSchema::compile_python_source(
        &schema,
        &PythonSchemaResources::default(),
        false,
        PythonReVersion::V3_11,
        &mut ctx,
    )
}

fn schema_segments(error: &umf_core::PythonStructuralError) -> Vec<Json> {
    error
        .schema_path_segments
        .iter()
        .map(|segment| match segment {
            PythonSchemaPathSegment::Index(index) => json!(index),
            PythonSchemaPathSegment::Key(key) => json!(key
                .codepoints()
                .iter()
                .map(|point| char::from_u32(*point).unwrap())
                .collect::<String>()),
        })
        .collect()
}

fn terminal_code(error: &EngineError) -> &str {
    match error.code.as_str() {
        "SCHEMA_REF_UNRESOLVED" => "SCHEMA_REF_UNRESOLVED",
        "PYTHON_SCHEMA_EVALUATION" => "PYTHON_SCHEMA_EVALUATION",
        other => panic!("unexpected terminal code {other}: {error}"),
    }
}

fn expected_terminal_code(expected: &Json) -> Option<&'static str> {
    (expected["status"] == "evaluation-error").then(|| {
        if expected["type"] == "_WrappedReferencingError" {
            "SCHEMA_REF_UNRESOLVED"
        } else {
            "PYTHON_SCHEMA_EVALUATION"
        }
    })
}

fn assert_diagnostic(actual: &umf_core::PythonStructuralError, expected: &Json, id: &str) {
    let expected_keyword = expected["keyword"]
        .as_str()
        .map(|text| text.chars().map(u32::from).collect::<Vec<_>>());
    assert_eq!(
        actual
            .keyword
            .as_ref()
            .map(|text| text.codepoints().to_vec()),
        expected_keyword,
        "{id} keyword"
    );
    assert_eq!(
        json!(schema_segments(actual)),
        expected["schemaPath"],
        "{id} schemaPath internal={:?}",
        actual.schema_path
    );
}

fn assert_methods(compiled: &PythonCompiledSchema, value: &Py, methods: &Json, id: &str) {
    let mut ctx = Context::ordinary();
    let actual = compiled
        .evaluate(value, PythonSchemaEvaluationMode::FirstError, &mut ctx)
        .unwrap();
    let expected = &methods["is_valid"];
    match expected["status"].as_str().unwrap() {
        "validity" => {
            assert_eq!(
                actual.terminal_error.is_some(),
                false,
                "{id} is_valid terminal"
            );
            assert_eq!(
                actual.errors.is_empty(),
                expected["valid"].as_bool().unwrap(),
                "{id} is_valid"
            );
        }
        "evaluation-error" => assert_eq!(
            terminal_code(
                actual
                    .terminal_error
                    .as_ref()
                    .unwrap_or_else(|| panic!("{id} expected terminal error"))
            ),
            expected_terminal_code(expected).unwrap(),
            "{id} is_valid terminal"
        ),
        status => panic!("unexpected is_valid outcome {status}"),
    }

    let mut ctx = Context::ordinary();
    let actual = compiled
        .evaluate(value, PythonSchemaEvaluationMode::FirstError, &mut ctx)
        .unwrap();
    let expected = &methods["validate"];
    match expected["status"].as_str().unwrap() {
        "valid" => {
            assert!(actual.errors.is_empty(), "{id} validate errors");
            assert!(actual.terminal_error.is_none(), "{id} validate terminal");
        }
        "validation-error" => assert_diagnostic(&actual.errors[0], &expected["error"], id),
        "evaluation-error" => assert_eq!(
            terminal_code(actual.terminal_error.as_ref().unwrap()),
            expected_terminal_code(expected).unwrap(),
            "{id} validate terminal"
        ),
        status => panic!("unexpected validate outcome {status}"),
    }

    let mut ctx = Context::ordinary();
    let actual = compiled
        .evaluate(value, PythonSchemaEvaluationMode::AllErrors, &mut ctx)
        .unwrap();
    let expected = &methods["iterate"];
    let prefix = expected["prefix"].as_array().unwrap();
    assert_eq!(
        actual.errors.len(),
        prefix.len(),
        "{id} iterate prefix length"
    );
    for (error, expected) in actual.errors.iter().zip(prefix) {
        assert_diagnostic(error, expected, id);
    }
    match expected["status"].as_str().unwrap() {
        "end" => assert!(actual.terminal_error.is_none(), "{id} iterate terminal"),
        "evaluation-error" => assert_eq!(
            terminal_code(actual.terminal_error.as_ref().unwrap()),
            expected_terminal_code(expected).unwrap(),
            "{id} iterate terminal"
        ),
        status => panic!("unexpected iterate status {status}"),
    }
}

#[test]
fn reached_local_reference_terminals_match_frozen_methods() {
    let receipt: Json = serde_json::from_str(REFERENCES).unwrap();
    assert_eq!(receipt["cases"].as_array().unwrap().len(), 363);
    for case in receipt["cases"].as_array().unwrap() {
        let id = case["id"].as_str().unwrap();
        let compiled = compile_text(case["schemaText"].as_str().unwrap())
            .unwrap_or_else(|error| panic!("{id} schema admission: {error}"));
        assert_methods(&compiled, &instance(case, &receipt), &case["methods"], id);
    }
}

#[test]
fn reached_local_reference_array_indices_match_frozen_methods() {
    let receipt: Json = serde_json::from_str(REFERENCE_INDICES).unwrap();
    assert_eq!(receipt["cases"].as_array().unwrap().len(), 315);
    for case in receipt["cases"].as_array().unwrap() {
        let id = case["id"].as_str().unwrap();
        let compiled = compile_text(case["schemaText"].as_str().unwrap())
            .unwrap_or_else(|error| panic!("{id} schema admission: {error}"));
        assert_methods(&compiled, &instance(case, &receipt), &case["methods"], id);
    }
}

#[test]
fn schema_error_paths_retain_key_versus_array_index_types() {
    let receipt: Json = serde_json::from_str(PATH_SEGMENTS).unwrap();
    assert_eq!(receipt["cases"].as_array().unwrap().len(), 48);
    let mut refusals = 0;
    let mut observations = 0;
    for case in receipt["cases"].as_array().unwrap() {
        let id = case["id"].as_str().unwrap();
        let compiled = match compile_recipe(&case["schemaRecipe"]) {
            Ok(compiled) => compiled,
            Err(_) if case.get("schemaError").is_some() => {
                refusals += 1;
                continue;
            }
            Err(error) => panic!("{id} schema admission: {error}"),
        };
        let value = recipe(&case["instanceRecipe"]);
        let mut ctx = Context::ordinary();
        let actual = compiled
            .evaluate(&value, PythonSchemaEvaluationMode::AllErrors, &mut ctx)
            .unwrap();
        let expected = case["errors"].as_array().unwrap();
        assert_eq!(actual.errors.len(), expected.len(), "{id} error count");
        for (error, expected) in actual.errors.iter().zip(expected) {
            assert_eq!(
                json!(schema_segments(error)),
                expected["schemaPath"],
                "{id} typed schemaPath"
            );
            let expected_keyword = expected["keyword"]
                .as_str()
                .map(|text| text.chars().map(u32::from).collect::<Vec<_>>());
            assert_eq!(
                error
                    .keyword
                    .as_ref()
                    .map(|text| text.codepoints().to_vec()),
                expected_keyword,
                "{id} keyword"
            );
            observations += 1;
        }
    }
    assert_eq!(refusals, 1);
    assert_eq!(observations, 42);
}
