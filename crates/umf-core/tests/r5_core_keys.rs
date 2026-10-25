// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::{
    copy_json,
    core_keys::{
        admit_core_key_identity, admit_core_key_member_request, admit_core_key_request,
        declare_core_key, declare_core_record_members, inspect_core_keys, lookup_core_key,
        prepare_core_key_verification, verify_core_key_operation,
    },
    engine::{Capabilities, Engine, ResourceSet, SemanticContext},
    error::Diagnostic,
    registry::Registry,
    serialization::{read_json_value, write_json_value, Format},
    Context, Utf16, Value,
};

struct NoCapabilities;
impl Capabilities for NoCapabilities {
    fn validate_extension(
        &mut self,
        _: u64,
        _: &Value,
        _: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        Ok(Vec::new())
    }
}
fn parse(text: &str) -> Value {
    read_json_value(
        &text.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        &mut Context::ordinary(),
    )
    .unwrap()
}
fn get<'a>(v: &'a Value, name: &str) -> Option<&'a Value> {
    match v {
        Value::Object(f) => f
            .iter()
            .find(|(k, _)| k == &Utf16::from(name))
            .map(|(_, v)| v),
        _ => None,
    }
}
fn engine() -> Engine {
    Engine::new(
        ResourceSet::new(
            parse(include_str!("../../../spec/core/schema.json")),
            parse(include_str!(
                "../../../spec/core/semantic-type-reference.schema.json"
            )),
            parse(include_str!(
                "../../../spec/core/extension-package.schema.json"
            )),
            parse(include_str!(
                "../../../spec/metamodel/generated/core-constraints.json"
            )),
            parse(include_str!(
                "../../../spec/metamodel/generated/domain-policy.json"
            )),
        ),
        &mut Context::ordinary(),
    )
    .unwrap()
}
fn source() -> Value {
    parse(
        r#"{"umf":"0.10.0","id":"keys","vocabularies":{},"modules":[{"id":"m","namespace":"sales","elements":[{"id":"record","kind":"record","extensions":{}},{"id":"id","kind":"field","scalarType":"integer","nullability":"required","cardinality":"one","extensions":{}}]}]}"#,
    )
}
fn id() -> Value {
    parse(r#"{"module":"m","element":"record"}"#)
}
fn field() -> Value {
    parse(r#"{"module":"m","element":"id"}"#)
}
fn object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(k, v)| (Utf16::from(k), v))
            .collect(),
    )
}
fn canonical_eq(a: &Value, b: &Value) -> bool {
    match (a, b) {
        (Value::Array(x), Value::Array(y)) => {
            x.len() == y.len() && x.iter().zip(y).all(|(a, b)| canonical_eq(a, b))
        }
        (Value::Object(x), Value::Object(y)) => {
            x.len() == y.len()
                && x.iter().all(|(k, v)| {
                    y.iter()
                        .find(|(other, _)| other == k)
                        .is_some_and(|(_, w)| canonical_eq(v, w))
                })
        }
        _ => a == b,
    }
}
fn operation_outcome(result: Result<Value, umf_core::error::EngineError>) -> Value {
    match result {
        Ok(value) => object(vec![("ok", Value::Bool(true)), ("value", value)]),
        Err(error) => object(vec![
            ("ok", Value::Bool(false)),
            (
                "error",
                object(vec![
                    ("code", Value::string_utf8(error.code)),
                    ("message", Value::String(error.message)),
                    ("path", Value::String(error.path)),
                ]),
            ),
        ]),
    }
}

fn object_field_mut<'a>(value: &'a mut Value, name: &str) -> &'a mut Value {
    let Value::Object(fields) = value else {
        panic!("object {name}")
    };
    &mut fields
        .iter_mut()
        .find(|(key, _)| key == &Utf16::from(name))
        .unwrap()
        .1
}
fn array_item_mut(value: &mut Value, index: usize) -> &mut Value {
    let Value::Array(items) = value else {
        panic!("array")
    };
    &mut items[index]
}
fn add_lone_surrogate_to_first_key_field(document: &mut Value) -> Utf16 {
    let qualifier = Utf16::new(vec![0xd800]);
    let module = array_item_mut(object_field_mut(document, "modules"), 0);
    let record = array_item_mut(object_field_mut(module, "elements"), 0);
    let key = array_item_mut(object_field_mut(record, "keys"), 0);
    let first = array_item_mut(object_field_mut(key, "fields"), 0);
    let Value::Object(first) = first else {
        panic!("key field")
    };
    first.push((qualifier.clone(), Value::string_utf8("opaque")));
    qualifier
}

