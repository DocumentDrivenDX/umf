// SPDX-License-Identifier: MIT OR Apache-2.0
//! Private immutable-owner plans. The original resolver is the only builder.
//! No target or acceptance decision is derived from a caller ID/hash/address.
use super::*;
use std::collections::BTreeMap;

#[derive(Clone, Debug)]
struct NodeLocator {
    root: usize,
    children: Vec<usize>,
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
    nodes: Mutex<BTreeMap<(Utf16, bool), Arc<NodePlan>>>,
    frames: Mutex<BTreeMap<(Utf16, bool), Arc<ReferencePlan>>>,
}
impl NodeLocator {
    fn locate(
        owner: &CompiledSchema,
        target: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Self, EngineError> {
        fn visit(
            value: &Value,
            target: &Value,
            path: &mut Vec<usize>,
            ctx: &mut Context<'_>,
        ) -> Result<bool, EngineError> {
            ctx.charge_work(1, Utf16::default())?;
            // Equality of borrowed nodes is used only to locate the result of
            // the genuine resolver inside this immutable owner, never to admit it.
            if std::ptr::eq(value, target) {
                return Ok(true);
            }
            let count = match value {
                Value::Object(v) => v.len(),
                Value::Array(v) => v.len(),
                _ => 0,
            };
            for i in 0..count {
                if path.len() == path.capacity() {
                    ctx.charge_work(path.len().saturating_add(1), Utf16::default())?;
                    path.reserve_exact(1);
                }
                ctx.charge_work(1, Utf16::default())?;
                path.push(i);
                let child = match value {
                    Value::Object(v) => &v[i].1,
                    Value::Array(v) => &v[i],
                    _ => unreachable!(),
                };
                if visit(child, target, path, ctx)? {
                    return Ok(true);
                }
                path.pop();
            }
            Ok(false)
        }
        let mut children = Vec::new();
        for root in 0..=owner.resources.entries.len() {
            let value = if root == 0 {
                &*owner.schema
            } else {
                &owner.resources.entries[root - 1].1
            };
            if visit(value, target, &mut children, ctx)? {
                return Ok(Self { root, children });
            }
        }
        Err(schema_error(
            &Utf16::default(),
            "Resolved target is outside its immutable schema owner",
        ))
    }
    fn get<'a>(
        &self,
        owner: &'a CompiledSchema,
        ctx: &mut Context<'_>,
    ) -> Result<&'a Value, EngineError> {
        ctx.charge_work(1, Utf16::default())?;
        let mut value = if self.root == 0 {
            &*owner.schema
        } else {
            &owner.resources.entries[self.root - 1].1
        };
        for i in &self.children {
            ctx.charge_work(1, Utf16::default())?;
            value = match value {
                Value::Object(v) => &v[*i].1,
                Value::Array(v) => &v[*i],
                _ => unreachable!("owner-relative plan"),
            };
        }
        Ok(value)
    }
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
            self.frame_inner(owner, schema, path, id_applied, ctx)
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
            self.node_inner(owner, schema, path, compiler, ctx)
        })
    }
    pub(super) fn resolve_eval<'a>(
        &self,
        owner: &'a CompiledSchema,
        reference: &Value,
        path: &Utf16,
        ctx: &mut Context<'_>,
    ) -> Result<(&'a Value, Utf16, bool), EngineError> {
        ctx.with_constructor_site("ctor.plan-work", |ctx| {
            if !self.belongs_to(owner, ctx)? {
                return owner.resolve_eval_ref_unplanned(reference, path, ctx);
            }
            self.resolve_eval_inner(owner, reference, path, ctx)
        })
    }
    pub(super) fn resolve<'a>(
        &self,
        owner: &'a CompiledSchema,
        reference: &Value,
        path: &Utf16,
        scope: Option<&str>,
        ctx: &mut Context<'_>,
    ) -> Result<(&'a Value, Utf16), EngineError> {
        ctx.with_constructor_site("ctor.plan-work", |ctx| {
            if !self.belongs_to(owner, ctx)? {
                return owner.resolve_ref_unplanned(reference, path, scope, ctx);
            }
            self.resolve_inner(owner, reference, path, scope, ctx)
        })
    }
    fn frame_inner(
        &self,
        owner: &CompiledSchema,
        schema: &Value,
        path: &Utf16,
        id_applied: bool,
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
            if std::ptr::eq(plan.target.get(owner, ctx)?, schema) {
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
        let target = NodeLocator::locate(owner, schema, ctx)?;
        ctx.charge_work(2, Utf16::default())?;
        let plan = Arc::new(ReferencePlan {
            limits: ctx.limits(),
            target,
            path: normalized.into_shared(),
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
        path: &Utf16,
        compiler: bool,
        ctx: &mut Context<'_>,
    ) -> Result<Option<Arc<NodePlan>>, EngineError> {
        let Value::Object(members) = schema else {
            return Ok(None);
        };
        let count = self.nodes.lock().unwrap_or_else(|e| e.into_inner()).len();
        ctx.charge_work_u64(
            (path.len() as u64 + 1).saturating_mul(tree_compare_bound(count).saturating_add(1)),
            Utf16::default(),
        )?;
        let key = (path.clone(), compiler);
        let prior = match read_plan(&self.nodes, &key, count) {
            Ok(plan) => plan,
            Err(()) => {
                return Ok(None);
            }
        };
        if let Some(plan) = prior.filter(|p| p.limits == ctx.limits()) {
            // Diagnostic spelling alone is not node identity: anchor aliases
            // may share that spelling. The structural locator must still name
            // THIS borrowed immutable node before any metadata can be reused.
            if std::ptr::eq(plan.locator.get(owner, ctx)?, schema) {
                return Ok(Some(plan));
            }
            return Ok(None);
        }
        if count >= ctx.limits().max_values {
            return Ok(None);
        }
        let locator = NodeLocator::locate(owner, schema, ctx)?;
        ctx.charge_work(
            members.len().saturating_mul(if compiler { 130 } else { 1 }),
            Utf16::default(),
        )?;
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
        let plan = Arc::new(NodePlan {
            limits: ctx.limits(),
            locator,
            keywords,
            compiler_order: order,
            has_ref,
        });
        ctx.charge_work_u64(
            (path.len() as u64 + 1)
                .saturating_mul(tree_compare_bound(count))
                .saturating_add(1),
            Utf16::default(),
        )?;
        publish_plan(&self.nodes, count, key, Arc::clone(&plan));
        Ok(Some(plan))
    }
    fn resolve_eval_inner<'a>(
        &self,
        owner: &'a CompiledSchema,
        reference: &Value,
        path: &Utf16,
        ctx: &mut Context<'_>,
    ) -> Result<(&'a Value, Utf16, bool), EngineError> {
        let Value::String(text) = reference else {
            return owner.resolve_eval_ref_unplanned(reference, path, ctx);
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
                return owner.resolve_eval_ref_unplanned(reference, path, ctx);
            }
        };
        if let Some(plan) = prior.filter(|p| p.limits == ctx.limits()) {
            return Ok((
                plan.target.get(owner, ctx)?,
                plan.path.clone(),
                plan.id_applied,
            ));
        }
        let (target, target_path, id_applied) =
            owner.resolve_eval_ref_unplanned(reference, path, ctx)?;
        let locator = NodeLocator::locate(owner, target, ctx)?;
        if count >= ctx.limits().max_values {
            return Ok((target, target_path, id_applied));
        }
        ctx.charge_work(2, Utf16::default())?;
        let plan = Arc::new(ReferencePlan {
            limits: ctx.limits(),
            target: locator,
            path: target_path.into_shared(),
            id_applied,
        });
        ctx.charge_work_u64(
            (work as u64)
                .saturating_mul(tree_compare_bound(count))
                .saturating_add(1),
            Utf16::default(),
        )?;
        publish_plan(&self.evaluations, count, key, Arc::clone(&plan));
        Ok((target, plan.path.clone(), id_applied))
    }
    fn resolve_inner<'a>(
        &self,
        owner: &'a CompiledSchema,
        reference: &Value,
        path: &Utf16,
        scope: Option<&str>,
        ctx: &mut Context<'_>,
    ) -> Result<(&'a Value, Utf16), EngineError> {
        let Value::String(text) = reference else {
            return owner.resolve_ref_unplanned(reference, path, scope, ctx);
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
                return owner.resolve_ref_unplanned(reference, path, scope, ctx);
            }
        };
        if let Some(plan) = prior.filter(|p| p.limits == ctx.limits()) {
            return Ok((plan.target.get(owner, ctx)?, plan.path.clone()));
        }
        let (target, target_path) = owner.resolve_ref_unplanned(reference, path, scope, ctx)?;
        if count >= ctx.limits().max_values {
            return Ok((target, target_path));
        }
        let locator = NodeLocator::locate(owner, target, ctx)?;
        ctx.charge_work(2, Utf16::default())?;
        let plan = Arc::new(ReferencePlan {
            limits: ctx.limits(),
            target: locator,
            path: target_path.into_shared(),
            id_applied: false,
        });
        ctx.charge_work_u64(
            tree_compare_bound(count)
                .saturating_mul(key_work as u64)
                .saturating_add(1),
            Utf16::default(),
        )?;
        publish_plan(&self.references, count, key, Arc::clone(&plan));
        Ok((target, plan.path.clone()))
    }
}

// Invocation-local path arena. It retains no instance or caller object and is
// dropped/restored at the complete evaluator boundary, including unwind.
#[derive(Default)]
pub(crate) struct EvaluationPaths {
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

#[cfg(test)]
#[path = "schema_owned_plan_tests.rs"]
mod tests;

#[cfg(test)]
#[path = "schema_owned_plan_independent_tests.rs"]
mod independent_tests;
