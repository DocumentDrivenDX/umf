// SPDX-License-Identifier: MIT OR Apache-2.0
//! Rust-owned portable validation for action bulk-result artifacts.
use std::collections::BTreeSet;

use umf_core::{
    schema::{CompiledSchema, SchemaResources},
    Context, EngineError, Utf16, Value,
};

use crate::{
    canonical::sha256_source_text,
    resources::CodegenEngine,
    value::{array_items, member, object_members, string_member},
};

const MAX_BYTES: usize = 100_663_296;
const MAX_DEPTH: usize = 64;
const MAX_NODES: usize = 1_000_000;

fn failure(code: &str, message: &str, path: &str) -> EngineError {
    EngineError::new(code, Utf16::from(path), message)
}
fn object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(key, value)| (Utf16::from(key), value))
            .collect(),
    )
}
fn get<'a>(value: &'a Value, key: &str) -> Option<&'a Value> {
    member(value, key)
}
fn text(value: &Value, key: &str) -> Option<String> {
    string_member(value, key).and_then(|v| v.to_utf8().ok())
}
fn array(value: &Value) -> &[Value] {
    array_items(value).unwrap_or(&[])
}
fn hex_digest(bytes: [u8; 32]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    bytes
        .iter()
        .flat_map(|b| {
            [
                HEX[(b >> 4) as usize] as char,
                HEX[(b & 15) as usize] as char,
            ]
        })
        .collect()
}
fn verify_artifact(
    artifact: &Value,
    max: usize,
    ctx: &mut Context<'_>,
) -> Result<String, EngineError> {
    let Value::Object(_fields) = artifact else {
        return Err(failure(
            "PAP_INVALID",
            "Malformed original artifact",
            "/artifact",
        ));
    };
    let media = text(artifact, "mediaType").ok_or_else(|| {
        failure(
            "PAP_INVALID",
            "Malformed original artifact",
            "/artifact/mediaType",
        )
    })?;
    let utf8 = string_member(artifact, "utf8").ok_or_else(|| {
        failure(
            "PAP_INVALID",
            "Malformed original artifact",
            "/artifact/utf8",
        )
    })?;
    let digest = text(artifact, "sha256").ok_or_else(|| {
        failure(
            "PAP_INVALID",
            "Malformed original artifact",
            "/artifact/sha256",
        )
    })?;
    if media.is_empty()
        || media.encode_utf16().count() > 256
        || digest.len() != 64
        || !digest
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    {
        return Err(failure(
            "PAP_INVALID",
            "Malformed original artifact",
            "/artifact",
        ));
    }
    let text = utf8.to_utf8().map_err(|_| {
        failure(
            "PAP_INVALID",
            "Unpaired Unicode surrogate",
            "/artifact/utf8",
        )
    })?;
    if text.len() > max {
        return Err(failure(
            "PAP_LIMIT",
            "Artifact byte bound exceeded",
            "/artifact/utf8",
        ));
    }
    let actual = hex_digest(sha256_source_text(utf8, ctx)?);
    if actual != digest {
        return Err(failure(
            "PAP_INTEGRITY",
            "Original artifact digest mismatch",
            "/artifact/sha256",
        ));
    }
    Ok(text)
}

