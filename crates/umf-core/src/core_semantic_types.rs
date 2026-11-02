// SPDX-License-Identifier: MIT OR Apache-2.0
//! Opt-in CONTRACT-078 core semantic type declaration operations.
//! Vocabulary definitions remain opaque; trusted validators run only through an explicit,
//! invocation-scoped cooperative capability.
use crate::{
    context::Context,
    engine::{Capabilities, CapabilityError, Engine},
    error::{EngineError, Severity},
    registry::Registry,
    value::{Utf16, Value, copy_json},
};

const OPERATION_SCHEMA: &str =
    include_str!("../../../spec/core/semantic-types-operation.schema.json");

fn key(s: &str) -> Utf16 {
    Utf16::from(s)
}
fn string(s: &str) -> Value {
    Value::string_utf8(s)
}
fn object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(fields.into_iter().map(|(k, v)| (key(k), v)).collect())
}
fn get<'a>(v: &'a Value, n: &str) -> Option<&'a Value> {
    match v {
        Value::Object(m) => m.iter().find(|(k, _)| k == &key(n)).map(|(_, v)| v),
        _ => None,
    }
}
fn get_mut<'a>(v: &'a mut Value, n: &str) -> Option<&'a mut Value> {
    match v {
        Value::Object(m) => m.iter_mut().find(|(k, _)| k == &key(n)).map(|(_, v)| v),
        _ => None,
    }
}
fn charge_fields(value: &Value, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    if let Value::Object(fields) = value {
        ctx.charge_work(fields.len(), Utf16::default())?;
    }
    Ok(())
}
fn text(v: Option<&Value>) -> Option<Utf16> {
    match v {
        Some(Value::String(s)) => Some(s.clone()),
        _ => None,
    }
}
fn set(v: &mut Value, n: &str, next: Value) {
    if let Value::Object(m) = v {
        if let Some((_, old)) = m.iter_mut().find(|(k, _)| k == &key(n)) {
            *old = next;
        } else {
            m.push((key(n), next));
        }
    }
}
fn remove(v: &mut Value, n: &str) {
    if let Value::Object(m) = v {
        m.retain(|(k, _)| k != &key(n));
    }
}
fn err(code: &str, message: impl Into<String>, path: &str) -> EngineError {
    EngineError::new(code, key(path), message.into())
}
fn diagnostics_value(
    ds: &[crate::error::Diagnostic],
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let mut out = Vec::with_capacity(ds.len());
    for d in ds {
        ctx.charge_work(
            4usize
                .saturating_add(d.code.len())
                .saturating_add(d.path.len())
                .saturating_add(d.message.len()),
            Utf16::default(),
        )?;
        out.push(object(vec![
            ("code", Value::String(d.code.clone())),
            ("path", Value::String(d.path.clone())),
            ("message", Value::String(d.message.clone())),
            (
                "severity",
                string(match d.severity {
                    Severity::Error => "error",
                    Severity::Warning => "warning",
                }),
            ),
        ]));
    }
    Ok(Value::Array(out))
}
fn identity(i: &Value, ctx: &mut Context<'_>) -> Result<(Utf16, Utf16), EngineError> {
    charge_fields(i, ctx)?;
    let Value::Object(fields) = i else {
        return Err(err(
            "SEMANTIC_TYPE_IDENTITY",
            "Expected exact nonempty module/element IDs",
            "",
        ));
    };
    if fields
        .iter()
        .any(|(k, _)| k != &key("module") && k != &key("element"))
    {
        return Err(err(
            "SEMANTIC_TYPE_IDENTITY",
            "Expected exact nonempty module/element IDs",
            "",
        ));
    }
    charge_fields(i, ctx)?;
    let m = text(get(i, "module")).filter(|s| !s.is_empty());
    let e = text(get(i, "element")).filter(|s| !s.is_empty());
    match (m, e) {
        (Some(m), Some(e)) => Ok((m, e)),
        _ => Err(err(
            "SEMANTIC_TYPE_IDENTITY",
            "Expected exact nonempty module/element IDs",
            "",
        )),
    }
}
fn locate(
    source: &Value,
    ident: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<(Value, Value, usize, usize, Value, String), EngineError> {
    let source = copy_json(source, ctx)?;
    let ident = copy_json(ident, ctx)?;
    let (module, element) = identity(&ident, ctx)?;
    let validation = engine.validate_document(&source, registry, caps, ctx)?;
    if !validation.valid {
        let message = crate::serialization::stringify_compact_metered(
            &diagnostics_value(&validation.diagnostics, ctx)?,
            ctx,
        )?
        .to_utf8()
        .unwrap_or_default();
        return Err(err("SEMANTIC_TYPE_DOCUMENT", message, ""));
    }
    charge_fields(&source, ctx)?;
    let modules = get(&source, "modules")
        .and_then(|v| {
            if let Value::Array(a) = v {
                Some(a)
            } else {
                None
            }
        })
        .unwrap();
    let mut mi = None;
    for (index, item) in modules.iter().enumerate() {
        ctx.charge_work(1, Utf16::default())?;
        charge_fields(item, ctx)?;
        if text(get(item, "id")).as_ref() == Some(&module) {
            mi = Some(index);
            break;
        }
    }
    let Some(mi) = mi else {
        return Err(err(
            "SEMANTIC_TYPE_MISSING",
            "Element identity is absent",
            "",
        ));
    };
    charge_fields(&modules[mi], ctx)?;
    let elements = get(&modules[mi], "elements")
        .and_then(|v| {
            if let Value::Array(a) = v {
                Some(a)
            } else {
                None
            }
        })
        .unwrap();
    let mut ei = None;
    for (index, item) in elements.iter().enumerate() {
        ctx.charge_work(1, Utf16::default())?;
        charge_fields(item, ctx)?;
        if text(get(item, "id")).as_ref() == Some(&element) {
            ei = Some(index);
            break;
        }
    }
    let Some(ei) = ei else {
        return Err(err(
            "SEMANTIC_TYPE_MISSING",
            "Element identity is absent",
            "",
        ));
    };
    let path = format!("/modules/{mi}/elements/{ei}/semanticTypes");
    Ok((
        source,
        ident,
        mi,
        ei,
        diagnostics_value(&validation.diagnostics, ctx)?,
        path,
    ))
}
fn require_current(source: &Value, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    charge_fields(source, ctx)?;
    if text(get(source, "umf")).as_ref() != Some(&key("0.10.0")) {
        Err(err(
            "SEMANTIC_TYPE_VERSION",
            "Explicit 0.10.0 migration required; older semanticTypes fields are opaque",
            "",
        ))
    } else {
        Ok(())
    }
}
fn semantic_array(v: &Value, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    let Value::Array(a) = v else { return Ok(false) };
    if a.is_empty() {
        return Ok(false);
    }
    for reference in a {
        ctx.charge_work(1, Utf16::default())?;
        for name in ["vocabulary", "version", "term"] {
            charge_fields(reference, ctx)?;
            if !text(get(reference, name)).is_some_and(|s| !s.is_empty()) {
                return Ok(false);
            }
        }
    }
    Ok(true)
}
fn validate_array(types: Option<&Value>, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    if let Some(value) = types {
        if !matches!(value, Value::Null) && !semantic_array(value, ctx)? {
            Err(err(
                "SEMANTIC_TYPE_STRUCTURE",
                "Expected nonempty array of exact semantic references or null to clear",
                "",
            ))
        } else {
            Ok(())
        }
    } else {
        Ok(())
    }
}
fn canonical(v: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    match v {
        Value::Array(a) => {
            ctx.charge_work(a.len(), Utf16::default())?;
            Ok(Value::Array(
                a.iter()
                    .map(|item| canonical(item, ctx))
                    .collect::<Result<_, _>>()?,
            ))
        }
        Value::Object(m) => {
            let sort_work = m
                .len()
                .saturating_mul((usize::BITS - usize::max(m.len(), 1).leading_zeros()) as usize);
            let max_key_len = m.iter().map(|(key, _)| key.len()).max().unwrap_or(0);
            let comparison_work = sort_work.saturating_mul(max_key_len);
            ctx.charge_work(
                m.len()
                    .saturating_add(sort_work)
                    .saturating_add(comparison_work),
                Utf16::default(),
            )?;
            let mut members = Vec::with_capacity(m.len());
            for (key, value) in m {
                ctx.charge_work(key.len(), Utf16::default())?;
                members.push((key.clone(), canonical(value, ctx)?));
            }
            let mut m = members;
            m.sort_by(|a, b| a.0.cmp(&b.0));
            Ok(Value::Object(m))
        }
        Value::String(value) => {
            ctx.charge_work(value.len(), Utf16::default())?;
            Ok(v.clone())
        }
        _ => Ok(v.clone()),
    }
}
fn canonical_equal(a: &Value, b: &Value, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    Ok(canonical(a, ctx)? == canonical(b, ctx)?)
}
fn finish(value: Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    copy_json(&value, ctx)
}
fn validate_receipt(
    value: &Value,
    engine: &Engine,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let schema = crate::serialization::read_json_value(
        &OPERATION_SCHEMA.encode_utf16().collect::<Vec<_>>(),
        crate::serialization::Format::Json,
        ctx,
    )?;
    let resources = engine.schema_resources_with_context(ctx)?;
    let compiled = crate::schema::CompiledSchema::compile(&schema, &resources, ctx)?;
    if compiled.validate(value, ctx)?.first().is_some() {
        return Err(err(
            "SEMANTIC_TYPE_RECEIPT",
            "Malformed declaration receipt",
            "",
        ));
    }
    Ok(())
}

pub fn inspect_core_semantic_types(
    input: &Value,
    identity_input: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let (source, identity, mi, ei, diagnostics, path) =
        locate(input, identity_input, engine, registry, caps, ctx)?;
    charge_fields(&source, ctx)?;
    let modules = get(&source, "modules")
        .and_then(|v| {
            if let Value::Array(a) = v {
                Some(a)
            } else {
                None
            }
        })
        .unwrap();
    charge_fields(&modules[mi], ctx)?;
    let elements = get(&modules[mi], "elements")
        .and_then(|v| {
            if let Value::Array(a) = v {
                Some(a)
            } else {
                None
            }
        })
        .unwrap();
    let element = &elements[ei];
    charge_fields(element, ctx)?;
    let meaning = match get(element, "semanticTypes") {
        Some(v) => object(vec![
            ("state", string("declared")),
            ("types", copy_json(v, ctx)?),
        ]),
        None => object(vec![("state", string("missing"))]),
    };
    finish(
        object(vec![
            ("operation", string("inspect-core-semantic-types")),
            ("version", string("2.0.0")),
            ("source", source),
            ("identity", identity),
            ("path", string(&path)),
            ("meaning", meaning),
            ("diagnostics", diagnostics),
        ]),
        ctx,
    )
}
pub fn get_core_semantic_types(
    input: &Value,
    identity_input: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Option<Value>, EngineError> {
    let (source, _, mi, ei, _, _) = locate(input, identity_input, engine, registry, caps, ctx)?;
    require_current(&source, ctx)?;
    charge_fields(&source, ctx)?;
    let modules = get(&source, "modules")
        .and_then(|v| {
            if let Value::Array(a) = v {
                Some(a)
            } else {
                None
            }
        })
        .unwrap();
    charge_fields(&modules[mi], ctx)?;
    let element = &modules[mi];
    let element = &get(element, "elements")
        .and_then(|v| {
            if let Value::Array(a) = v {
                Some(a)
            } else {
                None
            }
        })
        .unwrap()[ei];
    charge_fields(element, ctx)?;
    get(element, "semanticTypes")
        .map(|v| copy_json(v, ctx))
        .transpose()
}
pub fn declare_core_semantic_types(
    input: &Value,
    identity_input: &Value,
    types_input: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    declare_core_semantic_types_with_inputs(
        types_input,
        engine,
        registry,
        caps,
        ctx,
        |ctx| Ok((copy_json(input, ctx)?, copy_json(identity_input, ctx)?)),
    )
}

/// Staged host form: admit and validate the requested references before
/// touching the source document or identity, matching the predecessor order.
pub fn declare_core_semantic_types_with_inputs<F>(
    types_input: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
    admit_inputs: F,
) -> Result<Value, EngineError>
where
    F: FnOnce(&mut Context<'_>) -> Result<(Value, Value), EngineError>,
{
    let types = copy_json(types_input, ctx)?;
    validate_array(Some(&types), ctx)?;
    let (input, identity_input) = admit_inputs(ctx)?;
    let (source, identity, mi, ei, diagnostics, path) =
        locate(&input, &identity_input, engine, registry, caps, ctx)?;
    require_current(&source, ctx)?;
    charge_fields(&source, ctx)?;
    let modules = get(&source, "modules")
        .and_then(|v| {
            if let Value::Array(a) = v {
                Some(a)
            } else {
                None
            }
        })
        .unwrap();
    charge_fields(&modules[mi], ctx)?;
    let element = &get(&modules[mi], "elements")
        .and_then(|v| {
            if let Value::Array(a) = v {
                Some(a)
            } else {
                None
            }
        })
        .unwrap()[ei];
    charge_fields(element, ctx)?;
    let current = get(element, "semanticTypes");
    let unknown_prefix = key(&(path.clone() + "/"));
    let mut has_unknown = false;
    if let Value::Array(ds) = &diagnostics {
        for diagnostic in ds {
            ctx.charge_work(1, Utf16::default())?;
            charge_fields(diagnostic, ctx)?;
            if text(get(diagnostic, "code")).as_ref()
                == Some(&key("UNKNOWN_SEMANTIC_TYPE_QUALIFIER"))
            {
                charge_fields(diagnostic, ctx)?;
                if text(get(diagnostic, "path"))
                    .is_some_and(|p| p.units().starts_with(unknown_prefix.units()))
                {
                    has_unknown = true;
                    break;
                }
            }
        }
    }
    if has_unknown && !canonical_equal(&types, current.unwrap_or(&Value::Null), ctx)? {
        return Err(err(
            "SEMANTIC_TYPE_UNKNOWN",
            "Unknown existing qualifiers prevent replacement or removal",
            &path,
        ));
    }
    let mut target = copy_json(&source, ctx)?;
    charge_fields(&target, ctx)?;
    let modules = get_mut(&mut target, "modules")
        .and_then(|v| {
            if let Value::Array(a) = v {
                Some(a)
            } else {
                None
            }
        })
        .unwrap();
    charge_fields(&modules[mi], ctx)?;
    let elements = get_mut(&mut modules[mi], "elements")
        .and_then(|v| {
            if let Value::Array(a) = v {
                Some(a)
            } else {
                None
            }
        })
        .unwrap();
    charge_fields(&elements[ei], ctx)?;
    if matches!(types, Value::Null) {
        remove(&mut elements[ei], "semanticTypes")
    } else {
        set(&mut elements[ei], "semanticTypes", types.clone())
    }
    let validation = engine.validate_document(&target, registry, caps, ctx)?;
    if !validation.valid {
        let message = crate::serialization::stringify_compact_metered(
            &diagnostics_value(&validation.diagnostics, ctx)?,
            ctx,
        )?
        .to_utf8()
        .unwrap_or_default();
        return Err(err("SEMANTIC_TYPE_DOCUMENT", message, ""));
    }
    finish(
        object(vec![
            ("operation", string("declare-core-semantic-types")),
            ("version", string("2.0.0")),
            ("source", source),
            ("target", target),
            ("identity", identity),
            ("request", object(vec![("types", types)])),
            (
                "diagnostics",
                diagnostics_value(&validation.diagnostics, ctx)?,
            ),
            (
                "provenance",
                object(vec![
                    ("origin", string("authored")),
                    ("path", string(&path)),
                    ("basis", string("explicit-author-declaration")),
                ]),
            ),
        ]),
        ctx,
    )
}

/// Recompute declaration provenance and require both the receipt and current source to match.
pub fn verify_core_semantic_type_declaration(
    receipt_input: &Value,
    current: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    verify_core_semantic_type_declaration_with_current(
        receipt_input,
        engine,
        registry,
        caps,
        ctx,
        |ctx| copy_json(current, ctx),
    )
}

/// Staged host form: receipt validation and recomputation complete before the
/// current document is admitted. Bindings use this to preserve predecessor
/// refusal order while keeping host conversion inside the same Context.
pub fn verify_core_semantic_type_declaration_with_current<F>(
    receipt_input: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
    admit_current: F,
) -> Result<Value, EngineError>
where
    F: FnOnce(&mut Context<'_>) -> Result<Value, EngineError>,
{
    let receipt = copy_json(receipt_input, ctx)?;
    validate_receipt(&receipt, engine, ctx)?;
    let source = get(&receipt, "source")
        .ok_or_else(|| err("SEMANTIC_TYPE_RECEIPT", "Malformed declaration receipt", ""))?;
    let identity = get(&receipt, "identity")
        .ok_or_else(|| err("SEMANTIC_TYPE_RECEIPT", "Malformed declaration receipt", ""))?;
    let request = get(&receipt, "request")
        .and_then(|r| get(r, "types"))
        .ok_or_else(|| err("SEMANTIC_TYPE_RECEIPT", "Malformed declaration receipt", ""))?;
    let expected =
        declare_core_semantic_types(source, identity, request, engine, registry, caps, ctx)?;
    if !canonical_equal(&receipt, &expected, ctx)? {
        return Err(err(
            "SEMANTIC_TYPE_RECEIPT",
            "Declaration conflicts with retained source and request",
            "",
        ));
    }
    let expected_target = get(&expected, "target").unwrap();
    let current = admit_current(ctx)?;
    if !canonical_equal(&current, expected_target, ctx)? {
        return Err(err(
            "SEMANTIC_TYPE_STALE",
            "Current document differs from declared target",
            "",
        ));
    }
    Ok(expected)
}

/// Caller-owned, data-only semantic vocabulary metadata. This registry never
/// loads code or invokes a validator; its lifetime is the caller's invocation.
#[derive(Default)]
pub struct SemanticTypeRegistry {
    entries: std::collections::BTreeMap<(Utf16, Utf16, Utf16), SemanticTypeEntry>,
    index_work_units: usize,
}

struct SemanticTypeEntry {
    definition: Value,
    validator_token: Option<u64>,
}

/// Trusted synchronous validators are supplied by the caller for one invocation.
/// Implementations may cooperatively charge work through the same Context; the
/// engine does not claim to preempt a callback which does not cooperate.
pub trait SemanticTypeValidator {
    fn validate(
        &mut self,
        token: u64,
        value: &Value,
        definition: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, CapabilityError>;
}

fn registry_key_units(identity: &(Utf16, Utf16, Utf16)) -> usize {
    identity
        .0
        .len()
        .saturating_add(identity.1.len())
        .saturating_add(identity.2.len())
}

fn registry_reference(
    reference: &Value,
    ctx: &mut Context<'_>,
) -> Result<(Utf16, Utf16, Utf16), EngineError> {
    let copied = copy_json(reference, ctx)?;
    let Value::Object(fields) = &copied else {
        return Err(err(
            "SEMANTIC_TYPE_STRUCTURE",
            "Expected vocabulary, exact version and term strings",
            "",
        ));
    };
    ctx.charge_work(fields.len(), Utf16::default())?;
    let component = |name: &str| {
        fields
            .iter()
            .find(|(field, _)| field == &key(name))
            .and_then(|(_, value)| match value {
                Value::String(value) if !value.is_empty() => Some(value.clone()),
                _ => None,
            })
    };
    match (
        component("vocabulary"),
        component("version"),
        component("term"),
    ) {
        (Some(vocabulary), Some(version), Some(term)) => Ok((vocabulary, version, term)),
        _ => Err(err(
            "SEMANTIC_TYPE_STRUCTURE",
            "Expected vocabulary, exact version and term strings",
            "",
        )),
    }
}

impl SemanticTypeRegistry {
    /// Store a copied object definition under its exact vocabulary/version/term.
    pub fn register(
        &mut self,
        reference: &Value,
        definition: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<(), EngineError> {
        self.register_entry(reference, definition, None, true, ctx)
    }

    /// Register an explicitly installed validator capability token alongside
    /// copied vocabulary-owned metadata. The token itself is not executable data.
    pub fn register_with_validator(
        &mut self,
        reference: &Value,
        definition: &Value,
        validator_token: u64,
        ctx: &mut Context<'_>,
    ) -> Result<(), EngineError> {
        self.register_entry(reference, definition, Some(validator_token), true, ctx)
    }

    /// Host-admission variant that preserves TypeScript registration order:
    /// reference and definition validation precede callable admission, which
    /// precedes exact duplicate detection.
    pub fn register_host_admitted(
        &mut self,
        reference: &Value,
        definition: &Value,
        validator_present: bool,
        validator_is_function: bool,
        validator_token: Option<u64>,
        ctx: &mut Context<'_>,
    ) -> Result<(), EngineError> {
        if (!validator_present && validator_token.is_some())
            || (validator_present && validator_is_function && validator_token.is_none())
        {
            return Err(err(
                "REQUEST",
                "Validator capability token does not match host admission",
                "",
            ));
        }
        self.register_entry(
            reference,
            definition,
            validator_token,
            !validator_present || validator_is_function,
            ctx,
        )
    }

    fn register_entry(
        &mut self,
        reference: &Value,
        definition: &Value,
        validator_token: Option<u64>,
        validator_is_function: bool,
        ctx: &mut Context<'_>,
    ) -> Result<(), EngineError> {
        let identity = registry_reference(reference, ctx)?;
        let Value::Object(fields) = reference else {
            unreachable!("registry_reference admitted only an object")
        };
        ctx.charge_work(fields.len(), Utf16::default())?;
        if fields.iter().any(|(field, _)| {
            field != &key("vocabulary") && field != &key("version") && field != &key("term")
        }) {
            return Err(err(
                "SEMANTIC_TYPE_STRUCTURE",
                "Registration identity cannot contain unknown qualifiers",
                "",
            ));
        }
        let definition = copy_json(definition, ctx)?;
        let Value::Object(_) = definition else {
            return Err(err(
                "SEMANTIC_TYPE_STRUCTURE",
                "Expected JSON object definition",
                "",
            ));
        };
        if !validator_is_function {
            return Err(err(
                "SEMANTIC_TYPE_STRUCTURE",
                "Expected explicit validator function",
                "",
            ));
        }
        let key_units = registry_key_units(&identity);
        ctx.charge_work(
            self.index_work_units
                .saturating_add(key_units)
                .saturating_mul(2),
            Utf16::default(),
        )?;
        if self.entries.contains_key(&identity) {
            return Err(err(
                "SEMANTIC_TYPE_DUPLICATE",
                "Exact semantic term already registered",
                "",
            ));
        }
        self.entries.insert(
            identity,
            SemanticTypeEntry {
                definition,
                validator_token,
            },
        );
        self.index_work_units = self.index_work_units.saturating_add(key_units);
        Ok(())
    }

    /// Return an isolated copy of the definition for the exact triple, if present.
    pub fn lookup(
        &self,
        reference: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Option<Value>, EngineError> {
        let identity = registry_reference(reference, ctx)?;
        ctx.charge_work(
            self.index_work_units
                .saturating_add(registry_key_units(&identity)),
            Utf16::default(),
        )?;
        self.entries
            .get(&identity)
            .map(|entry| copy_json(&entry.definition, ctx))
            .transpose()
    }

    /// Resolve refusal cases before a host admits the value argument. `None`
    /// means a registered validator exists and value admission may proceed.
    pub fn prepare_check(
        reference: &Value,
        entries: &[(Value, bool)],
        ctx: &mut Context<'_>,
    ) -> Result<Option<Value>, EngineError> {
        let copied_reference = copy_json(reference, ctx)?;
        let identity = registry_reference(&copied_reference, ctx)?;
        let Value::Object(fields) = &copied_reference else {
            unreachable!()
        };
        ctx.charge_work(fields.len(), Utf16::default())?;
        if fields.iter().any(|(field, _)| {
            field != &key("vocabulary") && field != &key("version") && field != &key("term")
        }) {
            return unknown_semantic_check(
                copied_reference,
                Utf16::from(
                    "Unknown semantic reference qualifiers retained without interpretation",
                ),
                ctx,
            )
            .map(Some);
        }
        ctx.charge_work(registry_key_units(&identity), Utf16::default())?;
        let mut availability = None;
        for (entry_reference, has_validator) in entries {
            let entry_identity = registry_reference(entry_reference, ctx)?;
            ctx.charge_work(registry_key_units(&entry_identity), Utf16::default())?;
            if entry_identity == identity {
                availability = Some(*has_validator);
                break;
            }
        }
        if availability.is_none() {
            return unknown_semantic_check(
                copied_reference,
                Utf16::from("Exact semantic term is unavailable"),
                ctx,
            )
            .map(Some);
        }
        if availability == Some(false) {
            return unknown_semantic_check(
                copied_reference,
                Utf16::from("No value validator supplied for the exact semantic term"),
                ctx,
            )
            .map(Some);
        }
        Ok(None)
    }

    /// Evaluate one exact semantic reference. Unknown references and terms
    /// without an explicitly supplied validator remain unknown, not invalid.
    pub fn check(
        &self,
        reference: &Value,
        value: &Value,
        validators: &mut dyn SemanticTypeValidator,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let copied_reference = copy_json(reference, ctx)?;
        let identity = registry_reference(&copied_reference, ctx)?;
        let Value::Object(fields) = &copied_reference else {
            unreachable!("registry_reference admitted only an object")
        };
        ctx.charge_work(fields.len(), Utf16::default())?;
        if fields.iter().any(|(field, _)| {
            field != &key("vocabulary") && field != &key("version") && field != &key("term")
        }) {
            return unknown_semantic_check(
                copied_reference,
                Utf16::from(
                    "Unknown semantic reference qualifiers retained without interpretation",
                ),
                ctx,
            );
        }
        let key_units = registry_key_units(&identity);
        ctx.charge_work(
            self.index_work_units.saturating_add(key_units),
            Utf16::default(),
        )?;
        let Some(entry) = self.entries.get(&identity) else {
            return unknown_semantic_check(
                copied_reference,
                Utf16::from("Exact semantic term is unavailable"),
                ctx,
            );
        };
        let Some(token) = entry.validator_token else {
            return unknown_semantic_check(
                copied_reference,
                Utf16::from("No value validator supplied for the exact semantic term"),
                ctx,
            );
        };
        let value = copy_json(value, ctx)?;
        let definition = copy_json(&entry.definition, ctx)?;
        let returned = match validators.validate(token, &value, &definition, ctx) {
            Ok(result) => result,
            Err(CapabilityError::Host(message) | CapabilityError::HostPython { message, .. }) => {
                let issue = validator_failure_message(&message, ctx)?;
                return unknown_semantic_check(copied_reference, issue, ctx);
            }
            Err(CapabilityError::Engine(error)) => return Err(error),
        };
        let returned = match copy_json(&returned, ctx) {
            Ok(result) => result,
            Err(error) if is_resource_error(&error) => return Err(error),
            Err(error) => {
                let issue = validator_failure_message(&error.message, ctx)?;
                return unknown_semantic_check(copied_reference, issue, ctx);
            }
        };
        let Some((status, complete, issues)) = semantic_check_fields(&returned, ctx)? else {
            return unknown_semantic_check(
                copied_reference,
                Utf16::from("Malformed validator result"),
                ctx,
            );
        };
        semantic_check_result(copied_reference, status, complete, issues, ctx)
    }
}

fn unknown_semantic_check(
    reference: Value,
    issue: Utf16,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    semantic_check_result(
        reference,
        Utf16::from("unknown"),
        false,
        vec![Value::String(issue)],
        ctx,
    )
}

/// Meter construction of every returned check before allocating its containers.
fn semantic_check_result(
    reference: Value,
    status: Utf16,
    complete: bool,
    issues: Vec<Value>,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    // Charge the fixed shape first, then charge each copied issue before
    // traversing its units. The final object is assembled only after all
    // output work has passed the shared invocation controls.
    ctx.charge_work(
        4usize.saturating_add(status.len()).saturating_add(29),
        Utf16::default(),
    )?;
    for issue in &issues {
        if let Value::String(issue) = issue {
            ctx.charge_work(1usize.saturating_add(issue.len()), Utf16::default())?;
        } else {
            ctx.charge_work(1, Utf16::default())?;
        }
    }
    Ok(object(vec![
        ("reference", reference),
        ("status", Value::String(status)),
        ("complete", Value::Bool(complete)),
        ("issues", Value::Array(issues)),
    ]))
}

fn is_resource_error(error: &EngineError) -> bool {
    error.is_control_failure()
        || matches!(
            error.code.as_str(),
            "LIMIT" | "RESOURCE_LIMIT" | "CANCELLED" | "DEADLINE" | "METER_FAILURE"
        )
}

fn validator_failure_message(message: &Utf16, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    const PREFIX: &str = "Value validator failed; no validation conclusion available";
    const SEPARATOR: &str = ": ";
    let prefix_len = Utf16::from(PREFIX).len();
    let separator_len = if message.is_empty() {
        0
    } else {
        Utf16::from(SEPARATOR).len()
    };
    ctx.charge_work(
        prefix_len
            .saturating_add(separator_len)
            .saturating_add(message.len()),
        Utf16::default(),
    )?;
    let mut result = Utf16::from(PREFIX);
    if !message.is_empty() {
        let mut units = result.into_units();
        units.extend(Utf16::from(SEPARATOR).units());
        units.extend(message.units());
        result = Utf16::new(units);
    }
    Ok(result)
}

fn semantic_check_fields(
    value: &Value,
    ctx: &mut Context<'_>,
) -> Result<Option<(Utf16, bool, Vec<Value>)>, EngineError> {
    let Value::Object(fields) = value else {
        return Ok(None);
    };
    ctx.charge_work(fields.len(), Utf16::default())?;
    if fields.iter().any(|(name, _)| {
        name != &key("status") && name != &key("complete") && name != &key("issues")
    }) {
        return Ok(None);
    }
    let status = get(value, "status").and_then(|value| text(Some(value)));
    let complete = match get(value, "complete") {
        Some(Value::Bool(value)) => Some(*value),
        _ => None,
    };
    let issues = match get(value, "issues") {
        Some(Value::Array(issues)) => {
            let mut copied = Vec::with_capacity(issues.len());
            for issue in issues {
                ctx.charge_work(1, Utf16::default())?;
                match issue {
                    Value::String(issue) => {
                        ctx.charge_work(issue.len(), Utf16::default())?;
                        copied.push(Value::String(issue.clone()));
                    }
                    _ => return Ok(None),
                }
            }
            Some(copied)
        }
        _ => None,
    };
    match (status, complete, issues) {
        (Some(status), Some(complete), Some(issues))
            if (status == key("valid") || status == key("invalid") || status == key("unknown"))
                && !(status == key("unknown") && complete) =>
        {
            Ok(Some((status, complete, issues)))
        }
        _ => Ok(None),
    }
}

/// Synchronous value check for one reference; only the caller-installed
/// capability can provide executable meaning.
pub fn validate_semantic_type_value(
    reference: &Value,
    value: &Value,
    registry: &SemanticTypeRegistry,
    validators: &mut dyn SemanticTypeValidator,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    registry.check(reference, value, validators, ctx)
}

/// Validate document and identity refusal precedence before a host admits the
/// value argument for aggregate checking.
pub fn prepare_core_semantic_type_value(
    source_input: &Value,
    identity_input: &Value,
    engine: &Engine,
    document_registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let (source, _, _, _, _, _) = locate(
        source_input,
        identity_input,
        engine,
        document_registry,
        caps,
        ctx,
    )?;
    require_current(&source, ctx)
}

/// Aggregate exact semantic checks for one declared core element. This says
/// nothing about native payloads or other core value constraints.
pub fn validate_core_semantic_type_value(
    source_input: &Value,
    identity_input: &Value,
    value_input: &Value,
    registry: &SemanticTypeRegistry,
    validators: &mut dyn SemanticTypeValidator,
    engine: &Engine,
    document_registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let (source, identity, mi, ei, _, _) = locate(
        source_input,
        identity_input,
        engine,
        document_registry,
        caps,
        ctx,
    )?;
    require_current(&source, ctx)?;
    let value = copy_json(value_input, ctx)?;
    let modules = match get(&source, "modules") {
        Some(Value::Array(modules)) => modules,
        _ => unreachable!("validated document always contains modules"),
    };
    let elements = match get(&modules[mi], "elements") {
        Some(Value::Array(elements)) => elements,
        _ => unreachable!("validated module always contains elements"),
    };
    let references = match get(&elements[ei], "semanticTypes") {
        Some(Value::Array(references)) => references.as_slice(),
        None => &[],
        _ => unreachable!("document validation admitted only semantic reference arrays"),
    };
    let mut checks = Vec::with_capacity(references.len());
    let mut has_invalid = false;
    let mut has_unknown = false;
    let mut complete = !references.is_empty();
    let mut issues = Vec::new();
    for reference in references {
        ctx.charge_work(1, Utf16::default())?;
        let check = registry.check(reference, &value, validators, ctx)?;
        let status = text(get(&check, "status")).unwrap_or_default();
        has_invalid |= status == key("invalid");
        has_unknown |= status == key("unknown");
        complete &= matches!(get(&check, "complete"), Some(Value::Bool(true)));
        if let Some(Value::Array(check_issues)) = get(&check, "issues") {
            ctx.charge_work(check_issues.len(), Utf16::default())?;
            for issue in check_issues {
                if let Value::String(text) = issue {
                    ctx.charge_work(text.len(), Utf16::default())?;
                }
                issues.push(issue.clone());
            }
        }
        checks.push(check);
    }
    if references.is_empty() {
        issues.push(string("No semantic type declaration to evaluate"));
    }
    let status = if has_invalid {
        "invalid"
    } else if has_unknown || references.is_empty() {
        "unknown"
    } else {
        "valid"
    };
    copy_json(
        &object(vec![
            ("source", source),
            ("identity", identity),
            ("checks", Value::Array(checks)),
            ("status", string(status)),
            ("complete", Value::Bool(complete)),
            ("issues", Value::Array(issues)),
        ]),
        ctx,
    )
}
