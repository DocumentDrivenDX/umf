// SPDX-License-Identifier: MIT OR Apache-2.0
//! Relationship-independent DDD table lowering.  A parser/deparser remains a
//! supplied host capability; every choice and loss is decided here.
use crate::{
    binding_inspection::{self, BindingInspectionResources},
    context::Context,
    ddd_json_schema_projection,
    error::EngineError,
    native_json::{NativeJsonNode, NativeJsonTree},
    postgresql_sql_runtime,
    value::{copy_json, Utf16, Value},
};
use std::collections::{BTreeMap, BTreeSet};

fn u(s: &str) -> Utf16 {
    Utf16::from(s)
}
fn s(s: &str) -> Value {
    Value::string_utf8(s)
}
fn obj(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(key, value)| (u(key), value))
            .collect(),
    )
}
fn get<'a>(value: &'a Value, key: &str) -> Option<&'a Value> {
    match value {
        Value::Object(fields) => fields
            .iter()
            .find(|(name, _)| name == &u(key))
            .map(|(_, v)| v),
        _ => None,
    }
}
fn array(value: Option<&Value>) -> &[Value] {
    match value {
        Some(Value::Array(items)) => items,
        _ => &[],
    }
}
fn text(value: Option<&Value>) -> Option<&Utf16> {
    match value {
        Some(Value::String(value)) => Some(value),
        _ => None,
    }
}
fn utf8(value: Option<&Value>, code: &str, message: &str) -> Result<String, EngineError> {
    text(value)
        .ok_or_else(|| error(code, message))?
        .to_utf8()
        .map_err(|_| error(code, message))
}
fn is(value: Option<&Value>, expected: &str) -> bool {
    text(value).is_some_and(|v| v == &u(expected))
}
fn error(code: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}
fn exact(value: &Value, keys: &[&str]) -> bool {
    let Value::Object(fields) = value else {
        return false;
    };
    fields.len() == keys.len()
        && keys
            .iter()
            .all(|key| fields.iter().filter(|(name, _)| name == &u(key)).count() == 1)
}
fn quote(name: &str) -> Result<String, EngineError> {
    if name.is_empty() || name.len() > 63 || name.contains('\0') {
        return Err(error(
            "POSTGRESQL_IDENTIFIER",
            "Invalid or truncated PostgreSQL identifier",
        ));
    }
    Ok(format!("\"{}\"", name.replace('"', "\"\"")))
}
fn sql_type(input: &str) -> Option<(String, &'static str)> {
    let normalized = input
        .chars()
        .filter(|c| !c.is_whitespace())
        .collect::<String>()
        .to_ascii_lowercase();
    if normalized == "boolean" {
        return Some((normalized, "boolean"));
    }
    if ["smallint", "integer", "bigint"].contains(&normalized.as_str()) {
        return Some((normalized, "integer"));
    }
    if normalized == "text" {
        return Some((normalized, "string"));
    }
    if normalized == "bytea" {
        return Some((normalized, "bytes"));
    }
    if let Some(width) = normalized
        .strip_prefix("varchar(")
        .and_then(|s| s.strip_suffix(')'))
    {
        if width.is_empty()
            || width.starts_with('0')
            || width.len() > 7
            || !width.bytes().all(|b| b.is_ascii_digit())
        {
            return None;
        }
        let width = width.parse::<u32>().ok()?;
        return (width <= 10_485_760).then(|| (format!("varchar({width})"), "string"));
    }
    if let Some(args) = normalized
        .strip_prefix("numeric(")
        .and_then(|s| s.strip_suffix(')'))
    {
        let (precision, scale) = args.split_once(',')?;
        if precision.is_empty()
            || precision.starts_with('0')
            || precision.len() > 3
            || !precision.bytes().all(|b| b.is_ascii_digit())
            || scale.is_empty()
            || scale.len() > 3
            || scale.len() > 1 && scale.starts_with('0')
            || !scale.bytes().all(|b| b.is_ascii_digit())
        {
            return None;
        }
        let p = precision.parse::<u16>().ok()?;
        let s = scale.parse::<u16>().ok()?;
        return (p <= 999 && s <= p).then(|| (format!("numeric({p},{s})"), "decimal"));
    }
    for base in ["timestamp", "timestamptz"] {
        if let Some(digit) = normalized
            .strip_prefix(&format!("{base}("))
            .and_then(|s| s.strip_suffix(')'))
        {
            return (digit.len() == 1 && digit.bytes().all(|b| (b'0'..=b'6').contains(&b)))
                .then(|| (format!("{base}({digit})"), "date-time"));
        }
    }
    None
}
fn field_key(value: &Value) -> Option<(Utf16, Utf16, Utf16)> {
    Some((
        text(get(value, "module"))?.clone(),
        text(get(value, "element"))?.clone(),
        text(get(value, "field"))?.clone(),
    ))
}
fn owner_key(value: &Value) -> Option<(Utf16, Utf16)> {
    Some((
        text(get(value, "module"))?.clone(),
        text(get(value, "element"))?.clone(),
    ))
}
fn residual(
    path: &str,
    reason: &str,
    choice: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    Ok(obj(vec![
        ("path", s(path)),
        ("reason", s(reason)),
        ("choice", copy_json(choice, ctx)?),
    ]))
}
fn mapping(path: &str, target: &str) -> Value {
    obj(vec![("sourcePath", s(path)), ("target", s(target))])
}

