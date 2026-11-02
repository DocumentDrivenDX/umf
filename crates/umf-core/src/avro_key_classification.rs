// SPDX-License-Identifier: MIT OR Apache-2.0
//! Loss-aware observation of Avro record declarations. Native archive bytes
//! remain authoritative; no authored Key is inferred from a Record shape.
use crate::{
    avro_document::{self, AvroDependencySource},
    context::Context,
    error::EngineError,
    native_json::NativeJsonNode,
    schema::{CompiledSchema, SchemaResources},
    serialization::{self, Format},
    value::{copy_json, Utf16, Value},
};

const RESULT_SCHEMA: &str = include_str!("../../../spec/core/avro-key-classification.schema.json");
const CORE_SCHEMA: &str = include_str!("../../../spec/core/schema.json");
const EXTENSION: &str = "umf.avro.keys";
const RECOVERY: &str = "Original native archive retained; no authored key inferred";

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
    if let Value::Object(fields) = value {
        fields
            .iter()
            .find(|(key, _)| key == &k(name))
            .map(|(_, value)| value)
    } else {
        None
    }
}
fn set(value: &mut Value, name: &str, replacement: Value) {
    if let Value::Object(fields) = value {
        if let Some((_, old)) = fields.iter_mut().find(|(key, _)| key == &k(name)) {
            *old = replacement;
        } else {
            fields.push((k(name), replacement));
        }
    }
}
fn text(value: Option<&Value>) -> Option<Utf16> {
    if let Some(Value::String(value)) = value {
        Some(value.clone())
    } else {
        None
    }
}
fn err(code: &str, message: &str, path: &str) -> EngineError {
    EngineError::new(code, k(path), message)
}
fn parse(source: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    serialization::read_json_value(
        &source.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        ctx,
    )
}
fn validate(
    value: &Value,
    schema: &Value,
    ctx: &mut Context<'_>,
    code: &str,
) -> Result<(), EngineError> {
    let resources = SchemaResources {
        entries: vec![
            (
                k("urn:umf:core:semantic-type-reference:1.0.0"),
                parse(
                    include_str!("../../../spec/core/semantic-type-reference.schema.json"),
                    ctx,
                )?,
            ),
            (k("urn:umf:core:0.10.0"), parse(CORE_SCHEMA, ctx)?),
        ],
    };
    let compiled = CompiledSchema::compile(schema, &resources, ctx)?;
    if compiled.validate(value, ctx)?.is_empty() {
        Ok(())
    } else {
        Err(err(
            code,
            "Value does not match the pinned Avro Key classification schema",
            "",
        ))
    }
}
fn member<'a>(node: &'a NativeJsonNode, name: &str) -> Option<&'a NativeJsonNode> {
    if let NativeJsonNode::Object(fields) = node {
        fields
            .iter()
            .find(|(key, _)| key == &k(name))
            .map(|(_, value)| value)
    } else {
        None
    }
}
fn native_text(value: Option<&NativeJsonNode>) -> Option<Utf16> {
    if let Some(NativeJsonNode::String(value)) = value {
        Some(value.clone())
    } else {
        None
    }
}
fn ptr(path: &str, segment: &str) -> String {
    format!("{path}/{segment}")
}

