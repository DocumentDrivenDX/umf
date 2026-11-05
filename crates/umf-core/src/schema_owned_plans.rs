// SPDX-License-Identifier: MIT OR Apache-2.0
//! Private immutable-owner plans. The original resolver is the only builder.
//! No target or acceptance decision is derived from a caller ID/hash/address.
use super::*;
use std::collections::BTreeMap;

type NodeLocator = OwnerCursor;
// Logical table ordinals include distinct root/catalogue role ranges. A raw
// physical backing offset or diagnostic spelling is never this key's authority.
type NodePlanKey = (usize, bool);
fn plan_words<T>() -> usize {
    std::mem::size_of::<T>().div_ceil(std::mem::size_of::<usize>())
}
fn node_key_lookup_work(count: usize) -> u64 {
    // At most ordinal+mode comparisons per admitted BTree key comparison;
    // materialize the fixed key, size guard and returned Arc clone/overflow.
    tree_compare_bound(count).saturating_mul(2)
        .saturating_add(plan_words::<NodePlanKey>() as u64)
        .saturating_add(plan_words::<Arc<NodePlan>>() as u64)
        .saturating_add(3)
}
fn node_key_publication_work(count: usize) -> u64 {
    // Existing guarded BTree insertion policy; admit fixed key/value storage,
    // comparison bound, the publication Arc clone and entry write before effect.
    tree_compare_bound(count).saturating_mul(2)
        .saturating_add(plan_words::<NodePlanKey>() as u64)
        .saturating_add(plan_words::<Arc<NodePlan>>() as u64)
        .saturating_add(3)
}
#[derive(Debug)]
struct ReferencePlan {
    limits: crate::context::Limits,
    target: NodeLocator,
    path: Utf16,
    id_applied: bool,
}
#[derive(Debug)]
pub(super) struct NodePlan {
    limits: crate::context::Limits,
    locator: NodeLocator,
    pub(super) keywords: Vec<Option<String>>,
    pub(super) compiler_order: Option<Vec<(usize, usize)>>,
    pub(super) has_ref: bool,
}
#[derive(Debug)]
struct PlanBinding {
    lineage: Arc<()>,
    dialect: SchemaDialect,
    strict: bool,
    policy: KeywordPolicy,
    resolved: bool,
}
#[derive(Debug, Default)]
pub(super) struct OwnerPlans {
    binding: Mutex<Option<PlanBinding>>,
    references: Mutex<BTreeMap<(Utf16, Utf16, Option<String>), Arc<ReferencePlan>>>,
    evaluations: Mutex<BTreeMap<(Utf16, Utf16), Arc<ReferencePlan>>>,
    nodes: Mutex<BTreeMap<NodePlanKey, Arc<NodePlan>>>,
    frames: Mutex<BTreeMap<(Utf16, bool), Arc<ReferencePlan>>>,
}
// Callback-free critical sections. A control may reenter the same immutable
// handle and grow a cache AFTER its comparison bound was admitted. In that
// case skip the optional shortcut/publication; never search a larger map under
// the old bound, retry a callback, hold a lock across controls, or lose entries.
fn read_plan<K: Ord, V: Clone>(
    cache: &Mutex<BTreeMap<K, V>>,
    key: &K,
    admitted_count: usize,
) -> Result<Option<V>, ()> {
    let cache = cache.lock().unwrap_or_else(|e| e.into_inner());
    if cache.len() > admitted_count {
        return Err(());
    }
    Ok(cache.get(key).cloned())
}
fn publish_plan<K: Ord, V>(cache: &Mutex<BTreeMap<K, V>>, admitted_count: usize, key: K, value: V) {
    let mut cache = cache.lock().unwrap_or_else(|e| e.into_inner());
    if cache.len() <= admitted_count {
        cache.insert(key, value);
    }
}
impl OwnerPlans {
    fn belongs_to(
        &self,
        owner: &CompiledSchema,
        ctx: &mut Context<'_>,
    ) -> Result<bool, EngineError> {
        // This is an owner-created capability, NOT an arbitrary Value pointer
        // or acceptance shortcut. Its only sharing site has completed full
        // ordered content/catalogue/profile/limits proof equality.
        ctx.charge_work(1, Utf16::default())?;
        let Some(lineage) = &owner.owner_lineage else {
            return Ok(false);
        };
        if !matches!(owner.regex_profile, RegexProfile::Ecma262Unicode) {
            return Ok(false);
        }
        let compatible = {
            let prior = self.binding.lock().unwrap_or_else(|e| e.into_inner());
            prior.as_ref().map(|p| {
                Arc::ptr_eq(&p.lineage, lineage)
                    && p.dialect == owner.dialect
                    && p.strict == owner.strict
                    && p.policy == owner.root_keyword_policy
                    && p.resolved == owner.resolve_references_at_compile
            })
        };
        if let Some(compatible) = compatible {
            return Ok(compatible);
        }
        ctx.charge_work(1, Utf16::default())?;
        let binding = PlanBinding {
            lineage: Arc::clone(lineage),
            dialect: owner.dialect,
            strict: owner.strict,
            policy: owner.root_keyword_policy,
            resolved: owner.resolve_references_at_compile,
        };
        self.binding
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .get_or_insert(binding);
        // A private same-owner reentrant lookup may already have bound it.
        let prior = self.binding.lock().unwrap_or_else(|e| e.into_inner());
        let p = prior.as_ref().expect("bound lineage");
        Ok(Arc::ptr_eq(&p.lineage, lineage)
            && p.dialect == owner.dialect
            && p.strict == owner.strict
            && p.policy == owner.root_keyword_policy
            && p.resolved == owner.resolve_references_at_compile)
    }
    pub(super) fn frame(
        &self,
        owner: &CompiledSchema,
        schema: &Value,
        path: &Utf16,
        id_applied: bool,
        ctx: &mut Context<'_>,
    ) -> Result<Utf16, EngineError> {
        ctx.with_constructor_site("ctor.plan-work", |ctx| {
            if !self.belongs_to(owner, ctx)? {
                return owner.effective_frame_unplanned(schema, path, id_applied, ctx);
            }
            let Some(cursor)=owner.location_for_root_value(schema,ctx)? else {return owner.effective_frame_unplanned(schema,path,id_applied,ctx);};
            self.frame_inner(owner, schema, path, id_applied, &cursor, ctx)
        })
    }
    pub(super) fn node(
        &self,
        owner: &CompiledSchema,
        schema: &Value,
        path: &Utf16,
        compiler: bool,
        ctx: &mut Context<'_>,
    ) -> Result<Option<Arc<NodePlan>>, EngineError> {
        ctx.with_constructor_site("ctor.plan-work", |ctx| {
            if !self.belongs_to(owner, ctx)? {
                return Ok(None);
            }
            let Some(cursor)=owner.location_for_root_value(schema,ctx)? else {return Ok(None);};
            self.node_inner(owner, schema, path, compiler, &cursor, ctx, #[cfg(test)] None)
        })
    }
    pub(super) fn resolve_eval<'a>(&self,owner:&'a CompiledSchema,reference:&Value,path:&Utf16,ctx:&mut Context<'_>)->Result<(&'a Value,Utf16,bool),EngineError>{
        self.resolve_eval_located(owner,reference,path,ctx).map(|(value,path,applied,_)|(value,path,applied))
    }
    pub(super) fn resolve_eval_located<'a>(
        &self,
        owner: &'a CompiledSchema,
        reference: &Value,
        path: &Utf16,
        ctx: &mut Context<'_>,
    ) -> Result<(&'a Value, Utf16, bool, Option<OwnerCursor>), EngineError> {
        ctx.with_constructor_site("ctor.plan-work", |ctx| {
            if !self.belongs_to(owner, ctx)? {
                return owner.resolve_eval_ref_unplanned(reference,path,ctx).map(|(value,path,applied)|(value,path,applied,None));
            }
            self.resolve_eval_inner(owner, reference, path, ctx)
        })
    }
    pub(super) fn resolve<'a>(&self,owner:&'a CompiledSchema,reference:&Value,path:&Utf16,scope:Option<&str>,ctx:&mut Context<'_>)->Result<(&'a Value,Utf16),EngineError>{
        self.resolve_located(owner,reference,path,scope,ctx).map(|(value,path,_)|(value,path))
    }
    pub(super) fn resolve_located<'a>(
        &self,
        owner: &'a CompiledSchema,
        reference: &Value,
        path: &Utf16,
        scope: Option<&str>,
        ctx: &mut Context<'_>,
    ) -> Result<(&'a Value, Utf16, Option<OwnerCursor>), EngineError> {
        ctx.with_constructor_site("ctor.plan-work", |ctx| {
            if !self.belongs_to(owner, ctx)? {
                return owner.resolve_ref_unplanned(reference,path,scope,ctx).map(|(value,path)|(value,path,None));
            }
            self.resolve_inner(owner, reference, path, scope, ctx)
        })
    }
    pub(super) fn frame_at(&self,owner:&CompiledSchema,schema:&Value,path:&Utf16,id_applied:bool,cursor:Option<&OwnerCursor>,ctx:&mut Context<'_>)->Result<Utf16,EngineError>{
        ctx.with_constructor_site("ctor.plan-work",|ctx|{
            if !self.belongs_to(owner,ctx)? {return owner.effective_frame_unplanned(schema,path,id_applied,ctx);}
            let Some(cursor)=cursor else {return owner.effective_frame_unplanned(schema,path,id_applied,ctx);};
            let Some(table)=&owner.owner_locations else{return owner.effective_frame_unplanned(schema,path,id_applied,ctx);};
            if !table.read(owner,cursor,ctx)?.is_some_and(|node|std::ptr::eq(node,schema)){return owner.effective_frame_unplanned(schema,path,id_applied,ctx);}
            self.frame_inner(owner,schema,path,id_applied,cursor,ctx)
        })
    }
    pub(super) fn node_at(&self,owner:&CompiledSchema,schema:&Value,path:&Utf16,compiler:bool,cursor:Option<&OwnerCursor>,ctx:&mut Context<'_>)->Result<Option<Arc<NodePlan>>,EngineError>{
        self.node_at_impl(owner,schema,path,compiler,cursor,ctx,#[cfg(test)] None)
    }
    #[cfg(test)]
    fn node_at_with_events(&self,owner:&CompiledSchema,schema:&Value,path:&Utf16,compiler:bool,cursor:Option<&OwnerCursor>,ctx:&mut Context<'_>,event:&mut dyn FnMut(&'static str))->Result<Option<Arc<NodePlan>>,EngineError>{
        self.node_at_impl(owner,schema,path,compiler,cursor,ctx,Some(event))
    }
    fn node_at_impl(&self,owner:&CompiledSchema,schema:&Value,path:&Utf16,compiler:bool,cursor:Option<&OwnerCursor>,ctx:&mut Context<'_>,#[cfg(test)] event:Option<&mut dyn FnMut(&'static str)>)->Result<Option<Arc<NodePlan>>,EngineError>{
        ctx.with_constructor_site("ctor.plan-work",|ctx|{
            if !self.belongs_to(owner,ctx)? {return Ok(None);}
            let Some(cursor)=cursor else {return Ok(None);};
            let Some(table)=&owner.owner_locations else{return Ok(None);};
            if !table.read(owner,cursor,ctx)?.is_some_and(|node|std::ptr::eq(node,schema)){return Ok(None);}
            self.node_inner(owner,schema,path,compiler,cursor,ctx,#[cfg(test)] event)
        })
    }
    fn frame_inner(
        &self,
        owner: &CompiledSchema,
        schema: &Value,
        path: &Utf16,
        id_applied: bool,
        cursor: &OwnerCursor,
        ctx: &mut Context<'_>,
    ) -> Result<Utf16, EngineError> {
        let count = self.frames.lock().unwrap_or_else(|e| e.into_inner()).len();
        ctx.charge_work_u64(
            (path.len() as u64 + 1).saturating_mul(tree_compare_bound(count).saturating_add(1)),
            Utf16::default(),
        )?;
        let key = (path.clone(), id_applied);
        let prior = match read_plan(&self.frames, &key, count) {
            Ok(plan) => plan,
            Err(()) => {
                return owner.effective_frame_unplanned(schema, path, id_applied, ctx);
            }
        };
        if let Some(plan) = prior.filter(|p| p.limits == ctx.limits()) {
            ctx.charge_work(2,Utf16::default())?;
            if plan.target.same_location(cursor) && std::ptr::eq(plan.target.get(owner, ctx)?, schema) {
                return Ok(plan.path.clone());
            }
            // Same diagnostic spelling, different anchor target: retain exact
            // original normalization. Never let one alias admit another node.
            return owner.effective_frame_unplanned(schema, path, id_applied, ctx);
        }
        let normalized = owner.effective_frame_unplanned(schema, path, id_applied, ctx)?;
        if count >= ctx.limits().max_values {
            return Ok(normalized);
        }
        ctx.charge_work(1,Utf16::default())?;
        let target = cursor.clone();
        ctx.charge_work(2, Utf16::default())?;
        let plan = Arc::new(ReferencePlan {
            limits: ctx.limits(),
            target,
            path: normalized.into_shared_with_context(ctx)?,
            id_applied,
        });
        ctx.charge_work_u64(
            (path.len() as u64 + 1)
                .saturating_mul(tree_compare_bound(count))
                .saturating_add(1),
            Utf16::default(),
        )?;
        publish_plan(&self.frames, count, key, Arc::clone(&plan));
        Ok(plan.path.clone())
    }
    fn node_inner(
        &self,
        owner: &CompiledSchema,
        schema: &Value,
        _path: &Utf16,
        compiler: bool,
        cursor: &OwnerCursor,
        ctx: &mut Context<'_>,
        #[cfg(test)] mut event: Option<&mut dyn FnMut(&'static str)>,
    ) -> Result<Option<Arc<NodePlan>>, EngineError> {
        let Value::Object(members) = schema else {
            return Ok(None);
        };
        // The accessor re-executes owner/table/lineage/current-limit/readback
        // checks and coordinate translation. This repeated real read is paid.
        let Some((_role, ordinal)) = cursor.logical_position(owner, ctx)? else {
            return Ok(None);
        };
        ctx.charge_work(1, Utf16::default())?;
        let count = self.nodes.lock().unwrap_or_else(|e| e.into_inner()).len();
        ctx.charge_work_u64(node_key_lookup_work(count), Utf16::default())?;
        #[cfg(test)]
        if let Some(observer) = event.as_deref_mut() { observer("node-key-and-lookup"); }
        let key = (ordinal, compiler);
        let prior = match read_plan(&self.nodes, &key, count) {
            Ok(plan) => plan,
            Err(()) => {
                return Ok(None);
            }
        };
        // Keep exact effective Limits eligibility; admit its real field reads
        // and optional branch before examining the returned plan.
        ctx.charge_work(plan_words::<crate::context::Limits>() + 1, Utf16::default())?;
        if let Some(plan) = prior.filter(|p| p.limits == ctx.limits()) {
            // Fixed coordinates do not replace borrowed-node custody: retain
            // BOTH same-location and actual owner readback checks on every hit.
            ctx.charge_work(2,Utf16::default())?;
            if plan.locator.same_location(cursor) && std::ptr::eq(plan.locator.get(owner, ctx)?, schema) {
                return Ok(Some(plan));
            }
            return Ok(None);
        }
        if count >= ctx.limits().max_values {
            return Ok(None);
        }
        ctx.charge_work(1,Utf16::default())?;
        let locator = cursor.clone();
        ctx.charge_work(
            members.len().saturating_mul(if compiler { 130 } else { 1 }),
            Utf16::default(),
        )?;
        #[cfg(test)]
        if let Some(observer) = event.as_deref_mut() { observer("node-metadata-reserve"); }
        let mut keywords = Vec::with_capacity(members.len());
        let mut order = if compiler {
            Some(Vec::with_capacity(members.len()))
        } else {
            None
        };
        for (index, (name, _)) in members.iter().enumerate() {
            ctx.charge_work(
                name.len().saturating_mul(3).saturating_add(1),
                Utf16::default(),
            )?;
            #[cfg(test)]
            if let Some(observer) = event.as_deref_mut() { observer("node-keyword-decode"); }
            keywords.push(name.to_utf8().ok());
            if let Some(order) = &mut order {
                order.push((compiler_keyword_rank(name), index));
            }
        }
        if let Some(order) = &mut order {
            order.sort_unstable();
        }
        ctx.charge_work(1, Utf16::default())?;
        let has_ref = keywords.iter().any(|key| key.as_deref() == Some("$ref"));
        // Complete NodePlan payload, Arc strong/weak header, owner wrapper and
        // initialization are real storage work, separate from keyword decoding.
        ctx.charge_work(
            plan_words::<NodePlan>() + 2 + plan_words::<Arc<NodePlan>>() + 1,
            Utf16::default(),
        )?;
        #[cfg(test)]
        if let Some(observer) = event.as_deref_mut() { observer("node-plan-header"); }
        let plan = Arc::new(NodePlan {
            limits: ctx.limits(),
            locator,
            keywords,
            compiler_order: order,
            has_ref,
        });
        ctx.charge_work_u64(node_key_publication_work(count), Utf16::default())?;
        #[cfg(test)]
        if let Some(observer) = event.as_deref_mut() { observer("node-publication-attempt"); }
        // The original callback-free size guard may decline publication after
        // reentry. This event never promises a store occurred under a stale bound.
        publish_plan(&self.nodes, count, key, Arc::clone(&plan));
        Ok(Some(plan))
    }
    fn resolve_eval_inner<'a>(
        &self,
        owner: &'a CompiledSchema,
        reference: &Value,
        path: &Utf16,
        ctx: &mut Context<'_>,
    ) -> Result<(&'a Value, Utf16, bool, Option<OwnerCursor>), EngineError> {
        let Value::String(text) = reference else {
            return owner.resolve_eval_ref_unplanned(reference,path,ctx).map(|(v,p,a)|(v,p,a,None));
        };
        let count = self
            .evaluations
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .len();
        let work = path.len().saturating_add(text.len()).saturating_add(1);
        ctx.charge_work_u64(
            (work as u64).saturating_mul(tree_compare_bound(count).saturating_add(1)),
            Utf16::default(),
        )?;
        let key = (path.clone(), text.clone());
        let prior = match read_plan(&self.evaluations, &key, count) {
            Ok(plan) => plan,
            Err(()) => {
                return owner.resolve_eval_ref_unplanned(reference,path,ctx).map(|(v,p,a)|(v,p,a,None));
            }
        };
        if let Some(plan) = prior.filter(|p| p.limits == ctx.limits()) {
            let target=plan.target.get(owner,ctx)?;
            let cursor=clone_owner_cursor(Some(&plan.target),ctx)?;
            return Ok((target,plan.path.clone(),plan.id_applied,cursor));
        }
        let (target, target_path, id_applied, cursor) =
            owner.resolve_eval_ref_unplanned_located(reference, path, ctx)?;
        let Some(locator)=cursor else{return Ok((target,target_path,id_applied,None));};
        if count >= ctx.limits().max_values {
            return Ok((target, target_path, id_applied,Some(locator)));
        }
        ctx.charge_work(2, Utf16::default())?;
        let plan = Arc::new(ReferencePlan {
            limits: ctx.limits(),
            target: locator,
            path: target_path.into_shared_with_context(ctx)?,
            id_applied,
        });
        ctx.charge_work_u64(
            (work as u64)
                .saturating_mul(tree_compare_bound(count))
                .saturating_add(1),
            Utf16::default(),
        )?;
        let cursor=clone_owner_cursor(Some(&plan.target),ctx)?;
        publish_plan(&self.evaluations, count, key, Arc::clone(&plan));
        Ok((target, plan.path.clone(), id_applied,cursor))
    }
    fn resolve_inner<'a>(
        &self,
        owner: &'a CompiledSchema,
        reference: &Value,
        path: &Utf16,
        scope: Option<&str>,
        ctx: &mut Context<'_>,
    ) -> Result<(&'a Value, Utf16, Option<OwnerCursor>), EngineError> {
        let Value::String(text) = reference else {
            return owner.resolve_ref_unplanned(reference,path,scope,ctx).map(|(v,p)|(v,p,None));
        };
        let count = self
            .references
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .len();
        let key_work = path
            .len()
            .saturating_add(text.len())
            .saturating_add(scope.map_or(0, str::len))
            .saturating_add(1);
        ctx.charge_work_u64(
            (key_work as u64).saturating_mul(tree_compare_bound(count).saturating_add(1)),
            Utf16::default(),
        )?;
        // Key materialization is explicit admitted work. No callbacks run under
        // the map lock; nested/reentrant construction cannot observe a partial plan.
        let key = (path.clone(), text.clone(), scope.map(str::to_owned));
        let prior = match read_plan(&self.references, &key, count) {
            Ok(plan) => plan,
            Err(()) => {
                return owner.resolve_ref_unplanned(reference,path,scope,ctx).map(|(v,p)|(v,p,None));
            }
        };
        if let Some(plan) = prior.filter(|p| p.limits == ctx.limits()) {
            let target=plan.target.get(owner,ctx)?;
            let cursor=clone_owner_cursor(Some(&plan.target),ctx)?;
            return Ok((target,plan.path.clone(),cursor));
        }
        let (target, target_path, cursor) = owner.resolve_ref_unplanned_located(reference, path, scope, ctx)?;
        if count >= ctx.limits().max_values {
            return Ok((target, target_path,cursor));
        }
        let Some(locator)=cursor else{return Ok((target,target_path,None));};
        ctx.charge_work(2, Utf16::default())?;
        let plan = Arc::new(ReferencePlan {
            limits: ctx.limits(),
            target: locator,
            path: target_path.into_shared_with_context(ctx)?,
            id_applied: false,
        });
        ctx.charge_work_u64(
            tree_compare_bound(count)
                .saturating_mul(key_work as u64)
                .saturating_add(1),
            Utf16::default(),
        )?;
        let cursor=clone_owner_cursor(Some(&plan.target),ctx)?;
        publish_plan(&self.references, count, key, Arc::clone(&plan));
        Ok((target, plan.path.clone(),cursor))
    }
}

