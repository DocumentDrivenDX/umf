// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::{protobuf_document, protobuf_source, Context, EngineError, Utf16, Value};
use std::cell::Cell;

fn document() -> Value {
    let mut document = protobuf_document::import_descriptor_set(&[], "source-export", &mut Context::ordinary()).unwrap();
    let payload = payload_mut(&mut document);
    payload.push((Utf16::from("sourceArchive"), Value::Object(vec![
        (Utf16::from("role"), Value::string_utf8("original")),
        (Utf16::from("compiler"), Value::string_utf8("capture-compiler/1")),
        (Utf16::from("files"), Value::Object(vec![(Utf16::from("root.proto"), Value::String(Utf16::new(vec![0x006d, 0xd83d, 0xde00])))])),
        (Utf16::from("roots"), Value::Array(vec![Value::string_utf8("root.proto")])),
    ])));
    document
}

fn payload_mut(document: &mut Value) -> &mut Vec<(Utf16, Value)> {
    let Value::Object(root) = document else { panic!("document object expected") };
    let modules = get_mut(root, "modules");
    let Value::Array(modules) = modules else { panic!("modules array expected") };
    let Value::Object(module) = &mut modules[0] else { panic!("module object expected") };
    let elements = get_mut(module, "elements");
    let Value::Array(elements) = elements else { panic!("elements array expected") };
    let Value::Object(element) = &mut elements[0] else { panic!("element object expected") };
    let extensions = get_mut(element, "extensions");
    let Value::Object(extensions) = extensions else { panic!("extensions object expected") };
    let protobuf = get_mut(extensions, "umf.protobuf");
    let Value::Object(protobuf) = protobuf else { panic!("protobuf object expected") };
    protobuf
}

fn get_mut<'a>(fields: &'a mut [(Utf16, Value)], name: &str) -> &'a mut Value {
    fields.iter_mut().find(|(key, _)| key.to_utf8().is_ok_and(|s| s == name)).map(|(_, value)| value).unwrap()
}
fn get<'a>(fields: &'a [(Utf16, Value)], name: &str) -> &'a Value {
    fields.iter().find(|(key, _)| key.to_utf8().is_ok_and(|s| s == name)).map(|(_, value)| value).unwrap()
}
fn string<'a>(value: &'a Value) -> &'a Utf16 { if let Value::String(text) = value { text } else { panic!("string expected") } }
fn zero_cost_values(value: &Value) -> usize {
    match value {
        Value::String(text) => usize::from(text.is_empty()),
        Value::Array(items) => usize::from(items.is_empty()) + items.iter().map(zero_cost_values).sum::<usize>(),
        Value::Object(fields) => usize::from(fields.is_empty()) + fields.iter().map(|(_, value)| zero_cost_values(value)).sum::<usize>(),
        _ => 0,
    }
}
fn emitter_result() -> Value {
    Value::Object(vec![
        (Utf16::from("files"), Value::Object(vec![(Utf16::from("generated.proto"), Value::string_utf8("message Edited {}\n"))])),
        (Utf16::from("compiler"), Value::string_utf8("capture-compiler/1")),
        (Utf16::from("printer"), Value::string_utf8("capture-printer/1")),
        (Utf16::from("future"), Value::Object(vec![(Utf16::from("opaque"), Value::Bool(true))])),
    ])
}

