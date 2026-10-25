// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::{
    context::Context,
    engine::{Capabilities, Engine, ResourceSet, SemanticContext},
    error::{Diagnostic, EngineError},
    registry::Registry,
    selection::select_core_elements,
    serialization::{read_json_value, Format},
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
fn parse(source: &str) -> Value {
    read_json_value(
        &source.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        &mut Context::ordinary(),
    )
    .unwrap()
}
fn get<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    match value {
        Value::Object(fields) => fields
            .iter()
            .find(|(key, _)| key == &Utf16::from(name))
            .map(|(_, value)| value),
        _ => None,
    }
}
fn get_mut<'a>(value: &'a mut Value, name: &str) -> Option<&'a mut Value> {
    match value {
        Value::Object(fields) => fields
            .iter_mut()
            .find(|(key, _)| key == &Utf16::from(name))
            .map(|(_, value)| value),
        _ => None,
    }
}
fn index_mut(value: &mut Value, index: usize) -> Option<&mut Value> {
    match value {
        Value::Array(items) => items.get_mut(index),
        _ => None,
    }
}
fn refusal(error: EngineError) -> Value {
    Value::Object(vec![
        (Utf16::from("ok"), Value::Bool(false)),
        (
            Utf16::from("error"),
            Value::Object(vec![
                (Utf16::from("code"), Value::String(Utf16::from(error.code))),
                (Utf16::from("message"), Value::String(error.message)),
                (Utf16::from("path"), Value::String(error.path)),
            ]),
        ),
    ])
}
fn engine() -> Engine {
    let parse_resource = |source| parse(source);
    Engine::new(
        ResourceSet::new(
            parse_resource(include_str!("../../../spec/core/schema.json")),
            parse_resource(include_str!(
                "../../../spec/core/semantic-type-reference.schema.json"
            )),
            parse_resource(include_str!(
                "../../../spec/core/extension-package.schema.json"
            )),
            parse_resource(include_str!(
                "../../../spec/metamodel/generated/core-constraints.json"
            )),
            parse_resource(include_str!(
                "../../../spec/metamodel/generated/domain-policy.json"
            )),
        ),
        &mut Context::ordinary(),
    )
    .unwrap()
}
fn run(source: &Value, query: &Value) -> Result<Value, EngineError> {
    select_core_elements(
        source,
        query,
        &engine(),
        &Registry::new(),
        &mut NoCapabilities,
        &mut Context::ordinary(),
    )
}

#[test]
fn frozen_complete_predecessor_envelopes_match() {
    let frozen = parse(include_str!(
        "../../../fixtures/validation/core-selection.json"
    ));
    let result = run(
        get(&frozen, "source").unwrap(),
        get(&frozen, "query").unwrap(),
    )
    .unwrap();
    assert_eq!(result, *get(&frozen, "result").unwrap());
    let closure = run(
        get(&frozen, "source").unwrap(),
        get(&frozen, "closureQuery").unwrap(),
    )
    .unwrap();
    assert_eq!(closure, *get(&frozen, "closure").unwrap());
}

