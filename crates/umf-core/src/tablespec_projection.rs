// SPDX-License-Identifier: MIT OR Apache-2.0
//! Native-owned authored Field and Record projections to TableSpec.
use crate::{
    context::Context,
    engine::{Capabilities, Engine},
    error::EngineError,
    registry::Registry,
    schema::CompiledSchema,
    serialization::{self, Format},
    tablespec_adapter::{TableSpecFormat, TableSpecRuntime},
    value::{copy_json, Utf16, Value},
};

const FIELD_SCHEMA: &str =
    include_str!("../../../spec/core/field-tablespec-projection.schema.json");
const RECORD_SCHEMA: &str =
    include_str!("../../../spec/core/record-tablespec-projection.schema.json");
const KIND_SCHEMA: &str = include_str!("../../../spec/core/kind-operation-v6.schema.json");
const NATIVE_VERSION: &str = "647e8e566ad78b864282ec65c0b0b2237aa63084";
const RECOVERY: &str = "Recover source meaning with retained projection receipt; native-only import does not recover author intent";
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
fn remove(v: &mut Value, k: &str) {
    if let Value::Object(fields) = v {
        fields.retain(|(name, _)| name != &u(k));
    }
}
fn s(v: &Value) -> Option<String> {
    if let Value::String(x) = v {
        x.to_utf8().ok()
    } else {
        None
    }
}
fn st(v: &Value, k: &str) -> Option<String> {
    get(v, k).and_then(s)
}
fn arr<'a>(v: &'a Value, k: &str) -> Option<&'a [Value]> {
    if let Some(Value::Array(a)) = get(v, k) {
        Some(a)
    } else {
        None
    }
}
fn err(code: &str, msg: impl Into<String>, path: &str) -> EngineError {
    EngineError::new(code, u(path), msg.into())
}
fn schema(
    src: &str,
    engine: &Engine,
    ctx: &mut Context<'_>,
) -> Result<CompiledSchema, EngineError> {
    let v =
        serialization::read_json_value(&src.encode_utf16().collect::<Vec<_>>(), Format::Json, ctx)?;
    let mut r = engine.schema_resources_with_context(ctx)?;
    r.entries.push((
        u("urn:umf:core:kind-operation:6.0.0"),
        serialization::read_json_value(
            &KIND_SCHEMA.encode_utf16().collect::<Vec<_>>(),
            Format::Json,
            ctx,
        )?,
    ));
    CompiledSchema::compile(&v, &r, ctx)
}
fn validate(
    v: &Value,
    sc: &CompiledSchema,
    ctx: &mut Context<'_>,
    code: &str,
) -> Result<(), EngineError> {
    if sc.validate(v, ctx)?.is_empty() {
        Ok(())
    } else {
        Err(err(
            code,
            "Value does not satisfy the pinned TableSpec projection schema",
            "",
        ))
    }
}
fn equal(a: &Value, b: &Value, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    fn c(v: &Value, ctx: &mut Context<'_>, depth: usize) -> Result<Value, EngineError> {
        if depth > ctx.limits().max_depth {
            return Err(err("LIMIT", "Canonicalization depth exceeded", ""));
        }
        ctx.charge_work(1, u(""))?;
        match v {
            Value::Array(a) => Ok(Value::Array(
                a.iter()
                    .map(|x| c(x, ctx, depth + 1))
                    .collect::<Result<_, _>>()?,
            )),
            Value::Object(m) => {
                let mut x = Vec::new();
                for (k, v) in m {
                    ctx.charge_work(k.len() + 1, u(""))?;
                    x.push((k.clone(), c(v, ctx, depth + 1)?));
                }
                x.sort_by(|a, b| a.0.cmp(&b.0));
                Ok(Value::Object(x))
            }
            _ => copy_json(v, ctx),
        }
    }
    Ok(c(a, ctx, 0)? == c(b, ctx, 0)?)
}
fn author(
    input: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<(Value, Value), EngineError> {
    let current = get(input, "target")
        .ok_or_else(|| err("CORE_KIND_RECEIPT", "Declaration target required", ""))?;
    let a = crate::core_kind::verify_core_kind_declaration(
        input, current, engine, registry, caps, ctx,
    )?;
    let source = get(&a, "target")
        .ok_or_else(|| err("CORE_KIND_RECEIPT", "Declaration target missing", ""))?;
    let source = copy_json(source, ctx)?;
    Ok((a, source))
}
fn ptr(s: &str) -> String {
    s.replace('~', "~0").replace('/', "~1")
}
fn push_loss(
    loss: &mut Vec<Value>,
    diagnostics: &mut Vec<Value>,
    path: String,
    value: &Value,
    reason: &str,
    outcome: &str,
    code: &str,
    severity: &str,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    loss.push(obj(vec![
        ("path", Value::string_utf8(&path)),
        ("value", copy_json(value, ctx)?),
        ("reason", t(reason)),
        ("outcome", t(outcome)),
        ("recovery", t(RECOVERY)),
    ]));
    diagnostics.push(obj(vec![
        ("code", t(code)),
        ("path", Value::string_utf8(&path)),
        ("message", t(reason)),
        ("severity", t(severity)),
    ]));
    Ok(())
}
fn request_text(req: &Value, key: &str) -> Result<String, EngineError> {
    st(req, key).ok_or_else(|| err("REQUEST", format!("{key} must be a string"), ""))
}
fn scalar_target(
    runtime: &TableSpecRuntime,
    description: Option<&Value>,
    id: &str,
    table: &str,
    columns: Vec<Value>,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let mut fields = vec![
        (u("version"), t("1.0")),
        (u("table_name"), Value::string_utf8(table)),
    ];
    if let Some(d) = description {
        if let Value::String(_) = d {
            fields.push((u("description"), copy_json(d, ctx)?));
        }
    }
    fields.push((u("columns"), Value::Array(columns)));
    let native = Value::Object(fields);
    let text = serialization::stringify_compact_metered(&native, ctx)?;
    let mut units = text.units().to_vec();
    units.push(10);
    let text = Utf16::new(units);
    runtime.import(&text, &Utf16::from(id), TableSpecFormat::Json, ctx)
}
fn outcome(losses: &[Value]) -> &'static str {
    if losses
        .iter()
        .any(|x| st(x, "outcome").as_deref() == Some("not-expressible"))
    {
        "not-expressible"
    } else if losses.is_empty() {
        "exact"
    } else {
        "unknown"
    }
}
pub fn project_field(
    input: &Value,
    request: &Value,
    runtime: &TableSpecRuntime,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let (a, source) = author(input, engine, registry, caps, ctx)?;
    let rs = schema(FIELD_SCHEMA, engine, ctx)?;
    let schema_doc = serialization::read_json_value(
        &FIELD_SCHEMA.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        ctx,
    )?;
    let req_schema = get(
        get(&schema_doc, "properties").unwrap_or(&Value::Null),
        "request",
    )
    .cloned()
    .ok_or_else(|| err("SCHEMA", "request schema missing", ""))?;
    let mut resources = engine.schema_resources_with_context(ctx)?;
    resources.entries.push((
        u("urn:umf:core:kind-operation:6.0.0"),
        serialization::read_json_value(
            &KIND_SCHEMA.encode_utf16().collect::<Vec<_>>(),
            Format::Json,
            ctx,
        )?,
    ));
    let rq = CompiledSchema::compile(&req_schema, &resources, ctx)?;
    validate(request, &rq, ctx, "FIELD_TABLESPEC_REQUEST")?;
    let id = request_text(request, "id")?;
    let table = request_text(request, "tableName")?;
    let column = request_text(request, "columnName")?;
    let native = request_text(request, "nativeType")?;
    let mode = request_text(request, "mode")?;
    let identity =
        get(&a, "identity").ok_or_else(|| err("CORE_KIND_RECEIPT", "identity missing", ""))?;
    let mid =
        st(identity, "module").ok_or_else(|| err("CORE_KIND_RECEIPT", "module missing", ""))?;
    let eid =
        st(identity, "element").ok_or_else(|| err("CORE_KIND_RECEIPT", "element missing", ""))?;
    let modules =
        arr(&source, "modules").ok_or_else(|| err("CORE_KIND_RECEIPT", "modules missing", ""))?;
    let mut selected = None;
    for (mi, m) in modules.iter().enumerate() {
        ctx.charge_work(1, u(""))?;
        if st(m, "id").as_deref() == Some(mid.as_str()) {
            for (ei, e) in arr(m, "elements").unwrap_or(&[]).iter().enumerate() {
                ctx.charge_work(1, u(""))?;
                if st(e, "id").as_deref() == Some(eid.as_str()) {
                    selected = Some((mi, ei, e, m));
                }
            }
        }
    }
    let (mi, ei, element, module) =
        selected.ok_or_else(|| err("FIELD_TABLESPEC_IDENTITY", "Missing declared element", ""))?;
    let path = format!("/modules/{mi}/elements/{ei}");
    let mut losses = Vec::new();
    let mut diagnostics = Vec::new();
    let hard =
        st(get(&a, "provenance").unwrap_or(&Value::Null), "kind").as_deref() != Some("field");
    let severity = if hard || mode == "strict" {
        "error"
    } else {
        "warning"
    };
    if hard {
        push_loss(
            &mut losses,
            &mut diagnostics,
            format!("{path}/kind"),
            get(element, "kind").unwrap_or(&Value::Null),
            "Record/group is not a single native column",
            "not-expressible",
            "FIELD_MEANING_NOT_PROJECTED",
            "error",
            ctx,
        )?;
    }
    if let Some(name) = get(element, "name") {
        if s(name).as_deref() != Some(column.as_str()) {
            push_loss(
                &mut losses,
                &mut diagnostics,
                format!("{path}/name"),
                name,
                "Explicit native column name differs from ideal name",
                "not-expressible",
                "FIELD_MEANING_NOT_PROJECTED",
                severity,
                ctx,
            )?;
        }
    }
    if let Value::Object(props) = &source {
        for (key, value) in props {
            ctx.charge_work(key.len().saturating_add(1), u(""))?;
            let key = key.to_utf8().unwrap_or_default();
            if !["umf", "id", "modules", "vocabularies"].contains(&key.as_str()) {
                push_loss(
                    &mut losses,
                    &mut diagnostics,
                    format!("/{}", ptr(&key)),
                    value,
                    "Document metadata is retained but not projected",
                    "unknown",
                    "FIELD_MEANING_NOT_PROJECTED",
                    severity,
                    ctx,
                )?;
            }
        }
    }
    if let Some(v) = get(&source, "vocabularies") {
        if matches!(v,Value::Object(x) if !x.is_empty()) {
            push_loss(
                &mut losses,
                &mut diagnostics,
                "/vocabularies".into(),
                v,
                "Native vocabulary semantics are not projected",
                "unknown",
                "FIELD_MEANING_NOT_PROJECTED",
                severity,
                ctx,
            )?;
        }
    }
    for (i, m) in modules.iter().enumerate() {
        ctx.charge_work(1, u(""))?;
        let mp = format!("/modules/{i}");
        if i != mi {
            push_loss(
                &mut losses,
                &mut diagnostics,
                mp,
                m,
                "Other module is outside selected Field projection",
                "unknown",
                "FIELD_MEANING_NOT_PROJECTED",
                severity,
                ctx,
            )?;
            continue;
        }
        if let Some(ns) = get(m, "namespace") {
            if matches!(ns,Value::String(x) if !x.is_empty()) {
                push_loss(
                    &mut losses,
                    &mut diagnostics,
                    format!("{mp}/namespace"),
                    ns,
                    "This TableSpec binding has no namespace representation",
                    "not-expressible",
                    "FIELD_MEANING_NOT_PROJECTED",
                    severity,
                    ctx,
                )?;
            }
        }
        if let Value::Object(props) = m {
            for (key, value) in props {
                ctx.charge_work(key.len().saturating_add(1), u(""))?;
                let key = key.to_utf8().unwrap_or_default();
                if !["id", "namespace", "elements"].contains(&key.as_str()) {
                    push_loss(
                        &mut losses,
                        &mut diagnostics,
                        format!("{mp}/{}", ptr(&key)),
                        value,
                        "Module metadata is not projected",
                        "unknown",
                        "FIELD_MEANING_NOT_PROJECTED",
                        severity,
                        ctx,
                    )?;
                }
            }
        }
        for (j, e) in arr(m, "elements").unwrap_or(&[]).iter().enumerate() {
            ctx.charge_work(1, u(""))?;
            if j != ei {
                push_loss(
                    &mut losses,
                    &mut diagnostics,
                    format!("{mp}/elements/{j}"),
                    e,
                    "Other element is outside selected Field projection",
                    "unknown",
                    "FIELD_MEANING_NOT_PROJECTED",
                    severity,
                    ctx,
                )?;
            }
        }
    }
    if let Value::Object(props) = element {
        for (key, value) in props {
            ctx.charge_work(key.len().saturating_add(1), u(""))?;
            let key = key.to_utf8().unwrap_or_default();
            let empty_ext =
                key == "extensions" && matches!(value,Value::Object(ext) if ext.is_empty());
            if !["id", "kind", "name", "description", "scalarType"].contains(&key.as_str())
                && !empty_ext
            {
                push_loss(
                    &mut losses,
                    &mut diagnostics,
                    format!("{path}/{}", ptr(&key)),
                    value,
                    "Field metadata is retained but not projected",
                    "unknown",
                    "FIELD_MEANING_NOT_PROJECTED",
                    severity,
                    ctx,
                )?;
            }
        }
    }
    let mut cv = vec![
        ("name", Value::string_utf8(&column)),
        ("data_type", Value::string_utf8(&native)),
    ];
    if let Some(d) = get(element, "description") {
        cv.push(("description", copy_json(d, ctx)?));
    }
    let target = scalar_target(runtime, None, &id, &table, vec![obj(cv)], ctx)?;
    if let (Some(source_scalar), Some(target_scalar)) = (
        get(element, "scalarType"),
        arr(
            arr(&target, "modules")
                .unwrap_or(&[])
                .get(0)
                .unwrap_or(&Value::Null),
            "elements",
        )
        .unwrap_or(&[])
        .get(0)
        .and_then(|e| get(e, "scalarType")),
    ) {
        if source_scalar != target_scalar {
            push_loss(
                &mut losses,
                &mut diagnostics,
                format!("{path}/scalarType"),
                source_scalar,
                "Explicit native type does not establish the stated scalar family",
                "not-expressible",
                "FIELD_MEANING_NOT_PROJECTED",
                severity,
                ctx,
            )?;
        }
    }
    let kind = outcome(&losses);
    let blocked = hard || mode == "strict" && !losses.is_empty();
    let mut result=obj(vec![("operation",t("project-field-tablespec")),("version",t("1.0.0")),("status",t(if blocked{"blocked"}else{"projected"})),("source",source),("author",a),("request",copy_json(request,ctx)?),("binding",obj(vec![("id",t("umf.core.field.tablespec")),("version",t("1.0.0")),("nativeVersion",t(NATIVE_VERSION)),("subset",t("Single authored named Field; explicit native type; no execution or value-domain equivalence"))])),("mapping",obj(vec![("origin",t("authored")),("idealPath",Value::string_utf8(&format!("{path}/kind"))),("nativePath",t("/columns/0")),("outcome",t(kind))])),("residuals",Value::Array(losses)),("diagnostics",Value::Array(diagnostics))]);
    if !blocked {
        if let Value::Object(m) = &mut result {
            m.push((u("target"), target));
        }
    }
    validate(&result, &rs, ctx, "FIELD_TABLESPEC_RESULT")?;
    Ok(result)
}

