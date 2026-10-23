// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::{protobuf_inspect::inspect_protobuf_document, Context, EngineError, Severity, Utf16, Value};

fn object(fields: Vec<(&str, Value)>) -> Value {
    object_utf16(fields.into_iter().map(|(key, value)| (Utf16::from(key), value)).collect())
}

fn object_utf16(fields: Vec<(Utf16, Value)>) -> Value {
    Value::Object(fields)
}

fn node(fields: Vec<(&str, Value)>, unknown: Vec<Value>) -> Value {
    object(vec![
        ("type", Value::string_utf8("google.protobuf.FileDescriptorSet")),
        ("fields", object(fields)),
        ("unknown", Value::Array(unknown)),
    ])
}

fn document(descriptor: Value, payload_extras: Vec<(&str, Value)>) -> Value {
    let mut payload = vec![
        ("descriptorProfile", Value::string_utf8("protobuf-es-2.15.0")),
        ("descriptorSet", descriptor),
    ];
    payload.extend(payload_extras);
    document_with_payload(object(payload))
}

fn document_with_payload(payload: Value) -> Value {
    object(vec![
        ("umf", Value::string_utf8("0.10.0")),
        ("id", Value::string_utf8("inspect")),
        ("vocabularies", object(vec![("umf.protobuf", object(vec![("version", Value::string_utf8("0.1.0"))]))])),
        ("modules", Value::Array(vec![object(vec![
            ("id", Value::string_utf8("schema")),
            ("namespace", Value::string_utf8("")),
            ("elements", Value::Array(vec![object(vec![
                ("id", Value::string_utf8("schema")),
                ("extensions", object(vec![("umf.protobuf", payload)])),
            ])])),
        ])])),
    ])
}

fn unknown(number: u32, wire_type: u32, data: &str) -> Value {
    object(vec![
        ("number", Value::Number(number as f64)),
        ("wireType", Value::Number(wire_type as f64)),
        ("data", Value::string_utf8(data)),
    ])
}

#[test]
fn preserves_unknown_wire_findings_and_compiler_incompleteness_in_order() {
    let input = document(node(vec![], vec![unknown(50_000, 2, "04000102ff")]), vec![]);
    let result = inspect_protobuf_document(&input, &mut Context::ordinary()).unwrap();
    assert!(result.valid);
    assert!(!result.complete);
    assert_eq!(result.diagnostics.len(), 2);
    assert_eq!(result.diagnostics[0].code, Utf16::from("PROTOBUF_UNKNOWN"));
    assert_eq!(result.diagnostics[0].path, Utf16::from("/descriptorSet/unknown"));
    assert_eq!(result.diagnostics[1].code, Utf16::from("PROTOBUF_COMPILER_REQUIRED"));
    assert_eq!(result.diagnostics[1].message, Utf16::from("Browser descriptor checks do not certify native compiler validity; validate emitted artifacts with the pinned native compiler"));
    assert!(result.diagnostics.iter().all(|diagnostic| diagnostic.severity == Severity::Warning));
    assert_eq!(input, document(node(vec![], vec![unknown(50_000, 2, "04000102ff")]), vec![]));
}

#[test]
fn payload_representation_findings_precede_unknown_wire_findings() {
    let input = document(node(vec![], vec![unknown(50_000, 0, "01")]), vec![("future", Value::Bool(true))]);
    let result = inspect_protobuf_document(&input, &mut Context::ordinary()).unwrap();
    assert_eq!(result.diagnostics[0].code, Utf16::from("PROTOBUF_REPRESENTATION"));
    assert_eq!(result.diagnostics[0].path, Utf16::from("/future"));
    assert_eq!(result.diagnostics[1].code, Utf16::from("PROTOBUF_UNKNOWN"));
    assert_eq!(result.diagnostics[2].code, Utf16::from("PROTOBUF_COMPILER_REQUIRED"));
}

#[test]
fn file_registry_failures_are_warnings_and_do_not_claim_compiler_validity() {
    let file = object(vec![
        ("type", Value::string_utf8("google.protobuf.FileDescriptorProto")),
        ("fields", object(vec![])),
        ("unknown", Value::Array(vec![])),
    ]);
    let input = document(node(vec![("file", Value::Array(vec![file]))], vec![]), vec![]);
    let result = inspect_protobuf_document(&input, &mut Context::ordinary()).unwrap();
    assert_eq!(result.diagnostics[0].code, Utf16::from("PROTOBUF_INTERPRETATION"));
    assert_eq!(result.diagnostics[1].code, Utf16::from("PROTOBUF_COMPILER_REQUIRED"));
    assert!(!result.complete);
}

#[test]
fn malformed_source_archive_is_explicitly_rejected() {
    let input = document(node(vec![], vec![]), vec![("sourceArchive", Value::Null)]);
    let result = inspect_protobuf_document(&input, &mut Context::ordinary()).unwrap();
    assert!(result.diagnostics.iter().any(|diagnostic| diagnostic.code == Utf16::from("PROTOBUF_REPRESENTATION") && diagnostic.severity == Severity::Error));
    assert!(!result.valid);
}

