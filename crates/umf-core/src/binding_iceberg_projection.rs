// SPDX-License-Identifier: MIT OR Apache-2.0
//! Iceberg metadata proposals over a validated UMF storage binding.
use crate::{
    binding_index_projection::{project_binding_indexes, BindingIndexProjectionResources},
    context::Context,
    error::EngineError,
    iceberg_table::{
        export_iceberg_table, import_iceberg_table, inspect_iceberg_table,
        inspect_iceberg_table_context, IcebergTableResources,
    },
    serialization::{read_json_value, stringify_compact_metered, Format},
    value::{copy_json, Utf16, Value},
};
use std::collections::HashMap;

fn k(s: &str) -> Utf16 {
    Utf16::from(s)
}
fn get<'a>(v: &'a Value, n: &str) -> Option<&'a Value> {
    if let Value::Object(fields) = v {
        fields
            .iter()
            .find(|(name, _)| name == &k(n))
            .map(|(_, v)| v)
    } else {
        None
    }
}
fn arr(v: Option<&Value>) -> Option<&[Value]> {
    if let Some(Value::Array(items)) = v {
        Some(items)
    } else {
        None
    }
}
fn text(v: Option<&Value>) -> Option<&Utf16> {
    if let Some(Value::String(value)) = v {
        Some(value)
    } else {
        None
    }
}
fn utf8(v: Option<&Value>) -> Option<String> {
    text(v).and_then(|x| x.to_utf8().ok())
}
fn eq(v: Option<&Value>, value: &str) -> bool {
    utf8(v).as_deref() == Some(value)
}
fn s(value: &str) -> Value {
    Value::String(Utf16::from(value))
}
fn obj(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(k, v)| (Utf16::from(k), v))
            .collect(),
    )
}
fn err(code: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}
fn add_residual(
    out: &mut Vec<Value>,
    path: String,
    reason: &str,
    choice: &Value,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    out.push(obj(vec![
        ("path", s(&path)),
        ("reason", s(reason)),
        ("choice", copy_json(choice, ctx)?),
    ]));
    Ok(())
}
fn same_field(a: &Value, b: &Value) -> bool {
    // Match the TypeScript strict-equality comparison: field references commonly
    // omit `field`, so two absent values still match the same element reference.
    ["module", "element", "field"]
        .iter()
        .all(|name| get(a, name) == get(b, name))
}
fn set(value: &mut Value, name: &str, replacement: Value) -> Result<(), EngineError> {
    let Value::Object(fields) = value else {
        return Err(err(
            "ICEBERG_BINDING_SCHEMA",
            "Expected Iceberg metadata object",
        ));
    };
    if let Some((_, slot)) = fields.iter_mut().find(|(key, _)| key == &k(name)) {
        *slot = replacement;
    } else {
        fields.push((k(name), replacement));
    }
    Ok(())
}
fn push_array(value: &mut Value, name: &str, item: Value) -> Result<(), EngineError> {
    let fields = match value {
        Value::Object(fields) => fields,
        _ => {
            return Err(err(
                "ICEBERG_BINDING_SCHEMA",
                "Expected Iceberg metadata object",
            ))
        }
    };
    let Some((_, Value::Array(items))) = fields.iter_mut().find(|(key, _)| key == &k(name)) else {
        return Err(err(
            "ICEBERG_BINDING_SCHEMA",
            "Missing Iceberg sort-order history",
        ));
    };
    items.push(item);
    Ok(())
}
fn numeric(v: Option<&Value>) -> Option<f64> {
    if let Some(Value::Number(n)) = v {
        Some(*n)
    } else {
        None
    }
}
fn js_string(v: Option<&Value>) -> Option<String> {
    match v {
        Some(Value::String(s)) => s.to_utf8().ok(),
        Some(Value::Number(n)) if n.is_finite() && n.fract() == 0.0 => Some(format!("{n:.0}")),
        Some(Value::Number(n)) => Some(n.to_string()),
        _ => None,
    }
}

