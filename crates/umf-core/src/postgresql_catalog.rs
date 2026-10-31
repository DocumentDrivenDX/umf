//! Bounded PostgreSQL catalog capture kernel draft.
//! Keeps the capture as an exact NativeJsonTree and exposes only current core
//! column observations whose native scalar type is unambiguous.
use crate::value::copy_json;
#[path = "pg_node_tree.rs"]
mod pg_node_tree;
use crate::{
    native_json::{NativeJsonNode, NativeJsonTree},
    schema::{CompiledSchema, SchemaResources},
    serialization::{self, Format},
    Context, EngineError, Utf16, Value,
};
use std::collections::BTreeSet;

const PROFILE: &str = "postgresql-catalog-capture-v1";
const EXTENSION: &str = "umf.postgresql.catalog";

#[derive(Clone, Debug, PartialEq)]
pub struct PostgresqlColumnMetadata {
    pub path: Utf16,
    pub schema: Utf16,
    pub relation: Utf16,
    pub kind: Utf16,
    pub element: Value,
    pub native_column: Value,
}
#[derive(Clone, Debug, PartialEq)]
pub struct PostgresqlCatalogCapture {
    root: NativeJsonTree,
    state: Utf16,
}

fn fail(code: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}
fn key(s: &str) -> Utf16 {
    Utf16::from(s)
}
fn field<'a>(node: &'a NativeJsonNode, name: &str) -> Option<&'a NativeJsonNode> {
    let NativeJsonNode::Object(fields) = node else {
        return None;
    };
    fields.iter().find(|(k, _)| k == &key(name)).map(|(_, v)| v)
}
fn as_text(node: Option<&NativeJsonNode>) -> Option<&Utf16> {
    match node {
        Some(NativeJsonNode::String(value)) => Some(value),
        _ => None,
    }
}
fn string_is(node: Option<&Value>, expected: &str) -> bool {
    value_text(node) == Some(&key(expected))
}
fn as_array(node: Option<&NativeJsonNode>) -> Option<&[NativeJsonNode]> {
    match node {
        Some(NativeJsonNode::Array(items)) => Some(items),
        _ => None,
    }
}
fn text_value(value: Utf16) -> Value {
    Value::String(value)
}
fn object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(name, value)| (key(name), value))
            .collect(),
    )
}
fn pointer_part(value: &Utf16, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    let mut out = Vec::new();
    for unit in value.units() {
        ctx.charge_work(1, Utf16::default())?;
        match *unit {
            0x7e => out.extend([0x7e, 0x30]),
            0x2f => out.extend([0x7e, 0x31]),
            x => out.push(x),
        }
    }
    Ok(Utf16::new(out))
}
fn pointer_child(base: &Utf16, child: &Utf16, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    ctx.charge_work(
        base.len().saturating_add(child.len()).saturating_add(1),
        Utf16::default(),
    )?;
    let mut out = base.units().to_vec();
    out.push(0x2f);
    out.extend_from_slice(pointer_part(child, ctx)?.units());
    Ok(Utf16::new(out))
}
fn scalar_type(column: &NativeJsonNode) -> Option<&'static str> {
    let ty = field(column, "nativeType")?;
    if as_text(field(ty, "schema"))? != &key("pg_catalog")
        || as_text(field(ty, "kind"))? != &key("b")
        || as_text(field(ty, "category")) == Some(&key("A"))
        || !matches!(field(ty,"dimensions"),Some(NativeJsonNode::Number(n)) if n == "0" || n == "0.0")
    {
        return None;
    }
    match as_text(field(ty, "name"))?.to_utf8().ok()?.as_str() {
        "bool" => Some("boolean"),
        "int2" | "int4" | "int8" => Some("integer"),
        "numeric" => Some("decimal"),
        "float4" | "float8" => Some("float"),
        "text" | "varchar" | "bpchar" => Some("string"),
        "bytea" => Some("binary"),
        "date" => Some("date"),
        "time" | "timetz" => Some("time"),
        "timestamp" | "timestamptz" => Some("timestamp"),
        _ => None,
    }
}
fn validate_root(root: &NativeJsonTree, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    let node = root.root();
    if as_text(field(node, "profile")) != Some(&key(PROFILE))
        || as_text(field(node, "state"))
            .is_none_or(|state| state != &key("captured") && state != &key("modified"))
        || !matches!(field(node,"serverVersion"),Some(NativeJsonNode::Number(n)) if n.starts_with("17"))
    {
        return Err(fail(
            "POSTGRESQL_CATALOG_CAPTURE",
            "Expected a versioned PostgreSQL catalog capture",
        ));
    }
    let snapshot = field(node, "snapshot")
        .ok_or_else(|| fail("POSTGRESQL_CATALOG_CAPTURE", "Missing snapshot"))?;
    let relations = as_array(field(snapshot, "relations")).ok_or_else(|| {
        fail(
            "POSTGRESQL_CATALOG_CAPTURE",
            "Snapshot relations must be an array",
        )
    })?;
    ctx.charge_work(relations.len(), Utf16::default())?;
    let mut names = BTreeSet::new();
    for relation in relations {
        let schema = as_text(field(relation, "schema")).ok_or_else(|| {
            fail(
                "POSTGRESQL_CATALOG_CAPTURE",
                "Relation schema must be a string",
            )
        })?;
        let name = as_text(field(relation, "name")).ok_or_else(|| {
            fail(
                "POSTGRESQL_CATALOG_CAPTURE",
                "Relation name must be a string",
            )
        })?;
        ctx.charge_work(schema.len().saturating_add(name.len()), Utf16::default())?;
        if !names.insert((schema.clone(), name.clone())) {
            return Err(fail(
                "POSTGRESQL_CATALOG_DUPLICATE",
                "Duplicate qualified relation",
            ));
        }
        let columns = as_array(field(relation, "columns")).ok_or_else(|| {
            fail(
                "POSTGRESQL_CATALOG_CAPTURE",
                "Relation columns must be an array",
            )
        })?;
        let mut column_names = BTreeSet::new();
        for column in columns {
            let name = as_text(field(column, "name")).ok_or_else(|| {
                fail("POSTGRESQL_CATALOG_CAPTURE", "Column name must be a string")
            })?;
            ctx.charge_work(name.len(), Utf16::default())?;
            if !column_names.insert(name.clone()) {
                return Err(fail(
                    "POSTGRESQL_CATALOG_DUPLICATE",
                    "Duplicate column name",
                ));
            }
        }
    }
    validate_capture_schema(root, ctx)?;
    Ok(as_text(field(node, "state"))
        .expect("validated state")
        .clone())
}

fn exact_safe_integer(token: &str) -> bool {
    let (mantissa, exponent) = token
        .split_once(['e', 'E'])
        .map_or((token, 0i32), |(m, e)| (m, e.parse().unwrap_or(i32::MIN)));
    if exponent == i32::MIN {
        return false;
    }
    let unsigned = mantissa.strip_prefix('-').unwrap_or(mantissa);
    if token.starts_with('-') && unsigned.bytes().all(|b| matches!(b, b'0' | b'.')) {
        return false;
    }
    let (whole, fraction) = unsigned.split_once('.').unwrap_or((unsigned, ""));
    let mut digits = format!("{whole}{fraction}");
    let scale = exponent.saturating_sub(fraction.len() as i32);
    while digits.starts_with('0') && digits.len() > 1 {
        digits.remove(0);
    }
    if scale < 0 {
        let remove = (-scale) as usize;
        if remove >= digits.len() {
            return digits.trim_matches('0').is_empty();
        }
        if !digits[digits.len() - remove..].bytes().all(|b| b == b'0') {
            return false;
        }
        digits.truncate(digits.len() - remove)
    } else {
        if scale as usize > 16 {
            return false;
        }
        digits.extend(std::iter::repeat('0').take(scale as usize))
    }
    while digits.starts_with('0') && digits.len() > 1 {
        digits.remove(0);
    }
    if digits.len() > 16 {
        return false;
    }
    digits
        .parse::<u64>()
        .is_ok_and(|v| v <= 9_007_199_254_740_991)
}
fn schema_field<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    let Value::Object(fields) = value else {
        return None;
    };
    fields.iter().find(|(k, _)| k == &key(name)).map(|(_, v)| v)
}
fn schema_lookup<'a>(schema: &'a Value, rule: &'a Value) -> &'a Value {
    let Some(Value::String(reference)) = schema_field(rule, "$ref") else {
        return rule;
    };
    let Ok(reference) = reference.to_utf8() else {
        return rule;
    };
    let mut node = schema;
    for part in reference.strip_prefix("#/").unwrap_or("").split('/') {
        let name = part.replace("~1", "/").replace("~0", "~");
        let Some(next) = schema_field(node, &name) else {
            return rule;
        };
        node = next;
    }
    node
}
fn schema_type_matches(node: &NativeJsonNode, rule: &Value) -> bool {
    let Some(ty) = schema_field(rule, "type") else {
        return true;
    };
    let matches_name = |name: &Utf16| match name.to_utf8().ok().as_deref() {
        Some("object") => matches!(node, NativeJsonNode::Object(_)),
        Some("array") => matches!(node, NativeJsonNode::Array(_)),
        Some("string") => matches!(node, NativeJsonNode::String(_)),
        Some("number") => matches!(node, NativeJsonNode::Number(_)),
        Some("integer") => {
            matches!(node,NativeJsonNode::Number(token) if exact_safe_integer(token))
        }
        Some("boolean") => matches!(node, NativeJsonNode::Boolean(_)),
        Some("null") => matches!(node, NativeJsonNode::Null),
        _ => false,
    };
    match ty {
        Value::String(name) => matches_name(name),
        Value::Array(names) => names
            .iter()
            .any(|n| matches!(n,Value::String(name) if matches_name(name))),
        _ => true,
    }
}
fn schema_rule<'a>(node: &NativeJsonNode, schema: &'a Value, rule: &'a Value) -> &'a Value {
    let rule = schema_lookup(schema, rule);
    if let Some(Value::Array(branches)) = schema_field(rule, "anyOf") {
        for branch in branches {
            let candidate = schema_lookup(schema, branch);
            if schema_type_matches(node, candidate) {
                return schema_rule(node, schema, candidate);
            }
        }
    }
    rule
}
fn integer_rule(rule: &Value) -> bool {
    match schema_field(rule, "type") {
        Some(Value::String(v)) => v.to_utf8().ok().as_deref() == Some("integer"),
        Some(Value::Array(v)) => v
            .iter()
            .any(|x| matches!(x,Value::String(s) if s.to_utf8().ok().as_deref()==Some("integer"))),
        _ => false,
    }
}
fn schema_has_integer(rule: &Value) -> bool {
    integer_rule(rule)
        || matches!(schema_field(rule,"anyOf"),Some(Value::Array(branches)) if branches.iter().any(schema_has_integer))
}
fn validate_declared_integers(
    node: &NativeJsonNode,
    schema: &Value,
    rule: &Value,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    let rule = schema_rule(node, schema, rule);
    if schema_has_integer(rule) {
        if let NativeJsonNode::Number(token) = node {
            if !exact_safe_integer(token) {
                return Err(fail(
                    "POSTGRESQL_CATALOG_INTEGER",
                    "Declared PostgreSQL catalog integers must be exact safe integers",
                ));
            }
        }
    }
    if let (NativeJsonNode::Object(fields), Some(Value::Object(properties))) =
        (node, schema_field(rule, "properties"))
    {
        for (name, value) in fields {
            ctx.charge_work(name.len().saturating_add(1), Utf16::default())?;
            if let Some((_, child)) = properties.iter().find(|(k, _)| k == name) {
                validate_declared_integers(value, schema, child, ctx)?
            }
        }
    }
    if let (NativeJsonNode::Array(items), Some(item_rule)) = (node, schema_field(rule, "items")) {
        for item in items {
            validate_declared_integers(item, schema, item_rule, ctx)?
        }
    }
    Ok(())
}
fn schema_project(
    node: &NativeJsonNode,
    schema: &Value,
    rule: &Value,
    ctx: &mut Context<'_>,
) -> Result<Option<Value>, EngineError> {
    let rule = schema_rule(node, schema, rule);
    match node {
        NativeJsonNode::Object(fields) => {
            let Some(Value::Object(properties)) = schema_field(rule, "properties") else {
                return Ok(Some(Value::Object(Vec::new())));
            };
            let mut out = Vec::new();
            for (name, value) in fields {
                ctx.charge_work(name.len().saturating_add(1), Utf16::default())?;
                if let Some((_, child)) = properties.iter().find(|(k, _)| k == name) {
                    if let Some(projected) = schema_project(value, schema, child, ctx)? {
                        out.push((name.clone(), projected))
                    }
                }
            }
            Ok(Some(Value::Object(out)))
        }
        NativeJsonNode::Array(items) => {
            let item_rule = schema_field(rule, "items").unwrap_or(rule);
            ctx.charge_work(items.len(), Utf16::default())?;
            let mut out = Vec::new();
            for item in items {
                if let Some(value) = schema_project(item, schema, item_rule, ctx)? {
                    out.push(value)
                }
            }
            Ok(Some(Value::Array(out)))
        }
        NativeJsonNode::Number(token) => {
            if !exact_safe_integer(token) && schema_has_integer(rule) {
                return Err(fail(
                    "POSTGRESQL_CATALOG_INTEGER",
                    "Declared PostgreSQL catalog integers must be exact safe integers",
                ));
            }
            let number = token
                .parse::<f64>()
                .map_err(|_| fail("POSTGRESQL_CATALOG_SCHEMA", "Invalid declared number"))?;
            if !number.is_finite() {
                return Ok(None);
            }
            Ok(Some(Value::Number(number)))
        }
        NativeJsonNode::String(value) => {
            ctx.charge_text(value.len(), Utf16::default())?;
            Ok(Some(Value::String(value.clone())))
        }
        NativeJsonNode::Boolean(value) => Ok(Some(Value::Bool(*value))),
        NativeJsonNode::Null => Ok(Some(Value::Null)),
    }
}
fn validate_capture_schema(
    root: &NativeJsonTree,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let source = Utf16::from(include_str!(
        "../../../spec/extensions/postgresql-catalog/capture.schema.json"
    ));
    ctx.charge_text(source.len(), Utf16::default())?;
    let schema = serialization::read_json_value(source.units(), Format::Json, ctx)?;
    validate_declared_integers(root.root(), &schema, &schema, ctx)?;
    let compiled =
        CompiledSchema::compile_consumer(&schema, &SchemaResources::default(), true, ctx)?;
    let instance = schema_project(root.root(), &schema, &schema, ctx)?
        .ok_or_else(|| fail("POSTGRESQL_CATALOG_SCHEMA", "Invalid schema instance"))?;
    if !compiled.validate(&instance, ctx)?.is_empty() {
        return Err(fail(
            "POSTGRESQL_CATALOG_SCHEMA",
            "PostgreSQL capture does not match the pinned capture schema",
        ));
    }
    Ok(())
}

