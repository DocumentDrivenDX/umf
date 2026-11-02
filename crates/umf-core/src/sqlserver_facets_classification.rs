// SPDX-License-Identifier: MIT OR Apache-2.0
//! Profile-qualified SQL Server value-domain facet interpretation.
//! Native source and unknown extensions are retained; this adapter never authors facts from labels.
use crate::{
    context::Context,
    engine::{Capabilities, Engine},
    error::EngineError,
    facets,
    registry::Registry,
    schema::CompiledSchema,
    serialization::{self, Format},
    sqlserver_adapter as sqlserver,
    value::{copy_json, Utf16, Value},
};
use std::{
    collections::BTreeSet,
    sync::{Arc, OnceLock},
};

const RESULT_SCHEMA: &str =
    include_str!("../../../spec/core/sqlserver-facet-classification.schema.json");
const FACET_SCHEMA: &str = include_str!("../../../spec/core/facet-operation-v3.schema.json");
const NATIVE_SCHEMA: &str = include_str!("../../../spec/core/native-json.schema.json");
const CAPTURE_SCHEMA: &str = include_str!("../../../spec/extensions/sqlserver/capture.schema.json");
const EXT: &str = "umf.sqlserver.facets";
const NATIVE_VERSION: &str = "16.0.4295.3";
const SUBSET: &str = "Scalar catalog-column facets with explicit stored/ordinary-checked-write non-null value scope, bounded catalog CHECKs and retained native refinements; no native equivalence";
const RECOVERY: &str = "Retain original native archive and authored facets; interpretation does not replace native meaning";