fn walk(
    node: &NativeJsonNode,
    path: &str,
    observations: &mut Vec<Value>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    ctx.charge_work(1, k(path))?;
    match node {
        NativeJsonNode::Array(items) => {
            for (index, item) in items.iter().enumerate() {
                walk(item, &ptr(path, &index.to_string()), observations, ctx)?;
            }
        }
        NativeJsonNode::Object(_) => {
            let kind = native_text(member(node, "type"));
            if kind.as_ref().is_some_and(|value| value == &k("record")) {
                if let (Some(name), Some(NativeJsonNode::Array(fields))) =
                    (native_text(member(node, "name")), member(node, "fields"))
                {
                    let mut projected = Vec::new();
                    for (index, field) in fields.iter().enumerate() {
                        if let (Some(field_name), Some(field_type)) =
                            (native_text(member(field, "name")), member(field, "type"))
                        {
                            projected.push(obj(vec![
                                ("name", Value::String(field_name)),
                                ("nativePath", s(&ptr(path, &format!("fields/{index}")))),
                            ]));
                            walk(
                                field_type,
                                &ptr(path, &format!("fields/{index}/type")),
                                observations,
                                ctx,
                            )?;
                        }
                    }
                    observations.push(obj(vec![
                        ("nativePath", s(path)),
                        ("name", Value::String(name)),
                        ("fields", Value::Array(projected)),
                        ("enforcement", s("not-expressible")),
                        ("authorIntent", s("unknown")),
                        ("provenance", s("inferred")),
                        ("scope", s("schema-declaration")),
                    ]));
                }
            }
            for key in ["items", "values"] {
                if let Some(child) = member(node, key) {
                    walk(child, &ptr(path, key), observations, ctx)?;
                }
            }
            if let Some(child) = member(node, "type") {
                if !matches!(child, NativeJsonNode::String(_)) {
                    walk(child, &ptr(path, "type"), observations, ctx)?;
                }
            }
        }
        _ => {}
    }
    Ok(())
}

fn equal(a: &Value, b: &Value, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    let mut pending = vec![(a, b)];
    while let Some((left, right)) = pending.pop() {
        ctx.charge_work(1, Utf16::default())?;
        match (left, right) {
            (Value::Null, Value::Null) => {}
            (Value::Bool(a), Value::Bool(b)) if a == b => {}
            (Value::Number(a), Value::Number(b)) if a == b => {}
            (Value::String(a), Value::String(b)) if a == b => {}
            (Value::Array(a), Value::Array(b)) if a.len() == b.len() => {
                pending.extend(a.iter().zip(b))
            }
            (Value::Object(a), Value::Object(b)) if a.len() == b.len() => {
                for (key, value) in a {
                    ctx.charge_work(key.len().saturating_add(1), Utf16::default())?;
                    let Some((_, other)) = b.iter().find(|(candidate, _)| candidate == key) else {
                        return Ok(false);
                    };
                    pending.push((value, other));
                }
            }
            _ => return Ok(false),
        }
    }
    Ok(true)
}

fn archive(
    source: &Value,
    request: &Value,
    ctx: &mut Context<'_>,
) -> Result<(Value, Value), EngineError> {
    let native = get(request, "nativeSource").ok_or_else(|| {
        err(
            "AVRO_KEY_REQUEST",
            "nativeSource is required",
            "/nativeSource",
        )
    })?;
    let schema = text(get(native, "schema")).ok_or_else(|| {
        err(
            "AVRO_KEY_REQUEST",
            "Native schema text is required",
            "/nativeSource/schema",
        )
    })?;
    let schema_bytes = schema.units().to_vec();
    let mut ids = Vec::<Utf16>::new();
    let mut schemas = Vec::<Vec<u16>>::new();
    if let Some(Value::Array(dependencies)) = get(native, "dependencies") {
        for dependency in dependencies {
            ids.push(text(get(dependency, "id")).ok_or_else(|| {
                err(
                    "AVRO_KEY_REQUEST",
                    "Dependency ID is required",
                    "/nativeSource/dependencies",
                )
            })?);
            let dependency_schema = text(get(dependency, "schema")).ok_or_else(|| {
                err(
                    "AVRO_KEY_REQUEST",
                    "Dependency schema is required",
                    "/nativeSource/dependencies",
                )
            })?;
            schemas.push(dependency_schema.units().to_vec());
        }
    }
    let dependencies = ids
        .iter()
        .zip(&schemas)
        .map(|(id, schema_json)| AvroDependencySource { id, schema_json })
        .collect::<Vec<_>>();
    let id = text(get(source, "id"))
        .ok_or_else(|| err("AVRO_KEY_SOURCE", "Document ID is required", "/id"))?;
    let imported = avro_document::import_schema(&id, &schema_bytes, &dependencies, ctx)?;
    let actual = avro_document::export_bundle(source, ctx)?;
    let expected = avro_document::export_bundle(&imported, ctx)?;
    if actual.schema_json != expected.schema_json || actual.dependencies != expected.dependencies {
        return Err(err(
            "AVRO_KEY_SOURCE",
            "Retained native archive does not match the current representation",
            "/nativeSource",
        ));
    }
    Ok((copy_json(native, ctx)?, imported))
}

