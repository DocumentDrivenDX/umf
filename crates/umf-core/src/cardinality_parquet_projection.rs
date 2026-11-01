// SPDX-License-Identifier: MIT OR Apache-2.0
//! Rust-owned authored present-value Cardinality projection to a checked Parquet carrier.
use crate::{
    context::Context,
    engine::{Capabilities, Engine, ResourceSet, SemanticContext},
    error::{Diagnostic, EngineError},
    parquet_capture_inspection::{export_parquet_capture, import_parquet_schema},
    parquet_wire_encode::encode_parquet_wire,
    registry::Registry,
    schema::{CompiledSchema, SchemaResources},
    serialization::{self, Format},
    value::{copy_json, Utf16, Value},
};
use std::sync::{Arc, OnceLock};
const RESULT: &str = include_str!("../../../spec/core/cardinality-parquet-projection.schema.json");
const CORE: &str = include_str!("../../../spec/core/schema.json");
const AUTHOR: &str = include_str!("../../../spec/core/cardinality-operation-v4.schema.json");
const NULLABILITY_RESULT: &str =
    include_str!("../../../spec/core/nullability-parquet-projection.schema.json");
const RECOVERY:&str="Recover source meaning with retained projection receipt; native-only import does not recover author intent";
fn k(s: &str) -> Utf16 {
    Utf16::from(s)
}
fn s(s: &str) -> Value {
    Value::string_utf8(s)
}
fn obj(v: Vec<(&str, Value)>) -> Value {
    Value::Object(v.into_iter().map(|(a, b)| (k(a), b)).collect())
}
fn get<'a>(v: &'a Value, n: &str) -> Option<&'a Value> {
    if let Value::Object(m) = v {
        m.iter().find(|(a, _)| a == &k(n)).map(|(_, b)| b)
    } else {
        None
    }
}
fn arr(v: Option<&Value>) -> &[Value] {
    if let Some(Value::Array(a)) = v {
        a
    } else {
        &[]
    }
}
fn text(v: Option<&Value>) -> Option<String> {
    if let Some(Value::String(x)) = v {
        x.to_utf8().ok()
    } else {
        None
    }
}
fn err(c: &str, m: impl Into<String>, p: &str) -> EngineError {
    EngineError::new(c, k(p), m.into())
}
fn parse(s: &str, c: &mut Context<'_>) -> Result<Value, EngineError> {
    serialization::read_json_value(&s.encode_utf16().collect::<Vec<_>>(), Format::Json, c)
}
struct NoCaps;
impl Capabilities for NoCaps {
    fn validate_extension(
        &mut self,
        _: u64,
        _: &Value,
        _: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        Ok(Vec::new())
    }
}
struct Rt {
    engine: Engine,
    registry: Registry,
}
fn runtime(c: &mut Context<'_>) -> Result<Arc<Rt>, EngineError> {
    static CACHE: OnceLock<Arc<Rt>> = OnceLock::new();
    if c.profile() == crate::context::ResourceProfile::Cooperative
        && c.limits() == crate::context::Limits::ordinary()
    {
        if let Some(x) = CACHE.get() {
            return Ok(x.clone());
        }
    }
    let e = Engine::new(
        ResourceSet::new(
            parse(CORE, c)?,
            parse(
                include_str!("../../../spec/core/semantic-type-reference.schema.json"),
                c,
            )?,
            parse(
                include_str!("../../../spec/core/extension-package.schema.json"),
                c,
            )?,
            parse(
                include_str!("../../../spec/metamodel/generated/core-constraints.json"),
                c,
            )?,
            parse(
                include_str!("../../../spec/metamodel/generated/domain-policy.json"),
                c,
            )?,
        ),
        c,
    )?;
    let resources = e.schema_resources_with_context(c)?;
    let mut r = Registry::new();
    r.register(
        &parse(
            include_str!("../../../spec/extensions/parquet/package.json"),
            c,
        )?,
        None,
        e.package_schema(),
        &resources,
        c,
    )?;
    let x = Arc::new(Rt {
        engine: e,
        registry: r,
    });
    if c.profile() == crate::context::ResourceProfile::Cooperative
        && c.limits() == crate::context::Limits::ordinary()
    {
        let _ = CACHE.set(x.clone());
    }
    Ok(x)
}
fn schemas(rt: &Rt, c: &mut Context<'_>) -> Result<(CompiledSchema, CompiledSchema), EngineError> {
    let schema = parse(RESULT, c)?;
    let mut resources: SchemaResources = rt.engine.schema_resources_with_context(c)?;
    resources.entries.push((
        k("urn:umf:core:semantic-type-reference:1.0.0"),
        parse(
            include_str!("../../../spec/core/semantic-type-reference.schema.json"),
            c,
        )?,
    ));
    resources
        .entries
        .push((k("urn:umf:core:0.10.0"), parse(CORE, c)?));
    resources.entries.push((
        k("urn:umf:core:cardinality-operation:4.0.0"),
        parse(AUTHOR, c)?,
    ));
    let result = CompiledSchema::compile(&schema, &resources, c)?;
    let req = get(
        get(&schema, "properties").unwrap_or(&Value::Null),
        "request",
    )
    .unwrap();
    let mut request_schema = copy_json(req, c)?;
    if let (Value::Object(fields), Some(defs)) = (&mut request_schema, get(&schema, "$defs")) {
        fields.push((k("$defs"), copy_json(defs, c)?));
    }
    Ok((
        result,
        CompiledSchema::compile(&request_schema, &resources, c)?,
    ))
}
fn wire_i32(x: i32) -> Value {
    obj(vec![("kind", s("i32")), ("value", s(&x.to_string()))])
}
fn wire_i64(x: i64) -> Value {
    obj(vec![("kind", s("i64")), ("value", s(&x.to_string()))])
}
fn wire_binary(x: &Utf16, c: &mut Context<'_>) -> Result<Value, EngineError> {
    let st = x.to_utf8().map_err(|_| {
        err(
            "PARQUET_CARDINALITY_CARRIER",
            "Names must be Unicode scalar values",
            "/request",
        )
    })?;
    if st.is_empty() || st.contains('\0') {
        return Err(err(
            "PARQUET_CARDINALITY_CARRIER",
            "Names must be nonempty and contain no NUL",
            "/request",
        ));
    }
    let mut hex = String::new();
    for b in st.bytes() {
        use std::fmt::Write as _;
        write!(&mut hex, "{b:02x}").unwrap();
    }
    c.charge_work(st.len().saturating_mul(2), k("/request"))?;
    Ok(obj(vec![("kind", s("binary")), ("hex", s(&hex))]))
}
fn wire_struct(v: Vec<(i32, Value)>) -> Value {
    obj(vec![
        ("kind", s("struct")),
        (
            "fields",
            Value::Array(
                v.into_iter()
                    .map(|(id, value)| {
                        obj(vec![("id", Value::Number(id as f64)), ("value", value)])
                    })
                    .collect(),
            ),
        ),
    ])
}
fn scalar(native: &str) -> Result<(i32, Option<i32>), EngineError> {
    match native {
        "boolean" => Ok((0, None)),
        "int32" => Ok((1, None)),
        "int64" => Ok((2, None)),
        "float32" => Ok((4, None)),
        "float64" => Ok((5, None)),
        "binary" => Ok((6, None)),
        "string" => Ok((6, Some(0))),
        "date" => Ok((1, Some(6))),
        "time-millis" => Ok((1, Some(7))),
        "time-micros" => Ok((2, Some(8))),
        "timestamp-millis-utc" => Ok((2, Some(9))),
        "timestamp-micros-utc" => Ok((2, Some(10))),
        _ => Err(err(
            "PARQUET_CARDINALITY_CARRIER",
            "Unknown scalar carrier",
            "/request/nativeType",
        )),
    }
}
fn emit(
    name: &str,
    node: &Value,
    depth: usize,
    schema: &mut Vec<Value>,
    indices: &mut Vec<usize>,
    c: &mut Context<'_>,
) -> Result<(), EngineError> {
    c.charge_work(1, k("/request/nativeType"))?;
    if depth > 24 || depth > c.limits().max_depth || schema.len() > 1000 {
        return Err(err(
            "PARQUET_CARDINALITY_CARRIER",
            "Native type exceeds depth 24 or 1000 nodes",
            "/request/nativeType",
        ));
    }
    let index = schema.len();
    indices.push(index);
    let kind = text(get(node, "kind")).unwrap_or_default();
    let nullable = matches!(get(node, "nullable"), Some(Value::Bool(true)));
    let mut fields = vec![
        (3, wire_i32(if nullable { 1 } else { 0 })),
        (4, wire_binary(&k(name), c)?),
    ];
    if let Some(Value::Number(id)) = get(node, "fieldId") {
        if !id.is_finite() || id.fract() != 0. || *id < i32::MIN as f64 || *id > i32::MAX as f64 {
            return Err(err(
                "PARQUET_CARDINALITY_CARRIER",
                "fieldId must be exact int32",
                "/request/nativeType/fieldId",
            ));
        }
        fields.push((9, wire_i32(*id as i32)))
    }
    match kind.as_str() {
        "scalar" => {
            let n = text(get(node, "nativeType")).unwrap_or_default();
            let (t, converted) = scalar(&n)?;
            fields.push((1, wire_i32(t)));
            if let Some(x) = converted {
                fields.push((6, wire_i32(x)))
            }
            schema.push(wire_struct(fields));
        }
        "array" => {
            fields.extend([
                (5, wire_i32(1)),
                (6, wire_i32(3)),
                (10, wire_struct(vec![(3, wire_struct(vec![]))])),
            ]);
            schema.push(wire_struct(fields));
            schema.push(wire_struct(vec![
                (3, wire_i32(2)),
                (4, wire_binary(&k("list"), c)?),
                (5, wire_i32(1)),
            ]));
            emit(
                "element",
                get(node, "item").ok_or_else(|| {
                    err(
                        "PARQUET_CARDINALITY_CARRIER",
                        "Array item missing",
                        "/request/nativeType/item",
                    )
                })?,
                depth + 1,
                schema,
                indices,
                c,
            )?;
        }
        "map" => {
            let key = text(get(node, "keyType")).unwrap_or_default();
            let (t, converted) = scalar(&key)?;
            fields.extend([
                (5, wire_i32(1)),
                (6, wire_i32(1)),
                (10, wire_struct(vec![(2, wire_struct(vec![]))])),
            ]);
            schema.push(wire_struct(fields));
            schema.push(wire_struct(vec![
                (3, wire_i32(2)),
                (4, wire_binary(&k("key_value"), c)?),
                (5, wire_i32(2)),
            ]));
            let keynode = obj(vec![
                ("kind", s("scalar")),
                ("nullable", Value::Bool(false)),
                ("nativeType", s(&key)),
            ]);
            let mut keyfields = vec![
                (3, wire_i32(0)),
                (4, wire_binary(&k("key"), c)?),
                (1, wire_i32(t)),
            ];
            if let Some(x) = converted {
                keyfields.push((6, wire_i32(x)))
            }
            schema.push(wire_struct(keyfields));
            indices.push(schema.len() - 1);
            emit(
                "value",
                get(node, "value").ok_or_else(|| {
                    err(
                        "PARQUET_CARDINALITY_CARRIER",
                        "Map value missing",
                        "/request/nativeType/value",
                    )
                })?,
                depth + 1,
                schema,
                indices,
                c,
            )?;
            let _ = keynode;
        }
        "record" => {
            let children = arr(get(node, "fields"));
            if children.is_empty() {
                return Err(err(
                    "PARQUET_CARDINALITY_CARRIER",
                    "A native record requires fields",
                    "/request/nativeType/fields",
                ));
            }
            fields.push((
                5,
                wire_i32(
                    i32::try_from(children.len()).map_err(|_| {
                        err("LIMIT", "Record too large", "/request/nativeType/fields")
                    })?,
                ),
            ));
            schema.push(wire_struct(fields));
            for child in children {
                let name = text(get(child, "name")).ok_or_else(|| {
                    err(
                        "PARQUET_CARDINALITY_CARRIER",
                        "Record field name missing",
                        "/request/nativeType/fields",
                    )
                })?;
                emit(
                    &name,
                    get(child, "type").ok_or_else(|| {
                        err(
                            "PARQUET_CARDINALITY_CARRIER",
                            "Record field type missing",
                            "/request/nativeType/fields",
                        )
                    })?,
                    depth + 1,
                    schema,
                    indices,
                    c,
                )?;
            }
        }
        _ => {
            return Err(err(
                "PARQUET_CARDINALITY_CARRIER",
                "Unknown carrier kind",
                "/request/nativeType/kind",
            ))
        }
    }
    Ok(())
}
fn make_file(
    record: &str,
    field: &str,
    carrier: &Value,
    c: &mut Context<'_>,
) -> Result<(Vec<u8>, Vec<usize>), EngineError> {
    let mut schema = vec![wire_struct(vec![
        (4, wire_binary(&k(record), c)?),
        (5, wire_i32(1)),
    ])];
    let mut indices = Vec::new();
    emit(field, carrier, 0, &mut schema, &mut indices, c)?;
    let footer = encode_parquet_wire(
        &wire_struct(vec![
            (1, wire_i32(1)),
            (
                2,
                obj(vec![
                    ("kind", s("list")),
                    ("elementType", s("struct")),
                    ("items", Value::Array(schema)),
                ]),
            ),
            (3, wire_i64(0)),
            (
                4,
                obj(vec![
                    ("kind", s("list")),
                    ("elementType", s("struct")),
                    ("items", Value::Array(vec![])),
                ]),
            ),
        ]),
        c,
    )?;
    let mut bytes = b"PAR1".to_vec();
    bytes.extend(footer.iter().copied());
    bytes.extend((footer.len() as u32).to_le_bytes());
    bytes.extend(b"PAR1");
    Ok((bytes, indices))
}
fn residual(
    path: &str,
    value: &Value,
    reason: &str,
    outcome: &str,
    c: &mut Context<'_>,
) -> Result<Value, EngineError> {
    Ok(obj(vec![
        ("path", s(path)),
        ("value", copy_json(value, c)?),
        ("reason", s(reason)),
        ("outcome", s(outcome)),
        ("recovery", s(RECOVERY)),
    ]))
}
fn canonical(v: &Value, c: &mut Context<'_>) -> Result<Value, EngineError> {
    canonical_at(v, c, 0)
}
fn canonical_at(v: &Value, c: &mut Context<'_>, depth: usize) -> Result<Value, EngineError> {
    if depth > c.limits().max_depth {
        return Err(
            err("LIMIT", "Receipt comparison depth exceeded", "/receipt").with_control_failure(),
        );
    }
    c.charge_work(1, k("/receipt"))?;
    Ok(match v {
        Value::Array(a) => Value::Array(
            a.iter()
                .map(|x| canonical_at(x, c, depth + 1))
                .collect::<Result<_, _>>()?,
        ),
        Value::Object(m) => {
            c.charge_work(m.len(), k("/receipt"))?;
            let mut o = Vec::with_capacity(m.len());
            for (name, value) in m {
                c.charge_work(name.len().saturating_add(1), k("/receipt"))?;
                o.push((name.clone(), canonical_at(value, c, depth + 1)?));
            }
            o.sort_by(|a, b| a.0.cmp(&b.0));
            Value::Object(o)
        }
        _ => copy_json(v, c)?,
    })
}
fn path_key(base: &Utf16, key: &Utf16, c: &mut Context<'_>) -> Result<Utf16, EngineError> {
    let escaped = key.len().saturating_add(
        key.units()
            .iter()
            .filter(|u| **u == 0x2f || **u == 0x7e)
            .count(),
    );
    c.charge_text(
        base.len().saturating_add(1).saturating_add(escaped),
        base.clone(),
    )?;
    let mut units = base.units().to_vec();
    units.push(0x2f);
    for unit in key.units() {
        match *unit {
            0x7e => units.extend_from_slice(&[0x7e, 0x30]),
            0x2f => units.extend_from_slice(&[0x7e, 0x31]),
            unit => units.push(unit),
        }
    }
    Ok(Utf16::new(units))
}
fn residual_exact(
    path: Utf16,
    value: &Value,
    reason: &str,
    outcome: &str,
    c: &mut Context<'_>,
) -> Result<Value, EngineError> {
    Ok(obj(vec![
        ("path", Value::String(path)),
        ("value", copy_json(value, c)?),
        ("reason", s(reason)),
        ("outcome", s(outcome)),
        ("recovery", s(RECOVERY)),
    ]))
}
fn locate<'a>(
    source: &'a Value,
    module: &str,
    element: &str,
    c: &mut Context<'_>,
) -> Result<(usize, usize, &'a Value, String), EngineError> {
    for (i, m) in arr(get(source, "modules")).iter().enumerate() {
        c.charge_work(1, k("/modules"))?;
        if text(get(m, "id")).as_deref() == Some(module) {
            for (j, e) in arr(get(m, "elements")).iter().enumerate() {
                c.charge_work(1, k("/modules"))?;
                if text(get(e, "id")).as_deref() == Some(element) {
                    return Ok((i, j, e, format!("/modules/{i}/elements/{j}")));
                }
            }
        }
    }
    Err(err(
        "CARDINALITY_PARQUET_REFERENCE",
        "Field identity is absent",
        "/author/identity",
    ))
}
fn lower(
    author_input: &Value,
    request_input: &Value,
    c: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(c)?;
    let (result_schema, request_schema) = schemas(&rt, c)?;
    let request = copy_json(request_input, c)?;
    if let Some(d) = request_schema.validate(&request, c)?.first() {
        return Err(EngineError::new(
            "CARDINALITY_PARQUET_REQUEST",
            d.instance_path.clone(),
            d.message.clone(),
        ));
    }
    let author_input = copy_json(author_input, c)?;
    let current = get(&author_input, "target").ok_or_else(|| {
        err(
            "CARDINALITY_PARQUET_AUTHOR",
            "Author target required",
            "/author/target",
        )
    })?;
    let mut caps = NoCaps;
    let author = crate::cardinality::verify_core_cardinality_declaration(
        &author_input,
        current,
        &rt.engine,
        &rt.registry,
        &mut caps,
        c,
    )?;
    let source = copy_json(
        get(&author, "target").ok_or_else(|| {
            err(
                "CARDINALITY_PARQUET_AUTHOR",
                "Author target missing",
                "/author/target",
            )
        })?,
        c,
    )?;
    if text(get(&source, "umf")).as_deref() != Some("0.10.0") {
        return Err(err(
            "CARDINALITY_PARQUET_VERSION",
            "This binding requires core 0.10.0",
            "/author/target/umf",
        ));
    }
    let identity = get(&author, "identity").unwrap();
    let module = text(get(identity, "module")).ok_or_else(|| {
        err(
            "CARDINALITY_PARQUET_AUTHOR",
            "Module identity required",
            "/author/identity/module",
        )
    })?;
    let element = text(get(identity, "element")).ok_or_else(|| {
        err(
            "CARDINALITY_PARQUET_AUTHOR",
            "Element identity required",
            "/author/identity/element",
        )
    })?;
    let (mi, _ei, root, path) = locate(&source, &module, &element, c)?;
    if text(get(root, "kind")).as_deref() != Some("field") {
        return Err(err(
            "CARDINALITY_PARQUET_AUTHOR",
            "Cardinality must identify a Field",
            "/author/identity",
        ));
    }
    let id = text(get(&request, "id")).unwrap();
    let record = text(get(&request, "recordName")).unwrap();
    let field = text(get(&request, "fieldName")).unwrap();
    let carrier = get(&request, "nativeType").unwrap();
    let (bytes, indices) = make_file(&record, &field, carrier, c)?;
    let target = import_parquet_schema(&bytes, &k(&id), &rt.engine, &rt.registry, &mut caps, c)?;
    let mut nodes = Vec::new();
    for index in &indices {
        nodes.push(
            crate::parquet_cardinality_classification::inspect_shape_node(
                &target,
                *index,
                &rt.engine,
                &rt.registry,
                &mut caps,
                c,
            )?,
        )
    }
    let mut mapping = Vec::new();
    let mut residuals = Vec::new();
    let cardinality = text(get(root, "cardinality")).unwrap_or_else(|| "unspecified".into());
    let mut visited = std::collections::HashSet::new();
    let mut source_fields = std::collections::HashSet::new();
    let mut modules = std::collections::HashSet::new();
    fn match_field(
        source: &Value,
        field: &Value,
        element_id: &str,
        index: usize,
        nodes: &[Value],
        mapping: &mut Vec<Value>,
        residuals: &mut Vec<Value>,
        visited: &mut std::collections::HashSet<String>,
        source_fields: &mut std::collections::HashSet<String>,
        modules: &mut std::collections::HashSet<usize>,
        request: &Value,
        root_path: &str,
        depth: usize,
        c: &mut Context<'_>,
    ) -> Result<(), EngineError> {
        if depth > c.limits().max_depth {
            return Err(err(
                "LIMIT",
                "Authored item recursion depth exceeded",
                "/author/target",
            )
            .with_control_failure());
        }
        c.charge_work(1, k("/author/target"))?;
        let (mi, _ei, e, p) = locate(
            source,
            text(get(field, "module")).as_deref().unwrap_or(""),
            element_id,
            c,
        )?;
        let visited_key = format!("{mi}:{element_id}:{index}");
        if !visited.insert(visited_key) {
            return Ok(());
        }
        source_fields.insert(p.clone());
        modules.insert(mi);
        let node = nodes
            .iter()
            .find(|n| {
                get(n, "index").and_then(|x| {
                    if let Value::Number(v) = x {
                        Some(*v as usize)
                    } else {
                        None
                    }
                }) == Some(index)
            })
            .ok_or_else(|| {
                err(
                    "CARDINALITY_PARQUET_NATIVE",
                    "Shape node unavailable",
                    "/request/nativeType",
                )
            })?;
        let shape = text(get(node, "shape")).unwrap_or_else(|| "unspecified".into());
        mapping.push(obj(vec![
            ("idealPath", s(&p)),
            ("nativeIndex", Value::Number(index as f64)),
        ]));
        for r in arr(get(node, "residuals")) {
            let reason = text(get(r, "reason"))
                .unwrap_or_else(|| "Native shape has an explicit residual".into());
            residuals.push(residual(&p, r, &reason, "approximated", c)?)
        }
        let ideal = text(get(e, "cardinality")).unwrap_or_else(|| "unspecified".into());
        if ideal == "unspecified" {
            residuals.push(residual(&format!("{p}/cardinality"),&s(&ideal),"No ideal shape is asserted; the selected native type remains an explicit refinement","unknown",c)?)
        } else if ideal != shape {
            residuals.push(residual(
                &format!("{p}/cardinality"),
                get(e, "cardinality").unwrap(),
                "Native type does not express the selected present non-null shape",
                "not-expressible",
                c,
            )?)
        }
        let is_root = p == root_path;
        let requested_name = text(get(request, "fieldName")).unwrap_or_default();
        if is_root && text(get(e, "name")).is_some_and(|x| x != requested_name) {
            residuals.push(residual(
                &format!("{p}/name"),
                get(e, "name").unwrap(),
                "Selected native field name differs from the ideal name",
                "not-expressible",
                c,
            )?)
        } else if !is_root && get(e, "name").is_some() {
            residuals.push(residual(
                &format!("{p}/name"),
                get(e, "name").unwrap(),
                "Item/value Field names have no separate Parquet field-name position",
                "unknown",
                c,
            )?);
        }
        if let Some(n) = get(e, "nullability") {
            let av = text(get(request, "availability")).unwrap_or_default();
            let nullable = matches!(get(node, "nativeNullable"), Some(Value::Bool(true)));
            let stated = text(Some(n));
            if av != "definition-level"
                || !matches!(stated.as_deref(), Some("required" | "absent-allowed"))
            {
                residuals.push(residual(&format!("{p}/nullability"),n,"Explicit definition-level carrier must be selected; writer-input/default/unspecified availability is not inferred","unknown",c)?)
            } else if nullable != (stated.as_deref() == Some("absent-allowed")) {
                residuals.push(residual(&format!("{p}/nullability"),n,"Native definition-level availability differs from independently stated availability","not-expressible",c)?)
            }
        }
        if let Some(st) = get(e, "scalarType") {
            if text(Some(st)) != text(get(node, "scalarType")) {
                residuals.push(residual(
                    &format!("{p}/scalarType"),
                    st,
                    "Native scalar family does not express the stated item/value family",
                    "not-expressible",
                    c,
                )?)
            }
        }
        if let Value::Object(fields) = e {
            for (key, value) in fields {
                if ![
                    "id",
                    "kind",
                    "name",
                    "scalarType",
                    "cardinality",
                    "itemType",
                    "nullability",
                ]
                .iter()
                .any(|known| key == &k(known))
                    && !(key == &k("extensions")
                        && matches!(value, Value::Object(m) if m.is_empty()))
                {
                    residuals.push(residual_exact(
                        path_key(&k(&p), key, c)?,
                        value,
                        "Field metadata is retained but not projected",
                        "unknown",
                        c,
                    )?);
                }
            }
        }
        if matches!(ideal.as_str(), "array" | "map") && ideal == shape {
            if let Some(item) = get(e, "itemType") {
                if let Value::Object(fields) = item {
                    for (key, value) in fields {
                        if key != &k("module") && key != &k("element") {
                            residuals.push(residual_exact(
                                path_key(&k(&format!("{p}/itemType")), key, c)?,
                                value,
                                "Unknown item-reference metadata is retained",
                                "unknown",
                                c,
                            )?);
                        }
                    }
                }
                let id = text(get(item, "element")).ok_or_else(|| {
                    err(
                        "CARDINALITY_PARQUET_REFERENCE",
                        "Item Field identity required",
                        "/author/target",
                    )
                })?;
                if let Some(ix) = get(node, "itemIndex").and_then(|x| {
                    if let Value::Number(n) = x {
                        Some(*n as usize)
                    } else {
                        None
                    }
                }) {
                    match_field(
                        source,
                        item,
                        &id,
                        ix,
                        nodes,
                        mapping,
                        residuals,
                        visited,
                        source_fields,
                        modules,
                        request,
                        root_path,
                        depth + 1,
                        c,
                    )?
                } else {
                    residuals.push(residual(
                    &format!("{p}/itemType"),
                    item,
                    "Item/value reference cannot be lowered through an incompatible native shape",
                    "not-expressible",
                    c,
                )?)
                }
            } else {
                residuals.push(residual(
                &format!("{p}/itemType"),
                &Value::Null,
                "Native items/values require a concrete schema while ideal member meaning is unspecified",
                "approximated",
                c,
            )?)
            }
        } else if let Some(item) = get(e, "itemType") {
            residuals.push(residual(
                &format!("{p}/itemType"),
                item,
                "Item/value reference cannot be lowered through an incompatible native shape",
                "not-expressible",
                c,
            )?);
        }
        Ok(())
    }
    let dummy = obj(vec![("module", s(&module))]);
    match_field(
        &source,
        &dummy,
        &element,
        1,
        &nodes,
        &mut mapping,
        &mut residuals,
        &mut visited,
        &mut source_fields,
        &mut modules,
        &request,
        &path,
        0,
        c,
    )?;
    if matches!(get(&request, "requireExactValues"), Some(Value::Bool(true))) {
        residuals.push(residual(&path, root, "Schema shape/family matching does not prove value-domain or codec exactness: binary32 narrows values and native MAP permits duplicate or non-string keys", "approximated", c)?);
    }
    if let Value::Object(fields) = &source {
        for (key, value) in fields {
            if !["umf", "id", "modules", "vocabularies"]
                .iter()
                .any(|known| key == &k(known))
            {
                residuals.push(residual_exact(
                    path_key(&Utf16::default(), key, c)?,
                    value,
                    "Document metadata is retained but not projected",
                    "unknown",
                    c,
                )?);
            }
        }
    }
    if matches!(
        get(&source, "vocabularies"),
        Some(Value::Object(v)) if !v.is_empty()
    ) {
        residuals.push(residual(
            "/vocabularies",
            get(&source, "vocabularies").unwrap(),
            "Native vocabulary meaning is not projected",
            "unknown",
            c,
        )?);
    }
    for (i, module_value) in arr(get(&source, "modules")).iter().enumerate() {
        if !modules.contains(&i) {
            residuals.push(residual(
                &format!("/modules/{i}"),
                module_value,
                "Other module is outside selected Field projection",
                "unknown",
                c,
            )?);
            continue;
        }
        if text(get(module_value, "namespace"))
            .as_deref()
            .unwrap_or("")
            != ""
        {
            residuals.push(residual(
                &format!("/modules/{i}/namespace"),
                get(module_value, "namespace").unwrap_or(&Value::Null),
                "Native root namespace does not represent this module namespace",
                "not-expressible",
                c,
            )?);
        }
        if let Value::Object(properties) = module_value {
            for (key, value) in properties {
                if !["id", "namespace", "elements"]
                    .iter()
                    .any(|known| key == &k(known))
                {
                    residuals.push(residual_exact(
                        path_key(&k(&format!("/modules/{i}")), key, c)?,
                        value,
                        "Module metadata is retained",
                        "unknown",
                        c,
                    )?);
                }
            }
        }
        for (j, element_value) in arr(get(module_value, "elements")).iter().enumerate() {
            let selected = source_fields.contains(&format!("/modules/{i}/elements/{j}"));
            if !selected {
                residuals.push(residual(
                    &format!("/modules/{i}/elements/{j}"),
                    element_value,
                    "Other element is outside selected Field projection",
                    "unknown",
                    c,
                )?);
            }
        }
    }
    let outcome = if residuals
        .iter()
        .any(|x| text(get(x, "outcome")).as_deref() == Some("not-expressible"))
    {
        "not-expressible"
    } else if residuals.is_empty() {
        "exact"
    } else if residuals
        .iter()
        .any(|x| text(get(x, "outcome")).as_deref() == Some("unknown"))
    {
        "unknown"
    } else {
        "approximated"
    };
    let blocked = text(get(&request, "mode")).as_deref() == Some("strict") && !residuals.is_empty();
    let mut out = vec![
        ("operation", s("project-cardinality-parquet")), ("version", s("1.0.0")),
        ("status", s(if blocked { "blocked" } else { "projected" })), ("source", source.clone()), ("author", author.clone()), ("request", request.clone()),
        ("binding", obj(vec![("id", s("umf.core.cardinality.parquet")), ("version", s("1.0.0")), ("nativeVersion", s("parquet-format@219e3f12a62f9476e830c21e26d030d231f7c017")), ("subset", s("Explicit nested native carriers for authored shape and item/value Fields; empty schema file, no row conversion, key uniqueness enforcement or implicit record lowering"))])),
        ("mapping", obj(vec![("origin", s("authored")), ("idealPath", s(&format!("{path}/cardinality"))), ("cardinality", s(&cardinality)), ("outcome", s(outcome)), ("items", Value::Array(mapping))])),
        ("residuals", Value::Array(residuals.clone()))
    ];
    if !blocked {
        out.push(("target", target));
    }
    out.push((
        "diagnostics",
        Value::Array(
            residuals
                .iter()
                .map(|r| {
                    obj(vec![
                        ("code", s("CARDINALITY_PARQUET_RESIDUAL")),
                        ("path", get(r, "path").unwrap().clone()),
                        ("message", get(r, "reason").unwrap().clone()),
                        ("severity", s(if blocked { "error" } else { "warning" })),
                    ])
                })
                .collect(),
        ),
    ));
    let result = obj(out);
    if let Some(d) = result_schema.validate_codegen_errors(&result, c)?.first() {
        return Err(err(
            "CARDINALITY_PARQUET_RESULT",
            d.message.to_utf8().unwrap_or_default(),
            "",
        ));
    }
    Ok(result)
}
pub fn project_cardinality_to_parquet(
    a: &Value,
    r: &Value,
    c: &mut Context<'_>,
) -> Result<Value, EngineError> {
    lower(a, r, c)
}
pub fn recover_cardinality_from_parquet(
    receipt: &Value,
    native_hex: &Value,
    c: &mut Context<'_>,
) -> Result<Value, EngineError> {
    if text(get(receipt, "status")).as_deref() != Some("projected") {
        return Err(err(
            "CARDINALITY_PARQUET_RECEIPT",
            "Complete projected receipt required",
            "/status",
        ));
    }
    let author = get(receipt, "author").ok_or_else(|| {
        err(
            "CARDINALITY_PARQUET_RECEIPT",
            "Author receipt required",
            "/author",
        )
    })?;
    let request = get(receipt, "request").ok_or_else(|| {
        err(
            "CARDINALITY_PARQUET_RECEIPT",
            "Request receipt required",
            "/request",
        )
    })?;
    let expected = lower(author, request, c)?;
    if canonical(receipt, c)? != canonical(&expected, c)? {
        return Err(err(
            "CARDINALITY_PARQUET_RECEIPT",
            "Receipt disagrees with retained author and request",
            "/receipt",
        ));
    }
    let hex = text(Some(native_hex)).ok_or_else(|| {
        err(
            "CARDINALITY_PARQUET_STALE",
            "nativeHex must be text",
            "/nativeHex",
        )
    })?;
    if hex.len() % 2 != 0 || hex.len() > 2_000_000 {
        return Err(err(
            "CARDINALITY_PARQUET_STALE",
            "nativeHex must be bounded even-length lowercase hexadecimal",
            "/nativeHex",
        ));
    }
    let mut supplied = Vec::with_capacity(hex.len() / 2);
    for pair in hex.as_bytes().chunks_exact(2) {
        c.charge_work(2, k("/nativeHex"))?;
        let nib = |b: u8| match b {
            b'0'..=b'9' => Some(b - b'0'),
            b'a'..=b'f' => Some(b - b'a' + 10),
            _ => None,
        };
        let h = nib(pair[0]).ok_or_else(|| {
            err(
                "CARDINALITY_PARQUET_STALE",
                "nativeHex must be lowercase hexadecimal",
                "/nativeHex",
            )
        })?;
        let l = nib(pair[1]).ok_or_else(|| {
            err(
                "CARDINALITY_PARQUET_STALE",
                "nativeHex must be lowercase hexadecimal",
                "/nativeHex",
            )
        })?;
        supplied.push(h << 4 | l)
    }
    let rt = runtime(c)?;
    let bytes = export_parquet_capture(
        get(receipt, "target").ok_or_else(|| {
            err(
                "CARDINALITY_PARQUET_RECEIPT",
                "Target receipt required",
                "/target",
            )
        })?,
        &rt.engine,
        &rt.registry,
        &mut NoCaps,
        c,
    )?;
    if supplied != bytes {
        return Err(err(
            "CARDINALITY_PARQUET_STALE",
            "Native bytes changed",
            "/nativeHex",
        ));
    }
    copy_json(
        get(receipt, "source").ok_or_else(|| {
            err(
                "CARDINALITY_PARQUET_RECEIPT",
                "Source receipt required",
                "/source",
            )
        })?,
        c,
    )
}

