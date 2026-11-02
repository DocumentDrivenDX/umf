// SPDX-License-Identifier: MIT OR Apache-2.0
//! Bounded Avro 1.12 record-field metadata derivation.
//!
//! This is a metadata projection only. Native trees remain authoritative and
//! the returned field nodes are independent copies of the exact source trees.

use crate::{
    context::Context,
    error::EngineError,
    native_json::{NativeJsonNode, NativeJsonTree},
    value::Utf16,
};
use num_bigint::BigInt;
use num_traits::One;
use std::collections::HashMap;

const MAX_FIXED_SIZE: usize = 4096;
const MAX_SAFE_INTEGER: f64 = 9_007_199_254_740_991.0;

#[derive(Clone, Debug)]
pub struct AvroDependency<'a> {
    pub id: &'a Utf16,
    pub root: &'a NativeJsonTree,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AvroScalarType {
    Boolean,
    Integer,
    Float,
    Binary,
    String,
    Date,
    Time,
    Timestamp,
    Decimal,
}

impl AvroScalarType {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Boolean => "boolean",
            Self::Integer => "integer",
            Self::Float => "float",
            Self::Binary => "binary",
            Self::String => "string",
            Self::Date => "date",
            Self::Time => "time",
            Self::Timestamp => "timestamp",
            Self::Decimal => "decimal",
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct AvroFieldMetadata {
    pub dependency_id: Option<Utf16>,
    pub path: Utf16,
    pub record: Utf16,
    pub name: Utf16,
    pub description: Option<Utf16>,
    pub scalar_type: Option<AvroScalarType>,
    /// The complete native field object, deeply copied under the operation budget.
    pub native_field: NativeJsonTree,
    /// `JSON.stringify([dependencyId ?? null, path])`.
    pub element_id: Utf16,
}

#[derive(Clone)]
struct NameEntry<'a> {
    node: &'a NativeJsonNode,
    namespace: Vec<u16>,
}

struct Field<'a> {
    tree: &'a NativeJsonTree,
    node: &'a NativeJsonNode,
    path: Vec<u16>,
    record: Vec<u16>,
    namespace: Vec<u16>,
    dependency_id: Option<&'a Utf16>,
}

/// Derive field metadata from ordered dependencies followed by the root.
/// Dependency IDs identify source artifacts; Avro names resolve only through
/// declarations found in their native trees.
pub fn derive_avro_fields<'a>(
    root: &'a NativeJsonTree,
    dependencies: &[AvroDependency<'a>],
    ctx: &mut Context<'_>,
) -> Result<Vec<AvroFieldMetadata>, EngineError> {
    let mut names: HashMap<Vec<u16>, Option<NameEntry<'_>>> = HashMap::new();
    let mut fields = Vec::new();
    let mut visited = 0usize;
    for dependency in dependencies {
        walk(
            dependency.root.root(),
            dependency.root,
            &mut Vec::new(),
            &[],
            Some(dependency.id),
            &mut names,
            &mut fields,
            &mut visited,
            0,
            ctx,
        )?;
    }
    walk(
        root.root(),
        root,
        &mut Vec::new(),
        &[],
        None,
        &mut names,
        &mut fields,
        &mut visited,
        0,
        ctx,
    )?;

    ctx.charge_work(fields.len(), Utf16::default())?;
    let mut output = Vec::with_capacity(fields.len());
    for field in fields {
        charge_lengths(ctx, [field.path.len(), field.record.len()])?;
        let (name, description, type_node) = match field.node {
            NativeJsonNode::Object(members) => (
                string(member(members, "name")),
                string(member(members, "doc")),
                member(members, "type"),
            ),
            _ => continue,
        };
        let Some(name) = name.filter(|value| !value.is_empty()) else {
            continue;
        };
        let Some(type_node) = type_node else { continue };
        charge_lengths(
            ctx,
            [
                name.len(),
                description.map_or(0, Utf16::len),
                field.dependency_id.map_or(0, Utf16::len),
            ],
        )?;
        let scalar_type = family(type_node, &field.namespace, &names, &mut Vec::new(), 0, ctx)?;
        let native_field = field
            .tree
            .subtree_clone(&Utf16::new(field.path.clone()), ctx)?;
        let element_id = element_id(field.dependency_id, &field.path, ctx)?;
        output.push(AvroFieldMetadata {
            dependency_id: field.dependency_id.cloned(),
            path: Utf16::new(field.path),
            record: Utf16::new(field.record),
            name: name.clone(),
            description: description.cloned(),
            scalar_type,
            native_field,
            element_id,
        });
    }
    Ok(output)
}

