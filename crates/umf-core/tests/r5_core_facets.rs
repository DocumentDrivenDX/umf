// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::{
    context::Context,
    engine::{Capabilities, Engine, ResourceSet, SemanticContext},
    error::Diagnostic,
    facets::{
        declare_core_facets, finish_core_facet_verification, historical_core_facet_patch,
        inspect_core_facets, prepare_core_facet_verification, verify_core_facet_declaration,
    },
    registry::Registry,
    serialization::{read_json_value, write_json_value, Format},
    Utf16, Value,
};
struct NoCapabilities;
impl Capabilities for NoCapabilities {
    fn validate_extension(
        &mut self,
        _: u64,
        _: &Value,
        _: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        Ok(vec![])
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
fn engine() -> Engine {
    let p = |s| parse(s);
    Engine::new(
        ResourceSet::new(
            p(include_str!("../../../spec/core/schema.json")),
            p(include_str!(
                "../../../spec/core/semantic-type-reference.schema.json"
            )),
            p(include_str!(
                "../../../spec/core/extension-package.schema.json"
            )),
            p(include_str!(
                "../../../spec/metamodel/generated/core-constraints.json"
            )),
            p(include_str!(
                "../../../spec/metamodel/generated/domain-policy.json"
            )),
        ),
        &mut Context::ordinary(),
    )
    .unwrap()
}
fn source() -> Value {
    parse(
        r#"{"umf":"0.10.0","id":"facets","vocabularies":{"future":{"version":"1.0.0"}},"extensions":{"future":{"opaque":"9007199254740993"}},"modules":[{"id":"m","namespace":"","elements":[{"id":"v","kind":"field","scalarType":"integer","extensions":{"future":{"unknown":[null,"keep"]}}}]}]}"#,
    )
}
fn identity() -> Value {
    parse(r#"{"module":"m","element":"v"}"#)
}
fn request() -> Value {
    parse(r#"{"integerWidth":{"bits":16,"signed":false}}"#)
}
fn get_mut<'a>(v: &'a mut Value, n: &str) -> Option<&'a mut Value> {
    if let Value::Object(m) = v {
        m.iter_mut()
            .find(|(k, _)| k == &Utf16::from(n))
            .map(|(_, v)| v)
    } else {
        None
    }
}
fn element_mut(v: &mut Value) -> &mut Value {
    let ms = match get_mut(v, "modules").unwrap() {
        Value::Array(ms) => ms,
        _ => panic!(),
    };
    let m = match &mut ms[0] {
        Value::Object(m) => m,
        _ => panic!(),
    };
    let elements = m
        .iter_mut()
        .find(|(k, _)| k == &Utf16::from("elements"))
        .unwrap();
    let es = match &mut elements.1 {
        Value::Array(es) => es,
        _ => panic!(),
    };
    &mut es[0]
}
fn set_member(v: &mut Value, n: &str, x: Value) {
    if let Value::Object(m) = v {
        if let Some((_, old)) = m.iter_mut().find(|(k, _)| k == &Utf16::from(n)) {
            *old = x
        } else {
            m.push((Utf16::from(n), x))
        }
    }
}
fn assert_error(actual: Result<Value, umf_core::error::EngineError>, expected: &Value) {
    let e = actual.unwrap_err();
    assert_eq!(
        Some(&Value::string_utf8(&e.code)),
        get(expected, "code"),
        "unexpected exact error: {:?}",
        e
    );
    assert_eq!(Some(&Value::String(e.message)), get(expected, "message"));
    assert_eq!(Some(&Value::String(e.path)), get(expected, "path"));
}
#[test]
fn inspect_declare_verify_and_json_yaml_roundtrip_preserve_unknowns() {
    let frozen=parse(include_str!("../../../docs/helix/04-build/evidence/rust-migration/r5-core-facets/frozen-typescript.json"));
    let e = engine();
    let mut caps = NoCapabilities;
    let reg = Registry::new();
    let src = get(&frozen, "source").unwrap();
    let identity = get(&frozen, "identity").unwrap();
    let request = get(&frozen, "request").unwrap();
    let receipt = declare_core_facets(
        src,
        identity,
        request,
        &e,
        &reg,
        &mut caps,
        &mut Context::ordinary(),
    )
    .unwrap();
    let unknown_facet_receipt = get(&frozen, "unknownFacetDeclaration").unwrap();
    let preserved_unknown = declare_core_facets(
        get(unknown_facet_receipt, "source").unwrap(),
        get(unknown_facet_receipt, "identity").unwrap(),
        get(unknown_facet_receipt, "request").unwrap(),
        &e,
        &reg,
        &mut caps,
        &mut Context::ordinary(),
    )
    .unwrap();
    assert_eq!(
        Some(&preserved_unknown),
        Some(unknown_facet_receipt),
        "full declaration envelope must retain unknown facet qualifiers and groups"
    );
    assert_eq!(
        Some(&receipt),
        get(&frozen, "receipt"),
        "complete declaration envelope differs from TypeScript"
    );
    let inspection = inspect_core_facets(
        &receipt_target(&receipt),
        identity,
        &e,
        &reg,
        &mut caps,
        &mut Context::ordinary(),
    )
    .unwrap();
    assert_eq!(
        Some(&inspection),
        get(&frozen, "inspection"),
        "complete inspection envelope differs from TypeScript"
    );
    assert!(format!("{receipt:?}").contains("9007199254740993"));
    assert_eq!(
        verify_core_facet_declaration(&receipt, src, &e, &reg, &mut caps, &mut Context::ordinary())
            .unwrap_err()
            .code,
        "CORE_FACET_STALE"
    );
    for f in [Format::Json, Format::Yaml] {
        let wire = write_json_value(&receipt, f, &mut Context::ordinary()).unwrap();
        let recovered = read_json_value(wire.units(), f, &mut Context::ordinary()).unwrap();
        let current = receipt_target(&recovered);
        assert_eq!(
            verify_core_facet_declaration(
                &recovered,
                &current,
                &e,
                &reg,
                &mut caps,
                &mut Context::ordinary()
            )
            .unwrap(),
            recovered
        );
    }
}

#[test]
fn direct_verify_reuses_receipt_admission_with_a_large_retained_value() {
    let e = engine();
    let mut caps = NoCapabilities;
    let reg = Registry::new();
    let mut src = source();
    if let Some(Value::Object(extensions)) = get_mut(&mut src, "extensions") {
        let (_, future) = extensions
            .iter_mut()
            .find(|(key, _)| key == &Utf16::from("future"))
            .unwrap();
        set_member(future, "opaque", Value::String(Utf16::from("x".repeat(100_000))));
    }
    let identity = identity();
    let request = request();
    let receipt = declare_core_facets(
        &src,
        &identity,
        &request,
        &e,
        &reg,
        &mut caps,
        &mut Context::ordinary(),
    )
    .unwrap();
    let current = receipt_target(&receipt);

    let mut staged_work = 0usize;
    let mut staged_meter = |amount: usize| {
        staged_work = staged_work.saturating_add(amount);
        Ok(())
    };
    let mut staged_context = Context::ordinary().with_meter(&mut staged_meter);
    let prepared = prepare_core_facet_verification(
        &receipt,
        &e,
        &reg,
        &mut caps,
        &mut staged_context,
    )
    .unwrap();
    finish_core_facet_verification(
        &prepared,
        &current,
        &e,
        &reg,
        &mut caps,
        &mut staged_context,
    )
    .unwrap();
    drop(staged_context);
    drop(staged_meter);
    assert!(staged_work > 200_000, "staged path must meter both admissions");

    let mut direct_work = 0usize;
    let mut direct_meter = |amount: usize| {
        direct_work = direct_work.saturating_add(amount);
        Ok(())
    };
    verify_core_facet_declaration(
        &receipt,
        &current,
        &e,
        &reg,
        &mut caps,
        &mut Context::ordinary().with_meter(&mut direct_meter),
    )
    .unwrap();
    drop(direct_meter);
    assert!(
        direct_work + 100_000 < staged_work,
        "direct verify must avoid the staged finish's second receipt preparation"
    );
}
#[test]
fn unknown_nested_qualifier_is_reported_and_blocks_overwrite_in_source_order() {
    let e = engine();
    let mut caps = NoCapabilities;
    let reg = Registry::new();
    let mut src = source();
    set_member(
        element_mut(&mut src),
        "facets",
        parse(r#"{"integerWidth":{"bits":8,"signed":true,"future":"opaque"}}"#),
    );
    let inspected = inspect_core_facets(
        &src,
        &identity(),
        &e,
        &reg,
        &mut caps,
        &mut Context::ordinary(),
    )
    .unwrap();
    let meaning = get(&inspected, "meaning").unwrap();
    assert_eq!(get(meaning, "state"), Some(&Value::string_utf8("partial")));
    assert!(format!("{meaning:?}").contains("integerWidth/future"));
    set_member(
        element_mut(&mut src),
        "scalarType",
        Value::string_utf8("string"),
    );
    set_member(
        element_mut(&mut src),
        "facets",
        parse(r#"{"length":{"max":8,"unit":"future-unit"}}"#),
    );
    let length_request = parse(r#"{"length":{"max":4,"unit":"unicode-scalar"}}"#);
    let err = declare_core_facets(
        &src,
        &identity(),
        &length_request,
        &e,
        &reg,
        &mut caps,
        &mut Context::ordinary(),
    )
    .unwrap_err();
    assert_eq!(err.code, "CORE_FACET_UNKNOWN");
    assert_eq!(
        err.path,
        Utf16::from("/modules/0/elements/0/facets/length/unit")
    );
    let mut invalid = src.clone();
    if let Value::Object(fields) = &mut invalid {
        fields
            .iter_mut()
            .find(|(k, _)| k == &Utf16::from("umf"))
            .unwrap()
            .1
            .clone_from(&Value::string_utf8("0.9.0"));
    }
    let err = declare_core_facets(
        &invalid,
        &identity(),
        &length_request,
        &e,
        &reg,
        &mut caps,
        &mut Context::ordinary(),
    )
    .unwrap_err();
    assert_eq!(err.code, "CORE_FACET_SOURCE");
}

#[test]
fn range_collection_size_and_historical_projection_match_predecessor() {
    let frozen = parse(include_str!(
        "../../../docs/helix/04-build/evidence/rust-migration/r5-core-facets/meaning-cases.json"
    ));
    let source = get(&frozen, "source").unwrap();
    let expected = get(&frozen, "inspections").unwrap();
    let e = engine();
    let reg = Registry::new();
    let mut caps = NoCapabilities;
    for (index, element) in ["v", "a"].iter().enumerate() {
        let identity = parse(&format!(r#"{{"module":"m","element":"{element}"}}"#));
        let actual = inspect_core_facets(
            source,
            &identity,
            &e,
            &reg,
            &mut caps,
            &mut Context::ordinary(),
        )
        .unwrap();
        let Value::Array(expected) = expected else {
            panic!("frozen inspections must be an array")
        };
        assert_eq!(
            expected.get(index),
            Some(&actual),
            "full inspection envelope differs for {element}"
        );
    }
    let patch = historical_core_facet_patch(
        &parse(r#"{"length":{"max":8,"unit":"byte"},"precision":10,"scale":2,"integerWidth":{"bits":16,"signed":false}}"#),
        &e,
        &mut Context::ordinary(),
    ).unwrap();
    assert_eq!(
        patch,
        parse(
            r#"{"length":{"max":8,"unit":"byte"},"integerWidth":{"bits":16,"signed":false},"precision":10,"scale":2}"#
        )
    );
    for newer in [
        r#"{"collectionSize":{"min":1}}"#,
        r#"{"range":{"min":{"integerToken":"1"}}}"#,
        r#"{"length":{"min":1,"max":8,"unit":"byte"}}"#,
    ] {
        assert_eq!(
            historical_core_facet_patch(&parse(newer), &e, &mut Context::ordinary())
                .unwrap_err()
                .code,
            "CORE_FACET_PROJECTION_VERSION"
        );
    }
    for malformed in [
        r#"{"length":{"max":8,"min":1,"unit":"byte","future":true}}"#,
        r#"{"collectionSize":null}"#,
        r#"{"range":{"min":{"integerToken":"1"},"future":true}}"#,
    ] {
        assert_eq!(
            historical_core_facet_patch(&parse(malformed), &e, &mut Context::ordinary())
                .unwrap_err()
                .code,
            "CORE_FACET_PROJECTION_INPUT",
            "malformed predecessor input must be rejected before projection-version refusal"
        );
    }
    assert_eq!(
        historical_core_facet_patch(
            &Value::Object(vec![(
                Utf16::from("integerWidth"),
                Value::Object(vec![
                    (Utf16::from("bits"), Value::Number(9_007_199_254_740_992.0)),
                    (Utf16::from("signed"), Value::Bool(true)),
                ]),
            )]),
            &e,
            &mut Context::ordinary()
        )
        .unwrap_err()
        .code,
        "NUMBER",
        "copyJson numeric-profile refusal precedes bounds validation"
    );
}

#[test]
fn review_regressions_match_complete_frozen_typescript_outcomes() {
    let frozen = parse(include_str!(
        "../../../docs/helix/04-build/evidence/rust-migration/r5-core-facets/regression-cases.json"
    ));
    let cases = get(&frozen, "cases").unwrap();
    let e = engine();
    let reg = Registry::new();
    let mut caps = NoCapabilities;

    let merge = get(cases, "lengthMerge").unwrap();
    assert_eq!(
        declare_core_facets(
            get(merge, "source").unwrap(),
            get(merge, "identity").unwrap(),
            get(merge, "request").unwrap(),
            &e,
            &reg,
            &mut caps,
            &mut Context::ordinary(),
        )
        .unwrap(),
        *get(merge, "outcome").unwrap(),
        "full declaration envelope must retain old length minimum and unknown qualifier"
    );

    let surrogate = get(cases, "loneSurrogateQualifier").unwrap();
    assert_eq!(
        inspect_core_facets(
            get(surrogate, "source").unwrap(),
            get(surrogate, "identity").unwrap(),
            &e,
            &reg,
            &mut caps,
            &mut Context::ordinary(),
        )
        .unwrap(),
        *get(surrogate, "outcome").unwrap(),
        "unknown pointer must preserve lone UTF-16 surrogate"
    );

    let Value::Array(historical) = get(cases, "historical").unwrap() else {
        panic!("historical frozen cases must be an array");
    };
    for case in historical {
        let outcome = get(case, "outcome").unwrap();
        if let Some(expected) = get(outcome, "error") {
            assert_error(
                historical_core_facet_patch(
                    get(case, "input").unwrap(),
                    &e,
                    &mut Context::ordinary(),
                ),
                expected,
            );
        } else {
            panic!("these frozen cases are expected to refuse");
        }
    }
    let unsafe_copy = get(cases, "unsafeIntegerCopyRefusal").unwrap();
    let unsafe_input = Value::Object(vec![(
        Utf16::from("integerWidth"),
        Value::Object(vec![
            (Utf16::from("bits"), Value::Number(9_007_199_254_740_992.0)),
            (Utf16::from("signed"), Value::Bool(true)),
        ]),
    )]);
    assert_error(
        historical_core_facet_patch(&unsafe_input, &e, &mut Context::ordinary()),
        get(get(unsafe_copy, "outcome").unwrap(), "error").unwrap(),
    );
    for case_name in [
        "verifyMalformedBeforeCurrentCopy",
        "verifyForgedBeforeCurrentCopy",
    ] {
        let case = get(cases, case_name).unwrap();
        let current = Value::Number(9_007_199_254_740_992.0);
        assert_error(
            verify_core_facet_declaration(
                get(case, "receipt").unwrap(),
                &current,
                &e,
                &reg,
                &mut caps,
                &mut Context::ordinary(),
            ),
            get(get(case, "outcome").unwrap(), "error").unwrap(),
        );
    }
}

#[test]
fn inspection_propagates_cooperative_meter_refusal() {
    let e = engine();
    let reg = Registry::new();
    let mut caps = NoCapabilities;
    let mut meter = |_units: usize| {
        Err(umf_core::error::EngineError::new(
            "HOST_LIMIT",
            Utf16::default(),
            "test meter refusal",
        ))
    };
    let mut ctx = Context::ordinary().with_meter(&mut meter);
    let error =
        inspect_core_facets(&source(), &identity(), &e, &reg, &mut caps, &mut ctx).unwrap_err();
    assert_eq!(error.code, "HOST_LIMIT");
}
fn get<'a>(v: &'a Value, n: &str) -> Option<&'a Value> {
    if let Value::Object(m) = v {
        m.iter().find(|(k, _)| k == &Utf16::from(n)).map(|(_, v)| v)
    } else {
        None
    }
}
fn receipt_target(v: &Value) -> Value {
    get(v, "target").unwrap().clone()
}
#[test]
fn exact_frozen_refusal_triples_and_precedence_match_typescript() {
    let frozen = parse(include_str!(
        "../../../docs/helix/04-build/evidence/rust-migration/r5-core-facets/exact-errors.json"
    ));
    let cases = get(&frozen, "cases").unwrap();
    let e = engine();
    let reg = Registry::new();
    let mut caps = NoCapabilities;
    assert_error(
        declare_core_facets(
            &source(),
            &identity(),
            &parse(r#"{"precision":4}"#),
            &e,
            &reg,
            &mut caps,
            &mut Context::ordinary(),
        ),
        get(cases, "invalidRequest").unwrap(),
    );
    assert_error(
        verify_core_facet_declaration(
            &parse(r#"{"operation":"declare-core-facets","version":"3.0.0"}"#),
            &source(),
            &e,
            &reg,
            &mut caps,
            &mut Context::ordinary(),
        ),
        get(cases, "malformedReceipt").unwrap(),
    );
    assert_error(
        inspect_core_facets(
            &source(),
            &parse(r#"{"module":"","element":"v"}"#),
            &e,
            &reg,
            &mut caps,
            &mut Context::ordinary(),
        ),
        get(cases, "invalidIdentity").unwrap(),
    );
    let mut invalid = source();
    get_mut(&mut invalid, "umf").map(|v| *v = Value::string_utf8("0.1.0"));
    assert_error(
        inspect_core_facets(
            &invalid,
            &identity(),
            &e,
            &reg,
            &mut caps,
            &mut Context::ordinary(),
        ),
        get(cases, "invalidSource").unwrap(),
    );
    let mut role = source();
    set_member(element_mut(&mut role), "kind", Value::string_utf8("record"));
    assert_error(
        declare_core_facets(
            &role,
            &identity(),
            &request(),
            &e,
            &reg,
            &mut caps,
            &mut Context::ordinary(),
        ),
        get(cases, "recordRoleSourceRefusal").unwrap(),
    );
    let mut unknown = source();
    set_member(
        element_mut(&mut unknown),
        "scalarType",
        Value::string_utf8("string"),
    );
    set_member(
        element_mut(&mut unknown),
        "facets",
        parse(r#"{"length":{"max":8,"unit":"future-unit"}}"#),
    );
    let length = parse(r#"{"length":{"max":4,"unit":"unicode-scalar"}}"#);
    assert_error(
        declare_core_facets(
            &unknown,
            &identity(),
            &length,
            &e,
            &reg,
            &mut caps,
            &mut Context::ordinary(),
        ),
        get(cases, "unknownUnit").unwrap(),
    );
    let mut invalid_unknown = source();
    set_member(
        element_mut(&mut invalid_unknown),
        "scalarType",
        Value::string_utf8("string"),
    );
    set_member(
        element_mut(&mut invalid_unknown),
        "facets",
        parse(r#"{"length":{"max":-1,"unit":"future-unit"}}"#),
    );
    assert_error(
        inspect_core_facets(
            &invalid_unknown,
            &identity(),
            &e,
            &reg,
            &mut caps,
            &mut Context::ordinary(),
        ),
        get(cases, "unknownUnitWithInvalidBound").unwrap(),
    );
    let conflict = parse(r#"{"length":{"max":3,"unit":"byte"}}"#);
    assert_error(
        declare_core_facets(
            &source(),
            &identity(),
            &conflict,
            &e,
            &reg,
            &mut caps,
            &mut Context::ordinary(),
        ),
        get(cases, "targetConflict").unwrap(),
    );
    let receipt = declare_core_facets(
        &source(),
        &identity(),
        &request(),
        &e,
        &reg,
        &mut caps,
        &mut Context::ordinary(),
    )
    .unwrap();
    let mut stale = receipt_target(&receipt);
    get_mut(&mut stale, "id").map(|v| *v = Value::string_utf8("changed"));
    assert_error(
        verify_core_facet_declaration(
            &receipt,
            &stale,
            &e,
            &reg,
            &mut caps,
            &mut Context::ordinary(),
        ),
        get(cases, "stale").unwrap(),
    );
    let mut forged = receipt.clone();
    let req = get_mut(&mut forged, "request").unwrap();
    let iw = get_mut(req, "integerWidth").unwrap();
    get_mut(iw, "bits").map(|v| *v = Value::Number(8.0));
    assert_error(
        verify_core_facet_declaration(
            &forged,
            &receipt_target(&receipt),
            &e,
            &reg,
            &mut caps,
            &mut Context::ordinary(),
        ),
        get(cases, "forged").unwrap(),
    );
}
