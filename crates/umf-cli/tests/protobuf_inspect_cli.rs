#![cfg(feature = "embedded-adapters")]
// SPDX-License-Identifier: MIT OR Apache-2.0
use std::{io::Write, process::{Command, Stdio}};
use umf_core::{Context, Utf16, Value};

fn object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(fields.into_iter().map(|(key, value)| (Utf16::from(key), value)).collect())
}

fn request() -> String {
    let descriptor = object(vec![
        ("type", Value::string_utf8("google.protobuf.FileDescriptorSet")),
        ("fields", object(vec![])),
        ("unknown", Value::Array(vec![])),
    ]);
    let payload = object(vec![
        ("descriptorProfile", Value::string_utf8("protobuf-es-2.15.0")),
        ("descriptorSet", descriptor),
    ]);
    let element = object(vec![
        ("id", Value::string_utf8("schema")),
        ("extensions", object(vec![("umf.protobuf", payload)])),
    ]);
    let module = object(vec![
        ("id", Value::string_utf8("schema")),
        ("elements", Value::Array(vec![element])),
    ]);
    let document = object(vec![
        ("umf", Value::string_utf8("0.10.0")),
        ("id", Value::string_utf8("cli-inspect")),
        ("vocabularies", object(vec![("umf.protobuf", object(vec![("version", Value::string_utf8("0.1.0"))]))])),
        ("modules", Value::Array(vec![module])),
    ]);
    umf_core_wire::encode(&object(vec![
        ("op", Value::string_utf8("protobuf.descriptor.inspect")),
        ("document", document),
    ]), &mut Context::ordinary()).unwrap()
}

fn run(wire: &str, options: &[&str]) -> serde_json::Value {
    let mut child = Command::new(env!("CARGO_BIN_EXE_umf"))
        .args(["protobuf", "inspect", "--stdin-wire"])
        .args(options)
        .env("PATH", "")
        .stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped())
        .spawn().unwrap();
    child.stdin.take().unwrap().write_all(wire.as_bytes()).unwrap();
    let output = child.wait_with_output().unwrap();
    assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
    serde_json::from_slice(&output.stdout).unwrap()
}

#[test]
fn pure_rust_cli_inspects_without_path_dependencies() {
    let envelope = run(&request(), &[]);
    assert_eq!(envelope["profile"], "umf.core-wire/1");
    assert_eq!(envelope["status"], "ok");
    let validation = umf_core_wire::decode(envelope["wire"].as_str().unwrap(), &mut Context::ordinary()).unwrap();
    let Value::Object(fields) = validation else { panic!("validation object expected") };
    assert!(fields.iter().any(|(key, value)| key == &Utf16::from("complete") && value == &Value::Bool(false)));
}

#[test]
fn cli_reports_version_and_capabilities() {
    let version = Command::new(env!("CARGO_BIN_EXE_umf"))
        .args(["protobuf", "inspect", "--version"]).env("PATH", "").output().unwrap();
    assert!(version.status.success());
    let version: serde_json::Value = serde_json::from_slice(&version.stdout).unwrap();
    assert_eq!(version["profile"], umf_core_wire::PROTOBUF_INSPECT_PROFILE);

    let capabilities = Command::new(env!("CARGO_BIN_EXE_umf"))
        .args(["protobuf", "inspect", "--capabilities"]).env("PATH", "").output().unwrap();
    assert!(capabilities.status.success());
    let capabilities: serde_json::Value = serde_json::from_slice(&capabilities.stdout).unwrap();
    assert_eq!(capabilities["operations"], serde_json::json!(["protobuf.descriptor.inspect"]));
    assert_eq!(capabilities["resourceProfile"], "cooperative");
}

#[test]
fn cli_enforces_work_and_deadline_controls() {
    assert_eq!(run(&request(), &["--max-work", "0"])["code"], "RESOURCE_LIMIT");
    assert_eq!(run(&request(), &["--timeout-ms", "0"])["code"], "DEADLINE");
}

#[test]
fn cli_rejects_stdin_over_transport_byte_limit() {
    const MAX_BYTES: usize = 32 * 1024 * 1024;
    let mut child = Command::new(env!("CARGO_BIN_EXE_umf"))
        .args(["protobuf", "inspect", "--stdin-wire"])
        .env("PATH", "")
        .stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped())
        .spawn().unwrap();
    child.stdin.take().unwrap().write_all(&vec![b' '; MAX_BYTES + 1]).unwrap();
    let output = child.wait_with_output().unwrap();
    assert_eq!(output.status.code(), Some(2));
    assert!(String::from_utf8_lossy(&output.stderr).contains("request exceeds the 33554432-byte transport limit"));
}