#[allow(clippy::too_many_arguments)]
fn walk<'a>(
    node: &'a NativeJsonNode,
    tree: &'a NativeJsonTree,
    path: &mut Vec<u16>,
    namespace: &[u16],
    dependency_id: Option<&'a Utf16>,
    names: &mut HashMap<Vec<u16>, Option<NameEntry<'a>>>,
    fields: &mut Vec<Field<'a>>,
    visited: &mut usize,
    depth: usize,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    visit_charge(path, depth, visited, ctx)?;
    match node {
        NativeJsonNode::Array(items) => {
            for (index, child) in items.iter().enumerate() {
                push_index_path(path, index, ctx)?;
                let result = walk(
                    child,
                    tree,
                    path,
                    namespace,
                    dependency_id,
                    names,
                    fields,
                    visited,
                    depth + 1,
                    ctx,
                );
                pop_path(path);
                result?;
            }
        }
        NativeJsonNode::Object(members) => {
            let member_cost = members.iter().fold(0usize, |total, (key, _)| {
                total.saturating_add(key.len().saturating_add(1))
            });
            ctx.charge_work(member_cost, Utf16::default())?;
            let type_name = string(member(members, "type"));
            charge_work_u64(ctx, namespace.len() as u64)?;
            let mut current_ns = namespace.to_vec();
            let mut full_name = Vec::new();
            if type_name.is_some_and(|t| matches_ascii(t, &["record", "error", "enum", "fixed"])) {
                let Some(name) = string(member(members, "name")).filter(|value| !value.is_empty())
                else {
                    return Ok(());
                };
                let declared = string(member(members, "namespace"));
                let declared_namespace = declared.map_or(namespace, Utf16::units);
                charge_work_u64(
                    ctx,
                    (name.len() as u64)
                        .saturating_add(declared_namespace.len() as u64)
                        .saturating_add(1),
                )?;
                full_name = qualified_name(name.units(), declared_namespace);
                charge_work_u64(ctx, full_name.len() as u64)?;
                current_ns = namespace_part(&full_name);
                charge_work_u64(ctx, current_ns.len() as u64)?;
                charge_work_u64(ctx, (full_name.len() as u64).saturating_mul(2))?;
                match names.entry(full_name.clone()) {
                    std::collections::hash_map::Entry::Occupied(mut entry) => {
                        entry.insert(None);
                    }
                    std::collections::hash_map::Entry::Vacant(entry) => {
                        charge_work_u64(ctx, current_ns.len() as u64)?;
                        entry.insert(Some(NameEntry {
                            node,
                            namespace: current_ns.clone(),
                        }));
                    }
                }
            }

            if type_name.is_some_and(|t| matches_ascii(t, &["record", "error"])) {
                if let Some(NativeJsonNode::Array(items)) = member(members, "fields") {
                    for (index, field_node) in items.iter().enumerate() {
                        let NativeJsonNode::Object(field_members) = field_node else {
                            continue;
                        };
                        let field_cost = field_members.iter().fold(0u64, |total, (key, _)| {
                            total.saturating_add(key.len() as u64 + 1)
                        });
                        charge_work_u64(ctx, field_cost)?;
                        if string(member(field_members, "name")).map_or(true, Utf16::is_empty)
                            || member(field_members, "type").is_none()
                        {
                            continue;
                        }
                        let path_len = path.len();
                        push_ascii_path(path, "fields", ctx)?;
                        push_index_path(path, index, ctx)?;
                        if !full_name.is_empty() {
                            if fields.len() >= ctx.limits().max_values {
                                return Err(limit("Avro field count limit exceeded"));
                            }
                            let descriptor_cost = (path.len() as u64)
                                .saturating_add(full_name.len() as u64)
                                .saturating_add(current_ns.len() as u64)
                                .saturating_add(dependency_id.map_or(0, |id| id.len() as u64))
                                .saturating_add(1);
                            ctx.charge_work_u64(descriptor_cost, Utf16::default())?;
                            fields.push(Field {
                                tree,
                                node: field_node,
                                path: path.clone(),
                                record: full_name.clone(),
                                namespace: current_ns.clone(),
                                dependency_id,
                            });
                        }
                        if let Some(type_node) = member(field_members, "type") {
                            push_ascii_path(path, "type", ctx)?;
                            let result = walk(
                                type_node,
                                tree,
                                path,
                                &current_ns,
                                dependency_id,
                                names,
                                fields,
                                visited,
                                depth + 2,
                                ctx,
                            );
                            pop_path(path);
                            result?;
                        }
                        path.truncate(path_len);
                    }
                }
            }
            if type_name.is_some_and(|t| eq_ascii(t.units(), "array")) {
                if let Some(items) = member(members, "items") {
                    walk_member(
                        items,
                        tree,
                        "items",
                        path,
                        &current_ns,
                        dependency_id,
                        names,
                        fields,
                        visited,
                        depth,
                        ctx,
                    )?;
                }
            }
            if type_name.is_some_and(|t| eq_ascii(t.units(), "map")) {
                if let Some(values) = member(members, "values") {
                    walk_member(
                        values,
                        tree,
                        "values",
                        path,
                        &current_ns,
                        dependency_id,
                        names,
                        fields,
                        visited,
                        depth,
                        ctx,
                    )?;
                }
            }
            if let Some(type_node) = member(members, "type") {
                if !matches!(type_node, NativeJsonNode::String(_)) {
                    walk_member(
                        type_node,
                        tree,
                        "type",
                        path,
                        &current_ns,
                        dependency_id,
                        names,
                        fields,
                        visited,
                        depth,
                        ctx,
                    )?;
                }
            }
        }
        _ => {}
    }
    Ok(())
}

