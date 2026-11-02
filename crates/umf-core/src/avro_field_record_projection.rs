// SPDX-License-Identifier: MIT OR Apache-2.0
//! Rust-owned authored Field/Record projections to Avro schemas.
use crate::{
    context::Context,
    core_kind,
    engine::{Capabilities, Engine, ResourceSet, SemanticContext},
    error::{Diagnostic, EngineError},
    registry::Registry,
    schema::{CompiledSchema, SchemaResources},
    serialization::{self, Format},
    value::{copy_json, Utf16, Value},
};
use std::sync::{Arc, OnceLock};

const CORE: &str = include_str!("../../../spec/core/schema.json");
const KIND: &str = include_str!("../../../spec/core/kind-operation-v6.schema.json");
const FIELD: &str = include_str!("../../../spec/core/field-avro-projection.schema.json");
const RECORD: &str = include_str!("../../../spec/core/record-avro-projection.schema.json");
const RECOVERY: &str = "Recover source meaning with retained projection receipt; native-only import does not recover author intent";
const FIELD_SUBSET: &str = "Single authored Field with explicit primitive/logical carrier in a record; no presence, execution or value-domain equivalence";
const RECORD_SUBSET: &str = "Authored flat record with explicit primitive/logical field carriers; no presence, execution or value-domain equivalence";

