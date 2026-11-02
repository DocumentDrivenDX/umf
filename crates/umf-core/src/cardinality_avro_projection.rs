// SPDX-License-Identifier: MIT OR Apache-2.0
//! Rust-owned authored cardinality projection to an explicit Avro schema.
use crate::{
    context::Context,
    engine::{Capabilities, Engine, ResourceSet, SemanticContext},
    error::{Diagnostic, EngineError},
    native_json::NativeJsonTree,
    registry::Registry,
    schema::{CompiledSchema, SchemaResources},
    serialization::{self, Format},
    value::{copy_json, Utf16, Value},
};
use std::collections::HashSet;
use std::sync::{Arc, OnceLock};

const RESULT: &str = include_str!("../../../spec/core/cardinality-avro-projection.schema.json");
const CORE: &str = include_str!("../../../spec/core/schema.json");
const AUTHOR: &str = include_str!("../../../spec/core/cardinality-operation-v4.schema.json");
const RECOVERY: &str = "Recover source meaning with retained projection receipt; native-only import does not recover author intent";

fn k(value: &str) -> Utf16 {
    Utf16::from(value)
}
fn s(value: &str) -> Value {
    Value::string_utf8(value)
}
fn obj(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(name, value)| (k(name), value))
            .collect(),
    )
}
fn get<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    match value {
        Value::Object(m) => m
            .iter()
            .find(|(key, _)| key == &k(name))
            .map(|(_, value)| value),
        _ => None,
    }
}
fn arr(value: Option<&Value>) -> &[Value] {
    if let Some(Value::Array(values)) = value {
        values
    } else {
        &[]
    }
}
fn txt(value: Option<&Value>) -> Option<String> {
    if let Some(Value::String(value)) = value {
        value.to_utf8().ok()
    } else {
        None
    }
}
fn err(code: &str, message: impl Into<String>, path: &str) -> EngineError {
    EngineError::new(code, k(path), message.into())
}
fn parse(source: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    serialization::read_json_value(
        &source.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        ctx,
    )
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
struct Runtime {
    engine: Engine,
    registry: Registry,
}
fn runtime(ctx: &mut Context<'_>) -> Result<Arc<Runtime>, EngineError> {
    static CACHE: OnceLock<Arc<Runtime>> = OnceLock::new();
    if ctx.profile() == crate::context::ResourceProfile::Cooperative
        && ctx.limits() == crate::context::Limits::ordinary()
    {
        if let Some(value) = CACHE.get() {
            return Ok(value.clone());
        }
    }
    let engine = Engine::new(
        ResourceSet::new(
            parse(CORE, ctx)?,
            parse(
                include_str!("../../../spec/core/semantic-type-reference.schema.json"),
                ctx,
            )?,
            parse(
                include_str!("../../../spec/core/extension-package.schema.json"),
                ctx,
            )?,
            parse(
                include_str!("../../../spec/metamodel/generated/core-constraints.json"),
                ctx,
            )?,
            parse(
                include_str!("../../../spec/metamodel/generated/domain-policy.json"),
                ctx,
            )?,
        ),
        ctx,
    )?;
    let mut registry = Registry::new();
    let resources = engine.schema_resources_with_context(ctx)?;
    let avro = parse(
        include_str!("../../../spec/extensions/avro/package.json"),
        ctx,
    )?;
    registry.register(&avro, None, engine.package_schema(), &resources, ctx)?;
    let value = Arc::new(Runtime { engine, registry });
    if ctx.profile() == crate::context::ResourceProfile::Cooperative
        && ctx.limits() == crate::context::Limits::ordinary()
    {
        let _ = CACHE.set(value.clone());
    }
    Ok(value)
}
fn schemas(
    rt: &Runtime,
    ctx: &mut Context<'_>,
) -> Result<(CompiledSchema, CompiledSchema), EngineError> {
    let operation = parse(RESULT, ctx)?;
    let resources = SchemaResources {
        entries: vec![
            (
                k("urn:umf:core:semantic-type-reference:1.0.0"),
                parse(
                    include_str!("../../../spec/core/semantic-type-reference.schema.json"),
                    ctx,
                )?,
            ),
            (k("urn:umf:core:0.10.0"), parse(CORE, ctx)?),
            (
                k("urn:umf:core:cardinality-operation:4.0.0"),
                parse(AUTHOR, ctx)?,
            ),
        ],
    };
    let result = CompiledSchema::compile(&operation, &resources, ctx)?;
    let request = get(
        get(&operation, "properties").unwrap_or(&Value::Null),
        "request",
    )
    .ok_or_else(|| err("CARDINALITY_AVRO_RESULT", "Request schema missing", ""))?;
    Ok((result, CompiledSchema::compile(request, &resources, ctx)?))
}
fn residual(
    path: &str,
    value: &Value,
    reason: &str,
    outcome: &str,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    Ok(obj(vec![
        ("path", s(path)),
        ("value", copy_json(value, ctx)?),
        ("reason", s(reason)),
        ("outcome", s(outcome)),
        ("recovery", s(RECOVERY)),
    ]))
}
fn canonical(value: &Value, ctx: &mut Context<'_>, depth: usize) -> Result<Value, EngineError> {
    if depth > ctx.limits().max_depth {
        return Err(err("LIMIT", "Receipt comparison depth exceeded", ""));
    }
    ctx.charge_work(1, Utf16::default())?;
    match value {
        Value::Object(m) => {
            let mut entries = m.iter().collect::<Vec<_>>();
            entries.sort_by(|a, b| a.0.cmp(&b.0));
            let mut out = Vec::with_capacity(entries.len());
            for (key, value) in entries {
                ctx.charge_work(key.len().saturating_add(1), Utf16::default())?;
                out.push((key.clone(), canonical(value, ctx, depth + 1)?));
            }
            Ok(Value::Object(out))
        }
        Value::Array(values) => Ok(Value::Array(
            values
                .iter()
                .map(|v| canonical(v, ctx, depth + 1))
                .collect::<Result<Vec<_>, _>>()?,
        )),
        _ => copy_json(value, ctx),
    }
}
fn pointer_key(base: &Utf16, key: &Utf16, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    let extra = key.len().saturating_add(
        key.units()
            .iter()
            .filter(|u| **u == 0x7e || **u == 0x2f)
            .count(),
    );
    ctx.charge_text(
        base.len().saturating_add(1).saturating_add(extra),
        base.clone(),
    )?;
    let mut units = base.units().to_vec();
    units.push(0x2f);
    for unit in key.units() {
        match *unit {
            0x7e => units.extend_from_slice(&[0x7e, 0x30]),
            0x2f => units.extend_from_slice(&[0x7e, 0x31]),
            unit => units.push(unit),
        }
    }
    Ok(Utf16::new(units))
}
fn residual_at(
    path: Utf16,
    value: &Value,
    reason: &str,
    outcome: &str,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    Ok(obj(vec![
        ("path", Value::String(path)),
        ("value", copy_json(value, ctx)?),
        ("reason", s(reason)),
        ("outcome", s(outcome)),
        ("recovery", s(RECOVERY)),
    ]))
}
fn locate<'a>(
    source: &'a Value,
    module_id: &str,
    element_id: &str,
    ctx: &mut Context<'_>,
) -> Result<(usize, usize, &'a Value, String), EngineError> {
    for (module_index, module) in arr(get(source, "modules")).iter().enumerate() {
        ctx.charge_work(1, Utf16::default())?;
        if txt(get(module, "id")).as_deref() == Some(module_id) {
            for (element_index, element) in arr(get(module, "elements")).iter().enumerate() {
                ctx.charge_work(1, Utf16::default())?;
                if txt(get(element, "id")).as_deref() == Some(element_id) {
                    let path = format!("/modules/{module_index}/elements/{element_index}");
                    return Ok((module_index, element_index, element, path));
                }
            }
        }
    }
    Err(err(
        "CARDINALITY_AVRO_REFERENCE",
        "Authored Field identity is absent",
        "/author/identity",
    ))
}
fn visit(
    target: &Value,
    source: &Value,
    request: &Value,
    module_id: &str,
    element_id: &str,
    location: Value,
    root: bool,
    mapping_items: &mut Vec<Value>,
    residuals: &mut Vec<Value>,
    seen: &mut HashSet<String>,
    depth: usize,
    fields_seen: &mut HashSet<String>,
    modules_seen: &mut HashSet<usize>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    if depth > ctx.limits().max_depth {
        return Err(err(
            "LIMIT",
            "Cardinality traversal depth exceeded",
            "/request/nativeType",
        ));
    }
    ctx.charge_work(1, Utf16::default())?;
    let (module_index, _element_index, element, path) = locate(source, module_id, element_id, ctx)?;
    let location_path = txt(get(&location, "path")).unwrap_or_default();
    let dependency = txt(get(&location, "dependencyId")).unwrap_or_default();
    let key = format!("{module_id}\0{element_id}\0{dependency}\0{location_path}");
    if !seen.insert(key) {
        return Ok(());
    }
    fields_seen.insert(path.clone());
    modules_seen.insert(module_index);
    let observation =
        crate::avro_cardinality::inspect_projection_type(target, request, &location, ctx)?;
    let native_shape = txt(get(&observation, "shape")).unwrap_or_else(|| "unspecified".into());
    let allows_null = matches!(get(&observation, "allowsNull"), Some(Value::Bool(true)));
    let authored_shape = txt(get(element, "cardinality")).unwrap_or_else(|| "unspecified".into());
    mapping_items.push(obj(vec![
        ("idealPath", s(&path)),
        ("nativeLocation", location.clone()),
    ]));
    if authored_shape == "unspecified" {
        residuals.push(residual(
            &format!("{path}/cardinality"),
            get(element, "cardinality").unwrap_or(&Value::Null),
            "No ideal shape is asserted; the selected native type remains an explicit refinement",
            "unknown",
            ctx,
        )?);
    } else if authored_shape != native_shape {
        residuals.push(residual(
            &format!("{path}/cardinality"),
            get(element, "cardinality").unwrap_or(&Value::Null),
            "Native type does not express the selected present non-null shape",
            "not-expressible",
            ctx,
        )?);
    }
    if root {
        if let Some(name) = txt(get(element, "name")) {
            let requested = txt(get(request, "fieldName")).unwrap_or_default();
            if name != requested {
                residuals.push(residual(
                    &format!("{path}/name"),
                    get(element, "name").unwrap(),
                    "Selected native field name differs from the ideal name",
                    "not-expressible",
                    ctx,
                )?);
            }
        }
    } else if get(element, "name").is_some() {
        residuals.push(residual(
            &format!("{path}/name"),
            get(element, "name").unwrap(),
            "Item/value Field names have no separate Avro field-name position",
            "unknown",
            ctx,
        )?);
    }
    if let Value::Object(fields) = element {
        for (key, value) in fields {
            if ![
                "id",
                "kind",
                "name",
                "scalarType",
                "cardinality",
                "itemType",
                "nullability",
            ]
            .iter()
            .any(|known| key == &k(known))
                && !(key == &k("extensions") && matches!(value,Value::Object(m)if m.is_empty()))
                && !(root && key == &k("description"))
            {
                let p = pointer_key(&Utf16::from(path.as_str()), key, ctx)?;
                residuals.push(residual_at(
                    p,
                    value,
                    "Field metadata is retained but not projected",
                    "unknown",
                    ctx,
                )?);
            }
        }
    }
    if let Some(nullability) = get(element, "nullability") {
        let stated = txt(Some(nullability));
        let availability = txt(get(request, "availability")).unwrap_or_default();
        if availability != "avro-null-value"
            || !matches!(stated.as_deref(), Some("required" | "absent-allowed"))
        {
            residuals.push(residual(&format!("{path}/nullability"),nullability,"Underlying Avro null-value carrier must be selected; omission/default/unspecified availability is not inferred","unknown",ctx)?);
        } else if (stated.as_deref() == Some("absent-allowed")) != allows_null {
            residuals.push(residual(
                &format!("{path}/nullability"),
                nullability,
                "Native null branch differs from independently stated availability",
                "not-expressible",
                ctx,
            )?);
        }
    }
    if let Some(scalar) = get(element, "scalarType") {
        if txt(Some(scalar)) != txt(get(&observation, "scalarFamily")) {
            residuals.push(residual(
                &format!("{path}/scalarType"),
                scalar,
                "Native scalar family does not express the stated item/value family",
                "not-expressible",
                ctx,
            )?);
        }
    }
    let item_type = get(element, "itemType");
    if matches!(authored_shape.as_str(), "array" | "map") && native_shape == authored_shape {
        if let Some(reference) = item_type {
            let module = txt(get(reference, "module")).ok_or_else(|| {
                err(
                    "CARDINALITY_AVRO_REFERENCE",
                    "Item module identity is required",
                    "/author/target",
                )
            })?;
            let element = txt(get(reference, "element")).ok_or_else(|| {
                err(
                    "CARDINALITY_AVRO_REFERENCE",
                    "Item element identity is required",
                    "/author/target",
                )
            })?;
            if let Value::Object(fields) = reference {
                for (key, value) in fields {
                    if key != &k("module") && key != &k("element") {
                        residuals.push(residual_at(
                            pointer_key(&Utf16::from(format!("{path}/itemType")), key, ctx)?,
                            value,
                            "Unknown item-reference metadata is retained",
                            "unknown",
                            ctx,
                        )?);
                    }
                }
            }
            let item_location = get(&observation, "itemLocation").ok_or_else(|| {
                err(
                    "CARDINALITY_AVRO_NATIVE",
                    "Container type has no item/value location",
                    "/request/nativeType",
                )
            })?;
            visit(
                target,
                source,
                request,
                &module,
                &element,
                item_location.clone(),
                false,
                mapping_items,
                residuals,
                seen,
                depth + 1,
                fields_seen,
                modules_seen,
                ctx,
            )?;
        } else {
            residuals.push(residual(&format!("{path}/itemType"),&Value::Null,"Native items/values require a concrete schema while ideal member meaning is unspecified","approximated",ctx)?);
        }
    } else if let Some(item_type) = item_type {
        residuals.push(residual(
            &format!("{path}/itemType"),
            item_type,
            "Item/value reference cannot be lowered through an incompatible native shape",
            "not-expressible",
            ctx,
        )?);
    }
    Ok(())
}