/// Returns the public result shape with a candidate pending host admission.
/// The caller invokes the pinned parser/deparser and then `complete_tables`.
pub fn prepare_tables(
    logical: &Value,
    binding: &Value,
    policy: &Value,
    loss_policy: &str,
    resources: &BindingInspectionResources,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    if !matches!(loss_policy, "strict" | "report")
        || !exact(policy, &["fieldTypes", "partitionFamilies"])
        || !matches!(get(policy, "fieldTypes"), Some(Value::Array(_)))
        || !matches!(get(policy, "partitionFamilies"), Some(Value::Array(_)))
    {
        return Err(error(
            "POSTGRESQL_TABLE_POLICY",
            "Explicit type and partition policy required",
        ));
    }
    let inspected = binding_inspection::inspect_binding(resources, binding, logical, ctx)?;
    if inspected
        .diagnostics
        .iter()
        .any(|d| d.code == u("BINDING_UNKNOWN"))
    {
        return Err(error(
            "BINDING_INCOMPLETE",
            "Unknown physical choice may affect PostgreSQL DDL",
        ));
    }
    if !inspected.valid {
        return Err(error("BINDING_DOCUMENT", "Invalid physical binding"));
    }
    let ddd = ddd_json_schema_projection::inspect_ddd_document(logical, ctx)?;
    if !ddd.valid || ddd.diagnostics.iter().any(|d| d.code == u("DDD_UNKNOWN")) {
        return Err(error("DDD_DOCUMENT", "Invalid or uninterpreted DDD model"));
    }
    let payload = get(
        get(binding, "extensions").unwrap_or(&Value::Null),
        "umf.binding",
    )
    .ok_or_else(|| error("BINDING_DOCUMENT", "Binding payload is missing"))?;
    if is(
        get(
            get(binding, "vocabularies").unwrap_or(&Value::Null),
            "umf.binding",
        )
        .and_then(|version| get(version, "version")),
        "0.3.0",
    ) {
        return Err(error(
            "BINDING_PROFILE",
            "Legacy native generators do not admit scalar-carrier bindings",
        ));
    }
    let target = get(payload, "target")
        .ok_or_else(|| error("BINDING_TARGET", "Binding target is missing"))?;
    let version = utf8(
        get(target, "version"),
        "BINDING_TARGET",
        "PostgreSQL target version is invalid",
    )?;
    if !is(get(target, "system"), "postgresql")
        || !(version == "17" || version.starts_with("17."))
        || !is(get(target, "subset"), "ddd-tables-jsonb-list-partition")
    {
        return Err(error(
            "BINDING_TARGET",
            "Expected pinned PostgreSQL 17 DDD table subset",
        ));
    }
    let elements = array(get(payload, "elements"));
    let fields = array(get(payload, "fields"));
    let mut types = BTreeMap::new();
    for row in array(get(policy, "fieldTypes")) {
        ctx.charge_work(1, u("/policy/fieldTypes"))?;
        if !exact(row, &["module", "element", "field", "sqlType"]) {
            return Err(error(
                "POSTGRESQL_TABLE_POLICY",
                "Invalid field type policy",
            ));
        }
        let key = field_key(row)
            .ok_or_else(|| error("POSTGRESQL_TABLE_POLICY", "Invalid field type identity"))?;
        let declared = utf8(
            get(row, "sqlType"),
            "POSTGRESQL_TABLE_POLICY",
            "Invalid SQL type choice",
        )?;
        if !fields.iter().any(|field| {
            field_key(field).as_ref() == Some(&key) && is(get(field, "storage"), "column")
        }) || !elements
            .iter()
            .any(|owner| owner_key(owner) == Some((key.0.clone(), key.1.clone())))
            || types.insert(key, declared).is_some()
        {
            return Err(error(
                "POSTGRESQL_TABLE_POLICY",
                "Field type policy has no unique table-bound column",
            ));
        }
    }
    let mut partitions = BTreeMap::new();
    for row in array(get(policy, "partitionFamilies")) {
        ctx.charge_work(1, u("/policy/partitionFamilies"))?;
        if !exact(row, &["name", "column", "defaultTable"]) {
            return Err(error("POSTGRESQL_TABLE_POLICY", "Invalid partition family"));
        }
        let name = utf8(
            get(row, "name"),
            "POSTGRESQL_TABLE_POLICY",
            "Partition name is required",
        )?;
        let column = utf8(
            get(row, "column"),
            "POSTGRESQL_TABLE_POLICY",
            "Partition column is required",
        )?;
        let default_table = utf8(
            get(row, "defaultTable"),
            "POSTGRESQL_TABLE_POLICY",
            "Default partition is required",
        )?;
        quote(&column)?;
        quote(&default_table)?;
        if !elements
            .iter()
            .any(|owner| is(get(owner, "partition"), &name))
            || partitions.insert(name, (column, default_table)).is_some()
        {
            return Err(error(
                "POSTGRESQL_TABLE_POLICY",
                "Partition family has no unique bound owner",
            ));
        }
    }
    let mut residuals = Vec::new();
    let mut mappings = Vec::new();
    let mut statements = Vec::new();
    let mut schemas = BTreeSet::new();
    let mut tables = BTreeSet::new();
    for (ei, element) in elements.iter().enumerate() {
        ctx.charge_work(1, u("/extensions/umf.binding/elements"))?;
        let path = format!("/extensions/umf.binding/elements/{ei}");
        let (module_id, element_id) = owner_key(element)
            .ok_or_else(|| error("BINDING_REFERENCE", "Bound owner is malformed"))?;
        let owner_module = array(get(logical, "modules"))
            .iter()
            .enumerate()
            .find(|(_, module)| text(get(module, "id")) == Some(&module_id));
        let Some((mi, module)) = owner_module else {
            return Err(error("BINDING_REFERENCE", "Bound module is absent"));
        };
        let owner = array(get(module, "elements"))
            .iter()
            .enumerate()
            .find(|(_, candidate)| text(get(candidate, "id")) == Some(&element_id));
        let Some((oi, owner)) = owner else {
            return Err(error("BINDING_REFERENCE", "Bound element is absent"));
        };
        let definition = get(get(owner, "extensions").unwrap_or(&Value::Null), "umf.ddd");
        if !is(definition.and_then(|value| get(value, "kind")), "entity") {
            residuals.push(residual(
                &path,
                "Only DDD entities have a table carrier in this slice",
                element,
                ctx,
            )?);
            continue;
        }
        let definition = definition.expect("entity definition");
        let table = utf8(
            get(element, "table"),
            "POSTGRESQL_TABLE_POLICY",
            "An exact schema.table override is required",
        );
        let Ok(table) = table else {
            residuals.push(residual(
                &path,
                "An exact schema.table override is required",
                element,
                ctx,
            )?);
            continue;
        };
        let Some((schema, name)) = table.split_once('.') else {
            residuals.push(residual(
                &path,
                "An exact schema.table override is required",
                element,
                ctx,
            )?);
            continue;
        };
        if name.contains('.') || schema.is_empty() || name.is_empty() {
            residuals.push(residual(
                &path,
                "An exact schema.table override is required",
                element,
                ctx,
            )?);
            continue;
        }
        quote(schema)?;
        quote(name)?;
        if !tables.insert((schema.to_owned(), name.to_owned())) {
            return Err(error(
                "POSTGRESQL_TABLE_DUPLICATE",
                "Two logical elements target one PostgreSQL table",
            ));
        }
        let mut columns = Vec::new();
        let mut occupied = BTreeSet::new();
        let mut embedded: BTreeMap<String, (Vec<Value>, Vec<String>)> = BTreeMap::new();
        let authored = get(definition, "fields")
            .ok_or_else(|| error("DDD_DOCUMENT", "Entity fields are missing"))?;
        let mut rows = Vec::new();
        for (fi, field) in fields.iter().enumerate() {
            if owner_key(field) == Some((module_id.clone(), element_id.clone())) {
                rows.push((fi, field));
            }
        }
        for (field_name, _) in match authored {
            Value::Object(fields) => fields.as_slice(),
            _ => &[],
        } {
            if !rows
                .iter()
                .any(|(_, bound)| text(get(bound, "field")) == Some(field_name))
            {
                residuals.push(residual(
                    &path,
                    "DDD field has no physical binding",
                    &obj(vec![("field", Value::String(field_name.clone()))]),
                    ctx,
                )?);
            }
        }
        for (fi, field) in rows {
            ctx.charge_work(1, u("/extensions/umf.binding/fields"))?;
            let fp = format!("/extensions/umf.binding/fields/{fi}");
            let Some(field_name) = text(get(field, "field")) else {
                residuals.push(residual(
                    &fp,
                    "This slice requires an exact DDD field key",
                    field,
                    ctx,
                )?);
                continue;
            };
            let authored_field = match authored {
                Value::Object(items) => items
                    .iter()
                    .find(|(key, _)| key == field_name)
                    .map(|(_, value)| value),
                _ => None,
            }
            .ok_or_else(|| error("BINDING_REFERENCE", "Unresolved DDD field"))?;
            if is(get(field, "storage"), "embedded") {
                let column = utf8(
                    get(field, "documentColumn"),
                    "POSTGRESQL_TABLE_POLICY",
                    "Embedded column is missing",
                )?;
                quote(&column)?;
                let path_value = copy_json(get(field, "path").unwrap_or(&Value::Null), ctx)?;
                let group = embedded.entry(column).or_default();
                group.0.push(path_value);
                group.1.push(fp.clone());
                residuals.push(residual(&fp, "JSONB normalizes document representation and does not enforce embedded path presence or value type", field, ctx)?);
                continue;
            }
            if is(get(authored_field, "cardinality"), "many") {
                residuals.push(residual(
                    &fp,
                    "A many-valued DDD field needs a separately declared table or JSONB carrier",
                    field,
                    ctx,
                )?);
                continue;
            }
            if !is(
                get(get(authored_field, "type").unwrap_or(&Value::Null), "kind"),
                "scalar",
            ) {
                residuals.push(residual(
                    &fp,
                    "Concept-valued field needs an explicit relationship or serialization profile",
                    field,
                    ctx,
                )?);
                continue;
            }
            let typ = types
                .get(&(module_id.clone(), element_id.clone(), field_name.clone()))
                .and_then(|name| sql_type(name));
            let expected = utf8(
                get(get(authored_field, "type").unwrap_or(&Value::Null), "name"),
                "DDD_DOCUMENT",
                "Scalar name is missing",
            )?;
            let Some((sql, family)) = typ else {
                residuals.push(residual(
                    &fp,
                    "No safe explicit PostgreSQL scalar type mapping for this DDD field",
                    field,
                    ctx,
                )?);
                continue;
            };
            if family != expected {
                residuals.push(residual(
                    &fp,
                    "No safe explicit PostgreSQL scalar type mapping for this DDD field",
                    field,
                    ctx,
                )?);
                continue;
            }
            for (family, reason) in [
                ("integer", "PostgreSQL finite integer domain narrows unbounded DDD integer"),
                ("string", "PostgreSQL text/varchar storage and collation do not establish unrestricted DDD string semantics"),
                ("decimal", "PostgreSQL numeric precision and scale narrow unqualified DDD decimal"),
                ("bytes", "PostgreSQL bytea storage has a finite size bound outside DDD bytes meaning"),
                ("date-time", "DDD date-time does not declare instant/civil, precision or offset semantics"),
            ] { if expected == family { residuals.push(residual(&fp, reason, field, ctx)?); } }
            if is(get(authored_field, "cardinality"), "optional") {
                residuals.push(residual(&fp, "SQL NULL is the selected absence carrier, not an implication of DDD optionality", field, ctx)?);
            }
            let column = utf8(
                get(field, "column"),
                "POSTGRESQL_TABLE_POLICY",
                "Physical column is missing",
            )?;
            if !occupied.insert(column.clone()) {
                return Err(error(
                    "POSTGRESQL_TABLE_COLUMN",
                    "Duplicate physical column",
                ));
            }
            columns.push(format!(
                "{} {}{}",
                quote(&column)?,
                sql,
                if is(get(authored_field, "cardinality"), "one") {
                    " NOT NULL"
                } else {
                    ""
                }
            ));
            mappings.push(mapping(&fp, &format!("{schema}.{name}.{column}")));
        }
        for (column, (paths, source_paths)) in embedded {
            if !occupied.insert(column.clone()) {
                return Err(error(
                    "POSTGRESQL_TABLE_COLUMN",
                    "Embedded document column aliases a scalar column",
                ));
            }
            columns.push(format!("{} jsonb", quote(&column)?));
            columns.push(format!(
                "CONSTRAINT {} CHECK ({} IS NULL OR jsonb_typeof({}) = 'object')",
                quote(&format!("ck_{name}_{column}_object"))?,
                quote(&column)?,
                quote(&column)?
            ));
            mappings.push(mapping(
                &source_paths[0],
                &format!("{schema}.{name}.{column}"),
            ));
            let mut unique = BTreeSet::new();
            for path in paths {
                if !unique.insert(
                    crate::serialization::stringify_compact_metered(&path, ctx)?
                        .units()
                        .to_vec(),
                ) {
                    return Err(error("POSTGRESQL_TABLE_PATH", "Duplicate embedded path"));
                }
            }
        }
        if columns.is_empty() {
            residuals.push(residual(
                &path,
                "Cannot emit an empty PostgreSQL table",
                element,
                ctx,
            )?);
            continue;
        }
        if schemas.insert(schema.to_owned()) {
            statements.push(format!("CREATE SCHEMA IF NOT EXISTS {};", quote(schema)?));
        }
        let mut placement = String::new();
        let mut child = None;
        if let Some(partition) = text(get(element, "partition")) {
            let partition = partition
                .to_utf8()
                .map_err(|_| error("POSTGRESQL_TABLE_POLICY", "Invalid partition identity"))?;
            if let Some((column, default_table)) = partitions.get(&partition) {
                if !occupied.contains(column) {
                    residuals.push(residual(
                        &format!("{path}/partition"),
                        "Partition column is absent from emitted table",
                        element,
                        ctx,
                    )?);
                } else {
                    placement = format!(" PARTITION BY LIST ({})", quote(column)?);
                    if !tables.insert((schema.to_owned(), default_table.clone())) {
                        return Err(error(
                            "POSTGRESQL_TABLE_DUPLICATE",
                            "Default partition collides with another table",
                        ));
                    }
                    child = Some(format!(
                        "CREATE TABLE {}.{} PARTITION OF {}.{} DEFAULT;",
                        quote(schema)?,
                        quote(default_table)?,
                        quote(schema)?,
                        quote(name)?
                    ));
                }
            } else {
                residuals.push(residual(
                    &format!("{path}/partition"),
                    "Partition family lacks explicit LIST/default policy",
                    element,
                    ctx,
                )?);
            }
        }
        statements.push(format!(
            "CREATE TABLE {}.{} (\n  {}\n){placement};",
            quote(schema)?,
            quote(name)?,
            columns.join(",\n  ")
        ));
        if let Some(child) = child {
            statements.push(child);
        }
        mappings.push(mapping(&path, &format!("{schema}.{name}")));
        residuals.push(residual(
            &path,
            "DDD identity is retained; this table slice does not emit a primary or unique key",
            get(definition, "identity").unwrap_or(&Value::Null),
            ctx,
        )?);
        if let Some(aggregate) = get(definition, "aggregate") {
            residuals.push(residual(
                &path,
                "DDD aggregate membership and lifecycle are not SQL table semantics",
                aggregate,
                ctx,
            )?);
        }
        for (ii, invariant) in array(get(definition, "invariants")).iter().enumerate() {
            residuals.push(residual(
                &format!("/modules/{mi}/elements/{oi}/extensions/umf.ddd/invariants/{ii}"),
                "DDD invariant is retained but not interpreted or enforced",
                invariant,
                ctx,
            )?);
        }
    }
    for (fi, field) in fields.iter().enumerate() {
        if !elements
            .iter()
            .any(|owner| owner_key(owner) == owner_key(field))
        {
            residuals.push(residual(
                &format!("/extensions/umf.binding/fields/{fi}"),
                "Field has no table-bound owner in this projection",
                field,
                ctx,
            )?);
        }
    }
    for (i, row) in array(get(payload, "relationships")).iter().enumerate() {
        residuals.push(residual(
            &format!("/extensions/umf.binding/relationships/{i}"),
            "Relationship storage is handled by the relationship-dependent generator",
            row,
            ctx,
        )?);
    }
    for (i, row) in array(get(payload, "indexes")).iter().enumerate() {
        residuals.push(residual(
            &format!("/extensions/umf.binding/indexes/{i}"),
            "Index storage is handled by the separate index generator",
            row,
            ctx,
        )?);
    }
    if statements.is_empty() {
        residuals.push(residual(
            "/extensions/umf.binding/elements",
            "No complete PostgreSQL table can be emitted",
            get(payload, "elements").unwrap_or(&Value::Null),
            ctx,
        )?);
    }
    let blocked = statements.is_empty() || loss_policy == "strict" && !residuals.is_empty();
    let mut output = obj(vec![
        (
            "status",
            s(if blocked {
                "blocked"
            } else if residuals.is_empty() {
                "proposed"
            } else {
                "reported"
            }),
        ),
        ("logical", copy_json(logical, ctx)?),
        ("binding", copy_json(binding, ctx)?),
        ("policy", copy_json(policy, ctx)?),
        ("target", copy_json(target, ctx)?),
        ("residuals", Value::Array(residuals)),
        ("mappings", Value::Array(mappings)),
    ]);
    if !blocked {
        if let Value::Object(fields) = &mut output {
            fields.push((u("candidate"), s(&(statements.join("\n") + "\n"))));
        }
    }
    Ok(output)
}

