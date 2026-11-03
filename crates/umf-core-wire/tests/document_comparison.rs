// SPDX-License-Identifier: MIT OR Apache-2.0
// Recovered October wire controls, adapted to the current UTF-16 error envelope.
use umf_core::{Context, EngineError, Utf16, Value};
use umf_core_wire::{
    decode, encode, execute_document_comparison_wire,
    execute_document_comparison_wire_with_control, DOCUMENT_COMPARISON_PROFILE,
};

fn s(value: &str) -> Value {
    Value::string_utf8(value)
}
fn o(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(key, value)| (Utf16::from(key), value))
            .collect(),
    )
}
fn request(fields: Vec<(&str, Value)>) -> String {
    encode(&o(fields), &mut Context::ordinary()).unwrap()
}
fn envelope_field(result: &str, name: &str) -> serde_json::Value {
    let envelope = serde_json::from_str::<serde_json::Value>(result).unwrap();
    if name == "message" {
        let units = envelope["messageUnits"]
            .as_array()
            .unwrap()
            .iter()
            .map(|unit| unit.as_u64().unwrap() as u16)
            .collect::<Vec<_>>();
        serde_json::Value::String(String::from_utf16(&units).unwrap())
    } else {
        envelope[name].clone()
    }
}

#[test]
fn resource_free_wire_round_trip_preserves_order_and_result_envelope() {
    let wire = request(vec![
        ("profile", s(DOCUMENT_COMPARISON_PROFILE)),
        (
            "before",
            o(vec![("z", Value::Number(1.)), ("a/b~c", s("old"))]),
        ),
        (
            "after",
            o(vec![("z", Value::Number(2.)), ("a/b~c", s("new"))]),
        ),
    ]);
    let envelope = execute_document_comparison_wire(&wire);
    assert_eq!(envelope_field(&envelope, "status"), "ok");
    let result_value = envelope_field(&envelope, "wire");
    let result_wire = result_value.as_str().unwrap();
    let mut result = decode(result_wire, &mut Context::ordinary()).unwrap();
    let Value::Array(changes) = &mut result else {
        panic!("result must be a change array")
    };
    assert_eq!(changes.len(), 2);
    let Value::Object(first) = &changes[0] else {
        panic!("change must be an object")
    };
    assert_eq!(
        first
            .iter()
            .map(|(key, _)| key.to_utf8().unwrap())
            .collect::<Vec<_>>(),
        ["path", "status", "before", "after"]
    );
    assert_eq!(first[0].1, s("/z"));
    let Value::Object(second) = &changes[1] else {
        panic!("change must be an object")
    };
    assert_eq!(second[0].1, s("/a~1b~0c"));
}

#[test]
fn wire_profile_and_required_fields_refuse_in_stable_order() {
    let bad_profile = request(vec![("profile", s("wrong")), ("before", Value::Null)]);
    let result = execute_document_comparison_wire(&bad_profile);
    assert_eq!(envelope_field(&result, "status"), "error");
    assert_eq!(envelope_field(&result, "code"), "REQUEST");
    assert_eq!(
        envelope_field(&result, "message"),
        "umf.schema-comparison/1 profile is required"
    );

    let no_values = request(vec![("profile", s(DOCUMENT_COMPARISON_PROFILE))]);
    let result = execute_document_comparison_wire(&no_values);
    assert_eq!(
        envelope_field(&result, "message"),
        "Before value is required"
    );

    let no_after = request(vec![
        ("profile", s(DOCUMENT_COMPARISON_PROFILE)),
        ("before", Value::Null),
    ]);
    let result = execute_document_comparison_wire(&no_after);
    assert_eq!(
        envelope_field(&result, "message"),
        "After value is required"
    );
}

#[test]
fn operation_context_covers_controlled_work() {
    let wire = request(vec![
        ("profile", s(DOCUMENT_COMPARISON_PROFILE)),
        ("before", o(vec![("a", Value::Number(1.))])),
        ("after", o(vec![("a", Value::Number(2.))])),
    ]);
    let mut charged = 0usize;
    let mut control = |amount| {
        charged += amount;
        Ok(())
    };
    let result = execute_document_comparison_wire_with_control(&wire, &mut control);
    assert_eq!(envelope_field(&result, "status"), "ok");
    assert!(charged > 0);

    let mut cancel = |_amount| {
        Err(EngineError::new(
            "CANCELLED",
            Utf16::default(),
            "Operation cancelled",
        ))
    };
    let result = execute_document_comparison_wire_with_control(&wire, &mut cancel);
    assert_eq!(envelope_field(&result, "status"), "error");
    assert_eq!(envelope_field(&result, "code"), "CANCELLED");
}
