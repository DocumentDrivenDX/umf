// SPDX-License-Identifier: MIT OR Apache-2.0
//! Rust-owned validation for the SQL Server relationship layout receipt.
use crate::{
    binding_index_projection::BindingIndexProjectionResources,
    binding_inspection::{inspect_binding, BindingInspectionResources},
    context::Context,
    ddd_json_schema_projection,
    error::EngineError,
    schema::{CompiledSchema, SchemaResources},
    serialization::{read_json_value, Format},
    value::{copy_json, Utf16, Value},
};
use std::collections::{HashMap, HashSet};

const SCHEMA: &str =
    include_str!("../../../spec/projections/sqlserver-relationship-layout.schema.json");
fn k(s: &str) -> Utf16 {
    Utf16::from(s)
}
fn get<'a>(v: &'a Value, name: &str) -> Option<&'a Value> {
    if let Value::Object(fields) = v {
        fields
            .iter()
            .find(|(key, _)| key == &k(name))
            .map(|(_, v)| v)
    } else {
        None
    }
}
fn get_utf16<'a>(v: &'a Value, name: &Utf16) -> Option<&'a Value> {
    if let Value::Object(fields) = v {
        fields
            .iter()
            .find(|(key, _)| key == name)
            .map(|(_, value)| value)
    } else {
        None
    }
}
fn arr(v: Option<&Value>) -> Option<&[Value]> {
    if let Some(Value::Array(xs)) = v {
        Some(xs)
    } else {
        None
    }
}
fn text(v: Option<&Value>) -> Option<&Utf16> {
    if let Some(Value::String(x)) = v {
        Some(x)
    } else {
        None
    }
}
fn utf8(v: Option<&Value>) -> Option<String> {
    text(v).and_then(|x| x.to_utf8().ok())
}
fn eq(v: Option<&Value>, x: &str) -> bool {
    utf8(v).as_deref() == Some(x)
}
fn s(x: &str) -> Value {
    Value::string_utf8(x)
}
fn obj(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(fields.into_iter().map(|(a, b)| (k(a), b)).collect())
}
fn err(code: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}
fn resolve_pointer<'a>(root: &'a Value, path: &Utf16) -> Option<&'a Value> {
    let units = path.units();
    let mut value = root;
    if units.is_empty() {
        return Some(value);
    }
    if units[0] != b'/' as u16 {
        return None;
    }
    for raw_segment in units[1..].split(|unit| *unit == b'/' as u16) {
        let mut segment = Vec::with_capacity(raw_segment.len());
        let mut i = 0;
        while i < raw_segment.len() {
            if raw_segment[i] == b'~' as u16 {
                match raw_segment.get(i + 1).copied() {
                    Some(unit) if unit == b'1' as u16 => segment.push(b'/' as u16),
                    Some(unit) if unit == b'0' as u16 => segment.push(b'~' as u16),
                    _ => return None,
                }
                i += 2;
            } else {
                segment.push(raw_segment[i]);
                i += 1;
            }
        }
        value = match value {
            Value::Object(fields) => fields
                .iter()
                .find(|(name, _)| name.units() == segment.as_slice())
                .map(|(_, value)| value)?,
            Value::Array(items) => {
                if segment.is_empty()
                    || segment
                        .iter()
                        .any(|unit| *unit < b'0' as u16 || *unit > b'9' as u16)
                {
                    return None;
                }
                let index = String::from_utf16(&segment).ok()?.parse::<usize>().ok()?;
                items.get(index)?
            }
            _ => return None,
        };
    }
    Some(value)
}

fn same_ref(a: &Value, b: &Value, names: &[&str]) -> bool {
    names.iter().all(|name| get(a, name) == get(b, name))
}
fn ref_id(v: &Value, names: &[&str]) -> String {
    names
        .iter()
        .map(|name| match get(v, name) {
            Some(Value::String(value)) => value
                .units()
                .iter()
                .map(|unit| format!("{unit:04x}"))
                .collect::<String>(),
            _ => "<missing>".to_owned(),
        })
        .collect::<Vec<_>>()
        .join("\u{1f}")
}
fn safe_identifier(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 128
        && (s.as_bytes()[0].is_ascii_alphabetic() || s.as_bytes()[0] == b'_')
        && s.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_')
}

fn add_layout_constraint(
    errors: &mut Vec<Value>,
    relations: &mut HashSet<String>,
    constraints: &mut HashSet<String>,
    table: &str,
    name: &str,
    path: &str,
    is_key: bool,
) {
    if !safe_identifier(name) {
        errors.push(obj(vec![
            ("code", s("SQLSERVER_LAYOUT_IDENTIFIER")),
            ("path", s(path)),
            (
                "message",
                s("Constraint name must be an untruncated portable SQL Server identifier"),
            ),
            ("severity", s("error")),
        ]));
    }
    let scope = format!(
        "{}.{}",
        table
            .split('.')
            .next()
            .unwrap_or_default()
            .to_ascii_lowercase(),
        name.to_ascii_lowercase()
    );
    if relations.contains(&scope) {
        errors.push(obj(vec![("code",s("SQLSERVER_LAYOUT_COLLISION")),("path",s(path)),("message",s("Constraint collides with a table or key-index name in this conservative schema naming profile")),("severity",s("error"))]));
    }
    if !constraints.insert(scope.clone()) {
        errors.push(obj(vec![
            ("code", s("SQLSERVER_LAYOUT_COLLISION")),
            ("path", s(path)),
            ("message", s("Constraint name repeats within one table")),
            ("severity", s("error")),
        ]));
    }
    if is_key && !relations.insert(scope) {
        errors.push(obj(vec![
            ("code", s("SQLSERVER_LAYOUT_COLLISION")),
            ("path", s(path)),
            ("message", s("Key index relation name collides in schema")),
            ("severity", s("error")),
        ]));
    }
}
fn type_same(a: &Value, b: &Value) -> bool {
    get(a, "sqlType") == get(b, "sqlType") && get(a, "collation") == get(b, "collation")
}
fn bounded_ascii_token(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 128
        && s.bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}