fn nullability_schemas(
    rt: &Rt,
    c: &mut Context<'_>,
) -> Result<(CompiledSchema, CompiledSchema), EngineError> {
    let schema = parse(NULLABILITY_RESULT, c)?;
    let mut resources = rt.engine.schema_resources_with_context(c)?;
    resources
        .entries
        .push((k("urn:umf:core:0.10.0"), parse(CORE, c)?));
    resources.entries.push((
        k("urn:umf:core:nullability-operation:5.0.0"),
        parse(
            include_str!("../../../spec/core/nullability-operation-v5.schema.json"),
            c,
        )?,
    ));
    let result = CompiledSchema::compile(&schema, &resources, c)?;
    let request = get(
        get(&schema, "properties").unwrap_or(&Value::Null),
        "request",
    )
    .unwrap();
    Ok((result, CompiledSchema::compile(request, &resources, c)?))
}

pub fn project_nullability_to_parquet(
    author_input: &Value,
    request_input: &Value,
    c: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(c)?;
    let (result_schema, request_schema) = nullability_schemas(&rt, c)?;
    let request = copy_json(request_input, c)?;
    if let Some(d) = request_schema.validate(&request, c)?.first() {
        return Err(EngineError::new(
            "NULLABILITY_PARQUET_REQUEST",
            d.instance_path.clone(),
            d.message.clone(),
        ));
    }
    let input = copy_json(author_input, c)?;
    let current = get(&input, "target").ok_or_else(|| {
        err(
            "NULLABILITY_PARQUET_AUTHOR",
            "Author target required",
            "/author/target",
        )
    })?;
    let mut caps = NoCaps;
    let author = crate::nullability::verify_core_nullability_declaration(
        &input,
        current,
        &rt.engine,
        &rt.registry,
        &mut caps,
        c,
    )?;
    let source = copy_json(
        get(&author, "target").ok_or_else(|| {
            err(
                "NULLABILITY_PARQUET_AUTHOR",
                "Author source missing",
                "/author/target",
            )
        })?,
        c,
    )?;
    let identity = get(&author, "identity").ok_or_else(|| {
        err(
            "NULLABILITY_PARQUET_AUTHOR",
            "Identity missing",
            "/author/identity",
        )
    })?;
    let module = text(get(identity, "module")).ok_or_else(|| {
        err(
            "NULLABILITY_PARQUET_AUTHOR",
            "Module identity required",
            "/author/identity/module",
        )
    })?;
    let element_id = text(get(identity, "element")).ok_or_else(|| {
        err(
            "NULLABILITY_PARQUET_AUTHOR",
            "Element identity required",
            "/author/identity/element",
        )
    })?;
    let (module_index, element_index, element, path) = locate(&source, &module, &element_id, c)?;
    let provenance = get(&author, "provenance").ok_or_else(|| {
        err(
            "NULLABILITY_PARQUET_AUTHOR",
            "Provenance missing",
            "/author/provenance",
        )
    })?;
    let nullability = text(get(provenance, "nullability")).unwrap_or_else(|| "unspecified".into());
    let scope = text(get(&request, "scope")).unwrap_or_default();
    let carrier = text(get(&request, "carrier")).unwrap_or_default();
    let encoding = if nullability == "required"
        && scope == "row-leaf-value"
        && carrier == "definition-level"
    {
        "required"
    } else {
        "optional"
    };
    let mut residuals = Vec::new();
    let mut basis = if nullability == "unspecified" {
        "no-authored-requirement"
    } else {
        "authored-requirement"
    };
    if let Some(name) = get(element, "name") {
        if text(Some(name)) != text(get(&request, "fieldName")) {
            residuals.push(residual(
                &format!("{path}/name"),
                name,
                "Explicit native column name differs from ideal name",
                "not-expressible",
                c,
            )?);
        }
    }
    if let Value::Object(fields) = &source {
        for (key, value) in fields {
            if !["umf", "id", "modules", "vocabularies"]
                .iter()
                .any(|known| key == &k(known))
            {
                residuals.push(residual_exact(
                    path_key(&Utf16::default(), key, c)?,
                    value,
                    "Document metadata is retained but not projected",
                    "unknown",
                    c,
                )?);
            }
        }
    }
    if matches!(get(&source, "vocabularies"), Some(Value::Object(values)) if !values.is_empty()) {
        residuals.push(residual(
            "/vocabularies",
            get(&source, "vocabularies").unwrap(),
            "Native vocabulary semantics are not projected",
            "unknown",
            c,
        )?);
    }
    for (i, module_value) in arr(get(&source, "modules")).iter().enumerate() {
        if i != module_index {
            residuals.push(residual(
                &format!("/modules/{i}"),
                module_value,
                "Other module is outside selected Field projection",
                "unknown",
                c,
            )?);
            continue;
        }
        if !text(get(module_value, "namespace"))
            .unwrap_or_default()
            .is_empty()
        {
            residuals.push(residual(
                &format!("/modules/{i}/namespace"),
                get(module_value, "namespace").unwrap_or(&Value::Null),
                "Parquet root name does not preserve ideal namespace",
                "unknown",
                c,
            )?);
        }
        if let Value::Object(properties) = module_value {
            for (key, value) in properties {
                if !["id", "namespace", "elements"]
                    .iter()
                    .any(|known| key == &k(known))
                {
                    residuals.push(residual_exact(
                        path_key(&Utf16::from(format!("/modules/{i}")), key, c)?,
                        value,
                        "Module metadata is not projected",
                        "unknown",
                        c,
                    )?);
                }
            }
        }
        for (j, element_value) in arr(get(module_value, "elements")).iter().enumerate() {
            if j != element_index {
                residuals.push(residual(
                    &format!("/modules/{i}/elements/{j}"),
                    element_value,
                    "Other element is outside selected Field projection",
                    "unknown",
                    c,
                )?);
            }
        }
    }
    if let Value::Object(properties) = element {
        for (key, value) in properties {
            if !["id", "kind", "name", "scalarType", "nullability"]
                .iter()
                .any(|known| key == &k(known))
                && !(key == &k("extensions") && matches!(value, Value::Object(m) if m.is_empty()))
            {
                residuals.push(residual_exact(
                    path_key(&Utf16::from(path.as_str()), key, c)?,
                    value,
                    "Field metadata is retained but not projected",
                    "unknown",
                    c,
                )?);
            }
        }
    }
    if nullability != "unspecified" {
        if scope != "row-leaf-value" {
            basis = "unprojected-requirement";
            residuals.push(residual(&format!("{path}/nullability"), get(provenance, "nullability").unwrap_or(&Value::Null), "This flat native schema implements row-leaf-value scope only; repeated entries and writer inputs require other bindings", "not-expressible", c)?);
        } else if carrier != "definition-level" {
            basis = "unprojected-requirement";
            residuals.push(residual(&format!("{path}/nullability"), get(provenance, "nullability").unwrap_or(&Value::Null), "Explicit physical definition-level carrier required; no Arrow-mask or input-omission equivalence is inferred", "unknown", c)?);
        }
    }
    let native_type = get(&request, "nativeType").ok_or_else(|| {
        err(
            "NULLABILITY_PARQUET_REQUEST",
            "Native type is required",
            "/request/nativeType",
        )
    })?;
    let carrier_value = obj(vec![
        ("kind", s("scalar")),
        ("nativeType", native_type.clone()),
        ("nullable", Value::Bool(encoding == "optional")),
    ]);
    let (bytes, _) = make_file(
        &text(get(&request, "recordName")).ok_or_else(|| {
            err(
                "NULLABILITY_PARQUET_REQUEST",
                "Record name required",
                "/request/recordName",
            )
        })?,
        &text(get(&request, "fieldName")).ok_or_else(|| {
            err(
                "NULLABILITY_PARQUET_REQUEST",
                "Field name required",
                "/request/fieldName",
            )
        })?,
        &carrier_value,
        c,
    )?;
    let id = text(get(&request, "id"))
        .ok_or_else(|| err("NULLABILITY_PARQUET_REQUEST", "Id required", "/request/id"))?;
    let target = import_parquet_schema(&bytes, &k(&id), &rt.engine, &rt.registry, &mut caps, c)?;
    let observed = crate::parquet_cardinality_classification::inspect_shape_node(
        &target,
        1,
        &rt.engine,
        &rt.registry,
        &mut caps,
        c,
    )?;
    if let Some(scalar_type) = get(element, "scalarType") {
        if text(Some(scalar_type)) != text(get(&observed, "scalarType")) {
            residuals.push(residual(
                &format!("{path}/scalarType"),
                scalar_type,
                "Explicit native type does not establish the stated scalar family",
                "not-expressible",
                c,
            )?);
        }
    }
    let outcome = if residuals
        .iter()
        .any(|r| text(get(r, "outcome")).as_deref() == Some("not-expressible"))
    {
        "not-expressible"
    } else if residuals.is_empty() {
        "exact"
    } else {
        "unknown"
    };
    let blocked = text(get(&request, "mode")).as_deref() == Some("strict") && !residuals.is_empty();
    let mut result = vec![
        ("operation", s("project-nullability-parquet")), ("version", s("1.0.0")), ("status", s(if blocked { "blocked" } else { "projected" })),
        ("source", source.clone()), ("author", author.clone()), ("request", request.clone()),
        ("binding", obj(vec![("id", s("umf.core.nullability.parquet")), ("version", s("1.0.0")), ("nativeVersion", s("parquet-format@219e3f12a62f9476e830c21e26d030d231f7c017")), ("subset", s("Single authored Field with explicit carrier and required/optional leaf in an empty file; no row conversion, writer-input or logical equivalence"))])),
        ("mapping", obj(vec![("origin", s("authored")), ("nullability", s(&nullability)), ("encoding", s(encoding)), ("basis", s(basis)), ("scope", s(&scope)), ("carrier", s(&carrier)), ("idealPath", s(&format!("{path}/nullability"))), ("nativePath", s("/schema/1/repetition_type")), ("outcome", s(outcome))])),
        ("residuals", Value::Array(residuals.clone()))
    ];
    if !blocked {
        result.push(("target", target));
    }
    result.push((
        "diagnostics",
        Value::Array(
            residuals
                .iter()
                .map(|r| {
                    obj(vec![
                        ("code", s("NULLABILITY_MEANING_NOT_PROJECTED")),
                        ("path", get(r, "path").unwrap().clone()),
                        ("message", get(r, "reason").unwrap().clone()),
                        ("severity", s(if blocked { "error" } else { "warning" })),
                    ])
                })
                .collect(),
        ),
    ));
    let output = obj(result);
    if let Some(d) = result_schema.validate_codegen_errors(&output, c)?.first() {
        return Err(err(
            "NULLABILITY_PARQUET_RESULT",
            d.message.to_utf8().unwrap_or_default(),
            "",
        ));
    }
    Ok(output)
}

