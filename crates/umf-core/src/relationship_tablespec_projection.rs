// SPDX-License-Identifier: MIT OR Apache-2.0
//! Rust-owned, source-retaining projection of an authored core relationship
//! into the pinned TableSpec outgoing-metadata profile.
use crate::{
    context::Context,
    engine::{Capabilities, Engine, ResourceSet, SemanticContext},
    error::{Diagnostic, EngineError},
    native_json::{NativeJsonNode, NativeJsonTree},
    registry::Registry,
    serialization::{self, Format},
    tablespec_adapter::TableSpecRuntime,
    value::{copy_json, Utf16, Value},
};
use std::sync::{Arc, OnceLock};

const CORE: &str = include_str!("../../../spec/core/schema.json");
const RESULT: &str =
    include_str!("../../../spec/core/relationship-tablespec-projection.schema.json");
const RELATIONSHIP_OP: &str = include_str!("../../../spec/core/relationship-operation.schema.json");
const NATIVE_SCHEMA: &str =
    include_str!("../../../native/tablespec/sources/src/tablespec/schemas/umf.schema.json");
const DOMAIN_TYPES: &str =
    include_str!("../../../native/tablespec/relationship-runtime/domain-base-types.json");
const TABLESPEC_PACKAGE: &str = include_str!("../../../spec/extensions/tablespec/package.json");
const TABLESPEC_TOKEN: u64 = 0x5441_424c_4553_0101;
const RECOVERY: &str = "Retained receipt recovers authored meaning and original native sources; native-only import does not establish authored intent";

