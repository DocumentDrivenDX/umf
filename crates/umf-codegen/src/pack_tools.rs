// SPDX-License-Identifier: MIT OR Apache-2.0
//! Source-bound, inert SQLAlchemy/PostgreSQL pack artifact generation.
//!
//! This compiler consumes the complete, locally supplied domain-pack closure.
//! It emits schema declarations and caller-owned-session CRUD helpers only;
//! it never installs anything or invents lifecycle, roles, access policy,
//! primary keys, data, or action meaning.

use crate::{
    canonical::canonical_sha256,
    value::{array_items, member, read_source_value, string_member},
};
use std::collections::{BTreeSet, HashMap, HashSet};
use umf_core::{
    Context, EngineError, Utf16, Value,
    serialization::{self, Format},
};

const REQUEST_PROFILE: &str = "umf.pack-tools/1";
const RESULT_PROFILE: &str = "umf.pack-tools-result/1";
const MAX_INPUT_UNITS: usize = 4 * 1024 * 1024;
const MAX_SOURCES: usize = 256;
const MAX_OUTPUT_UNITS: usize = 16 * 1024 * 1024;
const MAX_FILES: usize = 32;

#[derive(Clone)]
struct Column {
    name: String,
    data_type: String,
    nullable: bool,
    precision: Option<u32>,
    scale: Option<u32>,
    description: Option<String>,
    domain_type: Option<String>,
}

#[derive(Clone)]
struct ForeignKey {
    column: String,
    target_table: String,
    target_column: String,
    path: String,
}

#[derive(Clone)]
struct Table {
    source_id: String,
    name: String,
    description: Option<String>,
    columns: Vec<Column>,
    primary_key: Vec<String>,
    unique_constraints: Vec<Vec<String>>,
    foreign_keys: Vec<ForeignKey>,
    class_name: Option<String>,
    attribute_names: Vec<String>,
    supported_type: bool,
    keyed: bool,
}

#[derive(Clone)]
struct Source {
    id: String,
    path: String,
    format: String,
    schema_format: String,
    text: String,
    value: Value,
}

fn err(code: &str, path: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::from(path), message)
}

fn text(value: &Value, path: &str) -> Result<String, EngineError> {
    match value {
        Value::String(value) => value
            .to_utf8()
            .map_err(|_| err("PACK_TOOLS_INPUT", path, "Invalid Unicode text")),
        _ => Err(err("PACK_TOOLS_INPUT", path, "Expected a string")),
    }
}

fn required_string(value: &Value, key: &str, path: &str) -> Result<String, EngineError> {
    let item = member(value, key)
        .ok_or_else(|| err("PACK_TOOLS_INPUT", path, "Required string is missing"))?;
    text(item, path)
}

fn exact_members(value: &Value, allowed: &[&str], path: &str) -> Result<(), EngineError> {
    let Value::Object(fields) = value else {
        return Err(err("PACK_TOOLS_INPUT", path, "Expected an object"));
    };
    for (key, _) in fields {
        let key = key
            .to_utf8()
            .map_err(|_| err("PACK_TOOLS_INPUT", path, "Invalid Unicode property name"))?;
        if !allowed.contains(&key.as_str()) {
            return Err(err("PACK_TOOLS_INPUT", path, "Unknown object member"));
        }
    }
    Ok(())
}

fn report_unrecognized_members(
    value: &Value,
    allowed: &[&str],
    source: &str,
    path: &str,
    diagnostics: &mut Vec<Value>,
) {
    let Value::Object(fields) = value else {
        return;
    };
    for (key, _) in fields {
        let Ok(key) = key.to_utf8() else {
            continue;
        };
        if !allowed.contains(&key.as_str()) {
            diagnostics.push(diagnostic(
                "warning",
                "PACK_TOOLS_ATTRIBUTE_NOT_GENERATED",
                source,
                &format!("{path}/{key}"),
                "This declared property is preserved in source-companion.json but is not interpreted by the pack-tools v1 relational subset.",
            ));
        }
    }
}

fn json_string(value: impl Into<String>) -> Value {
    Value::String(Utf16::from(value.into()))
}
fn json_array(values: Vec<Value>) -> Value {
    Value::Array(values)
}
fn json_object(values: Vec<(&str, Value)>) -> Value {
    Value::Object(
        values
            .into_iter()
            .map(|(key, value)| (Utf16::from(key), value))
            .collect(),
    )
}

fn hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push(HEX[(byte >> 4) as usize] as char);
        out.push(HEX[(byte & 15) as usize] as char);
    }
    out
}

fn digest(text: &str, ctx: &mut Context<'_>) -> Result<String, EngineError> {
    Ok(hex(&crate::canonical::sha256_source_text(
        &Utf16::from(text),
        ctx,
    )?))
}

