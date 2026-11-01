// SPDX-License-Identifier: MIT OR Apache-2.0
//! Native-owned classification of Avro's underlying field-value null carrier.
use crate::{
    avro_document,
    avro_fields::{derive_avro_fields, AvroDependency},
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
    include_str!("../../../spec/core/avro-nullability-classification.schema.json");
const CORE_SCHEMA: &str = include_str!("../../../spec/core/schema.json");
const EXT_SCHEMA: &str = include_str!("../../../spec/extensions/avro-nullability/package.json");
const AVRO_SCHEMA: &str = include_str!("../../../spec/extensions/avro/package.json");
const EXT: &str = "umf.avro.nullability";
const RECOVERY: &str = "Retain the complete source and native archive; unknown native meaning is not replaced by the core label";
const BASIS: &str = "Underlying field type in a present containing record; not member omission, reader defaults, ancestor availability or logical refinements";

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
fn text<'a>(v: &'a Value, k: &str) -> Option<&'a Utf16> {
    match get(v, k) {
        Some(Value::String(x)) => Some(x),
        _ => None,
    }
}
fn arr<'a>(v: &'a Value, k: &str) -> Option<&'a [Value]> {
    if let Value::Array(x) = get(v, k)? {
        Some(x)
    } else {
        None
    }
}
fn err(code: &str, path: &str, message: impl Into<String>) -> EngineError {
    EngineError::new(code, u(path), message.into())
}
fn read_json(text: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    serialization::read_json_value(&text.encode_utf16().collect::<Vec<_>>(), Format::Json, ctx)
}
fn validate(
    value: &Value,
    schema: &CompiledSchema,
    ctx: &mut Context<'_>,
    code: &str,
) -> Result<(), EngineError> {
    if schema.validate(value, ctx)?.is_empty() {
        Ok(())
    } else {
        Err(err(
            code,
            "",
            "Value does not match the pinned Avro nullability schema",
        ))
    }
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
        if let Some(x) = CACHE.get() {
            return Ok(Arc::clone(x));
        }
    }
    let engine = Engine::new(
        ResourceSet::new(
            read_json(CORE_SCHEMA, ctx)?,
            read_json(
                include_str!("../../../spec/core/semantic-type-reference.schema.json"),
                ctx,
            )?,
            read_json(
                include_str!("../../../spec/core/extension-package.schema.json"),
                ctx,
            )?,
            read_json(
                include_str!("../../../spec/metamodel/generated/core-constraints.json"),
                ctx,
            )?,
            read_json(
                include_str!("../../../spec/metamodel/generated/domain-policy.json"),
                ctx,
            )?,
        ),
        ctx,
    )?;
    let resources = engine.schema_resources_with_context(ctx)?;
    let mut registry = Registry::new();
    for package in [AVRO_SCHEMA, EXT_SCHEMA] {
        registry.register(
            &read_json(package, ctx)?,
            None,
            engine.package_schema(),
            &resources,
            ctx,
        )?;
    }
    let schema_resources = SchemaResources {
        entries: vec![
            (u("urn:umf:core:0.10.0"), read_json(CORE_SCHEMA, ctx)?),
            (
                u("urn:umf:core:semantic-type-reference:1.0.0"),
                read_json(
                    include_str!("../../../spec/core/semantic-type-reference.schema.json"),
                    ctx,
                )?,
            ),
            (
                u("urn:umf:core:nullability-operation:5.0.0"),
                read_json(
                    include_str!("../../../spec/core/nullability-operation-v5.schema.json"),
                    ctx,
                )?,
            ),
            (
                u("urn:umf:native-json:0.1.0"),
                read_json(
                    include_str!("../../../spec/core/native-json.schema.json"),
                    ctx,
                )?,
            ),
        ],
    };
    let result_value = read_json(RESULT_SCHEMA, ctx)?;
    let result = CompiledSchema::compile(&result_value, &schema_resources, ctx)?;
    let request_value = copy_json(
        get(
            get(&result_value, "properties")
                .ok_or_else(|| err("SCHEMA", "", "result properties missing"))?,
            "request",
        )
        .ok_or_else(|| err("SCHEMA", "", "request schema missing"))?,
        ctx,
    )?;
    let request = CompiledSchema::compile(&request_value, &schema_resources, ctx)?;
    let ready = Arc::new(Runtime {
        engine,
        registry,
        result,
        request,
    });
    if ordinary {
        let _ = CACHE.set(Arc::clone(&ready));
    }
    Ok(ready)
}
fn validate_document(
    source: &Value,
    rt: &Runtime,
    ctx: &mut Context<'_>,
    code: &str,
) -> Result<(), EngineError> {
    let mut cb = NoCallbacks;
    let report = rt
        .engine
        .validate_document(source, &rt.registry, &mut cb, ctx)?;
    if report.valid {
        Ok(())
    } else {
        Err(err(
            code,
            "",
            "Valid current core 0.10.0 source required; migrate explicitly",
        ))
    }
}
fn canonical(v: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    match v {
        Value::Array(a) => {
            let mut o = Vec::with_capacity(a.len());
            for x in a {
                o.push(canonical(x, ctx)?);
            }
            Ok(Value::Array(o))
        }
        Value::Object(m) => {
            let mut o = Vec::with_capacity(m.len());
            for (k, v) in m {
                o.push((k.clone(), canonical(v, ctx)?));
            }
            o.sort_by(|a, b| a.0.cmp(&b.0));
            Ok(Value::Object(o))
        }
        _ => copy_json(v, ctx),
    }
}
fn same(a: &Value, b: &Value, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    Ok(canonical(a, ctx)? == canonical(b, ctx)?)
}
fn normalized_native(raw: &Utf16, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    let tree = NativeJsonTree::parse_json(raw.units(), ctx)?;
    let mut out = tree.render_compact(ctx)?.into_units();
    out.push(b'\n' as u16);
    Ok(Utf16::new(out))
}
fn tagged(tree: &NativeJsonTree, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let raw = tree.render_tagged(ctx)?;
    serialization::read_json_value(raw.units(), Format::Json, ctx)
}
fn set(v: &mut Value, k: &str, value: Value) -> Result<(), EngineError> {
    let Value::Object(fields) = v else {
        return Err(err("AVRO_NULLABILITY_TARGET", "", "Expected object"));
    };
    if let Some((_, old)) = fields.iter_mut().find(|(key, _)| key == &u(k)) {
        *old = value;
    } else {
        fields.push((u(k), value));
    }
    Ok(())
}
fn get_node<'a>(node: &'a N, key: &str) -> Option<&'a N> {
    if let N::Object(m) = node {
        m.iter().find(|(k, _)| k == &u(key)).map(|(_, v)| v)
    } else {
        None
    }
}
fn namespace_from_record(record: &Utf16) -> Utf16 {
    match record.units().iter().rposition(|x| *x == b'.' as u16) {
        Some(i) => Utf16::new(record.units()[..i].to_vec()),
        None => u(""),
    }
}
fn known_names(
    node: &N,
    namespace: &Utf16,
    names: &mut Vec<Utf16>,
    ctx: &mut Context<'_>,
    depth: usize,
) -> Result<(), EngineError> {
    ctx.charge_work(1, u(""))?;
    if depth > ctx.limits().max_depth {
        return Err(err("LIMIT", "", "Avro type depth exceeded"));
    }
    match node {
        N::Array(items) => {
            for item in items {
                known_names(item, namespace, names, ctx, depth + 1)?;
            }
        }
        N::Object(m) => {
            let ty = get_node(node, "type");
            let declared = if matches!(ty,Some(N::String(t)) if ["record","error","enum","fixed"].iter().any(|x|t==&u(x)))
            {
                get_node(node, "name")
                    .and_then(|x| if let N::String(s) = x { Some(s) } else { None })
            } else {
                None
            };
            let mut child_ns = namespace.clone();
            if let Some(name) = declared {
                let full = if name.units().contains(&(b'.' as u16)) {
                    name.clone()
                } else {
                    let explicit = get_node(node, "namespace")
                        .and_then(|x| if let N::String(s) = x { Some(s) } else { None })
                        .unwrap_or(namespace);
                    if explicit.is_empty() {
                        name.clone()
                    } else {
                        let mut p = explicit.units().to_vec();
                        p.push(b'.' as u16);
                        p.extend(name.units());
                        Utf16::new(p)
                    }
                };
                if !names.contains(&full) {
                    if names.len() >= ctx.limits().max_values {
                        return Err(err(
                            "LIMIT",
                            "",
                            "Avro named-type catalog exceeds the admitted value limit",
                        ));
                    }
                    ctx.charge_work(full.len().saturating_add(1), Utf16::default())?;
                    names.try_reserve(1).map_err(|_| {
                        err("LIMIT", "", "Avro named-type catalog allocation failed")
                    })?;
                    names.push(full.clone());
                }
                if let Some(i) = full.units().iter().rposition(|x| *x == b'.' as u16) {
                    child_ns = Utf16::new(full.units()[..i].to_vec());
                } else {
                    child_ns = u("");
                }
                let mut aliases: Vec<&Utf16> = Vec::new();
                match get_node(node, "aliases") {
                    Some(N::String(alias)) => aliases.push(alias),
                    Some(N::Array(items)) => {
                        for item in items {
                            if let N::String(alias) = item {
                                aliases.push(alias);
                            }
                        }
                    }
                    _ => {}
                }
                for alias in aliases {
                    let alias_full = if alias.units().contains(&(b'.' as u16)) {
                        alias.clone()
                    } else if child_ns.is_empty() {
                        alias.clone()
                    } else {
                        let mut units = child_ns.units().to_vec();
                        units.push(b'.' as u16);
                        units.extend(alias.units());
                        Utf16::new(units)
                    };
                    if !names.contains(&alias_full) {
                        if names.len() >= ctx.limits().max_values {
                            return Err(err(
                                "LIMIT",
                                "",
                                "Avro named-type catalog exceeds the admitted value limit",
                            ));
                        }
                        ctx.charge_work(alias_full.len().saturating_add(1), Utf16::default())?;
                        names.try_reserve(1).map_err(|_| {
                            err("LIMIT", "", "Avro named-type catalog allocation failed")
                        })?;
                        names.push(alias_full);
                    }
                }
            }
            if let Some(N::Array(fields)) = get_node(node, "fields") {
                for f in fields {
                    known_names(f, &child_ns, names, ctx, depth + 1)?;
                }
            }
            for key in ["items", "values"] {
                if let Some(c) = get_node(node, key) {
                    known_names(c, &child_ns, names, ctx, depth + 1)?;
                }
            }
            if let Some(c) = ty {
                if !matches!(c, N::String(_)) {
                    known_names(c, &child_ns, names, ctx, depth + 1)?;
                }
            }
        }
        _ => {}
    }
    Ok(())
}
fn qualifies(namespace: &Utf16, name: &Utf16) -> Utf16 {
    if name.units().contains(&(b'.' as u16)) || namespace.is_empty() {
        name.clone()
    } else {
        let mut full = namespace.units().to_vec();
        full.push(b'.' as u16);
        full.extend(name.units());
        Utf16::new(full)
    }
}
fn is_primitive(name: &Utf16) -> bool {
    [
        "null", "boolean", "int", "long", "float", "double", "bytes", "string",
    ]
    .iter()
    .any(|candidate| name == &u(candidate))
}
fn validate_references(
    node: &N,
    namespace: &Utf16,
    names: &[Utf16],
    ctx: &mut Context<'_>,
    depth: usize,
) -> Result<(), EngineError> {
    ctx.charge_work(1, u(""))?;
    if depth > ctx.limits().max_depth {
        return Err(err("AVRO_NULLABILITY_TYPE", "", "Avro type depth exceeded"));
    }
    match node {
        N::String(name) => {
            if !is_primitive(name) && !names.contains(&qualifies(namespace, name)) {
                return Err(err("AVRO_NULLABILITY_TYPE", "", "Named type is unresolved"));
            }
        }
        N::Array(items) => {
            for item in items {
                validate_references(item, namespace, names, ctx, depth + 1)?;
            }
        }
        N::Object(_) => {
            let ty = get_node(node, "type").ok_or_else(|| {
                err(
                    "AVRO_NULLABILITY_TYPE",
                    "",
                    "Native type declaration has no type",
                )
            })?;
            match ty {
                N::Array(_) | N::Object(_) => {
                    validate_references(ty, namespace, names, ctx, depth + 1)?;
                }
                N::String(name) if name == &u("record") || name == &u("error") => {
                    let declared = get_node(node, "name")
                        .and_then(|value| {
                            if let N::String(value) = value {
                                Some(value)
                            } else {
                                None
                            }
                        })
                        .ok_or_else(|| {
                            err("AVRO_NULLABILITY_TYPE", "", "Record name is required")
                        })?;
                    let local_namespace = if declared.units().contains(&(b'.' as u16)) {
                        namespace_from_record(declared)
                    } else {
                        get_node(node, "namespace")
                            .and_then(|value| {
                                if let N::String(value) = value {
                                    Some(value.clone())
                                } else {
                                    None
                                }
                            })
                            .unwrap_or_else(|| namespace.clone())
                    };
                    let fields = match get_node(node, "fields") {
                        Some(N::Array(fields)) => fields,
                        _ => {
                            return Err(err(
                                "AVRO_NULLABILITY_TYPE",
                                "",
                                "Record fields are required",
                            ))
                        }
                    };
                    let mut field_names = Vec::<Utf16>::new();
                    for field in fields {
                        let field_name = get_node(field, "name")
                            .and_then(|value| {
                                if let N::String(value) = value {
                                    Some(value)
                                } else {
                                    None
                                }
                            })
                            .ok_or_else(|| {
                                err("AVRO_NULLABILITY_TYPE", "", "Record field name is required")
                            })?;
                        ctx.charge_work(field_name.len().saturating_add(1), Utf16::default())?;
                        if field_names.contains(field_name) {
                            return Err(err(
                                "AVRO_NULLABILITY_TYPE",
                                "",
                                "Record field names must be unique",
                            ));
                        }
                        field_names.push(field_name.clone());
                        let field_type = get_node(field, "type").ok_or_else(|| {
                            err("AVRO_NULLABILITY_TYPE", "", "Record field type is required")
                        })?;
                        validate_references(field_type, &local_namespace, names, ctx, depth + 1)?;
                    }
                }
                N::String(name) if name == &u("enum") => {
                    let _name = get_node(node, "name")
                        .and_then(|value| {
                            if let N::String(value) = value {
                                Some(value)
                            } else {
                                None
                            }
                        })
                        .ok_or_else(|| err("AVRO_NULLABILITY_TYPE", "", "Enum name is required"))?;
                    let symbols = match get_node(node, "symbols") {
                        Some(N::Array(symbols)) if !symbols.is_empty() => symbols,
                        _ => {
                            return Err(err(
                                "AVRO_NULLABILITY_TYPE",
                                "",
                                "Enum symbols are required",
                            ))
                        }
                    };
                    let mut seen = Vec::<Utf16>::new();
                    for symbol in symbols {
                        let N::String(symbol) = symbol else {
                            return Err(err(
                                "AVRO_NULLABILITY_TYPE",
                                "",
                                "Enum symbols must be strings",
                            ));
                        };
                        ctx.charge_work(symbol.len().saturating_add(1), Utf16::default())?;
                        if seen.contains(symbol) {
                            return Err(err(
                                "AVRO_NULLABILITY_TYPE",
                                "",
                                "Enum symbols must be unique",
                            ));
                        }
                        seen.push(symbol.clone());
                    }
                }
                N::String(name) if name == &u("fixed") => {
                    let _name = get_node(node, "name")
                        .and_then(|value| {
                            if let N::String(value) = value {
                                Some(value)
                            } else {
                                None
                            }
                        })
                        .ok_or_else(|| {
                            err("AVRO_NULLABILITY_TYPE", "", "Fixed name is required")
                        })?;
                    let size_token = match get_node(node, "size") {
                        Some(N::Number(size)) => size,
                        _ => {
                            return Err(err(
                                "AVRO_NULLABILITY_TYPE",
                                "",
                                "Fixed size must be a positive safe integer",
                            ))
                        }
                    };
                    match crate::javascript_numeric::numeric_to_number_lossless(
                        size_token, true, ctx,
                    ) {
                        Ok(size) if size > 0.0 => {}
                        Ok(_) => {
                            return Err(err(
                                "AVRO_NULLABILITY_TYPE",
                                "",
                                "Fixed size must be a positive safe integer",
                            ))
                        }
                        Err(error) if error.is_control_failure() => return Err(error),
                        Err(_) => {
                            return Err(err(
                                "AVRO_NULLABILITY_TYPE",
                                "",
                                "Fixed size must be a positive safe integer",
                            ))
                        }
                    }
                }
                N::String(name) if name == &u("array") => {
                    let items = get_node(node, "items").ok_or_else(|| {
                        err("AVRO_NULLABILITY_TYPE", "", "Array items are required")
                    })?;
                    validate_references(items, namespace, names, ctx, depth + 1)?;
                }
                N::String(name) if name == &u("map") => {
                    let values = get_node(node, "values").ok_or_else(|| {
                        err("AVRO_NULLABILITY_TYPE", "", "Map values are required")
                    })?;
                    validate_references(values, namespace, names, ctx, depth + 1)?;
                }
                N::String(name)
                    if is_primitive(name)
                        || ["record", "error", "enum", "fixed", "array", "map"]
                            .iter()
                            .any(|builtin| name == &u(builtin)) => {}
                N::String(name) if names.contains(&qualifies(namespace, name)) => {}
                N::String(_) => {
                    return Err(err("AVRO_NULLABILITY_TYPE", "", "Named type is unresolved"))
                }
                _ => {
                    return Err(err(
                        "AVRO_NULLABILITY_TYPE",
                        "",
                        "Native type must be a string, declaration or union",
                    ))
                }
            }
        }
        _ => {
            return Err(err(
                "AVRO_NULLABILITY_TYPE",
                "",
                "Native type must be a string, declaration or union",
            ))
        }
    }
    Ok(())
}

