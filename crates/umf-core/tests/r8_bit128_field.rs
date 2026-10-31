// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::{
    core_bit128_field::declare_core_bit128_field,
    engine::{Engine, ResourceSet},
    serialization::{read_json_value, Format},
    Capabilities, Context, Diagnostic, Registry, SemanticContext, Utf16, Value,
};

const FROZEN: &str = include_str!("../../../tests/rust-core/fixtures/r8-bit128-field-candidate-20261028/frozen-typescript.json");

struct NoCapabilities;
impl Capabilities for NoCapabilities {
    fn validate_extension(
        &mut self,
        _: u64,
        _: &Value,
        _: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        Ok(Vec::new())
    }
}

fn parse(source: &str) -> Value {
    read_json_value(
        &source.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        &mut Context::ordinary(),
    )
    .unwrap()
}

fn get<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    match value {
        Value::Object(fields) => fields
            .iter()
            .find(|(key, _)| key == &Utf16::from(name))
            .map(|(_, value)| value),
        _ => None,
    }
}

fn string(value: &Value) -> String {
    let Value::String(value) = value else {
        panic!("expected string")
    };
    value.to_utf8().unwrap()
}

fn equal(left: &Value, right: &Value) -> bool {
    match (left, right) {
        (Value::Array(a), Value::Array(b)) => {
            a.len() == b.len() && a.iter().zip(b).all(|(x, y)| equal(x, y))
        }
        (Value::Object(a), Value::Object(b)) => {
            a.len() == b.len()
                && a.iter().all(|(k, v)| {
                    b.iter()
                        .find(|(q, _)| q == k)
                        .is_some_and(|(_, w)| equal(v, w))
                })
        }
        _ => left == right,
    }
}

fn engine() -> Engine {
    Engine::new(
        ResourceSet::new(
            parse(include_str!("../../../spec/core/schema.json")),
            parse(include_str!(
                "../../../spec/core/semantic-type-reference.schema.json"
            )),
            parse(include_str!(
                "../../../spec/core/extension-package.schema.json"
            )),
            parse(include_str!(
                "../../../spec/metamodel/generated/core-constraints.json"
            )),
            parse(include_str!(
                "../../../spec/metamodel/generated/domain-policy.json"
            )),
        ),
        &mut Context::ordinary(),
    )
    .unwrap()
}

#[test]
fn current_010_authoring_matches_frozen_typescript_outcomes_and_preserves_input() {
    let engine = engine();
    let packet = parse(FROZEN);
    let Value::Array(cases) = get(&packet, "cases").unwrap() else {
        panic!("frozen cases")
    };
    for case in cases {
        let name = string(get(case, "name").unwrap());
        let input = get(case, "input").unwrap();
        let source = get(input, "source").unwrap();
        let before = source.clone();
        let identity = get(input, "identity").unwrap();
        let scalar_type = get(input, "scalarType").unwrap();
        let expected = get(case, "expected").unwrap();
        let mut capabilities = NoCapabilities;
        let result = declare_core_bit128_field(
            source,
            identity,
            scalar_type,
            &engine,
            &Registry::default(),
            &mut capabilities,
            &mut Context::ordinary(),
        );
        assert!(equal(source, &before), "input mutated in {name}");
        if get(expected, "ok") == Some(&Value::Bool(true)) {
            assert!(
                equal(&result.unwrap(), get(expected, "value").unwrap()),
                "success mismatch in {name}"
            );
        } else {
            let error = result.unwrap_err();
            let expected_error = get(expected, "error").unwrap();
            assert_eq!(
                error.code,
                string(get(expected_error, "code").unwrap()),
                "code in {name}"
            );
            assert_eq!(
                error.path.to_utf8().unwrap(),
                string(get(expected_error, "path").unwrap()),
                "path in {name}"
            );
            assert_eq!(
                error.message.to_utf8().unwrap(),
                string(get(expected_error, "message").unwrap()),
                "message in {name}"
            );
        }
    }
}