fn py_quote(value: &str) -> String {
    let mut out = String::from("'");
    for ch in value.chars() {
        match ch {
            '\\' => out.push_str("\\\\"),
            '\'' => out.push_str("\\'"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if c.is_control() => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('\'');
    out
}

fn sql_quote(value: &str) -> String {
    format!("\"{}\"", value.replace('"', "\"\""))
}
fn sql_literal(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

fn py_tuple(values: &[String]) -> String {
    match values.len() {
        0 => "()".into(),
        1 => format!("({},)", values[0]),
        _ => format!("({})", values.join(", ")),
    }
}

fn py_bool(value: bool) -> &'static str {
    if value { "True" } else { "False" }
}

fn table_has_mutable_columns(table: &Table) -> bool {
    table
        .columns
        .iter()
        .any(|column| !table.primary_key.contains(&column.name))
}

fn identifier(value: &str, max_bytes: usize) -> bool {
    !value.is_empty() && value.len() <= max_bytes && !value.contains('\0')
}

fn py_identifier(value: &str) -> bool {
    let mut chars = value.chars();
    let Some(first) = chars.next() else {
        return false;
    };
    if !(first == '_' || first.is_ascii_alphabetic())
        || !chars.all(|c| c == '_' || c.is_ascii_alphanumeric())
    {
        return false;
    }
    !matches!(
        value,
        "False"
            | "None"
            | "True"
            | "and"
            | "as"
            | "assert"
            | "async"
            | "await"
            | "break"
            | "class"
            | "continue"
            | "def"
            | "del"
            | "elif"
            | "else"
            | "except"
            | "finally"
            | "for"
            | "from"
            | "global"
            | "if"
            | "import"
            | "in"
            | "is"
            | "lambda"
            | "nonlocal"
            | "not"
            | "or"
            | "pass"
            | "raise"
            | "return"
            | "try"
            | "while"
            | "with"
            | "yield"
            | "match"
            | "case"
    )
}

fn python_generated_symbol(value: &str) -> bool {
    matches!(
        value,
        "Base"
            | "Boolean"
            | "Date"
            | "DateTime"
            | "Decimal"
            | "DeclarativeBase"
            | "Float"
            | "ForeignKeyConstraint"
            | "Integer"
            | "Mapped"
            | "Mapping"
            | "Numeric"
            | "Session"
            | "String"
            | "Text"
            | "UniqueConstraint"
            | "date"
            | "datetime"
            | "mapped_column"
    )
}

fn python_package_reserved(value: &str) -> bool {
    matches!(
        value,
        "abc"
            | "asyncio"
            | "builtins"
            | "collections"
            | "contextlib"
            | "datetime"
            | "decimal"
            | "enum"
            | "functools"
            | "importlib"
            | "inspect"
            | "json"
            | "logging"
            | "pathlib"
            | "re"
            | "sqlalchemy"
            | "typing"
            | "typing_extensions"
    )
}

fn class_name(table: &str) -> Option<String> {
    let mut result = String::new();
    let mut upper = true;
    for ch in table.chars() {
        if ch == '_' || ch == '-' {
            upper = true;
            continue;
        }
        if !ch.is_ascii_alphanumeric() {
            return None;
        }
        if upper {
            result.push(ch.to_ascii_uppercase());
            upper = false;
        } else {
            result.push(ch);
        }
    }
    if result.is_empty() || !py_identifier(&result) || python_generated_symbol(&result) {
        None
    } else {
        Some(result)
    }
}

fn number_u32(value: &Value, path: &str) -> Result<u32, EngineError> {
    let Value::Number(number) = value else {
        return Err(err(
            "PACK_TOOLS_SCHEMA",
            path,
            "Expected a safe positive integer",
        ));
    };
    if !number.is_finite() || *number < 0.0 || number.fract() != 0.0 || *number > u32::MAX as f64 {
        return Err(err(
            "PACK_TOOLS_SCHEMA",
            path,
            "Expected a safe positive integer",
        ));
    }
    Ok(*number as u32)
}

fn table_spec_omissions(source: &Source, diagnostics: &mut Vec<Value>) {
    report_unrecognized_members(
        &source.value,
        &[
            "version",
            "table_name",
            "description",
            "columns",
            "primary_key",
            "unique_constraints",
            "relationships",
        ],
        &source.id,
        "",
        diagnostics,
    );
    if let Some(columns) = member(&source.value, "columns").and_then(array_items) {
        for (index, column) in columns.iter().enumerate() {
            report_unrecognized_members(
                column,
                &[
                    "name",
                    "data_type",
                    "nullable",
                    "precision",
                    "scale",
                    "description",
                    "domain_type",
                ],
                &source.id,
                &format!("/columns/{index}"),
                diagnostics,
            );
        }
    }
    if let Some(relationships) = member(&source.value, "relationships") {
        report_unrecognized_members(
            relationships,
            &["foreign_keys"],
            &source.id,
            "/relationships",
            diagnostics,
        );
        if let Some(foreign_keys) = member(relationships, "foreign_keys").and_then(array_items) {
            for (index, foreign_key) in foreign_keys.iter().enumerate() {
                report_unrecognized_members(
                    foreign_key,
                    &["column", "references_table", "references_column"],
                    &source.id,
                    &format!("/relationships/foreign_keys/{index}"),
                    diagnostics,
                );
            }
        }
    }
}

fn object_field(value: &Value, key: &str, path: &str) -> Result<String, EngineError> {
    required_string(value, key, path)
}

fn format_from(value: &str, path: &str) -> Result<Format, EngineError> {
    match value {
        "json" => Ok(Format::Json),
        "yaml" => Ok(Format::Yaml),
        _ => Err(err(
            "PACK_TOOLS_INPUT",
            path,
            "Source format must be json or yaml",
        )),
    }
}

fn parse_source(
    value: &Value,
    path: &str,
    ctx: &mut Context<'_>,
) -> Result<(String, String, String, String, String, Value), EngineError> {
    exact_members(
        value,
        &["id", "path", "format", "schemaFormat", "text"],
        path,
    )?;
    let id = required_string(value, "id", &format!("{path}/id"))?;
    let source_path = required_string(value, "path", &format!("{path}/path"))?;
    let format = required_string(value, "format", &format!("{path}/format"))?;
    let schema_format = required_string(value, "schemaFormat", &format!("{path}/schemaFormat"))?;
    let source_text = required_string(value, "text", &format!("{path}/text"))?;
    let parsed = read_source_value(
        &Utf16::from(source_text.as_str()),
        format_from(&format, &format!("{path}/format"))?,
        ctx,
    )?;
    Ok((id, source_path, format, schema_format, source_text, parsed))
}

// The six-value tuple is kept private to avoid carrying any parsed source into
// output except through explicit compilation paths.
fn source_tuple(value: &Value, path: &str, ctx: &mut Context<'_>) -> Result<Source, EngineError> {
    let (id, path, format, schema_format, text, value) = parse_source(value, path, ctx)?;
    Ok(Source {
        id,
        path,
        format,
        schema_format,
        text,
        value,
    })
}

fn string_list(value: &Value, path: &str) -> Result<Vec<String>, EngineError> {
    let Value::Array(items) = value else {
        return Err(err(
            "PACK_TOOLS_SCHEMA",
            path,
            "Expected an array of strings",
        ));
    };
    let mut result = Vec::with_capacity(items.len());
    let mut seen = HashSet::new();
    for (index, item) in items.iter().enumerate() {
        let value = text(item, &format!("{path}/{index}"))?;
        if !seen.insert(value.clone()) {
            return Err(err(
                "PACK_TOOLS_SCHEMA",
                &format!("{path}/{index}"),
                "Duplicate name",
            ));
        }
        result.push(value);
    }
    Ok(result)
}

fn parse_table(source: &Source, ctx: &mut Context<'_>) -> Result<Table, EngineError> {
    let root = &source.value;
    if string_member(root, "version")
        .and_then(|v| v.to_utf8().ok())
        .as_deref()
        != Some("1.0")
    {
        return Err(err(
            "PACK_TOOLS_TABLESPEC",
            &format!("/sources/{}/version", source.id),
            "Expected TableSpec table version 1.0",
        ));
    }
    let name = object_field(
        root,
        "table_name",
        &format!("/sources/{}/table_name", source.id),
    )?;
    if !identifier(&name, 63) {
        return Err(err(
            "PACK_TOOLS_TABLESPEC",
            &format!("/sources/{}/table_name", source.id),
            "PostgreSQL table name must be a valid nonempty identifier of at most 63 UTF-8 bytes",
        ));
    }
    let description = member(root, "description")
        .map(|v| text(v, &format!("/sources/{}/description", source.id)))
        .transpose()?;
    let raw_columns = array_items(member(root, "columns").ok_or_else(|| {
        err(
            "PACK_TOOLS_TABLESPEC",
            &format!("/sources/{}/columns", source.id),
            "Required columns array is missing",
        )
    })?)
    .ok_or_else(|| {
        err(
            "PACK_TOOLS_TABLESPEC",
            &format!("/sources/{}/columns", source.id),
            "Expected a columns array",
        )
    })?;
    if raw_columns.is_empty() {
        return Err(err(
            "PACK_TOOLS_TABLESPEC",
            &format!("/sources/{}/columns", source.id),
            "Table must declare at least one column",
        ));
    }
    let mut columns = Vec::with_capacity(raw_columns.len());
    let mut names = HashSet::new();
    for (index, raw) in raw_columns.iter().enumerate() {
        ctx.charge_work(
            1,
            Utf16::from(format!("/sources/{}/columns/{index}", source.id)),
        )?;
        let path = format!("/sources/{}/columns/{index}", source.id);
        let column_name = object_field(raw, "name", &format!("{path}/name"))?;
        if !identifier(&column_name, 63) || !names.insert(column_name.clone()) {
            return Err(err(
                "PACK_TOOLS_TABLESPEC",
                &format!("{path}/name"),
                "Column name is invalid or duplicated",
            ));
        }
        let data_type = object_field(raw, "data_type", &format!("{path}/data_type"))?;
        let nullable = match member(raw, "nullable") {
            Some(Value::Bool(v)) => *v,
            _ => {
                return Err(err(
                    "PACK_TOOLS_TABLESPEC",
                    &format!("{path}/nullable"),
                    "Explicit boolean nullability is required",
                ));
            }
        };
        let precision = member(raw, "precision")
            .map(|v| number_u32(v, &format!("{path}/precision")))
            .transpose()?;
        let scale = member(raw, "scale")
            .map(|v| number_u32(v, &format!("{path}/scale")))
            .transpose()?;
        if precision.is_some() != scale.is_some() {
            return Err(err(
                "PACK_TOOLS_TABLESPEC",
                &path,
                "DECIMAL precision and scale must both be declared",
            ));
        }
        if let (Some(precision), Some(scale)) = (precision, scale) {
            if precision == 0 || scale > precision {
                return Err(err(
                    "PACK_TOOLS_TABLESPEC",
                    &path,
                    "DECIMAL precision must be positive and scale cannot exceed precision",
                ));
            }
        }
        let description = member(raw, "description")
            .map(|v| text(v, &format!("{path}/description")))
            .transpose()?;
        let domain_type = member(raw, "domain_type")
            .map(|v| text(v, &format!("{path}/domain_type")))
            .transpose()?;
        columns.push(Column {
            name: column_name,
            data_type,
            nullable,
            precision,
            scale,
            description,
            domain_type,
        });
    }
    let primary_key = match member(root, "primary_key") {
        Some(value) => string_list(value, &format!("/sources/{}/primary_key", source.id))?,
        None => Vec::new(),
    };
    for key in &primary_key {
        let column = columns
            .iter()
            .find(|column| &column.name == key)
            .ok_or_else(|| {
                err(
                    "PACK_TOOLS_TABLESPEC",
                    &format!("/sources/{}/primary_key", source.id),
                    "Primary key references a missing column",
                )
            })?;
        if column.nullable {
            return Err(err(
                "PACK_TOOLS_TABLESPEC",
                &format!("/sources/{}/primary_key", source.id),
                "Primary key columns must be declared non-null",
            ));
        }
    }
    let mut unique_constraints = Vec::new();
    if let Some(raw) = member(root, "unique_constraints") {
        let values = array_items(raw).ok_or_else(|| {
            err(
                "PACK_TOOLS_TABLESPEC",
                &format!("/sources/{}/unique_constraints", source.id),
                "Expected an array",
            )
        })?;
        for (index, value) in values.iter().enumerate() {
            let names = string_list(
                value,
                &format!("/sources/{}/unique_constraints/{index}", source.id),
            )?;
            if names.is_empty()
                || names
                    .iter()
                    .any(|name| !columns.iter().any(|column| &column.name == name))
            {
                return Err(err(
                    "PACK_TOOLS_TABLESPEC",
                    &format!("/sources/{}/unique_constraints/{index}", source.id),
                    "Unique constraint must name existing columns",
                ));
            }
            unique_constraints.push(names);
        }
    }
    let mut foreign_keys = Vec::new();
    if let Some(relationships) = member(root, "relationships") {
        if let Some(raw) = member(relationships, "foreign_keys") {
            let items = array_items(raw).ok_or_else(|| {
                err(
                    "PACK_TOOLS_TABLESPEC",
                    &format!("/sources/{}/relationships/foreign_keys", source.id),
                    "Expected an array",
                )
            })?;
            for (index, item) in items.iter().enumerate() {
                let path = format!("/sources/{}/relationships/foreign_keys/{index}", source.id);
                let column = object_field(item, "column", &format!("{path}/column"))?;
                let target_table = object_field(
                    item,
                    "references_table",
                    &format!("{path}/references_table"),
                )?;
                let target_column = object_field(
                    item,
                    "references_column",
                    &format!("{path}/references_column"),
                )?;
                if !columns.iter().any(|value| value.name == column) {
                    return Err(err(
                        "PACK_TOOLS_TABLESPEC",
                        &path,
                        "Foreign key source column does not exist",
                    ));
                }
                foreign_keys.push(ForeignKey {
                    column,
                    target_table,
                    target_column,
                    path,
                });
            }
        }
    }
    Ok(Table {
        source_id: source.id.clone(),
        name,
        description,
        columns,
        primary_key,
        unique_constraints,
        foreign_keys,
        class_name: None,
        attribute_names: Vec::new(),
        supported_type: true,
        keyed: false,
    })
}

fn postgres_type(column: &Column) -> Option<String> {
    match column.data_type.as_str() {
        "VARCHAR" => Some("VARCHAR".into()),
        "TEXT" => Some("TEXT".into()),
        "CHAR" => None,
        "INTEGER" => Some("INTEGER".into()),
        "DECIMAL" => Some(match (column.precision, column.scale) {
            (Some(p), Some(s)) => format!("NUMERIC({p},{s})"),
            (None, None) => "NUMERIC".into(),
            _ => return None,
        }),
        "FLOAT" => Some("DOUBLE PRECISION".into()),
        "BOOLEAN" => Some("BOOLEAN".into()),
        "DATE" => Some("DATE".into()),
        "DATETIME" | "TIMESTAMP" => Some("TIMESTAMP WITHOUT TIME ZONE".into()),
        _ => None,
    }
}

fn sqlalchemy_type(column: &Column) -> Option<(&'static str, String)> {
    match column.data_type.as_str() {
        "VARCHAR" => Some(("str", "String()".into())),
        "TEXT" => Some(("str", "Text()".into())),
        "INTEGER" => Some(("int", "Integer()".into())),
        "DECIMAL" => Some((
            "Decimal",
            match (column.precision, column.scale) {
                (Some(p), Some(s)) => format!("Numeric({p}, {s})"),
                (None, None) => "Numeric()".into(),
                _ => return None,
            },
        )),
        "FLOAT" => Some(("float", "Float()".into())),
        "BOOLEAN" => Some(("bool", "Boolean()".into())),
        "DATE" => Some(("date", "Date()".into())),
        "DATETIME" | "TIMESTAMP" => Some(("datetime", "DateTime(timezone=False)".into())),
        _ => None,
    }
}

fn class_and_attributes(table: &mut Table) -> Result<(), String> {
    let Some(class_name) = class_name(&table.name) else {
        return Err("Table name cannot form a safe Python class name".into());
    };
    let mut attributes = Vec::with_capacity(table.columns.len());
    let mut seen = HashSet::new();
    for column in &table.columns {
        if !py_identifier(&column.name)
            || matches!(column.name.as_str(), "metadata" | "registry")
            || column.name.starts_with("__")
        {
            return Err(format!(
                "Column `{}` cannot be represented as a safe SQLAlchemy attribute",
                column.name
            ));
        }
        if !seen.insert(column.name.clone()) {
            return Err("Duplicate Python attribute".into());
        }
        attributes.push(column.name.clone());
    }
    table.class_name = Some(class_name);
    table.attribute_names = attributes;
    table.keyed = !table.primary_key.is_empty();
    table.supported_type &= table
        .columns
        .iter()
        .all(|column| postgres_type(column).is_some() && sqlalchemy_type(column).is_some());
    Ok(())
}

fn diagnostic(severity: &str, code: &str, source: &str, path: &str, message: &str) -> Value {
    json_object(vec![
        ("severity", json_string(severity)),
        ("code", json_string(code)),
        ("source", json_string(source)),
        ("path", json_string(path)),
        ("message", json_string(message)),
    ])
}

fn status_value(value: &str) -> Value {
    json_string(value)
}

fn coverage(source: &str, status: &str, table: Option<&str>, operations: Vec<String>) -> Value {
    let mut fields = vec![
        ("source", json_string(source)),
        ("status", status_value(status)),
        (
            "operations",
            json_array(operations.into_iter().map(json_string).collect()),
        ),
    ];
    if let Some(table) = table {
        fields.push(("table", json_string(table)));
    }
    json_object(fields)
}

fn file(path: &str, text: String, kind: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let sha256 = digest(&text, ctx)?;
    Ok(json_object(vec![
        ("path", json_string(path)),
        ("text", json_string(text)),
        ("sha256", json_string(sha256)),
        ("kind", json_string(kind)),
    ]))
}

fn write_json_text(value: &Value, ctx: &mut Context<'_>) -> Result<String, EngineError> {
    serialization::write_json_value(value, Format::Json, ctx)?
        .to_utf8()
        .map_err(|_| {
            err(
                "PACK_TOOLS_SERIALIZATION",
                "",
                "Generated JSON output is not valid UTF-8",
            )
        })
}

fn type_annotation(column: &Column) -> Option<(&'static str, String)> {
    let (mut py_type, sql_type) = sqlalchemy_type(column)?;
    if column.nullable {
        py_type = match py_type {
            "str" => "str | None",
            "int" => "int | None",
            "Decimal" => "Decimal | None",
            "float" => "float | None",
            "bool" => "bool | None",
            "date" => "date | None",
            "datetime" => "datetime | None",
            _ => return None,
        };
    }
    Some((py_type, sql_type))
}

fn same_sql_type(left: &Column, right: &Column) -> bool {
    left.data_type == right.data_type
        && left.precision == right.precision
        && left.scale == right.scale
}

fn orm_fk_target<'a>(
    fk: &ForeignKey,
    source: &Table,
    tables: &'a [Table],
    schema: &str,
) -> Option<&'a Table> {
    if schema.contains('.') || fk.column.contains('.') || fk.target_column.contains('.') {
        return None;
    }
    let source_column = source
        .columns
        .iter()
        .find(|column| column.name == fk.column)?;
    tables
        .iter()
        .find(|candidate| candidate.name == fk.target_table)
        .filter(|target| {
            target.supported_type
                && target.keyed
                && target.class_name.is_some()
                && !target.name.contains('.')
                && target
                    .columns
                    .iter()
                    .any(|column| column.name == fk.target_column)
                && ((target.primary_key.len() == 1 && target.primary_key[0] == fk.target_column)
                    || target
                        .unique_constraints
                        .iter()
                        .any(|columns| columns.len() == 1 && columns[0] == fk.target_column))
                && target
                    .columns
                    .iter()
                    .find(|column| column.name == fk.target_column)
                    .is_some_and(|column| same_sql_type(source_column, column))
        })
}

fn diagnose_orm_foreign_keys(tables: &[Table], schema: &str, diagnostics: &mut Vec<Value>) {
    for table in tables
        .iter()
        .filter(|table| table.supported_type && table.keyed && table.class_name.is_some())
    {
        for fk in &table.foreign_keys {
            if orm_fk_target(fk, table, tables, schema).is_none() {
                diagnostics.push(diagnostic(
                    "warning",
                    "PACK_TOOLS_ORM_FK_OMITTED",
                    &table.source_id,
                    &fk.path,
                "The foreign key is retained in the source companion but omitted from ORM output because its target is absent, excluded, non-unique, type-incompatible, or not representable by SQLAlchemy's dotted reference form.",
                ));
            }
        }
    }
}

fn make_ddl(
    tables: &[Table],
    schema: &str,
    diagnostics: &mut Vec<Value>,
    ctx: &mut Context<'_>,
) -> Result<(String, Vec<Value>), EngineError> {
    let mut out = String::from(
        "-- Generated by UMF Rust pack-tools v1. Review report.json before applying.\n-- Schema-only DDL: no schema creation, grants, policies, row security, migrations, or installation.\n",
    );
    let eligible = tables
        .iter()
        .filter(|table| table.supported_type)
        .collect::<Vec<_>>();
    let names = eligible
        .iter()
        .map(|table| table.name.as_str())
        .collect::<HashSet<_>>();
    for table in &eligible {
        ctx.charge_work(
            1,
            Utf16::from(format!("/sources/{}/table", table.source_id)),
        )?;
        let mut lines = table
            .columns
            .iter()
            .map(|column| {
                format!(
                    "  {} {}{}",
                    sql_quote(&column.name),
                    postgres_type(column).unwrap(),
                    if column.nullable { "" } else { " NOT NULL" }
                )
            })
            .collect::<Vec<_>>();
        if !table.primary_key.is_empty() {
            lines.push(format!(
                "  PRIMARY KEY ({})",
                table
                    .primary_key
                    .iter()
                    .map(|name| sql_quote(name))
                    .collect::<Vec<_>>()
                    .join(", ")
            ));
        }
        for unique in &table.unique_constraints {
            lines.push(format!(
                "  UNIQUE ({})",
                unique
                    .iter()
                    .map(|name| sql_quote(name))
                    .collect::<Vec<_>>()
                    .join(", ")
            ));
        }
        out.push_str(&format!(
            "\nCREATE TABLE {}.{} (\n{}\n);\n",
            sql_quote(schema),
            sql_quote(&table.name),
            lines.join(",\n")
        ));
        if let Some(description) = &table.description {
            out.push_str(&format!(
                "COMMENT ON TABLE {}.{} IS {};\n",
                sql_quote(schema),
                sql_quote(&table.name),
                sql_literal(description)
            ));
        }
        for column in &table.columns {
            if let Some(description) = &column.description {
                out.push_str(&format!(
                    "COMMENT ON COLUMN {}.{}.{} IS {};\n",
                    sql_quote(schema),
                    sql_quote(&table.name),
                    sql_quote(&column.name),
                    sql_literal(description)
                ));
            }
        }
        for column in &table.columns {
            if column.domain_type.is_some() {
                diagnostics.push(diagnostic("info", "PACK_TOOLS_DOMAIN_TYPE_NOT_ENFORCED", &table.source_id, &format!("/columns/{}", column.name), "TableSpec domain_type metadata is preserved in the source companion; no domain-specific database constraint is inferred."));
            }
        }
    }
    if eligible.is_empty() {
        return Ok((String::new(), Vec::new()));
    }
    let mut emitted_foreign_keys = HashMap::<String, usize>::new();
    for table in &eligible {
        for fk in &table.foreign_keys {
            let Some(target) = eligible
                .iter()
                .find(|candidate| candidate.name == fk.target_table)
            else {
                diagnostics.push(diagnostic("warning", "PACK_TOOLS_FK_TARGET_MISSING", &table.source_id, &fk.path, "Foreign key target table is outside the generated TableSpec closure; the reference is retained in source-companion.json."));
                continue;
            };
            if !names.contains(target.name.as_str())
                || !target
                    .columns
                    .iter()
                    .any(|column| column.name == fk.target_column)
            {
                diagnostics.push(diagnostic("warning", "PACK_TOOLS_FK_TARGET_COLUMN_MISSING", &table.source_id, &fk.path, "Foreign key target column is unresolved in the generated TableSpec closure; the reference is retained in source-companion.json."));
                continue;
            }
            let source_column = table
                .columns
                .iter()
                .find(|column| column.name == fk.column)
                .unwrap();
            let target_column = target
                .columns
                .iter()
                .find(|column| column.name == fk.target_column)
                .unwrap();
            if !same_sql_type(source_column, target_column) {
                diagnostics.push(diagnostic("warning", "PACK_TOOLS_FK_TYPE_MISMATCH", &table.source_id, &fk.path, "Foreign key source and target have different declared SQL types; the constraint is not emitted."));
                continue;
            }
            let target_is_unique = (target.primary_key.len() == 1
                && target.primary_key[0] == fk.target_column)
                || target
                    .unique_constraints
                    .iter()
                    .any(|cols| cols.len() == 1 && cols[0] == fk.target_column);
            if !target_is_unique {
                diagnostics.push(diagnostic("warning", "PACK_TOOLS_FK_TARGET_NOT_UNIQUE", &table.source_id, &fk.path, "PostgreSQL requires the referenced column to be unique; the foreign key is not emitted."));
                continue;
            }
            out.push_str(&format!(
                "ALTER TABLE {}.{} ADD FOREIGN KEY ({}) REFERENCES {}.{} ({});\n",
                sql_quote(schema),
                sql_quote(&table.name),
                sql_quote(&fk.column),
                sql_quote(schema),
                sql_quote(&target.name),
                sql_quote(&fk.target_column)
            ));
            *emitted_foreign_keys
                .entry(table.source_id.clone())
                .or_default() += 1;
        }
    }
    let generated = eligible
        .iter()
        .map(|table| {
            coverage(
                &table.source_id,
                "generated",
                Some(&table.name),
                vec![
                    "ddl:create_table".into(),
                    if table.primary_key.is_empty() {
                        "ddl:no_primary_key_declared".into()
                    } else {
                        "ddl:primary_key".into()
                    },
                    format!(
                        "ddl:foreign_keys:{}",
                        emitted_foreign_keys
                            .get(&table.source_id)
                            .copied()
                            .unwrap_or(0)
                    ),
                    format!("ddl:unique_constraints:{}", table.unique_constraints.len()),
                ],
            )
        })
        .collect::<Vec<_>>();
    Ok((out, generated))
}

fn model_python<'a>(tables: &'a [Table], schema: &str) -> (String, Vec<&'a Table>) {
    let mut out = String::from(
        "# Generated by UMF Rust pack-tools v1.\n# Source companion and report are required reading; no database was contacted.\nfrom __future__ import annotations\n\nfrom datetime import date, datetime\nfrom decimal import Decimal\nfrom sqlalchemy import Boolean, Date, DateTime, Float, ForeignKeyConstraint, Integer, Numeric, String, Text, UniqueConstraint\nfrom sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column\n\n\nclass Base(DeclarativeBase):\n    pass\n\n\n",
    );
    let eligible = tables
        .iter()
        .filter(|table| table.supported_type && table.keyed && table.class_name.is_some())
        .collect::<Vec<_>>();
    for table in &eligible {
        let class = table.class_name.as_deref().unwrap();
        out.push_str(&format!(
            "class {class}(Base):\n    __tablename__ = {}\n",
            py_quote(&table.name)
        ));
        let fks = table
            .foreign_keys
            .iter()
            .filter_map(|fk| {
                orm_fk_target(fk, table, tables, schema).map(|target| {
                    format!(
                        "ForeignKeyConstraint([{}], [{}])",
                        py_quote(&fk.column),
                        py_quote(&format!("{}.{}.{}", schema, target.name, fk.target_column))
                    )
                })
            })
            .collect::<Vec<_>>();
        let uniques = table
            .unique_constraints
            .iter()
            .map(|cols| {
                format!(
                    "UniqueConstraint({})",
                    cols.iter()
                        .map(|name| py_quote(name))
                        .collect::<Vec<_>>()
                        .join(", ")
                )
            })
            .collect::<Vec<_>>();
        let mut constraints = fks;
        constraints.extend(uniques);
        if constraints.is_empty() {
            out.push_str(&format!(
                "    __table_args__ = {{'schema': {}}}\n",
                py_quote(schema)
            ));
        } else {
            out.push_str(&format!(
                "    __table_args__ = ({}, {{'schema': {}}})\n",
                constraints.join(", "),
                py_quote(schema)
            ));
        }
        for (column, attribute) in table.columns.iter().zip(&table.attribute_names) {
            let (annotation, sql_type) = type_annotation(column).unwrap();
            let key = table.primary_key.contains(&column.name);
            out.push_str(&format!("    {attribute}: Mapped[{annotation}] = mapped_column({sql_type}, primary_key={}, autoincrement=False, nullable={}, comment={})\n", py_bool(key), py_bool(column.nullable), column.description.as_deref().map(py_quote).unwrap_or_else(|| "None".into())));
        }
        out.push('\n');
    }
    (out, eligible)
}

