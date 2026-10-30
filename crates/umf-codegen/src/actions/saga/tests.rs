// SPDX-License-Identifier: MIT OR Apache-2.0
use super::*;
use umf_core::serialization::Format;

fn parse(source: &str) -> Value {
    umf_core::serialization::read_json_value(
        Utf16::from(source).units(),
        Format::Json,
        &mut Context::catalog(),
    )
    .unwrap()
}
fn resources() -> crate::resources::CodegenResources {
    let tables = parse(include_str!(
        "../../../../../spec/extensions/tables/package.json"
    ));
    let actions_package = parse(include_str!(
        "../../../../../spec/extensions/actions/package.json"
    ));
    let saga_package = parse(include_str!(
        "../../../../../spec/extensions/saga/package.json"
    ));
    let saga_schema = get(&saga_package, "schema").unwrap().clone();
    let policy = parse(include_str!(
        "../../../../../spec/metamodel/generated/domain-policy.json"
    ));
    let mut resources = crate::resources::CodegenResources::new(
        umf_core::ResourceSet::new(
            parse(include_str!("../../../../../spec/core/schema.json")),
            parse(include_str!(
                "../../../../../spec/core/semantic-type-reference.schema.json"
            )),
            parse(include_str!(
                "../../../../../spec/core/extension-package.schema.json"
            )),
            parse(include_str!(
                "../../../../../spec/metamodel/generated/core-constraints.json"
            )),
            policy,
        ),
        tables.clone(),
        get(&tables, "schema").unwrap().clone(),
        actions_package.clone(),
        get(&actions_package, "schema").unwrap().clone(),
        parse(include_str!(
            "../../../../../spec/extensions/binding/package.json"
        )),
        parse(include_str!(
            "../../../../../spec/extensions/binding-stable/package.json"
        )),
        &mut Context::catalog(),
    )
    .unwrap();
    resources = resources
        .with_sagas(saga_package, saga_schema, &mut Context::catalog())
        .unwrap();
    resources
}
fn fixture() -> Value {
    parse(include_str!(
        "../../../../../docs/helix/02-design/examples/saga/allocation.json"
    ))
}
fn member_mut<'a>(value: &'a mut Value, name: &str) -> &'a mut Value {
    match value {
        Value::Object(fields) => {
            &mut fields
                .iter_mut()
                .find(|(k, _)| k == &Utf16::from(name))
                .unwrap()
                .1
        }
        _ => panic!("expected object member {name}"),
    }
}
fn array_mut(value: &mut Value, index: usize) -> &mut Value {
    match value {
        Value::Array(items) => &mut items[index],
        _ => panic!("expected array"),
    }
}
fn fixture_definition_mut(source: &mut Value) -> &mut Value {
    let module = array_mut(member_mut(source, "modules"), 0);
    let payload = member_mut(member_mut(module, "extensions"), "umf.actions.saga");
    array_mut(member_mut(payload, "sagas"), 0)
}
fn has_code(value: &Value, code: &str) -> bool {
    items(value, "diagnostics")
        .iter()
        .any(|d| text(d, "code").is_some_and(|v| v == &Utf16::from(code)))
}

#[test]
fn allocation_fixture_inspects_order_and_keeps_execution_unverified() {
    let resources = resources();
    let engine = CodegenEngine::new(&resources);
    let source = fixture();
    let inspected = engine
        .inspect_sagas(&source, &mut Context::ordinary())
        .unwrap();
    let entries = items(&inspected, "entries");
    assert_eq!(entries.len(), 1);
    let definition = get(&entries[0], "definition").unwrap();
    assert_eq!(items(definition, "steps").len(), 2);
    assert_eq!(
        text(&items(definition, "steps")[0], "id")
            .unwrap()
            .to_utf8()
            .unwrap(),
        "reserve"
    );
    let identity = obj(vec![
        ("module", s("equipment")),
        ("saga", s("allocate-equipment")),
    ]);
    let assessment = engine
        .assess_saga(
            &source,
            &identity,
            &obj(vec![
                ("id", s("fixture")),
                ("version", s("1")),
                ("coreVersion", s("0.10.0")),
                ("sagaVersion", s("0.1.0")),
                ("coordination", s("supported")),
                ("claims", arr(vec![])),
                ("source", source.clone()),
                ("identity", identity.clone()),
            ]),
            &mut Context::ordinary(),
        )
        .unwrap();
    assert_eq!(
        get(&assessment, "executionVerified"),
        Some(&Value::Bool(false))
    );
    assert_eq!(
        get(&assessment, "declarationCompatible"),
        Some(&Value::Bool(false))
    );
}

