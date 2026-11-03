// SPDX-License-Identifier: MIT OR Apache-2.0
//! Source-exact mutable UPDATE grant columns shared by inventory projection
//! and deployment rendering.

use std::collections::BTreeSet;

use umf_core::{Context, EngineError, Utf16, Value};

use crate::value::{array_items, member, string_member};

fn valid_name(value: Option<&umf_core::Utf16>) -> Option<String> {
    let value = value?.to_utf8().ok()?;
    (!value.is_empty() && !value.contains('\0')).then_some(value)
}

fn reference(value: &Value) -> Option<(String, String)> {
    Some((
        valid_name(string_member(value, "module"))?,
        valid_name(string_member(value, "element"))?,
    ))
}

/// Match `mutableTableGrantColumns` in the selected TypeScript source.
///
/// The caller supplies the exact table record and its defining module. The
/// output preserves declaration order and excludes every Key field, immutable
/// column, and generated column. Invalid/ambiguous source bindings refuse.
pub(crate) fn mutable_table_grant_columns(
    table: &Value,
    record_module: &str,
    record: &Value,
    path: &str,
    ctx: &mut Context<'_>,
) -> Result<Vec<String>, EngineError> {
    let table_id = valid_name(string_member(table, "id"))
        .ok_or_else(|| invalid(path, "Invalid table grant identity"))?;
    let _table_name = valid_name(string_member(table, "name"))
        .ok_or_else(|| invalid(path, "Invalid table grant identity"))?;
    if record_module.is_empty() || record_module.contains('\0') {
        return Err(invalid(path, "Invalid table Record binding"));
    }
    let table_record = member(table, "record")
        .ok_or_else(|| invalid(path, "Invalid table Record binding"))?;
    let expected_record = reference(table_record)
        .ok_or_else(|| invalid(path, "Invalid table Record binding"))?;
    if expected_record.0 != record_module
        || valid_name(string_member(record, "kind")) != Some("record".to_owned())
        || valid_name(string_member(record, "id")) != Some(expected_record.1)
        || table_id.is_empty()
    {
        return Err(invalid(path, "Record does not bind the table declaration"));
    }

    let keys = array_items(
        member(record, "keys").ok_or_else(|| invalid(path, "Invalid Record Keys"))?,
    )
    .ok_or_else(|| invalid(path, "Invalid Record Keys"))?;
    let mut key_fields = BTreeSet::new();
    for key in keys {
        ctx.charge_work(1, Utf16::from(path))?;
        let fields = array_items(
            member(key, "fields").ok_or_else(|| invalid(path, "Invalid Key fields"))?,
        )
        .ok_or_else(|| invalid(path, "Invalid Key fields"))?;
        for field in fields {
            ctx.charge_work(1, Utf16::from(path))?;
            key_fields.insert(
                reference(field).ok_or_else(|| invalid(path, "Invalid Key field reference"))?,
            );
        }
    }

    let columns = array_items(
        member(table, "columns").ok_or_else(|| invalid(path, "Invalid table columns"))?,
    )
    .ok_or_else(|| invalid(path, "Invalid table columns"))?;
    let mut seen_fields = BTreeSet::new();
    let mut seen_names = BTreeSet::new();
    let mut mutable = Vec::new();
    for column in columns {
        ctx.charge_work(1, Utf16::from(path))?;
        let field = reference(
            member(column, "field").ok_or_else(|| invalid(path, "Invalid column Field binding"))?,
        )
        .ok_or_else(|| invalid(path, "Invalid column Field binding"))?;
        let name = valid_name(string_member(column, "name"))
            .ok_or_else(|| invalid(path, "Invalid native column name"))?;
        if !seen_fields.insert(field.clone()) || !seen_names.insert(name.clone()) {
            return Err(invalid(path, "Duplicate native column binding"));
        }
        let immutable = member(column, "immutable") == Some(&Value::Bool(true));
        let generated = member(column, "generated").is_some();
        if !immutable && !generated && !key_fields.contains(&field) {
            ctx.charge_work(1, Utf16::from(path))?;
            mutable.push(name);
        }
    }
    Ok(mutable)
}

fn invalid(path: &str, message: &str) -> EngineError {
    EngineError::new("TABLE_GRANT_SOURCE", Utf16::from(path), message)
}

#[cfg(test)]
mod tests {
    use super::mutable_table_grant_columns;
    use umf_core::{Context, Utf16, Value};

