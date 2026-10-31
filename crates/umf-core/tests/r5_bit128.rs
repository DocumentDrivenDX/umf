// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::{bit128 as b, Context, Limits, ResourceProfile, Utf16, Value};

fn string(s: &str) -> Value {
    Value::string_utf8(s)
}
fn obj(pairs: Vec<(&str, Value)>) -> Value {
    Value::Object(
        pairs
            .into_iter()
            .map(|(k, v)| (Utf16::from(k), v))
            .collect(),
    )
}
fn bits(h: &str) -> Value {
    obj(vec![("profile", string("umf-128/1")), ("hex", string(h))])
}
fn get<'a>(v: &'a Value, k: &str) -> &'a Value {
    match v {
        Value::Object(m) => m
            .iter()
            .find(|(key, _)| key == &Utf16::from(k))
            .map(|(_, v)| v)
            .unwrap(),
        _ => panic!(),
    }
}
fn st(v: &Value) -> String {
    if let Value::String(s) = v {
        s.to_utf8().unwrap()
    } else {
        panic!("not string: {v:?}")
    }
}
fn ctx() -> Context<'static> {
    Context::ordinary()
}

#[test]
fn independent_python_vectors_cover_every_operation_and_uuid_roundtrip() {
    let corpus: serde_json::Value = serde_json::from_str(include_str!(
        "../../../fixtures/validation/uuid/bit128-oracle.json"
    ))
    .unwrap();
    for row in corpus["cases"].as_array().unwrap() {
        let h = row["hex"].as_str().unwrap();
        let mut c = ctx();
        let parsed = b::parse_bits128(&string(&h.to_ascii_uppercase()), &mut c).unwrap();
        assert_eq!(st(get(&parsed, "hex")), h);
        let out = b::bits128_to_bytes(&parsed, &mut c).unwrap();
        let expected: Vec<Value> = h
            .as_bytes()
            .chunks_exact(2)
            .map(|pair| {
                Value::Number(
                    u8::from_str_radix(std::str::from_utf8(pair).unwrap(), 16).unwrap() as f64,
                )
            })
            .collect();
        assert_eq!(out, Value::Array(expected.clone()));
        assert_eq!(
            b::bits128_from_bytes(&Value::Array(expected), &mut c).unwrap(),
            parsed
        );
        let back = b::bits128_from_bytes(&out, &mut c).unwrap();
        assert_eq!(back, parsed);
        let uu = b::parse_uuid(&string(row["uuid"].as_str().unwrap()), &mut c).unwrap();
        assert_eq!(b::uuid_to_bits128(&uu, &mut c).unwrap(), parsed);
        assert_eq!(b::uuid_from_bits128(&parsed, &mut c).unwrap(), uu);
        let cmp = b::compare_bits128(&parsed, &parsed, &mut c).unwrap();
        assert_eq!(cmp, Value::Number(0.0));
        for (signed, key) in [(false, "unsigned"), (true, "signed")] {
            let flag = Value::Bool(signed);
            let words = b::bits128_to_words(&parsed, &flag, &mut c).unwrap();
            assert_eq!(st(get(&words, "high")), row[key]["high"].as_str().unwrap());
            assert_eq!(st(get(&words, "low")), row[key]["low"].as_str().unwrap());
            assert_eq!(
                b::bits128_from_words(&words, &flag, &mut c).unwrap(),
                parsed
            );
            let integer = b::bits128_to_integer(&parsed, &flag, &mut c).unwrap();
            let token = if signed {
                row["signedInteger"].as_str().unwrap()
            } else {
                row["integer"].as_str().unwrap()
            };
            assert_eq!(st(get(&integer, "integerToken")), token);
            let back =
                b::bits128_from_integer(&obj(vec![("integerToken", string(token))]), &flag, &mut c)
                    .unwrap();
            assert_eq!(back, parsed);
        }
    }
}

