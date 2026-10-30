// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::{
    serialization::{read_json_value, Format}, Capabilities, Context, Diagnostic,
    ResourceProfile, SemanticContext, Utf16, Value,
};
use umf_core_wire::{decode, encode, execute_request, execute_request_with_control, transport_context};
use umf_core_wire::core_key_tuple_binding::CoreKeyTupleRuntime;

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

fn resources() -> Value {
    Value::Object(vec![
        (
            "coreSchema".into(),
            parse(include_str!("../../../spec/core/schema.json")),
        ),
        (
            "referenceSchema".into(),
            parse(include_str!("../../../spec/core/semantic-type-reference.schema.json")),
        ),
        (
            "packageSchema".into(),
            parse(include_str!("../../../spec/core/extension-package.schema.json")),
        ),
        (
            "constraints".into(),
            parse(include_str!("../../../spec/metamodel/generated/core-constraints.json")),
        ),
        (
            "domainPolicy".into(),
            parse(include_str!("../../../spec/metamodel/generated/domain-policy.json")),
        ),
    ])
}

#[test]
fn retained_binding_preserves_unknown_extension_payload_without_a_callback() {
    let packet = parse(include_str!("../../../tests/rust-core/fixtures/r5-core-key-tuple/frozen-typescript.json"));
    let cases = get(&packet, "cases").unwrap();
    let case = get(cases, "decimal-scale-2-short-lexical").unwrap();
    let source = get(case, "source").unwrap();
    let mut context = umf_core::Context::ordinary();
    let runtime = CoreKeyTupleRuntime::new(resources(), &mut context).unwrap();
    let prepared = runtime.prepare(source, &mut context).unwrap();
    assert_eq!(prepared.source(), source, "unknown package payload remains byte-for-value equivalent");
    let extension = get(prepared.source(), "extensions").unwrap();
    assert_eq!(get(extension, "future"), get(get(source, "extensions").unwrap(), "future"));
}

#[test]
fn retained_source_snapshot_uses_tagged_transport_scope_for_large_text() {
    let packet = parse(include_str!("../../../tests/rust-core/fixtures/r5-core-key-tuple/frozen-typescript.json"));
    let case = get(get(&packet, "cases").unwrap(), "decimal-scale-2-short-lexical").unwrap();
    let mut source = get(case, "source").unwrap().clone();
    let Value::Object(root) = &mut source else { panic!("source object") };
    let (_, extensions) = root.iter_mut().find(|(key, _)| key == &Utf16::from("extensions")).unwrap();
    let Value::Object(packages) = extensions else { panic!("extensions object") };
    let (_, payload) = packages.iter_mut().find(|(key, _)| key == &Utf16::from("future")).unwrap();
    let Value::Object(payload) = payload else { panic!("future payload") };
    payload.push((Utf16::from("largeText"), Value::string_utf8(&"x".repeat(100_001))));

    let mut context = Context::ordinary();
    let runtime = CoreKeyTupleRuntime::new(resources(), &mut context).unwrap();
    let mut context = Context::ordinary();
    let prepared = runtime.prepare(&source, &mut context).unwrap();
    let mut context = Context::ordinary();
    let wire = prepared.source_wire(&mut context).unwrap();
    let mut context = transport_context();
    let copied = decode(&wire, &mut context).unwrap();
    assert_eq!(copied, source);
}

#[test]
fn retained_binding_reads_bytes_above_tagged_array_limit_and_honors_core_ceiling() {
    let packet = parse(include_str!("../../../tests/rust-core/fixtures/r5-core-key-tuple/frozen-typescript.json"));
    let case = get(get(&packet, "cases").unwrap(), "empty-string-present").unwrap();
    let source = get(case, "source").unwrap();
    let identity = get(case, "identity").unwrap();
    let make_values = |string_len: usize| {
        Value::Array(vec![Value::Object(vec![
            (Utf16::from("string"), Value::string_utf8(&"x".repeat(string_len))),
        ])])
    };
    let mut context = umf_core::Context::ordinary();
    let runtime = CoreKeyTupleRuntime::new(resources(), &mut context).unwrap();
    let mut context = umf_core::Context::ordinary();
    let prepared = runtime.prepare(source, &mut context).unwrap();

    // UTF-8 string tuple encoding adds 10 bytes of profile/count/tag/length
    // overhead at 100,001 bytes (three-byte LEB128 length).
    let values = make_values(99_991);
    let mut context = umf_core::Context::ordinary();
    let receipt = prepared.encode(identity, &values, &mut context).unwrap();
    let bytes_hex = get(&receipt, "bytesHex").unwrap();
    assert_eq!(match bytes_hex { Value::String(text) => text.len() / 2, _ => 0 }, 100_001);
    let mut context = umf_core::Context::ordinary();
    let staged = runtime.prepare_byte_read(&receipt, &mut context).unwrap();
    let mut context = umf_core::Context::ordinary();
    let bytes = staged.read_bytes(source, &mut context).unwrap();
    assert_eq!(bytes.len(), 100_001);

    // At the 4M boundary the string length needs four LEB128 bytes, so the
    // tuple header is 11 bytes.
    let values = make_values(3_999_989);
    let mut context = umf_core::Context::ordinary();
    let receipt = prepared.encode(identity, &values, &mut context).unwrap();
    assert_eq!(match get(&receipt, "bytesHex").unwrap() { Value::String(text) => text.len() / 2, _ => 0 }, 4_000_000);
    let mut context = umf_core::Context::ordinary();
    let staged = runtime.prepare_byte_read(&receipt, &mut context).unwrap();
    let mut context = umf_core::Context::ordinary();
    assert_eq!(staged.read_bytes(source, &mut context).unwrap().len(), 4_000_000);

    let values = make_values(3_999_990);
    let mut context = umf_core::Context::ordinary();
    assert_eq!(prepared.encode(identity, &values, &mut context).unwrap_err().code, "LIMIT");
}

