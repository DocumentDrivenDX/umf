// SPDX-License-Identifier: MIT OR Apache-2.0
//! SOURCE ONLY, UNCOMPILED / NATIVE UNEXECUTED. Child of wire lib.rs.
//! Fixed native factory is separate from same-body Ordinary fixture diagnostics.
use super::*;
use std::cell::{Cell, RefCell};

const NAMES: [&str; 9] = [
    "coreSchema",
    "referenceSchema",
    "packageSchema",
    "constraints",
    "domainPolicy",
    "tablesPackage",
    "actionsPackage",
    "bindingPackage",
    "stableBindingPackage",
];
fn parse(source: &str) -> Value {
    umf_core::serialization::read_json_value(
        &source.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        &mut Context::catalog(),
    )
    .unwrap()
}
fn bundle() -> Value {
    // Authored mutations start from REAL unadmitted fixed DATA, not fake tokens.
    // Setup Context is fixture creation only; not a public constructor allowance.
    let v = umf_core::canonical_codegen_resources::materialize_installed_codegen_resources(
        &mut Context::catalog(),
    )
    .unwrap();
    let Value::Object(fields) = &v else {
        panic!("fixed bundle");
    };
    assert_eq!(
        fields
            .iter()
            .map(|(k, _)| k.to_utf8().unwrap())
            .collect::<Vec<_>>(),
        NAMES
    );
    v
}
fn at<'a>(v: &'a mut Value, key: &str) -> &'a mut Value {
    let Value::Object(fields) = v else {
        panic!("authored object");
    };
    &mut fields
        .iter_mut()
        .find(|(k, _)| k == &Utf16::from(key))
        .expect("authored field")
        .1
}
fn append(v: &mut Value, key: &str, value: Value) {
    let Value::Object(fields) = v else {
        panic!("authored object");
    };
    assert!(!fields.iter().any(|(k, _)| k == &Utf16::from(key)));
    fields.push((Utf16::from(key), value));
}
fn stage(event: InstalledFactoryStage<'_>) -> String {
    match event {
        InstalledFactoryStage::AdmissionStart(k) => format!("start:{}", k.to_utf8().unwrap()),
        InstalledFactoryStage::AdmissionComplete(k) => format!("complete:{}", k.to_utf8().unwrap()),
        InstalledFactoryStage::CompilationStart => "compile:start".into(),
        InstalledFactoryStage::CompilationComplete => "compile:complete".into(),
        InstalledFactoryStage::OriginPublicationAttempt => "origin:attempt".into(),
    }
}
fn admission_prefix() -> Vec<String> {
    NAMES
        .iter()
        .flat_map(|k| [format!("start:{k}"), format!("complete:{k}")])
        .collect()
}
fn fixture(raw: Value) -> (Result<CodegenResourcesHandle, EngineError>, Vec<String>) {
    let mut events = Vec::new();
    let result = CodegenResourcesHandle::from_installed_fixture_with_stage_events(
        raw,
        &mut Context::ordinary(),
        &mut |e| events.push(stage(e)),
    );
    (result, events)
}
fn require_error(result: Result<CodegenResourcesHandle, EngineError>) -> EngineError {
    match result {
        Ok(_) => panic!("refusal must not publish handle"),
        Err(e) => e,
    }
}
fn exact(e: &EngineError, code: &str, path: &str, message: &str) {
    assert_eq!(e.code, code);
    assert_eq!(e.path, Utf16::from(path));
    assert_eq!(e.message, Utf16::from(message));
}

