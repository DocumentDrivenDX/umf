// SPDX-License-Identifier: MIT OR Apache-2.0
//! Rust-owned Action declaration, inspection, editing, and capability assessment.
use std::collections::BTreeMap;

use umf_core::{Context, EngineError, Utf16, Value};

use super::{inspect_document, ActionDeclaration, ActionInspection, ActionObligation};
use crate::{
    resources::CodegenEngine,
    value::{array_items, member, object_members, string_member},
};

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
fn validation_value(result: &ActionInspection) -> Value {
    obj(vec![
        ("valid", Value::Bool(result.validation.valid)),
        ("complete", Value::Bool(result.validation.complete)),
        (
            "diagnostics",
            arr(result
                .validation
                .diagnostics
                .iter()
                .map(|d| {
                    obj(vec![
                        ("code", Value::String(d.code.clone())),
                        ("path", Value::String(d.path.clone())),
                        ("message", Value::String(d.message.clone())),
                        (
                            "severity",
                            s(if d.severity == umf_core::Severity::Error {
                                "error"
                            } else {
                                "warning"
                            }),
                        ),
                    ])
                })
                .collect()),
        ),
    ])
}
fn action_value(action: &ActionDeclaration) -> Value {
    obj(vec![
        ("module", Value::String(action.module.clone())),
        ("path", Value::String(action.pointer.clone())),
        ("action", action.value.clone()),
        (
            "obligations",
            arr(action
                .obligations
                .iter()
                .map(|o| {
                    obj(vec![
                        ("id", Value::String(o.path.clone())),
                        ("path", Value::String(o.path.clone())),
                        ("kind", Value::String(o.kind.clone())),
                        ("status", Value::String(o.status.clone())),
                    ])
                })
                .collect()),
        ),
    ])
}
fn inspect(
    engine: &CodegenEngine<'_>,
    source: &Value,
    ctx: &mut Context<'_>,
) -> Result<ActionInspection, EngineError> {
    let mut result = inspect_document(source, engine.resources(), None, ctx)?;
    for action in &mut result.actions {
        let path = action
            .pointer
            .to_utf8()
            .map_err(|_| fail("ACTION_STRUCTURE", "", "Action path is not valid UTF-16"))?;
        let mut obligations: Vec<Value> = action
            .obligations
            .iter()
            .map(|item| {
                obj(vec![
                    ("id", Value::String(item.path.clone())),
                    ("path", Value::String(item.path.clone())),
                    ("kind", Value::String(item.kind.clone())),
                    ("status", Value::String(item.status.clone())),
                ])
            })
            .collect();
        umf_core::action_plan_adapter::augment_action_model_obligations(
            source,
            &action.value,
            &path,
            &mut obligations,
            ctx,
        )?;
        action.obligations = obligations
            .into_iter()
            .filter_map(|item| {
                let path = crate::value::string_member(&item, "path")?.clone();
                Some(ActionObligation {
                    path,
                    kind: crate::value::string_member(&item, "kind")?.clone(),
                    status: crate::value::string_member(&item, "status")?.clone(),
                })
            })
            .collect();
    }
    Ok(result)
}
fn valid(result: &ActionInspection) -> bool {
    result.validation.valid
}
fn locate<'a>(
    result: &'a ActionInspection,
    identity: &Value,
) -> Result<&'a ActionDeclaration, EngineError> {
    let members = object_members(identity).ok_or_else(|| {
        fail(
            "ACTION_IDENTITY",
            "/identity",
            "Exact module/action identity required",
        )
    })?;
    if members.len() != 2
        || !members.iter().any(|(k, _)| k == &Utf16::from("module"))
        || !members.iter().any(|(k, _)| k == &Utf16::from("action"))
    {
        return Err(fail(
            "ACTION_IDENTITY",
            "/identity",
            "Exact module/action identity required",
        ));
    }
    let module = text(identity, "module").ok_or_else(|| {
        fail(
            "ACTION_IDENTITY",
            "/identity/module",
            "Module identity required",
        )
    })?;
    let action = text(identity, "action").ok_or_else(|| {
        fail(
            "ACTION_IDENTITY",
            "/identity/action",
            "Action identity required",
        )
    })?;
    let mut found = result
        .actions
        .iter()
        .filter(|item| &item.module == module && &item.id == action);
    let item = found.next().ok_or_else(|| {
        fail(
            "ACTION_IDENTITY",
            "/identity",
            "Action identity does not resolve",
        )
    })?;
    if found.next().is_some() {
        return Err(fail(
            "ACTION_IDENTITY",
            "/identity",
            "Action identity is ambiguous",
        ));
    }
    Ok(item)
}
fn validate_action(
    engine: &CodegenEngine<'_>,
    action: &Value,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let payload = obj(vec![(
        "actions",
        arr(vec![umf_core::copy_json(action, ctx)?]),
    )]);
    if !engine
        .resources()
        .actions_compiled()
        .validate(&payload, ctx)?
        .is_empty()
    {
        return Err(fail(
            "ACTION_STRUCTURE",
            "/action",
            "Action declaration does not match the registered actions schema",
        ));
    }
    Ok(())
}
fn put(value: &mut Value, name: &str, replacement: Value) -> Result<(), EngineError> {
    let Value::Object(fields) = value else {
        return Err(fail("ACTION_STRUCTURE", "", "Expected an object"));
    };
    if let Some((_, old)) = fields.iter_mut().find(|(k, _)| k == &Utf16::from(name)) {
        *old = replacement;
    } else {
        fields.push((Utf16::from(name), replacement));
    }
    Ok(())
}
fn set_action_vocabulary(source: &mut Value) -> Result<(), EngineError> {
    let Value::Object(fields) = source else {
        return Err(fail("ACTION_STRUCTURE", "", "Expected a Document object"));
    };
    if let Some((_, vocabularies)) = fields
        .iter_mut()
        .find(|(k, _)| k == &Utf16::from("vocabularies"))
    {
        let Value::Object(vocabularies) = vocabularies else {
            return Err(fail(
                "ACTION_STRUCTURE",
                "/vocabularies",
                "Vocabularies must be an object",
            ));
        };
        if !vocabularies
            .iter()
            .any(|(k, _)| k == &Utf16::from("umf.actions"))
        {
            vocabularies.push((
                Utf16::from("umf.actions"),
                obj(vec![("version", s("0.1.0"))]),
            ));
        }
    } else {
        fields.push((
            Utf16::from("vocabularies"),
            obj(vec![("umf.actions", obj(vec![("version", s("0.1.0"))]))]),
        ));
    }
    Ok(())
}
fn set_module_action(
    source: &mut Value,
    module_id: &Utf16,
    action_id: &Utf16,
    replacement: Option<Value>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let modules = match source {
        Value::Object(fields) => fields
            .iter_mut()
            .find(|(k, _)| k == &Utf16::from("modules"))
            .map(|(_, v)| v),
        _ => None,
    }
    .ok_or_else(|| fail("ACTION_REFERENCE", "/modules", "Module inventory required"))?;
    let Value::Array(modules) = modules else {
        return Err(fail(
            "ACTION_REFERENCE",
            "/modules",
            "Module inventory must be an array",
        ));
    };
    let module = modules
        .iter_mut()
        .find(|module| text(module, "id") == Some(module_id))
        .ok_or_else(|| fail("ACTION_REFERENCE", "/module", "Module does not resolve"))?;
    let ext = match module {
        Value::Object(fields) => fields
            .iter_mut()
            .find(|(k, _)| k == &Utf16::from("extensions"))
            .map(|(_, v)| v),
        _ => None,
    };
    if ext.is_none() {
        put(module, "extensions", Value::Object(Vec::new()))?;
    }
    let ext = match module {
        Value::Object(fields) => fields
            .iter_mut()
            .find(|(k, _)| k == &Utf16::from("extensions"))
            .map(|(_, v)| v),
        _ => None,
    }
    .unwrap();
    let Value::Object(ext) = ext else {
        return Err(fail(
            "ACTION_STRUCTURE",
            "/module/extensions",
            "Module extensions must be an object",
        ));
    };
    if !ext.iter().any(|(k, _)| k == &Utf16::from("umf.actions")) {
        ext.push((
            Utf16::from("umf.actions"),
            obj(vec![("actions", Value::Array(Vec::new()))]),
        ));
    }
    let payload = ext
        .iter_mut()
        .find(|(k, _)| k == &Utf16::from("umf.actions"))
        .map(|(_, v)| v)
        .unwrap();
    let actions = match payload {
        Value::Object(fields) => fields
            .iter_mut()
            .find(|(k, _)| k == &Utf16::from("actions"))
            .map(|(_, v)| v),
        _ => None,
    }
    .ok_or_else(|| {
        fail(
            "ACTION_STRUCTURE",
            "/module/extensions/umf.actions/actions",
            "Actions array required",
        )
    })?;
    let Value::Array(actions) = actions else {
        return Err(fail(
            "ACTION_STRUCTURE",
            "/module/extensions/umf.actions/actions",
            "Actions must be an array",
        ));
    };
    if let Some(value) = replacement {
        if let Some(index) = actions
            .iter()
            .position(|a| text(a, "id") == Some(action_id))
        {
            actions[index] = value;
        } else {
            actions.push(value);
        }
    }
    let _ = ctx;
    Ok(())
}

