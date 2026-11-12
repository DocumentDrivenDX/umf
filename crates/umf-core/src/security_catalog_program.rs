// SPDX-License-Identifier: MIT OR Apache-2.0
//! Source admission and compilation planning for the private catalog candidate.
use std::collections::{HashMap, HashSet};

use crate::{Context, EngineError, Utf16, Value, serialization::stringify_compact_metered};

type Reference<'a> = (&'a Utf16, &'a Utf16, &'a Utf16);

fn fail(message: &str) -> EngineError {
    EngineError::new(
        "SECURITY_CATALOG_PROGRAM_UNRESOLVED",
        Utf16::default(),
        message,
    )
}
fn get<'a>(value: &'a Value, key: &str) -> Option<&'a Value> {
    let Value::Object(fields) = value else {
        return None;
    };
    fields
        .iter()
        .find(|(name, _)| name == &Utf16::from(key))
        .map(|(_, value)| value)
}
fn at<'a>(value: &'a Value, key: &str) -> Result<&'a Value, EngineError> {
    get(value, key).ok_or_else(|| fail("Required catalog source member missing"))
}
fn items(value: &Value) -> Result<&[Value], EngineError> {
    match value {
        Value::Array(values) => Ok(values),
        _ => Err(fail("Expected a catalog source list")),
    }
}
fn list<'a>(value: &'a Value, key: &str) -> Result<&'a [Value], EngineError> {
    items(at(value, key)?)
}
fn string(value: &Value) -> Result<&Utf16, EngineError> {
    match value {
        Value::String(text) => Ok(text),
        _ => Err(fail("Expected catalog source text")),
    }
}
fn text<'a>(value: &'a Value, key: &str) -> Result<&'a Utf16, EngineError> {
    string(at(value, key)?)
}
fn is(value: &Value, label: &str) -> bool {
    matches!(value, Value::String(text) if text == &Utf16::from(label))
}
fn obj(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(key, value)| (key.into(), value))
            .collect(),
    )
}
fn n(value: usize) -> Value {
    Value::Number(value as f64)
}
fn closed(value: &Value, required: &[&str]) -> Result<(), EngineError> {
    let Value::Object(fields) = value else {
        return Err(fail("Closed source shape required"));
    };
    if fields.len() != required.len() || required.iter().any(|key| get(value, key).is_none()) {
        return Err(fail("Closed source shape required"));
    }
    Ok(())
}
fn reference(value: &Value) -> Result<Reference<'_>, EngineError> {
    Ok((
        text(value, "documentId")?,
        text(value, "moduleId")?,
        text(value, "elementId")?,
    ))
}
fn association_reference(value: &Value) -> Result<(bool, Reference<'_>), EngineError> {
    let graph = get(value, "relationshipId").is_some();
    let key = if graph { "relationshipId" } else { "elementId" };
    Ok((
        graph,
        (
            text(value, "documentId")?,
            text(value, "moduleId")?,
            text(value, key)?,
        ),
    ))
}
fn pins(value: &Value) -> Result<HashMap<&Utf16, &Utf16>, EngineError> {
    let mut result = HashMap::new();
    for pin in items(value)? {
        closed(pin, &["documentId", "revision"])?;
        let id = text(pin, "documentId")?;
        let revision = text(pin, "revision")?;
        if id.is_empty() || revision.is_empty() {
            return Err(fail("Exact closure pins required"));
        }
        if result.insert(id, revision).is_some() {
            return Err(fail("Duplicate source identity"));
        }
    }
    Ok(result)
}
fn check_text_bound(packet: &Value, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    let mut units = 0;
    let mut pending = vec![packet];
    while let Some(value) = pending.pop() {
        ctx.charge_work(1, Utf16::default())?;
        match value {
            Value::String(text) => units += text.len(),
            Value::Array(values) => {
                for (index, value) in values.iter().enumerate() {
                    units += index.to_string().len();
                    pending.push(value);
                }
            }
            Value::Object(fields) => {
                for (key, child) in fields {
                    units += key.len();
                    pending.push(child);
                }
            }
            _ => {}
        }
        if units > 4_000_000 {
            return Err(fail("Source text budget exhausted"));
        }
    }
    Ok(())
}

