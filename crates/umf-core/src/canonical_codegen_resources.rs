// SPDX-License-Identifier: MIT OR Apache-2.0
//! Closed installed input DATA. Nothing in this module is admission proof.
use crate::engine::OwnedResourceSet;
use crate::value::{FactoryCountCustody, OwnedCoreJson, OwnedCoreOperation};
use crate::{Context, EngineError, Utf16, Value};
use std::sync::Arc;

pub const INPUT_PROFILE: &str = "installed-canonical/1";
pub const MANIFEST_PROFILE: &str = "umf.codegen.installed-source-manifest/1";

// Tags preserve source numeric category; Value itself still stores binary64.
enum Literal {
    Null,
    Bool(bool),
    Integer { negative: bool, magnitude: u64 },
    Binary64 { bits: u64 },
    Text(usize),
    Array(&'static [Literal]),
    Object(&'static [Member]),
}
struct Member { key: usize, value: Literal }
struct SourceLiteral {
    name: &'static str,
    path: &'static str,
    bytes: usize,
    sha256: &'static str,
    value: Literal,
}
#[path = "canonical_codegen_literals.rs"]
mod data;

const NAMES: [&str; 9] = ["coreSchema", "referenceSchema", "packageSchema", "constraints", "domainPolicy", "tablesPackage", "actionsPackage", "bindingPackage", "stableBindingPackage"];
const PATHS: [&str; 9] = ["spec/core/schema.json", "spec/core/semantic-type-reference.schema.json", "spec/core/extension-package.schema.json", "spec/metamodel/generated/core-constraints.json", "spec/metamodel/generated/domain-policy.json", "spec/extensions/tables/package.json", "spec/extensions/actions/package.json", "spec/extensions/binding/package.json", "spec/extensions/binding-stable/package.json"];

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum MaterializeEvent { LiteralRead, StorageReserve, TextCopy, MemberStore, ScalarStore, RootComplete, CacheSlotsInit, DictionaryRead, CacheLookup, ArcOwnerCreate, CachePublish, ArcReturnClone, SharedWrapperReturn, StaticDictionaryRead, StaticWrapperReturn, StaticSourceReady }
fn words<T>() -> usize { std::mem::size_of::<T>().div_ceil(std::mem::size_of::<usize>()) }
fn fail(path: &mut Utf16, code: &str, message: &str) -> EngineError {
    EngineError::new(code, std::mem::take(path), message)
}
fn work(ctx: &mut Context<'_>, path: &mut Utf16, amount: usize) -> Result<(), EngineError> {
    ctx.charge_work_with_path(amount, path)
}
fn reserve<T>(count: usize, ctx: &mut Context<'_>, path: &mut Utf16, event: &mut dyn FnMut(MaterializeEvent)) -> Result<Vec<T>, EngineError> {
    let bytes = count.checked_mul(std::mem::size_of::<T>()).ok_or_else(|| fail(path,"LIMIT","Installed DATA storage size overflow"))?;
    let fee = bytes.div_ceil(std::mem::size_of::<usize>()).checked_add(words::<Vec<T>>() + 3).ok_or_else(|| fail(path,"LIMIT","Installed DATA storage size overflow"))?;
    work(ctx,path,fee)?;
    event(MaterializeEvent::StorageReserve);
    let mut out = Vec::new();
    out.try_reserve_exact(count).map_err(|_| fail(path,"LIMIT","Installed DATA storage unavailable"))?;
    Ok(out)
}
// A cache is local to one materializer invocation and its exact immutable
// dictionary. No caller cache/dictionary enters the installed production API.
struct CanonicalTextCache<'d> {
    dictionary: &'d [&'d [u16]],
    slots: Vec<Option<Arc<Vec<u16>>>>,
}
impl<'d> CanonicalTextCache<'d> {
    fn new(dictionary: &'d [&'d [u16]], ctx: &mut Context<'_>, path: &mut Utf16, event: &mut dyn FnMut(MaterializeEvent)) -> Result<Self,EngineError> {
        work(ctx,path,words::<Self>() + 3)?;
        let count = dictionary.len();
        let mut slots = reserve::<Option<Arc<Vec<u16>>>>(count,ctx,path,event)?;
        let fee = count.checked_mul(words::<Option<Arc<Vec<u16>>>>() + 2)
            .ok_or_else(|| fail(path,"LIMIT","Installed text cache initialization overflow"))?;
        // Actual None stores/iteration and eventual slot-drop iteration paid now.
        work(ctx,path,fee)?;
        event(MaterializeEvent::CacheSlotsInit);
        slots.resize_with(count, || None);
        Ok(Self { dictionary, slots })
    }
    fn get(&mut self, id: usize, ctx: &mut Context<'_>, path: &mut Utf16, event: &mut dyn FnMut(MaterializeEvent)) -> Result<Utf16,EngineError> {
        // Two checked lookups plus their ID/slot observation. The shape is
        // established by new() and no code ever changes dictionary or slot len.
        work(ctx,path,5)?;
        event(MaterializeEvent::DictionaryRead);
        let units = *self.dictionary.get(id).ok_or_else(|| fail(path,"REQUEST","Installed text ID is outside its dictionary"))?;
        work(ctx,path,1)?;
        if units.len() > ctx.limits().max_text_units {
            return Err(fail(path,"LIMIT","Installed DATA text limit exceeded"));
        }
        event(MaterializeEvent::CacheLookup);
        // Copy only this boolean. No slot/Arc/vector borrow crosses controls.
        let hit = self.slots.get(id).ok_or_else(|| fail(path,"REQUEST","Installed text cache shape is inconsistent"))?.is_some();
        if !hit {
            let mut owned = reserve::<u16>(units.len(),ctx,path,event)?;
            work(ctx,path,units.len())?;
            event(MaterializeEvent::TextCopy);
            owned.extend_from_slice(units);
            // ArcInner's strong/weak counters plus actual Vec payload. Reserve
            // and initialize these words; include owner-pointer movement and
            // cleanup of a last local/cache owner BEFORE Arc creation. Cleanup
            // after a terminal denial never invokes a control or encodes a path.
            let inner_words = words::<Vec<u16>>() + 2;
            let arc_fee = inner_words.saturating_mul(2)
                .saturating_add(words::<Arc<Vec<u16>>>())
                .saturating_add(3 + 2 + words::<Vec<u16>>() + 4);
            work(ctx,path,arc_fee)?;
            event(MaterializeEvent::ArcOwnerCreate);
            let owner = Arc::new(owned);
            work(ctx,path,words::<Option<Arc<Vec<u16>>>>() + 3)?;
            event(MaterializeEvent::CachePublish);
            self.slots[id] = Some(owner);
        }
        // Checked reborrow/option, strong clone+overflow guard, handle/wrapper
        // movement and eventual returned-owner drop are all admitted before
        // borrowing the cache slot. No callback between clone and wrapper.
        work(ctx,path,words::<Arc<Vec<u16>>>() + words::<Utf16>() + 6)?;
        event(MaterializeEvent::ArcReturnClone);
        let owner = Arc::clone(self.slots[id].as_ref().expect("private cache publication completed"));
        event(MaterializeEvent::SharedWrapperReturn);
        Ok(Utf16::from_shared_arc(owner))
    }
}
// Sealed same-visitor routing. No provider, dictionary or route is public.
// Monomorphized calls carry no trait object, vtable or semantic acceptance.
trait LiteralTextSource {
    fn get(&mut self, id: usize, ctx: &mut Context<'_>, path: &mut Utf16, event: &mut dyn FnMut(MaterializeEvent)) -> Result<Utf16,EngineError>;
}
impl LiteralTextSource for CanonicalTextCache<'_> {
    fn get(&mut self, id: usize, ctx: &mut Context<'_>, path: &mut Utf16, event: &mut dyn FnMut(MaterializeEvent)) -> Result<Utf16,EngineError> {
        CanonicalTextCache::get(self,id,ctx,path,event)
    }
}
struct StaticTextSource {
    dictionary: &'static [&'static [u16]],
}
impl StaticTextSource {
    fn new(dictionary: &'static [&'static [u16]], ctx: &mut Context<'_>, path: &mut Utf16, event: &mut dyn FnMut(MaterializeEvent)) -> Result<Self,EngineError> {
        work(ctx,path,words::<Self>() + 1)?;
        event(MaterializeEvent::StaticSourceReady);
        Ok(Self { dictionary })
    }
}
impl LiteralTextSource for StaticTextSource {
    fn get(&mut self, id: usize, ctx: &mut Context<'_>, path: &mut Utf16, event: &mut dyn FnMut(MaterializeEvent)) -> Result<Utf16,EngineError> {
        // Checked DATA lookup plus actual fat-slice metadata load. This is no
        // JSON/profile proof; every occurrence still executes its text guard.
        work(ctx,path,3)?;
        event(MaterializeEvent::StaticDictionaryRead);
        let units: &'static [u16] = *self.dictionary.get(id).ok_or_else(|| fail(path,"REQUEST","Installed text ID is outside its dictionary"))?;
        work(ctx,path,1)?;
        if units.len() > ctx.limits().max_text_units {
            return Err(fail(path,"LIMIT","Installed DATA text limit exceeded"));
        }
        // Real fat-slice parameter movement, complete Utf16 wrapper/return
        // storage and tag/drop bookkeeping. No unit copy, Vec or Arc exists.
        work(ctx,path,words::<&'static [u16]>() + words::<Utf16>() + 1)?;
        event(MaterializeEvent::StaticWrapperReturn);
        Ok(Utf16::from_static_units(units))
    }
}
fn ascii(value: &str, ctx: &mut Context<'_>, path: &mut Utf16, event: &mut dyn FnMut(MaterializeEvent)) -> Result<Utf16, EngineError> {
    work(ctx,path,value.len().saturating_add(1))?;
    if !value.is_ascii() { return Err(fail(path,"REQUEST","Installed source metadata is not ASCII")); }
    let mut out = reserve::<u16>(value.len(),ctx,path,event)?;
    work(ctx,path,value.len().saturating_mul(2).saturating_add(words::<Utf16>() + 1))?;
    event(MaterializeEvent::TextCopy);
    out.extend(value.bytes().map(u16::from));
    Ok(Utf16::new(out))
}
fn visit<S: LiteralTextSource>(literal: &Literal, depth: usize, count: &mut usize, cache: &mut S, ctx: &mut Context<'_>, path: &mut Utf16, event: &mut dyn FnMut(MaterializeEvent)) -> Result<Value, EngineError> {
    // The owned path for DATA-construction failures is '#'. It is not claimed
    // to be an arbitrary raw-parser path. Full subsequent JSON admission uses
    // the existing complete validator and its actual per-node paths.
    work(ctx,path,7 + words::<Value>())?;
    event(MaterializeEvent::LiteralRead);
    *count = count.checked_add(1).ok_or_else(|| fail(path,"LIMIT","Installed DATA node count overflow"))?;
    if *count > ctx.limits().max_values || depth > ctx.limits().max_depth { return Err(fail(path,"LIMIT","Installed DATA structural limit exceeded")); }
    match literal {
        Literal::Null => { event(MaterializeEvent::ScalarStore); Ok(Value::Null) }
        Literal::Bool(value) => { event(MaterializeEvent::ScalarStore); Ok(Value::Bool(*value)) }
        Literal::Integer { negative, magnitude } => {
            work(ctx,path,4)?;
            if *magnitude > 9_007_199_254_740_991 || (*negative && *magnitude == 0) { return Err(fail(path,"NUMBER","Installed integer is outside the safe binary64 envelope")); }
            event(MaterializeEvent::ScalarStore);
            Ok(Value::Number(if *negative { -(*magnitude as f64) } else { *magnitude as f64 }))
        }
        Literal::Binary64 { bits } => {
            work(ctx,path,1)?;
            event(MaterializeEvent::ScalarStore);
            // Raw Value; NaN/-0/etc are NOT admitted by DATA construction.
            Ok(Value::Number(f64::from_bits(*bits)))
        }
        Literal::Text(id) => Ok(Value::String(cache.get(*id,ctx,path,event)?)),
        Literal::Array(items) => {
            work(ctx,path,3)?;
            if items.len() > ctx.limits().max_values.saturating_sub(*count) { return Err(fail(path,"LIMIT","Installed DATA container frontier exceeded")); }
            let next_depth = depth.checked_add(1).ok_or_else(|| fail(path,"LIMIT","Installed DATA depth overflow"))?;
            let mut out = reserve::<Value>(items.len(),ctx,path,event)?;
            for item in *items {
                let value = visit(item,next_depth,count,cache,ctx,path,event)?;
                work(ctx,path,words::<Value>() + 1)?;
                event(MaterializeEvent::MemberStore);
                out.push(value);
            }
            Ok(Value::Array(out))
        }
        Literal::Object(members) => {
            work(ctx,path,3)?;
            if members.len() > ctx.limits().max_values.saturating_sub(*count) { return Err(fail(path,"LIMIT","Installed DATA container frontier exceeded")); }
            let next_depth = depth.checked_add(1).ok_or_else(|| fail(path,"LIMIT","Installed DATA depth overflow"))?;
            let mut out = reserve::<(Utf16,Value)>(members.len(),ctx,path,event)?;
            for member in *members {
                let key = cache.get(member.key,ctx,path,event)?;
                let value = visit(&member.value,next_depth,count,cache,ctx,path,event)?;
                work(ctx,path,words::<(Utf16,Value)>() + 1)?;
                event(MaterializeEvent::MemberStore);
                out.push((key,value));
            }
            Ok(Value::Object(out))
        }
    }
}
fn materialize<S: LiteralTextSource>(literal: &Literal, cache: &mut S, ctx: &mut Context<'_>, event: &mut dyn FnMut(MaterializeEvent)) -> Result<Value, EngineError> {
    // Admit the owned root-path header/unit and local traversal initialization.
    ctx.charge_work(words::<Utf16>() + 4,Utf16::default())?;
    let mut path = Utf16::from("#");
    let value = visit(literal,0,&mut 0,cache,ctx,&mut path,event)?;
    work(ctx,&mut path,0)?;
    event(MaterializeEvent::RootComplete);
    Ok(value)
}
#[cfg(test)]
fn materialize_with_events(literal: &Literal, ctx: &mut Context<'_>, event: &mut dyn FnMut(MaterializeEvent)) -> Result<Value, EngineError> {
    materialize_fixture_with_events(literal,data::TEXTS,ctx,event)
}
/// Test-only authored DATA. Fresh dictionary-bound cache, same production
/// constructor/get/visit body; output is unadmitted Value, never factory success.
#[cfg(test)]
fn materialize_fixture_with_events(literal: &Literal, dictionary: &[&[u16]], ctx: &mut Context<'_>, event: &mut dyn FnMut(MaterializeEvent)) -> Result<Value,EngineError> {
    let mut path = Utf16::default();
    let mut cache = CanonicalTextCache::new(dictionary,ctx,&mut path,event)?;
    materialize(literal,&mut cache,ctx,event)
}
/// Static-only authored DATA fixture. Lifetime cannot be erased or promoted
/// from a caller's runtime Vec; same visitor/getter returns UNADMITTED Value.
#[cfg(test)]
fn materialize_static_fixture_with_events(literal: &Literal, dictionary: &'static [&'static [u16]], ctx: &mut Context<'_>, event: &mut dyn FnMut(MaterializeEvent)) -> Result<Value,EngineError> {
    let mut path = Utf16::default();
    let mut source = StaticTextSource::new(dictionary,ctx,&mut path,event)?;
    materialize(literal,&mut source,ctx,event)
}
#[cfg(test)]
fn materialize_static_with_events(literal: &Literal, ctx: &mut Context<'_>, event: &mut dyn FnMut(MaterializeEvent)) -> Result<Value,EngineError> {
    materialize_static_fixture_with_events(literal,data::TEXTS,ctx,event)
}
fn check_sources(ctx: &mut Context<'_>, path: &mut Utf16) -> Result<(), EngineError> {
    work(ctx,path,1)?;
    if data::SOURCES.len() != NAMES.len() { return Err(fail(path,"REQUEST","Installed canonical source cohort is incomplete")); }
    for (i,source) in data::SOURCES.iter().enumerate() {
        work(ctx,path,source.name.len().saturating_add(NAMES[i].len()).saturating_add(source.path.len()).saturating_add(PATHS[i].len()).saturating_add(source.sha256.len()).saturating_add(7))?;
        if source.name != NAMES[i] || source.path != PATHS[i] || source.bytes == 0 || (source.bytes as u128) > 9_007_199_254_740_991u128 || source.sha256.len() != 64 || !source.sha256.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)) {
            return Err(fail(path,"REQUEST","Installed canonical source cohort is inconsistent"));
        }
    }
    Ok(())
}
/// Construct raw owned DATA only. Caller must run all full runtime admissions.
/// Fixed schedule: materialize all9, admit all9, then compile (in wire factory).
pub fn materialize_installed_codegen_resources(ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let mut path = Utf16::default();
    check_sources(ctx,&mut path)?;
    let mut event = |_| {};
    let mut cache = StaticTextSource::new(data::TEXTS,ctx,&mut path,&mut event)?;
    let mut fields = reserve::<(Utf16,Value)>(NAMES.len(),ctx,&mut path,&mut event)?;
    for source in data::SOURCES {
        let key = ascii(source.name,ctx,&mut path,&mut event)?;
        let value = materialize(&source.value,&mut cache,ctx,&mut event)?;
        work(ctx,&mut path,words::<(Utf16,Value)>() + 1)?;
        fields.push((key,value));
    }
    work(ctx,&mut path,words::<Value>() + 1)?;
    Ok(Value::Object(fields))
}
fn field(fields: &mut Vec<(Utf16,Value)>, name: &str, value: Value, ctx: &mut Context<'_>, path: &mut Utf16, event: &mut dyn FnMut(MaterializeEvent)) -> Result<(), EngineError> {
    let key = ascii(name,ctx,path,event)?;
    work(ctx,path,words::<(Utf16,Value)>() + 1)?;
    event(MaterializeEvent::MemberStore);
    fields.push((key,value));
    Ok(())
}
fn string(value: &str, ctx: &mut Context<'_>, path: &mut Utf16, event: &mut dyn FnMut(MaterializeEvent)) -> Result<Value, EngineError> {
    let text = ascii(value,ctx,path,event)?;
    work(ctx,path,words::<Value>() + 1)?;
    Ok(Value::String(text))
}
/// Provenance report only; runtime semantic validity is never reported here.
pub fn installed_resource_source_manifest(ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let mut path = Utf16::default();
    check_sources(ctx,&mut path)?;
    let mut event = |_| {};
    let mut rows = reserve::<Value>(NAMES.len(),ctx,&mut path,&mut event)?;
    for source in data::SOURCES {
        let mut row = reserve::<(Utf16,Value)>(4,ctx,&mut path,&mut event)?;
        let name = string(source.name,ctx,&mut path,&mut event)?;
        field(&mut row,"name",name,ctx,&mut path,&mut event)?;
        let name = string(source.path,ctx,&mut path,&mut event)?;
        field(&mut row,"path",name,ctx,&mut path,&mut event)?;
        work(ctx,&mut path,words::<Value>() + 2)?;
        let bytes = Value::Number(source.bytes as f64);
        field(&mut row,"bytes",bytes,ctx,&mut path,&mut event)?;
        let hash = string(source.sha256,ctx,&mut path,&mut event)?;
        field(&mut row,"sha256",hash,ctx,&mut path,&mut event)?;
        work(ctx,&mut path,2 * words::<Value>() + 2)?;
        rows.push(Value::Object(row));
    }
    let mut fields = reserve::<(Utf16,Value)>(3,ctx,&mut path,&mut event)?;
    let profile = string(MANIFEST_PROFILE,ctx,&mut path,&mut event)?;
    field(&mut fields,"profile",profile,ctx,&mut path,&mut event)?;
    let profile = string(INPUT_PROFILE,ctx,&mut path,&mut event)?;
    field(&mut fields,"inputProfile",profile,ctx,&mut path,&mut event)?;
    work(ctx,&mut path,words::<Value>() + 1)?;
    field(&mut fields,"resources",Value::Array(rows),ctx,&mut path,&mut event)?;
    work(ctx,&mut path,words::<Value>() + 1)?;
    Ok(Value::Object(fields))
}

