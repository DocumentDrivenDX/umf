// SPDX-License-Identifier: MIT OR Apache-2.0
#![cfg(feature = "embedded-adapters")]

use umf_core::{Context, EngineError, Utf16, Value};

fn object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(key, value)| (Utf16::from(key), value))
            .collect(),
    )
}

fn document(schema: &str) -> Value {
    umf_core::avro_document::import_schema(
        &Utf16::from("candidate"),
        &schema.encode_utf16().collect::<Vec<_>>(),
        &[],
        &mut Context::ordinary(),
    )
    .unwrap()
}

fn request(op: &str, doc: Option<Value>, path: Option<&str>, replacement: Option<&str>) -> String {
    let mut fields = vec![("op", Value::string_utf8(op))];
    if let Some(doc) = doc {
        fields.push(("document", doc));
    }
    if let Some(path) = path {
        fields.push(("path", Value::string_utf8(path)));
    }
    if let Some(replacement) = replacement {
        fields.push(("replacementJson", Value::string_utf8(replacement)));
    }
    umf_core_wire::encode(&object(fields), &mut Context::ordinary()).unwrap()
}

fn envelope(wire: &str) -> serde_json::Value {
    serde_json::from_str(&umf_core_wire::execute_avro_candidate_wire(wire)).unwrap()
}

fn result(value: &serde_json::Value) -> Value {
    umf_core_wire::decode(value["wire"].as_str().unwrap(), &mut Context::ordinary()).unwrap()
}

fn json_pointer<'a>(value: &'a serde_json::Value, pointer: &str) -> &'a serde_json::Value {
    pointer.split('/').skip(1).fold(value, |current, segment| {
        let segment = segment.replace("~1", "/").replace("~0", "~");
        match current {
            serde_json::Value::Array(items) => &items[segment.parse::<usize>().unwrap()],
            serde_json::Value::Object(fields) => &fields[&segment],
            _ => panic!("invalid fixture pointer {pointer}"),
        }
    })
}

fn json_pointer_parent_mut<'a>(
    value: &'a mut serde_json::Value,
    pointer: &str,
) -> (&'a mut serde_json::Value, String) {
    let mut segments = pointer
        .split('/')
        .skip(1)
        .map(|segment| segment.replace("~1", "/").replace("~0", "~"))
        .collect::<Vec<_>>();
    let last = segments.pop().expect("fixture patch path has a member");
    let parent = segments
        .into_iter()
        .fold(value, |current, segment| match current {
            serde_json::Value::Array(items) => &mut items[segment.parse::<usize>().unwrap()],
            serde_json::Value::Object(fields) => fields.get_mut(&segment).unwrap(),
            _ => panic!("invalid fixture patch path {pointer}"),
        });
    (parent, last)
}

fn request_from_json(value: &serde_json::Value) -> String {
    let source = serde_json::to_string(value).unwrap();
    let parsed = umf_core::serialization::read_json_value(
        &source.encode_utf16().collect::<Vec<_>>(),
        umf_core::serialization::Format::Json,
        &mut Context::ordinary(),
    )
    .unwrap();
    umf_core_wire::encode(&parsed, &mut Context::ordinary()).unwrap()
}

