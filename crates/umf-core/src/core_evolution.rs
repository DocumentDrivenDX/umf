// SPDX-License-Identifier: MIT OR Apache-2.0
//! Opt-in source-preservation analysis for current core 0.10.0 documents.
//!
//! The public profile spelling is retained for predecessor compatibility. The
//! current-source 0.10.0 admission differs from CONTRACT-058's draft 0.8.0
//! precondition; callers must not treat this module as closing that divergence.
use crate::{
    context::Context,
    engine::{Capabilities, Engine},
    error::{Diagnostic, EngineError, Severity, Validation},
    record_values::validate_core_record_values,
    registry::Registry,
    schema::CompiledSchema,
    value::{copy_json, Utf16, Value},
};
use std::collections::{BTreeMap, BTreeSet};

const PROFILE: &str = "core-0.8-absent-string-additions/0.1";
const RECEIPT_SCHEMA: &str = include_str!("../../../spec/core/evolution-operation.schema.json");
const RECORD_SCHEMA: &str = include_str!("../../../spec/core/dataset-value-operation.schema.json");
const KEY_SCHEMA: &str = include_str!("../../../spec/core/key-tuple-operation-v4.schema.json");

fn k(s: &str) -> Utf16 {
    Utf16::from(s)
}
fn s(s: &str) -> Value {
    Value::string_utf8(s)
}
fn obj(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(key, value)| (k(key), value))
            .collect(),
    )
}
/// Charge the maximum number of member comparisons before scanning an object.
/// The match may be early, but `fields.len()` is a conservative bound on the
/// actual linear search and charges absent-key lookups fully.
fn get<'a>(
    value: &'a Value,
    name: &str,
    ctx: &mut Context<'_>,
    admission: &mut Admission,
    path: &str,
) -> Result<Option<&'a Value>, EngineError> {
    match value {
        Value::Object(fields) => {
            charge_budget(ctx, admission, fields.len(), path)?;
            Ok(fields
                .iter()
                .find(|(key, _)| key == &k(name))
                .map(|(_, value)| value))
        }
        _ => Ok(None),
    }
}
fn lookup_mut<'a>(
    value: &'a mut Value,
    name: &str,
    ctx: &mut Context<'_>,
    admission: &mut Admission,
    path: &str,
) -> Result<Option<&'a mut Value>, EngineError> {
    match value {
        Value::Object(fields) => {
            charge_budget(ctx, admission, fields.len(), path)?;
            Ok(fields
                .iter_mut()
                .find(|(key, _)| key == &k(name))
                .map(|(_, value)| value))
        }
        _ => Ok(None),
    }
}
fn text(value: Option<&Value>) -> Option<&Utf16> {
    if let Some(Value::String(s)) = value {
        Some(s)
    } else {
        None
    }
}
fn arr(value: Option<&Value>) -> Option<&[Value]> {
    if let Some(Value::Array(a)) = value {
        Some(a)
    } else {
        None
    }
}
fn error(code: &str, message: &str, path: &str) -> EngineError {
    EngineError::new(code, k(path), message)
}
fn charge(ctx: &mut Context<'_>, n: usize, path: &str) -> Result<(), EngineError> {
    ctx.charge_work(n, k(path))?;
    ctx.check_cancelled(k(path))
}

