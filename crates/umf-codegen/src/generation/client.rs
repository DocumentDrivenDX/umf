// SPDX-License-Identifier: MIT OR Apache-2.0
//! Portable Python client generation. The input source is retained verbatim;
//! all generated model data is derived from the admitted core value.

use super::{
    python::{self, string_literal},
    value as v,
};
use crate::{resources::CodegenEngine, value as raw};
use std::collections::{BTreeMap, BTreeSet};
use umf_core::{Context, EngineError, Utf16, Value};

fn fail(path: impl Into<Utf16>, message: &str) -> EngineError {
    EngineError::new("ACCESS_UNSUPPORTED", path.into(), message)
}
fn local_error_codes() -> Value {
    Value::Array(
        [
            "ALLOWED_VALUE",
            "BITS128",
            "CAPACITY",
            "CLIENT_TYPE",
            "INVALID",
            "INVALID_CURSOR",
            "INVALID_DECIMAL",
            "INVALID_FLOAT",
            "INVALID_RESPONSE",
            "INVALID_TIMESTAMP",
            "INVALID_VALUE",
            "KEY_TYPE",
            "LIMIT",
            "MISSING_VALUE",
            "NON_UNIQUE_KEY",
            "NOT_EXACTLY_ONE",
            "NULL",
            "ORDER_OWNER",
            "PRECISION",
            "PREDICATE_OWNER",
            "RANGE",
            "RELATIONSHIP_OWNER",
            "REQUIRED",
            "SCALE",
            "SCHEMA_MISMATCH",
            "TOO_MANY_ROWS",
            "TRANSPORT_FAILED",
            "TYPE",
            "UNBOUND_QUERY",
            "UNSUPPORTED",
            "WIDTH",
            "WRITE_OUTCOME_UNKNOWN",
        ]
        .into_iter()
        .map(strval)
        .collect(),
    )
}
fn strval(s: impl AsRef<str>) -> Value {
    Value::String(Utf16::from_utf8(s.as_ref()))
}
fn sha(text: &Utf16, ctx: &mut Context<'_>) -> Result<String, EngineError> {
    let digest = crate::canonical::sha256_source_text(text, ctx)?;
    Ok(digest.iter().map(|b| format!("{b:02x}")).collect())
}
fn json_string(value: &Utf16, ctx: &mut Context<'_>) -> Result<String, EngineError> {
    ctx.charge_work(value.len(), Utf16::default())?;
    let encoded =
        umf_core::serialization::stringify_compact_metered(&Value::String(value.clone()), ctx)?;
    encoded
        .to_utf8()
        .map_err(|_| fail("", "Generated JSON requires escaped Unicode scalar text"))
}
fn pretty(value: &Value, depth: usize, ctx: &mut Context<'_>) -> Result<String, EngineError> {
    use super::python::append_text;
    ctx.charge_work(1, Utf16::default())?;
    match value {
        Value::Null => Ok("null".into()),
        Value::Bool(b) => Ok(b.to_string()),
        Value::Number(n) => Ok(umf_core::ecma_number_to_string(*n)),
        Value::String(s) => json_string(s, ctx),
        Value::Array(items) => {
            ctx.charge_work(
                items
                    .len()
                    .saturating_mul((depth + 1).saturating_mul(2).saturating_add(2)),
                Utf16::default(),
            )?;
            if items.is_empty() {
                return Ok("[]".into());
            }
            let mut out = String::from("[\n");
            for (i, item) in items.iter().enumerate() {
                if i > 0 {
                    out.push_str(",\n");
                }
                out.push_str(&" ".repeat((depth + 1) * 2));
                append_text(&mut out, &pretty(item, depth + 1, ctx)?, ctx)?;
            }
            out.push('\n');
            out.push_str(&" ".repeat(depth * 2));
            out.push(']');
            Ok(out)
        }
        Value::Object(items) => {
            ctx.charge_work(
                items
                    .len()
                    .saturating_mul((depth + 1).saturating_mul(2).saturating_add(3)),
                Utf16::default(),
            )?;
            if items.is_empty() {
                return Ok("{}".into());
            }
            let mut out = String::from("{\n");
            for (i, (key, item)) in raw::js_object_members(value, ctx)?.into_iter().enumerate() {
                if i > 0 {
                    out.push_str(",\n");
                }
                out.push_str(&" ".repeat((depth + 1) * 2));
                append_text(&mut out, &json_string(key, ctx)?, ctx)?;
                out.push_str(": ");
                append_text(&mut out, &pretty(item, depth + 1, ctx)?, ctx)?;
            }
            out.push('\n');
            out.push_str(&" ".repeat(depth * 2));
            out.push('}');
            Ok(out)
        }
    }
}
fn compact(value: &Value, ctx: &mut Context<'_>) -> Result<String, EngineError> {
    let encoded = umf_core::serialization::stringify_compact_metered(value, ctx)?;
    encoded
        .to_utf8()
        .map_err(|_| fail("", "Generated JSON requires escaped Unicode scalar text"))
}
fn serde_quote(s: &str) -> String {
    let mut out = String::from("\"");
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}
fn find_metered<'a, T>(
    values: &'a [T],
    ctx: &mut Context,
    mut predicate: impl FnMut(&T) -> bool,
    mut units: impl FnMut(&T) -> usize,
) -> Result<Option<&'a T>, EngineError> {
    for value in values {
        ctx.charge_work(units(value).saturating_add(1), Utf16::default())?;
        if predicate(value) {
            return Ok(Some(value));
        }
    }
    Ok(None)
}
fn selected_ids(items: &[Value], key: &str, ctx: &mut Context) -> Result<Vec<String>, EngineError> {
    let mut values = Vec::new();
    let mut seen = BTreeSet::new();
    for item in items {
        let units = raw::string_member(item, "module")
            .map_or(9, Utf16::len)
            .saturating_add(raw::string_member(item, key).map_or(9, Utf16::len))
            .saturating_add(1);
        ctx.charge_work(units.saturating_mul(16).saturating_add(1), Utf16::default())?;
        let id = format!(
            "{}.{}",
            string_at(item, "module").unwrap_or_else(|| "undefined".into()),
            string_at(item, key).unwrap_or_else(|| "undefined".into())
        );
        if seen.insert(id.clone()) {
            values.push(id);
        }
    }
    Ok(values)
}
fn source_name(
    value: Option<&Value>,
    fallback: &str,
    path: &str,
    ctx: &mut Context<'_>,
) -> Result<String, EngineError> {
    fn js_string(value: &Value, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
        ctx.charge_work(1, Utf16::default())?;
        match value {
            Value::String(text) => {
                ctx.charge_work(text.len(), Utf16::default())?;
                Ok(text.clone())
            }
            Value::Null => Ok(Utf16::from("null")),
            Value::Bool(value) => Ok(Utf16::from(if *value { "true" } else { "false" })),
            Value::Number(number) => Ok(Utf16::from(umf_core::ecma_number_to_string(*number))),
            Value::Object(_) => Ok(Utf16::from("[object Object]")),
            Value::Array(items) => {
                let mut result = Vec::new();
                for (index, item) in items.iter().enumerate() {
                    ctx.charge_work(1, Utf16::default())?;
                    if index > 0 {
                        result.push(44);
                    }
                    if item == &Value::Null {
                        continue;
                    }
                    let text = js_string(item, ctx)?;
                    ctx.charge_work(text.len(), Utf16::default())?;
                    result.extend(text.units());
                }
                Ok(Utf16::new(result))
            }
        }
    }
    let Some(value) = value.filter(|value| **value != Value::Null) else {
        ctx.charge_work(fallback.len(), Utf16::default())?;
        return Ok(fallback.to_owned());
    };
    let text = js_string(value, ctx)?;
    ctx.charge_work(text.len().saturating_mul(4), Utf16::default())?;
    text.to_utf8()
        .map_err(|_| fail(path, "Name cannot be generated without a collision"))
}
const UNIFIED_RESERVED: &str = "AccessError Unsupported SchemaMismatch PreconditionFailed WriteOutcomeUnknown write_outcomes_unknown LOCAL_ERROR_CODES MAX_BATCH_ITEMS Page Receipt BatchReceipt BatchItemOutcome ValidationResult ExactTimestamp MISSING Missing Transport AsyncTransport SyncTransport LOCALERRORCODES MAXBATCHITEMS Any ClassVar Literal RuntimeClient RuntimeSyncClient Client AsyncClient SyncClient Actions AsyncActions SyncActions SyncQuery Query Field Ordering Relationship Enum Sequence Decimal UUID date c objects";
const PYTHON_KEYWORDS: &str = "False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case";
fn ordinary_package_name(package: &str) -> bool {
    !package.is_empty()
        && package.bytes().enumerate().all(|(i, b)| {
            if i == 0 {
                b.is_ascii_lowercase()
            } else {
                b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_'
            }
        })
        && !PYTHON_KEYWORDS
            .split_whitespace()
            .any(|word| word == package)
        && ![
            "uuid",
            "decimal",
            "typing",
            "dataclasses",
            "datetime",
            "base64",
            "re",
            "json",
            "enum",
            "collections",
        ]
        .contains(&package)
}
fn py_name(
    raw: &str,
    class: bool,
    path: &str,
    ctx: &mut Context<'_>,
) -> Result<String, EngineError> {
    ctx.charge_work(
        raw.len().saturating_mul(8).saturating_add(1),
        Utf16::from(path),
    )?;
    let chars = raw.chars().collect::<Vec<_>>();
    let mut expanded = String::new();
    for (i, ch) in chars.iter().copied().enumerate() {
        if i % 1024 == 0 {
            ctx.charge_work(1, Utf16::from(path))?;
        }
        let prev = i.checked_sub(1).and_then(|i| chars.get(i)).copied();
        let next = chars.get(i + 1).copied();
        if ch.is_ascii_uppercase()
            && prev.is_some_and(|p| {
                p.is_ascii_lowercase()
                    || p.is_ascii_digit()
                    || p.is_ascii_uppercase() && next.is_some_and(|n| n.is_ascii_lowercase())
            })
        {
            expanded.push('_');
        }
        expanded.push(ch);
    }
    // JS split(/[_. -]+/) retains empty leading/trailing words. In class
    // position its optional first-character expression spells them undefined.
    let mut words = Vec::new();
    let mut word = String::new();
    let mut separator = false;
    for (i, ch) in expanded.chars().enumerate() {
        if i % 1024 == 0 {
            ctx.charge_work(1, Utf16::from(path))?;
        }
        if matches!(ch, '_' | '.' | ' ' | '-') {
            if !separator {
                words.push(std::mem::take(&mut word));
            }
            separator = true;
        } else {
            word.push(ch);
            separator = false;
        }
    }
    words.push(word);
    let mut name = String::new();
    for (i, word) in words.iter().enumerate() {
        ctx.charge_work(word.len().saturating_add(1), Utf16::from(path))?;
        if class {
            let mut chars = word.chars();
            if let Some(first) = chars.next() {
                name.extend(first.to_uppercase());
                name.push_str(chars.as_str());
            } else {
                name.push_str("undefined");
            }
        } else {
            if i > 0 {
                name.push('_');
            }
            name.push_str(&word.to_lowercase());
        }
    }
    if name.is_empty()
        || !name.chars().next().unwrap().is_ascii_alphabetic()
        || !name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
        || PYTHON_KEYWORDS.split_whitespace().any(|s| s == name)
        || UNIFIED_RESERVED.split_whitespace().any(|s| s == name)
    {
        return Err(fail(path, "Name cannot be generated without a collision"));
    }
    Ok(name)
}
#[derive(Clone)]
struct Field {
    id: String,
    name: String,
    scalar: String,
    card: String,
    nullable: bool,
    missing: bool,
    item: Option<Box<Field>>,
    allowed: Vec<Value>,
    allowed_literals: Vec<Value>,
    facets: Value,
    semantic_types: Value,
    extensions: Option<Value>,
}
#[derive(Clone)]
struct Record {
    id: String,
    module: String,
    element: String,
    name: String,
    fields: Vec<Field>,
    key: Vec<Field>,
    key_id: String,
    selected: bool,
}
#[derive(Clone)]
struct ActionParameter {
    id: String,
    name: String,
    required: bool,
    record: Option<String>,
    field: Option<Field>,
}
#[derive(Clone)]
struct ActionInfo {
    id: String,
    module: String,
    name: String,
    class: String,
    parameters: Vec<ActionParameter>,
    affected: Vec<String>,
    raw: Value,
}
#[derive(Clone)]
struct RelationInfo {
    owner: String,
    target: String,
    owner_module: String,
    owner_element: String,
    target_module: String,
    target_element: String,
    module: String,
    id: String,
    name: String,
    direction: &'static str,
    key: String,
    pointer: String,
    logical_name: Option<Value>,
    to_one: bool,
    optional: bool,
    source_multiplicity: Value,
    target_multiplicity: Value,
}
#[derive(Clone)]
struct TableCommand {
    info: Value,
    declaration: Value,
    id: String,
    input: String,
    row: Option<String>,
    python: String,
    parameters: Vec<(Field, Option<Value>)>,
    fields: Vec<Field>,
    result: String,
    fixed_query: bool,
    replay: String,
    batch: Option<Value>,
}
#[derive(Clone)]
struct TableModule {
    id: String,
    python: String,
    class: String,
    commands: Vec<TableCommand>,
}
fn atom_type(field: &Field, missing: bool, ctx: &mut Context<'_>) -> Result<String, EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    let mut base = match field.scalar.as_str() {
        "string" => "str",
        "integer" => "int",
        "decimal" => "Decimal",
        "float" => "float",
        "boolean" => "bool",
        "binary" | "bits128" => "bytes",
        "date" => "date",
        "timestamp" => "ExactTimestamp",
        "uuid" => "UUID",
        _ => "object",
    }
    .to_owned();
    if field.card == "array" {
        if let Some(item) = &field.item {
            base = format!("tuple[{}, ...]", atom_type(item, false, ctx)?);
        }
    }
    if !field.allowed.is_empty() {
        let lits = field
            .allowed
            .iter()
            .map(|x| python::value_literal(x, ctx))
            .collect::<Result<Vec<_>, _>>()?
            .join(", ");
        base = format!("Literal[{}]", lits);
    }
    if field.nullable {
        base.push_str(" | None");
    }
    if missing {
        base.push_str(" | Missing");
    }
    Ok(base)
}
fn string_at(value: &Value, key: &str) -> Option<String> {
    raw::string_member(value, key)?.to_utf8().ok()
}
fn list<'a>(value: &'a Value, key: &str) -> Option<&'a [Value]> {
    raw::array_items(raw::member(value, key)?)
}
fn reference(value: &Value) -> Option<(String, String)> {
    Some((string_at(value, "module")?, string_at(value, "element")?))
}
fn ref_id(value: &Value) -> Option<String> {
    let (module, element) = reference(value)?;
    Some(format!("{module}.{element}"))
}
fn build_table_modules(
    inspection: &Value,
    source_modules: &[Value],
    requested: Option<&Vec<String>>,
    elements: &BTreeMap<(String, String), &Value>,
    used: &mut BTreeSet<String>,
    ctx: &mut Context<'_>,
) -> Result<(Vec<TableModule>, BTreeSet<String>), EngineError> {
    let mut result = Vec::new();
    let mut ids = BTreeSet::new();
    for inspected_module in list(inspection, "modules").unwrap_or(&[]) {
        ctx.charge_work(1, Utf16::default())?;
        let module_id = string_at(inspected_module, "module").unwrap_or_default();
        let payload = raw::member(inspected_module, "payload").unwrap_or(&Value::Null);
        let tables = list(payload, "tables").unwrap_or(&[]);
        let mut selected_tables = Vec::new();
        for table in tables {
            ctx.charge_work(1, Utf16::default())?;
            let record = raw::member(table, "record").unwrap_or(&Value::Null);
            let selected = if let Some(set) = requested {
                if let Some(key) = ref_id(record) {
                    find_metered(set, ctx, |id| id == &key, |id| id.len())?.is_some()
                } else {
                    false
                }
            } else {
                true
            };
            if selected {
                selected_tables.push(table);
            }
        }
        if selected_tables.is_empty() {
            continue;
        }
        let source_module = find_metered(
            source_modules,
            ctx,
            |module| string_at(module, "id").as_deref() == Some(module_id.as_str()),
            |module| raw::string_member(module, "id").map_or(0, Utf16::len),
        )?
        .ok_or_else(|| fail(module_id.as_str(), "Selected native module disappeared"))?;
        let extensions = raw::member(source_module, "extensions").unwrap_or(&Value::Null);
        if find_metered(
            &raw::js_object_members(extensions, ctx)?,
            ctx,
            |(key, _)| key != &Utf16::from("umf.tables"),
            |(key, _)| key.len(),
        )?
        .is_some()
        {
            return Err(fail(
                module_id.as_str(),
                "Native table module extensions require a qualified combined interpretation",
            ));
        }
        for table in &selected_tables {
            ctx.charge_work(1, Utf16::default())?;
            if let Some(id) = raw::member(table, "record").and_then(ref_id) {
                ids.insert(id);
            }
        }
        let mut selected_table_ids = BTreeSet::new();
        for table in &selected_tables {
            ctx.charge_work(1, Utf16::default())?;
            if let Some(id) = string_at(table, "id") {
                ctx.charge_work(id.len(), Utf16::default())?;
                selected_table_ids.insert(id);
            }
        }
        let mut columns = BTreeMap::<(String, String), Value>::new();
        for table in tables {
            ctx.charge_work(1, Utf16::default())?;
            for column in list(table, "columns").unwrap_or(&[]) {
                ctx.charge_work(1, Utf16::default())?;
                if let (Some(field), Some(native)) = (
                    raw::member(column, "field").and_then(reference),
                    raw::member(column, "nativeType"),
                ) {
                    columns.insert(field, native.clone());
                }
            }
        }
        let commands = list(payload, "commands").unwrap_or(&[]);
        let mut selected_commands = Vec::new();
        for command in commands {
            ctx.charge_work(1, Utf16::default())?;
            let body = raw::member(command, "body").unwrap_or(&Value::Null);
            let kind = string_at(body, "kind").unwrap_or_default();
            let selected = if kind == "query" {
                selected_tables.len() == tables.len()
            } else {
                string_at(body, "table").is_some_and(|id| selected_table_ids.contains(&id))
            };
            if selected {
                selected_commands.push(command);
            }
        }
        if selected_commands.is_empty() {
            return Err(fail(
                module_id.as_str(),
                "Native table lifecycle client requires declared operations",
            ));
        }
        let python = py_name(&module_id, false, &module_id, ctx)?;
        let prefix = py_name(&module_id, true, &module_id, ctx)?;
        let class = format!("{prefix}Module");
        if find_metered(
            &result,
            ctx,
            |module: &TableModule| module.python == python,
            |module| module.python.len(),
        )?
        .is_some()
        {
            return Err(fail(
                module_id.as_str(),
                "Generated module attribute collision",
            ));
        }
        for symbol in [&class, &format!("Sync{class}")] {
            if !used.insert(symbol.clone()) {
                return Err(fail(module_id.as_str(), "Generated native type collision"));
            }
        }
        let mut command_ids = BTreeSet::new();
        let mut admitted_commands = Vec::new();
        for command in selected_commands {
            ctx.charge_work(1, Utf16::from(module_id.as_str()))?;
            let command_id = string_at(command, "id").unwrap_or_default();
            let path = format!("{module_id}.{command_id}");
            let method = py_name(&command_id, false, &path, ctx)?;
            let body = raw::member(command, "body").unwrap_or(&Value::Null);
            let kind = string_at(body, "kind").unwrap_or_default();
            let reading = kind == "query" || kind == "read";
            let mut method_symbols = vec![method.clone()];
            if !reading {
                method_symbols.push(format!("{method}_observe"));
                if raw::member(command, "batch").is_some() {
                    method_symbols
                        .extend([format!("{method}_batch"), format!("{method}_batch_observe")]);
                }
            }
            if method_symbols
                .iter()
                .any(|symbol| !command_ids.insert(symbol.clone()))
            {
                return Err(fail(path, "Generated operation method collision"));
            }
            let stem = format!("{prefix}{}", py_name(&command_id, true, &path, ctx)?);
            let input = format!("{stem}Input");
            let row_name = format!("{stem}Row");
            if !used.insert(input.clone()) {
                return Err(fail(module_id.as_str(), "Generated native type collision"));
            }
            let mut parameters = Vec::new();
            for parameter in list(command, "parameters").unwrap_or(&[]).iter() {
                let ref_value = raw::member(parameter, "field").unwrap_or(&Value::Null);
                let mut field = parse_field(ref_value, elements, 0, ctx)?;
                field.id = string_at(parameter, "id").unwrap_or_default();
                field.missing = false;
                field.name = py_name(&field.id, false, &format!("{path}/{}", field.id), ctx)?;
                if ["self", "items", "size", "cursor", "idempotency_key"]
                    .contains(&field.name.as_str())
                {
                    return Err(fail(
                        format!("{path}/{}", field.id),
                        "Parameter conflicts with generated signature",
                    ));
                }
                let native = reference(ref_value).and_then(|key| columns.get(&key).cloned());
                parameters.push((field, native));
            }
            let mut parameter_names = BTreeSet::new();
            if find_metered(
                &parameters,
                ctx,
                |(field, _)| !parameter_names.insert(field.name.clone()),
                |(field, _)| field.name.len(),
            )?
            .is_some()
            {
                return Err(fail(path.as_str(), "Generated parameter name collision"));
            }
            let projections = if kind == "query" {
                list(body, "outputs").unwrap_or(&[])
            } else if kind == "read" {
                list(body, "fields").unwrap_or(&[])
            } else {
                list(body, "returning").unwrap_or(&[])
            };
            let mut fields = Vec::new();
            for (fi, reference) in projections.iter().enumerate() {
                let field_reference = if kind == "query" {
                    raw::member(reference, "field").unwrap_or(&Value::Null)
                } else {
                    reference
                };
                let mut field = parse_field(field_reference, elements, 0, ctx)?;
                field.missing = false;
                if kind == "query" {
                    let output_path = format!("{path}/outputs/{fi}");
                    let output_name = source_name(
                        raw::member(reference, "name"),
                        "undefined",
                        &output_path,
                        ctx,
                    )?;
                    field.name = py_name(&output_name, false, &output_path, ctx)?;
                }
                fields.push(field);
            }
            let mut field_names = BTreeSet::new();
            if find_metered(
                &fields,
                ctx,
                |field| !field_names.insert(field.name.clone()),
                |field| field.name.len(),
            )?
            .is_some()
            {
                return Err(fail(path.as_str(), "Generated result name collision"));
            }
            if !fields.is_empty() {
                if !used.insert(row_name.clone()) {
                    return Err(fail(module_id.as_str(), "Generated native type collision"));
                }
            }
            let result_kind = if kind == "query" {
                "many".to_owned()
            } else {
                string_at(body, "result").unwrap_or_else(|| "mutation".into())
            };
            let replay = string_at(command, "replay").unwrap_or_else(|| "none".into());
            let batch = raw::member(command, "batch").cloned();
            let mut info_members = vec![
                (Utf16::from("module"), strval(&module_id)),
                (Utf16::from("id"), strval(&command_id)),
                (Utf16::from("python"), strval(&method)),
                (Utf16::from("input"), strval(&input)),
                (
                    Utf16::from("row"),
                    row_name_option(&row_name, !fields.is_empty()),
                ),
                (
                    Utf16::from("parameters"),
                    Value::Array(
                        parameters
                            .iter()
                            .map(|(field, native)| table_field_meta(field, native.as_ref(), ctx))
                            .collect::<Result<Vec<_>, EngineError>>()?,
                    ),
                ),
                (
                    Utf16::from("fields"),
                    Value::Array(
                        fields
                            .iter()
                            .map(|field| field_meta(field, ctx))
                            .collect::<Result<Vec<_>, _>>()?,
                    ),
                ),
                (Utf16::from("result"), strval(&result_kind)),
                (
                    Utf16::from("maxRows"),
                    raw::member(body, "maxRows").cloned().unwrap_or(Value::Null),
                ),
                (Utf16::from("fixedQuery"), Value::Bool(kind == "query")),
                (Utf16::from("replay"), strval(&replay)),
                (Utf16::from("batch"), batch.clone().unwrap_or(Value::Null)),
                (Utf16::from("declaration"), command.clone()),
            ];
            admitted_commands.push(TableCommand {
                info: Value::Object(std::mem::take(&mut info_members)),
                declaration: command.clone(),
                id: command_id,
                input,
                row: (!fields.is_empty()).then_some(row_name),
                python: method,
                parameters,
                fields,
                result: result_kind.to_owned(),
                fixed_query: kind == "query",
                replay,
                batch,
            });
        }
        result.push(TableModule {
            id: module_id,
            python,
            class,
            commands: admitted_commands,
        });
    }
    Ok((result, ids))
}

