use super::*;

fn units(text: &str) -> Vec<u16> {
    text.encode_utf16().collect()
}
fn get_mut<'a>(value: &'a mut Value, key: &str) -> &'a mut Value {
    let Value::Object(fields) = value else {
        panic!("expected object")
    };
    fields
        .iter_mut()
        .find(|(name, _)| name == &Utf16::from(key))
        .map(|(_, value)| value)
        .expect("field")
}

fn json(value: &Value) -> serde_json::Value {
    match value {
        Value::Null => serde_json::Value::Null,
        Value::Bool(value) => serde_json::Value::Bool(*value),
        Value::Number(value) => serde_json::Number::from_f64(*value)
            .map(serde_json::Value::Number)
            .unwrap(),
        Value::String(value) => serde_json::Value::String(value.to_utf8().unwrap()),
        Value::Array(values) => serde_json::Value::Array(values.iter().map(json).collect()),
        Value::Object(fields) => serde_json::Value::Object(
            fields
                .iter()
                .map(|(key, value)| (key.to_utf8().unwrap(), json(value)))
                .collect(),
        ),
    }
}
fn validation_json(value: &Validation) -> serde_json::Value {
    serde_json::json!({
        "valid": value.valid,
        "complete": value.complete,
        "diagnostics": value.diagnostics.iter().map(|d| serde_json::json!({
            "code": d.code.to_utf8().unwrap(),
            "path": d.path.to_utf8().unwrap(),
            "severity": if d.severity == Severity::Error { "error" } else { "warning" },
            "message": d.message.to_utf8().unwrap()
        })).collect::<Vec<_>>()
    })
}
fn load_source(path: &str) -> Vec<u16> {
    let root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    units(&std::fs::read_to_string(root.join(path)).unwrap())
}
fn replay_case(
    source: &[u16],
    id: &str,
    expected: &serde_json::Value,
    resources: &IcebergSchemaResources,
) {
    let mut ctx = Context::ordinary();
    let imported = import_iceberg_schema(source, &Utf16::from(id), resources, &mut ctx);
    if expected["import"]["status"] == "error" {
        let actual = imported.unwrap_err();
        assert_eq!(
            actual.code,
            expected["import"]["error"]["code"].as_str().unwrap(),
            "{id}"
        );
        assert_eq!(
            actual.message.to_utf8().unwrap(),
            expected["import"]["error"]["message"].as_str().unwrap(),
            "{id}: complete import diagnostics"
        );
        return;
    }
    let document = imported.unwrap_or_else(|e| panic!("{id}: unexpected import error: {e}"));
    let inspected = inspect_iceberg(&document, resources, &mut Context::ordinary()).unwrap();
    assert_eq!(
        validation_json(&inspected),
        expected["inspect"],
        "{id}: inspect"
    );
    let exported = export_iceberg_schema(&document, resources, &mut Context::ordinary());
    if expected["export"]["status"] == "error" {
        assert_eq!(
            exported.unwrap_err().code,
            expected["export"]["error"]["code"].as_str().unwrap(),
            "{id}: export"
        );
    } else {
        let exported = exported
            .unwrap_or_else(|e| panic!("{id}: unexpected export error: {e}"))
            .to_utf8()
            .unwrap();
        let expected_export = expected["export"]
            .as_str()
            .or_else(|| expected["export"]["nativeJson"].as_str())
            .unwrap_or_else(|| {
                panic!(
                    "{id}: unexpected export fixture shape: {}",
                    expected["export"]
                )
            });
        assert_eq!(exported, expected_export, "{id}: export");
    }
    if let Some(get) = expected.get("get") {
        if get["status"] == "ok" {
            let path = Utf16::from(get["path"].as_str().unwrap());
            let actual =
                get_iceberg_node(&document, &path, resources, &mut Context::ordinary()).unwrap();
            let value = actual
                .tagged_value_preserving_extras(&mut Context::ordinary())
                .unwrap();
            assert_eq!(json(&value), get["value"], "{id}: get");
        } else {
            let path = Utf16::from(get["path"].as_str().unwrap());
            let actual = get_iceberg_node(&document, &path, resources, &mut Context::ordinary());
            let expected_error = get["error"]["code"].as_str();
            assert_eq!(
                actual.as_ref().err().map(|e| e.code.as_str()),
                expected_error,
                "{id}: expected get error for {} ({}) but got {:?}",
                get["path"],
                get,
                actual
            );
        }
    }
    if let Some(edit) = expected.get("proposeEdit") {
        if edit["status"] == "ok" {
            let (path, replacement) = if let (Some(path), Some(replacement)) =
                (edit["path"].as_str(), edit["replacement"].as_str())
            {
                (Utf16::from(path), units(replacement))
            } else if let (Some(from), Some(to), Some(field_id)) = (
                edit["from"]["value"].as_str(),
                edit["to"].as_str(),
                edit["fieldId"]["value"].as_str(),
            ) {
                // Earlier authored cases encode a field rename rather than a
                // JSON Pointer operation. Resolve the tagged field ID and
                // verify its prior name before constructing the pointer.
                let native = payload_tree(&document, &mut Context::ordinary()).unwrap();
                let root_fields = match native.root() {
                    NativeJsonNode::Object(root) => match member(root, "fields") {
                        Some(NativeJsonNode::Array(fields)) => fields,
                        _ => panic!("{id}: legacy edit root fields missing"),
                    },
                    _ => panic!("{id}: legacy edit root is not a struct"),
                };
                let target_index = root_fields
                    .iter()
                    .position(|field| {
                        let NativeJsonNode::Object(fields) = field else {
                            return false;
                        };
                        let id_matches = member(fields, "id")
                            .and_then(|n| {
                                if let NativeJsonNode::Number(token) = n {
                                    exact_int32(token)
                                } else {
                                    None
                                }
                            })
                            .is_some_and(|n| {
                                n == BigInt::parse_bytes(field_id.as_bytes(), 10).unwrap()
                            });
                        id_matches
                            && member(fields, "name")
                                .and_then(as_string)
                                .and_then(|s| s.to_utf8().ok())
                                .as_deref()
                                == Some(from)
                    })
                    .unwrap_or_else(|| {
                        panic!("{id}: field ID {field_id} did not identify a field named {from}")
                    });
                let replacement = serde_json::to_string(to).unwrap();
                (
                    Utf16::from(format!("/fields/{target_index}/name")),
                    units(&replacement),
                )
            } else {
                panic!("{id}: unsupported edit fixture shape: {edit}");
            };
            let (candidate, actual_validation) = propose_iceberg_node_edit(
                &document,
                &path,
                &replacement,
                resources,
                &mut Context::ordinary(),
            )
            .unwrap_or_else(|e| panic!("{id}: edit failed: {e}"));
            if let Some(validation) = edit.get("validation") {
                assert_eq!(
                    validation_json(&actual_validation),
                    *validation,
                    "{id}: edit validation"
                );
            }
            let expected_export = edit["export"].as_str().unwrap();
            assert_eq!(
                export_iceberg_schema(&candidate, resources, &mut Context::ordinary())
                    .unwrap()
                    .to_utf8()
                    .unwrap(),
                expected_export,
                "{id}: candidate export"
            );
            assert_eq!(
                export_iceberg_schema(&document, resources, &mut Context::ordinary())
                    .unwrap()
                    .to_utf8()
                    .unwrap(),
                edit["sourceAfter"].as_str().unwrap(),
                "{id}: source isolation"
            );
        } else if edit["status"] == "error" {
            let path = Utf16::from(edit["path"].as_str().unwrap());
            let replacement = units(edit["replacement"].as_str().unwrap());
            let error = propose_iceberg_node_edit(
                &document,
                &path,
                &replacement,
                resources,
                &mut Context::ordinary(),
            )
            .unwrap_err();
            assert_eq!(
                error.code,
                edit["error"]["code"].as_str().unwrap(),
                "{id}: rejected edit code"
            );
            assert_eq!(
                error.message.to_utf8().unwrap(),
                edit["error"]["message"].as_str().unwrap(),
                "{id}: complete rejected edit diagnostics"
            );
            assert_eq!(
                export_iceberg_schema(&document, resources, &mut Context::ordinary())
                    .unwrap()
                    .to_utf8()
                    .unwrap(),
                edit["sourceAfter"].as_str().unwrap(),
                "{id}: rejected edit source isolation"
            );
        }
    }
}

