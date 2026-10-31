#![cfg(feature = "embedded-adapters")]
use umf_core::{Context, Utf16, Value};
use umf_core_wire::{decode, encode, parquet_capture_binding};

fn text(value: &str) -> Value {
    Value::String(Utf16::from(value))
}
fn object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(key, value)| (Utf16::from(key), value))
            .collect(),
    )
}
fn request(op: &str, fields: Vec<(&str, Value)>) -> String {
    let mut members = vec![
        (
            Utf16::from("profile"),
            text(parquet_capture_binding::PROFILE),
        ),
        (Utf16::from("op"), text(op)),
    ];
    members.extend(
        fields
            .into_iter()
            .map(|(key, value)| (Utf16::from(key), value)),
    );
    encode(&Value::Object(members), &mut Context::ordinary()).unwrap()
}
fn result(response: &str) -> Result<Value, String> {
    let envelope: serde_json::Value = serde_json::from_str(response).unwrap();
    if envelope["status"] == "ok" {
        return Ok(decode(envelope["wire"].as_str().unwrap(), &mut Context::ordinary()).unwrap());
    }
    Err(envelope["code"].as_str().unwrap_or("UNKNOWN").to_owned())
}
fn hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    bytes
        .iter()
        .flat_map(|b| {
            [
                HEX[(b >> 4) as usize] as char,
                HEX[(b & 15) as usize] as char,
            ]
        })
        .collect()
}
fn captured(bytes: &[u8], id: &str) -> Value {
    result(&parquet_capture_binding::execute_wire(&request(
        "parquet.capture",
        vec![("bytes", text(&hex(bytes))), ("id", text(id))],
    )))
    .unwrap()
}
fn field<'a>(value: &'a Value, key: &str) -> Option<&'a Value> {
    let Value::Object(fields) = value else {
        return None;
    };
    fields
        .iter()
        .find(|(name, _)| name == &Utf16::from(key))
        .map(|(_, value)| value)
}
fn string(value: Option<&Value>) -> Option<String> {
    if let Some(Value::String(value)) = value {
        value.to_utf8().ok()
    } else {
        None
    }
}

#[test]
fn typed_checkpoint_rows_project_native_actions_and_exact_scalar_conversions() {
    let source = captured(
        include_bytes!("../../../fixtures/delta/parquet-actions/authored/typed-statistics.parquet"),
        "typed-statistics",
    );
    let projected = result(&parquet_capture_binding::execute_wire(&request(
        "delta.parquet.projectActions",
        vec![("document", source.clone())],
    )))
    .unwrap();
    assert_eq!(
        string(field(&projected, "status")).as_deref(),
        Some("projected")
    );
    assert_eq!(field(&projected, "source"), Some(&source));
    assert!(matches!(field(&projected, "log"), Some(Value::Object(_))));
    let Some(Value::Array(actions)) = field(&projected, "actions") else {
        panic!("projected action expected");
    };
    assert_eq!(actions.len(), 1);
    assert_eq!(string(field(&actions[0], "action")).as_deref(), Some("add"));
    let mut ctx = Context::ordinary();
    let log_resources = umf_core::delta_log::DeltaLogResources::new(&mut ctx).unwrap();
    let exported = umf_core::delta_log::export_delta_log(
        field(&projected, "log").unwrap(),
        &log_resources,
        &mut ctx,
    )
    .unwrap();
    assert_eq!(
        exported.to_utf8().unwrap(),
        include_str!("../../../fixtures/delta/parquet-actions/typed-statistics.jsonl")
    );
    let Some(Value::Array(rows)) = field(&projected, "scalarConversions") else {
        panic!("scalar conversion records expected");
    };
    assert_eq!(rows.len(), 5);
    let date = rows
        .iter()
        .find(|row| string(field(row, "path")).is_some_and(|path| path.ends_with("/date")))
        .unwrap();
    let output = field(date, "output").unwrap();
    assert_eq!(string(field(output, "kind")).as_deref(), Some("string"));
    assert_eq!(
        string(field(output, "value")).as_deref(),
        Some("1969-12-31")
    );
    let decimal = rows
        .iter()
        .find(|row| string(field(row, "path")).is_some_and(|path| path.ends_with("/decimal")))
        .unwrap();
    let output = field(decimal, "output").unwrap();
    assert_eq!(string(field(output, "kind")).as_deref(), Some("number"));
    assert_eq!(
        string(field(output, "value")).as_deref(),
        Some("123456789012345678901.123456789")
    );
}

#[test]
fn unsupported_typed_checkpoint_column_blocks_without_partial_log_or_actions() {
    let source = captured(
        include_bytes!(
            "../../../fixtures/delta/parquet-actions/authored/float-needs-policy.parquet"
        ),
        "float-needs-policy",
    );
    let projected = result(&parquet_capture_binding::execute_wire(&request(
        "delta.parquet.projectActions",
        vec![("document", source.clone())],
    )))
    .unwrap();
    assert_eq!(
        string(field(&projected, "status")).as_deref(),
        Some("blocked")
    );
    assert_eq!(field(&projected, "source"), Some(&source));
    assert!(field(&projected, "log").is_none());
    assert!(field(&projected, "actions").is_none());
    assert!(
        matches!(field(&projected, "diagnostics"), Some(Value::Array(rows)) if rows.iter().any(|d| string(field(d,"severity")).as_deref()==Some("error")))
    );
}
