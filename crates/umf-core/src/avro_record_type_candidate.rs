// SPDX-License-Identifier: MIT OR Apache-2.0
//! Bounded name-resolution foundation for the opt-in Avro Record Type port.
//!
//! This module deliberately stops before UMF classification. It resolves only
//! direct record/error definitions and named references in the enclosing
//! namespace in caller-supplied trees. It does not interpret author receipts, construct a
//! target document, or recover a bundle.

use crate::{
    avro_fields::{derive_avro_fields, AvroDependency, AvroFieldMetadata},
    context::Context,
    error::EngineError,
    native_json::{NativeJsonNode, NativeJsonTree},
    value::Utf16,
};

pub const CORE_SCHEMA: &str = include_str!("../../../spec/core/schema.json");
pub const KIND_OPERATION_SCHEMA: &str =
    include_str!("../../../spec/core/kind-operation-v6.schema.json");
pub const CLASSIFICATION_SCHEMA: &str =
    include_str!("../../../spec/core/avro-record-type-classification.schema.json");

#[derive(Clone, Debug, PartialEq)]
pub enum Resolution {
    Direct { fullname: Utf16, path: Utf16, dependency_id: Option<Utf16> },
    Qualified { fullname: Utf16, path: Utf16, dependency_id: Option<Utf16> },
    Unsupported { reason: &'static str },
    Unresolved { fullname: Utf16 },
    Ambiguous { fullname: Utf16 },
}

#[derive(Clone, Debug, PartialEq)]
pub struct Candidate {
    pub field: AvroFieldMetadata,
    pub resolution: Resolution,
}

/// Find a field by its derived UMF identity and resolve only a direct or
/// qualified record/error type. The ordered dependency list is authoritative;
/// this function performs no I/O and resolves unqualified references only
/// within an explicit enclosing namespace.
pub fn resolve_candidate<'a>(
    root: &'a NativeJsonTree,
    dependencies: &[AvroDependency<'a>],
    column: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Candidate, EngineError> {
    let fields = derive_avro_fields(root, dependencies, ctx)?;
    let field = fields.into_iter().find(|field| &field.element_id == column)
        .ok_or_else(|| EngineError::new("AVRO_RECORD_TYPE_COLUMN", Utf16::default(), "Avro field identity was not found"))?;
    let field_type = object_member(field.native_field.root(), "type");
    let resolution = match field_type {
        Some(NativeJsonNode::Object(members)) if is_record_type(members) => {
            match string_member(members, "name").filter(|name| !name.is_empty()) {
                Some(name) => {
                    let namespace = string_member(members, "namespace").unwrap_or_else(|| {
                        field.record.to_utf8().ok().and_then(|record| record.rsplit_once('.').map(|(ns, _)| Utf16::from(ns))).unwrap_or_default()
                    });
                    Resolution::Direct { fullname: qualified(&name, &namespace), path: child_path(&field.path, "type"), dependency_id: field.dependency_id.clone() }
                }
                None => Resolution::Unsupported { reason: "Direct record/error type has no name" },
            }
        }
        Some(NativeJsonNode::Object(members)) if is_container_or_union(members) => {
            Resolution::Unsupported { reason: "Unions and containers require separate bindings" }
        }
        Some(NativeJsonNode::String(name)) => {
            let namespace = field.record.to_utf8().ok().and_then(|record| record.rsplit_once('.').map(|(ns, _)| Utf16::from(ns))).unwrap_or_default();
            let fullname = if name.units().contains(&(b'.' as u16)) { name.clone() } else if namespace.is_empty() { return Ok(Candidate { field, resolution: Resolution::Unsupported { reason: "Unqualified named references without an enclosing namespace are not resolved by this profile" } }); } else { qualified(name, &namespace) };
            let mut found: Option<(Utf16, Option<Utf16>)> = None;
            let mut duplicate = false;
            for (tree, dependency_id) in dependencies.iter().map(|d| (d.root, Some(d.id)))
                .chain(std::iter::once((root, None))) {
                let mut visited = 0;
                collect_named_record(tree.root(), &fullname, dependency_id, &mut Vec::new(), &mut Vec::new(), &mut found, &mut duplicate, &mut visited, 0, ctx)?;
            }
            if duplicate { Resolution::Ambiguous { fullname } }
            else if let Some((path, dependency_id)) = found { Resolution::Qualified { fullname, path, dependency_id } }
            else { Resolution::Unresolved { fullname } }
        }
        _ => Resolution::Unsupported { reason: "Native type is not a direct record/error definition or qualified named reference" },
    };
    Ok(Candidate { field, resolution })
}

fn collect_named_record(
    node: &NativeJsonNode,
    wanted: &Utf16,
    dependency_id: Option<&Utf16>,
    path: &mut Vec<u16>,
    namespace: &mut Vec<u16>,
    found: &mut Option<(Utf16, Option<Utf16>)>,
    duplicate: &mut bool,
    visited: &mut usize,
    depth: usize,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    if depth > ctx.limits().max_depth || *visited >= ctx.limits().max_values {
        return Err(EngineError::new("LIMIT", Utf16::new(path.clone()), "Avro named-record resolution limit exceeded"));
    }
    *visited += 1;
    ctx.charge_work(path.len().saturating_add(1), Utf16::new(path.clone()))?;
    match node {
        NativeJsonNode::Array(branches) => {
            // Arrays at schema position are Avro unions. Arrays in annotations
            // are never reached by this grammar walk.
            for (index, branch) in branches.iter().enumerate() {
                let old = path.len(); push_ascii(path, &format!("/{index}"));
                let result = collect_named_record(branch, wanted, dependency_id, path, namespace, found, duplicate, visited, depth + 1, ctx);
                path.truncate(old); result?;
            }
        }
        NativeJsonNode::Object(members) => {
            let kind = string_member(members, "type");
            let kind_text = kind.as_ref().and_then(|value| value.to_utf8().ok());
            match kind_text.as_deref() {
                Some("record" | "error") => {
                    let previous_namespace = namespace.clone();
                    if let Some(explicit) = string_member(members, "namespace") { *namespace = explicit.into_units(); }
                    if let Some(name) = string_member(members, "name") {
                        let fullname = qualified(&name, &Utf16::new(namespace.clone()));
                        if let Some(dot) = fullname.units().iter().rposition(|unit| *unit == b'.' as u16) {
                            *namespace = fullname.units()[..dot].to_vec();
                        } else {
                            namespace.clear();
                        }
                        if &fullname == wanted {
                            if found.is_some() { *duplicate = true; }
                            else { *found = Some((Utf16::new(path.clone()), dependency_id.cloned())); }
                        }
                    }
                    if let Some(NativeJsonNode::Array(fields)) = object_member(node, "fields") {
                        for (index, field) in fields.iter().enumerate() {
                            if let Some(schema) = object_member(field, "type") {
                                let old = path.len(); push_ascii(path, &format!("/fields/{index}/type"));
                                let result = collect_named_record(schema, wanted, dependency_id, path, namespace, found, duplicate, visited, depth + 1, ctx);
                                path.truncate(old); result?;
                            }
                        }
                    }
                    *namespace = previous_namespace;
                }
                Some("array") => if let Some(items) = object_member(node, "items") {
                    let old = path.len(); push_ascii(path, "/items");
                    let result = collect_named_record(items, wanted, dependency_id, path, namespace, found, duplicate, visited, depth + 1, ctx);
                    path.truncate(old); result?;
                },
                Some("map") => if let Some(values) = object_member(node, "values") {
                    let old = path.len(); push_ascii(path, "/values");
                    let result = collect_named_record(values, wanted, dependency_id, path, namespace, found, duplicate, visited, depth + 1, ctx);
                    path.truncate(old); result?;
                },
                _ => {} // Primitive, named reference, or unsupported object.
            }
        }
        _ => {}
    }
    Ok(())
}

fn object_member<'a>(node: &'a NativeJsonNode, key: &str) -> Option<&'a NativeJsonNode> {
    match node { NativeJsonNode::Object(members) => members.iter().find(|(k, _)| ascii_eq(k, key)).map(|(_, v)| v), _ => None }
}
fn string_member(members: &[(Utf16, NativeJsonNode)], key: &str) -> Option<Utf16> {
    members.iter().find(|(k, _)| ascii_eq(k, key)).and_then(|(_, v)| if let NativeJsonNode::String(s) = v { Some(s.clone()) } else { None })
}
fn is_record_type(members: &[(Utf16, NativeJsonNode)]) -> bool { matches!(string_member(members, "type").and_then(|value| value.to_utf8().ok()).as_deref(), Some("record" | "error")) }
fn is_container_or_union(members: &[(Utf16, NativeJsonNode)]) -> bool { matches!(string_member(members, "type").and_then(|value| value.to_utf8().ok()).as_deref(), Some("array" | "map")) }
fn child_path(path: &Utf16, segment: &str) -> Utf16 {
    let mut units = path.units().to_vec();
    if !path.is_empty() { units.push(b'/' as u16); }
    units.extend(segment.encode_utf16());
    Utf16::new(units)
}
fn ascii_eq(value: &Utf16, expected: &str) -> bool { value.units().len() == expected.len() && value.units().iter().zip(expected.bytes()).all(|(a,b)| *a == b as u16) }
fn qualified(name: &Utf16, namespace: &Utf16) -> Utf16 {
    if name.units().contains(&(b'.' as u16)) || namespace.is_empty() { return name.clone(); }
    let mut units = namespace.units().to_vec(); units.push(b'.' as u16); units.extend_from_slice(name.units()); Utf16::new(units)
}
fn push_ascii(path: &mut Vec<u16>, value: &str) { path.extend(value.bytes().map(u16::from)); }

