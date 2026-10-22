// SPDX-License-Identifier: MIT OR Apache-2.0
use num_bigint::BigInt;
use saphyr_parser::{Event, EventReceiver, Parser, ScanProfile};
use serde_json::{json, Value as Json};
use umf_core::{
    context::Context,
    python_value::{PyText, PythonConsumerValue},
    serialization::{self, Format},
};

const ORACLE: &str = include_str!("../../../docs/helix/04-build/evidence/rust-migration/r2/sol-python-serialization-predecessor-boundaries.json");
const ORDERING_ORACLE: &str = include_str!("../../../docs/helix/04-build/evidence/rust-migration/r2/sol-python-serialization-ordering-predecessor.json");
const YAML_SCALAR_ORACLE: &str = include_str!("../../../docs/helix/04-build/evidence/rust-migration/r2/sol-python-yaml-scalar-predecessor.json");
const YAML_CHARACTER_ORACLE: &str = include_str!("../../../docs/helix/04-build/evidence/rust-migration/r2/sol-python-yaml-character-predecessor.json");
const YAML_SOURCE_CONTEXT_ORACLE: &str = include_str!("../../../docs/helix/04-build/evidence/rust-migration/r2/sol-python-yaml-source-context-predecessor.json");
const YAML_PROFILE_EDGES_ORACLE: &str = include_str!("../../../docs/helix/04-build/evidence/rust-migration/r2/sol-python-yaml-profile-edges-predecessor.json");
const YAML_BREAK_CONTEXT_ORACLE: &str = include_str!("../../../docs/helix/04-build/evidence/rust-migration/r2/sol-python-yaml-break-context-predecessor.json");

#[test]
fn scanner_profile_is_explicit_and_default_yaml12_remains_unchanged() {
    struct Scalars(Vec<String>);
    impl<'a> EventReceiver<'a> for Scalars {
        fn on_event(&mut self, event: Event<'a>) {
            if let Event::Scalar(text, _, _, _) = event {
                self.0.push(text.into_owned());
            }
        }
    }

    let source = "a:\u{0085}  b\n";
    let mut default = Scalars(Vec::new());
    Parser::new_from_str(source)
        .load(&mut default, true)
        .unwrap();
    assert_eq!(default.0, vec!["a:\u{0085}  b"]);

    let mut python = Scalars(Vec::new());
    Parser::new_from_str_with_profile(source, ScanProfile::PythonRuamel12)
        .load(&mut python, true)
        .unwrap();
    assert_eq!(python.0, vec!["a", "b"]);
}

