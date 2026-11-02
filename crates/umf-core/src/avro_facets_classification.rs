// SPDX-License-Identifier: MIT OR Apache-2.0
//! Profile-qualified interpretation of selected Avro facet declarations.
//! The native archive remains the source of truth; writer enforcement is not inferred.
use crate::{
    avro_document,
    context::Context,
    engine::{Capabilities, Engine, ResourceSet, SemanticContext},
    error::{Diagnostic, EngineError},
    native_json::{NativeJsonNode as N, NativeJsonTree},
    registry::Registry,
    schema::{CompiledSchema, SchemaResources},
    serialization::{self, Format},
    value::{copy_json, Utf16, Value},
};
use std::sync::{Arc, OnceLock};

const RESULT_SCHEMA: &str =
    include_str!("../../../spec/core/avro-facet-classification.schema.json");
const CORE_SCHEMA: &str = include_str!("../../../spec/core/schema.json");
const PACKAGE: &str = include_str!("../../../spec/extensions/avro-facets/package.json");
const EXT: &str = "umf.avro.facets";
const BASIS: &str =
    "Selected present non-null scalar declarations with retained unions, named dependencies and explicit Apache Python 1.12.0/fastavro 1.12.2 writer limitations; no native equivalence";
const RECOVERY: &str = "Retain original native archive and authored facets; interpretation does not replace native meaning";

