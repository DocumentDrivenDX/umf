// SPDX-License-Identifier: MIT OR Apache-2.0
//! Avro record-declaration inventory for the opt-in Record Type classifier.
//!
//! This is the bounded `avroRecords`-equivalent discovery foundation. It
//! inventories declarations at Avro schema positions only; it does not perform
//! UMF ideal reconciliation or emit a classification receipt.

use crate::{
    avro_fields::AvroDependency,
    context::Context,
    error::EngineError,
    native_json::{NativeJsonNode, NativeJsonTree},
    value::Utf16,
};

/// One directly declared Avro record or error schema.
#[derive(Clone, Debug, PartialEq)]
pub struct AvroRecordDeclaration {
    /// RFC 6901 path to the native record/error schema.
    pub path: Utf16,
    /// Source dependency identity, or `None` for the root schema.
    pub dependency_id: Option<Utf16>,
    /// Effective namespace after applying the declared fullname.
    pub namespace: Utf16,
    /// Unqualified Avro name.
    pub name: Utf16,
    /// Exact resolved Avro fullname.
    pub fullname: Utf16,
    /// Complete retained native declaration, including unknown representation
    /// fields attached to the selected subtree.
    pub native: NativeJsonTree,
}

/// Inventory record/error declarations from ordered dependencies, then root.
///
/// Traversal follows schema positions: top-level schemas, record field types,
/// union branches, array items, map values, and object-valued `type` schemas.
/// It never follows named references or searches arbitrary annotations.
pub fn inventory_record_declarations<'a>(
    root: &'a NativeJsonTree,
    dependencies: &[AvroDependency<'a>],
    ctx: &mut Context<'_>,
) -> Result<Vec<AvroRecordDeclaration>, EngineError> {
    let mut result = Vec::new();
    for dependency in dependencies {
        inventory_tree(
            dependency.root,
            Some(dependency.id),
            &Utf16::default(),
            &mut result,
            ctx,
        )?;
    }
    inventory_tree(root, None, &Utf16::default(), &mut result, ctx)?;
    Ok(result)
}

fn inventory_tree(
    tree: &NativeJsonTree,
    dependency_id: Option<&Utf16>,
    initial_namespace: &Utf16,
    output: &mut Vec<AvroRecordDeclaration>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    walk(
        tree,
        tree.root(),
        &Utf16::default(),
        initial_namespace,
        dependency_id,
        output,
        0,
        ctx,
    )
}

#[allow(clippy::too_many_arguments)]
fn walk(
    tree: &NativeJsonTree,
    node: &NativeJsonNode,
    path: &Utf16,
    namespace: &Utf16,
    dependency_id: Option<&Utf16>,
    output: &mut Vec<AvroRecordDeclaration>,
    depth: usize,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    if depth > ctx.limits().max_depth || output.len() >= ctx.limits().max_values {
        return Err(EngineError::new(
            "LIMIT",
            path.clone(),
            "Avro record declaration inventory limit exceeded",
        ));
    }
    ctx.charge_work(path.len().saturating_add(1), path.clone())?;
    match node {
        NativeJsonNode::Array(items) => {
            for (index, item) in items.iter().enumerate() {
                let child = append(path, &format!("/{index}"), ctx)?;
                walk(
                    tree,
                    item,
                    &child,
                    namespace,
                    dependency_id,
                    output,
                    depth + 1,
                    ctx,
                )?;
            }
        }
        NativeJsonNode::Object(members) => {
            let kind = string_member(members, "type");
            match kind
                .as_ref()
                .and_then(|value| value.to_utf8().ok())
                .as_deref()
            {
                Some("record" | "error") => {
                    let Some(raw_name) = string_member(members, "name") else {
                        return Ok(());
                    };
                    let declared_ns =
                        string_member(members, "namespace").unwrap_or_else(|| namespace.clone());
                    let fullname = qualify(&raw_name, &declared_ns, ctx)?;
                    // Bound the copied suffixes before allocating namespace and
                    // local-name strings from the derived fullname.
                    ctx.charge_work(fullname.len().saturating_mul(2), path.clone())?;
                    let effective_namespace = namespace_of(&fullname);
                    let name = local_name(&fullname);
                    let native = tree.subtree_clone(path, ctx)?;
                    output.push(AvroRecordDeclaration {
                        path: path.clone(),
                        dependency_id: dependency_id.cloned(),
                        namespace: effective_namespace.clone(),
                        name,
                        fullname,
                        native,
                    });
                    if let Some(NativeJsonNode::Array(fields)) = member(node, "fields") {
                        for (index, field) in fields.iter().enumerate() {
                            if let Some(schema) = member(field, "type") {
                                let child = append(path, &format!("/fields/{index}/type"), ctx)?;
                                walk(
                                    tree,
                                    schema,
                                    &child,
                                    &effective_namespace,
                                    dependency_id,
                                    output,
                                    depth + 1,
                                    ctx,
                                )?;
                            }
                        }
                    }
                }
                Some("array") => {
                    if let Some(items) = member(node, "items") {
                        walk(
                            tree,
                            items,
                            &append(path, "/items", ctx)?,
                            namespace,
                            dependency_id,
                            output,
                            depth + 1,
                            ctx,
                        )?;
                    }
                }
                Some("map") => {
                    if let Some(values) = member(node, "values") {
                        walk(
                            tree,
                            values,
                            &append(path, "/values", ctx)?,
                            namespace,
                            dependency_id,
                            output,
                            depth + 1,
                            ctx,
                        )?;
                    }
                }
                _ => {}
            }
            if let Some(type_node) = member(node, "type") {
                if !matches!(type_node, NativeJsonNode::String(_)) {
                    walk(
                        tree,
                        type_node,
                        &append(path, "/type", ctx)?,
                        namespace,
                        dependency_id,
                        output,
                        depth + 1,
                        ctx,
                    )?;
                }
            }
        }
        _ => {}
    }
    Ok(())
}

