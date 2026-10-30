// SPDX-License-Identifier: MIT OR Apache-2.0
use num_bigint::BigInt;
use serde_json::{json, Value as Json};
use umf_core::{
    python_value::PythonSchemaPathSegment, schema::CompiledSchema, Context, PyText,
    PythonConsumerValue as Py, PythonReVersion, PythonSchemaEvaluationMode, PythonSchemaResources,
};

const PATH_KEYS: &str = include_str!("../../../tests/rust-core/fixtures/r2/sol-python-schema-path-keys-predecessor.json");

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

fn display_segments(path: &PyText) -> Vec<String> {
    let text = path
        .codepoints()
        .iter()
        .map(|point| char::from_u32(*point).expect("display pointer is scalar text"))
        .collect::<String>();
    let pointer = text.strip_prefix('#').unwrap_or(&text);
    if pointer.is_empty() {
        return Vec::new();
    }
    pointer
        .strip_prefix('/')
        .expect("diagnostic path is a JSON pointer")
        .split('/')
        .map(|segment| segment.replace("~1", "/").replace("~0", "~"))
        .collect()
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

fn expected_segments(value: &Json) -> Vec<String> {
    value
        .as_array()
        .unwrap()
        .iter()
        .map(|segment| match segment {
            Json::String(value) => value.clone(),
            Json::Number(value) => value.to_string(),
            other => panic!("unexpected path segment {other}"),
        })
        .collect()
}

fn at_path<'a>(mut value: &'a Py, segments: &[String]) -> Option<&'a Py> {
    for segment in segments {
        value = match value {
            Py::Object(members) => {
                let (_, child) = members.iter().find(|(key, _)| {
                    key.codepoints()
                        .iter()
                        .map(|point| char::from_u32(*point).unwrap())
                        .collect::<String>()
                        == *segment
                })?;
                child
            }
            Py::Array(items) => items.get(segment.parse::<usize>().ok()?)?,
            _ => return None,
        };
    }
    Some(value)
}

#[test]
fn ordinary_python_schema_keys_remain_raw_typed_path_segments() {
    let receipt: Json = serde_json::from_str(PATH_KEYS).expect("valid frozen path-key receipt");
    let cases = receipt["cases"].as_array().unwrap();
    assert_eq!(cases.len(), 132);
    let mut errors_seen = 0;
    for case in cases {
        let id = case["id"].as_str().unwrap();
        let schema = recipe(&case["schemaRecipe"]);
        let instance = recipe(&case["instanceRecipe"]);
        let mut ctx = Context::ordinary();
        let compiled = CompiledSchema::compile_python_source(
            &schema,
            &PythonSchemaResources::default(),
            false,
            PythonReVersion::V3_11,
            &mut ctx,
        )
        .unwrap_or_else(|error| panic!("{id} schema compile: {error}"));
        let mut ctx = Context::ordinary();
        let actual = compiled
            .evaluate(&instance, PythonSchemaEvaluationMode::AllErrors, &mut ctx)
            .unwrap_or_else(|error| panic!("{id} evaluation: {error}"));
        let expected_errors = case["errors"].as_array().unwrap();
        assert_eq!(
            actual.errors.len(),
            expected_errors.len(),
            "{id} error count"
        );
        for (error, expected) in actual.errors.iter().zip(expected_errors) {
            assert_eq!(
                error
                    .keyword
                    .as_ref()
                    .map(|keyword| keyword.codepoints().to_vec()),
                expected["keyword"]
                    .as_str()
                    .map(|keyword| keyword.chars().map(u32::from).collect::<Vec<_>>()),
                "{id} keyword"
            );
            assert_eq!(
                error.validator_value,
                recipe(&expected["validatorValue"]),
                "{id} validator value"
            );
            assert_eq!(
                display_segments(&error.instance_path),
                expected_segments(&expected["instancePath"]),
                "{id} instance path"
            );
            let physical = display_segments(&error.physical_instance_path);
            let subject = error
                .instance_override
                .as_ref()
                .or_else(|| at_path(&instance, &physical));
            let expected_instance = recipe(&expected["instance"]);
            assert_eq!(subject, Some(&expected_instance), "{id} error instance");
            assert_eq!(
                json!(schema_segments(error)),
                expected["schemaPath"],
                "{id} typed schema path"
            );
            errors_seen += 1;
        }
    }
    assert_eq!(errors_seen, 132);
}