fn validate_supplement(
    source: &Utf16,
    schema_text: &str,
    ctx: &mut Context<'_>,
) -> Result<(NativeJsonTree, Value), EngineError> {
    if source.len() > ctx.limits().max_text_units {
        return Err(EngineError::new(
            "RESOURCE_LIMIT",
            Utf16::default(),
            "PostgreSQL supplement exceeds the text limit",
        ));
    }
    let root = NativeJsonTree::parse_json(source.units(), ctx)?;
    let schema_source = Utf16::from(schema_text);
    ctx.charge_text(schema_source.len(), Utf16::default())?;
    let schema = serialization::read_json_value(schema_source.units(), Format::Json, ctx)?;
    validate_declared_integers(root.root(), &schema, &schema, ctx)?;
    let compiled =
        CompiledSchema::compile_consumer(&schema, &SchemaResources::default(), true, ctx)?;
    let view = schema_project(root.root(), &schema, &schema, ctx)?.ok_or_else(|| {
        fail(
            "POSTGRESQL_SUPPLEMENT_SCHEMA",
            "Invalid PostgreSQL supplement",
        )
    })?;
    if !compiled.validate(&view, ctx)?.is_empty() {
        return Err(fail(
            "POSTGRESQL_SUPPLEMENT_SCHEMA",
            "PostgreSQL supplement does not match its pinned schema",
        ));
    }
    Ok((root, view))
}
pub fn inspect_facet_catalog(source: &Utf16, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let (root, view) = validate_supplement(
        source,
        include_str!(
            "../../../spec/extensions/postgresql-catalog/facet-constraints-v1.schema.json"
        ),
        ctx,
    )?;
    let constraints = match value_field(&view, "constraints") {
        Some(Value::Array(items)) => items,
        _ => {
            return Err(fail(
                "POSTGRESQL_FACET_CATALOG",
                "Expected constraints array",
            ));
        }
    };
    let mut identities = BTreeSet::new();
    let mut oids = BTreeSet::new();
    for constraint in constraints {
        let identity = [
            value_text(value_field(constraint, "schema"))
                .cloned()
                .unwrap_or_default(),
            value_text(value_field(constraint, "relation"))
                .cloned()
                .unwrap_or_default(),
            value_text(value_field(constraint, "name"))
                .cloned()
                .unwrap_or_default(),
        ];
        let oid = value_text(value_field(constraint, "oid"))
            .cloned()
            .unwrap_or_default();
        ctx.charge_work(3, Utf16::default())?;
        if !identities.insert(identity) || !oids.insert(oid) {
            return Err(fail(
                "POSTGRESQL_FACET_CATALOG",
                "Duplicate constraint identity",
            ));
        }
        let columns = match value_field(constraint, "columns") {
            Some(Value::Array(items)) => items,
            _ => {
                return Err(fail(
                    "POSTGRESQL_FACET_CATALOG",
                    "Expected constraint columns",
                ));
            }
        };
        let mut numbers = BTreeSet::new();
        let mut names = BTreeSet::new();
        for column in columns {
            let number = match value_field(column, "number") {
                Some(Value::Number(n)) => *n as i64,
                _ => {
                    return Err(fail(
                        "POSTGRESQL_FACET_CATALOG",
                        "Invalid constraint column number",
                    ));
                }
            };
            let name = value_text(value_field(column, "name"))
                .cloned()
                .ok_or_else(|| {
                    fail("POSTGRESQL_FACET_CATALOG", "Invalid constraint column name")
                })?;
            if !numbers.insert(number) || !names.insert(name) {
                return Err(fail(
                    "POSTGRESQL_FACET_CATALOG",
                    "Duplicate constraint column observation",
                ));
            }
        }
        if let Some(Value::Array(refs)) = value_field(constraint, "columnNumbers") {
            let mut seen = BTreeSet::new();
            for r in refs {
                let Value::Number(n) = r else {
                    return Err(fail("POSTGRESQL_FACET_CATALOG", "Invalid column reference"));
                };
                let n = *n as i64;
                if !seen.insert(n) || !numbers.contains(&n) {
                    return Err(fail(
                        "POSTGRESQL_FACET_CATALOG",
                        "Invalid referenced column observations",
                    ));
                }
            }
        }
    }
    Ok(make_object(vec![
        ("nativeSource", Value::String(source.clone())),
        ("root", root.tagged_value_preserving_extras(ctx)?),
        (
            "serverVersion",
            value_field(&view, "serverVersion")
                .cloned()
                .unwrap_or(Value::Null),
        ),
        (
            "encoding",
            value_field(&view, "encoding")
                .cloned()
                .unwrap_or(Value::Null),
        ),
        ("constraints", Value::Array(constraints.clone())),
        ("provenance", Value::string_utf8("unverified")),
    ]))
}
pub fn correlate_facet_catalog(
    document: &Value,
    source: &Utf16,
    datum_format: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    correlate_facet_catalog_inner(document, source, datum_format, None, ctx)
}

/// Correlate captured CHECK evidence with SQL parsed by the explicitly admitted
/// parser backend. The backend is passed by the runtime, never selected from
/// caller input. Without it the native capture remains inspectable but the
/// correlation is explicitly unsupported.
pub fn correlate_facet_catalog_with_backend(
    document: &Value,
    source: &Utf16,
    datum_format: &Utf16,
    backend: &dyn crate::parser_backend_protocol::PostgresqlParserBackend,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    if backend.identity() != crate::parser_backend_protocol::PARSER_BACKEND_IDENTITY {
        return Err(fail(
            "POSTGRESQL_BACKEND",
            "Pinned PostgreSQL parser backend required",
        ));
    }
    correlate_facet_catalog_inner(document, source, datum_format, Some(backend), ctx)
}

fn correlate_facet_catalog_inner(
    document: &Value,
    source: &Utf16,
    datum_format: &Utf16,
    backend: Option<&dyn crate::parser_backend_protocol::PostgresqlParserBackend>,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let supplement = inspect_facet_catalog(source, ctx)?;
    let capture = catalog_from_document(document, ctx)?;
    if capture.state != key("captured") {
        return Err(fail(
            "POSTGRESQL_FACET_CATALOG",
            "Modified capture cannot establish correspondence",
        ));
    }
    if !matches!(field(capture.root.root(),"serverVersion"),Some(NativeJsonNode::Number(n)) if n=="170004")
    {
        return Err(fail("POSTGRESQL_FACET_CATALOG", "Server versions disagree"));
    }
    let relations = as_array(field(
        field(capture.root.root(), "snapshot").unwrap_or(&NativeJsonNode::Null),
        "relations",
    ))
    .ok_or_else(|| fail("POSTGRESQL_FACET_CATALOG", "Expected catalog relations"))?;
    let constraints: &[Value] = value_field(&supplement, "constraints")
        .and_then(|v| {
            if let Value::Array(a) = v {
                Some(a.as_slice())
            } else {
                None
            }
        })
        .unwrap_or(&[]);
    let mut seen_relations = BTreeSet::new();
    let mut seen_checks = BTreeSet::new();
    let mut matches = Vec::new();
    for (ri, relation) in relations.iter().enumerate() {
        let schema = as_text(field(relation, "schema"))
            .ok_or_else(|| fail("POSTGRESQL_FACET_CATALOG", "Relation schema missing"))?;
        let name = as_text(field(relation, "name"))
            .ok_or_else(|| fail("POSTGRESQL_FACET_CATALOG", "Relation name missing"))?;
        if !seen_relations.insert((schema.clone(), name.clone())) {
            return Err(fail(
                "POSTGRESQL_FACET_CATALOG",
                "Ambiguous relation identity",
            ));
        }
        let native_checks = as_array(field(relation, "constraints")).unwrap_or(&[]);
        let native_columns = as_array(field(relation, "columns")).unwrap_or(&[]);
        for check in native_checks {
            if as_text(field(check, "kind")) != Some(&key("c")) {
                continue;
            }
            let constraint = as_text(field(check, "name"))
                .ok_or_else(|| fail("POSTGRESQL_FACET_CATALOG", "Unnamed CHECK constraint"))?;
            if !seen_checks.insert((schema.clone(), name.clone(), constraint.clone())) {
                return Err(fail("POSTGRESQL_FACET_CATALOG", "Duplicate CHECK identity"));
            }
            let c = constraints
                .iter()
                .find(|row| {
                    value_text(value_field(row, "schema")) == Some(schema)
                        && value_text(value_field(row, "relation")) == Some(name)
                        && value_text(value_field(row, "name")) == Some(constraint)
                })
                .ok_or_else(|| {
                    fail(
                        "POSTGRESQL_FACET_CATALOG",
                        "CHECK is absent from supplement",
                    )
                })?;
            let validated_agrees = matches!((value_field(c,"validated"),field(check,"validated")),(Some(Value::Bool(a)),Some(NativeJsonNode::Boolean(b))) if a==b);
            if value_text(value_field(c, "relationKind")) != as_text(field(relation, "kind"))
                || value_text(value_field(c, "definition")) != as_text(field(check, "definition"))
                || !validated_agrees
                || !matches!(
                    value_field(c, "deferrable"),
                    None | Some(Value::Bool(false))
                )
                || !matches!(value_field(c, "deferred"), None | Some(Value::Bool(false)))
            {
                return Err(fail(
                    "POSTGRESQL_FACET_CATALOG",
                    "Constraint observations disagree",
                ));
            }
            let cols = value_field(c, "columns")
                .and_then(|v| {
                    if let Value::Array(a) = v {
                        Some(a)
                    } else {
                        None
                    }
                })
                .ok_or_else(|| {
                    fail(
                        "POSTGRESQL_FACET_CATALOG",
                        "Constraint column observations missing",
                    )
                })?;
            if cols.len() != native_columns.len() {
                return Err(fail(
                    "POSTGRESQL_FACET_CATALOG",
                    "Relation column coverage differs",
                ));
            }
            let mut paths = Vec::new();
            let mut names = BTreeSet::new();
            let mut positions = BTreeSet::new();
            for (ci, column) in native_columns.iter().enumerate() {
                let cn = as_text(field(column, "name")).ok_or_else(|| {
                    fail("POSTGRESQL_FACET_CATALOG", "Native column name missing")
                })?;
                let pos = number_i64(field(column, "position")).ok_or_else(|| {
                    fail("POSTGRESQL_FACET_CATALOG", "Native column position missing")
                })?;
                if !names.insert(cn.clone()) || !positions.insert(pos) {
                    return Err(fail(
                        "POSTGRESQL_FACET_CATALOG",
                        "Ambiguous native column identity",
                    ));
                }
                let obs = cols
                    .iter()
                    .find(|row| {
                        value_text(value_field(row, "name")) == Some(cn)
                            && value_number_i64(value_field(row, "number")) == Some(pos)
                    })
                    .ok_or_else(|| {
                        fail("POSTGRESQL_FACET_CATALOG", "Column missing from supplement")
                    })?;
                let ty = field(column, "nativeType")
                    .ok_or_else(|| fail("POSTGRESQL_FACET_CATALOG", "Native type missing"))?;
                for (native_key, observed_key) in [
                    ("schema", "typeSchema"),
                    ("name", "typeName"),
                    ("kind", "typeKind"),
                ] {
                    if as_text(field(ty, native_key)) != value_text(value_field(obs, observed_key))
                    {
                        return Err(fail(
                            "POSTGRESQL_FACET_CATALOG",
                            "Native type identity disagrees",
                        ));
                    }
                }
                if number_i64(field(ty, "modifier"))
                    != value_number_i64(value_field(obs, "modifier"))
                    || number_i64(field(ty, "dimensions"))
                        != value_number_i64(value_field(obs, "dimensions"))
                {
                    return Err(fail(
                        "POSTGRESQL_FACET_CATALOG",
                        "Native type dimensions disagree",
                    ));
                }
                paths.push((
                    cn.clone(),
                    Utf16::from(format!("/snapshot/relations/{ri}/columns/{ci}")),
                    pos,
                ));
            }
            let column_numbers = value_field(c, "columnNumbers");
            let selected=paths.into_iter().filter(|(_,_,n)|matches!(column_numbers,Some(Value::Array(rows)) if rows.contains(&Value::Number(*n as f64)))).map(|(name,path,_)|make_object(vec![("name",Value::String(name)),("path",Value::String(path))])).collect();
            let inspection = if let Some(backend) = backend {
                let resolved = inspect_resolved_predicate(
                    c,
                    &Value::Number(170004.0),
                    &Value::string_utf8("UTF8"),
                    &Value::String(datum_format.clone()),
                    ctx,
                )?;
                if string_is(value_field(&resolved, "state"), "verified-expression") {
                    let expected_definition = format!(
                        "CHECK ({}){}{}",
                        value_text(value_field(c, "expression"))
                            .and_then(|v| v.to_utf8().ok())
                            .ok_or_else(|| fail(
                                "POSTGRESQL_FACET_CATALOG",
                                "CHECK expression missing"
                            ))?,
                        if matches!(value_field(c, "noInherit"), Some(Value::Bool(true))) {
                            " NO INHERIT"
                        } else {
                            ""
                        },
                        if matches!(value_field(c, "validated"), Some(Value::Bool(false))) {
                            " NOT VALID"
                        } else {
                            ""
                        },
                    );
                    if value_text(value_field(c, "definition"))
                        .and_then(|v| v.to_utf8().ok())
                        .as_deref()
                        != Some(expected_definition.as_str())
                    {
                        return Err(fail(
                            "POSTGRESQL_FACET_CATALOG",
                            "CHECK definition and expression disagree",
                        ));
                    }
                    let column = cols.iter().find(|row| {
                        matches!(column_numbers, Some(Value::Array(numbers)) if numbers.iter().any(|n| value_number_i64(Some(n)) == value_number_i64(value_field(row, "number"))))
                    }).and_then(|row| value_text(value_field(row, "name"))).ok_or_else(|| fail("POSTGRESQL_FACET_CATALOG", "Resolved CHECK column missing"))?;
                    let expression = value_text(value_field(c, "expression"))
                        .and_then(|v| v.to_utf8().ok())
                        .ok_or_else(|| {
                            fail("POSTGRESQL_FACET_CATALOG", "CHECK expression missing")
                        })?;
                    let sql = Utf16::from(format!("SELECT {expression}"));
                    ctx.charge_text(sql.len(), Utf16::default())?;
                    ctx.charge_work(sql.len(), Utf16::default())?;
                    let ast = copy_json(&backend.parse(&sql, ctx)?, ctx)?;
                    let syntax = inspect_facet_predicate(&ast, column, ctx)?;
                    if !string_is(value_field(&syntax, "state"), "candidate") {
                        return Err(fail(
                            "POSTGRESQL_FACET_CATALOG",
                            "Analyzed tree has no corresponding supported SQL syntax",
                        ));
                    }
                    let syntax_terms = value_field(&syntax, "candidates")
                        .and_then(|v| match v {
                            Value::Array(a) => Some(a),
                            _ => None,
                        })
                        .ok_or_else(|| {
                            fail("POSTGRESQL_FACET_CATALOG", "Predicate candidates missing")
                        })?;
                    let resolved_terms = value_field(&resolved, "terms")
                        .and_then(|v| match v {
                            Value::Array(a) => Some(a),
                            _ => None,
                        })
                        .ok_or_else(|| {
                            fail("POSTGRESQL_FACET_CATALOG", "Resolved terms missing")
                        })?;
                    if !predicate_terms_correspond(syntax_terms, resolved_terms) {
                        return Err(fail(
                            "POSTGRESQL_FACET_CATALOG",
                            "Analyzed predicate and SQL expression values disagree",
                        ));
                    }
                    resolved
                } else {
                    resolved
                }
            } else {
                make_object(vec![
                    ("native", c.clone()),
                    ("state", Value::string_utf8("unsupported")),
                    ("terms", Value::Array(Vec::new())),
                    ("nonNullValuesOnly", Value::Bool(true)),
                    (
                        "requires",
                        Value::string_utf8("retained-catalog-correspondence-and-projection-scope"),
                    ),
                ])
            };
            matches.push(make_object(vec![
                (
                    "identity",
                    make_object(vec![
                        ("schema", Value::String(schema.clone())),
                        ("relation", Value::String(name.clone())),
                        ("constraint", Value::String(constraint.clone())),
                    ]),
                ),
                ("columns", Value::Array(selected)),
                ("inspection", inspection),
            ]));
        }
    }
    if matches.len() != constraints.len() {
        return Err(fail(
            "POSTGRESQL_FACET_CATALOG",
            "Supplement contains CHECKs absent from captured catalog",
        ));
    }
    Ok(make_object(vec![
        ("nativeSupplement", Value::String(source.clone())),
        (
            "root",
            NativeJsonTree::parse_json(source.units(), ctx)?.tagged_value_preserving_extras(ctx)?,
        ),
        ("nativeCatalog", Value::String(capture.export(ctx)?)),
        ("matches", Value::Array(matches)),
        ("sameSnapshotVerified", Value::Bool(false)),
        ("authenticated", Value::Bool(false)),
    ]))
}