fn crud_python(tables: &[Table]) -> (String, Vec<&Table>) {
    let mut out = String::from(
        "# Generated by UMF Rust pack-tools v1.\n# All functions use the caller-owned Session. They flush but never commit or roll back.\nfrom __future__ import annotations\n\nfrom collections.abc import Mapping\nfrom sqlalchemy import select\nfrom sqlalchemy.orm import Session\nfrom .models import *\n\n\ndef _exact_mapping(value: Mapping[str, object], allowed: tuple[str, ...], required: tuple[str, ...] = ()) -> dict[str, object]:\n    if not isinstance(value, Mapping):\n        raise TypeError('Expected a mapping')\n    keys = set(value)\n    extra = keys - set(allowed)\n    missing = set(required) - keys\n    if extra or missing:\n        raise ValueError(f'Unexpected fields {sorted(extra)} or missing fields {sorted(missing)}')\n    return dict(value)\n\n",
    );
    let eligible = tables
        .iter()
        .filter(|table| table.supported_type && table.keyed && table.class_name.is_some())
        .collect::<Vec<_>>();
    for table in &eligible {
        let class = table.class_name.as_deref().unwrap();
        let suffix = class.to_ascii_lowercase();
        let all = table
            .columns
            .iter()
            .map(|column| py_quote(&column.name))
            .collect::<Vec<_>>()
            .join(", ");
        let key_items = table
            .primary_key
            .iter()
            .map(|column| py_quote(column))
            .collect::<Vec<_>>();
        let keys = py_tuple(&key_items);
        let required_values = py_tuple(
            &table
                .columns
                .iter()
                .filter(|column| !column.nullable)
                .map(|column| py_quote(&column.name))
                .collect::<Vec<_>>(),
        );
        let mutable_values = py_tuple(
            &table
                .columns
                .iter()
                .filter(|column| !table.primary_key.contains(&column.name))
                .map(|column| py_quote(&column.name))
                .collect::<Vec<_>>(),
        );
        let predicates = table
            .primary_key
            .iter()
            .map(|column| {
                format!(
                    "stmt = stmt.where({class}.{} == data[{}])",
                    table
                        .attribute_names
                        .iter()
                        .zip(&table.columns)
                        .find(|(_, candidate)| candidate.name == *column)
                        .map(|(attribute, _)| attribute.as_str())
                        .unwrap(),
                    py_quote(column)
                )
            })
            .collect::<Vec<_>>()
            .join("\n    ");
        out.push_str(&format!("def create_{suffix}(session: Session, values: Mapping[str, object]) -> {class}:\n    data = _exact_mapping(values, ({all},), {required_values})\n    row = {class}(**data)\n    session.add(row)\n    session.flush()\n    return row\n\n"));
        out.push_str(&format!("def _{suffix}_key(key: Mapping[str, object]) -> dict[str, object]:\n    return _exact_mapping(key, {keys}, {keys})\n\n"));
        out.push_str(&format!("def read_{suffix}(session: Session, key: Mapping[str, object]) -> {class} | None:\n    data = _{suffix}_key(key)\n    stmt = select({class})\n    {predicates}\n    return session.scalar(stmt)\n\n"));
        out.push_str(&format!("def list_{suffix}(session: Session, *, limit: int = 100, offset: int = 0) -> list[{class}]:\n    if not 1 <= limit <= 1000 or offset < 0:\n        raise ValueError('limit must be 1..1000 and offset must be nonnegative')\n    return list(session.scalars(select({class}).limit(limit).offset(offset)))\n\n"));
        if table_has_mutable_columns(table) {
            out.push_str(&format!("def update_{suffix}(session: Session, key: Mapping[str, object], changes: Mapping[str, object]) -> {class} | None:\n    data = _exact_mapping(changes, {mutable_values})\n    if not data:\n        raise ValueError('At least one non-key field change is required')\n    row = read_{suffix}(session, key)\n    if row is None:\n        return None\n    for name, value in data.items():\n        setattr(row, name, value)\n    session.flush()\n    return row\n\n"));
        }
        out.push_str(&format!("def delete_{suffix}(session: Session, key: Mapping[str, object]) -> bool:\n    row = read_{suffix}(session, key)\n    if row is None:\n        return False\n    session.delete(row)\n    session.flush()\n    return True\n\n"));
    }
    (out, eligible)
}