#[cfg(test)]
#[path = "canonical_codegen_literals_independent_tests.rs"]
mod independent_tests;

#[cfg(test)]
#[path = "canonical_text_cache_independent_tests.rs"]
mod cache_independent_tests;

#[cfg(test)]
#[path = "canonical_static_text_independent_tests.rs"]
mod static_independent_tests;

// Sealed counted transport. Counts are sizing DATA, never admission evidence.
#[doc(hidden)]
#[derive(Debug)]
pub struct CountedInstalledBundle {
    raw:Value, counts:[usize;9], custody:Option<crate::value::FactoryCountCustody>,
}
#[doc(hidden)]
#[derive(Debug)]
pub struct CountedInstalledFields {
    raw:std::vec::IntoIter<(Utf16,Value)>, counts:[usize;9], position:usize,
    custody:Option<crate::value::FactoryCountCustody>,
}
#[doc(hidden)]
#[derive(Debug)]
pub struct CountedInstalledField {name:Utf16,value:Value,hint:Option<crate::value::FactoryRowHint>}
fn materialize_counted<S:LiteralTextSource>(literal:&Literal,source:&mut S,ctx:&mut Context<'_>,event:&mut dyn FnMut(MaterializeEvent))->Result<(Value,usize),EngineError>{
    // The original visitor/initialization/RootComplete and all semantic DATA
    // operations are unchanged. Only its actual final counter is retained.
    ctx.charge_work(words::<Utf16>()+4,Utf16::default())?;
    let mut path=Utf16::from("#");let mut count=0;
    let value=visit(literal,0,&mut count,source,ctx,&mut path,event)?;
    work(ctx,&mut path,0)?;event(MaterializeEvent::RootComplete);
    work(ctx,&mut path,2*words::<(Value,usize)>()+words::<usize>()+4)?;
    Ok((value,count))
}
#[doc(hidden)]
pub fn materialize_counted_installed_codegen_resources(ctx:&mut Context<'_>,operation:&crate::value::OwnedCoreOperation)->Result<CountedInstalledBundle,EngineError>{
    let mut path=Utf16::default();check_sources(ctx,&mut path)?;
    // Count slots, wrapper/result moves and eventual drop traversal prepaid.
    work(ctx,&mut path,5*words::<CountedInstalledBundle>()+2*words::<[usize;9]>()+48)?;
    let custody=operation.count_custody(ctx)?;let mut counts=[0usize;9];
    let mut event=|_|{};let mut cache=StaticTextSource::new(data::TEXTS,ctx,&mut path,&mut event)?;
    let mut fields=reserve::<(Utf16,Value)>(NAMES.len(),ctx,&mut path,&mut event)?;
    for (index,source) in data::SOURCES.iter().enumerate(){
        let key=ascii(source.name,ctx,&mut path,&mut event)?;
        let(value,count)=materialize_counted(&source.value,&mut cache,ctx,&mut event)?;
        work(ctx,&mut path,words::<(Utf16,Value)>()+1)?;
        fields.push((key,value));counts[index]=count;
    }
    work(ctx,&mut path,words::<Value>()+1)?;
    Ok(CountedInstalledBundle{raw:Value::Object(fields),counts,custody})
}
impl CountedInstalledBundle {
    pub fn into_fields(self,ctx:&mut Context<'_>)->Result<CountedInstalledFields,EngineError>{
        // Original raw Object decomposition plus genuinely new wrapper/iterator
        // storage, count/custody moves, length read and terminal cleanup.
        ctx.charge_work(words::<Value>()+1+2*words::<CountedInstalledFields>()
            +words::<[usize;9]>()+words::<Option<crate::value::FactoryCountCustody>>()+12,Utf16::default())?;
        let Value::Object(raw)=self.raw else{return Err(EngineError::new("REQUEST",Utf16::default(),"Installed canonical resource bundle is invalid"));};
        Ok(CountedInstalledFields{raw:raw.into_iter(),counts:self.counts,position:0,custody:self.custody})
    }
}
impl CountedInstalledFields {
    // Read-only scalar projections used by the closed factory exactly once;
    // their work is prepaid in into_fields/next respectively, not new scans.
    pub fn len(&self)->usize{self.raw.len()}
    pub fn next(&mut self,ctx:&mut Context<'_>)->Result<Option<CountedInstalledField>,EngineError>{
        ctx.charge_work(2*words::<Option<CountedInstalledField>>()+words::<CountedInstalledField>()
            +words::<Option<crate::value::FactoryRowHint>>()+10,Utf16::default())?;
        let Some((name,value))=self.raw.next()else{return Ok(None);};
        let index=self.position;self.position=self.position.checked_add(1).expect("sealed nine-field iterator");
        let hint=if index<3 {
            crate::value::FactoryRowHint::from_count(self.counts[index],self.custody.as_ref(),ctx)?
        }else{None};
        Ok(Some(CountedInstalledField{name,value,hint}))
    }
}
impl CountedInstalledField {
    pub fn name(&self)->&Utf16{&self.name}
    pub fn admit(self,operation:&crate::value::OwnedCoreOperation,ctx:&mut Context<'_>)->Result<(Utf16,crate::value::OwnedCoreJson),EngineError>{
        ctx.charge_work(words::<Self>()+words::<Option<crate::value::FactoryRowHint>>()
            +2*words::<(Utf16,crate::value::OwnedCoreJson)>()+6,Utf16::default())?;
        let Self{name,value,hint}=self;
        let value=crate::value::OwnedCoreJson::admit_factory_resource_sized(value,&name,operation,hint,ctx)?;
        Ok((name,value))
    }
}

