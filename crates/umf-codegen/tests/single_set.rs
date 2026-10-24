// SPDX-License-Identifier: MIT OR Apache-2.0
use sha2::{Digest, Sha256};
use umf_codegen::{CodegenEngine, CodegenResources};
use umf_core::{serialization::Format, Context, ResourceSet, Utf16, Value};

const SOURCE: &str = include_str!("../../../fixtures/actions-binding/source.json");
const VECTORS: &str = include_str!("../../../fixtures/actions-binding/vectors.json");

fn source_sha() -> String {
    sha256_text(SOURCE)
}

fn sha256_text(source: &str) -> String {
    Sha256::digest(source.as_bytes())
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn parse(text: &str) -> Value {
    umf_codegen::value::read_source_value(&Utf16::from(text), Format::Json, &mut Context::catalog())
        .unwrap()
}

fn fixture_vectors() -> Value {
    parse(VECTORS)
}

fn strval(value: impl AsRef<str>) -> Value {
    Value::string_utf8(value)
}

fn obj(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(key, value)| (Utf16::from(key), value))
            .collect(),
    )
}

fn array(values: impl IntoIterator<Item = Value>) -> Value {
    Value::Array(values.into_iter().collect())
}

fn get<'a>(value: &'a Value, key: &str) -> Option<&'a Value> {
    umf_codegen::value::member(value, key)
}

fn set_member(value: &mut Value, key: &str, replacement: Value) {
    *member_mut(value, key) = replacement;
}

fn member_mut<'a>(value: &'a mut Value, key: &str) -> &'a mut Value {
    let Value::Object(fields) = value else {
        panic!("expected object");
    };
    let key = Utf16::from(key);
    fields
        .iter_mut()
        .find(|(name, _)| *name == key)
        .map(|(_, value)| value)
        .expect("member exists")
}

fn remove_member(value: &mut Value, key: &str) {
    let Value::Object(fields) = value else {
        panic!("expected object");
    };
    let key = Utf16::from(key);
    fields.retain(|(name, _)| *name != key);
}

fn text(value: &Value) -> Option<String> {
    match value {
        Value::String(value) => value.to_utf8().ok(),
        _ => None,
    }
}

fn resources() -> CodegenResources {
    let tables = parse(include_str!("../../../spec/extensions/tables/package.json"));
    let actions = parse(include_str!(
        "../../../spec/extensions/actions/package.json"
    ));
    let tables_schema = get(&tables, "schema").unwrap().clone();
    let actions_schema = get(&actions, "schema").unwrap().clone();
    CodegenResources::new(
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
        tables,
        tables_schema,
        actions,
        actions_schema,
        parse(include_str!(
            "../../../spec/extensions/binding/package.json"
        )),
        parse(include_str!(
            "../../../spec/extensions/binding-stable/package.json"
        )),
        &mut Context::catalog(),
    )
    .unwrap()
}

fn preparation_request() -> Value {
    let source_sha = source_sha();
    let vectors = fixture_vectors();
    obj(vec![
        (
            "source",
            obj(vec![
                ("mediaType", strval("application/json")),
                ("utf8", strval(SOURCE)),
                ("sha256", strval(&source_sha)),
            ]),
        ),
        ("model", get(&vectors, "model").unwrap().clone()),
        ("action", get(&vectors, "actionPin").unwrap().clone()),
        (
            "authorization",
            get(&vectors, "authorization").unwrap().clone(),
        ),
    ])
}

fn array_item_mut(value: &mut Value, index: usize) -> &mut Value {
    let Value::Array(items) = value else {
        panic!("expected array");
    };
    &mut items[index]
}

fn fixture_action_mut(document: &mut Value) -> &mut Value {
    let module = array_item_mut(member_mut(document, "modules"), 0);
    let action_extension = member_mut(member_mut(module, "extensions"), "umf.actions");
    array_item_mut(member_mut(action_extension, "actions"), 0)
}

fn fixture_label_field_mut(document: &mut Value) -> &mut Value {
    array_item_mut(
        member_mut(
            array_item_mut(member_mut(document, "modules"), 0),
            "elements",
        ),
        1,
    )
}

