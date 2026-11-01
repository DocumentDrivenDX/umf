// SPDX-License-Identifier: MIT OR Apache-2.0
//! Focused native G03 migration compiler baseline.
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
    with_default: bool,
) -> Value {
    let mut source = fixture.clone();
    let modules = arr(&mut source, "modules");
    let module = &mut modules[0];
    arr(module, "elements").insert(
        2,
        obj(vec![
            ("id", Value::string_utf8("rank")),
            ("kind", Value::string_utf8("field")),
            ("scalarType", Value::string_utf8("string")),
            ("cardinality", Value::string_utf8("one")),
            ("nullability", Value::string_utf8("absent-allowed")),
            ("extensions", obj(vec![])),
        ]),
    );
    let record = arr(module, "elements")
        .iter_mut()
        .find(|value| member(value, "id") == Some(&Value::string_utf8("Note")))
        .unwrap();
    arr(record, "members").push(obj(vec![
        ("module", Value::string_utf8("demo")),
        ("element", Value::string_utf8("rank")),
    ]));
    let tables_ext = child_mut(child_mut(module, "extensions"), "umf.tables");
    let table = arr(tables_ext, "tables").first_mut().unwrap();
    let columns = arr(table, "columns");
    let mut mapping = obj(vec![
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
            obj(vec![("kind", Value::string_utf8("text"))]),
        ),
    ]);
    if with_default {
        set(
            &mut mapping,
            "default",
            obj(vec![
                ("kind", Value::string_utf8("literal")),
                ("value", obj(vec![("string", Value::string_utf8("ranked"))])),
            ]),
        );
    }
    columns.push(mapping);
    if with_default {
        let field = arr(module, "elements")
            .iter_mut()
            .find(|value| member(value, "id") == Some(&Value::string_utf8("rank")))
            .unwrap();
        set(
            field,
            "default",
            obj(vec![
                ("on", Value::string_utf8("missing")),
                ("value", obj(vec![("string", Value::string_utf8("ranked"))])),
            ]),
        );
    }
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
        Some(&Value::string_utf8("compiled"))
    );
    member(&result, "bundle").unwrap().clone()
}

