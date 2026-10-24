#![cfg(feature = "embedded-adapters")]
use umf_core::{Context, Utf16, Value};
use umf_core_wire::{decode, encode, execute_json_schema_wire, JSON_SCHEMA_PROFILE};

fn text(value: &str) -> Value { Value::String(Utf16::from(value)) }
fn object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(fields.into_iter().map(|(key, value)| (Utf16::from(key), value)).collect())
}
fn request(op: &str, fields: Vec<(&str, Value)>) -> String {
    let mut all = vec![("profile", text(JSON_SCHEMA_PROFILE)), ("op", text(op))];
    all.extend(fields);
    encode(&object(all), &mut Context::ordinary()).unwrap()
}
fn result_wire(response: &str) -> String {
    let envelope: serde_json::Value = serde_json::from_str(response).unwrap();
    assert_eq!(envelope["profile"], "umf.core-wire/1");
    assert_eq!(envelope["status"], "ok", "{response}");
    envelope["wire"].as_str().unwrap().to_owned()
}

#[test]
fn json_schema_dispatcher_covers_seven_closed_operations() {
    let imported = execute_json_schema_wire(&request("importJsonSchema", vec![
        ("source", text(r#"{"type":"object","properties":{"x":{"type":"string"}}}"#)),
        ("id", text("urn:umf:r5:wire")),
        ("baseUri", text("https://example.test/schema")),
        ("resources", Value::Array(Vec::new())),
    ]));
    let document = decode(&result_wire(&imported), &mut Context::ordinary()).unwrap();
    let document = encode(&document, &mut Context::ordinary()).unwrap();
    let operations = [
        ("inspectJsonSchema", vec![]),
        ("exportJsonSchema", vec![]),
        ("exportJsonSchemaResources", vec![]),
        ("exportJsonSchemaBundle", vec![]),
        ("getJsonSchemaNode", vec![("pointer", text("/properties/x"))]),
        ("walkJsonSchema", vec![]),
    ];
    for (op, extra) in operations {
        let document = decode(&document, &mut Context::ordinary()).unwrap();
        let mut fields = vec![("document", document)];
        fields.extend(extra);
        result_wire(&execute_json_schema_wire(&request(op, fields)));
    }
}

#[test]
fn json_schema_dispatcher_rejects_unknown_operation_and_profile() {
    let unknown = execute_json_schema_wire(&request("parseNativeJson", vec![]));
    let envelope: serde_json::Value = serde_json::from_str(&unknown).unwrap();
    assert_eq!(envelope["status"], "error");
    let wrong_profile = encode(&object(vec![("profile", text("wrong")), ("op", text("walkJsonSchema"))]), &mut Context::ordinary()).unwrap();
    let envelope: serde_json::Value = serde_json::from_str(&execute_json_schema_wire(&wrong_profile)).unwrap();
    assert_eq!(envelope["status"], "error");
    assert_eq!(envelope["code"], "REQUEST");
}
