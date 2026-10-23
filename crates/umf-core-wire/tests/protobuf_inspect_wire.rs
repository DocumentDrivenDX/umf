// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::{Context, EngineError, Severity, Utf16, Value};

fn object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(fields.into_iter().map(|(key, value)| (Utf16::from(key), value)).collect())
}

fn node(fields: Vec<(&str, Value)>, unknown: Vec<Value>) -> Value {
    object(vec![
        ("type", Value::string_utf8("google.protobuf.FileDescriptorSet")),
        ("fields", object(fields)),
        ("unknown", Value::Array(unknown)),
    ])
}

fn document(descriptor: Value) -> Value {
    let payload = object(vec![
        ("descriptorProfile", Value::string_utf8("protobuf-es-2.15.0")),
        ("descriptorSet", descriptor),
    ]);
    let element = object(vec![
        ("id", Value::string_utf8("schema")),
        ("extensions", object(vec![("umf.protobuf", payload)])),
    ]);
    let module = object(vec![
        ("id", Value::string_utf8("schema")),
        ("namespace", Value::string_utf8("")),
        ("elements", Value::Array(vec![element])),
    ]);
    object(vec![
        ("umf", Value::string_utf8("0.10.0")),
        ("id", Value::string_utf8("inspect")),
        ("vocabularies", object(vec![("umf.protobuf", object(vec![("version", Value::string_utf8("0.1.0"))]))])),
        ("modules", Value::Array(vec![module])),
    ])
}

fn request(document: Value) -> String {
    umf_core_wire::encode(&object(vec![
        ("op", Value::string_utf8("protobuf.descriptor.inspect")),
        ("document", document),
    ]), &mut Context::ordinary()).unwrap()
}

fn run(wire: &str) -> serde_json::Value {
    serde_json::from_str(&umf_core_wire::execute_protobuf_inspect_wire(wire)).unwrap()
}

fn output(envelope: &serde_json::Value) -> Value {
    umf_core_wire::decode(envelope["wire"].as_str().unwrap(), &mut Context::ordinary()).unwrap()
}

fn text_field(value: &Value, name: &str) -> String {
    let Value::Object(fields) = value else { panic!("object expected") };
    let Value::String(text) = &fields.iter().find(|(key, _)| key == &Utf16::from(name)).unwrap().1 else { panic!("text expected") };
    text.to_utf8().unwrap()
}

fn validation_value(validation: umf_core::Validation) -> Value {
    Value::Object(vec![
        (Utf16::from("valid"), Value::Bool(validation.valid)),
        (Utf16::from("complete"), Value::Bool(validation.complete)),
        (Utf16::from("diagnostics"), Value::Array(validation.diagnostics.into_iter().map(|item| {
            Value::Object(vec![
                (Utf16::from("code"), Value::String(item.code)),
                (Utf16::from("path"), Value::String(item.path)),
                (Utf16::from("message"), Value::String(item.message)),
                (Utf16::from("severity"), Value::string_utf8(if item.severity == Severity::Warning { "warning" } else { "error" })),
            ])
        }).collect())),
    ])
}