fn u(s: &str) -> Utf16 {
    Utf16::from(s)
}
fn t(s: &str) -> Value {
    Value::string_utf8(s)
}
fn obj(v: Vec<(&str, Value)>) -> Value {
    Value::Object(v.into_iter().map(|(k, v)| (u(k), v)).collect())
}
fn get<'a>(v: &'a Value, k: &str) -> Option<&'a Value> {
    if let Value::Object(m) = v {
        m.iter().find(|(x, _)| x == &u(k)).map(|(_, v)| v)
    } else {
        None
    }
}
fn get_utf16<'a>(v: &'a Value, key: &Utf16) -> Option<&'a Value> {
    if let Value::Object(members) = v {
        members
            .iter()
            .find(|(name, _)| name == key)
            .map(|(_, value)| value)
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
fn set(v: &mut Value, k: &str, n: Value) -> Result<(), EngineError> {
    let Value::Object(m) = v else {
        return Err(err("SQLSERVER_FACET_TARGET", "", "Expected object"));
    };
    if let Some((_, x)) = m.iter_mut().find(|(x, _)| x == &u(k)) {
        *x = n
    } else {
        m.push((u(k), n));
    }
    Ok(())
}
fn text<'a>(v: &'a Value, k: &str) -> Option<&'a Utf16> {
    match get(v, k) {
        Some(Value::String(s)) => Some(s),
        _ => None,
    }
}
fn arr<'a>(v: &'a Value, k: &str) -> Option<&'a [Value]> {
    match get(v, k) {
        Some(Value::Array(a)) => Some(a),
        _ => None,
    }
}
fn err(code: &str, path: &str, msg: &str) -> EngineError {
    EngineError::new(code, u(path), msg)
}
fn read_json(s: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    serialization::read_json_value(&s.encode_utf16().collect::<Vec<_>>(), Format::Json, ctx)
}
struct Runtime {
    result: CompiledSchema,
    request: CompiledSchema,
}
fn runtime(engine: &Engine, ctx: &mut Context<'_>) -> Result<Arc<Runtime>, EngineError> {
    static CACHE: OnceLock<Arc<Runtime>> = OnceLock::new();
    if ctx.profile() == crate::context::ResourceProfile::Cooperative
        && ctx.limits() == crate::context::Limits::ordinary()
    {
        if let Some(r) = CACHE.get() {
            return Ok(Arc::clone(r));
        }
    }
    ctx.charge_work(1, u(""))?;
    let mut resources = engine.schema_resources_with_context(ctx)?;
    resources.entries.push((
        u("urn:umf:core:facet-operation:3.0.0"),
        read_json(FACET_SCHEMA, ctx)?,
    ));
    resources.entries.push((
        u("urn:umf:native-json:0.1.0"),
        read_json(NATIVE_SCHEMA, ctx)?,
    ));
    let schema = read_json(RESULT_SCHEMA, ctx)?;
    resources.entries.push((
        u("urn:umf:core:sqlserver-facet-classification:1.0.0"),
        schema.clone(),
    ));
    let result = CompiledSchema::compile(&schema, &resources, ctx)?;
    let req = get(
        get(&schema, "properties").unwrap_or(&Value::Null),
        "request",
    )
    .ok_or_else(|| err("SQLSERVER_FACET_SCHEMA", "", "Missing request schema"))?;
    let request = CompiledSchema::compile(req, &resources, ctx)?;
    let r = Arc::new(Runtime { result, request });
    if ctx.profile() == crate::context::ResourceProfile::Cooperative
        && ctx.limits() == crate::context::Limits::ordinary()
    {
        return Ok(crate::resource_cache::publish_completed(&CACHE, r));
    }
    Ok(r)
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
            "Value does not match the pinned SQL Server facet classification schema",
        ))
    }
}
fn equal(a: &Value, b: &Value, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    fn canon(v: &Value, c: &mut Context<'_>) -> Result<Value, EngineError> {
        match v {
            Value::Array(a) => {
                let mut o = Vec::with_capacity(a.len());
                for x in a {
                    c.charge_work(1, u(""))?;
                    o.push(canon(x, c)?);
                }
                Ok(Value::Array(o))
            }
            Value::Object(m) => {
                let mut o = Vec::with_capacity(m.len());
                for (k, v) in m {
                    c.charge_work(k.len() + 1, u(""))?;
                    o.push((k.clone(), canon(v, c)?));
                }
                o.sort_by(|x, y| x.0.cmp(&y.0));
                Ok(Value::Object(o))
            }
            _ => copy_json(v, c),
        }
    }
    Ok(canon(a, ctx)? == canon(b, ctx)?)
}
fn collect_unknown_native(
    native: &Value,
    rule: &Value,
    root_schema: &Value,
    path: &Utf16,
    ideal: &Utf16,
    residuals: &mut Vec<Value>,
    observations: &mut Vec<Value>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    ctx.charge_work(path.len().saturating_add(1), path.clone())?;
    // Follow only the pinned capture schema's declaration rules, matching the
    // predecessor's $defs and nullable-union traversal without interpreting
    // unknown native properties.
    if let Some(reference) = text(rule, "$ref") {
        let name = reference.to_utf8().map_err(|_| {
            err("SQLSERVER_FACET_SCHEMA", "", "Capture schema reference is not UTF-8")
        })?;
        let definition = name.strip_prefix("#/$defs/")
            .and_then(|name| get(get(root_schema, "$defs")?, name))
            .ok_or_else(|| err("SQLSERVER_FACET_SCHEMA", "", "Capture schema definition is missing"))?;
        return collect_unknown_native(native, definition, root_schema, path, ideal, residuals, observations, ctx);
    }
    if let Some(branches) = arr(rule, "anyOf") {
        let native_is_null = text(native, "kind") == Some(&u("null"));
        if let Some(branch) = branches.iter().find(|branch| {
            let branch_is_null = text(branch, "type") == Some(&u("null"));
            if native_is_null { branch_is_null } else { !branch_is_null }
        }) {
            return collect_unknown_native(native, branch, root_schema, path, ideal, residuals, observations, ctx);
        }
        return Ok(());
    }
    if text(native, "kind") == Some(&u("object")) {
        let members = get(native, "members").unwrap_or(&Value::Null);
        let properties = get(rule, "properties").unwrap_or(&Value::Null);
        if let Value::Object(fields) = members {
            for (name, value) in fields {
                ctx.charge_work(name.len().saturating_add(1), path.clone())?;
                let child = pointer_child(path, name, ctx)?;
                if let Some(child_rule) = get_utf16(properties, name) {
                    collect_unknown_native(
                        value,
                        child_rule,
                        root_schema,
                        &child,
                        ideal,
                        residuals,
                        observations,
                        ctx,
                    )?;
                } else {
                    residuals.push(residual(
                        &child,
                        ideal,
                        value,
                        "Unknown catalog content remains native",
                        "unknown",
                        ctx,
                    )?);
                    observations.push(observation(
                        "native",
                        ideal,
                        &child,
                        "unknown",
                        "Unknown catalog content remains native",
                    ));
                }
            }
        }
    } else if text(native, "kind") == Some(&u("array")) {
        if let (Some(items), Some(item_rule)) = (arr(native, "items"), get(rule, "items")) {
            for (index, value) in items.iter().enumerate() {
                let child = pointer_child(path, &u(&index.to_string()), ctx)?;
                collect_unknown_native(
                    value,
                    item_rule,
                    root_schema,
                    &child,
                    ideal,
                    residuals,
                    observations,
                    ctx,
                )?;
            }
        }
    }
    Ok(())
}
fn observation_array(values: &[Value], ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let mut out = Vec::with_capacity(values.len());
    for value in values {
        out.push(copy_json(value, ctx)?);
    }
    Ok(Value::Array(out))
}
fn num(n: usize) -> Value {
    Value::Number(n as f64)
}
fn observation(concept: &str, ideal: &Utf16, native: &Utf16, outcome: &str, basis: &str) -> Value {
    obj(vec![
        ("concept", t(concept)),
        ("idealPath", Value::String(ideal.clone())),
        ("nativePath", Value::String(native.clone())),
        (
            "interpretation",
            t(match outcome {
                "not-expressible" => "unsupported",
                "unknown" => "unknown",
                _ => "inferred",
            }),
        ),
        ("outcome", t(outcome)),
        ("basis", t(basis)),
    ])
}
fn residual(
    path: &Utf16,
    ideal: &Utf16,
    value: &Value,
    reason: &str,
    outcome: &str,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    Ok(obj(vec![
        ("path", Value::String(path.clone())),
        (
            "targetPath",
            if path == ideal {
                Value::String(ideal.clone())
            } else {
                Value::Null
            },
        ),
        ("value", copy_json(value, ctx)?),
        ("reason", t(reason)),
        ("outcome", t(outcome)),
        (
            "binding",
            obj(vec![
                ("id", t(EXT)),
                ("version", t("1.0.0")),
                ("nativeVersion", t(NATIVE_VERSION)),
                ("subset", t(SUBSET)),
            ]),
        ),
        ("recovery", t(RECOVERY)),
    ]))
}
fn strval(v: Option<&Utf16>) -> Option<String> {
    v.and_then(|s| s.to_utf8().ok())
}
fn integer(v: Option<&Value>) -> Option<i64> {
    match v {
        Some(Value::Number(n))
            if n.is_finite() && n.fract() == 0.0 && n.abs() <= 9_007_199_254_740_991.0 =>
        {
            Some(*n as i64)
        }
        _ => None,
    }
}
fn tagged_text(v: &Value) -> Option<&Utf16> {
    if text(v, "kind") == Some(&u("string")) {
        text(v, "value")
    } else {
        None
    }
}
fn tagged_bool(v: &Value) -> Option<bool> {
    if text(v, "kind") == Some(&u("boolean")) {
        match get(v, "value") {
            Some(Value::Bool(value)) => Some(*value),
            _ => None,
        }
    } else {
        None
    }
}
fn pointer_child(base: &Utf16, key: &Utf16, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    let mut units = Vec::with_capacity(base.len().saturating_add(key.len()).saturating_add(1));
    units.extend_from_slice(base.units());
    units.push(b'/' as u16);
    for unit in key.units() {
        match *unit {
            0x7e => units.extend_from_slice(&[b'~' as u16, b'0' as u16]),
            0x2f => units.extend_from_slice(&[b'~' as u16, b'1' as u16]),
            other => units.push(other),
        }
    }
    ctx.charge_work(units.len(), base.clone())?;
    Ok(Utf16::new(units))
}
fn diagnostic(path: &Utf16, ideal: &Utf16, message: Utf16, blocked: bool) -> Value {
    obj(vec![
        (
            "code",
            t(if path.units().starts_with(ideal.units()) {
                "SQLSERVER_FACET_CONFLICT"
            } else {
                "SQLSERVER_FACET_UNRESOLVED"
            }),
        ),
        ("path", Value::String(path.clone())),
        ("message", Value::String(message)),
        ("severity", t(if blocked { "error" } else { "warning" })),
    ])
}
fn strict_doc(
    source: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
    code: &str,
) -> Result<(), EngineError> {
    let report = engine.validate_document(source, registry, caps, ctx)?;
    if !report.valid || text(source, "umf") != Some(&u("0.10.0")) {
        return Err(err(code, "", "Valid current core 0.10.0 document required"));
    }
    Ok(())
}