#[cfg(test)]
mod tests {
    use super::*;

    fn tree(source: &str) -> NativeJsonTree {
        NativeJsonTree::parse_json(&source.encode_utf16().collect::<Vec<_>>(), &mut Context::ordinary()).unwrap()
    }
    fn id(path: &str) -> Utf16 { Utf16::from(format!("[null,{:?}]", path)) }

    #[test]
    fn resolves_only_supported_native_shapes() {
        let root = tree(r#"{"type":"record","name":"Holder","namespace":"sales","fields":[{"name":"customer","type":{"type":"record","name":"Customer","fields":[]}}]}"#);
        let candidate = resolve_candidate(&root, &[], &id("/fields/0"), &mut Context::ordinary()).unwrap();
        assert!(matches!(candidate.resolution, Resolution::Direct { ref fullname, .. } if fullname == &Utf16::from("sales.Customer")));

        let root = tree(r#"{"type":"record","name":"Holder","namespace":"sales","fields":[{"name":"customer","type":"sales.Customer"}]}"#);
        let dependency = tree(r#"{"type":"record","name":"Customer","namespace":"sales","fields":[]}"#);
        let dep_id = Utf16::from("customer-schema");
        let dependencies = [AvroDependency { id: &dep_id, root: &dependency }];
        let candidate = resolve_candidate(&root, &dependencies, &id("/fields/0"), &mut Context::ordinary()).unwrap();
        assert!(matches!(candidate.resolution, Resolution::Qualified { dependency_id: Some(ref id), .. } if id == &dep_id));

        let root = tree(r#"{"type":"record","name":"Holder","namespace":"sales","fields":[{"name":"customer","type":"Customer"}]}"#);
        let candidate = resolve_candidate(&root, &dependencies, &id("/fields/0"), &mut Context::ordinary()).unwrap();
        assert!(matches!(candidate.resolution, Resolution::Qualified { ref fullname, dependency_id: Some(ref id), .. } if fullname == &Utf16::from("sales.Customer") && id == &dep_id));

        let duplicate_id = Utf16::from("duplicate-customer-schema");
        let duplicate_dependencies = [
            AvroDependency { id: &dep_id, root: &dependency },
            AvroDependency { id: &duplicate_id, root: &dependency },
        ];
        let candidate = resolve_candidate(&root, &duplicate_dependencies, &id("/fields/0"), &mut Context::ordinary()).unwrap();
        assert!(matches!(candidate.resolution, Resolution::Ambiguous { ref fullname } if fullname == &Utf16::from("sales.Customer")));

        let root = tree(r#"{"type":"record","name":"Holder","namespace":"sales","fields":[{"name":"customer","type":"sales.Customer"}],"metadata":{"type":"record","name":"Customer","namespace":"sales","fields":[]}}"#);
        let candidate = resolve_candidate(&root, &[], &id("/fields/0"), &mut Context::ordinary()).unwrap();
        assert!(matches!(candidate.resolution, Resolution::Unresolved { .. }));

        let root = tree(r#"{"type":"record","name":"sales.Holder","fields":[{"name":"customer","type":"Customer"},{"name":"definition","type":{"type":"record","name":"Customer","fields":[]}}]}"#);
        let candidate = resolve_candidate(&root, &[], &id("/fields/0"), &mut Context::ordinary()).unwrap();
        assert!(matches!(candidate.resolution, Resolution::Qualified { ref fullname, dependency_id: None, .. } if fullname == &Utf16::from("sales.Customer")));

        let root = tree(r#"{"type":"record","name":"Holder","fields":[{"name":"customer","type":["null","Customer"]}]}"#);
        let candidate = resolve_candidate(&root, &[], &id("/fields/0"), &mut Context::ordinary()).unwrap();
        assert!(matches!(candidate.resolution, Resolution::Unsupported { .. }));

        let root = tree(r#"{"type":"record","name":"Holder","fields":[{"name":"customer","type":{"type":"record","fields":[]}}]}"#);
        let candidate = resolve_candidate(&root, &[], &id("/fields/0"), &mut Context::ordinary()).unwrap();
        assert!(matches!(candidate.resolution, Resolution::Unsupported { reason: "Direct record/error type has no name" }));
    }
}
