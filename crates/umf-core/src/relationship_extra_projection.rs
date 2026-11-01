// SPDX-License-Identifier: MIT OR Apache-2.0
//! Authored core relationship projection to the pinned GraphQL, RDF and LinkML
//! presentation profiles. Native syntax never establishes relationship intent.
use crate::{
    context::Context,
    engine::{Capabilities, Engine, ResourceSet, SemanticContext},
    error::{Diagnostic, EngineError},
    registry::Registry,
    serialization::{self, Format},
    value::{copy_json, Utf16, Value},
};
use std::sync::{Arc, OnceLock};

const CORE: &str = include_str!("../../../spec/core/schema.json");
const RESULT: &str = include_str!("../../../spec/core/relationship-extras.schema.json");
const RELATIONSHIP_OP: &str = include_str!("../../../spec/core/relationship-operation.schema.json");
const RECOVERY: &str = "Retained source recovers authored meaning; native syntax does not establish authored identity or obligations";
const GRAPHQL_BINDING: &str = "graphql-js-17.0.2_graphql-core-3.2.12_schema-sdl";
const RDF_BINDING: &str = "rdf11-nquads_rdflib-7.6.0_owl-union";
const LINKML_BINDING: &str = "linkml-metamodel-1.11.0_runtime-1.11.0rc2";

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
fn get_utf16<'a>(v: &'a Value, n: &Utf16) -> Option<&'a Value> {
    if let Value::Object(m) = v {
        m.iter().find(|(x, _)| x == n).map(|(_, v)| v)
    } else {
        None
    }
}
fn raw(v: Option<&Value>) -> Option<&Utf16> {
    if let Some(Value::String(x)) = v {
        Some(x)
    } else {
        None
    }
}
fn text(v: Option<&Value>) -> Option<String> {
    raw(v).and_then(|x| x.to_utf8().ok())
}
fn arr(v: Option<&Value>) -> &[Value] {
    if let Some(Value::Array(a)) = v {
        a
    } else {
        &[]
    }
}
fn err(code: &str, message: &str, path: &str) -> EngineError {
    EngineError::new(code, k(path), message)
}
fn parse(v: &str, c: &mut Context<'_>) -> Result<Value, EngineError> {
    serialization::read_json_value(&v.encode_utf16().collect::<Vec<_>>(), Format::Json, c)
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
    let runtime = Arc::new(Runtime {
        engine,
        registry: Registry::new(),
    });
    if c.profile() == crate::context::ResourceProfile::Cooperative
        && c.limits() == crate::context::Limits::ordinary()
    {
        let _ = CACHE.set(runtime.clone());
    }
    Ok(runtime)
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
    resources.entries.push((
        k("urn:umf:core:relationship-operation:1.0.0"),
        parse(RELATIONSHIP_OP, c)?,
    ));
    let compiled = crate::schema::CompiledSchema::compile(schema, &resources, c)?;
    if compiled.validate_codegen_errors(v, c)?.is_empty() {
        Ok(())
    } else {
        Err(err(
            code,
            "Value does not match pinned relationship extras schema",
            "",
        ))
    }
}
fn set(v: &mut Value, n: &str, x: Value) -> Result<(), EngineError> {
    let Value::Object(m) = v else {
        return Err(err("RELATIONSHIP_EXTRA_SHAPE", "Expected object", ""));
    };
    if let Some((_, old)) = m.iter_mut().find(|(key, _)| key == &k(n)) {
        *old = x
    } else {
        m.push((k(n), x));
    }
    Ok(())
}
fn pointer_child(path: &str, key: &Utf16) -> Utf16 {
    pointer_child_units(&path.encode_utf16().collect::<Vec<_>>(), key)
}
fn pointer_child_units(path: &[u16], key: &Utf16) -> Utf16 {
    let mut out = path.to_vec();
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
        ("outcome", s(outcome)),
        ("reason", s(reason)),
        ("recovery", s("retained-source")),
    ]));
    Ok(())
}
fn name(v: &str) -> bool {
    let mut b = v.bytes();
    matches!(b.next(), Some(b'_' | b'A'..=b'Z' | b'a'..=b'z'))
        && b.all(|x| x == b'_' || x.is_ascii_alphanumeric())
        && !v.starts_with("__")
}
fn iri(v: &str) -> bool {
    let Some((scheme, rest)) = v.split_once(':') else {
        return false;
    };
    let mut chars = scheme.bytes();
    matches!(chars.next(), Some(b'A'..=b'Z' | b'a'..=b'z'))
        && chars.all(|x| x.is_ascii_alphanumeric() || matches!(x, b'+' | b'.' | b'-'))
        && !rest.chars().any(|x| {
            x.is_control() || matches!(x, '<' | '>' | '"' | '{' | '}' | '|' | '^' | '`' | '\\')
        })
        && !rest.encode_utf16().any(|u| (0xD800..=0xDFFF).contains(&u))
}
fn ident(v: &Value) -> Option<(Utf16, Utf16)> {
    Some((
        raw(get(v, "module"))?.clone(),
        raw(get(v, "element"))?.clone(),
    ))
}
fn lookup_element<'a>(
    doc: &'a Value,
    identity: &Value,
) -> Option<(&'a Value, usize, usize, Utf16)> {
    let (module, element) = ident(identity)?;
    let modules = arr(get(doc, "modules"));
    for (mi, m) in modules.iter().enumerate() {
        if raw(get(m, "id")) == Some(&module) {
            for (ei, e) in arr(get(m, "elements")).iter().enumerate() {
                if raw(get(e, "id")) == Some(&element) {
                    return Some((
                        e,
                        mi,
                        ei,
                        pointer_child(
                            &format!("/modules/{mi}/elements"),
                            &Utf16::from(ei.to_string()),
                        ),
                    ));
                }
            }
        }
    }
    None
}
fn binding(system: &str) -> &'static str {
    match system {
        "graphql" => GRAPHQL_BINDING,
        "rdf" => RDF_BINDING,
        _ => LINKML_BINDING,
    }
}
fn diag_from_loss(loss: &Value, blocked: bool) -> Value {
    obj(vec![
        ("code", s("RELATIONSHIP_EXTRA_LOSS")),
        ("path", get(loss, "path").cloned().unwrap_or(Value::Null)),
        (
            "message",
            get(loss, "reason").cloned().unwrap_or(Value::Null),
        ),
        ("severity", s(if blocked { "error" } else { "warning" })),
    ])
}

