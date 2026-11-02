// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::{avro_document::import_schema, Context, EngineError, Utf16, Value};

fn object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(key, value)| (Utf16::from(key), value))
            .collect(),
    )
}

fn document(schema: &str) -> Value {
    import_schema(
        &Utf16::from("wire-inspection"),
        &schema.encode_utf16().collect::<Vec<_>>(),
        &[],
        &mut Context::ordinary(),
    )
    .unwrap()
}

fn document_with_dependency(root: &str, dependency: &str) -> Value {
    let dependency = dependency.encode_utf16().collect::<Vec<_>>();
    import_schema(
        &Utf16::from("wire-inspection-dependency"),
        &root.encode_utf16().collect::<Vec<_>>(),
        &[umf_core::avro_document::AvroDependencySource {
            id: &Utf16::from("dep"),
            schema_json: &dependency,
        }],
        &mut Context::ordinary(),
    )
    .unwrap()
}

fn request(doc: Value) -> String {
    umf_core_wire::encode(
        &object(vec![
            ("op", Value::string_utf8("avro.document.inspect")),
            ("document", doc),
        ]),
        &mut Context::ordinary(),
    )
    .unwrap()
}

fn run(wire: &str) -> serde_json::Value {
    serde_json::from_str(&umf_core_wire::execute_avro_document_inspect_wire(wire)).unwrap()
}

fn output(envelope: &serde_json::Value) -> Value {
    umf_core_wire::decode(envelope["wire"].as_str().unwrap(), &mut Context::ordinary()).unwrap()
}

fn member<'a>(value: &'a Value, name: &str) -> &'a Value {
    let Value::Object(fields) = value else {
        panic!("object expected")
    };
    &fields
        .iter()
        .find(|(key, _)| key == &Utf16::from(name))
        .unwrap()
        .1
}

fn text(value: &Value) -> String {
    let Value::String(text) = value else {
        panic!("string expected")
    };
    text.to_utf8().unwrap()
}

#[test]
fn native_schema_error_does_not_change_successful_umf_admission() {
    let source = document(r#""missing.Type""#);
    let before = source.clone();
    let envelope = run(&request(source.clone()));
    assert_eq!(envelope["status"], "ok", "{envelope}");
    let result = output(&envelope);
    assert_eq!(
        text(member(&result, "profile")),
        umf_core_wire::AVRO_DOCUMENT_INSPECT_PROFILE
    );
    assert_eq!(
        member(member(&result, "admission"), "valid"),
        &Value::Bool(true)
    );
    let native = member(&result, "nativeInspection");
    assert_eq!(text(member(native, "status")), "inspected");
    assert_eq!(member(native, "valid"), &Value::Bool(false));
    let Value::Array(diagnostics) = member(native, "diagnostics") else {
        panic!("diagnostics array expected")
    };
    assert_eq!(
        text(member(&diagnostics[0], "code")),
        "AVRO_UNRESOLVED_NAME"
    );
    assert_eq!(source, before);
    assert_eq!(
        text(member(&result, "payloadPath")),
        "/modules/0/elements/0/extensions/umf.avro"
    );
}

#[test]
fn failed_generic_admission_is_reported_and_native_inspection_is_not_run() {
    let mut source = document(r#"{"type":"string"}"#);
    let Value::Object(fields) = &mut source else {
        unreachable!()
    };
    fields
        .iter_mut()
        .find(|(key, _)| key == &Utf16::from("umf"))
        .unwrap()
        .1 = Value::string_utf8("0.0.0");
    let envelope = run(&request(source));
    assert_eq!(envelope["status"], "ok", "{envelope}");
    let result = output(&envelope);
    assert_eq!(
        member(member(&result, "admission"), "valid"),
        &Value::Bool(false)
    );
    assert_eq!(
        text(member(member(&result, "nativeInspection"), "status")),
        "not-run"
    );
    let Value::Object(fields) = &result else {
        unreachable!()
    };
    assert!(!fields
        .iter()
        .any(|(key, _)| key == &Utf16::from("payloadPath")));
}

#[test]
fn ordered_document_dependencies_are_used_by_native_inspection() {
    let source = document_with_dependency(
        r#""demo.Thing""#,
        r#"{"type":"record","name":"Thing","namespace":"demo","fields":[]}"#,
    );
    let envelope = run(&request(source));
    assert_eq!(envelope["status"], "ok", "{envelope}");
    let result = output(&envelope);
    assert_eq!(
        member(member(&result, "admission"), "valid"),
        &Value::Bool(true)
    );
    let native = member(&result, "nativeInspection");
    assert_eq!(text(member(native, "status")), "inspected");
    assert_eq!(member(native, "valid"), &Value::Bool(true));
    let Value::Array(diagnostics) = member(native, "diagnostics") else {
        panic!("diagnostics array expected")
    };
    assert_eq!(text(member(&diagnostics[0], "code")), "AVRO_PROFILE_LIMIT");
}

#[test]
fn host_control_bounds_document_admission_and_inspection() {
    let wire = request(document(r#"{"type":"string"}"#));
    let mut stop =
        |_amount: usize| Err(EngineError::new("HOST_BUDGET", Utf16::default(), "stopped"));
    let envelope: serde_json::Value = serde_json::from_str(
        &umf_core_wire::execute_avro_document_inspect_wire_with_control(&wire, &mut stop),
    )
    .unwrap();
    assert_eq!(envelope["status"], "error");
    assert_eq!(envelope["code"], "HOST_BUDGET");
}
