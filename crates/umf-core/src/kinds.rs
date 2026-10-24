// SPDX-License-Identifier: MIT OR Apache-2.0
//! Generic extension classifications. Ecosystem meaning stays in packages.
use crate::{
    copy_json, Capabilities, Context, Diagnostic, Engine, EngineError, Registry, Severity, Utf16,
    Validation, Value,
};
use std::collections::BTreeSet;

pub(crate) fn get<'a>(v: &'a Value, key: &str) -> Option<&'a Value> {
    field(v, &Utf16::from(key))
}
fn field<'a>(v: &'a Value, key: &Utf16) -> Option<&'a Value> {
    members(v).iter().find(|(k, _)| k == key).map(|(_, v)| v)
}
fn members(v: &Value) -> &[(Utf16, Value)] {
    match v {
        Value::Object(m) => m,
        _ => &[],
    }
}
fn text(v: &Value) -> Option<&Utf16> {
    match v {
        Value::String(s) => Some(s),
        _ => None,
    }
}
fn nonempty(v: Option<&Value>) -> bool {
    v.and_then(text).is_some_and(|s| !s.is_empty())
}
pub(crate) fn object(items: Vec<(&str, Value)>) -> Value {
    Value::Object(
        items
            .into_iter()
            .map(|(k, v)| (Utf16::from(k), v))
            .collect(),
    )
}
fn s(v: &str) -> Value {
    Value::string_utf8(v)
}
fn path(base: &Utf16, key: &Utf16, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    ctx.charge_work(
        base.len()
            .saturating_add(key.len().saturating_mul(2))
            .saturating_add(1),
        base.clone(),
    )?;
    let mut p = base.units().to_vec();
    p.push(47);
    for c in key.units() {
        match c {
            126 => p.extend([126, 48]),
            47 => p.extend([126, 49]),
            c => p.push(*c),
        }
    }
    Ok(Utf16::new(p))
}
fn error(message: &str) -> EngineError {
    EngineError::new("PACKAGE_KIND_CATALOG", Utf16::from("/kindCatalog"), message)
}

#[derive(Clone, Debug)]
pub(crate) struct Catalog {
    pub state: &'static str,
    pub definitions: Value,
}
impl Default for Catalog {
    fn default() -> Self {
        Self {
            state: "absent",
            definitions: Value::Null,
        }
    }
}

