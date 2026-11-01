// SPDX-License-Identifier: MIT OR Apache-2.0
//! Loss-aware projection of an explicitly authored core relationship to SQL Server DDL.
use crate::{
    binding_inspection::{self, BindingInspectionResources},
    context::Context,
    engine::{Capabilities, Engine, ResourceSet, SemanticContext},
    error::{Diagnostic, EngineError},
    registry::Registry,
    serialization::{self, Format},
    value::{copy_json, Utf16, Value},
};
use std::sync::{Arc, OnceLock};

const CORE: &str = include_str!("../../../spec/core/schema.json");
const RESULT: &str =
    include_str!("../../../spec/core/relationship-sqlserver-projection.schema.json");
const REL_OP: &str = include_str!("../../../spec/core/relationship-operation.schema.json");
const RECOVERY: &str = "Verified retained receipt recovers logical and physical authoring and emitted SQL; native import does not infer intent";
struct Runtime {
    engine: Engine,
    registry: Registry,
}
struct NoCapabilities;
impl Capabilities for NoCapabilities {
    fn validate_extension(
        &mut self,
        _: u64,
        _: &Value,
        _: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        Ok(Vec::new())
    }
}
fn k(s: &str) -> Utf16 {
    Utf16::from(s)
}
fn s(s: &str) -> Value {
    Value::string_utf8(s)
}
fn obj(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(fields.into_iter().map(|(a, b)| (k(a), b)).collect())
}
fn get<'a>(v: &'a Value, n: &str) -> Option<&'a Value> {
    if let Value::Object(m) = v {
        m.iter().find(|(x, _)| x == &k(n)).map(|(_, v)| v)
    } else {
        None
    }
}
fn get_utf16<'a>(v: &'a Value, n: &Utf16) -> Option<&'a Value> {
    if let Value::Object(m) = v {
        m.iter().find(|(x, _)| x == n).map(|(_, v)| v)
    } else {
        None
    }
}
fn arr(v: Option<&Value>) -> &'_ [Value] {
    if let Some(Value::Array(a)) = v {
        a
    } else {
        &[]
    }
}
fn text(v: Option<&Value>) -> Option<&Utf16> {
    if let Some(Value::String(s)) = v {
        Some(s)
    } else {
        None
    }
}
fn string(v: Option<&Value>) -> Result<String, EngineError> {
    text(v)
        .ok_or_else(|| {
            err(
                "RELATIONSHIP_SQLSERVER_REQUEST",
                "Expected text",
                "/request",
            )
        })?
        .to_utf8()
        .map_err(|_| {
            err(
                "RELATIONSHIP_SQLSERVER_IDENTIFIER",
                "Invalid UTF-16 identifier",
                "/request",
            )
        })
}
fn eq(v: Option<&Value>, s: &str) -> bool {
    text(v).is_some_and(|x| x.units().iter().copied().eq(s.encode_utf16()))
}
fn err(code: &str, message: &str, path: &str) -> EngineError {
    EngineError::new(code, k(path), message)
}
fn parse(source: &str, c: &mut Context<'_>) -> Result<Value, EngineError> {
    serialization::read_json_value(&source.encode_utf16().collect::<Vec<_>>(), Format::Json, c)
}
fn runtime(c: &mut Context<'_>) -> Result<Arc<Runtime>, EngineError> {
    static CACHE: OnceLock<Arc<Runtime>> = OnceLock::new();
    if c.profile() == crate::context::ResourceProfile::Cooperative
        && c.limits() == crate::context::Limits::ordinary()
    {
        if let Some(v) = CACHE.get() {
            return Ok(v.clone());
        }
    }
    let engine = Engine::new(
        ResourceSet::new(
            parse(CORE, c)?,
            parse(
                include_str!("../../../spec/core/semantic-type-reference.schema.json"),
                c,
            )?,
            parse(
                include_str!("../../../spec/core/extension-package.schema.json"),
                c,
            )?,
            parse(
                include_str!("../../../spec/metamodel/generated/core-constraints.json"),
                c,
            )?,
            parse(
                include_str!("../../../spec/metamodel/generated/domain-policy.json"),
                c,
            )?,
        ),
        c,
    )?;
    let value = Arc::new(Runtime {
        engine,
        registry: Registry::new(),
    });
    if c.profile() == crate::context::ResourceProfile::Cooperative
        && c.limits() == crate::context::Limits::ordinary()
    {
        let _ = CACHE.set(value.clone());
    }
    Ok(value)
}
fn canonical(value: &Value, c: &mut Context<'_>) -> Result<Value, EngineError> {
    c.charge_work(1, Utf16::default())?;
    match value {
        Value::Array(xs) => {
            c.charge_work(xs.len(), Utf16::default())?;
            Ok(Value::Array(
                xs.iter()
                    .map(|v| canonical(v, c))
                    .collect::<Result<_, _>>()?,
            ))
        }
        Value::Object(xs) => {
            let n = xs.len();
            let sort_work =
                n.saturating_mul((usize::BITS - usize::max(n, 1).leading_zeros()) as usize);
            let max = xs.iter().map(|(key, _)| key.len()).max().unwrap_or(0);
            c.charge_work(
                n.saturating_add(sort_work)
                    .saturating_add(sort_work.saturating_mul(max)),
                Utf16::default(),
            )?;
            let mut out = Vec::with_capacity(n);
            for (key, v) in xs {
                c.charge_work(key.len(), Utf16::default())?;
                out.push((key.clone(), canonical(v, c)?));
            }
            out.sort_by(|a, b| a.0.cmp(&b.0));
            Ok(Value::Object(out))
        }
        Value::String(x) => {
            c.charge_work(x.len(), Utf16::default())?;
            Ok(Value::String(x.clone()))
        }
        _ => Ok(value.clone()),
    }
}
fn equal(a: &Value, b: &Value, c: &mut Context<'_>) -> Result<bool, EngineError> {
    Ok(canonical(a, c)? == canonical(b, c)?)
}
fn validate_schema(
    v: &Value,
    schema: &Value,
    rt: &Runtime,
    c: &mut Context<'_>,
    code: &str,
) -> Result<(), EngineError> {
    let mut resources = rt.engine.schema_resources_with_context(c)?;
    resources.entries.push((
        k("urn:umf:core:relationship-operation:1.0.0"),
        parse(REL_OP, c)?,
    ));
    let compiled = crate::schema::CompiledSchema::compile(schema, &resources, c)?;
    if compiled.validate_codegen_errors(v, c)?.is_empty() {
        Ok(())
    } else {
        Err(err(
            code,
            "Value does not match the pinned projection schema",
            "",
        ))
    }
}
fn quote(v: &str) -> Result<String, EngineError> {
    if v.is_empty()
        || v.encode_utf16().count() > 128
        || v.contains('\0')
        || v.trim() != v
        || v.starts_with('#')
    {
        return Err(err(
            "RELATIONSHIP_SQLSERVER_IDENTIFIER",
            "Invalid or truncated SQL Server identifier",
            "/request",
        ));
    }
    Ok(format!("[{}]", v.replace(']', "]]")))
}
fn fold(v: &str) -> String {
    v.to_uppercase()
}
fn id(v: &Value) -> Option<(Utf16, Utf16)> {
    Some((
        text(get(v, "module"))?.clone(),
        text(get(v, "element"))?.clone(),
    ))
}
fn same_id(a: &Value, b: &Value) -> bool {
    id(a) == id(b)
}
fn pair_id(a: &Utf16, b: &Utf16) -> String {
    format!(
        "{}\u{1f}{}",
        a.units()
            .iter()
            .map(|u| format!("{u:04x}"))
            .collect::<String>(),
        b.units()
            .iter()
            .map(|u| format!("{u:04x}"))
            .collect::<String>()
    )
}
fn locate(
    source: &Value,
    reference: &Value,
    c: &mut Context<'_>,
) -> Result<(Value, String), EngineError> {
    let (module, element) = id(reference).ok_or_else(|| {
        err(
            "RELATIONSHIP_SQLSERVER_REFERENCE",
            "Malformed endpoint identity",
            "/request",
        )
    })?;
    for (mi, m) in arr(get(source, "modules")).iter().enumerate() {
        if text(get(m, "id")) == Some(&module) {
            for (ei, e) in arr(get(m, "elements")).iter().enumerate() {
                if text(get(e, "id")) == Some(&element) {
                    return Ok((copy_json(e, c)?, format!("/modules/{mi}/elements/{ei}")));
                }
            }
        }
    }
    Err(err(
        "RELATIONSHIP_SQLSERVER_REFERENCE",
        "Unresolved logical element",
        "/request",
    ))
}
fn key_components<'a>(record: &'a Value, key_id: &Utf16) -> Option<&'a [Value]> {
    arr(get(record, "keys"))
        .iter()
        .find(|key| text(get(key, "id")) == Some(key_id))
        .and_then(|key| match get(key, "fields") {
            Some(Value::Array(xs)) => Some(xs.as_slice()),
            _ => None,
        })
}
fn pointer_value<'a>(source: &'a Value, path: &Utf16) -> Option<&'a Value> {
    let units = path.units();
    if units.first() != Some(&(b'/' as u16)) {
        return None;
    }
    let mut value = source;
    for encoded in units[1..].split(|unit| *unit == b'/' as u16) {
        let mut decoded = Vec::with_capacity(encoded.len());
        let mut i = 0;
        while i < encoded.len() {
            if encoded[i] == b'~' as u16 && i + 1 < encoded.len() {
                match encoded[i + 1] {
                    x if x == b'0' as u16 => {
                        decoded.push(b'~' as u16);
                        i += 2;
                    }
                    x if x == b'1' as u16 => {
                        decoded.push(b'/' as u16);
                        i += 2;
                    }
                    _ => {
                        decoded.push(encoded[i]);
                        i += 1;
                    }
                }
            } else {
                decoded.push(encoded[i]);
                i += 1;
            }
        }
        let segment = Utf16::new(decoded);
        value = match value {
            Value::Object(_) => get_utf16(value, &segment)?,
            Value::Array(items) => {
                let index = segment.to_utf8().ok()?;
                if index.is_empty()
                    || (index.len() > 1 && index.starts_with('0'))
                    || !index.bytes().all(|b| b.is_ascii_digit())
                {
                    return None;
                }
                items.get(index.parse::<usize>().ok()?)?
            }
            _ => return None,
        };
    }
    Some(value)
}
fn residual(
    path: &str,
    value: &Value,
    reason: &str,
    outcome: &str,
    c: &mut Context<'_>,
) -> Result<Value, EngineError> {
    residual_utf16(&Utf16::from(path), value, reason, outcome, c)
}
fn residual_utf16(
    path: &Utf16,
    value: &Value,
    reason: &str,
    outcome: &str,
    c: &mut Context<'_>,
) -> Result<Value, EngineError> {
    Ok(obj(vec![
        ("path", Value::String(path.clone())),
        ("value", copy_json(value, c)?),
        ("reason", s(reason)),
        ("outcome", s(outcome)),
        ("recovery", s(RECOVERY)),
    ]))
}
fn set(v: &mut Value, name: &str, value: Value) -> Result<(), EngineError> {
    let Value::Object(m) = v else {
        return Err(err("RELATIONSHIP_SQLSERVER_RESULT", "Expected object", ""));
    };
    if let Some((_, old)) = m.iter_mut().find(|(k, _)| k == &Utf16::from(name)) {
        *old = value
    } else {
        m.push((k(name), value));
    }
    Ok(())
}

