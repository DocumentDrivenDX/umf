// SPDX-License-Identifier: MIT OR Apache-2.0
//! Construction-owned structural metadata, never a schema admission authority.
//! Locators are owner-relative; no address is retained across an owner move.
use super::*;
use std::collections::BTreeMap;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(super) enum RootLocation {
    Root,
    Catalogue(usize),
}

#[derive(Debug)]
struct RootDescriptor {
    location: RootLocation,
    uri: Utf16,
    has_schema: bool,
    nested_anchors: bool,
    root_anchor: Option<Utf16>,
    nodes: usize,
}

#[derive(Debug)]
pub(super) struct ColdResourceIndex {
    roots: Vec<RootDescriptor>,
    by_uri: BTreeMap<Vec<u16>, usize>,
    // One bounded replacement slot per root. A changed Context never reuses
    // another limits tuple's completed policy. No callbacks while locked.
    policies: Mutex<Vec<Option<(crate::context::Limits, KeywordPolicy)>>>,
}

fn ascii_key(key: &Utf16, name: &str) -> bool {
    key.len() == name.len() && key.units().iter().copied().eq(name.bytes().map(u16::from))
}
pub(super) fn get_ascii<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    let Value::Object(members) = value else {
        return None;
    };
    members
        .iter()
        .find(|(key, _)| ascii_key(key, name))
        .map(|(_, v)| v)
}
pub(super) fn get_ascii_metered<'a>(
    value: &'a Value,
    name: &str,
    ctx: &mut Context<'_>,
    path: &Utf16,
) -> Result<Option<&'a Value>, EngineError> {
    let Value::Object(members) = value else {
        return Ok(None);
    };
    if members.is_empty() {
        return Ok(None);
    }
    ctx.charge_work(path.len(), Utf16::default())?;
    let mut scratch = path.clone();
    for (key, value) in members {
        ctx.charge_work_with_path(key.len().min(name.len()).saturating_add(1), &mut scratch)?;
        if ascii_key(key, name) {
            return Ok(Some(value));
        }
    }
    Ok(None)
}

// Construct only the actual root origin, not a bound over unrelated string
// annotations. The same original dialect URI normalization is retained.
pub(super) fn origin(
    schema: &Value,
    dialect: SchemaDialect,
    ctx: &mut Context<'_>,
) -> Result<(Utf16, String), EngineError> {
    let id = match get_ascii_metered(schema, "$id", ctx, &Utf16::default())? {
        some @ Some(_) => some,
        None => get_ascii_metered(schema, "id", ctx, &Utf16::default())?,
    };
    let Some(Value::String(id)) = id else {
        ctx.charge_work(1, Utf16::default())?;
        return Ok((Utf16::from("#"), String::new()));
    };
    ctx.charge_work(
        id.len().saturating_mul(6).saturating_add(2),
        Utf16::default(),
    )?;
    let text = id.to_utf8().ok().filter(|text| !text.is_empty());
    let Some(text) = text else {
        return Ok((Utf16::from("#"), String::new()));
    };
    let scope = resolve_schema_uri(dialect, "", &text).unwrap_or_else(|| text.clone());
    Ok((Utf16::from(format!("{text}#")), scope))
}

