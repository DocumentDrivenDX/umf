// SPDX-License-Identifier: MIT OR Apache-2.0
use std::{io::Write, process::{Command, Stdio}};
use umf_core::{Context, Utf16, Value};

fn parse(text: &str) -> Value {
    umf_core::serialization::read_json_value(&text.encode_utf16().collect::<Vec<_>>(), umf_core::serialization::Format::Json, &mut Context::ordinary()).unwrap()
}

fn request(op: &str, fields: Vec<(&str, Value)>) -> String {
    let mut members = vec![
        (Utf16::from("op"), Value::string_utf8(op)),
        (Utf16::from("resources"), Value::Object(vec![
            (Utf16::from("coreSchema"), parse(include_str!("../../../spec/core/schema.json"))),
            (Utf16::from("referenceSchema"), parse(include_str!("../../../spec/core/semantic-type-reference.schema.json"))),
            (Utf16::from("packageSchema"), parse(include_str!("../../../spec/core/extension-package.schema.json"))),
            (Utf16::from("constraints"), parse(include_str!("../../../spec/metamodel/generated/core-constraints.json"))),
            (Utf16::from("domainPolicy"), parse(include_str!("../../../spec/metamodel/generated/domain-policy.json"))),
        ])),
    ];
    members.extend(fields.into_iter().map(|(key, value)| (Utf16::from(key), value)));
    umf_core_wire::encode(&Value::Object(members), &mut umf_core_wire::transport_context()).unwrap()
}

fn run(wire: &str, options: &[&str]) -> serde_json::Value {
    let mut child = Command::new(env!("CARGO_BIN_EXE_umf")).args(["csv-boolean-lexical", "--stdin-wire"]).args(options).env("PATH", "").stdin(Stdio::piped()).stdout(Stdio::piped()).spawn().unwrap();
    child.stdin.take().unwrap().write_all(wire.as_bytes()).unwrap();
    let output = child.wait_with_output().unwrap();
    assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
    serde_json::from_slice(&output.stdout).unwrap()
}

#[test]
fn cli_runs_only_the_public_validation_and_verification_pair() {
    let source = parse(include_str!("../../../spec/domain-packs/medical/ontology.json"));
    let csv_request = parse(r#"{"profile":"umf.csv-boolean-lexical/1.0.0","field":{"module":"domain","element":"patients.active"},"token":"True","sourceContext":{"source":"original.csv","row":1,"unknown":["雪",null]}}"#);
    let receipt = run(&request("model/validateCsvBooleanLexical", vec![("source", source.clone()), ("csvRequest", csv_request.clone())]), &[]);
    assert_eq!(receipt["status"], "ok", "{receipt}");
    let receipt_value = umf_core_wire::decode(receipt["wire"].as_str().unwrap(), &mut umf_core_wire::transport_context()).unwrap();
    let verified = run(&request("model/verifyCsvBooleanLexical", vec![("receipt", receipt_value), ("source", source), ("csvRequest", csv_request)]), &[]);
    assert_eq!(verified["status"], "ok", "{verified}");
}

#[test]
fn cli_enforces_surface_and_cooperative_controls() {
    let wire = request("model/prepareCsvBooleanLexicalVerification", vec![("receipt", parse("{}"))]);
    assert_eq!(run(&wire, &[])["code"], "REQUEST");
    let wire = request("model/validateCsvBooleanLexical", vec![("source", parse("{}")), ("csvRequest", parse("{}"))]);
    assert_eq!(run(&wire, &["--max-work", "0"])["code"], "RESOURCE_LIMIT");
    assert_eq!(run(&wire, &["--timeout-ms", "0"])["code"], "DEADLINE");
}

#[test]
fn cli_reports_its_narrow_profile() {
    let output = Command::new(env!("CARGO_BIN_EXE_umf")).args(["csv-boolean-lexical", "--capabilities"]).env("PATH", "").output().unwrap();
    assert!(output.status.success());
    let value: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(value["profile"], umf_core_wire::CSV_BOOLEAN_LEXICAL_BINDING_PROFILE);
    assert_eq!(value["operations"], serde_json::json!(["model/validateCsvBooleanLexical", "model/verifyCsvBooleanLexical"]));
}
