// SPDX-License-Identifier: MIT OR Apache-2.0
//! Loss-aware source handling for the proposed security policy 0.2 wire form.
//! This module deliberately does not interpret or activate the policy.

use crate::{
    context::Context,
    error::EngineError,
    schema::{CompiledSchema, SchemaResources},
    serialization::{self, Format},
    value::{Utf16, Value},
};

const LEGACY_SCHEMA: &str = include_str!("../../../spec/extensions/security/schema.json");
const V2_SCHEMA: &str = include_str!("../../../spec/extensions/security-v0.2/package.json");

fn fail(code: &str, message: &str, path: &str) -> EngineError {
    EngineError::new(code, Utf16::from(path), message)
}
fn get<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    let Value::Object(entries) = value else {
        return None;
    };
    entries
        .iter()
        .find(|(key, _)| key == &Utf16::from(name))
        .map(|(_, value)| value)
}
fn get_mut<'a>(value: &'a mut Value, name: &str) -> Option<&'a mut Value> {
    let Value::Object(entries) = value else {
        return None;
    };
    entries
        .iter_mut()
        .find(|(key, _)| key == &Utf16::from(name))
        .map(|(_, value)| value)
}
fn text(value: Option<&Value>) -> Option<String> {
    match value {
        Some(Value::String(value)) => value.to_utf8().ok(),
        _ => None,
    }
}
fn arr(value: Option<&Value>) -> &[Value] {
    match value {
        Some(Value::Array(values)) => values,
        _ => &[],
    }
}
fn object(fields: impl IntoIterator<Item = (&'static str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(key, value)| (Utf16::from(key), value))
            .collect(),
    )
}
fn string(value: &str) -> Value {
    Value::string_utf8(value)
}
fn bool_value(value: bool) -> Value {
    Value::Bool(value)
}

fn read_embedded_schema(source: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    serialization::read_json_value(
        &source.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        ctx,
    )
}
fn v2_root(ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let package = read_embedded_schema(V2_SCHEMA, ctx)?;
    get(&package, "schema")
        .cloned()
        .ok_or_else(|| fail("SECURITY_V2_SCHEMA", "Embedded V2 schema missing", ""))
}
fn compile(schema: &Value, ctx: &mut Context<'_>) -> Result<CompiledSchema, EngineError> {
    CompiledSchema::compile(schema, &SchemaResources::default(), ctx)
}
fn shape_errors(
    schema: &Value,
    source: &Value,
    ctx: &mut Context<'_>,
) -> Result<Vec<Value>, EngineError> {
    let compiled = compile(schema, ctx)?;
    let errors = compiled.validate(source, ctx)?;
    Ok(errors
        .into_iter()
        .map(|error| {
            object([
                ("code", string("SECURITY_V2_STRUCTURE")),
                ("path", Value::String(error.instance_path)),
                ("message", Value::String(error.message)),
                ("severity", string("error")),
            ])
        })
        .collect())
}
fn pointer_child(path: &Utf16, segment: &Utf16) -> Utf16 {
    let mut units = path.units().to_vec();
    units.push(b'/' as u16);
    for unit in segment.units() {
        match *unit {
            0x7e => units.extend_from_slice(&[0x7e, b'0' as u16]),
            0x2f => units.extend_from_slice(&[0x7e, b'1' as u16]),
            value => units.push(value),
        }
    }
    Utf16::new(units)
}
fn pointer_index(path: &Utf16, index: usize) -> Utf16 {
    pointer_child(path, &Utf16::from(index.to_string()))
}
fn fail_at(code: &str, message: &str, path: &Utf16) -> EngineError {
    EngineError::new(code, path.clone(), message)
}

fn variant_possible<'a>(value: &Value, mut shape: &'a Value, root: &'a Value) -> bool {
    for _ in 0..8 {
        let Some(reference) = text(get(shape, "$ref")) else {
            break;
        };
        let Some(name) = reference.strip_prefix("#/$defs/") else {
            break;
        };
        let Some(definition) = get(root, "$defs").and_then(|definitions| get(definitions, name))
        else {
            break;
        };
        shape = definition;
    }
    if let Some(constant) = get(shape, "const") {
        return value == constant;
    }
    if let Value::Object(members) = value {
        let has = |name: &Utf16| members.iter().any(|(key, _)| key == name);
        if arr(get(shape, "required"))
            .iter()
            .any(|required| matches!(required, Value::String(name) if !has(name)))
        {
            return false;
        }
        if let Some(Value::Object(properties)) = get(shape, "properties") {
            for (name, property) in properties {
                if let Some(constant) = get(property, "const") {
                    if members
                        .iter()
                        .any(|(key, actual)| key == name && actual != constant)
                    {
                        return false;
                    }
                }
            }
        }
    }
    true
}