fn predicate_terms_correspond(syntax: &[Value], resolved: &[Value]) -> bool {
    fn normalize_decimal(s: &Utf16) -> Option<String> {
        let mut text = s.to_utf8().ok()?;
        if let Some(dot) = text.find('.') {
            while text.ends_with('0') {
                text.pop();
            }
            if text.ends_with('.') {
                text.pop();
            }
            if text.len() < dot {
                return None;
            }
        }
        if text == "-0" {
            text = "0".to_owned();
        }
        Some(text)
    }
    if syntax.len() != resolved.len() {
        return false;
    }
    syntax.iter().zip(resolved).all(|(candidate, actual)| {
        match (
            value_text(value_field(candidate, "kind")),
            value_text(value_field(actual, "kind")),
        ) {
            (Some(a), Some(b)) if a == &key("bound") && b == &key("bound") => {
                value_text(value_field(candidate, "operator"))
                    == value_text(value_field(actual, "operator"))
                    && value_text(value_field(candidate, "literal")).and_then(normalize_decimal)
                        == value_text(value_field(actual, "literal")).and_then(normalize_decimal)
            }
            (Some(a), Some(b)) if a == &key("length") && b == &key("length") => {
                let unit = value_field(candidate, "functionName")
                    .and_then(|v| match v {
                        Value::Array(a) => a.last(),
                        _ => None,
                    })
                    .and_then(|v| value_text(Some(v)))
                    .map(|v| {
                        if v == &key("char_length") {
                            key("unicode-scalar")
                        } else {
                            key("byte")
                        }
                    });
                unit.as_ref() == value_text(value_field(actual, "unit"))
                    && value_text(value_field(candidate, "max"))
                        == value_text(value_field(actual, "max"))
            }
            (Some(a), Some(b)) if a == &key("scale") && b == &key("scale") => {
                value_text(value_field(candidate, "scale"))
                    == value_text(value_field(actual, "scale"))
            }
            _ => false,
        }
    })
}
pub fn inspect_cardinality_catalog(
    source: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let (root, view) = validate_supplement(
        source,
        include_str!("../../../spec/extensions/postgresql-catalog/cardinality-v1.schema.json"),
        ctx,
    )?;
    let columns = match value_field(&view, "columns") {
        Some(Value::Array(items)) => items,
        _ => {
            return Err(fail(
                "POSTGRESQL_CARDINALITY_CATALOG",
                "Expected columns array",
            ));
        }
    };
    let types = match value_field(&view, "types") {
        Some(Value::Array(items)) => items,
        _ => {
            return Err(fail(
                "POSTGRESQL_CARDINALITY_CATALOG",
                "Expected types array",
            ));
        }
    };
    let id = |v: &Value| {
        Some((
            value_text(value_field(v, "schema"))?.clone(),
            value_text(value_field(v, "name"))?.clone(),
        ))
    };
    let mut type_ids = BTreeSet::new();
    let mut type_rows = Vec::new();
    for ty in types {
        ctx.charge_work(1, Utf16::default())?;
        let identity = id(value_field(ty, "identity").unwrap_or(&Value::Null))
            .ok_or_else(|| fail("POSTGRESQL_CARDINALITY_CATALOG", "Malformed type identity"))?;
        if !type_ids.insert(identity) {
            return Err(fail(
                "POSTGRESQL_CARDINALITY_CATALOG",
                "Duplicate type identity",
            ));
        }
        type_rows.push(ty);
    }
    for ty in &type_rows {
        for edge in ["element", "base"] {
            if let Some(target) = value_field(ty, edge) {
                if !matches!(target, Value::Null) {
                    let target_id = id(target).ok_or_else(|| {
                        fail("POSTGRESQL_CARDINALITY_CATALOG", "Malformed type edge")
                    })?;
                    if !type_ids.contains(&target_id) {
                        return Err(fail(
                            "POSTGRESQL_CARDINALITY_CATALOG",
                            "Type refers to a missing identity",
                        ));
                    }
                }
            }
        }
        let kind = value_text(value_field(ty, "kind"));
        let category = value_text(value_field(ty, "category"));
        let element = value_field(ty, "element");
        let base = value_field(ty, "base");
        let standard = matches!(value_field(ty, "standardArray"), Some(Value::Bool(true)));
        if standard
            && (matches!(element, None | Some(Value::Null))
                || kind != Some(&key("b"))
                || category != Some(&key("A"))
                || !matches!(base, None | Some(Value::Null)))
        {
            return Err(fail(
                "POSTGRESQL_CARDINALITY_CATALOG",
                "Inconsistent standard array observation",
            ));
        }
        if kind == Some(&key("d")) && matches!(base, None | Some(Value::Null)) {
            return Err(fail(
                "POSTGRESQL_CARDINALITY_CATALOG",
                "Domain without base type",
            ));
        }
        if kind != Some(&key("d")) && !matches!(base, None | Some(Value::Null)) {
            return Err(fail(
                "POSTGRESQL_CARDINALITY_CATALOG",
                "Non-domain type has base type",
            ));
        }
    }
    for start in &type_rows {
        let mut seen = BTreeSet::new();
        let mut current = *start;
        loop {
            let Some(base) = value_field(current, "base") else {
                break;
            };
            if matches!(base, Value::Null) {
                break;
            }
            let here = id(value_field(current, "identity").unwrap_or(&Value::Null))
                .ok_or_else(|| fail("POSTGRESQL_CARDINALITY_CATALOG", "Malformed type identity"))?;
            let next = id(base).ok_or_else(|| {
                fail(
                    "POSTGRESQL_CARDINALITY_CATALOG",
                    "Malformed domain base identity",
                )
            })?;
            if !seen.insert(here) || seen.contains(&next) {
                return Err(fail(
                    "POSTGRESQL_CARDINALITY_CATALOG",
                    "Cyclic domain base observations",
                ));
            }
            current = type_rows
                .iter()
                .copied()
                .find(|row| {
                    id(value_field(row, "identity").unwrap_or(&Value::Null)) == Some(next.clone())
                })
                .ok_or_else(|| {
                    fail(
                        "POSTGRESQL_CARDINALITY_CATALOG",
                        "Domain base observation missing",
                    )
                })?;
        }
    }
    let mut column_ids = BTreeSet::new();
    for column in columns {
        ctx.charge_work(1, Utf16::default())?;
        let mut cols = Vec::new();
        for name in ["schema", "relation", "name"] {
            cols.push(
                value_text(value_field(column, name))
                    .cloned()
                    .unwrap_or_default(),
            )
        }
        if !column_ids.insert(cols) {
            return Err(fail(
                "POSTGRESQL_CARDINALITY_CATALOG",
                "Duplicate column identity",
            ));
        }
        let ty = id(value_field(column, "type").unwrap_or(&Value::Null)).ok_or_else(|| {
            fail(
                "POSTGRESQL_CARDINALITY_CATALOG",
                "Column type identity is malformed",
            )
        })?;
        if !type_ids.contains(&ty) {
            return Err(fail(
                "POSTGRESQL_CARDINALITY_CATALOG",
                "Column refers to a missing type",
            ));
        }
    }
    Ok(make_object(vec![
        ("nativeSource", Value::String(source.clone())),
        ("root", root.tagged_value_preserving_extras(ctx)?),
        (
            "serverVersion",
            value_field(&view, "serverVersion")
                .cloned()
                .unwrap_or(Value::Null),
        ),
        ("columns", Value::Array(columns.clone())),
        ("types", Value::Array(types.clone())),
        (
            "qualifiedVersion",
            Value::Bool(
                matches!(value_field(&view,"serverVersion"),Some(Value::Number(v)) if *v==170004.0),
            ),
        ),
    ]))
}
pub fn resolve_cardinality_type(
    source: &Utf16,
    schema: &Utf16,
    relation: &Utf16,
    name: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let inspected = inspect_cardinality_catalog(source, ctx)?;
    let columns: &[Value] = value_field(&inspected, "columns")
        .and_then(|v| {
            if let Value::Array(x) = v {
                Some(x.as_slice())
            } else {
                None
            }
        })
        .unwrap_or(&[]);
    let column = columns
        .iter()
        .find(|c| {
            value_text(value_field(c, "schema")) == Some(schema)
                && value_text(value_field(c, "relation")) == Some(relation)
                && value_text(value_field(c, "name")) == Some(name)
        })
        .ok_or_else(|| fail("POSTGRESQL_CARDINALITY_CATALOG", "Column not captured"))?;
    let types: &[Value] = value_field(&inspected, "types")
        .and_then(|v| {
            if let Value::Array(x) = v {
                Some(x.as_slice())
            } else {
                None
            }
        })
        .unwrap_or(&[]);
    let identity = value_field(column, "type").cloned().unwrap_or(Value::Null);
    let key_for = |v: &Value| {
        let i = value_field(v, "identity")?;
        Some((
            value_text(value_field(i, "schema"))?.clone(),
            value_text(value_field(i, "name"))?.clone(),
        ))
    };
    let mut current = types
        .iter()
        .find(|t| key_for(t) == key_for(&make_object(vec![("identity", identity.clone())])))
        .ok_or_else(|| fail("POSTGRESQL_CARDINALITY_CATALOG", "Column type is missing"))?;
    let mut domains = Vec::new();
    let mut visited = BTreeSet::new();
    while let Some(base) = value_field(current, "base") {
        if matches!(base, Value::Null) {
            break;
        }
        let k = key_for(&make_object(vec![("identity", base.clone())])).ok_or_else(|| {
            fail(
                "POSTGRESQL_CARDINALITY_CATALOG",
                "Domain base identity is malformed",
            )
        })?;
        if !visited.insert(k.clone()) {
            return Err(fail(
                "POSTGRESQL_CARDINALITY_CATALOG",
                "Cyclic domain base observations",
            ));
        }
        domains.push(current.clone());
        current = types
            .iter()
            .find(|t| key_for(t).as_ref() == Some(&k))
            .ok_or_else(|| fail("POSTGRESQL_CARDINALITY_CATALOG", "Domain base is missing"))?;
    }
    let element_identity = value_field(current, "element").filter(|v| !matches!(v, Value::Null));
    let element = element_identity
        .and_then(|identity| {
            types.iter().find(|row| {
                key_for(row) == key_for(&make_object(vec![("identity", identity.clone())]))
            })
        })
        .cloned()
        .unwrap_or(Value::Null);
    Ok(make_object(vec![
        ("column", column.clone()),
        ("domains", Value::Array(domains)),
        ("native", current.clone()),
        ("element", element),
        (
            "standardArray",
            value_field(current, "standardArray")
                .cloned()
                .unwrap_or(Value::Bool(false)),
        ),
        (
            "qualifiedVersion",
            value_field(&inspected, "qualifiedVersion")
                .cloned()
                .unwrap_or(Value::Bool(false)),
        ),
        ("nativeSource", Value::String(source.clone())),
        (
            "root",
            value_field(&inspected, "root")
                .cloned()
                .unwrap_or(Value::Null),
        ),
    ]))
}

