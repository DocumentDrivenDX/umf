// SPDX-License-Identifier: MIT OR Apache-2.0
//! Delta liquid-clustering proposals over a validated UMF binding and log.
use crate::{
    binding_index_projection::{project_binding_indexes, BindingIndexProjectionResources},
    context::Context,
    delta_log::{inspect_delta_log, DeltaLogResources},
    error::EngineError,
    serialization::{read_json_value, stringify_compact_metered, Format},
    value::{copy_json, Utf16, Value},
};
use std::collections::HashSet;

fn k(s: &str) -> Utf16 {
    Utf16::from(s)
}
fn get<'a>(v: &'a Value, n: &str) -> Option<&'a Value> {
    if let Value::Object(f) = v {
        f.iter().find(|(x, _)| x == &k(n)).map(|(_, v)| v)
    } else {
        None
    }
}
fn arr(v: Option<&Value>) -> Option<&[Value]> {
    if let Some(Value::Array(x)) = v {
        Some(x)
    } else {
        None
    }
}
fn text(v: Option<&Value>) -> Option<&Utf16> {
    if let Some(Value::String(x)) = v {
        Some(x)
    } else {
        None
    }
}
fn utf8(v: Option<&Value>) -> Option<String> {
    text(v).and_then(|x| x.to_utf8().ok())
}
fn eq(v: Option<&Value>, s: &str) -> bool {
    utf8(v).as_deref() == Some(s)
}
fn s(v: &str) -> Value {
    Value::String(Utf16::from(v))
}
fn obj(v: Vec<(&str, Value)>) -> Value {
    Value::Object(v.into_iter().map(|(a, b)| (k(a), b)).collect())
}
fn err(code: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}
fn is_true(v: Option<&Value>) -> bool {
    matches!(v, Some(Value::Bool(true)))
}
fn tagged_get<'a>(node: &'a Value, name: &str) -> Option<&'a Value> {
    if !eq(get(node, "kind"), "object") {
        return None;
    }
    get(get(node, "members")?, name)
}
fn tagged_array(node: Option<&Value>) -> Option<&[Value]> {
    let node = node?;
    if !eq(get(node, "kind"), "array") {
        return None;
    }
    arr(get(node, "items"))
}
fn tagged_text(node: Option<&Value>) -> Option<&Utf16> {
    let node = node?;
    if !eq(get(node, "kind"), "string") {
        return None;
    }
    text(get(node, "value"))
}
fn tagged_number_is(node: Option<&Value>, expected: f64) -> bool {
    let Some(node) = node else { return false };
    if !eq(get(node, "kind"), "number") {
        return false;
    }
    text(get(node, "value"))
        .and_then(|value| value.to_utf8().ok())
        .and_then(|value| value.parse::<f64>().ok())
        .is_some_and(|value| value == expected)
}
fn last_action<'a>(lines: &'a [Value], action: &str) -> Option<&'a Value> {
    lines
        .iter()
        .rev()
        .filter_map(|line| get(line, "node"))
        .find_map(|node| tagged_get(node, action))
}
fn append_lf(value: Utf16) -> Utf16 {
    let mut units = value.into_units();
    units.push(10);
    Utf16::new(units)
}
fn add_residual(
    residuals: &mut Vec<Value>,
    path: String,
    reason: &str,
    choice: &Value,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    residuals.push(obj(vec![
        ("path", s(&path)),
        ("reason", s(reason)),
        ("choice", copy_json(choice, ctx)?),
    ]));
    Ok(())
}
fn same_field(a: &Value, b: &Value) -> bool {
    ["module", "element", "field"]
        .iter()
        .all(|name| get(a, name) == get(b, name))
}
fn number(v: Option<&Value>) -> Option<f64> {
    if let Some(Value::Number(n)) = v {
        Some(*n)
    } else {
        None
    }
}

