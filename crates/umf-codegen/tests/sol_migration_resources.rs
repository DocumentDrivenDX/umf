// SPDX-License-Identifier: MIT OR Apache-2.0
//! Controls must remain live after public admission and inside migration work.
use std::{fs, path::Path};
use umf_codegen::value::member;
use umf_codegen::{CodegenEngine, CodegenResources};
use umf_core::serialization::{read_json_value, Format};
use umf_core::{Context, EngineError, ResourceSet, Utf16, Value};
fn root() -> std::path::PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../..")
}
fn load(path: &str) -> Value {
    let text = fs::read_to_string(root().join(path)).unwrap();
    read_json_value(
        &text.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        &mut Context::catalog(),
    )
    .unwrap()
}
fn obj(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(fields.into_iter().map(|(k, v)| (k.into(), v)).collect())
}
fn member_mut<'a>(value: &'a mut Value, name: &str) -> &'a mut Value {
    let Value::Object(fields) = value else {
        panic!("expected object")
    };
    fields
        .iter_mut()
        .find(|(key, _)| key == &Utf16::from(name))
        .map(|(_, value)| value)
        .unwrap_or_else(|| panic!("missing {name}"))
}
fn array_mut(value: &mut Value) -> &mut Vec<Value> {
    let Value::Array(items) = value else {
        panic!("expected array")
    };
    items
}
fn resources() -> CodegenResources {
    let t = load("spec/extensions/tables/package.json");
    let a = load("spec/extensions/actions/package.json");
    let ts = umf_codegen::value::member(&t, "schema").unwrap().clone();
    let as_ = umf_codegen::value::member(&a, "schema").unwrap().clone();
    CodegenResources::new(
        ResourceSet::new(
            load("spec/core/schema.json"),
            load("spec/core/semantic-type-reference.schema.json"),
            load("spec/core/extension-package.schema.json"),
            load("spec/metamodel/generated/core-constraints.json"),
            load("spec/metamodel/generated/domain-policy.json"),
        ),
        t,
        ts,
        a,
        as_,
        load("spec/extensions/binding/package.json"),
        load("spec/extensions/binding-stable/package.json"),
        &mut Context::catalog(),
    )
    .unwrap()
}
fn g04_bundle(
    engine: &CodegenEngine<'_>,
    fixture: &Value,
    configuration: &Value,
    field_id: &str,
    scalar_type: &str,
    native_type: Value,
    facets: Option<Value>,
) -> Value {
    let mut source = fixture.clone();
    let module = &mut array_mut(member_mut(&mut source, "modules"))[0];
    let mut field = vec![
        ("id", Value::string_utf8(field_id)),
        ("kind", Value::string_utf8("field")),
        ("scalarType", Value::string_utf8(scalar_type)),
        ("cardinality", Value::string_utf8("one")),
        ("nullability", Value::string_utf8("absent-allowed")),
        ("extensions", obj(vec![])),
    ];
    if let Some(facets) = facets {
        field.push(("facets", facets));
    }
    array_mut(member_mut(module, "elements")).insert(2, obj(field));
    let record = array_mut(member_mut(module, "elements"))
        .iter_mut()
        .find(|element| member(element, "id") == Some(&Value::string_utf8("Note")))
        .unwrap();
    array_mut(member_mut(record, "members")).push(obj(vec![
        ("module", Value::string_utf8("demo")),
        ("element", Value::string_utf8(field_id)),
    ]));
    let table = array_mut(member_mut(
        member_mut(member_mut(module, "extensions"), "umf.tables"),
        "tables",
    ))
    .first_mut()
    .unwrap();
    array_mut(member_mut(table, "columns")).push(obj(vec![
        (
            "field",
            obj(vec![
                ("module", Value::string_utf8("demo")),
                ("element", Value::string_utf8(field_id)),
            ]),
        ),
        ("name", Value::string_utf8(field_id)),
        ("nativeType", native_type),
    ]));
    let text =
        umf_core::serialization::write_json_value(&source, Format::Json, &mut Context::ordinary())
            .unwrap();
    let text = text.to_utf8().unwrap();
    let request = obj(vec![
        ("text", Value::string_utf8(&text)),
        ("configuration", configuration.clone()),
    ]);
    let result = engine
        .compile_table_deployment(&request, &mut Context::ordinary())
        .unwrap();
    assert_eq!(
        member(&result, "status"),
        Some(&Value::string_utf8("compiled")),
        "fixture deployment diagnostics: {:?}",
        member(&result, "diagnostics")
    );
    member(&result, "bundle").unwrap().clone()
}
#[test]
fn sol_row_normalization_polls_after_admission_before_diagnostic_work() {
    let resources = resources();
    let engine = CodegenEngine::new(&resources);
    let input = obj(vec![
        (
            "input",
            Value::Object(
                (0..2000)
                    .map(|i| (Utf16::from(format!("future{i}")), Value::Bool(true)))
                    .collect(),
            ),
        ),
        ("context", obj(vec![])),
    ]);
    let mut admissions = 0;
    {
        let mut count = |_| {
            admissions += 1;
            Ok(())
        };
        umf_codegen::value::admit_json(&input, &mut Context::ordinary().with_meter(&mut count))
            .unwrap();
    }
    let mut calls = 0;
    let mut cancel = |_| {
        calls += 1;
        if calls > admissions {
            Err(EngineError::new(
                "NUMBER",
                Utf16::from("/host"),
                "mid-work cancellation",
            ))
        } else {
            Ok(())
        }
    };
    let error = engine
        .normalize_row_scope(&input, &mut Context::ordinary().with_meter(&mut cancel))
        .unwrap_err();
    assert!(error.is_control_failure());
    assert_eq!(error.code, "NUMBER");
    assert_eq!(error.path, Utf16::from("/host"));
    assert!(calls > admissions);
}
#[test]
fn sol_migration_and_discovery_preserve_late_semantic_looking_host_failures() {
    let resources = resources();
    let engine = CodegenEngine::new(&resources);
    let fixture = load("tests/rust-core/fixtures/r3/sol-implementation-closure/frozen.json");
    let cases =
        umf_codegen::value::array_items(umf_codegen::value::member(&fixture, "cases").unwrap())
            .unwrap();
    let request = umf_codegen::value::member(&cases[0], "request").unwrap();
    let previous = umf_codegen::value::member(request, "previous").unwrap();
    let next = umf_codegen::value::member(request, "next").unwrap();
    for operation in 0..2 {
        let mut total = 0;
        {
            let mut count = |_| {
                total += 1;
                Ok(())
            };
            let mut ctx = Context::ordinary().with_meter(&mut count);
            if operation == 0 {
                engine.compile_table_migration(request, &mut ctx).unwrap();
            } else {
                engine
                    .discover_table_migration_changes(previous, next, &mut ctx)
                    .unwrap();
            }
        }
        assert!(total > 100);
        let threshold = total * 3 / 4;
        let mut calls = 0;
        let mut stop = |_| {
            calls += 1;
            if calls > threshold {
                Err(EngineError::new(
                    "LIMIT",
                    Utf16::from("/host"),
                    "late resource refusal",
                ))
            } else {
                Ok(())
            }
        };
        let mut ctx = Context::ordinary().with_meter(&mut stop);
        let result = if operation == 0 {
            engine.compile_table_migration(request, &mut ctx)
        } else {
            engine.discover_table_migration_changes(previous, next, &mut ctx)
        };
        let error = result.unwrap_err();
        assert!(error.is_control_failure());
        assert_eq!(error.code, "LIMIT");
        assert_eq!(error.path, Utf16::from("/host"));
    }
}

