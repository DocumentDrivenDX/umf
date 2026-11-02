// SPDX-License-Identifier: MIT OR Apache-2.0
use num_bigint::BigInt;
use serde_json::Value as Json;
use umf_core::{
    python_value::PythonSchemaPathSegment, schema::CompiledSchema, Context, EngineError, PyText,
    PythonCompiledSchema, PythonConsumerValue as Py, PythonReVersion, PythonSchemaEvaluationMode,
    PythonSchemaResources,
};

const RECEIPT: &str = include_str!("../../../tests/rust-core/fixtures/r2/sol-python-recursive-resource-scope-predecessor.json");

fn recipe(value: &Json) -> Py {
    match value["kind"].as_str().expect("recipe kind") {
        "integer" => Py::Integer(
            BigInt::parse_bytes(value["decimal"].as_str().unwrap().as_bytes(), 10).unwrap(),
        ),
        "float" => Py::Float(u64::from_str_radix(value["bits"].as_str().unwrap(), 16).unwrap()),
        "string" => Py::String(
            PyText::from_codepoints(
                value["codepoints"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|v| v.as_u64().unwrap() as u32)
                    .collect(),
            )
            .unwrap(),
        ),
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
                    let key = PyText::from_codepoints(
                        member[0]
                            .as_array()
                            .unwrap()
                            .iter()
                            .map(|v| v.as_u64().unwrap() as u32)
                            .collect(),
                    )
                    .unwrap();
                    (key, recipe(&member[1]))
                })
                .collect(),
        ),
        other => panic!("unknown recipe {other}"),
    }
}

fn compile(schema: &Py) -> Result<PythonCompiledSchema, EngineError> {
    let mut ctx = Context::ordinary();
    CompiledSchema::compile_python_source(
        schema,
        &PythonSchemaResources::default(),
        false,
        PythonReVersion::V3_11,
        &mut ctx,
    )
}

fn expected_code(expected: &Json) -> &'static str {
    match expected["type"].as_str().unwrap() {
        "_WrappedReferencingError" | "PointerToNowhere" => "SCHEMA_REF_UNRESOLVED",
        "TypeError" => "PYTHON_SCHEMA_EVALUATION",
        other => panic!("unexpected predecessor terminal {other}"),
    }
}

fn py_string(value: &PyText) -> String {
    value
        .codepoints()
        .iter()
        .map(|point| char::from_u32(*point).unwrap())
        .collect()
}

fn expected_segments(value: &Json) -> Vec<PythonSchemaPathSegment> {
    value
        .as_array()
        .unwrap()
        .iter()
        .map(|segment| {
            if let Some(index) = segment.get("index") {
                PythonSchemaPathSegment::Index(index.as_u64().unwrap() as usize)
            } else {
                let points = segment["key"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|v| v.as_u64().unwrap() as u32)
                    .collect();
                PythonSchemaPathSegment::Key(PyText::from_codepoints(points).unwrap())
            }
        })
        .collect()
}

fn expected_pointer(segments: &[PythonSchemaPathSegment]) -> String {
    let mut result = String::new();
    for segment in segments {
        result.push('/');
        match segment {
            PythonSchemaPathSegment::Index(index) => result.push_str(&index.to_string()),
            PythonSchemaPathSegment::Key(key) => {
                for point in key.codepoints() {
                    match *point {
                        0x2f => result.push_str("~1"),
                        0x7e => result.push_str("~0"),
                        other => result.push(char::from_u32(other).unwrap()),
                    }
                }
            }
        }
    }
    result
}

fn expected_error(actual: &umf_core::PythonStructuralError, expected: &Json, id: &str) {
    assert_eq!(
        actual.keyword.as_ref().map(py_string),
        expected["keyword"].as_str().map(str::to_owned),
        "{id} keyword"
    );
    let instance_segments = expected_segments(&expected["instancePath"]);
    let schema_segments = expected_segments(&expected["schemaPath"]);
    assert_eq!(
        py_string(&actual.instance_path),
        expected_pointer(&instance_segments),
        "{id} instancePath"
    );
    assert_eq!(
        actual.schema_path_segments,
        schema_segments,
        "{id} typed schemaPath display={} full={:?}",
        py_string(&actual.schema_path),
        actual
    );
}

