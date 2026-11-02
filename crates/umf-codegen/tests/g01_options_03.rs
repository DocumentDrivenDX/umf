// SPDX-License-Identifier: MIT OR Apache-2.0
//! Focused native G01 existing-field fill and NOT NULL compiler baseline.
use std::{fs, path::Path};
use umf_codegen::value::member;
use umf_codegen::{CodegenEngine, CodegenResources};
use umf_core::serialization::{read_json_value, write_json_value, Format};
use umf_core::{Context, ResourceSet, Utf16, Value};

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
    Value::Object(
        fields
            .into_iter()
            .map(|(key, value)| (Utf16::from(key), value))
            .collect(),
    )
}
fn arr<'a>(value: &'a mut Value, name: &str) -> &'a mut Vec<Value> {
    let Value::Object(fields) = value else {
        panic!("expected object")
    };
    let value = fields
        .iter_mut()
        .find(|(key, _)| key == &Utf16::from(name))
        .map(|(_, v)| v)
        .unwrap();
    let Value::Array(values) = value else {
        panic!("expected array {name}")
    };
    values
}
fn child_mut<'a>(value: &'a mut Value, name: &str) -> &'a mut Value {
    let Value::Object(fields) = value else {
        panic!("expected object")
    };
    fields
        .iter_mut()
        .find(|(key, _)| key == &Utf16::from(name))
        .map(|(_, value)| value)
        .unwrap_or_else(|| panic!("missing {name}"))
}
fn set(value: &mut Value, name: &str, replacement: Value) {
    let Value::Object(fields) = value else {
        panic!("expected object")
    };
    if let Some((_, value)) = fields.iter_mut().find(|(key, _)| key == &Utf16::from(name)) {
        *value = replacement;
    } else {
        fields.push((Utf16::from(name), replacement));
    }
}
fn resources() -> CodegenResources {
    let tables = load("spec/extensions/tables/package.json");
    let actions = load("spec/extensions/actions/package.json");
    CodegenResources::new(
        ResourceSet::new(
            load("spec/core/schema.json"),
            load("spec/core/semantic-type-reference.schema.json"),
            load("spec/core/extension-package.schema.json"),
            load("spec/metamodel/generated/core-constraints.json"),
            load("spec/metamodel/generated/domain-policy.json"),
        ),
        tables.clone(),
        member(&tables, "schema").unwrap().clone(),
        actions.clone(),
        member(&actions, "schema").unwrap().clone(),
        load("spec/extensions/binding/package.json"),
        load("spec/extensions/binding-stable/package.json"),
        &mut Context::catalog(),
    )
    .unwrap()
}
fn bundle(
    engine: &CodegenEngine<'_>,
    fixture: &Value,
    config: &Value,
    include_summary: bool,
    with_fill: bool,
    required: bool,
    concurrent_index: bool,
) -> Value {
    let mut source = fixture.clone();
    let modules = arr(&mut source, "modules");
    let module = &mut modules[0];
    if include_summary {
        arr(module, "elements").push(obj(vec![
            ("id", Value::string_utf8("summary")),
            ("kind", Value::string_utf8("field")),
            ("scalarType", Value::string_utf8("string")),
            ("cardinality", Value::string_utf8("one")),
            (
                "nullability",
                Value::string_utf8(if required {
                    "required"
                } else {
                    "absent-allowed"
                }),
            ),
            ("extensions", obj(vec![])),
        ]));
        let record = arr(module, "elements")
            .iter_mut()
            .find(|value| member(value, "id") == Some(&Value::string_utf8("Note")))
            .unwrap();
        arr(record, "members").push(obj(vec![
            ("module", Value::string_utf8("demo")),
            ("element", Value::string_utf8("summary")),
        ]));
        let tables_ext = child_mut(child_mut(module, "extensions"), "umf.tables");
        let table = arr(tables_ext, "tables").first_mut().unwrap();
        let columns = arr(table, "columns");
        let mut mapping = obj(vec![
            (
                "field",
                obj(vec![
                    ("module", Value::string_utf8("demo")),
                    ("element", Value::string_utf8("summary")),
                ]),
            ),
            ("name", Value::string_utf8("summary")),
            (
                "nativeType",
                obj(vec![("kind", Value::string_utf8("text"))]),
            ),
        ]);
        columns.push(mapping);
    }
    if concurrent_index {
        let tables_ext = child_mut(child_mut(module, "extensions"), "umf.tables");
        let table = arr(tables_ext, "tables").first_mut().unwrap();
        arr(table, "indexes").push(obj(vec![
            ("id", Value::string_utf8("summary_index")),
            ("name", Value::string_utf8("summary_index")),
            (
                "fields",
                Value::Array(vec![obj(vec![
                    ("module", Value::string_utf8("demo")),
                    ("element", Value::string_utf8("id")),
                ])]),
            ),
            ("unique", Value::Bool(false)),
            ("include", Value::Array(vec![])),
        ]));
        arr(table, "checks").push(obj(vec![
            ("id", Value::string_utf8("owner_nonempty")),
            ("name", Value::string_utf8("owner_nonempty")),
            (
                "expression",
                obj(vec![
                    ("op", Value::string_utf8("ne")),
                    (
                        "left",
                        obj(vec![
                            ("op", Value::string_utf8("field")),
                            (
                                "field",
                                obj(vec![
                                    ("module", Value::string_utf8("demo")),
                                    ("element", Value::string_utf8("owner")),
                                ]),
                            ),
                        ]),
                    ),
                    (
                        "right",
                        obj(vec![
                            ("op", Value::string_utf8("literal")),
                            ("value", obj(vec![("string", Value::string_utf8(""))])),
                        ]),
                    ),
                ]),
            ),
        ]));
    }
    if with_fill {
        let payload = child_mut(child_mut(module, "extensions"), "umf.tables");
        arr(payload, "commands").push(obj(vec![
            ("version", Value::string_utf8("umf.table-operation/0.1")),
            ("id", Value::string_utf8("fill_summary")),
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
                            (
                                "field",
                                obj(vec![
                                    ("module", Value::string_utf8("demo")),
                                    ("element", Value::string_utf8("summary")),
                                ]),
                            ),
                        ]),
                    ),
                    (
                        "values",
                        Value::Array(vec![obj(vec![
                            (
                                "field",
                                obj(vec![
                                    ("module", Value::string_utf8("demo")),
                                    ("element", Value::string_utf8("summary")),
                                ]),
                            ),
                            (
                                "value",
                                obj(vec![
                                    ("kind", Value::string_utf8("literal")),
                                    ("value", obj(vec![("string", Value::string_utf8("filled"))])),
                                ]),
                            ),
                        ])]),
                    ),
                    ("returning", Value::Array(vec![])),
                    ("maxRows", Value::Number(100.0)),
                ]),
            ),
        ]));
    }
    let payload = child_mut(child_mut(module, "extensions"), "umf.tables");
    set(payload, "seedSets", Value::Array(vec![]));
    let text = write_json_value(&source, Format::Json, &mut Context::ordinary())
        .unwrap()
        .to_utf8()
        .unwrap();
    let request = obj(vec![
        ("text", Value::string_utf8(&text)),
        ("configuration", config.clone()),
    ]);
    let result = engine
        .compile_table_deployment(&request, &mut Context::ordinary())
        .unwrap();
    assert_eq!(
        member(&result, "status"),
        Some(&Value::string_utf8("compiled")),
        "{result:?}"
    );
    member(&result, "bundle").unwrap().clone()
}

