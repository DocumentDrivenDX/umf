// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::{Context, Utf16, Value};
use umf_core_wire::{
    arrow_ipc_capture_binding::{execute_wire, execute_wire_with_control},
    decode, encode,
};

fn obj(v: Vec<(&str, Value)>) -> Value {
    Value::Object(v.into_iter().map(|(k, x)| (Utf16::from(k), x)).collect())
}
fn s(x: &str) -> Value {
    Value::string_utf8(x)
}
fn call(v: Value) -> Value {
    let wire = encode(&v, &mut Context::ordinary()).unwrap();
    let response: serde_json::Value = serde_json::from_str(&execute_wire(&wire)).unwrap();
    assert_eq!(response["status"], "ok", "{response}");
    decode(response["wire"].as_str().unwrap(), &mut Context::ordinary()).unwrap()
}
fn capture(bytes: &str) -> Value {
    call(obj(vec![
        ("op", s("arrow.ipc.capture")),
        ("id", s("archive")),
        ("bytes", s(bytes)),
    ]))
}

#[test]
fn accepts_empty_invalid_and_trailing_bytes_with_incomplete_inspection_and_exact_export() {
    for bytes in ["", "00ff", "4152524f573100000000"] {
        let doc = capture(bytes);
        let report = call(obj(vec![
            ("op", s("arrow.ipc.inspect")),
            ("document", doc.clone()),
        ]));
        assert!(matches!(
            field(&report, "complete"),
            Some(Value::Bool(false))
        ));
        assert!(matches!(field(&report, "valid"), Some(Value::Bool(true))));
        assert_eq!(
            diagnostic_codes(&report),
            ["SEMANTICS_UNCHECKED", "ARROW_IPC_UNINTERPRETED"]
        );
        let out = call(obj(vec![("op", s("arrow.ipc.export")), ("document", doc)]));
        let Value::String(actual) = out else {
            panic!("string expected")
        };
        assert_eq!(actual.to_utf8().unwrap(), bytes);
    }
}

#[test]
fn rejects_oversize_and_noncanonical_hex() {
    let too_big = "00".repeat(1_000_001);
    let response: serde_json::Value = serde_json::from_str(&execute_wire(
        &encode(
            &obj(vec![
                ("op", s("arrow.ipc.capture")),
                ("id", s("x")),
                ("bytes", s(&too_big)),
            ]),
            &mut Context::ordinary(),
        )
        .unwrap(),
    ))
    .unwrap();
    assert_eq!(response["status"], "error");
    assert_eq!(response["code"], "ARROW_IPC_LIMIT");
    assert_eq!(
        units_string(&response["messageUnits"]),
        "Expected at most 1000000 source bytes"
    );

    let boundary = "00".repeat(1_000_000);
    let accepted = capture(&boundary);
    let exported = call(obj(vec![
        ("op", s("arrow.ipc.export")),
        ("document", accepted),
    ]));
    let Value::String(actual) = exported else {
        panic!("string expected")
    };
    assert_eq!(actual.units().len(), 2_000_000);
    let response: serde_json::Value = serde_json::from_str(&execute_wire(
        &encode(
            &obj(vec![
                ("op", s("arrow.ipc.capture")),
                ("id", s("")),
                ("bytes", s("00")),
            ]),
            &mut Context::ordinary(),
        )
        .unwrap(),
    ))
    .unwrap();
    assert_eq!(response["status"], "error");
    assert_eq!(response["code"], "ARROW_IPC_CAPTURE");
    assert_eq!(
        units_string(&response["messageUnits"]),
        "Invalid IPC capture envelope"
    );
    for invalid in ["a", "0A", "gg"] {
        let response: serde_json::Value = serde_json::from_str(&execute_wire(
            &encode(
                &obj(vec![
                    ("op", s("arrow.ipc.capture")),
                    ("id", s("x")),
                    ("bytes", s(invalid)),
                ]),
                &mut Context::ordinary(),
            )
            .unwrap(),
        ))
        .unwrap();
        assert_eq!(response["status"], "error");
    }
}