const MAX_INPUT_VALUES: usize = 100_000;
const MAX_INPUT_JSON_BYTES: usize = 4_000_000;
const MAX_SEMANTIC_WORK: usize = 1_000_000;
#[derive(Default)]
struct Admission {
    values: usize,
    bytes: usize,
    work: usize,
}
fn charge_budget(
    ctx: &mut Context<'_>,
    a: &mut Admission,
    amount: usize,
    path: &str,
) -> Result<(), EngineError> {
    a.work = a
        .work
        .checked_add(amount)
        .ok_or_else(|| error("LIMIT", "Evolution semantic work limit exceeded", path))?;
    if a.work > MAX_SEMANTIC_WORK {
        return Err(error(
            "LIMIT",
            "Evolution semantic work limit exceeded",
            path,
        ));
    }
    charge(ctx, amount, path)
}
fn set_contains(
    set: &BTreeSet<Utf16>,
    value: &Utf16,
    ctx: &mut Context<'_>,
    admission: &mut Admission,
    path: &str,
) -> Result<bool, EngineError> {
    let cost = (set.len().saturating_add(1) as f64).log2().ceil() as usize;
    charge_budget(ctx, admission, cost.max(1), path)?;
    Ok(set.contains(value))
}
fn reference_contains(
    set: &BTreeSet<(Utf16, Utf16)>,
    value: &(Utf16, Utf16),
    ctx: &mut Context<'_>,
    admission: &mut Admission,
    path: &str,
) -> Result<bool, EngineError> {
    let cost = (set.len().saturating_add(1) as f64).log2().ceil() as usize;
    charge_budget(ctx, admission, cost.max(1), path)?;
    Ok(set.contains(value))
}
fn add(admission: &mut Admission, amount: usize) -> Result<(), EngineError> {
    admission.bytes = admission
        .bytes
        .checked_add(amount)
        .ok_or_else(|| error("LIMIT", "Evolution aggregate source limit exceeded", ""))?;
    if admission.bytes > MAX_INPUT_JSON_BYTES {
        return Err(error(
            "LIMIT",
            "Evolution aggregate source limit exceeded",
            "",
        ));
    }
    Ok(())
}
fn string_json_bytes(value: &Utf16) -> usize {
    let units = value.units();
    let mut total = 2usize;
    let mut i = 0;
    while i < units.len() {
        let u = units[i];
        total = total.saturating_add(match u {
            0x22 | 0x5c => 2,
            0..=0x1f => 6,
            0xd800..=0xdbff
                if units
                    .get(i + 1)
                    .is_some_and(|v| (0xdc00..=0xdfff).contains(v)) =>
            {
                i += 1;
                4
            }
            0xd800..=0xdfff => 6,
            _ if u <= 0x7f => 1,
            _ if u <= 0x7ff => 2,
            _ => 3,
        });
        i += 1;
    }
    total
}
fn preflight_one(
    value: &Value,
    ctx: &mut Context<'_>,
    admission: &mut Admission,
) -> Result<(), EngineError> {
    fn visit(
        value: &Value,
        depth: usize,
        ctx: &mut Context<'_>,
        a: &mut Admission,
    ) -> Result<(), EngineError> {
        a.values = a.values.saturating_add(1);
        if a.values > MAX_INPUT_VALUES {
            return Err(error(
                "LIMIT",
                "Evolution aggregate value limit exceeded",
                "",
            ));
        }
        if depth > 128 {
            return Err(error("LIMIT", "Evolution nesting depth exceeded", ""));
        }
        charge_budget(ctx, a, 1, "")?;
        match value {
            Value::Null => add(a, 4)?,
            Value::Bool(true) => add(a, 4)?,
            Value::Bool(false) => add(a, 5)?,
            Value::Number(number) => add(a, crate::value::ecma_number_to_string(*number).len())?,
            Value::String(text) => {
                add(a, string_json_bytes(text))?;
            }
            Value::Array(items) => {
                add(a, 2usize.saturating_add(items.len().saturating_sub(1)))?;
                for item in items {
                    visit(item, depth + 1, ctx, a)?;
                }
            }
            Value::Object(items) => {
                add(a, 2usize.saturating_add(items.len().saturating_sub(1)))?;
                for (key, item) in items {
                    charge_budget(ctx, a, key.len().saturating_add(1), "")?;
                    add(a, string_json_bytes(key))?;
                    add(a, 1)?;
                    visit(item, depth + 1, ctx, a)?;
                }
            }
        }
        Ok(())
    }
    visit(value, 0, ctx, admission)
}

