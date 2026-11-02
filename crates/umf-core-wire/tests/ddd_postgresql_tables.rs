// SPDX-License-Identifier: MIT OR Apache-2.0
#![cfg(feature = "embedded-adapters")]
use serde_json::Value as Json;
use umf_core::{
    serialization::{read_json_value, Format},
    Context, Utf16, Value,
};
use umf_core_wire::{decode, encode, native_family_binding};

fn parse(text: &str) -> Value {
    read_json_value(
        &text.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        &mut Context::ordinary(),
    )
    .unwrap()
}
fn member<'a>(value: &'a Value, key: &str) -> Option<&'a Value> {
    match value {
        Value::Object(rows) => rows
            .iter()
            .find(|(name, _)| name == &Utf16::from(key))
            .map(|(_, v)| v),
        _ => None,
    }
}
fn request(loss: &str) -> Json {
    let case = parse(include_str!(
        "../../../fixtures/projections/ddd-postgresql-tables/case.json"
    ));
    let fields = vec![
        (
            "profile",
            Value::string_utf8("umf.ddd-json-schema-projection-wire/1"),
        ),
        (
            "op",
            Value::string_utf8("ddd-json-schema-projection.prepareDddPostgresqlTables"),
        ),
        ("document", member(&case, "logical").unwrap().clone()),
        ("binding", member(&case, "binding").unwrap().clone()),
        ("tablePolicy", member(&case, "policy").unwrap().clone()),
        ("lossPolicy", Value::string_utf8(loss)),
    ];
    let wire = encode(
        &Value::Object(
            fields
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

#[test]
fn independent_postgresql_tables_prepare_and_strict_loss_refusal() {
    let positive = request("report");
    assert_eq!(positive["status"], "ok", "{positive:?}");
    let result = decode(positive["wire"].as_str().unwrap(), &mut Context::ordinary()).unwrap();
    assert_eq!(
        member(&result, "status"),
        Some(&Value::string_utf8("reported"))
    );
    let candidate = member(&result, "candidate").unwrap();
    assert!(
        matches!(candidate,Value::String(sql) if sql.to_utf8().unwrap().contains("CREATE TABLE"))
    );
    let refusal = request("strict");
    assert_eq!(refusal["status"], "ok", "{refusal:?}");
    let result = decode(refusal["wire"].as_str().unwrap(), &mut Context::ordinary()).unwrap();
    assert_eq!(
        member(&result, "status"),
        Some(&Value::string_utf8("blocked"))
    );
    assert!(member(&result, "candidate").is_none());
}
