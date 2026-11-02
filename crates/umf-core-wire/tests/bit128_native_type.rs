// SPDX-License-Identifier: MIT OR Apache-2.0
use serde_json::Value as Json;
use umf_core::{Context, Utf16, Value};
use umf_core_wire::{decode, encode, execute_bit128_wire};

fn get<'a>(value: &'a Value, key: &str) -> Option<&'a Value> {
    match value {
        Value::Object(fields) => fields
            .iter()
            .find(|(name, _)| name == &Utf16::from(key))
            .map(|(_, value)| value),
        _ => None,
    }
}

fn call(op: &str, args: Value) -> Json {
    let request = Value::Object(vec![
        (Utf16::from("profile"), Value::string_utf8("umf-128/1")),
        (Utf16::from("op"), Value::string_utf8(op)),
        (Utf16::from("args"), args),
    ]);
    let wire = encode(&request, &mut Context::ordinary()).unwrap();
    serde_json::from_str(&execute_bit128_wire(&wire)).unwrap()
}

#[test]
fn native_type_classifier_requires_explicit_identity_and_retains_source() {
    let source = Value::Object(vec![
        (Utf16::from("system"), Value::string_utf8("postgresql")),
        (Utf16::from("version"), Value::string_utf8("17.6")),
        (
            Utf16::from("definition"),
            Value::Object(vec![
                (Utf16::from("schema"), Value::string_utf8("pg_catalog")),
                (Utf16::from("name"), Value::string_utf8("uuid")),
                (Utf16::from("kind"), Value::string_utf8("b")),
            ]),
        ),
    ]);
    let positive = call(
        "classifyNativeType",
        Value::Object(vec![(Utf16::from("input"), source.clone())]),
    );
    assert_eq!(positive["status"], "ok");
    let output = decode(positive["wire"].as_str().unwrap(), &mut Context::ordinary()).unwrap();
    assert_eq!(get(&output, "source"), Some(&source));
    assert_eq!(
        get(&output, "scalarType"),
        Some(&Value::string_utf8("uuid"))
    );
    assert_eq!(
        get(&output, "basis"),
        Some(&Value::string_utf8("native-type-identity"))
    );

    let refusal = call(
        "classifyNativeType",
        Value::Object(vec![(
            Utf16::from("input"),
            Value::Object(vec![
                (Utf16::from("system"), Value::string_utf8("unknown")),
                (Utf16::from("version"), Value::string_utf8("1")),
                (Utf16::from("definition"), Value::Null),
            ]),
        )]),
    );
    assert_eq!(refusal["status"], "error");
    assert_eq!(refusal["code"], "BIT128_PROJECTION");
}