pub fn recover_nullability_from_parquet(
    receipt: &Value,
    native_hex: &Value,
    c: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(c)?;
    let (result_schema, _) = nullability_schemas(&rt, c)?;
    if let Some(d) = result_schema.validate(receipt, c)?.first() {
        return Err(EngineError::new(
            "NULLABILITY_PARQUET_RECEIPT",
            d.instance_path.clone(),
            d.message.clone(),
        ));
    }
    if text(get(receipt, "status")).as_deref() != Some("projected") {
        return Err(err(
            "NULLABILITY_PARQUET_RECEIPT",
            "Expected projected receipt",
            "/status",
        ));
    }
    let author = get(receipt, "author").ok_or_else(|| {
        err(
            "NULLABILITY_PARQUET_RECEIPT",
            "Author receipt required",
            "/author",
        )
    })?;
    let request = get(receipt, "request").ok_or_else(|| {
        err(
            "NULLABILITY_PARQUET_RECEIPT",
            "Request receipt required",
            "/request",
        )
    })?;
    let expected = project_nullability_to_parquet(author, request, c)?;
    if canonical(&expected, c)? != canonical(receipt, c)? {
        return Err(err(
            "NULLABILITY_PARQUET_RECEIPT",
            "Receipt does not match retained source and binding",
            "/receipt",
        ));
    }
    let hex = text(Some(native_hex)).ok_or_else(|| {
        err(
            "NULLABILITY_PARQUET_STALE",
            "nativeHex must be text",
            "/nativeHex",
        )
    })?;
    if hex.len() % 2 != 0 || hex.len() > 2_000_000 {
        return Err(err(
            "NULLABILITY_PARQUET_STALE",
            "nativeHex must be bounded even-length lowercase hexadecimal",
            "/nativeHex",
        ));
    }
    let mut supplied = Vec::with_capacity(hex.len() / 2);
    for pair in hex.as_bytes().chunks_exact(2) {
        c.charge_work(2, k("/nativeHex"))?;
        let nib = |b: u8| match b {
            b'0'..=b'9' => Some(b - b'0'),
            b'a'..=b'f' => Some(b - b'a' + 10),
            _ => None,
        };
        let h = nib(pair[0]).ok_or_else(|| {
            err(
                "NULLABILITY_PARQUET_STALE",
                "nativeHex must be lowercase hexadecimal",
                "/nativeHex",
            )
        })?;
        let l = nib(pair[1]).ok_or_else(|| {
            err(
                "NULLABILITY_PARQUET_STALE",
                "nativeHex must be lowercase hexadecimal",
                "/nativeHex",
            )
        })?;
        supplied.push(h << 4 | l);
    }
    let rt = runtime(c)?;
    let bytes = export_parquet_capture(
        get(receipt, "target").ok_or_else(|| {
            err(
                "NULLABILITY_PARQUET_RECEIPT",
                "Target receipt required",
                "/target",
            )
        })?,
        &rt.engine,
        &rt.registry,
        &mut NoCaps,
        c,
    )?;
    if supplied != bytes {
        return Err(err(
            "NULLABILITY_PARQUET_STALE",
            "Native target changed; retained report cannot assert recovery",
            "/nativeHex",
        ));
    }
    copy_json(
        get(receipt, "source").ok_or_else(|| {
            err(
                "NULLABILITY_PARQUET_RECEIPT",
                "Source receipt required",
                "/source",
            )
        })?,
        c,
    )
}
const FACET_RESULT: &str = include_str!("../../../spec/core/facets-parquet-projection.schema.json");
const FACET_AUTHOR: &str = include_str!("../../../spec/core/facet-operation-v3.schema.json");
const KIND_AUTHOR: &str = include_str!("../../../spec/core/kind-operation-v6.schema.json");
const FACET_RECOVERY: &str =
    "Recover source meaning with retained projection receipt; native-only import does not recover author intent";