pub fn correlate_cardinality_catalog(
    document: &Value,
    source: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let supplement = inspect_cardinality_catalog(source, ctx)?;
    let capture = catalog_from_document(document, ctx)?;
    if capture.state != key("captured") {
        return Err(fail(
            "POSTGRESQL_CARDINALITY_CORRELATION",
            "Modified catalog cannot establish observation correspondence",
        ));
    }
    let server = field(capture.root.root(), "serverVersion");
    let expected = match server {
        Some(NativeJsonNode::Number(n)) => n.parse::<i64>().ok(),
        _ => None,
    };
    let actual = match value_field(&supplement, "serverVersion") {
        Some(Value::Number(n)) => Some(*n as i64),
        _ => None,
    };
    if expected.is_none() || expected != actual {
        return Err(fail(
            "POSTGRESQL_CARDINALITY_CORRELATION",
            "Catalog server versions disagree",
        ));
    }
    let observations = capture
        .columns(ctx)?
        .into_iter()
        .filter(|c| {
            matches!(
                c.kind.to_utf8().ok().as_deref(),
                Some("r" | "p" | "v" | "m" | "f")
            )
        })
        .collect::<Vec<_>>();
    let other = match value_field(&supplement, "columns") {
        Some(Value::Array(rows)) => rows,
        _ => {
            return Err(fail(
                "POSTGRESQL_CARDINALITY_CORRELATION",
                "Supplement columns are missing",
            ));
        }
    };
    if observations.len() != other.len() {
        return Err(fail(
            "POSTGRESQL_CARDINALITY_CORRELATION",
            "Catalog column coverage differs",
        ));
    }
    let mut seen = BTreeSet::new();
    let mut matches = Vec::new();
    for column in observations {
        let identity = (
            column.schema.clone(),
            column.relation.clone(),
            value_text(value_field(&column.element, "name"))
                .cloned()
                .unwrap_or_default(),
        );
        ctx.charge_work(
            identity
                .0
                .len()
                .saturating_add(identity.1.len())
                .saturating_add(identity.2.len()),
            Utf16::default(),
        )?;
        if !seen.insert(identity.clone()) {
            return Err(fail(
                "POSTGRESQL_CARDINALITY_CORRELATION",
                "Ambiguous catalog column identity",
            ));
        }
        let row = other
            .iter()
            .find(|row| {
                value_text(value_field(row, "schema")) == Some(&identity.0)
                    && value_text(value_field(row, "relation")) == Some(&identity.1)
                    && value_text(value_field(row, "name")) == Some(&identity.2)
            })
            .ok_or_else(|| {
                fail(
                    "POSTGRESQL_CARDINALITY_CORRELATION",
                    "Catalog column is absent from supplement",
                )
            })?;
        let native = NativeJsonTree::from_tagged_value(&column.native_column, ctx)?;
        let n = native.root();
        let t = field(n, "nativeType").ok_or_else(|| {
            fail(
                "POSTGRESQL_CARDINALITY_CORRELATION",
                "Catalog lacks explicit native type",
            )
        })?;
        let type_identity = value_field(row, "type").unwrap_or(&Value::Null);
        let types: &[Value] = value_field(&supplement, "types")
            .and_then(|v| {
                if let Value::Array(items) = v {
                    Some(items.as_slice())
                } else {
                    None
                }
            })
            .unwrap_or(&[]);
        let type_row = types
            .iter()
            .find(|candidate| {
                value_text(value_field(
                    value_field(candidate, "identity").unwrap_or(&Value::Null),
                    "schema",
                )) == value_text(value_field(type_identity, "schema"))
                    && value_text(value_field(
                        value_field(candidate, "identity").unwrap_or(&Value::Null),
                        "name",
                    )) == value_text(value_field(type_identity, "name"))
            })
            .ok_or_else(|| {
                fail(
                    "POSTGRESQL_CARDINALITY_CORRELATION",
                    "Type identity missing from supplement",
                )
            })?;
        let equal = as_text(field(t, "schema")) == value_text(value_field(type_identity, "schema"))
            && as_text(field(t, "name")) == value_text(value_field(type_identity, "name"))
            && as_text(field(t, "kind")) == value_text(value_field(type_row, "kind"))
            && as_text(field(t, "category")) == value_text(value_field(type_row, "category"))
            && number_i64(field(t, "dimensions"))
                == value_number_i64(value_field(row, "declaredDimensions"))
            && number_i64(field(n, "position")) == value_number_i64(value_field(row, "ordinal"));
        if !equal {
            return Err(fail(
                "POSTGRESQL_CARDINALITY_CORRELATION",
                "Catalog type or ordinal observations disagree",
            ));
        }
        let type_identity = value_field(row, "type").cloned().unwrap_or(Value::Null);
        matches.push(make_object(vec![
            ("column", Value::String(column.path)),
            (
                "identity",
                make_object(vec![
                    ("schema", Value::String(identity.0)),
                    ("relation", Value::String(identity.1)),
                    ("name", Value::String(identity.2)),
                ]),
            ),
            ("type", type_identity),
        ]));
    }
    Ok(make_object(vec![
        ("matches", Value::Array(matches)),
        (
            "qualifiedVersion",
            value_field(&supplement, "qualifiedVersion")
                .cloned()
                .unwrap_or(Value::Bool(false)),
        ),
        ("sameSnapshotVerified", Value::Bool(false)),
        ("nativeSupplement", Value::String(source.clone())),
    ]))
}
fn number_i64(node: Option<&NativeJsonNode>) -> Option<i64> {
    match node {
        Some(NativeJsonNode::Number(token)) => token.parse().ok(),
        _ => None,
    }
}
fn value_number_i64(node: Option<&Value>) -> Option<i64> {
    match node {
        Some(Value::Number(number)) if number.is_finite() && number.fract() == 0.0 => {
            Some(*number as i64)
        }
        _ => None,
    }
}
pub fn inspect_key_catalog(source: &Utf16, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let (root, view) = validate_supplement(
        source,
        include_str!("../../../spec/extensions/postgresql-catalog/key-observations-v1.schema.json"),
        ctx,
    )?;
    let indexes = match value_field(&view, "indexes") {
        Some(Value::Array(items)) => items,
        _ => return Err(fail("POSTGRESQL_KEY_CATALOG", "Expected indexes array")),
    };
    let mut identities = BTreeSet::new();
    for index in indexes {
        let schema = value_text(value_field(index, "schema"))
            .cloned()
            .unwrap_or_default();
        let name = value_text(value_field(index, "index"))
            .cloned()
            .unwrap_or_default();
        ctx.charge_work(schema.len().saturating_add(name.len()), Utf16::default())?;
        if !identities.insert((schema, name)) {
            return Err(fail(
                "POSTGRESQL_KEY_CATALOG",
                "Duplicate schema/index identity",
            ));
        }
        let comps = match value_field(index, "components") {
            Some(Value::Array(items)) => items,
            _ => return Err(fail("POSTGRESQL_KEY_CATALOG", "Expected component array")),
        };
        let key_count = match value_field(index, "keyCount") {
            Some(Value::Number(n)) => *n as usize,
            _ => return Err(fail("POSTGRESQL_KEY_CATALOG", "Missing key count")),
        };
        let attribute_count = match value_field(index, "attributeCount") {
            Some(Value::Number(n)) => *n as usize,
            _ => return Err(fail("POSTGRESQL_KEY_CATALOG", "Missing attribute count")),
        };
        if key_count > attribute_count || comps.len() != attribute_count {
            return Err(fail(
                "POSTGRESQL_KEY_CATALOG",
                "Key and attribute component counts disagree",
            ));
        }
        let mut expression = false;
        for (at, component) in comps.iter().enumerate() {
            if value_field(component, "position") != Some(&Value::Number((at + 1) as f64)) {
                return Err(fail(
                    "POSTGRESQL_KEY_CATALOG",
                    "Component positions must be ordered and complete",
                ));
            }
            let attribute = match value_field(component, "attribute") {
                Some(Value::Number(n)) => *n as i64,
                _ => {
                    return Err(fail(
                        "POSTGRESQL_KEY_CATALOG",
                        "Invalid component attribute",
                    ));
                }
            };
            if attribute == 0 {
                expression = true;
            }
            if attribute > 0
                && (matches!(value_field(component, "name"), None | Some(Value::Null))
                    || matches!(value_field(component, "type"), None | Some(Value::Null)))
            {
                return Err(fail(
                    "POSTGRESQL_KEY_CATALOG",
                    "Column component needs resolved observations",
                ));
            }
            if attribute == 0
                && (!matches!(value_field(component, "name"), None | Some(Value::Null))
                    || !matches!(value_field(component, "notNull"), None | Some(Value::Null))
                    || !matches!(value_field(component, "type"), None | Some(Value::Null)))
            {
                return Err(fail(
                    "POSTGRESQL_KEY_CATALOG",
                    "Expression component cannot claim a column identity",
                ));
            }
        }
        if expression != !matches!(value_field(index, "expressions"), None | Some(Value::Null)) {
            return Err(fail(
                "POSTGRESQL_KEY_CATALOG",
                "Expression metadata and component identities disagree",
            ));
        }
        if matches!(value_field(index, "primary"), Some(Value::Bool(true)))
            && !matches!(value_field(index, "unique"), Some(Value::Bool(true)))
        {
            return Err(fail(
                "POSTGRESQL_KEY_CATALOG",
                "Primary index must be unique",
            ));
        }
        if let Some(constraint) = value_field(index, "constraint") {
            if !matches!(constraint, Value::Null) {
                if !matches!(value_field(index, "unique"), Some(Value::Bool(true))) {
                    return Err(fail(
                        "POSTGRESQL_KEY_CATALOG",
                        "Constraint-backed index must be unique",
                    ));
                }
                let kind = value_text(value_field(constraint, "kind"));
                let primary = matches!(value_field(index, "primary"), Some(Value::Bool(true)));
                if primary != (kind == Some(&key("p"))) {
                    return Err(fail(
                        "POSTGRESQL_KEY_CATALOG",
                        "Constraint/index kind disagreement",
                    ));
                }
                if matches!(value_field(constraint, "deferred"), Some(Value::Bool(true)))
                    && !matches!(
                        value_field(constraint, "deferrable"),
                        Some(Value::Bool(true))
                    )
                {
                    return Err(fail(
                        "POSTGRESQL_KEY_CATALOG",
                        "Deferred constraint is not deferrable",
                    ));
                }
            }
        }
    }
    Ok(make_object(vec![
        ("root", root.tagged_value_preserving_extras(ctx)?),
        ("nativeSource", Value::String(source.clone())),
        (
            "serverVersion",
            value_field(&view, "serverVersion")
                .cloned()
                .unwrap_or(Value::Null),
        ),
        (
            "encoding",
            value_field(&view, "encoding")
                .cloned()
                .unwrap_or(Value::Null),
        ),
        (
            "query",
            value_field(&view, "query").cloned().unwrap_or(Value::Null),
        ),
        ("indexes", Value::Array(indexes.clone())),
        ("provenance", Value::string_utf8("unverified")),
    ]))
}

