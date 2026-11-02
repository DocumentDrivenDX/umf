// SPDX-License-Identifier: MIT OR Apache-2.0
//! Context-scoped Parquet definition-level availability classification.
use crate::{
    context::Context,
    engine::{Capabilities, Engine},
    error::EngineError,
    parquet_capture_inspection::{
        get_parquet_field_metadata, inspect_parquet_containers, inspect_parquet_schema,
    },
    parquet_document_capture::capture_parquet_document,
    parquet_record_type_candidate::SchemaElement,
    registry::Registry,
    schema::{CompiledSchema, SchemaResources},
    serialization::{self, Format},
    value::{copy_json, Utf16, Value},
};
use std::sync::{Arc, OnceLock};

pub const RESULT_SCHEMA: &str =
    include_str!("../../../spec/core/parquet-nullability-classification.schema.json");
const CORE_SCHEMA: &str = include_str!("../../../spec/core/schema.json");
const NULLABILITY_SCHEMA: &str =
    include_str!("../../../spec/core/nullability-operation-v5.schema.json");
const EXT: &str = "umf.parquet.nullability";
const RECOVERY: &str = "Retain the complete source and native archive; unknown native meaning is not replaced by the core label";
const BASIS: &str = "Physical definition-level availability in the selected context; repeated cardinality, writer inputs, Arrow metadata and logical refinements remain separate";

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
        Some(Value::String(s)) => Some(s),
        _ => None,
    }
}
fn array<'a>(v: &'a Value, k: &str) -> Option<&'a [Value]> {
    if let Value::Array(a) = get(v, k)? {
        Some(a)
    } else {
        None
    }
}
fn err(code: &str, path: &str, message: impl Into<String>) -> EngineError {
    EngineError::new(code, u(path), message.into())
}
fn read_json(source: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    serialization::read_json_value(
        &source.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        ctx,
    )
}
fn validate(
    v: &Value,
    s: &CompiledSchema,
    ctx: &mut Context<'_>,
    code: &str,
) -> Result<(), EngineError> {
    if s.validate(v, ctx)?.is_empty() {
        Ok(())
    } else {
        Err(err(
            code,
            "",
            "Value does not match the pinned Parquet nullability schema",
        ))
    }
}
struct Runtime {
    result: CompiledSchema,
    request: CompiledSchema,
}
fn runtime(ctx: &mut Context<'_>) -> Result<Arc<Runtime>, EngineError> {
    static CACHE: OnceLock<Arc<Runtime>> = OnceLock::new();
    if ctx.profile() == crate::context::ResourceProfile::Cooperative
        && ctx.limits() == crate::context::Limits::ordinary()
    {
        if let Some(v) = CACHE.get() {
            return Ok(Arc::clone(v));
        }
    }
    ctx.charge_work(1, u(""))?;
    let resources = SchemaResources {
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
                read_json(NULLABILITY_SCHEMA, ctx)?,
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
    let schema = read_json(RESULT_SCHEMA, ctx)?;
    let result = CompiledSchema::compile(&schema, &resources, ctx)?;
    let request = CompiledSchema::compile(
        get(
            get(&schema, "properties").unwrap_or(&Value::Null),
            "request",
        )
        .ok_or_else(|| err("SCHEMA", "", "request schema missing"))?,
        &resources,
        ctx,
    )?;
    let ready = Arc::new(Runtime { result, request });
    if ctx.profile() == crate::context::ResourceProfile::Cooperative
        && ctx.limits() == crate::context::Limits::ordinary()
    {
        return Ok(crate::resource_cache::publish_completed(&CACHE, ready));
    }
    Ok(ready)
}
fn same(a: &Value, b: &Value, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    fn canon(v: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
        match v {
            Value::Array(a) => Ok(Value::Array(
                a.iter().map(|x| canon(x, ctx)).collect::<Result<_, _>>()?,
            )),
            Value::Object(m) => {
                let mut o = m
                    .iter()
                    .map(|(k, v)| Ok((k.clone(), canon(v, ctx)?)))
                    .collect::<Result<Vec<_>, EngineError>>()?;
                o.sort_by(|a, b| a.0.cmp(&b.0));
                Ok(Value::Object(o))
            }
            _ => copy_json(v, ctx),
        }
    }
    Ok(canon(a, ctx)? == canon(b, ctx)?)
}
fn set(v: &mut Value, k: &str, value: Value) -> Result<(), EngineError> {
    let Value::Object(m) = v else {
        return Err(err("PARQUET_NULLABILITY_TARGET", "", "Expected object"));
    };
    if let Some((_, old)) = m.iter_mut().find(|(x, _)| x == &u(k)) {
        *old = value
    } else {
        m.push((u(k), value));
    }
    Ok(())
}
fn path_string(base: &str, index: usize) -> Value {
    t(&format!("{base}{index}"))
}
fn index(v: &Value) -> Option<usize> {
    match v {
        Value::Number(n)
            if n.is_finite() && *n >= 0.0 && n.fract() == 0.0 && *n <= 9_007_199_254_740_991.0 =>
        {
            Some(*n as usize)
        }
        _ => None,
    }
}
fn locate_ancestry(
    schema: &[SchemaElement],
    target: usize,
    ctx: &mut Context<'_>,
) -> Result<Vec<(usize, Utf16, usize, usize)>, EngineError> {
    fn walk(
        schema: &[SchemaElement],
        at: usize,
        target: usize,
        path: &[(usize, Utf16, usize, usize)],
        ctx: &mut Context<'_>,
    ) -> Result<Option<Vec<(usize, Utf16, usize, usize)>>, EngineError> {
        ctx.charge_work(1, u("/schema"))?;
        let item = schema.get(at).ok_or_else(|| {
            err(
                "PARQUET_NULLABILITY_PATH",
                "/schema",
                "Schema index is out of bounds",
            )
        })?;
        let repetition = u(repetition_name(
            &item.repetition.clone().unwrap_or_else(|| u("required")),
        )?);
        let path_cost = path.iter().fold(0usize, |cost, (_, repetition, _, _)| {
            cost.saturating_add(repetition.len().saturating_add(1))
        });
        ctx.charge_work(path_cost, u("/schema"))?;
        let mut next = path.to_vec();
        if at != 0 {
            let def = path.last().map(|x| x.2).unwrap_or(0)
                + if repetition == u("optional") || repetition == u("repeated") {
                    1
                } else {
                    0
                };
            let rep = path.last().map(|x| x.3).unwrap_or(0)
                + if repetition == u("repeated") { 1 } else { 0 };
            next.push((at, repetition, def, rep));
        }
        if at == target {
            return Ok(Some(next));
        }
        let count = item.num_children.unwrap_or(0);
        let mut child = at + 1;
        for _ in 0..count {
            if child >= schema.len() {
                return Err(err(
                    "PARQUET_NULLABILITY_SCHEMA",
                    "/schema",
                    "Schema child range is incomplete",
                ));
            }
            if let Some(found) = walk(schema, child, target, &next, ctx)? {
                return Ok(Some(found));
            }
            child = skip_subtree(schema, child, ctx)?;
        }
        Ok(None)
    }
    fn skip_subtree(
        schema: &[SchemaElement],
        root: usize,
        ctx: &mut Context<'_>,
    ) -> Result<usize, EngineError> {
        let mut end = root + 1;
        let mut stack = vec![schema.get(root).and_then(|x| x.num_children).unwrap_or(0)];
        while let Some(remaining) = stack.last_mut() {
            ctx.charge_work(1, u("/schema"))?;
            if *remaining == 0 {
                stack.pop();
                continue;
            }
            *remaining -= 1;
            if end >= schema.len() {
                return Err(err(
                    "PARQUET_NULLABILITY_SCHEMA",
                    "/schema",
                    "Schema child range is incomplete",
                ));
            }
            let n = schema[end].num_children.unwrap_or(0);
            end += 1;
            if n > 0 {
                stack.push(n);
            }
        }
        Ok(end)
    }
    if target == 0 {
        return Ok(Vec::new());
    }
    walk(schema, 0, target, &[], ctx)?.ok_or_else(|| {
        err(
            "PARQUET_NULLABILITY_PATH",
            "/schema",
            "Schema ancestry unavailable",
        )
    })
}
fn repetition_name(v: &Utf16) -> Result<&'static str, EngineError> {
    match v.to_utf8().ok().as_deref() {
        Some("required" | "REQUIRED" | "0") => Ok("required"),
        Some("optional" | "OPTIONAL" | "1") => Ok("optional"),
        Some("repeated" | "REPEATED" | "2") => Ok("repeated"),
        _ => Err(err(
            "PARQUET_NULLABILITY_SCHEMA",
            "/schema",
            "Unsupported repetition type",
        )),
    }
}
fn add_loss(
    residuals: &mut Vec<Value>,
    diagnostics: &mut Vec<Value>,
    path: Utf16,
    value: Value,
    reason: &str,
    blocked: bool,
) {
    residuals.push(obj(vec![
        ("path", Value::String(path.clone())),
        ("value", value),
        ("reason", t(reason)),
        ("recovery", t(RECOVERY)),
    ]));
    diagnostics.push(obj(vec![
        (
            "code",
            t(
                if path.units().starts_with(&u("/modules/").units().to_vec()) {
                    "PARQUET_NULLABILITY_CONFLICT"
                } else {
                    "PARQUET_NULLABILITY_UNRESOLVED"
                },
            ),
        ),
        ("path", Value::String(path)),
        ("message", t(reason)),
        ("severity", t(if blocked { "error" } else { "warning" })),
    ]));
}