#[test]
fn g02_04_native_compiles_and_recompiles_derived_append() {
    let resources = resources();
    let engine = CodegenEngine::new(&resources);
    let mut source = load("tests/binding/fixtures/table-lifecycle-note.json");
    let configuration = obj(vec![
        ("module", Value::string_utf8("demo")),
        ("schema", Value::string_utf8("g02_demo")),
        ("ownerRole", Value::string_utf8("g02_owner")),
        ("personRole", Value::string_utf8("g02_person")),
        ("batchRole", Value::string_utf8("g02_batch")),
        ("groupRoles", obj(vec![])),
    ]);
    let compile_doc = |document: &Value| {
        let text = umf_core::serialization::write_json_value(
            document,
            Format::Json,
            &mut Context::ordinary(),
        )
        .unwrap()
        .to_utf8()
        .unwrap();
        let result = engine
            .compile_table_deployment(
                &obj(vec![
                    ("text", Value::string_utf8(&text)),
                    ("configuration", configuration.clone()),
                ]),
                &mut Context::ordinary(),
            )
            .unwrap();
        assert_eq!(
            member(&result, "status"),
            Some(&Value::string_utf8("compiled")),
            "{result:?}"
        );
        member(&result, "bundle").unwrap().clone()
    };
    let previous = compile_doc(&source);
    let module = &mut array_mut(member_mut(&mut source, "modules"))[0];
    array_mut(member_mut(module, "elements")).push(obj(vec![
        ("id", Value::string_utf8("summary")),
        ("kind", Value::string_utf8("field")),
        ("scalarType", Value::string_utf8("string")),
        ("cardinality", Value::string_utf8("one")),
        ("nullability", Value::string_utf8("required")),
        (
            "facets",
            obj(vec![(
                "length",
                obj(vec![
                    ("min", Value::Number(1.0)),
                    ("max", Value::Number(100.0)),
                    ("unit", Value::string_utf8("unicode-scalar")),
                ]),
            )]),
        ),
        ("extensions", obj(vec![])),
    ]));
    let record = array_mut(member_mut(module, "elements"))
        .iter_mut()
        .find(|element| member(element, "id") == Some(&Value::string_utf8("Note")))
        .unwrap();
    let reference = |element: &str| {
        obj(vec![
            ("module", Value::string_utf8("demo")),
            ("element", Value::string_utf8(element)),
        ])
    };
    array_mut(member_mut(record, "members")).push(reference("summary"));
    let payload = member_mut(member_mut(module, "extensions"), "umf.tables");
    let table = array_mut(member_mut(payload, "tables"))
        .first_mut()
        .unwrap();
    array_mut(member_mut(table, "columns")).push(obj(vec![
        ("field", reference("summary")),
        ("name", Value::string_utf8("summary")),
        (
            "nativeType",
            obj(vec![("kind", Value::string_utf8("text"))]),
        ),
    ]));
    let expression = obj(vec![
        ("op", Value::string_utf8("concat")),
        (
            "args",
            Value::Array(vec![
                obj(vec![
                    ("op", Value::string_utf8("field")),
                    ("field", reference("owner")),
                ]),
                obj(vec![
                    ("op", Value::string_utf8("literal")),
                    ("value", obj(vec![("string", Value::string_utf8(" / "))])),
                ]),
                obj(vec![
                    ("op", Value::string_utf8("field")),
                    ("field", reference("id")),
                ]),
            ]),
        ),
    ]);
    array_mut(member_mut(payload, "commands")).push(obj(vec![
        ("version", Value::string_utf8("umf.table-operation/0.2")),
        ("id", Value::string_utf8("derive_summary")),
        ("parameters", Value::Array(vec![])),
        ("consistency", Value::string_utf8("transaction")),
        ("replay", Value::string_utf8("caller-key-required")),
        (
            "body",
            obj(vec![
                ("kind", Value::string_utf8("update")),
                ("table", Value::string_utf8("notes")),
                (
                    "where",
                    obj(vec![
                        ("op", Value::string_utf8("isNull")),
                        ("field", reference("summary")),
                    ]),
                ),
                (
                    "values",
                    Value::Array(vec![obj(vec![
                        ("field", reference("summary")),
                        (
                            "value",
                            obj(vec![
                                ("kind", Value::string_utf8("rowExpression")),
                                ("expression", expression),
                            ]),
                        ),
                    ])]),
                ),
                ("returning", Value::Array(vec![])),
                ("maxRows", Value::Number(100.0)),
            ]),
        ),
    ]));
    let next = compile_doc(&source);
    let options = obj(vec![
        (
            "version",
            Value::string_utf8("umf.table-migration-options/0.4"),
        ),
        (
            "backfills",
            Value::Array(vec![obj(vec![
                ("table", Value::string_utf8("notes")),
                ("column", reference("summary")),
                ("operation", Value::string_utf8("derive_summary")),
                ("scopedRows", Value::Bool(true)),
            ])]),
        ),
        ("concurrentIndexes", Value::Array(vec![])),
        ("reviewedChanges", Value::Array(vec![])),
        ("validations", Value::Array(vec![])),
    ]);
    let request = obj(vec![
        ("id", Value::string_utf8("g02-native-next")),
        (
            "predecessor",
            obj(vec![
                ("id", Value::string_utf8("g02-native-previous")),
                ("digest", Value::string_utf8(&"a".repeat(64))),
            ]),
        ),
        ("previous", previous),
        ("next", next),
        ("options", options),
    ]);
    let result = engine
        .compile_table_migration(&request, &mut Context::ordinary())
        .unwrap();
    assert_eq!(
        member(&result, "status"),
        Some(&Value::string_utf8("compiled")),
        "{result:?}"
    );
    let plan = member(&result, "plan").unwrap();
    assert_eq!(
        member(plan, "version"),
        Some(&Value::string_utf8("umf.table-migration/0.4"))
    );
    assert_eq!(
        member(plan, "executionProfile").and_then(|v| member(v, "version")),
        Some(&Value::string_utf8("umf.table-migration-execution/0.3"))
    );
    let steps = umf_codegen::value::array_items(member(plan, "steps").unwrap()).unwrap();
    let roles = steps
        .iter()
        .map(|step| match member(step, "phaseOperation") {
            Some(Value::String(value)) => value.to_utf8().ok(),
            _ => None,
        })
        .collect::<Vec<_>>();
    assert_eq!(
        roles,
        vec![
            None,
            Some("add-column".into()),
            Some("target-check".into()),
            Some("backfill".into()),
            Some("tighten-not-null".into()),
            None,
        ],
        "{steps:?}"
    );
    assert!(member(&steps[0], "sql")
        .and_then(|value| match value {
            Value::String(text) => text.to_utf8().ok(),
            _ => None,
        })
        .is_some_and(|sql| sql.starts_with("REVOKE UPDATE ")));
    assert!(member(&steps[5], "sql")
        .and_then(|value| match value {
            Value::String(text) => text.to_utf8().ok(),
            _ => None,
        })
        .is_some_and(|sql| sql.starts_with("GRANT UPDATE ")));
    let phases = umf_codegen::value::array_items(member(plan, "phases").unwrap()).unwrap();
    assert_eq!(
        member(&phases[0], "kind"),
        Some(&Value::string_utf8("transaction"))
    );
    assert_eq!(
        member(&phases[1], "kind"),
        Some(&Value::string_utf8("backfill-add"))
    );
    assert_eq!(
        member(&phases[2], "kind"),
        Some(&Value::string_utf8("transaction"))
    );
    assert_eq!(
        engine
            .verify_table_migration(plan, &mut Context::ordinary())
            .unwrap(),
        *plan
    );
    let mut invalid = request;
    let backfill = &mut array_mut(member_mut(member_mut(&mut invalid, "options"), "backfills"))[0];
    *member_mut(backfill, "operation") = Value::string_utf8("missing_operation");
    let refused = engine
        .compile_table_migration(&invalid, &mut Context::ordinary())
        .unwrap();
    assert_eq!(
        member(&refused, "status"),
        Some(&Value::string_utf8("blocked"))
    );
}

