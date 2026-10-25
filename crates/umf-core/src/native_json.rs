// SPDX-License-Identifier: MIT OR Apache-2.0
//! Exact, lossless JSON values for native adapters.
//!
//! This is intentionally separate from [`crate::Value`]: JSON number lexemes
//! and arbitrary UTF-16 strings are part of the native representation.

use crate::{
    context::Context,
    error::EngineError,
    serialization,
    value::{Utf16, Value},
};

#[derive(Clone, Debug, PartialEq)]
pub struct NativeJsonTree {
    root: NativeJsonNode,
    representation_extras: Vec<RepresentationExtra>,
}

#[derive(Clone, Debug, PartialEq)]
struct RepresentationExtra {
    parent: Vec<Utf16>,
    fields: Vec<(Utf16, Value)>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum NativeJsonNode {
    Null,
    Boolean(bool),
    String(Utf16),
    /// An ASCII JSON number token, retained without binary floating point.
    Number(String),
    Array(Vec<NativeJsonNode>),
    /// Ordered object members, with ECMAScript integer-index enumeration order.
    Object(Vec<(Utf16, NativeJsonNode)>),
}

impl NativeJsonTree {
    pub fn root(&self) -> &NativeJsonNode {
        &self.root
    }

    /// Whether copied tagged representation nodes include unknown fields.
    /// This is a read-only structural check and does not copy or traverse them.
    pub fn has_representation_extras(&self) -> bool {
        !self.representation_extras.is_empty()
    }

    /// Return JSON Pointers to unknown tagged-representation fields. `prefix`
    /// identifies the enclosing payload slot (for example `/root`); nested
    /// native containers are expanded through their tagged `members`/`items`
    /// fields so diagnostics identify the retained representation content.
    pub fn representation_extra_paths(
        &self,
        prefix: &Utf16,
        ctx: &mut Context<'_>,
    ) -> Result<Vec<Utf16>, EngineError> {
        let mut paths = Vec::new();
        for extra in &self.representation_extras {
            ctx.charge_work(1, prefix.clone())?;
            let mut path = prefix.clone();
            let mut node = &self.root;
            for segment in &extra.parent {
                match node {
                    NativeJsonNode::Object(members) => {
                        ctx.charge_work(members.len(), path.clone())?;
                        path = tagged_pointer_child(&path, &Utf16::from("members"), ctx)?;
                        path = tagged_pointer_child(&path, segment, ctx)?;
                        node = members
                            .iter()
                            .find(|(key, _)| key == segment)
                            .map(|(_, value)| value)
                            .ok_or_else(|| {
                                fail(
                                    "NATIVE_JSON_REPRESENTATION",
                                    "Unknown representation path is unavailable",
                                )
                            })?;
                    }
                    NativeJsonNode::Array(items) => {
                        path = tagged_pointer_child(&path, &Utf16::from("items"), ctx)?;
                        ctx.charge_work(segment.len(), path.clone())?;
                        path = tagged_pointer_child(&path, segment, ctx)?;
                        let index = segment
                            .to_utf8()
                            .ok()
                            .and_then(|value| value.parse::<usize>().ok())
                            .ok_or_else(|| {
                                fail(
                                    "NATIVE_JSON_REPRESENTATION",
                                    "Unknown representation array path is unavailable",
                                )
                            })?;
                        node = items.get(index).ok_or_else(|| {
                            fail(
                                "NATIVE_JSON_REPRESENTATION",
                                "Unknown representation array path is unavailable",
                            )
                        })?;
                    }
                    _ => {
                        return Err(fail(
                            "NATIVE_JSON_REPRESENTATION",
                            "Unknown representation path is unavailable",
                        ));
                    }
                }
            }
            for (key, _) in &extra.fields {
                ctx.charge_work(1, path.clone())?;
                paths.push(tagged_pointer_child(&path, key, ctx)?);
            }
        }
        Ok(paths)
    }

    /// Admit the tagged tree shape carried by a UMF `Value`. Unknown fields on
    /// representation nodes remain attached to their source node for copies;
    /// any native export/render refuses while such fields are present.
    pub fn from_tagged_value(value: &Value, ctx: &mut Context<'_>) -> Result<Self, EngineError> {
        let mut extras = Vec::new();
        let mut values = 0usize;
        let root = decode_tagged(value, &mut Vec::new(), &mut extras, 0, &mut values, ctx)?;
        Ok(Self {
            root,
            representation_extras: extras,
        })
    }

    /// Parse JSON into the lossless native tree. JSON grammar is checked before
    /// duplicate-key and structural validation so malformed trailing source
    /// retains syntax precedence over semantic traversal outcomes.
    pub fn parse_json(source: &[u16], ctx: &mut Context<'_>) -> Result<Self, EngineError> {
        serialization::read_native_json_tree(source, ctx)
    }

    /// Produce an isolated copy under the caller's ordinary tree/work budget.
    pub fn clone_tree(&self, ctx: &mut Context<'_>) -> Result<Self, EngineError> {
        let mut values = 0usize;
        let root = clone_node(&self.root, &mut Vec::new(), 0, &mut values, ctx)?;
        for extra in &self.representation_extras {
            ctx.charge_work(extra.parent.iter().map(Utf16::len).sum(), Utf16::default())?;
            for (key, value) in &extra.fields {
                ctx.charge_work(key.len(), Utf16::default())?;
                let extra_depth = extra.parent.len().saturating_mul(2).saturating_add(1);
                count_extra_values(value, extra_depth, &mut values, ctx)?;
                crate::copy_json(value, ctx)?;
            }
        }
        Ok(Self {
            root,
            representation_extras: self.representation_extras.clone(),
        })
    }