#[test]
fn exact_roundtrip_and_copied_edit() {
    let mut ctx = Context::ordinary();
    let resources = IcebergSchemaResources::new(&mut ctx).unwrap();
    let source = r#"{"type":"struct","schema-id":0,"fields":[{"id":1,"name":"a","type":"long","required":true,"initial-default":9223372036854775807}]}"#;
    let doc = import_iceberg_schema(
        &units(source),
        &Utf16::from("iceberg"),
        &resources,
        &mut ctx,
    )
    .unwrap();
    let rendered = export_iceberg_schema(&doc, &resources, &mut ctx).unwrap();
    assert!(rendered.to_utf8().unwrap().contains("9223372036854775807"));
    let selected =
        get_iceberg_node(&doc, &Utf16::from("/fields/0/id"), &resources, &mut ctx).unwrap();
    assert_eq!(selected.root(), &NativeJsonNode::Number("1".to_owned()));
    let (candidate, result) = propose_iceberg_node_edit(
        &doc,
        &Utf16::from("/fields/0/name"),
        &units(r#""renamed""#),
        &resources,
        &mut ctx,
    )
    .unwrap();
    assert!(result.valid);
    assert!(
        export_iceberg_schema(&candidate, &resources, &mut ctx)
            .unwrap()
            .to_utf8()
            .unwrap()
            .contains("\"name\":\"renamed\"")
    );
    assert!(
        export_iceberg_schema(&doc, &resources, &mut ctx)
            .unwrap()
            .to_utf8()
            .unwrap()
            .contains("\"name\":\"a\"")
    );
}

#[test]
fn exact_int32_classification_is_bounded_and_preserves_zero_identity() {
    assert_eq!(exact_int32("0e13"), Some(BigInt::from(0)));
    assert_eq!(int32_problem("1e2147483647"), Some("must be <= 2147483647"));
    assert_eq!(int32_problem("1e-2147483648"), Some("must be an integer"));
    assert_eq!(int32_problem("1e-2000000000"), Some("must be an integer"));
    assert_eq!(
        int32_problem("2147483647.0000001"),
        Some("must be <= 2147483647")
    );
    assert_eq!(int32_problem("2147483647.0000000"), None);
    assert_eq!(
        decimal_parts("decimal(999999999999999999999999999999,0)"),
        Some((i32::MAX as u64 + 1, 0))
    );
    assert_eq!(
        fixed_part("fixed[999999999999999999999999999999]"),
        Some(i32::MAX as u64 + 1)
    );
    let long_token = format!("0.{}1e{}", "0".repeat(100_000), 100_001);
    assert_eq!(exact_int32(&long_token), Some(BigInt::from(1)));

    let mut ctx = Context::ordinary();
    let native = NativeJsonTree::parse_json(&units(r#"{"type":"struct","fields":[{"id":1,"name":"blob","type":"fixed[999999999999999999999999999999]","required":true}]}"#), &mut ctx).unwrap();
    let mut diagnostics = Vec::new();
    inspect_native(native.root(), &mut diagnostics, &mut ctx).unwrap();
    assert!(
        diagnostics
            .iter()
            .any(|d| d.code == Utf16::from("ICEBERG_TYPE_PARAMETERS"))
    );
    assert!(
        !diagnostics
            .iter()
            .any(|d| d.code == Utf16::from("ICEBERG_UNKNOWN_TYPE"))
    );
}

#[test]
fn sibling_name_checks_are_metered_and_duplicate_validation_is_complete() {
    let mut ctx = Context::ordinary();
    let native=NativeJsonTree::parse_json(&units(r#"{"type":"struct","fields":[{"id":1,"name":"same","type":"long","required":true},{"id":2,"name":"same","type":"string","required":true},{"id":3,"name":"third","type":"boolean","required":true}]}"#),&mut ctx).unwrap();
    let before = ctx.charged_work();
    let mut diagnostics = Vec::new();
    inspect_native(native.root(), &mut diagnostics, &mut ctx).unwrap();
    assert!(
        ctx.charged_work() - before >= 7,
        "root, each field name, and each child type are charged"
    );
    let validation = Validation {
        valid: false,
        complete: false,
        diagnostics,
    };
    let error = validation_error("ICEBERG_DOCUMENT", &validation, &mut ctx).unwrap();
    assert_eq!(
        error.message.to_utf8().unwrap(),
        r#"[{"code":"ICEBERG_DUPLICATE_NAME","path":"/fields/1","message":"Sibling names must be unique","severity":"error"},{"code":"ICEBERG_SCHEMA_ID_CONTEXT","path":"","message":"Missing schema-id is retained; table format version determines whether it is required","severity":"warning"}]"#
    );
}

#[test]
fn rejected_diagnostic_json_preserves_lone_surrogate_paths() {
    let mut key_units = "future".encode_utf16().collect::<Vec<_>>();
    key_units.push(0xd800);
    let mut ctx = Context::ordinary();
    let resources = IcebergSchemaResources::new(&mut ctx).unwrap();
    let mut document = import_iceberg_schema(
        &units(r#"{"type":"struct","schema-id":0,"fields":[]}"#),
        &Utf16::from("surrogate-diagnostic"),
        &resources,
        &mut ctx,
    )
    .unwrap();
    let key = Utf16::new(key_units);
    let Value::Object(vocabularies) = get_mut(&mut document, "vocabularies") else {
        panic!("vocabularies")
    };
    vocabularies.push((key.clone(), Value::Bool(false)));
    let validation = inspect_iceberg(&document, &resources, &mut ctx).unwrap();
    let diagnostic = validation
        .diagnostics
        .iter()
        .find(|d| d.severity == Severity::Error)
        .expect("invalid vocabulary diagnostic");
    let mut expected_path = "/vocabularies/".encode_utf16().collect::<Vec<_>>();
    expected_path.extend(key.units());
    assert_eq!(diagnostic.path.units(), expected_path);
    let before = ctx.charged_work();
    let error = validation_error("ICEBERG_DOCUMENT", &validation, &mut ctx).unwrap();
    let message = error.message.to_utf8().unwrap();
    assert!(
        message.contains(r#""path":"/vocabularies/future\ud800""#),
        "{message}"
    );
    assert!(
        ctx.charged_work() - before >= message.encode_utf16().count() as u64,
        "full diagnostic output is metered"
    );
}

#[test]
fn long_diagnostic_is_refused_before_output_rendering() {
    let validation = Validation {
        valid: false,
        complete: false,
        diagnostics: vec![Diagnostic {
            code: Utf16::from("ICEBERG_STRUCTURE"),
            path: Utf16::from("/long"),
            python_source_path: false,
            message: Utf16::from("x".repeat(200_000)),
            severity: Severity::Error,
            python_text_origin: None,
        }],
    };
    let mut requested = 0usize;
    let mut meter = |amount: usize| {
        requested = amount;
        Err(EngineError::new(
            "LIMIT",
            Utf16::default(),
            "work budget exhausted",
        ))
    };
    let mut ctx = Context::ordinary().with_meter(&mut meter);
    let error = validation_error("ICEBERG_DOCUMENT", &validation, &mut ctx).unwrap_err();
    assert_eq!(error.code, "LIMIT");
    assert!(
        requested > 200_000,
        "the full rendered diagnostic cost is admitted before rendering: {requested}"
    );
}

#[test]
fn tagged_unknown_survives_edit_and_blocks_native_export() {
    let mut ctx = Context::ordinary();
    let resources = IcebergSchemaResources::new(&mut ctx).unwrap();
    let mut doc = import_iceberg_schema(
        &units(r#"{"type":"struct","fields":[{"id":1,"name":"a","type":"long","required":true}]}"#),
        &Utf16::from("iceberg"),
        &resources,
        &mut ctx,
    )
    .unwrap();
    let Value::Array(modules) = get_mut(&mut doc, "modules") else {
        panic!("modules")
    };
    let Value::Array(elements) = get_mut(&mut modules[0], "elements") else {
        panic!("elements")
    };
    let extensions = get_mut(&mut elements[0], "extensions");
    let payload = get_mut(extensions, EXT);
    let root = get_mut(payload, "root");
    let Value::Object(tagged) = root else {
        panic!("tagged root")
    };
    tagged.push((Utf16::from("future"), Value::string_utf8("retained")));
    let original = inspect_iceberg(&doc, &resources, &mut ctx).unwrap();
    assert!(
        original
            .diagnostics
            .iter()
            .any(|d| d.code == Utf16::from("ICEBERG_REPRESENTATION"))
    );
    let (candidate, _) = propose_iceberg_node_edit(
        &doc,
        &Utf16::from("/fields/0/name"),
        &units(r#""renamed""#),
        &resources,
        &mut ctx,
    )
    .unwrap();
    let edited = inspect_iceberg(&candidate, &resources, &mut ctx).unwrap();
    assert!(
        edited
            .diagnostics
            .iter()
            .any(|d| d.code == Utf16::from("ICEBERG_REPRESENTATION"))
    );
    assert_eq!(
        export_iceberg_schema(&doc, &resources, &mut ctx)
            .unwrap_err()
            .code,
        "ICEBERG_EXPORT"
    );
    assert_eq!(
        export_iceberg_schema(&candidate, &resources, &mut ctx)
            .unwrap_err()
            .code,
        "ICEBERG_EXPORT"
    );
}

#[test]
fn replay_frozen_authored_and_upstream_baselines() {
    let baseline: serde_json::Value = serde_json::from_str(include_str!(
        "../../../../docs/helix/04-build/evidence/rust-migration/r5-iceberg-schema/baseline.json"
    ))
    .unwrap();
    let mut resource_context = Context::ordinary();
    let resources = IcebergSchemaResources::new(&mut resource_context).unwrap();
    let authored = baseline["authoredCases"].as_array().unwrap();
    assert_eq!(authored.len(), 35);
    for case in authored {
        let id = case["id"].as_str().unwrap();
        let source = load_source(case["path"].as_str().unwrap());
        replay_case(&source, id, &case["operations"], &resources);
    }
    let upstream = baseline["upstreamCases"].as_array().unwrap();
    assert_eq!(upstream.len(), 21);
    for case in upstream {
        let source = &case["source"];
        let id = source["id"].as_str().unwrap();
        let path = format!("fixtures/iceberg/upstream/extracted/{id}.json");
        let input = load_source(&path);
        if case.get("operations").is_some() {
            replay_case(&input, id, &case["operations"], &resources);
        } else {
            let mut ctx = Context::ordinary();
            assert_eq!(
                import_iceberg_schema(&input, &Utf16::from(id), &resources, &mut ctx)
                    .unwrap_err()
                    .code,
                case["error"]["code"].as_str().unwrap(),
                "{id}"
            );
        }
    }
}

#[test]
fn replay_additive_exact_id_pointer_and_unknown_controls() {
    let controls: serde_json::Value = serde_json::from_str(include_str!(
        "../../../../docs/helix/04-build/evidence/rust-migration/r5-iceberg-schema/controls.json"
    ))
    .unwrap();
    let mut resource_context = Context::ordinary();
    let resources = IcebergSchemaResources::new(&mut resource_context).unwrap();
    let probes = controls["probes"].as_array().unwrap();
    assert_eq!(probes.len(), 20);
    for probe in probes {
        let id = probe["id"].as_str().unwrap();
        let source = units(probe["input"].as_str().unwrap());
        let mut ctx = Context::ordinary();
        let result = import_iceberg_schema(&source, &Utf16::from(id), &resources, &mut ctx);
        if id == "int32-max-plus-fraction" {
            assert_eq!(result.unwrap_err().code, "ICEBERG_DOCUMENT", "{id}");
            continue;
        }
        let observed = &probe["observed"];
        if observed["status"] == "rejected" {
            let error = result.unwrap_err();
            assert_eq!(
                error.code,
                observed["error"]["code"].as_str().unwrap(),
                "{id}"
            );
            if let Some(message) = observed["error"]["message"].as_str() {
                assert_eq!(
                    error.message.to_utf8().unwrap(),
                    message,
                    "{id}: complete rejected diagnostics"
                );
            }
        } else {
            let document = result.unwrap_or_else(|e| panic!("{id}: {e}"));
            let actual = inspect_iceberg(&document, &resources, &mut Context::ordinary()).unwrap();
            assert_eq!(
                validation_json(&actual),
                observed["inspect"],
                "{id}: inspect"
            );
            assert_eq!(
                export_iceberg_schema(&document, &resources, &mut Context::ordinary())
                    .unwrap()
                    .to_utf8()
                    .unwrap(),
                observed["export"].as_str().unwrap(),
                "{id}: export"
            );
        }
    }
    let order = &controls["replacementOrder"];
    let original = units(order["source"].as_str().unwrap());
    let mut ctx = Context::ordinary();
    let document =
        import_iceberg_schema(&original, &Utf16::from("order"), &resources, &mut ctx).unwrap();
    let root = &order["rootReplacement"];
    let (candidate, validation) = propose_iceberg_node_edit(
        &document,
        &Utf16::default(),
        &units(r#"{"type":"struct","fields":[],"schema-id":7}"#),
        &resources,
        &mut Context::ordinary(),
    )
    .unwrap();
    assert_eq!(validation_json(&validation), root["validation"]);
    assert_eq!(
        export_iceberg_schema(&candidate, &resources, &mut Context::ordinary())
            .unwrap()
            .to_utf8()
            .unwrap(),
        root["candidate"].as_str().unwrap()
    );
    assert_eq!(
        export_iceberg_schema(&document, &resources, &mut Context::ordinary())
            .unwrap()
            .to_utf8()
            .unwrap(),
        root["sourceAfter"].as_str().unwrap()
    );
    let missing_valid = &order["missingTargetValidReplacement"];
    assert_eq!(
        propose_iceberg_node_edit(
            &document,
            &Utf16::from("/missing"),
            &units("1"),
            &resources,
            &mut Context::ordinary()
        )
        .unwrap_err()
        .code,
        missing_valid["error"]["code"].as_str().unwrap()
    );
    let missing_bad = &order["missingTargetMalformedReplacement"];
    assert_eq!(
        propose_iceberg_node_edit(
            &document,
            &Utf16::from("/missing"),
            &units("{"),
            &resources,
            &mut Context::ordinary()
        )
        .unwrap_err()
        .code,
        missing_bad["error"]["code"].as_str().unwrap()
    );
    let existing_bad = &order["existingTargetMalformedReplacement"];
    assert_eq!(
        propose_iceberg_node_edit(
            &document,
            &Utf16::from("/fields/0/name"),
            &units("{"),
            &resources,
            &mut Context::ordinary()
        )
        .unwrap_err()
        .code,
        existing_bad["error"]["code"].as_str().unwrap()
    );
}