#[test]
fn frozen_typescript_predecessor_edge_refusals_match_exactly() {
    let corpus: serde_json::Value = serde_json::from_str(include_str!(
        "../../../tests/rust-core/fixtures/r5/bit128/frozen-predecessor-edge-vectors.json"
    ))
    .unwrap();
    for case in corpus["cases"].as_array().unwrap() {
        let signed = Value::Bool(case["signed"].as_bool().unwrap_or(false));
        let actual = match case["operation"].as_str().unwrap() {
            "integer" => b::bits128_from_integer(
                &obj(vec![(
                    "integerToken",
                    string(case["token"].as_str().unwrap()),
                )]),
                &signed,
                &mut ctx(),
            ),
            "words" => b::bits128_from_words(
                &obj(vec![
                    ("high", string(case["high"].as_str().unwrap())),
                    ("low", string(case["low"].as_str().unwrap())),
                ]),
                &signed,
                &mut ctx(),
            ),
            "bits-snapshot" => {
                let v = &case["value"];
                b::bits128_to_bytes(
                    &obj(vec![
                        ("profile", string(v["profile"].as_str().unwrap())),
                        ("hex", Value::Number(v["hex"].as_f64().unwrap())),
                    ]),
                    &mut ctx(),
                )
            }
            "uuid-snapshot" => {
                let v = &case["value"];
                b::uuid_to_bits128(
                    &obj(vec![
                        ("profile", string(v["profile"].as_str().unwrap())),
                        ("hex", string(v["hex"].as_str().unwrap())),
                        (
                            "canonicalText",
                            string(v["canonicalText"].as_str().unwrap()),
                        ),
                        ("unexpected", Value::Null),
                    ]),
                    &mut ctx(),
                )
            }
            "uuid-snapshot-shape" => match case["shape"].as_str().unwrap() {
                "null" => b::uuid_to_bits128(&Value::Null, &mut ctx()),
                "three" => b::uuid_to_bits128(
                    &obj(vec![
                        ("profile", string("umf-128/1")),
                        ("hex", string(&"0".repeat(32))),
                        (
                            "canonicalText",
                            string("00000000-0000-0000-0000-000000000000"),
                        ),
                    ]),
                    &mut ctx(),
                ),
                "five" => b::uuid_to_bits128(
                    &obj(vec![
                        ("profile", string("umf-128/1")),
                        ("hex", string(&"0".repeat(32))),
                        (
                            "canonicalText",
                            string("00000000-0000-0000-0000-000000000000"),
                        ),
                        (
                            "originalText",
                            string("00000000-0000-0000-0000-000000000000"),
                        ),
                        ("extra", Value::Null),
                    ]),
                    &mut ctx(),
                ),
                other => panic!("unknown UUID shape {other}"),
            },
            other => panic!("unknown frozen operation {other}"),
        };
        if let Some(expected) = case.get("error") {
            let error = actual.unwrap_err();
            assert_eq!(error.code, expected["code"].as_str().unwrap());
            assert_eq!(
                error.message.to_utf8().unwrap(),
                expected["message"].as_str().unwrap()
            );
        } else {
            let expected = case.get("result").unwrap();
            assert_eq!(actual.unwrap(), bits(expected["hex"].as_str().unwrap()));
        }
    }
}

