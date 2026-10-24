// SPDX-License-Identifier: MIT OR Apache-2.0
use std::{io::Write, process::{Command, Stdio}};
use umf_core::{Context, Utf16, Value};

fn object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(fields.into_iter().map(|(key, value)| (Utf16::from(key), value)).collect())
}
fn tagged_string(value: &str) -> Value {
    object(vec![("kind", Value::string_utf8("string")), ("value", Value::string_utf8(value))])
}
fn request() -> String {
    umf_core_wire::encode(&object(vec![
        ("op", Value::string_utf8("avro.schema.inspect")),
        ("root", tagged_string("not.defined")),
    ]), &mut Context::ordinary()).unwrap()
}
fn run(wire: &str, options: &[&str]) -> serde_json::Value {
    let mut child = Command::new(env!("CARGO_BIN_EXE_umf"))
        .args(["avro", "inspect", "--stdin-wire"]).args(options)
        .env("PATH", "").stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped())
        .spawn().unwrap();
    child.stdin.take().unwrap().write_all(wire.as_bytes()).unwrap();
    let output = child.wait_with_output().unwrap();
    assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
    serde_json::from_slice(&output.stdout).unwrap()
}

#[test]
fn cli_runs_incomplete_inspector_without_path_dependencies() {
    let envelope = run(&request(), &[]);
    assert_eq!(envelope["status"], "ok");
    let result = umf_core_wire::decode(envelope["wire"].as_str().unwrap(), &mut Context::ordinary()).unwrap();
    let Value::Object(fields) = result else { panic!("result object expected") };
    assert!(fields.iter().any(|(key, value)| key == &Utf16::from("valid") && value == &Value::Bool(false)));
    assert!(fields.iter().any(|(key, value)| key == &Utf16::from("complete") && value == &Value::Bool(false)));
}

#[test]
fn cli_reports_opt_in_incomplete_capability_and_enforces_controls() {
    let capabilities = Command::new(env!("CARGO_BIN_EXE_umf"))
        .args(["avro", "inspect", "--capabilities"]).env("PATH", "").output().unwrap();
    assert!(capabilities.status.success());
    let capabilities: serde_json::Value = serde_json::from_slice(&capabilities.stdout).unwrap();
    assert_eq!(capabilities["profile"], umf_core_wire::AVRO_INSPECT_PROFILE);
    assert_eq!(capabilities["semanticCompleteness"], false);
    assert_eq!(run(&request(), &["--max-work", "0"])["code"], "RESOURCE_LIMIT");
    assert_eq!(run(&request(), &["--timeout-ms", "0"])["code"], "DEADLINE");
}