/// Interpret only the closed PostgreSQL 17.4 node-tree and little-endian Datum
/// subset implemented below. Unknown node fields, lookup rows, types, operators,
/// expression shapes and profile values remain retained but unsupported.
pub fn inspect_resolved_predicate(
    input: &Value,
    server_version: &Value,
    encoding: &Value,
    datum_format: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let native = copy_json(input, ctx)?;
    let qualified = matches!(server_version,Value::Number(v) if *v==170004.0)
        && matches!(encoding,Value::String(v) if v==&key("UTF8"))
        && matches!(datum_format,Value::String(v) if v==&key("little-endian-datum64"));
    let terms = if qualified {
        simple_resolved_bound(&native, ctx)?
    } else {
        None
    };
    let verified = terms.is_some();
    Ok(make_object(vec![
        ("native", native),
        (
            "state",
            Value::string_utf8(if verified {
                "verified-expression"
            } else {
                "unsupported"
            }),
        ),
        ("terms", Value::Array(terms.unwrap_or_default())),
        ("nonNullValuesOnly", Value::Bool(true)),
        (
            "valueScope",
            if verified && matches!(value_field(input, "validated"), Some(Value::Bool(true))) {
                Value::string_utf8("stored-and-new-values")
            } else if verified {
                Value::string_utf8("new-values-only")
            } else {
                Value::Null
            },
        ),
        (
            "requires",
            Value::string_utf8("retained-catalog-correspondence-and-projection-scope"),
        ),
    ]))
}
fn simple_resolved_bound(
    native: &Value,
    ctx: &mut Context<'_>,
) -> Result<Option<Vec<Value>>, EngineError> {
    let s = |name: &str| value_text(value_field(native, name)).and_then(|v| v.to_utf8().ok());
    if s("relationKind").as_deref() != Some("r")
        || !matches!(value_field(native, "validated"), Some(Value::Bool(_)))
        || !matches!(value_field(native, "isLocal"), Some(Value::Bool(true)))
        || !matches!(value_field(native, "noInherit"), Some(Value::Bool(_)))
        || value_number_i64(value_field(native, "inheritanceCount")) != Some(0)
        || s("parentOid").as_deref() != Some("0")
    {
        return Ok(None);
    }
    let Some(tree) = s("nodeTree") else {
        return Ok(None);
    };
    ctx.charge_text(tree.encode_utf16().count(), Utf16::default())?;
    let Some(node) = pg_node_tree::parse(&tree) else {
        return Ok(None);
    };
    let Some(Value::Array(numbers)) = value_field(native, "columnNumbers") else {
        return Ok(None);
    };
    if numbers.len() != 1 {
        return Ok(None);
    }
    let Some(number) = value_number_i64(numbers.first()) else {
        return Ok(None);
    };
    if !(1..=1600).contains(&number) {
        return Ok(None);
    }
    let Some(Value::Array(columns)) = value_field(native, "columns") else {
        return Ok(None);
    };
    let selected: Vec<_> = columns
        .iter()
        .filter(|c| value_number_i64(value_field(c, "number")) == Some(number))
        .collect();
    if selected.len() != 1 {
        return Ok(None);
    }
    let column = selected[0];
    let Some(type_oid) = value_text(value_field(column, "typeOid")).and_then(|v| v.to_utf8().ok())
    else {
        return Ok(None);
    };
    let Some(type_name) =
        value_text(value_field(column, "typeName")).and_then(|v| v.to_utf8().ok())
    else {
        return Ok(None);
    };
    let Some(modifier) = value_number_i64(value_field(column, "modifier")) else {
        return Ok(None);
    };
    if !string_is(value_field(column, "typeSchema"), "pg_catalog")
        || !string_is(value_field(column, "typeKind"), "b")
        || value_number_i64(value_field(column, "dimensions")) != Some(0)
        || modifier < -1
        || modifier > 2147483647
    {
        return Ok(None);
    }
    let Some(Value::Array(lookups)) = value_field(native, "operatorLookups") else {
        return Ok(None);
    };
    let Some(Value::Array(functions)) = value_field(native, "functionLookups") else {
        return Ok(None);
    };
    let number_text = number.to_string();
    let modifier_text = modifier.to_string();
    let type_info = match (type_oid.as_str(), type_name.as_str()) {
        ("21", "int2") => ("21", "int2"),
        ("23", "int4") => ("23", "int4"),
        ("20", "int8") => ("20", "int8"),
        ("1700", "numeric") => ("1700", "numeric"),
        ("25", "text") => ("25", "text"),
        ("17", "bytea") => ("17", "bytea"),
        _ => return Ok(None),
    };
    let mut used_ops = std::collections::BTreeSet::<String>::new();
    let mut used_functions = std::collections::BTreeSet::<String>::new();
    let mut terms = Vec::new();
    let ok = resolved_walk(
        &node,
        type_info.0,
        number,
        modifier,
        &lookups,
        &functions,
        &mut used_ops,
        &mut used_functions,
        &mut terms,
        ctx,
    )?;
    if !ok || used_ops.len() != lookups.len() || used_functions.len() != functions.len() {
        return Ok(None);
    }
    Ok(Some(terms))
}

fn resolved_walk(
    node: &pg_node_tree::PgNode,
    type_oid: &str,
    number: i64,
    modifier: i64,
    lookups: &[Value],
    functions: &[Value],
    used_ops: &mut std::collections::BTreeSet<String>,
    used_functions: &mut std::collections::BTreeSet<String>,
    terms: &mut Vec<Value>,
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    if node.tag == "BOOLEXPR" {
        if !pg_node_tree::closed(node, "BOOLEXPR", &["boolop", "args", "location"])
            || pg_node_tree::atom(node.fields.get("boolop")) != Some("and")
            || pg_node_tree::atom(node.fields.get("location")) != Some("-1")
        {
            return Ok(false);
        }
        let Some(args) = pg_node_tree::list(node.fields.get("args")) else {
            return Ok(false);
        };
        if args.len() < 2 {
            return Ok(false);
        }
        for arg in args {
            let Some(child) = pg_node_tree::child(Some(arg)) else {
                return Ok(false);
            };
            if !resolved_walk(
                child,
                type_oid,
                number,
                modifier,
                lookups,
                functions,
                used_ops,
                used_functions,
                terms,
                ctx,
            )? {
                return Ok(false);
            }
        }
        return Ok(true);
    }
    if !pg_node_tree::closed(
        node,
        "OPEXPR",
        &[
            "opno",
            "opfuncid",
            "opresulttype",
            "opretset",
            "opcollid",
            "inputcollid",
            "args",
            "location",
        ],
    ) {
        return Ok(false);
    }
    let f = &node.fields;
    let Some(opno) = pg_node_tree::atom(f.get("opno")) else {
        return Ok(false);
    };
    let spec = match opno {
        "523" => ("<=", "149", "int4le", "23", "23"),
        "420" => ("<=", "478", "int84le", "20", "23"),
        "430" => (">=", "479", "int84ge", "20", "23"),
        "414" => ("<=", "471", "int8le", "20", "20"),
        "540" => ("<=", "166", "int24le", "21", "23"),
        "542" => (">=", "168", "int24ge", "21", "23"),
        "1752" => ("=", "1718", "numeric_eq", "1700", "1700"),
        "1755" => ("<=", "1723", "numeric_le", "1700", "1700"),
        "1757" => (">=", "1721", "numeric_ge", "1700", "1700"),
        _ => return Ok(false),
    };
    let matching: Vec<_> = lookups
        .iter()
        .filter(|r| string_is(value_field(r, "oid"), opno))
        .collect();
    if matching.len() != 1 {
        return Ok(false);
    }
    let lookup = matching[0];
    if !string_is(value_field(lookup, "schema"), "pg_catalog")
        || !string_is(value_field(lookup, "name"), spec.0)
        || !string_is(value_field(lookup, "functionOid"), spec.1)
        || !string_is(value_field(lookup, "functionName"), spec.2)
        || !string_is(value_field(lookup, "functionSchema"), "pg_catalog")
        || !string_is(value_field(lookup, "leftTypeOid"), spec.3)
        || !string_is(value_field(lookup, "rightTypeOid"), spec.4)
        || !string_is(value_field(lookup, "resultTypeOid"), "16")
    {
        return Ok(false);
    }
    if pg_node_tree::atom(f.get("opfuncid")) != Some(spec.1)
        || pg_node_tree::atom(f.get("opresulttype")) != Some("16")
        || pg_node_tree::atom(f.get("opretset")) != Some("false")
        || pg_node_tree::atom(f.get("opcollid")) != Some("0")
        || pg_node_tree::atom(f.get("inputcollid")) != Some("0")
        || pg_node_tree::atom(f.get("location")) != Some("-1")
    {
        return Ok(false);
    }
    let Some(args) = pg_node_tree::list(f.get("args")) else {
        return Ok(false);
    };
    if args.len() != 2 {
        return Ok(false);
    }
    let left = pg_node_tree::child(args.first());
    let right = pg_node_tree::child(args.get(1));
    let number_text = number.to_string();
    let modifier_text = modifier.to_string();
    let variable = |v: &pg_node_tree::PgNode| {
        pg_node_tree::closed(
            v,
            "VAR",
            &[
                "varno",
                "varattno",
                "vartype",
                "vartypmod",
                "varcollid",
                "varnullingrels",
                "varlevelsup",
                "varnosyn",
                "varattnosyn",
                "location",
            ],
        ) && pg_node_tree::atom(v.fields.get("varno")) == Some("1")
            && pg_node_tree::atom(v.fields.get("varattno")) == Some(number_text.as_str())
            && pg_node_tree::atom(v.fields.get("vartype")) == Some(type_oid)
            && pg_node_tree::atom(v.fields.get("vartypmod")) == Some(modifier_text.as_str())
            && pg_node_tree::atom(v.fields.get("varcollid"))
                == Some(if type_oid == "25" { "100" } else { "0" })
            && pg_node_tree::list(v.fields.get("varnullingrels"))
                .is_some_and(|xs| xs.len() == 1 && pg_node_tree::atom(xs.first()) == Some("b"))
            && pg_node_tree::atom(v.fields.get("varlevelsup")) == Some("0")
            && pg_node_tree::atom(v.fields.get("varnosyn")) == Some("1")
            && pg_node_tree::atom(v.fields.get("varattnosyn")) == Some(number_text.as_str())
            && pg_node_tree::atom(v.fields.get("location")) == Some("-1")
    };
    let constant = |v: &pg_node_tree::PgNode| pg_node_tree::decode_constant(v);
    let simple_bound = left.is_some_and(|v| variable(v))
        && right.and_then(constant).is_some_and(|(ty, _)| ty == spec.4)
        && type_oid == spec.3
        && (spec.0 == "<=" || spec.0 == ">=");
    if simple_bound {
        let (ty, literal) = constant(right.unwrap()).unwrap();
        if ty != spec.4 {
            return Ok(false);
        }
        terms.push(make_object(vec![
            ("kind", Value::string_utf8("bound")),
            ("operator", Value::string_utf8(spec.0)),
            ("literal", Value::string_utf8(literal)),
        ]));
        used_ops.insert(opno.to_owned());
        return Ok(true);
    }
    if spec.0 == "<=" {
        if let (Some(fun), Some(constant_node)) = (left, right) {
            if let Some((name, result, input)) = recognized_function(fun, functions, used_functions)
            {
                if result == spec.3
                    && matches!(name, "char_length" | "octet_length")
                    && input == type_oid
                {
                    let Some(function_args) = pg_node_tree::list(fun.fields.get("args")) else {
                        return Ok(false);
                    };
                    if function_args.len() != 1
                        || !function_args
                            .first()
                            .and_then(|value| pg_node_tree::child(Some(value)))
                            .is_some_and(variable)
                    {
                        return Ok(false);
                    }
                    if let Some((ty, max)) = constant(constant_node) {
                        if ty == spec.4
                            && max.bytes().all(|b| b.is_ascii_digit())
                            && !max.is_empty()
                        {
                            terms.push(make_object(vec![
                                ("kind", Value::string_utf8("length")),
                                (
                                    "unit",
                                    Value::string_utf8(if name == "char_length" {
                                        "unicode-scalar"
                                    } else {
                                        "byte"
                                    }),
                                ),
                                ("max", Value::string_utf8(max)),
                            ]));
                            used_ops.insert(opno.to_owned());
                            return Ok(true);
                        }
                    }
                }
            }
        }
    }
    if spec.0 == "=" && left.is_some_and(|v| variable(v)) {
        if let Some(fun) = right {
            if let Some((name, result, input)) = recognized_function(fun, functions, used_functions)
            {
                if name == "trunc" && result == spec.4 && input == spec.4 {
                    let Some(fargs) = pg_node_tree::list(fun.fields.get("args")) else {
                        return Ok(false);
                    };
                    if fargs.len() != 2
                        || !fargs
                            .first()
                            .and_then(|value| pg_node_tree::child(Some(value)))
                            .is_some_and(variable)
                    {
                        return Ok(false);
                    }
                    let Some(scale_node) = fargs
                        .get(1)
                        .and_then(|value| pg_node_tree::child(Some(value)))
                    else {
                        return Ok(false);
                    };
                    if let Some((ty, scale)) = constant(scale_node) {
                        if ty == "23"
                            && scale.bytes().all(|b| b.is_ascii_digit())
                            && !scale.is_empty()
                        {
                            terms.push(make_object(vec![
                                ("kind", Value::string_utf8("scale")),
                                ("scale", Value::string_utf8(scale)),
                            ]));
                            used_ops.insert(opno.to_owned());
                            return Ok(true);
                        }
                    }
                }
            }
        }
    }
    ctx.charge_work(1, Utf16::default())?;
    Ok(false)
}
fn recognized_function<'a>(
    node: &pg_node_tree::PgNode,
    lookups: &'a [Value],
    used: &mut std::collections::BTreeSet<String>,
) -> Option<(&'static str, &'static str, &'static str)> {
    if !pg_node_tree::closed(
        node,
        "FUNCEXPR",
        &[
            "funcid",
            "funcresulttype",
            "funcretset",
            "funcvariadic",
            "funcformat",
            "funccollid",
            "inputcollid",
            "args",
            "location",
        ],
    ) {
        return None;
    }
    let f = &node.fields;
    let oid = pg_node_tree::atom(f.get("funcid"))?;
    let (name, result, args, input) = match oid {
        "720" => ("octet_length", "23", "[0:0]={17}", "17"),
        "1381" => ("char_length", "23", "[0:0]={25}", "25"),
        "1709" => ("trunc", "1700", "[0:1]={1700,23}", "1700"),
        _ => return None,
    };
    let rows: Vec<_> = lookups
        .iter()
        .filter(|r| string_is(value_field(r, "oid"), oid))
        .collect();
    if rows.len() != 1 {
        return None;
    }
    let row = rows[0];
    if !string_is(value_field(row, "schema"), "pg_catalog")
        || !string_is(value_field(row, "name"), name)
        || !string_is(value_field(row, "resultTypeOid"), result)
        || !string_is(value_field(row, "argumentTypeOids"), args)
        || !string_is(value_field(row, "kind"), "f")
        || !string_is(value_field(row, "volatility"), "i")
        || !matches!(value_field(row, "strict"), Some(Value::Bool(true)))
        || pg_node_tree::atom(f.get("funcresulttype")) != Some(result)
        || pg_node_tree::atom(f.get("funcretset")) != Some("false")
        || pg_node_tree::atom(f.get("funcvariadic")) != Some("false")
        || pg_node_tree::atom(f.get("funcformat")) != Some("0")
        || pg_node_tree::atom(f.get("funccollid")) != Some("0")
        || pg_node_tree::atom(f.get("inputcollid")) != Some(if input == "25" { "100" } else { "0" })
        || pg_node_tree::atom(f.get("location")) != Some("-1")
    {
        return None;
    }
    used.insert(oid.to_owned());
    Some((name, result, input))
}

