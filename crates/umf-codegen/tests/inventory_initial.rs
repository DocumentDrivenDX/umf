// SPDX-License-Identifier: MIT OR Apache-2.0
use std::{fs, path::Path};

use umf_codegen::canonical::canonical_sha256;
use umf_codegen::value::member;
use umf_codegen::{CodegenEngine, CodegenResources};
use umf_core::serialization::{read_json_value, Format};
use umf_core::{Context, ResourceSet, Utf16, Value};

fn load_text(text: &str) -> Value {
    read_json_value(
        &text.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        &mut Context::catalog(),
    )
    .unwrap()
}
fn load(path: &str) -> Value {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    load_text(&fs::read_to_string(root.join(path)).unwrap())
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
fn member_mut<'a>(value: &'a mut Value, key: &str) -> &'a mut Value {
    let Value::Object(fields) = value else {
        panic!("expected object")
    };
    &mut fields
        .iter_mut()
        .find(|(name, _)| name == &Utf16::from(key))
        .unwrap()
        .1
}
fn object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(key, value)| (key.into(), value))
            .collect(),
    )
}

fn replace_source_once(source: String, needle: &str, replacement: &str) -> String {
    assert_eq!(source.matches(needle).count(), 1, "source fixture token drift: {needle}");
    source.replacen(needle, replacement, 1)
}

fn initial_grant_source(request: &Value) -> String {
    let next = member(request, "next").unwrap();
    let source = member(next, "source").unwrap();
    let Value::String(source_text) = member(source, "utf8").unwrap() else {
        panic!("source UTF-8 text")
    };
    let mut text = source_text.to_utf8().unwrap();
    let field_definitions = concat!(
        "{\"id\":\"note\",\"kind\":\"field\",\"scalarType\":\"string\",\"cardinality\":\"one\",\"nullability\":\"required\",\"extensions\":{}},",
        "{\"id\":\"stamp\",\"kind\":\"field\",\"scalarType\":\"string\",\"cardinality\":\"one\",\"nullability\":\"required\",\"extensions\":{}},",
        "{\"id\":\"computed\",\"kind\":\"field\",\"scalarType\":\"integer\",\"cardinality\":\"one\",\"nullability\":\"required\",\"extensions\":{}} ,"
    );
    text = replace_source_once(
        text,
        "{\"id\":\"Note\",\"kind\":\"record\"",
        &format!("{field_definitions}{{\"id\":\"Note\",\"kind\":\"record\""),
    );
    text = replace_source_once(
        text,
        "\"members\":[{\"module\":\"demo\",\"element\":\"id\"},{\"module\":\"demo\",\"element\":\"owner\"}],\"keys\":[",
        "\"members\":[{\"module\":\"demo\",\"element\":\"id\"},{\"module\":\"demo\",\"element\":\"owner\"},{\"module\":\"demo\",\"element\":\"note\"},{\"module\":\"demo\",\"element\":\"stamp\"},{\"module\":\"demo\",\"element\":\"computed\"}],\"keys\":[",
    );
    let columns = format!(
        "\"columns\":[{{\"field\":{{\"module\":\"demo\",\"element\":\"id\"}},\"name\":\"id\",\"nativeType\":{{\"kind\":\"text\"}}}},{{\"field\":{{\"module\":\"demo\",\"element\":\"owner\"}},\"name\":\"owner\",\"nativeType\":{{\"kind\":\"text\"}}}},{{\"field\":{{\"module\":\"demo\",\"element\":\"note\"}},\"name\":\"note\",\"nativeType\":{{\"kind\":\"text\"}}}},{{\"field\":{{\"module\":\"demo\",\"element\":\"stamp\"}},\"name\":\"stamp\",\"immutable\":true,\"nativeType\":{{\"kind\":\"text\"}}}},{{\"field\":{{\"module\":\"demo\",\"element\":\"computed\"}},\"name\":\"computed\",\"nativeType\":{{\"kind\":\"int4\"}},\"generated\":{{\"kind\":\"identity\",\"generation\":\"always\"}}}}]"
    );
    text = replace_source_once(
        text,
        "\"columns\":[{\"field\":{\"module\":\"demo\",\"element\":\"id\"},\"name\":\"id\",\"nativeType\":{\"kind\":\"text\"}},{\"field\":{\"module\":\"demo\",\"element\":\"owner\"},\"name\":\"owner\",\"nativeType\":{\"kind\":\"text\"}}]",
        &columns,
    );
    text = replace_source_once(
        text,
        "\"insert\":{\"kind\":\"owner\",\"field\":{\"module\":\"demo\",\"element\":\"owner\"}},\"update\"",
        "\"insert\":{\"kind\":\"deny\"},\"update\"",
    );
    replace_source_once(
        text,
        "\"batch\":{\"select\":{\"kind\":\"allow\"},\"insert\":{\"kind\":\"deny\"},\"update\":{\"kind\":\"deny\"}",
        "\"batch\":{\"select\":{\"kind\":\"allow\"},\"insert\":{\"kind\":\"deny\"},\"update\":{\"kind\":\"allow\"}",
    )
}

fn compile_grant_bundle(engine: &CodegenEngine<'_>, template: &Value, source_text: &str) -> Value {
    let configuration = member(member(template, "next").unwrap(), "configuration")
        .unwrap()
        .clone();
    let input = object(vec![
        ("text", Value::string_utf8(source_text)),
        ("format", Value::string_utf8("json")),
        ("configuration", configuration),
    ]);
    let result = engine
        .compile_table_deployment(&input, &mut Context::ordinary())
        .unwrap();
    assert_eq!(
        member(&result, "status"),
        Some(&Value::string_utf8("compiled")),
        "{result:?}"
    );
    member(&result, "bundle").unwrap().clone()
}

fn inventory_request_for_bundle(
    engine: &CodegenEngine<'_>,
    template: &Value,
    bundle: Value,
) -> Value {
    let mut request = template.clone();
    *member_mut(&mut request, "next") = bundle.clone();
    let options = member(&request, "options").unwrap();
    let selector = object(vec![
        (
            "version",
            Value::string_utf8("umf.table-inventory-discovery/0.1"),
        ),
        ("tableIntents", member(options, "tableIntents").unwrap().clone()),
        ("conversions", Value::Array(vec![])),
        ("retiredSeedSets", Value::Array(vec![])),
        ("retirements", Value::Array(vec![])),
        ("restorations", Value::Array(vec![])),
        ("archiveSources", Value::Array(vec![])),
    ]);
    let discovered = engine
        .discover_table_inventory_initial(
            &Value::Null,
            &bundle,
            &selector,
            member(&request, "history").unwrap(),
            &mut Context::ordinary(),
        )
        .unwrap();
    let Value::Array(candidates) = discovered else {
        panic!("initial candidates")
    };
    let markers = candidates
        .iter()
        .map(|candidate| {
            object(
                ["id", "kind", "path", "oldDigest", "newDigest"]
                    .into_iter()
                    .map(|key| (key, member(candidate, key).unwrap().clone()))
                    .collect(),
            )
        })
        .collect();
    *member_mut(member_mut(&mut request, "options"), "reviewedChanges") =
        Value::Array(markers);
    request
}

