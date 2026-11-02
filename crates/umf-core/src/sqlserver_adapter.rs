//! Draft additive native SQL Server catalog kernel.
//! This scratch implementation maps the current monolithic JSON capture profile
//! and deliberately leaves server correspondence outside the runtime.
use crate::{
    Context as CoreContext, EngineError, Utf16, Value,
    native_json::{NativeJsonNode, NativeJsonTree},
    schema::{CompiledSchema, SchemaResources},
    serialization::{self, Format},
};

const PROFILE: &str = "sqlserver-catalog-v1";
const EXTENSION: &str = "umf.sqlserver";

#[derive(Clone, Debug, PartialEq)]
pub struct SqlServerColumnMetadata {
    pub path: Utf16,
    pub schema: Utf16,
    pub table: Utf16,
    pub element: Value,
    pub native_column: Value,
}

#[derive(Clone, Debug, PartialEq)]
pub struct SqlServerConstraintMetadata {
    pub complete: bool,
    pub tables: Vec<Value>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct SqlServerIndexMetadata {
    pub complete: bool,
    pub tables: Vec<Value>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct SqlServerCatalog {
    root: NativeJsonTree,
}

#[derive(Clone, Debug, PartialEq)]
pub struct SqlServerInspection {
    pub valid: bool,
    pub complete: bool,
    pub diagnostics: Vec<Value>,
}

fn err(code: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}
fn key(value: &str) -> Utf16 {
    Utf16::from(value)
}
fn string(value: &Utf16) -> Value {
    Value::String(value.clone())
}
fn obj(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(name, value)| (key(name), value))
            .collect(),
    )
}
fn field<'a>(node: &'a NativeJsonNode, name: &str) -> Option<&'a NativeJsonNode> {
    let NativeJsonNode::Object(fields) = node else {
        return None;
    };
    let wanted = key(name);
    fields
        .iter()
        .find(|(name, _)| name == &wanted)
        .map(|(_, value)| value)
}
fn value_field<'a>(node: &'a Value, name: &str) -> Option<&'a Value> {
    let Value::Object(fields) = node else {
        return None;
    };
    fields
        .iter()
        .find(|(field, _)| field == &key(name))
        .map(|(_, value)| value)
}
fn value_field_mut<'a>(node: &'a mut Value, name: &str) -> Option<&'a mut Value> {
    let Value::Object(fields) = node else {
        return None;
    };
    fields
        .iter_mut()
        .find(|(field, _)| field == &key(name))
        .map(|(_, value)| value)
}
fn value_string(node: Option<&Value>) -> Option<&Utf16> {
    match node {
        Some(Value::String(v)) => Some(v),
        _ => None,
    }
}
fn text(node: Option<&NativeJsonNode>) -> Option<&Utf16> {
    match node {
        Some(NativeJsonNode::String(value)) => Some(value),
        _ => None,
    }
}
fn array(node: Option<&NativeJsonNode>) -> Option<&[NativeJsonNode]> {
    match node {
        Some(NativeJsonNode::Array(items)) => Some(items),
        _ => None,
    }
}
fn utf8(node: Option<&NativeJsonNode>) -> Option<String> {
    text(node).and_then(|value| value.to_utf8().ok())
}
fn integer(node: Option<&NativeJsonNode>) -> Option<u64> {
    match node {
        Some(NativeJsonNode::Number(token)) => token
            .parse::<f64>()
            .ok()
            .filter(|value| {
                value.is_finite()
                    && value.fract() == 0.0
                    && *value >= 0.0
                    && *value <= u64::MAX as f64
            })
            .map(|value| value as u64),
        _ => None,
    }
}
fn numeric_id(node: Option<&NativeJsonNode>) -> Option<String> {
    let NativeJsonNode::Number(token) = node? else {
        return None;
    };
    if token.starts_with('-') || !exact_safe_integer(token) {
        return None;
    }
    let value = token.parse::<f64>().ok()? as u64;
    Some(value.to_string())
}
fn scalar_type(system_id: &str, base: &str, assembly: Option<bool>) -> Option<&'static str> {
    if assembly != Some(false) {
        return None;
    }
    let (name, family) = match system_id {
        "104" => ("bit", "boolean"),
        "48" => ("tinyint", "integer"),
        "52" => ("smallint", "integer"),
        "56" => ("int", "integer"),
        "127" => ("bigint", "integer"),
        "106" => ("decimal", "decimal"),
        "108" => ("numeric", "decimal"),
        "60" => ("money", "decimal"),
        "122" => ("smallmoney", "decimal"),
        "59" => ("real", "float"),
        "62" => ("float", "float"),
        "167" => ("varchar", "string"),
        "175" => ("char", "string"),
        "231" => ("nvarchar", "string"),
        "239" => ("nchar", "string"),
        "35" => ("text", "string"),
        "99" => ("ntext", "string"),
        "165" => ("varbinary", "binary"),
        "173" => ("binary", "binary"),
        "34" => ("image", "binary"),
        "189" => ("timestamp", "binary"),
        "40" => ("date", "date"),
        "41" => ("time", "time"),
        "42" => ("datetime2", "timestamp"),
        "43" => ("datetimeoffset", "timestamp"),
        "58" => ("smalldatetime", "timestamp"),
        "61" => ("datetime", "timestamp"),
        _ => return None,
    };
    (base == name).then_some(family)
}

