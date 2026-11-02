// SPDX-License-Identifier: MIT OR Apache-2.0
//! Native Parquet present-value cardinality observations and retained receipts.
use crate::{
    context::Context,
    engine::{Capabilities, Engine},
    error::EngineError,
    parquet_capture_inspection::{
        export_parquet_capture, get_parquet_field_metadata, inspect_parquet_containers,
    },
    registry::Registry,
    schema::CompiledSchema,
    serialization::{self, Format},
    value::{copy_json, Utf16, Value},
};
use std::collections::{BTreeMap, BTreeSet};

const RESULT_SCHEMA: &str =
    include_str!("../../../spec/core/parquet-cardinality-classification.schema.json");
const EXT: &str = "umf.parquet.cardinality";
const BASIS: &str = "Checked present-value LIST/MAP and record roles; physical wrappers, key uniqueness, availability and Arrow refinements remain native";
const RECOVERY: &str = "Retain original native archive and author assertions; classification does not replace native meaning";
fn u(s: &str) -> Utf16 {
    Utf16::from(s)
}
fn t(s: &str) -> Value {
    Value::string_utf8(s)
}
fn n(v: usize) -> Value {
    Value::Number(v as f64)
}
fn obj(v: Vec<(&str, Value)>) -> Value {
    Value::Object(v.into_iter().map(|(k, v)| (u(k), v)).collect())
}
fn get<'a>(v: &'a Value, k: &str) -> Option<&'a Value> {
    if let Value::Object(m) = v {
        m.iter().find(|(x, _)| x == &u(k)).map(|(_, v)| v)
    } else {
        None
    }
}
fn units(v: &Value) -> Option<Utf16> {
    if let Value::String(s) = v {
        Some(s.clone())
    } else {
        None
    }
}
fn text(v: &Value) -> Option<String> {
    if let Value::String(s) = v {
        s.to_utf8().ok()
    } else {
        None
    }
}
fn arr(v: &Value) -> Option<&[Value]> {
    if let Value::Array(a) = v {
        Some(a)
    } else {
        None
    }
}
fn num(v: &Value) -> Option<usize> {
    match v {
        Value::Number(x)
            if x.is_finite() && *x >= 0.0 && x.fract() == 0.0 && *x <= 9_007_199_254_740_991.0 =>
        {
            Some(*x as usize)
        }
        _ => None,
    }
}
fn set(v: &mut Value, k: &str, x: Value) {
    if let Value::Object(m) = v {
        if let Some((_, old)) = m.iter_mut().find(|(n, _)| n == &u(k)) {
            *old = x
        } else {
            m.push((u(k), x))
        }
    }
}
fn error(code: &str, path: &str, message: &str) -> EngineError {
    EngineError::new(code, u(path), message)
}
fn parse(source: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    serialization::read_json_value(
        &source.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        ctx,
    )
}
fn canonical(v: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    Ok(match v {
        Value::Array(a) => Value::Array(
            a.iter()
                .map(|x| canonical(x, ctx))
                .collect::<Result<_, _>>()?,
        ),
        Value::Object(m) => {
            let mut pairs = Vec::with_capacity(m.len());
            for (k, x) in m {
                ctx.charge_work(k.len().saturating_add(1), Utf16::default())?;
                pairs.push((k.clone(), canonical(x, ctx)?));
            }
            pairs.sort_by(|a, b| a.0.cmp(&b.0));
            Value::Object(pairs)
        }
        _ => v.clone(),
    })
}
fn valid_result(
    value: &Value,
    engine: &Engine,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let schema = parse(RESULT_SCHEMA, ctx)?;
    let resources = engine.schema_resources_with_context(ctx)?;
    let compiled = CompiledSchema::compile(&schema, &resources, ctx)?;
    if let Some(d) = compiled.validate(value, ctx)?.first() {
        return Err(EngineError::new(
            "PARQUET_CARDINALITY_RESULT",
            d.instance_path.clone(),
            d.message.to_utf8().unwrap_or_default(),
        ));
    }
    copy_json(value, ctx)
}
fn has_unknown(v: &Value, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    let mut pending = vec![v];
    while let Some(v) = pending.pop() {
        ctx.charge_work(1, Utf16::default())?;
        match v {
            Value::Object(m) => {
                for (k, x) in m {
                    ctx.charge_work(k.len().saturating_add(1), Utf16::default())?;
                    if k == &u("$unknown") && matches!(x,Value::Array(a) if !a.is_empty()) {
                        return Ok(true);
                    }
                    pending.push(x)
                }
            }
            Value::Array(a) => pending.extend(a),
            _ => {}
        }
    }
    Ok(false)
}
fn recursive_tree(
    tree: &Value,
    out: &mut BTreeMap<usize, (Vec<Utf16>, Vec<usize>)>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let mut pending = vec![tree];
    while let Some(node) = pending.pop() {
        ctx.charge_work(1, Utf16::default())?;
        let Some(index) = get(node, "index").and_then(num) else {
            continue;
        };
        let mut path = Vec::new();
        if let Some(items) = get(node, "path").and_then(arr) {
            for item in items {
                if let Some(item) = units(item) {
                    ctx.charge_work(item.len(), Utf16::default())?;
                    path.push(item);
                }
            }
        }
        let children = get(node, "children").and_then(arr).unwrap_or(&[]);
        let child_ids = children
            .iter()
            .filter_map(|child| get(child, "index").and_then(num))
            .collect();
        out.insert(index, (path, child_ids));
        pending.extend(children.iter());
    }
    Ok(())
}
fn diag(code: &str, path: &str, message: &str, severity: &str) -> Value {
    obj(vec![
        ("code", t(code)),
        ("path", t(path)),
        ("message", t(message)),
        ("severity", t(severity)),
    ])
}
fn residual(path: String, reason: String) -> Value {
    obj(vec![("path", t(&path)), ("reason", t(&reason))])
}
fn classify_shape_impl(
    source: &Value,
    request: &Value,
    shape_only: bool,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let index = get(request, "index")
        .and_then(num)
        .filter(|i| *i > 0)
        .ok_or_else(|| {
            error(
                "PARQUET_CARDINALITY_REQUEST",
                "/request/index",
                "A non-root schema index is required",
            )
        })?;
    let identity = if shape_only {
        None
    } else {
        Some(get(request, "identity").ok_or_else(|| {
            error(
                "PARQUET_CARDINALITY_REQUEST",
                "/request/identity",
                "Identity is required",
            )
        })?)
    };
    let module = identity
        .map(|identity| {
            units(get(identity, "module").ok_or_else(|| {
                error(
                    "PARQUET_CARDINALITY_REQUEST",
                    "/request/identity/module",
                    "Module is required",
                )
            })?)
            .filter(|v| !v.is_empty())
            .ok_or_else(|| {
                error(
                    "PARQUET_CARDINALITY_REQUEST",
                    "/request/identity/module",
                    "Nonempty string module identity required",
                )
            })
        })
        .transpose()?;
    let element = identity
        .map(|identity| {
            units(get(identity, "element").ok_or_else(|| {
                error(
                    "PARQUET_CARDINALITY_REQUEST",
                    "/request/identity/element",
                    "Element is required",
                )
            })?)
            .filter(|v| !v.is_empty())
            .ok_or_else(|| {
                error(
                    "PARQUET_CARDINALITY_REQUEST",
                    "/request/identity/element",
                    "Nonempty string element identity required",
                )
            })
        })
        .transpose()?;
    let profile = text(get(request, "profile").unwrap_or(&Value::Null)).unwrap_or_default();
    let mode = text(get(request, "mode").unwrap_or(&Value::Null)).unwrap_or_default();
    if !matches!(profile.as_str(), "present-value-schema" | "unresolved")
        || !matches!(mode.as_str(), "strict" | "report")
    {
        return Err(error(
            "PARQUET_CARDINALITY_REQUEST",
            "/request",
            "Unsupported profile or mode",
        ));
    }
    let bytes = export_parquet_capture(source, engine, registry, caps, ctx)?;
    let containers = inspect_parquet_containers(source, engine, registry, caps, ctx)?;
    if text(get(&containers, "status").unwrap_or(&Value::Null)).as_deref() != Some("checked") {
        return Err(error(
            "PARQUET_CARDINALITY_STRUCTURE",
            "/schema",
            "Checked Parquet container topology required",
        ));
    }
    let fields_result = get_parquet_field_metadata(source, engine, registry, caps, ctx)?;
    if text(get(&fields_result, "status").unwrap_or(&Value::Null)).as_deref() != Some("checked") {
        return Err(error(
            "PARQUET_CARDINALITY_STRUCTURE",
            "/schema",
            "Checked Parquet field metadata required",
        ));
    }
    let field_rows = arr(get(&fields_result, "fields").ok_or_else(|| {
        error(
            "PARQUET_CARDINALITY_STRUCTURE",
            "/schema",
            "Field metadata is missing",
        )
    })?)
    .unwrap_or(&[]);
    let mut fields = BTreeMap::<usize, &Value>::new();
    for row in field_rows {
        if let Some(i) = get(row, "index").and_then(num) {
            fields.insert(i, row);
        }
    }
    let container_rows = arr(get(&containers, "containers").unwrap_or(&Value::Null)).unwrap_or(&[]);
    let annotations = arr(get(&containers, "annotations").unwrap_or(&Value::Null)).unwrap_or(&[]);
    let mut annotation_map = BTreeMap::<usize, &Value>::new();
    for annotation in annotations {
        if let Some(i) = get(annotation, "index").and_then(num) {
            annotation_map.insert(i, annotation);
        }
    }
    let mut container_map = BTreeMap::<usize, &Value>::new();
    for c in container_rows {
        if let Some(i) = get(c, "index").and_then(num) {
            container_map.insert(i, c);
        }
    }
    let tree = get(&containers, "tree").ok_or_else(|| {
        error(
            "PARQUET_CARDINALITY_STRUCTURE",
            "/schema",
            "Checked schema tree is missing",
        )
    })?;
    let mut nodes_tree = BTreeMap::new();
    recursive_tree(tree, &mut nodes_tree, ctx)?;
    if !nodes_tree.contains_key(&index) || !fields.contains_key(&index) {
        return Err(error(
            "PARQUET_CARDINALITY_INDEX",
            "/schema",
            "Schema index does not exist",
        ));
    }
    let mut wrappers = BTreeSet::new();
    let mut members = BTreeSet::new();
    for c in container_rows {
        let kind = text(get(c, "kind").unwrap_or(&Value::Null)).unwrap_or_default();
        let repeated = get(c, "repeatedIndex").and_then(num);
        if kind == "list" {
            if let Some(e) = get(c, "elementIndex").and_then(num) {
                members.insert(e);
            }
            if let Some(r) = repeated {
                if get(c, "index").and_then(num) != Some(r) {
                    wrappers.insert(r);
                }
            }
        } else {
            if let Some(r) = repeated {
                wrappers.insert(r);
            }
            if let Some(k) = get(c, "keyIndex").and_then(num) {
                members.insert(k);
            }
            if let Some(v) = get(c, "valueIndex").and_then(num) {
                members.insert(v);
            }
        }
    }
    let mut pending = vec![index];
    let mut seen = BTreeSet::new();
    let mut nodes = Vec::new();
    let mut residuals = Vec::new();
    let mut conflict = None::<String>;
    let mut cursor = 0usize;
    while cursor < pending.len() {
        let at = pending[cursor];
        cursor += 1;
        if !seen.insert(at) {
            continue;
        }
        let row = fields[&at];
        let native = match get(row, "nativeField") {
            Some(value) => copy_json(value, ctx)?,
            None => Value::Null,
        };
        let element_data = get(row, "element").unwrap_or(&Value::Null);
        let frag = &native;
        let (fragment_path, children) = nodes_tree.get(&at).cloned().unwrap_or_default();
        let mut shape = "unspecified";
        let mut role = "unresolved";
        let mut nullable = Value::Null;
        let mut node_res = Vec::new();
        let mut item = None;
        let mut record_members = Vec::new();
        let container = container_map.get(&at).copied();
        let loss = |path: String, reason: String| residual(path, reason);
        if wrappers.contains(&at) {
            node_res.push(loss(
                format!("/schema/{at}"),
                "Physical repeated wrapper is not a separate logical value Field".into(),
            ));
        } else {
            let repetition =
                text(get(frag, "repetition_type").unwrap_or(&Value::Null)).unwrap_or_default();
            if repetition == "2" && !members.contains(&at) && container.is_none() {
                node_res.push(loss(format!("/schema/{at}"),"Unannotated repetition requires an explicit legacy interpretation; no scalar or non-null array is inferred".into()));
            } else {
                nullable = Value::Bool(repetition == "1");
                if let Some(c) = container {
                    let kind = text(get(c, "kind").unwrap_or(&Value::Null)).unwrap_or_default();
                    if kind == "list" {
                        shape = "array";
                        role = "array";
                        item = get(c, "elementIndex").and_then(num);
                    } else if let Some(v) = get(c, "valueIndex").and_then(num) {
                        shape = "map";
                        role = "map";
                        item = Some(v);
                        node_res.push(loss(format!("/schema/{at}"), "Native MAP schema does not enforce ideal unique keys; ordered pairs and duplicate-key behavior remain native".into()));
                        if let Some(key_index) = get(c, "keyIndex").and_then(num) {
                            let key = fields.get(&key_index).copied().unwrap_or(&Value::Null);
                            let key_type = text(
                                get(get(key, "element").unwrap_or(&Value::Null), "scalarType")
                                    .unwrap_or(&Value::Null),
                            );
                            let key_annotation = annotation_map
                                .get(&key_index)
                                .copied()
                                .unwrap_or(&Value::Null);
                            if key_type.as_deref() != Some("string")
                                || text(get(key_annotation, "name").unwrap_or(&Value::Null))
                                    .as_deref()
                                    != Some("STRING")
                                || text(get(key_annotation, "validation").unwrap_or(&Value::Null))
                                    .as_deref()
                                    != Some("checked")
                                || has_unknown(
                                    get(key, "nativeField").unwrap_or(&Value::Null),
                                    ctx,
                                )?
                            {
                                node_res.push(loss(format!("/schema/{at}"), "Native map key is not an established exact string carrier; no key coercion is performed".into()));
                            }
                        }
                    } else {
                        node_res.push(loss(format!("/schema/{at}"),"Key-only native MAP has no value role; a map value or list reinterpretation is not invented".into()));
                    }
                } else if get(frag, "type").is_some() {
                    shape = "one";
                    role = "scalar";
                } else if annotation_map.contains_key(&at) {
                    node_res.push(loss(
                        format!("/schema/{at}"),
                        "Annotated group has no established record/container interpretation".into(),
                    ));
                } else {
                    shape = "one";
                    role = "record";
                    record_members = children;
                }
                if annotation_map.get(&at).is_some_and(|annotation| {
                    text(get(annotation, "validation").unwrap_or(&Value::Null)).as_deref()
                        == Some("uninterpreted")
                }) && container.is_none()
                {
                    node_res.push(loss(
                        format!("/schema/{at}"),
                        "Native logical refinement remains uninterpreted".into(),
                    ));
                }
                if has_unknown(frag, ctx)? {
                    node_res.push(loss(
                        format!("/schema/{at}"),
                        "Unknown native schema content remains uninterpreted".into(),
                    ));
                }
                if let Some(i) = item {
                    pending.push(i);
                }
                pending.extend(record_members.iter().copied());
            }
        }
        for r in &node_res {
            residuals.push(obj(vec![
                ("path", get(r, "path").cloned().unwrap_or(Value::Null)),
                ("value", copy_json(&native, ctx)?),
                ("reason", get(r, "reason").cloned().unwrap_or(Value::Null)),
                ("recovery", t(RECOVERY)),
            ]));
        }
        let native_path: Vec<Value> = fragment_path.iter().cloned().map(Value::String).collect();
        let mut fields_out = vec![
            ("index", n(at)),
            ("path", Value::Array(native_path)),
            ("nativeFragment", copy_json(&native, ctx)?),
            ("shape", t(shape)),
            ("role", t(role)),
            ("nativeNullable", nullable),
            ("residuals", Value::Array(node_res)),
        ];
        if let (Some(module), Some(element)) = (&module, &element) {
            fields_out.insert(
                0,
                (
                    "identity",
                    obj(vec![
                        ("module", Value::String(module.clone())),
                        (
                            "element",
                            Value::String(if at == index {
                                element.clone()
                            } else {
                                serialization::stringify_compact_metered(
                                    &Value::Array(vec![Value::String(element.clone()), n(at)]),
                                    ctx,
                                )?
                            }),
                        ),
                    ]),
                ),
            );
        }
        if role == "scalar" {
            if let Some(scalar) = get(element_data, "scalarType") {
                let valid_scalar = text(scalar).is_some_and(|value| {
                    matches!(
                        value.as_str(),
                        "boolean"
                            | "integer"
                            | "decimal"
                            | "float"
                            | "string"
                            | "binary"
                            | "date"
                            | "time"
                            | "timestamp"
                    )
                });
                if valid_scalar {
                    fields_out.push(("scalarType", copy_json(scalar, ctx)?));
                }
            }
        }
        if let Some(i) = item {
            fields_out.push(("itemIndex", n(i)));
        }
        if role == "record" {
            fields_out.push((
                "recordMembers",
                Value::Array(record_members.iter().map(|i| n(*i)).collect()),
            ));
        }
        if let Some(c) = container {
            fields_out.push(("container", copy_json(c, ctx)?));
        }
        nodes.push(obj(fields_out));
    }
    if profile == "unresolved" {
        nodes.truncate(1);
        residuals.clear();
        let row = &mut nodes[0];
        set(row, "shape", t("unspecified"));
        set(row, "role", t("unresolved"));
        set(row, "nativeNullable", Value::Null);
        remove_member(row, "scalarType");
        remove_member(row, "itemIndex");
        remove_member(row, "recordMembers");
        remove_member(row, "container");
        set(row, "residuals", Value::Array(vec![]));
        let unresolved = residual(
            format!("/schema/{index}"),
            "An explicit present-value-schema profile is required; no shape or availability is inferred".into(),
        );
        residuals.push(obj(vec![
            (
                "path",
                get(&unresolved, "path").cloned().unwrap_or(Value::Null),
            ),
            (
                "value",
                copy_json(
                    &get(row, "nativeFragment").cloned().unwrap_or(Value::Null),
                    ctx,
                )?,
            ),
            (
                "reason",
                get(&unresolved, "reason").cloned().unwrap_or(Value::Null),
            ),
            ("recovery", t(RECOVERY)),
        ]));
        if let Some(r) = get_mut_array(row, "residuals") {
            r.push(unresolved);
        }
    }
    if shape_only {
        return nodes.into_iter().next().ok_or_else(|| {
            error(
                "PARQUET_CARDINALITY_STRUCTURE",
                "/schema",
                "Selected shape node is unavailable",
            )
        });
    }
    let module = module.expect("classification identity was validated");
    let element = element.expect("classification identity was validated");
    let cardinality = text(get(&nodes[0], "shape").unwrap_or(&Value::Null))
        .unwrap_or_else(|| "unspecified".into());
    let outcome = if cardinality == "unspecified" {
        "unknown"
    } else if residuals.is_empty() {
        "exact"
    } else {
        "approximated"
    };
    if module == u("parquet") || module == u("parquet.fields") {
        conflict = Some("Logical fields cannot extend native representation modules".into());
    }
    let source_modules = arr(get(source, "modules").unwrap_or(&Value::Null)).unwrap_or(&[]);
    let selected_module = source_modules
        .iter()
        .find(|m| units(get(m, "id").unwrap_or(&Value::Null)).as_ref() == Some(&module));
    let generated_ids: Vec<Utf16> = nodes
        .iter()
        .filter_map(|node| units(get(get(node, "identity")?, "element")?))
        .collect();
    let generated_unique: BTreeSet<Utf16> = generated_ids.iter().cloned().collect();
    if generated_unique.len() != generated_ids.len()
        || selected_module
            .and_then(|m| arr(get(m, "elements").unwrap_or(&Value::Null)))
            .unwrap_or(&[])
            .iter()
            .any(|e| {
                units(get(e, "id").unwrap_or(&Value::Null))
                    .is_some_and(|id| generated_unique.contains(&id))
            })
    {
        conflict = Some("A logical identity collides with existing meaning".into());
    }
    if let Some(v) = get(get(source, "vocabularies").unwrap_or(&Value::Null), EXT) {
        if text(get(v, "version").unwrap_or(&Value::Null)).as_deref() != Some("1.0.0") {
            conflict = Some("Incompatible binding vocabulary".into());
        }
    }
    if let Some(reason) = conflict.clone() {
        residuals.push(obj(vec![
            ("path", t("/modules")),
            ("value", Value::Null),
            ("reason", t(&reason)),
            ("recovery", t(RECOVERY)),
        ]));
    }
    let mut result = obj(vec![
        ("operation", t("classify-parquet-cardinality")),
        ("version", t("1.0.0")),
        ("status", t("classified")),
        ("source", copy_json(source, ctx)?),
        ("request", copy_json(request, ctx)?),
        (
            "binding",
            obj(vec![
                ("id", t(EXT)),
                ("version", t("1.0.0")),
                (
                    "nativeVersion",
                    t("parquet-format@219e3f12a62f9476e830c21e26d030d231f7c017"),
                ),
                ("subset", t(BASIS)),
            ]),
        ),
        (
            "mapping",
            obj(vec![
                ("origin", t("classified")),
                ("cardinality", t(&cardinality)),
                ("outcome", t(outcome)),
                ("basis", t(BASIS)),
                ("nodes", Value::Array(nodes)),
            ]),
        ),
        ("residuals", Value::Array(residuals.clone())),
        ("diagnostics", Value::Array(vec![])),
    ]);
    if conflict.is_some() {
        if let Some(mapping) = get_mut(&mut result, "mapping") {
            set(mapping, "outcome", t("unknown"));
        }
    }
    let blocked = conflict.is_some() || mode == "strict" && !residuals.is_empty();
    if blocked {
        set(&mut result, "status", t("blocked"));
    } else {
        let mut target = copy_json(source, ctx)?;
        let modules = get_mut_array(&mut target, "modules").ok_or_else(|| {
            error(
                "PARQUET_CARDINALITY_TARGET",
                "/modules",
                "Module inventory is missing",
            )
        })?;
        let mi = modules
            .iter()
            .position(|m| units(get(m, "id").unwrap_or(&Value::Null)).as_ref() == Some(&module));
        let dest = if let Some(mi) = mi {
            get_mut_array(&mut modules[mi], "elements").ok_or_else(|| {
                error(
                    "PARQUET_CARDINALITY_TARGET",
                    "/modules",
                    "Target elements are missing",
                )
            })?
        } else {
            modules.push(obj(vec![
                ("id", Value::String(module.clone())),
                ("namespace", t("")),
                ("elements", Value::Array(vec![])),
            ]));
            get_mut_array(modules.last_mut().unwrap(), "elements").unwrap()
        };
        for node in arr(get(get(&result, "mapping").unwrap(), "nodes").unwrap()).unwrap() {
            let id = units(get(get(node, "identity").unwrap(), "element").unwrap()).unwrap();
            let path = arr(get(node, "path").unwrap()).unwrap();
            let name = units(path.last().unwrap()).unwrap_or_default();
            let mut element_out = vec![
                ("id", Value::String(id)),
                ("name", Value::String(name)),
                ("kind", t("field")),
                (
                    "cardinality",
                    get(node, "shape").cloned().unwrap_or(Value::Null),
                ),
                (
                    "extensions",
                    obj(vec![(
                        EXT,
                        obj(vec![
                            ("origin", t("classified")),
                            (
                                "binding",
                                obj(vec![("id", t(EXT)), ("version", t("1.0.0"))]),
                            ),
                            ("profile", t(&profile)),
                            ("basis", t(BASIS)),
                            ("node", copy_json(node, ctx)?),
                        ]),
                    )]),
                ),
            ];
            if let Some(s) = get(node, "scalarType") {
                element_out.push(("scalarType", copy_json(s, ctx)?));
            }
            if let Some(i) = get(node, "itemIndex").and_then(num) {
                let it = arr(get(&result, "mapping")
                    .and_then(|m| get(m, "nodes"))
                    .unwrap())
                .unwrap()
                .iter()
                .find(|n| get(n, "index").and_then(num) == Some(i));
                if let Some(it) = it {
                    element_out.push((
                        "itemType",
                        obj(vec![
                            ("module", Value::String(module.clone())),
                            (
                                "element",
                                get(get(it, "identity").unwrap(), "element")
                                    .cloned()
                                    .unwrap(),
                            ),
                        ]),
                    ));
                }
            }
            dest.push(obj(element_out));
        }
        if get_mut(&mut target, "vocabularies").is_some() {
            let vocab = get_mut(&mut target, "vocabularies").unwrap();
            set(vocab, EXT, obj(vec![("version", t("1.0.0"))]));
        }
        let checked = engine.validate_document(&target, registry, caps, ctx)?;
        if !checked.valid {
            return Err(error(
                "PARQUET_CARDINALITY_TARGET",
                "/target",
                "Invalid logical candidate",
            ));
        }
        let after = export_parquet_capture(&target, engine, registry, caps, ctx)?;
        if bytes != after {
            return Err(error(
                "PARQUET_CARDINALITY_NATIVE",
                "/target",
                "Native archive changed",
            ));
        }
        if let Value::Object(m) = &mut result {
            m.push((u("target"), target));
        }
    }
    let diagnostics = residuals
        .iter()
        .map(|r| {
            diag(
                "PARQUET_CARDINALITY_RESIDUAL",
                &text(get(r, "path").unwrap_or(&Value::Null)).unwrap_or_default(),
                &text(get(r, "reason").unwrap_or(&Value::Null)).unwrap_or_default(),
                if blocked { "error" } else { "warning" },
            )
        })
        .collect();
    set(&mut result, "diagnostics", Value::Array(diagnostics));
    valid_result(&result, engine, ctx)
}
fn remove_member(v: &mut Value, k: &str) {
    if let Value::Object(m) = v {
        m.retain(|(name, _)| name != &u(k));
    }
}
fn get_mut_array<'a>(v: &'a mut Value, k: &str) -> Option<&'a mut Vec<Value>> {
    match get_mut(v, k)? {
        Value::Array(a) => Some(a),
        _ => None,
    }
}
fn get_mut<'a>(v: &'a mut Value, k: &str) -> Option<&'a mut Value> {
    if let Value::Object(m) = v {
        m.iter_mut().find(|(x, _)| x == &u(k)).map(|(_, v)| v)
    } else {
        None
    }
}
fn verify(
    input: &Value,
    current: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let receipt = copy_json(input, ctx)?;
    if text(get(&receipt, "status").unwrap_or(&Value::Null)).as_deref() != Some("classified") {
        return Err(error(
            "PARQUET_CARDINALITY_RECEIPT",
            "",
            "Complete classified receipt required",
        ));
    }
    let expected = classify_shape(
        get(&receipt, "source").ok_or_else(|| {
            error(
                "PARQUET_CARDINALITY_RECEIPT",
                "/source",
                "Retained source is required",
            )
        })?,
        get(&receipt, "request").ok_or_else(|| {
            error(
                "PARQUET_CARDINALITY_RECEIPT",
                "/request",
                "Retained request is required",
            )
        })?,
        engine,
        registry,
        caps,
        ctx,
    )?;
    if canonical(&receipt, ctx)? != canonical(&expected, ctx)? {
        return Err(error(
            "PARQUET_CARDINALITY_RECEIPT",
            "",
            "Receipt differs from retained source and request",
        ));
    }
    if canonical(current, ctx)? != canonical(get(&receipt, "target").unwrap_or(&Value::Null), ctx)?
    {
        return Err(error(
            "PARQUET_CARDINALITY_STALE",
            "/target",
            "Current target changed",
        ));
    }
    Ok(receipt)
}
/// Inspect one native schema node with the same checked container, wrapper,
/// record and child traversal used by cardinality classification. Facet
/// classifiers reuse this observer so shape semantics cannot drift.
pub fn inspect_shape_node(
    source: &Value,
    index: usize,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let request = obj(vec![
        ("index", n(index)),
        ("profile", t("present-value-schema")),
        ("mode", t("report")),
    ]);
    classify_shape_impl(source, &request, true, engine, registry, caps, ctx)
}
fn classify_shape(
    source: &Value,
    request: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    classify_shape_impl(source, request, false, engine, registry, caps, ctx)
}

pub fn classify(
    source: &Value,
    request: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    classify_shape(source, request, engine, registry, caps, ctx)
}
pub fn verify_classification(
    receipt: &Value,
    current: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    verify(receipt, current, engine, registry, caps, ctx)
}
pub fn recover_bytes(
    receipt: &Value,
    current: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Vec<u8>, EngineError> {
    let r = verify(receipt, current, engine, registry, caps, ctx)?;
    export_parquet_capture(get(&r, "source").unwrap(), engine, registry, caps, ctx)
}