// Invocation-local path arena. It retains no instance or caller object and is
// dropped/restored at the complete evaluator boundary, including unwind.
#[derive(Default)]
pub(crate) struct EvaluationPaths {
    tracked: Option<TrackedPaths>,
    values: BTreeMap<(Utf16, Utf16, u8), Utf16>,
    scratch: Vec<u16>,
    units: usize,
}
impl EvaluationPaths {
    pub(crate) fn append(
        &mut self,
        path: &Utf16,
        segment: &Utf16,
        schema: bool,
        ctx: &mut Context<'_>,
    ) -> Result<Utf16, EngineError> {
        self.append_kind(path, segment, if schema { 1 } else { 0 }, ctx)
    }
    pub(super) fn append_raw(
        &mut self,
        path: &Utf16,
        segment: &Utf16,
        ctx: &mut Context<'_>,
    ) -> Result<Utf16, EngineError> {
        self.append_kind(path, segment, 2, ctx)
    }
    fn append_kind(
        &mut self,
        path: &Utf16,
        segment: &Utf16,
        kind: u8,
        ctx: &mut Context<'_>,
    ) -> Result<Utf16, EngineError> {
        let schema = kind != 0;

        let key_work = path.len().saturating_add(segment.len()).saturating_add(1);
        let admitted_units = path
            .len()
            .saturating_mul(2)
            .saturating_add(segment.len().saturating_mul(3))
            .saturating_add(2);
        if self.values.len() >= ctx.limits().max_values
            || self.units.saturating_add(admitted_units) > ctx.limits().max_text_units
        {
            ctx.charge_work(
                path.len()
                    .saturating_add(segment.len().saturating_mul(3))
                    .saturating_add(1),
                Utf16::default(),
            )?;
            return Ok(if kind == 2 {
                append_schema_path(path, &segment.to_utf8().expect("owned UTF8 step"))
            } else if schema {
                append_schema_pointer(path, segment)
            } else {
                append_instance_path(path, segment)
            });
        }
        ctx.charge_work_u64(
            (key_work as u64)
                .saturating_mul(tree_compare_bound(self.values.len()).saturating_add(1)),
            Utf16::default(),
        )?;
        let key = (path.clone(), segment.clone(), kind);
        if let Some(value) = self.values.get(&key) {
            return Ok(value.clone());
        }
        let wanted = path
            .len()
            .saturating_add(segment.len().saturating_mul(2))
            .saturating_add(1);
        if self.scratch.capacity() < wanted {
            ctx.charge_work(self.scratch.len().saturating_add(wanted), Utf16::default())?;
            self.scratch
                .reserve_exact(wanted.saturating_sub(self.scratch.len()));
        }
        ctx.charge_work(wanted, Utf16::default())?;
        self.scratch.clear();
        self.scratch.extend_from_slice(path.units());
        if !schema || self.scratch.last() != Some(&47) {
            self.scratch.push(47);
        }
        for unit in segment.units() {
            if kind == 2 {
                self.scratch.push(*unit);
                continue;
            }
            match *unit {
                126 => self.scratch.extend_from_slice(&[126, 48]),
                47 => self.scratch.extend_from_slice(&[126, 49]),
                other => self.scratch.push(other),
            }
        }
        ctx.charge_work(self.scratch.len().saturating_add(2), Utf16::default())?;
        let result = Utf16::shared(self.scratch.clone());
        ctx.charge_work_u64(
            (key_work as u64)
                .saturating_mul(tree_compare_bound(self.values.len()))
                .saturating_add(1),
            Utf16::default(),
        )?;
        self.units = self.units.saturating_add(admitted_units);
        self.values.insert(key, result.clone());
        Ok(result)
    }
}

