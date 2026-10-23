// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::{
    context::Context,
    engine::{Capabilities, Engine, ResourceSet, SemanticContext},
    error::Diagnostic,
    registry::Registry,
    serialization::{Format, read_json_value},
    value::{Utf16, Value},
};

struct NoCapabilities;
impl Capabilities for NoCapabilities {
    fn validate_extension(
        &mut self,
        _: u64,
        _: &Value,
        _: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        Ok(Vec::new())
    }
}
fn parse(s: &str) -> Value {
    read_json_value(
        &s.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        &mut Context::ordinary(),
    )
    .unwrap()
}
fn get<'a>(v: &'a Value, n: &str) -> Option<&'a Value> {
    match v {
        Value::Object(m) => m.iter().find(|(k, _)| k == &Utf16::from(n)).map(|(_, v)| v),
        _ => None,
    }
}
fn object(members: Vec<(&str, Value)>) -> Value {
    Value::Object(
        members
            .into_iter()
            .map(|(k, v)| (Utf16::from(k), v))
            .collect(),
    )
}
fn outcome(result: Result<Value, umf_core::error::EngineError>) -> Value {
    match result {
        Ok(value) => object(vec![("ok", Value::Bool(true)), ("value", value)]),
        Err(error) => object(vec![
            ("ok", Value::Bool(false)),
            (
                "error",
                object(vec![
                    ("code", Value::string_utf8(error.code)),
                    ("message", Value::String(error.message)),
                    ("path", Value::String(error.path)),
                ]),
            ),
        ]),
    }
}
fn element_mut<'a>(v: &'a mut Value, id: &str) -> &'a mut Vec<(Utf16, Value)> {
    let Value::Object(root) = v else {
        panic!("root")
    };
    let (_, Value::Array(modules)) = root
        .iter_mut()
        .find(|(k, _)| k == &Utf16::from("modules"))
        .unwrap()
    else {
        panic!("modules")
    };
    for module in modules {
        let Value::Object(fields) = module else {
            panic!("module")
        };
        if let Some((_, Value::Array(elements))) = fields
            .iter_mut()
            .find(|(k, _)| k == &Utf16::from("elements"))
        {
            for element in elements {
                let Value::Object(members) = element else {
                    panic!("element")
                };
                if members
                    .iter()
                    .any(|(k, v)| k == &Utf16::from("id") && v == &Value::string_utf8(id))
                {
                    return members;
                }
            }
        }
    }
    panic!("element identity")
}
fn set_element_field(v: &mut Value, id: &str, name: &str, value: Value) {
    let fields = element_mut(v, id);
    if let Some((_, old)) = fields.iter_mut().find(|(k, _)| k == &Utf16::from(name)) {
        *old = value
    } else {
        fields.push((Utf16::from(name), value))
    }
}
fn remove_element_field(v: &mut Value, id: &str, name: &str) {
    element_mut(v, id).retain(|(k, _)| k != &Utf16::from(name));
}
fn engine() -> Engine {
    Engine::new(
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
        &mut Context::ordinary(),
    )
    .unwrap()
}
fn fixtures() -> Value {
    parse(include_str!(
        "../../../scripts/rust-migration/r5/kind-nullability/frozen-typescript.json"
    ))
}
fn source() -> Value {
    parse(include_str!(
        "../../../scripts/rust-migration/r5/kind-nullability/input.json"
    ))
}
fn surrogate_source() -> Value {
    parse(include_str!(
        "../../../scripts/rust-migration/r5/kind-nullability/surrogate-input.json"
    ))
}
fn id(element: &str) -> umf_core::core_kind::Identity {
    umf_core::core_kind::Identity {
        module: "m".into(),
        element: element.into(),
    }
}
fn nul_id(element: &str) -> umf_core::nullability::Identity {
    umf_core::nullability::Identity {
        module: "m".into(),
        element: element.into(),
    }
}

