// SPDX-License-Identifier: MIT OR Apache-2.0
//! Replays the complete predecessor packet through the production RDF wire.
use std::{fs, path::PathBuf};

use serde_json::Value as Json;
use umf_core::{Context, Value};
use umf_core_wire::{
    decode,
    rdf_binding::{execute_wire, PROFILE},
};

fn packet() -> Json {
    let path = std::env::var_os("RDF_PARITY_PACKET")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("../../tests/rust-core/rdf-parity-freeze.json")
        });
    let path = if path.is_absolute() {
        path
    } else {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(path)
    };
    serde_json::from_str(&fs::read_to_string(path).expect("freeze RDF predecessor outcomes first"))
        .expect("valid RDF predecessor packet")
}

fn difference(actual: &Value, expected: &Value, path: &str) -> Option<String> {
    match (actual, expected) {
        (Value::Object(left), Value::Object(right)) => {
            let left_keys: Vec<_> = left.iter().map(|(key, _)| key).collect();
            let right_keys: Vec<_> = right.iter().map(|(key, _)| key).collect();
            if left_keys != right_keys {
                return Some(format!(
                    "{path}: ordered keys {left_keys:?} != {right_keys:?}"
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
                return Some(format!("{path}: length {} != {}", left.len(), right.len()));
            }
            left.iter()
                .zip(right)
                .enumerate()
                .find_map(|(index, (left, right))| {
                    difference(left, right, &format!("{path}/{index}"))
                })
        }
        _ if actual == expected => None,
        _ => Some(format!("{path}: {actual:?} != {expected:?}")),
    }
}

#[test]
fn production_rdf_wire_matches_frozen_predecessor_outcomes() {
    let packet = packet();
    assert_eq!(packet["format"], "umf-r9-rdf-predecessor/1");
    assert_eq!(packet["profile"], PROFILE);
    let cases = packet["cases"].as_array().expect("case array");
    let labels = cases
        .iter()
        .map(|case| case["label"].as_str().expect("case label"))
        .collect::<Vec<_>>();
    for required in [
        "nquads.import",
        "nquads.inspect",
        "nquads.get",
        "nquads.export",
        "nquads.edit",
        "nquads.rename",
        "turtle.import-nested-list",
        "turtle.export",
        "trig.import-empty-graphs",
        "trig.named-graphs",
        "trig.export",
        "nquads.merge",
        "generalized.import",
        "generalized.inspect",
        "generalized.export",
        "generalized.get",
        "generalized.edit",
        "nquads.unknown-inspect",
        "nquads.unknown-export-refusal",
        "generalized.1e400.inspect",
        "generalized.1e400.export",
        "generalized.1e400.get-refusal",
        "generalized.unknown-inspect",
        "generalized.unknown-export-refusal",
    ] {
        assert!(
            labels.contains(&required),
            "missing frozen outcome {required}"
        );
    }

    for case in cases {
        let label = case["label"].as_str().expect("case label");
        let request = case["requestWire"].as_str().expect("tagged request");
        let response: Json = serde_json::from_str(&execute_wire(request))
            .unwrap_or_else(|error| panic!("{label}: malformed production response: {error}"));
        let expected = &case["expected"];
        match expected["status"].as_str() {
            Some("ok") => {
                assert_eq!(response["status"], "ok", "{label}: {response}");
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