#[test]
fn staged_byte_read_rejects_malformed_receipt_before_current_stage() {
    let mut context = Context::ordinary();
    let runtime = CoreKeyTupleRuntime::new(resources(), &mut context).unwrap();
    let mut context = Context::ordinary();
    let result = runtime.prepare_byte_read(&Value::Object(vec![]), &mut context);
    assert_eq!(result.unwrap_err().code, "KEY_TUPLE_RECEIPT");
}

fn run(op: &str, args: &[(&str, &Value)]) -> (serde_json::Value, Option<Value>) {
    run_with_control(op, args, None)
}

fn run_with_control(
    op: &str,
    args: &[(&str, &Value)],
    max_work: Option<usize>,
) -> (serde_json::Value, Option<Value>) {
    let mut fields = vec![
        ("op".into(), Value::String(Utf16::from(op))),
        ("resources".into(), resources()),
    ];
    fields.extend(
        args.iter()
            .map(|(name, value)| (Utf16::from(*name), (*value).clone())),
    );
    let wire = encode(&Value::Object(fields), &mut transport_context()).unwrap();
    let mut capabilities = NoCapabilities;
    let text = if let Some(max_work) = max_work {
        let mut charged = 0usize;
        let mut control = |amount: usize| {
            charged = charged.saturating_add(amount);
            if charged > max_work {
                Err(umf_core::EngineError::new(
                    "RESOURCE_LIMIT",
                    Utf16::default(),
                    "Host work budget exceeded",
                ))
            } else {
                Ok(())
            }
        };
        execute_request_with_control(&wire, ResourceProfile::Cooperative, &mut capabilities, &mut control)
    } else {
        execute_request(&wire, ResourceProfile::Cooperative, &mut capabilities)
    };
    let response: serde_json::Value = serde_json::from_str(&text).unwrap();
    let decoded = if response["status"] == "ok" {
        Some(
            decode(
                response["wire"]
                    .as_str()
                    .unwrap_or_else(|| panic!("successful response lacks wire: {response}")),
                &mut transport_context(),
            )
            .unwrap_or_else(|error| panic!("invalid result wire: {error}; envelope={response}")),
        )
    } else {
        None
    };
    (response, decoded)
}

fn assert_expected(response: &serde_json::Value, actual: Option<Value>, expected: &Value, name: &str) {
    if let Some(value) = get(expected, "value") {
        assert_eq!(response["status"], "ok", "{name}: {response}");
        assert_eq!(actual.as_ref(), Some(value), "{name}");
    } else {
        let error = get(expected, "error").expect("frozen error");
        let code = get(error, "code").and_then(|value| match value {
            Value::String(text) => text.to_utf8().ok(),
            _ => None,
        }).unwrap();
        let message = get(error, "message").and_then(|value| match value {
            Value::String(text) => text.to_utf8().ok(),
            _ => None,
        }).unwrap();
        let path_units = get(error, "path").and_then(|value| match value {
            Value::String(text) => Some(text.units().to_vec()),
            _ => None,
        }).unwrap();
        assert_eq!(response["status"], "error", "{name}: {response}");
        assert_eq!(response["code"], code, "{name}");
        assert_eq!(response["messageUnits"], serde_json::json!(message.encode_utf16().collect::<Vec<_>>()), "{name}");
        assert_eq!(response["pathUnits"], serde_json::json!(path_units), "{name}");
    }
}