fn fixture_request_with_document(document: Value) -> Value {
    let source_text = umf_core::serialization::stringify_compact(&document)
        .unwrap()
        .to_utf8()
        .unwrap();
    let digest = sha256_text(&source_text);
    let mut request = preparation_request();
    let source = member_mut(&mut request, "source");
    set_member(source, "utf8", strval(&source_text));
    set_member(source, "sha256", strval(&digest));
    set_member(member_mut(&mut request, "model"), "sha256", strval(&digest));
    set_member(
        member_mut(&mut request, "action"),
        "documentSha256",
        strval(&digest),
    );
    request
}

fn fixture_invocation_with_document(document: Value, kind: &str) -> Value {
    let mut request = fixture_request_with_document(document);
    let digest = text(get(member_mut(&mut request, "source"), "sha256").unwrap()).unwrap();
    let vectors = fixture_vectors();
    let generated = get(get(&vectors, "generatedRequests").unwrap(), kind)
        .unwrap()
        .clone();
    let mut invocation = generated;
    set_member(&mut invocation, "schema", strval(digest));
    let Value::Object(fields) = &mut request else {
        unreachable!()
    };
    fields.push((Utf16::from("invocation"), invocation));
    request
}

fn fixture_record_values_with_document(document: Value) -> Value {
    let request = fixture_request_with_document(document);
    obj(vec![
        ("source", get(&request, "source").unwrap().clone()),
        ("model", get(&request, "model").unwrap().clone()),
        (
            "record",
            obj(vec![
                ("module", strval("catalog")),
                ("element", strval("item")),
            ]),
        ),
        (
            "values",
            obj(vec![
                ("item_id", strval("item-1")),
                ("label", strval("ready")),
            ]),
        ),
    ])
}

fn selector_mut(document: &mut Value) -> &mut Value {
    let action = fixture_action_mut(document);
    let frame = array_item_mut(member_mut(action, "writes"), 0);
    member_mut(frame, "selector")
}

fn invocation_request(kind: &str) -> Value {
    let request = preparation_request();
    let mut fields = match &request {
        Value::Object(fields) => fields.clone(),
        _ => unreachable!(),
    };
    let vectors = fixture_vectors();
    let generated = get(&vectors, "generatedRequests").unwrap();
    let invocation = get(generated, kind).unwrap().clone();
    fields.push((Utf16::from("invocation"), invocation));
    Value::Object(fields)
}

#[test]
fn capability_operation_is_exact_and_non_executing() {
    let resources = resources();
    let engine = CodegenEngine::new(&resources);
    let response = engine
        .single_set_capabilities(&Value::Object(Vec::new()), &mut Context::ordinary())
        .unwrap();
    assert_eq!(
        text(get(&response, "profile").unwrap()).as_deref(),
        Some("umf.actions.single-set-capabilities/1")
    );
    assert_eq!(
        text(get(&response, "coreVersion").unwrap()).as_deref(),
        Some("0.10.0")
    );
    assert_eq!(
        get(&response, "operations").unwrap(),
        &array([
            strval("prepareSingleSetAction"),
            strval("admitGeneratedActionInvocation"),
            strval("admitGeneratedRecordValues"),
        ])
    );
    assert_eq!(
        get(&response, "resultProfiles").unwrap(),
        &array([
            strval("umf.actions.single-set-prepared/1"),
            strval("umf.actions.single-set-invocation/1"),
            strval("umf.actions.single-record-values/1"),
        ])
    );
    assert_eq!(
        text(get(&response, "inputDigestProfile").unwrap()).as_deref(),
        Some("umf.actions.generated-invocation/1")
    );
    assert_eq!(
        get(&response, "executionVerified"),
        Some(&Value::Bool(false))
    );
    assert!(engine
        .single_set_capabilities(
            &obj(vec![("unexpected", Value::Null)]),
            &mut Context::ordinary()
        )
        .is_err());
}