// A handle is minted only by this invocation arena. It is not a text/node ID.
struct PathHandle {
    arena_identity: Arc<()>,
    entry: usize,
}
/// Actual immutable diagnostic spelling, carried alongside optional arena custody.
/// No unmetered Clone or caller-supplied handle constructor.
pub(crate) struct EvaluationPathPair {
    text: Utf16,
    handle: Option<PathHandle>,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum PathKind {
    InstancePointer,
    SchemaPointer,
    RawSchemaStep,
}
impl PathKind {
    fn tag(self) -> u8 {
        match self { Self::InstancePointer => 0, Self::SchemaPointer => 1, Self::RawSchemaStep => 2 }
    }
}
impl EvaluationPathPair {
    pub(crate) fn text(&self) -> &Utf16 { &self.text }
    pub(crate) fn untracked(text: Utf16, ctx: &mut Context<'_>) -> Result<Self, EngineError> {
        ctx.charge_work(plan_words::<Self>() + 1, Utf16::default())?;
        Ok(Self { text, handle: None })
    }
    pub(crate) fn clone_with_context(&self, ctx: &mut Context<'_>) -> Result<Self, EngineError> {
        self.clone_with_events(ctx, &mut |_| {})
    }
    fn clone_with_events(&self, ctx: &mut Context<'_>, event: &mut dyn FnMut(&'static str)) -> Result<Self, EngineError> {
        // clone_work is the existing storage-aware copy/refcount policy. The
        // returned private wrappers and identity clone/drop are separate work.
        ctx.charge_work(self.text.clone_work().saturating_add(plan_words::<Self>() + 4), Utf16::default())?;
        event("path-pair-clone");
        Ok(Self {
            text: self.text.clone(),
            handle: self.handle.as_ref().map(|h| PathHandle { arena_identity: Arc::clone(&h.arena_identity), entry: h.entry }),
        })
    }
}
struct PathEntry {
    text: Utf16,
    parent: Option<usize>,
    kind: u8,
    depth: usize,
}
type PathTransition = (usize, Utf16, u8);
struct TrackedPaths {
    identity: Arc<()>,
    limits: crate::context::Limits,
    profile: crate::context::ResourceProfile,
    entries: Vec<PathEntry>,
    children: BTreeMap<PathTransition, usize>,
    units: usize,
}
// Snapshot is numeric only. No RefCell guard survives a Context callback.
#[derive(Clone, Copy)]
struct PathSnapshot { entries: usize, children: usize, capacity: usize, units: usize }
impl TrackedPaths {
    fn snapshot(&self) -> PathSnapshot {
        PathSnapshot { entries: self.entries.len(), children: self.children.len(), capacity: self.entries.capacity(), units: self.units }
    }
    fn unchanged(&self, s: PathSnapshot) -> bool {
        self.entries.len() == s.entries && self.children.len() == s.children
            && self.entries.capacity() == s.capacity && self.units == s.units
    }
    fn compatible(&self, ctx: &Context<'_>) -> bool {
        self.limits == ctx.limits() && self.profile == ctx.profile()
    }
    fn parent(&self, pair: &EvaluationPathPair) -> Option<(usize, usize)> {
        let h = pair.handle.as_ref()?;
        if !Arc::ptr_eq(&self.identity, &h.arena_identity) { return None; }
        // Pair fields are private and immutable. The entry, not a caller ID or
        // text/pointer comparison, establishes the admitted parent/depth.
        let entry = self.entries.get(h.entry)?;
        Some((h.entry, entry.depth))
    }
}
impl EvaluationPaths {
    fn tracked_guard_work() -> usize {
        // Exact Limits/profile, numeric snapshot, arena/entry option checks and
        // RefCell guard bookkeeping. Repeated checks retain repeated debits.
        plan_words::<crate::context::Limits>() + plan_words::<crate::context::ResourceProfile>()
            + plan_words::<PathSnapshot>() + 8
    }
    pub(crate) fn new_tracked(ctx: &mut Context<'_>) -> Result<std::rc::Rc<std::cell::RefCell<Self>>, EngineError> {
        Self::new_tracked_inner(ctx, &mut |_| {})
    }
    fn new_tracked_inner(ctx: &mut Context<'_>, event: &mut dyn FnMut(&'static str)) -> Result<std::rc::Rc<std::cell::RefCell<Self>>, EngineError> {
        // Rc strong/weak header, RefCell flag, arena/map/Vec/identity wrappers,
        // Arc<()> header and eventual owner cleanup are all admitted here.
        ctx.charge_work(2 * (plan_words::<std::cell::RefCell<Self>>() + 2)
            + 2 * (plan_words::<TrackedPaths>() + 2) + plan_words::<crate::context::Limits>() + 8,
            Utf16::default())?;
        event("path-arena-construction");
        Ok(std::rc::Rc::new(std::cell::RefCell::new(Self {
            tracked: Some(TrackedPaths {
                identity: Arc::new(()), limits: ctx.limits(), profile: ctx.profile(),
                entries: Vec::new(), children: BTreeMap::new(), units: 0,
            }), ..Self::default()
        })))
    }
    pub(crate) fn root_pair(arena: &std::rc::Rc<std::cell::RefCell<Self>>, text: Utf16, ctx: &mut Context<'_>) -> Result<EvaluationPathPair, EngineError> {
        Self::root_pair_inner(arena, text, ctx, &mut |_| {})
    }
    // Same production body; observer is post-admission, immediately pre-effect.
    fn root_pair_inner(arena: &std::rc::Rc<std::cell::RefCell<Self>>, text: Utf16, ctx: &mut Context<'_>, event: &mut dyn FnMut(&'static str)) -> Result<EvaluationPathPair, EngineError> {
        ctx.charge_work(Self::tracked_guard_work().saturating_add(8), Utf16::default())?;
        event("path-root-read");
        let snapshot = {
            let a = arena.borrow();
            a.tracked.as_ref().filter(|t| t.compatible(ctx)).map(TrackedPaths::snapshot)
        };
        let Some(s) = snapshot else { return EvaluationPathPair::untracked(text, ctx); };
        if s.entries >= ctx.limits().max_values || s.units.checked_add(text.len()).is_none_or(|u| u > ctx.limits().max_text_units) {
            return EvaluationPathPair::untracked(text, ctx);
        }
        // One owned spelling becomes Shared once; Static conversion pays its
        // existing real copy fee. No root text equality/intern search occurs.
        ctx.charge_work(plan_words::<Vec<u16>>() + plan_words::<Utf16>() + plan_words::<EvaluationPathPair>() + Self::tracked_guard_work() + 6, Utf16::default())?;
        let text = text.into_shared_with_context(ctx)?;
        if !arena.borrow().tracked.as_ref().is_some_and(|t| t.unchanged(s) && t.compatible(ctx)) {
            return Ok(EvaluationPathPair { text, handle: None });
        }
        ctx.charge_work(Self::entry_work(s).saturating_add(text.clone_work())
            .saturating_add(plan_words::<EvaluationPathPair>() + Self::tracked_guard_work() + 8), Utf16::default())?;
        event("path-root-publication");
        let mut a = arena.borrow_mut();
        let Some(t) = a.tracked.as_mut().filter(|t| t.unchanged(s) && t.compatible(ctx)) else {
            return Ok(EvaluationPathPair { text, handle: None });
        };
        Self::reserve_entry(t, s);
        let id = t.entries.len();
        t.units += text.len();
        t.entries.push(PathEntry { text: text.clone(), parent: None, kind: 3, depth: 0 });
        Ok(EvaluationPathPair { text, handle: Some(PathHandle { arena_identity: Arc::clone(&t.identity), entry: id }) })
    }
    // Includes requested allocation, all possibly relocated entries, publication
    // writes and eventual drops. reserve_exact is performed only after admission.
    fn entry_work(s: PathSnapshot) -> usize {
        let w = plan_words::<PathEntry>();
        let grow = if s.entries == s.capacity { (s.entries.saturating_add(1)).saturating_mul(w).saturating_add(s.entries.saturating_mul(w)) } else { 0 };
        grow.saturating_add(2 * w + 8)
    }
    fn reserve_entry(t: &mut TrackedPaths, s: PathSnapshot) {
        if s.entries == s.capacity { t.entries.reserve_exact(1); }
    }
    pub(crate) fn append_pair(arena: &std::rc::Rc<std::cell::RefCell<Self>>, parent: &EvaluationPathPair, segment: &Utf16, kind: PathKind, ctx: &mut Context<'_>) -> Result<EvaluationPathPair, EngineError> {
        Self::append_pair_inner(arena, parent, segment, kind, ctx, &mut |_| {})
    }
    fn append_pair_inner(arena: &std::rc::Rc<std::cell::RefCell<Self>>, parent: &EvaluationPathPair, segment: &Utf16, kind: PathKind, ctx: &mut Context<'_>, event: &mut dyn FnMut(&'static str)) -> Result<EvaluationPathPair, EngineError> {
        ctx.charge_work(Self::tracked_guard_work().saturating_add(plan_words::<PathEntry>() + plan_words::<PathHandle>() + 12), Utf16::default())?;
        event("path-parent-read");
        let snapshot = {
            let a = arena.borrow();
            a.tracked.as_ref().filter(|t| t.compatible(ctx)).and_then(|t| t.parent(parent).map(|(p,d)| (t.snapshot(),p,d)))
        };
        let mut key = None;
        let mut tracking = None;
        if let Some((s,p,d)) = snapshot {
            if s.entries < ctx.limits().max_values && d < ctx.limits().max_depth {
                // Fixed parent ordinal/kind plus FULL segment comparison/copy.
                // Parent diagnostic units are never searched or cloned as a key.
                let work = (segment.len() as u64 + 3).saturating_mul(tree_compare_bound(s.children))
                    .saturating_add(segment.len() as u64)
                    .saturating_add((segment.len().saturating_mul(2).div_ceil(std::mem::size_of::<usize>())) as u64)
                    .saturating_add((plan_words::<PathTransition>() + Self::tracked_guard_work() + 12) as u64);
                ctx.charge_work_u64(work, Utf16::default())?;
                event("path-transition-lookup");
                let candidate_key = (p, Utf16::new(segment.units().to_vec()), kind.tag());
                let hit = {
                    let a = arena.borrow();
                    a.tracked.as_ref().filter(|t| t.unchanged(s) && t.compatible(ctx))
                        .and_then(|t| t.children.get(&candidate_key).copied())
                };
                if let Some(id) = hit {
                    // Stored text is Shared; admit wrapper/refcount and fields
                    // BEFORE the callback-free, rechecked read/return.
                    ctx.charge_work(plan_words::<EvaluationPathPair>() + plan_words::<PathEntry>() + Self::tracked_guard_work() + 12, Utf16::default())?;
                    event("path-transition-hit");
                    let a = arena.borrow();
                    if let Some(t) = a.tracked.as_ref().filter(|t| t.unchanged(s) && t.compatible(ctx)) {
                        if let Some(e) = t.entries.get(id).filter(|e| e.parent == Some(p) && e.kind == kind.tag() && e.depth == d + 1) {
                            return Ok(EvaluationPathPair { text: e.text.clone(), handle: Some(PathHandle { arena_identity: Arc::clone(&t.identity), entry: id }) });
                        }
                    }
                }
                key = Some(candidate_key);
                tracking = Some((s,p,d));
            }
        }
        // Also the foreign/default/capacity fallback: build the original exact
        // spelling ONCE. Tracking failure never becomes a semantic refusal.
        let text = Self::build_pair_text(parent.text(), segment, kind, ctx, event)?;
        if let (Some((s,p,d)), Some(key)) = (tracking, key) {
            if !arena.borrow().tracked.as_ref().is_some_and(|t| t.unchanged(s) && t.compatible(ctx)) {
                return Ok(EvaluationPathPair { text, handle: None });
            }
            let units = s.units.checked_add(text.len()).and_then(|u| u.checked_add(segment.len()));
            if let Some(units) = units.filter(|u| *u <= ctx.limits().max_text_units) {
                // Rust1.90 BTree node policy: 11 entries, up to12 edges, header.
                // An insertion splits at most one node per level plus new root;
                // the binary-tree level bound below is conservative for BTree
                // branching. Comparison count is NOT an allocation count.
                // Cover capacity, every moved key/value and cleanup.
                let entry_words = plan_words::<(PathTransition, usize)>();
                let node_words = 11usize.saturating_mul(entry_words).saturating_add(12 + 4);
                let levels = (usize::BITS - s.children.saturating_add(1).leading_zeros()) as u64;
                let structural = levels.saturating_add(1)
                    .saturating_mul((node_words.saturating_mul(3)) as u64).saturating_add(5);
                let comparisons = (segment.len() as u64 + 3).saturating_mul(tree_compare_bound(s.children));
                let fee = structural.saturating_add(comparisons)
                    .saturating_add(Self::entry_work(s) as u64)
                    .saturating_add((text.clone_work() + plan_words::<EvaluationPathPair>() + 2 * Self::tracked_guard_work() + 16) as u64);
                ctx.charge_work_u64(fee, Utf16::default())?;
                event("path-transition-publication");
                let mut a = arena.borrow_mut();
                if let Some(t) = a.tracked.as_mut().filter(|t| t.unchanged(s) && t.compatible(ctx)) {
                    // All growth, moves, map comparisons/writes, refcounts and
                    // returned pair admitted. No callbacks in this commit.
                    Self::reserve_entry(t,s);
                    let id = t.entries.len();
                    t.entries.push(PathEntry { text: text.clone(), parent: Some(p), kind: kind.tag(), depth: d + 1 });
                    t.children.insert(key,id);
                    t.units = units;
                    return Ok(EvaluationPathPair { text, handle: Some(PathHandle { arena_identity: Arc::clone(&t.identity), entry: id }) });
                }
            }
        }
        // Returned untracked wrapper was admitted with output construction.
        // No late fallback callback or second path construction.
        Ok(EvaluationPathPair { text, handle: None })
    }
    fn build_pair_text(parent: &Utf16, segment: &Utf16, kind: PathKind, ctx: &mut Context<'_>, event: &mut dyn FnMut(&'static str)) -> Result<Utf16, EngineError> {
        ctx.charge_work(segment.len().saturating_add(4), Utf16::default())?;
        event("path-suffix-scan");
        let escaped = segment.units().iter().fold(0usize, |n,u| n.saturating_add(if kind != PathKind::RawSchemaStep && (*u == 47 || *u == 126) {2} else {1}));
        let slash = usize::from(kind == PathKind::InstancePointer || parent.units().last() != Some(&47));
        let length = parent.len().checked_add(slash).and_then(|n| n.checked_add(escaped))
            .ok_or_else(|| EngineError::new("LIMIT", Utf16::default(), "Evaluation path size overflow"))?;
        // Capacity bytes, complete prefix copy, second suffix scan and exact
        // emitted units, Vec/Arc strong+weak headers/wrappers and cleanup.
        let allocation = length.checked_mul(std::mem::size_of::<u16>())
            .ok_or_else(|| EngineError::new("LIMIT", Utf16::default(), "Evaluation path allocation overflow"))?
            .div_ceil(std::mem::size_of::<usize>());
        let fee = allocation.saturating_add(parent.len()).saturating_add(segment.len())
            .saturating_add(escaped).saturating_add(slash)
            .saturating_add(2 * plan_words::<Vec<u16>>() + plan_words::<Utf16>() + plan_words::<EvaluationPathPair>() + Self::tracked_guard_work() + 12);
        ctx.charge_work(fee, Utf16::default())?;
        event("path-output-allocation-and-write");
        let mut out = Vec::with_capacity(length);
        out.extend_from_slice(parent.units());
        if slash == 1 { out.push(47); }
        for &unit in segment.units() {
            if kind == PathKind::RawSchemaStep { out.push(unit); }
            else { match unit { 126 => out.extend_from_slice(&[126,48]), 47 => out.extend_from_slice(&[126,49]), u => out.push(u) } }
        }
        event("path-output-move-to-shared");
        Ok(Utf16::shared(out))
    }
}

