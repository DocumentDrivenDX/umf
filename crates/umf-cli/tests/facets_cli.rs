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
        .args(["facets", "--stdin-wire"])
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

fn field<'a>(value: &'a Value, name: &str) -> &'a Value {
    match value {
        Value::Object(fields) => fields
            .iter()
            .find(|(key, _)| key == &Utf16::from(name))
            .map(|(_, value)| value)
            .unwrap(),
        _ => panic!("expected object"),
    }
}

#[test]
fn facets_cli_runs_the_four_public_operations_without_host_runtimes() {
    let source = parse(
        r#"{"umf":"0.10.0","id":"cli-facets","vocabularies":{},"modules":[{"id":"m","namespace":"","elements":[{"id":"f","kind":"field","scalarType":"integer","extensions":{}}]}]}"#,
    );
    let identity = parse(r#"{"module":"m","element":"f"}"#);
    let receipt = decode_result(&run(
        &request(
            "model/declareCoreFacets",
            vec![
                ("source", source),
                ("identity", identity.clone()),
                (
                    "request",
                    parse(r#"{"integerWidth":{"bits":8,"signed":true}}"#),
                ),
            ],
        ),
        &[],
    ));
    let target = field(&receipt, "target").clone();
    let inspected = decode_result(&run(
        &request(
            "model/inspectCoreFacets",
            vec![("source", target.clone()), ("identity", identity)],
        ),
        &[],
    ));
    assert_eq!(
        field(&inspected, "operation"),
        &Value::string_utf8("inspect-core-facets")
    );
    let verified = decode_result(&run(
        &request(
            "model/verifyCoreFacetDeclaration",
            vec![("receipt", receipt.clone()), ("current", target)],
        ),
        &[],
    ));
    assert_eq!(verified, receipt);
    let projected = decode_result(&run(
        &request(
            "model/historicalCoreFacetPatch",
            vec![(
                "input",
                parse(r#"{"integerWidth":{"bits":8,"signed":true}}"#),
            )],
        ),
        &[],
    ));
    assert_eq!(
        projected,
        parse(r#"{"integerWidth":{"bits":8,"signed":true}}"#)
    );
}

#[test]
fn facets_cli_keeps_work_and_deadline_controls_separate_and_whitelisted() {
    let wire = request(
        "model/inspectCoreFacets",
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
    let outside = request(
        "model/inspectCoreCardinality",
        vec![("source", parse("{}")), ("identity", parse("{}"))],
    );
    let response = run(&outside, &[]);
    assert_eq!(response["status"], "error");
    assert_eq!(response["code"], "REQUEST");
}

#[test]
fn facets_cli_reports_only_its_versioned_public_capabilities() {
    let version = Command::new(env!("CARGO_BIN_EXE_umf"))
        .args(["facets", "--version"])
        .env("PATH", "")
        .output()
        .unwrap();
    assert!(version.status.success());
    let version: serde_json::Value = serde_json::from_slice(&version.stdout).unwrap();
    assert_eq!(
        version["profile"],
        umf_core_wire::CORE_FACETS_BINDING_PROFILE
    );
    let capabilities = Command::new(env!("CARGO_BIN_EXE_umf"))
        .args(["facets", "--capabilities"])
        .env("PATH", "")
        .output()
        .unwrap();
    assert!(capabilities.status.success());
    let capabilities: serde_json::Value = serde_json::from_slice(&capabilities.stdout).unwrap();
    assert_eq!(
        capabilities["operations"],
        serde_json::json!([
            "model/inspectCoreFacets",
            "model/declareCoreFacets",
            "model/verifyCoreFacetDeclaration",
            "model/historicalCoreFacetPatch"
        ])
    );
}
