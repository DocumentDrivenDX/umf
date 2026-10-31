// SPDX-License-Identifier: MIT OR Apache-2.0
//! Bounded, read-only Avro schema inspection over the retained native JSON tree.
//!
//! This deliberately reports a structural subset. It does not interpret defaults,
//! logical types, datum encodings, or claim complete Avro 1.12 validity.

use crate::{
    context::Context,
    error::{Diagnostic, EngineError, Severity, Validation},
    native_json::{NativeJsonNode as N, NativeJsonTree},
    value::Utf16,
};
use std::collections::HashSet;

#[derive(Clone, Copy)]
pub struct Dependency<'a> {
    pub id: &'a Utf16,
    pub tree: &'a NativeJsonTree,
}

/// Inspect dependency roots in caller order, followed by `root`; never mutates
/// or normalizes any source tree. IDs are provenance labels, not Avro names.
pub fn inspect_schema(
    root: &NativeJsonTree,
    dependencies: &[Dependency<'_>],
    ctx: &mut Context<'_>,
) -> Result<Validation, EngineError> {
    let mut registry = HashSet::<Vec<u16>>::new();
    let mut diagnostics = Vec::new();
    let mut visited = 0usize;
    for dependency in dependencies {
        ctx.charge_work(dependency.id.len().saturating_add(1), Utf16::default())?;
        inspect_node(
            dependency.tree.root(),
            &mut Vec::new(),
            &mut Vec::new(),
            &mut registry,
            &mut diagnostics,
            &mut visited,
            0,
            ctx,
        )?;
    }
    inspect_node(
        root.root(),
        &mut Vec::new(),
        &mut Vec::new(),
        &mut registry,
        &mut diagnostics,
        &mut visited,
        0,
        ctx,
    )?;
    diagnostic(
        &mut diagnostics,
        "AVRO_PROFILE_LIMIT",
        &[],
        "Inspection covers a bounded schema-structure subset; Avro 1.12 semantic validity is not certified",
        Severity::Warning,
        ctx,
    )?;
    let valid = diagnostics.iter().all(|d| d.severity != Severity::Error);
    let complete = valid && diagnostics.is_empty();
    Ok(Validation {
        valid,
        complete,
        diagnostics,
    })
}

#[allow(clippy::too_many_arguments)]
fn inspect_node(
    node: &N,
    path: &mut Vec<u16>,
    namespace: &mut Vec<u16>,
    names: &mut HashSet<Vec<u16>>,
    out: &mut Vec<Diagnostic>,
    visited: &mut usize,
    depth: usize,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    ctx.charge_work(path.len().saturating_add(1), Utf16::new(path.clone()))?;
    *visited = visited
        .checked_add(1)
        .ok_or_else(|| limit("Avro node count overflow"))?;
    if depth > ctx.limits().max_depth || *visited > ctx.limits().max_values {
        return Err(limit("Avro inspection limit exceeded"));
    }
    match node {
        N::String(s) => {
            let t = s.units();
            ctx.charge_work(
                t.len().saturating_add(namespace.len()).saturating_add(1),
                Utf16::new(path.clone()),
            )?;
            if primitive(t) || eq(t, "null") {
                return Ok(());
            }
            let full = qualify(t, namespace);
            if !names.contains(&full) {
                diagnostic(
                    out,
                    "AVRO_UNRESOLVED_NAME",
                    path,
                    "Named reference is unresolved in the supplied dependency/root order",
                    Severity::Error,
                    ctx,
                )?;
            }
        }
        N::Array(branches) => {
            if branches.is_empty() {
                diagnostic(
                    out,
                    "AVRO_EMPTY_UNION",
                    path,
                    "Union must contain at least one branch",
                    Severity::Error,
                    ctx,
                )?;
            }
            let mut seen = HashSet::new();
            for (i, branch) in branches.iter().enumerate() {
                ctx.charge_work(
                    branch_cost(branch, namespace).saturating_add(1),
                    Utf16::new(path.clone()),
                )?;
                path.push(b'/' as u16);
                path.extend(i.to_string().bytes().map(u16::from));
                let key = branch_key(branch, namespace);
                if !seen.insert(key.clone()) {
                    let (severity, message) = if key.first() == Some(&(b'N' as u16)) {
                        (
                            Severity::Warning,
                            "Named union branches normalize to the same full name; native parser behavior is retained as a profile difference",
                        )
                    } else {
                        (
                            Severity::Error,
                            "Union contains a duplicate primitive or container branch",
                        )
                    };
                    diagnostic(
                        out,
                        "AVRO_DUPLICATE_UNION_BRANCH",
                        path,
                        message,
                        severity,
                        ctx,
                    )?;
                }
                inspect_node(branch, path, namespace, names, out, visited, depth + 1, ctx)?;
                pop(path);
            }
        }
        N::Object(members) => {
            charge_member_scans(
                members,
                &[
                    "type",
                    "name",
                    "namespace",
                    "fields",
                    "items",
                    "values",
                    "logicalType",
                    "default",
                ],
                path,
                ctx,
            )?;
            let ty = string(member(members, "type"));
            let Some(ty) = ty else {
                diagnostic(
                    out,
                    "AVRO_SCHEMA_SHAPE",
                    path,
                    "Schema object has no string type",
                    Severity::Error,
                    ctx,
                )?;
                return Ok(());
            };
            ctx.charge_work(ty.len().saturating_add(1), Utf16::new(path.clone()))?;
            let prior_ns = namespace.clone();
            if one_of(ty.units(), &["record", "error", "enum", "fixed"]) {
                let name = string(member(members, "name"));
                if let Some(name) = name {
                    let ns = string(member(members, "namespace"))
                        .map(Utf16::units)
                        .unwrap_or(namespace.as_slice());
                    ctx.charge_work(
                        name.len().saturating_add(ns.len()).saturating_add(2),
                        Utf16::new(path.clone()),
                    )?;
                    let full = qualify(name.units(), ns);
                    if !names.insert(full.clone()) {
                        diagnostic(
                            out,
                            "AVRO_DUPLICATE_NAME",
                            path,
                            "Duplicate native Avro full name",
                            Severity::Error,
                            ctx,
                        )?;
                    }
                    *namespace = namespace_of(&full);
                } else {
                    diagnostic(
                        out,
                        "AVRO_NAME_REQUIRED",
                        path,
                        "Named schema is missing a string name",
                        Severity::Error,
                        ctx,
                    )?;
                }
            } else if !primitive(ty.units()) && !one_of(ty.units(), &["array", "map"]) {
                // Object-form references follow the same name-resolution path as
                // string references; their metadata remains source-owned.
                ctx.charge_work(
                    ty.len().saturating_add(namespace.len()).saturating_add(2),
                    Utf16::new(path.clone()),
                )?;
                let target = qualify(ty.units(), namespace);
                if !names.contains(&target) {
                    diagnostic(
                        out,
                        "AVRO_UNRESOLVED_NAME",
                        path,
                        "Named reference is unresolved in the supplied dependency/root order",
                        Severity::Error,
                        ctx,
                    )?;
                }
            }
            if one_of(ty.units(), &["record", "error"]) {
                if let Some(N::Array(fields)) = member(members, "fields") {
                    let mut field_names = HashSet::new();
                    if fields.len() > ctx.limits().max_values.saturating_sub(*visited) {
                        return Err(limit("Avro field count limit exceeded"));
                    }
                    for (i, field) in fields.iter().enumerate() {
                        let field_members = match field {
                            N::Object(f) => f.as_slice(),
                            _ => &[],
                        };
                        charge_member_scans(
                            field_members,
                            &["name", "type", "default"],
                            path,
                            ctx,
                        )?;
                        ctx.charge_work(1, Utf16::new(path.clone()))?;
                        path.extend(b"/fields/".iter().map(|b| *b as u16));
                        path.extend(i.to_string().bytes().map(u16::from));
                        if let N::Object(f) = field {
                            if let Some(n) = string(member(f, "name")).filter(|n| !n.is_empty()) {
                                ctx.charge_work(
                                    n.len().saturating_add(1),
                                    Utf16::new(path.clone()),
                                )?;
                                if !field_names.insert(n.units().to_vec()) {
                                    diagnostic(
                                        out,
                                        "AVRO_DUPLICATE_FIELD",
                                        path,
                                        "Record field name is duplicated",
                                        Severity::Error,
                                        ctx,
                                    )?;
                                }
                            } else {
                                diagnostic(
                                    out,
                                    "AVRO_FIELD_NAME",
                                    path,
                                    "Record field requires a non-empty string name",
                                    Severity::Error,
                                    ctx,
                                )?;
                            }
                            if member(f, "default").is_some() {
                                diagnostic(
                                    out,
                                    "AVRO_DEFAULT_UNINSPECTED",
                                    path,
                                    "Field default is retained but reader-resolution semantics are not interpreted",
                                    Severity::Warning,
                                    ctx,
                                )?;
                            }
                            if let Some(t) = member(f, "type") {
                                path.extend(b"/type".iter().map(|b| *b as u16));
                                inspect_node(
                                    t,
                                    path,
                                    namespace,
                                    names,
                                    out,
                                    visited,
                                    depth + 2,
                                    ctx,
                                )?;
                                pop(path);
                            } else {
                                diagnostic(
                                    out,
                                    "AVRO_FIELD_TYPE",
                                    path,
                                    "Record field requires a type schema",
                                    Severity::Error,
                                    ctx,
                                )?;
                            }
                        } else {
                            diagnostic(
                                out,
                                "AVRO_FIELD_SHAPE",
                                path,
                                "Record field must be an object",
                                Severity::Error,
                                ctx,
                            )?;
                        }
                        for _ in 0..2 {
                            pop(path);
                        }
                    }
                } else {
                    diagnostic(
                        out,
                        "AVRO_FIELDS_REQUIRED",
                        path,
                        "Record fields must be an array",
                        Severity::Error,
                        ctx,
                    )?;
                }
            } else if eq(ty.units(), "array") {
                if let Some(items) = member(members, "items") {
                    path.extend(b"/items".iter().map(|b| *b as u16));
                    inspect_node(items, path, namespace, names, out, visited, depth + 1, ctx)?;
                    pop(path);
                } else {
                    diagnostic(
                        out,
                        "AVRO_ITEMS_REQUIRED",
                        path,
                        "Array schema requires items",
                        Severity::Error,
                        ctx,
                    )?;
                }
            } else if eq(ty.units(), "map") {
                if let Some(values) = member(members, "values") {
                    path.extend(b"/values".iter().map(|b| *b as u16));
                    inspect_node(values, path, namespace, names, out, visited, depth + 1, ctx)?;
                    pop(path);
                } else {
                    diagnostic(
                        out,
                        "AVRO_VALUES_REQUIRED",
                        path,
                        "Map schema requires values",
                        Severity::Error,
                        ctx,
                    )?;
                }
            }
            if member(members, "logicalType").is_some() {
                diagnostic(
                    out,
                    "AVRO_LOGICAL_TYPE",
                    path,
                    "Logical type is retained but not interpreted by this inspection profile",
                    Severity::Warning,
                    ctx,
                )?;
            }
            for key in ["default"] {
                if member(members, key).is_some() {
                    diagnostic(
                        out,
                        "AVRO_DEFAULT_UNINSPECTED",
                        path,
                        "Default value semantics are retained but not interpreted",
                        Severity::Warning,
                        ctx,
                    )?;
                }
            }
            *namespace = prior_ns;
        }
        _ => diagnostic(
            out,
            "AVRO_SCHEMA_SHAPE",
            path,
            "Schema node must be a string, object, or union array",
            Severity::Error,
            ctx,
        )?,
    }
    Ok(())
}

fn diagnostic(
    out: &mut Vec<Diagnostic>,
    code: &'static str,
    path: &[u16],
    message: &'static str,
    severity: Severity,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    if out.len() >= ctx.limits().max_values {
        return Err(limit("Avro diagnostic limit exceeded"));
    }
    ctx.charge_work(
        path.len().saturating_add(message.len()).saturating_add(1),
        Utf16::default(),
    )?;
    out.push(Diagnostic {
        code: Utf16::from(code),
        path: Utf16::new(path.to_vec()),
        python_source_path: false,
        message: Utf16::from(message),
        severity,
        python_text_origin: None,
    });
    Ok(())
}
fn member<'a>(m: &'a [(Utf16, N)], k: &str) -> Option<&'a N> {
    m.iter().find(|(x, _)| eq(x.units(), k)).map(|(_, v)| v)
}
fn charge_member_scans(
    m: &[(Utf16, N)],
    keys: &[&str],
    path: &[u16],
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let key_cost = keys
        .iter()
        .fold(0usize, |a, k| a.saturating_add(k.len().saturating_add(1)));
    let native_cost = m.iter().fold(0usize, |a, (k, _)| {
        a.saturating_add(k.len().saturating_add(1))
    });
    ctx.charge_work(
        m.len()
            .saturating_mul(key_cost)
            .saturating_add(native_cost)
            .saturating_add(1),
        Utf16::new(path.to_vec()),
    )
}
fn string(n: Option<&N>) -> Option<&Utf16> {
    if let Some(N::String(s)) = n {
        Some(s)
    } else {
        None
    }
}
fn primitive(v: &[u16]) -> bool {
    [
        "null", "boolean", "int", "long", "float", "double", "bytes", "string",
    ]
    .iter()
    .any(|x| eq(v, x))
}
fn eq(v: &[u16], s: &str) -> bool {
    v.len() == s.len() && v.iter().zip(s.bytes()).all(|(a, b)| *a == b as u16)
}
fn one_of(v: &[u16], ss: &[&str]) -> bool {
    ss.iter().any(|s| eq(v, s))
}
fn qualify(n: &[u16], ns: &[u16]) -> Vec<u16> {
    if n.contains(&(b'.' as u16)) || ns.is_empty() {
        n.to_vec()
    } else {
        let mut o = ns.to_vec();
        o.push(b'.' as u16);
        o.extend_from_slice(n);
        o
    }
}
fn namespace_of(n: &[u16]) -> Vec<u16> {
    n.iter()
        .rposition(|x| *x == b'.' as u16)
        .map(|i| n[..i].to_vec())
        .unwrap_or_default()
}
fn pop(p: &mut Vec<u16>) {
    if let Some(i) = p.iter().rposition(|x| *x == b'/' as u16) {
        p.truncate(i)
    }
}
fn branch_cost(n: &N, namespace: &[u16]) -> usize {
    match n {
        N::String(s) => s.len().saturating_add(namespace.len()).saturating_add(1),
        N::Object(m) => {
            let scans = m.len().saturating_mul(4 + 5 + 10 + 3);
            let values = ["type", "name", "namespace"]
                .iter()
                .fold(0usize, |total, key| {
                    total.saturating_add(string(member(m, key)).map_or(0, Utf16::len))
                });
            let keys = m.iter().fold(0usize, |total, (key, _)| {
                total.saturating_add(key.len().saturating_add(1))
            });
            scans
                .saturating_add(values)
                .saturating_add(keys)
                .saturating_add(namespace.len())
                .saturating_add(1)
        }
        _ => 1,
    }
}
fn branch_key(n: &N, namespace: &[u16]) -> Vec<u16> {
    match n {
        N::String(s) => {
            let v = s.units();
            if primitive(v) {
                tagged(b'P', v)
            } else {
                tagged(b'N', &qualify(v, namespace))
            }
        }
        N::Object(m) => {
            let Some(ty) = string(member(m, "type")) else {
                return Vec::new();
            };
            if one_of(ty.units(), &["record", "error", "enum", "fixed"]) {
                if let Some(name) = string(member(m, "name")) {
                    let ns = string(member(m, "namespace"))
                        .map(Utf16::units)
                        .unwrap_or(namespace);
                    return tagged(b'N', &qualify(name.units(), ns));
                }
            }
            if primitive(ty.units()) {
                tagged(b'P', ty.units())
            } else if one_of(ty.units(), &["array", "map"]) {
                tagged(b'C', ty.units())
            } else {
                tagged(b'N', &qualify(ty.units(), namespace))
            }
        }
        _ => Vec::new(),
    }
}
fn tagged(prefix: u8, name: &[u16]) -> Vec<u16> {
    let mut v = vec![prefix as u16, b':' as u16];
    v.extend_from_slice(name);
    v
}
fn limit(m: &'static str) -> EngineError {
    EngineError::new("LIMIT", Utf16::default(), m)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::context::Context;
    fn tree(s: &str) -> NativeJsonTree {
        NativeJsonTree::parse_json(
            &s.encode_utf16().collect::<Vec<_>>(),
            &mut Context::ordinary(),
        )
        .unwrap()
    }
    #[test]
    fn ordered_dependencies_recursion_and_unknown_metadata_are_read_only() {
        let dep = tree(
            r#"{"type":"record","name":"Node","namespace":"n","fields":[{"name":"next","type":["null","Node"]}],"x-native":7}"#,
        );
        let root =
            tree(r#"{"type":"record","name":"Root","fields":[{"name":"node","type":"n.Node"}]}"#);
        let before = dep.clone();
        let id = Utf16::from("not-an-avro-name");
        let result = inspect_schema(
            &root,
            &[Dependency {
                id: &id,
                tree: &dep,
            }],
            &mut Context::ordinary(),
        )
        .unwrap();
        assert!(result.valid);
        assert!(!result.complete);
        assert_eq!(dep, before);
        assert!(
            result
                .diagnostics
                .iter()
                .any(|d| d.code == Utf16::from("AVRO_DEFAULT_UNINSPECTED"))
                == false
        );
    }
    #[test]
    fn unresolved_and_duplicate_names_are_diagnostic_and_never_panic() {
        let t = tree(
            r#"{"type":"record","name":"R","fields":[{"name":"x","type":"Missing"},{"name":"x","type":"string"}]}"#,
        );
        let r = inspect_schema(&t, &[], &mut Context::ordinary()).unwrap();
        assert!(!r.valid);
        assert!(
            r.diagnostics
                .iter()
                .any(|d| d.code == Utf16::from("AVRO_UNRESOLVED_NAME"))
        );
        assert!(
            r.diagnostics
                .iter()
                .any(|d| d.code == Utf16::from("AVRO_DUPLICATE_FIELD"))
        );
    }
    #[test]
    fn relative_names_resolve_and_distinct_named_union_branches_remain_distinct() {
        let t = tree(
            r#"{"type":"record","name":"Root","namespace":"n","fields":[{"name":"a","type":{"type":"record","name":"A","fields":[]}},{"name":"u","type":[{"type":"record","name":"B","fields":[]},{"type":"record","name":"C","fields":[]},"A"]}]}"#,
        );
        let r = inspect_schema(&t, &[], &mut Context::ordinary()).unwrap();
        assert!(r.valid, "{:?}", r.diagnostics);
        assert!(
            !r.diagnostics
                .iter()
                .any(|d| d.code == Utf16::from("AVRO_DUPLICATE_UNION_BRANCH"))
        );
    }
    #[test]
    fn identical_named_union_branch_is_diagnosed() {
        let t = tree(
            r#"{"type":"record","name":"R","fields":[{"name":"x","type":[{"type":"record","name":"A","fields":[]},{"type":"record","name":"A","fields":[]}]}]}"#,
        );
        let r = inspect_schema(&t, &[], &mut Context::ordinary()).unwrap();
        assert!(
            r.diagnostics
                .iter()
                .any(|d| d.code == Utf16::from("AVRO_DUPLICATE_UNION_BRANCH"))
        );
    }
    #[test]
    fn named_union_keys_normalize_references_and_keep_container_names_distinct() {
        let t = tree(
            r#"{"type":"record","name":"Root","namespace":"n","fields":[{"name":"a","type":{"type":"record","name":"A","fields":[]}},{"name":"u","type":["A","n.A"]}]}"#,
        );
        let r = inspect_schema(&t, &[], &mut Context::ordinary()).unwrap();
        assert!(
            r.valid,
            "native parsers accept this form; inspection records a profile warning"
        );
        assert!(
            r.diagnostics
                .iter()
                .any(|d| d.code == Utf16::from("AVRO_DUPLICATE_UNION_BRANCH")
                    && d.severity == Severity::Warning)
        );
        let container_named_array =
            tree(r#"{"type":"record","name":"array","namespace":"n","fields":[]}"#);
        let container = tree(r#"["n.array",{"type":"array","items":"string"}]"#);
        let id = Utf16::from("dep");
        let result = inspect_schema(
            &container,
            &[Dependency {
                id: &id,
                tree: &container_named_array,
            }],
            &mut Context::ordinary(),
        )
        .unwrap();
        assert!(result.valid, "{:?}", result.diagnostics);
    }
    #[test]
    fn object_form_references_and_malformed_fields_are_checked() {
        let dep = tree(
            r#"{"type":"record","name":"Node","namespace":"n","fields":[{"name":"next","type":{"type":"Node"}}]}"#,
        );
        let root = tree(
            r#"{"type":"record","name":"Root","fields":[{"name":"node","type":{"type":"n.Node"}}]}"#,
        );
        let id = Utf16::from("artifact-id");
        let good = inspect_schema(
            &root,
            &[Dependency {
                id: &id,
                tree: &dep,
            }],
            &mut Context::ordinary(),
        )
        .unwrap();
        assert!(good.valid, "{:?}", good.diagnostics);
        let missing = inspect_schema(
            &tree(
                r#"{"type":"record","name":"R","fields":[{"name":"x","type":{"type":"Missing"}}]}"#,
            ),
            &[],
            &mut Context::ordinary(),
        )
        .unwrap();
        assert!(
            missing
                .diagnostics
                .iter()
                .any(|d| d.code == Utf16::from("AVRO_UNRESOLVED_NAME"))
        );
        for source in [
            r#"{"type":"record","name":"R","fields":[{}]}"#,
            r#"{"type":"record","name":"R","fields":[{"name":7,"type":"string"}]}"#,
            r#"{"type":"record","name":"R","fields":[{"name":"x"}]}"#,
        ] {
            let invalid = inspect_schema(&tree(source), &[], &mut Context::ordinary()).unwrap();
            assert!(!invalid.valid, "{source}");
        }
    }
    #[test]
    fn field_enumeration_observes_work_controls_before_returning_valid() {
        let fields = (0..128).map(|_| "{}").collect::<Vec<_>>().join(",");
        let source = format!(r#"{{"type":"record","name":"R","fields":[{fields}]}}"#);
        let t = tree(&source);
        let mut meter = |_: usize| Err(EngineError::new("METER_STOP", Utf16::default(), "stopped"));
        let error =
            inspect_schema(&t, &[], &mut Context::ordinary().with_meter(&mut meter)).unwrap_err();
        assert_eq!(error.code, "METER_STOP");
    }
    #[test]
    fn oversized_names_are_metered_before_union_key_allocation() {
        let large = "x".repeat(4096);
        let source = format!(r#"[{{"type":"record","name":"{large}","fields":[]}}]"#);
        let t = tree(&source);
        let mut calls = 0usize;
        let mut meter = |amount: usize| {
            calls += 1;
            if amount > 256 {
                Err(EngineError::new(
                    "METER_STOP",
                    Utf16::default(),
                    "preflight",
                ))
            } else {
                Ok(())
            }
        };
        let error =
            inspect_schema(&t, &[], &mut Context::ordinary().with_meter(&mut meter)).unwrap_err();
        assert_eq!(error.code, "METER_STOP");
        assert!(
            calls > 1,
            "meter should admit initial visits then reject the preflight charge"
        );
    }
}
