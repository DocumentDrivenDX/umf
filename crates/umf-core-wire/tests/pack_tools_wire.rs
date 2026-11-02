// SPDX-License-Identifier: MIT OR Apache-2.0
#![cfg(all(feature = "codegen", feature = "embedded-adapters"))]

use serde_json::{json, Value as Json};
use umf_core::{serialization::{self, Format}, Context, EngineError, Utf16, Value};
use umf_core_wire::{decode, encode, native_family_binding};

fn value(json: Json) -> Value {
    let text = json.to_string();
    serialization::read_json_value(&text.encode_utf16().collect::<Vec<_>>(), Format::Json, &mut Context::ordinary()).unwrap()
}

fn envelope(profile: &str, operation: &str) -> Value {
    let pack = json!({"id":"wire-mini","version":"1.0.0","domain_types":{"identifier":{}},"schemas":[{"id":"things","reference":"things.json","format":"tablespec"}]}).to_string();
    let table = json!({"version":"1.0","table_name":"things","columns":[{"name":"id","data_type":"INTEGER","nullable":false}],"primary_key":["id"]}).to_string();
    value(json!({
        "profile": profile,
        "op": operation,
        "request": {
            "profile":"umf.pack-tools/1",
            "pack":{"id":"wire-mini","version":"1.0.0","text":pack},
            "sources":[{"id":"things","path":"things.json","format":"json","schemaFormat":"tablespec","text":table}],
            "options":{"schema":"wire_example","package":"wire_example"},
            "targets":["ddl"]
        }
    }))
}

fn wire(value: &Value) -> String {
    encode(value, &mut Context::ordinary()).unwrap()
}

fn response(wire: &str) -> Json {
    serde_json::from_str(&native_family_binding::execute_wire("pack-tools", wire)).unwrap()
}

#[test]
fn pack_tools_wire_generates_minimal_source_bound_artifacts() {
    let result = response(&wire(&envelope("umf.pack-tools-wire/1", "pack-tools.generatePackTools")));
    assert_eq!(result["status"], "ok", "{result}");
    let output = decode(result["wire"].as_str().unwrap(), &mut Context::ordinary()).unwrap();
    let output: Json = serde_json::from_str(&serialization::write_json_value(&output, Format::Json, &mut Context::ordinary()).unwrap().to_utf8().unwrap()).unwrap();
    assert_eq!(output["profile"], "umf.pack-tools-result/1");
    assert_eq!(output["status"], "generated");
    assert_eq!(output["pack"]["id"], "wire-mini");
    let files = output["files"].as_array().unwrap();
    let ddl = files.iter().find(|file| file["path"] == "schema.sql").unwrap();
    assert!(ddl["text"].as_str().unwrap().contains("CREATE TABLE \"wire_example\".\"things\""));
    let source = files.iter().find(|file| file["path"] == "source-companion.json").unwrap();
    let source: Json = serde_json::from_str(source["text"].as_str().unwrap()).unwrap();
    assert_eq!(source["sources"][0]["id"], "things");
    assert_eq!(output["coverage"].as_array().unwrap().len(), 1);
}

#[test]
fn pack_tools_wire_rejects_wrong_profile_and_operation_without_outputs() {
    for (profile, operation) in [
        ("umf.pack-tools-wire/2", "pack-tools.generatePackTools"),
        ("umf.pack-tools-wire/1", "pack-tools.executeSql"),
    ] {
        let result = response(&wire(&envelope(profile, operation)));
        assert_eq!(result["status"], "error", "{result}");
        assert_eq!(result["code"], "REQUEST");
        assert!(result.get("wire").is_none());
    }
}

#[test]
fn pack_tools_wire_rejects_duplicate_envelope_member() {
    // Corrupt the tagged member sequence rather than asking the safe encoder
    // to construct a duplicate-key core Value.
    let encoded = wire(&envelope("umf.pack-tools-wire/1", "pack-tools.generatePackTools"));
    let mut tagged: Json = serde_json::from_str(&encoded).unwrap();
    let members = tagged["members"].as_array_mut().unwrap();
    members.push(members[0].clone());
    let result = response(&tagged.to_string());
    assert_eq!(result["status"], "error", "{result}");
    assert_eq!(result["code"], "DUPLICATE_KEY");
    assert!(result.get("wire").is_none());
}

#[test]
fn pack_tools_wire_preserves_host_control_refusal() {
    let encoded = wire(&envelope("umf.pack-tools-wire/1", "pack-tools.generatePackTools"));
    let mut calls = 0;
    let mut control = |_: usize| {
        calls += 1;
        Err(EngineError::new("CANCELLED", Utf16::from("/host"), "caller cancelled pack generation"))
    };
    let result: Json = serde_json::from_str(&native_family_binding::execute_wire_with_control("pack-tools", &encoded, &mut control)).unwrap();
    assert!(calls > 0);
    assert_eq!(result["status"], "error", "{result}");
    assert_eq!(result["code"], "CANCELLED");
    assert_eq!(result["pathUnits"], json!("/host".encode_utf16().collect::<Vec<_>>()));
    assert!(result.get("wire").is_none());
}