#[test]
fn row_scope_host_admission_runs_between_native_prepare_and_integrity_checked_complete() {
    let resources = resources();
    let engine = CodegenEngine::new(&resources);
    let fixture = load("crates/umf-codegen/tests/fixtures/migration-selected-operations.json");
    let cases =
        umf_codegen::value::array_items(umf_codegen::value::member(&fixture, "cases").unwrap())
            .unwrap();
    let case = cases
        .iter()
        .find(|case| {
            umf_codegen::value::member(case, "id").is_some_and(|id| {
                id == &Value::string_utf8("row-scope/supplied-owner-via-group-batch")
            })
        })
        .unwrap();
    let request = umf_codegen::value::member(case, "request").unwrap();
    let prepared = engine
        .prepare_row_scope(request, &mut Context::ordinary())
        .unwrap();
    assert_eq!(
        umf_codegen::value::member(&prepared, "valid"),
        Some(&Value::Bool(true))
    );
    let host_diagnostics = Value::Array(vec![]);
    let completed = engine
        .complete_row_scope(
            request,
            &prepared,
            &host_diagnostics,
            &mut Context::ordinary(),
        )
        .unwrap();
    assert_eq!(completed, prepared);

    let host_refusal = Value::Array(vec![obj(vec![
        ("code", Value::string_utf8("HOST_POLICY")),
        ("path", Value::string_utf8("/policy")),
        (
            "message",
            Value::string_utf8("Host policy admission refused"),
        ),
    ])]);
    let refused = engine
        .complete_row_scope(request, &prepared, &host_refusal, &mut Context::ordinary())
        .unwrap();
    assert_eq!(
        umf_codegen::value::member(&refused, "valid"),
        Some(&Value::Bool(false))
    );
    assert!(umf_codegen::value::member(&refused, "policy").is_none());
    assert_eq!(
        umf_codegen::value::array_items(
            umf_codegen::value::member(&refused, "diagnostics").unwrap()
        )
        .unwrap()
        .len(),
        1
    );

    let mut altered = prepared.clone();
    if let Value::Object(fields) = &mut altered {
        let map = fields
            .iter_mut()
            .find(|(key, _)| key == &Utf16::from("sourceToOutput"))
            .unwrap();
        map.1 = obj(vec![]);
    }
    let error = engine
        .complete_row_scope(
            request,
            &altered,
            &host_diagnostics,
            &mut Context::ordinary(),
        )
        .unwrap_err();
    assert_eq!(error.code, "ROW_SCOPE_CALLBACK");
}