fn classify_inner(
    source_input: &Value,
    request_input: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let source = copy_json(source_input, ctx)?;
    let request = copy_json(request_input, ctx)?;
    let result_schema = parse(RESULT_SCHEMA, ctx)?;
    let request_schema = get(
        get(&result_schema, "properties").unwrap_or(&Value::Null),
        "request",
    )
    .ok_or_else(|| err("AVRO_KEY_SCHEMA", "Request schema is unavailable", ""))?;
    validate(&request, request_schema, ctx, "AVRO_KEY_REQUEST")?;
    if text(get(&source, "umf")).as_ref() != Some(&Utf16::from("0.10.0")) {
        return Err(err(
            "AVRO_KEY_SOURCE",
            "Valid current core 0.10.0 source required",
            "/umf",
        ));
    }
    let _ = archive(&source, &request, ctx)?;
    let mut observations = Vec::new();
    let root = avro_document::get_node(&source, &Utf16::default(), None, ctx)?;
    walk(root.root(), "/schema", &mut observations, ctx)?;
    if let Some(Value::Array(dependencies)) = get(
        get(&request, "nativeSource").unwrap_or(&Value::Null),
        "dependencies",
    ) {
        for (index, dependency) in dependencies.iter().enumerate() {
            let id = text(get(dependency, "id")).ok_or_else(|| {
                err(
                    "AVRO_KEY_REQUEST",
                    "Dependency ID is required",
                    "/nativeSource/dependencies",
                )
            })?;
            let tree = avro_document::get_node(&source, &Utf16::default(), Some(&id), ctx)?;
            walk(
                tree.root(),
                &format!("/dependencies/{index}/schema"),
                &mut observations,
                ctx,
            )?;
        }
    }
    let mut residuals = vec![obj(vec![
        ("path", s("/request/nativeSource")),
        ("value", copy_json(get(&request, "nativeSource").unwrap_or(&Value::Null), ctx)?),
        ("outcome", s("not-expressible")),
        ("reason", s("Avro schemas do not enforce collection uniqueness or establish authored key IDs, names, primary or alternate intent. Sort order, defaults, union branches, logical annotations and unknown metadata remain native")),
        ("recovery", s(RECOVERY)),
    ])];
    let mut target = copy_json(&source, ctx)?;
    let conflict = get(
        get(&target, "extensions").unwrap_or(&Value::Null),
        EXTENSION,
    )
    .is_some();
    let unsupported = get(
        get(&target, "vocabularies").unwrap_or(&Value::Null),
        EXTENSION,
    )
    .is_some_and(|v| text(get(v, "version")).as_ref() != Some(&Utf16::from("1.0.0")));
    if conflict {
        residuals.push(obj(vec![("path", s("/extensions/umf.avro.keys")), ("value", copy_json(get(get(&target,"extensions").unwrap_or(&Value::Null),EXTENSION).unwrap(),ctx)?), ("outcome",s("not-expressible")), ("reason",s("Existing observations cannot be overwritten; reclassify the retained original source")), ("recovery",s(RECOVERY))]));
    }
    if unsupported {
        residuals.push(obj(vec![
            ("path", s("/vocabularies/umf.avro.keys")),
            (
                "value",
                copy_json(
                    get(
                        get(&target, "vocabularies").unwrap_or(&Value::Null),
                        EXTENSION,
                    )
                    .unwrap(),
                    ctx,
                )?,
            ),
            ("outcome", s("not-expressible")),
            ("reason", s("Unsupported classification vocabulary")),
            ("recovery", s(RECOVERY)),
        ]));
    }
    let blocked = text(get(&request, "mode")).as_ref() == Some(&Utf16::from("strict"))
        || conflict
        || unsupported;
    if !blocked {
        let mut vocabularies = get(&target, "vocabularies")
            .map(|value| copy_json(value, ctx))
            .transpose()?
            .unwrap_or(obj(vec![]));
        set(
            &mut vocabularies,
            EXTENSION,
            obj(vec![("version", s("1.0.0"))]),
        );
        set(&mut target, "vocabularies", vocabularies);
        let mut extensions = get(&target, "extensions")
            .map(|value| copy_json(value, ctx))
            .transpose()?
            .unwrap_or(obj(vec![]));
        set(
            &mut extensions,
            EXTENSION,
            obj(vec![
                ("origin", s("classified")),
                (
                    "binding",
                    obj(vec![("id", s(EXTENSION)), ("version", s("1.0.0"))]),
                ),
                (
                    "nativeSource",
                    copy_json(get(&request, "nativeSource").unwrap_or(&Value::Null), ctx)?,
                ),
                ("observations", Value::Array(observations.clone())),
            ]),
        );
        set(&mut target, "extensions", extensions);
    }
    let binding = obj(vec![("id",s(EXTENSION)),("version",s("1.0.0")),("nativeVersion",s("1.12.0")),("subset",s("Schema declarations observed with Apache Avro 1.12.0 and fastavro 1.12.2; no collection uniqueness, authored identity inference or native equivalence"))]);
    let diagnostics = residuals
        .iter()
        .map(|residual| {
            obj(vec![
                ("code", s("AVRO_KEY_LOSS")),
                (
                    "path",
                    get(residual, "path").cloned().unwrap_or(Value::Null),
                ),
                (
                    "message",
                    get(residual, "reason").cloned().unwrap_or(Value::Null),
                ),
                ("severity", s(if blocked { "error" } else { "warning" })),
            ])
        })
        .collect();
    let mut output = obj(vec![
        ("operation", s("classify-avro-keys")),
        ("version", s("1.0.0")),
        ("status", s(if blocked { "blocked" } else { "classified" })),
        ("source", source),
        ("request", request),
        ("binding", binding),
        ("observations", Value::Array(observations)),
        ("residuals", Value::Array(residuals)),
        ("diagnostics", Value::Array(diagnostics)),
    ]);
    if !blocked {
        if let Value::Object(fields) = &mut output {
            fields.push((k("target"), target));
        }
    }
    validate(&output, &result_schema, ctx, "AVRO_KEY_RESULT")?;
    Ok(output)
}

