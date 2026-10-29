// SPDX-License-Identifier: MIT OR Apache-2.0
//! Opt-in Avro 1.12.0 present, non-null structural cardinality classification.
//! The retained tagged native tree is always the source of truth.

use crate::{
    avro_document,
    avro_fields::{AvroDependency, derive_avro_fields},
    context::Context,
    engine::{Capabilities, Engine, ResourceSet, SemanticContext},
    error::{Diagnostic, EngineError},
    native_json::{NativeJsonNode as N, NativeJsonTree},
    registry::Registry,
    schema::{CompiledSchema, SchemaResources},
    serialization::{self, Format},
    value::{Utf16, Value, copy_json},
};
use std::collections::{HashMap, HashSet};

const RESULT_SCHEMA: &str =
    include_str!("../../../spec/core/avro-cardinality-classification.schema.json");
const CORE_SCHEMA: &str = include_str!("../../../spec/core/schema.json");
const PACKAGE: &str = include_str!("../../../spec/extensions/avro-cardinality/package.json");
const EXT: &str = "umf.avro.cardinality";
const BASIS: &str = "Declared shape of present non-null values; native union branches, availability, logical refinements and codec behavior remain separate";
const RECOVERY: &str = "Retain original native archive and author assertions; classification does not replace native meaning";