#[test]
fn complete_envelopes_match_frozen_typescript_and_retain_opaque_content() {
    let f = fixtures();
    let s = source();
    let e = engine();
    let r = Registry::new();
    let mut c = NoCapabilities;
    let mut out = Vec::new();
    let inspect = umf_core::core_kind::inspect_core_kind(
        &s,
        &id("known"),
        &e,
        &r,
        &mut c,
        &mut Context::ordinary(),
    )
    .unwrap();
    assert_eq!(inspect, *get(&f, "kind_inspect_known").unwrap());
    out.push((Utf16::from("kind_inspect_known"), inspect));
    let inspect = umf_core::core_kind::inspect_core_kind(
        &s,
        &id("kindless"),
        &e,
        &r,
        &mut c,
        &mut Context::ordinary(),
    )
    .unwrap();
    assert_eq!(inspect, *get(&f, "kind_inspect_unspecified").unwrap());
    out.push((Utf16::from("kind_inspect_unspecified"), inspect));
    let declare = umf_core::core_kind::declare_core_kind(
        &s,
        &id("missing"),
        "field",
        &e,
        &r,
        &mut c,
        &mut Context::ordinary(),
    )
    .unwrap();
    assert_eq!(declare, *get(&f, "kind_declare").unwrap());
    let verified = umf_core::core_kind::verify_core_kind_declaration(
        &declare,
        get(&declare, "target").unwrap(),
        &e,
        &r,
        &mut c,
        &mut Context::ordinary(),
    )
    .unwrap();
    assert_eq!(verified, *get(&f, "kind_verify").unwrap());
    out.push((Utf16::from("kind_verify"), verified));
    out.push((Utf16::from("kind_declare"), declare));
    let inspect = umf_core::nullability::inspect_core_nullability(
        &s,
        &nul_id("missing"),
        &e,
        &r,
        &mut c,
        &mut Context::ordinary(),
    )
    .unwrap();
    assert_eq!(inspect, *get(&f, "nullability_inspect_missing").unwrap());
    out.push((Utf16::from("nullability_inspect_missing"), inspect));
    let inspect = umf_core::nullability::inspect_core_nullability(
        &s,
        &nul_id("known"),
        &e,
        &r,
        &mut c,
        &mut Context::ordinary(),
    )
    .unwrap();
    assert_eq!(inspect, *get(&f, "nullability_inspect_known").unwrap());
    out.push((Utf16::from("nullability_inspect_known"), inspect));
    let inspect = umf_core::nullability::inspect_core_nullability(
        &s,
        &nul_id("record"),
        &e,
        &r,
        &mut c,
        &mut Context::ordinary(),
    )
    .unwrap();
    assert_eq!(
        inspect,
        *get(&f, "nullability_inspect_inapplicable").unwrap()
    );
    out.push((Utf16::from("nullability_inspect_inapplicable"), inspect));
    let declare = umf_core::nullability::declare_core_nullability(
        &s,
        &nul_id("missing"),
        "absent-allowed",
        &e,
        &r,
        &mut c,
        &mut Context::ordinary(),
    )
    .unwrap();
    assert_eq!(declare, *get(&f, "nullability_declare").unwrap());
    let verified = umf_core::nullability::verify_core_nullability_declaration(
        &declare,
        get(&declare, "target").unwrap(),
        &e,
        &r,
        &mut c,
        &mut Context::ordinary(),
    )
    .unwrap();
    assert_eq!(verified, *get(&f, "nullability_verify").unwrap());
    out.push((Utf16::from("nullability_verify"), verified));
    out.push((Utf16::from("nullability_declare"), declare));
    let raw_id = Utf16::new(vec![0xd800]);
    let raw_identity = umf_core::core_kind::Identity {
        module: raw_id.clone(),
        element: raw_id.clone(),
    };
    let surrogate = surrogate_source();
    let inspect = umf_core::core_kind::inspect_core_kind(
        &surrogate,
        &raw_identity,
        &e,
        &r,
        &mut c,
        &mut Context::ordinary(),
    )
    .unwrap();
    assert_eq!(
        inspect,
        *get(&f, "kind_surrogate_identity_inspect").unwrap()
    );
    out.push((Utf16::from("kind_surrogate_identity_inspect"), inspect));
    let null_identity = umf_core::nullability::Identity {
        module: raw_id.clone(),
        element: raw_id,
    };
    let inspect = umf_core::nullability::inspect_core_nullability(
        &surrogate,
        &null_identity,
        &e,
        &r,
        &mut c,
        &mut Context::ordinary(),
    )
    .unwrap();
    assert_eq!(
        inspect,
        *get(&f, "nullability_surrogate_identity_inspect").unwrap()
    );
    out.push((
        Utf16::from("nullability_surrogate_identity_inspect"),
        inspect,
    ));
    if let Ok(path) = std::env::var("UMF_R5_CAPTURE") {
        let json = umf_core::serialization::write_json_value(
            &Value::Object(out),
            Format::Json,
            &mut Context::ordinary(),
        )
        .unwrap();
        let path = std::path::PathBuf::from(path);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, json.to_utf8().unwrap()).unwrap();
    }
}