#[cfg(test)]
#[path = "schema_owned_plan_tests.rs"]
mod tests;

#[cfg(test)]
#[path = "schema_owned_plan_independent_tests.rs"]
mod independent_tests;

#[cfg(test)]
#[path = "schema_owner_locations_independent_tests.rs"]
mod location_independent_tests;

#[cfg(test)]
#[path = "schema_owner_location_tests.rs"]
mod location_owner_tests;

#[cfg(test)]
#[path = "schema_node_coordinate_independent_tests.rs"]
mod node_coordinate_independent_tests;

// Test observation only. These owned views cannot mint a pair/handle, mutate an
// arena, or stand in for admission. No observation callback or Context operation.
#[cfg(test)]
pub(crate) struct EvaluationPathEntryView {
    ordinal: usize,
    parent: Option<usize>,
    kind: u8,
    depth: usize,
    text: Utf16,
}
#[cfg(test)]
impl EvaluationPathEntryView {
    pub(crate) fn ordinal(&self) -> usize { self.ordinal }
    pub(crate) fn parent(&self) -> Option<usize> { self.parent }
    pub(crate) fn kind(&self) -> u8 { self.kind }
    pub(crate) fn depth(&self) -> usize { self.depth }
    pub(crate) fn text(&self) -> &Utf16 { &self.text }
}
#[cfg(test)]
pub(crate) struct EvaluationPathsSnapshot {
    entries: Vec<EvaluationPathEntryView>,
    transitions: Vec<(usize, Utf16, u8, usize)>,
}
#[cfg(test)]
impl EvaluationPathsSnapshot {
    pub(crate) fn entries(&self) -> &[EvaluationPathEntryView] { &self.entries }
    pub(crate) fn transitions(&self) -> &[(usize, Utf16, u8, usize)] { &self.transitions }
}
#[cfg(test)]
impl EvaluationPathPair {
    pub(crate) fn tracked_entry_for_test(&self, arena: &EvaluationPaths) -> Option<usize> {
        let tracked = arena.tracked.as_ref()?;
        let handle = self.handle.as_ref()?;
        if !Arc::ptr_eq(&tracked.identity, &handle.arena_identity) { return None; }
        tracked.entries.get(handle.entry)?;
        Some(handle.entry)
    }
}
#[cfg(test)]
impl EvaluationPaths {
    pub(crate) fn snapshot_for_test(&self) -> Option<EvaluationPathsSnapshot> {
        let tracked = self.tracked.as_ref()?;
        Some(EvaluationPathsSnapshot {
            entries: tracked.entries.iter().enumerate().map(|(ordinal, entry)| EvaluationPathEntryView {
                ordinal, parent: entry.parent, kind: entry.kind,
                // Actual stored depth, not inferred text slash count.
                depth: entry.depth, text: entry.text.clone(),
            }).collect(),
            transitions: tracked.children.iter().map(|((parent, segment, kind), child)|
                (*parent, segment.clone(), *kind, *child)).collect(),
        })
    }
}

#[cfg(test)]
#[path = "schema_evaluation_path_pair_independent_tests.rs"]
mod evaluation_path_pair_independent_tests;

#[cfg(test)]
#[path = "schema_preflight_reference_independent_tests.rs"]
mod preflight_reference_independent_tests;