fn safe_table(s: &str) -> bool {
    let mut p = s.split('.');
    match (p.next(), p.next(), p.next()) {
        (Some(a), Some(b), None) => safe_identifier(a) && safe_identifier(b),
        _ => false,
    }
}
fn family(s: &str) -> Option<&'static str> {
    if s.trim() != s
        || s.chars()
            .any(|c| matches!(c, '\r' | '\n' | '\u{2028}' | '\u{2029}'))
    {
        return None;
    }
    if ["tinyint", "smallint", "int", "bigint"].contains(&s) {
        return Some("integer");
    }
    if s == "bit" {
        return Some("boolean");
    }
    if s == "date" {
        return Some("date");
    }
    for (prefix, max, kind) in [
        ("nvarchar(", 4000, "string"),
        ("varbinary(", 8000, "binary"),
    ] {
        if let Some(n) = s.strip_prefix(prefix).and_then(|x| x.strip_suffix(')')) {
            if n == "max" {
                return Some(kind);
            }
            if let Ok(n) = n.parse::<u16>() {
                if n > 0 && n <= max {
                    return Some(kind);
                }
            }
        }
    }
    for prefix in ["datetime2(", "datetimeoffset("] {
        if let Some(n) = s
            .strip_prefix(prefix)
            .and_then(|x| x.strip_suffix(')'))
            .and_then(|x| x.parse::<u8>().ok())
        {
            if n <= 7 {
                return Some("timestamp");
            }
        }
    }
    if let Some(x) = s.strip_prefix("decimal(").and_then(|x| x.strip_suffix(')')) {
        let mut p = x.split(',');
        if let (Some(a), Some(b), None) = (p.next(), p.next(), p.next()) {
            if let (Ok(a), Ok(b)) = (a.parse::<u8>(), b.parse::<u8>()) {
                if a > 0 && a <= 38 && b <= a {
                    return Some("decimal");
                }
            }
        }
    }
    None
}