fn exact_safe_integer(token: &str) -> bool {
    let unsigned_token = token.trim_start_matches('-');
    let mantissa_only = unsigned_token
        .split(['e', 'E'])
        .next()
        .unwrap_or(unsigned_token);
    if token.starts_with('-') && mantissa_only.bytes().all(|b| matches!(b, b'0' | b'.')) {
        return false;
    }
    let (mantissa, exponent) = token
        .split_once(['e', 'E'])
        .map_or((token, 0i32), |(m, e)| (m, e.parse().unwrap_or(i32::MIN)));
    if exponent == i32::MIN {
        return false;
    }
    let unsigned = mantissa.strip_prefix('-').unwrap_or(mantissa);
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
        digits.truncate(digits.len() - remove);
    } else {
        if scale as usize > 16 {
            return false;
        }
        digits.extend(std::iter::repeat('0').take(scale as usize));
    }
    while digits.starts_with('0') && digits.len() > 1 {
        digits.remove(0);
    }
    if digits.len() > 16 {
        return false;
    }
    let Ok(value) = digits.parse::<u64>() else {
        return false;
    };
    value <= 9_007_199_254_740_991
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
        let decoded = part.replace("~1", "/").replace("~0", "~");
        let Some(next) = schema_field(node, &decoded) else {
            return rule;
        };
        node = next;
    }
    node
}
fn integer_schema(rule: &Value) -> bool {
    match schema_field(rule, "type") {
        Some(Value::String(name)) => name.to_utf8().ok().as_deref() == Some("integer"),
        Some(Value::Array(types)) => types
            .iter()
            .any(|v| matches!(v, Value::String(s) if s.to_utf8().ok().as_deref()==Some("integer"))),
        _ => false,
    }
}
fn schema_has_integer(rule: &Value) -> bool {
    integer_schema(rule)
        || matches!(schema_field(rule, "anyOf"), Some(Value::Array(items)) if items.iter().any(schema_has_integer))
}
fn validate_declared_integers(
    node: &NativeJsonNode,
    schema: &Value,
    rule: &Value,
    ctx: &mut CoreContext<'_>,
) -> Result<(), EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    let rule = schema_lookup(schema, rule);
    if schema_has_integer(rule) {
        if let NativeJsonNode::Number(token) = node {
            if !exact_safe_integer(token) {
                return Err(err(
                    "SQLSERVER_INTEGER",
                    "Declared catalog integers must be exact safe integers",
                ));
            }
        }
    }
    if let (NativeJsonNode::Object(fields), Some(Value::Object(props))) =
        (node, schema_field(rule, "properties"))
    {
        for (name, value) in fields {
            ctx.charge_work(name.len().saturating_add(1), Utf16::default())?;
            if let Some((_, child_rule)) = props.iter().find(|(k, _)| k == name) {
                validate_declared_integers(value, schema, child_rule, ctx)?;
            }
        }
    }
    if let (NativeJsonNode::Array(items), Some(item_rule)) = (node, schema_field(rule, "items")) {
        for item in items {
            validate_declared_integers(item, schema, item_rule, ctx)?;
        }
    }
    if let Some(Value::Array(branches)) = schema_field(rule, "anyOf") {
        for branch in branches {
            validate_declared_integers(node, schema, branch, ctx)?;
        }
    }
    Ok(())
}