fn k(s: &str) -> Utf16 {
    Utf16::from(s)
}
fn s(s: &str) -> Value {
    Value::string_utf8(s)
}
fn obj(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(fields.into_iter().map(|(n, v)| (k(n), v)).collect())
}
fn get<'a>(v: &'a Value, name: &str) -> Option<&'a Value> {
    if let Value::Object(fields) = v {
        fields.iter().find(|(n, _)| n == &k(name)).map(|(_, v)| v)
    } else {
        None
    }
}
fn array(v: Option<&Value>) -> &[Value] {
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
fn text_owned(v: Option<&Value>) -> Option<String> {
    text(v).and_then(|s| s.to_utf8().ok())
}
fn err(code: &str, message: impl Into<String>, path: &str) -> EngineError {
    EngineError::new(code, k(path), message.into())
}
fn parse(src: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    serialization::read_json_value(&src.encode_utf16().collect::<Vec<_>>(), Format::Json, ctx)
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
        if let Some(v) = CACHE.get() {
            return Ok(v.clone());
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
    let rt = Arc::new(Runtime {
        engine,
        registry: Registry::new(),
    });
    if ctx.profile() == crate::context::ResourceProfile::Cooperative
        && ctx.limits() == crate::context::Limits::ordinary()
    {
        let _ = CACHE.set(rt.clone());
    }
    Ok(rt)
}

fn schemas(
    rt: &Runtime,
    field: bool,
    ctx: &mut Context<'_>,
) -> Result<(CompiledSchema, CompiledSchema), EngineError> {
    let schema = parse(if field { FIELD } else { RECORD }, ctx)?;
    let mut resources: SchemaResources = rt.engine.schema_resources_with_context(ctx)?;
    resources
        .entries
        .push((k("urn:umf:core:kind-operation:6.0.0"), parse(KIND, ctx)?));
    let result = CompiledSchema::compile(&schema, &resources, ctx)?;
    let request = get(
        get(&schema, "properties").unwrap_or(&Value::Null),
        "request",
    )
    .ok_or_else(|| err("AVRO_FIELD_RECORD_SCHEMA", "Request schema missing", ""))?;
    Ok((result, CompiledSchema::compile(request, &resources, ctx)?))
}
fn validate(
    schema: &CompiledSchema,
    v: &Value,
    code: &str,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    if schema.validate_codegen_errors(v, ctx)?.is_empty() {
        Ok(())
    } else {
        Err(err(
            code,
            "Value does not match the pinned Avro projection schema",
            "",
        ))
    }
}
fn canonical(v: &Value, ctx: &mut Context<'_>, depth: usize) -> Result<Value, EngineError> {
    if depth > ctx.limits().max_depth {
        return Err(err("LIMIT", "Receipt comparison depth exceeded", ""));
    }
    match v {
        Value::Array(items) => {
            let mut out = Vec::with_capacity(items.len());
            for item in items {
                ctx.charge_work(1, k("/receipt"))?;
                out.push(canonical(item, ctx, depth + 1)?);
            }
            Ok(Value::Array(out))
        }
        Value::Object(fields) => {
            let mut out = Vec::with_capacity(fields.len());
            for (name, value) in fields {
                ctx.charge_work(1, k("/receipt"))?;
                ctx.charge_work(name.len().saturating_add(1), k(""))?;
                out.push((name.clone(), canonical(value, ctx, depth + 1)?));
            }
            out.sort_by(|a, b| a.0.cmp(&b.0));
            Ok(Value::Object(out))
        }
        Value::String(value) => {
            ctx.charge_text(value.len(), k("/receipt"))?;
            Ok(v.clone())
        }
        _ => copy_json(v, ctx),
    }
}
fn same(a: &Value, b: &Value, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    Ok(canonical(a, ctx, 0)? == canonical(b, ctx, 0)?)
}
fn push_loss(
    out: &mut Vec<Value>,
    path: String,
    value: &Value,
    reason: &str,
    outcome: &str,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    push_loss_units(out, Utf16::from(path), value, reason, outcome, ctx)
}
fn push_loss_units(
    out: &mut Vec<Value>,
    path: Utf16,
    value: &Value,
    reason: &str,
    outcome: &str,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    ctx.charge_text(path.len(), k(""))?;
    out.push(obj(vec![
        ("path", Value::String(path)),
        ("value", copy_json(value, ctx)?),
        ("reason", s(reason)),
        ("outcome", s(outcome)),
        ("recovery", s(RECOVERY)),
    ]));
    Ok(())
}
fn pointer_child(base: &str, key: &Utf16, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    let base_units = base.encode_utf16().count();
    let escaped = key
        .units()
        .iter()
        .filter(|unit| **unit == b'~' as u16 || **unit == b'/' as u16)
        .count();
    ctx.charge_work(
        base_units
            .saturating_add(key.len())
            .saturating_add(escaped)
            .saturating_add(1),
        k("/source"),
    )?;
    let mut units = base.encode_utf16().collect::<Vec<_>>();
    units.push(b'/' as u16);
    for unit in key.units() {
        match *unit {
            x if x == b'~' as u16 => units.extend([b'~' as u16, b'0' as u16]),
            x if x == b'/' as u16 => units.extend([b'~' as u16, b'1' as u16]),
            x => units.push(x),
        }
    }
    Ok(Utf16::new(units))
}
fn diag(
    residual: &Value,
    blocked: bool,
    code: &str,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    Ok(obj(vec![
        ("code", s(code)),
        (
            "path",
            copy_json(
                get(residual, "path")
                    .ok_or_else(|| err("AVRO_FIELD_RECORD_RECEIPT", "Residual path missing", ""))?,
                ctx,
            )?,
        ),
        (
            "message",
            copy_json(
                get(residual, "reason").ok_or_else(|| {
                    err("AVRO_FIELD_RECORD_RECEIPT", "Residual reason missing", "")
                })?,
                ctx,
            )?,
        ),
        ("severity", s(if blocked { "error" } else { "warning" })),
    ]))
}
fn locate<'a>(
    source: &'a Value,
    identity: &Value,
    code: &str,
    path: &str,
    ctx: &mut Context<'_>,
) -> Result<(usize, usize, &'a Value, String), EngineError> {
    let module =
        get(identity, "module").ok_or_else(|| err(code, "Module identity required", path))?;
    let element =
        get(identity, "element").ok_or_else(|| err(code, "Element identity required", path))?;
    for (mi, m) in array(get(source, "modules")).iter().enumerate() {
        ctx.charge_work(1, k(path))?;
        if let Some(module_id) = get(m, "id") {
            if same(module_id, module, ctx)? {
                for (ei, e) in array(get(m, "elements")).iter().enumerate() {
                    ctx.charge_work(1, k(path))?;
                    if let Some(element_id) = get(e, "id") {
                        if same(element_id, element, ctx)? {
                            let resolved = format!("/modules/{mi}/elements/{ei}");
                            ctx.charge_text(resolved.encode_utf16().count(), k(path))?;
                            return Ok((mi, ei, e, resolved));
                        }
                    }
                }
            }
        }
    }
    Err(err(code, "Unresolved declared element identity", path))
}
fn identity(a: &Value, b: &Value, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    Ok(same(
        get(a, "module")
            .ok_or_else(|| err("AVRO_FIELD_RECORD_IDENTITY", "Module identity required", ""))?,
        get(b, "module")
            .ok_or_else(|| err("AVRO_FIELD_RECORD_IDENTITY", "Module identity required", ""))?,
        ctx,
    )? && same(
        get(a, "element").ok_or_else(|| {
            err(
                "AVRO_FIELD_RECORD_IDENTITY",
                "Element identity required",
                "",
            )
        })?,
        get(b, "element").ok_or_else(|| {
            err(
                "AVRO_FIELD_RECORD_IDENTITY",
                "Element identity required",
                "",
            )
        })?,
        ctx,
    )?)
}
fn carrier(name: &str) -> Value {
    match name {
        "date" => obj(vec![("type", s("int")), ("logicalType", s("date"))]),
        "time-millis" => obj(vec![("type", s("int")), ("logicalType", s("time-millis"))]),
        "time-micros" | "timestamp-micros" | "local-timestamp-micros" => {
            obj(vec![("type", s("long")), ("logicalType", s(name))])
        }
        "timestamp-millis" => obj(vec![
            ("type", s("long")),
            ("logicalType", s("timestamp-millis")),
        ]),
        "decimal(38,9)" => obj(vec![
            ("type", s("bytes")),
            ("logicalType", s("decimal")),
            ("precision", Value::Number(38.0)),
            ("scale", Value::Number(9.0)),
        ]),
        _ => s(name),
    }
}
fn native_text(v: &Value, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    let mut text = serialization::stringify_compact_metered(v, ctx)?
        .units()
        .to_vec();
    ctx.charge_work(text.len().saturating_add(1), k(""))?;
    text.push(10);
    Ok(Utf16::new(text))
}
fn import_schema(schema: &Value, id: &Utf16, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let text = native_text(schema, ctx)?;
    crate::avro_document::import_schema(id, text.units(), &[], ctx)
}
fn export_schema(document: &Value, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    crate::avro_document::export_schema(document, ctx)
}
fn field_scalar(target: &Value, index: usize) -> Option<&Value> {
    let module = array(get(target, "modules"))
        .iter()
        .find(|m| text_owned(get(m, "id")).as_deref() == Some("avro.fields"))?;
    get(array(get(module, "elements")).get(index)?, "scalarType")
}

pub fn project_field(
    author_input: &Value,
    request_input: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(ctx)?;
    let author_copy = copy_json(author_input, ctx)?;
    let request = copy_json(request_input, ctx)?;
    let mut caps = NoCapabilities;
    let author = crate::core_kind::verify_core_kind_declaration(
        &author_copy,
        get(&author_copy, "target")
            .ok_or_else(|| err("FIELD_AVRO_AUTHOR", "Target required", "/author/target"))?,
        &rt.engine,
        &rt.registry,
        &mut caps,
        ctx,
    )?;
    let source = copy_json(
        get(&author, "target")
            .ok_or_else(|| err("FIELD_AVRO_AUTHOR", "Target missing", "/author/target"))?,
        ctx,
    )?;
    let (result_schema, request_schema) = schemas(&rt, true, ctx)?;
    validate(&request_schema, &request, "FIELD_AVRO_REQUEST", ctx)?;
    let identity = get(&author, "identity")
        .ok_or_else(|| err("FIELD_AVRO_AUTHOR", "Identity required", "/author/identity"))?;
    let (mi, ei, element, path) = locate(
        &source,
        identity,
        "FIELD_AVRO_REFERENCE",
        "/author/identity",
        ctx,
    )?;
    let mut residuals = Vec::new();
    let mut mapping_outcome = "exact";
    macro_rules! field_loss {
        ($residuals:expr, $path:expr, $value:expr, $reason:expr, $outcome:expr $(,)?) => {
            push_loss($residuals, $path, $value, $reason, $outcome, ctx)
        };
    }
    if text_owned(get(
        get(&author, "provenance").unwrap_or(&Value::Null),
        "kind",
    ))
    .as_deref()
        != Some("field")
    {
        field_loss!(
            &mut residuals,
            format!("{path}/kind"),
            get(element, "kind").unwrap_or(&Value::Null),
            "Record/group is not a single native column",
            "not-expressible",
        )?;
    }
    if let Some(name) = get(element, "name") {
        if !same(
            name,
            get(&request, "fieldName").unwrap_or(&Value::Null),
            ctx,
        )? {
            field_loss!(
                &mut residuals,
                format!("{path}/name"),
                name,
                "Explicit native column name differs from ideal name",
                "not-expressible",
            )?;
        }
    }
    for (key, value) in match &source {
        Value::Object(m) => m.as_slice(),
        _ => &[],
    } {
        ctx.charge_work(key.len().saturating_add(1), k("/source"))?;
        if ![k("umf"), k("id"), k("modules"), k("vocabularies")].contains(key) {
            push_loss_units(
                &mut residuals,
                pointer_child("", key, ctx)?,
                value,
                "Document metadata is retained but not projected",
                "unknown",
                ctx,
            )?;
        }
    }
    if let Some(vocab) = get(&source, "vocabularies") {
        if !matches!(vocab,Value::Object(m) if m.is_empty()) {
            field_loss!(
                &mut residuals,
                "/vocabularies".into(),
                vocab,
                "Native vocabulary semantics are not projected",
                "unknown",
            )?;
        }
    }
    for (midx, module) in array(get(&source, "modules")).iter().enumerate() {
        ctx.charge_work(1, k("/modules"))?;
        let root = format!("/modules/{midx}");
        if midx != mi {
            field_loss!(
                &mut residuals,
                root,
                module,
                "Other module is outside selected Field projection",
                "unknown",
            )?;
            continue;
        }
        if let Some(Value::String(namespace)) = get(module, "namespace") {
            if !namespace.is_empty()
                && !matches!(get(&request,"namespace"),Some(Value::String(b)) if namespace==b)
            {
                let namespace_value = copy_json(
                    get(module, "namespace")
                        .ok_or_else(|| err("FIELD_AVRO_SOURCE", "Namespace disappeared", ""))?,
                    ctx,
                )?;
                field_loss!(
                    &mut residuals,
                    format!("{root}/namespace"),
                    &namespace_value,
                    "Native namespace differs from ideal namespace",
                    "not-expressible",
                )?;
            }
        }
        for (key, value) in match module {
            Value::Object(m) => m.as_slice(),
            _ => &[],
        } {
            if ![k("id"), k("namespace"), k("elements")].contains(key) {
                push_loss_units(
                    &mut residuals,
                    pointer_child(&root, key, ctx)?,
                    value,
                    "Module metadata is not projected",
                    "unknown",
                    ctx,
                )?;
            }
        }
        for (j, e) in array(get(module, "elements")).iter().enumerate() {
            ctx.charge_work(1, k("/modules/elements"))?;
            if j != ei {
                field_loss!(
                    &mut residuals,
                    format!("{root}/elements/{j}"),
                    e,
                    "Other element is outside selected Field projection",
                    "unknown",
                )?;
            }
        }
    }
    for (key, value) in match element {
        Value::Object(m) => m.as_slice(),
        _ => &[],
    } {
        if ![
            k("id"),
            k("kind"),
            k("name"),
            k("description"),
            k("scalarType"),
        ]
        .contains(key)
            && !(key == &k("extensions") && matches!(value,Value::Object(m)if m.is_empty()))
        {
            push_loss_units(
                &mut residuals,
                pointer_child(&path, key, ctx)?,
                value,
                "Field metadata is retained but not projected",
                "unknown",
                ctx,
            )?;
        }
    }
    let mut fields = vec![
        (
            k("name"),
            copy_json(
                get(&request, "fieldName").ok_or_else(|| {
                    err(
                        "FIELD_AVRO_REQUEST",
                        "fieldName is required",
                        "/request/fieldName",
                    )
                })?,
                ctx,
            )?,
        ),
        (
            k("type"),
            carrier(&text_owned(get(&request, "nativeType")).unwrap_or_default()),
        ),
    ];
    if let Some(doc) = get(element, "description") {
        fields.push((k("doc"), copy_json(doc, ctx)?));
    }
    let mut schema_fields = vec![
        (k("type"), s("record")),
        (
            k("name"),
            copy_json(
                get(&request, "recordName").ok_or_else(|| {
                    err(
                        "FIELD_AVRO_REQUEST",
                        "recordName is required",
                        "/request/recordName",
                    )
                })?,
                ctx,
            )?,
        ),
    ];
    schema_fields.push((
        k("namespace"),
        copy_json(get(&request, "namespace").unwrap_or(&Value::Null), ctx)?,
    ));
    schema_fields.push((k("fields"), Value::Array(vec![Value::Object(fields)])));
    let request_id = get(&request, "id")
        .ok_or_else(|| err("FIELD_AVRO_REQUEST", "id must be a string", "/request/id"))?;
    let request_id = text(Some(request_id))
        .ok_or_else(|| err("FIELD_AVRO_REQUEST", "id must be a string", "/request/id"))?;
    let target = import_schema(&Value::Object(schema_fields), request_id, ctx)?;
    if let Some(scalar) = get(element, "scalarType") {
        let actual = if let Some(actual) = field_scalar(&target, 0) {
            copy_json(actual, ctx)?
        } else {
            Value::Null
        };
        if !same(scalar, &actual, ctx)? {
            field_loss!(
                &mut residuals,
                format!("{path}/scalarType"),
                scalar,
                "Explicit native type does not establish the stated scalar family",
                "not-expressible",
            )?;
        }
    }
    if residuals
        .iter()
        .any(|r| text_owned(get(r, "outcome")).as_deref() == Some("not-expressible"))
    {
        mapping_outcome = "not-expressible";
    } else if !residuals.is_empty() {
        mapping_outcome = "unknown";
    }
    let blocked = text_owned(get(
        get(&author, "provenance").unwrap_or(&Value::Null),
        "kind",
    ))
    .as_deref()
        != Some("field")
        || (text_owned(get(&request, "mode")).as_deref() == Some("strict")
            && !residuals.is_empty());
    let mut output = vec![
        (k("operation"), s("project-field-avro")),
        (k("version"), s("1.0.0")),
        (
            k("status"),
            s(if blocked { "blocked" } else { "projected" }),
        ),
        (k("source"), source),
        (k("author"), author),
        (k("request"), request),
        (
            k("binding"),
            obj(vec![
                ("id", s("umf.core.field.avro")),
                ("version", s("1.0.0")),
                ("nativeVersion", s("1.12.0")),
                ("subset", s(FIELD_SUBSET)),
            ]),
        ),
        (
            k("mapping"),
            obj(vec![
                ("origin", s("authored")),
                (
                    "idealPath",
                    Value::String(Utf16::from(format!("{path}/kind"))),
                ),
                ("nativePath", s("/fields/0")),
                ("outcome", s(mapping_outcome)),
            ]),
        ),
    ];
    if !blocked {
        output.push((k("target"), target));
    }
    let mut diagnostics = Vec::new();
    for residual in &residuals {
        diagnostics.push(diag(residual, blocked, "FIELD_MEANING_NOT_PROJECTED", ctx)?);
    }
    output.push((k("residuals"), Value::Array(residuals)));
    output.push((k("diagnostics"), Value::Array(diagnostics)));
    let result = Value::Object(output);
    validate(&result_schema, &result, "FIELD_AVRO_RESULT", ctx)?;
    Ok(result)
}

pub fn recover_field(
    receipt_input: &Value,
    native_text: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let receipt = copy_json(receipt_input, ctx)?;
    let rt = runtime(ctx)?;
    let (result_schema, _) = schemas(&rt, true, ctx)?;
    validate(&result_schema, &receipt, "FIELD_AVRO_RECEIPT", ctx)?;
    if text_owned(get(&receipt, "status")).as_deref() != Some("projected") {
        return Err(err(
            "FIELD_AVRO_RECEIPT",
            "Expected projected receipt",
            "/receipt",
        ));
    }
    let expected = project_field(
        get(&receipt, "author").unwrap_or(&Value::Null),
        get(&receipt, "request").unwrap_or(&Value::Null),
        ctx,
    )?;
    if !same(&receipt, &expected, ctx)? {
        return Err(err(
            "FIELD_AVRO_RECEIPT",
            "Receipt does not match retained source and binding",
            "/receipt",
        ));
    }
    let exported = export_schema(
        get(&receipt, "target")
            .ok_or_else(|| err("FIELD_AVRO_RECEIPT", "Target required", "/receipt/target"))?,
        ctx,
    )?;
    if !matches!(native_text,Value::String(current) if current==&exported) {
        return Err(err(
            "FIELD_AVRO_STALE",
            "Native target changed; retained report cannot assert recovery",
            "/nativeText",
        ));
    }
    copy_json(
        get(&receipt, "source")
            .ok_or_else(|| err("FIELD_AVRO_RECEIPT", "Source required", "/receipt/source"))?,
        ctx,
    )
}

pub fn project_record(
    author_input: &Value,
    request_input: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(ctx)?;
    let author_copy = copy_json(author_input, ctx)?;
    let request = copy_json(request_input, ctx)?;
    let mut caps = NoCapabilities;
    let author = crate::core_kind::verify_core_kind_declaration(
        &author_copy,
        get(&author_copy, "target")
            .ok_or_else(|| err("RECORD_AVRO_AUTHOR", "Target required", "/author/target"))?,
        &rt.engine,
        &rt.registry,
        &mut caps,
        ctx,
    )?;
    let source = copy_json(
        get(&author, "target")
            .ok_or_else(|| err("RECORD_AVRO_AUTHOR", "Target missing", "/author/target"))?,
        ctx,
    )?;
    let (result_schema, request_schema) = schemas(&rt, false, ctx)?;
    validate(&request_schema, &request, "RECORD_AVRO_REQUEST", ctx)?;
    let selected = locate(
        &source,
        get(&author, "identity").ok_or_else(|| {
            err(
                "RECORD_AVRO_AUTHOR",
                "Identity required",
                "/author/identity",
            )
        })?,
        "RECORD_AVRO_IDENTITY",
        "/author/identity",
        ctx,
    )?;
    let record = selected.2;
    let path = selected.3;
    let mut residuals = Vec::new();
    let mut diagnostics = Vec::new();
    let mut mappings = Vec::new();
    let mut hard = false;
    let record_kind = text_owned(get(
        get(&author, "provenance").unwrap_or(&Value::Null),
        "kind",
    ))
    .unwrap_or_default();
    macro_rules! record_loss {
        ($residuals:expr, $diagnostics:expr, $path:expr, $value:expr, $reason:expr, $unexpressible:expr, $fatal:expr $(,)?) => {{
            hard |= $fatal;
            let outcome = if $unexpressible {
                "not-expressible"
            } else {
                "unknown"
            };
            push_loss($residuals, $path, $value, $reason, outcome, ctx)?;
            let residual = $residuals
                .last()
                .ok_or_else(|| err("RECORD_AVRO_RECEIPT", "Residual was not recorded", ""))?;
            $diagnostics.push(diag(
                residual,
                $fatal || text_owned(get(&request, "mode")).as_deref() == Some("strict"),
                if $fatal {
                    "RECORD_BINDING_CONFLICT"
                } else {
                    "RECORD_MEANING_NOT_PROJECTED"
                },
                ctx,
            )?);
            Ok::<(), EngineError>(())
        }};
    }
    macro_rules! record_loss_units {
        ($path:expr, $value:expr, $reason:expr, $outcome:expr, $fatal:expr $(,)?) => {{
            hard |= $fatal;
            push_loss_units(&mut residuals, $path, $value, $reason, $outcome, ctx)?;
            let residual = residuals
                .last()
                .ok_or_else(|| err("RECORD_AVRO_RECEIPT", "Residual was not recorded", ""))?;
            diagnostics.push(diag(
                residual,
                $fatal || text_owned(get(&request, "mode")).as_deref() == Some("strict"),
                if $fatal {
                    "RECORD_BINDING_CONFLICT"
                } else {
                    "RECORD_MEANING_NOT_PROJECTED"
                },
                ctx,
            )?);
            Ok::<(), EngineError>(())
        }};
    }
    if record_kind != "record" {
        record_loss!(
            &mut residuals,
            &mut diagnostics,
            format!("{path}/kind"),
            get(record, "kind").unwrap_or(&Value::Null),
            "Only an authored record can define the native record",
            true,
            true,
        )?;
    }
    if let Some(name) = get(record, "name") {
        if !same(
            name,
            get(&request, "recordName").unwrap_or(&Value::Null),
            ctx,
        )? {
            record_loss!(
                &mut residuals,
                &mut diagnostics,
                format!("{path}/name"),
                name,
                "Native record name differs from ideal name",
                true,
                false,
            )?;
        }
    }
    let mut members: Vec<Value> = Vec::new();
    for (i, reference) in array(get(record, "references")).iter().enumerate() {
        ctx.charge_work(1, k("/references"))?;
        if text_owned(get(reference, "role")).as_deref() != Some("member") {
            record_loss!(
                &mut residuals,
                &mut diagnostics,
                format!("{path}/references/{i}"),
                reference,
                "Non-member relationship is retained but not projected",
                false,
                false,
            )?;
            continue;
        }
        let mut duplicate = false;
        for existing in &members {
            if identity(existing, reference, ctx)? {
                duplicate = true;
                break;
            }
        }
        if duplicate {
            record_loss!(
                &mut residuals,
                &mut diagnostics,
                format!("{path}/references/{i}"),
                reference,
                "Duplicate record member",
                true,
                true,
            )?;
        } else {
            members.push(copy_json(reference, ctx)?);
        }
        for (key, value) in match reference {
            Value::Object(m) => m.as_slice(),
            _ => &[],
        } {
            if ![k("role"), k("module"), k("element")].contains(key) {
                record_loss_units!(
                    pointer_child(&format!("{path}/references/{i}"), key, ctx)?,
                    value,
                    "Reference metadata is not projected",
                    "unknown",
                    false
                )?;
            }
        }
    }
    let request_fields = array(get(&request, "fields"));
    let mut bindings: Vec<(Value, Value)> = Vec::new();
    let mut names: Vec<Utf16> = Vec::new();
    for field in request_fields {
        ctx.charge_work(1, k("/request/fields"))?;
        let declaration = get(field, "author").ok_or_else(|| {
            err(
                "RECORD_AVRO_AUTHOR",
                "Field author required",
                "/request/fields/author",
            )
        })?;
        let verified = core_kind::verify_core_kind_declaration(
            declaration,
            &source,
            &rt.engine,
            &rt.registry,
            &mut caps,
            ctx,
        )?;
        let identity_value = copy_json(
            get(&verified, "identity").ok_or_else(|| {
                err(
                    "RECORD_AVRO_AUTHOR",
                    "Identity missing",
                    "/request/fields/author/identity",
                )
            })?,
            ctx,
        )?;
        let mut member = false;
        for m in &members {
            if identity(m, &identity_value, ctx)? {
                member = true;
                break;
            }
        }
        let mut duplicate = false;
        for (existing, _) in &bindings {
            if identity(existing, &identity_value, ctx)? {
                duplicate = true;
                break;
            }
        }
        if duplicate || !member {
            record_loss!(
                &mut residuals,
                &mut diagnostics,
                text_owned(get(
                    get(&verified, "provenance").unwrap_or(&Value::Null),
                    "idealPath",
                ))
                .unwrap_or_default(),
                field,
                "Duplicate or non-member native binding",
                true,
                true,
            )?;
        } else {
            bindings.push((copy_json(&identity_value, ctx)?, copy_json(field, ctx)?));
        }
        let field_name = text(get(field, "fieldName")).ok_or_else(|| {
            err(
                "RECORD_AVRO_REQUEST",
                "fieldName must be a string",
                "/request/fields/fieldName",
            )
        })?;
        if names.iter().any(|n| n == field_name) {
            record_loss!(
                &mut residuals,
                &mut diagnostics,
                text_owned(get(
                    get(&verified, "provenance").unwrap_or(&Value::Null),
                    "idealPath",
                ))
                .unwrap_or_default(),
                get(field, "fieldName").ok_or_else(|| err(
                    "RECORD_AVRO_REQUEST",
                    "fieldName is required",
                    "/request/fields/fieldName"
                ))?,
                "Native field names collide",
                true,
                true,
            )?;
        } else {
            ctx.charge_text(field_name.len(), k("/request/fields/fieldName"))?;
            names.push(field_name.clone());
        }
    }
    let mut columns = Vec::new();
    let mut locations = Vec::new();
    let mut included = Vec::new();
    let mut column_index = 0usize;
    for (i, member) in members.iter().enumerate() {
        let found = locate(
            &source,
            member,
            "RECORD_AVRO_IDENTITY",
            "/author/target",
            ctx,
        )?;
        let mut field_binding = None;
        for (id, candidate) in &bindings {
            if identity(id, member, ctx)? {
                field_binding = Some(candidate);
                break;
            }
        }
        ctx.charge_text(found.3.encode_utf16().count(), k("/source"))?;
        included.push(found.3.clone());
        let Some(field_binding) = field_binding else {
            record_loss!(
                &mut residuals,
                &mut diagnostics,
                found.3.clone(),
                found.2,
                "Missing explicit member binding",
                true,
                true,
            )?;
            continue;
        };
        let field_author = get(field_binding, "author").ok_or_else(|| {
            err(
                "RECORD_AVRO_AUTHOR",
                "Field author missing",
                "/request/fields/author",
            )
        })?;
        if text_owned(get(
            get(&field_author, "provenance").unwrap_or(&Value::Null),
            "kind",
        ))
        .as_deref()
            != Some("field")
        {
            record_loss!(
                &mut residuals,
                &mut diagnostics,
                format!("{}/kind", found.3),
                get(found.2, "kind").unwrap_or(&Value::Null),
                "Record member is not an authored field",
                true,
                true,
            )?;
        }
        if let Some(name) = get(found.2, "name") {
            if !same(
                name,
                get(field_binding, "fieldName").unwrap_or(&Value::Null),
                ctx,
            )? {
                record_loss!(
                    &mut residuals,
                    &mut diagnostics,
                    format!("{}/name", found.3),
                    name,
                    "Native field name differs from ideal name",
                    true,
                    false,
                )?;
            }
        }
        mappings.push(obj(vec![
            ("origin", s("authored")),
            ("kind", s("field")),
            (
                "idealPath",
                Value::String(Utf16::from(format!("{}/kind", found.3))),
            ),
            (
                "nativePath",
                Value::String(Utf16::from(format!("/fields/{column_index}"))),
            ),
            ("outcome", s("exact")),
        ]));
        let mut f = vec![
            (
                k("name"),
                copy_json(
                    get(field_binding, "fieldName").ok_or_else(|| {
                        err(
                            "RECORD_AVRO_REQUEST",
                            "fieldName missing",
                            "/request/fields/fieldName",
                        )
                    })?,
                    ctx,
                )?,
            ),
            (
                k("type"),
                carrier(&text_owned(get(field_binding, "nativeType")).unwrap_or_default()),
            ),
        ];
        if let Some(doc) = get(found.2, "description") {
            f.push((k("doc"), copy_json(doc, ctx)?));
        }
        columns.push(Value::Object(f));
        locations.push((
            found.3,
            copy_json(get(found.2, "scalarType").unwrap_or(&Value::Null), ctx)?,
        ));
        column_index += 1;
        let _ = i;
    }
    for (key, value) in match &source {
        Value::Object(m) => m.as_slice(),
        _ => &[],
    } {
        if ![k("umf"), k("id"), k("modules"), k("vocabularies")].contains(key) {
            record_loss_units!(
                pointer_child("", key, ctx)?,
                value,
                "Document metadata is not projected",
                "unknown",
                false
            )?;
        }
    }
    if let Some(v) = get(&source, "vocabularies") {
        if !matches!(v,Value::Object(m)if m.is_empty()) {
            record_loss!(
                &mut residuals,
                &mut diagnostics,
                "/vocabularies".into(),
                v,
                "Native vocabulary semantics are not projected",
                false,
                false,
            )?;
        }
    }
    for (mi, module) in array(get(&source, "modules")).iter().enumerate() {
        let root = format!("/modules/{mi}");
        let module_has = included
            .iter()
            .any(|p| p.starts_with(&format!("{root}/elements/")))
            || mi == selected.0;
        if !module_has {
            record_loss!(
                &mut residuals,
                &mut diagnostics,
                root,
                module,
                "Module lies outside projected record",
                false,
                false,
            )?;
            continue;
        }
        if let Some(Value::String(ns)) = get(module, "namespace") {
            if !ns.is_empty() && !matches!(get(&request,"namespace"),Some(Value::String(b))if ns==b)
            {
                let namespace_value = copy_json(
                    get(module, "namespace")
                        .ok_or_else(|| err("RECORD_AVRO_SOURCE", "Namespace disappeared", ""))?,
                    ctx,
                )?;
                record_loss!(
                    &mut residuals,
                    &mut diagnostics,
                    format!("{root}/namespace"),
                    &namespace_value,
                    "Native namespace differs from ideal namespace",
                    true,
                    false,
                )?;
            }
        }
        for (key, value) in match module {
            Value::Object(m) => m.as_slice(),
            _ => &[],
        } {
            if ![k("id"), k("namespace"), k("elements")].contains(key) {
                record_loss_units!(
                    pointer_child(&root, key, ctx)?,
                    value,
                    "Module metadata is not projected",
                    "unknown",
                    false
                )?;
            }
        }
        for (ei, element) in array(get(module, "elements")).iter().enumerate() {
            let ep = format!("{root}/elements/{ei}");
            if ep == path || included.contains(&ep) {
                let known = if ep == path {
                    ["id", "kind", "name", "description", "references"].as_slice()
                } else {
                    ["id", "kind", "name", "description", "scalarType"].as_slice()
                };
                for (key, value) in match element {
                    Value::Object(m) => m.as_slice(),
                    _ => &[],
                } {
                    if !known.iter().any(|name| key == &k(name))
                        && !(key == &k("extensions")
                            && matches!(value,Value::Object(m)if m.is_empty()))
                    {
                        record_loss_units!(
                            pointer_child(&ep, key, ctx)?,
                            value,
                            "Element metadata is not projected",
                            "unknown",
                            false
                        )?;
                    }
                }
            } else {
                record_loss!(
                    &mut residuals,
                    &mut diagnostics,
                    ep,
                    element,
                    "Element lies outside projected record",
                    false,
                    false,
                )?;
            }
        }
    }
    let mut target = None;
    if !hard {
        let mut root = vec![
            (k("type"), s("record")),
            (
                k("name"),
                copy_json(
                    get(&request, "recordName").ok_or_else(|| {
                        err(
                            "RECORD_AVRO_REQUEST",
                            "recordName is required",
                            "/request/recordName",
                        )
                    })?,
                    ctx,
                )?,
            ),
        ];
        root.push((
            k("namespace"),
            copy_json(get(&request, "namespace").unwrap_or(&Value::Null), ctx)?,
        ));
        if let Some(doc) = get(record, "description") {
            root.push((k("doc"), copy_json(doc, ctx)?));
        }
        root.push((k("fields"), Value::Array(columns)));
        let request_id = get(&request, "id")
            .ok_or_else(|| err("RECORD_AVRO_REQUEST", "id must be a string", "/request/id"))?;
        let request_id = text(Some(request_id))
            .ok_or_else(|| err("RECORD_AVRO_REQUEST", "id must be a string", "/request/id"))?;
        let imported = import_schema(&Value::Object(root), request_id, ctx)?;
        for (index, (path, scalar)) in locations.iter().enumerate() {
            if !matches!(scalar, Value::Null) {
                let actual = if let Some(actual) = field_scalar(&imported, index) {
                    copy_json(actual, ctx)?
                } else {
                    Value::Null
                };
                if !same(scalar, &actual, ctx)? {
                    record_loss!(
                        &mut residuals,
                        &mut diagnostics,
                        format!("{path}/scalarType"),
                        scalar,
                        "Native type does not establish ideal scalar family",
                        true,
                        false,
                    )?;
                }
            }
        }
        target = Some(imported);
    }
    for mapping in &mut mappings {
        if let Some(ideal) = text_owned(get(mapping, "idealPath")) {
            let prefix = ideal.strip_suffix("/kind").unwrap_or(&ideal);
            if residuals.iter().any(|r| {
                text_owned(get(r, "path")).is_some_and(|p| p.starts_with(&format!("{prefix}/")))
            }) {
                if let Value::Object(m) = mapping {
                    if let Some((_, v)) = m.iter_mut().find(|(name, _)| name == &k("outcome")) {
                        *v = s("unknown");
                    }
                }
            }
        }
    }
    let record_outcome = if residuals.is_empty() {
        "exact"
    } else {
        "unknown"
    };
    mappings.insert(
        0,
        obj(vec![
            ("origin", s("authored")),
            ("kind", s("record")),
            (
                "idealPath",
                Value::String(Utf16::from(format!("{path}/kind"))),
            ),
            ("nativePath", s("")),
            ("outcome", s(record_outcome)),
        ]),
    );
    let blocked = hard
        || (text_owned(get(&request, "mode")).as_deref() == Some("strict")
            && !residuals.is_empty());
    let mut output = vec![
        (k("operation"), s("project-record-avro")),
        (k("version"), s("1.0.0")),
        (
            k("status"),
            s(if blocked { "blocked" } else { "projected" }),
        ),
        (k("source"), source),
        (k("author"), author),
        (k("request"), request),
        (
            k("binding"),
            obj(vec![
                ("id", s("umf.core.record.avro")),
                ("version", s("1.0.0")),
                ("nativeVersion", s("1.12.0")),
                ("subset", s(RECORD_SUBSET)),
            ]),
        ),
    ];
    if !blocked {
        output.push((k("target"), target.unwrap_or(Value::Null)));
    }
    output.push((k("mappings"), Value::Array(mappings)));
    output.push((k("residuals"), Value::Array(residuals)));
    output.push((k("diagnostics"), Value::Array(diagnostics)));
    let result = Value::Object(output);
    validate(&result_schema, &result, "RECORD_AVRO_RESULT", ctx)?;
    Ok(result)
}

pub fn recover_record(
    receipt_input: &Value,
    native_text: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let receipt = copy_json(receipt_input, ctx)?;
    let rt = runtime(ctx)?;
    let (result_schema, _) = schemas(&rt, false, ctx)?;
    validate(&result_schema, &receipt, "RECORD_AVRO_RECEIPT", ctx)?;
    if text_owned(get(&receipt, "status")).as_deref() != Some("projected") {
        return Err(err(
            "RECORD_AVRO_RECEIPT",
            "Expected complete projection receipt",
            "/receipt",
        ));
    }
    let expected = project_record(
        get(&receipt, "author").unwrap_or(&Value::Null),
        get(&receipt, "request").unwrap_or(&Value::Null),
        ctx,
    )?;
    if !same(&receipt, &expected, ctx)? {
        return Err(err(
            "RECORD_AVRO_RECEIPT",
            "Receipt differs from recomputed projection",
            "/receipt",
        ));
    }
    let exported = export_schema(
        get(&receipt, "target")
            .ok_or_else(|| err("RECORD_AVRO_RECEIPT", "Target required", "/receipt/target"))?,
        ctx,
    )?;
    if !matches!(native_text,Value::String(current) if current==&exported) {
        return Err(err(
            "RECORD_AVRO_STALE",
            "Native target changed",
            "/nativeText",
        ));
    }
    copy_json(
        get(&receipt, "source")
            .ok_or_else(|| err("RECORD_AVRO_RECEIPT", "Source required", "/receipt/source"))?,
        ctx,
    )
}