type Location = crate::avro_facet_type::AvroFacetLocation;
fn u(s: &str) -> Utf16 {
    Utf16::from(s)
}
fn t(s: &str) -> Value {
    Value::string_utf8(s)
}
fn obj(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(fields.into_iter().map(|(k, v)| (u(k), v)).collect())
}
fn get<'a>(v: &'a Value, k: &str) -> Option<&'a Value> {
    if let Value::Object(m) = v {
        m.iter().find(|(x, _)| x == &u(k)).map(|(_, v)| v)
    } else {
        None
    }
}
fn get_mut<'a>(v: &'a mut Value, k: &str) -> Option<&'a mut Value> {
    if let Value::Object(m) = v {
        m.iter_mut().find(|(x, _)| x == &u(k)).map(|(_, v)| v)
    } else {
        None
    }
}
fn string(v: &Value) -> Option<&Utf16> {
    if let Value::String(s) = v {
        Some(s)
    } else {
        None
    }
}
fn text<'a>(v: &'a Value, k: &str) -> Option<&'a Utf16> {
    get(v, k).and_then(string)
}
fn err(code: &'static str, msg: impl Into<String>) -> EngineError {
    EngineError::new(code, u(""), msg.into())
}
fn parse_resource(raw: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    serialization::read_json_value(&raw.encode_utf16().collect::<Vec<_>>(), Format::Json, ctx)
}
struct NoCallbacks;
impl Capabilities for NoCallbacks {
    fn validate_extension(
        &mut self,
        _: u64,
        _: &Value,
        _: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        Ok(Vec::new())
    }
}
struct Runtime {
    engine: Engine,
    registry: Registry,
    result: CompiledSchema,
    request: CompiledSchema,
}
fn runtime(ctx: &mut Context<'_>) -> Result<Arc<Runtime>, EngineError> {
    static CACHE: OnceLock<Arc<Runtime>> = OnceLock::new();
    ctx.charge_work(1, u(""))?;
    let ordinary = ctx.profile() == crate::context::ResourceProfile::Cooperative
        && ctx.limits() == crate::context::Limits::ordinary();
    if ordinary {
        if let Some(r) = CACHE.get() {
            return Ok(Arc::clone(r));
        }
    }
    let engine = Engine::new(
        ResourceSet::new(
            parse_resource(CORE_SCHEMA, ctx)?,
            parse_resource(
                include_str!("../../../spec/core/semantic-type-reference.schema.json"),
                ctx,
            )?,
            parse_resource(
                include_str!("../../../spec/core/extension-package.schema.json"),
                ctx,
            )?,
            parse_resource(
                include_str!("../../../spec/metamodel/generated/core-constraints.json"),
                ctx,
            )?,
            parse_resource(
                include_str!("../../../spec/metamodel/generated/domain-policy.json"),
                ctx,
            )?,
        ),
        ctx,
    )?;
    let resources = engine.schema_resources_with_context(ctx)?;
    let mut registry = Registry::new();
    for package in [
        include_str!("../../../spec/extensions/avro/package.json"),
        PACKAGE,
    ] {
        registry.register(
            &parse_resource(package, ctx)?,
            None,
            engine.package_schema(),
            &resources,
            ctx,
        )?;
    }
    let schema = parse_resource(RESULT_SCHEMA, ctx)?;
    let schema_resources = SchemaResources {
        entries: vec![
            (u("urn:umf:core:0.10.0"), parse_resource(CORE_SCHEMA, ctx)?),
            (
                u("urn:umf:core:facet-operation:3.0.0"),
                parse_resource(
                    include_str!("../../../spec/core/facet-operation-v3.schema.json"),
                    ctx,
                )?,
            ),
            (
                u("urn:umf:native-json:0.1.0"),
                parse_resource(
                    include_str!("../../../spec/core/native-json.schema.json"),
                    ctx,
                )?,
            ),
            (
                u("urn:umf:core:semantic-type-reference:1.0.0"),
                parse_resource(
                    include_str!("../../../spec/core/semantic-type-reference.schema.json"),
                    ctx,
                )?,
            ),
        ],
    };
    let request = get(
        get(&schema, "properties").ok_or_else(|| err("AVRO_FACET_SCHEMA", "Missing properties"))?,
        "request",
    )
    .ok_or_else(|| err("AVRO_FACET_SCHEMA", "Missing request"))?;
    let runtime = Arc::new(Runtime {
        engine,
        registry,
        result: CompiledSchema::compile(&schema, &schema_resources, ctx)?,
        request: CompiledSchema::compile(request, &schema_resources, ctx)?,
    });
    if ordinary {
        return Ok(crate::resource_cache::publish_completed(&CACHE, runtime));
    }
    Ok(runtime)
}
fn schema_errors(
    code: &'static str,
    errors: &[crate::schema::StructuralError],
    ctx: &mut Context<'_>,
) -> Result<EngineError, EngineError> {
    let mut details = Vec::new();
    for e in errors {
        details.push(obj(vec![
            ("instancePath", Value::String(e.instance_path.clone())),
            ("schemaPath", Value::String(e.schema_path.clone())),
            ("keyword", t(&e.keyword)),
            ("params", copy_json(&e.params, ctx)?),
            ("message", Value::String(e.message.clone())),
        ]));
    }
    Ok(EngineError::new(
        code,
        u(""),
        serialization::stringify_compact_metered(&Value::Array(details), ctx)?,
    ))
}
fn valid_doc(v: &Value, r: &Runtime, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    Ok(r.engine
        .validate_document(v, &r.registry, &mut NoCallbacks, ctx)?
        .valid)
}
fn verify_result(v: &Value, r: &Runtime, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    let e = r.result.validate(v, ctx)?;
    if !e.is_empty() {
        return Err(schema_errors("AVRO_FACET_RESULT", &e, ctx)?);
    }
    Ok(())
}
fn canonical(v: &Value, ctx: &mut Context<'_>, depth: usize) -> Result<Value, EngineError> {
    if depth > 128 {
        return Err(err(
            "AVRO_FACET_RECEIPT",
            "Canonical comparison depth exceeded",
        ));
    }
    ctx.charge_work(1, u(""))?;
    match v {
        Value::Array(a) => Ok(Value::Array(
            a.iter()
                .map(|v| canonical(v, ctx, depth + 1))
                .collect::<Result<_, _>>()?,
        )),
        Value::Object(m) => {
            let mut m = m
                .iter()
                .map(|(k, v)| Ok((k.clone(), canonical(v, ctx, depth + 1)?)))
                .collect::<Result<Vec<_>, EngineError>>()?;
            m.sort_by(|a, b| a.0.cmp(&b.0));
            Ok(Value::Object(m))
        }
        _ => copy_json(v, ctx),
    }
}
fn equal(a: &Value, b: &Value, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    Ok(canonical(a, ctx, 0)? == canonical(b, ctx, 0)?)
}
fn matches_avro_bundle_text(
    tree: &NativeJsonTree,
    expected: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    let compact = tree.render_compact(ctx)?;
    let mut rendered = compact.units().to_vec();
    rendered.push(b'\n' as u16);
    ctx.charge_text(1, u(""))?;
    Ok(rendered.as_slice() == expected.units())
}
fn location_value(l: &Location) -> Value {
    let mut f = vec![(u("path"), Value::String(l.path.clone()))];
    if let Some(id) = &l.dependency_id {
        f.push((u("dependencyId"), Value::String(id.clone())))
    }
    Value::Object(f)
}
fn field_index(source: &Value, identity: &Value) -> Option<(usize, usize)> {
    let module = text(identity, "module")?;
    let element = text(identity, "element")?;
    let modules = match get(source, "modules")? {
        Value::Array(a) => a,
        _ => return None,
    };
    for (mi, m) in modules.iter().enumerate() {
        if text(m, "id") != Some(module) {
            continue;
        }
        let elements = match get(m, "elements")? {
            Value::Array(a) => a,
            _ => continue,
        };
        for (ei, e) in elements.iter().enumerate() {
            if text(e, "id") == Some(element) {
                return Some((mi, ei));
            }
        }
    }
    None
}
fn array_at<'a>(v: &'a Value, k: &str) -> Option<&'a [Value]> {
    if let Value::Array(a) = get(v, k)? {
        Some(a)
    } else {
        None
    }
}
fn set(v: &mut Value, k: &str, value: Value) -> Result<(), EngineError> {
    let Value::Object(m) = v else {
        return Err(err("AVRO_FACET_TARGET", "Expected object"));
    };
    let key = u(k);
    if let Some((_, slot)) = m.iter_mut().find(|(x, _)| *x == key) {
        *slot = value
    } else {
        m.push((key, value))
    }
    Ok(())
}
fn member<'a>(node: &'a N, key: &str) -> Option<&'a N> {
    if let N::Object(m) = node {
        m.iter().find(|(k, _)| k == &u(key)).map(|(_, v)| v)
    } else {
        None
    }
}
fn native_text(node: Option<&N>) -> Option<&Utf16> {
    if let Some(N::String(s)) = node {
        Some(s)
    } else {
        None
    }
}
fn tagged(node: &N, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    ctx.charge_work(1, u(""))?;
    Ok(match node {
        N::Null => obj(vec![("kind", t("null"))]),
        N::Boolean(b) => obj(vec![("kind", t("boolean")), ("value", Value::Bool(*b))]),
        N::String(s) => obj(vec![
            ("kind", t("string")),
            ("value", Value::String(s.clone())),
        ]),
        N::Number(n) => obj(vec![("kind", t("number")), ("value", t(n))]),
        N::Array(items) => obj(vec![
            ("kind", t("array")),
            (
                "items",
                Value::Array(
                    items
                        .iter()
                        .map(|n| tagged(n, ctx))
                        .collect::<Result<_, _>>()?,
                ),
            ),
        ]),
        N::Object(m) => {
            let mut out = Vec::new();
            for (k, v) in m {
                out.push((k.clone(), tagged(v, ctx)?))
            }
            obj(vec![("kind", t("object")), ("members", Value::Object(out))])
        }
    })
}
fn branch_facets(inspection: &Value) -> (Utf16, Value) {
    let state = text(inspection, "state")
        .cloned()
        .unwrap_or_else(|| u("unsupported"));
    let meaning = get(inspection, "meaning");
    let family = meaning
        .and_then(|v| text(v, "family"))
        .cloned()
        .unwrap_or_else(|| u("unsupported"));
    let mut facets = Vec::new();
    if let Some(m) = meaning {
        match family.to_utf8().ok().as_deref() {
            Some("integer") => {
                if let Some(bits) = get(m, "bits") {
                    facets.push((
                        u("integerWidth"),
                        obj(vec![("bits", bits.clone()), ("signed", Value::Bool(true))]),
                    ))
                }
            }
            Some("decimal") => {
                if let Some(p) = get(m, "precision") {
                    facets.push((u("precision"), p.clone()))
                }
                if let Some(s) = get(m, "scale") {
                    facets.push((u("scale"), s.clone()))
                }
            }
            Some("binary") => {
                if let Some(n) = get(m, "exactBytes") {
                    if !matches!(n, Value::Null) {
                        facets.push((
                            u("length"),
                            obj(vec![("max", n.clone()), ("unit", t("byte"))]),
                        ))
                    }
                }
            }
            _ => {}
        }
    }
    (family, Value::Object(facets))
}
fn unknown_paths(
    node: &N,
    path: &Utf16,
    ctx: &mut Context<'_>,
    out: &mut Vec<(Utf16, Value)>,
) -> Result<(), EngineError> {
    ctx.charge_work(path.len().saturating_add(1), path.clone())?;
    if let N::Array(items) = node {
        for (i, v) in items.iter().enumerate() {
            let mut p = path.units().to_vec();
            p.extend(format!("/{i}").encode_utf16());
            unknown_paths(v, &Utf16::new(p), ctx, out)?;
        }
        return Ok(());
    }
    let N::Object(m) = node else { return Ok(()) };
    let ty = member(node, "type")
        .and_then(|n| native_text(Some(n)))
        .and_then(|s| s.to_utf8().ok());
    let decimal = member(node, "logicalType")
        .and_then(|n| native_text(Some(n)))
        .is_some_and(|s| s == &u("decimal"));
    let known: Vec<&str> =
        if m.iter().any(|(k, _)| k == &u("name")) && m.iter().any(|(k, _)| k == &u("fields")) {
            vec!["type", "name", "namespace", "aliases", "doc", "fields"]
        } else if ty.as_deref() == Some("fixed") {
            vec!["type", "name", "namespace", "aliases", "doc", "size"]
        } else if ty.as_deref() == Some("enum") {
            vec![
                "type",
                "name",
                "namespace",
                "aliases",
                "doc",
                "symbols",
                "default",
            ]
        } else if ty.as_deref() == Some("array") {
            vec!["type", "items"]
        } else if ty.as_deref() == Some("map") {
            vec!["type", "values"]
        } else {
            let mut k = vec!["type"];
            if decimal && (ty.as_deref() == Some("bytes") || ty.as_deref() == Some("fixed")) {
                k.extend(["logicalType", "precision", "scale"])
            } else if member(node, "logicalType").is_some() {
                k.push("logicalType")
            }
            k
        };
    for (k, v) in m {
        ctx.charge_work(k.len().saturating_add(1), path.clone())?;
        let mut p = path.units().to_vec();
        p.push(b'/' as u16);
        for unit in k.units() {
            match *unit {
                0x7e => p.extend([b'~' as u16, b'0' as u16]),
                0x2f => p.extend([b'~' as u16, b'1' as u16]),
                x => p.push(x),
            }
        }
        let p = Utf16::new(p);
        if known.iter().any(|x| k == &u(x)) {
            if k == &u("fields") {
                if let N::Array(fs) = v {
                    for (i, f) in fs.iter().enumerate() {
                        let mut q = p.units().to_vec();
                        q.extend(format!("/{i}").encode_utf16());
                        unknown_field(f, &Utf16::new(q), ctx, out)?;
                    }
                }
            } else if k == &u("items")
                || k == &u("values")
                || k == &u("type") && !matches!(v, N::String(_))
            {
                unknown_paths(v, &p, ctx, out)?;
            }
        } else {
            out.push((p, tagged(v, ctx)?));
        }
    }
    Ok(())
}
fn unknown_field(
    node: &N,
    path: &Utf16,
    ctx: &mut Context<'_>,
    out: &mut Vec<(Utf16, Value)>,
) -> Result<(), EngineError> {
    let N::Object(m) = node else { return Ok(()) };
    for (k, v) in m {
        ctx.charge_work(k.len().saturating_add(1), path.clone())?;
        if !["name", "type", "doc", "default", "order", "aliases"]
            .iter()
            .any(|x| k == &u(x))
        {
            let mut p = path.units().to_vec();
            p.push(b'/' as u16);
            for unit in k.units() {
                match *unit {
                    0x7e => p.extend([b'~' as u16, b'0' as u16]),
                    0x2f => p.extend([b'~' as u16, b'1' as u16]),
                    value => p.push(value),
                }
            }
            out.push((Utf16::new(p), tagged(v, ctx)?));
        } else if k == &u("type") && !matches!(v, N::String(_)) {
            let mut p = path.units().to_vec();
            p.extend("/type".encode_utf16());
            unknown_paths(v, &Utf16::new(p), ctx, out)?;
        }
    }
    Ok(())
}
fn contains_utf16(value: &Utf16, needle: &str) -> bool {
    let needle: Vec<u16> = needle.encode_utf16().collect();
    value
        .units()
        .windows(needle.len())
        .any(|window| window == needle)
}
fn starts_with_utf16(value: &Utf16, prefix: &str) -> bool {
    value
        .units()
        .starts_with(&prefix.encode_utf16().collect::<Vec<_>>())
}
fn loss_residual(
    out: &mut Vec<Value>,
    observations: &mut Vec<Value>,
    request: &Value,
    target: &Utf16,
    value: Value,
    reason: impl Into<Utf16>,
    kind: &str,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let location = get(request, "location").cloned().unwrap_or(Value::Null);
    loss_residual_at(
        out,
        observations,
        request,
        &location,
        target,
        value,
        reason,
        kind,
        ctx,
    )
}
fn loss_residual_at(
    out: &mut Vec<Value>,
    observations: &mut Vec<Value>,
    request: &Value,
    location: &Value,
    target: &Utf16,
    value: Value,
    reason: impl Into<Utf16>,
    kind: &str,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let reason = reason.into();
    ctx.charge_work(1, target.clone())?;
    let location = location.clone();
    let path = if let Some(dep_id) = text(&location, "dependencyId") {
        let index = array_at(request, "dependencies")
            .unwrap_or(&[])
            .iter()
            .position(|d| text(d, "id") == Some(dep_id));
        index
            .map(|i| format!("/request/dependencies/{i}/schema"))
            .unwrap_or_else(|| "/request/nativeSource".into())
    } else {
        "/request/nativeSource".into()
    };
    let concept = if target
        .units()
        .ends_with(&"/integerWidth".encode_utf16().collect::<Vec<_>>())
        || contains_utf16(&reason, "signed-32 domain")
    {
        "integerWidth"
    } else if target
        .units()
        .ends_with(&"/precision".encode_utf16().collect::<Vec<_>>())
        || target
            .units()
            .ends_with(&"/scale".encode_utf16().collect::<Vec<_>>())
        || contains_utf16(&reason, "Decimal validation")
        || contains_utf16(&reason, "Decimal checks")
    {
        "decimal"
    } else if target
        .units()
        .ends_with(&"/length".encode_utf16().collect::<Vec<_>>())
        || contains_utf16(&reason, "Fixed exact length")
    {
        "length"
    } else if starts_with_utf16(&reason, "Binary64 ")
        || starts_with_utf16(&reason, "Decimal writer/reader conversion")
        || starts_with_utf16(&reason, "Declared value domains")
    {
        "conversion"
    } else {
        "native"
    };
    observations.push(obj(vec![
        ("concept", t(concept)),
        ("idealPath", Value::String(target.clone())),
        ("location", location.clone()),
        (
            "interpretation",
            t(if kind == "not-expressible" {
                "unsupported"
            } else {
                "unknown"
            }),
        ),
        ("outcome", t(kind)),
        ("basis", Value::String(reason.clone())),
    ]));
    out.push(obj(vec![
        ("path", t(&path)),
        ("location", location),
        ("targetPath", Value::String(target.clone())),
        ("value", value),
        ("reason", Value::String(reason.clone())),
        ("outcome", t(kind)),
        (
            "binding",
            obj(vec![
                ("id", t(EXT)),
                ("version", t("1.0.0")),
                ("nativeVersion", t("1.12.0")),
                ("subset", t(BASIS)),
            ]),
        ),
        ("recovery", t(RECOVERY)),
    ]));
    Ok(())
}
/// Classify one explicitly selected Avro type declaration and retain a recomputable receipt.
pub fn classify_avro_facets(
    source: &Value,
    request: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(ctx)?;
    let errors = rt.request.validate(request, ctx)?;
    if !errors.is_empty() {
        return Err(schema_errors("AVRO_FACET_REQUEST", &errors, ctx)?);
    }
    let source = copy_json(source, ctx)?;
    let request = copy_json(request, ctx)?;
    if !valid_doc(&source, &rt, ctx)? {
        return Err(err(
            "AVRO_FACET_SOURCE",
            "Valid current core 0.10.0 document required",
        ));
    }
    let bundle = avro_document::export_bundle(&source, ctx)?;
    let native_text = text(&request, "nativeSource")
        .ok_or_else(|| err("AVRO_FACET_REQUEST", "nativeSource is required"))?;
    let native = NativeJsonTree::parse_json(native_text.units(), ctx)?;
    if !matches_avro_bundle_text(&native, &bundle.schema_json, ctx)? {
        return Err(err(
            "AVRO_FACET_ARCHIVE",
            "Retained source text differs from native Avro archive",
        ));
    }
    let deps = array_at(&request, "dependencies").unwrap_or(&[]);
    if deps.len() != bundle.dependencies.len() {
        return Err(err(
            "AVRO_FACET_ARCHIVE",
            "Retained dependencies differ from native Avro archive",
        ));
    }
    let mut roots = Vec::new();
    for (i, d) in deps.iter().enumerate() {
        let id =
            text(d, "id").ok_or_else(|| err("AVRO_FACET_REQUEST", "Dependency id is required"))?;
        let schema = text(d, "schema")
            .ok_or_else(|| err("AVRO_FACET_REQUEST", "Dependency schema is required"))?;
        let (expected_id, expected_schema) = &bundle.dependencies[i];
        let tree = NativeJsonTree::parse_json(schema.units(), ctx)?;
        if id != expected_id || !matches_avro_bundle_text(&tree, expected_schema, ctx)? {
            return Err(err(
                "AVRO_FACET_ARCHIVE",
                "Retained dependency text/order differs from native Avro archive",
            ));
        }
        roots.push((Some(id.clone()), tree));
    }
    roots.push((None, native.clone()));
    let location_arg =
        get(&request, "location").ok_or_else(|| err("AVRO_FACET_REQUEST", "location required"))?;
    let location = Location {
        dependency_id: text(location_arg, "dependencyId").cloned(),
        path: text(location_arg, "path")
            .cloned()
            .ok_or_else(|| err("AVRO_FACET_REQUEST", "location path required"))?,
    };
    let (selection, selection_failure) =
        match crate::avro_facet_type::inspect_avro_facet_selection(&roots, &location, ctx) {
            Ok(value) => (value, None),
            Err(error) if error.is_control_failure() => return Err(error),
            Err(error) if error.code == "AVRO_FACET_TYPE" => {
                let fragment = avro_document::get_node(
                    &source,
                    &location.path,
                    location.dependency_id.as_ref(),
                    ctx,
                )?;
                (
                    obj(vec![
                        ("location", location_value(&location)),
                        ("native", tagged(fragment.root(), ctx)?),
                        ("shape", t("unspecified")),
                        ("allowsNull", Value::Bool(false)),
                        ("branches", Value::Array(Vec::new())),
                        ("basis", t("structural-selection-not-enforcement")),
                    ]),
                    Some(error.message),
                )
            }
            Err(error) => return Err(error),
        };
    let identity =
        get(&request, "identity").ok_or_else(|| err("AVRO_FACET_REQUEST", "identity required"))?;
    let (mi, ei) = field_index(&source, identity).ok_or_else(|| {
        err(
            "AVRO_FACET_FIELD",
            "Explicit logical Field identity required",
        )
    })?;
    let ideal_path = u(&format!("/modules/{mi}/elements/{ei}/facets"));
    let mut target = copy_json(&source, ctx)?;
    let element = get(&source, "modules")
        .and_then(|v| {
            if let Value::Array(a) = v {
                a.get(mi)
            } else {
                None
            }
        })
        .and_then(|m| get(m, "elements"))
        .and_then(|v| {
            if let Value::Array(a) = v {
                a.get(ei)
            } else {
                None
            }
        })
        .ok_or_else(|| err("AVRO_FACET_FIELD", "Selected Field is absent"))?;
    let mut conflicts = Vec::<(Value, String)>::new();
    let mut residuals = Vec::new();
    let mut observations = Vec::new();
    if let Some(message) = selection_failure {
        loss_residual(
            &mut residuals,
            &mut observations,
            &request,
            &ideal_path,
            get(&selection, "native").cloned().unwrap_or(Value::Null),
            {
                let mut units = u("Native type selection is unresolved: ").into_units();
                units.extend_from_slice(message.units());
                Utf16::new(units)
            },
            "not-expressible",
            ctx,
        )?;
    }
    let mut facets = Value::Object(Vec::new());
    let mut branches = Vec::new();
    let mut outcome = u("exact");
    let logical_family = text(element, "scalarType").cloned().unwrap_or_default();
    let kind = text(element, "kind").cloned();
    let cardinality = text(element, "cardinality").cloned();
    let module_id = text(identity, "module").cloned().unwrap_or_default();
    let has_record_type_reference = array_at(element, "references").is_some_and(|refs| {
        refs.iter()
            .any(|reference| text(reference, "role") == Some(&u("record-type")))
    });
    if ["schema", "avro.fields"]
        .iter()
        .any(|id| module_id == u(id))
        || kind.as_ref() != Some(&u("field"))
        || cardinality.as_ref() != Some(&u("one"))
        || has_record_type_reference
    {
        conflicts.push((
            copy_json(element, ctx)?,
            "An explicitly scalar logical Field is required; native representation elements cannot be relabeled".into(),
        ));
    }
    if let Some(binding) = get(get(element, "extensions").unwrap_or(&Value::Null), EXT) {
        conflicts.push((
            binding.clone(),
            "Existing binding cannot be overwritten".into(),
        ));
    }
    if let Some(vocabulary) = get(get(&source, "vocabularies").unwrap_or(&Value::Null), EXT) {
        if text(vocabulary, "version") != Some(&u("1.0.0")) {
            conflicts.push((vocabulary.clone(), "Incompatible facet vocabulary".into()));
        }
    }
    if get(&request, "author").is_none() {
        if let Some(existing) = get(element, "facets") {
            conflicts.push((
                existing.clone(),
                "Existing facets require verified author provenance".into(),
            ));
        }
    }
    if text(&selection, "shape") != Some(&u("one")) {
        loss_residual(
            &mut residuals,
            &mut observations,
            &request,
            &ideal_path,
            get(&selection, "native").cloned().unwrap_or(Value::Null),
            "Select a scalar item/value type explicitly; containers or null-only types cannot carry these facets",
            "not-expressible",
            ctx,
        )?;
    }
    let selected_branches = array_at(&selection, "branches").unwrap_or(&[]);
    let mut all_families = Vec::<Utf16>::new();
    let mut branch_facet_values = Vec::<Value>::new();
    for selected in selected_branches {
        let branch = get(selected, "branch")
            .ok_or_else(|| err("AVRO_FACET_SELECTION", "Missing selected branch"))?;
        let declaration = get(selected, "declaration")
            .ok_or_else(|| err("AVRO_FACET_SELECTION", "Missing declaration"))?;
        let inspection = get(selected, "inspection")
            .ok_or_else(|| err("AVRO_FACET_SELECTION", "Missing type interpretation"))?;
        let (branch_family, branch_facets) = branch_facets(inspection);
        let family_name = if text(branch, "shape") == Some(&u("null")) {
            u("null")
        } else {
            branch_family.clone()
        };
        all_families.push(family_name.clone());
        if family_name != u("null") {
            branch_facet_values.push(branch_facets.clone());
        }
        let loc = get(branch, "location").cloned().unwrap_or(Value::Null);
        let dloc = get(declaration, "location").cloned().unwrap_or(Value::Null);
        branches.push(obj(vec![
            ("location", loc.clone()),
            ("declarationLocation", dloc.clone()),
            (
                "nativeFragment",
                get(branch, "native").cloned().unwrap_or(Value::Null),
            ),
            (
                "declarationFragment",
                get(declaration, "native").cloned().unwrap_or(Value::Null),
            ),
            ("family", Value::String(family_name.clone())),
            ("facets", branch_facets.clone()),
            (
                "interpretation",
                t(if family_name == u("null") {
                    "declared"
                } else if text(inspection, "state") == Some(&u("declared")) {
                    "declared"
                } else {
                    "unsupported"
                }),
            ),
            ("enforcement", t("unverified")),
        ]));
        if family_name == u("null") {
            continue;
        }
        if family_name == u("unsupported") {
            let reason = text(inspection, "reason")
                .map(|s| {
                    s.to_utf8()
                        .unwrap_or_else(|_| "Unsupported native declaration".into())
                })
                .unwrap_or_else(|| "Unsupported native declaration".into());
            loss_residual_at(
                &mut residuals,
                &mut observations,
                &request,
                &dloc,
                &ideal_path,
                get(declaration, "native").cloned().unwrap_or(Value::Null),
                reason.as_str(),
                "not-expressible",
                ctx,
            )?;
            continue;
        }
        let meaning = get(inspection, "meaning").unwrap_or(&Value::Null);
        let profile = text(&request, "profile").cloned().unwrap_or_default();
        let declared_family = text(meaning, "family").cloned().unwrap_or_default();
        if declared_family == u("decimal")
            && (profile == u("apache-datum-writer") || profile == u("fastavro-schemaless-writer"))
        {
            let reason = if profile == u("apache-datum-writer") {
                "Apache Decimal validation does not enforce coefficient precision and conversion may rescale or round values"
            } else {
                "Physical bytes/fixed inputs can bypass fastavro Decimal checks; annotation alone does not establish the writer output domain"
            };
            loss_residual_at(
                &mut residuals,
                &mut observations,
                &request,
                &dloc,
                &ideal_path,
                get(declaration, "native").cloned().unwrap_or(Value::Null),
                reason,
                "unknown",
                ctx,
            )?;
        }
        if declared_family == u("integer")
            && get(meaning, "bits") == Some(&Value::Number(32.0))
            && profile == u("fastavro-schemaless-writer")
        {
            loss_residual_at(&mut residuals, &mut observations, &request, &dloc, &ideal_path, get(declaration, "native").cloned().unwrap_or(Value::Null), "The pinned fastavro writer accepts int 2147483648 outside the declared signed-32 domain", "approximated", ctx)?;
        }
        if text(&request, "obligation") == Some(&u("exact-input")) {
            let reason = if declared_family == u("float")
                && get(meaning, "bits") == Some(&Value::Number(32.0))
            {
                "Binary64 1.0000000000000002 narrows to binary32 1.0"
            } else if declared_family == u("decimal") {
                "Decimal writer/reader conversion and physical-byte bypass do not establish arbitrary input exactness"
            } else {
                "Declared value domains do not prove exact conversion of arbitrary host inputs"
            };
            let kind = if (declared_family == u("float")
                && get(meaning, "bits") == Some(&Value::Number(32.0)))
                || declared_family == u("decimal")
            {
                "approximated"
            } else {
                "unknown"
            };
            loss_residual_at(
                &mut residuals,
                &mut observations,
                &request,
                &dloc,
                &ideal_path,
                get(declaration, "native").cloned().unwrap_or(Value::Null),
                reason,
                kind,
                ctx,
            )?;
        }
        if declared_family == u("binary")
            && get(meaning, "exactBytes")
                .and_then(|v| {
                    if let Value::Number(n) = v {
                        Some(*n)
                    } else {
                        None
                    }
                })
                .is_some_and(|n| n > 0.0)
        {
            loss_residual_at(&mut residuals, &mut observations, &request, &dloc, &ideal_path, get(declaration, "native").cloned().unwrap_or(Value::Null), "Fixed exact length includes a lower bound that a maximum-length ideal does not represent", "not-expressible", ctx)?;
        }
        for (key, _) in match &branch_facets {
            Value::Object(m) => m
                .iter()
                .filter(|(key, _)| key != &u("scale"))
                .cloned()
                .collect(),
            _ => vec![],
        } {
            let concept = if key == u("integerWidth") {
                "integerWidth"
            } else if key == u("precision") {
                "decimal"
            } else if key == u("length") {
                "length"
            } else {
                "decimal"
            };
            observations.push(obj(vec![("concept",t(concept)),("idealPath",Value::String(ideal_path.clone())),("location",dloc.clone()),("interpretation",t("declared")),("outcome",t("exact")),("basis",t("Declared present non-null Avro value domain; writer enforcement remains separate"))]));
        }
    }
    let active = all_families
        .iter()
        .filter(|f| *f != &u("null"))
        .cloned()
        .collect::<Vec<_>>();
    if !active.is_empty()
        && active.iter().all(|f| f != &u("unsupported"))
        && text(&request, "profile") != Some(&u("unresolved"))
        && text(&selection, "shape") == Some(&u("one"))
    {
        if active.iter().all(|f| f == &active[0]) {
            let selected_family = &active[0];
            if selected_family != &logical_family {
                conflicts.push((
                    copy_json(element, ctx)?,
                    "Logical scalar family differs from selected native declaration".into(),
                ));
            }
            if selected_family == &u("integer") {
                let bits = branch_facet_values
                    .iter()
                    .filter_map(|v| get(v, "integerWidth").and_then(|x| get(x, "bits")))
                    .filter_map(|v| {
                        if let Value::Number(n) = v {
                            Some(*n)
                        } else {
                            None
                        }
                    })
                    .fold(0.0, f64::max);
                facets = obj(vec![(
                    "integerWidth",
                    obj(vec![
                        ("bits", Value::Number(bits)),
                        ("signed", Value::Bool(true)),
                    ]),
                )]);
            } else if branch_facet_values
                .windows(2)
                .all(|w| w.len() < 2 || w[0] == w[1])
            {
                facets = branch_facet_values
                    .first()
                    .cloned()
                    .unwrap_or(Value::Object(Vec::new()));
            } else if selected_family == &u("decimal") || selected_family == &u("binary") {
                loss_residual(
                    &mut residuals,
                    &mut observations,
                    &request,
                    &ideal_path,
                    get(&selection, "native").cloned().unwrap_or(Value::Null),
                    "Distinct union-branch facet domains cannot be silently normalized",
                    "not-expressible",
                    ctx,
                )?;
            }
        } else {
            loss_residual(
                &mut residuals,
                &mut observations,
                &request,
                &ideal_path,
                get(&selection, "native").cloned().unwrap_or(Value::Null),
                "Different scalar families remain separate union branches",
                "not-expressible",
                ctx,
            )?;
        }
    }
    if text(&request, "profile") == Some(&u("unresolved")) {
        outcome = u("unknown");
        loss_residual(
            &mut residuals,
            &mut observations,
            &request,
            &ideal_path,
            get(&selection, "native").cloned().unwrap_or(Value::Null),
            "An explicit native declaration or writer profile is required",
            "unknown",
            ctx,
        )?;
    }
    if let Some(author) = get(&request, "author") {
        let identity_matches = match get(author, "identity") {
            Some(auth) => equal(auth, identity, ctx)?,
            None => false,
        };
        if !identity_matches {
            conflicts.push((
                get(author, "identity").cloned().unwrap_or(Value::Null),
                "Author receipt identifies a different Field".into(),
            ));
        }
        let verified = crate::facets::verify_core_facet_declaration(
            author,
            &source,
            &rt.engine,
            &rt.registry,
            &mut NoCallbacks,
            ctx,
        );
        if let Err(error) = verified {
            if error.is_control_failure() {
                return Err(error);
            }
            conflicts.push((
                Value::Null,
                format!("Author provenance is invalid or stale: {}", error.code),
            ));
        } else {
            let meaning = match crate::facets::inspect_core_facets(
                &source,
                identity,
                &rt.engine,
                &rt.registry,
                &mut NoCallbacks,
                ctx,
            ) {
                Ok(meaning) => meaning,
                Err(error) if error.is_control_failure() => return Err(error),
                Err(error) => {
                    conflicts.push((
                        Value::Null,
                        format!("Author provenance is invalid or stale: {}", error.code),
                    ));
                    Value::Null
                }
            };
            let interpreted = get(&meaning, "interpreted").unwrap_or(&Value::Null);
            for key in ["length", "precision", "scale", "integerWidth"] {
                if let Some(declared) = get(interpreted, key) {
                    let observed = get(&facets, key);
                    if let Some(observed) = observed {
                        if !equal(declared, observed, ctx)? {
                            conflicts.push((
                                obj(vec![
                                    ("declared", declared.clone()),
                                    ("observed", observed.clone()),
                                ]),
                                format!("Authored {key} conflicts with native declaration"),
                            ));
                        }
                    } else {
                        let mut path = ideal_path.units().to_vec();
                        path.push(b'/' as u16);
                        path.extend(key.encode_utf16());
                        loss_residual(
                            &mut residuals,
                            &mut observations,
                            &request,
                            &Utf16::new(path),
                            declared.clone(),
                            "Authored bound is retained but not established by this native profile",
                            "unknown",
                            ctx,
                        )?;
                    }
                }
            }
            if text(&meaning, "state") == Some(&u("partial")) {
                loss_residual(
                    &mut residuals,
                    &mut observations,
                    &request,
                    &ideal_path,
                    get(&meaning, "facets").cloned().unwrap_or(Value::Null),
                    "Unknown authored facet qualifiers remain attached",
                    "unknown",
                    ctx,
                )?;
            }
        }
    }
    for (dep, tree) in roots.iter() {
        let mut unknowns = Vec::new();
        unknown_paths(tree.root(), &u(""), ctx, &mut unknowns)?;
        for (path, value) in unknowns {
            let mut rp = u("/request/nativeSource");
            if let Some(id) = dep {
                if let Some(i) = deps.iter().position(|d| text(d, "id") == Some(id)) {
                    rp = u(&format!("/request/dependencies/{i}/schema"))
                }
            }
            let mut units = rp.units().to_vec();
            units.extend(path.units());
            let mut location_fields = vec![("path", Value::String(path.clone()))];
            if let Some(id) = dep {
                location_fields.push(("dependencyId", Value::String(id.clone())));
            }
            let unknown_location = Value::Object(
                location_fields
                    .into_iter()
                    .map(|(k, v)| (u(k), v))
                    .collect(),
            );
            let reason = "Unknown native schema metadata remains attached without enforcement interpretation";
            observations.push(obj(vec![
                ("concept", t("native")),
                ("idealPath", Value::String(ideal_path.clone())),
                ("location", unknown_location.clone()),
                ("interpretation", t("unknown")),
                ("outcome", t("unknown")),
                ("basis", t(reason)),
            ]));
            residuals.push(obj(vec![
                ("path", Value::String(Utf16::new(units))),
                ("location", unknown_location),
                ("targetPath", Value::Null),
                ("value", value),
                ("reason", t(reason)),
                ("outcome", t("unknown")),
                (
                    "binding",
                    obj(vec![
                        ("id", t(EXT)),
                        ("version", t("1.0.0")),
                        ("nativeVersion", t("1.12.0")),
                        ("subset", t(BASIS)),
                    ]),
                ),
                ("recovery", t(RECOVERY)),
            ]));
        }
    }
    for (value, reason) in conflicts {
        loss_residual(
            &mut residuals,
            &mut observations,
            &request,
            &ideal_path,
            value,
            reason.as_str(),
            "not-expressible",
            ctx,
        )?;
        if let Some(last) = residuals.last_mut() {
            set(last, "path", Value::String(ideal_path.clone()))?;
        }
    }
    let conflict = residuals.iter().any(|r| {
        text(r, "outcome") == Some(&u("not-expressible"))
            && get(r, "targetPath") == Some(&Value::String(ideal_path.clone()))
            && get(r, "path") == Some(&Value::String(ideal_path.clone()))
    });
    if residuals
        .iter()
        .any(|r| text(r, "outcome") == Some(&u("unknown")))
    {
        outcome = u("unknown");
    } else if residuals
        .iter()
        .any(|r| text(r, "outcome") == Some(&u("not-expressible")))
    {
        outcome = u("not-expressible");
    } else if residuals
        .iter()
        .any(|r| text(r, "outcome") == Some(&u("approximated")))
    {
        outcome = u("approximated");
    }
    if conflict {
        outcome = u("not-expressible");
    }
    let mode = text(&request, "mode").cloned().unwrap_or_default();
    let status = if conflict || mode == u("strict") && !residuals.is_empty() {
        "blocked"
    } else {
        "classified"
    };
    let binding = obj(vec![
        ("id", t(EXT)),
        ("version", t("1.0.0")),
        ("nativeVersion", t("1.12.0")),
        ("subset", t(BASIS)),
    ]);
    let native_fragment = get(&selection, "native").cloned().unwrap_or(Value::Null);
    let observations_value = Value::Array(observations);
    let mapping = obj(vec![
        ("origin", t("classified")),
        ("idealPath", Value::String(ideal_path.clone())),
        (
            "location",
            get(&request, "location").cloned().unwrap_or(Value::Null),
        ),
        ("nativeFragment", native_fragment),
        ("facets", facets.clone()),
        ("branches", Value::Array(branches)),
        ("observations", copy_json(&observations_value, ctx)?),
    ]);
    if status == "classified" {
        let vocab = get_mut(&mut target, "vocabularies")
            .and_then(|v| {
                if let Value::Object(m) = v {
                    Some(m)
                } else {
                    None
                }
            })
            .ok_or_else(|| err("AVRO_FACET_TARGET", "Vocabularies object required"))?;
        if !vocab.iter().any(|(k, _)| k == &u(EXT)) {
            vocab.push((u(EXT), obj(vec![("version", t("1.0.0"))])))
        }
        let modules = get_mut(&mut target, "modules")
            .and_then(|v| {
                if let Value::Array(a) = v {
                    Some(a)
                } else {
                    None
                }
            })
            .ok_or_else(|| err("AVRO_FACET_FIELD", "Source modules are required"))?;
        let target_element = get_mut(&mut modules[mi], "elements")
            .and_then(|v| {
                if let Value::Array(a) = v {
                    Some(a)
                } else {
                    None
                }
            })
            .and_then(|a| a.get_mut(ei))
            .ok_or_else(|| err("AVRO_FACET_FIELD", "Selected Field is absent"))?;
        if get(target_element, "facets").is_none()
            && !matches!(&facets,Value::Object(v) if v.is_empty())
        {
            set(target_element, "facets", facets.clone())?
        }
        let ext = get_mut(target_element, "extensions")
            .and_then(|v| {
                if let Value::Object(m) = v {
                    Some(m)
                } else {
                    None
                }
            })
            .ok_or_else(|| err("AVRO_FACET_TARGET", "Field extensions object required"))?;
        ext.push((
            u(EXT),
            obj(vec![
                ("origin", t("classified")),
                (
                    "location",
                    get(&request, "location").cloned().unwrap_or(Value::Null),
                ),
                (
                    "binding",
                    obj(vec![("id", t(EXT)), ("version", t("1.0.0"))]),
                ),
                (
                    "profile",
                    get(&request, "profile").cloned().unwrap_or(Value::Null),
                ),
                (
                    "obligation",
                    get(&request, "obligation").cloned().unwrap_or(Value::Null),
                ),
                ("outcome", Value::String(outcome.clone())),
                ("observations", copy_json(&observations_value, ctx)?),
            ]),
        ));
    }
    if status == "classified" && !valid_doc(&target, &rt, ctx)? {
        return Err(err(
            "AVRO_FACET_TARGET",
            "Classification would violate current core constraints",
        ));
    }
    let diagnostics = Value::Array(
        residuals
            .iter()
            .map(|r| {
                obj(vec![
                    (
                        "code",
                        t(if conflict {
                            "AVRO_FACET_CONFLICT"
                        } else {
                            "AVRO_FACET_UNRESOLVED"
                        }),
                    ),
                    ("path", get(r, "path").cloned().unwrap_or(Value::Null)),
                    ("message", get(r, "reason").cloned().unwrap_or(Value::Null)),
                    (
                        "severity",
                        t(if status == "blocked" {
                            "error"
                        } else {
                            "warning"
                        }),
                    ),
                ])
            })
            .collect(),
    );
    let mut fields = vec![
        ("operation", t("classify-avro-facets")),
        ("version", t("1.0.0")),
        ("status", t(status)),
        ("outcome", Value::String(outcome)),
        ("source", source),
        ("request", request),
        ("binding", binding),
        ("mapping", mapping),
        ("residuals", Value::Array(residuals)),
        ("diagnostics", diagnostics),
    ];
    if status == "classified" {
        fields.push(("target", target))
    }
    let result = Value::Object(fields.into_iter().map(|(k, v)| (u(k), v)).collect());
    verify_result(&result, &rt, ctx)?;
    Ok(result)
}
/// Recompute the complete source/profile receipt and compare the current target.
pub fn verify_avro_facet_classification(
    receipt: &Value,
    current: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(ctx)?;
    let errors = rt.result.validate(receipt, ctx)?;
    if !errors.is_empty() {
        return Err(schema_errors("AVRO_FACET_RECEIPT", &errors, ctx)?);
    }
    if text(receipt, "status") != Some(&u("classified")) {
        return Err(err(
            "AVRO_FACET_RECEIPT",
            "Complete classified receipt required",
        ));
    }
    let expected = classify_avro_facets(
        get(receipt, "source")
            .ok_or_else(|| err("AVRO_FACET_RECEIPT", "Receipt source required"))?,
        get(receipt, "request")
            .ok_or_else(|| err("AVRO_FACET_RECEIPT", "Receipt request required"))?,
        ctx,
    )?;
    if !equal(receipt, &expected, ctx)? {
        return Err(err(
            "AVRO_FACET_RECEIPT",
            "Receipt disagrees with recomputed source and profile",
        ));
    }
    let target = get(receipt, "target")
        .ok_or_else(|| err("AVRO_FACET_RECEIPT", "Receipt target required"))?;
    if !equal(current, target, ctx)? {
        return Err(err(
            "AVRO_FACET_STALE",
            "Target changed after classification",
        ));
    }
    copy_json(receipt, ctx)
}
/// Recover exact original Avro source text and ordered dependency artifacts.
pub fn recover_avro_facet_source(
    receipt: &Value,
    current: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let verified = verify_avro_facet_classification(receipt, current, ctx)?;
    let request = get(&verified, "request")
        .ok_or_else(|| err("AVRO_FACET_RECEIPT", "Receipt request required"))?;
    let dependencies = get(request, "dependencies")
        .cloned()
        .unwrap_or(Value::Array(Vec::new()));
    Ok(obj(vec![
        (
            "schema",
            get(request, "nativeSource").cloned().unwrap_or(Value::Null),
        ),
        ("dependencies", dependencies),
    ]))
}