fn assert_methods(compiled: &PythonCompiledSchema, data: &Py, methods: &Json, id: &str) {
    let mut ctx = Context::ordinary();
    let got = compiled
        .evaluate(data, PythonSchemaEvaluationMode::FirstError, &mut ctx)
        .unwrap();
    let want = &methods["is_valid"];
    match want["status"].as_str().unwrap() {
        "validity" => {
            assert!(
                got.terminal_error.is_none(),
                "{id} is_valid terminal={:?} errors={:?}",
                got.terminal_error,
                got.errors
            );
            assert_eq!(
                got.errors.is_empty(),
                want["valid"].as_bool().unwrap(),
                "{id} is_valid errors={:?}",
                got.errors
            );
        }
        "evaluation-error" => assert_eq!(
            got.terminal_error.as_ref().map(|e| e.code.as_str()),
            Some(expected_code(want)),
            "{id} is_valid terminal actual={:?} errors={:?}",
            got.terminal_error,
            got.errors
        ),
        status => panic!("{id} unexpected is_valid status {status}"),
    }

    let mut ctx = Context::ordinary();
    let got = compiled
        .evaluate(data, PythonSchemaEvaluationMode::FirstError, &mut ctx)
        .unwrap();
    let want = &methods["validate"];
    match want["status"].as_str().unwrap() {
        "valid" => {
            assert!(got.errors.is_empty(), "{id} validate errors");
            assert!(got.terminal_error.is_none(), "{id} validate terminal");
        }
        "validation-error" => expected_error(&got.errors[0], &want["error"], id),
        "evaluation-error" => assert_eq!(
            got.terminal_error.as_ref().unwrap().code,
            expected_code(want),
            "{id} validate terminal"
        ),
        status => panic!("{id} unexpected validate status {status}"),
    }

    let mut ctx = Context::ordinary();
    let got = compiled
        .evaluate(data, PythonSchemaEvaluationMode::AllErrors, &mut ctx)
        .unwrap();
    let want = &methods["iterate"];
    let prefix = want["prefix"].as_array().unwrap();
    assert_eq!(got.errors.len(), prefix.len(), "{id} iterator prefix");
    for (actual, expected) in got.errors.iter().zip(prefix) {
        expected_error(actual, expected, id);
    }
    match want["status"].as_str().unwrap() {
        "end" => assert!(got.terminal_error.is_none(), "{id} iterator terminal"),
        "evaluation-error" => assert_eq!(
            got.terminal_error.as_ref().unwrap().code,
            expected_code(want),
            "{id} iterator terminal"
        ),
        status => panic!("{id} unexpected iterate status {status}"),
    }
}

#[test]
fn recursive_resource_scope_matches_frozen_python_profiles() {
    let receipt: Json = serde_json::from_str(RECEIPT).unwrap();
    assert_eq!(receipt["cases"].as_array().unwrap().len(), 89);
    let mut admitted = 0;
    let mut refusals = 0;
    let mut methods = 0;
    for case in receipt["cases"].as_array().unwrap() {
        let id = case["id"].as_str().unwrap();
        let schema = recipe(&case["schemaRecipe"]);
        let compiled = match compile(&schema) {
            Ok(compiled) => compiled,
            Err(error) if case.get("schemaError").is_some() => {
                assert_eq!(
                    error.code, "SCHEMA_REF_UNRESOLVED",
                    "{id} constructor classification"
                );
                refusals += 1;
                continue;
            }
            Err(error) => panic!("{id} unexpected schema refusal: {error}"),
        };
        assert!(
            case.get("schemaError").is_none(),
            "{id} expected constructor refusal"
        );
        admitted += 1;
        let data = recipe(&case["instanceRecipe"]);
        assert_methods(&compiled, &data, &case["methods"], id);
        methods += 3;
    }
    assert_eq!(admitted, 85);
    assert_eq!(refusals, 4);
    assert_eq!(methods, 255);
}

