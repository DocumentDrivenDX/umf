// SPDX-License-Identifier: MIT OR Apache-2.0
//! Opt-in captured-graph checks for the frozen Python access DTO.
//!
//! This profile owns parameter declaration membership, Key parameter
//! component/identity consistency, and captured RecordRef/FieldRef ownership. It is intentionally separate from Python
//! capture and does not claim full graph parity.

use crate::{PyText, PythonConsumerValue};

pub const PROFILE: &str = "umf-access-captured-graph-validation/0.1.0";
pub const ORCHESTRATION_PROFILE: &str = "umf-access-capture-orchestration/0.1.0";

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Refusal {
    pub kind: &'static str,
    pub code: &'static str,
    pub rule: &'static str,
}

fn key(name: &str) -> PyText {
    PyText::from_utf8(name)
}

fn get<'a>(value: &'a PythonConsumerValue, name: &str) -> Option<&'a PythonConsumerValue> {
    let PythonConsumerValue::Object(fields) = value else {
        return None;
    };
    fields.iter().find(|(k, _)| k == &key(name)).map(|(_, v)| v)
}

fn tag<'a>(value: &'a PythonConsumerValue, expected: &str) -> Option<&'a PythonConsumerValue> {
    let name = get(value, "$type")?;
    let PythonConsumerValue::String(name) = name else {
        return None;
    };
    if name
        .codepoints()
        .iter()
        .map(|x| char::from_u32(*x))
        .collect::<Option<String>>()
        .as_deref()
        != Some(expected)
    {
        return None;
    }
    get(value, "fields")
}

fn tuple(value: &PythonConsumerValue) -> Option<&[PythonConsumerValue]> {
    match get(value, "$tuple")? {
        PythonConsumerValue::Array(items) => Some(items),
        _ => None,
    }
}

fn text(value: &PythonConsumerValue) -> Option<String> {
    let PythonConsumerValue::String(value) = value else {
        return None;
    };
    value
        .codepoints()
        .iter()
        .map(|x| char::from_u32(*x))
        .collect()
}

fn string(value: &PythonConsumerValue) -> Option<&PyText> {
    match value {
        PythonConsumerValue::String(value) => Some(value),
        _ => None,
    }
}

fn exact_object(value: &PythonConsumerValue, members: &[&str]) -> bool {
    let PythonConsumerValue::Object(fields) = value else {
        return false;
    };
    fields.len() == members.len() && members.iter().all(|name| get(value, name).is_some())
}

/// Apply the deterministic scheduling and terminal-authority portion of the
/// private Python capture seam. Callable execution and graph validation happen
/// in Python before each pair reaches this function.
pub fn orchestrate_capture_pair(input: &PythonConsumerValue) -> Result<Vec<Vec<String>>, Refusal> {
    let invalid = || Refusal {
        kind: "capture-error",
        code: "CAPTURE_DTO_INVALID",
        rule: "capture orchestration input is outside the closed profile",
    };
    if !exact_object(
        input,
        &[
            "profile",
            "stage",
            "kind",
            "parameters",
            "presence",
            "expectedUsed",
            "pairs",
        ],
    ) || get(input, "profile").and_then(text).as_deref() != Some(ORCHESTRATION_PROFILE)
    {
        return Err(invalid());
    }
    let Some(stage) = get(input, "stage").and_then(text) else {
        return Err(invalid());
    };
    let Some(kind) = get(input, "kind").and_then(text) else {
        return Err(invalid());
    };
    if !matches!(stage.as_str(), "discover" | "variant")
        || !matches!(kind.as_str(), "query" | "command")
    {
        return Err(invalid());
    }
    let Some(parameters) = get(input, "parameters").and_then(|v| match v {
        PythonConsumerValue::Array(a) => Some(a),
        _ => None,
    }) else {
        return Err(invalid());
    };
    let mut names = Vec::with_capacity(parameters.len());
    let mut optional = Vec::new();
    for parameter in parameters {
        if !exact_object(parameter, &["name", "optional"]) {
            return Err(invalid());
        }
        let Some(name) = get(parameter, "name").and_then(text) else {
            return Err(invalid());
        };
        let Some(PythonConsumerValue::Bool(is_optional)) = get(parameter, "optional") else {
            return Err(invalid());
        };
        if names.contains(&name) {
            return Err(invalid());
        }
        names.push(name.clone());
        if *is_optional {
            optional.push(name);
        }
    }
    let Some(presence) = get(input, "presence").and_then(|v| match v {
        PythonConsumerValue::Array(a) => Some(a),
        _ => None,
    }) else {
        return Err(invalid());
    };
    let mut presence_names = Vec::new();
    for item in presence {
        let Some(name) = text(item) else {
            return Err(invalid());
        };
        if !optional.contains(&name) || presence_names.contains(&name) {
            return Err(invalid());
        }
        presence_names.push(name);
    }
    let expected_used = match get(input, "expectedUsed") {
        Some(PythonConsumerValue::Null) if stage == "discover" => None,
        Some(PythonConsumerValue::Array(items)) if stage == "variant" => {
            let mut values = Vec::new();
            for item in items {
                let Some(name) = text(item) else {
                    return Err(invalid());
                };
                if !optional.contains(&name) || values.contains(&name) {
                    return Err(invalid());
                }
                values.push(name);
            }
            Some(values)
        }
        _ => return Err(invalid()),
    };
    let Some(PythonConsumerValue::Array(pairs)) = get(input, "pairs") else {
        return Err(invalid());
    };
    if pairs.len() != 2 {
        return Err(invalid());
    }
    let mut canonical = Vec::new();
    for pair in pairs {
        let Some(bytes) = get(pair, "canonical").and_then(string) else {
            return Err(invalid());
        };
        canonical.push(bytes);
    }
    if canonical[0] != canonical[1] {
        return Err(Refusal {
            kind: "capture-error",
            code: "CAPTURE_NONDETERMINISTIC",
            rule: "two captures differ",
        });
    }
    let mut uses = Vec::new();
    let mut nodes = Vec::new();
    for pair in pairs {
        if !exact_object(pair, &["canonical", "usedOptional", "terminalOp"]) {
            return Err(invalid());
        }
        let Some(PythonConsumerValue::Array(items)) = get(pair, "usedOptional") else {
            return Err(invalid());
        };
        let mut used = Vec::new();
        for item in items {
            let Some(name) = text(item) else {
                return Err(invalid());
            };
            if !optional.contains(&name) || used.contains(&name) {
                return Err(invalid());
            }
            used.push(name);
        }
        uses.push(used);
        nodes.push(get(pair, "terminalOp"));
    }
    let used_set = &uses[0];
    if stage == "discover" {
        if uses[1] != *used_set {
            return Err(invalid());
        }
        if used_set.len() > 4 {
            return Err(Refusal {
                kind: "capture-error",
                code: "VARIANT_LIMIT",
                rule: "optional filters exceed 16 variants",
            });
        }
        let ordered: Vec<String> = optional
            .iter()
            .filter(|name| used_set.contains(name))
            .cloned()
            .collect();
        let mut schedule = Vec::new();
        for size in 0..=ordered.len() {
            combinations(&ordered, size, 0, &mut Vec::new(), &mut schedule);
        }
        return Ok(schedule);
    }
    if uses[1] != *used_set {
        return Err(invalid());
    }
    if expected_used.as_ref() != Some(used_set) {
        return Err(Refusal {
            kind: "capture-error",
            code: "CAPTURE_UNSUPPORTED",
            rule: "optional-filter topology changes across variants",
        });
    }
    let terminal_op = nodes[0].and_then(text).ok_or_else(invalid)?;
    if (terminal_op == "update") != (kind == "command") {
        return Err(Refusal {
            kind: "capture-error",
            code: "CAPTURE_UNSUPPORTED",
            rule: "writes require command and reads require query",
        });
    }
    Ok(Vec::new())
}

fn combinations(
    values: &[String],
    remaining: usize,
    start: usize,
    current: &mut Vec<String>,
    output: &mut Vec<Vec<String>>,
) {
    if remaining == 0 {
        output.push(current.clone());
        return;
    }
    for index in start..=values.len().saturating_sub(remaining) {
        current.push(values[index].clone());
        combinations(values, remaining - 1, index + 1, current, output);
        current.pop();
    }
}

fn is_vector_carrier(value: &PythonConsumerValue) -> bool {
    if !exact_object(value, &["$typing", "args"])
        || text(get(value, "$typing").unwrap_or(&PythonConsumerValue::Null)).as_deref()
            != Some("builtins.tuple")
    {
        return false;
    }
    let Some(PythonConsumerValue::Array(args)) = get(value, "args") else {
        return false;
    };
    args.len() == 2
        && exact_object(&args[0], &["$typeRef"])
        && text(get(&args[0], "$typeRef").unwrap_or(&PythonConsumerValue::Null)).as_deref()
            == Some("builtins.float")
        && exact_object(&args[1], &["$ellipsis"])
        && matches!(
            get(&args[1], "$ellipsis"),
            Some(PythonConsumerValue::Bool(true))
        )
}

fn has_omitted(value: &PythonConsumerValue) -> bool {
    if let Some(fields) = tag(value, "umf_access.dsl._nodes.Node") {
        if get(fields, "op").and_then(text).as_deref() == Some("omitted") {
            return true;
        }
        return get(fields, "args")
            .and_then(tuple)
            .is_some_and(|items| items.iter().any(has_omitted));
    }
    tuple(value).is_some_and(|items| items.iter().any(has_omitted))
}

