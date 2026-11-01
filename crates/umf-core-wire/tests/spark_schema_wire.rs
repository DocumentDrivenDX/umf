#![cfg(feature = "embedded-adapters")]
use umf_core::{Context, Utf16, Value};
use umf_core_wire::{
    decode, encode,
    spark_binding::{execute_wire_with_control, PROFILE},
};
fn s(v: &str) -> Value {
    Value::String(Utf16::from(v))
}
fn obj(v: Vec<(&str, Value)>) -> Value {
    Value::Object(v.into_iter().map(|(k, v)| (Utf16::from(k), v)).collect())
}
fn request(op: &str, fields: Vec<(&str, Value)>) -> String {
    let mut f = vec![("profile", s(PROFILE)), ("op", s(op))];
    f.extend(fields);
    encode(&obj(f), &mut Context::ordinary()).unwrap()
}
fn run(op: &str, fields: Vec<(&str, Value)>) -> serde_json::Value {
    let wire = request(op, fields);
    let mut control = |_: usize| Ok(());
    serde_json::from_str(&execute_wire_with_control(&wire, &mut control)).unwrap()
}
fn member<'a>(v: &'a Value, key: &str) -> Option<&'a Value> {
    if let Value::Object(fields) = v {
        fields
            .iter()
            .find(|(k, _)| k == &Utf16::from(key))
            .map(|(_, v)| v)
    } else {
        None
    }
}

#[test]
fn spark_schema_import_metadata_rename_and_export_preserve_unknown_numeric_token() {
    let source = r#"{"type":"struct","fields":[{"name":"old","type":{"type":"array","elementType":"string","containsNull":true},"nullable":true,"metadata":{"__COLLATIONS":{"old.element":"spark.UTF8_LCASE"},"custom":9007199254740993}}]}"#;
    let imported = run(
        "spark.import",
        vec![("source", s(source)), ("id", s("spark"))],
    );
    assert_eq!(imported["status"], "ok", "{imported}");
    let document = decode(imported["wire"].as_str().unwrap(), &mut Context::ordinary()).unwrap();
    let options = obj(vec![
        ("fieldPointer", s("/fields/0")),
        ("name", s("new")),
        ("uninterpretedMetadata", s("preserve-and-report")),
    ]);
    let renamed = run(
        "spark.renameField",
        vec![("document", document), ("options", options)],
    );
    assert_eq!(renamed["status"], "ok", "{renamed}");
    let output = decode(renamed["wire"].as_str().unwrap(), &mut Context::ordinary()).unwrap();
    let document = member(&output, "document").unwrap();
    let exported = run("spark.export", vec![("document", document.clone())]);
    assert_eq!(exported["status"], "ok", "{exported}");
    let schema = decode(exported["wire"].as_str().unwrap(), &mut Context::ordinary()).unwrap();
    let schema = if let Value::String(s) = schema {
        s.to_utf8().unwrap()
    } else {
        panic!("expected schema text")
    };
    assert!(schema.contains("\"new\""));
    assert!(schema.contains("\"new.element\":\"spark.UTF8_LCASE\""));
    assert!(schema.contains("9007199254740993"));
    let paths = member(&output, "renamedCollationPaths")
        .and_then(|v| {
            if let Value::Array(a) = v {
                Some(a)
            } else {
                None
            }
        })
        .unwrap();
    assert_eq!(paths.len(), 1);
    let diagnostics = member(&output, "diagnostics")
        .and_then(|v| {
            if let Value::Array(a) = v {
                Some(a)
            } else {
                None
            }
        })
        .unwrap();
    assert!(diagnostics.iter().any(|d| member(d, "code")
        .and_then(|v| if let Value::String(s) = v {
            s.to_utf8().ok()
        } else {
            None
        })
        .as_deref()
        == Some("SPARK_NAME_REFERENCES_UNVERIFIED")));
}

#[test]
fn spark_schema_refuses_rename_of_non_field_node() {
    let source = r#"{"type":"struct","fields":[{"name":"old","type":"string","nullable":true}]}"#;
    let imported = run(
        "spark.import",
        vec![("source", s(source)), ("id", s("spark"))],
    );
    let document = decode(imported["wire"].as_str().unwrap(), &mut Context::ordinary()).unwrap();
    let options = obj(vec![
        ("fieldPointer", s("/fields/0/metadata")),
        ("name", s("new")),
        ("uninterpretedMetadata", s("preserve-and-report")),
    ]);
    let refused = run(
        "spark.renameField",
        vec![("document", document), ("options", options)],
    );
    assert_eq!(refused["status"], "error");
    assert_eq!(refused["code"], "SPARK_RENAME_PATH");
}