#[test]
fn wire_key_tuple_operations_match_the_frozen_encoder_and_verifier_packet() {
    let frozen = parse(include_str!("../../../tests/rust-core/fixtures/r5-core-key-tuple/frozen-typescript.json"));
    let cases = get(&frozen, "cases").unwrap();
    let outcomes = get(&frozen, "outcomes").unwrap();
    let Value::Object(rows) = cases else { panic!("frozen cases") };
    for (name, case) in rows {
        let id = name.to_utf8().unwrap();
        eprintln!("key tuple packet case: {id}");
        if id == "integer-host-number" {
            assert!(get(case, "rustBoundary").is_some());
            continue;
        }
        let mut args = vec![
            ("source", get(case, "source").unwrap()),
            ("identity", get(case, "identity").unwrap()),
            ("values", get(case, "values").unwrap()),
        ];
        let profile = get(case, "profile");
        let options = profile.map(|profile| Value::Object(vec![("profile".into(), profile.clone())]));
        if let Some(options) = &options { args.push(("options", options)); }
        let (response, actual) = run("model/encodeCoreKeyTuple", &args);
        assert_expected(&response, actual.clone(), get(outcomes, &id).unwrap(), &id);
        if let Some(receipt) = actual {
            let current = get(&receipt, "source").unwrap();
            let (bytes_response, bytes) = run("model/readCoreKeyTupleBytes", &[("receipt", &receipt), ("current", current)]);
            assert_eq!(bytes_response["status"], "ok", "read bytes: {id}");
            let hex = get(&receipt, "bytesHex").and_then(|v| match v { Value::String(text) => text.to_utf8().ok(), _ => None }).unwrap();
            let expected = Value::Array((0..hex.len()).step_by(2).map(|offset| {
                Value::Number(u8::from_str_radix(&hex[offset..offset + 2], 16).unwrap() as f64)
            }).collect());
            assert_eq!(bytes.as_ref(), Some(&expected), "read bytes: {id}");
        }
    }

    let cases = get(&frozen, "verificationCases").unwrap();
    let outcomes = get(&frozen, "verificationOutcomes").unwrap();
    let Value::Object(rows) = cases else { panic!("verification cases") };
    for (name, case) in rows {
        let (response, actual) = run("model/verifyCoreKeyTuple", &[
            ("receipt", get(case, "receipt").unwrap()),
            ("current", get(case, "current").unwrap()),
        ]);
        let id = name.to_utf8().unwrap();
        assert_expected(&response, actual, get(outcomes, &id).unwrap(), &id);
    }
}

#[test]
fn prepared_tuple_operations_retain_and_verify_the_source() {
    let frozen = parse(include_str!("../../../tests/rust-core/fixtures/r5-core-key-tuple/frozen-typescript.json"));
    let case = get(get(&frozen, "cases").unwrap(), "decimal-scale-2-short-lexical").unwrap();
    let source = get(case, "source").unwrap();
    let (response, prepared_source) = run("model/prepareCoreKeyTuples", &[("source", source)]);
    assert_eq!(response["status"], "ok", "{response}");
    let prepared_source = prepared_source.unwrap();
    assert_eq!(prepared_source, *source);
    let (response, receipt) = run("model/encodePreparedCoreKeyTuple", &[
        ("source", &prepared_source),
        ("identity", get(case, "identity").unwrap()),
        ("values", get(case, "values").unwrap()),
    ]);
    assert_eq!(response["status"], "ok", "{response}");
    let receipt = receipt.unwrap();
    assert_eq!(receipt, *get(get(&frozen, "outcomes").unwrap(), "decimal-scale-2-short-lexical").and_then(|value| get(value, "value")).unwrap());
    let (response, verified) = run("model/verifyPreparedCoreKeyTuple", &[
        ("source", &prepared_source),
        ("receipt", &receipt),
    ]);
    assert_eq!(response["status"], "ok", "{response}");
    assert_eq!(verified.unwrap(), receipt);
}

#[test]
fn prepared_source_and_byte_result_are_metered_before_wire_output_allocation() {
    let frozen = parse(include_str!("../../../tests/rust-core/fixtures/r5-core-key-tuple/frozen-typescript.json"));
    let case = get(get(&frozen, "cases").unwrap(), "decimal-scale-2-short-lexical").unwrap();
    let source = get(case, "source").unwrap();
    let (prepared_response, _) = run_with_control("model/prepareCoreKeyTuples", &[("source", source)], Some(0));
    assert_eq!(prepared_response["status"], "error");
    assert_eq!(prepared_response["code"], "RESOURCE_LIMIT");

    let string_case = get(get(&frozen, "cases").unwrap(), "unicode-precomposed").unwrap();
    let source = get(string_case, "source").unwrap();
    let identity = get(string_case, "identity").unwrap();
    let Value::Array(values) = get(string_case, "values").unwrap().clone() else { panic!("tuple values") };
    let Value::Object(mut wrapper) = values[0].clone() else { panic!("typed wrapper") };
    wrapper[0].1 = Value::String(Utf16::new(vec![b'x' as u16; 100_001]));
    let long_values = Value::Array(vec![Value::Object(wrapper)]);
    let (response, receipt) = run("model/encodeCoreKeyTuple", &[
        ("source", source),
        ("identity", identity),
        ("values", &long_values),
    ]);
    assert_eq!(response["status"], "ok", "{response}");
    let receipt = receipt.unwrap();
    let current = get(&receipt, "source").unwrap();
    let (response, _) = run("model/readCoreKeyTupleBytes", &[("receipt", &receipt), ("current", current)]);
    assert_eq!(response["status"], "error");
    assert_eq!(response["code"], "LIMIT");
    assert_eq!(response["pathUnits"], serde_json::json!([47, 98, 121, 116, 101, 115]));

    let (response, _) = run_with_control("model/readCoreKeyTupleBytes", &[("receipt", &receipt), ("current", current)], Some(0));
    assert_eq!(response["status"], "error");
    assert_eq!(response["code"], "RESOURCE_LIMIT");
}