#[test]
fn fw01_real_fixed_factory_manifest_copy_and_original_inspection_golden() {
    let mut events = Vec::new();
    let mut ctx = Context::ordinary();
    let before = ctx.charged_work();
    let handle = CodegenResourcesHandle::from_installed_with_stage_events(&mut ctx, &mut |e| {
        events.push(stage(e))
    })
    .unwrap();
    assert!(matches!(
        handle.origin,
        CodegenResourceOrigin::InstalledCanonical
    ));
    let mut expected = admission_prefix();
    expected.extend([
        "compile:start".into(),
        "compile:complete".into(),
        "origin:attempt".into(),
    ]);
    assert_eq!(events, expected);
    assert!(ctx.charged_work() > before);
    let mut report = handle
        .resource_source_manifest_with_context(&mut ctx)
        .unwrap();
    let retained = report.clone();
    assert_eq!(
        text_field(&report, "profile").as_deref(),
        Some("umf.codegen.installed-source-manifest/1")
    );
    let Value::Array(rows) = field(&report, "resources").unwrap() else {
        panic!("actual manifest rows");
    };
    assert_eq!(rows.len(), 9);
    for (row, name) in rows.iter().zip(NAMES) {
        assert_eq!(text_field(row, "name").as_deref(), Some(name));
        let Value::Number(bytes) = field(row, "bytes").unwrap() else {
            panic!("native binary64 byte count");
        };
        assert!(
            bytes.is_finite()
                && *bytes > 0.0
                && bytes.fract() == 0.0
                && *bytes <= 9_007_199_254_740_991.0
        );
    }
    *at(&mut report, "resources") = Value::Array(Vec::new());
    assert_eq!(
        handle
            .resource_source_manifest_with_context(&mut ctx)
            .unwrap(),
        retained
    );
    let corpus = parse(include_str!(
        "../../../tests/rust-core/fixtures/access-inspection/cases.json"
    ));
    let Value::Array(cases) = field(&corpus, "cases").unwrap() else {
        panic!("real corpus");
    };
    assert_eq!(
        text_field(&cases[0], "id").as_deref(),
        Some("default-instant")
    );
    let request = object(vec![
        ("op", Value::string_utf8("codegen/inspectAccessViews")),
        ("request", field(&cases[0], "request").unwrap().clone()),
    ]);
    let output = handle
        .execute_request_with_context(request, &mut ctx)
        .unwrap();
    assert_eq!(
        decode(&output, &mut Context::ordinary()).unwrap(),
        object(vec![
            ("ok", Value::Bool(true)),
            ("result", field(&cases[0], "expected").unwrap().clone())
        ])
    );
}

#[test]
fn fw02_same_body_fixture_and_actual_explicit_handles_keep_ordinary_origin() {
    let (result, events) = fixture(bundle());
    let handle = result.unwrap();
    assert!(matches!(handle.origin, CodegenResourceOrigin::Ordinary));
    let mut expected = admission_prefix();
    expected.extend(["compile:start".into(), "compile:complete".into()]);
    assert_eq!(events, expected);
    let e = handle
        .resource_source_manifest_with_context(&mut Context::ordinary())
        .err()
        .unwrap();
    exact(
        &e,
        "REQUEST",
        "",
        "Installed canonical source manifest is unavailable on this handle",
    );
    let explicit =
        CodegenResourcesHandle::from_resources_with_context(bundle(), &mut Context::ordinary())
            .unwrap();
    assert!(matches!(explicit.origin, CodegenResourceOrigin::Ordinary));
    let e = explicit
        .resource_source_manifest_with_context(&mut Context::ordinary())
        .err()
        .unwrap();
    exact(
        &e,
        "REQUEST",
        "",
        "Installed canonical source manifest is unavailable on this handle",
    );
    // No hand-written origin assignment, new unchecked constructor or proof.
}

#[test]
fn fw03_full_admission_retains_native_bool_f64_bits_unknown_units_and_order() {
    let annotation = Value::Object(vec![
        (Utf16::from("flag"), Value::Bool(true)),
        (Utf16::from("one"), Value::Number(1.0)),
        (
            Utf16::from("fraction"),
            Value::Number(f64::from_bits(0x3ff4000000000000)),
        ),
        (
            Utf16::from("unknown"),
            Value::String(Utf16::new(vec![0xd800, 0xd83d, 0xde00])),
        ),
    ]);
    let mut raw = bundle();
    append(at(&mut raw, "coreSchema"), "default", annotation.clone());
    let (result, events) = fixture(raw);
    let handle = result.unwrap();
    assert_eq!(&events[..18], admission_prefix());
    assert!(!events.iter().any(|e| e == "origin:attempt"));
    let roots = handle
        .resources
        .engine()
        .schema_resources_with_context(&mut Context::catalog())
        .unwrap();
    let core = &roots
        .entries
        .iter()
        .find(|(id, _)| id == &Utf16::from("urn:umf:core:0.10.0"))
        .unwrap()
        .1;
    let actual = field(core, "default").unwrap();
    assert_eq!(actual, &annotation);
    assert!(matches!(field(actual, "flag"), Some(Value::Bool(true))));
    let Some(Value::Number(one)) = field(actual, "one") else {
        panic!("actual native number");
    };
    assert_eq!(one.to_bits(), 0x3ff0000000000000);
    let Some(Value::Number(fraction)) = field(actual, "fraction") else {
        panic!("actual native number");
    };
    assert_eq!(fraction.to_bits(), 0x3ff4000000000000);
    // Native Value fidelity is not JSON source-lexeme/category preservation.
}

