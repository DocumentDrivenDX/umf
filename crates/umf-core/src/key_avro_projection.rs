// SPDX-License-Identifier: MIT OR Apache-2.0
//! Rust-owned projection of authored Record Key declarations to an Avro record.
use crate::{
    context::Context,
    engine::{Capabilities, Engine, ResourceSet, SemanticContext},
    error::{Diagnostic, EngineError},
    registry::Registry,
    serialization::{self, Format},
    value::{copy_json, Utf16, Value},
};
use std::sync::{Arc, OnceLock};
const CORE: &str = include_str!("../../../spec/core/schema.json");
const KEY_OP: &str = include_str!("../../../spec/core/key-operation-v2.schema.json");
const RESULT: &str = include_str!("../../../spec/core/key-avro-projection.schema.json");
const RECOVERY:&str="Recover authored source from retained receipt; native import alone does not recover authored identity";
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
fn k(v: &str) -> Utf16 {
    Utf16::from(v)
}
fn s(v: &str) -> Value {
    Value::string_utf8(v)
}
fn obj(v: Vec<(&str, Value)>) -> Value {
    Value::Object(v.into_iter().map(|(a, b)| (k(a), b)).collect())
}
fn get<'a>(v: &'a Value, n: &str) -> Option<&'a Value> {
    if let Value::Object(m) = v {
        m.iter().find(|(x, _)| x == &k(n)).map(|(_, v)| v)
    } else {
        None
    }
}
fn text(v: Option<&Value>) -> Option<String> {
    if let Some(Value::String(x)) = v {
        x.to_utf8().ok()
    } else {
        None
    }
}
fn err(c: &str, m: &str, p: &str) -> EngineError {
    EngineError::new(c, k(p), m)
}
fn parse(v: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    serialization::read_json_value(&v.encode_utf16().collect::<Vec<_>>(), Format::Json, ctx)
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
    let value = Arc::new(Runtime {
        engine,
        registry: Registry::new(),
    });
    if ctx.profile() == crate::context::ResourceProfile::Cooperative
        && ctx.limits() == crate::context::Limits::ordinary()
    {
        let _ = CACHE.set(value.clone());
    }
    Ok(value)
}
fn equal(a: &Value, b: &Value) -> bool {
    fn norm(v: &Value) -> Value {
        match v {
            Value::Array(a) => Value::Array(a.iter().map(norm).collect()),
            Value::Object(m) => {
                let mut p = m
                    .iter()
                    .map(|(k, v)| (k.clone(), norm(v)))
                    .collect::<Vec<_>>();
                p.sort_by(|a, b| a.0.cmp(&b.0));
                Value::Object(p)
            }
            _ => v.clone(),
        }
    }
    norm(a) == norm(b)
}
fn validate_schema(
    v: &Value,
    schema: &Value,
    rt: &Runtime,
    ctx: &mut Context<'_>,
    code: &str,
) -> Result<(), EngineError> {
    let mut resources = rt.engine.schema_resources_with_context(ctx)?;
    resources
        .entries
        .push((k("urn:umf:core:key-operation:2.0.0"), parse(KEY_OP, ctx)?));
    let compiled = crate::schema::CompiledSchema::compile(schema, &resources, ctx)?;
    if compiled.validate_codegen_errors(v, ctx)?.is_empty() {
        Ok(())
    } else {
        Err(err(
            code,
            "Value does not match the pinned projection schema",
            "",
        ))
    }
}
fn identity(module: &Value, element: &Value) -> Value {
    obj(vec![
        (
            "module",
            copy_json(module, &mut Context::ordinary()).unwrap_or(Value::Null),
        ),
        (
            "element",
            copy_json(element, &mut Context::ordinary()).unwrap_or(Value::Null),
        ),
    ])
}
fn key_identity(record: &Value, key: &Value) -> Value {
    let mut m = match record {
        Value::Object(v) => v.clone(),
        _ => Vec::new(),
    };
    m.push((
        k("key"),
        copy_json(key, &mut Context::ordinary()).unwrap_or(Value::Null),
    ));
    Value::Object(m)
}
fn same_ref(a: &Value, b: &Value) -> bool {
    equal(
        get(a, "module").unwrap_or(&Value::Null),
        get(b, "module").unwrap_or(&Value::Null),
    ) && equal(
        get(a, "element").unwrap_or(&Value::Null),
        get(b, "element").unwrap_or(&Value::Null),
    )
}
fn lookup(
    source: &Value,
    record: &Value,
    key: &Value,
    rt: &Runtime,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    crate::core_keys::lookup_core_key(
        source,
        &key_identity(record, key),
        &rt.engine,
        &rt.registry,
        caps,
        ctx,
    )
}
fn locate(
    source: &Value,
    field: &Value,
    ctx: &mut Context<'_>,
) -> Result<(Value, String), EngineError> {
    let module = text(get(field, "module")).ok_or_else(|| {
        err(
            "KEY_AVRO_COLUMNS",
            "Field module is required",
            "/request/columns",
        )
    })?;
    let element = text(get(field, "element")).ok_or_else(|| {
        err(
            "KEY_AVRO_COLUMNS",
            "Field element is required",
            "/request/columns",
        )
    })?;
    let modules = match get(source, "modules") {
        Some(Value::Array(x)) => x,
        _ => {
            return Err(err(
                "KEY_AVRO_SOURCE",
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
                        return Ok((copy_json(e, ctx)?, format!("/modules/{mi}/elements/{ei}")));
                    }
                }
            }
        }
    }
    Err(err(
        "KEY_AVRO_REFERENCE",
        "Unresolved Field identity",
        "/request/columns",
    ))
}
fn native_name(value: &str) -> bool {
    let mut bytes = value.bytes();
    matches!(bytes.next(), Some(b'A'..=b'Z' | b'a'..=b'z' | b'_'))
        && bytes.all(|b| b.is_ascii_alphanumeric() || b == b'_')
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
    source_input: &Value,
    authors_input: &Value,
    request_input: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(ctx)?;
    let source = copy_json(source_input, ctx)?;
    let authors = copy_json(authors_input, ctx)?;
    let request = copy_json(request_input, ctx)?;
    let root_schema = parse(RESULT, ctx)?;
    let req_schema = get(
        get(&root_schema, "properties").unwrap_or(&Value::Null),
        "request",
    )
    .ok_or_else(|| err("KEY_AVRO_SCHEMA", "Request schema is unavailable", ""))?;
    validate_schema(&request, req_schema, &rt, ctx, "KEY_AVRO_REQUEST")?;
    if text(get(&source, "umf")).as_deref() != Some("0.10.0") {
        return Err(err(
            "KEY_AVRO_SOURCE",
            "Valid explicit core 0.10.0 required",
            "/umf",
        ));
    }
    let record = get(&request, "record").ok_or_else(|| {
        err(
            "KEY_AVRO_RECORD",
            "Record identity is required",
            "/request/record",
        )
    })?;
    let module = get(record, "module").ok_or_else(|| {
        err(
            "KEY_AVRO_RECORD",
            "Record module is required",
            "/request/record/module",
        )
    })?;
    let element = get(record, "element").ok_or_else(|| {
        err(
            "KEY_AVRO_RECORD",
            "Record element is required",
            "/request/record/element",
        )
    })?;
    let record_id = identity(module, element);
    let mut caps = NoCapabilities;
    let validation = rt
        .engine
        .validate_document(&source, &rt.registry, &mut caps, ctx)?;
    if !validation.valid {
        return Err(err("KEY_AVRO_SOURCE", "Valid core 0.10.0 required", "/"));
    }
    let record_value = locate(&source, &record_id, ctx)?.0;
    let declared = match get(&record_value, "keys") {
        Some(Value::Array(v)) => v,
        _ => {
            return Err(err(
                "KEY_AVRO_RECORD",
                "Selected Record must have authored keys",
                "/request/record",
            ))
        }
    };
    let members = match get(&record_value, "members") {
        Some(Value::Array(v)) => v,
        _ => {
            return Err(err(
                "KEY_AVRO_RECORD",
                "Selected Record must have explicit membership",
                "/request/record",
            ))
        }
    };
    if declared.is_empty() || members.is_empty() {
        return Err(err(
            "KEY_AVRO_RECORD",
            "Selected Record must have authored keys and explicit membership",
            "/request/record",
        ));
    }
    let author_values = match &authors {
        Value::Array(v) => v,
        _ => {
            return Err(err(
                "KEY_AVRO_AUTHORS",
                "Expected an array of key declarations",
                "/authors",
            ))
        }
    };
    if author_values.len() != declared.len() {
        return Err(err(
            "KEY_AVRO_AUTHORS",
            "Exactly one verified declaration for every current key is required",
            "/authors",
        ));
    }
    let mut seen = Vec::<Value>::new();
    for author in author_values {
        if text(get(author, "operation")).as_deref() != Some("declare-core-key") {
            return Err(err(
                "KEY_AVRO_AUTHORS",
                "Expected key declarations",
                "/authors",
            ));
        }
        let target = get(author, "target").ok_or_else(|| {
            err(
                "KEY_AVRO_AUTHORS",
                "Key target is required",
                "/authors/target",
            )
        })?;
        crate::core_keys::verify_core_key_operation(
            author,
            target,
            &rt.engine,
            &rt.registry,
            &mut caps,
            ctx,
        )?;
        let identity = get(author, "identity").ok_or_else(|| {
            err(
                "KEY_AVRO_AUTHORS",
                "Key identity is required",
                "/authors/identity",
            )
        })?;
        if !equal(
            &obj(vec![
                ("module", module.clone()),
                ("element", element.clone()),
            ]),
            &obj(vec![
                (
                    "module",
                    get(identity, "module").cloned().unwrap_or(Value::Null),
                ),
                (
                    "element",
                    get(identity, "element").cloned().unwrap_or(Value::Null),
                ),
            ]),
        ) {
            return Err(err(
                "KEY_AVRO_AUTHORS",
                "Mismatched author identity",
                "/authors/identity",
            ));
        }
        let keyid = get(author, "request")
            .and_then(|r| get(r, "id"))
            .cloned()
            .ok_or_else(|| {
                err(
                    "KEY_AVRO_AUTHORS",
                    "Key request ID is required",
                    "/authors/request/id",
                )
            })?;
        if get(identity, "key").is_some_and(|key| !equal(key, &keyid))
            || !equal(
                get(target, "id").unwrap_or(&Value::Null),
                get(&source, "id").unwrap_or(&Value::Null),
            )
        {
            return Err(err(
                "KEY_AVRO_AUTHORS",
                "Mismatched Key identity or source document",
                "/authors",
            ));
        }
        if seen.iter().any(|v| equal(v, &keyid)) {
            return Err(err(
                "KEY_AVRO_AUTHORS",
                "Duplicate key declaration",
                "/authors",
            ));
        }
        seen.push(keyid.clone());
        let current = lookup(&source, &record_id, &keyid, &rt, &mut caps, ctx)?;
        let prior = lookup(target, &record_id, &keyid, &rt, &mut caps, ctx)?;
        if !equal(
            get(&current, "key").unwrap_or(&Value::Null),
            get(&prior, "key").unwrap_or(&Value::Null),
        ) {
            return Err(err(
                "KEY_AVRO_STALE",
                "Key meaning changed since declaration",
                "/authors",
            ));
        }
        for component in match get(get(&current, "key").unwrap_or(&Value::Null), "fields") {
            Some(Value::Array(v)) => v,
            _ => {
                return Err(err(
                    "KEY_AVRO_AUTHORS",
                    "Key Fields are required",
                    "/authors",
                ))
            }
        } {
            let now = locate(&source, component, ctx)?.0;
            let old = locate(target, component, ctx)?.0;
            if !equal(&now, &old) {
                return Err(err(
                    "KEY_AVRO_STALE",
                    "Key component changed since declaration",
                    "/authors",
                ));
            }
        }
        let prior_record = locate(target, &record_id, ctx)?.0;
        let prior_members = arr(get(&prior_record, "members"));
        for component in arr(get(get(&current, "key").unwrap_or(&Value::Null), "fields")) {
            let current_member = members.iter().find(|m| same_ref(m, component));
            let prior_member = prior_members.iter().find(|m| same_ref(m, component));
            if !current_member
                .zip(prior_member)
                .is_some_and(|(a, b)| equal(a, b))
            {
                return Err(err(
                    "KEY_AVRO_STALE",
                    "Key ownership qualifier changed since declaration",
                    "/authors",
                ));
            }
        }
    }
    let columns = match get(&request, "columns") {
        Some(Value::Array(v)) => v,
        _ => {
            return Err(err(
                "KEY_AVRO_COLUMNS",
                "Columns are required",
                "/request/columns",
            ))
        }
    };
    let mut mapped = Vec::<(Value, Value)>::new();
    let mut names = Vec::<Value>::new();
    for column in columns {
        let field = get(column, "field").ok_or_else(|| {
            err(
                "KEY_AVRO_COLUMNS",
                "Column field identity is required",
                "/request/columns/field",
            )
        })?;
        let name = get(column, "name").ok_or_else(|| {
            err(
                "KEY_AVRO_COLUMNS",
                "Column name is required",
                "/request/columns/name",
            )
        })?;
        if mapped.iter().any(|(f, _)| equal(f, field))
            || names.iter().any(|n| equal(n, name))
            || !members.iter().any(|m| same_ref(m, field))
        {
            return Err(err(
                "KEY_AVRO_COLUMNS",
                "Column identities and names must be unique and Record-owned",
                "/request/columns",
            ));
        }
        mapped.push((copy_json(field, ctx)?, copy_json(column, ctx)?));
        names.push(copy_json(name, ctx)?);
    }
    if mapped.len() != members.len() {
        return Err(err(
            "KEY_AVRO_COLUMNS",
            "Map every owned Field explicitly",
            "/request/columns",
        ));
    }
    let mut losses=vec![residual("/",&source,"Only selected Record scalar column carriers are emitted; all other metadata, native extensions, relationships and unknown content remain in this source residual","not-expressible",ctx)?];
    let mut impossible = false;
    let record_name = text(get(&request, "recordName")).unwrap_or_default();
    let namespace = text(get(&request, "namespace")).unwrap_or_default();
    if !native_name(&record_name)
        || (!namespace.is_empty() && !namespace.split('.').all(native_name))
    {
        impossible = true;
        losses.push(residual("/request",&request,"Avro record and namespace names must satisfy native identifier syntax; no normalization is performed","not-expressible",ctx)?);
    }
    let mut fields = Vec::new();
    let mut map_entries = Vec::new();
    for (index, column) in columns.iter().enumerate() {
        let field = get(column, "field").unwrap();
        let name = text(get(column, "name")).unwrap_or_default();
        if !native_name(&name) {
            impossible = true;
            losses.push(residual(
                &format!("/request/columns/{index}/name"),
                get(column, "name").unwrap_or(&Value::Null),
                "Invalid native Avro field name",
                "not-expressible",
                ctx,
            )?);
        }
        let native = text(get(column, "nativeType")).unwrap_or_default();
        let (e, path) = locate(&source, field, ctx)?;
        let scalar = text(get(&e, "scalarType")).unwrap_or_default();
        let family = match native.as_str() {
            "boolean" => "boolean",
            "int" | "long" => "integer",
            "bytes" => "binary",
            "string" => "string",
            "float" | "double" => "float",
            "decimal-bytes" => "decimal",
            _ => "",
        };
        let valid = text(get(&e, "kind")).as_deref() == Some("field")
            && text(get(&e, "cardinality")).as_deref() == Some("one")
            && get(&e, "itemType").is_none()
            && arr(get(&e, "references"))
                .iter()
                .all(|x| text(get(x, "role")).as_deref() != Some("record-type"))
            && text(get(&e, "nullability")).as_deref() == Some("required")
            && scalar == family;
        if !valid {
            impossible = true;
            losses.push(residual(&path,&e,"This carrier binding requires a required singular scalar Field with matching family; other shapes need an explicit binding","not-expressible",ctx)?);
            continue;
        }
        let mut typ = s(&native);
        if native == "decimal-bytes" {
            let precision = get(get(&e, "facets").unwrap_or(&Value::Null), "precision").cloned();
            let scale = get(get(&e, "facets").unwrap_or(&Value::Null), "scale").cloned();
            if precision.is_none() || scale.is_none() {
                impossible = true;
                losses.push(residual(
                    &path,
                    &e,
                    "Decimal bytes requires explicitly authored precision and scale",
                    "not-expressible",
                    ctx,
                )?);
                continue;
            }
            typ = obj(vec![
                ("type", s("bytes")),
                ("logicalType", s("decimal")),
                ("precision", precision.unwrap()),
                ("scale", scale.unwrap()),
            ]);
        }
        fields.push(obj(vec![("name", s(&name)), ("type", typ)]));
        losses.push(residual(&path,&e,"Avro carriers do not establish exact input conversion, complete ideal domains, integer-width/length enforcement or unknown qualifier meaning","unknown",ctx)?);
        if native == "boolean" {
            losses.push(residual(&path,&e,"fastavro 1.12.2 boolean writing can coerce null input to false even in strict mode; this carrier does not establish exact required-input validation","unknown",ctx)?);
        }
        if get(&e, "facets").is_some() {
            losses.push(residual(&format!("{path}/facets"),get(&e,"facets").unwrap(),"Author-stated facets are retained but not enforced by this primitive reference carrier","not-expressible",ctx)?);
        }
        let _ = index;
    }
    for key in declared {
        let keyid = get(key, "id").cloned().unwrap_or(Value::Null);
        let current = lookup(&source, &record_id, &keyid, &rt, &mut caps, ctx)?;
        let key_value = get(&current, "key").unwrap_or(&Value::Null);
        let key_fields = arr(get(key_value, "fields"));
        let mut cols = Vec::new();
        let mut native_paths = Vec::new();
        for rf in key_fields {
            let name = mapped
                .iter()
                .find(|(f, _)| same_ref(f, rf))
                .and_then(|(_, c)| text(get(c, "name")))
                .unwrap_or_default();
            cols.push(s(&name));
            let index = columns
                .iter()
                .position(|c| get(c, "field").is_some_and(|f| equal(f, rf)))
                .unwrap_or(0);
            native_paths.push(s(&format!("/fields/{index}")));
        }
        let path = text(get(&current, "path")).unwrap_or_default();
        map_entries.push(obj(vec![
            ("keyId", keyid.clone()),
            (
                "keyName",
                get(key_value, "name").cloned().unwrap_or(Value::Null),
            ),
            ("idealPath", s(&path)),
            ("nativePaths", Value::Array(native_paths)),
            ("columns", Value::Array(cols)),
            (
                "primary",
                get(key_value, "primary")
                    .cloned()
                    .unwrap_or(Value::Bool(false)),
            ),
            ("origin", s("authored")),
            ("enforcement", s("not-expressible")),
            ("outcome", s("not-expressible")),
        ]));
        losses.push(residual(&path,key_value,"Avro has no native collection uniqueness or primary/alternate Key declaration; stable IDs, names, ordered tuple and primary intent remain in this per-key residual","not-expressible",ctx)?);
    }
    let mut native = obj(vec![("type", s("record")), ("name", s(&record_name))]);
    if !namespace.is_empty() {
        if let Value::Object(m) = &mut native {
            m.push((k("namespace"), s(&namespace)));
        }
    }
    if let Value::Object(m) = &mut native {
        m.push((k("fields"), Value::Array(fields)));
    }
    let schema_text = serialization::stringify_compact_metered(&native, ctx)?
        .to_utf8()
        .map_err(|_| err("KEY_AVRO_NAME", "Avro schema is not UTF-8", ""))?;
    let id = text(get(&request, "id")).unwrap_or_default();
    let target = crate::avro_document::import_schema(
        &k(&id),
        &schema_text.encode_utf16().collect::<Vec<_>>(),
        &[],
        ctx,
    )?;
    let native_inspection = crate::avro_document::inspect_avro_document(&target, ctx)?;
    if !native_inspection.admission.valid {
        return Err(err(
            "KEY_AVRO_TARGET",
            "Generated Avro document failed UMF admission",
            "/target",
        ));
    }
    let fatal = native_inspection
        .native_inspection
        .as_ref()
        .is_some_and(|report| {
            report.diagnostics.iter().any(|diagnostic| {
                ["AVRO_VALIDATOR_LIMIT", "AVRO_NUMERIC"].iter().any(|code| {
                    diagnostic
                        .code
                        .units()
                        .iter()
                        .copied()
                        .eq(code.encode_utf16())
                })
            })
        });
    let blocked = impossible || fatal || text(get(&request, "mode")).as_deref() == Some("strict");
    if fatal {
        losses.push(residual(
            "/request",
            &request,
            "Generated native schema is outside the qualified Avro carrier interpretation",
            "not-expressible",
            ctx,
        )?);
    }
    let diagnostics = losses
        .iter()
        .map(|r| {
            obj(vec![
                ("code", s("KEY_AVRO_LOSS")),
                ("path", get(r, "path").cloned().unwrap_or(Value::Null)),
                ("message", get(r, "reason").cloned().unwrap_or(Value::Null)),
                ("severity", s(if blocked { "error" } else { "warning" })),
            ])
        })
        .collect();
    let binding=obj(vec![("id",s("umf.avro.keys")),("version",s("1.0.0")),("nativeVersion",s("1.12.0")),("subset",s("Authored required singular scalar Record Fields projected to explicit Avro carriers; no native collection uniqueness, key identity or exact input conversion; per-key residual recovery is required"))]);
    let mut output = obj(vec![
        ("operation", s("project-keys-avro")),
        ("version", s("1.0.0")),
        ("status", s(if blocked { "blocked" } else { "projected" })),
        ("source", source),
        ("authors", authors),
        ("request", request),
        ("binding", binding),
        ("mappings", Value::Array(map_entries)),
        ("residuals", Value::Array(losses)),
        ("diagnostics", Value::Array(diagnostics)),
    ]);
    if !blocked {
        if let Value::Object(m) = &mut output {
            m.push((k("target"), target));
        }
    }
    validate_schema(&output, &root_schema, &rt, ctx, "KEY_AVRO_RESULT")?;
    Ok(output)
}
fn arr(v: Option<&Value>) -> &[Value] {
    if let Some(Value::Array(a)) = v {
        a
    } else {
        &[]
    }
}
pub fn project_keys_to_avro(
    source: &Value,
    authors: &Value,
    request: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    project_inner(source, authors, request, ctx)
}
pub fn verify_keys_avro_projection(
    receipt: &Value,
    current: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let receipt = copy_json(receipt, ctx)?;
    if text(get(&receipt, "status")).as_deref() != Some("projected") {
        return Err(err(
            "KEY_AVRO_RECEIPT",
            "Expected complete successful projection receipt",
            "/status",
        ));
    }
    let expected = project_inner(
        get(&receipt, "source")
            .ok_or_else(|| err("KEY_AVRO_RECEIPT", "Source required", "/source"))?,
        get(&receipt, "authors")
            .ok_or_else(|| err("KEY_AVRO_RECEIPT", "Authors required", "/authors"))?,
        get(&receipt, "request")
            .ok_or_else(|| err("KEY_AVRO_RECEIPT", "Request required", "/request"))?,
        ctx,
    )?;
    if !equal(&receipt, &expected) {
        return Err(err(
            "KEY_AVRO_RECEIPT",
            "Receipt differs from retained source, authors and request",
            "",
        ));
    }
    if !equal(current, get(&receipt, "target").unwrap_or(&Value::Null)) {
        return Err(err(
            "KEY_AVRO_STALE",
            "Native target changed since projection",
            "/target",
        ));
    }
    Ok(receipt)
}
pub fn recover_keys_avro_ideal(
    receipt: &Value,
    current: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let receipt = verify_keys_avro_projection(receipt, current, ctx)?;
    copy_json(
        get(&receipt, "source")
            .ok_or_else(|| err("KEY_AVRO_RECEIPT", "Source required", "/source"))?,
        ctx,
    )
}