fn row_name_option(name: &str, include: bool) -> Value {
    if include {
        strval(name)
    } else {
        Value::Null
    }
}
fn table_field_meta(
    field: &Field,
    native: Option<&Value>,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let mut meta = field_meta(field, ctx)?;
    if let Value::Object(members) = &mut meta {
        ctx.charge_work(1, Utf16::from(format!("/fields/{}/native", field.id)))?;
        members.push((
            Utf16::from("native"),
            native
                .map(|native| crate::value::admit_json(native, ctx))
                .transpose()?
                .unwrap_or(Value::Null),
        ));
    }
    Ok(meta)
}
fn table_module_meta(module: &TableModule, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    ctx.charge_work(
        module
            .id
            .len()
            .saturating_add(module.python.len())
            .saturating_add(module.class.len())
            .saturating_add(module.commands.len()),
        Utf16::from("/tableModules"),
    )?;
    let commands = module
        .commands
        .iter()
        .map(|command| crate::value::admit_json(&command.info, ctx))
        .collect::<Result<Vec<_>, _>>()?;
    Ok(v::obj([
        ("id", strval(&module.id)),
        ("python", strval(&module.python)),
        ("cls", strval(&module.class)),
        ("commands", Value::Array(commands)),
    ]))
}
fn table_command_metadata(
    command: &TableCommand,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    match &command.info {
        Value::Object(members) => {
            ctx.charge_work(
                members.len(),
                Utf16::from(format!("/tables/{}/metadata", command.id)),
            )?;
            let mut copied = Vec::with_capacity(members.len());
            for (key, value) in members {
                ctx.charge_work(
                    key.len().saturating_add(1),
                    Utf16::from(format!("/tables/{}/metadata", command.id)),
                )?;
                if ["python", "input", "row", "declaration"]
                    .iter()
                    .any(|excluded| key.to_utf8().ok().as_deref() == Some(*excluded))
                {
                    continue;
                }
                copied.push((key.clone(), crate::value::admit_json(value, ctx)?));
            }
            Ok(Value::Object(copied))
        }
        _ => Ok(Value::Object(vec![])),
    }
}
fn number_text(value: &Value) -> String {
    match value {
        Value::Number(n) => n.to_string(),
        Value::Bool(b) => b.to_string(),
        Value::Null => "None".into(),
        _ => "None".into(),
    }
}
fn parse_field(
    reference: &Value,
    elements: &BTreeMap<(String, String), &Value>,
    depth: usize,
    ctx: &mut Context<'_>,
) -> Result<Field, EngineError> {
    parse_field_active(reference, elements, depth, &mut BTreeSet::new(), ctx)
}
fn parse_field_active(
    reference: &Value,
    elements: &BTreeMap<(String, String), &Value>,
    depth: usize,
    active: &mut BTreeSet<String>,
    ctx: &mut Context<'_>,
) -> Result<Field, EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    let fm = string_at(reference, "module").unwrap_or_default();
    let fe = string_at(reference, "element").unwrap_or_default();
    let id = format!("{fm}.{fe}");
    let field = elements
        .get(&(fm.clone(), fe.clone()))
        .copied()
        .ok_or_else(|| fail(id.as_str(), "Field reference does not identify a Field"))?;
    if string_at(field, "kind").as_deref() != Some("field") {
        return Err(fail(
            id.as_str(),
            "Field reference does not identify a Field",
        ));
    }
    if depth > 16 || !active.insert(id.clone()) {
        return Err(fail(id.as_str(), "Unbounded recursive field"));
    }
    let availability = string_at(field, "nullability").unwrap_or_default();
    if !matches!(availability.as_str(), "required" | "absent-allowed") {
        return Err(fail(
            id.as_str(),
            "Availability must have a supported explicit meaning",
        ));
    }
    let extension = raw::member(field, "extensions").unwrap_or(&Value::Null);
    let extension_members = raw::js_object_members(extension, ctx)?;
    if find_metered(
        &extension_members,
        ctx,
        |(key, _)| key != &Utf16::from("hohfeld.view"),
        |(key, _)| key.len(),
    )?
    .is_some()
    {
        return Err(fail(
            format!("{id}/extensions"),
            "Unknown selected Field extension meaning",
        ));
    }
    if !extension_members.is_empty()
        && raw::member(extension, "hohfeld.view")
            .is_none_or(|value| raw::object_members(value).is_none())
    {
        return Err(fail(
            format!("{id}/extensions/hohfeld.view"),
            "Presentation annotation must be a JSON object",
        ));
    }
    let source_scalar = string_at(field, "scalarType").unwrap_or_default();
    let card = string_at(field, "cardinality").unwrap_or_default();
    let fieldname = source_name(raw::member(field, "name"), &fe, &id, ctx)?;
    let fieldname = fieldname.rsplit('.').next().unwrap_or(&fe);
    let name = py_name(fieldname, false, &id, ctx)?;
    let semantic_types = raw::member(field, "semanticTypes")
        .map(|v| raw::admit_json(v, ctx))
        .transpose()?
        .unwrap_or_else(|| Value::Array(vec![]));
    if let Some(values) = raw::array_items(&semantic_types) {
        for semantic in values {
            ctx.charge_work(1, Utf16::default())?;
            if raw::js_object_members(semantic, ctx)?
                .iter()
                .any(|(key, _)| {
                    !["vocabulary", "version", "term"]
                        .iter()
                        .any(|name| key == &Utf16::from(*name))
                })
            {
                return Err(fail(
                    format!("{id}/semanticTypes"),
                    "Unknown semantic type qualifier",
                ));
            }
        }
    }
    let item = if card == "array" {
        let reference = raw::member(field, "itemType").unwrap_or(&Value::Null);
        Some(Box::new(parse_field_active(
            reference,
            elements,
            depth + 1,
            active,
            ctx,
        )?))
    } else if card != "one" {
        return Err(fail(
            id.as_str(),
            "Collection shape is not yet representable",
        ));
    } else {
        None
    };
    let scalar = item
        .as_ref()
        .map(|item| item.scalar.clone())
        .unwrap_or_else(|| source_scalar.clone());
    let facets = raw::member(field, "facets")
        .map(|v| raw::admit_json(v, ctx))
        .transpose()?
        .unwrap_or_else(|| Value::Object(vec![]));
    let enumeration = raw::member(field, "allowedValues");
    if card != "one"
        && (enumeration.is_some()
            || raw::member(&facets, "range").is_some()
            || raw::member(&facets, "length").is_some())
    {
        return Err(fail(
            id.as_str(),
            "Container refinements require a qualified generated interpreter",
        ));
    }
    if raw::member(&facets, "range").is_some()
        && !matches!(source_scalar.as_str(), "integer" | "decimal")
    {
        return Err(fail(id.as_str(), "Range requires an exact numeric carrier"));
    }
    if let Some(length) = raw::member(&facets, "length") {
        if !matches!(source_scalar.as_str(), "string" | "binary")
            || string_at(length, "unit").as_deref()
                != Some(if source_scalar == "string" {
                    "unicode-scalar"
                } else {
                    "byte"
                })
        {
            return Err(fail(id.as_str(), "Length requires its exact scalar unit"));
        }
    }
    for (group, known) in [
        ("range", &["min", "max", "minInclusive", "maxInclusive"][..]),
        ("length", &["min", "max", "unit"][..]),
    ] {
        if let Some(value) = raw::member(&facets, group) {
            for (key, _) in raw::js_object_members(value, ctx)? {
                ctx.charge_work(1, Utf16::default())?;
                if !known.iter().any(|name| key == &Utf16::from(*name)) {
                    return Err(fail(id.as_str(), "Unknown generated domain qualifier"));
                }
            }
        }
    }
    for (key, _) in raw::js_object_members(&facets, ctx)? {
        ctx.charge_work(key.len().saturating_add(1), Utf16::default())?;
        if !["precision", "scale", "integerWidth", "range", "length"]
            .iter()
            .any(|name| key == &Utf16::from(*name))
        {
            let mut path = Utf16::from(format!("{id}/facets/")).units().to_vec();
            path.extend(key.units());
            return Err(EngineError::new(
                "ACCESS_UNSUPPORTED",
                Utf16::new(path),
                "Facet requires an exact generated validator",
            ));
        }
    }
    let mut allowed_literals = Vec::new();
    let mut allowed = Vec::new();
    let mut representable = true;
    if let Some(enumeration) = enumeration {
        if !matches!(
            source_scalar.as_str(),
            "string" | "boolean" | "integer" | "decimal"
        ) {
            return Err(fail(
                id.as_str(),
                "Enumeration carrier requires an exact generated interpreter",
            ));
        }
        allowed_literals = raw::array_items(enumeration)
            .unwrap_or(&[])
            .iter()
            .map(|v| raw::admit_json(v, ctx))
            .collect::<Result<Vec<_>, _>>()?;
        for literal in &allowed_literals {
            ctx.charge_work(1, Utf16::default())?;
            let value = if let Some(s) = raw::string_member(literal, "string") {
                ctx.charge_work(s.len(), Utf16::default())?;
                Some(Value::String(s.clone()))
            } else if let Some(value @ Value::Bool(_)) = raw::member(literal, "boolean") {
                Some(value.clone())
            } else if let Some(token) = raw::string_member(literal, "integerToken") {
                ctx.charge_work(token.len(), Utf16::default())?;
                token
                    .to_utf8()
                    .ok()
                    .and_then(|s| s.parse::<f64>().ok())
                    .filter(|number| {
                        number.is_finite()
                            && number.fract() == 0.0
                            && number.abs() <= 9007199254740991.0
                    })
                    .map(Value::Number)
            } else {
                None
            };
            if let Some(value) = value {
                allowed.push(value)
            } else {
                representable = false
            }
        }
    }
    if !representable {
        allowed.clear()
    }
    if ![
        "string",
        "integer",
        "decimal",
        "float",
        "boolean",
        "binary",
        "date",
        "timestamp",
        "uuid",
        "bits128",
    ]
    .contains(&scalar.as_str())
    {
        return Err(fail(fe.as_str(), "Scalar cannot be represented exactly"));
    }
    let extensions = if extension_members.is_empty() {
        None
    } else {
        Some(raw::admit_json(extension, ctx)?)
    };
    active.remove(&id);
    Ok(Field {
        id: fe,
        name,
        scalar,
        card,
        missing: availability == "absent-allowed",
        nullable: availability == "absent-allowed",
        item,
        allowed,
        allowed_literals,
        facets,
        semantic_types,
        extensions,
    })
}