/// Validate a source-retaining SQL Server relationship-layout receipt.
pub fn validate_sqlserver_relationship_layout(
    resources: &BindingIndexProjectionResources,
    binding_resources: &BindingInspectionResources,
    logical: &Value,
    binding: &Value,
    policy: &Value,
    loss_policy: &str,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    if loss_policy != "strict" && loss_policy != "report" {
        return Err(err("SQLSERVER_LAYOUT_POLICY", "Expected strict or report"));
    }
    let logical = copy_json(logical, ctx)?;
    let binding = copy_json(binding, ctx)?;
    let raw = copy_json(policy, ctx)?;
    let mut errors = Vec::<Value>::new();
    let mut residuals = Vec::<Value>::new();
    let add_error = |errors: &mut Vec<Value>, code: &str, path: &str, message: &str| {
        errors.push(obj(vec![
            ("code", s(&format!("SQLSERVER_LAYOUT_{code}"))),
            ("path", s(path)),
            ("message", s(message)),
            ("severity", s("error")),
        ]));
    };
    let add_residual = |out: &mut Vec<Value>,
                        source: &str,
                        path: &str,
                        reason: &str,
                        value: &Value,
                        ctx: &mut Context<'_>|
     -> Result<(), EngineError> {
        out.push(obj(vec![
            ("source", s(source)),
            ("path", s(path)),
            ("reason", s(reason)),
            ("value", copy_json(value, ctx)?),
        ]));
        Ok(())
    };
    let core_validation = resources.validate_document_report(&logical, ctx)?;
    if !core_validation.valid || utf8(get(&logical, "umf")).as_deref() != Some("0.10.0") {
        add_error(
            &mut errors,
            "MODEL",
            "/logical",
            "A valid core 0.10.0 relationship document is required",
        );
        return result(
            logical,
            binding,
            raw,
            loss_policy,
            errors,
            residuals,
            None,
            ctx,
        );
    }
    let binding_validation = inspect_binding(binding_resources, &binding, &logical, ctx)?;
    if !binding_validation.valid {
        let diagnostics = binding_validation
            .diagnostics
            .iter()
            .map(|diagnostic| {
                obj(vec![
                    ("code", Value::String(diagnostic.code.clone())),
                    ("path", Value::String(diagnostic.path.clone())),
                    ("message", Value::String(diagnostic.message.clone())),
                    (
                        "severity",
                        s(match diagnostic.severity {
                            crate::error::Severity::Error => "error",
                            crate::error::Severity::Warning => "warning",
                        }),
                    ),
                ])
            })
            .collect();
        return result(
            logical,
            binding,
            raw,
            loss_policy,
            diagnostics,
            residuals,
            None,
            ctx,
        );
    }
    let payload = get(
        get(&binding, "extensions").unwrap_or(&Value::Null),
        "umf.binding",
    )
    .unwrap_or(&Value::Null);
    if !eq(get(payload, "profile"), "umf-binding-2")
        || !eq(
            get(
                get(&binding, "vocabularies").unwrap_or(&Value::Null),
                "umf.binding",
            )
            .and_then(|v| get(v, "version")),
            "0.2.0",
        )
    {
        add_error(
            &mut errors,
            "BINDING",
            "/binding",
            "Explicit stable-ID binding migration is required",
        );
        return result(
            logical,
            binding,
            raw,
            loss_policy,
            errors,
            residuals,
            None,
            ctx,
        );
    }
    if binding_validation
        .diagnostics
        .iter()
        .any(|diagnostic| diagnostic.code == k("BINDING_UNKNOWN"))
    {
        add_error(
            &mut errors,
            "UNKNOWN",
            "/binding",
            "Unknown physical choices block safe layout interpretation",
        );
        return result(
            logical,
            binding,
            raw,
            loss_policy,
            errors,
            residuals,
            None,
            ctx,
        );
    }
    let schema_value = read_json_value(
        &SCHEMA.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        ctx,
    )?;
    let compiled = CompiledSchema::compile(&schema_value, &SchemaResources::default(), ctx)?;
    for d in compiled.validate(&raw, ctx)? {
        add_error(
            &mut errors,
            "STRUCTURE",
            &format!("/policy{}", d.instance_path.to_utf8().unwrap_or_default()),
            &d.message
                .to_utf8()
                .unwrap_or_else(|_| "Invalid layout policy".into()),
        );
    }
    if !eq(get(&raw, "profile"), "sqlserver-relationship-layout-1") {
        add_error(
            &mut errors,
            "STRUCTURE",
            "/policy/profile",
            "Invalid SQL Server relationship layout profile",
        );
    }
    if !eq(get(&raw, "targetVersion"), "2022") {
        add_error(
            &mut errors,
            "STRUCTURE",
            "/policy/targetVersion",
            "Expected SQL Server 2022 layout",
        );
    }
    if !errors.is_empty() {
        return result(
            logical,
            binding,
            raw,
            loss_policy,
            errors,
            residuals,
            None,
            ctx,
        );
    }
    let target = get(
        get(
            get(&binding, "extensions").unwrap_or(&Value::Null),
            "umf.binding",
        )
        .unwrap_or(&Value::Null),
        "target",
    );
    if !eq(target.and_then(|v| get(v, "system")), "sqlserver")
        || !eq(target.and_then(|v| get(v, "version")), "2022")
    {
        add_error(
            &mut errors,
            "TARGET",
            "/policy/targetVersion",
            "Exact binding SQL Server 2022 version required",
        );
    }
    if !errors.is_empty() {
        return result(
            logical,
            binding,
            raw,
            loss_policy,
            errors,
            residuals,
            None,
            ctx,
        );
    }
    let ddd = ddd_json_schema_projection::inspect_ddd_document(&logical, ctx)?;
    if !ddd.valid || ddd.diagnostics.iter().any(|d| d.code == k("DDD_UNKNOWN")) {
        add_error(
            &mut errors,
            "DDD",
            "/logical",
            "Invalid or uninterpreted DDD payload",
        );
    }
    if !errors.is_empty() {
        return result(
            logical,
            binding,
            raw,
            loss_policy,
            errors,
            residuals,
            None,
            ctx,
        );
    }
    let payload = get(
        get(&binding, "extensions").unwrap_or(&Value::Null),
        "umf.binding",
    )
    .unwrap_or(&Value::Null);
    if errors.iter().any(|d| eq(get(d, "severity"), "error")) {
        return result(
            logical,
            binding,
            raw,
            loss_policy,
            errors,
            residuals,
            None,
            ctx,
        );
    }

    let modules = arr(get(&logical, "modules")).unwrap_or(&[]);
    let elements = arr(get(payload, "elements")).unwrap_or(&[]);
    let bound_fields = arr(get(payload, "fields")).unwrap_or(&[]);
    let indexes = arr(get(payload, "indexes")).unwrap_or(&[]);
    let relationships = arr(get(payload, "relationships")).unwrap_or(&[]);
    let mut core_elements = HashMap::<String, &Value>::new();
    let mut core_refs = HashMap::<String, (Value, Value)>::new();
    let mut owners = HashMap::<String, String>::new();
    let mut rels = HashMap::<String, (&Value, String)>::new();
    for (mi, m) in modules.iter().enumerate() {
        let module = get(m, "id").cloned().unwrap_or(Value::Null);
        for e in arr(get(m, "elements")).unwrap_or(&[]) {
            let id = ref_id(
                &obj(vec![
                    ("module", module.clone()),
                    ("element", get(e, "id").cloned().unwrap_or(Value::Null)),
                ]),
                &["module", "element"],
            );
            core_elements.insert(id.clone(), e);
            core_refs.insert(
                id.clone(),
                (module.clone(), get(e, "id").cloned().unwrap_or(Value::Null)),
            );
            for member in arr(get(e, "members")).unwrap_or(&[]) {
                owners.insert(ref_id(member, &["module", "element"]), id.clone());
            }
        }
        for (ri, r) in arr(get(m, "relationships"))
            .unwrap_or(&[])
            .iter()
            .enumerate()
        {
            let id = ref_id(
                &obj(vec![
                    ("module", module.clone()),
                    ("id", get(r, "id").cloned().unwrap_or(Value::Null)),
                ]),
                &["module", "id"],
            );
            rels.insert(id, (r, format!("/modules/{mi}/relationships/{ri}")));
        }
    }
    let mut tables = HashMap::<String, String>::new();
    let mut table_owners = HashMap::<String, String>::new();
    let mut field_layouts = HashMap::<String, &Value>::new();
    let mut bound_layouts = HashMap::<String, &Value>::new();
    let mut physical = HashMap::<String, &Value>::new();
    let mut key_layouts = HashMap::<String, &Value>::new();
    let mut relation_names = HashSet::<String>::new();
    let mut constraint_names = HashSet::<String>::new();
    for (i, e) in elements.iter().enumerate() {
        let path = format!("/binding/extensions/umf.binding/elements/{i}");
        let id = ref_id(e, &["module", "element"]);
        let Some(table) = utf8(get(e, "table")) else {
            add_error(
                &mut errors,
                "TABLE",
                &path,
                "Explicit safe schema.table binding required",
            );
            continue;
        };
        if !safe_table(&table) {
            add_error(
                &mut errors,
                "TABLE",
                &path,
                "Explicit safe schema.table binding required",
            );
            continue;
        }
        if table_owners.contains_key(&table) {
            add_error(
                &mut errors,
                "COLLISION",
                &path,
                "Distinct elements cannot share one table",
            )
        }
        tables.insert(id.clone(), table.clone());
        table_owners.insert(table.clone(), id);
        if !relation_names.insert(table.to_ascii_lowercase()) {
            add_error(
                &mut errors,
                "COLLISION",
                &path,
                "Table names collide under the case-insensitive profile",
            )
        }
    }
    for (i, index) in indexes.iter().enumerate() {
        let name = utf8(get(index, "name")).unwrap_or_default();
        let path = format!("/binding/extensions/umf.binding/indexes/{i}");
        if !safe_identifier(&name) {
            add_error(
                &mut errors,
                "IDENTIFIER",
                &format!("{path}/name"),
                "Unsafe index identifier",
            )
        }
        let first = arr(get(index, "on")).and_then(|xs| xs.first());
        let reference = first.and_then(|x| {
            get(x, "field").or_else(|| get(get(x, "documentPath").unwrap_or(&Value::Null), "field"))
        });
        if let Some(reference) = reference {
            let owner = if get(reference, "field").is_none() {
                owners
                    .get(&ref_id(reference, &["module", "element"]))
                    .cloned()
                    .unwrap_or_default()
            } else {
                ref_id(reference, &["module", "element"])
            };
            if let Some(table) = tables.get(&owner) {
                if !relation_names.insert(format!(
                    "{}.{}",
                    table
                        .split('.')
                        .next()
                        .unwrap_or_default()
                        .to_ascii_lowercase(),
                    name.to_ascii_lowercase()
                )) {
                    add_error(
                        &mut errors,
                        "COLLISION",
                        &path,
                        "Index relation name collides in schema",
                    )
                }
            }
        }
    }
    // Every physical Field has one complete native layout and no duplicate physical slot.
    let field_specs = arr(get(&raw, "fieldLayouts")).unwrap_or(&[]);
    for (i, f) in field_specs.iter().enumerate() {
        let at = format!("/policy/fieldLayouts/{i}");
        let core = get(f, "coreField").unwrap_or(&Value::Null);
        let bound = get(f, "boundField").unwrap_or(&Value::Null);
        let identity = ref_id(core, &["module", "element"]);
        let bound_id = ref_id(bound, &["module", "element", "field"]);
        let core_field = core_elements.get(&identity).copied();
        let Some(core_field) = core_field else {
            add_error(
                &mut errors,
                "FIELD",
                &at,
                "Layout must target a declared core Field",
            );
            continue;
        };
        if !eq(get(core_field, "kind"), "field") {
            add_error(
                &mut errors,
                "FIELD",
                &at,
                "Layout target must be a core Field",
            )
        };
        let bound = bound_fields
            .iter()
            .find(|row| same_ref(row, bound, &["module", "element", "field"]));
        let Some(bound) = bound else {
            add_error(
                &mut errors,
                "BINDING_FIELD",
                &at,
                "Layout must match one exact bound Field",
            );
            continue;
        };
        if field_layouts.contains_key(&identity) || bound_layouts.contains_key(&bound_id) {
            add_error(
                &mut errors,
                "DUPLICATE",
                &at,
                "Core or bound Field mapping repeats",
            );
        }
        if !eq(get(core_field, "kind"), "field") || !owners.contains_key(&identity) {
            add_error(
                &mut errors,
                "FIELD",
                &format!("{at}/coreField"),
                "Exact member Field is required",
            );
        }
        if !same_ref(
            bound,
            get(f, "boundField").unwrap_or(&Value::Null),
            &["module", "element", "field"],
        ) || !eq(get(bound, "storage"), "column")
            || get(bound, "column") != get(f, "column")
        {
            add_error(
                &mut errors,
                "FIELD",
                &format!("{at}/boundField"),
                "Exact bound column is required",
            );
        }
        if get(bound, "field").is_none() && !same_ref(core, bound, &["module", "element"]) {
            add_error(
                &mut errors,
                "FIELD",
                &format!("{at}/boundField"),
                "Direct Field binding cannot substitute another ID",
            );
        }
        if get(bound, "field").is_some()
            && owners
                .get(&identity)
                .is_none_or(|owner| owner != &ref_id(bound, &["module", "element"]))
        {
            add_error(
                &mut errors,
                "FIELD",
                &format!("{at}/boundField"),
                "DDD field must belong to the exact owning Record",
            );
        }
        let owner = owners.get(&identity);
        if owner.is_none() || owner.map(|o| tables.contains_key(o)) != Some(true) {
            add_error(
                &mut errors,
                "OWNER",
                &at,
                "Core Field must belong to a bound table Record",
            )
        };
        let table = utf8(get(f, "table")).unwrap_or_default();
        if owner
            .and_then(|owner| tables.get(owner))
            .is_some_and(|t| t != &table)
        {
            add_error(
                &mut errors,
                "TABLE",
                &at,
                "Layout table differs from bound owner table",
            )
        };
        let column = utf8(get(f, "column")).unwrap_or_default();
        let sql = utf8(get(f, "sqlType")).unwrap_or_default();
        if !safe_identifier(&column) || family(&sql).is_none() {
            add_error(
                &mut errors,
                "SQL",
                &at,
                "Unsafe physical column or unsupported canonical SQL type",
            )
        };
        let nullable = matches!(get(f, "nullable"), Some(Value::Bool(true)));
        let collation = get(f, "collation");
        if (family(&sql) == Some("string") && !eq(collation, "Latin1_General_100_BIN2"))
            || (family(&sql) != Some("string") && !matches!(collation, Some(Value::Null)))
        {
            add_error(&mut errors,"COLLATION",&at,"Text uses explicit BIN2 comparison with trailing-space residuals; nontext must have null collation");
        }
        let core_type = utf8(get(core_field, "scalarType"));
        let cardinality = utf8(get(core_field, "cardinality"));
        let nullability = utf8(get(core_field, "nullability"));
        if core_type.as_deref() != family(&sql)
            || cardinality.as_deref() != Some("one")
            || !matches!(nullability.as_deref(), Some("required" | "absent-allowed"))
        {
            add_error(
                &mut errors,
                "TYPE",
                &at,
                "Field scalar family, cardinality and availability must be explicit and compatible",
            );
        }
        if nullable != (nullability.as_deref() == Some("absent-allowed")) {
            add_error(
                &mut errors,
                "NULLABILITY",
                &at,
                "Column NULL carrier differs from the authored Field availability",
            );
        }
        if let Some(field_name) = text(get(bound, "field")) {
            let definition = core_elements
                .get(&ref_id(bound, &["module", "element"]))
                .and_then(|e| get(get(e, "extensions").unwrap_or(&Value::Null), "umf.ddd"));
            let ddd_field = definition
                .and_then(|d| get_utf16(get(d, "fields").unwrap_or(&Value::Null), field_name));
            let ddd_type = ddd_field
                .and_then(|d| get(d, "type"))
                .and_then(|t| utf8(get(t, "name")));
            let ddd_cardinality = ddd_field.and_then(|d| utf8(get(d, "cardinality")));
            let expected = match family(&sql) {
                Some("binary") => "bytes",
                Some("timestamp") => "date-time",
                Some(x) => x,
                _ => "",
            };
            if ddd_field.is_none()
                || !eq(
                    ddd_field.and_then(|d| get(get(d, "type").unwrap_or(&Value::Null), "kind")),
                    "scalar",
                )
                || ddd_type.as_deref() != Some(expected)
                || !matches!(ddd_cardinality.as_deref(), Some("one" | "optional"))
                || nullable != (ddd_cardinality.as_deref() == Some("optional"))
            {
                add_error(
                    &mut errors,
                    "DDD_FIELD",
                    &at,
                    "Explicit core-to-DDD map has incompatible scalar or availability meaning",
                );
            }
        }
        let physical_id = format!(
            "{}:{}",
            table.to_ascii_lowercase(),
            column.to_ascii_lowercase()
        );
        if physical.insert(physical_id, bound).is_some() {
            add_error(
                &mut errors,
                "COLLISION",
                &at,
                "Physical columns cannot overlap under case-insensitive comparison",
            )
        };
        field_layouts.insert(identity.clone(), f);
        bound_layouts.insert(bound_id, f);
        add_residual(&mut residuals,"policy",&format!("/fieldLayouts/{i}"),"Declared SQL type, NULL carrier and comparator require separate native/domain enforcement evidence",f,ctx)?;
    }
    for (i, bound) in bound_fields.iter().enumerate() {
        if eq(get(bound, "storage"), "column")
            && !bound_layouts.contains_key(&ref_id(bound, &["module", "element", "field"]))
        {
            add_error(
                &mut errors,
                "MISSING",
                &format!("/policy/fieldLayouts"),
                "Every bound table Field requires a layout",
            )
        }
    }
    let key_specs = arr(get(&raw, "keyLayouts")).unwrap_or(&[]);
    for (i, key) in key_specs.iter().enumerate() {
        let at = format!("/policy/keyLayouts/{i}");
        let record = get(key, "record").unwrap_or(&Value::Null);
        let identity = ref_id(record, &["module", "element"]);
        let record_value = core_elements.get(&identity).copied();
        if record_value.is_none() {
            add_error(
                &mut errors,
                "KEY",
                &at,
                "Key layout must target a declared Record",
            )
        };
        let kid = ref_id(
            &obj(vec![
                (
                    "module",
                    get(record, "module").cloned().unwrap_or(Value::Null),
                ),
                (
                    "element",
                    get(record, "element").cloned().unwrap_or(Value::Null),
                ),
                ("key", get(key, "key").cloned().unwrap_or(Value::Null)),
            ]),
            &["module", "element", "key"],
        );
        let name = utf8(get(key, "constraint")).unwrap_or_default();
        if !safe_identifier(&name) {
            add_error(
                &mut errors,
                "IDENTIFIER",
                &format!("{at}/constraint"),
                "Constraint name must be an untruncated portable SQL Server identifier",
            )
        };
        if tables
            .get(&identity)
            .is_some_and(|table| table != &utf8(get(key, "table")).unwrap_or_default())
        {
            add_error(
                &mut errors,
                "TABLE",
                &format!("{at}/table"),
                "Key table must equal the Record binding",
            );
        }
        if elements
            .iter()
            .find(|e| same_ref(e, record, &["module", "element"]))
            .is_some_and(|e| !matches!(get(e, "partition"), None | Some(Value::Null)))
        {
            add_error(
                &mut errors,
                "PARTITION",
                &at,
                "Partitioned Key eligibility requires a separate complete partition policy",
            );
        }
        add_layout_constraint(
            &mut errors,
            &mut relation_names,
            &mut constraint_names,
            &utf8(get(key, "table")).unwrap_or_default(),
            &name,
            &format!("{at}/constraint"),
            true,
        );
        let components = arr(get(key, "components")).unwrap_or(&[]);
        if components.is_empty() {
            add_error(
                &mut errors,
                "COMPONENTS",
                &at,
                "Exactly one ordered component per authored Key field is required",
            );
        }
        if let Some(record_value) = record_value {
            let authored = arr(get(record_value, "keys"))
                .unwrap_or(&[])
                .iter()
                .find(|authored| get(authored, "id") == get(key, "key"));
            if let Some(authored) = authored {
                let auth_fields = arr(get(authored, "fields")).unwrap_or(&[]);
                if components.len() != auth_fields.len() {
                    add_error(
                        &mut errors,
                        "COMPONENTS",
                        &format!("{at}/components"),
                        "Exactly one ordered component per authored Key field is required",
                    )
                }
                for (ci, c) in components.iter().enumerate() {
                    let cp = format!("{at}/components/{ci}");
                    let key_field = get(c, "keyField").unwrap_or(&Value::Null);
                    if auth_fields
                        .get(ci)
                        .is_none_or(|a| !same_ref(a, key_field, &["module", "element"]))
                    {
                        add_error(
                            &mut errors,
                            "ORDER",
                            &format!("{cp}/keyField"),
                            "Component must match the exact ordered authored Key field",
                        )
                    };
                    let field = field_layouts.get(&ref_id(key_field, &["module", "element"]));
                    if field.is_none_or(|f| {
                        utf8(get(f, "table")).as_deref() != utf8(get(key, "table")).as_deref()
                            || !same_ref(
                                get(f, "boundField").unwrap_or(&Value::Null),
                                get(c, "boundField").unwrap_or(&Value::Null),
                                &["module", "element", "field"],
                            )
                            || get(f, "column") != get(c, "column")
                            || get(f, "sqlType") != get(c, "sqlType")
                            || get(f, "nullable") != get(c, "nullable")
                            || get(f, "collation") != get(c, "collation")
                    }) {
                        add_error(
                            &mut errors,
                            "COMPONENT",
                            &cp,
                            "Key component differs from the declared bound Field inventory",
                        )
                    };
                    if matches!(get(authored, "primary"), Some(Value::Bool(true)))
                        && matches!(get(c, "nullable"), Some(Value::Bool(true)))
                    {
                        add_error(
                            &mut errors,
                            "NULLABILITY",
                            &cp,
                            "Primary Key columns cannot be nullable",
                        )
                    }
                }
            } else {
                add_error(&mut errors,"KEY",&format!("{at}/key"),"Exact stable Key ID must resolve; names and primary-key fallback are forbidden");
            }
        }
        key_layouts.insert(kid, key);
    }
    for (record_id, record) in &core_elements {
        if !tables.contains_key(record_id) {
            continue;
        }
        let (module, element) = core_refs
            .get(record_id)
            .cloned()
            .unwrap_or((Value::Null, Value::Null));
        for authored in arr(get(record, "keys")).unwrap_or(&[]) {
            let kid = ref_id(
                &obj(vec![
                    ("module", module.clone()),
                    ("element", element.clone()),
                    ("key", get(authored, "id").cloned().unwrap_or(Value::Null)),
                ]),
                &["module", "element", "key"],
            );
            if !key_layouts.contains_key(&kid) {
                add_error(
                    &mut errors,
                    "MISSING",
                    "/policy/keyLayouts",
                    &format!(
                        "Every bound authored Key requires a layout: {}/{}",
                        tables[record_id],
                        utf8(get(authored, "id")).unwrap_or_default()
                    ),
                );
            }
        }
    }
    let mut seen = HashSet::<String>::new();
    for (i, layout) in arr(get(&raw, "relationshipLayouts"))
        .unwrap_or(&[])
        .iter()
        .enumerate()
    {
        let at = format!("/policy/relationshipLayouts/{i}");
        let rr = get(layout, "relationship").unwrap_or(&Value::Null);
        let identity = ref_id(rr, &["module", "id"]);
        let Some(r) = rels.get(&identity).map(|(relationship, _)| *relationship) else {
            add_error(
                &mut errors,
                "RELATIONSHIP",
                &at,
                "Layout must match one exact stable-ID relationship",
            );
            continue;
        };
        if !seen.insert(identity.clone()) {
            add_error(&mut errors, "DUPLICATE", &at, "Relationship layout repeats")
        };
        let choice = relationships
            .iter()
            .find(|x| get(x, "module") == get(rr, "module") && get(x, "id") == get(rr, "id"));
        if choice.is_none()
            || !eq(
                choice.and_then(|x| get(x, "storage")),
                utf8(get(layout, "storage")).as_deref().unwrap_or(""),
            )
        {
            add_error(
                &mut errors,
                "RELATIONSHIP",
                &at,
                "Layout must match one exact stable-ID binding choice",
            )
        };
        let source_ends = arr(get(r, "source")).unwrap_or(&[]);
        let target_ends = arr(get(r, "target")).unwrap_or(&[]);
        if source_ends.len() != 1 || target_ends.len() != 1 {
            add_error(&mut errors,"HETEROGENEOUS",&at,"This bounded policy cannot type-check heterogeneous endpoints, including edge discriminators");
            continue;
        }
        let source_end = &source_ends[0];
        let target_end = &target_ends[0];
        let storage = utf8(get(layout, "storage")).unwrap_or_default();
        let carrier = utf8(get(layout, "carrierTable")).unwrap_or_default();
        if !safe_table(&carrier) {
            add_error(
                &mut errors,
                "TABLE",
                &format!("{at}/carrierTable"),
                "Safe explicit carrier table required",
            )
        }
        let target_key = get(layout, "targetKey").unwrap_or(&Value::Null);
        if !same_ref(target_key, target_end, &["module", "element", "key"]) {
            add_error(
                &mut errors,
                "KEY",
                &format!("{at}/targetKey"),
                "Target must use the relationship target Record and exact named Key ID",
            )
        }
        if storage == "foreign_key" {
            let max = get(get(r, "targetMultiplicity").unwrap_or(&Value::Null), "max");
            if !matches!(max,Some(Value::Number(n)) if *n==1.0) {
                add_error(
                    &mut errors,
                    "MULTIPLICITY",
                    &at,
                    "A single FK tuple cannot represent multiple target records",
                )
            }
            if tables
                .get(&ref_id(source_end, &["module", "element"]))
                .is_none_or(|table| table != &carrier)
            {
                add_error(
                    &mut errors,
                    "TABLE",
                    &format!("{at}/carrierTable"),
                    "FK carrier must equal the source Record table",
                )
            }
            if get(layout, "sourceKey").is_some()
                || get(layout, "sourceComponents").is_some()
                || get(layout, "sourceConstraint").is_some()
                || get(layout, "discriminator").is_some()
            {
                add_error(
                    &mut errors,
                    "EXTRA",
                    &at,
                    "FK layout has extra junction/edge-only policy",
                )
            }
            if get(r, "associationRecord").is_some() {
                add_error(
                    &mut errors,
                    "ASSOCIATION",
                    &at,
                    "An association Record cannot be reduced to a direct FK",
                )
            }
        } else {
            if get(layout, "sourceKey").is_none_or(|source_key| {
                !same_ref(source_key, source_end, &["module", "element", "key"])
            }) || get(layout, "sourceComponents").is_none()
                || get(layout, "sourceConstraint").is_none()
            {
                add_error(
                    &mut errors,
                    "SOURCE_KEY",
                    &at,
                    "Junction/edge requires an exact source Key and complete ordered source map",
                )
            }
            if storage == "junction" && get(layout, "discriminator").is_some() {
                add_error(
                    &mut errors,
                    "EXTRA",
                    &format!("{at}/discriminator"),
                    "Only edge storage uses a discriminator",
                )
            }
            if storage == "edge" {
                let d = get(layout, "discriminator");
                if d.is_none_or(|d| {
                    !eq(get(d, "sqlType"), "nvarchar(128)")
                        || matches!(get(d, "nullable"), Some(Value::Bool(true)))
                        || !eq(get(d, "collation"), "Latin1_General_100_BIN2")
                        || !safe_identifier(&utf8(get(d, "column")).unwrap_or_default())
                        || utf8(get(d, "value")).is_none_or(|v| v.contains('\0'))
                }) {
                    add_error(
                        &mut errors,
                        "DISCRIMINATOR",
                        &format!("{at}/discriminator"),
                        "Edge requires a safe non-null C-collated text discriminator",
                    )
                }
            }
        }
        let association = get(r, "associationRecord");
        if let Some(association) = association {
            let assoc_key = get(layout, "associationKey");
            if get(layout, "associationRecord")
                .is_none_or(|candidate| !same_ref(candidate, association, &["module", "element"]))
                || tables
                    .get(&ref_id(association, &["module", "element"]))
                    .is_none_or(|table| table != &carrier)
                || assoc_key.is_none_or(|key| {
                    !same_ref(key, association, &["module", "element"])
                        || !key_layouts.contains_key(&ref_id(key, &["module", "element", "key"]))
                })
            {
                add_error(
                    &mut errors,
                    "ASSOCIATION",
                    &at,
                    "Association Record, table and stable Key must survive explicitly",
                )
            }
            if let Some(record) = core_elements.get(&ref_id(association, &["module", "element"])) {
                for member in arr(get(record, "members")).unwrap_or(&[]) {
                    if field_layouts
                        .get(&ref_id(member, &["module", "element"]))
                        .is_none_or(|f| utf8(get(f, "table")).as_deref() != Some(carrier.as_str()))
                    {
                        add_error(&mut errors,"ASSOCIATION_FIELD",&at,"Every association Record member must survive as a declared carrier column")
                    }
                }
            }
        } else if get(layout, "associationRecord").is_some()
            || get(layout, "associationKey").is_some()
        {
            add_error(
                &mut errors,
                "EXTRA",
                &at,
                "Policy cannot invent an association Record",
            )
        } else if storage != "foreign_key" && table_owners.contains_key(&carrier) {
            add_error(
                &mut errors,
                "TABLE",
                &at,
                "Anonymous carrier must not overwrite a bound Record table",
            )
        }
        let folded = carrier.to_ascii_lowercase();
        let previous: Vec<&Value> = arr(get(&raw, "relationshipLayouts"))
            .unwrap_or(&[])
            .iter()
            .take(i)
            .filter(|other| {
                utf8(get(other, "carrierTable"))
                    .is_some_and(|name| name.to_ascii_lowercase() == folded)
            })
            .collect();
        if previous
            .iter()
            .any(|other| utf8(get(other, "carrierTable")).as_deref() != Some(carrier.as_str()))
        {
            add_error(
                &mut errors,
                "COLLISION",
                &at,
                "Anonymous carrier table spelling differs only by case",
            )
        }
        if previous.is_empty()
            && !table_owners.contains_key(&carrier)
            && !relation_names.insert(carrier.to_ascii_lowercase())
        {
            add_error(
                &mut errors,
                "COLLISION",
                &format!("{at}/carrierTable"),
                "Anonymous carrier collides with an index relation",
            )
        }
        if !previous.is_empty()
            && storage != "foreign_key"
            && previous
                .iter()
                .any(|other| !eq(get(other, "storage"), "edge") || storage != "edge")
        {
            add_error(
                &mut errors,
                "COLLISION",
                &at,
                "Only edge layouts may share anonymous carrier tables",
            )
        }
        if storage != "foreign_key"
            && !previous.is_empty()
            && previous
                .iter()
                .all(|other| eq(get(other, "storage"), "edge"))
            && storage == "edge"
        {
            for other in &previous {
                if get(layout, "sourceKey").is_none_or(|key| {
                    !same_ref(
                        key,
                        get(other, "sourceKey").unwrap_or(&Value::Null),
                        &["module", "element", "key"],
                    )
                }) || !same_ref(
                    get(layout, "targetKey").unwrap_or(&Value::Null),
                    get(other, "targetKey").unwrap_or(&Value::Null),
                    &["module", "element", "key"],
                ) {
                    add_error(&mut errors,"EDGE_ENDPOINT",&at,"Shared edge FKs cannot switch endpoint Keys by discriminator; a separate conditional enforcement profile is required")
                }
                for end in ["sourceComponents", "targetComponents"] {
                    let left = arr(get(layout, end)).unwrap_or(&[]);
                    let right = arr(get(other, end)).unwrap_or(&[]);
                    if left.len() != right.len()
                        || left.iter().zip(right).any(|(a, b)| {
                            ["carrierColumn", "sqlType", "nullable", "collation"]
                                .iter()
                                .any(|key| get(a, key) != get(b, key))
                        })
                    {
                        add_error(&mut errors,"COLLISION",&at,"Shared edge layouts need identical column shapes and distinct discriminator values")
                    }
                }
                if get(
                    get(layout, "discriminator").unwrap_or(&Value::Null),
                    "column",
                ) != get(
                    get(other, "discriminator").unwrap_or(&Value::Null),
                    "column",
                ) || get(
                    get(layout, "discriminator").unwrap_or(&Value::Null),
                    "value",
                ) == get(get(other, "discriminator").unwrap_or(&Value::Null), "value")
                {
                    add_error(&mut errors,"COLLISION",&at,"Shared edge layouts need identical column shapes and distinct discriminator values")
                }
            }
        }
        let mut occupied = HashSet::<String>::new();
        let mut check_endpoint = |end: &str,
                                  key_ref: Option<&Value>,
                                  components: Option<&[Value]>,
                                  constraint: Option<&Value>|
         -> Result<(), EngineError> {
            let (Some(key_ref), Some(components), Some(constraint)) =
                (key_ref, components, constraint)
            else {
                return Ok(());
            };
            let key = key_layouts
                .get(&ref_id(key_ref, &["module", "element", "key"]))
                .copied();
            let Some(key) = key else {
                add_error(
                    &mut errors,
                    "KEY",
                    &format!("{at}/{end}Key"),
                    "Endpoint Key requires its exact explicit layout",
                );
                return Ok(());
            };
            add_layout_constraint(
                &mut errors,
                &mut relation_names,
                &mut constraint_names,
                &carrier,
                &utf8(Some(constraint)).unwrap_or_default(),
                &format!("{at}/{end}Constraint"),
                false,
            );
            let key_components = arr(get(key, "components")).unwrap_or(&[]);
            if components.len() != key_components.len() {
                add_error(
                    &mut errors,
                    "COMPONENTS",
                    &format!("{at}/{end}Components"),
                    "Missing or extra endpoint components",
                )
            }
            for (ci, c) in components.iter().enumerate() {
                let cp = format!("{at}/{end}Components/{ci}");
                let kc = key_components.get(ci);
                if kc.is_none_or(|kc| {
                    !same_ref(
                        get(kc, "keyField").unwrap_or(&Value::Null),
                        get(c, "keyField").unwrap_or(&Value::Null),
                        &["module", "element"],
                    ) || !same_ref(
                        get(kc, "boundField").unwrap_or(&Value::Null),
                        get(c, "endpointField").unwrap_or(&Value::Null),
                        &["module", "element", "field"],
                    ) || get(kc, "column") != get(c, "endpointColumn")
                }) {
                    add_error(
                        &mut errors,
                        "ORDER",
                        &cp,
                        "Endpoint components must preserve exact Key order and bound columns",
                    )
                };
                if kc.is_none_or(|kc| !type_same(kc, c)) {
                    add_error(&mut errors,"TYPE",&cp,"Referencing SQL type and collation must exactly match the endpoint comparator")
                };
                let col = utf8(get(c, "carrierColumn")).unwrap_or_default();
                if !safe_identifier(&col)
                    || family(&utf8(get(c, "sqlType")).unwrap_or_default()).is_none()
                {
                    add_error(&mut errors, "SQL", &cp, "Unsafe referencing column or type")
                };
                if !occupied.insert(col.to_ascii_lowercase()) {
                    add_error(
                        &mut errors,
                        "COLLISION",
                        &cp,
                        "Endpoint carrier columns overlap",
                    )
                };
                if let Some(carrier_field) = get(c, "carrierField") {
                    let f =
                        bound_layouts.get(&ref_id(carrier_field, &["module", "element", "field"]));
                    if f.is_none_or(|f| {
                        utf8(get(f, "table")).as_deref() != Some(carrier.as_str())
                            || utf8(get(f, "column")) != utf8(get(c, "carrierColumn"))
                            || !type_same(f, c)
                            || get(f, "nullable") != get(c, "nullable")
                    }) {
                        add_error(&mut errors,"CARRIER",&cp,"Referencing Field must match the exact bound carrier column/type/nullability")
                    }
                } else if storage == "foreign_key" || association.is_some() {
                    add_error(
                        &mut errors,
                        "CARRIER",
                        &cp,
                        "A bound carrier Record requires an explicit referencing Field",
                    )
                };
                if matches!(get(c, "nullable"), Some(Value::Bool(true))) {
                    add_residual(&mut residuals,"policy",&format!("/relationshipLayouts/{i}/{end}Components/{ci}"),"SQL Server nullable-tuple matching exempts composite references containing NULL; no authored participation guarantee",c,ctx)?;
                }
            }
            Ok(())
        };
        check_endpoint(
            "target",
            Some(target_key),
            arr(get(layout, "targetComponents")),
            get(layout, "targetConstraint"),
        )?;
        if storage != "foreign_key" {
            check_endpoint(
                "source",
                get(layout, "sourceKey"),
                arr(get(layout, "sourceComponents")),
                get(layout, "sourceConstraint"),
            )?;
        }
        drop(check_endpoint);
        if let Some(d) = get(layout, "discriminator") {
            let value = utf8(get(d, "value")).unwrap_or_default();
            if !bounded_ascii_token(&value) {
                add_error(
                    &mut errors,
                    "DISCRIMINATOR",
                    &at,
                    "Discriminator uses an explicit ASCII token of at most 128 characters",
                )
            };
            let column = utf8(get(d, "column")).unwrap_or_default();
            if physical.contains_key(&format!(
                "{}:{}",
                carrier.to_ascii_lowercase(),
                column.to_ascii_lowercase()
            )) {
                add_error(
                    &mut errors,
                    "COLLISION",
                    &at,
                    "Discriminator aliases an existing bound attribute",
                )
            };
            if occupied.contains(&column.to_ascii_lowercase()) {
                add_error(
                    &mut errors,
                    "COLLISION",
                    &format!("{at}/discriminator"),
                    "Discriminator aliases an endpoint column",
                )
            }
        }
        if let Some((_, entry_path)) = rels.get(&identity) {
            add_residual(&mut residuals,"logical",entry_path,"Layout validation does not certify Key/relationship enforcement, participation bounds, lifecycle, inverse navigation or association semantics",r,ctx)?;
        }
    }
    for (i, choice) in relationships.iter().enumerate() {
        if !eq(get(choice, "storage"), "inline") {
            let id = ref_id(choice, &["module", "id"]);
            if !seen.contains(&id) {
                add_error(
                    &mut errors,
                    "MISSING",
                    &format!("/binding/extensions/umf.binding/relationships/{i}"),
                    "Missing exact relationship layout",
                )
            }
        } else {
            add_residual(
                &mut residuals,
                "binding",
                &format!("/extensions/umf.binding/relationships/{i}"),
                "SQL Server 2022 inline relationship carrier is unsupported",
                choice,
                ctx,
            )?;
        }
    }
    for diagnostic in core_validation.diagnostics.iter().filter(|d| {
        d.code
            .to_utf8()
            .ok()
            .is_some_and(|code| code.starts_with("UNKNOWN_"))
    }) {
        if let Some(value) = resolve_pointer(&logical, &diagnostic.path) {
            let mut reason = Utf16::from("Uninterpreted logical qualifier: ").into_units();
            reason.extend_from_slice(diagnostic.message.units());
            residuals.push(obj(vec![
                ("source", s("logical")),
                ("path", Value::String(diagnostic.path.clone())),
                ("reason", Value::String(Utf16::new(reason))),
                ("value", copy_json(value, ctx)?),
            ]));
        }
    }
    let blocked = !errors.is_empty() || (loss_policy == "strict" && !residuals.is_empty());
    let status = if blocked {
        "blocked"
    } else if residuals.is_empty() {
        "validated"
    } else {
        "reported"
    };
    let candidate = if blocked { None } else { Some(raw) };
    result(
        logical,
        binding,
        copy_json(policy, ctx)?,
        loss_policy,
        errors,
        residuals,
        candidate,
        ctx,
    )
}
fn result(
    logical: Value,
    binding: Value,
    policy: Value,
    loss: &str,
    diagnostics: Vec<Value>,
    residuals: Vec<Value>,
    candidate: Option<Value>,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let blocked = !diagnostics.is_empty() || loss == "strict" && !residuals.is_empty();
    let status = if blocked {
        "blocked"
    } else if residuals.is_empty() {
        "validated"
    } else {
        "reported"
    };
    let mut out = vec![
        ("operation", s("validate-sqlserver-relationship-layout")),
        ("version", s("1.0.0")),
        ("status", s(status)),
        ("lossPolicy", s(loss)),
        ("logical", logical),
        ("binding", binding),
        ("policy", policy),
        ("diagnostics", Value::Array(diagnostics)),
        ("residuals", Value::Array(residuals)),
    ];
    if let Some(c) = candidate {
        out.push(("candidate", c));
    }
    let value = obj(out);
    let _ = crate::serialization::stringify_compact_metered(&value, ctx)?;
    Ok(value)
}
