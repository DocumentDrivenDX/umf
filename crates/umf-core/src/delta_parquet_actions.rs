// SPDX-License-Identifier: MIT OR Apache-2.0
//! Bounded projection of decoded Parquet checkpoint rows into Delta JSONL actions.
//! The Parquet capture remains authoritative; this view does not reconcile a snapshot.

use crate::{
    context::Context,
    delta_actions::{self, DeltaActionResources},
    delta_log::{self, DeltaLogResources},
    engine::{Capabilities, Engine},
    error::{Diagnostic, EngineError, Severity},
    native_json::NativeJsonNode as N,
    parquet_values::decode_parquet_values,
    registry::Registry,
    serialization::{self, Format},
    value::{Utf16, Value},
};

const ROW_LIMIT: usize = 10_000;
const TEXT_LIMIT: usize = 1_000_000;

pub fn project_delta_parquet_actions(
    source: &Value,
    engine: &Engine,
    registry: &Registry,
    capabilities: &mut dyn Capabilities,
    log_resources: &DeltaLogResources,
    action_resources: &DeltaActionResources,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let decoded = decode_parquet_values(source, engine, registry, capabilities, ctx)?;
    let retained_source = copy_field(&decoded, "source", ctx)?;
    let mut diagnostics = match field(&decoded, "diagnostics") {
        Some(Value::Array(rows)) => {
            ctx.charge_work(rows.len(), Utf16::default())?;
            let mut copied = Vec::new();
            copied
                .try_reserve(rows.len())
                .map_err(|_| limit("Diagnostic allocation refused"))?;
            for row in rows {
                copied.push(crate::copy_json(row, ctx)?);
            }
            copied
        }
        _ => Vec::new(),
    };
    if string_field(&decoded, "status").as_deref() != Some("projected") {
        return Ok(report(
            retained_source,
            "blocked",
            diagnostics,
            None,
            None,
            None,
        ));
    }
    let rows = match field(&decoded, "rows") {
        Some(Value::Array(rows)) if rows.len() <= ROW_LIMIT => rows,
        _ => {
            diagnostics.push(diagnostic(
                "DELTA_PARQUET_CONVERSION",
                "",
                "At most 10000 decoded rows are supported",
                Severity::Error,
            ));
            return Ok(report(
                retained_source,
                "blocked",
                diagnostics,
                None,
                None,
                None,
            ));
        }
    };
    let grammar_source = include_str!("../../../spec/extensions/delta-log/action-schema.json");
    let grammar_units = grammar_source.encode_utf16().count();
    ctx.charge_text(grammar_units, Utf16::default())?;
    let mut grammar_utf16 = Vec::new();
    grammar_utf16
        .try_reserve_exact(grammar_units)
        .map_err(|_| limit("Action grammar allocation refused"))?;
    grammar_utf16.extend(grammar_source.encode_utf16());
    let grammar = serialization::read_json_value(&grammar_utf16, Format::Json, ctx)?;
    let action_properties = field(&grammar, "properties").unwrap_or(&Value::Null);
    let mut actions = Vec::new();
    let mut omitted = Vec::new();
    let mut conversions = Vec::new();
    let mut lines = Vec::new();
    actions
        .try_reserve(rows.len())
        .map_err(|_| limit("Action allocation refused"))?;
    lines
        .try_reserve(rows.len())
        .map_err(|_| limit("JSONL allocation refused"))?;
    let mut total_units = 0usize;
    for (index, row) in rows.iter().enumerate() {
        ctx.charge_work(1, Utf16::default())?;
        let fields = match typed_fields(row) {
            Some(fields) => fields,
            None => {
                return blocked_with(
                    diagnostics,
                    retained_source,
                    "Checkpoint row must be a struct",
                )
            }
        };
        ctx.charge_work(fields.len().saturating_mul(fields.len()), Utf16::default())?;
        for (index, row_field) in fields.iter().enumerate() {
            let Some(name) = field(row_field, "name") else {
                return blocked_with(
                    diagnostics,
                    retained_source,
                    "Checkpoint field name is missing",
                );
            };
            if fields[..index]
                .iter()
                .any(|previous| field(previous, "name") == Some(name))
            {
                return blocked_with(
                    diagnostics,
                    retained_source,
                    "Duplicate checkpoint action column",
                );
            }
        }
        let mut populated = fields
            .iter()
            .filter(|field| !is_null(field_value(field, "value")));
        let Some(action_field) = populated.next() else {
            return blocked_with(
                diagnostics,
                retained_source,
                "Checkpoint row must contain one non-null action",
            );
        };
        if populated.next().is_some() {
            return blocked_with(
                diagnostics,
                retained_source,
                "Checkpoint row must contain exactly one non-null action",
            );
        }
        let action = match string_field(action_field, "name") {
            Some(action) => action,
            None => {
                return blocked_with(
                    diagnostics,
                    retained_source,
                    "Checkpoint action name is missing",
                )
            }
        };
        ctx.charge_text(
            action.encode_utf16().count().saturating_mul(2),
            Utf16::default(),
        )?;
        // Unknown action names remain opaque: their typed values are lowered
        // only when every contained native scalar has an exact JSON meaning.
        let action_schema = field(action_properties, &action);
        let Some(value) = field(action_field, "value") else {
            return blocked_with(
                diagnostics,
                retained_source,
                "Checkpoint action value is missing",
            );
        };
        let node = match convert_typed(
            value,
            action_schema,
            index + 1,
            &format!("/{action}"),
            &mut omitted,
            &mut conversions,
            ctx,
        ) {
            Ok(node) => node,
            Err(error) if error.is_control_failure() || error.code == "LIMIT" => return Err(error),
            Err(error) => {
                diagnostics.push(diagnostic(
                    "DELTA_PARQUET_CONVERSION",
                    "",
                    &error
                        .message
                        .to_utf8()
                        .unwrap_or_else(|_| "Unsupported typed Parquet meaning".to_owned()),
                    Severity::Error,
                ));
                return Ok(report(
                    retained_source,
                    "blocked",
                    diagnostics,
                    None,
                    None,
                    None,
                ));
            }
        };
        let mut line = Vec::new();
        push_ascii(&mut line, "{", ctx)?;
        push_json_string(&mut line, &Utf16::from(action.as_str()), ctx)?;
        push_ascii(&mut line, ":", ctx)?;
        write_node(&mut line, &node, ctx)?;
        push_ascii(&mut line, "}\n", ctx)?;
        total_units = total_units
            .checked_add(line.len())
            .ok_or_else(|| limit("Projected JSONL size overflow"))?;
        if total_units > TEXT_LIMIT {
            return blocked_with(
                diagnostics,
                retained_source,
                "Projected log exceeds 1000000 UTF-16 code units",
            );
        }
        let tagged = tagged_node(&node, ctx)?;
        actions.push(object(vec![
            ("row", Value::Number((index + 1) as f64)),
            ("action", Value::String(Utf16::from(action.as_str()))),
            ("value", tagged),
        ]));
        lines.push(line);
    }
    ctx.charge_text(total_units, Utf16::default())?;
    let mut text_units = Vec::new();
    text_units
        .try_reserve(total_units)
        .map_err(|_| limit("Projected JSONL allocation refused"))?;
    for line in lines {
        text_units.extend(line);
    }
    let id = match field(source, "id") {
        Some(Value::String(id)) => id,
        _ => {
            return blocked_with(
                diagnostics,
                retained_source,
                "Parquet source ID is required",
            )
        }
    };
    let suffix = Utf16::from("-delta-actions");
    ctx.charge_text(id.len().saturating_add(suffix.len()), Utf16::default())?;
    let mut log_id_units = Vec::new();
    log_id_units
        .try_reserve(id.len().saturating_add(suffix.len()))
        .map_err(|_| limit("Derived log ID allocation refused"))?;
    log_id_units.extend_from_slice(id.units());
    log_id_units.extend_from_slice(suffix.units());
    let log_id = Utf16::new(log_id_units);
    let log = match delta_log::capture_delta_log(&text_units, &log_id, log_resources, ctx) {
        Ok(log) => log,
        Err(error) if error.is_control_failure() || error.code == "LIMIT" => return Err(error),
        Err(error) => {
            diagnostics.push(diagnostic(
                "DELTA_PARQUET_CONVERSION",
                "",
                &error
                    .message
                    .to_utf8()
                    .unwrap_or_else(|_| "Unable to capture projected Delta JSONL".to_owned()),
                Severity::Error,
            ));
            return Ok(report(
                retained_source,
                "blocked",
                diagnostics,
                None,
                None,
                None,
            ));
        }
    };
    let inspected =
        match delta_actions::inspect_delta_actions(&log, log_resources, action_resources, ctx) {
            Ok(report) => report,
            Err(error) if error.is_control_failure() || error.code == "LIMIT" => return Err(error),
            Err(error) => {
                diagnostics.push(diagnostic(
                    "DELTA_PARQUET_CONVERSION",
                    "",
                    &error
                        .message
                        .to_utf8()
                        .unwrap_or_else(|_| "Unable to inspect projected Delta actions".to_owned()),
                    Severity::Error,
                ));
                return Ok(report(
                    retained_source,
                    "blocked",
                    diagnostics,
                    None,
                    None,
                    None,
                ));
            }
        };
    if let Some(Value::Array(rows)) = field(&inspected, "diagnostics") {
        ctx.charge_work(rows.len(), Utf16::default())?;
        diagnostics
            .try_reserve(rows.len())
            .map_err(|_| limit("Diagnostic allocation refused"))?;
        for row in rows {
            diagnostics.push(crate::copy_json(row, ctx)?);
        }
    }
    if !matches!(
        field(&inspected, "knownShapesValid"),
        Some(Value::Bool(true))
    ) {
        diagnostics.push(diagnostic(
            "DELTA_PARQUET_CONVERSION",
            "",
            "Projected known Delta action shapes are invalid",
            Severity::Error,
        ));
        return Ok(report(
            retained_source,
            "blocked",
            diagnostics,
            None,
            None,
            None,
        ));
    }
    diagnostics.push(diagnostic("DELTA_PARQUET_ACTION_VIEW", "", "Non-null action columns projected; known optional null fields normalized to absence with recorded paths. Annotated statistics conversions retain typed inputs and exact JSON outputs in scalarConversions. Native source is retained. Checkpoint protocol/state validity remains separate", Severity::Warning));
    Ok(report(
        retained_source,
        "projected",
        diagnostics,
        Some(log),
        Some(actions),
        Some((omitted, conversions)),
    ))
}