impl PostgresqlCatalogCapture {
    pub fn import(source: &Utf16, ctx: &mut Context<'_>) -> Result<Self, EngineError> {
        let root = NativeJsonTree::parse_json(source.units(), ctx)?;
        let state = validate_root(&root, ctx)?;
        Ok(Self { root, state })
    }
    pub fn state(&self) -> &Utf16 {
        &self.state
    }
    pub fn columns(
        &self,
        ctx: &mut Context<'_>,
    ) -> Result<Vec<PostgresqlColumnMetadata>, EngineError> {
        let mut out = Vec::new();
        let root = self.root.root();
        let snapshot = field(root, "snapshot").expect("validated snapshot");
        let relations = as_array(field(snapshot, "relations")).expect("validated relations");
        for (ri, relation) in relations.iter().enumerate() {
            let schema = as_text(field(relation, "schema"))
                .expect("validated relation schema")
                .clone();
            let relation_name = as_text(field(relation, "name"))
                .expect("validated relation name")
                .clone();
            let kind = as_text(field(relation, "kind"))
                .cloned()
                .unwrap_or_default();
            for (ci, column) in as_array(field(relation, "columns"))
                .expect("validated columns")
                .iter()
                .enumerate()
            {
                ctx.charge_work(1, schema.clone())?;
                let name = as_text(field(column, "name"))
                    .expect("validated column name")
                    .clone();
                let ri = Utf16::from(ri.to_string());
                let ci = Utf16::from(ci.to_string());
                let mut path = Utf16::from("/snapshot/relations");
                path = pointer_child(&path, &ri, ctx)?;
                path = pointer_child(&path, &Utf16::from("columns"), ctx)?;
                path = pointer_child(&path, &ci, ctx)?;
                let mut fields = vec![("id", text_value(path.clone())), ("name", text_value(name))];
                if let Some(description) = as_text(field(column, "comment")) {
                    fields.push(("description", text_value(description.clone())))
                }
                if let Some(ty) = scalar_type(column) {
                    fields.push(("scalarType", text_value(Utf16::from(ty))))
                }
                fields.push(("extensions", Value::Object(Vec::new())));
                let native_tree = self.root.subtree_clone(&path, ctx)?;
                out.push(PostgresqlColumnMetadata {
                    path,
                    schema: schema.clone(),
                    relation: relation_name.clone(),
                    kind: kind.clone(),
                    element: object(fields),
                    native_column: native_tree.tagged_value_preserving_extras(ctx)?,
                });
            }
        }
        Ok(out)
    }
    pub fn export(&self, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
        self.root.render_compact(ctx)
    }
    pub fn root_tagged(&self, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
        self.root.tagged_value_preserving_extras(ctx)
    }
}

