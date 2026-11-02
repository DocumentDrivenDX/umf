// SPDX-License-Identifier: MIT OR Apache-2.0
//! Rust-owned validation for the retained PostgreSQL DDD relationship-layout policy.
use crate::{
    binding_inspection::{inspect_binding, BindingInspectionResources},
    context::Context,
    ddd_json_schema_projection,
    engine::{Capabilities, Engine, ResourceSet, SemanticContext},
    error::{Diagnostic, EngineError, Validation},
    registry::Registry,
    schema::{CompiledSchema, SchemaResources},
    serialization::{read_json_value, Format},
    value::{copy_json, Utf16, Value},
};
use std::collections::{HashMap, HashSet};

const POLICY_SCHEMA: &str =
    include_str!("../../../spec/projections/postgresql-relationship-layout.schema.json");

fn core_validation_resources(ctx: &mut Context<'_>) -> Result<ResourceSet, EngineError> {
    fn read(source: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
        let units = source.encode_utf16().collect::<Vec<_>>();
        ctx.charge_text(units.len(), Utf16::default())?;
        read_json_value(&units, Format::Json, ctx)
    }
    Ok(ResourceSet::new(
        read(include_str!("../../../spec/core/schema.json"), ctx)?,
        read(
            include_str!("../../../spec/core/semantic-type-reference.schema.json"),
            ctx,
        )?,
        read(
            include_str!("../../../spec/core/extension-package.schema.json"),
            ctx,
        )?,
        read(
            include_str!("../../../spec/metamodel/generated/core-constraints.json"),
            ctx,
        )?,
        read(
            include_str!("../../../spec/metamodel/generated/domain-policy.json"),
            ctx,
        )?,
    ))
}
struct NoExtensionCapabilities;
impl Capabilities for NoExtensionCapabilities {
    fn validate_extension(
        &mut self,
        _token: u64,
        _payload: &Value,
        _context: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        Ok(Vec::new())
    }
}
fn validate_core_document(
    document: &Value,
    ctx: &mut Context<'_>,
) -> Result<Validation, EngineError> {
    let engine = Engine::new(core_validation_resources(ctx)?, ctx)?;
    engine.validate_document(
        document,
        &Registry::new(),
        &mut NoExtensionCapabilities,
        ctx,
    )
}

