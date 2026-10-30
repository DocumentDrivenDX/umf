// SPDX-License-Identifier: MIT OR Apache-2.0
//! Portable saga declaration inspection and assessment.
//!
//! This module deliberately owns no host capabilities. It consumes only an
//! explicitly installed saga schema package and the shared action inspector.

use std::collections::{BTreeMap, BTreeSet};

use umf_core::{Context, Diagnostic, EngineError, Severity, Utf16, Value};

use crate::actions::{inspect_document, ActionDeclaration};
use crate::resources::CodegenEngine;
use crate::value::{array_items, member, string_member};

fn s(value: impl AsRef<str>) -> Value {
    Value::string_utf8(value.as_ref())
}
fn obj(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(k, v)| (Utf16::from(k), v))
            .collect(),
    )
}
fn arr(values: Vec<Value>) -> Value {
    Value::Array(values)
}
fn get<'a>(v: &'a Value, name: &str) -> Option<&'a Value> {
    member(v, name)
}
fn text<'a>(v: &'a Value, name: &str) -> Option<&'a Utf16> {
    string_member(v, name)
}
fn items<'a>(v: &'a Value, name: &str) -> &'a [Value] {
    array_items(get(v, name).unwrap_or(&Value::Null)).unwrap_or(&[])
}
fn fail(code: &str, path: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::from(path), message)
}
fn diagnostic(error: EngineError) -> Diagnostic {
    Diagnostic {
        code: Utf16::from(error.code),
        path: error.path,
        python_source_path: false,
        message: error.message,
        severity: Severity::Error,
        python_text_origin: None,
    }
}
fn diag_value(d: &Diagnostic) -> Value {
    obj(vec![
        ("code", Value::String(d.code.clone())),
        ("path", Value::String(d.path.clone())),
        (
            "severity",
            s(if d.severity == Severity::Error {
                "error"
            } else {
                "warning"
            }),
        ),
        ("message", Value::String(d.message.clone())),
    ])
}
fn validation_value(valid: bool, complete: bool, diagnostics: &[Diagnostic]) -> Value {
    obj(vec![
        ("valid", Value::Bool(valid)),
        ("complete", Value::Bool(complete)),
        (
            "diagnostics",
            arr(diagnostics.iter().map(diag_value).collect()),
        ),
    ])
}
fn safe_to_edit(inspection: &Value) -> bool {
    let validation = get(inspection, "validation").unwrap_or(&Value::Null);
    matches!(get(validation, "valid"), Some(Value::Bool(true)))
        && !items(validation, "diagnostics").iter().any(|d| {
            text(d, "severity").is_some_and(|v| v == &Utf16::from("warning"))
                && text(d, "code").is_some_and(|v| v != &Utf16::from("SAGA_PIVOT"))
        })
        && !items(inspection, "entries")
            .iter()
            .flat_map(|e| items(e, "obligations"))
            .any(|o| text(o, "kind").is_some_and(|k| k == &Utf16::from("unknown")))
}
fn pointer(value: &str) -> String {
    value.replace('~', "~0").replace('/', "~1")
}
fn module_sagas_mut<'a>(
    source: &'a mut Value,
    module_id: &str,
) -> Result<&'a mut Value, EngineError> {
    let Value::Object(doc) = source else {
        return Err(fail("SAGA_STRUCTURE", "", "Expected a Document object"));
    };
    let modules = doc
        .iter_mut()
        .find(|(k, _)| k == &Utf16::from("modules"))
        .and_then(|(_, v)| match v {
            Value::Array(a) => Some(a),
            _ => None,
        })
        .ok_or_else(|| {
            fail(
                "SAGA_STRUCTURE",
                "/modules",
                "Document module inventory is required",
            )
        })?;
    let module = modules
        .iter_mut()
        .find(|m| text(m, "id").is_some_and(|id| id == &Utf16::from(module_id)))
        .ok_or_else(|| fail("SAGA_REFERENCE", "/modules", "Target module does not exist"))?;
    if let Value::Object(fields) = module {
        if !fields.iter().any(|(k, _)| k == &Utf16::from("extensions")) {
            fields.push((Utf16::from("extensions"), Value::Object(vec![])));
        }
        let extensions = fields
            .iter_mut()
            .find(|(k, _)| k == &Utf16::from("extensions"))
            .map(|(_, v)| v)
            .ok_or_else(|| {
                fail(
                    "SAGA_STRUCTURE",
                    "/modules",
                    "Target module extensions are unavailable",
                )
            })?;
        if let Value::Object(ext) = extensions {
            if let Some(index) = ext
                .iter()
                .position(|(k, _)| k == &Utf16::from("umf.actions.saga"))
            {
                return Ok(&mut ext[index].1);
            }
            ext.push((
                Utf16::from("umf.actions.saga"),
                obj(vec![("sagas", arr(vec![]))]),
            ));
            return Ok(&mut ext.last_mut().expect("just inserted").1);
        }
    }
    Err(fail(
        "SAGA_STRUCTURE",
        "/modules",
        "Target module extensions must be an object",
    ))
}
fn set_vocabulary(source: &mut Value) -> Result<(), EngineError> {
    let Value::Object(doc) = source else {
        return Err(fail("SAGA_STRUCTURE", "", "Expected a Document object"));
    };
    if !doc.iter().any(|(k, _)| k == &Utf16::from("vocabularies")) {
        doc.push((
            Utf16::from("vocabularies"),
            obj(vec![(
                "umf.actions.saga",
                obj(vec![("version", s("0.1.0"))]),
            )]),
        ));
        return Ok(());
    }
    let vocab = doc
        .iter_mut()
        .find(|(k, _)| k == &Utf16::from("vocabularies"))
        .map(|(_, v)| v)
        .ok_or_else(|| {
            fail(
                "SAGA_STRUCTURE",
                "/vocabularies",
                "Document vocabularies are required",
            )
        })?;
    if let Value::Object(fields) = vocab {
        if !fields
            .iter()
            .any(|(k, _)| k == &Utf16::from("umf.actions.saga"))
        {
            fields.push((
                Utf16::from("umf.actions.saga"),
                obj(vec![("version", s("0.1.0"))]),
            ));
        }
        Ok(())
    } else {
        Err(fail(
            "SAGA_STRUCTURE",
            "/vocabularies",
            "Vocabularies must be an object",
        ))
    }
}