#[test]
fn declaration_refuses_an_incompletely_interpreted_source() {
    let resources = resources();
    let engine = CodegenEngine::new(&resources);
    // Use the reviewed first definition as the declaration payload.
    let source = fixture();
    let original = items(
        get(
            get(items(&source, "modules").first().unwrap(), "extensions").unwrap(),
            "umf.actions.saga",
        )
        .unwrap(),
        "sagas",
    )[0]
    .clone();
    let mut fresh = original.clone();
    if let Value::Object(fields) = &mut fresh {
        if let Some((_, id)) = fields.iter_mut().find(|(key, _)| key == &Utf16::from("id")) {
            *id = s("allocate-equipment-copy");
        }
    }
    let err = engine
        .declare_saga(
            &source,
            &Utf16::from("equipment"),
            &fresh,
            &mut Context::ordinary(),
        )
        .unwrap_err();
    assert_eq!(err.code, "SAGA_UNKNOWN");
    assert_eq!(
        text(&original, "id"),
        Some(&Utf16::from("allocate-equipment"))
    );
}

#[test]
fn forward_order_type_presence_and_exact_finality_obligations_are_reported() {
    let resources = resources();
    let engine = CodegenEngine::new(&resources);
    let mut source = fixture();
    let definition = fixture_definition_mut(&mut source);
    let second = array_mut(member_mut(definition, "steps"), 1);
    let mapping = array_mut(member_mut(second, "inputs"), 0);
    let from = member_mut(mapping, "from");
    if let Value::Object(fields) = from {
        fields.retain(|(key, _)| key != &Utf16::from("step") && key != &Utf16::from("output"));
        fields.push((Utf16::from("step"), s("allocate")));
        fields.push((Utf16::from("output"), s("allocation")));
    }
    let inspected = engine
        .inspect_sagas(&source, &mut Context::ordinary())
        .unwrap();
    assert!(has_code(
        get(&inspected, "validation").unwrap(),
        "SAGA_REFERENCE"
    ));

    let valid = engine
        .inspect_sagas(&fixture(), &mut Context::ordinary())
        .unwrap();
    let ids: Vec<String> = items(&items(&valid, "entries")[0], "obligations")
        .iter()
        .filter_map(|o| text(o, "id").and_then(|id| id.to_utf8().ok()))
        .filter(|id| id.starts_with("saga.invocation.finality/"))
        .collect();
    assert_eq!(
        ids,
        vec![
            "saga.invocation.finality/0/f",
            "saga.invocation.finality/0/c",
            "saga.invocation.finality/1/f",
            "saga.invocation.finality/1/c"
        ]
    );
}

