// SPDX-License-Identifier: MIT OR Apache-2.0
use serde_json::Value as Json;
use umf_core::{Context, Utf16, Value};
use umf_core_wire::tablespec_binding::{PROFILE, execute_wire};

fn request(op: &str, fields: impl IntoIterator<Item = (&'static str, Value)>) -> String {
    let mut request = vec![
        (Utf16::from("profile"), Value::string_utf8(PROFILE)),
        (Utf16::from("op"), Value::string_utf8(op)),
    ];
    request.extend(
        fields
            .into_iter()
            .map(|(name, value)| (Utf16::from(name), value)),
    );
    umf_core_wire::encode(&Value::Object(request), &mut Context::ordinary()).unwrap()
}

fn call(op: &str, fields: impl IntoIterator<Item = (&'static str, Value)>) -> Value {
    let output: Json = serde_json::from_str(&execute_wire(&request(op, fields))).unwrap();
    assert_eq!(output["status"], "ok", "{op}: {output}");
    umf_core_wire::decode(output["wire"].as_str().unwrap(), &mut Context::ordinary()).unwrap()
}

fn member<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    match value {
        Value::Object(fields) => fields
            .iter()
            .find(|(key, _)| key == &Utf16::from(name))
            .map(|(_, value)| value),
        _ => None,
    }
}

#[test]
fn monolithic_import_get_edit_inspect_and_export_keep_current_metadata() {
    let source = r#"{"version":"1.0","table_name":"orders","future":{"exact":9007199254740993},"columns":[{"name":"id","data_type":"INTEGER","future":"keep"}]}"#;
    let document = call(
        "importTableSpec",
        [
            ("source", Value::string_utf8(source)),
            ("id", Value::string_utf8("orders")),
            ("format", Value::string_utf8("json")),
        ],
    );
    let inspected = call("inspectTableSpec", [("document", document.clone())]);
    assert_eq!(member(&inspected, "valid"), Some(&Value::Bool(true)));
    assert_eq!(member(&inspected, "complete"), Some(&Value::Bool(false)));
    assert!(matches!(
        member(&inspected, "diagnostics"),
        Some(Value::Array(_))
    ));

    let native_table = call("getTableSpecTable", [("document", document.clone())]);
    assert!(matches!(native_table, Value::Object(_)));
    let native_column = call(
        "getTableSpecColumn",
        [
            ("document", document.clone()),
            ("index", Value::Number(0.0)),
        ],
    );
    assert_eq!(
        member(&native_column, "kind"),
        Some(&Value::string_utf8("object"))
    );

    let changes = Value::Object(vec![(
        Utf16::from("description"),
        Value::Object(vec![
            (Utf16::from("kind"), Value::string_utf8("string")),
            (Utf16::from("value"), Value::string_utf8("identifier")),
        ]),
    )]);
    let edited = call(
        "editTableSpecColumn",
        [
            ("document", document),
            ("index", Value::Number(0.0)),
            ("changes", changes),
        ],
    );
    let edited_validation = call("inspectTableSpec", [("document", edited.clone())]);
    assert_eq!(
        member(&edited_validation, "valid"),
        Some(&Value::Bool(true))
    );
    assert_eq!(
        member(&edited_validation, "complete"),
        Some(&Value::Bool(false))
    );
    assert_eq!(
        call("exportTableSpec", [("document", edited)]),
        Value::string_utf8(
            r#"{"version":"1.0","table_name":"orders","future":{"exact":9007199254740993},"columns":[{"name":"id","data_type":"INTEGER","future":"keep","description":"identifier"}]}"#
                + "\n"
        )
    );
}

#[test]
fn malformed_operation_is_refused_before_runtime_construction() {
    let output: Json = serde_json::from_str(&execute_wire(&request(
        "getTableSpecColumn",
        [("document", Value::Null), ("index", Value::Number(1.5))],
    )))
    .unwrap();
    assert_eq!(output["status"], "error");
    assert_eq!(output["code"], "REQUEST");
}

#[test]
fn split_bundle_roundtrip_and_changed_column_export_preserve_sidecars() {
    let files = Value::Object(vec![
        (
            Utf16::from("table.yaml"),
            Value::string_utf8(
                "version: '1.0'\ntable_name: orders\ncolumns:\n  - shadowed: true\n",
            ),
        ),
        (
            Utf16::from("columns/a.yaml"),
            Value::string_utf8(
                "column:\n  name: id\n  data_type: INTEGER\nderivation:\n  expression: source_id\n",
            ),
        ),
        (
            Utf16::from("notes/retained.yaml"),
            Value::string_utf8("opaque: preserved\n"),
        ),
    ]);
    let document = call(
        "importTableSpecBundle",
        [
            ("files", files.clone()),
            ("id", Value::string_utf8("orders")),
        ],
    );
    let roundtrip = call("exportTableSpecBundle", [("document", document.clone())]);
    assert_eq!(roundtrip, files);

    let changes = Value::Object(vec![(
        Utf16::from("description"),
        Value::Object(vec![
            (Utf16::from("kind"), Value::string_utf8("string")),
            (
                Utf16::from("value"),
                Value::string_utf8("primary identifier"),
            ),
        ]),
    )]);
    let edited = call(
        "editTableSpecColumn",
        [
            ("document", document),
            ("index", Value::Number(0.0)),
            ("changes", changes),
        ],
    );
    let output = call("exportTableSpecBundle", [("document", edited)]);
    assert_eq!(member(&output, "table.yaml"), member(&files, "table.yaml"));
    assert_eq!(
        member(&output, "notes/retained.yaml"),
        member(&files, "notes/retained.yaml")
    );
    assert!(
        matches!(member(&output, "columns/a.yaml"), Some(Value::String(text)) if text.to_utf8().unwrap().contains("primary identifier"))
    );
}

#[test]
fn split_bundle_rejects_unnormalized_mapping_paths() {
    let output: Json = serde_json::from_str(&execute_wire(&request(
        "importTableSpecBundle",
        [
            ("id", Value::string_utf8("bad")),
            (
                "files",
                Value::Object(vec![
                    (
                        Utf16::from("table.yaml"),
                        Value::string_utf8("version: '1.0'\ntable_name: t\n"),
                    ),
                    (
                        Utf16::from("columns/../escape.yaml"),
                        Value::string_utf8("column: {}\n"),
                    ),
                ]),
            ),
        ],
    )))
    .unwrap();
    assert_eq!(output["status"], "error");
    assert_eq!(output["code"], "TABLESPEC_PATH");
}
