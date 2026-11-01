// SPDX-License-Identifier: MIT OR Apache-2.0
//! Rust-owned authored nullability projection to an Avro field carrier.
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

const RESULT_SCHEMA: &str =
    include_str!("../../../spec/core/nullability-avro-projection.schema.json");
const CORE_SCHEMA: &str = include_str!("../../../spec/core/schema.json");
const NULLABILITY_SCHEMA: &str =
    include_str!("../../../spec/core/nullability-operation-v5.schema.json");
const RECOVERY: &str = "Recover source meaning with retained projection receipt; native-only import does not recover author intent";

fn k(s: &str) -> Utf16 {
    Utf16::from(s)
}
fn s(v: &str) -> Value {
    Value::string_utf8(v)
}
fn obj(v: Vec<(&str, Value)>) -> Value {
    Value::Object(
        v.into_iter()
            .map(|(name, value)| (k(name), value))
            .collect(),
    )
}
fn get<'a>(v: &'a Value, n: &str) -> Option<&'a Value> {
    match v {
        Value::Object(m) => m.iter().find(|(key, _)| key == &k(n)).map(|(_, v)| v),
        _ => None,
    }
}
fn arr(v: Option<&Value>) -> &[Value] {
    if let Some(Value::Array(a)) = v {
        a
    } else {
        &[]
    }
}
fn txt(v: Option<&Value>) -> Option<String> {
    if let Some(Value::String(v)) = v {
        v.to_utf8().ok()
    } else {
        None
    }
}
fn err(code: &str, message: &str, path: &str) -> EngineError {
    EngineError::new(code, k(path), message)
}
fn json_resource(source: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
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
    static RUNTIME: OnceLock<Arc<Runtime>> = OnceLock::new();
    if ctx.profile() == crate::context::ResourceProfile::Cooperative
        && ctx.limits() == crate::context::Limits::ordinary()
    {
        if let Some(value) = RUNTIME.get() {
            return Ok(value.clone());
        }
    }
    let engine = Engine::new(
        ResourceSet::new(
            json_resource(CORE_SCHEMA, ctx)?,
            json_resource(
                include_str!("../../../spec/core/semantic-type-reference.schema.json"),
                ctx,
            )?,
            json_resource(
                include_str!("../../../spec/core/extension-package.schema.json"),
                ctx,
            )?,
            json_resource(
                include_str!("../../../spec/metamodel/generated/core-constraints.json"),
                ctx,
            )?,
            json_resource(
                include_str!("../../../spec/metamodel/generated/domain-policy.json"),
                ctx,
            )?,
        ),
        ctx,
    )?;
    let mut registry = Registry::new();
    let resources = engine.schema_resources_with_context(ctx)?;
    let avro = json_resource(
        include_str!("../../../spec/extensions/avro/package.json"),
        ctx,
    )?;
    registry.register(&avro, None, engine.package_schema(), &resources, ctx)?;
    let value = Arc::new(Runtime { engine, registry });
    if ctx.profile() == crate::context::ResourceProfile::Cooperative
        && ctx.limits() == crate::context::Limits::ordinary()
    {
        let _ = RUNTIME.set(value.clone());
    }
    Ok(value)
}
fn schemas(ctx: &mut Context<'_>) -> Result<(CompiledSchema, CompiledSchema), EngineError> {
    let operation = json_resource(RESULT_SCHEMA, ctx)?;
    let resources = SchemaResources {
        entries: vec![
            (
                k("urn:umf:core:semantic-type-reference:1.0.0"),
                json_resource(include_str!("../../../spec/core/semantic-type-reference.schema.json"), ctx)?,
            ),
            (k("urn:umf:core:0.10.0"), json_resource(CORE_SCHEMA, ctx)?),
            (
                k("urn:umf:core:nullability-operation:5.0.0"),
                json_resource(NULLABILITY_SCHEMA, ctx)?,
            ),
        ],
    };
    let result = CompiledSchema::compile(&operation, &resources, ctx)?;
    let request = get(
        get(&operation, "properties").unwrap_or(&Value::Null),
        "request",
    )
    .ok_or_else(|| err("NULLABILITY_AVRO_RESULT", "Missing request schema", ""))?;
    let request = CompiledSchema::compile(request, &resources, ctx)?;
    Ok((result, request))
}
fn native_type(name: &str) -> Result<Value, EngineError> {
    let primitive = match name {
        "null" | "boolean" | "int" | "long" | "float" | "double" | "bytes" | "string" => {
            return Ok(s(name))
        }
        "date" => ("int", "date"),
        "time-millis" => ("int", "time-millis"),
        "time-micros" => ("long", "time-micros"),
        "timestamp-millis" => ("long", "timestamp-millis"),
        "timestamp-micros" => ("long", "timestamp-micros"),
        "local-timestamp-micros" => ("long", "local-timestamp-micros"),
        "decimal(38,9)" => {
            return Ok(obj(vec![
                ("type", s("bytes")),
                ("logicalType", s("decimal")),
                ("precision", Value::Number(38.0)),
                ("scale", Value::Number(9.0)),
            ]))
        }
        _ => {
            return Err(err(
                "NULLABILITY_AVRO_REQUEST",
                "Unknown Avro carrier",
                "/request/nativeType",
            ))
        }
    };
    Ok(obj(vec![
        ("type", s(primitive.0)),
        ("logicalType", s(primitive.1)),
    ]))
}
fn canonical(v: &Value, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    // Object order is not semantically significant. Canonicalize recursively by
    // UTF-16 key while retaining every exact JSON value.
    match v {
        Value::Object(m) => {
            let mut entries = m.iter().collect::<Vec<_>>();
            entries.sort_by(|a, b| a.0.cmp(&b.0));
            let mut out = String::from("{");
            for (i, (key, value)) in entries.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                let key_value = Value::String((*key).clone());
                out.push_str(
                    &serialization::write_json_value(&key_value, Format::Json, ctx)?
                        .to_utf8()
                        .map_err(|_| err("NULLABILITY_AVRO_RECEIPT", "Invalid UTF-16 key", ""))?,
                );
                out.push(':');
                out.push_str(
                    &canonical(value, ctx)?
                        .to_utf8()
                        .map_err(|_| err("NULLABILITY_AVRO_RECEIPT", "Invalid UTF-16 value", ""))?,
                );
            }
            out.push('}');
            Ok(Utf16::from(out))
        }
        Value::Array(values) => {
            let mut out = String::from("[");
            for (i, value) in values.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                out.push_str(
                    &canonical(value, ctx)?
                        .to_utf8()
                        .map_err(|_| err("NULLABILITY_AVRO_RECEIPT", "Invalid UTF-16 value", ""))?,
                );
            }
            out.push(']');
            Ok(Utf16::from(out))
        }
        _ => serialization::write_json_value(v, Format::Json, ctx),
    }
}
fn pointer_key(base: &str, key: &Utf16) -> Utf16 {
    let mut units = base.encode_utf16().collect::<Vec<_>>();
    units.push(b'/' as u16);
    for unit in key.units() {
        match *unit {
            0x7e => units.extend([b'~' as u16, b'0' as u16]),
            0x2f => units.extend([b'~' as u16, b'1' as u16]),
            value => units.push(value),
        }
    }
    Utf16::new(units)
}
fn residual_units(
    path: Utf16,
    value: &Value,
    reason: &str,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    ctx.charge_work(
        path.len().saturating_add(reason.encode_utf16().count()),
        path.clone(),
    )?;
    Ok(obj(vec![
        ("path", Value::String(path)),
        ("value", copy_json(value, ctx)?),
        ("reason", s(reason)),
        ("outcome", s("unknown")),
        ("recovery", s(RECOVERY)),
    ]))
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
fn identity_index(source: &Value, author: &Value) -> Result<(usize, usize, String), EngineError> {
    let id = get(author, "identity").ok_or_else(|| {
        err(
            "NULLABILITY_AVRO_RECEIPT",
            "Author identity is required",
            "/author/identity",
        )
    })?;
    let module = txt(get(id, "module")).ok_or_else(|| {
        err(
            "NULLABILITY_AVRO_RECEIPT",
            "Author module is required",
            "/author/identity/module",
        )
    })?;
    let element = txt(get(id, "element")).ok_or_else(|| {
        err(
            "NULLABILITY_AVRO_RECEIPT",
            "Author element is required",
            "/author/identity/element",
        )
    })?;
    for (mi, m) in arr(get(source, "modules")).iter().enumerate() {
        if txt(get(m, "id")).as_deref() == Some(&module) {
            for (ei, e) in arr(get(m, "elements")).iter().enumerate() {
                if txt(get(e, "id")).as_deref() == Some(&element) {
                    return Ok((mi, ei, format!("/modules/{mi}/elements/{ei}")));
                }
            }
        }
    }
    Err(err(
        "NULLABILITY_AVRO_RECEIPT",
        "Author Field is absent from its target",
        "/author/identity",
    ))
}
fn project_inner(
    author_input: &Value,
    request_input: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let author_input = copy_json(author_input, ctx)?;
    let request = copy_json(request_input, ctx)?;
    let (result_schema, request_schema) = schemas(ctx)?;
    if let Some(d) = request_schema.validate(&request, ctx)?.first() {
        return Err(EngineError::new(
            "NULLABILITY_AVRO_REQUEST",
            d.instance_path.clone(),
            d.message.clone(),
        ));
    }
    let run = runtime(ctx)?;
    let mut no = NoCapabilities;
    let current = get(&author_input, "target").ok_or_else(|| {
        err(
            "NULLABILITY_AVRO_RECEIPT",
            "Author target is required",
            "/author/target",
        )
    })?;
    let author = crate::nullability::verify_core_nullability_declaration(
        &author_input,
        current,
        &run.engine,
        &run.registry,
        &mut no,
        ctx,
    )?;
    let source = get(&author, "target").cloned().ok_or_else(|| {
        err(
            "NULLABILITY_AVRO_RECEIPT",
            "Author target is required",
            "/author/target",
        )
    })?;
    let (mi, ei, path) = identity_index(&source, &author)?;
    let element = arr(arr(get(&source, "modules")).get(mi).and_then(|module| get(module, "elements")))
        .get(ei)
        .ok_or_else(|| err("NULLABILITY_AVRO_RECEIPT", "Author Field is missing", &path))?;
    let nullability = txt(get(
        get(&author, "provenance").unwrap_or(&Value::Null),
        "nullability",
    ))
    .unwrap_or_else(|| "unspecified".into());
    let req_text = |name: &str| {
        txt(get(&request, name)).ok_or_else(|| {
            err(
                "NULLABILITY_AVRO_REQUEST",
                "Required request text is missing",
                &format!("/request/{name}"),
            )
        })
    };
    let id = req_text("id")?;
    let record_name = req_text("recordName")?;
    let namespace = req_text("namespace")?;
    let field_name = req_text("fieldName")?;
    let native_name = req_text("nativeType")?;
    let mode = req_text("mode")?;
    let scope = req_text("scope")?;
    let carrier = req_text("carrier")?;
    let mut native = native_type(&native_name)?;
    let mut residuals = Vec::new();
    let mut basis = if nullability == "unspecified" {
        "no-authored-requirement"
    } else {
        "authored-requirement"
    };
    let field_name_existing = txt(get(element, "name"));
    if field_name_existing
        .as_deref()
        .is_some_and(|n| n != field_name)
    {
        residuals.push(residual(
            &format!("{path}/name"),
            get(element, "name").unwrap(),
            "Explicit native column name differs from ideal name",
            "not-expressible",
            ctx,
        )?);
    }
    for (key, value) in match &source {
        Value::Object(m) => m.as_slice(),
        _ => &[],
    } {
        if !["umf", "id", "modules", "vocabularies"]
            .iter()
            .any(|known| key == &k(known))
        {
            residuals.push(residual_units(
                pointer_key("", key),
                value,
                "Document metadata is retained but not projected",
                ctx,
            )?);
        }
    }
    if !arr(get(&source, "modules")).is_empty()
        && matches!(get(&source,"vocabularies"),Some(Value::Object(v)) if !v.is_empty())
    {
        residuals.push(residual(
            "/vocabularies",
            get(&source, "vocabularies").unwrap(),
            "Native vocabulary semantics are not projected",
            "unknown",
            ctx,
        )?);
    }
    for (i, module) in arr(get(&source, "modules")).iter().enumerate() {
        if i != mi {
            residuals.push(residual(
                &format!("/modules/{i}"),
                module,
                "Other module is outside selected Field projection",
                "unknown",
                ctx,
            )?);
            continue;
        }
        if let Some(ns) = txt(get(module, "namespace")) {
            if !ns.is_empty() && ns != namespace {
                residuals.push(residual(
                    &format!("/modules/{i}/namespace"),
                    get(module, "namespace").unwrap(),
                    "Native namespace differs from ideal namespace",
                    "not-expressible",
                    ctx,
                )?);
            }
        }
        if let Value::Object(m) = module {
            for (key, value) in m {
                if !["id", "namespace", "elements"]
                    .iter()
                    .any(|known| key == &k(known))
                {
                    residuals.push(residual_units(
                        pointer_key(&format!("/modules/{i}"), key),
                        value,
                        "Module metadata is not projected",
                        ctx,
                    )?);
                }
            }
        }
        for (j, e) in arr(get(module, "elements")).iter().enumerate() {
            if j != ei {
                residuals.push(residual(
                    &format!("/modules/{i}/elements/{j}"),
                    e,
                    "Other element is outside selected Field projection",
                    "unknown",
                    ctx,
                )?);
            }
        }
    }
    if let Value::Object(fields) = element {
        for (key, value) in fields {
            if ![
                "id",
                "kind",
                "name",
                "description",
                "scalarType",
                "nullability",
            ]
            .iter()
            .any(|known| key == &k(known))
                && !(key == &k("extensions") && matches!(value,Value::Object(m) if m.is_empty()))
            {
                residuals.push(residual_units(
                    pointer_key(&path, key),
                    value,
                    "Field metadata is retained but not projected",
                    ctx,
                )?);
            }
        }
    }
    let mut encoding = if native_name == "null" {
        "null-only"
    } else {
        "non-null"
    };
    if nullability != "unspecified" {
        if scope != "underlying-field-value" {
            residuals.push(residual(&format!("{path}/nullability"),get(&author,"provenance").and_then(|v|get(v,"nullability")).unwrap(),"Only underlying field-value availability is implemented; reader resolution and writer omission are distinct","not-expressible",ctx)?);
            basis = "unprojected-requirement";
        } else if carrier != "avro-null" {
            residuals.push(residual(
                &format!("{path}/nullability"),
                get(&author, "provenance")
                    .and_then(|v| get(v, "nullability"))
                    .unwrap(),
                "Explicit Avro null-value carrier is required",
                "unknown",
                ctx,
            )?);
            basis = "unprojected-requirement";
        } else if nullability == "required" && native_name == "null" {
            residuals.push(residual(
                &format!("{path}/nullability"),
                get(&author, "provenance")
                    .and_then(|v| get(v, "nullability"))
                    .unwrap(),
                "Null-only native type cannot provide a required non-absent value",
                "not-expressible",
                ctx,
            )?);
            basis = "unprojected-requirement";
        } else if nullability == "absent-allowed" && native_name != "null" {
            native = Value::Array(vec![s("null"), native]);
            encoding = "null-union";
        }
    }
    let mut field = vec![("name", s(&field_name)), ("type", native)];
    if let Some(doc) = get(element, "description") {
        field.push(("doc", copy_json(doc, ctx)?));
    }
    let schema = obj(vec![
        ("type", s("record")),
        ("name", s(&record_name)),
        ("namespace", s(&namespace)),
        ("fields", Value::Array(vec![obj(field)])),
    ]);
    let schema_text = serialization::write_json_value(&schema, Format::Json, ctx)?
        .to_utf8()
        .map_err(|_| {
            err(
                "NULLABILITY_AVRO_REQUEST",
                "Avro carrier text must be UTF-8",
                "/request",
            )
        })?
        + "\n";
    let target = crate::avro_document::import_schema(
        &Utf16::from(id.as_str()),
        &schema_text.encode_utf16().collect::<Vec<_>>(),
        &[],
        ctx,
    )?;
    let mut mapping_outcome = "exact";
    if let Some(scalar) = txt(get(element, "scalarType")) {
        let imported = arr(arr(get(&target, "modules")).iter().find(|module| txt(get(module, "id")).as_deref() == Some("avro.fields")).and_then(|module| get(module, "elements")))
            .first()
            .and_then(|f| txt(get(f, "scalarType")));
        if imported.as_deref() != Some(&scalar) {
            residuals.push(residual(
                &format!("{path}/scalarType"),
                get(element, "scalarType").unwrap(),
                "Explicit native type does not establish the stated scalar family",
                "not-expressible",
                ctx,
            )?);
        }
    }
    if residuals
        .iter()
        .any(|r| txt(get(r, "outcome")).as_deref() == Some("not-expressible"))
    {
        mapping_outcome = "not-expressible";
    } else if !residuals.is_empty() {
        mapping_outcome = "unknown";
    }
    let status = if mode == "strict" && !residuals.is_empty() {
        "blocked"
    } else {
        "projected"
    };
    let target_value = if status == "projected" {
        Some(target.clone())
    } else {
        None
    };
    let binding = obj(vec![
        ("id", s("umf.core.nullability.avro")),
        ("version", s("1.0.0")),
        ("nativeVersion", s("1.12.0")),
        ("subset", s("Single authored Field with explicit underlying carrier; null-first union for absence permission; no reader defaults, member omission or value-domain equivalence")),
    ]);
    let diagnostics = Value::Array(
        residuals
            .iter()
            .map(|r| {
                obj(vec![
                    ("code", s("NULLABILITY_MEANING_NOT_PROJECTED")),
                    ("path", get(r, "path").unwrap().clone()),
                    ("message", get(r, "reason").unwrap().clone()),
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
    );
    let result = obj(vec![
        ("operation", s("project-nullability-avro")),
        ("version", s("1.0.0")),
        ("status", s(status)),
        ("source", source),
        ("author", author),
        ("request", request),
        ("binding", binding),
        ("diagnostics", diagnostics),
        (
            "mapping",
            obj(vec![
                ("origin", s("authored")),
                ("nullability", s(&nullability)),
                ("encoding", s(encoding)),
                ("basis", s(basis)),
                ("scope", s(&scope)),
                ("carrier", s(&carrier)),
                ("idealPath", s(&format!("{path}/nullability"))),
                ("nativePath", s("/fields/0/type")),
                ("outcome", s(mapping_outcome)),
            ]),
        ),
        ("residuals", Value::Array(residuals)),
        ("target", target_value.unwrap_or(Value::Null)),
    ]);
    let result = if status == "blocked" {
        without_key(result, "target")
    } else {
        result
    };
    if let Some(d) = result_schema.validate(&result, ctx)?.first() {
        return Err(EngineError::new(
            "NULLABILITY_AVRO_RESULT",
            d.instance_path.clone(),
            d.message.clone(),
        ));
    }
    Ok(result)
}
fn without_key(value: Value, name: &str) -> Value {
    if let Value::Object(mut pairs) = value {
        pairs.retain(|(k, _)| k != &Utf16::from(name));
        Value::Object(pairs)
    } else {
        value
    }
}
pub fn project_nullability_to_avro(
    author: &Value,
    request: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    project_inner(author, request, ctx)
}
pub fn recover_nullability_from_avro(
    receipt: &Value,
    native_text: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let receipt = copy_json(receipt, ctx)?;
    if txt(get(&receipt, "status")).as_deref() != Some("projected") {
        return Err(err(
            "NULLABILITY_AVRO_RECEIPT",
            "Expected projected receipt",
            "/status",
        ));
    }
    let author = get(&receipt, "author").ok_or_else(|| {
        err(
            "NULLABILITY_AVRO_RECEIPT",
            "Author receipt is required",
            "/author",
        )
    })?;
    let request = get(&receipt, "request").ok_or_else(|| {
        err(
            "NULLABILITY_AVRO_RECEIPT",
            "Request is required",
            "/request",
        )
    })?;
    let expected = project_inner(author, request, ctx)?;
    if canonical(&receipt, ctx)? != canonical(&expected, ctx)? {
        return Err(err(
            "NULLABILITY_AVRO_RECEIPT",
            "Receipt does not match retained source and binding",
            "",
        ));
    }
    let run = runtime(ctx)?;
    let _ = run;
    let target = get(&receipt, "target")
        .ok_or_else(|| err("NULLABILITY_AVRO_RECEIPT", "Target is required", "/target"))?;
    let current = txt(Some(native_text)).ok_or_else(|| {
        err(
            "NULLABILITY_AVRO_STALE",
            "Native schema text is required",
            "",
        )
    })?;
    let exported = crate::avro_document::export_schema(target, ctx)?
        .to_utf8()
        .map_err(|_| {
            err(
                "NULLABILITY_AVRO_STALE",
                "Native schema text is not UTF-8",
                "",
            )
        })?;
    if current != exported {
        return Err(err(
            "NULLABILITY_AVRO_STALE",
            "Native target changed; retained report cannot assert recovery",
            "",
        ));
    }
    Ok(get(&receipt, "source").cloned().unwrap_or(Value::Null))
}
