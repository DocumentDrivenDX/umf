#![cfg(feature = "embedded-adapters")]
// SPDX-License-Identifier: MIT OR Apache-2.0
use std::{
    fs,
    path::{Path, PathBuf},
    process::{Command, Output, Stdio},
    time::{SystemTime, UNIX_EPOCH},
};

use sha2::Digest;
use umf_core::{Context, Value};

const MAX_INPUT: usize = 4_000_000;
const PROFILE: &str = "umf.protobuf-descriptor-read-cli/0.1.0";

struct TempInput(PathBuf);

impl TempInput {
    fn new(label: &str) -> Self {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        Self(std::env::temp_dir().join(format!(
            "umf-protobuf-read-{label}-{}-{unique}",
            std::process::id()
        )))
    }

    fn write(&self, bytes: &[u8]) {
        fs::write(&self.0, bytes).unwrap();
    }

    fn path(&self) -> &Path {
        &self.0
    }
}

impl Drop for TempInput {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.0);
    }
}

fn run(args: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_umf"))
        .args(args)
        .env("PATH", "")
        .output()
        .unwrap()
}

fn read(path: &Path, options: &[&str]) -> Output {
    let path = path.to_str().expect("test temp path is UTF-8");
    let mut child = Command::new(env!("CARGO_BIN_EXE_umf"))
        .args(["protobuf", "descriptor", "read", "--input", path])
        .args(options)
        .env("PATH", "")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    drop(child.stdin.take());
    child.wait_with_output().unwrap()
}

fn envelope(output: &Output) -> serde_json::Value {
    assert!(
        output.status.success(),
        "status={:?}, stderr={}",
        output.status.code(),
        String::from_utf8_lossy(&output.stderr)
    );
    serde_json::from_slice(&output.stdout).unwrap()
}

fn assert_wire_sha(output: &Output, expected_sha256: &str) {
    let response = envelope(output);
    assert_eq!(response["profile"], "umf.core-wire/1");
    assert_eq!(response["status"], "ok");
    let wire = response["wire"].as_str().unwrap();
    assert_eq!(
        format!("{:x}", sha2::Sha256::digest(wire.as_bytes())),
        expected_sha256
    );
    assert!(matches!(
        umf_core_wire::decode(wire, &mut Context::ordinary()),
        Ok(Value::Object(_))
    ));
}

#[test]
fn descriptor_read_declares_only_its_versioned_operation() {
    let version = envelope(&run(&["protobuf", "descriptor", "read", "--version"]));
    assert_eq!(version["profile"], PROFILE);

    let capabilities = envelope(&run(&["protobuf", "descriptor", "read", "--capabilities"]));
    assert_eq!(capabilities["profile"], PROFILE);
    assert_eq!(
        capabilities["operations"],
        serde_json::json!(["protobuf.descriptor.read"])
    );
    assert_eq!(capabilities["maxInputBytes"], MAX_INPUT);
    assert_eq!(capabilities["resourceProfile"], "cooperative");
}

#[test]
fn descriptor_read_matches_frozen_predecessor_tree_vectors() {
    let authored =
        Path::new(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/protobuf/authored.pb");
    assert_wire_sha(
        &read(&authored, &[]),
        "1e92b38c3e999a518b40b22c6bd82b71176df0076de94931c1a23483eef610f3",
    );

    let empty = TempInput::new("empty");
    empty.write(&[]);
    assert_wire_sha(
        &read(empty.path(), &[]),
        "af32dac7ee864dcae1ac1997f4ad54e8662a3906e804ea30fe33a4539fe9ae0d",
    );

    let unknown = TempInput::new("unknown");
    unknown.write(&[0x82, 0xb5, 0x18, 0x04, 0x00, 0x01, 0x02, 0xff]);
    assert_wire_sha(
        &read(unknown.path(), &[]),
        "c6822d89c7b5923c307e841c1ff7948b148c5fdb0f98d787437598df76de7c31",
    );
}

#[test]
fn descriptor_read_preserves_malformed_wire_error_and_4m_boundary() {
    let malformed = TempInput::new("malformed");
    malformed.write(&[0x00]);
    let response = envelope(&read(malformed.path(), &[]));
    assert_eq!(response["status"], "error");
    assert_eq!(response["code"], "PROTOBUF_BINARY");

    let exactly_at_limit = TempInput::new("max");
    let mut bytes = Vec::with_capacity(MAX_INPUT);
    bytes.extend_from_slice(&[0x82, 0xb5, 0x18]); // unknown field 50000, length-delimited
    bytes.extend_from_slice(&[0xf9, 0x91, 0xf4, 0x01]); // length 3,999,993
    bytes.resize(MAX_INPUT, 0);
    assert_eq!(bytes.len(), MAX_INPUT);
    exactly_at_limit.write(&bytes);
    let at_limit = envelope(&read(exactly_at_limit.path(), &[]));
    assert_eq!(at_limit["status"], "ok");

    let over_limit = TempInput::new("over");
    let file = fs::File::create(over_limit.path()).unwrap();
    file.set_len((MAX_INPUT + 1) as u64).unwrap();
    let over = envelope(&read(over_limit.path(), &[]));
    assert_eq!(over["status"], "error");
    assert_eq!(over["code"], "LIMIT");
    assert_eq!(
        over["messageUnits"],
        serde_json::json!("Descriptor input exceeds limit"
            .encode_utf16()
            .collect::<Vec<_>>())
    );
}

#[test]
fn descriptor_read_controls_and_path_errors_have_stable_order() {
    let empty = TempInput::new("controls");
    empty.write(&[]);
    assert_eq!(
        envelope(&read(empty.path(), &["--max-work", "0"]))["code"],
        "RESOURCE_LIMIT"
    );
    assert_eq!(
        envelope(&read(empty.path(), &["--timeout-ms", "0"]))["code"],
        "DEADLINE"
    );

    let missing = TempInput::new("missing");
    let missing_path = missing.path().to_str().unwrap();
    let output = Command::new(env!("CARGO_BIN_EXE_umf"))
        .args([
            "protobuf",
            "descriptor",
            "read",
            "--input",
            missing_path,
            "--max-work",
            "0",
        ])
        .env("PATH", "")
        .output()
        .unwrap();
    assert_eq!(output.status.code(), Some(2));
    assert!(output.stdout.is_empty());
    assert!(!output.stderr.is_empty());
}
