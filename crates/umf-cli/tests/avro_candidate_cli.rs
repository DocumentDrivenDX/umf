// SPDX-License-Identifier: MIT OR Apache-2.0
#![cfg(feature = "embedded-adapters")]

use std::{
    io::Write,
    process::{Command, Stdio},
};
use umf_core::{Context, Utf16, Value};

fn object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(key, value)| (Utf16::from(key), value))
            .collect(),
    )
}

fn wire() -> String {
    let document = umf_core::avro_document::import_schema(
        &Utf16::from("cli-candidate"),
        &r#"{"type":"record","name":"R","fields":[{"name":"n","type":"long","default":0}]}"#
            .encode_utf16()
            .collect::<Vec<_>>(),
        &[],
        &mut Context::ordinary(),
    )
    .unwrap();
    umf_core_wire::encode(
        &object(vec![
            ("op", Value::string_utf8("avro.schema.proposeNodeEdit")),
            ("document", document),
            ("path", Value::string_utf8("/fields/0/default")),
            ("replacementJson", Value::string_utf8("9223372036854775807")),
        ]),
        &mut Context::ordinary(),
    )
    .unwrap()
}

fn run(args: &[&str], input: Option<&str>) -> std::process::Output {
    let mut child = Command::new(env!("CARGO_BIN_EXE_umf"))
        .args(["avro", "candidate-edit"])
        .args(args)
        .env("PATH", "")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    if let Some(input) = input {
        child
            .stdin
            .take()
            .unwrap()
            .write_all(input.as_bytes())
            .unwrap();
    }
    child.wait_with_output().unwrap()
}

#[test]
fn version_and_capabilities_are_opt_in_profile_scoped() {
    let version = run(&["--version"], None);
    assert!(version.status.success());
    let version: serde_json::Value = serde_json::from_slice(&version.stdout).unwrap();
    assert_eq!(version["profile"], umf_core_wire::AVRO_CANDIDATE_PROFILE);

    let capabilities = run(&["--capabilities"], None);
    assert!(capabilities.status.success());
    let capabilities: serde_json::Value = serde_json::from_slice(&capabilities.stdout).unwrap();
    assert_eq!(
        capabilities["profile"],
        umf_core_wire::AVRO_CANDIDATE_PROFILE
    );
    assert_eq!(
        capabilities["operations"],
        serde_json::json!(["avro.schema.proposeNodeEdit"])
    );
    assert_eq!(capabilities["semanticCompleteness"], false);
}

#[test]
fn success_and_malformed_request_use_core_wire_envelopes_without_path() {
    let response = run(&["--stdin-wire"], Some(&wire()));
    assert!(
        response.status.success(),
        "{}",
        String::from_utf8_lossy(&response.stderr)
    );
    let response: serde_json::Value = serde_json::from_slice(&response.stdout).unwrap();
    assert_eq!(response["status"], "ok");

    let malformed = run(&["--stdin-wire"], Some("not-json"));
    assert!(malformed.status.success());
    let malformed: serde_json::Value = serde_json::from_slice(&malformed.stdout).unwrap();
    assert_eq!(malformed["status"], "error");
}

#[test]
fn cooperative_controls_and_unsupported_flags_are_enforced() {
    let resource = run(&["--stdin-wire", "--max-work", "0"], Some(&wire()));
    let resource: serde_json::Value = serde_json::from_slice(&resource.stdout).unwrap();
    assert_eq!(resource["code"], "RESOURCE_LIMIT");

    let deadline = run(&["--stdin-wire", "--timeout-ms", "0"], Some(&wire()));
    let deadline: serde_json::Value = serde_json::from_slice(&deadline.stdout).unwrap();
    assert_eq!(deadline["code"], "DEADLINE");

    let unsupported = run(&["--stdin-wire", "--unexpected"], None);
    assert_eq!(unsupported.status.code(), Some(2));
    assert!(
        String::from_utf8_lossy(&unsupported.stderr).contains("invalid Avro candidate-edit option")
    );
}
