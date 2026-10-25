// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::{
    context::Context,
    engine::{Capabilities, Engine, ResourceSet, SemanticContext},
    registry::Registry,
    serialization::{read_json_value, write_json_value, Format},
    Diagnostic, EngineError, Utf16, Value,
};

const PACKET: &str = include_str!("../../../docs/helix/04-build/evidence/rust-migration/r5-core-relationships/frozen-typescript.json");

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
fn parse(text: &str) -> Value {
    read_json_value(
        &text.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        &mut Context::ordinary(),
    )
    .unwrap()
}
fn packet() -> Value {
    parse(PACKET)
}
fn get<'a>(value: &'a Value, key: &str) -> Option<&'a Value> {
    if let Value::Object(fields) = value {
        fields
            .iter()
            .find(|(name, _)| name == &Utf16::from(key))
            .map(|(_, value)| value)
    } else {
        None
    }
}
fn get_mut<'a>(value: &'a mut Value, key: &str) -> Option<&'a mut Value> {
    if let Value::Object(fields) = value {
        fields
            .iter_mut()
            .find(|(name, _)| name == &Utf16::from(key))
            .map(|(_, value)| value)
    } else {
        None
    }
}
fn set(value: &mut Value, key: &str, next: Value) {
    let Value::Object(fields) = value else {
        panic!("expected object")
    };
    let key = Utf16::from(key);
    if let Some((_, slot)) = fields.iter_mut().find(|(name, _)| name == &key) {
        *slot = next;
    } else {
        fields.push((key, next));
    }
}
fn obj(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(key, value)| (Utf16::from(key), value))
            .collect(),
    )
}
fn text(value: &str) -> Value {
    Value::string_utf8(value)
}
fn canonical_equal(a: &Value, b: &Value) -> bool {
    match (a, b) {
        (Value::Array(x), Value::Array(y)) => {
            x.len() == y.len() && x.iter().zip(y).all(|(x, y)| canonical_equal(x, y))
        }
        (Value::Object(x), Value::Object(y)) => {
            x.len() == y.len()
                && x.iter().all(|(key, value)| {
                    y.iter()
                        .find(|(other, _)| other == key)
                        .is_some_and(|(_, other)| canonical_equal(value, other))
                })
        }
        _ => a == b,
    }
}
fn resources() -> ResourceSet {
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
    )
}
fn engine() -> Engine {
    Engine::new(resources(), &mut Context::ordinary()).unwrap()
}
fn input<'a>(packet: &'a Value, name: &str) -> &'a Value {
    get(get(packet, "cases").unwrap(), name).unwrap()
}
fn expected<'a>(packet: &'a Value, name: &str) -> &'a Value {
    get(get(packet, "outcomes").unwrap(), name).unwrap()
}
fn failure(error: EngineError) -> Value {
    obj(vec![
        ("ok", Value::Bool(false)),
        (
            "error",
            obj(vec![
                ("code", text(&error.code)),
                (
                    "message",
                    text(&error.message.to_utf8().unwrap_or_default()),
                ),
                ("path", text(&error.path.to_utf8().unwrap_or_default())),
            ]),
        ),
    ])
}
fn verify_metered(
    receipt: &Value,
    current: &Value,
    stop_before: Option<usize>,
) -> (Result<Value, EngineError>, usize) {
    let engine = engine();
    let registry = Registry::new();
    let mut caps = NoCapabilities;
    let mut used = 0usize;
    let mut meter = |amount: usize| {
        used = used.saturating_add(amount);
        if stop_before.is_some_and(|limit| used > limit) {
            Err(EngineError::new(
                "RELATIONSHIP_VERIFY_METER_STOP",
                Utf16::default(),
                "verification work stopped",
            ))
        } else {
            Ok(())
        }
    };
    let mut ctx = Context::ordinary().with_meter(&mut meter);
    let result = umf_core::core_relationships::verify_core_relationship_operation(
        receipt, current, &engine, &registry, &mut caps, &mut ctx,
    );
    drop(ctx);
    (result, used)
}
fn compare_outcome(packet: &Value, name: &str, result: Result<Value, EngineError>) {
    let expected = expected(packet, name);
    match (
        get(expected, "ok")
            .and_then(|v| {
                if let Value::Bool(b) = v {
                    Some(*b)
                } else {
                    None
                }
            })
            .unwrap(),
        result,
    ) {
        (true, Ok(value)) => assert!(
            canonical_equal(get(expected, "value").unwrap(), &value),
            "success differs for {name}"
        ),
        (false, Err(error)) => {
            let actual = failure(error);
            assert!(
                canonical_equal(expected, &actual),
                "refusal differs for {name}: expected {expected:?}, actual {actual:?}"
            );
        }
        (true, Err(error)) => panic!("{name} unexpectedly refused: {error}"),
        (false, Ok(value)) => panic!("{name} unexpectedly succeeded: {value:?}"),
    }
}
fn run(
    packet: &Value,
    name: &str,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let case = input(packet, name);
    let source = get(case, "source").unwrap();
    let identity = get(case, "identity").unwrap();
    match name {
        "inspect_known"
        | "inspect_missing"
        | "inspect_unknown_meaning"
        | "invalid_identity_before_invalid_source"
        | "old_core_version_refused" => umf_core::core_relationships::inspect_core_relationships(
            source, identity, engine, registry, caps, ctx,
        ),
        "lookup_stable_id"
        | "lookup_unknown_meaning"
        | "lookup_absent_id"
        | "invalid_lookup_identity_before_invalid_source" => {
            umf_core::core_relationships::lookup_core_relationship(
                source, identity, engine, registry, caps, ctx,
            )
        }
        "author_new_relationship"
        | "aggregate_output_limit_refusal"
        | "presentation_edit_preserves_unknowns"
        | "unknown_meaning_edit_refused"
        | "stable_id_endpoint_change_refused"
        | "invalid_request_before_invalid_source"
        | "future_lifecycle_edit_refused" => {
            umf_core::core_relationships::declare_core_relationship(
                source,
                identity,
                get(case, "request").unwrap(),
                engine,
                registry,
                caps,
                ctx,
            )
        }
        "unknown_path_utf16_and_pointer_escape" => {
            let view = umf_core::core_relationships::lookup_core_relationship(
                source, identity, engine, registry, caps, ctx,
            )?;
            Ok(obj(vec![
                ("view", view),
                ("expectedPath", get(case, "expectedPath").unwrap().clone()),
            ]))
        }
        _ => panic!("unmapped predecessor case {name}"),
    }
}

