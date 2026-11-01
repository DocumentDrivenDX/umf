// SPDX-License-Identifier: MIT OR Apache-2.0
//! Loss-aware observation of Avro record declarations. Native archive bytes
//! remain authoritative; no authored relationship is inferred from a Record shape.
use crate::{
    avro_document::{self, AvroDependencySource},
    context::Context,
    error::EngineError,
    native_json::NativeJsonNode,
    schema::{CompiledSchema, SchemaResources},
    serialization::{self, Format},
    value::{copy_json, Utf16, Value},
};

const RESULT_SCHEMA: &str =
    include_str!("../../../spec/core/avro-relationship-classification.schema.json");
const CORE_SCHEMA: &str = include_str!("../../../spec/core/schema.json");
const EXTENSION: &str = "umf.avro.relationships";
const RECOVERY: &str = "Original native archive retained; no authored relationship inferred";

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
            "Value does not match the pinned Avro Relationship classification schema",
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

fn native_tagged(node: &NativeJsonNode, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    let mut fields = vec![(
        "kind",
        s(match node {
            NativeJsonNode::Null => "null",
            NativeJsonNode::Boolean(_) => "boolean",
            NativeJsonNode::String(_) => "string",
            NativeJsonNode::Number(_) => "number",
            NativeJsonNode::Array(_) => "array",
            NativeJsonNode::Object(_) => "object",
        }),
    )];
    match node {
        NativeJsonNode::Null => {}
        NativeJsonNode::Boolean(value) => fields.push(("value", Value::Bool(*value))),
        NativeJsonNode::String(value) => fields.push(("value", Value::String(value.clone()))),
        NativeJsonNode::Number(value) => fields.push(("value", s(value))),
        NativeJsonNode::Array(items) => {
            fields.push((
                "items",
                Value::Array(
                    items
                        .iter()
                        .map(|item| native_tagged(item, ctx))
                        .collect::<Result<_, _>>()?,
                ),
            ));
        }
        NativeJsonNode::Object(members) => {
            let mut values = Vec::with_capacity(members.len());
            for (key, value) in members {
                ctx.charge_work(key.len().saturating_add(1), Utf16::default())?;
                values.push((key.clone(), native_tagged(value, ctx)?));
            }
            fields.push(("members", Value::Object(values)));
        }
    }
    Ok(obj(fields))
}

fn observe(
    node: &NativeJsonNode,
    path: &str,
    kind: &str,
    observations: &mut Vec<Value>,
    residuals: &mut Vec<Value>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let native_node = native_tagged(node, ctx)?;
    observations.push(obj(vec![
        ("nativePath", s(path)),
        ("kind", s(kind)),
        ("nativeNode", copy_json(&native_node, ctx)?),
        ("nameResolution", s("unverified")),
        ("enforcement", s("not-expressible")),
        ("authorIntent", s("unknown")),
        ("provenance", s("inferred")),
        ("scope", s("schema-structure")),
    ]));
    residuals.push(obj(vec![
        ("path", s(path)),
        ("value", native_node),
        ("outcome", s("not-expressible")),
        ("reason", s(&format!("Native {kind} structure does not establish an authored association; name resolution, Record/Key identity and participation remain unverified"))),
        ("recovery", s(RECOVERY)),
    ]));
    Ok(())
}