pub fn classify(
    source_in: &Value,
    request_in: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(engine, ctx)?;
    validate(request_in, &rt.request, ctx, "SQLSERVER_FACET_REQUEST")?;
    let source = copy_json(source_in, ctx)?;
    let request = copy_json(request_in, ctx)?;
    strict_doc(
        &source,
        engine,
        registry,
        caps,
        ctx,
        "SQLSERVER_FACET_SOURCE",
    )?;
    let archive = sqlserver::export_document(&source, ctx)?;
    let native_text = text(&request, "nativeSource").ok_or_else(|| {
        err(
            "SQLSERVER_FACET_REQUEST",
            "/nativeSource",
            "Native source required",
        )
    })?;
    let catalog = sqlserver::SqlServerCatalog::import(native_text, ctx)?;
    if catalog.export(ctx)? != archive {
        return Err(err(
            "SQLSERVER_FACET_ARCHIVE",
            "/nativeSource",
            "Original native source differs from retained catalog",
        ));
    }
    let column = text(&request, "column")
        .ok_or_else(|| err("SQLSERVER_FACET_REQUEST", "/column", "Column path required"))?;
    let catalog = sqlserver::catalog_from_document(&source, ctx)?;
    let rows = sqlserver::column_metadata_value(&catalog, ctx)?;
    let row = arr_value(&rows)
        .and_then(|r| r.iter().find(|x| text(x, "path") == Some(column)))
        .ok_or_else(|| err("SQLSERVER_FACET_COLUMN", "/column", "Column not captured"))?;
    let identity = get(&request, "identity").ok_or_else(|| {
        err(
            "SQLSERVER_FACET_FIELD",
            "/identity",
            "Explicit logical Field identity required",
        )
    })?;
    let modules = arr(&source, "modules")
        .ok_or_else(|| err("SQLSERVER_FACET_SOURCE", "/modules", "Modules required"))?;
    let mi = modules
        .iter()
        .position(|m| text(m, "id") == text(identity, "module"))
        .ok_or_else(|| {
            err(
                "SQLSERVER_FACET_FIELD",
                "/identity/module",
                "Selected module missing",
            )
        })?;
    let elements = arr(&modules[mi], "elements").ok_or_else(|| {
        err(
            "SQLSERVER_FACET_FIELD",
            "/identity/element",
            "Selected element missing",
        )
    })?;
    let ei = elements
        .iter()
        .position(|e| text(e, "id") == text(identity, "element"))
        .ok_or_else(|| {
            err(
                "SQLSERVER_FACET_FIELD",
                "/identity/element",
                "Selected element missing",
            )
        })?;
    let element = &elements[ei];
    let ideal = u(&format!("/modules/{mi}/elements/{ei}/facets"));
    let native_path = column.clone();
    let native_fragment = get(row, "nativeColumn")
        .ok_or_else(|| err("SQLSERVER_FACET_COLUMN", "", "Native fragment missing"))?;
    let mut facets_value = obj(vec![]);
    let mut observations = Vec::new();
    let mut residuals = Vec::new();
    let mut blocked = false;
    let mut outcome = "exact".to_string();
    let add_loss = |path: &Utf16,
                    value: &Value,
                    why: &str,
                    kind: &str,
                    facets: &mut Vec<Value>,
                    obs: &mut Vec<Value>,
                    ctx: &mut Context<'_>|
     -> Result<(), EngineError> {
        facets.push(residual(path, &ideal, value, why, kind, ctx)?);
        obs.push(observation(
            if kind == "not-expressible" {
                "native"
            } else {
                "native"
            },
            &ideal,
            path,
            kind,
            why,
        ));
        Ok(())
    };
    let capture = get(
        get(&source, "extensions").unwrap_or(&Value::Null),
        "umf.sqlserver",
    )
    .and_then(|value| get(value, "root"))
    .ok_or_else(|| {
        err(
            "SQLSERVER_FACET_CAPTURE",
            "/extensions/umf.sqlserver/root",
            "SQL Server capture root required",
        )
    })?;
    let root_members = get(capture, "members").ok_or_else(|| {
        err(
            "SQLSERVER_FACET_CAPTURE",
            "/extensions/umf.sqlserver/root/members",
            "Captured object members required",
        )
    })?;
    let capture_schema = read_json(CAPTURE_SCHEMA, ctx)?;
    collect_unknown_native(
        capture,
        &capture_schema,
        &capture_schema,
        &u(""),
        &ideal,
        &mut residuals,
        &mut observations,
        ctx,
    )?;
    if text(identity, "module") == Some(&u("sqlserver.columns"))
        || text(element, "kind") != Some(&u("field"))
        || text(element, "cardinality") != Some(&u("one"))
        || arr(element, "references").is_some_and(|references| {
            references
                .iter()
                .any(|r| text(r, "role") == Some(&u("record-type")))
        })
        || text(element, "scalarType")
            != text(get(row, "element").unwrap_or(&Value::Null), "scalarType")
    {
        blocked = true;
        add_loss(&ideal,element,"An explicitly scalar logical Field matching the native scalar family is required; physical columns cannot be relabeled","not-expressible",&mut residuals,&mut observations,ctx)?;
    }
    if get(get(element, "extensions").unwrap_or(&Value::Null), EXT).is_some() {
        blocked = true;
        add_loss(
            &ideal,
            get(get(element, "extensions").unwrap_or(&Value::Null), EXT).unwrap(),
            "Existing binding cannot be overwritten",
            "not-expressible",
            &mut residuals,
            &mut observations,
            ctx,
        )?;
    }
    if tagged_text(get(root_members, "serverVersion").unwrap_or(&Value::Null))
        != Some(&u(NATIVE_VERSION))
        || tagged_text(get(root_members, "profile").unwrap_or(&Value::Null))
            != Some(&u("sqlserver-catalog-v3"))
        || tagged_text(get(root_members, "state").unwrap_or(&Value::Null)) != Some(&u("captured"))
    {
        return Err(err(
            "SQLSERVER_FACET_VERSION",
            "/nativeSource",
            "Pinned captured SQL Server v3 catalog required",
        ));
    }
    let inspected = sqlserver::inspect_sqlserver_facet_constraints(&source, column, ctx)?;
    let ty = get(&inspected, "type").unwrap_or(&Value::Null);
    let meaning = get(ty, "meaning").unwrap_or(&Value::Null);
    let native_members = get(native_fragment, "members").unwrap_or(&Value::Null);
    let computed = tagged_bool(get(native_members, "is_computed").unwrap_or(&Value::Null));
    let family = if computed == Some(false) {
        strval(text(meaning, "family"))
    } else {
        None
    };
    let profile = strval(text(&request, "profile")).unwrap_or_default();
    let obligation = strval(text(&request, "obligation")).unwrap_or_default();
    let mut terms = Vec::new();
    let mut used_terms = BTreeSet::new();
    if let Some(items) = arr(&inspected, "observations") {
        for item in items {
            let state = strval(text(item, "state")).unwrap_or_default();
            let scope = strval(text(item, "scope")).unwrap_or_default();
            if state == "residual"
                || (profile == "stored-value" && scope == "ordinary-checked-write-non-null")
            {
                let path = text(item, "path").unwrap_or(&native_path);
                let value = get(item, "native").unwrap_or(native_fragment);
                add_loss(
                    path,
                    value,
                    "CHECK is unresolved for the selected value scope",
                    "unknown",
                    &mut residuals,
                    &mut observations,
                    ctx,
                )?;
            } else if let Some(facts) = arr(item, "facts") {
                for fact in facts {
                    terms.push(copy_json(fact, ctx)?);
                }
            }
        }
    }
    if profile == "unresolved" {
        add_loss(
            &native_path,
            native_fragment,
            "No non-null value scope selected",
            "unknown",
            &mut residuals,
            &mut observations,
            ctx,
        )?;
    } else if family.is_none() {
        add_loss(
            &native_path,
            native_fragment,
            "Unsupported native type",
            "not-expressible",
            &mut residuals,
            &mut observations,
            ctx,
        )?;
    } else {
        match family.as_deref().unwrap() {
            "integer" => {
                let bits = integer(get(meaning, "bits")).unwrap_or(0).max(0) as u32;
                let signed = matches!(get(meaning, "signed"), Some(Value::Bool(true)));
                let (mut min, mut max) = if signed {
                    (
                        -(1i128 << (bits.saturating_sub(1))),
                        (1i128 << (bits.saturating_sub(1))) - 1,
                    )
                } else {
                    (0, (1i128 << bits) - 1)
                };
                for (i, f) in terms.iter().enumerate() {
                    if text(f, "kind") == Some(&u("integer-bound")) {
                        if let (Some(op), Some(lit)) = (
                            text(f, "operator").and_then(|v| v.to_utf8().ok()),
                            text(f, "literal").and_then(|v| v.to_utf8().ok()),
                        ) {
                            if let Ok(n) = lit.parse::<i128>() {
                                if op == ">=" {
                                    min = min.max(n)
                                } else {
                                    max = max.min(n)
                                }
                                used_terms.insert(i);
                            }
                        }
                    }
                }
                let mut width = None;
                for b in 1..=bits {
                    for s in [true, false] {
                        let lo = if s { -(1i128 << (b - 1)) } else { 0 };
                        let hi = (1i128 << (if s { b - 1 } else { b })) - 1;
                        if min == lo && max == hi {
                            width = Some((b, s));
                        }
                    }
                }
                if let Some((b, s)) = width {
                    set(
                        &mut facets_value,
                        "integerWidth",
                        obj(vec![("bits", num(b as usize)), ("signed", Value::Bool(s))]),
                    )?;
                    observations.push(observation("integerWidth",&ideal,&native_path,"exact","Native carrier and applicable CHECKs establish this canonical non-null width domain"));
                } else {
                    add_loss(
                        &native_path,
                        &obj(vec![
                            ("min", t(&min.to_string())),
                            ("max", t(&max.to_string())),
                        ]),
                        "Effective range is empty or not a canonical width domain",
                        "not-expressible",
                        &mut residuals,
                        &mut observations,
                        ctx,
                    )?;
                }
            }
            "decimal" => {
                let precision = integer(get(meaning, "precision")).unwrap_or(0);
                let scale = integer(get(meaning, "scale")).unwrap_or(0);
                set(
                    &mut facets_value,
                    "precision",
                    Value::Number(precision as f64),
                )?;
                set(&mut facets_value, "scale", Value::Number(scale as f64))?;
                for (i, fact) in terms.iter().enumerate() {
                    if text(fact, "kind") == Some(&u("decimal-stored-scale"))
                        && text(fact, "scale").and_then(|v| v.to_utf8().ok())
                            == Some(scale.to_string())
                    {
                        used_terms.insert(i);
                    }
                }
                observations.push(observation("decimal",&ideal,&native_path,"exact","Native finite decimal coefficient domain; input rounding and runtime settings remain native"));
            }
            "binary" => {
                let mut max = integer(get(meaning, "maxBytes"));
                for (i, fact) in terms.iter().enumerate() {
                    if text(fact, "kind") == Some(&u("binary-byte-bound")) {
                        if let Some(bound) = text(fact, "maximum")
                            .and_then(|v| v.to_utf8().ok())
                            .and_then(|v| v.parse::<i64>().ok())
                        {
                            max = Some(max.map_or(bound, |current| current.min(bound)));
                            used_terms.insert(i);
                        }
                    }
                }
                if let Some(max) = max {
                    set(
                        &mut facets_value,
                        "length",
                        obj(vec![
                            ("max", Value::Number(max as f64)),
                            ("unit", t("byte")),
                        ]),
                    )?;
                    observations.push(observation("length",&ideal,&native_path,"exact","Native byte capacity and applicable CHECKs establish a non-null upper bound"));
                }
                if text(meaning, "padding") == Some(&u("fixed")) {
                    add_loss(
                        &native_path,
                        native_fragment,
                        "Fixed binary padding is not represented by a maximum byte bound",
                        "not-expressible",
                        &mut residuals,
                        &mut observations,
                        ctx,
                    )?;
                }
            }
            "string" => {
                let empty = terms.iter().enumerate().any(|(i, f)| {
                    let yes = text(f, "kind") == Some(&u("unicode-empty"));
                    if yes {
                        used_terms.insert(i);
                    }
                    yes
                });
                if empty {
                    set(
                        &mut facets_value,
                        "length",
                        obj(vec![
                            ("max", Value::Number(0.0)),
                            ("unit", t("unicode-scalar")),
                        ]),
                    )?;
                    observations.push(observation("length",&ideal,&native_path,"exact","Variable character storage with a qualified zero-byte CHECK admits only the empty non-null string"));
                } else {
                    add_loss(&native_path,native_fragment,"Native byte/UTF-16 capacity, collation, padding and malformed Unicode do not establish a portable Unicode-scalar length facet","not-expressible",&mut residuals,&mut observations,ctx)?;
                }
            }
            _ => add_loss(
                &native_path,
                native_fragment,
                "Native scalar family has no current core facet mapping",
                "not-expressible",
                &mut residuals,
                &mut observations,
                ctx,
            )?,
        }
    }
    for (i, fact) in terms.iter().enumerate() {
        if !used_terms.contains(&i) {
            add_loss(
                &native_path,
                fact,
                "Additional native predicate remains outside interpreted facets",
                "unknown",
                &mut residuals,
                &mut observations,
                ctx,
            )?;
        }
    }
    if obligation == "exact-input" {
        let why=match family.as_deref(){Some("float")=>"Binary64 1.0000000000000002 narrows to binary32 1.0",Some("decimal")=>"Decimal input can round before CHECK evaluation; runtime settings can also produce error or NULL",_=>"Catalog value-domain facts do not prove exact conversion of arbitrary SQL inputs"};
        add_loss(
            &native_path,
            native_fragment,
            why,
            if family.as_deref() == Some("decimal") || family.as_deref() == Some("float") {
                "approximated"
            } else {
                "unknown"
            },
            &mut residuals,
            &mut observations,
            ctx,
        )?;
    }
    // A verified author receipt is the only source of authorship provenance.
    if let Some(author) = get(&request, "author") {
        match facets::verify_core_facet_declaration(author, &source, engine, registry, caps, ctx) {
            Err(error)
                if error.is_control_failure()
                    || matches!(error.code.as_str(), "LIMIT" | "CAPACITY" | "RESOURCE_LIMIT" | "CANCELLED" | "METER_FAILURE" | "CANCELLATION_CHECK_FAILURE" | "CLOCK_CAPABILITY_REQUIRED" | "DEADLINE" | "DEADLINE_EXCEEDED") => return Err(error),
            Err(error) => {
                blocked = true;
                let reason = format!("Author provenance is invalid or stale: {}", error.code);
                add_loss(
                    &ideal,
                    author,
                    &reason,
                    "not-expressible",
                    &mut residuals,
                    &mut observations,
                    ctx,
                )?;
            }
            Ok(verified) => {
                let aid = get(&verified, "identity").unwrap_or(&Value::Null);
                if text(aid, "module") != text(identity, "module")
                    || text(aid, "element") != text(identity, "element")
                {
                    blocked = true;
                    add_loss(
                        &ideal,
                        aid,
                        "Author receipt identifies a different Field",
                        "not-expressible",
                        &mut residuals,
                        &mut observations,
                        ctx,
                    )?;
                } else {
                    let report =
                        facets::inspect_core_facets(&source, aid, engine, registry, caps, ctx)?;
                    let meaning_report = get(&report, "meaning").unwrap_or(&Value::Null);
                    let meaning = get(meaning_report, "interpreted").unwrap_or(&Value::Null);
                    for key in ["length", "precision", "scale", "integerWidth"] {
                        if let Some(declared) = get(meaning, key) {
                            if let Some(observed) = get(&facets_value, key) {
                                if !equal(declared, observed, ctx)? {
                                    blocked = true;
                                    add_loss(&ideal, declared, "Authored facet conflicts with native interpretation; neither may be overwritten", "not-expressible", &mut residuals, &mut observations, ctx)?;
                                }
                            } else {
                                let mut path = ideal.units().to_vec();
                                path.push(b'/' as u16);
                                path.extend(key.encode_utf16());
                                add_loss(&Utf16::new(path), declared, "Authored bound is retained but not established by the selected native consumer", "unknown", &mut residuals, &mut observations, ctx)?;
                            }
                        }
                    }
                    if text(meaning_report, "state") == Some(&u("partial")) {
                        add_loss(
                            &ideal,
                            get(meaning_report, "facets").unwrap_or(&Value::Null),
                            "Unknown authored facet qualifiers remain attached",
                            "unknown",
                            &mut residuals,
                            &mut observations,
                            ctx,
                        )?;
                    }
                }
            }
        }
    } else if get(element, "facets").is_some() {
        blocked = true;
        add_loss(
            &ideal,
            get(element, "facets").unwrap(),
            "Existing facets require verified author provenance before classification",
            "not-expressible",
            &mut residuals,
            &mut observations,
            ctx,
        )?;
    }
    let vocabularies = get(&source, "vocabularies").unwrap_or(&Value::Null);
    if let Some(entry) = get(vocabularies, EXT) {
        if text(entry, "version") != Some(&u("1.0.0")) {
            blocked = true;
            add_loss(
                &ideal,
                entry,
                "Incompatible facet vocabulary",
                "not-expressible",
                &mut residuals,
                &mut observations,
                ctx,
            )?;
        }
    }
    if !residuals.is_empty() {
        outcome = if residuals
            .iter()
            .any(|r| text(r, "outcome") == Some(&u("unknown")))
        {
            "unknown".into()
        } else if residuals
            .iter()
            .any(|r| text(r, "outcome") == Some(&u("not-expressible")))
        {
            "not-expressible".into()
        } else {
            "approximated".into()
        };
    }
    let mode = strval(text(&request, "mode")).unwrap_or_default();
    if mode == "strict" && !residuals.is_empty() {
        blocked = true;
    }
    let mut result = obj(vec![
        ("operation", t("classify-sqlserver-facets")),
        ("version", t("1.0.0")),
        ("status", t(if blocked { "blocked" } else { "classified" })),
        ("outcome", t(&outcome)),
        ("source", copy_json(&source, ctx)?),
        ("request", copy_json(&request, ctx)?),
        (
            "binding",
            obj(vec![
                ("id", t(EXT)),
                ("version", t("1.0.0")),
                ("nativeVersion", t(NATIVE_VERSION)),
                ("subset", t(SUBSET)),
            ]),
        ),
        (
            "mapping",
            obj(vec![
                ("origin", t("classified")),
                ("idealPath", Value::String(ideal.clone())),
                ("nativePath", Value::String(native_path.clone())),
                ("nativeFragment", copy_json(native_fragment, ctx)?),
                ("facets", copy_json(&facets_value, ctx)?),
                ("observations", observation_array(&observations, ctx)?),
            ]),
        ),
        ("residuals", Value::Array(residuals)),
        ("diagnostics", Value::Array(Vec::new())),
    ]);
    if !blocked {
        let mut target = copy_json(&source, ctx)?;
        let vocab = get_mut(&mut target, "vocabularies").ok_or_else(|| {
            err(
                "SQLSERVER_FACET_TARGET",
                "/vocabularies",
                "Vocabularies required",
            )
        })?;
        set(vocab, EXT, obj(vec![("version", t("1.0.0"))]))?;
        let modules = get_mut(&mut target, "modules").unwrap();
        if let Value::Array(ms) = modules {
            let els = get_mut(&mut ms[mi], "elements").unwrap();
            if let Value::Array(es) = els {
                if get(&request, "author").is_none()
                    && !matches!(&facets_value,Value::Object(m) if m.is_empty())
                {
                    set(&mut es[ei], "facets", copy_json(&facets_value, ctx)?)?;
                }
                let extensions = get_mut(&mut es[ei], "extensions").ok_or_else(|| {
                    err(
                        "SQLSERVER_FACET_TARGET",
                        "/extensions",
                        "Field extensions required",
                    )
                })?;
                set(
                    extensions,
                    EXT,
                    obj(vec![
                        ("origin", t("classified")),
                        ("physicalColumn", Value::String(native_path.clone())),
                        (
                            "binding",
                            obj(vec![("id", t(EXT)), ("version", t("1.0.0"))]),
                        ),
                        ("profile", t(&profile)),
                        ("obligation", t(&obligation)),
                        ("outcome", t(&outcome)),
                        ("observations", observation_array(&observations, ctx)?),
                    ]),
                )?;
            }
        }
        let validation = engine.validate_document(&target, registry, caps, ctx)?;
        if !validation.valid {
            return Err(err(
                "SQLSERVER_FACET_TARGET",
                "/modules",
                "Classification would violate current core constraints",
            ));
        }
        set(&mut result, "target", target)?;
    }
    let ds = arr(&result, "residuals")
        .unwrap_or(&[])
        .iter()
        .map(|r| {
            diagnostic(
                text(r, "path").unwrap_or(&ideal),
                &ideal,
                text(r, "reason").cloned().unwrap_or_default(),
                blocked,
            )
        })
        .collect();
    set(&mut result, "diagnostics", Value::Array(ds))?;
    validate(&result, &rt.result, ctx, "SQLSERVER_FACET_RESULT")?;
    Ok(result)
}
fn arr_value(v: &Value) -> Option<&[Value]> {
    if let Value::Array(a) = v {
        Some(a)
    } else {
        None
    }
}
pub fn verify(
    receipt: &Value,
    current: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(engine, ctx)?;
    validate(receipt, &rt.result, ctx, "SQLSERVER_FACET_RECEIPT")?;
    if text(receipt, "status") != Some(&u("classified")) {
        return Err(err(
            "SQLSERVER_FACET_RECEIPT",
            "/status",
            "Expected classified receipt",
        ));
    }
    let expected = classify(
        get(receipt, "source")
            .ok_or_else(|| err("SQLSERVER_FACET_RECEIPT", "/source", "Source missing"))?,
        get(receipt, "request")
            .ok_or_else(|| err("SQLSERVER_FACET_RECEIPT", "/request", "Request missing"))?,
        engine,
        registry,
        caps,
        ctx,
    )?;
    if !equal(receipt, &expected, ctx)? {
        return Err(err(
            "SQLSERVER_FACET_RECEIPT",
            "",
            "Receipt differs from recomputed native evidence",
        ));
    }
    if !equal(
        current,
        get(receipt, "target")
            .ok_or_else(|| err("SQLSERVER_FACET_STALE", "/target", "Target missing"))?,
        ctx,
    )? {
        return Err(err(
            "SQLSERVER_FACET_STALE",
            "/target",
            "Target changed after classification",
        ));
    }
    copy_json(receipt, ctx)
}
pub fn recover(
    receipt: &Value,
    current: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    let verified = verify(receipt, current, engine, registry, caps, ctx)?;
    text(get(&verified, "request").unwrap(), "nativeSource")
        .cloned()
        .ok_or_else(|| {
            err(
                "SQLSERVER_FACET_RECEIPT",
                "/request/nativeSource",
                "Native source missing",
            )
        })
}