fn source_companion(
    pack_id: &str,
    pack_version: &str,
    pack_text: &str,
    sources: &[Source],
    ctx: &mut Context<'_>,
) -> Result<String, EngineError> {
    let value = json_object(vec![
        ("profile", json_string("umf.pack-tools-source-companion/1")),
        (
            "pack",
            json_object(vec![
                ("id", json_string(pack_id)),
                ("version", json_string(pack_version)),
                ("text", json_string(pack_text)),
            ]),
        ),
        (
            "sources",
            json_array(
                sources
                    .iter()
                    .map(|source| {
                        json_object(vec![
                            ("id", json_string(source.id.clone())),
                            ("path", json_string(source.path.clone())),
                            ("format", json_string(source.format.clone())),
                            ("schemaFormat", json_string(source.schema_format.clone())),
                            ("text", json_string(source.text.clone())),
                        ])
                    })
                    .collect(),
            ),
        ),
    ]);
    write_json_text(&value, ctx)
}

/// Compile the frozen `umf.pack-tools/1` request into inert, source-bound
/// artifacts. Unsupported targets are reported in coverage/diagnostics.
pub fn generate_pack_tools(request: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    exact_members(
        request,
        &["profile", "pack", "sources", "options", "targets"],
        "",
    )?;
    let request_json = serialization::write_json_value(request, Format::Json, ctx)?;
    if request_json.len() > MAX_INPUT_UNITS {
        return Err(err(
            "LIMIT",
            "",
            "Pack-tools request exceeds the 4 MiB source profile limit",
        ));
    }
    if required_string(request, "profile", "/profile")? != REQUEST_PROFILE {
        return Err(err(
            "PACK_TOOLS_PROFILE",
            "/profile",
            "Unknown pack-tools request profile",
        ));
    }
    let pack = member(request, "pack")
        .ok_or_else(|| err("PACK_TOOLS_INPUT", "/pack", "Pack envelope is required"))?;
    exact_members(pack, &["id", "version", "text"], "/pack")?;
    let pack_id = required_string(pack, "id", "/pack/id")?;
    let pack_version = required_string(pack, "version", "/pack/version")?;
    let pack_text = required_string(pack, "text", "/pack/text")?;
    if pack_text.len() > MAX_INPUT_UNITS {
        return Err(err(
            "LIMIT",
            "/pack/text",
            "Pack-tools input exceeds the 4 MiB source profile limit",
        ));
    }
    if pack_id.is_empty() || pack_version.is_empty() {
        return Err(err(
            "PACK_TOOLS_INPUT",
            "/pack",
            "Pack identity and version must be nonempty",
        ));
    }
    let manifest = read_source_value(&Utf16::from(pack_text.as_str()), Format::Json, ctx)?;
    if string_member(&manifest, "id")
        .and_then(|v| v.to_utf8().ok())
        .as_deref()
        != Some(pack_id.as_str())
        || string_member(&manifest, "version")
            .and_then(|v| v.to_utf8().ok())
            .as_deref()
            != Some(pack_version.as_str())
    {
        return Err(err(
            "PACK_TOOLS_PACK_IDENTITY",
            "/pack",
            "Pack identity/version differs from the supplied manifest text",
        ));
    }
    let options = member(request, "options")
        .ok_or_else(|| err("PACK_TOOLS_INPUT", "/options", "Options are required"))?;
    exact_members(options, &["schema", "package"], "/options")?;
    let schema = required_string(options, "schema", "/options/schema")?;
    let package = required_string(options, "package", "/options/package")?;
    if !identifier(&schema, 63) {
        return Err(err(
            "PACK_TOOLS_OPTIONS",
            "/options/schema",
            "Expected a PostgreSQL schema identifier of at most 63 UTF-8 bytes",
        ));
    }
    if !py_identifier(&package)
        || package
            .chars()
            .next()
            .is_some_and(|ch| !ch.is_ascii_lowercase())
        || python_package_reserved(&package)
    {
        return Err(err(
            "PACK_TOOLS_OPTIONS",
            "/options/package",
            "Expected a lowercase Python package identifier",
        ));
    }
    let target_values = array_items(member(request, "targets").ok_or_else(|| {
        err(
            "PACK_TOOLS_INPUT",
            "/targets",
            "Requested targets are required",
        )
    })?)
    .ok_or_else(|| err("PACK_TOOLS_INPUT", "/targets", "Expected an array"))?;
    if target_values.is_empty() {
        return Err(err(
            "PACK_TOOLS_OPTIONS",
            "/targets",
            "Select at least one target",
        ));
    }
    let mut targets = BTreeSet::new();
    for (index, value) in target_values.iter().enumerate() {
        let target = text(value, &format!("/targets/{index}"))?;
        if !["ddl", "orm", "crud"].contains(&target.as_str()) || !targets.insert(target.clone()) {
            return Err(err(
                "PACK_TOOLS_OPTIONS",
                &format!("/targets/{index}"),
                "Target must be a unique ddl, orm, or crud value",
            ));
        }
    }
    let source_values = array_items(member(request, "sources").ok_or_else(|| {
        err(
            "PACK_TOOLS_INPUT",
            "/sources",
            "Complete declared source closure is required",
        )
    })?)
    .ok_or_else(|| err("PACK_TOOLS_INPUT", "/sources", "Expected an array"))?;
    if source_values.len() > MAX_SOURCES {
        return Err(err(
            "LIMIT",
            "/sources",
            "Pack-tools input exceeds the 256-source profile limit",
        ));
    }
    let mut sources = Vec::with_capacity(source_values.len());
    let mut input_units = pack_text.len();
    for (index, source) in source_values.iter().enumerate() {
        let parsed = source_tuple(source, &format!("/sources/{index}"), ctx)?;
        input_units = input_units
            .checked_add(parsed.text.len())
            .ok_or_else(|| err("LIMIT", "/sources", "Pack-tools input size overflow"))?;
        if input_units > MAX_INPUT_UNITS {
            return Err(err(
                "LIMIT",
                "/sources",
                "Pack-tools input exceeds the 4 MiB source profile limit",
            ));
        }
        sources.push(parsed);
    }
    let mut ids = HashSet::new();
    for source in &sources {
        if source.id.is_empty() || source.path.is_empty() || !ids.insert(source.id.clone()) {
            return Err(err(
                "PACK_TOOLS_INPUT",
                "/sources",
                "Source IDs/paths must be nonempty and IDs unique",
            ));
        }
    }
    let declarations = array_items(member(&manifest, "schemas").ok_or_else(|| {
        err(
            "PACK_TOOLS_CLOSURE",
            "/pack/text/schemas",
            "Pack manifest must declare schemas",
        )
    })?)
    .ok_or_else(|| {
        err(
            "PACK_TOOLS_CLOSURE",
            "/pack/text/schemas",
            "Pack schemas must be an array",
        )
    })?;
    if declarations.len() != sources.len() {
        return Err(err(
            "PACK_TOOLS_CLOSURE",
            "/sources",
            "Supplied sources must exactly cover the pack manifest's local schema declarations",
        ));
    }
    for declaration in declarations {
        let id = string_member(declaration, "id")
            .and_then(|v| v.to_utf8().ok())
            .ok_or_else(|| {
                err(
                    "PACK_TOOLS_CLOSURE",
                    "/pack/text/schemas",
                    "Schema declaration needs an ID",
                )
            })?;
        let path = string_member(declaration, "reference")
            .and_then(|v| v.to_utf8().ok())
            .ok_or_else(|| {
                err(
                    "PACK_TOOLS_CLOSURE",
                    "/pack/text/schemas",
                    "Schema declaration needs a local reference",
                )
            })?;
        let schema_format = string_member(declaration, "format")
            .and_then(|v| v.to_utf8().ok())
            .unwrap_or_default();
        let Some(source) = sources.iter().find(|source| source.id == id) else {
            return Err(err(
                "PACK_TOOLS_CLOSURE",
                "/sources",
                "A declared schema source is missing",
            ));
        };
        if source.path != path || source.schema_format != schema_format {
            return Err(err(
                "PACK_TOOLS_CLOSURE",
                &format!("/sources/{}", source.id),
                "Source path/schema format differs from its pack declaration",
            ));
        }
    }
    let source_material = json_object(vec![
        (
            "pack",
            json_object(vec![
                ("id", json_string(pack_id.clone())),
                ("version", json_string(pack_version.clone())),
                ("text", json_string(pack_text.clone())),
            ]),
        ),
        (
            "sources",
            json_array(
                sources
                    .iter()
                    .map(|source| {
                        json_object(vec![
                            ("id", json_string(source.id.clone())),
                            ("path", json_string(source.path.clone())),
                            ("format", json_string(source.format.clone())),
                            ("schemaFormat", json_string(source.schema_format.clone())),
                            ("text", json_string(source.text.clone())),
                        ])
                    })
                    .collect(),
            ),
        ),
    ]);
    let source_digest = hex(&canonical_sha256(&source_material, ctx)?);
    let mut diagnostics = Vec::new();
    let mut tables = Vec::new();
    let mut coverage_items = Vec::new();
    for source in &sources {
        if source.schema_format == "tablespec" {
            match parse_table(source, ctx) {
                Ok(table) => {
                    table_spec_omissions(source, &mut diagnostics);
                    tables.push(table);
                }
                Err(error) if error.is_control_failure() || error.code == "LIMIT" => {
                    return Err(error);
                }
                Err(error) => diagnostics.push(diagnostic(
                    "error",
                    "PACK_TOOLS_TABLESPEC_INVALID",
                    &source.id,
                    &error.path.to_utf8().unwrap_or_default(),
                    &error.message.to_utf8().unwrap_or_default(),
                )),
            }
        } else if source.schema_format != "umf" {
            diagnostics.push(diagnostic("info", "PACK_TOOLS_SOURCE_RETAINED", &source.id, &source.path, "Source format is retained in source-companion.json; this compiler does not interpret it as a relational table."));
        }
    }
    for source in sources
        .iter()
        .filter(|source| source.schema_format == "umf")
    {
        diagnostics.push(diagnostic("info", "PACK_TOOLS_UMF_SOURCE_RETAINED", &source.id, &source.path, "UMF ontology/source is preserved in source-companion.json; without an explicit binding contract, it does not add or alter relational tables or keys."));
    }
    let mut table_name_counts = HashMap::<String, usize>::new();
    for table in &tables {
        *table_name_counts.entry(table.name.clone()).or_default() += 1;
    }
    let mut seen_tables = HashSet::new();
    let mut seen_classes = HashMap::<String, String>::new();
    let mut seen_crud_suffixes = HashMap::<String, String>::new();
    for table in &mut tables {
        if !seen_tables.insert(table.name.clone())
            || table_name_counts.get(&table.name).copied().unwrap_or(0) > 1
        {
            if seen_tables.contains(&table.name)
                && table_name_counts.get(&table.name).copied().unwrap_or(0) > 1
            {
                diagnostics.push(diagnostic("error", "PACK_TOOLS_TABLE_DUPLICATE", &table.source_id, "/table_name", "Duplicate table name in the declared pack closure; every table with this name is excluded from generated outputs."));
            }
            table.supported_type = false;
        }
        if let Err(message) = class_and_attributes(table) {
            diagnostics.push(diagnostic(
                "error",
                "PACK_TOOLS_ORM_UNSUPPORTED",
                &table.source_id,
                "/columns",
                &message,
            ));
            table.class_name = None;
        }
        if let Some(class) = &table.class_name {
            let suffix = class.to_ascii_lowercase();
            if seen_classes
                .insert(class.clone(), table.name.clone())
                .is_some()
                || seen_crud_suffixes
                    .insert(suffix, table.name.clone())
                    .is_some()
            {
                diagnostics.push(diagnostic("error", "PACK_TOOLS_CLASS_NAME_COLLISION", &table.source_id, "/table_name", "Two source tables map to the same Python class or CRUD function names; the colliding table is excluded from ORM and CRUD outputs."));
                table.class_name = None;
            }
        }
        if !table.supported_type {
            let unsupported = table
                .columns
                .iter()
                .find(|column| postgres_type(column).is_none() || sqlalchemy_type(column).is_none())
                .map(|column| column.data_type.as_str())
                .unwrap_or("inconsistent primary key");
            diagnostics.push(diagnostic(
                "error",
                "PACK_TOOLS_TYPE_UNSUPPORTED",
                &table.source_id,
                "/columns",
                &format!(
                    "Column type `{unsupported}` is not supported by PostgreSQL/SQLAlchemy v1."
                ),
            ));
        }
    }
    if targets.contains("orm") || targets.contains("crud") {
        diagnose_orm_foreign_keys(&tables, &schema, &mut diagnostics);
    }
    let (mut files, mut executable_generated) = (Vec::new(), false);
    let mut generated_by_table = HashMap::<String, Vec<String>>::new();
    if targets.contains("ddl") {
        let (sql, generated) = make_ddl(&tables, &schema, &mut diagnostics, ctx)?;
        if !sql.is_empty() {
            files.push(file("schema.sql", sql, "ddl", ctx)?);
            executable_generated = true;
            for item in generated {
                if let Some(table) = string_member(&item, "table").and_then(|v| v.to_utf8().ok()) {
                    generated_by_table
                        .entry(table)
                        .or_default()
                        .push("ddl".into());
                }
            }
        } else {
            diagnostics.push(diagnostic(
                "error",
                "PACK_TOOLS_DDL_BLOCKED",
                "",
                "/targets/ddl",
                "No declared TableSpec table could be compiled.",
            ));
        }
    }
    let mut eligible_models = Vec::new();
    if targets.contains("orm") {
        let (models, eligible) = model_python(&tables, &schema);
        eligible_models = eligible;
        if !eligible_models.is_empty() {
            files.push(file(&format!("{package}/models.py"), models, "orm", ctx)?);
            executable_generated = true;
            for table in &eligible_models {
                generated_by_table
                    .entry(table.name.clone())
                    .or_default()
                    .push("orm".into());
            }
        }
        for table in tables
            .iter()
            .filter(|table| table.class_name.is_none() || !table.keyed || !table.supported_type)
        {
            diagnostics.push(diagnostic("warning", "PACK_TOOLS_ORM_TABLE_BLOCKED", &table.source_id, "/primary_key", "SQLAlchemy declarative mapping requires a supported table and an explicit primary Key; this source is retained but no ORM class is invented."));
        }
        if eligible_models.is_empty() {
            diagnostics.push(diagnostic(
                "error",
                "PACK_TOOLS_ORM_BLOCKED",
                "",
                "/targets/orm",
                "No keyed source table can be represented as a SQLAlchemy 2.0 mapped class.",
            ));
        }
    }
    let mut eligible_crud = Vec::new();
    if targets.contains("crud") {
        let (crud, eligible) = crud_python(&tables);
        eligible_crud = eligible;
        if !eligible_crud.is_empty() {
            if !targets.contains("orm") {
                let (models_text, _) = model_python(&tables, &schema);
                files.push(file(
                    &format!("{package}/models.py"),
                    models_text,
                    "orm",
                    ctx,
                )?);
            }
            files.push(file(&format!("{package}/crud.py"), crud, "crud", ctx)?);
            files.push(file(
                &format!("{package}/__init__.py"),
                package_init(&eligible_crud),
                "crud",
                ctx,
            )?);
            executable_generated = true;
            for table in &eligible_crud {
                generated_by_table
                    .entry(table.name.clone())
                    .or_default()
                    .push("crud:create".into());
                generated_by_table
                    .entry(table.name.clone())
                    .or_default()
                    .push("crud:read".into());
                generated_by_table
                    .entry(table.name.clone())
                    .or_default()
                    .push("crud:list".into());
                generated_by_table
                    .entry(table.name.clone())
                    .or_default()
                    .extend(table_has_mutable_columns(table).then_some("crud:update".into()));
                generated_by_table
                    .entry(table.name.clone())
                    .or_default()
                    .push("crud:delete".into());
            }
        }
        for table in tables
            .iter()
            .filter(|table| !table.keyed || table.class_name.is_none() || !table.supported_type)
        {
            diagnostics.push(diagnostic("warning", "PACK_TOOLS_CRUD_KEY_REQUIRED", &table.source_id, "/primary_key", "CRUD generation requires an explicit, supported primary Key; no row identity is inferred."));
        }
        if eligible_crud.is_empty() {
            diagnostics.push(diagnostic(
                "error",
                "PACK_TOOLS_CRUD_BLOCKED",
                "",
                "/targets/crud",
                "No table has a supported explicit primary Key for CRUD operations.",
            ));
        }
    }
    for source in &sources {
        if source.schema_format != "tablespec" {
            coverage_items.push(coverage(&source.id, "unsupported", None, Vec::new()));
            continue;
        }
        let Some(table) = tables.iter().find(|table| table.source_id == source.id) else {
            coverage_items.push(coverage(&source.id, "blocked", None, Vec::new()));
            continue;
        };
        let ops = generated_by_table.remove(&table.name).unwrap_or_default();
        let status = if ops.is_empty() {
            "blocked"
        } else {
            "generated"
        };
        coverage_items.push(coverage(&source.id, status, Some(&table.name), ops));
    }
    let status = if !executable_generated {
        "blocked"
    } else if diagnostics.iter().any(|diag| {
        string_member(diag, "severity")
            .and_then(|v| v.to_utf8().ok())
            .as_deref()
            == Some("error")
            || string_member(diag, "severity")
                .and_then(|v| v.to_utf8().ok())
                .as_deref()
                == Some("warning")
    }) || coverage_items.iter().any(|item| {
        matches!(
            string_member(item, "status")
                .and_then(|value| value.to_utf8().ok())
                .as_deref(),
            Some("blocked" | "unsupported")
        )
    }) {
        "partial"
    } else {
        "generated"
    };
    let companion = source_companion(&pack_id, &pack_version, &pack_text, &sources, ctx)?;
    files.push(file("source-companion.json", companion, "source", ctx)?);
    let report = json_object(vec![
        ("profile", json_string(RESULT_PROFILE)),
        ("status", json_string(status)),
        (
            "pack",
            json_object(vec![
                ("id", json_string(pack_id.clone())),
                ("version", json_string(pack_version.clone())),
            ]),
        ),
        ("sourceDigest", json_string(source_digest.clone())),
        ("diagnostics", json_array(diagnostics.clone())),
        ("coverage", json_array(coverage_items.clone())),
    ]);
    let report_text = write_json_text(&report, ctx)?;
    files.push(file("report.json", report_text, "report", ctx)?);
    let readme = generated_readme(
        &pack_id,
        &pack_version,
        &source_digest,
        status,
        &schema,
        &package,
        targets.contains("ddl"),
        &eligible_crud,
    );
    files.push(file("README.md", readme, "readme", ctx)?);
    if files.len() > MAX_FILES {
        return Err(err(
            "LIMIT",
            "/files",
            "Generated pack-tools output exceeds the 32-file profile limit",
        ));
    }
    let output_units = files
        .iter()
        .map(|file| {
            let path_size = string_member(file, "path")
                .and_then(|value| value.to_utf8().ok())
                .map(|path| path.len())
                .unwrap_or_default();
            string_member(file, "text")
                .and_then(|value| value.to_utf8().ok())
                .map(|text| text.len().saturating_add(path_size))
                .unwrap_or(path_size)
        })
        .try_fold(0usize, |sum, size| sum.checked_add(size))
        .ok_or_else(|| {
            err(
                "LIMIT",
                "/files",
                "Generated pack-tools output size overflow",
            )
        })?;
    if output_units > MAX_OUTPUT_UNITS {
        return Err(err(
            "LIMIT",
            "/files",
            "Generated pack-tools output exceeds the 16 MiB profile limit",
        ));
    }
    Ok(json_object(vec![
        ("profile", json_string(RESULT_PROFILE)),
        ("status", json_string(status)),
        (
            "pack",
            json_object(vec![
                ("id", json_string(pack_id)),
                ("version", json_string(pack_version)),
            ]),
        ),
        ("sourceDigest", json_string(source_digest)),
        ("files", json_array(files)),
        ("diagnostics", json_array(diagnostics)),
        ("coverage", json_array(coverage_items)),
    ]))
}

