use umf_core::{
    context::Context,
    engine::{Engine, ResourceSet},
    serialization::{read_json_value, Format},
    value::{Utf16, Value},
};
fn parse(s: &str) -> Value {
    read_json_value(
        &s.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        &mut Context::ordinary(),
    )
    .unwrap()
}
fn get<'a>(v: &'a Value, n: &str) -> Option<&'a Value> {
    match v {
        Value::Object(m) => m.iter().find(|(k, _)| k == &Utf16::from(n)).map(|(_, v)| v),
        _ => None,
    }
}
fn string(v: Option<&Value>) -> Option<&Utf16> {
    match v {
        Some(Value::String(s)) => Some(s),
        _ => None,
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
fn frozen_typescript_vectors_match_rust_operation_and_error_order() {
    let packet=parse(include_str!("../../../tests/rust-core/fixtures/r5-record-values/frozen-typescript.json"));
    let Value::Array(cases) = get(&packet, "cases").unwrap() else {
        panic!("cases")
    };
    let engine = engine();
    for case in cases {
        let id = string(get(case, "id")).unwrap().to_utf8().unwrap();
        let actual = umf_core::record_values::validate_core_record_values(
            &engine,
            get(case, "source").unwrap(),
            get(case, "identity").unwrap(),
            get(case, "values").unwrap(),
            &mut Context::ordinary(),
        );
        if let Some(expected) = get(case, "thrown") {
            let error = actual.unwrap_err();
            assert_eq!(error.path, *string(get(expected, "path")).unwrap(), "{id}");
            assert_eq!(
                error.code,
                string(get(expected, "code")).unwrap().to_utf8().unwrap(),
                "{id}"
            );
            assert_eq!(
                error.message.to_utf8().unwrap(),
                string(get(expected, "message")).unwrap().to_utf8().unwrap(),
                "{id}"
            );
        } else {
            assert_eq!(actual.unwrap(), *get(case, "result").unwrap(), "{id}");
        }
    }
    let large = get(&packet, "largeCase").unwrap();
    let count = match get(large, "count").unwrap() {
        Value::Number(n) => *n as usize,
        _ => panic!("count"),
    };
    let source = parse(include_str!(
        "../../../fixtures/core/record-values-current.umf.json"
    ));
    let identity = parse(r#"{"module":"fixture","element":"item"}"#);
    let absent = parse(r#"{"field":{"module":"fixture","element":"label"},"state":"absent"}"#);
    let values = Value::Array(vec![absent; count]);
    let error = umf_core::record_values::validate_core_record_values(
        &engine,
        &source,
        &identity,
        &values,
        &mut Context::ordinary(),
    )
    .unwrap_err();
    let expected = get(large, "expectedError").unwrap();
    assert_eq!(
        error.code,
        string(get(expected, "code")).unwrap().to_utf8().unwrap()
    );
    assert_eq!(error.path, string(get(expected, "path")).unwrap().clone());
    assert_eq!(
        error.message,
        string(get(expected, "message")).unwrap().clone()
    );

    let deep = get(&packet, "depthCase").unwrap();
    let depth = match get(deep, "depth").unwrap() {
        Value::Number(n) => *n as usize,
        _ => panic!("depth"),
    };
    let mut nested = Value::Null;
    for _ in 0..depth {
        nested = Value::Object(vec![(Utf16::from("x"), nested)]);
    }
    let mut deep_source = source.clone();
    let Value::Object(ref mut fields) = deep_source else {
        panic!("source object")
    };
    fields.push((Utf16::from("x-deep"), nested));
    let good_values = parse(
        r#"[{"field":{"module":"fixture","element":"label"},"state":"present","value":{"string":"x"}}]"#,
    );
    let error = umf_core::record_values::validate_core_record_values(
        &engine,
        &deep_source,
        &identity,
        &good_values,
        &mut Context::ordinary(),
    )
    .unwrap_err();
    let expected = get(deep, "expectedError").unwrap();
    assert_eq!(
        error.code,
        string(get(expected, "code")).unwrap().to_utf8().unwrap()
    );
    assert_eq!(error.path, string(get(expected, "path")).unwrap().clone());
    assert_eq!(
        error.message,
        string(get(expected, "message")).unwrap().clone()
    );
}

#[test]
fn admitted_snapshot_path_uses_same_semantics_without_recopying_host_values() {
    let engine = engine();
    let source = parse(include_str!(
        "../../../fixtures/core/record-values-current.umf.json"
    ));
    let identity = parse(r#"{"module":"fixture","element":"item"}"#);
    let values = parse(
        r#"[{"field":{"module":"fixture","element":"label"},"state":"present","value":{"string":"x"}}]"#,
    );
    let expected = umf_core::record_values::validate_core_record_values(
        &engine,
        &source,
        &identity,
        &values,
        &mut Context::ordinary(),
    )
    .unwrap();
    let actual = umf_core::record_values::validate_core_record_values_admitted(
        &engine,
        source,
        identity,
        values,
        &mut Context::ordinary(),
    )
    .unwrap();
    assert_eq!(actual, expected);
}