pub fn recover_field(
    receipt: &Value,
    native_text: &Value,
    runtime: &TableSpecRuntime,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let receipt_schema = schema(FIELD_SCHEMA, engine, ctx)?;
    validate(receipt, &receipt_schema, ctx, "FIELD_TABLESPEC_RECEIPT")?;
    if st(receipt, "status").as_deref() != Some("projected") || get(receipt, "target").is_none() {
        return Err(err(
            "FIELD_TABLESPEC_RECEIPT",
            "Expected projected receipt",
            "",
        ));
    }
    let expected = project_field(
        get(receipt, "author")
            .ok_or_else(|| err("FIELD_TABLESPEC_RECEIPT", "author missing", ""))?,
        get(receipt, "request")
            .ok_or_else(|| err("FIELD_TABLESPEC_RECEIPT", "request missing", ""))?,
        runtime,
        engine,
        registry,
        caps,
        ctx,
    )?;
    let mut expected = expected;
    if get(receipt, "diagnostics").is_none() {
        remove(&mut expected, "diagnostics");
    }
    if !equal(receipt, &expected, ctx)? {
        return Err(err(
            "FIELD_TABLESPEC_RECEIPT",
            "Receipt differs from recomputed projection",
            "",
        ));
    }
    let target = get(&expected, "target")
        .ok_or_else(|| err("FIELD_TABLESPEC_RECEIPT", "target missing", ""))?;
    let expected_text = runtime.export(target, ctx)?;
    if !matches!(native_text,Value::String(x) if x==&expected_text) {
        return Err(err("FIELD_TABLESPEC_STALE", "Native target changed", ""));
    }
    copy_json(
        get(receipt, "source")
            .ok_or_else(|| err("FIELD_TABLESPEC_RECEIPT", "source missing", ""))?,
        ctx,
    )
}
pub fn project_record(
    input: &Value,
    request: &Value,
    runtime: &TableSpecRuntime,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let (a, source) = author(input, engine, registry, caps, ctx)?;
    let rs = schema(RECORD_SCHEMA, engine, ctx)?;
    let request_doc = serialization::read_json_value(
        &RECORD_SCHEMA.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        ctx,
    )?;
    let request_schema = get(
        get(&request_doc, "properties").unwrap_or(&Value::Null),
        "request",
    )
    .ok_or_else(|| err("SCHEMA", "request schema missing", ""))?;
    let mut resources = engine.schema_resources_with_context(ctx)?;
    resources.entries.push((
        u("urn:umf:core:kind-operation:6.0.0"),
        serialization::read_json_value(
            &KIND_SCHEMA.encode_utf16().collect::<Vec<_>>(),
            Format::Json,
            ctx,
        )?,
    ));
    let rq = CompiledSchema::compile(request_schema, &resources, ctx)?;
    validate(request, &rq, ctx, "RECORD_TABLESPEC_REQUEST")?;
    let id = request_text(request, "id")?;
    let table = request_text(request, "tableName")?;
    let mode = request_text(request, "mode")?;
    let identity =
        get(&a, "identity").ok_or_else(|| err("CORE_KIND_RECEIPT", "identity missing", ""))?;
    let mid =
        st(identity, "module").ok_or_else(|| err("CORE_KIND_RECEIPT", "module missing", ""))?;
    let eid =
        st(identity, "element").ok_or_else(|| err("CORE_KIND_RECEIPT", "element missing", ""))?;
    let modules =
        arr(&source, "modules").ok_or_else(|| err("CORE_KIND_RECEIPT", "modules missing", ""))?;
    let mut selected = None;
    for (mi, m) in modules.iter().enumerate() {
        ctx.charge_work(1, u(""))?;
        if st(m, "id").as_deref() == Some(mid.as_str()) {
            for (ei, e) in arr(m, "elements").unwrap_or(&[]).iter().enumerate() {
                ctx.charge_work(1, u(""))?;
                if st(e, "id").as_deref() == Some(eid.as_str()) {
                    selected = Some((mi, ei, e));
                }
            }
        }
    }
    let (mi, ei, record) =
        selected.ok_or_else(|| err("RECORD_TABLESPEC_IDENTITY", "Missing declared record", ""))?;
    let selected_path = format!("/modules/{mi}/elements/{ei}");
    let mut losses = Vec::new();
    let mut diagnostics = Vec::new();
    let mut hard =
        st(get(&a, "provenance").unwrap_or(&Value::Null), "kind").as_deref() != Some("record");
    let loss = |losses: &mut Vec<Value>,
                diags: &mut Vec<Value>,
                path: String,
                value: &Value,
                reason: &str,
                unexpressible: bool,
                fatal: bool,
                ctx: &mut Context<'_>|
     -> Result<(), EngineError> {
        push_loss(
            losses,
            diags,
            path,
            value,
            reason,
            if unexpressible {
                "not-expressible"
            } else {
                "unknown"
            },
            if fatal {
                "RECORD_BINDING_CONFLICT"
            } else {
                "RECORD_MEANING_NOT_PROJECTED"
            },
            if fatal || mode == "strict" {
                "error"
            } else {
                "warning"
            },
            ctx,
        )
    };
    if hard {
        loss(
            &mut losses,
            &mut diagnostics,
            format!("{selected_path}/kind"),
            get(record, "kind").unwrap_or(&Value::Null),
            "Only an authored record can define the native table",
            true,
            true,
            ctx,
        )?;
    }
    if let Some(name) = get(record, "name") {
        if s(name).as_deref() != Some(table.as_str()) {
            loss(
                &mut losses,
                &mut diagnostics,
                format!("{selected_path}/name"),
                name,
                "Native table name differs from ideal name",
                true,
                false,
                ctx,
            )?;
        }
    }
    if let Value::Object(props) = &source {
        for (k, v) in props {
            ctx.charge_work(k.len().saturating_add(1), u(""))?;
            let key = k.to_utf8().unwrap_or_default();
            if !["umf", "id", "modules", "vocabularies"].contains(&key.as_str()) {
                loss(
                    &mut losses,
                    &mut diagnostics,
                    format!("/{}", ptr(&key)),
                    v,
                    "Document metadata is not projected",
                    false,
                    false,
                    ctx,
                )?;
            }
        }
    }
    if let Some(v) = get(&source, "vocabularies") {
        if matches!(v,Value::Object(x)if !x.is_empty()) {
            loss(
                &mut losses,
                &mut diagnostics,
                "/vocabularies".into(),
                v,
                "Native vocabulary semantics are not projected",
                false,
                false,
                ctx,
            )?;
        }
    }
    let mut member_keys = std::collections::BTreeSet::<(String, String)>::new();
    let mut member_rows = Vec::<((String, String), &Value)>::new();
    for (index, reference) in arr(record, "references").unwrap_or(&[]).iter().enumerate() {
        ctx.charge_work(1, u(""))?;
        if st(reference, "role").as_deref() != Some("member") {
            loss(
                &mut losses,
                &mut diagnostics,
                format!("{selected_path}/references/{index}"),
                reference,
                "Non-member relationship is retained but not projected",
                false,
                false,
                ctx,
            )?;
            continue;
        }
        let fm = st(reference, "module").unwrap_or_default();
        let fe = st(reference, "element").unwrap_or_default();
        ctx.charge_work(fm.len().saturating_add(fe.len()).saturating_add(1), u(""))?;
        let key = (fm, fe);
        if !member_keys.insert(key.clone()) {
            hard = true;
            loss(
                &mut losses,
                &mut diagnostics,
                format!("{selected_path}/references/{index}"),
                reference,
                "Duplicate record member",
                true,
                true,
                ctx,
            )?;
        } else {
            member_rows.push((key, reference));
        }
        if let Value::Object(props) = reference {
            for (k, v) in props {
                ctx.charge_work(k.len().saturating_add(1), u(""))?;
                let key = k.to_utf8().unwrap_or_default();
                if !["role", "module", "element"].contains(&key.as_str()) {
                    loss(
                        &mut losses,
                        &mut diagnostics,
                        format!("{selected_path}/references/{index}/{}", ptr(&key)),
                        v,
                        "Reference metadata is not projected",
                        false,
                        false,
                        ctx,
                    )?;
                }
            }
        }
    }
    let fields = arr(request, "fields").unwrap_or(&[]);
    let mut bindings = std::collections::BTreeMap::<(String, String), &Value>::new();
    let mut column_names = std::collections::BTreeSet::<String>::new();
    for field in fields {
        ctx.charge_work(1, u(""))?;
        let field_author = get(field, "author")
            .ok_or_else(|| err("CORE_KIND_RECEIPT", "member author missing", ""))?;
        crate::core_kind::verify_core_kind_declaration(
            field_author,
            &source,
            engine,
            registry,
            caps,
            ctx,
        )?;
        let fid = get(field_author, "identity")
            .ok_or_else(|| err("CORE_KIND_RECEIPT", "member identity missing", ""))?;
        let fm = st(fid, "module")
            .ok_or_else(|| err("CORE_KIND_RECEIPT", "member module missing", ""))?;
        let fe = st(fid, "element")
            .ok_or_else(|| err("CORE_KIND_RECEIPT", "member element missing", ""))?;
        ctx.charge_work(fm.len().saturating_add(fe.len()).saturating_add(1), u(""))?;
        let key = (fm, fe);
        let fpath = st(
            get(field_author, "provenance").unwrap_or(&Value::Null),
            "idealPath",
        )
        .unwrap_or_default();
        if bindings.contains_key(&key) || !member_keys.contains(&key) {
            hard = true;
            loss(
                &mut losses,
                &mut diagnostics,
                if fpath.is_empty() {
                    "".into()
                } else {
                    fpath.clone()
                },
                field,
                "Duplicate or non-member native binding",
                true,
                true,
                ctx,
            )?;
        } else {
            bindings.insert(key.clone(), field);
        }
        let name = st(field, "columnName").unwrap_or_default();
        if !column_names.insert(name.clone()) {
            hard = true;
            loss(
                &mut losses,
                &mut diagnostics,
                if fpath.is_empty() { "".into() } else { fpath },
                &Value::string_utf8(&name),
                "Native column names collide",
                true,
                true,
                ctx,
            )?;
        }
    }
    let mut columns = Vec::<Value>::new();
    let mut mappings = Vec::<Value>::new();
    let mut included = std::collections::BTreeSet::<String>::new();
    included.insert(selected_path.clone());
    let mut scalar_checks = Vec::<(usize, String, Value)>::new();
    for (key, reference) in &member_rows {
        ctx.charge_work(1, u(""))?;
        let fm = st(reference, "module").unwrap_or_default();
        let fe = st(reference, "element").unwrap_or_default();
        let mut found = None;
        for (fmi, module) in modules.iter().enumerate() {
            ctx.charge_work(1, u(""))?;
            if st(module, "id").as_deref() == Some(fm.as_str()) {
                for (fei, element) in arr(module, "elements").unwrap_or(&[]).iter().enumerate() {
                    ctx.charge_work(1, u(""))?;
                    if st(element, "id").as_deref() == Some(fe.as_str()) {
                        found = Some((fmi, fei, element));
                    }
                }
            }
        }
        let (fmi, fei, element) = found.ok_or_else(|| {
            err(
                "RECORD_TABLESPEC_IDENTITY",
                "Missing declared member element",
                "",
            )
        })?;
        let element_path = format!("/modules/{fmi}/elements/{fei}");
        included.insert(element_path.clone());
        let Some(field) = bindings.get(key).copied() else {
            hard = true;
            loss(
                &mut losses,
                &mut diagnostics,
                element_path.clone(),
                element,
                "Missing explicit member binding",
                true,
                true,
                ctx,
            )?;
            continue;
        };
        let field_author = get(field, "author")
            .ok_or_else(|| err("CORE_KIND_RECEIPT", "member author missing", ""))?;
        if st(
            get(field_author, "provenance").unwrap_or(&Value::Null),
            "kind",
        )
        .as_deref()
            != Some("field")
        {
            hard = true;
            loss(
                &mut losses,
                &mut diagnostics,
                format!("{element_path}/kind"),
                get(element, "kind").unwrap_or(&Value::Null),
                "Record member is not an authored field",
                true,
                true,
                ctx,
            )?;
        }
        let column = st(field, "columnName").unwrap_or_default();
        let native = st(field, "nativeType").unwrap_or_default();
        if let Some(name) = get(element, "name") {
            if s(name).as_deref() != Some(column.as_str()) {
                loss(
                    &mut losses,
                    &mut diagnostics,
                    format!("{element_path}/name"),
                    name,
                    "Native column name differs from ideal name",
                    true,
                    false,
                    ctx,
                )?;
            }
        }
        let mut c = vec![
            ("name", Value::string_utf8(&column)),
            ("data_type", Value::string_utf8(&native)),
        ];
        if let Some(d) = get(element, "description") {
            c.push(("description", copy_json(d, ctx)?));
        }
        columns.push(obj(c));
        if let Some(scalar) = get(element, "scalarType") {
            scalar_checks.push((
                columns.len() - 1,
                element_path.clone(),
                copy_json(scalar, ctx)?,
            ));
        }
        mappings.push(obj(vec![
            ("origin", t("authored")),
            ("kind", t("field")),
            (
                "idealPath",
                Value::string_utf8(&format!("{element_path}/kind")),
            ),
            (
                "nativePath",
                Value::string_utf8(&format!("/columns/{}", columns.len() - 1)),
            ),
            ("outcome", t("exact")),
        ]));
    }
    for (i, module) in modules.iter().enumerate() {
        ctx.charge_work(1, u(""))?;
        let root = format!("/modules/{i}");
        let mut included_any = false;
        for (j, element) in arr(module, "elements").unwrap_or(&[]).iter().enumerate() {
            ctx.charge_work(1, u(""))?;
            if included.contains(&format!("{root}/elements/{j}")) {
                included_any = true;
            }
        }
        if !included_any {
            loss(
                &mut losses,
                &mut diagnostics,
                root,
                module,
                "Module lies outside projected record",
                false,
                false,
                ctx,
            )?;
            continue;
        }
        if let Some(ns) = get(module, "namespace") {
            if matches!(ns,Value::String(x)if !x.is_empty()) {
                loss(
                    &mut losses,
                    &mut diagnostics,
                    format!("{root}/namespace"),
                    ns,
                    "This TableSpec binding has no namespace representation",
                    true,
                    false,
                    ctx,
                )?;
            }
        }
        if let Value::Object(props) = module {
            for (k, v) in props {
                ctx.charge_work(k.len().saturating_add(1), u(""))?;
                let key = k.to_utf8().unwrap_or_default();
                if !["id", "namespace", "elements"].contains(&key.as_str()) {
                    loss(
                        &mut losses,
                        &mut diagnostics,
                        format!("{root}/{}", ptr(&key)),
                        v,
                        "Module metadata is not projected",
                        false,
                        false,
                        ctx,
                    )?;
                }
            }
        }
        for (j, element) in arr(module, "elements").unwrap_or(&[]).iter().enumerate() {
            ctx.charge_work(1, u(""))?;
            let path = format!("{root}/elements/{j}");
            if !included.contains(&path) {
                loss(
                    &mut losses,
                    &mut diagnostics,
                    path,
                    element,
                    "Element lies outside projected record",
                    false,
                    false,
                    ctx,
                )?;
                continue;
            }
            let is_record = path == selected_path;
            let known: &[&str] = if is_record {
                &["id", "kind", "name", "description", "references"]
            } else {
                &["id", "kind", "name", "description", "scalarType"]
            };
            if let Value::Object(props) = element {
                for (k, v) in props {
                    ctx.charge_work(k.len().saturating_add(1), u(""))?;
                    let key = k.to_utf8().unwrap_or_default();
                    let empty_ext =
                        key == "extensions" && matches!(v,Value::Object(x)if x.is_empty());
                    if !known.contains(&key.as_str()) && !empty_ext {
                        loss(
                            &mut losses,
                            &mut diagnostics,
                            format!("{path}/{}", ptr(&key)),
                            v,
                            "Element metadata is not projected",
                            false,
                            false,
                            ctx,
                        )?;
                    }
                }
            }
        }
    }
    let mut target = None;
    if !hard {
        let native = scalar_target(
            runtime,
            get(record, "description"),
            &id,
            &table,
            columns,
            ctx,
        )?;
        let native_columns = arr(&native, "modules")
            .and_then(|modules| modules.first())
            .and_then(|module| arr(module, "elements"))
            .unwrap_or(&[]);
        for (index, path, source_scalar) in &scalar_checks {
            ctx.charge_work(1, u(""))?;
            if let Some(target_scalar) = native_columns
                .get(*index)
                .and_then(|element| get(element, "scalarType"))
            {
                if target_scalar != source_scalar {
                    loss(
                        &mut losses,
                        &mut diagnostics,
                        format!("{path}/scalarType"),
                        source_scalar,
                        "Native type does not establish ideal scalar family",
                        true,
                        false,
                        ctx,
                    )?;
                }
            }
        }
        target = Some(native);
    }
    // Existing authored Record semantics mark the record as unknown for any residual,
    // and a member mapping as unknown when a residual falls under that member element.
    for mapping in &mut mappings {
        let Some(ideal) = st(mapping, "idealPath") else {
            continue;
        };
        let Some(path) = ideal.strip_suffix("/kind") else {
            continue;
        };
        let affected = losses.iter().any(|residual| {
            st(residual, "path")
                .is_some_and(|residual_path| residual_path.starts_with(&format!("{path}/")))
        });
        let record_mapping = st(mapping, "kind").as_deref() == Some("record");
        let unknown = if record_mapping {
            !losses.is_empty()
        } else {
            affected
        };
        if unknown {
            if let Value::Object(props) = mapping {
                if let Some((_, outcome)) = props.iter_mut().find(|(key, _)| key == &u("outcome")) {
                    *outcome = t("unknown");
                }
            }
        }
    }
    let record_mapping = if losses.is_empty() {
        "exact"
    } else {
        "unknown"
    };
    mappings.insert(
        0,
        obj(vec![
            ("origin", t("authored")),
            ("kind", t("record")),
            (
                "idealPath",
                Value::string_utf8(&format!("{selected_path}/kind")),
            ),
            ("nativePath", t("")),
            ("outcome", t(record_mapping)),
        ]),
    );
    let blocked = hard || mode == "strict" && !losses.is_empty();
    let mut result=obj(vec![("operation",t("project-record-tablespec")),("version",t("1.0.0")),("status",t(if blocked{"blocked"}else{"projected"})),("source",source),("author",a),("request",copy_json(request,ctx)?),("binding",obj(vec![("id",t("umf.core.record.tablespec")),("version",t("1.0.0")),("nativeVersion",t(NATIVE_VERSION)),("subset",t("Authored record with explicit flat field carriers; no value-domain or execution equivalence"))])),("mappings",Value::Array(mappings)),("residuals",Value::Array(losses)),("diagnostics",Value::Array(diagnostics))]);
    if !blocked {
        if let (Some(target), Value::Object(props)) = (target, &mut result) {
            props.push((u("target"), target));
        }
    }
    validate(&result, &rs, ctx, "RECORD_TABLESPEC_RESULT")?;
    Ok(result)
}