#[test]
fn empty_filter_still_validates_entire_source_and_registry() {
    let frozen = parse(include_str!(
        "../../../fixtures/validation/core-selection.json"
    ));
    let empty = parse(r#"{"references":"none","names":[]}"#);
    let result = run(get(&frozen, "source").unwrap(), &empty).unwrap();
    assert!(matches!(get(&result, "selection"), Some(Value::Array(items)) if items.is_empty()));
    let invalid = parse(
        r#"{"umf":"0.10.0","id":"bad","vocabularies":{},"modules":[{"id":"m","namespace":"","elements":[{"id":"e","extensions":{},"references":[{"role":"x","module":"m","element":"absent"}]}]}]}"#,
    );
    let error = run(&invalid, &empty).unwrap_err();
    assert_eq!(error.code, "CORE_SELECTION_SOURCE");
    assert!(error
        .message
        .to_utf8()
        .unwrap()
        .contains("UNRESOLVED_REFERENCE"));
}

#[test]
fn raw_utf16_identity_and_stable_source_order_are_preserved() {
    let source = parse(
        r#"{"umf":"0.10.0","id":"surrogate","vocabularies":{},"modules":[{"id":"\ud800","namespace":"","elements":[{"id":"\ud800","extensions":{}},{"id":"later","extensions":{}}]}]}"#,
    );
    let query =
        parse(r#"{"references":"none","identities":[{"module":"\ud800","element":"\ud800"}]}"#);
    let result = run(&source, &query).unwrap();
    let Value::Array(items) = get(&result, "selection").unwrap() else {
        panic!("selection array")
    };
    assert_eq!(items.len(), 1);
    assert_eq!(
        get(&items[0], "module")
            .and_then(|v| if let Value::String(s) = v {
                Some(s)
            } else {
                None
            })
            .unwrap()
            .units(),
        &[0xd800]
    );
}

#[test]
fn four_explicit_reference_kinds_bound_and_traverse_without_extension_scanning() {
    let source = parse(
        r#"{
          "umf":"0.10.0","id":"graph","vocabularies":{"future":{"version":"1.0.0"}},
          "extensions":{"future":{"module":"m","element":"hidden"}},
          "modules":[{"id":"m","namespace":"n","elements":[
            {"id":"record","name":"RecordRoot","kind":"record","extensions":{"future":{"target":"hidden"}},
             "references":[{"role":"edge","module":"m","element":"edge","annotation":"preserve"}],
             "members":[{"module":"m","element":"member"},{"module":"m","element":"key"}],
             "keys":[{"id":"record-key","name":"record-key","fields":[{"module":"m","element":"key"}]}]},
            {"id":"array","name":"ArrayHolder","kind":"field","cardinality":"array","itemType":{"module":"m","element":"item"},"extensions":{}},
            {"id":"edge","kind":"field","extensions":{},"references":[{"role":"cycle","module":"m","element":"record"}]},
            {"id":"member","kind":"field","extensions":{}},
            {"id":"key","kind":"field","scalarType":"string","nullability":"required","cardinality":"one","extensions":{}},
            {"id":"item","kind":"field","extensions":{}},
            {"id":"hidden","kind":"field","extensions":{}}
          ]}]}
        "#,
    );
    let query = parse(r#"{"references":"none","names":["RecordRoot","ArrayHolder"]}"#);
    let bounded = run(&source, &query).unwrap();
    for field in [
        "boundaryReferences",
        "boundaryItemTypes",
        "boundaryMembers",
        "boundaryKeyFields",
    ] {
        assert!(
            matches!(get(&bounded, field), Some(Value::Array(values)) if values.len() == if field == "boundaryMembers" { 2 } else { 1 }),
            "{field}"
        );
    }
    assert_eq!(
        get(&bounded, "referenceScope")
            .and_then(|v| if let Value::String(s) = v {
                s.to_utf8().ok()
            } else {
                None
            })
            .as_deref(),
        Some("explicit-core-references-item-types-members-and-keys")
    );
    let transitive = parse(
        r#"{"references":"transitive","identities":[{"module":"m","element":"record"},{"module":"m","element":"array"}]}"#,
    );
    let closure = run(&source, &transitive).unwrap();
    let Value::Array(selected) = get(&closure, "selection").unwrap() else {
        panic!("selection array")
    };
    assert_eq!(selected.len(), 6);
    for field in [
        "boundaryReferences",
        "boundaryItemTypes",
        "boundaryMembers",
        "boundaryKeyFields",
    ] {
        assert!(
            matches!(get(&closure, field), Some(Value::Array(values)) if values.is_empty()),
            "{field}"
        );
    }
    assert!(selected.iter().all(|entry| {
        get(entry, "module")
            .and_then(|v| {
                if let Value::String(s) = v {
                    s.to_utf8().ok()
                } else {
                    None
                }
            })
            .as_deref()
            == Some("m")
    }));
}

#[test]
fn selection_charges_work_and_propagates_meter_refusal_without_a_result() {
    let frozen = parse(include_str!(
        "../../../fixtures/validation/core-selection.json"
    ));
    let source = get(&frozen, "source").unwrap();
    let query = get(&frozen, "query").unwrap();
    let engine = engine();
    let mut work = 0usize;
    let mut meter = |amount: usize| {
        work = work.saturating_add(amount);
        Err(EngineError::new(
            "SELECTION_METER_STOP",
            Utf16::default(),
            "Selection work budget stopped the operation",
        ))
    };
    let result = select_core_elements(
        source,
        query,
        &engine,
        &Registry::new(),
        &mut NoCapabilities,
        &mut Context::ordinary().with_meter(&mut meter),
    );
    assert_eq!(result.unwrap_err().code, "SELECTION_METER_STOP");
    assert!(work > 0);
}

struct RejectCapability;
impl Capabilities for RejectCapability {
    fn validate_extension(
        &mut self,
        _: u64,
        _: &Value,
        _: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        Ok(vec![Diagnostic {
            code: Utf16::from("FROZEN_REJECT"),
            path: Utf16::from("/extensions/future.meaning"),
            python_source_path: false,
            message: Utf16::from("Frozen rejection"),
            severity: umf_core::Severity::Error,
            python_text_origin: None,
        }])
    }
}

#[test]
fn supplied_registry_semantic_refusal_precedes_an_empty_selection() {
    let source_fixture = parse(include_str!(
        "../../../fixtures/validation/core-selection.json"
    ));
    let source = get(&source_fixture, "source").unwrap();
    let query = parse(r#"{"references":"none","names":[]}"#);
    let engine = engine();
    let resources = engine
        .schema_resources_with_context(&mut Context::catalog())
        .unwrap();
    let mut registry = Registry::new();
    registry
        .register_extension(
            &Utf16::from("future.meaning"),
            &Utf16::from("1.0.0"),
            &[
                Utf16::from("document"),
                Utf16::from("module"),
                Utf16::from("element"),
            ],
            &Value::Bool(true),
            true,
            Some(42),
            engine.package_schema(),
            &resources,
            &mut Context::ordinary(),
        )
        .unwrap();
    let error = select_core_elements(
        source,
        &query,
        &engine,
        &registry,
        &mut RejectCapability,
        &mut Context::ordinary(),
    )
    .unwrap_err();
    let expected = parse(include_str!(
        "../../../scripts/rust-migration/r5/selection/frozen-refusals.json"
    ));
    assert_eq!(
        refusal(error),
        *get(&expected, "semanticErrorEvenEmpty").unwrap()
    );
}

#[test]
fn every_malformed_query_branch_matches_the_predecessor_refusal_envelope() {
    let frozen = parse(include_str!(
        "../../../fixtures/validation/core-selection.json"
    ));
    let source = get(&frozen, "source").unwrap();
    let malformed = [
        r#"{}"#,
        r#"{"references":"native"}"#,
        r#"{"references":"none","modules":null}"#,
        r#"{"references":"none","names":[1]}"#,
        r#"{"references":"none","scalarTypes":[""]}"#,
        r#"{"references":"none","identities":null}"#,
        r#"{"references":"none","identities":[{"module":"m","element":""}]}"#,
        r#"{"references":"none","extra":true}"#,
    ];
    let expected = parse(include_str!(
        "../../../scripts/rust-migration/r5/selection/frozen-refusals.json"
    ));
    for raw in malformed {
        let query = parse(raw);
        assert_eq!(
            refusal(run(source, &query).unwrap_err()),
            get(&expected, "malformedQuery").unwrap().clone(),
            "query: {raw}"
        );
    }
}

#[test]
fn source_refusals_match_both_frozen_predecessor_envelopes() {
    let frozen = parse(include_str!(
        "../../../fixtures/validation/core-selection.json"
    ));
    let expected = parse(include_str!(
        "../../../scripts/rust-migration/r5/selection/frozen-refusals.json"
    ));
    let mut invalid_reference = get(&frozen, "source").unwrap().clone();
    let reference = index_mut(
        get_mut(
            index_mut(get_mut(&mut invalid_reference, "modules").unwrap(), 0).unwrap(),
            "elements",
        )
        .unwrap(),
        0,
    )
    .and_then(|element| get_mut(element, "references"))
    .and_then(|references| index_mut(references, 0))
    .unwrap();
    if let Value::Object(fields) = reference {
        fields
            .iter_mut()
            .find(|(key, _)| key == &Utf16::from("element"))
            .unwrap()
            .1 = Value::String(Utf16::from("absent"));
    }
    let query = parse(r#"{"references":"none"}"#);
    assert_eq!(
        refusal(run(&invalid_reference, &query).unwrap_err()),
        *get(&expected, "invalidReference").unwrap()
    );

    let mut invalid_shape = get(&frozen, "source").unwrap().clone();
    let element = index_mut(
        get_mut(
            index_mut(get_mut(&mut invalid_shape, "modules").unwrap(), 0).unwrap(),
            "elements",
        )
        .unwrap(),
        0,
    )
    .unwrap();
    if let Value::Object(fields) = element {
        fields
            .iter_mut()
            .find(|(key, _)| key == &Utf16::from("id"))
            .unwrap()
            .1 = Value::String(Utf16::default());
    }
    assert_eq!(
        refusal(run(&invalid_shape, &query).unwrap_err()),
        *get(&expected, "invalidShape").unwrap()
    );
}

#[test]
fn copy_limit_refusal_matches_predecessor_descendant_path_and_message() {
    let source = parse(
        r#"{"umf":"0.10.0","id":"large","vocabularies":{},"modules":[{"id":"m","namespace":"","elements":[{"id":"e","extensions":{},"future":["opaque"]}]}]}"#,
    );
    let mut source = source;
    let future = index_mut(
        get_mut(
            index_mut(get_mut(&mut source, "modules").unwrap(), 0).unwrap(),
            "elements",
        )
        .unwrap(),
        0,
    )
    .unwrap();
    if let Value::Object(fields) = future {
        fields
            .iter_mut()
            .find(|(key, _)| key == &Utf16::from("future"))
            .unwrap()
            .1 = Value::Array(
            (0..51_000)
                .map(|_| Value::String(Utf16::from("opaque")))
                .collect(),
        );
    }
    let query = parse(r#"{"references":"none"}"#);
    let expected = parse(include_str!(
        "../../../scripts/rust-migration/r5/selection/frozen-refusals.json"
    ));
    let got = refusal(run(&source, &query).unwrap_err());
    assert_eq!(got, *get(&expected, "large").unwrap());
}

#[test]
fn long_key_path_cost_is_metered_before_descendant_path_construction() {
    let key = Utf16::new(vec![b'x' as u16; 1_000_000]);
    let source = Value::Object(vec![(key, Value::Null)]);
    let query = parse(r#"{"references":"none"}"#);
    let mut observed = Vec::new();
    let mut meter = |amount: usize| {
        observed.push(amount);
        if amount > 1_000 {
            Err(EngineError::new(
                "LONG_KEY_METER_STOP",
                Utf16::default(),
                "Host stopped before descendant path allocation",
            ))
        } else {
            Ok(())
        }
    };
    let result = select_core_elements(
        &source,
        &query,
        &engine(),
        &Registry::new(),
        &mut NoCapabilities,
        &mut Context::ordinary().with_meter(&mut meter),
    );
    assert_eq!(result.unwrap_err().code, "LONG_KEY_METER_STOP");
    assert_eq!(observed, vec![1, 2_000_001]);
}