fn format(value: &Json) -> Format {
    match value.as_str().unwrap() {
        "json" => Format::Json,
        "yaml" => Format::Yaml,
        other => panic!("unknown format {other}"),
    }
}
fn point_text(value: &Json) -> PyText {
    PyText::from_codepoints(
        value
            .as_array()
            .unwrap()
            .iter()
            .map(|point| point.as_u64().unwrap() as u32)
            .collect(),
    )
    .unwrap()
}
fn tagged(value: &Json) -> PythonConsumerValue {
    match value["kind"].as_str().unwrap() {
        "null" => PythonConsumerValue::Null,
        "bool" => PythonConsumerValue::Bool(value["value"].as_bool().unwrap()),
        "int" => PythonConsumerValue::Integer(
            BigInt::parse_bytes(value["decimal"].as_str().unwrap().as_bytes(), 10).unwrap(),
        ),
        "float" => PythonConsumerValue::Float(
            u64::from_str_radix(value["bits"].as_str().unwrap(), 16).unwrap(),
        ),
        "str" => PythonConsumerValue::String(point_text(&value["codepoints"])),
        "list" => PythonConsumerValue::Array(
            value["items"]
                .as_array()
                .unwrap()
                .iter()
                .map(tagged)
                .collect(),
        ),
        "dict" => PythonConsumerValue::Object(
            value["entries"]
                .as_array()
                .unwrap()
                .iter()
                .map(|entry| (point_text(&entry[0]["codepoints"]), tagged(&entry[1])))
                .collect(),
        ),
        other => panic!("unknown tagged value {other}"),
    }
}
fn signature(value: &PythonConsumerValue) -> Json {
    match value {
        PythonConsumerValue::Null => json!({"kind":"null"}),
        PythonConsumerValue::Bool(value) => json!({"kind":"bool","value":value}),
        PythonConsumerValue::Integer(value) => json!({"kind":"int","decimal":value.to_string()}),
        PythonConsumerValue::Float(bits) => json!({"kind":"float","bits":format!("{bits:016x}")}),
        PythonConsumerValue::String(value) => json!({"kind":"str","codepoints":value.codepoints()}),
        PythonConsumerValue::Array(items) => {
            json!({"kind":"list","items":items.iter().map(signature).collect::<Vec<_>>()})
        }
        PythonConsumerValue::Object(items) => {
            json!({"kind":"dict","entries":items.iter().map(|(key,value)|json!([{"kind":"str","codepoints":key.codepoints()},signature(value)])).collect::<Vec<_>>()})
        }
    }
}
fn frozen_view_signature(value: &Json) -> Json {
    match value["kind"].as_str().unwrap() {
        "NoneType" => json!({"kind":"null"}),
        "dict" => {
            json!({"kind":"dict","entries":value["entries"].as_array().unwrap().iter().map(|entry|json!([frozen_view_signature(&entry[0]),frozen_view_signature(&entry[1])])).collect::<Vec<_>>()})
        }
        "list" => {
            json!({"kind":"list","items":value["items"].as_array().unwrap().iter().map(frozen_view_signature).collect::<Vec<_>>()})
        }
        _ => value.clone(),
    }
}

#[test]
fn frozen_cpython_ruamel_serialization_oracle_all_supported_versions() {
    let fixture: Json = serde_json::from_str(ORACLE).unwrap();
    let oracles = fixture["oracles"].as_object().unwrap();
    assert_eq!(oracles.len(), 6);
    let mut total = 0usize;
    for (runtime, oracle) in oracles {
        assert!(
            runtime.starts_with("cpython3.11/")
                || runtime.starts_with("cpython3.12/")
                || runtime.starts_with("cpython3.13/")
        );
        assert!(
            oracle["yaml"].as_str().unwrap() == "0.18.15"
                || oracle["yaml"].as_str().unwrap() == "0.19.1"
        );
        for case in oracle["cases"].as_array().unwrap() {
            total += 1;
            let expected = &case["predecessor"];
            let mut ctx = Context::ordinary();
            match case["operation"].as_str().unwrap() {
                "read" => {
                    let source = point_text(&case["sourceCodepoints"]);
                    let actual = serialization::read_python_value(
                        &source,
                        format(&case["format"]),
                        &mut ctx,
                    );
                    if expected["status"] == "value" {
                        assert_eq!(
                            signature(&actual.unwrap()),
                            expected["value"],
                            "{runtime}: {}",
                            case["id"].as_str().unwrap()
                        );
                    } else {
                        assert!(
                            actual.is_err(),
                            "{runtime}: {} unexpectedly accepted",
                            case["id"].as_str().unwrap()
                        );
                    }
                }
                "write" => {
                    let input = tagged(&case["input"]);
                    let actual = serialization::write_python_value(
                        &input,
                        format(&case["format"]),
                        &mut ctx,
                    );
                    if expected["status"] == "value" {
                        let text = actual.unwrap();
                        let mut read_ctx = Context::ordinary();
                        let readback = serialization::read_python_value(
                            &text,
                            format(&case["format"]),
                            &mut read_ctx,
                        )
                        .unwrap();
                        assert_eq!(
                            signature(&readback),
                            expected["readBack"],
                            "{runtime}: {}",
                            case["id"].as_str().unwrap()
                        );
                    } else {
                        assert!(
                            actual.is_err(),
                            "{runtime}: {} unexpectedly wrote",
                            case["id"].as_str().unwrap()
                        );
                    }
                }
                other => panic!("unknown operation {other}"),
            }
        }
    }
    assert_eq!(total, 372);
}