fn connected_grant_case(
    engine: &CodegenEngine<'_>,
    template: &Value,
) -> (Value, Value, Value) {
    let source = initial_grant_source(template);
    let bundle = compile_grant_bundle(engine, template, &source);
    let request = inventory_request_for_bundle(engine, template, bundle.clone());
    let result = engine
        .compile_table_inventory_initial(&request, &mut Context::ordinary())
        .unwrap();
    (bundle, request, result)
}

fn initial_grant_rows(plan: &Value) -> &Value {
    let Value::Array(review) = member(plan, "review").expect("review") else {
        panic!("review array")
    };
    let meaning = member(member(&review[0], "newValue").expect("new review value"), "meaning")
        .expect("source meaning");
    let catalog = member(meaning, "catalog").expect("source catalog");
    member(catalog, "grants").expect("grant rows")
}

fn grant_meaning<'a>(rows: &'a Value, role: &str, privilege: &str) -> Option<&'a Value> {
    let Value::Array(rows) = rows else {
        return None;
    };
    rows.iter().find_map(|row| {
        let meaning = member(row, "meaning")?;
        (member(meaning, "role") == Some(&Value::string_utf8(role))
            && member(meaning, "privilege") == Some(&Value::string_utf8(privilege)))
        .then_some(meaning)
    })
}

fn grant_column_names(meaning: &Value) -> Vec<String> {
    let Value::Array(columns) = member(meaning, "columns").expect("grant columns") else {
        panic!("UPDATE grant has a column vector")
    };
    columns
        .iter()
        .map(|column| match column {
            Value::String(text) => text.to_utf8().unwrap(),
            _ => panic!("column name is text"),
        })
        .collect()
}

fn digest_hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        output.push(HEX[(byte >> 4) as usize] as char);
        output.push(HEX[(byte & 15) as usize] as char);
    }
    output
}

fn rehash_plan_digest(plan: &mut Value) {
    {
        let Value::Object(fields) = plan else {
            panic!("plan object")
        };
        fields.retain(|(key, _)| key != &Utf16::from("digest"));
    }
    let digest = canonical_sha256(plan, &mut Context::ordinary()).unwrap();
    let Value::Object(fields) = plan else {
        unreachable!()
    };
    fields.push((Utf16::from("digest"), Value::string_utf8(digest_hex(&digest))));
}

fn g02_review_mismatch(engine: &CodegenEngine<'_>, request: &Value) -> String {
    let options = member(request, "options").expect("fixture options");
    let selector = object(vec![
        (
            "version",
            Value::string_utf8("umf.table-inventory-discovery/0.1"),
        ),
        (
            "tableIntents",
            member(options, "tableIntents")
                .expect("fixture table intents")
                .clone(),
        ),
        ("conversions", Value::Array(vec![])),
        ("retiredSeedSets", Value::Array(vec![])),
        ("retirements", Value::Array(vec![])),
        ("restorations", Value::Array(vec![])),
        ("archiveSources", Value::Array(vec![])),
    ]);
    let compact = |rows: &Value| -> Vec<Value> {
        let Value::Array(rows) = rows else {
            return vec![];
        };
        rows.iter()
            .map(|row| {
                object(
                    ["id", "kind", "path", "oldDigest", "newDigest"]
                        .into_iter()
                        .filter_map(|key| member(row, key).map(|value| (key, value.clone())))
                        .collect(),
                )
            })
            .collect()
    };
    let expected = compact(member(options, "reviewedChanges").expect("fixture markers"));
    match engine.discover_table_inventory_migration_changes(
        member(request, "previous").expect("fixture previous"),
        member(request, "next").expect("fixture next"),
        &selector,
        member(request, "history").expect("fixture history"),
        &mut Context::ordinary(),
    ) {
        Ok(found) => format!(
            "expected markers: {expected:?}; source-derived markers: {:?}",
            compact(&found)
        ),
        Err(error) => format!("expected markers: {expected:?}; discovery refused: {error:?}"),
    }
}

#[test]
fn initial_inventory_compiles_serializes_and_verifies_complete_source_plan() {
    let resources = resources();
    let engine = CodegenEngine::new(&resources);
    let request = load_text(include_str!("fixtures/inventory-initial-request.json"));
    let result = engine
        .compile_table_inventory_initial(&request, &mut Context::ordinary())
        .unwrap();
    assert_eq!(
        member(&result, "status"),
        Some(&Value::string_utf8("compiled")),
        "{result:?}"
    );
    let plan = member(&result, "plan").unwrap();
    let Value::Array(steps) = member(plan, "steps").unwrap() else {
        panic!("steps")
    };
    let Value::Array(phases) = member(plan, "phases").unwrap() else {
        panic!("phases")
    };
    let Value::Array(prefixes) = member(plan, "prefixes").unwrap() else {
        panic!("prefixes")
    };
    assert_eq!((steps.len(), phases.len(), prefixes.len()), (21, 5, 6));
    assert_eq!(
        member(&steps[0], "operation"),
        Some(&Value::string_utf8("prepare-inventory-metadata"))
    );
    assert!(steps
        .iter()
        .any(|step| member(step, "operation") == Some(&Value::string_utf8("create-table"))));
    assert_eq!(
        member(steps.last().unwrap(), "operation"),
        Some(&Value::string_utf8("publish-inventory"))
    );
    let inventory = member(plan, "inventory").unwrap();
    let Value::Array(changes) = member(inventory, "changes").unwrap() else {
        panic!("changes")
    };
    assert_eq!(changes.len(), 1);
    assert_eq!(
        member(&changes[0], "kind"),
        Some(&Value::string_utf8("create-table"))
    );
    let Value::Array(review) = member(plan, "review").unwrap() else {
        panic!("review")
    };
    let meaning = member(&review[0], "newValue")
        .and_then(|value| member(value, "meaning"))
        .unwrap();
    let Value::Array(source_closure) = member(meaning, "sourceClosure").unwrap() else {
        panic!("source closure")
    };
    let Value::Array(dependencies) = member(meaning, "dependencies").unwrap() else {
        panic!("dependencies")
    };
    assert_eq!((source_closure.len(), dependencies.len()), (17, 23));
    let options = member(&request, "options").unwrap();
    let selector = object(vec![
        (
            "version",
            Value::string_utf8("umf.table-inventory-discovery/0.1"),
        ),
        (
            "tableIntents",
            member(options, "tableIntents").unwrap().clone(),
        ),
        ("conversions", Value::Array(vec![])),
        ("retiredSeedSets", Value::Array(vec![])),
        ("retirements", Value::Array(vec![])),
        ("restorations", Value::Array(vec![])),
        ("archiveSources", Value::Array(vec![])),
    ]);
    let history = member(&request, "history").unwrap();
    let discovered = engine
        .discover_table_inventory_initial(
            &Value::Null,
            member(&request, "next").unwrap(),
            &selector,
            history,
            &mut Context::ordinary(),
        )
        .unwrap();
    let Value::Array(candidates) = discovered else {
        panic!("candidates")
    };
    assert_eq!(candidates.len(), 1);
    let Value::Array(markers) = member(options, "reviewedChanges").unwrap() else {
        panic!("markers")
    };
    assert_eq!(member(&candidates[0], "id"), member(&markers[0], "id"));
    let verified = engine
        .verify_table_inventory_initial(plan, history, &mut Context::ordinary())
        .unwrap();
    assert_eq!(&verified, plan);
    let serialized = engine
        .serialize_table_inventory_initial(plan, history, &mut Context::ordinary())
        .unwrap();
    assert!(matches!(serialized, Value::String(_)));
}

