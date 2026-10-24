// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::{
    lakeview,
    serialization::{read_json_value, Format},
    Context, EngineError, Utf16, Value,
};
fn options() -> Value {
    read_json_value(
        r#"{"id":"test","namespace":"demo"}"#.encode_utf16().collect::<Vec<_>>().as_slice(),
        Format::Json,
        &mut Context::ordinary(),
    )
    .unwrap()
}
fn get<'a>(v: &'a Value, key: &str) -> &'a Value {
    if let Value::Object(m) = v {
        &m.iter().find(|(k, _)| k == &Utf16::from(key)).unwrap().1
    } else {
        panic!("object required")
    }
}
fn imported(source: &str) -> Value {
    lakeview::import(
        &Utf16::from(source),
        &options(),
        &Value::string_utf8("0.10.0"),
        &mut Context::ordinary(),
    )
    .unwrap()
}
#[test]
fn original_bytes_recover_in_native_rust_without_number_conversion() {
    for bytes in [
        include_bytes!("../../../fixtures/lakeview/marketing-campaign.lvdash.json").as_slice(),
        include_bytes!("../../../fixtures/lakeview/lexical-quirks.lvdash.json").as_slice(),
        include_bytes!("../../../fixtures/lakeview/empty-sections.lvdash.json").as_slice(),
    ] {
        let source = std::str::from_utf8(bytes).unwrap();
        let imported = imported(source);
        let result = lakeview::export(
            get(&imported, "document"),
            &Value::string_utf8("0.10.0"),
            &mut Context::ordinary(),
        )
        .unwrap();
        assert_eq!(result.to_utf8().unwrap().as_bytes(), bytes);
    }
}
#[test]
fn non_representable_core_and_native_edits_are_not_hidden_by_the_archive() {
    let mut result = imported("{\"datasets\":[],\"pages\":[],\"future\":-0}\n");
    let Value::Object(root) = &mut result else {
        panic!()
    };
    let Value::Object(doc) = &mut root
        .iter_mut()
        .find(|(k, _)| k == &Utf16::from("document"))
        .unwrap()
        .1
    else {
        panic!()
    };
    doc.push((Utf16::from("futureCoreMeaning"), Value::Bool(true)));
    assert_eq!(
        lakeview::export(
            get(&result, "document"),
            &Value::string_utf8("0.10.0"),
            &mut Context::ordinary()
        )
        .unwrap_err()
        .code,
        "LAKEVIEW_EDIT_UNSUPPORTED"
    );
}
#[test]
fn duplicate_decoded_keys_invalid_native_shapes_and_bad_source_encoding_refuse() {
    for source in [
        "{\"pages\":[],\"pages\":[]}",
        "{\"a\":1,\"\\u0061\":2}",
        "[]",
        "{\"datasets\":{}}",
        "{\"pages\":[{\"layout\":[3]}]}",
    ] {
        assert!(lakeview::import(
            &Utf16::from(source),
            &options(),
            &Value::string_utf8("0.10.0"),
            &mut Context::ordinary()
        )
        .is_err());
    }
    assert_eq!(
        lakeview::import(
            &Utf16::new(vec![0xd800]),
            &options(),
            &Value::string_utf8("0.10.0"),
            &mut Context::ordinary()
        )
        .unwrap_err()
        .code,
        "SOURCE_ENCODING"
    );
    // Escaped isolated surrogates are legal JSON string content and retain bytes.
    let source = r#"{"datasets":[{"name":"\ud800","columns":[{"name":"\udfff"}]}]}"#;
    let r = imported(source);
    assert_eq!(
        lakeview::export(
            get(&r, "document"),
            &Value::string_utf8("0.10.0"),
            &mut Context::ordinary()
        )
        .unwrap(),
        Utf16::from(source)
    );
}
#[test]
fn cooperative_limits_refuse_before_a_partial_import_or_export_is_returned() {
    let mut work = 0usize;
    let mut meter = |amount: usize| {
        work += amount;
        if work > 20 {
            Err(EngineError::new(
                "RESOURCE_LIMIT",
                Utf16::default(),
                "test budget",
            ))
        } else {
            Ok(())
        }
    };
    assert_eq!(
        lakeview::import(
            &Utf16::from("{\"pages\":[]}"),
            &options(),
            &Value::string_utf8("0.10.0"),
            &mut Context::ordinary().with_meter(&mut meter)
        )
        .unwrap_err()
        .code,
        "RESOURCE_LIMIT"
    );
}