#[test]
fn prepared_apply_validate_and_bootstrap_use_shared_kernels() {
    let resources = resources();
    let engine = CodegenEngine::new(&resources);
    let vectors = fixture_vectors();
    let expected = get(&vectors, "expected").unwrap();
    let expected_prepared = get(expected, "prepared").unwrap();
    let expected_invocation = get(expected, "invocation").unwrap();
    let expected_record_values = get(expected, "recordValues").unwrap();
    let request = preparation_request();
    let prepared = engine
        .prepare_single_set_action(&request, &mut Context::ordinary())
        .unwrap();
    assert_eq!(
        get(&prepared, "obligations"),
        get(expected_prepared, "obligations")
    );
    assert_eq!(
        get(&prepared, "requiredExecutorObligations"),
        get(expected_prepared, "requiredExecutorObligations")
    );
    assert_eq!(
        text(get(&prepared, "profile").unwrap()).as_deref(),
        Some("umf.actions.single-set-prepared/1")
    );
    assert_eq!(
        get(&prepared, "executionVerified"),
        Some(&Value::Bool(false))
    );
    let obligations = match get(&prepared, "obligations").unwrap() {
        Value::Array(obligations) => obligations,
        _ => unreachable!(),
    };
    assert!(obligations.iter().any(|obligation| {
        text(get(obligation, "kind").unwrap()).as_deref() == Some("authorization")
            && text(get(obligation, "status").unwrap()).as_deref() == Some("unchecked")
    }));
    assert_eq!(
        text(get(get(&prepared, "authorization").unwrap(), "status").unwrap()).as_deref(),
        Some("supported")
    );

    let apply = engine
        .admit_generated_action_invocation(&invocation_request("apply"), &mut Context::ordinary())
        .unwrap();
    let validate = engine
        .admit_generated_action_invocation(
            &invocation_request("validate"),
            &mut Context::ordinary(),
        )
        .unwrap();
    for admitted in [&apply, &validate] {
        assert_eq!(get(admitted, "inputs"), get(expected_invocation, "inputs"));
        assert_eq!(get(admitted, "entity"), get(expected_invocation, "entity"));
        assert_eq!(
            get(admitted, "assignments"),
            get(expected_invocation, "assignments")
        );
        assert_eq!(
            get(admitted, "inputSha256Profile"),
            get(expected_invocation, "inputSha256Profile")
        );
        assert_eq!(
            get(admitted, "inputSha256"),
            get(expected_invocation, "inputSha256")
        );
    }
    assert_eq!(get(&apply, "inputSha256"), get(&validate, "inputSha256"));
    assert_eq!(
        text(get(&apply, "inputSha256").unwrap()).as_deref(),
        Some("46fa64b1cf0b2df2b72563b082a7567c492c82ebaa260b0478b1af04143dbdcb")
    );
    assert_eq!(get(&apply, "executionVerified"), Some(&Value::Bool(false)));
    assert_eq!(
        text(get(&apply, "inputSha256Profile").unwrap()).as_deref(),
        Some("umf.actions.generated-invocation/1")
    );
    assert_eq!(
        text(get(get(&apply, "entity").unwrap(), "profile").unwrap()).as_deref(),
        Some("umf-key-tuple-v1")
    );
    assert_eq!(
        text(get(get(&apply, "entity").unwrap(), "tupleHex").unwrap()).as_deref(),
        Some("554d464b310104066974656d2d31")
    );

    let row = engine
        .admit_generated_record_values(
            &obj(vec![
                ("source", get(&request, "source").unwrap().clone()),
                ("model", get(&request, "model").unwrap().clone()),
                (
                    "record",
                    obj(vec![
                        ("module", strval("catalog")),
                        ("element", strval("item")),
                    ]),
                ),
                (
                    "values",
                    obj(vec![
                        ("item_id", strval("item-1")),
                        ("label", strval("ready")),
                    ]),
                ),
            ]),
            &mut Context::ordinary(),
        )
        .unwrap();
    assert_eq!(get(&row, "values"), get(expected_record_values, "values"));
    assert_eq!(get(&row, "entity"), get(expected_record_values, "entity"));
    assert_eq!(
        get(get(&apply, "entity").unwrap(), "tupleHex"),
        get(get(&row, "entity").unwrap(), "tupleHex")
    );
    assert_eq!(get(&row, "executionVerified"), Some(&Value::Bool(false)));

    let mut supplementary = invocation_request("validate");
    let invocation = match &mut supplementary {
        Value::Object(fields) => fields
            .iter_mut()
            .find(|(name, _)| *name == Utf16::from("invocation"))
            .map(|(_, value)| value)
            .unwrap(),
        _ => unreachable!(),
    };
    let inputs = match invocation {
        Value::Object(fields) => fields
            .iter_mut()
            .find(|(name, _)| *name == Utf16::from("inputs"))
            .map(|(_, value)| value)
            .unwrap(),
        _ => unreachable!(),
    };
    set_member(inputs, "label_value", strval("𐐷"));
    assert!(engine
        .admit_generated_action_invocation(&supplementary, &mut Context::ordinary())
        .is_ok());
}