#[test]
fn initial_inventory_refuses_forged_review_marker_before_plan_emission() {
    let resources = resources();
    let engine = CodegenEngine::new(&resources);
    let mut request = load_text(include_str!("fixtures/inventory-initial-request.json"));
    let options = member_mut(&mut request, "options");
    let Value::Array(markers) = member_mut(options, "reviewedChanges") else {
        panic!("expected markers")
    };
    *member_mut(&mut markers[0], "id") = Value::string_utf8("review-forged");
    let result = engine
        .compile_table_inventory_initial(&request, &mut Context::ordinary())
        .unwrap();
    assert_eq!(
        member(&result, "status"),
        Some(&Value::string_utf8("blocked"))
    );
    assert!(member(&result, "plan").is_none());
}

#[test]
fn initial_inventory_uses_renderer_exact_update_columns_and_rejects_rehashed_wrong_grant() {
    let resources = resources();
    let engine = CodegenEngine::new(&resources);
    let template = load_text(include_str!("fixtures/inventory-initial-request.json"));
    let (bundle, request, result) = connected_grant_case(&engine, &template);
    assert_eq!(
        member(&result, "status"),
        Some(&Value::string_utf8("compiled")),
        "{result:?}"
    );
    let plan = member(&result, "plan").expect("compiled plan");
    let grants = initial_grant_rows(plan);
    let expected = Value::Array(vec![
        Value::string_utf8("owner"),
        Value::string_utf8("note"),
    ]);
    let person_update = grant_meaning(grants, "note_person", "update").expect("person update");
    let batch_update = grant_meaning(grants, "note_batch", "update").expect("batch allow update");
    assert_eq!(member(person_update, "columns"), Some(&expected));
    assert_eq!(member(batch_update, "columns"), Some(&expected));
    assert!(grant_meaning(grants, "note_batch", "insert").is_none());
    assert_eq!(
        member(grant_meaning(grants, "note_person", "select").unwrap(), "columns"),
        Some(&Value::Null)
    );
    assert_eq!(
        grant_column_names(person_update),
        vec![String::from("owner"), String::from("note")]
    );
    assert_eq!(
        grant_column_names(batch_update),
        vec![String::from("owner"), String::from("note")]
    );

    let Value::Array(steps) = member(plan, "steps").expect("plan steps") else {
        panic!("steps array")
    };
    for (audience, meaning) in [("person", person_update), ("batch", batch_update)] {
        let source_path = format!("/modules/0/extensions/umf.tables/tables/0/policy/{audience}/update");
        let step = steps
            .iter()
            .find(|step| {
                member(step, "sourcePath") == Some(&Value::string_utf8(&source_path))
                    && member(step, "sql").is_some_and(|sql| match sql {
                        Value::String(text) => text
                            .to_utf8()
                            .is_ok_and(|text| text.starts_with("GRANT UPDATE (")),
                        _ => false,
                    })
            })
            .expect("renderer census update step");
        let subject = member(step, "inventorySubject").expect("census subject");
        let digest = digest_hex(&canonical_sha256(meaning, &mut Context::ordinary()).unwrap());
        assert_eq!(
            member(subject, "meaningDigest"),
            Some(&Value::string_utf8(&digest))
        );
    }

    let Value::Array(bundle_steps) = member(&bundle, "steps").expect("deployment steps") else {
        panic!("deployment steps")
    };
    for role in ["note_person", "note_batch"] {
        let role_sql = bundle_steps
            .iter()
            .filter_map(|step| member(step, "sql"))
            .find_map(|sql| match sql {
                Value::String(text) => {
                    let text = text.to_utf8().unwrap();
                    (text == format!(
                        "GRANT UPDATE (\"owner\", \"note\") ON TABLE \"note_inventory\".\"notes\" TO \"{role}\""
                    ))
                    .then_some(text)
                }
                _ => None,
            })
            .expect("ordered deployment grant SQL");
        assert!(role_sql.ends_with(&format!("TO \"{role}\"")));
    }

    let Value::Array(prefixes) = member(plan, "prefixes").expect("prefixes") else {
        panic!("prefix array")
    };
    let final_catalog = member(prefixes.last().unwrap(), "catalog").unwrap();
    assert_eq!(member(final_catalog, "grants"), Some(grants));
    let history = member(&request, "history").unwrap();
    let verified = engine
        .verify_table_inventory_initial(plan, history, &mut Context::ordinary())
        .unwrap();
    assert_eq!(&verified, plan);
    let serialized = engine
        .serialize_table_inventory_initial(plan, history, &mut Context::ordinary())
        .unwrap();
    let Value::String(serialized) = serialized else {
        panic!("canonical serialized plan")
    };
    let decoded = read_json_value(serialized.units(), Format::Json, &mut Context::catalog()).unwrap();
    let decoded_verified = engine
        .verify_table_inventory_initial(&decoded, history, &mut Context::ordinary())
        .unwrap();
    let roundtrip = engine
        .serialize_table_inventory_initial(&decoded_verified, history, &mut Context::ordinary())
        .unwrap();
    let Value::String(roundtrip) = roundtrip else {
        panic!("canonical serialized roundtrip")
    };
    assert_eq!(roundtrip, serialized);
}