fn convert_typed(
    value: &Value,
    schema: Option<&Value>,
    row: usize,
    path: &str,
    omitted: &mut Vec<Value>,
    conversions: &mut Vec<Value>,
    ctx: &mut Context<'_>,
) -> Result<N, EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    if value == &Value::Null {
        return Ok(N::Null);
    }
    let kind =
        string_field(value, "kind").ok_or_else(|| unsupported("Typed Parquet kind is required"))?;
    let scalar_conversion = matches!(kind.as_str(), "decimal" | "float" | "date" | "timestamp")
        && (path.starts_with("/add/stats_parsed/")
            || path.starts_with("/add/partitionValues_parsed/"));
    let converted = match kind.as_str() {
        "struct" => {
            let fields = typed_fields(value)
                .ok_or_else(|| unsupported("Typed struct fields are missing"))?;
            let props = schema.and_then(|s| field(unwrap_schema(s), "properties"));
            let required = schema
                .and_then(|s| field(unwrap_schema(s), "required"))
                .and_then(as_array);
            let mut members = Vec::new();
            members
                .try_reserve(fields.len())
                .map_err(|_| limit("Struct projection allocation refused"))?;
            for child in fields {
                let name = string_field(child, "name")
                    .ok_or_else(|| unsupported("Typed field name is missing"))?;
                let child_value = field(child, "value")
                    .ok_or_else(|| unsupported("Typed field value is missing"))?;
                let child_schema = props.and_then(|p| field(p, &name));
                if child_value == &Value::Null
                    && child_schema.is_some()
                    && !required.is_some_and(|items| {
                        items
                            .iter()
                            .any(|item| string_value(item).as_deref() == Some(name.as_str()))
                    })
                {
                    ctx.charge_work(1, Utf16::default())?;
                    let omitted_path = pointer_child(path, &name, ctx)?;
                    ctx.charge_text(omitted_path.encode_utf16().count(), Utf16::default())?;
                    omitted
                        .try_reserve(1)
                        .map_err(|_| limit("Omission report allocation refused"))?;
                    omitted.push(object(vec![
                        ("row", Value::Number(row as f64)),
                        ("path", Value::String(Utf16::from(omitted_path))),
                    ]));
                    continue;
                }
                members.push((
                    Utf16::from(name.as_str()),
                    convert_typed(
                        child_value,
                        child_schema,
                        row,
                        &pointer_child(path, &name, ctx)?,
                        omitted,
                        conversions,
                        ctx,
                    )?,
                ));
            }
            Ok(N::Object(members))
        }
        "map" => {
            let entries = field(value, "entries")
                .and_then(as_array)
                .ok_or_else(|| unsupported("Typed map entries are missing"))?;
            let mut members = Vec::new();
            members
                .try_reserve(entries.len())
                .map_err(|_| limit("Map projection allocation refused"))?;
            for entry in entries {
                let key =
                    field(entry, "key").ok_or_else(|| unsupported("Typed map key is missing"))?;
                if string_field(key, "kind").as_deref() != Some("string") {
                    return Err(unsupported("Delta JSON maps require string keys"));
                }
                let key = string_field(key, "value")
                    .ok_or_else(|| unsupported("Typed map key text is missing"))?;
                if members
                    .iter()
                    .any(|(prior, _): &(Utf16, N)| prior == &Utf16::from(key.as_str()))
                {
                    return Err(unsupported("Duplicate map key cannot be discarded"));
                }
                let child = field(entry, "value")
                    .ok_or_else(|| unsupported("Typed map value is missing"))?;
                let child_schema =
                    schema.and_then(|s| field(unwrap_schema(s), "additionalProperties"));
                members.push((
                    Utf16::from(key.as_str()),
                    convert_typed(
                        child,
                        child_schema,
                        row,
                        &pointer_child(path, &key, ctx)?,
                        omitted,
                        conversions,
                        ctx,
                    )?,
                ));
            }
            Ok(N::Object(members))
        }
        "list" => {
            let items = field(value, "items")
                .and_then(as_array)
                .ok_or_else(|| unsupported("Typed list items are missing"))?;
            let mut output = Vec::new();
            output
                .try_reserve(items.len())
                .map_err(|_| limit("List projection allocation refused"))?;
            let item_schema = schema.and_then(|s| field(unwrap_schema(s), "items"));
            for (index, item) in items.iter().enumerate() {
                let child_path = pointer_child(path, &index.to_string(), ctx)?;
                output.push(convert_typed(
                    item,
                    item_schema,
                    row,
                    &child_path,
                    omitted,
                    conversions,
                    ctx,
                )?);
            }
            Ok(N::Array(output))
        }
        "bool" => match field(value, "value") {
            Some(Value::Bool(x)) => Ok(N::Boolean(*x)),
            _ => Err(unsupported("Typed boolean is malformed")),
        },
        "int" | "uint" => number_node(value, ctx),
        "string" | "enum" | "json" => string_node(value, ctx),
        "decimal"
            if path.starts_with("/add/stats_parsed/")
                || path.starts_with("/add/partitionValues_parsed/") =>
        {
            number_node(value, ctx)
        }
        "float"
            if path.starts_with("/add/stats_parsed/")
                || path.starts_with("/add/partitionValues_parsed/") =>
        {
            let raw = string_field(value, "value")
                .ok_or_else(|| unsupported("Typed float is malformed"))?;
            let number = raw.parse::<f64>().map_err(|_| {
                unsupported("Nonfinite checkpoint statistics require a separate representation")
            })?;
            if !number.is_finite() {
                return Err(unsupported(
                    "Nonfinite checkpoint statistics require a separate representation",
                ));
            }
            ctx.charge_text(raw.encode_utf16().count(), Utf16::default())?;
            Ok(N::Number(raw))
        }
        "date"
            if path.starts_with("/add/stats_parsed/")
                || path.starts_with("/add/partitionValues_parsed/") =>
        {
            let raw = string_field(value, "value")
                .ok_or_else(|| unsupported("Typed date is malformed"))?;
            let days = raw
                .parse::<i64>()
                .map_err(|_| unsupported("Typed date day count is invalid"))?;
            let date = iso_date(days)?;
            ctx.charge_text(date.encode_utf16().count(), Utf16::default())?;
            Ok(N::String(Utf16::from(date)))
        }
        "timestamp"
            if path.starts_with("/add/stats_parsed/")
                || path.starts_with("/add/partitionValues_parsed/") =>
        {
            let raw = string_field(value, "value")
                .ok_or_else(|| unsupported("Typed timestamp is malformed"))?;
            let amount = raw
                .parse::<i128>()
                .map_err(|_| unsupported("Typed timestamp integer is invalid"))?;
            let unit_name = string_field(value, "unit")
                .ok_or_else(|| unsupported("Typed timestamp unit is missing"))?;
            let (units_per_second, units_per_day, digits) = match unit_name.as_str() {
                "MILLIS" => (1_000i128, 86_400_000i128, 3),
                "MICROS" => (1_000_000i128, 86_400_000_000i128, 6),
                "NANOS" => (1_000_000_000i128, 86_400_000_000_000i128, 9),
                _ => return Err(unsupported("Unsupported timestamp unit")),
            };
            let days = amount.div_euclid(units_per_day);
            let within_day = amount.rem_euclid(units_per_day);
            let days = i64::try_from(days)
                .map_err(|_| unsupported("Checkpoint timestamp is outside supported ISO years"))?;
            let date = iso_date(days)?;
            let seconds = within_day / units_per_second;
            let fraction = within_day % units_per_second;
            let hour = seconds / 3600;
            let minute = (seconds / 60) % 60;
            let second = seconds % 60;
            let adjusted = matches!(field(value, "isAdjustedToUTC"), Some(Value::Bool(true)));
            let text = format!(
                "{date}T{hour:02}:{minute:02}:{second:02}.{fraction:0digits$}{}",
                if adjusted { "Z" } else { "" },
            );
            ctx.charge_text(text.len(), Utf16::default())?;
            Ok(N::String(Utf16::from(text)))
        }
        _ => Err(unsupported(
            "Logical Parquet meaning requires a Delta-specific conversion",
        )),
    }?;
    if scalar_conversion {
        ctx.charge_work(1, Utf16::default())?;
        let input = crate::copy_json(value, ctx)?;
        let output = tagged_node(&converted, ctx)?;
        let path_units = path.encode_utf16().count();
        ctx.charge_text(path_units, Utf16::default())?;
        conversions
            .try_reserve(1)
            .map_err(|_| limit("Scalar conversion allocation refused"))?;
        conversions.push(object(vec![
            ("row", Value::Number(row as f64)),
            ("path", Value::String(Utf16::from(path))),
            ("input", input),
            ("output", output),
        ]));
    }
    Ok(converted)
}