fn canonical_equal(
    a: &Value,
    b: &Value,
    ctx: &mut Context<'_>,
    admission: &mut Admission,
    path: &str,
) -> Result<bool, EngineError> {
    charge_budget(ctx, admission, 1, path)?;
    match (a, b) {
        (Value::Array(x), Value::Array(y)) => {
            if x.len() != y.len() {
                return Ok(false);
            }
            for (i, (left, right)) in x.iter().zip(y).enumerate() {
                if !canonical_equal(left, right, ctx, admission, &format!("{path}/{i}"))? {
                    return Ok(false);
                }
            }
            Ok(true)
        }
        (Value::Object(x), Value::Object(y)) => {
            if x.len() != y.len() {
                return Ok(false);
            }
            let cost = (x.len().saturating_add(1) as f64).log2().ceil() as usize;
            charge_budget(
                ctx,
                admission,
                x.len().saturating_add(y.len()).saturating_mul(cost.max(1)),
                path,
            )?;
            let mut left = BTreeMap::new();
            let mut right = BTreeMap::new();
            for (key, value) in x {
                if left.insert(key, value).is_some() {
                    return Ok(false);
                }
            }
            for (key, value) in y {
                if right.insert(key, value).is_some() {
                    return Ok(false);
                }
            }
            if left.keys().ne(right.keys()) {
                return Ok(false);
            }
            for ((_, left), (_, right)) in left.iter().zip(right.iter()) {
                if !canonical_equal(left, right, ctx, admission, path)? {
                    return Ok(false);
                }
            }
            Ok(true)
        }
        _ => Ok(a == b),
    }
}
fn validation_value(validation: &Validation) -> Value {
    let diagnostics = validation
        .diagnostics
        .iter()
        .map(|d| {
            obj(vec![
                ("code", Value::String(d.code.clone())),
                ("path", Value::String(d.path.clone())),
                ("message", Value::String(d.message.clone())),
                (
                    "severity",
                    s(match d.severity {
                        Severity::Error => "error",
                        Severity::Warning => "warning",
                    }),
                ),
            ])
        })
        .collect();
    obj(vec![
        ("valid", Value::Bool(validation.valid)),
        ("complete", Value::Bool(validation.complete)),
        ("diagnostics", Value::Array(diagnostics)),
    ])
}
fn no_capabilities() -> impl Capabilities {
    struct None;
    impl Capabilities for None {
        fn validate_extension(
            &mut self,
            _: u64,
            _: &Value,
            _: &crate::engine::SemanticContext,
        ) -> Result<Vec<Diagnostic>, Utf16> {
            Ok(Vec::new())
        }
    }
    None
}
fn source_validation(
    engine: &Engine,
    source: &Value,
    ctx: &mut Context<'_>,
    admission: &mut Admission,
) -> Result<Validation, EngineError> {
    if text(get(source, "umf", ctx, admission, "/umf")?) != Some(&k("0.10.0")) {
        return Err(error(
            "CORE_DATASET_SOURCE",
            "Valid current core 0.10.0 source required",
            "",
        ));
    }
    let mut caps = no_capabilities();
    let validation = engine.validate_document(source, &Registry::default(), &mut caps, ctx)?;
    if !validation.valid {
        return Err(error(
            "CORE_DATASET_SOURCE",
            "Valid current core 0.10.0 source required",
            "",
        ));
    }
    Ok(validation)
}
fn compile_receipt_schema(
    engine: &Engine,
    ctx: &mut Context<'_>,
) -> Result<CompiledSchema, EngineError> {
    let mut resources = engine.schema_resources_with_context(ctx)?;
    let schema_value = crate::serialization::read_json_value(
        &RECEIPT_SCHEMA.encode_utf16().collect::<Vec<_>>(),
        crate::serialization::Format::Json,
        ctx,
    )?;
    let record_schema = crate::serialization::read_json_value(
        &RECORD_SCHEMA.encode_utf16().collect::<Vec<_>>(),
        crate::serialization::Format::Json,
        ctx,
    )?;
    let key_schema = crate::serialization::read_json_value(
        &KEY_SCHEMA.encode_utf16().collect::<Vec<_>>(),
        crate::serialization::Format::Json,
        ctx,
    )?;
    resources.entries.push((
        k("urn:umf:core:dataset-value-operation:1.0.0"),
        record_schema,
    ));
    resources
        .entries
        .push((k("urn:umf:core:key-tuple-operation:4.0.0"), key_schema));
    CompiledSchema::compile(&schema_value, &resources, ctx)
}
fn field_addition(
    field: &Value,
    old_ids: &BTreeSet<Utf16>,
    ctx: &mut Context<'_>,
    admission: &mut Admission,
) -> Result<bool, EngineError> {
    if text(get(field, "kind", ctx, admission, "/field/kind")?) != Some(&k("field"))
        || text(get(field, "scalarType", ctx, admission, "/field/scalarType")?)
            != Some(&k("string"))
        || text(get(field, "cardinality", ctx, admission, "/field/cardinality")?)
            != Some(&k("one"))
        || text(get(field, "nullability", ctx, admission, "/field/nullability")?)
            != Some(&k("absent-allowed"))
    {
        return Ok(false);
    }
    let Some(Value::String(id)) = get(field, "id", ctx, admission, "/field/id")? else {
        return Ok(false);
    };
    let cost = (old_ids.len().saturating_add(1) as f64).log2().ceil() as usize;
    charge_budget(ctx, admission, cost.max(1), "/modules/elements/id")?;
    if old_ids.contains(id) {
        return Ok(false);
    }
    let Value::Object(fields) = field else {
        return Ok(false);
    };
    let allowed = [
        "id",
        "name",
        "kind",
        "scalarType",
        "cardinality",
        "nullability",
        "extensions",
    ];
    if fields
        .iter()
        .any(|(name, _)| !allowed.iter().any(|x| name == &k(x)))
    {
        return Ok(false);
    }
    let empty = Value::Object(vec![]);
    canonical_equal(
        get(field, "extensions", ctx, admission, "/field/extensions")?.unwrap_or(&empty),
        &empty,
        ctx,
        admission,
        "/extensions",
    )
}
fn record_change(
    changes: &mut Vec<Value>,
    residuals: &mut Vec<Value>,
    breaking: &mut bool,
    kind: &str,
    before_path: Option<&str>,
    after_path: Option<&str>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    charge(ctx, 1, "/changes")?;
    changes.push(obj(vec![
        ("kind", s(kind)),
        ("beforePath", before_path.map(s).unwrap_or(Value::Null)),
        ("afterPath", after_path.map(s).unwrap_or(Value::Null)),
    ]));
    residuals.push(s(&format!(
        "Existing definition or unsupported structure differs: {}",
        after_path.or(before_path).unwrap_or("")
    )));
    if kind != "unsupported-change" {
        *breaking = true;
    }
    Ok(())
}