struct Expansion {
    targets: usize,
    nodes: usize,
    operands: usize,
    condition_text: usize,
}
fn expansion(rules: &[Value], ctx: &mut Context<'_>) -> Result<Expansion, EngineError> {
    let mut source_nodes = 0;
    let mut total = Expansion {
        targets: 0,
        nodes: 0,
        operands: 0,
        condition_text: 0,
    };
    for rule in rules {
        let condition = at(rule, "condition")?;
        let mut count = 0;
        let mut operands = 0;
        let mut pending = vec![condition];
        while let Some(node) = pending.pop() {
            ctx.charge_work(1, Utf16::default())?;
            count += 1;
            if count + source_nodes > 4096 {
                return Err(fail("Source expression budget exhausted"));
            }
            let op = text(node, "op")?
                .to_utf8()
                .map_err(|_| fail("Invalid condition operator"))?;
            match op.as_str() {
                "eq" => operands += 2,
                "and" | "or" => pending.extend(list(node, "args")?),
                "not" => pending.push(at(node, "arg")?),
                "exists" => pending.push(at(node, "where")?),
                _ => {}
            }
        }
        source_nodes += count;
        let targets = list(rule, "target")?.len();
        total.targets += targets;
        total.nodes += count * targets;
        total.operands += operands * targets;
        total.condition_text += stringify_compact_metered(condition, ctx)?.len() * targets;
        if total.targets > 4096 || total.nodes > 65_536 || total.condition_text > 64_000_000 {
            return Err(fail("Rule-target expansion budget exhausted"));
        }
    }
    Ok(total)
}

/// Admit the detached input before requesting ontology or recipe capabilities.
pub fn prepare(packet: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    check_text_bound(packet, ctx)?;
    let policy = at(packet, "policy")?;
    let inspection = crate::security_policy_source::inspect_security_policy_v2(policy, ctx)?;
    if get(&inspection, "valid") != Some(&Value::Bool(true))
        || list(&inspection, "diagnostics")?
            .iter()
            .any(|d| get(d, "code").is_some_and(|code| is(code, "SECURITY_V2_UNKNOWN")))
    {
        return Err(fail("Known canonical policy source required"));
    }
    let expansion = expansion(list(policy, "rules")?, ctx)?;
    let closure = at(packet, "closure")?;
    closed(closure, &["pins", "documents"])?;
    let declared_pins = at(closure, "pins")?;
    if items(declared_pins)?.len() > 256 || list(closure, "documents")?.len() > 256 {
        return Err(fail("Bounded core closure required"));
    }
    pins(declared_pins)?;
    let catalog_required = get(policy, "protection").is_some();
    if !catalog_required && at(packet, "catalog")? != &Value::Null {
        return Err(fail("Unpinned policy cannot acquire catalog semantics"));
    }
    Ok(obj(vec![
        ("catalogRequired", Value::Bool(catalog_required)),
        ("targets", n(expansion.targets)),
        ("nodes", n(expansion.nodes)),
        ("operands", n(expansion.operands)),
        ("conditionText", n(expansion.condition_text)),
    ]))
}

fn count(value: &Value, key: &str, max: usize) -> Result<usize, EngineError> {
    match at(value, key)? {
        Value::Number(number)
            if *number >= 0.0 && *number <= max as f64 && number.fract() == 0.0 =>
        {
            Ok(*number as usize)
        }
        _ => Err(fail("Invalid source expansion receipt")),
    }
}