#[test]
fn g03_options_05_compiles_and_reverifies_one_source_bound_default_change() {
    let resources = resources();
    let engine = CodegenEngine::new(&resources);
    let fixture = load("tests/binding/fixtures/table-lifecycle-note.json");
    let config = obj(vec![
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
    let previous = bundle(&engine, &fixture, &config, false);
    let next = bundle(&engine, &fixture, &config, true);
    let selector = obj(vec![(
        "version",
        Value::string_utf8("umf.table-migration-discovery/0.2"),
    )]);
    let changes = engine
        .discover_table_migration_changes_selected(
            &previous,
            &next,
            Some(&selector),
            &mut Context::ordinary(),
        )
        .unwrap();
    let candidate = umf_codegen::value::array_items(&changes)
        .unwrap()
        .iter()
        .find(|item| member(item, "kind") == Some(&Value::string_utf8("change-default")))
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
            Value::string_utf8("umf.table-migration-options/0.5"),
        ),
        ("backfills", Value::Array(vec![])),
        ("concurrentIndexes", Value::Array(vec![])),
        ("reviewedChanges", Value::Array(vec![marker])),
        ("validations", Value::Array(vec![])),
    ]);
    let predecessor = obj(vec![
        ("id", Value::string_utf8("prior")),
        ("digest", member(&previous, "bundleDigest").unwrap().clone()),
    ]);
    let request = obj(vec![
        ("id", Value::string_utf8("g03-default")),
        ("predecessor", predecessor),
        ("previous", previous.clone()),
        ("next", next.clone()),
        ("options", options),
    ]);
    let result = engine
        .compile_table_migration(&request, &mut Context::ordinary())
        .unwrap();
    assert_eq!(
        member(&result, "status"),
        Some(&Value::string_utf8("compiled"))
    );
    let plan = member(&result, "plan").unwrap();
    assert_eq!(
        member(plan, "version"),
        Some(&Value::string_utf8("umf.table-migration/0.5"))
    );
    let step = &umf_codegen::value::array_items(member(plan, "steps").unwrap()).unwrap()[0];
    assert!(
        matches!(member(step, "sql"), Some(Value::String(sql)) if sql.to_utf8().unwrap().contains("SET DEFAULT"))
    );
    engine
        .verify_table_migration(plan, &mut Context::ordinary())
        .unwrap();
    let bad_marker = obj(vec![
        ("id", member(candidate, "id").unwrap().clone()),
        ("kind", member(candidate, "kind").unwrap().clone()),
        ("path", member(candidate, "path").unwrap().clone()),
        ("oldDigest", member(candidate, "oldDigest").unwrap().clone()),
        ("newDigest", Value::string_utf8("00".repeat(32))),
    ]);
    let bad_options = obj(vec![
        (
            "version",
            Value::string_utf8("umf.table-migration-options/0.5"),
        ),
        ("backfills", Value::Array(vec![])),
        ("concurrentIndexes", Value::Array(vec![])),
        ("reviewedChanges", Value::Array(vec![bad_marker])),
        ("validations", Value::Array(vec![])),
    ]);
    let bad_request = obj(vec![
        ("id", Value::string_utf8("g03-default")),
        (
            "predecessor",
            obj(vec![
                ("id", Value::string_utf8("prior")),
                ("digest", member(&previous, "bundleDigest").unwrap().clone()),
            ]),
        ),
        ("previous", previous),
        ("next", next),
        ("options", bad_options),
    ]);
    let refusal = engine
        .compile_table_migration(&bad_request, &mut Context::ordinary())
        .unwrap();
    assert_eq!(
        member(&refusal, "status"),
        Some(&Value::string_utf8("blocked"))
    );
}