fn walk(
    node: &NativeJsonNode,
    path: &str,
    observations: &mut Vec<Value>,
    residuals: &mut Vec<Value>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    ctx.charge_work(1, k(path))?;
    match node {
        NativeJsonNode::String(value) => {
            if ![
                "null", "boolean", "int", "long", "float", "double", "bytes", "string",
            ]
            .iter()
            .any(|primitive| value == &k(primitive))
            {
                observe(node, path, "named-type-token", observations, residuals, ctx)?;
            }
        }
        NativeJsonNode::Array(items) => {
            observe(node, path, "union", observations, residuals, ctx)?;
            for (index, item) in items.iter().enumerate() {
                walk(
                    item,
                    &ptr(path, &index.to_string()),
                    observations,
                    residuals,
                    ctx,
                )?;
            }
        }
        NativeJsonNode::Object(_) => {
            let kind = native_text(member(node, "type"));
            match kind.as_ref() {
                Some(value) if value == &Utf16::from("record") => {
                    observe(node, path, "record", observations, residuals, ctx)?;
                    if let Some(NativeJsonNode::Array(fields)) = member(node, "fields") {
                        for (index, field) in fields.iter().enumerate() {
                            if let Some(field_type) = member(field, "type") {
                                walk(
                                    field_type,
                                    &ptr(path, &format!("fields/{index}/type")),
                                    observations,
                                    residuals,
                                    ctx,
                                )?;
                            }
                        }
                    }
                }
                Some(value) if value == &Utf16::from("array") => {
                    observe(node, path, "array", observations, residuals, ctx)?;
                    if let Some(items) = member(node, "items") {
                        walk(items, &ptr(path, "items"), observations, residuals, ctx)?;
                    }
                }
                Some(value) if value == &Utf16::from("map") => {
                    observe(node, path, "map", observations, residuals, ctx)?;
                    if let Some(values) = member(node, "values") {
                        walk(values, &ptr(path, "values"), observations, residuals, ctx)?;
                    }
                }
                Some(value)
                    if ![
                        "null", "boolean", "int", "long", "float", "double", "bytes", "string",
                        "enum", "fixed",
                    ]
                    .iter()
                    .any(|primitive| value == &Utf16::from(*primitive)) =>
                {
                    if let Some(type_node) = member(node, "type") {
                        walk(type_node, &ptr(path, "type"), observations, residuals, ctx)?;
                    }
                }
                _ => {
                    if let Some(type_node) = member(node, "type") {
                        if !matches!(type_node, NativeJsonNode::String(_)) {
                            walk(type_node, &ptr(path, "type"), observations, residuals, ctx)?;
                        }
                    }
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
            "AVRO_RELATIONSHIP_REQUEST",
            "nativeSource is required",
            "/nativeSource",
        )
    })?;
    let schema = text(get(native, "schema")).ok_or_else(|| {
        err(
            "AVRO_RELATIONSHIP_REQUEST",
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
                    "AVRO_RELATIONSHIP_REQUEST",
                    "Dependency ID is required",
                    "/nativeSource/dependencies",
                )
            })?);
            let dependency_schema = text(get(dependency, "schema")).ok_or_else(|| {
                err(
                    "AVRO_RELATIONSHIP_REQUEST",
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
        .ok_or_else(|| err("AVRO_RELATIONSHIP_SOURCE", "Document ID is required", "/id"))?;
    let imported = avro_document::import_schema(&id, &schema_bytes, &dependencies, ctx)?;
    let actual = avro_document::export_bundle(source, ctx)?;
    let expected = avro_document::export_bundle(&imported, ctx)?;
    if actual.schema_json != expected.schema_json || actual.dependencies != expected.dependencies {
        return Err(err(
            "AVRO_RELATIONSHIP_SOURCE",
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
    .ok_or_else(|| {
        err(
            "AVRO_RELATIONSHIP_SCHEMA",
            "Request schema is unavailable",
            "",
        )
    })?;
    validate(&request, request_schema, ctx, "AVRO_RELATIONSHIP_REQUEST")?;
    if text(get(&source, "umf")).as_ref() != Some(&Utf16::from("0.10.0")) {
        return Err(err(
            "AVRO_RELATIONSHIP_SOURCE",
            "Valid current core 0.10.0 source required",
            "/umf",
        ));
    }
    let _ = archive(&source, &request, ctx)?;
    let mut observations = Vec::new();
    let mut residuals = vec![obj(vec![
        ("path", s("/request/nativeSource")),
        ("value", copy_json(get(&request, "nativeSource").unwrap_or(&Value::Null), ctx)?),
        ("outcome", s("not-expressible")),
        ("reason", s("Avro schema structure does not establish authored associations, stable target Key resolution, referential enforcement or participation bounds. The complete original native archive remains attached")),
        ("recovery", s(RECOVERY)),
    ])];
    let root = avro_document::get_node(&source, &Utf16::default(), None, ctx)?;
    walk(
        root.root(),
        "/schema",
        &mut observations,
        &mut residuals,
        ctx,
    )?;
    if let Some(Value::Array(dependencies)) = get(
        get(&request, "nativeSource").unwrap_or(&Value::Null),
        "dependencies",
    ) {
        for (index, dependency) in dependencies.iter().enumerate() {
            let id = text(get(dependency, "id")).ok_or_else(|| {
                err(
                    "AVRO_RELATIONSHIP_REQUEST",
                    "Dependency ID is required",
                    "/nativeSource/dependencies",
                )
            })?;
            let tree = avro_document::get_node(&source, &Utf16::default(), Some(&id), ctx)?;
            walk(
                tree.root(),
                &format!("/dependencies/{index}/schema"),
                &mut observations,
                &mut residuals,
                ctx,
            )?;
        }
    }
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
        residuals.push(obj(vec![("path", s("/extensions/umf.avro.relationships")), ("value", copy_json(get(get(&target,"extensions").unwrap_or(&Value::Null),EXTENSION).unwrap(),ctx)?), ("outcome",s("not-expressible")), ("reason",s("Existing observations cannot be overwritten; reclassify the retained original source")), ("recovery",s(RECOVERY))]));
    }
    if unsupported {
        residuals.push(obj(vec![
            ("path", s("/vocabularies/umf.avro.relationships")),
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
    let binding = obj(vec![("id",s(EXTENSION)),("version",s("1.0.0")),("nativeVersion",s("1.12.0")),("subset",s("Structural observations informed by Apache Avro 1.12.0 and fastavro 1.12.2 discovery; no name resolution, native validity certification, authored association inference or native equivalence"))]);
    let diagnostics = residuals
        .iter()
        .map(|residual| {
            obj(vec![
                ("code", s("AVRO_RELATIONSHIP_LOSS")),
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
        ("operation", s("classify-avro-relationships")),
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
    validate(&output, &result_schema, ctx, "AVRO_RELATIONSHIP_RESULT")?;
    Ok(output)
}

pub fn classify_avro_relationships(
    source: &Value,
    request: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    classify_inner(source, request, ctx)
}
pub fn verify_avro_relationship_classification(
    receipt_input: &Value,
    current: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let receipt = copy_json(receipt_input, ctx)?;
    if text(get(&receipt, "status")).as_ref() != Some(&Utf16::from("classified")) {
        return Err(err(
            "AVRO_RELATIONSHIP_RECEIPT",
            "Expected complete successful classification",
            "/status",
        ));
    }
    let expected = classify_inner(
        get(&receipt, "source")
            .ok_or_else(|| err("AVRO_RELATIONSHIP_RECEIPT", "Source required", "/source"))?,
        get(&receipt, "request")
            .ok_or_else(|| err("AVRO_RELATIONSHIP_RECEIPT", "Request required", "/request"))?,
        ctx,
    )?;
    if !equal(&receipt, &expected, ctx)? {
        return Err(err(
            "AVRO_RELATIONSHIP_RECEIPT",
            "Classification differs from retained inputs",
            "",
        ));
    }
    if !equal(
        current,
        get(&receipt, "target").unwrap_or(&Value::Null),
        ctx,
    )? {
        return Err(err(
            "AVRO_RELATIONSHIP_STALE",
            "Current target differs",
            "/target",
        ));
    }
    Ok(receipt)
}
pub fn recover_avro_relationship_source(
    receipt: &Value,
    current: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let verified = verify_avro_relationship_classification(receipt, current, ctx)?;
    copy_json(
        get(
            get(&verified, "request").unwrap_or(&Value::Null),
            "nativeSource",
        )
        .ok_or_else(|| {
            err(
                "AVRO_RELATIONSHIP_RECEIPT",
                "Retained native archive required",
                "/request/nativeSource",
            )
        })?,
        ctx,
    )
}