impl CodegenEngine<'_> {
    pub fn inspect_actions(
        &self,
        source: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let result = inspect(self, source, ctx)?;
        Ok(obj(vec![
            ("source", umf_core::copy_json(source, ctx)?),
            ("validation", validation_value(&result)),
            (
                "actions",
                arr(result.actions.iter().map(action_value).collect()),
            ),
        ]))
    }
    pub fn declare_action(
        &self,
        source: &Value,
        module: &Utf16,
        action: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let before = inspect(self, source, ctx)?;
        if !valid(&before) {
            return Err(fail("ACTION_STRUCTURE", "", "Source document is invalid"));
        }
        validate_action(self, action, ctx)?;
        let id = text(action, "id")
            .ok_or_else(|| fail("ACTION_STRUCTURE", "/action/id", "Action ID required"))?;
        if before
            .actions
            .iter()
            .any(|a| &a.module == module && &a.id == id)
        {
            return Err(fail(
                "ACTION_IDENTITY",
                "/action/id",
                "Fresh action ID is required",
            ));
        }
        let mut next = umf_core::copy_json(source, ctx)?;
        set_action_vocabulary(&mut next)?;
        set_module_action(
            &mut next,
            module,
            id,
            Some(umf_core::copy_json(action, ctx)?),
            ctx,
        )?;
        let after = inspect(self, &next, ctx)?;
        if !valid(&after) {
            return Err(fail(
                "ACTION_STRUCTURE",
                "",
                "Declared action failed native inspection",
            ));
        }
        Ok(next)
    }
    pub fn edit_action(
        &self,
        source: &Value,
        identity: &Value,
        replacement: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let before = inspect(self, source, ctx)?;
        if !valid(&before) {
            return Err(fail("ACTION_STRUCTURE", "", "Source document is invalid"));
        }
        let old = locate(&before, identity)?;
        if old
            .obligations
            .iter()
            .any(|o| o.status == Utf16::from("unchecked"))
        {
            return Err(fail(
                "ACTION_UNCHECKED",
                "",
                "Relevant uninterpreted meaning blocks safe editing",
            ));
        }
        validate_action(self, replacement, ctx)?;
        let module = text(identity, "module").unwrap();
        let id = text(identity, "action").unwrap();
        if text(replacement, "id") != Some(id) {
            return Err(fail(
                "ACTION_IDENTITY",
                "/replacement/id",
                "Editing cannot replace stable action identity",
            ));
        }
        let mut next = umf_core::copy_json(source, ctx)?;
        set_module_action(
            &mut next,
            module,
            id,
            Some(umf_core::copy_json(replacement, ctx)?),
            ctx,
        )?;
        let after = inspect(self, &next, ctx)?;
        let updated = locate(&after, identity)?;
        if !valid(&after)
            || updated
                .obligations
                .iter()
                .any(|o| o.status == Utf16::from("unchecked"))
        {
            return Err(fail(
                "ACTION_UNCHECKED",
                "",
                "Replacement contains invalid or uninterpreted meaning",
            ));
        }
        Ok(next)
    }
    pub fn assess_action(
        &self,
        source: &Value,
        identity: &Value,
        profile: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let inspection = inspect(self, source, ctx)?;
        if !valid(&inspection) {
            return Err(fail("ACTION_STRUCTURE", "", "Source document is invalid"));
        }
        let target = locate(&inspection, identity)?;
        let allowed = [
            "id",
            "version",
            "actionVersion",
            "coreVersion",
            "claims",
            "source",
            "identity",
        ];
        let fields = object_members(profile).ok_or_else(|| {
            fail(
                "ACTION_PROFILE",
                "/profile",
                "Executor profile must be an object",
            )
        })?;
        if fields
            .iter()
            .any(|(k, _)| !allowed.iter().any(|name| k == &Utf16::from(*name)))
            || fields.len() != allowed.len()
        {
            return Err(fail(
                "ACTION_PROFILE",
                "/profile",
                "Invalid exact executor profile",
            ));
        }
        if text(profile, "id").is_none_or(Utf16::is_empty)
            || text(profile, "version").is_none_or(Utf16::is_empty)
            || text(profile, "actionVersion") != Some(&Utf16::from("0.1.0"))
            || text(profile, "coreVersion") != Some(&Utf16::from("0.10.0"))
        {
            return Err(fail(
                "ACTION_PROFILE",
                "/profile",
                "Invalid exact executor profile",
            ));
        }
        let source_claim = get(profile, "source").ok_or_else(|| {
            fail(
                "ACTION_PROFILE",
                "/profile/source",
                "Profile source is required",
            )
        })?;
        let identity_claim = get(profile, "identity").ok_or_else(|| {
            fail(
                "ACTION_PROFILE",
                "/profile/identity",
                "Profile identity is required",
            )
        })?;
        if crate::canonical::canonical_json_admitted(source_claim, ctx)?
            != crate::canonical::canonical_json_admitted(source, ctx)?
            || crate::canonical::canonical_json_admitted(identity_claim, ctx)?
                != crate::canonical::canonical_json_admitted(identity, ctx)?
        {
            return Err(fail(
                "ACTION_PROFILE",
                "/profile",
                "Profile must retain the exact declaration document and identity",
            ));
        }
        let claims = get(profile, "claims")
            .and_then(array_items)
            .ok_or_else(|| {
                fail(
                    "ACTION_PROFILE",
                    "/profile/claims",
                    "Capability claim array required",
                )
            })?;
        if claims.len() > target.obligations.len() {
            return Err(fail(
                "ACTION_PROFILE",
                "/profile/claims",
                "Claim count exceeds obligation inventory",
            ));
        }
        let mut by_id = BTreeMap::new();
        for claim in claims {
            let claim_fields = object_members(claim).ok_or_else(|| {
                fail(
                    "ACTION_PROFILE",
                    "/profile/claims",
                    "Capability claim must be an object",
                )
            })?;
            if claim_fields.len() != 3
                || ["obligation", "status", "evidence"].iter().any(|name| {
                    !claim_fields
                        .iter()
                        .any(|(key, _)| key == &Utf16::from(*name))
                })
            {
                return Err(fail(
                    "ACTION_PROFILE",
                    "/profile/claims",
                    "Capability claim must have exact members",
                ));
            }
            let evidence = get(claim, "evidence")
                .and_then(array_items)
                .ok_or_else(|| {
                    fail(
                        "ACTION_PROFILE",
                        "/profile/claims/evidence",
                        "Evidence locator array required",
                    )
                })?;
            if evidence
                .iter()
                .any(|entry| !matches!(entry, Value::String(value) if !value.is_empty()))
            {
                return Err(fail(
                    "ACTION_PROFILE",
                    "/profile/claims/evidence",
                    "Evidence locators must be nonempty strings",
                ));
            }
            let id = text(claim, "obligation")
                .ok_or_else(|| {
                    fail(
                        "ACTION_PROFILE",
                        "/profile/claims",
                        "Claim obligation required",
                    )
                })?
                .clone();
            let status = text(claim, "status").ok_or_else(|| {
                fail("ACTION_PROFILE", "/profile/claims", "Claim status required")
            })?;
            if !["supported", "unsupported", "unknown"]
                .iter()
                .any(|x| status == &Utf16::from(*x))
                || by_id.insert(id.clone(), claim).is_some()
                || !target.obligations.iter().any(|o| o.path == id)
            {
                return Err(fail(
                    "ACTION_PROFILE",
                    "/profile/claims",
                    "Malformed, duplicate, or extra obligation claim",
                ));
            }
            let evidence = items(claim, "evidence");
            if status == &Utf16::from("supported") && evidence.is_empty() {
                return Err(fail(
                    "ACTION_PROFILE",
                    "/profile/claims",
                    "Supported claim requires evidence locators",
                ));
            }
        }
        let mut outcomes = Vec::new();
        let mut diagnostics = Vec::new();
        let mut compatible = true;
        for obligation in &target.obligations {
            let claim = by_id.get(&obligation.path);
            let kind = obligation.kind.to_utf8().unwrap_or_default();
            let path = obligation.path.to_utf8().unwrap_or_default();
            let override_ok = ["selector", "handler", "authorization"].contains(&kind.as_str())
                || kind == "condition" && path.ends_with("/rule");
            let claim_status = claim
                .and_then(|c| text(c, "status"))
                .and_then(|s| s.to_utf8().ok());
            let status = if obligation.status == Utf16::from("unchecked") && !override_ok {
                "unknown"
            } else {
                claim_status.as_deref().unwrap_or("unknown")
            };
            if status != "supported" {
                compatible = false;
                diagnostics.push(obj(vec![
                    ("code", s("ACTION_CAPABILITY")),
                    ("path", Value::String(obligation.path.clone())),
                    ("message", s(format!("Obligation is {status}"))),
                    ("severity", s("warning")),
                ]));
            }
            outcomes.push(obj(vec![
                ("obligation", Value::String(obligation.path.clone())),
                ("path", Value::String(obligation.path.clone())),
                ("status", s(status)),
                (
                    "evidence",
                    arr(claim
                        .map(|c| items(c, "evidence").to_vec())
                        .unwrap_or_default()),
                ),
            ]));
        }
        Ok(obj(vec![
            ("source", umf_core::copy_json(source, ctx)?),
            ("profile", umf_core::copy_json(profile, ctx)?),
            ("identity", umf_core::copy_json(identity, ctx)?),
            ("declaredCompatible", Value::Bool(compatible)),
            ("executionVerified", Value::Bool(false)),
            ("outcomes", arr(outcomes)),
            ("diagnostics", arr(diagnostics)),
        ]))
    }
}