#[test]
fn migration_selector_03_emits_operation_changes_while_02_does_not_fallback() {
    let resources = resources();
    let engine = CodegenEngine::new(&resources);
    let fixture = load("crates/umf-codegen/tests/fixtures/migration-selected-operations.json");
    let cases =
        umf_codegen::value::array_items(umf_codegen::value::member(&fixture, "cases").unwrap())
            .unwrap();
    let case = cases
        .iter()
        .find(|case| {
            umf_codegen::value::member(case, "id")
                .is_some_and(|id| id == &Value::string_utf8("migration/command-only-revision"))
        })
        .unwrap();
    let request = umf_codegen::value::member(case, "request").unwrap();
    let previous = umf_codegen::value::member(request, "previous").unwrap();
    let next = umf_codegen::value::member(request, "next").unwrap();
    let selector = obj(vec![(
        "version",
        Value::string_utf8("umf.table-migration-discovery/0.3"),
    )]);
    let legacy = engine
        .discover_table_migration_changes_selected(
            previous,
            next,
            Some(&obj(vec![(
                "version",
                Value::string_utf8("umf.table-migration-discovery/0.2"),
            )])),
            &mut Context::ordinary(),
        )
        .unwrap();
    assert!(!umf_codegen::value::array_items(&legacy)
        .unwrap()
        .iter()
        .any(|row| umf_codegen::value::member(row, "kind")
            == Some(&Value::string_utf8("change-operation"))));
    let changes = engine
        .discover_table_migration_changes_selected(
            previous,
            next,
            Some(&selector),
            &mut Context::ordinary(),
        )
        .unwrap();
    let rows = umf_codegen::value::array_items(&changes).unwrap();
    assert!(rows
        .iter()
        .any(|row| umf_codegen::value::member(row, "kind")
            == Some(&Value::string_utf8("change-operation"))));
    assert!(rows
        .iter()
        .filter(|row| umf_codegen::value::member(row, "kind")
            == Some(&Value::string_utf8("change-operation")))
        .all(|row| umf_codegen::value::member(row, "oldPath").is_some()
            && umf_codegen::value::member(row, "newPath").is_some()));
    if let Some(first_operation) = rows.iter().position(|row| {
        matches!(
            umf_codegen::value::member(row, "kind"),
            Some(Value::String(kind)) if kind == &Utf16::from("change-operation")
                || kind == &Utf16::from("change-operation-context")
        )
    }) {
        assert!(rows[first_operation..].iter().all(|row| {
            matches!(
                umf_codegen::value::member(row, "kind"),
                Some(Value::String(kind)) if kind == &Utf16::from("change-operation")
                    || kind == &Utf16::from("change-operation-context")
            )
        }));
    }
    let bad = obj(vec![
        (
            "version",
            Value::string_utf8("umf.table-migration-discovery/0.4"),
        ),
        ("conversionIntents", Value::Array(vec![Value::Null])),
    ]);
    assert_eq!(
        engine
            .discover_table_migration_changes_selected(
                previous,
                next,
                Some(&bad),
                &mut Context::ordinary()
            )
            .unwrap_err()
            .code,
        "MIGRATION_CHANGES_FAILED"
    );
    let valid_but_unimplemented = obj(vec![
        (
            "version",
            Value::string_utf8("umf.table-migration-discovery/0.4"),
        ),
        (
            "conversionIntents",
            Value::Array(vec![obj(vec![
                ("table", Value::string_utf8("orders")),
                (
                    "field",
                    obj(vec![
                        ("module", Value::string_utf8("example")),
                        ("element", Value::string_utf8("amount")),
                    ]),
                ),
                (
                    "recipe",
                    obj(vec![
                        ("version", Value::string_utf8("umf.conversion-recipe/0.1")),
                        ("kind", Value::string_utf8("numeric-exact")),
                        ("parameters", obj(vec![])),
                    ]),
                ),
                ("nulls", Value::string_utf8("preserve")),
                ("invalid", Value::string_utf8("abort")),
                (
                    "recovery",
                    obj(vec![("mode", Value::string_utf8("irreversible"))]),
                ),
            ])]),
        ),
    ]);
    let invalid_domain = engine
        .discover_table_migration_changes_selected(
            previous,
            next,
            Some(&valid_but_unimplemented),
            &mut Context::ordinary(),
        )
        .unwrap_err();
    assert_eq!(invalid_domain.code, "MIGRATION_CHANGES_FAILED");
    assert!(invalid_domain
        .message
        .to_utf8()
        .unwrap()
        .contains("Previous table is missing"));
}