fn update_temporal_parameter_profiles(
    op: &str,
    args: &[PythonConsumerValue],
    profiles: &mut Vec<(String, String)>,
) -> Result<(), Refusal> {
    if !matches!(
        op,
        "=" | "<>"
            | "<"
            | "<="
            | ">"
            | ">="
            | "BETWEEN"
            | "IN"
            | "NOT IN"
            | "IS DISTINCT FROM"
            | "IS NOT DISTINCT FROM"
    ) {
        return Ok(());
    }
    let Some(left) = args.first() else {
        return Ok(());
    };
    let Some(left_fields) = tag(left, "umf_access.dsl._nodes.Node") else {
        return Ok(());
    };
    if get(left_fields, "op").and_then(text).as_deref() != Some("column") {
        return Ok(());
    }
    let Some(field) = get(left_fields, "args")
        .and_then(tuple)
        .and_then(|args| args.first())
        .and_then(|field| tag(field, "umf_access.dsl._nodes.FieldRef"))
    else {
        return Err(refuse_dto());
    };
    let Some(temporal) = get(field, "temporal")
        .filter(|value| !matches!(value, PythonConsumerValue::Null))
        .and_then(text)
    else {
        return Ok(());
    };
    for right in args.iter().skip(1) {
        let Some(right_fields) = tag(right, "umf_access.dsl._nodes.Node") else {
            continue;
        };
        if get(right_fields, "op").and_then(text).as_deref() != Some("param") {
            continue;
        }
        let Some(name) = get(right_fields, "args")
            .and_then(tuple)
            .and_then(|args| args.first())
            .and_then(text)
        else {
            return Err(refuse_dto());
        };
        if let Some((_, previous)) = profiles.iter().find(|(parameter, _)| parameter == &name) {
            if previous != &temporal {
                return Err(Refusal {
                    kind: "capture-error",
                    code: "CAPTURE_UNSUPPORTED",
                    rule: "parameter spans incompatible temporal profiles",
                });
            }
        } else {
            profiles.push((name, temporal.clone()));
        }
    }
    Ok(())
}

fn text_value_for_validator(value: &str) -> PythonConsumerValue {
    PythonConsumerValue::String(PyText::from_utf8(value))
}

fn refuse_dto() -> Refusal {
    Refusal {
        kind: "capture-error",
        code: "CAPTURE_DTO_INVALID",
        rule: "captured variant shape is outside graph validator profile",
    }
}

fn identity_pairs(value: &PythonConsumerValue) -> Result<Vec<(String, String)>, Refusal> {
    let Some(items) = tuple(value) else {
        return Err(refuse_dto());
    };
    let mut pairs = Vec::with_capacity(items.len());
    for item in items {
        let Some(pair) = tuple(item) else {
            return Err(refuse_dto());
        };
        if pair.len() != 2 {
            return Err(refuse_dto());
        }
        let (Some(name), Some(value)) = (text(&pair[0]), text(&pair[1])) else {
            return Err(refuse_dto());
        };
        if pairs.iter().any(|(existing, _)| existing == &name) {
            return Err(refuse_dto());
        }
        pairs.push((name, value));
    }
    Ok(pairs)
}

