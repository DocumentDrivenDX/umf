#![cfg(feature = "embedded-adapters")]
// SPDX-License-Identifier: MIT OR Apache-2.0
use std::{
    io::Write,
    process::{Command, Stdio},
};
use umf_core::{Context, Utf16, Value};

const SCHEMA: &str = r#"{"fields":[{"name":"a","nullable":true,"type":{"name":"int","bitWidth":32,"isSigned":true}}]}"#;

fn request(op: &str, fields: Vec<(&str, Value)>) -> String {
    let mut members = vec![(Utf16::from("op"), Value::string_utf8(op))];
    members.extend(
        fields
            .into_iter()
            .map(|(key, value)| (Utf16::from(key), value)),
    );
    umf_core_wire::encode(&Value::Object(members), &mut Context::ordinary()).unwrap()
}

fn run(wire: &str, options: &[&str]) -> serde_json::Value {
    let mut child = Command::new(env!("CARGO_BIN_EXE_umf"))
        .args(["arrow", "schema", "--stdin-wire"])
        .args(options)
        .env("PATH", "")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();
    child
        .stdin
        .take()
        .unwrap()
        .write_all(wire.as_bytes())
        .unwrap();
    let output = child.wait_with_output().unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    serde_json::from_slice(&output.stdout).unwrap()
}

fn decode_result(envelope: &serde_json::Value) -> Value {
    assert_eq!(envelope["profile"], "umf.core-wire/1");
    assert_eq!(envelope["status"], "ok", "{envelope}");
    umf_core_wire::decode(
        envelope["wire"].as_str().expect("tagged result wire"),
        &mut Context::ordinary(),
    )
    .unwrap()
}

#[test]
fn arrow_schema_cli_runs_import_and_export_without_python_or_javascript() {
    let imported = run(
        &request(
            "arrow.schema.import",
            vec![
                ("source", Value::string_utf8(SCHEMA)),
                ("id", Value::string_utf8("arrow-cli")),
            ],
        ),
        &[],
    );
    let document = decode_result(&imported);

    let exported = run(
        &request("arrow.schema.export", vec![("document", document)]),
        &[],
    );
    assert_eq!(
        decode_result(&exported),
        Value::string_utf8(SCHEMA),
        "schema export must retain its exact JSON text"
    );
}

#[test]
fn arrow_schema_cli_respects_work_and_deadline_controls() {
    let wire = request(
        "arrow.schema.import",
        vec![
            ("source", Value::string_utf8(SCHEMA)),
            ("id", Value::string_utf8("arrow-cli")),
        ],
    );
    let budget = run(&wire, &["--max-work", "0"]);
    assert_eq!(budget["status"], "error");
    assert_eq!(budget["code"], "RESOURCE_LIMIT");

    let deadline = run(&wire, &["--timeout-ms", "0"]);
    assert_eq!(deadline["status"], "error");
    assert_eq!(deadline["code"], "DEADLINE");
}

#[test]
fn arrow_schema_cli_reports_versioned_capability() {
    let version = Command::new(env!("CARGO_BIN_EXE_umf"))
        .args(["arrow", "schema", "--version"])
        .env("PATH", "")
        .output()
        .unwrap();
    assert!(version.status.success());
    let version: serde_json::Value = serde_json::from_slice(&version.stdout).unwrap();
    assert_eq!(version["profile"], umf_core_wire::ARROW_SCHEMA_PROFILE);

    let output = Command::new(env!("CARGO_BIN_EXE_umf"))
        .args(["arrow", "schema", "--capabilities"])
        .env("PATH", "")
        .output()
        .unwrap();
    assert!(output.status.success());
    let capability: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(capability["profile"], umf_core_wire::ARROW_SCHEMA_PROFILE);
    assert_eq!(
        capability["operations"],
        serde_json::json!([
            "arrow.schema.import",
            "arrow.schema.inspect",
            "arrow.schema.export",
            "arrow.schema.getNode",
            "arrow.schema.proposeNodeEdit"
        ])
    );
    assert_eq!(capability["resourceProfile"], "cooperative");
}
