use umf_core::{
    Context, EngineError, Utf16, Value,
    binding_inspection::{BindingInspectionResources, inspect_binding},
    serialization::{Format, read_json_value, stringify_compact},
};

fn parse(source: &str) -> Value {
    read_json_value(
        &source.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        &mut Context::ordinary(),
    )
    .unwrap()
}
fn get<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    match value {
        Value::Object(fields) => fields
            .iter()
            .find(|(key, _)| key == &Utf16::from(name))
            .map(|(_, value)| value),
        _ => None,
    }
}
fn get_mut<'a>(value: &'a mut Value, name: &str) -> Option<&'a mut Value> {
    match value {
        Value::Object(fields) => fields
            .iter_mut()
            .find(|(key, _)| key == &Utf16::from(name))
            .map(|(_, value)| value),
        _ => None,
    }
}
fn array_mut(value: &mut Value) -> Option<&mut Vec<Value>> {
    if let Value::Array(rows) = value {
        Some(rows)
    } else {
        None
    }
}
fn replace(value: &mut Value, name: &str, replacement: Value) {
    let Value::Object(fields) = value else {
        panic!("object expected")
    };
    if let Some((_, current)) = fields.iter_mut().find(|(key, _)| key == &Utf16::from(name)) {
        *current = replacement;
    } else {
        fields.push((Utf16::from(name), replacement));
    }
}
fn set_binding(binding: &mut Value, name: &str, replacement: Value) {
    let payload = get_mut(get_mut(binding, "extensions").unwrap(), "umf.binding").unwrap();
    replace(payload, name, replacement);
}
fn pair(source: &str) -> (Value, Value) {
    let fixture = parse(source);
    (
        get(&fixture, "binding").unwrap().clone(),
        get(&fixture, "logical").unwrap().clone(),
    )
}
fn text(value: &Utf16) -> serde_json::Value {
    serde_json::Value::String(value.to_utf8().unwrap())
}
fn actual(validation: &umf_core::Validation) -> serde_json::Value {
    serde_json::json!({
        "valid": validation.valid,
        "complete": validation.complete,
        "diagnostics": validation.diagnostics.iter().map(|diagnostic| serde_json::json!({
            "code": text(&diagnostic.code),
            "path": text(&diagnostic.path),
            "message": text(&diagnostic.message),
            "severity": match diagnostic.severity {
                umf_core::Severity::Error => "error",
                umf_core::Severity::Warning => "warning",
            },
        })).collect::<Vec<_>>(),
    })
}
fn frozen_gate0() -> serde_json::Value {
    serde_json::from_str(include_str!(
        "../../../docs/helix/04-build/evidence/rust-migration/r5-binding-inspect/frozen-inspections.json"
    ))
    .unwrap()
}
fn frozen_controls() -> serde_json::Value {
    serde_json::from_str(include_str!(
        "../../../docs/helix/04-build/evidence/rust-migration/r5-binding-inspect/rust-controls/frozen-controls.json"
    ))
    .unwrap()
}
fn frozen_review_controls() -> serde_json::Value {
    serde_json::from_str(include_str!(
        "../../../docs/helix/04-build/evidence/rust-migration/r5-binding-inspect/rust-controls/review-controls.json"
    ))
    .unwrap()
}
fn resources() -> BindingInspectionResources {
    BindingInspectionResources::new(&mut Context::ordinary()).unwrap()
}
fn run(
    resources: &BindingInspectionResources,
    binding: &Value,
    logical: &Value,
) -> serde_json::Value {
    actual(&inspect_binding(resources, binding, logical, &mut Context::ordinary()).unwrap())
}
fn payload_mut<'a>(binding: &'a mut Value) -> &'a mut Value {
    get_mut(get_mut(binding, "extensions").unwrap(), "umf.binding").unwrap()
}