fn validate_strings(
    value: &Value,
    path: &str,
    ctx: &mut Context<'_>,
    depth: usize,
    nodes: &mut usize,
) -> Result<(), EngineError> {
    ctx.charge_work(1, Utf16::from(path))?;
    *nodes = (*nodes).saturating_add(1);
    if *nodes > MAX_NODES {
        return Err(failure("PAP_LIMIT", "Result node bound exceeded", path));
    }
    if depth > MAX_DEPTH {
        return Err(failure("PAP_LIMIT", "Result nesting bound exceeded", path));
    }
    match value {
        Value::String(text) => {
            text.to_utf8()
                .map_err(|_| failure("PAP_INVALID", "Unpaired Unicode surrogate", path))?;
        }
        Value::Array(items) => {
            for (index, item) in items.iter().enumerate() {
                validate_strings(item, &format!("{path}/{index}"), ctx, depth + 1, nodes)?;
            }
        }
        Value::Object(fields) => {
            for (key, item) in fields {
                let name = key
                    .to_utf8()
                    .map_err(|_| failure("PAP_INVALID", "Unpaired Unicode surrogate", path))?;
                validate_strings(
                    item,
                    &format!("{path}/{}", name.replace('~', "~0").replace('/', "~1")),
                    ctx,
                    depth + 1,
                    nodes,
                )?;
            }
        }
        Value::Null | Value::Bool(_) | Value::Number(_) => {}
    }
    Ok(())
}

