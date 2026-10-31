// SPDX-License-Identifier: MIT OR Apache-2.0
//! Reuse the production dispatcher for the historical whole-result edit corpus.
use std::{fs, path::PathBuf};
use umf_core::{
    context::{Limits, ResourceProfile},
    serialization::{self, Format},
    Context, Utf16, Value,
};
use umf_core_wire::{decode, encode, parquet_capture_binding::execute_wire};

fn get<'a>(v: &'a Value, key: &str) -> &'a Value {
    let Value::Object(fields) = v else {
        panic!("Expected object");
    };
    &fields
        .iter()
        .find(|(k, _)| k == &Utf16::from(key))
        .unwrap()
        .1
}
fn rows(v: &Value) -> &[Value] {
    let Value::Array(rows) = v else {
        panic!("Expected rows");
    };
    rows
}
fn text(v: &Value) -> String {
    let Value::String(s) = v else {
        panic!("Expected text");
    };
    s.to_utf8().unwrap()
}
fn obj(fields: impl IntoIterator<Item = (&'static str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(k, v)| (Utf16::from(k), v))
            .collect(),
    )
}
fn txt(s: &str) -> Value {
    Value::string_utf8(s)
}
fn read(path: &str) -> Value {
    let source = fs::read_to_string(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../..")
            .join(path),
    )
    .unwrap();
    // Test fixture ingestion has an explicit bound; each production call below
    // retains its ordinary operation/transport limits.
    let mut limits = Limits::catalog();
    limits.max_text_units = 8_000_000;
    serialization::read_json_value(
        &source.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        &mut Context::with_limits(ResourceProfile::Cooperative, limits).unwrap(),
    )
    .unwrap()
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
fn append_entries(label: &str, additions: &Value) -> Value {
    match label {
        "append/error/empty" => Value::Array(vec![]),
        "append/error/duplicate" => {
            Value::Array(vec![obj([("key", txt("a"))]), obj([("key", txt("a"))])])
        }
        "append/error/surrogate" => Value::Array(vec![obj([
            ("key", txt("bad")),
            ("value", Value::String(Utf16::new(vec![0xd800]))),
        ])]),
        "append/error/unknown" => Value::Array(vec![obj([
            ("key", txt("unknown")),
            ("extra", Value::Bool(true)),
        ])]),
        "append/error/oversized" => Value::Array(vec![obj([
            ("key", txt("large")),
            ("value", txt(&"x".repeat(1_000_000))),
        ])]),
        _ => {
            assert!(!label.contains("/error/"), "unknown case {label}");
            additions.clone()
        }
    }
}
fn rename_args(label: &str, manifest: &Value) -> (Value, Value) {
    if let Some(tail) = label.strip_prefix("rename/error/") {
        return match tail {
            "0/4" => (Value::Number(0.0), txt("root")),
            "-1/3" => (Value::Number(-1.0), txt("bad")),
            "1000/3" => (Value::Number(1000.0), txt("bad")),
            "1/6" => (Value::Number(1.0), txt("detail")),
            "1/5" => (Value::Number(1.0), txt("order")),
            "1/0" => (Value::Number(1.0), txt("")),
            "1/1" => (Value::Number(1.0), Value::String(Utf16::new(vec![0xd800]))),
            "1/100001" => (Value::Number(1.0), txt(&"x".repeat(100001))),
            _ => panic!("unknown rename case {tail}"),
        };
    }
    let row = rows(get(manifest, "results"))
        .iter()
        .find(|row| {
            format!(
                "rename/{}/{}",
                text(get(row, "id")),
                match get(row, "index") {
                    Value::Number(n) => n.to_string(),
                    _ => panic!("index"),
                }
            ) == label
        })
        .unwrap();
    (get(row, "index").clone(), get(row, "name").clone())
}
#[test]
fn frozen_edit_results_preserve_values_utf16_member_order_and_source() {
    let frozen = read("tests/rust-core/fixtures/parquet-edits-ts-freeze.json");
    let additions = read("fixtures/parquet/transforms/results.json");
    let rename = read("fixtures/parquet/rename/results.json");
    let cases = rows(get(&frozen, "operations"));
    assert_eq!(cases.len(), 102);
    for case in cases {
        let label = text(get(case, "label"));
        let op = text(get(case, "op"));
        let expected = get(case, "ts");
        let mut fields = vec![
            ("op", txt(&format!("parquet.{op}"))),
            ("document", get(expected, "source").clone()),
        ];
        if op == "appendKeyValueMetadata" {
            fields.push((
                "entries",
                append_entries(&label, get(&additions, "additions")),
            ));
        } else {
            assert_eq!(op, "renameField");
            let (index, name) = rename_args(&label, &rename);
            fields.extend([("index", index), ("name", name)]);
        }
        let request = encode(&obj(fields), &mut Context::ordinary()).unwrap();
        let result: serde_json::Value = serde_json::from_str(&execute_wire(&request)).unwrap();
        assert_eq!(result["status"], "ok", "{label}: {result}");
        let actual = decode(result["wire"].as_str().unwrap(), &mut Context::ordinary()).unwrap();
        if let Some(difference) = difference(&actual, expected, "") {
            panic!("{label}: {difference}");
        }
    }
}

#[test]
fn legacy_dictionary_repairs_match_complete_frozen_results() {
    let packet = read("fixtures/parquet/offset-repair/results.json");
    let cases = rows(get(&packet, "results"));
    assert_eq!(cases.len(), 2);
    for case in cases {
        let label = text(get(case, "id"));
        let expected = get(case, "result");
        let request = obj([
            ("op", txt("parquet.repairDictionaryOffsets")),
            ("document", get(expected, "source").clone()),
        ]);
        let envelope: serde_json::Value = serde_json::from_str(&execute_wire(
            &encode(&request, &mut Context::ordinary()).unwrap(),
        ))
        .unwrap();
        assert_eq!(envelope["status"], "ok", "{label}: {envelope}");
        let actual = decode(envelope["wire"].as_str().unwrap(), &mut Context::ordinary()).unwrap();
        if let Some(difference) = difference(&actual, expected, "") {
            panic!("{label}: {difference}");
        }
    }
}

#[test]
fn append_retains_caller_entry_member_order_and_capture() {
    let frozen = read("tests/rust-core/fixtures/parquet-edits-ts-freeze.json");
    let source = get(get(&rows(get(&frozen, "operations"))[0], "ts"), "source").clone();
    let entries = Value::Array(vec![obj([
        ("value", txt("retained value")),
        ("key", txt("_review_value_first")),
    ])]);
    let request = obj([
        ("op", txt("parquet.appendKeyValueMetadata")),
        ("document", source.clone()),
        ("entries", entries.clone()),
    ]);
    let envelope: serde_json::Value = serde_json::from_str(&execute_wire(
        &encode(&request, &mut Context::ordinary()).unwrap(),
    ))
    .unwrap();
    assert_eq!(envelope["status"], "ok", "{envelope}");
    let actual = decode(envelope["wire"].as_str().unwrap(), &mut Context::ordinary()).unwrap();
    assert!(get(&actual, "source") == &source);
    assert!(get(&actual, "added") == &entries);
}
