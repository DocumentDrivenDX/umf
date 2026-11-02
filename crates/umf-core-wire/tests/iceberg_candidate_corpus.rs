#![cfg(feature = "embedded-adapters")]
// SPDX-License-Identifier: MIT OR Apache-2.0
//! Full-outcome Iceberg predecessor corpus. The packet is frozen by
//! `tests/rust-core/iceberg-parity-freeze.ts` and compares public result trees,
//! native text, diagnostics, and exact refusal envelopes for all five ops.

use std::path::PathBuf;

use serde_json::Value as Json;
use umf_core::{Context, Utf16, Value};

fn object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(name, value)| (Utf16::from(name), value))
            .collect(),
    )
}

fn request(operation: &str, extra_fields: Vec<(&str, Value)>) -> String {
    let mut fields = vec![("op", Value::string_utf8(operation))];
    fields.extend(extra_fields);
    umf_core_wire::encode(&object(fields), &mut Context::ordinary()).unwrap()
}

fn execute(operation: &str, fields: Vec<(&str, Value)>) -> Json {
    let wire = request(operation, fields);
    serde_json::from_str(&umf_core_wire::execute_iceberg_wire(&wire)).unwrap()
}

fn decode_ok(response: &Json) -> Result<Value, String> {
    if response["status"] != "ok" {
        return Err(format!("returned status {}", response["status"]));
    }
    let Some(wire) = response["wire"].as_str() else {
        return Err("success envelope has no wire string".into());
    };
    umf_core_wire::decode(wire, &mut Context::ordinary()).map_err(|error| {
        format!("wire decode failed with {} at {}", error.code, short_utf16(&error.path.units()))
    })
}

fn compare_outcome(expected: &Json, response: &Json, label: &str) -> Option<String> {
    match expected["status"].as_str().expect("frozen status") {
        "ok" => {
            let actual = match decode_ok(response) {
                Ok(actual) => actual,
                Err(summary) => return Some(format!("{label}: {summary}")),
            };
            let expected_wire = expected["wire"].to_string();
            let expected_value = match umf_core_wire::decode(&expected_wire, &mut Context::ordinary()) {
                Ok(expected) => expected,
                Err(error) => {
                    return Some(format!(
                        "{label}: frozen wire is invalid ({})",
                        error.code
                    ));
                }
            };
            if actual == expected_value {
                None
            } else {
                Some(format!(
                    "{label}: value mismatch (actual {}, expected {})",
                    brief(&actual),
                    brief(&expected_value)
                ))
            }
        }
        "error" => {
            if response["status"] != "error" {
                return Some(format!("{label}: expected error, got status {}", response["status"]));
            }
            let expected_code = &expected["code"];
            if &response["code"] != expected_code {
                return Some(format!(
                    "{label}: code mismatch (actual {}, expected {})",
                    response["code"], expected_code
                ));
            }
            let expected_message = expected["message"].as_str().unwrap_or("");
            let expected_path = expected["path"].as_str().unwrap_or("");
            if utf16_field(response, "messageUnits") != expected_message.encode_utf16().collect::<Vec<_>>() {
                return Some(format!(
                    "{label}: message mismatch (actual {}, expected {})",
                    short_units(&response["messageUnits"]),
                    short_text(expected_message)
                ));
            }
            if utf16_field(response, "pathUnits") != expected_path.encode_utf16().collect::<Vec<_>>() {
                return Some(format!(
                    "{label}: path mismatch (actual {}, expected {})",
                    short_units(&response["pathUnits"]),
                    short_text(expected_path)
                ));
            }
            None
        }
        other => Some(format!("{label}: unknown frozen status {other}")),
    }
}

fn utf16_field(value: &Json, name: &str) -> Vec<u16> {
    value[name]
        .as_array()
        .expect("UTF-16 units")
        .iter()
        .map(|unit| unit.as_u64().expect("unit") as u16)
        .collect()
}

fn brief(value: &Value) -> String {
    match value {
        Value::Null => "null".into(),
        Value::Bool(_) => "boolean".into(),
        Value::Number(_) => "number".into(),
        Value::String(value) => format!("string({} UTF-16 units)", value.len()),
        Value::Array(values) => format!("array({} items)", values.len()),
        Value::Object(fields) => format!("object({} members)", fields.len()),
    }
}

fn short_text(value: &str) -> String {
    let mut chars = value.chars();
    let prefix = chars.by_ref().take(96).collect::<String>();
    if chars.next().is_some() {
        format!("{prefix}…")
    } else {
        prefix
    }
}

fn short_utf16(value: &[u16]) -> String {
    String::from_utf16_lossy(value)
        .chars()
        .take(96)
        .collect::<String>()
}

fn short_units(value: &Json) -> String {
    let units = value.as_array().map(Vec::as_slice).unwrap_or(&[]);
    let prefix = units
        .iter()
        .take(20)
        .filter_map(Json::as_u64)
        .map(|unit| unit as u16)
        .collect::<Vec<_>>();
    format!("{} units {:?}", units.len(), String::from_utf16_lossy(&prefix))
}