#[test]
fn initial_inventory_refuses_a_rehashed_wrong_grant_vector() {
    let resources = resources();
    let engine = CodegenEngine::new(&resources);
    let template = load_text(include_str!("fixtures/inventory-initial-request.json"));
    let (_, request, result) = connected_grant_case(&engine, &template);
    let plan = member(&result, "plan").expect("compiled plan");
    let history = member(&request, "history").unwrap();
    let mut forged = plan.clone();
    let Value::Array(review) = member_mut(&mut forged, "review") else {
        panic!("review array")
    };
    let meaning = member_mut(member_mut(&mut review[0], "newValue"), "meaning");
    let catalog = member_mut(meaning, "catalog");
    let Value::Array(grant_rows) = member_mut(catalog, "grants") else {
        panic!("grant rows")
    };
    let target = grant_rows
        .iter_mut()
        .find(|row| {
            let meaning = member(row, "meaning").unwrap();
            member(meaning, "role") == Some(&Value::string_utf8("note_person"))
                && member(meaning, "privilege") == Some(&Value::string_utf8("update"))
        })
        .expect("person UPDATE row");
    *member_mut(member_mut(target, "meaning"), "columns") =
        Value::Array(vec![Value::string_utf8("owner")]);
    let Value::Array(subject) = member_mut(member_mut(target, "identity"), "subject") else {
        panic!("grant identity subject")
    };
    subject[2] = Value::Array(vec![Value::string_utf8("owner")]);
    rehash_plan_digest(&mut forged);
    let wrong_grant = engine
        .verify_table_inventory_initial(&forged, history, &mut Context::ordinary())
        .unwrap_err();
    assert_eq!(wrong_grant.code, "TABLE_INVENTORY_PLAN");
}

#[test]
fn initial_inventory_selected_seed_is_source_bound_and_confirms_only_in_prefix() {
    let resources = resources();
    let engine = CodegenEngine::new(&resources);
    let request = load_text(include_str!("fixtures/inventory-initial-seed-request.json"));
    let result = engine
        .compile_table_inventory_initial(&request, &mut Context::ordinary())
        .unwrap();
    assert_eq!(
        member(&result, "status"),
        Some(&Value::string_utf8("compiled")),
        "{result:?}"
    );
    let plan = member(&result, "plan").unwrap();
    let Value::Array(steps) = member(plan, "steps").unwrap() else {
        panic!("steps")
    };
    let Value::Array(prefixes) = member(plan, "prefixes").unwrap() else {
        panic!("prefixes")
    };
    assert_eq!(
        steps
            .iter()
            .filter(|step| member(step, "operation") == Some(&Value::string_utf8("apply-seeds")))
            .count(),
        1
    );
    assert_eq!(
        member(plan, "seedExecution"),
        Some(&object(vec![
            (
                "version",
                Value::string_utf8("umf.table-seed-execution/0.1")
            ),
            (
                "sets",
                Value::Array(vec![Value::string_utf8("initial-note-seed")])
            )
        ]))
    );
    let Value::Array(lineage) = member(member(plan, "inventory").unwrap(), "seedLineage").unwrap()
    else {
        panic!("seed lineage")
    };
    assert_eq!(
        member(&lineage[0], "execution"),
        Some(&Value::string_utf8("not-run"))
    );
    let Value::Array(final_states) = member(prefixes.last().unwrap(), "seedStates").unwrap() else {
        panic!("prefix seed states")
    };
    assert_eq!(
        member(&final_states[0], "execution"),
        Some(&Value::string_utf8("confirmed"))
    );
    let verified = engine
        .verify_table_inventory_initial(
            plan,
            member(&request, "history").unwrap(),
            &mut Context::ordinary(),
        )
        .unwrap();
    assert_eq!(&verified, plan);

    let mut forged = request.clone();
    let Value::Array(selected) = member_mut(member_mut(&mut forged, "options"), "seedSets") else {
        panic!("selected seeds")
    };
    selected[0] = Value::string_utf8("missing-seed");
    let refused = engine
        .compile_table_inventory_initial(&forged, &mut Context::ordinary())
        .unwrap();
    assert_eq!(
        member(&refused, "status"),
        Some(&Value::string_utf8("blocked"))
    );
    assert!(member(&refused, "plan").is_none());
}