type Loc = (Option<Utf16>, Utf16);
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
    match v {
        Value::Object(m) => m.iter().find(|(x, _)| x == &u(k)).map(|(_, v)| v),
        _ => None,
    }
}
fn get_mut<'a>(v: &'a mut Value, k: &str) -> Option<&'a mut Value> {
    match v {
        Value::Object(m) => m.iter_mut().find(|(x, _)| x == &u(k)).map(|(_, v)| v),
        _ => None,
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
fn err(code: &'static str, message: impl Into<String>) -> EngineError {
    EngineError::new(code, u(""), message.into())
}
fn copy(v: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    copy_json(v, ctx)
}
fn loc_value(l: &Loc, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let mut f = vec![(u("path"), Value::String(l.1.clone()))];
    if let Some(d) = &l.0 {
        f.push((u("dependencyId"), Value::String(d.clone())))
    }
    ctx.charge_work(l.1.len() + l.0.as_ref().map_or(0, Utf16::len), u(""))?;
    Ok(Value::Object(f))
}
fn child(l: &Loc, s: &str) -> Loc {
    let mut p = l.1.units().to_vec();
    p.extend(s.encode_utf16());
    (l.0.clone(), Utf16::new(p))
}
fn member<'a>(n: &'a N, k: &str) -> Option<&'a N> {
    if let N::Object(m) = n {
        m.iter().find(|(x, _)| x == &u(k)).map(|(_, v)| v)
    } else {
        None
    }
}
fn ns(n: &N) -> Option<&Utf16> {
    if let N::String(s) = n { Some(s) } else { None }
}
fn qualified(name: &Utf16, namespace: &Utf16) -> Utf16 {
    if name.units().contains(&(b'.' as u16)) || namespace.is_empty() {
        name.clone()
    } else {
        let mut p = namespace.units().to_vec();
        p.push(b'.' as u16);
        p.extend(name.units());
        Utf16::new(p)
    }
}
fn namespace_of(full: &Utf16) -> Utf16 {
    let p = full.units();
    match p.iter().rposition(|c| *c == b'.' as u16) {
        Some(i) => Utf16::new(p[..i].to_vec()),
        None => u(""),
    }
}
fn primitive(s: &Utf16) -> bool {
    [
        "null", "boolean", "int", "long", "float", "double", "bytes", "string",
    ]
    .iter()
    .any(|x| s == &u(x))
}
fn named(s: &Utf16) -> bool {
    ["record", "error", "enum", "fixed"]
        .iter()
        .any(|x| s == &u(x))
}
fn parse_resource(src: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    serialization::read_json_value(&src.encode_utf16().collect::<Vec<_>>(), Format::Json, ctx)
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
fn runtime(ctx: &mut Context<'_>) -> Result<Runtime, EngineError> {
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
    let mut registry = Registry::new();
    let resources = engine.schema_resources_with_context(ctx)?;
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
    let resources = SchemaResources {
        entries: vec![
            (
                u("urn:umf:native-json:0.1.0"),
                parse_resource(
                    include_str!("../../../spec/core/native-json.schema.json"),
                    ctx,
                )?,
            ),
            (u("urn:umf:core:0.10.0"), parse_resource(CORE_SCHEMA, ctx)?),
            (
                u("urn:umf:core:semantic-type-reference:1.0.0"),
                parse_resource(
                    include_str!("../../../spec/core/semantic-type-reference.schema.json"),
                    ctx,
                )?,
            ),
            (
                u("urn:umf:core:kind-operation:6.0.0"),
                parse_resource(
                    include_str!("../../../spec/core/kind-operation-v6.schema.json"),
                    ctx,
                )?,
            ),
        ],
    };
    let schema = parse_resource(RESULT_SCHEMA, ctx)?;
    let request = get(
        get(&schema, "properties")
            .ok_or_else(|| err("AVRO_CARDINALITY_SCHEMA", "Missing properties"))?,
        "request",
    )
    .ok_or_else(|| err("AVRO_CARDINALITY_SCHEMA", "Missing request"))?;
    Ok(Runtime {
        engine,
        registry,
        result: CompiledSchema::compile(&schema, &resources, ctx)?,
        request: CompiledSchema::compile(request, &resources, ctx)?,
    })
}
fn valid_doc(v: &Value, r: &Runtime, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    Ok(r.engine
        .validate_document(v, &r.registry, &mut NoCallbacks, ctx)?
        .valid)
}
fn result_check(v: &Value, r: &Runtime, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    let errors = r.result.validate(v, ctx)?;
    if errors.is_empty() {
        Ok(())
    } else {
        Err(schema_error(
            "AVRO_CARDINALITY_RESULT",
            &errors,
            false,
            Some(v),
            ctx,
        )?)
    }
}
fn schema_error(
    code: &'static str,
    errors: &[crate::schema::StructuralError],
    request: bool,
    input: Option<&Value>,
    ctx: &mut Context<'_>,
) -> Result<EngineError, EngineError> {
    let mut items = Vec::with_capacity(errors.len());
    for e in errors {
        let (params, message) = if request && e.keyword == "enum" {
            (obj(vec![]), u("must pass \"enum\" keyword validation"))
        } else if request && e.keyword == "additionalProperties" {
            let allowed: &[&str] = if e.instance_path == u("") {
                &[
                    "column",
                    "nativeSource",
                    "dependencies",
                    "identity",
                    "profile",
                    "mode",
                ]
            } else if e.instance_path == u("/identity") {
                &["module", "element"]
            } else {
                &["id", "schema"]
            };
            let mut at = input;
            for segment in crate::native_json::native_pointer(&e.instance_path, ctx)? {
                at = match at {
                    Some(Value::Object(fields)) => fields
                        .iter()
                        .find(|(key, _)| key == &segment)
                        .map(|(_, value)| value),
                    Some(Value::Array(items)) => segment
                        .to_utf8()
                        .ok()
                        .and_then(|index| index.parse::<usize>().ok())
                        .and_then(|index| items.get(index)),
                    _ => None,
                };
            }
            let extra = match at {
                Some(Value::Object(fields)) => fields
                    .iter()
                    .find(|(key, _)| !allowed.iter().any(|name| key == &u(name)))
                    .map(|(key, _)| key.clone()),
                _ => None,
            };
            (
                extra.map_or_else(
                    || obj(vec![]),
                    |key| obj(vec![("additionalProperty", Value::String(key))]),
                ),
                e.message.clone(),
            )
        } else {
            (copy(&e.params, ctx)?, e.message.clone())
        };
        items.push(obj(vec![
            ("instancePath", Value::String(e.instance_path.clone())),
            ("schemaPath", Value::String(e.schema_path.clone())),
            ("keyword", t(&e.keyword)),
            ("params", params),
            ("message", Value::String(message)),
        ]));
    }
    Ok(EngineError::new(
        code,
        u(""),
        serialization::stringify_compact_metered(&Value::Array(items), ctx)?,
    ))
}
fn binding() -> Value {
    obj(vec![
        ("id", t(EXT)),
        ("version", t("1.0.0")),
        ("nativeVersion", t("1.12.0")),
        ("subset", t(BASIS)),
    ])
}
fn native_binding() -> Value {
    obj(vec![("id", t(EXT)), ("version", t("1.0.0"))])
}

struct Types {
    namespaces: HashMap<Loc, Utf16>,
    names: HashMap<Utf16, Loc>,
    seen: HashSet<Utf16>,
}
impl Types {
    fn new() -> Self {
        Self {
            namespaces: HashMap::new(),
            names: HashMap::new(),
            seen: HashSet::new(),
        }
    }
    fn walk(
        &mut self,
        n: &N,
        l: &Loc,
        namespace: &Utf16,
        depth: usize,
        ctx: &mut Context<'_>,
    ) -> Result<(), EngineError> {
        ctx.charge_work(1 + l.1.len(), l.1.clone())?;
        if depth > ctx.limits().max_depth {
            return Err(err("LIMIT", "Avro type depth exceeded"));
        }
        self.namespaces.insert(l.clone(), namespace.clone());
        match n {
            N::String(s) => {
                if !primitive(s) && !self.names.contains_key(&qualified(s, namespace)) {
                    return Err(err(
                        "AVRO_TYPE",
                        format!(
                            "undefined type name: {}",
                            qualified(s, namespace).to_utf8().unwrap_or_default()
                        ),
                    ));
                }
            }
            N::Array(items) => {
                if items.is_empty() {
                    return Err(err("AVRO_TYPE", "Empty union"));
                }
                let mut branch_names = HashSet::new();
                for (i, item) in items.iter().enumerate() {
                    let branch_name = match item {
                        N::String(s) => Some(s),
                        N::Object(_) => member(item, "type").and_then(ns),
                        _ => None,
                    };
                    if let Some(name) = branch_name {
                        if primitive(name) && !branch_names.insert(name.clone()) {
                            let quoted = serialization::stringify_compact_metered(
                                &Value::String(name.clone()),
                                ctx,
                            )?;
                            return Err(err(
                                "AVRO_TYPE",
                                format!(
                                    "duplicate union branch name: {}",
                                    quoted.to_utf8().unwrap_or_default()
                                ),
                            ));
                        }
                    }
                    self.walk(item, &child(l, &format!("/{i}")), namespace, depth + 1, ctx)?;
                }
            }
            N::Object(_) => {
                let typ = member(n, "type")
                    .and_then(ns)
                    .ok_or_else(|| err("AVRO_TYPE", "Expected native string"))?;
                let mut local = namespace.clone();
                if named(typ) {
                    let name = member(n, "name")
                        .and_then(ns)
                        .ok_or_else(|| err("AVRO_TYPE", "Expected native string"))?;
                    let declared = member(n, "namespace")
                        .map(|v| ns(v).ok_or_else(|| err("AVRO_TYPE", "Expected native string")))
                        .transpose()?
                        .unwrap_or(namespace);
                    let full = qualified(name, declared);
                    if !self.seen.insert(full.clone()) {
                        return Err(err("AVRO_TYPE", "Duplicate native name"));
                    }
                    self.names.insert(full.clone(), l.clone());
                    local = namespace_of(&full);
                    self.namespaces.insert(l.clone(), local.clone());
                }
                if typ == &u("record") || typ == &u("error") {
                    let N::Array(fields) = member(n, "fields")
                        .ok_or_else(|| err("AVRO_TYPE", "Expected record fields"))?
                    else {
                        return Err(err("AVRO_TYPE", "Expected record fields"));
                    };
                    let mut field_names = HashSet::new();
                    for (i, f) in fields.iter().enumerate() {
                        let name = member(f, "name")
                            .and_then(ns)
                            .ok_or_else(|| err("AVRO_TYPE", "Malformed record field"))?;
                        if !field_names.insert(name.clone()) {
                            return Err(err("AVRO_TYPE", "Duplicate native field"));
                        }
                        let ftype = member(f, "type")
                            .ok_or_else(|| err("AVRO_TYPE", "Malformed record field"))?;
                        self.walk(
                            ftype,
                            &child(l, &format!("/fields/{i}/type")),
                            &local,
                            depth + 1,
                            ctx,
                        )?;
                    }
                } else if typ == &u("array") || typ == &u("map") {
                    let key = if typ == &u("array") {
                        "items"
                    } else {
                        "values"
                    };
                    let item =
                        member(n, key).ok_or_else(|| err("AVRO_TYPE", format!("Missing {key}")))?;
                    self.walk(item, &child(l, &format!("/{key}")), &local, depth + 1, ctx)?;
                } else if typ == &u("enum") {
                    if !matches!(member(n, "symbols"), Some(N::Array(_))) {
                        return Err(err("AVRO_TYPE", "Expected enum symbols"));
                    }
                } else if typ == &u("fixed") {
                    let Some(N::Number(size)) = member(n, "size") else {
                        return Err(err("AVRO_TYPE", "Expected fixed size"));
                    };
                    if size.parse::<usize>().ok().filter(|n| *n > 0).is_none() {
                        return Err(err("AVRO_TYPE", "Unresolved fixed size"));
                    }
                } else if !primitive(typ) && !self.names.contains_key(&qualified(typ, namespace)) {
                    return Err(err(
                        "AVRO_TYPE",
                        format!(
                            "undefined type name: {}",
                            qualified(typ, namespace).to_utf8().unwrap_or_default()
                        ),
                    ));
                }
            }
            _ => return Err(err("AVRO_TYPE", "Expected type syntax")),
        }
        Ok(())
    }
}
struct Branch {
    shape: &'static str,
    definition: Option<Loc>,
    item: Option<Loc>,
}
fn branch(n: &N, l: &Loc, types: &Types, ctx: &mut Context<'_>) -> Result<Branch, EngineError> {
    ctx.charge_work(l.1.len().saturating_add(1), l.1.clone())?;
    let typ = match n {
        N::String(s) => s,
        N::Object(_) => member(n, "type")
            .and_then(ns)
            .ok_or_else(|| err("AVRO_TYPE", "Expected native string"))?,
        _ => return Err(err("AVRO_TYPE", "Unresolved union branch")),
    };
    let namespace = types.namespaces.get(l).cloned().unwrap_or_else(|| u(""));
    let (shape, definition, item) = if typ == &u("null") {
        ("null", None, None)
    } else if typ == &u("array") || typ == &u("map") {
        if !matches!(n, N::Object(_)) {
            return Err(err("AVRO_TYPE", "Missing container definition"));
        }
        let key = if typ == &u("array") {
            "items"
        } else {
            "values"
        };
        (
            if key == "items" { "array" } else { "map" },
            None,
            Some(child(l, &format!("/{key}"))),
        )
    } else if named(typ) {
        ("one", Some(l.clone()), None)
    } else if !primitive(typ) {
        let full = qualified(typ, &namespace);
        (
            "one",
            Some(
                types
                    .names
                    .get(&full)
                    .ok_or_else(|| {
                        err(
                            "AVRO_TYPE",
                            format!(
                                "undefined type name: {}",
                                full.to_utf8().unwrap_or_default()
                            ),
                        )
                    })?
                    .clone(),
            ),
            None,
        )
    } else {
        ("one", None, None)
    };
    Ok(Branch {
        shape,
        definition,
        item,
    })
}
fn inspect(
    source: &Value,
    l: &Loc,
    types: &Types,
    ctx: &mut Context<'_>,
) -> Result<(String, bool, Vec<Loc>, Option<Loc>, Vec<Loc>), EngineError> {
    let tree = avro_document::get_node(source, &l.1, l.0.as_ref(), ctx)?;
    let n = tree.root();
    let mut branches = Vec::new();
    if let N::Array(items) = n {
        for (i, x) in items.iter().enumerate() {
            branches.push(branch(x, &child(l, &format!("/{i}")), types, ctx)?);
        }
    } else {
        branches.push(branch(n, l, types, ctx)?)
    }
    let allows = branches.iter().any(|b| b.shape == "null");
    let nonnull = branches
        .iter()
        .filter(|b| b.shape != "null")
        .collect::<Vec<_>>();
    let shape = if nonnull.is_empty() || nonnull.iter().any(|b| b.shape != nonnull[0].shape) {
        "unspecified"
    } else {
        nonnull[0].shape
    };
    let definitions = branches
        .iter()
        .filter_map(|b| b.definition.clone())
        .collect();
    let item = if shape == "array" || shape == "map" {
        nonnull
            .iter()
            .find(|b| b.shape == shape)
            .and_then(|b| b.item.clone())
    } else {
        None
    };
    let scalar_definitions = branches
        .iter()
        .filter(|b| b.shape != "null")
        .map(|b| b.definition.clone().unwrap_or_else(|| l.clone()))
        .collect();
    Ok((
        shape.to_string(),
        allows,
        definitions,
        item,
        scalar_definitions,
    ))
}
fn push_residual(
    residuals: &mut Vec<Value>,
    path: &Utf16,
    value: Value,
    reason: String,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    ctx.charge_work(path.len() + reason.len(), path.clone())?;
    residuals.push(obj(vec![
        ("path", Value::String(path.clone())),
        ("value", value),
        ("reason", t(&reason)),
        ("recovery", t(RECOVERY)),
    ]));
    Ok(())
}
fn canonical(v: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    ctx.charge_work(1, u(""))?;
    match v {
        Value::Object(fields) => {
            let mut o = Vec::with_capacity(fields.len());
            for (k, v) in fields {
                o.push((k.clone(), canonical(v, ctx)?))
            }
            o.sort_by(|a, b| a.0.units().cmp(b.0.units()));
            Ok(Value::Object(o))
        }
        Value::Array(items) => Ok(Value::Array(
            items
                .iter()
                .map(|v| canonical(v, ctx))
                .collect::<Result<_, _>>()?,
        )),
        _ => copy(v, ctx),
    }
}
fn same(a: &Value, b: &Value, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    Ok(canonical(a, ctx)? == canonical(b, ctx)?)
}
fn scalar_family(
    source: &Value,
    l: &Loc,
    types: &Types,
    ctx: &mut Context<'_>,
) -> Result<Option<&'static str>, EngineError> {
    let tree = avro_document::get_node(source, &l.1, l.0.as_ref(), ctx)?;
    let branches = if let N::Array(items) = tree.root() {
        items
            .iter()
            .enumerate()
            .map(|(i, n)| (child(l, &format!("/{i}")), n))
            .collect::<Vec<_>>()
    } else {
        vec![(l.clone(), tree.root())]
    };
    let mut json = Vec::<u16>::new();
    if branches.len() > 1 {
        json.push(b'[' as u16)
    }
    for (i, (location, node)) in branches.iter().enumerate() {
        if i > 0 {
            json.push(b',' as u16)
        }
        let b = branch(node, location, types, ctx)?;
        let effective = b.definition.as_ref().unwrap_or(location);
        let native = avro_document::get_node(source, &effective.1, effective.0.as_ref(), ctx)?;
        json.extend(native.render_compact(ctx)?.units());
    }
    if branches.len() > 1 {
        json.push(b']' as u16)
    }
    let mut wrapper=u("{\"type\":\"record\",\"name\":\"CardinalityScalar\",\"fields\":[{\"name\":\"value\",\"type\":").units().to_vec();
    wrapper.extend(json);
    wrapper.extend(u("}]}").units());
    let synthetic = NativeJsonTree::parse_json(&wrapper, ctx)?;
    let fields = derive_avro_fields(&synthetic, &[], ctx)?;
    Ok(fields
        .iter()
        .find(|f| f.path == u("/fields/0"))
        .and_then(|f| f.scalar_type)
        .map(|f| f.as_str()))
}

