// SPDX-License-Identifier: MIT OR Apache-2.0
//! Explicit, loss-aware lowering of one authored core relationship to an Avro
//! target-key reference carrier. Avro structure never supplies ideal intent.
use crate::{
    avro_document,
    context::Context,
    engine::{Capabilities, Engine, ResourceSet, SemanticContext},
    error::{Diagnostic, EngineError},
    registry::Registry,
    serialization::{self, Format},
    value::{copy_json, Utf16, Value},
};
use std::sync::{Arc, OnceLock};
const CORE: &str = include_str!("../../../spec/core/schema.json");
const RESULT: &str = include_str!("../../../spec/core/relationship-avro-projection.schema.json");
const RELATIONSHIP_OP: &str = include_str!("../../../spec/core/relationship-operation.schema.json");
const RECOVERY: &str = "Retained receipt recovers authored source and emitted native archive; native-only import does not establish authored intent";
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
fn get_utf16<'a>(v: &'a Value, key: &Utf16) -> Option<&'a Value> {
    if let Value::Object(m) = v {
        m.iter()
            .find(|(name, _)| name == key)
            .map(|(_, value)| value)
    } else {
        None
    }
}
fn raw_text(v: Option<&Value>) -> Option<&Utf16> {
    if let Some(Value::String(value)) = v {
        Some(value)
    } else {
        None
    }
}
fn pointer_value<'a>(source: &'a Value, path: &Utf16) -> Option<&'a Value> {
    let mut cur = source;
    let units = path.units();
    if units.first() != Some(&(b'/' as u16)) {
        return None;
    }
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
                        // Invalid JSON Pointer escapes remain literal source
                        // units; consume only the tilde so the following unit
                        // is processed normally rather than skipped.
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
        cur = match cur {
            Value::Object(_) => get_utf16(cur, &segment)?,
            Value::Array(items) => {
                let index = segment.to_utf8().ok()?.parse::<usize>().ok()?;
                items.get(index)?
            }
            _ => return None,
        };
    }
    Some(cur)
}
fn loss_raw_path(
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
fn arr(v: Option<&Value>) -> &[Value] {
    if let Some(Value::Array(a)) = v {
        a
    } else {
        &[]
    }
}
fn text(v: Option<&Value>) -> Option<String> {
    if let Some(Value::String(x)) = v {
        x.to_utf8().ok()
    } else {
        None
    }
}
fn err(c: &str, m: &str, p: &str) -> EngineError {
    EngineError::new(c, k(p), m)
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
    let r = Arc::new(Runtime {
        engine,
        registry: Registry::new(),
    });
    if c.profile() == crate::context::ResourceProfile::Cooperative
        && c.limits() == crate::context::Limits::ordinary()
    {
        let _ = CACHE.set(r.clone());
    }
    Ok(r)
}
fn canonical(value: &Value, c: &mut Context<'_>) -> Result<Value, EngineError> {
    c.charge_work(1, Utf16::default())?;
    match value {
        Value::Array(items) => {
            c.charge_work(items.len(), Utf16::default())?;
            Ok(Value::Array(
                items
                    .iter()
                    .map(|v| canonical(v, c))
                    .collect::<Result<_, _>>()?,
            ))
        }
        Value::Object(members) => {
            let sort_work = members.len().saturating_mul(
                (usize::BITS - usize::max(members.len(), 1).leading_zeros()) as usize,
            );
            let max_key_len = members.iter().map(|(key, _)| key.len()).max().unwrap_or(0);
            c.charge_work(
                members
                    .len()
                    .saturating_add(sort_work)
                    .saturating_add(sort_work.saturating_mul(max_key_len)),
                Utf16::default(),
            )?;
            let mut output = Vec::with_capacity(members.len());
            for (key, child) in members {
                c.charge_work(key.len(), Utf16::default())?;
                output.push((key.clone(), canonical(child, c)?));
            }
            output.sort_by(|a, b| a.0.cmp(&b.0));
            Ok(Value::Object(output))
        }
        Value::String(value) => {
            c.charge_work(value.len(), Utf16::default())?;
            Ok(Value::String(value.clone()))
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
        parse(RELATIONSHIP_OP, c)?,
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
fn identity(v: &Value) -> Option<(String, String)> {
    Some((text(get(v, "module"))?, text(get(v, "element"))?))
}
fn same_ref(a: &Value, b: &Value) -> bool {
    identity(a) == identity(b)
}
fn locate(
    source: &Value,
    reference: &Value,
    c: &mut Context<'_>,
) -> Result<(Value, String), EngineError> {
    let (module, element) = identity(reference).ok_or_else(|| {
        err(
            "RELATIONSHIP_AVRO_REFERENCE",
            "Malformed endpoint identity",
            "/request",
        )
    })?;
    for (mi, m) in arr(get(source, "modules")).iter().enumerate() {
        if text(get(m, "id")).as_deref() == Some(module.as_str()) {
            for (ei, e) in arr(get(m, "elements")).iter().enumerate() {
                if text(get(e, "id")).as_deref() == Some(element.as_str()) {
                    return Ok((copy_json(e, c)?, format!("/modules/{mi}/elements/{ei}")));
                }
            }
        }
    }
    Err(err(
        "RELATIONSHIP_AVRO_REFERENCE",
        "Unresolved logical element",
        "/request",
    ))
}
fn residual(
    path: &str,
    value: &Value,
    reason: &str,
    outcome: &str,
    c: &mut Context<'_>,
) -> Result<Value, EngineError> {
    Ok(obj(vec![
        ("path", s(path)),
        ("value", copy_json(value, c)?),
        ("reason", s(reason)),
        ("outcome", s(outcome)),
        ("recovery", s(RECOVERY)),
    ]))
}
fn name(v: &str) -> bool {
    let mut b = v.bytes();
    matches!(b.next(), Some(b'A'..=b'Z' | b'a'..=b'z' | b'_'))
        && b.all(|x| x.is_ascii_alphanumeric() || x == b'_')
}
fn set(v: &mut Value, n: &str, x: Value) -> Result<(), EngineError> {
    let Value::Object(m) = v else {
        return Err(err("RELATIONSHIP_AVRO_SHAPE", "Expected object", ""));
    };
    if let Some((_, old)) = m.iter_mut().find(|(key, _)| key == &k(n)) {
        *old = x
    } else {
        m.push((k(n), x));
    }
    Ok(())
}
fn loss(
    xs: &mut Vec<Value>,
    path: &str,
    value: &Value,
    reason: &str,
    outcome: &str,
    c: &mut Context<'_>,
) -> Result<(), EngineError> {
    xs.push(residual(path, value, reason, outcome, c)?);
    Ok(())
}
fn project_inner(
    source: &Value,
    author: &Value,
    request: &Value,
    rt: &Runtime,
    caps: &mut dyn Capabilities,
    c: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let schema = parse(RESULT, c)?;
    let request_schema = get(get(&schema, "properties").unwrap(), "request").unwrap();
    validate_schema(request, request_schema, rt, c, "RELATIONSHIP_AVRO_REQUEST")?;
    let validation = rt.engine.validate_document(source, &rt.registry, caps, c)?;
    if !validation.valid || text(get(source, "umf")).as_deref() != Some("0.10.0") {
        return Err(err(
            "RELATIONSHIP_AVRO_SOURCE",
            "Valid core 0.10.0 required",
            "",
        ));
    }
    if text(get(author, "operation")).as_deref() != Some("declare-core-relationship") {
        return Err(err(
            "RELATIONSHIP_AVRO_AUTHOR",
            "Expected explicit relationship declaration",
            "/author",
        ));
    }
    let author_target = get(author, "target").ok_or_else(|| {
        err(
            "RELATIONSHIP_AVRO_AUTHOR",
            "Author target is required",
            "/author/target",
        )
    })?;
    let verified = crate::core_relationships::verify_core_relationship_operation(
        author,
        author_target,
        &rt.engine,
        &rt.registry,
        caps,
        c,
    )?;
    let relid = get(request, "relationship").unwrap();
    let current = crate::core_relationships::lookup_core_relationship(
        source,
        relid,
        &rt.engine,
        &rt.registry,
        caps,
        c,
    )?;
    let prior = crate::core_relationships::lookup_core_relationship(
        author_target,
        relid,
        &rt.engine,
        &rt.registry,
        caps,
        c,
    )?;
    if text(get(&verified, "operation")).as_deref() != Some("declare-core-relationship")
        || text(get(get(author, "identity").unwrap(), "module")).as_deref()
            != text(get(relid, "module")).as_deref()
        || text(get(get(author, "request").unwrap(), "id")).as_deref()
            != text(get(relid, "id")).as_deref()
        || text(get(author_target, "id")).as_deref() != text(get(source, "id")).as_deref()
    {
        return Err(err(
            "RELATIONSHIP_AVRO_AUTHOR",
            "Mismatched author identity",
            "/author",
        ));
    }
    let rel = get(&current, "relationship").unwrap();
    if !equal(rel, get(&prior, "relationship").unwrap(), c)? {
        return Err(err(
            "RELATIONSHIP_AVRO_STALE",
            "Relationship changed since authoring",
            "/source",
        ));
    }
    for endpoint in arr(get(rel, "source"))
        .iter()
        .chain(arr(get(rel, "target")))
        .chain(get(rel, "associationRecord").into_iter())
    {
        let (now, _) = locate(source, endpoint, c)?;
        let (then, _) = locate(author_target, endpoint, c)?;
        if !equal(&now, &then, c)? {
            return Err(err(
                "RELATIONSHIP_AVRO_STALE",
                "Endpoint Record or Key changed since authoring",
                "/source",
            ));
        }
        for member in arr(get(&now, "members")) {
            let (now_member, _) = locate(source, member, c)?;
            let (then_member, _) = locate(author_target, member, c)?;
            if !equal(&now_member, &then_member, c)? {
                return Err(err(
                    "RELATIONSHIP_AVRO_STALE",
                    "Endpoint component changed since authoring",
                    "/source",
                ));
            }
        }
    }
    let relpath = text(get(&current, "path")).unwrap_or_default();
    let mut losses = Vec::new();
    let mut impossible = false;
    loss(&mut losses,"/",source,"Only selected target-key reference values are emitted; all other logical and native extension content remains in the retained source","not-expressible",c)?;
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
        if let Some(v) = get(rel, field) {
            loss(&mut losses,&format!("{relpath}/{field}"),v,"Avro value structure does not establish authored identity, target existence, distinct-record participation, lifecycle or presentation","not-expressible",c)?;
        }
    }
    for path_value in arr(get(&current, "uninterpretedPaths")) {
        let path = raw_text(Some(path_value)).ok_or_else(|| {
            err(
                "RELATIONSHIP_AVRO_PATH",
                "Malformed qualifier diagnostic path",
                "",
            )
        })?;
        let value = pointer_value(source, path).ok_or_else(|| {
            err(
                "RELATIONSHIP_AVRO_PATH",
                "Unresolved qualifier diagnostic path",
                "",
            )
        })?;
        loss_raw_path(
            &mut losses,
            path,
            value,
            "Unknown relationship qualifier remains uninterpreted",
            "unknown",
            c,
        )?;
    }
    let sources = arr(get(rel, "source"));
    let targets = arr(get(rel, "target"));
    if sources.len() != 1 || targets.len() != 1 {
        impossible = true;
        loss(
            &mut losses,
            &relpath,
            rel,
            "This target-key-record profile cannot represent heterogeneous endpoint sets",
            "not-expressible",
            c,
        )?;
    }
    if let Some(v) = get(rel, "associationRecord") {
        impossible = true;
        loss(
            &mut losses,
            &format!("{relpath}/associationRecord"),
            v,
            "A keyed association Record needs separately declared identity and attribute layout",
            "not-expressible",
            c,
        )?;
    }
    let target = targets.first().ok_or_else(|| {
        err(
            "RELATIONSHIP_AVRO_TARGET",
            "Relationship target is required",
            "/request/relationship",
        )
    })?;
    let (record, _) = locate(source, target, c)?;
    let keyid = text(get(target, "key")).ok_or_else(|| {
        err(
            "RELATIONSHIP_AVRO_KEY",
            "Target Key ID required",
            "/request/relationship",
        )
    })?;
    let key = arr(get(&record, "keys"))
        .iter()
        .find(|x| text(get(x, "id")).as_deref() == Some(keyid.as_str()))
        .ok_or_else(|| {
            err(
                "RELATIONSHIP_AVRO_KEY",
                "Target Key does not resolve",
                "/request/relationship",
            )
        })?;
    let keyfields = arr(get(key, "fields"));
    let components = arr(get(request, "components"));
    if components.len() != keyfields.len()
        || components
            .iter()
            .zip(keyfields)
            .any(|(x, y)| !same_ref(get(x, "targetField").unwrap_or(&Value::Null), y))
    {
        impossible = true;
        loss(
            &mut losses,
            "/request/components",
            &Value::Array(components.to_vec()),
            "Components must cover target Key Fields exactly once, in Key order",
            "not-expressible",
            c,
        )?;
    }
    let families = [
        ("boolean", "boolean"),
        ("int", "integer"),
        ("long", "integer"),
        ("float", "float"),
        ("double", "float"),
        ("bytes", "binary"),
        ("string", "string"),
    ];
    let mut schemafields = Vec::new();
    let mut names = std::collections::BTreeSet::new();
    for (i, component) in components.iter().enumerate() {
        let fieldref = get(component, "targetField").unwrap_or(&Value::Null);
        if !keyfields.iter().any(|x| same_ref(x, fieldref)) {
            continue;
        }
        let (e, path) = locate(source, fieldref, c)?;
        let ty = text(get(component, "type")).unwrap_or_default();
        let family = families
            .iter()
            .find(|x| x.0 == ty)
            .map(|x| x.1)
            .unwrap_or("");
        let invalid = text(get(&e, "kind")).as_deref() != Some("field")
            || text(get(&e, "cardinality")).as_deref() != Some("one")
            || text(get(&e, "scalarType")).as_deref() != Some(family)
            || get(&e, "itemType").is_some()
            || arr(get(&e, "references"))
                .iter()
                .any(|x| text(get(x, "role")).as_deref() == Some("record-type"));
        if invalid {
            impossible = true;
            loss(
                &mut losses,
                &format!("/request/components/{i}"),
                component,
                "Native primitive must match a singular scalar target Key Field",
                "not-expressible",
                c,
            )?;
        }
        let n = text(get(component, "name")).unwrap_or_default();
        if !name(&n) || !names.insert(n.clone()) {
            impossible = true;
            loss(
                &mut losses,
                "/request",
                request,
                "Invalid explicit native carrier: Invalid explicit native carrier request; no normalization or partial schema",
                "not-expressible",
                c,
            )?;
        }
        schemafields.push(obj(vec![("name", s(&n)), ("type", s(&ty))]));
        loss(&mut losses,&path,&e,"Native primitive choice does not establish ideal domain, exact conversion, nullability, integer width, length, precision/scale or unknown qualifier meaning","unknown",c)?;
        if let Some(v) = get(&e, "facets") {
            loss(&mut losses,&format!("{path}/facets"),v,"Author-stated facets are retained but not enforced by this primitive reference carrier","not-expressible",c)?;
        }
    }
    let recordname = text(get(request, "recordName")).unwrap_or_default();
    let keyname = text(get(request, "keyRecordName")).unwrap_or_default();
    let fieldname = text(get(request, "fieldName")).unwrap_or_default();
    let namespace = text(get(request, "namespace")).unwrap_or_default();
    let shape = text(get(request, "shape")).unwrap_or_default();
    let primitive_names = [
        "null", "boolean", "int", "long", "float", "double", "bytes", "string",
    ];
    if !name(&recordname)
        || !name(&keyname)
        || !name(&fieldname)
        || primitive_names.contains(&recordname.as_str())
        || primitive_names.contains(&keyname.as_str())
        || recordname == keyname
        || !namespace.is_empty() && !namespace.split('.').all(name)
    {
        impossible = true;
        loss(&mut losses,"/request",request,"Avro record, key-record, field and namespace names must satisfy native identifier syntax and avoid primitive names; no normalization is performed","not-expressible",c)?;
    }
    loss(&mut losses,"/request/shape",get(request,"shape").unwrap(),"Wire shape is explicit: arrays admit empty and duplicate values, nullable unions admit null, and singular values do not establish distinct-record participation","approximated",c)?;
    let keyrecord = obj(vec![
        ("type", s("record")),
        ("name", s(&keyname)),
        ("fields", Value::Array(schemafields)),
    ]);
    let ty = match shape.as_str() {
        "one" => keyrecord,
        "nullable-one" => Value::Array(vec![s("null"), keyrecord]),
        "array" => obj(vec![("type", s("array")), ("items", keyrecord)]),
        _ => {
            impossible = true;
            Value::Null
        }
    };
    let mut native_members = vec![("type", s("record")), ("name", s(&recordname))];
    if !namespace.is_empty() {
        native_members.push(("namespace", s(&namespace)));
    }
    native_members.push((
        "fields",
        Value::Array(vec![obj(vec![("name", s(&fieldname)), ("type", ty)])]),
    ));
    let native = obj(native_members);
    let native_text = serialization::stringify_compact(&native)?
        .to_utf8()
        .map_err(|_| {
            err(
                "RELATIONSHIP_AVRO_NAME",
                "Native carrier is not UTF-8",
                "/request",
            )
        })?
        + "\n";
    let blocked = impossible || text(get(request, "mode")).as_deref() == Some("strict");
    let status = if blocked { "blocked" } else { "projected" };
    let outcome = if impossible {
        "not-expressible"
    } else if blocked {
        "unknown"
    } else {
        "approximated"
    };
    let binding = get(get(&schema, "properties").unwrap(), "binding")
        .and_then(|x| get(x, "const"))
        .cloned()
        .unwrap_or(Value::Null);
    let mut result = obj(vec![
        ("operation", s("project-relationship-avro")),
        ("version", s("1.0.0")),
        ("status", s(status)),
        ("outcome", s(outcome)),
        ("source", copy_json(source, c)?),
        ("author", copy_json(author, c)?),
        ("request", copy_json(request, c)?),
        ("binding", binding),
        ("mappings", Value::Array(Vec::new())),
        ("residuals", Value::Array(losses)),
        ("diagnostics", Value::Array(Vec::new())),
    ]);
    if !blocked {
        let id = raw_text(get(request, "id")).cloned().ok_or_else(|| {
            err(
                "RELATIONSHIP_AVRO_REQUEST",
                "Projection id must be a string",
                "/request/id",
            )
        })?;
        let imported = avro_document::import_schema(
            &id,
            &native_text.encode_utf16().collect::<Vec<_>>(),
            &[],
            c,
        )?;
        set(&mut result, "target", imported)?;
        set(
            &mut result,
            "nativeArchive",
            obj(vec![
                ("schema", s(&native_text)),
                ("dependencies", Value::Array(Vec::new())),
            ]),
        )?;
        let native_path = match shape.as_str() {
            "array" => "/fields/0/type/items",
            "nullable-one" => "/fields/0/type/1",
            _ => "/fields/0/type",
        };
        let component_paths = components
            .iter()
            .enumerate()
            .map(|(i, _)| s(&format!("{native_path}/fields/{i}")))
            .collect();
        set(
            &mut result,
            "mappings",
            Value::Array(vec![obj(vec![
                ("idealPath", s(&relpath)),
                ("nativePath", s(native_path)),
                ("outcome", s("approximated")),
                ("targetKey", s(&keyid)),
                ("componentPaths", Value::Array(component_paths)),
            ])]),
        )?;
    }
    let diagnostics = arr(get(&result, "residuals"))
        .iter()
        .map(|r| {
            obj(vec![
                ("code", s("RELATIONSHIP_AVRO_LOSS")),
                ("path", get(r, "path").cloned().unwrap_or(Value::Null)),
                ("message", get(r, "reason").cloned().unwrap_or(Value::Null)),
                ("severity", s(if blocked { "error" } else { "warning" })),
            ])
        })
        .collect();
    set(&mut result, "diagnostics", Value::Array(diagnostics))?;
    validate_schema(&result, &schema, rt, c, "RELATIONSHIP_AVRO_RESULT")?;
    Ok(result)
}
pub fn project_relationship_to_avro(
    source: &Value,
    author: &Value,
    request: &Value,
    c: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(c)?;
    let mut caps = NoCapabilities;
    project_inner(source, author, request, &rt, &mut caps, c)
}
pub fn verify_relationship_avro_projection(
    receipt: &Value,
    current: &Value,
    c: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(c)?;
    let schema = parse(RESULT, c)?;
    validate_schema(receipt, &schema, &rt, c, "RELATIONSHIP_AVRO_RECEIPT")?;
    if text(get(receipt, "status")).as_deref() != Some("projected") {
        return Err(err(
            "RELATIONSHIP_AVRO_RECEIPT",
            "Expected successful projection receipt",
            "",
        ));
    }
    let expected = project_relationship_to_avro(
        get(receipt, "source").unwrap(),
        get(receipt, "author").unwrap(),
        get(receipt, "request").unwrap(),
        c,
    )?;
    if !equal(receipt, &expected, c)? {
        return Err(err(
            "RELATIONSHIP_AVRO_RECEIPT",
            "Receipt differs from retained source, author and request",
            "",
        ));
    }
    let actual = avro_document::export_bundle(current, c)?;
    let target = avro_document::export_bundle(get(receipt, "target").unwrap(), c)?;
    if actual.schema_json != target.schema_json || actual.dependencies != target.dependencies {
        return Err(err(
            "RELATIONSHIP_AVRO_STALE",
            "Emitted native representation changed",
            "",
        ));
    }
    Ok(receipt.clone())
}
pub fn recover_relationship_avro_ideal(
    receipt: &Value,
    current: &Value,
    c: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let v = verify_relationship_avro_projection(receipt, current, c)?;
    copy_json(get(&v, "source").unwrap(), c)
}
pub fn recover_relationship_avro_native(
    receipt: &Value,
    current: &Value,
    c: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let v = verify_relationship_avro_projection(receipt, current, c)?;
    copy_json(get(&v, "nativeArchive").unwrap(), c)
}

#[cfg(test)]
mod pointer_tests {
    use super::{pointer_value, Utf16, Value};

    #[test]
    fn pointer_escape_does_not_skip_following_utf16_unit() {
        let source = Value::Object(vec![(Utf16::from("~x"), Value::Bool(true))]);
        let path = Utf16::from("/~0x");
        assert_eq!(pointer_value(&source, &path), Some(&Value::Bool(true)));

        let literal_escape = Value::Object(vec![(Utf16::from("~qx"), Value::Bool(false))]);
        let path = Utf16::from("/~qx");
        assert_eq!(
            pointer_value(&literal_escape, &path),
            Some(&Value::Bool(false))
        );
    }
}