impl Catalog {
    pub fn admit(
        manifest: &Value,
        policy: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Self, EngineError> {
        let Some(catalog) = get(manifest, "kindCatalog") else {
            return Ok(Self::default());
        };
        let Some(active) = get(policy, "activeCoreVersion") else {
            return Ok(Self {
                state: "unsupported",
                definitions: Value::Null,
            });
        };
        if get(manifest, "coreVersion") != Some(active) {
            return Ok(Self::default());
        }
        if !matches!(catalog, Value::Object(_)) || !nonempty(get(catalog, "profile")) {
            return Err(error("Expected catalog object and nonempty profile"));
        }
        if get(catalog, "profile") != get(policy, "profile") {
            return Ok(Self {
                state: "unsupported",
                definitions: Value::Null,
            });
        }
        let definitions =
            get(catalog, "definitions").ok_or_else(|| error("Missing kind definitions"))?;
        if !matches!(definitions,Value::Object(m) if !m.is_empty()) {
            return Err(error("Expected nonempty kind definitions"));
        }
        let package_scopes = get(manifest, "scopes")
            .and_then(|v| {
                if let Value::Array(a) = v {
                    Some(a)
                } else {
                    None
                }
            })
            .ok_or_else(|| error("Expected package scopes"))?;
        let mut covered = BTreeSet::new();
        let mut unknown = members(catalog)
            .iter()
            .any(|(k, _)| ![Utf16::from("profile"), Utf16::from("definitions")].contains(k));
        for (kind, definition) in members(definitions) {
            ctx.charge_work(
                kind.len().saturating_add(members(definition).len()),
                Utf16::default(),
            )?;
            if kind.is_empty()
                || !matches!(definition, Value::Object(_))
                || !nonempty(get(definition, "title"))
                || !nonempty(get(definition, "description"))
            {
                return Err(error("Expected kind id, title and description"));
            }
            let Some(Value::Array(scopes)) = get(definition, "scopes") else {
                return Err(error("Expected kind scopes"));
            };
            if scopes.is_empty() {
                return Err(error("Kind scopes must not be empty"));
            }
            let mut seen = BTreeSet::new();
            for scope in scopes {
                ctx.charge_work(package_scopes.len(), Utf16::default())?;
                let scope_text = text(scope).ok_or_else(|| error("Expected string scope"))?;
                if !package_scopes.contains(scope) || !seen.insert(scope_text.clone()) {
                    return Err(error("Duplicate or out-of-package kind scope"));
                }
                covered.insert(scope_text.clone());
            }
            unknown |= members(definition).iter().any(|(k, _)| {
                ![
                    Utf16::from("title"),
                    Utf16::from("description"),
                    Utf16::from("scopes"),
                ]
                .contains(k)
            });
        }
        if package_scopes
            .iter()
            .any(|v| text(v).is_none_or(|t| !covered.contains(t)))
        {
            return Err(error("Kind definitions must cover all package scopes"));
        }
        Ok(if unknown {
            Self {
                state: "unsupported",
                definitions: Value::Null,
            }
        } else {
            Self {
                state: "available",
                definitions: copy_json(definitions, ctx)?,
            }
        })
    }
    pub fn definition(
        &self,
        kind: &Utf16,
        ctx: &mut Context<'_>,
    ) -> Result<Option<&Value>, EngineError> {
        ctx.charge_work(
            members(&self.definitions)
                .len()
                .saturating_mul(kind.len().saturating_add(1)),
            Utf16::default(),
        )?;
        Ok(field(&self.definitions, kind))
    }
}

pub(crate) fn occurrence(
    entry: &crate::registry::Registration,
    payload: &Value,
    scope: &Utf16,
    at: &Utf16,
    policy: &Value,
    ctx: &mut Context<'_>,
) -> Result<(bool, Vec<Diagnostic>), EngineError> {
    let catalog = entry.catalog();
    let reason = match catalog.state {
        "absent" => return Ok((false, vec![])),
        "unsupported" => "kindUnsupported",
        _ => match get(payload, "kind")
            .and_then(text)
            .filter(|s| !s.is_empty())
        {
            None => "kindRequired",
            Some(kind) => match catalog.definition(kind, ctx)? {
                None => "kindUnknown",
                Some(definition) => {
                    if let Some(Value::Array(scopes)) = get(definition, "scopes") {
                        ctx.charge_work(scopes.len(), at.clone())?;
                        if scopes.contains(&Value::String(scope.clone())) {
                            return Ok((false, vec![]));
                        }
                    }
                    "kindScope"
                }
            },
        },
    };
    let location = if reason == "kindUnsupported" {
        at.clone()
    } else {
        path(at, &Utf16::from("kind"), ctx)?
    };
    let diagnostic = crate::constraints::model_diag(policy, reason, &location, None, ctx)?;
    Ok((diagnostic.severity == Severity::Error, vec![diagnostic]))
}

pub(crate) fn validation_value(
    value: &Validation,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let diagnostics = value
        .diagnostics
        .iter()
        .map(|d| diagnostic_value(d, ctx))
        .collect::<Result<Vec<_>, _>>()?;
    Ok(object(vec![
        ("valid", Value::Bool(value.valid)),
        ("complete", Value::Bool(value.complete)),
        ("diagnostics", Value::Array(diagnostics)),
    ]))
}
fn diagnostic_value(d: &Diagnostic, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    copy_json(
        &object(vec![
            ("code", Value::String(d.code.clone())),
            ("path", Value::String(d.path.clone())),
            ("message", Value::String(d.message.clone())),
            (
                "severity",
                s(if d.severity == Severity::Error {
                    "error"
                } else {
                    "warning"
                }),
            ),
        ]),
        ctx,
    )
}

impl Registry {
    pub fn list_kinds(&self, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
        let mut registrations = self.entries().iter().collect::<Vec<_>>();
        ctx.charge_work(
            registrations
                .iter()
                .map(|e| {
                    e.id()
                        .len()
                        .saturating_add(e.version().len())
                        .saturating_add(1)
                })
                .sum::<usize>()
                .saturating_mul(registrations.len().checked_ilog2().unwrap_or(0) as usize + 1),
            Utf16::default(),
        )?;
        registrations.sort_by(|a, b| (a.id(), a.version()).cmp(&(b.id(), b.version())));
        let mut definitions = vec![];
        let mut packages = vec![];
        let mut complete = true;
        for entry in registrations {
            let catalog = entry.catalog();
            complete &= catalog.state == "available";
            let mut kinds = members(&catalog.definitions).iter().collect::<Vec<_>>();
            ctx.charge_work(
                kinds
                    .iter()
                    .map(|(k, _)| k.len().saturating_add(1))
                    .sum::<usize>()
                    .saturating_mul(kinds.len().checked_ilog2().unwrap_or(0) as usize + 1),
                Utf16::default(),
            )?;
            kinds.sort_by(|a, b| a.0.cmp(&b.0));
            for (kind, definition) in kinds {
                definitions.push(object(vec![
                    ("reference", reference(entry.id(), entry.version(), kind)),
                    ("definition", copy_json(definition, ctx)?),
                ]));
            }
            let diagnostics = if catalog.state == "unsupported" {
                let diagnostic = crate::constraints::model_diag(
                    self.kind_policy(),
                    "kindUnsupported",
                    &Utf16::from("/kindCatalog"),
                    None,
                    ctx,
                )?;
                vec![diagnostic_value(&diagnostic, ctx)?]
            } else {
                vec![]
            };
            packages.push(object(vec![
                ("extension", Value::String(entry.id().clone())),
                ("version", Value::String(entry.version().clone())),
                ("catalog", s(catalog.state)),
                ("diagnostics", Value::Array(diagnostics)),
            ]));
        }
        copy_json(
            &object(vec![
                ("definitions", Value::Array(definitions)),
                ("packages", Value::Array(packages)),
                ("complete", Value::Bool(complete)),
            ]),
            ctx,
        )
    }
    pub fn get_kind(
        &self,
        reference: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Option<Value>, EngineError> {
        let reference = copy_json(reference, ctx)?;
        if members(&reference).len() != 3
            || !["extension", "version", "kind"]
                .iter()
                .all(|k| nonempty(get(&reference, k)))
        {
            return Err(EngineError::new(
                "EXTENSION_KIND_QUERY",
                Utf16::default(),
                "Expected exact extension/version/kind reference",
            ));
        }
        let id = text(get(&reference, "extension").unwrap()).unwrap();
        let version = text(get(&reference, "version").unwrap()).unwrap();
        let kind = text(get(&reference, "kind").unwrap()).unwrap();
        ctx.charge_work(self.entries().len(), Utf16::default())?;
        if let Some(entry) = self.get(id, version) {
            entry
                .catalog()
                .definition(kind, ctx)?
                .map(|d| copy_json(d, ctx))
                .transpose()
        } else {
            Ok(None)
        }
    }
}
fn reference(id: &Utf16, version: &Utf16, kind: &Utf16) -> Value {
    object(vec![
        ("extension", Value::String(id.clone())),
        ("version", Value::String(version.clone())),
        ("kind", Value::String(kind.clone())),
    ])
}

impl Engine {
    pub fn registry(&self, ctx: &mut Context<'_>) -> Result<Registry, EngineError> {
        Registry::with_kind_policy(self.kind_policy(), ctx)
    }
    pub fn inspect_extension_kinds(
        &self,
        input: &Value,
        registry: &Registry,
        caps: &mut dyn Capabilities,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let source = copy_json(input, ctx)?;
        let validation = self.validate_document(&source, registry, caps, ctx)?;
        let mut entries = vec![];
        let mut coverage = vec![];
        let core_admitted = self.core_structure_diagnostics(&source, ctx)?.is_empty();
        if core_admitted {
            attachment(
                &source,
                &source,
                object(vec![("scope", s("document"))]),
                &Utf16::default(),
                registry,
                &validation,
                &mut entries,
                &mut coverage,
                ctx,
            )?;
            if let Some(Value::Array(modules)) = get(&source, "modules") {
                for (mi, module) in modules.iter().enumerate() {
                    ctx.charge_work(1, Utf16::default())?;
                    let id = get(module, "id").unwrap();
                    let base = Utf16::from(format!("/modules/{mi}"));
                    attachment(
                        &source,
                        module,
                        object(vec![("scope", s("module")), ("module", id.clone())]),
                        &base,
                        registry,
                        &validation,
                        &mut entries,
                        &mut coverage,
                        ctx,
                    )?;
                    if let Some(Value::Array(elements)) = get(module, "elements") {
                        for (ei, element) in elements.iter().enumerate() {
                            ctx.charge_work(1, base.clone())?;
                            let base = Utf16::from(format!("/modules/{mi}/elements/{ei}"));
                            attachment(
                                &source,
                                element,
                                object(vec![
                                    ("scope", s("element")),
                                    ("module", id.clone()),
                                    ("element", get(element, "id").unwrap().clone()),
                                ]),
                                &base,
                                registry,
                                &validation,
                                &mut entries,
                                &mut coverage,
                                ctx,
                            )?;
                        }
                    }
                }
            }
        }
        let complete = core_admitted
            && validation.complete
            && coverage
                .iter()
                .all(|v| get(v, "status") == Some(&s("resolved")));
        let source_validation = validation_value(&validation, ctx)?;
        copy_json(
            &object(vec![
                ("source", source),
                ("sourceValidation", source_validation),
                ("entries", Value::Array(entries)),
                ("coverage", Value::Array(coverage)),
                ("complete", Value::Bool(complete)),
            ]),
            ctx,
        )
    }
}

#[allow(clippy::too_many_arguments)]
fn attachment(
    source: &Value,
    node: &Value,
    owner: Value,
    base: &Utf16,
    registry: &Registry,
    validation: &Validation,
    entries: &mut Vec<Value>,
    coverage: &mut Vec<Value>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let Some(payloads) = get(node, "extensions") else {
        return Ok(());
    };
    let mut payloads = members(payloads).iter().collect::<Vec<_>>();
    ctx.charge_work(
        payloads
            .iter()
            .map(|(k, _)| k.len().saturating_add(1))
            .sum::<usize>()
            .saturating_mul(payloads.len().checked_ilog2().unwrap_or(0) as usize + 1),
        base.clone(),
    )?;
    payloads.sort_by(|a, b| a.0.cmp(&b.0));
    for (id, payload) in payloads {
        ctx.charge_work(
            registry
                .entries()
                .len()
                .saturating_add(validation.diagnostics.len()),
            base.clone(),
        )?;
        let at = path(&path(base, &Utf16::from("extensions"), ctx)?, id, ctx)?;
        let vocabularies = get(source, "vocabularies").map(members).unwrap_or_default();
        ctx.charge_work(
            vocabularies
                .len()
                .saturating_mul(id.len().saturating_add(1)),
            at.clone(),
        )?;
        let version = get(source, "vocabularies")
            .and_then(|v| field(v, id))
            .and_then(|v| get(v, "version"))
            .unwrap_or(&Value::Null);
        let installed = text(version).and_then(|v| registry.get(id, v));
        let mut status = if matches!(version, Value::Null) {
            "invalid"
        } else if installed.is_none() {
            "unavailable"
        } else {
            match installed.unwrap().catalog().state {
                "absent" => "absent-catalog",
                "unsupported" => "unsupported-catalog",
                _ => "invalid",
            }
        };
        if let Some(entry) = installed {
            if entry.catalog().state == "available" {
                if let Some(kind) = get(payload, "kind").and_then(text) {
                    if let Some(definition) = entry.catalog().definition(kind, ctx)? {
                        if let Some(Value::Array(scopes)) = get(definition, "scopes") {
                            if scopes.contains(get(&owner, "scope").unwrap()) {
                                status = "resolved";
                                entries.push(object(vec![
                                    ("reference", reference(id, text(version).unwrap(), kind)),
                                    ("owner", copy_json(&owner, ctx)?),
                                    ("payloadPath", Value::String(at.clone())),
                                    ("definition", copy_json(definition, ctx)?),
                                ]));
                            }
                        }
                    }
                }
            }
        }
        ctx.charge_work(
            validation
                .diagnostics
                .len()
                .saturating_mul(at.len().saturating_add(1)),
            at.clone(),
        )?;
        let diagnostics = validation
            .diagnostics
            .iter()
            .filter(|d| {
                d.path == at
                    || (d.path.units().starts_with(at.units())
                        && d.path.units().get(at.len()) == Some(&47))
            })
            .collect::<Vec<_>>();
        if diagnostics.iter().any(|d| d.severity == Severity::Error) {
            status = "invalid";
        }
        let diagnostics = diagnostics
            .into_iter()
            .map(|d| diagnostic_value(d, ctx))
            .collect::<Result<Vec<_>, _>>()?;
        coverage.push(object(vec![
            ("owner", copy_json(&owner, ctx)?),
            ("extension", Value::String(id.clone())),
            ("version", copy_json(version, ctx)?),
            ("payloadPath", Value::String(at)),
            ("status", s(status)),
            ("diagnostics", Value::Array(diagnostics)),
        ]));
    }
    Ok(())
}