fn allows_null(
    node: &N,
    namespace: &Utf16,
    names: &[Utf16],
    ctx: &mut Context<'_>,
    depth: usize,
) -> Result<bool, EngineError> {
    if depth > ctx.limits().max_depth {
        return Err(err("AVRO_NULLABILITY_TYPE", "", "Avro type depth exceeded"));
    }
    ctx.charge_work(1, u(""))?;
    match node {
        N::String(ty) => {
            if ty == &u("null") {
                Ok(true)
            } else if [
                "boolean", "int", "long", "float", "double", "bytes", "string",
            ]
            .iter()
            .any(|x| ty == &u(x))
            {
                Ok(false)
            } else {
                let full = if ty.units().contains(&(b'.' as u16)) {
                    ty.clone()
                } else if namespace.is_empty() {
                    ty.clone()
                } else {
                    let mut p = namespace.units().to_vec();
                    p.push(b'.' as u16);
                    p.extend(ty.units());
                    Utf16::new(p)
                };
                if names.contains(&full) {
                    Ok(false)
                } else {
                    Err(err("AVRO_NULLABILITY_TYPE", "", "Named type is unresolved"))
                }
            }
        }
        N::Array(items) => {
            if items.is_empty() {
                return Err(err("AVRO_NULLABILITY_TYPE", "", "Union has no branches"));
            }
            let mut has = false;
            for x in items {
                has |= allows_null(x, namespace, names, ctx, depth + 1)?;
            }
            Ok(has)
        }
        N::Object(_) => {
            let ty = get_node(node, "type").ok_or_else(|| {
                err(
                    "AVRO_NULLABILITY_TYPE",
                    "",
                    "Native type declaration has no type",
                )
            })?;
            match ty {
                N::Array(_) | N::Object(_) => allows_null(ty, namespace, names, ctx, depth + 1),
                N::String(v) => {
                    if v == &u("null") {
                        Ok(true)
                    } else if [
                        "boolean", "int", "long", "float", "double", "bytes", "string", "record",
                        "error", "enum", "fixed", "array", "map",
                    ]
                    .iter()
                    .any(|x| v == &u(x))
                    {
                        Ok(false)
                    } else {
                        let full = if v.units().contains(&(b'.' as u16)) {
                            v.clone()
                        } else if namespace.is_empty() {
                            v.clone()
                        } else {
                            let mut p = namespace.units().to_vec();
                            p.push(b'.' as u16);
                            p.extend(v.units());
                            Utf16::new(p)
                        };
                        if names.contains(&full) {
                            Ok(false)
                        } else {
                            Err(err("AVRO_NULLABILITY_TYPE", "", "Named type is unresolved"))
                        }
                    }
                }
                _ => Err(err(
                    "AVRO_NULLABILITY_TYPE",
                    "",
                    "Native type must be a string or declaration",
                )),
            }
        }
        _ => Err(err(
            "AVRO_NULLABILITY_TYPE",
            "",
            "Native type must be a string, declaration or union",
        )),
    }
}
fn validate_archive(
    source: &Value,
    request: &Value,
    ctx: &mut Context<'_>,
) -> Result<Vec<(Utf16, NativeJsonTree)>, EngineError> {
    let bundle = avro_document::export_bundle(source, ctx)?;
    let raw = text(request, "nativeSource").ok_or_else(|| {
        err(
            "AVRO_NULLABILITY_REQUEST",
            "/nativeSource",
            "nativeSource required",
        )
    })?;
    if bundle.schema_json != normalized_native(raw, ctx)? {
        return Err(err(
            "AVRO_NULLABILITY_ARCHIVE",
            "/nativeSource",
            "Native bundle differs from retained archive",
        ));
    }
    let mut deps_out = Vec::new();
    let requested = arr(request, "dependencies").unwrap_or(&[]);
    if requested.len() != bundle.dependencies.len() {
        return Err(err(
            "AVRO_NULLABILITY_ARCHIVE",
            "/dependencies",
            "Native dependencies differ from retained archive",
        ));
    }
    for (i, d) in requested.iter().enumerate() {
        let id = text(d, "id").ok_or_else(|| {
            err(
                "AVRO_NULLABILITY_REQUEST",
                "/dependencies",
                "Dependency id required",
            )
        })?;
        let schema = text(d, "schema").ok_or_else(|| {
            err(
                "AVRO_NULLABILITY_REQUEST",
                "/dependencies",
                "Dependency schema required",
            )
        })?;
        let expected = &bundle.dependencies[i];
        if id != &expected.0 || expected.1 != normalized_native(schema, ctx)? {
            return Err(err(
                "AVRO_NULLABILITY_ARCHIVE",
                "/dependencies",
                "Native dependency order/text differs from retained archive",
            ));
        }
        deps_out.push((id.clone(), NativeJsonTree::parse_json(schema.units(), ctx)?));
    }
    Ok(deps_out)
}

