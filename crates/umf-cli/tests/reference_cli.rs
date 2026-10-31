// SPDX-License-Identifier: MIT OR Apache-2.0
use sha2::{Digest, Sha256};
use std::io::Write;
use std::process::{Command, Stdio};
use umf_core::serialization::{read_json_value, stringify_compact, Format};
use umf_core::{Context, Utf16, Value};

const SOURCE: &[u8] = include_bytes!(
    "../../../tests/rust-core/fixtures/r7-self-model-admission/frozen/umf.yaml"
);
const MANIFEST: &str = include_str!("../../../tests/rust-core/fixtures/r7-self-model-admission/frozen/manifest.json");
const CATALOG: &str = include_str!("../../../tests/rust-core/fixtures/r7-self-model-admission/frozen/catalog.canonical.json");

fn parse_json(source: &str) -> Value {
    read_json_value(
        &source.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        &mut Context::catalog(),
    )
    .unwrap()
}
fn sorted(value: &Value) -> Value {
    match value {
        Value::Array(items) => Value::Array(items.iter().map(sorted).collect()),
        Value::Object(items) => {
            let mut items = items
                .iter()
                .map(|(key, value)| (key.clone(), sorted(value)))
                .collect::<Vec<_>>();
            items.sort_by(|a, b| a.0.cmp(&b.0));
            Value::Object(items)
        }
        other => other.clone(),
    }
}
fn canonical(value: &Value) -> String {
    stringify_compact(&sorted(value))
        .unwrap()
        .to_utf8()
        .unwrap()
}

fn run_cli(source: &str, manifest: Value) -> std::process::Output {
    let request = Value::Object(vec![
        (Utf16::from("source"), Value::string_utf8(source)),
        (Utf16::from("manifest"), manifest),
    ]);
    let input = umf_core_wire::encode(&request, &mut Context::catalog()).unwrap();
    let executable =
        std::env::var_os("UMF_REFERENCE_CLI").unwrap_or_else(|| env!("CARGO_BIN_EXE_umf").into());
    let mut child = Command::new(executable)
        .args(["reference", "self-model-check", "--stdin-wire"])
        .env("PATH", "")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    // A request-limit test intentionally causes the child to stop reading early.
    let _ = child.stdin.take().unwrap().write_all(input.as_bytes());
    child.wait_with_output().unwrap()
}

fn manifest() -> Value {
    parse_json(MANIFEST)
}

fn set(object: &mut Value, key: &str, value: Value) {
    let Value::Object(entries) = object else {
        panic!("expected object")
    };
    let (_, slot) = entries
        .iter_mut()
        .find(|(name, _)| name == &Utf16::from(key))
        .unwrap();
    *slot = value;
}

fn set_nested(object: &mut Value, container: &str, key: &str, value: Value) {
    let Value::Object(entries) = object else {
        panic!("expected object")
    };
    let (_, nested) = entries
        .iter_mut()
        .find(|(name, _)| name == &Utf16::from(container))
        .unwrap();
    set(nested, key, value);
}

fn get<'a>(object: &'a Value, key: &str) -> &'a Value {
    let Value::Object(entries) = object else {
        panic!("expected object")
    };
    entries
        .iter()
        .find(|(name, _)| name == &Utf16::from(key))
        .map(|(_, value)| value)
        .unwrap()
}

#[test]
fn self_model_check_cli_matches_frozen_catalog() {
    let source = std::str::from_utf8(SOURCE).unwrap();
    let output = run_cli(source, manifest());
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let catalog = umf_core_wire::decode(
        String::from_utf8(output.stdout).unwrap().trim(),
        &mut Context::catalog(),
    )
    .unwrap();
    assert_eq!(canonical(&catalog), CATALOG.trim());
}

#[test]
fn self_model_cli_checks_source_identity_before_stale_provenance() {
    let source = std::str::from_utf8(SOURCE)
        .unwrap()
        .replace("0.10.0", "0.10.1");
    let output = run_cli(&source, manifest());
    assert!(!output.status.success());
    assert!(String::from_utf8_lossy(&output.stderr)
        .contains("SELF_MODEL_SOURCE unexpected authored metamodel identity"));
}

#[test]
fn self_model_cli_admits_an_independent_temporary_source_fixture() {
    let source = format!(
        "{}\n# isolated fixture\n",
        std::str::from_utf8(SOURCE).unwrap()
    );
    let digest = format!("{:x}", Sha256::digest(source.as_bytes()));
    let mut input_manifest = manifest();
    set_nested(
        &mut input_manifest,
        "sources",
        "spec/metamodel/umf.yaml",
        Value::string_utf8(&digest),
    );
    set_nested(
        &mut input_manifest,
        "provenance",
        "modelSha256",
        Value::string_utf8(&digest),
    );

    let output = run_cli(&source, input_manifest);
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let catalog = umf_core_wire::decode(
        String::from_utf8(output.stdout).unwrap().trim(),
        &mut Context::catalog(),
    )
    .unwrap();
    let frozen = parse_json(CATALOG);
    assert_eq!(
        canonical(get(&catalog, "document")),
        canonical(get(&frozen, "document"))
    );
    let Value::Array(sources) = get(&catalog, "sources") else {
        panic!("expected sources array")
    };
    assert_eq!(get(&sources[0], "sha256"), &Value::string_utf8(&digest));
    assert_eq!(
        get(&sources[0], "bytes"),
        &Value::Number(source.len() as f64)
    );
}

#[test]
fn self_model_cli_reports_stale_provenance_for_current_identity() {
    let source = format!("{}\n", std::str::from_utf8(SOURCE).unwrap());
    let output = run_cli(&source, manifest());
    assert!(!output.status.success());
    assert!(String::from_utf8_lossy(&output.stderr)
        .contains("SELF_MODEL_PROVENANCE authored model/compiler manifest mismatch"));
}

#[test]
fn self_model_cli_rejects_request_above_32_mib() {
    let source = " ".repeat(32 * 1024 * 1024);
    let output = run_cli(&source, manifest());
    assert!(!output.status.success());
    assert!(String::from_utf8_lossy(&output.stderr)
        .contains("request exceeds the 33554432-byte transport limit"));
}