fn facet_loss(
    path: &str,
    value: &Value,
    reason: &str,
    outcome: &str,
    c: &mut Context<'_>,
) -> Result<Value, EngineError> {
    Ok(obj(vec![
        ("path", s(path)),
        ("value", copy_json(value, c)?),
        ("reason", s(reason)),
        ("outcome", s(outcome)),
        ("recovery", s(FACET_RECOVERY)),
    ]))
}

fn facet_loss_exact(
    path: Utf16,
    value: &Value,
    reason: &str,
    outcome: &str,
    c: &mut Context<'_>,
) -> Result<Value, EngineError> {
    Ok(obj(vec![
        ("path", Value::String(path)),
        ("value", copy_json(value, c)?),
        ("reason", s(reason)),
        ("outcome", s(outcome)),
        ("recovery", s(FACET_RECOVERY)),
    ]))
}

fn facet_wire_file(
    request: &Value,
    source_facets: Option<&Value>,
    c: &mut Context<'_>,
) -> Result<Vec<u8>, EngineError> {
    let record = text(get(request, "recordName")).unwrap_or_default();
    let field = text(get(request, "fieldName")).unwrap_or_default();
    let nullable = matches!(get(request, "nullable"), Some(Value::Bool(true)));
    let carrier = get(request, "carrier").ok_or_else(|| {
        err(
            "PARQUET_FACET_CARRIER",
            "Carrier required",
            "/request/carrier",
        )
    })?;
    let kind = text(get(carrier, "kind")).unwrap_or_default();
    let mut leaf = vec![
        (3, wire_i32(if nullable { 1 } else { 0 })),
        (4, wire_binary(&k(&field), c)?),
    ];
    if let Some(Value::Number(id)) = get(request, "fieldId") {
        if !id.is_finite() || id.fract() != 0.0 || *id < i32::MIN as f64 || *id > i32::MAX as f64 {
            return Err(err(
                "PARQUET_FACET_CARRIER",
                "Field ID must be int32",
                "/request/fieldId",
            ));
        }
        leaf.push((9, wire_i32(*id as i32)));
    }
    match kind.as_str() {
        "primitive" => {
            let (physical, converted) =
                scalar(&text(get(carrier, "nativeType")).unwrap_or_default())?;
            leaf.push((1, wire_i32(physical)));
            if let Some(value) = converted {
                leaf.push((6, wire_i32(value)));
            }
        }
        "integer" => {
            let bits = get(carrier, "bits")
                .and_then(|x| {
                    if let Value::Number(n) = x {
                        Some(*n as i32)
                    } else {
                        None
                    }
                })
                .unwrap_or(0);
            let signed = matches!(get(carrier, "signed"), Some(Value::Bool(true)));
            if ![8, 16, 32, 64].contains(&bits) {
                return Err(err(
                    "PARQUET_FACET_CARRIER",
                    "Integer width must be 8, 16, 32 or 64",
                    "/request/carrier/bits",
                ));
            }
            leaf.push((1, wire_i32(if bits == 64 { 2 } else { 1 })));
            leaf.push((
                6,
                wire_i32(
                    (if signed { 15 } else { 11 })
                        + [8, 16, 32, 64].iter().position(|x| *x == bits).unwrap() as i32,
                ),
            ));
            let int_type = wire_struct(vec![
                (
                    1,
                    obj(vec![("kind", s("i8")), ("value", s(&bits.to_string()))]),
                ),
                (
                    2,
                    obj(vec![("kind", s("bool")), ("value", Value::Bool(signed))]),
                ),
            ]);
            leaf.push((10, wire_struct(vec![(10, int_type)])));
        }
        "fixed" => {
            let bytes = get(carrier, "bytes")
                .and_then(|x| {
                    if let Value::Number(n) = x {
                        Some(*n)
                    } else {
                        None
                    }
                })
                .unwrap_or(0.0);
            if !bytes.is_finite() || bytes.fract() != 0.0 || bytes < 1.0 || bytes > 4096.0 {
                return Err(err(
                    "PARQUET_FACET_CARRIER",
                    "Fixed bytes must be 1..4096",
                    "/request/carrier/bytes",
                ));
            }
            leaf.push((1, wire_i32(7)));
            leaf.push((2, wire_i32(bytes as i32)));
        }
        "decimal" => {
            let physical_name = text(get(carrier, "carrier")).unwrap_or_default();
            let precision = get(carrier, "precision")
                .and_then(|x| {
                    if let Value::Number(n) = x {
                        Some(*n)
                    } else {
                        None
                    }
                })
                .unwrap_or(0.0);
            let scale_value = get(carrier, "scale")
                .and_then(|x| {
                    if let Value::Number(n) = x {
                        Some(*n)
                    } else {
                        None
                    }
                })
                .unwrap_or(-1.0);
            if !precision.is_finite()
                || precision.fract() != 0.0
                || precision < 1.0
                || precision > i32::MAX as f64
                || !scale_value.is_finite()
                || scale_value.fract() != 0.0
                || scale_value < 0.0
                || scale_value > precision
            {
                return Err(err(
                    "PARQUET_FACET_CARRIER",
                    "Invalid decimal precision/scale",
                    "/request/carrier",
                ));
            }
            let (physical, bytes) = match physical_name.as_str() {
                "int32" => (1, None),
                "int64" => (2, None),
                "bytes" => (6, None),
                "fixed" => {
                    let n = get(carrier, "bytes")
                        .and_then(|x| {
                            if let Value::Number(n) = x {
                                Some(*n)
                            } else {
                                None
                            }
                        })
                        .ok_or_else(|| {
                            err(
                                "PARQUET_FACET_CARRIER",
                                "Fixed decimal requires byte count",
                                "/request/carrier/bytes",
                            )
                        })?;
                    if !n.is_finite() || n.fract() != 0. || n < 1. || n > 4096. {
                        return Err(err(
                            "PARQUET_FACET_CARRIER",
                            "Fixed decimal bytes must be 1..4096",
                            "/request/carrier/bytes",
                        ));
                    }
                    let bytes = n as usize;
                    let maximum = (num_bigint::BigUint::from(1u8) << (bytes * 8 - 1)) - 1u8;
                    let maximum_decimal_digits = maximum.to_str_radix(10).len().saturating_sub(1);
                    c.charge_work(maximum.to_str_radix(10).len(), k("/request/carrier/bytes"))?;
                    if precision as usize > maximum_decimal_digits {
                        return Err(err(
                            "PARQUET_FACET_CARRIER",
                            "Decimal precision exceeds fixed-byte capacity",
                            "/request/carrier/precision",
                        ));
                    }
                    (7, Some(n as i32))
                }
                _ => {
                    return Err(err(
                        "PARQUET_FACET_CARRIER",
                        "Unknown decimal carrier",
                        "/request/carrier/carrier",
                    ))
                }
            };
            if (physical == 1 && precision > 9.0) || (physical == 2 && precision > 18.0) {
                return Err(err(
                    "PARQUET_FACET_CARRIER",
                    "Decimal precision exceeds physical integer capacity",
                    "/request/carrier/precision",
                ));
            }
            leaf.push((1, wire_i32(physical)));
            if let Some(n) = bytes {
                leaf.push((2, wire_i32(n)));
            }
            leaf.push((6, wire_i32(5)));
            leaf.push((7, wire_i32(scale_value as i32)));
            leaf.push((8, wire_i32(precision as i32)));
            leaf.push((
                10,
                wire_struct(vec![(
                    5,
                    wire_struct(vec![
                        (1, wire_i32(scale_value as i32)),
                        (2, wire_i32(precision as i32)),
                    ]),
                )]),
            ));
        }
        _ => {
            return Err(err(
                "PARQUET_FACET_CARRIER",
                "Unknown carrier kind",
                "/request/carrier/kind",
            ))
        }
    }
    let mut footer = vec![
        (1, wire_i32(1)),
        (
            2,
            obj(vec![
                ("kind", s("list")),
                ("elementType", s("struct")),
                (
                    "items",
                    Value::Array(vec![
                        wire_struct(vec![(4, wire_binary(&k(&record), c)?), (5, wire_i32(1))]),
                        wire_struct(leaf),
                    ]),
                ),
            ]),
        ),
        (3, wire_i64(0)),
        (
            4,
            obj(vec![
                ("kind", s("list")),
                ("elementType", s("struct")),
                ("items", Value::Array(vec![])),
            ]),
        ),
    ];
    if let Some(facets) = source_facets {
        let json = crate::serialization::stringify_compact_metered(facets, c)?
            .to_utf8()
            .map_err(|_| {
                err(
                    "PARQUET_FACET_CARRIER",
                    "Facet metadata must be Unicode scalar text",
                    "/request",
                )
            })?;
        footer.push((
            5,
            obj(vec![
                ("kind", s("list")),
                ("elementType", s("struct")),
                (
                    "items",
                    Value::Array(vec![wire_struct(vec![
                        (1, wire_binary(&k("umf.facets"), c)?),
                        (2, wire_binary(&k(&json), c)?),
                    ])]),
                ),
            ]),
        ));
    }
    let bytes = encode_parquet_wire(&wire_struct(footer), c)?;
    let mut out = b"PAR1".to_vec();
    out.extend(bytes.iter().copied());
    out.extend((bytes.len() as u32).to_le_bytes());
    out.extend(b"PAR1");
    Ok(out)
}