fn fixture_request(case: &serde_json::Value) -> Option<String> {
    let fixture: serde_json::Value = serde_json::from_str(include_str!(
        "../../../tests/rust-core/fixtures/r5-avro-candidate-wire/candidate-wire-cases.json"
    ))
    .unwrap();
    let request = case["requestValue"].as_object()?;
    let mut request = serde_json::Value::Object(request.clone());
    if let Some(source_ref) = case["sourceRef"].as_str() {
        let source: serde_json::Value =
            serde_json::from_str(include_str!("../../../fixtures/avro/candidate-edits.json"))
                .unwrap();
        let pointer = fixture["sourceFixture"]["sourcePointers"][source_ref]
            .as_str()
            .unwrap();
        request
            .as_object_mut()
            .unwrap()
            .insert("document".into(), json_pointer(&source, pointer).clone());
    }
    for patch in case["documentPatches"].as_array().into_iter().flatten() {
        let operation = patch["op"].as_str().unwrap();
        let pointer = patch["path"].as_str().unwrap();
        let (parent, key) = json_pointer_parent_mut(
            request
                .as_object_mut()
                .unwrap()
                .get_mut("document")
                .unwrap(),
            pointer,
        );
        match (operation, parent) {
            ("remove", serde_json::Value::Object(fields)) => {
                fields.remove(&key).unwrap();
            }
            ("replace", serde_json::Value::Object(fields)) => {
                *fields.get_mut(&key).unwrap() = patch["value"].clone();
            }
            ("add", serde_json::Value::Object(fields)) => {
                fields.insert(key, patch["value"].clone());
            }
            ("remove", serde_json::Value::Array(items)) => {
                items.remove(key.parse::<usize>().unwrap());
            }
            ("replace", serde_json::Value::Array(items)) => {
                items[key.parse::<usize>().unwrap()] = patch["value"].clone();
            }
            ("add", serde_json::Value::Array(items)) => {
                items.insert(key.parse::<usize>().unwrap(), patch["value"].clone());
            }
            _ => panic!("unsupported fixture patch {operation} {pointer}"),
        }
    }
    Some(request_from_json(&request))
}

fn member<'a>(value: &'a Value, key: &str) -> &'a Value {
    let Value::Object(fields) = value else {
        panic!("object expected")
    };
    &fields
        .iter()
        .find(|(name, _)| name == &Utf16::from(key))
        .unwrap()
        .1
}

#[test]
fn candidate_wire_preserves_exact_replacement_text_and_report_profile() {
    let document = document(
        r#"{"type":"record","name":"Invoice","fields":[{"name":"amount","type":"long","default":0}]}"#,
    );
    let wire = request(
        "avro.schema.proposeNodeEdit",
        Some(document),
        Some("/fields/0/default"),
        Some("9223372036854775807"),
    );
    let response = envelope(&wire);
    assert_eq!(response["status"], "ok", "{response:?}");
    let report = result(&response);
    assert_eq!(
        member(&report, "profile"),
        &Value::string_utf8(umf_core_wire::AVRO_CANDIDATE_PROFILE)
    );
    assert_eq!(member(&report, "status"), &Value::string_utf8("candidate"));
    assert!(matches!(member(&report, "document"), Value::Object(_)));
    let edit = member(&report, "edit");
    let replacement = member(edit, "replacement");
    assert_eq!(member(replacement, "kind"), &Value::string_utf8("number"));
    assert_eq!(
        member(replacement, "value"),
        &Value::string_utf8("9223372036854775807")
    );
    let Value::Object(fields) = &report else {
        panic!("report object expected")
    };
    assert!(!fields
        .iter()
        .any(|(key, _)| key == &Utf16::from("validation")));
}

#[test]
fn admitted_candidate_keeps_native_inspector_errors_as_report_data() {
    let document = document(
        r#"{"type":"record","name":"Invoice","fields":[{"name":"amount","type":"long"}]}"#,
    );
    let wire = request(
        "avro.schema.proposeNodeEdit",
        Some(document),
        Some("/fields/0/type"),
        Some("\"MissingName\""),
    );
    let response = envelope(&wire);
    assert_eq!(response["status"], "ok", "{response:?}");
    let report = result(&response);
    let admission = member(&report, "admission");
    assert_eq!(
        member(member(admission, "candidate"), "valid"),
        &Value::Bool(true)
    );
    let inspection = member(&report, "nativeInspection");
    assert_eq!(
        member(member(inspection, "candidate"), "valid"),
        &Value::Bool(false)
    );
}