struct Runtime {
    engine: Engine,
    registry: Registry,
    tablespec: TableSpecRuntime,
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
fn k(v: &str) -> Utf16 {
    Utf16::from(v)
}
fn s(v: &str) -> Value {
    Value::string_utf8(v)
}
fn obj(v: Vec<(&str, Value)>) -> Value {
    Value::Object(v.into_iter().map(|(a, b)| (k(a), b)).collect())
}
fn get<'a>(v: &'a Value, n: &str) -> Option<&'a Value> {
    if let Value::Object(m) = v {
        m.iter().find(|(x, _)| x == &k(n)).map(|(_, v)| v)
    } else {
        None
    }
}
fn getm<'a>(v: &'a Value, n: &Utf16) -> Option<&'a Value> {
    if let Value::Object(m) = v {
        m.iter().find(|(x, _)| x == n).map(|(_, v)| v)
    } else {
        None
    }
}
fn arr(v: Option<&Value>) -> &[Value] {
    if let Some(Value::Array(a)) = v {
        a
    } else {
        &[]
    }
}
fn raw_text(v: Option<&Value>) -> Option<&Utf16> {
    if let Some(Value::String(x)) = v {
        Some(x)
    } else {
        None
    }
}
fn text(v: Option<&Value>) -> Option<String> {
    raw_text(v).and_then(|x| x.to_utf8().ok())
}
fn eq(v: Option<&Value>, value: &str) -> bool {
    text(v).as_deref() == Some(value)
}
fn err(code: &str, message: &str, path: &str) -> EngineError {
    EngineError::new(code, k(path), message)
}
fn parse(text: &str, c: &mut Context<'_>) -> Result<Value, EngineError> {
    serialization::read_json_value(&text.encode_utf16().collect::<Vec<_>>(), Format::Json, c)
}
fn runtime(c: &mut Context<'_>) -> Result<Arc<Runtime>, EngineError> {
    static CACHE: OnceLock<Arc<Runtime>> = OnceLock::new();
    if c.profile() == crate::context::ResourceProfile::Cooperative
        && c.limits() == crate::context::Limits::ordinary()
    {
        if let Some(x) = CACHE.get() {
            return Ok(x.clone());
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
    let tablespec = TableSpecRuntime::new(c)?;
    let mut registry = Registry::new();
    let package = parse(TABLESPEC_PACKAGE, c)?;
    let resources = engine.schema_resources_with_context(c)?;
    registry.register(
        &package,
        Some(TABLESPEC_TOKEN),
        engine.package_schema(),
        &resources,
        c,
    )?;
    let value = Arc::new(Runtime {
        engine,
        registry,
        tablespec,
    });
    if c.profile() == crate::context::ResourceProfile::Cooperative
        && c.limits() == crate::context::Limits::ordinary()
    {
        let _ = CACHE.set(value.clone());
    }
    Ok(value)
}
fn child_path(path: &Utf16, key: &Utf16) -> Utf16 {
    let mut out = path.units().to_vec();
    out.push(b'/' as u16);
    for u in key.units() {
        match *u {
            0x7e => out.extend([0x7e, 0x30]),
            0x2f => out.extend([0x7e, 0x31]),
            x => out.push(x),
        }
    }
    Utf16::new(out)
}
fn canonical(v: &Value, c: &mut Context<'_>) -> Result<Value, EngineError> {
    c.charge_work(1, Utf16::default())?;
    match v {
        Value::Array(xs) => {
            c.charge_work(xs.len(), Utf16::default())?;
            Ok(Value::Array(
                xs.iter()
                    .map(|x| canonical(x, c))
                    .collect::<Result<_, _>>()?,
            ))
        }
        Value::Object(xs) => {
            let sw = xs
                .len()
                .saturating_mul((usize::BITS - usize::max(xs.len(), 1).leading_zeros()) as usize);
            let ml = xs.iter().map(|(k, _)| k.len()).max().unwrap_or(0);
            c.charge_work(
                xs.len()
                    .saturating_add(sw)
                    .saturating_add(sw.saturating_mul(ml)),
                Utf16::default(),
            )?;
            let mut out = Vec::with_capacity(xs.len());
            for (k, v) in xs {
                c.charge_work(k.len(), Utf16::default())?;
                out.push((k.clone(), canonical(v, c)?));
            }
            out.sort_by(|a, b| a.0.cmp(&b.0));
            Ok(Value::Object(out))
        }
        Value::String(x) => {
            c.charge_work(x.len(), Utf16::default())?;
            Ok(Value::String(x.clone()))
        }
        _ => Ok(v.clone()),
    }
}
fn same(a: &Value, b: &Value, c: &mut Context<'_>) -> Result<bool, EngineError> {
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
    if text(get(schema, "$id")).as_deref() != Some("urn:umf:core:relationship-operation:1.0.0") {
        let relationship_schema = parse(RELATIONSHIP_OP, c)?;
        resources.entries.push((
            k("urn:umf:core:relationship-operation:1.0.0"),
            relationship_schema,
        ));
    }
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
fn loss(
    xs: &mut Vec<Value>,
    path: &Utf16,
    value: &Value,
    reason: &str,
    outcome: &str,
    c: &mut Context<'_>,
) -> Result<(), EngineError> {
    xs.push(obj(vec![
        ("path", Value::String(path.clone())),
        ("value", copy_json(value, c)?),
        ("reason", s(reason)),
        ("outcome", s(outcome)),
        ("recovery", s(RECOVERY)),
    ]));
    Ok(())
}
fn loss_str(
    xs: &mut Vec<Value>,
    path: &str,
    value: &Value,
    reason: &str,
    outcome: &str,
    c: &mut Context<'_>,
) -> Result<(), EngineError> {
    loss(xs, &k(path), value, reason, outcome, c)
}
fn identity(v: &Value) -> Option<(Utf16, Utf16)> {
    Some((
        raw_text(get(v, "module"))?.clone(),
        raw_text(get(v, "element"))?.clone(),
    ))
}
fn same_ref(a: &Value, b: &Value) -> bool {
    identity(a) == identity(b)
}
fn locate(
    source: &Value,
    reference: &Value,
    c: &mut Context<'_>,
) -> Result<(Value, Utf16), EngineError> {
    let (module, element) = identity(reference).ok_or_else(|| {
        err(
            "RELATIONSHIP_TABLESPEC_REFERENCE",
            "Malformed endpoint identity",
            "/request",
        )
    })?;
    for (mi, m) in arr(get(source, "modules")).iter().enumerate() {
        if raw_text(get(m, "id")) == Some(&module) {
            for (ei, e) in arr(get(m, "elements")).iter().enumerate() {
                if raw_text(get(e, "id")) == Some(&element) {
                    return Ok((copy_json(e, c)?, k(&format!("/modules/{mi}/elements/{ei}"))));
                }
            }
        }
    }
    Err(err(
        "RELATIONSHIP_TABLESPEC_REFERENCE",
        "Unresolved logical element",
        "/request",
    ))
}
fn pointer_value<'a>(source: &'a Value, path: &Utf16) -> Option<&'a Value> {
    let mut cur = source;
    let units = path.units();
    if units.first() != Some(&(b'/' as u16)) {
        return None;
    }
    for enc in units[1..].split(|x| *x == b'/' as u16) {
        let mut d = Vec::new();
        let mut i = 0;
        while i < enc.len() {
            if enc[i] == b'~' as u16 && i + 1 < enc.len() {
                match enc[i + 1] {
                    48 => {
                        d.push(126);
                        i += 2
                    }
                    49 => {
                        d.push(47);
                        i += 2
                    }
                    _ => {
                        d.push(enc[i]);
                        i += 1
                    }
                }
            } else {
                d.push(enc[i]);
                i += 1
            }
        }
        let seg = Utf16::new(d);
        cur = match cur {
            Value::Object(_) => getm(cur, &seg)?,
            Value::Array(xs) => xs.get(seg.to_utf8().ok()?.parse::<usize>().ok()?)?,
            _ => return None,
        };
    }
    Some(cur)
}
fn python_blank(value: &str) -> bool {
    value.chars().all(|c|matches!(c as u32,0x0009..=0x000d|0x001c..=0x0020|0x0085|0x00a0|0x1680|0x2000..=0x200a|0x2028..=0x2029|0x202f|0x205f|0x3000))
}
fn name(v: &str) -> bool {
    let mut b = v.bytes();
    matches!(b.next(), Some(b'A'..=b'Z' | b'a'..=b'z' | b'_'))
        && b.all(|x| x.is_ascii_alphanumeric() || x == b'_')
}
fn set(v: &mut Value, n: &str, x: Value) -> Result<(), EngineError> {
    let Value::Object(m) = v else {
        return Err(err("RELATIONSHIP_TABLESPEC_SHAPE", "Expected object", ""));
    };
    if let Some((_, old)) = m.iter_mut().find(|(key, _)| key == &k(n)) {
        *old = x
    } else {
        m.push((k(n), x));
    }
    Ok(())
}
fn tagged_member<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    get(get(value, "members")?, name)
}
fn set_tagged_member(value: &mut Value, name: &str, next: Value) -> Result<(), EngineError> {
    let members = get_mut(value, "members").ok_or_else(|| {
        err(
            "RELATIONSHIP_TABLESPEC_SHAPE",
            "Expected tagged object members",
            "",
        )
    })?;
    set(members, name, next)
}
fn get_mut<'a>(v: &'a mut Value, n: &str) -> Option<&'a mut Value> {
    if let Value::Object(m) = v {
        m.iter_mut().find(|(x, _)| x == &k(n)).map(|(_, v)| v)
    } else {
        None
    }
}
fn tagged_json(source: &str, c: &mut Context<'_>) -> Result<Value, EngineError> {
    let tree = NativeJsonTree::parse_json(&source.encode_utf16().collect::<Vec<_>>(), c)?;
    tree.tagged_value_preserving_extras(c)
}
fn table_root(
    doc: &Value,
    rt: &Runtime,
    c: &mut Context<'_>,
) -> Result<(Value, NativeJsonTree), EngineError> {
    let payload = get(
        get(doc, "extensions").unwrap_or(&Value::Null),
        "umf.tablespec",
    );
    let split =
        matches!(payload,Some(Value::Object(m)) if m.iter().any(|(key,_)|key==&k("splitFiles")));
    if split {
        let _ = rt.tablespec.export_bundle(doc, c)?;
    } else {
        let _ = rt.tablespec.export(doc, c)?;
    }
    let tagged = rt.tablespec.get_table(doc, c)?;
    let tree = NativeJsonTree::from_tagged_value(&tagged, c)?;
    Ok((tagged, tree))
}
fn native_value(tree: &NativeJsonTree, c: &mut Context<'_>) -> Result<Value, EngineError> {
    let raw = tree.render_compact(c)?;
    serialization::read_json_value(raw.units(), Format::Json, c)
}
fn member<'a>(node: &'a NativeJsonNode, n: &str) -> Option<&'a NativeJsonNode> {
    if let NativeJsonNode::Object(m) = node {
        m.iter().find(|(key, _)| key == &k(n)).map(|(_, v)| v)
    } else {
        None
    }
}
fn native_text(v: Option<&NativeJsonNode>) -> Option<String> {
    if let Some(NativeJsonNode::String(x)) = v {
        x.to_utf8().ok()
    } else {
        None
    }
}
fn native_array(v: Option<&NativeJsonNode>) -> &[NativeJsonNode] {
    if let Some(NativeJsonNode::Array(x)) = v {
        x
    } else {
        &[]
    }
}
fn is_native_null(v: Option<&NativeJsonNode>) -> bool {
    matches!(v, None | Some(NativeJsonNode::Null))
}
fn columns(node: &NativeJsonNode) -> Vec<(String, &NativeJsonNode)> {
    native_array(member(node, "columns"))
        .iter()
        .filter_map(|c| Some((native_text(member(c, "name"))?, c)))
        .collect()
}
fn table_name(node: &NativeJsonNode) -> Option<String> {
    native_text(member(node, "table_name"))
}
fn strip_openapi_discriminator_annotations(value: &mut Value) {
    match value {
        Value::Array(items) => {
            for item in items {
                strip_openapi_discriminator_annotations(item);
            }
        }
        Value::Object(members) => {
            // TableSpec's pinned native-model schema embeds the OpenAPI
            // discriminator annotation to document the source union. It is
            // authoring metadata, not a JSON Schema validation keyword.
            members.retain(|(key, _)| key != &k("discriminator"));
            for (_, child) in members {
                strip_openapi_discriminator_annotations(child);
            }
        }
        Value::Null | Value::Bool(_) | Value::Number(_) | Value::String(_) => {}
    }
}

