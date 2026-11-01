//! Rust-owned PostgreSQL catalog row to JSON Schema projection.
//!
//! This describes one read-row representation. PostgreSQL remains the authority
//! for catalog constraints, session behavior, query semantics, and source data.
use crate::{
    context::Context,
    error::EngineError,
    json_schema_adapter,
    native_json::{NativeJsonNode, NativeJsonTree},
    postgresql_catalog as pg,
    serialization::{self, Format},
    value::{copy_json, Utf16, Value},
};

const EXTENSION: &str = "umf.postgresql.catalog";
const CAPTURE_SCHEMA: &str =
    include_str!("../../../spec/extensions/postgresql-catalog/capture.schema.json");

fn err(code: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}
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
fn text(value: Option<&Value>) -> Option<&Utf16> {
    match value {
        Some(Value::String(value)) => Some(value),
        _ => None,
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
fn diagnostic_issue(path: Utf16, code: Utf16, message: Utf16) -> Value {
    object(vec![
        ("path", Value::String(path)),
        ("code", Value::String(code)),
        ("classification", Value::string_utf8("not-enforced")),
        ("detail", Value::String(message)),
        ("retainedInSource", Value::Bool(true)),
    ])
}
fn issue(path: &str, code: &str, class: &str, detail: &str) -> Value {
    issue_utf16(&Utf16::from(path), code, class, &Utf16::from(detail))
}
fn push_issue(
    issues: &mut Vec<Value>,
    path: &Utf16,
    code: &str,
    classification: &str,
    detail: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    ctx.charge_work(1, path.clone())?;
    issues.push(diagnostic_issue(path.clone(), key(code), detail.clone()));
    if classification != "not-enforced" {
        let last = issues.last_mut().expect("issue inserted");
        if let Value::Object(fields) = last {
            if let Some((_, value)) = fields
                .iter_mut()
                .find(|(name, _)| name == &key("classification"))
            {
                *value = Value::string_utf8(classification);
            }
        }
    }
    Ok(())
}
fn pointer_child(path: &Utf16, segment: &Utf16) -> Utf16 {
    let mut units = path.units().to_vec();
    units.push(b'/' as u16);
    for unit in segment.units() {
        match *unit {
            0x7e => units.extend([b'~' as u16, b'0' as u16]),
            0x2f => units.extend([b'~' as u16, b'1' as u16]),
            other => units.push(other),
        }
    }
    Utf16::new(units)
}
fn inspection_path_child(path: &Utf16, segment: &Utf16) -> Utf16 {
    let mut units = path.units().to_vec();
    units.push(b'/' as u16);
    units.extend(segment.units());
    Utf16::new(units)
}
fn tagged_representation_extras(
    value: &Value,
    path: &Utf16,
    issues: &mut Vec<Value>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let kind = text(field(value, "kind"));
    let known: &[&str] = match kind {
        Some(value) if value == &key("null") => &["kind"],
        Some(value) if value == &key("object") => &["kind", "members"],
        Some(value) if value == &key("array") => &["kind", "items"],
        _ => &["kind", "value"],
    };
    if let Value::Object(fields) = value {
        if fields
            .iter()
            .any(|(name, _)| !known.iter().any(|known| name == &key(known)))
        {
            push_issue(
                issues,
                path,
                "POSTGRESQL_CATALOG_REPRESENTATION",
                "not-enforced",
                &Utf16::from("Unknown tagged representation fields must stay in UMF"),
                ctx,
            )?;
        }
        if kind == Some(&key("object")) {
            if let Some(Value::Object(members)) = field(value, "members") {
                for (name, child) in members {
                    tagged_representation_extras(
                        child,
                        &inspection_path_child(path, name),
                        issues,
                        ctx,
                    )?;
                }
            }
        } else if kind == Some(&key("array")) {
            if let Some(Value::Array(items)) = field(value, "items") {
                for (index, child) in items.iter().enumerate() {
                    tagged_representation_extras(
                        child,
                        &inspection_path_child(path, &Utf16::from(index.to_string())),
                        issues,
                        ctx,
                    )?;
                }
            }
        }
    }
    Ok(())
}
fn node_field<'a>(node: &'a NativeJsonNode, name: &str) -> Option<&'a NativeJsonNode> {
    let NativeJsonNode::Object(fields) = node else {
        return None;
    };
    fields
        .iter()
        .find(|(candidate, _)| candidate == &key(name))
        .map(|(_, value)| value)
}
fn node_text(node: Option<&NativeJsonNode>) -> Option<&Utf16> {
    match node {
        Some(NativeJsonNode::String(value)) => Some(value),
        _ => None,
    }
}
fn source_capture_payload(source: &Value) -> Option<&Value> {
    let Value::Array(modules) = field(source, "modules")? else {
        return None;
    };
    let module = modules
        .iter()
        .find(|module| text(field(module, "id")) == Some(&key("catalog")))?;
    let Value::Array(elements) = field(module, "elements")? else {
        return None;
    };
    let capture = elements
        .iter()
        .find(|element| text(field(element, "id")) == Some(&key("capture")))?;
    field(field(capture, "extensions")?, EXTENSION)
}
fn source_capture_root(source: &Value) -> Option<&Value> {
    field(source_capture_payload(source)?, "root")
}
fn schema_member<'a>(schema: &'a Value, name: &str) -> Option<&'a Value> {
    field(schema, name)
}
fn schema_ref<'a>(schema: &'a Value, definitions: &'a Value) -> Option<&'a Value> {
    let reference = text(schema_member(schema, "$ref"))?;
    let reference = reference.to_utf8().ok()?;
    let name = reference.strip_prefix("#/$defs/")?;
    field(definitions, name)
}
fn unknown_native_paths(
    node: &NativeJsonNode,
    schema: &Value,
    definitions: &Value,
    path: &Utf16,
    output: &mut Vec<Utf16>,
    ctx: &mut Context<'_>,
    depth: usize,
) -> Result<(), EngineError> {
    if depth > 256 {
        return Err(err(
            "POSTGRESQL_ROW_SOURCE",
            "Catalog schema traversal exceeded its structural depth",
        ));
    }
    ctx.charge_work(1, path.clone())?;
    if let Some(resolved) = schema_ref(schema, definitions) {
        return unknown_native_paths(node, resolved, definitions, path, output, ctx, depth + 1);
    }
    if let (Some(Value::Array(branches)), value) = (schema_member(schema, "anyOf"), node) {
        if matches!(value, NativeJsonNode::Null) {
            return Ok(());
        }
        if let Some(branch) = branches
            .iter()
            .find(|branch| schema_member(branch, "$ref").is_some())
        {
            return unknown_native_paths(value, branch, definitions, path, output, ctx, depth + 1);
        }
    }
    match node {
        NativeJsonNode::Array(items) => {
            if let Some(item_schema) = schema_member(schema, "items") {
                for (index, item) in items.iter().enumerate() {
                    unknown_native_paths(
                        item,
                        item_schema,
                        definitions,
                        &inspection_path_child(path, &Utf16::from(index.to_string())),
                        output,
                        ctx,
                        depth + 1,
                    )?;
                }
            }
        }
        NativeJsonNode::Object(members) => {
            if let Some(Value::Object(properties)) = schema_member(schema, "properties") {
                for (name, value) in members {
                    ctx.charge_work(1, path.clone())?;
                    if let Some((_, child_schema)) =
                        properties.iter().find(|(candidate, _)| candidate == name)
                    {
                        unknown_native_paths(
                            value,
                            child_schema,
                            definitions,
                            &inspection_path_child(path, name),
                            output,
                            ctx,
                            depth + 1,
                        )?;
                    } else {
                        output.push(inspection_path_child(path, name));
                    }
                }
            }
        }
        _ => {}
    }
    Ok(())
}

