// SPDX-License-Identifier: MIT OR Apache-2.0
//! Opt-in inspection, stable-ID lookup, authoring, and receipt verification for
//! core relationships. Results retain the full source; they are not native
//! enforcement evidence and do not change the TypeScript default route.
use crate::{
    context::Context,
    engine::{Capabilities, Engine},
    error::{Diagnostic, EngineError, Severity},
    registry::Registry,
    value::{Utf16, Value},
};
use std::collections::{BTreeSet, HashMap};

const DECLARATION_SCHEMA: &str =
    include_str!("../../../spec/core/relationship-operation.schema.json");
const INSPECTION_SCHEMA: &str =
    include_str!("../../../spec/core/relationship-operation-v3.schema.json");

fn k(s: &str) -> Utf16 {
    Utf16::from(s)
}
fn t(s: &str) -> Value {
    Value::string_utf8(s)
}
fn obj(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(name, value)| (k(name), value))
            .collect(),
    )
}
fn get<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    match value {
        Value::Object(fields) => fields
            .iter()
            .find(|(key, _)| key == &k(name))
            .map(|(_, value)| value),
        _ => None,
    }
}
fn raw(value: &Value) -> Option<Utf16> {
    if let Value::String(value) = value {
        Some(value.clone())
    } else {
        None
    }
}
fn eq(value: Option<&Value>, expected: &str) -> bool {
    value
        .and_then(raw)
        .is_some_and(|value| value == k(expected))
}
fn set(value: &mut Value, name: &str, next: Value) -> Result<(), EngineError> {
    let Value::Object(fields) = value else {
        return Err(err("CORE_RELATIONSHIP_SHAPE", "Expected object", ""));
    };
    if let Some((_, slot)) = fields.iter_mut().find(|(key, _)| key == &k(name)) {
        *slot = next;
    } else {
        fields.push((k(name), next));
    }
    Ok(())
}
fn remove(value: &mut Value, name: &str) {
    if let Value::Object(fields) = value {
        fields.retain(|(key, _)| key != &k(name));
    }
}
fn err(code: &str, message: impl Into<String>, path: &str) -> EngineError {
    EngineError::new(code, k(path), message.into())
}
fn child_path(path: &Utf16, key: &Utf16) -> Utf16 {
    let mut units = path.units().to_vec();
    units.push(b'/' as u16);
    for unit in key.units() {
        match unit {
            0x7e => units.extend([0x7e, 0x30]),
            0x2f => units.extend([0x7e, 0x31]),
            other => units.push(*other),
        }
    }
    Utf16::new(units)
}
/// Match the predecessor's visit-by-visit structural bound (including the
/// first offending pointer) while charging the cooperative host work meter.
fn copy_json(value: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    fn visit(
        value: &Value,
        ctx: &mut Context<'_>,
        path: &Utf16,
        depth: usize,
        count: &mut usize,
    ) -> Result<Value, EngineError> {
        ctx.charge_work(1, path.clone())?;
        *count = count.checked_add(1).ok_or_else(|| {
            err(
                "LIMIT",
                "JSON structural limit exceeded",
                &path.to_utf8().unwrap_or_default(),
            )
        })?;
        if *count > ctx.limits().max_values || depth > ctx.limits().max_depth {
            return Err(EngineError::new(
                "LIMIT",
                path.clone(),
                "JSON structural limit exceeded",
            ));
        }
        match value {
            Value::Null => Ok(Value::Null),
            Value::Bool(value) => Ok(Value::Bool(*value)),
            Value::Number(value) => Value::number(*value, path.clone()),
            Value::String(value) => {
                ctx.charge_work(value.len(), path.clone())?;
                Ok(Value::String(value.clone()))
            }
            Value::Array(items) => {
                let mut copied = Vec::new();
                for (index, item) in items.iter().enumerate() {
                    copied.push(visit(
                        item,
                        ctx,
                        &child_path(path, &k(&index.to_string())),
                        depth + 1,
                        count,
                    )?);
                }
                Ok(Value::Array(copied))
            }
            Value::Object(fields) => {
                let mut seen = BTreeSet::new();
                let mut copied = Vec::new();
                for (key, item) in fields {
                    ctx.charge_work(key.len(), path.clone())?;
                    if !seen.insert(key.units().to_vec()) {
                        return Err(EngineError::new(
                            "DUPLICATE_KEY",
                            path.clone(),
                            "Duplicate object key",
                        ));
                    }
                    copied.push((
                        key.clone(),
                        visit(item, ctx, &child_path(path, key), depth + 1, count)?,
                    ));
                }
                Ok(Value::Object(copied))
            }
        }
    }
    visit(value, ctx, &Utf16::default(), 0, &mut 0)
}
fn canonical_equal(
    a: &Value,
    b: &Value,
    ctx: &mut Context<'_>,
    path: &Utf16,
) -> Result<bool, EngineError> {
    ctx.charge_work(1, path.clone())?;
    match (a, b) {
        (Value::Array(x), Value::Array(y)) => {
            if x.len() != y.len() {
                return Ok(false);
            }
            for (index, (left, right)) in x.iter().zip(y).enumerate() {
                if !canonical_equal(left, right, ctx, &child_path(path, &k(&index.to_string())))? {
                    return Ok(false);
                }
            }
            Ok(true)
        }
        (Value::Object(x), Value::Object(y)) => {
            if x.len() != y.len() {
                return Ok(false);
            }
            // HashMap's keyed SipHash avoids the predecessor's repeated linear
            // scans while retaining order-insensitive object equality. Charge
            // each full key and recursive value visit so host controls can stop
            // large verification comparisons before further hashing/work.
            let mut right = HashMap::new();
            for (key, value) in y {
                ctx.charge_work(key.len().saturating_add(1), path.clone())?;
                right.insert(key, value);
            }
            for (key, value) in x {
                ctx.charge_work(key.len().saturating_add(1), path.clone())?;
                let Some(other) = right.get(key) else {
                    return Ok(false);
                };
                if !canonical_equal(value, other, ctx, &child_path(path, key))? {
                    return Ok(false);
                }
            }
            Ok(true)
        }
        _ => Ok(a == b),
    }
}
fn schema_value(text: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    crate::serialization::read_json_value(
        &text.encode_utf16().collect::<Vec<_>>(),
        crate::serialization::Format::Json,
        ctx,
    )
}
fn validate_schema(
    value: &Value,
    schema: &Value,
    engine: &Engine,
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    let resources = engine.schema_resources_with_context(ctx)?;
    let compiled = crate::schema::CompiledSchema::compile(schema, &resources, ctx)?;
    Ok(compiled.validate(value, ctx)?.is_empty())
}
fn schema_def(schema: &Value, name: &str) -> Result<Value, EngineError> {
    get(
        get(schema, "$defs")
            .ok_or_else(|| err("CORE_RELATIONSHIP_SCHEMA", "Missing schema definitions", ""))?,
        name,
    )
    .cloned()
    .ok_or_else(|| err("CORE_RELATIONSHIP_SCHEMA", "Missing operation schema", ""))
}
fn diagnostics_value(diagnostics: Vec<Diagnostic>) -> Value {
    Value::Array(
        diagnostics
            .into_iter()
            .map(|d| {
                obj(vec![
                    ("code", Value::String(d.code)),
                    ("path", Value::String(d.path)),
                    ("message", Value::String(d.message)),
                    (
                        "severity",
                        t(if d.severity == Severity::Warning {
                            "warning"
                        } else {
                            "error"
                        }),
                    ),
                ])
            })
            .collect(),
    )
}
fn validate_source(
    source: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Vec<Diagnostic>, EngineError> {
    let validation = engine.validate_document(source, registry, caps, ctx)?;
    if validation.valid {
        return Ok(validation.diagnostics);
    }
    let message = crate::serialization::stringify_compact_metered(
        &diagnostics_value(validation.diagnostics),
        ctx,
    )?
    .to_utf8()
    .unwrap_or_default();
    Err(err("RELATIONSHIP_SOURCE", message, ""))
}
fn validate_result(
    value: &Value,
    schema_text: &str,
    code: &str,
    engine: &Engine,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let schema = schema_value(schema_text, ctx)?;
    let resources = engine.schema_resources_with_context(ctx)?;
    let compiled = crate::schema::CompiledSchema::compile(&schema, &resources, ctx)?;
    if let Some(problem) = compiled.validate(value, ctx)?.first() {
        return Err(err(
            code,
            problem.message.to_utf8().unwrap_or_default().as_str(),
            &problem.instance_path.to_utf8().unwrap_or_default(),
        ));
    }
    Ok(())
}
fn finish_result(
    mut result: Value,
    document: &Value,
    schema: &str,
    code: &str,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let validation = engine.validate_document(document, registry, caps, ctx)?;
    set(
        &mut result,
        "diagnostics",
        diagnostics_value(validation.diagnostics),
    )?;
    set(&mut result, "residuals", Value::Array(vec![]))?;
    // The predecessor admits the complete assembled operation result after
    // adding diagnostics and residuals. This catches aggregate output growth
    // (for example retained unknown source content plus generated fields) at
    // the same JSON Pointer and structural-value boundary.
    let result = copy_json(&result, ctx)?;
    validate_result(&result, schema, code, engine, ctx)?;
    Ok(result)
}
fn unknown_paths(
    diagnostics: &[Diagnostic],
    path: &str,
    ctx: &mut Context<'_>,
) -> Result<Vec<Value>, EngineError> {
    let prefix = Utf16::from(format!("{path}/"));
    let base = k(path);
    let mut result = vec![];
    for diagnostic in diagnostics {
        ctx.charge_work(1, base.clone())?;
        if diagnostic
            .code
            .units()
            .starts_with(k("UNKNOWN_RELATIONSHIP_").units())
            && (diagnostic.path == base || diagnostic.path.units().starts_with(prefix.units()))
        {
            result.push(Value::String(diagnostic.path.clone()));
        }
    }
    Ok(result)
}
struct Located {
    source: Value,
    identity: Value,
    module_index: usize,
    path: String,
    diagnostics: Vec<Diagnostic>,
}
fn locate(
    input: &Value,
    identity_input: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Located, EngineError> {
    let source = copy_json(input, ctx)?;
    let identity = copy_json(identity_input, ctx)?;
    let schema = schema_value(DECLARATION_SCHEMA, ctx)?;
    if !validate_schema(&identity, &schema_def(&schema, "identity")?, engine, ctx)? {
        return Err(err(
            "RELATIONSHIP_IDENTITY",
            "Expected exact module identity",
            "",
        ));
    }
    if !eq(get(&source, "umf"), "0.10.0") {
        return Err(err(
            "RELATIONSHIP_VERSION",
            "Current core 0.10.0 source required",
            "",
        ));
    }
    let diagnostics = validate_source(&source, engine, registry, caps, ctx)?;
    let module_id = get(&identity, "module")
        .and_then(raw)
        .expect("validated module identity");
    let Some(Value::Array(modules)) = get(&source, "modules") else {
        return Err(err("RELATIONSHIP_MISSING", "Module does not resolve", ""));
    };
    for (index, module) in modules.iter().enumerate() {
        ctx.charge_work(1, k("/modules"))?;
        if get(module, "id").and_then(raw).as_ref() == Some(&module_id) {
            return Ok(Located {
                source,
                identity,
                module_index: index,
                path: format!("/modules/{index}/relationships"),
                diagnostics,
            });
        }
    }
    Err(err("RELATIONSHIP_MISSING", "Module does not resolve", ""))
}
fn module_relationships(source: &Value, index: usize) -> Option<&Value> {
    get(source, "modules")?
        .as_array()?
        .get(index)
        .and_then(|module| get(module, "relationships"))
}
trait ArrayView {
    fn as_array(&self) -> Option<&Vec<Value>>;
}
impl ArrayView for Value {
    fn as_array(&self) -> Option<&Vec<Value>> {
        if let Value::Array(items) = self {
            Some(items)
        } else {
            None
        }
    }
}
fn relationship_index(
    values: &[Value],
    id: &Utf16,
    ctx: &mut Context<'_>,
    path: &str,
) -> Result<Option<usize>, EngineError> {
    for (index, value) in values.iter().enumerate() {
        ctx.charge_work(1, k(path))?;
        if get(value, "id").and_then(raw).as_ref() == Some(id) {
            return Ok(Some(index));
        }
    }
    Ok(None)
}
fn ref_key(value: &Value, with_key: bool) -> Option<Vec<Utf16>> {
    let mut key = vec![
        get(value, "module")?.clone().into_string()?,
        get(value, "element")?.clone().into_string()?,
    ];
    if with_key {
        key.push(get(value, "key")?.clone().into_string()?);
    }
    Some(key)
}
trait IntoString {
    fn into_string(self) -> Option<Utf16>;
}
impl IntoString for Value {
    fn into_string(self) -> Option<Utf16> {
        raw(&self)
    }
}
fn endpoint_set(
    value: &Value,
    with_key: bool,
    ctx: &mut Context<'_>,
    path: &str,
) -> Result<Vec<Vec<Utf16>>, EngineError> {
    let Some(items) = value.as_array() else {
        return Ok(vec![]);
    };
    let mut result = Vec::new();
    for item in items {
        ctx.charge_work(1, k(path))?;
        result.push(ref_key(item, with_key).unwrap_or_default());
    }
    result.sort();
    Ok(result)
}
fn association_key(value: Option<&Value>) -> Option<Vec<Utf16>> {
    value.and_then(|v| ref_key(v, false))
}
fn bounds(value: Option<&Value>) -> Vec<Value> {
    let Some(value) = value else {
        return vec![Value::Null, Value::Null];
    };
    vec![
        get(value, "min").cloned().unwrap_or(Value::Null),
        get(value, "max").cloned().unwrap_or(Value::Null),
    ]
}
fn unknown_relationship(
    diagnostics: &[Diagnostic],
    path: &str,
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    Ok(!unknown_paths(diagnostics, path, ctx)?.is_empty())
}
fn merge_object(
    old: Option<&Value>,
    request: &Value,
    preserve_unknown: bool,
    ctx: &mut Context<'_>,
    path: &str,
) -> Result<Value, EngineError> {
    let mut result = if preserve_unknown {
        old.cloned().unwrap_or(Value::Object(vec![]))
    } else {
        Value::Object(vec![])
    };
    let Value::Object(fields) = request else {
        return Ok(request.clone());
    };
    for (name, value) in fields {
        ctx.charge_work(name.len().saturating_add(1), k(path))?;
        let Value::Object(out) = &mut result else {
            return Err(err(
                "CORE_RELATIONSHIP_SHAPE",
                "Expected relationship object",
                path,
            ));
        };
        if let Some((_, slot)) = out.iter_mut().find(|(key, _)| key == name) {
            *slot = value.clone();
        } else {
            out.push((name.clone(), value.clone()));
        }
    }
    Ok(result)
}
fn merge_endpoint_array(
    request: &Value,
    old: Option<&Value>,
    with_key: bool,
    ctx: &mut Context<'_>,
    path: &str,
) -> Result<Value, EngineError> {
    let Some(requests) = request.as_array() else {
        return Ok(request.clone());
    };
    let old = old.and_then(Value::as_array).cloned().unwrap_or_default();
    let mut result = vec![];
    for requested in requests {
        ctx.charge_work(1, k(path))?;
        let wanted = ref_key(requested, with_key);
        let previous = old
            .iter()
            .find(|candidate| ref_key(candidate, with_key) == wanted);
        result.push(merge_object(previous, requested, true, ctx, path)?);
    }
    Ok(Value::Array(result))
}
fn target_module_mut(target: &mut Value, module_index: usize) -> Result<&mut Value, EngineError> {
    let Value::Object(root) = target else {
        return Err(err(
            "CORE_RELATIONSHIP_SHAPE",
            "Expected document object",
            "",
        ));
    };
    root.iter_mut()
        .find(|(name, _)| name == &k("modules"))
        .and_then(|(_, value)| value.as_array_mut())
        .and_then(|modules| modules.get_mut(module_index))
        .ok_or_else(|| err("CORE_RELATIONSHIP_SHAPE", "Missing module", ""))
}
trait ArrayMut {
    fn as_array_mut(&mut self) -> Option<&mut Vec<Value>>;
}
impl ArrayMut for Value {
    fn as_array_mut(&mut self) -> Option<&mut Vec<Value>> {
        if let Value::Array(items) = self {
            Some(items)
        } else {
            None
        }
    }
}

/// Inspect one module's retained relationships and scoped unknown qualifier paths.
pub fn inspect_core_relationships(
    input: &Value,
    identity: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let located = locate(input, identity, engine, registry, caps, ctx)?;
    let module = get(&located.source, "modules")
        .and_then(Value::as_array)
        .and_then(|v| v.get(located.module_index))
        .expect("located module");
    let meaning = if let Some(relationships) = get(module, "relationships") {
        let paths = unknown_paths(&located.diagnostics, &located.path, ctx)?;
        obj(vec![
            (
                "state",
                t(if paths.is_empty() { "known" } else { "partial" }),
            ),
            ("relationships", copy_json(relationships, ctx)?),
            ("uninterpretedPaths", Value::Array(paths)),
        ])
    } else {
        obj(vec![("state", t("missing"))])
    };
    let document = located.source.clone();
    let result = obj(vec![
        ("operation", t("inspect-core-relationships")),
        ("version", t("3.0.0")),
        ("source", located.source),
        ("identity", located.identity),
        ("path", t(&located.path)),
        ("meaning", meaning),
        ("provenance", t("unverified")),
    ]);
    finish_result(
        result,
        &document,
        INSPECTION_SCHEMA,
        "RELATIONSHIP_RESULT",
        engine,
        registry,
        caps,
        ctx,
    )
}

/// Resolve one relationship by exact module-local stable ID.
pub fn lookup_core_relationship(
    input: &Value,
    identity_input: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let identity = copy_json(identity_input, ctx)?;
    let schema = schema_value(DECLARATION_SCHEMA, ctx)?;
    if !validate_schema(
        &identity,
        &schema_def(&schema, "lookupIdentity")?,
        engine,
        ctx,
    )? {
        return Err(err(
            "RELATIONSHIP_IDENTITY",
            "Expected stable relationship ID",
            "",
        ));
    }
    let module_identity = obj(vec![("module", get(&identity, "module").unwrap().clone())]);
    let located = locate(input, &module_identity, engine, registry, caps, ctx)?;
    let id = get(&identity, "id").and_then(raw).expect("validated ID");
    let relationships = module_relationships(&located.source, located.module_index)
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let Some(index) = relationship_index(&relationships, &id, ctx, &located.path)? else {
        return Err(err(
            "RELATIONSHIP_MISSING",
            "Stable relationship ID does not resolve",
            "",
        ));
    };
    let path = format!("{}/{index}", located.path);
    let unknown = unknown_paths(&located.diagnostics, &path, ctx)?;
    let document = located.source.clone();
    let result = obj(vec![
        ("operation", t("lookup-core-relationship")),
        ("version", t("3.0.0")),
        ("source", located.source),
        ("identity", identity),
        ("path", t(&path)),
        ("relationship", copy_json(&relationships[index], ctx)?),
        ("uninterpretedPaths", Value::Array(unknown)),
        ("provenance", t("unverified")),
    ]);
    finish_result(
        result,
        &document,
        INSPECTION_SCHEMA,
        "RELATIONSHIP_RESULT",
        engine,
        registry,
        caps,
        ctx,
    )
}

/// Copy and validate a lookup identity before a host admits the source operand.
pub fn admit_core_relationship_lookup_identity(
    identity_input: &Value,
    engine: &Engine,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let identity = copy_json(identity_input, ctx)?;
    let schema = schema_value(DECLARATION_SCHEMA, ctx)?;
    if !validate_schema(
        &identity,
        &schema_def(&schema, "lookupIdentity")?,
        engine,
        ctx,
    )? {
        return Err(err(
            "RELATIONSHIP_IDENTITY",
            "Expected stable relationship ID",
            "",
        ));
    }
    Ok(identity)
}

/// Copy and validate a declaration request before a host admits source/identity.
pub fn admit_core_relationship_request(
    request_input: &Value,
    engine: &Engine,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let request = copy_json(request_input, ctx)?;
    let schema = schema_value(DECLARATION_SCHEMA, ctx)?;
    if !validate_schema(&request, &schema_def(&schema, "request")?, engine, ctx)? {
        return Err(err(
            "RELATIONSHIP_REQUEST",
            "Expected complete known authored relationship",
            "",
        ));
    }
    Ok(request)
}

/// Author or update one relationship while retaining unknown qualifiers by identity.
pub fn declare_core_relationship(
    input: &Value,
    identity_input: &Value,
    request_input: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let request = copy_json(request_input, ctx)?;
    let schema = schema_value(DECLARATION_SCHEMA, ctx)?;
    if !validate_schema(&request, &schema_def(&schema, "request")?, engine, ctx)? {
        return Err(err(
            "RELATIONSHIP_REQUEST",
            "Expected complete known authored relationship",
            "",
        ));
    }
    let located = locate(input, identity_input, engine, registry, caps, ctx)?;
    let id = get(&request, "id")
        .and_then(raw)
        .expect("schema-checked request id");
    let old_values = module_relationships(&located.source, located.module_index)
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let index = relationship_index(&old_values, &id, ctx, &located.path)?;
    let old = index.and_then(|i| old_values.get(i));
    let old_path = index.map(|i| format!("{}/{i}", located.path));
    if let Some(old) = old {
        let path = old_path.as_deref().expect("existing index");
        let lifecycle = get(old, "targetLifecycle")
            .and_then(raw)
            .and_then(|s| s.to_utf8().ok())
            .unwrap_or_default();
        if !["owned", "independent", "unspecified"].contains(&lifecycle.as_str()) {
            return Err(err(
                "RELATIONSHIP_UNKNOWN",
                "Future lifecycle cannot be edited",
                "",
            ));
        }
        let endpoints_changed =
            endpoint_set(get(old, "source").unwrap_or(&Value::Null), false, ctx, path)?
                != endpoint_set(
                    get(&request, "source").unwrap_or(&Value::Null),
                    false,
                    ctx,
                    path,
                )?
                || endpoint_set(get(old, "target").unwrap_or(&Value::Null), true, ctx, path)?
                    != endpoint_set(
                        get(&request, "target").unwrap_or(&Value::Null),
                        true,
                        ctx,
                        path,
                    )?;
        let direction_changed = get(old, "directed") != get(&request, "directed");
        let association_changed = association_key(get(old, "associationRecord"))
            != association_key(
                get(&request, "associationRecord").or_else(|| get(old, "associationRecord")),
            );
        if endpoints_changed || direction_changed || association_changed {
            return Err(err(
                "RELATIONSHIP_ID_CONFLICT",
                "Existing ID cannot change association endpoints, target keys, direction or association Record",
                path,
            ));
        }
        if unknown_relationship(&located.diagnostics, path, ctx)? {
            let old_bounds = [
                bounds(get(old, "sourceMultiplicity")),
                bounds(get(old, "targetMultiplicity")),
            ];
            let request_bounds = [
                bounds(get(&request, "sourceMultiplicity")),
                bounds(get(&request, "targetMultiplicity")),
            ];
            if old_bounds != request_bounds
                || get(old, "targetLifecycle") != get(&request, "targetLifecycle")
            {
                return Err(err(
                    "RELATIONSHIP_UNKNOWN",
                    "Unknown qualifiers prevent changing participation or lifecycle meaning",
                    "",
                ));
            }
        }
    }
    let mut next = old.cloned().unwrap_or(Value::Object(vec![]));
    let old_source = get(old.unwrap_or(&Value::Null), "source");
    let old_target = get(old.unwrap_or(&Value::Null), "target");
    let old_source_multiplicity = get(old.unwrap_or(&Value::Null), "sourceMultiplicity");
    let old_target_multiplicity = get(old.unwrap_or(&Value::Null), "targetMultiplicity");
    for name in ["id", "name", "targetLifecycle", "directed"] {
        if let Some(value) = get(&request, name) {
            set(&mut next, name, value.clone())?;
        }
    }
    set(
        &mut next,
        "source",
        merge_endpoint_array(
            get(&request, "source").unwrap(),
            old_source,
            false,
            ctx,
            &located.path,
        )?,
    )?;
    set(
        &mut next,
        "target",
        merge_endpoint_array(
            get(&request, "target").unwrap(),
            old_target,
            true,
            ctx,
            &located.path,
        )?,
    )?;
    set(
        &mut next,
        "sourceMultiplicity",
        merge_object(
            old_source_multiplicity,
            get(&request, "sourceMultiplicity").unwrap(),
            true,
            ctx,
            &located.path,
        )?,
    )?;
    set(
        &mut next,
        "targetMultiplicity",
        merge_object(
            old_target_multiplicity,
            get(&request, "targetMultiplicity").unwrap(),
            true,
            ctx,
            &located.path,
        )?,
    )?;
    if let Some(inverse) = get(&request, "inverse") {
        if matches!(inverse, Value::Null) {
            remove(&mut next, "inverse");
        } else {
            set(&mut next, "inverse", inverse.clone())?;
        }
    }
    if let Some(association) = get(&request, "associationRecord") {
        set(
            &mut next,
            "associationRecord",
            merge_object(
                get(old.unwrap_or(&Value::Null), "associationRecord"),
                association,
                true,
                ctx,
                &located.path,
            )?,
        )?;
    }
    let mut target = copy_json(&located.source, ctx)?;
    let module = target_module_mut(&mut target, located.module_index)?;
    let mut relationships = old_values.clone();
    if let Some(index) = index {
        relationships[index] = next;
    } else {
        relationships.push(next);
    }
    set(module, "relationships", Value::Array(relationships))?;
    let validation = engine.validate_document(&target, registry, caps, ctx)?;
    if !validation.valid {
        let message = crate::serialization::stringify_compact_metered(
            &diagnostics_value(validation.diagnostics),
            ctx,
        )?
        .to_utf8()
        .unwrap_or_default();
        return Err(err("RELATIONSHIP_CONFLICT", message, ""));
    }
    let ideal_index = index.unwrap_or(old_values.len());
    let document = target.clone();
    let result = obj(vec![
        ("operation", t("declare-core-relationship")),
        ("version", t("1.0.0")),
        ("source", located.source),
        ("target", target),
        ("identity", located.identity),
        ("request", request),
        (
            "provenance",
            obj(vec![
                ("origin", t("authored")),
                ("idealPath", t(&format!("{}/{ideal_index}", located.path))),
                ("basis", t("explicit-author-declaration")),
                ("nativePath", Value::Null),
            ]),
        ),
    ]);
    finish_result(
        result,
        &document,
        DECLARATION_SCHEMA,
        "RELATIONSHIP_RESULT",
        engine,
        registry,
        caps,
        ctx,
    )
}

/// Recompute a retained operation and compare the current source or target snapshot.
pub fn verify_core_relationship_operation(
    receipt: &Value,
    current: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let receipt = prepare_core_relationship_verification(receipt, engine, registry, caps, ctx)?;
    finish_core_relationship_verification(&receipt, current, ctx)
}

/// Validate and recompute a receipt before the host admits the current operand.
pub fn prepare_core_relationship_verification(
    receipt: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let receipt = copy_json(receipt, ctx)?;
    let schema_text = if eq(get(&receipt, "version"), "3.0.0") {
        INSPECTION_SCHEMA
    } else {
        DECLARATION_SCHEMA
    };
    let schema = schema_value(schema_text, ctx)?;
    if !validate_schema(&receipt, &schema, engine, ctx)? {
        return Err(err(
            "RELATIONSHIP_RECEIPT",
            "Malformed relationship operation",
            "",
        ));
    }
    let operation = get(&receipt, "operation")
        .and_then(raw)
        .and_then(|s| s.to_utf8().ok())
        .unwrap_or_default();
    let source = get(&receipt, "source").ok_or_else(|| {
        err(
            "RELATIONSHIP_RECEIPT",
            "Malformed relationship operation",
            "",
        )
    })?;
    let identity = get(&receipt, "identity").ok_or_else(|| {
        err(
            "RELATIONSHIP_RECEIPT",
            "Malformed relationship operation",
            "",
        )
    })?;
    let expected = match operation.as_str() {
        "declare-core-relationship" => declare_core_relationship(
            source,
            identity,
            get(&receipt, "request").ok_or_else(|| {
                err(
                    "RELATIONSHIP_RECEIPT",
                    "Malformed relationship operation",
                    "",
                )
            })?,
            engine,
            registry,
            caps,
            ctx,
        )?,
        "lookup-core-relationship" => {
            lookup_core_relationship(source, identity, engine, registry, caps, ctx)?
        }
        "inspect-core-relationships" => {
            inspect_core_relationships(source, identity, engine, registry, caps, ctx)?
        }
        _ => {
            return Err(err(
                "RELATIONSHIP_RECEIPT",
                "Malformed relationship operation",
                "",
            ));
        }
    };
    if !canonical_equal(&expected, &receipt, ctx, &Utf16::default())? {
        return Err(err(
            "RELATIONSHIP_RECEIPT",
            "Operation differs from retained source/request",
            "",
        ));
    }
    Ok(receipt.clone())
}

/// Compare a previously validated private receipt with the admitted current snapshot.
pub fn finish_core_relationship_verification(
    receipt: &Value,
    current: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let selected = get(&receipt, "target")
        .or_else(|| get(&receipt, "source"))
        .expect("validated operation source");
    let current = copy_json(current, ctx)?;
    if !canonical_equal(selected, &current, ctx, &Utf16::default())? {
        return Err(err(
            "RELATIONSHIP_STALE",
            "Current document changed after operation",
            "",
        ));
    }
    Ok(receipt.clone())
}
