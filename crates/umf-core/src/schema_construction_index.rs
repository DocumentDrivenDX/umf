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

// PTH1 private path custody. Fields can only be minted by the actual seed and
// append producers below. Syntax is not schema/selector admission authority.
#[cfg(test)]
thread_local! { static PATH_OBSERVER:std::cell::RefCell<Option<Box<dyn FnMut(&'static str)>>> = std::cell::RefCell::new(None); }
#[cfg(test)]
pub(super) fn observe_paths<T>(observer:Box<dyn FnMut(&'static str)>,operation:impl FnOnce()->T)->T {
    struct Restore(Option<Box<dyn FnMut(&'static str)>>);
    impl Drop for Restore {fn drop(&mut self){PATH_OBSERVER.with(|s|*s.borrow_mut()=self.0.take());}}
    let prior=PATH_OBSERVER.with(|s|s.borrow_mut().replace(observer));let _restore=Restore(prior);operation()
}
fn path_event(event:&'static str) {
    #[cfg(test)]
    {let observer=PATH_OBSERVER.with(|s|s.borrow_mut().take());if let Some(mut observer)=observer {
        struct Restore(Option<Box<dyn FnMut(&'static str)>>);
        impl Drop for Restore {fn drop(&mut self){PATH_OBSERVER.with(|s|*s.borrow_mut()=self.0.take());}}
        let mut restore=Restore(Some(observer));if let Some(observer)=restore.0.as_mut(){observer(event);}
    }}
    #[cfg(not(test))]let _=event;
}
/// cfg(test) consumers can observe effects made by the real scoped caller.
/// In production this compiles to the same inert event sink as path_event.
#[cfg(test)]
pub(super) fn scoped_effect_event(event:&'static str) { path_event(event); }
#[cfg(test)]
type PathCallObserver=Box<dyn FnMut(&'static str,&CompiledSchema,&CarriedPath)>;
#[cfg(test)]
type ScopedPathCallObserver=Box<dyn FnMut(&'static str,&CompiledSchema,&ScopedPreflightPath)>;
#[cfg(test)]
thread_local! {static PATH_CALL_OBSERVER:std::cell::RefCell<Option<PathCallObserver>>=std::cell::RefCell::new(None);}
#[cfg(test)]
thread_local! {static SCOPED_PATH_CALL_OBSERVER:std::cell::RefCell<Option<ScopedPathCallObserver>>=std::cell::RefCell::new(None);}
#[cfg(test)]
pub(super) fn observe_path_calls<T>(observer:PathCallObserver,operation:impl FnOnce()->T)->T {
    struct Restore(Option<PathCallObserver>);
    impl Drop for Restore{fn drop(&mut self){PATH_CALL_OBSERVER.with(|s|*s.borrow_mut()=self.0.take());}}
    let prior=PATH_CALL_OBSERVER.with(|s|s.borrow_mut().replace(observer));let _restore=Restore(prior);operation()
}
pub(super) fn path_call(site:&'static str,owner:&CompiledSchema,path:&CarriedPath) {
    #[cfg(test)]
    {let observer=PATH_CALL_OBSERVER.with(|s|s.borrow_mut().take());if let Some(observer)=observer {
        struct Restore(Option<PathCallObserver>);
        impl Drop for Restore{fn drop(&mut self){PATH_CALL_OBSERVER.with(|s|*s.borrow_mut()=self.0.take());}}
        let mut restore=Restore(Some(observer));if let Some(observer)=restore.0.as_mut(){observer(site,owner,path);}
    }}
    #[cfg(not(test))]let _=(site,owner,path);
}
#[cfg(test)]
pub(super) fn observe_scoped_path_calls<T>(observer:ScopedPathCallObserver,operation:impl FnOnce()->T)->T{
    struct Restore(Option<ScopedPathCallObserver>);
    impl Drop for Restore{fn drop(&mut self){SCOPED_PATH_CALL_OBSERVER.with(|s|*s.borrow_mut()=self.0.take());}}
    let prior=SCOPED_PATH_CALL_OBSERVER.with(|s|s.borrow_mut().replace(observer));let _restore=Restore(prior);operation()
}
pub(super) fn scoped_path_call(site:&'static str,owner:&CompiledSchema,path:&ScopedPreflightPath){
    #[cfg(test)]
    {let observer=SCOPED_PATH_CALL_OBSERVER.with(|s|s.borrow_mut().take());if let Some(observer)=observer{
        struct Restore(Option<ScopedPathCallObserver>);
        impl Drop for Restore{fn drop(&mut self){SCOPED_PATH_CALL_OBSERVER.with(|s|*s.borrow_mut()=self.0.take());}}
        let mut restore=Restore(Some(observer));if let Some(observer)=restore.0.as_mut(){observer(site,owner,path);}
    }}
    #[cfg(not(test))]let _=(site,owner,path);
}

fn path_words<T>() -> usize { std::mem::size_of::<T>().div_ceil(std::mem::size_of::<usize>()) }
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum PathSelector { Policy, Common, Dynamic }
impl PathSelector { fn slot(self)->usize { match self {Self::Policy=>0,Self::Common=>1,Self::Dynamic=>2} } }
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum PathSelection { Pending, Known(Option<usize>) }
#[derive(Debug)]
struct OriginBinding {
    index: Arc<ColdResourceIndex>,
    lineage: Arc<()>,
    limits: crate::context::Limits,
    profile: crate::context::ResourceProfile,
    dialect:SchemaDialect, strict:bool, policy:KeywordPolicy, resolved:bool,
    selections: [PathSelection;3],
    frame: Option<(usize,bool)>,
}
#[derive(Debug, Default)]
struct OriginState { epoch:u64, binding:Option<OriginBinding> }
#[derive(Debug)]
struct PathSyntax {
    first_hash:Option<usize>,
    surrogate:bool,
    origin:std::rc::Rc<std::cell::RefCell<OriginState>>,
}
#[derive(Debug)]
pub(crate) struct CarriedPath { text:Utf16, syntax:Option<PathSyntax> }

/// Invocation-local mutable path custody for indexed construction preflight.
/// Evaluator paths continue to use immutable `CarriedPath` as their oracle.
pub(super) struct ScopedPreflightPath { text:Utf16, first_hash:Option<usize>, surrogate:bool, origin:std::rc::Rc<std::cell::RefCell<OriginState>>, poisoned:bool }
pub(super) struct ScopedPreflightMark { length:usize, first_hash:Option<usize>, surrogate:bool, origin:std::rc::Rc<std::cell::RefCell<OriginState>> }
#[cfg(test)]
#[derive(Debug,PartialEq,Eq)]
pub(super) struct ScopedPreflightObservation { pub text:Vec<u16>,pub length:usize,pub capacity:usize,pub owned:bool,pub first_hash:Option<usize>,pub surrogate:bool,pub poisoned:bool,pub origin_epoch:u64,pub has_origin_binding:bool,pub selections:[Option<Option<usize>>;3] }
impl ScopedPreflightPath {
    pub(super) fn new(text:&Utf16,ctx:&mut Context<'_>)->Result<Self,EngineError>{
        ctx.charge_work(text.clone_work().saturating_add(text.len().saturating_mul(4)).saturating_add(CarriedPath::origin_work()).saturating_add(2*path_words::<Utf16>()+path_words::<Self>()+path_words::<OriginState>()+8),Utf16::default())?;
        let mut first_hash=None;let mut surrogate=false;
        for (i,u) in text.units().iter().enumerate(){if first_hash.is_none()&&*u==35{first_hash=Some(i);}surrogate|=(0xd800..=0xdfff).contains(u);}
        Ok(Self{text:text.clone(),first_hash,surrogate,origin:std::rc::Rc::new(std::cell::RefCell::new(OriginState::default())),poisoned:false})
    }
    pub(super) fn text(&self)->&Utf16{&self.text}
    pub(super) fn charge_current_path(&mut self,amount:usize,ctx:&mut Context<'_>)->Result<(),EngineError>{
        if self.poisoned{return Err(EngineError::new("LIMIT",Utf16::default(),"Scoped preflight path is poisoned"));}
        let guarded=amount.saturating_add(path_words::<ScopedPreflightPath>()+2);
        match std::panic::catch_unwind(std::panic::AssertUnwindSafe(||ctx.charge_work_with_path(guarded,&mut self.text))){
            Ok(Ok(()))=>Ok(()),Ok(Err(error))=>{self.poisoned=true;Err(error)},Err(payload)=>{self.poisoned=true;std::panic::resume_unwind(payload)}
        }
    }
    pub(super) fn diagnostic_snapshot(&mut self,ctx:&mut Context<'_>)->Result<Utf16,EngineError>{
        if self.poisoned{return Err(EngineError::new("LIMIT",Utf16::default(),"Scoped preflight path is poisoned"));}
        let length=self.text.len();
        let bytes=length.checked_mul(std::mem::size_of::<u16>()).ok_or_else(||EngineError::new("LIMIT",Utf16::default(),"Scoped diagnostic path size overflow"))?;
        let word=std::mem::size_of::<usize>();
        let fee=length.saturating_add(bytes.div_ceil(word))
            .saturating_add(std::mem::size_of::<Vec<u16>>().div_ceil(word))
            .saturating_add(std::mem::size_of::<std::sync::Arc<Vec<u16>>>().div_ceil(word))
            .saturating_add(std::mem::size_of::<Utf16>().div_ceil(word)+6);
        match std::panic::catch_unwind(std::panic::AssertUnwindSafe(||ctx.charge_work(fee,Utf16::default()))){
            Ok(Ok(()))=>(),Ok(Err(error))=>{self.poisoned=true;return Err(error);},Err(payload)=>{self.poisoned=true;std::panic::resume_unwind(payload);}
        }
        match std::panic::catch_unwind(std::panic::AssertUnwindSafe(||Utf16::shared(self.text.units().to_vec()))){
            Ok(snapshot)=>Ok(snapshot),Err(payload)=>{self.poisoned=true;std::panic::resume_unwind(payload)}
        }
    }
    #[cfg(test)]
    pub(super) fn observe(&self)->ScopedPreflightObservation{
        let (owned,capacity)=self.text.preflight_storage_observation();
        let (origin_epoch,has_origin_binding,selections)={let state=self.origin.borrow();let selections=state.binding.as_ref().map_or([None;3],|b|b.selections.map(|s|match s{PathSelection::Pending=>None,PathSelection::Known(v)=>Some(v)}));(state.epoch,state.binding.is_some(),selections)};
        ScopedPreflightObservation{text:self.text.units().to_vec(),length:self.text.len(),capacity,owned,first_hash:self.first_hash,surrogate:self.surrogate,poisoned:self.poisoned,origin_epoch,has_origin_binding,selections}
    }
    #[cfg(test)]
    pub(super) fn mark_shares_origin(&self,mark:&ScopedPreflightMark)->bool{std::rc::Rc::ptr_eq(&self.origin,&mark.origin)}
    pub(super) fn mark(&mut self,ctx:&mut Context<'_>)->Result<ScopedPreflightMark,EngineError>{
        if self.poisoned{return Err(EngineError::new("LIMIT",Utf16::default(),"Scoped preflight path is poisoned"));}
        // Includes one reserved local cleanup unit, usable without callbacks
        // if recursive work or restoration admission refuses.
        let admission=std::panic::catch_unwind(std::panic::AssertUnwindSafe(||ctx.charge_work(path_words::<ScopedPreflightMark>()+path_words::<ScopedPreflightPath>()+path_words::<std::rc::Rc<std::cell::RefCell<OriginState>>>()+9,Utf16::default())));
        match admission{Ok(Ok(()))=>(),Ok(Err(error))=>{self.poisoned=true;return Err(error);},Err(payload)=>{self.poisoned=true;std::panic::resume_unwind(payload);}}
        Ok(ScopedPreflightMark{length:self.text.len(),first_hash:self.first_hash,surrogate:self.surrogate,origin:std::rc::Rc::clone(&self.origin)})
    }
    pub(super) fn append(&mut self,segment:&Utf16,kind:PathKind,ctx:&mut Context<'_>)->Result<(),EngineError>{
        if self.poisoned{return Err(EngineError::new("LIMIT",Utf16::default(),"Scoped preflight path is poisoned"));}
        #[cfg(test)]
        { self.append_observed_caught(segment,kind,ctx,&mut scoped_effect_event) }
        #[cfg(not(test))]
        { self.append_observed_caught(segment,kind,ctx,&mut |_|{}) }
    }
    #[cfg(test)]
    pub(super) fn append_with_events(&mut self,segment:&Utf16,kind:PathKind,ctx:&mut Context<'_>,event:&mut dyn FnMut(&'static str))->Result<(),EngineError>{
        if self.poisoned{return Err(EngineError::new("LIMIT",Utf16::default(),"Scoped preflight path is poisoned"));}
        self.append_observed_caught(segment,kind,ctx,event)
    }
    fn append_observed_caught(&mut self,segment:&Utf16,kind:PathKind,ctx:&mut Context<'_>,event:&mut dyn FnMut(&'static str))->Result<(),EngineError>{
        match std::panic::catch_unwind(std::panic::AssertUnwindSafe(||self.append_observed(segment,kind,ctx,event))){
            Ok(Ok(()))=>Ok(()),Ok(Err(error))=>{self.poisoned=true;Err(error)},Err(payload)=>{self.poisoned=true;std::panic::resume_unwind(payload)}
        }
    }
    pub(super) fn append_observed(&mut self,segment:&Utf16,kind:PathKind,ctx:&mut Context<'_>,event:&mut dyn FnMut(&'static str))->Result<(),EngineError>{
        ctx.charge_work(2*path_words::<PathSyntax>()+path_words::<ScopedPreflightPath>()+8,Utf16::default())?;
        event("sp1-metadata-admission-complete-before-read");
        let slash=kind==PathKind::InstancePointer||self.text.units().last()!=Some(&47);
        let escape=kind!=PathKind::RawSchemaStep;
        ctx.charge_work(segment.len().saturating_mul(5).saturating_add(8),Utf16::default())?;
        let mut escaped=0usize;let mut first_hash=self.first_hash;let mut surrogate=self.surrogate;
        for &u in segment.units(){if first_hash.is_none()&&u==35{first_hash=self.text.len().checked_add(usize::from(slash)).and_then(|n|n.checked_add(escaped));}surrogate|=(0xd800..=0xdfff).contains(&u);escaped=escaped.saturating_add(if escape&&(u==47||u==126){2}else{1});}
        let new_origin=self.first_hash.is_none()&&first_hash.is_some();
        ctx.charge_work(if new_origin{CarriedPath::origin_work()+path_words::<OriginState>()+4}else{0},Utf16::default())?;
        event("sp1-suffix-scan-and-metadata-admission-complete-before-buffer-effect");
        self.text.push_owned_preflight_segment_observed(segment,slash,escape,ctx,event)?;
        if new_origin{self.origin=std::rc::Rc::new(std::cell::RefCell::new(OriginState::default()));}
        self.first_hash=first_hash;self.surrogate=surrogate;event("sp1-buffer-after-append");Ok(())
    }
    pub(super) fn restore(&mut self,mark:ScopedPreflightMark,ctx:&mut Context<'_>)->Result<(),EngineError>{
        self.restore_observed(mark,ctx,&mut |_|{})
    }
    #[cfg(test)]
    pub(super) fn restore_with_events(&mut self,mark:ScopedPreflightMark,ctx:&mut Context<'_>,event:&mut dyn FnMut(&'static str))->Result<(),EngineError>{
        self.restore_observed(mark,ctx,event)
    }
    fn restore_observed(&mut self,mark:ScopedPreflightMark,ctx:&mut Context<'_>,event:&mut dyn FnMut(&'static str))->Result<(),EngineError>{
        if self.poisoned {
            self.restore_after_failure(mark);
            return Err(EngineError::new("LIMIT",Utf16::default(),"Scoped preflight path is poisoned"));
        }
        let cleanup=path_words::<ScopedPreflightMark>()+path_words::<std::rc::Rc<std::cell::RefCell<OriginState>>>()+5;
        if let Err(payload)=std::panic::catch_unwind(std::panic::AssertUnwindSafe(||event("sp1-before-restoration-admission"))){self.restore_after_failure(mark);std::panic::resume_unwind(payload);}
        let admission=std::panic::catch_unwind(std::panic::AssertUnwindSafe(||ctx.charge_work(cleanup,Utf16::default())));
        let admission=match admission {
            Ok(Ok(()))=>Ok(()),
            Ok(Err(error))=>{self.restore_after_failure(mark);return Err(error);},
            Err(payload)=>{self.restore_after_failure(mark);std::panic::resume_unwind(payload);}
        };
        self.text.truncate_owned_preflight_path(mark.length);
        self.first_hash=mark.first_hash;self.surrogate=mark.surrogate;self.origin=mark.origin;
        if let Err(payload)=std::panic::catch_unwind(std::panic::AssertUnwindSafe(||event("sp1-effect-restoration-after-admission"))){self.poisoned=true;std::panic::resume_unwind(payload);}
        admission
    }
    pub(super) fn restore_after_failure(&mut self,mark:ScopedPreflightMark){
        self.text.truncate_owned_preflight_path(mark.length);
        self.first_hash=mark.first_hash;self.surrogate=mark.surrogate;self.origin=mark.origin;self.poisoned=true;
    }
}
impl std::ops::Deref for ScopedPreflightPath { type Target=Utf16; fn deref(&self)->&Utf16{&self.text} }
impl std::ops::Deref for CarriedPath { type Target=Utf16; fn deref(&self)->&Utf16 { &self.text } }
impl CarriedPath {
    pub(super) fn text(&self)->&Utf16 { &self.text }
    // Plain paths carry no optional proof. The enclosing pair pays its wrapper.
    pub(super) fn plain(text:Utf16)->Self { Self{text,syntax:None} }
    fn origin_work()->usize { 2*(path_words::<std::cell::RefCell<OriginState>>()+2)+4 }
    pub(super) fn seed(text:Utf16,ctx:&mut Context<'_>)->Result<Self,EngineError> {
        Self::seed_observed(text,ctx,&mut |_|{})
    }
    fn seed_observed(text:Utf16,ctx:&mut Context<'_>,event:&mut dyn FnMut(&'static str))->Result<Self,EngineError> {
        ctx.charge_work(text.len().saturating_mul(4).saturating_add(Self::origin_work())
            .saturating_add(2*path_words::<Self>()+path_words::<PathSyntax>()+8),Utf16::default())?;
        event("pth-seed-scan");path_event("pth-seed-scan");
        let mut first_hash=None;let mut surrogate=false;
        for (i,u) in text.units().iter().enumerate() {
            if first_hash.is_none() && *u==35 {first_hash=Some(i);}
            surrogate|=(0xd800..=0xdfff).contains(u);
        }
        event("pth-seed-publication");path_event("pth-seed-publication");
        Ok(Self{text,syntax:Some(PathSyntax{first_hash,surrogate,origin:std::rc::Rc::new(std::cell::RefCell::new(OriginState::default()))})})
    }
    // All clones are immediately preceded by admission, including wrapper,
    // actual text clone, Rc reference/count movement and eventual drops.
    pub(super) fn clone_work(&self)->usize {
        self.text.clone_work().saturating_add(2*path_words::<Self>()+path_words::<PathSyntax>()+6)
    }
    pub(super) fn clone_admitted(&self)->Self {
        Self{text:self.text.clone(),syntax:self.syntax.as_ref().map(|s|PathSyntax{first_hash:s.first_hash,surrogate:s.surrogate,origin:std::rc::Rc::clone(&s.origin)})}
    }
    pub(super) fn clone_with_context(&self,ctx:&mut Context<'_>)->Result<Self,EngineError> {
        ctx.charge_work(self.clone_work(),Utf16::default())?;Ok(self.clone_admitted())
    }
    pub(super) fn append(&self,segment:&Utf16,kind:PathKind,ctx:&mut Context<'_>)->Result<Self,EngineError> {
        self.append_observed(segment,kind,ctx,2*path_words::<Vec<u16>>()+path_words::<Utf16>()+path_words::<Self>()+12,&mut |_|{})
    }
    // The producer performs the exact original spelling operation. extra is
    // only the enclosing producer's existing paid wrapper/guard work, not a
    // caller-supplied claim about syntax, origin, admission or eligibility.
    pub(super) fn append_observed(&self,segment:&Utf16,kind:PathKind,ctx:&mut Context<'_>,extra:usize,event:&mut dyn FnMut(&'static str))->Result<Self,EngineError> {
        ctx.charge_work(2*path_words::<PathSyntax>()+8,Utf16::default())?;
        let slash=usize::from(kind==PathKind::InstancePointer || self.text.units().last()!=Some(&47));
        // The old suffix/escape scan and added syntax tests are admitted before
        // either read; no full parent scan is performed here.
        ctx.charge_work(segment.len().saturating_mul(5).saturating_add(8),Utf16::default())?;
        event("path-suffix-scan");path_event("pth-append-suffix");
        let mut escaped=0usize;
        let mut first_hash=self.syntax.as_ref().and_then(|s|s.first_hash);
        let mut surrogate=self.syntax.as_ref().is_some_and(|s|s.surrogate);
        for &u in segment.units() {
            if first_hash.is_none() && u==35 {
                first_hash=self.text.len().checked_add(slash).and_then(|n|n.checked_add(escaped));
            }
            surrogate|=(0xd800..=0xdfff).contains(&u);
            escaped=escaped.saturating_add(if kind!=PathKind::RawSchemaStep && (u==47||u==126){2}else{1});
        }
        let length=self.text.len().checked_add(slash).and_then(|n|n.checked_add(escaped))
            .ok_or_else(||EngineError::new("LIMIT",Utf16::default(),"Evaluation path size overflow"))?;
        let allocation=length.checked_mul(std::mem::size_of::<u16>())
            .ok_or_else(||EngineError::new("LIMIT",Utf16::default(),"Evaluation path allocation overflow"))?
            .div_ceil(std::mem::size_of::<usize>());
        let new_origin=self.syntax.as_ref().is_some_and(|s|s.first_hash.is_none() && first_hash.is_some());
        let fee=allocation.saturating_add(self.text.len()).saturating_add(segment.len()).saturating_add(escaped).saturating_add(slash)
            .saturating_add(extra).saturating_add(2*path_words::<Self>()+path_words::<PathSyntax>()+10)
            .saturating_add(if new_origin{Self::origin_work()}else{0});
        ctx.charge_work(fee,Utf16::default())?;
        event("path-output-allocation-and-write");path_event("pth-append-output");
        let mut out=Vec::with_capacity(length);out.extend_from_slice(self.text.units());if slash==1{out.push(47);}
        for &u in segment.units() {if kind==PathKind::RawSchemaStep {out.push(u);}else{match u {126=>out.extend_from_slice(&[126,48]),47=>out.extend_from_slice(&[126,49]),u=>out.push(u)}}}
        let syntax=self.syntax.as_ref().map(|s|PathSyntax{first_hash,surrogate,origin:if new_origin {std::rc::Rc::new(std::cell::RefCell::new(OriginState::default()))}else{std::rc::Rc::clone(&s.origin)}});
        event("path-output-move-to-shared");
        Ok(Self{text:Utf16::shared(out),syntax})
    }
    pub(super) fn resource_prefix(&self,ctx:&mut Context<'_>)->Result<Utf16,EngineError> {
        ctx.charge_work(path_words::<PathSyntax>()+3,Utf16::default())?;
        let end=if let Some(syntax)=&self.syntax {syntax.first_hash.unwrap_or(self.text.len())}else{
            ctx.charge_work(self.text.len().saturating_add(1),Utf16::default())?;
            self.text.units().iter().position(|u|*u==35).unwrap_or(self.text.len())
        };
        let length=end.checked_add(1).ok_or_else(||EngineError::new("LIMIT",Utf16::default(),"Evaluation path size overflow"))?;
        let allocation=length.checked_mul(std::mem::size_of::<u16>()).ok_or_else(||EngineError::new("LIMIT",Utf16::default(),"Evaluation path allocation overflow"))?.div_ceil(std::mem::size_of::<usize>());
        ctx.charge_work(end.saturating_add(allocation).saturating_add(path_words::<Vec<u16>>()+path_words::<Utf16>()+4),Utf16::default())?;
        path_event("pth-prefix-output");
        let mut units=Vec::with_capacity(length);units.extend_from_slice(&self.text.units()[..end]);units.push(35);Ok(Utf16::new(units))
    }
    #[cfg(test)]
    pub(super) fn syntax_for_test(&self)->Option<(Option<usize>,bool)> {
        self.syntax.as_ref().map(|s|(s.first_hash,s.surrogate))
    }
    #[cfg(test)]
    pub(super) fn selections_for_test(&self)->Option<[Option<Option<usize>>;3]> {
        let s=self.syntax.as_ref()?;let state=s.origin.borrow();let b=state.binding.as_ref()?;
        Some(b.selections.map(|s|match s {PathSelection::Pending=>None,PathSelection::Known(value)=>Some(value)}))
    }
    #[cfg(test)]
    pub(super) fn seed_for_test(text:Utf16,ctx:&mut Context<'_>,event:&mut dyn FnMut(&'static str))->Result<Self,EngineError> {Self::seed_observed(text,ctx,event)}
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
    pub(super) fn select_scoped(self:&Arc<Self>,owner:&CompiledSchema,path:&mut ScopedPreflightPath,selector:PathSelector,ctx:&mut Context<'_>)->Result<Option<usize>,EngineError>{
        if path.poisoned{return Err(EngineError::new("LIMIT",Utf16::default(),"Scoped preflight path is poisoned"));}
        let outcome=std::panic::catch_unwind(std::panic::AssertUnwindSafe(||self.select_scoped_inner(owner,path,selector,ctx)));
        match outcome{Err(payload)=>{path.poisoned=true;std::panic::resume_unwind(payload)},Ok(Err(error))=>{path.poisoned=true;Err(error)},Ok(Ok(value))=>Ok(value)}
    }
    fn select_scoped_inner(self:&Arc<Self>,owner:&CompiledSchema,path:&ScopedPreflightPath,selector:PathSelector,ctx:&mut Context<'_>)->Result<Option<usize>,EngineError>{
        if path.poisoned{return Err(EngineError::new("LIMIT",Utf16::default(),"Scoped preflight path is poisoned"));}
        path_event("pth-selector-entry");
        ctx.charge_work(path_words::<OriginState>()+path_words::<OriginBinding>()+path_words::<crate::context::Limits>()+18,Utf16::default())?;
        let generic=|ctx:&mut Context<'_>|match selector{PathSelector::Policy=>self.policy_path(path.text(),ctx),PathSelector::Common=>self.for_path(path.text(),ctx),PathSelector::Dynamic=>self.dynamic_path(path.text(),ctx)};
        let Some(lineage)=&owner.owner_lineage else{return generic(ctx);};
        if !matches!(owner.regex_profile,RegexProfile::Ecma262Unicode)||!owner.cold_resource_index.as_ref().is_some_and(|actual|Arc::ptr_eq(actual,self)){return generic(ctx);}
        if path.surrogate{return Ok(None);}let Some(end)=path.first_hash else{return Ok(None);};let slot=selector.slot();
        let(epoch,prior,foreign)={let state=path.origin.borrow();let foreign=state.binding.as_ref().is_some_and(|b|!Arc::ptr_eq(&b.index,self)||!Arc::ptr_eq(&b.lineage,lineage)||b.limits!=ctx.limits()||b.profile!=ctx.profile()||b.dialect!=owner.dialect||b.strict!=owner.strict||b.policy!=owner.root_keyword_policy||b.resolved!=owner.resolve_references_at_compile);(state.epoch,state.binding.as_ref().map(|b|b.selections[slot]),foreign)};
        if foreign{return generic(ctx);}if let Some(PathSelection::Known(value))=prior{path_event("pth-selector-hit");return Ok(value);}
        path_event("pth-selector-original-read");
        let value=if end==0{Some(0)}else{self.lookup_map(match selector{PathSelector::Policy=>&self.policy_roots,PathSelector::Common=>&self.common,PathSelector::Dynamic=>&self.dynamic_roots},&path.text.units()[..end],ctx)?};
        ctx.charge_work(2*path_words::<OriginBinding>()+path_words::<OriginState>()+path_words::<crate::context::Limits>()+14,Utf16::default())?;
        path_event("pth-selector-publication");
        let mut state=path.origin.borrow_mut();if state.epoch==epoch {if let Some(next)=state.epoch.checked_add(1){let binding=state.binding.get_or_insert_with(||OriginBinding{index:Arc::clone(self),lineage:Arc::clone(lineage),limits:ctx.limits(),profile:ctx.profile(),dialect:owner.dialect,strict:owner.strict,policy:owner.root_keyword_policy,resolved:owner.resolve_references_at_compile,selections:[PathSelection::Pending;3],frame:None});binding.selections[slot]=PathSelection::Known(value);state.epoch=next;}}
        Ok(value)
    }
    pub(super) fn select_carried(self:&Arc<Self>,owner:&CompiledSchema,path:&CarriedPath,selector:PathSelector,ctx:&mut Context<'_>)->Result<Option<usize>,EngineError> {
        path_call("pth-selector-consumer",owner,path);
        path_event("pth-selector-entry");
        ctx.charge_work(path_words::<OriginState>()+path_words::<OriginBinding>()+path_words::<crate::context::Limits>()+18,Utf16::default())?;
        let generic=|ctx:&mut Context<'_>|match selector {
            PathSelector::Policy=>self.policy_path(path.text(),ctx),
            PathSelector::Common=>self.for_path(path.text(),ctx),
            PathSelector::Dynamic=>self.dynamic_path(path.text(),ctx),
        };
        let Some(syntax)=&path.syntax else{return generic(ctx);};
        let Some(lineage)=&owner.owner_lineage else{return generic(ctx);};
        if !matches!(owner.regex_profile,RegexProfile::Ecma262Unicode) || !owner.cold_resource_index.as_ref().is_some_and(|actual|Arc::ptr_eq(actual,self)) {return generic(ctx);}
        if syntax.surrogate {return Ok(None);}
        let Some(end)=syntax.first_hash else{return Ok(None);};
        let slot=selector.slot();
        let(epoch,prior,foreign)={let state=syntax.origin.borrow();
            let foreign=state.binding.as_ref().is_some_and(|b|!Arc::ptr_eq(&b.index,self)||!Arc::ptr_eq(&b.lineage,lineage)||b.limits!=ctx.limits()||b.profile!=ctx.profile()||b.dialect!=owner.dialect||b.strict!=owner.strict||b.policy!=owner.root_keyword_policy||b.resolved!=owner.resolve_references_at_compile);
            (state.epoch,state.binding.as_ref().map(|b|b.selections[slot]),foreign)};
        if foreign {return generic(ctx);}
        if let Some(PathSelection::Known(value))=prior {path_event("pth-selector-hit");return Ok(value);}
        path_event("pth-selector-original-read");
        let value=if end==0 {Some(0)} else {self.lookup_map(match selector {PathSelector::Policy=>&self.policy_roots,PathSelector::Common=>&self.common,PathSelector::Dynamic=>&self.dynamic_roots},&path.text.units()[..end],ctx)?};
        ctx.charge_work(2*path_words::<OriginBinding>()+path_words::<OriginState>()+path_words::<crate::context::Limits>()+14,Utf16::default())?;
        path_event("pth-selector-publication");
        let mut state=syntax.origin.borrow_mut();
        if state.epoch==epoch {
            if let Some(next)=state.epoch.checked_add(1) {
                let binding=state.binding.get_or_insert_with(||OriginBinding{index:Arc::clone(self),lineage:Arc::clone(lineage),limits:ctx.limits(),profile:ctx.profile(),dialect:owner.dialect,strict:owner.strict,policy:owner.root_keyword_policy,resolved:owner.resolve_references_at_compile,selections:[PathSelection::Pending;3],frame:None});
                // The callbacks above held no state borrow. An unchanged epoch
                // proves no reentrant publication replaced the checked binding.
                binding.selections[slot]=PathSelection::Known(value);state.epoch=next;
            }
        }
        Ok(value)
    }

    pub(super) fn matches_frame_carried(self:&Arc<Self>,owner:&CompiledSchema,ordinal:usize,path:&CarriedPath,ctx:&mut Context<'_>)->Result<bool,EngineError> {
        ctx.charge_work(path_words::<OriginState>()+path_words::<OriginBinding>()+path_words::<crate::context::Limits>()+18,Utf16::default())?;
        let Some(syntax)=&path.syntax else{return self.matches_frame(ordinal,path.text(),ctx);};
        let Some(lineage)=&owner.owner_lineage else{return self.matches_frame(ordinal,path.text(),ctx);};
        if !matches!(owner.regex_profile,RegexProfile::Ecma262Unicode) || !owner.cold_resource_index.as_ref().is_some_and(|actual|Arc::ptr_eq(actual,self)) {return self.matches_frame(ordinal,path.text(),ctx);}
        if syntax.surrogate || syntax.first_hash.is_none() {return Ok(false);}
        let (epoch,prior,foreign)={let state=syntax.origin.borrow();
            (state.epoch,state.binding.as_ref().and_then(|b|b.frame),state.binding.as_ref().is_some_and(|b|!Arc::ptr_eq(&b.index,self)||!Arc::ptr_eq(&b.lineage,lineage)||b.limits!=ctx.limits()||b.profile!=ctx.profile()||b.dialect!=owner.dialect||b.strict!=owner.strict||b.policy!=owner.root_keyword_policy||b.resolved!=owner.resolve_references_at_compile))};
        if foreign {return self.matches_frame(ordinal,path.text(),ctx);}
        if let Some((root,value))=prior {if root==ordinal {path_event("pth-frame-hit");return Ok(value);}}
        ctx.charge_work(4,Utf16::default())?;
        let desc=&self.roots[ordinal];
        let value=if !desc.frame_safe {false} else {
            ctx.charge_work(desc.uri.len().saturating_add(3),Utf16::default())?;
            syntax.first_hash==Some(desc.uri.len()) && path.text.units().starts_with(desc.uri.units())
        };
        ctx.charge_work(2*path_words::<OriginBinding>()+path_words::<OriginState>()+path_words::<crate::context::Limits>()+14,Utf16::default())?;
        path_event("pth-frame-publication");
        let mut state=syntax.origin.borrow_mut();
        if state.epoch==epoch {if let Some(next)=state.epoch.checked_add(1) {
            let binding=state.binding.get_or_insert_with(||OriginBinding{index:Arc::clone(self),lineage:Arc::clone(lineage),limits:ctx.limits(),profile:ctx.profile(),dialect:owner.dialect,strict:owner.strict,policy:owner.root_keyword_policy,resolved:owner.resolve_references_at_compile,selections:[PathSelection::Pending;3],frame:None});
            binding.frame=Some((ordinal,value));state.epoch=next;
        }}
        Ok(value)
    }
    pub(super) fn enter_anchors_carried(&self,owner:&CompiledSchema,ordinal:usize,path:&CarriedPath,evaluated:&mut Evaluated,ctx:&mut Context<'_>)->Result<bool,EngineError> {
        ctx.charge_work(path_words::<PathSyntax>()+3,Utf16::default())?;
        path_call("pth-anchor-consumer",owner,path);
        self.enter_anchors_impl(owner,ordinal,path.text(),evaluated,ctx,path.syntax.as_ref().map(|s|s.first_hash))
    }

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
        self.enter_anchors_impl(owner,ordinal,path,evaluated,ctx,None)
    }
    fn enter_anchors_impl(&self,owner:&CompiledSchema,ordinal:usize,path:&Utf16,evaluated:&mut Evaluated,ctx:&mut Context<'_>,first_hash:Option<Option<usize>>)->Result<bool,EngineError> {
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
        let end=if let Some(first)=first_hash {
            ctx.charge_work(3,Utf16::default())?;
            first.map_or(0,|i|i+1)
        } else {
            ctx.charge_work(path.len(),Utf16::default())?;
            path.units().iter().position(|u|*u==35).map_or(0,|i|i+1)
        };
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
        let before = &*owner.schema as *const Value as usize;
        let moved = Box::new(owner);
        // The compiled root is a shared, heap-published SchemaRoot: moving the
        // owner must not move it, and locators must still resolve against it.
        assert_eq!(before, &*moved.schema as *const Value as usize);
        let index = moved.cold_resource_index.as_ref().unwrap();
        assert!(std::ptr::eq(index.root(&moved, 0), &*moved.schema));
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
