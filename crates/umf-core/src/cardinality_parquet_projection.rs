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