fn k(x: &str) -> Utf16 {
    Utf16::from(x)
}
fn get<'a>(v: &'a Value, name: &str) -> Option<&'a Value> {
    if let Value::Object(fields) = v {
        fields.iter().find(|(n, _)| n == &k(name)).map(|(_, v)| v)
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
fn eq(v: Option<&Value>, s: &str) -> bool {
    utf8(v).as_deref() == Some(s)
}
fn s(x: &str) -> Value {
    Value::string_utf8(x)
}
fn obj(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(fields.into_iter().map(|(a, b)| (k(a), b)).collect())
}
fn fail(code: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}
fn identity(v: &Value, names: &[&str]) -> String {
    names
        .iter()
        .map(|name| {
            text(get(v, name))
                .map(|x| {
                    x.units()
                        .iter()
                        .map(|u| format!("{u:04x}"))
                        .collect::<String>()
                })
                .unwrap_or_else(|| "<missing>".into())
        })
        .collect::<Vec<_>>()
        .join("\u{1f}")
}
fn key_layout_identity(layout: &Value) -> String {
    let record = get(layout, "record").unwrap_or(&Value::Null);
    let reference = obj(vec![
        ("module", get(record, "module").cloned().unwrap_or(Value::Null)),
        ("element", get(record, "element").cloned().unwrap_or(Value::Null)),
        ("key", get(layout, "key").cloned().unwrap_or(Value::Null)),
    ]);
    identity(&reference, &["module", "element", "key"])
}
fn same_ref(a: &Value, b: &Value, names: &[&str]) -> bool {
    names.iter().all(|name| get(a, name) == get(b, name))
}
fn pointer_value<'a>(root: &'a Value, path: &Utf16) -> Option<&'a Value> {
    let units = path.units();
    if units.is_empty() {
        return Some(root);
    }
    if units.first().copied() != Some(b'/' as u16) {
        return None;
    }
    let mut parts = Vec::<Vec<u16>>::new();
    let mut current = Vec::new();
    let mut i = 1;
    while i < units.len() {
        let unit = units[i];
        if unit == b'/' as u16 {
            parts.push(std::mem::take(&mut current));
            i += 1;
        } else if unit == b'~' as u16 && i + 1 < units.len() {
            match units[i + 1] {
                x if x == b'0' as u16 => current.push(b'~' as u16),
                x if x == b'1' as u16 => current.push(b'/' as u16),
                _ => return None,
            }
            i += 2;
        } else {
            current.push(unit);
            i += 1;
        }
    }
    parts.push(current);
    let mut value = root;
    for part in parts {
        value = match value {
            Value::Object(fields) => fields
                .iter()
                .find(|(name, _)| name.units() == part)
                .map(|(_, value)| value)?,
            Value::Array(items) => {
                let token = String::from_utf16(&part).ok()?;
                if token.is_empty()
                    || token.len() > 1 && token.starts_with('0')
                    || !token.bytes().all(|b| b.is_ascii_digit())
                {
                    return None;
                }
                items.get(token.parse::<usize>().ok()?)?
            }
            _ => return None,
        };
    }
    Some(value)
}
fn safe_identifier(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 63
        && (name.as_bytes()[0].is_ascii_alphabetic() || name.as_bytes()[0] == b'_')
        && name.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_')
}
fn safe_table(name: &str) -> bool {
    let mut p = name.split('.');
    let a = p.next().unwrap_or_default();
    let b = p.next().unwrap_or_default();
    !a.is_empty() && !b.is_empty() && p.next().is_none() && safe_identifier(a) && safe_identifier(b)
}
fn relation_identity(name: &str) -> Option<String> {
    let (schema, relation) = name.split_once('.')?;
    Some(format!("{schema}\u{1f}{relation}"))
}
fn family(sql: &str) -> Option<&'static str> {
    if sql.trim() != sql
        || sql
            .chars()
            .any(|c| matches!(c, '\r' | '\n' | '\u{2028}' | '\u{2029}'))
    {
        return None;
    }
    if ["smallint", "integer", "bigint"].contains(&sql) {
        return Some("integer");
    }
    if sql == "boolean" {
        return Some("boolean");
    }
    if sql == "text" {
        return Some("string");
    }
    if sql == "bytea" {
        return Some("binary");
    }
    if sql == "date" {
        return Some("date");
    }
    if ["real", "double precision"].contains(&sql) {
        return Some("float");
    }
    if sql.starts_with("timestamp(") && sql.ends_with(')') {
        let n = &sql[10..sql.len() - 1];
        if n.len() == 1
            && n.as_bytes()[0].is_ascii_digit()
            && (b'0'..=b'6').contains(&n.as_bytes()[0])
        {
            return Some("timestamp");
        }
    }
    if sql.starts_with("timestamptz(") && sql.ends_with(')') {
        let n = &sql[12..sql.len() - 1];
        if n.len() == 1
            && n.as_bytes()[0].is_ascii_digit()
            && (b'0'..=b'6').contains(&n.as_bytes()[0])
        {
            return Some("timestamp");
        }
    }
    if let Some(n) = sql
        .strip_prefix("varchar(")
        .and_then(|x| x.strip_suffix(')'))
    {
        if (1..=8).contains(&n.len())
            && n.bytes().all(|b| b.is_ascii_digit())
            && !n.starts_with('0')
            && n.parse::<u32>()
                .is_ok_and(|n| (1..=10_485_760).contains(&n))
        {
            return Some("string");
        }
    }
    if let Some(n) = sql
        .strip_prefix("numeric(")
        .and_then(|x| x.strip_suffix(')'))
    {
        let mut p = n.split(',');
        if let (Some(a_token), Some(b_token), None) = (p.next(), p.next(), p.next()) {
            if (1..=3).contains(&a_token.len())
                && (1..=3).contains(&b_token.len())
                && a_token.bytes().all(|b| b.is_ascii_digit())
                && b_token.bytes().all(|b| b.is_ascii_digit())
                && !a_token.starts_with('0')
                && (b_token == "0" || !b_token.starts_with('0'))
            {
                if let (Ok(a), Ok(b)) = (a_token.parse::<u16>(), b_token.parse::<u16>()) {
                    if (1..=999).contains(&a) && b <= a {
                        return Some("decimal");
                    }
                }
            }
        }
    }
    None
}
fn diagnostic(code: &str, path: &str, message: &str) -> Value {
    obj(vec![
        ("code", s(&format!("POSTGRESQL_LAYOUT_{code}"))),
        ("path", s(path)),
        ("message", s(message)),
        ("severity", s("error")),
    ])
}
fn residual(
    source: &str,
    path: &str,
    reason: &str,
    value: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    residual_path(source, Utf16::from(path), reason, value, ctx)
}
fn residual_path(
    source: &str,
    path: Utf16,
    reason: &str,
    value: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    Ok(Value::Object(vec![
        (k("source"), s(source)),
        (k("path"), Value::String(path)),
        (k("reason"), s(reason)),
        (k("value"), copy_json(value, ctx)?),
    ]))
}
fn type_same(a: &Value, b: &Value) -> bool {
    get(a, "sqlType") == get(b, "sqlType") && get(a, "collation") == get(b, "collation")
}
fn schema(ctx: &mut Context<'_>) -> Result<CompiledSchema, EngineError> {
    let value = read_json_value(
        &POLICY_SCHEMA.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        ctx,
    )?;
    CompiledSchema::compile(&value, &SchemaResources::default(), ctx)
}
fn max_is_one(v: &Value) -> bool {
    matches!(get(v,"max"),Some(Value::Number(n)) if *n==1.0)
}