#[test]
fn frozen_profiles_unknowns_precedence_and_reference_controls_match() {
    let resources = resources();
    let frozen = frozen_gate0();
    let profiles = [
        (
            "delta",
            include_str!("../../../fixtures/binding/delta/case.json"),
        ),
        (
            "iceberg",
            include_str!("../../../fixtures/binding/iceberg/case.json"),
        ),
        (
            "parquet",
            include_str!("../../../fixtures/binding/parquet/case.json"),
        ),
        (
            "postgresql",
            include_str!("../../../fixtures/binding/postgresql-indexes/case.json"),
        ),
        (
            "sqlserver",
            include_str!("../../../fixtures/binding/sqlserver-indexes/case.json"),
        ),
    ];
    for (name, source) in profiles {
        let (binding, logical) = pair(source);
        let before = (binding.clone(), logical.clone());
        assert_eq!(
            run(&resources, &binding, &logical),
            frozen["cases"][format!("profile/{name}")]
        );
        assert_eq!((binding, logical), before, "{name} inputs changed");
    }

    let (mut stable, logical) = pair(include_str!(
        "../../../fixtures/binding/sqlserver-indexes/case.json"
    ));
    replace(
        get_mut(&mut stable, "vocabularies")
            .and_then(|v| get_mut(v, "umf.binding"))
            .unwrap(),
        "version",
        Value::string_utf8("0.2.0"),
    );
    replace(
        payload_mut(&mut stable),
        "profile",
        Value::string_utf8("umf-binding-2"),
    );
    assert_eq!(
        run(&resources, &stable, &logical),
        frozen["cases"]["profile/stable-ids-0.2"]
    );

    let (mut unsupported, logical) = pair(include_str!(
        "../../../fixtures/binding/sqlserver-indexes/case.json"
    ));
    replace(
        get_mut(&mut unsupported, "vocabularies")
            .and_then(|v| get_mut(v, "umf.binding"))
            .unwrap(),
        "version",
        Value::string_utf8("0.3.0"),
    );
    let unsupported_expected: serde_json::Value = serde_json::from_str(include_str!(
        "../../../docs/helix/04-build/evidence/rust-migration/r5-binding-inspect/rust-controls/rust-profile.json"
    ))
    .unwrap();
    assert_eq!(
        run(&resources, &unsupported, &logical),
        unsupported_expected["unsupportedBindingVocabularyVersions"][0]["result"]
    );

    let (mut binding, logical) = pair(include_str!(
        "../../../fixtures/binding/postgresql-indexes/case.json"
    ));
    set_binding(&mut binding, "future", parse(r#"{"opaque":["x",7]}"#));
    assert_eq!(
        run(&resources, &binding, &logical),
        frozen["cases"]["unknown/retained-only"]
    );

    let (mut binding, logical) = pair(include_str!(
        "../../../fixtures/binding/postgresql-indexes/case.json"
    ));
    let first_index = array_mut(get_mut(payload_mut(&mut binding), "indexes").unwrap())
        .unwrap()
        .first_mut()
        .unwrap();
    replace(first_index, "future", Value::string_utf8("opaque"));
    replace(first_index, "kind", Value::string_utf8("unique"));
    replace(first_index, "unique", Value::Bool(false));
    assert_eq!(
        run(&resources, &binding, &logical),
        frozen["cases"]["unknown/crossed-invalid-index"]
    );

    let (mut binding, logical) = pair(include_str!(
        "../../../fixtures/binding/postgresql-indexes/case.json"
    ));
    let first = array_mut(get_mut(payload_mut(&mut binding), "elements").unwrap())
        .unwrap()
        .first_mut()
        .unwrap();
    replace(first, "element", Value::string_utf8("missing-element"));
    assert_eq!(
        run(&resources, &binding, &logical),
        frozen["cases"]["reference/missing-element"]
    );

    let (mut binding, logical) = pair(include_str!(
        "../../../fixtures/binding/postgresql-indexes/case.json"
    ));
    replace(
        get_mut(payload_mut(&mut binding), "logical").unwrap(),
        "documentId",
        Value::string_utf8("other-model"),
    );
    assert_eq!(
        run(&resources, &binding, &logical),
        frozen["cases"]["model/identity-mismatch"]
    );

    let (binding, mut logical) = pair(include_str!(
        "../../../fixtures/binding/postgresql-indexes/case.json"
    ));
    replace(&mut logical, "umf", Value::string_utf8("9.99.0"));
    assert_eq!(
        run(&resources, &binding, &logical),
        frozen["cases"]["model/invalid-logical"]
    );

    let (mut binding, logical) = pair(include_str!(
        "../../../fixtures/binding/postgresql-indexes/case.json"
    ));
    replace(
        get_mut(&mut binding, "vocabularies")
            .and_then(|v| get_mut(v, "umf.binding"))
            .unwrap(),
        "version",
        Value::string_utf8("9.9.9"),
    );
    replace(
        get_mut(payload_mut(&mut binding), "logical").unwrap(),
        "documentId",
        Value::string_utf8("other-model"),
    );
    assert_eq!(
        run(&resources, &binding, &logical),
        frozen["cases"]["precedence/invalid-binding-before-pair-check"]
    );
}

#[test]
fn supplemental_schema_scope_duplicate_storage_and_exact_reference_controls_match() {
    let resources = resources();
    let frozen = frozen_controls();
    let source = include_str!("../../../fixtures/binding/postgresql-indexes/case.json");

    let mut cases = Vec::<(&str, Value, Value)>::new();
    let (mut binding, logical) = pair(source);
    get_mut(payload_mut(&mut binding), "target").unwrap();
    if let Value::Object(fields) = payload_mut(&mut binding) {
        fields.retain(|(key, _)| key != &Utf16::from("target"));
    }
    cases.push(("schema/missing-target", binding, logical));

    let (mut binding, logical) = pair(source);
    if let Value::Array(modules) = get_mut(&mut binding, "modules").unwrap() {
        modules.push(parse(
            r#"{"id":"unexpected","namespace":"unexpected","elements":[]}"#,
        ));
    }
    cases.push(("scope/nonempty-binding-modules", binding, logical));

    for (case, member) in [
        ("duplicate/element-assignment", "elements"),
        ("duplicate/field-assignment", "fields"),
        ("duplicate/index-name", "indexes"),
    ] {
        let (mut binding, logical) = pair(source);
        let rows = array_mut(get_mut(payload_mut(&mut binding), member).unwrap()).unwrap();
        rows.push(rows[0].clone());
        cases.push((case, binding, logical));
    }
    {
        let (mut binding, logical) = pair(source);
        let first = array_mut(get_mut(payload_mut(&mut binding), "indexes").unwrap())
            .unwrap()
            .first_mut()
            .unwrap();
        let targets = array_mut(get_mut(first, "on").unwrap()).unwrap();
        targets.push(targets[0].clone());
        cases.push(("duplicate/index-target", binding, logical));
    }
    {
        let (mut binding, logical) = pair(source);
        let fields = array_mut(get_mut(payload_mut(&mut binding), "fields").unwrap()).unwrap();
        replace(
            &mut fields[0],
            "path",
            Value::Array(vec![Value::string_utf8("unexpected")]),
        );
        cases.push(("storage/column-with-path", binding, logical));
    }
    {
        let (mut binding, logical) = pair(source);
        let fields = array_mut(get_mut(payload_mut(&mut binding), "fields").unwrap()).unwrap();
        let embedded = fields
            .iter_mut()
            .find(|field| get(field, "storage") == Some(&Value::string_utf8("embedded")))
            .unwrap();
        replace(embedded, "column", Value::string_utf8("shadow"));
        cases.push(("storage/embedded-with-column", binding, logical));
    }
    {
        let (mut binding, logical) = pair(source);
        replace(payload_mut(&mut binding), "indexes", Value::Array(vec![]));
        let fields = array_mut(get_mut(payload_mut(&mut binding), "fields").unwrap()).unwrap();
        replace(
            &mut fields[0],
            "field",
            Value::string_utf8("not-a-ddd-field"),
        );
        cases.push(("reference/exact-ddd-field-required", binding, logical));
    }

    for (case, binding, logical) in cases {
        assert_eq!(
            run(&resources, &binding, &logical),
            frozen["cases"][case],
            "{case}"
        );
    }

    let relationships: Value = parse(include_str!(
        "../../../fixtures/relationship/core-candidate.json"
    ));
    let rows = get(&relationships, "cases")
        .and_then(|rows| match rows {
            Value::Array(rows) => Some(rows.as_slice()),
            _ => None,
        })
        .unwrap();
    let mut logical = rows
        .iter()
        .find(|row| get(row, "id") == Some(&Value::string_utf8("many-to-one")))
        .and_then(|row| get(row, "document"))
        .unwrap()
        .clone();
    replace(&mut logical, "umf", Value::string_utf8("0.10.0"));
    let mut binding = parse(
        r#"{
      "umf":"0.10.0","id":"physical",
      "vocabularies":{"umf.binding":{"version":"0.1.0","future":{"keep":true}}},
      "modules":[],"extensions":{"umf.binding":{
        "profile":"umf-binding-1",
        "logical":{"documentId":"relationships","coreVersion":"0.10.0"},
        "target":{"system":"postgresql","version":"17","subset":"relationship-choices-only"},
        "elements":[],"fields":[],"indexes":[],
        "relationships":[{"module":"m","name":"customer","storage":"foreign_key","future":{"opaque":["retain"]}}],
        "future":{"unknown":true}
      }},"future":{"root":true}
    }"#,
    );
    let relation = array_mut(get_mut(payload_mut(&mut binding), "relationships").unwrap())
        .unwrap()
        .first_mut()
        .unwrap();
    if let Value::Object(properties) = relation {
        properties.retain(|(key, _)| key != &Utf16::from("name"));
    }
    replace(relation, "id", Value::string_utf8("order-customer"));
    replace(
        payload_mut(&mut binding),
        "profile",
        Value::string_utf8("umf-binding-2"),
    );
    replace(
        get_mut(&mut binding, "vocabularies")
            .and_then(|v| get_mut(v, "umf.binding"))
            .unwrap(),
        "version",
        Value::string_utf8("0.2.0"),
    );
    assert_eq!(
        run(&resources, &binding, &logical),
        frozen["cases"]["relationship/stable-id-exact-match"]
    );

    let mut renamed = logical.clone();
    let relationship = array_mut(
        get_mut(
            array_mut(get_mut(&mut renamed, "modules").unwrap())
                .unwrap()
                .first_mut()
                .unwrap(),
            "relationships",
        )
        .unwrap(),
    )
    .unwrap()
    .first_mut()
    .unwrap();
    replace(relationship, "name", Value::string_utf8("customer-renamed"));
    assert_eq!(
        run(&resources, &binding, &renamed),
        frozen["cases"]["relationship/stable-id-survives-name-change"]
    );

    let mut missing = binding.clone();
    let relation = array_mut(get_mut(payload_mut(&mut missing), "relationships").unwrap())
        .unwrap()
        .first_mut()
        .unwrap();
    replace(relation, "id", Value::string_utf8("missing-stable-id"));
    assert_eq!(
        run(&resources, &missing, &logical),
        frozen["cases"]["relationship/stable-id-missing"]
    );
}

#[test]
fn prepared_resources_recover_and_inputs_remain_unchanged() {
    let resources = resources();
    let (mut invalid, logical) = pair(include_str!(
        "../../../fixtures/binding/postgresql-indexes/case.json"
    ));
    if let Value::Object(fields) = payload_mut(&mut invalid) {
        fields.retain(|(key, _)| key != &Utf16::from("target"));
    }
    let before = (invalid.clone(), logical.clone());
    let result = inspect_binding(&resources, &invalid, &logical, &mut Context::ordinary())
        .expect("schema-invalid source returns a Validation, not a control error");
    assert!(!result.valid);
    assert_eq!((invalid, logical), before);

    let (binding, logical) = pair(include_str!(
        "../../../fixtures/binding/postgresql-indexes/case.json"
    ));
    let before = (binding.clone(), logical.clone());
    let report = inspect_binding(&resources, &binding, &logical, &mut Context::ordinary()).unwrap();
    assert_eq!(
        actual(&report),
        frozen_gate0()["cases"]["profile/postgresql"]
    );
    assert_eq!((&binding, &logical), (&before.0, &before.1));

    // Keep a use of the core serializer in this test as an additional shape
    // sanity check for the Validation's closed wire representation.
    assert!(
        stringify_compact(&Value::Bool(report.valid))
            .unwrap()
            .to_utf8()
            .unwrap()
            == "true"
    );

    let mut checkpoints = 0usize;
    let mut control = |_: usize| {
        checkpoints += 1;
        if checkpoints > 50 {
            Err(EngineError::new(
                "INSPECT_TEST_STOP",
                Utf16::default(),
                "inspection interrupted",
            ))
        } else {
            Ok(())
        }
    };
    let mut context = Context::ordinary().with_host_control(&mut control);
    let interrupted = inspect_binding(&resources, &binding, &logical, &mut context).unwrap_err();
    assert_eq!(interrupted.code, "INSPECT_TEST_STOP");
    assert!(interrupted.is_control_failure());
    assert!(checkpoints > 50);

    for code in ["DENIED", "NUMBER"] {
        let mut control =
            |_: usize| Err(EngineError::new(code, Utf16::from("/host"), "host denied"));
        let error = inspect_binding(
            &resources,
            &binding,
            &logical,
            &mut Context::ordinary().with_host_control(&mut control),
        )
        .expect_err("trusted control errors must not become validation data");
        assert_eq!(error.code, code);
        assert!(error.is_control_failure());
    }
}

#[test]
fn focused_review_repairs_match_additive_typescript_controls() {
    let resources = resources();
    let frozen = frozen_review_controls();
    let source = include_str!("../../../fixtures/binding/postgresql-indexes/case.json");

    let (binding, mut logical) = pair(source);
    replace(&mut logical, "future", Value::Number(f64::NAN));
    assert_eq!(
        run(&resources, &binding, &logical),
        frozen["cases"]["admission/logical-number-before-binding"]
    );

    let (binding, mut logical) = pair(source);
    replace(&mut logical, "9", Value::Number(f64::NAN));
    replace(&mut logical, "1", Value::Number(f64::NAN));
    assert_eq!(
        run(&resources, &binding, &logical),
        frozen["cases"]["admission/logical-numeric-key-order"]
    );

    let (mut binding, logical) = pair(source);
    let fields = array_mut(get_mut(payload_mut(&mut binding), "fields").unwrap()).unwrap();
    replace(
        &mut fields[0],
        "documentColumn",
        Value::string_utf8("shadow"),
    );
    assert_eq!(
        run(&resources, &binding, &logical),
        frozen["cases"]["schema/column-with-document-column"]
    );

    let (mut binding, logical) = pair(source);
    let fields = array_mut(get_mut(payload_mut(&mut binding), "fields").unwrap()).unwrap();
    let mut duplicate = fields[0].clone();
    if let Value::Object(properties) = &mut duplicate {
        properties.retain(|(key, _)| key != &Utf16::from("column"));
    }
    replace(&mut duplicate, "storage", Value::string_utf8("embedded"));
    replace(&mut duplicate, "documentColumn", Value::string_utf8("doc"));
    replace(
        &mut duplicate,
        "path",
        Value::Array(vec![Value::string_utf8("x")]),
    );
    fields.push(duplicate);
    assert_eq!(
        run(&resources, &binding, &logical),
        frozen["cases"]["duplicate-field/last-assignment-index-targets"]
    );

    let (mut binding, logical) = pair(source);
    set_binding(&mut binding, "9", Value::Bool(true));
    set_binding(&mut binding, "1", Value::Bool(true));
    assert_eq!(
        run(&resources, &binding, &logical),
        frozen["cases"]["unknown/ecmascript-numeric-property-order"]
    );

    let (mut binding, logical) = pair(source);
    let fields = array_mut(get_mut(payload_mut(&mut binding), "fields").unwrap()).unwrap();
    let mut duplicate = fields[1].clone();
    if let Value::Object(properties) = &mut duplicate {
        properties.retain(|(key, _)| key != &Utf16::from("column"));
    }
    replace(&mut duplicate, "storage", Value::string_utf8("embedded"));
    replace(&mut duplicate, "documentColumn", Value::string_utf8("doc"));
    replace(
        &mut duplicate,
        "path",
        Value::Array(vec![Value::string_utf8("x")]),
    );
    fields.push(duplicate);
    assert_eq!(
        run(&resources, &binding, &logical),
        frozen["cases"]["duplicate-field/last-assignment-include"]
    );
}