impl ColdResourceIndex {
    pub(super) fn root<'a>(&self, owner: &'a CompiledSchema, ordinal: usize) -> &'a Value {
        match self.roots[ordinal].location {
            RootLocation::Root => &owner.schema,
            RootLocation::Catalogue(i) => &owner.resources.entries[i].1,
        }
    }
    pub(super) fn uri(&self, ordinal: usize) -> &Utf16 {
        &self.roots[ordinal].uri
    }
    pub(super) fn location(&self, ordinal: usize) -> RootLocation {
        self.roots[ordinal].location
    }
    pub(super) fn root_only_anchors(&self, ordinal: usize) -> bool {
        !self.roots[ordinal].nested_anchors
    }

    pub(super) fn lookup(
        &self,
        base: &[u16],
        ctx: &mut Context<'_>,
    ) -> Result<Option<usize>, EngineError> {
        let comparisons = tree_compare_bound(self.by_uri.len());
        ctx.charge_work_u64(
            (base.len() as u64 + 1)
                .saturating_mul(comparisons)
                .saturating_add(1),
            Utf16::default(),
        )?;
        Ok(self.by_uri.get(base).copied())
    }
    pub(super) fn lookup_text(
        &self,
        base: &str,
        ctx: &mut Context<'_>,
    ) -> Result<Option<usize>, EngineError> {
        // UTF-8 length bounds UTF-16 units. Admit both decode and temporary
        // lookup-key storage before constructing it; never trust caller IDs.
        ctx.charge_work(
            base.len().saturating_mul(2).saturating_add(1),
            Utf16::default(),
        )?;
        let units = base.encode_utf16().collect::<Vec<_>>();
        self.lookup(&units, ctx)
    }
    pub(super) fn for_path(
        &self,
        path: &Utf16,
        ctx: &mut Context<'_>,
    ) -> Result<Option<usize>, EngineError> {
        ctx.charge_work(path.len().saturating_add(1), Utf16::default())?;
        let Some(end) = path.units().iter().position(|u| *u == 35) else {
            return Ok(None);
        };
        let base = &path.units()[..end];
        if base.is_empty() {
            return Ok(Some(0));
        }
        self.lookup(base, ctx)
    }
    pub(super) fn matches_frame(
        &self,
        ordinal: usize,
        path: &Utf16,
        ctx: &mut Context<'_>,
    ) -> Result<bool, EngineError> {
        let uri = &self.roots[ordinal].uri;
        ctx.charge_work(uri.len().saturating_add(1), Utf16::default())?;
        Ok(path.units().starts_with(uri.units()) && path.units().get(uri.len()) == Some(&35))
    }
    pub(super) fn enter_anchors(
        &self,
        owner: &CompiledSchema,
        ordinal: usize,
        path: &Utf16,
        evaluated: &mut Evaluated,
        ctx: &mut Context<'_>,
    ) -> Result<bool, EngineError> {
        let desc = &self.roots[ordinal];
        if desc.nested_anchors {
            return Ok(false);
        }
        ctx.charge_work(1, Utf16::default())?;
        let Some(anchor) = &desc.root_anchor else {
            return Ok(true);
        };
        let address = self.root(owner, ordinal) as *const Value as usize;
        for (_, _, prior) in &evaluated.dynamic_scope {
            ctx.charge_work(1, Utf16::default())?;
            if *prior == address {
                return Ok(true);
            }
        }
        // Only materialize the URI/root diagnostic prefix for a new scope
        // entry. The live address is branch-local; the index stores locators.
        ctx.charge_work(path.len(), Utf16::default())?;
        let end = path
            .units()
            .iter()
            .position(|u| *u == 35)
            .map_or(0, |i| i + 1);
        let units = if end == 0 {
            &[35u16][..]
        } else {
            &path.units()[..end]
        };
        ctx.charge_work(
            anchor.len().saturating_add(units.len()).saturating_add(2),
            Utf16::default(),
        )?;
        evaluated.dynamic_scope.push(
            (anchor.units().to_vec(), Utf16::new(units.to_vec()), address),
            ctx,
        )?;
        Ok(true)
    }
    pub(super) fn policy(
        &self,
        owner: &CompiledSchema,
        ordinal: usize,
        inherited: KeywordPolicy,
        ctx: &mut Context<'_>,
    ) -> Result<KeywordPolicy, EngineError> {
        ctx.charge_work(1, Utf16::default())?;
        if !self.roots[ordinal].has_schema {
            return Ok(inherited);
        }
        let prior = self.policies.lock().unwrap_or_else(|e| e.into_inner())[ordinal];
        if let Some((limits, policy)) = prior {
            if limits == ctx.limits() {
                return Ok(policy);
            }
        }
        let policy = owner.explicit_keyword_policy(self.root(owner, ordinal), inherited, ctx)?;
        ctx.charge_work(1, Utf16::default())?;
        self.policies.lock().unwrap_or_else(|e| e.into_inner())[ordinal] =
            Some((ctx.limits(), policy));
        Ok(policy)
    }

    pub(super) fn build(
        owner: &CompiledSchema,
        ctx: &mut Context<'_>,
    ) -> Result<Option<Arc<Self>>, EngineError> {
        Self::build_with_materialization(owner, ctx, || {})
    }
    // Owner-private seam: callback marks actual allocation entry, not success.
    fn build_with_materialization(
        owner: &CompiledSchema,
        ctx: &mut Context<'_>,
        materializing: impl FnOnce(),
    ) -> Result<Option<Arc<Self>>, EngineError> {
        ctx.with_constructor_site("ctor.index-build", |ctx| {
            let count = owner.resources.entries.len().saturating_add(1);
            if count > ctx.limits().max_values {
                return Ok(None);
            }
            ctx.charge_work(count.saturating_mul(4).saturating_add(1), Utf16::default())?;
            materializing();
            let mut roots = Vec::with_capacity(count);
            let mut by_uri = BTreeMap::new();
            for ordinal in 0..count {
                let (location, value, retrieval) = if ordinal == 0 {
                    (RootLocation::Root, &owner.schema, None)
                } else {
                    let (uri, value) = &owner.resources.entries[ordinal - 1];
                    (RootLocation::Catalogue(ordinal - 1), value, Some(uri))
                };
                let id = match get_ascii_metered(value, "$id", ctx, &Utf16::default())? {
                    some @ Some(_) => some,
                    None => get_ascii_metered(value, "id", ctx, &Utf16::default())?,
                };
                let uri = match id {
                    None if ordinal == 0 => Utf16::default(),
                    Some(Value::String(id)) => {
                        ctx.charge_work(
                            id.len().saturating_mul(4).saturating_add(1),
                            Utf16::default(),
                        )?;
                        let Ok(text) = id.to_utf8() else {
                            return Ok(None);
                        };
                        if !text.contains(':')
                            || resolve_schema_uri(owner.dialect, "", &text).as_deref()
                                != Some(text.as_str())
                        {
                            return Ok(None);
                        }
                        id.clone()
                    }
                    _ => return Ok(None),
                };
                if retrieval.is_some_and(|r| r != &uri) {
                    return Ok(None);
                }
                let mut nodes = 0usize;
                let mut nested_anchors = false;
                fn visit(
                    value: &Value,
                    is_root: bool,
                    depth: usize,
                    _dialect: SchemaDialect,
                    ctx: &mut Context<'_>,
                    nodes: &mut usize,
                    nested_anchors: &mut bool,
                ) -> Result<bool, EngineError> {
                    ctx.charge_work(1, Utf16::default())?;
                    *nodes = nodes.saturating_add(1);
                    if depth > ctx.limits().max_depth {
                        return Ok(false);
                    }
                    // Stronger-than-required raw-tree absence is conservative:
                    // even an opaque annotation containing a string ID selects
                    // the qualified route. No unknown content is interpreted,
                    // dropped, validated early or used as admission authority.
                    match value {
                        Value::Object(members) => {
                            ctx.charge_work(members.len(), Utf16::default())?;
                            for (key, child) in members {
                                ctx.charge_work(
                                    key.len().min(14).saturating_mul(3).saturating_add(1),
                                    Utf16::default(),
                                )?;
                                if !is_root && matches!(child, Value::String(_)) {
                                    if ascii_key(key, "$id") || ascii_key(key, "id") {
                                        return Ok(false);
                                    }
                                    if ascii_key(key, "$dynamicAnchor") {
                                        *nested_anchors = true;
                                    }
                                }
                                if !visit(
                                    child,
                                    false,
                                    depth + 1,
                                    _dialect,
                                    ctx,
                                    nodes,
                                    nested_anchors,
                                )? {
                                    return Ok(false);
                                }
                            }
                        }
                        Value::Array(items) => {
                            ctx.charge_work(items.len(), Utf16::default())?;
                            for child in items {
                                if !visit(
                                    child,
                                    false,
                                    depth + 1,
                                    _dialect,
                                    ctx,
                                    nodes,
                                    nested_anchors,
                                )? {
                                    return Ok(false);
                                }
                            }
                        }
                        _ => {}
                    }
                    Ok(true)
                }
                if !visit(
                    value,
                    true,
                    0,
                    owner.dialect,
                    ctx,
                    &mut nodes,
                    &mut nested_anchors,
                )? {
                    return Ok(None);
                }
                ctx.charge_work_u64(
                    (uri.len() as u64 + 1)
                        .saturating_mul(tree_compare_bound(by_uri.len()))
                        .saturating_add(uri.len() as u64 + 2),
                    Utf16::default(),
                )?;
                // Root first, then ordered catalogue. Nested-ID absence and exact
                // retrieval/authored identity make original lookup orders agree.
                by_uri.entry(uri.units().to_vec()).or_insert(ordinal);
                let has_schema =
                    get_ascii_metered(value, "$schema", ctx, &Utf16::default())?.is_some();
                let root_anchor = if let Some(Value::String(anchor)) =
                    get_ascii_metered(value, "$dynamicAnchor", ctx, &Utf16::default())?
                {
                    ctx.charge_work(anchor.len().saturating_add(1), Utf16::default())?;
                    Some(anchor.clone())
                } else {
                    None
                };
                roots.push(RootDescriptor {
                    location,
                    uri,
                    has_schema,
                    nested_anchors,
                    root_anchor,
                    nodes,
                });
            }
            ctx.charge_work(count.saturating_add(2), Utf16::default())?;
            Ok(Some(Arc::new(Self {
                roots,
                by_uri,
                policies: Mutex::new(vec![None; count]),
            })))
        })
    }
}