fn parse_schema(source: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let units = Utf16::from(source);
    umf_core::serialization::read_json_value(
        units.units(),
        umf_core::serialization::Format::Json,
        ctx,
    )
}
fn install_schema<'a>(
    resources: &'a mut SchemaResources,
    schema: Value,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let id = string_member(&schema, "$id")
        .cloned()
        .ok_or_else(|| failure("PAP_INVALID", "Embedded Action schema has no identity", ""))?;
    if let Some((_, old)) = resources.entries.iter().find(|(old_id, _)| old_id == &id) {
        if old != &schema {
            return Err(failure(
                "PAP_INVALID",
                "Conflicting embedded Action schema",
                "",
            ));
        }
        return Ok(());
    }
    resources
        .entries
        .push((id, umf_core::copy_json(&schema, ctx)?));
    Ok(())
}
fn schema_resources(
    engine: &CodegenEngine<'_>,
    ctx: &mut Context<'_>,
) -> Result<(SchemaResources, Value), EngineError> {
    let mut resources = engine.resources().schema_resources().clone();
    install_schema(
        &mut resources,
        umf_core::copy_json(engine.resources().actions_schema(), ctx)?,
        ctx,
    )?;
    for source in [
        include_str!("../../../../spec/extensions/actions/plan.schema.json"),
        include_str!("../../../../spec/extensions/actions/manifest.schema.json"),
        include_str!("../../../../spec/extensions/actions/tx-results.schema.json"),
        include_str!("../../../../spec/extensions/actions/bulk.schema.json"),
    ] {
        install_schema(&mut resources, parse_schema(source, ctx)?, ctx)?;
    }
    let bulk = resources
        .entries
        .iter()
        .find(|(id, _)| id == &Utf16::from("urn:umf:actions:bulk:1"))
        .map(|(_, value)| umf_core::copy_json(value, ctx))
        .transpose()?
        .ok_or_else(|| failure("PAP_INVALID", "Embedded bulk schema is unavailable", ""))?;
    Ok((resources, bulk))
}
fn pointer_part(part: &str) -> String {
    part.replace("~1", "/").replace("~0", "~")
}
fn resolve_ref<'a>(
    reference: &str,
    current_root: &'a Value,
    resources: &'a SchemaResources,
) -> Option<(&'a Value, &'a Value)> {
    let (resource_id, fragment) = reference.split_once('#').unwrap_or(("", ""));
    let root = if resource_id.is_empty() {
        current_root
    } else {
        let (_, root) = resources
            .entries
            .iter()
            .find(|(id, _)| id.to_utf8().ok().as_deref() == Some(resource_id))?;
        root
    };
    let mut target = root;
    for part in fragment.strip_prefix('/')?.split('/') {
        target = member(target, &pointer_part(part))?;
    }
    Some((target, root))
}
fn branch_matches(
    candidate: &Value,
    value: &Value,
    root: &Value,
    resources: &SchemaResources,
) -> bool {
    let candidate =
        if let Some(reference) = string_member(candidate, "$ref").and_then(|x| x.to_utf8().ok()) {
            match resolve_ref(&reference, root, resources) {
                Some((resolved, _)) => resolved,
                None => return false,
            }
        } else {
            candidate
        };
    if let Some(expected) = get(candidate, "const") {
        if expected != value {
            return false;
        }
    }
    if let Some(values) = get(candidate, "enum") {
        if !array(values).iter().any(|expected| expected == value) {
            return false;
        }
    }
    if let Some(Value::Array(required)) = get(candidate, "required") {
        for key in required {
            let Value::String(key) = key else {
                return false;
            };
            if member(value, &key.to_utf8().unwrap_or_default()).is_none() {
                return false;
            }
        }
    }
    if let Some(kind) = text(candidate, "type") {
        let actual = match value {
            Value::Object(_) => "object",
            Value::Array(_) => "array",
            Value::String(_) => "string",
            Value::Number(_) => "number",
            Value::Bool(_) => "boolean",
            Value::Null => "null",
        };
        if kind != actual {
            return false;
        }
    }
    if let (Some(Value::Object(properties)), Value::Object(values)) =
        (get(candidate, "properties"), value)
    {
        for (key, property) in properties {
            if let Some(expected) = get(property, "const") {
                if let Some(actual) = member(value, &key.to_utf8().unwrap_or_default()) {
                    if expected != actual {
                        return false;
                    }
                }
            }
            let _ = values;
        }
    }
    true
}
fn unknown_members(
    value: &Value,
    schema: &Value,
    root: &Value,
    resources: &SchemaResources,
    path: &str,
    out: &mut Vec<String>,
    ctx: &mut Context<'_>,
    depth: usize,
    nodes: &mut usize,
) -> Result<(), EngineError> {
    ctx.charge_work(1, Utf16::from(path))?;
    *nodes = (*nodes).saturating_add(1);
    if *nodes > MAX_NODES {
        return Err(failure(
            "PAP_LIMIT",
            "Manifest/result node bound exceeded",
            path,
        ));
    }
    if depth > MAX_DEPTH {
        return Err(failure(
            "PAP_LIMIT",
            "Manifest/result nesting bound exceeded",
            path,
        ));
    }
    if let Some(reference) = string_member(schema, "$ref").and_then(|x| x.to_utf8().ok()) {
        if reference == "urn:umf:core:0.10.0#/$defs/literal" {
            umf_core::copy_json(value, ctx)?;
            return Ok(());
        }
        if let Some((target, target_root)) = resolve_ref(&reference, root, resources) {
            return unknown_members(
                value,
                target,
                target_root,
                resources,
                path,
                out,
                ctx,
                depth + 1,
                nodes,
            );
        }
        return Ok(());
    }
    for union in ["oneOf", "anyOf"] {
        if let Some(candidates) = get(schema, union) {
            for candidate in array(candidates) {
                if branch_matches(candidate, value, root, resources) {
                    let (target, target_root) = if let Some(reference) =
                        string_member(candidate, "$ref").and_then(|x| x.to_utf8().ok())
                    {
                        match resolve_ref(&reference, root, resources) {
                            Some(pair) => pair,
                            None => continue,
                        }
                    } else {
                        (candidate, root)
                    };
                    return unknown_members(
                        value,
                        target,
                        target_root,
                        resources,
                        path,
                        out,
                        ctx,
                        depth + 1,
                        nodes,
                    );
                }
            }
            return Ok(());
        }
    }
    match value {
        Value::Array(items) => {
            if let Some(item_schema) = get(schema, "items") {
                for (index, item) in items.iter().enumerate() {
                    unknown_members(
                        item,
                        item_schema,
                        root,
                        resources,
                        &format!("{path}/{index}"),
                        out,
                        ctx,
                        depth + 1,
                        nodes,
                    )?;
                }
            }
        }
        Value::Object(fields) => {
            let props = get(schema, "properties").and_then(object_members);
            let additional = get(schema, "additionalProperties");
            if props.is_none() && additional.is_none() {
                return Ok(());
            }
            for (key, child) in fields {
                let name = key.to_utf8().unwrap_or_default();
                if name == "annotations" {
                    continue;
                }
                let child_schema = props.and_then(|items| {
                    items
                        .iter()
                        .find(|(prop, _)| prop == key)
                        .map(|(_, schema)| schema)
                });
                let at = format!("{path}/{}", name.replace('~', "~0").replace('/', "~1"));
                if let Some(child_schema) = child_schema {
                    unknown_members(
                        child,
                        child_schema,
                        root,
                        resources,
                        &at,
                        out,
                        ctx,
                        depth + 1,
                        nodes,
                    )?;
                } else if let Some(Value::Object(_)) = additional {
                    unknown_members(
                        child,
                        additional.unwrap(),
                        root,
                        resources,
                        &at,
                        out,
                        ctx,
                        depth + 1,
                        nodes,
                    )?;
                } else {
                    out.push(at);
                }
            }
        }
        _ => {}
    }
    Ok(())
}
fn diagnostic(error: &EngineError) -> Value {
    let code = if error.code.starts_with("PAP_") {
        error.code.as_str()
    } else if error.code == "LIMIT" {
        "PAP_LIMIT"
    } else {
        "PAP_INVALID"
    };
    object(vec![
        ("code", Value::string_utf8(code)),
        ("path", Value::String(error.path.clone())),
        (
            "message",
            Value::string_utf8("Original bulk result refused"),
        ),
    ])
}