fn add_schema_unknowns(
    source: &Value,
    root: &NativeJsonTree,
    issues: &mut Vec<Value>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    if let Some(Value::Object(members)) = source_capture_payload(source) {
        for (name, _) in members {
            if !["profile", "state", "root"]
                .iter()
                .any(|known| name == &key(known))
            {
                push_issue(
                    issues,
                    &Utf16::default(),
                    "POSTGRESQL_CATALOG_REPRESENTATION",
                    "not-enforced",
                    &Utf16::from("Unknown representation fields must stay in UMF"),
                    ctx,
                )?;
            }
        }
    }
    if let Some(tagged_root) = source_capture_root(source) {
        tagged_representation_extras(tagged_root, &Utf16::from("/root"), issues, ctx)?;
    }
    let schema_value = serialization::read_json_value(
        CAPTURE_SCHEMA.encode_utf16().collect::<Vec<_>>().as_slice(),
        Format::Json,
        ctx,
    )?;
    let definitions = schema_member(&schema_value, "$defs").ok_or_else(|| {
        err(
            "POSTGRESQL_ROW_SOURCE",
            "Catalog capture schema definitions are unavailable",
        )
    })?;
    let mut unknowns = Vec::new();
    unknown_native_paths(
        root.root(),
        &schema_value,
        definitions,
        &Utf16::default(),
        &mut unknowns,
        ctx,
        0,
    )?;
    unknowns.sort();
    for path in unknowns {
        push_issue(
            issues,
            &path,
            "POSTGRESQL_CATALOG_UNKNOWN",
            "not-enforced",
            &Utf16::from("Unknown native capture field retained without interpretation"),
            ctx,
        )?;
    }
    Ok(())
}

