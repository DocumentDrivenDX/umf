// SPDX-License-Identifier: MIT OR Apache-2.0
use std::{fs, path::PathBuf};

use serde_json::Value as Json;
use umf_core::{json_number::assert_exact_json_number, Context, EngineError, Utf16};

fn packet() -> Json {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(
        "../../tests/rust-core/fixtures/r8-json-number-predecessor/typescript-predecessor.json",
    );
    serde_json::from_str(&fs::read_to_string(path).unwrap()).unwrap()
}

fn check(token: &str) -> Result<(), EngineError> {
    assert_exact_json_number(&Utf16::from(token), &mut Context::ordinary())
}

#[test]
fn replays_frozen_typescript_predecessor_packet() {
    for case in packet()["cases"].as_array().unwrap() {
        let token = case["token"].as_str().unwrap();
        let result = check(token);
        if case["outcome"] == "accepted" {
            assert!(result.is_ok(), "{token:?}: {result:?}");
        } else {
            let error = result.unwrap_err();
            assert_eq!(
                error.code,
                case["error"]["code"].as_str().unwrap(),
                "{token:?}"
            );
            assert_eq!(
                error.message.to_utf8().unwrap(),
                case["error"]["message"].as_str().unwrap(),
                "{token:?}"
            );
        }
    }
}

#[test]
fn preserves_lexical_boundary_and_zero_big_exponent() {
    for token in ["+1", "01", ""] {
        assert!(check(token).is_ok(), "{token:?}");
    }
    assert!(check("0e999999999999999999999999").is_ok());
    assert_eq!(
        check(" 1").unwrap_err().message.to_utf8().unwrap(),
        "Unsupported numeric spelling"
    );
    assert_eq!(
        check(" 0").unwrap_err().message.to_utf8().unwrap(),
        "Unsupported numeric spelling"
    );
    assert_eq!(
        check("0x0").unwrap_err().message.to_utf8().unwrap(),
        "Unsupported numeric spelling"
    );
    assert_eq!(
        check("1e-999999999999999999999")
            .unwrap_err()
            .message
            .to_utf8()
            .unwrap(),
        "Parsing would change the decimal value"
    );
}