#[cfg(test)]
mod owner_tests {
    use super::*;
    use std::cell::Cell;
    #[test]
    fn actual_index_precharge_denial_precedes_materialization_and_publication() {
        let schema = Value::Bool(true);
        let mut old_ctx = Context::catalog();
        let owner =
            CompiledSchema::compile(&schema, &SchemaResources::default(), &mut old_ctx).unwrap();
        let phase = Cell::new("outer");
        let root = Cell::new("unassigned");
        let entered = Cell::new(false);
        let denied = Cell::new(0);
        let mut control = |amount| {
            if phase.get() == "ctor.index-build" && amount > 0 {
                denied.set(denied.get() + 1);
                Err(EngineError::new(
                    "INDEX_DENIED",
                    Utf16::from("/actual/index"),
                    "first index denial",
                ))
            } else {
                Ok(())
            }
        };
        let mut ctx = Context::catalog()
            .with_host_control(&mut control)
            .with_work_phase_observer(&phase)
            .with_constructor_root_observer(&root);
        let result = ctx.with_codegen_construction(|ctx| {
            ColdResourceIndex::build_with_materialization(&owner, ctx, || entered.set(true))
        });
        let error = result.unwrap_err();
        assert_eq!(error.code, "INDEX_DENIED");
        assert_eq!(error.path, Utf16::from("/actual/index"));
        assert_eq!(denied.get(), 1);
        assert!(!entered.get());
        assert!(ctx.schema_construction.is_none());
        assert!(owner.cold_resource_index.is_none());
        assert_eq!(phase.get(), "outer");
    }
}