#[test]
fn g01_options_03_compiles_and_reverifies_reviewed_existing_field_fill() {
    let resources = resources();
    let engine = CodegenEngine::new(&resources);
    let fixture = load("tests/binding/fixtures/table-lifecycle-note.json");
    let config = obj(vec![
        ("module", Value::string_utf8("demo")),
        ("schema", Value::string_utf8("g01_native")),
        ("ownerRole", Value::string_utf8("g01_owner")),
        ("personRole", Value::string_utf8("g01_person")),
        ("batchRole", Value::string_utf8("g01_batch")),
        (
            "groupRoles",
            obj(vec![("readers", Value::string_utf8("g01_readers"))]),
        ),
    ]);
    let previous = bundle(&engine, &fixture, &config, true, false, false, false);
    let next = bundle(&engine, &fixture, &config, true, true, true, false);
    let changes = engine
        .discover_table_migration_changes(&previous, &next, &mut Context::ordinary())
        .unwrap();
    let candidate = umf_codegen::value::array_items(&changes)
        .unwrap()
        .iter()
        .find(|item| member(item, "kind") == Some(&Value::string_utf8("tighten-not-null")))
        .unwrap();
    let marker = obj(vec![
        ("id", member(candidate, "id").unwrap().clone()),
        ("kind", member(candidate, "kind").unwrap().clone()),
        ("path", member(candidate, "path").unwrap().clone()),
        ("oldDigest", member(candidate, "oldDigest").unwrap().clone()),
        ("newDigest", member(candidate, "newDigest").unwrap().clone()),
    ]);
    let options = obj(vec![
        (
            "version",
            Value::string_utf8("umf.table-migration-options/0.3"),
        ),
        (
            "backfills",
            Value::Array(vec![obj(vec![
                ("table", Value::string_utf8("notes")),
                (
                    "column",
                    obj(vec![
                        ("module", Value::string_utf8("demo")),
                        ("element", Value::string_utf8("summary")),
                    ]),
                ),
                ("operation", Value::string_utf8("fill_summary")),
                ("scopedRows", Value::Bool(true)),
            ])]),
        ),
        ("concurrentIndexes", Value::Array(vec![])),
        ("reviewedChanges", Value::Array(vec![marker.clone()])),
        ("validations", Value::Array(vec![])),
    ]);
    let request = obj(vec![
        ("id", Value::string_utf8("g01-existing-fill")),
        (
            "predecessor",
            obj(vec![
                ("id", Value::string_utf8("g01-before")),
                ("digest", member(&previous, "bundleDigest").unwrap().clone()),
            ]),
        ),
        ("previous", previous.clone()),
        ("next", next),
        ("options", options.clone()),
    ]);
    let result = engine
        .compile_table_migration(&request, &mut Context::ordinary())
        .unwrap();
    assert_eq!(
        member(&result, "status"),
        Some(&Value::string_utf8("compiled")),
        "initial G01 compile result: {result:?}"
    );
    let plan = member(&result, "plan").unwrap();
    assert_eq!(
        member(plan, "version"),
        Some(&Value::string_utf8("umf.table-migration/0.3"))
    );
    let steps = umf_codegen::value::array_items(member(plan, "steps").unwrap()).unwrap();
    assert_eq!(steps.len(), 2);
    assert_eq!(
        member(&steps[0], "kind"),
        Some(&Value::string_utf8("backfill"))
    );
    assert_eq!(
        member(&steps[1], "phaseOperation"),
        Some(&Value::string_utf8("tighten-not-null"))
    );
    let phases = umf_codegen::value::array_items(member(plan, "phases").unwrap()).unwrap();
    assert_eq!(
        member(&phases[0], "kind"),
        Some(&Value::string_utf8("backfill-tighten"))
    );
    engine
        .verify_table_migration(plan, &mut Context::ordinary())
        .unwrap();

    let mut refused = request;
    let options = child_mut(&mut refused, "options");
    let marker = &mut arr(options, "reviewedChanges")[0];
    set(marker, "newDigest", Value::string_utf8(&"0".repeat(64)));
    let refusal = engine
        .compile_table_migration(&refused, &mut Context::ordinary())
        .unwrap();
    assert_eq!(
        member(&refusal, "status"),
        Some(&Value::string_utf8("blocked"))
    );

    let append_previous = bundle(&engine, &fixture, &config, false, false, false, false);
    let append_next = bundle(&engine, &fixture, &config, true, true, false, true);
    let append_options = obj(vec![
        (
            "version",
            Value::string_utf8("umf.table-migration-options/0.3"),
        ),
        (
            "backfills",
            Value::Array(vec![obj(vec![
                ("table", Value::string_utf8("notes")),
                (
                    "column",
                    obj(vec![
                        ("module", Value::string_utf8("demo")),
                        ("element", Value::string_utf8("summary")),
                    ]),
                ),
                ("operation", Value::string_utf8("fill_summary")),
                ("scopedRows", Value::Bool(true)),
            ])]),
        ),
        (
            "concurrentIndexes",
            Value::Array(vec![obj(vec![
                ("table", Value::string_utf8("notes")),
                ("index", Value::string_utf8("summary_index")),
            ])]),
        ),
        ("reviewedChanges", Value::Array(vec![])),
        (
            "validations",
            Value::Array(vec![obj(vec![
                ("table", Value::string_utf8("notes")),
                ("constraint", Value::string_utf8("owner_nonempty")),
                ("kind", Value::string_utf8("check")),
            ])]),
        ),
    ]);
    let append_request = obj(vec![
        ("id", Value::string_utf8("g01-appended-backfill")),
        (
            "predecessor",
            obj(vec![
                ("id", Value::string_utf8("g01-before")),
                (
                    "digest",
                    member(&append_previous, "bundleDigest").unwrap().clone(),
                ),
            ]),
        ),
        ("previous", append_previous),
        ("next", append_next),
        ("options", append_options),
    ]);
    let append_result = engine
        .compile_table_migration(&append_request, &mut Context::ordinary())
        .unwrap();
    assert_eq!(
        member(&append_result, "status"),
        Some(&Value::string_utf8("compiled")),
        "{append_result:?}"
    );
    assert_eq!(
        member(member(&append_result, "plan").unwrap(), "version"),
        Some(&Value::string_utf8("umf.table-migration/0.3"))
    );
    let phases = umf_codegen::value::array_items(
        member(member(&append_result, "plan").unwrap(), "phases").unwrap(),
    )
    .unwrap();
    assert!(phases
        .iter()
        .any(|phase| member(phase, "kind") == Some(&Value::string_utf8("concurrent-index"))));
    assert!(phases
        .iter()
        .any(|phase| member(phase, "kind") == Some(&Value::string_utf8("constraint-validation"))));
    // A newly added check may be installed atomically without a deferred
    // validation selection. Selecting it opts into ADD NOT VALID + VALIDATE.
    let mut immediate = append_request.clone();
    arr(child_mut(&mut immediate, "options"), "validations").clear();
    let immediate = engine
        .compile_table_migration(&immediate, &mut Context::ordinary())
        .unwrap();
    assert_eq!(
        member(&immediate, "status"),
        Some(&Value::string_utf8("compiled")),
        "{immediate:?}"
    );
    let immediate_phases = umf_codegen::value::array_items(
        member(member(&immediate, "plan").unwrap(), "phases").unwrap(),
    )
    .unwrap();
    assert!(!immediate_phases.iter().any(|phase| {
        member(phase, "kind") == Some(&Value::string_utf8("constraint-validation"))
    }));

    let mut refused = append_request;
    let validations = arr(child_mut(&mut refused, "options"), "validations");
    *child_mut(&mut validations[0], "constraint") = Value::string_utf8("missing_check");
    let refused = engine
        .compile_table_migration(&refused, &mut Context::ordinary())
        .unwrap();
    assert_eq!(
        member(&refused, "status"),
        Some(&Value::string_utf8("blocked")),
        "{refused:?}"
    );
}
