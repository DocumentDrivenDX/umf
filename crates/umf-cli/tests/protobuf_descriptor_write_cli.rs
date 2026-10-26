#![cfg(feature = "embedded-adapters")]
// SPDX-License-Identifier: MIT OR Apache-2.0
use std::{
    io::Write,
    process::{Command, Stdio},
};

use sha2::Digest;
use umf_core::{protobuf_descriptor, Context, Value};

fn request_wire(descriptor: &Value) -> String {
    let request = Value::Object(vec![
        ("op".into(), Value::string_utf8("protobuf.descriptor.write")),
        ("descriptorSet".into(), descriptor.clone()),
    ]);
    umf_core_wire::encode(&request, &mut Context::ordinary()).unwrap()
}

fn write_descriptor(descriptor: &Value, options: &[&str]) -> std::process::Output {
    run_wire(&request_wire(descriptor), options)
}

fn run_wire(wire: &str, options: &[&str]) -> std::process::Output {
    let mut child = Command::new(env!("CARGO_BIN_EXE_umf"))
        .args(["protobuf", "descriptor", "write", "--stdin-wire"])
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
fn descriptor_write_has_an_explicit_capability_profile() {
    let version = Command::new(env!("CARGO_BIN_EXE_umf"))
        .args(["protobuf", "descriptor", "write", "--version"])
        .env("PATH", "")
        .output()
        .unwrap();
    let version: serde_json::Value = serde_json::from_slice(&version.stdout).unwrap();
    assert_eq!(
        version["profile"],
        "umf.protobuf-descriptor-write-cli/0.1.0"
    );

    let capabilities = Command::new(env!("CARGO_BIN_EXE_umf"))
        .args(["protobuf", "descriptor", "write", "--capabilities"])
        .env("PATH", "")
        .output()
        .unwrap();
    let capabilities: serde_json::Value = serde_json::from_slice(&capabilities.stdout).unwrap();
    assert_eq!(
        capabilities["operations"],
        serde_json::json!(["protobuf.descriptor.write"])
    );
    assert_eq!(capabilities["maxOutputBytes"], 4_000_000);
}

#[test]
fn descriptor_write_matches_frozen_predecessor_bytes_and_unknown_payload() {
    // Compare the native CLI bytes with the independent TypeScript predecessor
    // vector `authored.pb-roundtrip-bytes` in
    // docs/helix/04-build/evidence/rust-migration/r5-protobuf-descriptor-codec/predecessor.json
    // (Buf 2.15.0 / Bun 1.4.3; SHA-256 pinned below).
    let authored = include_bytes!("../../../fixtures/protobuf/authored.pb");
    let descriptor =
        protobuf_descriptor::read_descriptor_set(authored, &mut Context::ordinary()).unwrap();
    let output = write_descriptor(&descriptor, &[]);
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

    let unknown_wire = [0x82, 0xb5, 0x18, 0x04, 0x00, 0x01, 0x02, 0xff];
    let unknown =
        protobuf_descriptor::read_descriptor_set(&unknown_wire, &mut Context::ordinary()).unwrap();
    let output = write_descriptor(&unknown, &[]);
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert_eq!(output.stdout, unknown_wire);
}

#[test]
fn descriptor_write_reports_control_refusals_as_core_wire_envelopes() {
    let descriptor =
        protobuf_descriptor::read_descriptor_set(&[], &mut Context::ordinary()).unwrap();
    let output = write_descriptor(&descriptor, &["--max-work", "0"]);
    assert!(output.status.success());
    let envelope: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(envelope["status"], "error");
    assert_eq!(envelope["code"], "RESOURCE_LIMIT");
}

#[test]
fn descriptor_write_rejects_malformed_and_other_operation_requests() {
    let malformed = run_wire("not-json", &[]);
    assert!(malformed.status.success());
    let envelope: serde_json::Value = serde_json::from_slice(&malformed.stdout).unwrap();
    assert_eq!(envelope["status"], "error");

    let other_operation = Value::Object(vec![(
        "op".into(),
        Value::string_utf8("protobuf.document.bundle"),
    )]);
    let wire = umf_core_wire::encode(&other_operation, &mut Context::ordinary()).unwrap();
    let output = run_wire(&wire, &[]);
    assert!(output.status.success());
    let envelope: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(envelope["status"], "error");
    assert_eq!(envelope["code"], "REQUEST");
}

#[test]
fn descriptor_write_refuses_binary_output_above_four_megabytes() {
    // Keep each unknown value within the 4 MB per-value hex limit while the
    // combined five fields produce more than 4 MB of encoded output.
    let raw = format!("c0843d{}", "00".repeat(1_000_000));
    let descriptor = Value::Object(vec![
        (
            "type".into(),
            Value::string_utf8("google.protobuf.FileDescriptorSet"),
        ),
        ("fields".into(), Value::Object(vec![])),
        (
            "unknown".into(),
            Value::Array(
                (0..5)
                    .map(|_| {
                        Value::Object(vec![
                            ("number".into(), Value::Number(50_000.0)),
                            ("wireType".into(), Value::Number(2.0)),
                            ("data".into(), Value::string_utf8(raw.clone())),
                        ])
                    })
                    .collect(),
            ),
        ),
    ]);
    let output = write_descriptor(&descriptor, &[]);
    assert!(output.status.success());
    let envelope: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(envelope["status"], "error");
    assert_eq!(envelope["code"], "LIMIT");
}