/// Determine the exact rule/target work after host-issued ontology and function
/// resolution. Only the host can attach the original opaque handles.
pub fn plan(input: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let policy = at(input, "policy")?;
    let root = at(input, "root")?;
    let ontology = at(root, "ontology")?;
    let policy_ontology = at(policy, "ontology")?;
    for key in ["documentId", "revision"] {
        if text(policy_ontology, key)? != text(ontology, key)? {
            return Err(fail("Exact ontology pin required"));
        }
    }
    if pins(at(input, "pins")?)? != pins(at(ontology, "documents")?)? {
        return Err(fail("Ontology and core closure pins must coincide"));
    }
    let mut elements = HashMap::new();
    let mut descriptor_units = 128;
    for entry in list(root, "documents")? {
        let document = at(entry, "document")?;
        if !is(at(document, "umf")?, crate::security_policy::CORE_VERSION) {
            return Err(fail("Known current core source profile required"));
        }
        let document_id = text(document, "id")?;
        for module in list(document, "modules")? {
            let module_id = text(module, "id")?;
            for element in list(module, "elements")? {
                ctx.charge_work(1, Utf16::default())?;
                let element_id = text(element, "id")?;
                elements.insert((document_id, module_id, element_id), element);
                if get(element, "kind").is_some_and(|kind| is(kind, "field")) {
                    let field_ref = obj(vec![
                        ("documentId", Value::String(document_id.clone())),
                        ("moduleId", Value::String(module_id.clone())),
                        ("elementId", Value::String(element_id.clone())),
                    ]);
                    descriptor_units = descriptor_units.max(
                        stringify_compact_metered(element, ctx)?.len()
                            + stringify_compact_metered(&field_ref, ctx)?.len()
                            + 128,
                    );
                }
            }
        }
    }
    let mut entities = HashMap::new();
    for entity in list(ontology, "entities")? {
        let target = at(entity, "type")?;
        let identity = reference(target)?;
        let record = elements
            .get(&identity)
            .ok_or_else(|| fail("Missing target record"))?;
        let key_id = text(entity, "keyId")?;
        let key = list(record, "keys")?
            .iter()
            .find(|candidate| text(candidate, "id").ok() == Some(key_id))
            .ok_or_else(|| fail("Missing target key"))?;
        let mut units = stringify_compact_metered(target, ctx)?.len()
            + stringify_compact_metered(key, ctx)?.len()
            + 128;
        for part in list(key, "fields")? {
            let field = elements
                .get(&(identity.0, text(part, "module")?, text(part, "element")?))
                .ok_or_else(|| fail("Missing target key component"))?;
            units += stringify_compact_metered(field, ctx)?.len() + 128;
        }
        descriptor_units = descriptor_units.max(units);
        entities.insert(identity, entity);
    }
    let charged = at(input, "charged")?;
    let condition_text = count(charged, "conditionText", 64_000_000)?;
    let operands = count(charged, "operands", 131_072)?;
    let expanded_text = operands
        .checked_mul(descriptor_units)
        .and_then(|size| size.checked_add(condition_text))
        .filter(|size| *size <= 64_000_000)
        .ok_or_else(|| fail("Expanded condition/descriptor text budget exhausted"))?;
    let rules = list(policy, "rules")?;
    let mut rules_by_id = HashMap::new();
    for rule in rules {
        if rules_by_id.insert(text(rule, "id")?, rule).is_some() {
            return Err(fail("Duplicate source identity"));
        }
    }
    let mut associations = HashMap::new();
    for association in list(root, "associations")? {
        let association_plan = at(association, "plan")?;
        let graph = is(
            at(association, "kind")?,
            "candidate-graph-relationship-checks/0.1",
        );
        let key = if graph { "relationship" } else { "type" };
        associations.insert(
            association_reference(at(association_plan, key)?)?,
            association_plan,
        );
    }
    let bindings_source = list(input, "bindings")?;
    if bindings_source.len() > 4096 {
        return Err(fail("Bounded binding table required"));
    }
    let mut bindings = HashMap::new();
    for (index, binding) in bindings_source.iter().enumerate() {
        closed(binding, &["ruleId", "target", "context"])?;
        let target = at(binding, "target")?;
        closed(target, &["documentId", "moduleId", "elementId"])?;
        let target = reference(target)?;
        let rule_id = text(binding, "ruleId")?;
        let rule = rules_by_id
            .get(rule_id)
            .ok_or_else(|| fail("Binding must name actual rule target"))?;
        if !list(rule, "target")?
            .iter()
            .any(|value| reference(value).ok() == Some(target))
        {
            return Err(fail("Binding must name actual rule target"));
        }
        if bindings.insert((rule_id, target), index).is_some() {
            return Err(fail("Duplicate binding"));
        }
        let Value::Object(context) = at(binding, "context")? else {
            return Err(fail("Exact intrinsic binding names required"));
        };
        for (name, binding) in context {
            let expected = if name == &Utf16::from("subject") {
                reference(at(ontology, "subject")?)?
            } else if name == &Utf16::from("resource") {
                target
            } else {
                return Err(fail("Exact intrinsic binding names required"));
            };
            closed(binding, &["association", "endpoint"])?;
            let association = at(binding, "association")?;
            let identity = association_reference(association)?;
            closed(
                association,
                &[
                    "documentId",
                    "moduleId",
                    if identity.0 {
                        "relationshipId"
                    } else {
                        "elementId"
                    },
                ],
            )?;
            let plan = associations
                .get(&identity)
                .ok_or_else(|| fail("Binding endpoint/type correspondence failed"))?;
            let role = text(binding, "endpoint")?;
            let endpoint = list(plan, "endpoints")?
                .iter()
                .find(|endpoint| text(endpoint, "role").ok() == Some(role));
            if endpoint
                .and_then(|endpoint| get(endpoint, "target"))
                .and_then(|target| reference(target).ok())
                != Some(expected)
            {
                return Err(fail("Binding endpoint/type correspondence failed"));
            }
        }
    }
    let actions: HashSet<_> = list(ontology, "actions")?
        .iter()
        .map(string)
        .collect::<Result<_, _>>()?;
    let transforms = match at(input, "catalog")? {
        Value::Null => &[][..],
        catalog => list(catalog, "transforms")?,
    };
    let mut tasks = Vec::new();
    for (rule_index, rule) in rules.iter().enumerate() {
        let rule_id = text(rule, "id")?;
        let mut seen_actions = HashSet::new();
        for action in list(rule, "actions")? {
            let action = string(action)?;
            if !seen_actions.insert(action) {
                return Err(fail("Duplicate source identity"));
            }
            if !actions.contains(action) {
                return Err(fail("Undeclared action"));
            }
        }
        let disclosures = match get(rule, "disclosure") {
            Some(value) if is(at(rule, "effect")?, "permit") => items(value)?,
            Some(_) => return Err(fail("Only permits may disclose")),
            None => &[][..],
        };
        let mut seen_disclosures = HashSet::new();
        for disclosure in disclosures {
            if !seen_disclosures.insert(reference(at(disclosure, "field")?)?) {
                return Err(fail("Duplicate source identity"));
            }
        }
        let mut seen_targets = HashSet::new();
        for (target_index, target) in list(rule, "target")?.iter().enumerate() {
            ctx.charge_work(1, Utf16::default())?;
            let identity = reference(target)?;
            if !seen_targets.insert(identity) {
                return Err(fail("Duplicate source identity"));
            }
            let entity = entities
                .get(&identity)
                .ok_or_else(|| fail("Missing target entity"))?;
            let fields = list(entity, "fields")?;
            let mut inline = Vec::new();
            for (index, disclosure) in disclosures.iter().enumerate() {
                let input_domain = reference(at(disclosure, "field")?)?;
                if !fields.iter().any(|field| {
                    get(field, "ref").and_then(|value| reference(value).ok()) == Some(input_domain)
                }) {
                    return Err(fail("Disclosure input must be a live target Field"));
                }
                let disposition = at(disclosure, "disposition")?;
                if !is(at(disposition, "kind")?, "transformed") {
                    continue;
                }
                if get(disposition, "vocabulary")
                    .is_some_and(|value| is(value, "umf.security.protection"))
                {
                    let transform_id = text(disposition, "transform")?;
                    let transform_version = text(disposition, "version")?;
                    let transform = transforms
                        .iter()
                        .find(|transform| {
                            text(transform, "id").ok() == Some(transform_id)
                                && text(transform, "version").ok() == Some(transform_version)
                        })
                        .ok_or_else(|| fail("Exact catalog input/output domains required"))?;
                    if reference(at(transform, "inputDomain")?)? != input_domain
                        || reference(at(transform, "outputDomain")?)?
                            != reference(at(disposition, "field")?)?
                    {
                        return Err(fail("Exact catalog input/output domains required"));
                    }
                } else {
                    inline.push(n(index));
                }
            }
            tasks.push(obj(vec![
                ("ruleIndex", n(rule_index)),
                ("targetIndex", n(target_index)),
                (
                    "bindingIndex",
                    bindings
                        .get(&(rule_id, identity))
                        .map_or(Value::Null, |index| n(*index)),
                ),
                ("inline", Value::Array(inline)),
            ]));
        }
    }
    Ok(obj(vec![
        ("descriptorUnits", n(descriptor_units)),
        ("expandedText", n(expanded_text)),
        ("tasks", Value::Array(tasks)),
    ]))
}