/// Rust owns source/author admission, target naming, projection policy and losses.
/// The wire owner imports the emitted native archive and calls `complete`.
pub fn prepare_relationship_to_extra(
    source: &Value,
    author_input: &Value,
    request_input: &Value,
    c: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(c)?;
    let schema = parse(RESULT, c)?;
    let request_schema = get(get(&schema, "$defs").unwrap(), "projectionRequest").unwrap();
    let request = copy_json(request_input, c)?;
    validate_schema(
        &request,
        request_schema,
        &rt,
        c,
        "RELATIONSHIP_EXTRA_REQUEST",
    )?;
    let source = copy_json(source, c)?;
    let author = copy_json(author_input, c)?;
    let validation = rt
        .engine
        .validate_document(&source, &rt.registry, &mut NoCapabilities, c)?;
    if !validation.valid || text(get(&source, "umf")).as_deref() != Some("0.10.0") {
        return Err(err(
            "RELATIONSHIP_EXTRA_SOURCE",
            "Valid core 0.10.0 source required",
            "",
        ));
    }
    if text(get(&author, "operation")).as_deref() != Some("declare-core-relationship") {
        return Err(err(
            "RELATIONSHIP_EXTRA_AUTHOR",
            "Expected explicit relationship declaration",
            "/author",
        ));
    }
    let author_target = get(&author, "target").ok_or_else(|| {
        err(
            "RELATIONSHIP_EXTRA_AUTHOR",
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
    let relationship = get(&request, "relationship").ok_or_else(|| {
        err(
            "RELATIONSHIP_EXTRA_REQUEST",
            "Relationship identity required",
            "/request",
        )
    })?;
    let current = crate::core_relationships::lookup_core_relationship(
        &source,
        relationship,
        &rt.engine,
        &rt.registry,
        &mut NoCapabilities,
        c,
    )?;
    let prior = crate::core_relationships::lookup_core_relationship(
        author_target,
        relationship,
        &rt.engine,
        &rt.registry,
        &mut NoCapabilities,
        c,
    )?;
    if text(get(author_target, "id")) != text(get(&source, "id"))
        || text(get(get(&author, "identity").unwrap(), "module"))
            != text(get(relationship, "module"))
        || text(get(get(&author, "request").unwrap(), "id")) != text(get(relationship, "id"))
    {
        return Err(err(
            "RELATIONSHIP_EXTRA_AUTHOR",
            "Mismatched author identity",
            "/author",
        ));
    }
    if !same(
        get(&current, "relationship").unwrap(),
        get(&prior, "relationship").unwrap(),
        c,
    )? {
        return Err(err(
            "RELATIONSHIP_EXTRA_STALE",
            "Authored relationship changed",
            "/source",
        ));
    }
    let rel = get(&current, "relationship").unwrap();
    let mut endpoint_refs = arr(get(rel, "source"))
        .iter()
        .chain(arr(get(rel, "target")))
        .collect::<Vec<_>>();
    if let Some(association) = get(rel, "associationRecord") {
        endpoint_refs.push(association);
    }
    for reference in endpoint_refs {
        let current_record = lookup_element(&source, reference)
            .ok_or_else(|| {
                err(
                    "RELATIONSHIP_EXTRA_SOURCE",
                    "Unresolved endpoint Record",
                    "/relationship",
                )
            })?
            .0;
        let authored_record = lookup_element(author_target, reference)
            .ok_or_else(|| {
                err(
                    "RELATIONSHIP_EXTRA_AUTHOR",
                    "Unresolved authored endpoint Record",
                    "/author/target",
                )
            })?
            .0;
        if !same(current_record, authored_record, c)? {
            return Err(err(
                "RELATIONSHIP_EXTRA_STALE",
                "Authored endpoint Record or Key changed",
                "/source",
            ));
        }
        for member in arr(get(current_record, "members")) {
            let current_field = lookup_element(&source, member)
                .ok_or_else(|| {
                    err(
                        "RELATIONSHIP_EXTRA_SOURCE",
                        "Unresolved endpoint Field",
                        "/relationship",
                    )
                })?
                .0;
            let authored_field = lookup_element(author_target, member)
                .ok_or_else(|| {
                    err(
                        "RELATIONSHIP_EXTRA_AUTHOR",
                        "Unresolved authored endpoint Field",
                        "/author/target",
                    )
                })?
                .0;
            if !same(current_field, authored_field, c)? {
                return Err(err(
                    "RELATIONSHIP_EXTRA_STALE",
                    "Authored endpoint Field changed",
                    "/source",
                ));
            }
        }
    }
    let path = raw(get(&current, "path")).cloned().unwrap_or_default();
    let system = text(get(&request, "system")).unwrap_or_default();
    let mode = text(get(&request, "mode")).unwrap_or_default();
    let refs = arr(get(rel, "source"))
        .iter()
        .chain(arr(get(rel, "target")))
        .collect::<Vec<_>>();
    let request_records = arr(get(&request, "records"));
    let mut names = std::collections::BTreeSet::<Utf16>::new();
    for record in request_records {
        let Some((rm, re)) = ident(record) else {
            return Err(err(
                "RELATIONSHIP_EXTRA_REQUEST",
                "Record identity required",
                "/request/records",
            ));
        };
        if !refs
            .iter()
            .any(|r| ident(r) == Some((rm.clone(), re.clone())))
            || !names.insert(raw(get(record, "name")).cloned().unwrap_or_default())
        {
            return Err(err(
                "RELATIONSHIP_EXTRA_REQUEST",
                "Record mappings must name distinct exact endpoints",
                "/request/records",
            ));
        }
        let native = text(get(record, "name")).unwrap_or_default();
        if if system == "rdf" {
            !iri(&native)
        } else {
            !name(&native)
        } {
            return Err(err(
                "RELATIONSHIP_EXTRA_REQUEST",
                "Invalid explicit native Record name",
                "/request/records",
            ));
        }
    }
    if request_records.len()
        != refs
            .iter()
            .map(|r| ident(r))
            .collect::<std::collections::BTreeSet<_>>()
            .len()
    {
        return Err(err(
            "RELATIONSHIP_EXTRA_REQUEST",
            "Every distinct endpoint needs one native Record name",
            "/request/records",
        ));
    }
    let mut residuals = Vec::new();
    loss(&mut residuals,&k("/"),&source,"Only the explicit relationship shape is represented; all other logical/native metadata and unknown content remain in the receipt","not-expressible",c)?;
    if let Value::Object(fields) = rel {
        for (key, value) in fields {
            let loss_path = pointer_child_units(path.units(), key);
            loss(
                &mut residuals,
                &loss_path,
                value,
                "Native syntax does not establish authored identity, target Keys, participation, lifecycle, inverse consistency or association identity",
                "not-expressible",
                c,
            )?;
        }
    }
    let unknown = arr(get(&current, "uninterpretedPaths"));
    let mut blocked = !unknown.is_empty();
    if blocked {
        loss(
            &mut residuals,
            &path,
            rel,
            "Unknown relationship qualifiers cannot govern native lowering",
            "not-expressible",
            c,
        )?;
    }
    if get(rel, "directed") == Some(&Value::Bool(false))
        && text(get(&request, "orientation")).as_deref() != Some("source-to-target")
    {
        blocked = true;
        loss(
            &mut residuals,
            &k("/request"),
            &request,
            "Undirected relationship needs explicit source-to-target display orientation",
            "not-expressible",
            c,
        )?;
    }
    if get(rel, "directed") == Some(&Value::Bool(true)) && get(&request, "orientation").is_some() {
        return Err(err(
            "RELATIONSHIP_EXTRA_REQUEST",
            "Orientation is only valid for undirected relationships",
            "/request/orientation",
        ));
    }
    let inverse_present = get(rel, "inverse").is_some_and(|v| !matches!(v, Value::Null));
    let inverse_name = match system.as_str() {
        "graphql" => get(&request, "inverseField"),
        "rdf" => get(&request, "inversePredicate"),
        _ => get(&request, "inverseSlot"),
    };
    if inverse_present != inverse_name.is_some() {
        return Err(err(
            "RELATIONSHIP_EXTRA_REQUEST",
            "Inverse native name must match declared inverse presence",
            "/request",
        ));
    }
    let mut archive = Value::Null;
    if system == "graphql" {
        let root = get(&request, "root").unwrap();
        let root_name = text(get(root, "typeName")).unwrap_or_default();
        let root_field = text(get(root, "fieldName")).unwrap_or_default();
        let field = text(get(&request, "field")).unwrap_or_default();
        if !name(&root_name)
            || !name(&root_field)
            || !name(&field)
            || names.contains(&k(&root_name))
            || ["String", "Boolean", "Int", "Float", "ID"].contains(&root_name.as_str())
            || request_records.iter().any(|r| {
                ["String", "Boolean", "Int", "Float", "ID"]
                    .contains(&text(get(r, "name")).unwrap_or_default().as_str())
            })
        {
            return Err(err(
                "RELATIONSHIP_EXTRA_REQUEST",
                "Invalid or colliding GraphQL name",
                "/request",
            ));
        }
        if request_records.iter().any(|record| {
            ["String", "Boolean", "Int", "Float", "ID"]
                .contains(&text(get(record, "name")).unwrap_or_default().as_str())
        }) {
            return Err(err(
                "RELATIONSHIP_EXTRA_REQUEST",
                "GraphQL Record name collides with a built-in scalar",
                "/request/records",
            ));
        }
        let mut defs = Vec::<String>::new();
        let mut all_names = names.clone();
        all_names.extend([k("String"), k("Boolean"), k("Int"), k("Float"), k("ID")]);
        if !all_names.insert(k(&root_name)) {
            return Err(err(
                "RELATIONSHIP_EXTRA_REQUEST",
                "GraphQL root type collides with a Record or built-in",
                "/request/root/typeName",
            ));
        }
        if get(&request, "inverseUnion").is_some() && inverse_name.is_none() {
            return Err(err(
                "RELATIONSHIP_EXTRA_REQUEST",
                "Inverse union requires an inverse field",
                "/request/inverseUnion",
            ));
        }
        let mut record_fields = Vec::<(String, Vec<String>)>::new();
        for r in request_records {
            let n = text(get(r, "name")).unwrap_or_default();
            let marker = text(get(r, "markerField")).unwrap_or_default();
            if !name(&marker) {
                return Err(err(
                    "RELATIONSHIP_EXTRA_REQUEST",
                    "GraphQL Record shell requires a safe marker field",
                    "/request/records",
                ));
            }
            record_fields.push((n, vec![format!("  {marker}: Boolean")]));
        }
        let mut endpoint_type = |refs: &[Value],
                                 union: Option<String>,
                                 defs: &mut Vec<String>,
                                 records: &[Value]|
         -> Result<String, EngineError> {
            if refs.len() == 1 {
                if union.is_some() {
                    return Err(err(
                        "RELATIONSHIP_EXTRA_REQUEST",
                        "Union policy on a homogeneous endpoint",
                        "/request",
                    ));
                }
                let id = ident(&refs[0]).ok_or_else(|| {
                    err(
                        "RELATIONSHIP_EXTRA_REQUEST",
                        "Malformed endpoint",
                        "/request",
                    )
                })?;
                return records
                    .iter()
                    .find(|r| ident(r) == Some(id.clone()))
                    .and_then(|r| text(get(r, "name")))
                    .ok_or_else(|| {
                        err(
                            "RELATIONSHIP_EXTRA_REQUEST",
                            "Unmapped endpoint",
                            "/request/records",
                        )
                    });
            }
            let union = union.ok_or_else(|| {
                err(
                    "RELATIONSHIP_EXTRA_REQUEST",
                    "Heterogeneous endpoint needs an explicit union name",
                    "/request",
                )
            })?;
            if !name(&union) || !all_names.insert(k(&union)) {
                return Err(err(
                    "RELATIONSHIP_EXTRA_REQUEST",
                    "Invalid GraphQL union name",
                    "/request",
                ));
            }
            let members = refs
                .iter()
                .map(|r| {
                    let id = ident(r)?;
                    records
                        .iter()
                        .find(|x| ident(x) == Some(id.clone()))
                        .and_then(|x| text(get(x, "name")))
                })
                .collect::<Option<Vec<_>>>()
                .ok_or_else(|| {
                    err(
                        "RELATIONSHIP_EXTRA_REQUEST",
                        "Unmapped endpoint",
                        "/request/records",
                    )
                })?;
            defs.push(format!("union {union} = {}", members.join(" | ")));
            Ok(union)
        };
        let target = endpoint_type(
            arr(get(rel, "target")),
            text(get(&request, "forwardUnion")),
            &mut defs,
            request_records,
        )?;
        let tm = get(rel, "targetMultiplicity").unwrap();
        let target_many = text(get(tm, "max")).as_deref() == Some("*")
            || get(tm, "max")
                .and_then(|v| {
                    if let Value::Number(n) = v {
                        Some(*n > 1.0)
                    } else {
                        None
                    }
                })
                .unwrap_or(false);
        let target_required = get(tm, "min").and_then(|v| {
            if let Value::Number(n) = v {
                Some(*n >= 1.0)
            } else {
                None
            }
        }) == Some(true);
        let target = if target_many {
            format!("[{target}]")
        } else if target_required {
            format!("{target}!")
        } else {
            target
        };
        for r in arr(get(rel, "source")) {
            let id = ident(r).unwrap();
            let rec = request_records
                .iter()
                .find(|x| ident(x) == Some(id.clone()))
                .and_then(|x| text(get(x, "name")))
                .unwrap();
            let fields = record_fields
                .iter_mut()
                .find(|(name, _)| name == &rec)
                .map(|(_, fields)| fields)
                .unwrap();
            if fields
                .iter()
                .any(|f| f.trim_start().starts_with(&format!("{field}:")))
            {
                return Err(err(
                    "RELATIONSHIP_EXTRA_REQUEST",
                    "GraphQL relationship field collides with marker field",
                    "/request/field",
                ));
            }
            fields.push(format!("  {field}: {target}"));
        }
        if let Some(inverse) = text(inverse_name) {
            let source = endpoint_type(
                arr(get(rel, "source")),
                text(get(&request, "inverseUnion")),
                &mut defs,
                request_records,
            )?;
            let sm = get(rel, "sourceMultiplicity").unwrap();
            let many = text(get(sm, "max")).as_deref() == Some("*")
                || get(sm, "max")
                    .and_then(|v| {
                        if let Value::Number(n) = v {
                            Some(*n > 1.0)
                        } else {
                            None
                        }
                    })
                    .unwrap_or(false);
            let required = get(sm, "min").and_then(|v| {
                if let Value::Number(n) = v {
                    Some(*n >= 1.0)
                } else {
                    None
                }
            }) == Some(true);
            let source = if many {
                format!("[{source}]")
            } else if required {
                format!("{source}!")
            } else {
                source
            };
            for r in arr(get(rel, "target")) {
                let id = ident(r).unwrap();
                let rec = request_records
                    .iter()
                    .find(|x| ident(x) == Some(id.clone()))
                    .and_then(|x| text(get(x, "name")))
                    .unwrap();
                let fields = record_fields
                    .iter_mut()
                    .find(|(name, _)| name == &rec)
                    .map(|(_, fields)| fields)
                    .unwrap();
                if fields
                    .iter()
                    .any(|line| line.trim_start().starts_with(&format!("{inverse}:")))
                {
                    return Err(err(
                        "RELATIONSHIP_EXTRA_REQUEST",
                        "GraphQL inverse field collides with an existing field",
                        "/request/inverseField",
                    ));
                }
                fields.push(format!("  {inverse}: {source}"));
            }
        }
        for (record, fields) in record_fields {
            defs.push(format!("type {record} {{\n{}\n}}", fields.join("\n")));
        }
        let mut all = vec![
            format!("schema {{\n  query: {root_name}\n}}"),
            format!("type {root_name} {{\n  {root_field}: Boolean\n}}"),
        ];
        all.extend(defs);
        let text = all.join("\n\n") + "\n";
        archive = obj(vec![("format", s("graphql-sdl")), ("text", s(&text))]);
        loss(&mut residuals,&k("/request"),&request,"Explicit Record markers and synthetic query root have no key, resolver or execution semantics; output/list wrappers cannot enforce stored participation","approximated",c)?;
    } else if system == "rdf" {
        let predicate = text(get(&request, "predicate")).unwrap_or_default();
        let inverse = text(get(&request, "inversePredicate"));
        if !iri(&predicate)
            || names.contains(&k(&predicate))
            || inverse
                .as_ref()
                .is_some_and(|v| !iri(v) || v == &predicate || names.contains(&k(v)))
        {
            return Err(err(
                "RELATIONSHIP_EXTRA_REQUEST",
                "Invalid or colliding RDF predicate IRI",
                "/request/predicate",
            ));
        }
        let rdf = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
        let rdfs = "http://www.w3.org/2000/01/rdf-schema#";
        let owl = "http://www.w3.org/2002/07/owl#";
        let mut quads = Vec::<String>::new();
        for rec in request_records {
            quads.push(format!(
                "<{}> <{rdf}type> <{owl}Class> .",
                text(get(rec, "name")).unwrap()
            ));
        }
        let endpoint = |values: &[Value],
                        label: &str,
                        quads: &mut Vec<String>,
                        records: &[Value]|
         -> Result<String, EngineError> {
            let names = values
                .iter()
                .map(|v| {
                    let id = ident(v)?;
                    records
                        .iter()
                        .find(|r| ident(r) == Some(id.clone()))
                        .and_then(|r| text(get(r, "name")))
                })
                .collect::<Option<Vec<_>>>()
                .ok_or_else(|| {
                    err(
                        "RELATIONSHIP_EXTRA_REQUEST",
                        "Unmapped endpoint",
                        "/request/records",
                    )
                })?;
            if names.len() == 1 {
                return Ok(format!("<{}>", names[0]));
            }
            let head = format!("_:umf_{label}");
            quads.extend([
                format!("{head} <{rdf}type> <{owl}Class> ."),
                format!("{head} <{owl}unionOf> _:umf_{label}_0 ."),
            ]);
            for (i, n) in names.iter().enumerate() {
                quads.extend([
                    format!("_:umf_{label}_{i} <{rdf}first> <{n}> ."),
                    format!(
                        "_:umf_{label}_{i} <{rdf}rest> {} .",
                        if i + 1 == names.len() {
                            format!("<{rdf}nil>")
                        } else {
                            format!("_:umf_{label}_{}", i + 1)
                        }
                    ),
                ]);
            }
            Ok(head)
        };
        let domain = endpoint(
            arr(get(rel, "source")),
            "domain",
            &mut quads,
            request_records,
        )?;
        let range = endpoint(
            arr(get(rel, "target")),
            "range",
            &mut quads,
            request_records,
        )?;
        quads.extend([
            format!("<{predicate}> <{rdf}type> <{owl}ObjectProperty> ."),
            format!("<{predicate}> <{rdfs}domain> {domain} ."),
            format!("<{predicate}> <{rdfs}range> {range} ."),
        ]);
        if let Some(inv) = inverse {
            quads.extend([
                format!("<{inv}> <{owl}inverseOf> <{predicate}> ."),
                format!("<{inv}> <{rdfs}domain> {range} ."),
                format!("<{inv}> <{rdfs}range> {domain} ."),
            ]);
        }
        archive = obj(vec![
            ("format", s("rdf-nquads")),
            ("text", s(&(quads.join("\n") + "\n"))),
            (
                "blankNodeScope",
                get(&request, "id").cloned().unwrap_or(Value::Null),
            ),
        ]);
        loss(&mut residuals,&k("/request"),&request,"RDFS domain/range entail class membership rather than validate references; OWL union is a disjunction, and inverse properties imply triples without enforcing participation","approximated",c)?;
    } else {
        let schema_id = text(get(&request, "schemaId")).unwrap_or_default();
        let schema_name = text(get(&request, "schemaName")).unwrap_or_default();
        let slot = text(get(&request, "slot")).unwrap_or_default();
        let inverse_slot = text(inverse_name);
        if !iri(&schema_id)
            || !name(&schema_name)
            || !name(&slot)
            || inverse_slot
                .as_ref()
                .is_some_and(|v| !name(v) || v == &slot)
        {
            return Err(err(
                "RELATIONSHIP_EXTRA_REQUEST",
                "Invalid LinkML schema or slot name",
                "/request",
            ));
        }
        let heterogeneous = arr(get(rel, "target")).len() != 1
            || inverse_slot.is_some() && arr(get(rel, "source")).len() != 1;
        if heterogeneous {
            blocked = true;
            loss(
                &mut residuals,
                &path,
                rel,
                "This LinkML class-range profile cannot represent a heterogeneous slot range",
                "not-expressible",
                c,
            )?;
        }
        let mut classes = Vec::<(Utf16, Value)>::new();
        for record in request_records {
            let n = raw(get(record, "name")).unwrap().clone();
            classes.push((n, obj(vec![("slots", Value::Array(Vec::new()))])));
        }
        let target_id = ident(&arr(get(rel, "target"))[0]).unwrap();
        let target_name = request_records
            .iter()
            .find(|x| ident(x) == Some(target_id.clone()))
            .and_then(|x| text(get(x, "name")))
            .unwrap();
        let tm = get(rel, "targetMultiplicity").unwrap();
        let many = text(get(tm, "max")).as_deref() == Some("*")
            || get(tm, "max")
                .and_then(|v| {
                    if let Value::Number(n) = v {
                        Some(*n > 1.0)
                    } else {
                        None
                    }
                })
                .unwrap_or(false);
        let required = get(tm, "min")
            .and_then(|v| {
                if let Value::Number(n) = v {
                    Some(*n > 0.0)
                } else {
                    None
                }
            })
            .unwrap_or(false);
        let mut slot_members = vec![(
            k(&slot),
            obj(vec![
                ("range", s(&target_name)),
                ("multivalued", Value::Bool(many)),
                ("required", Value::Bool(required)),
            ]),
        )];
        if let Some(inverse) = inverse_slot.as_deref() {
            let source_id = ident(&arr(get(rel, "source"))[0]).unwrap();
            let source_name = request_records
                .iter()
                .find(|x| ident(x) == Some(source_id.clone()))
                .and_then(|x| text(get(x, "name")))
                .unwrap();
            let sm = get(rel, "sourceMultiplicity").unwrap();
            let inverse_many = text(get(sm, "max")).as_deref() == Some("*")
                || get(sm, "max")
                    .and_then(|v| match v {
                        Value::Number(n) => Some(*n > 1.0),
                        _ => None,
                    })
                    .unwrap_or(false);
            let inverse_required = get(sm, "min")
                .and_then(|v| match v {
                    Value::Number(n) => Some(*n > 0.0),
                    _ => None,
                })
                .unwrap_or(false);
            slot_members.push((
                k(inverse),
                obj(vec![
                    ("range", s(&source_name)),
                    ("multivalued", Value::Bool(inverse_many)),
                    ("required", Value::Bool(inverse_required)),
                ]),
            ));
        }
        let slots = Value::Object(slot_members);
        for source_ref in arr(get(rel, "source")) {
            let id = ident(source_ref).unwrap();
            let rn = request_records
                .iter()
                .find(|x| ident(x).as_ref() == Some(&id))
                .and_then(|x| raw(get(x, "name")))
                .unwrap();
            if let Some((_, class)) = classes.iter_mut().find(|(n, _)| n == rn) {
                if let Value::Array(items) = get(class, "slots").unwrap() {
                    let mut items = items.clone();
                    items.push(s(&slot));
                    set(class, "slots", Value::Array(items))?;
                }
            }
        }
        if let Some(inverse) = inverse_slot.as_deref() {
            for target_ref in arr(get(rel, "target")) {
                let id = ident(target_ref).unwrap();
                let rn = request_records
                    .iter()
                    .find(|x| ident(x).as_ref() == Some(&id))
                    .and_then(|x| raw(get(x, "name")))
                    .unwrap();
                if let Some((_, class)) = classes.iter_mut().find(|(n, _)| n == rn) {
                    if let Value::Array(items) = get(class, "slots").unwrap() {
                        let mut items = items.clone();
                        items.push(s(inverse));
                        set(class, "slots", Value::Array(items))?;
                    }
                }
            }
        }
        let document = obj(vec![
            ("id", s(&schema_id)),
            ("name", s(&schema_name)),
            (
                "prefixes",
                obj(vec![("umf", s("https://example.org/umf-extra/"))]),
            ),
            ("default_prefix", s("umf")),
            ("classes", Value::Object(classes)),
            ("slots", slots),
        ]);
        let rendered = serialization::write_json_value(&document, Format::Json, c)?;
        let text = String::from_utf16(rendered.units()).map_err(|_| {
            err(
                "RELATIONSHIP_EXTRA_ENCODING",
                "Could not encode LinkML JSON",
                "/request",
            )
        })? + "\n";
        archive = obj(vec![("format", s("linkml-json")), ("text", s(&text))]);
        loss(&mut residuals,&k("/request"),&request,"Slot range, required and multivalued metadata do not name target Keys, enforce distinct-record participation or validate instances; native defaults/facets remain separate","approximated",c)?;
    }
    let semantically_blocked = blocked;
    if semantically_blocked || mode == "strict" {
        let outcome = if semantically_blocked {
            "not-expressible"
        } else {
            "unknown"
        };
        let diagnostics = residuals
            .iter()
            .map(|row| diag_from_loss(row, true))
            .collect();
        let result = obj(vec![
            ("operation", s("project-relationship-extra")),
            ("version", s("1.0.0")),
            ("status", s("blocked")),
            ("source", source),
            ("author", author),
            ("request", request),
            ("binding", s(binding(&system))),
            ("outcome", s(outcome)),
            ("mappings", Value::Array(Vec::new())),
            ("residuals", Value::Array(residuals)),
            ("diagnostics", Value::Array(diagnostics)),
        ]);
        validate_schema(&result, &schema, &rt, c, "RELATIONSHIP_EXTRA_RESULT")?;
        return Ok(result);
    }
    Ok(obj(vec![
        ("operation", s("prepare-relationship-extra")),
        ("version", s("1.0.0")),
        ("status", s("prepared")),
        ("source", source),
        ("author", author),
        ("request", request),
        ("binding", s(binding(&system))),
        ("outcome", s("approximated")),
        ("nativeArchive", archive),
        ("relationshipPath", Value::String(path)),
        ("relationship", copy_json(rel, c)?),
        ("residuals", Value::Array(residuals)),
    ]))
}

/// Attach the native parser's output while Rust retains ownership of result
/// status, observation paths, mappings, diagnostics and recovery content.
pub fn complete_relationship_to_extra(
    prepared: &Value,
    target: &Value,
    c: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let status = text(get(prepared, "status")).unwrap_or_default();
    if status != "prepared" {
        return Err(err(
            "RELATIONSHIP_EXTRA_RECEIPT",
            "Only a report-mode prepared candidate can be completed",
            "",
        ));
    }
    let request = get(prepared, "request").unwrap();
    let system = text(get(request, "system")).unwrap_or_default();
    let source = get(prepared, "source").unwrap();
    let archive = get(prepared, "nativeArchive").unwrap();
    let id = text(get(request, "id"));
    if id != text(get(target, "id")) {
        return Err(err(
            "RELATIONSHIP_EXTRA_TARGET",
            "Native parser returned a target with a different id",
            "/target/id",
        ));
    }
    let (native_module, native_element, extension) = match system.as_str() {
        "graphql" => ("schema", "schema", "umf.graphql"),
        "rdf" => ("dataset", "dataset", "umf.rdf"),
        _ => ("schema", "schema", "umf.linkml"),
    };
    let payload = arr(get(target, "modules"))
        .iter()
        .find(|m| text(get(m, "id")).as_deref() == Some(native_module))
        .and_then(|m| {
            arr(get(m, "elements"))
                .iter()
                .find(|e| text(get(e, "id")).as_deref() == Some(native_element))
        })
        .and_then(|e| get(e, "extensions"))
        .and_then(|e| get(e, extension))
        .ok_or_else(|| {
            err(
                "RELATIONSHIP_EXTRA_TARGET",
                "Native parser omitted target payload",
                "/target",
            )
        })?;
    if text(get(payload, "originalSource")) != text(get(archive, "text")) {
        return Err(err(
            "RELATIONSHIP_EXTRA_TARGET",
            "Parsed native target does not retain the prepared archive",
            "/target",
        ));
    }
    if system == "rdf" && get(payload, "blankNodeScope") != get(archive, "blankNodeScope") {
        return Err(err(
            "RELATIONSHIP_EXTRA_TARGET",
            "Parsed RDF target has a different blank-node scope",
            "/target",
        ));
    }
    if system == "linkml" {
        let expected_format = if text(get(archive, "format")).as_deref() == Some("linkml-yaml") {
            "yaml"
        } else {
            "json"
        };
        if text(get(payload, "originalFormat")).as_deref() != Some(expected_format) {
            return Err(err(
                "RELATIONSHIP_EXTRA_TARGET",
                "Parsed LinkML target has a different source format",
                "/target",
            ));
        }
    }
    let (module_index, element_index, _) = native_location(target, &system).ok_or_else(|| {
        err("RELATIONSHIP_EXTRA_TARGET", "Native parser omitted target payload", "/target")
    })?;
    let payload_path = format!("/modules/{module_index}/elements/{element_index}/extensions/umf.{system}");
    let path = raw(get(prepared, "relationshipPath")).unwrap();
    let rel = get(prepared, "relationship").unwrap();
    let mut mappings = Vec::new();
    if system == "graphql" {
        let defs = get(
            get(
                get(arr(get(target, "modules")).first().unwrap(), "elements")
                    .and_then(|x| arr(Some(x)).first())
                    .unwrap(),
                "extensions",
            )
            .unwrap(),
            "umf.graphql",
        )
        .unwrap();
        let ast = get(defs, "ast").unwrap();
        let definitions = arr(get(ast, "definitions"));
        let names: std::collections::BTreeSet<String> = definitions
            .iter()
            .filter(|d| {
                matches!(
                    text(get(d, "kind")).as_deref(),
                    Some(
                        "ObjectTypeDefinition" | "UnionTypeDefinition" | "InterfaceTypeDefinition"
                    )
                )
            })
            .filter_map(|d| text(get(get(d, "name").unwrap_or(&Value::Null), "value")))
            .collect();
        for (di, d) in definitions.iter().enumerate() {
            let kind = text(get(d, "kind"));
            if !matches!(
                kind.as_deref(),
                Some("ObjectTypeDefinition" | "InterfaceTypeDefinition")
            ) {
                continue;
            }
            for (fi, f) in arr(get(d, "fields")).iter().enumerate() {
                let mut t = get(f, "type").unwrap();
                while text(get(t, "kind")).as_deref() != Some("NamedType") {
                    t = get(t, "type").ok_or_else(|| {
                        err(
                            "RELATIONSHIP_EXTRA_TARGET",
                            "Malformed GraphQL type reference",
                            "/target",
                        )
                    })?;
                }
                let name = text(get(get(t, "name").unwrap(), "value")).unwrap_or_default();
                if names.contains(&name) {
                    let native = pointer_child(
                        &format!("{payload_path}/ast/definitions"),
                        &Utf16::from(di.to_string()),
                    );
                    let native =
                        pointer_child(&String::from_utf16(native.units()).unwrap(), &k("fields"));
                    let native = pointer_child(
                        &String::from_utf16(native.units()).unwrap(),
                        &Utf16::from(fi.to_string()),
                    );
                    mappings.push(obj(vec![
                        ("idealPath", Value::String(path.clone())),
                        ("nativePath", Value::String(native)),
                        ("outcome", s("approximated")),
                        ("provenance", s("explicit-author-declaration")),
                    ]));
                }
            }
        }
    } else if system == "rdf" {
        let modules = arr(get(target, "modules"));
        let module = modules
            .iter()
            .find(|m| text(get(m, "id")).as_deref() == Some("dataset"))
            .ok_or_else(|| {
                err(
                    "RELATIONSHIP_EXTRA_TARGET",
                    "RDF parser omitted dataset module",
                    "/target",
                )
            })?;
        let element = arr(get(module, "elements"))
            .iter()
            .find(|e| text(get(e, "id")).as_deref() == Some("dataset"))
            .ok_or_else(|| {
                err(
                    "RELATIONSHIP_EXTRA_TARGET",
                    "RDF parser omitted dataset element",
                    "/target",
                )
            })?;
        let ext = get(get(element, "extensions").unwrap(), "umf.rdf").unwrap();
        let quads = arr(get(ext, "quads"));
        for (i, q) in quads.iter().enumerate() {
            let p = text(get(get(q, "predicate").unwrap(), "value"));
            if p.as_deref().is_some_and(|p| {
                p == "http://www.w3.org/2000/01/rdf-schema#domain"
                    || p == "http://www.w3.org/2000/01/rdf-schema#range"
                    || p == "http://www.w3.org/2002/07/owl#unionOf"
                    || p == "http://www.w3.org/1999/02/22-rdf-syntax-ns#first"
                    || p == "http://www.w3.org/1999/02/22-rdf-syntax-ns#rest"
            }) {
                mappings.push(obj(vec![
                    ("idealPath", Value::String(path.clone())),
                    (
                        "nativePath",
                        s(&format!(
                            "/modules/{}/elements/0/extensions/umf.rdf/quads/{i}",
                            modules
                                .iter()
                                .position(|m| std::ptr::eq(m, module))
                                .unwrap_or(0)
                        )),
                    ),
                    ("outcome", s("approximated")),
                    ("provenance", s("explicit-author-declaration")),
                ]));
            }
        }
    } else {
        let module = arr(get(target, "modules")).first().ok_or_else(|| {
            err(
                "RELATIONSHIP_EXTRA_TARGET",
                "LinkML parser omitted schema module",
                "/target",
            )
        })?;
        let element = arr(get(module, "elements")).first().ok_or_else(|| {
            err(
                "RELATIONSHIP_EXTRA_TARGET",
                "LinkML parser omitted schema element",
                "/target",
            )
        })?;
        let ext = get(get(element, "extensions").unwrap(), "umf.linkml").unwrap();
        let root = get(ext, "root").unwrap();
        let base = "/modules/0/elements/0/extensions/umf.linkml/root/members";
        for kind in ["classes", "slots"] {
            if let Some(group) = tagged_member(root, kind) {
                if let Some(Value::Object(members)) = get(group, "members") {
                    for (key, _) in members {
                        let group_path = pointer_child(base, &k(kind));
                        let members_path = pointer_child_units(group_path.units(), &k("members"));
                        let field = pointer_child_units(members_path.units(), key);
                        mappings.push(obj(vec![
                            ("idealPath", Value::String(path.clone())),
                            ("nativePath", Value::String(field)),
                            ("outcome", s("approximated")),
                            ("provenance", s("explicit-author-declaration")),
                        ]));
                    }
                }
            }
        }
    }
    let residuals = arr(get(prepared, "residuals"))
        .iter()
        .map(|x| copy_json(x, c))
        .collect::<Result<Vec<_>, _>>()?;
    let diagnostics = residuals.iter().map(|x| diag_from_loss(x, false)).collect();
    let mut result = obj(vec![
        ("operation", s("project-relationship-extra")),
        ("version", s("1.0.0")),
        ("status", s("projected")),
        ("source", copy_json(source, c)?),
        ("target", copy_json(target, c)?),
        ("author", copy_json(get(prepared, "author").unwrap(), c)?),
        ("request", copy_json(request, c)?),
        ("binding", copy_json(get(prepared, "binding").unwrap(), c)?),
        ("outcome", s("approximated")),
        ("nativeArchive", copy_json(archive, c)?),
        ("mappings", Value::Array(mappings)),
        ("residuals", Value::Array(residuals)),
        ("diagnostics", Value::Array(diagnostics)),
    ]);
    let rt = runtime(c)?;
    let schema = parse(RESULT, c)?;
    validate_schema(&result, &schema, &rt, c, "RELATIONSHIP_EXTRA_RESULT")?;
    let _ = rel;
    Ok(result)
}

fn tagged_member<'a>(node: &'a Value, name: &str) -> Option<&'a Value> {
    get(node, name).or_else(|| get(get(node, "members")?, name))
}
fn native_location<'a>(doc: &'a Value, system: &str) -> Option<(usize, usize, &'a Value)> {
    let module_id = if system == "rdf" { "dataset" } else { "schema" };
    for (mi, module) in arr(get(doc, "modules")).iter().enumerate() {
        if text(get(module, "id")).as_deref() != Some(module_id) {
            continue;
        }
        for (ei, element) in arr(get(module, "elements")).iter().enumerate() {
            if text(get(element, "id")).as_deref() == Some(module_id) {
                let extension = get(get(element, "extensions")?, &format!("umf.{system}"))?;
                return Some((mi, ei, extension));
            }
        }
    }
    None
}
fn native_extension<'a>(doc: &'a Value, system: &str) -> Option<&'a Value> {
    native_location(doc, system).map(|(_, _, extension)| extension)
}