#[derive(Clone)]
struct LocatedAction {
    module: Utf16,
    path: Utf16,
    value: Value,
    obligations: Vec<crate::actions::ActionObligation>,
}
fn actions_by_identity(actions: &[ActionDeclaration]) -> BTreeMap<(Utf16, Utf16), LocatedAction> {
    actions
        .iter()
        .map(|a| {
            (
                (a.module.clone(), a.id.clone()),
                LocatedAction {
                    module: a.module.clone(),
                    path: a.pointer.clone(),
                    value: a.value.clone(),
                    obligations: a.obligations.clone(),
                },
            )
        })
        .collect()
}
fn same_parameter_type(source: &Value, destination: &Value) -> bool {
    let Some(sk) = text(source, "kind") else {
        return false;
    };
    if text(destination, "kind") != Some(sk) {
        return false;
    }
    match sk.to_utf8().ok().as_deref() {
        Some("value") => get(source, "field") == get(destination, "field"),
        Some("entity") => get(source, "target") == get(destination, "target"),
        _ => false,
    }
}
fn required(p: &Value) -> bool {
    matches!(get(p, "required"), Some(Value::Bool(true)))
}
fn unknown_members(
    value: &Value,
    allowed: &[&str],
    path: &str,
    obligations: &mut Vec<Value>,
    diagnostics: &mut Vec<Diagnostic>,
) {
    for (key, _) in crate::value::object_members(value).unwrap_or(&[]) {
        let name = key.to_utf8().unwrap_or_default();
        if !allowed.contains(&name.as_str()) {
            let at = format!("{path}/{}", pointer(&name));
            obligations.push(obj(vec![
                ("id", s(format!("unknown:{at}"))),
                ("path", s(at.clone())),
                ("kind", s("unknown")),
                ("status", s("unchecked")),
            ]));
            diagnostics.push(Diagnostic {
                code: Utf16::from("SAGA_UNCHECKED"),
                path: Utf16::from(at),
                python_source_path: false,
                message: Utf16::from(
                    "Unknown saga member is preserved but its meaning is unchecked",
                ),
                severity: Severity::Warning,
                python_text_origin: None,
            });
        }
    }
}
fn check_parameter_ids(values: &[Value], path: &str, diagnostics: &mut Vec<Diagnostic>) {
    let mut seen = BTreeSet::new();
    for (index, value) in values.iter().enumerate() {
        if let Some(id) = text(value, "id") {
            if !seen.insert(id.clone()) {
                diagnostics.push(diagnostic(fail(
                    "SAGA_REFERENCE",
                    &format!("{path}/{index}/id"),
                    "Duplicate parameter/output id",
                )));
            }
        }
    }
}
fn action<'a>(
    actions: &'a BTreeMap<(Utf16, Utf16), LocatedAction>,
    reference: &Value,
) -> Option<&'a LocatedAction> {
    Some(actions.get(&(
        text(reference, "module")?.clone(),
        text(reference, "action")?.clone(),
    ))?)
}
fn parameter<'a>(action: &'a Value, name: &Utf16, member_name: &str) -> Option<&'a Value> {
    items(action, member_name)
        .iter()
        .find(|p| text(p, "id") == Some(name))
}
fn mapping_check(
    definition: &Value,
    action_decl: &Value,
    mappings: &[Value],
    path: &str,
    completed: &BTreeMap<Utf16, (usize, Vec<Value>)>,
    all_steps: &BTreeSet<Utf16>,
    current: usize,
    diagnostics: &mut Vec<Diagnostic>,
    obligations: &mut Vec<Value>,
) {
    let mut seen = BTreeSet::new();
    for (mi, mapping) in mappings.iter().enumerate() {
        let mp = format!("{path}/{mi}");
        let Some(target_id) = text(mapping, "parameter") else {
            diagnostics.push(diagnostic(fail(
                "SAGA_REFERENCE",
                &format!("{mp}/parameter"),
                "Mapping parameter id is required",
            )));
            continue;
        };
        if !seen.insert(target_id.clone()) {
            diagnostics.push(diagnostic(fail(
                "SAGA_REFERENCE",
                &format!("{mp}/parameter"),
                "Duplicate mapping target",
            )));
            continue;
        }
        unknown_members(
            mapping,
            &["parameter", "from"],
            &mp,
            obligations,
            diagnostics,
        );
        unknown_members(
            get(mapping, "from").unwrap_or(&Value::Null),
            &["input", "step", "output"],
            &format!("{mp}/from"),
            obligations,
            diagnostics,
        );
        let target = parameter(action_decl, target_id, "parameters");
        let Some(source) = get(mapping, "from") else {
            diagnostics.push(diagnostic(fail(
                "SAGA_REFERENCE",
                &format!("{mp}/from"),
                "Mapping source is required",
            )));
            continue;
        };
        let source_parameter = if let Some(input) = text(source, "input") {
            parameter(definition, input, "parameters")
        } else if let (Some(step), Some(output)) = (text(source, "step"), text(source, "output")) {
            if let Some((position, outputs)) = completed.get(step) {
                if *position >= current {
                    diagnostics.push(diagnostic(fail(
                        "SAGA_REFERENCE",
                        &format!("{mp}/from"),
                        "Forward inputs may reference only earlier steps",
                    )));
                }
                outputs.iter().find(|p| text(p, "id") == Some(output))
            } else if all_steps.contains(step) {
                diagnostics.push(diagnostic(fail(
                    "SAGA_REFERENCE",
                    &format!("{mp}/from"),
                    "Forward inputs may reference only earlier steps",
                )));
                None
            } else {
                None
            }
        } else {
            None
        };
        match (target, source_parameter) {
            (Some(dst), Some(src))
                if same_parameter_type(src, dst) && !(required(dst) && !required(src)) => {}
            (None, _) => diagnostics.push(diagnostic(fail(
                "SAGA_REFERENCE",
                &format!("{mp}/parameter"),
                "Mapping names no declared target parameter",
            ))),
            (_, None) => diagnostics.push(diagnostic(fail(
                "SAGA_REFERENCE",
                &format!("{mp}/from"),
                "Mapping source does not resolve",
            ))),
            _ => diagnostics.push(diagnostic(fail(
                "SAGA_TYPE",
                &format!("{mp}/from"),
                "Mapping source has incompatible identity or requiredness",
            ))),
        }
    }
    for target in items(action_decl, "parameters") {
        if required(target) && !text(target, "id").is_some_and(|id| seen.contains(id)) {
            diagnostics.push(diagnostic(fail(
                "SAGA_REFERENCE",
                path,
                "Required action parameter has no mapping",
            )));
        }
    }
}