pub fn project_facets_to_parquet(
    author_input: &Value,
    request_input: &Value,
    c: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(c)?;
    let schema = parse(FACET_RESULT, c)?;
    let mut resources = rt.engine.schema_resources_with_context(c)?;
    resources.entries.push((
        k("urn:umf:core:semantic-type-reference:1.0.0"),
        parse(
            include_str!("../../../spec/core/semantic-type-reference.schema.json"),
            c,
        )?,
    ));
    resources
        .entries
        .push((k("urn:umf:core:0.10.0"), parse(CORE, c)?));
    resources.entries.push((
        k("urn:umf:core:facet-operation:3.0.0"),
        parse(FACET_AUTHOR, c)?,
    ));
    resources.entries.push((
        k("urn:umf:core:kind-operation:6.0.0"),
        parse(KIND_AUTHOR, c)?,
    ));
    let result_schema = CompiledSchema::compile(&schema, &resources, c)?;
    let req = get(
        get(&schema, "properties").unwrap_or(&Value::Null),
        "request",
    )
    .unwrap();
    let mut req_schema = copy_json(req, c)?;
    if let (Value::Object(fields), Some(defs)) = (&mut req_schema, get(&schema, "$defs")) {
        fields.push((k("$defs"), copy_json(defs, c)?));
    }
    let req_schema = CompiledSchema::compile(&req_schema, &resources, c)?;
    let request = copy_json(request_input, c)?;
    if let Some(d) = req_schema.validate(&request, c)?.first() {
        return Err(EngineError::new(
            "FACETS_PARQUET_REQUEST",
            d.instance_path.clone(),
            d.message.clone(),
        ));
    }
    let raw = copy_json(author_input, c)?;
    let current = get(&raw, "target").ok_or_else(|| {
        err(
            "FACETS_PARQUET_AUTHOR",
            "Author target required",
            "/author/target",
        )
    })?;
    let mut caps = NoCaps;
    let author = if text(get(&raw, "operation")).as_deref() == Some("declare-core-facets") {
        crate::facets::verify_core_facet_declaration(
            &raw,
            current,
            &rt.engine,
            &rt.registry,
            &mut caps,
            c,
        )?
    } else {
        crate::core_kind::verify_core_kind_declaration(
            &raw,
            current,
            &rt.engine,
            &rt.registry,
            &mut caps,
            c,
        )?
    };
    let source = copy_json(
        get(&author, "target").ok_or_else(|| {
            err(
                "FACETS_PARQUET_AUTHOR",
                "Author target missing",
                "/author/target",
            )
        })?,
        c,
    )?;
    if text(get(&source, "umf")).as_deref() != Some("0.10.0") {
        return Err(err(
            "FACETS_PARQUET_VERSION",
            "Current core 0.10.0 declaration required",
            "/author/target/umf",
        ));
    }
    let identity = get(&author, "identity").unwrap();
    let module = text(get(identity, "module")).unwrap_or_default();
    let element = text(get(identity, "element")).unwrap_or_default();
    let (mi, ei, root, path) = locate(&source, &module, &element, c)?;
    if text(get(root, "kind")).as_deref() != Some("field") {
        return Err(err(
            "FACETS_PARQUET_FIELD",
            "Selected author must identify a Field",
            "/author/identity",
        ));
    }
    let request_id = text(get(&request, "id")).unwrap_or_default();
    let field_name = text(get(&request, "fieldName")).unwrap_or_default();
    let record_name = text(get(&request, "recordName")).unwrap_or_default();
    let field_path = format!("{path}/facets");
    let mut residuals = Vec::new();
    let mut diagnostics = Vec::new();
    let mut intended = Value::Object(vec![]);
    let mut fatal = false;
    if let Value::Object(fields) = &source {
        for (name, value) in fields {
            if ![k("umf"), k("id"), k("modules"), k("vocabularies")].contains(name) {
                let at = path_key(&Utf16::default(), name, c)?;
                residuals.push(facet_loss_exact(
                    at,
                    value,
                    "Document metadata remains in the receipt and is not projected",
                    "unknown",
                    c,
                )?);
            }
        }
    }
    if matches!(get(&source, "vocabularies"), Some(Value::Object(vocabularies)) if !vocabularies.is_empty())
    {
        residuals.push(facet_loss(
            "/vocabularies",
            get(&source, "vocabularies").unwrap(),
            "Vocabulary semantics are not projected",
            "unknown",
            c,
        )?);
    }
    for (module_index, module_value) in arr(get(&source, "modules")).iter().enumerate() {
        if module_index != mi {
            residuals.push(facet_loss(
                &format!("/modules/{module_index}"),
                module_value,
                "Other module is outside selected Field projection",
                "unknown",
                c,
            )?);
            continue;
        }
        if let Value::Object(fields) = module_value {
            for (name, value) in fields {
                if name != &k("id")
                    && name != &k("elements")
                    && !(name == &k("namespace") && text(Some(value)).as_deref() == Some(""))
                {
                    let base = Utf16::from(format!("/modules/{module_index}"));
                    let at = path_key(&base, name, c)?;
                    residuals.push(facet_loss_exact(
                        at,
                        value,
                        "Module metadata is not projected",
                        "unknown",
                        c,
                    )?);
                }
            }
        }
        for (element_index, other) in arr(get(module_value, "elements")).iter().enumerate() {
            if element_index != ei {
                residuals.push(facet_loss(
                    &format!("/modules/{module_index}/elements/{element_index}"),
                    other,
                    "Other element is outside selected Field projection",
                    "unknown",
                    c,
                )?);
            }
        }
    }
    if let Value::Object(fields) = root {
        for (name, value) in fields {
            if ![k("id"), k("kind"), k("name"), k("scalarType"), k("facets")].contains(name)
                && !(name == &k("cardinality") && text(Some(value)).as_deref() == Some("one"))
                && !(name == &k("extensions")
                    && matches!(value, Value::Object(members) if members.is_empty()))
            {
                let base = Utf16::from(path.clone());
                let at = path_key(&base, name, c)?;
                residuals.push(facet_loss_exact(at, value, "Field metadata is retained; availability/default execution is not inferred from facets", "unknown", c)?);
            }
        }
    }
    if let Some(name) = text(get(root, "name")) {
        if name != field_name {
            residuals.push(facet_loss(
                &format!("{path}/name"),
                get(root, "name").unwrap(),
                "Explicit native field name differs from ideal name",
                "not-expressible",
                c,
            )?);
        }
    }
    if get(root, "itemType").is_some()
        || text(get(root, "cardinality")).is_some_and(|value| value == "array" || value == "map")
        || arr(get(root, "references"))
            .iter()
            .any(|reference| text(get(reference, "role")).as_deref() == Some("record-type"))
    {
        fatal = true;
        residuals.push(facet_loss(
            &path,
            root,
            "A scalar projection cannot flatten a container or record-valued Field",
            "not-expressible",
            c,
        )?);
    }
    if text(get(&author, "operation")).as_deref() == Some("declare-core-facets") {
        let inspected = crate::facets::inspect_core_facets(
            &source,
            identity,
            &rt.engine,
            &rt.registry,
            &mut caps,
            c,
        )?;
        let meaning = get(&inspected, "meaning").unwrap_or(&Value::Null);
        if let Some(v) = get(meaning, "interpreted") {
            intended = crate::facets::historical_core_facet_patch(v, &rt.engine, c)?;
        }
        if text(get(meaning, "state")).as_deref() == Some("partial") {
            residuals.push(facet_loss(
                &field_path,
                get(meaning, "facets").unwrap_or(&Value::Null),
                "Unknown facet qualifiers remain attached; no native interpretation is fabricated",
                "unknown",
                c,
            )?);
        }
    } else if get(root, "facets").is_some() {
        residuals.push(facet_loss(
            &format!("{path}/facets"),
            get(root, "facets").unwrap(),
            "A Field-kind receipt does not establish authorship of facet members",
            "unknown",
            c,
        )?);
    }
    let mut mapping_facets = Vec::new();
    let carrier = get(&request, "carrier").unwrap();
    let ck = text(get(carrier, "kind")).unwrap_or_default();
    let metadata = if text(get(&request, "encoding")).as_deref() == Some("metadata-only")
        && text(get(&author, "operation")).as_deref() == Some("declare-core-facets")
    {
        get(root, "facets")
    } else {
        None
    };
    let target_result = facet_wire_file(&request, metadata, c).and_then(|bytes| {
        import_parquet_schema(
            &bytes,
            &k(&request_id),
            &rt.engine,
            &rt.registry,
            &mut caps,
            c,
        )
    });
    let (target, status) = match target_result {
        Ok(t) => (Some(t), "projected"),
        Err(e) if e.code.contains("PARQUET_FACET_CARRIER") => {
            residuals.push(facet_loss(
                "/request/carrier",
                carrier,
                &format!(
                    "Invalid native carrier or unsupported representation: {}",
                    e.message.to_utf8().unwrap_or_default()
                ),
                "not-expressible",
                c,
            )?);
            (None, "blocked")
        }
        Err(e) => return Err(e),
    };
    if let Some(target_value) = target.as_ref() {
        let shape = crate::parquet_cardinality_classification::inspect_shape_node(
            target_value,
            1,
            &rt.engine,
            &rt.registry,
            &mut caps,
            c,
        )?;
        let native_fragment = get(&shape, "nativeFragment").ok_or_else(|| {
            err(
                "FACETS_PARQUET_NATIVE",
                "Generated Parquet carrier has no observed native field",
                "/target/schema/1",
            )
        })?;
        let observed =
            crate::parquet_facets_classification::inspect_native_meaning(native_fragment, c)?;
        let native_family = text(get(&observed, "family")).unwrap_or_default();
        let field_metadata = crate::parquet_capture_inspection::get_parquet_field_metadata(
            target_value,
            &rt.engine,
            &rt.registry,
            &mut caps,
            c,
        )?;
        let native_scalar_family = arr(get(&field_metadata, "fields"))
            .first()
            .and_then(|entry| get(entry, "element"))
            .and_then(|element| get(element, "scalarType"));
        if let Some(width) = get(&intended, "integerWidth") {
            let matches = native_family == "integer"
                && get(width, "bits") == get(&observed, "bits")
                && get(width, "signed") == get(&observed, "signed");
            if matches {
                mapping_facets.push(("integerWidth", copy_json(width, c)?));
            } else {
                residuals.push(facet_loss(
                    &format!("{path}/facets/integerWidth"),
                    width,
                    "Explicit Parquet carrier does not declare the authored integer domain",
                    "not-expressible",
                    c,
                )?);
            }
        }
        if let Some(p) = get(&intended, "precision") {
            let matches = native_family == "decimal"
                && Some(p) == get(&observed, "precision")
                && get(&intended, "scale") == get(&observed, "scale");
            if matches {
                mapping_facets.push(("precision", copy_json(p, c)?));
                mapping_facets.push(("scale", copy_json(get(&intended, "scale").unwrap(), c)?));
            } else {
                residuals.push(facet_loss(
                    &field_path,
                    &intended,
                    "Explicit Parquet carrier does not declare the authored decimal pair",
                    "not-expressible",
                    c,
                )?);
            }
        }
        if let Some(length) = get(&intended, "length") {
            let exact_bytes = get(&observed, "exactBytes");
            let matches = native_family == "binary"
                && exact_bytes.is_some_and(|v| !matches!(v, Value::Null))
                && text(get(length, "unit")).as_deref() == Some("byte")
                && get(length, "max") == exact_bytes;
            if matches {
                mapping_facets.push(("length", copy_json(length, c)?));
            } else {
                residuals.push(facet_loss(
                    &format!("{path}/facets/length"),
                    length,
                    "Parquet variable string/binary metadata does not enforce a maximum bound; fixed count must match explicitly",
                    "not-expressible",
                    c,
                )?);
            }
        }
        if native_family == "binary"
            && get(&observed, "exactBytes").is_some_and(|v| !matches!(v, Value::Null))
        {
            residuals.push(facet_loss(
                &format!("{path}/facets/length"),
                get(&intended, "length").unwrap_or(&Value::Null),
                "Exact fixed length rejects shorter values permitted by a maximum bound; no padding or truncation is implied",
                "not-expressible",
                c,
            )?);
        }
        if let Some(source_scalar) = get(root, "scalarType") {
            if Some(source_scalar) != native_scalar_family {
                residuals.push(facet_loss(
                    &format!("{path}/scalarType"),
                    source_scalar,
                    "Explicit native carrier belongs to a different scalar family; no value conversion is inferred",
                    "not-expressible",
                    c,
                )?);
            }
        }
        if text(get(&request, "profile")).as_deref() == Some("pyarrow-21")
            && native_family == "decimal"
            && get(&observed, "precision")
                .is_some_and(|x| matches!(x, Value::Number(n) if *n > 76.0))
        {
            residuals.push(facet_loss(
                "/request/carrier",
                carrier,
                "PyArrow 21.0.0 cannot represent decimal precision above 76 although Parquet BYTE_ARRAY declarations allow it",
                "not-expressible",
                c,
            )?);
        }
        if text(get(&request, "obligation")).as_deref() == Some("exact-input") {
            let (reason, outcome) = if native_family == "integer" {
                (
                    "PyArrow safe array construction truncates fractional input 1.5 to integer 1",
                    "approximated",
                )
            } else if native_family == "float"
                && get(&observed, "bits") == Some(&Value::Number(32.0))
            {
                (
                    "Binary64 1.0000000000000002 narrows to binary32 1.0",
                    "approximated",
                )
            } else {
                (
                    "Schema domains do not prove exact conversion of arbitrary host inputs",
                    "unknown",
                )
            };
            residuals.push(facet_loss(&path, root, reason, outcome, c)?);
        }
    }
    let blocked = status == "blocked"
        || fatal
        || (!residuals.is_empty() && text(get(&request, "mode")).as_deref() == Some("strict"));
    let status = if blocked { "blocked" } else { "projected" };
    let outcome = if residuals
        .iter()
        .any(|r| text(get(r, "outcome")).as_deref() == Some("not-expressible"))
    {
        "not-expressible"
    } else if residuals
        .iter()
        .any(|r| text(get(r, "outcome")).as_deref() == Some("unknown"))
    {
        "unknown"
    } else if residuals.is_empty() {
        "exact"
    } else {
        "approximated"
    };
    for r in &residuals {
        diagnostics.push(obj(vec![
            ("code", s("FACETS_MEANING_NOT_PROJECTED")),
            ("path", copy_json(get(r, "path").unwrap(), c)?),
            ("message", copy_json(get(r, "reason").unwrap(), c)?),
            ("severity", s(if blocked { "error" } else { "warning" })),
        ]));
    }
    let mut mapping = vec![
        ("origin", s("authored")),
        ("idealPath", s(&field_path)),
        ("nativeIndex", Value::Number(1.0)),
        (
            "facets",
            Value::Object(mapping_facets.into_iter().map(|(n, v)| (k(n), v)).collect()),
        ),
        (
            "encoding",
            copy_json(get(&request, "encoding").unwrap(), c)?,
        ),
        ("profile", copy_json(get(&request, "profile").unwrap(), c)?),
        ("outcome", s(outcome)),
    ];
    let mut output = vec![
        ("operation", s("project-facets-parquet")),
        ("version", s("1.0.0")),
        ("status", s(status)),
        ("source", source),
        ("author", author),
        ("request", request),
        (
            "binding",
            copy_json(
                get(get(&schema, "properties").unwrap(), "binding")
                    .and_then(|x| get(x, "const"))
                    .unwrap(),
                c,
            )?,
        ),
        ("mapping", obj(mapping)),
        ("residuals", Value::Array(residuals)),
        ("diagnostics", Value::Array(diagnostics)),
    ];
    if !blocked {
        output.push(("target", target.unwrap()));
    }
    let value = obj(output);
    if !result_schema.validate(&value, c)?.is_empty() {
        return Err(err(
            "FACETS_PARQUET_RESULT",
            "Projection result failed its pinned schema",
            "",
        ));
    }
    Ok(value)
}

