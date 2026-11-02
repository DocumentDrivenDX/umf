// SPDX-License-Identifier: MIT OR Apache-2.0
use super::{TableSpecFormat, TableSpecRuntime};
use crate::{Context, Utf16, Value};

fn k(name: &str) -> Utf16 {
    Utf16::from(name)
}
fn tagged_string(value: &str) -> Value {
    Value::Object(vec![
        (k("kind"), Value::string_utf8("string")),
        (k("value"), Value::String(Utf16::from(value))),
    ])
}

#[test]
fn current_json_table_roundtrip_preserves_unknown_values_and_exact_numbers() {
    let source = Utf16::from(
        r#"{"version":"1.0","table_name":"orders","future":{"exact":9007199254740993},"columns":[{"name":"id","data_type":"INTEGER","description":"row key","future":"keep"}]}"#,
    );
    let mut ctx = Context::ordinary();
    let runtime = TableSpecRuntime::new(&mut ctx).unwrap();
    let mut document = runtime
        .import(
            &source,
            &Utf16::from("orders"),
            TableSpecFormat::Json,
            &mut ctx,
        )
        .unwrap();
    let validation = runtime.inspect(&document, &mut ctx).unwrap();
    assert!(validation.valid, "{validation:?}");
    assert!(!validation.complete);
    assert_eq!(runtime.export(&document, &mut ctx).unwrap(), source);
}

#[test]
fn current_yaml_table_roundtrip_preserves_unknown_values_and_exact_numbers() {
    let source = Utf16::from(
        "version: '1.0'\ntable_name: providers\nfuture:\n  exact: 9007199254740993\ncolumns:\n  - name: id\n    data_type: INTEGER\n    description: row key\n    future: keep\n",
    );
    let mut ctx = Context::ordinary();
    let runtime = TableSpecRuntime::new(&mut ctx).unwrap();
    let mut document = runtime
        .import(
            &source,
            &Utf16::from("providers"),
            TableSpecFormat::Yaml,
            &mut ctx,
        )
        .unwrap();
    let validation = runtime.inspect(&document, &mut ctx).unwrap();
    assert!(validation.valid, "{validation:?}");
    assert!(!validation.complete);
    assert_eq!(runtime.export(&document, &mut ctx).unwrap(), source);
}