    /// Render compact JSON after checking the complete tree and measuring the
    /// output before allocating its buffer.
    pub fn render_compact(&self, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
        self.reject_unknown_representation_fields()?;
        let mut values = 0usize;
        let units = measure_node(&self.root, 0, &mut values, ctx)?;
        if units > ctx.limits().max_text_units {
            return Err(fail("LIMIT", "Serialized text limit exceeded"));
        }
        ctx.charge_text(units, Utf16::default())?;
        let mut output = Vec::with_capacity(units);
        write_node(&self.root, &mut output, ctx)?;
        Ok(Utf16::new(output))
    }

    /// Render the adapter's tagged representation as JSON. This exists for
    /// cross-language conformance fixtures; native values still render through
    /// [`Self::render_compact`].
    pub fn render_tagged(&self, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
        self.reject_unknown_representation_fields()?;
        let mut values = 0usize;
        let _ = measure_node(&self.root, 0, &mut values, ctx)?;
        let units = measure_tagged(&self.root, ctx)?;
        if units > ctx.limits().max_text_units {
            return Err(fail("LIMIT", "Serialized text limit exceeded"));
        }
        ctx.charge_text(units, Utf16::default())?;
        let mut output = Vec::with_capacity(units);
        write_tagged(&self.root, &mut output, ctx)?;
        Ok(Utf16::new(output))
    }

    /// Materialize tagged form for copied edits while retaining unknown
    /// representation fields. Native export still refuses these fields.
    pub fn tagged_value_preserving_extras(
        &self,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let mut value = tagged_value(&self.root, ctx)?;
        for extra in &self.representation_extras {
            let target = tagged_at_native_path_mut(&mut value, &extra.parent).ok_or_else(|| {
                fail(
                    "NATIVE_JSON_REPRESENTATION",
                    "Tagged extra path is unavailable",
                )
            })?;
            let Value::Object(fields) = target else {
                return Err(fail(
                    "NATIVE_JSON_REPRESENTATION",
                    "Tagged node is not an object",
                ));
            };
            for (key, item) in &extra.fields {
                ctx.charge_work(key.len().saturating_add(1), Utf16::default())?;
                fields.push((key.clone(), crate::copy_json(item, ctx)?));
            }
        }
        Ok(value)
    }

    fn reject_unknown_representation_fields(&self) -> Result<(), EngineError> {
        if self.representation_extras.is_empty() {
            return Ok(());
        }
        Err(fail(
            "NATIVE_JSON_REPRESENTATION",
            "Unknown tagged representation fields prevent native rendering",
        ))
    }

    /// Follow a strict RFC 6901 pointer and return a borrowed child. The empty
    /// pointer selects the root. No implicit array append or coercion occurs.
    pub fn child(
        &self,
        pointer: &Utf16,
        ctx: &mut Context<'_>,
    ) -> Result<&NativeJsonNode, EngineError> {
        let segments = native_pointer(pointer, ctx)?;
        let mut node = &self.root;
        for segment in segments {
            ctx.charge_work(segment.len(), Utf16::default())?;
            node = match node {
                NativeJsonNode::Object(members) => {
                    let comparison_cost = members.iter().fold(0u64, |cost, (key, _)| {
                        cost.saturating_add((key.len().saturating_add(segment.len()).max(1)) as u64)
                    });
                    ctx.charge_work_u64(comparison_cost, Utf16::default())?;
                    members
                        .iter()
                        .find(|(key, _)| key == &segment)
                        .map(|(_, value)| value)
                        .ok_or_else(pointer_missing)?
                }
                NativeJsonNode::Array(items) => {
                    let index = array_index(&segment).ok_or_else(pointer_missing)?;
                    items.get(index).ok_or_else(pointer_missing)?
                }
                _ => return Err(pointer_missing()),
            };
        }
        Ok(node)
    }

    /// Make an isolated copy of the node selected by a strict JSON Pointer.
    /// Unknown tagged-representation fields attached anywhere below that node
    /// stay attached to the corresponding relative path in the returned tree.
    pub fn subtree_clone(
        &self,
        pointer: &Utf16,
        ctx: &mut Context<'_>,
    ) -> Result<Self, EngineError> {
        let segments = native_pointer(pointer, ctx)?;
        let selected = self.child(pointer, ctx)?;
        let mut admitted_values = 0usize;
        let mut admitted_depth = 0usize;
        count_clone_values(selected, 0, &mut admitted_values, &mut admitted_depth, ctx)?;
        for extra in &self.representation_extras {
            let Some(relative) = extra.parent.strip_prefix(segments.as_slice()) else {
                ctx.charge_work(extra.parent.len(), Utf16::default())?;
                continue;
            };
            let path_cost = relative
                .iter()
                .map(Utf16::len)
                .fold(0usize, usize::saturating_add);
            ctx.charge_work(path_cost.saturating_add(relative.len()), Utf16::default())?;
            for (key, value) in &extra.fields {
                ctx.charge_work(key.len(), Utf16::default())?;
                count_extra_values(
                    value,
                    relative.len().saturating_mul(2).saturating_add(1),
                    &mut admitted_values,
                    ctx,
                )?;
            }
        }
        let mut values = 0usize;
        let root = clone_node(selected, &mut Vec::new(), 0, &mut values, ctx)?;
        let matching = self
            .representation_extras
            .iter()
            .filter(|extra| extra.parent.starts_with(segments.as_slice()));
        let mut retained = Vec::new();
        for extra in matching {
            let relative = &extra.parent[segments.len()..];
            let fields = extra
                .fields
                .iter()
                .map(|(key, value)| Ok((key.clone(), crate::copy_json(value, ctx)?)))
                .collect::<Result<Vec<_>, EngineError>>()?;
            retained.push(RepresentationExtra {
                parent: relative.to_vec(),
                fields,
            });
        }
        Ok(Self {
            root,
            representation_extras: retained,
        })
    }

