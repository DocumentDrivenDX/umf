#![cfg(feature = "embedded-adapters")]
// SPDX-License-Identifier: MIT OR Apache-2.0
use std::cell::Cell;
use umf_core::{
    context::TransportUsage,
    json_schema_adapter::{self as js, JsonSchemaImportSession},
    Context, EngineError, Utf16, Value,
};

fn units(source: &str) -> Vec<u16> {
    source.encode_utf16().collect()
}

fn field<'a>(value: &'a Value, name: &str) -> &'a Value {
    let Value::Object(fields) = value else {
        panic!("expected object while reading {name}")
    };
    fields
        .iter()
        .find(|(key, _)| key == &Utf16::from(name))
        .map(|(_, value)| value)
        .unwrap_or_else(|| panic!("missing field {name}"))
}

fn string_field<'a>(value: &'a Value, name: &str) -> &'a Utf16 {
    let Value::String(value) = field(value, name) else {
        panic!("expected string field {name}")
    };
    value
}

fn session(
    first_uri: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<JsonSchemaImportSession, EngineError> {
    JsonSchemaImportSession::new(first_uri, ctx)
}

#[test]
fn session_keeps_three_base_uri_observations_and_resource_order() {
    let first = Utf16::from("https://example.test/validated-first");
    let payload = Utf16::from("https://example.test/payload-second");
    let namespace = Utf16::from("https://example.test/namespace-third");
    let mut ctx = Context::ordinary();
    let mut import = session(&first, &mut ctx).unwrap();

    import
        .add_resource(
            &Utf16::from("https://example.test/one"),
            &units(r#"{"type":"string"}"#),
            &mut ctx,
        )
        .unwrap();
    import
        .add_resource(
            &Utf16::from("https://example.test/two"),
            &units(r#"{"type":"number"}"#),
            &mut ctx,
        )
        .unwrap();
    import.set_payload_base_uri(payload.clone()).unwrap();
    import
        .parse_root(&units(r#"{"type":"object"}"#), &mut ctx)
        .unwrap();
    import.set_id(Utf16::from("staged-id")).unwrap();
    import.set_namespace(namespace.clone()).unwrap();
    let document = import.finish(None, &mut ctx).unwrap();

    assert_eq!(string_field(&document, "id"), &Utf16::from("staged-id"));
    let Value::Array(modules) = field(&document, "modules") else {
        panic!("expected modules")
    };
    let module = &modules[0];
    assert_eq!(string_field(module, "namespace"), &namespace);
    let Value::Array(elements) = field(module, "elements") else {
        panic!("expected elements")
    };
    let payload = field(
        field(field(&elements[0], "extensions"), "umf.json-schema"),
        "baseUri",
    );
    assert_eq!(
        payload,
        &Value::String(Utf16::from("https://example.test/payload-second"))
    );

    let Value::Object(resources) = field(
        field(field(&elements[0], "extensions"), "umf.json-schema"),
        "resources",
    ) else {
        panic!("expected resources")
    };
    let uris = resources
        .iter()
        .map(|(uri, _)| uri.to_utf8().unwrap())
        .collect::<Vec<_>>();
    assert_eq!(
        uris,
        vec![
            "https://example.test/one".to_owned(),
            "https://example.test/two".to_owned()
        ]
    );
}

#[test]
fn out_of_order_stage_call_poisons_session() {
    let mut ctx = Context::ordinary();
    let mut import = session(&Utf16::from("https://example.test/first"), &mut ctx).unwrap();
    assert_eq!(
        import
            .parse_root(&units("true"), &mut ctx)
            .unwrap_err()
            .code,
        "JSON_SCHEMA_IMPORT_ORDER"
    );
    assert_eq!(
        import
            .add_resource(
                &Utf16::from("https://example.test/later"),
                &units("true"),
                &mut ctx,
            )
            .unwrap_err()
            .code,
        "JSON_SCHEMA_IMPORT_ORDER"
    );
    assert_eq!(
        import.finish(None, &mut ctx).unwrap_err().code,
        "JSON_SCHEMA_IMPORT_ORDER"
    );
}

#[test]
fn session_validates_the_first_base_uri_observation_at_construction() {
    let error = match JsonSchemaImportSession::new(
        &Utf16::from("relative-first-uri"),
        &mut Context::ordinary(),
    ) {
        Ok(_) => panic!("relative first URI must be rejected"),
        Err(error) => error,
    };
    assert_eq!(error.code, "JSON_SCHEMA_URI");
}

#[test]
fn session_resource_parse_failure_precedes_later_resource_observation() {
    let mut ctx = Context::ordinary();
    let mut import = session(&Utf16::from("https://example.test/root"), &mut ctx).unwrap();
    let error = import
        .add_resource(
            &Utf16::from("https://example.test/first"),
            &units("{"),
            &mut ctx,
        )
        .unwrap_err();
    assert_eq!(error.code, "JSON_SCHEMA_SYNTAX");

    // The failed resource stage closes this session; a later URI cannot be
    // admitted after the earlier parse refusal.
    let later = import.add_resource(
        &Utf16::from("relative-later-uri"),
        &units(r#"{"type":"boolean"}"#),
        &mut ctx,
    );
    assert_eq!(later.unwrap_err().code, "JSON_SCHEMA_IMPORT_ORDER");
}

#[test]
fn resource_stages_share_the_context_work_limit_and_failure_blocks_finish() {
    let total_work = Cell::new(0usize);
    let work_limit = Cell::new(usize::MAX);
    let mut control = |amount: usize| {
        let next = total_work.get().saturating_add(amount);
        total_work.set(next);
        if next > work_limit.get() {
            Err(EngineError::new(
                "TEST_WORK_LIMIT",
                Utf16::default(),
                "test cumulative work limit",
            ))
        } else {
            Ok(())
        }
    };
    let mut usage = TransportUsage::default();
    let mut ctx = Context::ordinary().with_host_control(&mut control);
    usage.seed(&mut ctx);
    let created = session(&Utf16::from("https://example.test/root"), &mut ctx);
    usage.capture(&ctx);
    let mut import = created.unwrap();
    drop(ctx);

    let mut ctx = Context::ordinary().with_host_control(&mut control);
    usage.seed(&mut ctx);
    let first_resource = import.add_resource(
        &Utf16::from("https://example.test/first"),
        &units("true"),
        &mut ctx,
    );
    usage.capture(&ctx);
    first_resource.unwrap();
    drop(ctx);

    // Arm the host work ceiling at the cumulative total from the first two
    // stages. The next resource stage must see that same Context counter.
    work_limit.set(total_work.get());
    let mut ctx = Context::ordinary().with_host_control(&mut control);
    usage.seed(&mut ctx);
    let error = import
        .add_resource(
            &Utf16::from("https://example.test/second"),
            &units("true"),
            &mut ctx,
        )
        .unwrap_err();
    usage.capture(&ctx);
    drop(ctx);
    assert_eq!(error.code, "TEST_WORK_LIMIT");
    assert!(error.is_control_failure());
    let mut ctx = Context::ordinary().with_host_control(&mut control);
    usage.seed(&mut ctx);
    assert_eq!(
        import.finish(None, &mut ctx).unwrap_err().code,
        "JSON_SCHEMA_IMPORT_ORDER"
    );
    usage.capture(&ctx);
}

#[test]
fn root_parse_must_succeed_before_finish_and_payload_uri_is_checked_at_final_admission() {
    let mut ctx = Context::ordinary();
    let mut failed_root = session(&Utf16::from("https://example.test/first"), &mut ctx).unwrap();
    failed_root
        .set_payload_base_uri(Utf16::from("https://example.test/second"))
        .unwrap();
    let root_error = failed_root.parse_root(&units("{"), &mut ctx).unwrap_err();
    assert_eq!(root_error.code, "JSON_SCHEMA_SYNTAX");
    assert_eq!(
        failed_root.set_id(Utf16::from("id")).unwrap_err().code,
        "JSON_SCHEMA_IMPORT_ORDER"
    );

    let mut late_uri = session(&Utf16::from("https://example.test/first"), &mut ctx).unwrap();
    late_uri
        .set_payload_base_uri(Utf16::from("relative-payload-uri"))
        .unwrap();
    late_uri.parse_root(&units("true"), &mut ctx).unwrap();
    late_uri.set_id(Utf16::from("id-after-root")).unwrap();
    late_uri
        .set_namespace(Utf16::from("https://example.test/third"))
        .unwrap();
    let error = late_uri.finish(None, &mut ctx).unwrap_err();
    assert_eq!(error.code, "JSON_SCHEMA_INVALID");
}

#[test]
fn one_shot_import_keeps_payload_and_namespace_equal() {
    let uri = Utf16::from("https://example.test/shared");
    let document = js::import_json_schema(
        &units("true"),
        &Utf16::from("one-shot"),
        &uri,
        &[],
        &mut Context::ordinary(),
    )
    .unwrap();
    let Value::Array(modules) = field(&document, "modules") else {
        panic!("expected modules")
    };
    assert_eq!(string_field(&modules[0], "namespace"), &uri);
}

#[test]
fn invalid_string_type_import_preserves_ordered_ajv_diagnostics() {
    let base_uri = Utf16::from("https://example.test/read-1");
    let mut ctx = Context::ordinary();
    let error = js::import_json_schema(
        &units(r#"{"type":"nonsense"}"#),
        &Utf16::from("schema-invalid"),
        &base_uri,
        &[],
        &mut ctx,
    )
    .unwrap_err();

    assert_eq!(error.code, "JSON_SCHEMA_INVALID");
    assert_eq!(
        error.message.to_utf8().unwrap(),
        r##"[{"code":"JSON_SCHEMA_META","path":"/modules/0/elements/0/extensions/umf.json-schema","message":"Resource https://example.test/read-1: [{\"instancePath\":\"/type\",\"schemaPath\":\"#/$defs/simpleTypes/enum\",\"keyword\":\"enum\",\"params\":{\"allowedValues\":[\"array\",\"boolean\",\"integer\",\"null\",\"number\",\"object\",\"string\"]},\"message\":\"must be equal to one of the allowed values\"},{\"instancePath\":\"/type\",\"schemaPath\":\"#/properties/type/anyOf/1/type\",\"keyword\":\"type\",\"params\":{\"type\":\"array\"},\"message\":\"must be array\"},{\"instancePath\":\"/type\",\"schemaPath\":\"#/properties/type/anyOf\",\"keyword\":\"anyOf\",\"params\":{},\"message\":\"must match a schema in anyOf\"}]","severity":"error"}]"##
    );
}