fn walk_member<'a>(
    node: &'a NativeJsonNode,
    tree: &'a NativeJsonTree,
    key: &str,
    path: &mut Vec<u16>,
    namespace: &[u16],
    dependency_id: Option<&'a Utf16>,
    names: &mut HashMap<Vec<u16>, Option<NameEntry<'a>>>,
    fields: &mut Vec<Field<'a>>,
    visited: &mut usize,
    depth: usize,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    push_ascii_path(path, key, ctx)?;
    let result = walk(
        node,
        tree,
        path,
        namespace,
        dependency_id,
        names,
        fields,
        visited,
        depth + 1,
        ctx,
    );
    pop_path(path);
    result
}

fn family(
    node: &NativeJsonNode,
    namespace: &[u16],
    names: &HashMap<Vec<u16>, Option<NameEntry<'_>>>,
    seen: &mut Vec<Vec<u16>>,
    depth: usize,
    ctx: &mut Context<'_>,
) -> Result<Option<AvroScalarType>, EngineError> {
    if depth > ctx.limits().max_depth {
        return Err(limit("Avro name-resolution depth exceeded"));
    }
    ctx.charge_work(1, Utf16::default())?;
    if let NativeJsonNode::Array(branches) = node {
        let mut found: Option<AvroScalarType> = None;
        let mut count = 0usize;
        for branch in branches {
            if is_null(branch, ctx)? {
                continue;
            }
            count += 1;
            let mut branch_seen = clone_seen(seen, ctx)?;
            let current = family(branch, namespace, names, &mut branch_seen, depth + 1, ctx)?;
            let Some(current) = current else {
                return Ok(None);
            };
            if found.is_some_and(|previous| previous != current) {
                return Ok(None);
            }
            found = Some(current);
        }
        return Ok(if count > 0 { found } else { None });
    }
    let type_name = match node {
        NativeJsonNode::String(value) => Some(value),
        NativeJsonNode::Object(members) => string(member_charged(members, "type", ctx)?),
        _ => None,
    };
    let Some(type_name) = type_name else {
        return Ok(None);
    };
    ctx.charge_work(type_name.len(), Utf16::default())?;
    if let NativeJsonNode::Object(members) = node {
        if let Some(logical_node) = member_charged(members, "logicalType", ctx)? {
            let logical = string(Some(logical_node));
            if let Some(value) = &logical {
                ctx.charge_work(value.len(), Utf16::default())?;
            }
            let result = match logical.as_ref() {
                Some(logical)
                    if eq_ascii(logical.units(), "date") && eq_ascii(type_name.units(), "int") =>
                {
                    Some(AvroScalarType::Date)
                }
                Some(logical)
                    if eq_ascii(logical.units(), "time-millis")
                        && eq_ascii(type_name.units(), "int") =>
                {
                    Some(AvroScalarType::Time)
                }
                Some(logical)
                    if eq_ascii(logical.units(), "time-micros")
                        && eq_ascii(type_name.units(), "long") =>
                {
                    Some(AvroScalarType::Time)
                }
                Some(logical)
                    if is_timestamp_units(logical.units())
                        && eq_ascii(type_name.units(), "long") =>
                {
                    Some(AvroScalarType::Timestamp)
                }
                Some(logical)
                    if eq_ascii(logical.units(), "big-decimal")
                        && eq_ascii(type_name.units(), "bytes") =>
                {
                    Some(AvroScalarType::Decimal)
                }
                Some(logical)
                    if eq_ascii(logical.units(), "decimal")
                        && (eq_ascii(type_name.units(), "bytes")
                            || eq_ascii(type_name.units(), "fixed"))
                        && valid_decimal(members, type_name.units(), ctx)? =>
                {
                    Some(AvroScalarType::Decimal)
                }
                _ => None,
            };
            return Ok(result);
        }
    }
    if let Some(primitive) = primitive(type_name.units()) {
        return Ok(Some(primitive));
    }
    let full_len = qualified_name_len(type_name.units(), namespace);
    charge_work_u64(ctx, full_len as u64)?;
    let full = qualified_name(type_name.units(), namespace);
    let lookup_cost = (full.len() as u64).saturating_mul((seen.len() as u64).saturating_add(1));
    charge_work_u64(ctx, lookup_cost)?;
    if seen.iter().any(|item| item == &full) {
        return Ok(None);
    }
    let Some(Some(declaration)) = names.get(&full) else {
        return Ok(None);
    };
    charge_work_u64(ctx, (full.len() as u64).saturating_add(1))?;
    seen.push(full);
    family(
        declaration.node,
        &declaration.namespace,
        names,
        seen,
        depth + 1,
        ctx,
    )
}