/// Validate one portable bulk-result artifact with the complete pinned bulk schema and current result invariants.
pub fn validate_bulk_outcome(
    engine: &CodegenEngine<'_>,
    artifact_input: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let source = umf_core::copy_json(artifact_input, ctx)?;
    let utf8 = verify_artifact(&source, MAX_BYTES, ctx)?;
    let mut diagnostics = Vec::new();
    let validation = (|| -> Result<(), EngineError> {
        if text(&source, "mediaType").as_deref() != Some("application/json") {
            return Err(failure(
                "PAP_INVALID",
                "JSON result required",
                "/artifact/mediaType",
            ));
        }
        let bytes = utf8.len();
        if bytes > MAX_BYTES {
            return Err(failure(
                "PAP_LIMIT",
                "Artifact byte bound exceeded",
                "/artifact/utf8",
            ));
        }
        if bytes > 1_000_000_000 {
            return Err(failure(
                "PAP_LIMIT",
                "Result byte bound exceeded",
                "/artifact/utf8",
            ));
        }
        let source_text = Utf16::from(utf8.as_str());
        let parsed = umf_core::serialization::read_json_value(
            source_text.units(),
            umf_core::serialization::Format::Json,
            ctx,
        )
        .map_err(|e| {
            if e.is_control_failure() {
                e
            } else {
                failure(
                    if e.code == "LIMIT" {
                        "PAP_LIMIT"
                    } else {
                        "PAP_INVALID"
                    },
                    "Noninteroperable JSON",
                    "/artifact/utf8",
                )
            }
        })?;
        let mut nodes = 0;
        validate_strings(&parsed, "", ctx, 0, &mut nodes)?;
        let (schemas, bulk_schema) = schema_resources(engine, ctx)?;
        let validator = CompiledSchema::compile(&bulk_schema, &schemas, ctx)?;
        if !validator.validate(&parsed, ctx)?.is_empty() {
            return Err(failure("PAP_INVALID", "Malformed bulk result union", ""));
        }
        if let Value::Object(fields) = &source {
            if fields.iter().any(|(key, _)| {
                !["mediaType", "utf8", "sha256"]
                    .contains(&key.to_utf8().unwrap_or_default().as_str())
            }) {
                return Err(failure(
                    "PAP_UNKNOWN",
                    "Unknown artifact envelope meaning",
                    "/artifact",
                ));
            }
        }
        if let Some(status) = text(&parsed, "status") {
            if status == "committed" {
                let items = array(get(&parsed, "items").unwrap_or(&Value::Null));
                let first = items
                    .first()
                    .and_then(|item| get(item, "ordinal"))
                    .and_then(|v| {
                        if let Value::Number(n) = v {
                            Some(*n)
                        } else {
                            None
                        }
                    })
                    .unwrap_or(0.0);
                let mut seen_items = BTreeSet::new();
                for (index, item) in items.iter().enumerate() {
                    let path = format!("/items/{index}");
                    let ordinal = get(item, "ordinal")
                        .and_then(|v| {
                            if let Value::Number(n) = v {
                                Some(*n)
                            } else {
                                None
                            }
                        })
                        .unwrap_or(-1.0);
                    if ordinal != first + index as f64 || !seen_items.insert(ordinal.to_bits()) {
                        return Err(failure(
                            "PAP_INVALID",
                            "Ordered consecutive item vector required",
                            &path,
                        ));
                    }
                    let result = get(item, "result").ok_or_else(|| {
                        failure("PAP_INVALID", "Committed item result required", &path)
                    })?;
                    umf_core::copy_json(result, ctx)?;
                    if let Some(verification) = get(result, "verification") {
                        let conditions =
                            array(get(verification, "postconditions").unwrap_or(&Value::Null));
                        let mut condition_ids = BTreeSet::new();
                        for condition in conditions {
                            let id = text(condition, "condition").unwrap_or_default();
                            if !condition_ids.insert(id) {
                                return Err(failure(
                                    "PAP_INVALID",
                                    "Duplicate condition verification",
                                    &format!("{path}/result/verification"),
                                ));
                            }
                        }
                        if text(verification, "kind").as_deref() == Some("recipe") {
                            let mut effect_ids = BTreeSet::new();
                            for effect in
                                array(get(verification, "effects").unwrap_or(&Value::Null))
                            {
                                let id = text(effect, "effect").unwrap_or_default();
                                if !effect_ids.insert(id) {
                                    return Err(failure(
                                        "PAP_INVALID",
                                        "Duplicate effect verification",
                                        &format!("{path}/result/verification"),
                                    ));
                                }
                            }
                        }
                    }
                }
            }
            if status == "sealed" || status == "review" {
                let manifest = get(&parsed, "manifest").ok_or_else(|| {
                    failure("PAP_INVALID", "JSON manifest result required", "/manifest")
                })?;
                let inner = verify_artifact(manifest, 16_777_216, ctx)?;
                if text(manifest, "mediaType").as_deref() != Some("application/json") {
                    return Err(failure(
                        "PAP_INVALID",
                        "JSON manifest result required",
                        "/manifest/mediaType",
                    ));
                }
                let _ = inner;
                if let Value::Object(fields) = manifest {
                    if fields.iter().any(|(key, _)| {
                        !["mediaType", "utf8", "sha256"]
                            .contains(&key.to_utf8().unwrap_or_default().as_str())
                    }) {
                        return Err(failure(
                            "PAP_UNKNOWN",
                            "Unknown manifest artifact meaning",
                            "/manifest",
                        ));
                    }
                }
            }
        }
        let mut unknown = Vec::new();
        let root = &bulk_schema;
        let mut nodes = 0;
        unknown_members(
            &parsed,
            root,
            root,
            &schemas,
            "",
            &mut unknown,
            ctx,
            0,
            &mut nodes,
        )?;
        if !unknown.is_empty() {
            return Err(failure(
                "PAP_UNKNOWN",
                "Unknown result meaning",
                &unknown[0],
            ));
        }
        Ok(())
    })();
    if let Err(error) = validation {
        if error.is_control_failure() {
            return Err(error);
        }
        diagnostics.push(diagnostic(&error));
    }
    Ok(object(vec![
        ("valid", Value::Bool(diagnostics.is_empty())),
        ("source", source),
        ("diagnostics", Value::Array(diagnostics)),
    ]))
}
