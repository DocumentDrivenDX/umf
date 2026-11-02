// SPDX-License-Identifier: MIT OR Apache-2.0
use num_bigint::BigInt;
use serde_json::Value as Json;
use umf_core::{Context, PyText, PythonConsumerValue as Py, PythonReVersion};

const ARITHMETIC: &str = include_str!("../../../tests/rust-core/fixtures/r2/sol-python-schema-arithmetic-predecessor.json");
const EDGES: &str = include_str!("../../../tests/rust-core/fixtures/r2/sol-python-schema-arithmetic-edges-predecessor.json");

fn py(value: &Json) -> Py {
    match value {
        Json::Null => Py::Null,
        Json::Bool(value) => Py::Bool(*value),
        Json::Number(number) => {
            if let Some(value) = number.as_i64() {
                Py::Integer(BigInt::from(value))
            } else if let Some(value) = number.as_u64() {
                Py::Integer(BigInt::from(value))
            } else {
                Py::Float(
                    number
                        .as_f64()
                        .expect("JSON number is representable as f64")
                        .to_bits(),
                )
            }
        }
        Json::String(value) => Py::String(PyText::from_utf8(value)),
        Json::Array(values) => Py::Array(values.iter().map(py).collect()),
        Json::Object(values) => Py::Object(
            values
                .iter()
                .map(|(key, value)| (PyText::from_utf8(key), py(value)))
                .collect(),
        ),
    }
}

fn recipe(value: &Json) -> Py {
    let kind = value["kind"].as_str().expect("recipe kind");
    match kind {
        "int" => Py::Integer(
            BigInt::parse_bytes(
                value["decimal"]
                    .as_str()
                    .expect("integer decimal")
                    .as_bytes(),
                10,
            )
            .expect("valid integer recipe"),
        ),
        "float" => Py::Float(
            u64::from_str_radix(value["bits"].as_str().expect("float bits"), 16)
                .expect("valid IEEE-754 recipe"),
        ),
        other => panic!("unknown recipe kind {other}"),
    }
}

fn verify_corpus(source: &str, expected_cases: usize) {
    let corpus: Json = serde_json::from_str(source).expect("valid frozen corpus");
    assert_eq!(corpus["python"], "3.11.17");
    assert_eq!(corpus["jsonschema"], "4.26.0");
    let cases = corpus["cases"].as_array().expect("case array");
    assert_eq!(cases.len(), expected_cases);
    let mut validities = 0;
    let mut arithmetic_errors = 0;
    for case in cases {
        let schema_value = case
            .get("schemaText")
            .and_then(Json::as_str)
            .map(|text| serde_json::from_str(text).expect("schemaText JSON"))
            .unwrap_or_else(|| case["schema"].clone());
        let schema = py(&schema_value);
        let instance_name = case["instance"].as_str().expect("instance recipe key");
        let instance = recipe(&corpus["instanceRecipes"][instance_name]);
        let mut ctx = Context::ordinary();
        let compiled = umf_core::schema::CompiledSchema::compile_python_source(
            &schema,
            &umf_core::PythonSchemaResources::default(),
            false,
            PythonReVersion::V3_11,
            &mut ctx,
        )
        .unwrap_or_else(|error| {
            panic!(
                "{} schema admission failed: {} {}",
                case["id"],
                error.code,
                error.message.to_utf8().unwrap_or_default()
            )
        });
        let actual = compiled.validate(&instance, &mut ctx);
        match case["outcome"]["status"].as_str().unwrap() {
            "validity" => {
                validities += 1;
                let expected = case["outcome"]["valid"].as_bool().unwrap();
                let errors = actual.unwrap_or_else(|error| {
                    panic!(
                        "{} unexpectedly errored: {} {}",
                        case["id"],
                        error.code,
                        error.message.to_utf8().unwrap_or_default()
                    )
                });
                assert_eq!(errors.is_empty(), expected, "{}", case["id"]);
            }
            "instance-error" => {
                arithmetic_errors += 1;
                let error = actual.unwrap_err();
                assert_eq!(error.code, "PYTHON_SCHEMA_ARITHMETIC", "{}", case["id"]);
                let expected_reason = match case["outcome"]["message"].as_str().unwrap() {
                    "cannot convert float NaN to integer" => "nan-to-integer",
                    "cannot convert Infinity to integer ratio" => "infinity-to-integer-ratio",
                    "int too large to convert to float" => "integer-to-float-overflow",
                    message => panic!(
                        "{} has an unclassified predecessor arithmetic error: {message}",
                        case["id"]
                    ),
                };
                assert_eq!(
                    error.message.to_utf8().unwrap(),
                    expected_reason,
                    "{}",
                    case["id"]
                );
            }
            status => panic!("{} has unsupported outcome {status}", case["id"]),
        }
    }
    assert_eq!(
        (validities, arithmetic_errors),
        if expected_cases == 648 {
            (558, 90)
        } else {
            (1758, 180)
        }
    );
}

#[test]
fn python_consumer_arithmetic_matches_frozen_predecessor_corpora() {
    verify_corpus(ARITHMETIC, 648);
    verify_corpus(EDGES, 1938);
}