/// Inspect a closed candidate subset. Existing unknown source content is copied
/// into the result and forces `unsupported`, never discarded as a false claim.
fn inspect_core_evolution_admitted(
    engine: &Engine,
    before_input: &Value,
    after_input: &Value,
    policy_input: &Value,
    ctx: &mut Context<'_>,
    admission: &mut Admission,
    preflight_inputs: bool,
) -> Result<Value, EngineError> {
    if preflight_inputs {
        preflight_one(policy_input, ctx, admission)?;
        preflight_one(before_input, ctx, admission)?;
        preflight_one(after_input, ctx, admission)?;
    }
    let policy = copy_json(policy_input, ctx)?;
    if !matches!(&policy, Value::Object(fields) if fields.len() == 1 && fields[0].0 == k("profile") && text(Some(&fields[0].1)) == Some(&k(PROFILE)))
    {
        return Err(error(
            "CORE_EVOLUTION_POLICY",
            "Explicit bounded evolution profile required",
            "",
        ));
    }
    let before = copy_json(before_input, ctx)?;
    let after = copy_json(after_input, ctx)?;
    let before_validation = source_validation(engine, &before, ctx, admission)?;
    let after_validation = source_validation(engine, &after, ctx, admission)?;
    let before_modules = arr(get(&before, "modules", ctx, admission, "/modules")?).ok_or_else(|| {
        error(
            "CORE_DATASET_SOURCE",
            "Valid current core 0.10.0 source required",
            "",
        )
    })?;
    let after_modules = arr(get(&after, "modules", ctx, admission, "/modules")?).ok_or_else(|| {
        error(
            "CORE_DATASET_SOURCE",
            "Valid current core 0.10.0 source required",
            "",
        )
    })?;
    let mut stripped = copy_json(&after, ctx)?;
    let stripped_modules = match lookup_mut(&mut stripped, "modules", ctx, admission, "/modules")? {
        Some(Value::Array(a)) => a,
        _ => {
            return Err(error(
                "CORE_DATASET_SOURCE",
                "Valid current core 0.10.0 source required",
                "",
            ));
        }
    };
    let mut changes = Vec::new();
    let mut presence_checks = Vec::new();
    let mut residuals = Vec::new();
    let mut breaking = false;
    if before_modules.len() > after_modules.len() {
        record_change(
            &mut changes,
            &mut residuals,
            &mut breaking,
            "removed-definition",
            Some("/modules"),
            None,
            ctx,
        )?;
    }
    if !canonical_equal(
        get(&before, "id", ctx, admission, "/id")?.unwrap_or(&Value::Null),
        get(&after, "id", ctx, admission, "/id")?.unwrap_or(&Value::Null),
        ctx,
        admission,
        "/id",
    )? || !canonical_equal(
        get(&before, "umf", ctx, admission, "/umf")?.unwrap_or(&Value::Null),
        get(&after, "umf", ctx, admission, "/umf")?.unwrap_or(&Value::Null),
        ctx,
        admission,
        "/umf",
    )? {
        record_change(
            &mut changes,
            &mut residuals,
            &mut breaking,
            "changed-definition",
            Some("/id"),
            Some("/id"),
            ctx,
        )?;
    }
    for (mi, bm) in before_modules.iter().enumerate() {
        charge(ctx, 1, "/modules")?;
        let Some(am) = after_modules.get(mi) else {
            record_change(
                &mut changes,
                &mut residuals,
                &mut breaking,
                "removed-definition",
                Some(&format!("/modules/{mi}")),
                None,
                ctx,
            )?;
            continue;
        };
        if get(bm, "id", ctx, admission, "/modules/id")?
            != get(am, "id", ctx, admission, "/modules/id")?
        {
            record_change(
                &mut changes,
                &mut residuals,
                &mut breaking,
                "removed-definition",
                Some(&format!("/modules/{mi}")),
                Some(&format!("/modules/{mi}")),
                ctx,
            )?;
            continue;
        }
        let empty_relationships = Value::Array(vec![]);
        let brels = get(bm, "relationships", ctx, admission, "/relationships")?
            .unwrap_or(&empty_relationships);
        let arels = get(am, "relationships", ctx, admission, "/relationships")?
            .unwrap_or(&empty_relationships);
        if !canonical_equal(
            brels,
            arels,
            ctx,
            admission,
            &format!("/modules/{mi}/relationships"),
        )? {
            record_change(
                &mut changes,
                &mut residuals,
                &mut breaking,
                "changed-definition",
                Some(&format!("/modules/{mi}/relationships")),
                Some(&format!("/modules/{mi}/relationships")),
                ctx,
            )?;
        }
        let be = arr(get(bm, "elements", ctx, admission, "/modules/elements")?).ok_or_else(|| {
            error(
                "CORE_DATASET_SOURCE",
                "Valid current core 0.10.0 source required",
                "",
            )
        })?;
        let ae = arr(get(am, "elements", ctx, admission, "/modules/elements")?).ok_or_else(|| {
            error(
                "CORE_DATASET_SOURCE",
                "Valid current core 0.10.0 source required",
                "",
            )
        })?;
        let mut ids = BTreeSet::<Utf16>::new();
        for e in be {
            if let Some(Value::String(id)) = get(e, "id", ctx, admission, "/elements/id")? {
                let cost = (ids.len().saturating_add(1) as f64).log2().ceil() as usize;
                charge_budget(ctx, admission, cost.max(1), "/modules/elements/id")?;
                ids.insert(id.clone());
            }
        }
        let mut additions = BTreeSet::<Utf16>::new();
        let mut used_fields = BTreeSet::<Utf16>::new();
        let mut used_references = BTreeSet::<(Utf16, Utf16)>::new();
        for (ai, field) in ae.iter().enumerate().skip(be.len()) {
            charge(ctx, 1, "/modules")?;
            if field_addition(field, &ids, ctx, admission)? {
                if let Some(Value::String(id)) = get(field, "id", ctx, admission, "/elements/id")? {
                    additions.insert(id.clone());
                }
            } else {
                let kind = if text(get(field, "kind", ctx, admission, "/field/kind")?)
                    == Some(&k("field"))
                    && text(get(field, "nullability", ctx, admission, "/field/nullability")?)
                        == Some(&k("required"))
                {
                    "changed-definition"
                } else {
                    "unsupported-change"
                };
                record_change(
                    &mut changes,
                    &mut residuals,
                    &mut breaking,
                    kind,
                    None,
                    Some(&format!("/modules/{mi}/elements/{ai}")),
                    ctx,
                )?;
            }
        }
        for (ei, old) in be.iter().enumerate() {
            charge(ctx, 1, "/modules")?;
            let Some(next) = ae.get(ei) else {
                record_change(
                    &mut changes,
                    &mut residuals,
                    &mut breaking,
                    "removed-definition",
                    Some(&format!("/modules/{mi}/elements/{ei}")),
                    None,
                    ctx,
                )?;
                continue;
            };
            if get(old, "id", ctx, admission, "/elements/id")?
                != get(next, "id", ctx, admission, "/elements/id")?
            {
                record_change(
                    &mut changes,
                    &mut residuals,
                    &mut breaking,
                    "removed-definition",
                    Some(&format!("/modules/{mi}/elements/{ei}")),
                    None,
                    ctx,
                )?;
                continue;
            }
            if text(get(old, "kind", ctx, admission, "/elements/kind")?) == Some(&k("field")) {
                for name in [
                    "kind",
                    "scalarType",
                    "cardinality",
                    "nullability",
                    "facets",
                    "default",
                ] {
                    let null = Value::Null;
                    if !canonical_equal(
                        get(old, name, ctx, admission, "/elements/field")?.unwrap_or(&null),
                        get(next, name, ctx, admission, "/elements/field")?.unwrap_or(&null),
                        ctx,
                        admission,
                        &format!("/modules/{mi}/elements/{ei}/{name}"),
                    )? {
                        record_change(
                            &mut changes,
                            &mut residuals,
                            &mut breaking,
                            "changed-definition",
                            Some(&format!("/modules/{mi}/elements/{ei}")),
                            Some(&format!("/modules/{mi}/elements/{ei}")),
                            ctx,
                        )?;
                        break;
                    }
                }
            }
            if text(get(old, "kind", ctx, admission, "/elements/kind")?) == Some(&k("record")) {
                let null = Value::Null;
                if !canonical_equal(
                    get(old, "keys", ctx, admission, "/elements/keys")?.unwrap_or(&null),
                    get(next, "keys", ctx, admission, "/elements/keys")?.unwrap_or(&null),
                    ctx,
                    admission,
                    "/keys",
                )? {
                    record_change(
                        &mut changes,
                        &mut residuals,
                        &mut breaking,
                        "changed-definition",
                        Some(&format!("/modules/{mi}/elements/{ei}/keys")),
                        Some(&format!("/modules/{mi}/elements/{ei}/keys")),
                        ctx,
                    )?;
                }
                if let (Some(om), Some(nm)) = (
                    arr(get(old, "members", ctx, admission, "/elements/members")?),
                    arr(get(next, "members", ctx, admission, "/elements/members")?),
                )
                {
                    if nm.len() < om.len()
                        || !canonical_equal(
                            &Value::Array(om.to_vec()),
                            &Value::Array(nm.iter().take(om.len()).cloned().collect()),
                            ctx,
                            admission,
                            "/members",
                        )?
                    {
                        record_change(
                            &mut changes,
                            &mut residuals,
                            &mut breaking,
                            "changed-definition",
                            Some(&format!("/modules/{mi}/elements/{ei}/members")),
                            Some(&format!("/modules/{mi}/elements/{ei}/members")),
                            ctx,
                        )?;
                    }
                    for (si, reference) in nm.iter().enumerate().skip(om.len()) {
                        charge(ctx, 1, "/members")?;
                        let module = get(reference, "module", ctx, admission, "/members/module")?
                            .and_then(|x| text(Some(x)));
                        let element = get(reference, "element", ctx, admission, "/members/element")?
                            .and_then(|x| text(Some(x)));
                        let admitted = if let Some(id) = element {
                            set_contains(&additions, id, ctx, admission, "/modules/elements/id")?
                        } else {
                            false
                        };
                        let record_id = text(get(old, "id", ctx, admission, "/elements/id")?)
                            .cloned()
                            .unwrap_or_default();
                        let reference_key = element.map(|id| (record_id.clone(), id.clone()));
                        let already_used = if let Some(key) = &reference_key {
                            reference_contains(
                                &used_references,
                                key,
                                ctx,
                                admission,
                                "/modules/elements/id",
                            )?
                        } else {
                            false
                        };
                        if module != text(get(bm, "id", ctx, admission, "/modules/id")?)
                            || !admitted
                            || already_used
                        {
                            record_change(
                                &mut changes,
                                &mut residuals,
                                &mut breaking,
                                "unsupported-change",
                                None,
                                Some(&format!("/modules/{mi}/elements/{ei}/members")),
                                ctx,
                            )?;
                            continue;
                        }
                        let element = element.unwrap();
                        used_fields.insert(element.clone());
                        used_references.insert((record_id, element.clone()));
                        let identity = obj(vec![
                            (
                                "module",
                                get(bm, "id", ctx, admission, "/modules/id")?
                                    .cloned()
                                    .unwrap_or(Value::Null),
                            ),
                            (
                                "element",
                                get(old, "id", ctx, admission, "/elements/id")?
                                    .cloned()
                                    .unwrap_or(Value::Null),
                            ),
                        ]);
                        let values = Value::Array(vec![obj(vec![
                            ("field", reference.clone()),
                            ("state", s("absent")),
                        ])]);
                        let check =
                            validate_core_record_values(engine, &after, &identity, &values, ctx)?;
                        let mut field_validation = None;
                        if let Some(fields) = arr(get(&check, "fields", ctx, admission, "/fields")?) {
                            for row in fields {
                                let Some(field) = get(row, "field", ctx, admission, "/fields/field")? else {
                                    continue;
                                };
                                let field_module = get(field, "module", ctx, admission, "/fields/module")?;
                                let reference_module = get(reference, "module", ctx, admission, "/members/module")?;
                                if field_module == reference_module {
                                    let field_element = get(field, "element", ctx, admission, "/fields/element")?;
                                    let reference_element = get(reference, "element", ctx, admission, "/members/element")?;
                                    if field_element == reference_element {
                                        field_validation = get(row, "validation", ctx, admission, "/fields/validation")?;
                                        break;
                                    }
                                }
                            }
                        }
                        let field_valid = match field_validation {
                            Some(validation) => get(validation, "valid", ctx, admission, "/fields/valid")?,
                            None => None,
                        };
                        let field_complete = match field_validation {
                            Some(validation) => get(validation, "complete", ctx, admission, "/fields/complete")?,
                            None => None,
                        };
                        if field_valid != Some(&Value::Bool(true))
                            || field_complete != Some(&Value::Bool(true)) {
                            record_change(
                                &mut changes,
                                &mut residuals,
                                &mut breaking,
                                "changed-definition",
                                None,
                                Some(&format!("/modules/{mi}/elements/{ei}/members")),
                                ctx,
                            )?;
                        }
                        presence_checks.push(check);
                        changes.push(obj(vec![
                            ("kind", s("added-absent-string")),
                            ("beforePath", Value::Null),
                            (
                                "afterPath",
                                s(&format!("/modules/{mi}/elements/{ei}/members/{si}")),
                            ),
                        ]));
                    }
                    if let Some(module) = stripped_modules.get_mut(mi) {
                        if let Some(elements) =
                            lookup_mut(module, "elements", ctx, admission, "/modules/elements")?
                        {
                            if let Value::Array(elements) = elements {
                                if let Some(record) = elements.get_mut(ei) {
                                    if let Some(Value::Array(members)) = lookup_mut(
                                        record,
                                        "members",
                                        ctx,
                                        admission,
                                        "/elements/members",
                                    )? {
                                        members.truncate(om.len());
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        for id in &additions {
            if !set_contains(&used_fields, id, ctx, admission, "/modules/elements/id")? {
                record_change(
                    &mut changes,
                    &mut residuals,
                    &mut breaking,
                    "unsupported-change",
                    None,
                    Some(&format!("/modules/{mi}/elements")),
                    ctx,
                )?;
            }
        }
        if let Some(module) = stripped_modules.get_mut(mi) {
            if let Some(Value::Array(elements)) =
                lookup_mut(module, "elements", ctx, admission, "/modules/elements")?
            {
                elements.truncate(be.len());
            }
        }
    }
    if !canonical_equal(&before, &stripped, ctx, admission, "/")? {
        record_change(
            &mut changes,
            &mut residuals,
            &mut breaking,
            "unsupported-change",
            Some("/"),
            Some("/"),
            ctx,
        )?;
    }
    if !before_validation.complete || !after_validation.complete {
        residuals.push(s("Unknown retained source meaning is not classified"));
    }
    let classification = if breaking {
        "breaking"
    } else if !residuals.is_empty() {
        "unsupported"
    } else {
        "preserved"
    };
    let diagnostics = before_validation
        .diagnostics
        .iter()
        .chain(&after_validation.diagnostics)
        .map(|d| {
            obj(vec![
                ("code", Value::String(d.code.clone())),
                ("path", Value::String(d.path.clone())),
                ("message", Value::String(d.message.clone())),
                (
                    "severity",
                    s(match d.severity {
                        Severity::Error => "error",
                        Severity::Warning => "warning",
                    }),
                ),
            ])
        })
        .collect();
    let mut fields = vec![
        ("operation", s("inspect-core-evolution")),
        ("version", s("1.0.0")),
        ("profile", s(PROFILE)),
        ("before", before),
        ("after", after),
        ("beforeValidation", validation_value(&before_validation)),
        ("afterValidation", validation_value(&after_validation)),
        ("classification", s(classification)),
        ("complete", Value::Bool(classification == "preserved")),
        ("changes", Value::Array(changes)),
        ("presenceChecks", Value::Array(presence_checks)),
        ("diagnostics", Value::Array(diagnostics)),
        ("residuals", Value::Array(residuals)),
    ];
    let result = Value::Object(
        fields
            .drain(..)
            .map(|(name, value)| (k(name), value))
            .collect(),
    );
    preflight_one(&result, ctx, admission)?;
    if !compile_receipt_schema(engine, ctx)?
        .validate(&result, ctx)?
        .is_empty()
    {
        return Err(error(
            "CORE_EVOLUTION_RESULT",
            "Closed evolution result required",
            "",
        ));
    }
    copy_json(&result, ctx)
}

pub fn inspect_core_evolution(
    engine: &Engine,
    before_input: &Value,
    after_input: &Value,
    policy_input: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let mut admission = Admission::default();
    inspect_core_evolution_admitted(
        engine,
        before_input,
        after_input,
        policy_input,
        ctx,
        &mut admission,
        true,
    )
}

/// Verify a closed receipt by validating its versioned schema and recomputing
/// it from independently supplied before/after/policy inputs in this Context.
pub fn verify_core_evolution(
    receipt_input: &Value,
    before: &Value,
    after: &Value,
    policy: &Value,
    engine: &Engine,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let mut admission = Admission::default();
    preflight_one(receipt_input, ctx, &mut admission)?;
    preflight_one(before, ctx, &mut admission)?;
    preflight_one(after, ctx, &mut admission)?;
    preflight_one(policy, ctx, &mut admission)?;
    let receipt = copy_json(receipt_input, ctx)?;
    let compiled = compile_receipt_schema(engine, ctx)?;
    if !compiled.validate(&receipt, ctx)?.is_empty() {
        return Err(error(
            "CORE_EVOLUTION_RECEIPT",
            "Closed original receipt required",
            "",
        ));
    }
    let expected =
        inspect_core_evolution_admitted(engine, before, after, policy, ctx, &mut admission, false)?;
    preflight_one(&expected, ctx, &mut admission)?;
    if !canonical_equal(&receipt, &expected, ctx, &mut admission, "/receipt")? {
        return Err(error(
            "CORE_EVOLUTION_RECEIPT",
            "Original expected inputs or complete result differ",
            "",
        ));
    }
    Ok(expected)
}