    fn s(value: &str) -> Value { Value::String(Utf16::from(value)) }
    fn o(fields: Vec<(&str, Value)>) -> Value {
        Value::Object(fields.into_iter().map(|(k, v)| (Utf16::from(k), v)).collect())
    }
    fn a(values: Vec<Value>) -> Value { Value::Array(values) }
    fn r(element: &str) -> Value { o(vec![("module", s("demo")), ("element", s(element))]) }
    fn col(field: &str, name: &str, extra: Vec<(&str, Value)>) -> Value {
        let mut values = vec![("field", r(field)), ("name", s(name))];
        values.extend(extra);
        o(values)
    }
    fn record() -> Value {
        o(vec![
            ("kind", s("record")),
            ("id", s("Row")),
            ("keys", a(vec![o(vec![("fields", a(vec![r("id")]))])])),
        ])
    }
    fn table(columns: Vec<Value>) -> Value {
        o(vec![
            ("id", s("rows")),
            ("name", s("rows")),
            ("record", r("Row")),
            ("columns", a(columns)),
        ])
    }

    #[test]
    fn renderer_exact_mutable_columns_keep_order_and_exclude_key_immutable_generated() {
        let source = table(vec![
            col("id", "id", vec![]),
            col("owner", "owner", vec![]),
            col("stamp", "stamp", vec![("immutable", Value::Bool(true))]),
            col("computed", "computed", vec![("generated", o(vec![("generation", s("always"))]))]),
            col("note", "note", vec![]),
        ]);
        assert_eq!(
            mutable_table_grant_columns(&source, "demo", &record(), "/grant", &mut Context::ordinary()).unwrap(),
            vec![String::from("owner"), String::from("note")]
        );
    }

    #[test]
    fn renderer_exact_mutable_columns_exclude_an_immutable_owner_and_composite_key_fields() {
        let immutable_owner = table(vec![
            col("id", "id", vec![]),
            col("owner", "owner", vec![("immutable", Value::Bool(true))]),
            col("note", "note", vec![]),
        ]);
        assert_eq!(
            mutable_table_grant_columns(
                &immutable_owner,
                "demo",
                &record(),
                "/grant",
                &mut Context::ordinary()
            )
            .unwrap(),
            vec![String::from("note")]
        );

        let composite_key_record = o(vec![
            ("kind", s("record")),
            ("id", s("Row")),
            (
                "keys",
                a(vec![o(vec![("fields", a(vec![r("id"), r("owner")]))])]),
            ),
        ]);
        let composite_key_table = table(vec![
            col("id", "id", vec![]),
            col("owner", "owner", vec![]),
            col("note", "note", vec![]),
        ]);
        assert_eq!(
            mutable_table_grant_columns(
                &composite_key_table,
                "demo",
                &composite_key_record,
                "/grant",
                &mut Context::ordinary()
            )
            .unwrap(),
            vec![String::from("note")]
        );
    }

    #[test]
    fn renderer_exact_mutable_columns_reject_empty_and_mismatched_bindings() {
        let empty = table(vec![col("id", "id", vec![])]);
        assert_eq!(mutable_table_grant_columns(&empty, "demo", &record(), "/grant", &mut Context::ordinary()).unwrap(), Vec::<String>::new());
        let mismatch = table(vec![col("id", "id", vec![]), col("owner", "owner", vec![])]);
        assert_eq!(mutable_table_grant_columns(&mismatch, "other", &record(), "/grant", &mut Context::ordinary()).unwrap_err().code, "TABLE_GRANT_SOURCE");
    }

    #[test]
    fn renderer_exact_mutable_columns_reject_duplicate_field_or_name_bindings() {
        let duplicate_field = table(vec![
            col("id", "id", vec![]),
            col("owner", "owner", vec![]),
            col("owner", "owner_copy", vec![]),
        ]);
        assert_eq!(
            mutable_table_grant_columns(&duplicate_field, "demo", &record(), "/grant", &mut Context::ordinary()).unwrap_err().code,
            "TABLE_GRANT_SOURCE"
        );
        let duplicate_name = table(vec![
            col("id", "id", vec![]),
            col("owner", "owner", vec![]),
            col("note", "owner", vec![]),
        ]);
        assert_eq!(
            mutable_table_grant_columns(&duplicate_name, "demo", &record(), "/grant", &mut Context::ordinary()).unwrap_err().code,
            "TABLE_GRANT_SOURCE"
        );
    }
}
