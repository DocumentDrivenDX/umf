// SPDX-License-Identifier: MIT OR Apache-2.0
//! Closed installed input DATA. Nothing in this module is admission proof.
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