#[test]
fn malformed_descriptor_tree_is_an_error_not_a_compiler_warning_only() {
    let input = document(node(vec![("future_field", Value::Bool(true))], vec![]), vec![]);
    let result = inspect_protobuf_document(&input, &mut Context::ordinary()).unwrap();
    assert!(!result.valid);
    assert_eq!(result.diagnostics[0].code, Utf16::from("PROTOBUF_DESCRIPTOR"));
    assert_eq!(result.diagnostics.last().unwrap().code, Utf16::from("PROTOBUF_COMPILER_REQUIRED"));
}

#[test]
fn registry_work_meter_failure_remains_a_control_error() {
    let file = object(vec![
        ("type", Value::string_utf8("google.protobuf.FileDescriptorProto")),
        ("fields", object(vec![("name", Value::string_utf8("example.proto"))])),
        ("unknown", Value::Array(vec![])),
    ]);
    let input = document(node(vec![("file", Value::Array(vec![file]))], vec![]), vec![]);
    let mut admitted_work = 0;
    {
        let mut meter = |amount| { admitted_work += amount; Ok(()) };
        let mut context = Context::ordinary().with_meter(&mut meter);
        inspect_protobuf_document(&input, &mut context).unwrap();
    }
    let mut observed_work = 0;
    let mut meter = |amount| {
        observed_work += amount;
        if observed_work >= admitted_work {
            Err(EngineError::new("HOST_BUDGET", Utf16::default(), "Meter stopped"))
        } else {
            Ok(())
        }
    };
    let mut context = Context::ordinary().with_meter(&mut meter);
    let problem = inspect_protobuf_document(&input, &mut context).unwrap_err();
    assert_eq!(problem.code, "HOST_BUDGET");
}

#[test]
fn lone_surrogate_payload_and_archive_keys_keep_exact_utf16_paths() {
    let surrogate = Utf16::new(vec![0xd800]);
    let payload = object_utf16(vec![
        (Utf16::from("descriptorProfile"), Value::string_utf8("protobuf-es-2.15.0")),
        (Utf16::from("descriptorSet"), node(vec![], vec![])),
        (surrogate.clone(), Value::Bool(true)),
    ]);
    let result = inspect_protobuf_document(&document_with_payload(payload), &mut Context::ordinary()).unwrap();
    assert_eq!(result.diagnostics[0].path, Utf16::new(vec![b'/' as u16, 0xd800]));

    let archive = object_utf16(vec![
        (Utf16::from("role"), Value::string_utf8("original")),
        (Utf16::from("compiler"), Value::string_utf8("test-compiler")),
        (Utf16::from("files"), object(vec![("root.proto", Value::string_utf8("syntax = 'proto3';"))])),
        (Utf16::from("roots"), Value::Array(vec![Value::string_utf8("root.proto")])),
        (surrogate.clone(), Value::Bool(true)),
    ]);
    let result = inspect_protobuf_document(&document(node(vec![], vec![]), vec![("sourceArchive", archive)]), &mut Context::ordinary()).unwrap();
    let diagnostic = result.diagnostics.iter().find(|item| item.code == Utf16::from("PROTOBUF_REPRESENTATION")).unwrap();
    let prefix = "/modules/0/elements/0/extensions/umf.protobuf/sourceArchive/";
    let mut expected: Vec<u16> = prefix.encode_utf16().collect();
    expected.push(0xd800);
    assert_eq!(diagnostic.path.units(), expected);
}

#[test]
fn source_archive_accepts_nonempty_lone_surrogate_compiler_identity() {
    let compiler = Utf16::new(vec![b'c' as u16, 0xd800]);
    let archive = object_utf16(vec![
        (Utf16::from("role"), Value::string_utf8("original")),
        (Utf16::from("compiler"), Value::String(compiler)),
        (Utf16::from("files"), object(vec![("root.proto", Value::string_utf8("syntax = 'proto3';"))])),
        (Utf16::from("roots"), Value::Array(vec![Value::string_utf8("root.proto")])),
    ]);
    let result = inspect_protobuf_document(&document(node(vec![], vec![]), vec![("sourceArchive", archive)]), &mut Context::ordinary()).unwrap();
    assert!(result.valid);
    assert!(!result.complete);
    assert_eq!(result.diagnostics.last().unwrap().code, Utf16::from("PROTOBUF_COMPILER_REQUIRED"));
}

#[test]
fn lone_surrogate_descriptor_field_key_keeps_unknown_diagnostic_path() {
    let surrogate = Utf16::new(vec![0xd800]);
    let child = node(vec![], vec![unknown(50_000, 0, "01")]);
    let descriptor = node(vec![("file", Value::Array(vec![object(vec![
        ("type", Value::string_utf8("google.protobuf.FileDescriptorProto")),
        ("fields", object_utf16(vec![(surrogate, child)])),
        ("unknown", Value::Array(vec![])),
    ])]))], vec![]);
    let result = inspect_protobuf_document(&document(descriptor, vec![]), &mut Context::ordinary()).unwrap();
    let diagnostic = result.diagnostics.iter().find(|item| item.code == Utf16::from("PROTOBUF_UNKNOWN")).unwrap();
    let prefix = "/descriptorSet/fields/file/fields/";
    let mut expected: Vec<u16> = prefix.encode_utf16().collect();
    expected.extend([0xd800, b'/' as u16, b'u' as u16, b'n' as u16, b'k' as u16, b'n' as u16, b'o' as u16, b'w' as u16, b'n' as u16]);
    assert_eq!(diagnostic.path.units(), expected);
}