pub fn recover_facets_from_parquet(
    receipt: &Value,
    native_hex: &Value,
    c: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(c)?;
    let schema = parse(FACET_RESULT, c)?;
    let mut resources = rt.engine.schema_resources_with_context(c)?;
    resources.entries.push((
        k("urn:umf:core:semantic-type-reference:1.0.0"),
        parse(
            include_str!("../../../spec/core/semantic-type-reference.schema.json"),
            c,
        )?,
    ));
    resources
        .entries
        .push((k("urn:umf:core:0.10.0"), parse(CORE, c)?));
    resources.entries.push((
        k("urn:umf:core:facet-operation:3.0.0"),
        parse(FACET_AUTHOR, c)?,
    ));
    resources.entries.push((
        k("urn:umf:core:kind-operation:6.0.0"),
        parse(KIND_AUTHOR, c)?,
    ));
    let compiled = CompiledSchema::compile(&schema, &resources, c)?;
    if !compiled.validate(receipt, c)?.is_empty()
        || text(get(receipt, "status")).as_deref() != Some("projected")
    {
        return Err(err(
            "FACETS_PARQUET_RECEIPT",
            "Expected projected receipt",
            "/receipt",
        ));
    }
    let expected = project_facets_to_parquet(
        get(receipt, "author").unwrap(),
        get(receipt, "request").unwrap(),
        c,
    )?;
    if canonical(&expected, c)? != canonical(receipt, c)? {
        return Err(err(
            "FACETS_PARQUET_RECEIPT",
            "Receipt differs from retained author and request",
            "/receipt",
        ));
    }
    let hex = text(Some(native_hex)).ok_or_else(|| {
        err(
            "FACETS_PARQUET_STALE",
            "nativeHex must be lowercase hexadecimal",
            "/nativeHex",
        )
    })?;
    c.charge_work(hex.len(), k("/nativeHex"))?;
    let mut supplied = Vec::with_capacity(hex.len() / 2);
    let nib = |b: u8| -> Option<u8> {
        match b {
            b'0'..=b'9' => Some(b - b'0'),
            b'a'..=b'f' => Some(b - b'a' + 10),
            _ => None,
        }
    };
    if hex.len() % 2 != 0 {
        return Err(err(
            "FACETS_PARQUET_STALE",
            "nativeHex must be lowercase hexadecimal",
            "/nativeHex",
        ));
    }
    for pair in hex.as_bytes().chunks_exact(2) {
        let hi = nib(pair[0]).ok_or_else(|| {
            err(
                "FACETS_PARQUET_STALE",
                "nativeHex must be lowercase hexadecimal",
                "/nativeHex",
            )
        })?;
        let lo = nib(pair[1]).ok_or_else(|| {
            err(
                "FACETS_PARQUET_STALE",
                "nativeHex must be lowercase hexadecimal",
                "/nativeHex",
            )
        })?;
        supplied.push(hi << 4 | lo);
    }
    let actual = export_parquet_capture(
        get(receipt, "target").unwrap(),
        &rt.engine,
        &rt.registry,
        &mut NoCaps,
        c,
    )?;
    if supplied != actual {
        return Err(err(
            "FACETS_PARQUET_STALE",
            "Native target bytes changed",
            "/nativeHex",
        ));
    }
    copy_json(get(receipt, "source").unwrap(), c)
}

