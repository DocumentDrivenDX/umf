// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core_wire::delta_spark_hash::execute_json;

#[test]
fn opt_in_request_decodes_dispatches_and_encodes_hash_results() {
    for (request, expected) in [
        (r#"{"op":"delta/sparkStringHash","value":null}"#, r#"{"hash":42}"#),
        (r#"{"op":"delta/sparkStringHash","value":"a.parquet"}"#, r#"{"hash":-1576595922}"#),
        (r#"{"op":"delta/sparkStringHash","value":"🙂","seed":-12345}"#, r#"{"hash":1798060786}"#),
    ] {
        let actual: serde_json::Value = serde_json::from_str(&execute_json(request).unwrap()).unwrap();
        let expected: serde_json::Value = serde_json::from_str(expected).unwrap();
        assert_eq!(actual, expected);
    }
}

#[test]
fn opt_in_request_rejects_unsupported_or_malformed_calls() {
    for request in [
        r#"{"op":"delta/unknown","value":"a"}"#,
        r#"{"op":"delta/sparkStringHash"}"#,
        r#"{"op":"delta/sparkStringHash","value":true}"#,
        r#"{"op":"delta/sparkStringHash","value":"a","seed":2147483648}"#,
        r#"{"op":"delta/sparkStringHash","value":"a","extra":1}"#,
    ] {
        assert!(execute_json(request).is_err(), "{request}");
    }
}