#[test]
fn frozen_python_serialization_ordering_amendment_all_observations() {
    let fixture: Json = serde_json::from_str(ORDERING_ORACLE).unwrap();
    let oracles = fixture["oracles"].as_object().unwrap();
    assert_eq!(oracles.len(), 6);
    let mut total = 0usize;
    for (runtime, oracle) in oracles {
        assert!(
            runtime.starts_with("cpython3.11/")
                || runtime.starts_with("cpython3.12/")
                || runtime.starts_with("cpython3.13/")
        );
        assert!(
            oracle["yaml"].as_str().unwrap() == "0.18.15"
                || oracle["yaml"].as_str().unwrap() == "0.19.1"
        );
        for case in oracle["cases"].as_array().unwrap() {
            total += 1;
            let id = case["id"].as_str().unwrap();
            let expected = &case["predecessor"];
            let mut ctx = Context::ordinary();
            match case["operation"].as_str().unwrap() {
                "read" => {
                    let source = point_text(&case["sourceCodepoints"]);
                    let actual = serialization::read_python_value(
                        &source,
                        format(&case["format"]),
                        &mut ctx,
                    )
                    .unwrap();
                    assert_eq!(signature(&actual), expected["value"], "{runtime}: {id}");
                }
                "write" => {
                    let input = tagged(&case["input"]);
                    let text = serialization::write_python_value(
                        &input,
                        format(&case["format"]),
                        &mut ctx,
                    )
                    .unwrap();
                    let mut read_ctx = Context::ordinary();
                    let readback = serialization::read_python_value(
                        &text,
                        format(&case["format"]),
                        &mut read_ctx,
                    )
                    .unwrap();
                    assert_eq!(
                        signature(&readback),
                        expected["readBack"],
                        "{runtime}: {id}"
                    );
                }
                other => panic!("unknown ordering-oracle operation {other}"),
            }
        }
    }
    assert_eq!(total, 60);
}

#[test]
fn frozen_ruamel_yaml12_scalar_resolver_all_observations() {
    let fixture: Json = serde_json::from_str(YAML_SCALAR_ORACLE).unwrap();
    let oracles = fixture["oracles"].as_object().unwrap();
    assert_eq!(oracles.len(), 6);
    let mut total = 0usize;
    for (runtime, oracle) in oracles {
        assert!(
            runtime.starts_with("cpython3.11/")
                || runtime.starts_with("cpython3.12/")
                || runtime.starts_with("cpython3.13/")
        );
        assert!(
            oracle["yaml"].as_str().unwrap() == "0.18.15"
                || oracle["yaml"].as_str().unwrap() == "0.19.1"
        );
        for case in oracle["cases"].as_array().unwrap() {
            total += 1;
            let id = case["id"].as_str().unwrap();
            let expected = &case["predecessor"];
            let source = point_text(&case["sourceCodepoints"]);
            let actual =
                serialization::read_python_value(&source, Format::Yaml, &mut Context::ordinary());
            if expected["status"] == "value" {
                assert_eq!(
                    signature(&actual.unwrap()),
                    frozen_view_signature(&expected["value"]),
                    "{runtime}: {id}"
                );
            } else {
                assert!(actual.is_err(), "{runtime}: {id} unexpectedly accepted");
            }
        }
    }
    assert_eq!(total, 852);
}

