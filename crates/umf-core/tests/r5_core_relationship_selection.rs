// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::{
    context::Context,
    engine::{Capabilities, Engine, ResourceSet, SemanticContext},
    registry::Registry,
    serialization::{read_json_value, Format},
    Diagnostic, EngineError, Utf16, Value,
};

const PACKET: &str = include_str!("../../../tests/rust-core/fixtures/r5-core-relationship-selection/frozen-typescript.json");
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
fn parse_with(ctx: &mut Context<'_>, text: &str) -> Value {
    read_json_value(&text.encode_utf16().collect::<Vec<_>>(), Format::Json, ctx).unwrap()
}
fn packet() -> Value {
    parse_with(&mut Context::catalog(), PACKET)
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
fn canonical_equal(a: &Value, b: &Value) -> bool {
    match (a, b) {
        (Value::Array(x), Value::Array(y)) => {
            x.len() == y.len() && x.iter().zip(y).all(|(a, b)| canonical_equal(a, b))
        }
        (Value::Object(x), Value::Object(y)) => {
            x.len() == y.len()
                && x.iter().all(|(k, v)| {
                    y.iter()
                        .find(|(other, _)| other == k)
                        .is_some_and(|(_, w)| canonical_equal(v, w))
                })
        }
        _ => a == b,
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
fn resources() -> ResourceSet {
    let parse = |text: &str| parse_with(&mut Context::ordinary(), text);
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
fn case<'a>(packet: &'a Value, name: &str) -> &'a Value {
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
fn compare(packet: &Value, name: &str, result: Result<Value, EngineError>) {
    let expected = expected(packet, name);
    let is_ok = matches!(get(expected, "ok"), Some(Value::Bool(true)));
    match (is_ok, result) {
        (true, Ok(actual)) => assert!(
            canonical_equal(get(expected, "value").unwrap(), &actual),
            "selection output differs: {name}"
        ),
        (false, Err(error)) => {
            let actual = failure(error);
            assert!(
                canonical_equal(expected, &actual),
                "refusal differs: {name}, expected {expected:?}, actual {actual:?}"
            );
        }
        (true, Err(error)) => panic!("{name} unexpectedly refused: {error}"),
        (false, Ok(actual)) => panic!("{name} unexpectedly succeeded: {actual:?}"),
    }
}
fn run(
    packet: &Value,
    name: &str,
    engine: &Engine,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let input = case(packet, name);
    umf_core::core_relationship_selection::select_core_relationships(
        get(input, "source").unwrap(),
        get(input, "query").unwrap(),
        engine,
        &Registry::new(),
        &mut NoCapabilities,
        ctx,
    )
}

#[test]
fn frozen_predecessor_cases_match_selection_and_refusal_order() {
    let packet = packet();
    let engine = engine();
    for name in [
        "all_paths_and_navigation",
        "filters_intersection",
        "empty_filters",
        "source_filter_or_match",
        "target_key_filter_ignores_key",
        "unknown_qualifier_paths",
        "unknown_record_key_fields_first",
        "unknown_record_key_fields_last",
        "undirected_reverse_navigation",
        "inverse_navigation",
        "no_relationships",
        "utf16_identity",
        "malformed_query",
        "malformed_query_before_invalid_source",
        "legacy_source_refusal",
        "aggregate_output_limit",
    ] {
        compare(
            &packet,
            name,
            run(&packet, name, &engine, &mut Context::ordinary()),
        );
    }
}

#[test]
fn selected_source_is_copied_and_all_paths_resolve_from_frozen_output() {
    let packet = packet();
    let input = case(&packet, "all_paths_and_navigation");
    let source = get(input, "source").unwrap().clone();
    let engine = engine();
    let output = umf_core::core_relationship_selection::select_core_relationships(
        &source,
        get(input, "query").unwrap(),
        &engine,
        &Registry::new(),
        &mut NoCapabilities,
        &mut Context::ordinary(),
    )
    .unwrap();
    assert!(canonical_equal(&source, get(&output, "source").unwrap()));
    assert!(canonical_equal(
        expected(&packet, "path_resolution"),
        &obj(vec![
            ("relationshipPath", text("/modules/0/relationships/0")),
            ("sourceRecordPath", text("/modules/0/elements/0")),
            ("targetRecordPath", text("/modules/0/elements/2")),
            ("keyPath", text("/modules/0/elements/2/keys/1")),
            ("associationRecordPath", text("/modules/0/elements/14")),
        ])
    ));
    assert!(canonical_equal(
        expected(&packet, "all_paths_and_navigation_source_unchanged"),
        &obj(vec![("sourceUnchanged", Value::Bool(true))])
    ));
}

#[test]
fn copy_and_query_work_are_charged_to_host_control() {
    let packet = packet();
    let input = case(&packet, "all_paths_and_navigation");
    let engine = engine();
    let mut used = 0usize;
    let mut meter = |amount: usize| {
        used = used.saturating_add(amount);
        if used > 3 {
            Err(EngineError::new(
                "SELECTION_HOST_STOP",
                Utf16::default(),
                "host stopped selection",
            ))
        } else {
            Ok(())
        }
    };
    let result = umf_core::core_relationship_selection::select_core_relationships(
        get(input, "source").unwrap(),
        get(input, "query").unwrap(),
        &engine,
        &Registry::new(),
        &mut NoCapabilities,
        &mut Context::ordinary().with_meter(&mut meter),
    );
    let error = result.unwrap_err();
    assert_eq!(error.code, "SELECTION_HOST_STOP");
}

#[test]
fn cancellation_stops_initial_copy_and_frozen_getter_control_is_exact() {
    let packet = packet();
    let input = case(&packet, "all_paths_and_navigation");
    let engine = engine();
    let mut cancelled = || true;
    let result = umf_core::core_relationship_selection::select_core_relationships(
        get(input, "source").unwrap(),
        get(input, "query").unwrap(),
        &engine,
        &Registry::new(),
        &mut NoCapabilities,
        &mut Context::ordinary().with_cancellation(&mut cancelled),
    );
    assert_eq!(result.unwrap_err().code, "CANCELLED");
    let getter = expected(&packet, "getter_query_refusal_before_invocation");
    assert_eq!(
        get(get(getter, "error").unwrap(), "code"),
        Some(&text("NON_JSON"))
    );
    assert_eq!(
        get(
            expected(&packet, "getter_query_refusal_before_invocation_calls"),
            "calls"
        ),
        Some(&Value::Number(0.0))
    );
}

fn module_order_query(match_last: bool) -> Value {
    let mut values = (0..2_000).map(|_| text("other")).collect::<Vec<_>>();
    if match_last {
        values.push(text("m"));
    } else {
        values.insert(0, text("m"));
    }
    obj(vec![("modules", Value::Array(values))])
}

fn selection_work(
    source: &Value,
    query: &Value,
    engine: &Engine,
) -> (Result<Value, EngineError>, u64) {
    let mut ctx = Context::ordinary();
    let result = umf_core::core_relationship_selection::select_core_relationships(
        source,
        query,
        engine,
        &Registry::new(),
        &mut NoCapabilities,
        &mut ctx,
    );
    (result, ctx.charged_work())
}

#[test]
fn filter_scan_work_tracks_match_position_and_can_be_stopped() {
    let packet = packet();
    let source = get(case(&packet, "all_paths_and_navigation"), "source")
        .unwrap()
        .clone();
    let engine = engine();
    let early_query = module_order_query(false);
    let late_query = module_order_query(true);
    let (early, early_work) = selection_work(&source, &early_query, &engine);
    let (late, late_work) = selection_work(&source, &late_query, &engine);
    assert!(early.is_ok() && late.is_ok());
    assert!(
        late_work > early_work + 10_000,
        "filter scan was not charged: early={early_work}, late={late_work}"
    );
    assert!(canonical_equal(
        get(early.as_ref().unwrap(), "selection").unwrap(),
        get(late.as_ref().unwrap(), "selection").unwrap(),
    ));
    let (unfiltered, unfiltered_work) = selection_work(&source, &obj(vec![]), &engine);
    assert!(unfiltered.is_ok());
    assert!(
        early_work > unfiltered_work + 30_000,
        "filter extraction/copy work was not charged: filtered={early_work}, unfiltered={unfiltered_work}"
    );

    let mut used = 0u64;
    let limit = early_work + 1_000;
    let mut meter = |amount: usize| {
        used = used.saturating_add(amount as u64);
        if used > limit {
            Err(EngineError::new(
                "SELECTION_FILTER_STOP",
                Utf16::default(),
                "filter scan stopped",
            ))
        } else {
            Ok(())
        }
    };
    let stopped = umf_core::core_relationship_selection::select_core_relationships(
        &source,
        &late_query,
        &engine,
        &Registry::new(),
        &mut NoCapabilities,
        &mut Context::ordinary().with_meter(&mut meter),
    );
    assert_eq!(stopped.unwrap_err().code, "SELECTION_FILTER_STOP");

    let mut early_callbacks = 0usize;
    let mut count_early = |_: usize| {
        early_callbacks += 1;
        Ok(())
    };
    let early_result = umf_core::core_relationship_selection::select_core_relationships(
        &source,
        &early_query,
        &engine,
        &Registry::new(),
        &mut NoCapabilities,
        &mut Context::ordinary().with_meter(&mut count_early),
    );
    assert!(early_result.is_ok());
    drop(count_early);
    let cancellation_threshold = early_callbacks + 1_000;
    let mut cancellation_calls = 0usize;
    let mut cancel_after_early = || {
        cancellation_calls += 1;
        cancellation_calls > cancellation_threshold
    };
    let late_cancelled = umf_core::core_relationship_selection::select_core_relationships(
        &source,
        &late_query,
        &engine,
        &Registry::new(),
        &mut NoCapabilities,
        &mut Context::ordinary().with_cancellation(&mut cancel_after_early),
    );
    assert_eq!(late_cancelled.unwrap_err().code, "CANCELLED");
}

#[test]
fn unknown_record_and_key_property_order_is_metered() {
    let packet = packet();
    let engine = engine();
    let early_case = case(&packet, "unknown_record_key_fields_first");
    let late_case = case(&packet, "unknown_record_key_fields_last");
    let early_source = get(early_case, "source").unwrap();
    let late_source = get(late_case, "source").unwrap();
    let early_query = get(early_case, "query").unwrap();
    let late_query = get(late_case, "query").unwrap();
    let (early, early_work) = selection_work(early_source, early_query, &engine);
    let (late, late_work) = selection_work(late_source, late_query, &engine);
    compare(&packet, "unknown_record_key_fields_first", early);
    compare(&packet, "unknown_record_key_fields_last", late);
    assert!(
        early_work > late_work + 5_000,
        "unknown property lookup was not metered: first={early_work}, last={late_work}"
    );
}