fn value_field<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    let Value::Object(fields) = value else {
        return None;
    };
    fields
        .iter()
        .find(|(key, _)| key == &Utf16::from(name))
        .map(|(_, value)| value)
}
fn value_field_mut<'a>(value: &'a mut Value, name: &str) -> Option<&'a mut Value> {
    let Value::Object(fields) = value else {
        return None;
    };
    fields
        .iter_mut()
        .find(|(key, _)| key == &Utf16::from(name))
        .map(|(_, value)| value)
}
fn value_text(value: Option<&Value>) -> Option<&Utf16> {
    match value {
        Some(Value::String(s)) => Some(s),
        _ => None,
    }
}
fn make_object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(fields.into_iter().map(|(k, v)| (key(k), v)).collect())
}
fn set_value_field(value: &mut Value, name: &str, replacement: Value) -> Result<(), EngineError> {
    let Value::Object(fields) = value else {
        return Err(fail(
            "POSTGRESQL_CATALOG_DOCUMENT",
            "Expected object while updating native capture",
        ));
    };
    if let Some((_, existing)) = fields.iter_mut().find(|(k, _)| k == &key(name)) {
        *existing = replacement;
    } else {
        fields.push((key(name), replacement));
    }
    Ok(())
}
fn diagnostic(code: &str, path: &str, message: &str, severity: &str) -> Value {
    make_object(vec![
        ("code", Value::string_utf8(code)),
        ("path", Value::string_utf8(path)),
        ("message", Value::string_utf8(message)),
        ("severity", Value::string_utf8(severity)),
    ])
}
fn document_module<'a>(document: &'a Value, id: &str) -> Option<&'a Value> {
    let Value::Array(modules) = value_field(document, "modules")? else {
        return None;
    };
    modules
        .iter()
        .find(|m| value_text(value_field(m, "id")) == Some(&key(id)))
}
fn capture_payload<'a>(document: &'a Value) -> Result<&'a Value, EngineError> {
    if value_text(value_field(document, "umf")) != Some(&key("0.10.0"))
        || value_text(value_field(document, "id")).is_none()
        || value_text(
            value_field(
                value_field(document, "vocabularies").unwrap_or(&Value::Null),
                EXTENSION,
            )
            .and_then(|v| value_field(v, "version")),
        ) != Some(&key("0.1.0"))
    {
        return Err(fail(
            "POSTGRESQL_CATALOG_DOCUMENT",
            "Expected a UMF 0.10.0 PostgreSQL catalog document",
        ));
    }
    let module = document_module(document, "catalog")
        .ok_or_else(|| fail("POSTGRESQL_CATALOG_PAYLOAD", "Missing catalog module"))?;
    let Value::Array(elements) = value_field(module, "elements")
        .ok_or_else(|| fail("POSTGRESQL_CATALOG_PAYLOAD", "Missing catalog elements"))?
    else {
        return Err(fail(
            "POSTGRESQL_CATALOG_PAYLOAD",
            "Catalog elements must be an array",
        ));
    };
    let capture = elements
        .iter()
        .find(|element| value_text(value_field(element, "id")) == Some(&key("capture")))
        .ok_or_else(|| fail("POSTGRESQL_CATALOG_PAYLOAD", "Missing capture element"))?;
    value_field(
        value_field(capture, "extensions")
            .ok_or_else(|| fail("POSTGRESQL_CATALOG_PAYLOAD", "Missing capture extensions"))?,
        EXTENSION,
    )
    .ok_or_else(|| fail("POSTGRESQL_CATALOG_PAYLOAD", "Missing catalog payload"))
}
pub fn catalog_from_document(
    document: &Value,
    ctx: &mut Context<'_>,
) -> Result<PostgresqlCatalogCapture, EngineError> {
    let payload = capture_payload(document)?;
    if value_text(value_field(payload, "profile")) != Some(&key("postgresql-catalog-capture")) {
        return Err(fail(
            "POSTGRESQL_CATALOG_PAYLOAD",
            "Unsupported capture profile",
        ));
    }
    let root = value_field(payload, "root")
        .ok_or_else(|| fail("POSTGRESQL_CATALOG_PAYLOAD", "Missing tagged capture root"))?;
    let root = NativeJsonTree::from_tagged_value(root, ctx)?;
    let state = value_text(value_field(payload, "state"))
        .ok_or_else(|| fail("POSTGRESQL_CATALOG_STATE", "Missing capture state"))?
        .clone();
    let validated_state = validate_root(&root, ctx)?;
    if validated_state != state {
        return Err(fail(
            "POSTGRESQL_CATALOG_STATE",
            "Payload and native capture states disagree",
        ));
    }
    let capture = PostgresqlCatalogCapture { root, state };
    let derived = capture.columns(ctx)?;
    let module = document_module(document, "postgresql.columns").ok_or_else(|| {
        fail(
            "POSTGRESQL_CATALOG_METADATA",
            "Missing PostgreSQL columns module",
        )
    })?;
    let Value::Array(elements) = value_field(module, "elements")
        .ok_or_else(|| fail("POSTGRESQL_CATALOG_METADATA", "Missing column elements"))?
    else {
        return Err(fail(
            "POSTGRESQL_CATALOG_METADATA",
            "Column elements must be an array",
        ));
    };
    if elements.len() != derived.len() {
        return Err(fail(
            "POSTGRESQL_COLUMN_METADATA",
            "Native columns and core metadata disagree",
        ));
    }
    for (element, column) in elements.iter().zip(&derived) {
        for field in ["id", "name", "description", "scalarType"] {
            if value_field(element, field) != value_field(&column.element, field) {
                return Err(fail(
                    "POSTGRESQL_COLUMN_METADATA",
                    "Native columns and core metadata disagree",
                ));
            }
        }
    }
    Ok(capture)
}
pub fn document_value(
    id: &Utf16,
    capture: &PostgresqlCatalogCapture,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let root = capture.root.tagged_value_preserving_extras(ctx)?;
    let columns = capture.columns(ctx)?;
    let elements = Value::Array(columns.into_iter().map(|c| c.element).collect());
    let payload = make_object(vec![
        ("profile", Value::string_utf8("postgresql-catalog-capture")),
        ("state", Value::String(capture.state.clone())),
        ("root", root),
    ]);
    Ok(make_object(vec![
        ("umf", Value::string_utf8("0.10.0")),
        ("id", Value::String(id.clone())),
        (
            "vocabularies",
            make_object(vec![(
                EXTENSION,
                make_object(vec![("version", Value::string_utf8("0.1.0"))]),
            )]),
        ),
        (
            "modules",
            Value::Array(vec![
                make_object(vec![
                    ("id", Value::string_utf8("catalog")),
                    ("namespace", Value::string_utf8("")),
                    (
                        "elements",
                        Value::Array(vec![make_object(vec![
                            ("id", Value::string_utf8("capture")),
                            ("extensions", make_object(vec![(EXTENSION, payload)])),
                        ])]),
                    ),
                ]),
                make_object(vec![
                    ("id", Value::string_utf8("postgresql.columns")),
                    ("namespace", Value::string_utf8("")),
                    ("elements", elements),
                ]),
            ]),
        ),
    ]))
}
pub fn inspect_document(document: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let capture = catalog_from_document(document, ctx)?;
    let mut diagnostics = vec![diagnostic(
        "POSTGRESQL_CATALOG_SCOPE",
        "",
        "Observed PostgreSQL catalog subset; server correspondence and complete native semantics are unverified",
        "warning",
    )];
    if capture.root.has_representation_extras() {
        diagnostics.push(diagnostic(
            "POSTGRESQL_CATALOG_REPRESENTATION",
            "/root",
            "Unknown tagged encoding content is preserved but blocks native export",
            "warning",
        ));
    }
    if !matches!(field(capture.root.root(),"serverVersion"),Some(NativeJsonNode::Number(n)) if n=="170004")
    {
        diagnostics.push(diagnostic(
            "POSTGRESQL_CATALOG_VERSION",
            "/serverVersion",
            "Capture version retained outside the executed PostgreSQL 17.4 profile",
            "warning",
        ));
    }
    if capture.state == key("modified") {
        diagnostics.push(diagnostic(
            "POSTGRESQL_CATALOG_MODIFIED",
            "",
            "Catalog metadata contains candidate edits",
            "warning",
        ));
    }
    ctx.charge_work(diagnostics.len(), Utf16::default())?;
    Ok(make_object(vec![
        ("valid", Value::Bool(true)),
        ("complete", Value::Bool(false)),
        ("diagnostics", Value::Array(diagnostics)),
    ]))
}
pub fn export_document(document: &Value, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    let capture = catalog_from_document(document, ctx)?;
    let payload = capture_payload(document)?;
    if capture.root.has_representation_extras()
        || matches!(payload,Value::Object(fields) if fields.iter().any(|(name,_)| !["profile","state","root"].iter().any(|known|name==&key(known))))
    {
        return Err(fail(
            "POSTGRESQL_CATALOG_EXPORT",
            "Unknown representation content blocks native export",
        ));
    }
    capture.export(ctx)
}
pub fn get_node(
    document: &Value,
    pointer: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let capture = catalog_from_document(document, ctx)?;
    capture
        .root
        .subtree_clone(pointer, ctx)?
        .tagged_value_preserving_extras(ctx)
}
pub fn find_relation(
    document: &Value,
    schema: &Utf16,
    name: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let capture = catalog_from_document(document, ctx)?;
    let relations = capture
        .root
        .child(&Utf16::from("/snapshot/relations"), ctx)?;
    let NativeJsonNode::Array(rows) = relations else {
        return Err(fail(
            "POSTGRESQL_CATALOG_RELATIONS",
            "Expected native relation array",
        ));
    };
    let mut found = None;
    for (i, row) in rows.iter().enumerate() {
        if as_text(field(row, "schema")) == Some(schema)
            && as_text(field(row, "name")) == Some(name)
        {
            if found.is_some() {
                return Err(fail(
                    "POSTGRESQL_CATALOG_AMBIGUOUS",
                    "Duplicate qualified relation observations",
                ));
            }
            found = Some(i);
        }
    }
    match found {
        Some(i) => capture
            .root
            .subtree_clone(&Utf16::from(format!("/snapshot/relations/{i}")), ctx)?
            .tagged_value_preserving_extras(ctx),
        None => Ok(Value::Null),
    }
}
pub fn get_reconstruction(document: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let capture = catalog_from_document(document, ctx)?;
    if capture.state != key("captured") {
        return Err(fail(
            "POSTGRESQL_CATALOG_STALE",
            "Edited capture does not synchronize reconstruction SQL",
        ));
    }
    let sql = capture
        .root
        .child(&Utf16::from("/reconstruction/sql"), ctx)?;
    let NativeJsonNode::String(sql) = sql else {
        return Err(fail(
            "POSTGRESQL_CATALOG_SQL",
            "Expected SQL reconstruction archive",
        ));
    };
    Ok(make_object(vec![
        ("sql", Value::String(sql.clone())),
        ("complete", Value::Bool(false)),
        ("provenance", Value::string_utf8("original-capture-archive")),
    ]))
}
pub fn query_dependencies(
    document: &Value,
    side: Option<&Utf16>,
    catalog: Option<&Utf16>,
    type_name: Option<&Utf16>,
    identity: Option<&Utf16>,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let capture = catalog_from_document(document, ctx)?;
    let snapshot = field(capture.root.root(), "snapshot")
        .ok_or_else(|| fail("POSTGRESQL_CATALOG_CAPTURE", "Missing snapshot"))?;
    let Some(dependencies) = field(snapshot, "dependencies") else {
        return Ok(make_object(vec![
            ("available", Value::Bool(false)),
            ("complete", Value::Bool(false)),
            ("state", Value::String(capture.state)),
            ("edges", Value::Array(Vec::new())),
        ]));
    };
    let NativeJsonNode::Array(edges) = dependencies else {
        return Err(fail(
            "POSTGRESQL_CATALOG_DEPENDENCIES",
            "Expected captured dependency array",
        ));
    };
    if side.is_some()
        && (!matches!(side,Some(s) if s==&key("dependent")||s==&key("referenced"))
            || catalog.is_none()
            || type_name.is_none()
            || identity.is_none())
    {
        return Err(fail(
            "POSTGRESQL_CATALOG_DEPENDENCIES",
            "Filter requires a native endpoint and side",
        ));
    }
    let mut selected = Vec::new();
    for (i, edge) in edges.iter().enumerate() {
        let take = if let Some(side) = side {
            let endpoint = field(edge, &side.to_utf8().unwrap_or_default());
            [
                ("catalog", catalog),
                ("type", type_name),
                ("identity", identity),
            ]
            .iter()
            .all(|(k, expected)| {
                as_text(field(endpoint.unwrap_or(&NativeJsonNode::Null), k)) == *expected
            })
        } else {
            true
        };
        if take {
            selected.push(
                capture
                    .root
                    .subtree_clone(&Utf16::from(format!("/snapshot/dependencies/{i}")), ctx)?
                    .tagged_value_preserving_extras(ctx)?,
            );
        }
    }
    Ok(make_object(vec![
        ("available", Value::Bool(true)),
        ("complete", Value::Bool(false)),
        ("state", Value::String(capture.state)),
        ("edges", Value::Array(selected)),
    ]))
}
pub fn propose_edit(
    document: &Value,
    path: &Utf16,
    replacement_json: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let original = catalog_from_document(document, ctx)?;
    if original.root.has_representation_extras() {
        return Err(fail(
            "POSTGRESQL_CATALOG_REPRESENTATION",
            "Unknown tagged representation prevents native edit",
        ));
    }
    let replacement = NativeJsonTree::parse_json(replacement_json.units(), ctx)?;
    let mut root = original.root.replace_node(path, &replacement, ctx)?;
    let modified = NativeJsonTree::parse_json(Utf16::from("\"modified\"").units(), ctx)?;
    root = root.replace_node(&Utf16::from("/state"), &modified, ctx)?;
    let state = validate_root(&root, ctx)?;
    let candidate = PostgresqlCatalogCapture { root, state };
    let old_metadata = original.columns(ctx)?;
    let new_metadata = candidate.columns(ctx)?;
    let mut next = crate::copy_json(document, ctx)?;
    let modules = value_field_mut(&mut next, "modules")
        .ok_or_else(|| fail("POSTGRESQL_CATALOG_METADATA", "Missing modules"))?;
    let Value::Array(modules) = modules else {
        return Err(fail(
            "POSTGRESQL_CATALOG_METADATA",
            "Modules must be an array",
        ));
    };
    let catalog_module = modules
        .iter_mut()
        .find(|m| value_text(value_field(m, "id")) == Some(&key("catalog")))
        .ok_or_else(|| fail("POSTGRESQL_CATALOG_PAYLOAD", "Missing catalog module"))?;
    let Value::Array(capture_elements) = value_field_mut(catalog_module, "elements")
        .ok_or_else(|| fail("POSTGRESQL_CATALOG_PAYLOAD", "Missing catalog elements"))?
    else {
        return Err(fail(
            "POSTGRESQL_CATALOG_PAYLOAD",
            "Catalog elements must be array",
        ));
    };
    let capture = capture_elements
        .iter_mut()
        .find(|e| value_text(value_field(e, "id")) == Some(&key("capture")))
        .ok_or_else(|| fail("POSTGRESQL_CATALOG_PAYLOAD", "Missing capture element"))?;
    let extension_map = value_field_mut(capture, "extensions")
        .ok_or_else(|| fail("POSTGRESQL_CATALOG_PAYLOAD", "Missing capture extensions"))?;
    set_value_field(
        extension_map,
        EXTENSION,
        make_object(vec![
            ("profile", Value::string_utf8("postgresql-catalog-capture")),
            ("state", Value::string_utf8("modified")),
            ("root", candidate.root.tagged_value_preserving_extras(ctx)?),
        ]),
    )?;

    let columns_module = modules
        .iter_mut()
        .find(|m| value_text(value_field(m, "id")) == Some(&key("postgresql.columns")))
        .ok_or_else(|| {
            fail(
                "POSTGRESQL_CATALOG_METADATA",
                "Missing PostgreSQL columns module",
            )
        })?;
    let old_elements = match value_field_mut(columns_module, "elements") {
        Some(Value::Array(elements)) => std::mem::take(elements),
        _ => {
            return Err(fail(
                "POSTGRESQL_CATALOG_METADATA",
                "Column elements must be array",
            ));
        }
    };
    let attached = |element: &Value| match element {
        Value::Object(fields) => {
            fields.iter().any(|(name, _)| {
                !(["id", "name", "description", "scalarType", "extensions"]
                    .iter()
                    .any(|known| name == &key(known)))
            }) || matches!(value_field(element,"extensions"),Some(Value::Object(ext)) if !ext.is_empty())
        }
        _ => false,
    };
    for old in &old_elements {
        if attached(old) {
            let old_id = value_text(value_field(old, "id"));
            let old_col = old_metadata.iter().find(|c| Some(&c.path) == old_id);
            let new_col = new_metadata.iter().find(|c| Some(&c.path) == old_id);
            if let (Some(old_col), Some(new_col)) = (old_col, new_col) {
                if value_field(&old_col.element, "name") != value_field(&new_col.element, "name")
                    || old_col.schema != new_col.schema
                    || old_col.relation != new_col.relation
                {
                    return Err(fail(
                        "POSTGRESQL_COLUMN_METADATA",
                        "Column identity changed with attached metadata; explicit reassociation required",
                    ));
                }
            } else {
                return Err(fail(
                    "POSTGRESQL_COLUMN_METADATA",
                    "Column identity changed with attached metadata; explicit reassociation required",
                ));
            }
        }
    }
    let mut refreshed = Vec::new();
    for column in new_metadata {
        let mut element = column.element;
        if let Some(prior) = old_elements
            .iter()
            .find(|prior| value_field(prior, "id") == value_field(&element, "id"))
        {
            if let (Value::Object(fields), Value::Object(old_fields)) = (&mut element, prior) {
                for (name, value) in old_fields {
                    if ["name", "description", "scalarType", "id"]
                        .iter()
                        .any(|known| name == &key(known))
                    {
                        continue;
                    }
                    let copied = crate::copy_json(value, ctx)?;
                    if let Some((_, existing)) =
                        fields.iter_mut().find(|(candidate, _)| candidate == name)
                    {
                        *existing = copied;
                    } else {
                        fields.push((name.clone(), copied));
                    }
                }
            }
        }
        refreshed.push(element);
    }
    set_value_field(columns_module, "elements", Value::Array(refreshed))?;
    let _ = catalog_from_document(&next, ctx)?;
    Ok(next)
}

pub fn inspect_facet_type(input: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let native = NativeJsonTree::from_tagged_value(input, ctx)?;
    let reason = |message: &str,
                  tree: &NativeJsonTree,
                  ctx: &mut Context<'_>|
     -> Result<Value, EngineError> {
        Ok(make_object(vec![
            ("native", tree.tagged_value_preserving_extras(ctx)?),
            ("state", Value::string_utf8("unsupported")),
            ("reason", Value::string_utf8(message)),
        ]))
    };
    let observed = |meaning: Value,
                    tree: &NativeJsonTree,
                    ctx: &mut Context<'_>|
     -> Result<Value, EngineError> {
        Ok(make_object(vec![
            ("native", tree.tagged_value_preserving_extras(ctx)?),
            ("state", Value::string_utf8("observed")),
            ("meaning", meaning),
        ]))
    };
    let root = native.root();
    let NativeJsonNode::Object(_) = root else {
        return reason("Expected a native type metadata object", &native, ctx);
    };
    let name = as_text(field(root, "name"))
        .and_then(|v| v.to_utf8().ok())
        .unwrap_or_default();
    let schema = as_text(field(root, "schema"));
    let kind = as_text(field(root, "kind"));
    let category = as_text(field(root, "category"));
    let Some(modifier) = field(root, "modifier").and_then(|value| safe_integer(Some(value))) else {
        return reason(
            "Native modifier must be an exact supported signed-32-bit catalog integer",
            &native,
            ctx,
        );
    };
    let Some(dimensions) = field(root, "dimensions").and_then(|value| safe_integer(Some(value)))
    else {
        return reason(
            "Only direct pg_catalog scalar base types with zero dimensions are interpreted; domains, arrays and custom types retain native meaning",
            &native,
            ctx,
        );
    };
    if schema != Some(&key("pg_catalog")) || kind != Some(&key("b")) || dimensions != 0 {
        return reason(
            "Only direct pg_catalog scalar base types with zero dimensions are interpreted; domains, arrays and custom types retain native meaning",
            &native,
            ctx,
        );
    }
    if modifier < -1 || modifier > i32::MAX as i64 {
        return reason(
            "Native modifier must be an exact supported signed-32-bit catalog integer",
            &native,
            ctx,
        );
    }
    let family = category.and_then(|c| c.to_utf8().ok());
    if family.as_deref() == Some("N") && modifier == -1 {
        if let Some(bits) = match name.as_str() {
            "int2" => Some(16),
            "int4" => Some(32),
            "int8" => Some(64),
            _ => None,
        } {
            return observed(
                make_object(vec![
                    ("family", Value::string_utf8("integer")),
                    ("signedBits", Value::Number(bits as f64)),
                ]),
                &native,
                ctx,
            );
        }
        if let Some(bits) = match name.as_str() {
            "float4" => Some(32),
            "float8" => Some(64),
            _ => None,
        } {
            return observed(
                make_object(vec![
                    ("family", Value::string_utf8("float")),
                    ("bits", Value::Number(bits as f64)),
                ]),
                &native,
                ctx,
            );
        }
        if name == "numeric" {
            return observed(
                make_object(vec![
                    ("family", Value::string_utf8("decimal")),
                    ("precision", Value::Null),
                    ("scale", Value::Null),
                    ("specials", Value::string_utf8("nan-and-infinities")),
                    ("coercesScale", Value::Bool(false)),
                ]),
                &native,
                ctx,
            );
        }
    }
    if name == "numeric" && family.as_deref() == Some("N") {
        if modifier < 4 {
            return reason(
                "Numeric modifier does not contain a valid offset",
                &native,
                ctx,
            );
        }
        let packed = modifier - 4;
        let precision = packed / 65536;
        let encoded = packed % 2048;
        let scale = if encoded >= 1024 {
            encoded - 2048
        } else {
            encoded
        };
        let reserved = (packed / 2048) % 32;
        if reserved != 0 || precision < 1 || precision > 1000 || !(-1000..=1000).contains(&scale) {
            return reason(
                "Numeric modifier has unsupported precision, signed scale or reserved bits",
                &native,
                ctx,
            );
        }
        return observed(
            make_object(vec![
                ("family", Value::string_utf8("decimal")),
                ("precision", Value::Number(precision as f64)),
                ("scale", Value::Number(scale as f64)),
                ("specials", Value::string_utf8("nan")),
                ("coercesScale", Value::Bool(true)),
            ]),
            &native,
            ctx,
        );
    }
    if ["varchar", "bpchar"].contains(&name.as_str()) && family.as_deref() == Some("S") {
        if modifier != -1 && (modifier < 5 || modifier > 10485764) {
            return reason(
                "Character modifier is outside the PostgreSQL 17.4 declared length range",
                &native,
                ctx,
            );
        }
        let padding = if name == "varchar" {
            "none"
        } else if modifier == -1 {
            "blank-trimmed"
        } else {
            "blank-padded"
        };
        return observed(
            make_object(vec![
                ("family", Value::string_utf8("string")),
                (
                    "declaredMaxCharacters",
                    if modifier == -1 {
                        Value::Null
                    } else {
                        Value::Number((modifier - 4) as f64)
                    },
                ),
                ("padding", Value::string_utf8(padding)),
                ("permitsNul", Value::Bool(false)),
            ]),
            &native,
            ctx,
        );
    }
    if name == "text" && family.as_deref() == Some("S") && modifier == -1 {
        return observed(
            make_object(vec![
                ("family", Value::string_utf8("string")),
                ("declaredMaxCharacters", Value::Null),
                ("padding", Value::string_utf8("none")),
                ("permitsNul", Value::Bool(false)),
            ]),
            &native,
            ctx,
        );
    }
    if name == "bytea" && family.as_deref() == Some("U") && modifier == -1 {
        return observed(
            make_object(vec![
                ("family", Value::string_utf8("binary")),
                ("declaredMaxBytes", Value::Null),
            ]),
            &native,
            ctx,
        );
    }
    reason(
        "Native type/category/modifier combination is outside the qualified decoding subset",
        &native,
        ctx,
    )
}
fn safe_integer(node: Option<&NativeJsonNode>) -> Option<i64> {
    let NativeJsonNode::Number(token) = node? else {
        return None;
    };
    let value = token.parse::<f64>().ok()?;
    if !value.is_finite() || value.fract() != 0.0 || value.abs() > 9_007_199_254_740_991.0 {
        return None;
    }
    let integer = value as i64;
    if integer as f64 != value {
        return None;
    }
    Some(integer)
}

