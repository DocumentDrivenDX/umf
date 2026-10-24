#![cfg(feature = "embedded-adapters")]
// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::{json_schema_adapter as js, Context, Limits, ResourceProfile, Utf16, Value};

fn units(value: &str) -> Vec<u16> { value.encode_utf16().collect() }

fn child_mut<'a>(value: &'a mut umf_core::Value, key: &str) -> &'a mut umf_core::Value {
    let umf_core::Value::Object(fields) = value else { panic!("expected object") };
    fields.iter_mut().find(|(name, _)| name == &Utf16::from(key)).map(|(_, value)| value).expect("field")
}

#[test]
fn public_operations_compose_import_inspect_export_get_walk_and_bundle() {
    let source = units(r#"{"$ref":"https://example.test/types.json#/$defs/amount","properties":{"a/b~c":{"type":"string"}},"default":{"ignored":{"type":"boolean"}}}"#);
    let resources = vec![(Utf16::from("https://example.test/types.json"), units(r#"{"$defs":{"amount":{"type":"number"}}}"#))];
    let document = js::import_json_schema(
        &source,
        &Utf16::from("r5-operations"),
        &Utf16::from("https://example.test/root"),
        &resources,
        &mut Context::ordinary(),
    ).unwrap();

    let inspected = js::inspect_json_schema(&document, &mut Context::ordinary()).unwrap();
    assert!(inspected.valid);
    assert!(!inspected.complete);
    assert!(inspected.diagnostics.iter().any(|d| d.code == Utf16::from("JSON_SCHEMA_VALIDATOR_LIMIT")));

    assert_eq!(js::export_json_schema(&document, &mut Context::ordinary()).unwrap(), Utf16::from("{\"$ref\":\"https://example.test/types.json#/$defs/amount\",\"properties\":{\"a/b~c\":{\"type\":\"string\"}},\"default\":{\"ignored\":{\"type\":\"boolean\"}}}\n"));
    let exported_resources = js::export_json_schema_resources(&document, &mut Context::ordinary()).unwrap();
    assert_eq!(exported_resources.len(), 1);
    assert_eq!(exported_resources[0].0, Utf16::from("https://example.test/types.json"));
    assert!(exported_resources[0].1.to_utf8().unwrap().contains("amount"));

    let node = js::get_json_schema_node(&document, &Utf16::from("/properties/a~1b~0c"), &mut Context::ordinary()).unwrap();
    assert_eq!(node.render_compact(&mut Context::ordinary()).unwrap().to_utf8().unwrap(), r#"{"type":"string"}"#);
    let walk = js::walk_json_schema(&document, &mut Context::ordinary()).unwrap();
    let pointers = walk.iter().map(|p| p.pointer.to_utf8().unwrap()).collect::<Vec<_>>();
    assert_eq!(pointers, vec!["", "/properties/a~1b~0c"]);

    let bundle = js::export_json_schema_bundle(&document, &mut Context::ordinary()).unwrap();
    assert_eq!(bundle.root_json.to_utf8().unwrap(), js::export_json_schema(&document, &mut Context::ordinary()).unwrap().to_utf8().unwrap());
    assert!(bundle.diagnostics.iter().any(|d| d.code == Utf16::from("SOURCE_ARTIFACT_REQUIRED")));
    assert_eq!(bundle.diagnostics.last().unwrap().message, Utf16::from("Standalone native root does not carry UMF metadata or supplied resource files; retain this bundle for full source recovery."));
    let mut detached = bundle.source;
    let modules = child_mut(&mut detached, "modules");
    let Value::Array(modules) = modules else { panic!("expected modules") };
    let elements = child_mut(&mut modules[0], "elements");
    let Value::Array(elements) = elements else { panic!("expected elements") };
    let extensions = child_mut(&mut elements[0], "extensions");
    let payload = child_mut(extensions, "umf.json-schema");
    let root = child_mut(payload, "root");
    let members = child_mut(root, "members");
    let Value::Object(members) = members else { panic!("expected root members") };
    members.push((Utf16::from("detachedOnly"), Value::Bool(true)));
    assert!(!js::export_json_schema(&document, &mut Context::ordinary()).unwrap().to_utf8().unwrap().contains("detachedOnly"));
}

#[test]
fn source_refusal_order_checks_uri_and_resource_sources_before_root_source() {
    let malformed_root = units("{");
    let malformed_resource = vec![(Utf16::from("relative"), units("{"))];
    let error = js::import_json_schema(
        &malformed_root,
        &Utf16::from("r5"),
        &Utf16::from("https://example.test/root"),
        &malformed_resource,
        &mut Context::ordinary(),
    ).unwrap_err();
    assert_eq!(error.code, "JSON_SCHEMA_URI");

    let malformed_resource = vec![(Utf16::from("https://example.test/resource"), units("{"))];
    let error = js::import_json_schema(
        &malformed_root,
        &Utf16::from("r5"),
        &Utf16::from("https://example.test/root"),
        &malformed_resource,
        &mut Context::ordinary(),
    ).unwrap_err();
    assert_eq!(error.code, "JSON_SCHEMA_SYNTAX");
}

#[test]
fn semantic_refusals_keep_predecessor_import_error_code() {
    let invalid_root = js::import_json_schema(
        &units("[]"),
        &Utf16::from("r5"),
        &Utf16::from("https://example.test/root"),
        &[],
        &mut Context::ordinary(),
    )
    .unwrap_err();
    assert_eq!(invalid_root.code, "JSON_SCHEMA_INVALID");

    let collision = js::import_json_schema(
        &units("{}"),
        &Utf16::from("r5"),
        &Utf16::from("https://example.test/root"),
        &[(Utf16::from("https://example.test/root"), units("{}"))],
        &mut Context::ordinary(),
    )
    .unwrap_err();
    assert_eq!(collision.code, "JSON_SCHEMA_INVALID");

    let invalid_resource = js::import_json_schema(
        &units("{}"),
        &Utf16::from("r5"),
        &Utf16::from("https://example.test/root"),
        &[(Utf16::from("https://example.test/resource"), units("[]"))],
        &mut Context::ordinary(),
    )
    .unwrap_err();
    assert_eq!(invalid_resource.code, "JSON_SCHEMA_INVALID");
}

#[test]
fn late_cancellation_is_not_wrapped_as_schema_invalid() {
    let root = units("[]");
    let mut observed_cancel = false;
    for cancel_after in 1..200 {
        let mut checks = 0usize;
        let mut cancel = || {
            checks += 1;
            checks > cancel_after
        };
        let mut ctx = Context::ordinary().with_cancellation(&mut cancel);
        let result = js::import_json_schema(
            &root,
            &Utf16::from("r5"),
            &Utf16::from("https://example.test/root"),
            &[],
            &mut ctx,
        );
        if result.as_ref().is_err_and(|error| error.code == "CANCELLED") {
            observed_cancel = true;
            break;
        }
        if let Err(error) = result {
            assert_ne!(error.code, "JSON_SCHEMA_INVALID", "control failure must retain its own code");
        }
    }
    assert!(observed_cancel, "sweep must reach a cancellation point");
}

#[test]
fn inspection_returns_full_validation_for_invalid_documents_and_null_schema_roots() {
    let invalid = js::inspect_json_schema(&Value::Object(Vec::new()), &mut Context::ordinary()).unwrap();
    assert!(!invalid.valid);
    assert!(!invalid.complete);
    assert_eq!(invalid.diagnostics.len(), 4);
    assert_eq!(invalid.diagnostics.iter().map(|item| item.code.to_utf8().unwrap()).collect::<Vec<_>>(), vec!["SEMANTIC_TYPE_STRUCTURE"; 4]);
    assert_eq!(invalid.diagnostics.iter().map(|item| item.message.to_utf8().unwrap()).collect::<Vec<_>>(), vec![
        "must have required property 'umf'",
        "must have required property 'id'",
        "must have required property 'vocabularies'",
        "must have required property 'modules'",
    ]);

    let mut document = js::import_json_schema(
        &units("{}"), &Utf16::from("r5"), &Utf16::from("https://example.test/root"), &[], &mut Context::ordinary(),
    ).unwrap();
    let modules = child_mut(&mut document, "modules");
    let Value::Array(modules) = modules else { panic!("expected modules") };
    let elements = child_mut(&mut modules[0], "elements");
    let Value::Array(elements) = elements else { panic!("expected elements") };
    let extensions = child_mut(&mut elements[0], "extensions");
    let payload = child_mut(extensions, "umf.json-schema");
    let root = child_mut(payload, "root");
    *root = Value::Object(vec![
        (Utf16::from("kind"), Value::string_utf8("null")),
    ]);
    let null_root = js::inspect_json_schema(&document, &mut Context::ordinary()).unwrap();
    assert!(!null_root.valid);
    assert_eq!(null_root.diagnostics.len(), 1, "{:#?}", null_root.diagnostics);
    assert_eq!(null_root.diagnostics[0].code, Utf16::from("JSON_SCHEMA_ROOT"));
    assert_eq!(null_root.diagnostics[0].path, Utf16::from("/modules/0/elements/0/extensions/umf.json-schema"));
    assert_eq!(null_root.diagnostics[0].message, Utf16::from("Resource https://example.test/root must be object or boolean"));

    let ordinary = Value::Object(vec![
        (Utf16::from("umf"), Value::string_utf8("0.10.0")),
        (Utf16::from("id"), Value::string_utf8("ordinary")),
        (Utf16::from("vocabularies"), Value::Object(Vec::new())),
        (Utf16::from("modules"), Value::Array(Vec::new())),
    ]);
    let no_extension = js::inspect_json_schema(&ordinary, &mut Context::ordinary()).unwrap();
    assert!(no_extension.valid);
    assert!(no_extension.complete);
    assert!(no_extension.diagnostics.is_empty());

    let mut warning_document = js::import_json_schema(
        &units("{}"), &Utf16::from("r5"), &Utf16::from("https://example.test/root"), &[], &mut Context::ordinary(),
    ).unwrap();
    let vocabularies = child_mut(&mut warning_document, "vocabularies");
    let Value::Object(vocabularies) = vocabularies else { panic!("expected vocabularies") };
    vocabularies.push((Utf16::from("future.ext"), Value::Object(vec![
        (Utf16::from("version"), Value::string_utf8("1.0.0")),
    ])));
    let modules = child_mut(&mut warning_document, "modules");
    let Value::Array(modules) = modules else { panic!("expected modules") };
    let elements = child_mut(&mut modules[0], "elements");
    let Value::Array(elements) = elements else { panic!("expected elements") };
    let extensions = child_mut(&mut elements[0], "extensions");
    let Value::Object(extensions) = extensions else { panic!("expected extensions") };
    extensions.push((Utf16::from("future.ext"), Value::Object(vec![(Utf16::from("opaque"), Value::Bool(true))])));
    let retained_warning = js::inspect_json_schema(&warning_document, &mut Context::ordinary()).unwrap();
    assert!(retained_warning.valid);
    assert!(!retained_warning.complete);
    assert_eq!(retained_warning.diagnostics.len(), 2, "{:#?}", retained_warning.diagnostics);
    assert_eq!(retained_warning.diagnostics[0].code, Utf16::from("UNKNOWN_EXTENSION"));
    assert_eq!(retained_warning.diagnostics[0].path, Utf16::from("/vocabularies/future.ext"));
    assert_eq!(retained_warning.diagnostics[0].message, Utf16::from("Exact extension version unavailable; content retained"));
    assert_eq!(retained_warning.diagnostics[1].code, Utf16::from("JSON_SCHEMA_VALIDATOR_LIMIT"));

    let mut unknown_version = js::import_json_schema(
        &units("{}"), &Utf16::from("r5"), &Utf16::from("https://example.test/root"), &[], &mut Context::ordinary(),
    ).unwrap();
    let vocabularies = child_mut(&mut unknown_version, "vocabularies");
    let schema_declaration = child_mut(vocabularies, "umf.json-schema");
    child_mut(schema_declaration, "version").clone_from(&Value::string_utf8("9.9.9"));
    let unknown_version_result = js::inspect_json_schema(&unknown_version, &mut Context::ordinary()).unwrap();
    assert!(unknown_version_result.valid);
    assert!(!unknown_version_result.complete);
    assert_eq!(unknown_version_result.diagnostics.len(), 1);
    assert_eq!(unknown_version_result.diagnostics[0].code, Utf16::from("UNKNOWN_EXTENSION"));
    assert_eq!(unknown_version_result.diagnostics[0].path, Utf16::from("/vocabularies/umf.json-schema"));

    let mut no_payload_document = js::import_json_schema(
        &units("{}"), &Utf16::from("r5"), &Utf16::from("https://example.test/root"), &[], &mut Context::ordinary(),
    ).unwrap();
    let modules = child_mut(&mut no_payload_document, "modules");
    let Value::Array(modules) = modules else { panic!("expected modules") };
    let elements = child_mut(&mut modules[0], "elements");
    let Value::Array(elements) = elements else { panic!("expected elements") };
    let extensions = child_mut(&mut elements[0], "extensions");
    let Value::Object(extensions) = extensions else { panic!("expected extensions") };
    extensions.retain(|(key, _)| key != &Utf16::from("umf.json-schema"));
    let no_payload = js::inspect_json_schema(&no_payload_document, &mut Context::ordinary()).unwrap();
    assert!(no_payload.valid);
    assert!(no_payload.complete);
    assert!(no_payload.diagnostics.is_empty());
}

#[test]
fn inspection_rejects_malformed_present_payload_and_propagates_control_failures() {
    let mut document = js::import_json_schema(
        &units("{}"),
        &Utf16::from("r5-malformed-payload"),
        &Utf16::from("https://example.test/root"),
        &[],
        &mut Context::ordinary(),
    )
    .unwrap();
    let modules = child_mut(&mut document, "modules");
    let Value::Array(modules) = modules else { panic!("expected modules") };
    let elements = child_mut(&mut modules[0], "elements");
    let Value::Array(elements) = elements else { panic!("expected elements") };
    let extensions = child_mut(&mut elements[0], "extensions");
    let payload = child_mut(extensions, "umf.json-schema");
    let Value::Object(fields) = payload else { panic!("expected payload object") };
    fields.retain(|(key, _)| key != &Utf16::from("root"));

    let inspected = js::inspect_json_schema(&document, &mut Context::ordinary()).unwrap();
    assert!(!inspected.valid);
    assert!(!inspected.complete);
    assert_eq!(inspected.diagnostics.len(), 1, "{inspected:#?}");
    assert_eq!(inspected.diagnostics[0].code, Utf16::from("EXTENSION_STRUCTURE"));
    assert_eq!(inspected.diagnostics[0].path, Utf16::from("/modules/0/elements/0/extensions/umf.json-schema"));
    assert_eq!(inspected.diagnostics[0].message, Utf16::from("must have required property 'root'"));

    let mut observed_cancel = false;
    for cancel_after in 1..200 {
        let mut checks = 0usize;
        let mut cancel = || {
            checks += 1;
            checks > cancel_after
        };
        let mut ctx = Context::ordinary().with_cancellation(&mut cancel);
        match js::inspect_json_schema(&document, &mut ctx) {
            Err(error) if error.is_control_failure() => {
                assert_eq!(error.code, "CANCELLED");
                observed_cancel = true;
                break;
            }
            Err(error) => panic!("unexpected error: {error}"),
            Ok(result) => assert!(!result.valid, "malformed payload became valid"),
        }
    }
    assert!(observed_cancel, "cancellation sweep must reach a control failure");
}

#[test]
fn registered_extension_schema_rejects_missing_resources_and_null_payloads() {
    let new_document = || {
        js::import_json_schema(
            &units("{}"),
            &Utf16::from("r5-extension-shape"),
            &Utf16::from("https://example.test/root"),
            &[],
            &mut Context::ordinary(),
        )
        .unwrap()
    };

    let mut missing_resources = new_document();
    let modules = child_mut(&mut missing_resources, "modules");
    let Value::Array(modules) = modules else { panic!("expected modules") };
    let elements = child_mut(&mut modules[0], "elements");
    let Value::Array(elements) = elements else { panic!("expected elements") };
    let extensions = child_mut(&mut elements[0], "extensions");
    let payload = child_mut(extensions, "umf.json-schema");
    let Value::Object(fields) = payload else { panic!("expected payload object") };
    fields.retain(|(key, _)| key != &Utf16::from("resources"));
    let inspected = js::inspect_json_schema(&missing_resources, &mut Context::ordinary()).unwrap();
    assert!(!inspected.valid);
    assert!(inspected.diagnostics.iter().any(|item| item.code == Utf16::from("EXTENSION_STRUCTURE")));

    let mut null_payload = new_document();
    let modules = child_mut(&mut null_payload, "modules");
    let Value::Array(modules) = modules else { panic!("expected modules") };
    let elements = child_mut(&mut modules[0], "elements");
    let Value::Array(elements) = elements else { panic!("expected elements") };
    let extensions = child_mut(&mut elements[0], "extensions");
    let Value::Object(fields) = extensions else { panic!("expected extensions object") };
    let (_, payload) = fields.iter_mut().find(|(key, _)| key == &Utf16::from("umf.json-schema")).unwrap();
    *payload = Value::Null;
    let inspected = js::inspect_json_schema(&null_payload, &mut Context::ordinary()).unwrap();
    assert!(!inspected.valid);
    assert!(inspected.diagnostics.iter().any(|item| item.code == Utf16::from("EXTENSION_STRUCTURE")));
}

#[test]
fn invalid_import_envelope_preserves_complete_diagnostics() {
    let error = js::import_json_schema(
        &units("{}"), &Utf16::default(), &Utf16::from("https://example.test/root"), &[], &mut Context::ordinary(),
    ).unwrap_err();
    assert_eq!(error.code, "JSON_SCHEMA_INVALID");
    assert_eq!(error.message, Utf16::from(r#"[{"code":"SEMANTIC_TYPE_STRUCTURE","path":"/id","message":"must NOT have fewer than 1 characters","severity":"error"}]"#));
}

#[test]
fn import_refusal_escapes_isolated_surrogate_unknown_keyword_paths() {
    for escaped in ["\\ud800", "\\udc00"] {
        let source = format!(r#"{{"type":"\ud800","{escaped}":true}}"#);
        let error = js::import_json_schema(
            &units(&source), &Utf16::from("r5"), &Utf16::from("https://example.test/root"), &[], &mut Context::ordinary(),
        ).unwrap_err();
        assert_eq!(error.code, "JSON_SCHEMA_INVALID");
        let message = error.message.to_utf8().unwrap();
        let expected = format!(r#"[{{"code":"JSON_SCHEMA_KEYWORD","path":"/modules/0/elements/0/extensions/umf.json-schema/{escaped}","message":"Uninterpreted keyword in https://example.test/root","severity":"warning"}},{{"code":"JSON_SCHEMA_META","path":"/modules/0/elements/0/extensions/umf.json-schema","message":"must be equal to one of the allowed values","severity":"error"}}]"#);
        assert_eq!(message, expected);
    }
}

#[test]
fn import_stops_at_context_value_limits_without_publishing_a_document() {
    let limits = Limits { max_values: 8, ..Limits::ordinary() };
    let mut ctx = Context::with_limits(ResourceProfile::Cooperative, limits).unwrap();
    let result = js::import_json_schema(
        &units(r#"{"properties":{"one":{"type":"string"},"two":{"type":"number"}}}"#),
        &Utf16::from("r5"),
        &Utf16::from("https://example.test/root"),
        &[],
        &mut ctx,
    );
    assert_eq!(result.unwrap_err().code, "LIMIT");
}

#[test]
fn imported_unknown_native_keyword_remains_exportable_and_inspection_is_incomplete() {
    let document = js::import_json_schema(
        &units(r#"{"x-future":{"meaning":1}}"#),
        &Utf16::from("r5"),
        &Utf16::from("https://example.test/root"),
        &[],
        &mut Context::ordinary(),
    ).unwrap();
    let validation = js::inspect_json_schema(&document, &mut Context::ordinary()).unwrap();
    assert!(validation.valid);
    assert!(!validation.complete);
    assert!(validation.diagnostics.iter().any(|d| d.code == Utf16::from("JSON_SCHEMA_KEYWORD")));
    assert!(js::export_json_schema(&document, &mut Context::ordinary()).is_ok());
}

#[test]
fn unsupported_json_schema_dialect_is_never_reported_complete() {
    let document = js::import_json_schema(
        &units(r#"{"$schema":"https://example.test/dialect","type":"string"}"#),
        &Utf16::from("r5"),
        &Utf16::from("https://example.test/root"),
        &[],
        &mut Context::ordinary(),
    ).unwrap();
    let validation = js::inspect_json_schema(&document, &mut Context::ordinary()).unwrap();
    assert!(validation.valid);
    assert!(!validation.complete);
    assert!(validation.diagnostics.iter().any(|item| item.code == Utf16::from("JSON_SCHEMA_DIALECT")));
}

#[test]
fn frozen_predecessor_vectors_cover_exact_numbers_utf16_and_diagnostic_order() {
    let exact = js::import_json_schema(
        &units(r#"{"minimum":9007199254740993,"maximum":1e400,"multipleOf":0.10000000000000000001,"default":-0,"x-opaque":{"kind":"number","value":"literal"}}"#),
        &Utf16::from("r5"), &Utf16::from("https://example.test/n"), &[], &mut Context::ordinary(),
    ).unwrap();
    assert_eq!(js::export_json_schema(&exact, &mut Context::ordinary()).unwrap(), Utf16::from("{\"minimum\":9007199254740993,\"maximum\":1e400,\"multipleOf\":0.10000000000000000001,\"default\":-0,\"x-opaque\":{\"kind\":\"number\",\"value\":\"literal\"}}\n"));

    let lone = js::import_json_schema(
        &units(r#"{"title":"\ud800"}"#), &Utf16::from("r5"), &Utf16::from("https://example.test/utf16"), &[], &mut Context::ordinary(),
    ).unwrap();
    assert_eq!(js::export_json_schema(&lone, &mut Context::ordinary()).unwrap(), Utf16::from("{\"title\":\"\\ud800\"}\n"));

    let invalid = js::import_json_schema(
        &units(r#"{"type":"alien","x-opaque":1}"#), &Utf16::from("r5"), &Utf16::from("https://example.test/both"), &[], &mut Context::ordinary(),
    ).unwrap_err();
    assert_eq!(invalid.code, "JSON_SCHEMA_INVALID");
    let diagnostic_text = invalid.message.to_utf8().unwrap();
    assert!(diagnostic_text.find("JSON_SCHEMA_KEYWORD").unwrap() < diagnostic_text.find("JSON_SCHEMA_META").unwrap());

    let missing = js::import_json_schema(
        &units(r#"{"$ref":"missing.json"}"#), &Utf16::from("r5"), &Utf16::from("https://example.test/root"), &[], &mut Context::ordinary(),
    ).unwrap();
    let validation = js::inspect_json_schema(&missing, &mut Context::ordinary()).unwrap();
    assert!(validation.valid);
    assert!(!validation.complete);
    assert!(validation.diagnostics.iter().any(|d| d.code == Utf16::from("JSON_SCHEMA_COMPILE")));
}

#[test]
fn unknown_representation_fails_exports_and_resources_preserve_order() {
    let mut document = js::import_json_schema(
        &units(r#"{"type":"string"}"#), &Utf16::from("r5"), &Utf16::from("https://example.test/root"), &[], &mut Context::ordinary(),
    ).unwrap();
    let modules = child_mut(&mut document, "modules");
    let Value::Array(modules) = modules else { panic!("expected modules") };
    let elements = child_mut(&mut modules[0], "elements");
    let Value::Array(elements) = elements else { panic!("expected elements") };
    let extensions = child_mut(&mut elements[0], "extensions");
    let payload = child_mut(extensions, "umf.json-schema");
    let root = child_mut(payload, "root");
    let Value::Object(root) = root else { panic!("expected tagged root") };
    root.push((Utf16::from("futureRepresentation"), Value::string_utf8("retained")));
    let validation = js::inspect_json_schema(&document, &mut Context::ordinary()).unwrap();
    assert!(validation.valid);
    assert!(validation.diagnostics.iter().any(|d| d.code == Utf16::from("JSON_SCHEMA_REPRESENTATION")));
    let export_error = js::export_json_schema(&document, &mut Context::ordinary()).unwrap_err();
    assert_eq!(export_error.code, "JSON_SCHEMA_EXPORT");
    assert_eq!(export_error.message, Utf16::from(r#"[{"code":"JSON_SCHEMA_REPRESENTATION","path":"/root/futureRepresentation","message":"Unknown representation field cannot be emitted natively","severity":"warning"}]"#));
    let bundle_error = js::export_json_schema_bundle(&document, &mut Context::ordinary()).unwrap_err();
    assert_eq!(bundle_error.code, "JSON_SCHEMA_EXPORT");
    assert_eq!(bundle_error.message, export_error.message);

    let ordered = js::import_json_schema(
        &units("{}"), &Utf16::from("r5"), &Utf16::from("https://example.test/root"),
        &[(Utf16::from("https://example.test/z"), units("{}")), (Utf16::from("https://example.test/a"), units("{}"))],
        &mut Context::ordinary(),
    ).unwrap();
    let uris = js::export_json_schema_resources(&ordered, &mut Context::ordinary()).unwrap().into_iter().map(|(uri, _)| uri.to_utf8().unwrap()).collect::<Vec<_>>();
    assert_eq!(uris, vec!["https://example.test/z", "https://example.test/a"]);
    let duplicate = js::import_json_schema(
        &units("{}"), &Utf16::from("r5"), &Utf16::from("https://example.test/root"),
        &[(Utf16::from("https://example.test/dup"), units("{}")), (Utf16::from("https://example.test/dup"), units("{}"))],
        &mut Context::ordinary(),
    ).unwrap_err();
    assert_eq!(duplicate.code, "JSON_SCHEMA_RESOURCE_COLLISION");
}

#[test]
fn export_refusal_escapes_lone_surrogate_units_as_four_digit_json_escapes() {
    let mut document = js::import_json_schema(
        &units("{}"), &Utf16::from("r5"), &Utf16::from("https://example.test/root"), &[], &mut Context::ordinary(),
    ).unwrap();
    let modules = child_mut(&mut document, "modules");
    let Value::Array(modules) = modules else { panic!("expected modules") };
    let elements = child_mut(&mut modules[0], "elements");
    let Value::Array(elements) = elements else { panic!("expected elements") };
    let extensions = child_mut(&mut elements[0], "extensions");
    let payload = child_mut(extensions, "umf.json-schema");
    let root = child_mut(payload, "root");
    let Value::Object(root) = root else { panic!("expected tagged root") };
    root.push((Utf16::new(vec![0xd800]), Value::Bool(true)));
    root.push((Utf16::new(vec![0xdc00]), Value::Bool(true)));
    let error = js::export_json_schema(&document, &mut Context::ordinary()).unwrap_err();
    assert_eq!(error.code, "JSON_SCHEMA_EXPORT");
    assert_eq!(error.message, Utf16::from(r#"[{"code":"JSON_SCHEMA_REPRESENTATION","path":"/root/\ud800","message":"Unknown representation field cannot be emitted natively","severity":"warning"},{"code":"JSON_SCHEMA_REPRESENTATION","path":"/root/\udc00","message":"Unknown representation field cannot be emitted natively","severity":"warning"}]"#));
}

#[test]
fn node_lookup_refuses_missing_pointer_and_source_copy_isolated() {
    let document = js::import_json_schema(
        &units(r#"{"type":"string"}"#), &Utf16::from("r5"), &Utf16::from("https://example.test/root"), &[], &mut Context::ordinary(),
    ).unwrap();
    assert_eq!(js::get_json_schema_node(&document, &Utf16::from("/missing"), &mut Context::ordinary()).unwrap_err().code, "JSON_SCHEMA_POINTER");
    let bundle = js::export_json_schema_bundle(&document, &mut Context::ordinary()).unwrap();
    assert_eq!(bundle.diagnostics.last().unwrap().message, Utf16::from("Standalone native root does not carry UMF metadata or supplied resource files; retain this bundle for full source recovery."));
    let mut detached = bundle.source;
    let modules = child_mut(&mut detached, "modules");
    let Value::Array(modules) = modules else { panic!("expected modules") };
    let elements = child_mut(&mut modules[0], "elements");
    let Value::Array(elements) = elements else { panic!("expected elements") };
    let extensions = child_mut(&mut elements[0], "extensions");
    let payload = child_mut(extensions, "umf.json-schema");
    let root = child_mut(payload, "root");
    let Value::Object(root) = root else { panic!("expected tagged root") };
    root.push((Utf16::from("detachedOnly"), Value::Bool(true)));
    assert!(!js::export_json_schema(&document, &mut Context::ordinary()).unwrap().to_utf8().unwrap().contains("detachedOnly"));
}

#[test]
fn representation_pointer_scans_and_long_keys_are_metered_before_work() {
    let schema = format!(
        "{{\"properties\":{{{}}}}}",
        (0..80).map(|i| format!("\"p{i}\":{{\"type\":\"string\"}}"))
            .collect::<Vec<_>>().join(",")
    );
    let mut document = js::import_json_schema(
        &units(&schema), &Utf16::from("r5"), &Utf16::from("https://example.test/root"), &[], &mut Context::ordinary(),
    ).unwrap();
    let modules = child_mut(&mut document, "modules");
    let Value::Array(modules) = modules else { panic!("expected modules") };
    let elements = child_mut(&mut modules[0], "elements");
    let Value::Array(elements) = elements else { panic!("expected elements") };
    let extensions = child_mut(&mut elements[0], "extensions");
    let payload = child_mut(extensions, "umf.json-schema");
    let root = child_mut(payload, "root");
    let Value::Object(root) = root else { panic!("expected tagged root") };
    root.push((Utf16::from("future_".repeat(32)), Value::Bool(true)));

    let mut meter = |amount: usize| {
        if amount >= 64 {
            Err(umf_core::EngineError::new("HOST_LIMIT", Utf16::default(), "meter stop"))
        } else {
            Ok(())
        }
    };
    let error = js::inspect_json_schema(
        &document,
        &mut Context::ordinary().with_meter(&mut meter),
    ).unwrap_err();
    assert_eq!(error.code, "HOST_LIMIT");
}