#[doc(hidden)]
pub fn take_owned(raw:&mut Vec<(Utf16,OwnedCoreJson)>,name:&str,ctx:&mut Context<'_>)->Result<Option<OwnedCoreJson>,EngineError>{
    for index in 0..raw.len(){
        ctx.charge_work(raw[index].0.len().min(name.len()).saturating_add(1),Utf16::default())?;
        if raw[index].0.units().iter().copied().eq(name.encode_utf16()){
            ctx.charge_work(raw.len().saturating_sub(index).saturating_mul(std::mem::size_of::<(Utf16,OwnedCoreJson)>().div_ceil(std::mem::size_of::<usize>())),Utf16::default())?;
            return Ok(Some(raw.remove(index).1));
        }
    }
    Ok(None)
}
#[doc(hidden)]
pub fn required_owned(raw:&mut Vec<(Utf16,OwnedCoreJson)>,name:&str,ctx:&mut Context<'_>)->Result<OwnedCoreJson,EngineError>{
    take_owned(raw,name,ctx)?.ok_or_else(||EngineError::new("REQUEST",name.into(),"Explicit codegen resource is required"))
}

/// Completed original nine-field admission. No field replacement or iteration
/// over owned fields is available across the crate boundary.
#[doc(hidden)]
pub struct CountedAdmitted<'op> {
    fields: Vec<(Utf16, OwnedCoreJson)>,
    operation: &'op OwnedCoreOperation,
    route: Option<FactoryCountCustody>,
}

