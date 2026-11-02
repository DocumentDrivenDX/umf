// SPDX-License-Identifier: MIT OR Apache-2.0
use std::{fs, path::PathBuf};

use serde_json::Value as Json;
use umf_core::{Context, EngineError, Utf16, Value};
use umf_core_wire::json_number_binding::{
    execute_json_number_wire, execute_json_number_wire_with_control, JSON_NUMBER_PROFILE,
};

fn packet() -> Json {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(
        "../../tests/rust-core/fixtures/r8-json-number-predecessor/typescript-predecessor.json",
    );
    serde_json::from_str(&fs::read_to_string(path).unwrap()).unwrap()
}

fn request(token: &str, profile: &str) -> String {
    let request = Value::Object(vec![
        (Utf16::from("profile"), Value::string_utf8(profile)),
        (
            Utf16::from("op"),
            Value::string_utf8("assertExactJsonNumber"),
        ),
        (
            Utf16::from("args"),
            Value::Object(vec![(
                Utf16::from("token"),
                Value::String(Utf16::from(token)),
            )]),
        ),
    ]);
    umf_core_wire::encode(&request, &mut Context::ordinary()).unwrap()
}

#[test]
fn tagged_wire_replays_frozen_predecessor_outcomes() {
    for case in packet()["cases"].as_array().unwrap() {
        let token = case["token"].as_str().unwrap();
        let response: Json = serde_json::from_str(&execute_json_number_wire(&request(
            token,
            JSON_NUMBER_PROFILE,
        )))
        .unwrap();
        if case["outcome"] == "accepted" {
            assert_eq!(response["status"], "ok", "{token:?}: {response}");
            assert_eq!(response["wire"], r#"{"kind":"null"}"#, "{token:?}");
        } else {
            assert_eq!(response["status"], "error", "{token:?}: {response}");
            assert_eq!(response["code"], case["error"]["code"], "{token:?}");
            let units = response["messageUnits"]
                .as_array()
                .unwrap()
                .iter()
                .map(|unit| unit.as_u64().unwrap() as u16)
                .collect::<Vec<_>>();
            assert_eq!(
                String::from_utf16(&units).unwrap(),
                case["error"]["message"].as_str().unwrap(),
                "{token:?}"
            );
        }
    }
}

#[test]
fn tagged_wire_refuses_bad_requests_and_honors_explicit_host_control() {
    let wrong_profile: Json =
        serde_json::from_str(&execute_json_number_wire(&request("1", "other"))).unwrap();
    assert_eq!(wrong_profile["code"], "REQUEST");

    let mut calls = 0usize;
    let mut stop = |_: usize| {
        calls += 1;
        Err(EngineError::new("STOP", Utf16::default(), "host stop"))
    };
    let response: Json = serde_json::from_str(&execute_json_number_wire_with_control(
        &request("1", JSON_NUMBER_PROFILE),
        &mut stop,
    ))
    .unwrap();
    assert_eq!(response["code"], "STOP");
    assert!(calls > 0);
}