fn ontology_schema() -> Result<&'static crate::schema::CompiledSchema, EngineError> {
    use crate::{
        schema::{CompiledSchema, SchemaResources},
        serialization::{Format, read_json_value},
    };
    static SCHEMA: std::sync::OnceLock<Result<CompiledSchema, EngineError>> =
        std::sync::OnceLock::new();
    fn close(value: &mut Value) {
        match value {
            Value::Array(items) => items.iter_mut().for_each(close),
            Value::Object(fields) => {
                for (_, value) in fields.iter_mut() {
                    close(value);
                }
                if fields
                    .iter()
                    .any(|(key, _)| key == &Utf16::from("properties"))
                {
                    let key = Utf16::from("additionalProperties");
                    if let Some((_, value)) = fields.iter_mut().find(|(name, _)| name == &key) {
                        *value = Value::Bool(false);
                    } else {
                        fields.push((key, Value::Bool(false)));
                    }
                }
            }
            _ => {}
        }
    }
    SCHEMA
        .get_or_init(|| {
            let mut ctx = Context::ordinary();
            let text = include_str!("../../../spec/extensions/security-v0.2/ontology.schema.json");
            let mut schema = read_json_value(
                &text.encode_utf16().collect::<Vec<_>>(),
                Format::Json,
                &mut ctx,
            )?;
            close(&mut schema);
            CompiledSchema::compile_consumer(&schema, &SchemaResources::default(), true, &mut ctx)
        })
        .as_ref()
        .map_err(Clone::clone)
}

