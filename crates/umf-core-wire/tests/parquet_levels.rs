// SPDX-License-Identifier: MIT OR Apache-2.0
use std::{fs, path::Path};
use umf_core::{
    Context, Utf16, Value,
    serialization::{Format, write_json_value},
};
use umf_core_wire::{
    decode, encode,
    parquet_capture_binding::{PROFILE, execute_wire},
};

fn object(fields: impl IntoIterator<Item = (&'static str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(k, v)| (Utf16::from(k), v))
            .collect(),
    )
}
fn txt(v: &str) -> Value {
    Value::string_utf8(v)
}
fn request(op: &str, fields: impl IntoIterator<Item = (&'static str, Value)>) -> String {
    let mut all = vec![("profile", txt(PROFILE)), ("op", txt(op))];
    all.extend(fields);
    encode(&object(all), &mut Context::ordinary()).unwrap()
}
fn json(value: &Value) -> serde_json::Value {
    let s = write_json_value(value, Format::Json, &mut Context::ordinary())
        .unwrap()
        .to_utf8()
        .unwrap();
    serde_json::from_str(&s).unwrap()
}
fn run(path: &str, id: &str) -> serde_json::Value {
    let bytes = fs::read(path).unwrap();
    let cap = execute_wire(&request(
        "parquet.capture",
        [("id", txt(id)), ("bytes", txt(&hex(&bytes)))],
    ));
    let cap: serde_json::Value = serde_json::from_str(&cap).unwrap();
    assert_eq!(cap["status"], "ok", "{id}: {cap}");
    let document = decode(cap["wire"].as_str().unwrap(), &mut Context::ordinary()).unwrap();
    let result = execute_wire(&request("parquet.decodeLevels", [("document", document)]));
    let result: serde_json::Value = serde_json::from_str(&result).unwrap();
    assert_eq!(result["status"], "ok", "{id}: {result}");
    let value = decode(result["wire"].as_str().unwrap(), &mut Context::ordinary()).unwrap();
    json(&value)
}
fn hex(bytes: &[u8]) -> String {
    const H: &[u8] = b"0123456789abcdef";
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push(H[(b >> 4) as usize] as char);
        s.push(H[(b & 15) as usize] as char);
    }
    s
}

#[test]
fn upstream_and_existing_authored_levels_match_frozen_typescript_outcomes() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let results: serde_json::Value = serde_json::from_slice(
        &fs::read(root.join("fixtures/parquet/levels/results.json")).unwrap(),
    )
    .unwrap();
    let frozen: serde_json::Value = serde_json::from_slice(
        &fs::read(root.join("fixtures/parquet/levels/rust-levels-ts-freeze.json")).unwrap(),
    )
    .unwrap();
    let frozen_cases = frozen["cases"].as_array().unwrap();
    assert_eq!(frozen_cases.len(), 62);
    for case in results["results"].as_array().unwrap() {
        let id = case["id"].as_str().unwrap();
        if !id.starts_with("page-") {
            continue;
        }
        // Keep this production-wire test to the four page-version/dictionary
        // combinations. The complete upstream corpus is hash-pinned by the
        // freeze; its current-source browser/WASM replay is still required.
        let path = root.join(case["path"].as_str().unwrap());
        let got = run(path.to_str().unwrap(), id);
        let expected = frozen_cases.iter().find(|x| x["id"] == id).unwrap();
        assert_eq!(got["status"], expected["status"], "{id}: {got}");
        assert_eq!(got["complete"], expected["complete"], "{id}");
        assert_eq!(got["diagnostics"], expected["diagnostics"], "{id}");
        if expected["status"] == "decoded" {
            let expected: serde_json::Value = serde_json::from_slice(
                &fs::read(root.join(format!("fixtures/parquet/levels/{id}.json"))).unwrap(),
            )
            .unwrap();
            assert_eq!(got["pages"], expected, "{id}");
        } else {
            assert!(got.get("pages").is_none(), "{id}");
        }
    }
    let authored: serde_json::Value = serde_json::from_slice(
        &fs::read(root.join("fixtures/parquet/levels/authored/manifest.json")).unwrap(),
    )
    .unwrap();
    for case in authored["cases"].as_array().unwrap() {
        let id = case["id"].as_str().unwrap();
        let got = run(
            root.join(case["path"].as_str().unwrap()).to_str().unwrap(),
            id,
        );
        let expected = frozen_cases.iter().find(|x| x["id"] == id).unwrap();
        assert_eq!(got["status"], expected["status"], "{id}");
        assert_eq!(got["complete"], expected["complete"], "{id}");
        assert_eq!(got["diagnostics"], expected["diagnostics"], "{id}");
        if expected["status"] == "decoded" {
            let pages = got["pages"].as_array().unwrap();
            assert_eq!(pages.len(), 1, "{id}");
            for key in [
                "repetition",
                "definition",
                "valuesOffset",
                "nonNullValues",
                "rowStarts",
            ] {
                assert_eq!(pages[0][key], case[key], "{id}: {key}");
            }
        } else {
            assert!(got.get("pages").is_none(), "{id}");
        }
    }
}
