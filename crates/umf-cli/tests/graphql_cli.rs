#![cfg(feature = "embedded-adapters")]
// SPDX-License-Identifier: MIT OR Apache-2.0
use std::{
    io::Write,
    process::{Command, Stdio},
};
use umf_core::{Context, Utf16, Value};

fn request() -> String {
    umf_core_wire::encode(
        &Value::Object(vec![
            (
                Utf16::from("profile"),
                Value::string_utf8(umf_core_wire::graphql_binding::PROFILE),
            ),
            (Utf16::from("op"), Value::string_utf8("graphql.import")),
            (
                Utf16::from("source"),
                Value::string_utf8("type Query { x: String }"),
            ),
            (Utf16::from("id"), Value::string_utf8("cli")),
        ]),
        &mut Context::ordinary(),
    )
    .unwrap()
}

fn run(wire: &str, options: &[&str]) -> serde_json::Value {
    let mut child = Command::new(env!("CARGO_BIN_EXE_umf"))
        .args(["graphql", "--stdin-wire"])
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
    let output = child.wait_with_output().unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    serde_json::from_slice(&output.stdout).unwrap()
}

#[test]
fn graphql_cli_reports_profile_capabilities_and_runs_wire_input() {
    let version = Command::new(env!("CARGO_BIN_EXE_umf"))
        .args(["graphql", "--version"])
        .env("PATH", "")
        .output()
        .unwrap();
    let version: serde_json::Value = serde_json::from_slice(&version.stdout).unwrap();
    assert_eq!(version["profile"], umf_core_wire::graphql_binding::PROFILE);

    let capabilities = Command::new(env!("CARGO_BIN_EXE_umf"))
        .args(["graphql", "--capabilities"])
        .env("PATH", "")
        .output()
        .unwrap();
    let capabilities: serde_json::Value = serde_json::from_slice(&capabilities.stdout).unwrap();
    assert_eq!(capabilities["operations"].as_array().unwrap().len(), 6);
    assert_eq!(run(&request(), &[])["status"], "ok");
}

#[test]
fn graphql_cli_applies_work_and_deadline_controls() {
    assert_eq!(
        run(&request(), &["--max-work", "0"])["code"],
        "RESOURCE_LIMIT"
    );
    assert_eq!(
        run(&request(), &["--timeout-ms", "0"])["code"],
        "DEADLINE_EXCEEDED"
    );
}