/// Check the closed source envelope before the host captures core handles.
pub fn prepare_ontology(input: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let ontology = at(input, "ontology")?;
    let documents = list(input, "documents")?;
    if documents.len() > 256 || !ontology_schema()?.validate(ontology, ctx)?.is_empty() {
        return Err(fail("SECURITY_ONTOLOGY_CANDIDATE_UNRESOLVED"));
    }
    for entry in documents {
        closed(entry, &["revision", "document"])?;
    }
    Ok(Value::Bool(true))
}

fn check_action_purposes(ontology: &Value, actions: &HashSet<&Utf16>) -> Result<(), EngineError> {
    let Some(entries) = get(ontology, "actionPurposes") else {
        return Ok(());
    };
    let invalid = || {
        EngineError::new(
            "SECURITY_ACTION_PURPOSES",
            Utf16::default(),
            "Complete exact known action-purpose closure required",
        )
    };
    let entries = items(entries).map_err(|_| invalid())?;
    if !(1..=256).contains(&entries.len())
        || !(1..=256).contains(&actions.len())
        || actions
            .iter()
            .any(|action| action.is_empty() || action.len() > 4096)
    {
        return Err(invalid());
    }
    let mut remaining = actions.clone();
    for entry in entries {
        closed(entry, &["action", "purposes"]).map_err(|_| invalid())?;
        if !remaining.remove(text(entry, "action").map_err(|_| invalid())?) {
            return Err(invalid());
        }
        let values = list(entry, "purposes").map_err(|_| invalid())?;
        if !(1..=6).contains(&values.len()) {
            return Err(invalid());
        }
        let mut seen = HashSet::new();
        for value in values {
            let label = string(value)
                .map_err(|_| invalid())?
                .to_utf8()
                .map_err(|_| invalid())?;
            match label.as_str() {
                "read" | "field" | "original-authorized" => {}
                "reverse" | "vault-write" | "other" if values.len() == 1 => {}
                _ => return Err(invalid()),
            }
            if !seen.insert(label) {
                return Err(invalid());
            }
        }
    }
    if !remaining.is_empty() {
        return Err(invalid());
    }
    Ok(())
}