#[test]
fn installed_inventory_discovers_irreversible_removal_without_lowering_it() {
    let resources = resources();
    let engine = CodegenEngine::new(&resources);
    let initial = load_text(include_str!("fixtures/inventory-multi-request.json"));
    let built = engine
        .compile_table_inventory_initial(&initial, &mut Context::ordinary())
        .unwrap();
    assert_eq!(
        member(&built, "status"),
        Some(&Value::string_utf8("compiled")),
        "{built:?}"
    );
    let installed = member(&built, "plan").unwrap().clone();
    let removal = load_text(include_str!("fixtures/inventory-removal-request.json"));
    let history = object(vec![
        (
            "profile",
            Value::string_utf8("umf.table-inventory-source-history/0.1"),
        ),
        ("plans", Value::Array(vec![installed.clone()])),
        (
            "executions",
            Value::Array(vec![object(vec![
                ("planDigest", member(&installed, "digest").unwrap().clone()),
                ("entryDigest", Value::string_utf8(&"a".repeat(64))),
                ("seedOutcomes", Value::Array(vec![])),
            ])]),
        ),
    ]);
    let discovered = engine
        .discover_table_inventory_removal(
            member(&removal, "previous").unwrap(),
            member(&removal, "next").unwrap(),
            member(&removal, "selector").unwrap(),
            &history,
            &mut Context::ordinary(),
        )
        .unwrap();
    let Value::Array(candidates) = discovered else {
        panic!("candidates")
    };
    assert_eq!(candidates.len(), 2);
    assert_eq!(
        member(&candidates[0], "kind"),
        Some(&Value::string_utf8("remove-table"))
    );
    assert_eq!(
        member(&candidates[1], "kind"),
        Some(&Value::string_utf8("table-removal-effects"))
    );
    assert_eq!(
        member(&candidates[1], "path"),
        Some(&Value::string_utf8("/options/tableIntents/0/disposition"))
    );
    assert_eq!(
        member(&candidates[0], "oldDigest"),
        member(&candidates[1], "oldDigest")
    );
    assert_eq!(
        member(&candidates[0], "newDigest"),
        member(&candidates[1], "newDigest")
    );
    let disclosure = engine
        .irreversible_table_purge_disclosure(&candidates[1], &mut Context::ordinary())
        .unwrap();
    assert_eq!(
        member(&disclosure, "code"),
        Some(&Value::string_utf8("IRREVERSIBLE_TABLE_PURGE"))
    );
    assert_eq!(
        member(&disclosure, "markerId"),
        member(&candidates[1], "id")
    );
    let Value::Array(expected) = member(&removal, "candidates").unwrap() else {
        panic!("expected candidates")
    };
    for (actual, expected) in candidates.iter().zip(expected) {
        assert_eq!(member(actual, "id"), member(expected, "id"), "{actual:?}");
    }
    let mut invalid = removal.clone();
    let selector = member_mut(&mut invalid, "selector");
    let Value::Array(intents) = member_mut(selector, "tableIntents") else {
        panic!("intents")
    };
    *member_mut(member_mut(&mut intents[0], "disposition"), "mode") = Value::string_utf8("archive");
    let refused = engine.discover_table_inventory_removal(
        member(&invalid, "previous").unwrap(),
        member(&invalid, "next").unwrap(),
        member(&invalid, "selector").unwrap(),
        &history,
        &mut Context::ordinary(),
    );
    assert!(refused.is_err());
    let mut forged = candidates[1].clone();
    *member_mut(&mut forged, "newDigest") = Value::string_utf8(&"0".repeat(64));
    assert!(engine
        .irreversible_table_purge_disclosure(&forged, &mut Context::ordinary())
        .is_err());
}

#[test]
fn sole_table_removal_discovers_purge_when_next_source_has_no_tables() {
    let resources = resources();
    let engine = CodegenEngine::new(&resources);
    let initial = load_text(include_str!("fixtures/inventory-initial-request.json"));
    let built = engine
        .compile_table_inventory_initial(&initial, &mut Context::ordinary())
        .unwrap();
    assert_eq!(
        member(&built, "status"),
        Some(&Value::string_utf8("compiled")),
        "{built:?}"
    );
    let plan = member(&built, "plan").unwrap().clone();
    let removal = load_text(include_str!("fixtures/inventory-sole-removal-request.json"));
    let history = object(vec![
        (
            "profile",
            Value::string_utf8("umf.table-inventory-source-history/0.1"),
        ),
        ("plans", Value::Array(vec![plan.clone()])),
        (
            "executions",
            Value::Array(vec![object(vec![
                ("planDigest", member(&plan, "digest").unwrap().clone()),
                ("entryDigest", Value::string_utf8(&"a".repeat(64))),
                ("seedOutcomes", Value::Array(vec![])),
            ])]),
        ),
    ]);
    let actual = engine
        .discover_table_inventory_removal(
            member(&removal, "previous").unwrap(),
            member(&removal, "next").unwrap(),
            member(&removal, "selector").unwrap(),
            &history,
            &mut Context::ordinary(),
        )
        .unwrap();
    let Value::Array(actual) = actual else {
        panic!("expected review candidates")
    };
    let Value::Array(expected) = member(&removal, "candidates").unwrap() else {
        panic!("expected oracle candidates")
    };
    assert_eq!(actual.len(), 2);
    for (actual, expected) in actual.iter().zip(expected) {
        assert_eq!(member(actual, "id"), member(expected, "id"));
    }
}

#[test]
fn two_table_removal_discovers_ordered_purges_and_refuses_duplicate_intent() {
    let resources = resources();
    let engine = CodegenEngine::new(&resources);
    let initial = load_text(include_str!("fixtures/inventory-multi-request.json"));
    let built = engine
        .compile_table_inventory_initial(&initial, &mut Context::ordinary())
        .unwrap();
    let installed = member(&built, "plan").unwrap();
    let history = object(vec![
        (
            "profile",
            Value::string_utf8("umf.table-inventory-source-history/0.1"),
        ),
        ("plans", Value::Array(vec![installed.clone()])),
        (
            "executions",
            Value::Array(vec![object(vec![
                ("planDigest", member(installed, "digest").unwrap().clone()),
                ("entryDigest", Value::string_utf8(&"a".repeat(64))),
                ("seedOutcomes", Value::Array(vec![])),
            ])]),
        ),
    ]);
    let request = load_text(include_str!("fixtures/inventory-remove-two-next.json"));
    let previous = member(&initial, "next").unwrap();
    let next = member(&request, "next").unwrap();
    let selector = member(&request, "selector").unwrap();
    let discovered = engine
        .discover_table_inventory_migration_changes(
            previous,
            next,
            selector,
            &history,
            &mut Context::ordinary(),
        )
        .unwrap();
    let Value::Array(candidates) = discovered else {
        panic!("candidates")
    };
    assert_eq!(candidates.len(), 4);
    for (index, pair) in candidates.chunks_exact(2).enumerate() {
        assert_eq!(
            member(&pair[0], "kind"),
            Some(&Value::string_utf8("remove-table"))
        );
        assert_eq!(
            member(&pair[1], "kind"),
            Some(&Value::string_utf8("table-removal-effects"))
        );
        assert_eq!(
            member(&pair[1], "path"),
            Some(&Value::string_utf8(&format!(
                "/options/tableIntents/{index}/disposition"
            ))),
        );
        let disclosure = engine
            .irreversible_table_purge_disclosure(&pair[1], &mut Context::ordinary())
            .unwrap();
        assert_eq!(member(&disclosure, "markerId"), member(&pair[1], "id"));
    }
    let mut duplicate = selector.clone();
    let Value::Array(intents) = member_mut(&mut duplicate, "tableIntents") else {
        panic!("intents")
    };
    intents[1] = intents[0].clone();
    assert!(engine
        .discover_table_inventory_migration_changes(
            previous,
            next,
            &duplicate,
            &history,
            &mut Context::ordinary(),
        )
        .is_err());
}

