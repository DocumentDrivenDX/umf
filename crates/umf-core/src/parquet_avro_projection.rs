// SPDX-License-Identifier: MIT OR Apache-2.0
//! Bounded Parquet physical-schema to Avro record projection.
use crate::{
    avro_document,
    context::Context,
    engine::Capabilities,
    engine::Engine,
    error::EngineError,
    parquet_capture_inspection::{export_parquet_capture, inspect_parquet_containers},
    registry::Registry,
    serialization::{self, Format},
    value::{copy_json, Utf16, Value},
};
use base64::{engine::general_purpose::STANDARD, Engine as _};

fn key(name: &str) -> Utf16 {
    Utf16::from(name)
}
fn field<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    let Value::Object(fields) = value else {
        return None;
    };
    fields
        .iter()
        .find(|(candidate, _)| candidate == &key(name))
        .map(|(_, value)| value)
}
fn string(value: &str) -> Value {
    Value::string_utf8(value)
}
fn text(value: Option<&Value>) -> Option<&Utf16> {
    if let Some(Value::String(value)) = value {
        Some(value)
    } else {
        None
    }
}
fn array(value: Option<&Value>) -> Option<&[Value]> {
    if let Some(Value::Array(values)) = value {
        Some(values)
    } else {
        None
    }
}
fn object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(name, value)| (key(name), value))
            .collect(),
    )
}
fn error(code: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}
fn number(value: Option<&Value>) -> Option<f64> {
    match value {
        Some(Value::Number(n)) => Some(*n),
        Some(Value::String(s)) => s.to_utf8().ok()?.parse().ok(),
        _ => None,
    }
}
fn integer(value: Option<&Value>) -> Option<i64> {
    let n = number(value)?;
    if n.is_finite() && n.fract() == 0.0 && n.abs() <= 9007199254740991.0 {
        Some(n as i64)
    } else {
        None
    }
}
fn bool_value(value: Option<&Value>) -> Option<bool> {
    match value {
        Some(Value::Bool(v)) => Some(*v),
        _ => None,
    }
}
fn ascii_alpha(unit: u16) -> bool {
    (65..=90).contains(&unit) || (97..=122).contains(&unit)
}
fn ascii_digit(unit: u16) -> bool {
    (48..=57).contains(&unit)
}
fn ident(value: &Utf16) -> bool {
    let units = value.units();
    !units.is_empty()
        && (ascii_alpha(units[0]) || units[0] == 95)
        && units[1..]
            .iter()
            .all(|u| ascii_alpha(*u) || ascii_digit(*u) || *u == 95)
}
fn issue(path: Utf16, code: &str, class: &str, detail: &str) -> Value {
    object(vec![
        ("path", Value::String(path)),
        ("code", string(code)),
        ("classification", string(class)),
        ("detail", string(detail)),
        ("retainedInSource", Value::Bool(true)),
    ])
}
fn push(issues: &mut Vec<Value>, path: Utf16, code: &str, class: &str, detail: &str) {
    issues.push(issue(path, code, class, detail));
}
fn unknown(value: &Value) -> bool {
    match value {
        Value::Object(fields) => {
            fields.iter().any(|(name, item)| {
                name == &key("$unknown") && matches!(item,Value::Array(items)if !items.is_empty())
            }) || fields.iter().any(|(_, item)| unknown(item))
        }
        Value::Array(items) => items.iter().any(unknown),
        _ => false,
    }
}
fn is_decimal_digits(value: &Utf16) -> bool {
    !value.is_empty() && value.units().iter().all(|u| ascii_digit(*u))
}

#[derive(Clone)]
struct Policy {
    id: Utf16,
    record_name: Utf16,
    namespace: Utf16,
    field_names: Value,
    loss: Utf16,
    value: Value,
}
fn policy(input: &Value, ctx: &mut Context<'_>) -> Result<Policy, EngineError> {
    let value = copy_json(input, ctx)?;
    let Value::Object(fields) = &value else {
        return Err(error("PARQUET_AVRO_POLICY","Expected valid Avro names, schema-index field overrides, entry-arrays map binding and loss policy"));
    };
    if fields.iter().any(|(name, _)| {
        ![
            "id",
            "recordName",
            "namespace",
            "fieldNames",
            "maps",
            "lossPolicy",
        ]
        .iter()
        .any(|known| name == &key(known))
    }) {
        return Err(error("PARQUET_AVRO_POLICY","Expected valid Avro names, schema-index field overrides, entry-arrays map binding and loss policy"));
    }
    let id = text(field(&value, "id")).filter(|v| !v.is_empty()).cloned();
    let record = text(field(&value, "recordName"))
        .filter(|v| ident(v))
        .cloned();
    let namespace = text(field(&value, "namespace")).cloned();
    let fields_map = field(&value, "fieldNames");
    let namespace_ok = namespace.as_ref().is_some_and(|ns| {
        !ns.is_empty()
            && ns
                .units()
                .split(|unit| *unit == b'.' as u16)
                .all(|part| !part.is_empty() && ident(&Utf16::new(part.to_vec())))
    });
    let overrides_ok = matches!(fields_map,Some(Value::Object(map))if map.iter().all(|(name,value)|is_decimal_digits(name)&&name.units().first()!=Some(&(b'0' as u16))&&text(Some(value)).is_some_and(ident)));
    if id.is_none()
        || record.is_none()
        || !namespace_ok
        || !overrides_ok
        || text(field(&value, "maps")) != Some(&key("entry-arrays"))
        || !matches!(text(field(&value,"lossPolicy")),Some(v)if v==&key("strict")||v==&key("allow-reported-loss"))
    {
        return Err(error("PARQUET_AVRO_POLICY","Expected valid Avro names, schema-index field overrides, entry-arrays map binding and loss policy"));
    }
    let id = id.unwrap();
    let record_name = record.unwrap();
    let namespace = namespace.unwrap();
    let field_names = fields_map.unwrap().clone();
    let loss = text(field(&value, "lossPolicy")).unwrap().clone();
    ctx.charge_text(
        id.len() + record_name.len() + namespace.len(),
        Utf16::default(),
    )?;
    Ok(Policy {
        id,
        record_name,
        namespace,
        field_names,
        loss,
        value,
    })
}
fn path(schema_index: usize) -> Utf16 {
    Utf16::from(format!("/schema/{schema_index}"))
}
fn derived_name(record: &Utf16, role: &str, index: usize) -> Utf16 {
    let mut units = record.units().to_vec();
    units.extend(role.encode_utf16());
    units.extend(index.to_string().encode_utf16());
    Utf16::new(units)
}
fn set_property(fields: &mut Vec<(Utf16, Value)>, name: &str, value: Value) {
    fields.push((key(name), value));
}
fn mapping(index: usize, path: &Value) -> Value {
    object(vec![
        ("index", Value::Number(index as f64)),
        ("path", path.clone()),
    ])
}
fn path_string(node: &Value) -> Vec<Utf16> {
    array(field(node, "path"))
        .unwrap_or(&[])
        .iter()
        .filter_map(|v| text(Some(v)).cloned())
        .collect()
}
fn path_value(path: &[Utf16]) -> Value {
    Value::Array(path.iter().cloned().map(Value::String).collect())
}
fn child_path(parent: &[Utf16], name: &Utf16) -> Vec<Utf16> {
    let mut path = parent.to_vec();
    path.push(name.clone());
    path
}
fn index_of(value: Option<&Value>) -> Option<usize> {
    integer(value).filter(|n| *n >= 0).map(|n| n as usize)
}
fn by_index<'a>(items: &'a [Value], index: usize) -> Option<&'a Value> {
    items.get(index)
}
fn entries(value: Option<&Value>) -> Option<&[(Utf16, Value)]> {
    if let Some(Value::Object(fields)) = value {
        Some(fields)
    } else {
        None
    }
}
fn schema_entry<'a>(schema: &'a [Value], index: usize) -> Option<&'a Value> {
    schema.get(index)
}
fn map_entry<'a>(value: Option<&'a Value>, key_name: &str) -> Option<&'a Value> {
    field(value?, key_name)
}

