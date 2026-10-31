#![cfg(feature = "embedded-adapters")]
// SPDX-License-Identifier: MIT OR Apache-2.0
use std::{
    io::Write,
    process::{Command, Stdio},
};
use umf_core::{Context, Value};

fn request(profile: &str) -> String {
    umf_core_wire::encode(
        &Value::Object(vec![
            ("profile".into(), Value::string_utf8(profile)),
            ("op".into(), Value::string_utf8("importJsonSchema")),
            ("source".into(), Value::string_utf8("{\"type\":\"string\"}")),
            ("id".into(), Value::string_utf8("schema")),
            (
                "baseUri".into(),
                Value::string_utf8("https://example.test/root.json"),
            ),
            ("resources".into(), Value::Array(vec![])),
        ]),
        &mut Context::ordinary(),
    )
    .unwrap()
}

fn run(wire: &str, options: &[&str]) -> serde_json::Value {
    let mut child = Command::new(env!("CARGO_BIN_EXE_umf"))
        .args(["json-schema", "--stdin-wire"])
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
fn json_schema_cli_is_standalone_and_checks_the_profile() {
    let envelope = run(&request(umf_core_wire::JSON_SCHEMA_PROFILE), &[]);
    assert_eq!(envelope["profile"], "umf.core-wire/1");
    assert_eq!(envelope["status"], "ok");
    assert_eq!(
        run(&request("umf-r5-json-schema/0.0.0"), &[])["code"],
        "REQUEST"
    );

    let version = Command::new(env!("CARGO_BIN_EXE_umf"))
        .args(["json-schema", "--version"])
        .env("PATH", "")
        .output()
        .unwrap();
    let version: serde_json::Value = serde_json::from_slice(&version.stdout).unwrap();
    assert_eq!(version["profile"], umf_core_wire::JSON_SCHEMA_PROFILE);
    let capabilities = Command::new(env!("CARGO_BIN_EXE_umf"))
        .args(["json-schema", "--capabilities"])
        .env("PATH", "")
        .output()
        .unwrap();
    let capabilities: serde_json::Value = serde_json::from_slice(&capabilities.stdout).unwrap();
    assert_eq!(capabilities["operations"].as_array().unwrap().len(), 7);
}

#[test]
fn json_schema_cli_enforces_work_and_deadline_controls() {
    let wire = request(umf_core_wire::JSON_SCHEMA_PROFILE);
    assert_eq!(run(&wire, &["--max-work", "0"])["code"], "RESOURCE_LIMIT");
    assert_eq!(run(&wire, &["--timeout-ms", "0"])["code"], "DEADLINE");
}