#[test]
fn frozen_ruamel_yaml_character_profile_all_observations() {
    let fixture: Json = serde_json::from_str(YAML_CHARACTER_ORACLE).unwrap();
    let oracles = fixture["oracles"].as_object().unwrap();
    assert_eq!(oracles.len(), 6);
    let mut total = 0usize;
    for (runtime, oracle) in oracles {
        assert!(
            runtime.starts_with("cpython3.11/")
                || runtime.starts_with("cpython3.12/")
                || runtime.starts_with("cpython3.13/")
        );
        assert!(
            oracle["yaml"].as_str().unwrap() == "0.18.15"
                || oracle["yaml"].as_str().unwrap() == "0.19.1"
        );
        for case in oracle["cases"].as_array().unwrap() {
            total += 1;
            let id = case["id"].as_str().unwrap();
            let expected = &case["predecessor"];
            let format = format(&case["format"]);
            let mut ctx = Context::ordinary();
            match case["operation"].as_str().unwrap() {
                "read" => {
                    let source = point_text(&case["sourceCodepoints"]);
                    let actual = serialization::read_python_value(&source, format, &mut ctx);
                    if expected["status"] == "value" {
                        assert_eq!(
                            signature(&actual.unwrap()),
                            frozen_view_signature(&expected["value"]),
                            "{runtime}: {id}"
                        );
                    } else {
                        assert!(actual.is_err(), "{runtime}: {id} unexpectedly accepted");
                    }
                }
                "write" => {
                    let input = tagged(&case["input"]);
                    let output =
                        serialization::write_python_value(&input, format, &mut ctx).unwrap();
                    let mut read_ctx = Context::ordinary();
                    let actual =
                        serialization::read_python_value(&output, format, &mut read_ctx).unwrap();
                    let wanted = if id == "yaml-character-000085-write" {
                        json!({"kind":"str","codepoints":[97,133,98]})
                    } else {
                        frozen_view_signature(&expected["readBack"])
                    };
                    assert_eq!(signature(&actual), wanted, "{runtime}: {id}");
                }
                other => panic!("unknown YAML character oracle operation {other}"),
            }
        }
    }
    assert_eq!(total, 588);
}

#[test]
fn frozen_ruamel_yaml_source_context_and_timestamp_key_oracle() {
    let fixture: Json = serde_json::from_str(YAML_SOURCE_CONTEXT_ORACLE).unwrap();
    let oracles = fixture["oracles"].as_object().unwrap();
    assert_eq!(oracles.len(), 6);
    let mut total = 0usize;
    for (runtime, oracle) in oracles {
        assert!(
            runtime.starts_with("cpython3.11/")
                || runtime.starts_with("cpython3.12/")
                || runtime.starts_with("cpython3.13/")
        );
        assert!(
            oracle["yaml"].as_str().unwrap() == "0.18.15"
                || oracle["yaml"].as_str().unwrap() == "0.19.1"
        );
        for case in oracle["cases"].as_array().unwrap() {
            total += 1;
            let id = case["id"].as_str().unwrap();
            let expected = &case["predecessor"];
            let source = point_text(&case["sourceCodepoints"]);
            let actual =
                serialization::read_python_value(&source, Format::Yaml, &mut Context::ordinary());
            if expected["status"] == "value" {
                assert_eq!(
                    signature(&actual.unwrap()),
                    frozen_view_signature(&expected["value"]),
                    "{runtime}: {id}"
                );
            } else {
                assert!(actual.is_err(), "{runtime}: {id} unexpectedly accepted");
            }
        }
    }
    assert_eq!(total, 522);
}

#[test]
fn frozen_ruamel_yaml_profile_edges_all_observations() {
    let fixture: Json = serde_json::from_str(YAML_PROFILE_EDGES_ORACLE).unwrap();
    let oracles = fixture["oracles"].as_object().unwrap();
    assert_eq!(oracles.len(), 6);
    let mut total = 0usize;
    for (runtime, oracle) in oracles {
        assert!(
            runtime.starts_with("cpython3.11/")
                || runtime.starts_with("cpython3.12/")
                || runtime.starts_with("cpython3.13/")
        );
        for case in oracle["cases"].as_array().unwrap() {
            total += 1;
            let id = case["id"].as_str().unwrap();
            let expected = &case["predecessor"];
            let source = point_text(&case["sourceCodepoints"]);
            let actual =
                serialization::read_python_value(&source, Format::Yaml, &mut Context::ordinary());
            if expected["status"] == "value" {
                assert_eq!(
                    signature(&actual.unwrap()),
                    frozen_view_signature(&expected["value"]),
                    "{runtime}: {id}"
                );
            } else {
                assert!(actual.is_err(), "{runtime}: {id} unexpectedly accepted");
            }
        }
    }
    assert_eq!(total, 486);
}