#[test]
fn strict_shapes_grammar_and_exact_error_codes() {
    let mut c = ctx();
    for (input, code) in [
        ("0".repeat(31), "BIT128_SYNTAX"),
        (format!("{}\n", "0".repeat(32)), "BIT128_SYNTAX"),
        ("z".repeat(32), "BIT128_SYNTAX"),
    ] {
        assert_eq!(
            b::parse_bits128(&string(&input), &mut c).unwrap_err().code,
            code
        );
    }
    assert_eq!(
        b::parse_uuid(&string("00000000-0000-0000-0000-000000000000\n"), &mut c)
            .unwrap_err()
            .code,
        "UUID_SYNTAX"
    );
    let upper_uuid = "00112233-4455-6677-8899-aabbccddeeff".to_ascii_uppercase();
    let parsed_uuid = b::parse_uuid(&string(&upper_uuid), &mut c).unwrap();
    assert_eq!(st(get(&parsed_uuid, "originalText")), upper_uuid);
    assert_eq!(
        st(get(&parsed_uuid, "canonicalText")),
        "00112233-4455-6677-8899-aabbccddeeff"
    );
    assert_eq!(
        b::bits128_to_bytes(
            &obj(vec![
                ("profile", string("umf-128/1")),
                ("hex", string(&"0".repeat(32))),
                ("extra", Value::Null)
            ]),
            &mut c
        )
        .unwrap_err()
        .code,
        "BIT128_VALUE"
    );
    let bad_profile = obj(vec![
        ("profile", string("other")),
        ("hex", string(&"0".repeat(32))),
    ]);
    assert_eq!(
        b::bits128_to_bytes(&bad_profile, &mut c)
            .unwrap_err()
            .message
            .to_utf8()
            .unwrap(),
        "Unknown bit profile"
    );
    let wrong_hex_type = obj(vec![
        ("profile", string("other")),
        ("hex", Value::Number(0.0)),
    ]);
    assert_eq!(
        b::bits128_to_bytes(&wrong_hex_type, &mut c)
            .unwrap_err()
            .message
            .to_utf8()
            .unwrap(),
        "Unknown bit profile"
    );
    let uuid_text = "00112233-4455-6677-8899-aabbccddeeff";
    let mut forged = b::parse_uuid(&string(uuid_text), &mut c).unwrap();
    if let Value::Object(fields) = &mut forged {
        fields
            .iter_mut()
            .find(|(k, _)| k == &Utf16::from("canonicalText"))
            .unwrap()
            .1 = string("wrong");
    }
    assert_eq!(
        b::uuid_to_bits128(&forged, &mut c)
            .unwrap_err()
            .message
            .to_utf8()
            .unwrap(),
        "Inconsistent UUID snapshot"
    );
    let malformed_uuid_snapshot = obj(vec![
        ("profile", string("umf-128/1")),
        ("hex", string(&"0".repeat(32))),
        ("canonicalText", string(uuid_text)),
        ("unexpected", Value::Null),
    ]);
    assert_eq!(
        b::uuid_to_bits128(&malformed_uuid_snapshot, &mut c)
            .unwrap_err()
            .message
            .to_utf8()
            .unwrap(),
        "Unknown UUID snapshot members or accessors"
    );
    for word in ["+1", "01", "-0", "1e0", "--1", "18446744073709551616"] {
        let v = obj(vec![("high", string(word)), ("low", string("0"))]);
        let failure = b::bits128_from_words(&v, &Value::Bool(false), &mut c).unwrap_err();
        assert_eq!(
            failure.code,
            if word == "18446744073709551616" {
                "BIT128_RANGE"
            } else {
                "BIT128_SYNTAX"
            }
        );
    }
    assert_eq!(
        b::bits128_from_integer(
            &obj(vec![("integerToken", string("-0"))]),
            &Value::Bool(false),
            &mut c
        )
        .unwrap_err()
        .code,
        "BIT128_RANGE"
    );
    let exp = b::bits128_from_integer(
        &obj(vec![("integerToken", string("1.00e2"))]),
        &Value::Bool(false),
        &mut c,
    )
    .unwrap();
    assert_eq!(st(get(&exp, "hex")), format!("{}64", "0".repeat(30)));
    for token in ["1.1", "1e-1", "340282366920938463463374607431768211456"] {
        assert_eq!(
            b::bits128_from_integer(
                &obj(vec![("integerToken", string(token))]),
                &Value::Bool(false),
                &mut c
            )
            .unwrap_err()
            .code,
            "BIT128_RANGE"
        );
    }
    let enormous = "9223372036854775807";
    assert_eq!(
        b::bits128_from_integer(
            &obj(vec![("integerToken", string(&format!("1.00e-{enormous}")))]),
            &Value::Bool(false),
            &mut c
        )
        .unwrap_err()
        .message
        .to_utf8()
        .unwrap(),
        "Nonintegral value"
    );
    assert_eq!(
        b::bits128_from_integer(
            &obj(vec![("integerToken", string(&format!("1e{enormous}")))]),
            &Value::Bool(false),
            &mut c
        )
        .unwrap_err()
        .message
        .to_utf8()
        .unwrap(),
        "Integer outside 128-bit domain"
    );
    assert_eq!(
        st(get(
            &b::bits128_from_integer(
                &obj(vec![("integerToken", string("0e9223372036854775808"))]),
                &Value::Bool(false),
                &mut c
            )
            .unwrap(),
            "hex"
        )),
        "0".repeat(32)
    );
    assert_eq!(
        b::bits128_from_integer(
            &obj(vec![("integerToken", string("-0e9223372036854775808"))]),
            &Value::Bool(false),
            &mut c
        )
        .unwrap_err()
        .message
        .to_utf8()
        .unwrap(),
        "Negative zero loses sign"
    );
    assert_eq!(
        b::bits128_from_integer(
            &obj(vec![(
                "integerToken",
                string(&format!("1e+{}", "0".repeat(32)))
            )]),
            &Value::Bool(false),
            &mut c
        )
        .unwrap_err()
        .message
        .to_utf8()
        .unwrap(),
        "Exponent exceeds bound"
    );
    assert_eq!(
        b::bits128_to_words(&bits(&"0".repeat(32)), &Value::Null, &mut c)
            .unwrap_err()
            .code,
        "BIT128_TYPE"
    );
    let lower = bits(&format!("7{}", "f".repeat(31)));
    let upper = bits(&format!("8{}", "0".repeat(31)));
    assert_eq!(
        b::compare_bits128(&lower, &upper, &mut c).unwrap(),
        Value::Number(-1.0)
    );
    assert_eq!(
        b::compare_bits128(&upper, &lower, &mut c).unwrap(),
        Value::Number(1.0)
    );
}