fn schema_ok(
    v: &Value,
    schema: &Value,
    rt: &Runtime,
    c: &mut Context<'_>,
    code: &str,
) -> Result<bool, EngineError> {
    let mut resources = rt.engine.schema_resources_with_context(c)?;
    if text(get(schema, "$id")).as_deref() != Some("urn:umf:core:relationship-operation:1.0.0") {
        let relationship_schema = parse(RELATIONSHIP_OP, c)?;
        resources.entries.push((
            k("urn:umf:core:relationship-operation:1.0.0"),
            relationship_schema,
        ));
    }
    // The pinned TableSpec source schema carries OpenAPI's root-level `example`
    // documentation member. It is not a JSON Schema validation keyword, so
    // omit only that known metadata member before strict schema compilation.
    let native_validation_schema = if code == "RELATIONSHIP_TABLESPEC_NATIVE" {
        let mut schema = copy_json(schema, c)?;
        if let Value::Object(members) = &mut schema {
            members.retain(|(key, _)| key != &k("example"));
        }
        strip_openapi_discriminator_annotations(&mut schema);
        Some(schema)
    } else {
        None
    };
    let compiled = crate::schema::CompiledSchema::compile(
        native_validation_schema.as_ref().unwrap_or(schema),
        &resources,
        c,
    )?;
    Ok(compiled.validate_codegen_errors(v, c)?.is_empty())
}
fn native_issues(
    node: &NativeJsonNode,
    value: &Value,
    label: &str,
    native_schema: &Value,
    domain_registry: &Value,
    rt: &Runtime,
    c: &mut Context<'_>,
    losses: &mut Vec<Value>,
) -> Result<bool, EngineError> {
    let mut valid = true;
    if !schema_ok(value, native_schema, rt, c, "RELATIONSHIP_TABLESPEC_NATIVE")? {
        loss_str(losses,&format!("/{label}"),value,"Pinned native schema rejects supplied TableSpec table; original source remains retained","not-expressible",c)?;
        valid = false;
    }
    let cols = columns(node);
    let names = cols
        .iter()
        .map(|(n, _)| n.clone())
        .collect::<std::collections::BTreeSet<_>>();
    let pk = native_array(member(node, "primary_key"));
    if pk.iter().any(|x|matches!(x,NativeJsonNode::String(n) if !n.to_utf8().ok().is_some_and(|s|s.starts_with("meta_")||names.contains(&s)))){loss_str(losses,&format!("/{label}/primary_key"),value,"Pinned native model rejects primary-key columns absent from supplied table","not-expressible",c)?;valid=false;}
    if let Some(NativeJsonNode::String(context)) = member(node, "context_column") {
        if !context.to_utf8().ok().is_some_and(|s| names.contains(&s)) {
            loss_str(
                losses,
                &format!("/{label}/context_column"),
                value,
                "Pinned native model requires context_column to resolve locally",
                "not-expressible",
                c,
            )?;
            valid = false;
        }
    }
    let registry = get(domain_registry, "expectedBaseTypes").unwrap_or(&Value::Null);
    for (index, (column_name, col)) in cols.iter().enumerate() {
        let domain = native_text(member(col, "domain_type"));
        let typ = native_text(member(col, "data_type")).map(|x| x.to_ascii_uppercase());
        let format = member(col, "format");
        let expected = domain
            .as_deref()
            .and_then(|d| get(registry, d))
            .and_then(|value| text(Some(value)));
        if let Some(expected) = expected {
            let string_type = matches!(typ.as_deref(), Some("VARCHAR" | "TEXT" | "CHAR"));
            let formatted =
                string_type && format.is_some_and(|f| !matches!(f, NativeJsonNode::Null));
            let compatible = formatted
                || (match expected.as_str() {
                    "DATE" => matches!(typ.as_deref(), Some("DATE" | "DATETIME")),
                    "TIMESTAMP" => typ.as_deref() == Some("DATETIME"),
                    "STRING" => string_type,
                    _ => typ.as_deref() == Some(expected.as_str()),
                });
            if !compatible {
                loss_str(losses,&format!("/{label}/columns/{index}/domain_type"),value,&format!("Pinned native domain registry expects {expected}-compatible data_type; annotation and source remain retained"),"not-expressible",c)?;
                valid = false;
            }
        }
        let emb = typ.as_deref() == Some("EMBEDDING");
        if (emb && is_native_null(member(col, "dimension")))
            || (!emb && !is_native_null(member(col, "dimension")))
        {
            loss_str(losses,&format!("/{label}/columns/{index}"),value,"Pinned native model requires dimension for EMBEDDING and forbids it on other native types","not-expressible",c)?;
            valid = false;
        }
        if column_name.len() > 128 || !name(column_name) {
            loss_str(losses,&format!("/{label}/columns/{index}/name"),value,"Pinned native model requires ASCII identifiers of at most 128 characters; no normalization is allowed","not-expressible",c)?;
            valid = false;
        }
        if let Some(der) = member(col, "derivation") {
            if let Some(candidates) = member(der, "candidates") {
                for (j, cand) in native_array(Some(candidates)).iter().enumerate() {
                    if is_native_null(member(cand, "column"))
                        && is_native_null(member(cand, "expression"))
                    {
                        loss_str(
                            losses,
                            &format!("/{label}/columns/{index}/derivation/candidates/{j}"),
                            value,
                            "Pinned derivation candidate requires a column or expression",
                            "not-expressible",
                            c,
                        )?;
                        valid = false;
                    }
                }
            }
        }
    }
    if table_name(node)
        .as_deref()
        .is_none_or(|n| n.len() > 128 || !name(n))
    {
        loss_str(
            losses,
            &format!("/{label}/table_name"),
            value,
            "Pinned native model requires ASCII table identifiers of at most 128 characters",
            "not-expressible",
            c,
        )?;
        valid = false;
    }
    if let Some(source) = member(node, "source") {
        let kind = native_text(member(source, "kind"));
        if kind.as_deref() == Some("jdbc") {
            let db = member(source, "dbtable").is_some_and(|x| !matches!(x, NativeJsonNode::Null));
            let query = member(source, "query").is_some_and(|x| !matches!(x, NativeJsonNode::Null));
            if db == query {
                loss_str(
                    losses,
                    &format!("/{label}/source"),
                    value,
                    "Pinned JDBC model requires exactly one of dbtable and query",
                    "not-expressible",
                    c,
                )?;
                valid = false;
            }
        }
        if kind.as_deref() == Some("json") {
            let proj = native_array(member(source, "projection"));
            let mut seen = std::collections::BTreeSet::new();
            for p in proj {
                let col = native_text(member(p, "column"));
                let path = native_text(member(p, "path"));
                if col.as_ref().is_none_or(|n| !names.contains(n))
                    || path.as_ref().is_none_or(|p| python_blank(p))
                    || !seen.insert(col.unwrap())
                {
                    loss_str(losses,&format!("/{label}/source"),value,"Pinned JSON source requires one nonblank-path projection for every native column","not-expressible",c)?;
                    valid = false;
                }
            }
            if proj.len() != cols.len() {
                loss_str(
                    losses,
                    &format!("/{label}/source"),
                    value,
                    "Pinned JSON source requires one projection per native column",
                    "not-expressible",
                    c,
                )?;
                valid = false;
            }
        }
    }
    Ok(valid)
}