#[test]
fn authored_members_and_key_round_trip_by_explicit_stable_identity() {
    let e = engine();
    let r = Registry::new();
    let mut caps = NoCapabilities;
    let members = declare_core_record_members(
        &source(),
        &id(),
        &Value::Array(vec![field()]),
        &e,
        &r,
        &mut caps,
        &mut Context::ordinary(),
    )
    .unwrap();
    let request =
        parse(r#"{"id":"pk","name":"ID","fields":[{"module":"m","element":"id"}],"primary":true}"#);
    let receipt = declare_core_key(
        get(&members, "target").unwrap(),
        &id(),
        &request,
        &e,
        &r,
        &mut caps,
        &mut Context::ordinary(),
    )
    .unwrap();
    let target = get(&receipt, "target").unwrap();
    assert_eq!(
        get(
            &inspect_core_keys(target, &id(), &e, &r, &mut caps, &mut Context::ordinary()).unwrap(),
            "version"
        ),
        Some(&Value::string_utf8("4.0.0"))
    );
    let identity = parse(r#"{"module":"m","element":"record","key":"pk"}"#);
    let lookup = lookup_core_key(
        target,
        &identity,
        &e,
        &r,
        &mut caps,
        &mut Context::ordinary(),
    )
    .unwrap();
    assert_eq!(
        get(get(&lookup, "key").unwrap(), "id"),
        Some(&Value::string_utf8("pk"))
    );
    assert_eq!(
        verify_core_key_operation(
            &receipt,
            target,
            &e,
            &r,
            &mut caps,
            &mut Context::ordinary()
        )
        .unwrap(),
        receipt
    );
    for format in [Format::Json, Format::Yaml] {
        let encoded = write_json_value(&receipt, format, &mut Context::ordinary()).unwrap();
        let decoded = read_json_value(encoded.units(), format, &mut Context::ordinary()).unwrap();
        assert!(canonical_eq(&decoded, &receipt));
        assert!(canonical_eq(
            &verify_core_key_operation(
                &decoded,
                target,
                &e,
                &r,
                &mut caps,
                &mut Context::ordinary()
            )
            .unwrap(),
            &receipt
        ));
    }
    let stale = parse(r#"{"umf":"0.10.0","id":"changed","vocabularies":{},"modules":[]}"#);
    assert_eq!(
        verify_core_key_operation(
            &receipt,
            &stale,
            &e,
            &r,
            &mut caps,
            &mut Context::ordinary()
        )
        .unwrap_err()
        .code,
        "CORE_KEY_STALE"
    );
    let packet = parse(include_str!(
        "../../../docs/helix/04-build/evidence/rust-migration/r5-core-keys/frozen-typescript.json"
    ));
    let expected = get(get(&packet, "outcomes").unwrap(), "verify_stale_document").unwrap();
    let actual = operation_outcome(verify_core_key_operation(
        &receipt,
        &parse(r#"{"umf":"0.10.0","id":"keys","vocabularies":{},"modules":[]}"#),
        &e,
        &r,
        &mut caps,
        &mut Context::ordinary(),
    ));
    assert!(canonical_eq(&actual, expected));
}

#[test]
fn unknown_key_qualifiers_survive_updates_and_tuple_changes_refuse() {
    let e = engine();
    let r = Registry::new();
    let mut caps = NoCapabilities;
    let members = declare_core_record_members(
        &source(),
        &id(),
        &Value::Array(vec![field()]),
        &e,
        &r,
        &mut caps,
        &mut Context::ordinary(),
    )
    .unwrap();
    let request =
        parse(r#"{"id":"pk","name":"ID","fields":[{"module":"m","element":"id"}],"primary":true}"#);
    let receipt = declare_core_key(
        get(&members, "target").unwrap(),
        &id(),
        &request,
        &e,
        &r,
        &mut caps,
        &mut Context::ordinary(),
    )
    .unwrap();
    let mut document =
        umf_core::copy_json(get(&receipt, "target").unwrap(), &mut Context::ordinary()).unwrap();
    let Value::Object(root) = &mut document else {
        panic!("document")
    };
    let (_, Value::Array(modules)) = root
        .iter_mut()
        .find(|(k, _)| k == &Utf16::from("modules"))
        .unwrap()
    else {
        panic!("modules")
    };
    let Value::Object(m) = &mut modules[0] else {
        panic!("module")
    };
    let (_, Value::Array(elements)) = m
        .iter_mut()
        .find(|(k, _)| k == &Utf16::from("elements"))
        .unwrap()
    else {
        panic!("elements")
    };
    let Value::Object(record) = &mut elements[0] else {
        panic!("record")
    };
    let (_, Value::Array(keys)) = record
        .iter_mut()
        .find(|(k, _)| k == &Utf16::from("keys"))
        .unwrap()
    else {
        panic!("keys")
    };
    let Value::Object(key) = &mut keys[0] else {
        panic!("key")
    };
    key.push((Utf16::from("future"), Value::string_utf8("opaque")));
    let renamed = parse(r#"{"id":"pk","name":"Renamed","fields":[{"module":"m","element":"id"}]}"#);
    let updated = declare_core_key(
        &document,
        &id(),
        &renamed,
        &e,
        &r,
        &mut caps,
        &mut Context::ordinary(),
    )
    .unwrap();
    assert_eq!(
        get(&updated, "operation"),
        Some(&Value::string_utf8("declare-core-key"))
    );
    let changed =
        parse(r#"{"id":"pk","name":"Renamed","fields":[{"module":"m","element":"other"}]}"#);
    assert_eq!(
        declare_core_key(
            &document,
            &id(),
            &changed,
            &e,
            &r,
            &mut caps,
            &mut Context::ordinary()
        )
        .unwrap_err()
        .code,
        "CORE_KEY_ID_CONFLICT"
    );
}

#[test]
fn lone_surrogate_key_field_qualifier_survives_an_update() {
    let e = engine();
    let r = Registry::new();
    let mut caps = NoCapabilities;
    let members = declare_core_record_members(
        &source(),
        &id(),
        &Value::Array(vec![field()]),
        &e,
        &r,
        &mut caps,
        &mut Context::ordinary(),
    )
    .unwrap();
    let request =
        parse(r#"{"id":"pk","name":"ID","fields":[{"module":"m","element":"id"}],"primary":true}"#);
    let receipt = declare_core_key(
        get(&members, "target").unwrap(),
        &id(),
        &request,
        &e,
        &r,
        &mut caps,
        &mut Context::ordinary(),
    )
    .unwrap();
    let mut current =
        copy_json(get(&receipt, "target").unwrap(), &mut Context::ordinary()).unwrap();
    let qualifier = add_lone_surrogate_to_first_key_field(&mut current);
    let updated = declare_core_key(
        &current,
        &id(),
        &request,
        &e,
        &r,
        &mut caps,
        &mut Context::ordinary(),
    )
    .unwrap();
    let target = get(&updated, "target").unwrap();
    let modules = get(target, "modules").unwrap();
    let Value::Array(modules) = modules else {
        panic!("modules")
    };
    let elements = get(&modules[0], "elements").unwrap();
    let Value::Array(elements) = elements else {
        panic!("elements")
    };
    let keys = get(&elements[0], "keys").unwrap();
    let Value::Array(keys) = keys else {
        panic!("keys")
    };
    let fields = get(&keys[0], "fields").unwrap();
    let Value::Array(fields) = fields else {
        panic!("fields")
    };
    let Value::Object(field) = &fields[0] else {
        panic!("key field")
    };
    assert!(field
        .iter()
        .any(|(key, value)| key == &qualifier && value == &Value::string_utf8("opaque")));
}

#[test]
fn explicit_cancellation_aborts_key_inspection() {
    let e = engine();
    let r = Registry::new();
    let mut caps = NoCapabilities;
    let mut cancelled = || true;
    let mut ctx = Context::ordinary().with_cancellation(&mut cancelled);
    let error = inspect_core_keys(&source(), &id(), &e, &r, &mut caps, &mut ctx).unwrap_err();
    assert_eq!(error.code, "CANCELLED");
    assert!(error.is_control_failure());
    assert!(ctx.charged_work() > 0);
}

#[test]
fn key_inspection_reports_cooperative_work_to_the_host_meter() {
    let e = engine();
    let r = Registry::new();
    let mut caps = NoCapabilities;
    let mut total = 0usize;
    let mut meter = |amount: usize| {
        total += amount;
        Ok(())
    };
    let mut ctx = Context::ordinary().with_meter(&mut meter);
    let result = inspect_core_keys(&source(), &id(), &e, &r, &mut caps, &mut ctx).unwrap();
    assert_eq!(
        get(&result, "operation"),
        Some(&Value::string_utf8("inspect-core-keys"))
    );
    drop(ctx);
    assert!(total > 0);
}

#[test]
fn request_identity_and_receipt_preflights_match_public_refusal_codes() {
    let mut ctx = Context::ordinary();
    assert_eq!(
        admit_core_key_request(&parse(r#"{"id":"pk","name":"ID","fields":[]}"#), &mut ctx)
            .unwrap_err()
            .code,
        "CORE_KEY_REQUEST"
    );
    assert_eq!(
        admit_core_key_member_request(
            &parse(r#"[{"module":"m","element":"x"},{"module":"m","element":"x"}]"#),
            &mut ctx
        )
        .unwrap_err()
        .code,
        "CORE_MEMBERS_REQUEST"
    );
    assert_eq!(
        admit_core_key_identity(&parse(r#"{"module":"m","element":"r","key":""}"#), &mut ctx)
            .unwrap_err()
            .code,
        "CORE_KEY_IDENTITY"
    );

    let e = engine();
    let r = Registry::new();
    let mut caps = NoCapabilities;
    let members = declare_core_record_members(
        &source(),
        &id(),
        &Value::Array(vec![field()]),
        &e,
        &r,
        &mut caps,
        &mut Context::ordinary(),
    )
    .unwrap();
    let receipt = declare_core_key(
        get(&members, "target").unwrap(),
        &id(),
        &parse(r#"{"id":"pk","name":"ID","fields":[{"module":"m","element":"id"}]}"#),
        &e,
        &r,
        &mut caps,
        &mut Context::ordinary(),
    )
    .unwrap();
    let prepared =
        prepare_core_key_verification(&receipt, &e, &r, &mut caps, &mut Context::ordinary())
            .unwrap();
    assert!(canonical_eq(&receipt, &prepared));
}

#[test]
fn frozen_typescript_cases_match_complete_rust_envelopes_and_refusals() {
    let packet = parse(include_str!(
        "../../../docs/helix/04-build/evidence/rust-migration/r5-core-keys/frozen-typescript.json"
    ));
    let cases = get(&packet, "cases").unwrap();
    let outcomes = get(&packet, "outcomes").unwrap();
    let Value::Object(entries) = cases else {
        panic!("frozen cases")
    };
    let e = engine();
    let r = Registry::new();
    let mut caps = NoCapabilities;
    for (name, input) in entries {
        let case_name = name.to_utf8().unwrap();
        let result = if case_name == "receipt_shape_before_recompute" {
            verify_core_key_operation(
                get(input, "receipt").unwrap(),
                get(input, "current").unwrap(),
                &e,
                &r,
                &mut caps,
                &mut Context::ordinary(),
            )
        } else {
            let source = get(input, "source").unwrap();
            let identity = get(input, "identity").unwrap();
            let request = get(input, "request");
            match case_name.as_str() {
                "inspect_known"
                | "inspect_absent"
                | "inspect_inapplicable"
                | "extra_identity_refused" => inspect_core_keys(
                    source,
                    identity,
                    &e,
                    &r,
                    &mut caps,
                    &mut Context::ordinary(),
                ),
                "lookup_by_stable_id"
                | "lookup_name_does_not_resolve"
                | "lookup_identity_before_source" => lookup_core_key(
                    source,
                    identity,
                    &e,
                    &r,
                    &mut caps,
                    &mut Context::ordinary(),
                ),
                "declare_members_ordered"
                | "remove_unknown_member_refused"
                | "duplicate_member_request_before_source" => declare_core_record_members(
                    source,
                    identity,
                    request.unwrap(),
                    &e,
                    &r,
                    &mut caps,
                    &mut Context::ordinary(),
                ),
                "declare_key_explicit_primary"
                | "preserve_unknown_qualifiers"
                | "tuple_change_refused"
                | "old_profile_refused"
                | "duplicate_key_request_before_source" => declare_core_key(
                    source,
                    identity,
                    request.unwrap(),
                    &e,
                    &r,
                    &mut caps,
                    &mut Context::ordinary(),
                ),
                other => panic!("unhandled frozen case {other}"),
            }
        };
        let expected = get(outcomes, &name.to_utf8().unwrap()).unwrap();
        let actual = operation_outcome(result);
        assert!(
            canonical_eq(&actual, expected),
            "frozen predecessor mismatch for {}\nactual: {:?}\nexpected: {:?}",
            name.to_utf8().unwrap(),
            actual,
            expected
        );
    }
}