pub fn complete_tables(
    logical: &Value,
    binding: &Value,
    policy: &Value,
    loss_policy: &str,
    resources: &BindingInspectionResources,
    archive: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let prepared = prepare_tables(logical, binding, policy, loss_policy, resources, ctx)?;
    if is(get(&prepared, "status"), "blocked") {
        return Err(error(
            "POSTGRESQL_TABLE_RECEIPT",
            "Prepared table projection is blocked",
        ));
    }
    let candidate = text(get(&prepared, "candidate"))
        .ok_or_else(|| error("POSTGRESQL_TABLE_RECEIPT", "Candidate is missing"))?;
    let source = postgresql_sql_runtime::get_postgresql_source(archive, ctx)?;
    if text(Some(&source)) != Some(candidate) {
        return Err(error(
            "POSTGRESQL_TABLE_RECEIPT",
            "Parser archive differs from generated SQL",
        ));
    }
    let inspection = postgresql_sql_runtime::inspect_postgresql_sql(archive, ctx)?;
    if !matches!(get(&inspection, "valid"), Some(Value::Bool(true))) {
        return Err(error(
            "POSTGRESQL_TABLE_PARSER",
            "Generated SQL failed parser admission",
        ));
    }
    let mut result = prepared;
    if let Value::Object(fields) = &mut result {
        fields.push((u("targetArchive"), copy_json(archive, ctx)?));
    }
    Ok(result)
}