#[cfg(test)]
mod semantic_tests {
    use super::*;
    fn json(text: &str) -> Value {
        crate::serialization::read_json_value(
            &text.encode_utf16().collect::<Vec<_>>(),
            crate::serialization::Format::Json,
            &mut Context::catalog(),
        )
        .unwrap()
    }
    #[test]
    fn indexed_first_admission_preserves_ordered_errors_and_dynamic_annotations() {
        let schema = json(
            r##"{"$id":"https://index.test/root","$ref":"https://index.test/child","unevaluatedProperties":false}"##,
        );
        let resources = SchemaResources {
            entries: vec![(
                Utf16::from("https://index.test/child"),
                json(
                    r##"{"$id":"https://index.test/child","$dynamicAnchor":"node","anyOf":[{"properties":{"x":{"type":"integer"}},"required":["x"]},{"properties":{"y":{"type":"boolean"}},"required":["y"]}]}"##,
                ),
            )],
        };
        let legacy = CompiledSchema::compile(&schema, &resources, &mut Context::catalog()).unwrap();
        let mut ctx = Context::catalog();
        ctx.with_codegen_construction(|ctx| {
            let indexed = CompiledSchema::compile(&schema, &resources, ctx)?;
            assert!(indexed.cold_resource_index.is_some());
            for sample in [
                r#"{"x":1}"#,
                r#"{"y":true}"#,
                r#"{"x":"bad","z":3}"#,
                r#"{}"#,
            ] {
                let value = json(sample);
                assert_eq!(
                    indexed.validate(&value, ctx)?,
                    legacy.validate(&value, &mut Context::catalog())?
                );
            }
            Ok::<_, EngineError>(())
        })
        .unwrap();
    }
    #[test]
    fn aliases_and_opaque_nested_ids_select_full_interpreter_without_content_loss() {
        for schema in [
            json(
                r#"{"$id":"https://index.test/root","default":{"$id":"opaque"},"type":"integer"}"#,
            ),
            json(r#"{"$ref":"https://index.test/retrieval"}"#),
        ] {
            let resources = SchemaResources {
                entries: vec![(
                    Utf16::from("https://index.test/retrieval"),
                    json(r#"{"$id":"https://index.test/authored","type":"integer"}"#),
                )],
            };
            let mut ctx = Context::catalog();
            ctx.with_codegen_construction(|ctx| {
                let owner = CompiledSchema::compile(&schema, &resources, ctx)?;
                assert!(owner.cold_resource_index.is_none());
                assert_eq!(owner.schema_value(), &schema);
                let old = CompiledSchema::compile(&schema, &resources, &mut Context::catalog())?;
                assert_eq!(
                    owner.validate(&Value::Null, ctx)?,
                    old.validate(&Value::Null, &mut Context::catalog())?
                );
                Ok::<_, EngineError>(())
            })
            .unwrap();
        }
    }
    #[test]
    fn active_scope_restores_shared_ancestry_policy_and_resource_on_denial_and_unwind() {
        let mut ctx = Context::catalog();
        let mut state = Evaluated::default();
        state.dynamic_scope = DynamicScope::shared(&mut ctx).unwrap();
        state.resolved_resource = Some(3);
        let policy = state.keyword_policy;
        {
            let mut guard = EvaluationScope::enter(&mut state, &mut ctx).unwrap();
            guard.state.resolved_resource = Some(4);
            guard
                .state
                .dynamic_scope
                .push(
                    (vec![110], Utf16::from("https://index.test/#"), 7),
                    &mut ctx,
                )
                .unwrap();
        }
        assert!(state.dynamic_scope.is_empty());
        assert_eq!(state.resolved_resource, Some(3));
        assert_eq!(state.keyword_policy, policy);
        let mut stop = |_| {
            Err(EngineError::new(
                "DENIED",
                Utf16::from("/first"),
                "first denial",
            ))
        };
        let mut denied = Context::catalog().with_host_control(&mut stop);
        assert!(EvaluationScope::enter(&mut state, &mut denied).is_err());
        assert!(state.dynamic_scope.is_empty());
        assert_eq!(state.resolved_resource, Some(3));
        let caught = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let mut guard = EvaluationScope::enter(&mut state, &mut ctx).unwrap();
            guard.state.resolved_resource = Some(8);
            panic!("scope unwind");
        }));
        assert!(caught.is_err());
        assert_eq!(state.resolved_resource, Some(3));
        assert!(state.dynamic_scope.is_empty());
    }
}