fn extra_observations(
    system: &str,
    source: &Value,
    c: &mut Context<'_>,
) -> Result<Vec<Value>, EngineError> {
    let (module_index, element_index, ext) = native_location(source, system).ok_or_else(|| {
        err(
            "RELATIONSHIP_EXTRA_SOURCE",
            "Native schema or dataset payload is missing",
            "/modules",
        )
    })?;
    let mut out = Vec::new();
    let payload_path =
        format!("/modules/{module_index}/elements/{element_index}/extensions/umf.{system}");
    let add = |out: &mut Vec<Value>, path: Utf16, kind: &str| {
        out.push(obj(vec![
            ("nativePath", Value::String(path)),
            ("kind", s(kind)),
            ("provenance", s("inferred")),
            ("authorIntent", s("unknown")),
        ]));
    };
    if system == "rdf" {
        for (i, q) in arr(get(ext, "quads")).iter().enumerate() {
            c.charge_work(1, Utf16::default())?;
            let p = text(get(get(q, "predicate").unwrap_or(&Value::Null), "value"));
            let kind = match p.as_deref() {
                Some("http://www.w3.org/2000/01/rdf-schema#domain") => Some("rdf-domain"),
                Some("http://www.w3.org/2000/01/rdf-schema#range") => Some("rdf-range"),
                Some("http://www.w3.org/2002/07/owl#unionOf") => Some("rdf-union"),
                Some("http://www.w3.org/1999/02/22-rdf-syntax-ns#first")
                | Some("http://www.w3.org/1999/02/22-rdf-syntax-ns#rest") => Some("rdf-list"),
                _ => None,
            };
            if let Some(kind) = kind {
                add(&mut out, k(&format!("{payload_path}/quads/{i}")), kind);
            }
        }
    } else if system == "linkml" {
        let root = get(ext, "root").ok_or_else(|| {
            err(
                "RELATIONSHIP_EXTRA_SOURCE",
                "LinkML root is missing",
                "/modules",
            )
        })?;
        for (group, kind) in [("classes", "linkml-class"), ("slots", "linkml-slot")] {
            if let Some(node) = tagged_member(root, group) {
                if let Some(Value::Object(members)) = get(node, "members") {
                    for (name, _) in members {
                        let p = pointer_child(&format!("{payload_path}/root/members"), &k(group));
                        let p = pointer_child_units(p.units(), &k("members"));
                        add(&mut out, pointer_child_units(p.units(), name), kind);
                    }
                }
            }
        }
    } else {
        let ast = get(ext, "ast").ok_or_else(|| {
            err(
                "RELATIONSHIP_EXTRA_SOURCE",
                "GraphQL AST is missing",
                "/modules",
            )
        })?;
        let definitions = arr(get(ast, "definitions"));
        let names: std::collections::BTreeSet<String> = definitions
            .iter()
            .filter(|d| {
                matches!(
                    text(get(d, "kind")).as_deref(),
                    Some(
                        "ObjectTypeDefinition" | "UnionTypeDefinition" | "InterfaceTypeDefinition"
                    )
                )
            })
            .filter_map(|d| text(get(get(d, "name")?, "value")))
            .collect();
        for (di, d) in definitions.iter().enumerate() {
            if !matches!(
                text(get(d, "kind")).as_deref(),
                Some("ObjectTypeDefinition" | "InterfaceTypeDefinition")
            ) {
                continue;
            }
            for (fi, f) in arr(get(d, "fields")).iter().enumerate() {
                let mut ty = get(f, "type").ok_or_else(|| {
                    err(
                        "RELATIONSHIP_EXTRA_SOURCE",
                        "GraphQL field type is missing",
                        "/modules",
                    )
                })?;
                while text(get(ty, "kind")).as_deref() != Some("NamedType") {
                    ty = get(ty, "type").ok_or_else(|| {
                        err(
                            "RELATIONSHIP_EXTRA_SOURCE",
                            "Malformed GraphQL type reference",
                            "/modules",
                        )
                    })?;
                }
                if text(get(get(ty, "name").unwrap_or(&Value::Null), "value"))
                    .is_some_and(|n| names.contains(&n))
                {
                    let p = pointer_child(
                        "/modules/0/elements/0/extensions/umf.graphql/ast/definitions",
                        &Utf16::from(di.to_string()),
                    );
                    let p = String::from_utf16(p.units()).unwrap_or_default();
                    let p = pointer_child(&p, &k("fields"));
                    let p = String::from_utf16(p.units()).unwrap_or_default();
                    add(
                        &mut out,
                        pointer_child(&p, &Utf16::from(fi.to_string())),
                        "graphql-field",
                    );
                }
            }
        }
    }
    Ok(out)
}
fn validate_classification_request<'a>(
    request: &'a Value,
) -> Result<(String, String, &'a Value), EngineError> {
    let Value::Object(fields) = request else {
        return Err(err(
            "RELATIONSHIP_EXTRA_REQUEST",
            "Classification request must be an object",
            "/request",
        ));
    };
    if fields.len() != 3
        || ["system", "mode", "archive"]
            .iter()
            .any(|name| get(request, name).is_none())
    {
        return Err(err(
            "RELATIONSHIP_EXTRA_REQUEST",
            "Classification request must contain only system, mode and archive",
            "/request",
        ));
    }
    let system = text(get(request, "system")).ok_or_else(|| {
        err(
            "RELATIONSHIP_EXTRA_REQUEST",
            "Native system is required",
            "/request/system",
        )
    })?;
    let mode = text(get(request, "mode")).ok_or_else(|| {
        err(
            "RELATIONSHIP_EXTRA_REQUEST",
            "Classification mode is required",
            "/request/mode",
        )
    })?;
    if !matches!(system.as_str(), "graphql" | "rdf" | "linkml")
        || !matches!(mode.as_str(), "strict" | "report")
    {
        return Err(err(
            "RELATIONSHIP_EXTRA_REQUEST",
            "Unsupported classification system or mode",
            "/request",
        ));
    }
    let archive = get(request, "archive").ok_or_else(|| {
        err(
            "RELATIONSHIP_EXTRA_REQUEST",
            "Native archive is required",
            "/request/archive",
        )
    })?;
    let Value::Object(fields) = archive else {
        return Err(err(
            "RELATIONSHIP_EXTRA_REQUEST",
            "Native archive must be an object",
            "/request/archive",
        ));
    };
    let format = text(get(archive, "format")).ok_or_else(|| {
        err(
            "RELATIONSHIP_EXTRA_REQUEST",
            "Archive format is required",
            "/request/archive/format",
        )
    })?;
    let valid_format = match system.as_str() {
        "graphql" => format == "graphql-sdl",
        "rdf" => format == "rdf-nquads",
        _ => matches!(format.as_str(), "linkml-json" | "linkml-yaml"),
    };
    if !valid_format {
        return Err(err(
            "RELATIONSHIP_EXTRA_REQUEST",
            "Native archive format does not match system",
            "/request/archive/format",
        ));
    }
    let rdf = format == "rdf-nquads";
    let allowed = if rdf {
        &["format", "text", "blankNodeScope"][..]
    } else {
        &["format", "text"][..]
    };
    if fields.len() != allowed.len()
        || fields
            .iter()
            .any(|(name, _)| !allowed.iter().any(|allowed| name == &k(allowed)))
    {
        return Err(err(
            "RELATIONSHIP_EXTRA_REQUEST",
            "Native archive has unknown or missing members",
            "/request/archive",
        ));
    }
    let archive_text = raw(get(archive, "text")).ok_or_else(|| {
        err(
            "RELATIONSHIP_EXTRA_REQUEST",
            "Archive text is required",
            "/request/archive/text",
        )
    })?;
    if archive_text.len() > 4_000_000 {
        return Err(err(
            "RELATIONSHIP_EXTRA_REQUEST",
            "Archive text exceeds the pinned limit",
            "/request/archive/text",
        ));
    }
    if rdf && text(get(archive, "blankNodeScope")).is_none_or(|scope| scope.is_empty()) {
        return Err(err(
            "RELATIONSHIP_EXTRA_REQUEST",
            "RDF archive requires a nonempty blank-node scope",
            "/request/archive/blankNodeScope",
        ));
    }
    Ok((system, mode, archive))
}

