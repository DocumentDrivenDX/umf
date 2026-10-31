// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::{
    core_evolution::{inspect_core_evolution, verify_core_evolution},
    engine::{Engine, ResourceSet},
    error::EngineError,
    serialization::{read_json_value, Format},
    Context, Limits, Utf16, Value,
};

const FROZEN: &str = include_str!(
    "../../../tests/rust-core/fixtures/r5-core-evolution/frozen-typescript-0.10.json"
);

fn parse(input: &str) -> Value {
    read_json_value(
        &input.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        &mut Context::ordinary(),
    )
    .unwrap()
}
fn get<'a>(v: &'a Value, name: &str) -> Option<&'a Value> {
    match v {
        Value::Object(m) => m
            .iter()
            .find(|(k, _)| k == &Utf16::from(name))
            .map(|(_, v)| v),
        _ => None,
    }
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
fn json_string_bytes(value: &Utf16) -> usize {
    let units = value.units();
    let mut bytes = 2usize;
    let mut index = 0usize;
    while index < units.len() {
        let unit = units[index];
        bytes += match unit {
            0x22 | 0x5c => 2,
            0..=0x1f => 6,
            0xd800..=0xdbff
                if units
                    .get(index + 1)
                    .is_some_and(|next| (0xdc00..=0xdfff).contains(next)) =>
            {
                index += 1;
                4
            }
            0xd800..=0xdfff => 6,
            _ if unit <= 0x7f => 1,
            _ if unit <= 0x7ff => 2,
            _ => 3,
        };
        index += 1;
    }
    bytes
}
fn compact_json_bytes(value: &Value) -> usize {
    match value {
        Value::Null => 4,
        Value::Bool(true) => 4,
        Value::Bool(false) => 5,
        Value::Number(number) => umf_core::ecma_number_to_string(*number).len(),
        Value::String(string) => json_string_bytes(string),
        Value::Array(items) => {
            2 + items.len().saturating_sub(1) + items.iter().map(compact_json_bytes).sum::<usize>()
        }
        Value::Object(items) => {
            2 + items.len().saturating_sub(1)
                + items
                    .iter()
                    .map(|(key, child)| json_string_bytes(key) + 1 + compact_json_bytes(child))
                    .sum::<usize>()
        }
    }
}
fn json_value_count(value: &Value) -> usize {
    match value {
        Value::Array(items) => 1 + items.iter().map(json_value_count).sum::<usize>(),
        Value::Object(items) => 1 + items.iter().map(|(_, child)| json_value_count(child)).sum::<usize>(),
        _ => 1,
    }
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
fn cases() -> (Value, Engine) {
    let packet = parse(FROZEN);
    (packet, engine())
}

#[test]
fn current_source_frozen_typescript_outcomes_match_exactly() {
    let (packet, engine) = cases();
    let cases = get(&packet, "cases").unwrap();
    let outcomes = get(&packet, "outcomes").unwrap();
    let Value::Object(rows) = cases else {
        panic!("frozen cases must be an object")
    };
    for (name, input) in rows {
        let id = name.to_utf8().unwrap();
        let before = get(input, "before").unwrap();
        let after = get(input, "after").unwrap();
        let policy = get(input, "policy").unwrap();
        let expected = get(outcomes, &id).unwrap();
        let mut ctx = Context::ordinary();
        let actual = inspect_core_evolution(&engine, before, after, policy, &mut ctx);
        if get(expected, "ok") == Some(&Value::Bool(true)) {
            let result = actual.unwrap_or_else(|e| panic!("{id} refused: {e}"));
            let expected_value = get(expected, "value").unwrap();
            if !canonical(expected_value, &result) {
                if let (Value::Object(expected_fields), Value::Object(actual_fields)) =
                    (expected_value, &result)
                {
                    for (key, expected_field) in expected_fields {
                        let observed = actual_fields
                            .iter()
                            .find(|(other, _)| other == key)
                            .map(|(_, v)| v);
                        if !observed.is_some_and(|v| canonical(expected_field, v)) {
                            panic!(
                                "frozen receipt field {} differs for {id}; expected={expected_field:?}; actual={observed:?}",
                                key.to_utf8().unwrap_or_default()
                            );
                        }
                    }
                }
                panic!("frozen receipt differs for {id}");
            }
        } else {
            let expected_error = get(expected, "error").unwrap();
            let error = actual.unwrap_err();
            let actual_error = Value::Object(vec![
                (Utf16::from("code"), Value::string_utf8(error.code)),
                (Utf16::from("message"), Value::String(error.message)),
                (Utf16::from("path"), Value::String(error.path)),
            ]);
            assert!(
                canonical(expected_error, &actual_error),
                "frozen refusal differs for {id}: expected={expected_error:?}, actual={actual_error:?}"
            );
        }
    }
}

#[test]
fn policy_and_old_source_preconditions_refuse_closed() {
    let (packet, engine) = cases();
    let input = get(get(&packet, "cases").unwrap(), "unchanged").unwrap();
    let before = get(input, "before").unwrap();
    let policy = get(input, "policy").unwrap();
    let mut ctx = Context::ordinary();
    let extra = Value::Object(vec![
        (
            Utf16::from("profile"),
            Value::string_utf8("core-0.8-absent-string-additions/0.1"),
        ),
        (Utf16::from("extra"), Value::Bool(true)),
    ]);
    assert_eq!(
        inspect_core_evolution(&engine, before, before, &extra, &mut ctx)
            .unwrap_err()
            .code,
        "CORE_EVOLUTION_POLICY"
    );
    let mut old = before.clone();
    if let Value::Object(fields) = &mut old {
        if let Some((_, Value::String(v))) =
            fields.iter_mut().find(|(k, _)| k == &Utf16::from("umf"))
        {
            *v = Utf16::from("0.7.0");
        }
    }
    assert_eq!(
        inspect_core_evolution(&engine, &old, before, policy, &mut Context::ordinary())
            .unwrap_err()
            .code,
        "CORE_DATASET_SOURCE"
    );
}

#[test]
fn context_work_meter_and_value_limit_refuse_before_receipt() {
    let (packet, engine) = cases();
    let input = get(
        get(&packet, "cases").unwrap(),
        "accepted_absent_string_addition",
    )
    .unwrap();
    let mut stopped = 0usize;
    let mut meter = |_: usize| {
        stopped += 1;
        Err(EngineError::new(
            "EVOLUTION_METER_STOP",
            Utf16::default(),
            "stopped",
        ))
    };
    let mut ctx = Context::ordinary().with_meter(&mut meter);
    let error = inspect_core_evolution(
        &engine,
        get(input, "before").unwrap(),
        get(input, "after").unwrap(),
        get(input, "policy").unwrap(),
        &mut ctx,
    )
    .unwrap_err();
    assert_eq!(error.code, "EVOLUTION_METER_STOP");
    assert!(stopped > 0);

    let limits = Limits {
        max_values: 8,
        ..Limits::ordinary()
    };
    let mut limited =
        Context::with_limits(umf_core::context::ResourceProfile::Cooperative, limits).unwrap();
    let error = inspect_core_evolution(
        &engine,
        get(input, "before").unwrap(),
        get(input, "after").unwrap(),
        get(input, "policy").unwrap(),
        &mut limited,
    )
    .unwrap_err();
    assert_eq!(error.code, "LIMIT");
}

#[test]
fn aggregate_value_and_serialized_byte_limits_preflight_before_validation() {
    let (_packet, engine) = cases();
    let policy = Value::Object(vec![(
        Utf16::from("profile"),
        Value::string_utf8("core-0.8-absent-string-additions/0.1"),
    )]);
    let many = Value::Array(vec![Value::Null; 50_001]);
    let error = inspect_core_evolution(&engine, &many, &many, &policy, &mut Context::ordinary())
        .unwrap_err();
    assert_eq!(error.code, "LIMIT");
    let large = Value::String(Utf16::from_utf8(&"x".repeat(2_000_001)));
    let error = inspect_core_evolution(&engine, &large, &large, &policy, &mut Context::ordinary())
        .unwrap_err();
    assert_eq!(error.code, "LIMIT");
}

#[test]
fn aggregate_value_and_input_byte_limits_cover_the_exact_preflight_edge() {
    let (_packet, engine) = cases();
    let policy = Value::Object(vec![(
        Utf16::from("profile"),
        Value::string_utf8("core-0.8-absent-string-additions/0.1"),
    )]);

    // Policy contributes two Values; each source array contributes its root
    // plus its items.  49,998 nulls therefore lands exactly at 100,000 Values.
    let at_value_limit = Value::Array(vec![Value::Null; 49_998]);
    assert_eq!(
        inspect_core_evolution(
            &engine,
            &at_value_limit,
            &at_value_limit,
            &policy,
            &mut Context::ordinary(),
        )
        .unwrap_err()
        .code,
        "CORE_DATASET_SOURCE"
    );
    let over_value_limit = Value::Array(vec![Value::Null; 49_999]);
    assert_eq!(
        inspect_core_evolution(
            &engine,
            &over_value_limit,
            &over_value_limit,
            &policy,
            &mut Context::ordinary(),
        )
        .unwrap_err()
        .code,
        "LIMIT"
    );

    // For this ASCII-only malformed source pair, aggregate preflight bytes are
    // the exact policy JSON size plus two quoted strings.  The at-limit input
    // proceeds to the semantic source refusal; the next byte is rejected.
    let profile_len = "core-0.8-absent-string-additions/0.1".len();
    let policy_bytes = 14 + profile_len; // {"profile":"<profile>"}
    let padding = (4_000_000 - policy_bytes) / 2 - 2;
    assert_eq!(policy_bytes + 2 * (padding + 2), 4_000_000);
    let at_byte_limit = Value::string_utf8(&"x".repeat(padding));
    assert_eq!(
        inspect_core_evolution(
            &engine,
            &at_byte_limit,
            &at_byte_limit,
            &policy,
            &mut Context::ordinary(),
        )
        .unwrap_err()
        .code,
        "CORE_DATASET_SOURCE"
    );
    let over_byte_limit = Value::string_utf8(&"x".repeat(padding + 1));
    assert_eq!(
        inspect_core_evolution(
            &engine,
            &over_byte_limit,
            &over_byte_limit,
            &policy,
            &mut Context::ordinary(),
        )
        .unwrap_err()
        .code,
        "LIMIT"
    );
}

#[test]
fn retained_receipt_value_and_byte_limits_cover_exact_edges() {
    let (packet, engine) = cases();
    let unchanged = get(get(&packet, "cases").unwrap(), "unchanged").unwrap();
    let base = get(unchanged, "before").unwrap();
    let after = get(unchanged, "after").unwrap();
    let policy = get(unchanged, "policy").unwrap();

    let mut value_before = base.clone();
    if let Value::Object(fields) = &mut value_before {
        fields.push((Utf16::from("opaque"), Value::Array(vec![])));
    }
    let baseline_receipt = inspect_core_evolution(
        &engine,
        &value_before,
        after,
        policy,
        &mut Context::ordinary(),
    )
    .unwrap();
    let baseline_values = json_value_count(policy)
        + json_value_count(&value_before)
        + json_value_count(after)
        + json_value_count(&baseline_receipt);
    let remaining_values = 100_000 - baseline_values;
    assert_eq!(remaining_values % 2, 0);
    let padding_values = remaining_values / 2;
    let mut at_value_limit = base.clone();
    if let Value::Object(fields) = &mut at_value_limit {
        fields.push((
            Utf16::from("opaque"),
            Value::Array(vec![Value::Null; padding_values]),
        ));
    }
    let receipt = inspect_core_evolution(
        &engine,
        &at_value_limit,
        after,
        policy,
        &mut Context::ordinary(),
    )
    .unwrap();
    assert_eq!(
        json_value_count(policy)
            + json_value_count(&at_value_limit)
            + json_value_count(after)
            + json_value_count(&receipt),
        100_000
    );
    let mut over_value_limit = at_value_limit.clone();
    if let Some(Value::Array(items)) = get_mut(&mut over_value_limit, "opaque") {
        items.push(Value::Null);
    }
    assert_eq!(
        inspect_core_evolution(
            &engine,
            &over_value_limit,
            after,
            policy,
            &mut Context::ordinary(),
        )
        .unwrap_err()
        .code,
        "LIMIT"
    );

    let mut byte_before = base.clone();
    if let Value::Object(fields) = &mut byte_before {
        fields.push((Utf16::from("opaque"), Value::string_utf8("")));
    }
    let byte_receipt = inspect_core_evolution(
        &engine,
        &byte_before,
        after,
        policy,
        &mut Context::ordinary(),
    )
    .unwrap();
    let baseline_bytes = compact_json_bytes(policy)
        + compact_json_bytes(&byte_before)
        + compact_json_bytes(after)
        + compact_json_bytes(&byte_receipt);
    let remaining_bytes = 4_000_000 - baseline_bytes;
    assert_eq!(remaining_bytes % 2, 0);
    let padding_bytes = remaining_bytes / 2;
    let mut at_byte_limit = base.clone();
    if let Value::Object(fields) = &mut at_byte_limit {
        fields.push((
            Utf16::from("opaque"),
            Value::string_utf8(&"x".repeat(padding_bytes)),
        ));
    }
    let receipt = inspect_core_evolution(
        &engine,
        &at_byte_limit,
        after,
        policy,
        &mut Context::ordinary(),
    )
    .unwrap();
    assert_eq!(
        compact_json_bytes(policy)
            + compact_json_bytes(&at_byte_limit)
            + compact_json_bytes(after)
            + compact_json_bytes(&receipt),
        4_000_000
    );
    let mut over_byte_limit = at_byte_limit.clone();
    if let Some(Value::String(value)) = get_mut(&mut over_byte_limit, "opaque") {
        *value = Utf16::from_utf8(&format!("{}x", value.to_utf8().unwrap()));
    }
    assert_eq!(
        inspect_core_evolution(
            &engine,
            &over_byte_limit,
            after,
            policy,
            &mut Context::ordinary(),
        )
        .unwrap_err()
        .code,
        "LIMIT"
    );
}

#[test]
fn verifier_aggregate_bound_includes_recomputed_retained_output() {
    let (packet, engine) = cases();
    let unchanged = get(get(&packet, "cases").unwrap(), "unchanged").unwrap();
    let mut before = get(unchanged, "before").unwrap().clone();
    let after = get(unchanged, "after").unwrap();
    let policy = get(unchanged, "policy").unwrap();
    if let Value::Object(fields) = &mut before {
        fields.push((
            Utf16::from("opaque"),
            Value::string_utf8(&"x".repeat(1_400_000)),
        ));
    }

    // Inspection retains one source copy in its receipt and accepts this
    // source. Verification additionally retains the supplied receipt, the
    // independently supplied source, and its recomputed receipt together.
    let receipt = inspect_core_evolution(
        &engine,
        &before,
        after,
        policy,
        &mut Context::ordinary(),
    )
    .unwrap();
    let inputs_bytes = compact_json_bytes(&receipt)
        + compact_json_bytes(&before)
        + compact_json_bytes(after)
        + compact_json_bytes(policy);
    assert!(inputs_bytes < 4_000_000);
    assert!(compact_json_bytes(&receipt) < 4_000_000);
    assert!(inputs_bytes + compact_json_bytes(&receipt) > 4_000_000);
    assert_eq!(
        verify_core_evolution(
            &receipt,
            &before,
            after,
            policy,
            &engine,
            &mut Context::ordinary(),
        )
        .unwrap_err()
        .code,
        "LIMIT"
    );
}

#[test]
fn duplicate_keys_fail_closed_and_large_unknown_objects_are_metered() {
    let (packet, engine) = cases();
    let policy = Value::Object(vec![(
        Utf16::from("profile"),
        Value::string_utf8("core-0.8-absent-string-additions/0.1"),
    )]);
    let duplicate = Value::Object(vec![
        (Utf16::from("umf"), Value::string_utf8("0.10.0")),
        (Utf16::from("umf"), Value::string_utf8("0.10.0")),
    ]);
    assert_eq!(
        inspect_core_evolution(
            &engine,
            &duplicate,
            &duplicate,
            &policy,
            &mut Context::ordinary()
        )
        .unwrap_err()
        .code,
        "DUPLICATE_KEY"
    );
    let mut fields = (0..1_000)
        .map(|i| {
            (
                Utf16::from(format!("extension-{i:04}")),
                Value::string_utf8("kept"),
            )
        })
        .collect::<Vec<_>>();
    let unknown = Value::Object(fields.drain(..).collect());
    let frozen = get(get(&packet, "cases").unwrap(), "unchanged").unwrap();
    let mut before = get(frozen, "before").unwrap().clone();
    if let Value::Object(fields) = &mut before {
        fields.push((Utf16::from("opaque"), unknown));
    }
    let after = before.clone();
    let mut metered = 0usize;
    let mut meter = |amount: usize| {
        metered = metered.saturating_add(amount);
        Ok(())
    };
    let receipt = inspect_core_evolution(
        &engine,
        &before,
        &after,
        &policy,
        &mut Context::ordinary().with_meter(&mut meter),
    );
    assert!(receipt.is_ok());
    assert!(
        metered > 2_000,
        "expected bounded traversal/comparison work to reach the Context meter: {metered}"
    );
}

#[test]
fn wide_object_member_scan_is_charged_before_linear_traversal() {
    let (packet, engine) = cases();
    let policy = Value::Object(vec![(
        Utf16::from("profile"),
        Value::string_utf8("core-0.8-absent-string-additions/0.1"),
    )]);
    let frozen = get(get(&packet, "cases").unwrap(), "unchanged").unwrap();
    let mut before = get(frozen, "before").unwrap().clone();
    if let Value::Object(fields) = &mut before {
        fields.extend((0..4_096).map(|i| {
            (
                Utf16::from(format!("wide-extension-{i:04}")),
                Value::Null,
            )
        }));
    } else {
        panic!("frozen source must be an object");
    }
    let after = before.clone();
    let mut observed_scan_charge = None;
    let mut meter = |amount: usize| {
        if amount >= 4_000 {
            observed_scan_charge = Some(amount);
            return Err(EngineError::new(
                "EVOLUTION_WIDE_SCAN_STOP",
                Utf16::default(),
                "wide member scan stopped before traversal",
            ));
        }
        Ok(())
    };
    let error = inspect_core_evolution(
        &engine,
        &before,
        &after,
        &policy,
        &mut Context::ordinary().with_meter(&mut meter),
    )
    .unwrap_err();
    assert_eq!(error.code, "EVOLUTION_WIDE_SCAN_STOP");
    assert!(observed_scan_charge.is_some_and(|amount| amount >= 4_000));
}

#[test]
fn unknown_meaning_remains_in_result_and_mutation_changes_classification() {
    let (packet, engine) = cases();
    let input = get(get(&packet, "cases").unwrap(), "unknown_retained").unwrap();
    let receipt = inspect_core_evolution(
        &engine,
        get(input, "before").unwrap(),
        get(input, "after").unwrap(),
        get(input, "policy").unwrap(),
        &mut Context::ordinary(),
    )
    .unwrap();
    assert_eq!(
        get(&receipt, "classification"),
        Some(&Value::string_utf8("unsupported"))
    );
    assert!(get(get(&receipt, "after").unwrap(), "opaque").is_some());
    let mut mutation = get(&receipt, "after").unwrap().clone();
    if let Some(Value::Array(modules)) = get_mut(&mut mutation, "modules") {
        let field = modules
            .iter_mut()
            .find(|m| get(m, "id") == Some(&Value::string_utf8("domain")))
            .and_then(|m| get_mut(m, "elements"))
            .and_then(|v| match v {
                Value::Array(a) => a
                    .iter_mut()
                    .find(|e| get(e, "id") == Some(&Value::string_utf8("order_lines.quantity"))),
                _ => None,
            })
            .unwrap();
        if let Value::Object(fields) = field {
            if let Some((_, v)) = fields
                .iter_mut()
                .find(|(k, _)| k == &Utf16::from("scalarType"))
            {
                *v = Value::string_utf8("string");
            }
        }
    }
    let receipt2 = inspect_core_evolution(
        &engine,
        get(input, "before").unwrap(),
        &mutation,
        get(input, "policy").unwrap(),
        &mut Context::ordinary(),
    )
    .unwrap();
    assert_eq!(
        get(&receipt2, "classification"),
        Some(&Value::string_utf8("breaking"))
    );
}

#[test]
fn verification_recomputes_against_independent_inputs_and_refuses_forgery() {
    let (packet, engine) = cases();
    let input = get(
        get(&packet, "cases").unwrap(),
        "accepted_absent_string_addition",
    )
    .unwrap();
    let before = get(input, "before").unwrap();
    let after = get(input, "after").unwrap();
    let policy = get(input, "policy").unwrap();
    let receipt =
        inspect_core_evolution(&engine, before, after, policy, &mut Context::ordinary()).unwrap();
    let verified = verify_core_evolution(
        &receipt,
        before,
        after,
        policy,
        &engine,
        &mut Context::ordinary(),
    )
    .unwrap();
    assert!(canonical(&receipt, &verified));
    assert_eq!(
        verify_core_evolution(
            &receipt,
            after,
            after,
            policy,
            &engine,
            &mut Context::ordinary()
        )
        .unwrap_err()
        .code,
        "CORE_EVOLUTION_RECEIPT"
    );
    let mut forged = receipt.clone();
    if let Some(Value::Bool(complete)) = get_mut(&mut forged, "complete") {
        *complete = false;
    }
    assert_eq!(
        verify_core_evolution(
            &forged,
            before,
            after,
            policy,
            &engine,
            &mut Context::ordinary()
        )
        .unwrap_err()
        .code,
        "CORE_EVOLUTION_RECEIPT"
    );
    let mut unknown = receipt.clone();
    if let Value::Object(fields) = &mut unknown {
        fields.push((Utf16::from("unknownReceiptMember"), Value::Bool(true)));
    }
    assert_eq!(
        verify_core_evolution(
            &unknown,
            before,
            after,
            policy,
            &engine,
            &mut Context::ordinary()
        )
        .unwrap_err()
        .code,
        "CORE_EVOLUTION_RECEIPT"
    );
}

fn get_mut<'a>(v: &'a mut Value, name: &str) -> Option<&'a mut Value> {
    match v {
        Value::Object(m) => m
            .iter_mut()
            .find(|(k, _)| k == &Utf16::from(name))
            .map(|(_, v)| v),
        _ => None,
    }
}