pub fn classify_avro_cardinality(
    input: &Value,
    options: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let r = runtime(ctx)?;
    let source = copy(input, ctx)?;
    let request = copy(options, ctx)?;
    let errors = r.request.validate(&request, ctx)?;
    if !errors.is_empty() {
        return Err(schema_error(
            "AVRO_CARDINALITY_REQUEST",
            &errors,
            true,
            Some(&request),
            ctx,
        )?);
    }
    if text(&source, "umf") != Some(&u("0.10.0")) || !valid_doc(&source, &r, ctx)? {
        return Err(err(
            "AVRO_CARDINALITY_SOURCE",
            "Valid core 0.10.0 required; migrate explicitly",
        ));
    }
    let exported = avro_document::export_bundle(&source, ctx)?;
    let native_source = text(&request, "nativeSource")
        .ok_or_else(|| err("AVRO_CARDINALITY_REQUEST", "nativeSource required"))?;
    let native_tree = NativeJsonTree::parse_json(native_source.units(), ctx)?;
    let mut rendered = native_tree.render_compact(ctx)?.units().to_vec();
    rendered.push(b'\n' as u16);
    if exported.schema_json.units() != rendered {
        return Err(err(
            "AVRO_CARDINALITY_ARCHIVE",
            "Source bundle differs from retained native archive",
        ));
    }
    let deps = match get(&request, "dependencies") {
        Some(Value::Array(a)) => a.as_slice(),
        _ => &[],
    };
    if deps.len() != exported.dependencies.len() {
        return Err(err(
            "AVRO_CARDINALITY_ARCHIVE",
            "Source bundle differs from retained native archive",
        ));
    }
    let mut dep_trees = Vec::new();
    for (d, (id, archive)) in deps.iter().zip(&exported.dependencies) {
        let ds = text(d, "schema")
            .ok_or_else(|| err("AVRO_CARDINALITY_REQUEST", "Dependency schema required"))?;
        let tree = NativeJsonTree::parse_json(ds.units(), ctx)?;
        let mut rendered = tree.render_compact(ctx)?.units().to_vec();
        rendered.push(b'\n' as u16);
        if text(d, "id") != Some(id) || archive.units() != rendered {
            return Err(err(
                "AVRO_CARDINALITY_ARCHIVE",
                "Source bundle differs from retained native archive",
            ));
        }
        dep_trees.push((id.clone(), tree));
    }
    let native_root = avro_document::get_node(&source, &u(""), None, ctx)?;
    let references = dep_trees
        .iter()
        .map(|(id, root)| AvroDependency { id, root })
        .collect::<Vec<_>>();
    let fields = derive_avro_fields(&native_root, &references, ctx)?;
    let column = text(&request, "column").unwrap();
    let field = fields
        .iter()
        .find(|f| &f.element_id == column)
        .ok_or_else(|| err("AVRO_CARDINALITY_COLUMN", "Native field not found"))?;
    let root_loc = (
        field.dependency_id.clone(),
        child(&(field.dependency_id.clone(), field.path.clone()), "/type").1,
    );
    let mut types = Types::new();
    let mut type_error = None;
    for (id, tree) in dep_trees
        .iter()
        .map(|(id, t)| (Some(id.clone()), t))
        .chain(std::iter::once((None, &native_root)))
    {
        if let Err(e) = types.walk(tree.root(), &(id, u("")), &u(""), 0, ctx) {
            if e.code != "AVRO_TYPE" {
                return Err(e);
            }
            type_error = Some(e);
            break;
        }
    }
    let identity = get(&request, "identity").unwrap();
    let module_id = text(identity, "module").unwrap();
    let element_id = text(identity, "element").unwrap();
    let profile = text(&request, "profile").unwrap();
    let mode = text(&request, "mode").unwrap();
    let mut pending = vec![root_loc.clone()];
    let mut identities = HashMap::from([(root_loc.clone(), element_id.clone())]);
    let mut nodes = Vec::new();
    let mut elements = Vec::new();
    let mut residuals = Vec::new();
    let mut index = 0;
    while index < pending.len() {
        ctx.charge_work(1, u(""))?;
        let loc = pending[index].clone();
        let id = identities.get(&loc).unwrap().clone();
        let tree = avro_document::get_node(&source, &loc.1, loc.0.as_ref(), ctx)?;
        let native = tree.tagged_value_preserving_extras(ctx)?;
        let mut shape = "unspecified".to_string();
        let mut interpretation = "unknown";
        let mut allows = Value::Null;
        let mut definitions = Vec::new();
        let mut item = None;
        if profile == &u("unresolved") {
            push_residual(&mut residuals,&loc.1,copy(&native,ctx)?,"An explicit present-non-null-schema profile is required; no container or availability inference is made".into(),ctx)?;
        } else if let Some(e) = &type_error {
            interpretation = "unsupported";
            push_residual(
                &mut residuals,
                &loc.1,
                copy(&native, ctx)?,
                format!(
                    "Native structural type is unresolved: {}",
                    e.message.to_utf8().unwrap_or_default()
                ),
                ctx,
            )?;
        } else {
            match inspect(&source, &loc, &types, ctx) {
                Ok((s, a, d, i, sc)) => {
                    shape = s;
                    allows = Value::Bool(a);
                    definitions = d;
                    item = i;
                    let _ = sc;
                    interpretation = if shape == "unspecified" {
                        "unknown"
                    } else {
                        "declared"
                    };
                    if shape == "unspecified" {
                        push_residual(&mut residuals,&loc.1,copy(&native,ctx)?,"Null-only or mixed container branches do not establish a single present non-null shape".into(),ctx)?;
                    }
                }
                Err(e) => {
                    if e.code != "AVRO_TYPE" {
                        return Err(e);
                    }
                    interpretation = "unsupported";
                    push_residual(
                        &mut residuals,
                        &loc.1,
                        copy(&native, ctx)?,
                        format!(
                            "Native structural type is unresolved: {}",
                            e.message.to_utf8().unwrap_or_default()
                        ),
                        ctx,
                    )?;
                }
            }
        }
        let defvalues = definitions
            .iter()
            .map(|d| loc_value(d, ctx))
            .collect::<Result<Vec<_>, _>>()?;
        let location = loc_value(&loc, ctx)?;
        nodes.push(obj(vec![
            (
                "identity",
                obj(vec![
                    ("module", Value::String(module_id.clone())),
                    ("element", Value::String(id.clone())),
                ]),
            ),
            ("location", copy(&location, ctx)?),
            ("nativeFragment", copy(&native, ctx)?),
            ("cardinality", t(&shape)),
            ("interpretation", t(interpretation)),
            ("nativeAllowsNull", copy(&allows, ctx)?),
            ("definitions", Value::Array(defvalues.clone())),
        ]));
        let mut element = vec![
            (u("id"), Value::String(id.clone())),
            (u("kind"), t("field")),
        ];
        if index == 0 {
            element.push((u("name"), Value::String(field.name.clone())))
        }
        element.push((u("cardinality"), t(&shape)));
        let extension = obj(vec![
            ("origin", t("classified")),
            ("nativeColumn", Value::String(column.clone())),
            ("binding", native_binding()),
            ("profile", Value::String(profile.clone())),
            ("basis", t(BASIS)),
            ("location", location),
            ("nativeFragment", native),
            ("interpretation", t(interpretation)),
            ("nativeAllowsNull", allows),
            ("definitions", Value::Array(defvalues)),
        ]);
        element.push((u("extensions"), Value::Object(vec![(u(EXT), extension)])));
        if let Some(item) = item {
            if shape == "array" || shape == "map" {
                let iid = if let Some(existing) = identities.get(&item) {
                    existing.clone()
                } else {
                    let generated = serialization::stringify_compact_metered(
                        &Value::Array(vec![
                            Value::String(element_id.clone()),
                            item.0
                                .as_ref()
                                .map_or(Value::Null, |d| Value::String(d.clone())),
                            Value::String(item.1.clone()),
                        ]),
                        ctx,
                    )?;
                    identities.insert(item.clone(), generated.clone());
                    pending.push(item);
                    generated
                };
                element.push((
                    u("itemType"),
                    obj(vec![
                        ("module", Value::String(module_id.clone())),
                        ("element", Value::String(iid)),
                    ]),
                ));
            }
        }
        if shape == "one" {
            if let Some(family) = scalar_family(&source, &loc, &types, ctx)? {
                element.push((u("scalarType"), t(family)));
            }
        }
        elements.push(Value::Object(element));
        index += 1;
    }
    let cardinality = get(&nodes[0], "cardinality").unwrap();
    let mut conflict = None;
    let modules = match get(&source, "modules") {
        Some(Value::Array(v)) => v,
        _ => unreachable!(),
    };
    let native_element = modules
        .iter()
        .find(|m| text(m, "id") == Some(&u("avro.fields")))
        .and_then(|m| get(m, "elements"))
        .and_then(|e| {
            if let Value::Array(a) = e {
                a.iter().find(|e| text(e, "id") == Some(column))
            } else {
                None
            }
        });
    if native_element.and_then(|e| text(e, "kind")) != Some(&u("field")) {
        conflict = Some("Native member must first be classified as an explicit Field")
    }
    let existing_module = modules.iter().find(|m| text(m, "id") == Some(module_id));
    if module_id == &u("avro.fields") || module_id == &u("schema") {
        conflict = Some("Logical fields cannot extend native representation modules")
    }
    let mut seen = HashSet::new();
    if elements
        .iter()
        .any(|e| !seen.insert(text(e, "id").unwrap().clone()))
        || existing_module
            .and_then(|m| get(m, "elements"))
            .and_then(|e| {
                if let Value::Array(a) = e {
                    Some(a)
                } else {
                    None
                }
            })
            .is_some_and(|a| {
                a.iter()
                    .any(|e| seen.contains(text(e, "id").unwrap_or(&u(""))))
            })
    {
        conflict = Some("A logical identity collides with existing meaning")
    }
    if get(get(&source, "vocabularies").unwrap(), EXT)
        .and_then(|v| text(v, "version"))
        .is_some_and(|v| v != &u("1.0.0"))
    {
        conflict = Some("Incompatible binding vocabulary")
    }
    if let Some(c) = conflict {
        push_residual(&mut residuals, &u("/modules"), Value::Null, c.into(), ctx)?
    }
    let status = if conflict.is_some() || mode == &u("strict") && !residuals.is_empty() {
        "blocked"
    } else {
        "classified"
    };
    let outcome = if residuals.is_empty() {
        "exact"
    } else if nodes
        .iter()
        .any(|n| text(n, "interpretation") == Some(&u("unsupported")))
    {
        "not-expressible"
    } else {
        "unknown"
    };
    let mut output = vec![
        (u("operation"), t("classify-avro-cardinality")),
        (u("version"), t("1.0.0")),
        (u("status"), t(status)),
        (u("source"), source),
        (u("request"), copy(&request, ctx)?),
        (u("binding"), binding()),
        (
            u("mapping"),
            obj(vec![
                ("origin", t("classified")),
                ("cardinality", copy(cardinality, ctx)?),
                ("outcome", t(outcome)),
                ("basis", t(BASIS)),
                ("nodes", Value::Array(nodes)),
            ]),
        ),
    ];
    if status == "classified" {
        let mut target = copy(
            &output.iter().find(|(k, _)| k == &u("source")).unwrap().1,
            ctx,
        )?;
        let modules = get_mut(&mut target, "modules").unwrap();
        if let Value::Array(a) = modules {
            if let Some(m) = a.iter_mut().find(|m| text(m, "id") == Some(module_id)) {
                if let Some(Value::Array(e)) = get_mut(m, "elements") {
                    e.extend(elements)
                }
            } else {
                a.push(obj(vec![
                    ("id", Value::String(module_id.clone())),
                    ("namespace", t("")),
                    ("elements", Value::Array(elements)),
                ]))
            }
        }
        let vocab = get_mut(&mut target, "vocabularies").unwrap();
        if let Value::Object(v) = vocab {
            if !v.iter().any(|(k, _)| k == &u(EXT)) {
                v.push((u(EXT), obj(vec![("version", t("1.0.0"))])))
            }
        }
        if !valid_doc(&target, &r, ctx)? {
            return Err(err("AVRO_CARDINALITY_TARGET", "Invalid logical candidate"));
        }
        let check = avro_document::export_bundle(&target, ctx)?;
        if check.schema_json != exported.schema_json || check.dependencies != exported.dependencies
        {
            return Err(err("AVRO_CARDINALITY_NATIVE", "Native bundle changed"));
        }
        output.push((u("target"), target));
    }
    let diagnostics = residuals
        .iter()
        .map(|v| {
            obj(vec![
                ("code", t("AVRO_CARDINALITY_RESIDUAL")),
                ("path", get(v, "path").unwrap().clone()),
                ("message", get(v, "reason").unwrap().clone()),
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
        .collect();
    output.push((u("residuals"), Value::Array(residuals)));
    output.push((u("diagnostics"), Value::Array(diagnostics)));
    let output = Value::Object(output);
    result_check(&output, &r, ctx)?;
    Ok(output)
}

pub fn verify_avro_cardinality_classification(
    receipt: &Value,
    current: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let r = runtime(ctx)?;
    let input = copy(receipt, ctx)?;
    if r.result.validate(&input, ctx)?.is_empty()
        && text(&input, "status") == Some(&u("classified"))
    {
        let source = get(&input, "source").unwrap();
        let request = get(&input, "request").unwrap();
        let expected = classify_avro_cardinality(source, request, ctx)?;
        if !same(&input, &expected, ctx)? {
            return Err(err(
                "AVRO_CARDINALITY_RECEIPT",
                "Receipt differs from retained source and request",
            ));
        }
        if !same(current, get(&input, "target").unwrap(), ctx)? {
            return Err(err("AVRO_CARDINALITY_STALE", "Current target changed"));
        }
        Ok(input)
    } else {
        Err(err(
            "AVRO_CARDINALITY_RECEIPT",
            "Complete classified receipt required",
        ))
    }
}
pub fn recover_avro_cardinality_bundle(
    receipt: &Value,
    current: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let r = verify_avro_cardinality_classification(receipt, current, ctx)?;
    let request = get(&r, "request").unwrap();
    Ok(obj(vec![
        ("schema", copy(get(request, "nativeSource").unwrap(), ctx)?),
        (
            "dependencies",
            copy(
                get(request, "dependencies").unwrap_or(&Value::Array(vec![])),
                ctx,
            )?,
        ),
    ]))
}