#[test]
fn g11_options_06_compiles_multiple_field_replacements_and_binds_key_effects() {
    let resources = resources();
    let engine = CodegenEngine::new(&resources);
    let fixture = load("tests/binding/fixtures/table-lifecycle-note.json");
    let config = obj(vec![
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
    let compile = |source: &Value| {
        let text = write_json_value(source, Format::Json, &mut Context::ordinary())
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
            "G11 deployment fixture result: {result:?}"
        );
        member(&result, "bundle").unwrap().clone()
    };
    let field = |id: &str| {
        obj(vec![
            ("id", Value::string_utf8(id)),
            ("kind", Value::string_utf8("field")),
            ("scalarType", Value::string_utf8("string")),
            ("cardinality", Value::string_utf8("one")),
            ("nullability", Value::string_utf8("required")),
            ("extensions", obj(vec![])),
        ])
    };
    let reference = |id: &str| {
        obj(vec![
            ("module", Value::string_utf8("demo")),
            ("element", Value::string_utf8(id)),
        ])
    };
    let mut old_source = fixture.clone();
    let old_module = &mut arr(&mut old_source, "modules")[0];
    for name in ["summary", "caption"] {
        let mut definition = field(name);
        set(
            &mut definition,
            "nullability",
            Value::string_utf8("absent-allowed"),
        );
        arr(old_module, "elements").insert(2, definition);
    }
    let record = arr(old_module, "elements")
        .iter_mut()
        .find(|item| member(item, "id") == Some(&Value::string_utf8("Note")))
        .unwrap();
    for name in ["summary", "caption"] {
        arr(record, "members").push(reference(name));
    }
    let table = arr(
        child_mut(child_mut(old_module, "extensions"), "umf.tables"),
        "tables",
    )
    .first_mut()
    .unwrap();
    for name in ["summary", "caption"] {
        arr(table, "columns").push(obj(vec![
            ("field", reference(name)),
            ("name", Value::string_utf8(name)),
            (
                "nativeType",
                obj(vec![("kind", Value::string_utf8("text"))]),
            ),
        ]));
    }
    let previous = compile(&old_source);
    let mut new_source = old_source.clone();
    let module = &mut arr(&mut new_source, "modules")[0];
    arr(module, "elements").retain(|item| {
        !["summary", "caption"]
            .iter()
            .any(|name| member(item, "id") == Some(&Value::string_utf8(*name)))
    });
    for name in ["displaySummary", "displayCaption"] {
        arr(module, "elements").push(field(name));
    }
    let record = arr(module, "elements")
        .iter_mut()
        .find(|item| member(item, "id") == Some(&Value::string_utf8("Note")))
        .unwrap();
    arr(record, "members").retain(|reference| {
        !["summary", "caption"]
            .iter()
            .any(|name| member(reference, "element") == Some(&Value::string_utf8(*name)))
    });
    for name in ["displaySummary", "displayCaption"] {
        arr(record, "members").push(reference(name));
    }
    arr(record, "keys").push(obj(vec![
        ("id", Value::string_utf8("owner_lookup")),
        ("name", Value::string_utf8("owner_lookup")),
        ("primary", Value::Bool(false)),
        ("fields", Value::Array(vec![reference("owner")])),
    ]));
    let payload = child_mut(child_mut(module, "extensions"), "umf.tables");
    let table = arr(payload, "tables").first_mut().unwrap();
    arr(table, "columns").retain(|column| {
        !["summary", "caption"].iter().any(|name| {
            member(member(column, "field").unwrap(), "element") == Some(&Value::string_utf8(*name))
        })
    });
    for (logical, physical) in [("displaySummary", "summary"), ("displayCaption", "caption")] {
        arr(table, "columns").push(obj(vec![
            ("field", reference(logical)),
            ("name", Value::string_utf8(physical)),
            (
                "nativeType",
                obj(vec![("kind", Value::string_utf8("text"))]),
            ),
        ]));
    }
    let operation = |target: &str| {
        obj(vec![
            ("version", Value::string_utf8("umf.table-operation/0.2")),
            ("id", Value::string_utf8(format!("fill_{target}"))),
            ("parameters", Value::Array(vec![])),
            (
                "body",
                obj(vec![
                    ("kind", Value::string_utf8("update")),
                    ("table", Value::string_utf8("notes")),
                    (
                        "values",
                        Value::Array(vec![obj(vec![
                            ("field", reference(target)),
                            (
                                "value",
                                obj(vec![
                                    ("kind", Value::string_utf8("rowExpression")),
                                    (
                                        "expression",
                                        obj(vec![
                                            ("op", Value::string_utf8("field")),
                                            ("field", reference("owner")),
                                        ]),
                                    ),
                                ]),
                            ),
                        ])]),
                    ),
                    (
                        "where",
                        obj(vec![
                            ("op", Value::string_utf8("isNull")),
                            ("field", reference(target)),
                        ]),
                    ),
                    ("returning", Value::Array(vec![])),
                    ("maxRows", Value::Number(100.0)),
                ]),
            ),
            ("consistency", Value::string_utf8("transaction")),
            ("replay", Value::string_utf8("caller-key-required")),
        ])
    };
    for target in ["displaySummary", "displayCaption"] {
        arr(payload, "commands").push(operation(target));
    }
    let next = compile(&new_source);
    let candidates = engine
        .discover_table_migration_changes_selected(
            &previous,
            &next,
            Some(&obj(vec![(
                "version",
                Value::string_utf8("umf.table-migration-discovery/0.3"),
            )])),
            &mut Context::ordinary(),
        )
        .unwrap();
    let markers = umf_codegen::value::array_items(&candidates)
        .unwrap()
        .iter()
        .map(|item| {
            obj(["id", "kind", "path", "oldDigest", "newDigest"]
                .into_iter()
                .map(|key| (key, member(item, key).unwrap().clone()))
                .collect())
        })
        .collect::<Vec<_>>();
    let options = obj(vec![
        (
            "version",
            Value::string_utf8("umf.table-migration-options/0.6"),
        ),
        (
            "backfills",
            Value::Array(vec![
                obj(vec![
                    ("table", Value::string_utf8("notes")),
                    ("column", reference("displaySummary")),
                    ("operation", Value::string_utf8("fill_displaySummary")),
                    ("scopedRows", Value::Bool(true)),
                ]),
                obj(vec![
                    ("table", Value::string_utf8("notes")),
                    ("column", reference("displayCaption")),
                    ("operation", Value::string_utf8("fill_displayCaption")),
                    ("scopedRows", Value::Bool(true)),
                ]),
            ]),
        ),
        ("concurrentIndexes", Value::Array(vec![])),
        ("reviewedChanges", Value::Array(markers.clone())),
        ("validations", Value::Array(vec![])),
    ]);
    let request = obj(vec![
        ("id", Value::string_utf8("g11-field-replacement")),
        (
            "predecessor",
            obj(vec![
                ("id", Value::string_utf8("prior")),
                ("digest", member(&previous, "bundleDigest").unwrap().clone()),
            ]),
        ),
        ("previous", previous.clone()),
        ("next", next.clone()),
        ("options", options.clone()),
    ]);
    let result = engine
        .compile_table_migration(&request, &mut Context::ordinary())
        .unwrap();
    assert_eq!(
        member(&result, "status"),
        Some(&Value::string_utf8("compiled"))
    );
    let plan = member(&result, "plan").unwrap();
    assert_eq!(
        member(plan, "version"),
        Some(&Value::string_utf8("umf.table-migration/0.6"))
    );
    let phase = &umf_codegen::value::array_items(member(plan, "phases").unwrap()).unwrap()[0];
    assert_eq!(
        member(phase, "kind"),
        Some(&Value::string_utf8("field-replacement"))
    );
    let steps = umf_codegen::value::array_items(member(plan, "steps").unwrap()).unwrap();
    assert!(steps.iter().any(|step| {
        member(step, "phaseOperation") == Some(&Value::string_utf8("dependency-add"))
            && member(member(step, "phaseDependency").unwrap(), "kind")
                == Some(&Value::string_utf8("key"))
    }));
    let drop_summary = steps
        .iter()
        .position(|step| {
            member(step, "phaseOperation") == Some(&Value::string_utf8("drop-column"))
                && member(member(step, "phaseTarget").unwrap(), "field")
                    .and_then(|field| member(field, "element"))
                    == Some(&Value::string_utf8("summary"))
        })
        .unwrap();
    let add_summary = steps
        .iter()
        .position(|step| {
            member(step, "phaseOperation") == Some(&Value::string_utf8("add-column"))
                && member(member(step, "phaseTarget").unwrap(), "field")
                    .and_then(|field| member(field, "element"))
                    == Some(&Value::string_utf8("displaySummary"))
        })
        .unwrap();
    assert!(
        drop_summary < add_summary,
        "retired mapping must precede its replacement"
    );
    assert!(
        steps
            .iter()
            .filter(|step| member(step, "phaseOperation") == Some(&Value::string_utf8("backfill")))
            .count()
            == 2
    );
    engine
        .verify_table_migration(plan, &mut Context::ordinary())
        .unwrap();
    let mut invalid = options;
    let reviewed = arr(&mut invalid, "reviewedChanges");
    set(
        &mut reviewed[0],
        "newDigest",
        Value::string_utf8("00".repeat(32)),
    );
    let refused = engine
        .compile_table_migration(
            &obj(vec![
                ("id", Value::string_utf8("g11-refusal")),
                (
                    "predecessor",
                    obj(vec![
                        ("id", Value::string_utf8("prior")),
                        ("digest", member(&previous, "bundleDigest").unwrap().clone()),
                    ]),
                ),
                ("previous", previous),
                ("next", next),
                ("options", invalid),
            ]),
            &mut Context::ordinary(),
        )
        .unwrap();
    assert_eq!(
        member(&refused, "status"),
        Some(&Value::string_utf8("blocked"))
    );
}
