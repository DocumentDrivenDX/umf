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
        .args(["parquet-capture", "--stdin-wire"])
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
fn parquet_cli_captures_and_exports_exact_bytes_through_public_wire() {
    let source = "50415231ff00102050415231";
    let captured = run(
        &request(
            "parquet.capture",
            vec![
                ("bytes", Value::string_utf8(source)),
                ("id", Value::string_utf8("cli-parquet")),
            ],
        ),
        &[],
    );
    let document = decode(&captured);
    let exported = run(
        &request("parquet.export", vec![("document", document.clone())]),
        &[],
    );
    assert_eq!(decode(&exported), Value::string_utf8(source));
    let framing = run(
        &request("parquet.inspectFraming", vec![("document", document)]),
        &[],
    );
    let framing = decode(&framing);
    assert!(matches!(framing, Value::Object(_)));
}

#[test]
fn parquet_cli_reports_profile_and_enforces_host_controls() {
    let wire = request(
        "parquet.capture",
        vec![
            ("bytes", Value::string_utf8("")),
            ("id", Value::string_utf8("empty")),
        ],
    );
    assert_eq!(run(&wire, &["--max-work", "0"])["code"], "RESOURCE_LIMIT");
    assert_eq!(run(&wire, &["--timeout-ms", "0"])["code"], "DEADLINE");
    let version = Command::new(env!("CARGO_BIN_EXE_umf"))
        .args(["parquet-capture", "--version"])
        .env("PATH", "")
        .output()
        .unwrap();
    let version: serde_json::Value = serde_json::from_slice(&version.stdout).unwrap();
    assert_eq!(version["profile"], umf_core_wire::PARQUET_CAPTURE_PROFILE);
    let capabilities = Command::new(env!("CARGO_BIN_EXE_umf"))
        .args(["parquet-capture", "--capabilities"])
        .env("PATH", "")
        .output()
        .unwrap();
    let capabilities: serde_json::Value = serde_json::from_slice(&capabilities.stdout).unwrap();
    assert_eq!(capabilities["profile"], umf_core_wire::PARQUET_CAPTURE_PROFILE);
    assert_eq!(capabilities["maxSourceBytes"], 1_000_000);
    assert!(capabilities["operations"]
        .as_array()
        .unwrap()
        .iter()
        .any(|operation| operation == "parquet.inspectContainers"));
}

#[test]
fn parquet_cli_runs_metadata_views_and_schema_import_through_the_actual_binary() {
    let source = std::fs::read(
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../fixtures/parquet/logical/decimal32.parquet"),
    )
    .unwrap();
    let hex = source
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    let capture = run(
        &request(
            "parquet.capture",
            vec![
                ("bytes", Value::string_utf8(hex.clone())),
                ("id", Value::string_utf8("cli-metadata")),
            ],
        ),
        &[],
    );
    let document = decode(&capture);
    for (operation, expected) in [
        ("parquet.inspectLogicalTypes", "checked"),
        ("parquet.inspectContainers", "checked"),
    ] {
        let result = decode(&run(
            &request(operation, vec![("document", document.clone())]),
            &[],
        ));
        assert!(matches!(result, Value::Object(_)));
        let json_text = umf_core::serialization::write_json_value(
            &result,
            umf_core::serialization::Format::Json,
            &mut Context::ordinary(),
        )
        .unwrap()
        .to_utf8()
        .unwrap();
        let json: serde_json::Value = serde_json::from_str(&json_text).unwrap();
        assert_eq!(json["status"], expected);
    }
    let fields = decode(&run(
        &request(
            "parquet.getFieldMetadata",
            vec![("document", document.clone())],
        ),
        &[],
    ));
    assert!(matches!(fields, Value::Object(_)));
    let imported = decode(&run(
        &request(
            "parquet.importSchema",
            vec![
                ("bytes", Value::string_utf8(hex)),
                ("id", Value::string_utf8("cli-import")),
            ],
        ),
        &[],
    ));
    assert!(matches!(imported, Value::Object(_)));
}