fn valid_decimal(
    members: &[(Utf16, NativeJsonNode)],
    carrier: &[u16],
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    let Some(precision) = integer(member_charged(members, "precision", ctx)?, ctx)? else {
        return Ok(false);
    };
    let scale = match member_charged(members, "scale", ctx)? {
        None => Some(0),
        Some(value) => integer(Some(value), ctx)?,
    };
    let Some(scale) = scale else { return Ok(false) };
    if precision <= 0 || scale < 0 || scale > precision {
        return Ok(false);
    }
    if eq_ascii(carrier, "fixed") {
        let Some(size) = integer(member_charged(members, "size", ctx)?, ctx)? else {
            return Ok(false);
        };
        if size < 1 || size > MAX_FIXED_SIZE as i64 {
            return Ok(false);
        }
        let bounded_size =
            usize::try_from(size).map_err(|_| limit("Avro fixed size conversion overflow"))?;
        let bits = bounded_size.saturating_mul(8).saturating_sub(1);
        let decimal_digits_bound = (bits as u64).saturating_mul(30_103) / 100_000 + 1;
        charge_work_u64(ctx, (bits as u64).saturating_add(decimal_digits_bound))?;
        let maximum = (BigInt::one() << bits) - BigInt::one();
        let digits = maximum.to_string().len().saturating_sub(1);
        if precision > digits as i64 {
            return Ok(false);
        }
    }
    Ok(true)
}