#[test]
fn refusal_envelopes_match_frozen_typescript_diagnostics_and_receipts() {
    let f = parse(include_str!(
        "../../../scripts/rust-migration/r5/kind-nullability/frozen-refusals.json"
    ));
    let s = source();
    let e = engine();
    let r = Registry::new();
    let mut caps = NoCapabilities;
    let mut invalid = s.clone();
    set_element_field(&mut invalid, "known", "id", Value::string_utf8(""));
    let duplicate = match get(&invalid, "modules").unwrap() {
        Value::Array(a) => a[0].clone(),
        _ => panic!("modules"),
    };
    if let Value::Object(root) = &mut invalid {
        let (_, v) = root
            .iter_mut()
            .find(|(k, _)| k == &Utf16::from("modules"))
            .unwrap();
        let Value::Array(items) = v else { panic!() };
        items.push(duplicate);
    }
    let got = outcome(umf_core::core_kind::inspect_core_kind(
        &invalid,
        &id("known"),
        &e,
        &r,
        &mut caps,
        &mut Context::ordinary(),
    ));
    assert_eq!(got, *get(&f, "sourceInvalidKind").unwrap());
    let got = outcome(umf_core::nullability::inspect_core_nullability(
        &invalid,
        &nul_id("known"),
        &e,
        &r,
        &mut caps,
        &mut Context::ordinary(),
    ));
    assert_eq!(got, *get(&f, "sourceInvalidNullability").unwrap());
    let mut conflicting = s.clone();
    set_element_field(
        &mut conflicting,
        "known",
        "scalarType",
        Value::string_utf8("integer"),
    );
    let got = outcome(umf_core::core_kind::declare_core_kind(
        &conflicting,
        &id("known"),
        "record",
        &e,
        &r,
        &mut caps,
        &mut Context::ordinary(),
    ));
    assert_eq!(got, *get(&f, "kindConflict").unwrap());
    let kind = umf_core::core_kind::declare_core_kind(
        &s,
        &id("missing"),
        "field",
        &e,
        &r,
        &mut caps,
        &mut Context::ordinary(),
    )
    .unwrap();
    let mut malformed = kind.clone();
    if let Value::Object(m) = &mut malformed {
        m.retain(|(k, _)| k != &Utf16::from("identity"));
    }
    let got = outcome(umf_core::core_kind::verify_core_kind_declaration(
        &malformed,
        get(&kind, "target").unwrap(),
        &e,
        &r,
        &mut caps,
        &mut Context::ordinary(),
    ));
    assert_eq!(got, *get(&f, "malformedKindReceipt").unwrap());
    for (field, frozen) in [
        ("source", "invalidKindReceiptSource"),
        ("target", "invalidKindReceiptTarget"),
    ] {
        let mut malformed = kind.clone();
        if let Value::Object(fields) = &mut malformed {
            fields
                .iter_mut()
                .find(|(k, _)| k == &Utf16::from(field))
                .unwrap()
                .1 = object(Vec::new());
        }
        let got = outcome(umf_core::core_kind::verify_core_kind_declaration(
            &malformed,
            get(&kind, "target").unwrap(),
            &e,
            &r,
            &mut caps,
            &mut Context::ordinary(),
        ));
        assert_eq!(got, *get(&f, frozen).unwrap());
    }
    let null = umf_core::nullability::declare_core_nullability(
        &s,
        &nul_id("missing"),
        "required",
        &e,
        &r,
        &mut caps,
        &mut Context::ordinary(),
    )
    .unwrap();
    let mut malformed = null.clone();
    if let Value::Object(m) = &mut malformed {
        m.retain(|(k, _)| k != &Utf16::from("identity"));
    }
    let got = outcome(umf_core::nullability::verify_core_nullability_declaration(
        &malformed,
        get(&null, "target").unwrap(),
        &e,
        &r,
        &mut caps,
        &mut Context::ordinary(),
    ));
    assert_eq!(got, *get(&f, "malformedNullabilityReceipt").unwrap());
    for (field, frozen) in [
        ("source", "invalidNullabilityReceiptSource"),
        ("target", "invalidNullabilityReceiptTarget"),
    ] {
        let mut malformed = null.clone();
        if let Value::Object(fields) = &mut malformed {
            fields
                .iter_mut()
                .find(|(k, _)| k == &Utf16::from(field))
                .unwrap()
                .1 = object(Vec::new());
        }
        let got = outcome(umf_core::nullability::verify_core_nullability_declaration(
            &malformed,
            get(&null, "target").unwrap(),
            &e,
            &r,
            &mut caps,
            &mut Context::ordinary(),
        ));
        assert_eq!(got, *get(&f, frozen).unwrap());
    }
    let mut stale_kind = kind.clone();
    if let Value::Object(m) = &mut stale_kind {
        if let Some((_, Value::Object(t))) = m.iter_mut().find(|(k, _)| k == &Utf16::from("target"))
        {
            if let Some((_, id)) = t.iter_mut().find(|(k, _)| k == &Utf16::from("id")) {
                *id = Value::string_utf8("stale");
            }
        }
    }
    let got = outcome(umf_core::core_kind::verify_core_kind_declaration(
        &kind,
        get(&stale_kind, "target").unwrap(),
        &e,
        &r,
        &mut caps,
        &mut Context::ordinary(),
    ));
    assert_eq!(got, *get(&f, "staleKindReceipt").unwrap());
    let mut stale_null = null.clone();
    if let Value::Object(m) = &mut stale_null {
        if let Some((_, Value::Object(t))) = m.iter_mut().find(|(k, _)| k == &Utf16::from("target"))
        {
            if let Some((_, id)) = t.iter_mut().find(|(k, _)| k == &Utf16::from("id")) {
                *id = Value::string_utf8("stale");
            }
        }
    }
    let got = outcome(umf_core::nullability::verify_core_nullability_declaration(
        &null,
        get(&stale_null, "target").unwrap(),
        &e,
        &r,
        &mut caps,
        &mut Context::ordinary(),
    ));
    assert_eq!(got, *get(&f, "staleNullabilityReceipt").unwrap());
    let got = outcome(umf_core::nullability::declare_core_nullability(
        &s,
        &nul_id("record"),
        "required",
        &e,
        &r,
        &mut caps,
        &mut Context::ordinary(),
    ));
    assert_eq!(got, *get(&f, "nullabilityRole").unwrap());
    let got = outcome(umf_core::core_kind::inspect_core_kind(
        &s,
        &umf_core::core_kind::Identity {
            module: "absent".into(),
            element: "absent".into(),
        },
        &e,
        &r,
        &mut caps,
        &mut Context::ordinary(),
    ));
    assert_eq!(got, *get(&f, "missingIdentity").unwrap());
}

