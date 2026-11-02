// SPDX-License-Identifier: MIT OR Apache-2.0
use std::{
    io::Write,
    process::{Command, Stdio},
};

use umf_core::{Context, Utf16, Value};

fn parse(text: &str) -> Value {
    umf_core::serialization::read_json_value(
        &text.encode_utf16().collect::<Vec<_>>(),
        umf_core::serialization::Format::Json,
        &mut Context::ordinary(),
    )
    .unwrap()
}

fn request(op: &str, fields: Vec<(&str, Value)>) -> String {
    let mut members = vec![
        (Utf16::from("op"), Value::string_utf8(op)),
        (
            Utf16::from("resources"),
            Value::Object(vec![
                (
                    Utf16::from("coreSchema"),
                    parse(include_str!("../../../spec/core/schema.json")),
                ),
                (
                    Utf16::from("referenceSchema"),
                    parse(include_str!(
                        "../../../spec/core/semantic-type-reference.schema.json"
                    )),
                ),
                (
                    Utf16::from("packageSchema"),
                    parse(include_str!(
                        "../../../spec/core/extension-package.schema.json"
                    )),
                ),
                (
                    Utf16::from("constraints"),
                    parse(include_str!(
                        "../../../spec/metamodel/generated/core-constraints.json"
                    )),
                ),
                (
                    Utf16::from("domainPolicy"),
                    parse(include_str!(
                        "../../../spec/metamodel/generated/domain-policy.json"
                    )),
                ),
            ]),
        ),
    ];
    members.extend(
        fields
            .into_iter()
            .map(|(key, value)| (Utf16::from(key), value)),
    );
    umf_core_wire::encode(
        &Value::Object(members),
        &mut umf_core_wire::transport_context(),
    )
    .unwrap()
}

fn run(wire: &str, options: &[&str]) -> serde_json::Value {
    let mut child = Command::new(env!("CARGO_BIN_EXE_umf"))
        .args(["cardinality", "--stdin-wire"])
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

fn decode_result(envelope: &serde_json::Value) -> Value {
    assert_eq!(envelope["profile"], "umf.core-wire/1");
    assert_eq!(envelope["status"], "ok", "{envelope}");
    umf_core_wire::decode(
        envelope["wire"].as_str().expect("tagged result wire"),
        &mut umf_core_wire::transport_context(),
    )
    .unwrap()
}

#[test]
fn cardinality_cli_runs_inspect_declare_and_verify_without_python_or_javascript() {
    let source = parse(
        r#"{"umf":"0.10.0","id":"cli","vocabularies":{},"modules":[{"id":"m","namespace":"","elements":[{"id":"f","kind":"field","extensions":{}}]}]}"#,
    );
    let identity = parse(r#"{"module":"m","element":"f"}"#);
    let inspected = run(
        &request(
            "model/inspectCoreCardinality",
            vec![("source", source.clone()), ("identity", identity.clone())],
        ),
        &[],
    );
    assert_eq!(inspected["status"], "ok", "{inspected}");

    let declared = decode_result(&run(
        &request(
            "model/declareCoreCardinality",
            vec![
                ("source", source.clone()),
                ("identity", identity),
                ("request", parse(r#"{"cardinality":"array"}"#)),
            ],
        ),
        &[],
    ));
    let target = match &declared {
        Value::Object(fields) => fields
            .iter()
            .find(|(key, _)| key == &Utf16::from("target"))
            .unwrap()
            .1
            .clone(),
        _ => unreachable!(),
    };
    let verified = run(
        &request(
            "model/verifyCoreCardinalityDeclaration",
            vec![("receipt", declared), ("current", target)],
        ),
        &[],
    );
    assert_eq!(verified["status"], "ok", "{verified}");
}

#[test]
fn cardinality_cli_has_separate_work_and_deadline_controls() {
    let wire = request(
        "model/inspectCoreCardinality",
        vec![
            (
                "source",
                parse(r#"{"umf":"0.10.0","id":"x","vocabularies":{},"modules":[]}"#),
            ),
            ("identity", parse(r#"{"module":"m","element":"f"}"#)),
        ],
    );
    assert_eq!(run(&wire, &["--max-work", "0"])["code"], "RESOURCE_LIMIT");
    assert_eq!(run(&wire, &["--timeout-ms", "0"])["code"], "DEADLINE");
}

#[test]
fn cardinality_cli_refuses_operations_outside_its_opt_in_surface() {
    let wire = request(
        "model/inspectCoreFacets",
        vec![("source", parse("{}")), ("identity", parse("{}"))],
    );
    let response = run(&wire, &[]);
    assert_eq!(response["status"], "error");
    assert_eq!(response["code"], "REQUEST");
}

#[test]
fn cardinality_cli_reports_its_versioned_capability() {
    let version = Command::new(env!("CARGO_BIN_EXE_umf"))
        .args(["cardinality", "--version"])
        .env("PATH", "")
        .output()
        .unwrap();
    assert!(version.status.success());
    let version: serde_json::Value = serde_json::from_slice(&version.stdout).unwrap();
    assert_eq!(
        version["profile"],
        umf_core_wire::CORE_CARDINALITY_BINDING_PROFILE
    );

    let capabilities = Command::new(env!("CARGO_BIN_EXE_umf"))
        .args(["cardinality", "--capabilities"])
        .env("PATH", "")
        .output()
        .unwrap();
    assert!(capabilities.status.success());
    let capabilities: serde_json::Value = serde_json::from_slice(&capabilities.stdout).unwrap();
    assert_eq!(
        capabilities["operations"],
        serde_json::json!([
            "model/inspectCoreCardinality",
            "model/declareCoreCardinality",
            "model/verifyCoreCardinalityDeclaration"
        ])
    );
}
