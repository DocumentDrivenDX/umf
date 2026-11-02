#![cfg(feature = "embedded-adapters")]
// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::{Context, EngineError, Utf16, Value};

fn object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(key, value)| (Utf16::from(key), value))
            .collect(),
    )
}

fn descriptor(fields: Vec<(&str, Value)>, unknown: Vec<Value>) -> Value {
    object(vec![
        ("type", Value::string_utf8("google.protobuf.FileDescriptorSet")),
        ("fields", object(fields)),
        ("unknown", Value::Array(unknown)),
    ])
}

fn request(op: &str, rest: Vec<(&str, Value)>) -> String {
    let mut fields = vec![("op", Value::string_utf8(op))];
    fields.extend(rest);
    umf_core_wire::encode(&object(fields), &mut Context::ordinary()).unwrap()
}

fn run(op: &str, rest: Vec<(&str, Value)>, bytes: &[u8]) -> (serde_json::Value, Vec<u8>) {
    let request = request(op, rest);
    let response = umf_core_wire::protobuf_document::execute(
        &request,
        bytes,
        &mut |_amount| Ok(()),
    );
    (serde_json::from_str(&response.wire_envelope).unwrap(), response.binary)
}

fn output(envelope: &serde_json::Value) -> Value {
    assert_eq!(envelope["status"], "ok", "{envelope}");
    umf_core_wire::decode(envelope["wire"].as_str().unwrap(), &mut Context::ordinary()).unwrap()
}

fn text(value: &Value, name: &str) -> String {
    let Value::Object(fields) = value else { panic!("object expected") };
    let Value::String(value) = &fields.iter().find(|(key, _)| key == &Utf16::from(name)).unwrap().1 else { panic!("string expected") };
    value.to_utf8().unwrap()
}

fn member<'a>(value: &'a Value, name: &str) -> &'a Value {
    let Value::Object(fields) = value else { panic!("object expected") };
    &fields.iter().find(|(key, _)| key == &Utf16::from(name)).unwrap().1
}

#[test]
fn packet_composes_read_write_import_get_export_bundle_inspect() {
    let empty = descriptor(vec![], vec![]);
    let (read, no_bytes) = run("protobuf.descriptor.read", vec![], &[]);
    assert!(no_bytes.is_empty());
    assert_eq!(output(&read), empty);

    let (write, bytes) = run("protobuf.descriptor.write", vec![("descriptorSet", empty.clone())], &[]);
    assert_eq!(output(&write), Value::Null);
    assert!(bytes.is_empty());

    let (imported, no_bytes) = run(
        "protobuf.document.import",
        vec![("id", Value::string_utf8("r8-protobuf"))],
        &[],
    );
    assert!(no_bytes.is_empty());
    let document = output(&imported);
    assert_eq!(text(&document, "id"), "r8-protobuf");

    let (got, no_bytes) = run("protobuf.document.get", vec![("document", document.clone())], &[]);
    assert!(no_bytes.is_empty());
    assert_eq!(output(&got), empty);

    let (exported, bytes) = run("protobuf.document.export", vec![("document", document.clone())], &[]);
    assert_eq!(output(&exported), Value::Null);
    assert!(bytes.is_empty());

    let (bundle, bytes) = run("protobuf.document.bundle", vec![("document", document.clone())], &[]);
    assert!(bytes.is_empty());
    let bundle = output(&bundle);
    assert!(matches!(member(&bundle, "source"), Value::Object(_)));
    let Value::Array(bundle_diagnostics) = member(&bundle, "diagnostics") else { panic!("array expected") };
    assert_eq!(bundle_diagnostics.len(), 2);

    let (inspection, no_bytes) = run("protobuf.document.inspect", vec![("document", document)], &[]);
    assert!(no_bytes.is_empty());
    let inspection = output(&inspection);
    assert_eq!(member(&inspection, "valid"), &Value::Bool(true));
    assert_eq!(member(&inspection, "complete"), &Value::Bool(false));
}

#[test]
fn packet_preserves_unknown_raw_wire_bytes_and_refuses_malformed_binary() {
    let bytes = [0x82, 0xb5, 0x18, 0x04, 0x00, 0x01, 0x02, 0xff];
    let (imported, _) = run(
        "protobuf.document.import",
        vec![("id", Value::string_utf8("unknown-wire"))],
        &bytes,
    );
    let document = output(&imported);
    let (exported, roundtrip) = run("protobuf.document.export", vec![("document", document)], &[]);
    assert_eq!(output(&exported), Value::Null);
    assert_eq!(roundtrip, bytes);

    let malformed = [0x82, 0xb5, 0x18, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x00];
    let (error, output) = run(
        "protobuf.document.import",
        vec![("id", Value::string_utf8("bad"))],
        &malformed,
    );
    assert!(output.is_empty());
    assert_eq!(error["status"], "error");
    assert_eq!(error["code"], "PROTOBUF_BINARY");
}

#[test]
fn packet_control_failure_is_shared_and_does_not_return_partial_bytes() {
    let request = request(
        "protobuf.descriptor.write",
        vec![("descriptorSet", descriptor(vec![], vec![]))],
    );
    let response = umf_core_wire::protobuf_document::execute(&request, &[], &mut |_amount| {
        Err(EngineError::new("METER_FAILURE", Utf16::default(), "injected"))
    });
    let envelope: serde_json::Value = serde_json::from_str(&response.wire_envelope).unwrap();
    assert_eq!(envelope["status"], "error");
    assert_eq!(envelope["code"], "METER_FAILURE");
    assert!(response.binary.is_empty());
}

#[test]
fn packet_accepts_the_contract_binary_ceiling_through_raw_bytes() {
    fn varint(mut value: usize, output: &mut Vec<u8>) {
        while value > 0x7f {
            output.push((value as u8 & 0x7f) | 0x80);
            value >>= 7;
        }
        output.push(value as u8);
    }
    let mut bytes = Vec::with_capacity(4_000_000);
    varint(50_000 * 8 + 2, &mut bytes);
    varint(3_999_993, &mut bytes);
    bytes.resize(4_000_000, 0);
    assert_eq!(bytes.len(), 4_000_000);

    let request = request("protobuf.descriptor.read", vec![]);
    let response = umf_core_wire::protobuf_document::execute(
        &request,
        &bytes,
        &mut |_amount| Ok(()),
    );
    assert!(response.wire_envelope.contains("\"status\":\"ok\""));
    assert!(response.binary.is_empty());
}

#[test]
fn packet_refuses_over_limit_binary_and_malformed_request_before_binary_admission() {
    let request = request("protobuf.descriptor.read", vec![]);
    let too_large = vec![0; 4_000_001];
    let response = umf_core_wire::protobuf_document::execute(
        &request,
        &too_large,
        &mut |_amount| Ok(()),
    );
    let error: serde_json::Value = serde_json::from_str(&response.wire_envelope).unwrap();
    assert_eq!(error["status"], "error");
    assert_eq!(error["code"], "LIMIT");
    assert!(response.binary.is_empty());

    let malformed_request = umf_core_wire::protobuf_document::execute(
        "{",
        &too_large,
        &mut |_amount| Ok(()),
    );
    let error: serde_json::Value = serde_json::from_str(&malformed_request.wire_envelope).unwrap();
    assert_eq!(error["status"], "error");
    assert_eq!(error["code"], "WIRE_FORMAT");
    assert!(malformed_request.binary.is_empty());
}