pub fn classify_parquet_nullability(
    source: &Value,
    request: &Value,
    engine: &Engine,
    registry: &Registry,
    capabilities: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(ctx)?;
    validate(request, &rt.request, ctx, "PARQUET_NULLABILITY_REQUEST")?;
    let source = copy_json(source, ctx)?;
    let request = copy_json(request, ctx)?;
    let request_index = index(get(&request, "index").ok_or_else(|| {
        err(
            "PARQUET_NULLABILITY_REQUEST",
            "/index",
            "Schema index required",
        )
    })?)
    .ok_or_else(|| {
        err(
            "PARQUET_NULLABILITY_REQUEST",
            "/index",
            "Schema index must be a safe integer",
        )
    })?;
    let capture =
        capture_parquet_document(&source, request_index, engine, registry, capabilities, ctx)?;
    let physical = inspect_parquet_schema(&source, engine, registry, capabilities, ctx)?;
    let fields = get_parquet_field_metadata(&source, engine, registry, capabilities, ctx)?;
    let containers = inspect_parquet_containers(&source, engine, registry, capabilities, ctx)?;
    for (view, name) in [
        (&physical, "physical schema"),
        (&fields, "field metadata"),
        (&containers, "container topology"),
    ] {
        if text(view, "status") != Some(&u("checked")) {
            return Err(err(
                "PARQUET_NULLABILITY_SCHEMA",
                "",
                format!("Checked {name} required"),
            ));
        }
    }
    let ancestry_indices = locate_ancestry(&capture.schema, request_index, ctx)?;
    let field = array(&fields, "fields")
        .unwrap_or(&[])
        .iter()
        .find(|f| index(get(f, "index").unwrap_or(&Value::Null)) == Some(request_index))
        .ok_or_else(|| {
            err(
                "PARQUET_NULLABILITY_COLUMN",
                "/index",
                "Native schema member not found",
            )
        })?;
    let element = get(field, "element").ok_or_else(|| {
        err(
            "PARQUET_NULLABILITY_COLUMN",
            "",
            "Derived field element missing",
        )
    })?;
    let native_fragment = get(field, "nativeField").cloned().ok_or_else(|| {
        err(
            "PARQUET_NULLABILITY_COLUMN",
            "",
            "Native field fragment missing",
        )
    })?;
    let element_id = text(element, "id").cloned().ok_or_else(|| {
        err(
            "PARQUET_NULLABILITY_COLUMN",
            "",
            "Derived field identity missing",
        )
    })?;
    let modules = array(&source, "modules")
        .ok_or_else(|| err("PARQUET_NULLABILITY_SOURCE", "/modules", "Modules required"))?;
    let mi = modules
        .iter()
        .position(|m| text(m, "id") == Some(&u("parquet.fields")))
        .ok_or_else(|| {
            err(
                "PARQUET_NULLABILITY_COLUMN",
                "/modules",
                "Derived field module missing",
            )
        })?;
    let elements = array(&modules[mi], "elements").ok_or_else(|| {
        err(
            "PARQUET_NULLABILITY_COLUMN",
            "/elements",
            "Derived field elements missing",
        )
    })?;
    let ei = elements
        .iter()
        .position(|e| text(e, "id") == Some(&element_id))
        .ok_or_else(|| {
            err(
                "PARQUET_NULLABILITY_COLUMN",
                "/elements",
                "Derived column member missing",
            )
        })?;
    let selected = &elements[ei];
    let ideal_path = u(&format!("/modules/{mi}/elements/{ei}/nullability"));
    let native_path = u(&format!("/schema/{request_index}"));
    let ancestry = ancestry_indices
        .iter()
        .map(|(i, r, d, l)| {
            Ok(obj(vec![
                ("index", Value::Number(*i as f64)),
                ("repetition", t(repetition_name(r)?)),
                ("definitionLevel", Value::Number(*d as f64)),
                ("repetitionLevel", Value::Number(*l as f64)),
            ]))
        })
        .collect::<Result<Vec<_>, EngineError>>()?;
    let repeated = ancestry_indices
        .iter()
        .filter(|(_, r, _, _)| r == &u("repeated"))
        .map(|(i, _, _, _)| *i)
        .collect::<Vec<_>>();
    let has_type = get(&native_fragment, "type").is_some();
    let scope = text(&request, "scope");
    let carrier = text(&request, "carrier");
    let mut context_index = None;
    let mut absence_paths = Vec::new();
    let mut nullability = "unspecified";
    let mut interpretation = "unknown";
    let mut outcome = "unknown";
    let mut reason: Option<String> = None;
    if !has_type {
        reason = Some(
            "A group/container is not a physical leaf; choose a leaf with an explicit context"
                .into(),
        );
        interpretation = "unsupported";
    } else if carrier != Some(&u("definition-level")) {
        reason=Some("Explicit physical definition-level carrier required; Arrow masks and omitted inputs remain separate".into());
    } else if scope == Some(&u("row-leaf-value")) {
        if !repeated.is_empty() {
            reason=Some("A repeated path has no single scalar leaf value per row; select repeated-element context or retain a residual".into());
            interpretation = "unsupported";
        } else {
            context_index = Some(0);
        }
    } else if scope == Some(&u("repeated-element-value")) {
        if let Some(i) = repeated.last() {
            context_index = Some(*i)
        } else {
            reason = Some(
                "Repeated-element context requires a repeated ancestor or repeated primitive"
                    .into(),
            );
            interpretation = "unsupported";
        }
    } else {
        reason=Some("Writer-input and unresolved scopes cannot be inferred from physical schema declarations".into());
    }
    if let Some(anchor) = context_index {
        let start = if anchor == 0 {
            0
        } else {
            ancestry_indices
                .iter()
                .position(|x| x.0 == anchor)
                .ok_or_else(|| {
                    err(
                        "PARQUET_NULLABILITY_PATH",
                        "/schema",
                        "Context is not in selected ancestry",
                    )
                })?
                + 1
        };
        for (index, rep, _, _) in ancestry_indices.iter().skip(start) {
            if rep == &u("optional") {
                absence_paths.push(path_string("/schema/", *index));
            }
        }
        nullability = if absence_paths.is_empty() {
            "required"
        } else {
            "absent-allowed"
        };
        interpretation = "declared";
        outcome = "exact";
    }
    let binding = get(
        get(&read_json(RESULT_SCHEMA, ctx)?, "properties").unwrap_or(&Value::Null),
        "binding",
    )
    .and_then(|b| get(b, "const"))
    .cloned()
    .unwrap_or(Value::Null);
    let mut mapping = obj(vec![
        ("origin", t("classified")),
        ("idealPath", Value::String(ideal_path.clone())),
        ("nativePath", Value::String(native_path.clone())),
        ("nativeFragment", native_fragment.clone()),
        ("ancestry", Value::Array(ancestry)),
        (
            "contextIndex",
            context_index
                .map(|i| Value::Number(i as f64))
                .unwrap_or(Value::Null),
        ),
        ("absencePaths", Value::Array(absence_paths)),
        ("nullability", t(nullability)),
        ("interpretation", t(interpretation)),
        ("outcome", t(outcome)),
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
    let mut residuals = Vec::new();
    let mut diagnostics = Vec::new();
    if let Some(why) = reason.as_deref() {
        add_loss(
            &mut residuals,
            &mut diagnostics,
            native_path.clone(),
            native_fragment.clone(),
            why,
            false,
        );
        if interpretation == "unsupported" {
            set(&mut mapping, "outcome", t("not-expressible"))?;
        }
    }
    let mut conflict = None;
    if text(selected, "kind") != Some(&u("field")) {
        conflict=Some("Selected native member must already be an explicit Field; this operation does not replace its kind".to_owned());
    }
    if let Some(author) = get(&request, "author") {
        match crate::nullability::verify_core_nullability_declaration(
            author,
            &source,
            engine,
            registry,
            capabilities,
            ctx,
        ) {
            Ok(verified) => {
                let identity = get(&verified, "identity").unwrap_or(&Value::Null);
                if text(identity, "module") != Some(&u("parquet.fields"))
                    || text(identity, "element") != Some(&element_id)
                {
                    conflict = Some("Author receipt identifies a different member".into());
                } else if text(
                    get(&verified, "provenance").unwrap_or(&Value::Null),
                    "nullability",
                ) != Some(&u(nullability))
                {
                    conflict=Some("Authored availability differs from the native observation; neither assertion may be overwritten".into());
                }
            }
            Err(e) if e.is_control_failure() => return Err(e),
            Err(e) => conflict = Some(format!("Author provenance is invalid or stale: {}", e.code)),
        }
    } else if get(selected, "nullability").is_some() {
        conflict=Some("Existing availability requires verified author provenance before native classification".into());
    }
    if get(get(selected, "extensions").unwrap_or(&Value::Null), EXT).is_some() {
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
            ideal_path.clone(),
            get(selected, "nullability").cloned().unwrap_or(Value::Null),
            why,
            true,
        );
        set(&mut mapping, "outcome", t("unknown"))?;
    }
    let blocked = conflict.is_some()
        || (text(&request, "mode") == Some(&u("strict")) && !residuals.is_empty());
    for diagnostic in &mut diagnostics {
        set(
            diagnostic,
            "severity",
            t(if blocked { "error" } else { "warning" }),
        )?;
    }
    let mut result = obj(vec![
        ("operation", t("classify-parquet-nullability")),
        ("version", t("1.0.0")),
        ("status", t(if blocked { "blocked" } else { "classified" })),
        ("source", copy_json(&source, ctx)?),
        ("request", request.clone()),
        ("binding", binding.clone()),
        ("mapping", mapping),
        ("residuals", Value::Array(residuals)),
        ("diagnostics", Value::Array(diagnostics)),
    ]);
    if !blocked {
        let mut target = copy_json(&source, ctx)?;
        let modules = get_mut(&mut target, "modules")
            .and_then(|v| {
                if let Value::Array(a) = v {
                    Some(a)
                } else {
                    None
                }
            })
            .ok_or_else(|| err("PARQUET_NULLABILITY_TARGET", "/modules", "Modules required"))?;
        let target_elements = get_mut(&mut modules[mi], "elements")
            .and_then(|v| {
                if let Value::Array(a) = v {
                    Some(a)
                } else {
                    None
                }
            })
            .ok_or_else(|| {
                err(
                    "PARQUET_NULLABILITY_TARGET",
                    "/elements",
                    "Elements required",
                )
            })?;
        set(&mut target_elements[ei], "nullability", t(nullability))?;
        let vocabularies = get_mut(&mut target, "vocabularies").ok_or_else(|| {
            err(
                "PARQUET_NULLABILITY_TARGET",
                "/vocabularies",
                "Vocabularies required",
            )
        })?;
        if get(vocabularies, EXT).is_none() {
            set(vocabularies, EXT, obj(vec![("version", t("1.0.0"))]))?;
        }
        let selected = get_mut(&mut target, "modules")
            .and_then(|v| {
                if let Value::Array(a) = v {
                    a.get_mut(mi)
                } else {
                    None
                }
            })
            .and_then(|m| get_mut(m, "elements"))
            .and_then(|v| {
                if let Value::Array(a) = v {
                    a.get_mut(ei)
                } else {
                    None
                }
            })
            .ok_or_else(|| {
                err(
                    "PARQUET_NULLABILITY_TARGET",
                    "/elements",
                    "Selected field missing",
                )
            })?;
        let extensions = get(selected, "extensions")
            .cloned()
            .unwrap_or_else(|| obj(vec![]));
        set(selected, "extensions", extensions)?;
        let ext = get_mut(selected, "extensions").unwrap();
        set(
            ext,
            EXT,
            obj(vec![
                ("origin", t("classified")),
                ("binding", binding.clone()),
                (
                    "scope",
                    get(&request, "scope").cloned().unwrap_or(Value::Null),
                ),
                (
                    "carrier",
                    get(&request, "carrier").cloned().unwrap_or(Value::Null),
                ),
                ("interpretation", t(interpretation)),
                ("nativePath", Value::String(native_path)),
                (
                    "contextIndex",
                    context_index
                        .map(|i| Value::Number(i as f64))
                        .unwrap_or(Value::Null),
                ),
                (
                    "repetitionLevel",
                    get(field, "repetitionLevel")
                        .cloned()
                        .unwrap_or(Value::Number(0.0)),
                ),
            ]),
        )?;
        set(&mut result, "target", target)?;
    }
    validate(&result, &rt.result, ctx, "PARQUET_NULLABILITY_RESULT")?;
    Ok(result)
}

/// Recompute a retained classifier receipt and require the supplied target to be current.
pub fn verify_parquet_nullability_classification(
    receipt: &Value,
    current: &Value,
    engine: &Engine,
    registry: &Registry,
    capabilities: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(ctx)?;
    validate(receipt, &rt.result, ctx, "PARQUET_NULLABILITY_RECEIPT")?;
    if text(receipt, "status") != Some(&u("classified")) {
        return Err(err(
            "PARQUET_NULLABILITY_RECEIPT",
            "/status",
            "Expected complete classified receipt",
        ));
    }
    let source = get(receipt, "source").ok_or_else(|| {
        err(
            "PARQUET_NULLABILITY_RECEIPT",
            "/source",
            "Source is required",
        )
    })?;
    let request = get(receipt, "request").ok_or_else(|| {
        err(
            "PARQUET_NULLABILITY_RECEIPT",
            "/request",
            "Request is required",
        )
    })?;
    let expected =
        classify_parquet_nullability(source, request, engine, registry, capabilities, ctx)?;
    if !same(receipt, &expected, ctx)? {
        return Err(err(
            "PARQUET_NULLABILITY_RECEIPT",
            "",
            "Receipt disagrees with retained source and selected binding",
        ));
    }
    let target = get(receipt, "target").ok_or_else(|| {
        err(
            "PARQUET_NULLABILITY_RECEIPT",
            "/target",
            "Target is required",
        )
    })?;
    if !same(current, target, ctx)? {
        return Err(err(
            "PARQUET_NULLABILITY_STALE",
            "",
            "Target changed after classification",
        ));
    }
    copy_json(receipt, ctx)
}

/// Recover the exact captured Parquet bytes after verifying the receipt and target.
pub fn recover_parquet_nullability_bytes(
    receipt: &Value,
    current: &Value,
    engine: &Engine,
    registry: &Registry,
    capabilities: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Vec<u8>, EngineError> {
    let verified = verify_parquet_nullability_classification(
        receipt,
        current,
        engine,
        registry,
        capabilities,
        ctx,
    )?;
    let index = index(
        get(get(&verified, "request").unwrap_or(&Value::Null), "index").ok_or_else(|| {
            err(
                "PARQUET_NULLABILITY_RECEIPT",
                "/request/index",
                "Index required",
            )
        })?,
    )
    .ok_or_else(|| {
        err(
            "PARQUET_NULLABILITY_RECEIPT",
            "/request/index",
            "Index invalid",
        )
    })?;
    Ok(capture_parquet_document(
        get(&verified, "source").unwrap_or(&Value::Null),
        index,
        engine,
        registry,
        capabilities,
        ctx,
    )?
    .bytes)
}