    /// Return a copied tree with one existing node replaced. Extras attached
    /// to the replaced subtree disappear with that subtree; extras elsewhere
    /// remain at their original paths. The source tree is never mutated.
    pub fn replace_node(
        &self,
        pointer: &Utf16,
        replacement: &NativeJsonTree,
        ctx: &mut Context<'_>,
    ) -> Result<Self, EngineError> {
        let segments = native_pointer(pointer, ctx)?;
        // Resolve the target before allocating the candidate copy.
        self.child(pointer, ctx)?;
        let replacement = replacement.clone_tree(ctx)?;
        let mut candidate = self.clone_tree(ctx)?;
        fn replace(
            node: &mut NativeJsonNode,
            path: &[Utf16],
            replacement: &NativeJsonNode,
            ctx: &mut Context<'_>,
        ) -> Result<(), EngineError> {
            if path.is_empty() {
                *node = replacement.clone();
                return Ok(());
            }
            ctx.charge_work(path[0].len(), Utf16::default())?;
            let child = match node {
                NativeJsonNode::Object(members) => {
                    let cost = members.iter().fold(0u64, |total, (key, _)| {
                        total.saturating_add(key.len().max(1) as u64)
                    });
                    ctx.charge_work_u64(cost, Utf16::default())?;
                    members
                        .iter_mut()
                        .find(|(key, _)| key == &path[0])
                        .map(|(_, value)| value)
                }
                NativeJsonNode::Array(items) => {
                    array_index(&path[0]).and_then(|index| items.get_mut(index))
                }
                _ => None,
            }
            .ok_or_else(pointer_missing)?;
            replace(child, &path[1..], replacement, ctx)
        }
        replace(&mut candidate.root, &segments, &replacement.root, ctx)?;
        candidate
            .representation_extras
            .retain(|extra| !extra.parent.starts_with(segments.as_slice()));
        Ok(candidate)
    }
}

fn tagged_value(node: &NativeJsonNode, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    let kind = match node {
        NativeJsonNode::Null => "null",
        NativeJsonNode::Boolean(_) => "boolean",
        NativeJsonNode::String(_) => "string",
        NativeJsonNode::Number(_) => "number",
        NativeJsonNode::Array(_) => "array",
        NativeJsonNode::Object(_) => "object",
    };
    let mut fields = vec![(Utf16::from("kind"), Value::string_utf8(kind))];
    match node {
        NativeJsonNode::Null => {}
        NativeJsonNode::Boolean(v) => fields.push((Utf16::from("value"), Value::Bool(*v))),
        NativeJsonNode::String(v) => fields.push((Utf16::from("value"), Value::String(v.clone()))),
        NativeJsonNode::Number(v) => fields.push((Utf16::from("value"), Value::string_utf8(v))),
        NativeJsonNode::Array(items) => fields.push((
            Utf16::from("items"),
            Value::Array(
                items
                    .iter()
                    .map(|v| tagged_value(v, ctx))
                    .collect::<Result<_, _>>()?,
            ),
        )),
        NativeJsonNode::Object(members) => fields.push((
            Utf16::from("members"),
            Value::Object(
                members
                    .iter()
                    .map(|(k, v)| Ok((k.clone(), tagged_value(v, ctx)?)))
                    .collect::<Result<_, EngineError>>()?,
            ),
        )),
    }
    Ok(Value::Object(fields))
}

fn tagged_at_native_path_mut<'a>(root: &'a mut Value, path: &[Utf16]) -> Option<&'a mut Value> {
    let mut node = root;
    for segment in path {
        let fields = match node {
            Value::Object(v) => v,
            _ => return None,
        };
        let kind = fields
            .iter()
            .find(|(k, _)| k == &Utf16::from("kind"))?
            .1
            .clone();
        match kind {
            Value::String(kind) if kind == Utf16::from("object") => {
                let members = fields
                    .iter_mut()
                    .find(|(k, _)| k == &Utf16::from("members"))?;
                let Value::Object(members) = &mut members.1 else {
                    return None;
                };
                node = &mut members.iter_mut().find(|(k, _)| k == segment)?.1;
            }
            Value::String(kind) if kind == Utf16::from("array") => {
                let index = array_index(segment)?;
                let items = fields
                    .iter_mut()
                    .find(|(k, _)| k == &Utf16::from("items"))?;
                let Value::Array(items) = &mut items.1 else {
                    return None;
                };
                node = items.get_mut(index)?;
            }
            _ => return None,
        }
    }
    Some(node)
}

fn count_clone_values(
    node: &NativeJsonNode,
    depth: usize,
    values: &mut usize,
    max_depth: &mut usize,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    *values = values
        .checked_add(2)
        .ok_or_else(|| fail("LIMIT", "JSON structural limit exceeded"))?;
    *max_depth = (*max_depth).max(depth.saturating_add(1));
    ctx.charge_work(2, Utf16::default())?;
    if matches!(
        node,
        NativeJsonNode::Boolean(_) | NativeJsonNode::String(_) | NativeJsonNode::Number(_)
    ) {
        *values = values
            .checked_add(1)
            .ok_or_else(|| fail("LIMIT", "JSON structural limit exceeded"))?;
        *max_depth = (*max_depth).max(depth.saturating_add(1));
        ctx.charge_work(1, Utf16::default())?;
    }
    match node {
        NativeJsonNode::Array(items) => {
            *values = values
                .checked_add(1)
                .ok_or_else(|| fail("LIMIT", "JSON structural limit exceeded"))?;
            for item in items {
                count_clone_values(item, depth.saturating_add(2), values, max_depth, ctx)?;
            }
        }
        NativeJsonNode::Object(members) => {
            *values = values
                .checked_add(1)
                .ok_or_else(|| fail("LIMIT", "JSON structural limit exceeded"))?;
            for (_, item) in members {
                count_clone_values(item, depth.saturating_add(2), values, max_depth, ctx)?;
            }
        }
        NativeJsonNode::Null
        | NativeJsonNode::Boolean(_)
        | NativeJsonNode::String(_)
        | NativeJsonNode::Number(_) => {}
    }
    if *values > ctx.limits().max_values || *max_depth > ctx.limits().max_depth {
        return Err(fail("LIMIT", "JSON structural limit exceeded"));
    }
    Ok(())
}

