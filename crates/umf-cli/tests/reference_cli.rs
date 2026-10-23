// SPDX-License-Identifier: MIT OR Apache-2.0
use std::io::Write;
use std::process::{Command, Stdio};
use umf_core::serialization::{read_json_value, stringify_compact, Format};
use umf_core::{Context, Utf16, Value};

const SOURCE: &[u8] = include_bytes!(
    "../../../docs/helix/04-build/evidence/rust-migration/r7-self-model-admission/frozen/umf.yaml"
);
const MANIFEST: &str = include_str!("../../../docs/helix/04-build/evidence/rust-migration/r7-self-model-admission/frozen/manifest.json");
const CATALOG: &str = include_str!("../../../docs/helix/04-build/evidence/rust-migration/r7-self-model-admission/frozen/catalog.canonical.json");

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

#[test]
fn self_model_check_cli_matches_frozen_catalog() {
    let source = std::str::from_utf8(SOURCE).unwrap();
    let manifest = parse_json(MANIFEST);
    let request = Value::Object(vec![
        (Utf16::from("source"), Value::string_utf8(source)),
        (Utf16::from("manifest"), manifest),
    ]);
    let input = umf_core_wire::encode(&request, &mut Context::catalog()).unwrap();
    let executable = std::env::var_os("UMF_REFERENCE_CLI")
        .unwrap_or_else(|| env!("CARGO_BIN_EXE_umf").into());
    let mut child = Command::new(executable)
        .args(["reference", "self-model-check", "--stdin-wire"])
        .env("PATH", "")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();
    child
        .stdin
        .take()
        .unwrap()
        .write_all(input.as_bytes())
        .unwrap();
    let output = child.wait_with_output().unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let output = String::from_utf8(output.stdout).unwrap();
    let catalog = umf_core_wire::decode(output.trim(), &mut Context::catalog()).unwrap();
    assert_eq!(canonical(&catalog), CATALOG.trim());
}