#[test]
fn unsupported_invocation_and_host_policy_mutations_refuse() {
    let resources = resources();
    let engine = CodegenEngine::new(&resources);

    let mut wrong_policy = preparation_request();
    let auth = match &mut wrong_policy {
        Value::Object(fields) => fields
            .iter_mut()
            .find(|(name, _)| *name == Utf16::from("authorization"))
            .map(|(_, value)| value)
            .unwrap(),
        _ => unreachable!(),
    };
    set_member(auth, "resources", array([strval("another_frame")]));
    assert!(engine
        .prepare_single_set_action(&wrong_policy, &mut Context::ordinary())
        .is_err());

    let mut apply_without_key = invocation_request("apply");
    let invocation = match &mut apply_without_key {
        Value::Object(fields) => fields
            .iter_mut()
            .find(|(name, _)| *name == Utf16::from("invocation"))
            .map(|(_, value)| value)
            .unwrap(),
        _ => unreachable!(),
    };
    remove_member(invocation, "idempotency_key");
    assert!(engine
        .admit_generated_action_invocation(&apply_without_key, &mut Context::ordinary())
        .is_err());

    let mut validate_with_key = invocation_request("validate");
    let invocation = match &mut validate_with_key {
        Value::Object(fields) => fields
            .iter_mut()
            .find(|(name, _)| *name == Utf16::from("invocation"))
            .map(|(_, value)| value)
            .unwrap(),
        _ => unreachable!(),
    };
    if let Value::Object(fields) = invocation {
        fields.push((Utf16::from("idempotency_key"), Value::Null));
    }
    assert!(engine
        .admit_generated_action_invocation(&validate_with_key, &mut Context::ordinary())
        .is_err());

    let mut invalid_value = invocation_request("apply");
    let invocation = match &mut invalid_value {
        Value::Object(fields) => fields
            .iter_mut()
            .find(|(name, _)| *name == Utf16::from("invocation"))
            .map(|(_, value)| value)
            .unwrap(),
        _ => unreachable!(),
    };
    let inputs = match invocation {
        Value::Object(fields) => fields
            .iter_mut()
            .find(|(name, _)| *name == Utf16::from("inputs"))
            .map(|(_, value)| value)
            .unwrap(),
        _ => unreachable!(),
    };
    set_member(inputs, "label_value", strval("pending"));
    assert!(engine
        .admit_generated_action_invocation(&invalid_value, &mut Context::ordinary())
        .is_err());

    let mut primitive_entity = invocation_request("apply");
    let inputs = member_mut(member_mut(&mut primitive_entity, "invocation"), "inputs");
    set_member(inputs, "item", strval("item-1"));
    assert!(engine
        .admit_generated_action_invocation(&primitive_entity, &mut Context::ordinary())
        .is_err());

    let mut wrong_nested_key = invocation_request("validate");
    let nested_entity = member_mut(
        member_mut(member_mut(&mut wrong_nested_key, "invocation"), "inputs"),
        "item",
    );
    remove_member(nested_entity, "item_id");
    if let Value::Object(fields) = nested_entity {
        fields.push((Utf16::from("another_id"), strval("item-1")));
    }
    assert!(engine
        .admit_generated_action_invocation(&wrong_nested_key, &mut Context::ordinary())
        .is_err());

    let mut missing_nested_key = invocation_request("validate");
    let nested_entity = member_mut(
        member_mut(member_mut(&mut missing_nested_key, "invocation"), "inputs"),
        "item",
    );
    remove_member(nested_entity, "item_id");
    assert!(engine
        .admit_generated_action_invocation(&missing_nested_key, &mut Context::ordinary())
        .is_err());

    let mut extra_nested_key = invocation_request("validate");
    let nested_entity = member_mut(
        member_mut(member_mut(&mut extra_nested_key, "invocation"), "inputs"),
        "item",
    );
    if let Value::Object(fields) = nested_entity {
        fields.push((Utf16::from("extra"), strval("extra")));
    }
    assert!(engine
        .admit_generated_action_invocation(&extra_nested_key, &mut Context::ordinary())
        .is_err());

    let mut null_nested_key = invocation_request("validate");
    let nested_entity = member_mut(
        member_mut(member_mut(&mut null_nested_key, "invocation"), "inputs"),
        "item",
    );
    set_member(nested_entity, "item_id", Value::Null);
    assert!(engine
        .admit_generated_action_invocation(&null_nested_key, &mut Context::ordinary())
        .is_err());
}

