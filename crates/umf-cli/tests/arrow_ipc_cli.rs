#![cfg(feature = "embedded-adapters")]
// SPDX-License-Identifier: MIT OR Apache-2.0
use std::{
    io::Write,
    process::{Command, Stdio},
};
use umf_core::{Context, Utf16, Value};

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
        .args(["arrow", "ipc", "--stdin-wire"])
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

fn decode(envelope: &serde_json::Value) -> Value {
    assert_eq!(envelope["profile"], "umf.core-wire/1");
    assert_eq!(envelope["status"], "ok", "{envelope}");
    umf_core_wire::decode(envelope["wire"].as_str().unwrap(), &mut Context::ordinary()).unwrap()
}

#[test]
fn arrow_ipc_cli_captures_and_exports_exact_uninterpreted_bytes() {
    let source = "00ff10206172726f772d6e6f742d76616c6964";
    let captured = run(
        &request(
            "arrow.ipc.capture",
            vec![
                ("bytes", Value::string_utf8(source)),
                ("id", Value::string_utf8("cli")),
            ],
        ),
        &[],
    );
    let document = decode(&captured);
    let exported = run(
        &request("arrow.ipc.export", vec![("document", document)]),
        &[],
    );
    assert_eq!(decode(&exported), Value::string_utf8(source));
}

#[test]
fn arrow_ipc_cli_accepts_the_exact_one_megabyte_source_limit() {
    let wire = request(
        "arrow.ipc.capture",
        vec![
            ("bytes", Value::string_utf8("00".repeat(1_000_000))),
            ("id", Value::string_utf8("limit")),
        ],
    );
    let captured = run(&wire, &[]);
    assert_eq!(captured["status"], "ok", "{captured}");
}

#[test]
fn arrow_ipc_cli_enforces_controls_and_reports_opt_in_capability() {
    let wire = request(
        "arrow.ipc.capture",
        vec![
            ("bytes", Value::string_utf8("")),
            ("id", Value::string_utf8("empty")),
        ],
    );
    assert_eq!(run(&wire, &["--max-work", "0"])["code"], "RESOURCE_LIMIT");
    assert_eq!(run(&wire, &["--timeout-ms", "0"])["code"], "DEADLINE");

    let version = Command::new(env!("CARGO_BIN_EXE_umf"))
        .args(["arrow", "ipc", "--version"])
        .env("PATH", "")
        .output()
        .unwrap();
    let version: serde_json::Value = serde_json::from_slice(&version.stdout).unwrap();
    assert_eq!(version["profile"], umf_core_wire::ARROW_IPC_PROFILE);
    let capabilities = Command::new(env!("CARGO_BIN_EXE_umf"))
        .args(["arrow", "ipc", "--capabilities"])
        .env("PATH", "")
        .output()
        .unwrap();
    let capabilities: serde_json::Value = serde_json::from_slice(&capabilities.stdout).unwrap();
    assert_eq!(capabilities["profile"], umf_core_wire::ARROW_IPC_PROFILE);
    assert_eq!(capabilities["maxSourceBytes"], 1_000_000);
}
