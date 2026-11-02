// SPDX-License-Identifier: MIT OR Apache-2.0
//! Rust-owned projection of authored scalar Facet meaning into an Avro carrier.
use crate::{
    context::Context,
    engine::{Capabilities, Engine, ResourceSet, SemanticContext},
    error::{Diagnostic, EngineError},
    registry::Registry,
    schema::{CompiledSchema, SchemaResources},
    serialization::{self, Format},
    value::{copy_json, Utf16, Value},
};
use std::sync::{Arc, OnceLock};

const CORE: &str = include_str!("../../../spec/core/schema.json");
const FACETS: &str = include_str!("../../../spec/core/facet-operation-v3.schema.json");
const KINDS: &str = include_str!("../../../spec/core/kind-operation-v6.schema.json");
const RESULT: &str = include_str!("../../../spec/core/facets-avro-projection.schema.json");
const BINDING_ID: &str = "umf.core.facets.avro";
const BINDING_VERSION: &str = "1.0.0";
const RECOVERY: &str = "Recover source meaning with retained projection receipt; native-only import does not recover author intent";
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
fn obj(entries: Vec<(&str, Value)>) -> Value {
    Value::Object(
        entries
            .into_iter()
            .map(|(key, value)| (k(key), value))
            .collect(),
    )
}
fn get<'a>(value: &'a Value, key: &str) -> Option<&'a Value> {
    if let Value::Object(fields) = value {
        fields
            .iter()
            .find(|(name, _)| name == &k(key))
            .map(|(_, v)| v)
    } else {
        None
    }
}
fn arr(value: Option<&Value>) -> &[Value] {
    match value { Some(Value::Array(values)) => values, _ => &[] }
}
fn text(value: Option<&Value>) -> Option<String> {
    match value {
        Some(Value::String(v)) => v.to_utf8().ok(),
        _ => None,
    }
}
fn error(code: &str, message: &str, path: &str) -> EngineError {
    EngineError::new(code, k(path), message)
}
fn parse(source: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    serialization::read_json_value(
        &source.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        ctx,
    )
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
    let value = Arc::new(Runtime { engine, registry });
    if ctx.profile() == crate::context::ResourceProfile::Cooperative
        && ctx.limits() == crate::context::Limits::ordinary()
    {
        let _ = CACHE.set(value.clone());
    }
    Ok(value)
}
fn schema(
    resources: &mut SchemaResources,
    id: &str,
    source: &str,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    resources.entries.push((k(id), parse(source, ctx)?));
    Ok(())
}
fn validate(
    value: &Value,
    schema_value: &Value,
    runtime: &Runtime,
    ctx: &mut Context<'_>,
    code: &str,
) -> Result<(), EngineError> {
    let mut resources = runtime.engine.schema_resources_with_context(ctx)?;
    schema(
        &mut resources,
        "urn:umf:core:facet-operation:3.0.0",
        FACETS,
        ctx,
    )?;
    schema(
        &mut resources,
        "urn:umf:core:kind-operation:6.0.0",
        KINDS,
        ctx,
    )?;
    let compiled = CompiledSchema::compile(schema_value, &resources, ctx)?;
    let diagnostics = compiled.validate_codegen_errors(value, ctx)?;
    if diagnostics.is_empty() {
        Ok(())
    } else {
        Err(error(code, &format!("{}", diagnostics.len()), ""))
    }
}
fn copy(value: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    copy_json(value, ctx)
}
fn pointer(base: &str, key: &Utf16, ctx: &mut Context<'_>) -> Result<String, EngineError> {
    let segment = key.to_utf8().map_err(|_| {
        error(
            "FACETS_AVRO_UTF16",
            "Cannot represent malformed UTF-16 member key in the public pointer",
            "",
        )
    })?;
    ctx.charge_work(
        base.encode_utf16().count() + segment.encode_utf16().count() + 1,
        Utf16::default(),
    )?;
    Ok(format!(
        "{base}/{}",
        segment.replace('~', "~0").replace('/', "~1")
    ))
}
fn canonical(value: &Value, ctx: &mut Context<'_>) -> Result<String, EngineError> {
    fn normalized(
        value: &Value,
        ctx: &mut Context<'_>,
        depth: usize,
    ) -> Result<Value, EngineError> {
        if depth > ctx.limits().max_depth {
            return Err(error(
                "LIMIT",
                "Canonical receipt exceeds the depth limit",
                "",
            ));
        }
        match value {
            Value::Array(items) => Ok(Value::Array(
                items
                    .iter()
                    .map(|v| normalized(v, ctx, depth + 1))
                    .collect::<Result<Vec<_>, _>>()?,
            )),
            Value::Object(members) => {
                let mut values = members
                    .iter()
                    .map(|(k, v)| Ok((k.clone(), normalized(v, ctx, depth + 1)?)))
                    .collect::<Result<Vec<_>, EngineError>>()?;
                values.sort_by(|a, b| a.0.cmp(&b.0));
                Ok(Value::Object(values))
            }
            _ => copy_json(value, ctx),
        }
    }
    serialization::stringify_compact_metered(&normalized(value, ctx, 0)?, ctx)?
        .to_utf8()
        .map_err(|_| {
            error(
                "FACETS_AVRO_UTF16",
                "Cannot represent receipt canonical form as UTF-8",
                "",
            )
        })
}
fn same(a: &Value, b: &Value, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    Ok(canonical(a, ctx)? == canonical(b, ctx)?)
}
fn number(value: Option<&Value>) -> Option<u64> {
    match value {
        Some(Value::Number(n))
            if n.is_finite() && *n >= 0.0 && n.fract() == 0.0 && *n <= u64::MAX as f64 =>
        {
            Some(*n as u64)
        }
        _ => None,
    }
}

