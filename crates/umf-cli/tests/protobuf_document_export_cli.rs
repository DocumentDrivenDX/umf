#![cfg(feature = "embedded-adapters")]
// SPDX-License-Identifier: MIT OR Apache-2.0
use sha2::Digest;
use std::{
    io::Write,
    process::{Command, Stdio},
};
use umf_core::{protobuf_document, Context, Value};

fn request_wire(operation: &str, document: &Value) -> String {
    let request = Value::Object(vec![
        ("op".into(), Value::string_utf8(operation)),
        ("document".into(), document.clone()),
    ]);
    umf_core_wire::encode(&request, &mut Context::ordinary()).unwrap()
}

fn run_wire(wire: &str, options: &[&str]) -> std::process::Output {
    let mut child = Command::new(env!("CARGO_BIN_EXE_umf"))
        .args(["protobuf", "descriptor", "export", "--stdin-wire"])
        .args(options)
        .env("PATH", "")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    child
        .stdin
        .take()
        .unwrap()
        .write_all(wire.as_bytes())
        .unwrap();
    child.wait_with_output().unwrap()
}

#[test]
fn document_export_matches_frozen_typescript_round_trip_bytes_without_path_dependencies() {
    // Frozen direct TypeScript document.export capture: 83,233 bytes with the
    // SHA-256 recorded in the R8 predecessor packet.
    let authored = include_bytes!("../../../fixtures/protobuf/authored.pb");
    let document =
        protobuf_document::import_descriptor_set(authored, "schema", &mut Context::ordinary())
            .unwrap();
    let output = run_wire(&request_wire("protobuf.document.export", &document), &[]);
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert_eq!(output.stdout.len(), 83_233);
    assert_eq!(
        format!("{:x}", sha2::Sha256::digest(&output.stdout)),
        "78ce5e414d52e36f6dab8cf01e9dd58ff6ed230d2a2abc486b7275096d05d5a8"
    );
}

#[test]
fn document_export_has_an_explicit_single_operation_profile() {
    let version = Command::new(env!("CARGO_BIN_EXE_umf"))
        .args(["protobuf", "descriptor", "export", "--version"])
        .env("PATH", "")
        .output()
        .unwrap();
    let version: serde_json::Value = serde_json::from_slice(&version.stdout).unwrap();
    assert_eq!(version["profile"], "umf.protobuf-document-export-cli/0.1.0");
    let capabilities = Command::new(env!("CARGO_BIN_EXE_umf"))
        .args(["protobuf", "descriptor", "export", "--capabilities"])
        .env("PATH", "")
        .output()
        .unwrap();
    let capabilities: serde_json::Value = serde_json::from_slice(&capabilities.stdout).unwrap();
    assert_eq!(
        capabilities["operations"],
        serde_json::json!(["protobuf.document.export"])
    );
    assert_eq!(capabilities["maxOutputBytes"], 4_000_000);
}

#[test]
fn document_export_refuses_wrong_operation_and_cooperative_work_exhaustion() {
    let document =
        protobuf_document::import_descriptor_set(&[], "schema", &mut Context::ordinary()).unwrap();
    let wrong = run_wire(&request_wire("protobuf.document.get", &document), &[]);
    let error: serde_json::Value = serde_json::from_slice(&wrong.stdout).unwrap();
    assert_eq!(error["status"], "error");
    assert_eq!(error["code"], "REQUEST");
    let limited = run_wire(
        &request_wire("protobuf.document.export", &document),
        &["--max-work", "0"],
    );
    let error: serde_json::Value = serde_json::from_slice(&limited.stdout).unwrap();
    assert_eq!(error["status"], "error");
    assert_eq!(error["code"], "RESOURCE_LIMIT");
}