fn generated_readme(
    pack_id: &str,
    pack_version: &str,
    source_digest: &str,
    status: &str,
    schema: &str,
    package: &str,
    has_ddl: bool,
    crud_tables: &[&Table],
) -> String {
    let mut out = format!(
        "# Generated domain-pack tools\n\nPack: {pack_id}@{pack_version}\nSource digest: `{source_digest}`\n\nStatus: **{status}**. Review `report.json` and `source-companion.json` before using generated files.\n\n## Install runtime dependencies\n\nUse Python 3.10 or newer. Install SQLAlchemy 2.x for the generated models and CRUD:\n\n```sh\npython -m pip install 'SQLAlchemy>=2.0,<2.1'\n```\n\nWhen connecting to PostgreSQL with the psycopg 3 driver, also install:\n\n```sh\npython -m pip install 'psycopg[binary]>=3,<4'\n```\n\n## Database setup\n\nThe generated DDL is schema-only. It does not create schemas, grants, row-level security, roles, migrations, or lifecycle policies. Create the schema explicitly with a PostgreSQL client, then review and apply `schema.sql` when that file is present:\n\n```sql\nCREATE SCHEMA IF NOT EXISTS {};\n```\n\nThe account applying the DDL needs permission to create tables and constraints in that schema. The generator does not connect to a database.\n\n",
        sql_quote(schema)
    );
    if crud_tables.is_empty() {
        out.push_str("No keyed TableSpec source was available for CRUD generation in this result. Unsupported sources and reasons are recorded in `report.json`; original inputs are preserved in `source-companion.json`.\n");
        return out;
    }
    let table = crud_tables[0];
    let class = table.class_name.as_deref().unwrap_or("Model");
    let suffix = class.to_ascii_lowercase();
    let required_values = table
        .columns
        .iter()
        .map(|column| {
            format!(
                "    {}: \"<value matching the declared type>\",",
                py_quote(&column.name)
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    let key_values = table
        .primary_key
        .iter()
        .map(|column| format!("    {}: \"<exact key value>\",", py_quote(column)))
        .collect::<Vec<_>>()
        .join("\n");
    out.push_str(&format!(
        "## Caller-owned Session example\n\nThis example uses the first generated keyed TableSpec, `{}`. Replace every placeholder with a value matching the original column type and domain. Key dictionaries must contain every declared key column and no other fields. These are placeholders, not sample data.\n\n```python\nfrom sqlalchemy import create_engine\nfrom sqlalchemy.orm import Session\nfrom {package} import create_{suffix}, delete_{suffix}, list_{suffix}, read_{suffix}{}\n\nengine = create_engine(\"postgresql+psycopg://<user>:<password>@<host>/<database>\")\nvalues = {{\n{required_values}\n}}\nkey = {{\n{key_values}\n}}\n\n# Transaction ownership stays with the caller. Generated helpers flush but\n# never commit or roll back.\nwith Session(engine) as session, session.begin():\n    created = create_{suffix}(session, values)\n    found = read_{suffix}(session, key)\n    rows = list_{suffix}(session, limit=100, offset=0)\n{}    deleted = delete_{suffix}(session, key)\n```\n\n",
        table.name,
        if table_has_mutable_columns(table) { format!(", update_{suffix}") } else { String::new() },
        if table_has_mutable_columns(table) {
            let mutable = table.columns.iter().find(|column| !table.primary_key.contains(&column.name)).unwrap();
            format!("    updated = update_{suffix}(session, key, {{{}: \"<replacement value matching the declared type>\"}})\n", py_quote(&mutable.name))
        } else {
            "".into()
        }
    ));
    if !has_ddl {
        out.push_str(
            "This result did not request DDL generation; no `schema.sql` file is included.\n",
        );
    }
    out.push_str("CRUD functions use parameterized SQLAlchemy expressions and a caller-supplied `Session`. Reads use the complete explicit primary Key. Create/read/list/update/delete do not commit transactions. Primary-key values and database identity behavior are never inferred. Review warnings and unsupported coverage in `report.json` before using outputs.\n");
    out
}

fn package_init(tables: &[&Table]) -> String {
    let mut out =
        String::from("# Generated by UMF Rust pack-tools v1.\nfrom .models import Base\n");
    for table in tables {
        if let Some(class) = &table.class_name {
            out.push_str(&format!("from .models import {class}\n"));
            let suffix = class.to_ascii_lowercase();
            out.push_str(&format!(
                "from .crud import create_{suffix}, read_{suffix}, list_{suffix}, delete_{suffix}\n"
            ));
            if table_has_mutable_columns(table) {
                out.push_str(&format!("from .crud import update_{suffix}\n"));
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::generate_pack_tools;
    use crate::value::read_source_value;
    use umf_core::{Context, Utf16, Value};

    fn string(value: &str) -> Value {
        Value::string_utf8(value)
    }
    fn request(pack: &str, sources: Vec<(&str, &str, &str, &str)>, targets: &[&str]) -> Value {
        let parsed = read_source_value(
            &Utf16::from(pack),
            umf_core::serialization::Format::Json,
            &mut Context::ordinary(),
        )
        .unwrap();
        let id = super::string_member(&parsed, "id")
            .unwrap()
            .to_utf8()
            .unwrap();
        let version = super::string_member(&parsed, "version")
            .unwrap()
            .to_utf8()
            .unwrap();
        Value::Object(vec![
            (Utf16::from("profile"), string("umf.pack-tools/1")),
            (
                Utf16::from("pack"),
                Value::Object(vec![
                    (Utf16::from("id"), string(&id)),
                    (Utf16::from("version"), string(&version)),
                    (Utf16::from("text"), string(pack)),
                ]),
            ),
            (
                Utf16::from("sources"),
                Value::Array(
                    sources
                        .iter()
                        .map(|(id, path, format, text)| {
                            Value::Object(vec![
                                (Utf16::from("id"), string(id)),
                                (Utf16::from("path"), string(path)),
                                (Utf16::from("format"), string(format)),
                                (Utf16::from("schemaFormat"), string("tablespec")),
                                (Utf16::from("text"), string(text)),
                            ])
                        })
                        .collect(),
                ),
            ),
            (
                Utf16::from("options"),
                Value::Object(vec![
                    (Utf16::from("schema"), string("example")),
                    (Utf16::from("package"), string("example_pack")),
                ]),
            ),
            (
                Utf16::from("targets"),
                Value::Array(targets.iter().map(|value| string(value)).collect()),
            ),
        ])
    }

    #[test]
    fn emits_schema_only_ddl_and_parameterized_crud_from_declared_keys() {
        let pack = r#"{"id":"mini","version":"1.0.0","schemas":[{"id":"things","reference":"things.json","format":"tablespec"}]}"#;
        let source = r#"{"version":"1.0","table_name":"things","columns":[{"name":"id","data_type":"INTEGER","nullable":false},{"name":"label","data_type":"VARCHAR","nullable":false}],"primary_key":["id"]}"#;
        let output = generate_pack_tools(
            &request(
                pack,
                vec![("things", "things.json", "json", source)],
                &["ddl", "orm", "crud"],
            ),
            &mut Context::ordinary(),
        )
        .unwrap();
        assert_eq!(
            super::string_member(&output, "status")
                .unwrap()
                .to_utf8()
                .unwrap(),
            "generated"
        );
        let files = super::array_items(super::member(&output, "files").unwrap()).unwrap();
        let texts = files
            .iter()
            .filter_map(|file| {
                super::string_member(file, "text").and_then(|value| value.to_utf8().ok())
            })
            .collect::<Vec<_>>();
        let ddl = texts
            .iter()
            .find(|text| text.contains("CREATE TABLE"))
            .unwrap();
        assert!(ddl.contains("PRIMARY KEY (\"id\")"));
        let crud = texts
            .iter()
            .find(|text| text.contains("def create_things"))
            .unwrap();
        assert!(crud.contains("stmt = stmt.where(Things.id == data['id'])"));
        assert!(crud.contains("_exact_mapping(key, ('id',), ('id',))"));
        assert!(crud.contains("session.flush()"));
        assert!(!crud.contains("commit()"));
    }

    #[test]
    fn unkeyed_table_gets_schema_ddl_but_no_inferred_orm_or_crud() {
        let pack = r#"{"id":"mini","version":"1.0.0","schemas":[{"id":"things","reference":"things.json","format":"tablespec"}]}"#;
        let source = r#"{"version":"1.0","table_name":"things","columns":[{"name":"label","data_type":"VARCHAR","nullable":false}]}"#;
        let output = generate_pack_tools(
            &request(
                pack,
                vec![("things", "things.json", "json", source)],
                &["ddl", "orm", "crud"],
            ),
            &mut Context::ordinary(),
        )
        .unwrap();
        assert_eq!(
            super::string_member(&output, "status")
                .unwrap()
                .to_utf8()
                .unwrap(),
            "partial"
        );
        let files = super::array_items(super::member(&output, "files").unwrap()).unwrap();
        let all = files
            .iter()
            .filter_map(|file| {
                super::string_member(file, "text").and_then(|value| value.to_utf8().ok())
            })
            .collect::<String>();
        assert!(all.contains("CREATE TABLE"));
        assert!(!all.contains("class Things(Base)"));
        assert!(all.contains("PACK_TOOLS_CRUD_KEY_REQUIRED"));
    }

    #[test]
    fn composite_crud_uses_every_declared_key_and_rejects_key_mutation() {
        let pack = r#"{"id":"mini","version":"1.0.0","schemas":[{"id":"things","reference":"things.json","format":"tablespec"}]}"#;
        let source = r#"{"version":"1.0","table_name":"things","columns":[{"name":"tenant_id","data_type":"INTEGER","nullable":false},{"name":"item_id","data_type":"INTEGER","nullable":false},{"name":"label","data_type":"VARCHAR","nullable":true}],"primary_key":["tenant_id","item_id"]}"#;
        let output = generate_pack_tools(
            &request(
                pack,
                vec![("things", "things.json", "json", source)],
                &["crud"],
            ),
            &mut Context::ordinary(),
        )
        .unwrap();
        let files = super::array_items(super::member(&output, "files").unwrap()).unwrap();
        let crud = files
            .iter()
            .filter_map(|file| {
                super::string_member(file, "text").and_then(|value| value.to_utf8().ok())
            })
            .find(|text| text.contains("def read_things"))
            .unwrap();
        assert!(
            crud.contains(
                "_exact_mapping(key, ('tenant_id', 'item_id'), ('tenant_id', 'item_id'))"
            )
        );
        assert!(crud.contains("Things.tenant_id == data['tenant_id']"));
        assert!(crud.contains("Things.item_id == data['item_id']"));
        assert!(crud.contains("_exact_mapping(changes, ('label',))"));
    }
}
