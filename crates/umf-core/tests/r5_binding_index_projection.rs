use umf_core::{
    binding_index_projection::{project_binding_indexes, BindingIndexProjectionResources},
    serialization::{read_json_value, stringify_compact, Format},
    Context, EngineError, Utf16, Value,
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
            .find(|(k, _)| k == &Utf16::from(name))
            .map(|(_, v)| v),
        _ => None,
    }
}
fn get_mut<'a>(value: &'a mut Value, name: &str) -> Option<&'a mut Value> {
    match value {
        Value::Object(fields) => fields
            .iter_mut()
            .find(|(k, _)| k == &Utf16::from(name))
            .map(|(_, v)| v),
        _ => None,
    }
}
fn index_mut(value: &mut Value, index: usize) -> Option<&mut Value> {
    match value {
        Value::Array(items) => items.get_mut(index),
        _ => None,
    }
}
fn replace(value: &mut Value, name: &str, replacement: Value) {
    let Value::Object(fields) = value else {
        panic!("object expected")
    };
    if let Some((_, current)) = fields.iter_mut().find(|(k, _)| k == &Utf16::from(name)) {
        *current = replacement;
    } else {
        fields.push((Utf16::from(name), replacement));
    }
}
fn text(value: &Value) -> String {
    match value {
        Value::String(value) => value.to_utf8().unwrap(),
        _ => panic!("string expected"),
    }
}
fn actual_json(value: &Value) -> serde_json::Value {
    serde_json::from_str(&stringify_compact(value).unwrap().to_utf8().unwrap()).unwrap()
}
fn frozen() -> serde_json::Value {
    serde_json::from_str(include_str!("../../../docs/helix/04-build/evidence/rust-migration/r5-binding-index-projection/frozen-projections.json")).unwrap()
}
fn pair(source: &str) -> (Value, Value) {
    let input = parse(source);
    (
        get(&input, "binding").unwrap().clone(),
        get(&input, "logical").unwrap().clone(),
    )
}
fn resources() -> BindingIndexProjectionResources {
    BindingIndexProjectionResources::new(&mut Context::ordinary()).unwrap()
}
fn run(
    resources: &BindingIndexProjectionResources,
    binding: &Value,
    logical: &Value,
    policy: &str,
) -> Result<Value, EngineError> {
    project_binding_indexes(
        resources,
        binding,
        logical,
        policy,
        &mut Context::ordinary(),
    )
}
fn assert_outcome(report: &Value, index: usize, outcome: &str, reason: Option<&str>) {
    let outcomes = get(report, "outcomes")
        .and_then(|v| {
            if let Value::Array(a) = v {
                Some(a)
            } else {
                None
            }
        })
        .unwrap();
    let row = &outcomes[index];
    assert_eq!(text(get(row, "outcome").unwrap()), outcome.to_owned());
    assert_eq!(get(row, "reason").map(text), reason.map(str::to_owned));
}
fn field_ref(field: &str) -> Value {
    Value::Object(vec![
        (Utf16::from("module"), Value::string_utf8("sales")),
        (Utf16::from("element"), Value::string_utf8("Item")),
        (Utf16::from("field"), Value::string_utf8(field)),
    ])
}
fn direct_target(field: &str) -> Value {
    Value::Object(vec![(Utf16::from("field"), field_ref(field))])
}
fn document_path_target(field: &str) -> Value {
    Value::Object(vec![(
        Utf16::from("documentPath"),
        Value::Object(vec![
            (Utf16::from("field"), field_ref(field)),
            (
                Utf16::from("path"),
                Value::Array(vec![
                    Value::string_utf8("customer"),
                    Value::string_utf8("region"),
                ]),
            ),
        ]),
    )])
}
fn profile_case(system: &str, version: &str) -> (Value, Value) {
    let (mut binding, logical) = pair(include_str!(
        "../../../fixtures/binding/sqlserver-indexes/case.json"
    ));
    let payload = get_mut(get_mut(&mut binding, "extensions").unwrap(), "umf.binding").unwrap();
    let target = get_mut(payload, "target").unwrap();
    replace(target, "system", Value::string_utf8(system));
    replace(target, "version", Value::string_utf8(version));
    replace(target, "subset", Value::string_utf8("r5-index-profile"));
    replace(
        payload,
        "indexes",
        Value::Array(vec![Value::Object(vec![
            (Utf16::from("name"), Value::string_utf8("r5_index")),
            (Utf16::from("kind"), Value::string_utf8("clustering")),
            (Utf16::from("on"), Value::Array(vec![direct_target("id")])),
            (Utf16::from("unique"), Value::Bool(false)),
        ])]),
    );
    (binding, logical)
}