fn validate_document(doc: &Value, rt: &Runtime, c: &mut Context<'_>) -> Result<(), EngineError> {
    let result = rt
        .engine
        .validate_document(doc, &rt.registry, &mut NoCapabilities, c)?;
    if result.valid {
        Ok(())
    } else {
        Err(err(
            "RELATIONSHIP_TABLESPEC_SOURCE",
            "Valid core 0.10.0 required",
            "",
        ))
    }
}
fn archive(doc: &Value, rt: &Runtime, c: &mut Context<'_>) -> Result<Value, EngineError> {
    let split = get(
        get(doc, "extensions").unwrap_or(&Value::Null),
        "umf.tablespec",
    )
    .and_then(|p| get(p, "splitFiles"))
    .is_some();
    let value = if split {
        rt.tablespec.export_bundle(doc, c)?
    } else {
        Value::String(rt.tablespec.export(doc, c)?)
    };
    Ok(value)
}
fn projection(
    source: Value,
    author: Value,
    native_source: Value,
    native_target: Value,
    request: Value,
    rt: &Runtime,
    c: &mut Context<'_>,
) -> Result<Value, EngineError> {
    validate_schema(
        &request,
        &parse_schema_property(RESULT, "request", c)?,
        rt,
        c,
        "RELATIONSHIP_TABLESPEC_REQUEST",
    )?;
    validate_document(&source, rt, c)?;
    validate_schema(
        &author,
        &parse(RELATIONSHIP_OP, c)?,
        rt,
        c,
        "RELATIONSHIP_TABLESPEC_AUTHOR",
    )?;
    let author_target = get(&author, "target").ok_or_else(|| {
        err(
            "RELATIONSHIP_TABLESPEC_AUTHOR",
            "Missing author target",
            "/author",
        )
    })?;
    let author_identity = get(&author, "identity").ok_or_else(|| {
        err(
            "RELATIONSHIP_TABLESPEC_AUTHOR",
            "Missing author identity",
            "/author",
        )
    })?;
    let request_identity = get(&request, "relationship").unwrap();
    let author_request = get(&author, "request").ok_or_else(|| {
        err(
            "RELATIONSHIP_TABLESPEC_AUTHOR",
            "Missing author request",
            "/author",
        )
    })?;
    let source_id = get(&source, "id").cloned().unwrap_or(Value::Null);
    if !eq(get(&author, "operation"), "declare-core-relationship")
        || get(author_target, "id") != Some(&source_id)
        || get(author_identity, "module") != get(request_identity, "module")
        || get(author_request, "id") != get(request_identity, "id")
    {
        return Err(err(
            "RELATIONSHIP_TABLESPEC_AUTHOR",
            "Mismatched author identity",
            "/author",
        ));
    }
    let mut caps = NoCapabilities;
    crate::core_relationships::verify_core_relationship_operation(
        &author,
        author_target,
        &rt.engine,
        &rt.registry,
        &mut caps,
        c,
    )?;
    let current = crate::core_relationships::lookup_core_relationship(
        &source,
        request_identity,
        &rt.engine,
        &rt.registry,
        &mut caps,
        c,
    )?;
    let prior = crate::core_relationships::lookup_core_relationship(
        author_target,
        request_identity,
        &rt.engine,
        &rt.registry,
        &mut caps,
        c,
    )?;
    if !same(
        get(&current, "relationship").unwrap(),
        get(&prior, "relationship").unwrap(),
        c,
    )? {
        return Err(err(
            "RELATIONSHIP_TABLESPEC_STALE",
            "Relationship changed since authoring",
            "/source",
        ));
    }
    let rel = get(&current, "relationship").unwrap();
    let mut endpoints = arr(get(rel, "source"))
        .iter()
        .chain(arr(get(rel, "target")))
        .collect::<Vec<_>>();
    if let Some(association) = get(rel, "associationRecord") {
        endpoints.push(association);
    }
    for endpoint in endpoints {
        let (now, path) = locate(&source, endpoint, c)?;
        let (old, _) = locate(author_target, endpoint, c)?;
        if !same(&now, &old, c)? {
            return Err(err(
                "RELATIONSHIP_TABLESPEC_STALE",
                "Endpoint Record or Key changed since authoring",
                "/source",
            ));
        }
        for member in arr(get(&now, "members")) {
            let (a, _) = locate(&source, member, c)?;
            let (b, _) = locate(author_target, member, c)?;
            if !same(&a, &b, c)? {
                return Err(err(
                    "RELATIONSHIP_TABLESPEC_STALE",
                    "Endpoint component changed since authoring",
                    "/source",
                ));
            }
        }
    }
    let source_archive = archive(&native_source, rt, c)?;
    let target_archive = archive(&native_target, rt, c)?;
    let (from, from_tree) = table_root(&native_source, rt, c)?;
    let (to, to_tree) = table_root(&native_target, rt, c)?;
    let from_root = from_tree.root();
    let to_root = to_tree.root();
    let binding = parse(
        r#"{"id":"umf.tablespec.relationships","version":"1.0.0","nativeVersion":"647e8e566ad78b864282ec65c0b0b2237aa63084","subset":"Explicit single-source/single-target outgoing metadata with ordered target-Key column pairs; no referential enforcement, lifecycle or authored intent inferred from native import"}"#,
        c,
    )?;
    let mut residuals = Vec::new();
    let mut mappings = Vec::new();
    let mut impossible = false;
    loss_str(&mut residuals,"/",&source,"Only the selected relationship metadata is emitted; the complete logical model and unknown content recover from this retained source","approximated",c)?;
    for field in [
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
        if let Some(value) = get(rel, field) {
            let base = raw_text(get(&current, "path")).cloned().unwrap_or_default();
            let path = child_path(&base, &k(field));
            loss(&mut residuals,&path,value,"Native outgoing metadata does not establish this authored obligation; stable identity, Key semantics, checked participation, lifecycle and presentation intent require the retained receipt","unknown",c)?;
        }
    }
    for path in arr(get(&current, "uninterpretedPaths")) {
        let Value::String(path) = path else { continue };
        let value = pointer_value(&source, path).ok_or_else(|| {
            err(
                "RELATIONSHIP_TABLESPEC_PATH",
                "Unresolved qualifier diagnostic path",
                "/source",
            )
        })?;
        loss(
            &mut residuals,
            path,
            value,
            "Unknown relationship qualifier remains uninterpreted",
            "unknown",
            c,
        )?;
    }
    let block = |residuals: &mut Vec<Value>,
                 path: &str,
                 value: &Value,
                 reason: &str,
                 impossible: &mut bool,
                 c: &mut Context<'_>|
     -> Result<(), EngineError> {
        *impossible = true;
        loss_str(residuals, path, value, reason, "not-expressible", c)
    };
    if arr(get(rel, "source")).len() != 1 || arr(get(rel, "target")).len() != 1 {
        block(
            &mut residuals,
            text(get(&current, "path")).as_deref().unwrap_or("/"),
            rel,
            "This outgoing-metadata profile cannot emit heterogeneous endpoint sets",
            &mut impossible,
            c,
        )?;
    }
    if let Some(value) = get(rel, "associationRecord") {
        block(&mut residuals,"/associationRecord",value,"A separately keyed association Record requires an explicit physical layout; no attributes or identity may be discarded",&mut impossible,c)?;
    }
    let native_schema = parse(NATIVE_SCHEMA, c)?;
    let domain_registry = parse(DOMAIN_TYPES, c)?;
    let from_value = native_value(&from_tree, c)?;
    let to_value = native_value(&to_tree, c)?;
    let from_ok = native_issues(
        from_root,
        &from_value,
        "nativeSource",
        &native_schema,
        &domain_registry,
        rt,
        c,
        &mut residuals,
    )?;
    let to_ok = native_issues(
        to_root,
        &to_value,
        "nativeTarget",
        &native_schema,
        &domain_registry,
        rt,
        c,
        &mut residuals,
    )?;
    if !from_ok || !to_ok {
        impossible = true;
    }
    let name_from = table_name(from_root);
    let name_to = table_name(to_root);
    if arr(get(rel, "source")).len() == 1 && arr(get(rel, "target")).len() == 1 {
        let src = &arr(get(rel, "source"))[0];
        let tgt = &arr(get(rel, "target"))[0];
        if same_ref(src, tgt) {
            if from_root != to_root {
                block(
                    &mut residuals,
                    "/nativeTarget",
                    &to_value,
                    "Self relationships require the same native table",
                    &mut impossible,
                    c,
                )?;
            }
        } else if name_from == name_to {
            block(
                &mut residuals,
                "/nativeTarget",
                &to_value,
                "Distinct Records require distinct native table names in this profile",
                &mut impossible,
                c,
            )?;
        }
    }
    let target_endpoint = arr(get(rel, "target")).first();
    let target_record = if let Some(endpoint) = target_endpoint {
        Some(locate(&source, endpoint, c)?.0)
    } else {
        None
    };
    let target_key_id = target_endpoint.and_then(|x| raw_text(get(x, "key")).cloned());
    let key = target_record.as_ref().and_then(|record| {
        arr(get(record, "keys"))
            .iter()
            .find(|x| raw_text(get(x, "id")) == target_key_id.as_ref())
    });
    let columns = arr(get(&request, "columns"));
    let key_fields = key.map(|x| arr(get(x, "fields"))).unwrap_or(&[]);
    if key.is_none()
        || columns.len() != key_fields.len()
        || columns
            .iter()
            .zip(key_fields)
            .any(|(c, f)| !same_ref(get(c, "targetField").unwrap_or(&Value::Null), f))
    {
        block(&mut residuals,"/request/columns",&Value::Array(columns.to_vec()),"Ordered column pairs must cover the selected target Key Fields exactly once in Key order",&mut impossible,c)?;
    }
    let source_names = columns
        .iter()
        .filter_map(|x| text(get(x, "sourceColumn")))
        .collect::<std::collections::BTreeSet<_>>();
    let target_names = columns
        .iter()
        .filter_map(|x| text(get(x, "targetColumn")))
        .collect::<std::collections::BTreeSet<_>>();
    if source_names.len() != columns.len() || target_names.len() != columns.len() {
        block(
            &mut residuals,
            "/request/columns",
            &Value::Array(columns.to_vec()),
            "Native columns must be unique on each side",
            &mut impossible,
            c,
        )?;
    }
    fn native_column<'a>(root: &'a NativeJsonNode, n: &str) -> Option<&'a NativeJsonNode> {
        native_array(member(root, "columns"))
            .iter()
            .find(|x| native_text(member(x, "name")).as_deref() == Some(n))
    }
    let families = [
        ("INTEGER", "integer"),
        ("BOOLEAN", "boolean"),
        ("TEXT", "string"),
        ("VARCHAR", "string"),
        ("CHAR", "string"),
        ("FLOAT", "float"),
        ("DECIMAL", "decimal"),
        ("DATE", "date"),
        ("DATETIME", "timestamp"),
        ("TIMESTAMP", "timestamp"),
    ]
    .into_iter()
    .collect::<std::collections::BTreeMap<_, _>>();
    for (i, col) in columns.iter().enumerate() {
        let sn = text(get(col, "sourceColumn")).unwrap_or_default();
        let tn = text(get(col, "targetColumn")).unwrap_or_default();
        let a = native_column(from_root, &sn);
        let b = native_column(to_root, &tn);
        let field = if let Some(reference) = key_fields.get(i) {
            Some(locate(&source, reference, c)?.0)
        } else {
            None
        };
        let at = a
            .and_then(|x| native_text(member(x, "data_type")))
            .map(|x| x.to_ascii_uppercase());
        let bt = b
            .and_then(|x| native_text(member(x, "data_type")))
            .map(|x| x.to_ascii_uppercase());
        let logical = field.as_ref().and_then(|x| text(get(x, "scalarType")));
        let cardinality = field.as_ref().and_then(|x| text(get(x, "cardinality")));
        if a.is_none()
            || b.is_none()
            || at != bt
            || bt.as_ref().and_then(|x| families.get(x.as_str()).copied()) != logical.as_deref()
            || cardinality.as_deref() != Some("one")
        {
            block(&mut residuals,&format!("/request/columns/{i}"),col,"Selected native scalar carriers must match each other and the logical target Key Field",&mut impossible,c)?;
        }
        loss_str(&mut residuals,&format!("/request/columns/{i}"),col,"Column pairing is an explicit physical choice; comparators, native domains and row-level enforcement remain unproved","unknown",c)?;
    }
    let relationships = member(from_root, "relationships");
    let outgoing = relationships.and_then(|x| member(x, "outgoing"));
    if relationships.is_some_and(|x| !matches!(x, NativeJsonNode::Object(_) | NativeJsonNode::Null))
    {
        block(
            &mut residuals,
            "/nativeSource/relationships",
            &from_value,
            "Existing relationship metadata is not an object",
            &mut impossible,
            c,
        )?;
    }
    if outgoing.is_some_and(|x| !matches!(x, NativeJsonNode::Array(_) | NativeJsonNode::Null)) {
        block(
            &mut residuals,
            "/nativeSource/relationships/outgoing",
            &from_value,
            "Existing outgoing metadata is not an array",
            &mut impossible,
            c,
        )?;
    }
    if let Some(NativeJsonNode::Array(items)) = outgoing {
        if items.iter().any(|x| {
            !matches!(x, NativeJsonNode::Object(_))
                || native_text(member(x, "target_table")) == name_to
        }) {
            block(&mut residuals,"/nativeSource/relationships/outgoing",&from_value,"Existing outgoing metadata conflicts with or cannot be distinguished from the requested target; no overwrite or implicit join merge",&mut impossible,c)?;
        }
    }
    let status = if impossible || eq(get(&request, "mode"), "strict") {
        "blocked"
    } else {
        "projected"
    };
    let mut target = None;
    if status == "projected" {
        let first = columns.first().ok_or_else(|| {
            err(
                "RELATIONSHIP_TABLESPEC_REQUEST",
                "At least one column mapping is required",
                "/request/columns",
            )
        })?;
        let source_mult = get(rel, "sourceMultiplicity").unwrap();
        let target_mult = get(rel, "targetMultiplicity").unwrap();
        let bound = |m: &Value| -> String {
            let min = text(get(m, "min"))
                .or_else(|| {
                    get(m, "min").and_then(|x| {
                        if let Value::Number(n) = x {
                            Some(n.to_string())
                        } else {
                            None
                        }
                    })
                })
                .unwrap_or_default();
            let max = text(get(m, "max"))
                .or_else(|| {
                    get(m, "max").and_then(|x| {
                        if let Value::Number(n) = x {
                            Some(n.to_string())
                        } else {
                            None
                        }
                    })
                })
                .unwrap_or_default();
            if min == max {
                min
            } else {
                format!("{min}..{max}")
            }
        };
        let many = |m: &Value| -> bool {
            eq(get(m, "max"), "*")
                || get(m, "max")
                    .and_then(|x| {
                        if let Value::Number(n) = x {
                            Some(*n > 1.0)
                        } else {
                            None
                        }
                    })
                    .unwrap_or(false)
        };
        let mut entry=obj(vec![("target_table",s(name_to.as_deref().unwrap_or_default())),("source_column",get(first,"sourceColumn").cloned().unwrap()),("target_column",get(first,"targetColumn").cloned().unwrap()),("type",s("reference")),("confidence",Value::Number(1.0)),("reasoning",s("Explicit UMF metadata projection; confidence does not assert referential enforcement")),("cardinality",obj(vec![("type",s(&format!("{}_to_{}",if many(source_mult){"many"}else{"one"},if many(target_mult){"many"}else{"one"}))), ("notation",s(&format!("{}:{}",if many(source_mult){"N"}else{"1"},if many(target_mult){"N"}else{"1"}))), ("source_multiplicity",s(&bound(source_mult))), ("target_multiplicity",s(&bound(target_mult))), ("mandatory",Value::Bool(get(target_mult,"min").and_then(|x|if let Value::Number(n)=x{Some(*n>0.0)}else{None}).unwrap_or(false))), ("composite_key",Value::Bool(columns.len()>1))]))]);
        if columns.len() > 1 {
            let join = columns
                .iter()
                .skip(1)
                .map(|x| {
                    obj(vec![
                        (
                            "source_column",
                            get(x, "sourceColumn").cloned().unwrap_or(Value::Null),
                        ),
                        (
                            "target_column",
                            get(x, "targetColumn").cloned().unwrap_or(Value::Null),
                        ),
                    ])
                })
                .collect();
            set(&mut entry, "join_conditions", Value::Array(join))?;
        }
        let entry_json = serialization::write_json_value(&entry, Format::Json, c)?;
        let entry_tree = NativeJsonTree::parse_json(entry_json.units(), c)?;
        let entry_tagged = entry_tree.tagged_value_preserving_extras(c)?;
        let mut metadata = if tagged_member(&from, "relationships")
            .and_then(|x| text(get(x, "kind")))
            .as_deref()
            == Some("object")
        {
            copy_json(tagged_member(&from, "relationships").unwrap(), c)?
        } else {
            tagged_json("{}", c)?
        };
        let mut outgoing = if tagged_member(&metadata, "outgoing")
            .and_then(|x| text(get(x, "kind")))
            .as_deref()
            == Some("array")
        {
            copy_json(tagged_member(&metadata, "outgoing").unwrap(), c)?
        } else {
            tagged_json("[]", c)?
        };
        let items_value = get_mut(&mut outgoing, "items").ok_or_else(|| {
            err(
                "RELATIONSHIP_TABLESPEC_SHAPE",
                "Expected tagged outgoing array",
                "/nativeSource/relationships/outgoing",
            )
        })?;
        let Value::Array(items) = items_value else {
            return Err(err(
                "RELATIONSHIP_TABLESPEC_SHAPE",
                "Expected tagged outgoing items",
                "/nativeSource/relationships/outgoing",
            ));
        };
        let index = items.len();
        items.push(entry_tagged);
        set_tagged_member(&mut metadata, "outgoing", outgoing)?;
        let changes = obj(vec![("relationships", metadata)]);
        let candidate = rt.tablespec.edit_table(&native_source, &changes, c)?;
        let (_, candidate_tree) = table_root(&candidate, rt, c)?;
        let candidate_value = native_value(&candidate_tree, c)?;
        if !schema_ok(
            &candidate_value,
            &native_schema,
            rt,
            c,
            "RELATIONSHIP_TABLESPEC_NATIVE",
        )? {
            loss_str(
                &mut residuals,
                "/nativeSource",
                &from_value,
                "Emitted carrier failed pinned native structural validation",
                "not-expressible",
                c,
            )?;
            impossible = true;
        } else {
            let native_path=format!("/extensions/umf.tablespec/root/members/relationships/members/outgoing/items/{index}");
            mappings.push(obj(vec![
                (
                    "idealPath",
                    get(&current, "path").cloned().unwrap_or(s("/")),
                ),
                ("nativePath", s(&native_path)),
                ("outcome", s("approximated")),
                (
                    "sourceColumns",
                    Value::Array(
                        columns
                            .iter()
                            .map(|x| get(x, "sourceColumn").cloned().unwrap_or(Value::Null))
                            .collect(),
                    ),
                ),
                (
                    "targetColumns",
                    Value::Array(
                        columns
                            .iter()
                            .map(|x| get(x, "targetColumn").cloned().unwrap_or(Value::Null))
                            .collect(),
                    ),
                ),
                (
                    "targetKey",
                    get(target_endpoint.unwrap(), "key")
                        .cloned()
                        .unwrap_or(Value::Null),
                ),
            ]));
            target = Some(candidate);
        }
    }
    let final_status = if target.is_some() {
        "projected"
    } else {
        "blocked"
    };
    let outcome = if final_status == "projected" {
        "approximated"
    } else if impossible {
        "not-expressible"
    } else {
        "unknown"
    };
    let diagnostics = residuals
        .iter()
        .map(|x| {
            obj(vec![
                ("code", s("RELATIONSHIP_TABLESPEC_LOSS")),
                ("path", get(x, "path").cloned().unwrap_or(s("/"))),
                ("message", get(x, "reason").cloned().unwrap_or(Value::Null)),
                (
                    "severity",
                    s(if final_status == "projected" {
                        "warning"
                    } else {
                        "error"
                    }),
                ),
            ])
        })
        .collect();
    let mut result = obj(vec![
        ("operation", s("project-relationship-tablespec")),
        ("version", s("1.0.0")),
        ("status", s(final_status)),
        ("outcome", s(outcome)),
        ("source", source),
        ("author", author),
        ("nativeSource", native_source),
        ("nativeTarget", native_target),
        ("request", request),
        ("binding", binding),
        ("mappings", Value::Array(mappings)),
        ("residuals", Value::Array(residuals)),
        ("diagnostics", Value::Array(diagnostics)),
    ]);
    if let Some(target) = target {
        set(&mut result, "target", target)?;
    }
    validate_schema(
        &result,
        &parse(RESULT, c)?,
        rt,
        c,
        "RELATIONSHIP_TABLESPEC_RESULT",
    )?;
    let _ = (source_archive, target_archive);
    Ok(result)
}
fn parse_schema_property(
    schema: &str,
    name: &str,
    c: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let root = parse(schema, c)?;
    get(&root, "properties")
        .and_then(|x| get(x, name))
        .cloned()
        .ok_or_else(|| {
            err(
                "RELATIONSHIP_TABLESPEC_SCHEMA",
                "Missing schema property",
                "",
            )
        })
}
pub fn project_relationship_to_tablespec(
    source: &Value,
    author: &Value,
    native_source: &Value,
    native_target: &Value,
    request: &Value,
    c: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(c)?;
    projection(
        copy_json(source, c)?,
        copy_json(author, c)?,
        copy_json(native_source, c)?,
        copy_json(native_target, c)?,
        copy_json(request, c)?,
        &rt,
        c,
    )
}
pub fn verify_relationship_tablespec_projection(
    receipt: &Value,
    current: &Value,
    c: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(c)?;
    validate_schema(
        receipt,
        &parse(RESULT, c)?,
        &rt,
        c,
        "RELATIONSHIP_TABLESPEC_RECEIPT",
    )?;
    if !eq(get(receipt, "status"), "projected") {
        return Err(err(
            "RELATIONSHIP_TABLESPEC_RECEIPT",
            "Expected successful projection receipt",
            "",
        ));
    }
    let recomputed = projection(
        get(receipt, "source").unwrap().clone(),
        get(receipt, "author").unwrap().clone(),
        get(receipt, "nativeSource").unwrap().clone(),
        get(receipt, "nativeTarget").unwrap().clone(),
        get(receipt, "request").unwrap().clone(),
        &rt,
        c,
    )?;
    if !same(receipt, &recomputed, c)? {
        return Err(err(
            "RELATIONSHIP_TABLESPEC_RECEIPT",
            "Forged or inconsistent retained projection",
            "",
        ));
    }
    let current_root = rt.tablespec.get_table(current, c)?;
    let expected = rt.tablespec.get_table(get(receipt, "target").unwrap(), c)?;
    if !same(&current_root, &expected, c)?
        || archive(current, &rt, c)? != archive(get(receipt, "target").unwrap(), &rt, c)?
    {
        return Err(err(
            "RELATIONSHIP_TABLESPEC_STALE",
            "Emitted native representation changed",
            "",
        ));
    }
    copy_json(receipt, c)
}
pub fn recover_relationship_tablespec_ideal(
    receipt: &Value,
    current: &Value,
    c: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let verified = verify_relationship_tablespec_projection(receipt, current, c)?;
    copy_json(get(&verified, "source").unwrap(), c)
}
pub fn recover_relationship_tablespec_native_sources(
    receipt: &Value,
    current: &Value,
    c: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let verified = verify_relationship_tablespec_projection(receipt, current, c)?;
    let rt = runtime(c)?;
    Ok(obj(vec![
        (
            "source",
            archive(get(&verified, "nativeSource").unwrap(), &rt, c)?,
        ),
        (
            "target",
            archive(get(&verified, "nativeTarget").unwrap(), &rt, c)?,
        ),
    ]))
}