fn integer(
    node: Option<&NativeJsonNode>,
    ctx: &mut Context<'_>,
) -> Result<Option<i64>, EngineError> {
    let Some(NativeJsonNode::Number(token)) = node else {
        return Ok(None);
    };
    let value = match crate::javascript_numeric::numeric_to_number_lossless(token, false, ctx) {
        Ok(value) => value,
        Err(error) if error.is_control_failure() => return Err(error),
        Err(_) => return Ok(None),
    };
    if !value.is_finite() || value.fract() != 0.0 || value.abs() > MAX_SAFE_INTEGER {
        return Ok(None);
    }
    Ok(Some(value as i64))
}

fn primitive(name: &[u16]) -> Option<AvroScalarType> {
    let candidates = [
        ("boolean", AvroScalarType::Boolean),
        ("int", AvroScalarType::Integer),
        ("long", AvroScalarType::Integer),
        ("float", AvroScalarType::Float),
        ("double", AvroScalarType::Float),
        ("bytes", AvroScalarType::Binary),
        ("fixed", AvroScalarType::Binary),
        ("string", AvroScalarType::String),
        ("enum", AvroScalarType::String),
    ];
    candidates
        .iter()
        .find_map(|(candidate, family)| eq_ascii(name, candidate).then_some(*family))
}

fn element_id(
    dependency_id: Option<&Utf16>,
    path: &[u16],
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    let dependency_units = dependency_id.map_or(0, Utf16::len);
    charge_work_u64(
        ctx,
        (dependency_units as u64).saturating_add(path.len() as u64),
    )?;
    let id_length = dependency_id.map_or(4, |id| json_string_length(id.units()));
    let path_length = json_string_length(path);
    let encoded_length = 3u64
        .checked_add(id_length)
        .and_then(|length| length.checked_add(path_length))
        .ok_or_else(|| limit("Avro field ID size overflow"))?;
    charge_work_u64(ctx, encoded_length)?;
    let capacity = checked_utf16_capacity(encoded_length, isize::MAX as u64)
        .ok_or_else(|| limit("Avro field ID size overflow"))?;
    let mut output = Vec::with_capacity(capacity);
    output.push(b'[' as u16);
    if let Some(id) = dependency_id {
        append_json_string(id.units(), &mut output);
    } else {
        output.extend("null".encode_utf16());
    }
    output.push(b',' as u16);
    append_json_string(path, &mut output);
    output.push(b']' as u16);
    Ok(Utf16::new(output))
}

fn checked_utf16_capacity(units: u64, max_bytes: u64) -> Option<usize> {
    let bytes = units.checked_mul(std::mem::size_of::<u16>() as u64)?;
    if bytes > max_bytes {
        return None;
    }
    usize::try_from(units).ok()
}