#[test]
fn invalid_table_shape_is_refused() {
    let mut ctx = Context::ordinary();
    let runtime = TableSpecRuntime::new(&mut ctx).unwrap();
    let error = runtime
        .import(
            &Utf16::from(r#"{"version":"2.0","table_name":"t","columns":[]}"#),
            &Utf16::from("invalid"),
            TableSpecFormat::Json,
            &mut ctx,
        )
        .unwrap_err();
    assert_eq!(error.code, "TABLESPEC_VERSION");
}

#[test]
fn current_native_getters_and_copy_edits_preserve_unmodified_source_values() {
    let source = Utf16::from(
        r#"{"version":"1.0","table_name":"orders","future":{"keep":true},"columns":[{"name":"id","data_type":"INTEGER","future":{"exact":9007199254740993}}]}"#,
    );
    let mut ctx = Context::ordinary();
    let runtime = TableSpecRuntime::new(&mut ctx).unwrap();
    let mut document = runtime
        .import(
            &source,
            &Utf16::from("orders"),
            TableSpecFormat::Json,
            &mut ctx,
        )
        .unwrap();
    let vocabularies = object_field_mut(&mut document, "vocabularies").unwrap();
    insert_field(
        vocabularies,
        "vendor.note",
        Value::Object(vec![(k("version"), Value::string_utf8("1.0.0"))]),
    );
    let module = object_field_mut(&mut document, "modules")
        .and_then(|modules| match modules {
            Value::Array(items) => items.get_mut(0),
            _ => None,
        })
        .unwrap();
    let element = object_field_mut(module, "elements")
        .and_then(|elements| match elements {
            Value::Array(items) => items.get_mut(0),
            _ => None,
        })
        .unwrap();
    let extensions = object_field_mut(element, "extensions").unwrap();
    insert_field(
        extensions,
        "vendor.note",
        Value::Object(vec![(k("opaque"), Value::string_utf8("retain"))]),
    );
    let validation = runtime.inspect(&document, &mut ctx).unwrap();
    assert!(validation.valid, "{validation:?}");
    assert!(!validation.complete);
    let table = runtime.get_table(&document, &mut ctx).unwrap();
    let column = runtime.get_column(&document, 0, &mut ctx).unwrap();
    assert!(matches!(column, Value::Object(_)));

    let column_changes = Value::Object(vec![(k("description"), tagged_string("identifier"))]);
    let edited_column = runtime
        .edit_column(&document, 0, &column_changes, &mut ctx)
        .unwrap();
    let edited_validation = runtime.inspect(&edited_column, &mut ctx).unwrap();
    assert!(edited_validation.valid, "{edited_validation:?}");
    assert!(!edited_validation.complete);
    assert_eq!(
        string_from_native(
            runtime.get_column(&edited_column, 0, &mut ctx).unwrap(),
            "description"
        ),
        Some(Utf16::from("identifier"))
    );
    assert_eq!(runtime.get_table(&document, &mut ctx).unwrap(), table);
    assert!(runtime
        .export(&edited_column, &mut ctx)
        .unwrap()
        .to_utf8()
        .unwrap()
        .contains("identifier"));
    let edited_element = object_field(&edited_column, "modules")
        .and_then(|modules| match modules {
            Value::Array(items) => items.first(),
            _ => None,
        })
        .and_then(|module| object_field(module, "elements"))
        .and_then(|elements| match elements {
            Value::Array(items) => items.first(),
            _ => None,
        })
        .unwrap();
    assert_eq!(
        string_field(edited_element, "description"),
        Some(&Utf16::from("identifier"))
    );
    assert_eq!(
        object_field(edited_element, "extensions")
            .and_then(|v| object_field(v, "vendor.note"))
            .and_then(|v| string_field(v, "opaque")),
        Some(&Utf16::from("retain"))
    );

    let table_changes = Value::Object(vec![(k("table_name"), tagged_string("purchases"))]);
    let edited_table = runtime
        .edit_table(&document, &table_changes, &mut ctx)
        .unwrap();
    assert!(runtime
        .export(&edited_table, &mut ctx)
        .unwrap()
        .to_utf8()
        .unwrap()
        .contains("purchases"));
    assert_eq!(runtime.export(&document, &mut ctx).unwrap(), source);
}

#[test]
fn native_edit_refuses_column_replacement_and_invalid_column_changes() {
    let mut ctx = Context::ordinary();
    let runtime = TableSpecRuntime::new(&mut ctx).unwrap();
    let document = runtime.import(&Utf16::from(r#"{"version":"1.0","table_name":"t","columns":[{"name":"id","data_type":"INTEGER"}]}"#), &Utf16::from("t"), TableSpecFormat::Json, &mut ctx).unwrap();
    let replaces_columns = Value::Object(vec![(k("columns"), tagged_string("bad"))]);
    assert_eq!(
        runtime
            .edit_table(&document, &replaces_columns, &mut ctx)
            .unwrap_err()
            .code,
        "TABLESPEC_TABLE_EDIT"
    );
    let invalid_column = Value::Object(vec![(k("name"), tagged_string("id"))]);
    assert_eq!(
        runtime
            .edit_column(&document, 9, &invalid_column, &mut ctx)
            .unwrap_err()
            .code,
        "TABLESPEC_COLUMN"
    );
}

fn string_from_native(tagged: Value, key: &str) -> Option<Utf16> {
    let Value::Object(fields) = tagged else {
        return None;
    };
    let members = fields
        .into_iter()
        .find(|(name, _)| name == &k("members"))?
        .1;
    let Value::Object(members) = members else {
        return None;
    };
    let tagged = members.into_iter().find(|(name, _)| name == &k(key))?.1;
    let Value::Object(fields) = tagged else {
        return None;
    };
    match fields.into_iter().find(|(name, _)| name == &k("value"))?.1 {
        Value::String(value) => Some(value),
        _ => None,
    }
}

fn object_field<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    match value {
        Value::Object(fields) => fields
            .iter()
            .find(|(key, _)| key == &k(name))
            .map(|(_, value)| value),
        _ => None,
    }
}

fn object_field_mut<'a>(value: &'a mut Value, name: &str) -> Option<&'a mut Value> {
    match value {
        Value::Object(fields) => fields
            .iter_mut()
            .find(|(key, _)| key == &k(name))
            .map(|(_, value)| value),
        _ => None,
    }
}

fn string_field<'a>(value: &'a Value, name: &str) -> Option<&'a Utf16> {
    match object_field(value, name) {
        Some(Value::String(value)) => Some(value),
        _ => None,
    }
}

fn insert_field(value: &mut Value, name: &str, replacement: Value) {
    let Value::Object(fields) = value else {
        panic!("expected an object");
    };
    if let Some((_, value)) = fields.iter_mut().find(|(key, _)| key == &k(name)) {
        *value = replacement;
    } else {
        fields.push((k(name), replacement));
    }
}