fn analyze_definition(
    document: &Value,
    module_id: &Utf16,
    definition: &Value,
    actions: &BTreeMap<(Utf16, Utf16), LocatedAction>,
    base: &str,
) -> (Vec<Value>, Vec<Diagnostic>) {
    let mut diagnostics = Vec::new();
    let steps = items(definition, "steps");
    let all_step_ids: BTreeSet<Utf16> = steps
        .iter()
        .filter_map(|step| text(step, "id").cloned())
        .collect();
    let mut step_ids = BTreeSet::new();
    let mut completed: BTreeMap<Utf16, (usize, Vec<Value>)> = BTreeMap::new();
    let mut resolved = Vec::new();
    let mut obligations = vec![obj(vec![
        ("id", s("coordination:sequential/1")),
        ("path", s(base)),
        ("kind", s("coordination")),
        ("status", s("unchecked")),
    ])];
    unknown_members(
        definition,
        &[
            "id",
            "name",
            "description",
            "profile",
            "parameters",
            "outputs",
            "outputBindings",
            "steps",
        ],
        base,
        &mut obligations,
        &mut diagnostics,
    );
    check_parameter_ids(
        items(definition, "parameters"),
        &format!("{base}/parameters"),
        &mut diagnostics,
    );
    check_parameter_ids(
        items(definition, "outputs"),
        &format!("{base}/outputs"),
        &mut diagnostics,
    );
    let profile = get(definition, "profile").unwrap_or(&Value::Null);
    if text(profile, "id").is_none_or(|v| v != &Utf16::from("umf.actions.saga.sequential"))
        || text(profile, "version").is_none_or(|v| v != &Utf16::from("1"))
        || crate::value::object_members(profile).is_none_or(|fields| fields.len() != 2)
    {
        obligations.push(obj(vec![
            ("id", s("unknown:profile")),
            ("path", s(format!("{base}/profile"))),
            ("kind", s("unknown")),
            ("status", s("unchecked")),
        ]));
        diagnostics.push(Diagnostic {
            code: Utf16::from("SAGA_UNCHECKED"),
            path: Utf16::from(format!("{base}/profile")),
            python_source_path: false,
            message: Utf16::from("Only sequential/1 has defined portable saga semantics"),
            severity: Severity::Warning,
            python_text_origin: None,
        });
    }
    let mut irreversible_at = None;
    for (index, step) in steps.iter().enumerate() {
        let p = format!("{base}/steps/{index}");
        unknown_members(
            step,
            &["id", "action", "binding", "inputs", "compensation"],
            &p,
            &mut obligations,
            &mut diagnostics,
        );
        let Some(id) = text(step, "id").cloned() else {
            continue;
        };
        if !step_ids.insert(id.clone()) {
            diagnostics.push(diagnostic(fail(
                "SAGA_REFERENCE",
                &format!("{p}/id"),
                "Duplicate step id",
            )));
        }
        let action_ref = get(step, "action").unwrap_or(&Value::Null);
        let target = action(actions, action_ref);
        if target.is_none() {
            diagnostics.push(diagnostic(fail(
                "SAGA_REFERENCE",
                &format!("{p}/action"),
                "Exact action dependency does not resolve",
            )));
        }
        let binding = text(step, "binding");
        if binding.is_none() {
            diagnostics.push(diagnostic(fail(
                "SAGA_BINDING",
                &format!("{p}/binding"),
                "Logical binding is required",
            )));
        }
        obligations.push(obj(vec![
            ("id", s(format!("binding:{index}"))),
            ("path", s(format!("{p}/binding"))),
            ("kind", s("binding")),
            ("status", s("unchecked")),
        ]));
        let resolved_action = target.map(|a| a.value.clone());
        if let Some(ref action_decl) = resolved_action {
            mapping_check(
                definition,
                action_decl,
                items(step, "inputs"),
                &format!("{p}/inputs"),
                &completed,
                &all_step_ids,
                index,
                &mut diagnostics,
                &mut obligations,
            );
        }
        if let Some(action_target) = target {
            let action_obligations = &action_target.obligations;
            for action_obligation in action_obligations {
                obligations.push(obj(vec![
                    (
                        "id",
                        s(format!(
                            "action:{}:{}",
                            id.to_utf8().unwrap_or_default(),
                            action_obligation.path.to_utf8().unwrap_or_default()
                        )),
                    ),
                    ("path", Value::String(action_obligation.path.clone())),
                    ("kind", Value::String(action_obligation.kind.clone())),
                    ("status", Value::String(action_obligation.status.clone())),
                ]));
            }
        }
        let mut recovery_sources = completed.clone();
        if let Some(action_decl) = resolved_action.as_ref() {
            recovery_sources.insert(id.clone(), (index, items(action_decl, "outputs").to_vec()));
        }
        let compensation = get(step, "compensation").unwrap_or(&Value::Null);
        match text(compensation, "kind")
            .and_then(|v| v.to_utf8().ok())
            .as_deref()
        {
            Some("action") => {
                unknown_members(
                    compensation,
                    &["kind", "action", "binding", "inputs"],
                    &format!("{p}/compensation"),
                    &mut obligations,
                    &mut diagnostics,
                );
                let comp_action = get(compensation, "action").unwrap_or(&Value::Null);
                if let Some(ca) = action(actions, comp_action) {
                    mapping_check(
                        definition,
                        &ca.value,
                        items(compensation, "inputs"),
                        &format!("{p}/compensation/inputs"),
                        &recovery_sources,
                        &all_step_ids,
                        index + 1,
                        &mut diagnostics,
                        &mut obligations,
                    );
                    obligations.push(obj(vec![
                        ("id", s(format!("saga.invocation.finality/{index}/c"))),
                        ("path", s(format!("{p}/compensation/action"))),
                        ("kind", s("recovery")),
                        ("status", s("unchecked")),
                    ]));
                    for action_obligation in &ca.obligations {
                        obligations.push(obj(vec![
                            (
                                "id",
                                s(format!(
                                    "compensation:{}:{}",
                                    index,
                                    action_obligation.path.to_utf8().unwrap_or_default()
                                )),
                            ),
                            ("path", Value::String(action_obligation.path.clone())),
                            ("kind", Value::String(action_obligation.kind.clone())),
                            ("status", Value::String(action_obligation.status.clone())),
                        ]));
                    }
                } else {
                    diagnostics.push(diagnostic(fail(
                        "SAGA_REFERENCE",
                        &format!("{p}/compensation/action"),
                        "Exact compensation action does not resolve",
                    )));
                }
                obligations.push(obj(vec![
                    ("id", s(format!("recovery:{index}:compensation"))),
                    ("path", s(format!("{p}/compensation"))),
                    ("kind", s("recovery")),
                    ("status", s("unchecked")),
                ]));
            }
            Some("irreversible") => {
                unknown_members(
                    compensation,
                    &["kind", "reason"],
                    &format!("{p}/compensation"),
                    &mut obligations,
                    &mut diagnostics,
                );
                irreversible_at.get_or_insert((index, id.clone()));
                obligations.push(obj(vec![
                    ("id", s(format!("recovery:{index}:irreversible"))),
                    ("path", s(format!("{p}/compensation"))),
                    ("kind", s("recovery")),
                    ("status", s("unchecked")),
                ]));
            }
            Some("unnecessary") => {
                unknown_members(
                    compensation,
                    &["kind", "profile"],
                    &format!("{p}/compensation"),
                    &mut obligations,
                    &mut diagnostics,
                );
                let writes_empty = target.is_some_and(|a| items(&a.value, "writes").is_empty());
                let profile = get(compensation, "profile").unwrap_or(&Value::Null);
                let exact_profile = crate::value::object_members(profile)
                    .is_some_and(|fields| fields.len() == 2)
                    && text(profile, "id")
                        .is_some_and(|id| id == &Utf16::from("umf.actions.saga.no-effect"))
                    && text(profile, "version").is_some_and(|v| v == &Utf16::from("1"));
                if !writes_empty || !exact_profile {
                    diagnostics.push(Diagnostic { code: Utf16::from("SAGA_UNCHECKED"), path: Utf16::from(format!("{p}/compensation")), python_source_path: false,
                    message: Utf16::from("No-effect recovery requires the exact qualified no-effect/1 profile and an empty writes declaration"), severity: Severity::Warning, python_text_origin: None });
                    obligations.push(obj(vec![
                        ("id", s(format!("unknown:{index}:no-effect-profile"))),
                        ("path", s(format!("{p}/compensation/profile"))),
                        ("kind", s("unknown")),
                        ("status", s("unchecked")),
                    ]));
                }
                obligations.push(obj(vec![
                    ("id", s(format!("recovery:{index}:no-effect"))),
                    ("path", s(format!("{p}/compensation"))),
                    ("kind", s("recovery")),
                    ("status", s("unchecked")),
                ]));
            }
            Some(_) => {
                obligations.push(obj(vec![
                    ("id", s(format!("unknown:{index}:compensation"))),
                    ("path", s(format!("{p}/compensation"))),
                    ("kind", s("unknown")),
                    ("status", s("unchecked")),
                ]));
                diagnostics.push(Diagnostic {
                    code: Utf16::from("SAGA_UNCHECKED"),
                    path: Utf16::from(format!("{p}/compensation")),
                    python_source_path: false,
                    message: Utf16::from(
                        "Unknown compensation kind is preserved but prevents compatibility",
                    ),
                    severity: Severity::Warning,
                    python_text_origin: None,
                });
            }
            None => diagnostics.push(diagnostic(fail(
                "SAGA_RECOVERY",
                &format!("{p}/compensation"),
                "Every step requires an explicit compensation disposition",
            ))),
        }
        if let Some(action_decl) = resolved_action {
            let action_identity = format!(
                "{}/{}",
                action_decl_id(&action_decl),
                id.to_utf8().unwrap_or_default()
            );
            obligations.push(obj(vec![
                ("id", s(format!("action:{action_identity}"))),
                ("path", s(format!("{p}/action"))),
                ("kind", s("action")),
                ("status", s("unchecked")),
            ]));
            if target.is_some() {
                // Forward and compensation finality claims are separate obligations.
                obligations.push(obj(vec![
                    ("id", s(format!("saga.invocation.finality/{index}/f"))),
                    ("path", s(format!("{p}/action"))),
                    ("kind", s("recovery")),
                    ("status", s("unchecked")),
                ]));
            }
            completed.insert(id, (index, items(&action_decl, "outputs").to_vec()));
        }
        resolved.push((index, p));
    }
    if let Some((index, id)) = irreversible_at {
        if index + 1 < steps.len() {
            diagnostics.push(Diagnostic { code: s("SAGA_PIVOT").into_string_utf16(), path: Utf16::from(format!("{base}/steps/{index}/compensation")), python_source_path: false,
                message: Utf16::from(format!("Irreversible step {} precedes later forward work {}; intervention may be required", id.to_utf8().unwrap_or_default(), steps[index + 1..].iter().filter_map(|s| text(s, "id").and_then(|v| v.to_utf8().ok())).collect::<Vec<_>>().join(", "))), severity: Severity::Warning, python_text_origin: None });
        }
    }
    let mut mapped_outputs = BTreeSet::new();
    for (index, mapping) in items(definition, "outputBindings").iter().enumerate() {
        let map_path = format!("{base}/outputBindings/{index}");
        unknown_members(
            mapping,
            &["parameter", "from"],
            &map_path,
            &mut obligations,
            &mut diagnostics,
        );
        unknown_members(
            get(mapping, "from").unwrap_or(&Value::Null),
            &["input", "step", "output"],
            &format!("{map_path}/from"),
            &mut obligations,
            &mut diagnostics,
        );
        let Some(output_id) = text(mapping, "parameter") else {
            continue;
        };
        if !mapped_outputs.insert(output_id.clone()) {
            diagnostics.push(diagnostic(fail(
                "SAGA_REFERENCE",
                &format!("{map_path}/parameter"),
                "Duplicate output mapping target",
            )));
            continue;
        }
        let expected = parameter(definition, output_id, "outputs");
        let src = get(mapping, "from").unwrap_or(&Value::Null);
        let source = if let (Some(step), Some(output)) = (text(src, "step"), text(src, "output")) {
            completed
                .get(step)
                .and_then(|(_, outputs)| outputs.iter().find(|o| text(o, "id") == Some(output)))
        } else {
            text(src, "input").and_then(|input| parameter(definition, input, "parameters"))
        };
        if !matches!((expected, source), (Some(a), Some(b)) if same_parameter_type(a, b) && (!required(a) || required(b)))
        {
            diagnostics.push(diagnostic(fail(
                if expected.is_none() {
                    "SAGA_REFERENCE"
                } else {
                    "SAGA_TYPE"
                },
                &format!("{base}/outputBindings/{index}/from"),
                "Saga output binding is unavailable or incompatible",
            )));
        }
    }
    for output in items(definition, "outputs") {
        if required(output) && text(output, "id").is_some_and(|id| !mapped_outputs.contains(id)) {
            diagnostics.push(diagnostic(fail(
                "SAGA_REFERENCE",
                &format!("{base}/outputBindings"),
                "Required saga output has no mapping",
            )));
        }
    }
    let _ = (document, module_id, resolved);
    obligations.sort_by(|a, b| {
        let finality_key = |value: &Value| {
            text(value, "id")
                .and_then(|id| id.to_utf8().ok())
                .and_then(|id| {
                    let (ordinal, side) = id
                        .strip_prefix("saga.invocation.finality/")?
                        .split_once('/')?;
                    Some((
                        ordinal.parse::<usize>().ok()?,
                        if side == "f" { 0 } else { 1 },
                    ))
                })
        };
        match (finality_key(a), finality_key(b)) {
            (Some(left), Some(right)) => left.cmp(&right),
            (Some(_), None) => std::cmp::Ordering::Greater,
            (None, Some(_)) => std::cmp::Ordering::Less,
            (None, None) => std::cmp::Ordering::Equal,
        }
    });
    (obligations, diagnostics)
}
trait IntoUtf16 {
    fn into_string_utf16(self) -> Utf16;
}
impl IntoUtf16 for Value {
    fn into_string_utf16(self) -> Utf16 {
        if let Value::String(v) = self {
            v
        } else {
            Utf16::default()
        }
    }
}
fn action_decl_id(action: &Value) -> String {
    text(action, "id")
        .and_then(|s| s.to_utf8().ok())
        .unwrap_or_default()
}