pub fn classify_relationship_extra(
    source: &Value,
    request: &Value,
    fresh: &Value,
    c: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(c)?;
    let (system, mode, _archive) = validate_classification_request(request)?;
    let validation = rt
        .engine
        .validate_document(source, &rt.registry, &mut NoCapabilities, c)?;
    if !validation.valid || text(get(source, "umf")).as_deref() != Some("0.10.0") {
        return Err(err(
            "RELATIONSHIP_EXTRA_SOURCE",
            "Valid core 0.10.0 native source document required",
            "",
        ));
    }
    let source_ext = native_extension(source, &system).ok_or_else(|| {
        err(
            "RELATIONSHIP_EXTRA_SOURCE",
            "Native payload missing",
            "/modules",
        )
    })?;
    let fresh_ext = native_extension(fresh, &system).ok_or_else(|| {
        err(
            "RELATIONSHIP_EXTRA_TARGET",
            "Native importer omitted payload",
            "/target",
        )
    })?;
    if !same(source_ext, fresh_ext, c)? {
        return Err(err(
            "RELATIONSHIP_EXTRA_SOURCE",
            "Archive does not match retained native payload",
            "/request/archive",
        ));
    }
    let mut residuals=vec![obj(vec![("path",s("/")),("value",copy_json(source,c)?),("outcome",s("not-expressible")),("reason",s("Native syntax does not establish authored relationship identity, target Keys, participation or lifecycle; preserve all original native and unknown source content")),("recovery",s("retained-source"))])];
    let unsupported = if system == "linkml" {
        let version = text(get(source_ext, "metamodelVersion"));
        let root = get(source_ext, "root").unwrap_or(&Value::Null);
        let declared = tagged_member(root, "metamodel_version");
        let root_invalid = text(get(root, "kind")).as_deref() != Some("object");
        let version_invalid = version.as_deref() != Some("1.11.0")
            || declared.is_some_and(|node| {
                text(get(node, "kind")).as_deref() != Some("string")
                    || text(get(node, "value")) != version
            });
        root_invalid || version_invalid
    } else {
        false
    };
    if unsupported {
        residuals.push(obj(vec![
            ("path", s("/")),
            ("value", copy_json(source, c)?),
            ("outcome", s("unknown")),
            (
                "reason",
                s("Unrecognized LinkML metamodel version remains archived without classification"),
            ),
            ("recovery", s("retained-source")),
        ]));
    }
    let blocked = mode == "strict" || unsupported;
    let diagnostics = residuals
        .iter()
        .map(|x| diag_from_loss(x, blocked))
        .collect();
    let mut result = obj(vec![
        ("operation", s("classify-relationship-extra")),
        ("version", s("1.0.0")),
        ("status", s(if blocked { "blocked" } else { "classified" })),
        ("source", copy_json(source, c)?),
        ("request", copy_json(request, c)?),
        ("binding", s(binding(&system))),
        ("outcome", s("unknown")),
        (
            "observations",
            if unsupported {
                Value::Array(Vec::new())
            } else {
                Value::Array(extra_observations(&system, source, c)?)
            },
        ),
        ("residuals", Value::Array(residuals)),
        ("diagnostics", Value::Array(diagnostics)),
    ]);
    if !blocked {
        set(&mut result, "target", copy_json(source, c)?)?;
    }
    let schema = parse(RESULT, c)?;
    validate_schema(&result, &schema, &rt, c, "RELATIONSHIP_EXTRA_RESULT")?;
    Ok(result)
}