pub fn recover_record(
    receipt: &Value,
    native_text: &Value,
    runtime: &TableSpecRuntime,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let receipt_schema = schema(RECORD_SCHEMA, engine, ctx)?;
    validate(receipt, &receipt_schema, ctx, "RECORD_TABLESPEC_RECEIPT")?;
    if st(receipt, "status").as_deref() != Some("projected") || get(receipt, "target").is_none() {
        return Err(err(
            "RECORD_TABLESPEC_RECEIPT",
            "Expected complete projection receipt",
            "",
        ));
    }
    let expected = project_record(
        get(receipt, "author")
            .ok_or_else(|| err("RECORD_TABLESPEC_RECEIPT", "author missing", ""))?,
        get(receipt, "request")
            .ok_or_else(|| err("RECORD_TABLESPEC_RECEIPT", "request missing", ""))?,
        runtime,
        engine,
        registry,
        caps,
        ctx,
    )?;
    if !equal(receipt, &expected, ctx)? {
        return Err(err(
            "RECORD_TABLESPEC_RECEIPT",
            "Receipt differs from recomputed projection",
            "",
        ));
    }
    let txt = runtime.export(
        get(&expected, "target")
            .ok_or_else(|| err("RECORD_TABLESPEC_RECEIPT", "target missing", ""))?,
        ctx,
    )?;
    if !matches!(native_text,Value::String(x) if x==&txt) {
        return Err(err("RECORD_TABLESPEC_STALE", "Native target changed", ""));
    }
    copy_json(
        get(receipt, "source")
            .ok_or_else(|| err("RECORD_TABLESPEC_RECEIPT", "source missing", ""))?,
        ctx,
    )
}