#[test]
fn unfamiliar_recovery_is_retained_incomplete_and_blocks_edits() {
    let resources = resources();
    let engine = CodegenEngine::new(&resources);
    let mut source = fixture();
    let definition = fixture_definition_mut(&mut source);
    let first_step = array_mut(member_mut(definition, "steps"), 0);
    let compensation = member_mut(first_step, "compensation");
    if let Value::Object(fields) = compensation {
        fields.retain(|(key, _)| {
            key != &Utf16::from("action")
                && key != &Utf16::from("binding")
                && key != &Utf16::from("inputs")
        });
        if let Some((_, kind)) = fields
            .iter_mut()
            .find(|(key, _)| key == &Utf16::from("kind"))
        {
            *kind = s("future-recovery");
        }
        fields.push((
            Utf16::from("vendorMeaning"),
            obj(vec![("keep", s("exact"))]),
        ));
    }
    let inspected = engine
        .inspect_sagas(&source, &mut Context::ordinary())
        .unwrap();
    let validation = get(&inspected, "validation").unwrap();
    assert_eq!(get(validation, "valid"), Some(&Value::Bool(true)));
    assert_eq!(get(validation, "complete"), Some(&Value::Bool(false)));
    let replacement = items(
        get(&items(&inspected, "entries")[0], "definition").unwrap(),
        "steps",
    );
    assert_eq!(
        get(&replacement[0], "compensation").and_then(|c| get(c, "vendorMeaning")),
        Some(&obj(vec![("keep", s("exact"))]))
    );
    let identity = obj(vec![
        ("module", s("equipment")),
        ("saga", s("allocate-equipment")),
    ]);
    let definition = get(&items(&inspected, "entries")[0], "definition").unwrap();
    assert_eq!(
        engine
            .edit_saga(&source, &identity, definition, &mut Context::ordinary())
            .unwrap_err()
            .code,
        "SAGA_UNCHECKED"
    );
}

#[test]
fn pivot_warning_is_located_and_wrong_source_claims_refuse() {
    let resources = resources();
    let engine = CodegenEngine::new(&resources);
    let mut source = fixture();
    let definition = fixture_definition_mut(&mut source);
    let first = array_mut(member_mut(definition, "steps"), 0);
    *member_mut(first, "compensation") = obj(vec![
        ("kind", s("irreversible")),
        ("reason", s("External notification")),
    ]);
    let inspected = engine
        .inspect_sagas(&source, &mut Context::ordinary())
        .unwrap();
    assert!(has_code(
        get(&inspected, "validation").unwrap(),
        "SAGA_PIVOT"
    ));
    let identity = obj(vec![
        ("module", s("equipment")),
        ("saga", s("allocate-equipment")),
    ]);
    let caps = obj(vec![
        ("id", s("fixture")),
        ("version", s("1")),
        ("coreVersion", s("0.10.0")),
        ("sagaVersion", s("0.1.0")),
        ("coordination", s("supported")),
        ("claims", arr(vec![])),
        ("source", fixture()),
        ("identity", identity.clone()),
    ]);
    assert_eq!(
        engine
            .assess_saga(&source, &identity, &caps, &mut Context::ordinary())
            .unwrap_err()
            .code,
        "SAGA_PROFILE"
    );
}

#[test]
fn capability_source_uses_json_object_equality_and_preserves_array_order() {
    fn reverse_objects(value: &Value) -> Value {
        match value {
            Value::Object(fields) => Value::Object(
                fields
                    .iter()
                    .rev()
                    .map(|(key, value)| (key.clone(), reverse_objects(value)))
                    .collect(),
            ),
            Value::Array(items) => Value::Array(items.iter().map(reverse_objects).collect()),
            other => other.clone(),
        }
    }
    let resources = resources();
    let engine = CodegenEngine::new(&resources);
    let source = fixture();
    let identity = obj(vec![
        ("module", s("equipment")),
        ("saga", s("allocate-equipment")),
    ]);
    let mut caps = obj(vec![
        ("id", s("fixture")),
        ("version", s("1")),
        ("coreVersion", s("0.10.0")),
        ("sagaVersion", s("0.1.0")),
        ("coordination", s("supported")),
        ("claims", arr(vec![])),
        ("source", reverse_objects(&source)),
        ("identity", identity.clone()),
    ]);
    assert!(matches!(
        engine.assess_saga(&source, &identity, &caps, &mut Context::ordinary()),
        Ok(_)
    ));
    if let Value::Object(fields) = &mut caps {
        let source_field = fields
            .iter_mut()
            .find(|(key, _)| key == &Utf16::from("source"))
            .unwrap();
        let definition = fixture_definition_mut(&mut source_field.1);
        if let Value::Array(steps) = member_mut(definition, "steps") {
            steps.reverse();
        }
    }
    assert_eq!(
        engine
            .assess_saga(&source, &identity, &caps, &mut Context::ordinary())
            .unwrap_err()
            .code,
        "SAGA_PROFILE"
    );
}