fn member<'a>(members: &'a [(Utf16, NativeJsonNode)], key: &str) -> Option<&'a NativeJsonNode> {
    members
        .iter()
        .find(|(candidate, _)| eq_ascii(candidate.units(), key))
        .map(|(_, value)| value)
}
fn member_charged<'a>(
    members: &'a [(Utf16, NativeJsonNode)],
    key: &str,
    ctx: &mut Context<'_>,
) -> Result<Option<&'a NativeJsonNode>, EngineError> {
    // `eq_ascii` checks candidate length first, then compares at most `key.len()`
    // units, so this conservative estimate bounds a full lookup without scanning
    // the members to calculate the charge itself.
    let scan_cost = (members.len() as u64).saturating_mul(key.len() as u64 + 1);
    charge_work_u64(ctx, scan_cost)?;
    Ok(member(members, key))
}
fn string(node: Option<&NativeJsonNode>) -> Option<&Utf16> {
    match node {
        Some(NativeJsonNode::String(value)) => Some(value),
        _ => None,
    }
}
fn is_null(node: &NativeJsonNode, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    match node {
        NativeJsonNode::String(value) => Ok(eq_ascii(value.units(), "null")),
        NativeJsonNode::Object(members) => Ok(string(member_charged(members, "type", ctx)?)
            .is_some_and(|value| eq_ascii(value.units(), "null"))),
        _ => Ok(false),
    }
}
fn matches_ascii(value: &Utf16, candidates: &[&str]) -> bool {
    candidates
        .iter()
        .any(|candidate| eq_ascii(value.units(), candidate))
}
fn eq_ascii(value: &[u16], expected: &str) -> bool {
    value.len() == expected.len()
        && value
            .iter()
            .zip(expected.bytes())
            .all(|(unit, byte)| *unit == byte as u16)
}
fn qualified_name(name: &[u16], namespace: &[u16]) -> Vec<u16> {
    if name.contains(&(b'.' as u16)) || namespace.is_empty() {
        return name.to_vec();
    }
    let mut full = namespace.to_vec();
    full.push(b'.' as u16);
    full.extend_from_slice(name);
    full
}
fn qualified_name_len(name: &[u16], namespace: &[u16]) -> usize {
    if name.contains(&(b'.' as u16)) || namespace.is_empty() {
        name.len()
    } else {
        namespace.len().saturating_add(1).saturating_add(name.len())
    }
}
fn namespace_part(full: &[u16]) -> Vec<u16> {
    full.iter()
        .rposition(|unit| *unit == b'.' as u16)
        .map(|index| full[..index].to_vec())
        .unwrap_or_default()
}
fn is_timestamp(value: &str) -> bool {
    [
        "timestamp-millis",
        "timestamp-micros",
        "timestamp-nanos",
        "local-timestamp-millis",
        "local-timestamp-micros",
        "local-timestamp-nanos",
    ]
    .contains(&value)
}
fn is_timestamp_units(value: &[u16]) -> bool {
    [
        "timestamp-millis",
        "timestamp-micros",
        "timestamp-nanos",
        "local-timestamp-millis",
        "local-timestamp-micros",
        "local-timestamp-nanos",
    ]
    .iter()
    .any(|candidate| eq_ascii(value, candidate))
}
fn push_ascii_path(
    path: &mut Vec<u16>,
    segment: &str,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    ctx.charge_work(segment.len().saturating_add(1), Utf16::default())?;
    path.push(b'/' as u16);
    path.extend(segment.bytes().map(u16::from));
    Ok(())
}
fn push_index_path(
    path: &mut Vec<u16>,
    index: usize,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let digits = if index == 0 {
        1
    } else {
        index.ilog10() as usize + 1
    };
    ctx.charge_work(digits.saturating_add(1), Utf16::default())?;
    path.push(b'/' as u16);
    path.extend(index.to_string().bytes().map(u16::from));
    Ok(())
}
fn pop_path(path: &mut Vec<u16>) {
    if let Some(index) = path.iter().rposition(|unit| *unit == u16::from(b'/')) {
        path.truncate(index);
    }
}
fn visit_charge(
    path: &[u16],
    depth: usize,
    visited: &mut usize,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    ctx.charge_work(path.len().saturating_add(1), Utf16::default())?;
    *visited = visited
        .checked_add(1)
        .ok_or_else(|| limit("Avro value count overflow"))?;
    if depth > ctx.limits().max_depth || *visited > ctx.limits().max_values {
        return Err(limit("Avro traversal limit exceeded"));
    }
    Ok(())
}
fn limit(message: &'static str) -> EngineError {
    EngineError::new("LIMIT", Utf16::default(), message)
}