#[test]
fn frozen_ruamel_yaml_break_contexts_all_observations() {
    let fixture: Json = serde_json::from_str(YAML_BREAK_CONTEXT_ORACLE).unwrap();
    let oracles = fixture["oracles"].as_object().unwrap();
    assert_eq!(oracles.len(), 6);
    let mut total = 0usize;
    let mut mismatches = Vec::new();
    for (runtime, oracle) in oracles {
        for case in oracle["cases"].as_array().unwrap() {
            total += 1;
            let expected = &case["predecessor"];
            let mut ctx = Context::ordinary();
            let source = point_text(&case["sourceCodepoints"]);
            let actual = serialization::read_python_value(&source, Format::Yaml, &mut ctx);
            if expected["status"] == "value" {
                let actual = signature(&actual.unwrap());
                if actual != expected["value"] {
                    mismatches.push(format!(
                        "{runtime}: {}: {actual} != {}",
                        case["id"].as_str().unwrap(),
                        expected["value"]
                    ));
                }
            } else {
                if actual.is_ok() {
                    mismatches.push(format!(
                        "{runtime}: {} unexpectedly accepted",
                        case["id"].as_str().unwrap()
                    ));
                }
            }
        }
    }
    assert_eq!(total, 2_124);
    assert!(
        mismatches.is_empty(),
        "{} mismatches:\n{}",
        mismatches.len(),
        mismatches.join("\n")
    );
}

#[test]
fn python_profile_uses_public_text_limits_and_denies_output_before_buffer_allocation() {
    let at_limit = PyText::from_codepoints(
        std::iter::once(0x22)
            .chain(std::iter::repeat_n(0x61, 3_999_998))
            .chain(std::iter::once(0x22))
            .collect(),
    )
    .unwrap();
    assert!(
        serialization::read_python_value(&at_limit, Format::Json, &mut Context::ordinary()).is_ok()
    );
    let over_limit = PyText::from_codepoints(
        std::iter::once(0x22)
            .chain(std::iter::repeat_n(0x61, 3_999_999))
            .chain(std::iter::once(0x22))
            .collect(),
    )
    .unwrap();
    assert_eq!(
        serialization::read_python_value(&over_limit, Format::Json, &mut Context::ordinary())
            .unwrap_err()
            .code,
        "LIMIT"
    );

    let exact_output = PythonConsumerValue::String(
        PyText::from_codepoints(std::iter::repeat_n(0x61, 3_999_997).collect()).unwrap(),
    );
    assert_eq!(
        serialization::write_python_value(&exact_output, Format::Json, &mut Context::ordinary())
            .unwrap()
            .utf16_unit_len(),
        4_000_000
    );
    let expanded_output = PythonConsumerValue::String(
        PyText::from_codepoints(std::iter::repeat_n(0x00, 666_667).collect()).unwrap(),
    );
    assert_eq!(
        serialization::write_python_value(&expanded_output, Format::Json, &mut Context::ordinary())
            .unwrap_err()
            .code,
        "LIMIT"
    );

    let mut spent = 0usize;
    let mut meter = |amount: usize| {
        spent += amount;
        if spent > 2 {
            Err(umf_core::error::EngineError::new(
                "METER_DENIED",
                Default::default(),
                "test budget denied output",
            ))
        } else {
            Ok(())
        }
    };
    let small = PythonConsumerValue::String(PyText::from_codepoints(vec![0x78]).unwrap());
    assert_eq!(
        serialization::write_python_value(
            &small,
            Format::Json,
            &mut Context::ordinary().with_meter(&mut meter)
        )
        .unwrap_err()
        .code,
        "METER_DENIED"
    );
    assert_eq!(
        spent, 6,
        "the final text charge is denied before the output Vec is allocated"
    );
}