#[test]
fn prepared_current_bytes_and_original_archive_remain_independent() {
    let mut input = document();
    let mut context = Context::ordinary();
    let expected_bytes = protobuf_document::export_descriptor_set(&input, &mut context).unwrap();
    let prepared = protobuf_source::prepare_source_export(&input, &mut context).unwrap();
    assert_eq!(prepared.descriptor_set(), expected_bytes);
    // Models a trusted asynchronous emitter mutating its caller-owned closure
    // capture after bytes were prepared and before finish resumes.
    if let Value::Object(fields) = &mut input { fields.iter_mut().find(|(k, _)| k == &Utf16::from("id")).unwrap().1 = Value::string_utf8("mutated during callback"); }
    payload_mut(&mut input).push((Utf16::from("futureRepresentation"), Value::Object(vec![(Utf16::from("retain"), Value::Bool(true))])));

    let mut output = protobuf_source::finish_source_export(prepared, &input, &emitter_result(), &mut context).unwrap();
    let Value::Object(fields) = &mut output else { panic!("emitter result object expected") };
    assert_eq!(get(fields, "future"), &Value::Object(vec![(Utf16::from("opaque"), Value::Bool(true))]));
    let source = get(fields, "source");
    let Value::Object(source_fields) = source else { panic!("source document expected") };
    assert_eq!(string(get(source_fields, "id")).to_utf8().unwrap(), "mutated during callback");
    let modules = get(source_fields, "modules");
    let Value::Array(modules) = modules else { panic!("modules array expected") };
    let Value::Object(module) = &modules[0] else { panic!("module expected") };
    let Value::Array(elements) = get(module, "elements") else { panic!("elements array expected") };
    let Value::Object(element) = &elements[0] else { panic!("element expected") };
    let Value::Object(extensions) = get(element, "extensions") else { panic!("extensions expected") };
    let Value::Object(payload) = get(extensions, "umf.protobuf") else { panic!("payload expected") };
    let archive = get(payload, "sourceArchive");
    let Value::Object(archive) = archive else { panic!("archive expected") };
    let Value::Object(files) = get(archive, "files") else { panic!("files expected") };
    assert_eq!(string(&files[0].1).units(), &[0x006d, 0xd83d, 0xde00]);
    let Value::Array(diagnostics) = get(fields, "diagnostics") else { panic!("diagnostics expected") };
    assert!(diagnostics.iter().any(|diagnostic| matches!(diagnostic, Value::Object(items) if string(get(items, "code")).to_utf8().is_ok_and(|code| code == "PROTOBUF_REPRESENTATION"))));
    let Value::Object(layout) = diagnostics.last().unwrap() else { panic!("layout diagnostic expected") };
    assert_eq!(string(get(layout, "code")).to_utf8().unwrap(), "PROTOBUF_SOURCE_LAYOUT");
    if let Value::Object(source_fields) = get_mut(fields, "source") {
        *get_mut(source_fields, "id") = Value::string_utf8("changed returned copy");
    } else { panic!("source copy object expected") }
    let Value::Object(input_fields) = &input else { panic!("input document expected") };
    assert_eq!(string(get(input_fields, "id")).to_utf8().unwrap(), "mutated during callback");
}

#[test]
fn prepared_bytes_retain_the_current_descriptor_tree_including_unknown_wire_content() {
    let bytes = include_bytes!("../../../fixtures/protobuf/authored.pb");
    let document = protobuf_document::import_descriptor_set(bytes, "unknown-wire-export", &mut Context::ordinary()).unwrap();
    let mut context = Context::ordinary();
    let expected = protobuf_document::export_descriptor_set(&document, &mut context).unwrap();
    let prepared = protobuf_source::prepare_source_export(&document, &mut context).unwrap();
    assert_eq!(prepared.descriptor_set(), expected);
    assert!(!prepared.descriptor_set().is_empty());
}