#[doc(hidden)]
pub struct CountedCore<'batch, 'op> {
    fields: Option<OwnedResourceSet>,
    operation: &'op OwnedCoreOperation,
    route: Option<&'batch FactoryCountCustody>,
}

#[doc(hidden)]
pub struct PreparedCounted<'batch, 'op> {
    pub core: CountedCore<'batch, 'op>,
    pub tables_package: Value,
    pub tables_schema: Value,
    pub actions_package: Value,
    pub actions_schema: Value,
    pub binding_package: Value,
    pub stable_binding_package: Value,
}

const fn counted_words<T>() -> usize {
    std::mem::size_of::<T>().div_ceil(std::mem::size_of::<usize>())
}
const _: () = {
    assert!(counted_words::<Value>() <= 8);
    assert!(counted_words::<OwnedCoreJson>() <= 18);
    assert!(counted_words::<Option<FactoryCountCustody>>() <= 8);
    assert!(counted_words::<CountedAdmitted<'static>>() <= 12);
    assert!(counted_words::<Option<OwnedResourceSet>>() <= 91);
    assert!(counted_words::<Result<PreparedCounted<'static, 'static>, EngineError>>() <= 142);
};

// Preserve the observer's original name-only visibility. The production
// expansion contains no observer parameter or runtime observer test.
macro_rules! counted_admit {
    ($bundle:expr, $operation:ident, $ctx:ident $(, $observe:ident)?) => {{
        let mut raw = $bundle.into_fields($ctx)?;
        let count = raw.len();
        let pair_words = words::<(Utf16, OwnedCoreJson)>();
        let raw_pair_words = words::<(Utf16, Value)>();
        $ctx.charge_work(count.saturating_mul(pair_words.saturating_add(raw_pair_words)).saturating_add(6), Utf16::default())?;
        let mut fields = Vec::new();
        fields.try_reserve_exact(count).map_err(|_| EngineError::new("LIMIT", Utf16::default(), "Installed admitted resource storage unavailable"))?;
        $ctx.with_work_phase("native-installed-full-admission", |ctx| {
            for _ in 0..count {
                let field = raw.next(ctx)?.expect("sealed installed field count");
                $($observe(true, field.name());)?
                let (key, value) = field.admit($operation, ctx)?;
                $($observe(false, &key);)?
                ctx.charge_work(pair_words.saturating_add(1), Utf16::default())?;
                fields.push((key, value));
            }
            Ok::<(), EngineError>(())
        })?;
        // Two wrapper movements, custody transfer and the first live guard.
        $ctx.charge_work(68, Utf16::default())?;
        let route = raw.custody.take().filter(|custody| custody.matches_operation($operation, $ctx));
        Ok(CountedAdmitted { fields, operation: $operation, route })
    }};
}

impl CountedInstalledBundle {
    #[doc(hidden)]
    pub fn admit_all<'op>(self, operation: &'op OwnedCoreOperation, ctx: &mut Context<'_>) -> Result<CountedAdmitted<'op>, EngineError> {
        counted_admit!(self, operation, ctx)
    }

    #[doc(hidden)]
    pub fn admit_all_observed<'op>(self, operation: &'op OwnedCoreOperation, ctx: &mut Context<'_>, mut observe: impl FnMut(bool, &Utf16)) -> Result<CountedAdmitted<'op>, EngineError> {
        counted_admit!(self, operation, ctx, observe)
    }
}

impl<'op> CountedAdmitted<'op> {
    pub fn names(&self) -> impl Iterator<Item = &Utf16> {
        self.fields.iter().map(|(name, _)| name)
    }

    pub fn is_empty(&self) -> bool {
        self.fields.is_empty()
    }

    #[doc(hidden)]
    pub fn prepare<'batch>(&'batch mut self, ctx: &mut Context<'_>) -> Result<PreparedCounted<'batch, 'op>, EngineError> {
        // The failure paths can dispose of an unconsumed wrapper without
        // requesting additional host work.
        ctx.charge_work(18, Utf16::default())?;
        ctx.charge_work(26, Utf16::default())?;
        let operation = self.operation;
        let route = self.route.as_ref().filter(|custody| custody.matches_operation(operation, ctx));
        let core_schema = required_owned(&mut self.fields, "coreSchema", ctx)?;
        let reference_schema = required_owned(&mut self.fields, "referenceSchema", ctx)?;
        let package_schema = required_owned(&mut self.fields, "packageSchema", ctx)?;
        let constraints = required_owned(&mut self.fields, "constraints", ctx)?;
        let domain_policy = required_owned(&mut self.fields, "domainPolicy", ctx)?;
        ctx.charge_work(5, Utf16::default())?;
        let fields = OwnedResourceSet { core_schema, reference_schema, package_schema, constraints, domain_policy };
        let tables = required_owned(&mut self.fields, "tablesPackage", ctx)?;
        let actions = required_owned(&mut self.fields, "actionsPackage", ctx)?;
        let binding = required_owned(&mut self.fields, "bindingPackage", ctx)?;
        let stable_binding = required_owned(&mut self.fields, "stableBindingPackage", ctx)?;
        let tables_schema = tables.copy_schema_member(operation, ctx, "Table package schema is required")?;
        let actions_schema = actions.copy_schema_member(operation, ctx, "Action package schema is required")?;
        ctx.charge_work(11, Utf16::default())?;
        let tables_package = tables.into_resource(operation, ctx)?;
        let tables_schema = tables_schema.into_schema_copy(operation, ctx)?;
        let actions_package = actions.into_resource(operation, ctx)?;
        let actions_schema = actions_schema.into_schema_copy(operation, ctx)?;
        let binding_package = binding.into_resource(operation, ctx)?;
        let stable_binding_package = stable_binding.into_resource(operation, ctx)?;
        ctx.charge_work(26, Utf16::default())?;
        let route = route.filter(|custody| custody.matches_operation(operation, ctx));
        ctx.charge_work(172, Utf16::default())?;
        Ok(PreparedCounted {
            core: CountedCore { fields: Some(fields), operation, route },
            tables_package, tables_schema, actions_package, actions_schema,
            binding_package, stable_binding_package,
        })
    }
}