pub fn block_host_failure(
    logical: &Value,
    binding: &Value,
    policy: &Value,
    loss_policy: &str,
    resources: &BindingInspectionResources,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let mut result = prepare_tables(logical, binding, policy, loss_policy, resources, ctx)?;
    let target = get(&result, "target").cloned().unwrap_or(Value::Null);
    if let Value::Object(fields) = &mut result {
        fields.retain(|(key, _)| key != &u("candidate") && key != &u("targetArchive"));
        if let Some((_, status)) = fields.iter_mut().find(|(key, _)| key == &u("status")) {
            *status = s("blocked")
        }
        if let Some((_, Value::Array(residuals))) =
            fields.iter_mut().find(|(key, _)| key == &u("residuals"))
        {
            residuals.push(residual(
                "/extensions/umf.binding",
                "Generated DDL did not pass PostgreSQL parser/deparser/codec",
                &target,
                ctx,
            )?);
        }
    }
    Ok(result)
}

fn indexed_field<'a>(fields: &'a [Value], reference: &Value) -> Option<&'a Value> {
    let key = field_key(reference)?;
    fields
        .iter()
        .find(|row| field_key(row) == Some(key.clone()))
}
fn version_17(value: Option<&Value>) -> bool {
    text(value)
        .and_then(|v| v.to_utf8().ok())
        .is_some_and(|v| v == "17" || v.starts_with("17."))
}
fn index_receipt_is_one_statement(
    archive: &Value,
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    let root = postgresql_sql_runtime::get_postgresql_node(archive, &Utf16::default(), ctx)?;
    let tree = NativeJsonTree::from_tagged_value(&root, ctx)?;
    let NativeJsonNode::Object(root) = tree.root() else {
        return Ok(false);
    };
    let Some((_, NativeJsonNode::Array(stmts))) = root.iter().find(|(k, _)| k == &u("stmts"))
    else {
        return Ok(false);
    };
    let [NativeJsonNode::Object(row)] = stmts.as_slice() else {
        return Ok(false);
    };
    let Some((_, NativeJsonNode::Object(stmt))) = row.iter().find(|(k, _)| k == &u("stmt")) else {
        return Ok(false);
    };
    Ok(stmt.iter().any(|(k, _)| k == &u("IndexStmt")))
}
fn index_rows(
    binding: &Value,
    policy: &Value,
    table_report: &Value,
    ctx: &mut Context<'_>,
) -> Result<(Vec<Value>, Vec<Value>), EngineError> {
    let payload = get(
        get(binding, "extensions").unwrap_or(&Value::Null),
        "umf.binding",
    )
    .ok_or_else(|| error("BINDING_DOCUMENT", "Binding payload is missing"))?;
    let elements = array(get(payload, "elements"));
    let fields = array(get(payload, "fields"));
    let mut emitted_tables = BTreeSet::new();
    let mut emitted_columns: BTreeMap<String, BTreeMap<String, String>> = BTreeMap::new();
    for row in array(get(table_report, "mappings")) {
        ctx.charge_work(1, u("/mappings"))?;
        let source_path = utf8(
            get(row, "sourcePath"),
            "POSTGRESQL_TABLE_RECEIPT",
            "Invalid table mapping path",
        )?;
        if let Some(element_index) = source_path
            .strip_prefix("/extensions/umf.binding/elements/")
            .and_then(|s| s.parse::<usize>().ok())
        {
            let element = elements.get(element_index).ok_or_else(|| {
                error("POSTGRESQL_TABLE_RECEIPT", "Mapped table owner is absent")
            })?;
            emitted_tables.insert(utf8(
                get(element, "table"),
                "POSTGRESQL_TABLE_RECEIPT",
                "Mapped table identity is absent",
            )?);
        } else if let Some(field_index) = source_path
            .strip_prefix("/extensions/umf.binding/fields/")
            .and_then(|s| s.parse::<usize>().ok())
        {
            let field = fields.get(field_index).ok_or_else(|| {
                error("POSTGRESQL_TABLE_RECEIPT", "Mapped field is absent")
            })?;
            let element = elements
                .iter()
                .find(|element| owner_key(element) == owner_key(field))
                .ok_or_else(|| {
                    error("POSTGRESQL_TABLE_RECEIPT", "Mapped field owner is absent")
                })?;
            let table = utf8(
                get(element, "table"),
                "POSTGRESQL_TABLE_RECEIPT",
                "Mapped field table identity is absent",
            )?;
            // Mapping targets are display text. Quoted physical column names
            // can contain dots, so recover identities from the binding itself.
            let column = utf8(
                get(
                    field,
                    if is(get(field, "storage"), "embedded") {
                        "documentColumn"
                    } else {
                        "column"
                    },
                ),
                "POSTGRESQL_TABLE_RECEIPT",
                "Mapped physical column identity is absent",
            )?;
            let kind = if is(get(field, "storage"), "embedded") {
                "jsonb".to_owned()
            } else {
                array(get(policy, "fieldTypes"))
                    .iter()
                    .find(|type_row| field_key(type_row) == field_key(field))
                    .and_then(|type_row| text(get(type_row, "sqlType")))
                    .and_then(|value| value.to_utf8().ok())
                    .and_then(|value| sql_type(&value).map(|(sql, _)| sql))
                    .unwrap_or_default()
            };
            emitted_columns
                .entry(table)
                .or_default()
                .insert(column, kind);
        }
    }
    let mut residuals = Vec::new();
    let mut candidates = Vec::new();
    for (i, item) in array(get(payload, "indexes")).iter().enumerate() {
        ctx.charge_work(1, u("/extensions/umf.binding/indexes"))?;
        let path = format!("/extensions/umf.binding/indexes/{i}");
        let mut refuse = |reason: &str, ctx: &mut Context<'_>| -> Result<(), EngineError> {
            residuals.push(residual(&path, reason, item, ctx)?);
            Ok(())
        };
        let kind = utf8(get(item, "kind"), "BINDING_INDEX", "Index kind is missing")?;
        if kind == "clustering" {
            refuse(
                "PostgreSQL physical clustering is not this declared index kind",
                ctx,
            )?;
            continue;
        }
        if let Some(predicate) = get(item, "predicate") {
            if !is(get(predicate, "language"), "postgresql")
                || !version_17(get(predicate, "version"))
            {
                refuse(
                    "Predicate language/version differs from PostgreSQL 17 profile",
                    ctx,
                )?;
                continue;
            }
        }
        let unique = matches!(get(item, "unique"), Some(Value::Bool(true)));
        if unique && !["btree", "unique", "expression", "partial"].contains(&kind.as_str()) {
            refuse(
                "Unique enforcement for this access method is outside the verified profile",
                ctx,
            )?;
            continue;
        }
        if !array(get(item, "include")).is_empty() && ["gin", "hash"].contains(&kind.as_str()) {
            refuse(
                "Included columns are outside this access-method profile",
                ctx,
            )?;
            continue;
        }
        let on = array(get(item, "on"));
        let owner = on
            .first()
            .and_then(|term| {
                get(term, "field").or_else(|| get(get(term, "documentPath")?, "field"))
            })
            .and_then(owner_key);
        let element = owner.as_ref().and_then(|owner| {
            elements
                .iter()
                .find(|row| owner_key(row).as_ref() == Some(owner))
        });
        let table = element
            .and_then(|row| text(get(row, "table")))
            .and_then(|value| value.to_utf8().ok());
        let Some(table) = table.filter(|table| emitted_tables.contains(table)) else {
            refuse(
                "Index owner needs an exact table override in native source",
                ctx,
            )?;
            continue;
        };
        let columns = emitted_columns.get(&table);
        let mut valid = true;
        let mut terms = Vec::new();
        let mut indexed_columns = BTreeSet::new();
        for term in on {
            let direct = get(term, "field");
            let reference =
                direct.or_else(|| get(get(term, "documentPath").unwrap_or(&Value::Null), "field"));
            let field = reference.and_then(|reference| indexed_field(fields, reference));
            let Some(field) = field else {
                valid = false;
                break;
            };
            if direct.is_some() {
                let column = utf8(
                    get(field, "column"),
                    "BINDING_INDEX",
                    "Index column is absent",
                )?;
                if !columns.is_some_and(|columns| columns.contains_key(&column)) {
                    valid = false;
                    break;
                }
                indexed_columns.insert(column.clone());
                terms.push(quote(&column)?);
            } else {
                let column = utf8(
                    get(field, "documentColumn"),
                    "BINDING_INDEX",
                    "Document column is absent",
                )?;
                let document = get(term, "documentPath").unwrap_or(&Value::Null);
                if !is(get(field, "storage"), "embedded")
                    || columns
                        .and_then(|columns| columns.get(&column))
                        .map(String::as_str)
                        != Some("jsonb")
                    || get(field, "path") != get(document, "path")
                {
                    valid = false;
                    break;
                }
                let mut segments = Vec::new();
                for segment in array(get(document, "path")) {
                    let literal = utf8(Some(segment), "BINDING_INDEX", "Document path is invalid")?;
                    segments.push(format!("'{}'", literal.replace('\'', "''")));
                }
                terms.push(format!(
                    "({} #>> ARRAY[{}]::text[])",
                    quote(&column)?,
                    segments.join(",")
                ));
            }
        }
        let mut includes = Vec::new();
        for reference in array(get(item, "include")) {
            let field = indexed_field(fields, reference);
            let Some(field) = field else {
                valid = false;
                break;
            };
            let column = utf8(
                get(field, "column"),
                "BINDING_INDEX",
                "Include column is absent",
            )?;
            if !columns.is_some_and(|columns| columns.contains_key(&column)) {
                valid = false;
                break;
            }
            includes.push(quote(&column)?);
        }
        if !valid {
            refuse(
                "Index field or JSONB document column is absent from native table",
                ctx,
            )?;
            continue;
        }
        let partition = element.and_then(|row| text(get(row, "partition")));
        let partition_key = partition
            .and_then(|name| {
                array(get(policy, "partitionFamilies"))
                    .iter()
                    .find(|row| text(get(row, "name")) == Some(name))
            })
            .and_then(|row| text(get(row, "column")))
            .and_then(|value| value.to_utf8().ok())
            .filter(|key| columns.is_some_and(|columns| columns.contains_key(key)));
        if unique && partition_key.is_some_and(|key| !indexed_columns.contains(&key)) {
            refuse(
                "Unique index on a partitioned table must include every partition key",
                ctx,
            )?;
            continue;
        }
        if kind == "gin" || kind == "gist" {
            let supported = on.iter().all(|term| {
                let Some(field) =
                    get(term, "field").and_then(|reference| indexed_field(fields, reference))
                else {
                    return false;
                };
                let Some(column) =
                    text(get(field, "column")).and_then(|value| value.to_utf8().ok())
                else {
                    return false;
                };
                let typ = columns
                    .and_then(|columns| columns.get(&column))
                    .map(String::as_str);
                (kind == "gin" && typ == Some("jsonb")) || (kind == "gist" && typ == Some("point"))
            });
            if !supported {
                refuse(
                    "No verified default operator class for this index method and column type",
                    ctx,
                )?;
                continue;
            }
        }
        let predicate = get(item, "predicate")
            .and_then(|value| text(get(value, "expression")))
            .and_then(|value| value.to_utf8().ok());
        if predicate.as_ref().is_some_and(|value| {
            value.trim().is_empty()
                || value.contains(';')
                || value.contains("--")
                || value.contains("/*")
        }) {
            refuse("Predicate is outside the single-expression SQL subset", ctx)?;
            continue;
        }
        let method = if ["btree", "hash", "gin", "gist"].contains(&kind.as_str()) {
            kind.as_str()
        } else {
            "btree"
        };
        let name = utf8(get(item, "name"), "BINDING_INDEX", "Index name is missing")?;
        let target_table = table
            .split('.')
            .map(quote)
            .collect::<Result<Vec<_>, _>>()?
            .join(".");
        let sql = format!(
            "CREATE {}INDEX {} ON {} USING {} ({}){}{};",
            if unique { "UNIQUE " } else { "" },
            quote(&name)?,
            target_table,
            method,
            terms.join(", "),
            if includes.is_empty() {
                String::new()
            } else {
                format!(" INCLUDE ({})", includes.join(", "))
            },
            predicate
                .map(|value| format!(" WHERE ({value})"))
                .unwrap_or_default()
        );
        candidates.push(obj(vec![
            ("path", s(&path)),
            ("sql", s(&sql)),
            ("choice", copy_json(item, ctx)?),
        ]));
    }
    Ok((residuals, candidates))
}