/// Collect paths whose members are not declared by the selected wire schema.
/// A schema validation pass precedes this walk, so oneOf selection is unique.
fn unknown_paths(
    value: &Value,
    shape: &Value,
    root: &Value,
    path: &Utf16,
    out: &mut Vec<Utf16>,
    depth: usize,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    if depth > 64 {
        return Err(fail_at(
            "SECURITY_V2_BOUND",
            "Schema walk depth exceeded",
            path,
        ));
    }
    if let Some(reference) = text(get(shape, "$ref")) {
        if let Some(name) = reference.strip_prefix("#/$defs/") {
            if let Some(definitions) = get(root, "$defs") {
                if let Some(definition) = get(definitions, name) {
                    return unknown_paths(value, definition, root, path, out, depth + 1, ctx);
                }
            }
        }
    }
    let variants = match get(shape, "oneOf") {
        Some(Value::Array(variants)) => Some(variants),
        _ => None,
    };
    if let Some(variants) = variants {
        let possible: Vec<_> = variants
            .iter()
            .filter(|variant| variant_possible(value, variant, root))
            .collect();
        // The containing instance already passed schema validation. Required
        // members and discriminator constants can only eliminate variants.
        if let [variant] = possible.as_slice() {
            return unknown_paths(value, variant, root, path, out, depth + 1, ctx);
        }
        let defs = get(root, "$defs").cloned().unwrap_or(Value::Null);
        let dialect = get(root, "$schema").cloned().unwrap_or(Value::Null);
        let mut selected = None;
        for variant in possible {
            let candidate = object([
                ("$schema", dialect.clone()),
                ("$defs", defs.clone()),
                ("allOf", Value::Array(vec![variant.clone()])),
            ]);
            if compile(&candidate, ctx)?.validate(value, ctx)?.is_empty() {
                if selected.is_some() {
                    return Err(fail_at(
                        "SECURITY_V2_STRUCTURE",
                        "Ambiguous known wire variant",
                        path,
                    ));
                }
                selected = Some(variant);
            }
        }
        if let Some(selected) = selected {
            return unknown_paths(value, selected, root, path, out, depth + 1, ctx);
        }
    }
    match value {
        Value::Array(items) => {
            if let Some(item_shape) = get(shape, "items") {
                for (index, item) in items.iter().enumerate() {
                    unknown_paths(
                        item,
                        item_shape,
                        root,
                        &pointer_index(path, index),
                        out,
                        depth + 1,
                        ctx,
                    )?;
                }
            }
        }
        Value::Object(members) => {
            if let Some(Value::Object(properties)) = get(shape, "properties") {
                for (key, child) in members {
                    let child_path = pointer_child(path, key);
                    if let Some((_, child_shape)) = properties.iter().find(|(name, _)| name == key)
                    {
                        unknown_paths(child, child_shape, root, &child_path, out, depth + 1, ctx)?;
                    } else {
                        out.push(child_path);
                    }
                }
            }
        }
        _ => {}
    }
    Ok(())
}

fn diagnostic(code: &str, path: &str, message: &str, severity: &str) -> Value {
    object([
        ("code", string(code)),
        ("path", string(path)),
        ("message", string(message)),
        ("severity", string(severity)),
    ])
}
fn frozen_report(source: Value, valid: bool, diagnostics: Vec<Value>) -> Value {
    object([
        ("source", source),
        ("valid", bool_value(valid)),
        ("complete", bool_value(false)),
        ("authority", bool_value(false)),
        ("diagnostics", Value::Array(diagnostics)),
    ])
}
fn bounded(source: &Value, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    let mut stack = vec![source];
    let mut units = 0usize;
    while let Some(value) = stack.pop() {
        ctx.charge_work(1, Utf16::default())?;
        match value {
            Value::String(value) => units = units.saturating_add(value.len()),
            Value::Array(items) => stack.extend(items),
            Value::Object(entries) => {
                for (key, value) in entries {
                    units = units.saturating_add(key.len());
                    stack.push(value);
                }
            }
            _ => {}
        }
        if units > 4_000_000 {
            return Ok(false);
        }
    }
    Ok(true)
}