#[test]
fn frozen_profile_reports_match_complete_predecessor_results() {
    let resources = resources();
    let cases = [
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
    let baseline = frozen();
    for (name, source) in cases {
        let (binding, logical) = pair(source);
        let binding_before = binding.clone();
        let logical_before = logical.clone();
        for policy in ["report", "strict"] {
            let actual = actual_json(&run(&resources, &binding, &logical, policy).unwrap());
            assert_eq!(actual, baseline["cases"][name][policy], "{name}/{policy}");
        }
        assert_eq!(binding, binding_before, "{name} binding input changed");
        assert_eq!(logical, logical_before, "{name} logical input changed");
    }
}

#[test]
fn schema_invalid_index_kinds_and_empty_or_malformed_targets_are_refused() {
    let resources = resources();
    for invalid in ["kind", "empty-on", "malformed-on"] {
        let (mut binding, logical) = pair(include_str!(
            "../../../fixtures/binding/postgresql-indexes/case.json"
        ));
        let payload = get_mut(get_mut(&mut binding, "extensions").unwrap(), "umf.binding").unwrap();
        let first = index_mut(get_mut(payload, "indexes").unwrap(), 0).unwrap();
        match invalid {
            "kind" => replace(first, "kind", Value::string_utf8("mystery")),
            "empty-on" => replace(first, "on", Value::Array(vec![])),
            "malformed-on" => replace(first, "on", Value::Array(vec![Value::Null])),
            _ => unreachable!(),
        }
        let error = run(&resources, &binding, &logical, "report").unwrap_err();
        assert_eq!(error.code, "BINDING_DOCUMENT", "{invalid}");
        assert!(
            error.message.to_utf8().unwrap().contains("BINDING_SCHEMA"),
            "{invalid}: {}",
            error.message.to_utf8().unwrap()
        );
    }
}

#[test]
fn prepared_validation_resources_recover_after_a_refusal() {
    let resources = resources();
    let (mut invalid, logical) = pair(include_str!(
        "../../../fixtures/binding/postgresql-indexes/case.json"
    ));
    let payload = get_mut(get_mut(&mut invalid, "extensions").unwrap(), "umf.binding").unwrap();
    replace(
        index_mut(get_mut(payload, "indexes").unwrap(), 0).unwrap(),
        "kind",
        Value::string_utf8("invalid-kind"),
    );
    assert_eq!(
        run(&resources, &invalid, &logical, "report")
            .unwrap_err()
            .code,
        "BINDING_DOCUMENT"
    );

    let (binding, logical) = pair(include_str!(
        "../../../fixtures/binding/postgresql-indexes/case.json"
    ));
    let expected = &frozen()["cases"]["postgresql"]["report"];
    assert_eq!(
        actual_json(&run(&resources, &binding, &logical, "report").unwrap()),
        *expected
    );
}

#[test]
fn invalid_logical_core_model_is_refused_before_projection() {
    let resources = resources();
    let (binding, mut logical) = pair(include_str!(
        "../../../fixtures/binding/postgresql-indexes/case.json"
    ));
    replace(&mut logical, "modules", Value::string_utf8("malformed"));
    let error = run(&resources, &binding, &logical, "report").unwrap_err();
    assert_eq!(error.code, "BINDING_DOCUMENT");
    assert!(error
        .message
        .to_utf8()
        .unwrap()
        .contains("Supplied logical document is invalid"));
}

#[test]
fn diagnostic_serialization_propagates_late_meter_denial() {
    let resources = resources();
    let (mut binding, logical) = pair(include_str!(
        "../../../fixtures/binding/postgresql-indexes/case.json"
    ));
    let payload = get_mut(get_mut(&mut binding, "extensions").unwrap(), "umf.binding").unwrap();
    replace(
        index_mut(get_mut(payload, "indexes").unwrap(), 0).unwrap(),
        "kind",
        Value::string_utf8("mystery"),
    );
    assert_eq!(
        run(&resources, &binding, &logical, "report")
            .unwrap_err()
            .code,
        "BINDING_DOCUMENT"
    );

    let mut measured = 0usize;
    let result = {
        let mut meter = |amount| {
            measured += amount;
            Ok(())
        };
        let mut context = Context::ordinary().with_meter(&mut meter);
        project_binding_indexes(&resources, &binding, &logical, "report", &mut context)
    };
    assert_eq!(result.unwrap_err().code, "BINDING_DOCUMENT");
    assert!(measured > 1);

    let budget = measured - 1;
    let mut charged = 0usize;
    let mut meter = |amount| {
        charged = charged.saturating_add(amount);
        if charged > budget {
            Err(EngineError::new(
                "METER_DENIED",
                Utf16::default(),
                "test meter denied diagnostic work",
            ))
        } else {
            Ok(())
        }
    };
    let mut context = Context::ordinary().with_meter(&mut meter);
    let error = project_binding_indexes(&resources, &binding, &logical, "report", &mut context)
        .unwrap_err();
    assert_eq!(
        error.code, "METER_DENIED",
        "measured={measured} budget={budget} charged={charged}"
    );
    assert!(error.is_control_failure());
}

#[test]
fn unknown_content_precedes_semantic_invalidity_and_paired_identity_is_exact() {
    let resources = resources();
    let (mut binding, logical) = pair(include_str!(
        "../../../fixtures/binding/postgresql-indexes/case.json"
    ));
    let payload = get_mut(get_mut(&mut binding, "extensions").unwrap(), "umf.binding").unwrap();
    let first = index_mut(get_mut(payload, "indexes").unwrap(), 0).unwrap();
    replace(
        first,
        "future",
        Value::Object(vec![(
            Utf16::from("operator"),
            Value::string_utf8("opaque"),
        )]),
    );
    replace(first, "kind", Value::string_utf8("unique"));
    replace(first, "unique", Value::Bool(false));
    let error = run(&resources, &binding, &logical, "report").unwrap_err();
    assert_eq!(error.code, "BINDING_INCOMPLETE");
    assert_eq!(
        error.message.to_utf8().unwrap(),
        "Unknown binding content may affect index projection"
    );
    assert_eq!(error.path, Utf16::default());

    let (mut binding, logical) = pair(include_str!(
        "../../../fixtures/binding/postgresql-indexes/case.json"
    ));
    let payload = get_mut(get_mut(&mut binding, "extensions").unwrap(), "umf.binding").unwrap();
    replace(
        get_mut(payload, "logical").unwrap(),
        "documentId",
        Value::string_utf8("other-model"),
    );
    let error = run(&resources, &binding, &logical, "report").unwrap_err();
    assert_eq!(error.code, "BINDING_DOCUMENT");
    assert_eq!(error.path, Utf16::default());
    assert_eq!(error.message.to_utf8().unwrap(),"[{\"code\":\"BINDING_MODEL\",\"path\":\"/extensions/umf.binding/logical\",\"message\":\"Logical document id/version mismatch\",\"severity\":\"error\"}]");
}

#[test]
fn postgres_predicate_language_and_version_mismatches_are_unknown() {
    let resources = resources();
    for (field, value) in [("language", "tsql"), ("version", "16.0")] {
        let (mut binding, logical) = pair(include_str!(
            "../../../fixtures/binding/postgresql-indexes/case.json"
        ));
        let payload = get_mut(get_mut(&mut binding, "extensions").unwrap(), "umf.binding").unwrap();
        let predicate = get_mut(
            index_mut(get_mut(payload, "indexes").unwrap(), 5).unwrap(),
            "predicate",
        )
        .unwrap();
        replace(predicate, field, Value::string_utf8(value));
        let report = run(&resources, &binding, &logical, "report").unwrap();
        assert_outcome(
            &report,
            5,
            "unknown",
            Some("Predicate language/version is not the selected PostgreSQL profile"),
        );
        assert_eq!(
            get(&report, "status").map(text),
            Some("reported".to_owned())
        );
        assert_eq!(
            get(&report, "candidate").and_then(|v| if let Value::Array(a) = v {
                Some(a.len())
            } else {
                None
            }),
            Some(6)
        );
    }
}

#[test]
fn delta_version_column_include_and_document_path_boundaries_are_preserved() {
    let resources = resources();
    let (mut binding, logical) = profile_case("delta", "3.2");
    let payload = get_mut(get_mut(&mut binding, "extensions").unwrap(), "umf.binding").unwrap();
    replace(
        get_mut(payload, "target").unwrap(),
        "version",
        Value::string_utf8("3.1"),
    );
    assert_outcome(
        &run(&resources, &binding, &logical, "report").unwrap(),
        0,
        "unknown",
        Some("Liquid-clustering profile requires pinned Delta 3.2 or later 3.x"),
    );

    for version in ["3.02", "03.2"] {
        let (mut binding, logical) = profile_case("delta", "3.2");
        let payload = get_mut(get_mut(&mut binding, "extensions").unwrap(), "umf.binding").unwrap();
        replace(
            get_mut(payload, "target").unwrap(),
            "version",
            Value::string_utf8(version),
        );
        assert_outcome(
            &run(&resources, &binding, &logical, "report").unwrap(),
            0,
            "unknown",
            Some("Liquid-clustering profile requires pinned Delta 3.2 or later 3.x"),
        );
    }

    let (mut binding, logical) = profile_case("delta", "3.2");
    let payload = get_mut(get_mut(&mut binding, "extensions").unwrap(), "umf.binding").unwrap();
    let details = index_mut(get_mut(payload, "fields").unwrap(), 4).unwrap();
    replace(details, "storage", Value::string_utf8("column"));
    replace(details, "column", Value::string_utf8("details"));
    if let Value::Object(fields) = details {
        fields.retain(|(key, _)| {
            key != &Utf16::from("documentColumn") && key != &Utf16::from("path")
        });
    }
    let item = index_mut(get_mut(payload, "indexes").unwrap(), 0).unwrap();
    let targets = ["id", "email", "active", "payload", "details"]
        .into_iter()
        .map(direct_target)
        .collect();
    replace(item, "on", Value::Array(targets));
    let report = run(&resources, &binding, &logical, "report").unwrap();
    assert_outcome(&report,0,"not-expressible",Some("Liquid clustering requires at most four direct columns and no included or document-path targets"));

    let (mut binding, logical) = profile_case("delta", "3.2");
    let payload = get_mut(get_mut(&mut binding, "extensions").unwrap(), "umf.binding").unwrap();
    let item = index_mut(get_mut(payload, "indexes").unwrap(), 0).unwrap();
    replace(item, "include", Value::Array(vec![field_ref("payload")]));
    let report = run(&resources, &binding, &logical, "report").unwrap();
    assert_outcome(&report,0,"not-expressible",Some("Liquid clustering requires at most four direct columns and no included or document-path targets"));

    let (mut binding, logical) = profile_case("delta", "3.2");
    let payload = get_mut(get_mut(&mut binding, "extensions").unwrap(), "umf.binding").unwrap();
    let item = index_mut(get_mut(payload, "indexes").unwrap(), 0).unwrap();
    replace(
        item,
        "on",
        Value::Array(vec![document_path_target("details")]),
    );
    let report = run(&resources, &binding, &logical, "report").unwrap();
    assert_outcome(&report,0,"not-expressible",Some("Liquid clustering requires at most four direct columns and no included or document-path targets"));
}

#[test]
fn iceberg_version_include_and_document_path_boundaries_are_preserved() {
    let resources = resources();
    let (mut binding, logical) = profile_case("iceberg", "3.0");
    let payload = get_mut(get_mut(&mut binding, "extensions").unwrap(), "umf.binding").unwrap();
    replace(
        get_mut(payload, "target").unwrap(),
        "version",
        Value::string_utf8("1.6"),
    );
    assert_outcome(
        &run(&resources, &binding, &logical, "report").unwrap(),
        0,
        "unknown",
        Some("Sort-order analogue requires a pinned Iceberg v2 or v3 metadata profile"),
    );

    let (mut binding, logical) = profile_case("iceberg", "3.0");
    let payload = get_mut(get_mut(&mut binding, "extensions").unwrap(), "umf.binding").unwrap();
    let item = index_mut(get_mut(payload, "indexes").unwrap(), 0).unwrap();
    replace(item, "include", Value::Array(vec![field_ref("payload")]));
    assert_outcome(&run(&resources, &binding, &logical, "report").unwrap(),0,"not-expressible",Some("This Iceberg profile maps direct columns only; includes and document paths are unsupported"));

    let (mut binding, logical) = profile_case("iceberg", "3.0");
    let payload = get_mut(get_mut(&mut binding, "extensions").unwrap(), "umf.binding").unwrap();
    let item = index_mut(get_mut(payload, "indexes").unwrap(), 0).unwrap();
    replace(
        item,
        "on",
        Value::Array(vec![document_path_target("details")]),
    );
    assert_outcome(&run(&resources, &binding, &logical, "report").unwrap(),0,"not-expressible",Some("This Iceberg profile maps direct columns only; includes and document paths are unsupported"));
}