/// Match ontology pins, validate the closed source entities, and select the
/// exact association inputs the host must submit with its issued core handles.
pub fn plan_ontology(input: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let unresolved = || fail("SECURITY_ONTOLOGY_CANDIDATE_UNRESOLVED");
    let ontology = at(input, "ontology")?;
    let declared = pins(at(ontology, "documents")?)?;
    let mut documents = HashMap::new();
    let mut elements = HashMap::new();
    for (index, entry) in list(input, "documents")?.iter().enumerate() {
        let document = at(entry, "document")?;
        let document_id = text(document, "id")?;
        if declared.get(document_id).copied() != Some(text(entry, "revision")?)
            || documents.insert(document_id, index).is_some()
        {
            return Err(unresolved());
        }
        for module in list(document, "modules")? {
            let module_id = text(module, "id")?;
            for element in list(module, "elements")? {
                ctx.charge_work(1, Utf16::default())?;
                elements.insert((document_id, module_id, text(element, "id")?), element);
            }
        }
    }
    if declared.len() != documents.len() {
        return Err(unresolved());
    }
    let is_kind =
        |element: &Value, kind: &str| get(element, "kind").is_some_and(|value| is(value, kind));
    let entities_source = list(ontology, "entities")?;
    let mut entities = HashMap::new();
    for (index, entity) in entities_source.iter().enumerate() {
        let identity = reference(at(entity, "type")?)?;
        if entities.insert(identity, index).is_some() {
            return Err(unresolved());
        }
        let record = elements
            .get(&identity)
            .copied()
            .filter(|record| is_kind(record, "record"))
            .ok_or_else(unresolved)?;
        let key_id = text(entity, "keyId")?;
        let mut keys = list(record, "keys")?
            .iter()
            .filter(|key| text(key, "id").ok() == Some(key_id));
        let key = keys.next().ok_or_else(unresolved)?;
        let parts = list(key, "fields")?;
        if parts.is_empty() || keys.next().is_some() {
            return Err(unresolved());
        }
        for member in parts {
            let identity = (
                identity.0,
                text(member, "module")?,
                text(member, "element")?,
            );
            let field = elements.get(&identity).copied().ok_or_else(unresolved)?;
            let scalar = at(field, "scalarType")?;
            let references_record = get(field, "references")
                .and_then(|value| items(value).ok())
                .is_some_and(|values| {
                    values.iter().any(|reference| {
                        get(reference, "role").is_some_and(|role| is(role, "record-type"))
                    })
                });
            let extended = matches!(get(field, "extensions"), Some(Value::Object(fields)) if !fields.is_empty());
            if !is_kind(field, "field")
                || !["boolean", "string", "integer", "decimal", "binary"]
                    .iter()
                    .any(|label| is(scalar, label))
                || !is(at(field, "cardinality")?, "one")
                || !is(at(field, "nullability")?, "required")
                || references_record
                || extended
            {
                return Err(unresolved());
            }
            if is(scalar, "decimal") {
                let facets = at(field, "facets")?;
                for key in ["precision", "scale"] {
                    if !matches!(get(facets, key), Some(Value::Number(n)) if n.abs() <= 9_007_199_254_740_991.0 && n.fract() == 0.0)
                    {
                        return Err(unresolved());
                    }
                }
            }
        }
    }
    if !entities.contains_key(&reference(at(ontology, "subject")?)?) {
        return Err(unresolved());
    }
    let mut context = HashSet::new();
    for source in list(ontology, "context")? {
        let identity = reference(source)?;
        if !context.insert(identity)
            || !elements
                .get(&identity)
                .is_some_and(|field| is_kind(field, "field"))
        {
            return Err(unresolved());
        }
    }
    let mut actions = HashSet::new();
    for value in list(ontology, "actions")? {
        if !actions.insert(string(value)?) {
            return Err(unresolved());
        }
    }
    check_action_purposes(ontology, &actions)?;
    let mut seen_associations = HashSet::new();
    let mut jobs = Vec::new();
    for selector in list(ontology, "associations")? {
        ctx.charge_work(1, Utf16::default())?;
        let kind = at(selector, "kind")?;
        let graph = is(kind, "core-relationship");
        if !graph && !is(kind, "record-members") {
            return Err(unresolved());
        }
        let identity =
            association_reference(at(selector, if graph { "relationship" } else { "type" })?)?;
        if !seen_associations.insert(identity) {
            return Err(unresolved());
        }
        let mut targets = Vec::new();
        let mut seen_targets = HashSet::new();
        for endpoint in list(selector, "endpoints")? {
            let target = reference(at(endpoint, "target")?)?;
            if seen_targets.insert(target) {
                targets.push(target);
            }
        }
        let witness = if graph {
            let witness = at(selector, "witness")?;
            if is(at(witness, "kind")?, "record-key") {
                Some(witness)
            } else {
                None
            }
        } else {
            Some(selector)
        };
        if let Some(witness) = witness {
            let target = reference(at(witness, "type")?)?;
            let index = entities.get(&target).copied().ok_or_else(unresolved)?;
            if text(&entities_source[index], "keyId")? != text(witness, "keyId")? {
                return Err(unresolved());
            }
            if seen_targets.insert(target) {
                targets.push(target);
            }
        }
        let scope = targets
            .into_iter()
            .map(|target| {
                entities
                    .get(&target)
                    .map(|index| n(*index))
                    .ok_or_else(unresolved)
            })
            .collect::<Result<_, _>>()?;
        let document_index = documents
            .get(identity.1.0)
            .copied()
            .ok_or_else(unresolved)?;
        jobs.push(obj(vec![
            ("documentIndex", n(document_index)),
            ("scope", Value::Array(scope)),
        ]));
    }
    Ok(Value::Array(jobs))
}