fn text(value: &str) -> Value {
    Value::String(Utf16::from(value))
}

fn fixture_source(root: &PathBuf, case: &Json) -> String {
    if let Some(source) = case["source"].as_str() {
        return source.to_owned();
    }
    std::fs::read_to_string(root.join(case["path"].as_str().unwrap())).unwrap()
}

#[test]
fn iceberg_wire_matches_frozen_full_outcomes_for_five_public_operations() {
    let frozen: Json = serde_json::from_str(include_str!(
        "../../../tests/rust-core/iceberg-parity-freeze.json"
    ))
    .unwrap();
    assert_eq!(
        frozen["profile"],
        umf_core_wire::ICEBERG_SCHEMA_PROFILE
    );
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    let mut mismatches = Vec::new();

    for case in frozen["cases"].as_array().unwrap() {
        let id = case["id"].as_str().unwrap();
        let source = fixture_source(&root, case);
        let expected = &case["operations"]["import"];
        let response = execute(
            "iceberg.schema.import",
            vec![("source", text(&source)), ("id", text(id))],
        );
        if let Some(mismatch) = compare_outcome(expected, &response, &format!("{id}.import")) {
            mismatches.push(mismatch);
        }
        if expected["status"] != "ok" {
            continue;
        }
        let document = match decode_ok(&response) {
            Ok(document) => document,
            Err(summary) => {
                mismatches.push(format!("{id}.import: {summary}"));
                continue;
            }
        };

        let inspect = execute(
            "iceberg.schema.inspect",
            vec![("document", document.clone())],
        );
        if let Some(mismatch) = compare_outcome(
            &case["operations"]["inspect"],
            &inspect,
            &format!("{id}.inspect"),
        ) { mismatches.push(mismatch); }
        let export = execute(
            "iceberg.schema.export",
            vec![("document", document.clone())],
        );
        if let Some(mismatch) = compare_outcome(
            &case["operations"]["export"],
            &export,
            &format!("{id}.export"),
        ) { mismatches.push(mismatch); }
        let get_path = match id {
            "nested" => text("/fields/1/type/fields/0/name"),
            "exact-defaults" => text("/fields/0/initial-default"),
            "future-object" => text("/fields/0/type/shape"),
            "zero-id" => text("/fields/0/id"),
            "utf16-unknown" => {
                let mut units = "/future-".encode_utf16().collect::<Vec<_>>();
                units.push(0xd800);
                units.extend("/value".encode_utf16());
                Value::String(Utf16::new(units))
            }
            _ => unreachable!("valid frozen case id"),
        };
        let get = execute(
            "iceberg.schema.getNode",
            vec![("document", document.clone()), ("pointer", get_path)],
        );
        if let Some(mismatch) = compare_outcome(&case["operations"]["get"], &get, &format!("{id}.get")) { mismatches.push(mismatch); }
        let missing = execute(
            "iceberg.schema.getNode",
            vec![
                ("document", document.clone()),
                ("pointer", text("/not-present")),
            ],
        );
        if let Some(mismatch) = compare_outcome(
            &case["operations"]["getMissing"],
            &missing,
            &format!("{id}.getMissing"),
        ) { mismatches.push(mismatch); }
        let edit = execute(
            "iceberg.schema.proposeNodeEdit",
            vec![
                ("document", document.clone()),
                ("pointer", text("/fields/0/name")),
                ("replacement", text("\"edited\"")),
            ],
        );
        if let Some(mismatch) = compare_outcome(&case["operations"]["edit"], &edit, &format!("{id}.edit")) { mismatches.push(mismatch); }
        let bad_pointer = execute(
            "iceberg.schema.proposeNodeEdit",
            vec![
                ("document", document.clone()),
                ("pointer", text("/bad~2pointer")),
                ("replacement", text("{")),
            ],
        );
        if let Some(mismatch) = compare_outcome(
            &case["operations"]["editBadPointerBeforeSource"],
            &bad_pointer,
            &format!("{id}.editBadPointerBeforeSource"),
        ) { mismatches.push(mismatch); }
        let invalid_replacement = execute(
            "iceberg.schema.proposeNodeEdit",
            vec![
                ("document", document.clone()),
                ("pointer", text("/fields/0/name")),
                ("replacement", text("{")),
            ],
        );
        if let Some(mismatch) = compare_outcome(
            &case["operations"]["editInvalidReplacement"],
            &invalid_replacement,
            &format!("{id}.editInvalidReplacement"),
        ) { mismatches.push(mismatch); }
        let after = execute(
            "iceberg.schema.export",
            vec![("document", document)],
        );
        if let Some(mismatch) = compare_outcome(
            &case["operations"]["exportAfterEditProposal"],
            &after,
            &format!("{id}.exportAfterEditProposal"),
        ) { mismatches.push(mismatch); }
    }
    assert!(
        mismatches.is_empty(),
        "Iceberg parity mismatches ({}):\n{}",
        mismatches.len(),
        mismatches.iter().take(30).cloned().collect::<Vec<_>>().join("\n")
    );
}
