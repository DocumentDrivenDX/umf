// SPDX-License-Identifier: MIT OR Apache-2.0
//! Rust-owned authored Cardinality and Nullability projections to TableSpec.
use crate::{
    cardinality,
    context::Context,
    engine::{Capabilities, Engine, ResourceSet, SemanticContext},
    error::{Diagnostic, EngineError},
    nullability,
    registry::Registry,
    schema::{CompiledSchema, SchemaResources},
    serialization::{self, Format},
    tablespec_adapter::{TableSpecFormat, TableSpecRuntime},
    value::{copy_json, Utf16, Value},
};

const CARD_SCHEMA: &str =
    include_str!("../../../spec/core/cardinality-tablespec-projection.schema.json");
const NULL_SCHEMA: &str =
    include_str!("../../../spec/core/nullability-tablespec-projection.schema.json");
const CORE_SCHEMA: &str = include_str!("../../../spec/core/schema.json");
const CARD_AUTHOR: &str = include_str!("../../../spec/core/cardinality-operation-v4.schema.json");
const NULL_AUTHOR: &str = include_str!("../../../spec/core/nullability-operation-v5.schema.json");
const RECOVERY: &str = "Recover source meaning with retained projection receipt; native-only import does not recover author intent";

fn k(s: &str) -> Utf16 {
    Utf16::from(s)
}
fn s(s: &str) -> Value {
    Value::string_utf8(s)
}
fn obj(v: Vec<(&str, Value)>) -> Value {
    Value::Object(v.into_iter().map(|(a, b)| (k(a), b)).collect())
}
fn get<'a>(v: &'a Value, name: &str) -> Option<&'a Value> {
    match v {
        Value::Object(m) => m.iter().find(|(key, _)| key == &k(name)).map(|(_, v)| v),
        _ => None,
    }
}
fn set(v: &mut Value, name: &str, value: Value) {
    if let Value::Object(fields) = v {
        fields.retain(|(key, _)| key != &k(name));
        fields.push((k(name), value));
    }
}
fn arr(v: Option<&Value>) -> &[Value] {
    if let Some(Value::Array(a)) = v {
        a
    } else {
        &[]
    }
}
fn txt(v: Option<&Value>) -> Option<String> {
    if let Some(Value::String(t)) = v {
        t.to_utf8().ok()
    } else {
        None
    }
}
fn err(code: &str, message: &str, path: &str) -> EngineError {
    EngineError::new(code, k(path), message)
}
fn json(source: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    serialization::read_json_value(
        &source.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        ctx,
    )
}
struct NoCapabilities;
impl Capabilities for NoCapabilities {
    fn validate_extension(
        &mut self,
        _: u64,
        _: &Value,
        _: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        Ok(vec![])
    }
}
fn engine(ctx: &mut Context<'_>) -> Result<(Engine, Registry), EngineError> {
    let e = Engine::new(
        ResourceSet::new(
            json(CORE_SCHEMA, ctx)?,
            json(
                include_str!("../../../spec/core/semantic-type-reference.schema.json"),
                ctx,
            )?,
            json(
                include_str!("../../../spec/core/extension-package.schema.json"),
                ctx,
            )?,
            json(
                include_str!("../../../spec/metamodel/generated/core-constraints.json"),
                ctx,
            )?,
            json(
                include_str!("../../../spec/metamodel/generated/domain-policy.json"),
                ctx,
            )?,
        ),
        ctx,
    )?;
    Ok((e, Registry::default()))
}
fn schemas(
    null: bool,
    ctx: &mut Context<'_>,
) -> Result<(CompiledSchema, CompiledSchema), EngineError> {
    let root = json(if null { NULL_SCHEMA } else { CARD_SCHEMA }, ctx)?;
    let resources = SchemaResources {
        entries: vec![
            (
                k("urn:umf:core:semantic-type-reference:1.0.0"),
                json(
                    include_str!("../../../spec/core/semantic-type-reference.schema.json"),
                    ctx,
                )?,
            ),
            (k("urn:umf:core:0.10.0"), json(CORE_SCHEMA, ctx)?),
            (
                k(if null {
                    "urn:umf:core:nullability-operation:5.0.0"
                } else {
                    "urn:umf:core:cardinality-operation:4.0.0"
                }),
                json(if null { NULL_AUTHOR } else { CARD_AUTHOR }, ctx)?,
            ),
        ],
    };
    let result = CompiledSchema::compile(&root, &resources, ctx)?;
    let req =
        get(get(&root, "properties").unwrap_or(&Value::Null), "request").ok_or_else(|| {
            err(
                "TABLESPEC_AUTHORED_SCHEMA",
                "Projection request schema missing",
                "",
            )
        })?;
    Ok((result, CompiledSchema::compile(req, &resources, ctx)?))
}
fn ptr(v: &Utf16) -> String {
    let mut s = v.to_utf8().unwrap_or_default();
    s = s.replace('~', "~0").replace('/', "~1");
    s
}
fn ptr_utf16(v: &Utf16) -> Utf16 {
    let mut units = Vec::with_capacity(v.units().len());
    for unit in v.units() {
        match *unit {
            0x007e => units.extend([0x007e, 0x0030]),
            0x002f => units.extend([0x007e, 0x0031]),
            other => units.push(other),
        }
    }
    Utf16::new(units)
}
fn push_loss(
    out: &mut Vec<Value>,
    path: String,
    value: &Value,
    reason: &str,
    outcome: &str,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    out.push(obj(vec![
        ("path", Value::String(Utf16::from(path))),
        ("value", copy_json(value, ctx)?),
        ("reason", s(reason)),
        ("outcome", s(outcome)),
        ("recovery", s(RECOVERY)),
    ]));
    Ok(())
}
fn equal(a: &Value, b: &Value, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    fn canonical(v: &Value, ctx: &mut Context<'_>, depth: usize) -> Result<Value, EngineError> {
        if depth > ctx.limits().max_depth {
            return Err(err("LIMIT", "Canonicalization depth exceeded", ""));
        }
        ctx.charge_work(1, Utf16::default())?;
        match v {
            Value::Array(values) => Ok(Value::Array(
                values
                    .iter()
                    .map(|value| canonical(value, ctx, depth + 1))
                    .collect::<Result<_, _>>()?,
            )),
            Value::Object(fields) => {
                let mut canonical_fields = Vec::with_capacity(fields.len());
                for (key, value) in fields {
                    ctx.charge_work(key.len().saturating_add(1), Utf16::default())?;
                    canonical_fields.push((key.clone(), canonical(value, ctx, depth + 1)?));
                }
                canonical_fields.sort_by(|left, right| left.0.cmp(&right.0));
                Ok(Value::Object(canonical_fields))
            }
            _ => copy_json(v, ctx),
        }
    }
    Ok(canonical(a, ctx, 0)? == canonical(b, ctx, 0)?)
}