pub(super) fn generate(
    engine: &CodegenEngine<'_>,
    request: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let req = raw::admit_json(request, ctx)?;
    let package = string_at(&req, "package")
        .ok_or_else(|| fail("/package", "Ordinary non-shadowing Python package required"))?;
    if !ordinary_package_name(&package) {
        return Err(fail(
            "/package",
            "Ordinary non-shadowing Python package required",
        ));
    }
    let source = raw::string_member(&req, "text")
        .cloned()
        .ok_or_else(|| fail("/package", "Ordinary non-shadowing Python package required"))?;
    let fmt = string_at(&req, "format").unwrap_or_else(|| "json".into());
    let format = match fmt.as_str() {
        "json" => umf_core::serialization::Format::Json,
        "yaml" => umf_core::serialization::Format::Yaml,
        _ => return Err(fail("/format", "Unsupported source format")),
    };
    let doc = engine.read_document(&source, format, ctx)?;
    let supported = crate::value::string_member(&doc, "umf") == Some(&Utf16::from("0.10.0"));
    if !supported {
        return Err(fail("/umf", "Use current UMF source"));
    }
    let source_digest = sha(&source, ctx)?;
    let text = source
        .to_utf8()
        .map_err(|_| fail("/text", "Source contains invalid Unicode"))?;
    let records_req = list(&req, "records")
        .map(|items| selected_ids(items, "element", ctx))
        .transpose()?;
    let actions_req = list(&req, "actions")
        .map(|items| selected_ids(items, "action", ctx))
        .transpose()?;
    let modules =
        list(&doc, "modules").ok_or_else(|| fail("/modules", "Module inventory is invalid"))?;
    let mut elements = BTreeMap::<(String, String), &Value>::new();
    let mut qualified_elements = BTreeSet::new();
    let mut module_ids = Vec::new();
    for (mi, module) in modules.iter().enumerate() {
        ctx.charge_work(1, Utf16::from(format!("/modules/{mi}")))?;
        let mid = string_at(module, "id")
            .ok_or_else(|| fail(format!("/modules/{mi}/id"), "Module identity is invalid"))?;
        module_ids.push(mid.clone());
        for (p, items) in [
            (
                format!("/modules/{mi}/actions"),
                raw::member(module, "actions"),
            ),
            (
                format!("/modules/{mi}/extensions/umf.ddd/actions"),
                raw::member(
                    raw::member(module, "extensions").unwrap_or(&Value::Null),
                    "umf.ddd",
                )
                .and_then(|x| raw::member(x, "actions")),
            ),
        ] {
            if items.is_some_and(|x| raw::array_items(x).map_or(true, |a| !a.is_empty())) {
                return Err(fail(
                    p,
                    "Unsupported legacy action declarations; convert to current module.extensions[\"umf.actions\"].actions before generation",
                ));
            }
        }
    }
    for module in modules {
        let mid = string_at(module, "id").unwrap_or_default();
        for element in list(module, "elements").unwrap_or(&[]) {
            let eid = string_at(element, "id").unwrap_or_default();
            ctx.charge_work(
                mid.len().saturating_add(eid.len()).saturating_add(1),
                Utf16::default(),
            )?;
            if !qualified_elements.insert(format!("{mid}.{eid}"))
                || elements
                    .insert((mid.clone(), eid.clone()), element)
                    .is_some()
            {
                return Err(fail(format!("{mid}.{eid}"), "Qualified identity collision"));
            }
        }
    }
    // Validate the general UMF envelope. Semantic extensions are admitted only
    // after their operation-specific inspectors have completed successfully.

    // Match tableClients' selection boundary: a tables package is inspected
    // only when at least one record in that module is selected. A document may
    // retain an unrelated or empty tables extension without making it part of
    // this generated client's semantic closure.
    let mut has_tables = false;
    for module in modules {
        ctx.charge_work(1, Utf16::default())?;
        if raw::member(
            raw::member(module, "extensions").unwrap_or(&Value::Null),
            "umf.tables",
        )
        .is_none()
        {
            continue;
        }
        for element in list(module, "elements").unwrap_or(&[]) {
            ctx.charge_work(1, Utf16::default())?;
            if string_at(element, "kind").as_deref() != Some("record") {
                continue;
            }
            let key = format!(
                "{}.{}",
                string_at(module, "id").unwrap_or_default(),
                string_at(element, "id").unwrap_or_default()
            );
            if let Some(selected) = records_req.as_ref() {
                if find_metered(selected, ctx, |id| id == &key, |id| id.len())?.is_none() {
                    continue;
                }
            }
            has_tables = true;
            break;
        }
        if has_tables {
            break;
        }
    }
    if has_tables && fmt != "json" {
        return Err(fail(
            "/format",
            "Native operation clients currently require original JSON source",
        ));
    }
    let mut used = UNIFIED_RESERVED
        .split_whitespace()
        .map(str::to_owned)
        .collect::<BTreeSet<_>>();
    if has_tables {
        used.extend(
            [
                "ModuleClients",
                "SyncModuleClients",
                "Applied",
                "Recovered",
                "NotObserved",
                "EffectReceipt",
                "MutationItem",
                "table_call",
                "table_call_sync",
            ]
            .into_iter()
            .map(str::to_owned),
        );
    }
    let mut table_modules = Vec::new();
    let mut native_ids = BTreeSet::new();
    if has_tables {
        let inspected = engine.inspect_table_lifecycle(&doc, ctx)?;
        if raw::member(&inspected, "valid") != Some(&Value::Bool(true))
            || raw::member(&inspected, "complete") != Some(&Value::Bool(true))
        {
            return Err(fail(
                "/modules",
                "Native table lifecycle client requires complete declared table/operation meaning",
            ));
        }
        (table_modules, native_ids) = build_table_modules(
            &inspected,
            modules,
            records_req.as_ref(),
            &elements,
            &mut used,
            ctx,
        )?;
    }
    // Core read uses the core-only default registry, matching the TS reader.

    let mut records = Vec::<Record>::new();
    for module in modules {
        let mid = string_at(module, "id").unwrap_or_default();
        if raw::member(
            raw::member(module, "extensions").unwrap_or(&Value::Null),
            "umf.tables",
        )
        .is_some()
        {
            continue;
        }
        for elem in list(module, "elements").unwrap_or(&[]) {
            if string_at(elem, "kind").as_deref() != Some("record") {
                continue;
            }
            let eid = string_at(elem, "id").unwrap_or_default();
            let id = format!("{mid}.{eid}");
            let keys = list(elem, "keys").unwrap_or(&[]);
            if keys.is_empty() {
                continue;
            }
            let key = find_metered(
                keys,
                ctx,
                |k| raw::member(k, "primary") == Some(&Value::Bool(true)),
                |_| 0,
            )?
            .or_else(|| if keys.len() == 1 { keys.first() } else { None })
            .ok_or_else(|| fail(id.as_str(), "Record requires an unambiguous identity Key"))?;
            let key_id = string_at(key, "id").unwrap_or_default();
            let name = py_name(
                &source_name(raw::member(elem, "name"), &eid, &id, ctx)?,
                true,
                &id,
                ctx,
            )?;
            for symbol in [name.clone(), format!("{name}Key"), format!("{name}Columns")] {
                if !used.insert(symbol) {
                    return Err(fail(id.as_str(), "Generated type collision"));
                }
            }
            let selected = records_req.as_ref().map_or(true, |s| s.contains(&id));
            let refs = if selected {
                list(elem, "members").unwrap_or(&[])
            } else {
                list(key, "fields").unwrap_or(&[])
            };
            let mut key_fields = Vec::new();
            for r in list(key, "fields").unwrap_or(&[]) {
                key_fields.push(parse_field(r, &elements, 0, ctx)?);
            }
            if find_metered(
                &key_fields,
                ctx,
                |f| f.missing || f.nullable || f.card != "one",
                |_| 0,
            )?
            .is_some()
            {
                return Err(fail(
                    id.as_str(),
                    "Identity components must be required scalars",
                ));
            }
            let mut fields = Vec::new();
            for r in refs {
                fields.push(parse_field(r, &elements, 0, ctx)?);
            }
            let mut local = BTreeSet::new();
            if find_metered(
                &fields,
                ctx,
                |f| !local.insert(f.name.clone()),
                |f| f.name.len(),
            )?
            .is_some()
            {
                return Err(fail(id.as_str(), "Field name collision"));
            }
            records.push(Record {
                id,
                module: mid.clone(),
                element: eid,
                name,
                fields,
                key: key_fields,
                key_id,
                selected,
            });
        }
    }
    if let Some(selected) = records_req {
        for id in selected {
            ctx.charge_work(1, Utf16::default())?;
            if find_metered(&records, ctx, |r| r.id == id, |r| r.id.len())?.is_none()
                && !native_ids.contains(&id)
            {
                return Err(fail(id, "Selected Record not found"));
            }
        }
    }
    if find_metered(&records, ctx, |record| record.selected, |_| 0)?.is_none()
        && table_modules.is_empty()
    {
        return Err(fail("/records", "Select at least one keyed Record"));
    }
    let mut relations = Vec::new();
    for (mi, module) in modules.iter().enumerate() {
        let module_id = string_at(module, "id").unwrap_or_default();
        for (ri, relationship) in list(module, "relationships")
            .unwrap_or(&[])
            .iter()
            .enumerate()
        {
            let source = list(relationship, "source").unwrap_or(&[]);
            let target = list(relationship, "target").unwrap_or(&[]);
            if source.is_empty() || target.is_empty() {
                continue;
            }
            let (sm, se) = (
                string_at(&source[0], "module").unwrap_or_default(),
                string_at(&source[0], "element").unwrap_or_default(),
            );
            let (tm, te) = (
                string_at(&target[0], "module").unwrap_or_default(),
                string_at(&target[0], "element").unwrap_or_default(),
            );
            let owner_id = format!("{sm}.{se}");
            let target_id = format!("{tm}.{te}");
            let owner = find_metered(&records, ctx, |r| r.id == owner_id, |r| r.id.len())?;
            let target_record = find_metered(&records, ctx, |r| r.id == target_id, |r| r.id.len())?;
            if (native_ids.contains(&owner_id) && target_record.is_some_and(|r| r.selected))
                || (native_ids.contains(&target_id) && owner.is_some_and(|r| r.selected))
            {
                return Err(fail(
                    format!(
                        "{module_id}/{}",
                        string_at(relationship, "id").unwrap_or_default()
                    ),
                    "Cross-profile relationship requires explicit lowering",
                ));
            }
            let (Some(owner), Some(target_record)) = (owner, target_record) else {
                continue;
            };
            if !owner.selected && !target_record.selected {
                continue;
            }
            if source.len() != 1
                || target.len() != 1
                || raw::member(relationship, "directed") != Some(&Value::Bool(true))
            {
                return Err(fail(
                    format!(
                        "{module_id}/{}",
                        string_at(relationship, "id").unwrap_or_default()
                    ),
                    "Relationship endpoint meaning requires explicit lowering",
                ));
            }
            let target_key = string_at(&target[0], "key").unwrap_or_default();
            if target_record.key_id != target_key {
                return Err(fail(
                    format!(
                        "{module_id}/{}",
                        string_at(relationship, "id").unwrap_or_default()
                    ),
                    "Relationship endpoint meaning requires explicit lowering",
                ));
            }
            let id = string_at(relationship, "id").unwrap_or_default();
            let raw_name = source_name(
                raw::member(relationship, "name"),
                &id,
                &format!("{module_id}/{id}"),
                ctx,
            )?;
            let python_name = py_name(&raw_name, false, &format!("{module_id}/{id}"), ctx)?;
            if find_metered(
                &owner.fields,
                ctx,
                |f| f.name == python_name,
                |f| f.name.len(),
            )?
            .is_some()
                || find_metered(
                    &relations,
                    ctx,
                    |r: &RelationInfo| r.owner == owner_id && r.name == python_name,
                    |r| r.owner.len().saturating_add(r.name.len()),
                )?
                .is_some()
            {
                return Err(fail(
                    format!("{module_id}/{id}"),
                    "Relationship/field name collision",
                ));
            }
            let target_mult =
                raw::member(relationship, "targetMultiplicity").unwrap_or(&Value::Null);
            let to_one = raw::member(target_mult, "max") == Some(&Value::Number(1.0));
            let optional = raw::member(target_mult, "min") == Some(&Value::Number(0.0));
            let source_mult = raw::member(relationship, "sourceMultiplicity")
                .cloned()
                .unwrap_or(Value::Null);
            let target_mult = raw::member(relationship, "targetMultiplicity")
                .cloned()
                .unwrap_or(Value::Null);
            relations.push(RelationInfo {
                owner: owner_id.clone(),
                target: target_id.clone(),
                owner_module: sm.clone(),
                owner_element: se.clone(),
                target_module: tm.clone(),
                target_element: te.clone(),
                module: module_id.clone(),
                id: id.clone(),
                name: python_name,
                key: target_key,
                direction: "forward",
                pointer: format!("/modules/{mi}/relationships/{ri}"),
                logical_name: raw::member(relationship, "name").cloned(),
                to_one,
                optional,
                source_multiplicity: source_mult.clone(),
                target_multiplicity: target_mult.clone(),
            });
            let inverse_raw = source_name(
                raw::member(relationship, "inverse"),
                &format!("{id}_inverse"),
                &format!("{module_id}/{id}/inverse"),
                ctx,
            )?;
            let inverse = py_name(
                &inverse_raw,
                false,
                &format!("{module_id}/{id}/inverse"),
                ctx,
            )?;
            if find_metered(
                &target_record.fields,
                ctx,
                |f| f.name == inverse,
                |f| f.name.len(),
            )?
            .is_some()
                || find_metered(
                    &relations,
                    ctx,
                    |r| r.owner == target_id && r.name == inverse,
                    |r| r.owner.len().saturating_add(r.name.len()),
                )?
                .is_some()
            {
                return Err(fail(format!("{module_id}/{id}"), "Inverse name collision"));
            }
            let source_mult_raw =
                raw::member(relationship, "sourceMultiplicity").unwrap_or(&Value::Null);
            let to_one = raw::member(source_mult_raw, "max") == Some(&Value::Number(1.0));
            let optional = raw::member(source_mult_raw, "min") == Some(&Value::Number(0.0));
            relations.push(RelationInfo {
                owner: target_id,
                target: owner_id,
                owner_module: tm,
                owner_element: te,
                target_module: sm,
                target_element: se,
                module: module_id.clone(),
                id,
                name: inverse,
                key: owner.key_id.clone(),
                direction: "inverse",
                pointer: format!("/modules/{mi}/relationships/{ri}"),
                logical_name: raw::member(relationship, "inverse").cloned(),
                to_one,
                optional,
                source_multiplicity: target_mult,
                target_multiplicity: source_mult,
            });
        }
    }
    let mut seen_action_ids = BTreeSet::new();
    let mut action_infos = Vec::new();
    let mut action_methods = BTreeSet::new();
    let mut next_module = 0usize;
    let mut next_action = 0usize;
    let mut checked_payload = false;
    'action_inventory: loop {
        let declaration = loop {
            ctx.charge_work(1, Utf16::default())?;
            let mi = next_module;
            let Some(module) = modules.get(mi) else {
                break 'action_inventory;
            };
            let module_id = raw::string_member(module, "id")
                .cloned()
                .unwrap_or_default();
            let Some(payload) = raw::member(
                raw::member(module, "extensions").unwrap_or(&Value::Null),
                "umf.actions",
            ) else {
                next_module += 1;
                next_action = 0;
                checked_payload = false;
                continue;
            };
            let path = format!("/modules/{mi}/extensions/umf.actions");
            if !checked_payload {
                if raw::object_members(payload).is_none() || list(payload, "actions").is_none() {
                    return Err(fail(
                        path,
                        "Expected an action declaration object with an actions array",
                    ));
                }
                if string_at(
                    raw::member(
                        raw::member(&doc, "vocabularies").unwrap_or(&Value::Null),
                        "umf.actions",
                    )
                    .unwrap_or(&Value::Null),
                    "version",
                )
                .as_deref()
                    != Some("0.1.0")
                {
                    return Err(fail(
                        "/vocabularies/umf.actions/version",
                        "Unsupported action vocabulary version",
                    ));
                }
                for (key, _) in raw::js_object_members(payload, ctx)? {
                    if key != &Utf16::from("actions") {
                        let mut at = Utf16::from(format!("{path}/")).units().to_vec();
                        ctx.charge_work(key.len().saturating_mul(2), Utf16::default())?;
                        for unit in key.units() {
                            match *unit {
                                126 => at.extend([126, 48]),
                                47 => at.extend([126, 49]),
                                unit => at.push(unit),
                            }
                        }
                        return Err(fail(Utf16::new(at), "Unknown action declaration qualifier"));
                    }
                }
                checked_payload = true;
            }
            let ai = next_action;
            let Some(action) = list(payload, "actions").unwrap_or(&[]).get(ai) else {
                next_module += 1;
                next_action = 0;
                checked_payload = false;
                continue;
            };
            next_action += 1;
            ctx.charge_work(1, Utf16::default())?;
            let action_path = format!("{path}/actions/{ai}");
            let Some(action_id) = raw::string_member(action, "id")
                .cloned()
                .filter(|id| !id.is_empty())
            else {
                return Err(fail(
                    action_path,
                    "Action inventory entries require a nonempty identity",
                ));
            };
            let identity = format!(
                "{}.{}",
                module_id.to_utf8().unwrap_or_default(),
                action_id.to_utf8().unwrap_or_default()
            );
            if !seen_action_ids.insert(identity) {
                return Err(fail(
                    format!("{action_path}/id"),
                    "Qualified action identity collision",
                ));
            }
            let selected_identity = format!(
                "{}.{}",
                module_id.to_utf8().unwrap_or_default(),
                action_id.to_utf8().unwrap_or_default()
            );
            if actions_req
                .as_ref()
                .is_some_and(|items| !items.contains(&selected_identity))
            {
                continue;
            }
            if raw::member(
                raw::member(module, "extensions").unwrap_or(&Value::Null),
                "umf.tables",
            )
            .is_some()
            {
                return Err(fail(
                    format!("/modules/{mi}/extensions/umf.tables"),
                    "Native table lifecycle action interpretation is not qualified",
                ));
            }
            break crate::actions::ActionDeclaration {
                module: module_id.clone(),
                id: action_id,
                pointer: Utf16::from(action_path),
                value: raw::admit_json(action, ctx)?,
                obligations: Vec::new(),
            };
        };
        let module = declaration.module.to_utf8().map_err(|_| {
            fail(
                "/actions",
                "Action module identity contains invalid Unicode",
            )
        })?;
        let action_id = declaration
            .id
            .to_utf8()
            .map_err(|_| fail("/actions", "Action identity contains invalid Unicode"))?;
        let qualified = format!("{module}.{action_id}");
        let admitted =
            crate::actions::admit_unified_action(engine.resources(), &declaration.value, ctx)
                .map_err(|error| {
                    if error.is_control_failure() {
                        error
                    } else {
                        fail(
                            declaration.pointer.clone(),
                            &format!(
                                "Invalid action declaration: {}",
                                error.message.to_utf8().unwrap_or_default()
                            ),
                        )
                    }
                })?;
        let action = &admitted;
        let binding = raw::member(action, "binding").unwrap_or(&Value::Null);
        if string_at(binding, "kind").as_deref() == Some("recipe") {
            let profile = raw::member(binding, "profile").unwrap_or(&Value::Null);
            if string_at(profile, "id").as_deref() != Some("graph-write")
                || !matches!(string_at(profile, "version").as_deref(), Some("1" | "2"))
            {
                return Err(fail(
                    format!("{qualified}/binding/profile"),
                    "Unsupported selected recipe profile",
                ));
            }
        }
        for (mi, dependency) in modules.iter().enumerate() {
            ctx.charge_work(1, Utf16::default())?;
            if raw::member(
                raw::member(dependency, "extensions").unwrap_or(&Value::Null),
                "umf.tables",
            )
            .is_none()
            {
                continue;
            }
            let dependency_id = raw::string_member(dependency, "id");
            let mut relevant = false;
            for group in ["reads", "writes"] {
                for frame in list(action, group).unwrap_or(&[]) {
                    ctx.charge_work(1, Utf16::default())?;
                    if raw::string_member(
                        raw::member(frame, "record").unwrap_or(&Value::Null),
                        "module",
                    ) == dependency_id
                    {
                        relevant = true;
                        break;
                    }
                }
            }
            if relevant {
                return Err(fail(
                    format!("/modules/{mi}/extensions/umf.tables"),
                    "Native table lifecycle action interpretation is not qualified",
                ));
            }
        }
        let analysis_path = Utf16::from(format!("/modules/{module}/actions/{action_id}"));
        let (obligations, analysis) = crate::actions::analyze_unified_action(
            engine.resources(),
            &doc,
            action,
            &analysis_path,
            ctx,
        )?;
        let mut error_codes = Vec::new();
        for diagnostic in analysis {
            ctx.charge_work(1, Utf16::default())?;
            if diagnostic.severity == umf_core::Severity::Error {
                error_codes.push(diagnostic.code.to_utf8().unwrap_or_default());
            }
        }
        if !error_codes.is_empty() {
            return Err(fail(
                qualified.as_str(),
                &format!("Invalid action declarations: {}", error_codes.join(",")),
            ));
        }
        if string_at(binding, "kind").as_deref() == Some("recipe") {
            for obligation in obligations {
                ctx.charge_work(1, Utf16::default())?;
                if obligation.status == Utf16::from("unchecked")
                    && [Utf16::from("unknown"), Utf16::from("effect")].contains(&obligation.kind)
                    && obligation
                        .path
                        .units()
                        .windows(8)
                        .any(|units| units == Utf16::from("/binding").units())
                {
                    return Err(fail(
                        format!("{qualified}/binding"),
                        "Uninterpreted selected recipe meaning",
                    ));
                }
            }
        }
        if !list(action, "outputs").unwrap_or(&[]).is_empty() {
            return Err(fail(
                qualified.as_str(),
                "Action declares unsupported business outputs",
            ));
        }
        let mut parameters = Vec::new();
        let mut parameter_names = BTreeSet::new();
        let action_pointer = declaration.pointer.to_utf8().unwrap_or_default();
        for (pi, parameter) in list(action, "parameters").unwrap_or(&[]).iter().enumerate() {
            let pid = string_at(parameter, "id").unwrap_or_default();
            let pname = py_name(
                &source_name(
                    raw::member(parameter, "name"),
                    &pid,
                    &format!("{qualified}/{pid}"),
                    ctx,
                )?,
                false,
                &format!("{qualified}/{pid}"),
                ctx,
            )?;
            if !parameter_names.insert(pname.clone()) {
                return Err(fail(
                    format!("{action_pointer}/parameters/{pi}"),
                    "Generated parameter name collision",
                ));
            }
            if ["self", "idempotency_key"].contains(&pname.as_str()) {
                return Err(fail(
                    format!("{qualified}/{pid}"),
                    "Parameter conflicts with generated method signature",
                ));
            }
            let required = raw::member(parameter, "required") == Some(&Value::Bool(true));
            if string_at(parameter, "kind").as_deref() == Some("entity") {
                let target = raw::member(parameter, "target").unwrap_or(&Value::Null);
                let tm = string_at(target, "module").unwrap_or_default();
                let te = string_at(target, "element").unwrap_or_default();
                let key = string_at(target, "key").unwrap_or_default();
                let rec = find_metered(
                    &records,
                    ctx,
                    |r| r.module == tm && r.element == te && r.key_id == key,
                    |r| {
                        r.module
                            .len()
                            .saturating_add(r.element.len())
                            .saturating_add(r.key_id.len())
                    },
                )?
                .ok_or_else(|| {
                    fail(
                        format!("{qualified}/{pid}"),
                        "Entity parameter must use its declared generated Key",
                    )
                })?;
                parameters.push(ActionParameter {
                    id: pid,
                    name: pname,
                    required,
                    record: Some(rec.id.clone()),
                    field: None,
                });
            } else {
                let field = parse_field(
                    raw::member(parameter, "field").ok_or_else(|| {
                        fail(
                            format!("{qualified}/{pid}"),
                            "Value action parameter requires a Field",
                        )
                    })?,
                    &elements,
                    0,
                    ctx,
                )?;
                parameters.push(ActionParameter {
                    id: pid,
                    name: pname,
                    required,
                    record: None,
                    field: Some(field),
                });
            }
        }
        let mut affected = Vec::new();
        for frame in list(action, "writes").unwrap_or(&[]) {
            let reference = raw::member(frame, "record").unwrap_or(&Value::Null);
            let id = format!(
                "{}.{}",
                string_at(reference, "module").unwrap_or_default(),
                string_at(reference, "element").unwrap_or_default()
            );
            if find_metered(
                &records,
                ctx,
                |record| record.id == id,
                |record| record.id.len(),
            )?
            .is_none()
            {
                return Err(fail(
                    qualified.as_str(),
                    "Action affected Record is not representable",
                ));
            }
            if !affected.contains(&id) {
                affected.push(id);
            }
        }
        let class = py_name(&action_id, true, &qualified, ctx)?;
        let method = py_name(&action_id, false, &qualified, ctx)?;
        if !action_methods.insert(method.clone()) {
            return Err(fail(qualified.as_str(), "Action method collision"));
        }
        action_infos.push(ActionInfo {
            id: action_id,
            module,
            name: method,
            class,
            parameters,
            affected,
            raw: admitted,
        });
    }
    if let Some(selected) = actions_req {
        for id in selected {
            ctx.charge_work(1, Utf16::default())?;
            if find_metered(
                &action_infos,
                ctx,
                |action| format!("{}.{}", action.module, action.id) == id,
                |action| {
                    action
                        .module
                        .len()
                        .saturating_add(action.id.len())
                        .saturating_add(1)
                },
            )?
            .is_none()
            {
                return Err(fail(id, "Selected Action not found"));
            }
        }
    }
    for action in &action_infos {
        ctx.charge_work(
            action
                .module
                .len()
                .saturating_add(action.id.len())
                .saturating_add(action.class.len())
                .saturating_mul(64)
                .saturating_add(128),
            Utf16::default(),
        )?;
        let qualified_action = format!("{}.{}", action.module, action.id);
        let input = format!("{}Input", action.class);
        let precondition = format!("{}Precondition", action.class);
        for symbol in [&input, &precondition] {
            if !used.insert(symbol.clone()) {
                return Err(fail(
                    qualified_action.as_str(),
                    "Generated action type collision",
                ));
            }
        }
        let mut members = BTreeSet::new();
        for condition in list(&action.raw, "preconditions").unwrap_or(&[]) {
            ctx.charge_work(
                raw::string_member(condition, "id")
                    .map_or(0, Utf16::len)
                    .saturating_add(qualified_action.len())
                    .saturating_mul(64)
                    .saturating_add(128),
                Utf16::default(),
            )?;
            let id = string_at(condition, "id").unwrap_or_default();
            let member = py_name(
                &id,
                false,
                &format!("{qualified_action}/preconditions/{id}"),
                ctx,
            )?
            .to_ascii_uppercase();
            ctx.charge_work(
                member.len().saturating_mul(64).saturating_add(128),
                Utf16::default(),
            )?;
            if ["NAME", "VALUE", "MRO"].contains(&member.as_str()) || !members.insert(member) {
                return Err(fail(
                    format!("{qualified_action}/preconditions/{id}"),
                    "Precondition enum member collision",
                ));
            }
        }
    }
    for action in &action_infos {
        for method in [
            &action.name,
            &format!("{}_batch", action.name),
            &format!("{}_validate", action.name),
        ] {
            ctx.charge_work(1, Utf16::default())?;
            if find_metered(
                &action_infos,
                ctx,
                |other| !std::ptr::eq(action, other) && other.name == *method,
                |other| other.name.len(),
            )?
            .is_some()
            {
                return Err(fail(
                    format!("{}.{}", action.module, action.id),
                    "Generated action terminal collision",
                ));
            }
        }
    }
    // Stage-one output is intentionally separate; this operation returns a
    // Python-client inventory and keeps source text exact.
    let mut description = Value::Object(vec![
        (Utf16::from("contract"), strval("umf.access/1")),
        (Utf16::from("umf"), strval("0.10.0")),
        (Utf16::from("sourceDigest"), strval(&source_digest)),
        (
            Utf16::from("records"),
            Value::Object(
                records
                    .iter()
                    .map(|r| Ok((Utf16::from(r.id.as_str()), record_meta(r, ctx)?)))
                    .collect::<Result<Vec<_>, EngineError>>()?,
            ),
        ),
        (
            Utf16::from("relationships"),
            Value::Array(
                relations
                    .iter()
                    .map(|relation| relation_meta(relation, ctx))
                    .collect::<Result<Vec<_>, EngineError>>()?,
            ),
        ),
        (
            Utf16::from("actions"),
            Value::Object(
                action_infos
                    .iter()
                    .map(|action| {
                        Ok((
                            Utf16::from(format!("{}.{}", action.module, action.id)),
                            action_meta(action, ctx)?,
                        ))
                    })
                    .collect::<Result<Vec<_>, EngineError>>()?,
            ),
        ),
        (
            Utf16::from("errorCodes"),
            Value::Array(
                [
                    "INVALID",
                    "DENIED",
                    "CONFLICT",
                    "PRECONDITION_FAILED",
                    "TOO_MANY_ROWS",
                    "LIMIT_EXCEEDED",
                    "BUSY",
                    "UNSUPPORTED",
                    "SCHEMA_MISMATCH",
                    "WRITE_OUTCOME_UNKNOWN",
                    "NOT_YET_CURRENT",
                    "INVALID_CURSOR",
                ]
                .into_iter()
                .map(strval)
                .collect(),
            ),
        ),
        (Utf16::from("localErrorCodes"), local_error_codes()),
        (
            Utf16::from("limits"),
            v::obj([
                ("page", v::num(100)),
                ("getManyKeys", v::num(100)),
                ("batchItems", v::num(100)),
            ]),
        ),
    ]);
    if !table_modules.is_empty() {
        if let Value::Object(members) = &mut description {
            members.insert(
                6,
                (
                    Utf16::from("tableModules"),
                    Value::Array(
                        table_modules
                            .iter()
                            .map(|module| table_module_meta(module, ctx))
                            .collect::<Result<Vec<_>, EngineError>>()?,
                    ),
                ),
            );
            members.insert(
                7,
                (Utf16::from("nativeExecutionQualified"), Value::Bool(false)),
            );
        }
    }
    let json = pretty(&description, 0, ctx)? + "\n";
    let mut files=vec![file(format!("{package}/__init__.py"),"# SPDX-License-Identifier: MIT OR Apache-2.0\nfrom .models import *\nfrom ._runtime import AccessError as AccessError, Unsupported as Unsupported, SchemaMismatch as SchemaMismatch, PreconditionFailed as PreconditionFailed, WriteOutcomeUnknown as WriteOutcomeUnknown, write_outcomes_unknown as write_outcomes_unknown, LOCAL_ERROR_CODES as LOCAL_ERROR_CODES, MAX_BATCH_ITEMS as MAX_BATCH_ITEMS, Page as Page, Receipt as Receipt, BatchReceipt as BatchReceipt, BatchItemOutcome as BatchItemOutcome, ValidationResult as ValidationResult, ExactTimestamp as ExactTimestamp, MISSING as MISSING, Missing as Missing, Transport as Transport, AsyncTransport as AsyncTransport, SyncTransport as SyncTransport\n".into()),file(format!("{package}/models.py"),emit_models(&source_digest,&records,&relations,&action_infos,&table_modules,ctx)?),file(format!("{package}/_runtime.py"),python::PYTHON_RUNTIME.into()),file(format!("{package}/source.json"),text.clone()),file(format!("{package}/description.json"),json),file(format!("{package}/py.typed"),String::new())];
    if !table_modules.is_empty() {
        files.insert(
            3,
            file(
                format!("{package}/_table_runtime.py"),
                python::TABLE_RUNTIME.into(),
            ),
        );
    }
    let mut filesv = Vec::new();
    let mut inventory = Vec::new();
    for f in files {
        let digest = sha(&Utf16::from_utf8(&f.text), ctx)?;
        inventory.push(v::obj([
            ("path", strval(&f.path)),
            ("sha256", strval(&digest)),
        ]));
        filesv.push(v::obj([
            ("path", strval(&f.path)),
            ("text", strval(&f.text)),
            ("sha256", strval(digest)),
        ]));
    }
    let manifest = v::obj([
        ("contract", strval("umf.access/1")),
        ("sourceDigest", strval(&source_digest)),
        (
            "descriptionDigest",
            strval(sha(&Utf16::from_utf8(&compact(&description, ctx)?), ctx)?),
        ),
        ("inventory", v::arr(inventory)),
    ]);
    let mtext = pretty(&manifest, 0, ctx)? + "\n";
    filesv.push(v::obj([
        ("path", strval(format!("{package}/_umf/manifest.json"))),
        ("text", strval(&mtext)),
        ("sha256", strval(sha(&Utf16::from_utf8(&mtext), ctx)?)),
    ]));
    Ok(v::obj([
        ("sourceDigest", strval(source_digest)),
        ("description", description),
        ("files", v::arr(filesv)),
    ]))
}
struct File {
    path: String,
    text: String,
}
fn file(path: String, text: String) -> File {
    File { path, text }
}
fn record_meta(r: &Record, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    ctx.charge_work(
        r.id.len()
            .saturating_add(r.name.len())
            .saturating_add(r.module.len())
            .saturating_add(r.element.len())
            .saturating_add(r.key_id.len())
            .saturating_add(r.fields.len())
            .saturating_add(r.key.len()),
        Utf16::from(format!("/records/{}", r.id)),
    )?;
    let fields = r
        .fields
        .iter()
        .map(|field| field_meta(field, ctx))
        .collect::<Result<Vec<_>, _>>()?;
    let key = r
        .key
        .iter()
        .map(|field| field_meta(field, ctx))
        .collect::<Result<Vec<_>, _>>()?;
    Ok(v::obj([
        ("fields", Value::Array(fields)),
        ("key", Value::Array(key)),
        ("key_id", strval(&r.key_id)),
        ("selected", Value::Bool(r.selected)),
    ]))
}
fn action_meta(a: &ActionInfo, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let path = Utf16::from(format!("/actions/{}/metadata", a.id));
    let parameter_text = a.parameters.iter().fold(0usize, |units, parameter| {
        units
            .saturating_add(parameter.id.len())
            .saturating_add(parameter.name.len())
            .saturating_add(parameter.record.as_ref().map_or(0, String::len))
    });
    let affected_text = a
        .affected
        .iter()
        .fold(0usize, |units, item| units.saturating_add(item.len()));
    ctx.charge_work(
        a.parameters
            .len()
            .saturating_add(a.affected.len())
            .saturating_add(parameter_text)
            .saturating_add(affected_text),
        path.clone(),
    )?;
    let parameters = Value::Array(
        a.parameters
            .iter()
            .map(|p| -> Result<Value, EngineError> {
                ctx.charge_work(1, Utf16::from(format!("/actions/{}/parameters", a.id)))?;
                let mut m = vec![
                    (Utf16::from("id"), strval(&p.id)),
                    (Utf16::from("python"), strval(&p.name)),
                    (Utf16::from("required"), Value::Bool(p.required)),
                ];
                if let Some(record) = &p.record {
                    m.push((Utf16::from("record"), strval(record)));
                }
                if let Some(field) = &p.field {
                    m.push((Utf16::from("field"), field_meta(field, ctx)?));
                }
                Ok(Value::Object(m))
            })
            .collect::<Result<Vec<_>, _>>()?,
    );
    let affected = Value::Array(a.affected.iter().map(strval).collect());
    let precondition_items = list(&a.raw, "preconditions").unwrap_or(&[]);
    ctx.charge_work(precondition_items.len(), path.clone())?;
    let mut preconditions = Vec::with_capacity(precondition_items.len());
    for c in precondition_items {
        ctx.charge_work(
            string_at(c, "id")
                .unwrap_or_default()
                .len()
                .saturating_add(1),
            path.clone(),
        )?;
        preconditions.push(v::obj([
            ("id", strval(string_at(c, "id").unwrap_or_default())),
            (
                "failure",
                raw::member(c, "failure")
                    .map(|x| crate::value::admit_json(x, ctx))
                    .transpose()?
                    .unwrap_or(Value::Null),
            ),
        ]));
    }
    Ok(v::obj([
        ("parameters", parameters),
        ("affected", affected),
        ("preconditions", Value::Array(preconditions)),
        (
            "operations",
            v::arr([strval("apply"), strval("apply_batch"), strval("validate")]),
        ),
        ("declaration", crate::value::admit_json(&a.raw, ctx)?),
    ]))
}
fn field_meta(f: &Field, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let path = Utf16::from(format!("/fields/{}", f.id));
    // Reserve the fixed metadata members and copied text before constructing
    // their Values. Opaque trees go through the core metered copy kernel below.
    let text_units =
        f.id.len()
            .saturating_add(f.name.len())
            .saturating_add(f.scalar.len())
            .saturating_add(f.card.len());
    ctx.charge_work(text_units.saturating_add(12), path.clone())?;
    let mut members = vec![
        (Utf16::from("id"), strval(&f.id)),
        (Utf16::from("python"), strval(&f.name)),
        (Utf16::from("scalar"), strval(&f.scalar)),
        (Utf16::from("cardinality"), strval(&f.card)),
        (Utf16::from("missing"), Value::Bool(f.missing)),
        (Utf16::from("nullable"), Value::Bool(f.nullable)),
        (
            Utf16::from("facets"),
            crate::value::admit_json(&f.facets, ctx)?,
        ),
        (
            Utf16::from("semanticTypes"),
            crate::value::admit_json(&f.semantic_types, ctx)?,
        ),
        (
            Utf16::from("semanticTypeInterpretation"),
            strval("reference-only"),
        ),
    ];
    if let Some(ext) = &f.extensions {
        ctx.charge_work(2, path.clone())?;
        members.push((
            Utf16::from("extensions"),
            crate::value::admit_json(ext, ctx)?,
        ));
        members.push((
            Utf16::from("extensionInterpretation"),
            strval("opaque-presentation-metadata-only"),
        ));
    }
    if !f.allowed_literals.is_empty() {
        ctx.charge_work(f.allowed_literals.len().saturating_add(1), path.clone())?;
        let mut literals = Vec::with_capacity(f.allowed_literals.len());
        for literal in &f.allowed_literals {
            ctx.charge_work(1, path.clone())?;
            literals.push(crate::value::admit_json(literal, ctx)?);
        }
        members.push((Utf16::from("allowedLiterals"), Value::Array(literals)));
    }
    if !f.allowed.is_empty() {
        ctx.charge_work(f.allowed.len().saturating_add(1), path.clone())?;
        let mut allowed = Vec::with_capacity(f.allowed.len());
        for value in &f.allowed {
            ctx.charge_work(1, path.clone())?;
            allowed.push(crate::value::admit_json(value, ctx)?);
        }
        members.push((Utf16::from("allowed"), Value::Array(allowed)));
    }
    if let Some(item) = &f.item {
        members.push((Utf16::from("item"), field_meta(item, ctx)?));
    }
    Ok(Value::Object(members))
}
fn relation_meta(r: &RelationInfo, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    ctx.charge_work(
        r.owner
            .len()
            .saturating_add(r.target.len())
            .saturating_add(r.module.len())
            .saturating_add(r.id.len())
            .saturating_add(r.name.len())
            .saturating_add(6),
        Utf16::from(format!("/relationships/{}/metadata", r.id)),
    )?;
    Ok(v::obj([
        ("owner", strval(&r.owner)),
        ("target", strval(&r.target)),
        ("module", strval(&r.module)),
        ("id", strval(&r.id)),
        ("python", strval(&r.name)),
        ("direction", strval(r.direction)),
        (
            "sourceMultiplicity",
            crate::value::admit_json(&r.source_multiplicity, ctx)?,
        ),
        (
            "targetMultiplicity",
            crate::value::admit_json(&r.target_multiplicity, ctx)?,
        ),
    ]))
}
fn emit_models(
    digest: &str,
    records: &[Record],
    relations: &[RelationInfo],
    actions: &[ActionInfo],
    table_modules: &[TableModule],
    ctx: &mut Context<'_>,
) -> Result<String, EngineError> {
    let metadata = Value::Object(
        records
            .iter()
            .map(|r| Ok((Utf16::from(r.id.as_str()), record_meta(r, ctx)?)))
            .collect::<Result<Vec<_>, EngineError>>()?,
    );
    let action_metadata = Value::Object(
        actions
            .iter()
            .map(|a| {
                Ok((
                    Utf16::from(format!("{}.{}", a.module, a.id)),
                    action_meta(a, ctx)?,
                ))
            })
            .collect::<Result<Vec<_>, EngineError>>()?,
    );
    let metadata_py = python::value_literal(&metadata, ctx)?;
    let actions_py = python::value_literal(&action_metadata, ctx)?;
    let mut imports = vec![
        "# SPDX-License-Identifier: MIT OR Apache-2.0".into(),
        "# Generated from UMF 0.10.0. Regenerate; do not edit.".into(),
        "from __future__ import annotations".into(),
        "from dataclasses import dataclass".into(),
        "from enum import Enum".into(),
        "from collections.abc import Sequence".into(),
        "from datetime import date".into(),
        "from decimal import Decimal".into(),
        "from uuid import UUID".into(),
        "from typing import Any, ClassVar, Literal, cast".into(),
    ];
    imports.push("from ._runtime import Client as RuntimeClient, SyncClient as RuntimeSyncClient, Query, SyncQuery, Field, Relationship, Missing, MISSING, Transport, SyncTransport, AsyncTransport, Receipt, BatchReceipt, BatchItemOutcome, ValidationResult, ExactTimestamp, AccessError, LOCAL_ERROR_CODES as LOCAL_ERROR_CODES, MAX_BATCH_ITEMS as MAX_BATCH_ITEMS, validate_model".into());
    imports.extend([
        format!(
            "SOURCE_DIGEST = {}",
            string_literal(&Utf16::from(digest), ctx)?
        ),
        format!("_METADATA: dict[str, Any] = {metadata_py}"),
        format!("_ACTIONS: dict[str, Any] = {actions_py}"),
        String::new(),
    ]);
    if !table_modules.is_empty() {
        imports.push("from ._runtime import Page".into());
        imports.push("from ._table_runtime import Applied, Recovered, NotObserved, EffectReceipt, MutationItem, table_call, table_call_sync".into());
        imports.push(String::new());
        imports.push("_TABLE_OPERATIONS: dict[tuple[str, str], Any] = {}".into());
        imports.push(String::new());
        for module in table_modules {
            ctx.charge_work(1, Utf16::default())?;
            for command in &module.commands {
                ctx.charge_work(1, Utf16::default())?;
                let input_fields = command
                    .parameters
                    .iter()
                    .map(|(field, _)| field)
                    .collect::<Vec<_>>();
                let input_meta = command
                    .parameters
                    .iter()
                    .map(|(field, native)| table_field_meta(field, native.as_ref(), ctx))
                    .collect::<Result<Vec<_>, _>>()?;
                let row_fields = command.fields.iter().collect::<Vec<_>>();
                let row_meta = command
                    .fields
                    .iter()
                    .map(|field| field_meta(field, ctx))
                    .collect::<Result<Vec<_>, _>>()?;
                for (name, field_specs, metadata) in [
                    (command.input.as_str(), input_fields, input_meta),
                    (command.row.as_deref().unwrap_or(""), row_fields, row_meta),
                ] {
                    ctx.charge_work(1, Utf16::default())?;
                    if name.is_empty() {
                        continue;
                    }
                    imports.push("@dataclass(frozen=True)".into());
                    imports.push(format!("class {name}:"));
                    if field_specs.is_empty() {
                        imports.push("    pass".into());
                    }
                    for field in field_specs {
                        ctx.charge_work(1, Utf16::default())?;
                        imports.push(format!(
                            "    {}: {}",
                            field.name,
                            atom_type(field, false, ctx)?
                        ));
                    }
                    imports.push("    def __post_init__(self) -> None:".into());
                    imports.push(format!(
                        "        validate_model(self, {})",
                        python::value_literal(&Value::Array(metadata), ctx)?
                    ));
                    imports.push(String::new());
                }
            }
        }
        for module in table_modules {
            ctx.charge_work(1, Utf16::default())?;
            for command in &module.commands {
                ctx.charge_work(1, Utf16::default())?;
                imports.push(format!(
                    "_TABLE_OPERATIONS[({}, {})] = {}",
                    string_literal(&Utf16::from(module.id.as_str()), ctx)?,
                    string_literal(&Utf16::from(command.id.as_str()), ctx)?,
                    python::value_literal(&table_command_metadata(command, ctx)?, ctx)?
                ));
            }
        }
        imports.push(String::new());
    }
    let mut lines = imports;
    let table_insert_at = lines.len();
    for r in records {
        ctx.charge_work(1, Utf16::default())?;
        lines.push("@dataclass(frozen=True)".into());
        lines.push(format!("class {}Key:", r.name));
        for f in &r.key {
            ctx.charge_work(1, Utf16::default())?;
            lines.push(format!("    {}: {}", f.name, atom_type(f, false, ctx)?));
        }
        lines.push("    def __post_init__(self) -> None:".into());
        lines.push(format!(
            "        validate_model(self, _METADATA[{}]['key'])",
            string_literal(&Utf16::from(r.id.as_str()), ctx)?
        ));
        lines.push(String::new());
        if r.selected {
            lines.extend([
                "@dataclass(frozen=True)".into(),
                format!("class {}:", r.name),
                format!("    c: ClassVar[{}Columns]", r.name),
                format!("    objects: ClassVar[Query[{}, {}Key]]", r.name, r.name),
            ]);
            for missing in [false, true] {
                for f in &r.fields {
                    ctx.charge_work(1, Utf16::default())?;
                    if f.missing != missing {
                        continue;
                    }
                    lines.push(format!(
                        "    {}: {}{}",
                        f.name,
                        atom_type(f, f.missing, ctx)?,
                        if f.missing { " = MISSING" } else { "" }
                    ));
                }
            }
            lines.push("    def __post_init__(self) -> None:".into());
            lines.push(format!(
                "        validate_model(self, _METADATA[{}]['fields'])",
                string_literal(&Utf16::from(r.id.as_str()), ctx)?
            ));
            lines.push(String::new());
        }
    }
    for r in records {
        ctx.charge_work(1, Utf16::default())?;
        if !r.selected {
            lines.push(format!(
                "cast(dict[str, Any], _METADATA[{}]).update(key_type={}Key)",
                string_literal(&Utf16::from(r.id.as_str()), ctx)?,
                r.name
            ));
            continue;
        }
        lines.push(format!("class {}Columns:", r.name));
        if r.fields.is_empty() {
            lines.push("    pass".into());
        }
        for f in &r.fields {
            ctx.charge_work(1, Utf16::default())?;
            lines.push(format!(
                "    {}: Field[{}, {}] = Field({}, {})",
                f.name,
                r.name,
                atom_type(f, false, ctx)?,
                string_literal(&Utf16::from(r.id.as_str()), ctx)?,
                python::value_literal(&field_meta(f, ctx)?, ctx)?
            ));
        }
        for rel in relations {
            ctx.charge_work(rel.owner.len().saturating_add(1), Utf16::default())?;
            if rel.owner != r.id {
                continue;
            }
            let Some(target) = find_metered(
                records,
                ctx,
                |record| record.id == rel.target,
                |record| record.id.len(),
            )?
            else {
                continue;
            };
            if !target.selected {
                continue;
            }
            let owner_key = format!("{}Key", r.name);
            let target_key = format!("{}Key", target.name);
            let type_args = format!(
                "Relationship[{}, {}, {}, {}]",
                r.name, target.name, owner_key, target_key
            );
            let args = [
                r.id.as_str(),
                target.id.as_str(),
                rel.module.as_str(),
                rel.id.as_str(),
                rel.direction,
            ];
            let call_args = args
                .iter()
                .map(|value| string_literal(&Utf16::from(*value), ctx))
                .collect::<Result<Vec<_>, _>>()?
                .join(", ");
            lines.push(format!(
                "    {}: {} = Relationship({})",
                rel.name, type_args, call_args
            ));
        }
        lines.extend([
            String::new(),
            format!("{}.c = {}Columns()", r.name, r.name),
            format!(
                "{}.objects = Query({})",
                r.name,
                string_literal(&Utf16::from(r.id.as_str()), ctx)?
            ),
            format!(
                "cast(dict[str, Any], _METADATA[{}]).update(row_type={}, key_type={}Key)",
                string_literal(&Utf16::from(r.id.as_str()), ctx)?,
                r.name,
                r.name
            ),
            String::new(),
        ]);
    }
    for action in actions {
        ctx.charge_work(1, Utf16::default())?;
        lines.push("@dataclass(frozen=True, kw_only=True)".into());
        lines.push(format!("class {}Input:", action.class));
        if action.parameters.is_empty() {
            lines.push("    pass".into());
        }
        for p in &action.parameters {
            ctx.charge_work(1, Utf16::default())?;
            let ty = if let Some(record) = &p.record {
                format!(
                    "{}Key",
                    find_metered(records, ctx, |r| &r.id == record, |r| r.id.len())?
                        .ok_or_else(|| fail(
                            action.id.as_str(),
                            "Action Key dependency disappeared"
                        ))?
                        .name
                )
            } else {
                atom_type(
                    p.field
                        .as_ref()
                        .ok_or_else(|| fail(action.id.as_str(), "Action Field disappeared"))?,
                    false,
                    ctx,
                )?
            };
            lines.push(format!(
                "    {}: {}{}",
                p.name,
                ty,
                if p.required {
                    ""
                } else {
                    " | Missing = MISSING"
                }
            ));
        }
        lines.push(String::new());
        lines.push(format!("class {}Precondition(str, Enum):", action.class));
        let conditions = list(&action.raw, "preconditions").unwrap_or(&[]);
        if conditions.is_empty() {
            lines.push("    pass".into());
        }
        for condition in conditions {
            ctx.charge_work(1, Utf16::default())?;
            let id = string_at(condition, "id").unwrap_or_default();
            let member = py_name(
                &id,
                false,
                &format!("{}/preconditions/{id}", action.id),
                ctx,
            )?
            .to_ascii_uppercase();
            lines.push(format!(
                "    {} = {}",
                member,
                string_literal(&Utf16::from(id.as_str()), ctx)?
            ));
        }
        lines.push(String::new());
    }
    for (client, runtime, actions_class, sync) in [
        ("Client", "RuntimeClient", "Actions", false),
        ("SyncClient", "RuntimeSyncClient", "SyncActions", true),
    ] {
        ctx.charge_work(1, Utf16::default())?;
        let transport = if sync { "SyncTransport" } else { "Transport" };
        lines.extend([
            format!("class {client}({runtime}):"),
            format!("    def __init__(self, transport: {transport}) -> None:"),
            "        super().__init__(transport, SOURCE_DIGEST, _METADATA, _ACTIONS)".into(),
        ]);
        if !table_modules.is_empty() {
            lines.push(format!(
                "        self.modules: {}ModuleClients = {}ModuleClients(self)",
                if sync { "Sync" } else { "" },
                if sync { "Sync" } else { "" }
            ));
        }
        lines.extend([
            String::new(),
            format!("class {actions_class}:"),
            format!("    def __init__(self, client: {client}) -> None:"),
            format!(
                "        if not isinstance(client, {runtime}): raise AccessError('CLIENT_TYPE')"
            ),
            "        self._client = client".into(),
            String::new(),
        ]);
        for action in actions {
            ctx.charge_work(1, Utf16::default())?;
            let mut parameters = Vec::new();
            for p in &action.parameters {
                ctx.charge_work(1, Utf16::default())?;
                let ty = if let Some(record) = &p.record {
                    format!(
                        "{}Key",
                        find_metered(records, ctx, |r| &r.id == record, |r| r.id.len())?
                            .ok_or_else(|| fail(
                                action.id.as_str(),
                                "Action Key dependency disappeared"
                            ))?
                            .name
                    )
                } else {
                    atom_type(
                        p.field
                            .as_ref()
                            .ok_or_else(|| fail(action.id.as_str(), "Action Field disappeared"))?,
                        false,
                        ctx,
                    )?
                };
                parameters.push(format!(
                    "{}: {}{}",
                    p.name,
                    ty,
                    if p.required {
                        ""
                    } else {
                        " | Missing = MISSING"
                    }
                ));
            }
            let affected = action
                .affected
                .iter()
                .map(|id| {
                    find_metered(records, ctx, |r| &r.id == id, |r| r.id.len())?
                        .map(|r| format!("{}Key", r.name))
                        .ok_or_else(|| {
                            fail(action.id.as_str(), "Action affected Record disappeared")
                        })
                })
                .collect::<Result<Vec<_>, _>>()?
                .join(" | ");
            let affected = if affected.is_empty() {
                "None".into()
            } else {
                affected
            };
            let args = action
                .parameters
                .iter()
                .map(|p| {
                    Ok(format!(
                        "{}: {}",
                        python::value_literal(&strval(&p.name), ctx)?,
                        p.name,
                    ))
                })
                .collect::<Result<Vec<_>, EngineError>>()?
                .join(", ");
            let id =
                python::value_literal(&strval(format!("{}.{}", action.module, action.id)), ctx)?;
            let await_kw = if sync { "" } else { "await " };
            let async_kw = if sync { "" } else { "async " };
            let sig = if parameters.is_empty() {
                "*, idempotency_key: str | None = None".to_owned()
            } else {
                format!(
                    "*, {}, idempotency_key: str | None = None",
                    parameters.join(", ")
                )
            };
            lines.extend([format!("    {async_kw}def {}(self, {}) -> Receipt[{}, None]:",action.name,sig,affected),format!("        return cast(Receipt[{}, None], {await_kw}self._client.apply({id}, {{{args}}}, idempotency_key=idempotency_key))",affected),String::new(),format!("    {async_kw}def {}_validate(self{}) -> ValidationResult:",action.name,if parameters.is_empty(){String::new()}else{format!(", *, {}",parameters.join(", "))}),format!("        return {await_kw}self._client.validate({id}, {{{args}}})"),String::new(),format!("    {async_kw}def {}_batch(self, items: Sequence[{}Input], *, atomic: bool = False, stop_on_error: bool = False, idempotency_key: str | None = None) -> BatchReceipt[{}, None]:",action.name,action.class,affected),format!("        return cast(BatchReceipt[{}, None], {await_kw}self._client.apply_batch({id}, items, {}Input, atomic=atomic, stop_on_error=stop_on_error, idempotency_key=idempotency_key))",affected,action.class),String::new()]);
        }
    }
    let table_classes_start = lines.len();
    for (sync, prefix) in if table_modules.is_empty() {
        ctx.charge_work(1, Utf16::default())?;
        Vec::new()
    } else {
        vec![(false, ""), (true, "Sync")]
    } {
        for module in table_modules {
            ctx.charge_work(1, Utf16::default())?;
            lines.push(format!("class {prefix}{}:", module.class));
            lines.push("    def __init__(self, client: Any) -> None:".into());
            lines.push("        self._client = client".into());
            lines.push(String::new());
            for command in &module.commands {
                ctx.charge_work(1, Utf16::default())?;
                let write = command.result == "mutation";
                let row = command.row.as_deref().unwrap_or("None");
                let result_type = if write {
                    format!("Applied[{row}] | Recovered")
                } else {
                    match command.result.as_str() {
                        "count" => "int".into(),
                        "page" => format!("Page[{row}]"),
                        "many" => format!("tuple[{row}, ...]"),
                        "optional" => format!("{row} | None"),
                        _ => row.into(),
                    }
                };
                let lookup = format!(
                    "_TABLE_OPERATIONS[({}, {})]",
                    string_literal(&Utf16::from(module.id.as_str()), ctx)?,
                    string_literal(&Utf16::from(command.id.as_str()), ctx)?
                );
                if !sync {
                    lines.push(format!(
                        "    # Original operation: {}",
                        serde_quote(&command.id)
                    ));
                }
                let batch_modes = if command.batch.is_some() {
                    vec![false, true]
                } else {
                    vec![false]
                };
                for batch in batch_modes {
                    ctx.charge_work(1, Utf16::default())?;
                    let base = if batch {
                        vec![format!("items: tuple[{}, ...]", command.input)]
                    } else {
                        command
                            .parameters
                            .iter()
                            .map(|(field, _)| {
                                atom_type(field, false, ctx)
                                    .map(|ty| format!("{}: {ty}", field.name))
                            })
                            .collect::<Result<Vec<_>, _>>()?
                    };
                    let mut options = Vec::new();
                    if write {
                        options.push(if command.replay == "caller-key-required" {
                            "idempotency_key: str".into()
                        } else {
                            "idempotency_key: str | None = None".into()
                        });
                    } else if command.result == "page" {
                        options.extend([
                            "size: int | None = None".into(),
                            "cursor: str | None = None".into(),
                        ]);
                    } else if command.result == "many" && !command.fixed_query {
                        options.push("size: int | None = None".into());
                    }
                    let all_args = base
                        .iter()
                        .chain(options.iter())
                        .cloned()
                        .collect::<Vec<_>>();
                    let signature = if all_args.is_empty() {
                        String::new()
                    } else {
                        format!(", *, {}", all_args.join(", "))
                    };
                    let value_expr = if batch {
                        "items".into()
                    } else {
                        format!(
                            "{}({})",
                            command.input,
                            command
                                .parameters
                                .iter()
                                .map(|(field, _)| format!("{}={}", field.name, field.name))
                                .collect::<Vec<_>>()
                                .join(", ")
                        )
                    };
                    let call_args = format!(
                        "self._client, {lookup}, {value_expr}, {}, {}",
                        command.input,
                        command.row.as_deref().unwrap_or("None")
                    );
                    let key = if write { "idempotency_key" } else { "None" };
                    let size = if !write
                        && !command.fixed_query
                        && ["page", "many"].contains(&command.result.as_str())
                    {
                        "size"
                    } else {
                        "None"
                    };
                    let cursor = if command.result == "page" {
                        "cursor"
                    } else {
                        "None"
                    };
                    let func = if sync {
                        "table_call_sync"
                    } else {
                        "table_call"
                    };
                    let await_kw = if sync { "" } else { "await " };
                    let async_kw = if sync { "" } else { "async " };
                    let method = if batch {
                        format!("{}_batch", command.python)
                    } else {
                        command.python.clone()
                    };
                    let call = format!(
                        "{func}({call_args}, key={key}, size={size}, cursor={cursor}, batch={})",
                        if batch { "True" } else { "False" }
                    );
                    lines.push(format!(
                        "    {async_kw}def {method}(self{signature}) -> {result_type}:"
                    ));
                    lines.push(format!(
                        "        return cast({}, {await_kw}{call})",
                        python::value_literal(&strval(&result_type), ctx)?
                    ));
                    lines.push(String::new());
                    if write {
                        let mut observer_args = base.clone();
                        observer_args.push("idempotency_key: str".into());
                        let observer_signature = format!(", *, {}", observer_args.join(", "));
                        let observe_call = format!(
                            "{func}({call_args}, key=idempotency_key, observe=True, batch={})",
                            if batch { "True" } else { "False" }
                        );
                        lines.push(format!(
                            "    {async_kw}def {method}_observe(self{observer_signature}) -> Recovered | NotObserved:"
                        ));
                        lines.push(format!(
                            "        return cast(\"Recovered | NotObserved\", {await_kw}{observe_call})"
                        ));
                        lines.push(String::new());
                    }
                }
            }
        }
        lines.push(format!("class {prefix}ModuleClients:"));
        lines.push("    def __init__(self, client: Any) -> None:".into());
        for module in table_modules {
            ctx.charge_work(1, Utf16::default())?;
            lines.push(format!(
                "        self.{}: {prefix}{} = {prefix}{}(client)",
                module.python, module.class, module.class
            ));
        }
        lines.push(String::new());
    }
    let table_class_lines = lines.drain(table_classes_start..).collect::<Vec<_>>();
    lines.splice(table_insert_at..table_insert_at, table_class_lines);
    lines.extend([
        "AsyncClient = Client".into(),
        "AsyncActions = Actions".into(),
    ]);
    let mut rendered = String::new();
    for (index, line) in lines.iter().enumerate() {
        if index > 0 {
            rendered.push('\n');
        }
        python::append_text(&mut rendered, line, ctx)?;
    }
    let final_len = rendered.trim_end_matches('\n').len();
    rendered.truncate(final_len);
    rendered.push_str("\n\n");
    Ok(rendered)
}