fn project_inner(
    author_input: &Value,
    request_input: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let author_input = copy_json(author_input, ctx)?;
    let request = copy_json(request_input, ctx)?;
    let rt = runtime(ctx)?;
    let (result_schema, request_schema) = schemas(&rt, ctx)?;
    if let Some(d) = request_schema.validate(&request, ctx)?.first() {
        return Err(EngineError::new(
            "CARDINALITY_AVRO_REQUEST",
            d.instance_path.clone(),
            d.message.clone(),
        ));
    }
    let current = get(&author_input, "target").ok_or_else(|| {
        err(
            "CARDINALITY_AVRO_AUTHOR",
            "Author target is required",
            "/author/target",
        )
    })?;
    let mut caps = NoCapabilities;
    let author = crate::cardinality::verify_core_cardinality_declaration(
        &author_input,
        current,
        &rt.engine,
        &rt.registry,
        &mut caps,
        ctx,
    )?;
    let source = get(&author, "target").cloned().ok_or_else(|| {
        err(
            "CARDINALITY_AVRO_AUTHOR",
            "Author target is required",
            "/author/target",
        )
    })?;
    if txt(get(&source, "umf")).as_deref() != Some("0.10.0") {
        return Err(err("CARDINALITY_AVRO_VERSION","This binding requires a core 0.10.0 declaration; facet-envelope projection requires a separately qualified binding","/author/target/umf"));
    }
    let identity = get(&author, "identity").ok_or_else(|| {
        err(
            "CARDINALITY_AVRO_AUTHOR",
            "Identity is required",
            "/author/identity",
        )
    })?;
    let module_id = txt(get(identity, "module")).ok_or_else(|| {
        err(
            "CARDINALITY_AVRO_AUTHOR",
            "Module identity is required",
            "/author/identity/module",
        )
    })?;
    let element_id = txt(get(identity, "element")).ok_or_else(|| {
        err(
            "CARDINALITY_AVRO_AUTHOR",
            "Element identity is required",
            "/author/identity/element",
        )
    })?;
    let (module_index, _element_index, root_element, path) =
        locate(&source, &module_id, &element_id, ctx)?;
    if txt(get(root_element, "kind")).as_deref() != Some("field") {
        return Err(err(
            "CARDINALITY_AVRO_AUTHOR",
            "Cardinality declaration must identify a Field",
            "/author/identity",
        ));
    }
    let field_text = |name: &str| {
        txt(get(&request, name)).ok_or_else(|| {
            err(
                "CARDINALITY_AVRO_REQUEST",
                "Required request member is missing",
                &format!("/request/{name}"),
            )
        })
    };
    let id = field_text("id")?;
    let record_name = field_text("recordName")?;
    let namespace = field_text("namespace")?;
    let field_name = field_text("fieldName")?;
    let native_text = field_text("nativeType")?;
    let native_tree =
        NativeJsonTree::parse_json(&native_text.encode_utf16().collect::<Vec<_>>(), ctx)?;
    let native_json = native_tree.render_compact(ctx)?;
    let quote = |value: &str, ctx: &mut Context<'_>| -> Result<Utf16, EngineError> {
        serialization::write_json_value(&Value::String(Utf16::from(value)), Format::Json, ctx)
    };
    let mut schema_units = "{\"type\":\"record\",\"name\":"
        .encode_utf16()
        .collect::<Vec<_>>();
    schema_units.extend_from_slice(quote(&record_name, ctx)?.units());
    schema_units.extend_from_slice(
        ",\"namespace\":"
            .encode_utf16()
            .collect::<Vec<_>>()
            .as_slice(),
    );
    schema_units.extend_from_slice(quote(&namespace, ctx)?.units());
    schema_units.extend_from_slice(
        ",\"fields\":[{\"name\":"
            .encode_utf16()
            .collect::<Vec<_>>()
            .as_slice(),
    );
    schema_units.extend_from_slice(quote(&field_name, ctx)?.units());
    schema_units.extend_from_slice(",\"type\":".encode_utf16().collect::<Vec<_>>().as_slice());
    schema_units.extend_from_slice(native_json.units());
    if let Some(doc) = get(root_element, "description") {
        let doc = txt(Some(doc)).ok_or_else(|| {
            err(
                "CARDINALITY_AVRO_AUTHOR",
                "Field description must be text",
                "/author/target",
            )
        })?;
        schema_units.extend_from_slice(",\"doc\":".encode_utf16().collect::<Vec<_>>().as_slice());
        schema_units.extend_from_slice(quote(&doc, ctx)?.units());
    }
    schema_units.extend_from_slice("}]}\n".encode_utf16().collect::<Vec<_>>().as_slice());
    let schema_text = Utf16::new(schema_units);
    let mut owned_dependencies = Vec::new();
    for dependency in arr(get(&request, "dependencies")) {
        let dep_id = txt(get(dependency, "id")).ok_or_else(|| {
            err(
                "CARDINALITY_AVRO_REQUEST",
                "Dependency id is required",
                "/request/dependencies",
            )
        })?;
        let dep_schema = txt(get(dependency, "schema")).ok_or_else(|| {
            err(
                "CARDINALITY_AVRO_REQUEST",
                "Dependency schema is required",
                "/request/dependencies",
            )
        })?;
        owned_dependencies.push((
            Utf16::from(dep_id.as_str()),
            Utf16::from(dep_schema.as_str()),
        ));
    }
    let dependency_sources = owned_dependencies
        .iter()
        .map(|(id, schema)| crate::avro_document::AvroDependencySource {
            id,
            schema_json: schema.units(),
        })
        .collect::<Vec<_>>();
    let target = crate::avro_document::import_schema(
        &Utf16::from(id.as_str()),
        schema_text.units(),
        &dependency_sources,
        ctx,
    )?;
    let mut mapping_items = Vec::new();
    let mut residuals = Vec::new();
    let native_inspection = crate::avro_document::inspect_avro_document(&target, ctx)?;
    if let Some(inspection) = native_inspection.native_inspection {
        for diagnostic in inspection.diagnostics {
            // The inspector's scope notice does not describe a loss in this projection.
            if diagnostic.code == Utf16::from("AVRO_PROFILE_LIMIT") {
                continue;
            }
            let severity = match diagnostic.severity {
                crate::error::Severity::Error => "error",
                crate::error::Severity::Warning => "warning",
            };
            ctx.charge_text(diagnostic.message.len(), Utf16::default())?;
            let reason = diagnostic.message.clone();
            let value = obj(vec![
                ("code", Value::String(diagnostic.code)),
                ("path", Value::String(diagnostic.path)),
                ("message", Value::String(diagnostic.message)),
                ("severity", s(severity)),
            ]);
            residuals.push(obj(vec![
                ("path", s("/request/nativeType")),
                ("value", copy_json(&value, ctx)?),
                ("reason", Value::String(reason)),
                ("outcome", s("unknown")),
                ("recovery", s(RECOVERY)),
            ]));
        }
    }
    let mut visited = HashSet::new();
    let mut fields_seen = HashSet::new();
    let mut modules_seen = HashSet::new();
    let root_location = obj(vec![("path", s("/fields/0/type"))]);
    visit(
        &target,
        &source,
        &request,
        &module_id,
        &element_id,
        root_location,
        true,
        &mut mapping_items,
        &mut residuals,
        &mut visited,
        0,
        &mut fields_seen,
        &mut modules_seen,
        ctx,
    )?;
    if matches!(get(&request, "requireExactValues"), Some(Value::Bool(true))) {
        residuals.push(residual(&path,root_element,"Schema shape/family matching does not prove value-domain or codec exactness: binary32 narrows 1.0000000000000002 to 1.0; avsc map decoding can drop an own __proto__ key","approximated",ctx)?);
    }
    if let Value::Object(fields) = &source {
        for (key, value) in fields {
            if !["umf", "id", "modules", "vocabularies"]
                .iter()
                .any(|known| key == &k(known))
            {
                residuals.push(residual_at(
                    pointer_key(&Utf16::default(), key, ctx)?,
                    value,
                    "Document metadata is retained but not projected",
                    "unknown",
                    ctx,
                )?);
            }
        }
    }
    if matches!(get(&source,"vocabularies"),Some(Value::Object(values))if !values.is_empty()) {
        residuals.push(residual(
            "/vocabularies",
            get(&source, "vocabularies").unwrap(),
            "Native vocabulary meaning is not projected",
            "unknown",
            ctx,
        )?);
    }
    for (i, module) in arr(get(&source, "modules")).iter().enumerate() {
        if !modules_seen.contains(&i) {
            residuals.push(residual(
                &format!("/modules/{i}"),
                module,
                "Other module is outside selected Field projection",
                "unknown",
                ctx,
            )?);
            continue;
        }
        let desired_namespace = if i == module_index {
            namespace.as_str()
        } else {
            ""
        };
        if txt(get(module, "namespace")).as_deref().unwrap_or("") != desired_namespace {
            residuals.push(residual(
                &format!("/modules/{i}/namespace"),
                get(module, "namespace").unwrap_or(&Value::Null),
                "Native root namespace does not represent this module namespace",
                "not-expressible",
                ctx,
            )?);
        }
        if let Value::Object(fields) = module {
            for (key, value) in fields {
                if !["id", "namespace", "elements"]
                    .iter()
                    .any(|known| key == &k(known))
                {
                    residuals.push(residual_at(
                        pointer_key(&Utf16::from(format!("/modules/{i}")), key, ctx)?,
                        value,
                        "Module metadata is retained",
                        "unknown",
                        ctx,
                    )?);
                }
            }
        }
        for (j, element) in arr(get(module, "elements")).iter().enumerate() {
            if !fields_seen.contains(&format!("/modules/{i}/elements/{j}")) {
                residuals.push(residual(
                    &format!("/modules/{i}/elements/{j}"),
                    element,
                    "Other element is outside selected Field projection",
                    "unknown",
                    ctx,
                )?);
            }
        }
    }
    let author_cardinality = txt(get(
        get(&author, "provenance").unwrap_or(&Value::Null),
        "cardinality",
    ))
    .unwrap_or_else(|| "unspecified".into());
    let not_expressible = residuals
        .iter()
        .any(|r| txt(get(r, "outcome")).as_deref() == Some("not-expressible"));
    let map_outcome = if not_expressible {
        "not-expressible"
    } else if residuals.is_empty() {
        "exact"
    } else if residuals
        .iter()
        .any(|r| txt(get(r, "outcome")).as_deref() == Some("unknown"))
    {
        "unknown"
    } else {
        "approximated"
    };
    let status = if txt(get(&request, "mode")).as_deref() == Some("strict") && !residuals.is_empty()
    {
        "blocked"
    } else {
        "projected"
    };
    let mut output=vec![("operation",s("project-cardinality-avro")),("version",s("1.0.0")),("status",s(status)),("source",source.clone()),("author",author.clone()),("request",request.clone()),("binding",obj(vec![("id",s("umf.core.cardinality.avro")),("version",s("1.0.0")),("nativeVersion",s("1.12.0")),("subset",s("Explicit native type matching for authored shape and referenced item/value Fields; no codec equivalence or implicit record conversion"))])),("mapping",obj(vec![("origin",s("authored")),("idealPath",s(&format!("{path}/cardinality"))),("cardinality",s(&author_cardinality)),("outcome",s(map_outcome)),("items",Value::Array(mapping_items))])),("residuals",Value::Array(residuals.clone()))];
    if status == "projected" {
        output.push(("target", target.clone()));
        let bundle = crate::avro_document::export_bundle(&target, ctx)?;
        let dependencies = bundle
            .dependencies
            .into_iter()
            .map(|(id, schema)| {
                obj(vec![
                    ("id", Value::String(id)),
                    ("schema", Value::String(schema)),
                ])
            })
            .collect();
        output.push((
            "nativeBundle",
            obj(vec![
                ("schema", Value::String(bundle.schema_json)),
                ("dependencies", Value::Array(dependencies)),
            ]),
        ));
    }
    output.push((
        "diagnostics",
        Value::Array(
            residuals
                .iter()
                .map(|residual| {
                    obj(vec![
                        ("code", s("CARDINALITY_AVRO_RESIDUAL")),
                        ("path", get(residual, "path").unwrap().clone()),
                        ("message", get(residual, "reason").unwrap().clone()),
                        (
                            "severity",
                            s(if status == "blocked" {
                                "error"
                            } else {
                                "warning"
                            }),
                        ),
                    ])
                })
                .collect(),
        ),
    ));
    let result = obj(output);
    if let Some(d) = result_schema.validate_codegen_errors(&result, ctx)?.first() {
        return Err(err(
            "CARDINALITY_AVRO_RESULT",
            format!(
                "Invalid Rust projection result: {}",
                d.message.to_utf8().unwrap_or_default()
            ),
            "",
        ));
    }
    Ok(result)
}
pub fn project_cardinality_to_avro(
    author: &Value,
    request: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    project_inner(author, request, ctx)
}
pub fn recover_cardinality_from_avro(
    receipt: &Value,
    native_bundle: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    if txt(get(receipt, "status")).as_deref() != Some("projected") {
        return Err(err(
            "CARDINALITY_AVRO_RECEIPT",
            "Complete projected receipt required",
            "/status",
        ));
    }
    let author = get(receipt, "author").ok_or_else(|| {
        err(
            "CARDINALITY_AVRO_RECEIPT",
            "Author receipt is required",
            "/author",
        )
    })?;
    let request = get(receipt, "request").ok_or_else(|| {
        err(
            "CARDINALITY_AVRO_RECEIPT",
            "Request receipt is required",
            "/request",
        )
    })?;
    let expected = project_inner(author, request, ctx)?;
    if canonical(receipt, ctx, 0)? != canonical(&expected, ctx, 0)? {
        return Err(err(
            "CARDINALITY_AVRO_RECEIPT",
            "Receipt disagrees with retained author and request",
            "/receipt",
        ));
    }
    if canonical(native_bundle, ctx, 0)?
        != canonical(get(receipt, "nativeBundle").unwrap_or(&Value::Null), ctx, 0)?
    {
        return Err(err(
            "CARDINALITY_AVRO_STALE",
            "Native bundle changed",
            "/nativeBundle",
        ));
    }
    copy_json(
        get(receipt, "source").ok_or_else(|| {
            err(
                "CARDINALITY_AVRO_RECEIPT",
                "Source receipt is required",
                "/source",
            )
        })?,
        ctx,
    )
}