const KEY_RESULT: &str = include_str!("../../../spec/core/key-parquet-projection.schema.json");
const KEY_AUTHOR_SCHEMA: &str = include_str!("../../../spec/core/key-operation-v2.schema.json");
const KEY_RECOVERY: &str = "Recover authored source from retained receipt; native import alone does not recover authored identity";

fn key_type_name(tag: u8) -> Result<&'static str, EngineError> {
    match tag {
        1 | 2 => Ok("bool"),
        3 => Ok("i8"),
        4 => Ok("i16"),
        5 => Ok("i32"),
        6 => Ok("i64"),
        7 => Ok("double"),
        8 => Ok("binary"),
        9 => Ok("list"),
        10 => Ok("set"),
        11 => Ok("map"),
        12 => Ok("struct"),
        _ => Err(err(
            "KEY_PARQUET_WIRE",
            "Unsupported Parquet wire value",
            "/request",
        )),
    }
}
fn native_wire_to_value(
    v: &crate::parquet_schema_decode::NativeWireValue,
    depth: usize,
    c: &mut Context<'_>,
) -> Result<Value, EngineError> {
    use crate::parquet_schema_decode::NativeWireValue as N;
    if depth > c.limits().max_depth {
        return Err(
            err("LIMIT", "Wire conversion depth exceeded", "/request").with_control_failure()
        );
    }
    c.charge_work(1, k("/request"))?;
    Ok(match v {
        N::Bool(value) => obj(vec![("kind", s("bool")), ("value", Value::Bool(*value))]),
        N::Byte(value) => obj(vec![("kind", s("i8")), ("value", s(&value.to_string()))]),
        N::I16(value) => obj(vec![("kind", s("i16")), ("value", s(&value.to_string()))]),
        N::I32(value) => obj(vec![("kind", s("i32")), ("value", s(&value.to_string()))]),
        N::I64(value) => obj(vec![("kind", s("i64")), ("value", s(&value.to_string()))]),
        N::Double(bits) => obj(vec![
            ("kind", s("double")),
            ("value", Value::Number(f64::from_bits(*bits))),
        ]),
        N::Binary(bytes) => {
            c.charge_work(bytes.len().saturating_mul(2), k("/request"))?;
            c.charge_text(bytes.len().saturating_mul(2), k("/request"))?;
            let mut hex = String::with_capacity(bytes.len().saturating_mul(2));
            for b in bytes {
                use std::fmt::Write as _;
                write!(&mut hex, "{b:02x}").unwrap();
            }
            obj(vec![("kind", s("binary")), ("hex", s(&hex))])
        }
        N::List(tag, items) | N::Set(tag, items) => {
            let kind = if matches!(v, N::List(..)) {
                "list"
            } else {
                "set"
            };
            let mut out = Vec::with_capacity(items.len());
            for item in items {
                out.push(native_wire_to_value(item, depth + 1, c)?);
            }
            obj(vec![
                ("kind", s(kind)),
                ("elementType", s(key_type_name(*tag)?)),
                ("items", Value::Array(out)),
            ])
        }
        N::Map(key_tag, value_tag, entries) => {
            let mut out = Vec::with_capacity(entries.len());
            for (key, value) in entries {
                out.push(obj(vec![
                    ("key", native_wire_to_value(key, depth + 1, c)?),
                    ("value", native_wire_to_value(value, depth + 1, c)?),
                ]));
            }
            obj(vec![
                ("kind", s("map")),
                ("keyType", s(key_type_name(*key_tag)?)),
                ("valueType", s(key_type_name(*value_tag)?)),
                ("entries", Value::Array(out)),
            ])
        }
        N::Struct(fields) => {
            let mut out = Vec::with_capacity(fields.len());
            for (id, value) in fields {
                out.push(obj(vec![
                    ("id", Value::Number(*id as f64)),
                    ("value", native_wire_to_value(value, depth + 1, c)?),
                ]));
            }
            obj(vec![("kind", s("struct")), ("fields", Value::Array(out))])
        }
        N::Uuid(bytes) => {
            c.charge_work(32, k("/request"))?;
            c.charge_text(32, k("/request"))?;
            let mut hex = String::with_capacity(32);
            for b in bytes {
                use std::fmt::Write as _;
                write!(&mut hex, "{b:02x}").unwrap();
            }
            obj(vec![("kind", s("uuid")), ("hex", s(&hex))])
        }
    })
}
fn key_wire_file(
    record_name: &str,
    columns: &[Value],
    c: &mut Context<'_>,
) -> Result<Vec<u8>, EngineError> {
    if columns.is_empty() || columns.len() > 1000 {
        return Err(err(
            "KEY_PARQUET_COLUMNS",
            "At least one and at most 1000 columns are required",
            "/request/columns",
        ));
    }
    let mut schema = vec![wire_struct(vec![
        (4, wire_binary(&k(record_name), c)?),
        (5, wire_i32(columns.len() as i32)),
    ])];
    for column in columns {
        let name = text(get(column, "name")).unwrap_or_default();
        let mut request = obj(vec![
            ("recordName", s("Carrier")),
            ("fieldName", s(&name)),
            ("nullable", Value::Bool(false)),
            (
                "carrier",
                copy_json(
                    get(column, "carrier").ok_or_else(|| {
                        err(
                            "KEY_PARQUET_COLUMNS",
                            "Carrier required",
                            "/request/columns",
                        )
                    })?,
                    c,
                )?,
            ),
        ]);
        if let Some(field_id) = get(column, "fieldId") {
            if let Value::Object(m) = &mut request {
                m.push((k("fieldId"), copy_json(field_id, c)?));
            }
        }
        let bytes = facet_wire_file(&request, None, c)?;
        let decoded = crate::parquet_schema_decode::decode_compact_footer(&bytes, c)?;
        let crate::parquet_schema_decode::NativeWireValue::Struct(footer) = decoded.value else {
            return Err(err(
                "KEY_PARQUET_WIRE",
                "Expected FileMetaData struct",
                "/request/columns",
            ));
        };
        let schema_fields = footer
            .iter()
            .find(|(id, _)| *id == 2)
            .map(|(_, v)| v)
            .ok_or_else(|| {
                err(
                    "KEY_PARQUET_WIRE",
                    "Schema list missing",
                    "/request/columns",
                )
            })?;
        let crate::parquet_schema_decode::NativeWireValue::List(_, items) = schema_fields else {
            return Err(err(
                "KEY_PARQUET_WIRE",
                "Expected schema list",
                "/request/columns",
            ));
        };
        let leaf = items.get(1).ok_or_else(|| {
            err(
                "KEY_PARQUET_WIRE",
                "Field schema missing",
                "/request/columns",
            )
        })?;
        schema.push(native_wire_to_value(leaf, 0, c)?);
    }
    let footer = encode_parquet_wire(
        &wire_struct(vec![
            (1, wire_i32(1)),
            (
                2,
                obj(vec![
                    ("kind", s("list")),
                    ("elementType", s("struct")),
                    ("items", Value::Array(schema)),
                ]),
            ),
            (3, wire_i64(0)),
            (
                4,
                obj(vec![
                    ("kind", s("list")),
                    ("elementType", s("struct")),
                    ("items", Value::Array(vec![])),
                ]),
            ),
        ]),
        c,
    )?;
    let mut bytes = b"PAR1".to_vec();
    bytes.extend(footer.iter().copied());
    bytes.extend((footer.len() as u32).to_le_bytes());
    bytes.extend(b"PAR1");
    Ok(bytes)
}
fn key_loss(
    path: &str,
    value: &Value,
    reason: &str,
    outcome: &str,
    c: &mut Context<'_>,
) -> Result<Value, EngineError> {
    Ok(obj(vec![
        ("path", s(path)),
        ("value", copy_json(value, c)?),
        ("reason", s(reason)),
        ("outcome", s(outcome)),
        ("recovery", s(KEY_RECOVERY)),
    ]))
}
fn same_key_value(a: &Value, b: &Value, c: &mut Context<'_>) -> Result<bool, EngineError> {
    Ok(canonical(a, c)? == canonical(b, c)?)
}
fn key_pair(value: &Value) -> String {
    let module = text(get(value, "module")).unwrap_or_default();
    let element = text(get(value, "element")).unwrap_or_default();
    format!("{}:{}{}:{}", module.len(), module, element.len(), element)
}
fn key_locate<'a>(
    source: &'a Value,
    reference: &Value,
    c: &mut Context<'_>,
) -> Result<(usize, usize, &'a Value, String), EngineError> {
    locate(
        source,
        &text(get(reference, "module")).unwrap_or_default(),
        &text(get(reference, "element")).unwrap_or_default(),
        c,
    )
}