#[test]
fn two_initial_tables_compile_with_one_schema_grant_and_both_source_closures() {
    let resources = resources();
    let engine = CodegenEngine::new(&resources);
    let request = load_text(include_str!("fixtures/inventory-multi-request.json"));
    let result = engine
        .compile_table_inventory_initial(&request, &mut Context::ordinary())
        .unwrap();
    assert_eq!(
        member(&result, "status"),
        Some(&Value::string_utf8("compiled")),
        "{result:?}"
    );
    let plan = member(&result, "plan").unwrap();
    let Value::Array(steps) = member(plan, "steps").unwrap() else {
        panic!("steps")
    };
    let Value::Array(phases) = member(plan, "phases").unwrap() else {
        panic!("phases")
    };
    let Value::Array(prefixes) = member(plan, "prefixes").unwrap() else {
        panic!("prefixes")
    };
    assert_eq!((steps.len(), phases.len(), prefixes.len()), (38, 5, 6));
    let creation_count = steps
        .iter()
        .filter(|step| member(step, "operation") == Some(&Value::string_utf8("create-table")))
        .count();
    assert_eq!(creation_count, 2);
    let inventory = member(plan, "inventory").unwrap();
    let Value::Array(tables) = member(inventory, "nextTables").unwrap() else {
        panic!("tables")
    };
    let Value::Array(changes) = member(inventory, "changes").unwrap() else {
        panic!("changes")
    };
    assert_eq!((tables.len(), changes.len()), (2, 2));
    let Value::Array(review) = member(plan, "review").unwrap() else {
        panic!("review")
    };
    for item in review {
        let meaning = member(item, "newValue")
            .and_then(|value| member(value, "meaning"))
            .unwrap();
        let Value::Array(dependencies) = member(meaning, "dependencies").unwrap() else {
            panic!("dependencies")
        };
        assert_eq!(dependencies.len(), 23);
    }
    let history = member(&request, "history").unwrap();
    let verified = engine
        .verify_table_inventory_initial(plan, history, &mut Context::ordinary())
        .unwrap();
    assert_eq!(&verified, plan);
}

#[test]
fn initial_inventory_projects_typed_command_refs_into_source_review() {
    let resources = resources();
    let engine = CodegenEngine::new(&resources);
    let request = load_text(include_str!(
        "fixtures/inventory-initial-command-request.json"
    ));
    let result = engine
        .compile_table_inventory_initial(&request, &mut Context::ordinary())
        .unwrap();
    assert_eq!(
        member(&result, "status"),
        Some(&Value::string_utf8("compiled")),
        "{result:?}"
    );
    let plan = member(&result, "plan").unwrap();
    let Value::Array(review) = member(plan, "review").unwrap() else {
        panic!("review")
    };
    let meaning = member(&review[0], "newValue")
        .and_then(|value| member(value, "meaning"))
        .unwrap();
    let Value::Array(operation_ids) = member(meaning, "operationIds").unwrap() else {
        panic!("operationIds")
    };
    assert_eq!(operation_ids, &[Value::string_utf8("refresh_owner")]);
    let Value::Array(source_closure) = member(meaning, "sourceClosure").unwrap() else {
        panic!("sourceClosure")
    };
    assert!(source_closure.iter().any(|entry| member(entry, "path")
        == Some(&Value::string_utf8(
            "/modules/0/extensions/umf.tables/commands/0"
        ))));
    let Value::Array(edges) = member(meaning, "dependencies").unwrap() else {
        panic!("dependencies")
    };
    assert!(edges.iter().any(
        |edge| member(edge, "reason") == Some(&Value::string_utf8("operation-requires-table"))
    ));
    assert!(
        edges
            .iter()
            .filter(|edge| member(edge, "reason")
                == Some(&Value::string_utf8("operation-requires-field")))
            .count()
            >= 2
    );
}

#[test]
fn retained_g02_mixed_create_compiles_serializes_and_verifies() {
    let resources = resources();
    let engine = CodegenEngine::new(&resources);
    let request = load_text(include_str!("fixtures/inventory-g02-retained-request.json"));
    let result = engine
        .compile_table_inventory_migration(&request, &mut Context::ordinary())
        .unwrap();
    assert_eq!(
        member(&result, "status"),
        Some(&Value::string_utf8("compiled")),
        "{result:?}"
    );
    let plan = member(&result, "plan").unwrap();
    let Value::Array(steps) = member(plan, "steps").unwrap() else {
        panic!("steps")
    };
    let roles = steps
        .iter()
        .filter_map(|step| member(step, "operation"))
        .collect::<Vec<_>>();
    for required in [
        "create-table",
        "dependency-drop",
        "add-column",
        "target-check",
        "apply-backfill",
        "install-default",
        "tighten-not-null",
        "dependency-add",
        "publish-inventory",
    ] {
        assert!(
            roles.contains(&&Value::string_utf8(required)),
            "missing {required}: {result:?}"
        );
    }
    assert!(
        roles
            .iter()
            .position(|value| *value == &Value::string_utf8("dependency-drop"))
            < roles
                .iter()
                .position(|value| *value == &Value::string_utf8("add-column"))
    );
    assert!(
        roles
            .iter()
            .position(|value| *value == &Value::string_utf8("add-column"))
            < roles
                .iter()
                .position(|value| *value == &Value::string_utf8("apply-backfill"))
    );
    let history = member(&request, "history").unwrap();
    let Value::Array(retained_plans) = member(history, "plans").unwrap() else {
        panic!("retained plans")
    };
    let Value::Array(retained_executions) = member(history, "executions").unwrap() else {
        panic!("retained executions")
    };
    assert_eq!(
        member(&retained_plans[0], "digest"),
        Some(&Value::string_utf8(
            "4636e81328924af70626508983161b06738be63fcd7e446340619a04ea48f198"
        ))
    );
    assert_eq!(
        member(&retained_executions[0], "planDigest"),
        Some(&Value::string_utf8(
            "4636e81328924af70626508983161b06738be63fcd7e446340619a04ea48f198"
        ))
    );
    let selector = object(vec![
        (
            "version",
            Value::string_utf8("umf.table-inventory-discovery/0.1"),
        ),
        (
            "tableIntents",
            member(member(&request, "options").unwrap(), "tableIntents")
                .unwrap()
                .clone(),
        ),
        ("conversions", Value::Array(vec![])),
        ("retiredSeedSets", Value::Array(vec![])),
        ("retirements", Value::Array(vec![])),
        ("restorations", Value::Array(vec![])),
        ("archiveSources", Value::Array(vec![])),
    ]);
    let discovered = engine
        .discover_table_inventory_migration_changes(
            member(&request, "previous").unwrap(),
            member(&request, "next").unwrap(),
            &selector,
            history,
            &mut Context::ordinary(),
        )
        .unwrap();
    assert_eq!(&discovered, member(plan, "review").unwrap());
    let verified = engine
        .verify_table_inventory_migration(plan, history, &mut Context::ordinary())
        .unwrap();
    assert_eq!(&verified, plan);
    let serialized = engine
        .serialize_table_inventory_migration(plan, history, &mut Context::ordinary())
        .unwrap();
    assert!(matches!(serialized, Value::String(_)));

    let mut forged = request;
    let options = member_mut(&mut forged, "options");
    let Value::Array(backfills) = member_mut(options, "backfills") else {
        panic!("backfills")
    };
    *member_mut(&mut backfills[0], "operation") = Value::string_utf8("unknown_fill");
    let refused = engine
        .compile_table_inventory_migration(&forged, &mut Context::ordinary())
        .unwrap();
    assert_eq!(
        member(&refused, "status"),
        Some(&Value::string_utf8("blocked")),
        "{refused:?}"
    );
    assert!(member(&refused, "plan").is_none());
}