fn measure_tagged(node: &NativeJsonNode, ctx: &mut Context<'_>) -> Result<usize, EngineError> {
    let literal = |text: &str| text.len();
    match node {
        NativeJsonNode::Null => Ok(literal(r#"{"kind":"null"}"#)),
        NativeJsonNode::Boolean(value) => add(
            literal(r#"{"kind":"boolean","value":"#),
            if *value { 5 } else { 6 },
        ),
        NativeJsonNode::String(value) => add(
            literal(r#"{"kind":"string","value":"#),
            add(measure_string(value, ctx)?, 1)?,
        ),
        NativeJsonNode::Number(value) => add(
            literal(r#"{"kind":"number","value":"#),
            add(measure_string(&Utf16::from(value.as_str()), ctx)?, 1)?,
        ),
        NativeJsonNode::Array(items) => {
            ctx.charge_work(items.len(), Utf16::default())?;
            let mut size = literal(r#"{"kind":"array","items":["#);
            for (index, item) in items.iter().enumerate() {
                if index > 0 {
                    size = add(size, 1)?;
                }
                size = add(size, measure_tagged(item, ctx)?)?;
            }
            add(size, 2)
        }
        NativeJsonNode::Object(members) => {
            ctx.charge_work_u64(order_work(members.len()), Utf16::default())?;
            let mut size = literal(r#"{"kind":"object","members":{"#);
            for (index, (key, child)) in members.iter().enumerate() {
                if index > 0 {
                    size = add(size, 1)?;
                }
                size = add(size, measure_string(key, ctx)?)?;
                size = add(size, 1)?;
                size = add(size, measure_tagged(child, ctx)?)?;
            }
            add(size, 2)
        }
    }
}

fn write_tagged(
    node: &NativeJsonNode,
    output: &mut Vec<u16>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    match node {
        NativeJsonNode::Null => output.extend(r#"{"kind":"null"}"#.encode_utf16()),
        NativeJsonNode::Boolean(value) => {
            output.extend(r#"{"kind":"boolean","value":"#.encode_utf16());
            let literal: &[u8] = if *value { b"true" } else { b"false" };
            output.extend(literal.iter().map(|byte| *byte as u16));
            output.push(b'}' as u16);
        }
        NativeJsonNode::String(value) => {
            output.extend(r#"{"kind":"string","value":"#.encode_utf16());
            write_string(value, output);
            output.push(b'}' as u16);
        }
        NativeJsonNode::Number(value) => {
            output.extend(r#"{"kind":"number","value":"#.encode_utf16());
            write_string(&Utf16::from(value.as_str()), output);
            output.push(b'}' as u16);
        }
        NativeJsonNode::Array(items) => {
            output.extend(r#"{"kind":"array","items":["#.encode_utf16());
            for (index, item) in items.iter().enumerate() {
                if index > 0 {
                    output.push(b',' as u16);
                }
                ctx.charge_work(1, Utf16::default())?;
                write_tagged(item, output, ctx)?;
            }
            output.extend("]}".encode_utf16());
        }
        NativeJsonNode::Object(members) => {
            output.extend(r#"{"kind":"object","members":{"#.encode_utf16());
            for (index, (key, value)) in members.iter().enumerate() {
                if index > 0 {
                    output.push(b',' as u16);
                }
                ctx.charge_work(1, Utf16::default())?;
                write_string(key, output);
                output.push(b':' as u16);
                write_tagged(value, output, ctx)?;
            }
            output.extend("}}".encode_utf16());
        }
    }
    Ok(())
}

pub(crate) fn finish_parsed_tree(
    mut root: NativeJsonNode,
    ctx: &mut Context<'_>,
) -> Result<NativeJsonTree, EngineError> {
    fn visit(
        node: &mut NativeJsonNode,
        depth: usize,
        values: &mut usize,
        ctx: &mut Context<'_>,
    ) -> Result<(), EngineError> {
        *values = values
            .checked_add(1)
            .ok_or_else(|| fail("LIMIT", "Native JSON value count overflow"))?;
        if *values > ctx.limits().max_values {
            return Err(fail("LIMIT", "Native JSON structural limit exceeded"));
        }
        if depth > ctx.limits().max_depth {
            return Err(fail("LIMIT", "Native JSON structural limit exceeded"));
        }
        ctx.charge_work(1, Utf16::default())?;
        match node {
            NativeJsonNode::String(text) => ctx.charge_work(text.len(), Utf16::default())?,
            NativeJsonNode::Number(number) => validate_number(number, ctx)?,
            NativeJsonNode::Array(items) => {
                ctx.charge_work(items.len(), Utf16::default())?;
                for item in items {
                    visit(item, depth + 1, values, ctx)?;
                }
            }
            NativeJsonNode::Object(members) => {
                ctx.charge_work_u64(order_work(members.len()), Utf16::default())?;
                let key_cost = members
                    .iter()
                    .try_fold(0usize, |sum, (key, _)| add(sum, key.len()))?;
                ctx.charge_work(key_cost, Utf16::default())?;
                order_members(members);
                for (_, child) in members {
                    visit(child, depth + 1, values, ctx)?;
                }
            }
            NativeJsonNode::Null | NativeJsonNode::Boolean(_) => {}
        }
        Ok(())
    }
    visit(&mut root, 0, &mut 0usize, ctx)?;
    Ok(NativeJsonTree {
        root,
        representation_extras: Vec::new(),
    })
}

fn decode_tagged(
    value: &Value,
    path: &mut Vec<Utf16>,
    extras: &mut Vec<RepresentationExtra>,
    depth: usize,
    values: &mut usize,
    ctx: &mut Context<'_>,
) -> Result<NativeJsonNode, EngineError> {
    let Value::Object(fields) = value else {
        return Err(invalid_tree("Tagged node must be an object"));
    };
    check_unique_fields(fields, ctx)?;
    let kind = match field(fields, "kind", ctx)? {
        Some(Value::String(kind)) => kind,
        _ => return Err(invalid_tree("Tagged node requires a string kind")),
    };
    // Admit the full source length before converting it to an allocated ASCII
    // string or rejecting an unknown/non-ASCII kind.
    ctx.charge_work(kind.len(), path_to_utf16(path))?;
    let kind_text =
        ascii_utf16(kind).ok_or_else(|| invalid_tree("Tagged node kind must be ASCII"))?;
    let known: &[&str] = match kind_text.as_str() {
        "null" => &["kind"],
        "boolean" | "string" | "number" => &["kind", "value"],
        "array" => &["kind", "items"],
        "object" => &["kind", "members"],
        _ => return Err(invalid_tree("Unknown tagged node kind")),
    };
    let representation_values = if kind_text == "null" { 2 } else { 3 };
    *values = values
        .checked_add(representation_values)
        .ok_or_else(|| fail("LIMIT", "Tagged native JSON value count overflow"))?;
    if *values > ctx.limits().max_values || depth.saturating_add(1) > ctx.limits().max_depth {
        return Err(fail("LIMIT", "JSON structural limit exceeded"));
    }
    ctx.charge_work(representation_values, path_to_utf16(path))?;
    let unknown = fields.iter().filter(|(key, _)| {
        !known
            .iter()
            .any(|name| key.units().iter().copied().eq(name.encode_utf16()))
    });
    let mut retained = Vec::new();
    for (key, item) in unknown {
        ctx.charge_work(key.len(), path_to_utf16(path))?;
        count_extra_values(item, depth + 1, values, ctx)?;
        retained.push((key.clone(), crate::copy_json(item, ctx)?));
    }
    if !retained.is_empty() {
        ctx.charge_work(path.iter().map(Utf16::len).sum::<usize>(), Utf16::default())?;
        extras.push(RepresentationExtra {
            parent: path.clone(),
            fields: retained,
        });
    }
    let node = match kind_text.as_str() {
        "null" => NativeJsonNode::Null,
        "boolean" => match field(fields, "value", ctx)? {
            Some(Value::Bool(value)) => NativeJsonNode::Boolean(*value),
            _ => return Err(invalid_tree("Boolean tagged node requires a boolean value")),
        },
        "string" => match field(fields, "value", ctx)? {
            Some(Value::String(value)) => {
                ctx.charge_work(value.len(), path_to_utf16(path))?;
                NativeJsonNode::String(value.clone())
            }
            _ => return Err(invalid_tree("String tagged node requires a string value")),
        },
        "number" => {
            let Some(Value::String(token)) = field(fields, "value", ctx)? else {
                return Err(invalid_tree("Number tagged node requires a string token"));
            };
            // The UTF-16 token allocation and lexical scan below are both
            // admitted before conversion, including malformed tokens.
            ctx.charge_work(token.len(), path_to_utf16(path))?;
            let token =
                ascii_utf16(token).ok_or_else(|| invalid_tree("Number token must be ASCII"))?;
            if !is_json_number(&token) {
                return Err(invalid_tree("Invalid exact JSON number token"));
            }
            NativeJsonNode::Number(token)
        }
        "array" => {
            let Some(Value::Array(items)) = field(fields, "items", ctx)? else {
                return Err(invalid_tree("Array tagged node requires items"));
            };
            ctx.charge_work(items.len(), path_to_utf16(path))?;
            let mut children = Vec::with_capacity(items.len());
            for (index, item) in items.iter().enumerate() {
                let segment = Utf16::from(index.to_string());
                ctx.charge_work(segment.len(), path_to_utf16(path))?;
                path.push(segment);
                let child = decode_tagged(item, path, extras, depth + 2, values, ctx);
                path.pop();
                children.push(child?);
            }
            NativeJsonNode::Array(children)
        }
        "object" => {
            let Some(Value::Object(members)) = field(fields, "members", ctx)? else {
                return Err(invalid_tree("Object tagged node requires members"));
            };
            check_unique_fields(members, ctx)?;
            ctx.charge_work_u64(order_work(members.len()), path_to_utf16(path))?;
            let mut children = Vec::with_capacity(members.len());
            for (key, item) in members {
                ctx.charge_work(key.len(), path_to_utf16(path))?;
                path.push(key.clone());
                let child = decode_tagged(item, path, extras, depth + 2, values, ctx);
                path.pop();
                children.push((key.clone(), child?));
            }
            order_members(&mut children);
            NativeJsonNode::Object(children)
        }
        _ => return Err(invalid_tree("Unknown tagged node kind")),
    };
    Ok(node)
}

fn field<'a>(
    fields: &'a [(Utf16, Value)],
    name: &str,
    ctx: &mut Context<'_>,
) -> Result<Option<&'a Value>, EngineError> {
    let name = Utf16::from(name);
    ctx.charge_work_u64(
        (fields.len() as u64).saturating_mul(name.len().max(1) as u64),
        Utf16::default(),
    )?;
    Ok(fields
        .iter()
        .find(|(key, _)| key == &name)
        .map(|(_, value)| value))
}

fn check_unique_fields(
    fields: &[(Utf16, Value)],
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let mut seen = std::collections::BTreeSet::new();
    for (key, _) in fields {
        ctx.charge_work_u64(
            (key.len() as u64)
                .saturating_mul((seen.len().max(1) as u64).ilog2().saturating_add(1) as u64),
            Utf16::default(),
        )?;
        if !seen.insert(key.units().to_vec()) {
            return Err(invalid_tree("Duplicate tagged representation field"));
        }
    }
    Ok(())
}

fn count_extra_values(
    value: &Value,
    depth: usize,
    values: &mut usize,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    *values = values
        .checked_add(1)
        .ok_or_else(|| fail("LIMIT", "Tagged native JSON value count overflow"))?;
    if *values > ctx.limits().max_values || depth > ctx.limits().max_depth {
        return Err(fail("LIMIT", "JSON structural limit exceeded"));
    }
    ctx.charge_work(1, Utf16::default())?;
    match value {
        Value::String(value) => ctx.charge_work(value.len(), Utf16::default())?,
        Value::Array(items) => {
            for item in items {
                count_extra_values(item, depth + 1, values, ctx)?;
            }
        }
        Value::Object(members) => {
            for (key, item) in members {
                ctx.charge_work(key.len(), Utf16::default())?;
                count_extra_values(item, depth + 1, values, ctx)?;
            }
        }
        Value::Null | Value::Bool(_) | Value::Number(_) => {}
    }
    Ok(())
}

fn path_to_utf16(path: &[Utf16]) -> Utf16 {
    let mut output = Vec::new();
    for segment in path {
        output.push(b'/' as u16);
        for unit in segment.units() {
            match unit {
                0x7e => output.extend([b'~' as u16, b'0' as u16]),
                0x2f => output.extend([b'~' as u16, b'1' as u16]),
                other => output.push(*other),
            }
        }
    }
    Utf16::new(output)
}

fn ascii_utf16(value: &Utf16) -> Option<String> {
    value
        .units()
        .iter()
        .map(|unit| {
            u8::try_from(*unit)
                .ok()
                .filter(u8::is_ascii)
                .map(char::from)
        })
        .collect()
}

fn invalid_tree(message: &'static str) -> EngineError {
    fail("NATIVE_JSON_TREE", message)
}

fn clone_node(
    node: &NativeJsonNode,
    path: &mut Vec<Utf16>,
    depth: usize,
    values: &mut usize,
    ctx: &mut Context<'_>,
) -> Result<NativeJsonNode, EngineError> {
    check_clone_value(path, depth, values, ctx)?;
    path.push(Utf16::from("kind"));
    check_clone_value(path, depth + 1, values, ctx)?;
    ctx.charge_work(
        match node {
            NativeJsonNode::Null => 4,
            NativeJsonNode::Boolean(_) => 7,
            NativeJsonNode::String(_) => 6,
            NativeJsonNode::Number(_) => 6,
            NativeJsonNode::Array(_) => 5,
            NativeJsonNode::Object(_) => 6,
        },
        Utf16::default(),
    )?;
    path.pop();
    Ok(match node {
        NativeJsonNode::Null => NativeJsonNode::Null,
        NativeJsonNode::Boolean(value) => {
            path.push(Utf16::from("value"));
            check_clone_value(path, depth + 1, values, ctx)?;
            path.pop();
            NativeJsonNode::Boolean(*value)
        }
        NativeJsonNode::String(value) => {
            path.push(Utf16::from("value"));
            check_clone_value(path, depth + 1, values, ctx)?;
            ctx.charge_work(value.len(), Utf16::default())?;
            path.pop();
            NativeJsonNode::String(value.clone())
        }
        NativeJsonNode::Number(value) => {
            path.push(Utf16::from("value"));
            check_clone_value(path, depth + 1, values, ctx)?;
            validate_number(value, ctx)?;
            ctx.charge_work(value.len(), Utf16::default())?;
            path.pop();
            NativeJsonNode::Number(value.clone())
        }
        NativeJsonNode::Array(items) => {
            path.push(Utf16::from("items"));
            check_clone_value(path, depth + 1, values, ctx)?;
            ctx.charge_work(items.len(), Utf16::default())?;
            let mut copy = Vec::with_capacity(items.len());
            for (index, item) in items.iter().enumerate() {
                let segment = Utf16::from(index.to_string());
                ctx.charge_work(segment.len(), Utf16::default())?;
                path.push(segment);
                let cloned = clone_node(item, path, depth + 2, values, ctx);
                path.pop();
                copy.push(cloned?);
            }
            path.pop();
            NativeJsonNode::Array(copy)
        }
        NativeJsonNode::Object(members) => {
            path.push(Utf16::from("members"));
            check_clone_value(path, depth + 1, values, ctx)?;
            ctx.charge_work_u64(order_work(members.len()), Utf16::default())?;
            let mut copy = Vec::with_capacity(members.len());
            for (key, value) in members {
                ctx.charge_work(key.len(), Utf16::default())?;
                path.push(key.clone());
                let cloned = clone_node(value, path, depth + 2, values, ctx);
                path.pop();
                copy.push((key.clone(), cloned?));
            }
            path.pop();
            NativeJsonNode::Object(copy)
        }
    })
}

fn check_clone_value(
    path: &[Utf16],
    depth: usize,
    values: &mut usize,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let path_units = path
        .iter()
        .map(Utf16::len)
        .sum::<usize>()
        .saturating_add(path.len());
    ctx.charge_work(path_units, Utf16::default())?;
    *values = values
        .checked_add(1)
        .ok_or_else(|| fail("LIMIT", "JSON structural limit exceeded"))?;
    if *values > ctx.limits().max_values || depth > ctx.limits().max_depth {
        return Err(EngineError::new(
            "LIMIT",
            path_to_utf16(path),
            "JSON structural limit exceeded",
        ));
    }
    ctx.charge_work(1, Utf16::default())
}

fn admit_node(
    node: &NativeJsonNode,
    depth: usize,
    values: &mut usize,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    *values = values
        .checked_add(1)
        .ok_or_else(|| fail("LIMIT", "Native JSON value count overflow"))?;
    if *values > ctx.limits().max_values {
        return Err(fail("LIMIT", "Native JSON structural limit exceeded"));
    }
    if depth > ctx.limits().max_depth {
        return Err(fail("LIMIT", "Native JSON structural limit exceeded"));
    }
    ctx.charge_work(1, Utf16::default())?;
    let _ = node;
    Ok(())
}

fn measure_node(
    node: &NativeJsonNode,
    depth: usize,
    values: &mut usize,
    ctx: &mut Context<'_>,
) -> Result<usize, EngineError> {
    admit_node(node, depth, values, ctx)?;
    match node {
        NativeJsonNode::Null => Ok(4),
        NativeJsonNode::Boolean(true) => Ok(4),
        NativeJsonNode::Boolean(false) => Ok(5),
        NativeJsonNode::Number(token) => {
            validate_number(token, ctx)?;
            ctx.charge_work(token.len(), Utf16::default())?;
            Ok(token.len())
        }
        NativeJsonNode::String(text) => measure_string(text, ctx),
        NativeJsonNode::Array(items) => {
            ctx.charge_work(items.len(), Utf16::default())?;
            let mut size = 2usize;
            for (index, item) in items.iter().enumerate() {
                if index != 0 {
                    size = add(size, 1)?;
                }
                size = add(size, measure_node(item, depth + 1, values, ctx)?)?;
            }
            Ok(size)
        }
        NativeJsonNode::Object(members) => {
            ctx.charge_work_u64(order_work(members.len()), Utf16::default())?;
            let mut size = 2usize;
            for (index, (key, value)) in members.iter().enumerate() {
                if index != 0 {
                    size = add(size, 1)?;
                }
                size = add(size, measure_string(key, ctx)?)?;
                size = add(size, 1)?;
                size = add(size, measure_node(value, depth + 1, values, ctx)?)?;
            }
            Ok(size)
        }
    }
}

fn measure_string(text: &Utf16, ctx: &mut Context<'_>) -> Result<usize, EngineError> {
    let units = text.units();
    ctx.charge_work(units.len(), Utf16::default())?;
    let mut size = 2usize;
    let mut index = 0;
    while index < units.len() {
        let unit = units[index];
        size = add(
            size,
            match unit {
                0x22 | 0x5c | 0x08 | 0x0c | 0x0a | 0x0d | 0x09 => 2,
                0..=0x1f => 6,
                0xd800..=0xdbff
                    if units
                        .get(index + 1)
                        .is_some_and(|low| (0xdc00..=0xdfff).contains(low)) =>
                {
                    index += 1;
                    2
                }
                0xd800..=0xdfff => 6,
                _ => 1,
            },
        )?;
        index += 1;
    }
    Ok(size)
}

fn write_node(
    node: &NativeJsonNode,
    output: &mut Vec<u16>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    match node {
        NativeJsonNode::Null => output.extend("null".encode_utf16()),
        NativeJsonNode::Boolean(true) => output.extend("true".encode_utf16()),
        NativeJsonNode::Boolean(false) => output.extend("false".encode_utf16()),
        NativeJsonNode::Number(token) => output.extend(token.bytes().map(u16::from)),
        NativeJsonNode::String(text) => write_string(text, output),
        NativeJsonNode::Array(items) => {
            output.push(b'[' as u16);
            for (index, item) in items.iter().enumerate() {
                if index > 0 {
                    output.push(b',' as u16);
                }
                ctx.charge_work(1, Utf16::default())?;
                write_node(item, output, ctx)?;
            }
            output.push(b']' as u16);
        }
        NativeJsonNode::Object(members) => {
            output.push(b'{' as u16);
            for (index, (key, value)) in members.iter().enumerate() {
                if index > 0 {
                    output.push(b',' as u16);
                }
                ctx.charge_work(1, Utf16::default())?;
                write_string(key, output);
                output.push(b':' as u16);
                write_node(value, output, ctx)?;
            }
            output.push(b'}' as u16);
        }
    }
    Ok(())
}

fn write_string(text: &Utf16, output: &mut Vec<u16>) {
    output.push(b'"' as u16);
    let units = text.units();
    let mut index = 0;
    while index < units.len() {
        let unit = units[index];
        match unit {
            0x22 => output.extend([b'\\' as u16, b'"' as u16]),
            0x5c => output.extend([b'\\' as u16, b'\\' as u16]),
            0x08 => output.extend([b'\\' as u16, b'b' as u16]),
            0x0c => output.extend([b'\\' as u16, b'f' as u16]),
            0x0a => output.extend([b'\\' as u16, b'n' as u16]),
            0x0d => output.extend([b'\\' as u16, b'r' as u16]),
            0x09 => output.extend([b'\\' as u16, b't' as u16]),
            0..=0x1f => push_hex_escape(unit, output),
            0xd800..=0xdbff
                if units
                    .get(index + 1)
                    .is_some_and(|low| (0xdc00..=0xdfff).contains(low)) =>
            {
                output.extend([unit, units[index + 1]]);
                index += 1;
            }
            0xd800..=0xdfff => push_hex_escape(unit, output),
            _ => output.push(unit),
        }
        index += 1;
    }
    output.push(b'"' as u16);
}

fn push_hex_escape(value: u16, output: &mut Vec<u16>) {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    output.extend([b'\\' as u16, b'u' as u16]);
    for shift in [12, 8, 4, 0] {
        output.push(HEX[((value >> shift) & 0xf) as usize] as u16);
    }
}

pub fn native_pointer(pointer: &Utf16, ctx: &mut Context<'_>) -> Result<Vec<Utf16>, EngineError> {
    ctx.charge_work(pointer.len(), Utf16::default())?;
    let units = pointer.units();
    if units.is_empty() {
        return Ok(Vec::new());
    }
    if units[0] != b'/' as u16
        || units.iter().enumerate().any(|(index, unit)| {
            *unit == b'~' as u16 && !matches!(units.get(index + 1), Some(0x30 | 0x31))
        })
    {
        return Err(EngineError::new(
            "JSON_SCHEMA_POINTER",
            Utf16::default(),
            "Invalid JSON Pointer",
        ));
    }
    let count = units.iter().filter(|unit| **unit == b'/' as u16).count();
    ctx.charge_work(count, Utf16::default())?;
    let mut segments = Vec::with_capacity(count);
    let mut start = 1;
    for end in 1..=units.len() {
        if end == units.len() || units[end] == b'/' as u16 {
            let mut segment = Vec::with_capacity(end - start);
            let mut index = start;
            while index < end {
                if units[index] == b'~' as u16 {
                    segment.push(if units[index + 1] == b'0' as u16 {
                        b'~' as u16
                    } else {
                        b'/' as u16
                    });
                    index += 2;
                } else {
                    segment.push(units[index]);
                    index += 1;
                }
            }
            segments.push(Utf16::new(segment));
            start = end + 1;
        }
    }
    Ok(segments)
}

fn array_index(segment: &Utf16) -> Option<usize> {
    let units = segment.units();
    if units.is_empty() || (units.len() > 1 && units[0] == b'0' as u16) {
        return None;
    }
    let mut index = 0usize;
    for unit in units {
        if !(b'0' as u16..=b'9' as u16).contains(unit) {
            return None;
        }
        index = index
            .checked_mul(10)?
            .checked_add((unit - b'0' as u16) as usize)?;
    }
    Some(index)
}

/// ECMAScript's array-index property range excludes 2^32-1.
pub(crate) fn is_index_key(key: &Utf16) -> Option<u32> {
    let units = key.units();
    if units.is_empty() || (units.len() > 1 && units[0] == b'0' as u16) {
        return None;
    }
    let mut value = 0u64;
    for unit in units {
        if !(b'0' as u16..=b'9' as u16).contains(unit) {
            return None;
        }
        value = value
            .checked_mul(10)?
            .checked_add((unit - b'0' as u16) as u64)?;
        if value >= u32::MAX as u64 {
            return None;
        }
    }
    Some(value as u32)
}

pub(crate) fn order_members(members: &mut [(Utf16, NativeJsonNode)]) {
    members.sort_by(|(a, _), (b, _)| match (is_index_key(a), is_index_key(b)) {
        (Some(a), Some(b)) => a.cmp(&b),
        (Some(_), None) => std::cmp::Ordering::Less,
        (None, Some(_)) => std::cmp::Ordering::Greater,
        (None, None) => std::cmp::Ordering::Equal,
    });
}

pub(crate) fn order_work(len: usize) -> u64 {
    (len as u64).saturating_mul((usize::BITS - len.max(1).leading_zeros()) as u64)
}

fn validate_number(value: &str, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    ctx.charge_work(value.len(), Utf16::default())?;
    if !is_json_number(value) {
        return Err(fail(
            "NATIVE_JSON_NUMBER",
            "Invalid exact JSON number token",
        ));
    }
    Ok(())
}

fn is_json_number(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.is_empty() {
        return false;
    }
    let mut index = usize::from(bytes[0] == b'-');
    if index == bytes.len() {
        return false;
    }
    if bytes[index] == b'0' {
        index += 1;
    } else if (b'1'..=b'9').contains(&bytes[index]) {
        index += 1;
        while index < bytes.len() && bytes[index].is_ascii_digit() {
            index += 1;
        }
    } else {
        return false;
    }
    if index < bytes.len() && bytes[index] == b'.' {
        index += 1;
        let start = index;
        while index < bytes.len() && bytes[index].is_ascii_digit() {
            index += 1;
        }
        if index == start {
            return false;
        }
    }
    if index < bytes.len() && matches!(bytes[index], b'e' | b'E') {
        index += 1;
        if index < bytes.len() && matches!(bytes[index], b'+' | b'-') {
            index += 1;
        }
        let start = index;
        while index < bytes.len() && bytes[index].is_ascii_digit() {
            index += 1;
        }
        if index == start {
            return false;
        }
    }
    index == bytes.len()
}

fn add(a: usize, b: usize) -> Result<usize, EngineError> {
    a.checked_add(b)
        .ok_or_else(|| fail("LIMIT", "Serialized length overflow"))
}
fn tagged_pointer_child(
    parent: &Utf16,
    segment: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    ctx.charge_work(segment.len(), parent.clone())?;
    let escaped_len = segment.units().iter().fold(0usize, |length, unit| {
        length.saturating_add(if matches!(*unit, 0x7e | 0x2f) { 2 } else { 1 })
    });
    let size = parent.len().saturating_add(1).saturating_add(escaped_len);
    ctx.charge_text(size, parent.clone())?;
    let mut path = Vec::with_capacity(size);
    path.extend_from_slice(parent.units());
    path.push(b'/' as u16);
    for unit in segment.units() {
        match *unit {
            0x7e => path.extend([b'~' as u16, b'0' as u16]),
            0x2f => path.extend([b'~' as u16, b'1' as u16]),
            other => path.push(other),
        }
    }
    Ok(Utf16::new(path))
}

fn fail(code: &'static str, message: &'static str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}
fn pointer_missing() -> EngineError {
    fail(
        "JSON_SCHEMA_POINTER",
        "Native JSON Pointer target does not exist",
    )
}
