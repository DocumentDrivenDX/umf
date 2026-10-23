// SPDX-License-Identifier: MIT OR Apache-2.0
use std::{io::Write, process::{Command, Stdio}};
use umf_core::{Context, Utf16, Value};

fn request() -> String {
    let source = r#"{"type":"struct","schema-id":0,"fields":[{"id":1,"name":"a","type":"long","required":true}]}"#;
    let request = Value::Object(vec![
        (Utf16::from("op"), Value::string_utf8("iceberg.schema.import")),
        (Utf16::from("source"), Value::string_utf8(source)),
        (Utf16::from("id"), Value::string_utf8("iceberg")),
    ]);
    umf_core_wire::encode(&request, &mut Context::ordinary()).unwrap()
}

fn run(wire: &str, options: &[&str]) -> serde_json::Value {
    let mut child = Command::new(env!("CARGO_BIN_EXE_umf"))
        .args(["iceberg", "schema", "--stdin-wire"])
        .args(options)
        .env("PATH", "")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();
    child.stdin.take().unwrap().write_all(wire.as_bytes()).unwrap();
    let output = child.wait_with_output().unwrap();
    assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
    serde_json::from_slice(&output.stdout).unwrap()
}

#[test]
fn iceberg_schema_cli_runs_without_python_or_javascript() {
    let envelope = run(&request(), &[]);
    assert_eq!(envelope["profile"], "umf.core-wire/1");
    assert_eq!(envelope["status"], "ok", "{envelope}");
    let document = umf_core_wire::decode(
        envelope["wire"].as_str().unwrap(),
        &mut Context::ordinary(),
    ).unwrap();
    let Value::Object(fields) = document else { panic!("document object expected") };
    assert!(fields.iter().any(|(key, value)|
        key == &Utf16::from("id") && value == &Value::string_utf8("iceberg")
    ));
}

#[test]
fn iceberg_schema_cli_respects_work_and_deadline_controls() {
    let wire = request();
    let budget = run(&wire, &["--max-work", "0"]);
    assert_eq!(budget["status"], "error");
    assert_eq!(budget["code"], "RESOURCE_LIMIT");
    let deadline = run(&wire, &["--timeout-ms", "0"]);
    assert_eq!(deadline["status"], "error");
    assert_eq!(deadline["code"], "DEADLINE");
}

#[test]
fn iceberg_schema_cli_reports_versioned_capability() {
    let output = Command::new(env!("CARGO_BIN_EXE_umf"))
        .args(["iceberg", "schema", "--capabilities"])
        .env("PATH", "")
        .output()
        .unwrap();
    assert!(output.status.success());
    let capability: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(capability["profile"], umf_core_wire::ICEBERG_SCHEMA_PROFILE);
    assert_eq!(capability["operations"].as_array().unwrap().len(), 5);
    assert_eq!(capability["resourceProfile"], "cooperative");
}