#[test]
fn retained_g02_selected_created_seed_and_command_have_source_lineage() {
    let resources = resources();
    let engine = CodegenEngine::new(&resources);
    let request = load_text(include_str!(
        "fixtures/inventory-g02-seed-command-request.json"
    ));
    let result = engine
        .compile_table_inventory_migration(&request, &mut Context::ordinary())
        .unwrap();
    if member(&result, "status") != Some(&Value::string_utf8("compiled")) {
        panic!("{result:?}; {}", g02_review_mismatch(&engine, &request));
    }
    let plan = member(&result, "plan").unwrap();
    let Value::Array(review) = member(plan, "review").unwrap() else {
        panic!("review")
    };
    assert!(review.iter().any(|row| member(row, "kind")
        == Some(&Value::string_utf8("change-operation"))
        && member(row, "path")
            == Some(&Value::string_utf8(
                "/modules/0/extensions/umf.tables/commands/1"
            ))));
    let Value::Array(phases) = member(plan, "phases").unwrap() else {
        panic!("phases")
    };
    assert!(phases
        .iter()
        .any(|phase| { member(phase, "kind") == Some(&Value::string_utf8("seed")) }));
    let Value::Array(steps) = member(plan, "steps").unwrap() else {
        panic!("steps")
    };
    assert_eq!(
        steps
            .iter()
            .filter(|step| member(step, "operation") == Some(&Value::string_utf8("apply-seeds")))
            .count(),
        1
    );
    let Value::Array(prefixes) = member(plan, "prefixes").unwrap() else {
        panic!("prefixes")
    };
    assert_eq!(prefixes.len(), phases.len() + 1);
    let Value::Array(pending) = member(&prefixes[4], "seedStates").unwrap() else {
        panic!("pending seeds")
    };
    let Value::Array(confirmed) = member(&prefixes[5], "seedStates").unwrap() else {
        panic!("confirmed seeds")
    };
    assert!(pending.iter().any(|seed| {
        member(seed, "id") == Some(&Value::string_utf8("archive-seed"))
            && member(seed, "execution") == Some(&Value::string_utf8("not-run"))
    }));
    assert!(confirmed.iter().any(|seed| {
        member(seed, "id") == Some(&Value::string_utf8("archive-seed"))
            && member(seed, "execution") == Some(&Value::string_utf8("confirmed"))
    }));
    let history = member(&request, "history").unwrap();
    let verified = engine
        .verify_table_inventory_migration(plan, history, &mut Context::ordinary())
        .unwrap();
    assert_eq!(&verified, plan);
    let mut forged = request;
    let Value::Array(selected) = member_mut(member_mut(&mut forged, "options"), "seedSets") else {
        panic!("selected seeds")
    };
    selected.push(Value::string_utf8("unknown-seed"));
    let refused = engine
        .compile_table_inventory_migration(&forged, &mut Context::ordinary())
        .unwrap();
    assert_eq!(
        member(&refused, "status"),
        Some(&Value::string_utf8("blocked")),
        "{refused:?}"
    );
    assert!(member(&refused, "plan").is_none());
}

#[test]
fn retained_g02_accepts_confirmed_prior_seed_and_refuses_a_replayed_selection() {
    let resources = resources();
    let engine = CodegenEngine::new(&resources);
    let request = load_text(include_str!(
        "fixtures/inventory-linked-seed-history-request.json"
    ));
    let Value::Array(retained_plans) = member(member(&request, "history").unwrap(), "plans").unwrap()
    else {
        panic!("retained plans")
    };
    let Value::Array(retained_executions) =
        member(member(&request, "history").unwrap(), "executions").unwrap()
    else {
        panic!("retained executions")
    };
    assert_eq!(
        member(&retained_plans[0], "digest"),
        Some(&Value::string_utf8(
            "81bbc35555000561843c74e6ea146d081715baa306cc07f0f521475697eadc85"
        ))
    );
    assert_eq!(
        member(&retained_executions[0], "planDigest"),
        Some(&Value::string_utf8(
            "81bbc35555000561843c74e6ea146d081715baa306cc07f0f521475697eadc85"
        ))
    );
    let result = engine
        .compile_table_inventory_migration(&request, &mut Context::ordinary())
        .unwrap();
    assert_eq!(
        member(&result, "status"),
        Some(&Value::string_utf8("compiled")),
        "{result:?}"
    );
    let plan = member(&result, "plan").unwrap();
    let Value::Array(lineage) = member(member(plan, "inventory").unwrap(), "seedLineage").unwrap()
    else {
        panic!("seed lineage")
    };
    assert_eq!(lineage.len(), 2);
    assert_eq!(
        member(&lineage[0], "id"),
        Some(&Value::string_utf8("initial-note-seed"))
    );
    assert_eq!(
        member(&lineage[0], "execution"),
        Some(&Value::string_utf8("confirmed"))
    );
    assert_eq!(
        member(&lineage[0], "disposition"),
        Some(&Value::string_utf8("retain-definition"))
    );
    assert_eq!(
        member(&lineage[1], "id"),
        Some(&Value::string_utf8("archive-seed"))
    );
    assert_eq!(
        member(&lineage[1], "execution"),
        Some(&Value::string_utf8("not-run"))
    );
    engine
        .verify_table_inventory_migration(
            plan,
            member(&request, "history").unwrap(),
            &mut Context::ordinary(),
        )
        .unwrap();

    let mut replay = request;
    let Value::Array(selected) = member_mut(member_mut(&mut replay, "options"), "seedSets") else {
        panic!("seed selection")
    };
    selected.clear();
    selected.push(Value::string_utf8("initial-note-seed"));
    let blocked = engine
        .compile_table_inventory_migration(&replay, &mut Context::ordinary())
        .unwrap();
    assert_eq!(
        member(&blocked, "status"),
        Some(&Value::string_utf8("blocked")),
        "{blocked:?}"
    );
    assert!(member(&blocked, "plan").is_none());
    let Value::Array(diagnostics) = member(&blocked, "diagnostics").unwrap() else {
        panic!("diagnostics")
    };
    assert_eq!(
        member(&diagnostics[0], "path"),
        Some(&Value::string_utf8("/options/seedSets"))
    );
}