#[derive(Clone)]
struct Policy {
    id: Utf16,
    schema_id: Utf16,
    schema: Utf16,
    relation: Utf16,
    columns: Vec<(Utf16, Utf16)>,
    loss: Utf16,
    value: Value,
}
fn parse_policy(input: &Value, ctx: &mut Context<'_>) -> Result<Policy, EngineError> {
    let value = copy_json(input, ctx)?;
    let Value::Object(fields) = &value else {
        return Err(err(
            "POSTGRESQL_ROW_POLICY",
            "Explicit relation, encodings and loss policy are required",
        ));
    };
    if fields.iter().any(|(name, _)| {
        !["id", "schemaId", "relation", "columns", "lossPolicy"]
            .iter()
            .any(|known| name == &key(known))
    }) {
        return Err(err(
            "POSTGRESQL_ROW_POLICY",
            "Explicit relation, encodings and loss policy are required",
        ));
    }
    let id = text(field(&value, "id"))
        .filter(|value| !value.is_empty())
        .cloned();
    let schema_id = text(field(&value, "schemaId"))
        .filter(|value| !value.is_empty())
        .cloned();
    let relation = field(&value, "relation");
    let (schema, relation_name) = match relation {
        Some(Value::Object(fields))
            if !fields
                .iter()
                .any(|(name, _)| !["schema", "name"].iter().any(|known| name == &key(known))) =>
        {
            (
                text(field(relation.unwrap(), "schema"))
                    .filter(|value| !value.is_empty())
                    .cloned(),
                text(field(relation.unwrap(), "name"))
                    .filter(|value| !value.is_empty())
                    .cloned(),
            )
        }
        _ => (None, None),
    };
    let columns = match field(&value, "columns") {
        Some(Value::Object(columns)) if !columns.is_empty() => {
            let mut parsed = Vec::with_capacity(columns.len());
            for (name, encoding) in columns {
                let Some(encoding) = text(Some(encoding)) else {
                    return Err(err(
                        "POSTGRESQL_ROW_POLICY",
                        "Explicit relation, encodings and loss policy are required",
                    ));
                };
                if !["sql-text", "json-boolean", "json-int32", "json-value"]
                    .iter()
                    .any(|known| encoding == &key(known))
                {
                    return Err(err(
                        "POSTGRESQL_ROW_POLICY",
                        "Explicit relation, encodings and loss policy are required",
                    ));
                }
                parsed.push((name.clone(), encoding.clone()));
            }
            parsed
        }
        _ => {
            return Err(err(
                "POSTGRESQL_ROW_POLICY",
                "Explicit relation, encodings and loss policy are required",
            ))
        }
    };
    let loss = text(field(&value, "lossPolicy")).cloned();
    let (Some(id), Some(schema_id), Some(schema), Some(relation_name), Some(loss)) =
        (id, schema_id, schema, relation_name, loss)
    else {
        return Err(err(
            "POSTGRESQL_ROW_POLICY",
            "Explicit relation, encodings and loss policy are required",
        ));
    };
    if !["strict", "allow-reported-loss"]
        .iter()
        .any(|known| loss == &key(known))
    {
        return Err(err(
            "POSTGRESQL_ROW_POLICY",
            "Explicit relation, encodings and loss policy are required",
        ));
    }
    let names = std::iter::once(&schema)
        .chain(std::iter::once(&relation_name))
        .chain(columns.iter().map(|(name, _)| name));
    for name in names {
        if name.units().contains(&0) {
            return Err(err("POSTGRESQL_ROW_POLICY", "NUL is not a SQL identifier"));
        }
    }
    // JavaScript URL consumes a USVString; unpaired surrogates become U+FFFD
    // for URI validation while the original policy string remains preserved.
    let schema_id_utf8 = String::from_utf16_lossy(schema_id.units());
    let parsed = url::Url::parse(&schema_id_utf8).map_err(|_| {
        err(
            "POSTGRESQL_ROW_POLICY",
            "Expected absolute fragment-free schema URI",
        )
    })?;
    if parsed
        .fragment()
        .is_some_and(|fragment| !fragment.is_empty())
    {
        return Err(err(
            "POSTGRESQL_ROW_POLICY",
            "Expected absolute fragment-free schema URI",
        ));
    }
    ctx.charge_text(
        id.len()
            .saturating_add(schema_id.len())
            .saturating_add(schema.len())
            .saturating_add(relation_name.len()),
        Utf16::default(),
    )?;
    Ok(Policy {
        id,
        schema_id,
        schema,
        relation: relation_name,
        columns,
        loss,
        value,
    })
}
fn quote_identifier(name: &Utf16) -> Utf16 {
    let mut output = vec![b'"' as u16];
    for unit in name.units() {
        output.push(*unit);
        if *unit == b'"' as u16 {
            output.push(*unit);
        }
    }
    output.push(b'"' as u16);
    Utf16::new(output)
}
fn sql_literal(name: &Utf16) -> Utf16 {
    let mut output = "E'".encode_utf16().collect::<Vec<_>>();
    for unit in name.units() {
        if *unit == b'\\' as u16 {
            output.extend([b'\\' as u16, b'\\' as u16]);
        } else if *unit == b'\'' as u16 {
            output.extend([b'\'' as u16, b'\'' as u16]);
        } else {
            output.push(*unit);
        }
    }
    output.push(b'\'' as u16);
    Utf16::new(output)
}
fn append(target: &mut Vec<u16>, value: &str) {
    target.extend(value.encode_utf16());
}
fn relation_type(column: &NativeJsonNode) -> Option<&Utf16> {
    node_text(node_field(column, "type"))
}
fn column_comment(column: &NativeJsonNode) -> Option<&NativeJsonNode> {
    node_field(column, "comment")
}