#[test]
fn fw04_duplicate_precedes_hostile_child_and_bad_ninth_precedes_compilation() {
    let mut raw = bundle();
    append(
        at(&mut raw, "coreSchema"),
        "default",
        Value::Object(vec![
            (Utf16::from("x"), Value::Bool(true)),
            (
                Utf16::from("x"),
                Value::Number(f64::from_bits(0x7ff8000000000042)),
            ),
        ]),
    );
    append(
        at(&mut raw, "stableBindingPackage"),
        "factoryProbe",
        Value::Number(f64::from_bits(0x8000000000000000)),
    );
    let (r, events) = fixture(raw);
    exact(
        &require_error(r),
        "DUPLICATE_KEY",
        "#/default",
        "Duplicate object key",
    );
    assert_eq!(events, vec!["start:coreSchema"]);
    let mut raw = bundle();
    append(
        at(&mut raw, "coreSchema"),
        "factoryUnsupportedKeyword",
        Value::Bool(true),
    );
    append(
        at(&mut raw, "stableBindingPackage"),
        "factoryProbe",
        Value::Number(f64::from_bits(0x8000000000000000)),
    );
    let (r, events) = fixture(raw);
    exact(
        &require_error(r),
        "NUMBER",
        "#/factoryProbe",
        "Number outside the core interoperable numeric profile",
    );
    let expected = admission_prefix();
    assert_eq!(events, expected[..17].to_vec());
    assert!(!events
        .iter()
        .any(|e| e.starts_with("compile:") || e == "origin:attempt"));
}

#[test]
fn fw05_schema_meta_reference_and_actual_registry_refuse_after_all_nine_admissions() {
    for which in 0..4 {
        let mut raw = bundle();
        let (code, path, message) = match which {
            0 => {
                append(
                    at(&mut raw, "coreSchema"),
                    "factoryUnsupportedKeyword",
                    Value::Bool(true),
                );
                (
                    "SCHEMA_UNKNOWN_KEYWORD",
                    "urn:umf:core:0.10.0#",
                    "Unknown schema keyword 'factoryUnsupportedKeyword'",
                )
            }
            1 => {
                *at(at(&mut raw, "coreSchema"), "title") = Value::Number(1.25);
                ("SCHEMA_INVALID", "/title", "must be string")
            }
            2 => {
                // Check actual authored resource DATA contains no supplied or
                // embedded ID that could resolve this deliberately absent URI.
                fn absent(v: &Value) {
                    match v {
                        Value::Object(fields) => {
                            for (k, v) in fields {
                                if k == &Utf16::from("$id") {
                                    assert_ne!(
                                        v,
                                        &Value::string_utf8("urn:umf:factory-oracle:absent")
                                    );
                                }
                                absent(v);
                            }
                        }
                        Value::Array(a) => {
                            for v in a {
                                absent(v)
                            }
                        }
                        _ => {}
                    }
                }
                absent(&raw);
                append(
                    at(&mut raw, "coreSchema"),
                    "$ref",
                    Value::string_utf8("urn:umf:factory-oracle:absent"),
                );
                (
                    "SCHEMA_REF_UNRESOLVED",
                    "urn:umf:core:0.10.0#/$ref",
                    "Schema reference is not in the supplied resource set",
                )
            }
            _ => {
                for name in [
                    "tablesPackage",
                    "actionsPackage",
                    "bindingPackage",
                    "stableBindingPackage",
                ] {
                    assert!(field(at(&mut raw, name), "factoryRequiredMarker").is_none());
                }
                let Value::Array(required) = at(at(&mut raw, "packageSchema"), "required") else {
                    panic!("canonical package required");
                };
                required.push(Value::string_utf8("factoryRequiredMarker"));
                (
                    "PACKAGE_STRUCTURE",
                    "",
                    "must have required property 'factoryRequiredMarker'",
                )
            }
        };
        let (r, events) = fixture(raw);
        exact(&require_error(r), code, path, message);
        let mut expected = admission_prefix();
        expected.push("compile:start".into());
        assert_eq!(events, expected);
        // Registry row changes a valid package-schema requirement, NOT helper
        // preconditions such as missing scopes/id/schema or mismatched schema.
    }
}