#[test]
fn retained_g02_created_read_command_has_source_bound_field_dependencies() {
    let resources = resources();
    let engine = CodegenEngine::new(&resources);
    let request = load_text(include_str!(
        "fixtures/inventory-g02-read-command-request.json"
    ));
    let result = engine
        .compile_table_inventory_migration(&request, &mut Context::ordinary())
        .unwrap();
    if member(&result, "status") != Some(&Value::string_utf8("compiled")) {
        panic!("{result:?}; {}", g02_review_mismatch(&engine, &request));
    }
    let plan = member(&result, "plan").unwrap();
    let Value::Array(review) = member(plan, "review").unwrap() else {
        panic!("review")
    };
    assert!(review.iter().any(|row| {
        member(row, "kind") == Some(&Value::string_utf8("change-operation"))
            && member(row, "path")
                == Some(&Value::string_utf8(
                    "/modules/0/extensions/umf.tables/commands/2",
                ))
    }));
    let history = member(&request, "history").unwrap();
    let verified = engine
        .verify_table_inventory_migration(plan, history, &mut Context::ordinary())
        .unwrap();
    assert_eq!(&verified, plan);

    let mut missing_review = request;
    let Value::Array(markers) = member_mut(
        member_mut(&mut missing_review, "options"),
        "reviewedChanges",
    ) else {
        panic!("reviewed changes")
    };
    markers.pop();
    let refused = engine
        .compile_table_inventory_migration(&missing_review, &mut Context::ordinary())
        .unwrap();
    assert_eq!(
        member(&refused, "status"),
        Some(&Value::string_utf8("blocked")),
        "{refused:?}"
    );
    assert!(member(&refused, "plan").is_none());
}

#[test]
fn retained_g02_created_parameter_read_preserves_logical_domain_and_source() {
    let resources = resources();
    let engine = CodegenEngine::new(&resources);
    let request = load_text(include_str!(
        "fixtures/inventory-g02-parameter-read-request.json"
    ));
    let result = engine
        .compile_table_inventory_migration(&request, &mut Context::ordinary())
        .unwrap();
    assert_eq!(
        member(&result, "status"),
        Some(&Value::string_utf8("compiled")),
        "{result:?}"
    );
    let plan = member(&result, "plan").unwrap();
    let Value::Array(review) = member(plan, "review").unwrap() else {
        panic!("review")
    };
    let command = review
        .iter()
        .find(|row| {
            member(row, "path")
                == Some(&Value::string_utf8(
                    "/modules/0/extensions/umf.tables/commands/2",
                ))
        })
        .unwrap();
    let parameters = member(member(command, "newValue").unwrap(), "parameters").unwrap();
    let Value::Array(parameters) = parameters else {
        panic!("parameters")
    };
    assert_eq!(
        member(&parameters[0], "id"),
        Some(&Value::string_utf8("archive_lookup"))
    );
    assert_eq!(
        engine
            .verify_table_inventory_migration(
                plan,
                member(&request, "history").unwrap(),
                &mut Context::ordinary(),
            )
            .unwrap(),
        *plan
    );
    let mut missing_review = request;
    let Value::Array(markers) = member_mut(
        member_mut(&mut missing_review, "options"),
        "reviewedChanges",
    ) else {
        panic!("reviewed changes")
    };
    markers.pop();
    let refused = engine
        .compile_table_inventory_migration(&missing_review, &mut Context::ordinary())
        .unwrap();
    assert_eq!(
        member(&refused, "status"),
        Some(&Value::string_utf8("blocked")),
        "{refused:?}"
    );
    assert!(member(&refused, "plan").is_none());
}

#[test]
fn initial_inventory_cross_table_command_retains_both_reference_closures() {
    let resources = resources();
    let engine = CodegenEngine::new(&resources);
    let request = load_text(include_str!(
        "fixtures/inventory-cross-table-command-request.json"
    ));
    let result = engine
        .compile_table_inventory_initial(&request, &mut Context::ordinary())
        .unwrap();
    assert_eq!(
        member(&result, "status"),
        Some(&Value::string_utf8("compiled")),
        "{result:?}"
    );
    let plan = member(&result, "plan").unwrap();
    let Value::Array(reviews) = member(plan, "review").unwrap() else {
        panic!("review")
    };
    assert_eq!(reviews.len(), 2);
    for review in reviews {
        let meaning = member(member(review, "newValue").unwrap(), "meaning").unwrap();
        assert_eq!(
            member(meaning, "operationIds"),
            Some(&Value::Array(vec![Value::string_utf8(
                "read_related_tasks"
            )]))
        );
        let Value::Array(closure) = member(meaning, "sourceClosure").unwrap() else {
            panic!("closure")
        };
        assert!(closure.iter().any(|entry| member(entry, "path")
            == Some(&Value::string_utf8(
                "/modules/0/extensions/umf.tables/commands/0"
            ))));
        let Value::Array(edges) = member(meaning, "dependencies").unwrap() else {
            panic!("edges")
        };
        assert_eq!(
            edges
                .iter()
                .filter(|edge| member(edge, "reason")
                    == Some(&Value::string_utf8("operation-requires-table")))
                .count(),
            2
        );
        assert_eq!(
            edges
                .iter()
                .filter(|edge| member(edge, "reason")
                    == Some(&Value::string_utf8("operation-requires-field")))
                .count(),
            4
        );
    }
    let history = member(&request, "history").unwrap();
    assert_eq!(
        engine
            .verify_table_inventory_initial(plan, history, &mut Context::ordinary())
            .unwrap(),
        *plan
    );
    assert!(matches!(
        engine
            .serialize_table_inventory_initial(plan, history, &mut Context::ordinary())
            .unwrap(),
        Value::String(_)
    ));
}