fn project_inner(
    source_in: &Value,
    author_in: &Value,
    binding_in: &Value,
    request_in: &Value,
    rt: &Runtime,
    c: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let source = copy_json(source_in, c)?;
    let author = copy_json(author_in, c)?;
    let binding_source = copy_json(binding_in, c)?;
    let request = copy_json(request_in, c)?;
    let schema = parse(RESULT, c)?;
    let req_schema = get(get(&schema, "properties").unwrap(), "request").unwrap();
    validate_schema(
        &request,
        req_schema,
        rt,
        c,
        "RELATIONSHIP_SQLSERVER_REQUEST",
    )?;
    let validation = rt
        .engine
        .validate_document(&source, &rt.registry, &mut NoCapabilities, c)?;
    if !validation.valid || text(get(&source, "umf")).is_none_or(|x| x != &k("0.10.0")) {
        return Err(err(
            "RELATIONSHIP_SQLSERVER_SOURCE",
            "Valid core 0.10.0 required",
            "",
        ));
    }
    if !eq(get(&author, "operation"), "declare-core-relationship") {
        return Err(err(
            "RELATIONSHIP_SQLSERVER_AUTHOR",
            "Explicit relationship declaration required",
            "/author",
        ));
    }
    let author_target = get(&author, "target").ok_or_else(|| {
        err(
            "RELATIONSHIP_SQLSERVER_AUTHOR",
            "Author target required",
            "/author/target",
        )
    })?;
    crate::core_relationships::verify_core_relationship_operation(
        &author,
        author_target,
        &rt.engine,
        &rt.registry,
        &mut NoCapabilities,
        c,
    )?;
    let relation_id = get(&request, "relationship").unwrap();
    let current = crate::core_relationships::lookup_core_relationship(
        &source,
        relation_id,
        &rt.engine,
        &rt.registry,
        &mut NoCapabilities,
        c,
    )?;
    let prior = crate::core_relationships::lookup_core_relationship(
        author_target,
        relation_id,
        &rt.engine,
        &rt.registry,
        &mut NoCapabilities,
        c,
    )?;
    if text(get(&author, "identity").and_then(|x| get(x, "module")))
        != text(get(relation_id, "module"))
        || text(get(&author, "request").and_then(|x| get(x, "id"))) != text(get(relation_id, "id"))
        || text(get(author_target, "id")) != text(get(&source, "id"))
    {
        return Err(err(
            "RELATIONSHIP_SQLSERVER_AUTHOR",
            "Mismatched author identity",
            "/author",
        ));
    }
    let rel = get(&current, "relationship").ok_or_else(|| {
        err(
            "RELATIONSHIP_SQLSERVER_AUTHOR",
            "Resolved relationship missing",
            "/author",
        )
    })?;
    if !equal(rel, get(&prior, "relationship").unwrap(), c)? {
        return Err(err(
            "RELATIONSHIP_SQLSERVER_STALE",
            "Relationship changed since authoring",
            "/author",
        ));
    }
    let source_end = arr(get(rel, "source"));
    let target_end = arr(get(rel, "target"));
    for endpoint in source_end
        .iter()
        .chain(target_end)
        .chain(get(rel, "associationRecord").into_iter())
    {
        let (now, _) = locate(&source, endpoint, c)?;
        let (old, _) = locate(author_target, endpoint, c)?;
        if !equal(&now, &old, c)? {
            return Err(err(
                "RELATIONSHIP_SQLSERVER_STALE",
                "Endpoint changed since authoring",
                "/author",
            ));
        }
        for member in arr(get(&now, "members")) {
            let (a, _) = locate(&source, member, c)?;
            let (b, _) = locate(author_target, member, c)?;
            if !equal(&a, &b, c)? {
                return Err(err(
                    "RELATIONSHIP_SQLSERVER_STALE",
                    "Endpoint component changed",
                    "/author",
                ));
            }
        }
    }
    let binding_resources = BindingInspectionResources::new(c)?;
    let inspected =
        binding_inspection::inspect_binding(&binding_resources, &binding_source, &source, c)?;
    if !inspected.valid {
        return Err(err(
            "BINDING_DOCUMENT",
            "Binding document failed validation",
            "/bindingSource",
        ));
    }
    if eq(
        get(&binding_source, "vocabularies")
            .and_then(|v| get(v, "umf.binding"))
            .and_then(|v| get(v, "version")),
        "0.3.0",
    ) {
        return Err(err(
            "BINDING_PROFILE",
            "Legacy native generators do not admit scalar-carrier bindings",
            "/bindingSource",
        ));
    }
    if !eq(
        get(&binding_source, "vocabularies")
            .and_then(|v| get(v, "umf.binding"))
            .and_then(|v| get(v, "version")),
        "0.2.0",
    ) {
        return Err(err(
            "RELATIONSHIP_SQLSERVER_BINDING",
            "Explicit stable SQL Server 16.0.4295.3 binding required",
            "/bindingSource",
        ));
    }
    let physical = get(&binding_source, "extensions")
        .and_then(|x| get(x, "umf.binding"))
        .ok_or_else(|| {
            err(
                "RELATIONSHIP_SQLSERVER_BINDING",
                "Binding payload missing",
                "/bindingSource",
            )
        })?;
    if !eq(get(physical, "profile"), "umf-binding-2")
        || !eq(
            get(physical, "target").and_then(|x| get(x, "system")),
            "sqlserver",
        )
        || !eq(
            get(physical, "target").and_then(|x| get(x, "version")),
            "16.0.4295.3",
        )
    {
        return Err(err(
            "RELATIONSHIP_SQLSERVER_BINDING",
            "Explicit stable SQL Server binding required",
            "/bindingSource",
        ));
    }
    let layout = arr(get(physical, "relationships"))
        .iter()
        .find(|r| {
            text(get(r, "module")) == text(get(relation_id, "module"))
                && text(get(r, "id")) == text(get(relation_id, "id"))
        })
        .ok_or_else(|| {
            err(
                "RELATIONSHIP_SQLSERVER_BINDING",
                "Missing exact stable relationship storage choice",
                "/bindingSource",
            )
        })?;
    let mut residuals = Vec::new();
    let mut mappings = Vec::new();
    let mut impossible = false;
    for (i, index) in arr(get(physical, "indexes")).iter().enumerate() {
        residuals.push(residual(
            &format!("/bindingSource/extensions/umf.binding/indexes/{i}"),
            index,
            "Index declaration is outside this relationship-only generator",
            "not-expressible",
            c,
        )?);
    }
    residuals.push(residual("/source",&source,"Only selected endpoint-key tables and relationship storage are emitted; other Fields, Keys, relationships and unknown native content remain retained","not-expressible",c)?);
    residuals.push(residual("/bindingSource",&binding_source,"Only selected table/Key-column names and relationship storage are interpreted; all other indexes, layout choices and unknown qualifiers remain retained","not-expressible",c)?);
    macro_rules! block {
        ($path:expr,$value:expr,$reason:expr) => {{
            impossible = true;
            residuals.push(residual($path, $value, $reason, "not-expressible", c)?);
            Ok::<(), EngineError>(())
        }};
    }
    for key in [
        "id",
        "name",
        "source",
        "target",
        "sourceMultiplicity",
        "targetMultiplicity",
        "targetLifecycle",
        "directed",
        "inverse",
        "associationRecord",
    ] {
        if let Some(value) = get(rel, key) {
            let mut path = text(get(&current, "path"))
                .ok_or_else(|| {
                    err(
                        "RELATIONSHIP_SQLSERVER_PATH",
                        "Resolved relationship path is missing",
                        "/author",
                    )
                })?
                .units()
                .to_vec();
            path.push(b'/' as u16);
            path.extend(key.encode_utf16());
            residuals.push(residual_utf16(&Utf16::new(path),value,"Stored-value constraints only approximate authored record participation; native naming, lifecycle, minimum participation and presentation never establish complete authored meaning","not-expressible",c)?);
        }
    }
    for path_value in arr(get(&current, "uninterpretedPaths")) {
        let path = text(Some(path_value)).ok_or_else(|| {
            err(
                "RELATIONSHIP_SQLSERVER_PATH",
                "Invalid unknown-content path",
                "/source",
            )
        })?;
        let value = pointer_value(&source, path).ok_or_else(|| {
            err(
                "RELATIONSHIP_SQLSERVER_PATH",
                "Unresolved unknown-content path",
                "/source",
            )
        })?;
        residuals.push(residual_utf16(
            path,
            value,
            "Unknown logical qualifier remains uninterpreted",
            "unknown",
            c,
        )?);
    }
    if source_end.len() != 1 || target_end.len() != 1 {
        block!(
            "/request/relationship",
            rel,
            "Heterogeneous endpoint sets need an explicit discriminator profile"
        )?;
    }
    if get(rel, "associationRecord").is_some() {
        block!("/request/relationship/associationRecord",get(rel,"associationRecord").unwrap(),"Separately keyed association attributes and identity require an explicit association layout; bare junction is refused")?;
    }
    let storage = string(get(layout, "storage"))?;
    if storage != "foreign_key" && storage != "junction" {
        block!(
            "/bindingSource/relationships",
            layout,
            "Only FK and junction storage are qualified"
        )?;
    }
    if storage == "foreign_key"
        && !(matches!(get(rel,"targetMultiplicity").and_then(|x|get(x,"max")),Some(Value::Number(n)) if *n<=1.0))
    {
        block!(
            "/request/relationship/targetMultiplicity",
            get(rel, "targetMultiplicity").unwrap(),
            "One FK tuple cannot carry multiple distinct targets"
        )?;
    }
    let junction = get(&request, "junction");
    if (storage == "junction") != junction.is_some() {
        block!(
            "/request/junction",
            &request,
            "Junction policy must match declared storage"
        )?;
    }
    let src = source_end.first().ok_or_else(|| {
        err(
            "RELATIONSHIP_SQLSERVER_AUTHOR",
            "Source endpoint missing",
            "/author",
        )
    })?;
    let tgt = target_end.first().ok_or_else(|| {
        err(
            "RELATIONSHIP_SQLSERVER_AUTHOR",
            "Target endpoint missing",
            "/author",
        )
    })?;
    let self_ref = same_id(src, tgt);
    let table_for = |endpoint: &Value| -> Result<String, EngineError> {
        let Some((module, element)) = id(endpoint) else {
            return Err(err(
                "RELATIONSHIP_SQLSERVER_BINDING",
                "Malformed endpoint",
                "/bindingSource",
            ));
        };
        let row = arr(get(physical, "elements"))
            .iter()
            .find(|r| {
                text(get(r, "module")) == Some(&module) && text(get(r, "element")) == Some(&element)
            })
            .ok_or_else(|| {
                err(
                    "RELATIONSHIP_SQLSERVER_BINDING",
                    "Every endpoint needs explicit table name",
                    "/bindingSource",
                )
            })?;
        string(get(row, "table"))
    };
    let source_table = table_for(src)?;
    let target_table = table_for(tgt)?;
    let namespace = string(get(&request, "namespace"))?;
    for name in [
        &namespace,
        &source_table,
        &target_table,
        &string(get(&request, "constraintName"))?,
        &string(get(get(&request, "sourceKey").unwrap(), "constraintName"))?,
        &string(get(get(&request, "targetKey").unwrap(), "constraintName"))?,
    ] {
        quote(name)?;
    }
    let source_key = get(&request, "sourceKey").unwrap();
    let target_key = get(&request, "targetKey").unwrap();
    if !self_ref && fold(&source_table) == fold(&target_table) {
        block!(
            "/bindingSource/elements",
            arr(get(physical, "elements"))
                .first()
                .unwrap_or(&Value::Null),
            "Different endpoint Records cannot share this new-table profile"
        )?;
    }
    if self_ref && !equal(source_key, target_key, c)? {
        block!(
            "/request",
            &request,
            "Self-reference requires the same explicitly mapped source/target Key"
        )?;
    }
    let validate_key = |endpoint: &Value,
                        key: &Value,
                        expected: Option<&Utf16>,
                        c: &mut Context<'_>,
                        residuals: &mut Vec<Value>,
                        impossible: &mut bool|
     -> Result<Vec<String>, EngineError> {
        let (record, path) = locate(&source, endpoint, c)?;
        let kid = text(get(key, "keyId")).ok_or_else(|| {
            err(
                "RELATIONSHIP_SQLSERVER_REQUEST",
                "Key ID required",
                "/request",
            )
        })?;
        let components = key_components(&record, kid);
        let columns = arr(get(key, "columns"));
        let mut aligned = components.is_some()
            && expected.is_none_or(|x| x == kid)
            && components.is_some_and(|parts| parts.len() == columns.len());
        if aligned {
            for (a, b) in components.unwrap().iter().zip(columns) {
                if !equal(a, get(b, "field").unwrap_or(&Value::Null), c)? {
                    aligned = false;
                    break;
                }
            }
        }
        if !aligned {
            *impossible = true;
            residuals.push(residual(
                "/request",
                key,
                "Ordered Key components must match the selected stable Key ID",
                "not-expressible",
                c,
            )?);
            return Ok(Vec::new());
        }
        let mut names = Vec::new();
        let mut norm = std::collections::HashSet::new();
        for col in columns {
            let name = string(get(col, "name"))?;
            quote(&name)?;
            if !norm.insert(fold(&name)) {
                *impossible = true;
                residuals.push(residual(
                    "/request",
                    key,
                    "Duplicate physical component names",
                    "not-expressible",
                    c,
                )?);
            }
            names.push(name.clone());
            let field = get(col, "field").unwrap();
            let (element, field_path) = locate(&source, field, c)?;
            let fid = id(field).unwrap();
            let bound = arr(get(physical, "fields")).iter().find(|f| {
                text(get(f, "module")) == Some(&fid.0)
                    && text(get(f, "element")) == Some(&fid.1)
                    && get(f, "field").is_none()
            });
            if bound.is_none_or(|b| {
                !eq(get(b, "storage"), "column")
                    || text(get(b, "column"))
                        .and_then(|x| x.to_utf8().ok())
                        .as_deref()
                        != Some(name.as_str())
            }) {
                *impossible = true;
                residuals.push(residual(
                    "/bindingSource/fields",
                    col,
                    "Key component needs the same explicit direct-column binding",
                    "not-expressible",
                    c,
                )?);
            }
            let nt = string(get(col, "nativeType"))?;
            let expected_type = if nt == "bit" { "boolean" } else { "integer" };
            if !eq(get(&element, "kind"), "field")
                || !eq(get(&element, "cardinality"), "one")
                || !eq(get(&element, "nullability"), "required")
                || !eq(get(&element, "scalarType"), expected_type)
                || get(&element, "itemType").is_some()
                || arr(get(&element, "references"))
                    .iter()
                    .any(|r| eq(get(r, "role"), "record-type"))
            {
                *impossible = true;
                residuals.push(residual(
                    &field_path,
                    &element,
                    "This profile qualifies required scalar integral/boolean Key Fields only",
                    "unknown",
                    c,
                )?);
            } else {
                residuals.push(residual(&field_path,&element,"Native type has finite range and input coercions; facets and unknown domain refinements remain retained","unknown",c)?);
            }
        }
        Ok(names)
    };
    let source_names = validate_key(src, source_key, None, c, &mut residuals, &mut impossible)?;
    let target_names = validate_key(
        tgt,
        target_key,
        text(get(tgt, "key")),
        c,
        &mut residuals,
        &mut impossible,
    )?;
    let refs = arr(get(&request, "referenceColumns"))
        .iter()
        .map(|v| string(Some(v)))
        .collect::<Result<Vec<_>, _>>()?;
    let mut reference_names = std::collections::HashSet::new();
    for n in &refs {
        quote(n)?;
        if !reference_names.insert(fold(n)) {
            block!(
                "/request/referenceColumns",
                &request,
                "Physical names collide"
            )?;
        }
    }
    if refs.len() != target_names.len() {
        block!(
            "/request/referenceColumns",
            get(&request, "referenceColumns").unwrap(),
            "One reference column per target Key component required"
        )?;
    }
    let mut constraints = vec![string(get(source_key, "constraintName"))?];
    if !self_ref {
        constraints.push(string(get(target_key, "constraintName"))?);
    }
    constraints.push(string(get(&request, "constraintName"))?);
    if let Some(j) = junction {
        constraints.push(string(get(j, "sourceConstraintName"))?);
        constraints.push(string(get(j, "pairConstraintName"))?);
    }
    let mut constraint_names = std::collections::HashSet::new();
    for n in &constraints {
        quote(n)?;
        if !constraint_names.insert(fold(n)) {
            block!("/request", &request, "Physical names collide")?;
        }
    }
    let mut table_names = vec![source_table.clone(), target_table.clone()];
    if let Some(j) = junction {
        table_names.push(string(get(j, "tableName"))?);
    }
    if constraints
        .iter()
        .any(|name| table_names.iter().any(|table| fold(table) == fold(name)))
    {
        block!(
            "/request",
            &request,
            "Constraint and table names share the schema object namespace"
        )?;
    }
    let source_max = get(rel, "sourceMultiplicity").and_then(|x| get(x, "max"));
    if storage == "foreign_key" && matches!(source_max,Some(Value::Number(n))if *n<=1.0) {
        let reverse = format!("{}_reverse", string(get(&request, "constraintName"))?);
        quote(&reverse)?;
        if fold(&reverse) == fold(&string(get(source_key, "constraintName"))?) {
            block!(
                "/request",
                &request,
                "Generated reverse index collides with the source Key index"
            )?;
        }
    }
    let qname = |n: &str| -> Result<String, EngineError> { quote(n) };
    let tuple = |names: &[String]| -> Result<String, EngineError> {
        names
            .iter()
            .map(|x| qname(x))
            .collect::<Result<Vec<_>, _>>()
            .map(|x| x.join(", "))
    };
    let create = |name: &str, defs: Vec<String>| -> Result<String, EngineError> {
        Ok(format!(
            "CREATE TABLE {}.{} (\n  {}\n);",
            qname(&namespace)?,
            qname(name)?,
            defs.join(",\n  ")
        ))
    };
    let cols =
        |key: &Value, names: &[String], nullable: bool| -> Result<Vec<String>, EngineError> {
            arr(get(key, "columns"))
                .iter()
                .enumerate()
                .map(|(i, c)| {
                    Ok(format!(
                        "{} {} {}",
                        qname(names.get(i).map(String::as_str).unwrap_or("__missing"))?,
                        string(get(c, "nativeType"))?,
                        if nullable { "NULL" } else { "NOT NULL" }
                    ))
                })
                .collect()
        };
    let key_constraint = |key: &Value,
                          endpoint: &Value,
                          names: &[String],
                          c: &mut Context<'_>|
     -> Result<String, EngineError> {
        let (record, _) = locate(&source, endpoint, c)?;
        let kid = text(get(key, "keyId")).unwrap();
        let primary = arr(get(&record, "keys"))
            .iter()
            .find(|x| text(get(x, "id")) == Some(kid))
            .is_some_and(|x| matches!(get(x, "primary"), Some(Value::Bool(true))));
        Ok(format!(
            "CONSTRAINT {} {} ({})",
            qname(&string(get(key, "constraintName"))?)?,
            if primary { "PRIMARY KEY" } else { "UNIQUE" },
            tuple(names)?
        ))
    };
    let nullable = matches!(get(rel,"targetMultiplicity").and_then(|x|get(x,"min")),Some(Value::Number(n)) if *n==0.0);
    let action = |x: &str| x.replace('_', " ");
    let delete = string(get(&request, "deleteAction"))?;
    let update = string(get(&request, "updateAction"))?;
    if (delete == "SET_NULL" || update == "SET_NULL") && (storage != "foreign_key" || !nullable) {
        block!(
            "/request",
            &request,
            "SET NULL requires an optional FK tuple"
        )?;
    }
    if self_ref && (delete != "NO_ACTION" || update != "NO_ACTION") {
        block!(
            "/request",
            &request,
            "Self cascades are outside this qualified profile"
        )?;
    }
    let fk = |name: &str,
              from: &[String],
              to: &str,
              key: &Value,
              target_names: &[String],
              actions: bool|
     -> Result<String, EngineError> {
        let target_tuple = tuple(target_names)?;
        Ok(format!(
            "CONSTRAINT {} FOREIGN KEY ({}) REFERENCES {}.{} ({}){}",
            qname(name)?,
            tuple(from)?,
            qname(&namespace)?,
            qname(to)?,
            target_tuple,
            if actions {
                format!(
                    " ON DELETE {} ON UPDATE {}",
                    action(&delete),
                    action(&update)
                )
            } else {
                String::new()
            }
        ))
    };
    let mut ddl = Vec::new();
    if !self_ref {
        let mut defs = cols(target_key, &target_names, false)?;
        defs.push(key_constraint(target_key, tgt, &target_names, c)?);
        ddl.push(create(&target_table, defs)?);
    }
    let mut source_defs = cols(source_key, &source_names, false)?;
    source_defs.push(key_constraint(source_key, src, &source_names, c)?);
    if storage == "foreign_key" {
        let mut used = std::collections::HashSet::new();
        for n in source_names.iter().chain(&refs) {
            if !used.insert(fold(n)) {
                block!(
                    "/request/referenceColumns",
                    &request,
                    "Physical names collide"
                )?;
            }
        }
        source_defs.extend(cols(target_key, &refs, nullable)?);
        source_defs.push(fk(
            &string(get(&request, "constraintName"))?,
            &refs,
            &target_table,
            target_key,
            &target_names,
            true,
        )?);
        if nullable && refs.len() > 1 {
            let nulls = refs
                .iter()
                .map(|n| Ok(format!("{} IS NULL", qname(n)?)))
                .collect::<Result<Vec<_>, EngineError>>()?
                .join(" AND ");
            let nonnull = refs
                .iter()
                .map(|n| Ok(format!("{} IS NOT NULL", qname(n)?)))
                .collect::<Result<Vec<_>, EngineError>>()?
                .join(" AND ");
            source_defs.push(format!("CHECK (({nulls}) OR ({nonnull}))"));
        }
        ddl.push(create(&source_table, source_defs)?);
        if matches!(source_max,Some(Value::Number(n)) if *n<=1.0) {
            let reverse = format!("{}_reverse", string(get(&request, "constraintName"))?);
            ddl.push(format!(
                "CREATE UNIQUE INDEX {} ON {}.{} ({}){};",
                qname(&reverse)?,
                qname(&namespace)?,
                qname(&source_table)?,
                tuple(&refs)?,
                if nullable {
                    format!(" WHERE {} IS NOT NULL", qname(refs.first().unwrap())?)
                } else {
                    String::new()
                }
            ));
        }
    } else if storage == "junction" && junction.is_some() {
        let j = junction.unwrap();
        let jname = string(get(j, "tableName"))?;
        if fold(&jname) == fold(&source_table) || fold(&jname) == fold(&target_table) {
            block!(
                "/request/junction",
                j,
                "Junction table must be separate from endpoints"
            )?;
        }
        let source_columns = arr(get(j, "sourceColumns"))
            .iter()
            .map(|x| string(Some(x)))
            .collect::<Result<Vec<_>, _>>()?;
        if source_columns.len() != source_names.len() {
            block!(
                "/request/junction",
                j,
                "One source join column per source Key component required"
            )?;
        }
        let mut u = std::collections::HashSet::new();
        for n in source_columns.iter().chain(&refs) {
            quote(n)?;
            if !u.insert(fold(n)) {
                block!("/request/junction", j, "Physical names collide")?;
            }
        }
        if delete != "NO_ACTION" || update != "NO_ACTION" {
            block!(
                "/request",
                &request,
                "Junction cascades require a separately qualified multiple-path policy"
            )?;
        }
        ddl.push(create(&source_table, source_defs)?);
        let mut defs = cols(source_key, &source_columns, false)?;
        defs.extend(cols(target_key, &refs, false)?);
        defs.push(format!(
            "CONSTRAINT {} PRIMARY KEY ({})",
            qname(&string(get(j, "pairConstraintName"))?)?,
            tuple(
                &source_columns
                    .iter()
                    .chain(&refs)
                    .cloned()
                    .collect::<Vec<_>>()
            )?
        ));
        defs.push(fk(
            &string(get(j, "sourceConstraintName"))?,
            &source_columns,
            &source_table,
            source_key,
            &source_names,
            false,
        )?);
        defs.push(fk(
            &string(get(&request, "constraintName"))?,
            &refs,
            &target_table,
            target_key,
            &target_names,
            false,
        )?);
        if matches!(get(rel,"targetMultiplicity").and_then(|x|get(x,"max")),Some(Value::Number(n))if *n<=1.0)
        {
            defs.push(format!("UNIQUE ({})", tuple(&source_columns)?));
        }
        if matches!(source_max,Some(Value::Number(n))if *n<=1.0) {
            defs.push(format!("UNIQUE ({})", tuple(&refs)?));
        }
        ddl.push(create(&jname, defs)?);
    }
    let binding_const=obj(vec![("id",s("umf.sqlserver.relationships")),("version",s("1.0.0")),("nativeVersion",s("16.0.4295.3")),("subset",s("SQL Server 2022 captured FK observations and authored integral-key FK/junction new tables; no lifecycle/minimum or native equivalence inference"))]);
    if impossible || eq(get(&request, "mode"), "strict") {
        let mut result = obj(vec![
            ("operation", s("project-relationship-sqlserver")),
            ("version", s("1.0.0")),
            ("status", s("blocked")),
            ("source", source),
            ("author", author),
            ("bindingSource", binding_source),
            ("request", request),
            ("binding", binding_const),
            ("mappings", Value::Array(Vec::new())),
            ("residuals", Value::Array(residuals)),
            ("diagnostics", Value::Array(Vec::new())),
        ]);
        diagnostics(&mut result, c)?;
        validate_schema(&result, &schema, rt, c, "RELATIONSHIP_SQLSERVER_RESULT")?;
        return Ok(result);
    }
    let sql = ddl.join("\n") + "\n";
    mappings.push(obj(vec![
        (
            "idealPath",
            get(&current, "path").cloned().unwrap_or(Value::Null),
        ),
        (
            "nativePath",
            s(&format!(
                "/constraints/{}",
                string(get(&request, "constraintName"))?
            )),
        ),
        ("storage", s(&storage)),
        (
            "targetKey",
            get(target_key, "keyId").cloned().unwrap_or(Value::Null),
        ),
        (
            "sourceKey",
            get(source_key, "keyId").cloned().unwrap_or(Value::Null),
        ),
        ("enforcement", s("enabled-trusted-stored-values")),
        ("outcome", s("approximated")),
    ]));
    let mut result = obj(vec![
        ("operation", s("project-relationship-sqlserver")),
        ("version", s("1.0.0")),
        ("status", s("projected")),
        ("source", source),
        ("author", author),
        ("bindingSource", binding_source),
        ("request", request),
        ("binding", binding_const),
        (
            "target",
            obj(vec![("format", s("sqlserver-ddl")), ("sql", s(&sql))]),
        ),
        ("mappings", Value::Array(mappings)),
        ("residuals", Value::Array(residuals)),
        ("diagnostics", Value::Array(Vec::new())),
    ]);
    diagnostics(&mut result, c)?;
    validate_schema(&result, &schema, rt, c, "RELATIONSHIP_SQLSERVER_RESULT")?;
    Ok(result)
}
fn diagnostics(result: &mut Value, c: &mut Context<'_>) -> Result<(), EngineError> {
    let blocked = eq(get(result, "status"), "blocked");
    let rows = arr(get(result, "residuals"))
        .iter()
        .map(|row| {
            obj(vec![
                ("code", s("RELATIONSHIP_SQLSERVER_RESIDUAL")),
                ("path", get(row, "path").cloned().unwrap_or(Value::Null)),
                (
                    "message",
                    get(row, "reason").cloned().unwrap_or(Value::Null),
                ),
                ("severity", s(if blocked { "error" } else { "warning" })),
            ])
        })
        .collect();
    set(result, "diagnostics", Value::Array(rows))?;
    let _ = c;
    Ok(())
}
pub fn project_relationship_to_sqlserver(
    source: &Value,
    author: &Value,
    binding: &Value,
    request: &Value,
    c: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(c)?;
    project_inner(source, author, binding, request, &rt, c)
}
fn verify(receipt: &Value, current: &Value, c: &mut Context<'_>) -> Result<Value, EngineError> {
    let rt = runtime(c)?;
    let schema = parse(RESULT, c)?;
    validate_schema(receipt, &schema, &rt, c, "RELATIONSHIP_SQLSERVER_RECEIPT")?;
    if !eq(get(receipt, "status"), "projected") {
        return Err(err(
            "RELATIONSHIP_SQLSERVER_RECEIPT",
            "Successful projection receipt required",
            "",
        ));
    }
    let rerun = project_inner(
        get(receipt, "source").unwrap(),
        get(receipt, "author").unwrap(),
        get(receipt, "bindingSource").unwrap(),
        get(receipt, "request").unwrap(),
        &rt,
        c,
    )?;
    if !equal(receipt, &rerun, c)? || !equal(current, get(receipt, "target").unwrap(), c)? {
        return Err(err(
            "RELATIONSHIP_SQLSERVER_STALE",
            "SQL target or retained inputs changed",
            "",
        ));
    }
    copy_json(receipt, c)
}
pub fn verify_relationship_sqlserver_projection(
    receipt: &Value,
    current: &Value,
    c: &mut Context<'_>,
) -> Result<Value, EngineError> {
    verify(receipt, current, c)
}
pub fn recover_relationship_sqlserver_ideal(
    receipt: &Value,
    current: &Value,
    c: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let r = verify(receipt, current, c)?;
    copy_json(get(&r, "source").unwrap(), c)
}
pub fn recover_relationship_sqlserver_binding(
    receipt: &Value,
    current: &Value,
    c: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let r = verify(receipt, current, c)?;
    copy_json(get(&r, "bindingSource").unwrap(), c)
}
pub fn recover_relationship_sqlserver_native(
    receipt: &Value,
    current: &Value,
    c: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let r = verify(receipt, current, c)?;
    copy_json(get(&r, "target").and_then(|x| get(x, "sql")).unwrap(), c)
}