#[cfg(test)]
mod metadata_meter_tests {
    use super::*;

    #[test]
    fn package_and_generated_names_refuse_python_keywords() {
        assert!(!ordinary_package_name("class"));
        assert!(!ordinary_package_name("async"));
        assert!(!ordinary_package_name(""));
        assert!(ordinary_package_name("client_pkg"));
        let error = py_name("class", false, "/name", &mut Context::ordinary()).unwrap_err();
        assert_eq!(error.code, "ACCESS_UNSUPPORTED");
        assert_eq!(error.path, Utf16::from("/name"));
        assert_eq!(
            error.message,
            Utf16::from("Name cannot be generated without a collision")
        );
    }

    #[test]
    fn request_selection_census_propagates_late_host_control() {
        let items: Vec<_> = (0..128)
            .map(|index| {
                Value::Object(vec![
                    (Utf16::from("module"), strval("m")),
                    (Utf16::from("element"), strval(format!("record{index}"))),
                ])
            })
            .collect();
        let mut calls = 0;
        let mut meter = |_: usize| {
            calls += 1;
            if calls == 96 {
                Err(EngineError::new(
                    "VALUE_INVALID",
                    Utf16::from("/host/selection"),
                    "late request scan control",
                ))
            } else {
                Ok(())
            }
        };
        let error = selected_ids(
            &items,
            "element",
            &mut Context::ordinary().with_meter(&mut meter),
        )
        .unwrap_err();
        assert!(error.is_control_failure());
        assert_eq!(error.code, "VALUE_INVALID");
        assert_eq!(error.path, Utf16::from("/host/selection"));
        assert_eq!(calls, 96);
    }
    #[test]
    fn candidate_search_propagates_late_host_controls() {
        let candidates: Vec<_> = (0..128).map(|_| "candidate").collect();
        for code in ["LIMIT", "CANCELLED", "VALUE_INVALID"] {
            let mut calls = 0;
            let mut meter = |_: usize| {
                calls += 1;
                if calls == 96 {
                    Err(EngineError::new(
                        code,
                        Utf16::from("/host/candidate"),
                        "stop during actual scan",
                    ))
                } else {
                    Ok(())
                }
            };
            let error = find_metered(
                &candidates,
                &mut Context::ordinary().with_meter(&mut meter),
                |_| false,
                |candidate| candidate.len(),
            )
            .unwrap_err();
            assert!(error.is_control_failure());
            assert_eq!(error.code, code);
            assert_eq!(error.path, Utf16::from("/host/candidate"));
            assert_eq!(calls, 96);
        }
    }
    #[test]
    fn opaque_facet_metadata_copy_charges_the_live_meter_before_copying() {
        let field = Field {
            id: "large-metadata".into(),
            name: "large_metadata".into(),
            scalar: "string".into(),
            card: "one".into(),
            nullable: false,
            missing: false,
            item: None,
            allowed: Vec::new(),
            allowed_literals: Vec::new(),
            facets: Value::Object(vec![(
                Utf16::from("vendorPayload"),
                Value::String(Utf16::from("x".repeat(32_000))),
            )]),
            semantic_types: Value::Array(Vec::new()),
            extensions: None,
        };
        let mut charged = 0usize;
        let mut meter = |amount: usize| {
            charged = charged.saturating_add(amount);
            if charged > 256 {
                Err(EngineError::new(
                    "VALUE_INVALID",
                    Utf16::from("/host/metadata-copy-budget"),
                    "metadata copy budget reached",
                ))
            } else {
                Ok(())
            }
        };
        let result = field_meta(&field, &mut Context::ordinary().with_meter(&mut meter));
        let error = result.expect_err("large opaque metadata must be charged before it is copied");
        assert!(error.is_control_failure());
        assert_eq!(error.code, "VALUE_INVALID");
        assert_eq!(error.path, Utf16::from("/host/metadata-copy-budget"));
        assert!(charged > 256);
    }
}