fn scalar_domain(field: &Value, identity: bool) -> Result<Value, EngineError> {
    let unresolved = || fail("SECURITY_ENTITY_TERM_UNRESOLVED");
    let scalar = at(field, "scalarType")?;
    let cardinality = at(field, "cardinality")?;
    let nullability = at(field, "nullability")?;
    let references_record = get(field, "references")
        .and_then(|value| items(value).ok())
        .is_some_and(|values| {
            values
                .iter()
                .any(|reference| get(reference, "role").is_some_and(|role| is(role, "record-type")))
        });
    let extended =
        matches!(get(field, "extensions"), Some(Value::Object(fields)) if !fields.is_empty());
    if !is(at(field, "kind")?, "field")
        || !["boolean", "string", "integer", "decimal", "binary"]
            .iter()
            .any(|label| is(scalar, label))
        || !is(cardinality, "one")
        || !(is(nullability, "required") || (!identity && is(nullability, "absent-allowed")))
        || references_record
        || extended
    {
        return Err(unresolved());
    }
    let empty = Value::Object(Vec::new());
    let facets = get(field, "facets").unwrap_or(&empty);
    if is(scalar, "decimal") {
        for key in ["precision", "scale"] {
            if !matches!(get(facets, key), Some(Value::Number(n)) if n.abs() <= 9_007_199_254_740_991.0 && n.fract() == 0.0)
            {
                return Err(unresolved());
            }
        }
    }
    Ok(obj(vec![
        ("scalarType", scalar.clone()),
        ("cardinality", cardinality.clone()),
        ("nullability", nullability.clone()),
        ("facets", facets.clone()),
        (
            "allowedValues",
            get(field, "allowedValues").cloned().unwrap_or(Value::Null),
        ),
    ]))
}

fn json_domain(
    prefix: &str,
    mut value: Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    fn sort(value: &mut Value) {
        match value {
            Value::Object(fields) => {
                fields.sort_by(|left, right| left.0.cmp(&right.0));
                fields.iter_mut().for_each(|(_, value)| sort(value));
            }
            Value::Array(items) => items.iter_mut().for_each(sort),
            _ => {}
        }
    }
    sort(&mut value);
    let mut units: Vec<_> = prefix.encode_utf16().collect();
    units.extend_from_slice(stringify_compact_metered(&value, ctx)?.units());
    Ok(Value::String(Utf16::new(units)))
}

fn document_element<'a>(
    document: &'a Value,
    module: &Utf16,
    element: &Utf16,
) -> Result<&'a Value, EngineError> {
    let module = list(document, "modules")?
        .iter()
        .find(|item| text(item, "id").ok() == Some(module))
        .ok_or_else(|| fail("SECURITY_ENTITY_TERM_UNRESOLVED"))?;
    list(module, "elements")?
        .iter()
        .find(|item| text(item, "id").ok() == Some(element))
        .ok_or_else(|| fail("SECURITY_ENTITY_TERM_UNRESOLVED"))
}

fn literal_schema() -> Result<&'static crate::schema::CompiledSchema, EngineError> {
    use crate::{
        schema::{CompiledSchema, SchemaResources},
        serialization::{Format, read_json_value},
    };
    static SCHEMA: std::sync::OnceLock<Result<CompiledSchema, EngineError>> =
        std::sync::OnceLock::new();
    SCHEMA
        .get_or_init(|| {
            let mut ctx = Context::ordinary();
            let source = include_str!("../../../spec/core/schema.json");
            let schema = read_json_value(
                &source.encode_utf16().collect::<Vec<_>>(),
                Format::Json,
                &mut ctx,
            )?;
            let literal = at(at(&schema, "$defs")?, "literal")?.clone();
            let root = obj(vec![
                ("$defs", obj(vec![("literal", literal)])),
                ("$ref", Value::String("#/$defs/literal".into())),
            ]);
            CompiledSchema::compile_consumer(&root, &SchemaResources::default(), true, &mut ctx)
        })
        .as_ref()
        .map_err(Clone::clone)
}