/// Construct the bounded read-row projection, loss report and query text.
pub fn project_postgresql_row_to_json_schema(
    source: &Value,
    policy_input: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let policy = parse_policy(policy_input, ctx)?;
    let checked = match pg::inspect_document(source, ctx) {
        Ok(value) => value,
        Err(error)
            if error
                .code
                .units()
                .starts_with(&"POSTGRESQL_CATALOG".encode_utf16().collect::<Vec<_>>()) =>
        {
            return Err(err("POSTGRESQL_ROW_SOURCE", "Invalid catalog capture"));
        }
        Err(error) => return Err(error),
    };
    if !matches!(field(&checked, "valid"), Some(Value::Bool(true))) {
        return Err(err("POSTGRESQL_ROW_SOURCE", "Invalid catalog capture"));
    }
    let source_copy = copy_json(source, ctx)?;
    let capture_root_value = source_capture_root(source)
        .ok_or_else(|| err("POSTGRESQL_ROW_SOURCE", "Invalid catalog capture"))?;
    let capture_tree =
        NativeJsonTree::from_tagged_value(capture_root_value, ctx).map_err(|error| {
            if error.is_control_failure() {
                error
            } else {
                err("POSTGRESQL_ROW_SOURCE", "Invalid catalog capture")
            }
        })?;
    let mut issues = Vec::new();
    issues.push(issue("", "POSTGRESQL_CATALOG_SCOPE", "not-enforced", "Observed metadata is limited to the declared query/profile; server state and reconstruction correspondence are not verified"));
    add_schema_unknowns(source, &capture_tree, &mut issues, ctx)?;
    let diagnostics = match field(&checked, "diagnostics") {
        Some(Value::Array(d)) => d,
        _ => &[],
    };
    let is_unverified_version = diagnostics.iter().any(|d| matches!(text(field(d, "code")), Some(code) if code == &key("POSTGRESQL_CATALOG_VERSION")));
    let is_modified = diagnostics.iter().any(|d| matches!(text(field(d, "code")), Some(code) if code == &key("POSTGRESQL_CATALOG_MODIFIED")));
    if is_unverified_version {
        issues.push(issue(
            "/serverVersion",
            "POSTGRESQL_CATALOG_VERSION",
            "not-enforced",
            "Capture version retained; executed evidence currently covers PostgreSQL 17.4 only",
        ));
    }
    if is_modified {
        issues.push(issue(
            "",
            "POSTGRESQL_CATALOG_MODIFIED",
            "not-enforced",
            "Capture has candidate edits; its reconstruction archive is not synchronized",
        ));
    }
    let is_fatal_catalog = is_unverified_version || is_modified;
    issues.push(issue("", "POSTGRESQL_ROW_ONLY", "not-enforced", "Read-row shape only. Catalog correspondence, defaults, generated expressions, domain/check/key/foreign-key constraints, privileges, policies, triggers, ordering and database state remain authoritative in PostgreSQL; no INSERT validation or SQL execution is performed."));
    let mut result = object(vec![
        ("status", Value::string_utf8("blocked")),
        ("complete", Value::Bool(false)),
        ("source", source_copy),
        ("policy", policy.value.clone()),
        ("issues", Value::Array(Vec::new())),
        ("mappings", Value::Array(Vec::new())),
    ]);
    let mut fatal = is_fatal_catalog;
    let selected = match pg::find_relation(source, &policy.schema, &policy.relation, ctx) {
        Ok(Value::Null) => None,
        Ok(relation) => Some(relation),
        Err(error) if error.code == "POSTGRESQL_CATALOG_AMBIGUOUS" => {
            issues.push(issue(
                "/relation",
                "POSTGRESQL_ROW_RELATION",
                "unsupported",
                "Duplicate qualified relation observations",
            ));
            fatal = true;
            None
        }
        Err(error) => return Err(error),
    };
    let Some(selected) = selected else {
        if !issues
            .iter()
            .any(|i| text(field(i, "code")) == Some(&key("POSTGRESQL_ROW_RELATION")))
        {
            issues.push(issue(
                "/relation",
                "POSTGRESQL_ROW_RELATION",
                "unsupported",
                "Selected relation was not captured",
            ));
        }
        fatal = true;
        set_result(&mut result, "issues", Value::Array(issues));
        return Ok(result);
    };
    let selected_tree = NativeJsonTree::from_tagged_value(&selected, ctx)?;
    let relation = selected_tree.root();
    let kind = node_text(node_field(relation, "kind"));
    if !matches!(kind, Some(k) if ["r", "p", "v", "m", "f"].iter().any(|known| k == &key(known))) {
        issues.push(issue(
            "/relation",
            "POSTGRESQL_ROW_KIND",
            "unsupported",
            "Expected a row-producing relation",
        ));
        fatal = true;
        set_result(&mut result, "issues", Value::Array(issues));
        return Ok(result);
    }
    let columns = match node_field(relation, "columns") {
        Some(NativeJsonNode::Array(columns)) => columns.as_slice(),
        _ => &[],
    };
    let mut omitted = Vec::new();
    for column in columns {
        let Some(name) = node_text(node_field(column, "name")) else {
            continue;
        };
        if !policy.columns.iter().any(|(selected, _)| selected == name) {
            omitted.push(name.clone());
        }
    }
    omitted.sort();
    for name in omitted {
        issues.push(issue_utf16(
            &pointer_child(&Utf16::from("/columns"), &name),
            "POSTGRESQL_COLUMN_OMITTED",
            "not-enforced",
            &Utf16::from("Native column is omitted from the selected read-row representation"),
        ));
    }
    let mut props = Vec::new();
    let mut required = Vec::new();
    let mut mappings = Vec::new();
    let mut value_rows = Vec::new();
    for (name, encoding) in &policy.columns {
        let path = pointer_child(&Utf16::from("/columns"), name);
        let matches = columns
            .iter()
            .filter(|column| node_text(node_field(column, "name")) == Some(name))
            .collect::<Vec<_>>();
        if matches.len() != 1 {
            fatal = true;
            issues.push(issue_utf16(
                &path,
                "POSTGRESQL_COLUMN",
                "unsupported",
                &Utf16::from("Column is missing or ambiguous in the capture"),
            ));
            continue;
        }
        let column = matches[0];
        let native_type = relation_type(column).cloned().unwrap_or_default();
        let not_null = matches!(
            node_field(column, "notNull"),
            Some(NativeJsonNode::Boolean(true))
        );
        let mut shape = if encoding == &key("sql-text") {
            issues.push(issue_utf16(&path, "POSTGRESQL_TEXT_ENCODING", "representation-change", &Utf16::from("Uses the server native text output/cast; native type structure, lexical/domain constraints and session-dependent formatting are not portable JSON validation.")));
            object(vec![("type", Value::string_utf8("string"))])
        } else if encoding == &key("json-boolean") && native_type == key("boolean") {
            object(vec![("type", Value::string_utf8("boolean"))])
        } else if encoding == &key("json-int32")
            && ["smallint", "integer"]
                .iter()
                .any(|t| native_type == key(t))
        {
            let small = native_type == key("smallint");
            object(vec![
                ("type", Value::string_utf8("integer")),
                (
                    "minimum",
                    Value::Number(if small { -32768.0 } else { -2147483648.0 }),
                ),
                (
                    "maximum",
                    Value::Number(if small { 32767.0 } else { 2147483647.0 }),
                ),
            ])
        } else if encoding == &key("json-value")
            && ["json", "jsonb"].iter().any(|t| native_type == key(t))
        {
            issues.push(issue_utf16(&path, "POSTGRESQL_JSON_VALUE", "representation-change", &Utf16::from("SQL NULL and JSON null share an output representation; JSON Schema does not preserve duplicate object keys or guarantee exact client parsing of embedded numbers.")));
            object(Vec::new())
        } else {
            fatal = true;
            issues.push(issue_utf16(
                &path,
                "POSTGRESQL_ENCODING",
                "unsupported",
                &format_utf16(
                    "Encoding ",
                    encoding,
                    " is not verified for native type ",
                    &native_type,
                    "; choose an explicit native-text representation or add a proven binding",
                ),
            ));
            continue;
        };
        if !not_null && encoding != &key("json-value") {
            shape = object(vec![(
                "anyOf",
                Value::Array(vec![
                    shape,
                    object(vec![("type", Value::string_utf8("null"))]),
                ]),
            )]);
        }
        if let Some(NativeJsonNode::String(comment)) = column_comment(column) {
            shape = append_property(shape, "description", Value::String(comment.clone()));
        }
        props.push((name.clone(), shape));
        required.push(Value::String(name.clone()));
        let mut expression = vec![b'r' as u16, b'.' as u16];
        expression.extend(quote_identifier(name).into_units());
        if encoding == &key("sql-text") {
            append(&mut expression, "::text");
        }
        let mut row = vec![b'(' as u16];
        append(&mut row, &value_rows.len().to_string());
        row.push(b',' as u16);
        row.extend(sql_literal(name).into_units());
        append(&mut row, ",pg_catalog.to_json(");
        row.extend(expression);
        append(&mut row, "))");
        value_rows.push(Utf16::new(row));
        mappings.push(object(vec![
            ("column", Value::String(name.clone())),
            ("nativeType", Value::String(native_type.clone())),
            ("encoding", Value::String(encoding.clone())),
            (
                "targetPointer",
                Value::String(pointer_child(&Utf16::from("/properties"), name)),
            ),
        ]));
    }
    if is_fatal_catalog {
        issues.push(issue(
            "",
            "POSTGRESQL_ROW_UNVERIFIED",
            "unsupported",
            "Modified metadata or untested server versions cannot generate executable row queries",
        ));
    }
    set_result(&mut result, "issues", Value::Array(issues.clone()));
    set_result(&mut result, "mappings", Value::Array(mappings));
    if fatal || policy.loss == key("strict") && !issues.is_empty() {
        return Ok(result);
    }
    let schema_id = policy.schema_id.clone();
    let schema = object(vec![
        (
            "$schema",
            Value::string_utf8("https://json-schema.org/draft/2020-12/schema"),
        ),
        ("$id", Value::String(schema_id.clone())),
        ("type", Value::string_utf8("object")),
        ("properties", Value::Object(props)),
        ("required", Value::Array(required)),
        ("additionalProperties", Value::Bool(false)),
    ]);
    // The legacy TypeScript contract is JSON.stringify(schema, null, 2) plus LF.
    // The core JSON writer preserves that exact pretty-printed profile.
    let native_schema = serialization::write_json_value(&schema, Format::Json, ctx)?;
    let target = json_schema_adapter::import_json_schema(
        native_schema.units(),
        &policy.id,
        &policy.schema_id,
        &[],
        ctx,
    )?;
    let mut sql = Vec::new();
    append(
        &mut sql,
        "SELECT (SELECT pg_catalog.json_object_agg(v.key,v.value ORDER BY v.ordinal) FROM (VALUES ",
    );
    for (index, row) in value_rows.iter().enumerate() {
        if index > 0 {
            sql.push(b',' as u16);
        }
        sql.extend(row.units());
    }
    append(&mut sql, ") AS v(ordinal,key,value)) AS row FROM ");
    sql.extend(quote_identifier(&policy.schema).into_units());
    sql.push(b'.' as u16);
    sql.extend(quote_identifier(&policy.relation).into_units());
    append(&mut sql, " AS r;");
    set_result(&mut result, "status", Value::string_utf8("projected"));
    result = append_property(result, "target", target);
    result = append_property(result, "nativeSchema", Value::String(native_schema));
    result = append_property(result, "sql", Value::String(Utf16::new(sql)));
    Ok(result)
}
fn issue_utf16(path: &Utf16, code: &str, class: &str, detail: &Utf16) -> Value {
    object(vec![
        ("path", Value::String(path.clone())),
        ("code", Value::string_utf8(code)),
        ("classification", Value::string_utf8(class)),
        ("detail", Value::String(detail.clone())),
        ("retainedInSource", Value::Bool(true)),
    ])
}
fn format_utf16(prefix: &str, value: &Utf16, middle: &str, suffix: &Utf16, tail: &str) -> Utf16 {
    let mut units = prefix.encode_utf16().collect::<Vec<_>>();
    units.extend(value.units());
    units.extend(middle.encode_utf16());
    units.extend(suffix.units());
    units.extend(tail.encode_utf16());
    Utf16::new(units)
}
fn append_property(mut value: Value, name: &str, item: Value) -> Value {
    if let Value::Object(fields) = &mut value {
        if let Some((_, existing)) = fields.iter_mut().find(|(member, _)| member == &key(name)) {
            *existing = item;
        } else {
            fields.push((key(name), item));
        }
    }
    value
}
fn set_result(result: &mut Value, name: &str, value: Value) {
    *result = append_property(std::mem::replace(result, Value::Null), name, value);
}