fn selected_key_identity(value: &PythonConsumerValue) -> Result<Vec<(String, String)>, Refusal> {
    let Some(fields) = tag(value, "umf_access.dsl._nodes.Node") else {
        return Err(refuse_dto());
    };
    let Some(op) = get(fields, "op").and_then(text) else {
        return Err(refuse_dto());
    };
    let Some(args) = get(fields, "args").and_then(tuple) else {
        return Err(refuse_dto());
    };
    match op.as_str() {
        "key_param" => {
            if args.len() != 3 {
                return Err(refuse_dto());
            }
            identity_pairs(&args[2])
        }
        "key" => {
            if args.len() != 1 {
                return Err(refuse_dto());
            }
            let literal = &args[0];
            let key_fields =
                tag(literal, "umf_access.dsl._nodes.KeyLiteral").ok_or_else(refuse_dto)?;
            identity_pairs(get(key_fields, "identity").ok_or_else(refuse_dto)?)
        }
        // Python's selected-Key preflight uses an empty identity for other
        // well-formed Node operands; the subsequent graph walk owns their rule.
        _ => Ok(Vec::new()),
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct Owner {
    module: String,
    element: String,
    alias: Option<String>,
}

fn owner(value: &PythonConsumerValue, expected: &str) -> Option<Owner> {
    let fields = tag(value, expected)?;
    let module = get(fields, "module").and_then(text)?;
    let element = get(fields, "element").and_then(text)?;
    let alias = match get(fields, "alias")? {
        PythonConsumerValue::Null => None,
        value => Some(text(value)?),
    };
    Some(Owner {
        module,
        element,
        alias,
    })
}

/// Validate the demonstrable v3 subset: every `param` or `key_param` node
/// encountered in tagged DTO traversal must name a declared captured parameter;
/// Key parameter component and identity tuples must match that declaration.
pub fn validate_captured_variant(input: &PythonConsumerValue) -> Result<(), Refusal> {
    let Some(fields) = tag(input, "umf_access.capture.CapturedVariant") else {
        return Err(refuse_dto());
    };
    let Some(params) = get(fields, "parameters").and_then(tuple) else {
        return Err(refuse_dto());
    };
    struct Parameter<'a> {
        name: String,
        carrier: Option<&'a PythonConsumerValue>,
        key_components: &'a PythonConsumerValue,
        key_identity: &'a PythonConsumerValue,
    }
    let mut declared = Vec::new();
    for param in params {
        let Some(pfields) = tag(param, "umf_access.capture.CapturedParameter") else {
            return Err(refuse_dto());
        };
        let Some(name) = get(pfields, "name").and_then(text) else {
            return Err(refuse_dto());
        };
        let carrier = get(pfields, "carrier");
        let Some(components) =
            get(pfields, "key_components").filter(|value| tuple(value).is_some())
        else {
            return Err(refuse_dto());
        };
        let Some(identity) = get(pfields, "key_identity").filter(|value| tuple(value).is_some())
        else {
            return Err(refuse_dto());
        };
        declared.push(Parameter {
            name,
            carrier,
            key_components: components,
            key_identity: identity,
        });
    }
    let Some(node) = get(fields, "node") else {
        return Err(refuse_dto());
    };
    // Python computes the complete join-owner set before visiting expression
    // nodes. Keep that checkpoint so an absent join source wins over a later
    // expression refusal.
    let mut owners = Vec::new();
    let Some(node_fields) = tag(node, "umf_access.dsl._nodes.Node") else {
        return Err(refuse_dto());
    };
    let Some(args) = get(node_fields, "args").and_then(tuple) else {
        return Err(refuse_dto());
    };
    let Some(terminal_op) = get(node_fields, "op").and_then(text) else {
        return Err(refuse_dto());
    };
    // Keep this profile bounded to terminals whose capture shape and selected
    // Key preflight are represented here. Python's public capture remains the
    // authority for all other terminal checks.
    if !matches!(
        terminal_op.as_str(),
        "all"
            | "first"
            | "one"
            | "count"
            | "exists"
            | "get"
            | "page"
            | "group_count"
            | "update"
            | "search_top"
    ) {
        return Err(Refusal {
            kind: "capture-error",
            code: "CAPTURE_UNSUPPORTED",
            rule: "unsupported terminal form",
        });
    }
    if args.is_empty() || tag(&args[0], "umf_access.dsl._nodes.RecordRef").is_none() {
        return Err(Refusal {
            kind: "capture-error",
            code: "CAPTURE_UNSUPPORTED",
            rule: "terminal has no record identity",
        });
    }
    if args.len() < 2 {
        return Err(refuse_dto());
    }
    if (matches!(
        terminal_op.as_str(),
        "all" | "first" | "one" | "count" | "exists" | "group_count"
    ) && args.len() != 2)
        || (terminal_op == "get" && args.len() != 3)
        || (terminal_op == "page" && args.len() != 4)
        || (terminal_op == "update" && args.len() != 3)
        || (terminal_op == "search_top" && args.len() != 5)
    {
        return Err(refuse_dto());
    }
    let Some(root) = owner(&args[0], "umf_access.dsl._nodes.RecordRef") else {
        return Err(refuse_dto());
    };
    let Some(steps) = tuple(&args[1]) else {
        return Err(refuse_dto());
    };
    if terminal_op == "update" {
        let Some(assignments) = tuple(&args[2]) else {
            return Err(refuse_dto());
        };
        if assignments.is_empty()
            || assignments.iter().any(|assignment| {
                tuple(assignment).is_none_or(|pair| {
                    pair.len() != 2
                        || tag(&pair[0], "umf_access.dsl._nodes.FieldRef").is_none()
                        || tag(&pair[1], "umf_access.dsl._nodes.Node").is_none()
                })
            })
        {
            return Err(refuse_dto());
        }
    }
    let mut selections = Vec::new();
    let mut has_group = false;
    let mut has_into = false;
    for step in steps {
        let Some(step_fields) = tag(step, "umf_access.dsl._nodes.Node") else {
            return Err(refuse_dto());
        };
        let Some(step_op) = get(step_fields, "op").and_then(text) else {
            return Err(refuse_dto());
        };
        let Some(step_args) = get(step_fields, "args").and_then(tuple) else {
            return Err(refuse_dto());
        };
        if step_op == "group" {
            has_group = true;
        }
        if step_op == "into" {
            has_into = true;
        }
        if step_op == "select" {
            selections.extend(step_args.iter());
        }
    }
    if has_group && selections.is_empty() && !has_into && terminal_op != "group_count" {
        return Err(Refusal {
            kind: "capture-error",
            code: "CAPTURE_UNSUPPORTED",
            rule: "grouped query requires explicit selection or count",
        });
    }
    let scalar_selection = selections
        .iter()
        .any(|value| tag(value, "umf_access.dsl._nodes.Node").is_some());
    if scalar_selection && !matches!(terminal_op.as_str(), "all" | "first" | "one") {
        return Err(Refusal {
            kind: "capture-error",
            code: "CAPTURE_UNSUPPORTED",
            rule: "scalar aggregate/bucket projection does not admit this terminal",
        });
    }
    owners.push(root);
    for step in steps {
        let Some(step_fields) = tag(step, "umf_access.dsl._nodes.Node") else {
            return Err(refuse_dto());
        };
        let Some(op) = get(step_fields, "op").and_then(text) else {
            return Err(refuse_dto());
        };
        let Some(step_args) = get(step_fields, "args").and_then(tuple) else {
            return Err(refuse_dto());
        };
        if op == "join" {
            let Some(join_value) = step_args.first() else {
                return Err(refuse_dto());
            };
            let Some(join_fields) = tag(join_value, "umf_access.dsl._expressions.Join") else {
                return Err(refuse_dto());
            };
            let Some(ref_value) = get(join_fields, "ref") else {
                return Err(refuse_dto());
            };
            let Some(source) = owner(ref_value, "umf_access.dsl._nodes.FieldRef") else {
                return Err(refuse_dto());
            };
            if !owners.contains(&source) {
                return Err(Refusal {
                    kind: "capture-error",
                    code: "CAPTURE_UNSUPPORTED",
                    rule: "join source is absent",
                });
            }
            let Some(target_value) = get(join_fields, "target") else {
                return Err(refuse_dto());
            };
            let Some(target) = owner(target_value, "umf_access.dsl._nodes.RecordRef") else {
                return Err(refuse_dto());
            };
            owners.push(target);
        }
    }
    // Python validates selected Key ownership after the complete join-owner
    // preflight and before walking expressions. Keep that exact precedence.
    if terminal_op == "get" || terminal_op == "page" {
        let key_value = if terminal_op == "get" {
            &args[2]
        } else {
            &args[3]
        };
        let identity = selected_key_identity(key_value)?;
        let root_fields =
            tag(&args[0], "umf_access.dsl._nodes.RecordRef").ok_or_else(refuse_dto)?;
        let root_module =
            text(get(root_fields, "module").ok_or_else(refuse_dto)?).ok_or_else(refuse_dto)?;
        let root_element =
            text(get(root_fields, "element").ok_or_else(refuse_dto)?).ok_or_else(refuse_dto)?;
        if !identity.is_empty() {
            let module = identity
                .iter()
                .find(|(name, _)| name == "module")
                .map(|(_, value)| value.as_str())
                .ok_or_else(refuse_dto)?;
            let element = identity
                .iter()
                .find(|(name, _)| name == "element")
                .map(|(_, value)| value.as_str())
                .ok_or_else(refuse_dto)?;
            if (module, element) != (root_module.as_str(), root_element.as_str()) {
                return Err(Refusal {
                    kind: "capture-error",
                    code: "CAPTURE_SIGNATURE",
                    rule: "Key belongs to another Record",
                });
            }
        }
        let key_id_value = get(root_fields, "key_id").ok_or_else(refuse_dto)?;
        let key_id = match key_id_value {
            PythonConsumerValue::Null => None,
            value => Some(text(value).ok_or_else(refuse_dto)?),
        };
        let source_value = get(root_fields, "source").ok_or_else(refuse_dto)?;
        let source = if matches!(source_value, PythonConsumerValue::Null) {
            None
        } else {
            Some(source_value)
        };
        if let (Some(key_id), Some(source)) = (key_id, source) {
            let source_fields =
                tag(source, "umf_access.dsl._nodes.GeneratedSource").ok_or_else(refuse_dto)?;
            let document_id = get(source_fields, "document_id")
                .and_then(text)
                .ok_or_else(refuse_dto)?;
            let core_version = get(source_fields, "core_version")
                .and_then(text)
                .ok_or_else(refuse_dto)?;
            let expected = [
                ("documentId", document_id),
                ("coreVersion", core_version),
                ("module", root_module),
                ("element", root_element),
                ("key", key_id),
            ];
            if identity.len() != expected.len()
                || expected.iter().any(|(name, value)| {
                    identity
                        .iter()
                        .find(|(actual, _)| actual.as_str() == *name)
                        .map(|(_, actual)| actual.as_str())
                        != Some(value.as_str())
                })
            {
                return Err(Refusal {
                    kind: "capture-error",
                    code: "CAPTURE_SIGNATURE",
                    rule: "Key differs from selected Record Key",
                });
            }
        }
    }
    fn visit(
        value: &PythonConsumerValue,
        declared: &[Parameter<'_>],
        owners: &[Owner],
        input: &PythonConsumerValue,
        temporal_profiles: &mut Vec<(String, String)>,
    ) -> Result<(), Refusal> {
        if let Some(fields) = tag(value, "umf_access.dsl._nodes.Node") {
            let Some(op) = get(fields, "op").and_then(text) else {
                return Err(refuse_dto());
            };
            let Some(args) = get(fields, "args").and_then(tuple) else {
                return Err(refuse_dto());
            };
            if op == "related" {
                if args.len() != 4 {
                    return Err(Refusal {
                        kind: "capture-error",
                        code: "CAPTURE_UNSUPPORTED",
                        rule: "malformed navigation source",
                    });
                }
                let source = &args[0];
                let Some(source_steps) = tuple(&args[1]) else {
                    return Err(Refusal {
                        kind: "capture-error",
                        code: "CAPTURE_UNSUPPORTED",
                        rule: "closed navigation source required",
                    });
                };
                if source_steps
                    .iter()
                    .any(|step| tag(step, "umf_access.dsl._nodes.Node").is_none())
                {
                    return Err(Refusal {
                        kind: "capture-error",
                        code: "CAPTURE_UNSUPPORTED",
                        rule: "closed navigation source required",
                    });
                }
                let Some(relation_fields) = get(&args[2], "fields") else {
                    return Err(Refusal {
                        kind: "capture-error",
                        code: "CAPTURE_UNSUPPORTED",
                        rule: "malformed navigation source",
                    });
                };
                let Some(relation_tag) = get(&args[2], "$type").and_then(text) else {
                    return Err(Refusal {
                        kind: "capture-error",
                        code: "CAPTURE_UNSUPPORTED",
                        rule: "malformed navigation source",
                    });
                };
                let relationship = &args[2];
                let Some(direction) = text(&args[3]) else {
                    return Err(Refusal {
                        kind: "capture-error",
                        code: "CAPTURE_UNSUPPORTED",
                        rule: "closed navigation source required",
                    });
                };
                if !matches!(direction.as_str(), "forward" | "inverse") {
                    return Err(Refusal {
                        kind: "capture-error",
                        code: "CAPTURE_UNSUPPORTED",
                        rule: "closed navigation source required",
                    });
                }
                let relation_family = match relation_tag.as_str() {
                    "umf_access.dsl.navigation.RequiredNavigation"
                    | "umf_access.dsl.navigation.OptionalNavigation" => "join",
                    "umf_access.dsl.navigation.ManyNavigation" => "many",
                    _ => {
                        return Err(Refusal {
                            kind: "capture-error",
                            code: "CAPTURE_UNSUPPORTED",
                            rule: "closed navigation source required",
                        });
                    }
                };
                let Some(source_query) = get(relation_fields, "source_query") else {
                    return Err(Refusal {
                        kind: "capture-error",
                        code: "CAPTURE_UNSUPPORTED",
                        rule: "malformed navigation source",
                    });
                };
                let Some(target_query) = get(relation_fields, "target_query") else {
                    return Err(Refusal {
                        kind: "capture-error",
                        code: "CAPTURE_UNSUPPORTED",
                        rule: "malformed navigation source",
                    });
                };
                let (expected_source, expected_target) = if direction == "forward" {
                    (source_query, target_query)
                } else {
                    (target_query, source_query)
                };
                if source != expected_source {
                    return Err(Refusal {
                        kind: "capture-error",
                        code: "CAPTURE_UNSUPPORTED",
                        rule: "navigation selected root differs",
                    });
                }
                // Python compares RecordRef dataclasses, including pinned source,
                // key metadata and alias, for the selected navigation root.
                let selected_root = get(input, "fields")
                    .and_then(|fields| get(fields, "node"))
                    .and_then(|node| get(node, "fields"))
                    .and_then(|node_fields| get(node_fields, "args"))
                    .and_then(tuple)
                    .and_then(|terminal_args| terminal_args.first())
                    .ok_or_else(refuse_dto)?;
                if selected_root != expected_target {
                    return Err(Refusal {
                        kind: "capture-error",
                        code: "CAPTURE_UNSUPPORTED",
                        rule: "navigation selected root differs",
                    });
                }
                let relationship_type = get(relationship, "$type")
                    .and_then(text)
                    .ok_or_else(refuse_dto)?;
                let supported_relationship = match relation_family {
                    "many" => relationship_type == "umf_access.dsl.navigation.ManyNavigation",
                    _ => {
                        relation_tag == relationship_type
                            && matches!(
                                relation_tag.as_str(),
                                "umf_access.dsl.navigation.RequiredNavigation"
                                    | "umf_access.dsl.navigation.OptionalNavigation"
                            )
                    }
                };
                if !supported_relationship {
                    return Err(Refusal {
                        kind: "capture-error",
                        code: "CAPTURE_UNSUPPORTED",
                        rule: "closed navigation source required",
                    });
                }
                let source_node = PythonConsumerValue::Object(vec![
                    (
                        key("$type"),
                        text_value_for_validator("umf_access.dsl._nodes.Node"),
                    ),
                    (
                        key("fields"),
                        PythonConsumerValue::Object(vec![
                            (key("op"), text_value_for_validator("all")),
                            (
                                key("args"),
                                PythonConsumerValue::Object(vec![(
                                    key("$tuple"),
                                    PythonConsumerValue::Array(vec![
                                        source.clone(),
                                        args[1].clone(),
                                    ]),
                                )]),
                            ),
                        ]),
                    ),
                ]);
                let source_variant = PythonConsumerValue::Object(vec![
                    (
                        key("$type"),
                        text_value_for_validator("umf_access.capture.CapturedVariant"),
                    ),
                    (
                        key("fields"),
                        PythonConsumerValue::Object(vec![
                            (key("node"), source_node),
                            (
                                key("parameters"),
                                get(get(input, "fields").ok_or_else(refuse_dto)?, "parameters")
                                    .ok_or_else(refuse_dto)?
                                    .clone(),
                            ),
                        ]),
                    ),
                ]);
                validate_captured_variant(&source_variant)?;
                return Ok(());
            }
            if op == "aggregate" || op == "bucket_width" {
                let scalar_shape_valid = if op == "aggregate" {
                    args.len() == 3
                        && (tag(&args[1], "umf_access.dsl._nodes.FieldRef").is_some()
                            || (matches!(args[1], PythonConsumerValue::Null)
                                && args.first().and_then(text).as_deref() == Some("count")))
                } else {
                    args.len() == 2 && tag(&args[0], "umf_access.dsl._nodes.FieldRef").is_some()
                };
                if !scalar_shape_valid {
                    return Err(Refusal {
                        kind: "capture-error",
                        code: "CAPTURE_UNSUPPORTED",
                        rule: "unknown scalar expression",
                    });
                }
                if op == "aggregate" {
                    let aggregate_op = args.first().and_then(text).ok_or_else(refuse_dto)?;
                    if !matches!(
                        aggregate_op.as_str(),
                        "sum"
                            | "min"
                            | "max"
                            | "avg"
                            | "count"
                            | "count_distinct"
                            | "approx_count_distinct"
                    ) {
                        return Err(Refusal {
                            kind: "capture-error",
                            code: "CAPTURE_UNSUPPORTED",
                            rule: "unknown aggregate operation",
                        });
                    }
                    let field = &args[1];
                    if tag(field, "umf_access.dsl._nodes.FieldRef").is_some()
                        && get(
                            tag(field, "umf_access.dsl._nodes.FieldRef").unwrap(),
                            "temporal",
                        )
                        .is_some_and(|value| !matches!(value, PythonConsumerValue::Null))
                    {
                        return Err(Refusal {
                            kind: "capture-error",
                            code: "CAPTURE_UNSUPPORTED",
                            rule: "temporal aggregate qualification is held",
                        });
                    }
                    if aggregate_op == "avg" {
                        let valid_scale = match &args[2] {
                            PythonConsumerValue::Integer(value) => value
                                .to_string()
                                .parse::<i64>()
                                .is_ok_and(|scale| (0..=1000).contains(&scale)),
                            _ => false,
                        };
                        if !valid_scale {
                            return Err(Refusal {
                                kind: "capture-error",
                                code: "CAPTURE_UNSUPPORTED",
                                rule: "average requires bounded literal scale",
                            });
                        }
                    }
                }
            }
            update_temporal_parameter_profiles(&op, args, temporal_profiles)?;
            if matches!(op.as_str(), "and" | "or" | "not") && has_omitted(value) {
                return Err(Refusal {
                    kind: "capture-error",
                    code: "CAPTURE_UNSUPPORTED",
                    rule: "optional filters must be top-level filter arguments",
                });
            }
            if op == "param" || op == "key_param" {
                let Some(name) = args.first().and_then(text) else {
                    return Err(refuse_dto());
                };
                let Some(parameter) = declared.iter().find(|parameter| parameter.name == name)
                else {
                    return Err(Refusal {
                        kind: "capture-error",
                        code: "CAPTURE_SIGNATURE",
                        rule: "expression references an undeclared parameter",
                    });
                };
                if op == "key_param" {
                    let Some(components) = args.get(1) else {
                        return Err(refuse_dto());
                    };
                    let Some(identity) = args.get(2) else {
                        return Err(refuse_dto());
                    };
                    if components != parameter.key_components || identity != parameter.key_identity
                    {
                        return Err(Refusal {
                            kind: "capture-error",
                            code: "CAPTURE_SIGNATURE",
                            rule: "Key component parameters differ from declared carrier",
                        });
                    }
                }
            }
            for child in args {
                visit(child, declared, owners, input, temporal_profiles)?;
            }
        } else if let Some(fields) = tag(value, "umf_access.dsl.search.SearchLeg") {
            let Some(record_value) = get(fields, "record") else {
                return Err(refuse_dto());
            };
            let Some(search_record) = owner(record_value, "umf_access.dsl._nodes.RecordRef") else {
                return Err(refuse_dto());
            };
            let Some(root_fields) = tag(
                get(input, "fields")
                    .and_then(|fields| get(fields, "node"))
                    .and_then(|node| get(node, "fields"))
                    .and_then(|node_fields| get(node_fields, "args"))
                    .and_then(tuple)
                    .and_then(|args| args.first())
                    .ok_or_else(refuse_dto)?,
                "umf_access.dsl._nodes.RecordRef",
            ) else {
                return Err(refuse_dto());
            };
            let Some(root_module) = get(root_fields, "module").and_then(text) else {
                return Err(refuse_dto());
            };
            let Some(root_element) = get(root_fields, "element").and_then(text) else {
                return Err(refuse_dto());
            };
            if search_record.module != root_module || search_record.element != root_element {
                return Err(Refusal {
                    kind: "capture-error",
                    code: "SEARCH_DECLARATION",
                    rule: "foreign search Record",
                });
            }
            let Some(kind) = get(fields, "kind").and_then(text) else {
                return Err(refuse_dto());
            };
            if let Some(value) =
                get(fields, "value").filter(|value| !matches!(value, PythonConsumerValue::Null))
            {
                let Some(value_fields) = tag(value, "umf_access.dsl._nodes.Node") else {
                    return Err(refuse_dto());
                };
                if get(value_fields, "op").and_then(text).as_deref() != Some("param") {
                    return Err(Refusal {
                        kind: "capture-error",
                        code: "SEARCH_DECLARATION",
                        rule: "search requires bound parameters",
                    });
                }
                let Some(args) = get(value_fields, "args").and_then(tuple) else {
                    return Err(refuse_dto());
                };
                let Some(name) = args.first().and_then(text) else {
                    return Err(refuse_dto());
                };
                let Some(parameter) = declared.iter().find(|parameter| parameter.name == name)
                else {
                    return Err(Refusal {
                        kind: "capture-error",
                        code: "CAPTURE_SIGNATURE",
                        rule: "search parameter carrier differs from selected leg",
                    });
                };
                let matches = if kind == "vector" {
                    parameter.carrier.is_some_and(is_vector_carrier)
                } else {
                    let carrier_tag = parameter
                        .carrier
                        .and_then(|carrier| get(carrier, "$typeRef"))
                        .and_then(text);
                    carrier_tag.as_deref() == Some("builtins.str")
                };
                if !matches {
                    return Err(Refusal {
                        kind: "capture-error",
                        code: "CAPTURE_SIGNATURE",
                        rule: "search parameter carrier differs from selected leg",
                    });
                }
                visit(value, declared, owners, input, temporal_profiles)?;
            }
            if let Some(legs) = get(fields, "legs") {
                let items = tuple(legs)
                    .or_else(|| match legs {
                        PythonConsumerValue::Object(fields) => fields
                            .iter()
                            .find(|(name, _)| name == &key("$list"))
                            .and_then(|(_, value)| match value {
                                PythonConsumerValue::Array(items) => Some(items.as_slice()),
                                _ => None,
                            }),
                        _ => None,
                    })
                    .ok_or_else(refuse_dto)?;
                for leg in items {
                    visit(leg, declared, owners, input, temporal_profiles)?;
                }
            }
        } else if tag(value, "umf_access.dsl._nodes.FieldRef").is_some() {
            let Some(found) = owner(value, "umf_access.dsl._nodes.FieldRef") else {
                return Err(refuse_dto());
            };
            if !owners.is_empty() && !owners.contains(&found) {
                return Err(Refusal {
                    kind: "type-error",
                    code: "",
                    rule: "expression column belongs to another Record",
                });
            }
        } else if let Some(fields) = tag(value, "umf_access.dsl._expressions.Join") {
            let Some(reference) = get(fields, "ref") else {
                return Err(refuse_dto());
            };
            visit(reference, declared, owners, input, temporal_profiles)?;
        } else if let Some(fields) = match value {
            PythonConsumerValue::Object(fields)
                if fields.iter().any(|(name, _)| name == &key("$type")) =>
            {
                let tag_name = get(value, "$type").and_then(text).ok_or_else(refuse_dto)?;
                if get(value, "fields").is_none() {
                    return Err(refuse_dto());
                }
                if !matches!(
                    tag_name.as_str(),
                    "umf_access.capture.CapturedVariant"
                        | "umf_access.capture.CapturedParameter"
                        | "umf_access.dsl._nodes.FieldRef"
                        | "umf_access.dsl._nodes.GeneratedSource"
                        | "umf_access.dsl._nodes.KeyLiteral"
                        | "umf_access.dsl._nodes.RecordRef"
                ) {
                    return Err(refuse_dto());
                }
                if tag_name == "umf_access.dsl._nodes.RecordRef"
                    && owner(value, "umf_access.dsl._nodes.RecordRef").is_none()
                {
                    return Err(refuse_dto());
                }
                if tag_name == "umf_access.dsl._nodes.FieldRef"
                    && owner(value, "umf_access.dsl._nodes.FieldRef").is_none()
                {
                    return Err(refuse_dto());
                }
                Some(tag_name)
            }
            _ => None,
        } {
            // These DTO values are leaves in Python's graph walker. In
            // particular, RecordRef.key contains FieldRefs but is not walked.
            let _ = fields;
        } else if let Some(items) = tuple(value) {
            for child in items {
                visit(child, declared, owners, input, temporal_profiles)?;
            }
        } else if let PythonConsumerValue::Array(items) = value {
            for child in items {
                visit(child, declared, owners, input, temporal_profiles)?;
            }
        }
        Ok(())
    }
    visit(node, &declared, &owners, input, &mut Vec::new())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn obj(fields: &[(&str, PythonConsumerValue)]) -> PythonConsumerValue {
        PythonConsumerValue::Object(fields.iter().map(|(k, v)| (key(k), v.clone())).collect())
    }
    fn text_value(value: &str) -> PythonConsumerValue {
        PythonConsumerValue::String(PyText::from_utf8(value))
    }
    fn tagged(name: &str, fields: PythonConsumerValue) -> PythonConsumerValue {
        obj(&[("$type", text_value(name)), ("fields", fields)])
    }
    fn tuple_value(values: Vec<PythonConsumerValue>) -> PythonConsumerValue {
        obj(&[("$tuple", PythonConsumerValue::Array(values))])
    }
    fn orchestration_input(first: PyText, second: PyText) -> PythonConsumerValue {
        let pair = |canonical: PyText| {
            obj(&[
                ("canonical", PythonConsumerValue::String(canonical)),
                ("usedOptional", PythonConsumerValue::Array(vec![])),
                ("terminalOp", text_value("all")),
            ])
        };
        obj(&[
            ("profile", text_value(ORCHESTRATION_PROFILE)),
            ("stage", text_value("discover")),
            ("kind", text_value("query")),
            ("parameters", PythonConsumerValue::Array(vec![])),
            ("presence", PythonConsumerValue::Array(vec![])),
            ("expectedUsed", PythonConsumerValue::Null),
            (
                "pairs",
                PythonConsumerValue::Array(vec![pair(first), pair(second)]),
            ),
        ])
    }
    fn graph(parameter_name: &str, declared: &str) -> PythonConsumerValue {
        let node = tagged(
            "umf_access.dsl._nodes.Node",
            obj(&[
                ("op", text_value("param")),
                ("args", tuple_value(vec![text_value(parameter_name)])),
            ]),
        );
        owner_graph(vec![owner_filter(node)], vec![parameter(declared)])
    }

    #[test]
    fn orchestration_compares_python_codepoints_without_losing_surrogates() {
        let surrogate = PyText::from_codepoints(vec![0xd800]).unwrap();
        assert_eq!(
            orchestrate_capture_pair(&orchestration_input(surrogate.clone(), surrogate.clone())),
            Ok(vec![vec![]])
        );
        assert_eq!(
            orchestrate_capture_pair(&orchestration_input(
                surrogate,
                PyText::from_utf8("different")
            )),
            Err(Refusal {
                kind: "capture-error",
                code: "CAPTURE_NONDETERMINISTIC",
                rule: "two captures differ",
            })
        );
    }
    fn key_param_graph(
        parameter_name: &str,
        declared: &str,
        parameter_components: PythonConsumerValue,
        parameter_identity: PythonConsumerValue,
        node_components: PythonConsumerValue,
        node_identity: PythonConsumerValue,
    ) -> PythonConsumerValue {
        let parameter = tagged(
            "umf_access.capture.CapturedParameter",
            obj(&[
                ("name", text_value(declared)),
                ("key_components", parameter_components),
                ("key_identity", parameter_identity),
            ]),
        );
        let node = tagged(
            "umf_access.dsl._nodes.Node",
            obj(&[
                ("op", text_value("key_param")),
                (
                    "args",
                    tuple_value(vec![
                        text_value(parameter_name),
                        node_components,
                        node_identity,
                    ]),
                ),
            ]),
        );
        owner_graph(vec![owner_filter(node)], vec![parameter])
    }
    fn key_tuple(values: &[&str]) -> PythonConsumerValue {
        tuple_value(values.iter().map(|value| text_value(value)).collect())
    }
    fn key_identity(values: &[(&str, &str)]) -> PythonConsumerValue {
        tuple_value(
            values
                .iter()
                .map(|(key, value)| key_tuple(&[key, value]))
                .collect(),
        )
    }

    fn record(module: &str, element: &str, alias: Option<&str>) -> PythonConsumerValue {
        tagged(
            "umf_access.dsl._nodes.RecordRef",
            obj(&[
                ("module", text_value(module)),
                ("element", text_value(element)),
                (
                    "alias",
                    alias.map(text_value).unwrap_or(PythonConsumerValue::Null),
                ),
                ("key_id", PythonConsumerValue::Null),
                ("source", PythonConsumerValue::Null),
            ]),
        )
    }
    fn record_with_key(
        module: &str,
        element: &str,
        key_id: Option<&str>,
        source: Option<(&str, &str)>,
    ) -> PythonConsumerValue {
        let source = source
            .map(|(document_id, core_version)| {
                tagged(
                    "umf_access.dsl._nodes.GeneratedSource",
                    obj(&[
                        ("document_id", text_value(document_id)),
                        ("core_version", text_value(core_version)),
                        ("document_sha256", text_value(&"0".repeat(64))),
                        ("input_digest", text_value(&"1".repeat(64))),
                        ("runtime_abi", text_value("umf-access-runtime/0.1")),
                    ]),
                )
            })
            .unwrap_or(PythonConsumerValue::Null);
        tagged(
            "umf_access.dsl._nodes.RecordRef",
            obj(&[
                ("module", text_value(module)),
                ("element", text_value(element)),
                ("alias", PythonConsumerValue::Null),
                ("key", tuple_value(vec![field(module, element, None)])),
                (
                    "key_id",
                    key_id.map(text_value).unwrap_or(PythonConsumerValue::Null),
                ),
                ("source", source),
            ]),
        )
    }
    fn field(module: &str, element: &str, alias: Option<&str>) -> PythonConsumerValue {
        tagged(
            "umf_access.dsl._nodes.FieldRef",
            obj(&[
                ("module", text_value(module)),
                ("element", text_value(element)),
                (
                    "alias",
                    alias.map(text_value).unwrap_or(PythonConsumerValue::Null),
                ),
                ("field_module", text_value("ignored.field.module")),
            ]),
        )
    }
    fn temporal_field(profile: &str) -> PythonConsumerValue {
        tagged(
            "umf_access.dsl._nodes.FieldRef",
            obj(&[
                ("module", text_value("commerce")),
                ("element", text_value("Order")),
                ("field", text_value(profile)),
                ("alias", PythonConsumerValue::Null),
                ("temporal", text_value(profile)),
            ]),
        )
    }
    fn node(op: &str, args: Vec<PythonConsumerValue>) -> PythonConsumerValue {
        tagged(
            "umf_access.dsl._nodes.Node",
            obj(&[("op", text_value(op)), ("args", tuple_value(args))]),
        )
    }
    fn owner_graph(
        steps: Vec<PythonConsumerValue>,
        parameters: Vec<PythonConsumerValue>,
    ) -> PythonConsumerValue {
        owner_graph_for(record("commerce", "Order", None), steps, parameters)
    }
    fn owner_graph_for(
        root: PythonConsumerValue,
        steps: Vec<PythonConsumerValue>,
        parameters: Vec<PythonConsumerValue>,
    ) -> PythonConsumerValue {
        owner_terminal_graph("all", root, steps, parameters)
    }
    fn owner_terminal_graph(
        op: &str,
        root: PythonConsumerValue,
        steps: Vec<PythonConsumerValue>,
        parameters: Vec<PythonConsumerValue>,
    ) -> PythonConsumerValue {
        let terminal = node(op, vec![root, tuple_value(steps)]);
        tagged(
            "umf_access.capture.CapturedVariant",
            obj(&[("node", terminal), ("parameters", tuple_value(parameters))]),
        )
    }
    fn update_graph(
        root: PythonConsumerValue,
        assignments: Vec<PythonConsumerValue>,
        parameters: Vec<PythonConsumerValue>,
    ) -> PythonConsumerValue {
        let terminal = node(
            "update",
            vec![root, tuple_value(vec![]), tuple_value(assignments)],
        );
        tagged(
            "umf_access.capture.CapturedVariant",
            obj(&[("node", terminal), ("parameters", tuple_value(parameters))]),
        )
    }
    fn parameter(name: &str) -> PythonConsumerValue {
        tagged(
            "umf_access.capture.CapturedParameter",
            obj(&[
                ("name", text_value(name)),
                ("key_components", tuple_value(vec![])),
                ("key_identity", tuple_value(vec![])),
            ]),
        )
    }
    fn owner_filter(expression: PythonConsumerValue) -> PythonConsumerValue {
        node("filter", vec![expression])
    }
    fn scalar_graph(expression: PythonConsumerValue) -> PythonConsumerValue {
        owner_graph(vec![node("select", vec![expression])], vec![])
    }
    fn join(source: PythonConsumerValue, target: PythonConsumerValue) -> PythonConsumerValue {
        let relation = tagged(
            "umf_access.dsl._expressions.Join",
            obj(&[("ref", source), ("target", target)]),
        );
        node("join", vec![relation])
    }

    fn source_record(document: &str, core_version: &str) -> PythonConsumerValue {
        record_with_key("commerce", "Order", None, Some((document, core_version)))
    }

    fn related_many(
        source: PythonConsumerValue,
        target: PythonConsumerValue,
        inverse: bool,
    ) -> PythonConsumerValue {
        let (source_query, target_query, direction) = if inverse {
            (target.clone(), source.clone(), "inverse")
        } else {
            (source.clone(), target.clone(), "forward")
        };
        let base_relationship = tagged(
            "umf_access.dsl.navigation.ManyNavigation",
            obj(&[
                ("source_query", source_query.clone()),
                ("target_query", target_query.clone()),
                ("direction", text_value("forward")),
            ]),
        );
        node(
            "related",
            vec![
                source,
                tuple_value(vec![]),
                base_relationship,
                text_value(direction),
            ],
        )
    }

    fn related_join(
        source: PythonConsumerValue,
        target: PythonConsumerValue,
        inverse: bool,
    ) -> PythonConsumerValue {
        let (source_query, target_query, direction) = if inverse {
            (target.clone(), source.clone(), "inverse")
        } else {
            (source.clone(), target.clone(), "forward")
        };
        let relation = tagged(
            "umf_access.dsl.navigation.RequiredNavigation",
            obj(&[
                ("source_query", source_query.clone()),
                ("target_query", target_query.clone()),
                ("direction", text_value("forward")),
            ]),
        );
        node(
            "related",
            vec![source, tuple_value(vec![]), relation, text_value(direction)],
        )
    }

    fn search_parameter(name: &str, carrier: PythonConsumerValue) -> PythonConsumerValue {
        tagged(
            "umf_access.capture.CapturedParameter",
            obj(&[
                ("name", text_value(name)),
                ("carrier", carrier),
                ("key_components", tuple_value(vec![])),
                ("key_identity", tuple_value(vec![])),
            ]),
        )
    }

    fn string_carrier() -> PythonConsumerValue {
        obj(&[("$typeRef", text_value("builtins.str"))])
    }

    fn vector_carrier() -> PythonConsumerValue {
        obj(&[
            ("$typing", text_value("builtins.tuple")),
            (
                "args",
                PythonConsumerValue::Array(vec![
                    obj(&[("$typeRef", text_value("builtins.float"))]),
                    obj(&[("$ellipsis", PythonConsumerValue::Bool(true))]),
                ]),
            ),
        ])
    }

    fn search_leg(
        record: PythonConsumerValue,
        kind: &str,
        value: PythonConsumerValue,
        legs: Vec<PythonConsumerValue>,
    ) -> PythonConsumerValue {
        tagged(
            "umf_access.dsl.search.SearchLeg",
            obj(&[
                ("record", record),
                ("kind", text_value(kind)),
                ("index_json", PythonConsumerValue::Null),
                ("value", value),
                ("legs", tuple_value(legs)),
                ("fusion", PythonConsumerValue::Null),
            ]),
        )
    }

    fn search_graph(
        root: PythonConsumerValue,
        leg: PythonConsumerValue,
        parameters: Vec<PythonConsumerValue>,
    ) -> PythonConsumerValue {
        let terminal = node(
            "search_top",
            vec![
                root,
                tuple_value(vec![]),
                leg,
                PythonConsumerValue::Integer(num_bigint::BigInt::from(5)),
                PythonConsumerValue::Bool(false),
            ],
        );
        tagged(
            "umf_access.capture.CapturedVariant",
            obj(&[("node", terminal), ("parameters", tuple_value(parameters))]),
        )
    }

    #[test]
    fn accepts_declared_parameter_reference() {
        assert_eq!(validate_captured_variant(&graph("value", "value")), Ok(()));
    }

    #[test]
    fn accepts_forward_many_navigation_with_full_record_refs() {
        let root = record("commerce", "Order", None);
        let navigation = related_many(record("commerce", "Customer", None), root.clone(), false);
        let variant = owner_graph_for(root, vec![owner_filter(navigation)], vec![]);
        assert_eq!(validate_captured_variant(&variant), Ok(()));
    }

    #[test]
    fn accepts_inverse_many_navigation_with_full_record_refs() {
        let root = record("commerce", "Order", None);
        let navigation = related_many(record("commerce", "Customer", None), root.clone(), true);
        let variant = owner_graph_for(root, vec![owner_filter(navigation)], vec![]);
        assert_eq!(validate_captured_variant(&variant), Ok(()));
    }

    #[test]
    fn accepts_forward_and_inverse_join_navigation() {
        let root = record("commerce", "Order", None);
        let forward = related_join(record("commerce", "Customer", None), root.clone(), false);
        let variant = owner_graph_for(root.clone(), vec![owner_filter(forward)], vec![]);
        assert_eq!(validate_captured_variant(&variant), Ok(()));

        let inverse = related_join(record("commerce", "Customer", None), root.clone(), true);
        let variant = owner_graph_for(root, vec![owner_filter(inverse)], vec![]);
        assert_eq!(validate_captured_variant(&variant), Ok(()));
    }

    #[test]
    fn related_root_comparison_includes_source_core_version() {
        let root = source_record("orders", "0.10.0");
        let different_pin = source_record("orders", "0.9.0");
        let navigation = related_many(record("commerce", "Customer", None), different_pin, false);
        let variant = owner_graph_for(root, vec![owner_filter(navigation)], vec![]);
        assert_eq!(
            validate_captured_variant(&variant),
            Err(Refusal {
                kind: "capture-error",
                code: "CAPTURE_UNSUPPORTED",
                rule: "navigation selected root differs",
            })
        );
    }

    #[test]
    fn related_refusal_follows_join_owner_preflight() {
        let root = record("commerce", "Order", None);
        let navigation = related_many(
            record("commerce", "Customer", None),
            record("commerce", "DifferentRoot", None),
            false,
        );
        let missing_join = join(
            field("commerce", "Missing", None),
            record("commerce", "Customer", None),
        );
        let variant = owner_graph_for(root, vec![missing_join, owner_filter(navigation)], vec![]);
        assert_eq!(
            validate_captured_variant(&variant),
            Err(Refusal {
                kind: "capture-error",
                code: "CAPTURE_UNSUPPORTED",
                rule: "join source is absent",
            })
        );
    }

    #[test]
    fn refuses_undeclared_parameter_with_predecessor_rule() {
        assert_eq!(
            validate_captured_variant(&graph("missing", "value")),
            Err(Refusal {
                kind: "capture-error",
                code: "CAPTURE_SIGNATURE",
                rule: "expression references an undeclared parameter"
            })
        );
    }

    #[test]
    fn refuses_unrecognized_concrete_tag_instead_of_erasing_its_kind() {
        let parameter = tagged(
            "umf_access.capture.CapturedParameter",
            obj(&[
                ("name", text_value("value")),
                ("key_components", tuple_value(vec![])),
                ("key_identity", tuple_value(vec![])),
            ]),
        );
        let derived = tagged("example.DerivedNode", obj(&[]));
        let variant = owner_graph(vec![owner_filter(derived)], vec![parameter]);
        assert_eq!(validate_captured_variant(&variant), Err(refuse_dto()));
    }

    #[test]
    fn accepts_matching_key_param_component_and_identity_tuples() {
        let components = key_tuple(&["id"]);
        let identity = key_identity(&[
            ("coreVersion", "0.10.0"),
            ("documentId", "validator-test"),
            ("element", "Order"),
            ("key", "Order_key"),
            ("module", "commerce"),
        ]);
        let graph = key_param_graph(
            "key",
            "key",
            components.clone(),
            identity.clone(),
            components,
            identity,
        );
        assert_eq!(validate_captured_variant(&graph), Ok(()));
    }

    #[test]
    fn refuses_key_param_component_tuple_mismatch() {
        let identity = key_identity(&[("module", "commerce"), ("element", "Order")]);
        let graph = key_param_graph(
            "key",
            "key",
            key_tuple(&["id"]),
            identity.clone(),
            key_tuple(&["wrong"]),
            identity,
        );
        assert_eq!(
            validate_captured_variant(&graph),
            Err(Refusal {
                kind: "capture-error",
                code: "CAPTURE_SIGNATURE",
                rule: "Key component parameters differ from declared carrier"
            })
        );
    }

    #[test]
    fn refuses_key_param_identity_tuple_mismatch() {
        let graph = key_param_graph(
            "key",
            "key",
            key_tuple(&["id"]),
            key_identity(&[
                ("module", "commerce"),
                ("element", "Order"),
                ("key", "Order_key"),
            ]),
            key_tuple(&["id"]),
            key_identity(&[
                ("module", "commerce"),
                ("element", "Order"),
                ("key", "Other_key"),
            ]),
        );
        assert_eq!(
            validate_captured_variant(&graph),
            Err(Refusal {
                kind: "capture-error",
                code: "CAPTURE_SIGNATURE",
                rule: "Key component parameters differ from declared carrier"
            })
        );
    }

    #[test]
    fn undeclared_key_param_refusal_precedes_metadata_mismatch() {
        let graph = key_param_graph(
            "missing",
            "key",
            key_tuple(&["id"]),
            key_identity(&[("module", "commerce")]),
            key_tuple(&["wrong"]),
            key_identity(&[("module", "elsewhere")]),
        );
        assert_eq!(
            validate_captured_variant(&graph),
            Err(Refusal {
                kind: "capture-error",
                code: "CAPTURE_SIGNATURE",
                rule: "expression references an undeclared parameter"
            })
        );
    }

    #[test]
    fn ordinary_param_does_not_inherit_key_carrier_checks() {
        let parameter = tagged(
            "umf_access.capture.CapturedParameter",
            obj(&[
                ("name", text_value("value")),
                ("carrier", obj(&[("$typeRef", text_value("builtins.str"))])),
                ("key_components", key_tuple(&["id"])),
                ("key_identity", key_identity(&[("module", "commerce")])),
            ]),
        );
        let param_node = tagged(
            "umf_access.dsl._nodes.Node",
            obj(&[
                ("op", text_value("param")),
                ("args", tuple_value(vec![text_value("value")])),
            ]),
        );
        let graph = owner_graph(vec![owner_filter(param_node)], vec![parameter]);
        assert_eq!(validate_captured_variant(&graph), Ok(()));
    }

    #[test]
    fn accepts_root_owned_field_and_ignores_field_module() {
        assert_eq!(
            validate_captured_variant(&owner_graph(
                vec![owner_filter(field("commerce", "Order", None))],
                vec![]
            )),
            Ok(())
        );
    }

    #[test]
    fn accepts_field_owned_by_join_target() {
        let target = record("crm", "Customer", None);
        let steps = vec![
            join(field("commerce", "Order", None), target),
            owner_filter(field("crm", "Customer", None)),
        ];
        assert_eq!(
            validate_captured_variant(&owner_graph(steps, vec![])),
            Ok(())
        );
    }

    #[test]
    fn foreign_field_refuses_with_native_type_error_envelope() {
        assert_eq!(
            validate_captured_variant(&owner_graph(
                vec![owner_filter(field("crm", "Customer", None))],
                vec![]
            )),
            Err(Refusal {
                kind: "type-error",
                code: "",
                rule: "expression column belongs to another Record"
            })
        );
    }

    #[test]
    fn owner_type_error_and_undeclared_parameter_follow_expression_order() {
        let undeclared = node("param", vec![text_value("missing")]);
        let foreign = field("crm", "Customer", None);
        let owner_first = owner_graph(
            vec![owner_filter(tuple_value(vec![
                foreign.clone(),
                undeclared.clone(),
            ]))],
            vec![],
        );
        let parameter_first = owner_graph(
            vec![owner_filter(tuple_value(vec![undeclared, foreign]))],
            vec![],
        );
        assert_eq!(
            validate_captured_variant(&owner_first),
            Err(Refusal {
                kind: "type-error",
                code: "",
                rule: "expression column belongs to another Record"
            })
        );
        assert_eq!(
            validate_captured_variant(&parameter_first),
            Err(Refusal {
                kind: "capture-error",
                code: "CAPTURE_SIGNATURE",
                rule: "expression references an undeclared parameter"
            })
        );
    }

    #[test]
    fn join_source_error_precedes_expression_visit_and_alias_is_part_of_owner() {
        let steps = vec![
            join(
                field("commerce", "Order", Some("wrong")),
                record("crm", "Customer", None),
            ),
            owner_filter(field("crm", "Customer", None)),
        ];
        assert_eq!(
            validate_captured_variant(&owner_graph(steps, vec![])),
            Err(Refusal {
                kind: "capture-error",
                code: "CAPTURE_UNSUPPORTED",
                rule: "join source is absent"
            })
        );
        let alias_mismatch = owner_graph(
            vec![owner_filter(field("commerce", "Order", Some("orders")))],
            vec![],
        );
        assert_eq!(
            validate_captured_variant(&alias_mismatch),
            Err(Refusal {
                kind: "type-error",
                code: "",
                rule: "expression column belongs to another Record"
            })
        );
    }

    #[test]
    fn joined_owner_alias_is_matched_exactly() {
        let target = record("crm", "Customer", Some("buyer"));
        let steps = vec![
            join(field("commerce", "Order", None), target),
            owner_filter(field("crm", "Customer", Some("buyer"))),
        ];
        assert_eq!(
            validate_captured_variant(&owner_graph(steps, vec![])),
            Ok(())
        );
    }

    #[test]
    fn two_hop_join_owners_include_prior_alias_targets_in_order() {
        let buyer = record("crm", "Customer", Some("buyer"));
        let leaf = record("crm", "Address", None);
        let valid = owner_graph(
            vec![
                join(field("commerce", "Order", None), buyer.clone()),
                join(field("crm", "Customer", Some("buyer")), leaf.clone()),
                owner_filter(field("crm", "Address", None)),
            ],
            vec![],
        );
        assert_eq!(validate_captured_variant(&valid), Ok(()));

        let wrong_alias_source = owner_graph(
            vec![
                join(field("commerce", "Order", None), buyer),
                join(field("crm", "Customer", None), leaf),
                owner_filter(field("other", "Foreign", None)),
            ],
            vec![],
        );
        assert_eq!(
            validate_captured_variant(&wrong_alias_source),
            Err(Refusal {
                kind: "capture-error",
                code: "CAPTURE_UNSUPPORTED",
                rule: "join source is absent",
            })
        );
    }

    #[test]
    fn malformed_known_owner_tags_are_refused_as_dto_invalid() {
        let malformed_field = tagged(
            "umf_access.dsl._nodes.FieldRef",
            obj(&[("module", text_value("commerce"))]),
        );
        assert_eq!(
            validate_captured_variant(&owner_graph(vec![owner_filter(malformed_field)], vec![])),
            Err(refuse_dto())
        );

        let malformed_root = tagged(
            "umf_access.dsl._nodes.RecordRef",
            obj(&[
                ("module", text_value("commerce")),
                ("element", text_value("Order")),
            ]),
        );
        let terminal = node("all", vec![malformed_root, tuple_value(vec![])]);
        let variant = tagged(
            "umf_access.capture.CapturedVariant",
            obj(&[("node", terminal), ("parameters", tuple_value(vec![]))]),
        );
        assert_eq!(validate_captured_variant(&variant), Err(refuse_dto()));
    }

    fn selected_identity(values: &[(&str, &str)]) -> PythonConsumerValue {
        key_identity(values)
    }

    fn selected_param(identity: PythonConsumerValue) -> PythonConsumerValue {
        node(
            "key_param",
            vec![text_value("key"), key_tuple(&["id"]), identity],
        )
    }

    fn selected_parameter(identity: PythonConsumerValue) -> PythonConsumerValue {
        tagged(
            "umf_access.capture.CapturedParameter",
            obj(&[
                ("name", text_value("key")),
                ("key_components", key_tuple(&["id"])),
                ("key_identity", identity),
            ]),
        )
    }

    fn selected_literal(identity: PythonConsumerValue) -> PythonConsumerValue {
        let literal = tagged(
            "umf_access.dsl._nodes.KeyLiteral",
            obj(&[
                ("identity", identity),
                ("values", tuple_value(vec![])),
                ("source", PythonConsumerValue::Null),
            ]),
        );
        node("key", vec![literal])
    }

    fn selected_graph(
        op: &str,
        root: PythonConsumerValue,
        key_value: PythonConsumerValue,
        steps: Vec<PythonConsumerValue>,
        parameters: Vec<PythonConsumerValue>,
    ) -> PythonConsumerValue {
        let mut args = vec![root, tuple_value(steps)];
        if op == "get" {
            args.push(key_value);
        } else {
            args.push(PythonConsumerValue::Integer(num_bigint::BigInt::from(10)));
            args.push(key_value);
        }
        let terminal = node(op, args);
        tagged(
            "umf_access.capture.CapturedVariant",
            obj(&[("node", terminal), ("parameters", tuple_value(parameters))]),
        )
    }

    fn complete_identity(module: &str, element: &str, key: &str) -> PythonConsumerValue {
        selected_identity(&[
            ("documentId", "doc"),
            ("coreVersion", "0.10.0"),
            ("module", module),
            ("element", element),
            ("key", key),
        ])
    }

    #[test]
    fn get_and_page_accept_selected_key_parameter_and_literal_identities() {
        for op in ["get", "page"] {
            let identity = complete_identity("commerce", "Order", "Order_key");
            let root = record_with_key(
                "commerce",
                "Order",
                Some("Order_key"),
                Some(("doc", "0.10.0")),
            );
            for key_value in [
                selected_param(identity.clone()),
                selected_literal(identity.clone()),
            ] {
                let params = if matches!(
                    tag(&key_value, "umf_access.dsl._nodes.Node")
                        .and_then(|fields| get(fields, "op"))
                        .and_then(text)
                        .as_deref(),
                    Some("key_param")
                ) {
                    vec![selected_parameter(identity.clone())]
                } else {
                    vec![]
                };
                let graph = selected_graph(op, root.clone(), key_value, vec![], params);
                assert_eq!(validate_captured_variant(&graph), Ok(()), "{op}");
            }
        }
    }

    #[test]
    fn related_navigation_runs_inside_get_and_page_after_key_preflight() {
        for op in ["get", "page"] {
            let root = record_with_key(
                "commerce",
                "Order",
                Some("Order_key"),
                Some(("doc", "0.10.0")),
            );
            let navigation =
                related_many(record("commerce", "Customer", None), root.clone(), false);
            let key_value = selected_literal(complete_identity("commerce", "Order", "Order_key"));
            let graph = selected_graph(op, root, key_value, vec![owner_filter(navigation)], vec![]);
            assert_eq!(validate_captured_variant(&graph), Ok(()), "{op}");
        }
    }

    #[test]
    fn selected_key_refusal_precedes_related_expression_refusal() {
        for op in ["get", "page"] {
            let root = record_with_key(
                "commerce",
                "Order",
                Some("Order_key"),
                Some(("doc", "0.10.0")),
            );
            let navigation = related_many(
                record("commerce", "Customer", None),
                record("commerce", "Other", None),
                false,
            );
            let key_value = selected_literal(complete_identity("elsewhere", "Other", "bad"));
            let graph = selected_graph(op, root, key_value, vec![owner_filter(navigation)], vec![]);
            assert_eq!(
                validate_captured_variant(&graph),
                Err(Refusal {
                    kind: "capture-error",
                    code: "CAPTURE_SIGNATURE",
                    rule: "Key belongs to another Record",
                }),
                "{op}"
            );
        }
    }

    #[test]
    fn accepts_string_and_vector_search_carriers_and_nested_legs() {
        let root = record("commerce", "Order", None);
        let string_value = node("param", vec![text_value("text")]);
        let string_leg = search_leg(root.clone(), "keyword", string_value.clone(), vec![]);
        assert_eq!(
            validate_captured_variant(&search_graph(
                root.clone(),
                string_leg,
                vec![search_parameter("text", string_carrier())],
            )),
            Ok(())
        );

        let vector_value = node("param", vec![text_value("vector")]);
        let vector_leg = search_leg(root.clone(), "vector", vector_value.clone(), vec![]);
        assert_eq!(
            validate_captured_variant(&search_graph(
                root.clone(),
                vector_leg,
                vec![search_parameter("vector", vector_carrier())],
            )),
            Ok(())
        );

        let nested = search_leg(
            root.clone(),
            "hybrid",
            PythonConsumerValue::Null,
            vec![
                search_leg(root.clone(), "keyword", string_value, vec![]),
                search_leg(root.clone(), "text-vector", vector_value, vec![]),
            ],
        );
        assert_eq!(
            validate_captured_variant(&search_graph(
                root,
                nested,
                vec![
                    search_parameter("text", string_carrier()),
                    search_parameter("vector", string_carrier()),
                ],
            )),
            Ok(())
        );
    }

    #[test]
    fn search_leg_refusal_order_matches_python_checks() {
        let root = record("commerce", "Order", None);
        let foreign = search_leg(
            record("commerce", "Customer", None),
            "keyword",
            node("literal", vec![text_value("unbound")]),
            vec![],
        );
        assert_eq!(
            validate_captured_variant(&search_graph(root.clone(), foreign, vec![])),
            Err(Refusal {
                kind: "capture-error",
                code: "SEARCH_DECLARATION",
                rule: "foreign search Record",
            })
        );

        let unbound = search_leg(
            root.clone(),
            "keyword",
            node("literal", vec![text_value("unbound")]),
            vec![],
        );
        assert_eq!(
            validate_captured_variant(&search_graph(root.clone(), unbound, vec![])),
            Err(Refusal {
                kind: "capture-error",
                code: "SEARCH_DECLARATION",
                rule: "search requires bound parameters",
            })
        );

        let mismatch = search_leg(
            root.clone(),
            "vector",
            node("param", vec![text_value("text")]),
            vec![],
        );
        assert_eq!(
            validate_captured_variant(&search_graph(
                root,
                mismatch,
                vec![search_parameter("text", string_carrier())],
            )),
            Err(Refusal {
                kind: "capture-error",
                code: "CAPTURE_SIGNATURE",
                rule: "search parameter carrier differs from selected leg",
            })
        );
    }

    #[test]
    fn nested_omitted_filter_refusal_precedes_child_parameter_visit() {
        let omitted = node("omitted", vec![]);
        let undeclared = node("param", vec![text_value("missing")]);
        let nested = node("and", vec![omitted, undeclared]);
        assert_eq!(
            validate_captured_variant(&owner_graph(vec![owner_filter(nested)], vec![])),
            Err(Refusal {
                kind: "capture-error",
                code: "CAPTURE_UNSUPPORTED",
                rule: "optional filters must be top-level filter arguments",
            })
        );
    }

    #[test]
    fn temporal_parameter_profile_refusal_precedes_child_parameter_visit() {
        let instant = node(
            "=",
            vec![
                node("column", vec![temporal_field("instant")]),
                node("param", vec![text_value("value")]),
            ],
        );
        let local_with_undeclared = node(
            "=",
            vec![
                node("column", vec![temporal_field("local")]),
                node("param", vec![text_value("value")]),
            ],
        );
        let mut profiles = Vec::new();
        let first_args = get(&instant, "fields")
            .and_then(|fields| get(fields, "args"))
            .and_then(tuple)
            .unwrap();
        assert_eq!(
            update_temporal_parameter_profiles("=", first_args, &mut profiles),
            Ok(())
        );
        assert_eq!(profiles, vec![("value".to_string(), "instant".to_string())]);
        let second_args = get(&local_with_undeclared, "fields")
            .and_then(|fields| get(fields, "args"))
            .and_then(tuple)
            .unwrap();
        assert_eq!(
            update_temporal_parameter_profiles("=", second_args, &mut profiles),
            Err(Refusal {
                kind: "capture-error",
                code: "CAPTURE_UNSUPPORTED",
                rule: "parameter spans incompatible temporal profiles",
            })
        );
        let undeclared = owner_filter(node("param", vec![text_value("missing")]));
        assert_eq!(
            validate_captured_variant(&owner_graph(
                vec![
                    owner_filter(instant),
                    owner_filter(local_with_undeclared),
                    undeclared,
                ],
                vec![parameter("value")],
            )),
            Err(Refusal {
                kind: "capture-error",
                code: "CAPTURE_UNSUPPORTED",
                rule: "parameter spans incompatible temporal profiles",
            })
        );
    }

    #[test]
    fn aggregate_and_bucket_validation_matches_scalar_shape_and_refusal_order() {
        let mut accepted = [
            "sum",
            "min",
            "max",
            "avg",
            "count_distinct",
            "approx_count_distinct",
        ]
        .into_iter()
        .map(|op| {
            node(
                "aggregate",
                vec![
                    text_value(op),
                    field("commerce", "Order", None),
                    if op == "avg" {
                        PythonConsumerValue::Integer(1000.into())
                    } else {
                        PythonConsumerValue::Null
                    },
                ],
            )
        })
        .collect::<Vec<_>>();
        accepted.push(node(
            "aggregate",
            vec![
                text_value("count"),
                PythonConsumerValue::Null,
                PythonConsumerValue::Null,
            ],
        ));
        accepted.push(node(
            "bucket_width",
            vec![
                field("commerce", "Order", None),
                PythonConsumerValue::Integer(1.into()),
            ],
        ));
        for expression in accepted {
            assert_eq!(validate_captured_variant(&scalar_graph(expression)), Ok(()));
        }

        let malformed = node(
            "aggregate",
            vec![text_value("unknown"), field("commerce", "Order", None)],
        );
        assert_eq!(
            validate_captured_variant(&scalar_graph(malformed)),
            Err(Refusal {
                kind: "capture-error",
                code: "CAPTURE_UNSUPPORTED",
                rule: "unknown scalar expression",
            })
        );
        let unknown_temporal = node(
            "aggregate",
            vec![
                text_value("unknown"),
                temporal_field("instant"),
                PythonConsumerValue::Null,
            ],
        );
        assert_eq!(
            validate_captured_variant(&scalar_graph(unknown_temporal)),
            Err(Refusal {
                kind: "capture-error",
                code: "CAPTURE_UNSUPPORTED",
                rule: "unknown aggregate operation",
            })
        );
        let temporal_bad_scale = node(
            "aggregate",
            vec![
                text_value("avg"),
                temporal_field("local"),
                PythonConsumerValue::Integer(1001.into()),
            ],
        );
        assert_eq!(
            validate_captured_variant(&scalar_graph(temporal_bad_scale)),
            Err(Refusal {
                kind: "capture-error",
                code: "CAPTURE_UNSUPPORTED",
                rule: "temporal aggregate qualification is held",
            })
        );
        let bad_scale = node(
            "aggregate",
            vec![
                text_value("avg"),
                field("commerce", "Order", None),
                PythonConsumerValue::Integer(1001.into()),
            ],
        );
        assert_eq!(
            validate_captured_variant(&scalar_graph(bad_scale)),
            Err(Refusal {
                kind: "capture-error",
                code: "CAPTURE_UNSUPPORTED",
                rule: "average requires bounded literal scale",
            })
        );
    }

    #[test]
    fn read_terminal_shapes_match_python_preflight_order() {
        let root = record("commerce", "Order", None);
        for op in ["all", "first", "one", "count", "exists", "group_count"] {
            let steps = if op == "group_count" {
                vec![node("group", vec![field("commerce", "Order", None)])]
            } else {
                vec![]
            };
            assert_eq!(
                validate_captured_variant(&owner_terminal_graph(op, root.clone(), steps, vec![],)),
                Ok(()),
                "{op}"
            );
        }

        let scalar = node(
            "aggregate",
            vec![
                text_value("sum"),
                field("commerce", "Order", None),
                PythonConsumerValue::Null,
            ],
        );
        let scalar_count = owner_terminal_graph(
            "count",
            root.clone(),
            vec![node("select", vec![scalar.clone()])],
            vec![],
        );
        assert_eq!(
            validate_captured_variant(&scalar_count),
            Err(Refusal {
                kind: "capture-error",
                code: "CAPTURE_UNSUPPORTED",
                rule: "scalar aggregate/bucket projection does not admit this terminal",
            })
        );

        let malformed_first = tagged(
            "umf_access.capture.CapturedVariant",
            obj(&[
                (
                    "node",
                    node(
                        "first",
                        vec![root, tuple_value(vec![]), PythonConsumerValue::Null],
                    ),
                ),
                ("parameters", tuple_value(vec![])),
            ]),
        );
        assert_eq!(
            validate_captured_variant(&malformed_first),
            Err(refuse_dto())
        );
    }

    #[test]
    fn update_assignments_validate_closed_shape_ownership_and_parameters() {
        let root = record("commerce", "Order", None);
        let assignment = tuple_value(vec![
            field("commerce", "Order", None),
            node("param", vec![text_value("status")]),
        ]);
        assert_eq!(
            validate_captured_variant(&update_graph(
                root.clone(),
                vec![assignment.clone()],
                vec![parameter("status")],
            )),
            Ok(())
        );

        assert_eq!(
            validate_captured_variant(&update_graph(root.clone(), vec![assignment], vec![],)),
            Err(Refusal {
                kind: "capture-error",
                code: "CAPTURE_SIGNATURE",
                rule: "expression references an undeclared parameter",
            })
        );

        let foreign_before_missing_parameter = tuple_value(vec![
            field("commerce", "Customer", None),
            node("param", vec![text_value("missing")]),
        ]);
        assert_eq!(
            validate_captured_variant(&update_graph(
                root.clone(),
                vec![foreign_before_missing_parameter],
                vec![],
            )),
            Err(Refusal {
                kind: "type-error",
                code: "",
                rule: "expression column belongs to another Record",
            })
        );

        assert_eq!(
            validate_captured_variant(&update_graph(
                root,
                vec![tuple_value(vec![field("commerce", "Order", None)])],
                vec![],
            )),
            Err(refuse_dto())
        );
    }

    #[test]
    fn selected_key_refusals_match_python_messages_for_get_and_page() {
        for op in ["get", "page"] {
            let root = record_with_key(
                "commerce",
                "Order",
                Some("Order_key"),
                Some(("doc", "0.10.0")),
            );
            let foreign = selected_graph(
                op,
                root.clone(),
                selected_literal(complete_identity("other", "Order", "Order_key")),
                vec![],
                vec![],
            );
            assert_eq!(
                validate_captured_variant(&foreign),
                Err(Refusal {
                    kind: "capture-error",
                    code: "CAPTURE_SIGNATURE",
                    rule: "Key belongs to another Record"
                })
            );
            let wrong_key = selected_graph(
                op,
                root.clone(),
                selected_literal(complete_identity("commerce", "Order", "Other_key")),
                vec![],
                vec![],
            );
            assert_eq!(
                validate_captured_variant(&wrong_key),
                Err(Refusal {
                    kind: "capture-error",
                    code: "CAPTURE_SIGNATURE",
                    rule: "Key differs from selected Record Key"
                })
            );
            let incomplete = selected_graph(
                op,
                root,
                selected_literal(key_identity(&[("module", "commerce")])),
                vec![],
                vec![],
            );
            assert_eq!(validate_captured_variant(&incomplete), Err(refuse_dto()));
        }
    }

    #[test]
    fn source_bound_selected_key_requires_exact_identity_even_when_operand_identity_is_empty() {
        for op in ["get", "page"] {
            let root = record_with_key(
                "commerce",
                "Order",
                Some("Order_key"),
                Some(("doc", "0.10.0")),
            );
            let empty_literal = selected_graph(
                op,
                root.clone(),
                selected_literal(key_identity(&[])),
                vec![],
                vec![],
            );
            assert_eq!(
                validate_captured_variant(&empty_literal),
                Err(Refusal {
                    kind: "capture-error",
                    code: "CAPTURE_SIGNATURE",
                    rule: "Key differs from selected Record Key"
                })
            );
            let other_node = selected_graph(
                op,
                root,
                node("param", vec![text_value("key")]),
                vec![],
                vec![parameter("key")],
            );
            assert_eq!(
                validate_captured_variant(&other_node),
                Err(Refusal {
                    kind: "capture-error",
                    code: "CAPTURE_SIGNATURE",
                    rule: "Key differs from selected Record Key"
                })
            );
        }
    }

    #[test]
    fn unbound_root_preserves_empty_identity_preflight_behavior() {
        let graph = selected_graph(
            "get",
            record_with_key("commerce", "Order", None, None),
            node("param", vec![text_value("key")]),
            vec![],
            vec![parameter("key")],
        );
        assert_eq!(validate_captured_variant(&graph), Ok(()));
    }

    #[test]
    fn selected_key_preflight_follows_join_closure_and_precedes_expression_visit() {
        let root = record("commerce", "Order", None);
        let foreign_key = selected_literal(complete_identity("elsewhere", "Other", "Other_key"));
        let bad_join = selected_graph(
            "get",
            root.clone(),
            foreign_key.clone(),
            vec![join(
                field("commerce", "Order", Some("wrong")),
                record("crm", "Customer", None),
            )],
            vec![],
        );
        assert_eq!(
            validate_captured_variant(&bad_join),
            Err(Refusal {
                kind: "capture-error",
                code: "CAPTURE_UNSUPPORTED",
                rule: "join source is absent"
            })
        );
        let undeclared = node("param", vec![text_value("missing")]);
        let bad_key_before_expression = selected_graph(
            "get",
            root.clone(),
            foreign_key,
            vec![owner_filter(undeclared.clone())],
            vec![],
        );
        assert_eq!(
            validate_captured_variant(&bad_key_before_expression),
            Err(Refusal {
                kind: "capture-error",
                code: "CAPTURE_SIGNATURE",
                rule: "Key belongs to another Record"
            })
        );
        let valid_key_then_expression = selected_graph(
            "get",
            root,
            selected_literal(key_identity(&[])),
            vec![owner_filter(undeclared)],
            vec![],
        );
        assert_eq!(
            validate_captured_variant(&valid_key_then_expression),
            Err(Refusal {
                kind: "capture-error",
                code: "CAPTURE_SIGNATURE",
                rule: "expression references an undeclared parameter"
            })
        );
    }
}
