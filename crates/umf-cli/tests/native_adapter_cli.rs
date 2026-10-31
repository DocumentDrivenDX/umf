#![cfg(feature = "embedded-adapters")]
// SPDX-License-Identifier: MIT OR Apache-2.0
use std::{io::Write, process::{Command, Stdio}};
use umf_core::{Context, Utf16, Value};

fn request(profile: &str, op: &str, source: &str, format: &str) -> String {
    umf_core_wire::encode(&Value::Object(vec![
        (Utf16::from("profile"), Value::string_utf8(profile)),
        (Utf16::from("op"), Value::string_utf8(op)),
        (Utf16::from("id"), Value::string_utf8("cli")),
        (Utf16::from("source"), Value::string_utf8(source)),
        (Utf16::from("format"), Value::string_utf8(format)),
    ]), &mut Context::ordinary()).unwrap()
}

fn run(family: &str, wire: &str) -> serde_json::Value {
    let mut child = Command::new(env!("CARGO_BIN_EXE_umf"))
        .args([family, "--stdin-wire"])
        .env("PATH", "")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn().unwrap();
    child.stdin.take().unwrap().write_all(wire.as_bytes()).unwrap();
    let output = child.wait_with_output().unwrap();
    assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
    serde_json::from_slice(&output.stdout).unwrap()
}

#[test]
fn new_native_cli_routes_import_sources() {
    let cases = [
        ("openapi", umf_core_wire::openapi_binding::PROFILE, "openapi.import", r#"{"openapi":"3.1.0","info":{"title":"Wire","version":"1"},"paths":{}}"#, "json"),
        ("linkml", umf_core_wire::native_contract_binding::PROFILE, "linkml.import", "id: schema\nname: schema\nmetamodel_version: 1.11.0\nfuture: 123456789012345678901234567890\n", "yaml"),
        ("odcs", umf_core_wire::native_contract_binding::PROFILE, "odcs.import", r#"{"apiVersion":"v3.2.0","kind":"DataContract","id":"dc","name":"Customer","version":"1.0.0","schema":[{"id":"customers","name":"customers","properties":[{"id":"customer_id","name":"customer_id","logicalType":"string"}],"relationships":[]}]}"#, "json"),
    ];
    for (family, profile, op, source, format) in cases {
        let capabilities = Command::new(env!("CARGO_BIN_EXE_umf"))
            .args([family, "--capabilities"])
            .env("PATH", "")
            .output().unwrap();
        assert!(capabilities.status.success());
        let capabilities: serde_json::Value = serde_json::from_slice(&capabilities.stdout).unwrap();
        assert!(capabilities["operations"].as_array().unwrap().contains(&serde_json::Value::String(op.to_owned())));
        assert_eq!(run(family, &request(profile, op, source, format))["status"], "ok", "{family}");
    }
}

#[test]
fn linkml_cli_refuses_odcs_operation() {
    let wire = umf_core_wire::encode(&Value::Object(vec![
        (Utf16::from("profile"), Value::string_utf8(umf_core_wire::native_contract_binding::PROFILE)),
        (Utf16::from("op"), Value::string_utf8("odcs.inspect")),
        (Utf16::from("document"), Value::Null),
    ]), &mut Context::ordinary()).unwrap();
    let response = run("linkml", &wire);
    assert_eq!(response["status"], "error");
    assert_eq!(response["code"], "REQUEST");
}
