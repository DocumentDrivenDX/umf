// SPDX-License-Identifier: MIT OR Apache-2.0
use std::backtrace::Backtrace;
use umf_core::{
    dataset_values::{validate_core_dataset_values, CoreDatasetValueValidator},
    engine::{Capabilities, Engine, ResourceSet, SemanticContext},
    error::Diagnostic,
    registry::Registry,
    serialization::{read_json_value, write_json_value, Format},
    Context, Utf16, Value,
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
fn parse(text: &str) -> Value {
    read_json_value(
        &text.encode_utf16().collect::<Vec<_>>(),
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
fn text(v: &Value) -> &Utf16 {
    match v {
        Value::String(s) => s,
        _ => panic!("expected string"),
    }
}
fn set(v: &mut Value, name: &str, value: Value) {
    let Value::Object(m) = v else {
        panic!("expected object")
    };
    let (_, slot) = m
        .iter_mut()
        .find(|(k, _)| k == &Utf16::from(name))
        .expect("member exists");
    *slot = value;
}
fn canonical(a: &Value, b: &Value) -> bool {
    match (a, b) {
        (Value::Array(x), Value::Array(y)) => {
            x.len() == y.len() && x.iter().zip(y).all(|(a, b)| canonical(a, b))
        }
        (Value::Object(x), Value::Object(y)) => {
            x.len() == y.len()
                && x.iter().all(|(k, v)| {
                    y.iter()
                        .find(|(q, _)| q == k)
                        .is_some_and(|(_, w)| canonical(v, w))
                })
        }
        _ => a == b,
    }
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

#[test]
fn frozen_commerce_complete_envelope_matches_live_typescript() {
    let input_case=parse(include_str!("../../../docs/helix/04-build/evidence/rust-migration/r5-dataset-values/frozen-commerce.json"));
    let source = get(&input_case, "source").unwrap();
    let input = get(&input_case, "input").unwrap();
    let expected = get(get(&input_case, "outcome").unwrap(), "value").unwrap();
    let mut no_caps = NoCapabilities;
    let actual = validate_core_dataset_values(
        source,
        input,
        &engine(),
        &Registry::default(),
        &mut no_caps,
        &mut Context::ordinary(),
    )
    .unwrap();
    assert!(
        canonical(&actual, expected),
        "complete Rust dataset receipt differs from frozen TypeScript envelope"
    );
    if let Some(path) = std::env::var_os("UMF_R5_DATASET_VALUES_CAPTURE") {
        let rendered = write_json_value(&actual, Format::Json, &mut Context::ordinary())
            .unwrap()
            .to_utf8()
            .unwrap();
        std::fs::write(path, rendered).expect("write opted-in Rust receipt capture");
    }
}

#[test]
fn frozen_mutation_controls_match_complete_typescript_envelopes() {
    let e = engine();
    let validator = CoreDatasetValueValidator::new(&e, &mut Context::ordinary()).unwrap();
    let selected = std::env::var("UMF_R5_DATASET_VALUES_CASE").ok();
    for id in [
        "duplicate_locator_first_wins",
        "unknown_relationship_declaration",
        "surrogate_unknown_path",
        "duplicate_key_path",
        "unknown_key_residual",
        "unsupported_relationship_order",
        "invalid_target_key_updates_key_obligation",
        "unknown_target_key_updates_key_obligation",
    ] {
        if selected.as_deref().is_some_and(|selected| selected != id) {
            continue;
        }
        let packet = match id {
            "duplicate_locator_first_wins" => include_str!("../../../docs/helix/04-build/evidence/rust-migration/r5-dataset-values/frozen-duplicate_locator_first_wins.json"),
            "unknown_relationship_declaration" => include_str!("../../../docs/helix/04-build/evidence/rust-migration/r5-dataset-values/frozen-unknown_relationship_declaration.json"),
            "surrogate_unknown_path" => include_str!("../../../docs/helix/04-build/evidence/rust-migration/r5-dataset-values/frozen-surrogate_unknown_path.json"),
            "duplicate_key_path" => include_str!("../../../docs/helix/04-build/evidence/rust-migration/r5-dataset-values/frozen-duplicate_key_path.json"),
            "unknown_key_residual" => include_str!("../../../docs/helix/04-build/evidence/rust-migration/r5-dataset-values/frozen-unknown_key_residual.json"),
            "unsupported_relationship_order" => include_str!("../../../docs/helix/04-build/evidence/rust-migration/r5-dataset-values/frozen-unsupported_relationship_order.json"),
            "invalid_target_key_updates_key_obligation" => include_str!("../../../docs/helix/04-build/evidence/rust-migration/r5-dataset-values/frozen-invalid_target_key_updates_key_obligation.json"),
            _ => include_str!("../../../docs/helix/04-build/evidence/rust-migration/r5-dataset-values/frozen-unknown_target_key_updates_key_obligation.json"),
        };
        let frozen = parse(packet);
        let expected = get(get(&frozen, "outcome").unwrap(), "value").unwrap();
        let actual = validator
            .validate(
                get(&frozen, "source").unwrap(),
                get(&frozen, "input").unwrap(),
                &e,
                &Registry::default(),
                &mut NoCapabilities,
                &mut Context::ordinary(),
            )
            .unwrap();
        if !canonical(&actual, expected) {
            let actual = write_json_value(&actual, Format::Json, &mut Context::ordinary())
                .unwrap()
                .to_utf8()
                .unwrap();
            let expected = write_json_value(expected, Format::Json, &mut Context::ordinary())
                .unwrap()
                .to_utf8()
                .unwrap();
            std::fs::write(format!("/private/tmp/r5-{id}-rust.json"), actual).unwrap();
            std::fs::write(format!("/private/tmp/r5-{id}-typescript.json"), expected).unwrap();
            panic!("{id} differs from live TypeScript; wrote comparison artifacts");
        }
    }
}

#[test]
fn nested_key_limit_controls_escape_both_receipt_catches() {
    let frozen = parse(include_str!("../../../docs/helix/04-build/evidence/rust-migration/r5-dataset-values/frozen-nested_key_control.json"));
    let e = engine();
    let validator = CoreDatasetValueValidator::new(&e, &mut Context::ordinary()).unwrap();
    for key_call in [1usize, 2] {
        let mut source = get(&frozen, "source").unwrap().clone();
        set(&mut source, "title", Value::string_utf8(&"x".repeat(313)));
        let mut input = get(&frozen, "input").unwrap().clone();
        if let Value::Object(m) = &mut input {
            for (k, v) in m {
                if k == &Utf16::from("records") {
                    if let Value::Array(a) = v {
                        *a = vec![a[2].clone()];
                    }
                } else if k == &Utf16::from("relationships") {
                    if let Value::Array(a) = v {
                        *a = vec![a[0].clone()];
                    }
                }
            }
        }
        let mut matching_key_charges = 0usize;
        let mut meter = |amount: usize| {
            if amount == 313
                && Backtrace::force_capture()
                    .to_string()
                    .contains("core_key_tuple::encode_core_key_tuple")
            {
                matching_key_charges += 1;
                if matching_key_charges == key_call {
                    return Err(umf_core::error::EngineError::new(
                        "LIMIT",
                        Utf16::from("/nested-key-control"),
                        "injected nested key control limit",
                    ));
                }
            }
            Ok(())
        };
        let result = validator.validate(
            &source,
            &input,
            &e,
            &Registry::default(),
            &mut NoCapabilities,
            &mut Context::ordinary().with_meter(&mut meter),
        );
        let error = result.expect_err("nested Key control failure must escape the receipt");
        assert_eq!(error.code, "LIMIT");
        assert_eq!(error.path, Utf16::from("/nested-key-control"));
        assert!(error.is_control_failure());
        assert_eq!(matching_key_charges, key_call);
    }
}

#[test]
fn wrong_version_is_document_validated_before_source_refusal() {
    let frozen = parse(include_str!("../../../docs/helix/04-build/evidence/rust-migration/r5-dataset-values/frozen-wrong_version_document_validation_order.json"));
    let e = engine();
    let source = get(&frozen, "source").unwrap();
    let input = get(&frozen, "input").unwrap();
    let expected = get(get(&frozen, "outcome").unwrap(), "error").unwrap();

    let refusal = CoreDatasetValueValidator::new(&e, &mut Context::ordinary())
        .unwrap()
        .validate(
            source,
            input,
            &e,
            &Registry::default(),
            &mut NoCapabilities,
            &mut Context::ordinary(),
        )
        .unwrap_err();
    assert_eq!(
        refusal.code,
        text(get(expected, "code").unwrap()).to_utf8().unwrap()
    );
    assert_eq!(
        refusal.message.to_utf8().unwrap(),
        "Valid current core 0.10.0 source required"
    );

    let mut source_validation_charges = 0usize;
    let mut meter = |amount: usize| {
        let trace = Backtrace::force_capture().to_string();
        if amount > 0
            && (trace.contains("engine::Engine::validate_admitted_document")
                || trace.contains("engine::Engine::validate_document"))
        {
            source_validation_charges += 1;
        }
        Ok(())
    };
    let error = CoreDatasetValueValidator::new(&e, &mut Context::ordinary())
        .unwrap()
        .validate(
            source,
            input,
            &e,
            &Registry::default(),
            &mut NoCapabilities,
            &mut Context::ordinary().with_meter(&mut meter),
        )
        .unwrap_err();
    assert_eq!(error.code, "CORE_DATASET_SOURCE");
    assert!(
        source_validation_charges > 0,
        "invalid-version input skipped document validation"
    );
}

#[test]
fn frozen_full_dataset_verification_matches_typescript() {
    let e = engine();
    let validator = CoreDatasetValueValidator::new(&e, &mut Context::ordinary()).unwrap();
    for id in [
        "valid_commerce",
        "stale_source",
        "stale_input",
        "forged_result",
    ] {
        let packet = match id {
            "valid_commerce" => include_str!("../../../docs/helix/04-build/evidence/rust-migration/r5-dataset-values/frozen-verify-valid_commerce.json"),
            "stale_source" => include_str!("../../../docs/helix/04-build/evidence/rust-migration/r5-dataset-values/frozen-verify-stale_source.json"),
            "stale_input" => include_str!("../../../docs/helix/04-build/evidence/rust-migration/r5-dataset-values/frozen-verify-stale_input.json"),
            _ => include_str!("../../../docs/helix/04-build/evidence/rust-migration/r5-dataset-values/frozen-verify-forged_result.json"),
        };
        let frozen = parse(packet);
        let outcome = get(&frozen, "outcome").unwrap();
        let result = validator.verify(
            get(&frozen, "receipt").unwrap(),
            get(&frozen, "current").unwrap(),
            get(&frozen, "expectedInput").unwrap(),
            &e,
            &Registry::default(),
            &mut NoCapabilities,
            &mut Context::ordinary(),
        );
        if get(outcome, "ok") == Some(&Value::Bool(true)) {
            let expected = get(outcome, "value").unwrap();
            let actual = result.unwrap_or_else(|e| panic!("{id} unexpectedly refused: {e}"));
            assert!(
                canonical(&actual, expected),
                "{id} complete recomputation differs"
            );
        } else {
            let error = result.expect_err("frozen invalid verification unexpectedly accepted");
            let expected_error = get(outcome, "error").unwrap();
            assert_eq!(
                error.code,
                text(get(expected_error, "code").unwrap())
                    .to_utf8()
                    .unwrap(),
                "{id}"
            );
            assert_eq!(
                error.message.to_utf8().unwrap(),
                text(get(expected_error, "message").unwrap())
                    .to_utf8()
                    .unwrap(),
                "{id}"
            );
        }
    }
}

#[test]
fn frozen_schema_refusals_preserve_the_typescript_error_code() {
    let input_case=parse(include_str!("../../../docs/helix/04-build/evidence/rust-migration/r5-dataset-values/frozen-closed_scope.json"));
    let outcome = get(&input_case, "outcome").unwrap();
    let mut no_caps = NoCapabilities;
    let error = validate_core_dataset_values(
        get(&input_case, "source").unwrap(),
        get(&input_case, "input").unwrap(),
        &engine(),
        &Registry::default(),
        &mut no_caps,
        &mut Context::ordinary(),
    )
    .unwrap_err();
    assert_eq!(
        error.code,
        text(get(get(outcome, "error").unwrap(), "code").unwrap())
            .to_utf8()
            .unwrap()
    );
}

#[test]
fn frozen_closed_unknown_and_resource_refusals_match_code_and_message() {
    let e = engine();
    let validator = CoreDatasetValueValidator::new(&e, &mut Context::ordinary()).unwrap();
    for packet in [
  include_str!("../../../docs/helix/04-build/evidence/rust-migration/r5-dataset-values/frozen-closed_scope.json"),
  include_str!("../../../docs/helix/04-build/evidence/rust-migration/r5-dataset-values/frozen-unknown_input_member.json"),
  include_str!("../../../docs/helix/04-build/evidence/rust-migration/r5-dataset-values/frozen-oversized.json"),
  include_str!("../../../docs/helix/04-build/evidence/rust-migration/r5-dataset-values/frozen-unknown_source_value_count.json"),
 ] {
  let frozen=parse(packet);let expected=get(&frozen,"outcome").and_then(|v|get(v,"error")).unwrap();let mut no_caps=NoCapabilities;
        let error=validator.validate(get(&frozen,"source").unwrap(),get(&frozen,"input").unwrap(),&e,&Registry::default(),&mut no_caps,&mut Context::ordinary()).unwrap_err();
  assert_eq!(error.code,text(get(expected,"code").unwrap()).to_utf8().unwrap());
  assert_eq!(error.message,text(get(expected,"message").unwrap()).clone());
 }
}

#[test]
fn frozen_unknown_source_and_utf16_envelopes_match_without_losing_content() {
    let e = engine();
    let validator = CoreDatasetValueValidator::new(&e, &mut Context::ordinary()).unwrap();
    for packet in [
  include_str!("../../../docs/helix/04-build/evidence/rust-migration/r5-dataset-values/frozen-unknown_source_meaning.json"),
  include_str!("../../../docs/helix/04-build/evidence/rust-migration/r5-dataset-values/frozen-supplementary_and_surrogate.json"),
        include_str!("../../../docs/helix/04-build/evidence/rust-migration/r5-dataset-values/frozen-unsupported_lifecycle.json"),
 ] {
  let frozen=parse(packet);let expected=get(&frozen,"outcome").and_then(|v|get(v,"value")).unwrap();let mut no_caps=NoCapabilities;
        let actual=validator.validate(get(&frozen,"source").unwrap(),get(&frozen,"input").unwrap(),&e,&Registry::default(),&mut no_caps,&mut Context::ordinary()).unwrap();
  assert!(canonical(&actual,expected),"unknown or UTF-16 envelope changed");
 }
}

#[test]
fn frozen_duplicate_locator_returns_the_complete_invalid_receipt() {
    let frozen=parse(include_str!("../../../docs/helix/04-build/evidence/rust-migration/r5-dataset-values/frozen-duplicate_instance.json"));
    let expected = get(&frozen, "outcome")
        .and_then(|v| get(v, "value"))
        .unwrap();
    let mut no_caps = NoCapabilities;
    let actual = validate_core_dataset_values(
        get(&frozen, "source").unwrap(),
        get(&frozen, "input").unwrap(),
        &engine(),
        &Registry::default(),
        &mut no_caps,
        &mut Context::ordinary(),
    )
    .unwrap();
    assert!(
        canonical(&actual, expected),
        "duplicate-locator diagnostics or receipt order differ"
    );
}