#[test]
fn native_bit128_binding_inspection_checks_logical_identity() {
    let logical = umf_core::serialization::read_json_value(
        br#"{"umf":"0.10.0","id":"uuid-fixture","vocabularies":{},"modules":[{"id":"m","namespace":"test","elements":[{"id":"record","kind":"record","members":[{"module":"m","element":"value"}],"keys":[{"id":"id","name":"ID","fields":[{"module":"m","element":"value"}]}],"extensions":{}},{"id":"value","kind":"field","cardinality":"one","nullability":"required","scalarType":"uuid","extensions":{}}]}]}"#.iter().map(|b| *b as u16).collect::<Vec<_>>().as_slice(),
        umf_core::serialization::Format::Json,
        &mut Context::ordinary(),
    ).unwrap();
    let binding = umf_core::serialization::read_json_value(
        br#"{"umf":"0.10.0","id":"binding","vocabularies":{"umf.binding":{"version":"0.3.0"}},"modules":[],"extensions":{"umf.binding":{"profile":"umf-binding-3","logical":{"documentId":"uuid-fixture","coreVersion":"0.10.0"},"target":{"system":"postgresql","version":"17.6","subset":"uuid-model1"},"elements":[{"module":"m","element":"record","table":"records"}],"fields":[{"module":"m","element":"value","storage":"scalar-carrier","carrier":{"kind":"native-uuid","column":"id"}}],"relationships":[],"indexes":[]}}}"#.iter().map(|b| *b as u16).collect::<Vec<_>>().as_slice(),
        umf_core::serialization::Format::Json,
        &mut Context::ordinary(),
    ).unwrap();
    let call_binding = |binding: Value| {
        call(
            "inspectBit128Binding",
            Value::Object(vec![
                (Utf16::from("binding"), binding),
                (Utf16::from("logical"), logical.clone()),
            ]),
        )
    };
    let positive = call_binding(binding.clone());
    assert_eq!(positive["status"], "ok");
    let result = decode(positive["wire"].as_str().unwrap(), &mut Context::ordinary()).unwrap();
    assert_eq!(
        get(&result, "valid"),
        Some(&Value::Bool(true)),
        "positive fixture inspection failed: {result:?}"
    );
    assert_eq!(get(&result, "complete"), Some(&Value::Bool(true)));

    let mut invalid = binding.clone();
    if let Value::Object(fields) = &mut invalid {
        let ext = fields
            .iter_mut()
            .find(|(key, _)| key == &Utf16::from("extensions"))
            .unwrap();
        if let Value::Object(ext_fields) = &mut ext.1 {
            let payload = ext_fields
                .iter_mut()
                .find(|(key, _)| key == &Utf16::from("umf.binding"))
                .unwrap();
            if let Value::Object(payload_fields) = &mut payload.1 {
                let logical = payload_fields
                    .iter_mut()
                    .find(|(key, _)| key == &Utf16::from("logical"))
                    .unwrap();
                if let Value::Object(logical_fields) = &mut logical.1 {
                    let id = logical_fields
                        .iter_mut()
                        .find(|(key, _)| key == &Utf16::from("documentId"))
                        .unwrap();
                    id.1 = Value::string_utf8("other");
                }
            }
        }
    }
    let refusal = call_binding(invalid);
    assert_eq!(refusal["status"], "ok");
    let result = decode(refusal["wire"].as_str().unwrap(), &mut Context::ordinary()).unwrap();
    assert_eq!(get(&result, "valid"), Some(&Value::Bool(false)));
    let diagnostics = match get(&result, "diagnostics").unwrap() {
        Value::Array(items) => items,
        _ => panic!("diagnostics array"),
    };
    assert!(diagnostics
        .iter()
        .any(|item| get(item, "code") == Some(&Value::string_utf8("BINDING_MODEL"))));

    let identity = Value::Object(vec![
        (Utf16::from("module"), Value::string_utf8("m")),
        (Utf16::from("element"), Value::string_utf8("record")),
    ]);
    let values = Value::Array(vec![Value::Object(vec![
        (
            Utf16::from("field"),
            Value::Object(vec![
                (Utf16::from("module"), Value::string_utf8("m")),
                (Utf16::from("element"), Value::string_utf8("value")),
            ]),
        ),
        (
            Utf16::from("value"),
            Value::Object(vec![(
                Utf16::from("uuid"),
                Value::string_utf8("00112233-4455-6677-8899-aabbccddeeff"),
            )]),
        ),
    ])]);
    let encoded = call(
        "encodeBit128Record",
        Value::Object(vec![
            (Utf16::from("binding"), binding.clone()),
            (Utf16::from("logical"), logical.clone()),
            (Utf16::from("identity"), identity.clone()),
            (Utf16::from("values"), values.clone()),
        ]),
    );
    assert_eq!(encoded["status"], "ok");
    let slots = decode(encoded["wire"].as_str().unwrap(), &mut Context::ordinary()).unwrap();
    assert_eq!(
        get(&slots, "id"),
        Some(&Value::string_utf8("00112233-4455-6677-8899-aabbccddeeff"))
    );
    let decoded = call(
        "decodeBit128Record",
        Value::Object(vec![
            (Utf16::from("binding"), binding.clone()),
            (Utf16::from("logical"), logical.clone()),
            (Utf16::from("identity"), identity.clone()),
            (Utf16::from("slots"), slots.clone()),
        ]),
    );
    assert_eq!(decoded["status"], "ok");
    let recovered = decode(decoded["wire"].as_str().unwrap(), &mut Context::ordinary()).unwrap();
    assert_eq!(recovered, values);
    let refusal = call(
        "decodeBit128Record",
        Value::Object(vec![
            (Utf16::from("binding"), Value::Object(vec![])),
            (Utf16::from("logical"), Value::Object(vec![])),
            (Utf16::from("identity"), identity),
            (
                Utf16::from("slots"),
                Value::Object(vec![(Utf16::from("extra"), Value::string_utf8("x"))]),
            ),
        ]),
    );
    assert_eq!(refusal["status"], "error");
    assert_eq!(refusal["code"], "BIT128_RECORD_SOURCE");

    let mut unknown = binding;
    if let Value::Object(fields) = &mut unknown {
        let extensions = fields
            .iter_mut()
            .find(|(name, _)| name == &Utf16::from("extensions"))
            .unwrap();
        let Value::Object(extensions) = &mut extensions.1 else {
            panic!("extensions object")
        };
        let payload = extensions
            .iter_mut()
            .find(|(name, _)| name == &Utf16::from("umf.binding"))
            .unwrap();
        let Value::Object(payload) = &mut payload.1 else {
            panic!("binding payload object")
        };
        payload.push((
            Utf16::new(vec![0xd800]),
            Value::String(Utf16::new(vec![0xdc00])),
        ));
    }
    let preserved = call(
        "inspectBit128Binding",
        Value::Object(vec![
            (Utf16::from("binding"), unknown),
            (Utf16::from("logical"), logical),
        ]),
    );
    assert_eq!(preserved["status"], "ok");
    let report = decode(
        preserved["wire"].as_str().unwrap(),
        &mut Context::ordinary(),
    )
    .unwrap();
    assert_eq!(get(&report, "valid"), Some(&Value::Bool(true)));
    let diagnostics = match get(&report, "diagnostics").unwrap() {
        Value::Array(items) => items,
        _ => panic!("diagnostics array"),
    };
    assert!(diagnostics.iter().any(|item| {
        get(item, "path")
            == Some(&Value::String(Utf16::new(
                "/extensions/umf.binding/"
                    .encode_utf16()
                    .chain([0xd800])
                    .collect(),
            )))
    }));
}