pub fn verify_relationship_extra(
    receipt: &Value,
    fresh: &Value,
    current: Option<&Value>,
    c: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(c)?;
    let schema = parse(RESULT, c)?;
    validate_schema(receipt, &schema, &rt, c, "RELATIONSHIP_EXTRA_RECEIPT")?;
    let source = get(receipt, "source").unwrap();
    if text(get(receipt, "operation")).as_deref() == Some("classify-relationship-extra") {
        let expected =
            classify_relationship_extra(source, get(receipt, "request").unwrap(), fresh, c)?;
        if !same(receipt, &expected, c)? {
            return Err(err(
                "RELATIONSHIP_EXTRA_RECEIPT",
                "Forged classification receipt",
                "",
            ));
        }
        if let Some(current) = current {
            let target = get(&expected, "target").ok_or_else(|| {
                err(
                    "RELATIONSHIP_EXTRA_STALE",
                    "Classification has no report target",
                    "/target",
                )
            })?;
            if !same(target, current, c)? {
                return Err(err(
                    "RELATIONSHIP_EXTRA_STALE",
                    "Current classification target changed",
                    "/target",
                ));
            }
        }
        return copy_json(receipt, c);
    }
    if text(get(receipt, "operation")).as_deref() != Some("project-relationship-extra")
        || text(get(receipt, "status")).as_deref() != Some("projected")
    {
        return Err(err(
            "RELATIONSHIP_EXTRA_RECEIPT",
            "Projected relationship extras receipt required",
            "",
        ));
    }
    let request = get(receipt, "request").unwrap();
    if let Some(current) = current {
        let mut normalized = copy_json(current, c)?;
        set(
            &mut normalized,
            "id",
            copy_json(get(request, "id").unwrap_or(&Value::Null), c)?,
        )?;
        if !same(get(receipt, "target").unwrap(), &normalized, c)? {
            return Err(err(
                "RELATIONSHIP_EXTRA_STALE",
                "Current target changed",
                "/target",
            ));
        }
    }
    let prepared =
        prepare_relationship_to_extra(source, get(receipt, "author").unwrap(), request, c)?;
    let expected = complete_relationship_to_extra(&prepared, fresh, c)?;
    if !same(receipt, &expected, c)? {
        return Err(err(
            "RELATIONSHIP_EXTRA_RECEIPT",
            "Receipt differs from retained source, author and freshly imported target",
            "",
        ));
    }
    copy_json(receipt, c)
}
pub fn recover_relationship_extra_ideal(
    receipt: &Value,
    fresh: &Value,
    current: Option<&Value>,
    c: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let v = verify_relationship_extra(receipt, fresh, current, c)?;
    if text(get(&v, "operation")).as_deref() != Some("project-relationship-extra") {
        return Err(err(
            "RELATIONSHIP_EXTRA_RECEIPT",
            "Authored projection required",
            "",
        ));
    }
    copy_json(get(&v, "source").unwrap(), c)
}
pub fn recover_relationship_extra_native(
    receipt: &Value,
    fresh: &Value,
    current: Option<&Value>,
    c: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let v = verify_relationship_extra(receipt, fresh, current, c)?;
    let classified = text(get(&v, "operation")).as_deref() == Some("classify-relationship-extra");
    let archive = if classified {
        get(get(&v, "request").unwrap(), "archive").unwrap()
    } else {
        get(&v, "nativeArchive").unwrap()
    };
    let document = if classified {
        get(&v, "source").unwrap()
    } else {
        get(&v, "target").unwrap()
    };
    Ok(obj(vec![
        ("document", copy_json(document, c)?),
        ("archive", copy_json(archive, c)?),
    ]))
}