#[test]
fn reached_reference_inside_opaque_member_keeps_raw_python_key_identity() {
    let pair = PyText::from_codepoints(vec![0xd83d, 0xde00]).unwrap();
    let astral = PyText::from_codepoints(vec![0x1f600]).unwrap();
    let key = |text: &str| PyText::from_codepoints(text.chars().map(u32::from).collect()).unwrap();
    let text = |value: &str| Py::String(key(value));
    let schema = Py::Object(vec![
        (
            key("$schema"),
            text("https://json-schema.org/draft/2019-09/schema"),
        ),
        (
            key("$defs"),
            Py::Object(vec![
                (pair, Py::Object(vec![(key("const"), text("pair"))])),
                (
                    astral.clone(),
                    Py::Object(vec![(key("const"), text("astral"))]),
                ),
            ]),
        ),
        (
            key("x-target"),
            Py::Object(vec![(
                key("$ref"),
                Py::String(
                    PyText::from_codepoints(
                        "#/$defs/"
                            .chars()
                            .map(u32::from)
                            .chain(astral.codepoints().iter().copied())
                            .collect(),
                    )
                    .unwrap(),
                ),
            )]),
        ),
        (key("$ref"), text("#/x-target")),
    ]);
    let compiled = compile(&schema).unwrap();
    let mut ctx = Context::ordinary();
    let valid = compiled
        .evaluate(
            &text("astral"),
            PythonSchemaEvaluationMode::FirstError,
            &mut ctx,
        )
        .unwrap();
    assert!(valid.terminal_error.is_none());
    assert!(valid.errors.is_empty());

    let pair_value = text("pair");
    let mut ctx = Context::ordinary();
    let invalid = compiled
        .evaluate(
            &pair_value,
            PythonSchemaEvaluationMode::FirstError,
            &mut ctx,
        )
        .unwrap();
    assert!(invalid.terminal_error.is_none());
    assert_eq!(invalid.errors.len(), 1);
}

#[test]
fn resource_identity_companion_matches_exact_native_profiles() {
    let receipt: Json = serde_json::from_str(include_str!("../../../tests/rust-core/fixtures/r2/sol-python-resource-identity-companion-predecessor.json")).unwrap();
    assert_eq!(
        receipt["profile"],
        "umf.r2-sol-python-resource-identity-companion/1"
    );
    assert_eq!(receipt["cases"].as_array().unwrap().len(), 114);
    let mut observations = 0;
    for case in receipt["cases"].as_array().unwrap() {
        let id = case["id"].as_str().unwrap();
        assert!(case.get("schemaError").is_none());
        let schema = recipe(&case["schemaRecipe"]);
        let compiled = compile(&schema)
            .unwrap_or_else(|error| panic!("{id} unexpected constructor refusal: {error}"));
        assert_methods(
            &compiled,
            &recipe(&case["instanceRecipe"]),
            &case["methods"],
            id,
        );
        observations += 3;
    }
    assert_eq!(observations, 342);
}

#[test]
fn resource_anchor_companion_uses_source_identity() {
    let receipt: Json = serde_json::from_str(include_str!("../../../tests/rust-core/fixtures/r2/sol-python-resource-anchor-companion-predecessor.json")).unwrap();
    assert_eq!(receipt["cases"].as_array().unwrap().len(), 24);
    for case in receipt["cases"].as_array().unwrap() {
        let id = case["id"].as_str().unwrap();
        let schema = recipe(&case["schemaRecipe"]);
        let compiled =
            compile(&schema).unwrap_or_else(|error| panic!("{id} unexpected refusal: {error}"));
        assert_methods(
            &compiled,
            &recipe(&case["instanceRecipe"]),
            &case["methods"],
            id,
        );
    }
}

#[test]
fn native_resource_container_dialects_match_frozen_profiles() {
    let receipt: Json = serde_json::from_str(include_str!("../../../tests/rust-core/fixtures/r2/sol-python-resource-uri-operations-predecessor.json")).unwrap();
    assert_eq!(receipt["cases"].as_array().unwrap().len(), 24);
    for case in receipt["cases"].as_array().unwrap() {
        let id = case["id"].as_str().unwrap();
        let schema = recipe(&case["schemaRecipe"]);
        let compiled =
            compile(&schema).unwrap_or_else(|error| panic!("{id} unexpected refusal: {error}"));
        assert_methods(
            &compiled,
            &recipe(&case["instanceRecipe"]),
            &case["methods"],
            id,
        );
    }
}
