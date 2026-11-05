// SPDX-License-Identifier: MIT OR Apache-2.0
use crate::{
    context::Context,
    error::{EngineError, PythonSchemaTerminal},
    python_regex::{PythonReVersion, PythonRegex},
    python_value::{
        instances_equal, value_equals_instance, InstanceKind, InstanceNumber, InstanceText,
        InstanceView,
    },
    value::{copy_json, Utf16, Value},
};
use num_traits::ToPrimitive;
use std::{
    collections::BTreeSet,
    sync::{Arc, Mutex},
};

#[derive(Clone, Debug, PartialEq)]
pub struct StructuralError {
    pub instance_path: Utf16,
    pub python_source_path: bool,
    pub schema_path: Utf16,
    pub keyword: String,
    pub params: Value,
    pub message: Utf16,
    /// Original property name on compiler-mode propertyNames child errors.
    pub compiler_property_name: Option<Utf16>,
    pub python_params: Option<std::sync::Arc<crate::python_value::PythonConsumerValue>>,
    pub python_error: Option<PythonErrorMetadata>,
    pub python_physical_instance_path: Option<Utf16>,
    pub python_instance_override: Option<std::sync::Arc<crate::python_value::PythonConsumerValue>>,
}
#[derive(Clone, Debug, PartialEq)]
pub struct PythonErrorMetadata {
    pub validator: Option<crate::python_value::PyText>,
    pub validator_value: std::sync::Arc<crate::python_value::PythonConsumerValue>,
}
#[derive(Clone, Debug, Default, PartialEq)]
pub struct SchemaResources {
    pub entries: Vec<(Utf16, Value)>,
}
#[derive(Clone, Debug)]
enum SchemaBacking { Owned(SchemaResources), Shared(Arc<SchemaResources>) }
impl std::ops::Deref for SchemaBacking {
    type Target = SchemaResources;
    fn deref(&self) -> &SchemaResources { match self { Self::Owned(v) => v, Self::Shared(v) => v } }
}
impl SchemaBacking {
    fn shares(&self, other: &Arc<SchemaResources>) -> bool {
        matches!(self, Self::Shared(value) if Arc::ptr_eq(value, other))
    }
}

// OC1 immutable input custody, NOT schema/meta/ref/Registry success.
// The only mint is a completed Engine with its actual admitted Core bank.
#[doc(hidden)]
pub struct CodegenCatalogue {
    bank: Arc<admitted_bank::SchemaBank>,
    extension: Vec<(Utf16,Value)>,
    limits: crate::context::Limits,
    profile: crate::context::ResourceProfile,
    memo: Mutex<CodegenCatalogueMemo>,
}
struct CodegenCatalogueMemo { epoch:u64, completed:Option<(SchemaDialect,Arc<SchemaResources>)> }
fn catalogue_words<T>()->usize{std::mem::size_of::<T>().div_ceil(std::mem::size_of::<usize>())}
#[cfg(test)]
thread_local!{static CODEGEN_CATALOGUE_OBSERVER:std::cell::RefCell<Option<Box<dyn FnMut(&'static str,usize)>>>=std::cell::RefCell::new(None);}
#[cfg(test)]
fn observe_codegen_catalogue<T>(observer:Box<dyn FnMut(&'static str,usize)>,operation:impl FnOnce()->T)->T{
    struct Restore(Option<Box<dyn FnMut(&'static str,usize)>>);
    impl Drop for Restore{fn drop(&mut self){CODEGEN_CATALOGUE_OBSERVER.with(|s|*s.borrow_mut()=self.0.take());}}
    let prior=CODEGEN_CATALOGUE_OBSERVER.with(|s|s.borrow_mut().replace(observer));let _restore=Restore(prior);operation()
}
fn codegen_catalogue_event(event:&'static str,count:usize){
    #[cfg(test)]
    {let observer=CODEGEN_CATALOGUE_OBSERVER.with(|s|s.borrow_mut().take());if let Some(observer)=observer{
        struct Restore(Option<Box<dyn FnMut(&'static str,usize)>>);
        impl Drop for Restore{fn drop(&mut self){CODEGEN_CATALOGUE_OBSERVER.with(|s|*s.borrow_mut()=self.0.take());}}
        let mut restore=Restore(Some(observer));if let Some(observer)=restore.0.as_mut(){observer(event,count);}
    }}
    #[cfg(not(test))]let _=(event,count);
}
impl CodegenCatalogue {
    #[cfg(test)]
    fn profile_snapshot_for_test(&self)->(u64,Option<SchemaDialect>,usize){
        let memo=self.memo.lock().unwrap_or_else(|e|e.into_inner());
        (memo.epoch,memo.completed.as_ref().map(|(d,_)|*d),memo.completed.as_ref().map_or(0,|(_,v)|v.entries.len()))
    }
    pub(crate) fn from_engine(owners:[&CompiledSchema;3],resources:&Arc<crate::engine::ResourceSet>,ctx:&mut Context<'_>)->Result<Option<Self>,EngineError>{
        ctx.charge_work(catalogue_words::<Self>()+catalogue_words::<crate::context::Limits>()+18,Utf16::default())?;
        let Some(bank)=&owners[0].resource_bank else{return Ok(None);};
        if ctx.profile()!=crate::context::ResourceProfile::Cooperative || !bank.input_compatible(ctx)? || !bank.owns_core(resources,ctx)? {return Ok(None);}
        for (ordinal,owner) in owners.iter().enumerate(){
            ctx.charge_work(12,Utf16::default())?;
            if !owner.strict || !owner.resolve_references_at_compile || !matches!(owner.regex_profile,RegexProfile::Ecma262Unicode) || owner.root_keyword_policy!=KeywordPolicy::DRAFT2020 {return Ok(None);}
            let (Some(actual),SchemaRoot::Bank(root,admitted_bank::BankRoot::Core(role)))=(&owner.resource_bank,&owner.schema)else{return Ok(None);};
            if !Arc::ptr_eq(actual,bank)||!Arc::ptr_eq(root,bank)||*role!=ordinal{return Ok(None);}
        }
        // Bank rows must be the exact original Engine export sequence, not a
        // caller-provided catalogue or an inferred equal-content identity.
        if !bank.unique_retrievals(ctx)? {return Ok(None);}
        #[cfg(test)] codegen_catalogue_event("oc1-engine-mint",bank.len());
        Ok(Some(Self{bank:Arc::clone(bank),extension:Vec::new(),limits:ctx.limits(),profile:ctx.profile(),memo:Mutex::new(CodegenCatalogueMemo{epoch:0,completed:None})}))
    }
    fn compatible(&self,ctx:&mut Context<'_>)->Result<bool,EngineError>{
        ctx.charge_work(catalogue_words::<crate::context::Limits>()+4,Utf16::default())?;
        Ok(self.limits==ctx.limits()&&self.profile==ctx.profile()&&self.bank.input_compatible(ctx)?)
    }
    fn len(&self)->usize{self.bank.len()+self.extension.len()}
    fn get(&self,index:usize)->Option<(&Utf16,&Value)>{
        if index<self.bank.len(){self.bank.get(index)}else{self.extension.get(index-self.bank.len()).map(|(id,v)|(id,v))}
    }
    #[doc(hidden)]
    pub fn with_tables_schema(mut self,tables_schema:&Value,ctx:&mut Context<'_>)->Result<Option<Self>,EngineError>{
        ctx.charge_work(catalogue_words::<Self>()+8,Utf16::default())?;
        let mut id=None;
        if let Value::Object(fields)=tables_schema{for(key,value)in fields{
            ctx.charge_work(key.len().min(3).saturating_add(1),Utf16::default())?;
            if key.units()==[36,105,100]{if let Value::String(value)=value{id=Some(value);}break;}
        }}
        let id=id.ok_or_else(||EngineError::new("CODEGEN_RESOURCE_INVALID",Utf16::default(),"Tables schema requires an $id"))?;
        let count=self.len();
        ctx.charge_work(count,Utf16::default())?;
        let mut present=false;
        for index in 0..count{
            ctx.charge_work(8,Utf16::default())?;
            let (existing,_)=self.get(index).expect("private ordered catalogue");
            ctx.charge_work(existing.len(),Utf16::default())?;present|=existing==id;
        }
        if present{return Ok(Some(self));}
        // The public materialized table copy is retained. This additional
        // immutable extension copy is real, full and separately charged.
        #[cfg(test)] codegen_catalogue_event("oc1-extension-copy-route",self.len());
        let value=copy_json(tables_schema,ctx)?;
        let words=catalogue_words::<(Utf16,Value)>();
        if self.extension.len()==self.extension.capacity(){
            let Some(wanted)=self.extension.len().checked_add(1)else{return Ok(None);};
            ctx.charge_work(self.extension.len().saturating_add(wanted).saturating_mul(words),Utf16::default())?;
            #[cfg(test)] codegen_catalogue_event("oc1-extension-reserve",wanted);
            if self.extension.try_reserve_exact(1).is_err(){return Ok(None);}
        }
        ctx.charge_work(id.clone_work().saturating_add(words).saturating_add(catalogue_words::<CodegenCatalogueMemo>()).saturating_add(8),Utf16::default())?;
        #[cfg(test)] codegen_catalogue_event("oc1-extension-publication",self.len()+1);
        self.extension.push((id.clone(),value));
        // Consuming self gives exclusive mutation; no lock/control overlap.
        let memo=self.memo.get_mut().unwrap_or_else(|e|e.into_inner());memo.completed=None;memo.epoch=memo.epoch.saturating_add(1);
        Ok(Some(self))
    }
    fn completed(&self,dialect:SchemaDialect,ctx:&mut Context<'_>)->Result<(u64,Option<Arc<SchemaResources>>),EngineError>{
        ctx.charge_work(catalogue_words::<CodegenCatalogueMemo>()+catalogue_words::<crate::context::Limits>()+12,Utf16::default())?;
        if !self.compatible(ctx)?{return Ok((u64::MAX,None));}
        // No controls while the mutex is held; the return Arc clone is prepaid.
        let memo=self.memo.lock().unwrap_or_else(|e|e.into_inner());
        let prior=memo.completed.as_ref().filter(|(d,_)|*d==dialect).map(|(_,v)|Arc::clone(v));let epoch=memo.epoch;drop(memo);
        #[cfg(test)] if prior.is_some(){codegen_catalogue_event("oc1-completed-profile-hit",self.len());}
        Ok((epoch,prior))
    }
    fn publish_completed(&self,epoch:u64,dialect:SchemaDialect,resources:&SchemaBacking,ctx:&mut Context<'_>)->Result<(),EngineError>{
        let SchemaBacking::Shared(resources)=resources else{return Ok(());};
        ctx.charge_work(2*catalogue_words::<CodegenCatalogueMemo>()+catalogue_words::<crate::context::Limits>()+12,Utf16::default())?;
        if epoch==u64::MAX || !self.compatible(ctx)?{return Ok(());}
        #[cfg(test)] codegen_catalogue_event("oc1-profile-publication-attempt",self.len());
        let mut memo=self.memo.lock().unwrap_or_else(|e|e.into_inner());
        if memo.epoch==epoch {if let Some(next)=epoch.checked_add(1){memo.completed=Some((dialect,Arc::clone(resources)));memo.epoch=next;}}
        Ok(())
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SchemaDialect {
    Draft3,
    Draft4,
    Draft6,
    Draft7,
    Draft2019_09,
    Draft2020_12,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct KeywordPolicy {
    applicator: bool,
    validation: bool,
    unevaluated: bool,
    custom: bool,
}
impl KeywordPolicy {
    const DRAFT2020: Self = Self {
        applicator: true,
        validation: true,
        unevaluated: true,
        custom: false,
    };
    fn keyword_is_active(self, keyword: &str) -> bool {
        if is_validation_vocabulary_keyword(keyword) {
            self.validation
        } else if is_unevaluated_vocabulary_keyword(keyword) {
            self.unevaluated
        } else if is_applicator_vocabulary_keyword(keyword) {
            self.applicator
        } else {
            true
        }
    }
}
impl Default for KeywordPolicy {
    fn default() -> Self {
        Self::DRAFT2020
    }
}
#[path = "schema_construction_index.rs"]
mod construction_index;
use construction_index::ColdResourceIndex;
#[path = "schema_owned_plans.rs"]
pub(crate) mod owned_plans;
use owned_plans::{OwnerPlans, EvaluationPaths, EvaluationPathPair, PathKind};
#[path = "schema_owner_locations.rs"]
mod owner_locations;
use owner_locations::{OwnerCursor, OwnerLocations};
#[path="schema_admitted_bank.rs"]
pub(crate) mod admitted_bank;
#[path="schema_admitted_structure.rs"]
pub(crate) mod admitted_structure;
#[path="schema_metas_utf16.rs"]
mod schema_metas_utf16;
#[path = "schema_annotation_delta.rs"]
mod annotation_delta;
use annotation_delta::PropertyDelta;

// An owned root may select an already admitted immutable catalogue member.
// The catalogue Arc and structural ordinal survive moves; no raw address is
// retained as admission authority. Legacy/Python snapshots remain owned Values.
#[derive(Clone, Debug)]
enum SchemaRoot {
    Owned(Value),
    Catalogue(Arc<SchemaResources>, usize),
    Shared(Arc<Value>),
    Bank(Arc<admitted_bank::SchemaBank>,admitted_bank::BankRoot),
}
impl std::ops::Deref for SchemaRoot {
    type Target = Value;
    fn deref(&self) -> &Value {
        match self {
            Self::Owned(value) => value,
            Self::Catalogue(owner, ordinal) => &owner.entries[*ordinal].1,
            Self::Shared(value) => value,
            Self::Bank(bank,role) => bank.root(*role),
        }
    }
}
impl SchemaRoot {
    fn same_anchor_free_role(schema:&Value,retrieval:&Utf16,ctx:&mut Context<'_>)->Result<bool,EngineError> {
        let authored=match construction_index::get_ascii_metered(schema,"$id",ctx,&Utf16::default())? {
            some@Some(_)=>some,None=>construction_index::get_ascii_metered(schema,"id",ctx,&Utf16::default())?,
        };
        let Some(Value::String(authored))=authored else {return Ok(false);};
        ctx.charge_work(authored.len().saturating_mul(2).saturating_add(retrieval.len()).saturating_add(1),Utf16::default())?;
        if authored!=retrieval || !authored.units().contains(&58) || authored.units().iter().any(|u|*u>127 || *u==35) {return Ok(false);}
        fn visit(value:&Value,depth:usize,count:&mut usize,ctx:&mut Context<'_>)->Result<bool,EngineError> {
            ctx.charge_work(1,Utf16::default())?;*count=count.saturating_add(1);
            if depth>ctx.limits().max_depth || *count>ctx.limits().max_values {return Ok(false);}
            match value {
                Value::Object(members)=>for (key,child) in members {
                    ctx.charge_work(key.len().min(17).saturating_mul(2).saturating_add(1),Utf16::default())?;
                    // Physical identity is still used by the qualified dynamic
                    // scope. Keep separate root/catalogue backing whenever a
                    // raw anchor could make those roles observable. This is
                    // conservative fallback, not validation of opaque content.
                    if construction_index::ascii_key_for_owner(key,"$dynamicAnchor") || construction_index::ascii_key_for_owner(key,"$recursiveAnchor") {return Ok(false);}
                    if depth!=0 && matches!(child,Value::String(_)) && (construction_index::ascii_key_for_owner(key,"$id") || construction_index::ascii_key_for_owner(key,"id")) {return Ok(false);}
                    if !visit(child,depth+1,count,ctx)? {return Ok(false);}
                },
                Value::Array(items)=>for child in items {if !visit(child,depth+1,count,ctx)? {return Ok(false);}},
                _=>{},
            }
            Ok(true)
        }
        visit(schema,0,&mut 0,ctx)
    }
    fn publish(value: Value, shared: bool, ctx: &mut Context<'_>) -> Result<Self, EngineError> {
        if shared {
            ctx.charge_work(1, Utf16::default())?;
            Ok(Self::Shared(Arc::new(value)))
        } else { Ok(Self::Owned(value)) }
    }
}

#[derive(Debug)]
pub struct CompiledSchema {
    schema: SchemaRoot,
    resources: SchemaBacking,
    resource_bank: Option<Arc<admitted_bank::SchemaBank>>,
    cold_resource_index: Option<Arc<ColdResourceIndex>>,
    owner_plans: Option<Arc<OwnerPlans>>,
    // Private owned-lineage capability: minted only after real admission;
    // completed construction copies share it only after full eligibility/equality.
    owner_lineage: Option<Arc<()>>,
    owner_locations: Option<Arc<OwnerLocations>>,
    dialect: SchemaDialect,
    strict: bool,
    root_keyword_policy: KeywordPolicy,
    regex_profile: RegexProfile,
    resolve_references_at_compile: bool,
    /// Original Python code-point text keyed by projected schema pointer.
    python_text_origins: std::collections::BTreeMap<Vec<u16>, crate::python_value::PyText>,
    python_member_keys: std::collections::BTreeMap<(Vec<u16>, usize), crate::python_value::PyText>,
    python_source_strings: std::collections::BTreeMap<usize, crate::python_value::PyText>,
    python_source_keys: std::collections::BTreeMap<usize, crate::python_value::PyText>,
    python_exact_values:
        std::collections::BTreeMap<usize, std::sync::Arc<crate::python_value::PythonConsumerValue>>,
    python_reference_targets: std::collections::BTreeMap<usize, PythonReferenceTarget>,
    python_resource_roots: std::collections::BTreeMap<usize, PythonResourceLocator>,
    dynamic_anchor_cache:
        Mutex<std::collections::BTreeMap<usize, Arc<Vec<(Vec<u16>, Utf16, usize)>>>>,
}

// The dynamic-anchor cache contains addresses into `schema` and `resources`.
// A clone owns freshly copied values, so it must start with an empty cache.
impl Clone for CompiledSchema {
    fn clone(&self) -> Self {
        Self {
            schema: self.schema.clone(),
            cold_resource_index: None,
            owner_plans: None,
            owner_lineage: None,
            owner_locations: None,
            resources: self.resources.clone(),
            resource_bank: self.resource_bank.clone(),
            dialect: self.dialect,
            strict: self.strict,
            root_keyword_policy: self.root_keyword_policy,
            regex_profile: self.regex_profile,
            resolve_references_at_compile: self.resolve_references_at_compile,
            python_text_origins: self.python_text_origins.clone(),
            python_member_keys: self.python_member_keys.clone(),
            python_source_strings: self.python_source_strings.clone(),
            python_source_keys: self.python_source_keys.clone(),
            python_exact_values: self.python_exact_values.clone(),
            python_reference_targets: self.python_reference_targets.clone(),
            python_resource_roots: self.python_resource_roots.clone(),
            dynamic_anchor_cache: Mutex::new(std::collections::BTreeMap::new()),
        }
    }
}


/// Private completed proofs, owned only by one explicit cold construction.
/// No caller-supplied token/hash or ambient process state participates.
#[derive(Default)]
pub(crate) struct ConstructionState {
    catalogues: Vec<(crate::context::Limits, Arc<SchemaResources>)>,
    completed: Vec<(crate::context::Limits, Arc<CompiledSchema>)>,
    metas: Option<(crate::context::Limits, Arc<Value>)>,
    parsed_metas:Option<Arc<crate::serialization::CompletedOwnedJson>>,
    meta_validators: Vec<(crate::context::Limits, SchemaDialect, Arc<CompiledSchema>)>,
    lifetime: Option<Arc<()>>,
}

impl ConstructionState {
    pub(crate) fn has_lifetime(&self, lifetime: &Arc<()>) -> bool {
        self.lifetime.as_ref().is_some_and(|token| Arc::ptr_eq(token, lifetime))
    }
}

#[cfg(test)]
mod preflight_reference_observation {
    use super::*;
    type Observer = Box<dyn FnMut(&Value, &Utf16, &str, &Result<(&Value, Utf16), EngineError>)>;
    std::thread_local! {
        static CURRENT: std::cell::RefCell<Option<Observer>> = std::cell::RefCell::new(None);
    }
    struct Restore(Option<Observer>);
    impl Drop for Restore {
        fn drop(&mut self) {
            CURRENT.with(|slot| { slot.replace(self.0.take()); });
        }
    }
    /// Test-only scoped readback of genuine call inputs and borrowed result.
    /// No Context, authority token, result replacement or production flag.
    pub(super) fn with_observer<T>(observer: Observer, operation: impl FnOnce() -> T) -> T {
        let prior = CURRENT.with(|slot| slot.replace(Some(observer)));
        let _restore = Restore(prior);
        operation()
    }
    pub(super) fn emit(reference: &Value, path: &Utf16, scope: &str,
        result: &Result<(&Value, Utf16), EngineError>) {
        // Take ownership before invocation. Nested/reentrant observation cannot
        // borrow this slot or create another Context/host-control notification.
        let observer = CURRENT.with(|slot| slot.take());
        let mut restore = Restore(observer);
        if let Some(observer) = restore.0.as_mut() { observer(reference, path, scope, result); }
    }
}

// Ordered, bit-preserving structural identity. Semantic object equality or a
// matching root ID alone is insufficient for admission/provenance reuse.
fn construction_equal(a: &Value, b: &Value, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
        ctx.with_constructor_site("ctor.proof-lookup", |ctx| {
    ctx.charge_work(1, Utf16::default())?;
    Ok(match (a, b) {
        (Value::Null, Value::Null) => true,
        (Value::Bool(a), Value::Bool(b)) => a == b,
        (Value::Number(a), Value::Number(b)) => a.to_bits() == b.to_bits(),
        (Value::String(a), Value::String(b)) => {
            ctx.charge_work(a.len().min(b.len()), Utf16::default())?; a == b
        }
        (Value::Array(a), Value::Array(b)) => {
            if a.len() != b.len() { return Ok(false); }
            for (a,b) in a.iter().zip(b) { if !construction_equal(a,b,ctx)? { return Ok(false); } }
            true
        }
        (Value::Object(a), Value::Object(b)) => {
            if a.len() != b.len() { return Ok(false); }
            for ((ak,av),(bk,bv)) in a.iter().zip(b) {
                ctx.charge_work(ak.len().min(bk.len()), Utf16::default())?;
                if ak != bk || !construction_equal(av,bv,ctx)? { return Ok(false); }
            }
            true
        }
        _ => false,
    })

        })
    }

fn construction_catalogue(resources: &SchemaResources, ctx: &mut Context<'_>) -> Result<Option<Arc<SchemaResources>>, EngineError> {
    construction_catalogue_view(admitted_bank::Catalogue::Borrowed(&resources.entries),ctx)
}
fn construction_catalogue_view(resources: admitted_bank::Catalogue<'_>, ctx: &mut Context<'_>) -> Result<Option<Arc<SchemaResources>>, EngineError> {
        ctx.with_constructor_site("ctor.proof-lookup", |ctx| {
    let Some(state) = ctx.schema_construction.clone() else { return Ok(None); };
    let count = state.borrow().catalogues.len();
    ctx.charge_work(count, Utf16::default())?;
    let candidates = state.borrow().catalogues.clone();
    for (limits, candidate) in candidates {
        if limits != ctx.limits() || candidate.entries.len() != resources.len_with_context(ctx)? { continue; }
        let mut equal = true;
        for (index,(aid,av)) in candidate.entries.iter().enumerate() {
            let(bid,bv)=resources.get_with_context(index,ctx)?.expect("same ordered catalogue extent");
            ctx.charge_work(aid.len().min(bid.len()), Utf16::default())?;
            if aid != bid || !construction_equal(av,bv,ctx)? { equal = false; break; }
        }
        if equal { ctx.charge_work(1, Utf16::default())?; return Ok(Some(candidate)); }
    }
    Ok(None)

        })
    }

impl CompiledSchema {
    pub(crate) fn catalogue_entries(&self)->admitted_bank::Catalogue<'_> {
        match &self.resource_bank {Some(bank)=>admitted_bank::Catalogue::Bank(bank),None=>admitted_bank::Catalogue::Borrowed(&self.resources.entries)}
    }
    // Only ordinary strict compilation is eligible. Every other origin,
    // keyword, regex, reference or duplicate/numeric policy retains its full
    // original operation; no partial policy key can accidentally match it.
    fn construction_copy(&self, schema: SchemaRoot, ctx: &mut Context<'_>) -> Result<Self, EngineError> {
        ctx.charge_work(1, Utf16::default())?;
        if self.owner_locations.is_some(){ctx.charge_work(1,Utf16::default())?;}
        if self.resource_bank.is_some(){ctx.charge_work(1,Utf16::default())?;}
        Ok(Self { schema, cold_resource_index: self.cold_resource_index.clone(), owner_plans: self.owner_plans.clone(), owner_lineage:self.owner_lineage.clone(), owner_locations:self.owner_locations.clone(), resources: self.resources.clone(), resource_bank:self.resource_bank.clone(), dialect: self.dialect,
            strict: self.strict, root_keyword_policy: self.root_keyword_policy,
            regex_profile: self.regex_profile, resolve_references_at_compile: self.resolve_references_at_compile,
            python_text_origins: Default::default(), python_member_keys: Default::default(),
            python_source_strings: Default::default(), python_source_keys: Default::default(),
            python_exact_values: Default::default(), python_reference_targets: Default::default(),
            python_resource_roots: Default::default(), dynamic_anchor_cache: Mutex::new(Default::default()) })
    }
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub(crate) enum EvaluationMode {
    #[default]
    AllErrors,
    FirstError,
}

pub(crate) struct EvaluationOutcome {
    pub errors: Vec<StructuralError>,
    pub terminal_error: Option<EngineError>,
}

#[derive(Clone, Debug)]
struct PythonReferenceTarget {
    resource: Option<usize>,
    /// Pointer from the supplied tree root to the nearest recognized schema
    /// resource base. A reference fragment is resolved from this base.
    resource_root_indices: Vec<usize>,
    source_resource_uri: Option<PythonResourceUri>,
    source_resource_recursive_anchor: bool,
    indices: Vec<usize>,
    failure: Option<PythonReferenceFailure>,
}

/// Python resource identity remains in native codepoints. Diagnostic UTF-16
/// is a one-way display boundary and is never used for scope equality/lookup.
#[derive(Clone, Debug, Default, Eq, PartialEq)]
struct PythonResourceUri(Vec<u32>);
impl PythonResourceUri {
    fn from_points(points: &[u32], ctx: &mut Context<'_>) -> Result<Self, EngineError> {
        ctx.charge_work_u64(points.len() as u64 + 1, Utf16::default())?;
        Ok(Self(points.to_vec()))
    }
    fn len(&self) -> usize {
        self.0.len()
    }
    fn is_empty(&self) -> bool {
        self.0.is_empty()
    }
    fn points(&self) -> &[u32] {
        &self.0
    }
    fn same(&self, other: &Self, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
        ctx.charge_work_u64(self.len().min(other.len()) as u64 + 1, Utf16::default())?;
        Ok(self == other)
    }
    fn display_path(&self, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
        ctx.charge_work_u64(
            (self.len() as u64).saturating_mul(2).saturating_add(1),
            Utf16::default(),
        )?;
        let mut units = Vec::with_capacity(self.len().saturating_mul(2).saturating_add(1));
        for point in &self.0 {
            if *point <= u16::MAX as u32 {
                units.push(*point as u16);
            } else if let Some(character) = char::from_u32(*point) {
                let mut buffer = [0u16; 2];
                units.extend_from_slice(character.encode_utf16(&mut buffer));
            } else {
                return Err(schema_error(
                    &Utf16::default(),
                    "Invalid Python URI codepoint",
                ));
            }
        }
        units.push(b'#' as u16);
        Ok(Utf16::new(units))
    }
    fn join(&self, reference: &Self, ctx: &mut Context<'_>) -> Result<Option<Self>, EngineError> {
        ctx.charge_work_u64(
            (self.len() as u64)
                .saturating_add(reference.len() as u64)
                .saturating_mul(40)
                .saturating_add(100),
            Utf16::default(),
        )?;
        Ok(resolve_relative_python_uri(self.points(), reference.points()).map(Self))
    }
}
#[derive(Clone, Debug)]
struct PythonResourceLocator {
    uri: PythonResourceUri,
    resource: Option<usize>,
    root_indices: Vec<usize>,
    recursive_anchor: bool,
}

#[derive(Clone, Copy, Debug)]
enum PythonReferenceFailure {
    InvalidArrayIndex,
    InvalidTraversal,
    Unresolved,
}

#[derive(Clone, Copy, Debug)]
enum RegexProfile {
    Ecma262Unicode,
    Python(PythonReVersion),
}
enum CompiledRegex {
    Ecma(regress::Regex),
    Python(PythonRegex),
}

fn compiler_object_order<T: InstanceView>(
    data: &T,
    count: usize,
    ctx: &mut Context<'_>,
) -> Result<Vec<usize>, EngineError> {
    ctx.charge_work(count.saturating_mul(64), Utf16::default())?;
    let mut indices = std::collections::BTreeMap::new();
    let mut ordinary = Vec::with_capacity(count);
    for index in 0..count {
        ctx.charge_work(1, Utf16::default())?;
        let Some((name, _)) = data.object_entry(index) else {
            continue;
        };
        let numeric = match name {
            InstanceText::Utf16(name) => {
                let units = name.units();
                let mut number = 0u64;
                let valid = !units.is_empty()
                    && units.len() <= 10
                    && (units.len() == 1 || units[0] != 48)
                    && units.iter().all(|u| {
                        if !(48..=57).contains(u) {
                            return false;
                        }
                        number = number * 10 + u64::from(*u - 48);
                        true
                    });
                if valid && number < u64::from(u32::MAX) {
                    Some(number as u32)
                } else {
                    None
                }
            }
            _ => None,
        };
        if let Some(number) = numeric {
            indices.insert(number, index);
        } else {
            ordinary.push(index);
        }
    }
    let mut ordered = Vec::with_capacity(count);
    ordered.extend(indices.into_values());
    ordered.extend(ordinary);
    Ok(ordered)
}

// Source: pinned Ajv 8.20 groups plus createValidator/installJsonEquality.
// The custom const/enum/uniqueItems rules are re-added after their groups'
// standard rules. Metadata and unknown inert keywords have no error phase.
fn compiler_keyword_rank(key: &Utf16) -> usize {
    const ORDER: &[&str] = &[
        "type",
        "$dynamicRef",
        "$recursiveRef",
        "$ref",
        "not",
        "anyOf",
        "oneOf",
        "allOf",
        "if",
        "then",
        "else",
        "const",
        "enum",
        "maximum",
        "minimum",
        "exclusiveMaximum",
        "exclusiveMinimum",
        "multipleOf",
        "maxLength",
        "minLength",
        "pattern",
        "format",
        "maxItems",
        "minItems",
        "additionalItems",
        "prefixItems",
        "items",
        "contains",
        "minContains",
        "maxContains",
        "unevaluatedItems",
        "uniqueItems",
        "maxProperties",
        "minProperties",
        "required",
        "propertyNames",
        "additionalProperties",
        "dependencies",
        "properties",
        "patternProperties",
        "dependentRequired",
        "dependentSchemas",
        "unevaluatedProperties",
    ];
    ORDER
        .iter()
        .position(|name| {
            key.len() == name.len() && key.units().iter().copied().eq(name.encode_utf16())
        })
        .unwrap_or(usize::MAX)
}

#[path = "schema_evaluation_scope.rs"]
mod evaluation_scope;
use evaluation_scope::{DynamicScope, EvaluationScope};

#[derive(Clone, Debug, Default)]
struct Evaluated {
    properties: BTreeSet<Vec<u32>>,
    property_delta: Option<PropertyDelta>,
    items: BTreeSet<usize>,
    dynamic_scope: DynamicScope,
    resolved_resource: Option<usize>,
    schema_cursor: Option<OwnerCursor>,
    selected_cursor: Option<OwnerCursor>,
    /// Python Draft 2019-09 resolver history. Each evaluator branch owns its
    /// snapshot; a reference lookup updates only the descended resolver.
    python_recursive_history: Vec<PythonResourceLocator>,
    mode: EvaluationMode,
    collect_annotations: bool,
    /// Opt-in compiler diagnostic presentation; ordinary/Python validation
    /// retains its qualified aggregate combinator behavior.
    codegen_errors: bool,
    annotation_scan: bool,
    annotation_scan_short_circuit: bool,
    keyword_policy: KeywordPolicy,
}
impl Evaluated {
    fn child(&self, ctx: &mut Context<'_>, path: &Utf16) -> Result<Self, EngineError> {
        ctx.charge_work(path.len(), Utf16::default())?;
        for entry in &self.python_recursive_history {
            ctx.charge_work_u64(
                entry.uri.len() as u64 + entry.root_indices.len() as u64 + 2,
                Utf16::default(),
            )?;
        }
        if self.dynamic_scope.is_shared() {
            ctx.charge_work(1, Utf16::default())?;
        } else {
            for (name, scope, _) in &self.dynamic_scope {
                ctx.charge_work(1, Utf16::default())?;
                ctx.charge_work_u64(name.len() as u64 + scope.len() as u64 + 2, Utf16::default())?;
            }
        }
        let schema_cursor=clone_owner_cursor(self.schema_cursor.as_ref(),ctx)?;
        let selected_cursor=clone_owner_cursor(self.selected_cursor.as_ref(),ctx)?;
        let property_delta = match &self.property_delta { Some(delta)=>Some(delta.child(ctx)?),None=>None };
        Ok(Self {
            schema_cursor,selected_cursor,
            property_delta,
            dynamic_scope: self.dynamic_scope.clone(),
            resolved_resource: self.resolved_resource,
            python_recursive_history: self.python_recursive_history.clone(),
            mode: self.mode,
            collect_annotations: self.collect_annotations,
            codegen_errors: self.codegen_errors,
            keyword_policy: self.keyword_policy,
            ..Self::default()
        })
    }
    fn merge(
        &mut self,
        other: Self,
        ctx: &mut Context<'_>,
        path: &Utf16,
    ) -> Result<(), EngineError> {
        ctx.charge_work(path.len(), Utf16::default())?;
        if let Some(delta)=other.property_delta {
            if let Some(own)=&mut self.property_delta { own.merge(delta,ctx)?; }
            else { return Err(schema_error(path,"Annotation delta lost its immutable invocation owner")); }
        }
        for name in other.properties {
            ctx.charge_work(path.len(), Utf16::default())?;
            ctx.charge_work_u64(
                (name.len() as u64 + 1) * tree_compare_bound(self.properties.len()),
                Utf16::default(),
            )?;
            self.properties.insert(name);
        }
        for index in other.items {
            ctx.charge_work(path.len(), Utf16::default())?;
            ctx.charge_work_u64(tree_compare_bound(self.items.len()), Utf16::default())?;
            self.items.insert(index);
        }
        Ok(())
    }

    fn contains_item(
        &self,
        index: usize,
        ctx: &mut Context<'_>,
        path: &Utf16,
    ) -> Result<bool, EngineError> {
        ctx.charge_work(path.len(), Utf16::default())?;
        ctx.charge_work_u64(tree_compare_bound(self.items.len()), Utf16::default())?;
        Ok(self.items.contains(&index))
    }

    fn insert_item(
        &mut self,
        index: usize,
        ctx: &mut Context<'_>,
        path: &Utf16,
    ) -> Result<(), EngineError> {
        ctx.charge_work(path.len(), Utf16::default())?;
        ctx.charge_work_u64(tree_compare_bound(self.items.len()), Utf16::default())?;
        self.items.insert(index);
        Ok(())
    }

    fn contains_property(
        &self,
        text: InstanceText<'_>,
        ctx: &mut Context<'_>,
        path: &Utf16,
    ) -> Result<bool, EngineError> {
        if let (Some(delta),InstanceText::Utf16(text))=(&self.property_delta,text) {
            return delta.contains(text,ctx);
        }
        ctx.charge_work(path.len(), Utf16::default())?;
        ctx.charge_work_u64(
            (text.codepoint_len() as u64 + 1) * tree_compare_bound(self.properties.len()),
            Utf16::default(),
        )?;
        let points = text.codepoints();
        Ok(self.properties.contains(&points))
    }

    fn insert_property(
        &mut self,
        text: InstanceText<'_>,
        ctx: &mut Context<'_>,
        path: &Utf16,
    ) -> Result<(), EngineError> {
        if let (Some(delta),InstanceText::Utf16(text))=(&mut self.property_delta,text) {
            return delta.insert(text,ctx);
        }
        ctx.charge_work(path.len(), Utf16::default())?;
        ctx.charge_work_u64(
            (text.codepoint_len() as u64 + 1) * tree_compare_bound(self.properties.len()),
            Utf16::default(),
        )?;
        self.properties.insert(text.codepoints());
        Ok(())
    }
}

fn tree_compare_bound(previous: usize) -> u64 {
    let n = previous as u64 + 1;
    let height = 64 - n.saturating_add(1).leading_zeros() as u64;
    n.min(11 * (height + 1))
}

impl CompiledSchema {
    fn uses_python_2019_annotation_profile(&self) -> bool {
        matches!(self.regex_profile, RegexProfile::Python(_))
            && self.dialect == SchemaDialect::Draft2019_09
    }

    fn uses_python_2020_annotation_profile(&self) -> bool {
        matches!(self.regex_profile, RegexProfile::Python(_))
            && self.dialect == SchemaDialect::Draft2020_12
    }

    fn collect_python_legacy_property_names<T: InstanceView>(
        &self,
        rule: &Value,
        schema_path: &EvaluationPathPair,
        data: &T,
        ip: &EvaluationPathPair,
        ctx: &mut Context<'_>,
        evaluated: &mut Evaluated,
    ) -> Result<(), EngineError> {
        let Some(count) = data.object_len() else {
            return Ok(());
        };
        match rule {
            Value::Bool(true) => {
                for index in 0..count {
                    if let Some((name, _)) = data.object_entry(index) {
                        evaluated.insert_property(name, ctx, ip)?;
                    }
                }
            }
            Value::Object(names) => {
                for (index, (name, _)) in names.iter().enumerate() {
                    let source_name = self.source_member_text(schema_path, index, name, ctx)?;
                    for instance_index in 0..count {
                        let Some((actual_name, _)) = data.object_entry(instance_index) else {
                            continue;
                        };
                        if source_name.equals_with_context(actual_name, ctx)? {
                            evaluated.insert_property(actual_name, ctx, ip)?;
                            break;
                        }
                    }
                }
            }
            Value::Bool(false)
            | Value::Array(_)
            | Value::Null
            | Value::String(_)
            | Value::Number(_) => {}
        }
        Ok(())
    }

    fn collect_python_property_predicates<T: InstanceView>(
        &self,
        rule: &Value,
        schema_path: &EvaluationPathPair,
        data: &T,
        ip: &EvaluationPathPair,
        depth: usize,
        ctx: &mut Context<'_>,
        evaluated: &mut Evaluated,
    ) -> Result<(), EngineError> {
        let Some(count) = data.object_len() else {
            return Ok(());
        };
        for index in 0..count {
            let Some((name, value)) = data.object_entry(index) else {
                continue;
            };
            let mut predicate = evaluated.child(ctx, ip)?;
            predicate.mode = EvaluationMode::FirstError;
            predicate.annotation_scan = false;
            predicate.collect_annotations = false;
            let mut errors = Vec::new();
            self.eval(
                rule,
                value,
                &self.pair_instance_pointer(ip, name, ctx)?,
                schema_path,
                depth + 1,
                ctx,
                &mut errors,
                &mut predicate,
            )?;
            if errors.is_empty() {
                evaluated.insert_property(name, ctx, ip)?;
            }
        }
        Ok(())
    }

    fn collect_python_legacy_additional_property_predicates<T: InstanceView>(
        &self,
        members: &[(Utf16, Value)],
        rule: &Value,
        schema_path: &EvaluationPathPair,
        data: &T,
        ip: &EvaluationPathPair,
        depth: usize,
        ctx: &mut Context<'_>,
        evaluated: &mut Evaluated,
    ) -> Result<(), EngineError> {
        let Some(count) = data.object_len() else {
            return Ok(());
        };
        let declared_path = append_schema_path(schema_path, "properties");
        let declared = member(members, "properties");
        let patterns = member(members, "patternProperties");
        let mut compiled_patterns = Vec::new();
        if let Some(Value::Object(patterns)) = patterns {
            ctx.charge_work(patterns.len(), ip.text().clone())?;
            for (pattern, _) in patterns.iter() {
                let pattern_path = self.pair_schema_pointer(
                    &self.pair_eval_schema_step(schema_path, "patternProperties", ctx)?,
                    pattern,
                    ctx,
                )?;
                let regex = self.compile_pattern(pattern, &pattern_path, ctx)?;
                compiled_patterns.push(regex);
            }
        }

        for index in 0..count {
            let Some((name, value)) = data.object_entry(index) else {
                continue;
            };
            let mut covered = false;
            if let Some(Value::Object(properties)) = declared {
                for (property_index, (property, _)) in properties.iter().enumerate() {
                    let source =
                        self.source_member_text(&declared_path, property_index, property, ctx)?;
                    if source.equals_with_context(name, ctx)? {
                        covered = true;
                        break;
                    }
                }
            }
            if !covered {
                for regex in &compiled_patterns {
                    if Self::pattern_matches_text(regex, name, ctx)? {
                        covered = true;
                        break;
                    }
                }
            }
            if covered {
                continue;
            }
            let mut predicate = evaluated.child(ctx, ip)?;
            predicate.mode = EvaluationMode::FirstError;
            predicate.annotation_scan = false;
            predicate.collect_annotations = false;
            let mut errors = Vec::new();
            self.eval(
                rule,
                value,
                &self.pair_instance_pointer(ip, name, ctx)?,
                &self.pair_schema_pointer(schema_path, &Utf16::from("additionalProperties"), ctx)?,
                depth + 1,
                ctx,
                &mut errors,
                &mut predicate,
            )?;
            if errors.is_empty() {
                evaluated.insert_property(name, ctx, ip)?;
            }
        }
        Ok(())
    }

    fn collect_python_item_predicates<T: InstanceView>(
        &self,
        rule: &Value,
        schema_path: &EvaluationPathPair,
        data: &T,
        ip: &EvaluationPathPair,
        depth: usize,
        ctx: &mut Context<'_>,
        evaluated: &mut Evaluated,
    ) -> Result<(), EngineError> {
        let Some(count) = data.array_len() else {
            return Ok(());
        };
        for index in 0..count {
            let Some(value) = data.array_get(index) else {
                continue;
            };
            let mut predicate = evaluated.child(ctx, ip)?;
            predicate.mode = EvaluationMode::FirstError;
            predicate.annotation_scan = false;
            predicate.collect_annotations = false;
            let mut errors = Vec::new();
            let index_text = Utf16::from(index.to_string());
            let path = self.pair_instance_pointer(ip, InstanceText::Utf16(&index_text), ctx)?;
            self.eval(
                rule,
                value,
                &path,
                schema_path,
                depth + 1,
                ctx,
                &mut errors,
                &mut predicate,
            )?;
            if errors.is_empty() {
                evaluated.insert_item(index, ctx, ip)?;
            }
        }
        Ok(())
    }

    fn collect_schema_annotations<T: InstanceView>(
        &self,
        schema_path: &EvaluationPathPair,
        schema: &Value,
        data: &T,
        ip: &EvaluationPathPair,
        depth: usize,
        ctx: &mut Context<'_>,
        evaluated: &mut Evaluated,
    ) -> Result<(), EngineError> {
        self.collect_schema_annotations_resolved(
            schema_path,
            schema,
            data,
            ip,
            depth,
            ctx,
            evaluated,
            false,
        )
    }

    fn collect_schema_annotations_resolved<T: InstanceView>(
        &self,
        schema_path: &EvaluationPathPair,
        schema: &Value,
        data: &T,
        ip: &EvaluationPathPair,
        depth: usize,
        ctx: &mut Context<'_>,
        evaluated: &mut Evaluated,
        id_already_applied: bool,
    ) -> Result<(), EngineError> {
        let mut scan = evaluated.child(ctx, ip)?;
        scan.mode = EvaluationMode::AllErrors;
        scan.collect_annotations = true;
        scan.annotation_scan = true;
        let mut ignored_errors = Vec::new();
        self.eval_resolved(
            schema,
            data,
            ip,
            schema_path,
            depth,
            ctx,
            &mut ignored_errors,
            &mut scan,
            id_already_applied,
        )?;
        evaluated.merge(scan, ctx, ip)?;
        Ok(())
    }

    /// Python's annotation helpers have their own fixed traversal order. They
    /// are not an ordinary validation pass: some rules only mark names/indexes,
    /// while predicates run through the same evaluator in FirstError mode.
    #[inline(never)]
    fn visit_python_annotations<T: InstanceView>(
        &self,
        schema: &Value,
        data: &T,
        ip: &EvaluationPathPair,
        sp: &EvaluationPathPair,
        depth: usize,
        ctx: &mut Context<'_>,
        evaluated: &mut Evaluated,
    ) -> Result<(), EngineError> {
        ctx.charge_work_u64(ip.len() as u64 + 1, Utf16::default())?;
        if depth > ctx.limits().max_depth {
            return Err(EngineError::new(
                "LIMIT",
                ip.text().clone(),
                "Schema evaluation depth exceeded",
            ));
        }
        // Both native helpers return no annotations for a boolean schema.
        let Value::Object(members) = schema else {
            return Ok(());
        };
        let legacy = self.uses_python_2019_annotation_profile();
        let order: &[&str] = if data.object_len().is_some() {
            if legacy {
                &[
                    "$ref",
                    "$recursiveRef",
                    "properties",
                    "additionalProperties",
                    "unevaluatedProperties",
                    "patternProperties",
                    "dependentSchemas",
                    "allOf",
                    "oneOf",
                    "anyOf",
                    "if",
                ]
            } else {
                &[
                    "$ref",
                    "$dynamicRef",
                    "properties",
                    "additionalProperties",
                    "unevaluatedProperties",
                    "patternProperties",
                    "dependentSchemas",
                    "allOf",
                    "oneOf",
                    "anyOf",
                    "if",
                ]
            }
        } else if data.array_len().is_some() {
            if legacy {
                // The legacy helper resolves references before its items return.
                &[
                    "$ref",
                    "$recursiveRef",
                    "items",
                    "if",
                    "contains",
                    "unevaluatedItems",
                    "allOf",
                    "oneOf",
                    "anyOf",
                ]
            } else {
                // Presence of items returns all indexes before even resolving
                // references or reaching any other annotation predicate.
                &[
                    "items",
                    "$ref",
                    "$dynamicRef",
                    "prefixItems",
                    "if",
                    "contains",
                    "unevaluatedItems",
                    "allOf",
                    "oneOf",
                    "anyOf",
                ]
            }
        } else {
            return Ok(());
        };
        let mut ignored = Vec::new();
        let mut scan_complete = false;
        ctx.charge_work(2 * std::mem::size_of::<Option<(&Value, EvaluationPathPair, Option<OwnerCursor>)>>()
            .div_ceil(std::mem::size_of::<usize>()), Utf16::default())?;
        let mut unevaluated_properties = None;
        let mut unevaluated_items = None;
        for &keyword in order {
            let mut selected = None;
            for (key, rule) in members {
                // Admit the borrowed lookup/comparison before inspecting long
                // source keys. No schema, key or member vector is copied here.
                ctx.charge_work_u64(key.len() as u64 + 1, Utf16::default())?;
                if key.units().iter().copied().eq(keyword.encode_utf16()) {
                    selected = Some((key, rule));
                    break;
                }
            }
            let Some((key, rule)) = selected else {
                continue;
            };
            let kp = self.pair_schema_pointer(sp, key, ctx)?;
            let error_start = ignored.len();
            // These are the existing shared marking/predicate mechanisms, not
            // duplicate validation logic. Keep a single Result temporary so
            // recursive debug frames don't retain one Try slot per match arm.
            let result = match keyword {
                "$ref" | "$dynamicRef" | "$recursiveRef" => self.eval_keyword_references(
                    schema,
                    members,
                    keyword,
                    rule,
                    &kp,
                    data,
                    ip,
                    sp,
                    depth,
                    ctx,
                    &mut ignored,
                    evaluated,
                    EvaluationMode::AllErrors,
                    error_start,
                    &mut scan_complete,
                    &mut unevaluated_properties,
                    &mut unevaluated_items,
                ),
                "properties" => self.eval_keyword_properties(
                    schema,
                    members,
                    keyword,
                    rule,
                    &kp,
                    data,
                    ip,
                    sp,
                    depth,
                    ctx,
                    &mut ignored,
                    evaluated,
                    EvaluationMode::AllErrors,
                    error_start,
                    &mut scan_complete,
                    &mut unevaluated_properties,
                    &mut unevaluated_items,
                ),
                "additionalProperties" => self.eval_keyword_additional_properties(
                    members,
                    rule,
                    &kp,
                    data,
                    ip,
                    sp,
                    depth,
                    ctx,
                    &mut ignored,
                    evaluated,
                    EvaluationMode::AllErrors,
                    error_start,
                ),
                "patternProperties" => self.eval_keyword_patterns_additional(
                    schema,
                    members,
                    keyword,
                    rule,
                    &kp,
                    data,
                    ip,
                    sp,
                    depth,
                    ctx,
                    &mut ignored,
                    evaluated,
                    EvaluationMode::AllErrors,
                    error_start,
                    &mut scan_complete,
                    &mut unevaluated_properties,
                    &mut unevaluated_items,
                ),
                "unevaluatedProperties" | "unevaluatedItems" => self.eval_keyword_annotations(
                    schema,
                    members,
                    keyword,
                    rule,
                    &kp,
                    data,
                    ip,
                    sp,
                    depth,
                    ctx,
                    &mut ignored,
                    evaluated,
                    EvaluationMode::AllErrors,
                    error_start,
                    &mut scan_complete,
                    &mut unevaluated_properties,
                    &mut unevaluated_items,
                ),
                "dependentSchemas" => self.eval_keyword_dependencies(
                    schema,
                    members,
                    keyword,
                    rule,
                    &kp,
                    data,
                    ip,
                    sp,
                    depth,
                    ctx,
                    &mut ignored,
                    evaluated,
                    EvaluationMode::AllErrors,
                    error_start,
                    &mut scan_complete,
                    &mut unevaluated_properties,
                    &mut unevaluated_items,
                ),
                "items" | "prefixItems" => self.eval_keyword_items(
                    schema,
                    members,
                    keyword,
                    rule,
                    &kp,
                    data,
                    ip,
                    sp,
                    depth,
                    ctx,
                    &mut ignored,
                    evaluated,
                    EvaluationMode::AllErrors,
                    error_start,
                    &mut scan_complete,
                    &mut unevaluated_properties,
                    &mut unevaluated_items,
                ),
                "contains" => self.eval_keyword_contains(
                    schema,
                    members,
                    keyword,
                    rule,
                    &kp,
                    data,
                    ip,
                    sp,
                    depth,
                    ctx,
                    &mut ignored,
                    evaluated,
                    EvaluationMode::AllErrors,
                    error_start,
                    &mut scan_complete,
                    &mut unevaluated_properties,
                    &mut unevaluated_items,
                ),
                "allOf" | "oneOf" | "anyOf" | "if" => self.eval_keyword_combinators(
                    schema,
                    members,
                    keyword,
                    rule,
                    &kp,
                    data,
                    ip,
                    sp,
                    depth,
                    ctx,
                    &mut ignored,
                    evaluated,
                    EvaluationMode::AllErrors,
                    error_start,
                    &mut scan_complete,
                    &mut unevaluated_properties,
                    &mut unevaluated_items,
                ),
                _ => unreachable!("fixed annotation keyword order"),
            };
            result?;
            if evaluated.annotation_scan_short_circuit {
                return Ok(());
            }
        }
        Ok(())
    }

    /// Source-preserving Python schema admission entrypoint.
    pub fn compile_python_source(
        source_schema: &crate::python_value::PythonConsumerValue,
        resources: &crate::python_value::PythonSchemaResources,
        strict: bool,
        version: PythonReVersion,
        ctx: &mut Context<'_>,
    ) -> Result<crate::python_value::PythonCompiledSchema, EngineError> {
        if ctx.profile() == crate::context::ResourceProfile::HardIsolated {
            return Err(unavailable());
        }
        let (schema, mut source_origins) = source_schema.project_schema_source(ctx)?;
        let mut projected_resources = SchemaResources::default();
        rebase_source_origins(&mut source_origins, &schema_origin_path(&schema));
        for (id, value) in &resources.entries {
            let id = id.to_utf16(ctx)?;
            let (value, mut origins) = value.project_schema_source(ctx)?;
            let mut root = id.units().to_vec();
            root.push(0x23);
            rebase_source_origins(&mut origins, &Utf16::new(root));
            source_origins.values.extend(origins.values);
            source_origins.members.extend(origins.members);
            projected_resources.entries.push((id, value));
        }
        let dialect = if matches!(schema, Value::Bool(_)) {
            SchemaDialect::Draft2020_12
        } else {
            select_dialect(&schema)?
        };
        let mut compiled = Self::compile_inner(
            &schema,
            &projected_resources,
            dialect,
            strict,
            RegexProfile::Python(version),
            false,
            !strict,
            true,
            false,
            KeywordPolicy::DRAFT2020,
            ctx,
        )?;
        compiled.python_text_origins = source_origins.values;
        compiled.python_member_keys = source_origins.members;
        bind_python_source_tree(
            source_schema,
            &compiled.schema,
            &mut compiled.python_source_strings,
            &mut compiled.python_source_keys,
            &mut compiled.python_exact_values,
            ctx,
        )?;
        bind_python_reference_targets(
            &source_schema,
            &compiled.schema,
            None,
            None,
            dialect,
            &mut compiled.python_reference_targets,
            &mut compiled.python_resource_roots,
            ctx,
        )?;
        // Borrow only catalogue storage; the Python binding maps are disjoint.
        let catalogue = match &compiled.resource_bank {
            Some(bank) => admitted_bank::Catalogue::Bank(bank),
            None => admitted_bank::Catalogue::Borrowed(&compiled.resources.entries),
        };
        for (resource_index, ((id, source), (_, target))) in resources
            .entries
            .iter()
            .zip(catalogue.iter())
            .enumerate()
        {
            bind_python_source_tree(
                source,
                target,
                &mut compiled.python_source_strings,
                &mut compiled.python_source_keys,
                &mut compiled.python_exact_values,
                ctx,
            )?;
            bind_python_reference_targets(
                source,
                target,
                Some(resource_index),
                Some(id),
                dialect,
                &mut compiled.python_reference_targets,
                &mut compiled.python_resource_roots,
                ctx,
            )?;
        }
        compiled.preflight(
            &compiled.schema,
            &schema_origin_path(&compiled.schema),
            &schema_id(&compiled.schema)
                .map(|id| resolve_schema_uri(dialect, "", &id).unwrap_or(id))
                .unwrap_or_default(),
            0,
            compiled.root_keyword_policy,
            ctx,
            &mut BTreeSet::new(),
        )?;
        for (id, resource) in &compiled.catalogue_entries() {
            let mut root_path = id.units().to_vec();
            root_path.push(0x23);
            let retrieval = id.to_utf8().unwrap_or_default();
            compiled.preflight(
                resource,
                &Utf16::new(root_path),
                &retrieval,
                0,
                compiled.root_keyword_policy,
                ctx,
                &mut BTreeSet::new(),
            )?;
        }
        Ok(crate::python_value::PythonCompiledSchema {
            compiled: Box::new(compiled),
        })
    }

    /// Compile a strict Draft 2020-12 schema. The supplied resource set is the
    /// complete resolution boundary: references are never fetched implicitly.
    pub fn compile(
        schema: &Value,
        resources: &SchemaResources,
        ctx: &mut Context<'_>,
    ) -> Result<Self, EngineError> {
    ctx.with_work_phase("native-schema-compilation", |ctx| {
        let dialect = select_dialect(schema)?;
        Self::compile_with_dialect(schema, resources, dialect, true, ctx)

    })
}
    #[doc(hidden)]
    pub fn compile_with_codegen_catalogue(schema:&Value,catalogue:&CodegenCatalogue,ctx:&mut Context<'_>)->Result<Self,EngineError>{
        ctx.with_work_phase("native-schema-compilation",|ctx|{
            let dialect=select_dialect(schema)?;
            // Exact same closed mode as compile -> compile_with_dialect(true).
            // Borrowed-root SchemaJSON/copy still runs in the shared body first.
            Self::compile_with_dialect_catalogue(schema,&SchemaResources::default(),dialect,true,ctx,Some(catalogue))
        })
    }
    /// Consumer entry: honor a declared Draft 7 or Draft 2020-12 dialect and
    /// default an omitted declaration to the current Draft 2020-12 surface.
    pub fn compile_consumer(
        schema: &Value,
        resources: &SchemaResources,
        strict: bool,
        ctx: &mut Context<'_>,
    ) -> Result<Self, EngineError> {
    ctx.with_work_phase("native-schema-compilation", |ctx| {
        let declared = get(schema, "$schema").and_then(as_utf8);
        let dialect = match select_dialect(schema) {
            Ok(dialect) => dialect,
            Err(_) if declared.is_some() => SchemaDialect::Draft2020_12,
            Err(error) => return Err(error),
        };
        let policy = match declared {
            Some(uri) if declared_dialect(schema).is_none() => {
                custom_vocabulary_policy(&uri, resources, ctx, Utf16::default())?
            }
            _ => KeywordPolicy::DRAFT2020,
        };
        Self::compile_inner(
            schema,
            resources,
            dialect,
            strict,
            RegexProfile::Ecma262Unicode,
            true,
            false,
            false,
            true,
            policy,
            ctx,
        )

    })
}
    /// Validate only the pinned dialect metaschema, without compiling or
    /// resolving schema references. This lets callers report malformed schema
    /// shape even when a separate reference in the same schema is unresolved.
    pub fn validate_consumer_metaschema_only(
        schema: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<(), EngineError> {
        if ctx.profile() == crate::context::ResourceProfile::HardIsolated {
            return Err(unavailable());
        }
        let dialect = select_dialect(schema)?;
        validate_schema_against_metaschema(schema, dialect, RegexProfile::Ecma262Unicode, ctx)
    }
    /// Construct a consumer schema validator with the exact Python `re`
    /// profile supplied by the binding. References remain local-only and are
    /// resolved when evaluation reaches them, matching the predecessor API.
    pub fn compile_python_consumer(
        schema: &Value,
        resources: &SchemaResources,
        version: PythonReVersion,
        ctx: &mut Context<'_>,
    ) -> Result<Self, EngineError> {
        Self::compile_python_schema(schema, resources, false, version, ctx)
    }
    /// Python validator entry used for strict core resources as well as
    /// ordinary consumer schemas. Strictness controls keyword admission; the
    /// regex profile remains the host's explicitly supplied Python version.
    pub fn compile_python_schema(
        schema: &Value,
        resources: &SchemaResources,
        strict: bool,
        version: PythonReVersion,
        ctx: &mut Context<'_>,
    ) -> Result<Self, EngineError> {
        let dialect = if matches!(schema, Value::Bool(_)) {
            SchemaDialect::Draft2020_12
        } else {
            select_dialect(schema)?
        };
        Self::compile_inner(
            schema,
            resources,
            dialect,
            strict,
            RegexProfile::Python(version),
            false,
            !strict,
            false,
            false,
            KeywordPolicy::DRAFT2020,
            ctx,
        )
    }
    pub fn schema_value(&self) -> &Value {
        &*self.schema
    }
    pub fn snapshot_with_context(&self, ctx: &mut Context<'_>) -> Result<Self, EngineError> {
        for (path, text) in &self.python_text_origins {
            ctx.charge_work_u64(path.len() as u64 + text.len() as u64 + 2, Utf16::default())?;
        }
        for ((path, _), text) in &self.python_member_keys {
            ctx.charge_work_u64(path.len() as u64 + text.len() as u64 + 3, Utf16::default())?;
        }
        for text in self
            .python_source_strings
            .values()
            .chain(self.python_source_keys.values())
        {
            ctx.charge_work_u64(text.len() as u64 + 2, Utf16::default())?;
        }
        for target in self.python_reference_targets.values() {
            ctx.charge_work_u64(
                target.indices.len() as u64
                    + target.resource_root_indices.len() as u64
                    + target
                        .source_resource_uri
                        .as_ref()
                        .map_or(0, |uri| uri.len() as u64)
                    + 3,
                Utf16::default(),
            )?;
        }
        for root in self.python_resource_roots.values() {
            ctx.charge_work_u64(
                root.uri.len() as u64 + root.root_indices.len() as u64 + 3,
                Utf16::default(),
            )?;
        }
        ctx.charge_work(
            self.python_exact_values
                .len()
                .saturating_add(self.catalogue_entries().len()),
            Utf16::default(),
        )?;
        let schema = copy_json(&*self.schema, ctx)?;
        let mut entries = Vec::with_capacity(self.catalogue_entries().len());
        for (id, value) in &self.catalogue_entries() {
            ctx.charge_work(id.len(), Utf16::default())?;
            entries.push((id.clone(), copy_json(value, ctx)?));
        }
        Ok(Self {
            schema: SchemaRoot::Owned(schema),
            resources: SchemaBacking::Owned(SchemaResources { entries }),
            resource_bank:None,
            cold_resource_index: None,
            owner_plans: None,
            owner_lineage: None,
            owner_locations: None,
            dialect: self.dialect,
            strict: self.strict,
            root_keyword_policy: self.root_keyword_policy,
            regex_profile: self.regex_profile,
            resolve_references_at_compile: self.resolve_references_at_compile,
            python_text_origins: self.python_text_origins.clone(),
            python_member_keys: self.python_member_keys.clone(),
            python_source_strings: self.python_source_strings.clone(),
            python_source_keys: self.python_source_keys.clone(),
            python_exact_values: self.python_exact_values.clone(),
            python_reference_targets: self.python_reference_targets.clone(),
            python_resource_roots: self.python_resource_roots.clone(),
            dynamic_anchor_cache: Mutex::new(std::collections::BTreeMap::new()),
        })
    }
    fn compile_pattern(
        &self,
        pattern: &Utf16,
        path: &Utf16,
        ctx: &mut Context<'_>,
    ) -> Result<CompiledRegex, EngineError> {
        let source = self
            .python_source_strings
            .get(&(pattern as *const Utf16 as usize))
            .or_else(|| {
                self.python_source_keys
                    .get(&(pattern as *const Utf16 as usize))
            })
            .or_else(|| self.python_text_origins.get(path.units()));
        self.compile_pattern_source(pattern, source, path, ctx)
    }
    fn compile_pattern_source(
        &self,
        pattern: &Utf16,
        source: Option<&crate::python_value::PyText>,
        path: &Utf16,
        ctx: &mut Context<'_>,
    ) -> Result<CompiledRegex, EngineError> {
        match self.regex_profile {
            RegexProfile::Ecma262Unicode => compile_regex(pattern)
                .map(CompiledRegex::Ecma)
                .map_err(|_| schema_error(path, "Invalid ECMAScript regular expression")),
            RegexProfile::Python(version) => {
                let compiled = if let Some(source) = source {
                    PythonRegex::compile_codepoints_with_context(source.codepoints(), version, ctx)
                } else {
                    PythonRegex::compile_with_context(pattern, version, ctx)
                };
                compiled.map(CompiledRegex::Python).map_err(|error| {
                    if error.code == "PYTHON_REGEX_SYNTAX" {
                        EngineError::new("SCHEMA_INVALID", path.clone(), error.message)
                    } else {
                        error
                    }
                })
            }
        }
    }
    fn source_member_text<'a>(
        &'a self,
        object_path: &Utf16,
        index: usize,
        fallback: &'a Utf16,
        ctx: &mut Context<'_>,
    ) -> Result<InstanceText<'a>, EngineError> {
        let lookup_cost = btree_lookup_work(
            self.python_member_keys.len(),
            object_path.len().saturating_add(1),
        );
        let fallback_cost = btree_index_lookup_work(self.python_source_keys.len());
        ctx.charge_work_u64(
            lookup_cost.saturating_add(fallback_cost).saturating_add(1),
            Utf16::default(),
        )?;
        Ok(self
            .python_member_keys
            .get(&(object_path.units().to_vec(), index))
            .or_else(|| {
                self.python_source_keys
                    .get(&(fallback as *const Utf16 as usize))
            })
            .map(InstanceText::Python)
            .unwrap_or(InstanceText::Utf16(fallback)))
    }
    fn source_text_value<'a>(
        &'a self,
        path: &Utf16,
        fallback: &'a Utf16,
        ctx: &mut Context<'_>,
    ) -> Result<InstanceText<'a>, EngineError> {
        let lookup_cost = btree_lookup_work(self.python_text_origins.len(), path.len());
        let fallback_cost = btree_index_lookup_work(self.python_source_strings.len());
        ctx.charge_work_u64(
            lookup_cost.saturating_add(fallback_cost).saturating_add(1),
            Utf16::default(),
        )?;
        Ok(self
            .python_text_origins
            .get(path.units())
            .or_else(|| {
                self.python_source_strings
                    .get(&(fallback as *const Utf16 as usize))
            })
            .map(InstanceText::Python)
            .unwrap_or(InstanceText::Utf16(fallback)))
    }
    fn value_matches<T: InstanceView>(
        &self,
        expected: &Value,
        actual: &T,
        ctx: &mut Context<'_>,
    ) -> Result<bool, EngineError> {
        if let Some(source) = self
            .python_exact_values
            .get(&(expected as *const Value as usize))
        {
            instances_equal(source.as_ref(), actual, ctx)
        } else {
            canonical_equal(expected, actual, ctx)
        }
    }
    // These private evaluator bridges carry actual arena pairs. Plain resolver
    // helpers below retain UTF16-only semantics; no text lookup mints a handle.
    fn evaluator_origin_path(&self, text: Utf16, ctx: &mut Context<'_>) -> Result<EvaluationPathPair, EngineError> {
        ctx.charge_work(7, Utf16::default())?;
        if self.owner_plans.is_some() {
            if let Some(arena) = ctx.evaluation_paths.clone() {
                return EvaluationPaths::root_pair(&arena, text, ctx);
            }
        }
        EvaluationPathPair::untracked(text, ctx)
    }
    fn evaluator_root_paths(&self, ctx: &mut Context<'_>) -> Result<(EvaluationPathPair, EvaluationPathPair), EngineError> {
        // Both actual root spellings and the two-pair return tuple: UTF16
        // wrappers, empty/root Vec header, allocation/encoding/unit writes,
        // and moved pair fields. Each root_pair separately pays its own arena.
        let word = std::mem::size_of::<usize>();
        ctx.charge_work(2 * std::mem::size_of::<Utf16>().div_ceil(word)
            + std::mem::size_of::<Vec<u16>>().div_ceil(word) + 8
            + 2 * std::mem::size_of::<EvaluationPathPair>().div_ceil(word) + 1,
            Utf16::default())?;
        let instance = self.evaluator_origin_path(Utf16::default(), ctx)?;
        let schema = self.evaluator_origin_path(Utf16::from("#"), ctx)?;
        Ok((instance, schema))
    }
    fn pair_eval_schema_step(&self, path: &EvaluationPathPair, step: &str, ctx: &mut Context<'_>) -> Result<EvaluationPathPair, EngineError> {
        ctx.charge_work(7, Utf16::default())?;
        if self.owner_plans.is_some() {
            if let Some(arena) = ctx.evaluation_paths.clone() {
                ctx.charge_work(step.len().saturating_add(1), Utf16::default())?;
                let segment = Utf16::from(step);
                return EvaluationPaths::append_pair(&arena, path, &segment, PathKind::RawSchemaStep, ctx);
            }
        }
        let text = self.eval_schema_step(path.text(), step, ctx)?;
        EvaluationPathPair::untracked(text, ctx)
    }
    fn pair_schema_pointer(&self, path: &EvaluationPathPair, segment: &Utf16, ctx: &mut Context<'_>) -> Result<EvaluationPathPair, EngineError> {
        ctx.charge_work(8, Utf16::default())?;
        // Marked Python source paths retain the original helper and spelling.
        if self.owner_plans.is_some() && self.python_source_keys.is_empty() {
            if let Some(arena) = ctx.evaluation_paths.clone() {
                return EvaluationPaths::append_pair(&arena, path, segment, PathKind::SchemaPointer, ctx);
            }
        }
        let text = self.schema_pointer(path.text(), segment, ctx)?;
        EvaluationPathPair::untracked(text, ctx)
    }
    // Former direct append_schema_pointer callsites require plain spelling,
    // even when a real Python source key is registered at the segment address.
    fn pair_plain_schema_pointer(&self, path: &EvaluationPathPair, segment: &Utf16, ctx: &mut Context<'_>) -> Result<EvaluationPathPair, EngineError> {
        ctx.charge_work(8, Utf16::default())?;
        if self.owner_plans.is_some() && self.python_source_keys.is_empty() {
            if let Some(arena) = ctx.evaluation_paths.clone() {
                return EvaluationPaths::append_pair(&arena, path, segment, PathKind::SchemaPointer, ctx);
            }
        }
        // Full original plain escaping/copy operation before untracked wrapper.
        // No self.schema_pointer or source-key lookup may mark this output.
        ctx.charge_work_u64((path.len() as u64)
            .saturating_add((segment.len() as u64).saturating_mul(3))
            .saturating_add(1), Utf16::default())?;
        let text = append_schema_pointer(path.text(), segment);
        EvaluationPathPair::untracked(text, ctx)
    }
    fn pair_instance_pointer(&self, path: &EvaluationPathPair, segment: InstanceText<'_>, ctx: &mut Context<'_>) -> Result<EvaluationPathPair, EngineError> {
        ctx.charge_work(8, Utf16::default())?;
        if let InstanceText::Utf16(text) = segment {
            if self.owner_plans.is_some() {
                if let Some(arena) = ctx.evaluation_paths.clone() {
                    return EvaluationPaths::append_pair(&arena, path, text, PathKind::InstancePointer, ctx);
                }
            }
        }
        let text = self.instance_pointer(path.text(), segment, ctx)?;
        EvaluationPathPair::untracked(text, ctx)
    }

    fn eval_schema_step(&self,path:&Utf16,step:&str,ctx:&mut Context<'_>) -> Result<Utf16,EngineError> {
        if self.owner_plans.is_none() { return Ok(append_schema_path(path,step)); }
        ctx.charge_work(step.len().saturating_add(1),Utf16::default())?;
        let segment=Utf16::from(step);
        ctx.charge_work(path.len().saturating_add(segment.len()).saturating_add(1),Utf16::default())?;
        Ok(append_schema_path(path,step))
    }
    fn schema_pointer(
        &self,
        path: &Utf16,
        segment: &Utf16,
        ctx: &mut Context<'_>,
    ) -> Result<Utf16, EngineError> {
        let lookup_cost = btree_index_lookup_work(self.python_source_keys.len());
        if let Some(source) = self
            .python_source_keys
            .get(&(segment as *const Utf16 as usize))
        {
            ctx.charge_work_u64(
                marked_python_path_work(path, source).saturating_add(lookup_cost),
                Utf16::default(),
            )?;
            return Ok(append_marked_python_path(path, source));
        }
        ctx.charge_work_u64(
            (path.len() as u64)
                .saturating_add((segment.len() as u64).saturating_mul(3))
                .saturating_add(lookup_cost)
                .saturating_add(1),
            Utf16::default(),
        )?;
        Ok(append_schema_pointer(path, segment))
    }
    fn instance_pointer(
        &self,
        path: &Utf16,
        segment: InstanceText<'_>,
        ctx: &mut Context<'_>,
    ) -> Result<Utf16, EngineError> {
        match segment {
            InstanceText::Utf16(text) => {
                ctx.charge_work_u64(
                    (path.len() as u64)
                        .saturating_add((text.len() as u64).saturating_mul(3))
                        .saturating_add(1),
                    Utf16::default(),
                )?;
                Ok(append_instance_path(path, text))
            }
            InstanceText::Python(text) if matches!(self.regex_profile, RegexProfile::Python(_)) => {
                ctx.charge_work_u64(marked_python_path_work(path, text), Utf16::default())?;
                Ok(append_marked_python_path(path, text))
            }
            InstanceText::Python(text) => Ok(append_instance_path(path, &text.to_utf16(ctx)?)),
        }
    }
    fn pattern_matches_text(
        regex: &CompiledRegex,
        text: InstanceText<'_>,
        ctx: &mut Context<'_>,
    ) -> Result<bool, EngineError> {
        match (regex, text) {
            (CompiledRegex::Python(regex), InstanceText::Python(text)) => Ok(regex
                .find_from_codepoints_with_context(text.codepoints(), 0, ctx)?
                .is_some()),
            (CompiledRegex::Python(regex), InstanceText::Utf16(text)) => Ok(regex
                .find_from_utf16_with_context(text.units(), 0, ctx)?
                .is_some()),
            (CompiledRegex::Ecma(regex), InstanceText::Python(text)) => {
                let text = text.to_utf16(ctx)?;
                Ok(regex.find_from_utf16(text.units(), 0).next().is_some())
            }
            (CompiledRegex::Ecma(regex), InstanceText::Utf16(text)) => {
                Ok(regex.find_from_utf16(text.units(), 0).next().is_some())
            }
        }
    }
    pub fn compile_with_dialect(
        schema: &Value,
        resources: &SchemaResources,
        dialect: SchemaDialect,
        strict: bool,
        ctx: &mut Context<'_>,
    ) -> Result<Self, EngineError> {
        Self::compile_with_dialect_catalogue(schema,resources,dialect,strict,ctx,None)
    }
    // One actual governing mode body for original and OC1 borrowed roots.
    fn compile_with_dialect_catalogue(schema:&Value,resources:&SchemaResources,dialect:SchemaDialect,strict:bool,ctx:&mut Context<'_>,catalogue:Option<&CodegenCatalogue>)->Result<Self,EngineError>{
        Self::compile_inner_with_bank(schema,resources,dialect,strict,RegexProfile::Ecma262Unicode,true,false,false,true,KeywordPolicy::DRAFT2020,ctx,None,false,catalogue)
    }
    pub(crate) fn compile_input_bank(bank:Arc<admitted_bank::SchemaBank>,role:usize,ctx:&mut Context<'_>)->Result<Self,EngineError> {
        if role>=3 {return Err(schema_error(&Utf16::default(),"Private core bank role out of range"));}
        let selected=admitted_bank::BankRoot::Core(role);
        let dialect=select_dialect(bank.root(selected))?;
        let admitted=bank.input_compatible(ctx)? && bank.anchor_free_core_role(role,ctx)? && bank.unique_retrievals(ctx)?;
        ctx.charge_work(1,Utf16::default())?;
        let retained=Arc::clone(&bank);
        Self::compile_inner_with_bank(bank.root(selected),&SchemaResources::default(),dialect,true,RegexProfile::Ecma262Unicode,true,false,false,true,KeywordPolicy::DRAFT2020,ctx,Some((retained,selected)),admitted,None)
    }
    fn compile_inner(
        schema: &Value,
        resources: &SchemaResources,
        dialect: SchemaDialect,
        strict: bool,
        regex_profile: RegexProfile,
        resolve_references_at_compile: bool,
        apply_local_reference_gate: bool,
        allow_duplicate_schema_keys: bool,
        finite_binary64_admission: bool,
        root_keyword_policy: KeywordPolicy,
        ctx: &mut Context<'_>,
    ) -> Result<Self, EngineError> {
        Self::compile_inner_with_bank(schema,resources,dialect,strict,regex_profile,resolve_references_at_compile,apply_local_reference_gate,allow_duplicate_schema_keys,finite_binary64_admission,root_keyword_policy,ctx,None,false,None)
    }
    fn compile_inner_with_bank(
        schema: &Value,
        resources: &SchemaResources,
        dialect: SchemaDialect,
        strict: bool,
        regex_profile: RegexProfile,
        resolve_references_at_compile: bool,
        apply_local_reference_gate: bool,
        allow_duplicate_schema_keys: bool,
        finite_binary64_admission: bool,
        root_keyword_policy: KeywordPolicy,
        ctx: &mut Context<'_>,
        supplied_bank: Option<(Arc<admitted_bank::SchemaBank>,admitted_bank::BankRoot)>,
        input_admitted:bool,
        codegen_catalogue:Option<&CodegenCatalogue>,
    ) -> Result<Self, EngineError> {
        ctx.with_constructor_site("ctor.other", |ctx| {
        if ctx.profile() == crate::context::ResourceProfile::HardIsolated {
            return Err(unavailable());
        }
        let eligible = ctx.schema_construction.is_some() && strict
            && matches!(regex_profile, RegexProfile::Ecma262Unicode)
            && resolve_references_at_compile && !apply_local_reference_gate
            && !allow_duplicate_schema_keys && finite_binary64_admission
            && root_keyword_policy == KeywordPolicy::DRAFT2020;
        if codegen_catalogue.is_some(){ctx.charge_work(catalogue_words::<admitted_bank::Catalogue<'_>>()+catalogue_words::<Option<&CodegenCatalogue>>()+4,Utf16::default())?;}
        let resources_view=match codegen_catalogue{Some(catalogue)=>admitted_bank::Catalogue::Codegen(catalogue),None=>match supplied_bank.as_ref(){Some((bank,_))=>admitted_bank::Catalogue::Bank(bank),None=>admitted_bank::Catalogue::Borrowed(&resources.entries)}};
        let mut codegen_epoch=None;
        let bank_input=if input_admitted{supplied_bank.as_ref()}else{None};
        let (schema,shared_resources,new_catalogue)=if let Some((bank,role))=bank_input {
            ctx.charge_work(2,Utf16::default())?;
            (SchemaRoot::Bank(Arc::clone(bank),*role),SchemaBacking::Owned(SchemaResources::default()),false)
        } else {
        let mut share_candidate=None;
        let resources_count=resources_view.len_with_context(ctx)?;
        if eligible {
            for ordinal in 0..resources_count {
                let(retrieval,candidate)=resources_view.get_with_context(ordinal,ctx)?.expect("actual immutable catalogue row");
                if SchemaRoot::same_anchor_free_role(schema,retrieval,ctx)? && construction_equal(schema,candidate,ctx)? {ctx.charge_work(1,Utf16::default())?;share_candidate=Some(ordinal);break;}
            }
        }
        let root_copy=if share_candidate.is_some() {
            schema_json_with_mode(schema,ctx,false,false)?;None
        } else {
            Some(if allow_duplicate_schema_keys {copy_schema_json(schema,ctx,true)?}
                else if finite_binary64_admission {copy_schema_json(schema,ctx,false)?}
                else {copy_json(schema,ctx)?})
        };
        #[cfg(test)] if codegen_catalogue.is_some(){codegen_catalogue_event("oc1-root-profile-complete",resources_count);}
        let shared = if eligible {
            let prior=if let Some(catalogue)=codegen_catalogue {
                let(epoch,prior)=catalogue.completed(dialect,ctx)?;codegen_epoch=Some(epoch);prior
            }else{None};
            if prior.is_some(){prior}else{construction_catalogue_view(resources_view,ctx)?}
        } else { None };
        let new_catalogue = shared.is_none();
        let shared_resources = if let Some(shared) = shared { SchemaBacking::Shared(shared) } else {
        let mut owned = Vec::with_capacity(resources_count);
        let mut identities: Vec<(&Utf16, &Value)> = Vec::new();
        for ordinal in 0..resources_count {
            let(id,value)=resources_view.get_with_context(ordinal,ctx)?.expect("actual immutable catalogue row");
            ctx.charge_work(id.len(), Utf16::default())?;
            ctx.charge_work(1, id.clone())?;
            if let Some((_, previous)) = identities.iter().find(|(key, _)| *key == id) {
                if !canonical_equal(previous, value, ctx)? {
                    return Err(EngineError::new(
                        "SCHEMA_ID_CONFLICT",
                        id.clone(),
                        "Conflicting schema identity",
                    ));
                }
                continue;
            }
            let copied = if allow_duplicate_schema_keys {
                copy_schema_json(value, ctx, true)?
            } else if finite_binary64_admission {
                copy_schema_json(value, ctx, false)?
            } else {
                copy_json(value, ctx)?
            };
            identities.push((id, value));
            owned.push((id.clone(), copied));
        }
        if eligible {
        ctx.charge_work(1, Utf16::default())?;
        let admitted = Arc::new(SchemaResources { entries: owned });
        SchemaBacking::Shared(admitted)
        } else { SchemaBacking::Owned(SchemaResources { entries: owned }) }
        };
        let mut root = None;
        if let Some(ordinal)=share_candidate {
            if let SchemaBacking::Shared(catalogue)=&shared_resources {
                // The retained selection proved this exact source root/role
                // before catalogue admission. Ordered catalogue equality or
                // the exact copy preserves its ordinal only without dedup.
                ctx.charge_work(2,Utf16::default())?;
                if catalogue.entries.len()==resources_count {
                    root=Some(SchemaRoot::Catalogue(Arc::clone(catalogue),ordinal));
                }
            }
        }
        let schema = if let Some(root) = root { root } else {
            let value=if let Some(root)=root_copy {root} else {
                // A catalogue deduplication/role mismatch may conservatively
                // prevent sharing. Root admission already ran first; copying
                // here repeats checks rather than borrowing an unproved tree.
                copy_schema_json(schema,ctx,false)?
            };
            SchemaRoot::publish(value, eligible, ctx)?
        };
        if eligible {
            if let Some(state) = ctx.schema_construction.clone() {
                let count = state.borrow().completed.len();
                ctx.with_constructor_site("ctor.proof-lookup", |ctx| ctx.charge_work(count, Utf16::default()))?;
                let completed = state.borrow().completed.clone();
                for (limits, prior) in completed {
                    // Arc identity is used ONLY after the current full ordered
                    // catalogue comparison established the same admitted object.
                    if limits == ctx.limits() && prior.dialect == dialect
                        && matches!(&shared_resources, SchemaBacking::Shared(catalogue) if prior.resources.shares(catalogue))
                        && construction_equal(&*prior.schema, &schema, ctx)? {
                        let completed=prior.construction_copy(schema, ctx)?;
                        if let(Some(catalogue),Some(epoch))=(codegen_catalogue,codegen_epoch){catalogue.publish_completed(epoch,dialect,&completed.resources,ctx)?;}
                        return Ok(completed);
                    }
                }
            }
        }
            (schema,shared_resources,new_catalogue)
        };
        let mut compiled = Self {
            schema,
            resources: shared_resources,
            resource_bank:if input_admitted{supplied_bank.as_ref().map(|(bank,_)|Arc::clone(bank))}else{None},
            cold_resource_index: None,
            owner_plans: None,
            owner_lineage: None,
            owner_locations: None,
            dialect,
            strict,
            root_keyword_policy,
            regex_profile,
            resolve_references_at_compile,
            python_text_origins: std::collections::BTreeMap::new(),
            python_member_keys: std::collections::BTreeMap::new(),
            python_source_strings: std::collections::BTreeMap::new(),
            python_source_keys: std::collections::BTreeMap::new(),
            python_exact_values: std::collections::BTreeMap::new(),
            python_reference_targets: std::collections::BTreeMap::new(),
            python_resource_roots: std::collections::BTreeMap::new(),
            dynamic_anchor_cache: Mutex::new(std::collections::BTreeMap::new()),
        };
        if eligible {
            ctx.charge_work(1,Utf16::default())?;
            compiled.owner_lineage = Some(Arc::new(()));
            compiled.owner_locations = OwnerLocations::build(&compiled,ctx)?;
            compiled.cold_resource_index = ColdResourceIndex::build(&compiled, ctx)?;
            ctx.charge_work(1, Utf16::default())?;
            compiled.owner_plans = Some(Arc::new(OwnerPlans::default()));
        }
        if apply_local_reference_gate {
            validate_local_reference_gate(&*compiled.schema, &Utf16::default(), ctx)?;
        }
        let (root_origin,root_scope)=if eligible {
            construction_index::origin(&*compiled.schema,dialect,ctx)?
        } else {
            (schema_origin_path(&*compiled.schema),schema_id(&*compiled.schema)
                .map(|id|resolve_schema_uri(dialect,"",&id).unwrap_or(id)).unwrap_or_default())
        };
        let root_cursor=compiled.location_root(0,true,ctx)?;
        ctx.with_constructor_site("ctor.preflight-root", |ctx| compiled.preflight_located(
            &*compiled.schema,
            &root_origin,
            &root_scope,
            0,
            compiled.root_keyword_policy,
            ctx,
            &mut BTreeSet::new(),root_cursor,
        ))?;
        for (ordinal,(id, resource)) in compiled.catalogue_entries().iter().enumerate() {
            if eligible { ctx.charge_work(id.len().saturating_mul(3).saturating_add(1),Utf16::default())?; }
            let mut root_path = id.units().to_vec();
            root_path.push(0x23);
            let retrieval = id.to_utf8().unwrap_or_default();
            // This is the SAME completed root preflight, only when origin,
            // root-dependent resolver/catalogue, policy, limits and full
            // ordered schema contents agree. Never a catalogue-only proof.
            if eligible {
                ctx.charge_work(root_origin.len().min(root_path.len()).saturating_add(1), Utf16::default())?;
                if root_origin.units()==root_path.as_slice()
                    && construction_equal(&*compiled.schema,resource,ctx)? { continue; }
            }
            let resource_cursor=compiled.location_root(ordinal+1,true,ctx)?;
            ctx.with_constructor_site("ctor.preflight-catalogue", |ctx| compiled.preflight_located(
                resource,
                &Utf16::new(root_path),
                &retrieval,
                0,
                compiled.root_keyword_policy,
                ctx,
                &mut BTreeSet::new(),resource_cursor,
            ))?;
        }
        if get(&*compiled.schema, "$schema").is_none()
            || declared_dialect(&*compiled.schema).is_some()
        {
            validate_schema_against_metaschema_mode(&*compiled.schema,dialect,regex_profile,ctx,input_admitted)?;
        }
        if eligible && !input_admitted {
            if let Some(state) = ctx.schema_construction.clone() {
                if new_catalogue {
                    if let SchemaBacking::Shared(catalogue) = &compiled.resources {
                        ctx.charge_work(1, Utf16::default())?;
                        state.borrow_mut().catalogues.push((ctx.limits(), Arc::clone(catalogue)));
                    }
                }
                // This exact admitted root and catalogue already own immutable
                // backing. Retaining a completed proof needs no second tree.
                ctx.charge_work(1, Utf16::default())?;
                let completed = compiled.construction_copy(compiled.schema.clone(), ctx)?;
                ctx.charge_work(1, Utf16::default())?;
                state.borrow_mut().completed.push((ctx.limits(), Arc::new(completed)));
            }
        }
        if let(Some(catalogue),Some(epoch))=(codegen_catalogue,codegen_epoch){catalogue.publish_completed(epoch,dialect,&compiled.resources,ctx)?;}
        Ok(compiled)

        })
    }
    pub fn validate(
        &self,
        value: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Vec<StructuralError>, EngineError> {
    ctx.with_work_phase("native-schema-validation", |ctx| {
        self.validate_with_codegen_errors(value, false, ctx)

    })
}
    /// Return the compiler's all-errors ECMAScript presentation, including
    /// failed oneOf branches and the indices of its first two passing branches.
    /// This uses the same evaluator and live Context as ordinary validation;
    /// artifact content cannot select this presentation mode.
    pub fn validate_codegen_errors(
        &self,
        value: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Vec<StructuralError>, EngineError> {
        if !matches!(self.regex_profile, RegexProfile::Ecma262Unicode) {
            return Err(EngineError::new(
                "SCHEMA_PROFILE",
                Utf16::default(),
                "Compiler diagnostics require the ECMAScript schema profile",
            ));
        }
        self.validate_with_codegen_errors(value, true, ctx)
    }
    fn validate_with_codegen_errors(
        &self,
        value: &Value,
        codegen_errors: bool,
        ctx: &mut Context<'_>,
    ) -> Result<Vec<StructuralError>, EngineError> {
        // JSON Schema's numeric domain is the finite binary64 domain used by
        // the native validator. Keep this exception local to schema
        // validation; core documents continue to use `copy_json`'s narrower
        // interoperable-number profile.
        let value = if matches!(self.regex_profile, RegexProfile::Python(_)) {
            copy_json(value, ctx)?
        } else {
            copy_schema_json(value, ctx, false)?
        };
        self.evaluate_admitted_codegen_value(&value, codegen_errors, ctx)
    }
    /// Crate-owned Engine snapshot: constructed only by copy_json or the
    /// checked Python core snapshot in the SAME Context/lifetime. No wire flag
    /// or caller hash can select this path. Generic compilers keep admission.
    pub(crate) fn validate_owned_core_snapshot(&self,value:&Value,ctx:&mut Context<'_>) -> Result<Vec<StructuralError>,EngineError> {
        if self.owner_plans.is_none() { return self.validate(value,ctx); }
        ctx.with_work_phase("native-schema-validation",|ctx|self.evaluate_admitted_codegen_value(value,false,ctx))
    }
    /// Internal JSON.parse projection of an already admitted NativeJsonTree.
    /// Native JSON tokens may overflow binary64; AJV with strict=false sees
    /// those as infinities. Public schema/carrier admission stays finite-only.
    pub(crate) fn validate_native_json_codegen_errors(
        &self,
        value: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Vec<StructuralError>, EngineError> {
        if !matches!(self.regex_profile, RegexProfile::Ecma262Unicode) {
            return Err(EngineError::new(
                "SCHEMA_PROFILE",
                Utf16::default(),
                "Native JSON diagnostics require the ECMAScript schema profile",
            ));
        }
        self.evaluate_admitted_codegen_value(value, true, ctx)
    }
    fn evaluate_admitted_codegen_value(
        &self,
        value: &Value,
        codegen_errors: bool,
        ctx: &mut Context<'_>,
    ) -> Result<Vec<StructuralError>, EngineError> {
        if self.owner_plans.is_some() {
            return ctx.with_evaluation_paths(|ctx| self.evaluate_admitted_codegen_value_inner(value,codegen_errors,ctx));
        }
        self.evaluate_admitted_codegen_value_inner(value,codegen_errors,ctx)
    }
    fn evaluate_admitted_codegen_value_inner(&self, value:&Value, codegen_errors:bool, ctx:&mut Context<'_>) -> Result<Vec<StructuralError>,EngineError> {
        ctx.charge_work(1, Utf16::default())?;
        let mut errors = Vec::new();
        let mut evaluated = Evaluated::default();
        if self.cold_resource_index.is_some() {
            evaluated.dynamic_scope=DynamicScope::shared(ctx)?;
        }
        if self.owner_plans.is_some() { evaluated.property_delta=Some(PropertyDelta::new(ctx)?); }
        evaluated.codegen_errors = codegen_errors;
        evaluated.keyword_policy = self.root_keyword_policy;
        evaluated.selected_cursor=self.location_root(0,true,ctx)?;
        let (instance_path, schema_path) = self.evaluator_root_paths(ctx)?;
        self.eval(
            &*self.schema,
            value,
            &instance_path,
            &schema_path,
            0,
            ctx,
            &mut errors,
            &mut evaluated,
        )?;
        Ok(errors)
    }
    /// Evaluate an already-admitted source value through the same interpreter
    /// as UMF values. Bindings must meter/admit the owned Python tree before
    /// calling this method; it intentionally does not project it to `Value`.
    pub(crate) fn validate_instance<T: InstanceView>(
        &self,
        value: &T,
        ctx: &mut Context<'_>,
    ) -> Result<Vec<StructuralError>, EngineError> {
        let outcome = self.evaluate_instance_with_mode(value, EvaluationMode::AllErrors, ctx)?;
        match outcome.terminal_error {
            Some(error) => Err(error),
            None => Ok(outcome.errors),
        }
    }

    pub(crate) fn evaluate_instance_with_mode<T: InstanceView>(
        &self,
        value: &T,
        mode: EvaluationMode,
        ctx: &mut Context<'_>,
    ) -> Result<EvaluationOutcome, EngineError> {
        if self.owner_plans.is_some() {
            return ctx.with_evaluation_paths(|ctx| self.evaluate_instance_with_mode_inner(value,mode,ctx));
        }
        self.evaluate_instance_with_mode_inner(value,mode,ctx)
    }
    fn evaluate_instance_with_mode_inner<T:InstanceView>(&self,value:&T,mode:EvaluationMode,ctx:&mut Context<'_>) -> Result<EvaluationOutcome,EngineError> {
        let mut errors = Vec::new();
        let mut evaluated = Evaluated::default();
        if self.cold_resource_index.is_some() {
            evaluated.dynamic_scope = DynamicScope::shared(ctx)?;
        }
        evaluated.mode = mode;
        evaluated.keyword_policy = self.root_keyword_policy;
        evaluated.selected_cursor=self.location_root(0,true,ctx)?;
        let (instance_path, schema_path) = self.evaluator_root_paths(ctx)?;
        let result = self.eval(
            &*self.schema,
            value,
            &instance_path,
            &schema_path,
            0,
            ctx,
            &mut errors,
            &mut evaluated,
        );
        let terminal_error = match result {
            Ok(()) => None,
            Err(error) if error.is_python_schema_terminal() => Some(error),
            Err(error) => return Err(error),
        };
        if !self.python_source_keys.is_empty() || !self.python_source_strings.is_empty() {
            for error in &mut errors {
                error.python_source_path = true;
            }
        }
        Ok(EvaluationOutcome {
            errors,
            terminal_error,
        })
    }
    fn keyword_policy_for(
        &self,
        schema: &Value,
        schema_path: &Utf16,
        inherited: KeywordPolicy,
        ctx: &mut Context<'_>,
    ) -> Result<KeywordPolicy, EngineError> {
        if let Some(index) = &self.cold_resource_index {
            if construction_index::get_ascii_metered(schema, "$schema", ctx, schema_path)?.is_some() {
                return self.explicit_keyword_policy(schema, inherited, ctx);
            }
            if schema_path.units().first()==Some(&35) {return Ok(inherited);}
            if let Some(root) = index.policy_path(schema_path,ctx)? {
                return index.policy(self,root,inherited,ctx);
            }
        }
        self.keyword_policy_unindexed(schema,schema_path,inherited,ctx)
    }
    fn keyword_policy_unindexed(&self,schema:&Value,schema_path:&Utf16,inherited:KeywordPolicy,ctx:&mut Context<'_>)->Result<KeywordPolicy,EngineError> {
        if get_metered(schema, "$schema", ctx, schema_path)?.is_some() {
            return self.explicit_keyword_policy(schema, inherited, ctx);
        }
        ctx.charge_work(schema_path.len(), schema_path.clone())?;
        let origin = schema_path
            .to_utf8()
            .ok()
            .and_then(|path| path.split_once('#').map(|(origin, _)| origin.to_owned()))
            .unwrap_or_default();
        if origin.is_empty() {
            return Ok(inherited);
        }
        if schema_id_metered(&*self.schema, ctx, schema_path)?.as_deref() == Some(origin.as_str()) {
            return self.explicit_keyword_policy(&*self.schema, inherited, ctx);
        }
        for (id, resource) in &self.catalogue_entries() {
            ctx.charge_work(id.len(), schema_path.clone())?;
            let retrieval_matches = id.to_utf8().ok().as_deref() == Some(origin.as_str());
            let schema_matches = if retrieval_matches {
                false
            } else {
                schema_id_metered(resource, ctx, schema_path)?.as_deref() == Some(origin.as_str())
            };
            if retrieval_matches || schema_matches {
                return self.explicit_keyword_policy(resource, inherited, ctx);
            }
        }
        if let Some(resource) =
            find_embedded_resource(&*self.schema, &origin, self.dialect, ctx, schema_path)?
        {
            return self.explicit_keyword_policy(resource, inherited, ctx);
        }
        for (_, resource) in &self.catalogue_entries() {
            if let Some(found) =
                find_embedded_resource(resource, &origin, self.dialect, ctx, schema_path)?
            {
                return self.explicit_keyword_policy(found, inherited, ctx);
            }
        }
        Ok(inherited)
    }
    fn keyword_policy_carried(&self,schema:&Value,path:&construction_index::CarriedPath,inherited:KeywordPolicy,ctx:&mut Context<'_>)->Result<KeywordPolicy,EngineError> {
        let Some(index)=&self.cold_resource_index else{return self.keyword_policy_for(schema,path.text(),inherited,ctx);};
        if construction_index::get_ascii_metered(schema,"$schema",ctx,path.text())?.is_some() {return self.explicit_keyword_policy(schema,inherited,ctx);}
        if path.units().first()==Some(&35) {return Ok(inherited);}
        if let Some(root)=index.select_carried(self,path,construction_index::PathSelector::Policy,ctx)? {return index.policy(self,root,inherited,ctx);}
        self.keyword_policy_unindexed(schema,path.text(),inherited,ctx)
    }
    fn keyword_policy_scoped(&self,schema:&Value,path:&mut construction_index::ScopedPreflightPath,inherited:KeywordPolicy,ctx:&mut Context<'_>)->Result<KeywordPolicy,EngineError>{
        if construction_index::get_ascii_metered(schema,"$schema",ctx,path.text())?.is_some(){return self.explicit_keyword_policy(schema,inherited,ctx);}
        if path.units().first()==Some(&35){return Ok(inherited);}
        if let Some(index)=&self.cold_resource_index {if let Some(root)=index.select_scoped(self,path,construction_index::PathSelector::Policy,ctx)?{return index.policy(self,root,inherited,ctx);}}
        let snapshot=path.diagnostic_snapshot(ctx)?;
        self.keyword_policy_unindexed(schema,&snapshot,inherited,ctx)
    }

    fn explicit_keyword_policy(
        &self,
        schema: &Value,
        inherited: KeywordPolicy,
        ctx: &mut Context<'_>,
    ) -> Result<KeywordPolicy, EngineError> {
        let Some(uri_value) = get_metered(schema, "$schema", ctx, &Utf16::default())? else {
            return Ok(inherited);
        };
        let Value::String(uri_text) = uri_value else {
            return Err(EngineError::new(
                "SCHEMA_DIALECT",
                Utf16::default(),
                "Schema dialect URI must be a string",
            ));
        };
        ctx.charge_work(uri_text.len(), Utf16::default())?;
        let Some(uri) = as_utf8(uri_value) else {
            return Err(EngineError::new(
                "SCHEMA_DIALECT",
                Utf16::default(),
                "Schema dialect URI must be valid Unicode",
            ));
        };
        if dialect_from_uri(&uri).is_some() {
            Ok(KeywordPolicy::DRAFT2020)
        } else {
            custom_vocabulary_policy_view(&uri, self.catalogue_entries(), ctx, Utf16::default())
        }
    }

    fn with_scoped_preflight_child<'ctx,T>(&self,path:&mut construction_index::ScopedPreflightPath,segment:&Utf16,kind:PathKind,ctx:&mut Context<'ctx>,operation:impl FnOnce(&mut construction_index::ScopedPreflightPath,&mut Context<'ctx>)->Result<T,EngineError>)->Result<T,EngineError>{
        #[cfg(test)]
        { self.with_scoped_preflight_child_observed(path,segment,kind,ctx,&mut construction_index::scoped_effect_event,operation) }
        #[cfg(not(test))]
        { self.with_scoped_preflight_child_observed(path,segment,kind,ctx,&mut |_|{},operation) }
    }
    #[cfg(test)]
    fn with_scoped_preflight_child_with_events<'ctx,T>(&self,path:&mut construction_index::ScopedPreflightPath,segment:&Utf16,kind:PathKind,ctx:&mut Context<'ctx>,event:&mut dyn FnMut(&'static str),operation:impl FnOnce(&mut construction_index::ScopedPreflightPath,&mut Context<'ctx>)->Result<T,EngineError>)->Result<T,EngineError>{
        self.with_scoped_preflight_child_observed(path,segment,kind,ctx,event,operation)
    }
    fn with_scoped_preflight_child_observed<'ctx,T>(&self,path:&mut construction_index::ScopedPreflightPath,segment:&Utf16,kind:PathKind,ctx:&mut Context<'ctx>,event:&mut dyn FnMut(&'static str),operation:impl FnOnce(&mut construction_index::ScopedPreflightPath,&mut Context<'ctx>)->Result<T,EngineError>)->Result<T,EngineError>{
        let mark=path.mark(ctx)?;
        let outcome=std::panic::catch_unwind(std::panic::AssertUnwindSafe(||{event("sp1-child-checkpoint-admitted");path.append_observed(segment,kind,ctx,event)?;let result=operation(path,ctx);if result.is_ok(){event("sp1-child-operation-completed");}result}));
        match outcome{
            Err(payload)=>{path.restore_after_failure(mark);std::panic::resume_unwind(payload)},
            Ok(Err(error))=>{path.restore_after_failure(mark);Err(error)},
            Ok(Ok(value))=>match path.restore(mark,ctx){Ok(())=>Ok(value),Err(error)=>Err(error)}
        }
    }
    fn with_scoped_preflight_index<'ctx,T>(&self,path:&mut construction_index::ScopedPreflightPath,index:usize,ctx:&mut Context<'ctx>,operation:impl FnOnce(&mut construction_index::ScopedPreflightPath,&mut Context<'ctx>)->Result<T,EngineError>)->Result<T,EngineError>{
        let digits=if index==0{1}else{index.ilog10() as usize+1};
        ctx.charge_work(digits.saturating_mul(5).saturating_add(2*std::mem::size_of::<Vec<u16>>().div_ceil(std::mem::size_of::<usize>())+6),Utf16::default())?;
        let segment=Utf16::from(index.to_string());
        self.with_scoped_preflight_child(path,&segment,PathKind::RawSchemaStep,ctx,operation)
    }
    fn scoped_preflight_schema_error(&self,path:&mut construction_index::ScopedPreflightPath,message:&str,ctx:&mut Context<'_>)->Result<EngineError,EngineError>{
        let snapshot=path.diagnostic_snapshot(ctx)?;
        Ok(schema_error(&snapshot,message))
    }
    fn preflight(&self,schema:&Value,path:&Utf16,scope:&str,depth:usize,inherited_policy:KeywordPolicy,ctx:&mut Context<'_>,seen:&mut BTreeSet<usize>)->Result<(),EngineError>{
        self.preflight_located(schema,path,scope,depth,inherited_policy,ctx,seen,None)
    }
    fn preflight_located(&self,schema:&Value,path:&Utf16,scope:&str,depth:usize,inherited_policy:KeywordPolicy,ctx:&mut Context<'_>,seen:&mut BTreeSet<usize>,cursor:Option<OwnerCursor>)->Result<(),EngineError> {
        if self.cold_resource_index.is_none() {return self.preflight_original_located(schema,path,scope,depth,inherited_policy,ctx,seen,cursor);}
        let mut owned=construction_index::ScopedPreflightPath::new(path,ctx)?;
        self.preflight_carried(schema,&mut owned,scope,depth,inherited_policy,ctx,seen,cursor)
    }
    fn preflight_original_located(&self,schema:&Value,path:&Utf16,scope:&str,depth:usize,inherited_policy:KeywordPolicy,ctx:&mut Context<'_>,seen:&mut BTreeSet<usize>,cursor:Option<OwnerCursor>)->Result<(),EngineError>{
        ctx.charge_work(1, path.clone())?;
        if depth > ctx.limits().max_depth {
            return Err(EngineError::new(
                "LIMIT",
                path.clone(),
                "Schema nesting depth exceeded",
            ));
        }
        let Value::Object(m) = schema else {
            if matches!(schema, Value::Bool(_)) {
                let path_text = path.to_utf8().ok();
                let boolean_allowed_by_legacy_keyword =
                    matches!(self.dialect, SchemaDialect::Draft3 | SchemaDialect::Draft4)
                        && path_text.as_deref().is_some_and(|p| {
                            p.ends_with("/additionalProperties") || p.ends_with("/additionalItems")
                        });
                if matches!(self.dialect, SchemaDialect::Draft3 | SchemaDialect::Draft4)
                    && !boolean_allowed_by_legacy_keyword
                {
                    return Err(schema_error(
                        path,
                        "Boolean schemas are not valid in this dialect",
                    ));
                }
                return Ok(());
            }
            return Err(schema_error(path, "Schema must be an object or boolean"));
        };
        let policy = self.keyword_policy_for(schema, path, inherited_policy, ctx)?;
        let known = keywords(self.dialect);
        let scope = if let Some(id) = schema_id(schema) {
            ctx.charge_work(scope.len().saturating_add(id.len()), path.clone())?;
            resolve_schema_uri(self.dialect, scope, &id).unwrap_or(id)
        } else {
            scope.to_owned()
        };
        for (member_index,(key, val)) in m.iter().enumerate() {
            let text = match key.to_utf8() {
                Ok(text) => text,
                Err(_) if !self.strict => continue,
                Err(_) => return Err(schema_error(path, "Schema keyword is not valid Unicode")),
            };
            if !policy.keyword_is_active(&text) {
                continue;
            }
            if !known.contains(text.as_str()) {
                if self.strict && !policy.custom {
                    return Err(EngineError::new(
                        "SCHEMA_UNKNOWN_KEYWORD",
                        path.clone(),
                        format!("Unknown schema keyword '{text}'"),
                    ));
                }
                continue;
            }
            let keyword_cursor=child_cursor(Some(self),cursor.as_ref(),member_index,ctx)?;
            let child = append_schema_path(path, &text);
            match text.as_str() {
                "$ref" | "$dynamicRef" | "$recursiveRef" => {
                    if !matches!(val, Value::String(_)) {
                        return Err(schema_error(&child, "reference keyword must be a string"));
                    }
                    if self.resolve_references_at_compile {
                        // Preflight validates through the authoritative resolver;
                        // optional runtime reference memoization remains unchanged.
                        let resolved = self.resolve_ref_unplanned(val, &child, Some(scope.as_str()), ctx);
                        #[cfg(test)]
                        preflight_reference_observation::emit(val, &child, &scope, &resolved);
                        resolved?;
                    }
                }
                "$anchor" | "$dynamicAnchor" => {
                    let anchor = as_utf8(val)
                        .ok_or_else(|| schema_error(&child, "anchor must be a string"))?;
                    let mut chars = anchor.chars();
                    let valid = chars.next().is_some_and(|c| c.is_ascii_alphabetic())
                        && chars.all(|c| {
                            c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | ':' | '-')
                        });
                    if !valid {
                        return Err(schema_error(&child, "Invalid schema anchor"));
                    }
                }
                "type" | "disallow" => {
                    // Draft 3's metaschema intentionally permits extension
                    // type names (and delegates their meaning to its type
                    // checker). Later drafts enumerate the primitive names.
                    if self.dialect != SchemaDialect::Draft3 {
                        validate_type_declaration(val, &child, self.dialect)?;
                    }
                    if self.dialect == SchemaDialect::Draft3 {
                        match val {
                            Value::Object(_) => {
                                let selected=clone_owner_cursor(keyword_cursor.as_ref(),ctx)?;
                                self.preflight_original_located(val,&child,&scope,depth+1,policy,ctx,seen,selected)?;
                            }
                            Value::Array(items) => {
                                for (index, branch) in items.iter().enumerate() {
                                    if matches!(branch, Value::Object(_)) {
                                        let selected=child_cursor(Some(self),keyword_cursor.as_ref(),index,ctx)?;
                                        self.preflight_original_located(
                                            branch,
                                            &append_schema_path(&child, &index.to_string()),
                                            &scope,
                                            depth + 1,
                                            policy,
                                            ctx,
                                            seen,selected)?;
                                    }
                                }
                            }
                            _ => (),
                        }
                    }
                }
                "required" => {
                    if self.dialect == SchemaDialect::Draft3 && matches!(val, Value::Bool(_)) {
                        // Draft 3 expresses a required property on the property schema itself.
                    } else {
                        validate_string_array(val, &child, true)?;
                    }
                }
                "enum" => {
                    if let Value::Array(items) = val {
                        if items.is_empty()
                            && matches!(self.dialect, SchemaDialect::Draft3 | SchemaDialect::Draft4)
                        {
                            return Err(schema_error(
                                &child,
                                "enum must contain at least one value",
                            ));
                        }
                    } else {
                        return Err(schema_error(&child, "enum must be an array"));
                    }
                }
                "properties" | "patternProperties" | "$defs" | "definitions"
                | "dependentSchemas" => {
                    // Draft 3's `definitions` has no schema semantics in the
                    // predecessor profile. Its contents are opaque annotations;
                    // a `$ref` that later resolves to a boolean fails at runtime.
                    if self.dialect == SchemaDialect::Draft3 && text == "definitions" {
                        continue;
                    }
                    if let Value::Object(children) = val {
                        for (child_index, (name, child_schema)) in children.iter().enumerate() {
                            if text == "patternProperties" {
                                let pattern_path = append_schema_pointer(&child, name);
                                self.compile_pattern(name, &pattern_path, ctx)?;
                            }
                            let p = append_schema_pointer(&append_schema_path(path, &text), name);
                            let selected=child_cursor(Some(self),keyword_cursor.as_ref(),child_index,ctx)?;
                            self.preflight_original_located(child_schema,&p,&scope,depth+1,policy,ctx,seen,selected)?;
                        }
                    } else {
                        return Err(schema_error(&child, "Keyword value must be an object"));
                    }
                }
                "items"
                | "additionalItems"
                | "additionalProperties"
                | "unevaluatedProperties"
                | "unevaluatedItems"
                | "contains"
                | "not"
                | "if"
                | "then"
                | "else"
                | "propertyNames" => {
                    if text == "items"
                        && self.dialect == SchemaDialect::Draft2020_12
                        && matches!(val, Value::Array(_))
                    {
                        return Err(schema_error(
                            &child,
                            "Draft 2020-12 items must be a schema; use prefixItems for tuple validation",
                        ));
                    }
                    if text == "additionalItems"
                        && self.dialect == SchemaDialect::Draft2020_12
                        && self.strict
                    {
                        return Err(schema_error(
                            &child,
                            "additionalItems is not available in Draft 2020-12",
                        ));
                    }
                    if text == "additionalItems" && self.dialect == SchemaDialect::Draft2020_12 {
                        continue;
                    }
                    if let Value::Array(items) = val {
                        for (i, x) in items.iter().enumerate() {
                            let selected=child_cursor(Some(self),keyword_cursor.as_ref(),i,ctx)?;
                            self.preflight_original_located(
                                x,
                                &append_schema_path(
                                    &append_schema_path(path, &text),
                                    &i.to_string(),
                                ),
                                &scope,
                                depth + 1,
                                policy,
                                ctx,
                                seen,selected)?;
                        }
                    } else {
                        let selected=clone_owner_cursor(keyword_cursor.as_ref(),ctx)?;
                        self.preflight_original_located(val,&child,&scope,depth+1,policy,ctx,seen,selected)?;
                    }
                }
                "allOf" | "anyOf" | "oneOf" | "prefixItems" => {
                    if let Value::Array(items) = val {
                        if items.is_empty() && text != "prefixItems" {
                            return Err(schema_error(&child, "Applicator array must not be empty"));
                        }
                        for (i, x) in items.iter().enumerate() {
                            let selected=child_cursor(Some(self),keyword_cursor.as_ref(),i,ctx)?;
                            self.preflight_original_located(
                                x,
                                &append_schema_path(&child, &i.to_string()),
                                &scope,
                                depth + 1,
                                policy,
                                ctx,
                                seen,selected)?;
                        }
                    } else {
                        return Err(schema_error(&child, "Applicator must be an array"));
                    }
                }
                "extends" if self.dialect == SchemaDialect::Draft3 => {
                    if let Value::Array(items) = val {
                        for (index, item) in items.iter().enumerate() {
                            let selected=child_cursor(Some(self),keyword_cursor.as_ref(),index,ctx)?;
                            self.preflight_original_located(
                                item,
                                &append_schema_path(&child, &index.to_string()),
                                &scope,
                                depth + 1,
                                policy,
                                ctx,
                                seen,selected)?;
                        }
                    } else {
                        let selected=clone_owner_cursor(keyword_cursor.as_ref(),ctx)?;
                        self.preflight_original_located(val,&child,&scope,depth+1,policy,ctx,seen,selected)?;
                    }
                }
                "pattern" => {
                    let Value::String(pat) = val else {
                        return Err(schema_error(&child, "pattern must be a string"));
                    };
                    self.compile_pattern(pat, &child, ctx)?;
                }
                "minimum" | "maximum" | "exclusiveMinimum" | "exclusiveMaximum" | "multipleOf"
                | "divisibleBy" => {
                    let old_exclusive =
                        matches!(self.dialect, SchemaDialect::Draft3 | SchemaDialect::Draft4)
                            && matches!(text.as_str(), "exclusiveMinimum" | "exclusiveMaximum");
                    if old_exclusive && !matches!(val, Value::Bool(_)) {
                        return Err(schema_error(
                            &child,
                            "Exclusive bound flag must be a boolean",
                        ));
                    }
                    if !old_exclusive && !matches!(val, Value::Number(_)) {
                        return Err(schema_error(&child, "Numeric keyword must be a number"));
                    }
                    if matches!(text.as_str(), "multipleOf" | "divisibleBy")
                        && matches!(val,Value::Number(n) if *n<=0.0)
                    {
                        return Err(schema_error(&child, "multipleOf must be greater than zero"));
                    }
                }
                "minLength" | "maxLength" | "minItems" | "maxItems" | "minProperties"
                | "maxProperties" => {
                    if !matches!(val,Value::Number(n) if n.fract()==0.0&&(self.dialect == SchemaDialect::Draft3 || *n>=0.0))
                    {
                        return Err(schema_error(
                            &child,
                            "Size keyword must be a non-negative integer",
                        ));
                    }
                }
                "minContains" | "maxContains" => {
                    if self.dialect == SchemaDialect::Draft2019_09
                        || self.dialect == SchemaDialect::Draft2020_12
                    {
                        if !matches!(val,Value::Number(n) if n.fract()==0.0&&*n>=0.0) {
                            return Err(schema_error(
                                &child,
                                "Size keyword must be a non-negative integer",
                            ));
                        }
                    }
                }
                "uniqueItems" => {
                    if !matches!(val, Value::Bool(_)) {
                        return Err(schema_error(&child, "uniqueItems must be a boolean"));
                    }
                }
                "dependencies" => {
                    if let Value::Object(deps) = val {
                        for (child_index,(name, dep)) in deps.iter().enumerate() {
                            if matches!(dep, Value::Array(_)) {
                                validate_string_array(
                                    dep,
                                    &append_schema_pointer(&child, name),
                                    true,
                                )?;
                            } else if self.dialect == SchemaDialect::Draft3
                                && matches!(dep, Value::String(_))
                            {
                                // Draft 3 permits a string dependency naming a peer property.
                            } else {
                                let selected=child_cursor(Some(self),keyword_cursor.as_ref(),child_index,ctx)?;
                                self.preflight_original_located(
                                    dep,
                                    &append_schema_pointer(&child, name),
                                    &scope,
                                    depth + 1,
                                    policy,
                                    ctx,
                                    seen,selected)?;
                            }
                        }
                    } else {
                        return Err(schema_error(&child, "dependencies must be an object"));
                    }
                }
                "dependentRequired" => {
                    if let Value::Object(deps) = val {
                        for (name, dep) in deps {
                            validate_string_array(dep, &append_schema_pointer(&child, name), true)?;
                        }
                    } else {
                        return Err(schema_error(&child, "dependentRequired must be an object"));
                    }
                }
                _ => {}
            }
        }
        let _ = &mut *seen;
        Ok(())

    }
    fn preflight_carried<'a>(&'a self,schema:&'a Value,path:&mut construction_index::ScopedPreflightPath,scope:&str,depth:usize,inherited_policy:KeywordPolicy,ctx:&mut Context<'_>,seen:&mut BTreeSet<usize>,cursor:Option<OwnerCursor>)->Result<(),EngineError>{
        let checked=match (&self.owner_locations,cursor.as_ref()) {
            (Some(table),Some(cursor))=>table.checked(self,cursor,ctx)?,_=>None,
        };
        self.preflight_carried_checked(schema,path,scope,depth,inherited_policy,ctx,seen,cursor,checked)
    }
    // Each real same-parent loop lazily initializes its own local ordered walk.
    // No future member's semantics run here; filtered/skipped members remain so.
    fn preflight_ordered_child<'a>(&'a self,cursor:Option<&OwnerCursor>,checked:&mut Option<owner_locations::CheckedLocation<'a>>,walk:&mut Option<owner_locations::OrderedOwnerChildren<'a>>,edge:usize,ctx:&mut Context<'_>)->Result<(Option<OwnerCursor>,Option<owner_locations::CheckedLocation<'a>>),EngineError>{
        type Child<'a>=(Option<OwnerCursor>,Option<owner_locations::CheckedLocation<'a>>);
        ctx.charge_work(std::mem::size_of::<Child<'a>>().div_ceil(std::mem::size_of::<usize>())+6,Utf16::default())?;
        if let Some(location)=checked.take(){*walk=Some(location.children(ctx)?);}
        if let Some(walk)=walk {
            let child=walk.child(edge,ctx)?;
            // The cursor clone is retained only for the original arbitrary
            // fallback and deferred callers; borrowed-node custody is separate.
            let cursor=match &child{Some(child)=>{ctx.charge_work(1,Utf16::default())?;Some(child.cursor().clone())},None=>None};
            #[cfg(test)]
            construction_index::scoped_effect_event("sp1-ordered-selection-performed");
            return Ok((cursor,child));
        }
        let selected=child_cursor(Some(self),cursor,edge,ctx)?;
        #[cfg(test)]
        construction_index::scoped_effect_event("sp1-ordered-selection-performed");
        Ok((selected,None))
    }
    fn preflight_carried_checked<'a>(&'a self,schema:&'a Value,path:&mut construction_index::ScopedPreflightPath,scope:&str,depth:usize,inherited_policy:KeywordPolicy,ctx:&mut Context<'_>,seen:&mut BTreeSet<usize>,cursor:Option<OwnerCursor>,mut checked:Option<owner_locations::CheckedLocation<'a>>)->Result<(),EngineError>{
        // Real private checked readback, not a supplied pointer/ordinal claim.
        if let Some(location)=&checked {
            if !location.read(self,ctx)?.is_some_and(|value|std::ptr::eq(value,schema)){checked=None;}
            else {location.observe_consumption("ow1-preflight-consume");}
        }
        ctx.charge_work((std::mem::size_of::<Option<owner_locations::OrderedOwnerChildren<'a>>>()+std::mem::size_of::<Option<owner_locations::CheckedLocation<'a>>>()).div_ceil(std::mem::size_of::<usize>())+2,Utf16::default())?;
        let mut ordered=None;

        path.charge_current_path(1,ctx)?;
        if depth > ctx.limits().max_depth {
            let diagnostic_path=path.diagnostic_snapshot(ctx)?;
            return Err(EngineError::new("LIMIT",diagnostic_path,"Schema nesting depth exceeded"));
        }
        let Value::Object(m) = schema else {
            if matches!(schema, Value::Bool(_)) {
                ctx.charge_work(path.len(),Utf16::default())?;
                let path_text = path.to_utf8().ok();
                let boolean_allowed_by_legacy_keyword =
                    matches!(self.dialect, SchemaDialect::Draft3 | SchemaDialect::Draft4)
                        && path_text.as_deref().is_some_and(|p| {
                            p.ends_with("/additionalProperties") || p.ends_with("/additionalItems")
                        });
                if matches!(self.dialect, SchemaDialect::Draft3 | SchemaDialect::Draft4)
                    && !boolean_allowed_by_legacy_keyword
                {
                    return Err(self.scoped_preflight_schema_error(path,"Boolean schemas are not valid in this dialect",ctx)?);
                }
                return Ok(());
            }
            return Err(self.scoped_preflight_schema_error(path,"Schema must be an object or boolean",ctx)?);
        };
        construction_index::scoped_path_call("sp1-preflight-policy-route",self,path);
        let policy = self.keyword_policy_scoped(schema,path,inherited_policy,ctx)?;
        let known = keywords(self.dialect);
        let scope = if let Some(id) = schema_id(schema) {
            path.charge_current_path(scope.len().saturating_add(id.len()),ctx)?;
            resolve_schema_uri(self.dialect, scope, &id).unwrap_or(id)
        } else {
            scope.to_owned()
        };
        for (member_index,(key, val)) in m.iter().enumerate() {
            let text = match key.to_utf8() {
                Ok(text) => text,
                Err(_) if !self.strict => continue,
                Err(_) => return Err(self.scoped_preflight_schema_error(path,"Schema keyword is not valid Unicode",ctx)?),
            };
            if !policy.keyword_is_active(&text) {
                continue;
            }
            if !known.contains(text.as_str()) {
                if self.strict && !policy.custom {
                    let diagnostic_path=path.diagnostic_snapshot(ctx)?;
                    return Err(EngineError::new(
                        "SCHEMA_UNKNOWN_KEYWORD",
                        diagnostic_path,
                        format!("Unknown schema keyword '{text}'"),
                    ));
                }
                continue;
            }
            ctx.charge_work(std::mem::size_of::<Option<owner_locations::OrderedOwnerChildren<'a>>>().div_ceil(std::mem::size_of::<usize>())+1,Utf16::default())?;
            ctx.charge_work(
                std::mem::size_of::<Option<OwnerCursor>>().div_ceil(std::mem::size_of::<usize>())
                    +std::mem::size_of::<bool>().div_ceil(std::mem::size_of::<usize>())
                    +std::mem::size_of::<Option<owner_locations::CheckedLocation<'a>>>().div_ceil(std::mem::size_of::<usize>())
                    +std::mem::size_of::<Option<construction_index::ScopedPreflightMark>>().div_ceil(std::mem::size_of::<usize>())
                    +4,
                Utf16::default(),
            )?;
            let mut keyword_cursor:Option<OwnerCursor>=None;
            let mut keyword_selected=false;
            let mut keyword_checked=None;
            let mut keyword_ordered=None;
            macro_rules! ensure_keyword_cursor { () => {{
                if !keyword_selected {
                    let (selected,selected_checked)=self.preflight_ordered_child(cursor.as_ref(),&mut checked,&mut ordered,member_index,ctx)?;
                    keyword_cursor=selected; keyword_checked=selected_checked; keyword_selected=true;
                }
            }}; }
            let mut child_mark:Option<construction_index::ScopedPreflightMark>=None;
            macro_rules! child_path { () => {{
                if child_mark.is_none() { let mark=path.mark(ctx)?; if let Err(error)=path.append(key,PathKind::RawSchemaStep,ctx){path.restore_after_failure(mark);return Err(error);} child_mark=Some(mark); }
                path.text()
            }}; }
            macro_rules! child_schema_error { ($message:expr) => {{ child_path!(); let diagnostic=path.diagnostic_snapshot(ctx)?; schema_error(&diagnostic,$message) }}; }
            match text.as_str() {
                "$ref" | "$dynamicRef" | "$recursiveRef" => {
                    if !matches!(val, Value::String(_)) {
                        return Err(child_schema_error!("reference keyword must be a string"));
                    }
                    if self.resolve_references_at_compile {
                        // Preflight validates through the authoritative resolver;
                        // optional runtime reference memoization remains unchanged.
                        child_path!();
                        let reference_path=path.diagnostic_snapshot(ctx)?;
                        let resolved = self.resolve_ref_unplanned(val, &reference_path, Some(scope.as_str()), ctx);
                        #[cfg(test)]
                        preflight_reference_observation::emit(val, &reference_path, &scope, &resolved);
                        resolved?;
                    }
                }
                "$anchor" | "$dynamicAnchor" => {
                    let anchor = match as_utf8(val) {Some(anchor)=>anchor,None=>return Err(child_schema_error!("anchor must be a string"))};
                    let mut chars = anchor.chars();
                    let valid = chars.next().is_some_and(|c| c.is_ascii_alphabetic())
                        && chars.all(|c| {
                            c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | ':' | '-')
                        });
                    if !valid {
                        return Err(child_schema_error!("Invalid schema anchor"));
                    }
                }
                "type" | "disallow" => {
                    // Draft 3's metaschema intentionally permits extension
                    // type names (and delegates their meaning to its type
                    // checker). Later drafts enumerate the primitive names.
                    if self.dialect != SchemaDialect::Draft3 {
                        child_path!();
                        let diagnostic=path.diagnostic_snapshot(ctx)?;
                        validate_type_declaration(val,&diagnostic,self.dialect)?;
                    }
                    if self.dialect == SchemaDialect::Draft3 {
                        match val {
                            Value::Object(_) => {
                                ensure_keyword_cursor!();
                                let selected=clone_owner_cursor(keyword_cursor.as_ref(),ctx)?;
                                let selected_checked=keyword_checked.take();
                                child_path!();
                                self.preflight_carried_checked(val,path,&scope,depth+1,policy,ctx,seen,selected,selected_checked)?;
                            }
                            Value::Array(items) => {
                                for (index, branch) in items.iter().enumerate() {
                                    if matches!(branch, Value::Object(_)) {
                                        ensure_keyword_cursor!();
                                        let (selected,selected_checked)=self.preflight_ordered_child(keyword_cursor.as_ref(),&mut keyword_checked,&mut keyword_ordered,index,ctx)?;
                                        child_path!();
                                        self.with_scoped_preflight_index(path,index,ctx,|path,ctx|self.preflight_carried_checked(branch,path,&scope,depth+1,policy,ctx,seen,selected,selected_checked))?;
                                    }
                                }
                            }
                            _ => (),
                        }
                    }
                }
                "required" => {
                    if self.dialect == SchemaDialect::Draft3 && matches!(val, Value::Bool(_)) {
                        // Draft 3 expresses a required property on the property schema itself.
                    } else {
                        child_path!();
                        let diagnostic=path.diagnostic_snapshot(ctx)?;
                        validate_string_array(val,&diagnostic,true)?;
                    }
                }
                "enum" => {
                    if let Value::Array(items) = val {
                        if items.is_empty()
                            && matches!(self.dialect, SchemaDialect::Draft3 | SchemaDialect::Draft4)
                        {
                            return Err(child_schema_error!("enum must contain at least one value"));
                        }
                    } else {
                        return Err(child_schema_error!("enum must be an array"));
                    }
                }
                "properties" | "patternProperties" | "$defs" | "definitions"
                | "dependentSchemas" => {
                    // Draft 3's `definitions` has no schema semantics in the
                    // predecessor profile. Its contents are opaque annotations;
                    // a `$ref` that later resolves to a boolean fails at runtime.
                    if self.dialect == SchemaDialect::Draft3 && text == "definitions" {
                        continue;
                    }
                    if let Value::Object(children) = val {
                        for (child_index, (name, child_schema)) in children.iter().enumerate() {
                            child_path!();
                            ensure_keyword_cursor!();
                                        let (selected,selected_checked)=self.preflight_ordered_child(keyword_cursor.as_ref(),&mut keyword_checked,&mut keyword_ordered,child_index,ctx)?;
                            self.with_scoped_preflight_child(path,name,PathKind::SchemaPointer,ctx,|path,ctx|{
                                if text == "patternProperties" { let diagnostic=path.diagnostic_snapshot(ctx)?; self.compile_pattern(name,&diagnostic,ctx)?; }
                                self.preflight_carried_checked(child_schema,path,&scope,depth+1,policy,ctx,seen,selected,selected_checked)
                            })?;
                        }
                    } else {
                        return Err(child_schema_error!("Keyword value must be an object"));
                    }
                }
                "items"
                | "additionalItems"
                | "additionalProperties"
                | "unevaluatedProperties"
                | "unevaluatedItems"
                | "contains"
                | "not"
                | "if"
                | "then"
                | "else"
                | "propertyNames" => {
                    if text == "items"
                        && self.dialect == SchemaDialect::Draft2020_12
                        && matches!(val, Value::Array(_))
                    {
                        return Err(child_schema_error!("Draft 2020-12 items must be a schema; use prefixItems for tuple validation"));
                    }
                    if text == "additionalItems"
                        && self.dialect == SchemaDialect::Draft2020_12
                        && self.strict
                    {
                        return Err(child_schema_error!("additionalItems is not available in Draft 2020-12"));
                    }
                    if text == "additionalItems" && self.dialect == SchemaDialect::Draft2020_12 {
                        continue;
                    }
                    if let Value::Array(items) = val {
                        for (i, x) in items.iter().enumerate() {
                            child_path!();
                            ensure_keyword_cursor!();
                                        let (selected,selected_checked)=self.preflight_ordered_child(keyword_cursor.as_ref(),&mut keyword_checked,&mut keyword_ordered,i,ctx)?;
                            self.with_scoped_preflight_index(path,i,ctx,|path,ctx|self.preflight_carried_checked(x,path,&scope,depth+1,policy,ctx,seen,selected,selected_checked))?;
                        }
                    } else {
                        child_path!();
                        ensure_keyword_cursor!();
                                let selected=clone_owner_cursor(keyword_cursor.as_ref(),ctx)?;
                        let selected_checked=keyword_checked.take();
                        self.preflight_carried_checked(val,path,&scope,depth+1,policy,ctx,seen,selected,selected_checked)?;
                    }
                }
                "allOf" | "anyOf" | "oneOf" | "prefixItems" => {
                    if let Value::Array(items) = val {
                        if items.is_empty() && text != "prefixItems" {
                            return Err(child_schema_error!("Applicator array must not be empty"));
                        }
                        for (i, x) in items.iter().enumerate() {
                            child_path!();
                            ensure_keyword_cursor!();
                                        let (selected,selected_checked)=self.preflight_ordered_child(keyword_cursor.as_ref(),&mut keyword_checked,&mut keyword_ordered,i,ctx)?;
                            self.with_scoped_preflight_index(path,i,ctx,|path,ctx|self.preflight_carried_checked(x,path,&scope,depth+1,policy,ctx,seen,selected,selected_checked))?;
                        }
                    } else {
                        return Err(child_schema_error!("Applicator must be an array"));
                    }
                }
                "extends" if self.dialect == SchemaDialect::Draft3 => {
                    if let Value::Array(items) = val {
                        for (index, item) in items.iter().enumerate() {
                            child_path!();
                            ensure_keyword_cursor!();
                                        let (selected,selected_checked)=self.preflight_ordered_child(keyword_cursor.as_ref(),&mut keyword_checked,&mut keyword_ordered,index,ctx)?;
                            self.with_scoped_preflight_index(path,index,ctx,|path,ctx|self.preflight_carried_checked(item,path,&scope,depth+1,policy,ctx,seen,selected,selected_checked))?;
                        }
                    } else {
                        child_path!();
                        ensure_keyword_cursor!();
                                let selected=clone_owner_cursor(keyword_cursor.as_ref(),ctx)?;
                        let selected_checked=keyword_checked.take();
                        self.preflight_carried_checked(val,path,&scope,depth+1,policy,ctx,seen,selected,selected_checked)?;
                    }
                }
                "pattern" => {
                    let Value::String(pat) = val else {
                        return Err(child_schema_error!("pattern must be a string"));
                    };
                    child_path!();
                    let diagnostic=path.diagnostic_snapshot(ctx)?;
                    self.compile_pattern(pat,&diagnostic,ctx)?;
                }
                "minimum" | "maximum" | "exclusiveMinimum" | "exclusiveMaximum" | "multipleOf"
                | "divisibleBy" => {
                    let old_exclusive =
                        matches!(self.dialect, SchemaDialect::Draft3 | SchemaDialect::Draft4)
                            && matches!(text.as_str(), "exclusiveMinimum" | "exclusiveMaximum");
                    if old_exclusive && !matches!(val, Value::Bool(_)) {
                        return Err(child_schema_error!("Exclusive bound flag must be a boolean"));
                    }
                    if !old_exclusive && !matches!(val, Value::Number(_)) {
                        return Err(child_schema_error!("Numeric keyword must be a number"));
                    }
                    if matches!(text.as_str(), "multipleOf" | "divisibleBy")
                        && matches!(val,Value::Number(n) if *n<=0.0)
                    {
                        return Err(child_schema_error!("multipleOf must be greater than zero"));
                    }
                }
                "minLength" | "maxLength" | "minItems" | "maxItems" | "minProperties"
                | "maxProperties" => {
                    if !matches!(val,Value::Number(n) if n.fract()==0.0&&(self.dialect == SchemaDialect::Draft3 || *n>=0.0))
                    {
                        return Err(child_schema_error!("Size keyword must be a non-negative integer"));
                    }
                }
                "minContains" | "maxContains" => {
                    if self.dialect == SchemaDialect::Draft2019_09
                        || self.dialect == SchemaDialect::Draft2020_12
                    {
                        if !matches!(val,Value::Number(n) if n.fract()==0.0&&*n>=0.0) {
                            return Err(child_schema_error!("Size keyword must be a non-negative integer"));
                        }
                    }
                }
                "uniqueItems" => {
                    if !matches!(val, Value::Bool(_)) {
                        return Err(child_schema_error!("uniqueItems must be a boolean"));
                    }
                }
                "dependencies" => {
                    if let Value::Object(deps) = val {
                        for (child_index,(name, dep)) in deps.iter().enumerate() {
                            if matches!(dep, Value::Array(_)) {
                                child_path!();
                                self.with_scoped_preflight_child(path,name,PathKind::SchemaPointer,ctx,|path,ctx|{let diagnostic=path.diagnostic_snapshot(ctx)?;validate_string_array(dep,&diagnostic,true)})?;
                            } else if self.dialect == SchemaDialect::Draft3 && matches!(dep, Value::String(_)) {
                                // Draft 3 permits a string dependency naming a peer property.
                            } else {
                                child_path!();
                                ensure_keyword_cursor!();
                                        let (selected,selected_checked)=self.preflight_ordered_child(keyword_cursor.as_ref(),&mut keyword_checked,&mut keyword_ordered,child_index,ctx)?;
                                self.with_scoped_preflight_child(path,name,PathKind::SchemaPointer,ctx,|path,ctx|self.preflight_carried_checked(dep,path,&scope,depth+1,policy,ctx,seen,selected,selected_checked))?;
                            }
                        }
                    } else { return Err(child_schema_error!("dependencies must be an object")); }
                }
                "dependentRequired" => {
                    if let Value::Object(deps) = val {
                        for (name, dep) in deps {
                            child_path!();
                            self.with_scoped_preflight_child(path,name,PathKind::SchemaPointer,ctx,|path,ctx|{let diagnostic=path.diagnostic_snapshot(ctx)?;validate_string_array(dep,&diagnostic,true)})?;
                        }
                    } else { return Err(child_schema_error!("dependentRequired must be an object")); }
                }
                _ => {}
            }
            if let Some(mark)=child_mark.take(){path.restore(mark,ctx)?;}
        }
        let _ = &mut *seen;
        Ok(())

    }
    fn resolve_eval_ref<'a>(&'a self,reference:&Value,path:&Utf16,ctx:&mut Context<'_>)->Result<(&'a Value,Utf16,bool),EngineError>{
        self.resolve_eval_ref_located(reference,path,ctx).map(|(value,path,applied,_)|(value,path,applied))
    }
    fn resolve_eval_ref_located<'a>(&'a self,reference:&Value,path:&Utf16,ctx:&mut Context<'_>)->Result<(&'a Value,Utf16,bool,Option<OwnerCursor>),EngineError>{
        if let Some(plans)=&self.owner_plans{return plans.resolve_eval_located(self,reference,path,ctx);}
        self.resolve_eval_ref_unplanned(reference,path,ctx).map(|(value,path,applied)|(value,path,applied,None))
    }
    fn resolve_eval_ref_unplanned<'a>(&'a self,reference:&Value,path:&Utf16,ctx:&mut Context<'_>)->Result<(&'a Value,Utf16,bool),EngineError>{
        let(value,path,applied,_)=self.resolve_eval_location_impl(reference,path,false,ctx)?;Ok((value,path,applied))
    }
    fn resolve_eval_ref_unplanned_located<'a>(&'a self,reference:&Value,path:&Utf16,ctx:&mut Context<'_>)->Result<(&'a Value,Utf16,bool,Option<OwnerCursor>),EngineError>{
        self.resolve_eval_location_impl(reference,path,true,ctx)
    }
    fn resolve_eval_location_impl<'a>(&'a self,reference:&Value,path:&Utf16,tracked:bool,ctx:&mut Context<'_>)->Result<(&'a Value,Utf16,bool,Option<OwnerCursor>),EngineError>{
        let (target,target_path,cursor)=if tracked {
            match &self.owner_plans {Some(plans)=>plans.resolve_located(self,reference,path,None,ctx),None=>self.resolve_ref_unplanned_located(reference,path,None,ctx)}
        } else {self.resolve_ref(reference,path,ctx).map(|(value,path)|(value,path,None))}.map_err(|error| {
            if matches!(self.regex_profile, RegexProfile::Python(_))
                && error.code == "SCHEMA_REF_UNRESOLVED"
            {
                error.with_python_schema_terminal(PythonSchemaTerminal::LocalReference)
            } else {
                error
            }
        })?;
        let mut id_applied = false;
        if !matches!(self.regex_profile, RegexProfile::Python(_)) {
            let is_pointer_fragment = as_utf8(reference).is_some_and(|text| {
                text.split_once('#')
                    .is_some_and(|(_, fragment)| fragment.starts_with('/'))
            });
            if is_pointer_fragment {
                // JSON Pointer traversal normalizes each entered schema path below.
                id_applied = true;
            } else if let Some(origin) = target_path
                .to_utf8()
                .ok()
                .and_then(|text| text.split_once('#').map(|(base, _)| base.to_owned()))
            {
                let indexed_root=if let Some(index)=&self.cold_resource_index {
                    index.lookup_text(&origin,ctx)?.map(|root|index.root(self,root))
                } else {None};
                if let Some(root)=indexed_root {
                    id_applied=std::ptr::eq(root,target);
                    return Ok((target,target_path,id_applied,cursor));
                }
                let mut root = (schema_id(&*self.schema).as_deref() == Some(origin.as_str()))
                    .then_some(&*self.schema);
                if root.is_none() {
                    for (uri, value) in &self.catalogue_entries() {
                        ctx.charge_work(uri.len().saturating_add(1), Utf16::default())?;
                        if uri.to_utf8().ok().as_deref() == Some(origin.as_str()) {
                            root = Some(value);
                            break;
                        }
                    }
                }
                if root.is_none() {
                    root = find_embedded_resource(&*self.schema, &origin, self.dialect, ctx, path)?;
                }
                if root.is_none() {
                    for (_, value) in &self.catalogue_entries() {
                        root = find_embedded_resource(value, &origin, self.dialect, ctx, path)?;
                        if root.is_some() {
                            break;
                        }
                    }
                }
                if root.is_some_and(|root| std::ptr::eq(root, target)) {
                    id_applied = true;
                }
            }
        }
        Ok((target, target_path, id_applied, cursor))
    }

    fn python_record_reference_lookup(
        &self,
        keyword: &str,
        reference: &Value,
        evaluated: &mut Evaluated,
        ctx: &mut Context<'_>,
    ) -> Result<(), EngineError> {
        if !matches!(self.regex_profile, RegexProfile::Python(_)) {
            return Ok(());
        }
        ctx.charge_work_u64(
            btree_index_lookup_work(self.python_reference_targets.len()),
            Utf16::default(),
        )?;
        let Some(bound) = self
            .python_reference_targets
            .get(&(reference as *const Value as usize))
        else {
            return Ok(());
        };
        let Some(current_uri) = bound.source_resource_uri.as_ref() else {
            return Ok(());
        };
        if current_uri.is_empty() {
            return Ok(());
        }
        // Source consumers admit local references; recursiveRef always looks up #.
        // Preserve the lookup distinction for explicitly supplied strict resources.
        ctx.charge_work_u64(
            btree_index_lookup_work(self.python_source_strings.len()),
            Utf16::default(),
        )?;
        let source = if let Value::String(value) = reference {
            self.python_source_strings
                .get(&(value as *const Utf16 as usize))
        } else {
            None
        };
        let lookup_owned =
            if keyword == "$recursiveRef" && self.dialect == SchemaDialect::Draft2019_09 {
                None
            } else if let Some(source) = source {
                ctx.charge_work(source.len(), Utf16::default())?;
                let end = source
                    .codepoints()
                    .iter()
                    .position(|p| *p == b'#' as u32)
                    .unwrap_or(source.len());
                if end == 0 {
                    None
                } else {
                    let base = PythonResourceUri::from_points(&source.codepoints()[..end], ctx)?;
                    current_uri.join(&base, ctx)?.or(Some(base))
                }
            } else {
                None
            };
        let should_push = evaluated.python_recursive_history.is_empty()
            || if let Some(lookup) = &lookup_owned {
                !lookup.same(current_uri, ctx)?
            } else {
                false
            };
        if should_push {
            ctx.charge_work_u64(
                current_uri.len() as u64
                    + bound.resource_root_indices.len() as u64
                    + evaluated.python_recursive_history.len() as u64
                    + 3,
                Utf16::default(),
            )?;
            evaluated.python_recursive_history.insert(
                0,
                PythonResourceLocator {
                    uri: current_uri.clone(),
                    resource: bound.resource,
                    root_indices: bound.resource_root_indices.clone(),
                    recursive_anchor: bound.source_resource_recursive_anchor,
                },
            );
        }
        Ok(())
    }
    fn python_recursive_retarget<'a>(
        &'a self,
        reference: &Value,
        evaluated: &Evaluated,
        ctx: &mut Context<'_>,
    ) -> Result<(&'a Value, Utf16), EngineError> {
        let (mut target, mut path) = self.resolve_python_source_resource(reference, ctx)?;
        if !matches!(get(target, "$recursiveAnchor"), Some(Value::Bool(true))) {
            return Ok((target, path));
        }
        for entry in &evaluated.python_recursive_history {
            ctx.charge_work(1, Utf16::default())?;
            if !entry.recursive_anchor {
                break;
            }
            (target, path) =
                self.python_resource_location(entry.resource, &entry.root_indices, ctx)?;
        }
        Ok((target, path))
    }
    fn python_resource_display_path(
        &self,
        root: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Utf16, EngineError> {
        ctx.charge_work_u64(
            btree_index_lookup_work(self.python_resource_roots.len()) + 1,
            Utf16::default(),
        )?;
        if let Some(locator) = self
            .python_resource_roots
            .get(&(root as *const Value as usize))
        {
            locator.uri.display_path(ctx)
        } else {
            ctx.charge_work(1, Utf16::default())?;
            Ok(Utf16::from("#"))
        }
    }

    fn python_resource_location<'a>(
        &'a self,
        resource: Option<usize>,
        indices: &[usize],
        ctx: &mut Context<'_>,
    ) -> Result<(&'a Value, Utf16), EngineError> {
        ctx.charge_work_u64(indices.len() as u64 + 1, Utf16::default())?;
        let mut current = if let Some(index) = resource {
            self.catalogue_entries().get(index).map(|(_, v)| v)
        } else {
            Some(&*self.schema)
        }
        .ok_or_else(|| schema_error(&Utf16::default(), "Python source resource is unavailable"))?;
        let mut path = self.python_resource_display_path(current, ctx)?;
        for index in indices {
            current = match current {
                Value::Object(members) => {
                    let (key, value) = members
                        .get(*index)
                        .ok_or_else(|| schema_error(&path, "Python source resource changed"))?;
                    path = self.schema_pointer(&path, key, ctx)?;
                    value
                }
                Value::Array(items) => {
                    let value = items
                        .get(*index)
                        .ok_or_else(|| schema_error(&path, "Python source resource changed"))?;
                    ctx.charge_work(path.len().saturating_add(22), Utf16::default())?;
                    path = append_schema_path(&path, &index.to_string());
                    value
                }
                _ => return Err(schema_error(&path, "Python source resource changed")),
            };
            path = self.effective_schema_path(current, &path, ctx)?;
        }
        Ok((current, path))
    }
    fn python_scope_node<'a>(
        &'a self,
        address: usize,
        ctx: &mut Context<'_>,
    ) -> Result<&'a Value, EngineError> {
        fn find<'a>(
            node: &'a Value,
            address: usize,
            ctx: &mut Context<'_>,
        ) -> Result<Option<&'a Value>, EngineError> {
            ctx.charge_work(1, Utf16::default())?;
            if node as *const Value as usize == address {
                return Ok(Some(node));
            }
            match node {
                Value::Object(members) => {
                    for (_, child) in members {
                        if let Some(found) = find(child, address, ctx)? {
                            return Ok(Some(found));
                        }
                    }
                }
                Value::Array(items) => {
                    for child in items {
                        if let Some(found) = find(child, address, ctx)? {
                            return Ok(Some(found));
                        }
                    }
                }
                _ => {}
            }
            Ok(None)
        }
        if let Some(node) = find(&*self.schema, address, ctx)? {
            return Ok(node);
        }
        for (_, root) in &self.catalogue_entries() {
            if let Some(node) = find(root, address, ctx)? {
                return Ok(node);
            }
        }
        Err(schema_error(
            &Utf16::default(),
            "Python dynamic scope node is unavailable",
        ))
    }

    fn resolve_python_source_resource<'a>(
        &'a self,
        reference: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<(&'a Value, Utf16), EngineError> {
        ctx.charge_work_u64(
            btree_index_lookup_work(self.python_reference_targets.len()),
            Utf16::default(),
        )?;
        if let Some(bound) = self
            .python_reference_targets
            .get(&(reference as *const Value as usize))
        {
            self.python_resource_location(bound.resource, &bound.resource_root_indices, ctx)
        } else {
            self.python_resource_location(None, &[], ctx)
        }
    }

    fn resolve_ref<'a>(
        &'a self,
        reference: &Value,
        path: &Utf16,
        ctx: &mut Context<'_>,
    ) -> Result<(&'a Value, Utf16), EngineError> {
        self.resolve_ref_scoped(reference, path, None, ctx)
    }

    fn resolve_ref_with_scope<'a>(
        &'a self,
        reference: &Value,
        path: &Utf16,
        scope: &str,
        ctx: &mut Context<'_>,
    ) -> Result<(&'a Value, Utf16), EngineError> {
        self.resolve_ref_scoped(reference, path, Some(scope), ctx)
    }

    fn resolve_ref_scoped<'a>(
        &'a self,
        reference: &Value,
        path: &Utf16,
        scope_override: Option<&str>,
        ctx: &mut Context<'_>,
    ) -> Result<(&'a Value, Utf16), EngineError> {
        if let Some(plans) = &self.owner_plans {
            return plans.resolve(self,reference,path,scope_override,ctx);
        }
        self.resolve_ref_unplanned(reference,path,scope_override,ctx)
    }
    fn resolve_ref_unplanned<'a>(&'a self,reference:&Value,path:&Utf16,scope_override:Option<&str>,ctx:&mut Context<'_>)->Result<(&'a Value,Utf16),EngineError>{
        let(value,path,_)=self.resolve_ref_location_impl(reference,path,scope_override,false,ctx)?;
        Ok((value,path))
    }
    // Selected locations come ONLY from the actual first-match resolver and
    // traversal. An absent optional cursor keeps the uncached original route.
    fn resolve_ref_unplanned_located<'a>(&'a self,reference:&Value,path:&Utf16,scope_override:Option<&str>,ctx:&mut Context<'_>)->Result<(&'a Value,Utf16,Option<OwnerCursor>),EngineError>{
        self.resolve_ref_location_impl(reference,path,scope_override,true,ctx)
    }
    fn member_cursor(&self,schema:&Value,parent:Option<&OwnerCursor>,name:&str,ctx:&mut Context<'_>)->Result<Option<OwnerCursor>,EngineError>{
        let Some(parent)=parent else{return Ok(None);};
        let Some(table)=&self.owner_locations else{return Ok(None);};
        if !table.read(self,parent,ctx)?.is_some_and(|value|std::ptr::eq(value,schema)){return Ok(None);}
        let Value::Object(members)=schema else{return Ok(None);};
        for(index,(key,_))in members.iter().enumerate(){
            ctx.charge_work(key.len().saturating_mul(3).saturating_add(1),Utf16::default())?;
            if key.to_utf8().ok().as_deref()==Some(name){return table.child(self,parent,index,ctx);}
        }
        Ok(None)
    }
    fn location_for_root_value(&self,value:&Value,ctx:&mut Context<'_>)->Result<Option<OwnerCursor>,EngineError>{
        let Some(table)=&self.owner_locations else{return Ok(None);};
        ctx.charge_work(self.catalogue_entries().len().saturating_add(1),Utf16::default())?;
        let mut role=if std::ptr::eq(value,&*self.schema){Some(0)}else{None};
        for(i,(_,root))in self.catalogue_entries().iter().enumerate(){if std::ptr::eq(value,root){if role.is_some(){return Ok(None);}role=Some(i+1);}}
        match role{Some(role)=>table.root(self,role,ctx),None=>Ok(None)}
    }
    fn location_root(&self,role:usize,tracked:bool,ctx:&mut Context<'_>)->Result<Option<OwnerCursor>,EngineError>{
        if !tracked {return Ok(None);}
        match &self.owner_locations {Some(table)=>table.root(self,role,ctx),None=>Ok(None)}
    }
    fn resolve_ref_location_impl<'a>(&'a self, reference:&Value,path:&Utf16,scope_override:Option<&str>,tracked:bool,ctx:&mut Context<'_>)->Result<(&'a Value,Utf16,Option<OwnerCursor>),EngineError>{
        ctx.with_constructor_site("ctor.reference", |ctx| {
        ctx.charge_work_u64(
            path.len() as u64 + btree_index_lookup_work(self.python_reference_targets.len()) + 1,
            Utf16::default(),
        )?;
        if let Some(target) = self
            .python_reference_targets
            .get(&(reference as *const Value as usize))
        {
            if matches!(target.failure, Some(PythonReferenceFailure::Unresolved)) {
                return Err(EngineError::new(
                    "SCHEMA_REF_UNRESOLVED",
                    path.clone(),
                    "Schema reference target does not exist",
                )
                .with_python_schema_terminal(PythonSchemaTerminal::LocalReference));
            }
            if let Some(PythonReferenceFailure::InvalidArrayIndex) = target.failure {
                return Err(EngineError::new(
                    "PYTHON_SCHEMA_EVALUATION",
                    path.clone(),
                    "Invalid array index in schema reference",
                )
                .with_python_schema_terminal(PythonSchemaTerminal::LocalReference));
            }
            if let Some(PythonReferenceFailure::InvalidTraversal) = target.failure {
                return Err(EngineError::new(
                    "PYTHON_SCHEMA_EVALUATION",
                    path.clone(),
                    "Invalid schema reference traversal",
                )
                .with_python_schema_terminal(PythonSchemaTerminal::LocalReference));
            }
            let mut current = if let Some(index) = target.resource {
                self.catalogue_entries().get(index).map(|(_, value)| value)
            } else {
                Some(&*self.schema)
            }
            .ok_or_else(|| schema_error(path, "Python source reference resource is unavailable"))?;
            let mut target_path = self.python_resource_display_path(current, ctx)?;
            ctx.charge_work_u64(
                target.indices.len() as u64 + target.resource_root_indices.len() as u64,
                Utf16::default(),
            )?;
            for index in &target.resource_root_indices {
                current = match current {
                    Value::Object(members) => {
                        let (key, value) = members.get(*index).ok_or_else(|| {
                            schema_error(path, "Python source reference resource changed")
                        })?;
                        target_path = self.schema_pointer(&target_path, key, ctx)?;
                        value
                    }
                    Value::Array(items) => {
                        let value = items.get(*index).ok_or_else(|| {
                            schema_error(path, "Python source reference resource changed")
                        })?;
                        ctx.charge_work(target_path.len().saturating_add(22), Utf16::default())?;
                        target_path = append_schema_path(&target_path, &index.to_string());
                        value
                    }
                    _ => {
                        return Err(schema_error(
                            path,
                            "Python source reference resource changed",
                        ));
                    }
                };
            }
            if !target.resource_root_indices.is_empty() {
                target_path = self.effective_schema_path(current, &target_path, ctx)?;
            }
            for index in &target.indices {
                current = match current {
                    Value::Object(members) => {
                        let (key, value) = members.get(*index).ok_or_else(|| {
                            schema_error(path, "Python source reference target changed")
                        })?;
                        target_path = self.schema_pointer(&target_path, key, ctx)?;
                        value
                    }
                    Value::Array(items) => {
                        let value = items.get(*index).ok_or_else(|| {
                            schema_error(path, "Python source reference target changed")
                        })?;
                        ctx.charge_work(target_path.len().saturating_add(22), Utf16::default())?;
                        target_path = append_schema_path(&target_path, &index.to_string());
                        value
                    }
                    _ => return Err(schema_error(path, "Python source reference target changed")),
                };
                // Pointer traversal can enter a recognized resource in any dialect.
                // `tsp` must then be relative to that resource so evaluation
                // errors and subsequent references use the correct origin.
                if matches!(self.regex_profile, RegexProfile::Python(_)) {
                    target_path = self.effective_schema_path(current, &target_path, ctx)?;
                }
            }
            return Ok((current, target_path, None));
        }
        if let Value::String(reference) = reference {
            ctx.charge_work(reference.len(), path.clone())?;
        }
        let text = as_utf8(reference).ok_or_else(|| schema_error(path, "$ref must be a string"))?;
        let (base, fragment) = text.split_once('#').unwrap_or((&text, ""));
        // A relative reference within an externally supplied resource resolves
        // against that resource's root, not the primary schema's root.
        let current_origin = scope_override
            .map(str::to_owned)
            .or_else(|| {
                path.to_utf8()
                    .ok()
                    .and_then(|p| p.split_once('#').map(|(id, _)| id.to_owned()))
                    .filter(|origin| !origin.is_empty())
                    .or_else(|| schema_id(&*self.schema))
            })
            .unwrap_or_default();
        let effective_base = if base.is_empty() {
            if current_origin.is_empty() {
                schema_id(&*self.schema).unwrap_or_default()
            } else {
                current_origin
            }
        } else if base.contains(':') {
            base.to_owned()
        } else {
            resolve_schema_uri(self.dialect, &current_origin, base).ok_or_else(|| {
                EngineError::new(
                    "SCHEMA_REF_UNRESOLVED",
                    path.clone(),
                    "Relative schema reference has no absolute base URI",
                )
            })?
        };
        let indexed_root=if let Some(index)=&self.cold_resource_index {
            if effective_base.is_empty() {Some((&*self.schema,0))}
            else {index.lookup_text(&effective_base,ctx)?.map(|root| (index.root(self,root),match index.location(root){construction_index::RootLocation::Root=>0,construction_index::RootLocation::Catalogue(i)=>i+1}))}
        } else {None};
        let owner=tracked.then_some(self);
        let selected = if let Some((value,role))=indexed_root {
            LocatedNode{value,cursor:self.location_root(role,tracked,ctx)?}
        } else if effective_base.is_empty() || schema_id(&*self.schema).as_deref()==Some(effective_base.as_str()) {
            LocatedNode{value:&*self.schema,cursor:self.location_root(0,tracked,ctx)?}
        } else {
            let mut selected=None;
            for (i,(id,value)) in self.catalogue_entries().iter().enumerate() {
                ctx.charge_work(1,path.clone())?;
                if id.to_utf8().ok().as_deref()==Some(effective_base.as_str()) {
                    selected=Some(LocatedNode{value,cursor:self.location_root(i+1,tracked,ctx)?});break;
                }
            }
            if selected.is_none() {
                let cursor=self.location_root(0,tracked,ctx)?;
                selected=find_embedded_resource_located(&*self.schema,&effective_base,self.dialect,ctx,path,owner,cursor)?;
            }
            if selected.is_none() {
                for(i,(id,value))in self.catalogue_entries().iter().enumerate(){
                    let cursor=self.location_root(i+1,tracked,ctx)?;
                    if let Some(found)=find_embedded_resource_located(value,&effective_base,self.dialect,ctx,path,owner,cursor)?{selected=Some(found);break;}
                    if id.to_utf8().ok().as_deref()==Some(effective_base.as_str()) {
                        selected=Some(LocatedNode{value,cursor:self.location_root(i+1,tracked,ctx)?});break;
                    }
                }
            }
            selected.ok_or_else(||EngineError::new("SCHEMA_REF_UNRESOLVED",path.clone(),"Schema reference is not in the supplied resource set"))?
        };
        let root=selected.value;
        let mut cursor=selected.cursor;
        let mut current = root;
        let mut schema_path = effective_base.encode_utf16().collect::<Vec<_>>();
        schema_path.push(0x23);
        if matches!(self.regex_profile, RegexProfile::Python(_)) {
            schema_path.extend(fragment.encode_utf16());
        }
        let mut sp = Utf16::new(schema_path);
        if !fragment.is_empty() {
            ctx.charge_work(fragment.len(), path.clone())?;
            let decoded_fragment = percent_decode_fragment(fragment);
            if decoded_fragment.starts_with('/') {
                for part in decoded_fragment[1..].split('/') {
                    let key = unescape_pointer(part);
                    let traversing_scalar = !matches!(current, Value::Object(_) | Value::Array(_));
                    let (next, next_path) = match current {
                        Value::Object(m) => {
                            ctx.charge_work(m.len(), path.clone())?;
                            let (member_index,(key, value)) = m
                                .iter().enumerate()
                                .find(|(_, (k, _))| k.units() == key.as_slice())
                                .ok_or_else(|| {
                                    if traversing_scalar
                                        && matches!(self.regex_profile, RegexProfile::Python(_))
                                    {
                                        EngineError::new(
                                            "PYTHON_SCHEMA_EVALUATION",
                                            path.clone(),
                                            "Schema reference path traverses a non-container value",
                                        )
                                        .with_python_schema_terminal(
                                            PythonSchemaTerminal::LocalReference,
                                        )
                                    } else {
                                        EngineError::new(
                                            "SCHEMA_REF_UNRESOLVED",
                                            path.clone(),
                                            "Schema reference target does not exist",
                                        )
                                    }
                                })?;
                            cursor=child_cursor(owner,cursor.as_ref(),member_index,ctx)?;
                            let next_path = if matches!(self.regex_profile, RegexProfile::Python(_))
                            {
                                sp.clone()
                            } else {
                                self.schema_pointer(&sp, key, ctx)?
                            };
                            (value, next_path)
                        }
                        Value::Array(a) => {
                            let index = part.parse::<usize>().ok();
                            let value = index.and_then(|i| a.get(i)).ok_or_else(|| {
                                EngineError::new(
                                    "SCHEMA_REF_UNRESOLVED",
                                    path.clone(),
                                    "Schema reference target does not exist",
                                )
                            })?;
                            let index = index.unwrap_or_default();
                            cursor=child_cursor(owner,cursor.as_ref(),index,ctx)?;
                            if matches!(self.regex_profile, RegexProfile::Python(_)) {
                                (value, sp.clone())
                            } else {
                                ctx.charge_work(sp.len().saturating_add(22), Utf16::default())?;
                                (value, append_schema_path(&sp, &index.to_string()))
                            }
                        }
                        _ => {
                            return Err(
                                if traversing_scalar
                                    && matches!(self.regex_profile, RegexProfile::Python(_))
                                {
                                    EngineError::new(
                                        "PYTHON_SCHEMA_EVALUATION",
                                        path.clone(),
                                        "Schema reference path traverses a non-container value",
                                    )
                                    .with_python_schema_terminal(
                                        PythonSchemaTerminal::LocalReference,
                                    )
                                } else {
                                    EngineError::new(
                                        "SCHEMA_REF_UNRESOLVED",
                                        path.clone(),
                                        "Schema reference target does not exist",
                                    )
                                },
                            );
                        }
                    };
                    current = next;
                    if !matches!(self.regex_profile, RegexProfile::Python(_)) {
                        let normalized = self.effective_schema_path(current, &next_path, ctx)?;
                        let entered_resource = schema_id(current).is_some();
                        sp = preserve_schema_fragment(
                            &normalized,
                            &next_path,
                            entered_resource,
                            ctx,
                        )?;
                    }
                }
            } else {
                let anchor_cursor=clone_owner_cursor(cursor.as_ref(),ctx)?;
                let found=if let Some(anchor)=find_anchor_located(root,&decoded_fragment,self.dialect,ctx,path,owner,anchor_cursor)? {anchor}
                else {find_legacy_id_fragment_located(root,&decoded_fragment,self.dialect,ctx,path,owner,cursor)?
                    .ok_or_else(||EngineError::new("SCHEMA_REF_UNRESOLVED",path.clone(),"Schema anchor does not exist"))?};
                current=found.value;cursor=found.cursor;
            }
        }
        Ok((current, sp, cursor))

        })
    }
    fn draft3_type_matches<T: InstanceView>(
        &self,
        rule: &Value,
        data: &T,
        ip: &EvaluationPathPair,
        kp: &EvaluationPathPair,
        depth: usize,
        cursor: Option<&OwnerCursor>,
        ctx: &mut Context<'_>,
    ) -> Result<bool, EngineError> {
        let branches: Vec<(usize, &Value)> = match rule {
            Value::Object(_) => vec![(0, rule)],
            Value::Array(items) => items.iter().enumerate().collect(),
            _ => return Ok(type_matches(rule, data, self.dialect)),
        };
        for (index, branch) in branches {
            match branch {
                Value::Object(_) => {
                    let mut errors = Vec::new();
                    let mut evaluated = Evaluated::default();
                    evaluated.mode = EvaluationMode::FirstError;
                    evaluated.selected_cursor=if matches!(rule,Value::Array(_)){child_cursor(Some(self),cursor,index,ctx)?}else{clone_owner_cursor(cursor,ctx)?};
                    self.eval(
                        branch,
                        data,
                        ip,
                        &self.pair_eval_schema_step(kp, &index.to_string(), ctx)?,
                        depth + 1,
                        ctx,
                        &mut errors,
                        &mut evaluated,
                    )?;
                    if errors.is_empty() {
                        return Ok(true);
                    }
                }
                _ if type_matches(branch, data, self.dialect) => return Ok(true),
                _ => (),
            }
        }
        Ok(false)
    }

    fn eval<T: InstanceView>(
        &self,
        schema: &Value,
        data: &T,
        ip: &EvaluationPathPair,
        sp: &EvaluationPathPair,
        depth: usize,
        ctx: &mut Context<'_>,
        out: &mut Vec<StructuralError>,
        evaluated: &mut Evaluated,
    ) -> Result<(), EngineError> {
        self.eval_resolved(schema, data, ip, sp, depth, ctx, out, evaluated, false)
    }

    fn effective_frame_unplanned(&self,schema:&Value,sp:&Utf16,id_already_applied:bool,ctx:&mut Context<'_>) -> Result<Utf16,EngineError> {
        if self.cold_resource_index.is_some() && self.indexed_path_unchanged(schema,sp,id_already_applied,ctx)? {
            ctx.charge_work(sp.clone_work(),Utf16::default())?;
            Ok(sp.clone())
        } else if id_already_applied {
            ctx.charge_work(sp.clone_work(),Utf16::default())?;
            Ok(sp.clone())
        } else { self.effective_schema_path(schema,sp,ctx) }
    }
    fn eval_resolved<T: InstanceView>(
        &self,
        schema: &Value,
        data: &T,
        ip: &EvaluationPathPair,
        sp: &EvaluationPathPair,
        depth: usize,
        ctx: &mut Context<'_>,
        out: &mut Vec<StructuralError>,
        evaluated: &mut Evaluated,
        id_already_applied: bool,
    ) -> Result<(), EngineError> {
        let incoming=clone_owner_cursor(evaluated.selected_cursor.as_ref(),ctx)?;
        let mut guard = EvaluationScope::enter(evaluated,ctx)?;
        let evaluated = &mut *guard.state;
        evaluated.schema_cursor=match(incoming,&self.owner_locations){
            (Some(cursor),Some(table))=>if table.read(self,&cursor,ctx)?.is_some_and(|value|std::ptr::eq(value,schema)){Some(cursor)}else{None},
            _=>None,
        };
        let previous_policy = evaluated.keyword_policy;
        // Resolve the original frame first. Custody follows the semantic
        // unchanged-frame predicate, never an equal-text/pointer observation.
        let frame_text = if let Some(plans)=&self.owner_plans {
            plans.frame_at(self,schema,sp,id_already_applied,evaluated.schema_cursor.as_ref(),ctx)?
        } else {
            self.effective_frame_unplanned(schema,sp,id_already_applied,ctx)?
        };
        // Additional eligibility/branch observations and disposal of the
        // already-paid unused frame spelling are admitted before effects.
        ctx.charge_work(5, Utf16::default())?;
        let inherited_frame = self.owner_plans.is_some() &&
            (id_already_applied || (self.cold_resource_index.is_some() &&
                self.indexed_path_unchanged(schema,sp,id_already_applied,ctx)?));
        let scoped_path = if inherited_frame {
            // Original frame materialization above remains paid; the actual
            // incoming pair carries its own custody, independently of that text.
            sp.clone_with_context(ctx)?
        } else {
            self.evaluator_origin_path(frame_text,ctx)?
        };
        construction_index::path_call("pth-evaluator-frame",self,scoped_path.carried());
        if let Some(index)=&self.cold_resource_index {
            let root=if let Some(prior)=evaluated.resolved_resource {
                if index.matches_frame_carried(self,prior,scoped_path.carried(),ctx)? {Some(prior)}
                else {index.select_carried(self,scoped_path.carried(),construction_index::PathSelector::Common,ctx)?}
            } else {index.select_carried(self,scoped_path.carried(),construction_index::PathSelector::Common,ctx)?};
            evaluated.resolved_resource=root;
            evaluated.keyword_policy=if construction_index::get_ascii_metered(schema,"$schema",ctx,&scoped_path)?.is_some() {
                self.explicit_keyword_policy(schema,previous_policy,ctx)?
            } else if scoped_path.units().first()==Some(&35) {previous_policy}
            else if let Some(root)=root {index.policy(self,root,previous_policy,ctx)?}
            else {self.keyword_policy_carried(schema,scoped_path.carried(),previous_policy,ctx)?};
        } else {
            evaluated.keyword_policy=self.keyword_policy_carried(schema,scoped_path.carried(),previous_policy,ctx)?;
        }
        // Draft 2020-12 dynamic scope is a chain of entered schema resources,
        // not a stack of only the dynamically anchored nodes visited by normal
        // applicator evaluation. A resource's anchors may live in `$defs` and
        // still participate when a reference enters that resource. Register
        // those anchors at resource entry, in resource traversal order.
        if self.dialect == SchemaDialect::Draft2020_12
            && !matches!(self.regex_profile, RegexProfile::Python(_))
        {
            let handled=if let (Some(index),Some(root))=(&self.cold_resource_index,evaluated.resolved_resource) {
                index.enter_anchors_carried(self,root,scoped_path.carried(),evaluated,ctx)?
            } else {false};
            if !handled {
                if let Some((resource,resource_path))=self.dynamic_resource_for_carried(scoped_path.carried(),ctx)? {
                    self.push_resource_dynamic_anchors(resource,&resource_path,evaluated,ctx)?;
                }
            }
        } else if let Some(Value::String(anchor)) = get(schema, "$dynamicAnchor") {
            // Python's qualified Draft 2020-12 profile retains the historical
            // per-node stack; resource-wide dynamic-anchor discovery is only
            // used by the ECMAScript validator path.
            ctx.charge_work_u64(
                anchor.len() as u64 + scoped_path.len() as u64 + 2,
                Utf16::default(),
            )?;
            evaluated.dynamic_scope.push((
                anchor.units().to_vec(),
                scoped_path.as_ref().clone(),
                schema as *const Value as usize,
            ), ctx)?
        } else if self.dialect == SchemaDialect::Draft2019_09
            && matches!(get(schema, "$recursiveAnchor"), Some(Value::Bool(true)))
        {
            ctx.charge_work_u64(scoped_path.len() as u64 + 1, Utf16::default())?;
            evaluated.dynamic_scope.push((
                Vec::new(),
                scoped_path.as_ref().clone(),
                schema as *const Value as usize,
            ), ctx)?
        }
        let result = if evaluated.annotation_scan
            && (self.uses_python_2019_annotation_profile()
                || self.uses_python_2020_annotation_profile())
        {
            self.visit_python_annotations(schema, data, ip, &scoped_path, depth, ctx, evaluated)
        } else {
            self.eval_inner(schema, data, ip, &scoped_path, depth, ctx, out, evaluated)
        };
        result
    }

    fn push_resource_dynamic_anchors(
        &self,
        resource: &Value,
        resource_path: &Utf16,
        evaluated: &mut Evaluated,
        ctx: &mut Context<'_>,
    ) -> Result<(), EngineError> {
        if let (Some(index),Some(root))=(&self.cold_resource_index,evaluated.resolved_resource) {
            if index.root_only_anchors(root) && std::ptr::eq(index.root(self,root),resource) {
                let Some(Value::String(anchor))=construction_index::get_ascii_metered(resource,"$dynamicAnchor",ctx,resource_path)? else {return Ok(());};
                let address=resource as *const Value as usize;
                for (_,_,prior) in &evaluated.dynamic_scope {
                    ctx.charge_work(1,Utf16::default())?;
                    if *prior==address {return Ok(());}
                }
                ctx.charge_work(anchor.len().saturating_add(resource_path.len()).saturating_add(2),Utf16::default())?;
                evaluated.dynamic_scope.push((anchor.units().to_vec(),resource_path.clone(),address),ctx)?;
                return Ok(());
            }
        }
        let resource_address = resource as *const Value as usize;
        let cached = self
            .dynamic_anchor_cache
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .get(&resource_address)
            .cloned();
        if let Some(anchors) = cached {
            ctx.charge_work(1, Utf16::default())?;
            for (name, anchor_path, address) in anchors.iter() {
                let mut already_registered = false;
                for (_, _, existing_address) in &evaluated.dynamic_scope {
                    ctx.charge_work(1, Utf16::default())?;
                    if *existing_address == *address {
                        already_registered = true;
                        break;
                    }
                }
                if !already_registered {
                    ctx.charge_work_u64(
                        name.len() as u64 + anchor_path.len() as u64 + 2,
                        Utf16::default(),
                    )?;
                    evaluated
                        .dynamic_scope
                        .push((name.clone(), anchor_path.clone(), *address), ctx)?;
                }
            }
            return Ok(());
        }
        let mut discovered = Vec::new();
        fn pointer_path(
            owner: &CompiledSchema,
            node: &Value,
            address: usize,
            path: &Utf16,
            ctx: &mut Context<'_>,
        ) -> Result<Option<Utf16>, EngineError> {
            ctx.charge_work(1, Utf16::default())?;
            if node as *const Value as usize == address {
                return Ok(Some(path.clone()));
            }
            match node {
                Value::Object(members) => {
                    for (key, child) in members {
                        let child_path = owner.schema_pointer(path, key, ctx)?;
                        if let Some(found) = pointer_path(owner, child, address, &child_path, ctx)?
                        {
                            return Ok(Some(found));
                        }
                    }
                }
                Value::Array(items) => {
                    for (index, child) in items.iter().enumerate() {
                        ctx.charge_work(path.len().saturating_add(22), Utf16::default())?;
                        let child_path = append_schema_path(path, &index.to_string());
                        if let Some(found) = pointer_path(owner, child, address, &child_path, ctx)?
                        {
                            return Ok(Some(found));
                        }
                    }
                }
                _ => {}
            }
            Ok(None)
        }
        fn visit(
            owner: &CompiledSchema,
            resource: &Value,
            node: &Value,
            is_root: bool,
            resource_path: &Utf16,
            evaluated: &mut Evaluated,
            ctx: &mut Context<'_>,
            discovered: &mut Vec<(Vec<u16>, Utf16, usize)>,
        ) -> Result<(), EngineError> {
            ctx.charge_work(1, resource_path.clone())?;
            if !is_root && schema_id(node).is_some() {
                return Ok(());
            }
            if let Some(Value::String(anchor)) = get(node, "$dynamicAnchor") {
                let address = node as *const Value as usize;
                let mut already_registered = false;
                for (_, _, existing_address) in &evaluated.dynamic_scope {
                    ctx.charge_work(1, Utf16::default())?;
                    if *existing_address == address {
                        already_registered = true;
                        break;
                    }
                }
                if already_registered {
                    for child in schema_child_values(node, owner.dialect, ctx, resource_path)? {
                        visit(
                            owner,
                            resource,
                            child,
                            false,
                            resource_path,
                            evaluated,
                            ctx,
                            discovered,
                        )?;
                    }
                    return Ok(());
                }
                let anchor_path = pointer_path(owner, resource, address, resource_path, ctx)?
                    .unwrap_or_else(|| resource_path.clone());
                ctx.charge_work_u64(
                    anchor.len() as u64 + anchor_path.len() as u64 + 2,
                    Utf16::default(),
                )?;
                ctx.charge_work_u64(
                    anchor.len() as u64 + anchor_path.len() as u64 + 2,
                    Utf16::default(),
                )?;
                discovered.push((anchor.units().to_vec(), anchor_path.clone(), address));
                evaluated.dynamic_scope.push((
                    anchor.units().to_vec(),
                    anchor_path,
                    node as *const Value as usize,
                ), ctx)?
            }
            for child in schema_child_values(node, owner.dialect, ctx, resource_path)? {
                visit(
                    owner,
                    resource,
                    child,
                    false,
                    resource_path,
                    evaluated,
                    ctx,
                    discovered,
                )?;
            }
            Ok(())
        }
        visit(
            self,
            resource,
            resource,
            true,
            resource_path,
            evaluated,
            ctx,
            &mut discovered,
        )?;
        self.dynamic_anchor_cache
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .entry(resource_address)
            .or_insert_with(|| Arc::new(discovered));
        Ok(())
    }

    fn dynamic_resource_for_path<'a>(
        &'a self,
        path: &Utf16,
        ctx: &mut Context<'_>,
    ) -> Result<Option<(&'a Value, Utf16)>, EngineError> {
        if let Some(index) = &self.cold_resource_index {
            if let Some(root) = index.dynamic_path(path,ctx)? {
                ctx.charge_work(path.len().saturating_add(1),Utf16::default())?;
                let end=path.units().iter().position(|u|*u==35).unwrap_or(path.len());
                let mut units=path.units()[..end].to_vec();units.push(35);
                return Ok(Some((index.root(self,root),Utf16::new(units))));
            }
        }
        self.dynamic_resource_unindexed(path,ctx)
    }
    fn dynamic_resource_unindexed<'a>(&'a self,path:&Utf16,ctx:&mut Context<'_>)->Result<Option<(&'a Value,Utf16)>,EngineError> {
        ctx.charge_work_u64(
            (path.len() as u64).saturating_mul(2).saturating_add(1),
            path.clone(),
        )?;
        let text = path.to_utf8().unwrap_or_default();
        let base = text.split('#').next().unwrap_or("");
        let resource = if base.is_empty() || schema_id(&*self.schema).as_deref() == Some(base) {
            Some(&*self.schema)
        } else {
            let mut found = find_embedded_resource(&*self.schema, base, self.dialect, ctx, path)?;
            if found.is_none() {
                for (uri, supplied) in &self.catalogue_entries() {
                    ctx.charge_work(uri.len().saturating_add(1), path.clone())?;
                    if uri.to_utf8().ok().as_deref() == Some(base) {
                        found = Some(supplied);
                        break;
                    }
                    found = find_embedded_resource(supplied, base, self.dialect, ctx, path)?;
                    if found.is_some() {
                        break;
                    }
                }
            }
            found
        };
        Ok(resource.map(|resource| {
            let mut root = base.encode_utf16().collect::<Vec<_>>();
            root.push(b'#' as u16);
            (resource, Utf16::new(root))
        }))
    }
    fn dynamic_resource_for_carried<'a>(&'a self,path:&construction_index::CarriedPath,ctx:&mut Context<'_>)->Result<Option<(&'a Value,Utf16)>,EngineError> {
        construction_index::path_call("pth-dynamic-consumer",self,path);
        if let Some(index)=&self.cold_resource_index {
            if let Some(root)=index.select_carried(self,path,construction_index::PathSelector::Dynamic,ctx)? {
                return Ok(Some((index.root(self,root),path.resource_prefix(ctx)?)));
            }
        }
        self.dynamic_resource_unindexed(path.text(),ctx)
    }

    fn indexed_path_unchanged(&self,schema:&Value,path:&Utf16,id_applied:bool,ctx:&mut Context<'_>) -> Result<bool,EngineError> {
        ctx.charge_work(1,Utf16::default())?;
        if id_applied || std::ptr::eq(schema,&*self.schema) {return Ok(true);}
        let id=match construction_index::get_ascii_metered(schema,"$id",ctx,path)? {
            some @ Some(_)=>some,
            None=>construction_index::get_ascii_metered(schema,"id",ctx,path)?,
        };
        let Some(Value::String(id))=id else {return Ok(id.is_none());};
        let Some(index)=&self.cold_resource_index else {return Ok(false);};
        let Some(root)=index.lookup(id.units(),ctx)? else {return Ok(false);};
        ctx.charge_work(id.len().saturating_add(2),Utf16::default())?;
        Ok(std::ptr::eq(index.root(self,root),schema)
            && path.len()==id.len().saturating_add(1)
            && path.units().starts_with(id.units()) && path.units().last()==Some(&35))
    }

    fn effective_schema_path(
        &self,
        schema: &Value,
        path: &Utf16,
        ctx: &mut Context<'_>,
    ) -> Result<Utf16, EngineError> {
        if matches!(self.regex_profile, RegexProfile::Python(_)) {
            ctx.charge_work_u64(
                path.len() as u64 + btree_index_lookup_work(self.python_resource_roots.len()) + 1,
                Utf16::default(),
            )?;
            if std::ptr::eq(schema, &*self.schema) {
                return Ok(path.clone());
            }
            if let Some(resource) = self
                .python_resource_roots
                .get(&(schema as *const Value as usize))
            {
                return resource.uri.display_path(ctx);
            }
            return Ok(path.clone());
        }
        let id_len = get(schema, "$id")
            .or_else(|| get(schema, "id"))
            .and_then(|value| match value {
                Value::String(id) => Some(id.len()),
                _ => None,
            })
            .unwrap_or(0);
        ctx.charge_work_u64(
            path.len() as u64 * 3 + id_len as u64 * 4 + 4,
            Utf16::default(),
        )?;
        if std::ptr::eq(schema, &*self.schema) {
            return Ok(path.clone());
        }
        let Some(id) = schema_id(schema) else {
            return Ok(path.clone());
        };
        let parent = path
            .to_utf8()
            .ok()
            .and_then(|text| text.split_once('#').map(|(base, _)| base.to_owned()))
            .filter(|base| !base.is_empty())
            .or_else(|| schema_id(&*self.schema))
            .unwrap_or_default();
        ctx.charge_work_u64(parent.len() as u64 + id.len() as u64 + 1, Utf16::default())?;
        let effective = resolve_schema_uri(self.dialect, &parent, &id).unwrap_or(id);
        let mut units = effective.encode_utf16().collect::<Vec<_>>();
        units.push(b'#' as u16);
        Ok(Utf16::new(units))
    }

    fn eval_unevaluated_properties<T: InstanceView>(
        &self,
        rule: &Value,
        kp: &EvaluationPathPair,
        data: &T,
        ip: &EvaluationPathPair,
        depth: usize,
        ctx: &mut Context<'_>,
        out: &mut Vec<StructuralError>,
        evaluated: &mut Evaluated,
    ) -> Result<(), EngineError> {
        let Some(count) = data.object_len() else {
            return Ok(());
        };
        let mut unevaluated = Vec::new();
        for index in 0..count {
            let Some((name, value)) = data.object_entry(index) else {
                continue;
            };
            if evaluated.contains_property(name, ctx, ip)? {
                continue;
            }
            let path_name = name.to_utf16(ctx)?;
            if matches!(rule, Value::Bool(false)) {
                ctx.charge_work(path_name.len(), Utf16::default())?;
                unevaluated.push(Value::String(path_name));
                continue;
            }
            let mut child_annotations = evaluated.child(ctx, ip)?;
            child_annotations.mode = EvaluationMode::AllErrors;
            let mut child_errors = Vec::new();
            self.eval(
                rule,
                value,
                &self.pair_instance_pointer(ip, name, ctx)?,
                kp,
                depth + 1,
                ctx,
                &mut child_errors,
                &mut child_annotations,
            )?;
            evaluated.insert_property(name, ctx, ip)?;
            if !child_errors.is_empty() {
                ctx.charge_work(path_name.len(), Utf16::default())?;
                unevaluated.push(Value::String(path_name));
            }
        }
        if !unevaluated.is_empty() {
            if let Some(Value::String(first)) = unevaluated.first() {
                ctx.charge_work(first.len(), Utf16::default())?;
            }
            push_ctx(
                ctx,
                out,
                ip,
                kp,
                "unevaluatedProperties",
                object(vec![("unevaluatedProperty", unevaluated[0].clone())]),
                "must NOT have unevaluated properties",
            )?;
        }
        Ok(())
    }

    fn eval_unevaluated_items<T: InstanceView>(
        &self,
        rule: &Value,
        kp: &EvaluationPathPair,
        data: &T,
        ip: &EvaluationPathPair,
        depth: usize,
        ctx: &mut Context<'_>,
        out: &mut Vec<StructuralError>,
        evaluated: &mut Evaluated,
    ) -> Result<(), EngineError> {
        let Some(count) = data.array_len() else {
            return Ok(());
        };
        let mut unevaluated = Vec::new();
        for index in 0..count {
            let Some(value) = data.array_get(index) else {
                continue;
            };
            if evaluated.contains_item(index, ctx, ip)? {
                continue;
            }
            if matches!(rule, Value::Bool(false)) {
                ctx.charge_work(1, Utf16::default())?;
                unevaluated.push(Value::Number(index as f64));
                continue;
            }
            let mut child_annotations = evaluated.child(ctx, ip)?;
            child_annotations.mode = EvaluationMode::AllErrors;
            let mut child_errors = Vec::new();
            self.eval(
                rule,
                value,
                &self.pair_instance_pointer(ip, InstanceText::Utf16(&Utf16::from(index.to_string())), ctx)?,
                kp,
                depth + 1,
                ctx,
                &mut child_errors,
                &mut child_annotations,
            )?;
            evaluated.insert_item(index, ctx, ip)?;
            if !child_errors.is_empty() {
                ctx.charge_work(1, Utf16::default())?;
                unevaluated.push(Value::Number(index as f64));
            }
        }
        if !unevaluated.is_empty() {
            push_ctx(
                ctx,
                out,
                ip,
                kp,
                "unevaluatedItems",
                object(vec![("unevaluatedItems", Value::Array(unevaluated))]),
                "must NOT have unevaluated items",
            )?;
        }
        Ok(())
    }

    #[inline(never)]
    #[allow(unused_variables)]
    fn eval_keyword_annotations<'a, T: InstanceView>(
        &self,
        schema: &'a Value,
        members: &'a [(Utf16, Value)],
        keyword: &str,
        rule: &'a Value,
        kp: &EvaluationPathPair,
        data: &T,
        ip: &EvaluationPathPair,
        sp: &EvaluationPathPair,
        depth: usize,
        ctx: &mut Context<'_>,
        out: &mut Vec<StructuralError>,
        evaluated: &mut Evaluated,
        mode: EvaluationMode,
        initial_error_count: usize,
        annotation_scan_complete: &mut bool,
        unevaluated_properties: &mut Option<(&'a Value, EvaluationPathPair, Option<OwnerCursor>)>,
        unevaluated_items: &mut Option<(&'a Value, EvaluationPathPair, Option<OwnerCursor>)>,
    ) -> Result<(), EngineError> {
        if evaluated.annotation_scan {
            if self.uses_python_2020_annotation_profile() {
                match keyword {
                    "unevaluatedProperties" => self.collect_python_property_predicates(
                        rule, kp, data, ip, depth, ctx, evaluated,
                    )?,
                    // The Python 2020 item helper returns all indexes at once
                    // when `items` is present. Without `items`, the
                    // unevaluatedItems validator predicates every array item,
                    // including indexes already marked by prefixItems.
                    "unevaluatedItems" if member(members, "items").is_none() => self
                        .collect_python_item_predicates(
                            rule, kp, data, ip, depth, ctx, evaluated,
                        )?,
                    "unevaluatedItems" => {}
                    _ => {}
                }
            } else if self.uses_python_2019_annotation_profile() {
                match keyword {
                    "unevaluatedProperties" => self
                        .collect_python_legacy_property_names(rule, kp, data, ip, ctx, evaluated)?,
                    "unevaluatedItems" => {
                        // The legacy helper short-circuits after `items` when it
                        // can establish the covered index set there. Tuple-form
                        // items continue into unevaluatedItems predicates.
                        match member(members, "items") {
                            Some(Value::Object(_)) | Some(Value::Bool(_))
                                if member(members, "additionalItems").is_some() => {}
                            Some(Value::Object(_)) => {}
                            Some(Value::Bool(_)) => {
                                let error = EngineError::new(
                                    "PYTHON_SCHEMA_EVALUATION",
                                    ip.text().clone(),
                                    "Draft 2019-09 boolean items annotation has no length",
                                )
                                .with_python_schema_terminal(
                                    PythonSchemaTerminal::LegacyBooleanItems,
                                );
                                return Err(error);
                            }
                            _ => self.collect_python_item_predicates(
                                rule, kp, data, ip, depth, ctx, evaluated,
                            )?,
                        }
                    }
                    _ => {}
                }
            }
            return Ok(());
        }
        match keyword {
            "unevaluatedProperties" => {
                if data.object_len().is_some() && !*annotation_scan_complete {
                    self.collect_schema_annotations(sp, schema, data, ip, depth, ctx, evaluated)?;
                    *annotation_scan_complete = true;
                }
                if matches!(self.regex_profile, RegexProfile::Python(_)) {
                    self.eval_unevaluated_properties(
                        rule, &kp, data, ip, depth, ctx, out, evaluated,
                    )?;
                } else {
                    ctx.charge_work(std::mem::size_of::<Option<(&Value, EvaluationPathPair, Option<OwnerCursor>)>>()
                        .div_ceil(std::mem::size_of::<usize>()) + 1, Utf16::default())?;
                    *unevaluated_properties = Some((rule, kp.clone_with_context(ctx)?, clone_owner_cursor(evaluated.selected_cursor.as_ref(),ctx)?));
                }
            }
            "unevaluatedItems" => {
                if data.array_len().is_some() && !*annotation_scan_complete {
                    self.collect_schema_annotations(sp, schema, data, ip, depth, ctx, evaluated)?;
                    *annotation_scan_complete = true;
                }
                if matches!(self.regex_profile, RegexProfile::Python(_)) {
                    self.eval_unevaluated_items(rule, &kp, data, ip, depth, ctx, out, evaluated)?;
                } else {
                    ctx.charge_work(std::mem::size_of::<Option<(&Value, EvaluationPathPair, Option<OwnerCursor>)>>()
                        .div_ceil(std::mem::size_of::<usize>()) + 1, Utf16::default())?;
                    *unevaluated_items = Some((rule, kp.clone_with_context(ctx)?, clone_owner_cursor(evaluated.selected_cursor.as_ref(),ctx)?));
                }
            }
            _ => {}
        }
        Ok(())
    }

    #[inline(never)]
    #[allow(unused_variables)]
    fn eval_keyword_references<T: InstanceView>(
        &self,
        schema: &Value,
        members: &[(Utf16, Value)],
        keyword: &str,
        rule: &Value,
        kp: &EvaluationPathPair,
        data: &T,
        ip: &EvaluationPathPair,
        sp: &EvaluationPathPair,
        depth: usize,
        ctx: &mut Context<'_>,
        out: &mut Vec<StructuralError>,
        evaluated: &mut Evaluated,
        mode: EvaluationMode,
        initial_error_count: usize,
        annotation_scan_complete: &mut bool,
        unevaluated_properties: &mut Option<(&Value, EvaluationPathPair, Option<OwnerCursor>)>,
        unevaluated_items: &mut Option<(&Value, EvaluationPathPair, Option<OwnerCursor>)>,
    ) -> Result<(), EngineError> {
        // Keep static recursion independent of the larger dynamic resolver
        // temporaries; both retain their original semantic/error paths.
        match keyword {
            "$ref" => self.eval_static_reference(
                schema,
                members,
                keyword,
                rule,
                kp,
                data,
                ip,
                sp,
                depth,
                ctx,
                out,
                evaluated,
                mode,
                initial_error_count,
                annotation_scan_complete,
                unevaluated_properties,
                unevaluated_items,
            ),
            "$dynamicRef" | "$recursiveRef" => self.eval_dynamic_reference(
                schema,
                members,
                keyword,
                rule,
                kp,
                data,
                ip,
                sp,
                depth,
                ctx,
                out,
                evaluated,
                mode,
                initial_error_count,
                annotation_scan_complete,
                unevaluated_properties,
                unevaluated_items,
            ),
            _ => Ok(()),
        }
    }

    #[inline(never)]
    #[allow(unused_variables)]
    fn eval_static_reference<T: InstanceView>(
        &self,
        schema: &Value,
        members: &[(Utf16, Value)],
        keyword: &str,
        rule: &Value,
        kp: &EvaluationPathPair,
        data: &T,
        ip: &EvaluationPathPair,
        sp: &EvaluationPathPair,
        depth: usize,
        ctx: &mut Context<'_>,
        out: &mut Vec<StructuralError>,
        evaluated: &mut Evaluated,
        mode: EvaluationMode,
        initial_error_count: usize,
        annotation_scan_complete: &mut bool,
        unevaluated_properties: &mut Option<(&Value, EvaluationPathPair, Option<OwnerCursor>)>,
        unevaluated_items: &mut Option<(&Value, EvaluationPathPair, Option<OwnerCursor>)>,
    ) -> Result<(), EngineError> {
        let (target, tsp, id_applied, cursor) = self.resolve_eval_ref_located(rule, &kp, ctx)?;
        // The Draft 3 predecessor's reference applicator treats
        // boolean targets as mappings and raises TypeError. Keep
        // this a runtime failure: unrelated `definitions` values
        // remain inert and schema construction still succeeds.
        if self.dialect == SchemaDialect::Draft3
            && matches!(target, Value::Bool(_))
            && draft3_reference_crosses_subresource(&tsp, ctx)?
        {
            return Err(EngineError::new(
                "PYTHON_SCHEMA_EVALUATION",
                ip.text().clone(),
                "Draft 3 reference target is not an object schema",
            )
            .with_python_schema_terminal(PythonSchemaTerminal::LocalReference));
        }
        if matches!(self.regex_profile, RegexProfile::Python(_))
            && !matches!(target, Value::Object(_) | Value::Bool(_))
        {
            return Err(EngineError::new(
                "PYTHON_SCHEMA_EVALUATION",
                ip.text().clone(),
                "Schema reference target is not an object or boolean schema",
            )
            .with_python_schema_terminal(PythonSchemaTerminal::LocalReference));
        }
        let tsp = self.evaluator_origin_path(tsp, ctx)?;
        let mut reference_annotations = evaluated.child(ctx, ip)?;
        reference_annotations.selected_cursor=cursor;
        self.python_record_reference_lookup(keyword, rule, &mut reference_annotations, ctx)?;
        if evaluated.annotation_scan
            && (self.uses_python_2020_annotation_profile()
                || self.uses_python_2019_annotation_profile())
        {
            self.collect_schema_annotations_resolved(
                &tsp,
                target,
                data,
                ip,
                depth + 1,
                ctx,
                &mut reference_annotations,
                id_applied,
            )?;
            evaluated.merge(reference_annotations, ctx, ip)?;
            return Ok(());
        }
        let mut reference_errors = Vec::new();
        if let Err(error) = self.eval_resolved(
            target,
            data,
            ip,
            &tsp,
            depth + 1,
            ctx,
            &mut reference_errors,
            &mut reference_annotations,
            id_applied,
        ) {
            if matches!(self.regex_profile, RegexProfile::Python(_)) {
                for error in &mut reference_errors {
                    if error
                        .python_error
                        .as_ref()
                        .is_some_and(|metadata| metadata.validator.is_none())
                    {
                        ctx.charge_work(kp.len(), Utf16::default())?;
                        error.schema_path = kp.text().clone();
                    }
                }
                rebase_reference_errors(&mut reference_errors, &tsp, ctx)?;
                prefix_reference_errors(&mut reference_errors, sp, ctx)?;
            }
            out.extend(reference_errors);
            return Err(error);
        }
        if matches!(self.regex_profile, RegexProfile::Python(_)) {
            for error in &mut reference_errors {
                if error
                    .python_error
                    .as_ref()
                    .is_some_and(|metadata| metadata.validator.is_none())
                {
                    ctx.charge_work(sp.len(), Utf16::default())?;
                    error.schema_path = sp.text().clone();
                }
            }
            rebase_reference_errors(&mut reference_errors, &tsp, ctx)?;
            prefix_reference_errors(&mut reference_errors, sp, ctx)?;
        }
        if reference_errors.is_empty() {
            evaluated.merge(reference_annotations, ctx, ip)?;
        }
        out.extend(reference_errors);

        Ok(())
    }

    #[inline(never)]
    #[allow(unused_variables)]
    fn eval_dynamic_reference<T: InstanceView>(
        &self,
        schema: &Value,
        members: &[(Utf16, Value)],
        keyword: &str,
        rule: &Value,
        kp: &EvaluationPathPair,
        data: &T,
        ip: &EvaluationPathPair,
        sp: &EvaluationPathPair,
        depth: usize,
        ctx: &mut Context<'_>,
        out: &mut Vec<StructuralError>,
        evaluated: &mut Evaluated,
        mode: EvaluationMode,
        initial_error_count: usize,
        annotation_scan_complete: &mut bool,
        unevaluated_properties: &mut Option<(&Value, EvaluationPathPair, Option<OwnerCursor>)>,
        unevaluated_items: &mut Option<(&Value, EvaluationPathPair, Option<OwnerCursor>)>,
    ) -> Result<(), EngineError> {
        let python_recursive = keyword == "$recursiveRef"
            && self.dialect == SchemaDialect::Draft2019_09
            && matches!(self.regex_profile, RegexProfile::Python(_));
        let (mut target, mut tsp, mut id_applied, mut cursor) = if python_recursive {
            let (target, tsp) = self.python_recursive_retarget(rule, evaluated, ctx)?;
            (target, tsp, false,None)
        } else {
            self.resolve_eval_ref_located(rule, &kp, ctx)?
        };
        if matches!(self.regex_profile, RegexProfile::Python(_))
            && !matches!(target, Value::Object(_) | Value::Bool(_))
        {
            return Err(EngineError::new(
                "PYTHON_SCHEMA_EVALUATION",
                ip.text().clone(),
                "Schema reference target is not an object or boolean schema",
            )
            .with_python_schema_terminal(PythonSchemaTerminal::LocalReference));
        }
        if let Value::String(reference) = rule {
            ctx.charge_work_u64(
                (reference.len() as u64).saturating_mul(4).saturating_add(1),
                Utf16::default(),
            )?;
        }
        if let Value::Object(members) = target {
            ctx.charge_work_u64((members.len() as u64).saturating_mul(40), Utf16::default())?;
        }
        if let Some(Value::String(anchor)) = get(target, "$dynamicAnchor") {
            ctx.charge_work_u64((anchor.len() as u64).saturating_mul(3), Utf16::default())?;
        }
        if let Some(reference) = as_utf8(rule) {
            let fragment = reference.split_once('#').map(|(_, f)| f).unwrap_or("");
            let recursive = !matches!(self.regex_profile, RegexProfile::Python(_))
                && keyword == "$recursiveRef"
                && matches!(get(target, "$recursiveAnchor"), Some(Value::Bool(true)));
            let dynamic = keyword == "$dynamicRef"
                && !fragment.is_empty()
                && !fragment.starts_with('/')
                && get(target, "$dynamicAnchor").and_then(as_utf8).as_deref() == Some(fragment);
            if recursive || dynamic {
                let anchor_name = if recursive {
                    Vec::new()
                } else {
                    fragment.encode_utf16().collect::<Vec<_>>()
                };
                let mut selected_scope = None;
                for (anchor, dynamic_path, node_address) in &evaluated.dynamic_scope {
                    ctx.charge_work_u64(
                        anchor.len().min(anchor_name.len()) as u64 + 1,
                        Utf16::default(),
                    )?;
                    if anchor == &anchor_name {
                        selected_scope = Some((dynamic_path, node_address));
                        break;
                    }
                }
                if let Some((dynamic_path, node_address)) = selected_scope {
                    // Active dynamic selection remains the original authority.
                    // Never carry the static target cursor across retargeting.
                    cursor=None;
                    ctx.charge_work(dynamic_path.len(), Utf16::default())?;
                    if matches!(self.regex_profile, RegexProfile::Python(_)) {
                        // The scope owns a stable node identity. Its diagnostic
                        // path is display-only and may collapse Python codepoints.
                        target = self.python_scope_node(*node_address, ctx)?;
                        tsp = dynamic_path.clone();
                    } else {
                        // Resource-scope registration may point at a dynamic
                        // anchor nested in `$defs`; the resource URI is enough
                        // for relative references, while the stable node
                        // identity selects the actual anchor schema.
                        target = self.python_scope_node(*node_address, ctx)?;
                        tsp = dynamic_path.clone();
                        // A root path is already normalized by the resource
                        // resolver. Only a descendant anchor needs its own
                        // `$id` processing during evaluation.
                        id_applied = dynamic_path.units().last() == Some(&(b'#' as u16));
                    }
                    if matches!(self.regex_profile, RegexProfile::Python(_))
                        && !matches!(target, Value::Object(_) | Value::Bool(_))
                    {
                        return Err(EngineError::new(
                            "PYTHON_SCHEMA_EVALUATION",
                            ip.text().clone(),
                            "Schema reference target is not an object or boolean schema",
                        )
                        .with_python_schema_terminal(PythonSchemaTerminal::LocalReference));
                    }
                }
            }
        }
        let tsp = self.evaluator_origin_path(tsp, ctx)?;
        let mut reference_annotations = evaluated.child(ctx, ip)?;
        reference_annotations.selected_cursor=cursor;
        self.python_record_reference_lookup(keyword, rule, &mut reference_annotations, ctx)?;
        if evaluated.annotation_scan
            && (self.uses_python_2020_annotation_profile()
                || self.uses_python_2019_annotation_profile())
        {
            self.collect_schema_annotations_resolved(
                &tsp,
                target,
                data,
                ip,
                depth + 1,
                ctx,
                &mut reference_annotations,
                id_applied,
            )?;
            evaluated.merge(reference_annotations, ctx, ip)?;
            return Ok(());
        }
        let mut reference_errors = Vec::new();
        if let Err(error) = self.eval_resolved(
            target,
            data,
            ip,
            &tsp,
            depth + 1,
            ctx,
            &mut reference_errors,
            &mut reference_annotations,
            id_applied,
        ) {
            if matches!(self.regex_profile, RegexProfile::Python(_)) {
                for error in &mut reference_errors {
                    if error
                        .python_error
                        .as_ref()
                        .is_some_and(|metadata| metadata.validator.is_none())
                    {
                        ctx.charge_work(kp.len(), Utf16::default())?;
                        error.schema_path = kp.text().clone();
                    }
                }
                rebase_reference_errors(&mut reference_errors, &tsp, ctx)?;
                prefix_reference_errors(&mut reference_errors, &kp, ctx)?;
            }
            out.extend(reference_errors);
            return Err(error);
        }
        if matches!(self.regex_profile, RegexProfile::Python(_)) {
            for error in &mut reference_errors {
                if error
                    .python_error
                    .as_ref()
                    .is_some_and(|metadata| metadata.validator.is_none())
                {
                    ctx.charge_work(kp.len(), Utf16::default())?;
                    error.schema_path = kp.text().clone();
                }
            }
            rebase_reference_errors(&mut reference_errors, &tsp, ctx)?;
            prefix_reference_errors(&mut reference_errors, &kp, ctx)?;
        }
        if reference_errors.is_empty() {
            evaluated.merge(reference_annotations, ctx, ip)?;
        }
        out.extend(reference_errors);

        Ok(())
    }

    #[inline(never)]
    #[allow(unused_variables)]
    fn eval_keyword_basic<T: InstanceView>(
        &self,
        schema: &Value,
        members: &[(Utf16, Value)],
        keyword: &str,
        rule: &Value,
        kp: &EvaluationPathPair,
        data: &T,
        ip: &EvaluationPathPair,
        sp: &EvaluationPathPair,
        depth: usize,
        ctx: &mut Context<'_>,
        out: &mut Vec<StructuralError>,
        evaluated: &mut Evaluated,
        mode: EvaluationMode,
        initial_error_count: usize,
        annotation_scan_complete: &mut bool,
        unevaluated_properties: &mut Option<(&Value, EvaluationPathPair, Option<OwnerCursor>)>,
        unevaluated_items: &mut Option<(&Value, EvaluationPathPair, Option<OwnerCursor>)>,
    ) -> Result<(), EngineError> {
        match keyword {
            "type" => {
                let matches = if self.dialect == SchemaDialect::Draft3 {
                    self.draft3_type_matches(rule, data, ip, &kp, depth, evaluated.selected_cursor.as_ref(),ctx)?
                } else {
                    type_matches(rule, data, self.dialect)
                };
                if !matches {
                    let kind = type_label(rule);
                    push_ctx(
                        ctx,
                        out,
                        ip,
                        &kp,
                        "type",
                        object(vec![("type", Value::String(Utf16::from(kind.clone())))]),
                        &format!("must be {kind}"),
                    )?;
                }
            }
            "disallow" => {
                let matches = if self.dialect == SchemaDialect::Draft3 {
                    self.draft3_type_matches(rule, data, ip, &kp, depth, evaluated.selected_cursor.as_ref(),ctx)?
                } else {
                    type_matches(rule, data, self.dialect)
                };
                if matches {
                    // type_label walks strings/arrays, and format! allocates; admit
                    // the source tree before either operation, then charge the exact
                    // diagnostic size and value-copy budget before constructing it.
                    meter_value_copy(rule, ctx)?;
                    let label = type_label(rule);
                    let message_len = "must not be ".len().saturating_add(label.len());
                    let fixed = (ip.len() as u64)
                        .saturating_add(kp.len() as u64)
                        .saturating_add("disallow".len() as u64)
                        .saturating_add("type".len() as u64)
                        .saturating_add(message_len as u64)
                        .saturating_add(3);
                    ctx.charge_work_u64(fixed, Utf16::default())?;
                    meter_value_copy(rule, ctx)?;
                    let message = format!("must not be {label}");
                    let params = object(vec![("type", rule.clone())]);
                    push_ctx_precharged(out, ip, &kp, "disallow", params, Utf16::from(message));
                }
            }
            "const" => {
                if !self.value_matches(rule, data, ctx)? {
                    push_ctx_copy_value(
                        ctx,
                        out,
                        ip,
                        &kp,
                        "const",
                        "allowedValue",
                        rule,
                        "must be equal to constant",
                    )?;
                    if let Some(source) = self
                        .python_exact_values
                        .get(&(rule as *const Value as usize))
                    {
                        let source = source.snapshot_with_context(ctx)?;
                        ctx.charge_work(2, kp.text().clone())?;
                        let params = crate::python_value::PythonConsumerValue::Object(vec![(
                            crate::python_value::PyText::from_utf8("allowedValue"),
                            source,
                        )]);
                        out.last_mut()
                            .expect("const just emitted an error")
                            .python_params = Some(std::sync::Arc::new(params));
                    }
                }
            }
            "enum" => {
                if let Value::Array(allowed) = rule {
                    let mut found = false;
                    for candidate in allowed {
                        if self.value_matches(candidate, data, ctx)? {
                            found = true;
                            break;
                        }
                    }
                    if !found {
                        push_ctx_copy_value(
                            ctx,
                            out,
                            ip,
                            &kp,
                            "enum",
                            "allowedValues",
                            rule,
                            "must be equal to one of the allowed values",
                        )?;
                        if let Some(source) = self
                            .python_exact_values
                            .get(&(rule as *const Value as usize))
                        {
                            let source = source.snapshot_with_context(ctx)?;
                            ctx.charge_work(2, kp.text().clone())?;
                            let params = crate::python_value::PythonConsumerValue::Object(vec![(
                                crate::python_value::PyText::from_utf8("allowedValues"),
                                source,
                            )]);
                            out.last_mut()
                                .expect("enum just emitted an error")
                                .python_params = Some(std::sync::Arc::new(params));
                        }
                    }
                }
            }
            "required" => {
                if let Value::Array(required) = rule {
                    for (index, req) in required.iter().enumerate() {
                        if let Value::String(name) = req {
                            let req_path =
                                self.pair_plain_schema_pointer(&kp, &Utf16::from(index.to_string()), ctx)?;
                            let source_name = self.source_text_value(&req_path, name, ctx)?;
                            if data.object_find(source_name, ctx)?.is_none()
                                && data.object_len().is_some()
                            {
                                let message_name = source_name.to_utf16(ctx)?;
                                push_required_ctx(ctx, out, ip, &kp, name, &message_name)?;
                            }
                            if mode == EvaluationMode::FirstError && out.len() > initial_error_count
                            {
                                break;
                            }
                        }
                    }
                }
            }
            _ => {}
        }
        Ok(())
    }

    #[inline(never)]
    #[allow(unused_variables)]
    fn eval_keyword_properties<T: InstanceView>(
        &self,
        schema: &Value,
        members: &[(Utf16, Value)],
        keyword: &str,
        rule: &Value,
        kp: &EvaluationPathPair,
        data: &T,
        ip: &EvaluationPathPair,
        sp: &EvaluationPathPair,
        depth: usize,
        ctx: &mut Context<'_>,
        out: &mut Vec<StructuralError>,
        evaluated: &mut Evaluated,
        mode: EvaluationMode,
        initial_error_count: usize,
        annotation_scan_complete: &mut bool,
        unevaluated_properties: &mut Option<(&Value, EvaluationPathPair, Option<OwnerCursor>)>,
        unevaluated_items: &mut Option<(&Value, EvaluationPathPair, Option<OwnerCursor>)>,
    ) -> Result<(), EngineError> {
        if evaluated.annotation_scan
            && self.uses_python_2019_annotation_profile()
            && keyword == "properties"
            && matches!(rule, Value::Bool(_))
        {
            if matches!(rule, Value::Bool(true)) {
                if let Some(count) = data.object_len() {
                    for index in 0..count {
                        if let Some((name, _)) = data.object_entry(index) {
                            evaluated.insert_property(name, ctx, ip)?;
                        }
                    }
                }
            }
            return Ok(());
        }
        match keyword {
            "properties" => {
                if let Value::Object(schemas) = rule {
                    let order = if evaluated.codegen_errors {
                        Some(compiler_object_order(rule, schemas.len(), ctx)?)
                    } else {
                        None
                    };
                    for slot in 0..schemas.len() {
                        let member_index = order.as_ref().map_or(slot, |order| order[slot]);
                        let (name, sub) = &schemas[member_index];
                        let source_name = self.source_member_text(&kp, member_index, name, ctx)?;
                        if let Some(v) = data.object_find(source_name, ctx)? {
                            evaluated.insert_property(source_name, ctx, ip)?;
                            // Annotation collection asks which instance properties
                            // the `properties` keyword covers. It does not re-run the
                            // property's schema: doing so can surface child failures
                            // before an earlier parent keyword and needlessly doubles
                            // recursive evaluator depth.
                            if evaluated.annotation_scan {
                                continue;
                            }
                            let mut child_annotations = evaluated.child(ctx, ip)?;
                            child_annotations.selected_cursor=child_cursor(Some(self),evaluated.selected_cursor.as_ref(),member_index,ctx)?;
                            let child_path = self.pair_instance_pointer(ip, source_name, ctx)?;
                            let error_start = out.len();
                            if let Err(error) = self.eval(
                                sub,
                                v,
                                &child_path,
                                &self.pair_schema_pointer(&kp, name, ctx)?,
                                depth + 1,
                                ctx,
                                out,
                                &mut child_annotations,
                            ) {
                                return Err(error);
                            }
                            if matches!(self.regex_profile, RegexProfile::Python(_))
                                && matches!(sub, Value::Bool(false))
                            {
                                for error in &mut out[error_start..] {
                                    if error
                                        .python_error
                                        .as_ref()
                                        .is_some_and(|metadata| metadata.validator.is_none())
                                    {
                                        ctx.charge_work_u64(
                                            (ip.len() as u64).saturating_add(kp.len() as u64),
                                            Utf16::default(),
                                        )?;
                                        error.instance_path = ip.text().clone();
                                        error.schema_path = kp.text().clone();
                                        error.python_physical_instance_path =
                                            Some(child_path.text().clone());
                                    }
                                }
                            }
                            if mode == EvaluationMode::FirstError && out.len() > initial_error_count
                            {
                                break;
                            }
                        } else if !evaluated.annotation_scan
                            && self.dialect == SchemaDialect::Draft3
                            && matches!(get(sub, "required"), Some(Value::Bool(true)))
                        {
                            let required_instance_path =
                                self.pair_instance_pointer(ip, source_name, ctx)?;
                            let property_schema_path = self.pair_schema_pointer(&kp, name, ctx)?;
                            ctx.charge_work_u64(
                                (property_schema_path.len() as u64)
                                    .saturating_add("required".len() as u64 + 1),
                                Utf16::default(),
                            )?;
                            let required_schema_path =
                                self.pair_eval_schema_step(&property_schema_path, "required",ctx)?;
                            precharge_string_diagnostic(
                                ctx,
                                &required_instance_path,
                                &required_schema_path,
                                "required",
                                "is a required property '".len() + name.len() + 1,
                                &[("property", name)],
                            )?;
                            let mut message = "is a required property '"
                                .encode_utf16()
                                .collect::<Vec<_>>();
                            message.extend(name.units());
                            message.push(0x27);
                            push_units_ctx_after_precharge(
                                out,
                                &required_instance_path,
                                &required_schema_path,
                                "required",
                                object(vec![("property", Value::String(name.clone()))]),
                                Utf16::new(message),
                            );
                        }
                    }
                }
            }
            _ => {}
        }
        Ok(())
    }

    #[inline(never)]
    #[allow(unused_variables)]
    fn eval_keyword_patterns_additional<T: InstanceView>(
        &self,
        schema: &Value,
        members: &[(Utf16, Value)],
        keyword: &str,
        rule: &Value,
        kp: &EvaluationPathPair,
        data: &T,
        ip: &EvaluationPathPair,
        sp: &EvaluationPathPair,
        depth: usize,
        ctx: &mut Context<'_>,
        out: &mut Vec<StructuralError>,
        evaluated: &mut Evaluated,
        mode: EvaluationMode,
        initial_error_count: usize,
        annotation_scan_complete: &mut bool,
        unevaluated_properties: &mut Option<(&Value, EvaluationPathPair, Option<OwnerCursor>)>,
        unevaluated_items: &mut Option<(&Value, EvaluationPathPair, Option<OwnerCursor>)>,
    ) -> Result<(), EngineError> {
        match keyword {
            "patternProperties" => {
                if let Value::Object(schemas) = rule {
                    let schema_order = if evaluated.codegen_errors {
                        Some(compiler_object_order(rule, schemas.len(), ctx)?)
                    } else {
                        None
                    };
                    let data_order = if evaluated.codegen_errors {
                        Some(compiler_object_order(
                            data,
                            data.object_len().unwrap_or(0),
                            ctx,
                        )?)
                    } else {
                        None
                    };
                    for slot in 0..schemas.len() {
                        let member_index=schema_order.as_ref().map_or(slot,|order|order[slot]);
                        let (name, sub) = &schemas[member_index];
                        let Some(count) = data.object_len() else {
                            continue;
                        };
                        ctx.charge_work(count, ip.text().clone())?;
                        let pattern_path = self.pair_schema_pointer(&kp, name, ctx)?;
                        let re = self.compile_pattern(name, &pattern_path, ctx)?;
                        for slot in 0..count {
                            let index = data_order.as_ref().map_or(slot, |order| order[slot]);
                            let Some((k, v)) = data.object_entry(index) else {
                                continue;
                            };
                            if Self::pattern_matches_text(&re, k, ctx)? {
                                evaluated.insert_property(k, ctx, ip)?;
                                if evaluated.annotation_scan {
                                    continue;
                                }
                                let mut child_annotations = evaluated.child(ctx, ip)?;
                                child_annotations.selected_cursor=child_cursor(Some(self),evaluated.selected_cursor.as_ref(),member_index,ctx)?;
                                self.eval(
                                    sub,
                                    v,
                                    &self.pair_instance_pointer(ip, k, ctx)?,
                                    &self.pair_schema_pointer(&kp, name, ctx)?,
                                    depth + 1,
                                    ctx,
                                    out,
                                    &mut child_annotations,
                                )?;
                                if mode == EvaluationMode::FirstError
                                    && out.len() > initial_error_count
                                {
                                    break;
                                }
                            }
                            if mode == EvaluationMode::FirstError && out.len() > initial_error_count
                            {
                                break;
                            }
                        }
                        if mode == EvaluationMode::FirstError && out.len() > initial_error_count {
                            break;
                        }
                    }
                }
            }
            _ => {}
        }
        Ok(())
    }

    #[inline(never)]
    fn eval_keyword_additional_properties<T: InstanceView>(
        &self,
        members: &[(Utf16, Value)],
        rule: &Value,
        kp: &EvaluationPathPair,
        data: &T,
        ip: &EvaluationPathPair,
        sp: &EvaluationPathPair,
        depth: usize,
        ctx: &mut Context<'_>,
        out: &mut Vec<StructuralError>,
        evaluated: &mut Evaluated,
        mode: EvaluationMode,
        initial_error_count: usize,
    ) -> Result<(), EngineError> {
        if evaluated.annotation_scan && self.uses_python_2019_annotation_profile() {
            if matches!(rule, Value::Object(_)) {
                self.collect_python_legacy_additional_property_predicates(
                    members, rule, sp, data, ip, depth, ctx, evaluated,
                )?;
            } else {
                self.collect_python_legacy_property_names(rule, &kp, data, ip, ctx, evaluated)?;
            }
            return Ok(());
        }
        if evaluated.annotation_scan && self.uses_python_2020_annotation_profile() {
            self.collect_python_property_predicates(rule, &kp, data, ip, depth, ctx, evaluated)?;
            return Ok(());
        }
        if let Some(count) = data.object_len() {
            let mut has_undeclared = false;
            let compiler_order = if evaluated.codegen_errors {
                Some(compiler_object_order(data, count, ctx)?)
            } else {
                None
            };
            for slot in 0..count {
                let index = compiler_order.as_ref().map_or(slot, |order| order[slot]);
                let Some((k, v)) = data.object_entry(index) else {
                    continue;
                };
                let key_path = self.pair_instance_pointer(ip, k, ctx)?;
                ctx.charge_work(1, key_path.clone())?;
                if !self.additional_property_is_covered(members, k, &key_path, sp, ctx)? {
                    if evaluated.annotation_scan {
                        if self.evaluate_additional_property(
                            rule, v, &key_path, &kp, depth, ctx, ip, evaluated, true, out,
                        )? {
                            evaluated.insert_property(k, ctx, ip)?;
                        }
                    } else if matches!(rule, Value::Bool(false)) {
                        evaluated.insert_property(k, ctx, ip)?;
                        if evaluated.codegen_errors {
                            let name = k.to_utf16(ctx)?;
                            push_ctx(
                                ctx,
                                out,
                                ip,
                                &kp,
                                "additionalProperties",
                                object(vec![("additionalProperty", Value::String(name))]),
                                "must NOT have additional properties",
                            )?;
                        } else {
                            has_undeclared = true;
                        }
                    } else {
                        evaluated.insert_property(k, ctx, ip)?;
                        self.evaluate_additional_property(
                            rule, v, &key_path, &kp, depth, ctx, ip, evaluated, false, out,
                        )?;
                    }
                }
                if mode == EvaluationMode::FirstError
                    && (out.len() > initial_error_count || has_undeclared)
                {
                    break;
                }
            }
            if has_undeclared {
                push_ctx(
                    ctx,
                    out,
                    ip,
                    &kp,
                    "additionalProperties",
                    object(vec![]),
                    "must NOT have additional properties",
                )?;
            }
        }

        Ok(())
    }

    #[inline(never)]
    fn additional_property_is_covered(
        &self,
        members: &[(Utf16, Value)],
        name: InstanceText<'_>,
        key_path: &EvaluationPathPair,
        sp: &EvaluationPathPair,
        ctx: &mut Context<'_>,
    ) -> Result<bool, EngineError> {
        ctx.charge_work_u64(
            (sp.len() as u64).saturating_add("properties".len() as u64 + 1),
            Utf16::default(),
        )?;
        let declared_path = self.pair_eval_schema_step(sp, "properties",ctx)?;
        if let Some(properties) = member(members, "properties") {
            for property_index in 0..properties.object_len().unwrap_or(0) {
                let Some((property_name, _)) = properties.object_entry(property_index) else {
                    continue;
                };
                let fallback = match property_name {
                    InstanceText::Utf16(units) => units,
                    InstanceText::Python(_) => {
                        if property_name.equals_with_context(name, ctx)? {
                            return Ok(true);
                        }
                        continue;
                    }
                };
                let source =
                    self.source_member_text(&declared_path, property_index, fallback, ctx)?;
                if source.equals_with_context(name, ctx)? {
                    return Ok(true);
                }
            }
        }
        if let Some(Value::Object(patterns)) = member(members, "patternProperties") {
            for (pattern, _) in patterns {
                ctx.charge_work_u64(
                    (key_path.len() as u64)
                        .saturating_add(1)
                        .saturating_add(sp.len() as u64)
                        .saturating_add("patternProperties".len() as u64 + 1),
                    Utf16::default(),
                )?;
                ctx.charge_work(1, key_path.text().clone())?;
                let pattern_path = self.pair_schema_pointer(
                    &self.pair_eval_schema_step(sp, "patternProperties",ctx)?,
                    pattern,
                    ctx,
                )?;
                let regex = self.compile_pattern(pattern, &pattern_path, ctx)?;
                if Self::pattern_matches_text(&regex, name, ctx)? {
                    return Ok(true);
                }
            }
        }
        Ok(false)
    }

    #[inline(never)]
    fn evaluate_additional_property<T: InstanceView>(
        &self,
        rule: &Value,
        value: &T,
        key_path: &EvaluationPathPair,
        schema_path: &EvaluationPathPair,
        depth: usize,
        ctx: &mut Context<'_>,
        parent_ip: &EvaluationPathPair,
        evaluated: &Evaluated,
        annotation_scan: bool,
        out: &mut Vec<StructuralError>,
    ) -> Result<bool, EngineError> {
        let mut child_annotations = evaluated.child(ctx, parent_ip)?;
        if annotation_scan {
            child_annotations.mode = EvaluationMode::FirstError;
            child_annotations.annotation_scan = false;
            child_annotations.collect_annotations = false;
            let mut child_errors = Vec::new();
            self.eval(
                rule,
                value,
                key_path,
                schema_path,
                depth + 1,
                ctx,
                &mut child_errors,
                &mut child_annotations,
            )?;
            Ok(child_errors.is_empty())
        } else {
            self.eval(
                rule,
                value,
                key_path,
                schema_path,
                depth + 1,
                ctx,
                out,
                &mut child_annotations,
            )?;
            Ok(true)
        }
    }

    #[inline(never)]
    #[allow(unused_variables)]
    fn eval_keyword_property_names<T: InstanceView>(
        &self,
        schema: &Value,
        members: &[(Utf16, Value)],
        keyword: &str,
        rule: &Value,
        kp: &EvaluationPathPair,
        data: &T,
        ip: &EvaluationPathPair,
        sp: &EvaluationPathPair,
        depth: usize,
        ctx: &mut Context<'_>,
        out: &mut Vec<StructuralError>,
        evaluated: &mut Evaluated,
        mode: EvaluationMode,
        initial_error_count: usize,
        annotation_scan_complete: &mut bool,
        unevaluated_properties: &mut Option<(&Value, EvaluationPathPair, Option<OwnerCursor>)>,
        unevaluated_items: &mut Option<(&Value, EvaluationPathPair, Option<OwnerCursor>)>,
    ) -> Result<(), EngineError> {
        match keyword {
            "propertyNames" => {
                if let Some(count) = data.object_len() {
                    let order = if evaluated.codegen_errors {
                        Some(compiler_object_order(data, count, ctx)?)
                    } else {
                        None
                    };
                    for slot in 0..count {
                        let index = order.as_ref().map_or(slot, |order| order[slot]);
                        let Some((k, _)) = data.object_entry(index) else {
                            continue;
                        };
                        let keyval = T::text_instance(k, ctx)?;
                        let mut errs = Vec::new();
                        let mut key_annotations = evaluated.child(ctx, ip)?;
                        let branch_mode = key_annotations.mode;
                        if let Err(error) = self.eval(
                            rule,
                            &keyval,
                            ip,
                            &kp,
                            depth + 1,
                            ctx,
                            &mut errs,
                            &mut key_annotations,
                        ) {
                            out.extend(errs);
                            return Err(error);
                        }
                        if !errs.is_empty() {
                            if evaluated.codegen_errors {
                                let property_name = k.to_utf16(ctx)?;
                                for error in &mut errs {
                                    ctx.charge_work(
                                        property_name.len().saturating_add(1),
                                        ip.text().clone(),
                                    )?;
                                    error.compiler_property_name = Some(property_name.clone());
                                }
                                ctx.charge_work(errs.len(), ip.text().clone())?;
                                out.extend(errs);
                                ctx.charge_work(property_name.len().saturating_add(1), ip.text().clone())?;
                                push_ctx(
                                    ctx,
                                    out,
                                    ip,
                                    kp,
                                    "propertyNames",
                                    object(vec![("propertyName", Value::String(property_name))]),
                                    "property name must be valid",
                                )?;
                            } else if matches!(self.regex_profile, RegexProfile::Python(_)) {
                                let override_value =
                                    std::sync::Arc::new(keyval.python_snapshot(ctx)?);
                                ctx.charge_work_u64(
                                    (ip.len() as u64).saturating_mul(errs.len() as u64 + 1),
                                    Utf16::default(),
                                )?;
                                for error in &mut errs {
                                    error.python_physical_instance_path = Some(ip.text().clone());
                                    error.python_instance_override = Some(override_value.clone());
                                }
                                out.extend(errs);
                            } else {
                                let error_path = self.pair_instance_pointer(ip, k, ctx)?;
                                push_ctx(
                                    ctx,
                                    out,
                                    &error_path,
                                    &kp,
                                    "propertyNames",
                                    object(vec![]),
                                    "property name must be valid",
                                )?;
                            }
                            if branch_mode == EvaluationMode::FirstError {
                                break;
                            }
                        }
                    }
                }
            }
            _ => {}
        }
        Ok(())
    }

    #[inline(never)]
    #[allow(unused_variables)]
    fn eval_keyword_items<T: InstanceView>(
        &self,
        schema: &Value,
        members: &[(Utf16, Value)],
        keyword: &str,
        rule: &Value,
        kp: &EvaluationPathPair,
        data: &T,
        ip: &EvaluationPathPair,
        sp: &EvaluationPathPair,
        depth: usize,
        ctx: &mut Context<'_>,
        out: &mut Vec<StructuralError>,
        evaluated: &mut Evaluated,
        mode: EvaluationMode,
        initial_error_count: usize,
        annotation_scan_complete: &mut bool,
        unevaluated_properties: &mut Option<(&Value, EvaluationPathPair, Option<OwnerCursor>)>,
        unevaluated_items: &mut Option<(&Value, EvaluationPathPair, Option<OwnerCursor>)>,
    ) -> Result<(), EngineError> {
        if evaluated.annotation_scan && self.uses_python_2020_annotation_profile() {
            if keyword == "items" {
                // Draft 2020-12's evaluated-index helper treats the presence
                // of `items` as covering the whole instance array without
                // evaluating the child schema a second time.
                if let Some(count) = data.array_len() {
                    for index in 0..count {
                        evaluated.insert_item(index, ctx, ip)?;
                    }
                }
                evaluated.annotation_scan_short_circuit = true;
                return Ok(());
            }
            if keyword == "prefixItems" {
                if let (Value::Array(schemas), Some(count)) = (rule, data.array_len()) {
                    for index in 0..count.min(schemas.len()) {
                        evaluated.insert_item(index, ctx, ip)?;
                    }
                }
                return Ok(());
            }
        }
        if evaluated.annotation_scan && self.uses_python_2019_annotation_profile() {
            match keyword {
                "items" => {
                    let Some(count) = data.array_len() else {
                        return Ok(());
                    };
                    if member(members, "additionalItems").is_some() {
                        for index in 0..count {
                            evaluated.insert_item(index, ctx, ip)?;
                        }
                        evaluated.annotation_scan_short_circuit = true;
                        return Ok(());
                    }
                    match rule {
                        Value::Object(_) => {
                            for index in 0..count {
                                evaluated.insert_item(index, ctx, ip)?;
                            }
                            evaluated.annotation_scan_short_circuit = true;
                        }
                        Value::Array(schemas) => {
                            for index in 0..count.min(schemas.len()) {
                                evaluated.insert_item(index, ctx, ip)?;
                            }
                        }
                        Value::Bool(_) => {
                            return Err(EngineError::new(
                                "PYTHON_SCHEMA_EVALUATION",
                                ip.text().clone(),
                                "Draft 2019-09 boolean items annotation has no length",
                            )
                            .with_python_schema_terminal(
                                PythonSchemaTerminal::LegacyBooleanItems,
                            ));
                        }
                        _ => {}
                    }
                    return Ok(());
                }
                "additionalItems" => {
                    if member(members, "items").is_some() {
                        if let Some(count) = data.array_len() {
                            for index in 0..count {
                                evaluated.insert_item(index, ctx, ip)?;
                            }
                        }
                        evaluated.annotation_scan_short_circuit = true;
                    }
                    return Ok(());
                }
                _ => {}
            }
        }
        match keyword {
            "items" => self.eval_items_keyword_branch(
                members,
                rule,
                kp,
                data,
                ip,
                depth,
                ctx,
                out,
                evaluated,
                mode,
                initial_error_count,
            ),
            "prefixItems" => self.eval_prefix_items_keyword_branch(
                members,
                rule,
                kp,
                data,
                ip,
                depth,
                ctx,
                out,
                evaluated,
                mode,
                initial_error_count,
            ),
            "additionalItems" => self.eval_additional_items_keyword_branch(
                members,
                rule,
                kp,
                data,
                ip,
                depth,
                ctx,
                out,
                evaluated,
                mode,
                initial_error_count,
            ),
            _ => Ok(()),
        }?;
        Ok(())
    }

    #[inline(never)]
    #[allow(unused_variables)]
    fn eval_items_keyword_branch<T: InstanceView>(
        &self,
        members: &[(Utf16, Value)],
        rule: &Value,
        kp: &EvaluationPathPair,
        data: &T,
        ip: &EvaluationPathPair,
        depth: usize,
        ctx: &mut Context<'_>,
        out: &mut Vec<StructuralError>,
        evaluated: &mut Evaluated,
        mode: EvaluationMode,
        initial_error_count: usize,
    ) -> Result<(), EngineError> {
        if let Some(value_count) = data.array_len() {
            match rule {
                Value::Array(schemas) => {
                    for i in 0..value_count.min(schemas.len()) {
                        let (Some(v), s) = (data.array_get(i), &schemas[i]) else {
                            continue;
                        };
                        evaluated.insert_item(i, ctx, ip)?;
                        let mut child_annotations = evaluated.child(ctx, ip)?;
                        let child_path = self.pair_instance_pointer(ip, InstanceText::Utf16(&Utf16::from(i.to_string())), ctx)?;
                        let child_schema_path = self.pair_eval_schema_step(&kp, &i.to_string(),ctx)?;
                        child_annotations.selected_cursor=child_cursor(Some(self),evaluated.selected_cursor.as_ref(),i,ctx)?;
                        let error_start = out.len();
                        self.eval(
                            s,
                            v,
                            &child_path,
                            &child_schema_path,
                            depth + 1,
                            ctx,
                            out,
                            &mut child_annotations,
                        )?;
                        if matches!(self.regex_profile, RegexProfile::Python(_))
                            && matches!(s, Value::Bool(false))
                        {
                            adjust_direct_false_schema_errors(
                                &mut out[error_start..],
                                ip,
                                &child_path,
                                &kp,
                                ctx,
                            )?;
                        }
                        if mode == EvaluationMode::FirstError && out.len() > initial_error_count {
                            break;
                        }
                    }
                }
                s => {
                    let start = if self.dialect == SchemaDialect::Draft7 {
                        match member(members, "items") {
                            Some(Value::Array(a)) => a.len(),
                            _ => 0,
                        }
                    } else {
                        member(members, "prefixItems")
                            .and_then(|x| {
                                if let Value::Array(a) = x {
                                    Some(a.len())
                                } else {
                                    None
                                }
                            })
                            .unwrap_or(0)
                    };
                    let aggregate_false = self.dialect == SchemaDialect::Draft2020_12
                        && matches!(self.regex_profile, RegexProfile::Python(_))
                        && matches!(s, Value::Bool(false))
                        && start < value_count;
                    if aggregate_false {
                        push_ctx(
                            ctx,
                            out,
                            ip,
                            &kp,
                            "items",
                            object(vec![]),
                            "must NOT have additional items",
                        )?;
                        for i in start..value_count {
                            evaluated.insert_item(i, ctx, ip)?;
                        }
                    }
                    if !aggregate_false {
                        for i in start..value_count {
                            let Some(v) = data.array_get(i) else { continue };
                            evaluated.insert_item(i, ctx, ip)?;
                            let mut child_annotations = evaluated.child(ctx, ip)?;
                            let child_path = self.pair_instance_pointer(ip, InstanceText::Utf16(&Utf16::from(i.to_string())), ctx)?;
                            let error_start = out.len();
                            self.eval(
                                s,
                                v,
                                &child_path,
                                &kp,
                                depth + 1,
                                ctx,
                                out,
                                &mut child_annotations,
                            )?;
                            if matches!(self.regex_profile, RegexProfile::Python(_))
                                && matches!(s, Value::Bool(false))
                            {
                                adjust_direct_false_schema_errors(
                                    &mut out[error_start..],
                                    ip,
                                    &child_path,
                                    &kp,
                                    ctx,
                                )?;
                            }
                            if mode == EvaluationMode::FirstError && out.len() > initial_error_count
                            {
                                break;
                            }
                        }
                    }
                }
            }
        }

        Ok(())
    }

    #[inline(never)]
    #[allow(unused_variables)]
    fn eval_prefix_items_keyword_branch<T: InstanceView>(
        &self,
        members: &[(Utf16, Value)],
        rule: &Value,
        kp: &EvaluationPathPair,
        data: &T,
        ip: &EvaluationPathPair,
        depth: usize,
        ctx: &mut Context<'_>,
        out: &mut Vec<StructuralError>,
        evaluated: &mut Evaluated,
        mode: EvaluationMode,
        initial_error_count: usize,
    ) -> Result<(), EngineError> {
        if let Value::Array(schemas) = rule {
            let Some(value_count) = data.array_len() else {
                return Ok(());
            };
            for i in 0..value_count.min(schemas.len()) {
                let (Some(v), s) = (data.array_get(i), &schemas[i]) else {
                    continue;
                };
                evaluated.insert_item(i, ctx, ip)?;
                let mut child_annotations = evaluated.child(ctx, ip)?;
                let child_path = self.pair_instance_pointer(ip, InstanceText::Utf16(&Utf16::from(i.to_string())), ctx)?;
                let child_schema_path = self.pair_eval_schema_step(&kp, &i.to_string(),ctx)?;
                child_annotations.selected_cursor=child_cursor(Some(self),evaluated.selected_cursor.as_ref(),i,ctx)?;
                let error_start = out.len();
                if let Err(error) = self.eval(
                    s,
                    v,
                    &child_path,
                    &child_schema_path,
                    depth + 1,
                    ctx,
                    out,
                    &mut child_annotations,
                ) {
                    return Err(error);
                }
                if matches!(self.regex_profile, RegexProfile::Python(_))
                    && matches!(s, Value::Bool(false))
                {
                    adjust_direct_false_schema_errors(
                        &mut out[error_start..],
                        ip,
                        &child_path,
                        &kp,
                        ctx,
                    )?;
                }
                if mode == EvaluationMode::FirstError && out.len() > initial_error_count {
                    break;
                }
            }
        }

        Ok(())
    }

    #[inline(never)]
    #[allow(unused_variables)]
    fn eval_additional_items_keyword_branch<T: InstanceView>(
        &self,
        members: &[(Utf16, Value)],
        rule: &Value,
        kp: &EvaluationPathPair,
        data: &T,
        ip: &EvaluationPathPair,
        depth: usize,
        ctx: &mut Context<'_>,
        out: &mut Vec<StructuralError>,
        evaluated: &mut Evaluated,
        mode: EvaluationMode,
        initial_error_count: usize,
    ) -> Result<(), EngineError> {
        if let Some(Value::Array(schemas)) = member(members, "items") {
            let Some(value_count) = data.array_len() else {
                return Ok(());
            };
            for i in schemas.len()..value_count {
                let Some(v) = data.array_get(i) else { continue };
                let item_path = self.pair_instance_pointer(ip, InstanceText::Utf16(&Utf16::from(i.to_string())), ctx)?;
                if matches!(rule, Value::Bool(false)) {
                    push_ctx(
                        ctx,
                        out,
                        &item_path,
                        &kp,
                        "additionalItems",
                        object(vec![]),
                        "must NOT have additional items",
                    )?;
                } else {
                    evaluated.insert_item(i, ctx, ip)?;
                    let mut child_annotations = evaluated.child(ctx, ip)?;
                    self.eval(
                        rule,
                        v,
                        &item_path,
                        &kp,
                        depth + 1,
                        ctx,
                        out,
                        &mut child_annotations,
                    )?;
                    if mode == EvaluationMode::FirstError && out.len() > initial_error_count {
                        break;
                    }
                }
            }
        }

        Ok(())
    }

    #[inline(never)]
    #[allow(unused_variables)]
    fn eval_keyword_simple<T: InstanceView>(
        &self,
        schema: &Value,
        members: &[(Utf16, Value)],
        keyword: &str,
        rule: &Value,
        kp: &EvaluationPathPair,
        data: &T,
        ip: &EvaluationPathPair,
        sp: &EvaluationPathPair,
        depth: usize,
        ctx: &mut Context<'_>,
        out: &mut Vec<StructuralError>,
        evaluated: &mut Evaluated,
        mode: EvaluationMode,
        initial_error_count: usize,
        annotation_scan_complete: &mut bool,
        unevaluated_properties: &mut Option<(&Value, EvaluationPathPair, Option<OwnerCursor>)>,
        unevaluated_items: &mut Option<(&Value, EvaluationPathPair, Option<OwnerCursor>)>,
    ) -> Result<(), EngineError> {
        match keyword {
            "minItems" | "maxItems" => {
                if let Some(length) = data.array_len() {
                    bound_error_ctx(ctx, out, ip, &kp, &keyword, rule, length, "items")?
                }
            }
            "minProperties" | "maxProperties" => {
                if let Some(length) = data.object_len() {
                    bound_error_ctx(ctx, out, ip, &kp, &keyword, rule, length, "properties")?
                }
            }
            "minLength" | "maxLength" => {
                if let Some(s) = data.text_value() {
                    bound_error_ctx(
                        ctx,
                        out,
                        ip,
                        &kp,
                        &keyword,
                        rule,
                        s.codepoint_len(),
                        "length",
                    )?
                }
            }
            "pattern" => {
                if let Some(s) = data.text_value() {
                    let Value::String(pat) = rule else {
                        return Ok(());
                    };
                    let re = self.compile_pattern(pat, &kp, ctx)?;
                    if !Self::pattern_matches_text(&re, s, ctx)? {
                        push_ctx_pattern_value(ctx, out, ip, &kp, rule, pat)?;
                    }
                }
            }
            "uniqueItems" => {
                if matches!(rule, Value::Bool(true)) {
                    if let Some(length) = data.array_len() {
                        let mut duplicate = None;
                        for i in 0..length {
                            let Some(value_i) = data.array_get(i) else {
                                continue;
                            };
                            for j in 0..i {
                                let Some(previous) = data.array_get(j) else {
                                    continue;
                                };
                                if instances_equal(previous, value_i, ctx)? {
                                    duplicate = Some((i, j));
                                    break;
                                }
                            }
                            if duplicate.is_some() {
                                break;
                            }
                        }
                        if let Some((i, j)) = duplicate {
                            push_ctx(
                                ctx,
                                out,
                                ip,
                                &kp,
                                "uniqueItems",
                                object(vec![
                                    ("i", Value::Number(i as f64)),
                                    ("j", Value::Number(j as f64)),
                                ]),
                                "must NOT have duplicate items (items ## 1 and 0 are identical)",
                            )?;
                        }
                    }
                }
            }
            _ => {}
        }
        Ok(())
    }

    #[inline(never)]
    #[allow(unused_variables)]
    fn eval_keyword_numeric<T: InstanceView>(
        &self,
        schema: &Value,
        members: &[(Utf16, Value)],
        keyword: &str,
        rule: &Value,
        kp: &EvaluationPathPair,
        data: &T,
        ip: &EvaluationPathPair,
        sp: &EvaluationPathPair,
        depth: usize,
        ctx: &mut Context<'_>,
        out: &mut Vec<StructuralError>,
        evaluated: &mut Evaluated,
        mode: EvaluationMode,
        initial_error_count: usize,
        annotation_scan_complete: &mut bool,
        unevaluated_properties: &mut Option<(&Value, EvaluationPathPair, Option<OwnerCursor>)>,
        unevaluated_items: &mut Option<(&Value, EvaluationPathPair, Option<OwnerCursor>)>,
    ) -> Result<(), EngineError> {
        match keyword {
            "minimum" | "maximum" | "exclusiveMinimum" | "exclusiveMaximum" => {
                if let (Some(n), Value::Number(bound)) = (data.number_value(), rule) {
                    let ordering = n.partial_cmp_f64(*bound, ctx)?;
                    let bad = match keyword {
                        "minimum" => {
                            ordering == Some(std::cmp::Ordering::Less)
                                || matches!(
                                    self.dialect,
                                    SchemaDialect::Draft3 | SchemaDialect::Draft4
                                ) && matches!(
                                    member(members, "exclusiveMinimum"),
                                    Some(Value::Bool(true))
                                ) && ordering == Some(std::cmp::Ordering::Equal)
                        }
                        "maximum" => {
                            ordering == Some(std::cmp::Ordering::Greater)
                                || matches!(
                                    self.dialect,
                                    SchemaDialect::Draft3 | SchemaDialect::Draft4
                                ) && matches!(
                                    member(members, "exclusiveMaximum"),
                                    Some(Value::Bool(true))
                                ) && ordering == Some(std::cmp::Ordering::Equal)
                        }
                        "exclusiveMinimum"
                            if matches!(
                                self.dialect,
                                SchemaDialect::Draft3 | SchemaDialect::Draft4
                            ) =>
                        {
                            false
                        }
                        "exclusiveMaximum"
                            if matches!(
                                self.dialect,
                                SchemaDialect::Draft3 | SchemaDialect::Draft4
                            ) =>
                        {
                            false
                        }
                        // Python's comparisons with NaN are all false. An
                        // unordered comparison therefore does not violate
                        // either exclusive bound in the consumer profile.
                        "exclusiveMinimum" => matches!(
                            ordering,
                            Some(std::cmp::Ordering::Less | std::cmp::Ordering::Equal)
                        ),
                        _ => matches!(
                            ordering,
                            Some(std::cmp::Ordering::Greater | std::cmp::Ordering::Equal)
                        ),
                    };
                    if bad {
                        let rel = if keyword.contains("Minimum") {
                            if keyword == "minimum" {
                                "must be >="
                            } else {
                                "must be >="
                            }
                        } else if keyword == "maximum" {
                            "must be <="
                        } else {
                            "must be <="
                        };
                        push_ctx(
                            ctx,
                            out,
                            ip,
                            &kp,
                            &keyword,
                            object(vec![
                                ("comparison", Value::String(Utf16::from(rel))),
                                ("limit", Value::Number(*bound)),
                            ]),
                            &format!("must be {rel} {}", crate::ecma_number_to_string(*bound)),
                        )?;
                    }
                }
            }
            "multipleOf" | "divisibleBy" => {
                if let (Some(n), Value::Number(d)) = (data.number_value(), rule) {
                    let source_divisor = self
                        .python_exact_values
                        .get(&(rule as *const Value as usize));
                    if !is_multiple_of_source(
                        n,
                        *d,
                        source_divisor.map(std::sync::Arc::as_ref),
                        ctx,
                        ip,
                    )? {
                        push_ctx(
                            ctx,
                            out,
                            ip,
                            &kp,
                            if source_divisor.is_some() {
                                &keyword
                            } else {
                                "multipleOf"
                            },
                            object(vec![(
                                if source_divisor.is_some() {
                                    &keyword
                                } else {
                                    "multipleOf"
                                },
                                rule.clone(),
                            )]),
                            &format!("must be multiple of {}", crate::ecma_number_to_string(*d)),
                        )?;
                    }
                }
            }
            _ => {}
        }
        Ok(())
    }

    #[inline(never)]
    #[allow(unused_variables)]
    fn eval_keyword_combinators<T: InstanceView>(
        &self,
        schema: &Value,
        members: &[(Utf16, Value)],
        keyword: &str,
        rule: &Value,
        kp: &EvaluationPathPair,
        data: &T,
        ip: &EvaluationPathPair,
        sp: &EvaluationPathPair,
        depth: usize,
        ctx: &mut Context<'_>,
        out: &mut Vec<StructuralError>,
        evaluated: &mut Evaluated,
        mode: EvaluationMode,
        initial_error_count: usize,
        annotation_scan_complete: &mut bool,
        unevaluated_properties: &mut Option<(&Value, EvaluationPathPair, Option<OwnerCursor>)>,
        unevaluated_items: &mut Option<(&Value, EvaluationPathPair, Option<OwnerCursor>)>,
    ) -> Result<(), EngineError> {
        let python_annotation_scan = evaluated.annotation_scan
            && (self.uses_python_2020_annotation_profile()
                || self.uses_python_2019_annotation_profile());
        if keyword == "allOf" && !python_annotation_scan {
            return self.eval_keyword_all_of(
                rule,
                kp,
                data,
                ip,
                depth,
                ctx,
                out,
                evaluated,
                mode,
                initial_error_count,
            );
        }
        self.eval_keyword_combinators_other(
            schema,
            members,
            keyword,
            rule,
            kp,
            data,
            ip,
            sp,
            depth,
            ctx,
            out,
            evaluated,
            mode,
            initial_error_count,
            annotation_scan_complete,
            unevaluated_properties,
            unevaluated_items,
        )
    }

    #[inline(never)]
    fn eval_keyword_all_of<T: InstanceView>(
        &self,
        rule: &Value,
        kp: &EvaluationPathPair,
        data: &T,
        ip: &EvaluationPathPair,
        depth: usize,
        ctx: &mut Context<'_>,
        out: &mut Vec<StructuralError>,
        evaluated: &mut Evaluated,
        mode: EvaluationMode,
        initial_error_count: usize,
    ) -> Result<(), EngineError> {
        if let Value::Array(schemas) = rule {
            for (index, schema) in schemas.iter().enumerate() {
                let mut branch_errors = Vec::new();
                let mut branch_annotations = evaluated.child(ctx, ip)?;
                branch_annotations.selected_cursor=child_cursor(Some(self),evaluated.selected_cursor.as_ref(),index,ctx)?;
                if let Err(error) = self.eval(
                    schema,
                    data,
                    ip,
                    &self.pair_eval_schema_step(kp, &index.to_string(),ctx)?,
                    depth + 1,
                    ctx,
                    &mut branch_errors,
                    &mut branch_annotations,
                ) {
                    out.extend(branch_errors);
                    return Err(error);
                }
                if branch_errors.is_empty() {
                    evaluated.merge(branch_annotations, ctx, ip)?;
                }
                out.extend(branch_errors);
                if mode == EvaluationMode::FirstError && out.len() > initial_error_count {
                    break;
                }
            }
        }
        Ok(())
    }

    #[inline(never)]
    #[allow(unused_variables)]
    fn eval_keyword_combinators_other<T: InstanceView>(
        &self,
        schema: &Value,
        members: &[(Utf16, Value)],
        keyword: &str,
        rule: &Value,
        kp: &EvaluationPathPair,
        data: &T,
        ip: &EvaluationPathPair,
        sp: &EvaluationPathPair,
        depth: usize,
        ctx: &mut Context<'_>,
        out: &mut Vec<StructuralError>,
        evaluated: &mut Evaluated,
        mode: EvaluationMode,
        initial_error_count: usize,
        annotation_scan_complete: &mut bool,
        unevaluated_properties: &mut Option<(&Value, EvaluationPathPair, Option<OwnerCursor>)>,
        unevaluated_items: &mut Option<(&Value, EvaluationPathPair, Option<OwnerCursor>)>,
    ) -> Result<(), EngineError> {
        if evaluated.annotation_scan
            && (self.uses_python_2020_annotation_profile()
                || self.uses_python_2019_annotation_profile())
        {
            match keyword {
                "allOf" | "anyOf" | "oneOf" => {
                    if let Value::Array(schemas) = rule {
                        for (index, subschema) in schemas.iter().enumerate() {
                            let mut predicate = evaluated.child(ctx, ip)?;
                            predicate.mode = EvaluationMode::FirstError;
                            predicate.annotation_scan = false;
                            predicate.collect_annotations = false;
                            let mut errors = Vec::new();
                            let child_schema_path = self.pair_eval_schema_step(&kp, &index.to_string(),ctx)?;
                            predicate.selected_cursor=child_cursor(Some(self),evaluated.selected_cursor.as_ref(),index,ctx)?;
                            self.eval(
                                subschema,
                                data,
                                ip,
                                &child_schema_path,
                                depth + 1,
                                ctx,
                                &mut errors,
                                &mut predicate,
                            )?;
                            if errors.is_empty() {
                                self.collect_schema_annotations(
                                    &child_schema_path,
                                    subschema,
                                    data,
                                    ip,
                                    depth + 1,
                                    ctx,
                                    evaluated,
                                )?;
                            }
                        }
                    }
                    return Ok(());
                }
                "if" => {
                    if let Some(condition) = member(members, "if") {
                        let mut predicate = evaluated.child(ctx, ip)?;
                        predicate.mode = EvaluationMode::FirstError;
                        predicate.annotation_scan = false;
                        predicate.collect_annotations = false;
                        let mut errors = Vec::new();
                        self.eval(
                            condition,
                            data,
                            ip,
                            &kp,
                            depth + 1,
                            ctx,
                            &mut errors,
                            &mut predicate,
                        )?;
                        if errors.is_empty() {
                            self.collect_schema_annotations(
                                &kp,
                                condition,
                                data,
                                ip,
                                depth + 1,
                                ctx,
                                evaluated,
                            )?;
                        }
                        let (name, branch) = if errors.is_empty() {
                            ("then", member(members, "then"))
                        } else {
                            ("else", member(members, "else"))
                        };
                        if let Some(branch) = branch {
                            let branch_path = self.pair_eval_schema_step(sp, name,ctx)?;
                            self.collect_schema_annotations(
                                &branch_path,
                                branch,
                                data,
                                ip,
                                depth + 1,
                                ctx,
                                evaluated,
                            )?;
                        }
                    }
                    return Ok(());
                }
                _ => {}
            }
        }
        match keyword {
            "extends" => {
                if let Value::Array(schemas) = rule {
                    let parent_cursor=clone_owner_cursor(evaluated.selected_cursor.as_ref(),ctx)?;
                    for (index, schema) in schemas.iter().enumerate() {
                        evaluated.selected_cursor=child_cursor(Some(self),parent_cursor.as_ref(),index,ctx)?;
                        self.eval(
                            schema,
                            data,
                            ip,
                            &self.pair_eval_schema_step(&kp, &index.to_string(),ctx)?,
                            depth + 1,
                            ctx,
                            out,
                            evaluated,
                        )?;
                        if mode == EvaluationMode::FirstError && out.len() > initial_error_count {
                            break;
                        }
                    }
                } else {
                    self.eval(rule, data, ip, &kp, depth + 1, ctx, out, evaluated)?;
                }
            }
            "anyOf" | "oneOf" => {
                if let Value::Array(schemas) = rule {
                    let mut matches = 0;
                    let codegen_one_of = keyword == "oneOf" && evaluated.codegen_errors;
                    let mut passing_schemas = Vec::new();
                    let mut successful_annotations = Vec::new();
                    // Ajv's default all-errors core profile includes the errors from
                    // each failed anyOf branch before the aggregate anyOf error. The
                    // Python jsonschema consumer profile intentionally exposes only
                    // its aggregate error, so retain branch diagnostics only for the
                    // ECMAScript profile.
                    let mut failed_branch_errors = Vec::new();
                    for (i, s) in schemas.iter().enumerate() {
                        let mut e = Vec::new();
                        let mut branch_annotations = evaluated.child(ctx, ip)?;
                        // jsonschema fully consumes anyOf/oneOf branches
                        // until it finds a success. After the first oneOf
                        // match, later branches are checked with is_valid
                        // (first-error), while anyOf stops immediately.
                        branch_annotations.mode = if !codegen_one_of
                            && matches > 0
                            && (keyword == "oneOf" || evaluated.collect_annotations)
                        {
                            EvaluationMode::FirstError
                        } else {
                            EvaluationMode::AllErrors
                        };
                        branch_annotations.selected_cursor=child_cursor(Some(self),evaluated.selected_cursor.as_ref(),i,ctx)?;
                        let branch_result = self.eval(
                            s,
                            data,
                            ip,
                            &self.pair_eval_schema_step(&kp, &i.to_string(),ctx)?,
                            depth + 1,
                            ctx,
                            &mut e,
                            &mut branch_annotations,
                        );
                        if let Err(error) = branch_result {
                            return Err(error);
                        }
                        if e.is_empty() {
                            matches += 1;
                            successful_annotations.push(branch_annotations);
                            if codegen_one_of {
                                ctx.charge_work(1, ip.text().clone())?;
                                passing_schemas.push(Value::Number(i as f64));
                                if matches == 2 {
                                    break;
                                }
                            }
                            if keyword == "anyOf" && !evaluated.collect_annotations {
                                break;
                            }
                        } else if (keyword == "anyOf" || codegen_one_of)
                            && matches!(self.regex_profile, RegexProfile::Ecma262Unicode)
                            && mode == EvaluationMode::AllErrors
                        {
                            failed_branch_errors.extend(e);
                        }
                    }
                    let failed = if keyword == "anyOf" {
                        matches == 0
                    } else {
                        matches != 1
                    };
                    if failed {
                        // Ajv retains the first passing branch's annotations
                        // even when the second pass makes oneOf invalid.
                        if codegen_one_of {
                            if let Some(first) = successful_annotations.into_iter().next() {
                                evaluated.merge(first, ctx, ip)?;
                            }
                        }
                        out.extend(failed_branch_errors);
                        push_ctx(
                            ctx,
                            out,
                            ip,
                            &kp,
                            &keyword,
                            if codegen_one_of {
                                object(vec![(
                                    "passingSchemas",
                                    if matches == 0 {
                                        Value::Null
                                    } else {
                                        Value::Array(passing_schemas)
                                    },
                                )])
                            } else {
                                object(vec![])
                            },
                            if keyword == "anyOf" {
                                "must match a schema in anyOf"
                            } else {
                                "must match exactly one schema in oneOf"
                            },
                        )?;
                    } else if keyword == "anyOf" {
                        for annotations in successful_annotations {
                            evaluated.merge(annotations, ctx, ip)?;
                        }
                    } else if let Some(annotations) = successful_annotations.pop() {
                        evaluated.merge(annotations, ctx, ip)?;
                    }
                }
            }
            "not" => {
                let mut errs = Vec::new();
                let mut predicate_annotations = evaluated.child(ctx, ip)?;
                predicate_annotations.mode = EvaluationMode::FirstError;
                self.eval(
                    rule,
                    data,
                    ip,
                    &kp,
                    depth + 1,
                    ctx,
                    &mut errs,
                    &mut predicate_annotations,
                )?;
                if errs.is_empty() {
                    push_ctx(
                        ctx,
                        out,
                        ip,
                        &kp,
                        "not",
                        object(vec![]),
                        "must NOT be valid",
                    )?;
                }
            }
            "if" => {
                let mut errs = Vec::new();
                let mut condition_annotations = evaluated.child(ctx, ip)?;
                condition_annotations.mode = EvaluationMode::FirstError;
                self.eval(
                    rule,
                    data,
                    ip,
                    &kp,
                    depth + 1,
                    ctx,
                    &mut errs,
                    &mut condition_annotations,
                )?;
                if errs.is_empty() {
                    evaluated.merge(condition_annotations, ctx, ip)?;
                }
                let then = if errs.is_empty() {
                    member(members, "then")
                } else {
                    member(members, "else")
                };
                if let Some(sub) = then {
                    let name = if errs.is_empty() { "then" } else { "else" };
                    let mut branch_annotations = evaluated.child(ctx, ip)?;
                    let mut branch_errors = Vec::new();
                    branch_annotations.selected_cursor=self.member_cursor(schema,evaluated.schema_cursor.as_ref(),name,ctx)?;
                    if let Err(error) = self.eval(
                        sub,
                        data,
                        ip,
                        &self.pair_eval_schema_step(sp, name,ctx)?,
                        depth + 1,
                        ctx,
                        &mut branch_errors,
                        &mut branch_annotations,
                    ) {
                        out.extend(branch_errors);
                        return Err(error);
                    }
                    if branch_errors.is_empty() {
                        evaluated.merge(branch_annotations, ctx, ip)?;
                    }
                    out.extend(branch_errors);
                }
            }
            _ => {}
        }
        Ok(())
    }

    #[inline(never)]
    #[allow(unused_variables)]
    fn eval_keyword_dependencies<T: InstanceView>(
        &self,
        schema: &Value,
        members: &[(Utf16, Value)],
        keyword: &str,
        rule: &Value,
        kp: &EvaluationPathPair,
        data: &T,
        ip: &EvaluationPathPair,
        sp: &EvaluationPathPair,
        depth: usize,
        ctx: &mut Context<'_>,
        out: &mut Vec<StructuralError>,
        evaluated: &mut Evaluated,
        mode: EvaluationMode,
        initial_error_count: usize,
        annotation_scan_complete: &mut bool,
        unevaluated_properties: &mut Option<(&Value, EvaluationPathPair, Option<OwnerCursor>)>,
        unevaluated_items: &mut Option<(&Value, EvaluationPathPair, Option<OwnerCursor>)>,
    ) -> Result<(), EngineError> {
        match keyword {
            "dependentRequired" | "dependencies" => {
                if let Value::Object(deps) = rule {
                    if data.object_len().is_some() {
                        let parent_cursor=clone_owner_cursor(evaluated.selected_cursor.as_ref(),ctx)?;
                    for (member_index,(trigger, dep)) in deps.iter().enumerate() {
                            if data
                                .object_find(InstanceText::Utf16(trigger), ctx)?
                                .is_some()
                            {
                                if self.dialect == SchemaDialect::Draft3 {
                                    if let Value::String(name) = dep {
                                        if data
                                            .object_find(InstanceText::Utf16(name), ctx)?
                                            .is_none()
                                        {
                                            precharge_string_diagnostic(
                                                ctx,
                                                ip,
                                                &kp,
                                                "dependencies",
                                                "must have property '".len()
                                                    + name.len()
                                                    + "' when property '".len()
                                                    + trigger.len()
                                                    + "' is present".len(),
                                                &[("property", trigger), ("missingProperty", name)],
                                            )?;
                                            let mut message = "must have property '"
                                                .encode_utf16()
                                                .collect::<Vec<_>>();
                                            message.extend(name.units());
                                            message.extend("' when property '".encode_utf16());
                                            message.extend(trigger.units());
                                            message.extend("' is present".encode_utf16());
                                            push_units_ctx_after_precharge(
                                                out,
                                                ip,
                                                &kp,
                                                "dependencies",
                                                object(vec![
                                                    ("property", Value::String(trigger.clone())),
                                                    (
                                                        "missingProperty",
                                                        Value::String(name.clone()),
                                                    ),
                                                ]),
                                                Utf16::new(message),
                                            );
                                        }
                                        if mode == EvaluationMode::FirstError
                                            && out.len() > initial_error_count
                                        {
                                            break;
                                        }
                                        continue;
                                    }
                                }
                                if let Value::Array(names) = dep {
                                    for name in names {
                                        if let Value::String(n) = name {
                                            if data
                                                .object_find(InstanceText::Utf16(n), ctx)?
                                                .is_none()
                                            {
                                                let dependency_keyword =
                                                    if keyword == "dependencies" {
                                                        "dependencies"
                                                    } else {
                                                        "dependentRequired"
                                                    };
                                                precharge_string_diagnostic(
                                                    ctx,
                                                    ip,
                                                    &kp,
                                                    dependency_keyword,
                                                    "must have property '".len()
                                                        + n.len()
                                                        + "' when property '".len()
                                                        + trigger.len()
                                                        + "' is present".len(),
                                                    &[
                                                        ("property", trigger),
                                                        ("missingProperty", n),
                                                    ],
                                                )?;
                                                let mut message = "must have property '"
                                                    .encode_utf16()
                                                    .collect::<Vec<_>>();
                                                message.extend(n.units());
                                                message.extend("' when property '".encode_utf16());
                                                message.extend(trigger.units());
                                                message.extend("' is present".encode_utf16());
                                                push_units_ctx_after_precharge(
                                                    out,
                                                    ip,
                                                    &kp,
                                                    dependency_keyword,
                                                    object(vec![
                                                        (
                                                            "property",
                                                            Value::String(trigger.clone()),
                                                        ),
                                                        (
                                                            "missingProperty",
                                                            Value::String(n.clone()),
                                                        ),
                                                    ]),
                                                    Utf16::new(message),
                                                );
                                            }
                                            if mode == EvaluationMode::FirstError
                                                && out.len() > initial_error_count
                                            {
                                                break;
                                            }
                                        }
                                    }
                                } else {
                                    evaluated.selected_cursor=child_cursor(Some(self),parent_cursor.as_ref(),member_index,ctx)?;
                                    self.eval(
                                        dep,
                                        data,
                                        ip,
                                        &self.pair_plain_schema_pointer(&kp, trigger, ctx)?,
                                        depth + 1,
                                        ctx,
                                        out,
                                        evaluated,
                                    )?;
                                }
                            }
                            if mode == EvaluationMode::FirstError && out.len() > initial_error_count
                            {
                                break;
                            }
                        }
                    }
                }
            }
            "dependentSchemas" => {
                if let Value::Object(deps) = rule {
                    for (member_index,(trigger, sub)) in deps.iter().enumerate() {
                        if data
                            .object_find(InstanceText::Utf16(trigger), ctx)?
                            .is_some()
                        {
                            let child_schema_path = self.pair_plain_schema_pointer(&kp, trigger, ctx)?;
                            if evaluated.annotation_scan
                                && (self.uses_python_2020_annotation_profile()
                                    || self.uses_python_2019_annotation_profile())
                            {
                                self.collect_schema_annotations(
                                    &child_schema_path,
                                    sub,
                                    data,
                                    ip,
                                    depth + 1,
                                    ctx,
                                    evaluated,
                                )?;
                                continue;
                            }
                            let mut branch_errors = Vec::new();
                            let mut branch_annotations = evaluated.child(ctx, ip)?;
                            branch_annotations.selected_cursor=child_cursor(Some(self),evaluated.selected_cursor.as_ref(),member_index,ctx)?;
                            if let Err(error) = self.eval(
                                sub,
                                data,
                                ip,
                                &child_schema_path,
                                depth + 1,
                                ctx,
                                &mut branch_errors,
                                &mut branch_annotations,
                            ) {
                                out.extend(branch_errors);
                                return Err(error);
                            }
                            if branch_errors.is_empty() {
                                evaluated.merge(branch_annotations, ctx, ip)?;
                            }
                            out.extend(branch_errors);
                            if mode == EvaluationMode::FirstError && out.len() > initial_error_count
                            {
                                break;
                            }
                        }
                    }
                }
            }
            _ => {}
        }
        Ok(())
    }

    #[inline(never)]
    #[allow(unused_variables)]
    fn eval_keyword_contains<T: InstanceView>(
        &self,
        schema: &Value,
        members: &[(Utf16, Value)],
        keyword: &str,
        rule: &Value,
        kp: &EvaluationPathPair,
        data: &T,
        ip: &EvaluationPathPair,
        sp: &EvaluationPathPair,
        depth: usize,
        ctx: &mut Context<'_>,
        out: &mut Vec<StructuralError>,
        evaluated: &mut Evaluated,
        mode: EvaluationMode,
        initial_error_count: usize,
        annotation_scan_complete: &mut bool,
        unevaluated_properties: &mut Option<(&Value, EvaluationPathPair, Option<OwnerCursor>)>,
        unevaluated_items: &mut Option<(&Value, EvaluationPathPair, Option<OwnerCursor>)>,
    ) -> Result<(), EngineError> {
        if evaluated.annotation_scan
            && (self.uses_python_2020_annotation_profile()
                || self.uses_python_2019_annotation_profile())
        {
            if keyword == "contains" {
                self.collect_python_item_predicates(rule, kp, data, ip, depth, ctx, evaluated)?;
            }
            return Ok(());
        }
        match keyword {
            "contains" => {
                if let Some(value_count) = data.array_len() {
                    let contains_bounds_apply = matches!(
                        self.dialect,
                        SchemaDialect::Draft2019_09 | SchemaDialect::Draft2020_12
                    );
                    let min = if contains_bounds_apply {
                        member(members, "minContains")
                            .and_then(as_usize)
                            .unwrap_or(1)
                    } else {
                        1
                    };
                    let max = if contains_bounds_apply {
                        member(members, "maxContains").and_then(as_usize)
                    } else {
                        None
                    };
                    if evaluated.codegen_errors {
                        // Ajv ignores an unconstrained zero minimum and rejects
                        // contradictory bounds before evaluating the predicate.
                        if min == 0 && max.is_none() {
                            return Ok(());
                        }
                        let always_valid = match rule {
                            Value::Bool(value) => *value,
                            Value::Object(fields) => {
                                let mut inert = true;
                                for (key, _) in fields {
                                    ctx.charge_work(key.len().saturating_add(1), ip.text().clone())?;
                                    if compiler_keyword_rank(key) != usize::MAX {
                                        inert = false;
                                        break;
                                    }
                                }
                                inert
                            }
                            _ => false,
                        };
                        let contradictory = max.is_some_and(|limit| min > limit);
                        let mut matches = if always_valid { value_count } else { 0 };
                        let mut failures = Vec::new();
                        if !contradictory && !always_valid {
                            // Ajv's nontrivial contains predicate evaluates the
                            // complete array for unevaluatedItems, even on failure.
                            for index in 0..value_count {
                                evaluated.insert_item(index, ctx, ip)?;
                            }
                            for index in 0..value_count {
                                ctx.charge_work(1, ip.text().clone())?;
                                let Some(value) = data.array_get(index) else {
                                    continue;
                                };
                                let mut errors = Vec::new();
                                let mut branch = evaluated.child(ctx, ip)?;
                                branch.mode = EvaluationMode::AllErrors;
                                self.eval(
                                    rule,
                                    value,
                                    &self.pair_instance_pointer(ip, InstanceText::Utf16(&Utf16::from(index.to_string())), ctx)?,
                                    kp,
                                    depth + 1,
                                    ctx,
                                    &mut errors,
                                    &mut branch,
                                )?;
                                if errors.is_empty() {
                                    matches += 1;
                                    if max.is_some_and(|limit| matches > limit)
                                        || (max.is_none() && matches >= min)
                                    {
                                        break;
                                    }
                                } else {
                                    ctx.charge_work(errors.len(), ip.text().clone())?;
                                    failures.extend(errors);
                                }
                            }
                        }
                        if contradictory
                            || matches < min
                            || max.is_some_and(|limit| matches > limit)
                        {
                            out.extend(failures);
                            let mut params = vec![("minContains", Value::Number(min as f64))];
                            let message = if let Some(limit) = max {
                                params.push(("maxContains", Value::Number(limit as f64)));
                                format!(
                                    "must contain at least {min} and no more than {limit} valid item(s)"
                                )
                            } else {
                                format!("must contain at least {min} valid item(s)")
                            };
                            push_ctx(ctx, out, ip, kp, "contains", object(params), &message)?;
                        }
                        return Ok(());
                    }
                    let mut matches = 0;
                    let mut matching_indices = Vec::new();
                    for i in 0..value_count {
                        let Some(v) = data.array_get(i) else { continue };
                        let mut errs = Vec::new();
                        let mut predicate_annotations = evaluated.child(ctx, ip)?;
                        predicate_annotations.mode = EvaluationMode::FirstError;
                        self.eval(
                            rule,
                            v,
                            &self.pair_instance_pointer(ip, InstanceText::Utf16(&Utf16::from(i.to_string())), ctx)?,
                            &kp,
                            depth + 1,
                            ctx,
                            &mut errs,
                            &mut predicate_annotations,
                        )?;
                        if errs.is_empty() {
                            matches += 1;
                            matching_indices.push(i);
                            if matches!(self.dialect, SchemaDialect::Draft6 | SchemaDialect::Draft7)
                            {
                                break;
                            }
                            if max.is_some_and(|limit| matches > limit) {
                                // The upper bound has already failed.  The
                                // Python validator returns this keyword
                                // error without evaluating later items.
                                break;
                            }
                        }
                    }
                    if matches < min || max.is_some_and(|limit| matches > limit) {
                        let keyword = if !matches!(self.regex_profile, RegexProfile::Python(_)) {
                            "contains"
                        } else if max.is_some_and(|limit| matches > limit) {
                            "maxContains"
                        } else if contains_bounds_apply
                            && (min > 1 || member(members, "minContains").is_some())
                        {
                            "minContains"
                        } else {
                            "contains"
                        };
                        push_ctx(
                            ctx,
                            out,
                            ip,
                            &kp,
                            keyword,
                            object(vec![]),
                            "must contain at least one valid item",
                        )?;
                    } else {
                        for index in matching_indices {
                            evaluated.insert_item(index, ctx, ip)?;
                        }
                    }
                }
            }
            "format" => {}
            _ => {}
        }
        Ok(())
    }

    #[inline(never)]
    fn eval_boolean_schema(
        &self,
        allow: bool,
        ip: &EvaluationPathPair,
        sp: &EvaluationPathPair,
        ctx: &mut Context<'_>,
        out: &mut Vec<StructuralError>,
    ) -> Result<(), EngineError> {
        if allow {
            return Ok(());
        }

        let error_start = out.len();
        let false_schema_segment = "false schema";
        let false_schema_path_len = (sp.len() as u64)
            .saturating_add(u64::from(sp.units().last() != Some(&(b'/' as u16))))
            .saturating_add(false_schema_segment.encode_utf16().count() as u64);
        let python_metadata = matches!(self.regex_profile, RegexProfile::Python(_));
        // Charge path construction and the diagnostic copies before either is allocated.
        let mut work = (ip.len() as u64)
            .saturating_add(sp.len() as u64)
            .saturating_add(false_schema_path_len)
            .saturating_add("false schema".len() as u64)
            .saturating_add("boolean schema is false".encode_utf16().count() as u64)
            .saturating_add(1);
        if python_metadata {
            // The Python projection also retains the physical instance pointer and
            // copies the parent schema pointer into the error record.
            work = work
                .saturating_add(ip.len() as u64)
                .saturating_add(sp.len() as u64)
                .saturating_add(sp.len() as u64);
        }
        ctx.charge_work_u64(work, Utf16::default())?;
        let false_schema_path = self.pair_eval_schema_step(sp, false_schema_segment,ctx)?;
        push_ctx_precharged(
            out,
            ip,
            &false_schema_path,
            "false schema",
            Value::Object(vec![]),
            Utf16::from("boolean schema is false"),
        );
        if python_metadata {
            let error = out.get_mut(error_start).expect("false schema just emitted");
            error.python_error = Some(PythonErrorMetadata {
                validator: None,
                validator_value: std::sync::Arc::new(
                    crate::python_value::PythonConsumerValue::Null,
                ),
            });
            error.python_physical_instance_path = Some(ip.text().clone());
            let mut parent_path = sp.units().to_vec();
            if let Some(last_slash) = parent_path.iter().rposition(|unit| *unit == b'/' as u16) {
                let last_segment = &parent_path[last_slash + 1..];
                if !last_segment.is_empty()
                    && last_segment
                        .iter()
                        .all(|unit| (b'0' as u16..=b'9' as u16).contains(unit))
                {
                    parent_path.truncate(last_slash);
                }
            }
            error.schema_path = Utf16::new(parent_path);
        }
        Ok(())
    }

    fn eval_inner<T: InstanceView>(
        &self,
        schema: &Value,
        data: &T,
        ip: &EvaluationPathPair,
        sp: &EvaluationPathPair,
        depth: usize,
        ctx: &mut Context<'_>,
        out: &mut Vec<StructuralError>,
        evaluated: &mut Evaluated,
    ) -> Result<(), EngineError> {
        let mode = evaluated.mode;
        let initial_error_count = out.len();
        ctx.charge_work(1, ip.text().clone())?;
        if depth > ctx.limits().max_depth {
            return Err(EngineError::new(
                "LIMIT",
                ip.text().clone(),
                "Schema evaluation depth exceeded",
            ));
        }
        if let Value::Bool(allow) = schema {
            self.eval_boolean_schema(*allow, ip, sp, ctx, out)?;
            return Ok(());
        }
        let Value::Object(members) = schema else {
            return Ok(());
        };
        let node_plan=match &self.owner_plans {
            Some(plans)=>plans.node_at(self,schema,sp,evaluated.codegen_errors,evaluated.schema_cursor.as_ref(),ctx)?,
            None=>None,
        };
        let mut annotation_scan_complete = false;
        // Ajv reports keyword errors in source/schema insertion order.
        let has_ref = matches!(
            self.dialect,
            SchemaDialect::Draft3
                | SchemaDialect::Draft4
                | SchemaDialect::Draft6
                | SchemaDialect::Draft7
        ) && node_plan.as_ref().map_or_else(|| members
            .iter()
            .any(|(k, _)| k.to_utf8().ok().as_deref() == Some("$ref")),|plan|plan.has_ref);
        ctx.charge_work(2 * std::mem::size_of::<Option<(&Value, EvaluationPathPair, Option<OwnerCursor>)>>()
            .div_ceil(std::mem::size_of::<usize>()), Utf16::default())?;
        let mut unevaluated_properties: Option<(&Value, EvaluationPathPair, Option<OwnerCursor>)> = None;
        let mut unevaluated_items: Option<(&Value, EvaluationPathPair, Option<OwnerCursor>)> = None;
        // Opt-in compiler presentation follows the pinned ECMAScript
        // validator's keyword groups, rather than schema insertion order.
        // The normal/Python path allocates no ordering vector and retains its
        // original traversal, callbacks and diagnostic order.
        let compiler_order = if node_plan.is_some() { None } else if evaluated.codegen_errors {
            ctx.charge_work(members.len().saturating_mul(128), Utf16::default())?;
            let mut order = Vec::with_capacity(members.len());
            for (index, (key, _)) in members.iter().enumerate() {
                ctx.charge_work(key.len().saturating_add(1), Utf16::default())?;
                order.push((compiler_keyword_rank(key), index));
            }
            order.sort_unstable();
            Some(order)
        } else {
            None
        };
        'keywords: for slot in 0..members.len() {
            let order=node_plan.as_ref().and_then(|p|p.compiler_order.as_ref()).or(compiler_order.as_ref());
            let index = order.map_or(slot, |order| order[slot].1);
            let (key, rule) = &members[index];
            evaluated.selected_cursor=child_cursor(Some(self),evaluated.schema_cursor.as_ref(),index,ctx)?;
            let keyword=if let Some(plan)=&node_plan {
                let Some(keyword)=plan.keywords[index].as_deref() else { continue };
                std::borrow::Cow::Borrowed(keyword)
            } else {
                let Ok(keyword)=key.to_utf8() else { continue };
                std::borrow::Cow::Owned(keyword)
            };
            if evaluated.annotation_scan
                && !matches!(
                    keyword.as_ref(),
                    "$ref"
                        | "$dynamicRef"
                        | "$recursiveRef"
                        | "allOf"
                        | "anyOf"
                        | "oneOf"
                        | "extends"
                        | "properties"
                        | "patternProperties"
                        | "additionalProperties"
                        | "items"
                        | "prefixItems"
                        | "additionalItems"
                        | "contains"
                        | "dependencies"
                        | "dependentSchemas"
                        | "if"
                        | "unevaluatedProperties"
                        | "unevaluatedItems"
                )
            {
                continue;
            }
            // A keyword known to a newer dialect is an inert extension in
            // older consumer dialects. In particular, do not execute a
            // Draft 2020/2019 arm merely because it shares the same spelling.
            if !active_keywords(self.dialect).contains(&keyword.as_ref())
                || !evaluated.keyword_policy.keyword_is_active(&keyword)
            {
                continue;
            }
            if has_ref
                && keyword != "$ref"
                && !matches!(
                    keyword.as_ref(),
                    "$schema"
                        | "$id"
                        | "$comment"
                        | "title"
                        | "description"
                        | "default"
                        | "examples"
                        | "definitions"
                )
            {
                continue;
            }
            let kp = self.pair_schema_pointer(sp, key, ctx)?;
            let result = match keyword.as_ref() {
                "unevaluatedProperties" | "unevaluatedItems" => self.eval_keyword_annotations(
                    schema,
                    members,
                    &keyword,
                    rule,
                    &kp,
                    data,
                    ip,
                    sp,
                    depth,
                    ctx,
                    out,
                    evaluated,
                    mode,
                    initial_error_count,
                    &mut annotation_scan_complete,
                    &mut unevaluated_properties,
                    &mut unevaluated_items,
                ),
                "$ref" | "$dynamicRef" | "$recursiveRef" => self.eval_keyword_references(
                    schema,
                    members,
                    &keyword,
                    rule,
                    &kp,
                    data,
                    ip,
                    sp,
                    depth,
                    ctx,
                    out,
                    evaluated,
                    mode,
                    initial_error_count,
                    &mut annotation_scan_complete,
                    &mut unevaluated_properties,
                    &mut unevaluated_items,
                ),
                "type" | "disallow" | "const" | "enum" | "required" => self.eval_keyword_basic(
                    schema,
                    members,
                    &keyword,
                    rule,
                    &kp,
                    data,
                    ip,
                    sp,
                    depth,
                    ctx,
                    out,
                    evaluated,
                    mode,
                    initial_error_count,
                    &mut annotation_scan_complete,
                    &mut unevaluated_properties,
                    &mut unevaluated_items,
                ),
                "properties" => self.eval_keyword_properties(
                    schema,
                    members,
                    &keyword,
                    rule,
                    &kp,
                    data,
                    ip,
                    sp,
                    depth,
                    ctx,
                    out,
                    evaluated,
                    mode,
                    initial_error_count,
                    &mut annotation_scan_complete,
                    &mut unevaluated_properties,
                    &mut unevaluated_items,
                ),
                "patternProperties" => self.eval_keyword_patterns_additional(
                    schema,
                    members,
                    &keyword,
                    rule,
                    &kp,
                    data,
                    ip,
                    sp,
                    depth,
                    ctx,
                    out,
                    evaluated,
                    mode,
                    initial_error_count,
                    &mut annotation_scan_complete,
                    &mut unevaluated_properties,
                    &mut unevaluated_items,
                ),
                "additionalProperties" => self.eval_keyword_additional_properties(
                    members,
                    rule,
                    &kp,
                    data,
                    ip,
                    sp,
                    depth,
                    ctx,
                    out,
                    evaluated,
                    mode,
                    initial_error_count,
                ),
                "propertyNames" => self.eval_keyword_property_names(
                    schema,
                    members,
                    &keyword,
                    rule,
                    &kp,
                    data,
                    ip,
                    sp,
                    depth,
                    ctx,
                    out,
                    evaluated,
                    mode,
                    initial_error_count,
                    &mut annotation_scan_complete,
                    &mut unevaluated_properties,
                    &mut unevaluated_items,
                ),
                "items" | "prefixItems" | "additionalItems" => self.eval_keyword_items(
                    schema,
                    members,
                    &keyword,
                    rule,
                    &kp,
                    data,
                    ip,
                    sp,
                    depth,
                    ctx,
                    out,
                    evaluated,
                    mode,
                    initial_error_count,
                    &mut annotation_scan_complete,
                    &mut unevaluated_properties,
                    &mut unevaluated_items,
                ),
                "minItems" | "maxItems" | "minProperties" | "maxProperties" | "minLength"
                | "maxLength" | "pattern" | "uniqueItems" => self.eval_keyword_simple(
                    schema,
                    members,
                    &keyword,
                    rule,
                    &kp,
                    data,
                    ip,
                    sp,
                    depth,
                    ctx,
                    out,
                    evaluated,
                    mode,
                    initial_error_count,
                    &mut annotation_scan_complete,
                    &mut unevaluated_properties,
                    &mut unevaluated_items,
                ),
                "minimum" | "maximum" | "exclusiveMinimum" | "exclusiveMaximum" | "multipleOf"
                | "divisibleBy" => self.eval_keyword_numeric(
                    schema,
                    members,
                    &keyword,
                    rule,
                    &kp,
                    data,
                    ip,
                    sp,
                    depth,
                    ctx,
                    out,
                    evaluated,
                    mode,
                    initial_error_count,
                    &mut annotation_scan_complete,
                    &mut unevaluated_properties,
                    &mut unevaluated_items,
                ),
                "allOf" | "extends" | "anyOf" | "oneOf" | "not" | "if" => self
                    .eval_keyword_combinators(
                        schema,
                        members,
                        &keyword,
                        rule,
                        &kp,
                        data,
                        ip,
                        sp,
                        depth,
                        ctx,
                        out,
                        evaluated,
                        mode,
                        initial_error_count,
                        &mut annotation_scan_complete,
                        &mut unevaluated_properties,
                        &mut unevaluated_items,
                    ),
                "dependentRequired" | "dependencies" | "dependentSchemas" => self
                    .eval_keyword_dependencies(
                        schema,
                        members,
                        &keyword,
                        rule,
                        &kp,
                        data,
                        ip,
                        sp,
                        depth,
                        ctx,
                        out,
                        evaluated,
                        mode,
                        initial_error_count,
                        &mut annotation_scan_complete,
                        &mut unevaluated_properties,
                        &mut unevaluated_items,
                    ),
                "contains" | "format" => self.eval_keyword_contains(
                    schema,
                    members,
                    &keyword,
                    rule,
                    &kp,
                    data,
                    ip,
                    sp,
                    depth,
                    ctx,
                    out,
                    evaluated,
                    mode,
                    initial_error_count,
                    &mut annotation_scan_complete,
                    &mut unevaluated_properties,
                    &mut unevaluated_items,
                ),
                _ => Ok(()),
            };
            result?;
            if mode == EvaluationMode::FirstError && out.len() > initial_error_count {
                break 'keywords;
            }
            if evaluated.annotation_scan && evaluated.annotation_scan_short_circuit {
                break 'keywords;
            }
        }
        // Move both actual deferred slots into the finishing continuation.
        ctx.charge_work(2 * std::mem::size_of::<Option<(&Value, EvaluationPathPair, Option<OwnerCursor>)>>()
            .div_ceil(std::mem::size_of::<usize>()), Utf16::default())?;
        self.finish_eval_inner(
            members,
            data,
            ip,
            depth,
            ctx,
            out,
            evaluated,
            mode,
            initial_error_count,
            unevaluated_properties,
            unevaluated_items,
        )
    }

    #[inline(never)]
    fn finish_eval_inner<T: InstanceView>(
        &self,
        members: &[(Utf16, Value)],
        data: &T,
        ip: &EvaluationPathPair,
        depth: usize,
        ctx: &mut Context<'_>,
        out: &mut Vec<StructuralError>,
        evaluated: &mut Evaluated,
        mode: EvaluationMode,
        initial_error_count: usize,
        unevaluated_properties: Option<(&Value, EvaluationPathPair, Option<OwnerCursor>)>,
        unevaluated_items: Option<(&Value, EvaluationPathPair, Option<OwnerCursor>)>,
    ) -> Result<(), EngineError> {
        // continue into post-keyword annotation work (notably unevaluated*).
        if mode == EvaluationMode::FirstError && out.len() > initial_error_count {
            return Ok(());
        }
        if let Some((rule, kp, cursor)) = unevaluated_properties {
            if let Some(count) = data.object_len() {
                let mut unevaluated = Vec::new();
                for index in 0..count {
                    let Some((name, value)) = data.object_entry(index) else {
                        continue;
                    };
                    if evaluated.contains_property(name, ctx, ip)? {
                        continue;
                    }
                    let path_name = name.to_utf16(ctx)?;
                    if matches!(rule, Value::Bool(false)) {
                        unevaluated.push(Value::String(path_name.clone()));
                        continue;
                    }
                    let mut child_annotations = evaluated.child(ctx, ip)?;
                    child_annotations.selected_cursor=clone_owner_cursor(cursor.as_ref(),ctx)?;
                    self.eval(
                        rule,
                        value,
                        &self.pair_instance_pointer(ip, name, ctx)?,
                        &kp,
                        depth + 1,
                        ctx,
                        out,
                        &mut child_annotations,
                    )?;
                    evaluated.insert_property(name, ctx, ip)?;
                    if mode == EvaluationMode::FirstError && out.len() > initial_error_count {
                        break;
                    }
                }
                if !unevaluated.is_empty() {
                    push_ctx(
                        ctx,
                        out,
                        ip,
                        &kp,
                        "unevaluatedProperties",
                        object(vec![("unevaluatedProperty", unevaluated[0].clone())]),
                        "must NOT have unevaluated properties",
                    )?;
                }
            }
        }
        if let Some((rule, kp, cursor)) = unevaluated_items {
            if let Some(count) = data.array_len() {
                let mut unevaluated = Vec::new();
                for index in 0..count {
                    let Some(value) = data.array_get(index) else {
                        continue;
                    };
                    if evaluated.contains_item(index, ctx, ip)? {
                        continue;
                    }
                    if matches!(rule, Value::Bool(false)) {
                        unevaluated.push(Value::Number(index as f64));
                        continue;
                    }
                    let mut child_annotations = evaluated.child(ctx, ip)?;
                    child_annotations.selected_cursor=clone_owner_cursor(cursor.as_ref(),ctx)?;
                    self.eval(
                        rule,
                        value,
                        &self.pair_instance_pointer(ip, InstanceText::Utf16(&Utf16::from(index.to_string())), ctx)?,
                        &kp,
                        depth + 1,
                        ctx,
                        out,
                        &mut child_annotations,
                    )?;
                    evaluated.insert_item(index, ctx, ip)?;
                    if mode == EvaluationMode::FirstError && out.len() > initial_error_count {
                        break;
                    }
                }
                if !unevaluated.is_empty() {
                    push_ctx(
                        ctx,
                        out,
                        ip,
                        &kp,
                        "unevaluatedItems",
                        object(vec![("unevaluatedItems", Value::Array(unevaluated))]),
                        "must NOT have unevaluated items",
                    )?;
                }
            }
        }
        if matches!(self.regex_profile, RegexProfile::Python(_)) {
            self.attach_python_error_metadata(&mut out[initial_error_count..], members, ctx)?;
            for error in &mut out[initial_error_count..] {
                if error.python_physical_instance_path.is_none() {
                    ctx.charge_work(ip.len(), Utf16::default())?;
                    error.python_physical_instance_path = Some(ip.text().clone());
                }
            }
        }
        Ok(())
    }

    fn attach_python_error_metadata(
        &self,
        errors: &mut [StructuralError],
        members: &[(Utf16, Value)],
        ctx: &mut Context<'_>,
    ) -> Result<(), EngineError> {
        for error in errors {
            if error.python_error.is_some() {
                continue;
            }
            let keyword = error.keyword.as_str();
            let value = if keyword == "required" && self.dialect == SchemaDialect::Draft3 {
                // Draft 3's property-level required form reports the literal
                // child keyword value, not the parent's `properties` object.
                members
                    .iter()
                    .find(|(name, _)| name == &Utf16::from("properties"))
                    .and_then(|(_, properties)| match properties {
                        Value::Object(properties) => properties.iter().find_map(|(_, schema)| {
                            matches!(get(schema, "required"), Some(Value::Bool(true)))
                                .then_some(get(schema, "required").expect("matched"))
                        }),
                        _ => None,
                    })
                    .or_else(|| {
                        members
                            .iter()
                            .find(|(name, _)| name == &Utf16::from("required"))
                            .map(|(_, rule)| rule)
                    })
            } else {
                members
                    .iter()
                    .find(|(name, _)| name == &Utf16::from(keyword))
                    .map(|(_, rule)| rule)
            };
            let validator_value = if let Some(value) = value {
                self.python_schema_value(value, ctx)?
            } else {
                crate::python_value::PythonConsumerValue::Null
            };
            ctx.charge_work_u64(keyword.len() as u64 + 1, error.schema_path.clone())?;
            error.python_error = Some(PythonErrorMetadata {
                validator: Some(crate::python_value::PyText::from_utf8(keyword)),
                validator_value: std::sync::Arc::new(validator_value),
            });
        }
        Ok(())
    }

    fn python_schema_value(
        &self,
        value: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<crate::python_value::PythonConsumerValue, EngineError> {
        use crate::python_value::PythonConsumerValue as Py;
        ctx.charge_work(1, Utf16::default())?;
        if let Some(source) = self
            .python_exact_values
            .get(&(value as *const Value as usize))
        {
            return source.snapshot_with_context(ctx);
        }
        Ok(match value {
            Value::Null => Py::Null,
            Value::Bool(value) => Py::Bool(*value),
            Value::Number(value) => Py::Float(value.to_bits()),
            Value::String(text) => {
                let source = self
                    .python_source_strings
                    .get(&(text as *const Utf16 as usize));
                if let Some(source) = source {
                    ctx.charge_work(source.len(), Utf16::default())?;
                    Py::String(source.clone())
                } else {
                    ctx.charge_work(text.len(), Utf16::default())?;
                    Py::String(crate::python_value::py_text_from_utf16(text))
                }
            }
            Value::Array(items) => Py::Array(
                items
                    .iter()
                    .map(|item| self.python_schema_value(item, ctx))
                    .collect::<Result<_, _>>()?,
            ),
            Value::Object(items) => Py::Object(
                items
                    .iter()
                    .map(|(key, item)| {
                        let source_key =
                            self.python_source_keys.get(&(key as *const Utf16 as usize));
                        let key = if let Some(source_key) = source_key {
                            ctx.charge_work(source_key.len(), Utf16::default())?;
                            source_key.clone()
                        } else {
                            ctx.charge_work(key.len(), Utf16::default())?;
                            crate::python_value::py_text_from_utf16(key)
                        };
                        Ok((key, self.python_schema_value(item, ctx)?))
                    })
                    .collect::<Result<_, EngineError>>()?,
            ),
        })
    }
}

fn unavailable() -> EngineError {
    EngineError::new(
        "RESOURCE_PROFILE_UNAVAILABLE",
        Utf16::default(),
        "HardIsolated resource profile is unavailable",
    )
}

fn validate_local_reference_gate(
    value: &Value,
    path: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    ctx.charge_work(path.len().saturating_add(1), Utf16::default())?;
    match value {
        Value::Array(items) => {
            for (index, item) in items.iter().enumerate() {
                ctx.charge_work(path.len().saturating_add(22), Utf16::default())?;
                validate_local_reference_gate(
                    item,
                    &append_schema_path(path, &index.to_string()),
                    ctx,
                )?;
            }
        }
        Value::Object(members) => {
            for (key, item) in members {
                ctx.charge_work_u64(
                    path.len() as u64 + (key.len() as u64).saturating_mul(2) + 30,
                    Utf16::default(),
                )?;
                let child = append_schema_pointer(path, key);
                if key == &Utf16::from("$ref") || key == &Utf16::from("$dynamicRef") {
                    if !matches!(item, Value::String(reference) if reference.units().first() == Some(&(b'#' as u16)))
                    {
                        return Err(EngineError::new(
                            "SCHEMA_REF_UNRESOLVED",
                            child,
                            "Schema reference is not in the supplied resource set",
                        ));
                    }
                }
                validate_local_reference_gate(item, &child, ctx)?;
            }
        }
        _ => {}
    }
    Ok(())
}

enum MetaBacking { Owned(Value), Shared(Arc<Value>) }
impl std::ops::Deref for MetaBacking {
    type Target = Value;
    fn deref(&self) -> &Value { match self { Self::Owned(v) => v, Self::Shared(v) => v } }
}


fn read_encoded_retained_metaschema(ctx:&mut Context<'_>)->Result<crate::serialization::CompletedOwnedJson,EngineError>{
    read_encoded_retained_metaschema_impl(ctx,&mut |_|{})
}
#[cfg(test)]
fn read_encoded_retained_metaschema_with_events(ctx:&mut Context<'_>,observer:&mut dyn FnMut(&'static str))->Result<crate::serialization::CompletedOwnedJson,EngineError>{
    read_encoded_retained_metaschema_impl(ctx,observer)
}
fn read_encoded_retained_metaschema_impl(ctx:&mut Context<'_>,observer:&mut dyn FnMut(&'static str))->Result<crate::serialization::CompletedOwnedJson,EngineError>{
    // Encoding-only immutable source. No materialization, parser result,
    // validator or index is cached here. Text and every runtime check remain.
    observer("encoded-source-borrow");
    let source=schema_metas_utf16::SCHEMA_METAS_UTF16;
    #[cfg(test)]
    let parsed=crate::serialization::read_construction_json_completed_with_events(source,ctx,observer)?;
    #[cfg(not(test))]
    let parsed=crate::serialization::read_construction_json_completed(source,ctx)?;
    observer("encoded-source-completed");
    Ok(parsed)
}

// Retained construction admits conversion before materializing its input.
// UTF-8 byte length is an O(1) upper bound on UTF-16 output units, including
// non-ASCII input. No sizing scan/allocation runs before this control. Reader
// text/token/tree charges remain separate and use the same cumulative Context.
fn read_retained_metaschema_with<'a, T>(
    source: &str,
    ctx: &mut Context<'a>,
    materialize: impl FnOnce(&str) -> Vec<u16>,
    parse: impl FnOnce(&[u16], &mut Context<'a>) -> Result<T, EngineError>,
) -> Result<T, EngineError> {
        ctx.with_constructor_site("ctor.meta-materialize", |ctx| {
    ctx.charge_work(source.len(), Utf16::default())?;
    let units = materialize(source);
    parse(&units, ctx)

        })
    }

fn validate_schema_against_metaschema(
    schema: &Value,
    dialect: SchemaDialect,
    regex_profile: RegexProfile,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    validate_schema_against_metaschema_mode(schema,dialect,regex_profile,ctx,false)
}
fn validate_schema_against_metaschema_mode(
    schema: &Value,
    dialect: SchemaDialect,
    regex_profile: RegexProfile,
    ctx: &mut Context<'_>,
    owned_input:bool,
) -> Result<(), EngineError> {
        ctx.with_constructor_site("ctor.meta-evaluation", |ctx| {
    let state = if matches!(regex_profile, RegexProfile::Ecma262Unicode) { ctx.schema_construction.clone() } else { None };
    if let Some(state) = &state {
        let count = state.borrow().meta_validators.len();
        ctx.charge_work(count, Utf16::default())?;
        let validators = state.borrow().meta_validators.clone();
        for (limits, prior_dialect, validator) in validators {
            if limits == ctx.limits() && prior_dialect == dialect {
                let errors = validator.evaluate_admitted_codegen_value(schema, false, ctx)?;
                if let Some(error) = errors.first() {
                    return Err(EngineError::new("SCHEMA_INVALID", error.instance_path.clone(), error.message.clone()));
                }
                return Ok(());
            }
        }
    }
    let prior = state.as_ref().and_then(|s| s.borrow().metas.clone());
    let meta_data = if let Some((_, data)) = prior.filter(|(limits,_)| *limits == ctx.limits()) {
        ctx.charge_work(1, Utf16::default())?;
        MetaBacking::Shared(data)
    } else {
        let source = include_str!("schema_metas.json");
        let mut parsed=None;
        let data = if state.is_some() {
            if owned_input {
                let completed=read_encoded_retained_metaschema(ctx)?;
                ctx.charge_work(2,Utf16::default())?;
                let completed=Arc::new(completed);
                let data=Arc::clone(completed.value());parsed=Some(completed);MetaBacking::Shared(data)
            } else {
                MetaBacking::Owned(read_retained_metaschema_with(source, ctx,
                    |source| source.encode_utf16().collect::<Vec<_>>(),
                    |units, ctx|crate::serialization::read_json_value(units, crate::serialization::Format::Json, ctx))?)
            }
        } else {
            // Generic/legacy behavior is deliberately unchanged.
            MetaBacking::Owned(crate::serialization::read_json_value(
                &source.encode_utf16().collect::<Vec<_>>(), crate::serialization::Format::Json, ctx)?)
        };
        if let Some(state) = &state {
            ctx.charge_work(1, Utf16::default())?;
            let data=match data {MetaBacking::Shared(data)=>data,MetaBacking::Owned(data)=>Arc::new(data)};
            let mut current=state.borrow_mut();
            current.metas = Some((ctx.limits(), Arc::clone(&data)));current.parsed_metas=parsed;
            MetaBacking::Shared(data)
        } else {data}
    };
    let metas = get(&meta_data, "metaschemas").ok_or_else(|| {
        EngineError::new(
            "SCHEMA_INTERNAL",
            Utf16::default(),
            "Pinned metaschema data is malformed",
        )
    })?;
    let meta_name = match dialect {
        SchemaDialect::Draft3 => "Draft3Validator",
        SchemaDialect::Draft4 => "Draft4Validator",
        SchemaDialect::Draft6 => "Draft6Validator",
        SchemaDialect::Draft7 => "Draft7Validator",
        SchemaDialect::Draft2019_09 => "Draft201909Validator",
        SchemaDialect::Draft2020_12 => "Draft202012Validator",
    };
    let meta_schema = get(metas, meta_name)
        .ok_or_else(|| {
            EngineError::new(
                "SCHEMA_INTERNAL",
                Utf16::default(),
                "Pinned metaschema is missing",
            )
        })?;
    let (meta_storage,resources,projected_bank)=if owned_input && state.is_some() {
        ctx.charge_work(1,Utf16::default())?;
        let MetaBacking::Shared(tree)=&meta_data else {unreachable!("owned reader source is retained in same construction");};
        let parsed=state.as_ref().and_then(|s|s.borrow().parsed_metas.clone());
        let bank=if let Some(parsed)=parsed.filter(|p|Arc::ptr_eq(p.value(),tree)) {
            admitted_bank::SchemaBank::from_completed_reader(parsed,dialect,ctx)?
        } else {admitted_bank::SchemaBank::from_meta(Arc::clone(tree),dialect,ctx)?};
        (None,Vec::new(),Some(bank))
    } else {
    let meta_schema = if state.is_some() { copy_schema_json(meta_schema, ctx, false)? } else { meta_schema.clone() };

    let resources = match get(&meta_data, "resources") {
        Some(Value::Array(items)) => items
            .iter()
            .map(|item| {
                if state.is_some() {
                    if let Some(Value::String(id)) = get(item, "id") {
                        ctx.charge_work(id.len().saturating_mul(2), Utf16::default())?;
                    }
                }
                let id = get(item, "id").and_then(as_utf8).ok_or_else(|| {
                    EngineError::new(
                        "SCHEMA_INTERNAL",
                        Utf16::default(),
                        "Pinned metaschema resource has no id",
                    )
                })?;
                let value = get(item, "schema").ok_or_else(|| {
                    EngineError::new(
                        "SCHEMA_INTERNAL",
                        Utf16::default(),
                        "Pinned metaschema resource has no schema",
                    )
                })?;
                let value = if state.is_some() { copy_schema_json(value, ctx, false)? } else { value.clone() };
                Ok((Utf16::from(id), value))
            })
            .collect::<Result<Vec<_>, EngineError>>()?,
        _ => {
            return Err(EngineError::new(
                "SCHEMA_INTERNAL",
                Utf16::default(),
                "Pinned metaschema resources are malformed",
            ));
        }
    };
    (Some(meta_schema),resources,None)
    };
    if projected_bank.is_some(){ctx.charge_work(1,Utf16::default())?;}
    let mut meta = CompiledSchema {
        schema: if let Some(bank)=&projected_bank {SchemaRoot::Bank(Arc::clone(bank),admitted_bank::BankRoot::Meta)} else {SchemaRoot::publish(meta_storage.expect("legacy owned meta root"),state.is_some(),ctx)?},
        resources: SchemaBacking::Owned(SchemaResources { entries: resources }),
        resource_bank:projected_bank,
        cold_resource_index: None,
        owner_plans: None,
        owner_lineage: None,
            owner_locations: None,
        dialect,
        strict: false,
        root_keyword_policy: KeywordPolicy::DRAFT2020,
        regex_profile,
        resolve_references_at_compile: false,
        python_text_origins: std::collections::BTreeMap::new(),
        python_member_keys: std::collections::BTreeMap::new(),
        python_source_strings: std::collections::BTreeMap::new(),
        python_source_keys: std::collections::BTreeMap::new(),
        python_exact_values: std::collections::BTreeMap::new(),
        python_reference_targets: std::collections::BTreeMap::new(),
        python_resource_roots: std::collections::BTreeMap::new(),
        dynamic_anchor_cache: Mutex::new(std::collections::BTreeMap::new()),
    };
    if state.is_some() {
        ctx.charge_work(1,Utf16::default())?;
        meta.owner_lineage = Some(Arc::new(()));
        meta.owner_locations = OwnerLocations::build(&meta,ctx)?;
        meta.cold_resource_index = ColdResourceIndex::build(&meta, ctx)?;
        ctx.charge_work(1, Utf16::default())?;
        meta.owner_plans = Some(Arc::new(OwnerPlans::default()));
    }
    let errors = if state.is_some() {meta.evaluate_admitted_codegen_value(schema,false,ctx)?}
        else {meta.validate_instance(schema,ctx)?};
    if let Some(error) = errors.first() {
        return Err(EngineError::new(
            "SCHEMA_INVALID",
            error.instance_path.clone(),
            error.message.clone(),
        ));
    }
    if let Some(state) = state {
        ctx.charge_work(1, Utf16::default())?;
        state.borrow_mut().meta_validators.push((ctx.limits(), dialect, Arc::new(meta)));
    }
    Ok(())

        })
    }

fn declared_dialect(schema: &Value) -> Option<SchemaDialect> {
    let id = as_utf8(get(schema, "$schema")?)?;
    dialect_from_uri(&id)
}
fn dialect_from_uri(id: &str) -> Option<SchemaDialect> {
    match id {
        "http://json-schema.org/draft-03/schema#" | "http://json-schema.org/draft-03/schema" => {
            Some(SchemaDialect::Draft3)
        }
        "http://json-schema.org/draft-04/schema#" | "http://json-schema.org/draft-04/schema" => {
            Some(SchemaDialect::Draft4)
        }
        "http://json-schema.org/draft-06/schema#" | "http://json-schema.org/draft-06/schema" => {
            Some(SchemaDialect::Draft6)
        }
        "http://json-schema.org/draft-07/schema#" | "http://json-schema.org/draft-07/schema" => {
            Some(SchemaDialect::Draft7)
        }
        "https://json-schema.org/draft/2019-09/schema"
        | "https://json-schema.org/draft/2019-09/schema#" => Some(SchemaDialect::Draft2019_09),
        "https://json-schema.org/draft/2020-12/schema"
        | "https://json-schema.org/draft/2020-12/schema#" => Some(SchemaDialect::Draft2020_12),
        _ => None,
    }
}
fn declared_dialect_metered(
    schema: &Value,
    ctx: &mut Context<'_>,
    path: &Utf16,
) -> Result<Option<SchemaDialect>, EngineError> {
    let Some(value) = get_metered(schema, "$schema", ctx, path)? else {
        return Ok(None);
    };
    if let Value::String(text) = value {
        ctx.charge_work(text.len(), path.clone())?;
    }
    Ok(as_utf8(value).and_then(|uri| dialect_from_uri(&uri)))
}
fn select_dialect(schema: &Value) -> Result<SchemaDialect, EngineError> {
    if get(schema, "$schema").is_none() {
        return Ok(SchemaDialect::Draft2020_12);
    }
    declared_dialect(schema).ok_or_else(|| {
        EngineError::new(
            "SCHEMA_DIALECT",
            Utf16::default(),
            "Unsupported JSON Schema dialect",
        )
    })
}
fn custom_vocabulary_policy(
    uri: &str,
    resources: &SchemaResources,
    ctx: &mut Context<'_>,
    path: Utf16,
) -> Result<KeywordPolicy, EngineError> {
    custom_vocabulary_policy_view(uri,admitted_bank::Catalogue::Borrowed(&resources.entries),ctx,path)
}
fn custom_vocabulary_policy_view(
    uri: &str,
    resources: admitted_bank::Catalogue<'_>,
    ctx: &mut Context<'_>,
    path: Utf16,
) -> Result<KeywordPolicy, EngineError> {
    let mut resource = None;
    for (retrieval, value) in &resources {
        ctx.charge_work(retrieval.len(), path.clone())?;
        let retrieval_matches = retrieval.to_utf8().ok().as_deref() == Some(uri);
        let id_matches = if retrieval_matches {
            false
        } else {
            schema_id_metered(value, ctx, &path)?.as_deref() == Some(uri)
        };
        if retrieval_matches || id_matches {
            resource = Some(value);
            break;
        }
    }
    let resource = resource.ok_or_else(|| {
        EngineError::new(
            "SCHEMA_DIALECT",
            Utf16::default(),
            "Custom schema dialect must be supplied as an explicit resource",
        )
    })?;
    if declared_dialect_metered(resource, ctx, &path)?.is_none() {
        return Err(EngineError::new(
            "SCHEMA_DIALECT",
            Utf16::default(),
            "Custom dialect metaschema must declare a supported base dialect",
        ));
    }
    let vocabularies = get_metered(resource, "$vocabulary", ctx, &path)?
        .and_then(|value| match value {
            Value::Object(members) => Some(members),
            _ => None,
        })
        .ok_or_else(|| {
            EngineError::new(
                "SCHEMA_DIALECT",
                Utf16::default(),
                "Custom dialect resource requires a valid $vocabulary object",
            )
        })?;
    let mut core_required = false;
    let mut policy = KeywordPolicy {
        applicator: false,
        validation: false,
        unevaluated: false,
        custom: true,
    };
    for (name, required) in vocabularies {
        ctx.charge_work(name.len(), path.clone())?;
        let name = name.to_utf8().map_err(|_| {
            EngineError::new(
                "SCHEMA_DIALECT",
                Utf16::default(),
                "Vocabulary URI must be valid Unicode",
            )
        })?;
        let Value::Bool(required) = required else {
            return Err(EngineError::new(
                "SCHEMA_DIALECT",
                Utf16::default(),
                "$vocabulary values must be booleans",
            ));
        };
        let implemented = match name.as_str() {
            "https://json-schema.org/draft/2020-12/vocab/core" => {
                core_required = *required;
                true
            }
            "https://json-schema.org/draft/2020-12/vocab/applicator"
            | "https://json-schema.org/draft/2020-12/vocab/validation"
            | "https://json-schema.org/draft/2020-12/vocab/meta-data"
            | "https://json-schema.org/draft/2020-12/vocab/format-annotation"
            | "https://json-schema.org/draft/2020-12/vocab/content"
            | "https://json-schema.org/draft/2020-12/vocab/unevaluated" => true,
            _ => false,
        };
        if *required && !implemented {
            return Err(EngineError::new(
                "SCHEMA_DIALECT",
                Utf16::default(),
                "Custom dialect requires an unsupported vocabulary",
            ));
        }
        match name.as_str() {
            "https://json-schema.org/draft/2020-12/vocab/applicator" => {
                policy.applicator = *required
            }
            "https://json-schema.org/draft/2020-12/vocab/validation" => {
                policy.validation = *required
            }
            "https://json-schema.org/draft/2020-12/vocab/unevaluated" => {
                policy.unevaluated = *required
            }
            _ => {}
        }
    }
    if !core_required {
        return Err(EngineError::new(
            "SCHEMA_DIALECT",
            Utf16::default(),
            "Custom dialect must require the Draft 2020-12 core vocabulary",
        ));
    }
    Ok(policy)
}

fn is_validation_vocabulary_keyword(keyword: &str) -> bool {
    matches!(
        keyword,
        "type"
            | "const"
            | "enum"
            | "multipleOf"
            | "maximum"
            | "exclusiveMaximum"
            | "minimum"
            | "exclusiveMinimum"
            | "maxLength"
            | "minLength"
            | "pattern"
            | "maxItems"
            | "minItems"
            | "uniqueItems"
            | "maxContains"
            | "minContains"
            | "maxProperties"
            | "minProperties"
            | "required"
            | "dependentRequired"
    )
}

fn is_applicator_vocabulary_keyword(keyword: &str) -> bool {
    matches!(
        keyword,
        "prefixItems"
            | "items"
            | "contains"
            | "additionalProperties"
            | "properties"
            | "patternProperties"
            | "dependentSchemas"
            | "propertyNames"
            | "if"
            | "then"
            | "else"
            | "allOf"
            | "anyOf"
            | "oneOf"
            | "not"
    )
}

fn is_unevaluated_vocabulary_keyword(keyword: &str) -> bool {
    matches!(keyword, "unevaluatedItems" | "unevaluatedProperties")
}

fn active_keywords(d: SchemaDialect) -> &'static [&'static str] {
    match d {
        SchemaDialect::Draft3 => &[
            "$ref",
            "additionalItems",
            "additionalProperties",
            "dependencies",
            "disallow",
            "divisibleBy",
            "enum",
            "extends",
            "format",
            "items",
            "maxItems",
            "maxLength",
            "maximum",
            "minItems",
            "minLength",
            "minimum",
            "pattern",
            "patternProperties",
            "properties",
            "type",
            "uniqueItems",
        ],
        SchemaDialect::Draft4 => &[
            "$ref",
            "additionalItems",
            "additionalProperties",
            "allOf",
            "anyOf",
            "dependencies",
            "enum",
            "format",
            "items",
            "maxItems",
            "maxLength",
            "maxProperties",
            "maximum",
            "minItems",
            "minLength",
            "minProperties",
            "minimum",
            "multipleOf",
            "not",
            "oneOf",
            "pattern",
            "patternProperties",
            "properties",
            "required",
            "type",
            "uniqueItems",
        ],
        SchemaDialect::Draft6 => &[
            "$ref",
            "additionalItems",
            "additionalProperties",
            "allOf",
            "anyOf",
            "const",
            "contains",
            "dependencies",
            "enum",
            "exclusiveMaximum",
            "exclusiveMinimum",
            "format",
            "items",
            "maxItems",
            "maxLength",
            "maxProperties",
            "maximum",
            "minItems",
            "minLength",
            "minProperties",
            "minimum",
            "multipleOf",
            "not",
            "oneOf",
            "pattern",
            "patternProperties",
            "properties",
            "propertyNames",
            "required",
            "type",
            "uniqueItems",
        ],
        SchemaDialect::Draft7 => &[
            "$ref",
            "additionalItems",
            "additionalProperties",
            "allOf",
            "anyOf",
            "const",
            "contains",
            "dependencies",
            "enum",
            "exclusiveMaximum",
            "exclusiveMinimum",
            "format",
            "if",
            "items",
            "maxItems",
            "maxLength",
            "maxProperties",
            "maximum",
            "minItems",
            "minLength",
            "minProperties",
            "minimum",
            "multipleOf",
            "not",
            "oneOf",
            "pattern",
            "patternProperties",
            "properties",
            "propertyNames",
            "required",
            "type",
            "uniqueItems",
        ],
        SchemaDialect::Draft2019_09 => &[
            "$recursiveRef",
            "$ref",
            "additionalItems",
            "additionalProperties",
            "allOf",
            "anyOf",
            "const",
            "contains",
            "dependentRequired",
            "dependentSchemas",
            "enum",
            "exclusiveMaximum",
            "exclusiveMinimum",
            "format",
            "if",
            "items",
            "maxItems",
            "maxLength",
            "maxProperties",
            "maximum",
            "minItems",
            "minLength",
            "minProperties",
            "minimum",
            "multipleOf",
            "not",
            "oneOf",
            "pattern",
            "patternProperties",
            "properties",
            "propertyNames",
            "required",
            "type",
            "then",
            "else",
            "unevaluatedItems",
            "unevaluatedProperties",
            "uniqueItems",
        ],
        SchemaDialect::Draft2020_12 => &[
            "$dynamicRef",
            "$ref",
            "additionalProperties",
            "allOf",
            "anyOf",
            "const",
            "contains",
            "dependentRequired",
            "dependentSchemas",
            "enum",
            "exclusiveMaximum",
            "exclusiveMinimum",
            "format",
            "if",
            "items",
            "maxItems",
            "maxLength",
            "maxProperties",
            "maximum",
            "minItems",
            "minLength",
            "minProperties",
            "minimum",
            "multipleOf",
            "not",
            "oneOf",
            "pattern",
            "patternProperties",
            "prefixItems",
            "properties",
            "propertyNames",
            "required",
            "then",
            "else",
            "type",
            "unevaluatedItems",
            "unevaluatedProperties",
            "uniqueItems",
        ],
    }
}

fn keywords(d: SchemaDialect) -> BTreeSet<&'static str> {
    let mut out = [
        "$schema",
        "$ref",
        "title",
        "description",
        "default",
        "type",
        "enum",
        "maximum",
        "minimum",
        "exclusiveMaximum",
        "exclusiveMinimum",
        "maxLength",
        "minLength",
        "pattern",
        "maxItems",
        "minItems",
        "uniqueItems",
        "required",
        "properties",
        "patternProperties",
        "additionalProperties",
        "items",
        "additionalItems",
        "format",
    ]
    .into_iter()
    .collect::<BTreeSet<_>>();
    if matches!(d, SchemaDialect::Draft3 | SchemaDialect::Draft4) {
        out.insert("id");
    } else {
        out.insert("$id");
    }
    if matches!(
        d,
        SchemaDialect::Draft3
            | SchemaDialect::Draft4
            | SchemaDialect::Draft6
            | SchemaDialect::Draft7
    ) {
        out.insert("dependencies");
    }
    if d != SchemaDialect::Draft3 {
        out.extend([
            "allOf",
            "anyOf",
            "oneOf",
            "not",
            "minProperties",
            "maxProperties",
        ]);
    }
    if matches!(
        d,
        SchemaDialect::Draft4 | SchemaDialect::Draft6 | SchemaDialect::Draft7
    ) {
        out.insert("definitions");
    }
    if d != SchemaDialect::Draft3 {
        out.insert("multipleOf");
    } else {
        out.insert("divisibleBy");
        out.extend(["extends", "disallow"]);
    }
    if matches!(
        d,
        SchemaDialect::Draft6
            | SchemaDialect::Draft7
            | SchemaDialect::Draft2019_09
            | SchemaDialect::Draft2020_12
    ) {
        out.extend(["const", "contains", "propertyNames"]);
    }
    if matches!(
        d,
        SchemaDialect::Draft7 | SchemaDialect::Draft2019_09 | SchemaDialect::Draft2020_12
    ) {
        out.extend([
            "if",
            "then",
            "else",
            "$comment",
            "examples",
            "readOnly",
            "writeOnly",
            "contentEncoding",
            "contentMediaType",
        ]);
    }
    if matches!(d, SchemaDialect::Draft2019_09 | SchemaDialect::Draft2020_12) {
        out.extend([
            "$defs",
            "dependentRequired",
            "dependentSchemas",
            "unevaluatedItems",
            "unevaluatedProperties",
            "minContains",
            "maxContains",
            "contentSchema",
            "$vocabulary",
            "$anchor",
        ]);
    }
    if d == SchemaDialect::Draft2019_09 {
        out.extend(["$recursiveAnchor", "$recursiveRef"]);
    }
    if d == SchemaDialect::Draft2020_12 {
        out.extend(["prefixItems", "$dynamicAnchor", "$dynamicRef", "deprecated"]);
    }
    out
}
fn schema_error(path: &Utf16, msg: &str) -> EngineError {
    EngineError::new("SCHEMA_INVALID", path.clone(), msg)
}
/// Copy a schema carrier while preserving distinct Python dictionary keys
/// that happen to project to the same UTF-16 sequence. Source-origin member
/// metadata disambiguates them in the shared Python-profile evaluator.
fn copy_schema_json(value:&Value,ctx:&mut Context<'_>,allow_duplicate_keys:bool)->Result<Value,EngineError> {
    Ok(schema_json_with_mode(value,ctx,allow_duplicate_keys,true)?.expect("copying admission publishes a value"))
}
// Private shared admission seams: tests reach actual effects; no caller-visible
// proof/debug API. Copy mode preserves its original path/callback sequence.
fn schema_admission_error(code:&str,path:&mut Utf16,message:&str)->EngineError {
    EngineError::new(code,std::mem::take(path),message)
}
fn schema_admission_node(path:&mut Utf16,depth:usize,count:&mut usize,ctx:&mut Context<'_>)->Result<(),EngineError> {
    ctx.charge_work_with_path(1,path)?;
    *count=count.checked_add(1).ok_or_else(||schema_admission_error("LIMIT",path,"Schema value count overflow"))?;
    ctx.check_tree_value_count_with_path(*count,path)?;
    if depth>ctx.limits().max_depth {return Err(schema_admission_error("LIMIT",path,"Schema nesting depth exceeded"));}
    Ok(())
}
fn schema_admission_key_with_copy(
    key:&Utf16,keys:&mut BTreeSet<Vec<u16>>,path:&mut Utf16,ctx:&mut Context<'_>,
    materialize:impl FnOnce(&Utf16)->Vec<u16>,
)->Result<bool,EngineError> {
    let units=key.len() as u64;
    let comparisons=units.saturating_add(1).saturating_mul(tree_compare_bound(keys.len()));
    // Key storage/copy is independent of comparison work, including an empty
    // duplicate set. Admit BOTH before materialization/search/insertion.
    let work=comparisons.saturating_add(units).saturating_add(1);
    ctx.charge_work_u64_with_path(work,path)?;
    Ok(keys.insert(materialize(key)))
}
fn schema_json_with_mode(value:&Value,ctx:&mut Context<'_>,allow_duplicate_keys:bool,copy:bool)->Result<Option<Value>,EngineError> {
    ctx.with_constructor_site(if copy {"ctor.admission-copy"} else {"ctor.plan-work"},|ctx| {
        fn visit(value:&Value,path:&mut Utf16,depth:usize,count:&mut usize,ctx:&mut Context<'_>,allow_duplicate_keys:bool,copy:bool)->Result<Option<Value>,EngineError> {
            schema_admission_node(path,depth,count,ctx)?;
            match value {
                Value::Null=>Ok(copy.then_some(Value::Null)),
                Value::Bool(v)=>Ok(copy.then_some(Value::Bool(*v))),
                Value::Number(v) if allow_duplicate_keys=>{
                    let admitted=Value::number(*v,std::mem::take(path))?;Ok(if copy {Some(admitted)} else {None})
                },
                Value::Number(v) if v.is_finite()=>Ok(copy.then_some(Value::Number(*v))),
                Value::Number(_)=>Err(schema_admission_error("NUMBER",path,"JSON Schema numbers must be finite binary64 values")),
                Value::String(v)=>{
                    if copy {ctx.charge_work_with_path(v.len(),path)?;Ok(Some(Value::String(v.clone())))} else {Ok(None)}
                },
                Value::Array(items)=>{
                    if copy {ctx.charge_work_with_path(items.len(),path)?;}
                    let mut copied=if copy {Some(Vec::with_capacity(items.len()))} else {None};
                    for (i,item) in items.iter().enumerate() {
                        if !copy {ctx.charge_work(path.len().saturating_add(81),Utf16::default())?;}
                        let next=visit(item,&mut append_schema_pointer(path,&Utf16::from(i.to_string())),depth+1,count,ctx,allow_duplicate_keys,copy)?;
                        if let Some(copied)=&mut copied {copied.push(next.expect("copy mode"));}
                    }
                    Ok(copied.map(Value::Array))
                },
                Value::Object(members)=>{
                    if copy {ctx.charge_work_with_path(members.len(),path)?;}
                    let mut copied=if copy {Some(Vec::with_capacity(members.len()))} else {None};
                    let mut keys=BTreeSet::new();
                    for (key,value) in members {
                        if copy {
                            ctx.charge_work_with_path(key.len(),path)?;
                            if !allow_duplicate_keys && !keys.insert(key.units().to_vec()) {return Err(schema_admission_error("DUPLICATE_KEY",path,"Duplicate object key"));}
                        } else if !allow_duplicate_keys && !schema_admission_key_with_copy(key,&mut keys,path,ctx,|key|key.units().to_vec())? {
                            return Err(schema_admission_error("DUPLICATE_KEY",path,"Duplicate object key"));
                        }
                        // Preserve the legacy copy's key-before-child effect.
                        let copied_key=if copy {Some(key.clone())} else {None};
                        if !copy {ctx.charge_work(path.len().saturating_add(key.len().saturating_mul(3)).saturating_add(1),Utf16::default())?;}
                        let next=visit(value,&mut append_schema_pointer(path,key),depth+1,count,ctx,allow_duplicate_keys,copy)?;
                        if let Some(copied)=&mut copied {copied.push((copied_key.expect("copy key"),next.expect("copy mode")));}
                    }
                    Ok(copied.map(Value::Object))
                },
            }
        }
        visit(value,&mut Utf16::from("#"),0,&mut 0,ctx,allow_duplicate_keys,copy)
    })
}

fn schema_id_metered(
    schema: &Value,
    ctx: &mut Context<'_>,
    path: &Utf16,
) -> Result<Option<String>, EngineError> {
    let value = match get_metered(schema, "$id", ctx, path)? {
        Some(value) => Some(value),
        None => get_metered(schema, "id", ctx, path)?,
    };
    let Some(value) = value else {
        return Ok(None);
    };
    if let Value::String(text) = value {
        ctx.charge_work(text.len(), path.clone())?;
    }
    Ok(as_utf8(value).filter(|id| !id.is_empty()))
}
fn schema_id(schema: &Value) -> Option<String> {
    as_utf8(get(schema, "$id").or_else(|| get(schema, "id"))?).filter(|id| !id.is_empty())
}
fn schema_origin_path(schema: &Value) -> Utf16 {
    let Some(id) = schema_id(schema) else {
        return Utf16::from("#");
    };
    Utf16::from(format!("{id}#"))
}
fn rebase_source_origins(origins: &mut crate::python_value::PythonSchemaOrigins, root: &Utf16) {
    let old = Utf16::from("#");
    let rebase = |path: Vec<u16>| {
        if path.starts_with(old.units()) {
            let mut units = root.units().to_vec();
            units.extend_from_slice(&path[old.len()..]);
            units
        } else {
            path
        }
    };
    origins.values = std::mem::take(&mut origins.values)
        .into_iter()
        .map(|(path, text)| (rebase(path), text))
        .collect();
    origins.members = std::mem::take(&mut origins.members)
        .into_iter()
        .map(|((path, index), text)| ((rebase(path), index), text))
        .collect();
}
fn percent_decode_fragment(fragment: &str) -> String {
    fn hex(byte: u8) -> Option<u8> {
        match byte {
            b'0'..=b'9' => Some(byte - b'0'),
            b'a'..=b'f' => Some(byte - b'a' + 10),
            b'A'..=b'F' => Some(byte - b'A' + 10),
            _ => None,
        }
    }
    let bytes = fragment.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut at = 0;
    while at < bytes.len() {
        if bytes[at] == b'%' && at + 2 < bytes.len() {
            if let (Some(high), Some(low)) = (hex(bytes[at + 1]), hex(bytes[at + 2])) {
                decoded.push(high * 16 + low);
                at += 3;
                continue;
            }
        }
        decoded.push(bytes[at]);
        at += 1;
    }
    String::from_utf8_lossy(&decoded).into_owned()
}
fn resolve_schema_uri(dialect: SchemaDialect, base: &str, reference: &str) -> Option<String> {
    if dialect == SchemaDialect::Draft2020_12 {
        return resolve_draft2020_uri(base, reference);
    }
    // The legacy profiles retain their historical relative-path joiner, but
    // an absolute `$id`/reference is already a complete URI and must not be
    // appended to the current scope as though it were a path.
    if url::Url::parse(reference).is_ok() {
        return Some(reference.to_owned());
    }
    resolve_relative_uri(base, reference)
}
fn resolve_draft2020_uri(base: &str, reference: &str) -> Option<String> {
    if let Ok(absolute) = url::Url::parse(reference) {
        return Some(absolute.to_string());
    }
    let base = url::Url::parse(base).ok()?;
    base.join(reference).ok().map(|joined| joined.to_string())
}
fn resolve_relative_uri(base: &str, reference: &str) -> Option<String> {
    let (scheme, rest) = base.split_once("://")?;
    let authority_end = rest.find('/').unwrap_or(rest.len());
    let authority = &rest[..authority_end];
    if authority.is_empty() && scheme != "file" {
        return None;
    }
    let base_path = &rest[authority_end..];
    let joined = if reference.starts_with('/') {
        reference.to_owned()
    } else {
        let directory = base_path
            .rfind('/')
            .map(|index| &base_path[..=index])
            .unwrap_or("/");
        format!("{directory}{reference}")
    };
    let mut parts = Vec::new();
    for part in joined.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                parts.pop();
            }
            _ => parts.push(part),
        }
    }
    let path = format!("/{}", parts.join("/"));
    Some(format!("{scheme}://{authority}{path}"))
}

/// Resolve a relative URI using only ASCII URI delimiters while preserving
/// Python source code points, including lone surrogates, in the URI payload.
fn resolve_relative_python_uri(base: &[u32], reference: &[u32]) -> Option<Vec<u32>> {
    // Port of the qualified CPython urllib.parse.urljoin grammar. Payload
    // codepoints remain opaque; only ASCII structural characters are parsed.
    const RELATIVE: &[&str] = &[
        "", "ftp", "http", "gopher", "nntp", "imap", "wais", "file", "https", "shttp", "mms",
        "prospero", "rtsp", "rtsps", "rtspu", "sftp", "svn", "svn+ssh", "ws", "wss",
    ];
    const NETLOC: &[&str] = &[
        "", "ftp", "http", "gopher", "nntp", "telnet", "imap", "wais", "file", "mms", "https",
        "shttp", "snews", "prospero", "rtsp", "rtsps", "rtspu", "rsync", "svn", "svn+ssh", "sftp",
        "nfs", "git", "git+ssh", "ws", "wss",
    ];
    const PARAMS: &[&str] = &[
        "", "ftp", "hdl", "prospero", "http", "imap", "https", "shttp", "rtsp", "rtsps", "rtspu",
        "sip", "sips", "mms", "sftp", "tel",
    ];
    fn in_set(points: &[u32], words: &[&str]) -> bool {
        words
            .iter()
            .any(|word| points.iter().copied().eq(word.bytes().map(u32::from)))
    }
    struct Parts {
        scheme: Vec<u32>,
        netloc: Vec<u32>,
        path: Vec<u32>,
        params: Vec<u32>,
        query: Vec<u32>,
        fragment: Vec<u32>,
    }
    fn parse(raw: &[u32], default_scheme: &[u32]) -> Parts {
        let start = raw
            .iter()
            .position(|point| *point > 0x20)
            .unwrap_or(raw.len());
        let cleaned: Vec<u32> = raw[start..]
            .iter()
            .copied()
            .filter(|point| !matches!(*point, 9 | 10 | 13))
            .collect();
        let mut remaining = cleaned.as_slice();
        let mut scheme = default_scheme.to_vec();
        if let Some(colon) = remaining.iter().position(|point| *point == b':' as u32) {
            if colon > 0
                && matches!(remaining[0], 65..=90 | 97..=122)
                && remaining[..colon]
                    .iter()
                    .all(|point| matches!(*point, 65..=90 | 97..=122 | 48..=57 | 43 | 45 | 46))
            {
                scheme = remaining[..colon]
                    .iter()
                    .map(|point| {
                        if (65..=90).contains(point) {
                            point + 32
                        } else {
                            *point
                        }
                    })
                    .collect();
                remaining = &remaining[colon + 1..];
            }
        }
        let netloc = if remaining.starts_with(&[47, 47]) {
            let end = remaining[2..]
                .iter()
                .position(|point| matches!(*point, 47 | 63 | 35))
                .map_or(remaining.len(), |i| i + 2);
            let netloc = remaining[2..end].to_vec();
            remaining = &remaining[end..];
            netloc
        } else {
            Vec::new()
        };
        let fragment = if let Some(index) = remaining.iter().position(|point| *point == 35) {
            let fragment = remaining[index + 1..].to_vec();
            remaining = &remaining[..index];
            fragment
        } else {
            Vec::new()
        };
        let query = if let Some(index) = remaining.iter().position(|point| *point == 63) {
            let query = remaining[index + 1..].to_vec();
            remaining = &remaining[..index];
            query
        } else {
            Vec::new()
        };
        let params = if in_set(&scheme, PARAMS) {
            let start = remaining
                .iter()
                .rposition(|point| *point == 47)
                .unwrap_or(0);
            if let Some(index) = remaining[start..]
                .iter()
                .position(|point| *point == 59)
                .map(|i| start + i)
            {
                let params = remaining[index + 1..].to_vec();
                remaining = &remaining[..index];
                params
            } else {
                Vec::new()
            }
        } else {
            Vec::new()
        };
        Parts {
            scheme,
            netloc,
            path: remaining.to_vec(),
            params,
            query,
            fragment,
        }
    }
    fn unparse(parts: Parts) -> Vec<u32> {
        let mut path = parts.path;
        if !parts.params.is_empty() {
            path.push(59);
            path.extend(parts.params);
        }
        let mut out = Vec::new();
        if !parts.scheme.is_empty() {
            out.extend_from_slice(&parts.scheme);
            out.push(58);
        }
        if !parts.netloc.is_empty()
            || (!parts.scheme.is_empty() && in_set(&parts.scheme, NETLOC))
            || path.starts_with(&[47, 47])
        {
            out.extend_from_slice(&[47, 47]);
            out.extend(parts.netloc);
            if !path.is_empty() && path.first() != Some(&47) {
                out.push(47);
            }
        }
        out.extend(path);
        if !parts.query.is_empty() {
            out.push(63);
            out.extend(parts.query);
        }
        if !parts.fragment.is_empty() {
            out.push(35);
            out.extend(parts.fragment);
        }
        out
    }
    if base.is_empty() {
        return Some(reference.to_vec());
    }
    if reference.is_empty() {
        return Some(base.to_vec());
    }
    let base = parse(base, &[]);
    let mut target = parse(reference, &base.scheme);
    if target.scheme != base.scheme || !in_set(&target.scheme, RELATIVE) {
        return Some(reference.to_vec());
    }
    if in_set(&target.scheme, NETLOC) {
        if !target.netloc.is_empty() {
            return Some(unparse(target));
        }
        target.netloc = base.netloc;
    }
    if target.path.is_empty() && target.params.is_empty() {
        target.path = base.path;
        target.params = base.params;
        if target.query.is_empty() {
            target.query = base.query;
        }
        return Some(unparse(target));
    }
    let mut segments: Vec<&[u32]>;
    if target.path.first() == Some(&47) {
        segments = target.path.split(|point| *point == 47).collect();
    } else {
        segments = base.path.split(|point| *point == 47).collect();
        if segments.last().is_some_and(|part| !part.is_empty()) {
            segments.pop();
        }
        segments.extend(target.path.split(|point| *point == 47));
        let len = segments.len();
        // Python removes redundant empty interior segments only for a
        // relative path. Preserve absolute-path double slashes and trailing /.
        let mut index = 0;
        segments.retain(|part| {
            let keep = index == 0 || index + 1 == len || !part.is_empty();
            index += 1;
            keep
        });
    }
    let trailing_dot = segments
        .last()
        .is_some_and(|part| *part == [46] || *part == [46, 46]);
    let mut resolved: Vec<&[u32]> = Vec::new();
    for segment in segments {
        if segment == [46, 46] {
            resolved.pop();
        } else if segment != [46] {
            resolved.push(segment);
        }
    }
    if trailing_dot {
        resolved.push(&[]);
    }
    let mut path = Vec::new();
    for (index, segment) in resolved.iter().enumerate() {
        if index > 0 {
            path.push(47);
        }
        path.extend_from_slice(segment);
    }
    if path.is_empty() {
        path.push(47);
    }
    target.path = path;
    Some(unparse(target))
}

/// Locate a nested schema resource by its resolved identifier without fetching
/// anything. JSON Schema resources are immutable views into the admitted tree.

fn clone_owner_cursor(cursor:Option<&OwnerCursor>,ctx:&mut Context<'_>)->Result<Option<OwnerCursor>,EngineError>{
    match cursor {Some(cursor)=>{ctx.charge_work(1,Utf16::default())?;Ok(Some(cursor.clone()))},None=>Ok(None)}
}
struct LocatedNode<'a> { value:&'a Value, cursor:Option<OwnerCursor> }
enum LocatedChildren<'a> { Plain(std::vec::IntoIter<&'a Value>), Located(std::vec::IntoIter<LocatedNode<'a>>) }
impl<'a> Iterator for LocatedChildren<'a> {
    type Item=LocatedNode<'a>;
    fn next(&mut self)->Option<Self::Item>{match self{Self::Plain(v)=>v.next().map(|value|LocatedNode{value,cursor:None}),Self::Located(v)=>v.next()}}
}
fn child_cursor(owner:Option<&CompiledSchema>,cursor:Option<&OwnerCursor>,edge:usize,ctx:&mut Context<'_>)->Result<Option<OwnerCursor>,EngineError>{
    match(owner,cursor){(Some(owner),Some(cursor))=>match &owner.owner_locations{Some(table)=>table.child(owner,cursor,edge,ctx),None=>Ok(None)},_=>Ok(None)}
}
fn schema_children_located<'a>(schema:&'a Value,dialect:SchemaDialect,ctx:&mut Context<'_>,path:&Utf16,owner:Option<&CompiledSchema>,cursor:Option<&OwnerCursor>)->Result<LocatedChildren<'a>,EngineError>{
    if owner.is_none() || cursor.is_none(){return Ok(LocatedChildren::Plain(schema_child_values(schema,dialect,ctx,path)?.into_iter()));}
    let children=schema_child_values_mapped(schema,dialect,ctx,path,|value,member,sub,ctx|{
        let mut selected=child_cursor(owner,cursor,member,ctx)?;
        if let Some(sub)=sub {selected=child_cursor(owner,selected.as_ref(),sub,ctx)?;}
        Ok(LocatedNode{value,cursor:selected})
    })?;
    Ok(LocatedChildren::Located(children.into_iter()))
}
fn find_embedded_resource<'a>(root:&'a Value,target: &str,dialect:SchemaDialect,ctx:&mut Context<'_>,path:&Utf16)->Result<Option<&'a Value>,EngineError>{
    Ok(find_embedded_resource_located(root,target,dialect,ctx,path,None,None)?.map(|node|node.value))
}
fn find_embedded_resource_located<'a>(
    root: &'a Value,
    target: &str,
    dialect: SchemaDialect,
    ctx: &mut Context<'_>,
    path: &Utf16,
    owner: Option<&CompiledSchema>, cursor: Option<OwnerCursor>,
) -> Result<Option<LocatedNode<'a>>, EngineError> {
    fn visit<'a>(
        node: &'a Value,
        parent: &str,
        target: &str,
        dialect: SchemaDialect,
        ctx: &mut Context<'_>,
        path: &Utf16,
        owner: Option<&CompiledSchema>, cursor: Option<OwnerCursor>,
    ) -> Result<Option<LocatedNode<'a>>, EngineError> {
        ctx.charge_work(1, path.clone())?;
        match node {
            Value::Object(_) => {
                let own_id = schema_id_metered(node, ctx, path)?;
                let effective = own_id
                    .as_deref()
                    .map(|id| {
                        // URI parsing is bounded by metering both the inherited
                        // base and the authored identifier before resolution.
                        ctx.charge_work(parent.len().saturating_add(id.len()), path.clone())?;
                        let resolved = if dialect != SchemaDialect::Draft2020_12
                            && url::Url::parse(id).is_ok()
                        {
                            id.to_owned()
                        } else {
                            resolve_schema_uri(dialect, parent, id).unwrap_or_else(|| id.to_owned())
                        };
                        Ok(resolved)
                    })
                    .transpose()?;
                let base = effective.as_deref().unwrap_or(parent);
                if effective.as_deref() == Some(target) {
                    return Ok(Some(LocatedNode{value:node,cursor}));
                }
                for child in schema_children_located(node,dialect,ctx,path,owner,cursor.as_ref())? {
                    if let Some(found) = visit(child.value,base,target,dialect,ctx,path,owner,child.cursor)? {
                        return Ok(Some(found));
                    }
                }
                Ok(None)
            }
            Value::Array(items) => {
                for (i,item) in items.iter().enumerate() {
                    let next_cursor=child_cursor(owner,cursor.as_ref(),i,ctx)?;
                    if let Some(found) = visit(item,parent,target,dialect,ctx,path,owner,next_cursor)? {
                        return Ok(Some(found));
                    }
                }
                Ok(None)
            }
            _ => Ok(None),
        }
    }
    let root_id = schema_id_metered(root, ctx, path)?.unwrap_or_default();
    visit(root,&root_id,target,dialect,ctx,path,owner,cursor)
}

/// Draft 4 and Draft 6 used fragment-only `id`/`$id` values as named
/// identifiers before the dedicated `$anchor` keyword existed.
fn find_legacy_id_fragment<'a>(root:&'a Value,fragment: &str,dialect:SchemaDialect,ctx:&mut Context<'_>,path:&Utf16)->Result<Option<&'a Value>,EngineError>{
    Ok(find_legacy_id_fragment_located(root,fragment,dialect,ctx,path,None,None)?.map(|node|node.value))
}
fn find_legacy_id_fragment_located<'a>(
    root: &'a Value,
    fragment: &str,
    dialect: SchemaDialect,
    ctx: &mut Context<'_>,
    path: &Utf16,
    owner: Option<&CompiledSchema>, cursor: Option<OwnerCursor>,
) -> Result<Option<LocatedNode<'a>>, EngineError> {
    fn visit<'a>(
        node: &'a Value,
        fragment: &str,
        dialect: SchemaDialect,
        ctx: &mut Context<'_>,
        path: &Utf16,
        owner: Option<&CompiledSchema>, cursor: Option<OwnerCursor>,
    ) -> Result<Option<LocatedNode<'a>>, EngineError> {
        ctx.charge_work(1, path.clone())?;
        match node {
            Value::Object(members) => {
                let matches = ["$id", "id"].iter().any(|key| {
                    member(members, key)
                        .and_then(as_utf8)
                        .as_deref()
                        .is_some_and(|id| id.strip_prefix('#') == Some(fragment))
                });
                if matches {
                    return Ok(Some(LocatedNode{value:node,cursor}));
                }
                for value in schema_children_located(node,dialect,ctx,path,owner,cursor.as_ref())? {
                    if let Some(found) = visit(value.value,fragment,dialect,ctx,path,owner,value.cursor)? {
                        return Ok(Some(found));
                    }
                }
                Ok(None)
            }
            Value::Array(items) => {
                for (i,item) in items.iter().enumerate() {
                    let next_cursor=child_cursor(owner,cursor.as_ref(),i,ctx)?;
                    if let Some(found) = visit(item,fragment,dialect,ctx,path,owner,next_cursor)? {
                        return Ok(Some(found));
                    }
                }
                Ok(None)
            }
            _ => Ok(None),
        }
    }
    visit(root,fragment,dialect,ctx,path,owner,cursor)
}

fn schema_child_values<'a>(schema:&'a Value,dialect:SchemaDialect,ctx:&mut Context<'_>,path:&Utf16)->Result<Vec<&'a Value>,EngineError> {
    schema_child_values_mapped(schema,dialect,ctx,path,|value,_,_,_|Ok(value))
}
fn schema_child_values_mapped<'a,T>(schema:&'a Value,dialect:SchemaDialect,ctx:&mut Context<'_>,path:&Utf16,
    mut select:impl FnMut(&'a Value,usize,Option<usize>,&mut Context<'_>)->Result<T,EngineError>)->Result<Vec<T>,EngineError> {
    let Value::Object(members) = schema else {
        return Ok(Vec::new());
    };
    let mut capacity = 0usize;
    for (key, value) in members {
        let Ok(keyword) = key.to_utf8() else { continue };
        if !matches!(keyword.as_str(), "definitions" | "$defs")
            && !active_keywords(dialect).contains(&keyword.as_str())
        {
            continue;
        }
        let count = match (keyword.as_str(), value) {
            ("items", Value::Array(items))
            | ("prefixItems", Value::Array(items))
            | ("allOf" | "anyOf" | "oneOf" | "extends", Value::Array(items)) => items.len(),
            (
                "properties" | "patternProperties" | "definitions" | "$defs" | "dependentSchemas",
                Value::Object(map),
            ) => map.len(),
            ("dependencies", Value::Object(map)) if dialect != SchemaDialect::Draft3 => map
                .iter()
                .filter(|(_, child)| !matches!(child, Value::Array(_)))
                .count(),
            ("type" | "disallow", Value::Object(_)) if dialect == SchemaDialect::Draft3 => 1,
            ("type" | "disallow", Value::Array(items)) if dialect == SchemaDialect::Draft3 => items
                .iter()
                .filter(|item| matches!(item, Value::Object(_)))
                .count(),
            (
                "additionalItems"
                | "additionalProperties"
                | "contains"
                | "not"
                | "if"
                | "then"
                | "else"
                | "propertyNames"
                | "unevaluatedItems"
                | "unevaluatedProperties",
                _,
            ) => 1,
            ("items", _) | ("extends", _) => 1,
            _ => 0,
        };
        capacity = capacity.saturating_add(count);
    }
    ctx.charge_work(members.len().saturating_add(capacity), path.clone())?;
    let words=std::mem::size_of::<T>().div_ceil(std::mem::size_of::<usize>());
    if words>1 {ctx.charge_work(capacity.saturating_mul(words-1),Utf16::default())?;}
    let mut children = Vec::with_capacity(capacity);
    for (member_index,(key, value)) in members.iter().enumerate() {
        let Ok(keyword) = key.to_utf8() else { continue };
        // `definitions`/`$defs` are annotation-only containers for validation,
        // but their values are still schema resources and can be referenced.
        if !matches!(keyword.as_str(), "definitions" | "$defs")
            && !active_keywords(dialect).contains(&keyword.as_str())
        {
            continue;
        }
        match keyword.as_str() {
            "additionalItems"
            | "additionalProperties"
            | "contains"
            | "not"
            | "if"
            | "then"
            | "else"
            | "propertyNames"
            | "unevaluatedItems"
            | "unevaluatedProperties" => children.push(select(value,member_index,None,ctx)?),
            "items" => match value {
                Value::Array(items) => for (i,item) in items.iter().enumerate(){children.push(select(item,member_index,Some(i),ctx)?)},
                _ => children.push(select(value,member_index,None,ctx)?),
            },
            "prefixItems" => {
                if let Value::Array(items) = value {
                    for (i,item) in items.iter().enumerate(){children.push(select(item,member_index,Some(i),ctx)?)};
                }
            }
            "allOf" | "anyOf" | "oneOf" | "extends" => {
                if let Value::Array(items) = value {
                    for (i,item) in items.iter().enumerate(){children.push(select(item,member_index,Some(i),ctx)?)};
                } else if keyword == "extends" {
                    children.push(select(value,member_index,None,ctx)?);
                }
            }
            "properties" | "patternProperties" | "definitions" | "$defs" | "dependentSchemas" => {
                if let Value::Object(map) = value {
                    for(i,(_,child))in map.iter().enumerate(){children.push(select(child,member_index,Some(i),ctx)?);}
                }
            }
            "dependencies" if dialect != SchemaDialect::Draft3 => {
                if let Value::Object(map) = value {
                    for(i,(_,child))in map.iter().enumerate(){if !matches!(child,Value::Array(_)){children.push(select(child,member_index,Some(i),ctx)?);}}
                }
            }
            "type" | "disallow" if dialect == SchemaDialect::Draft3 => match value {
                Value::Object(_) => children.push(select(value,member_index,None,ctx)?),
                Value::Array(items) => {
                    for(i,item)in items.iter().enumerate(){if matches!(item,Value::Object(_)){children.push(select(item,member_index,Some(i),ctx)?);}}
                }
                _ => (),
            },
            _ => (),
        }
    }
    Ok(children)
}

fn get<'a>(v: &'a Value, key: &str) -> Option<&'a Value> {
    if let Value::Object(m) = v {
        m.iter()
            .find(|(k, _)| k.to_utf8().ok().as_deref() == Some(key))
            .map(|(_, v)| v)
    } else {
        None
    }
}
fn get_metered<'a>(
    value: &'a Value,
    key: &str,
    ctx: &mut Context<'_>,
    path: &Utf16,
) -> Result<Option<&'a Value>, EngineError> {
    let Value::Object(members) = value else {
        return Ok(None);
    };
    // Each lookup iteration clones the diagnostic path for Context. Admit
    // those copies up front, before allocating them in the loop.
    ctx.charge_work_u64(
        (members.len() as u64).saturating_mul(path.len() as u64),
        Utf16::default(),
    )?;
    for (name, member_value) in members {
        ctx.charge_work(name.len().saturating_add(key.len()), path.clone())?;
        if name.to_utf8().ok().as_deref() == Some(key) {
            return Ok(Some(member_value));
        }
    }
    Ok(None)
}
fn member<'a>(m: &'a [(Utf16, Value)], key: &str) -> Option<&'a Value> {
    m.iter()
        .find(|(k, _)| k.to_utf8().ok().as_deref() == Some(key))
        .map(|(_, v)| v)
}
fn find_anchor<'a>(root:&'a Value,name: &str,dialect:SchemaDialect,ctx:&mut Context<'_>,path:&Utf16)->Result<Option<&'a Value>,EngineError>{
    Ok(find_anchor_located(root,name,dialect,ctx,path,None,None)?.map(|node|node.value))
}
fn find_anchor_located<'a>(
    root: &'a Value,
    name: &str,
    dialect: SchemaDialect,
    ctx: &mut Context<'_>,
    path: &Utf16,
    owner: Option<&CompiledSchema>, cursor: Option<OwnerCursor>,
) -> Result<Option<LocatedNode<'a>>, EngineError> {
    fn visit<'a>(
        node: &'a Value,
        name: &str,
        dialect: SchemaDialect,
        is_root: bool,
        ctx: &mut Context<'_>,
        path: &Utf16,
        owner: Option<&CompiledSchema>, cursor: Option<OwnerCursor>,
    ) -> Result<Option<LocatedNode<'a>>, EngineError> {
        ctx.charge_work(1, path.clone())?;
        match node {
            Value::Object(members) => {
                // Anchors are scoped to a schema resource. A nested resource
                // may reuse the same anchor name, but it is not a candidate
                // for a reference whose base URI selected the enclosing root.
                if !is_root {
                    let resource_id = match dialect {
                        SchemaDialect::Draft3 | SchemaDialect::Draft4 => get(node, "id"),
                        _ => get(node, "$id"),
                    };
                    if resource_id
                        .and_then(as_utf8)
                        .is_some_and(|id| !id.is_empty() && !id.starts_with('#'))
                    {
                        return Ok(None);
                    }
                }
                let matches = ["$anchor", "$dynamicAnchor"]
                    .iter()
                    .any(|key| member(members, key).and_then(as_utf8).as_deref() == Some(name));
                if matches {
                    return Ok(Some(LocatedNode{value:node,cursor}));
                }
                for value in schema_children_located(node,dialect,ctx,path,owner,cursor.as_ref())? {
                    if let Some(found) = visit(value.value,name,dialect,false,ctx,path,owner,value.cursor)? {
                        return Ok(Some(found));
                    }
                }
                Ok(None)
            }
            Value::Array(items) => {
                for (i,item) in items.iter().enumerate() {
                    let next_cursor=child_cursor(owner,cursor.as_ref(),i,ctx)?;
                    if let Some(found) = visit(item,name,dialect,false,ctx,path,owner,next_cursor)? {
                        return Ok(Some(found));
                    }
                }
                Ok(None)
            }
            _ => Ok(None),
        }
    }
    visit(root,name,dialect,true,ctx,path,owner,cursor)
}
fn as_utf8(v: &Value) -> Option<String> {
    if let Value::String(x) = v {
        x.to_utf8().ok()
    } else {
        None
    }
}
fn compile_regex(pattern: &Utf16) -> Result<regress::Regex, regress::Error> {
    let units = pattern.units();
    let mut codepoints = Vec::with_capacity(units.len());
    let mut index = 0;
    while index < units.len() {
        let first = units[index];
        if (0xd800..=0xdbff).contains(&first)
            && index + 1 < units.len()
            && (0xdc00..=0xdfff).contains(&units[index + 1])
        {
            let second = units[index + 1];
            codepoints.push(0x10000 + (((first as u32 - 0xd800) << 10) | (second as u32 - 0xdc00)));
            index += 2;
        } else {
            // Keep isolated surrogate code units as their JS code-point values;
            // regress' UTF-16 matcher handles the resulting code points.
            codepoints.push(first as u32);
            index += 1;
        }
    }
    regress::Regex::from_unicode(codepoints.into_iter(), "u")
}
fn as_usize(v: &Value) -> Option<usize> {
    if let Value::Number(n) = v {
        if n.fract() == 0.0 && *n >= 0.0 {
            Some(*n as usize)
        } else {
            None
        }
    } else {
        None
    }
}
fn validate_string_array(v: &Value, path: &Utf16, unique: bool) -> Result<(), EngineError> {
    let Value::Array(a) = v else {
        return Err(schema_error(path, "Expected an array of strings"));
    };
    let mut seen = BTreeSet::new();
    for x in a {
        let Value::String(s) = x else {
            return Err(schema_error(path, "Expected an array of strings"));
        };
        if unique && !seen.insert(s.units().to_vec()) {
            return Err(schema_error(path, "Array values must be unique"));
        }
    }
    Ok(())
}
fn validate_type_declaration(
    v: &Value,
    path: &Utf16,
    dialect: SchemaDialect,
) -> Result<(), EngineError> {
    let branches: Vec<&Value> = match v {
        Value::String(_) => vec![v],
        Value::Object(_) if dialect == SchemaDialect::Draft3 => vec![v],
        Value::Array(items) => items.iter().collect(),
        _ => return Err(schema_error(path, "type must be a string or array")),
    };
    let mut seen = BTreeSet::new();
    for branch in branches {
        if matches!(branch, Value::Object(_)) && dialect == SchemaDialect::Draft3 {
            continue;
        }
        let Value::String(name) = branch else {
            return Err(schema_error(path, "type array values must be strings"));
        };
        let name = name
            .to_utf8()
            .map_err(|_| schema_error(path, "Invalid type name"))?;
        if ![
            "null", "boolean", "object", "array", "number", "integer", "string",
        ]
        .contains(&name.as_str())
            || !seen.insert(name)
        {
            return Err(schema_error(path, "Invalid or duplicate type name"));
        }
    }
    Ok(())
}
fn type_matches<T: InstanceView>(rule: &Value, v: &T, dialect: SchemaDialect) -> bool {
    match rule {
        Value::Array(a) => a.iter().any(|t| type_matches(t, v, dialect)),
        Value::String(s) => match s.to_utf8().ok().as_deref() {
            Some("null") => v.kind() == InstanceKind::Null,
            Some("boolean") => v.kind() == InstanceKind::Bool,
            Some("object") => v.kind() == InstanceKind::Object,
            Some("array") => v.kind() == InstanceKind::Array,
            Some("number") => v.kind() == InstanceKind::Number,
            Some("integer") => v.number_value().is_some_and(|number| {
                if matches!(dialect, SchemaDialect::Draft3 | SchemaDialect::Draft4)
                    && matches!(number, InstanceNumber::PythonFloat(_))
                {
                    false
                } else {
                    number.is_integer()
                }
            }),
            Some("string") => v.kind() == InstanceKind::String,
            _ => true,
        },
        _ => true,
    }
}
fn type_label(rule: &Value) -> String {
    match rule {
        Value::String(x) => x.to_utf8().unwrap_or_default(),
        Value::Array(a) => a.iter().filter_map(as_utf8).collect::<Vec<_>>().join(","),
        _ => "valid".into(),
    }
}
fn canonical_equal<T: InstanceView>(
    a: &Value,
    b: &T,
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    value_equals_instance(a, b, ctx)
}
fn is_multiple_of_source(
    value: InstanceNumber<'_>,
    divisor: f64,
    source_divisor: Option<&crate::python_value::PythonConsumerValue>,
    ctx: &mut Context<'_>,
    path: &Utf16,
) -> Result<bool, EngineError> {
    use crate::python_value::PythonConsumerValue as Py;
    use num_traits::Zero;

    fn work_for_bigint(value: &num_bigint::BigInt) -> u64 {
        value.bits().div_ceil(8).saturating_add(1)
    }
    fn charge_path_and_work(
        ctx: &mut Context<'_>,
        amount: u64,
        path: &Utf16,
    ) -> Result<(), EngineError> {
        // Charge before cloning the source-derived path used to annotate any
        // subsequent budget failure.
        ctx.charge_work(path.len(), Utf16::default())?;
        ctx.charge_work_u64(amount, path.clone())
    }
    fn arithmetic_error(
        path: &Utf16,
        reason: &'static str,
        ctx: &mut Context<'_>,
    ) -> Result<EngineError, EngineError> {
        ctx.charge_work(path.len(), Utf16::default())?;
        Ok(
            EngineError::new("PYTHON_SCHEMA_ARITHMETIC", path.clone(), reason)
                .with_python_schema_terminal(crate::error::PythonSchemaTerminal::Arithmetic),
        )
    }
    fn division_work(left: u64, right: u64) -> u64 {
        left.saturating_mul(right.max(1))
            .saturating_add(left)
            .saturating_add(right)
    }
    fn float_ratio_work() -> u64 {
        // A finite f64 ratio is bounded by a 53-bit numerator and a 1074-bit
        // power-of-two denominator. Charge for both bounded BigInt shifts and
        // their backing storage before constructing either integer.
        2 * (1074u64.div_ceil(8) + 2)
    }
    fn float_ratio(value: f64) -> (num_bigint::BigInt, num_bigint::BigInt) {
        use num_bigint::BigInt;
        let bits = value.to_bits();
        let negative = bits >> 63 != 0;
        let exponent_bits = ((bits >> 52) & 0x7ff) as i32;
        let fraction = bits & ((1u64 << 52) - 1);
        let (mantissa, exponent) = if exponent_bits == 0 {
            (fraction, -1074)
        } else {
            (fraction | (1u64 << 52), exponent_bits - 1023 - 52)
        };
        let mut numerator = BigInt::from(mantissa);
        if negative {
            numerator = -numerator;
        }
        if exponent >= 0 {
            (numerator << exponent as usize, BigInt::from(1u8))
        } else {
            (numerator, BigInt::from(1u8) << (-exponent) as usize)
        }
    }

    // Consumer schemas retain the Python numeric kind of each divisor. Its
    // validator deliberately uses two different algorithms for int and float.
    match source_divisor {
        Some(Py::Integer(integer_divisor)) => {
            if integer_divisor.is_zero() {
                return Ok(false);
            }
            if let InstanceNumber::PythonInteger(integer_value) = value {
                let left = work_for_bigint(integer_value);
                let right = work_for_bigint(integer_divisor);
                charge_path_and_work(ctx, division_work(left, right), path)?;
                return Ok((integer_value % integer_divisor).is_zero());
            }
            charge_path_and_work(ctx, work_for_bigint(integer_divisor), path)?;
            let Some(float_divisor) = integer_divisor.to_f64().filter(|number| number.is_finite())
            else {
                return Err(arithmetic_error(path, "integer-to-float-overflow", ctx)?);
            };
            let float_value = match value {
                InstanceNumber::Core(number) => number,
                InstanceNumber::PythonFloat(bits) => f64::from_bits(bits),
                InstanceNumber::PythonInteger(_) => unreachable!(),
            };
            charge_path_and_work(ctx, 1, path)?;
            // Python's float % int path is fmod-like; only zero-ness is used
            // by jsonschema, and NaN is truthy (therefore invalid).
            Ok(float_value % float_divisor == 0.0)
        }
        Some(Py::Float(divisor_bits)) => {
            let float_divisor = f64::from_bits(*divisor_bits);
            if float_divisor == 0.0 {
                return Ok(false);
            }
            let (float_value, integer_instance) = match value {
                InstanceNumber::Core(number) => (number, None),
                InstanceNumber::PythonFloat(bits) => (f64::from_bits(bits), None),
                InstanceNumber::PythonInteger(integer) => {
                    charge_path_and_work(ctx, work_for_bigint(integer), path)?;
                    let Some(number) = integer.to_f64().filter(|number| number.is_finite()) else {
                        return Err(arithmetic_error(path, "integer-to-float-overflow", ctx)?);
                    };
                    (number, Some(integer))
                }
            };
            charge_path_and_work(ctx, 1, path)?;
            let quotient = float_value / float_divisor;
            if quotient.is_nan() {
                return Err(arithmetic_error(path, "nan-to-integer", ctx)?);
            }
            if quotient.is_finite() {
                return Ok(quotient.fract() == 0.0);
            }

            // jsonschema catches int(quotient)'s overflow and checks the exact
            // Fraction quotient. Non-finite instances fail during Fraction().
            if float_value.is_infinite() {
                return Err(arithmetic_error(path, "infinity-to-integer-ratio", ctx)?);
            }
            // Reserve the fixed f64-ratio work before shifts/BigInt allocation,
            // then reserve operand copies, products, and remainder division.
            charge_path_and_work(ctx, float_ratio_work(), path)?;
            let (instance_numerator, instance_denominator) = if let Some(integer) = integer_instance
            {
                let integer_bytes = work_for_bigint(integer);
                charge_path_and_work(ctx, integer_bytes, path)?;
                (integer.clone(), num_bigint::BigInt::from(1u8))
            } else {
                float_ratio(float_value)
            };
            let (divisor_numerator, divisor_denominator) = float_ratio(float_divisor);
            let instance_num_bytes = work_for_bigint(&instance_numerator);
            let instance_den_bytes = work_for_bigint(&instance_denominator);
            let divisor_num_bytes = work_for_bigint(&divisor_numerator);
            let divisor_den_bytes = work_for_bigint(&divisor_denominator);
            let numerator_bytes = instance_num_bytes.saturating_add(divisor_den_bytes);
            let denominator_bytes = instance_den_bytes.saturating_add(divisor_num_bytes);
            let cost = instance_num_bytes
                .saturating_add(instance_den_bytes)
                .saturating_add(divisor_num_bytes)
                .saturating_add(divisor_den_bytes)
                .saturating_add(instance_num_bytes.saturating_mul(divisor_den_bytes))
                .saturating_add(instance_den_bytes.saturating_mul(divisor_num_bytes))
                .saturating_add(division_work(numerator_bytes, denominator_bytes));
            charge_path_and_work(ctx, cost, path)?;
            let numerator = instance_numerator * divisor_denominator;
            let denominator = instance_denominator * divisor_numerator;
            if denominator.is_zero() {
                return Ok(false);
            }
            Ok((numerator % denominator).is_zero())
        }
        _ => {
            use num_traits::ToPrimitive;
            if divisor == 0.0 || !divisor.is_finite() {
                return Ok(false);
            }
            let number = match value {
                InstanceNumber::Core(value) => value,
                InstanceNumber::PythonInteger(value) => match value.to_f64() {
                    Some(value) => value,
                    None => return Ok(false),
                },
                InstanceNumber::PythonFloat(bits) => f64::from_bits(bits),
            };
            let quotient = number / divisor;
            Ok(quotient.is_finite() && quotient.fract() == 0.0)
        }
    }
}

fn bind_python_source_tree(
    source: &crate::python_value::PythonConsumerValue,
    target: &Value,
    strings: &mut std::collections::BTreeMap<usize, crate::python_value::PyText>,
    keys: &mut std::collections::BTreeMap<usize, crate::python_value::PyText>,
    exact: &mut std::collections::BTreeMap<
        usize,
        std::sync::Arc<crate::python_value::PythonConsumerValue>,
    >,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    use crate::python_value::PythonConsumerValue as Py;
    fn visit(
        source: &Py,
        target: &Value,
        literal: bool,
        strings: &mut std::collections::BTreeMap<usize, crate::python_value::PyText>,
        keys: &mut std::collections::BTreeMap<usize, crate::python_value::PyText>,
        exact: &mut std::collections::BTreeMap<usize, std::sync::Arc<Py>>,
        ctx: &mut Context<'_>,
    ) -> Result<(), EngineError> {
        ctx.charge_work(1, Utf16::default())?;
        if literal || matches!(source, Py::Integer(_) | Py::Float(_)) {
            let copied = source.snapshot_with_context(ctx)?;
            exact.insert(target as *const Value as usize, std::sync::Arc::new(copied));
        }
        match (source, target) {
            (Py::String(text), Value::String(units)) => {
                ctx.charge_work(text.len(), Utf16::default())?;
                strings.insert(units as *const Utf16 as usize, text.clone());
            }
            (Py::Array(source_items), Value::Array(target_items))
                if source_items.len() == target_items.len() =>
            {
                for (source_item, target_item) in source_items.iter().zip(target_items) {
                    visit(source_item, target_item, literal, strings, keys, exact, ctx)?;
                }
            }
            (Py::Object(source_items), Value::Object(target_items))
                if source_items.len() == target_items.len() =>
            {
                for ((source_key, source_item), (target_key, target_item)) in
                    source_items.iter().zip(target_items)
                {
                    ctx.charge_work(source_key.len(), Utf16::default())?;
                    keys.insert(target_key as *const Utf16 as usize, source_key.clone());
                    let key = source_key.codepoints();
                    let child_literal = literal
                        || (key
                            == [
                                b'c' as u32,
                                b'o' as u32,
                                b'n' as u32,
                                b's' as u32,
                                b't' as u32,
                            ])
                        || (key == [b'e' as u32, b'n' as u32, b'u' as u32, b'm' as u32]);
                    visit(
                        source_item,
                        target_item,
                        child_literal,
                        strings,
                        keys,
                        exact,
                        ctx,
                    )?;
                }
            }
            (Py::Null, Value::Null)
            | (Py::Bool(_), Value::Bool(_))
            | (Py::Integer(_), Value::Number(_))
            | (Py::Float(_), Value::Number(_)) => {}
            _ => {
                return Err(EngineError::new(
                    "SCHEMA_INVALID",
                    Utf16::default(),
                    "Python schema source projection changed its tree shape",
                ));
            }
        }
        Ok(())
    }
    visit(source, target, false, strings, keys, exact, ctx)
}

fn percent_decode_python_points(points: &[u32]) -> Vec<u32> {
    fn hex(point: u32) -> Option<u8> {
        match point {
            0x30..=0x39 => Some((point - 0x30) as u8),
            0x41..=0x46 => Some((point - 0x41 + 10) as u8),
            0x61..=0x66 => Some((point - 0x61 + 10) as u8),
            _ => None,
        }
    }
    let mut output = Vec::with_capacity(points.len());
    let mut at = 0;
    while at < points.len() {
        if points[at] == b'%' as u32 && at + 2 < points.len() {
            if hex(points[at + 1]).is_some() && hex(points[at + 2]).is_some() {
                let mut bytes = Vec::new();
                while at + 2 < points.len()
                    && points[at] == b'%' as u32
                    && hex(points[at + 1]).is_some()
                    && hex(points[at + 2]).is_some()
                {
                    bytes.push(hex(points[at + 1]).unwrap() * 16 + hex(points[at + 2]).unwrap());
                    at += 3;
                }
                if let Ok(text) = std::str::from_utf8(&bytes) {
                    output.extend(text.chars().map(u32::from));
                } else {
                    output.extend(bytes.into_iter().map(u32::from));
                }
                continue;
            }
        }
        output.push(points[at]);
        at += 1;
    }
    output
}

fn python_decimal_digit(point: u32) -> Option<u8> {
    const ZEROES: &[u32] = &[
        0x0030, 0x0660, 0x06f0, 0x07c0, 0x0966, 0x09e6, 0x0a66, 0x0ae6, 0x0b66, 0x0be6, 0x0c66,
        0x0ce6, 0x0d66, 0x0de6, 0x0e50, 0x0ed0, 0x0f20, 0x1040, 0x1090, 0x17e0, 0x1810, 0x1946,
        0x19d0, 0x1a80, 0x1a90, 0x1b50, 0x1bb0, 0x1c40, 0x1c50, 0xa620, 0xa8d0, 0xa900, 0xa9d0,
        0xa9f0, 0xaa50, 0xabf0, 0xff10, 0x104a0, 0x10d30, 0x11066, 0x110f0, 0x11136, 0x111d0,
        0x112f0, 0x11450, 0x114d0, 0x11650, 0x116c0, 0x11730, 0x118e0, 0x11950, 0x11c50, 0x11d50,
        0x11da0, 0x16a60, 0x16ac0, 0x16b50, 0x1d7ce, 0x1d7d8, 0x1d7e2, 0x1d7ec, 0x1d7f6, 0x1e140,
        0x1e2f0, 0x1e4f0, 0x1e950, 0x1fbf0,
    ];
    ZEROES.iter().find_map(|zero| {
        (point >= *zero && point < zero.saturating_add(10)).then(|| (point - zero) as u8)
    })
}

fn python_int_whitespace(point: u32) -> bool {
    char::from_u32(point).is_some_and(char::is_whitespace)
}

/// Python's `int(token)` shape used by `referencing` when indexing a Sequence.
/// Magnitude saturates at `length + 1`, so arbitrarily long tokens never need
/// a BigInt allocation just to determine whether the index is in bounds.
fn parse_python_sequence_index(
    token: &[u32],
    length: usize,
    ctx: &mut Context<'_>,
) -> Result<Result<Option<usize>, ()>, EngineError> {
    ctx.charge_work(token.len(), Utf16::default())?;
    let mut start = 0;
    let mut end = token.len();
    while start < end && python_int_whitespace(token[start]) {
        start += 1;
    }
    while start < end && python_int_whitespace(token[end - 1]) {
        end -= 1;
    }
    let mut at = start;
    let negative = match token.get(at) {
        Some(0x2d) => {
            at += 1;
            true
        }
        Some(0x2b) => {
            at += 1;
            false
        }
        _ => false,
    };
    let limit = length.saturating_add(1) as u128;
    let mut magnitude = 0u128;
    let mut digit_count = 0usize;
    let mut previous_digit = false;
    while at < end {
        if let Some(digit) = python_decimal_digit(token[at]) {
            magnitude = magnitude
                .saturating_mul(10)
                .saturating_add(digit as u128)
                .min(limit);
            digit_count += 1;
            previous_digit = true;
            at += 1;
        } else if token[at] == b'_' as u32
            && previous_digit
            && at + 1 < end
            && python_decimal_digit(token[at + 1]).is_some()
        {
            previous_digit = false;
            at += 1;
        } else {
            return Ok(Err(()));
        }
    }
    if digit_count == 0 {
        return Ok(Err(()));
    }
    // CPython's configured conversion guard is part of this consumer profile.
    if digit_count > 4300 {
        return Ok(Err(()));
    }
    let magnitude = magnitude as usize;
    if negative {
        if magnitude == 0 {
            return Ok(Ok(Some(0)));
        }
        if magnitude > length {
            return Ok(Ok(None));
        }
        Ok(Ok(Some(length - magnitude)))
    } else if magnitude >= length {
        Ok(Ok(None))
    } else {
        Ok(Ok(Some(magnitude)))
    }
}

fn bind_python_reference_targets(
    source: &crate::python_value::PythonConsumerValue,
    target: &Value,
    resource: Option<usize>,
    supplied_resource_uri: Option<&crate::python_value::PyText>,
    dialect: SchemaDialect,
    references: &mut std::collections::BTreeMap<usize, PythonReferenceTarget>,
    resource_roots: &mut std::collections::BTreeMap<usize, PythonResourceLocator>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    use crate::python_value::PyText;
    use crate::python_value::PythonConsumerValue as Py;

    fn key_is(key: &PyText, expected: &str) -> bool {
        key.codepoints()
            .iter()
            .copied()
            .eq(expected.as_bytes().iter().map(|byte| *byte as u32))
    }

    fn source_id(
        source: &Py,
        dialect: SchemaDialect,
        ctx: &mut Context<'_>,
    ) -> Result<Option<PythonResourceUri>, EngineError> {
        let Py::Object(members) = source else {
            return Ok(None);
        };
        let legacy = matches!(
            dialect,
            SchemaDialect::Draft3
                | SchemaDialect::Draft4
                | SchemaDialect::Draft6
                | SchemaDialect::Draft7
        );
        let mut selected = None;
        let field = if matches!(dialect, SchemaDialect::Draft3 | SchemaDialect::Draft4) {
            "id"
        } else {
            "$id"
        };
        for (key, value) in members {
            ctx.charge_work(key.len().saturating_add(1), Utf16::default())?;
            if legacy && key_is(key, "$ref") {
                return Ok(None);
            }
            if key_is(key, field) {
                if let Py::String(text) = value {
                    selected = Some(text);
                }
            }
        }
        let Some(text) = selected else {
            return Ok(None);
        };
        ctx.charge_work(text.len(), Utf16::default())?;
        let points = text.codepoints();
        if legacy && points.first() == Some(&(b'#' as u32)) {
            return Ok(None);
        }
        // referencing.Resource.id strips the accepted trailing empty fragment.
        let end = points
            .iter()
            .rposition(|point| *point != b'#' as u32)
            .map_or(0, |index| index + 1);
        Ok(Some(PythonResourceUri::from_points(&points[..end], ctx)?))
    }

    fn source_recursive_anchor(source: &Py, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
        let Py::Object(members) = source else {
            return Ok(false);
        };
        for (key, value) in members {
            ctx.charge_work(key.codepoints().len().saturating_add(1), Utf16::default())?;
            if key_is(key, "$recursiveAnchor") {
                return Ok(matches!(value, Py::Bool(true)));
            }
        }
        Ok(false)
    }

    fn is_resource_boundary(
        source: &Py,
        dialect: SchemaDialect,
        is_supplied_root: bool,
        ctx: &mut Context<'_>,
    ) -> Result<bool, EngineError> {
        if is_supplied_root {
            return Ok(true);
        }
        Ok(source_id(source, dialect, ctx)?.is_some())
    }

    fn at_indices<'a>(mut value: &'a Py, indices: &[usize]) -> Option<&'a Py> {
        for index in indices {
            value = match value {
                Py::Object(members) => &members.get(*index)?.1,
                Py::Array(items) => items.get(*index)?,
                _ => return None,
            };
        }
        Some(value)
    }

    fn source_anchor(
        node: &Py,
        name: &[u32],
        dialect: SchemaDialect,
        root: bool,
        indices: &mut Vec<usize>,
        ctx: &mut Context<'_>,
    ) -> Result<Option<Vec<usize>>, EngineError> {
        ctx.charge_work(1, Utf16::default())?;
        // An anchor belongs to its own recognized resource. Opaque objects
        // are never visited by schema_child_paths and cannot introduce one.
        if !root && source_id(node, dialect, ctx)?.is_some() {
            return Ok(None);
        }
        if let Py::Object(members) = node {
            let legacy = matches!(
                dialect,
                SchemaDialect::Draft3
                    | SchemaDialect::Draft4
                    | SchemaDialect::Draft6
                    | SchemaDialect::Draft7
            );
            let mut ref_sibling = false;
            let mut matched = false;
            for (key, value) in members {
                ctx.charge_work_u64(
                    (key.len().min(14) as u64 + 1).saturating_mul(4),
                    Utf16::default(),
                )?;
                if key_is(key, "$ref") {
                    ref_sibling = true;
                }
                let field = if matches!(dialect, SchemaDialect::Draft3 | SchemaDialect::Draft4) {
                    "id"
                } else {
                    "$id"
                };
                let anchor_field = if legacy {
                    key_is(key, field)
                } else {
                    key_is(key, "$anchor")
                        || (dialect == SchemaDialect::Draft2020_12 && key_is(key, "$dynamicAnchor"))
                };
                if anchor_field {
                    if let Py::String(text) = value {
                        let points = text.codepoints();
                        let candidate = if legacy {
                            if points.first() != Some(&(b'#' as u32)) {
                                continue;
                            }
                            &points[1..]
                        } else {
                            points
                        };
                        ctx.charge_work_u64(
                            candidate.len().min(name.len()) as u64 + 1,
                            Utf16::default(),
                        )?;
                        matched |= candidate == name;
                    }
                }
            }
            if matched && !(legacy && ref_sibling) {
                ctx.charge_work(indices.len(), Utf16::default())?;
                return Ok(Some(indices.clone()));
            }
        }
        for child_path in schema_child_paths(node, dialect, ctx)? {
            ctx.charge_work_u64(
                (child_path.len() as u64).saturating_mul(2),
                Utf16::default(),
            )?;
            let child = at_indices(node, &child_path)
                .ok_or_else(|| schema_error(&Utf16::default(), "Python anchor source changed"))?;
            let old_len = indices.len();
            indices.extend_from_slice(&child_path);
            let found = source_anchor(child, name, dialect, false, indices, ctx)?;
            indices.truncate(old_len);
            if found.is_some() {
                return Ok(found);
            }
        }
        Ok(None)
    }

    fn source_pointer(
        resource_root: &Py,
        reference: &crate::python_value::PyText,
        dialect: SchemaDialect,
        recursive: bool,
        ctx: &mut Context<'_>,
    ) -> Result<Option<(Vec<usize>, Option<PythonReferenceFailure>)>, EngineError> {
        // The native recursive applicator always calls lookup("#"), even
        // when the admitted keyword text contains a different fragment.
        let raw_points = if recursive {
            &[b'#' as u32][..]
        } else {
            reference.codepoints()
        };
        ctx.charge_work_u64(
            (raw_points.len() as u64).saturating_mul(4),
            Utf16::default(),
        )?;
        let points = percent_decode_python_points(raw_points);
        if points.first() != Some(&(b'#' as u32)) {
            return Ok(None);
        }
        if points.len() == 1 {
            return Ok(Some((Vec::new(), None)));
        }
        if points.get(1) != Some(&(b'/' as u32)) {
            let mut indices = Vec::new();
            return Ok(Some(
                match source_anchor(
                    resource_root,
                    &points[1..],
                    dialect,
                    true,
                    &mut indices,
                    ctx,
                )? {
                    Some(indices) => (indices, None),
                    None => (Vec::new(), Some(PythonReferenceFailure::Unresolved)),
                },
            ));
        }
        let mut current = resource_root;
        let mut indices = Vec::new();
        let mut failure = None;
        for raw in points[2..].split(|point| *point == b'/' as u32) {
            ctx.charge_work(raw.len(), Utf16::default())?;
            let mut part = Vec::with_capacity(raw.len());
            let mut at = 0;
            while at < raw.len() {
                if raw[at] == b'~' as u32 {
                    match raw.get(at + 1) {
                        Some(value) if *value == b'0' as u32 => part.push(b'~' as u32),
                        Some(value) if *value == b'1' as u32 => part.push(b'/' as u32),
                        _ => {
                            failure = Some(PythonReferenceFailure::Unresolved);
                            break;
                        }
                    }
                    at += 2;
                } else {
                    part.push(raw[at]);
                    at += 1;
                }
            }
            match current {
                Py::Object(members) => {
                    let mut found = None;
                    for (index, (key, value)) in members.iter().enumerate() {
                        ctx.charge_work_u64(
                            key.len().min(part.len()) as u64 + 1,
                            Utf16::default(),
                        )?;
                        if key.codepoints() == part.as_slice() {
                            found = Some((index, value));
                            break;
                        }
                    }
                    let Some((index, value)) = found else {
                        failure = Some(PythonReferenceFailure::Unresolved);
                        break;
                    };
                    ctx.charge_work(1, Utf16::default())?;
                    indices.push(index);
                    current = value;
                }
                Py::Array(items) => {
                    let index = match parse_python_sequence_index(&part, items.len(), ctx)? {
                        Ok(Some(index)) => index,
                        Ok(None) => {
                            failure = Some(PythonReferenceFailure::Unresolved);
                            break;
                        }
                        Err(()) => {
                            failure = Some(PythonReferenceFailure::InvalidArrayIndex);
                            break;
                        }
                    };
                    let Some(value) = items.get(index) else {
                        failure = Some(PythonReferenceFailure::Unresolved);
                        break;
                    };
                    current = value;
                    ctx.charge_work(1, Utf16::default())?;
                    indices.push(index);
                }
                _ => {
                    failure = Some(PythonReferenceFailure::InvalidTraversal);
                    break;
                }
            }
        }
        Ok(Some((indices, failure)))
    }
    fn visit(
        source: &Py,
        target: &Value,
        resource: Option<usize>,
        dialect: SchemaDialect,
        indices: &mut Vec<usize>,
        schema_position: bool,
        resource_root: &Py,
        resource_root_indices: &[usize],
        resource_uri: Option<&PythonResourceUri>,
        resource_recursive_anchor: bool,
        references: &mut std::collections::BTreeMap<usize, PythonReferenceTarget>,
        resource_roots: &mut std::collections::BTreeMap<usize, PythonResourceLocator>,
        ctx: &mut Context<'_>,
    ) -> Result<(), EngineError> {
        ctx.charge_work(1, Utf16::default())?;
        let boundary = if schema_position {
            is_resource_boundary(source, dialect, indices.is_empty(), ctx)?
        } else {
            false
        };
        let current_resource_indices = if boundary {
            ctx.charge_work(indices.len(), Utf16::default())?;
            Some(indices.clone())
        } else {
            None
        };
        let current_resource_root = if current_resource_indices.is_some() {
            source
        } else {
            resource_root
        };
        let current_resource_indices = current_resource_indices
            .as_deref()
            .unwrap_or(resource_root_indices);
        ctx.charge_work(current_resource_indices.len(), Utf16::default())?;
        let is_new_resource = schema_position && current_resource_indices != resource_root_indices;
        let current_uri_owned = if is_new_resource {
            if let Some(id) = source_id(source, dialect, ctx)? {
                let parent_len = resource_uri.map(|uri| uri.len()).unwrap_or(0);
                ctx.charge_work_u64(
                    id.len() as u64 * 4 + parent_len as u64 * 4 + 8,
                    Utf16::default(),
                )?;
                Some(if let Some(parent) = resource_uri {
                    parent.join(&id, ctx)?.unwrap_or(id)
                } else {
                    id
                })
            } else {
                None
            }
        } else {
            None
        };
        let current_uri = current_uri_owned.as_ref().or(resource_uri);
        let current_anchor = if is_new_resource {
            source_recursive_anchor(source, ctx)?
        } else {
            resource_recursive_anchor
        };
        if boundary {
            if let Some(uri) = current_uri {
                ctx.charge_work_u64(
                    uri.len() as u64
                        + current_resource_indices.len() as u64
                        + btree_index_lookup_work(resource_roots.len())
                        + 2,
                    Utf16::default(),
                )?;
                resource_roots.insert(
                    target as *const Value as usize,
                    PythonResourceLocator {
                        uri: uri.clone(),
                        resource,
                        root_indices: current_resource_indices.to_vec(),
                        recursive_anchor: current_anchor,
                    },
                );
            }
        }
        match (source, target) {
            (Py::Object(source_items), Value::Object(target_items))
                if source_items.len() == target_items.len() =>
            {
                for (_index, ((source_key, source_item), (_, target_item))) in
                    source_items.iter().zip(target_items).enumerate()
                {
                    ctx.charge_work_u64(
                        (source_key.len().min(14) as u64 + 1).saturating_mul(3),
                        Utf16::default(),
                    )?;
                    let is_reference =
                        ["$ref", "$dynamicRef", "$recursiveRef"]
                            .iter()
                            .any(|keyword| {
                                key_is(source_key, keyword)
                                    && active_keywords(dialect).contains(keyword)
                            });
                    if is_reference {
                        if let Py::String(reference) = source_item {
                            ctx.charge_work(reference.len(), Utf16::default())?;
                            if let Some((target_indices, failure)) = source_pointer(
                                current_resource_root,
                                reference,
                                dialect,
                                key_is(source_key, "$recursiveRef")
                                    && dialect == SchemaDialect::Draft2019_09,
                                ctx,
                            )? {
                                ctx.charge_work_u64(
                                    current_resource_indices.len() as u64
                                        + current_uri.map_or(0, |uri| uri.len() as u64)
                                        + btree_index_lookup_work(references.len())
                                        + 2,
                                    Utf16::default(),
                                )?;
                                references.insert(
                                    target_item as *const Value as usize,
                                    PythonReferenceTarget {
                                        resource,
                                        resource_root_indices: current_resource_indices.to_vec(),
                                        source_resource_uri: current_uri.cloned(),
                                        source_resource_recursive_anchor: current_anchor,
                                        indices: target_indices,
                                        failure,
                                    },
                                );
                            }
                        }
                    }
                }
                let schema_paths = if schema_position {
                    schema_child_paths(source, dialect, ctx)?
                } else {
                    Vec::new()
                };
                for child_path in &schema_paths {
                    ctx.charge_work_u64(
                        (child_path.len() as u64).saturating_mul(2),
                        Utf16::default(),
                    )?;
                    let source_child = at_indices(source, &child_path).ok_or_else(|| {
                        EngineError::new(
                            "SCHEMA_INVALID",
                            Utf16::default(),
                            "Python reference source projection changed its tree shape",
                        )
                    })?;
                    let target_child = at_value_indices(target, &child_path).ok_or_else(|| {
                        EngineError::new(
                            "SCHEMA_INVALID",
                            Utf16::default(),
                            "Python reference source projection changed its tree shape",
                        )
                    })?;
                    let old_len = indices.len();
                    ctx.charge_work(child_path.len(), Utf16::default())?;
                    indices.extend_from_slice(&child_path);
                    visit(
                        source_child,
                        target_child,
                        resource,
                        dialect,
                        indices,
                        true,
                        current_resource_root,
                        current_resource_indices,
                        current_uri,
                        current_anchor,
                        references,
                        resource_roots,
                        ctx,
                    )?;
                    indices.truncate(old_len);
                }
                ctx.charge_work_u64(
                    source_items.len() as u64 + schema_paths.len() as u64 + 1,
                    Utf16::default(),
                )?;
                let mut covered_members = vec![false; source_items.len()];
                for path in &schema_paths {
                    if let Some(index) = path.first() {
                        covered_members[*index] = true;
                    }
                }
                for child_path in immediate_child_paths(source, ctx)? {
                    ctx.charge_work(1, Utf16::default())?;
                    if child_path
                        .first()
                        .is_some_and(|index| covered_members[*index])
                    {
                        continue;
                    }
                    ctx.charge_work_u64(
                        (child_path.len() as u64).saturating_mul(2),
                        Utf16::default(),
                    )?;
                    let source_child = at_indices(source, &child_path).ok_or_else(|| {
                        EngineError::new(
                            "SCHEMA_INVALID",
                            Utf16::default(),
                            "Python reference source projection changed its tree shape",
                        )
                    })?;
                    let target_child = at_value_indices(target, &child_path).ok_or_else(|| {
                        EngineError::new(
                            "SCHEMA_INVALID",
                            Utf16::default(),
                            "Python reference source projection changed its tree shape",
                        )
                    })?;
                    let old_len = indices.len();
                    ctx.charge_work(child_path.len(), Utf16::default())?;
                    indices.extend_from_slice(&child_path);
                    visit(
                        source_child,
                        target_child,
                        resource,
                        dialect,
                        indices,
                        false,
                        current_resource_root,
                        current_resource_indices,
                        current_uri,
                        current_anchor,
                        references,
                        resource_roots,
                        ctx,
                    )?;
                    indices.truncate(old_len);
                }
            }
            (Py::Array(source_items), Value::Array(target_items))
                if source_items.len() == target_items.len() =>
            {
                for (index, (source_child, target_child)) in
                    source_items.iter().zip(target_items).enumerate()
                {
                    ctx.charge_work(1, Utf16::default())?;
                    indices.push(index);
                    visit(
                        source_child,
                        target_child,
                        resource,
                        dialect,
                        indices,
                        false,
                        resource_root,
                        resource_root_indices,
                        resource_uri,
                        resource_recursive_anchor,
                        references,
                        resource_roots,
                        ctx,
                    )?;
                    indices.pop();
                }
            }
            (Py::Null, Value::Null)
            | (Py::Bool(_), Value::Bool(_))
            | (Py::Integer(_), Value::Number(_))
            | (Py::Float(_), Value::Number(_))
            | (Py::String(_), Value::String(_)) => {}
            _ => {
                return Err(EngineError::new(
                    "SCHEMA_INVALID",
                    Utf16::default(),
                    "Python reference source projection changed its tree shape",
                ));
            }
        }
        Ok(())
    }

    fn at_value_indices<'a>(mut value: &'a Value, indices: &[usize]) -> Option<&'a Value> {
        for index in indices {
            value = match value {
                Value::Object(members) => &members.get(*index)?.1,
                Value::Array(items) => items.get(*index)?,
                _ => return None,
            };
        }
        Some(value)
    }

    fn immediate_child_paths(
        schema: &Py,
        ctx: &mut Context<'_>,
    ) -> Result<Vec<Vec<usize>>, EngineError> {
        let mut result = Vec::new();
        match schema {
            Py::Object(members) => {
                for (member_index, (_, value)) in members.iter().enumerate() {
                    if matches!(value, Py::Object(_) | Py::Array(_)) {
                        ctx.charge_work(2, Utf16::default())?;
                        result.push(vec![member_index]);
                    }
                }
            }
            Py::Array(items) => {
                for index in 0..items.len() {
                    ctx.charge_work(1, Utf16::default())?;
                    result.push(vec![index]);
                }
            }
            _ => {}
        }
        Ok(result)
    }

    fn schema_child_paths(
        schema: &Py,
        dialect: SchemaDialect,
        ctx: &mut Context<'_>,
    ) -> Result<Vec<Vec<usize>>, EngineError> {
        let Py::Object(members) = schema else {
            return Ok(Vec::new());
        };
        let mut result = Vec::new();
        for (member_index, (key, value)) in members.iter().enumerate() {
            ctx.charge_work_u64(
                (key.len().min(24) as u64 + 1).saturating_mul(28),
                Utf16::default(),
            )?;
            let keyword = [
                "items",
                "additionalItems",
                "contains",
                "contentSchema",
                "prefixItems",
                "properties",
                "patternProperties",
                "additionalProperties",
                "dependencies",
                "dependentSchemas",
                "propertyNames",
                "allOf",
                "anyOf",
                "oneOf",
                "not",
                "if",
                "then",
                "else",
                "extends",
                "type",
                "disallow",
                "definitions",
                "$defs",
                "unevaluatedItems",
                "unevaluatedProperties",
            ]
            .iter()
            .copied()
            .find(|candidate| key_is(key, candidate));
            let Some(keyword) = keyword else { continue };
            let recognized = match keyword {
                "definitions"
                | "properties"
                | "patternProperties"
                | "items"
                | "additionalItems"
                | "additionalProperties" => true,
                "$defs"
                | "dependentSchemas"
                | "contentSchema"
                | "unevaluatedItems"
                | "unevaluatedProperties" => matches!(
                    dialect,
                    SchemaDialect::Draft2019_09 | SchemaDialect::Draft2020_12
                ),
                "prefixItems" => dialect == SchemaDialect::Draft2020_12,
                "dependencies" => matches!(
                    dialect,
                    SchemaDialect::Draft3
                        | SchemaDialect::Draft4
                        | SchemaDialect::Draft6
                        | SchemaDialect::Draft7
                ),
                "extends" => dialect == SchemaDialect::Draft3,
                "allOf" | "anyOf" | "oneOf" | "not" => dialect != SchemaDialect::Draft3,
                "contains" | "propertyNames" => {
                    !matches!(dialect, SchemaDialect::Draft3 | SchemaDialect::Draft4)
                }
                "if" | "then" | "else" => matches!(
                    dialect,
                    SchemaDialect::Draft7
                        | SchemaDialect::Draft2019_09
                        | SchemaDialect::Draft2020_12
                ),
                _ => false,
            };
            if !recognized
                || (keyword == "additionalItems" && dialect == SchemaDialect::Draft2020_12)
            {
                continue;
            }
            if matches!(dialect, SchemaDialect::Draft3 | SchemaDialect::Draft4)
                && matches!(keyword, "additionalItems" | "additionalProperties")
                && !matches!(value, Py::Object(_))
            {
                continue;
            }
            match (keyword, value) {
                ("items", Py::Array(items))
                | ("allOf" | "anyOf" | "oneOf" | "extends" | "prefixItems", Py::Array(items)) => {
                    for item_index in 0..items.len() {
                        ctx.charge_work(3, Utf16::default())?;
                        result.push(vec![member_index, item_index]);
                    }
                }
                (
                    "properties" | "patternProperties" | "definitions" | "$defs"
                    | "dependentSchemas",
                    Py::Object(children),
                ) => {
                    for child_index in 0..children.len() {
                        ctx.charge_work(3, Utf16::default())?;
                        result.push(vec![member_index, child_index]);
                    }
                }
                ("dependencies", Py::Object(children)) => {
                    if children
                        .first()
                        .is_some_and(|(_, child)| matches!(child, Py::Object(_)))
                    {
                        for child_index in 0..children.len() {
                            ctx.charge_work(3, Utf16::default())?;
                            result.push(vec![member_index, child_index]);
                        }
                    }
                }
                ("type" | "disallow", Py::Object(_)) if dialect == SchemaDialect::Draft3 => {
                    ctx.charge_work(2, Utf16::default())?;
                    result.push(vec![member_index]);
                }
                ("type" | "disallow", Py::Array(items)) if dialect == SchemaDialect::Draft3 => {
                    for (child_index, child) in items.iter().enumerate() {
                        if matches!(child, Py::Object(_)) {
                            ctx.charge_work(3, Utf16::default())?;
                            result.push(vec![member_index, child_index]);
                        }
                    }
                }
                (
                    "additionalItems"
                    | "additionalProperties"
                    | "contains"
                    | "contentSchema"
                    | "not"
                    | "if"
                    | "then"
                    | "else"
                    | "propertyNames"
                    | "unevaluatedItems"
                    | "unevaluatedProperties",
                    _,
                )
                | ("items", _)
                | ("extends", _) => {
                    ctx.charge_work(2, Utf16::default())?;
                    result.push(vec![member_index]);
                }
                _ => {}
            }
        }
        Ok(result)
    }

    let mut indices = Vec::new();
    let supplied_uri = if let Some(uri) = supplied_resource_uri {
        Some(PythonResourceUri::from_points(uri.codepoints(), ctx)?)
    } else {
        None
    };
    let root_uri = source_id(source, dialect, ctx)?.or(supplied_uri);
    let root_anchor = source_recursive_anchor(source, ctx)?;
    visit(
        source,
        target,
        resource,
        dialect,
        &mut indices,
        true,
        source,
        &[],
        root_uri.as_ref(),
        root_anchor,
        references,
        resource_roots,
        ctx,
    )
}

fn object(items: Vec<(&str, Value)>) -> Value {
    Value::Object(
        items
            .into_iter()
            .map(|(k, v)| (Utf16::from(k), v))
            .collect(),
    )
}
fn rebase_reference_errors(
    errors: &mut [StructuralError],
    reference_root: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    for error in errors {
        if error
            .python_error
            .as_ref()
            .is_some_and(|metadata| metadata.validator.is_none())
        {
            continue;
        }
        if let Some(relative) = error
            .schema_path
            .units()
            .strip_prefix(reference_root.units())
        {
            ctx.charge_work_u64(
                (error.schema_path.len() as u64).saturating_add(1),
                Utf16::default(),
            )?;
            error.schema_path = Utf16::new(relative.to_vec());
        }
    }
    Ok(())
}
fn prefix_reference_errors(
    errors: &mut [StructuralError],
    reference_keyword_path: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    for error in errors {
        if error
            .python_error
            .as_ref()
            .is_some_and(|metadata| metadata.validator.is_none())
        {
            continue;
        }
        let relative = error
            .schema_path
            .units()
            .strip_prefix(&[b'#' as u16])
            .unwrap_or(error.schema_path.units());
        ctx.charge_work_u64(
            (reference_keyword_path.len() as u64)
                .saturating_add(relative.len() as u64)
                .saturating_add(1),
            Utf16::default(),
        )?;
        let mut path = reference_keyword_path.units().to_vec();
        path.extend_from_slice(relative);
        error.schema_path = Utf16::new(path);
    }
    Ok(())
}
fn adjust_direct_false_schema_errors(
    errors: &mut [StructuralError],
    display_instance_path: &Utf16,
    physical_instance_path: &Utf16,
    display_schema_path: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    for error in errors {
        if !error
            .python_error
            .as_ref()
            .is_some_and(|metadata| metadata.validator.is_none())
        {
            continue;
        }
        ctx.charge_work_u64(
            (display_instance_path.len() as u64)
                .saturating_add(physical_instance_path.len() as u64)
                .saturating_add(display_schema_path.len() as u64),
            Utf16::default(),
        )?;
        error.instance_path = display_instance_path.clone();
        error.python_physical_instance_path = Some(physical_instance_path.clone());
        error.schema_path = display_schema_path.clone();
    }
    Ok(())
}
fn push_ctx_precharged(
    out: &mut Vec<StructuralError>,
    ip: &Utf16,
    sp: &Utf16,
    kw: &str,
    params: Value,
    message: Utf16,
) {
    out.push(StructuralError {
        instance_path: ip.clone(),
        python_source_path: false,
        schema_path: sp.clone(),
        keyword: kw.into(),
        params,
        message,
        compiler_property_name: None,
        python_params: None,
        python_error: None,
        python_physical_instance_path: None,
        python_instance_override: None,
    });
}

fn push_ctx_copy_value(
    ctx: &mut Context<'_>,
    out: &mut Vec<StructuralError>,
    ip: &Utf16,
    sp: &Utf16,
    kw: &str,
    param_key: &str,
    source: &Value,
    message: &str,
) -> Result<(), EngineError> {
    let fixed = (ip.len() as u64)
        .saturating_add(sp.len() as u64)
        .saturating_add(kw.len() as u64)
        .saturating_add(message.encode_utf16().count() as u64)
        .saturating_add(2)
        .saturating_add(param_key.encode_utf16().count() as u64)
        .saturating_add(1);
    ctx.charge_work_u64(fixed, Utf16::default())?;
    meter_value_copy(source, ctx)?;
    let params = object(vec![(param_key, source.clone())]);
    push_ctx_precharged(out, ip, sp, kw, params, Utf16::from(message));
    Ok(())
}

fn push_required_ctx(
    ctx: &mut Context<'_>,
    out: &mut Vec<StructuralError>,
    ip: &Utf16,
    sp: &Utf16,
    missing_property: &Utf16,
    message_name: &Utf16,
) -> Result<(), EngineError> {
    const PREFIX: &str = "must have required property '";
    let prefix_len = PREFIX.encode_utf16().count();
    let fixed = (ip.len() as u64)
        .saturating_add(sp.len() as u64)
        .saturating_add("required".len() as u64)
        .saturating_add(prefix_len as u64)
        .saturating_add(message_name.len() as u64)
        .saturating_add(1)
        .saturating_add(2)
        .saturating_add("missingProperty".len() as u64)
        .saturating_add(1);
    ctx.charge_work_u64(fixed, Utf16::default())?;
    ctx.charge_work(missing_property.len(), Utf16::default())?;
    let mut message = Vec::with_capacity(
        prefix_len
            .saturating_add(message_name.len())
            .saturating_add(1),
    );
    message.extend(PREFIX.encode_utf16());
    message.extend(message_name.units());
    message.push(0x27);
    let params = object(vec![(
        "missingProperty",
        Value::String(missing_property.clone()),
    )]);
    push_ctx_precharged(out, ip, sp, "required", params, Utf16::new(message));
    Ok(())
}

fn push_ctx_pattern_value(
    ctx: &mut Context<'_>,
    out: &mut Vec<StructuralError>,
    ip: &Utf16,
    sp: &Utf16,
    source: &Value,
    pattern: &Utf16,
) -> Result<(), EngineError> {
    const PREFIX: &str = "must match pattern \"";
    let prefix_len = PREFIX.encode_utf16().count();
    let fixed = (ip.len() as u64)
        .saturating_add(sp.len() as u64)
        .saturating_add("pattern".len() as u64)
        .saturating_add(prefix_len as u64)
        .saturating_add(pattern.len() as u64)
        .saturating_add(1)
        .saturating_add(2)
        .saturating_add("pattern".len() as u64)
        .saturating_add(1);
    ctx.charge_work_u64(fixed, Utf16::default())?;
    meter_value_copy(source, ctx)?;
    let mut message =
        Vec::with_capacity(prefix_len.saturating_add(pattern.len()).saturating_add(1));
    message.extend(PREFIX.encode_utf16());
    message.extend(pattern.units());
    message.push(0x22);
    let params = object(vec![("pattern", source.clone())]);
    push_ctx_precharged(out, ip, sp, "pattern", params, Utf16::new(message));
    Ok(())
}

fn push_ctx(
    ctx: &mut Context<'_>,
    out: &mut Vec<StructuralError>,
    ip: &Utf16,
    sp: &Utf16,
    kw: &str,
    params: Value,
    msg: &str,
) -> Result<(), EngineError> {
    let path_work = (ip.len() as u64).saturating_add(sp.len() as u64);
    let text_work = (kw.len() as u64).saturating_add(msg.len() as u64);
    ctx.charge_work_u64(
        path_work.saturating_add(text_work).saturating_add(1),
        Utf16::default(),
    )?;
    meter_value_copy(&params, ctx)?;
    out.push(StructuralError {
        instance_path: ip.clone(),
        python_source_path: false,
        schema_path: sp.clone(),
        keyword: kw.into(),
        params,
        message: Utf16::from(msg),
        compiler_property_name: None,
        python_params: None,
        python_error: None,
        python_physical_instance_path: None,
        python_instance_override: None,
    });
    Ok(())
}
fn precharge_string_diagnostic(
    ctx: &mut Context<'_>,
    ip: &Utf16,
    sp: &Utf16,
    keyword: &str,
    message_units: usize,
    params: &[(&str, &Utf16)],
) -> Result<(), EngineError> {
    let mut work = (ip.len() as u64)
        .saturating_add(sp.len() as u64)
        .saturating_add(keyword.encode_utf16().count() as u64)
        .saturating_add(message_units as u64)
        .saturating_add(1); // params object node
    for (key, value) in params {
        work = work
            .saturating_add(key.encode_utf16().count() as u64)
            .saturating_add(1) // string value node
            .saturating_add(value.len() as u64);
    }
    ctx.charge_work_u64(work, Utf16::default())
}

fn push_units_ctx_after_precharge(
    out: &mut Vec<StructuralError>,
    ip: &Utf16,
    sp: &Utf16,
    kw: &str,
    params: Value,
    message: Utf16,
) {
    out.push(StructuralError {
        instance_path: ip.clone(),
        python_source_path: false,
        schema_path: sp.clone(),
        keyword: kw.into(),
        params,
        message,
        compiler_property_name: None,
        python_params: None,
        python_error: None,
        python_physical_instance_path: None,
        python_instance_override: None,
    });
}

fn meter_value_copy(value: &Value, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    match value {
        Value::String(text) => ctx.charge_work(text.len(), Utf16::default())?,
        Value::Array(items) => {
            for item in items {
                meter_value_copy(item, ctx)?;
            }
        }
        Value::Object(items) => {
            for (key, item) in items {
                ctx.charge_work(key.len(), Utf16::default())?;
                meter_value_copy(item, ctx)?;
            }
        }
        _ => {}
    }
    Ok(())
}
fn bound_error_ctx(
    ctx: &mut Context<'_>,
    out: &mut Vec<StructuralError>,
    ip: &Utf16,
    sp: &Utf16,
    kw: &str,
    rule: &Value,
    n: usize,
    unit: &str,
) -> Result<(), EngineError> {
    let Some(bound) = as_usize(rule) else {
        return Ok(());
    };
    let min = kw.starts_with("min");
    if (min && n < bound) || (!min && n > bound) {
        ctx.charge_work_u64(
            (ip.len() as u64)
                .saturating_add(sp.len() as u64)
                .saturating_add(kw.len() as u64)
                .saturating_add(unit.len() as u64)
                .saturating_add(64),
            Utf16::default(),
        )?;
        let msg = if min {
            format!("must NOT have fewer than {bound} {unit}")
        } else {
            format!("must NOT have more than {bound} {unit}")
        };
        push_ctx(
            ctx,
            out,
            ip,
            sp,
            kw,
            object(vec![("limit", Value::Number(bound as f64))]),
            &msg,
        )?;
    }
    Ok(())
}
fn unescape_pointer(v: &str) -> Vec<u16> {
    v.replace("~1", "/")
        .replace("~0", "~")
        .encode_utf16()
        .collect()
}

/// Draft 3's legacy `Resource.pointer` enters subresources only through these
/// keyword families. Its boolean-reference TypeError occurs while descending
/// such a boundary; a direct reference to a root boolean remains an ordinary
/// false-schema validation error.
fn draft3_reference_crosses_subresource(
    path: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    let units = path.units();
    ctx.charge_work_u64((units.len() as u64).saturating_mul(1 + 6), Utf16::default())?;
    let fragment = units
        .iter()
        .position(|unit| *unit == b'#' as u16)
        .map(|index| &units[index + 1..])
        .unwrap_or(units);
    const SUBRESOURCES: &[&str] = &[
        "additionalItems",
        "additionalProperties",
        "extends",
        "definitions",
        "patternProperties",
        "properties",
    ];
    for raw in fragment.split(|unit| *unit == b'/' as u16) {
        let mut decoded = Vec::with_capacity(raw.len());
        if raw.starts_with(&[b'~' as u16, b'p' as u16]) && (raw.len() - 2) % 6 == 0 {
            let mut valid = true;
            for chunk in raw[2..].chunks_exact(6) {
                let mut point = 0u32;
                for unit in chunk {
                    let Some(digit) = (match unit {
                        0x30..=0x39 => Some((unit - 0x30) as u32),
                        0x61..=0x66 => Some((unit - 0x61 + 10) as u32),
                        _ => None,
                    }) else {
                        valid = false;
                        break;
                    };
                    point = (point << 4) | digit;
                }
                if !valid || point > 0x10ffff {
                    valid = false;
                    break;
                }
                if point <= 0xffff {
                    decoded.push(point as u16);
                } else {
                    // No Draft 3 subresource keyword contains a supplementary
                    // code point, so a sentinel is sufficient for comparison.
                    decoded.push(0xffff);
                }
            }
            if !valid {
                continue;
            }
        } else {
            let mut at = 0;
            while at < raw.len() {
                if raw[at] == b'~' as u16 {
                    match raw.get(at + 1) {
                        Some(0x30) => decoded.push(b'~' as u16),
                        Some(0x31) => decoded.push(b'/' as u16),
                        _ => decoded.push(raw[at]),
                    }
                    at += if matches!(raw.get(at + 1), Some(0x30 | 0x31)) {
                        2
                    } else {
                        1
                    };
                } else {
                    decoded.push(raw[at]);
                    at += 1;
                }
            }
        }
        if SUBRESOURCES
            .iter()
            .any(|key| key.encode_utf16().eq(decoded.iter().copied()))
        {
            return Ok(true);
        }
    }
    Ok(false)
}
fn append_marked_python_path(path: &Utf16, text: &crate::python_value::PyText) -> Utf16 {
    let mut units = path.units().to_vec();
    if units.last() != Some(&(b'/' as u16)) {
        units.push(b'/' as u16);
    }
    // `~p` is not a valid JSON Pointer escape, so it cannot collide with an
    // ordinary key (whose tilde is emitted as `~0`). Fixed-width hex retains
    // every Python code point, including explicit surrogate pairs.
    units.extend([b'~' as u16, b'p' as u16]);
    const HEX: &[u8; 16] = b"0123456789abcdef";
    for point in text.codepoints() {
        for shift in [20, 16, 12, 8, 4, 0] {
            units.push(HEX[((point >> shift) & 0xf) as usize] as u16);
        }
    }
    Utf16::new(units)
}

fn marked_python_path_work(path: &Utf16, text: &crate::python_value::PyText) -> u64 {
    (path.len() as u64)
        .saturating_add(u64::from(path.units().last() != Some(&(b'/' as u16))))
        .saturating_add(2) // marker `~p`
        .saturating_add((text.len() as u64).saturating_mul(6)) // fixed-width hex code points
}
/// Conservative comparison bound for B-tree lookup. String-key maps compare
/// up to `key_units` per visited entry; pointer-key maps use the node bound.
fn btree_index_lookup_work(entries: usize) -> u64 {
    if entries == 0 {
        return 1;
    }
    let mut levels = 0u64;
    let mut capacity = entries as u64;
    while capacity > 1 {
        capacity = capacity.div_ceil(2);
        levels += 1;
    }
    11u64
        .saturating_mul(levels.saturating_add(1))
        .min(entries as u64)
        .saturating_add(1)
}

fn btree_lookup_work(entries: usize, key_units: usize) -> u64 {
    btree_index_lookup_work(entries).saturating_mul(key_units as u64)
}

fn append_schema_path(p: &Utf16, s: &str) -> Utf16 {
    let mut u = p.units().to_vec();
    if u.last() != Some(&0x2f) {
        u.push(0x2f);
    }
    u.extend(s.encode_utf16());
    Utf16::new(u)
}
fn preserve_schema_fragment(
    normalized: &Utf16,
    original: &Utf16,
    entered_resource: bool,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    let normalized_hash = normalized.units().iter().position(|unit| *unit == 0x23);
    let original_hash = original.units().iter().position(|unit| *unit == 0x23);
    let (Some(normalized_hash), Some(original_hash)) = (normalized_hash, original_hash) else {
        return Ok(normalized.clone());
    };
    let suffix = if entered_resource {
        &original.units()[original_hash..original_hash + 1]
    } else {
        &original.units()[original_hash..]
    };
    ctx.charge_work_u64(
        normalized_hash as u64 + suffix.len() as u64 + 1,
        Utf16::default(),
    )?;
    let mut units = normalized.units()[..normalized_hash].to_vec();
    units.extend_from_slice(suffix);
    Ok(Utf16::new(units))
}
fn append_schema_pointer(p: &Utf16, segment: &Utf16) -> Utf16 {
    let mut units = p.units().to_vec();
    if units.last() != Some(&0x2f) {
        units.push(0x2f);
    }
    for unit in segment.units() {
        match unit {
            0x7e => units.extend([0x7e, 0x30]),
            0x2f => units.extend([0x7e, 0x31]),
            value => units.push(*value),
        }
    }
    Utf16::new(units)
}
fn append_instance_path(p: &Utf16, s: &Utf16) -> Utf16 {
    let mut u = p.units().to_vec();
    u.push(0x2f);
    for c in s.units() {
        match c {
            0x7e => u.extend([0x7e, 0x30]),
            0x2f => u.extend([0x7e, 0x31]),
            x => u.push(*x),
        }
    }
    Utf16::new(u)
}

#[cfg(test)]
mod finite_binary64_schema_admission_tests {
    use super::*;

    fn parsed(source: &str) -> Value {
        crate::serialization::read_json_value(
            &source.encode_utf16().collect::<Vec<_>>(),
            crate::serialization::Format::Json,
            &mut Context::ordinary(),
        )
        .unwrap()
    }

    #[test]
    fn schema_and_instance_accept_finite_binary64_outside_core_profile() {
        let schema = Value::Object(vec![(
            Utf16::from("const"),
            Value::Number(9_007_199_254_740_992.0),
        )]);
        let compiled = CompiledSchema::compile_consumer(
            &schema,
            &SchemaResources::default(),
            false,
            &mut Context::ordinary(),
        )
        .unwrap();
        for (instance, expected) in [
            (9_007_199_254_740_992.0, true),
            (9_007_199_254_740_991.0, false),
            (9_007_199_254_740_992.0, true),
            (9_007_199_254_740_991.0, false),
        ] {
            assert_eq!(
                compiled
                    .validate(&Value::Number(instance), &mut Context::ordinary())
                    .unwrap()
                    .is_empty(),
                expected
            );
        }
        let instance = Value::Number(9_007_199_254_740_992.0);
        assert_eq!(
            copy_json(&instance, &mut Context::ordinary())
                .unwrap_err()
                .code,
            "NUMBER"
        );
    }

    #[test]
    fn schema_instance_rejects_nonfinite_and_preserves_multiple_of_overflow_result() {
        let schema = parsed(
            r#"{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"integer","multipleOf":0.123456789}"#,
        );
        let compiled = CompiledSchema::compile_consumer(
            &schema,
            &SchemaResources::default(),
            false,
            &mut Context::ordinary(),
        )
        .unwrap();
        let huge_finite = Value::Number(1e308);
        assert!(!compiled
            .validate(&huge_finite, &mut Context::ordinary())
            .unwrap()
            .is_empty());
        let nonfinite = Value::Number(f64::INFINITY);
        assert_eq!(
            compiled
                .validate(&nonfinite, &mut Context::ordinary())
                .unwrap_err()
                .code,
            "NUMBER"
        );
        let bad_schema =
            Value::Object(vec![(Utf16::from("minimum"), Value::Number(f64::INFINITY))]);
        assert_eq!(
            CompiledSchema::compile_consumer(
                &bad_schema,
                &SchemaResources::default(),
                false,
                &mut Context::ordinary(),
            )
            .unwrap_err()
            .code,
            "NUMBER"
        );
    }
}

#[cfg(test)]
mod custom_vocabulary_policy_tests {
    use super::*;
    use crate::context::WorkMeter;

    fn parsed(source: &str) -> Value {
        crate::serialization::read_json_value(
            &source.encode_utf16().collect::<Vec<_>>(),
            crate::serialization::Format::Json,
            &mut Context::ordinary(),
        )
        .unwrap()
    }

    fn object_with_prefix_members(count: usize, tail: &str) -> Value {
        let mut source = String::from("{");
        for index in 0..count {
            source.push_str(&format!("\"filler{index}\":null,"));
        }
        source.push_str(tail);
        parsed(&source)
    }

    fn resources() -> SchemaResources {
        SchemaResources {
            entries: vec![
                (
                    Utf16::from("https://example.test/no-validation"),
                    parsed(
                        r#"{"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://example.test/no-validation","$vocabulary":{"https://json-schema.org/draft/2020-12/vocab/core":true,"https://json-schema.org/draft/2020-12/vocab/applicator":true,"https://example.test/vocab/optional":false}}"#,
                    ),
                ),
                (
                    Utf16::from("https://example.test/standard"),
                    parsed(
                        r#"{"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://example.test/standard","minimum":10}"#,
                    ),
                ),
                (
                    Utf16::from("https://example.test/standard-nested"),
                    parsed(
                        r#"{"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://example.test/standard-nested","properties":{"x":{"minimum":10}}}"#,
                    ),
                ),
                (
                    Utf16::from("https://example.test/custom-resource"),
                    parsed(
                        r#"{"$schema":"https://example.test/no-validation","$id":"https://example.test/custom-resource","properties":{"x":{"minimum":10}}}"#,
                    ),
                ),
                (
                    Utf16::from("https://example.test/standard-fragment"),
                    parsed(
                        r#"{"$schema":"https://json-schema.org/draft/2020-12/schema","$defs":{"x":{"minimum":10}}}"#,
                    ),
                ),
                (
                    Utf16::from("https://example.test/custom-fragment"),
                    parsed(
                        r#"{"$schema":"https://example.test/no-validation","$defs":{"x":{"minimum":10}}}"#,
                    ),
                ),
            ],
        }
    }

    #[test]
    fn absent_validation_vocabulary_keeps_applicators_and_ignores_inactive_malformed_keywords() {
        let schema = parsed(
            r#"{"$schema":"https://example.test/no-validation","minimum":"inactive","unknownOptionalKeyword":{"x":1},"properties":{"blocked":false}}"#,
        );
        let compiled =
            CompiledSchema::compile_consumer(&schema, &resources(), true, &mut Context::ordinary())
                .unwrap();
        assert!(compiled
            .validate(&parsed("5"), &mut Context::ordinary())
            .unwrap()
            .is_empty());
        assert!(!compiled
            .validate(&parsed(r#"{"blocked":true}"#), &mut Context::ordinary())
            .unwrap()
            .is_empty());
    }

    #[test]
    fn referenced_standard_resource_reactivates_validation_vocabulary() {
        let schema = parsed(
            r#"{"$schema":"https://example.test/no-validation","$ref":"https://example.test/standard-nested"}"#,
        );
        let compiled = CompiledSchema::compile_consumer(
            &schema,
            &resources(),
            false,
            &mut Context::ordinary(),
        )
        .unwrap();
        assert!(!compiled
            .validate(&parsed(r#"{"x":5}"#), &mut Context::ordinary())
            .unwrap()
            .is_empty());
        assert!(compiled
            .validate(&parsed(r#"{"x":12}"#), &mut Context::ordinary())
            .unwrap()
            .is_empty());
    }

    #[test]
    fn referenced_custom_resource_disables_validation_for_its_nested_schemas() {
        let schema = parsed(
            r#"{"$schema":"https://json-schema.org/draft/2020-12/schema","$ref":"https://example.test/custom-resource"}"#,
        );
        let compiled = CompiledSchema::compile_consumer(
            &schema,
            &resources(),
            false,
            &mut Context::ordinary(),
        )
        .unwrap();
        assert!(compiled
            .validate(&parsed(r#"{"x":5}"#), &mut Context::ordinary())
            .unwrap()
            .is_empty());
    }

    #[test]
    fn fragment_reference_uses_standard_enclosing_resource_policy() {
        let schema = parsed(
            r#"{"$schema":"https://example.test/no-validation","$ref":"https://example.test/standard-fragment#/$defs/x"}"#,
        );
        let compiled = CompiledSchema::compile_consumer(
            &schema,
            &resources(),
            false,
            &mut Context::ordinary(),
        )
        .unwrap();
        assert!(!compiled
            .validate(&parsed("5"), &mut Context::ordinary())
            .unwrap()
            .is_empty());
    }

    #[test]
    fn fragment_reference_uses_custom_enclosing_resource_policy() {
        let schema = parsed(
            r#"{"$schema":"https://json-schema.org/draft/2020-12/schema","$ref":"https://example.test/custom-fragment#/$defs/x"}"#,
        );
        let compiled = CompiledSchema::compile_consumer(
            &schema,
            &resources(),
            false,
            &mut Context::ordinary(),
        )
        .unwrap();
        assert!(compiled
            .validate(&parsed("5"), &mut Context::ordinary())
            .unwrap()
            .is_empty());
    }

    #[test]
    fn omitted_applicator_and_unevaluated_vocabularies_leave_keywords_inert() {
        let mut resources = resources();
        resources.entries[0].1 = parsed(
            r#"{"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://example.test/no-validation","$vocabulary":{"https://json-schema.org/draft/2020-12/vocab/core":true}}"#,
        );
        let schema = parsed(
            r#"{"$schema":"https://example.test/no-validation","properties":{"x":false},"allOf":7,"unevaluatedProperties":false}"#,
        );
        let compiled =
            CompiledSchema::compile_consumer(&schema, &resources, true, &mut Context::ordinary())
                .unwrap();
        assert!(compiled
            .validate(&parsed(r#"{"x":1,"extra":2}"#), &mut Context::ordinary())
            .unwrap()
            .is_empty());
    }

    #[test]
    fn custom_dialect_requires_explicit_well_formed_supported_vocabulary_declaration() {
        let schema = parsed(r#"{"$schema":"https://example.test/missing"}"#);
        assert_eq!(
            CompiledSchema::compile_consumer(
                &schema,
                &SchemaResources::default(),
                false,
                &mut Context::ordinary(),
            )
            .unwrap_err()
            .code,
            "SCHEMA_DIALECT"
        );
        let mut malformed = resources();
        malformed.entries[0].1 = parsed(
            r#"{"$id":"https://example.test/no-validation","$vocabulary":{"https://json-schema.org/draft/2020-12/vocab/core":false}}"#,
        );
        assert_eq!(
            CompiledSchema::compile_consumer(
                &parsed(r#"{"$schema":"https://example.test/no-validation"}"#),
                &malformed,
                false,
                &mut Context::ordinary(),
            )
            .unwrap_err()
            .code,
            "SCHEMA_DIALECT"
        );
        let mut unsupported = resources();
        unsupported.entries[0].1 = parsed(
            r#"{"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://example.test/no-validation","$vocabulary":{"https://json-schema.org/draft/2020-12/vocab/core":true,"https://example.test/vocab/required":true}}"#,
        );
        assert_eq!(
            CompiledSchema::compile_consumer(
                &parsed(r#"{"$schema":"https://example.test/no-validation"}"#),
                &unsupported,
                false,
                &mut Context::ordinary(),
            )
            .unwrap_err()
            .code,
            "SCHEMA_DIALECT"
        );
    }

    #[test]
    fn nested_custom_dialect_declarations_must_resolve_and_be_supported() {
        let schema = parsed(
            r#"{"$schema":"https://example.test/no-validation","properties":{"x":{"$schema":"https://example.test/missing"}}}"#,
        );
        assert_eq!(
            CompiledSchema::compile_consumer(
                &schema,
                &resources(),
                false,
                &mut Context::ordinary(),
            )
            .unwrap_err()
            .code,
            "SCHEMA_DIALECT"
        );

        let mut resources = resources();
        resources.entries.push((
            Utf16::from("https://example.test/unsupported-meta"),
            parsed(r#"{"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://example.test/unsupported-meta","$vocabulary":{"https://json-schema.org/draft/2020-12/vocab/core":true,"https://example.test/vocab/mandatory":true}}"#),
        ));
        let nested = parsed(
            r#"{"$schema":"https://example.test/no-validation","properties":{"x":{"$schema":"https://example.test/unsupported-meta"}}}"#,
        );
        assert_eq!(
            CompiledSchema::compile_consumer(&nested, &resources, false, &mut Context::ordinary(),)
                .unwrap_err()
                .code,
            "SCHEMA_DIALECT"
        );
    }

    #[test]
    fn optional_vocabulary_uri_conversion_is_charged_on_each_validation() {
        let unknown_uri = format!("https://example.test/vocab/{}", "x".repeat(100_000));
        let meta = parsed(&format!(
            r#"{{"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://example.test/metered-meta","$vocabulary":{{"https://json-schema.org/draft/2020-12/vocab/core":true,"{unknown_uri}":false}}}}"#
        ));
        let resources = SchemaResources {
            entries: vec![(Utf16::from("https://example.test/metered-meta"), meta)],
        };
        let schema = parsed(r#"{"$schema":"https://example.test/metered-meta"}"#);
        let compiled =
            CompiledSchema::compile_consumer(&schema, &resources, true, &mut Context::ordinary())
                .unwrap();

        let mut observed = 0usize;
        let mut meter = |work: usize| {
            observed = observed.saturating_add(work);
            Ok(())
        };
        let mut meter: &mut WorkMeter<'_> = &mut meter;
        let mut ctx = Context::ordinary().with_meter(&mut meter);
        assert!(compiled
            .validate(&parsed("null"), &mut ctx)
            .unwrap()
            .is_empty());
        assert!(compiled
            .validate(&parsed("null"), &mut ctx)
            .unwrap()
            .is_empty());
        assert!(observed >= 2 * unknown_uri.encode_utf16().count());
    }

    #[test]
    fn unrelated_resource_lookup_conversion_is_charged_on_each_validation() {
        let unrelated_uri = format!("https://example.test/{}", "r".repeat(100_000));
        let unrelated_id = format!("https://example.test/{}", "i".repeat(80_000));
        let resources = SchemaResources {
            entries: vec![
                (Utf16::from(unrelated_uri.as_str()), parsed("{}")),
                (
                    Utf16::from("https://example.test/unrelated-retrieval"),
                    parsed(&format!(r#"{{"$id":"{unrelated_id}"}}"#)),
                ),
                (
                    Utf16::from("https://example.test/metered-meta"),
                    parsed(
                        r#"{"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://example.test/metered-meta","$vocabulary":{"https://json-schema.org/draft/2020-12/vocab/core":true}}"#,
                    ),
                ),
            ],
        };
        let schema = parsed(r#"{"$schema":"https://example.test/metered-meta"}"#);
        let compiled =
            CompiledSchema::compile_consumer(&schema, &resources, true, &mut Context::ordinary())
                .unwrap();

        let mut observed = 0usize;
        let mut meter = |work: usize| {
            observed = observed.saturating_add(work);
            Ok(())
        };
        let mut meter: &mut WorkMeter<'_> = &mut meter;
        let mut ctx = Context::ordinary().with_meter(&mut meter);
        assert!(compiled
            .validate(&parsed("null"), &mut ctx)
            .unwrap()
            .is_empty());
        assert!(compiled
            .validate(&parsed("null"), &mut ctx)
            .unwrap()
            .is_empty());
        assert!(
            observed
                >= 2 * (unrelated_uri.encode_utf16().count() + unrelated_id.encode_utf16().count())
        );
    }

    #[test]
    fn custom_metaschema_member_search_is_charged_on_each_validation() {
        let meta = object_with_prefix_members(
            10_000,
            r#""$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://example.test/metered-members-meta","$vocabulary":{"https://json-schema.org/draft/2020-12/vocab/core":true}}"#,
        );
        let resources = SchemaResources {
            entries: vec![(
                Utf16::from("https://example.test/metered-members-meta"),
                meta,
            )],
        };
        let schema = parsed(r#"{"$schema":"https://example.test/metered-members-meta"}"#);
        let compiled =
            CompiledSchema::compile_consumer(&schema, &resources, false, &mut Context::ordinary())
                .unwrap();

        let mut observed = 0usize;
        let mut meter = |work: usize| {
            observed = observed.saturating_add(work);
            Ok(())
        };
        let mut meter: &mut WorkMeter<'_> = &mut meter;
        let mut ctx = Context::ordinary().with_meter(&mut meter);
        assert!(compiled
            .validate(&parsed("null"), &mut ctx)
            .unwrap()
            .is_empty());
        assert!(compiled
            .validate(&parsed("null"), &mut ctx)
            .unwrap()
            .is_empty());
        assert!(observed >= 2 * 10_000);
    }

    #[test]
    fn root_dialect_member_search_is_charged_on_each_validation() {
        let resources = resources();
        let schema = object_with_prefix_members(
            10_000,
            r#""$schema":"https://example.test/no-validation"}"#,
        );
        let compiled =
            CompiledSchema::compile_consumer(&schema, &resources, false, &mut Context::ordinary())
                .unwrap();

        let mut observed = 0usize;
        let mut meter = |work: usize| {
            observed = observed.saturating_add(work);
            Ok(())
        };
        let mut meter: &mut WorkMeter<'_> = &mut meter;
        let mut ctx = Context::ordinary().with_meter(&mut meter);
        assert!(compiled
            .validate(&parsed("null"), &mut ctx)
            .unwrap()
            .is_empty());
        assert!(compiled
            .validate(&parsed("null"), &mut ctx)
            .unwrap()
            .is_empty());
        assert!(observed >= 2 * 10_000);
    }
}

#[cfg(test)]
mod python_resource_work_tests {
    use super::*;
    use crate::context::WorkMeter;

    #[test]
    fn native_uri_operation_families_match_frozen_cpython_profiles() {
        let receipt: serde_json::Value = serde_json::from_str(include_str!("../../../tests/rust-core/fixtures/r2/sol-python-resource-uri-operations-predecessor.json")).unwrap();
        let cases = receipt["uriOperations"].as_array().unwrap();
        assert_eq!(cases.len(), 140);
        let points = |value: &serde_json::Value| {
            value
                .as_array()
                .unwrap()
                .iter()
                .map(|point| point.as_u64().unwrap() as u32)
                .collect::<Vec<_>>()
        };
        for (index, case) in cases.iter().enumerate() {
            let base = PythonResourceUri(points(&case["base"]));
            let reference = PythonResourceUri(points(&case["reference"]));
            let result = base
                .join(&reference, &mut Context::ordinary())
                .unwrap()
                .unwrap();
            assert_eq!(
                result.points(),
                points(&case["result"]),
                "native URI operation {index}"
            );
        }
    }

    #[test]
    fn native_uri_common_prefix_work_is_admitted_before_comparison() {
        let mut left = vec![0xd800; 50_000];
        left.push(0x10000);
        let mut right = left.clone();
        *right.last_mut().unwrap() = 0xd800;
        let left = PythonResourceUri(left);
        let right = PythonResourceUri(right);
        let mut observed = 0;
        let mut meter = |work: usize| {
            observed = work;
            Err(EngineError::new(
                "DENIED_URI_COMPARE",
                Utf16::default(),
                "denied",
            ))
        };
        let mut meter: &mut WorkMeter<'_> = &mut meter;
        let mut ctx = Context::ordinary().with_meter(&mut meter);
        assert_eq!(
            left.same(&right, &mut ctx).unwrap_err().code,
            "DENIED_URI_COMPARE"
        );
        assert_eq!(observed, 50_002);
        assert!(!left.same(&right, &mut Context::ordinary()).unwrap());
    }

    #[test]
    fn native_uri_join_admits_all_input_work_before_owned_buffers() {
        let base = PythonResourceUri(
            "https://example.test/root.json"
                .chars()
                .map(u32::from)
                .collect(),
        );
        let relative = PythonResourceUri(vec![0xd800; 50_000]);
        let mut observed = 0;
        let mut meter = |work: usize| {
            observed = work;
            Err(EngineError::new(
                "DENIED_URI_JOIN",
                Utf16::default(),
                "denied",
            ))
        };
        let mut meter: &mut WorkMeter<'_> = &mut meter;
        let mut ctx = Context::ordinary().with_meter(&mut meter);
        assert_eq!(
            base.join(&relative, &mut ctx).unwrap_err().code,
            "DENIED_URI_JOIN"
        );
        assert!(observed >= (base.len() + relative.len()) * 10);
    }
}

#[cfg(test)]
mod static_reference_resolution_tests {
    use super::*;

    fn value(source: &str) -> Value {
        crate::serialization::read_json_value(
            &source.encode_utf16().collect::<Vec<_>>(),
            crate::serialization::Format::Json,
            &mut Context::ordinary(),
        )
        .unwrap()
    }

    fn compile(schema: &str, resources: Vec<(&str, &str)>) -> Result<CompiledSchema, EngineError> {
        let entries = resources
            .into_iter()
            .map(|(uri, schema)| (Utf16::from(uri), value(schema)))
            .collect();
        CompiledSchema::compile_consumer(
            &value(schema),
            &SchemaResources { entries },
            false,
            &mut Context::ordinary(),
        )
    }

    #[test]
    fn nested_ids_set_reference_scope_and_annotations_do_not() {
        let result = compile(
            r#"{"$id":"https://example.test/root/","$defs":{"nested":{"$id":"sub/","$ref":"target.json"}},"examples":[{"$id":"https://example.test/fake/","$ref":"missing.json"}]}"#,
            vec![("https://example.test/root/sub/target.json", "true")],
        );
        assert!(result.is_ok(), "{result:?}");

        let missing = compile(
            r#"{"$id":"https://example.test/root/","$defs":{"nested":{"$id":"sub/","$ref":"missing.json"}}}"#,
            vec![],
        );
        assert_eq!(missing.unwrap_err().code, "SCHEMA_REF_UNRESOLVED");
    }

    #[test]
    fn retrieved_relative_root_id_is_resolved_once_and_keeps_its_directory() {
        let result = compile(
            r#"{"$id":"https://example.test/main.json","$ref":"https://example.test/root.json"}"#,
            vec![
                (
                    "https://example.test/root.json",
                    r#"{"$id":"sub/","$ref":"target.json"}"#,
                ),
                ("https://example.test/sub/target.json", "true"),
            ],
        );
        assert!(result.is_ok(), "{result:?}");
    }

    #[test]
    fn legacy_absolute_root_and_nested_ids_are_not_joined_as_relative_paths() {
        let root = value(
            r##"{"$schema":"http://json-schema.org/draft-07/schema#","$id":"https://example.test/root.json","definitions":{"target":{"type":"integer"}},"$ref":"#/definitions/target"}"##,
        );
        let compiled = CompiledSchema::compile_consumer(
            &root,
            &SchemaResources { entries: vec![] },
            false,
            &mut Context::ordinary(),
        )
        .unwrap();
        assert!(compiled
            .validate(&value("1"), &mut Context::ordinary())
            .unwrap()
            .is_empty());

        let nested = value(
            r##"{"$schema":"http://json-schema.org/draft-07/schema#","$id":"https://example.test/root.json","properties":{"x":{"$id":"https://example.test/child.json","definitions":{"target":{"type":"integer"}},"$ref":"#/definitions/target"}}}"##,
        );
        assert!(CompiledSchema::compile_consumer(
            &nested,
            &SchemaResources { entries: vec![] },
            false,
            &mut Context::ordinary(),
        )
        .is_ok());
    }

    #[test]
    fn reference_resolution_handles_directory_bases_and_urn_local_pointers() {
        assert_eq!(
            resolve_draft2020_uri("https://example.test/folder/", "child.json").as_deref(),
            Some("https://example.test/folder/child.json")
        );
        assert_eq!(
            resolve_draft2020_uri("https://example.test/a/b/root.json", "../child.json").as_deref(),
            Some("https://example.test/a/child.json")
        );
        assert!(compile(
            r##"{"$id":"urn:example:root","$defs":{"target":{"type":"string"}},"$ref":"#/$defs/target"}"##,
            vec![],
        )
        .is_ok());
    }

    #[test]
    fn then_else_are_schema_positions_and_cycles_are_bounded() {
        let schema = r#"{"$id":"https://example.test/root","if":{},"then":{"$ref":"https://example.test/then"},"else":{"$ref":"https://example.test/else"}}"#;
        assert!(compile(
            schema,
            vec![
                ("https://example.test/then", "true"),
                ("https://example.test/else", "false"),
            ],
        )
        .is_ok());
        let missing_else = compile(schema, vec![("https://example.test/then", "true")]);
        assert_eq!(missing_else.unwrap_err().code, "SCHEMA_REF_UNRESOLVED");
        assert!(compile(
            r##"{"$id":"https://example.test/cycle","$ref":"#"}"##,
            vec![]
        )
        .is_ok());
    }

    #[test]
    fn conflicting_resource_uris_remain_explicit_errors() {
        let error = compile(
            r#"{"$id":"https://example.test/root","$ref":"https://example.test/shared"}"#,
            vec![
                ("https://example.test/shared", "true"),
                ("https://example.test/shared", "false"),
            ],
        )
        .unwrap_err();
        assert_eq!(error.code, "SCHEMA_ID_CONFLICT");
    }

    #[test]
    fn static_and_dynamic_refs_resolve_anchors_in_schema_positions() {
        let schema = r##"{"$id":"https://example.test/root","$defs":{"target":{"$anchor":"plain","type":"integer"}},"$ref":"#plain"}"##;
        let compiled = compile(schema, vec![]).unwrap();
        assert!(compiled
            .validate(&value("1"), &mut Context::ordinary())
            .unwrap()
            .is_empty());
        assert!(!compiled
            .validate(&value("\"no\""), &mut Context::ordinary())
            .unwrap()
            .is_empty());

        let dynamic_fallback = r##"{"$id":"https://example.test/root","$defs":{"target":{"$anchor":"plain","type":"integer"}},"$dynamicRef":"#plain"}"##;
        assert!(compile(dynamic_fallback, vec![]).is_ok());
    }

    #[test]
    fn then_and_else_resources_are_available_to_sibling_refs() {
        for keyword in ["then", "else"] {
            let schema = format!(
                r#"{{"$schema":"https://json-schema.org/draft/2020-12/schema","$ref":"http://example.com/ref/{keyword}","{keyword}":{{"$id":"http://example.com/ref/{keyword}","type":"integer"}}}}"#
            );
            let compiled = compile(&schema, vec![]).unwrap();
            assert!(compiled
                .validate(&value("12"), &mut Context::ordinary())
                .unwrap()
                .is_empty());
            assert!(!compiled
                .validate(&value("\"no\""), &mut Context::ordinary())
                .unwrap()
                .is_empty());
        }
    }

    #[test]
    fn anchor_resolution_skips_nested_resources_with_the_same_anchor() {
        let schema = r##"{"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"http://localhost:1234/draft2020-12/foobar","$defs":{"A":{"$id":"child1","allOf":[{"$id":"child2","$anchor":"my_anchor","type":"number"},{"$anchor":"my_anchor","type":"string"}]}},"$ref":"child1#my_anchor"}"##;
        let compiled = compile(schema, vec![]).unwrap();
        assert!(compiled
            .validate(&value("\"a\""), &mut Context::ordinary())
            .unwrap()
            .is_empty());
        assert!(!compiled
            .validate(&value("1"), &mut Context::ordinary())
            .unwrap()
            .is_empty());
    }

    #[test]
    fn referenced_relative_id_resource_is_not_rebased_a_second_time() {
        let embedded = r##"{"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://example.com/draft2020-12/ref-and-id3/base.json","$ref":"nested/foo.json","$defs":{"foo":{"$id":"nested/foo.json","$ref":"./bar.json"},"bar":{"$id":"nested/bar.json","type":"number"}}}"##;
        let compiled = compile(embedded, vec![]).unwrap();
        assert!(compiled
            .validate(&value("5"), &mut Context::ordinary())
            .unwrap()
            .is_empty());
        assert!(!compiled
            .validate(&value("\"a\""), &mut Context::ordinary())
            .unwrap()
            .is_empty());

        let changed_folder = r##"{"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"http://localhost:1234/draft2020-12/scope_change_defs1.json","type":"object","properties":{"list":{"$ref":"baseUriChangeFolder/"}},"$defs":{"baz":{"$id":"baseUriChangeFolder/","type":"array","items":{"$ref":"folderInteger.json"}}}}"##;
        let compiled = compile(
            changed_folder,
            vec![(
                "http://localhost:1234/draft2020-12/baseUriChangeFolder/folderInteger.json",
                r#"{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"integer"}"#,
            )],
        )
        .unwrap();
        assert!(compiled
            .validate(&value(r#"{"list":[1]}"#), &mut Context::ordinary())
            .unwrap()
            .is_empty());
        assert!(!compiled
            .validate(&value(r#"{"list":["a"]}"#), &mut Context::ordinary())
            .unwrap()
            .is_empty());
    }

    #[test]
    fn parent_uri_suffix_is_not_mistaken_for_a_resolved_child_id() {
        let schema = r##"{"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://example.test/dir/foobar/","properties":{"x":{"$id":"bar/","$ref":"target"}}}"##;
        let compiled = compile(
            schema,
            vec![
                (
                    "https://example.test/dir/foobar/bar/target",
                    r#"{"type":"string"}"#,
                ),
                (
                    "https://example.test/dir/foobar/target",
                    r#"{"type":"integer"}"#,
                ),
            ],
        )
        .unwrap();
        assert!(compiled
            .validate(&value(r#"{"x":"ok"}"#), &mut Context::ordinary())
            .unwrap()
            .is_empty());
    }

    #[test]
    fn repeated_relative_ids_are_applied_for_direct_nested_evaluation() {
        let schema = r##"{"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://example.test/root.json","properties":{"x":{"$id":"foo/","properties":{"y":{"$id":"foo/","$ref":"target"}}}}}"##;
        let compiled = compile(
            schema,
            vec![
                (
                    "https://example.test/foo/foo/target",
                    r#"{"type":"string"}"#,
                ),
                ("https://example.test/foo/target", r#"{"type":"integer"}"#),
            ],
        )
        .unwrap();
        assert!(compiled
            .validate(&value(r#"{"x":{"y":"ok"}}"#), &mut Context::ordinary())
            .unwrap()
            .is_empty());
    }

    #[test]
    fn anchored_resource_root_does_not_reapply_its_identifier() {
        let schema = r##"{"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://example.test/root.json","$defs":{"resource":{"$id":"foo/","$anchor":"a","type":"string"}},"$ref":"foo/#a"}"##;
        let compiled = compile(schema, vec![]).unwrap();
        assert!(compiled
            .validate(&value("\"ok\""), &mut Context::ordinary())
            .unwrap()
            .is_empty());
        assert!(!compiled
            .validate(&value("1"), &mut Context::ordinary())
            .unwrap()
            .is_empty());
    }

    #[test]
    fn anchored_root_in_external_document_keeps_resource_identity() {
        let schema = r##"{"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://example.test/root.json","$ref":"https://example.test/external/foo/#a"}"##;
        let external = r##"{"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://example.test/external/root.json","$defs":{"resource":{"$id":"foo/","$anchor":"a","type":"string"}}}"##;
        let compiled = compile(
            schema,
            vec![("https://example.test/external/root.json", external)],
        )
        .unwrap();
        assert!(compiled
            .validate(&value("\"ok\""), &mut Context::ordinary())
            .unwrap()
            .is_empty());
        assert!(!compiled
            .validate(&value("1"), &mut Context::ordinary())
            .unwrap()
            .is_empty());
    }

    #[test]
    fn pointer_target_identifier_scopes_following_references_once() {
        let schema = r##"{"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://example.test/root.json","$defs":{"resource":{"$id":"foo/","$defs":{"target":{"$id":"bar/","$ref":"target"}}}},"properties":{"x":{"$ref":"#/$defs/resource/$defs/target"}}}"##;
        let compiled = compile(
            schema,
            vec![
                (
                    "https://example.test/foo/bar/target",
                    r#"{"type":"string"}"#,
                ),
                ("https://example.test/foo/target", r#"{"type":"integer"}"#),
            ],
        )
        .unwrap();
        assert!(compiled
            .validate(&value(r#"{"x":"ok"}"#), &mut Context::ordinary())
            .unwrap()
            .is_empty());
        assert!(!compiled
            .validate(&value(r#"{"x":1}"#), &mut Context::ordinary())
            .unwrap()
            .is_empty());
    }

    #[test]
    fn pointer_entered_dynamic_resource_resets_pointer_scope_at_resource_root() {
        let schema = r##"{"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://example.test/root.json","$defs":{"resource":{"$id":"foo/","$dynamicAnchor":"a","type":"object","properties":{"y":{"$dynamicRef":"#a"}}}},"properties":{"x":{"$ref":"#/$defs/resource"}}}"##;
        let compiled = compile(schema, vec![]).unwrap();
        assert!(compiled
            .validate(&value(r#"{"x":{"y":{}}}"#), &mut Context::ordinary())
            .unwrap()
            .is_empty());
    }
}

#[cfg(test)]
mod draft2020_dynamic_annotation_regressions {
    use super::*;

    fn value(source: &str) -> Value {
        crate::serialization::read_json_value(
            &source.encode_utf16().collect::<Vec<_>>(),
            crate::serialization::Format::Json,
            &mut Context::ordinary(),
        )
        .unwrap()
    }

    fn members(value: &Value) -> &[(Utf16, Value)] {
        match value {
            Value::Object(members) => members,
            _ => panic!("expected object"),
        }
    }

    fn run_cases(file: &str, indices: &[usize], remote: Option<(&str, &str)>) {
        let corpus = value(file);
        let Value::Array(cases) = corpus else {
            panic!("upstream corpus must be an array")
        };
        for index in indices {
            let case = &cases[*index];
            let schema = member(members(case), "schema").unwrap();
            let resources = remote
                .map(|(uri, body)| vec![(Utf16::from(uri), value(body))])
                .unwrap_or_default();
            let compiled = CompiledSchema::compile_consumer(
                schema,
                &SchemaResources { entries: resources },
                false,
                &mut Context::ordinary(),
            )
            .unwrap_or_else(|error| panic!("case {index} failed to compile: {error:?}"));
            let Value::Array(tests) = member(members(case), "tests").unwrap() else {
                panic!("case tests must be an array")
            };
            for (test_index, test) in tests.iter().enumerate() {
                let data = member(members(test), "data").unwrap();
                let expected = matches!(member(members(test), "valid"), Some(Value::Bool(true)));
                let actual = compiled
                    .validate(data, &mut Context::ordinary())
                    .unwrap_or_else(|error| {
                        panic!("case {index} test {test_index} errored: {error:?}")
                    })
                    .is_empty();
                assert_eq!(actual, expected, "case {index} test {test_index}");
            }
        }
    }

    #[test]
    fn draft2020_dynamic_scope_uses_active_resource_anchors() {
        run_cases(
            include_str!("../../../fixtures/json-schema/upstream/draft2020-12/dynamicRef.json"),
            &[3, 5, 11, 12, 14, 15, 16, 20],
            Some((
                "http://localhost:1234/draft2020-12/extendible-dynamic-ref.json",
                include_str!(
                    "../../../fixtures/json-schema/upstream/remotes/draft2020-12/extendible-dynamic-ref.json"
                ),
            )),
        );
    }

    #[test]
    fn draft2020_unevaluated_keywords_receive_dynamic_reference_annotations() {
        run_cases(
            include_str!(
                "../../../fixtures/json-schema/upstream/draft2020-12/unevaluatedItems.json"
            ),
            &[18],
            None,
        );
        run_cases(
            include_str!(
                "../../../fixtures/json-schema/upstream/draft2020-12/unevaluatedProperties.json"
            ),
            &[21],
            None,
        );
    }

    #[test]
    fn python_draft2020_keeps_its_per_node_dynamic_anchor_scope() {
        let schema = value(
            r##"{"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://example.test/root","$dynamicAnchor":"tree","type":"object","properties":{"x":{"$id":"https://example.test/branch","$dynamicRef":"#tree","$defs":{"target":{"$dynamicAnchor":"tree","type":"string"}}}}}"##,
        );
        let mut ctx = Context::ordinary();
        let source = crate::python_value::python_from_core_value(&schema, &mut ctx).unwrap();
        let compiled = CompiledSchema::compile_python_source(
            &source,
            &crate::python_value::PythonSchemaResources::default(),
            false,
            crate::python_regex::PythonReVersion::V3_14,
            &mut ctx,
        )
        .unwrap();
        let instance =
            crate::python_value::python_from_core_value(&value(r#"{"x":"text"}"#), &mut ctx)
                .unwrap();
        // The active outer node anchor rebinds the reference to the root object
        // schema, which cannot validate the property's scalar value.
        assert!(!compiled.validate(&instance, &mut ctx).unwrap().is_empty());
    }

    #[test]
    fn resource_scope_discovers_dynamic_anchor_under_prefix_items() {
        let schema = value(
            r##"{"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://example.test/root","$ref":"base/","$defs":{"base":{"$id":"base/","type":"array","$dynamicRef":"target#a","$defs":{"target":{"$id":"target","$dynamicAnchor":"a"}}}},"prefixItems":[{"$dynamicAnchor":"a","type":"object"}]}"##,
        );
        let compiled = CompiledSchema::compile_consumer(
            &schema,
            &SchemaResources::default(),
            false,
            &mut Context::ordinary(),
        )
        .unwrap();
        // The prefix item itself is a valid object. Its anchor also participates
        // in the outer resource scope and is applied to the root array by the
        // reference in the base resource, making that array invalid.
        assert!(!compiled
            .validate(&value(r#"[{}]"#), &mut Context::ordinary())
            .unwrap()
            .is_empty());
    }

    #[test]
    fn dynamic_resource_root_keeps_normalized_relative_id_provenance() {
        let schema = value(
            r##"{"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://example.test/root/","$ref":"base/","$defs":{"base":{"$id":"base/","$dynamicAnchor":"a","$ref":"leaf","properties":{"x":{"$dynamicRef":"target#a"}},"$defs":{"leaf":{"$id":"leaf"},"target":{"$id":"target","$dynamicAnchor":"a","type":"string"}}}}}"##,
        );
        let compiled = CompiledSchema::compile_consumer(
            &schema,
            &SchemaResources::default(),
            false,
            &mut Context::ordinary(),
        )
        .unwrap();
        assert!(compiled
            .validate(&value(r#"{"x":42}"#), &mut Context::ordinary())
            .unwrap()
            .is_empty());
    }

    #[test]
    fn repeated_anchor_free_resource_evaluation_uses_cached_discovery() {
        let schema = value(
            r##"{"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://example.test/root","$defs":{"empty":{"$id":"https://example.test/empty","type":"object","properties":{"x":{"type":"integer"},"y":{"type":"string"}}}},"$ref":"#/$defs/empty"}"##,
        );
        let compiled = CompiledSchema::compile_consumer(
            &schema,
            &SchemaResources::default(),
            false,
            &mut Context::ordinary(),
        )
        .unwrap();
        let instance = value(r#"{"x":1,"y":"ok"}"#);
        let mut first = Context::ordinary();
        assert!(compiled.validate(&instance, &mut first).unwrap().is_empty());
        let mut second = Context::ordinary();
        assert!(compiled
            .validate(&instance, &mut second)
            .unwrap()
            .is_empty());
        assert!(
            second.charged_work() < first.charged_work(),
            "cached empty discovery should avoid traversing the immutable resource again: first={}, second={}",
            first.charged_work(),
            second.charged_work()
        );

        // Place a cooperative host-work ceiling between cold and warm costs:
        // the identical cold operation must be refused while the warm one fits.
        let ceiling = (first.charged_work() + second.charged_work()) / 2;
        let cold_compiled = CompiledSchema::compile_consumer(
            &schema,
            &SchemaResources::default(),
            false,
            &mut Context::ordinary(),
        )
        .unwrap();
        let mut cold_used = 0u64;
        let mut cold_meter = |amount: usize| {
            if cold_used + amount as u64 > ceiling {
                return Err(EngineError::new(
                    "LIMIT",
                    Utf16::default(),
                    "test work ceiling",
                ));
            }
            cold_used += amount as u64;
            Ok(())
        };
        let mut cold_context = Context::ordinary().with_meter(&mut cold_meter);
        assert!(cold_compiled
            .validate(&instance, &mut cold_context)
            .is_err());
        assert!(cold_context.charged_work() > ceiling);

        let mut warm_used = 0u64;
        let mut warm_meter = |amount: usize| {
            if warm_used + amount as u64 > ceiling {
                return Err(EngineError::new(
                    "LIMIT",
                    Utf16::default(),
                    "test work ceiling",
                ));
            }
            warm_used += amount as u64;
            Ok(())
        };
        let mut warm_context = Context::ordinary().with_meter(&mut warm_meter);
        assert!(compiled
            .validate(&instance, &mut warm_context)
            .unwrap()
            .is_empty());
        assert!(warm_context.charged_work() <= ceiling);
    }

    #[test]
    fn dynamic_anchor_cache_does_not_hold_lock_during_host_callbacks() {
        let schema = value(
            r##"{"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://example.test/root","$dynamicAnchor":"root","type":"object","properties":{"x":{"type":"integer"}}}"##,
        );
        let compiled = CompiledSchema::compile_consumer(
            &schema,
            &SchemaResources::default(),
            false,
            &mut Context::ordinary(),
        )
        .unwrap();
        let instance = value(r#"{"x":1}"#);
        assert!(compiled
            .validate(&instance, &mut Context::ordinary())
            .unwrap()
            .is_empty());

        // Run the nested validation from the cached anchor materialization
        // callback, after cache lookup and with the exact discovered path cost.
        let resource_address = &*compiled.schema as *const Value as usize;
        let expected_anchor_charge = {
            let cache = compiled
                .dynamic_anchor_cache
                .lock()
                .unwrap_or_else(|error| error.into_inner());
            let (name, path, _) = cache
                .get(&resource_address)
                .and_then(|anchors| anchors.first())
                .expect("root dynamic anchor must be cached");
            name.len() + path.len() + 2
        };
        let mut saw_cached_anchor_charge = false;
        let mut cache_lock_was_free = false;
        let mut meter = |amount: usize| {
            if amount == expected_anchor_charge {
                saw_cached_anchor_charge = true;
                cache_lock_was_free = compiled.dynamic_anchor_cache.try_lock().is_ok();
                let mut nested_context = Context::ordinary();
                assert!(compiled
                    .validate(&instance, &mut nested_context)
                    .unwrap()
                    .is_empty());
            }
            Ok(())
        };
        let mut context = Context::ordinary().with_meter(&mut meter);
        assert!(compiled
            .validate(&instance, &mut context)
            .unwrap()
            .is_empty());
        assert!(
            saw_cached_anchor_charge,
            "the cached anchor materialization charge reached the host meter"
        );
        assert!(
            cache_lock_was_free,
            "host callbacks must run after releasing the cache lock"
        );
    }
}

#[cfg(test)]
mod construction_owner_tests {
    use super::*;
    fn typed(kind: &str) -> Value {
        Value::Object(vec![(Utf16::from("type"), Value::string_utf8(kind))])
    }

    #[test]
    fn completed_compile_and_metaschema_sharing_are_local_to_actual_success() {
        let mut ctx = Context::catalog();
        ctx.with_codegen_construction(|ctx| {
            let first = CompiledSchema::compile(&typed("object"), &SchemaResources::default(), ctx).unwrap();
            let state = ctx.schema_construction.as_ref().unwrap().clone();
            assert_eq!(state.borrow().completed.len(), 1);
            let second = CompiledSchema::compile(&typed("object"), &SchemaResources::default(), ctx).unwrap();
            assert_eq!(state.borrow().completed.len(), 1);
            assert!(matches!((&first.resources, &second.resources),
                (SchemaBacking::Shared(a), SchemaBacking::Shared(b)) if Arc::ptr_eq(a,b)));
            let meta = state.borrow().meta_validators[0].2.clone();
            CompiledSchema::compile(&typed("array"), &SchemaResources::default(), ctx).unwrap();
            assert_eq!(state.borrow().meta_validators.len(), 1);
            assert!(Arc::ptr_eq(&meta, &state.borrow().meta_validators[0].2));
            Ok::<(), EngineError>(())
        }).unwrap();
        assert!(ctx.schema_construction.is_none());
        ctx.with_codegen_construction(|ctx| {
            assert!(ctx.schema_construction.as_ref().unwrap().borrow().completed.is_empty());
            Ok::<(), EngineError>(())
        }).unwrap();
    }

    #[test]
    fn invalid_schema_publishes_no_catalogue_or_completed_proof() {
        let mut ctx = Context::catalog();
        ctx.with_codegen_construction(|ctx| {
            let invalid = Value::Object(vec![(Utf16::from("unknown-root"), Value::Bool(true))]);
            assert!(CompiledSchema::compile(&invalid, &SchemaResources::default(), ctx).is_err());
            let state = ctx.schema_construction.as_ref().unwrap().borrow();
            assert!(state.completed.is_empty()); assert!(state.catalogues.is_empty());
            Ok::<(), EngineError>(())
        }).unwrap();
        assert!(ctx.schema_construction.is_none());
    }

    #[test]
    fn metaschema_conversion_precharge_precedes_materializer_and_parser() {
        use std::cell::{Cell, RefCell};
        fn exercise(fixed: bool, deny: bool, source: &str)
            -> (Result<Value, EngineError>, Vec<usize>, bool, bool, u64) {
            let charges = RefCell::new(Vec::new());
            let materialized = Cell::new(false); let parsed = Cell::new(false);
            let mut control = |amount| {
                let mut events = charges.borrow_mut(); events.push(amount);
                if events.len() == 1 {
                    assert_eq!(amount, 1, "construction scope entry must be admitted first");
                    return Ok(());
                }
                if deny {
                    assert_eq!(events.len(), 2, "no callback may follow the targeted denial");
                    assert_eq!(amount, source.len(), "deny the ASCII fixture conversion/parser boundary, not scope entry");
                    return Err(EngineError::new("RESOURCE_LIMIT", Utf16::from("/metaschema-first"), "targeted conversion denial"));
                }
                Ok(())
            };
            let mut ctx = Context::catalog().with_host_control(&mut control);
            let result = ctx.with_codegen_construction(|ctx| {
                assert!(ctx.in_codegen_construction());
                let materialize = |text: &str| {
                    materialized.set(true); text.encode_utf16().collect::<Vec<_>>()
                };
                let parse = |units: &[u16], ctx: &mut Context<'_>| {
                    parsed.set(true);
                    crate::serialization::read_json_value(units, crate::serialization::Format::Json, ctx)
                };
                if fixed { read_retained_metaschema_with(source, ctx, materialize, parse) }
                else {
                    // Exact old ordering at frozen3322: materialize the Vec,
                    // enter the real shared reader, then encounter its charge.
                    let units = materialize(source); parse(&units, ctx)
                }
            });
            assert!(ctx.schema_construction.is_none());
            let total = ctx.charged_work(); drop(ctx);
            let observed = charges.borrow().clone();
            (result, observed, materialized.get(), parsed.get(), total)
        }
        let ascii = "{\"type\":\"object\"}";
        for fixed in [false, true] {
            let (result, charges, materialized, parsed, total) = exercise(fixed, true, ascii);
            let error = result.unwrap_err();
            assert_eq!(charges, vec![1, ascii.len()]);
            assert_eq!(total, 1 + ascii.len() as u64);
            assert_eq!(error.code, "RESOURCE_LIMIT");
            assert_eq!(error.path, Utf16::from("/metaschema-first"));
            assert_eq!(materialized, !fixed, "old allocation order must be discriminated");
            assert_eq!(parsed, !fixed, "fixed denial must occur before even entering the parser");
        }
        for source in ["{}", "\"é😀\""] {
            let old = exercise(false, false, source); let fixed = exercise(true, false, source);
            assert_eq!(old.0.unwrap(), fixed.0.unwrap());
            assert!(old.2 && old.3 && fixed.2 && fixed.3);
            assert_eq!(old.1[0], 1); assert_eq!(fixed.1[0], 1);
            assert_eq!(fixed.1[1], source.len());
            assert_eq!(&fixed.1[2..], &old.1[1..], "all real parser charges must remain independently present");
            assert_eq!(fixed.4, old.4 + source.len() as u64);
        }
    }

    #[test]
    fn terminal_construction_denial_stops_before_reusable_proof() {
        let mut calls = 0;
        let mut stop = |_| { calls += 1; Err(EngineError::new("RESOURCE_LIMIT", Utf16::from("/first"), "first denied")) };
        let mut ctx = Context::catalog().with_host_control(&mut stop);
        let error = ctx.with_codegen_construction(|ctx| CompiledSchema::compile(&typed("object"), &SchemaResources::default(), ctx)).unwrap_err();
        assert!(ctx.schema_construction.is_none());
        assert_eq!(error.code, "RESOURCE_LIMIT"); assert_eq!(error.path, Utf16::from("/first"));
        drop(ctx); assert_eq!(calls, 1);
    }
}

#[cfg(test)]
#[path = "schema_construction_tests.rs"]
mod construction_independent_tests;

#[cfg(test)]
#[path = "schema_budget_reduction_tests.rs"]
mod schema_budget_reduction_tests;

#[cfg(test)]
#[path="schema_encoded_source_independent_tests.rs"]
mod encoded_source_independent_tests;

#[cfg(test)]
#[path = "schema_evaluation_paths_bridge_independent_tests.rs"]
mod evaluation_paths_bridge_independent_tests;

#[cfg(test)]
#[path = "schema_path_facts_independent_tests.rs"]
mod path_facts_independent_tests;

#[cfg(test)]
#[path="schema_codegen_catalogue_independent_tests.rs"]
mod codegen_catalogue_independent_tests;

#[cfg(test)]
#[path = "schema_scoped_preflight_path_independent_tests.rs"]
mod scoped_preflight_path_independent_tests;