// Only the exact counted consumer below can construct this permit. No
// field extraction path returns a permit or exposes the original route.
pub(crate) struct CountedBankRoute(());

impl CountedCore<'_, '_> {
    pub(crate) fn admit_bank(
        &mut self,
        ctx: &mut Context<'_>,
    ) -> Result<crate::schema::admitted_bank::AdmittedCore, EngineError> {
        ctx.charge_work(98, Utf16::default())?;
        let Some(resources) = self.fields.take() else {
            return Err(counted_core_consumed(ctx));
        };
        let mut admitted = crate::schema::admitted_bank::SchemaBank::admit_core_owned(
            resources, self.operation, ctx,
        )?;
        ctx.charge_work(26, Utf16::default())?;
        if self.route.is_some_and(|custody| custody.matches_operation(self.operation, ctx)) {
            // The original owner check/store costs 12. Another 16 covers
            // permit construction and the new borrowed call/return effects.
            ctx.charge_work(28, Utf16::default())?;
            crate::schema::admitted_bank::SchemaBank::mark_counted_owner(
                &mut admitted, CountedBankRoute(()),
            );
        }
        Ok(admitted)
    }

    pub(crate) fn take_raw(&mut self, ctx: &mut Context<'_>) -> Result<crate::engine::ResourceSet, EngineError> {
        type RawResult = Result<crate::engine::ResourceSet, EngineError>;
        // The raw fallback cannot carry the route. Prepay its extra result
        // staging and complete raw movement separately from the slot take.
        ctx.charge_work(98 + counted_words::<RawResult>() + counted_words::<crate::engine::ResourceSet>(), Utf16::default())?;
        let Some(resources) = self.fields.take() else {
            return Err(counted_core_consumed(ctx));
        };
        Ok(resources.into_raw())
    }
}

// Only a misuse of the public hidden borrowed consuming entry can reach
// this error. A genuine preparation calls Engine once with a full slot.
fn counted_core_consumed(ctx: &mut Context<'_>) -> EngineError {
    const MESSAGE: &str = "Counted Core input already consumed";
    match ctx.charge_work(counted_words::<EngineError>() + 2 * MESSAGE.len() + "REQUEST".len() + 8, Utf16::default()) {
        Ok(()) => EngineError::new("REQUEST", Utf16::default(), MESSAGE),
        Err(error) => error,
    }
}