/// Port of `projectBindingToDelta`: Rust owns binding admission, Delta action
/// interpretation, target loss decisions, and candidate serialization.
pub fn project_binding_to_delta(
    binding_resources: &BindingIndexProjectionResources,
    delta_resources: &DeltaLogResources,
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
    let version = utf8(get(&target, "version"));
    let supported = version.as_deref().is_some_and(|v| {
        let Some(rest) = v.strip_prefix("3.") else {
            return false;
        };
        let Some(minor) = rest.chars().next() else {
            return false;
        };
        matches!(minor, '2'..='9') && (rest.len() == 1 || rest[1..].starts_with('.'))
    });
    if !eq(get(&target, "system"), "delta") || !supported {
        return Err(err("BINDING_TARGET", "Expected pinned Delta 3.2+ profile"));
    }

    let report = inspect_delta_log(native_archive, delta_resources, ctx)?;
    if !is_true(get(&report, "parsedAll")) {
        return Err(err(
            "DELTA_BINDING_SOURCE",
            "Native log has invalid actions",
        ));
    }
    let lines = arr(get(&report, "lines")).unwrap_or(&[]);
    // TypeScript filters empty JSONL lines before parsing, while whitespace
    // lines remain nonempty and fail JSON.parse.
    if lines.iter().any(|line| {
        eq(get(line, "status"), "blank")
            && number(get(line, "end"))
                .zip(number(get(line, "start")))
                .is_some_and(|(end, start)| end > start)
    }) {
        return Err(err(
            "DELTA_BINDING_SOURCE",
            "Native log has invalid actions",
        ));
    }
    let protocol = last_action(lines, "protocol").ok_or_else(|| {
        err(
            "DELTA_BINDING_FEATURE",
            "Native table must declare clustering and domainMetadata writer features",
        )
    })?;
    let metadata = last_action(lines, "metaData")
        .ok_or_else(|| err("DELTA_BINDING_FEATURE", "Native table metadata is required"))?;
    let features = tagged_array(tagged_get(protocol, "writerFeatures"));
    let has_feature = |feature: &str| {
        features.is_some_and(|list| {
            list.iter().any(|value| {
                tagged_text(Some(value))
                    .is_some_and(|text| text.to_utf8().ok().as_deref() == Some(feature))
            })
        })
    };
    if !has_feature("clustering")
        || !has_feature("domainMetadata")
        || !tagged_number_is(tagged_get(protocol, "minWriterVersion"), 7.0)
    {
        return Err(err("DELTA_BINDING_FEATURE","Native table must declare clustering and domainMetadata writer features with writer version 7"));
    }
    let schema_text = tagged_text(tagged_get(metadata, "schemaString")).ok_or_else(|| {
        err(
            "DELTA_BINDING_SCHEMA",
            "Native table has no known struct schema",
        )
    })?;
    let schema = read_json_value(schema_text.units(), Format::Json, ctx).map_err(|failure| {
        if failure.is_control_failure() {
            failure
        } else {
            err(
                "DELTA_BINDING_SCHEMA",
                "Native table has no known struct schema",
            )
        }
    })?;
    if !eq(get(&schema, "type"), "struct") || arr(get(&schema, "fields")).is_none() {
        return Err(err(
            "DELTA_BINDING_SCHEMA",
            "Native table has no known struct schema",
        ));
    }
    let mut columns = HashSet::new();
    for field in arr(get(&schema, "fields")).unwrap_or(&[]) {
        if let Some(name) = text(get(field, "name")) {
            columns.insert(name.clone());
        }
    }
    let mut residuals = Vec::new();
    if let Some(partitions) = tagged_get(metadata, "partitionColumns") {
        let has_partitions = tagged_array(Some(partitions))
            .is_some_and(|values| !values.is_empty())
            || tagged_text(Some(partitions)).is_some_and(|value| !value.is_empty());
        if has_partitions {
            add_residual(
                &mut residuals,
                "/native/metaData/partitionColumns".into(),
                "Liquid clustering cannot coexist with native partitioning",
                partitions,
                ctx,
            )?;
        }
    }
    for (i, row) in arr(get(payload, "elements"))
        .unwrap_or(&[])
        .iter()
        .enumerate()
    {
        if let Some(partition) = get(row, "partition") {
            if !matches!(partition, Value::Null) {
                add_residual(
                    &mut residuals,
                    format!("/extensions/umf.binding/elements/{i}/partition"),
                    "Delta liquid clustering does not support partitioned layout",
                    partition,
                    ctx,
                )?;
            }
        }
        if let Some(table) = get(row, "table") {
            add_residual(
                &mut residuals,
                format!("/extensions/umf.binding/elements/{i}/table"),
                "Table name is catalog context outside Delta log metadata",
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
                "Struct or variant embedded path has no verified carrier in this profile",
                row,
                ctx,
            )?;
        } else if text(get(row, "column")).is_none_or(|column| !columns.contains(column)) {
            add_residual(
                &mut residuals,
                format!("/extensions/umf.binding/fields/{i}"),
                "Declared storage column is absent from native Delta schema",
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
            "Delta table log does not enforce relationship storage",
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
                utf8(get(outcome, "reason")).unwrap_or_else(|| "Unsupported index kind".into());
            let choice = indexes.get(i).unwrap_or(&Value::Null);
            add_residual(&mut residuals, path, &reason, choice, ctx)?;
        }
    }
    let clustering: Vec<(usize, &Value)> = indexes
        .iter()
        .enumerate()
        .filter(|(i, item)| {
            eq(get(item, "kind"), "clustering")
                && outcomes
                    .get(*i)
                    .is_some_and(|r| eq(get(r, "outcome"), "exact"))
        })
        .collect();
    if clustering.len() > 1 {
        for (i, item) in &clustering {
            add_residual(
                &mut residuals,
                format!("/extensions/umf.binding/indexes/{i}"),
                "One Delta table has one clustering column set",
                item,
                ctx,
            )?;
        }
    }
    let mut candidate = None;
    if clustering.len() == 1 {
        let (i, item) = clustering[0];
        let mut physical_names = Vec::new();
        for target_ref in arr(get(item, "on")).unwrap_or(&[]) {
            let Some(reference) = get(target_ref, "field") else {
                continue;
            };
            let field = arr(get(payload, "fields"))
                .unwrap_or(&[])
                .iter()
                .find(|row| same_field(row, reference));
            if let Some(field) = field {
                if let Some(column) = text(get(field, "column")) {
                    if columns.contains(column) {
                        physical_names.push(Value::Array(vec![Value::String(column.clone())]));
                        continue;
                    }
                }
            }
            add_residual(
                &mut residuals,
                format!("/extensions/umf.binding/indexes/{i}"),
                "Clustering column is absent from native Delta schema",
                item,
                ctx,
            )?;
        }
        if physical_names.len() == arr(get(item, "on")).unwrap_or(&[]).len() {
            let configs = physical_names
                .into_iter()
                .map(|physical_name| obj(vec![("physicalName", physical_name)]))
                .collect();
            let configuration = stringify_compact_metered(
                &obj(vec![("clusteringColumns", Value::Array(configs))]),
                ctx,
            )?;
            let action = obj(vec![(
                "domainMetadata",
                obj(vec![
                    ("domain", s("delta.clustering")),
                    ("configuration", Value::String(configuration)),
                    ("removed", Value::Bool(false)),
                ]),
            )]);
            candidate = Some(append_lf(stringify_compact_metered(&action, ctx)?));
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
    let mut output = vec![
        ("status", s(status)),
        ("logical", copy_json(model, ctx)?),
        ("binding", copy_json(source, ctx)?),
        ("nativeArchive", copy_json(native_archive, ctx)?),
        ("target", target),
        ("residuals", Value::Array(residuals)),
    ];
    if !blocked {
        if let Some(candidate) = candidate {
            output.push(("candidate", Value::String(candidate)));
        }
    }
    let result = obj(output);
    let _ = stringify_compact_metered(&result, ctx)?;
    Ok(result)
}