#[test]
fn receipt_replay_rejects_stale_forged_and_wrong_role_inputs() {
    let s = source();
    let e = engine();
    let r = Registry::new();
    let mut c = NoCapabilities;
    let kind = umf_core::core_kind::declare_core_kind(
        &s,
        &id("missing"),
        "field",
        &e,
        &r,
        &mut c,
        &mut Context::ordinary(),
    )
    .unwrap();
    assert!(
        umf_core::core_kind::verify_core_kind_declaration(
            &kind,
            get(&kind, "target").unwrap(),
            &e,
            &r,
            &mut c,
            &mut Context::ordinary()
        )
        .is_ok()
    );
    let null = umf_core::nullability::declare_core_nullability(
        &s,
        &nul_id("missing"),
        "required",
        &e,
        &r,
        &mut c,
        &mut Context::ordinary(),
    )
    .unwrap();
    assert!(
        umf_core::nullability::verify_core_nullability_declaration(
            &null,
            get(&null, "target").unwrap(),
            &e,
            &r,
            &mut c,
            &mut Context::ordinary()
        )
        .is_ok()
    );
    assert!(
        umf_core::nullability::declare_core_nullability(
            &s,
            &nul_id("record"),
            "required",
            &e,
            &r,
            &mut c,
            &mut Context::ordinary()
        )
        .is_err()
    );
    let mut stale = get(&null, "target").unwrap().clone();
    if let Value::Object(m) = &mut stale {
        m.push((Utf16::from("later"), Value::Bool(true)));
    }
    assert!(
        umf_core::nullability::verify_core_nullability_declaration(
            &null,
            &stale,
            &e,
            &r,
            &mut c,
            &mut Context::ordinary()
        )
        .is_err()
    );
}