pub fn project_keys_to_parquet(
    source_input: &Value,
    authors_input: &Value,
    request_input: &Value,
    c: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(c)?;
    let schema = parse(KEY_RESULT, c)?;
    let mut resources = rt.engine.schema_resources_with_context(c)?;
    resources.entries.push((
        k("urn:umf:core:semantic-type-reference:1.0.0"),
        parse(
            include_str!("../../../spec/core/semantic-type-reference.schema.json"),
            c,
        )?,
    ));
    resources
        .entries
        .push((k("urn:umf:core:0.10.0"), parse(CORE, c)?));
    resources.entries.push((
        k("urn:umf:core:key-operation:2.0.0"),
        parse(KEY_AUTHOR_SCHEMA, c)?,
    ));
    let result_schema = CompiledSchema::compile(&schema, &resources, c)?;
    let request_value = get(
        get(&schema, "properties").unwrap_or(&Value::Null),
        "request",
    )
    .unwrap();
    let request_schema = CompiledSchema::compile(request_value, &resources, c)?;
    let request = copy_json(request_input, c)?;
    if let Some(d) = request_schema.validate(&request, c)?.first() {
        return Err(EngineError::new(
            "KEY_PARQUET_REQUEST",
            d.instance_path.clone(),
            d.message.clone(),
        ));
    }
    let source = copy_json(source_input, c)?;
    if text(get(&source, "umf")).as_deref() != Some("0.10.0") {
        return Err(err(
            "KEY_PARQUET_SOURCE",
            "Valid explicit core 0.10.0 required",
            "/source/umf",
        ));
    }
    let mut caps = NoCaps;
    if !rt
        .engine
        .validate_document(&source, &rt.registry, &mut caps, c)?
        .valid
    {
        return Err(err(
            "KEY_PARQUET_SOURCE",
            "Valid explicit core 0.10.0 required",
            "/source",
        ));
    }
    let record_ref = get(&request, "record").unwrap();
    let (module_index, element_index, record, path) = key_locate(&source, record_ref, c)?;
    if text(get(record, "kind")).as_deref() != Some("record") {
        return Err(err(
            "KEY_PARQUET_RECORD",
            "Selected Record must have authored keys and explicit membership",
            "/request/record",
        ));
    }
    let declared = arr(get(record, "keys"));
    let members = arr(get(record, "members"));
    if declared.is_empty() || members.is_empty() {
        return Err(err(
            "KEY_PARQUET_RECORD",
            "Selected Record must have authored keys and explicit membership",
            "/source",
        ));
    }
    let authors = copy_json(authors_input, c)?;
    let Value::Array(author_values) = &authors else {
        return Err(err(
            "KEY_PARQUET_AUTHORS",
            "Exactly one verified declaration for every current key is required",
            "/authors",
        ));
    };
    if author_values.len() != declared.len() {
        return Err(err(
            "KEY_PARQUET_AUTHORS",
            "Exactly one verified declaration for every current key is required",
            "/authors",
        ));
    }
    let mut author_ids = std::collections::HashSet::new();
    for author in author_values {
        if text(get(author, "operation")).as_deref() != Some("declare-core-key") {
            return Err(err(
                "KEY_PARQUET_AUTHORS",
                "Expected key declarations",
                "/authors",
            ));
        }
        let target = get(author, "target")
            .ok_or_else(|| err("KEY_PARQUET_AUTHORS", "Author target required", "/authors"))?;
        crate::core_keys::verify_core_key_operation(
            author,
            target,
            &rt.engine,
            &rt.registry,
            &mut caps,
            c,
        )?;
        let ident = get(author, "identity").ok_or_else(|| {
            err(
                "KEY_PARQUET_AUTHORS",
                "Author identity required",
                "/authors",
            )
        })?;
        if get(target, "id") != get(&source, "id") || key_pair(ident) != key_pair(record_ref) {
            return Err(err(
                "KEY_PARQUET_AUTHORS",
                "Duplicate or mismatched author identity",
                "/authors",
            ));
        }
        let key_id =
            text(get(get(author, "request").unwrap_or(&Value::Null), "id")).unwrap_or_default();
        if !author_ids.insert(key_id.clone()) {
            return Err(err(
                "KEY_PARQUET_AUTHORS",
                "Duplicate or mismatched author identity",
                "/authors",
            ));
        }
        let key_identity = obj(vec![
            ("module", copy_json(get(record_ref, "module").unwrap(), c)?),
            (
                "element",
                copy_json(get(record_ref, "element").unwrap(), c)?,
            ),
            ("key", s(&key_id)),
        ]);
        let current = crate::core_keys::lookup_core_key(
            &source,
            &key_identity,
            &rt.engine,
            &rt.registry,
            &mut caps,
            c,
        )?;
        let prior = crate::core_keys::lookup_core_key(
            target,
            &key_identity,
            &rt.engine,
            &rt.registry,
            &mut caps,
            c,
        )?;
        if !same_key_value(
            get(&current, "key").unwrap(),
            get(&prior, "key").unwrap(),
            c,
        )? {
            return Err(err(
                "KEY_PARQUET_STALE",
                "Key meaning changed since declaration",
                "/authors",
            ));
        }
        for reference in arr(get(&current, "key").and_then(|x| get(x, "fields"))) {
            let (_, _, now, now_path) = key_locate(&source, reference, c)?;
            let (_, _, then, _) = key_locate(target, reference, c)?;
            if !same_key_value(now, then, c)? {
                return Err(err(
                    "KEY_PARQUET_STALE",
                    "Key component changed since declaration",
                    "/authors",
                ));
            }
            let now_member = members.iter().find(|m| key_pair(m) == key_pair(reference));
            let prior_record = key_locate(target, record_ref, c)?.2;
            let then_member = arr(get(prior_record, "members"))
                .iter()
                .find(|m| key_pair(m) == key_pair(reference));
            if now_member != then_member {
                return Err(err(
                    "KEY_PARQUET_STALE",
                    "Key ownership qualifier changed since declaration",
                    "/authors",
                ));
            }
            let _ = now_path;
        }
    }
    let declared_ids = declared
        .iter()
        .filter_map(|key| text(get(key, "id")))
        .collect::<std::collections::HashSet<_>>();
    if author_ids != declared_ids {
        return Err(err(
            "KEY_PARQUET_AUTHORS",
            "Exactly one verified declaration for every current key is required",
            "/authors",
        ));
    }
    let columns = arr(get(&request, "columns"));
    let mut mapped = std::collections::HashMap::<String, &Value>::new();
    let mut names = std::collections::HashSet::<String>::new();
    for column in columns {
        let field = get(column, "field").ok_or_else(|| {
            err(
                "KEY_PARQUET_COLUMNS",
                "Column identity required",
                "/request/columns",
            )
        })?;
        let id = key_pair(field);
        let name = text(get(column, "name")).unwrap_or_default();
        if mapped.insert(id.clone(), column).is_some() || !names.insert(name) {
            return Err(err(
                "KEY_PARQUET_COLUMNS",
                "Column identities and names must be unique and owned by the selected Record",
                "/request/columns",
            ));
        }
        if !members.iter().any(|m| key_pair(m) == id) {
            return Err(err(
                "KEY_PARQUET_COLUMNS",
                "Column identities and names must be unique and owned by the selected Record",
                "/request/columns",
            ));
        }
    }
    if mapped.len() != members.len() {
        return Err(err(
            "KEY_PARQUET_COLUMNS",
            "Map every owned Field explicitly",
            "/request/columns",
        ));
    }
    let record_name = text(get(&request, "recordName")).unwrap_or_default();
    let mut impossible = false;
    let mut target = None;
    let bytes = key_wire_file(&record_name, columns, c);
    match bytes {
        Ok(bytes) => match import_parquet_schema(
            &bytes,
            &k(&text(get(&request, "id")).unwrap_or_default()),
            &rt.engine,
            &rt.registry,
            &mut caps,
            c,
        ) {
            Ok(value) => target = Some(value),
            Err(e) => return Err(e),
        },
        Err(e) => {
            if e.code.contains("PARQUET_FACET_CARRIER") {
                impossible = true;
            } else {
                return Err(e);
            }
        }
    }
    let native_fields = if let Some(t) = target.as_ref() {
        let m = crate::parquet_capture_inspection::get_parquet_field_metadata(
            t,
            &rt.engine,
            &rt.registry,
            &mut caps,
            c,
        )?;
        arr(get(&m, "fields")).to_vec()
    } else {
        Vec::new()
    };
    let mut residuals = Vec::new();
    if target.is_none() {
        residuals.push(key_loss(
            "/request",
            &request,
            "Native carrier cannot be emitted; no column target was produced",
            "not-expressible",
            c,
        )?);
    }
    residuals.push(key_loss("/",&source,"Only selected Record scalar column carriers are emitted; all other metadata, native extensions, relationships and unknown content remain in this source residual","not-expressible",c)?);
    for (index, column) in columns.iter().enumerate() {
        let reference = get(column, "field").unwrap();
        let (_, _, field, field_path) = key_locate(&source, reference, c)?;
        let actual = native_fields.get(index).and_then(|x| get(x, "element"));
        let mismatch = actual.and_then(|x| get(x, "scalarType")) != get(field, "scalarType");
        let invalid = text(get(field, "kind")).as_deref() != Some("field")
            || text(get(field, "cardinality")).as_deref() != Some("one")
            || get(field, "itemType").is_some()
            || arr(get(field, "references"))
                .iter()
                .any(|x| text(get(x, "role")).as_deref() == Some("record-type"))
            || text(get(field, "nullability")).as_deref() != Some("required")
            || mismatch;
        if invalid {
            impossible = true;
            residuals.push(key_loss(&field_path,field,"This carrier binding requires a required singular scalar Field with matching native family; other shapes need explicit separate bindings","not-expressible",c)?);
            continue;
        }
        residuals.push(key_loss(&field_path,field,"Native bounds, length/width facets, fixed-byte lower bounds, decimal annotations and unknown qualifiers do not replace the authored domain. The empty file is a schema carrier, not a row validator or exact input converter","unknown",c)?);
        if text(get(field, "scalarType")).as_deref() == Some("integer") {
            residuals.push(key_loss(&field_path,field,"PyArrow 21 safe integer construction can truncate fractional input; native requiredness and integer storage do not establish exact writer input","unknown",c)?);
        }
    }
    let mut mappings = Vec::new();
    for key in declared {
        let key_id = text(get(key, "id")).unwrap_or_default();
        let identity = obj(vec![
            ("module", copy_json(get(record_ref, "module").unwrap(), c)?),
            (
                "element",
                copy_json(get(record_ref, "element").unwrap(), c)?,
            ),
            ("key", s(&key_id)),
        ]);
        let lookup = crate::core_keys::lookup_core_key(
            &source,
            &identity,
            &rt.engine,
            &rt.registry,
            &mut caps,
            c,
        )?;
        let definition = get(&lookup, "key").unwrap();
        let refs = arr(get(definition, "fields"));
        let mut cols = Vec::new();
        let mut native_paths = Vec::new();
        for reference in refs {
            let id = key_pair(reference);
            let col = mapped.get(&id).ok_or_else(|| {
                err(
                    "KEY_PARQUET_COLUMNS",
                    "Map every key component explicitly",
                    "/request/columns",
                )
            })?;
            cols.push(copy_json(get(col, "name").unwrap(), c)?);
            let index = columns
                .iter()
                .position(|x| key_pair(get(x, "field").unwrap()) == id)
                .unwrap();
            native_paths.push(s(&format!("/schema/{}", index + 1)));
        }
        let primary = matches!(get(definition, "primary"), Some(Value::Bool(true)));
        mappings.push(obj(vec![
            ("keyId", s(&key_id)),
            (
                "keyName",
                copy_json(get(definition, "name").unwrap_or(&Value::Null), c)?,
            ),
            ("idealPath", copy_json(get(&lookup, "path").unwrap(), c)?),
            ("nativePaths", Value::Array(native_paths)),
            ("columns", Value::Array(cols)),
            ("primary", Value::Bool(primary)),
            ("origin", s("authored")),
            ("enforcement", s("not-expressible")),
            ("outcome", s("not-expressible")),
        ]));
        residuals.push(key_loss(&text(get(&lookup,"path")).unwrap_or_default(),key,"Parquet has no native collection uniqueness or primary/alternate key declaration. Stable key IDs, names, ordered tuple and primary intent remain in this per-key residual; field order and metadata are not key enforcement","not-expressible",c)?);
    }
    let blocked = impossible || text(get(&request, "mode")).as_deref() == Some("strict");
    let mut diagnostics = Vec::new();
    for r in &residuals {
        diagnostics.push(obj(vec![
            ("code", s("KEY_PARQUET_LOSS")),
            ("path", copy_json(get(r, "path").unwrap(), c)?),
            ("message", copy_json(get(r, "reason").unwrap(), c)?),
            ("severity", s(if blocked { "error" } else { "warning" })),
        ]));
    }
    let binding = copy_json(
        get(
            get(get(&schema, "properties").unwrap(), "binding").unwrap(),
            "const",
        )
        .unwrap(),
        c,
    )?;
    let mut out = vec![
        ("operation", s("project-keys-parquet")),
        ("version", s("1.0.0")),
        ("status", s(if blocked { "blocked" } else { "projected" })),
        ("source", source),
        ("authors", authors),
        ("request", request),
        ("binding", binding),
        ("mappings", Value::Array(mappings)),
        ("residuals", Value::Array(residuals)),
        ("diagnostics", Value::Array(diagnostics)),
    ];
    if !blocked {
        out.push(("target", target.unwrap()));
    }
    let value = obj(out);
    if !result_schema.validate(&value, c)?.is_empty() {
        return Err(err(
            "KEY_PARQUET_RESULT",
            "Projection result failed its pinned schema",
            "",
        ));
    }
    let _ = module_index;
    let _ = element_index;
    Ok(value)
}

pub fn verify_keys_parquet_projection(
    receipt: &Value,
    current: &Value,
    c: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let source = get(receipt, "source")
        .ok_or_else(|| err("KEY_PARQUET_RECEIPT", "Source required", "/receipt"))?;
    let authors = get(receipt, "authors")
        .ok_or_else(|| err("KEY_PARQUET_RECEIPT", "Authors required", "/receipt"))?;
    let request = get(receipt, "request")
        .ok_or_else(|| err("KEY_PARQUET_RECEIPT", "Request required", "/receipt"))?;
    let expected = project_keys_to_parquet(source, authors, request, c)?;
    if text(get(&expected, "status")).as_deref() != Some("projected")
        || !same_key_value(&expected, receipt, c)?
    {
        return Err(err(
            "KEY_PARQUET_RECEIPT",
            "Receipt differs from retained author/source/request",
            "/receipt",
        ));
    }
    if !same_key_value(
        get(receipt, "target")
            .ok_or_else(|| err("KEY_PARQUET_RECEIPT", "Target required", "/receipt/target"))?,
        current,
        c,
    )? {
        return Err(err(
            "KEY_PARQUET_STALE",
            "Native representation changed since projection",
            "/current",
        ));
    }
    Ok(copy_json(receipt, c)?)
}
pub fn recover_keys_parquet_ideal(
    receipt: &Value,
    current: &Value,
    c: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let verified = verify_keys_parquet_projection(receipt, current, c)?;
    copy_json(get(&verified, "source").unwrap(), c)
}