/// Type a checked association operand against its detached source fields.
pub fn association_operand_domain(
    input: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let selected = at(input, "term")?;
    let kind = text(selected, "kind")?;
    if kind == &Utf16::from("literal-shape") {
        return Ok(Value::Bool(
            literal_schema()?
                .validate(at(selected, "value")?, ctx)?
                .is_empty(),
        ));
    }
    let fields = list(input, "fields")?;
    if ["record-attribute", "constant"]
        .iter()
        .any(|name| kind == &Utf16::from(*name))
    {
        if let [field] = fields {
            return json_domain("scalar:", scalar_domain(field, false)?, ctx);
        }
    } else if ["entity-identity", "record-identity"]
        .iter()
        .any(|name| kind == &Utf16::from(*name))
    {
        let key = at(selected, "key")?;
        if fields.len() == list(key, "fields")?.len() {
            let domains = fields
                .iter()
                .map(|field| scalar_domain(field, true))
                .collect::<Result<_, _>>()?;
            return json_domain(
                "identity:",
                obj(vec![
                    ("type", at(selected, "type")?.clone()),
                    ("keyId", at(key, "id")?.clone()),
                    ("domains", Value::Array(domains)),
                ]),
                ctx,
            );
        }
    }
    Err(fail("SECURITY_ASSOCIATION_EXPRESSION_UNSUPPORTED"))
}

/// Produce a typed term from a host-selected source row. The original source
/// handles and the caller's shared literal budget remain in host custody.
pub fn entity_term(input: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let unresolved = || fail("SECURITY_ENTITY_TERM_UNRESOLVED");
    let term = at(input, "term")?;
    let kind = text(term, "kind")?.to_utf8().map_err(|_| unresolved())?;
    let (descriptor, domain) = match kind.as_str() {
        "subject" | "resource" => {
            let entity = at(input, "entity")?;
            let target = at(entity, "type")?;
            if let Some(identity) = get(term, "identity") {
                closed(term, &["kind", "identity"])?;
                if identity != &Value::Bool(true) {
                    return Err(unresolved());
                }
                let document = at(input, "document")?;
                let (document_id, module, element) = reference(target)?;
                if text(document, "id")? != document_id {
                    return Err(unresolved());
                }
                let record = document_element(document, module, element)?;
                let key_id = text(entity, "keyId")?;
                let key = list(record, "keys")?
                    .iter()
                    .find(|candidate| text(candidate, "id").ok() == Some(key_id))
                    .ok_or_else(unresolved)?;
                let mut domains = Vec::new();
                for part in list(key, "fields")? {
                    let field =
                        document_element(document, text(part, "module")?, text(part, "element")?)?;
                    domains.push(scalar_domain(field, true)?);
                }
                let descriptor = obj(vec![
                    ("kind", Value::string_utf8("entity-identity")),
                    ("context", Value::string_utf8(&kind)),
                    ("type", target.clone()),
                    ("key", key.clone()),
                ]);
                let domain = json_domain(
                    "identity:",
                    obj(vec![
                        ("type", target.clone()),
                        ("keyId", Value::String(key_id.clone())),
                        ("domains", Value::Array(domains)),
                    ]),
                    ctx,
                )?;
                (descriptor, domain)
            } else {
                closed(term, &["kind", "field"])?;
                let field = at(term, "field")?;
                let selected = reference(field)?;
                if !list(entity, "fields")?.iter().any(|row| {
                    get(row, "ref").and_then(|value| reference(value).ok()) == Some(selected)
                }) {
                    return Err(unresolved());
                }
                let descriptor = obj(vec![
                    ("kind", Value::string_utf8("record-attribute")),
                    ("context", Value::string_utf8(&kind)),
                    ("type", target.clone()),
                    ("field", field.clone()),
                ]);
                (
                    descriptor,
                    json_domain("scalar:", scalar_domain(at(input, "field")?, false)?, ctx)?,
                )
            }
        }
        "context" | "constant" => {
            let field = at(term, "field")?;
            let selected = reference(field)?;
            let descriptor = if kind == "context" {
                closed(term, &["kind", "field"])?;
                if !list(input, "context")?
                    .iter()
                    .any(|value| reference(value).ok() == Some(selected))
                {
                    return Err(unresolved());
                }
                obj(vec![
                    ("kind", Value::string_utf8("context-attribute")),
                    ("field", field.clone()),
                ])
            } else {
                closed(term, &["kind", "field", "value"])?;
                let value = at(term, "value")?;
                if !literal_schema()?.validate(value, ctx)?.is_empty() {
                    return Err(unresolved());
                }
                obj(vec![
                    ("kind", Value::string_utf8("constant")),
                    ("field", field.clone()),
                    ("value", value.clone()),
                ])
            };
            (
                descriptor,
                json_domain("scalar:", scalar_domain(at(input, "field")?, false)?, ctx)?,
            )
        }
        _ => return Err(unresolved()),
    };
    Ok(obj(vec![
        ("kind", Value::string_utf8("candidate-entity-term/0.1")),
        ("term", descriptor),
        ("domain", domain),
    ]))
}