fn charge_lengths(
    ctx: &mut Context<'_>,
    lengths: impl IntoIterator<Item = usize>,
) -> Result<(), EngineError> {
    let total = lengths
        .into_iter()
        .fold(0u64, |total, length| total.saturating_add(length as u64));
    charge_work_u64(ctx, total)
}

fn charge_work_u64(ctx: &mut Context<'_>, amount: u64) -> Result<(), EngineError> {
    ctx.charge_work_u64(amount, Utf16::default())
}

fn clone_seen(seen: &[Vec<u16>], ctx: &mut Context<'_>) -> Result<Vec<Vec<u16>>, EngineError> {
    let cost = seen.iter().fold(seen.len() as u64, |total, value| {
        total.saturating_add(value.len() as u64)
    });
    charge_work_u64(ctx, cost)?;
    Ok(seen.to_vec())
}

fn json_string_length(value: &[u16]) -> u64 {
    let mut length = 2u64;
    let mut index = 0;
    while index < value.len() {
        length = length.saturating_add(match value[index] {
            0x22 | 0x5c | 0x08 | 0x0c | 0x0a | 0x0d | 0x09 => 2,
            0..=0x1f => 6,
            0xd800..=0xdbff
                if value
                    .get(index + 1)
                    .is_some_and(|low| (0xdc00..=0xdfff).contains(low)) =>
            {
                index += 1;
                2
            }
            0xd800..=0xdfff => 6,
            _ => 1,
        });
        index += 1;
    }
    length
}

fn append_json_string(value: &[u16], output: &mut Vec<u16>) {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    output.push(b'"' as u16);
    let mut index = 0;
    while index < value.len() {
        let unit = value[index];
        match unit {
            0x22 => output.extend([b'\\' as u16, b'"' as u16]),
            0x5c => output.extend([b'\\' as u16, b'\\' as u16]),
            0x08 => output.extend([b'\\' as u16, b'b' as u16]),
            0x0c => output.extend([b'\\' as u16, b'f' as u16]),
            0x0a => output.extend([b'\\' as u16, b'n' as u16]),
            0x0d => output.extend([b'\\' as u16, b'r' as u16]),
            0x09 => output.extend([b'\\' as u16, b't' as u16]),
            0..=0x1f | 0xd800..=0xdfff
                if !(0xd800..=0xdbff).contains(&unit)
                    || !value
                        .get(index + 1)
                        .is_some_and(|low| (0xdc00..=0xdfff).contains(low)) =>
            {
                output.extend([b'\\' as u16, b'u' as u16]);
                for shift in [12, 8, 4, 0] {
                    output.push(HEX[((unit >> shift) & 0xf) as usize] as u16);
                }
            }
            0xd800..=0xdbff => {
                output.extend([unit, value[index + 1]]);
                index += 1;
            }
            _ => output.push(unit),
        }
        index += 1;
    }
    output.push(b'"' as u16);
}

#[cfg(test)]
mod tests {
    use super::checked_utf16_capacity;

    #[test]
    fn utf16_capacity_checks_bytes_at_the_wasm32_isize_boundary() {
        let wasm32_max_bytes = i32::MAX as u64;
        let max_units = wasm32_max_bytes / std::mem::size_of::<u16>() as u64;
        assert_eq!(
            checked_utf16_capacity(max_units, wasm32_max_bytes),
            Some(max_units as usize)
        );
        assert_eq!(
            checked_utf16_capacity(max_units + 1, wasm32_max_bytes),
            None
        );
        assert_eq!(checked_utf16_capacity(u64::MAX, wasm32_max_bytes), None);
    }
}