#[test]
fn unknown_payload_representation_survives_umf_but_blocks_byte_export() {
    let mut doc = capture("beef");
    let Value::Object(ref mut root) = doc else {
        panic!()
    };
    let modules = root
        .iter_mut()
        .find(|(k, _)| k == &Utf16::from("modules"))
        .unwrap();
    let Value::Array(ref mut ms) = modules.1 else {
        panic!()
    };
    let Value::Object(ref mut module) = ms[0] else {
        panic!()
    };
    let (_, elements) = module
        .iter_mut()
        .find(|(k, _)| k == &Utf16::from("elements"))
        .unwrap();
    let Value::Array(ref mut es) = elements else {
        panic!()
    };
    let Value::Object(ref mut elem) = es[0] else {
        panic!()
    };
    let (_, extensions) = elem
        .iter_mut()
        .find(|(k, _)| k == &Utf16::from("extensions"))
        .unwrap();
    let Value::Object(ref mut ext) = extensions else {
        panic!()
    };
    let (_, payload) = ext
        .iter_mut()
        .find(|(k, _)| k == &Utf16::from("umf.arrow.ipc"))
        .unwrap();
    let Value::Object(ref mut fields) = payload else {
        panic!()
    };
    fields.push((Utf16::from("future"), s("keep")));
    let reencoded = encode(&doc, &mut Context::ordinary()).unwrap();
    let roundtrip = decode(&reencoded, &mut Context::ordinary()).unwrap();
    assert_eq!(doc, roundtrip);
    let report = call(obj(vec![
        ("op", s("arrow.ipc.inspect")),
        ("document", doc.clone()),
    ]));
    assert_eq!(
        diagnostic_codes(&report),
        ["SEMANTICS_UNCHECKED", "ARROW_IPC_UNINTERPRETED"]
    );
    let response: serde_json::Value = serde_json::from_str(&execute_wire(
        &encode(
            &obj(vec![("op", s("arrow.ipc.export")), ("document", doc)]),
            &mut Context::ordinary(),
        )
        .unwrap(),
    ))
    .unwrap();
    assert_eq!(response["status"], "error");
    assert_eq!(response["code"], "ARROW_IPC_REPRESENTATION");
    assert_eq!(
        units_string(&response["messageUnits"]),
        "Unknown capture representation fields cannot be exported as native bytes"
    );
}

#[test]
fn cooperative_resource_control_can_refuse_capture() {
    let request = encode(
        &obj(vec![
            ("op", s("arrow.ipc.capture")),
            ("id", s("x")),
            ("bytes", s("00")),
        ]),
        &mut Context::ordinary(),
    )
    .unwrap();
    let mut control = |_: usize| {
        Err(umf_core::EngineError::new(
            "CANCELLED",
            Utf16::default(),
            "stopped by host",
        ))
    };
    let response: serde_json::Value =
        serde_json::from_str(&execute_wire_with_control(&request, &mut control)).unwrap();
    assert_eq!(response["status"], "error");
    assert_eq!(response["code"], "CANCELLED");
}
fn field<'a>(v: &'a Value, k: &str) -> Option<&'a Value> {
    if let Value::Object(xs) = v {
        xs.iter()
            .find(|(x, _)| x == &Utf16::from(k))
            .map(|(_, v)| v)
    } else {
        None
    }
}
fn units_string(v: &serde_json::Value) -> String {
    v.as_array()
        .unwrap()
        .iter()
        .map(|u| char::from_u32(u.as_u64().unwrap() as u32).unwrap())
        .collect()
}
fn diagnostic_codes(v: &Value) -> Vec<String> {
    let Some(Value::Array(ds)) = field(v, "diagnostics") else {
        panic!("diagnostics expected")
    };
    ds.iter()
        .map(|d| {
            field(d, "code")
                .and_then(|x| {
                    if let Value::String(s) = x {
                        s.to_utf8().ok()
                    } else {
                        None
                    }
                })
                .unwrap()
        })
        .collect()
}