pub fn classify_avro_keys(
    source: &Value,
    request: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    classify_inner(source, request, ctx)
}
pub fn verify_avro_key_classification(
    receipt_input: &Value,
    current: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let receipt = copy_json(receipt_input, ctx)?;
    if text(get(&receipt, "status")).as_ref() != Some(&Utf16::from("classified")) {
        return Err(err(
            "AVRO_KEY_RECEIPT",
            "Expected complete successful classification",
            "/status",
        ));
    }
    let expected = classify_inner(
        get(&receipt, "source")
            .ok_or_else(|| err("AVRO_KEY_RECEIPT", "Source required", "/source"))?,
        get(&receipt, "request")
            .ok_or_else(|| err("AVRO_KEY_RECEIPT", "Request required", "/request"))?,
        ctx,
    )?;
    if !equal(&receipt, &expected, ctx)? {
        return Err(err(
            "AVRO_KEY_RECEIPT",
            "Classification differs from retained inputs",
            "",
        ));
    }
    if !equal(
        current,
        get(&receipt, "target").unwrap_or(&Value::Null),
        ctx,
    )? {
        return Err(err("AVRO_KEY_STALE", "Current target differs", "/target"));
    }
    Ok(receipt)
}
pub fn recover_avro_key_source(
    receipt: &Value,
    current: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let verified = verify_avro_key_classification(receipt, current, ctx)?;
    copy_json(
        get(
            get(&verified, "request").unwrap_or(&Value::Null),
            "nativeSource",
        )
        .ok_or_else(|| {
            err(
                "AVRO_KEY_RECEIPT",
                "Retained native archive required",
                "/request/nativeSource",
            )
        })?,
        ctx,
    )
}
