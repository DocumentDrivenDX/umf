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
    // Keep retrieval, authored and dialect-resolved identity distinct. None
    // of these strings is rewritten to manufacture an alias match.
    retrieval: Option<Utf16>,
    uri: Utf16,
    resolved: Option<Utf16>,
    frame_safe: bool,
    has_schema: bool,
    nested_anchors: bool,
    root_anchor: Option<Utf16>,
    nodes: usize,
}

#[derive(Debug)]
pub(super) struct ColdResourceIndex {
    roots: Vec<RootDescriptor>,
    reference: BTreeMap<Vec<u16>, usize>,
    policy_roots: BTreeMap<Vec<u16>, usize>,
    dynamic_roots: BTreeMap<Vec<u16>, usize>,
    common: BTreeMap<Vec<u16>, usize>,
    // One bounded replacement slot per root. A changed Context never reuses
    // another limits tuple's completed policy. No callbacks while locked.
    policies: Mutex<Vec<Option<(crate::context::Limits, KeywordPolicy)>>>,
}

fn ascii_key(key: &Utf16, name: &str) -> bool {
    key.len() == name.len() && key.units().iter().copied().eq(name.bytes().map(u16::from))
}
pub(super) fn ascii_key_for_owner(key:&Utf16,name:&str)->bool { ascii_key(key,name) }
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
    ctx.charge_work(path.clone_work(), Utf16::default())?;
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
            RootLocation::Catalogue(i) => owner.catalogue_entries().get(i).expect("admitted catalogue row").1,
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
        self.lookup_map(&self.reference, base, ctx)
    }
    fn lookup_map(
        &self,
        map: &BTreeMap<Vec<u16>, usize>,
        base: &[u16],
        ctx: &mut Context<'_>,
    ) -> Result<Option<usize>, EngineError> {
        let comparisons = tree_compare_bound(map.len());
        ctx.charge_work_u64(
            (base.len() as u64 + 1)
                .saturating_mul(comparisons)
                .saturating_add(1),
            Utf16::default(),
        )?;
        Ok(map.get(base).copied())
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
        ctx.charge_work(
            path.len().saturating_mul(2).saturating_add(1),
            Utf16::default(),
        )?;
        if path.units().iter().any(|u| (0xd800..=0xdfff).contains(u)) {
            return Ok(None);
        }
        let Some(end) = path.units().iter().position(|u| *u == 35) else {
            return Ok(None);
        };
        let base = &path.units()[..end];
        if base.is_empty() {
            return Ok(Some(0));
        }
        self.lookup_map(&self.common, base, ctx)
    }
    fn path_in(
        &self,
        map: &BTreeMap<Vec<u16>, usize>,
        path: &Utf16,
        ctx: &mut Context<'_>,
    ) -> Result<Option<usize>, EngineError> {
        ctx.charge_work(
            path.len().saturating_mul(2).saturating_add(1),
            Utf16::default(),
        )?;
        if path.units().iter().any(|u| (0xd800..=0xdfff).contains(u)) {
            return Ok(None);
        }
        let Some(end) = path.units().iter().position(|u| *u == 35) else {
            return Ok(None);
        };
        if end == 0 {
            return Ok(Some(0));
        }
        self.lookup_map(map, &path.units()[..end], ctx)
    }
    pub(super) fn policy_path(
        &self,
        path: &Utf16,
        ctx: &mut Context<'_>,
    ) -> Result<Option<usize>, EngineError> {
        self.path_in(&self.policy_roots, path, ctx)
    }
    pub(super) fn dynamic_path(
        &self,
        path: &Utf16,
        ctx: &mut Context<'_>,
    ) -> Result<Option<usize>, EngineError> {
        self.path_in(&self.dynamic_roots, path, ctx)
    }
    pub(super) fn matches_frame(
        &self,
        ordinal: usize,
        path: &Utf16,
        ctx: &mut Context<'_>,
    ) -> Result<bool, EngineError> {
        ctx.charge_work(path.len().saturating_add(1), Utf16::default())?;
        if path.units().iter().any(|u| (0xd800..=0xdfff).contains(u)) {
            return Ok(false);
        }
        if !self.roots[ordinal].frame_safe {
            return Ok(false);
        }
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
            let count = owner.catalogue_entries().len().saturating_add(1);
            if count > ctx.limits().max_values {
                return Ok(None);
            }
            ctx.charge_work(count.saturating_mul(7).saturating_add(1), Utf16::default())?;
            materializing();
            let mut roots = Vec::with_capacity(count);

            for ordinal in 0..count {
                let (location, value, retrieval) = if ordinal == 0 {
                    (RootLocation::Root, &*owner.schema, None)
                } else {
                    let (uri, value) = owner.catalogue_entries().get(ordinal - 1).expect("admitted catalogue row");
                    (RootLocation::Catalogue(ordinal - 1), value, Some(uri))
                };
                let id = match get_ascii_metered(value, "$id", ctx, &Utf16::default())? {
                    some @ Some(_) => some,
                    None => get_ascii_metered(value, "id", ctx, &Utf16::default())?,
                };
                let (uri, resolved) = match id {
                    None => (Utf16::default(), None),
                    Some(Value::String(id)) => {
                        ctx.charge_work(
                            id.len().saturating_mul(6).saturating_add(2),
                            Utf16::default(),
                        )?;
                        let Ok(text) = id.to_utf8() else {
                            return Ok(None);
                        };
                        if text.is_empty() {
                            (Utf16::default(), None)
                        } else {
                            // Relative/fragment-only resource IDs still select
                            // the qualified resolver. Absolute IDs, including
                            // their fragments, keep BOTH exact and resolved form.
                            if url::Url::parse(&text).is_err() {
                                return Ok(None);
                            }
                            let resolved = resolve_schema_uri(owner.dialect, "", &text)
                                .unwrap_or_else(|| text.clone());
                            (id.clone(), Some(Utf16::from(resolved)))
                        }
                    }
                    _ => return Ok(None),
                };
                let retrieval = if let Some(retrieval) = retrieval {
                    ctx.charge_work(
                        retrieval.len().saturating_mul(4).saturating_add(1),
                        Utf16::default(),
                    )?;
                    if retrieval.to_utf8().is_err() {
                        return Ok(None);
                    }
                    Some(retrieval.clone())
                } else {
                    None
                };
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
                if let Some(locations)=&owner.owner_locations {
                    ctx.charge_work(3,Utf16::default())?;
                    let facts=&locations.facts[ordinal];
                    nodes=facts.nodes;nested_anchors=facts.nested_anchors;
                    if facts.nested_ids {return Ok(None);}
                } else {
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
                }
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
                    retrieval,
                    uri,
                    resolved,
                    frame_safe: false,
                    has_schema,
                    nested_anchors,
                    root_anchor,
                    nodes,
                });
            }
            // These are the original independent selector orders, NOT one
            // normalized URI map. Nested-ID absence establishes that embedded
            // discovery can only select the resolved root of each descriptor.
            fn insert(
                map: &mut BTreeMap<Vec<u16>, usize>,
                key: Option<&Utf16>,
                ordinal: usize,
                ctx: &mut Context<'_>,
            ) -> Result<(), EngineError> {
                let Some(key) = key else {
                    return Ok(());
                };
                ctx.charge_work_u64(
                    (key.len() as u64 + 1)
                        .saturating_mul(tree_compare_bound(map.len()))
                        .saturating_add(key.len() as u64 + 2),
                    Utf16::default(),
                )?;
                map.entry(key.units().to_vec()).or_insert(ordinal);
                Ok(())
            }
            fn authored(root: &RootDescriptor) -> Option<&Utf16> {
                (!root.uri.is_empty()).then_some(&root.uri)
            }
            let mut reference = BTreeMap::new();
            let mut policy_roots = BTreeMap::new();
            let mut dynamic_roots = BTreeMap::new();
            insert(&mut reference, authored(&roots[0]), 0, ctx)?;
            insert(&mut policy_roots, authored(&roots[0]), 0, ctx)?;
            insert(&mut dynamic_roots, authored(&roots[0]), 0, ctx)?;
            for (i, root) in roots.iter().enumerate().skip(1) {
                insert(&mut reference, root.retrieval.as_ref(), i, ctx)?;
                insert(&mut policy_roots, root.retrieval.as_ref(), i, ctx)?;
                insert(&mut policy_roots, authored(root), i, ctx)?;
            }
            insert(&mut reference, roots[0].resolved.as_ref(), 0, ctx)?;
            insert(&mut policy_roots, roots[0].resolved.as_ref(), 0, ctx)?;
            insert(&mut dynamic_roots, roots[0].resolved.as_ref(), 0, ctx)?;
            for (i, root) in roots.iter().enumerate().skip(1) {
                insert(&mut reference, root.resolved.as_ref(), i, ctx)?;
                insert(&mut policy_roots, root.resolved.as_ref(), i, ctx)?;
                insert(&mut dynamic_roots, root.retrieval.as_ref(), i, ctx)?;
                insert(&mut dynamic_roots, root.resolved.as_ref(), i, ctx)?;
            }
            let mut common = BTreeMap::new();
            for (key, ordinal) in &policy_roots {
                ctx.charge_work_u64(
                    (key.len() as u64 + 1)
                        .saturating_mul(
                            tree_compare_bound(reference.len())
                                .saturating_add(tree_compare_bound(dynamic_roots.len())),
                        )
                        .saturating_add(2),
                    Utf16::default(),
                )?;
                if reference.get(key) == Some(ordinal) && dynamic_roots.get(key) == Some(ordinal) {
                    ctx.charge_work_u64(
                        (key.len() as u64 + 1)
                            .saturating_mul(tree_compare_bound(common.len()))
                            .saturating_add(key.len() as u64 + 2),
                        Utf16::default(),
                    )?;
                    common.insert(key.clone(), *ordinal);
                }
            }
            for (i, root) in roots.iter_mut().enumerate() {
                ctx.charge_work_u64(
                    (root.uri.len() as u64 + 1)
                        .saturating_mul(tree_compare_bound(common.len()).saturating_add(1))
                        .saturating_add(1),
                    Utf16::default(),
                )?;
                root.frame_safe =
                    !root.uri.units().contains(&35) && common.get(root.uri.units()) == Some(&i);
            }
            ctx.charge_work(count.saturating_add(2), Utf16::default())?;
            Ok(Some(Arc::new(Self {
                roots,
                reference,
                policy_roots,
                dynamic_roots,
                common,
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
    fn relative_and_opaque_nested_ids_select_full_interpreter_without_content_loss() {
        for schema in [
            json(
                r#"{"$id":"https://index.test/root","default":{"$id":"opaque"},"type":"integer"}"#,
            ),
            json(r#"{"$id":"relative","type":"integer"}"#),
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

#[cfg(test)]
mod alias_correction_tests {
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
    fn complete_pinned_twenty_catalogue_publishes_index_and_first_evaluation_uses_it() {
        let pinned = json(include_str!("schema_metas.json"));
        let Some(Value::Array(items)) = get_ascii(&pinned, "resources") else {
            panic!("actual pinned resources missing");
        };
        assert_eq!(items.len(), 20);
        let mut ctx = Context::catalog();
        ctx.with_codegen_construction(|ctx| {
            // Use the actual first metaschema factory/materialization and shared
            // interpreter. No synthetic replacement of its catalogue or IDs.
            validate_schema_against_metaschema(
                &json(r#"{"type":"integer"}"#),
                SchemaDialect::Draft2020_12,
                RegexProfile::Ecma262Unicode,
                ctx,
            )?;
            let meta = ctx
                .schema_construction
                .as_ref()
                .unwrap()
                .borrow()
                .meta_validators
                .iter()
                .find(|(_, dialect, _)| *dialect == SchemaDialect::Draft2020_12)
                .unwrap()
                .2
                .clone();
            assert_eq!(meta.resources.entries.len(), 20);
            let index = meta
                .cold_resource_index
                .as_ref()
                .expect("complete authentic catalogue must publish its index");
            assert_eq!(index.roots.len(), 21);
            for (i, item) in items.iter().enumerate() {
                let Some(Value::String(id)) = get_ascii(item, "id") else {
                    panic!("pinned retrieval ID missing");
                };
                let source = get_ascii(item, "schema").unwrap();
                assert_eq!(&meta.resources.entries[i].0, id);
                assert_eq!(&meta.resources.entries[i].1, source);
                assert_eq!(index.roots[i + 1].retrieval.as_ref(), Some(id));
                let authored = get_ascii(source, "$id").or_else(|| get_ascii(source, "id"));
                if let Some(Value::String(authored)) = authored {
                    assert_eq!(&index.roots[i + 1].uri, authored);
                }
            }
            for i in [9usize, 10, 18, 19] {
                let descriptor = &index.roots[i + 1];
                let retrieval = descriptor.retrieval.as_ref().unwrap();
                assert_ne!(retrieval, &descriptor.uri);
                let mut exact = retrieval.units().to_vec();
                exact.push(35);
                assert_eq!(
                    descriptor.uri.units(),
                    exact.as_slice(),
                    "trailing fragment must remain authored, not relabeled"
                );
                assert_eq!(index.lookup(retrieval.units(), ctx)?, Some(i + 1));
            }
            // Only actual indexed interpreter policy lookup can publish these
            // slots. Mere index construction leaves every slot empty.
            assert!(
                index.policies.lock().unwrap().iter().any(Option::is_some),
                "first evaluation never used the index"
            );
            let legacy = meta.as_ref().clone();
            assert!(legacy.cold_resource_index.is_none());
            for sample in [
                r#"{"type":7}"#,
                r#"{"type":"integer"}"#,
                r#"{"properties":{"a":{"type":"boolean"}}}"#,
            ] {
                let sample = json(sample);
                assert_eq!(
                    meta.validate_instance(&sample, ctx)?,
                    legacy.validate_instance(&sample, &mut Context::catalog())?
                );
            }
            Ok::<_, EngineError>(())
        })
        .unwrap();
    }
    fn conflicting_aliases() -> (Value, SchemaResources) {
        (
            json(r##"{"$id":"https://index.test/root","$ref":"https://index.test/target"}"##),
            SchemaResources {
                entries: vec![
                    (
                        Utf16::from("https://index.test/alias"),
                        json(
                            r##"{"$id":"https://index.test/target","$dynamicAnchor":"first","type":"integer"}"##,
                        ),
                    ),
                    (
                        Utf16::from("https://index.test/target"),
                        json(
                            r##"{"$id":"https://index.test/other","$dynamicAnchor":"second","type":"boolean"}"##,
                        ),
                    ),
                ],
            },
        )
    }
    #[test]
    fn lookup_specific_alias_precedence_matches_qualified_interpreter_and_never_uses_ambiguous_frame(
    ) {
        let (schema, resources) = conflicting_aliases();
        let legacy = CompiledSchema::compile(&schema, &resources, &mut Context::catalog()).unwrap();
        let mut ctx = Context::catalog();
        ctx.with_codegen_construction(|ctx| {
            let owner = CompiledSchema::compile(&schema, &resources, ctx)?;
            let index = owner.cold_resource_index.as_ref().unwrap();
            let path = Utf16::from("https://index.test/target#");
            assert_eq!(
                index.lookup_text("https://index.test/target", ctx)?,
                Some(2)
            );
            assert_eq!(index.policy_path(&path, ctx)?, Some(1));
            assert_eq!(index.dynamic_path(&path, ctx)?, Some(1));
            assert_eq!(index.for_path(&path, ctx)?, None);
            assert!(!index.matches_frame(1, &path, ctx)?);
            let actual = owner.dynamic_resource_for_path(&path, ctx)?.unwrap();
            let expected = legacy
                .dynamic_resource_for_path(&path, &mut Context::catalog())?
                .unwrap();
            assert_eq!(actual.0, expected.0);
            assert_eq!(actual.1, expected.1);
            for suffix in [vec![0xd800], vec![0xd83d, 0xde00]] {
                let mut units = path.units().to_vec();
                units.push(47);
                units.extend(suffix);
                let text = Utf16::new(units);
                assert_eq!(index.for_path(&text, ctx)?, None);
                assert_eq!(index.policy_path(&text, ctx)?, None);
                assert_eq!(index.dynamic_path(&text, ctx)?, None);
                let actual = owner.dynamic_resource_for_path(&text, ctx)?.unwrap();
                let expected = legacy
                    .dynamic_resource_for_path(&text, &mut Context::catalog())?
                    .unwrap();
                assert_eq!(actual.0, expected.0);
                assert_eq!(actual.1, expected.1);
            }
            for (value, valid) in [(Value::Bool(true), true), (Value::Number(3.0), false)] {
                let result = owner.validate(&value, ctx)?;
                assert_eq!(result, legacy.validate(&value, &mut Context::catalog())?);
                assert_eq!(result.is_empty(), valid);
            }
            Ok::<_, EngineError>(())
        })
        .unwrap();
    }
    #[test]
    fn exact_fragment_ids_are_distinct_and_named_pointer_or_missing_refs_preserve_outcomes() {
        let resources = SchemaResources {
            entries: vec![
                (
                    Utf16::from("https://index.test/retrieval"),
                    json(
                        r##"{"$id":"https://index.test/authored#","$anchor":"named","$defs":{"n":{"type":"integer"}},"type":"integer"}"##,
                    ),
                ),
                (
                    Utf16::from("https://index.test/fragment-key#name"),
                    json(r##"{"$id":"https://index.test/with-fragment#name","type":"boolean"}"##),
                ),
            ],
        };
        for reference in [
            "https://index.test/retrieval#named",
            "https://index.test/retrieval#/$defs/n",
            "https://index.test/retrieval#missing",
        ] {
            let schema = Value::Object(vec![(Utf16::from("$ref"), Value::string_utf8(reference))]);
            let mut legacy_ctx = Context::catalog();
            let legacy = CompiledSchema::compile(&schema, &resources, &mut legacy_ctx);
            assert_eq!(legacy.is_ok(),!reference.ends_with("#missing"),"named/pointer controls must actually enter evaluation; only missing anchor refuses");
            let mut ctx = Context::catalog();
            ctx.with_codegen_construction(|ctx| {
                let actual = CompiledSchema::compile(&schema, &resources, ctx);
                match (actual, legacy) {
                    (Ok(owner), Ok(legacy)) => {
                        let index = owner.cold_resource_index.as_ref().unwrap();
                        assert_eq!(
                            index.roots[1].retrieval.as_ref().unwrap(),
                            &Utf16::from("https://index.test/retrieval")
                        );
                        assert_eq!(
                            index.roots[1].uri,
                            Utf16::from("https://index.test/authored#")
                        );
                        assert_eq!(
                            index.lookup_text("https://index.test/authored#", ctx)?,
                            Some(1)
                        );
                        assert_eq!(index.lookup_text("https://index.test/authored", ctx)?, None);
                        assert_eq!(
                            index.lookup_text("https://index.test/fragment-key#name", ctx)?,
                            Some(2)
                        );
                        assert!(!index.matches_frame(
                            2,
                            &Utf16::from("https://index.test/with-fragment#name#"),
                            ctx
                        )?);
                        for value in [Value::Number(3.0), Value::Null] {
                            assert_eq!(
                                owner.validate(&value, ctx)?,
                                legacy.validate(&value, &mut Context::catalog())?
                            );
                        }
                    }
                    (Err(actual), Err(expected)) => assert_eq!(actual, expected),
                    _ => panic!("fragment compile/refusal parity changed"),
                }
                Ok::<_, EngineError>(())
            })
            .unwrap();
        }
    }
    #[test]
    fn aliased_owner_moves_resolve_live_locators_and_clone_retains_qualified_fallback() {
        let (schema, resources) = conflicting_aliases();
        let mut ctx = Context::catalog();
        let owner = ctx
            .with_codegen_construction(|ctx| CompiledSchema::compile(&schema, &resources, ctx))
            .unwrap();
        let before = &owner.schema as *const Value as usize;
        let moved = Box::new(owner);
        assert_ne!(before, &moved.schema as *const Value as usize);
        let index = moved.cold_resource_index.as_ref().unwrap();
        assert!(std::ptr::eq(index.root(&moved, 0), &moved.schema));
        assert!(std::ptr::eq(
            index.root(&moved, 1),
            &moved.resources.entries[0].1
        ));
        let clone = moved.as_ref().clone();
        assert!(clone.cold_resource_index.is_none());
        for value in [Value::Bool(true), Value::Number(1.0), Value::Null] {
            assert_eq!(
                moved.validate(&value, &mut Context::catalog()).unwrap(),
                clone.validate(&value, &mut Context::catalog()).unwrap()
            );
        }
    }
}