#[test]
fn frozen_typescript_cases_match_core_relationship_operations() {
    let frozen = packet();
    let names = [
        "inspect_known",
        "inspect_missing",
        "lookup_stable_id",
        "inspect_unknown_meaning",
        "lookup_unknown_meaning",
        "author_new_relationship",
        "aggregate_output_limit_refusal",
        "presentation_edit_preserves_unknowns",
        "unknown_meaning_edit_refused",
        "stable_id_endpoint_change_refused",
        "lookup_absent_id",
        "invalid_identity_before_invalid_source",
        "invalid_lookup_identity_before_invalid_source",
        "invalid_request_before_invalid_source",
        "old_core_version_refused",
        "future_lifecycle_edit_refused",
        "unknown_path_utf16_and_pointer_escape",
    ];
    let engine = engine();
    let registry = Registry::new();
    for name in names {
        let mut caps = NoCapabilities;
        let result = run(
            &frozen,
            name,
            &engine,
            &registry,
            &mut caps,
            &mut Context::ordinary(),
        );
        compare_outcome(&frozen, name, result);
    }

    let case = input(&frozen, "aggregate_output_limit_refusal");
    let source = get(case, "source").unwrap().clone();
    let before = source.clone();
    let mut caps = NoCapabilities;
    let result = umf_core::core_relationships::declare_core_relationship(
        &source,
        get(case, "identity").unwrap(),
        get(case, "request").unwrap(),
        &engine,
        &registry,
        &mut caps,
        &mut Context::ordinary(),
    );
    compare_outcome(&frozen, "aggregate_output_limit_refusal", result);
    assert!(
        canonical_equal(&source, &before),
        "aggregate refusal mutated source"
    );
    assert!(canonical_equal(
        expected(&frozen, "aggregate_output_source_unchanged"),
        &obj(vec![("sourceUnchanged", Value::Bool(true))]),
    ));
}