fn measure(work: impl FnOnce(&mut Context<'_>) -> Result<(), EngineError>) -> usize {
    let mut total = 0usize;
    let mut meter = |amount: usize| { total += amount; Ok(()) };
    let mut context = Context::ordinary().with_host_control(&mut meter);
    work(&mut context).unwrap();
    total
}

#[test]
fn wire_inspection_reports_unknown_native_wire_and_compiler_requirement() {
    let unknown = object(vec![
        ("number", Value::Number(50000.0)),
        ("wireType", Value::Number(2.0)),
        ("data", Value::string_utf8("04000102ff")),
    ]);
    let envelope = run(&request(document(node(vec![], vec![unknown]))));
    assert_eq!(envelope["profile"], "umf.core-wire/1");
    assert_eq!(envelope["status"], "ok");
    let result = output(&envelope);
    let Value::Object(fields) = result else { panic!("validation object expected") };
    let diagnostics = fields.iter().find(|(key, _)| key == &Utf16::from("diagnostics")).unwrap();
    let Value::Array(diagnostics) = &diagnostics.1 else { panic!("diagnostics array expected") };
    assert_eq!(diagnostics.len(), 2);
    assert_eq!(text_field(&diagnostics[0], "code"), "PROTOBUF_UNKNOWN");
    assert_eq!(text_field(&diagnostics[1], "code"), "PROTOBUF_COMPILER_REQUIRED");
}

#[test]
fn wire_inspection_returns_invalid_validation_for_malformed_descriptor() {
    let envelope = run(&request(document(node(vec![("future_field", Value::Bool(true))], vec![]))));
    assert_eq!(envelope["status"], "ok", "validation failures are normal results");
    let Value::Object(fields) = output(&envelope) else { panic!("validation object expected") };
    assert!(fields.iter().any(|(key, value)| key == &Utf16::from("valid") && value == &Value::Bool(false)));
}

#[test]
fn wire_work_hook_covers_admission_and_inspection() {
    let wire = request(document(node(vec![], vec![])));
    let mut control = |_amount: usize| Err(EngineError::new("HOST_BUDGET", Utf16::default(), "stopped"));
    let envelope: serde_json::Value = serde_json::from_str(
        &umf_core_wire::execute_protobuf_inspect_wire_with_control(&wire, &mut control),
    ).unwrap();
    assert_eq!(envelope["status"], "error");
    assert_eq!(envelope["code"], "HOST_BUDGET");
}

#[test]
fn wire_rejects_missing_document_and_unknown_operation() {
    let missing = umf_core_wire::encode(&object(vec![
        ("op", Value::string_utf8("protobuf.descriptor.inspect")),
    ]), &mut Context::ordinary()).unwrap();
    let envelope = run(&missing);
    assert_eq!(envelope["status"], "error");
    assert_eq!(envelope["code"], "REQUEST");

    let wrong_operation = umf_core_wire::encode(&object(vec![
        ("op", Value::string_utf8("protobuf.descriptor.export")),
        ("document", document(node(vec![], vec![]))),
    ]), &mut Context::ordinary()).unwrap();
    let envelope = run(&wrong_operation);
    assert_eq!(envelope["status"], "error");
    assert_eq!(envelope["code"], "REQUEST");
}

#[test]
fn wire_host_hook_can_stop_after_admission_during_inspection() {
    let input_document = document(node(vec![], vec![]));
    let wire = request(input_document.clone());
    let admission_work = measure(|context| { umf_core_wire::decode(&wire, context)?; Ok(()) });
    let mut remaining = admission_work;
    let mut control = |amount: usize| {
        if amount > remaining {
            return Err(EngineError::new("HOST_INSPECTION", Utf16::default(), "inspection stopped"));
        }
        remaining -= amount;
        Ok(())
    };
    let envelope: serde_json::Value = serde_json::from_str(
        &umf_core_wire::execute_protobuf_inspect_wire_with_control(&wire, &mut control),
    ).unwrap();
    assert_eq!(envelope["status"], "error");
    assert_eq!(envelope["code"], "HOST_INSPECTION");
}

#[test]
fn wire_host_hook_can_stop_during_result_encoding() {
    let input_document = document(node(vec![], vec![]));
    let wire = request(input_document.clone());
    let admission_work = measure(|context| { umf_core_wire::decode(&wire, context)?; Ok(()) });
    let mut validation = None;
    let inspection_work = measure(|context| {
        validation = Some(umf_core::protobuf_inspect::inspect_protobuf_document(&input_document, context)?);
        Ok(())
    });
    let result = validation_value(validation.unwrap());
    let encoding_work = measure(|context| { umf_core_wire::encode(&result, context)?; Ok(()) });
    assert!(admission_work > 0 && inspection_work > 0 && encoding_work > 0);

    let mut remaining = admission_work + inspection_work;
    let mut control = |amount: usize| {
        if amount > remaining {
            return Err(EngineError::new("HOST_ENCODING", Utf16::default(), "result encoding stopped"));
        }
        remaining -= amount;
        Ok(())
    };
    let envelope: serde_json::Value = serde_json::from_str(
        &umf_core_wire::execute_protobuf_inspect_wire_with_control(&wire, &mut control),
    ).unwrap();
    assert_eq!(envelope["status"], "error");
    assert_eq!(envelope["code"], "HOST_ENCODING");
}
