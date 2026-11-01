// SPDX-License-Identifier: MIT OR Apache-2.0
//! Rust-owned PostgreSQL captured standalone-composite classification.
use crate::{
    context::Context,
    engine::{Capabilities, Engine, ResourceSet, SemanticContext},
    error::{Diagnostic, EngineError},
    postgresql_catalog as pg,
    registry::Registry,
    schema::CompiledSchema,
    serialization::{self, Format},
    value::{copy_json, Utf16, Value},
};
const SCHEMA: &str =
    include_str!("../../../spec/core/postgresql-composite-classification.schema.json");
const CATALOG_PACKAGE: &str =
    include_str!("../../../spec/extensions/postgresql-catalog/package.json");
const RECOVERY: &str = "Source and native fragments retained; resolve conflict then recompute whole record classification";
const BINDING_ID: &str = "umf.postgresql.catalog.composite";
const BINDING_SUBSET: &str = "Captured standalone composite member roles only; formatted attribute type names do not resolve scalar families or nested identities";
fn u(s: &str) -> Utf16 {
    Utf16::from(s)
}
fn t(s: &str) -> Value {
    Value::string_utf8(s)
}
fn obj(xs: Vec<(&str, Value)>) -> Value {
    Value::Object(xs.into_iter().map(|(k, v)| (u(k), v)).collect())
}
fn get<'a>(v: &'a Value, k: &str) -> Option<&'a Value> {
    if let Value::Object(m) = v {
        m.iter().find(|(x, _)| x == &u(k)).map(|(_, v)| v)
    } else {
        None
    }
}
fn set(v: &mut Value, k: &str, x: Value) -> Result<(), EngineError> {
    let Value::Object(m) = v else {
        return Err(err("POSTGRESQL_COMPOSITE_TARGET", "", "Expected object"));
    };
    if let Some((_, old)) = m.iter_mut().find(|(n, _)| n == &u(k)) {
        *old = x
    } else {
        m.push((u(k), x))
    };
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
fn read(s: &str, c: &mut Context<'_>) -> Result<Value, EngineError> {
    serialization::read_json_value(&s.encode_utf16().collect::<Vec<_>>(), Format::Json, c)
}
fn equal(a: &Value, b: &Value, c: &mut Context<'_>) -> Result<bool, EngineError> {
    fn canon(v: &Value, c: &mut Context<'_>, d: usize) -> Result<Value, EngineError> {
        if d > c.limits().max_depth {
            return Err(err("LIMIT", "", "Canonicalization depth exceeded"));
        }
        c.charge_work(1, Utf16::default())?;
        match v {
            Value::Array(xs) => {
                let mut out = Vec::with_capacity(xs.len());
                for x in xs {
                    out.push(canon(x, c, d + 1)?)
                }
                Ok(Value::Array(out))
            }
            Value::Object(xs) => {
                let mut out = Vec::with_capacity(xs.len());
                for (k, x) in xs {
                    c.charge_work(k.len().saturating_add(1), Utf16::default())?;
                    out.push((k.clone(), canon(x, c, d + 1)?))
                }
                out.sort_by(|a, b| a.0.cmp(&b.0));
                Ok(Value::Object(out))
            }
            _ => copy_json(v, c),
        }
    }
    Ok(canon(a, c, 0)? == canon(b, c, 0)?)
}
struct NoCallbacks;
impl Capabilities for NoCallbacks {
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
    request: CompiledSchema,
    result: CompiledSchema,
}
fn runtime(c: &mut Context<'_>) -> Result<Runtime, EngineError> {
    let core = |s: &str, c: &mut Context<'_>| read(s, c);
    let engine = Engine::new(
        ResourceSet::new(
            core(include_str!("../../../spec/core/schema.json"), c)?,
            core(
                include_str!("../../../spec/core/semantic-type-reference.schema.json"),
                c,
            )?,
            core(
                include_str!("../../../spec/core/extension-package.schema.json"),
                c,
            )?,
            core(
                include_str!("../../../spec/metamodel/generated/core-constraints.json"),
                c,
            )?,
            core(
                include_str!("../../../spec/metamodel/generated/domain-policy.json"),
                c,
            )?,
        ),
        c,
    )?;
    let resources = engine.schema_resources_with_context(c)?;
    let catalog_package = core(CATALOG_PACKAGE, c)?;
    let mut registry = Registry::new();
    registry.register(
        &catalog_package,
        Some(47),
        engine.package_schema(),
        &resources,
        c,
    )?;
    let schema = core(SCHEMA, c)?;
    let mut schemas = resources;
    schemas.entries.push((
        u("urn:umf:core:postgresql-composite-classification:1.0.0"),
        schema.clone(),
    ));
    let result = CompiledSchema::compile(&schema, &schemas, c)?;
    let request = CompiledSchema::compile(
        get(
            get(&schema, "properties").unwrap_or(&Value::Null),
            "request",
        )
        .ok_or_else(|| err("SCHEMA", "", "Request schema missing"))?,
        &schemas,
        c,
    )?;
    Ok(Runtime {
        engine,
        registry,
        request,
        result,
    })
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
            "Value does not match PostgreSQL composite schema",
        ))
    }
}
fn valid_document(source: &Value, r: &Runtime, c: &mut Context<'_>) -> Result<(), EngineError> {
    let mut caps = NoCallbacks;
    let report = r
        .engine
        .validate_document(source, &r.registry, &mut caps, c)?;
    if !report.valid || text(source, "umf") != Some(&u("0.10.0")) {
        return Err(err(
            "POSTGRESQL_COMPOSITE_VERSION",
            "",
            "Valid current 0.10.0 envelope required",
        ));
    }
    Ok(())
}
fn tagged_field<'a>(v: &'a Value, k: &str) -> Option<&'a Value> {
    get(get(v, "members")?, k)
}
fn tagged_text(v: Option<&Value>) -> Option<&Utf16> {
    let n = v?;
    if text(n, "kind") != Some(&u("string")) {
        return None;
    }
    text(n, "value")
}
fn tagged_array(v: Option<&Value>) -> Option<&[Value]> {
    let n = v?;
    if text(n, "kind") != Some(&u("array")) {
        return None;
    }
    arr(n, "items")
}
fn append_id(base: &Utf16, suffix: &str, c: &mut Context<'_>) -> Result<Utf16, EngineError> {
    let tail = suffix.encode_utf16().collect::<Vec<_>>();
    c.charge_work(base.len().saturating_add(tail.len()), Utf16::default())?;
    let mut x = base.units().to_vec();
    x.extend(tail);
    Ok(Utf16::new(x))
}
fn classify_inner(
    source: &Value,
    request: &Value,
    r: &Runtime,
    c: &mut Context<'_>,
) -> Result<Value, EngineError> {
    validate(request, &r.request, c, "POSTGRESQL_COMPOSITE_REQUEST")?;
    valid_document(source, r, c)?;
    let native = text(request, "nativeSource").ok_or_else(|| {
        err(
            "POSTGRESQL_COMPOSITE_REQUEST",
            "/nativeSource",
            "Native source required",
        )
    })?;
    let capture = pg::PostgresqlCatalogCapture::import(native, c)?;
    if capture.export(c)? != pg::export_document(source, c)? {
        return Err(err(
            "POSTGRESQL_COMPOSITE_ARCHIVE",
            "/nativeSource",
            "Native archive differs from captured tree",
        ));
    }
    let version = pg::get_node(source, &u("/serverVersion"), c)?;
    if text(&version, "kind") != Some(&u("number")) || text(&version, "value") != Some(&u("170004"))
    {
        return Err(err(
            "POSTGRESQL_COMPOSITE_SERVER",
            "/serverVersion",
            "This binding requires PostgreSQL 17.4",
        ));
    }
    let root = capture.root_tagged(c)?;
    let composites = tagged_array(
        tagged_field(&root, "snapshot").and_then(|s| tagged_field(s, "compositeTypes")),
    )
    .unwrap_or(&[]);
    let mut found = None;
    let mut count = 0usize;
    for (i, n) in composites.iter().enumerate() {
        c.charge_work(1, Utf16::default())?;
        if tagged_text(tagged_field(n, "schema"))
            == text(get(request, "relation").unwrap_or(&Value::Null), "schema")
            && tagged_text(tagged_field(n, "name"))
                == text(get(request, "relation").unwrap_or(&Value::Null), "name")
        {
            count += 1;
            found = Some((i, n));
        }
    }
    if count != 1 {
        return Err(err(
            "POSTGRESQL_COMPOSITE_IDENTITY",
            "/relation",
            "Qualified standalone composite is missing or ambiguous",
        ));
    }
    let (index, native_node) = found.unwrap();
    let native_path = format!("/snapshot/compositeTypes/{index}");
    let base = format!(
        "/modules/{}/elements",
        arr(source, "modules").map_or(0, |m| m.len())
    );
    let record_module = text(request, "recordModule").unwrap();
    let record_id = text(request, "recordId").unwrap();
    let relation = get(request, "relation").unwrap();
    let schema = text(relation, "schema").unwrap();
    let name = text(relation, "name").unwrap();
    let mut result = obj(vec![
        ("operation", t("classify-postgresql-composite")),
        ("version", t("1.0.0")),
        ("status", t("classified")),
        ("source", copy_json(source, c)?),
        ("request", copy_json(request, c)?),
        (
            "binding",
            obj(vec![
                ("id", t(BINDING_ID)),
                ("version", t("1.0.0")),
                ("nativeVersion", t("17.4")),
                ("subset", t(BINDING_SUBSET)),
            ]),
        ),
        ("mappings", Value::Array(Vec::new())),
        ("residuals", Value::Array(Vec::new())),
        ("diagnostics", Value::Array(Vec::new())),
    ]);
    let mut names = std::collections::BTreeSet::new();
    let mut previous = 0.0f64;
    let block = |result: &mut Value,
                 code: &str,
                 path: &str,
                 value: &Value,
                 reason: &str,
                 c: &mut Context<'_>|
     -> Result<(), EngineError> {
        set(result, "status", t("blocked"))?;
        let res = obj(vec![
            ("path", t(path)),
            ("value", copy_json(value, c)?),
            ("reason", t(reason)),
            ("recovery", t(RECOVERY)),
        ]);
        if let Value::Array(a) = get_mut_placeholder(result, "residuals") {
            a.push(res)
        };
        let d = obj(vec![
            ("code", t(code)),
            ("path", t(path)),
            ("message", t(reason)),
            ("severity", t("error")),
        ]);
        if let Some(Value::Array(a)) = get_mut_field(result, "diagnostics") {
            a.push(d)
        }
        Ok(())
    };
    // The output module is append-only; an existing module can never be silently overwritten.
    if arr(source, "modules")
        .unwrap_or(&[])
        .iter()
        .any(|m| text(m, "id") == Some(record_module))
    {
        block(
            &mut result,
            "COMPOSITE_MODULE_COLLISION",
            "/modules",
            &Value::String(record_module.clone()),
            "Output module exists; existing assertions cannot be overwritten",
            c,
        )?
    }
    let attributes = tagged_field(native_node, "attributes");
    let attribute_rows = match attributes {
        Some(v) if text(v, "kind") == Some(&u("null")) => &[][..],
        Some(v) => tagged_array(Some(v)).ok_or_else(|| {
            err(
                "POSTGRESQL_COMPOSITE_ATTRIBUTES",
                "/attributes",
                "Expected captured attribute array or empty aggregate",
            )
        })?,
        None => {
            return Err(err(
                "POSTGRESQL_COMPOSITE_ATTRIBUTES",
                "/attributes",
                "Captured attributes are missing",
            ))
        }
    };
    let mut fields = Vec::new();
    let mut mappings = Vec::new();
    for (i, attribute) in attribute_rows.iter().enumerate() {
        c.charge_work(1, Utf16::default())?;
        let path = format!("{native_path}/attributes/{i}");
        let attr_name = tagged_text(tagged_field(attribute, "name")).ok_or_else(|| {
            err(
                "POSTGRESQL_COMPOSITE_ATTRIBUTE",
                &path,
                "Malformed attribute name",
            )
        })?;
        let position_node = tagged_field(attribute, "position");
        let position_token = position_node
            .filter(|node| text(node, "kind") == Some(&u("number")))
            .and_then(|node| text(node, "value"))
            .ok_or_else(|| {
                err(
                    "POSTGRESQL_COMPOSITE_ATTRIBUTE",
                    &path,
                    "Malformed attribute position",
                )
            })?;
        let position_text = position_token.to_utf8().map_err(|_| {
            err(
                "POSTGRESQL_COMPOSITE_ATTRIBUTE",
                &path,
                "Malformed attribute position",
            )
        })?;
        let position =
            crate::javascript_numeric::numeric_to_number_lossless(&position_text, true, c)
                .map_err(|error| {
                    if error.is_control_failure() {
                        error
                    } else {
                        err(
                            "POSTGRESQL_COMPOSITE_ATTRIBUTE",
                            &path,
                            "Malformed attribute position",
                        )
                    }
                })?;
        if attr_name.is_empty() || !names.insert(attr_name.clone()) {
            block(
                &mut result,
                "COMPOSITE_MEMBER_NAME",
                &path,
                attribute,
                "Attribute names must be nonempty and unique",
                c,
            )?
        }
        if position <= previous || position <= 0.0 {
            block(&mut result,"COMPOSITE_MEMBER_ORDER",&path,attribute,"Attribute positions must be positive and strictly increasing; dropped-position gaps are allowed",c)?
        }
        previous = position;
        let field_id = append_id(record_id, &format!("/field/{i}"), c)?;
        fields.push(obj(vec![
            ("id", Value::String(field_id)),
            ("name", Value::String(attr_name.clone())),
            ("kind", t("field")),
            ("extensions", obj(vec![])),
        ]));
        mappings.push(obj(vec![
            ("origin", t("classified")),
            ("kind", t("field")),
            ("idealPath", t(&format!("{base}/{}/kind", i + 1))),
            ("nativePath", t(&path)),
            ("nativeFragment", copy_json(attribute, c)?),
            ("basis", t("checked-catalog-composite-attribute")),
            ("outcome", t("exact")),
        ]));
    }
    mappings.insert(
        0,
        obj(vec![
            ("origin", t("classified")),
            ("kind", t("record")),
            ("idealPath", t(&format!("{base}/0/kind"))),
            ("nativePath", t(&native_path)),
            ("nativeFragment", copy_json(native_node, c)?),
            ("basis", t("checked-catalog-composite")),
            (
                "outcome",
                t(if text(&result, "status") == Some(&u("classified")) {
                    "exact"
                } else {
                    "unknown"
                }),
            ),
        ]),
    );
    set(&mut result, "mappings", Value::Array(mappings))?;
    if text(&result, "status") == Some(&u("classified")) {
        let mut references = Vec::new();
        for f in &fields {
            references.push(obj(vec![
                ("role", t("member")),
                ("module", Value::String(record_module.clone())),
                ("element", copy_json(get(f, "id").unwrap(), c)?),
            ]))
        }
        let record = obj(vec![
            ("id", Value::String(record_id.clone())),
            ("name", Value::String(name.clone())),
            ("kind", t("record")),
            ("extensions", obj(vec![])),
            ("references", Value::Array(references)),
        ]);
        let mut elements = vec![record];
        elements.extend(fields);
        let module = obj(vec![
            ("id", Value::String(record_module.clone())),
            ("namespace", Value::String(schema.clone())),
            ("elements", Value::Array(elements)),
        ]);
        let mut target = copy_json(source, c)?;
        let Value::Array(modules) = get_mut_field(&mut target, "modules")
            .ok_or_else(|| err("POSTGRESQL_COMPOSITE_TARGET", "/modules", "Modules missing"))?
        else {
            return Err(err(
                "POSTGRESQL_COMPOSITE_TARGET",
                "/modules",
                "Modules must be an array",
            ));
        };
        modules.push(module);
        let mut caps = NoCallbacks;
        let report = r
            .engine
            .validate_document(&target, &r.registry, &mut caps, c)?;
        if !report.valid {
            return Err(err(
                "POSTGRESQL_COMPOSITE_TARGET",
                "",
                "Invalid derived core record",
            ));
        }
        set(&mut result, "target", target)?;
    }
    validate(&result, &r.result, c, "POSTGRESQL_COMPOSITE_RESULT")?;
    Ok(result)
}
fn get_mut_field<'a>(v: &'a mut Value, k: &str) -> Option<&'a mut Value> {
    if let Value::Object(m) = v {
        m.iter_mut().find(|(n, _)| n == &u(k)).map(|(_, v)| v)
    } else {
        None
    }
}
fn get_mut_placeholder<'a>(v: &'a mut Value, k: &str) -> &'a mut Value {
    get_mut_field(v, k).expect("result field exists")
}
pub fn classify(
    source: &Value,
    request: &Value,
    c: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let r = runtime(c)?;
    let s = copy_json(source, c)?;
    let q = copy_json(request, c)?;
    classify_inner(&s, &q, &r, c)
}
pub fn verify(receipt: &Value, current: &Value, c: &mut Context<'_>) -> Result<Value, EngineError> {
    let r = runtime(c)?;
    validate(receipt, &r.result, c, "POSTGRESQL_COMPOSITE_RECEIPT")?;
    if text(receipt, "status") != Some(&u("classified")) {
        return Err(err(
            "POSTGRESQL_COMPOSITE_RECEIPT",
            "/status",
            "Expected complete classified receipt",
        ));
    }
    let expected = classify_inner(
        get(receipt, "source").unwrap(),
        get(receipt, "request").unwrap(),
        &r,
        c,
    )?;
    if !equal(receipt, &expected, c)? {
        return Err(err(
            "POSTGRESQL_COMPOSITE_RECEIPT",
            "",
            "Receipt differs from recomputation",
        ));
    }
    if !equal(current, get(receipt, "target").unwrap(), c)? {
        return Err(err(
            "POSTGRESQL_COMPOSITE_STALE",
            "",
            "Current model changed",
        ));
    }
    copy_json(receipt, c)
}
pub fn recover(
    receipt: &Value,
    current: &Value,
    c: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    let checked = verify(receipt, current, c)?;
    text(
        get(&checked, "request").unwrap_or(&Value::Null),
        "nativeSource",
    )
    .cloned()
    .ok_or_else(|| {
        err(
            "POSTGRESQL_COMPOSITE_RECEIPT",
            "/request/nativeSource",
            "Retained native source required",
        )
    })
}