#[test]
fn retained_receipts_round_trip_and_copy_without_mutating_source() {
    let frozen = packet();
    let case = input(&frozen, "author_new_relationship");
    let source = get(case, "source").unwrap().clone();
    let engine = engine();
    let registry = Registry::new();
    let mut caps = NoCapabilities;
    let receipt = umf_core::core_relationships::declare_core_relationship(
        &source,
        get(case, "identity").unwrap(),
        get(case, "request").unwrap(),
        &engine,
        &registry,
        &mut caps,
        &mut Context::ordinary(),
    )
    .unwrap();
    assert!(canonical_equal(&source, get(&receipt, "source").unwrap()));
    for name in ["verify_roundtrip_json", "verify_roundtrip_yaml"] {
        let mut caps = NoCapabilities;
        let format = if name.ends_with("json") {
            Format::Json
        } else {
            Format::Yaml
        };
        let serialized = write_json_value(&receipt, format, &mut Context::ordinary()).unwrap();
        let saved = read_json_value(serialized.units(), format, &mut Context::ordinary()).unwrap();
        let result = umf_core::core_relationships::verify_core_relationship_operation(
            &saved,
            get(&receipt, "target").unwrap(),
            &engine,
            &registry,
            &mut caps,
            &mut Context::ordinary(),
        )
        .unwrap();
        compare_outcome(&frozen, name, Ok(result.clone()));
        assert!(canonical_equal(&receipt, &result));
    }
    let mut mutated = receipt.clone();
    let mut target = get_mut(&mut mutated, "target").unwrap();
    let modules = match get_mut(&mut target, "modules").unwrap() {
        Value::Array(items) => items,
        _ => unreachable!(),
    };
    let relationships = match get_mut(&mut modules[0], "relationships").unwrap() {
        Value::Array(items) => items,
        _ => unreachable!(),
    };
    set(&mut relationships[0], "name", text("mutated output"));
    assert!(canonical_equal(&source, get(&receipt, "source").unwrap()));
}

#[test]
fn forged_receipt_and_structural_boundaries_match_predecessor() {
    let frozen = packet();
    let author = input(&frozen, "author_new_relationship");
    let engine = engine();
    let registry = Registry::new();
    let mut caps = NoCapabilities;
    let receipt = umf_core::core_relationships::declare_core_relationship(
        get(author, "source").unwrap(),
        get(author, "identity").unwrap(),
        get(author, "request").unwrap(),
        &engine,
        &registry,
        &mut caps,
        &mut Context::ordinary(),
    )
    .unwrap();
    let mut forged = receipt.clone();
    let provenance = get(&forged, "provenance").unwrap().clone();
    let mut changed = provenance;
    set(&mut changed, "idealPath", text("/wrong"));
    set(&mut forged, "provenance", changed);
    let mut caps = NoCapabilities;
    compare_outcome(
        &frozen,
        "verify_forged_receipt",
        umf_core::core_relationships::verify_core_relationship_operation(
            &forged,
            get(&receipt, "target").unwrap(),
            &engine,
            &registry,
            &mut caps,
            &mut Context::ordinary(),
        ),
    );

    let mut oversized = get(input(&frozen, "inspect_missing"), "source")
        .unwrap()
        .clone();
    set(
        &mut oversized,
        "unknownPayload",
        Value::Array((0..100_001).map(|x| Value::Number(x as f64)).collect()),
    );
    let mut caps = NoCapabilities;
    let actual = umf_core::core_relationships::inspect_core_relationships(
        &oversized,
        get(input(&frozen, "inspect_missing"), "identity").unwrap(),
        &engine,
        &registry,
        &mut caps,
        &mut Context::ordinary(),
    );
    compare_outcome(&frozen, "value_limit_refusal", actual);

    let mut deep = get(input(&frozen, "inspect_missing"), "source")
        .unwrap()
        .clone();
    let mut chain = Value::Null;
    for _ in 0..129 {
        chain = obj(vec![("n", chain)]);
    }
    set(&mut deep, "n", chain);
    let mut caps = NoCapabilities;
    let actual = umf_core::core_relationships::inspect_core_relationships(
        &deep,
        get(input(&frozen, "inspect_missing"), "identity").unwrap(),
        &engine,
        &registry,
        &mut caps,
        &mut Context::ordinary(),
    );
    compare_outcome(&frozen, "depth_limit_refusal", actual);
}

#[test]
fn receipt_recomputation_comparison_charges_host_meter() {
    let frozen = packet();
    let author = input(&frozen, "author_new_relationship");
    let engine = engine();
    let registry = Registry::new();
    let mut caps = NoCapabilities;
    let receipt = umf_core::core_relationships::declare_core_relationship(
        get(author, "source").unwrap(),
        get(author, "identity").unwrap(),
        get(author, "request").unwrap(),
        &engine,
        &registry,
        &mut caps,
        &mut Context::ordinary(),
    )
    .unwrap();
    let current = get(&receipt, "target").unwrap();
    let (accepted, work) = verify_metered(&receipt, current, None);
    assert!(accepted.is_ok());
    assert!(work > 0);
    let (stopped, _) = verify_metered(&receipt, current, Some(work.saturating_sub(1)));
    assert_eq!(stopped.unwrap_err().code, "RELATIONSHIP_VERIFY_METER_STOP");
}
