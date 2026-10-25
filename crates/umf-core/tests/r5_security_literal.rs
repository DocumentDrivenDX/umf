// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::{
    serialization::{read_json_value, Format},
    Context, Engine, EngineError, ResourceSet, Utf16, Value,
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

fn text(value: &Value) -> &Utf16 {
    match value {
        Value::String(value) => value,
        _ => panic!("expected text"),
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
fn direct_literal_check_matches_all_frozen_typescript_admission_cases() {
    let packet = parse(include_str!(
        "../../../docs/helix/04-build/evidence/rust-migration/r8-security-literal/predecessor.json"
    ));
    let Value::Array(cases) = get(&packet, "cases").unwrap() else {
        panic!("cases")
    };
    let operation = engine();
    for case in cases {
        let id = text(get(case, "id").unwrap()).to_utf8().unwrap();
        let result = operation.check_schema_literal_public(
            get(case, "document").unwrap(),
            get(case, "field").unwrap(),
            get(case, "value").unwrap(),
            &mut Context::ordinary(),
        );
        let expected = get(case, "outcome").unwrap();
        if get(expected, "accepted") == Some(&Value::Bool(true)) {
            assert!(result.is_ok(), "{id}: {result:?}");
        } else {
            let actual = result.unwrap_err();
            assert_eq!(
                actual.code,
                text(get(expected, "code").unwrap()).to_utf8().unwrap(),
                "{id}"
            );
            assert_eq!(actual.path, *text(get(expected, "path").unwrap()), "{id}");
            assert_eq!(
                actual.message,
                *text(get(expected, "message").unwrap()),
                "{id}"
            );
        }
    }
}

#[test]
fn literal_checker_obeys_caller_work_meter_before_materializing_result() {
    let packet = parse(include_str!(
        "../../../docs/helix/04-build/evidence/rust-migration/r8-security-literal/predecessor.json"
    ));
    let Value::Array(cases) = get(&packet, "cases").unwrap() else {
        panic!("cases")
    };
    let valid = cases
        .iter()
        .find(|case| get(case, "id") == Some(&Value::string_utf8("integer-max-i64")))
        .unwrap();
    let operation = engine();
    let mut charged = 0usize;
    let mut meter = |amount| {
        charged += amount;
        Err(EngineError::new(
            "TEST_LIMIT",
            Utf16::default(),
            "literal admission work refused",
        ))
    };
    let mut context = Context::ordinary().with_meter(&mut meter);
    let error: EngineError = operation
        .check_schema_literal_public(
            get(valid, "document").unwrap(),
            get(valid, "field").unwrap(),
            get(valid, "value").unwrap(),
            &mut context,
        )
        .unwrap_err();
    assert!(charged > 0);
    assert_eq!(error.code, "TEST_LIMIT");
    assert_eq!(error.message, Utf16::from("literal admission work refused"));
}