/// Rust-owned implementation of `projectBindingToIceberg`.
pub fn project_binding_to_iceberg(
    binding_resources: &BindingIndexProjectionResources,
    iceberg_resources: &IcebergTableResources,
    logical: &Value,
    binding: &Value,
    native_archive: &Value,
    loss_policy: &str,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    if loss_policy != "strict" && loss_policy != "report" {
        return Err(err(
            "BINDING_LOSS_POLICY",
            "Expected strict or report loss policy",
        ));
    }
    let admitted = project_binding_indexes(binding_resources, binding, logical, "report", ctx)?;
    let source = get(&admitted, "source")
        .ok_or_else(|| err("BINDING_DOCUMENT", "Validated binding source missing"))?;
    let model = get(&admitted, "logical")
        .ok_or_else(|| err("BINDING_MODEL", "Validated logical document missing"))?;
    let payload = get(
        get(source, "extensions").unwrap_or(&Value::Null),
        "umf.binding",
    )
    .ok_or_else(|| err("BINDING_DOCUMENT", "Binding extension payload is missing"))?;
    let target = get(payload, "target")
        .cloned()
        .ok_or_else(|| err("BINDING_DOCUMENT", "Binding target is missing"))?;
    let target_version = utf8(get(&target, "version")).ok_or_else(|| {
        err(
            "BINDING_TARGET",
            "Expected pinned Iceberg v2 or v3 metadata profile",
        )
    })?;
    let major = target_version.split('.').next().unwrap_or_default();
    if !eq(get(&target, "system"), "iceberg") || !matches!(major, "2" | "3") {
        return Err(err(
            "BINDING_TARGET",
            "Expected pinned Iceberg v2 or v3 metadata profile",
        ));
    }
    let validation = inspect_iceberg_table(native_archive, iceberg_resources, ctx)?;
    if !validation.valid {
        return Err(err(
            "ICEBERG_BINDING_SOURCE",
            "Native table metadata has invalid current references",
        ));
    }
    let context = inspect_iceberg_table_context(native_archive, iceberg_resources, ctx)?;
    if context.status == k("blocked") {
        return Err(err(
            "ICEBERG_BINDING_SOURCE",
            "Native table metadata has invalid current references",
        ));
    }
    let native_text = export_iceberg_table(native_archive, iceberg_resources, ctx)?;
    let metadata = read_json_value(native_text.units(), Format::Json, ctx).map_err(|failure| {
        if failure.is_control_failure() {
            failure
        } else {
            err("ICEBERG_BINDING_SCHEMA", "Missing current Iceberg schema")
        }
    })?;
    if js_string(get(&metadata, "format-version")).as_deref() != Some(major) {
        return Err(err(
            "BINDING_TARGET",
            "Iceberg format version differs from binding target",
        ));
    }
    let current_id = numeric(get(&metadata, "current-schema-id"))
        .ok_or_else(|| err("ICEBERG_BINDING_SCHEMA", "Missing current Iceberg schema"))?;
    let current = arr(get(&metadata, "schemas"))
        .and_then(|schemas| {
            schemas
                .iter()
                .find(|schema| numeric(get(schema, "schema-id")) == Some(current_id))
        })
        .ok_or_else(|| err("ICEBERG_BINDING_SCHEMA", "Missing current Iceberg schema"))?;
    let fields = arr(get(current, "fields"))
        .ok_or_else(|| err("ICEBERG_BINDING_SCHEMA", "Missing current Iceberg schema"))?;
    let mut columns = HashMap::<Utf16, f64>::new();
    for field in fields {
        if let (Some(name), Some(id)) = (text(get(field, "name")), numeric(get(field, "id"))) {
            columns.insert(name.clone(), id);
        }
    }
    let mut residuals = Vec::new();
    for (i, row) in arr(get(payload, "elements"))
        .unwrap_or(&[])
        .iter()
        .enumerate()
    {
        if let Some(partition) = get(row, "partition") {
            add_residual(
                &mut residuals,
                format!("/extensions/umf.binding/elements/{i}/partition"),
                "Partition family needs a separately declared Iceberg partition transform",
                partition,
                ctx,
            )?;
        }
        if let Some(table) = get(row, "table") {
            add_residual(
                &mut residuals,
                format!("/extensions/umf.binding/elements/{i}/table"),
                "Table name belongs to catalog context, not metadata JSON",
                table,
                ctx,
            )?;
        }
    }
    for (i, row) in arr(get(payload, "fields"))
        .unwrap_or(&[])
        .iter()
        .enumerate()
    {
        if eq(get(row, "storage"), "embedded") {
            add_residual(
                &mut residuals,
                format!("/extensions/umf.binding/fields/{i}"),
                "Embedded path needs an independently verified Iceberg nested field mapping",
                row,
                ctx,
            )?;
        } else if text(get(row, "column")).is_none_or(|column| !columns.contains_key(column)) {
            add_residual(
                &mut residuals,
                format!("/extensions/umf.binding/fields/{i}"),
                "Storage column is absent from current Iceberg schema",
                row,
                ctx,
            )?;
        }
    }
    for (i, row) in arr(get(payload, "relationships"))
        .unwrap_or(&[])
        .iter()
        .enumerate()
    {
        add_residual(
            &mut residuals,
            format!("/extensions/umf.binding/relationships/{i}"),
            "Iceberg table metadata does not enforce relationship storage",
            row,
            ctx,
        )?;
    }
    let outcomes = arr(get(&admitted, "outcomes")).unwrap_or(&[]);
    let indexes = arr(get(payload, "indexes")).unwrap_or(&[]);
    for (i, outcome) in outcomes.iter().enumerate() {
        if !eq(get(outcome, "outcome"), "exact") {
            let path = utf8(get(outcome, "path"))
                .unwrap_or_else(|| format!("/extensions/umf.binding/indexes/{i}"));
            let reason =
                utf8(get(outcome, "reason")).unwrap_or_else(|| "No exact index carrier".into());
            add_residual(
                &mut residuals,
                path,
                &reason,
                indexes.get(i).unwrap_or(&Value::Null),
                ctx,
            )?;
        }
    }
    let clustering: Vec<(usize, &Value)> = indexes
        .iter()
        .enumerate()
        .filter(|(i, item)| {
            eq(get(item, "kind"), "clustering")
                && outcomes
                    .get(*i)
                    .is_some_and(|row| eq(get(row, "outcome"), "approximated"))
        })
        .collect();
    if clustering.len() > 1 {
        for (i, item) in &clustering {
            add_residual(
                &mut residuals,
                format!("/extensions/umf.binding/indexes/{i}"),
                "One table has one default sort-order selection",
                item,
                ctx,
            )?;
        }
    }
    let mut candidate = None;
    if clustering.len() == 1 {
        let (i, item) = clustering[0];
        let mut sort_fields = Vec::new();
        for target_ref in arr(get(item, "on")).unwrap_or(&[]) {
            let Some(reference) = get(target_ref, "field") else {
                continue;
            };
            let field = arr(get(payload, "fields"))
                .unwrap_or(&[])
                .iter()
                .find(|row| same_field(row, reference));
            let source_id = field
                .and_then(|row| text(get(row, "column")))
                .and_then(|column| columns.get(column))
                .copied();
            if let Some(source_id) = source_id {
                sort_fields.push(obj(vec![
                    ("transform", s("identity")),
                    ("source-id", Value::Number(source_id)),
                    ("direction", s("asc")),
                    ("null-order", s("nulls-first")),
                ]));
            } else {
                add_residual(
                    &mut residuals,
                    format!("/extensions/umf.binding/indexes/{i}"),
                    "Sort target has no current Iceberg source field ID",
                    item,
                    ctx,
                )?;
            }
        }
        if sort_fields.len() == arr(get(item, "on")).unwrap_or(&[]).len() {
            let orders = arr(get(&metadata, "sort-orders")).ok_or_else(|| {
                err(
                    "ICEBERG_BINDING_SCHEMA",
                    "Missing Iceberg sort-order history",
                )
            })?;
            let max_id = orders
                .iter()
                .filter_map(|order| numeric(get(order, "order-id")))
                .fold(0.0_f64, f64::max);
            let order_id = max_id + 1.0;
            let order = obj(vec![
                ("order-id", Value::Number(order_id)),
                ("fields", Value::Array(sort_fields)),
            ]);
            let mut proposed = copy_json(&metadata, ctx)?;
            push_array(&mut proposed, "sort-orders", order)?;
            set(
                &mut proposed,
                "default-sort-order-id",
                Value::Number(order_id),
            )?;
            let mut candidate_units = stringify_compact_metered(&proposed, ctx)?.into_units();
            candidate_units.push(10);
            let candidate_text = Utf16::new(candidate_units);
            let candidate_doc = import_iceberg_table(
                candidate_text.units(),
                &k("iceberg-sort-proposal"),
                iceberg_resources,
                ctx,
            )?;
            if !inspect_iceberg_table(&candidate_doc, iceberg_resources, ctx)?.valid
                || inspect_iceberg_table_context(&candidate_doc, iceberg_resources, ctx)?.status
                    == k("blocked")
            {
                return Err(err(
                    "ICEBERG_BINDING_CANDIDATE",
                    "Generated metadata failed adapter validation",
                ));
            }
            candidate = Some(candidate_text);
        }
    }
    let blocked = !residuals.is_empty() && loss_policy == "strict";
    let status = if residuals.is_empty() {
        "projected"
    } else if blocked {
        "blocked"
    } else {
        "reported"
    };
    let mut result = vec![
        ("status", s(status)),
        ("logical", copy_json(model, ctx)?),
        ("binding", copy_json(source, ctx)?),
        ("nativeArchive", copy_json(native_archive, ctx)?),
        ("target", target),
        ("residuals", Value::Array(residuals)),
    ];
    if !blocked {
        if let Some(candidate) = candidate {
            result.push(("candidate", Value::String(candidate)));
        }
    }
    let output = obj(result);
    let _ = stringify_compact_metered(&output, ctx)?;
    Ok(output)
}