/// Validate PostgreSQL 17.4 DDD layout policy; the returned candidate is metadata only.
pub fn validate_postgresql_relationship_layout(
    resources: &BindingInspectionResources,
    logical_input: &Value,
    binding_input: &Value,
    policy_input: &Value,
    loss: &str,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    if loss != "strict" && loss != "report" {
        return Err(fail(
            "POSTGRESQL_LAYOUT_POLICY",
            "Expected strict or report",
        ));
    }
    let logical = copy_json(logical_input, ctx)?;
    let binding = copy_json(binding_input, ctx)?;
    let raw = copy_json(policy_input, ctx)?;
    let mut errors = Vec::<Value>::new();
    let mut residuals = Vec::<Value>::new();
    let add_error = |errors: &mut Vec<Value>, code: &str, path: &str, msg: &str| {
        errors.push(diagnostic(code, path, msg))
    };
    let validation = validate_core_document(&logical, ctx)?;
    if !eq(get(&logical, "umf"), "0.10.0") || !validation.valid {
        add_error(
            &mut errors,
            "MODEL",
            "/logical",
            "A valid core 0.10.0 relationship document is required",
        );
    }
    if !errors.is_empty() {
        return make_result(logical, binding, raw, loss, errors, residuals, None, ctx);
    }
    let checked = inspect_binding(resources, &binding, &logical, ctx)?;
    if !checked.valid {
        for d in checked.diagnostics {
            errors.push(obj(vec![
                ("code", Value::String(d.code)),
                ("path", Value::String(d.path)),
                ("message", Value::String(d.message)),
                (
                    "severity",
                    s(if d.severity == crate::error::Severity::Error {
                        "error"
                    } else {
                        "warning"
                    }),
                ),
            ]));
        }
        return make_result(logical, binding, raw, loss, errors, residuals, None, ctx);
    }
    let vocab = get(
        get(&binding, "vocabularies").unwrap_or(&Value::Null),
        "umf.binding",
    )
    .and_then(|v| get(v, "version"));
    let payload = get(
        get(&binding, "extensions").unwrap_or(&Value::Null),
        "umf.binding",
    )
    .unwrap_or(&Value::Null);
    if !eq(vocab, "0.2.0") || !eq(get(payload, "profile"), "umf-binding-2") {
        add_error(
            &mut errors,
            "BINDING",
            "/binding",
            "Explicit stable-ID binding migration is required",
        );
        return make_result(logical, binding, raw, loss, errors, residuals, None, ctx);
    }
    if checked
        .diagnostics
        .iter()
        .any(|d| d.code == k("BINDING_UNKNOWN"))
    {
        add_error(
            &mut errors,
            "UNKNOWN",
            "/binding",
            "Unknown physical choices block safe layout interpretation",
        );
    }
    let policy_schema = schema(ctx)?;
    for error in policy_schema.validate(&raw, ctx)? {
        let mut path = "/policy".encode_utf16().collect::<Vec<_>>();
        path.extend_from_slice(error.instance_path.units());
        errors.push(Value::Object(vec![
            (k("code"), s("POSTGRESQL_LAYOUT_STRUCTURE")),
            (k("path"), Value::String(Utf16::new(path))),
            (k("message"), Value::String(error.message)),
            (k("severity"), s("error")),
        ]));
    }
    if !errors.is_empty() {
        return make_result(logical, binding, raw, loss, errors, residuals, None, ctx);
    }
    if !eq(get(payload, "profile"), "umf-binding-2")
        || !eq(
            get(get(payload, "target").unwrap_or(&Value::Null), "system"),
            "postgresql",
        )
        || get(get(payload, "target").unwrap_or(&Value::Null), "version")
            != get(&raw, "targetVersion")
    {
        add_error(
            &mut errors,
            "TARGET",
            "/policy/targetVersion",
            "Exact binding PostgreSQL version required",
        );
        return make_result(logical, binding, raw, loss, errors, residuals, None, ctx);
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
        return make_result(logical, binding, raw, loss, errors, residuals, None, ctx);
    }
    let modules = arr(get(&logical, "modules")).unwrap_or(&[]);
    let elements = arr(get(payload, "elements")).unwrap_or(&[]);
    let bound = arr(get(payload, "fields")).unwrap_or(&[]);
    let indexes = arr(get(payload, "indexes")).unwrap_or(&[]);
    let bound_rels = arr(get(payload, "relationships")).unwrap_or(&[]);
    let mut core = HashMap::<String, &Value>::new();
    let mut core_refs = HashMap::<String, Value>::new();
    let mut owners = HashMap::<String, String>::new();
    let mut tables = HashMap::<String, String>::new();
    let mut table_owners = HashMap::<String, String>::new();
    let mut rels = HashMap::<String, (&Value, String)>::new();
    for (mi, module) in modules.iter().enumerate() {
        let module_id = get(module, "id").cloned().unwrap_or(Value::Null);
        for (ei, element) in arr(get(module, "elements"))
            .unwrap_or(&[])
            .iter()
            .enumerate()
        {
            let refv = obj(vec![
                ("module", module_id.clone()),
                (
                    "element",
                    get(element, "id").cloned().unwrap_or(Value::Null),
                ),
            ]);
            let ident = identity(&refv, &["module", "element"]);
            core.insert(ident.clone(), element);
            core_refs.insert(ident.clone(), refv.clone());
            for member in arr(get(element, "members")).unwrap_or(&[]) {
                owners.insert(identity(member, &["module", "element"]), ident.clone());
            }
        }
        for (ri, rel) in arr(get(module, "relationships"))
            .unwrap_or(&[])
            .iter()
            .enumerate()
        {
            let refv = obj(vec![
                ("module", module_id.clone()),
                ("id", get(rel, "id").cloned().unwrap_or(Value::Null)),
            ]);
            rels.insert(
                identity(&refv, &["module", "id"]),
                (rel, format!("/modules/{mi}/relationships/{ri}")),
            );
        }
    }
    let mut bound_field_layouts = HashMap::<String, &Value>::new();
    let mut core_field_layouts = HashMap::<String, &Value>::new();
    let mut relation_names = HashSet::<String>::new();
    let mut constraints = HashSet::<String>::new();
    for (i, element) in elements.iter().enumerate() {
        let path = format!("/binding/extensions/umf.binding/elements/{i}");
        let ident = identity(element, &["module", "element"]);
        let Some(table) = utf8(get(element, "table")) else {
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
        };
        if tables.insert(ident.clone(), table.clone()).is_some()
            || table_owners.insert(table.clone(), ident.clone()).is_some()
        {
            add_error(
                &mut errors,
                "COLLISION",
                &path,
                "Distinct elements cannot share one table",
            );
        }
        if let Some(identity) = relation_identity(&table) {
            relation_names.insert(identity);
        }
    }
    for (i, index) in indexes.iter().enumerate() {
        let refv = arr(get(index, "on"))
            .and_then(|a| a.first())
            .and_then(|target| {
                get(target, "field")
                    .or_else(|| get(get(target, "documentPath").unwrap_or(&Value::Null), "field"))
            });
        let owner = refv.map(|r| {
            let id = identity(r, &["module", "element"]);
            if get(r, "field").is_some() {
                id
            } else {
                owners.get(&id).cloned().unwrap_or(id)
            }
        });
        if let Some(owner) = owner.and_then(|o| tables.get(&o)) {
            let name = utf8(get(index, "name")).unwrap_or_default();
            let index_id = format!(
                "{}\u{1f}{name}",
                owner.split('.').next().unwrap_or_default()
            );
            if !safe_identifier(&name) {
                add_error(
                    &mut errors,
                    "IDENTIFIER",
                    &format!("/binding/extensions/umf.binding/indexes/{i}/name"),
                    "Unsafe index identifier",
                );
            }
            if !relation_names.insert(index_id) {
                add_error(
                    &mut errors,
                    "COLLISION",
                    &format!("/binding/extensions/umf.binding/indexes/{i}"),
                    "Index relation name collides in schema",
                );
            }
        }
    }
    let field_layouts = arr(get(&raw, "fieldLayouts")).unwrap_or(&[]);
    for (i, f) in field_layouts.iter().enumerate() {
        let path = format!("/policy/fieldLayouts/{i}");
        let core_ref = get(f, "coreField").unwrap_or(&Value::Null);
        let bound_ref = get(f, "boundField").unwrap_or(&Value::Null);
        let core_id = identity(core_ref, &["module", "element"]);
        let bound_id = identity(bound_ref, &["module", "element", "field"]);
        let owner = owners.get(&core_id);
        let def = core.get(&core_id).copied();
        let b = bound
            .iter()
            .find(|row| identity(row, &["module", "element", "field"]) == bound_id);
        if core_field_layouts.insert(core_id.clone(), f).is_some()
            || bound_field_layouts.insert(bound_id.clone(), f).is_some()
        {
            add_error(
                &mut errors,
                "DUPLICATE",
                &path,
                "Core or bound Field mapping repeats",
            );
        }
        if def.is_none() || !eq(def.and_then(|v| get(v, "kind")), "field") || owner.is_none() {
            add_error(
                &mut errors,
                "FIELD",
                &(path.clone() + "/coreField"),
                "Exact member Field is required",
            );
        }
        if owner.and_then(|o| tables.get(o).map(String::as_str)) != utf8(get(f, "table")).as_deref() {
            add_error(
                &mut errors,
                "TABLE",
                &(path.clone() + "/table"),
                "Field table differs from its owning Record binding",
            );
        }
        if b.is_none_or(|b| {
            !eq(get(b, "storage"), "column") || get(b, "column") != get(f, "column")
        }) {
            add_error(
                &mut errors,
                "FIELD",
                &(path.clone() + "/boundField"),
                "Exact bound column is required",
            );
        }
        if get(bound_ref, "field").is_some()
            && owner.is_none_or(|o| o != &identity(bound_ref, &["module", "element"]))
        {
            add_error(
                &mut errors,
                "FIELD",
                &(path.clone() + "/boundField"),
                "DDD field must belong to the exact owning Record",
            );
        }
        if get(bound_ref, "field").is_none()
            && !same_ref(core_ref, bound_ref, &["module", "element"])
        {
            add_error(
                &mut errors,
                "FIELD",
                &(path.clone() + "/boundField"),
                "Direct Field binding cannot substitute another ID",
            );
        }
        let sql = utf8(get(f, "sqlType")).unwrap_or_default();
        let scalar = family(&sql);
        let col = utf8(get(f, "column")).unwrap_or_default();
        if scalar.is_none()
            || !safe_table(&utf8(get(f, "table")).unwrap_or_default())
            || !safe_identifier(&col)
        {
            add_error(
                &mut errors,
                "SQL",
                &path,
                "Unsafe or unsupported table, column or SQL type",
            );
        }
        if (scalar == Some("string") && !eq(get(f, "collation"), "C"))
            || (scalar != Some("string") && !matches!(get(f, "collation"), Some(Value::Null)))
        {
            add_error(
                &mut errors,
                "COLLATION",
                &path,
                "Text uses explicit C comparison; nontext must have null collation",
            );
        }
        let nullable = matches!(get(f, "nullable"), Some(Value::Bool(true)));
        if let Some(field) = def {
            let expected = utf8(get(field, "scalarType")).unwrap_or_default();
            if scalar.is_some_and(|s| s != expected)
                || !eq(get(field, "cardinality"), "one")
                || !(eq(get(field, "nullability"), "required")
                    || eq(get(field, "nullability"), "absent-allowed"))
            {
                add_error(&mut errors,"TYPE",&path,"Field scalar family, cardinality and availability must be explicit and compatible");
            }
            if nullable != eq(get(field, "nullability"), "absent-allowed") {
                add_error(
                    &mut errors,
                    "NULLABILITY",
                    &path,
                    "Column NULL carrier differs from the authored Field availability",
                );
            }
        }
        if let Some(field) = get(bound_ref, "field").and_then(|v| utf8(Some(v))) {
            let entity = core
                .get(&identity(bound_ref, &["module", "element"]))
                .copied()
                .and_then(|e| get(get(e, "extensions").unwrap_or(&Value::Null), "umf.ddd"));
            let ddd_field = get(
                get(entity.unwrap_or(&Value::Null), "fields").unwrap_or(&Value::Null),
                &field,
            );
            let ddd_type = get(ddd_field.unwrap_or(&Value::Null), "type").unwrap_or(&Value::Null);
            let want = match scalar {
                Some("binary") => "bytes",
                Some("timestamp") => "date-time",
                Some(x) => x,
                _ => "",
            };
            if !eq(get(ddd_type, "kind"), "scalar")
                || !eq(get(ddd_type, "name"), want)
                || !(eq(get(ddd_field.unwrap_or(&Value::Null), "cardinality"), "one")
                    || eq(
                        get(ddd_field.unwrap_or(&Value::Null), "cardinality"),
                        "optional",
                    ))
                || nullable
                    != eq(
                        get(ddd_field.unwrap_or(&Value::Null), "cardinality"),
                        "optional",
                    )
            {
                add_error(
                    &mut errors,
                    "DDD_FIELD",
                    &path,
                    "Explicit core-to-DDD map has incompatible scalar or availability meaning",
                );
            }
        }
        for prior in field_layouts.iter().take(i) {
            if get(prior, "table") == get(f, "table") && get(prior, "column") == get(f, "column") {
                add_error(
                    &mut errors,
                    "COLLISION",
                    &path,
                    "Distinct Field mappings use the same physical column",
                );
                break;
            }
        }
        residuals.push(residual("policy",&format!("/fieldLayouts/{i}"),"Declared SQL type, NULL carrier and comparator require separate native/domain enforcement evidence",f,ctx)?);
    }
    for (i, b) in bound.iter().enumerate() {
        if eq(get(b, "storage"), "column")
            && !bound_field_layouts.contains_key(&identity(b, &["module", "element", "field"]))
        {
            add_error(
                &mut errors,
                "MISSING",
                &format!("/binding/extensions/umf.binding/fields/{i}"),
                "Bound column lacks an explicit Field/type inventory",
            );
        }
    }
    let key_layouts = arr(get(&raw, "keyLayouts")).unwrap_or(&[]);
    let mut keys = HashMap::<String, &Value>::new();
    for (i, key) in key_layouts.iter().enumerate() {
        let path = format!("/policy/keyLayouts/{i}");
        let record_ref = get(key, "record").unwrap_or(&Value::Null);
        let key_name = get(key, "key").unwrap_or(&Value::Null);
        let record = core
            .get(&identity(record_ref, &["module", "element"]))
            .copied();
        let authored = arr(record.and_then(|r| get(r, "keys")))
            .unwrap_or(&[])
            .iter()
            .find(|k| get(k, "id") == Some(key_name));
        let kid = key_layout_identity(key);
        if keys.insert(kid, key).is_some() {
            add_error(&mut errors, "DUPLICATE", &path, "Key layout repeats");
        }
        if authored.is_none() {
            add_error(
                &mut errors,
                "KEY",
                &(path.clone() + "/key"),
                "Exact stable Key ID must resolve; names and primary-key fallback are forbidden",
            );
            continue;
        }
        let table = utf8(get(key, "table")).unwrap_or_default();
        let record_is_partitioned = elements
            .iter()
            .find(|element| {
                identity(element, &["module", "element"])
                    == identity(record_ref, &["module", "element"])
            })
            .is_some_and(|element| !matches!(get(element, "partition"), None | Some(Value::Null)));
        if record_is_partitioned {
            add_error(
                &mut errors,
                "PARTITION",
                &path,
                "Partitioned Key eligibility requires a separate complete partition policy",
            );
        }
        if tables
            .get(&identity(record_ref, &["module", "element"]))
            .map(String::as_str)
            != Some(table.as_str())
        {
            add_error(
                &mut errors,
                "TABLE",
                &(path.clone() + "/table"),
                "Key table must equal the Record binding",
            );
        }
        let components = arr(get(key, "components")).unwrap_or(&[]);
        let auth_fields = arr(authored.and_then(|a| get(a, "fields"))).unwrap_or(&[]);
        if components.len() != auth_fields.len() {
            add_error(
                &mut errors,
                "COMPONENTS",
                &(path.clone() + "/components"),
                "Exactly one ordered component per authored Key field is required",
            );
        }
        for (ci, c) in components.iter().enumerate() {
            let at = format!("{path}/components/{ci}");
            if auth_fields.get(ci).is_none_or(|f| {
                !same_ref(
                    f,
                    get(c, "keyField").unwrap_or(&Value::Null),
                    &["module", "element"],
                )
            }) {
                add_error(
                    &mut errors,
                    "ORDER",
                    &(at.clone() + "/keyField"),
                    "Component must match the exact ordered authored Key field",
                );
            }
            let f = core_field_layouts
                .get(&identity(
                    get(c, "keyField").unwrap_or(&Value::Null),
                    &["module", "element"],
                ))
                .copied();
            if f.is_none_or(|f| {
                get(f, "table") != get(key, "table")
                    || identity(
                        get(f, "boundField").unwrap_or(&Value::Null),
                        &["module", "element", "field"],
                    ) != identity(
                        get(c, "boundField").unwrap_or(&Value::Null),
                        &["module", "element", "field"],
                    )
                    || get(f, "column") != get(c, "column")
                    || !type_same(f, c)
                    || get(f, "nullable") != get(c, "nullable")
            }) {
                add_error(
                    &mut errors,
                    "COMPONENT",
                    &at,
                    "Key component differs from the declared bound Field inventory",
                );
            }
            if matches!(
                get(authored.unwrap_or(&Value::Null), "primary"),
                Some(Value::Bool(true))
            ) && matches!(get(c, "nullable"), Some(Value::Bool(true)))
            {
                add_error(
                    &mut errors,
                    "NULLABILITY",
                    &at,
                    "Primary Key columns cannot be nullable",
                );
            }
        }
        let constraint = utf8(get(key, "constraint")).unwrap_or_default();
        if !safe_identifier(&constraint) {
            add_error(
                &mut errors,
                "IDENTIFIER",
                &(path.clone() + "/constraint"),
                "Constraint name must be an untruncated portable PostgreSQL identifier",
            );
        }
        if !constraints.insert(format!("{}\u{1f}{}", table, constraint)) {
            add_error(
                &mut errors,
                "COLLISION",
                &(path.clone() + "/constraint"),
                "Constraint name repeats within one table",
            );
        }
        let relation = format!(
            "{}\u{1f}{constraint}",
            table.split('.').next().unwrap_or_default()
        );
        if !relation_names.insert(relation) {
            add_error(
                &mut errors,
                "COLLISION",
                &(path.clone() + "/constraint"),
                "Key index relation name collides in schema",
            );
        }
    }
    for (record_id, table) in &tables {
        let Some(record_ref) = core_refs.get(record_id) else {
            continue;
        };
        let record = core.get(record_id).copied();
        for key in arr(record.and_then(|r| get(r, "keys"))).unwrap_or(&[]) {
            let key_ref = obj(vec![
                (
                    "module",
                    get(record_ref, "module").cloned().unwrap_or(Value::Null),
                ),
                (
                    "element",
                    get(record_ref, "element").cloned().unwrap_or(Value::Null),
                ),
                ("key", get(key, "id").cloned().unwrap_or(Value::Null)),
            ]);
            let key_identity = identity(&key_ref, &["module", "element", "key"]);
            if !keys.contains_key(&key_identity) {
                add_error(
                    &mut errors,
                    "MISSING",
                    "/policy/keyLayouts",
                    &format!(
                        "Every bound authored Key requires a layout: {table}/{}",
                        utf8(get(key, "id")).unwrap_or_default()
                    ),
                );
            }
        }
    }
    let relationships: HashMap<String, (&Value, String)> = rels;
    let choices = bound_rels;
    let layouts = arr(get(&raw, "relationshipLayouts")).unwrap_or(&[]);
    let mut seen = HashSet::<String>::new();
    let mut carriers = HashMap::<String, Vec<&Value>>::new();
    for (i, layout) in layouts.iter().enumerate() {
        let path = format!("/policy/relationshipLayouts/{i}");
        let rref = get(layout, "relationship").unwrap_or(&Value::Null);
        let rid = identity(rref, &["module", "id"]);
        let entry = relationships.get(&rid);
        if !seen.insert(rid.clone()) {
            add_error(
                &mut errors,
                "DUPLICATE",
                &path,
                "Relationship layout repeats",
            );
        }
        let choice = choices
            .iter()
            .find(|c| identity(c, &["module", "id"]) == rid);
        if entry.is_none()
            || choice.is_none_or(|c| {
                !eq(
                    get(c, "storage"),
                    &utf8(get(layout, "storage")).unwrap_or_default(),
                )
            })
        {
            add_error(
                &mut errors,
                "RELATIONSHIP",
                &path,
                "Layout must match one exact stable-ID binding choice",
            );
            continue;
        }
        let (rel, logical_path) = entry.unwrap();
        let source = arr(get(rel, "source")).unwrap_or(&[]);
        let target = arr(get(rel, "target")).unwrap_or(&[]);
        if source.len() != 1 || target.len() != 1 {
            add_error(&mut errors,"HETEROGENEOUS",&path,"This bounded policy cannot type-check heterogeneous endpoints, including edge discriminators");
            continue;
        }
        let carrier = utf8(get(layout, "carrierTable")).unwrap_or_default();
        if !safe_table(&carrier) {
            add_error(
                &mut errors,
                "TABLE",
                &(path.clone() + "/carrierTable"),
                "Safe explicit carrier table required",
            );
        }
        let target_ref = target.first().unwrap();
        let source_ref = source.first().unwrap();
        if !same_ref(
            get(layout, "targetKey").unwrap_or(&Value::Null),
            target_ref,
            &["module", "element", "key"],
        ) {
            add_error(
                &mut errors,
                "KEY",
                &(path.clone() + "/targetKey"),
                "Target must use the relationship target Record and exact named Key ID",
            );
        }
        let storage = utf8(get(layout, "storage")).unwrap_or_default();
        if storage == "foreign_key" {
            if tables
                .get(&identity(source_ref, &["module", "element"]))
                .map(String::as_str)
                != Some(carrier.as_str())
            {
                add_error(
                    &mut errors,
                    "TABLE",
                    &(path.clone() + "/carrierTable"),
                    "FK carrier must equal the source Record table",
                );
            }
            if get(layout, "sourceKey").is_some()
                || get(layout, "sourceComponents").is_some()
                || get(layout, "sourceConstraint").is_some()
                || get(layout, "discriminator").is_some()
            {
                add_error(
                    &mut errors,
                    "EXTRA",
                    &path,
                    "FK layout has extra junction/edge-only policy",
                );
            }
            if get(rel, "associationRecord").is_some() {
                add_error(
                    &mut errors,
                    "ASSOCIATION",
                    &path,
                    "An association Record cannot be reduced to a direct FK",
                );
            }
            if !max_is_one(get(rel, "targetMultiplicity").unwrap_or(&Value::Null)) {
                add_error(
                    &mut errors,
                    "MULTIPLICITY",
                    &path,
                    "A single FK tuple cannot represent multiple target records",
                );
            }
        } else {
            if get(layout, "sourceKey").is_none_or(|source_key| {
                !same_ref(source_key, source_ref, &["module", "element"])
                    || !keys.contains_key(&identity(source_key, &["module", "element", "key"]))
            })
                || get(layout, "sourceComponents").is_none()
                || get(layout, "sourceConstraint").is_none()
            {
                add_error(
                    &mut errors,
                    "SOURCE_KEY",
                    &path,
                    "Junction/edge requires an exact source Key and complete ordered source map",
                );
            }
            if storage == "junction" && get(layout, "discriminator").is_some() {
                add_error(
                    &mut errors,
                    "EXTRA",
                    &(path.clone() + "/discriminator"),
                    "Only edge storage uses a discriminator",
                );
            }
            if storage == "edge" {
                let d = get(layout, "discriminator").unwrap_or(&Value::Null);
                let value = utf8(get(d, "value")).unwrap_or_default();
                if !eq(get(d, "sqlType"), "text")
                    || matches!(get(d, "nullable"), Some(Value::Bool(true)))
                    || !eq(get(d, "collation"), "C")
                    || !safe_identifier(&utf8(get(d, "column")).unwrap_or_default())
                    || value.contains('\0')
                {
                    add_error(
                        &mut errors,
                        "DISCRIMINATOR",
                        &(path.clone() + "/discriminator"),
                        "Edge requires a safe non-null C-collated text discriminator",
                    );
                }
            }
        }
        if get(rel, "associationRecord").is_some() {
            let assoc = get(rel, "associationRecord").unwrap();
            if !same_ref(
                get(layout, "associationRecord").unwrap_or(&Value::Null),
                assoc,
                &["module", "element"],
            ) || tables
                .get(&identity(assoc, &["module", "element"]))
                .map(String::as_str)
                != Some(carrier.as_str())
                || !same_ref(
                    get(layout, "associationKey").unwrap_or(&Value::Null),
                    assoc,
                    &["module", "element"],
                )
                || !keys.contains_key(&identity(
                    get(layout, "associationKey").unwrap_or(&Value::Null),
                    &["module", "element", "key"],
                ))
            {
                add_error(
                    &mut errors,
                    "ASSOCIATION",
                    &path,
                    "Association Record, table and stable Key must survive explicitly",
                );
            }
            let association = core.get(&identity(assoc, &["module", "element"])).copied();
            for member in arr(association.and_then(|a| get(a, "members"))).unwrap_or(&[]) {
                if core_field_layouts
                    .get(&identity(member, &["module", "element"]))
                    .is_none_or(|f| utf8(get(f, "table")).as_deref() != Some(carrier.as_str()))
                {
                    add_error(
                        &mut errors,
                        "ASSOCIATION_FIELD",
                        &path,
                        "Every association Record member must survive as a declared carrier column",
                    );
                }
            }
        } else if get(layout, "associationRecord").is_some()
            || get(layout, "associationKey").is_some()
        {
            add_error(
                &mut errors,
                "EXTRA",
                &path,
                "Policy cannot invent an association Record",
            );
        } else if storage != "foreign_key" && table_owners.contains_key(&carrier) {
            add_error(
                &mut errors,
                "TABLE",
                &path,
                "Anonymous carrier must not overwrite a bound Record table",
            );
        }
        let previous = carriers.entry(carrier.clone()).or_default();
        if previous.is_empty()
            && !table_owners.contains_key(&carrier)
            && !relation_names.insert(relation_identity(&carrier).unwrap_or_default())
        {
            add_error(
                &mut errors,
                "COLLISION",
                &(path.clone() + "/carrierTable"),
                "Anonymous carrier collides with an index relation",
            );
        }
        if !previous.is_empty()
            && storage != "foreign_key"
            && previous
                .iter()
                .any(|p| !eq(get(p, "storage"), "edge") || storage != "edge")
        {
            add_error(
                &mut errors,
                "COLLISION",
                &path,
                "Only edge layouts may share anonymous carrier tables",
            );
        }
        previous.push(layout);
        let mut occupied = HashSet::new();
        for (end, keyname, componentsname, constraintname) in [
            (
                "target",
                "targetKey",
                "targetComponents",
                "targetConstraint",
            ),
            (
                "source",
                "sourceKey",
                "sourceComponents",
                "sourceConstraint",
            ),
        ] {
            if end == "source" && storage == "foreign_key" {
                continue;
            }
            let key_ref = get(layout, keyname);
            let components = arr(get(layout, componentsname)).unwrap_or(&[]);
            let Some(key) = key_ref.and_then(|k| {
                keys.get(&identity(k, &["module", "element", "key"]))
                    .copied()
            }) else {
                if key_ref.is_some() {
                    add_error(
                        &mut errors,
                        "KEY",
                        &(path.clone() + "/" + keyname),
                        "Endpoint Key requires its exact explicit layout",
                    );
                }
                continue;
            };
            let cs = utf8(get(layout, constraintname)).unwrap_or_default();
            if !constraints.insert(format!("{}\u{1f}{}", carrier, cs)) {
                add_error(
                    &mut errors,
                    "COLLISION",
                    &(path.clone() + "/" + constraintname),
                    "Constraint name repeats within one table",
                );
            }
            if !safe_identifier(&cs) {
                add_error(
                    &mut errors,
                    "IDENTIFIER",
                    &(path.clone() + "/" + constraintname),
                    "Constraint name must be a safe PostgreSQL identifier",
                );
            }
            let kcomps = arr(get(key, "components")).unwrap_or(&[]);
            if components.len() != kcomps.len() {
                add_error(
                    &mut errors,
                    "COMPONENTS",
                    &(path.clone() + "/" + componentsname),
                    "Missing or extra endpoint components",
                );
            }
            for (ci, c) in components.iter().enumerate() {
                let at = format!("{path}/{componentsname}/{ci}");
                let kc = kcomps.get(ci);
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
                        &at,
                        "Endpoint components must preserve exact Key order and bound columns",
                    );
                }
                if kc.is_none_or(|kc| !type_same(kc, c)) {
                    add_error(&mut errors,"TYPE",&at,"Referencing SQL type and collation must exactly match the endpoint comparator");
                }
                let col = utf8(get(c, "carrierColumn")).unwrap_or_default();
                if !safe_identifier(&col)
                    || family(&utf8(get(c, "sqlType")).unwrap_or_default()).is_none()
                {
                    add_error(&mut errors, "SQL", &at, "Unsafe referencing column or type");
                }
                if !occupied.insert(col.clone()) {
                    add_error(
                        &mut errors,
                        "COLLISION",
                        &at,
                        "Endpoint carrier columns overlap",
                    );
                }
                if let Some(fieldref) = get(c, "carrierField") {
                    let f = bound_field_layouts
                        .get(&identity(fieldref, &["module", "element", "field"]));
                    if f.is_none_or(|f| {
                        utf8(get(f, "table")).as_deref() != Some(carrier.as_str())
                            || get(f, "column") != get(c, "carrierColumn")
                            || !type_same(f, c)
                            || get(f, "nullable") != get(c, "nullable")
                    }) {
                        add_error(&mut errors,"CARRIER",&at,"Referencing Field must match the exact bound carrier column/type/nullability");
                    }
                } else if storage == "foreign_key" || get(rel, "associationRecord").is_some() {
                    add_error(
                        &mut errors,
                        "CARRIER",
                        &at,
                        "A bound carrier Record requires an explicit referencing Field",
                    );
                }
                if matches!(get(c, "nullable"), Some(Value::Bool(true))) {
                    residuals.push(residual("policy",&format!("/relationshipLayouts/{i}/{end}Components/{ci}"),"PostgreSQL MATCH SIMPLE exempts composite references containing NULL; no authored participation guarantee",c,ctx)?);
                }
            }
        }
        if let Some(d) = get(layout, "discriminator") {
            let col = utf8(get(d, "column")).unwrap_or_default();
            if occupied.contains(&col) {
                add_error(
                    &mut errors,
                    "COLLISION",
                    &(path.clone() + "/discriminator"),
                    "Discriminator aliases an endpoint column",
                );
            }
        }
        for other in previous.iter().take(previous.len().saturating_sub(1)) {
            if storage == "edge" && eq(get(other, "storage"), "edge") {
                if !same_ref(
                    get(layout, "sourceKey").unwrap_or(&Value::Null),
                    get(other, "sourceKey").unwrap_or(&Value::Null),
                    &["module", "element", "key"],
                ) || !same_ref(
                    get(layout, "targetKey").unwrap_or(&Value::Null),
                    get(other, "targetKey").unwrap_or(&Value::Null),
                    &["module", "element", "key"],
                ) {
                    add_error(&mut errors,"EDGE_ENDPOINT",&path,"Shared edge FKs cannot switch endpoint Keys by discriminator; a separate conditional enforcement profile is required");
                }
                let shape = |l: &Value| {
                    let source = arr(get(l, "sourceComponents")).unwrap_or(&[]);
                    let target = arr(get(l, "targetComponents")).unwrap_or(&[]);
                    let columns = source
                        .iter()
                        .chain(target)
                        .map(|c| {
                            format!(
                                "{}:{}:{}:{:?}",
                                utf8(get(c, "carrierColumn")).unwrap_or_default(),
                                utf8(get(c, "sqlType")).unwrap_or_default(),
                                matches!(get(c, "nullable"), Some(Value::Bool(true))),
                                get(c, "collation")
                            )
                        })
                        .collect::<Vec<_>>()
                        .join("|");
                    format!(
                        "{columns}|{}",
                        utf8(get(
                            get(l, "discriminator").unwrap_or(&Value::Null),
                            "column"
                        ))
                        .unwrap_or_default()
                    )
                };
                if shape(layout) != shape(other)
                    || get(
                        get(layout, "discriminator").unwrap_or(&Value::Null),
                        "value",
                    ) == get(get(other, "discriminator").unwrap_or(&Value::Null), "value")
                {
                    add_error(&mut errors,"COLLISION",&path,"Shared edge layouts need identical column shapes and distinct discriminator values");
                }
            }
        }
        residuals.push(residual("logical",&logical_path,"Layout validation does not certify Key/relationship enforcement, participation bounds, lifecycle, inverse navigation or association semantics",rel,ctx)?);
    }
    for (i, choice) in bound_rels.iter().enumerate() {
        if eq(get(choice, "storage"), "inline") {
            residuals.push(residual(
                "binding",
                &format!("/extensions/umf.binding/relationships/{i}"),
                "PostgreSQL 17 inline relationship carrier is unsupported",
                choice,
                ctx,
            )?);
            continue;
        }
        if get(choice, "id").is_some() && !seen.contains(&identity(choice, &["module", "id"])) {
            add_error(
                &mut errors,
                "MISSING",
                &format!("/binding/extensions/umf.binding/relationships/{i}"),
                "Missing exact relationship layout",
            );
        }
    }
    for d in &ddd.diagnostics {
        if d.code
            .to_utf8()
            .is_ok_and(|code| code.starts_with("UNKNOWN_"))
        {
            if let Some(value) = pointer_value(&logical, &d.path) {
                let reason = d
                    .message
                    .to_utf8()
                    .map(|message| format!("Uninterpreted logical qualifier: {message}"))
                    .unwrap_or_else(|_| "Uninterpreted logical qualifier".to_owned());
                residuals.push(residual_path(
                    "logical",
                    d.path.clone(),
                    &reason,
                    value,
                    ctx,
                )?);
            }
        }
    }
    let blocked = !errors.is_empty() || (loss == "strict" && !residuals.is_empty());
    let candidate = if blocked {
        None
    } else {
        Some(copy_json(&raw, ctx)?)
    };
    make_result(
        logical, binding, raw, loss, errors, residuals, candidate, ctx,
    )
}
fn make_result(
    logical: Value,
    binding: Value,
    policy: Value,
    loss: &str,
    diagnostics: Vec<Value>,
    residuals: Vec<Value>,
    candidate: Option<Value>,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let status = if !diagnostics.is_empty() || loss == "strict" && !residuals.is_empty() {
        "blocked"
    } else if !residuals.is_empty() {
        "reported"
    } else {
        "validated"
    };
    let mut out = vec![
        ("operation", s("validate-postgresql-relationship-layout")),
        ("version", s("1.0.0")),
        ("status", s(status)),
        ("lossPolicy", s(loss)),
        ("logical", copy_json(&logical, ctx)?),
        ("binding", copy_json(&binding, ctx)?),
        ("policy", copy_json(&policy, ctx)?),
        ("diagnostics", Value::Array(diagnostics)),
        ("residuals", Value::Array(residuals)),
    ];
    if let Some(candidate) = candidate.filter(|_| status != "blocked") {
        out.push(("candidate", candidate));
    }
    Ok(obj(out))
}