pub fn classify_avro_nullability(
    source: &Value,
    request: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(ctx)?;
    validate(request, &rt.request, ctx, "AVRO_NULLABILITY_REQUEST")?;
    validate_document(source, &rt, ctx, "AVRO_NULLABILITY_SOURCE")?;
    let source = copy_json(source, ctx)?;
    let request = copy_json(request, ctx)?;
    let deps_native = validate_archive(&source, &request, ctx)?;
    let root = avro_document::get_node(&source, &u(""), None, ctx)?;
    let mut deps = Vec::new();
    for (id, tree) in &deps_native {
        deps.push(AvroDependency { id, root: tree });
    }
    let metadata = derive_avro_fields(&root, &deps, ctx)?
        .into_iter()
        .find(|m| Some(&m.element_id) == text(&request, "column"))
        .ok_or_else(|| {
            err(
                "AVRO_NULLABILITY_COLUMN",
                "/column",
                "Declared field not found",
            )
        })?;
    let modules = match get(&source, "modules") {
        Some(Value::Array(x)) => x,
        _ => {
            return Err(err(
                "AVRO_NULLABILITY_SOURCE",
                "/modules",
                "Modules required",
            ))
        }
    };
    let mi = modules
        .iter()
        .position(|m| text(m, "id") == Some(&u("avro.fields")))
        .ok_or_else(|| {
            err(
                "AVRO_NULLABILITY_COLUMN",
                "/modules",
                "Derived Avro fields module is required",
            )
        })?;
    let elements = arr(&modules[mi], "elements").ok_or_else(|| {
        err(
            "AVRO_NULLABILITY_COLUMN",
            "/elements",
            "Derived fields required",
        )
    })?;
    let ei = elements
        .iter()
        .position(|e| text(e, "id") == Some(&metadata.element_id))
        .ok_or_else(|| {
            err(
                "AVRO_NULLABILITY_COLUMN",
                "/elements",
                "Derived column member is required",
            )
        })?;
    let element = &elements[ei];
    let fragment = tagged(&metadata.native_field, ctx)?;
    let ideal_path = u(&format!("/modules/{mi}/elements/{ei}/nullability"));
    let mut native_path = metadata.path.units().to_vec();
    native_path.extend("/type".encode_utf16());
    let result_schema_value = read_json(RESULT_SCHEMA, ctx)?;
    let binding = get(
        get(&result_schema_value, "properties").unwrap_or(&Value::Null),
        "binding",
    )
    .and_then(|x| get(x, "const"))
    .cloned()
    .unwrap_or(Value::Null);
    let mut mapping = obj(vec![
        ("origin", t("classified")),
        ("idealPath", Value::String(ideal_path.clone())),
        ("nativePath", Value::String(Utf16::new(native_path))),
        ("nativeFragment", fragment.clone()),
        ("nullability", t("unspecified")),
        ("interpretation", t("unknown")),
        ("outcome", t("unknown")),
        (
            "scope",
            get(&request, "scope").cloned().unwrap_or(Value::Null),
        ),
        (
            "carrier",
            get(&request, "carrier").cloned().unwrap_or(Value::Null),
        ),
        ("basis", t(BASIS)),
    ]);
    if let Value::Object(m) = &mut mapping {
        if let Some(id) = &metadata.dependency_id {
            m.push((u("dependencyId"), Value::String(id.clone())));
        }
    }
    let mut residuals = Vec::new();
    let mut diagnostics = Vec::new();
    let mut conflict: Option<String> = None;
    let mut allows = None;
    let mut reason = None;
    let mut interpretation = "unknown";
    if text(&request, "scope") != Some(&u("underlying-field-value")) {
        reason=Some("Explicit underlying-field-value scope required; writer omission, reader resolution and ancestor availability remain separate".to_owned());
    } else if text(&request, "carrier") != Some(&u("avro-null")) {
        reason = Some(
            "Explicit Avro null-value carrier required; omitted members are not equated with null"
                .to_owned(),
        );
    } else {
        let mut names = Vec::new();
        for (id, tree) in &deps_native {
            let _ = id;
            known_names(tree.root(), &u(""), &mut names, ctx, 0)?;
        }
        known_names(root.root(), &u(""), &mut names, ctx, 0)?;
        let mut reference_failure = None;
        for (_, tree) in &deps_native {
            if let Err(error) = validate_references(tree.root(), &u(""), &names, ctx, 0) {
                if error.is_control_failure() {
                    return Err(error);
                }
                reference_failure = Some(error);
                break;
            }
        }
        if reference_failure.is_none() {
            if let Err(error) = validate_references(root.root(), &u(""), &names, ctx, 0) {
                if error.is_control_failure() {
                    return Err(error);
                }
                reference_failure = Some(error);
            }
        }
        if let Some(error) = reference_failure {
            interpretation = "unsupported";
            reason = Some(format!(
                "Underlying type/name structure is unresolved: {}",
                error
                    .message
                    .to_utf8()
                    .unwrap_or_else(|_| "native type error".into())
            ));
        }
        let namespace = namespace_from_record(&metadata.record);
        let field_type = get_node(metadata.native_field.root(), "type");
        if reason.is_none() {
            match field_type {
                Some(node) => match allows_null(node, &namespace, &names, ctx, 0) {
                    Ok(v) => allows = Some(v),
                    Err(error) if error.is_control_failure() => return Err(error),
                    Err(error) => {
                        interpretation = "unsupported";
                        reason = Some(format!(
                            "Underlying type/name structure is unresolved: {}",
                            error
                                .message
                                .to_utf8()
                                .unwrap_or_else(|_| "native type error".into())
                        ));
                    }
                },
                None => {
                    interpretation = "unsupported";
                    reason = Some("Underlying field has no declared type".into());
                }
            }
        }
    }
    if let Some(v) = allows {
        set(
            &mut mapping,
            "nullability",
            t(if v { "absent-allowed" } else { "required" }),
        )?;
        set(&mut mapping, "interpretation", t("declared"))?;
        set(&mut mapping, "outcome", t("exact"))?;
        interpretation = "declared";
    }
    let base = match text(&mapping, "nativePath") {
        Some(x) => x.clone(),
        None => Utf16::default(),
    };
    let add_loss = |residuals: &mut Vec<Value>,
                    diagnostics: &mut Vec<Value>,
                    path: &Utf16,
                    value: Value,
                    why: &str,
                    blocked: bool| {
        residuals.push(obj(vec![
            ("path", Value::String(path.clone())),
            ("value", value),
            ("reason", t(why)),
            ("recovery", t(RECOVERY)),
        ]));
        diagnostics.push(obj(vec![
            (
                "code",
                t(if path == &ideal_path {
                    "AVRO_NULLABILITY_CONFLICT"
                } else {
                    "AVRO_NULLABILITY_UNRESOLVED"
                }),
            ),
            ("path", Value::String(path.clone())),
            ("message", t(why)),
            ("severity", t(if blocked { "error" } else { "warning" })),
        ]));
    };
    if let Some(why) = reason {
        if interpretation == "unsupported" {
            set(&mut mapping, "interpretation", t("unsupported"))?;
            set(&mut mapping, "outcome", t("not-expressible"))?;
        }
        add_loss(
            &mut residuals,
            &mut diagnostics,
            &base,
            fragment.clone(),
            &why,
            false,
        );
    }
    if text(element, "kind") != Some(&u("field")) {
        conflict=Some("Selected native member must already be an explicit Field; this operation does not replace its kind".into());
    }
    if let Some(author) = get(&request, "author") {
        match crate::nullability::verify_core_nullability_declaration(
            author,
            &source,
            &rt.engine,
            &rt.registry,
            &mut NoCallbacks,
            ctx,
        ) {
            Ok(verified) => {
                let identity = get(&verified, "identity").unwrap_or(&Value::Null);
                let module = text(identity, "module");
                let element_id = text(identity, "element");
                if module != Some(&u("avro.fields")) || element_id != Some(&metadata.element_id) {
                    conflict = Some("Author receipt identifies a different member".into());
                } else {
                    let expected = if allows == Some(true) {
                        u("absent-allowed")
                    } else if allows == Some(false) {
                        u("required")
                    } else {
                        u("unspecified")
                    };
                    if text(
                        get(&verified, "provenance").unwrap_or(&Value::Null),
                        "nullability",
                    ) != Some(&expected)
                    {
                        conflict = Some("Authored availability differs from the native observation; neither assertion may be overwritten".into());
                    }
                }
            }
            Err(e) if e.is_control_failure() => return Err(e),
            Err(e) => conflict = Some(format!("Author provenance is invalid or stale: {}", e.code)),
        }
    } else if get(element, "nullability").is_some() {
        conflict=Some("Existing availability requires verified author provenance before native classification".into());
    }
    if get(get(element, "extensions").unwrap_or(&Value::Null), EXT).is_some() {
        conflict = Some(
            "Existing binding scope cannot be overwritten; reclassify from its retained source"
                .into(),
        );
    }
    if let Some(vocab) = get(get(&source, "vocabularies").unwrap_or(&Value::Null), EXT) {
        if text(vocab, "version") != Some(&u("1.0.0")) {
            conflict = Some("Existing binding vocabulary version is incompatible".into());
        }
    }
    if let Some(why) = conflict.as_deref() {
        add_loss(
            &mut residuals,
            &mut diagnostics,
            &ideal_path,
            get(element, "nullability").cloned().unwrap_or(Value::Null),
            why,
            true,
        );
        set(&mut mapping, "outcome", t("unknown"))?;
    }
    let blocked = conflict.is_some()
        || (text(&request, "mode") == Some(&u("strict")) && !residuals.is_empty());
    for item in &mut diagnostics {
        set(
            item,
            "severity",
            t(if blocked { "error" } else { "warning" }),
        )?;
    }
    let mut result = obj(vec![
        ("operation", t("classify-avro-nullability")),
        ("version", t("1.0.0")),
        ("status", t(if blocked { "blocked" } else { "classified" })),
        ("source", copy_json(&source, ctx)?),
        ("request", request.clone()),
        ("binding", binding),
        ("mapping", mapping),
        ("residuals", Value::Array(residuals)),
        ("diagnostics", Value::Array(diagnostics)),
    ]);
    if !blocked {
        let mut target = copy_json(&source, ctx)?;
        {
            let Value::Array(modules) = get_mut(&mut target, "modules")
                .ok_or_else(|| err("AVRO_NULLABILITY_TARGET", "/modules", "Modules required"))?
            else {
                return Err(err(
                    "AVRO_NULLABILITY_TARGET",
                    "/modules",
                    "Modules must be an array",
                ));
            };
            let Value::Array(elements) = get_mut(&mut modules[mi], "elements")
                .ok_or_else(|| err("AVRO_NULLABILITY_TARGET", "/elements", "Elements required"))?
            else {
                return Err(err(
                    "AVRO_NULLABILITY_TARGET",
                    "/elements",
                    "Elements must be an array",
                ));
            };
            set(
                &mut elements[ei],
                "nullability",
                t(if allows == Some(true) {
                    "absent-allowed"
                } else if allows == Some(false) {
                    "required"
                } else {
                    "unspecified"
                }),
            )?;
        }
        {
            let vocab = get_mut(&mut target, "vocabularies").ok_or_else(|| {
                err(
                    "AVRO_NULLABILITY_TARGET",
                    "/vocabularies",
                    "Vocabularies required",
                )
            })?;
            if get(vocab, EXT).is_none() {
                set(vocab, EXT, obj(vec![("version", t("1.0.0"))]))?;
            }
        }
        let mut ext_value = obj(vec![
            ("origin", t("classified")),
            (
                "binding",
                obj(vec![("id", t(EXT)), ("version", t("1.0.0"))]),
            ),
            (
                "scope",
                get(&request, "scope").cloned().unwrap_or(Value::Null),
            ),
            (
                "carrier",
                get(&request, "carrier").cloned().unwrap_or(Value::Null),
            ),
            ("interpretation", t(interpretation)),
            (
                "nativePath",
                get(
                    &get(&result, "mapping").unwrap_or(&Value::Null),
                    "nativePath",
                )
                .cloned()
                .unwrap_or(Value::Null),
            ),
        ]);
        if let Some(id) = &metadata.dependency_id {
            set(&mut ext_value, "dependencyId", Value::String(id.clone()))?;
        }
        {
            let Value::Array(modules) = get_mut(&mut target, "modules").unwrap() else {
                unreachable!()
            };
            let Value::Array(elements) = get_mut(&mut modules[mi], "elements").unwrap() else {
                unreachable!()
            };
            let ext = get_mut(&mut elements[ei], "extensions").ok_or_else(|| {
                err(
                    "AVRO_NULLABILITY_TARGET",
                    "/extensions",
                    "Element extensions required",
                )
            })?;
            set(ext, EXT, ext_value)?;
        }
        validate_document(&target, &rt, ctx, "AVRO_NULLABILITY_TARGET")?;
        set(&mut result, "target", target)?;
    }
    validate(&result, &rt.result, ctx, "AVRO_NULLABILITY_RESULT")?;
    Ok(result)
}
pub fn verify_avro_nullability_classification(
    receipt: &Value,
    current: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(ctx)?;
    validate(receipt, &rt.result, ctx, "AVRO_NULLABILITY_RECEIPT")?;
    if text(receipt, "status") != Some(&u("classified")) {
        return Err(err(
            "AVRO_NULLABILITY_RECEIPT",
            "",
            "Expected complete classified receipt",
        ));
    }
    let expected = classify_avro_nullability(
        get(receipt, "source")
            .ok_or_else(|| err("AVRO_NULLABILITY_RECEIPT", "", "Source missing"))?,
        get(receipt, "request")
            .ok_or_else(|| err("AVRO_NULLABILITY_RECEIPT", "", "Request missing"))?,
        ctx,
    )?;
    if !same(receipt, &expected, ctx)? {
        return Err(err(
            "AVRO_NULLABILITY_RECEIPT",
            "",
            "Receipt disagrees with retained source and selected binding",
        ));
    }
    if !same(
        current,
        get(receipt, "target")
            .ok_or_else(|| err("AVRO_NULLABILITY_RECEIPT", "", "Target missing"))?,
        ctx,
    )? {
        return Err(err(
            "AVRO_NULLABILITY_STALE",
            "",
            "Target changed after classification",
        ));
    }
    Ok(copy_json(receipt, ctx)?)
}
pub fn recover_avro_nullability_bundle(
    receipt: &Value,
    current: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let verified = verify_avro_nullability_classification(receipt, current, ctx)?;
    let req = get(&verified, "request").unwrap();
    Ok(obj(vec![
        (
            "schema",
            get(req, "nativeSource").cloned().unwrap_or(Value::Null),
        ),
        (
            "dependencies",
            get(req, "dependencies")
                .cloned()
                .unwrap_or(Value::Array(Vec::new())),
        ),
    ]))
}