impl CodegenEngine<'_> {
    /// Inspect saga declarations using the explicitly installed schema package
    /// and the shared, immutable Rust action analysis.
    pub fn inspect_sagas(
        &self,
        source: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let resources = self.resources();
        let schema = resources.saga_compiled().ok_or_else(|| {
            fail(
                "SAGA_UNAVAILABLE",
                "",
                "Explicit saga package installation is required",
            )
        })?;
        if text(source, "umf")
            .and_then(|v| v.to_utf8().ok())
            .as_deref()
            != Some("0.10.0")
        {
            return Err(fail(
                "SAGA_STRUCTURE",
                "/umf",
                "Sagas require exact core 0.10.0",
            ));
        }
        let vocab = get(source, "vocabularies").and_then(|v| get(v, "umf.actions.saga"));
        let version_ok = text(vocab.unwrap_or(&Value::Null), "version")
            .and_then(|v| v.to_utf8().ok())
            .as_deref()
            == Some("0.1.0");
        let has_payload = items(source, "modules").iter().any(|module| {
            get(module, "extensions")
                .and_then(|e| get(e, "umf.actions.saga"))
                .is_some()
        });
        let (actions, mut diagnostics) = match inspect_document(source, resources, None, ctx) {
            Ok(action_inspection) => {
                let actions = actions_by_identity(&action_inspection.actions);
                let diagnostics = action_inspection
                    .validation
                    .diagnostics
                    .into_iter()
                    .filter(|d| {
                        !(d.code == Utf16::from("UNKNOWN_EXTENSION")
                            && d.path == Utf16::from("/vocabularies/umf.actions.saga"))
                    })
                    .collect();
                (actions, diagnostics)
            }
            Err(error) => (BTreeMap::new(), vec![diagnostic(error)]),
        };
        if has_payload && !version_ok {
            diagnostics.push(diagnostic(fail(
                "SAGA_STRUCTURE",
                "/vocabularies/umf.actions.saga",
                "Saga declarations require exact vocabulary version 0.1.0",
            )));
        }
        if version_ok
            && crate::value::object_members(vocab.unwrap()).is_some_and(|fields| fields.len() != 1)
        {
            diagnostics.push(Diagnostic {
                code: Utf16::from("SAGA_UNCHECKED"),
                path: Utf16::from("/vocabularies/umf.actions.saga"),
                python_source_path: false,
                message: Utf16::from(
                    "Unknown saga vocabulary members are retained but their meaning is unchecked",
                ),
                severity: Severity::Warning,
                python_text_origin: None,
            });
        }
        let mut entries = Vec::new();
        let mut total_obligations = 0usize;
        ctx.charge_work(diagnostics.len(), Utf16::default())?;
        if diagnostics.len() > 4096 {
            return Err(fail(
                "LIMIT",
                "",
                "Saga diagnostics exceed the 4096 item bound",
            ));
        }
        for (mi, module) in items(source, "modules").iter().enumerate() {
            ctx.charge_work(1, Utf16::from(format!("/modules/{mi}")))?;
            let module_id = text(module, "id").cloned().ok_or_else(|| {
                fail(
                    "SAGA_STRUCTURE",
                    &format!("/modules/{mi}/id"),
                    "Module id is required",
                )
            })?;
            let Some(payload) = get(module, "extensions").and_then(|e| get(e, "umf.actions.saga"))
            else {
                continue;
            };
            if !version_ok {
                continue;
            }
            for (key, _) in crate::value::object_members(payload).unwrap_or(&[]) {
                if key != &Utf16::from("sagas") {
                    diagnostics.push(Diagnostic {
                        code: Utf16::from("SAGA_UNCHECKED"),
                        path: Utf16::from(format!(
                            "/modules/{mi}/extensions/umf.actions.saga/{}",
                            pointer(&key.to_utf8().unwrap_or_default())
                        )),
                        python_source_path: false,
                        message: Utf16::from(
                            "Unknown saga package member is preserved but its meaning is unchecked",
                        ),
                        severity: Severity::Warning,
                        python_text_origin: None,
                    });
                }
            }
            let errors = schema.validate(payload, ctx)?;
            if !errors.is_empty() {
                let base = format!("/modules/{mi}/extensions/umf.actions.saga");
                for error in errors {
                    let suffix = error.instance_path.to_utf8().unwrap_or_default();
                    let code = if suffix.ends_with("/steps")
                        && items(payload, "sagas")
                            .iter()
                            .any(|d| items(d, "steps").len() > 32)
                    {
                        "SAGA_LIMIT"
                    } else {
                        "SAGA_STRUCTURE"
                    };
                    diagnostics.push(diagnostic(fail(
                        code,
                        &format!("{base}{suffix}"),
                        "Known saga declaration shape is invalid",
                    )));
                }
                continue;
            }
            let mut saga_ids = BTreeSet::new();
            for (di, definition) in items(payload, "sagas").iter().enumerate() {
                let path = format!("/modules/{mi}/extensions/umf.actions.saga/sagas/{di}");
                ctx.charge_work(
                    1 + items(definition, "steps").len()
                        + items(definition, "parameters").len()
                        + items(definition, "outputs").len(),
                    Utf16::from(path.clone()),
                )?;
                if text(definition, "id").is_some_and(|id| !saga_ids.insert(id.clone())) {
                    diagnostics.push(diagnostic(fail(
                        "SAGA_REFERENCE",
                        &format!("{path}/id"),
                        "Duplicate saga identity in module",
                    )));
                }
                let (obligations, mut local) =
                    analyze_definition(source, &module_id, definition, &actions, &path);
                diagnostics.append(&mut local);
                total_obligations = total_obligations.saturating_add(obligations.len());
                ctx.charge_work(
                    obligations.len().saturating_add(diagnostics.len()),
                    Utf16::from(path.clone()),
                )?;
                if entries.len() >= 4096 || total_obligations > 4096 || diagnostics.len() > 4096 {
                    return Err(fail(
                        "LIMIT",
                        &path,
                        "Saga analysis exceeds the 4096 entry/obligation bound",
                    ));
                }
                entries.push(obj(vec![
                    ("module", Value::String(module_id.clone())),
                    ("path", s(path)),
                    ("definition", definition.clone()),
                    ("obligations", arr(obligations)),
                ]));
            }
        }
        let valid = !diagnostics.iter().any(|d| d.severity == Severity::Error);
        let complete = valid && !diagnostics.iter().any(|d| d.severity == Severity::Warning);
        Ok(obj(vec![
            ("source", umf_core::copy_json(source, ctx)?),
            (
                "validation",
                validation_value(valid, complete, &diagnostics),
            ),
            ("entries", arr(entries)),
        ]))
    }

    pub fn declare_saga(
        &self,
        source: &Value,
        module: &Utf16,
        definition: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let before = self.inspect_sagas(source, ctx)?;
        if !safe_to_edit(&before) {
            return Err(fail(
                "SAGA_UNKNOWN",
                "",
                "Incomplete source interpretation prevents safe declaration",
            ));
        }
        let mut next = umf_core::copy_json(source, ctx)?;
        set_vocabulary(&mut next)?;
        let payload = module_sagas_mut(
            &mut next,
            &module
                .to_utf8()
                .map_err(|_| fail("SAGA_STRUCTURE", "", "Module id is not Unicode"))?,
        )?;
        let sagas = match payload {
            Value::Object(fields) => fields
                .iter_mut()
                .find(|(k, _)| k == &Utf16::from("sagas"))
                .map(|(_, v)| v),
            _ => None,
        }
        .ok_or_else(|| fail("SAGA_STRUCTURE", "", "Saga payload has no sagas array"))?;
        let Value::Array(sagas) = sagas else {
            return Err(fail("SAGA_STRUCTURE", "", "Saga list must be an array"));
        };
        let definition = umf_core::copy_json(definition, ctx)?;
        let used: BTreeSet<Utf16> = sagas
            .iter()
            .filter_map(|d| text(d, "id").cloned())
            .collect();
        let id = text(&definition, "id")
            .cloned()
            .ok_or_else(|| fail("SAGA_STRUCTURE", "/id", "A fresh saga identity is required"))?;
        if used.contains(&id) {
            return Err(fail(
                "SAGA_REFERENCE",
                "/id",
                "Saga identity is already used in this module",
            ));
        }
        sagas.push(definition);
        let inspected = self.inspect_sagas(&next, ctx)?;
        let validation = get(&inspected, "validation").unwrap_or(&Value::Null);
        if !safe_to_edit(&inspected) || matches!(get(validation, "valid"), Some(Value::Bool(false)))
        {
            return Err(fail(
                "SAGA_INVALID",
                "",
                "Saga declaration failed portable inspection",
            ));
        }
        Ok(next)
    }

    pub fn edit_saga(
        &self,
        source: &Value,
        identity: &Value,
        replacement: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let inspection = self.inspect_sagas(source, ctx)?;
        let module_id = text(identity, "module").ok_or_else(|| {
            fail(
                "SAGA_REFERENCE",
                "/identity/module",
                "Saga module identity is required",
            )
        })?;
        let saga_id = text(identity, "saga").ok_or_else(|| {
            fail(
                "SAGA_REFERENCE",
                "/identity/saga",
                "Saga identity is required",
            )
        })?;
        let found_entry = items(&inspection, "entries")
            .iter()
            .find(|entry| {
                text(entry, "module") == Some(module_id)
                    && text(get(entry, "definition").unwrap_or(&Value::Null), "id") == Some(saga_id)
            })
            .ok_or_else(|| fail("SAGA_REFERENCE", "", "Saga identity does not resolve"))?;
        if items(found_entry, "obligations")
            .iter()
            .any(|o| text(o, "kind").is_some_and(|v| v == &Utf16::from("unknown")))
        {
            return Err(fail(
                "SAGA_UNCHECKED",
                "",
                "Unknown saga semantics prevent dependent editing",
            ));
        }
        if !safe_to_edit(&inspection) {
            return Err(fail(
                "SAGA_UNKNOWN",
                "",
                "Incomplete source interpretation prevents safe editing",
            ));
        }
        let mut next = umf_core::copy_json(source, ctx)?;
        let m = module_id
            .to_utf8()
            .map_err(|_| fail("SAGA_REFERENCE", "", "Module id is not Unicode"))?;
        let payload = module_sagas_mut(&mut next, &m)?;
        if let Value::Object(fields) = payload {
            let sagas = fields
                .iter_mut()
                .find(|(k, _)| k == &Utf16::from("sagas"))
                .map(|(_, v)| v)
                .unwrap();
            if let Value::Array(list) = sagas {
                let target = list
                    .iter_mut()
                    .find(|d| text(d, "id") == Some(saga_id))
                    .unwrap();
                let mut updated = umf_core::copy_json(replacement, ctx)?;
                if let Value::Object(fields) = &mut updated {
                    if fields
                        .iter()
                        .find(|(key, _)| key == &Utf16::from("id"))
                        .is_some_and(|(_, value)| value != &Value::String(saga_id.clone()))
                    {
                        return Err(fail(
                            "SAGA_REFERENCE",
                            "/replacement/id",
                            "Edit cannot change the stable saga identity",
                        ));
                    }
                    fields.retain(|(key, _)| key != &Utf16::from("id"));
                    fields.push((Utf16::from("id"), Value::String(saga_id.clone())));
                    *target = updated;
                } else {
                    return Err(fail("SAGA_STRUCTURE", "", "Replacement must be an object"));
                }
            }
        }
        let after = self.inspect_sagas(&next, ctx)?;
        if !safe_to_edit(&after) {
            return Err(fail(
                "SAGA_INVALID",
                "",
                "Edited Document is invalid or incomplete",
            ));
        }
        Ok(next)
    }

    pub fn assess_saga(
        &self,
        source: &Value,
        identity: &Value,
        capabilities: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let capabilities_schema =
            self.resources()
                .saga_capabilities_compiled()
                .ok_or_else(|| {
                    fail(
                        "SAGA_UNAVAILABLE",
                        "",
                        "Explicit saga package installation is required",
                    )
                })?;
        if !capabilities_schema.validate(capabilities, ctx)?.is_empty() {
            return Err(fail(
                "SAGA_PROFILE",
                "/capabilities",
                "Capability declaration does not match the declaration schema",
            ));
        }
        let claimed_source = get(capabilities, "source").ok_or_else(|| {
            fail(
                "SAGA_PROFILE",
                "/capabilities/source",
                "Capability source Document is required",
            )
        })?;
        if crate::canonical::canonical_json_admitted(claimed_source, ctx)?
            != crate::canonical::canonical_json_admitted(source, ctx)?
        {
            return Err(fail(
                "SAGA_PROFILE",
                "/capabilities/source",
                "Capability claims are scoped to a different source Document",
            ));
        }
        if get(capabilities, "identity") != Some(identity) {
            return Err(fail(
                "SAGA_PROFILE",
                "/capabilities/identity",
                "Capability claims are scoped to a different saga identity",
            ));
        }
        if text(capabilities, "coreVersion")
            .and_then(|v| v.to_utf8().ok())
            .as_deref()
            != Some("0.10.0")
            || text(capabilities, "sagaVersion")
                .and_then(|v| v.to_utf8().ok())
                .as_deref()
                != Some("0.1.0")
        {
            return Err(fail(
                "SAGA_PROFILE",
                "/capabilities",
                "Capability versions do not match the analyzed source",
            ));
        }
        let inspection = self.inspect_sagas(source, ctx)?;
        let module = text(identity, "module").ok_or_else(|| {
            fail(
                "SAGA_REFERENCE",
                "/identity/module",
                "Saga module identity is required",
            )
        })?;
        let saga = text(identity, "saga").ok_or_else(|| {
            fail(
                "SAGA_REFERENCE",
                "/identity/saga",
                "Saga identity is required",
            )
        })?;
        let definition_entry = items(&inspection, "entries")
            .iter()
            .find(|e| {
                text(e, "module") == Some(module)
                    && text(get(e, "definition").unwrap_or(&Value::Null), "id") == Some(saga)
            })
            .ok_or_else(|| fail("SAGA_REFERENCE", "", "Saga identity does not resolve"))?;
        let obligations = items(definition_entry, "obligations");
        let claims = items(capabilities, "claims");
        let mut used = BTreeSet::new();
        let mut outcomes = Vec::new();
        let mut diagnostics = Vec::new();
        let mut compatible = true;
        for obligation in obligations {
            let id = text(obligation, "id").cloned().unwrap_or_default();
            let is_unknown = text(obligation, "kind").is_some_and(|k| k == &Utf16::from("unknown"));
            let matching: Vec<_> = claims
                .iter()
                .filter(|c| text(c, "obligation") == Some(&id))
                .collect();
            let status = if is_unknown || matching.len() != 1 {
                compatible = false;
                "unknown"
            } else {
                used.insert(id.clone());
                match text(matching[0], "status")
                    .and_then(|v| v.to_utf8().ok())
                    .as_deref()
                {
                    Some("supported") => "supported",
                    Some("unsupported") => {
                        compatible = false;
                        "unsupported"
                    }
                    _ => {
                        compatible = false;
                        "unknown"
                    }
                }
            };
            if status != "supported" {
                diagnostics.push(obj(vec![
                    ("code", s("SAGA_CAPABILITY")),
                    (
                        "path",
                        Value::String(text(obligation, "path").cloned().unwrap_or_default()),
                    ),
                    ("severity", s("warning")),
                    ("message", s(format!("Obligation is {status}"))),
                ]));
            }
            let evidence = if matching.len() == 1 {
                items(matching[0], "evidence").to_vec()
            } else {
                vec![]
            };
            outcomes.push(obj(vec![
                ("obligation", Value::String(id)),
                ("status", s(status)),
                ("evidence", arr(evidence)),
            ]));
        }
        if claims
            .iter()
            .any(|c| text(c, "obligation").is_some_and(|id| !used.contains(id)))
        {
            compatible = false;
        }
        let valid = matches!(
            get(
                get(&inspection, "validation").unwrap_or(&Value::Null),
                "valid"
            ),
            Some(Value::Bool(true))
        );
        let complete = matches!(
            get(
                get(&inspection, "validation").unwrap_or(&Value::Null),
                "complete"
            ),
            Some(Value::Bool(true))
        );
        let coordination = text(capabilities, "coordination")
            .and_then(|v| v.to_utf8().ok())
            .unwrap_or_else(|| "unknown".into());
        let coordination = if matches!(
            coordination.as_str(),
            "supported" | "unsupported" | "unknown"
        ) {
            coordination
        } else {
            "unknown".into()
        };
        if coordination != "supported" {
            compatible = false;
        }
        Ok(obj(vec![
            ("valid", Value::Bool(valid)),
            ("complete", Value::Bool(complete)),
            ("declarationCompatible", Value::Bool(compatible && valid)),
            ("executionVerified", Value::Bool(false)),
            ("coordination", s(coordination)),
            ("outcomes", arr(outcomes)),
            ("diagnostics", arr(diagnostics)),
        ]))
    }
}

#[cfg(test)]
mod tests;