fn member<'a>(node: &'a NativeJsonNode, key: &str) -> Option<&'a NativeJsonNode> {
    match node {
        NativeJsonNode::Object(fields) => fields
            .iter()
            .find(|(name, _)| name == &Utf16::from(key))
            .map(|(_, value)| value),
        _ => None,
    }
}

fn string_member(fields: &[(Utf16, NativeJsonNode)], key: &str) -> Option<Utf16> {
    fields
        .iter()
        .find(|(name, _)| name == &Utf16::from(key))
        .and_then(|(_, value)| match value {
            NativeJsonNode::String(text) => Some(text.clone()),
            _ => None,
        })
}

fn append(path: &Utf16, suffix: &str, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    let suffix_len = suffix.encode_utf16().count();
    ctx.charge_work(path.len().saturating_add(suffix_len), path.clone())?;
    let mut units = path.units().to_vec();
    units.extend(suffix.encode_utf16());
    Ok(Utf16::new(units))
}

fn qualify(name: &Utf16, namespace: &Utf16, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    if name.units().contains(&(b'.' as u16)) || namespace.is_empty() {
        ctx.charge_work(name.len(), Utf16::default())?;
        return Ok(name.clone());
    }
    ctx.charge_work(
        namespace.len().saturating_add(name.len()).saturating_add(1),
        Utf16::default(),
    )?;
    let mut units = namespace.units().to_vec();
    units.push(b'.' as u16);
    units.extend_from_slice(name.units());
    Ok(Utf16::new(units))
}

fn namespace_of(fullname: &Utf16) -> Utf16 {
    match fullname
        .units()
        .iter()
        .rposition(|unit| *unit == b'.' as u16)
    {
        Some(dot) => Utf16::new(fullname.units()[..dot].to_vec()),
        None => Utf16::default(),
    }
}

fn local_name(fullname: &Utf16) -> Utf16 {
    match fullname
        .units()
        .iter()
        .rposition(|unit| *unit == b'.' as u16)
    {
        Some(dot) => Utf16::new(fullname.units()[dot + 1..].to_vec()),
        None => fullname.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tree(source: &str) -> NativeJsonTree {
        NativeJsonTree::parse_json(
            &source.encode_utf16().collect::<Vec<_>>(),
            &mut Context::ordinary(),
        )
        .unwrap()
    }

    #[test]
    fn inventories_schema_declarations_in_order_and_retains_dependencies() {
        let dependency = tree(
            r#"{"type":"record","name":"Address","namespace":"sales","fields":[{"name":"zip","type":"string"}]}"#,
        );
        let root = tree(
            r#"{"type":"record","name":"Holder","namespace":"sales","fields":[{"name":"customer","type":{"type":"record","name":"Customer","fields":[{"name":"address","type":"Address"},{"name":"inline","type":{"type":"record","name":"Inline","fields":[]}}]}},{"name":"items","type":{"type":"array","items":{"type":"record","name":"Item","fields":[]}}}],"metadata":{"type":"record","name":"Ignored","fields":[]}}"#,
        );
        let id = Utf16::from("dep-address");
        let declarations = inventory_record_declarations(
            &root,
            &[AvroDependency {
                id: &id,
                root: &dependency,
            }],
            &mut Context::ordinary(),
        )
        .unwrap();
        assert_eq!(
            declarations
                .iter()
                .map(|r| r.fullname.clone())
                .collect::<Vec<_>>(),
            [
                "sales.Address",
                "sales.Holder",
                "sales.Customer",
                "sales.Inline",
                "sales.Item"
            ]
            .map(Utf16::from)
        );
        assert_eq!(declarations[0].dependency_id, Some(id));
        assert_eq!(declarations[2].path, Utf16::from("/fields/0/type"));
        assert_eq!(declarations[4].path, Utf16::from("/fields/1/type/items"));
        assert_eq!(declarations[2].namespace, Utf16::from("sales"));
        assert_eq!(declarations[2].name, Utf16::from("Customer"));
        assert_eq!(
            declarations[2].native.root(),
            root.child(&Utf16::from("/fields/0/type"), &mut Context::ordinary())
                .unwrap()
        );
    }

    #[test]
    fn traverses_union_branches_without_following_named_references() {
        let root = tree(
            r#"{"type":"record","name":"Holder","fields":[{"name":"maybe","type":["null",{"type":"record","name":"Choice","fields":[]}]},{"name":"named","type":"Choice"}]}"#,
        );
        let declarations =
            inventory_record_declarations(&root, &[], &mut Context::ordinary()).unwrap();
        assert_eq!(
            declarations
                .iter()
                .map(|r| r.fullname.clone())
                .collect::<Vec<_>>(),
            [Utf16::from("Holder"), Utf16::from("Choice")]
        );
        assert_eq!(declarations[1].path, Utf16::from("/fields/0/type/1"));
    }

    #[test]
    fn malformed_declaration_without_name_is_not_invented() {
        let root = tree(r#"{"type":"record","fields":[]}"#);
        assert!(
            inventory_record_declarations(&root, &[], &mut Context::ordinary())
                .unwrap()
                .is_empty()
        );
    }
}