pub fn inspect_security_policy_v2(
    source: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let source = crate::copy_json(source, ctx)?;
    if !bounded(&source, ctx)? {
        return Ok(frozen_report(
            source,
            false,
            vec![diagnostic(
                "SECURITY_V2_BOUND",
                "",
                "resource-exhausted: source key/string text exceeds4000000 UTF-16 units",
                "error",
            )],
        ));
    }
    let schema = v2_root(ctx)?;
    let mut diagnostics = shape_errors(&schema, &source, ctx)?;
    if diagnostics.is_empty() {
        let mut unknown = Vec::new();
        unknown_paths(
            &source,
            &schema,
            &schema,
            &Utf16::default(),
            &mut unknown,
            0,
            ctx,
        )?;
        diagnostics.extend(unknown.into_iter().map(|path| {
            object([
                ("code", string("SECURITY_V2_UNKNOWN")),
                ("path", Value::String(path)),
                ("message", string("Uninterpreted policy source retained")),
                ("severity", string("warning")),
            ])
        }));
    }
    diagnostics.push(diagnostic(
        "SECURITY_V2_UNIMPLEMENTED",
        "",
        "Representation only; no0.2 domain/function/query interpretation or native activation",
        "warning",
    ));
    let valid = !diagnostics
        .iter()
        .any(|item| text(get(item, "severity")).as_deref() == Some("error"));
    Ok(frozen_report(source, valid, diagnostics))
}

fn migration(
    source: &Value,
    revision: &Value,
    upgrade: bool,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let source = crate::copy_json(source, ctx)?;
    let refuse = |diagnostics: Vec<Value>| {
        object([
            ("status", string("refused")),
            ("source", source.clone()),
            ("complete", bool_value(false)),
            ("authority", bool_value(false)),
            ("diagnostics", Value::Array(diagnostics)),
        ])
    };
    if !bounded(&source, ctx)? {
        return Ok(refuse(vec![diagnostic(
            "SECURITY_V2_BOUND",
            "",
            "resource-exhausted: source key/string text exceeds4000000 UTF-16 units",
            "error",
        )]));
    }
    let old_schema = read_embedded_schema(LEGACY_SCHEMA, ctx)?;
    let target_schema = v2_root(ctx)?;
    let (from, to) = if upgrade {
        (&old_schema, &target_schema)
    } else {
        (&target_schema, &old_schema)
    };
    let errors = shape_errors(from, &source, ctx)?;
    if !errors.is_empty() {
        return Ok(refuse(errors));
    }
    let current = text(get(&source, "revision"));
    let next = text(Some(revision));
    if next.as_deref().unwrap_or("").is_empty() || next == current {
        return Ok(refuse(vec![diagnostic(
            "SECURITY_MIGRATION_REVISION",
            "/revision",
            "Explicit new nonempty policy revision required",
            "error",
        )]));
    }
    let mut diagnostics = Vec::new();
    if !upgrade {
        if get(&source, "protection").is_some() {
            diagnostics.push(diagnostic(
                "SECURITY_MIGRATION_PROTECTION",
                "/protection",
                "Protection pin requires explicit authoring, not automatic removal",
                "error",
            ));
        }
        for (i, rule) in arr(get(&source, "rules")).iter().enumerate() {
            for (j, entry) in arr(get(rule, "disclosure")).iter().enumerate() {
                let null = Value::Null;
                let disposition = get(entry, "disposition").unwrap_or(&null);
                if text(get(disposition, "kind")).as_deref() == Some("transformed")
                    && get(disposition, "vocabulary").is_some()
                {
                    diagnostics.push(diagnostic(
                        "SECURITY_MIGRATION_PROTECTION",
                        &format!("/rules/{i}/disclosure/{j}/disposition"),
                        "Catalog reference cannot become an inline legacy constant",
                        "error",
                    ));
                }
            }
        }
    }
    if !diagnostics.is_empty() {
        return Ok(refuse(diagnostics));
    }
    let mut target = source.clone();
    if let Some(version) = get_mut(&mut target, "version") {
        *version = string(if upgrade { "0.2.0" } else { "0.1.0" });
    }
    // The caller revision is copied only after it has passed the explicit pin check.
    if let Some(revision_slot) = get_mut(&mut target, "revision") {
        *revision_slot = crate::copy_json(revision, ctx)?;
    }
    if !bounded(&target, ctx)? {
        return Ok(refuse(vec![diagnostic(
            "SECURITY_V2_BOUND",
            "",
            "resource-exhausted: target key/string text exceeds4000000 UTF-16 units",
            "error",
        )]));
    }
    let target_errors = shape_errors(to, &target, ctx)?;
    if !target_errors.is_empty() {
        return Ok(refuse(target_errors));
    }
    let mut before = Vec::new();
    let mut after = Vec::new();
    unknown_paths(&source, from, from, &Utf16::default(), &mut before, 0, ctx)?;
    unknown_paths(&target, to, to, &Utf16::default(), &mut after, 0, ctx)?;
    before.sort();
    after.sort();
    before.dedup();
    after.dedup();
    let changed: Vec<_> = before
        .iter()
        .filter(|path| !after.contains(*path))
        .chain(after.iter().filter(|path| !before.contains(*path)))
        .cloned()
        .collect();
    if !changed.is_empty() {
        return Ok(refuse(
            changed
                .into_iter()
                .map(|path| {
                    object([
                        ("code", string("SECURITY_MIGRATION_MEANING")),
                        ("path", Value::String(path)),
                        ("message", string("Known/unknown member classification changes; explicit authoring required")),
                        ("severity", string("error")),
                    ])
                })
                .collect(),
        ));
    }
    diagnostics.extend(before.into_iter().map(|path| {
        object([
            ("code", string("SECURITY_MIGRATION_UNKNOWN")),
            ("path", Value::String(path)),
            (
                "message",
                string("Unknown source content retained unchanged"),
            ),
            ("severity", string("warning")),
        ])
    }));
    Ok(object([
        ("status", string("migrated")),
        ("source", source.clone()),
        ("target", target),
        ("complete", bool_value(false)),
        ("authority", bool_value(false)),
        ("diagnostics", Value::Array(diagnostics)),
    ]))
}