fn identity(
    source: &Value,
    author_identity: &Value,
    ctx: &mut Context<'_>,
) -> Result<(usize, usize, Value, String, Value), EngineError> {
    let module = text(get(author_identity, "module")).ok_or_else(|| {
        error(
            "FACETS_AVRO_AUTHOR",
            "Module identity is required",
            "/identity/module",
        )
    })?;
    let element = text(get(author_identity, "element")).ok_or_else(|| {
        error(
            "FACETS_AVRO_AUTHOR",
            "Element identity is required",
            "/identity/element",
        )
    })?;
    let modules = match get(source, "modules") {
        Some(Value::Array(v)) => v,
        _ => {
            return Err(error(
                "FACETS_AVRO_SOURCE",
                "Source modules are required",
                "/modules",
            ))
        }
    };
    for (mi, m) in modules.iter().enumerate() {
        if text(get(m, "id")).as_deref() == Some(module.as_str()) {
            if let Some(Value::Array(elements)) = get(m, "elements") {
                for (ei, e) in elements.iter().enumerate() {
                    if text(get(e, "id")).as_deref() == Some(element.as_str()) {
                        let path = format!("/modules/{mi}/elements/{ei}");
                        return Ok((
                            mi,
                            ei,
                            copy_json(e, ctx)?,
                            path,
                            copy_json(author_identity, ctx)?,
                        ));
                    }
                }
            }
        }
    }
    Err(error(
        "FACETS_AVRO_AUTHOR",
        "Selected Field identity is unresolved",
        "/identity",
    ))
}
fn unknown(
    source: &Value,
    selected: (usize, usize),
    path: &str,
    namespace: &str,
    losses: &mut Vec<Value>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    if let Value::Object(members) = source {
        for (key, value) in members {
            if !["umf", "id", "modules", "vocabularies"]
                .iter()
                .any(|known| key == &k(known))
            {
                let p = pointer("", key, ctx)?;
                losses.push(residual(
                    &p,
                    value,
                    "Document metadata remains attached and is not projected",
                    "unknown",
                    ctx,
                )?);
            }
        }
    }
    if let Some(vocabularies) = get(source, "vocabularies") {
        if let Value::Object(m) = vocabularies {
            if !m.is_empty() {
                losses.push(residual(
                    "/vocabularies",
                    vocabularies,
                    "Vocabulary semantics are not projected",
                    "unknown",
                    ctx,
                )?);
            }
        }
    }
    if let Some(Value::Array(modules)) = get(source, "modules") {
        for (mi, module) in modules.iter().enumerate() {
            if mi != selected.0 {
                losses.push(residual(
                    &format!("/modules/{mi}"),
                    module,
                    "Other module is outside the selected Field projection",
                    "unknown",
                    ctx,
                )?);
                continue;
            }
            if let Value::Object(members) = module {
                for (key, value) in members {
                    let known = key == &k("id")
                        || key == &k("elements")
                        || (key == &k("namespace") && (value == &s("") || value == &s(namespace)));
                    if !known {
                        let p = pointer(&format!("/modules/{mi}"), key, ctx)?;
                        losses.push(residual(
                            &p,
                            value,
                            "Module metadata is retained and not projected",
                            "unknown",
                            ctx,
                        )?);
                    }
                }
            }
            if let Some(Value::Array(elements)) = get(module, "elements") {
                for (ei, element) in elements.iter().enumerate() {
                    if ei != selected.1 {
                        losses.push(residual(
                            &format!("/modules/{mi}/elements/{ei}"),
                            element,
                            "Other element is outside the selected Field projection",
                            "unknown",
                            ctx,
                        )?);
                    }
                }
            }
        }
    }
    let _ = path;
    Ok(())
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
fn project_inner(
    author_input: &Value,
    request_input: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let runtime = runtime(ctx)?;
    let rt = &runtime;
    let author = copy(author_input, ctx)?;
    let request = copy(request_input, ctx)?;
    let result_schema = parse(RESULT, ctx)?;
    let req_schema = get(
        get(&result_schema, "properties").unwrap_or(&Value::Null),
        "request",
    )
    .ok_or_else(|| error("FACETS_AVRO_SCHEMA", "Request schema is unavailable", ""))?;
    validate(&request, req_schema, rt, ctx, "FACETS_AVRO_REQUEST")?;
    let operation = text(get(&author, "operation")).ok_or_else(|| {
        error(
            "FACETS_AVRO_AUTHOR",
            "Author operation is required",
            "/operation",
        )
    })?;
    let target = get(&author, "target")
        .ok_or_else(|| error("FACETS_AVRO_AUTHOR", "Author target is required", "/target"))?;
    let mut caps = NoCapabilities;
    let verified = match operation.as_str() {
        "declare-core-facets" => crate::facets::verify_core_facet_declaration(
            &author,
            target,
            &rt.engine,
            &rt.registry,
            &mut caps,
            ctx,
        )?,
        "declare-core-kind" => crate::core_kind::verify_core_kind_declaration(
            &author,
            target,
            &rt.engine,
            &rt.registry,
            &mut caps,
            ctx,
        )?,
        _ => {
            return Err(error(
                "FACETS_AVRO_AUTHOR",
                "Expected a verified Facet or Field-kind declaration",
                "/operation",
            ))
        }
    };
    let source = copy(
        get(&verified, "target").unwrap_or(get(&verified, "source").unwrap_or(&Value::Null)),
        ctx,
    )?;
    if text(get(&source, "umf")).as_deref() != Some("0.10.0") {
        return Err(error(
            "FACETS_AVRO_VERSION",
            "Current core 0.10.0 declaration required",
            "/umf",
        ));
    }
    let (mi, ei, element, path, ident) = identity(&source, get(&author, "identity").unwrap_or(&Value::Null), ctx)?;
    if text(get(&element, "kind")).as_deref() != Some("field") {
        return Err(error(
            "FACETS_AVRO_FIELD",
            "Selected author must identify a Field",
            &path,
        ));
    }
    let mut losses = Vec::new();
    let namespace = text(get(&request, "namespace")).unwrap_or_default();
    unknown(&source, (mi, ei), &path, &namespace, &mut losses, ctx)?;
    if let Value::Object(members) = &element {
        for (key, value) in members {
            if ![
                "id",
                "kind",
                "name",
                "description",
                "scalarType",
                "facets",
                "extensions",
            ]
            .iter()
            .any(|known| key == &k(known))
                && !(key == &k("cardinality") && text(Some(value)).as_deref() == Some("one"))
            {
                let p = pointer(&path, key, ctx)?;
                losses.push(residual(&p,value,"Field metadata is retained; availability/default execution is not inferred from facets","unknown",ctx)?);
            }
        }
    }
    let native_type = text(get(&request, "nativeType")).ok_or_else(|| {
        error(
            "FACETS_AVRO_REQUEST",
            "nativeType is required",
            "/request/nativeType",
        )
    })?;
    let field_name = text(get(&request, "fieldName")).ok_or_else(|| {
        error(
            "FACETS_AVRO_REQUEST",
            "fieldName is required",
            "/request/fieldName",
        )
    })?;
    let record_name = text(get(&request, "recordName")).ok_or_else(|| {
        error(
            "FACETS_AVRO_REQUEST",
            "recordName is required",
            "/request/recordName",
        )
    })?;
    let mut facets = Value::Object(Vec::new());
    if operation == "declare-core-facets" {
        let meaning = crate::facets::inspect_core_facets(
            &source,
            &ident,
            &rt.engine,
            &rt.registry,
            &mut caps,
            ctx,
        )?;
        let meaning = get(&meaning, "meaning").cloned().unwrap_or(Value::Null);
        let state = text(get(&meaning, "state")).unwrap_or_default();
        if state == "known" || state == "partial" {
            let interpreted = get(&meaning, "interpreted").unwrap_or(&Value::Null);
            facets = crate::facets::historical_core_facet_patch(interpreted, &rt.engine, ctx)?;
            if state == "partial" {
                losses.push(residual(&format!("{path}/facets"),get(&meaning,"facets").unwrap_or(&Value::Null),"Unknown facet qualifiers remain attached; no native interpretation is fabricated","unknown",ctx)?);
            }
        }
    } else if get(&element, "facets").is_some() {
        losses.push(residual(
            &format!("{path}/facets"),
            get(&element, "facets").unwrap(),
            "A Field-kind receipt does not establish authorship of facet members",
            "unknown",
            ctx,
        )?);
    }
    let mut mapped_facets: Vec<(Utf16, Value)> = Vec::new();
    let mut carrier = match native_type.as_str() {
        "boolean" | "int" | "long" | "float" | "double" | "bytes" | "string" => s(&native_type),
        "fixed" | "decimal-fixed" => obj(vec![
            ("type", s("fixed")),
            (
                "name",
                get(&request, "fixedName").cloned().unwrap_or(Value::Null),
            ),
            (
                "size",
                get(&request, "fixedSize").cloned().unwrap_or(Value::Null),
            ),
        ]),
        "decimal-bytes" => obj(vec![("type", s("bytes"))]),
        "date" => obj(vec![("type", s("int")), ("logicalType", s("date"))]),
        "time-millis" => obj(vec![("type", s("int")), ("logicalType", s("time-millis"))]),
        "time-micros" => obj(vec![("type", s("long")), ("logicalType", s("time-micros"))]),
        "timestamp-millis" => obj(vec![
            ("type", s("long")),
            ("logicalType", s("timestamp-millis")),
        ]),
        "timestamp-micros" => obj(vec![
            ("type", s("long")),
            ("logicalType", s("timestamp-micros")),
        ]),
        "local-timestamp-micros" => obj(vec![
            ("type", s("long")),
            ("logicalType", s("local-timestamp-micros")),
        ]),
        _ => {
            return Err(error(
                "FACETS_AVRO_REQUEST",
                "Unsupported native type",
                "/request/nativeType",
            ))
        }
    };
    let mut fatal = false;
    let fixed = matches!(native_type.as_str(), "fixed" | "decimal-fixed");
    let decimal = matches!(native_type.as_str(), "decimal-bytes" | "decimal-fixed");
    if fixed {
        let size = number(get(&request, "fixedSize"));
        if size.is_none_or(|n| n > 4096)
            || text(get(&request, "fixedName")).as_deref() == Some(record_name.as_str())
        {
            fatal = true;
            losses.push(residual(
                "/request",
                &request,
                "Fixed carrier exceeds the 4096-byte execution profile",
                "not-expressible",
                ctx,
            )?);
        }
    }
    if decimal {
        let native_encoding = text(get(&request, "encoding")).as_deref() == Some("native-type");
        let p = if native_encoding {
            number(get(&facets, "precision")).unwrap_or(38)
        } else {
            38
        };
        let sc = if native_encoding {
            number(get(&facets, "scale")).unwrap_or(9)
        } else {
            9
        };
        let mut precision = p;
        let mut scale = sc;
        if fixed {
            if let Some(size) = number(get(&request, "fixedSize")) {
                if size == 0 {
                    fatal = true;
                } else if size <= 4096 {
                    let capacity =
                        (((8 * size - 1) as f64) * std::f64::consts::LOG10_2).floor() as u64;
                    precision = precision.min(capacity);
                    scale = scale.min(precision);
                }
            }
        }
        if p == 0
            || p > 4096
            || sc > p
            || precision == 0
            || number(get(&facets, "precision")).is_some_and(|authored| authored > precision)
        {
            fatal = true;
            losses.push(residual(
                &format!("{path}/facets"),
                &facets,
                "Decimal precision/scale is outside the 4096-digit execution profile",
                "not-expressible",
                ctx,
            )?);
        }
        let mut decimal_fields = vec![("type", if fixed { s("fixed") } else { s("bytes") })];
        if fixed {
            decimal_fields.push((
                "name",
                get(&request, "fixedName").cloned().unwrap_or(Value::Null),
            ));
            decimal_fields.push((
                "size",
                get(&request, "fixedSize").cloned().unwrap_or(Value::Null),
            ));
        }
        decimal_fields.extend([
            ("logicalType", s("decimal")),
            ("precision", Value::Number(precision as f64)),
            ("scale", Value::Number(scale as f64)),
        ]);
        carrier = obj(decimal_fields);
    } else if let Some(width) = get(&facets, "integerWidth") {
        let bits = number(get(width, "bits"));
        let signed = matches!(get(width, "signed"), Some(Value::Bool(true)));
        let supports = (native_type == "int" && bits == Some(32) && signed)
            || (native_type == "long" && bits == Some(64) && signed);
        if supports {
            mapped_facets.push((k("integerWidth"), copy_json(width, ctx)?));
        } else {
            losses.push(residual(&format!("{path}/facets/integerWidth"),width,"Avro primitive carriers cannot enforce this narrower, unsigned or out-of-range integer domain","not-expressible",ctx)?);
        }
    }
    if let (Some(precision), Some(scale)) = (
        number(get(&facets, "precision")),
        number(get(&facets, "scale")),
    ) {
        if decimal
            && text(get(&request, "encoding")).as_deref() == Some("native-type")
            && number(get(&facets, "precision")) == number(get(&carrier, "precision"))
            && number(get(&facets, "scale")) == number(get(&carrier, "scale"))
        {
            mapped_facets.push((k("precision"), Value::Number(precision as f64)));
            mapped_facets.push((k("scale"), Value::Number(scale as f64)));
        } else {
            losses.push(residual(
                &format!("{path}/facets"),
                &facets,
                "Selected carrier/encoding does not declare the authored decimal pair",
                "not-expressible",
                ctx,
            )?);
        }
    }
    if let Some(length) = get(&facets, "length") {
        let matches = native_type == "fixed"
            && number(get(length, "max")) == number(get(&request, "fixedSize"))
            && text(get(length, "unit")).as_deref() == Some("byte");
        if matches {
            mapped_facets.push((k("length"), copy_json(length, ctx)?));
        } else {
            losses.push(residual(
            &format!("{path}/facets/length"),
            get(&facets, "length").unwrap(),
            "A variable Avro carrier has no builtin maximum bound; fixed size must match exactly",
            "not-expressible",
            ctx,
        )?);
        }
    }
    if native_type == "fixed" && number(get(&request, "fixedSize")) != Some(0) {
        losses.push(residual(&format!("{path}/facets/length"),get(&facets,"length").unwrap_or(&Value::Null),"Exact fixed length rejects shorter values allowed by a maximum bound; no padding or truncation is implied","not-expressible",ctx)?);
    }
    if get(&element, "name").is_some_and(|name| *name != s(&field_name)) {
        losses.push(residual(
            &format!("{path}/name"),
            get(&element, "name").unwrap(),
            "Explicit native field name differs from ideal name",
            "not-expressible",
            ctx,
        )?);
    }
    if text(get(&request, "encoding")).as_deref() == Some("metadata-only")
        && get(&element, "facets").is_some()
        && operation == "declare-core-facets"
    {
        let authored = copy(get(&element, "facets").unwrap(), ctx)?;
        if let Value::String(kind) = &carrier {
            let kind = kind.clone();
            carrier = obj(vec![("type", Value::String(kind)), ("umfFacets", authored)]);
        } else if let Value::Object(members) = &mut carrier {
            members.push((k("umfFacets"), authored));
        }
    }
    let scalar = text(get(&element, "scalarType"));
    let family = match native_type.as_str() {
        "boolean" => "boolean",
        "int" | "long" => "integer",
        "float" | "double" => "float",
        "bytes" | "fixed" => "binary",
        "decimal-bytes" | "decimal-fixed" => "decimal",
        "string" => "string",
        "date" => "date",
        "time-millis" | "time-micros" => "time",
        _ => "timestamp",
    };
    if scalar.as_deref().is_some_and(|value| value != family) {
        losses.push(residual(
            &format!("{path}/scalarType"),
            get(&element, "scalarType").unwrap(),
            "Explicit native carrier belongs to a different scalar family",
            "not-expressible",
            ctx,
        )?);
    }
    let cardinality = text(get(&element, "cardinality")).unwrap_or_else(|| "one".to_owned());
    if cardinality != "one"
        || get(&element, "itemType").is_some()
        || arr(get(&element, "references"))
            .iter()
            .any(|r| text(get(r, "role")).as_deref() == Some("record-type"))
    {
        fatal = true;
        losses.push(residual(
            &path,
            &element,
            "A scalar projection cannot flatten a container or record-valued Field",
            "not-expressible",
            ctx,
        )?);
    }
    let profile = text(get(&request, "profile")).unwrap_or_default();
    if native_type == "boolean" && profile == "fastavro-schemaless-writer" {
        losses.push(residual(
            &path,
            &element,
            "Pinned fastavro boolean writing can coerce null input to false even in strict mode",
            "unknown",
            ctx,
        )?);
    }
    if profile != "declared-schema" && decimal {
        losses.push(residual(&format!("{path}/facets"),&facets,if profile=="apache-datum-writer"{"Apache Decimal validation/writing does not establish coefficient bounds or exact scale conversion"}else{"Physical bytes/fixed inputs can bypass fastavro Decimal precision checks"},"unknown",ctx)?);
    }
    if native_type == "int" && profile == "fastavro-schemaless-writer" {
        losses.push(residual(
            &path,
            &element,
            "Pinned fastavro accepts int 2147483648 outside the declared signed-32 domain",
            "approximated",
            ctx,
        )?);
    }
    if text(get(&request, "obligation")).as_deref() == Some("exact-input") {
        losses.push(residual(&path,&element,if native_type=="float"{"Binary64 1.0000000000000002 narrows to binary32 1.0"}else if decimal{"Decimal rescaling/rounding and physical-byte bypass prevent a general exact-input guarantee"}else{"Schema domains do not prove exact conversion of arbitrary host inputs"},if native_type=="float"||decimal{"approximated"}else{"unknown"},ctx)?);
    }
    if let Some(extensions) = get(&element, "extensions") {
        if let Value::Object(values) = extensions {
            if !values.is_empty() {
                losses.push(residual(
                    &format!("{path}/extensions"),
                    extensions,
                    "Field extension content is retained and not projected",
                    "unknown",
                    ctx,
                )?);
            }
        }
    }
    let mut native_field = vec![("name", s(&field_name)), ("type", carrier)];
    if let Some(description) = get(&element, "description") {
        native_field.push(("doc", copy_json(description, ctx)?));
    }
    let type_json = obj(vec![
        ("type", s("record")),
        ("name", s(&record_name)),
        ("namespace", s(&namespace)),
        ("fields", Value::Array(vec![obj(native_field)])),
    ]);
    let mut native_text = serialization::stringify_compact_metered(&type_json, ctx)?
        .to_utf8()
        .map_err(|_| {
            error(
                "FACETS_AVRO_TEXT",
                "Avro schema cannot be represented as UTF-8",
                "",
            )
        })?;
    native_text.push('\n');
    let _native = crate::avro_document::import_schema(
        &k(text(get(&request, "id"))
            .as_deref()
            .unwrap_or("facets-projection")),
        &native_text.encode_utf16().collect::<Vec<_>>(),
        &[],
        ctx,
    )?;
    let mode = text(get(&request, "mode")).unwrap_or_default();
    let blocked = fatal || (mode == "strict" && !losses.is_empty());
    let diagnostic_values = losses
        .iter()
        .map(|loss| {
            obj(vec![
                ("code", s("FACETS_MEANING_NOT_PROJECTED")),
                ("path", get(loss, "path").cloned().unwrap_or(Value::Null)),
                (
                    "message",
                    get(loss, "reason").cloned().unwrap_or(Value::Null),
                ),
                ("severity", s(if blocked { "error" } else { "warning" })),
            ])
        })
        .collect();
    let binding=obj(vec![("id",s(BINDING_ID)),("version",s(BINDING_VERSION)),("nativeVersion",s("1.12.0")),("subset",s("Single authored scalar Field in a record; explicit carrier, declaration/Apache1.12.0/fastavro1.12.2 profile, encoding and obligation; fixed size and decimal precision bounded to4096; retained losses and ideal recovery; no native equivalence"))]);
    let mapping = obj(vec![
        ("origin", s("authored")),
        ("idealPath", s(&format!("{path}/facets"))),
        ("nativePath", s("/fields/0/type")),
        ("facets", Value::Object(mapped_facets)),
        (
            "encoding",
            get(&request, "encoding").cloned().unwrap_or(Value::Null),
        ),
        (
            "profile",
            get(&request, "profile").cloned().unwrap_or(Value::Null),
        ),
        (
            "outcome",
            s(
                if losses
                    .iter()
                    .any(|l| text(get(l, "outcome")).as_deref() == Some("not-expressible"))
                {
                    "not-expressible"
                } else if losses
                    .iter()
                    .any(|l| text(get(l, "outcome")).as_deref() == Some("unknown"))
                {
                    "unknown"
                } else if losses
                    .iter()
                    .any(|l| text(get(l, "outcome")).as_deref() == Some("approximated"))
                {
                    "approximated"
                } else {
                    "exact"
                },
            ),
        ),
    ]);
    let mut output = obj(vec![
        ("operation", s("project-facets-avro")),
        ("version", s("1.0.0")),
        ("status", s(if blocked { "blocked" } else { "projected" })),
        ("source", source),
        ("author", author),
        ("request", request),
        ("binding", binding),
        ("mapping", mapping),
        ("residuals", Value::Array(losses)),
        ("diagnostics", Value::Array(diagnostic_values)),
    ]);
    if !blocked {
        if let Value::Object(fields) = &mut output {
            fields.push((
                k("target"),
                obj(vec![
                    ("format", s("avro-schema-json")),
                    ("schema", s(&native_text)),
                ]),
            ));
            fields.push((k("nativeSchema"), s(&native_text)));
        }
    }
    let _ = copy(&output, ctx)?;
    validate(&output, &result_schema, rt, ctx, "FACETS_AVRO_RESULT")?;
    Ok(output)
}
pub fn project_facets_to_avro(
    author: &Value,
    request: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    project_inner(author, request, ctx)
}
pub fn recover_facets_from_avro(
    receipt: &Value,
    native_text: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let receipt = copy_json(receipt, ctx)?;
    if text(get(&receipt, "status")).as_deref() != Some("projected") {
        return Err(error(
            "FACETS_AVRO_RECEIPT",
            "Expected projected receipt",
            "/status",
        ));
    }
    let author = get(&receipt, "author").ok_or_else(|| {
        error(
            "FACETS_AVRO_RECEIPT",
            "Author receipt is required",
            "/author",
        )
    })?;
    let request = get(&receipt, "request")
        .ok_or_else(|| error("FACETS_AVRO_RECEIPT", "Request is required", "/request"))?;
    let expected = project_inner(author, request, ctx)?;
    if !same(&expected, &receipt, ctx)? {
        return Err(error(
            "FACETS_AVRO_RECEIPT",
            "Receipt differs from retained author and request",
            "",
        ));
    }
    if text(Some(native_text)) != text(get(&receipt, "nativeSchema")) {
        return Err(error(
            "FACETS_AVRO_STALE",
            "Native target changed",
            "/nativeSchema",
        ));
    }
    copy_json(
        get(&receipt, "source")
            .ok_or_else(|| error("FACETS_AVRO_RECEIPT", "Source is required", "/source"))?,
        ctx,
    )
}
