// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::serialization::{read_json_value, Format};
use umf_core::{
    engine::{Engine, ResourceSet},
    Context, Limits, ResourceProfile, Utf16, Value,
};

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
fn engine() -> Engine {
    let parse_resource = |source| parse(source);
    Engine::new(
        ResourceSet::new(
            parse_resource(include_str!("../../../spec/core/schema.json")),
            parse_resource(include_str!(
                "../../../spec/core/semantic-type-reference.schema.json"
            )),
            parse_resource(include_str!(
                "../../../spec/core/extension-package.schema.json"
            )),
            parse_resource(include_str!(
                "../../../spec/metamodel/generated/core-constraints.json"
            )),
            parse_resource(include_str!(
                "../../../spec/metamodel/generated/domain-policy.json"
            )),
        ),
        &mut Context::ordinary(),
    )
    .unwrap()
}

#[test]
fn frozen_public_typescript_results_match_exactly() {
    let frozen = parse(include_str!("../../../docs/helix/04-build/evidence/rust-migration/r5-field-value/frozen-typescript.json"));
    let source = get(&frozen, "source").unwrap();
    let operation = engine();
    let Value::Array(cases) = get(&frozen, "cases").unwrap() else {
        panic!("cases array")
    };
    for case in cases {
        let case_source = get(case, "source").unwrap_or(source);
        let actual = operation.validate_core_field_value_public(
            case_source,
            get(case, "identity").unwrap(),
            get(case, "value").unwrap(),
            &mut Context::ordinary(),
        );
        if let Some(expected_error) = get(case, "thrown") {
            let error = actual.unwrap_err();
            assert_eq!(error.code, "TYPE_ERROR", "case {:?}", get(case, "id"));
            assert_eq!(
                error.message,
                *get(expected_error, "message").unwrap().as_string().unwrap()
            );
            assert_eq!(
                *get(expected_error, "name").unwrap().as_string().unwrap(),
                Utf16::from("TypeError")
            );
            continue;
        }
        let result = actual.unwrap();
        let expected = get(case, "result").unwrap();
        assert_eq!(
            result.valid,
            get(expected, "valid") == Some(&Value::Bool(true))
        );
        assert_eq!(
            result.complete,
            get(expected, "complete") == Some(&Value::Bool(true))
        );
        let Value::Array(expected_diagnostics) = get(expected, "diagnostics").unwrap() else {
            panic!("diagnostics array")
        };
        assert_eq!(
            result.diagnostics.len(),
            expected_diagnostics.len(),
            "case {:?}",
            get(case, "id")
        );
        for (actual, expected) in result.diagnostics.iter().zip(expected_diagnostics) {
            assert_eq!(
                actual.code,
                *get(expected, "code").unwrap().as_string().unwrap()
            );
            assert_eq!(
                actual.path,
                *get(expected, "path").unwrap().as_string().unwrap()
            );
            assert_eq!(
                actual.message,
                *get(expected, "message").unwrap().as_string().unwrap()
            );
        }
    }
}

#[test]
fn identity_copy_limit_remains_an_operation_error() {
    let frozen = parse(include_str!("../../../docs/helix/04-build/evidence/rust-migration/r5-field-value/frozen-typescript.json"));
    let Value::Array(cases) = get(&frozen, "cases").unwrap() else {
        panic!("cases")
    };
    let first = &cases[0];
    let mut context = Context::with_limits(
        ResourceProfile::Cooperative,
        Limits {
            max_values: 2,
            ..Limits::ordinary()
        },
    )
    .unwrap();
    let error = engine()
        .validate_core_field_value_public(
            get(first, "source").unwrap_or(get(&frozen, "source").unwrap()),
            get(first, "identity").unwrap(),
            get(first, "value").unwrap(),
            &mut context,
        )
        .unwrap_err();
    assert_eq!(error.code, "LIMIT");
}

trait AsString {
    fn as_string(&self) -> Option<&Utf16>;
}
impl AsString for Value {
    fn as_string(&self) -> Option<&Utf16> {
        if let Value::String(value) = self {
            Some(value)
        } else {
            None
        }
    }
}