fn module_elements_mut(doc: &mut Value) -> &mut Vec<Value> {
    let modules = match get_mut(doc, "modules").unwrap() {
        Value::Array(values) => values,
        _ => panic!("modules must be an array"),
    };
    let domain = modules
        .iter_mut()
        .find(|module| get(module, "id") == Some(&Value::string_utf8("domain")))
        .unwrap();
    match get_mut(domain, "elements").unwrap() {
        Value::Array(values) => values,
        _ => panic!("elements must be an array"),
    }
}

fn element_mut<'a>(doc: &'a mut Value, id: &str) -> &'a mut Value {
    module_elements_mut(doc)
        .iter_mut()
        .find(|element| get(element, "id") == Some(&Value::string_utf8(id)))
        .unwrap()
}

fn append_field(doc: &mut Value, id: &str, name: &str, nullability: &str) {
    let field = Value::Object(vec![
        (Utf16::from("id"), Value::string_utf8(id)),
        (Utf16::from("name"), Value::string_utf8(name)),
        (Utf16::from("kind"), Value::string_utf8("field")),
        (Utf16::from("scalarType"), Value::string_utf8("string")),
        (Utf16::from("cardinality"), Value::string_utf8("one")),
        (Utf16::from("nullability"), Value::string_utf8(nullability)),
        (Utf16::from("extensions"), Value::Object(vec![])),
    ]);
    module_elements_mut(doc).push(field);
    let products = element_mut(doc, "products");
    let members = match get_mut(products, "members").unwrap() {
        Value::Array(values) => values,
        _ => panic!("record members must be an array"),
    };
    members.push(Value::Object(vec![
        (Utf16::from("module"), Value::string_utf8("domain")),
        (Utf16::from("element"), Value::string_utf8(id)),
    ]));
}