#[test]
fn cancellation_and_bounded_copy_failure_propagate_without_partial_results() {
    let s = source();
    let e = engine();
    let r = Registry::new();
    let mut caps = NoCapabilities;
    let mut cancelled = || true;
    let mut ctx = Context::ordinary().with_cancellation(&mut cancelled);
    let error =
        umf_core::core_kind::inspect_core_kind(&s, &id("known"), &e, &r, &mut caps, &mut ctx)
            .unwrap_err();
    assert_eq!(error.code, "CANCELLED");

    let mut wide = s.clone();
    let Value::Object(root) = &mut wide else {
        panic!("object source")
    };
    root.push((
        Utf16::from("futureWide"),
        Value::Object(
            (0..512)
                .map(|n| (Utf16::from(format!("k{n}")), Value::Bool(true)))
                .collect(),
        ),
    ));
    let result = umf_core::core_kind::inspect_core_kind(
        &wide,
        &id("known"),
        &e,
        &r,
        &mut caps,
        &mut Context::ordinary(),
    )
    .unwrap();
    assert_eq!(get(&result, "source"), Some(&wide));

    let mut deep = s;
    let mut nested = Value::Bool(true);
    for _ in 0..40 {
        nested = Value::Object(vec![(Utf16::from("nested"), nested)]);
    }
    let Value::Object(root) = &mut deep else {
        panic!("object source")
    };
    root.push((Utf16::from("futureDeep"), nested));
    let limits = umf_core::context::Limits {
        max_depth: 20,
        ..umf_core::context::Limits::ordinary()
    };
    let mut limited =
        Context::with_limits(umf_core::context::ResourceProfile::Cooperative, limits).unwrap();
    let error = umf_core::core_kind::inspect_core_kind(
        &deep,
        &id("known"),
        &e,
        &r,
        &mut caps,
        &mut limited,
    )
    .unwrap_err();
    assert_eq!(error.code, "LIMIT");
}

#[test]
fn unknown_unpaired_utf16_labels_survive_inspection() {
    let s = source();
    let e = engine();
    let r = Registry::new();
    let mut caps = NoCapabilities;
    let raw = Value::String(Utf16::new(vec![0xd800]));
    let mut kind_source = s.clone();
    set_element_field(&mut kind_source, "known", "kind", raw.clone());
    remove_element_field(&mut kind_source, "known", "nullability");
    let kind = umf_core::core_kind::inspect_core_kind(
        &kind_source,
        &id("known"),
        &e,
        &r,
        &mut caps,
        &mut Context::ordinary(),
    )
    .unwrap();
    assert_eq!(
        get(get(&kind, "meaning").unwrap(), "state"),
        Some(&Value::string_utf8("unknown"))
    );
    assert_eq!(get(get(&kind, "meaning").unwrap(), "value"), Some(&raw));
    let mut null_source = s;
    set_element_field(&mut null_source, "known", "nullability", raw.clone());
    let null = umf_core::nullability::inspect_core_nullability(
        &null_source,
        &nul_id("known"),
        &e,
        &r,
        &mut caps,
        &mut Context::ordinary(),
    )
    .unwrap();
    assert_eq!(
        get(get(&null, "meaning").unwrap(), "state"),
        Some(&Value::string_utf8("unknown"))
    );
    assert_eq!(get(get(&null, "meaning").unwrap(), "value"), Some(&raw));
}

#[test]
fn canonical_sort_work_is_metered_before_long_prefix_comparison() {
    let mut s = source();
    let Value::Object(root) = &mut s else {
        panic!("root")
    };
    root.push((
        Utf16::from("futureLongKeys"),
        Value::Object(
            (0..128)
                .map(|i| {
                    (
                        Utf16::from(format!("{}-{i:03}", "p".repeat(2048))),
                        Value::Bool(true),
                    )
                })
                .collect(),
        ),
    ));
    let e = engine();
    let r = Registry::new();
    let mut caps = NoCapabilities;
    let receipt = umf_core::core_kind::declare_core_kind(
        &s,
        &id("missing"),
        "field",
        &e,
        &r,
        &mut caps,
        &mut Context::ordinary(),
    )
    .unwrap();
    let mut observed = 0usize;
    let mut meter = |amount: usize| {
        observed = observed.saturating_add(amount);
        if amount > 100_000 {
            Err(umf_core::error::EngineError::new(
                "LIMIT",
                Utf16::default(),
                "sort precharge",
            ))
        } else {
            Ok(())
        }
    };
    let mut ctx = Context::ordinary().with_meter(&mut meter);
    let error = umf_core::core_kind::verify_core_kind_declaration(
        &receipt,
        get(&receipt, "target").unwrap(),
        &e,
        &r,
        &mut caps,
        &mut ctx,
    )
    .unwrap_err();
    drop(ctx);
    assert_eq!(error.code, "LIMIT");
    assert!(observed > 100_000);
}