#[test]
fn migration_selector_04_emits_exact_numeric_conversion_effect_candidate() {
    let resources = resources();
    let engine = CodegenEngine::new(&resources);
    let fixture = load("tests/binding/fixtures/table-lifecycle-note.json");
    let configuration = obj(vec![
        ("module", Value::string_utf8("demo")),
        ("schema", Value::string_utf8("plugin_demo")),
        ("ownerRole", Value::string_utf8("plugin_owner")),
        ("personRole", Value::string_utf8("plugin_person")),
        ("batchRole", Value::string_utf8("plugin_batch")),
        (
            "groupRoles",
            obj(vec![("readers", Value::string_utf8("plugin_readers"))]),
        ),
    ]);
    let make_bundle = |native_type: &str| {
        let mut source = fixture.clone();
        let module = &mut array_mut(member_mut(&mut source, "modules"))[0];
        let new_field = obj(vec![
            ("id", Value::string_utf8("rank")),
            ("kind", Value::string_utf8("field")),
            ("scalarType", Value::string_utf8("integer")),
            ("cardinality", Value::string_utf8("one")),
            ("nullability", Value::string_utf8("absent-allowed")),
            ("extensions", obj(vec![])),
        ]);
        array_mut(member_mut(module, "elements")).insert(2, new_field);
        let record = array_mut(member_mut(module, "elements"))
            .iter_mut()
            .find(|element| member(element, "id") == Some(&Value::string_utf8("Note")))
            .unwrap();
        array_mut(member_mut(record, "members")).push(obj(vec![
            ("module", Value::string_utf8("demo")),
            ("element", Value::string_utf8("rank")),
        ]));
        let table = array_mut(member_mut(
            member_mut(member_mut(module, "extensions"), "umf.tables"),
            "tables",
        ))
        .first_mut()
        .unwrap();
        array_mut(member_mut(table, "columns")).push(obj(vec![
            (
                "field",
                obj(vec![
                    ("module", Value::string_utf8("demo")),
                    ("element", Value::string_utf8("rank")),
                ]),
            ),
            ("name", Value::string_utf8("rank")),
            (
                "nativeType",
                obj(vec![("kind", Value::string_utf8(native_type))]),
            ),
        ]));
        let text = umf_core::serialization::write_json_value(
            &source,
            Format::Json,
            &mut Context::ordinary(),
        )
        .unwrap();
        let text = text.to_utf8().unwrap();
        let request = obj(vec![
            ("text", Value::string_utf8(&text)),
            ("configuration", configuration.clone()),
        ]);
        let result = engine
            .compile_table_deployment(&request, &mut Context::ordinary())
            .unwrap();
        assert_eq!(
            member(&result, "status"),
            Some(&Value::string_utf8("compiled")),
            "fixture deployment diagnostics: {:?}",
            member(&result, "diagnostics")
        );
        member(&result, "bundle").unwrap().clone()
    };
    let previous = make_bundle("int4");
    let next = make_bundle("int8");
    let selector = obj(vec![
        (
            "version",
            Value::string_utf8("umf.table-migration-discovery/0.4"),
        ),
        (
            "conversionIntents",
            Value::Array(vec![obj(vec![
                ("table", Value::string_utf8("notes")),
                (
                    "field",
                    obj(vec![
                        ("module", Value::string_utf8("demo")),
                        ("element", Value::string_utf8("rank")),
                    ]),
                ),
                (
                    "recipe",
                    obj(vec![
                        ("version", Value::string_utf8("umf.conversion-recipe/0.1")),
                        ("kind", Value::string_utf8("numeric-exact")),
                        ("parameters", obj(vec![])),
                    ]),
                ),
                ("nulls", Value::string_utf8("preserve")),
                ("invalid", Value::string_utf8("abort")),
                (
                    "recovery",
                    obj(vec![("mode", Value::string_utf8("irreversible"))]),
                ),
            ])]),
        ),
    ]);
    let changes = engine
        .discover_table_migration_changes_selected(
            &previous,
            &next,
            Some(&selector),
            &mut Context::ordinary(),
        )
        .unwrap();
    let candidates = umf_codegen::value::array_items(&changes).unwrap();
    let effect = candidates
        .iter()
        .find(|candidate| {
            member(candidate, "kind") == Some(&Value::string_utf8("conversion-effects"))
        })
        .expect("conversion effects candidate");
    assert!(member(effect, "oldDigest").is_some());
    assert!(member(effect, "newDigest").is_some());
    let old_value = member(effect, "oldValue").unwrap();
    assert_eq!(
        member(old_value, "version"),
        Some(&Value::string_utf8("umf.field-conversion-review/0.1"))
    );
    assert_eq!(
        member(member(old_value, "conversionIntent").unwrap(), "recovery"),
        Some(&obj(vec![("mode", Value::string_utf8("irreversible"))]))
    );
}

