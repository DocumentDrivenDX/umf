// SPDX-License-Identifier: MIT OR Apache-2.0
//! One-process production-dispatch replay of the complete frozen TS packet.
use std::{fs, path::PathBuf};
use umf_core::{
    serialization::{self, Format},
    Context, Utf16, Value,
};
use umf_core_wire::{
    avro_cardinality_binding::{execute_wire, PROFILE},
    decode, encode,
};

fn member<'a>(value: &'a Value, key: &str) -> &'a Value {
    let Value::Object(fields) = value else {
        panic!("Expected object")
    };
    &fields
        .iter()
        .find(|(name, _)| name == &Utf16::from(key))
        .unwrap()
        .1
}
fn optional<'a>(value: &'a Value, key: &str) -> Option<&'a Value> {
    let Value::Object(fields) = value else {
        return None;
    };
    fields
        .iter()
        .find(|(name, _)| name == &Utf16::from(key))
        .map(|(_, value)| value)
}
fn text(value: &Value) -> String {
    let Value::String(text) = value else {
        panic!("Expected string")
    };
    text.to_utf8().unwrap()
}
fn fields(value: &Value) -> Vec<(Utf16, Value)> {
    let Value::Object(fields) = value else {
        panic!("Expected object")
    };
    fields.clone()
}
fn packet(name: &str) -> Value {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join(
            "../../docs/helix/04-build/evidence/rust-migration/r9-avro-cardinality-classification",
        )
        .join(name);
    let text = fs::read_to_string(path).unwrap();
    serialization::read_json_value(
        &text.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        &mut Context::catalog(),
    )
    .unwrap()
}
fn object(items: &[(&str, Value)]) -> Value {
    Value::Object(
        items
            .iter()
            .map(|(k, v)| (Utf16::from(*k), v.clone()))
            .collect(),
    )
}
fn difference(actual: &Value, expected: &Value, path: &str) -> Option<String> {
    match (actual, expected) {
        (Value::Object(left), Value::Object(right)) => {
            let left_keys: Vec<_> = left.iter().map(|(key, _)| key).collect();
            let right_keys: Vec<_> = right.iter().map(|(key, _)| key).collect();
            if left_keys != right_keys {
                return Some(format!(
                    "{path}: object key order {left_keys:?} != {right_keys:?}"
                ));
            }
            left.iter()
                .zip(right)
                .find_map(|((key, left), (_, right))| {
                    difference(left, right, &format!("{path}/{key:?}"))
                })
        }
        (Value::Array(left), Value::Array(right)) => {
            if left.len() != right.len() {
                return Some(format!(
                    "{path}: array length {} != {}",
                    left.len(),
                    right.len()
                ));
            }
            left.iter()
                .zip(right)
                .enumerate()
                .find_map(|(i, (left, right))| difference(left, right, &format!("{path}/{i}")))
        }
        _ if actual == expected => None,
        _ => Some(format!("{path}: scalar value/type differs")),
    }
}
fn check(id: &str, op: &str, args: &Value, expected: Option<&Value>, error: Option<&Value>) {
    let mut request = vec![
        (Utf16::from("profile"), Value::string_utf8(PROFILE)),
        (Utf16::from("op"), Value::string_utf8(op)),
    ];
    request.extend(fields(args));
    let wire = encode(&Value::Object(request), &mut Context::ordinary()).unwrap();
    let envelope: serde_json::Value = serde_json::from_str(&execute_wire(&wire)).unwrap();
    if let Some(error) = error {
        assert_eq!(envelope["status"], "error", "{id}");
        assert_eq!(envelope["code"], text(member(error, "code")), "{id}");
        for (out, key) in [("pathUnits", "path"), ("messageUnits", "message")] {
            let Value::String(expected) = member(error, key) else {
                panic!("Expected error text")
            };
            let actual: Vec<u16> = serde_json::from_value(envelope[out].clone()).unwrap();
            assert_eq!(actual, expected.units(), "{id}: {key}");
        }
    } else {
        assert_eq!(envelope["status"], "ok", "{id}: {envelope}");
        let actual = decode(envelope["wire"].as_str().unwrap(), &mut Context::ordinary()).unwrap();
        // Value equality also checks object member order and exact UTF-16.
        if let Some(path) = difference(&actual, expected.unwrap(), "") {
            panic!("{id}: {path}");
        }
    }
}
#[test]
fn complete_frozen_cardinality_corpus_uses_production_dispatch_once_per_process() {
    let frozen = packet("typescript-predecessor.json");
    let rows = fields(member(&frozen, "outcomes"));
    assert_eq!(rows.len(), 80);
    for (id, row) in rows {
        let args = object(&[
            ("source", member(&row, "source").clone()),
            ("request", member(&row, "request").clone()),
        ]);
        check(
            &id.to_utf8().unwrap(),
            "classifyAvroCardinality",
            &args,
            Some(member(&row, "result")),
            None,
        );
    }
    let extra = packet("typescript-extra.json");
    let Value::Array(rows) = member(&extra, "cases") else {
        panic!("Expected cases")
    };
    assert_eq!(rows.len(), 51);
    let mut checked = 0;
    for row in rows {
        let id = text(member(row, "id"));
        // This predecessor host input contains undefined, which JSON cannot
        // retain. Its explicit missing-property wire counterpart is included.
        if id == "missing-column" {
            continue;
        }
        check(
            &id,
            &text(member(row, "op")),
            member(row, "args"),
            optional(row, "result"),
            optional(row, "error"),
        );
        checked += 1;
    }
    assert_eq!(checked, 50);
    let adversarial = packet("typescript-type-order-utf16.json");
    let Value::Array(rows) = member(&adversarial, "cases") else {
        panic!("Expected cases")
    };
    assert_eq!(rows.len(), 3);
    for row in rows {
        let id = text(member(row, "id"));
        let args = member(row, "args");
        let receipt = member(row, "result");
        check(&id, "classifyAvroCardinality", args, Some(receipt), None);
        let follow = object(&[
            ("receipt", receipt.clone()),
            ("current", member(receipt, "target").clone()),
        ]);
        check(
            &format!("{id}/verify"),
            "verifyAvroCardinalityClassification",
            &follow,
            Some(receipt),
            None,
        );
        let request = member(args, "request");
        let recovered = object(&[
            ("schema", member(request, "nativeSource").clone()),
            ("dependencies", member(request, "dependencies").clone()),
        ]);
        check(
            &format!("{id}/recover"),
            "recoverAvroCardinalityBundle",
            &follow,
            Some(&recovered),
            None,
        );
    }
}