/// Translate source Parquet schema observations. It never decodes page data.
pub fn project_parquet_to_avro(
    source: &Value,
    policy_input: &Value,
    engine: &Engine,
    registry: &Registry,
    capabilities: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let policy = policy(policy_input, ctx)?;
    export_parquet_capture(source, engine, registry, capabilities, ctx)?;
    let inspected = inspect_parquet_containers(source, engine, registry, capabilities, ctx)?;
    let source_copy = copy_json(source, ctx)?;
    let mut result = object(vec![
        ("status", string("blocked")),
        ("source", source_copy),
        ("policy", policy.value.clone()),
        ("issues", Value::Array(Vec::new())),
        ("mappings", Value::Array(Vec::new())),
    ]);
    let mut issues = Vec::new();
    let mut fatal = false;
    if let Some(Value::Array(diagnostics)) = field(&inspected, "diagnostics") {
        for d in diagnostics {
            issues.push(issue(
                text(field(d, "path")).cloned().unwrap_or_default(),
                text(field(d, "code"))
                    .and_then(|x| x.to_utf8().ok())
                    .as_deref()
                    .unwrap_or("PARQUET_SOURCE"),
                "not-enforced",
                text(field(d, "message"))
                    .and_then(|x| x.to_utf8().ok())
                    .as_deref()
                    .unwrap_or("Parquet inspection diagnostic"),
            ));
        }
    }
    if text(field(&inspected, "status")) != Some(&key("checked"))
        || field(&inspected, "tree").is_none()
    {
        set(&mut result, "issues", Value::Array(issues));
        return Ok(result);
    }
    // Embedded Arrow is parsed from its single canonical IPC schema message; its independent meaning stays source-owned.
    fatal = append_embedded_arrow_issues(&inspected, &mut issues, ctx)?;
    let metadata = field(&inspected, "metadata")
        .ok_or_else(|| error("PARQUET_AVRO_SOURCE", "Parquet metadata unavailable"))?;
    let schema = array(field(metadata, "schema"))
        .ok_or_else(|| error("PARQUET_AVRO_SOURCE", "Parquet schema unavailable"))?;
    let annotations = array(field(&inspected, "annotations")).unwrap_or(&[]);
    let containers = array(field(&inspected, "containers")).unwrap_or(&[]);
    let tree = field(&inspected, "tree").unwrap();
    let mut nodes = Vec::new();
    collect_nodes(tree, &mut nodes);
    for (index, entry) in schema.iter().enumerate() {
        if unknown(entry) {
            fatal = true;
            push(
                &mut issues,
                path(index),
                "PARQUET_AVRO_UNSUPPORTED",
                "unsupported",
                "Unknown schema wire content prevents safe lowering, including container wrappers",
            );
        }
    }
    push(&mut issues,Utf16::default(),"SCHEMA_ONLY","representation-change","Schema lowering only: page encodings, column metadata, statistics, field IDs, sort order, unknown metadata and stored values remain in the source; a separate encoder is required");
    let mut used = std::collections::BTreeSet::<Utf16>::new();
    let mut mappings = Vec::new();
    let fields = lower_fields(
        array(field(tree, "children")).unwrap_or(&[]),
        schema,
        annotations,
        containers,
        &nodes,
        &policy,
        &mut used,
        &mut mappings,
        &mut issues,
        &mut fatal,
        ctx,
    )?;
    if unknown(schema.first().unwrap_or(&Value::Null)) || find_indexed(annotations, 0).is_some() {
        fatal = true;
        push(
            &mut issues,
            path(0),
            "PARQUET_AVRO_UNSUPPORTED",
            "unsupported",
            "Annotated or unknown root schema cannot be lowered",
        );
    }
    if let Some(overrides) = entries(Some(&policy.field_names)) {
        for (name, _) in overrides {
            if !used.contains(name) {
                fatal = true;
                push(
                    &mut issues,
                    path(index_of(Some(&Value::String(name.clone()))).unwrap_or(0)),
                    "PARQUET_AVRO_UNSUPPORTED",
                    "unsupported",
                    "Field-name override does not identify an emitted record field",
                );
            }
        }
    }
    set(&mut result, "issues", Value::Array(issues.clone()));
    set(&mut result, "mappings", Value::Array(mappings));
    if fatal || policy.loss == key("strict") && !issues.is_empty() {
        return Ok(result);
    }
    let native_schema = object(vec![
        ("type", string("record")),
        ("name", Value::String(policy.record_name.clone())),
        ("namespace", Value::String(policy.namespace.clone())),
        ("fields", Value::Array(fields)),
    ]);
    let serialized = serialization::write_json_value(&native_schema, Format::Json, ctx)?;
    let target = avro_document::import_schema(&policy.id, serialized.units(), &[], ctx)?;
    set(&mut result, "status", string("projected"));
    set(&mut result, "nativeSchema", Value::String(serialized));
    set(&mut result, "target", target);
    Ok(result)
}
fn set(value: &mut Value, name: &str, item: Value) {
    if let Value::Object(fields) = value {
        if let Some((_, old)) = fields.iter_mut().find(|(k, _)| k == &key(name)) {
            *old = item
        } else {
            fields.push((key(name), item));
        }
    }
}
fn collect_nodes<'a>(node: &'a Value, output: &mut Vec<&'a Value>) {
    output.push(node);
    if let Some(children) = array(field(node, "children")) {
        for child in children {
            collect_nodes(child, output)
        }
    }
}
fn find_indexed<'a>(values: &'a [Value], index: usize) -> Option<&'a Value> {
    values
        .iter()
        .find(|v| index_of(field(v, "index")) == Some(index))
}
fn lower_fields(
    children: &[Value],
    schema: &[Value],
    annotations: &[Value],
    containers: &[Value],
    nodes: &[&Value],
    policy: &Policy,
    used: &mut std::collections::BTreeSet<Utf16>,
    mappings: &mut Vec<Value>,
    issues: &mut Vec<Value>,
    fatal: &mut bool,
    ctx: &mut Context<'_>,
) -> Result<Vec<Value>, EngineError> {
    let mut names = std::collections::BTreeSet::new();
    let mut output = Vec::new();
    for node in children {
        ctx.charge_work(1, Utf16::default())?;
        let index = index_of(field(node, "index"))
            .ok_or_else(|| error("PARQUET_AVRO_SOURCE", "Parquet tree node lacks an index"))?;
        let native_name = text(field(node, "name")).cloned().unwrap_or_default();
        let override_key = Utf16::from(index.to_string());
        let name = if let Some(value) = field(&policy.field_names, &index.to_string()) {
            used.insert(override_key);
            push(issues,path(index),"FIELD_RENAMED","representation-change","Explicit Avro field name differs from native name or confirms the selected spelling");
            text(Some(value)).cloned().unwrap_or_default()
        } else {
            native_name
        };
        if !ident(&name) {
            *fatal = true;
            push(
                issues,
                path(index),
                "PARQUET_AVRO_UNSUPPORTED",
                "unsupported",
                "Native name is not an Avro identifier; provide a schema-index override",
            );
        }
        if !names.insert(name.clone()) {
            *fatal = true;
            push(
                issues,
                path(index),
                "PARQUET_AVRO_UNSUPPORTED",
                "unsupported",
                "Duplicate target field names",
            );
        }
        let ty = lower_node(
            node,
            schema,
            annotations,
            containers,
            nodes,
            policy,
            used,
            mappings,
            issues,
            fatal,
            ctx,
            false,
        )?;
        output.push(object(vec![("name", Value::String(name)), ("type", ty)]));
    }
    Ok(output)
}
fn lower_node(
    node: &Value,
    schema: &[Value],
    annotations: &[Value],
    containers: &[Value],
    nodes: &[&Value],
    policy: &Policy,
    used: &mut std::collections::BTreeSet<Utf16>,
    mappings: &mut Vec<Value>,
    issues: &mut Vec<Value>,
    fatal: &mut bool,
    ctx: &mut Context<'_>,
    ignore_repetition: bool,
) -> Result<Value, EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    let index = index_of(field(node, "index"))
        .ok_or_else(|| error("PARQUET_AVRO_SOURCE", "Parquet tree node lacks an index"))?;
    let entry = schema_entry(schema, index)
        .ok_or_else(|| error("PARQUET_AVRO_SOURCE", "Schema index is outside metadata"))?;
    let annotation = find_indexed(annotations, index);
    let container = find_indexed(containers, index);
    let path = path(index);
    let native_path = path_value(&path_string(node));
    mappings.push(mapping(index, &native_path));
    if unknown(entry) {
        *fatal = true;
        push(
            issues,
            path.clone(),
            "PARQUET_AVRO_UNSUPPORTED",
            "unsupported",
            "Unknown schema wire content prevents safe lowering",
        );
        return Ok(string("null"));
    }
    let mut target = if let Some(container) = container {
        match text(field(container, "kind")) {
            Some(value) if value == &key("list") => {
                let element = index_of(field(container, "elementIndex")).and_then(|i| {
                    nodes
                        .iter()
                        .find(|n| index_of(field(n, "index")) == Some(i))
                        .copied()
                });
                let Some(element) = element else {
                    *fatal = true;
                    push(
                        issues,
                        path.clone(),
                        "PARQUET_AVRO_UNSUPPORTED",
                        "unsupported",
                        "List element is absent from the Parquet tree",
                    );
                    return Ok(string("null"));
                };
                let layout = text(field(container, "layout"));
                let ignore = layout == Some(&key("two-level"));
                push(issues,path.clone(),"LIST_LAYOUT","representation-change","Native LIST wrappers and repetition levels lower to an Avro array; source layout remains in the capture");
                object(vec![
                    ("type", string("array")),
                    (
                        "items",
                        lower_node(
                            element,
                            schema,
                            annotations,
                            containers,
                            nodes,
                            policy,
                            used,
                            mappings,
                            issues,
                            fatal,
                            ctx,
                            ignore,
                        )?,
                    ),
                ])
            }
            Some(value) if value == &key("map") => {
                let key_index = index_of(field(container, "keyIndex"));
                let key_node = key_index.and_then(|i| {
                    nodes
                        .iter()
                        .find(|n| index_of(field(n, "index")) == Some(i))
                        .copied()
                });
                let value_index = index_of(field(container, "valueIndex"));
                let value_node = value_index.and_then(|i| {
                    nodes
                        .iter()
                        .find(|n| index_of(field(n, "index")) == Some(i))
                        .copied()
                });
                let (Some(key_node), Some(key_index)) = (key_node, key_index) else {
                    *fatal = true;
                    push(
                        issues,
                        path.clone(),
                        "PARQUET_AVRO_UNSUPPORTED",
                        "unsupported",
                        "Map key is absent from the Parquet tree",
                    );
                    return Ok(string("null"));
                };
                let key_type = lower_node(
                    key_node,
                    schema,
                    annotations,
                    containers,
                    nodes,
                    policy,
                    used,
                    mappings,
                    issues,
                    fatal,
                    ctx,
                    true,
                )?;
                let value_type = if let (Some(n), Some(_)) = (value_node, value_index) {
                    lower_node(
                        n,
                        schema,
                        annotations,
                        containers,
                        nodes,
                        policy,
                        used,
                        mappings,
                        issues,
                        fatal,
                        ctx,
                        true,
                    )?
                } else {
                    string("null")
                };
                let _ = key_index;
                push(issues,path.clone(),"MAP_ENTRY_ARRAY","representation-change","Explicit ordered key/value entry array supports non-string keys and retains duplicates; Parquet last-value map semantics and key equality require a separate consumer");
                object(vec![
                    ("type", string("array")),
                    (
                        "items",
                        object(vec![
                            ("type", string("record")),
                            (
                                "name",
                                Value::String(derived_name(&policy.record_name, "_entry_", index)),
                            ),
                            (
                                "fields",
                                Value::Array(vec![
                                    object(vec![("name", string("key")), ("type", key_type)]),
                                    object(vec![("name", string("value")), ("type", value_type)]),
                                ]),
                            ),
                        ]),
                    ),
                ])
            }
            _ => {
                *fatal = true;
                push(
                    issues,
                    path.clone(),
                    "PARQUET_AVRO_UNSUPPORTED",
                    "unsupported",
                    "Unknown Parquet container kind",
                );
                string("null")
            }
        }
    } else {
        let physical = text(field(entry, "type"));
        if physical.is_none() {
            if annotation.is_some() {
                *fatal = true;
                push(
                    issues,
                    path.clone(),
                    "PARQUET_AVRO_UNSUPPORTED",
                    "unsupported",
                    "Unmapped annotated group",
                );
                string("null")
            } else {
                let child_fields = lower_fields(
                    array(field(node, "children")).unwrap_or(&[]),
                    schema,
                    annotations,
                    containers,
                    nodes,
                    policy,
                    used,
                    mappings,
                    issues,
                    fatal,
                    ctx,
                )?;
                object(vec![
                    ("type", string("record")),
                    (
                        "name",
                        Value::String(derived_name(&policy.record_name, "_record_", index)),
                    ),
                    ("fields", Value::Array(child_fields)),
                ])
            }
        } else if let Some(annotation) = annotation {
            let name = text(field(annotation, "name"))
                .and_then(|n| n.to_utf8().ok())
                .unwrap_or_default();
            if text(field(annotation, "validation")) != Some(&key("checked")) {
                *fatal = true;
                push(
                    issues,
                    path.clone(),
                    "PARQUET_AVRO_UNSUPPORTED",
                    "unsupported",
                    "Uninterpreted logical annotation",
                );
                string("null")
            } else {
                annotation_target(
                    &name,
                    field(annotation, "parameters"),
                    physical.unwrap(),
                    index,
                    policy,
                    issues,
                    fatal,
                )
            }
        } else {
            match physical.and_then(|s| s.to_utf8().ok()).as_deref() {
                Some("0") => string("boolean"),
                Some("1") => string("int"),
                Some("2") => string("long"),
                Some("4") => string("float"),
                Some("5") => string("double"),
                Some("6") => string("bytes"),
                Some("7") => {
                    let size = number(field(entry, "type_length")).unwrap_or(f64::NAN);
                    if !size.is_finite() || size.fract() != 0.0 || size < 1.0 || size > 4096.0 {
                        *fatal = true;
                        push(
                            issues,
                            path.clone(),
                            "PARQUET_AVRO_UNSUPPORTED",
                            "unsupported",
                            "Fixed size exceeds current 1–4096 projection bound",
                        );
                        string("null")
                    } else {
                        object(vec![
                            ("type", string("fixed")),
                            (
                                "name",
                                Value::String(derived_name(&policy.record_name, "_fixed_", index)),
                            ),
                            ("size", Value::Number(size)),
                        ])
                    }
                }
                _ => {
                    *fatal = true;
                    push(
                        issues,
                        path.clone(),
                        "PARQUET_AVRO_UNSUPPORTED",
                        "unsupported",
                        "Physical type has no portable mapping (including INT96)",
                    );
                    string("null")
                }
            }
        }
    };
    if !ignore_repetition {
        match text(field(entry, "repetition_type")) {
            Some(value) if value == &key("1") => {
                target = Value::Array(vec![string("null"), target])
            }
            Some(value) if value == &key("2") => {
                target = object(vec![("type", string("array")), ("items", target)]);
                push(
                    issues,
                    path,
                    "REPEATED_ARRAY",
                    "representation-change",
                    "Unannotated repeated field lowers to an array of non-null items",
                );
            }
            _ => {}
        }
    }
    let _ = ctx;
    Ok(target)
}
fn annotation_target(
    name: &str,
    params: Option<&Value>,
    physical: &Utf16,
    index: usize,
    policy: &Policy,
    issues: &mut Vec<Value>,
    fatal: &mut bool,
) -> Value {
    let path = path(index);
    match name {
        "STRING" | "ENUM" | "JSON" => {
            if name != "STRING" {
                push(
                    issues,
                    path,
                    "TEXT_LOGICAL_CONSTRAINT",
                    "not-enforced",
                    "Avro string does not enforce native enumeration or JSON interpretation",
                );
            }
            string("string")
        }
        "BSON" => {
            push(
                issues,
                path,
                "BSON_VALIDATION",
                "not-enforced",
                "BSON interpretation is not enforced by Avro bytes",
            );
            string("bytes")
        }
        "INTEGER" => {
            let width =
                number(field(params.unwrap_or(&Value::Null), "bitWidth")).unwrap_or(f64::NAN);
            let signed =
                bool_value(field(params.unwrap_or(&Value::Null), "isSigned")).unwrap_or(false);
            let result = if signed {
                if width <= 32.0 {
                    string("int")
                } else {
                    string("long")
                }
            } else if width < 32.0 {
                string("int")
            } else if width == 32.0 {
                string("long")
            } else {
                object(vec![
                    ("type", string("bytes")),
                    ("logicalType", string("decimal")),
                    ("precision", Value::Number(20.0)),
                    ("scale", Value::Number(0.0)),
                ])
            };
            if !signed || width < 32.0 {
                push(issues,path,"INTEGER_DOMAIN","not-enforced","Target admits values outside native signed/unsigned width; uint64 requires exact decimal encoding");
            }
            result
        }
        "DECIMAL" => {
            let p = number(field(params.unwrap_or(&Value::Null), "precision")).unwrap_or(f64::NAN);
            let s = number(field(params.unwrap_or(&Value::Null), "scale")).unwrap_or(f64::NAN);
            if !p.is_finite() || p.fract() != 0.0 || p < 1.0 || p > 1000.0 {
                *fatal = true;
                push(
                    issues,
                    path,
                    "PARQUET_AVRO_UNSUPPORTED",
                    "unsupported",
                    "Decimal precision exceeds current 1–1000 projection bound",
                );
                string("null")
            } else {
                push(issues,path,"DECIMAL_CARRIER","representation-change","Physical integer or fixed/variable decimal carrier requires exact Avro decimal bytes encoding");
                object(vec![
                    ("type", string("bytes")),
                    ("logicalType", string("decimal")),
                    ("precision", Value::Number(p)),
                    ("scale", Value::Number(s)),
                ])
            }
        }
        "DATE" => object(vec![
            ("type", string("int")),
            ("logicalType", string("date")),
        ]),
        "TIME" | "TIMESTAMP" => {
            let Some(unit) = enum_name(field(params.unwrap_or(&Value::Null), "unit"))
                .filter(|unit| ["MILLIS", "MICROS", "NANOS"].contains(&unit.as_str()))
            else {
                *fatal = true;
                push(
                    issues,
                    path,
                    "PARQUET_AVRO_UNSUPPORTED",
                    "unsupported",
                    "Temporal unit is not interpreted",
                );
                return string("null");
            };
            let suffix = match unit.as_str() {
                "MILLIS" => "millis",
                "MICROS" => "micros",
                "NANOS" => "nanos",
                _ => "millis",
            };
            let adjusted = bool_value(field(params.unwrap_or(&Value::Null), "isAdjustedToUTC"))
                .unwrap_or(false);
            let result = if name == "TIME" && unit == "NANOS" {
                string("long")
            } else {
                object(vec![
                    (
                        "type",
                        string(if name == "TIME" && unit == "MILLIS" {
                            "int"
                        } else {
                            "long"
                        }),
                    ),
                    (
                        "logicalType",
                        string(&format!(
                            "{}-{}",
                            if name == "TIME" {
                                "time"
                            } else if adjusted {
                                "timestamp"
                            } else {
                                "local-timestamp"
                            },
                            suffix
                        )),
                    ),
                ])
            };
            if name == "TIME" && unit == "NANOS" {
                push(issues,path.clone(),"TIME_NANOS","representation-change","Avro has no time-nanos logical type: long retains nanoseconds with unit and time-of-day bounds remaining in source");
            }
            push(issues,path,"TEMPORAL_INTERPRETATION","not-enforced","Native UTC-adjustment, time-of-day bounds and target runtime range/annotation support require a value encoder; no units are rounded");
            result
        }
        "UUID" => {
            push(issues,path.clone(),"UUID_RUNTIME_SUPPORT","not-enforced","Avro 1.12 permits fixed UUID, but some runtimes interpret only string UUID; verify the selected consumer");
            object(vec![
                ("type", string("fixed")),
                (
                    "name",
                    Value::String(derived_name(&policy.record_name, "_fixed_", index)),
                ),
                ("size", Value::Number(16.0)),
                ("logicalType", string("uuid")),
            ])
        }
        "FLOAT16" => {
            push(issues,path,"FLOAT16_WIDTH","representation-change","Half-float bytes require decoding; Avro float widens the value domain and does not preserve NaN payload bits");
            string("float")
        }
        "INTERVAL" => {
            push(issues,path.clone(),"INTERVAL_MEANING","not-enforced","Raw 12-byte carrier retains native components; interval interpretation and arithmetic remain in source");
            object(vec![
                ("type", string("fixed")),
                (
                    "name",
                    Value::String(derived_name(&policy.record_name, "_fixed_", index)),
                ),
                ("size", Value::Number(12.0)),
            ])
        }
        _ => {
            let _ = physical;
            *fatal = true;
            push(
                issues,
                path,
                "PARQUET_AVRO_UNSUPPORTED",
                "unsupported",
                "Logical annotation has no implemented target mapping",
            );
            string("null")
        }
    }
}
fn enum_name(value: Option<&Value>) -> Option<String> {
    match value {
        Some(Value::String(s)) => s.to_utf8().ok(),
        Some(Value::Object(fields)) => fields
            .iter()
            .find(|(k, _)| k != &key("$unknown"))
            .and_then(|(k, _)| k.to_utf8().ok()),
        _ => None,
    }
}
#[derive(Clone)]
struct ArrowField {
    name: Utf16,
    type_name: Option<String>,
    timezone: Option<String>,
    unit: Option<String>,
    list_size: Option<i32>,
    children: Vec<ArrowField>,
}
struct FlatReader<'a> {
    bytes: &'a [u8],
}
impl<'a> FlatReader<'a> {
    fn bounds(&self, pos: usize, size: usize) -> Result<(), EngineError> {
        if pos
            .checked_add(size)
            .is_none_or(|end| end > self.bytes.len())
        {
            Err(error(
                "PARQUET_ARROW_SCHEMA_BLOCKED",
                "Metadata offset outside captured bytes",
            ))
        } else {
            Ok(())
        }
    }
    fn u8(&self, pos: usize) -> Result<u8, EngineError> {
        self.bounds(pos, 1)?;
        Ok(self.bytes[pos])
    }
    fn u16(&self, pos: usize) -> Result<u16, EngineError> {
        self.bounds(pos, 2)?;
        Ok(u16::from_le_bytes([self.bytes[pos], self.bytes[pos + 1]]))
    }
    fn u32(&self, pos: usize) -> Result<u32, EngineError> {
        self.bounds(pos, 4)?;
        Ok(u32::from_le_bytes(
            self.bytes[pos..pos + 4].try_into().unwrap(),
        ))
    }
    fn i32(&self, pos: usize) -> Result<i32, EngineError> {
        Ok(self.u32(pos)? as i32)
    }
    fn i64(&self, pos: usize) -> Result<i64, EngineError> {
        self.bounds(pos, 8)?;
        Ok(i64::from_le_bytes(
            self.bytes[pos..pos + 8].try_into().unwrap(),
        ))
    }
    fn indirect(&self, pos: usize) -> Result<usize, EngineError> {
        let offset = self.u32(pos)? as usize;
        if offset < 4 {
            return Err(error(
                "PARQUET_ARROW_SCHEMA_BLOCKED",
                "Null/backward object offset",
            ));
        }
        let target = pos.checked_add(offset).ok_or_else(|| {
            error(
                "PARQUET_ARROW_SCHEMA_BLOCKED",
                "Metadata offset outside captured bytes",
            )
        })?;
        self.bounds(target, 4)?;
        Ok(target)
    }
    fn table(&self, table: usize) -> Result<Table, EngineError> {
        self.bounds(table, 4)?;
        if table % 4 != 0 {
            return Err(error("PARQUET_ARROW_SCHEMA_BLOCKED", "Misaligned table"));
        }
        let vt = (table as i64)
            .checked_sub(self.i32(table)? as i64)
            .and_then(|x| usize::try_from(x).ok())
            .ok_or_else(|| error("PARQUET_ARROW_SCHEMA_BLOCKED", "Invalid vtable offset"))?;
        let length = self.u16(vt)? as usize;
        let object_size = self.u16(vt + 2)? as usize;
        if vt % 2 != 0 || length < 4 || length % 2 != 0 || object_size < 4 {
            return Err(error("PARQUET_ARROW_SCHEMA_BLOCKED", "Invalid vtable"));
        }
        self.bounds(vt, length)?;
        self.bounds(table, object_size)?;
        Ok(Table {
            table,
            vt,
            length,
            object_size,
        })
    }
    fn root_table(&self) -> Result<Table, EngineError> {
        let root = self.u32(0)? as usize;
        self.bounds(root, 4)?;
        self.table(root)
    }
    fn string(&self, pos: Option<usize>) -> Result<Option<String>, EngineError> {
        let Some(pos) = pos else { return Ok(None) };
        let start = self.indirect(pos)?;
        let length = self.u32(start)? as usize;
        let data = start
            .checked_add(4)
            .ok_or_else(|| error("PARQUET_ARROW_SCHEMA_BLOCKED", "Invalid string bounds"))?;
        self.bounds(data, length.saturating_add(1))?;
        if self.bytes[data + length] != 0 {
            return Err(error(
                "PARQUET_ARROW_SCHEMA_BLOCKED",
                "String lacks terminator",
            ));
        }
        String::from_utf8(self.bytes[data..data + length].to_vec())
            .map(Some)
            .map_err(|_| {
                error(
                    "PARQUET_ARROW_SCHEMA_BLOCKED",
                    "Invalid UTF-8 in FlatBuffer string",
                )
            })
    }
    fn vector_tables(&self, pos: Option<usize>) -> Result<Vec<Table>, EngineError> {
        let Some(pos) = pos else {
            return Ok(Vec::new());
        };
        let start = self.indirect(pos)?;
        let length = self.u32(start)? as usize;
        let begin = start
            .checked_add(4)
            .ok_or_else(|| error("PARQUET_ARROW_SCHEMA_BLOCKED", "Invalid vector bounds"))?;
        self.bounds(begin, length.saturating_mul(4))?;
        let mut tables = Vec::with_capacity(length);
        for i in 0..length {
            tables.push(self.table(self.indirect(begin + i * 4)?)?);
        }
        Ok(tables)
    }
}
struct Table {
    table: usize,
    vt: usize,
    length: usize,
    object_size: usize,
}
impl Table {
    fn slot(
        &self,
        reader: &FlatReader<'_>,
        index: usize,
        size: usize,
    ) -> Result<Option<usize>, EngineError> {
        let entry = 4 + index * 2;
        if entry >= self.length {
            return Ok(None);
        }
        let offset = reader.u16(self.vt + entry)? as usize;
        if offset == 0 {
            return Ok(None);
        }
        if offset < 4
            || offset
                .checked_add(size)
                .is_none_or(|end| end > self.object_size)
        {
            return Err(error(
                "PARQUET_ARROW_SCHEMA_BLOCKED",
                "Field lies outside its table",
            ));
        }
        Ok(Some(self.table + offset))
    }
}
fn enum_unit(value: u16) -> Result<&'static str, EngineError> {
    match value {
        0 => Ok("SECOND"),
        1 => Ok("MILLISECOND"),
        2 => Ok("MICROSECOND"),
        3 => Ok("NANOSECOND"),
        _ => Err(error(
            "PARQUET_ARROW_SCHEMA_BLOCKED",
            "Unknown TimeUnit enum value",
        )),
    }
}
fn decode_arrow_fields(
    reader: &FlatReader<'_>,
    schema_table: Table,
) -> Result<Vec<ArrowField>, EngineError> {
    let fields = reader.vector_tables(schema_table.slot(reader, 1, 4)?)?;
    fields
        .into_iter()
        .map(|field| decode_arrow_field(reader, field, 0))
        .collect()
}
fn decode_arrow_field(
    reader: &FlatReader<'_>,
    field: Table,
    depth: usize,
) -> Result<ArrowField, EngineError> {
    if depth > 128 {
        return Err(error(
            "PARQUET_ARROW_SCHEMA_BLOCKED",
            "Metadata traversal limit exceeded",
        ));
    }
    let name = reader
        .string(field.slot(reader, 0, 4)?)?
        .unwrap_or_default();
    let type_tag = field
        .slot(reader, 2, 1)?
        .map(|pos| reader.u8(pos))
        .transpose()?
        .unwrap_or(0);
    let type_value = field.slot(reader, 3, 4)?;
    if type_tag == 0 && type_value.is_some() {
        return Err(error(
            "PARQUET_ARROW_SCHEMA_BLOCKED",
            "NONE union has a value",
        ));
    }
    let (type_name, timezone, unit, list_size) = if type_tag == 0 {
        (None, None, None, None)
    } else {
        let pos = type_value
            .ok_or_else(|| error("PARQUET_ARROW_SCHEMA_BLOCKED", "Union tag lacks value"))?;
        let table = reader.table(reader.indirect(pos)?)?;
        match type_tag {
            1 => (Some("Null".to_string()), None, None, None),
            2 => (Some("Int".to_string()), None, None, None),
            3 => (Some("FloatingPoint".to_string()), None, None, None),
            4 => (Some("Binary".to_string()), None, None, None),
            5 => (Some("Utf8".to_string()), None, None, None),
            6 => (Some("Bool".to_string()), None, None, None),
            7 => (Some("Decimal".to_string()), None, None, None),
            8 => (Some("Date".to_string()), None, None, None),
            9 => (Some("Time".to_string()), None, None, None),
            10 => {
                let unit = table
                    .slot(reader, 0, 2)?
                    .map(|position| reader.u16(position))
                    .transpose()?
                    .unwrap_or(0);
                let unit = enum_unit(unit)?.to_string();
                let timezone = reader.string(table.slot(reader, 1, 4)?)?;
                (Some("Timestamp".to_string()), timezone, Some(unit), None)
            }
            11 => (Some("Interval".to_string()), None, None, None),
            12 => (Some("List".to_string()), None, None, None),
            13 => (Some("Struct_".to_string()), None, None, None),
            14 => (Some("Union".to_string()), None, None, None),
            15 => (Some("FixedSizeBinary".to_string()), None, None, None),
            16 => {
                let size = table
                    .slot(reader, 0, 4)?
                    .map(|p| reader.i32(p))
                    .transpose()?;
                (Some("FixedSizeList".to_string()), None, None, size)
            }
            17 => (Some("Map".to_string()), None, None, None),
            18 => {
                let unit = table
                    .slot(reader, 0, 2)?
                    .map(|p| reader.u16(p))
                    .transpose()?
                    .unwrap_or(1);
                (
                    Some("Duration".to_string()),
                    None,
                    Some(enum_unit(unit)?.to_string()),
                    None,
                )
            }
            19 => (Some("LargeBinary".to_string()), None, None, None),
            20 => (Some("LargeUtf8".to_string()), None, None, None),
            21 => (Some("LargeList".to_string()), None, None, None),
            22 => (Some("RunEndEncoded".to_string()), None, None, None),
            23 => (Some("BinaryView".to_string()), None, None, None),
            24 => (Some("Utf8View".to_string()), None, None, None),
            25 => (Some("ListView".to_string()), None, None, None),
            26 => (Some("LargeListView".to_string()), None, None, None),
            _ => {
                return Err(error(
                    "PARQUET_ARROW_SCHEMA_BLOCKED",
                    "Unknown Type union tag",
                ))
            }
        }
    };
    let children = reader
        .vector_tables(field.slot(reader, 5, 4)?)?
        .into_iter()
        .map(|child| decode_arrow_field(reader, child, depth + 1))
        .collect::<Result<Vec<_>, _>>()?;
    Ok(ArrowField {
        name: Utf16::from(name),
        type_name,
        timezone,
        unit,
        list_size,
        children,
    })
}
fn append_embedded_arrow_issues(
    inspected: &Value,
    issues: &mut Vec<Value>,
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    let metadata = field(inspected, "metadata");
    let entries = array(metadata.and_then(|m| field(m, "key_value_metadata"))).unwrap_or(&[]);
    let matches = entries
        .iter()
        .enumerate()
        .filter(|(_, entry)| text(field(entry, "key")) == Some(&key("ARROW:schema")))
        .collect::<Vec<_>>();
    if matches.is_empty() {
        return Ok(false);
    }
    let entry_path = if matches.len() == 1 {
        Utf16::from(format!("/key_value_metadata/{}/value", matches[0].0))
    } else {
        Utf16::from("/key_value_metadata")
    };
    let fail = |issues: &mut Vec<Value>, detail: &str| {
        push(issues,entry_path.clone(),"EMBEDDED_ARROW_SCHEMA_UNINTERPRETED","unsupported",&format!("Embedded Arrow declaration is ambiguous or uninterpreted; physical-only lowering cannot establish its meaning. {detail}"));
    };
    if matches.len() != 1 {
        fail(issues, "Duplicate ARROW:schema entries are ambiguous");
        return Ok(true);
    }
    let (index, entry) = matches[0];
    let Some(encoded) = text(field(entry, "value")) else {
        fail(issues, "ARROW:schema requires a nonempty base64 value");
        return Ok(true);
    };
    if encoded.is_empty() {
        fail(issues, "ARROW:schema requires a nonempty base64 value");
        return Ok(true);
    }
    let Ok(encoded_utf8) = encoded.to_utf8() else {
        fail(issues, "ARROW:schema must use canonical padded base64");
        return Ok(true);
    };
    let Ok(bytes) = STANDARD.decode(encoded_utf8.as_bytes()) else {
        fail(issues, "ARROW:schema must use canonical padded base64");
        return Ok(true);
    };
    if STANDARD.encode(&bytes) != encoded_utf8 {
        fail(issues, "ARROW:schema must use canonical padded base64");
        return Ok(true);
    }
    let parsed = (|| -> Result<Vec<ArrowField>, EngineError> {
        if bytes.len() < 4 {
            return Err(error(
                "PARQUET_ARROW_SCHEMA_BLOCKED",
                "Truncated IPC message prefix",
            ));
        }
        let first = u32::from_le_bytes(bytes[0..4].try_into().unwrap());
        let prefix = if first == u32::MAX { 8 } else { 4 };
        if bytes.len() < prefix {
            return Err(error(
                "PARQUET_ARROW_SCHEMA_BLOCKED",
                "Truncated IPC continuation prefix",
            ));
        }
        let length = i32::from_le_bytes(bytes[prefix - 4..prefix].try_into().unwrap());
        if length <= 0 || length as usize != bytes.len() - prefix {
            return Err(error(
                "PARQUET_ARROW_SCHEMA_BLOCKED",
                "Expected exactly one encapsulated IPC schema message",
            ));
        }
        ctx.charge_work(bytes.len(), entry_path.clone())?;
        let reader = FlatReader {
            bytes: &bytes[prefix..],
        };
        let message = reader.root_table()?;
        let header_tag = message
            .slot(&reader, 1, 1)?
            .map(|p| reader.u8(p))
            .transpose()?
            .unwrap_or(0);
        if header_tag != 1 {
            return Err(error(
                "PARQUET_ARROW_SCHEMA_BLOCKED",
                "Embedded message must be a body-free Arrow Schema",
            ));
        }
        let header_pos = message.slot(&reader, 2, 4)?.ok_or_else(|| {
            error(
                "PARQUET_ARROW_SCHEMA_BLOCKED",
                "Embedded message header is missing",
            )
        })?;
        let schema = reader.table(reader.indirect(header_pos)?)?;
        let body = message
            .slot(&reader, 3, 8)?
            .map(|p| reader.i64(p))
            .transpose()?
            .unwrap_or(0);
        if body != 0 {
            return Err(error(
                "PARQUET_ARROW_SCHEMA_BLOCKED",
                "Embedded message must be a body-free Arrow Schema",
            ));
        }
        decode_arrow_fields(&reader, schema)
    })();
    let fields = match parsed {
        Ok(fields) => fields,
        Err(error) => {
            let detail = error
                .message
                .to_utf8()
                .unwrap_or_else(|_| "Embedded Arrow metadata could not be decoded".to_string());
            fail(issues, &detail);
            return Ok(true);
        }
    };
    push(issues,entry_path,"EMBEDDED_ARROW_SCHEMA_NOT_PROJECTED","representation-change","Avro is derived from the physical Parquet schema. The independent embedded Arrow declaration, custom metadata and schema/data correspondence remain in source; no field correspondence or semantic equivalence is inferred.");
    arrow_fields_issues(&fields, &Utf16::from("/fields"), index, issues, ctx)?;
    Ok(false)
}
fn arrow_fields_issues(
    fields: &[ArrowField],
    base: &Utf16,
    metadata_index: usize,
    issues: &mut Vec<Value>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let _ = metadata_index;
    for (index, field) in fields.iter().enumerate() {
        ctx.charge_work(1, base.clone())?;
        let path = Utf16::from(format!("{}/{}", base.to_utf8().unwrap_or_default(), index));
        let kind = field.type_name.as_deref().unwrap_or("");
        let json_name =
            serialization::write_json_value(&Value::String(field.name.clone()), Format::Json, ctx)?
                .to_utf8()
                .unwrap_or_else(|_| "\"\"".to_string());
        let context = format!(
            "Embedded Arrow {} ({}): ",
            path.to_utf8().unwrap_or_default(),
            json_name
        );
        if kind == "Duration" {
            push(issues,path.clone(),"ARROW_DURATION_NOT_PROJECTED","not-enforced",&format!("{context}duration unit {} is not a physical integer or Avro duration semantic; any row binding must preserve the unit explicitly.",field.unit.as_deref().unwrap_or("undefined")));
        }
        if kind == "Timestamp" && field.timezone.as_ref().is_some_and(|tz| !tz.is_empty()) {
            let timezone = serialization::write_json_value(
                &Value::String(Utf16::from(field.timezone.as_ref().unwrap().as_str())),
                Format::Json,
                ctx,
            )?
            .to_utf8()
            .unwrap_or_default();
            push(issues,path.clone(),"ARROW_TIMEZONE_NOT_PROJECTED","not-enforced",&format!("{context}named timezone {timezone} is not retained by Avro instant timestamps."));
        }
        if ["LargeList", "FixedSizeList", "ListView", "LargeListView"].contains(&kind) {
            let size = field
                .list_size
                .map(|n| format!(" and size {n}"))
                .unwrap_or_default();
            push(
                issues,
                path.clone(),
                "ARROW_LIST_REFINEMENT_NOT_PROJECTED",
                "not-enforced",
                &format!("{context}{kind} width/layout{size} are not enforced by an Avro array."),
            );
        }
        let nested = Utf16::from(format!("{}/children", path.to_utf8().unwrap_or_default()));
        arrow_fields_issues(&field.children, &nested, metadata_index, issues, ctx)?;
    }
    Ok(())
}