#[test]
fn migration_selector_04_emits_effects_for_each_declared_recipe_and_refuses_wrong_domains() {
    let resources = resources();
    let engine = CodegenEngine::new(&resources);
    let fixture = load("tests/binding/fixtures/table-lifecycle-note.json");
    let configuration = obj(vec![
        ("module", Value::string_utf8("demo")),
        ("schema", Value::string_utf8("plugin_demo")),
        ("ownerRole", Value::string_utf8("plugin_owner")),
        ("personRole", Value::string_utf8("plugin_person")),
        ("batchRole", Value::string_utf8("plugin_batch")),
        (
            "groupRoles",
            obj(vec![("readers", Value::string_utf8("plugin_readers"))]),
        ),
    ]);
    let numeric_facets = |scale| {
        obj(vec![
            ("precision", Value::Number(10.0)),
            ("scale", Value::Number(scale)),
        ])
    };
    let native = |kind: &str| match kind {
        "numeric" => obj(vec![
            ("kind", Value::string_utf8(kind)),
            ("precision", Value::Number(10.0)),
            ("scale", Value::Number(2.0)),
        ]),
        _ => obj(vec![("kind", Value::string_utf8(kind))]),
    };
    let cases: [(&str, &str, &str, &str); 11] = [
        ("numeric-rescale", "decimal", "decimal", "numeric"),
        ("text-date", "string", "date", "text"),
        ("date-text", "date", "string", "date"),
        ("text-instant", "string", "timestamp", "text"),
        ("instant-text", "timestamp", "string", "timestamptz"),
        ("date-instant", "date", "timestamp", "date"),
        ("instant-date", "timestamp", "date", "timestamptz"),
        ("text-uuid", "string", "uuid", "text"),
        ("uuid-text", "uuid", "string", "uuid"),
        ("text-boolean", "string", "boolean", "text"),
        ("boolean-text", "boolean", "string", "boolean"),
    ];
    for (index, (kind, old_scalar, new_scalar, old_native)) in cases.iter().enumerate() {
        let parameters = match *kind {
            "numeric-rescale" => vec![("rounding", Value::string_utf8("half-even"))],
            "date-instant" => vec![
                ("at", Value::string_utf8("00:00:00")),
                ("offset", Value::string_utf8("Z")),
            ],
            "instant-date" => vec![
                ("time", Value::string_utf8("require-midnight")),
                ("offset", Value::string_utf8("Z")),
            ],
            "text-boolean" | "boolean-text" => vec![
                ("trueToken", Value::string_utf8("yes")),
                ("falseToken", Value::string_utf8("no")),
            ],
            _ => vec![],
        };
        let new_native = match *kind {
            "numeric-rescale" => "numeric",
            _ => match *new_scalar {
                "string" => "text",
                "date" => "date",
                "timestamp" => "timestamptz",
                "uuid" => "uuid",
                "boolean" => "boolean",
                _ => unreachable!(),
            },
        };
        let old_facets = if *old_scalar == "decimal" {
            Some(numeric_facets(2.0))
        } else {
            None
        };
        let new_facets = if *new_scalar == "decimal" {
            Some(numeric_facets(3.0))
        } else {
            None
        };
        let old_native_value = if *old_native == "numeric" {
            native("numeric")
        } else {
            native(old_native)
        };
        let new_native_value = if new_native == "numeric" {
            let mut value = native("numeric");
            *member_mut(&mut value, "scale") = Value::Number(3.0);
            value
        } else {
            native(new_native)
        };
        let previous = g04_bundle(
            &engine,
            &fixture,
            &configuration,
            "convertible",
            old_scalar,
            old_native_value,
            old_facets,
        );
        let next = g04_bundle(
            &engine,
            &fixture,
            &configuration,
            "convertible",
            new_scalar,
            new_native_value,
            new_facets,
        );
        let intent = obj(vec![
            ("table", Value::string_utf8("notes")),
            (
                "field",
                obj(vec![
                    ("module", Value::string_utf8("demo")),
                    ("element", Value::string_utf8("convertible")),
                ]),
            ),
            (
                "recipe",
                obj(vec![
                    ("version", Value::string_utf8("umf.conversion-recipe/0.1")),
                    ("kind", Value::string_utf8(kind)),
                    ("parameters", obj(parameters)),
                ]),
            ),
            ("nulls", Value::string_utf8("preserve")),
            ("invalid", Value::string_utf8("abort")),
            (
                "recovery",
                obj(vec![("mode", Value::string_utf8("irreversible"))]),
            ),
        ]);
        let selector = obj(vec![
            (
                "version",
                Value::string_utf8("umf.table-migration-discovery/0.4"),
            ),
            ("conversionIntents", Value::Array(vec![intent])),
        ]);
        let candidates = engine
            .discover_table_migration_changes_selected(
                &previous,
                &next,
                Some(&selector),
                &mut Context::ordinary(),
            )
            .unwrap_or_else(|error| panic!("recipe {kind} failed: {error:?}"));
        let candidate = umf_codegen::value::array_items(&candidates)
            .unwrap()
            .iter()
            .find(|candidate| {
                member(candidate, "kind") == Some(&Value::string_utf8("conversion-effects"))
            })
            .unwrap_or_else(|| panic!("recipe {kind} emitted no effects marker"));
        let effects = umf_codegen::value::array_items(
            member(candidate, "newValue")
                .and_then(|value| member(value, "effects"))
                .unwrap(),
        )
        .unwrap();
        assert!(
            effects
                .iter()
                .any(|effect| effect == &Value::string_utf8("original-representation-replaced")),
            "case {index}: {kind}"
        );
    }

    let previous = g04_bundle(
        &engine,
        &fixture,
        &configuration,
        "convertible",
        "string",
        native("text"),
        None,
    );
    let next = g04_bundle(
        &engine,
        &fixture,
        &configuration,
        "convertible",
        "uuid",
        native("uuid"),
        None,
    );
    let wrong_recipe = obj(vec![
        ("version", Value::string_utf8("umf.conversion-recipe/0.1")),
        ("kind", Value::string_utf8("text-date")),
        ("parameters", obj(vec![])),
    ]);
    let intent = obj(vec![
        ("table", Value::string_utf8("notes")),
        (
            "field",
            obj(vec![
                ("module", Value::string_utf8("demo")),
                ("element", Value::string_utf8("convertible")),
            ]),
        ),
        ("recipe", wrong_recipe),
        ("nulls", Value::string_utf8("preserve")),
        ("invalid", Value::string_utf8("abort")),
        (
            "recovery",
            obj(vec![("mode", Value::string_utf8("irreversible"))]),
        ),
    ]);
    let selector = obj(vec![
        (
            "version",
            Value::string_utf8("umf.table-migration-discovery/0.4"),
        ),
        ("conversionIntents", Value::Array(vec![intent])),
    ]);
    assert_eq!(
        engine
            .discover_table_migration_changes_selected(
                &previous,
                &next,
                Some(&selector),
                &mut Context::ordinary(),
            )
            .unwrap_err()
            .code,
        "MIGRATION_CHANGES_FAILED"
    );
}