#[test]
fn current_source_negative_control_matrix_is_closed() {
    let (packet, engine) = cases();
    let unchanged = get(get(&packet, "cases").unwrap(), "unchanged").unwrap();
    let base = get(unchanged, "before").unwrap().clone();
    let policy = get(unchanged, "policy").unwrap();
    let mut control_index = 0;
    let mut classify = |before: &Value, after: &Value| {
        control_index += 1;
        let receipt = inspect_core_evolution(&engine, before, after, policy, &mut Context::ordinary())
            .unwrap_or_else(|error| panic!("control {control_index} source was refused: {error}"));
        get(&receipt, "classification").and_then(|v| match v {
            Value::String(value) => value.to_utf8().ok(),
            _ => None,
        }).unwrap()
    };

    let required = get(
        get(&packet, "cases").unwrap(),
        "required_addition",
    )
    .unwrap();
    let required = get(required, "after").unwrap();
    assert_eq!(classify(&base, &required), "breaking");

    let mut unknown_before = base.clone();
    if let Value::Object(fields) = &mut unknown_before {
        fields.push((Utf16::from("opaque"), Value::string_utf8("before")));
    }
    let mut unknown_after = unknown_before.clone();
    if let Some(value) = get_mut(&mut unknown_after, "opaque") {
        *value = Value::string_utf8("after");
    }
    assert_eq!(classify(&unknown_before, &unknown_before), "unsupported");
    assert_eq!(classify(&unknown_before, &unknown_after), "unsupported");

    let mut removed = base.clone();
    module_elements_mut(&mut removed).retain(|element| {
        get(element, "id") != Some(&Value::string_utf8("products.sku"))
    });
    let members = match get_mut(element_mut(&mut removed, "products"), "members").unwrap() {
        Value::Array(values) => values,
        _ => panic!("record members must be an array"),
    };
    members.retain(|member| get(member, "element") != Some(&Value::string_utf8("products.sku")));
    assert_eq!(classify(&base, &removed), "breaking");

    let mut reordered = base.clone();
    module_elements_mut(&mut reordered).reverse();
    let reordered_receipt = inspect_core_evolution(
        &engine,
        &base,
        &reordered,
        policy,
        &mut Context::ordinary(),
    )
    .unwrap();
    assert_eq!(
        get(&reordered_receipt, "classification"),
        Some(&Value::string_utf8("breaking"))
    );
    let changes = match get(&reordered_receipt, "changes").unwrap() {
        Value::Array(values) => values,
        _ => panic!("changes must be an array"),
    };
    let first_removed = changes
        .iter()
        .find(|change| get(change, "kind") == Some(&Value::string_utf8("removed-definition")))
        .unwrap();
    assert_eq!(get(first_removed, "afterPath"), Some(&Value::Null));

    let mut facet = base.clone();
    let facets = get_mut(element_mut(&mut facet, "products.unit_price"), "facets").unwrap();
    if let Value::Object(fields) = facets {
        if let Some((_, scale)) = fields.iter_mut().find(|(key, _)| key == &Utf16::from("scale")) {
            *scale = Value::Number(3.0);
        }
    }
    assert_eq!(classify(&base, &facet), "breaking");

    let mut default = base.clone();
    if let Value::Object(fields) = element_mut(&mut default, "products.sku") {
        fields.push((
            Utf16::from("default"),
            Value::Object(vec![
                (Utf16::from("on"), Value::string_utf8("missing")),
                (
                    Utf16::from("value"),
                    Value::Object(vec![(Utf16::from("string"), Value::string_utf8("synthetic"))]),
                ),
            ]),
        ));
    }
    assert_eq!(classify(&base, &default), "breaking");

    let mut key = base.clone();
    let keys = match get_mut(element_mut(&mut key, "products"), "keys").unwrap() {
        Value::Array(values) => values,
        _ => panic!("keys must be an array"),
    };
    if let Some(name) = get_mut(&mut keys[0], "name") {
        *name = Value::string_utf8("Changed identity label");
    }
    assert_eq!(classify(&base, &key), "breaking");

    let mut relationship = base.clone();
    let modules = match get_mut(&mut relationship, "modules").unwrap() {
        Value::Array(values) => values,
        _ => panic!("modules must be an array"),
    };
    let domain = modules.iter_mut().find(|item| get(item, "id") == Some(&Value::string_utf8("domain"))).unwrap();
    let relationships = match get_mut(domain, "relationships").unwrap() {
        Value::Array(values) => values,
        _ => panic!("relationships must be an array"),
    };
    if let Some(name) = get_mut(&mut relationships[0], "name") {
        *name = Value::string_utf8("Changed relationship label");
    }
    assert_eq!(classify(&base, &relationship), "breaking");

    let mut identity = base.clone();
    if let Some(id) = get_mut(&mut identity, "id") {
        *id = Value::string_utf8("urn:umf:other");
    }
    assert_eq!(classify(&base, &identity), "breaking");

    let mut duplicate_names = base.clone();
    append_field(&mut duplicate_names, "products.note_a", "repeated", "absent-allowed");
    append_field(&mut duplicate_names, "products.note_b", "repeated", "absent-allowed");
    assert_eq!(classify(&base, &duplicate_names), "preserved");

    let mut wrong_version = base.clone();
    if let Some(version) = get_mut(&mut wrong_version, "umf") {
        *version = Value::string_utf8("0.8.0");
    }
    assert_eq!(
        inspect_core_evolution(&engine, &wrong_version, &base, policy, &mut Context::ordinary())
            .unwrap_err()
            .code,
        "CORE_DATASET_SOURCE"
    );
}