fn host_error() -> EngineError {
    let mut e = EngineError::new(
        "FACTORY_HOST",
        Utf16::new(vec![35, 47, 0xd800]),
        "first factory refusal",
    );
    e.python_message_origin = Some(umf_core::python_value::PyText::from_utf8("factory-host-δ"));
    e
}
#[test]
fn fw06_selected_actual_stage_denials_preserve_first_host_error_without_handle() {
    // New counted route: refuse the first admission effect after authentic
    // all-nine materialization. No returned handle or later stage is permitted.
    let armed=Cell::new(false);let refused=Cell::new(false);let late=Cell::new(0usize);
    let mut control=|_|{if refused.get(){late.set(late.get()+1);return Err(host_error());}if armed.get(){refused.set(true);return Err(host_error());}Ok(())};
    let mut ctx=Context::ordinary().with_host_control(&mut control);
    let mut events=Vec::new();
    let e=require_error(CodegenResourcesHandle::from_installed_with_stage_events(&mut ctx,&mut |event|{
        if matches!(event,InstalledFactoryStage::AdmissionStart(_)){armed.set(true);}
        events.push(stage(event));
    }));
    assert_eq!(e.code,host_error().code);assert_eq!(e.path,host_error().path);
    assert_eq!(e.python_message_origin,host_error().python_message_origin);
    assert_eq!(events,vec!["start:coreSchema"]);assert_eq!(late.get(),0);

    for selected in ["admission", "compilation", "registration"] {
        let raw = bundle();
        let stage_ready = Cell::new(false);
        let root = Cell::new("");
        let denied = Cell::new(false);
        let late = Cell::new(0usize);
        let events = RefCell::new(Vec::new());
        let denied_events = Cell::new(0usize);
        let mut control = |_: usize| {
            if denied.get() {
                late.set(late.get() + 1);
                return Err(EngineError::new(
                    "SECOND",
                    Utf16::default(),
                    "must not replace first",
                ));
            }
            if stage_ready.get()
                || (selected == "registration" && root.get() == "registration-tables")
            {
                denied.set(true);
                denied_events.set(events.borrow().len());
                return Err(host_error());
            }
            Ok(())
        };
        let mut ctx = Context::ordinary()
            .with_host_control(&mut control)
            .with_constructor_root_observer(&root);
        let limits = ctx.limits();
        let mut observe = |e| {
            let s = stage(e);
            if (selected == "admission" && s == "start:coreSchema")
                || (selected == "compilation" && s == "compile:start")
            {
                stage_ready.set(true);
            }
            events.borrow_mut().push(s);
        };
        let e = require_error(
            CodegenResourcesHandle::from_installed_fixture_with_stage_events(
                raw,
                &mut ctx,
                &mut observe,
            ),
        );
        let original = host_error();
        assert_eq!(e.code, original.code);
        assert_eq!(e.path, original.path);
        assert_eq!(e.message, original.message);
        assert_eq!(e.python_message_origin, original.python_message_origin);
        assert!(e.is_control_failure());
        assert!(denied.get());
        assert_eq!(late.get(), 0);
        assert_eq!(events.borrow().len(), denied_events.get());
        assert_eq!(ctx.limits(), limits);
        assert!(ctx.charged_work() > 0);
    }
    // Origin prewrite charge is observed from ONE real completed fixed trace,
    // then only that callback is denied. No exhaustive full-factory matrix.
    let count = Cell::new(0usize);
    let target = Cell::new(None);
    let mut control = |_: usize| {
        count.set(count.get() + 1);
        Ok(())
    };
    let mut ctx = Context::ordinary().with_host_control(&mut control);
    let _complete = CodegenResourcesHandle::from_installed_with_stage_events(&mut ctx, &mut |e| {
        if matches!(e, InstalledFactoryStage::OriginPublicationAttempt) {
            target.set(Some(count.get()));
        }
    })
    .unwrap();
    let target = target.get().expect("actual paid origin prewrite callback");
    let calls = Cell::new(0usize);
    let mut control = |_: usize| {
        calls.set(calls.get() + 1);
        if calls.get() == target {
            Err(host_error())
        } else {
            Ok(())
        }
    };
    let mut ctx = Context::ordinary().with_host_control(&mut control);
    let mut events = Vec::new();
    let e = require_error(CodegenResourcesHandle::from_installed_with_stage_events(
        &mut ctx,
        &mut |e| events.push(stage(e)),
    ));
    let original = host_error();
    assert_eq!(e.code, original.code);
    assert_eq!(e.path, original.path);
    assert_eq!(e.message, original.message);
    assert_eq!(e.python_message_origin, original.python_message_origin);
    assert!(e.is_control_failure());
    assert_eq!(calls.get(), target);
    assert!(!events.iter().any(|e| e == "origin:attempt"));
}