#[test]
fn selector_ast_record_shape_and_parameter_profiles_are_exact() {
    let resources = resources();
    let engine = CodegenEngine::new(&resources);

    let mut spaced_selector = parse(SOURCE);
    set_member(
        selector_mut(&mut spaced_selector),
        "expression",
        strval(" { \"entity\" : \"item\" } "),
    );
    assert!(engine
        .prepare_single_set_action(
            &fixture_request_with_document(spaced_selector),
            &mut Context::ordinary(),
        )
        .is_ok());

    let mut literal_selector = parse(SOURCE);
    set_member(
        selector_mut(&mut literal_selector),
        "expression",
        strval(r#"{"key":"item-key","components":[{"literal":{"string":"other-item"}}]}"#),
    );
    assert!(engine
        .prepare_single_set_action(
            &fixture_request_with_document(literal_selector),
            &mut Context::ordinary(),
        )
        .is_err());

    let mut wrong_entity_selector = parse(SOURCE);
    set_member(
        selector_mut(&mut wrong_entity_selector),
        "expression",
        strval(r#"{"entity":"label_value"}"#),
    );
    assert!(engine
        .prepare_single_set_action(
            &fixture_request_with_document(wrong_entity_selector),
            &mut Context::ordinary(),
        )
        .is_err());

    let mut extra_selector_member = parse(SOURCE);
    set_member(
        selector_mut(&mut extra_selector_member),
        "expression",
        strval(r#"{"entity":"item","other":true}"#),
    );
    assert!(engine
        .prepare_single_set_action(
            &fixture_request_with_document(extra_selector_member),
            &mut Context::ordinary(),
        )
        .is_err());

    let mut reversed_parameters = parse(SOURCE);
    let parameters = member_mut(fixture_action_mut(&mut reversed_parameters), "parameters");
    if let Value::Array(items) = parameters {
        items.swap(0, 1);
    }
    assert!(engine
        .prepare_single_set_action(
            &fixture_request_with_document(reversed_parameters),
            &mut Context::ordinary(),
        )
        .is_ok());

    let mut length_only = parse(SOURCE);
    let label = array_item_mut(
        member_mut(
            array_item_mut(member_mut(&mut length_only, "modules"), 0),
            "elements",
        ),
        1,
    );
    remove_member(label, "allowedValues");
    assert!(engine
        .admit_generated_action_invocation(
            &fixture_invocation_with_document(length_only, "validate"),
            &mut Context::ordinary(),
        )
        .is_ok());

    let mut allowed_values_only = parse(SOURCE);
    let label = array_item_mut(
        member_mut(
            array_item_mut(member_mut(&mut allowed_values_only, "modules"), 0),
            "elements",
        ),
        1,
    );
    remove_member(label, "facets");
    assert!(engine
        .admit_generated_record_values(
            &fixture_record_values_with_document(allowed_values_only),
            &mut Context::ordinary(),
        )
        .is_ok());
}

#[test]
fn one_sided_string_length_bounds_use_core_literal_validation() {
    let resources = resources();
    let engine = CodegenEngine::new(&resources);
    let mut minimum_only = parse(SOURCE);
    let label = fixture_label_field_mut(&mut minimum_only);
    remove_member(member_mut(member_mut(label, "facets"), "length"), "max");
    let valid_minimum = fixture_invocation_with_document(minimum_only.clone(), "validate");
    assert!(engine
        .admit_generated_action_invocation(&valid_minimum, &mut Context::ordinary())
        .is_ok());
    // A minimum-only length profile remains supported; the core literal
    // validator still rejects a value that violates its declared minimum.
    let mut minimum_rejects = minimum_only;
    let length = member_mut(
        member_mut(fixture_label_field_mut(&mut minimum_rejects), "facets"),
        "length",
    );
    set_member(length, "min", Value::Number(6.0));
    assert!(engine
        .admit_generated_action_invocation(
            &fixture_invocation_with_document(minimum_rejects, "validate"),
            &mut Context::ordinary(),
        )
        .is_err());

    let mut maximum_only = parse(SOURCE);
    let label = fixture_label_field_mut(&mut maximum_only);
    remove_member(member_mut(member_mut(label, "facets"), "length"), "min");
    assert!(engine
        .admit_generated_record_values(
            &fixture_record_values_with_document(maximum_only.clone()),
            &mut Context::ordinary(),
        )
        .is_ok());
    let length = member_mut(
        member_mut(fixture_label_field_mut(&mut maximum_only), "facets"),
        "length",
    );
    set_member(length, "max", Value::Number(4.0));
    assert!(engine
        .admit_generated_record_values(
            &fixture_record_values_with_document(maximum_only),
            &mut Context::ordinary(),
        )
        .is_err());
}

#[test]
fn preflight_polls_before_copy_and_enforces_parsed_source_depth_and_id_bounds() {
    let resources = resources();
    let engine = CodegenEngine::new(&resources);

    let mut cancellation_calls = 0usize;
    let mut cancelled = || {
        cancellation_calls += 1;
        true
    };
    let mut context = Context::ordinary().with_cancellation(&mut cancelled);
    assert!(engine
        .prepare_single_set_action(&preparation_request(), &mut context)
        .is_err());
    assert_eq!(cancellation_calls, 1);

    let mut deeply_nested = Value::Null;
    for _ in 0..66 {
        deeply_nested = Value::Array(vec![deeply_nested]);
    }
    let mut deep_document = parse(SOURCE);
    if let Value::Object(fields) = &mut deep_document {
        fields.push((
            Utf16::from("extensions"),
            obj(vec![("fixture.deep", deeply_nested)]),
        ));
    }
    assert!(engine
        .prepare_single_set_action(
            &fixture_request_with_document(deep_document),
            &mut Context::ordinary(),
        )
        .is_err());

    let mut oversized_identity = preparation_request();
    set_member(
        member_mut(member_mut(&mut oversized_identity, "action"), "identity"),
        "module",
        strval("m".repeat(257)),
    );
    assert!(engine
        .prepare_single_set_action(&oversized_identity, &mut Context::ordinary())
        .is_err());

    let mut oversized_effect = parse(SOURCE);
    let binding = member_mut(fixture_action_mut(&mut oversized_effect), "binding");
    let effect = array_item_mut(member_mut(binding, "effects"), 0);
    set_member(effect, "id", strval(&"e".repeat(257)));
    assert!(engine
        .prepare_single_set_action(
            &fixture_request_with_document(oversized_effect),
            &mut Context::ordinary(),
        )
        .is_err());

    let too_long = "x".repeat(257);
    let mut oversized_parameter = parse(SOURCE);
    let action = fixture_action_mut(&mut oversized_parameter);
    set_member(
        array_item_mut(member_mut(action, "parameters"), 0),
        "id",
        strval(&too_long),
    );
    assert!(engine
        .prepare_single_set_action(
            &fixture_request_with_document(oversized_parameter),
            &mut Context::ordinary(),
        )
        .is_err());

    let mut oversized_key = parse(SOURCE);
    let key = array_item_mut(
        member_mut(
            array_item_mut(member_mut(&mut oversized_key, "modules"), 0),
            "elements",
        ),
        2,
    );
    let key = array_item_mut(member_mut(key, "keys"), 0);
    set_member(key, "id", strval(&too_long));
    let entity = array_item_mut(
        member_mut(fixture_action_mut(&mut oversized_key), "parameters"),
        0,
    );
    set_member(member_mut(entity, "target"), "key", strval(&too_long));
    assert!(engine
        .prepare_single_set_action(
            &fixture_request_with_document(oversized_key),
            &mut Context::ordinary(),
        )
        .is_err());

    let mut oversized_field = parse(SOURCE);
    let module = array_item_mut(member_mut(&mut oversized_field, "modules"), 0);
    let elements = member_mut(module, "elements");
    set_member(array_item_mut(elements, 0), "id", strval(&too_long));
    let record = array_item_mut(elements, 2);
    set_member(
        array_item_mut(member_mut(record, "members"), 0),
        "element",
        strval(&too_long),
    );
    let key = array_item_mut(member_mut(record, "keys"), 0);
    set_member(
        array_item_mut(member_mut(key, "fields"), 0),
        "element",
        strval(&too_long),
    );
    assert!(engine
        .prepare_single_set_action(
            &fixture_request_with_document(oversized_field),
            &mut Context::ordinary(),
        )
        .is_err());

    let mut oversized_policy = preparation_request();
    set_member(
        member_mut(
            member_mut(&mut oversized_policy, "authorization"),
            "profile",
        ),
        "id",
        strval(&too_long),
    );
    assert!(engine
        .prepare_single_set_action(&oversized_policy, &mut Context::ordinary())
        .is_err());
}

#[test]
fn bootstrap_refuses_unknown_record_key_and_field_meaning_but_retains_unrelated_extension() {
    let resources = resources();
    let engine = CodegenEngine::new(&resources);

    let mut unknown_record_extension = parse(SOURCE);
    let record = array_item_mut(
        member_mut(
            array_item_mut(member_mut(&mut unknown_record_extension, "modules"), 0),
            "elements",
        ),
        2,
    );
    if let Value::Object(fields) = member_mut(record, "extensions") {
        fields.push((Utf16::from("fixture.unknown"), Value::Bool(true)));
    }
    assert!(engine
        .admit_generated_record_values(
            &fixture_record_values_with_document(unknown_record_extension),
            &mut Context::ordinary(),
        )
        .is_err());

    let mut unknown_key_reference = parse(SOURCE);
    let record = array_item_mut(
        member_mut(
            array_item_mut(member_mut(&mut unknown_key_reference, "modules"), 0),
            "elements",
        ),
        2,
    );
    let key = array_item_mut(member_mut(record, "keys"), 0);
    if let Value::Array(fields) = member_mut(key, "fields") {
        if let Value::Object(reference) = &mut fields[0] {
            reference.push((Utf16::from("qualifier"), strval("unknown")));
        }
    }
    assert!(engine
        .admit_generated_record_values(
            &fixture_record_values_with_document(unknown_key_reference),
            &mut Context::ordinary(),
        )
        .is_err());

    let mut unknown_field_meaning = parse(SOURCE);
    let label = array_item_mut(
        member_mut(
            array_item_mut(member_mut(&mut unknown_field_meaning, "modules"), 0),
            "elements",
        ),
        1,
    );
    if let Value::Object(fields) = label {
        fields.push((Utf16::from("newMeaning"), Value::Bool(true)));
    }
    assert!(engine
        .admit_generated_record_values(
            &fixture_record_values_with_document(unknown_field_meaning),
            &mut Context::ordinary(),
        )
        .is_err());

    let mut unrelated_extension = parse(SOURCE);
    set_member(
        &mut unrelated_extension,
        "vocabularies",
        obj(vec![
            ("umf.actions", obj(vec![("version", strval("0.1.0"))])),
            ("fixture.unrelated", obj(vec![("version", strval("1.0.0"))])),
        ]),
    );
    if let Value::Object(fields) = &mut unrelated_extension {
        fields.push((
            Utf16::from("extensions"),
            obj(vec![(
                "fixture.unrelated",
                obj(vec![("note", strval("preserve"))]),
            )]),
        ));
    }
    let unrelated_request = fixture_request_with_document(unrelated_extension);
    let result = engine
        .prepare_single_set_action(&unrelated_request, &mut Context::ordinary())
        .unwrap();
    assert_eq!(
        get(get(&result, "source").unwrap(), "utf8"),
        get(get(&unrelated_request, "source").unwrap(), "utf8")
    );
}
