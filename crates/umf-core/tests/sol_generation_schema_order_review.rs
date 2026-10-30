// SPDX-License-Identifier: MIT OR Apache-2.0
//! Independently captured source numeric-own-key diagnostic order.
use umf_core::schema::{CompiledSchema, SchemaResources};
use umf_core::{Context, Utf16, Value};
fn parse(text: &str) -> Value {
    umf_core::serialization::read_json_value(
        &text.encode_utf16().collect::<Vec<_>>(),
        umf_core::serialization::Format::Json,
        &mut Context::ordinary(),
    )
    .unwrap()
}
fn get<'a>(v: &'a Value, k: &str) -> &'a Value {
    let Value::Object(items) = v else {
        panic!("object")
    };
    &items
        .iter()
        .find(|(key, _)| key == &Utf16::from(k))
        .unwrap()
        .1
}
fn text(v: &Value) -> String {
    let Value::String(s) = v else {
        panic!("string")
    };
    s.to_utf8().unwrap()
}
#[test]
fn compiler_diagnostic_order_matches_numeric_schema_and_instance_own_keys() {
    let root=parse(include_str!("../../../tests/rust-core/fixtures/r3/sol-generation-schema-order-review/source.json"));
    let Value::Array(cases) = get(&root, "cases") else {
        panic!("cases")
    };
    for case in cases {
        let schema = CompiledSchema::compile(
            &parse(&text(get(case, "schemaText"))),
            &SchemaResources::default(),
            &mut Context::ordinary(),
        )
        .unwrap();
        let actual = schema
            .validate_codegen_errors(&parse(&text(get(case, "text"))), &mut Context::ordinary())
            .unwrap();
        let Value::Array(errors) = get(case, "errors") else {
            panic!("errors")
        };
        let expected = errors
            .iter()
            .map(|error| {
                (
                    text(get(error, "keyword")),
                    text(get(error, "schemaPath")),
                    text(get(error, "instancePath")),
                )
            })
            .collect::<Vec<_>>();
        for (actual, expected) in actual.iter().zip(errors) {
            assert_eq!(
                &actual.params,
                get(expected, "params"),
                "params: {}",
                text(get(case, "id"))
            );
            let property = if let Value::Object(members) = expected {
                members
                    .iter()
                    .find(|(key, _)| key == &Utf16::from("propertyName"))
                    .map(|(_, value)| value)
            } else {
                None
            };
            assert_eq!(
                actual
                    .compiler_property_name
                    .as_ref()
                    .map(|value| Value::String(value.clone())),
                property.cloned(),
                "propertyName: {}",
                text(get(case, "id"))
            );
            assert_eq!(
                actual.message,
                Utf16::from(text(get(expected, "message"))),
                "message: {}",
                text(get(case, "id"))
            );
        }
        let actual = actual
            .iter()
            .map(|error| {
                (
                    error.keyword.clone(),
                    error.schema_path.to_utf8().unwrap(),
                    error.instance_path.to_utf8().unwrap(),
                )
            })
            .collect::<Vec<_>>();
        assert_eq!(actual, expected, "{}", text(get(case, "id")));
    }
}