#[test]
fn emitter_result_copy_and_shape_refusals_keep_predecessor_precedence() {
    let source_document = document();
    let mut context = Context::ordinary();
    let prepared = protobuf_source::prepare_source_export(&source_document, &mut context).unwrap();
    let invalid_number = Value::Object(vec![
        (Utf16::from("files"), Value::Object(vec![])),
        (Utf16::from("compiler"), Value::string_utf8("c")),
        (Utf16::from("printer"), Value::string_utf8("p")),
        (Utf16::from("future"), Value::Number(f64::NAN)),
    ]);
    assert_eq!(protobuf_source::finish_source_export(prepared, &source_document, &invalid_number, &mut context).unwrap_err().code, "NUMBER");

    let source_document = document();
    let prepared = protobuf_source::prepare_source_export(&source_document, &mut Context::ordinary()).unwrap();
    let invalid_shape = Value::Object(vec![
        (Utf16::from("files"), Value::Array(vec![])),
        (Utf16::from("compiler"), Value::string_utf8("c")),
        (Utf16::from("printer"), Value::string_utf8("p")),
    ]);
    assert_eq!(protobuf_source::finish_source_export(prepared, &source_document, &invalid_shape, &mut Context::ordinary()).unwrap_err().code, "PROTOBUF_EMIT");

    let source_document = document();
    let prepared = protobuf_source::prepare_source_export(&source_document, &mut Context::ordinary()).unwrap();
    let invalid_file = Value::Object(vec![
        (Utf16::from("files"), Value::Object(vec![(Utf16::from("bad.proto"), Value::Bool(false))])),
        (Utf16::from("compiler"), Value::string_utf8("c")),
        (Utf16::from("printer"), Value::string_utf8("p")),
    ]);
    assert_eq!(protobuf_source::finish_source_export(prepared, &source_document, &invalid_file, &mut Context::ordinary()).unwrap_err().message.to_utf8().unwrap(), "Emitted files require names and text");

    let source_document = document();
    let prepared = protobuf_source::prepare_source_export(&source_document, &mut Context::ordinary()).unwrap();
    let truthy_identities = Value::Object(vec![
        (Utf16::from("files"), Value::Object(vec![])),
        (Utf16::from("compiler"), Value::Bool(true)),
        (Utf16::from("printer"), Value::Object(vec![])),
    ]);
    let output = protobuf_source::finish_source_export(prepared, &source_document, &truthy_identities, &mut Context::ordinary()).unwrap();
    let Value::Object(fields) = output else { panic!("emitter result expected") };
    assert_eq!(get(&fields, "compiler"), &Value::Bool(true));
    assert_eq!(get(&fields, "printer"), &Value::Object(vec![]));
}

#[test]
fn cancellation_after_emitter_result_is_checked_before_final_copy() {
    let cancelled = Cell::new(false);
    let mut check = || cancelled.get();
    let mut context = Context::ordinary().with_cancellation(&mut check);
    let source_document = document();
    let prepared = protobuf_source::prepare_source_export(&source_document, &mut context).unwrap();
    cancelled.set(true);
    let error = protobuf_source::finish_source_export(prepared, &source_document, &emitter_result(), &mut context).unwrap_err();
    assert_eq!(error.code, "CANCELLED");
}

#[test]
fn work_meter_failure_at_final_gate_prevents_final_output_copy() {
    // First count the operation's zero-cost control calls. The final tree copy
    // contributes exactly one such call per empty string/container, so the
    // preceding zero call is the explicit gate immediately before that copy.
    let source_document = document();
    let zero_calls = Cell::new(0usize);
    let mut meter = |amount: usize| {
        if amount == 0 { zero_calls.set(zero_calls.get() + 1); }
        Ok::<(), EngineError>(())
    };
    let mut context = Context::ordinary().with_meter(&mut meter);
    let prepared = protobuf_source::prepare_source_export(&source_document, &mut context).unwrap();
    let before_finish = zero_calls.get();
    let output = protobuf_source::finish_source_export(prepared, &source_document, &emitter_result(), &mut context).unwrap();
    let finish_zero_calls = zero_calls.get() - before_finish;
    let final_copy_zero_calls = zero_cost_values(&output);
    let final_gate_ordinal = finish_zero_calls - final_copy_zero_calls;
    assert!(final_gate_ordinal > 0);
    drop(context);

    let source_document = document();
    let zero_calls = Cell::new(0usize);
    let fail_at = Cell::new(usize::MAX);
    let mut meter = |amount: usize| {
        if amount == 0 {
            let current = zero_calls.get() + 1;
            zero_calls.set(current);
            if current == fail_at.get() {
                return Err(EngineError::new("HOST_LIMIT", Utf16::default(), "stop before final copy"));
            }
        }
        Ok(())
    };
    let mut context = Context::ordinary().with_meter(&mut meter);
    let prepared = protobuf_source::prepare_source_export(&source_document, &mut context).unwrap();
    fail_at.set(zero_calls.get() + final_gate_ordinal);
    let error = protobuf_source::finish_source_export(prepared, &source_document, &emitter_result(), &mut context).unwrap_err();
    assert_eq!(error.code, "HOST_LIMIT");
    assert_eq!(error.message.to_utf8().unwrap(), "stop before final copy");
}