/// Stage one: Rust chooses every index and records each loss independently.
/// `table_archive` must be the exact parser receipt for the Rust table proposal.
pub fn prepare_tables_indexes(
    logical: &Value,
    binding: &Value,
    policy: &Value,
    table_archive: &Value,
    resources: &BindingInspectionResources,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let table = complete_tables(
        logical,
        binding,
        policy,
        "report",
        resources,
        table_archive,
        ctx,
    )?;
    let (index_residuals, index_candidates) = index_rows(binding, policy, &table, ctx)?;
    Ok(obj(vec![
        ("table", table),
        ("indexResiduals", Value::Array(index_residuals)),
        ("indexCandidates", Value::Array(index_candidates)),
    ]))
}

/// Stage two: Rust verifies each successful parser receipt and the combined source.
/// A null index receipt means the supplied parser/deparser rejected that one index.
pub fn complete_tables_indexes(
    logical: &Value,
    binding: &Value,
    policy: &Value,
    loss_policy: &str,
    table_archive: &Value,
    index_archives: &Value,
    combined_archive: Option<&Value>,
    resources: &BindingInspectionResources,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    if !matches!(loss_policy, "strict" | "report") {
        return Err(error("POSTGRESQL_TABLE_POLICY", "Invalid loss policy"));
    }
    let prepared = prepare_tables_indexes(logical, binding, policy, table_archive, resources, ctx)?;
    let table = get(&prepared, "table")
        .ok_or_else(|| error("POSTGRESQL_TABLE_RECEIPT", "Table stage is absent"))?;
    let candidates = array(get(&prepared, "indexCandidates"));
    let Value::Array(archives) = index_archives else {
        return Err(error(
            "POSTGRESQL_INDEX_RECEIPT",
            "Index receipts must be an array",
        ));
    };
    if archives.len() != candidates.len() {
        return Err(error(
            "POSTGRESQL_INDEX_RECEIPT",
            "Index receipt count differs from selected candidates",
        ));
    }
    let mut residuals = Vec::new();
    for row in array(get(table, "residuals")) {
        if !text(get(row, "path")).is_some_and(|path| {
            path.to_utf8()
                .ok()
                .is_some_and(|path| path.starts_with("/extensions/umf.binding/indexes/"))
        }) {
            residuals.push(copy_json(row, ctx)?);
        }
    }
    for row in array(get(&prepared, "indexResiduals")) {
        residuals.push(copy_json(row, ctx)?);
    }
    let mut accepted = Vec::new();
    for (row, archive) in candidates.iter().zip(archives) {
        let path = utf8(
            get(row, "path"),
            "POSTGRESQL_INDEX_RECEIPT",
            "Candidate path is missing",
        )?;
        let sql = utf8(
            get(row, "sql"),
            "POSTGRESQL_INDEX_RECEIPT",
            "Candidate SQL is missing",
        )?;
        if matches!(archive, Value::Null) {
            residuals.push(residual(
                &path,
                "Index DDL fails pinned PostgreSQL parser/deparser/codec",
                get(row, "choice").unwrap_or(&Value::Null),
                ctx,
            )?);
            continue;
        }
        let source = postgresql_sql_runtime::get_postgresql_source(archive, ctx)?;
        if text(Some(&source)) != Some(&u(&sql)) {
            return Err(error(
                "POSTGRESQL_INDEX_RECEIPT",
                "Index parser receipt differs from selected SQL",
            ));
        }
        let shape = index_receipt_is_one_statement(archive, ctx)?;
        let inspection = postgresql_sql_runtime::inspect_postgresql_sql(archive, ctx)?;
        if !shape || !matches!(get(&inspection, "valid"), Some(Value::Bool(true))) {
            residuals.push(residual(
                &path,
                "Index DDL fails pinned PostgreSQL parser/deparser/codec",
                get(row, "choice").unwrap_or(&Value::Null),
                ctx,
            )?);
            continue;
        }
        accepted.push(sql);
    }
    let table_sql = utf8(
        get(table, "candidate"),
        "POSTGRESQL_TABLE_RECEIPT",
        "Table proposal is missing",
    )?;
    let candidate = table_sql
        + &if accepted.is_empty() {
            String::new()
        } else {
            accepted.join("\n") + "\n"
        };
    if combined_archive.is_none() {
        return Ok(obj(vec![("candidate", s(&candidate))]));
    }
    let mut combined_ok = false;
    if let Some(archive) = combined_archive.filter(|archive| !matches!(archive, Value::Null)) {
        let source = postgresql_sql_runtime::get_postgresql_source(archive, ctx)?;
        if text(Some(&source)) != Some(&u(&candidate)) {
            return Err(error(
                "POSTGRESQL_TABLE_RECEIPT",
                "Combined parser receipt differs from Rust DDL",
            ));
        }
        let inspection = postgresql_sql_runtime::inspect_postgresql_sql(archive, ctx)?;
        combined_ok = matches!(get(&inspection, "valid"), Some(Value::Bool(true)));
    }
    if !combined_ok {
        let choice = get(table, "target").unwrap_or(&Value::Null);
        residuals.push(residual(
            "/extensions/umf.binding/indexes",
            "Combined DDL did not pass PostgreSQL parser/deparser/codec",
            choice,
            ctx,
        )?);
    }
    let status = if !combined_ok || loss_policy == "strict" && !residuals.is_empty() {
        "blocked"
    } else if residuals.is_empty() {
        "proposed"
    } else {
        "reported"
    };
    let mut result = obj(vec![
        ("status", s(status)),
        ("logical", copy_json(logical, ctx)?),
        ("binding", copy_json(binding, ctx)?),
        ("policy", copy_json(policy, ctx)?),
        (
            "target",
            copy_json(get(table, "target").unwrap_or(&Value::Null), ctx)?,
        ),
        ("residuals", Value::Array(residuals)),
        (
            "mappings",
            copy_json(get(table, "mappings").unwrap_or(&Value::Null), ctx)?,
        ),
    ]);
    if status != "blocked" {
        if let Value::Object(fields) = &mut result {
            fields.push((u("candidate"), s(&candidate)));
            fields.push((
                u("targetArchive"),
                copy_json(combined_archive.expect("combined archive"), ctx)?,
            ));
        }
    }
    Ok(result)
}
