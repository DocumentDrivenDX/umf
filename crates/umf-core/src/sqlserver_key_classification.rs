// SPDX-License-Identifier: MIT OR Apache-2.0
//! Native-owned interpretation of captured SQL Server rowstore key/index facts.
use crate::{
    context::Context,
    engine::{Capabilities, Engine},
    error::EngineError,
    registry::Registry,
    schema::CompiledSchema,
    serialization::{self, Format},
    sqlserver_adapter as sqlserver,
    value::{copy_json, Utf16, Value},
};
use std::sync::{Arc, OnceLock};

const RESULT_SCHEMA: &str =
    include_str!("../../../spec/core/sqlserver-key-classification.schema.json");
const NATIVE_VERSION: &str = "16.0.4295.3";
const SUBSET: &str = "Captured SQL Server 2022 v3 rowstore index observations, native equality and enforcement only; no authored identity, source authentication or native equivalence";
const RECOVERY: &str = "Original native catalog retained; authored key intent is not inferred";
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
fn arr<'a>(v: &'a Value, k: &str) -> Option<&'a [Value]> {
    match get(v, k) {
        Some(Value::Array(a)) => Some(a),
        _ => None,
    }
}
fn strv(v: &Value) -> Option<&Utf16> {
    if let Value::String(s) = v {
        Some(s)
    } else {
        None
    }
}
fn boolv(v: &Value) -> Option<bool> {
    if let Value::Bool(b) = v {
        Some(*b)
    } else {
        None
    }
}
fn num(v: &Value) -> Option<f64> {
    if let Value::Number(n) = v {
        Some(*n)
    } else {
        None
    }
}
fn err(code: &str, path: &str, msg: &str) -> EngineError {
    EngineError::new(code, u(path), msg)
}
fn set(v: &mut Value, k: &str, n: Value) -> Result<(), EngineError> {
    let Value::Object(m) = v else {
        return Err(err("SQLSERVER_KEY_TARGET", "", "Expected object"));
    };
    if let Some((_, old)) = m.iter_mut().find(|(x, _)| x == &u(k)) {
        *old = n
    } else {
        m.push((u(k), n))
    };
    Ok(())
}
fn read_json(s: &Utf16, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    serialization::read_json_value(s.units(), Format::Json, ctx)
}
fn equal(a: &Value, b: &Value, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    fn canon(v: &Value, c: &mut Context<'_>) -> Result<Value, EngineError> {
        match v {
            Value::Array(a) => {
                let mut o = Vec::with_capacity(a.len());
                for x in a {
                    c.charge_work(1, u(""))?;
                    o.push(canon(x, c)?)
                }
                Ok(Value::Array(o))
            }
            Value::Object(m) => {
                let mut o = Vec::with_capacity(m.len());
                for (k, v) in m {
                    c.charge_work(k.len().saturating_add(1), u(""))?;
                    o.push((k.clone(), canon(v, c)?))
                }
                o.sort_by(|a, b| a.0.cmp(&b.0));
                Ok(Value::Object(o))
            }
            _ => copy_json(v, c),
        }
    }
    Ok(canon(a, ctx)? == canon(b, ctx)?)
}
struct Runtime {
    result: CompiledSchema,
    request: CompiledSchema,
}
fn runtime(engine: &Engine, ctx: &mut Context<'_>) -> Result<Arc<Runtime>, EngineError> {
    static C: OnceLock<Arc<Runtime>> = OnceLock::new();
    if ctx.profile() == crate::context::ResourceProfile::Cooperative
        && ctx.limits() == crate::context::Limits::ordinary()
    {
        if let Some(r) = C.get() {
            return Ok(Arc::clone(r));
        }
    }
    let resources = engine.schema_resources_with_context(ctx)?;
    let schema = read_json(&u(RESULT_SCHEMA), ctx)?;
    let result = CompiledSchema::compile(&schema, &resources, ctx)?;
    let req = get(
        get(&schema, "properties").unwrap_or(&Value::Null),
        "request",
    )
    .ok_or_else(|| err("SCHEMA", "", "request schema missing"))?;
    let request = CompiledSchema::compile(req, &resources, ctx)?;
    let ready = Arc::new(Runtime { result, request });
    if ctx.profile() == crate::context::ResourceProfile::Cooperative
        && ctx.limits() == crate::context::Limits::ordinary()
    {
        let _ = C.set(Arc::clone(&ready));
    }
    Ok(ready)
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
            "Value does not match the pinned SQL Server Key classification schema",
        ))
    }
}
fn binding() -> Value {
    obj(vec![
        ("id", t("umf.sqlserver.keys")),
        ("version", t("1.0.0")),
        ("nativeVersion", t(NATIVE_VERSION)),
        ("subset", t(SUBSET)),
    ])
}
fn same(a: Option<&Value>, b: Option<&Value>) -> bool {
    a == b
}
fn truth(v: &Value, k: &str) -> bool {
    get(v, k).and_then(boolv).unwrap_or(false)
}
fn integer(v: &Value) -> Option<u64> {
    let n = num(v)?;
    if n.is_finite() && n >= 0.0 && n.fract() == 0.0 && n <= 9_007_199_254_740_991.0 {
        Some(n as u64)
    } else {
        None
    }
}
fn loss(
    res: &mut Vec<Value>,
    path: &str,
    value: &Value,
    reason: &str,
    outcome: &str,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    res.push(obj(vec![
        ("path", t(path)),
        ("value", copy_json(value, ctx)?),
        ("outcome", t(outcome)),
        ("reason", t(reason)),
        ("recovery", t(RECOVERY)),
    ]));
    Ok(())
}
fn text_eq(v: &Value, k: &str, s: &str) -> bool {
    text(v, k) == Some(&u(s))
}
fn is_int_type(system: u64, base: &Utf16) -> bool {
    matches!(system, 104 | 48 | 52 | 56 | 127)
        && base.to_utf8().ok().is_some_and(|s| {
            matches!(
                s.as_str(),
                "bit" | "tinyint" | "smallint" | "int" | "bigint"
            )
        })
}
fn scalar_is_exact(v: &Value) -> bool {
    let Some(system) = get(v, "system_type_id").and_then(integer) else {
        return false;
    };
    let Some(base) = get(v, "base_type_name").and_then(strv) else {
        return false;
    };
    if truth(v, "is_computed") || truth(v, "is_user_defined") || truth(v, "is_assembly_type") {
        return false;
    }
    if matches!(system, 167 | 175 | 231 | 239 | 165 | 173) {
        return false;
    }
    let expected = match system {
        104 => "bit",
        48 => "tinyint",
        52 => "smallint",
        56 => "int",
        127 => "bigint",
        106 => "decimal",
        108 => "numeric",
        60 => "money",
        122 => "smallmoney",
        _ => return false,
    };
    base.to_utf8().ok().as_deref() == Some(expected)
}
fn classify_body(
    input: &Value,
    request: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(engine, ctx)?;
    validate(request, &rt.request, ctx, "SQLSERVER_KEY_REQUEST")?;
    let source = copy_json(input, ctx)?;
    let request = copy_json(request, ctx)?;
    let inspected = engine.validate_document(&source, registry, caps, ctx)?;
    if !inspected.valid || text(&source, "umf") != Some(&u("0.10.0")) {
        return Err(err(
            "SQLSERVER_KEY_SOURCE",
            "",
            "Valid current 0.10.0 envelope required",
        ));
    }
    let native_text = text(&request, "nativeSource").ok_or_else(|| {
        err(
            "SQLSERVER_KEY_REQUEST",
            "/nativeSource",
            "Native source required",
        )
    })?;
    let catalog = sqlserver::SqlServerCatalog::import(native_text, ctx)?;
    let exported = sqlserver::export_document(&source, ctx)?;
    let canonical_native = catalog.export(ctx)?;
    if canonical_native != exported {
        return Err(err(
            "SQLSERVER_KEY_ARCHIVE",
            "/nativeSource",
            "Native archive differs from retained catalog",
        ));
    }
    let native = read_json(&canonical_native, ctx)?;
    if !text_eq(&native, "profile", "sqlserver-catalog-v3")
        || !text_eq(&native, "state", "captured")
        || text(&native, "serverVersion") != Some(&u(NATIVE_VERSION))
    {
        return Err(err(
            "SQLSERVER_KEY_PROFILE",
            "/nativeSource",
            "Expected captured v3 catalog from pinned SQL Server 16.0.4295.3",
        ));
    }
    let tables = arr(&native, "tables").ok_or_else(|| {
        err(
            "SQLSERVER_KEY_CORRELATION",
            "/tables",
            "Required table inventory is unavailable",
        )
    })?;
    let indexes_meta = sqlserver::index_metadata_value(&catalog, ctx)?;
    let column_meta = sqlserver::column_metadata_value(&catalog, ctx)?;
    let im = arr(&indexes_meta, "tables").ok_or_else(|| {
        err(
            "SQLSERVER_KEY_CORRELATION",
            "/indexes",
            "Index metadata unavailable",
        )
    })?;
    let cm = match &column_meta {
        Value::Array(columns) => columns.as_slice(),
        _ => {
            return Err(err(
                "SQLSERVER_KEY_CORRELATION",
                "/columns",
                "Column metadata unavailable",
            ))
        }
    };
    let mut result = obj(vec![
        ("operation", t("classify-sqlserver-keys")),
        ("version", t("1.0.0")),
        ("status", t("classified")),
        ("outcome", t("exact")),
        ("source", copy_json(&source, ctx)?),
        ("request", copy_json(&request, ctx)?),
        ("binding", binding()),
        ("observations", Value::Array(vec![])),
        ("residuals", Value::Array(vec![])),
        ("diagnostics", Value::Array(vec![])),
    ]);
    let mut residuals = Vec::new();
    let mut observations = Vec::new();
    let mut conflict = false;
    if get(&source, "extensions")
        .and_then(|x| get(x, "umf.sqlserver.keys"))
        .is_some()
    {
        conflict = true;
        loss(
            &mut residuals,
            "/extensions/umf.sqlserver.keys",
            get(&source, "extensions")
                .and_then(|x| get(x, "umf.sqlserver.keys"))
                .unwrap(),
            "Existing observations cannot be overwritten",
            "unknown",
            ctx,
        )?
    }
    if let Some(v) = get(&source, "vocabularies").and_then(|x| get(x, "umf.sqlserver.keys")) {
        if !text_eq(v, "version", "1.0.0") {
            conflict = true;
            loss(
                &mut residuals,
                "/vocabularies/umf.sqlserver.keys",
                v,
                "Incompatible vocabulary version",
                "unknown",
                ctx,
            )?
        }
    }
    loss(&mut residuals,"/nativeSource",native_text_value(&request),"This captured, permission-limited catalog is not authenticated live state; all unknown native qualifiers and unclaimed metadata remain in the retained archive","unknown",ctx)?;
    let modules = arr(&source, "modules").unwrap_or(&[]);
    let module = modules
        .iter()
        .find(|m| text(m, "id") == Some(&u("sqlserver.columns")))
        .ok_or_else(|| {
            err(
                "SQLSERVER_KEY_METADATA",
                "/modules",
                "Derived SQL Server column module required",
            )
        })?;
    let elements = arr(module, "elements").unwrap_or(&[]);
    for (ti, table) in tables.iter().enumerate() {
        ctx.charge_work(1, u(&format!("/tables/{ti}")))?;
        let view = im.get(ti).ok_or_else(|| {
            err(
                "SQLSERVER_KEY_CORRELATION",
                "/indexes",
                "Index table metadata missing",
            )
        })?;
        if !truth(view, "available") || arr(table, "keys").is_none() {
            return Err(err(
                "SQLSERVER_KEY_CORRELATION",
                "/tables",
                "Required index/key inventory is unavailable",
            ));
        }
        let keys = arr(table, "keys").ok_or_else(|| {
            err(
                "SQLSERVER_KEY_CORRELATION",
                "/tables",
                "Required key inventory is unavailable",
            )
        })?;
        let ix = arr(table, "indexes").unwrap_or(&[]);
        let keypath = format!("/tables/{ti}/keys");
        ctx.charge_work(keys.len().saturating_mul(ix.len()), u(&keypath))?;
        for keyrow in keys {
            let name = get(keyrow, "name");
            let matching: Vec<&Value> = ix.iter().filter(|i| same(get(i, "name"), name)).collect();
            if matching.len() != 1 {
                return Err(err(
                    "SQLSERVER_KEY_CORRELATION",
                    &keypath,
                    "Constraint has no unique corresponding index",
                ));
            }
            let idx = matching[0];
            let kind = text(keyrow, "kind")
                .and_then(|x| x.to_utf8().ok())
                .unwrap_or_default();
            if !truth(idx, "is_unique")
                || truth(idx, "is_primary_key") != (kind == "PK")
                || truth(idx, "is_unique_constraint") != (kind == "UQ")
                || !same(get(idx, "is_disabled"), get(keyrow, "is_disabled"))
                || !same(get(idx, "ignore_dup_key"), get(keyrow, "ignore_dup_key"))
                || !same(get(idx, "type_desc"), get(keyrow, "index_type"))
            {
                return Err(err(
                    "SQLSERVER_KEY_CORRELATION",
                    &keypath,
                    "Constraint and index enforcement assertions disagree",
                ));
            }
            let ord: Vec<&Value> = arr(idx, "columns")
                .unwrap_or(&[])
                .iter()
                .filter(|c| integer(get(c, "key_ordinal").unwrap_or(&Value::Null)).unwrap_or(0) > 0)
                .collect();
            let declared: Vec<&Value> = arr(keyrow, "columns").unwrap_or(&[]).iter().collect();
            if ord.len() != declared.len() {
                return Err(err(
                    "SQLSERVER_KEY_CORRELATION",
                    &keypath,
                    "Constraint and index tuples disagree",
                ));
            }
            let mut pairs = ord.clone();
            pairs.sort_by_key(|c| {
                integer(get(c, "key_ordinal").unwrap_or(&Value::Null)).unwrap_or(0)
            });
            let mut d = declared.clone();
            d.sort_by_key(|c| integer(get(c, "key_ordinal").unwrap_or(&Value::Null)).unwrap_or(0));
            for (a, b) in pairs.iter().zip(d.iter()) {
                for k in ["column_id", "name", "key_ordinal", "is_descending_key"] {
                    if !same(get(a, k), get(b, k)) {
                        return Err(err(
                            "SQLSERVER_KEY_CORRELATION",
                            &keypath,
                            "Constraint and index tuples disagree",
                        ));
                    }
                }
            }
        }
        ctx.charge_work(ix.len(), u(&keypath))?;
        for (ii, index) in ix.iter().enumerate() {
            ctx.charge_work(1, u(&format!("/tables/{ti}/indexes/{ii}")))?;
            let p = format!("/tables/{ti}/indexes/{ii}");
            if (truth(index, "is_primary_key") || truth(index, "is_unique_constraint"))
                && !keys
                    .iter()
                    .any(|k| same(get(k, "name"), get(index, "name")))
            {
                return Err(err(
                    "SQLSERVER_KEY_CORRELATION",
                    &p,
                    "Index constraint flag has no corresponding constraint",
                ));
            }
            let primary = truth(index, "is_primary_key");
            let unique_constraint = truth(index, "is_unique_constraint");
            let unique = truth(index, "is_unique");
            if primary && unique_constraint || !unique && (primary || unique_constraint) {
                return Err(err(
                    "SQLSERVER_KEY_CORRELATION",
                    &p,
                    "Contradictory native uniqueness flags",
                ));
            }
            let mut components: Vec<&Value> = arr(index, "columns")
                .unwrap_or(&[])
                .iter()
                .filter(|c| integer(get(c, "key_ordinal").unwrap_or(&Value::Null)).unwrap_or(0) > 0)
                .collect();
            components.sort_by_key(|c| {
                integer(get(c, "key_ordinal").unwrap_or(&Value::Null)).unwrap_or(0)
            });
            let mut resolved: Vec<(&Value, String)> = Vec::new();
            let mut seen = std::collections::BTreeSet::new();
            ctx.charge_work(
                components
                    .len()
                    .saturating_mul(arr(table, "columns").unwrap_or(&[]).len()),
                u(&p),
            )?;
            for (j, c) in components.iter().enumerate() {
                let id = integer(get(c, "column_id").unwrap_or(&Value::Null))
                    .ok_or_else(|| err("SQLSERVER_KEY_CORRELATION", &p, "Invalid key column id"))?;
                let ordinal = integer(get(c, "key_ordinal").unwrap_or(&Value::Null)).unwrap_or(0);
                if ordinal != (j + 1) as u64 || truth(c, "is_included_column") || !seen.insert(id) {
                    return Err(err(
                        "SQLSERVER_KEY_CORRELATION",
                        &p,
                        "Key ordinals must be contiguous, unique and separate from INCLUDE columns",
                    ));
                }
                let ci = arr(table, "columns")
                    .unwrap_or(&[])
                    .iter()
                    .find(|f| {
                        integer(get(f, "column_id").unwrap_or(&Value::Null)) == Some(id)
                            && same(get(f, "name"), get(c, "name"))
                    })
                    .ok_or_else(|| {
                        err(
                            "SQLSERVER_KEY_CORRELATION",
                            &p,
                            "Index component does not resolve to its captured column",
                        )
                    })?;
                let ci_index = arr(table, "columns")
                    .unwrap_or(&[])
                    .iter()
                    .position(|f| std::ptr::eq(f, ci))
                    .unwrap_or(0);
                let meta_path = format!("/tables/{ti}/columns/{ci_index}");
                let meta = cm
                    .iter()
                    .find(|m| text(m, "path") == Some(&u(&meta_path)))
                    .ok_or_else(|| {
                        err(
                            "SQLSERVER_KEY_CORRELATION",
                            &p,
                            "Captured Field metadata missing",
                        )
                    })?;
                let elem_id = text(get(meta, "element").unwrap_or(&Value::Null), "id")
                    .cloned()
                    .ok_or_else(|| {
                        err(
                            "SQLSERVER_KEY_CORRELATION",
                            &p,
                            "Captured Field identity missing",
                        )
                    })?;
                let elem = elements
                    .iter()
                    .find(|e| text(e, "id") == Some(&elem_id))
                    .ok_or_else(|| {
                        err(
                            "SQLSERVER_KEY_CORRELATION",
                            &p,
                            "Derived Field identity missing",
                        )
                    })?;
                resolved.push((ci, elem_id.to_utf8().unwrap_or_default()));
                let _ = elem;
            }
            let path = format!("/tables/{ti}/indexes/{ii}");
            let schema = text(table, "schema").cloned().unwrap_or_default();
            let table_name = text(table, "name").cloned().unwrap_or_default();
            let name = match get(index, "name") {
                Some(Value::Null) | None => Value::Null,
                Some(value @ Value::String(_)) => copy_json(value, ctx)?,
                _ => Value::Null,
            };
            let ids = resolved
                .iter()
                .map(|(_, id)| obj(vec![("module", t("sqlserver.columns")), ("element", t(id))]))
                .collect();
            let mut obs = obj(vec![
                (
                    "identity",
                    obj(vec![
                        ("schema", Value::String(schema)),
                        ("table", Value::String(table_name)),
                        (
                            "indexId",
                            Value::Number(
                                integer(get(index, "index_id").unwrap_or(&Value::Null)).unwrap_or(0)
                                    as f64,
                            ),
                        ),
                        ("name", name),
                    ]),
                ),
                ("nativePath", t(&path)),
                ("fields", Value::Array(ids)),
                ("primary", Value::Bool(primary)),
                ("enforcement", t("unknown")),
                ("equality", t("unknown")),
                (
                    "ignoreDuplicateKey",
                    Value::Bool(truth(index, "ignore_dup_key")),
                ),
                ("authorIntent", t("unknown")),
                ("provenance", t("inferred")),
                ("scope", t("captured-table-stored-values")),
                ("reasons", Value::Array(vec![])),
            ]);
            let mut reasons = Vec::new();
            let mut reason = |s: &str| reasons.push(t(s));
            if truth(index, "is_disabled") || truth(index, "is_hypothetical") {
                set(&mut obs, "enforcement", t("unavailable"))?;
                reason("Disabled or hypothetical indexes do not establish enforced uniqueness")
            } else if !unique {
                set(&mut obs, "enforcement", t("not-unique"))?;
                reason("Index does not assert uniqueness")
            } else if truth(index, "has_filter")
                || !matches!(get(index, "filter_definition"), Some(Value::Null) | None)
            {
                set(&mut obs, "enforcement", t("conditional"))?;
                reason("Filtered uniqueness does not cover all stored rows")
            } else if !matches!(
                integer(get(index, "type").unwrap_or(&Value::Null)),
                Some(1 | 2)
            ) || !text_eq(
                index,
                "type_desc",
                if integer(get(index, "type").unwrap_or(&Value::Null)) == Some(1) {
                    "CLUSTERED"
                } else {
                    "NONCLUSTERED"
                },
            ) || components.is_empty()
                || resolved.iter().any(|(c, _)| truth(c, "is_computed"))
            {
                reason("Index type, missing tuple or computed component requires separate qualification")
            } else if resolved.iter().any(|(c, _)| truth(c, "is_nullable")) {
                set(&mut obs, "enforcement", t("nullable"))?;
                reason("Unique SQL NULL treatment does not establish required components")
            } else {
                set(&mut obs, "enforcement", t("immediate-unique-nonnull"))?;
                reason("Captured unconditional rowstore uniqueness and NOT NULL cover the native stored tuple")
            }
            if truth(index, "ignore_dup_key") {
                reason("IGNORE_DUP_KEY can skip incoming duplicates instead of failing the write; stored uniqueness is a separate assertion")
            }
            let mut exact = !components.is_empty();
            let mut incompatible = false;
            for (c, _) in &resolved {
                if truth(c, "is_computed")
                    || truth(c, "is_user_defined")
                    || truth(c, "is_assembly_type")
                {
                    exact = false;
                    continue;
                }
                let sys = integer(get(c, "system_type_id").unwrap_or(&Value::Null)).unwrap_or(0);
                if matches!(sys, 167 | 175 | 231 | 239 | 165 | 173) {
                    exact = false;
                    incompatible = true;
                    reason("Native string trailing-space or binary trailing-zero equality can collapse distinct ideal values")
                } else if !scalar_is_exact(c) {
                    exact = false;
                    reason("Native type has no qualified core Key comparator")
                }
            }
            set(
                &mut obs,
                "equality",
                t(if exact {
                    "exact-on-representable-values"
                } else if incompatible {
                    "incompatible"
                } else {
                    "unknown"
                }),
            )?;
            drop(reason);
            set(&mut obs, "reasons", Value::Array(reasons))?;
            let raw = arr(view, "indexes")
                .and_then(|items| items.get(ii))
                .ok_or_else(|| {
                    err(
                        "SQLSERVER_KEY_METADATA",
                        "/indexes",
                        "Captured index metadata is unavailable",
                    )
                })?;
            loss(&mut residuals,&path,raw,"Native index names and enforcement do not establish authored stable key IDs, names or identity intent","unknown",ctx)?;
            if text(&obs, "enforcement") != Some(&u("immediate-unique-nonnull")) {
                let enforcement = text(&obs, "enforcement");
                let why = arr(&obs, "reasons")
                    .and_then(|x| x.first())
                    .and_then(strv)
                    .and_then(|x| x.to_utf8().ok())
                    .unwrap_or_else(|| "Native enforcement remains unresolved".to_owned());
                loss(
                    &mut residuals,
                    &path,
                    raw,
                    &why,
                    if enforcement == Some(&u("unknown")) {
                        "unknown"
                    } else {
                        "not-expressible"
                    },
                    ctx,
                )?
            }
            let eq = text(&obs, "equality");
            let eq_reason = if eq == Some(&u("exact-on-representable-values")) {
                "Comparator agreement covers representable stored values only; native width, precision, scale and input coercions remain attached"
            } else if eq == Some(&u("incompatible")) {
                "Native comparator/refinements do not establish exact UMF tuple equality"
            } else {
                "Native comparator/refinements do not establish exact UMF tuple equality"
            };
            loss(
                &mut residuals,
                &format!("{path}/columns"),
                raw,
                eq_reason,
                if eq == Some(&u("incompatible")) {
                    "not-expressible"
                } else {
                    "unknown"
                },
                ctx,
            )?;
            observations.push(obs);
        }
    }
    let outcome = if residuals
        .iter()
        .any(|r| text(r, "outcome") == Some(&u("not-expressible")))
    {
        "not-expressible"
    } else if residuals.is_empty() {
        "exact"
    } else {
        "unknown"
    };
    set(&mut result, "outcome", t(outcome))?;
    if conflict || text(&request, "mode") == Some(&u("strict")) {
        set(&mut result, "status", t("blocked"))?
    } else {
        let mut target = copy_json(&source, ctx)?;
        let vocab = get_mut(&mut target, "vocabularies").ok_or_else(|| {
            err(
                "SQLSERVER_KEY_TARGET",
                "/vocabularies",
                "Vocabulary map missing",
            )
        })?;
        if get(vocab, "umf.sqlserver.keys").is_none() {
            set(
                vocab,
                "umf.sqlserver.keys",
                obj(vec![("version", t("1.0.0"))]),
            )?
        }
        if get(&target, "extensions").is_none() {
            set(&mut target, "extensions", Value::Object(vec![]))?;
        }
        let observations_extension = observations
            .iter()
            .map(|observation| copy_json(observation, ctx))
            .collect::<Result<Vec<_>, _>>()?;
        let extensions = get_mut(&mut target, "extensions").ok_or_else(|| {
            err(
                "SQLSERVER_KEY_TARGET",
                "/extensions",
                "Extension map missing",
            )
        })?;
        set(
            extensions,
            "umf.sqlserver.keys",
            obj(vec![
                ("origin", t("classified")),
                ("binding", binding()),
                ("profile", t("captured-stored-values")),
                ("nativeSource", copy_json(native_text_value(&request), ctx)?),
                ("observations", Value::Array(observations_extension)),
            ]),
        )?;
        let valid = engine.validate_document(&target, registry, caps, ctx)?;
        if !valid.valid {
            return Err(err("SQLSERVER_KEY_TARGET", "", "Invalid target"));
        }
        set(&mut result, "target", target)?;
    }
    let mut diags = Vec::with_capacity(residuals.len());
    for residual in &residuals {
        ctx.charge_work(1, text(residual, "path").cloned().unwrap_or_default())?;
        diags.push(obj(vec![
            ("code", t("SQLSERVER_KEY_RESIDUAL")),
            (
                "path",
                copy_json(get(residual, "path").unwrap_or(&Value::Null), ctx)?,
            ),
            (
                "message",
                copy_json(get(residual, "reason").unwrap_or(&Value::Null), ctx)?,
            ),
            (
                "severity",
                t(if text(&result, "status") == Some(&u("blocked")) {
                    "error"
                } else {
                    "warning"
                }),
            ),
        ]));
    }
    set(&mut result, "observations", Value::Array(observations))?;
    set(&mut result, "residuals", Value::Array(residuals))?;
    set(&mut result, "diagnostics", Value::Array(diags))?;
    validate(&result, &rt.result, ctx, "SQLSERVER_KEY_RESULT")?;
    Ok(result)
}
fn native_text_value(request: &Value) -> &Value {
    get(request, "nativeSource").unwrap_or(&Value::Null)
}
pub fn classify(
    input: &Value,
    request: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    classify_body(input, request, engine, registry, caps, ctx)
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
    validate(receipt, &rt.result, ctx, "SQLSERVER_KEY_RECEIPT")?;
    if text(receipt, "status") != Some(&u("classified")) {
        return Err(err(
            "SQLSERVER_KEY_RECEIPT",
            "/status",
            "Expected complete classified receipt",
        ));
    }
    let expected = classify_body(
        get(receipt, "source")
            .ok_or_else(|| err("SQLSERVER_KEY_RECEIPT", "/source", "Source required"))?,
        get(receipt, "request")
            .ok_or_else(|| err("SQLSERVER_KEY_RECEIPT", "/request", "Request required"))?,
        engine,
        registry,
        caps,
        ctx,
    )?;
    if !equal(receipt, &expected, ctx)? {
        return Err(err(
            "SQLSERVER_KEY_RECEIPT",
            "",
            "Classification disagrees with retained native source",
        ));
    }
    let target = get(receipt, "target")
        .ok_or_else(|| err("SQLSERVER_KEY_RECEIPT", "/target", "Target required"))?;
    if !equal(current, target, ctx)? {
        return Err(err(
            "SQLSERVER_KEY_STALE",
            "",
            "Current model changed; recompute classification",
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
    let checked = verify(receipt, current, engine, registry, caps, ctx)?;
    text(
        get(&checked, "request")
            .ok_or_else(|| err("SQLSERVER_KEY_RECEIPT", "/request", "Request required"))?,
        "nativeSource",
    )
    .cloned()
    .ok_or_else(|| {
        err(
            "SQLSERVER_KEY_RECEIPT",
            "/request/nativeSource",
            "Native source required",
        )
    })
}
