// SPDX-License-Identifier: MIT OR Apache-2.0
//! Replays one compact predecessor packet through the production DBT wire.
use std::{fs, path::PathBuf};

use serde_json::Value as Json;
use umf_core::{Context, Utf16, Value};
use umf_core_wire::{
    dbt_binding::{execute_wire, PROFILE},
    decode,
};

fn packet() -> Json {
    let path = std::env::var_os("DBT_PARITY_PACKET")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("../../tests/rust-core/dbt-parity-freeze.json")
        });
    let path = if path.is_absolute() {
        path
    } else {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(path)
    };
    serde_json::from_str(&fs::read_to_string(path).expect("freeze predecessor outcomes first"))
        .expect("valid DBT predecessor packet")
}

fn difference(actual: &Value, expected: &Value, path: &str) -> Option<String> {
    match (actual, expected) {
        (Value::Object(left), Value::Object(right)) => {
            let lk: Vec<_> = left.iter().map(|(k, _)| k).collect();
            let rk: Vec<_> = right.iter().map(|(k, _)| k).collect();
            if lk != rk {
                return Some(format!("{path}: ordered keys {lk:?} != {rk:?}"));
            }
            left.iter()
                .zip(right)
                .find_map(|((k, l), (_, r))| difference(l, r, &format!("{path}/{k:?}")))
        }
        (Value::Array(left), Value::Array(right)) => {
            if left.len() != right.len() {
                return Some(format!("{path}: length {} != {}", left.len(), right.len()));
            }
            left.iter()
                .zip(right)
                .enumerate()
                .find_map(|(i, (l, r))| difference(l, r, &format!("{path}/{i}")))
        }
        _ if actual == expected => None,
        _ => {
            let summary = |value: &Value| match value {
                Value::String(text) if text.len() > 160 => {
                    format!("string of {} UTF-16 units", text.len())
                }
                value => format!("{value:?}"),
            };
            Some(format!(
                "{path}: {} != {}",
                summary(actual),
                summary(expected)
            ))
        }
    }
}

#[test]
fn production_wire_matches_complete_frozen_predecessor_outcomes() {
    let packet = packet();
    assert_eq!(packet["format"], "umf-r9-dbt-predecessor/1");
    assert_eq!(packet["profile"], PROFILE);
    let cases = packet["cases"].as_array().expect("case array");
    let labels = cases
        .iter()
        .map(|case| case["label"].as_str().expect("case label"))
        .collect::<Vec<_>>();
    for required in [
        "manifest.import",
        "manifest.export",
        "manifest.inspect",
        "manifest.get",
        "manifest.edit",
        "artifact.import",
        "artifact.export",
        "artifact.inspect",
        "artifact.get",
        "artifact.edit",
        "semantic.import",
        "semantic.export",
        "semantic.inspect",
        "semantic.get",
        "semantic.edit",
        "manifest.graph",
        "manifest.select.defaults",
        "manifest.graph.duplicate-malformed-priority",
        "selection.null-options",
        "selection.null-setting",
    ] {
        assert!(labels.contains(&required), "missing frozen case {required}");
    }

    for case in cases {
        let label = case["label"].as_str().expect("case label");
        let request_wire = case["requestWire"].as_str().expect("tagged request");
        let response: Json = serde_json::from_str(&execute_wire(request_wire))
            .unwrap_or_else(|error| panic!("{label}: invalid production envelope: {error}"));
        let expected = &case["expected"];
        match expected["status"].as_str() {
            Some("ok") => {
                assert_eq!(response["status"], "ok", "{label}: {response}");
                // Exact string comparison covers every returned value, UTF-16
                // unit, tagged field, and object-member order in the envelope.
                if response["wire"] != expected["wire"] {
                    let actual =
                        decode(response["wire"].as_str().unwrap(), &mut Context::catalog())
                            .unwrap();
                    let expected =
                        decode(expected["wire"].as_str().unwrap(), &mut Context::catalog())
                            .unwrap();
                    panic!(
                        "{label}: {}",
                        difference(&actual, &expected, "")
                            .unwrap_or_else(|| "wire encoding differs".into())
                    );
                }
            }
            Some("error") => {
                assert_eq!(response["status"], "error", "{label}: {response}");
                assert_eq!(response["code"], expected["code"], "{label}");
                assert_eq!(response["pathUnits"], expected["pathUnits"], "{label}");
                assert_eq!(
                    response["messageUnits"], expected["messageUnits"],
                    "{label}"
                );
            }
            other => panic!("{label}: invalid frozen status {other:?}"),
        }
    }
}