#[test]
fn utf16_text_admission_metering_cancellation_and_limits_refuse() {
    let mut surrogate = Context::ordinary();
    let lone = Value::String(Utf16::new(vec![0xd800; 32]));
    assert_eq!(
        b::parse_bits128(&lone, &mut surrogate).unwrap_err().code,
        "BIT128_SYNTAX"
    );

    let limits = Limits {
        max_text_units: 8,
        ..Limits::ordinary()
    };
    let mut small = Context::with_limits(ResourceProfile::Cooperative, limits).unwrap();
    assert_eq!(
        b::parse_bits128(&string(&"0".repeat(32)), &mut small)
            .unwrap_err()
            .code,
        "LIMIT"
    );

    let mut meter_calls = 0;
    let mut meter = |_: usize| {
        meter_calls += 1;
        Err(umf_core::EngineError::new(
            "HOST_BUDGET",
            Utf16::default(),
            "stop",
        ))
    };
    let mut metered = Context::ordinary().with_meter(&mut meter);
    assert_eq!(
        b::parse_bits128(&string(&"0".repeat(32)), &mut metered)
            .unwrap_err()
            .code,
        "HOST_BUDGET"
    );
    assert_eq!(meter_calls, 1);

    let four_million = string(&"x".repeat(4_000_000));
    let mut low_meter = |_: usize| {
        Err(umf_core::EngineError::new(
            "HOST_BUDGET",
            Utf16::default(),
            "stop before width scan",
        ))
    };
    let mut low_ctx = Context::ordinary().with_meter(&mut low_meter);
    assert_eq!(
        b::parse_bits128(&four_million, &mut low_ctx)
            .unwrap_err()
            .code,
        "HOST_BUDGET"
    );

    let cancelled = true;
    let mut check = || cancelled;
    let mut cancelled_ctx = Context::ordinary().with_cancellation(&mut check);
    assert_eq!(
        b::parse_bits128(&string(&"0".repeat(32)), &mut cancelled_ctx)
            .unwrap_err()
            .code,
        "CANCELLED"
    );
}