pub fn upgrade_security_policy_source(
    source: &Value,
    revision: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    migration(source, revision, true, ctx)
}
pub fn downgrade_security_policy_source(
    source: &Value,
    revision: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    migration(source, revision, false, ctx)
}

pub fn read_security_source(
    source: &[u16],
    format: Format,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    serialization::read_json_value(source, format, ctx)
}
pub fn write_security_source(
    source: &Value,
    format: Format,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    serialization::write_typescript_json_value(source, Some(format), ctx)
}

#[cfg(test)]
mod tests {
    use super::inspect_security_policy_v2;
    use crate::{Context, Utf16, Value};

    #[test]
    fn unknown_member_pointer_paths_preserve_unpaired_utf16_keys() {
        let key = Utf16::new(vec![0xd800]);
        let source = Value::Object(vec![
            ("vocabulary".into(), Value::string_utf8("umf.security")),
            ("version".into(), Value::string_utf8("0.2.0")),
            ("id".into(), Value::string_utf8("p")),
            ("revision".into(), Value::string_utf8("r1")),
            (
                "ontology".into(),
                Value::Object(vec![
                    ("documentId".into(), Value::string_utf8("d")),
                    ("revision".into(), Value::string_utf8("o1")),
                ]),
            ),
            ("rules".into(), Value::Array(Vec::new())),
            (key.clone(), Value::Bool(true)),
        ]);
        let result = inspect_security_policy_v2(&source, &mut Context::ordinary()).unwrap();
        let Value::Object(report) = result else {
            panic!("report object")
        };
        let diagnostics = report
            .iter()
            .find(|(name, _)| name == &Utf16::from("diagnostics"))
            .unwrap()
            .1
            .clone();
        let Value::Array(diagnostics) = diagnostics else {
            panic!("diagnostics")
        };
        let unknown = diagnostics.iter().find(|diagnostic| {
            matches!(diagnostic, Value::Object(fields) if fields.iter().any(|(name, value)| name == &Utf16::from("code") && value == &Value::string_utf8("SECURITY_V2_UNKNOWN")))
        }).unwrap();
        let Value::Object(fields) = unknown else {
            panic!("diagnostic object")
        };
        let path = &fields
            .iter()
            .find(|(name, _)| name == &Utf16::from("path"))
            .unwrap()
            .1;
        assert_eq!(path, &Value::String(Utf16::new(vec![b'/' as u16, 0xd800])));
    }
}