#[test]
fn request_refusal_order_and_host_control_are_preserved() {
    let invalid = request(
        "avro.schema.proposeNodeEdit",
        None,
        Some("not/a/pointer"),
        Some("not-json"),
    );
    assert_eq!(envelope(&invalid)["code"], "REQUEST");

    let valid = request(
        "avro.schema.proposeNodeEdit",
        Some(document(r#"{"type":"string"}"#)),
        Some(""),
        Some("\"long\""),
    );
    let mut stop = |_amount: usize| {
        Err(EngineError::new(
            "TEST_BUDGET",
            Utf16::default(),
            "work refused",
        ))
    };
    let controlled: serde_json::Value = serde_json::from_str(
        &umf_core_wire::execute_avro_candidate_wire_with_control(&valid, &mut stop),
    )
    .unwrap();
    assert_eq!(controlled["status"], "error");
    assert_eq!(controlled["code"], "TEST_BUDGET");
}

#[test]
fn all_frozen_candidate_wire_cases_match_their_first_outcome() {
    let fixture: serde_json::Value = serde_json::from_str(include_str!(
        "../../../tests/rust-core/fixtures/r5-avro-candidate-wire/candidate-wire-cases.json"
    ))
    .unwrap();
    let cases = fixture["cases"].as_array().unwrap();
    assert_eq!(cases.len(), 16);
    for case in cases {
        let wire = fixture_request(case).expect("case has a request value");
        let expected = &case["expected"]["envelope"];
        let actual: serde_json::Value = if case["control"]["rejectFirstCharge"] == true {
            let mut reject = |_amount: usize| {
                Err(EngineError::new(
                    "HOST_BUDGET",
                    Utf16::default(),
                    "fixture refuses first charge",
                ))
            };
            serde_json::from_str(&umf_core_wire::execute_avro_candidate_wire_with_control(
                &wire,
                &mut reject,
            ))
            .unwrap()
        } else {
            envelope(&wire)
        };
        assert_eq!(actual["status"], expected["status"], "{}", case["id"]);
        if let Some(code) = expected["code"].as_str() {
            assert_eq!(actual["code"], code, "{}", case["id"]);
        }
        if expected["status"] == "ok" {
            let report = result(&actual);
            if let Some(profile) = case["expected"]["report"]["profile"].as_str() {
                assert_eq!(
                    member(&report, "profile"),
                    &Value::string_utf8(profile),
                    "{}",
                    case["id"]
                );
            }
            if let Some(status) = case["expected"]["report"]["status"].as_str() {
                assert_eq!(
                    member(&report, "status"),
                    &Value::string_utf8(status),
                    "{}",
                    case["id"]
                );
            }
        }
    }
}

#[test]
fn tagged_record_type_resolution_preserves_namespace_and_dependency_identity() {
    let root = umf_core::native_json::NativeJsonTree::parse_json(
        &r#"{"type":"record","name":"Holder","namespace":"sales","fields":[{"name":"customer","type":"Customer"}]}"#.encode_utf16().collect::<Vec<_>>(),
        &mut Context::ordinary(),
    ).unwrap();
    let dependency = umf_core::native_json::NativeJsonTree::parse_json(
        &r#"{"type":"record","name":"Customer","namespace":"sales","fields":[]}"#.encode_utf16().collect::<Vec<_>>(),
        &mut Context::ordinary(),
    ).unwrap();
    let dep_id = Utf16::from("customer-schema");
    let request = object(vec![
        ("op", Value::string_utf8("avro.recordType.resolveCandidate")),
        ("root", root.tagged_value_preserving_extras(&mut Context::ordinary()).unwrap()),
        ("column", Value::string_utf8(r#"[null,"/fields/0"]"#)),
        ("dependencies", Value::Array(vec![object(vec![
            ("id", Value::String(dep_id)),
            ("root", dependency.tagged_value_preserving_extras(&mut Context::ordinary()).unwrap()),
        ])])),
    ]);
    let wire = umf_core_wire::encode(&request, &mut Context::ordinary()).unwrap();
    let response: serde_json::Value = serde_json::from_str(
        &umf_core_wire::execute_avro_record_type_candidate_wire(&wire),
    ).unwrap();
    assert_eq!(response["status"], "ok");
    let report = result(&response);
    let resolution = member(&report, "resolution");
    assert_eq!(member(resolution, "kind"), &Value::string_utf8("qualified"));
    assert_eq!(member(resolution, "fullname"), &Value::string_utf8("sales.Customer"));
    assert_eq!(member(resolution, "dependencyId"), &Value::string_utf8("customer-schema"));
    assert_eq!(member(&report, "complete"), &Value::Bool(false));
}