fn json_field<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    value_field(value, name)
}
fn closed_object(value: &Value, allowed: &[&str]) -> bool {
    matches!(value,Value::Object(fields) if fields.iter().all(|(name,_)|allowed.iter().any(|known|name==&key(known))))
}
fn node_value<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    let Value::Object(fields) = value else {
        return None;
    };
    if fields.len() != 1 || fields[0].0 != key(name) {
        return None;
    }
    match &fields[0].1 {
        Value::Object(_) => Some(&fields[0].1),
        _ => None,
    }
}
fn string_array(value: Option<&Value>) -> Option<Vec<String>> {
    let Value::Array(parts) = value? else {
        return None;
    };
    if parts.is_empty() {
        return None;
    }
    let mut result = Vec::new();
    for part in parts {
        let value = node_value(part, "String")?;
        if !closed_object(value, &["sval"]) {
            return None;
        }
        let name = value_field(value, "sval")
            .and_then(|value| value_text(Some(value)))?
            .to_utf8()
            .ok()?;
        result.push(name);
    }
    Some(result)
}
fn column_ref(value: Option<&Value>, name: &str) -> bool {
    let Some(node) = value.and_then(|v| node_value(v, "ColumnRef")) else {
        return false;
    };
    if !closed_object(node, &["fields", "location"]) {
        return false;
    }
    string_array(value_field(node, "fields")) == Some(vec![name.to_string()])
}
fn decimal_token(token: &str) -> bool {
    let s = token.strip_prefix('-').unwrap_or(token);
    let mut parts = s.split('.');
    let whole = parts.next().unwrap_or("");
    let frac = parts.next();
    !whole.is_empty()
        && whole.bytes().all(|b| b.is_ascii_digit())
        && (!whole.starts_with('0') || whole.len() == 1)
        && frac.is_none_or(|f| !f.is_empty() && f.bytes().all(|b| b.is_ascii_digit()))
        && parts.next().is_none()
}
fn native_constant(value: Option<&Value>, allow_string: bool) -> Option<(String, Option<String>)> {
    let n = node_value(value?, "A_Const")?;
    let allowed = if allow_string {
        &["ival", "fval", "sval", "location"][..]
    } else {
        &["ival", "fval", "location"][..]
    };
    if !closed_object(n, allowed) {
        return None;
    }
    let mut found = None;
    for name in ["ival", "fval", "sval"] {
        if name == "sval" && !allow_string {
            continue;
        }
        if let Some(part) = value_field(n, name) {
            if found.is_some() {
                return None;
            }
            found = Some((name, part));
        }
    }
    let (kind, part) = found?;
    if !closed_object(part, &[kind]) {
        return None;
    }
    let raw = match kind {
        "ival" => match value_field(part, "ival") {
            None | Some(Value::Null) => "0".to_string(),
            Some(Value::Number(number))
                if number.is_finite() && number.fract() == 0.0 && number.abs() <= 2147483647.0 =>
            {
                crate::value::ecma_number_to_string(*number)
            }
            _ => return None,
        },
        "fval" | "sval" => value_text(value_field(part, kind))?.to_utf8().ok()?,
        _ => return None,
    };
    if decimal_token(&raw) {
        Some((raw, None))
    } else {
        None
    }
}
fn literal_value(value: Option<&Value>) -> Option<(String, Option<String>)> {
    let cast = node_value(value?, "TypeCast");
    if let Some(cast) = cast {
        if !closed_object(cast, &["arg", "typeName", "location"]) {
            return None;
        }
        let type_name = value_field(cast, "typeName")?;
        if !closed_object(type_name, &["names", "typemod", "location"])
            || !matches!(value_field(type_name,"typemod"),Some(Value::Number(value)) if *value == -1.0)
        {
            return None;
        }
        let path = string_array(value_field(type_name, "names"))?;
        if path.len() != 2
            || path[0] != "pg_catalog"
            || !["numeric", "int2", "int4", "int8"].contains(&path[1].as_str())
        {
            return None;
        }
        let (number, _) = native_constant(value_field(cast, "arg"), true)?;
        return Some((number, Some(path[1].clone())));
    }
    native_constant(value, false)
}
fn candidate_bound(op: &str, literal: &str, cast: Option<String>) -> Value {
    let mut fields = vec![
        ("kind", Value::string_utf8("bound")),
        ("operator", Value::string_utf8(op)),
        ("literal", Value::string_utf8(literal)),
    ];
    if let Some(cast) = cast {
        fields.push(("cast", Value::string_utf8(cast)))
    }
    make_object(fields)
}
fn function_call(
    value: Option<&Value>,
    expected: &[&str],
    column_name: &str,
    arity: usize,
) -> Option<(Vec<String>, Vec<Value>)> {
    let call = node_value(value?, "FuncCall")?;
    if !closed_object(call, &["funcname", "args", "funcformat", "location"])
        || !matches!(value_field(call,"funcformat"),Some(Value::String(s)) if s==&key("COERCE_EXPLICIT_CALL"))
    {
        return None;
    }
    let path = string_array(value_field(call, "funcname"))?;
    let name = path.last()?;
    if !(path.len() == 1 || (path.len() == 2 && path[0] == "pg_catalog"))
        || !expected.iter().any(|expected_name| *expected_name == name)
    {
        return None;
    }
    let Value::Array(args) = value_field(call, "args")? else {
        return None;
    };
    if args.len() != arity || !column_ref(args.first(), column_name) {
        return None;
    }
    Some((path, args.clone()))
}
fn predicate_term(value: &Value, column_name: &str) -> Option<Value> {
    let expr = node_value(value, "A_Expr")?;
    if !closed_object(expr, &["kind", "name", "lexpr", "rexpr", "location"])
        || !matches!(value_field(expr,"kind"),Some(Value::String(s)) if s==&key("AEXPR_OP"))
    {
        return None;
    }
    let op = string_array(value_field(expr, "name"))?;
    if op.len() != 1 {
        return None;
    }
    let op = op[0].as_str();
    if matches!(op, ">=" | "<=") && column_ref(value_field(expr, "lexpr"), column_name) {
        if let Some((literal, cast)) = literal_value(value_field(expr, "rexpr")) {
            return Some(candidate_bound(op, &literal, cast));
        }
    }
    if op == "<=" {
        if let (Some((name, _)), Some((max, None))) = (
            function_call(
                value_field(expr, "lexpr"),
                &["char_length", "octet_length"],
                column_name,
                1,
            ),
            native_constant(value_field(expr, "rexpr"), false),
        ) {
            if !max.starts_with('-')
                && max.bytes().all(|b| b.is_ascii_digit())
                && (max == "0" || !max.starts_with('0'))
            {
                return Some(make_object(vec![
                    ("kind", Value::string_utf8("length")),
                    (
                        "functionName",
                        Value::Array(name.into_iter().map(Value::string_utf8).collect()),
                    ),
                    ("max", Value::string_utf8(max)),
                ]));
            }
        }
    }
    if op == "=" && column_ref(value_field(expr, "lexpr"), column_name) {
        if let Some((name, args)) =
            function_call(value_field(expr, "rexpr"), &["trunc"], column_name, 2)
        {
            if let Some((scale, None)) = native_constant(args.get(1), false) {
                if !scale.starts_with('-')
                    && scale.bytes().all(|b| b.is_ascii_digit())
                    && (scale == "0" || !scale.starts_with('0'))
                {
                    return Some(make_object(vec![
                        ("kind", Value::string_utf8("scale")),
                        (
                            "functionName",
                            Value::Array(name.into_iter().map(Value::string_utf8).collect()),
                        ),
                        ("scale", Value::string_utf8(scale)),
                    ]));
                }
            }
        }
    }
    None
}
pub fn inspect_facet_predicate(
    input: &Value,
    column_name: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let native = crate::copy_json(input, ctx)?;
    let mut candidates = Vec::new();
    let column_name = column_name.to_utf8().unwrap_or_default();
    let ok = if !closed_object(&native, &["version", "stmts"])
        || !matches!(value_field(&native,"version"),Some(Value::Number(v)) if *v==170004.0)
    {
        false
    } else if let Some(Value::Array(stmts)) = value_field(&native, "stmts") {
        if stmts.len() != 1 {
            false
        } else if let Some(stmt) =
            value_field(&stmts[0], "stmt").and_then(|value| node_value(value, "SelectStmt"))
        {
            if !closed_object(stmt, &["targetList", "limitOption", "op"])
                || !matches!(value_field(stmt,"limitOption"),Some(Value::String(v)) if v==&key("LIMIT_OPTION_DEFAULT"))
                || !matches!(value_field(stmt,"op"),Some(Value::String(v)) if v==&key("SETOP_NONE"))
            {
                false
            } else if let Some(Value::Array(targets)) = value_field(stmt, "targetList") {
                if targets.len() != 1 {
                    false
                } else if let Some(target) = node_value(&targets[0], "ResTarget") {
                    if !closed_object(target, &["val", "location"]) {
                        false
                    } else {
                        fn walk(value: &Value, column: &str, out: &mut Vec<Value>) -> bool {
                            if let Some(and) = node_value(value, "BoolExpr") {
                                if !closed_object(and, &["boolop", "args", "location"])
                                    || !matches!(value_field(and,"boolop"),Some(Value::String(s)) if s==&key("AND_EXPR"))
                                {
                                    return false;
                                }
                                let Some(Value::Array(args)) = value_field(and, "args") else {
                                    return false;
                                };
                                if args.len() < 2 {
                                    return false;
                                }
                                return args.iter().all(|arg| walk(arg, column, out));
                            }
                            let Some(candidate) = predicate_term(value, column) else {
                                return false;
                            };
                            out.push(candidate);
                            true
                        }
                        walk(
                            value_field(target, "val").unwrap_or(&Value::Null),
                            &column_name,
                            &mut candidates,
                        )
                    }
                } else {
                    false
                }
            } else {
                false
            }
        } else {
            false
        }
    } else {
        false
    };
    if !ok {
        candidates.clear()
    }
    ctx.charge_work(candidates.len(), Utf16::default())?;
    let state = if ok { "candidate" } else { "unsupported" };
    Ok(make_object(vec![
        ("native", native),
        ("state", Value::string_utf8(state)),
        ("candidates", Value::Array(candidates)),
        (
            "requires",
            Value::string_utf8("catalog-resolution-and-enforcement-evidence"),
        ),
    ]))
}

#[cfg(test)]
#[path = "postgresql_catalog_test.rs"]
mod tests;