fn schema_project(
    node: &NativeJsonNode,
    schema: &Value,
    rule: &Value,
    ctx: &mut CoreContext<'_>,
) -> Result<Option<Value>, EngineError> {
    let rule = schema_lookup(schema, rule);
    match node {
        NativeJsonNode::Object(fields) => {
            let Some(Value::Object(props)) = schema_field(rule, "properties") else {
                return Ok(Some(Value::Object(Vec::new())));
            };
            let mut out = Vec::new();
            for (name, value) in fields {
                ctx.charge_work(name.len().saturating_add(1), Utf16::default())?;
                if let Some((_, child_rule)) = props.iter().find(|(k, _)| k == name) {
                    if let Some(projected) = schema_project(value, schema, child_rule, ctx)? {
                        out.push((name.clone(), projected));
                    }
                }
            }
            Ok(Some(Value::Object(out)))
        }
        NativeJsonNode::Array(items) => {
            let rule = schema_field(rule, "items").unwrap_or(rule);
            let mut out = Vec::new();
            ctx.charge_work(items.len(), Utf16::default())?;
            for item in items {
                if let Some(value) = schema_project(item, schema, rule, ctx)? {
                    out.push(value);
                }
            }
            Ok(Some(Value::Array(out)))
        }
        NativeJsonNode::Number(token) => {
            if !exact_safe_integer(token) && schema_has_integer(rule) {
                return Err(err(
                    "SQLSERVER_INTEGER",
                    "Declared catalog integers must be exact safe integers",
                ));
            }
            let value = token
                .parse::<f64>()
                .map_err(|_| err("SQLSERVER_CAPTURE_STRUCTURE", "Invalid declared number"))?;
            if !value.is_finite() {
                return Ok(None);
            }
            Ok(Some(Value::Number(value)))
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
    ctx: &mut CoreContext<'_>,
) -> Result<(), EngineError> {
    let schema_source = Utf16::from(include_str!(
        "../../../spec/extensions/sqlserver/capture.schema.json"
    ));
    ctx.charge_text(schema_source.len(), Utf16::default())?;
    let schema = serialization::read_json_value(schema_source.units(), Format::Json, ctx)?;
    let compiled =
        CompiledSchema::compile_consumer(&schema, &SchemaResources::default(), true, ctx)?;
    let instance = schema_project(root.root(), &schema, &schema, ctx)?
        .ok_or_else(|| err("SQLSERVER_CAPTURE_STRUCTURE", "Invalid schema instance"))?;
    if !compiled.validate(&instance, ctx)?.is_empty() {
        return Err(err(
            "SQLSERVER_CAPTURE_STRUCTURE",
            "SQL Server capture does not match the pinned catalog schema",
        ));
    }
    Ok(())
}

impl SqlServerCatalog {
    pub fn import(source: &Utf16, ctx: &mut CoreContext<'_>) -> Result<Self, EngineError> {
        let root = NativeJsonTree::parse_json(source.units(), ctx)?;
        let capture_schema = serialization::read_json_value(
            Utf16::from(include_str!(
                "../../../spec/extensions/sqlserver/capture.schema.json"
            ))
            .units(),
            Format::Json,
            ctx,
        )?;
        validate_declared_integers(root.root(), &capture_schema, &capture_schema, ctx)?;
        validate_capture_schema(&root, ctx)?;
        let NativeJsonNode::Object(root_fields) = root.root() else {
            return Err(err(
                "SQLSERVER_CAPTURE",
                "Expected a SQL Server catalog object",
            ));
        };
        let profile = text(
            root_fields
                .iter()
                .find(|(name, _)| name == &key("profile"))
                .map(|(_, v)| v),
        );
        if !matches!(
            profile
                .map(|value| value.to_utf8().ok())
                .flatten()
                .as_deref(),
            Some("sqlserver-catalog-v1" | "sqlserver-catalog-v2" | "sqlserver-catalog-v3")
        ) {
            return Err(err(
                "SQLSERVER_CAPTURE",
                "Unsupported SQL Server capture profile",
            ));
        }
        let tables = array(field(root.root(), "tables"))
            .ok_or_else(|| err("SQLSERVER_CAPTURE", "Expected captured tables"))?;
        ctx.charge_work(tables.len(), Utf16::default())?;
        let mut qualified = std::collections::BTreeSet::new();
        for table in tables {
            let schema = text(field(table, "schema"))
                .ok_or_else(|| err("SQLSERVER_CAPTURE", "Table schema must be a string"))?;
            let name = text(field(table, "name"))
                .ok_or_else(|| err("SQLSERVER_CAPTURE", "Table name must be a string"))?;
            ctx.charge_work(schema.len().saturating_add(name.len()), Utf16::default())?;
            if !qualified.insert((schema.clone(), name.clone())) {
                return Err(err(
                    "SQLSERVER_DUPLICATE",
                    "Duplicate qualified table observation",
                ));
            }
            let columns = array(field(table, "columns"))
                .ok_or_else(|| err("SQLSERVER_CAPTURE", "Table columns must be an array"))?;
            let mut names = std::collections::BTreeSet::new();
            let mut ids = std::collections::BTreeSet::new();
            for column in columns {
                let col_name = text(field(column, "name"))
                    .ok_or_else(|| err("SQLSERVER_CAPTURE", "Column name must be a string"))?;
                if !names.insert(col_name.clone()) {
                    return Err(err("SQLSERVER_DUPLICATE", "Duplicate column name"));
                }
                if let Some(id) = numeric_id(field(column, "column_id")) {
                    if !ids.insert(id) {
                        return Err(err("SQLSERVER_DUPLICATE", "Duplicate native column ID"));
                    }
                }
            }
        }
        let catalog = Self { root };
        let inspection = catalog.inspect(ctx)?;
        if !inspection.valid {
            return Err(err(
                "SQLSERVER_CAPTURE_STRUCTURE",
                "SQL Server catalog observations are inconsistent",
            ));
        }
        Ok(catalog)
    }

    pub fn export(&self, ctx: &mut CoreContext<'_>) -> Result<Utf16, EngineError> {
        let mut value = self.root.render_compact(ctx)?.into_units();
        ctx.charge_text(1, Utf16::default())?;
        value.push(10);
        Ok(Utf16::new(value))
    }

    pub fn inspect(&self, ctx: &mut CoreContext<'_>) -> Result<SqlServerInspection, EngineError> {
        let mut diagnostics = vec![diagnostic(
            "SQLSERVER_CAPTURE_SCOPE",
            "",
            "Permission-limited table/column observations; server correspondence and complete native semantics are unverified",
            "warning",
        )];
        if self.root.has_representation_extras() {
            diagnostics.push(diagnostic(
                "SQLSERVER_ENCODING",
                "/root",
                "Unknown encoding content must remain in UMF and blocks native export",
                "warning",
            ));
        }
        if !utf8(field(self.root.root(), "serverVersion"))
            .is_some_and(|version| version.starts_with("16."))
        {
            diagnostics.push(diagnostic(
                "SQLSERVER_VERSION",
                "/serverVersion",
                "Version retained outside the SQL Server 2022 profile",
                "warning",
            ));
        }
        if utf8(field(self.root.root(), "state")).as_deref() == Some("modified") {
            diagnostics.push(diagnostic(
                "SQLSERVER_MODIFIED",
                "/state",
                "Candidate metadata edits do not update SQL Server or synchronize original DDL",
                "warning",
            ));
        }
        let mut valid = true;
        if let Some(tables) = array(field(self.root.root(), "tables")) {
            ctx.charge_work(tables.len(), Utf16::default())?;
            let mut table_names = std::collections::BTreeSet::new();
            for (table_index, table) in tables.iter().enumerate() {
                let base = format!("/tables/{table_index}");
                let table_key = (
                    text(field(table, "schema")).cloned(),
                    text(field(table, "name")).cloned(),
                );
                if !table_names.insert(table_key) {
                    diagnostics.push(diagnostic(
                        "SQLSERVER_DUPLICATE",
                        &base,
                        "Duplicate qualified table observation",
                        "error",
                    ));
                    valid = false;
                }
                let mut column_names = std::collections::BTreeSet::new();
                let mut column_ids = std::collections::BTreeSet::new();
                for column in array(field(table, "columns")).unwrap_or_default() {
                    ctx.charge_work(1, Utf16::default())?;
                    let name = text(field(column, "name")).cloned();
                    let id = numeric_id(field(column, "column_id"));
                    if name.is_some_and(|value| !column_names.insert(value))
                        || id.is_some_and(|value| !column_ids.insert(value))
                    {
                        diagnostics.push(diagnostic(
                            "SQLSERVER_DUPLICATE",
                            &base,
                            "Duplicate column name or native ID",
                            "error",
                        ));
                        valid = false;
                    }
                }
                let mut constraint_names = std::collections::BTreeSet::new();
                for section in ["keys", "foreign_keys", "checks"] {
                    if let Some(constraints) = array(field(table, section)) {
                        for (constraint_index, constraint) in constraints.iter().enumerate() {
                            let path = format!("{base}/{section}/{constraint_index}");
                            if let Some(name) = text(field(constraint, "name")) {
                                if !constraint_names.insert(name.clone()) {
                                    diagnostics.push(diagnostic(
                                        "SQLSERVER_DUPLICATE",
                                        &path,
                                        "Duplicate constraint name within table",
                                        "error",
                                    ));
                                    valid = false;
                                }
                            }
                            if section != "checks" {
                                let mut ordinals = std::collections::BTreeSet::new();
                                let mut column_ids = std::collections::BTreeSet::new();
                                let columns =
                                    array(field(constraint, "columns")).unwrap_or_default();
                                if columns.is_empty() {
                                    diagnostics.push(diagnostic(
                                        "SQLSERVER_CONSTRAINT_UNRESOLVED",
                                        &path,
                                        "Constraint column observations are unavailable",
                                        "warning",
                                    ));
                                }
                                for column in columns {
                                    let ordinal_key = if section == "keys" {
                                        "key_ordinal"
                                    } else {
                                        "ordinal"
                                    };
                                    let ordinal = integer(field(column, ordinal_key));
                                    let column_id = integer(field(column, "column_id"));
                                    if ordinal.is_some_and(|value| !ordinals.insert(value))
                                        || column_id.is_some_and(|value| !column_ids.insert(value))
                                    {
                                        diagnostics.push(diagnostic(
                                            "SQLSERVER_CONSTRAINT_COLUMNS",
                                            &path,
                                            "Duplicate constraint column or ordinal",
                                            "error",
                                        ));
                                        valid = false;
                                    }
                                }
                            }
                            if section == "keys"
                                && !matches!(
                                    utf8(field(constraint, "kind")).as_deref(),
                                    Some("PK" | "UQ")
                                )
                            {
                                diagnostics.push(diagnostic("SQLSERVER_CONSTRAINT_UNKNOWN", &path, "Unknown native constraint kind/action retained without interpretation", "warning"));
                            }
                            if section == "foreign_keys" {
                                let known_action = |name| {
                                    matches!(
                                        utf8(field(constraint, name)).as_deref(),
                                        Some("NO_ACTION" | "CASCADE" | "SET_NULL" | "SET_DEFAULT")
                                    )
                                };
                                if !known_action("delete_action") || !known_action("update_action")
                                {
                                    diagnostics.push(diagnostic("SQLSERVER_CONSTRAINT_UNKNOWN", &path, "Unknown native constraint kind/action retained without interpretation", "warning"));
                                }
                            }
                        }
                    }
                }
                let mut index_ids = std::collections::BTreeSet::new();
                let mut index_names = std::collections::BTreeSet::new();
                if let Some(indexes) = array(field(table, "indexes")) {
                    for (index_number, index) in indexes.iter().enumerate() {
                        let path = format!("{base}/indexes/{index_number}");
                        let id = integer(field(index, "index_id"));
                        let name = text(field(index, "name"));
                        if id.is_some_and(|value| !index_ids.insert(value))
                            || name.is_some_and(|value| !index_names.insert(value.clone()))
                        {
                            diagnostics.push(diagnostic(
                                "SQLSERVER_DUPLICATE",
                                &path,
                                "Duplicate index name or native ID within table",
                                "error",
                            ));
                            valid = false;
                        }
                        let mut column_ids = std::collections::BTreeSet::new();
                        let mut key_ordinals = std::collections::BTreeSet::new();
                        let mut store_ordinals = std::collections::BTreeSet::new();
                        let mut partitions = std::collections::BTreeSet::new();
                        for column in array(field(index, "columns")).unwrap_or_default() {
                            let id = integer(field(column, "index_column_id"));
                            let key_order =
                                integer(field(column, "key_ordinal")).filter(|value| *value > 0);
                            let store_order = integer(field(column, "column_store_order_ordinal"))
                                .filter(|value| *value > 0);
                            let partition = integer(field(column, "partition_ordinal"))
                                .filter(|value| *value > 0);
                            let duplicate = id.is_some_and(|value| !column_ids.insert(value))
                                || key_order.is_some_and(|value| !key_ordinals.insert(value))
                                || store_order.is_some_and(|value| !store_ordinals.insert(value))
                                || partition.is_some_and(|value| !partitions.insert(value));
                            if duplicate {
                                diagnostics.push(diagnostic(
                                    "SQLSERVER_INDEX_COLUMNS",
                                    &path,
                                    "Duplicate index column ID or positive ordering ordinal",
                                    "error",
                                ));
                                valid = false;
                            }
                        }
                        let type_id = integer(field(index, "type")).unwrap_or(u64::MAX);
                        let expected = match type_id {
                            0 => Some("HEAP"),
                            1 => Some("CLUSTERED"),
                            2 => Some("NONCLUSTERED"),
                            3 => Some("XML"),
                            4 => Some("SPATIAL"),
                            5 => Some("CLUSTERED COLUMNSTORE"),
                            6 => Some("NONCLUSTERED COLUMNSTORE"),
                            7 => Some("NONCLUSTERED HASH"),
                            _ => None,
                        };
                        if expected != utf8(field(index, "type_desc")).as_deref() {
                            diagnostics.push(diagnostic(
                                "SQLSERVER_INDEX_UNKNOWN",
                                &path,
                                "Unknown index type identity retained without interpretation",
                                "warning",
                            ));
                        }
                        if matches!(type_id, 3 | 4 | 7) {
                            diagnostics.push(diagnostic("SQLSERVER_INDEX_DETAILS_UNAVAILABLE", &path, "Specialized XML, spatial or hash index details are outside this catalog capture", "warning"));
                        }
                        if matches!(
                            field(index, "has_filter"),
                            Some(NativeJsonNode::Boolean(true))
                        ) && matches!(
                            field(index, "filter_definition"),
                            Some(NativeJsonNode::Null)
                        ) {
                            diagnostics.push(diagnostic("SQLSERVER_INDEX_FILTER_UNAVAILABLE", &path, "Filtered index predicate unavailable; do not infer an unfiltered index", "warning"));
                        }
                    }
                }
            }
        }
        Ok(SqlServerInspection {
            valid,
            complete: false,
            diagnostics,
        })
    }

    pub fn column_metadata(
        &self,
        ctx: &mut CoreContext<'_>,
    ) -> Result<Vec<SqlServerColumnMetadata>, EngineError> {
        let tables = array(field(self.root.root(), "tables"))
            .ok_or_else(|| err("SQLSERVER_CAPTURE", "Expected captured tables"))?;
        let mut out = Vec::new();
        let count = tables
            .iter()
            .map(|table| array(field(table, "columns")).map_or(0, <[NativeJsonNode]>::len))
            .sum();
        ctx.charge_work(count, Utf16::default())?;
        for (ti, table) in tables.iter().enumerate() {
            let schema = text(field(table, "schema"))
                .cloned()
                .ok_or_else(|| err("SQLSERVER_CAPTURE", "Missing table schema"))?;
            let table_name = text(field(table, "name"))
                .cloned()
                .ok_or_else(|| err("SQLSERVER_CAPTURE", "Missing table name"))?;
            for (ci, column) in array(field(table, "columns"))
                .unwrap_or_default()
                .iter()
                .enumerate()
            {
                if !matches!(column, NativeJsonNode::Object(_)) {
                    return Err(err("SQLSERVER_CAPTURE", "Expected column object"));
                }
                let name = text(field(column, "name"))
                    .cloned()
                    .ok_or_else(|| err("SQLSERVER_CAPTURE", "Missing column name"))?;
                ctx.charge_work(name.len().saturating_add(8), Utf16::default())?;
                let path = Utf16::from(format!("/tables/{ti}/columns/{ci}"));
                let element_id = path
                    .to_utf8()
                    .map_err(|_| err("SQLSERVER_CAPTURE", "Invalid column path"))?;
                let mut element = vec![
                    (key("id"), Value::string_utf8(element_id)),
                    (key("name"), string(&name)),
                    (key("extensions"), Value::Object(Vec::new())),
                ];
                if let Some(description) = text(field(column, "description")) {
                    element.insert(2, (key("description"), string(description)));
                }
                let system_id = numeric_id(field(column, "system_type_id")).unwrap_or_default();
                let base = utf8(field(column, "base_type_name")).unwrap_or_default();
                let assembly = match field(column, "is_assembly_type") {
                    Some(NativeJsonNode::Boolean(value)) => Some(*value),
                    _ => None,
                };
                if let Some(family) = scalar_type(&system_id, &base, assembly) {
                    element.insert(
                        element.len() - 1,
                        (key("scalarType"), Value::string_utf8(family)),
                    );
                }
                let native_column = self
                    .root
                    .subtree_clone(&Utf16::from(format!("/tables/{ti}/columns/{ci}")), ctx)?
                    .tagged_value_preserving_extras(ctx)?;
                out.push(SqlServerColumnMetadata {
                    path,
                    schema: schema.clone(),
                    table: table_name.clone(),
                    element: Value::Object(element),
                    native_column,
                });
            }
        }
        Ok(out)
    }

    pub fn constraint_metadata(
        &self,
        ctx: &mut CoreContext<'_>,
    ) -> Result<SqlServerConstraintMetadata, EngineError> {
        let tables = array(field(self.root.root(), "tables"))
            .ok_or_else(|| err("SQLSERVER_CAPTURE", "Expected captured tables"))?;
        ctx.charge_work(tables.len(), Utf16::default())?;
        let mut output = Vec::with_capacity(tables.len());
        for (index, table) in tables.iter().enumerate() {
            let schema = text(field(table, "schema"))
                .cloned()
                .ok_or_else(|| err("SQLSERVER_CAPTURE", "Missing table schema"))?;
            let name = text(field(table, "name"))
                .cloned()
                .ok_or_else(|| err("SQLSERVER_CAPTURE", "Missing table name"))?;
            let mut fields = vec![
                (key("path"), Value::string_utf8(format!("/tables/{index}"))),
                (
                    key("table"),
                    obj(vec![("schema", string(&schema)), ("name", string(&name))]),
                ),
                (
                    key("available"),
                    obj(vec![
                        ("keys", Value::Bool(array(field(table, "keys")).is_some())),
                        (
                            "foreign_keys",
                            Value::Bool(array(field(table, "foreign_keys")).is_some()),
                        ),
                        (
                            "checks",
                            Value::Bool(array(field(table, "checks")).is_some()),
                        ),
                    ]),
                ),
            ];
            for section in ["keys", "foreign_keys", "checks"] {
                let value = match array(field(table, section)) {
                    Some(rows) => {
                        let mut values = Vec::with_capacity(rows.len());
                        for row in rows {
                            values.push(
                                self.root
                                    .subtree_clone(
                                        &Utf16::from(format!(
                                            "/tables/{index}/{section}/{}",
                                            values.len()
                                        )),
                                        ctx,
                                    )?
                                    .tagged_value_preserving_extras(ctx)?,
                            );
                        }
                        Value::Array(values)
                    }
                    None => Value::Array(Vec::new()),
                };
                fields.push((key(section), value));
            }
            output.push(Value::Object(fields));
        }
        Ok(SqlServerConstraintMetadata {
            complete: false,
            tables: output,
        })
    }

    pub fn index_metadata(
        &self,
        ctx: &mut CoreContext<'_>,
    ) -> Result<SqlServerIndexMetadata, EngineError> {
        let tables = array(field(self.root.root(), "tables"))
            .ok_or_else(|| err("SQLSERVER_CAPTURE", "Expected captured tables"))?;
        ctx.charge_work(tables.len(), Utf16::default())?;
        let mut output = Vec::with_capacity(tables.len());
        for (index, table) in tables.iter().enumerate() {
            let schema = text(field(table, "schema"))
                .cloned()
                .ok_or_else(|| err("SQLSERVER_CAPTURE", "Missing table schema"))?;
            let name = text(field(table, "name"))
                .cloned()
                .ok_or_else(|| err("SQLSERVER_CAPTURE", "Missing table name"))?;
            let available = array(field(table, "indexes")).is_some();
            let indexes = match array(field(table, "indexes")) {
                Some(rows) => {
                    let mut values = Vec::with_capacity(rows.len());
                    for row in rows {
                        values.push(
                            self.root
                                .subtree_clone(
                                    &Utf16::from(format!(
                                        "/tables/{index}/indexes/{}",
                                        values.len()
                                    )),
                                    ctx,
                                )?
                                .tagged_value_preserving_extras(ctx)?,
                        );
                    }
                    Value::Array(values)
                }
                None => Value::Array(Vec::new()),
            };
            output.push(obj(vec![
                ("path", Value::string_utf8(format!("/tables/{index}"))),
                (
                    "table",
                    obj(vec![("schema", string(&schema)), ("name", string(&name))]),
                ),
                ("available", Value::Bool(available)),
                ("indexes", indexes),
            ]));
        }
        Ok(SqlServerIndexMetadata {
            complete: false,
            tables: output,
        })
    }

    pub fn propose_edit(
        &self,
        path: &Utf16,
        replacement_json: &Utf16,
        ctx: &mut CoreContext<'_>,
    ) -> Result<Self, EngineError> {
        let replacement = NativeJsonTree::parse_json(replacement_json.units(), ctx)?;
        let candidate = self.root.replace_node(path, &replacement, ctx)?;
        let state_text = Utf16::from("\"modified\"");
        let state = NativeJsonTree::parse_json(state_text.units(), ctx)?;
        let candidate = if field(candidate.root(), "state").is_some() {
            candidate.replace_node(&Utf16::from("/state"), &state, ctx)?
        } else {
            candidate
        };
        let output = Self { root: candidate };
        validate_capture_schema(&output.root, ctx)?;
        if !output.inspect(ctx)?.valid {
            return Err(err(
                "SQLSERVER_CAPTURE_STRUCTURE",
                "SQL Server catalog observations are inconsistent",
            ));
        }
        let _ = output.column_metadata(ctx)?;
        Ok(output)
    }
}

fn diagnostic(code: &str, path: &str, message: &str, severity: &str) -> Value {
    obj(vec![
        ("code", Value::string_utf8(code)),
        ("path", Value::string_utf8(path)),
        ("message", Value::string_utf8(message)),
        ("severity", Value::string_utf8(severity)),
    ])
}

fn diagnostic_utf16(code: &str, path: &Utf16, message: &str, severity: &str) -> Value {
    Value::Object(vec![
        (key("code"), Value::string_utf8(code)),
        (key("path"), Value::String(path.clone())),
        (key("message"), Value::string_utf8(message)),
        (key("severity"), Value::string_utf8(severity)),
    ])
}

pub fn payload_value(
    catalog: &SqlServerCatalog,
    ctx: &mut CoreContext<'_>,
) -> Result<Value, EngineError> {
    Ok(obj(vec![
        ("profile", Value::string_utf8(PROFILE)),
        ("root", catalog.root.tagged_value_preserving_extras(ctx)?),
    ]))
}

pub fn document_value(
    id: &Utf16,
    catalog: &SqlServerCatalog,
    ctx: &mut CoreContext<'_>,
) -> Result<Value, EngineError> {
    let payload = payload_value(catalog, ctx)?;
    let columns = catalog.column_metadata(ctx)?;
    let module_elements = columns.into_iter().map(|column| column.element).collect();
    Ok(obj(vec![
        ("umf", Value::string_utf8("0.10.0")),
        ("id", string(id)),
        (
            "vocabularies",
            obj(vec![(
                EXTENSION,
                obj(vec![("version", Value::string_utf8("0.1.0"))]),
            )]),
        ),
        ("extensions", obj(vec![(EXTENSION, payload)])),
        (
            "modules",
            Value::Array(vec![obj(vec![
                ("id", Value::string_utf8("sqlserver.columns")),
                ("namespace", Value::string_utf8("")),
                ("elements", Value::Array(module_elements)),
            ])]),
        ),
    ]))
}

pub fn column_metadata_value(
    catalog: &SqlServerCatalog,
    ctx: &mut CoreContext<'_>,
) -> Result<Value, EngineError> {
    let columns = catalog.column_metadata(ctx)?;
    let mut output = Vec::with_capacity(columns.len());
    for column in columns {
        output.push(obj(vec![
            ("path", string(&column.path)),
            (
                "table",
                obj(vec![
                    ("schema", string(&column.schema)),
                    ("name", string(&column.table)),
                ]),
            ),
            ("element", column.element),
            ("nativeColumn", column.native_column),
        ]));
    }
    Ok(Value::Array(output))
}

pub fn constraint_metadata_value(
    catalog: &SqlServerCatalog,
    ctx: &mut CoreContext<'_>,
) -> Result<Value, EngineError> {
    let metadata = catalog.constraint_metadata(ctx)?;
    Ok(obj(vec![
        ("complete", Value::Bool(metadata.complete)),
        ("tables", Value::Array(metadata.tables)),
    ]))
}

pub fn index_metadata_value(
    catalog: &SqlServerCatalog,
    ctx: &mut CoreContext<'_>,
) -> Result<Value, EngineError> {
    let metadata = catalog.index_metadata(ctx)?;
    Ok(obj(vec![
        ("complete", Value::Bool(metadata.complete)),
        ("tables", Value::Array(metadata.tables)),
    ]))
}

pub fn catalog_from_document(
    document: &Value,
    ctx: &mut CoreContext<'_>,
) -> Result<SqlServerCatalog, EngineError> {
    if value_string(value_field(document, "umf")) != Some(&Utf16::from("0.10.0"))
        || value_string(value_field(document, "id")).is_none()
        || value_field(document, "vocabularies")
            .and_then(|v| value_field(v, EXTENSION))
            .and_then(|v| value_string(value_field(v, "version")))
            != Some(&Utf16::from("0.1.0"))
    {
        return Err(err(
            "SQLSERVER_DOCUMENT",
            "Expected a valid UMF SQL Server document",
        ));
    }
    let payload = value_field(document, "extensions")
        .and_then(|v| value_field(v, EXTENSION))
        .ok_or_else(|| err("SQLSERVER_CAPTURE", "Missing SQL Server capture"))?;
    if !matches!(payload, Value::Object(_)) {
        return Err(err(
            "SQLSERVER_CAPTURE",
            "Expected SQL Server payload object",
        ));
    }
    if value_string(value_field(payload, "profile"))
        .and_then(|v| v.to_utf8().ok())
        .as_deref()
        != Some(PROFILE)
    {
        return Err(err(
            "SQLSERVER_CAPTURE",
            "Unsupported SQL Server payload profile",
        ));
    }
    let root_value = value_field(payload, "root")
        .ok_or_else(|| err("SQLSERVER_CAPTURE", "Missing native catalog root"))?;
    let catalog = SqlServerCatalog {
        root: NativeJsonTree::from_tagged_value(root_value, ctx)?,
    };
    validate_capture_schema(&catalog.root, ctx)?;
    if !catalog.inspect(ctx)?.valid {
        return Err(err(
            "SQLSERVER_CAPTURE_STRUCTURE",
            "Invalid SQL Server catalog",
        ));
    }
    let module = match value_field(document, "modules") {
        Some(Value::Array(modules)) => modules.iter().find(|module| {
            value_string(value_field(module, "id")) == Some(&Utf16::from("sqlserver.columns"))
        }),
        _ => None,
    }
    .ok_or_else(|| err("SQLSERVER_METADATA", "Missing SQL Server columns module"))?;
    if value_string(value_field(module, "namespace")) != Some(&Utf16::default()) {
        return Err(err(
            "SQLSERVER_METADATA",
            "SQL Server columns namespace disagrees with capture",
        ));
    }
    let elements = match value_field(module, "elements") {
        Some(Value::Array(elements)) => elements,
        _ => {
            return Err(err(
                "SQLSERVER_METADATA",
                "Missing SQL Server column elements",
            ));
        }
    };
    let derived = catalog.column_metadata(ctx)?;
    if elements.len() != derived.len() {
        return Err(err(
            "SQLSERVER_METADATA",
            "Native columns and core metadata disagree",
        ));
    }
    for (element, column) in elements.iter().zip(derived.iter()) {
        for name in ["id", "name", "description", "scalarType"] {
            if value_field(element, name) != value_field(&column.element, name) {
                return Err(err(
                    "SQLSERVER_METADATA",
                    "Native columns and core metadata disagree",
                ));
            }
        }
    }
    Ok(catalog)
}

pub fn export_document(document: &Value, ctx: &mut CoreContext<'_>) -> Result<Utf16, EngineError> {
    let catalog = catalog_from_document(document, ctx)?;
    let payload = value_field(document, "extensions")
        .and_then(|v| value_field(v, EXTENSION))
        .ok_or_else(|| err("SQLSERVER_CAPTURE", "Missing SQL Server capture"))?;
    if !matches!(payload, Value::Object(fields) if fields.iter().all(|(name,_)| ["profile","root"].iter().any(|known| name == &key(known))))
        || catalog.root.has_representation_extras()
    {
        return Err(err(
            "SQLSERVER_ENCODING",
            "Unknown source encoding content blocks native export",
        ));
    }
    catalog.export(ctx)
}

pub fn inspect_document(document: &Value, ctx: &mut CoreContext<'_>) -> Result<Value, EngineError> {
    let catalog = catalog_from_document(document, ctx)?;
    let mut report = catalog.inspect(ctx)?;
    let payload = value_field(document, "extensions")
        .and_then(|v| value_field(v, EXTENSION))
        .ok_or_else(|| err("SQLSERVER_CAPTURE", "Missing SQL Server capture"))?;
    if matches!(payload, Value::Object(fields) if fields.iter().any(|(name,_)| !["profile","root"].iter().any(|known| name == &key(known))))
    {
        report.diagnostics.push(diagnostic(
            "SQLSERVER_ENCODING",
            "/",
            "Unknown encoding content must remain in UMF and blocks native export",
            "warning",
        ));
    }
    Ok(obj(vec![
        ("valid", Value::Bool(report.valid)),
        ("complete", Value::Bool(report.complete)),
        ("diagnostics", Value::Array(report.diagnostics)),
    ]))
}

/// Run the current SQL Server payload-only semantic inspector used by the
/// extension registry, preserving its diagnostics and avoiding document-level
/// structural Registry validation.
pub fn inspect_payload(payload: &Value, ctx: &mut CoreContext<'_>) -> Result<Value, EngineError> {
    let Value::Object(fields) = payload else {
        return Err(err(
            "SQLSERVER_CAPTURE",
            "Expected SQL Server payload object",
        ));
    };
    let mut diagnostics = vec![diagnostic(
        "SQLSERVER_CAPTURE_SCOPE",
        "",
        "Permission-limited table/column observations; server correspondence and complete native semantics are unverified",
        "warning",
    )];
    for (name, _) in fields {
        ctx.charge_work(name.len().saturating_add(1), Utf16::default())?;
        if name != &key("profile") && name != &key("root") {
            ctx.charge_text(name.len().saturating_add(1), Utf16::default())?;
            let mut path = vec![b'/' as u16];
            path.extend_from_slice(name.units());
            diagnostics.push(diagnostic_utf16(
                "SQLSERVER_ENCODING",
                &Utf16::new(path),
                "Unknown encoding content must remain in UMF and blocks native export",
                "warning",
            ));
        }
    }
    if value_string(value_field(payload, "profile"))
        .and_then(|v| v.to_utf8().ok())
        .as_deref()
        != Some(PROFILE)
    {
        diagnostics.push(diagnostic(
            "SQLSERVER_CAPTURE_STRUCTURE",
            "/profile",
            "Unsupported SQL Server capture profile",
            "error",
        ));
        return Ok(Value::Array(diagnostics));
    }
    let Some(root_value) = value_field(payload, "root") else {
        diagnostics.push(diagnostic(
            "SQLSERVER_CAPTURE_STRUCTURE",
            "/root",
            "Missing SQL Server catalog root",
            "error",
        ));
        return Ok(Value::Array(diagnostics));
    };
    let root = NativeJsonTree::from_tagged_value(root_value, ctx)?;
    if let Err(error) = validate_capture_schema(&root, ctx) {
        diagnostics.push(diagnostic(
            "SQLSERVER_CAPTURE_STRUCTURE",
            "/root",
            &error.message.to_utf8().unwrap_or_default(),
            "error",
        ));
        return Ok(Value::Array(diagnostics));
    }
    inspect_tagged_encoding(root_value, &Utf16::from("/root"), &mut diagnostics, ctx)?;
    let inspection = SqlServerCatalog { root }.inspect(ctx)?;
    diagnostics.extend(
        inspection
            .diagnostics
            .into_iter()
            .filter(|item| {
                let code = value_string(value_field(item, "code"));
                code != Some(&key("SQLSERVER_ENCODING"))
                    && code != Some(&key("SQLSERVER_CAPTURE_SCOPE"))
            }),
    );
    Ok(Value::Array(diagnostics))
}

fn inspect_tagged_encoding(
    node: &Value,
    path: &Utf16,
    diagnostics: &mut Vec<Value>,
    ctx: &mut CoreContext<'_>,
) -> Result<(), EngineError> {
    let Value::Object(fields) = node else {
        return Ok(());
    };
    let kind = value_string(value_field(node, "kind")).and_then(|value| value.to_utf8().ok());
    let allowed: &[&str] = match kind.as_deref() {
        Some("object") => &["kind", "members"],
        Some("array") => &["kind", "items"],
        Some("null") => &["kind"],
        _ => &["kind", "value"],
    };
    let mut has_unknown_tagged_field = false;
    for (name, _) in fields {
        ctx.charge_work(name.len().saturating_add(1), Utf16::default())?;
        has_unknown_tagged_field |= !allowed.iter().any(|candidate| name == &key(candidate));
    }
    if has_unknown_tagged_field {
        ctx.charge_text(path.len(), Utf16::default())?;
        diagnostics.push(diagnostic_utf16(
            "SQLSERVER_ENCODING",
            path,
            "Unknown encoding content must remain in UMF and blocks native export",
            "warning",
        ));
    }
    match kind.as_deref() {
        Some("object") => {
            if let Some(Value::Object(members)) = value_field(node, "members") {
                for (name, value) in members {
                    ctx.charge_text(
                        path.len().saturating_add(name.len()).saturating_add(1),
                        Utf16::default(),
                    )?;
                    let mut child_path = path.units().to_vec();
                    child_path.push(b'/' as u16);
                    child_path.extend_from_slice(name.units());
                    inspect_tagged_encoding(value, &Utf16::new(child_path), diagnostics, ctx)?;
                }
            }
        }
        Some("array") => {
            if let Some(Value::Array(items)) = value_field(node, "items") {
                ctx.charge_work(items.len(), path.clone())?;
                for (index, value) in items.iter().enumerate() {
                    let index_text = index.to_string();
                    ctx.charge_text(
                        path.len().saturating_add(index_text.len()).saturating_add(1),
                        Utf16::default(),
                    )?;
                    let mut child_path = path.units().to_vec();
                    child_path.push(b'/' as u16);
                    child_path.extend(index_text.encode_utf16());
                    inspect_tagged_encoding(value, &Utf16::new(child_path), diagnostics, ctx)?;
                }
            }
        }
        _ => {}
    }
    Ok(())
}


/// Copy and edit a UMF document without dropping unrelated metadata. Existing
/// `sqlserver.columns` elements are refreshed in place; attached extension or
/// unknown element metadata blocks removal/reassociation.
pub fn propose_document_edit(
    document: &Value,
    path: &Utf16,
    replacement_json: &Utf16,
    ctx: &mut CoreContext<'_>,
) -> Result<Value, EngineError> {
    let mut output = crate::copy_json(document, ctx)?;
    if value_string(value_field(&output, "umf")) != Some(&Utf16::from("0.10.0"))
        || value_string(value_field(&output, "id")).is_none()
    {
        return Err(err(
            "SQLSERVER_DOCUMENT",
            "Expected a UMF 0.10.0 document with an id",
        ));
    }
    let payload = value_field(&output, "extensions")
        .and_then(|extensions| value_field(extensions, EXTENSION))
        .ok_or_else(|| err("SQLSERVER_CAPTURE", "Missing SQL Server capture"))?;
    if value_string(value_field(payload, "profile"))
        .and_then(|v| v.to_utf8().ok())
        .as_deref()
        != Some(PROFILE)
    {
        return Err(err(
            "SQLSERVER_CAPTURE",
            "Unsupported SQL Server capture profile",
        ));
    }
    if value_field(&output, "vocabularies")
        .and_then(|v| value_field(v, EXTENSION))
        .and_then(|v| value_string(value_field(v, "version")))
        != Some(&Utf16::from("0.1.0"))
    {
        return Err(err(
            "SQLSERVER_CAPTURE",
            "Expected SQL Server extension version 0.1.0",
        ));
    }
    let root_value = value_field(payload, "root")
        .ok_or_else(|| err("SQLSERVER_CAPTURE", "Missing native catalog root"))?;
    let root = NativeJsonTree::from_tagged_value(root_value, ctx)?;
    let before = SqlServerCatalog { root };
    validate_capture_schema(&before.root, ctx)?;
    let payload_fields = match payload {
        Value::Object(fields) => fields,
        _ => {
            return Err(err(
                "SQLSERVER_CAPTURE",
                "Expected SQL Server payload object",
            ));
        }
    };
    if payload_fields
        .iter()
        .any(|(name, _)| !["profile", "root"].iter().any(|known| name == &key(known)))
        || before.root.has_representation_extras()
    {
        return Err(err(
            "SQLSERVER_ENCODING",
            "Unknown SQL Server source encoding cannot be discarded",
        ));
    }
    if !before.inspect(ctx)?.valid {
        return Err(err(
            "SQLSERVER_CAPTURE_STRUCTURE",
            "Invalid SQL Server catalog",
        ));
    }
    let existing_module = match value_field(&output, "modules") {
        Some(Value::Array(modules)) => modules.iter().find(|module| {
            value_string(value_field(module, "id")) == Some(&Utf16::from("sqlserver.columns"))
        }),
        _ => None,
    }
    .ok_or_else(|| err("SQLSERVER_METADATA", "Missing SQL Server columns module"))?;
    if value_string(value_field(existing_module, "namespace")) != Some(&Utf16::default()) {
        return Err(err(
            "SQLSERVER_METADATA",
            "SQL Server columns namespace disagrees with the catalog",
        ));
    }
    let old_elements = match value_field(existing_module, "elements") {
        Some(value @ Value::Array(_)) => match crate::copy_json(value, ctx)? {
            Value::Array(elements) => elements,
            _ => unreachable!(),
        },
        _ => {
            return Err(err(
                "SQLSERVER_METADATA",
                "Missing SQL Server column elements",
            ));
        }
    };
    let expected_before = before.column_metadata(ctx)?;
    if old_elements.len() != expected_before.len() {
        return Err(err(
            "SQLSERVER_METADATA",
            "Native columns and core metadata disagree",
        ));
    }
    for (old, derived) in old_elements.iter().zip(&expected_before) {
        if value_string(value_field(old, "id")) != value_string(value_field(&derived.element, "id"))
            || value_string(value_field(old, "name"))
                != value_string(value_field(&derived.element, "name"))
            || value_string(value_field(old, "description"))
                != value_string(value_field(&derived.element, "description"))
            || value_string(value_field(old, "scalarType"))
                != value_string(value_field(&derived.element, "scalarType"))
        {
            return Err(err(
                "SQLSERVER_METADATA",
                "Native columns and core metadata disagree",
            ));
        }
    }
    let candidate = before.propose_edit(path, replacement_json, ctx)?;
    let after = candidate.column_metadata(ctx)?;
    for old in &old_elements {
        let attached = match old {
            Value::Object(fields) => fields.iter().any(|(name, value)| {
                !["id", "name", "description", "scalarType", "extensions"]
                    .iter()
                    .any(|allowed| name == &key(allowed))
                    || name == &key("extensions")
                        && !matches!(value, Value::Object(extra) if extra.is_empty())
            }),
            _ => true,
        };
        if attached {
            let id = value_string(value_field(old, "id"));
            let next = after
                .iter()
                .find(|column| value_string(value_field(&column.element, "id")) == id);
            if next.is_none_or(|column| {
                value_string(value_field(old, "name"))
                    != value_string(value_field(&column.element, "name"))
            }) {
                return Err(err(
                    "SQLSERVER_METADATA",
                    "Attached metadata requires explicit reassociation",
                ));
            }
        }
    }
    let module = value_field_mut(&mut output, "modules")
        .and_then(|value| match value {
            Value::Array(modules) => modules.iter_mut().find(|module| {
                value_string(value_field(module, "id")) == Some(&Utf16::from("sqlserver.columns"))
            }),
            _ => None,
        })
        .ok_or_else(|| err("SQLSERVER_METADATA", "Missing SQL Server columns module"))?;
    let elements = match value_field_mut(module, "elements") {
        Some(Value::Array(elements)) => elements,
        _ => {
            return Err(err(
                "SQLSERVER_METADATA",
                "Missing SQL Server column elements",
            ));
        }
    };
    ctx.charge_work(after.len(), Utf16::default())?;
    let mut refreshed = Vec::with_capacity(after.len());
    for column in &after {
        let prior = old_elements.iter().find(|old| {
            value_string(value_field(old, "id")) == value_string(value_field(&column.element, "id"))
        });
        let mut element = match prior {
            Some(value) => crate::copy_json(value, ctx)?,
            None => crate::copy_json(&column.element, ctx)?,
        };
        if let Some(old) = prior {
            let prior_derived = expected_before
                .iter()
                .find(|known| {
                    value_string(value_field(&known.element, "id"))
                        == value_string(value_field(old, "id"))
                })
                .ok_or_else(|| err("SQLSERVER_METADATA", "Unknown attached SQL Server element"))?;
            let attached = match old {
                Value::Object(fields) => fields.iter().any(|(name, value)| {
                    !["id", "name", "description", "scalarType", "extensions"]
                        .iter()
                        .any(|allowed| name == &key(allowed))
                        || name == &key("extensions")
                            && !matches!(value, Value::Object(extra) if extra.is_empty())
                }),
                _ => true,
            };
            if attached
                && (value_string(value_field(old, "name"))
                    != value_string(value_field(&column.element, "name"))
                    || prior_derived.schema != column.schema
                    || prior_derived.table != column.table)
            {
                return Err(err(
                    "SQLSERVER_METADATA",
                    "Attached metadata requires explicit reassociation",
                ));
            }
            if let Value::Object(fields) = &mut element {
                fields.retain(|(name, _)| {
                    !["id", "name", "description", "scalarType"]
                        .iter()
                        .any(|field| name == &key(field))
                });
                for field_name in ["id", "name", "description", "scalarType"] {
                    if let Some(value) = value_field(&column.element, field_name) {
                        fields.push((key(field_name), crate::copy_json(value, ctx)?));
                    }
                }
            }
        }
        refreshed.push(element);
    }
    *elements = refreshed;
    let payload = value_field_mut(&mut output, "extensions")
        .and_then(|extensions| value_field_mut(extensions, EXTENSION))
        .ok_or_else(|| err("SQLSERVER_CAPTURE", "Missing SQL Server capture"))?;
    let tagged = candidate.root.tagged_value_preserving_extras(ctx)?;
    let root_value = value_field_mut(payload, "root")
        .ok_or_else(|| err("SQLSERVER_CAPTURE", "Missing native catalog root"))?;
    *root_value = tagged;
    Ok(output)
}

#[path = "sqlserver_facets.rs"]
mod facets;
pub use facets::{
    inspect_sqlserver_facet_constraints, inspect_sqlserver_facet_predicate,
    inspect_sqlserver_facet_type,
};

#[cfg(test)]
#[path = "sqlserver_adapter_test.rs"]
mod tests;

#[cfg(test)]
#[path = "sqlserver_facets_test.rs"]
mod facet_tests;
