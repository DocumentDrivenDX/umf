// SPDX-License-Identifier: MIT OR Apache-2.0
//! Native-owned observation of TableSpec relationship declarations.
use crate::{
    context::{Context, Limits, ResourceProfile},
    engine::{Capabilities, Engine},
    error::EngineError,
    registry::Registry,
    schema::CompiledSchema,
    serialization::{self, Format},
    tablespec_adapter::TableSpecRuntime,
    value::{copy_json, Utf16, Value},
};
use std::sync::{Arc, OnceLock};
const RESULT_SCHEMA: &str =
    include_str!("../../../spec/core/tablespec-relationship-classification.schema.json");
const RECOVERY: &str = "Original native archive retained; no authored relationship inferred";
const NATIVE_VERSION: &str = "647e8e566ad78b864282ec65c0b0b2237aa63084";
const SUBSET:&str="Native foreign_keys, outgoing, referenced_by and incoming metadata only; no authored relationship inference, target Key resolution, participation validation or join enforcement";
fn u(s: &str) -> Utf16 {
    Utf16::from(s)
}
fn t(s: &str) -> Value {
    Value::string_utf8(s)
}
fn obj(v: Vec<(&str, Value)>) -> Value {
    Value::Object(v.into_iter().map(|(k, v)| (u(k), v)).collect())
}
fn get_mut<'a>(v: &'a mut Value, k: &str) -> Option<&'a mut Value> {
    if let Value::Object(m) = v {
        m.iter_mut().find(|(n, _)| n == &u(k)).map(|(_, v)| v)
    } else {
        None
    }
}
fn gm<'a>(v: &'a Value, k: &str, c: &mut Context<'_>) -> Result<Option<&'a Value>, EngineError> {
    if let Value::Object(m) = v {
        for (n, x) in m {
            c.charge_work(n.len().saturating_add(1), u(""))?;
            if n == &u(k) {
                return Ok(Some(x));
            }
        }
    }
    Ok(None)
}
fn tm<'a>(v: &'a Value, k: &str, c: &mut Context<'_>) -> Result<Option<&'a Utf16>, EngineError> {
    Ok(match gm(v, k, c)? {
        Some(Value::String(s)) => Some(s),
        _ => None,
    })
}
fn array_metered<'a>(
    v: &'a Value,
    k: &str,
    c: &mut Context<'_>,
) -> Result<Option<&'a [Value]>, EngineError> {
    Ok(match gm(v, k, c)? {
        Some(Value::Array(a)) => Some(a),
        _ => None,
    })
}
fn set(v: &mut Value, k: &str, n: Value) -> Result<(), EngineError> {
    let Value::Object(m) = v else {
        return Err(err("TABLESPEC_RELATIONSHIP_TARGET", "", "Expected object"));
    };
    if let Some((_, x)) = m.iter_mut().find(|(name, _)| name == &u(k)) {
        *x = n
    } else {
        m.push((u(k), n))
    }
    Ok(())
}
fn err(code: &str, path: &str, msg: impl Into<String>) -> EngineError {
    EngineError::new(code, u(path), msg.into())
}
fn read(s: &str, c: &mut Context<'_>) -> Result<Value, EngineError> {
    let units = s.encode_utf16().collect::<Vec<_>>();
    c.charge_text(units.len(), u(""))?;
    serialization::read_json_value(&units, Format::Json, c)
}
fn equal(a: &Value, b: &Value, c: &mut Context<'_>) -> Result<bool, EngineError> {
    fn canon(v: &Value, c: &mut Context<'_>, d: usize) -> Result<Value, EngineError> {
        if d > c.limits().max_depth {
            return Err(err("LIMIT", "", "Canonicalization depth exceeded"));
        }
        c.charge_work(1, u(""))?;
        match v {
            Value::Array(a) => {
                let mut o = Vec::with_capacity(a.len());
                for x in a {
                    o.push(canon(x, c, d + 1)?)
                }
                Ok(Value::Array(o))
            }
            Value::Object(m) => {
                let mut o = Vec::with_capacity(m.len());
                for (k, x) in m {
                    c.charge_work(k.len().saturating_add(1), u(""))?;
                    o.push((k.clone(), canon(x, c, d + 1)?))
                }
                o.sort_by(|a, b| a.0.cmp(&b.0));
                Ok(Value::Object(o))
            }
            _ => copy_json(v, c),
        }
    }
    Ok(canon(a, c, 0)? == canon(b, c, 0)?)
}
struct Runtime {
    result: CompiledSchema,
    request: CompiledSchema,
}
fn runtime(e: &Engine, c: &mut Context<'_>) -> Result<Arc<Runtime>, EngineError> {
    static CACHE: OnceLock<Arc<Runtime>> = OnceLock::new();
    if c.profile() == ResourceProfile::Cooperative && c.limits() == Limits::ordinary() {
        if let Some(x) = CACHE.get() {
            return Ok(Arc::clone(x));
        }
    }
    c.charge_work(1, u(""))?;
    let resources = e.schema_resources_with_context(c)?;
    let schema = read(RESULT_SCHEMA, c)?;
    let result = CompiledSchema::compile(&schema, &resources, c)?;
    let props = gm(&schema, "properties", c)?
        .ok_or_else(|| err("SCHEMA", "", "Relationship schema properties missing"))?;
    let req = gm(props, "request", c)?
        .ok_or_else(|| err("SCHEMA", "", "Relationship request schema missing"))?;
    let request = CompiledSchema::compile(req, &resources, c)?;
    let ready = Arc::new(Runtime { result, request });
    if c.profile() == ResourceProfile::Cooperative && c.limits() == Limits::ordinary() {
        return Ok(crate::resource_cache::publish_completed(&CACHE, ready));
    }
    Ok(ready)
}
fn validate(
    v: &Value,
    s: &CompiledSchema,
    c: &mut Context<'_>,
    code: &str,
) -> Result<(), EngineError> {
    if s.validate(v, c)?.is_empty() {
        Ok(())
    } else {
        Err(err(
            code,
            "",
            "Value does not match pinned TableSpec relationship classification schema",
        ))
    }
}
fn archive(s: &Value, a: &TableSpecRuntime, c: &mut Context<'_>) -> Result<Value, EngineError> {
    let extensions = gm(s, "extensions", c)?.ok_or_else(|| {
        err(
            "TABLESPEC_RELATIONSHIP_SOURCE",
            "/extensions",
            "Extensions required",
        )
    })?;
    let ex = gm(extensions, "umf.tablespec", c)?.ok_or_else(|| {
        err(
            "TABLESPEC_RELATIONSHIP_CAPTURE",
            "/extensions/umf.tablespec",
            "TableSpec capture required",
        )
    })?;
    if gm(ex, "splitFiles", c)?.is_some() {
        a.export_bundle(s, c)
    } else {
        Ok(Value::String(a.export(s, c)?))
    }
}
fn loss(
    path: Utf16,
    v: &Value,
    outcome: &str,
    reason: &str,
    rs: &mut Vec<Value>,
    ds: &mut Vec<Value>,
    c: &mut Context<'_>,
) -> Result<(), EngineError> {
    rs.push(obj(vec![
        ("path", Value::String(path.clone())),
        ("value", copy_json(v, c)?),
        ("outcome", t(outcome)),
        ("reason", t(reason)),
        ("recovery", t(RECOVERY)),
    ]));
    ds.push(obj(vec![
        ("code", t("TABLESPEC_RELATIONSHIP_RESIDUAL")),
        ("path", Value::String(path)),
        ("message", t(reason)),
        ("severity", t("warning")),
    ]));
    Ok(())
}
fn observe(
    node: &Value,
    path: Utf16,
    carrier: &str,
    module: &Value,
    obs: &mut Vec<Value>,
    res: &mut Vec<Value>,
    diag: &mut Vec<Value>,
    c: &mut Context<'_>,
) -> Result<(), EngineError> {
    let fields = if tm(node, "kind", c)? == Some(&u("object")) {
        gm(node, "members", c)?
    } else {
        None
    };
    let object = fields.is_some();
    let outward = carrier == "foreign_keys" || carrier == "outgoing";
    let (skey, tkey, ckey) = if carrier == "foreign_keys" {
        ("column", "references_table", "references_column")
    } else {
        ("source_column", "target_table", "target_column")
    };
    let endpoint = |key: &str, c: &mut Context<'_>| -> Result<Option<Utf16>, EngineError> {
        if let Some(fields) = fields {
            let Some(node) = gm(fields, key, c)? else {
                return Ok(None);
            };
            if tm(node, "kind", c)? != Some(&u("string")) {
                return Ok(None);
            }
            Ok(tm(node, "value", c)?.cloned())
        } else {
            Ok(None)
        }
    };
    let source = if outward { endpoint(skey, c)? } else { None };
    let target = if outward { endpoint(tkey, c)? } else { None };
    let column = if outward { endpoint(ckey, c)? } else { None };
    let invalid = !object
        || outward
            && (source.as_ref().is_none_or(|x| x.is_empty())
                || target.as_ref().is_none_or(|x| x.is_empty())
                || column.as_ref().is_none_or(|x| x.is_empty()));
    let mut resolved = None;
    if let Some(src) = source.as_ref() {
        if let Some(elems) = array_metered(module, "elements", c)? {
            for elem in elems {
                c.charge_work(1, path.clone())?;
                if tm(elem, "name", c)? == Some(src) {
                    let mid = tm(module, "id", c)?.cloned().ok_or_else(|| {
                        err(
                            "TABLESPEC_RELATIONSHIP_SOURCE",
                            "/modules/id",
                            "Table module ID missing",
                        )
                    })?;
                    let eid = tm(elem, "id", c)?.cloned().ok_or_else(|| {
                        err(
                            "TABLESPEC_RELATIONSHIP_SOURCE",
                            "/modules/elements/id",
                            "Element ID missing",
                        )
                    })?;
                    resolved = Some(obj(vec![
                        ("module", Value::String(mid)),
                        ("element", Value::String(eid)),
                    ]));
                    break;
                }
            }
        }
    }
    let basis = if invalid {
        "Malformed native endpoint metadata is retained without interpretation"
    } else if carrier == "unknown" {
        "Unrecognized relationship metadata remains uninterpreted"
    } else {
        "Native metadata only; target Key identity, coherent participation, lifecycle, enforcement and authored intent are not established"
    };
    let state = if invalid {
        "invalid"
    } else if carrier == "unknown" {
        "unknown"
    } else {
        "declared"
    };
    let unresolved_source = outward && source.is_some() && resolved.is_none();
    let observation = obj(vec![
        ("nativePath", Value::String(path.clone())),
        ("carrier", t(carrier)),
        ("state", t(state)),
        ("native", copy_json(node, c)?),
        (
            "sourceColumn",
            source.clone().map(Value::String).unwrap_or(Value::Null),
        ),
        (
            "targetTable",
            target.map(Value::String).unwrap_or(Value::Null),
        ),
        (
            "targetColumn",
            column.map(Value::String).unwrap_or(Value::Null),
        ),
        ("resolvedSource", resolved.unwrap_or(Value::Null)),
        ("enforcement", t("unknown")),
        ("authorIntent", t("unknown")),
        ("basis", t(basis)),
    ]);
    obs.push(observation);
    loss(
        path.clone(),
        node,
        if invalid {
            "not-expressible"
        } else {
            "unknown"
        },
        basis,
        res,
        diag,
        c,
    )?;
    if unresolved_source {
        loss(path,node,"not-expressible","Native source column does not resolve to this table; no implicit or cross-table field is invented",res,diag,c)?
    }
    Ok(())
}
pub(crate) fn classify_table_spec_relationships(
    input: &Value,
    request_in: &Value,
    adapter: &TableSpecRuntime,
    engine: &Engine,
    _registry: &Registry,
    _caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(engine, ctx)?;
    validate(
        request_in,
        &rt.request,
        ctx,
        "TABLESPEC_RELATIONSHIP_REQUEST",
    )?;
    let source = copy_json(input, ctx)?;
    let request = copy_json(request_in, ctx)?;
    let _archive = archive(&source, adapter, ctx)?;
    let table = adapter.get_table(&source, ctx)?;
    if tm(&table, "kind", ctx)? != Some(&u("object")) {
        return Err(err(
            "TABLESPEC_RELATIONSHIP_SOURCE",
            "",
            "Expected native table object",
        ));
    }

    let mut observations = Vec::new();
    let mut residuals = Vec::new();
    let mut diagnostics = Vec::new();
    let mut conflict = false;
    let extensions = gm(&source, "extensions", ctx)?.ok_or_else(|| {
        err(
            "TABLESPEC_RELATIONSHIP_SOURCE",
            "/extensions",
            "Extensions required",
        )
    })?;
    if let Some(existing) = gm(extensions, "umf.tablespec.relationships", ctx)? {
        conflict = true;
        loss(u("/extensions/umf.tablespec.relationships"), existing, "unknown",
            "Existing observations must not be overwritten; reclassify the retained original source",
            &mut residuals, &mut diagnostics, ctx)?;
    }
    let vocabularies = gm(&source, "vocabularies", ctx)?.ok_or_else(|| {
        err(
            "TABLESPEC_RELATIONSHIP_SOURCE",
            "/vocabularies",
            "Vocabularies required",
        )
    })?;
    if let Some(existing) = gm(vocabularies, "umf.tablespec.relationships", ctx)? {
        if tm(existing, "version", ctx)? != Some(&u("1.0.0")) {
            conflict = true;
            loss(
                u("/vocabularies/umf.tablespec.relationships"),
                existing,
                "unknown",
                "Incompatible existing vocabulary version",
                &mut residuals,
                &mut diagnostics,
                ctx,
            )?;
        }
    }
    let modules = array_metered(&source, "modules", ctx)?.ok_or_else(|| {
        err(
            "TABLESPEC_RELATIONSHIP_SOURCE",
            "/modules",
            "Modules required",
        )
    })?;
    let mut module = None;
    for candidate in modules {
        ctx.charge_work(1, u("/modules"))?;
        if tm(candidate, "id", ctx)? == Some(&u("table")) {
            module = Some(candidate);
            break;
        }
    }
    let module = module.ok_or_else(|| {
        err(
            "TABLESPEC_RELATIONSHIP_SOURCE",
            "/modules",
            "Table module required",
        )
    })?;
    let members = gm(&table, "members", ctx)?.ok_or_else(|| {
        err(
            "TABLESPEC_RELATIONSHIP_SOURCE",
            "/extensions/umf.tablespec/root/members",
            "Table members required",
        )
    })?;
    let root = u("/extensions/umf.tablespec/root/members/relationships");
    if let Some(relations) = gm(members, "relationships", ctx)? {
        if tm(relations, "kind", ctx)? != Some(&u("null")) {
            if tm(relations, "kind", ctx)? == Some(&u("object")) {
                if let Some(Value::Object(entries)) = gm(relations, "members", ctx)? {
                    for (name, node) in entries {
                        ctx.charge_work(name.len().saturating_add(1), root.clone())?;
                        let carrier = if name == &u("foreign_keys") {
                            Some("foreign_keys")
                        } else if name == &u("outgoing") {
                            Some("outgoing")
                        } else if name == &u("referenced_by") {
                            Some("referenced_by")
                        } else if name == &u("incoming") {
                            Some("incoming")
                        } else {
                            None
                        };
                        let mut path_units = root.clone().into_units();
                        path_units.extend(u("/members/").into_units());
                        for unit in name.units() {
                            if *unit == b'~' as u16 {
                                path_units.extend(u("~0").into_units());
                            } else if *unit == b'/' as u16 {
                                path_units.extend(u("~1").into_units());
                            } else {
                                path_units.push(*unit);
                            }
                        }
                        let path = Utf16::new(path_units);
                        if let Some(carrier) = carrier {
                            if tm(node, "kind", ctx)? == Some(&u("null")) {
                                continue;
                            }
                            if tm(node, "kind", ctx)? == Some(&u("array")) {
                                if let Some(Value::Array(items)) = gm(node, "items", ctx)? {
                                    for (index, item) in items.iter().enumerate() {
                                        ctx.charge_work(1, path.clone())?;
                                        let mut item_path = path.clone().into_units();
                                        item_path
                                            .extend(u(&format!("/items/{index}")).into_units());
                                        observe(
                                            item,
                                            Utf16::new(item_path),
                                            carrier,
                                            module,
                                            &mut observations,
                                            &mut residuals,
                                            &mut diagnostics,
                                            ctx,
                                        )?;
                                    }
                                }
                            } else {
                                observe(
                                    node,
                                    path.clone(),
                                    carrier,
                                    module,
                                    &mut observations,
                                    &mut residuals,
                                    &mut diagnostics,
                                    ctx,
                                )?;
                                loss(
                                    path,
                                    node,
                                    "not-expressible",
                                    "Native relationship carrier must be an array or null",
                                    &mut residuals,
                                    &mut diagnostics,
                                    ctx,
                                )?;
                            }
                        } else {
                            observe(
                                node,
                                path,
                                "unknown",
                                module,
                                &mut observations,
                                &mut residuals,
                                &mut diagnostics,
                                ctx,
                            )?;
                        }
                    }
                }
            } else {
                observe(
                    relations,
                    root,
                    "unknown",
                    module,
                    &mut observations,
                    &mut residuals,
                    &mut diagnostics,
                    ctx,
                )?;
            }
        }
    }
    let mut outcome = "exact";
    if !residuals.is_empty() {
        outcome = "unknown";
        for residual in &residuals {
            ctx.charge_work(1, u("/residuals"))?;
            if tm(residual, "outcome", ctx)? == Some(&u("not-expressible")) {
                outcome = "not-expressible";
                break;
            }
        }
    }
    let strict = tm(&request, "mode", ctx)? == Some(&u("strict"));
    let blocked = conflict || (strict && !residuals.is_empty());
    for diagnostic in &mut diagnostics {
        set(
            diagnostic,
            "severity",
            t(if blocked { "error" } else { "warning" }),
        )?;
    }
    let mut result = obj(vec![
        ("operation", t("classify-tablespec-relationships")),
        ("version", t("1.0.0")),
        ("status", t(if blocked { "blocked" } else { "classified" })),
        ("outcome", t(outcome)),
        ("source", copy_json(&source, ctx)?),
        ("request", copy_json(&request, ctx)?),
        (
            "binding",
            obj(vec![
                ("id", t("umf.tablespec.relationships")),
                ("version", t("1.0.0")),
                ("nativeVersion", t(NATIVE_VERSION)),
                ("subset", t(SUBSET)),
            ]),
        ),
        ("observations", Value::Array(observations)),
        ("residuals", Value::Array(residuals)),
        ("diagnostics", Value::Array(diagnostics)),
    ]);
    if !blocked {
        let mut target = copy_json(&source, ctx)?;
        let vocabularies = gm(&target, "vocabularies", ctx)?.ok_or_else(|| {
            err(
                "TABLESPEC_RELATIONSHIP_TARGET",
                "/vocabularies",
                "Vocabularies missing",
            )
        })?;
        if gm(vocabularies, "umf.tablespec.relationships", ctx)?.is_none() {
            let vocabularies = get_mut(&mut target, "vocabularies").ok_or_else(|| {
                err(
                    "TABLESPEC_RELATIONSHIP_TARGET",
                    "/vocabularies",
                    "Vocabularies missing",
                )
            })?;
            set(
                vocabularies,
                "umf.tablespec.relationships",
                obj(vec![("version", t("1.0.0"))]),
            )?;
        }
        let extensions = get_mut(&mut target, "extensions").ok_or_else(|| {
            err(
                "TABLESPEC_RELATIONSHIP_TARGET",
                "/extensions",
                "Extensions missing",
            )
        })?;
        set(
            extensions,
            "umf.tablespec.relationships",
            obj(vec![
                ("origin", t("classified")),
                (
                    "binding",
                    copy_json(
                        gm(&result, "binding", ctx)?.ok_or_else(|| {
                            err(
                                "TABLESPEC_RELATIONSHIP_TARGET",
                                "/binding",
                                "Binding missing",
                            )
                        })?,
                        ctx,
                    )?,
                ),
                (
                    "profile",
                    copy_json(
                        gm(&request, "profile", ctx)?.ok_or_else(|| {
                            err(
                                "TABLESPEC_RELATIONSHIP_REQUEST",
                                "/profile",
                                "Profile missing",
                            )
                        })?,
                        ctx,
                    )?,
                ),
                (
                    "observations",
                    copy_json(
                        gm(&result, "observations", ctx)?.ok_or_else(|| {
                            err(
                                "TABLESPEC_RELATIONSHIP_TARGET",
                                "/observations",
                                "Observations missing",
                            )
                        })?,
                        ctx,
                    )?,
                ),
            ]),
        )?;
        if !adapter.inspect(&target, ctx)?.valid {
            return Err(err(
                "TABLESPEC_RELATIONSHIP_TARGET",
                "",
                "Invalid classification target",
            ));
        }
        let _ = archive(&target, adapter, ctx)?;
        set(&mut result, "target", target)?;
    }
    validate(&result, &rt.result, ctx, "TABLESPEC_RELATIONSHIP_RESULT")?;
    Ok(result)
}
pub(crate) fn verify_table_spec_relationship_classification(
    receipt: &Value,
    current: &Value,
    adapter: &TableSpecRuntime,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(engine, ctx)?;
    validate(receipt, &rt.result, ctx, "TABLESPEC_RELATIONSHIP_RECEIPT")?;
    if tm(receipt, "status", ctx)? != Some(&u("classified")) {
        return Err(err(
            "TABLESPEC_RELATIONSHIP_RECEIPT",
            "",
            "Expected classified receipt",
        ));
    }
    let saved = copy_json(receipt, ctx)?;
    let source = gm(&saved, "source", ctx)?
        .ok_or_else(|| err("TABLESPEC_RELATIONSHIP_RECEIPT", "", "Source missing"))?;
    let request = gm(&saved, "request", ctx)?
        .ok_or_else(|| err("TABLESPEC_RELATIONSHIP_RECEIPT", "", "Request missing"))?;
    let expected =
        classify_table_spec_relationships(source, request, adapter, engine, registry, caps, ctx)?;
    if !equal(&saved, &expected, ctx)? {
        return Err(err(
            "TABLESPEC_RELATIONSHIP_RECEIPT",
            "",
            "Receipt differs from retained source classification",
        ));
    }
    if !equal(
        current,
        gm(&saved, "target", ctx)?
            .ok_or_else(|| err("TABLESPEC_RELATIONSHIP_RECEIPT", "", "Target missing"))?,
        ctx,
    )? {
        return Err(err(
            "TABLESPEC_RELATIONSHIP_STALE",
            "",
            "Classification target changed",
        ));
    }
    Ok(saved)
}
pub(crate) fn recover_table_spec_relationship_source(
    receipt: &Value,
    current: &Value,
    adapter: &TableSpecRuntime,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let verified = verify_table_spec_relationship_classification(
        receipt, current, adapter, engine, registry, caps, ctx,
    )?;
    let source = gm(&verified, "source", ctx)?
        .ok_or_else(|| err("TABLESPEC_RELATIONSHIP_RECEIPT", "", "Source missing"))?;
    archive(source, adapter, ctx)
}