#[test]
fn migration_options_07_compile_verified_conversion_plan_and_preserve_recovery_profile() {
    let resources = resources();
    let engine = CodegenEngine::new(&resources);
    let fixture = load("tests/binding/fixtures/table-lifecycle-note.json");
    let configuration = obj(vec![
        ("module", Value::string_utf8("demo")),
        ("schema", Value::string_utf8("plugin_demo")),
        ("ownerRole", Value::string_utf8("plugin_owner")),
        ("personRole", Value::string_utf8("plugin_person")),
        ("batchRole", Value::string_utf8("plugin_batch")),
        (
            "groupRoles",
            obj(vec![("readers", Value::string_utf8("plugin_readers"))]),
        ),
    ]);
    let previous = g04_bundle(
        &engine,
        &fixture,
        &configuration,
        "convertible",
        "integer",
        obj(vec![("kind", Value::string_utf8("int4"))]),
        None,
    );
    let next = g04_bundle(
        &engine,
        &fixture,
        &configuration,
        "convertible",
        "integer",
        obj(vec![("kind", Value::string_utf8("int8"))]),
        None,
    );
    let field = obj(vec![
        ("module", Value::string_utf8("demo")),
        ("element", Value::string_utf8("convertible")),
    ]);
    let recovery = obj(vec![
        ("mode", Value::string_utf8("retained-originals")),
        (
            "policy",
            obj(vec![
                ("id", Value::string_utf8("archive-primary")),
                ("revision", Value::string_utf8("v1")),
            ]),
        ),
    ]);
    let selection = obj(vec![
        ("table", Value::string_utf8("notes")),
        ("field", field),
        (
            "recipe",
            obj(vec![
                ("version", Value::string_utf8("umf.conversion-recipe/0.1")),
                ("kind", Value::string_utf8("numeric-exact")),
                ("parameters", obj(vec![])),
            ]),
        ),
        ("nulls", Value::string_utf8("preserve")),
        ("invalid", Value::string_utf8("abort")),
        ("recovery", recovery),
    ]);
    let selector = obj(vec![
        (
            "version",
            Value::string_utf8("umf.table-migration-discovery/0.4"),
        ),
        ("conversionIntents", Value::Array(vec![selection.clone()])),
    ]);
    let candidates = engine
        .discover_table_migration_changes_selected(
            &previous,
            &next,
            Some(&selector),
            &mut Context::ordinary(),
        )
        .unwrap();
    let candidate_rows = umf_codegen::value::array_items(&candidates).unwrap();
    let reviewed = candidate_rows
        .iter()
        .map(|candidate| {
            let Value::Object(fields) = candidate else {
                panic!("candidate object")
            };
            Value::Object(
                fields
                    .iter()
                    .filter(|(key, _)| {
                        !["oldValue", "newValue", "oldPath", "newPath"]
                            .iter()
                            .any(|name| key == &Utf16::from(*name))
                    })
                    .cloned()
                    .collect(),
            )
        })
        .collect();
    let options = obj(vec![
        (
            "version",
            Value::string_utf8("umf.table-migration-options/0.7"),
        ),
        ("backfills", Value::Array(vec![])),
        ("concurrentIndexes", Value::Array(vec![])),
        ("reviewedChanges", Value::Array(reviewed)),
        ("validations", Value::Array(vec![])),
        ("conversions", Value::Array(vec![selection])),
    ]);
    let request = obj(vec![
        ("id", Value::string_utf8("g04-native-001")),
        (
            "predecessor",
            obj(vec![
                ("id", Value::string_utf8("g04-installed-000")),
                ("digest", Value::string_utf8(&"a".repeat(64))),
            ]),
        ),
        ("previous", previous),
        ("next", next),
        ("options", options),
    ]);
    let result = engine
        .compile_table_migration(&request, &mut Context::ordinary())
        .unwrap();
    assert_eq!(
        umf_codegen::value::member(&result, "status"),
        Some(&Value::string_utf8("compiled")),
        "{result:?}"
    );
    let plan = umf_codegen::value::member(&result, "plan").unwrap();
    assert_eq!(
        umf_codegen::value::member(plan, "version"),
        Some(&Value::string_utf8("umf.table-migration/0.7"))
    );
    let steps = umf_codegen::value::array_items(umf_codegen::value::member(plan, "steps").unwrap())
        .unwrap();
    assert_eq!(steps.len(), 3);
    assert_eq!(
        umf_codegen::value::member(&steps[0], "operation"),
        Some(&Value::string_utf8("capture-originals"))
    );
    assert_eq!(
        umf_codegen::value::member(&steps[1], "operation"),
        Some(&Value::string_utf8("convert-field"))
    );
    assert_eq!(
        umf_codegen::value::member(&steps[2], "operation"),
        Some(&Value::string_utf8("validate-conversion"))
    );
    assert_eq!(
        engine
            .verify_table_migration(plan, &mut Context::ordinary())
            .unwrap(),
        *plan
    );
    let mut stale = request.clone();
    let reviewed = array_mut(member_mut(
        member_mut(&mut stale, "options"),
        "reviewedChanges",
    ));
    *member_mut(&mut reviewed[0], "oldDigest") = Value::string_utf8(&"0".repeat(64));
    let refused = engine
        .compile_table_migration(&stale, &mut Context::ordinary())
        .unwrap();
    assert_eq!(
        umf_codegen::value::member(&refused, "status"),
        Some(&Value::string_utf8("blocked"))
    );
}