fn project(
    input: &Value,
    request_input: &Value,
    null: bool,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let author_input = copy_json(input, ctx)?;
    let request = copy_json(request_input, ctx)?;
    let (result_schema, request_schema) = schemas(null, ctx)?;
    if let Some(d) = request_schema.validate(&request, ctx)?.first() {
        return Err(EngineError::new(
            if null {
                "NULLABILITY_TABLESPEC_REQUEST"
            } else {
                "CARDINALITY_TABLESPEC_REQUEST"
            },
            d.instance_path.clone(),
            d.message.clone(),
        ));
    }
    let (eng, reg) = engine(ctx)?;
    let mut caps = NoCapabilities;
    let target_input = get(&author_input, "target").ok_or_else(|| {
        err(
            "TABLESPEC_AUTHORED_AUTHOR",
            "Author target is required",
            "/author/target",
        )
    })?;
    let author = if null {
        nullability::verify_core_nullability_declaration(
            &author_input,
            target_input,
            &eng,
            &reg,
            &mut caps,
            ctx,
        )?
    } else {
        cardinality::verify_core_cardinality_declaration(
            &author_input,
            target_input,
            &eng,
            &reg,
            &mut caps,
            ctx,
        )?
    };
    let source = copy_json(
        get(&author, "target").ok_or_else(|| {
            err(
                "TABLESPEC_AUTHORED_AUTHOR",
                "Author target is required",
                "/author/target",
            )
        })?,
        ctx,
    )?;
    if !null && txt(get(&source, "umf")).as_deref() != Some("0.10.0") {
        return Err(err("CARDINALITY_TABLESPEC_VERSION","This binding requires a core 0.10.0 declaration; facet-envelope projection requires a separately qualified binding","/author/target/umf"));
    }
    let identity = get(&author, "identity").ok_or_else(|| {
        err(
            "TABLESPEC_AUTHORED_AUTHOR",
            "Identity is required",
            "/author/identity",
        )
    })?;
    let mid = txt(get(identity, "module")).ok_or_else(|| {
        err(
            "TABLESPEC_AUTHORED_AUTHOR",
            "Module identity is required",
            "/author/identity/module",
        )
    })?;
    let eid = txt(get(identity, "element")).ok_or_else(|| {
        err(
            "TABLESPEC_AUTHORED_AUTHOR",
            "Element identity is required",
            "/author/identity/element",
        )
    })?;
    let modules = arr(get(&source, "modules"));
    let mi = modules
        .iter()
        .position(|m| txt(get(m, "id")).as_deref() == Some(&mid))
        .ok_or_else(|| {
            err(
                "TABLESPEC_AUTHORED_AUTHOR",
                "Authored module is absent",
                "/author/identity/module",
            )
        })?;
    let elements = arr(get(&modules[mi], "elements"));
    let ei = elements
        .iter()
        .position(|e| txt(get(e, "id")).as_deref() == Some(&eid))
        .ok_or_else(|| {
            err(
                "TABLESPEC_AUTHORED_AUTHOR",
                "Authored element is absent",
                "/author/identity/element",
            )
        })?;
    let element = &elements[ei];
    let path = format!("/modules/{mi}/elements/{ei}");
    let req = |n: &str| txt(get(&request, n));
    let id = req("id").ok_or_else(|| {
        err(
            "TABLESPEC_AUTHORED_REQUEST",
            "id is required",
            "/request/id",
        )
    })?;
    let table = req("tableName").ok_or_else(|| {
        err(
            "TABLESPEC_AUTHORED_REQUEST",
            "tableName is required",
            "/request/tableName",
        )
    })?;
    let column = req("columnName").ok_or_else(|| {
        err(
            "TABLESPEC_AUTHORED_REQUEST",
            "columnName is required",
            "/request/columnName",
        )
    })?;
    let native = req("nativeType").ok_or_else(|| {
        err(
            "TABLESPEC_AUTHORED_REQUEST",
            "nativeType is required",
            "/request/nativeType",
        )
    })?;
    let mut residuals = Vec::new();
    let mut mapping;
    let mut nullable: Option<Value> = None;
    let mut profile_notes = Vec::new();
    if let Some(Value::String(name)) = get(element, "name") {
        if name != &Utf16::from(column.as_str()) {
            push_loss(
                &mut residuals,
                format!("{path}/name"),
                get(element, "name").unwrap(),
                "Explicit native column name differs from ideal name",
                "not-expressible",
                ctx,
            )?;
        }
    }
    if let Value::Object(props) = &source {
        for (key, value) in props {
            ctx.charge_work(key.len().saturating_add(1), Utf16::default())?;
            let name = key.to_utf8().unwrap_or_default();
            if !["umf", "id", "modules", "vocabularies"].contains(&name.as_str()) {
                push_loss(
                    &mut residuals,
                    format!("/{}", ptr(key)),
                    value,
                    "Document metadata is retained but not projected",
                    "unknown",
                    ctx,
                )?;
            }
        }
    }
    if let Some(Value::Object(vocs)) = get(&source, "vocabularies") {
        if !vocs.is_empty() {
            push_loss(
                &mut residuals,
                "/vocabularies".into(),
                get(&source, "vocabularies").unwrap(),
                "Native vocabulary semantics are not projected",
                "unknown",
                ctx,
            )?;
        }
    }
    for (i, module) in modules.iter().enumerate() {
        ctx.charge_work(1, Utf16::default())?;
        if i != mi {
            push_loss(
                &mut residuals,
                format!("/modules/{i}"),
                module,
                "Other module is outside selected Field projection",
                "unknown",
                ctx,
            )?;
            continue;
        }
        if let Some(Value::String(ns)) = get(module, "namespace") {
            if !ns.is_empty() {
                push_loss(
                    &mut residuals,
                    format!("/modules/{i}/namespace"),
                    get(module, "namespace").unwrap(),
                    "This TableSpec binding has no namespace representation",
                    "not-expressible",
                    ctx,
                )?;
            }
        }
        if let Value::Object(props) = module {
            for (key, value) in props {
                let name = key.to_utf8().unwrap_or_default();
                if !["id", "namespace", "elements"].contains(&name.as_str()) {
                    push_loss(
                        &mut residuals,
                        format!("/modules/{i}/{}", ptr(key)),
                        value,
                        "Module metadata is not projected",
                        "unknown",
                        ctx,
                    )?;
                }
            }
        }
        for (j, other) in arr(get(module, "elements")).iter().enumerate() {
            ctx.charge_work(1, Utf16::default())?;
            if j != ei {
                push_loss(
                    &mut residuals,
                    format!("/modules/{i}/elements/{j}"),
                    other,
                    "Other element is outside selected Field projection",
                    "unknown",
                    ctx,
                )?;
            }
        }
    }
    if let Value::Object(props) = element {
        for (key, value) in props {
            ctx.charge_work(key.len().saturating_add(1), Utf16::default())?;
            let name = key.to_utf8().unwrap_or_default();
            let known = if null {
                [
                    "id",
                    "kind",
                    "name",
                    "description",
                    "scalarType",
                    "nullability",
                ]
                .contains(&name.as_str())
            } else {
                [
                    "id",
                    "kind",
                    "name",
                    "description",
                    "scalarType",
                    "cardinality",
                    "itemType",
                ]
                .contains(&name.as_str())
            };
            let empty_ext =
                name == "extensions" && matches!(value,Value::Object(x) if x.is_empty());
            if !known && !empty_ext {
                push_loss(
                    &mut residuals,
                    format!("{path}/{}", ptr(key)),
                    value,
                    "Field metadata is retained but not projected",
                    "unknown",
                    ctx,
                )?;
            }
        }
    }
    if null {
        let nullability = txt(get(
            get(&author, "provenance").unwrap_or(&Value::Null),
            "nullability",
        ))
        .unwrap_or_else(|| "unspecified".into());
        mapping = obj(vec![
            ("origin", s("authored")),
            (
                "idealPath",
                Value::String(Utf16::from(format!("{path}/nullability"))),
            ),
            ("nativePath", Value::Null),
            ("nullability", s(&nullability)),
            ("encoding", s("omitted")),
            (
                "context",
                get(&request, "context")
                    .map(|v| copy_json(v, ctx))
                    .transpose()?
                    .unwrap_or(Value::Null),
            ),
            (
                "carrier",
                get(&request, "carrier")
                    .map(|v| copy_json(v, ctx))
                    .transpose()?
                    .unwrap_or(Value::Null),
            ),
            (
                "profile",
                get(&request, "profile")
                    .map(|v| copy_json(v, ctx))
                    .transpose()?
                    .unwrap_or(Value::Null),
            ),
            ("outcome", s("exact")),
        ]);
        let profile = req("profile").unwrap_or_default();
        let carrier = req("carrier").unwrap_or_default();
        if profile == "unresolved" {
            push_loss(
                &mut residuals,
                format!("{path}/nullability"),
                &Value::String(Utf16::from(nullability.clone())),
                "No target native profile selected; availability is retained only in the receipt",
                "unknown",
                ctx,
            )?;
        } else if nullability != "unspecified" {
            if carrier != "null-value" {
                push_loss(&mut residuals,format!("{path}/nullability"),&Value::String(Utf16::from(nullability.clone())),"No explicit absence carrier selected; omission and present null are not equated","unknown",ctx)?;
            } else if let Some(Value::String(context)) = get(request_input, "context") {
                nullable = Some(Value::Object(vec![(
                    context.clone(),
                    Value::Bool(nullability == "absent-allowed"),
                )]));
                set(&mut mapping, "encoding", s("context-map"));
                let mut native_path = Utf16::from("/columns/0/nullable/").units().to_vec();
                native_path.extend_from_slice(ptr_utf16(context).units());
                set(
                    &mut mapping,
                    "nativePath",
                    Value::String(Utf16::new(native_path)),
                );
            } else if profile == "runtime-model" {
                nullable = Some(Value::Bool(nullability == "absent-allowed"));
                set(&mut mapping, "encoding", s("boolean"));
                set(
                    &mut mapping,
                    "nativePath",
                    Value::String(Utf16::from("/columns/0/nullable")),
                );
                profile_notes.push(obj(vec![("profile",s("checked-schema")),("code",s("SCALAR_BOOLEAN_REJECTED")),("message",s("This scalar boolean is accepted by the selected runtime profile but rejected by the pinned checked-in schema; that other profile is not claimed"))]));
            } else {
                push_loss(&mut residuals,format!("{path}/nullability"),&Value::String(Utf16::from(nullability.clone())),"Checked-schema profile needs an explicit context to encode the availability assertion","not-expressible",ctx)?;
            }
        }
    } else {
        let card = txt(get(
            get(&author, "provenance").unwrap_or(&Value::Null),
            "cardinality",
        ))
        .unwrap_or_else(|| "unspecified".into());
        let cardinality_value = Value::String(Utf16::from(card.clone()));
        mapping = obj(vec![
            ("origin", s("authored")),
            (
                "idealPath",
                Value::String(Utf16::from(format!("{path}/cardinality"))),
            ),
            ("nativePath", Value::String(Utf16::from("/columns/0"))),
            ("cardinality", s(&card)),
            (
                "encoding",
                s(if native == "EMBEDDING" {
                    "embedding"
                } else {
                    "scalar"
                }),
            ),
            (
                "profile",
                get(&request, "profile")
                    .map(|v| copy_json(v, ctx))
                    .transpose()?
                    .unwrap_or(Value::Null),
            ),
            ("itemPath", Value::Null),
            ("outcome", s("exact")),
        ]);
        if matches!(get(&request, "requireExactValues"), Some(Value::Bool(true))) {
            push_loss(
                &mut residuals,
                path.clone(),
                element,
                if req("profile").as_deref() == Some("generated-spark")
                    && ["FLOAT", "EMBEDDING"].contains(&native.as_str())
                {
                    "Binary32 storage fails requested value exactness: 1.0000000000000002 narrows to 1.0"
                } else {
                    "This schema-shape binding does not establish exact value-domain conversion"
                },
                "approximated",
                ctx,
            )?;
        }
        if req("profile").as_deref() == Some("unresolved") {
            push_loss(&mut residuals,format!("{path}/cardinality"),&cardinality_value,"No execution profile selected; carrier acceptance does not establish shape enforcement","unknown",ctx)?;
        }
        if card == "map"
            || (card == "array" && native != "EMBEDDING")
            || (card == "one" && native == "EMBEDDING")
        {
            set(&mut mapping, "encoding", s("carrier-only"));
            push_loss(&mut residuals,format!("{path}/cardinality"),&cardinality_value,"Selected native carrier cannot express this shape; no map/text or child-table encoding is implied","not-expressible",ctx)?;
        }
        if native == "EMBEDDING" {
            push_loss(
                &mut residuals,
                format!("{path}/cardinality"),
                &cardinality_value,
                if req("profile").as_deref() == Some("generated-spark") {
                    "Native vector dimension is required metadata but is not enforced by the generated Spark schema"
                } else {
                    "Native embedding adds fixed length and numeric item restrictions absent from general ideal arrays"
                },
                "approximated",
                ctx,
            )?;
        }
        if let Some(item_ref) = get(element, "itemType") {
            let item_module = txt(get(item_ref, "module")).unwrap_or_default();
            let item_id = txt(get(item_ref, "element")).unwrap_or_default();
            let im = modules
                .iter()
                .position(|m| txt(get(m, "id")).as_deref() == Some(&item_module))
                .unwrap_or(mi);
            let item_elements = arr(get(modules.get(im).unwrap_or(&modules[mi]), "elements"));
            let ie = item_elements
                .iter()
                .position(|item| txt(get(item, "id")).as_deref() == Some(&item_id))
                .unwrap_or(0);
            let item = item_elements.get(ie).unwrap_or(&Value::Null);
            let item_path = format!("/modules/{im}/elements/{ie}");
            set(
                &mut mapping,
                "itemPath",
                Value::String(Utf16::from(item_path.clone())),
            );
            push_loss(&mut residuals, format!("{path}/itemType"), item_ref,
                "Item reference and its full definition require retained recovery; no recursive native type is fabricated",
                if native == "EMBEDDING" { "approximated" } else { "not-expressible" }, ctx)?;
            if native == "EMBEDDING" {
                let scalar = txt(get(item, "scalarType"));
                if scalar.as_deref().is_some_and(|v| v != "float") {
                    push_loss(
                        &mut residuals,
                        format!("{item_path}/scalarType"),
                        get(item, "scalarType").unwrap(),
                        "Embedding numeric/float items do not express the selected item family",
                        "not-expressible",
                        ctx,
                    )?;
                }
                if scalar.as_deref() == Some("float") {
                    push_loss(
                        &mut residuals,
                        format!("{item_path}/scalarType"),
                        get(item, "scalarType").unwrap(),
                        if req("profile").as_deref() == Some("generated-spark") {
                            "Binary32 storage may narrow unqualified float values, including the permanent binary64 counterexample"
                        } else {
                            "JSON numeric items do not establish a native floating-point representation"
                        },
                        "approximated",
                        ctx,
                    )?;
                }
                let item_card = txt(get(item, "cardinality"));
                if item_card
                    .as_deref()
                    .is_some_and(|v| v != "one" && v != "unspecified")
                    || get(item, "itemType").is_some()
                {
                    push_loss(&mut residuals, item_path.clone(), item, "Nested/repeated item definitions have no TableSpec EMBEDDING representation", "not-expressible", ctx)?;
                }
                if let Some(n) = get(item, "nullability") {
                    push_loss(
                        &mut residuals,
                        format!("{item_path}/nullability"),
                        n,
                        if req("profile").as_deref() == Some("generated-spark") {
                            "Generated Spark embedding permits null items; ideal availability remains independently asserted"
                        } else {
                            "Generated JSON embedding rejects null items; ideal availability remains independently asserted"
                        },
                        "approximated",
                        ctx,
                    )?;
                }
            }
        } else if card == "array" && native == "EMBEDDING" {
            push_loss(
                &mut residuals,
                format!("{path}/cardinality"),
                &cardinality_value,
                "Unspecified item meaning cannot be equated with native numeric/float items",
                "approximated",
                ctx,
            )?;
        }
    }
    let mut target_fields = vec![
        ("name", Value::String(Utf16::from(column.clone()))),
        ("data_type", s(&native)),
    ];
    if !null {
        if let Some(dim) = get(&request, "dimension") {
            if !matches!(dim, Value::Null) {
                target_fields.push(("dimension", copy_json(dim, ctx)?));
            }
        }
    }
    if let Some(desc) = get(element, "description") {
        target_fields.push(("description", copy_json(desc, ctx)?));
    }
    if let Some(nullable) = nullable {
        target_fields.push(("nullable", nullable));
    }
    let target_json = obj(vec![
        ("version", s("1.0")),
        ("table_name", Value::String(Utf16::from(table))),
        ("columns", Value::Array(vec![obj(target_fields)])),
    ]);
    let compact = serialization::stringify_compact_metered(&target_json, ctx)?;
    ctx.charge_work(compact.units().len().saturating_add(1), Utf16::default())?;
    let mut units = compact.units().to_vec();
    units.push(10);
    let serialized = Utf16::new(units);
    let table_runtime = TableSpecRuntime::new(ctx)?;
    let target = table_runtime.import(&serialized, &Utf16::from(id), TableSpecFormat::Json, ctx)?;
    let target_elements = arr(get(
        arr(get(&target, "modules")).first().unwrap_or(&Value::Null),
        "elements",
    ));
    let target_scalar = target_elements
        .first()
        .and_then(|e| txt(get(e, "scalarType")));
    let source_scalar = txt(get(element, "scalarType"));
    if source_scalar.is_some() && source_scalar != target_scalar {
        push_loss(
            &mut residuals,
            format!("{path}/scalarType"),
            get(element, "scalarType").unwrap(),
            "Explicit native type does not establish the stated scalar family",
            "not-expressible",
            ctx,
        )?;
    }
    let residual_exists = !residuals.is_empty();
    let mode = req("mode").unwrap_or_default();
    let blocked = mode == "strict" && residual_exists;
    let outcome = if residuals.is_empty() {
        "exact"
    } else if residuals
        .iter()
        .any(|r| txt(get(r, "outcome")).as_deref() == Some("not-expressible"))
    {
        "not-expressible"
    } else if residuals
        .iter()
        .any(|r| txt(get(r, "outcome")).as_deref() == Some("unknown"))
    {
        "unknown"
    } else {
        "approximated"
    };
    set(&mut mapping, "outcome", s(outcome));
    let mut fields = vec![
        (
            "operation",
            s(if null {
                "project-nullability-tablespec"
            } else {
                "project-cardinality-tablespec"
            }),
        ),
        ("version", s("1.0.0")),
        ("status", s(if blocked { "blocked" } else { "projected" })),
        ("source", source),
        ("author", author),
        ("request", request),
        (
            "binding",
            get(
                &json(if null { NULL_SCHEMA } else { CARD_SCHEMA }, ctx)?,
                "properties",
            )
            .and_then(|p| get(p, "binding"))
            .and_then(|b| get(b, "const"))
            .map(|v| copy_json(v, ctx))
            .transpose()?
            .unwrap_or(Value::Null),
        ),
        ("mapping", mapping),
        ("residuals", Value::Array(residuals.clone())),
    ];
    if !blocked {
        fields.push(("target", target));
    }
    if null {
        fields.push(("profileNotes", Value::Array(profile_notes)));
    }
    let code = if null {
        "NULLABILITY_MEANING_NOT_PROJECTED"
    } else {
        "CARDINALITY_MEANING_NOT_PROJECTED"
    };
    let mut diagnostics = Vec::new();
    for r in &residuals {
        diagnostics.push(obj(vec![
            ("code", s(code)),
            (
                "path",
                copy_json(get(r, "path").unwrap_or(&Value::Null), ctx)?,
            ),
            (
                "message",
                copy_json(get(r, "reason").unwrap_or(&Value::Null), ctx)?,
            ),
            ("severity", s(if blocked { "error" } else { "warning" })),
        ]));
    }
    fields.push(("diagnostics", Value::Array(diagnostics)));
    let result = obj(fields);
    if let Some(d) = result_schema.validate(&result, ctx)?.first() {
        return Err(EngineError::new(
            if null {
                "NULLABILITY_TABLESPEC_RESULT"
            } else {
                "CARDINALITY_TABLESPEC_RESULT"
            },
            d.instance_path.clone(),
            d.message.clone(),
        ));
    }
    Ok(result)
}
pub fn project_cardinality(
    input: &Value,
    request: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    project(input, request, false, ctx)
}
pub fn project_nullability(
    input: &Value,
    request: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    project(input, request, true, ctx)
}
pub fn recover(
    receipt: &Value,
    native_text: &Value,
    null: bool,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let operation = if null {
        "project-nullability-tablespec"
    } else {
        "project-cardinality-tablespec"
    };
    if txt(get(receipt, "operation")).as_deref() != Some(operation)
        || txt(get(receipt, "status")).as_deref() != Some("projected")
    {
        return Err(err(
            if null {
                "NULLABILITY_TABLESPEC_RECEIPT"
            } else {
                "CARDINALITY_TABLESPEC_RECEIPT"
            },
            "Expected projected receipt",
            "/receipt",
        ));
    }
    let author = get(receipt, "author").ok_or_else(|| {
        err(
            "TABLESPEC_AUTHORED_RECEIPT",
            "Author missing",
            "/receipt/author",
        )
    })?;
    let request = get(receipt, "request").ok_or_else(|| {
        err(
            "TABLESPEC_AUTHORED_RECEIPT",
            "Request missing",
            "/receipt/request",
        )
    })?;
    let expected = project(author, request, null, ctx)?;
    if !equal(&expected, receipt, ctx)? {
        return Err(err(
            if null {
                "NULLABILITY_TABLESPEC_RECEIPT"
            } else {
                "CARDINALITY_TABLESPEC_RECEIPT"
            },
            "Receipt does not match retained author and binding",
            "/receipt",
        ));
    }
    let target = get(receipt, "target").ok_or_else(|| {
        err(
            "TABLESPEC_AUTHORED_RECEIPT",
            "Target missing",
            "/receipt/target",
        )
    })?;
    let serialized = TableSpecRuntime::new(ctx)?.export(target, ctx)?;
    if !matches!(native_text,Value::String(text) if text==&serialized) {
        return Err(err(
            if null {
                "NULLABILITY_TABLESPEC_STALE"
            } else {
                "CARDINALITY_TABLESPEC_STALE"
            },
            "Native target changed; retained report cannot assert recovery",
            "/current",
        ));
    }
    copy_json(
        get(receipt, "source").ok_or_else(|| {
            err(
                "TABLESPEC_AUTHORED_RECEIPT",
                "Source missing",
                "/receipt/source",
            )
        })?,
        ctx,
    )
}
