// SPDX-License-Identifier: MIT OR Apache-2.0
#![cfg(feature = "embedded-adapters")]
use serde_json::Value as Json;
use umf_core::{
    serialization::{read_json_value, Format},
    Context, Utf16, Value,
};
use umf_core_wire::{decode, encode, native_family_binding};

fn parse(input: &str) -> Value {
    read_json_value(
        &input.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        &mut Context::ordinary(),
    )
    .unwrap()
}
fn get<'a>(value: &'a Value, key: &str) -> Option<&'a Value> {
    match value {
        Value::Object(m) => m
            .iter()
            .find(|(k, _)| k == &Utf16::from(key))
            .map(|(_, v)| v),
        _ => None,
    }
}
fn call(op: &str, mut fields: Vec<(&str, Value)>) -> Json {
    let mut request = vec![
        (
            "profile",
            Value::string_utf8("umf.ddd-json-schema-projection-wire/1"),
        ),
        ("op", Value::string_utf8(op)),
    ];
    request.append(&mut fields);
    let wire = encode(
        &Value::Object(
            request
                .into_iter()
                .map(|(k, v)| (Utf16::from(k), v))
                .collect(),
        ),
        &mut Context::ordinary(),
    )
    .unwrap();
    serde_json::from_str(&native_family_binding::execute_wire(
        "ddd-json-schema-projection",
        &wire,
    ))
    .unwrap()
}
fn bindings(missing: bool) -> Value {
    let paths = [
        ("/sales/Order/fields/total", "embed"),
        ("/sales/Order/fields/lines", "embed"),
        ("/sales/Order/fields/shipping", "embed"),
        ("/sales/Order/fields/customer", "identity"),
        ("/sales/OrderLine/fields/price", "embed"),
    ];
    let relations = if missing {
        Vec::new()
    } else {
        paths
            .iter()
            .map(|(k, v)| (Utf16::from(*k), Value::string_utf8(*v)))
            .collect()
    };
    Value::Object(vec![
        (Utf16::from("id"), Value::string_utf8("order-document")),
        (
            Utf16::from("schemaId"),
            Value::string_utf8("https://example.test/order-document"),
        ),
        (
            Utf16::from("root"),
            Value::Object(vec![
                (Utf16::from("module"), Value::string_utf8("sales")),
                (Utf16::from("element"), Value::string_utf8("Order")),
            ]),
        ),
        (Utf16::from("closedObjects"), Value::Bool(true)),
        (Utf16::from("integer"), Value::string_utf8("json-integer")),
        (Utf16::from("decimal"), Value::string_utf8("decimal-string")),
        (Utf16::from("dateTime"), Value::string_utf8("string")),
        (Utf16::from("bytes"), Value::string_utf8("hex-string")),
        (Utf16::from("collection"), Value::string_utf8("array")),
        (Utf16::from("relations"), Value::Object(relations)),
        (
            Utf16::from("lossPolicy"),
            Value::string_utf8("allow-reported-loss"),
        ),
    ])
}

#[test]
fn ddd_projection_normal_and_missing_relation_refusal_are_rust_owned() {
    let document = parse(include_str!("../../../fixtures/ddd/sales.json"));
    let positive = call(
        "ddd-json-schema-projection.projectDddToJsonSchema",
        vec![
            ("document", document.clone()),
            ("bindings", bindings(false)),
        ],
    );
    assert_eq!(positive["status"], "ok");
    let projected = decode(positive["wire"].as_str().unwrap(), &mut Context::ordinary()).unwrap();
    assert_eq!(
        get(&projected, "status"),
        Some(&Value::string_utf8("projected"))
    );
    assert_eq!(get(&projected, "source"), Some(&document));
    let refused = call(
        "ddd-json-schema-projection.projectDddToJsonSchema",
        vec![("document", document), ("bindings", bindings(true))],
    );
    assert_eq!(refused["status"], "ok");
    let blocked = decode(refused["wire"].as_str().unwrap(), &mut Context::ordinary()).unwrap();
    assert_eq!(
        get(&blocked, "status"),
        Some(&Value::string_utf8("blocked"))
    );
}

#[test]
fn ddd_field_binding_routes_and_refuses_invalid_utf16() {
    let success = call(
        "ddd-json-schema-projection.dddFieldBinding",
        vec![
            ("module", Value::string_utf8("sales/~archive")),
            ("element", Value::string_utf8("Order/Item")),
            ("field", Value::string_utf8("a~b/c")),
        ],
    );
    assert_eq!(success["status"], "ok");
    let value = decode(success["wire"].as_str().unwrap(), &mut Context::ordinary()).unwrap();
    assert_eq!(
        value,
        Value::string_utf8("/sales~1~0archive/Order~1Item/fields/a~0b~1c")
    );
    let failure = call(
        "ddd-json-schema-projection.dddFieldBinding",
        vec![
            ("module", Value::String(Utf16::new(vec![0xd800]))),
            ("element", Value::string_utf8("Order")),
            ("field", Value::string_utf8("id")),
        ],
    );
    assert_eq!(failure["status"], "error");
    assert_eq!(failure["code"], "DDD_BINDINGS");
}

#[test]
fn ddd_inspection_and_projection_refuse_semantically_invalid_documents() {
    let valid = include_str!("../../../fixtures/ddd/sales.json");
    let invalid = valid.replacen(
        "\"fields\": [\n                  \"order_id\"\n                ],",
        "\"fields\": [\n                  \"missing\"\n                ],",
        1,
    );
    assert_ne!(
        invalid, valid,
        "invalid identity fixture mutation should apply"
    );
    let document = parse(valid);
    let inspected = call(
        "ddd-json-schema-projection.inspectDdd",
        vec![("document", document.clone())],
    );
    assert_eq!(inspected["status"], "ok");
    let report = decode(
        inspected["wire"].as_str().unwrap(),
        &mut Context::ordinary(),
    )
    .unwrap();
    assert_eq!(get(&report, "valid"), Some(&Value::Bool(true)));

    let invalid_document = parse(&invalid);
    let inspected = call(
        "ddd-json-schema-projection.inspectDdd",
        vec![("document", invalid_document.clone())],
    );
    let report = decode(
        inspected["wire"].as_str().unwrap(),
        &mut Context::ordinary(),
    )
    .unwrap();
    assert_eq!(get(&report, "valid"), Some(&Value::Bool(false)));
    let diagnostics = match get(&report, "diagnostics") {
        Some(Value::Array(v)) => v,
        _ => panic!("diagnostics"),
    };
    assert!(diagnostics
        .iter()
        .any(|item| get(item, "code") == Some(&Value::string_utf8("DDD_IDENTITY"))));

    let rejected = call(
        "ddd-json-schema-projection.projectDddToJsonSchema",
        vec![
            ("document", invalid_document),
            ("bindings", bindings(false)),
        ],
    );
    assert_eq!(rejected["status"], "error");
    assert_eq!(rejected["code"], "DDD_SOURCE");
}
