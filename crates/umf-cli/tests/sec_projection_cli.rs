use std::io::Write;
use std::process::{Command, Stdio};

fn frame(input: &[u16], source: &[u16]) -> Vec<u8> {
    let mut bytes = b"UMFSEC2\0".to_vec();
    bytes.extend_from_slice(&(input.len() as u32).to_le_bytes());
    for unit in input { bytes.extend_from_slice(&unit.to_le_bytes()); }
    bytes.extend_from_slice(&(source.len() as u32).to_le_bytes());
    for unit in source { bytes.extend_from_slice(&unit.to_le_bytes()); }
    bytes
}

fn run(operation: &str, request: &[u8]) -> std::process::Output {
    let mut child = Command::new(env!("CARGO_BIN_EXE_umf"))
        .args(["sec", operation, "--stdin-utf16le"])
        .stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().unwrap();
    child.stdin.take().unwrap().write_all(request).unwrap();
    child.wait_with_output().unwrap()
}

#[test]
fn binary_frame_runs_core_projection_and_preserves_surrogate_json() {
    let prefix = "{\"cik\":320193,\"facts\":{\"us-gaap\":{\"Cash\":{\"label\":\"\\ud800\",\"units\":{\"USD\":[{\"val\":9007199254740993.0100,\"accn\":\"A\"}]}}}}}";
    let input = prefix.encode_utf16().collect::<Vec<_>>();
    let output = run("company-facts", &frame(&input, &[b's' as u16, 0xd800]));
    assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
    let text = String::from_utf8(output.stdout).unwrap();
    assert!(text.contains("9007199254740993.0100"));
    assert!(text.contains("\\ud800"));
}

#[test]
fn malformed_frame_and_invalid_source_id_have_structured_refusals() {
    let malformed = run("submissions", b"UMFSEC2\0");
    assert!(!malformed.status.success());
    let envelope: serde_json::Value = serde_json::from_slice(&malformed.stderr).unwrap();
    assert_eq!(envelope["message"], "Invalid SEC UTF-16LE frame header");

    let input = "{\"cik\":1,\"facts\":{}}".encode_utf16().collect::<Vec<_>>();
    let invalid = run("company-facts", &frame(&input, &[]));
    assert!(!invalid.status.success());
    let envelope: serde_json::Value = serde_json::from_slice(&invalid.stderr).unwrap();
    assert_eq!(envelope["message"], "Invalid SEC source identity");
    assert_eq!(envelope["name"], "Error");

    let malformed_input = b"{".iter().map(|byte| *byte as u16).collect::<Vec<_>>();
    let malformed = run("company-facts", &frame(&malformed_input, &[]));
    let envelope: serde_json::Value = serde_json::from_slice(&malformed.stderr).unwrap();
    assert_eq!(envelope["name"], "UmfError");
    assert_ne!(envelope["message"], "Invalid SEC source identity");

    let non_object = "[]".encode_utf16().collect::<Vec<_>>();
    let root = run("company-facts", &frame(&non_object, &[]));
    let envelope: serde_json::Value = serde_json::from_slice(&root.stderr).unwrap();
    assert_eq!(envelope["message"], "Expected SEC object");
}

#[test]
fn overlong_source_id_preserves_parse_before_identity_order() {
    let source = vec![b's' as u16; 1_025];
    let malformed_input = b"{".iter().map(|x| *x as u16).collect::<Vec<_>>();
    let malformed = run("company-facts", &frame(&malformed_input, &source));
    let envelope: serde_json::Value = serde_json::from_slice(&malformed.stderr).unwrap();
    assert_eq!(envelope["name"], "UmfError");
    assert_ne!(envelope["message"], "Invalid SEC source identity");

    let valid_input = "{\"cik\":1,\"facts\":{}}".encode_utf16().collect::<Vec<_>>();
    let invalid = run("company-facts", &frame(&valid_input, &source));
    let envelope: serde_json::Value = serde_json::from_slice(&invalid.stderr).unwrap();
    assert_eq!(envelope["name"], "Error");
    assert_eq!(envelope["code"], serde_json::Value::Null);
    assert_eq!(envelope["message"], "Invalid SEC source identity");
}

#[test]
fn cli_exposes_projection_profile_metadata() {
    let output = Command::new(env!("CARGO_BIN_EXE_umf")).args(["sec", "--capabilities"]).output().unwrap();
    assert!(output.status.success());
    let value: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(value["profile"], "umf.sec-projection/2.0.0");
    assert_eq!(value["inputFormat"], "UMFSEC2-UTF16LE/1");
}