fn number_node(value: &Value, ctx: &mut Context<'_>) -> Result<N, EngineError> {
    let Some(Value::String(token)) = field(value, "value") else {
        return Err(unsupported("Typed numeric token is missing"));
    };
    ctx.charge_text(token.len(), Utf16::default())?;
    let token = token
        .to_utf8()
        .map_err(|_| unsupported("Typed numeric token is invalid"))?;
    if token.is_empty() || !token.is_ascii() {
        return Err(unsupported("Typed numeric token is invalid"));
    }
    Ok(N::Number(token))
}

fn iso_date(days_since_epoch: i64) -> Result<String, EngineError> {
    // The supported range mirrors the public adapter's ISO year 0001–9999.
    if !(-719_162..=2_932_896).contains(&days_since_epoch) {
        return Err(unsupported(
            "Checkpoint date is outside supported ISO years 0001–9999",
        ));
    }
    let z = days_since_epoch + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let day_of_era = z - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let mut year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_prime = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_prime + 2) / 5 + 1;
    let month = month_prime + if month_prime < 10 { 3 } else { -9 };
    if month <= 2 {
        year += 1;
    }
    Ok(format!("{year:04}-{month:02}-{day:02}"))
}
fn string_node(value: &Value, ctx: &mut Context<'_>) -> Result<N, EngineError> {
    match field(value, "value") {
        Some(Value::String(s)) => {
            ctx.charge_text(s.len(), Utf16::default())?;
            Ok(N::String(s.clone()))
        }
        _ => Err(unsupported("Typed string value is malformed")),
    }
}
fn unwrap_schema(value: &Value) -> &Value {
    field(value, "anyOf")
        .and_then(as_array)
        .and_then(|a| {
            a.iter()
                .find(|v| string_field(v, "type").as_deref() != Some("null"))
        })
        .unwrap_or(value)
}
fn typed_fields(value: &Value) -> Option<&[Value]> {
    field(value, "fields").and_then(as_array)
}
fn field<'a>(value: &'a Value, key: &str) -> Option<&'a Value> {
    let Value::Object(fields) = value else {
        return None;
    };
    fields
        .iter()
        .find(|(k, _)| k == &Utf16::from(key))
        .map(|(_, v)| v)
}
fn as_array(value: &Value) -> Option<&[Value]> {
    if let Value::Array(v) = value {
        Some(v)
    } else {
        None
    }
}
fn string_value(value: &Value) -> Option<String> {
    if let Value::String(s) = value {
        s.to_utf8().ok()
    } else {
        None
    }
}
fn string_field(value: &Value, key: &str) -> Option<String> {
    match field(value, key)? {
        Value::String(s) => s.to_utf8().ok(),
        _ => None,
    }
}
fn field_value<'a>(value: &'a Value, key: &str) -> Option<&'a Value> {
    field(value, key)
}
fn is_null(value: Option<&Value>) -> bool {
    matches!(value, Some(Value::Null))
}
fn copy_field(value: &Value, key: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    crate::copy_json(
        field(value, key).ok_or_else(|| unsupported("Required field missing"))?,
        ctx,
    )
}
fn pointer_child(base: &str, child: &str, ctx: &mut Context<'_>) -> Result<String, EngineError> {
    let extra = child
        .chars()
        .map(|c| {
            if c == '~' || c == '/' {
                2
            } else {
                c.len_utf16()
            }
        })
        .sum::<usize>()
        .saturating_add(1);
    let units = base.encode_utf16().count().saturating_add(extra);
    ctx.charge_text(units, Utf16::default())?;
    let child = child.replace('~', "~0").replace('/', "~1");
    let mut output = String::new();
    output
        .try_reserve(base.len().saturating_add(child.len()).saturating_add(1))
        .map_err(|_| limit("JSON pointer allocation refused"))?;
    output.push_str(base);
    output.push('/');
    output.push_str(&child);
    Ok(output)
}
fn object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(k, v)| (Utf16::from(k), v))
            .collect(),
    )
}
fn diagnostic(code: &str, path: &str, message: &str, severity: Severity) -> Value {
    object(vec![
        ("code", Value::string_utf8(code)),
        ("path", Value::string_utf8(path)),
        (
            "severity",
            Value::string_utf8(match severity {
                Severity::Error => "error",
                Severity::Warning => "warning",
            }),
        ),
        ("message", Value::string_utf8(message)),
    ])
}
fn report(
    source: Value,
    status: &str,
    diagnostics: Vec<Value>,
    log: Option<Value>,
    actions: Option<Vec<Value>>,
    extras: Option<(Vec<Value>, Vec<Value>)>,
) -> Value {
    let mut fields = vec![
        (Utf16::from("source"), source),
        (Utf16::from("status"), Value::string_utf8(status)),
        (Utf16::from("complete"), Value::Bool(false)),
        (Utf16::from("diagnostics"), Value::Array(diagnostics)),
    ];
    if let Some(log) = log {
        fields.push((Utf16::from("log"), log));
    }
    if let Some(actions) = actions {
        fields.push((Utf16::from("actions"), Value::Array(actions)));
    }
    if let Some((omitted, conversions)) = extras {
        fields.push((Utf16::from("omittedNullFields"), Value::Array(omitted)));
        fields.push((Utf16::from("scalarConversions"), Value::Array(conversions)));
    }
    Value::Object(fields)
}
fn blocked_with(
    diagnostics: Vec<Value>,
    source: Value,
    message: &str,
) -> Result<Value, EngineError> {
    let mut diagnostics = diagnostics;
    diagnostics.push(diagnostic(
        "DELTA_PARQUET_CONVERSION",
        "",
        message,
        Severity::Error,
    ));
    Ok(report(source, "blocked", diagnostics, None, None, None))
}
fn unsupported(message: &str) -> EngineError {
    EngineError::new("DELTA_PARQUET_CONVERSION", Utf16::default(), message)
}
fn limit(message: &str) -> EngineError {
    EngineError::new("LIMIT", Utf16::default(), message)
}
fn push_ascii(out: &mut Vec<u16>, text: &str, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    ctx.charge_text(text.len(), Utf16::default())?;
    out.try_reserve(text.len())
        .map_err(|_| limit("JSONL allocation refused"))?;
    out.extend(text.bytes().map(u16::from));
    Ok(())
}
fn push_json_string(
    out: &mut Vec<u16>,
    value: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    ctx.charge_text(value.len(), Utf16::default())?;
    let rendered =
        serialization::write_json_value(&Value::String(value.clone()), Format::Json, ctx)?;
    let units = rendered.units();
    let units = units.strip_suffix(&[10]).unwrap_or(units);
    out.try_reserve(units.len())
        .map_err(|_| limit("JSONL allocation refused"))?;
    out.extend_from_slice(units);
    Ok(())
}
fn write_node(out: &mut Vec<u16>, node: &N, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    match node {
        N::Null => push_ascii(out, "null", ctx),
        N::Boolean(v) => push_ascii(out, if *v { "true" } else { "false" }, ctx),
        N::String(v) => push_json_string(out, v, ctx),
        N::Number(v) => push_ascii(out, v, ctx),
        N::Array(items) => {
            push_ascii(out, "[", ctx)?;
            for (i, item) in items.iter().enumerate() {
                if i > 0 {
                    push_ascii(out, ",", ctx)?;
                }
                write_node(out, item, ctx)?;
            }
            push_ascii(out, "]", ctx)
        }
        N::Object(fields) => {
            push_ascii(out, "{", ctx)?;
            for (i, (key, value)) in fields.iter().enumerate() {
                if i > 0 {
                    push_ascii(out, ",", ctx)?;
                }
                push_json_string(out, key, ctx)?;
                push_ascii(out, ":", ctx)?;
                write_node(out, value, ctx)?;
            }
            push_ascii(out, "}", ctx)
        }
    }
}
fn tagged_node(node: &N, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    Ok(match node {
        N::Null => object(vec![("kind", Value::string_utf8("null"))]),
        N::Boolean(v) => object(vec![
            ("kind", Value::string_utf8("boolean")),
            ("value", Value::Bool(*v)),
        ]),
        N::String(v) => {
            ctx.charge_text(v.len(), Utf16::default())?;
            object(vec![
                ("kind", Value::string_utf8("string")),
                ("value", Value::String(v.clone())),
            ])
        }
        N::Number(v) => {
            ctx.charge_text(v.len(), Utf16::default())?;
            object(vec![
                ("kind", Value::string_utf8("number")),
                ("value", Value::string_utf8(v)),
            ])
        }
        N::Array(items) => {
            let mut out = Vec::new();
            out.try_reserve(items.len())
                .map_err(|_| limit("Tagged array allocation refused"))?;
            for item in items {
                out.push(tagged_node(item, ctx)?);
            }
            object(vec![
                ("kind", Value::string_utf8("array")),
                ("items", Value::Array(out)),
            ])
        }
        N::Object(fields) => {
            let mut out = Vec::new();
            out.try_reserve(fields.len())
                .map_err(|_| limit("Tagged object allocation refused"))?;
            for (k, v) in fields {
                ctx.charge_text(k.len(), Utf16::default())?;
                out.push((k.clone(), tagged_node(v, ctx)?));
            }
            object(vec![
                ("kind", Value::string_utf8("object")),
                ("members", Value::Object(out)),
            ])
        }
    })
}
