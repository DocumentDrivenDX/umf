// SPDX-License-Identifier: MIT OR Apache-2.0
use std::collections::{BTreeSet, HashSet};

use crate::{context::Context, error::EngineError};

/// A string represented as UTF-16 code units so isolated surrogate values are
/// retained at the Rust boundary.
#[derive(Clone, Debug)]
enum TextStorage {
    Owned(Vec<u16>),
    // Only owner-generated immutable evaluator paths select shared storage.
    // Equality/order/hash remain over exact code units, not storage identity.
    Shared(std::sync::Arc<Vec<u16>>),
    Static(&'static [u16]),
}
#[derive(Clone)]
pub struct Utf16(TextStorage);
impl Default for Utf16 {
    fn default() -> Self {
        Self::new(Vec::new())
    }
}
impl PartialEq for Utf16 {
    fn eq(&self, other: &Self) -> bool {
        self.units() == other.units()
    }
}
impl Eq for Utf16 {}
impl PartialOrd for Utf16 {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}
impl Ord for Utf16 {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        self.units().cmp(other.units())
    }
}
impl std::hash::Hash for Utf16 {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        std::hash::Hash::hash(self.units(), state)
    }
}
impl Utf16 {
    pub fn new(units: Vec<u16>) -> Self {
        Self(TextStorage::Owned(units))
    }
    // Storage-only move. Callers pre-admit Arc ownership/refcount/wrapper work;
    // this grants no text, JSON, schema or resource admission proof.
    // Only genuine immutable literal DATA selects this storage-only route.
    pub(crate) fn from_static_units(units: &'static [u16]) -> Self {
        Self(TextStorage::Static(units))
    }
    pub(crate) fn from_shared_arc(units: std::sync::Arc<Vec<u16>>) -> Self {
        Self(TextStorage::Shared(units))
    }
    pub(crate) fn shared(units: Vec<u16>) -> Self {
        Self(TextStorage::Shared(std::sync::Arc::new(units)))
    }
    // Callers pre-admit the wrapper publication. Existing shared path buffers
    // stay shared; consuming an owned buffer never copies its admitted units.
    pub(crate) fn into_shared(self) -> Self {
        match self.0 {
            TextStorage::Owned(units) => Self::shared(units),
            TextStorage::Shared(units) => Self(TextStorage::Shared(units)),
            TextStorage::Static(units) => Self::shared(units.to_vec()),
        }
    }
    pub(crate) fn into_shared_with_context(self, ctx: &mut Context<'_>) -> Result<Self, EngineError> {
        self.into_shared_controlled(ctx, &mut |_| {})
    }
    #[cfg(test)]
    pub(crate) fn into_shared_with_events(self, ctx: &mut Context<'_>, event: &mut dyn FnMut(&'static str)) -> Result<Self, EngineError> {
        self.into_shared_controlled(ctx,event)
    }
    fn into_shared_controlled(mut self, ctx: &mut Context<'_>, event: &mut dyn FnMut(&'static str)) -> Result<Self,EngineError> {
        if !matches!(&self.0,TextStorage::Static(_)) {
            return Ok(self.into_shared());
        }
        ctx.charge_work_with_path(4,&mut self)?;
        event("static-shared-size");
        let units = self.len();
        let bytes = units.checked_mul(std::mem::size_of::<u16>()).ok_or_else(||EngineError::new("LIMIT",std::mem::take(&mut self),"Static text copy size overflow"))?;
        let word = std::mem::size_of::<usize>();
        let vec_words = std::mem::size_of::<Vec<u16>>().div_ceil(word);
        let arc_words = std::mem::size_of::<std::sync::Arc<Vec<u16>>>().div_ceil(word);
        let wrapper_words = std::mem::size_of::<Self>().div_ceil(word);
        let inner_words = vec_words + 2;
        let fee = bytes.div_ceil(word).saturating_add(vec_words + 3)
            .saturating_add(units)
            .saturating_add(2*inner_words + arc_words + 3 + 2 + vec_words + 4)
            .saturating_add(wrapper_words + 1);
        ctx.charge_work_with_path(fee,&mut self)?;
        // Same actual into_shared branch, including real Vec and Arc creation.
        // No callback/borrow or path reconstruction between admission/effect.
        event("static-shared-copy-and-arc");
        let shared = self.into_shared();
        event("static-shared-return");
        Ok(shared)
    }
    pub(crate) fn clone_work(&self) -> usize {
        match &self.0 {
            TextStorage::Owned(_) => self.len(),
            TextStorage::Shared(_) => 1,
            TextStorage::Static(_) => std::mem::size_of::<Self>().div_ceil(std::mem::size_of::<usize>()) + 1,
        }
    }
    /// Invocation-local path mutation. Every scan/storage effect is admitted
    /// before borrowing mutable storage; no mutable buffer borrow crosses control.
    pub(crate) fn push_owned_path_segment(&mut self, segment:&Utf16, ctx:&mut Context<'_>)->Result<usize,EngineError> {
        self.push_owned_path_segment_mode(segment,true,true,true,ctx,&mut |_|{})
    }
    #[cfg(test)]
    pub(crate) fn push_owned_path_segment_with_events(&mut self,segment:&Utf16,ctx:&mut Context<'_>,observer:&mut dyn FnMut(&'static str))->Result<usize,EngineError>{
        self.push_owned_path_segment_mode(segment,true,true,true,ctx,observer)
    }
    /// Private schema preflight variant. `slash` and `escape` are selected by
    /// the original path operation; every debit deliberately retains its
    /// original empty diagnostic path rather than borrowing the live buffer.
    pub(crate) fn push_owned_preflight_segment(&mut self,segment:&Utf16,slash:bool,escape:bool,ctx:&mut Context<'_>)->Result<usize,EngineError>{
        self.push_owned_preflight_segment_observed(segment,slash,escape,ctx,&mut |_|{})
    }
    pub(crate) fn push_owned_preflight_segment_observed(&mut self,segment:&Utf16,slash:bool,escape:bool,ctx:&mut Context<'_>,observer:&mut dyn FnMut(&'static str))->Result<usize,EngineError>{
        self.push_owned_path_segment_mode(segment,slash,escape,false,ctx,observer)
    }
    #[cfg(test)]
    pub(crate) fn push_owned_preflight_segment_with_events(&mut self,segment:&Utf16,slash:bool,escape:bool,ctx:&mut Context<'_>,observer:&mut dyn FnMut(&'static str))->Result<usize,EngineError>{
        self.push_owned_preflight_segment_observed(segment,slash,escape,ctx,observer)
    }
    fn push_owned_path_segment_mode(&mut self,segment:&Utf16,slash:bool,escape:bool,current_path_diagnostics:bool,ctx:&mut Context<'_>,observer:&mut dyn FnMut(&'static str))->Result<usize,EngineError>{
        macro_rules! charge { ($amount:expr) => {{
            if current_path_diagnostics {ctx.charge_work_with_path($amount,self)} else {ctx.charge_work($amount,Utf16::default())}
        }}; }
        charge!(3)?;
        let old=self.len();
        charge!(segment.len())?;
        let mut suffix=usize::from(slash);
        for unit in segment.units(){suffix=suffix.checked_add(if escape&&matches!(unit,0x7e|0x2f){2}else{1}).ok_or_else(||EngineError::new("LIMIT",if current_path_diagnostics{std::mem::take(self)}else{Utf16::default()},"Owned JSON path size overflow"))?;}
        let wanted=old.checked_add(suffix).ok_or_else(||EngineError::new("LIMIT",if current_path_diagnostics{std::mem::take(self)}else{Utf16::default()},"Owned JSON path size overflow"))?;
        let capacity=match &self.0{TextStorage::Owned(v)=>v.capacity(),TextStorage::Shared(_)|TextStorage::Static(_)=>0};
        if wanted>capacity {
            // Includes relocation of the existing prefix, including a shared
            // source's actual detach. No Arc::make_mut hides an unpaid copy.
            let requested=capacity.checked_mul(2).unwrap_or(usize::MAX).max(wanted);
            charge!(old.saturating_add(requested))?;
            observer(if current_path_diagnostics{"path-growth"}else{"sp1-pre-effect-growth-admitted"});
            let mut next=Vec::new();next.try_reserve_exact(requested).map_err(|_|EngineError::new("LIMIT",if current_path_diagnostics{std::mem::take(self)}else{Utf16::default()},"Owned JSON path allocation unavailable"))?;
            observer(if current_path_diagnostics{"path-relocation"}else{"sp1-effect-capacity-reserved-before-prefix-relocation"});
            next.extend_from_slice(self.units());self.0=TextStorage::Owned(next);
        }
        charge!(suffix)?;
        observer(if current_path_diagnostics{"path-write"}else{"sp1-pre-effect-suffix-write-admitted"});
        let TextStorage::Owned(units)=&mut self.0 else {unreachable!("shared path has zero mutable capacity")};
        if slash { units.push(0x2f); }
        for unit in segment.units(){match (escape,*unit) {(true,0x7e)=>units.extend([0x7e,0x30]),(true,0x2f)=>units.extend([0x7e,0x31]),(_,other)=>units.push(other)}}
        observer(if current_path_diagnostics{"path-write-complete"}else{"sp1-effect-suffix-written"});
        Ok(old)
    }
    pub(crate) fn restore_owned_path(&mut self, old:usize,ctx:&mut Context<'_>)->Result<(),EngineError> {
        ctx.charge_work_with_path(1,self)?;
        match &mut self.0 {TextStorage::Owned(v)=>v.truncate(old),TextStorage::Shared(_)|TextStorage::Static(_)=>unreachable!("successful path append guarantees owned storage")}
        Ok(())
    }
    pub(crate) fn truncate_owned_preflight_path(&mut self,old:usize){
        match &mut self.0 {
            TextStorage::Owned(v)=>v.truncate(old),
            TextStorage::Shared(v) if v.len()==old=>(),
            TextStorage::Static(v) if v.len()==old=>(),
            // A denied first reserve has not changed shared/static contents.
            // Cleanup must preserve the first refusal and never detach here.
            TextStorage::Shared(_)|TextStorage::Static(_)=>(),
        }
    }
    #[cfg(test)]
    pub(crate) fn preflight_storage_observation(&self)->(bool,usize){
        match &self.0 {TextStorage::Owned(v)=>(true,v.capacity()),TextStorage::Shared(v)=>(false,v.capacity()),TextStorage::Static(v)=>(false,v.len())}
    }
    pub fn units(&self) -> &[u16] {
        match &self.0 {
            TextStorage::Owned(v) => v,
            TextStorage::Shared(v) => v,
            TextStorage::Static(v) => v,
        }
    }
    pub fn into_units(self) -> Vec<u16> {
        match self.0 {
            TextStorage::Owned(v) => v,
            TextStorage::Shared(v) => {
                std::sync::Arc::try_unwrap(v).unwrap_or_else(|v| (*v).clone())
            }
            TextStorage::Static(v) => v.to_vec(),        }
    }
    pub fn to_utf8(&self) -> Result<String, std::string::FromUtf16Error> {
        String::from_utf16(self.units())
    }
    pub fn from_utf8(value: &str) -> Self {
        Self::new(value.encode_utf16().collect())
    }
    pub fn len(&self) -> usize {
        self.units().len()
    }
    pub fn is_empty(&self) -> bool {
        self.units().is_empty()
    }
}

#[cfg(test)]
mod completed_result_copy_tests {
    use super::{copy_completed_json_result, Utf16, Value};
    use crate::{
        context::{Context, Limits, ResourceProfile},
        error::EngineError,
    };

    #[test]
    fn follows_typescript_nodewise_limit_path_and_charges_copy_work() {
        let value = Value::Object(vec![(
            Utf16::from("a"),
            Value::Array(vec![Value::Bool(true); 4]),
        )]);
        let mut limits = Limits::ordinary();
        limits.max_values = 4;
        let mut observed = 0usize;
        let mut meter = |amount: usize| {
            observed += amount;
            Ok(())
        };
        let mut ctx = Context::with_limits(ResourceProfile::Cooperative, limits)
            .unwrap()
            .with_meter(&mut meter);
        let error = copy_completed_json_result(&value, &mut ctx).unwrap_err();
        drop(ctx);
        assert_eq!(error.code, "LIMIT");
        assert_eq!(
            error.message.to_utf8().unwrap(),
            "JSON structural limit exceeded"
        );
        assert_eq!(error.path.to_utf8().unwrap(), "/a/2");
        assert_eq!(observed, 25);
    }

    #[test]
    fn meter_failure_stops_copy_and_text_is_not_clamped_by_text_limit() {
        let value = Value::Array(vec![Value::Bool(true); 20]);
        let mut observed = 0usize;
        let mut meter = |amount: usize| {
            observed += amount;
            if observed >= 4 {
                Err(EngineError::new(
                    "METER_FAILURE",
                    Utf16::default(),
                    "stop copy",
                ))
            } else {
                Ok(())
            }
        };
        let mut ctx = Context::ordinary().with_meter(&mut meter);
        let error = copy_completed_json_result(&value, &mut ctx).unwrap_err();
        drop(ctx);
        assert_eq!(error.code, "METER_FAILURE");
        assert_eq!(observed, 4);

        let mut limits = Limits::ordinary();
        limits.max_text_units = 8;
        let long = Value::String(Utf16::from("x".repeat(32)));
        let mut ctx = Context::with_limits(ResourceProfile::Cooperative, limits).unwrap();
        assert_eq!(copy_completed_json_result(&long, &mut ctx).unwrap(), long);

        let long = Value::String(Utf16::from("x".repeat(32)));
        let mut observed_units = 0usize;
        let mut text_meter = |amount: usize| {
            observed_units += amount;
            if amount > 8 {
                Err(EngineError::new(
                    "METER_FAILURE",
                    Utf16::default(),
                    "stop before long clone",
                ))
            } else {
                Ok(())
            }
        };
        let mut ctx = Context::ordinary().with_meter(&mut text_meter);
        let error = copy_completed_json_result(&long, &mut ctx).unwrap_err();
        drop(ctx);
        assert_eq!(error.code, "METER_FAILURE");
        assert_eq!(observed_units, 33);
    }

    #[test]
    fn rejects_duplicate_keys_and_invalid_numbers_preserving_raw_utf16_paths() {
        let duplicate = Value::Object(vec![
            (Utf16::from("x/~"), Value::Null),
            (Utf16::from("x/~"), Value::Bool(true)),
        ]);
        let error = copy_completed_json_result(&duplicate, &mut Context::ordinary()).unwrap_err();
        assert_eq!(error.code, "DUPLICATE_KEY");
        assert_eq!(error.path.to_utf8().unwrap(), "/x~1~0");

        let value = Value::Object(vec![(Utf16::new(vec![0xd800]), Value::Null)]);
        let mut limits = Limits::ordinary();
        limits.max_values = 1;
        let mut ctx = Context::with_limits(ResourceProfile::Cooperative, limits).unwrap();
        let error = copy_completed_json_result(&value, &mut ctx).unwrap_err();
        assert_eq!(error.code, "LIMIT");
        assert_eq!(error.path, Utf16::new(vec![b'/' as u16, 0xd800]));

        let error = copy_completed_json_result(&Value::Number(f64::NAN), &mut Context::ordinary())
            .unwrap_err();
        assert_eq!(error.code, "NUMBER");
    }
}

impl std::fmt::Debug for Utf16 {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self.to_utf8() {
            Ok(value) => f.debug_tuple("Utf16").field(&value).finish(),
            Err(_) => f.debug_tuple("Utf16").field(&self.units()).finish(),
        }
    }
}

impl From<&str> for Utf16 {
    fn from(value: &str) -> Self {
        Self::from_utf8(value)
    }
}

impl From<String> for Utf16 {
    fn from(value: String) -> Self {
        Self::from_utf8(&value)
    }
}

/// JSON-compatible values owned by UMF. Object pairs retain storage order and
/// are checked for duplicate UTF-16 keys at every public admission boundary.
#[derive(Clone, Debug, PartialEq)]
pub enum Value {
    Null,
    Bool(bool),
    Number(f64),
    String(Utf16),
    Array(Vec<Value>),
    Object(Vec<(Utf16, Value)>),
}

impl Value {
    pub fn number(value: f64, path: Utf16) -> Result<Self, EngineError> {
        validate_number(value, path)?;
        Ok(Self::Number(value))
    }

    pub fn string_utf8(value: impl AsRef<str>) -> Self {
        Self::String(Utf16::from_utf8(value.as_ref()))
    }

    /// Construct an ordered object while rejecting duplicate decoded keys.
    /// Full resource accounting is applied when the value crosses an operation
    /// admission boundary such as `copy_json`.
    pub fn object(members: Vec<(Utf16, Value)>, path: Utf16) -> Result<Self, EngineError> {
        let mut seen = BTreeSet::new();
        for (key, _) in &members {
            if !seen.insert(key.units().to_vec()) {
                return Err(EngineError::new(
                    "DUPLICATE_KEY",
                    path.clone(),
                    "Duplicate object key",
                ));
            }
        }
        Ok(Self::Object(members))
    }
}

const MAX_SAFE_INTEGER: f64 = 9_007_199_254_740_991.0;

/// ECMAScript Number::toString formatting for the interoperable binary64
/// profile. Shared by serialization and exact source-token admission.
pub fn ecma_number_to_string(value: f64) -> String {
    let mut buffer = ryu_js::Buffer::new();
    buffer.format_finite(value).to_owned()
}

pub(crate) fn validate_owned_number(value:f64,path:&mut Utf16)->Result<(),EngineError>{
    validate_number(value,Utf16::default()).map_err(|mut error|{error.path=std::mem::take(path);error})
}
fn validate_number(value: f64, path: Utf16) -> Result<(), EngineError> {
    if !value.is_finite()
        || (value == 0.0 && value.is_sign_negative())
        || (value.fract() == 0.0 && value.abs() > MAX_SAFE_INTEGER)
    {
        return Err(EngineError::new(
            "NUMBER",
            path,
            "Number outside the core interoperable numeric profile",
        ));
    }
    Ok(())
}

/// Validate and copy one JSON tree without collapsing ordered members or UTF-16
/// strings. Value-count limits apply to this tree; caller meters remain cumulative.
pub fn copy_json(value: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    copy_json_with_numbers(value, ctx, true)
}

/// Copy a tagged host value without reinterpreting its IEEE 754 bits as core
/// document numbers. The same tree limits and object-key checks apply.
#[doc(hidden)]
pub fn copy_host_value(value: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    copy_json_with_numbers(value, ctx, false)
}

fn copy_json_with_numbers(
    value: &Value,
    ctx: &mut Context<'_>,
    require_core_numbers: bool,
) -> Result<Value, EngineError> {
    ctx.with_work_phase("native-core-copy", |ctx| {
    fn visit(
        value: &Value,
        ctx: &mut Context<'_>,
        path: &Utf16,
        depth: usize,
        tree_values: &mut usize,
        require_core_numbers: bool,
    ) -> Result<Value, EngineError> {
        ctx.charge_work(1, path.clone())?;
        *tree_values = tree_values
            .checked_add(1)
            .ok_or_else(|| EngineError::new("LIMIT", path.clone(), "JSON value count overflow"))?;
        ctx.check_tree_value_count(*tree_values, path.clone())?;
        if depth > ctx.limits().max_depth {
            return Err(EngineError::new(
                "LIMIT",
                path.clone(),
                "JSON nesting depth exceeded",
            ));
        }
        match value {
            Value::Null => Ok(Value::Null),
            Value::Bool(value) => Ok(Value::Bool(*value)),
            Value::Number(value) => {
                if require_core_numbers {
                    validate_number(*value, path.clone())?;
                }
                Ok(Value::Number(*value))
            }
            Value::String(value) => {
                ctx.charge_work(value.len(), path.clone())?;
                Ok(Value::String(value.clone()))
            }
            Value::Array(items) => {
                if items.len() > ctx.limits().max_values.saturating_sub(*tree_values) {
                    return Err(EngineError::new(
                        "LIMIT",
                        path.clone(),
                        "JSON structural value limit exceeded",
                    ));
                }
                ctx.charge_work(items.len(), path.clone())?;
                let mut copy = Vec::with_capacity(items.len());
                for (index, item) in items.iter().enumerate() {
                    copy.push(visit(
                        item,
                        ctx,
                        &append_path(path, &Utf16::from(index.to_string())),
                        depth + 1,
                        tree_values,
                        require_core_numbers,
                    )?);
                }
                Ok(Value::Array(copy))
            }
            Value::Object(members) => {
                if members.len() > ctx.limits().max_values.saturating_sub(*tree_values) {
                    return Err(EngineError::new(
                        "LIMIT",
                        path.clone(),
                        "JSON structural value limit exceeded",
                    ));
                }
                ctx.charge_work(members.len(), path.clone())?;
                let mut seen = BTreeSet::new();
                let mut copy = Vec::with_capacity(members.len());
                for (key, item) in members {
                    ctx.charge_work(key.len(), path.clone())?;
                    if !seen.insert(key.units().to_vec()) {
                        return Err(EngineError::new(
                            "DUPLICATE_KEY",
                            path.clone(),
                            "Duplicate object key",
                        ));
                    }
                    copy.push((
                        key.clone(),
                        visit(item, ctx, &append_path(path, key), depth + 1, tree_values, require_core_numbers)?,
                    ));
                }
                Ok(Value::Object(copy))
            }
        }
    }

    let mut tree_values = 0;
    visit(value, ctx, &Utf16::default(), 0, &mut tree_values, require_core_numbers)

    })
}

/// Internal consuming custody for an explicitly owned native factory operation.
/// Creating an operation conveys no value/profile proof.
#[doc(hidden)]
#[derive(Debug)]
pub struct OwnedCoreOperation {
    identity:std::sync::Arc<()>,
    resource_profile:crate::context::ResourceProfile,
}
impl OwnedCoreOperation {
    /// One explicit owning Context lifetime, spanning its existing catalogue
    /// scopes. A nested operation restores its parent on return/error/unwind;
    /// counters/controls never reset. An operation reference cannot escape.
    pub fn with_context<'a,T>(ctx:&mut Context<'a>,run:impl FnOnce(&mut Context<'a>,&Self)->Result<T,EngineError>)->Result<T,EngineError>{
        Self::with_context_impl(ctx,run,&mut |_|{})
    }
    #[cfg(test)]
    fn with_context_with_events<'a,T>(ctx:&mut Context<'a>,run:impl FnOnce(&mut Context<'a>,&Self)->Result<T,EngineError>,observer:&mut dyn FnMut(&'static str))->Result<T,EngineError>{Self::with_context_impl(ctx,run,observer)}
    fn with_context_impl<'a,T>(ctx:&mut Context<'a>,run:impl FnOnce(&mut Context<'a>,&Self)->Result<T,EngineError>,observer:&mut dyn FnMut(&'static str))->Result<T,EngineError>{
        struct Scope<'c,'a>{ctx:&'c mut Context<'a>,prior:Option<std::sync::Arc<()>>}
        impl Drop for Scope<'_,'_>{fn drop(&mut self){self.ctx.owned_core_operation=self.prior.take();}}
        ctx.charge_work(std::mem::size_of::<Self>().div_ceil(std::mem::size_of::<usize>()).saturating_add(3),Utf16::default())?;
        observer("operation-publication");
        let operation=Self{identity:std::sync::Arc::new(()),resource_profile:ctx.profile()};
        let prior=ctx.owned_core_operation.replace(std::sync::Arc::clone(&operation.identity));
        let scope=Scope{ctx,prior};
        run(&mut *scope.ctx,&operation)
    }
}
#[derive(Debug,PartialEq,Eq)]
enum CoreJsonOrigin {NativeResourceHash,CheckedSchemaCopy}
#[derive(Debug)]
enum CompletedCoreProfile {OrderedUtf16SafeBinary64}
/// No Clone, mutable access, unchecked constructor, decoder or caller proof flag.
/// A raw Value obtained by consuming this carrier no longer carries custody.
#[doc(hidden)]
#[derive(Debug)]
pub struct OwnedCoreJson {
    value:Value,
    limits:crate::context::Limits,
    resource_profile:crate::context::ResourceProfile,
    profile:CompletedCoreProfile,
    origin:CoreJsonOrigin,
    operation:Option<std::sync::Arc<()>>,
    structure:Option<std::sync::Arc<crate::schema::admitted_structure::Structure>>,
}
impl OwnedCoreJson {
    /// The only native-root mint executes the COMPLETE shared validator first,
    /// with its original '#' diagnostic root and work/error ordering.
    pub fn admit_native_resource(value:Value,operation:&OwnedCoreOperation,ctx:&mut Context<'_>)->Result<Self,EngineError>{
        Self::admit_native_resource_impl(value,operation,ctx,&mut |_|{})
    }
    #[cfg(test)]
    fn admit_native_resource_with_events(value:Value,operation:&OwnedCoreOperation,ctx:&mut Context<'_>,observer:&mut dyn FnMut(&'static str))->Result<Self,EngineError>{Self::admit_native_resource_impl(value,operation,ctx,observer)}
    fn admit_native_resource_impl(value:Value,operation:&OwnedCoreOperation,ctx:&mut Context<'_>,observer:&mut dyn FnMut(&'static str))->Result<Self,EngineError>{
        let value=admit_owned_json_at(value,Utf16::from("#"),ctx)?;
        Self::mint_completed_impl(value,CoreJsonOrigin::NativeResourceHash,operation,ctx,observer)
    }
    /// Closed-factory metadata hint; full profile validation is unconditional.
    #[doc(hidden)]
    pub fn admit_factory_resource(value:Value,name:&Utf16,operation:&OwnedCoreOperation,ctx:&mut Context<'_>)->Result<Self,EngineError>{Self::admit_factory_resource_impl(value,name,operation,ctx,&mut |_|{})}
    #[cfg(test)]
    pub(crate) fn admit_factory_resource_with_events(value:Value,name:&Utf16,operation:&OwnedCoreOperation,ctx:&mut Context<'_>,event:&mut dyn FnMut(&'static str))->Result<Self,EngineError>{Self::admit_factory_resource_impl(value,name,operation,ctx,event)}
    fn admit_factory_resource_impl(value:Value,name:&Utf16,operation:&OwnedCoreOperation,ctx:&mut Context<'_>,event:&mut dyn FnMut(&'static str))->Result<Self,EngineError>{
        let mut collect=false;
        for role in ["coreSchema","referenceSchema","packageSchema"] {
            ctx.charge_work(name.len().saturating_add(role.len()).saturating_add(1),Utf16::default())?;
            if name.units().iter().copied().eq(role.encode_utf16()){collect=true;break;}
        }
        if !collect {return Self::admit_native_resource_impl(value,operation,ctx,event);}
        let(value,structure)=admit_factory_json(value,ctx,event)?;
        Self::mint_with_structure(value,CoreJsonOrigin::NativeResourceHash,operation,structure,ctx,event)
    }
    pub(crate) fn into_core_metadata(self,operation:&OwnedCoreOperation,ctx:&mut Context<'_>)->Result<(Value,Option<std::sync::Arc<crate::schema::admitted_structure::Structure>>),EngineError>{self.into_core_metadata_impl(operation,ctx,&mut |_|{})}
    #[cfg(test)]
    fn into_core_metadata_with_events(self,operation:&OwnedCoreOperation,ctx:&mut Context<'_>,event:&mut dyn FnMut(&'static str))->Result<(Value,Option<std::sync::Arc<crate::schema::admitted_structure::Structure>>),EngineError>{self.into_core_metadata_impl(operation,ctx,event)}
    fn into_core_metadata_impl(self,operation:&OwnedCoreOperation,ctx:&mut Context<'_>,event:&mut dyn FnMut(&'static str))->Result<(Value,Option<std::sync::Arc<crate::schema::admitted_structure::Structure>>),EngineError>{
        if self.compatible(CoreJsonOrigin::NativeResourceHash,operation,ctx)? {
            // Actual second profile/limits readback plus optional-fact guard.
            ctx.charge_work(std::mem::size_of::<crate::context::Limits>().div_ceil(std::mem::size_of::<usize>()).saturating_add(4),Utf16::default())?;
            let structure=self.structure.filter(|s|s.compatible(ctx)&&s.core_role_facts().is_some());
            event("carrier-metadata-transfer");
            Ok((self.value,structure))
        }else{Ok((admit_owned_json_at(self.value,Utf16::default(),ctx)?,None))}
    }
    fn mint_completed(value:Value,origin:CoreJsonOrigin,operation:&OwnedCoreOperation,ctx:&mut Context<'_>)->Result<Self,EngineError>{
        Self::mint_completed_impl(value,origin,operation,ctx,&mut |_|{})
    }
    fn mint_completed_impl(value:Value,origin:CoreJsonOrigin,operation:&OwnedCoreOperation,ctx:&mut Context<'_>,observer:&mut dyn FnMut(&'static str))->Result<Self,EngineError>{
        Self::mint_with_structure(value,origin,operation,None,ctx,observer)
    }
    fn mint_with_structure(value:Value,origin:CoreJsonOrigin,operation:&OwnedCoreOperation,structure:Option<std::sync::Arc<crate::schema::admitted_structure::Structure>>,ctx:&mut Context<'_>,observer:&mut dyn FnMut(&'static str))->Result<Self,EngineError>{
        ctx.charge_work(std::mem::size_of::<Self>().div_ceil(std::mem::size_of::<usize>()).saturating_add(2),Utf16::default())?;
        observer("carrier-publication");
        Ok(Self{value,structure,limits:ctx.limits(),resource_profile:ctx.profile(),profile:CompletedCoreProfile::OrderedUtf16SafeBinary64,origin,operation:ctx.owned_core_operation.as_ref().filter(|active|std::sync::Arc::ptr_eq(active,&operation.identity)).map(std::sync::Arc::clone)})
    }
    pub fn value(&self)->&Value{&self.value}
    pub fn into_raw(self)->Value{self.value}
    fn compatible(&self,expected:CoreJsonOrigin,operation:&OwnedCoreOperation,ctx:&mut Context<'_>)->Result<bool,EngineError>{
        ctx.charge_work(std::mem::size_of::<crate::context::Limits>().div_ceil(std::mem::size_of::<usize>()).saturating_add(7),Utf16::default())?;
        Ok(matches!(self.profile,CompletedCoreProfile::OrderedUtf16SafeBinary64)
            && self.limits==ctx.limits()
            && self.resource_profile==ctx.profile()&&operation.resource_profile==ctx.profile()
            && self.origin==expected&&self.operation.as_ref().is_some_and(|minted|std::sync::Arc::ptr_eq(minted,&operation.identity))
            &&ctx.owned_core_operation.as_ref().is_some_and(|active|std::sync::Arc::ptr_eq(active,&operation.identity)))
    }
    /// Internal constructor consumption point. A mismatch retains the original
    /// paid admission at that point; it does not turn into a new refusal mode.
    pub fn into_resource(self,operation:&OwnedCoreOperation,ctx:&mut Context<'_>)->Result<Value,EngineError>{
        if self.compatible(CoreJsonOrigin::NativeResourceHash,operation,ctx)?{Ok(self.value)}
        else {admit_owned_json_at(self.value,Utf16::default(),ctx)}
    }
    pub fn into_schema_copy(self,operation:&OwnedCoreOperation,ctx:&mut Context<'_>)->Result<Value,EngineError>{
        if self.compatible(CoreJsonOrigin::CheckedSchemaCopy,operation,ctx)?{Ok(self.value)}
        else {admit_owned_json_at(self.value,Utf16::default(),ctx)}
    }
    /// Preserve the wire builder's actual checked copy, diagnostic root and
    /// root-relative limits. The copy's completed shared validator mints this
    /// distinct root; it is never a borrowed projection/parent identity claim.
    pub fn copy_schema_member(&self,operation:&OwnedCoreOperation,ctx:&mut Context<'_>,missing_message:&str)->Result<Self,EngineError>{
        self.copy_schema_member_impl(operation,ctx,missing_message,&mut |_|{})
    }
    #[cfg(test)]
    fn copy_schema_member_with_events(&self,operation:&OwnedCoreOperation,ctx:&mut Context<'_>,missing_message:&str,observer:&mut dyn FnMut(&'static str))->Result<Self,EngineError>{self.copy_schema_member_impl(operation,ctx,missing_message,observer)}
    fn copy_schema_member_impl(&self,operation:&OwnedCoreOperation,ctx:&mut Context<'_>,missing_message:&str,observer:&mut dyn FnMut(&'static str))->Result<Self,EngineError>{
        let mut selected=None;
        if let Value::Object(fields)=&self.value {
            for(key,value)in fields {
                ctx.charge_work(key.len().min(6).saturating_add(1),Utf16::default())?;
                observer("schema-member-read");
                if key.units().iter().copied().eq("schema".encode_utf16()){selected=Some(value);break;}
            }
        }
        let value=selected.ok_or_else(||EngineError::new("REQUEST",Utf16::default(),missing_message))?;
        let copy=copy_json(value,ctx)?;
        observer("schema-copy-completed");
        Self::mint_completed_impl(copy,CoreJsonOrigin::CheckedSchemaCopy,operation,ctx,observer)
    }
}

/// Consume an owned value through the existing shared JSON validator without
/// allocating another tree. Keep the same cumulative admission charges.
pub fn admit_owned_json(value: Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    admit_owned_json_at(value, Utf16::default(), ctx)
}

/// Preserve an existing caller diagnostic root while using the same validator.
pub fn admit_owned_json_at(value: Value, root: Utf16, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    ctx.with_work_phase("native-core-copy", |ctx| validate_json_at(&value, &root, ctx))?;
    Ok(value)
}

/// Copy an already-admitted completed public result with TypeScript's
/// nodewise structural-limit order. Generic input copies intentionally retain
/// `copy_json`'s existing error and preflight behavior.
pub(crate) fn copy_completed_json_result(
    value: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    fn child_path(
        path: &Utf16,
        segment: &Utf16,
        ctx: &mut Context<'_>,
    ) -> Result<Utf16, EngineError> {
        let escaped_capacity = segment
            .len()
            .checked_mul(2)
            .and_then(|size| path.len().checked_add(size))
            .and_then(|size| size.checked_add(1))
            .ok_or_else(|| {
                EngineError::new("LIMIT", path.clone(), "JSON pointer length overflow")
            })?;
        ctx.charge_work(escaped_capacity, Utf16::default())?;
        let mut units = Vec::new();
        units.try_reserve_exact(escaped_capacity).map_err(|_| {
            EngineError::new("LIMIT", path.clone(), "JSON pointer allocation failed")
        })?;
        units.extend_from_slice(path.units());
        units.push(b'/' as u16);
        for unit in segment.units() {
            match unit {
                0x7e => units.extend([0x7e, 0x30]),
                0x2f => units.extend([0x7e, 0x31]),
                unit => units.push(*unit),
            }
        }
        Ok(Utf16::new(units))
    }

    fn visit(
        value: &Value,
        ctx: &mut Context<'_>,
        path: &Utf16,
        depth: usize,
        count: &mut usize,
    ) -> Result<Value, EngineError> {
        ctx.charge_work(1, path.clone())?;
        *count = count.checked_add(1).ok_or_else(|| {
            EngineError::new("LIMIT", path.clone(), "JSON structural limit exceeded")
        })?;
        if *count > ctx.limits().max_values || depth > ctx.limits().max_depth {
            return Err(EngineError::new(
                "LIMIT",
                path.clone(),
                "JSON structural limit exceeded",
            ));
        }
        match value {
            Value::Null => Ok(Value::Null),
            Value::Bool(value) => Ok(Value::Bool(*value)),
            Value::Number(value) => Value::number(*value, path.clone()),
            Value::String(value) => {
                ctx.charge_work(value.len(), path.clone())?;
                Ok(Value::String(value.clone()))
            }
            Value::Array(items) => {
                let mut copied = Vec::new();
                for (index, item) in items.iter().enumerate() {
                    let child = child_path(path, &Utf16::from(index.to_string()), ctx)?;
                    copied.try_reserve(1).map_err(|_| {
                        EngineError::new("LIMIT", child.clone(), "JSON structural limit exceeded")
                    })?;
                    copied.push(visit(item, ctx, &child, depth + 1, count)?);
                }
                Ok(Value::Array(copied))
            }
            Value::Object(members) => {
                let mut seen: HashSet<&Utf16> = HashSet::new();
                let mut copied = Vec::new();
                for (key, item) in members {
                    ctx.charge_work(key.len(), path.clone())?;
                    let child = child_path(path, key, ctx)?;
                    ctx.charge_work(1, path.clone())?;
                    seen.try_reserve(1).map_err(|_| {
                        EngineError::new("LIMIT", child.clone(), "JSON structural limit exceeded")
                    })?;
                    if !seen.insert(key) {
                        return Err(EngineError::new(
                            "DUPLICATE_KEY",
                            child,
                            "Duplicate object key",
                        ));
                    }
                    copied.try_reserve(1).map_err(|_| {
                        EngineError::new("LIMIT", child.clone(), "JSON structural limit exceeded")
                    })?;
                    copied.push((key.clone(), visit(item, ctx, &child, depth + 1, count)?));
                }
                Ok(Value::Object(copied))
            }
        }
    }

    visit(value, ctx, &Utf16::default(), 0, &mut 0)
}

/// Validate an already-owned JSON tree using the same accounting and
/// precedence as [`copy_json`], without allocating a duplicate tree.
pub(crate) fn validate_json(value: &Value, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    validate_json_at(value, &Utf16::default(), ctx)
}

fn validate_json_at(value: &Value, root: &Utf16, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    validate_json_at_observed(value,root,ctx,&mut |_,_,_,_,_|Ok(()))
}
pub(crate) fn admit_owned_json_with_members(
    value:Value,ctx:&mut Context<'_>,observer:&mut impl FnMut(usize,&Utf16,&Value,usize,&mut Context<'_>)->Result<(),EngineError>,
)->Result<Value,EngineError> {
    if ctx.in_codegen_construction(){return admit_owned_json_with_structure(value,ctx,observer).map(|(value,_)|value);}
    ctx.with_work_phase("native-core-copy",|ctx|validate_json_at_observed(&value,&Utf16::default(),ctx,observer))?;
    Ok(value)
}
pub(crate) fn admit_owned_json_with_structure(
    value:Value,ctx:&mut Context<'_>,observer:&mut impl FnMut(usize,&Utf16,&Value,usize,&mut Context<'_>)->Result<(),EngineError>,
)->Result<(Value,Option<std::sync::Arc<crate::schema::admitted_structure::Structure>>),EngineError>{
    admit_owned_json_private(value,ctx,observer,true)
}
fn admit_owned_json_private(
    value:Value,ctx:&mut Context<'_>,observer:&mut impl FnMut(usize,&Utf16,&Value,usize,&mut Context<'_>)->Result<(),EngineError>,collect:bool,
)->Result<(Value,Option<std::sync::Arc<crate::schema::admitted_structure::Structure>>),EngineError>{
    use crate::schema::admitted_structure::Builder;
    fn visit(value:&Value,depth:usize,path:&mut Utf16,count:&mut usize,structure:&mut Builder,ctx:&mut Context<'_>,observer:&mut impl FnMut(usize,&Utf16,&Value,usize,&mut Context<'_>)->Result<(),EngineError>)->Result<(),EngineError>{
        ctx.charge_work_with_path(1,path)?;
        *count=count.checked_add(1).ok_or_else(||EngineError::new("LIMIT",std::mem::take(path),"JSON value count overflow"))?;
        ctx.check_tree_value_count_with_path(*count,path)?;
        if depth>ctx.limits().max_depth{return Err(EngineError::new("LIMIT",std::mem::take(path),"JSON nesting depth exceeded"));}
        structure.enter(depth,ctx,path)?;
        match value {
            Value::Null|Value::Bool(_)=>{},
            Value::Number(number)=>{validate_number(*number,Utf16::default()).map_err(|mut error|{error.path=std::mem::take(path);error})?;},
            Value::String(text)=>ctx.charge_work_with_path(text.len(),path)?,
            Value::Array(items)=>{
                if items.len()>ctx.limits().max_values.saturating_sub(*count){return Err(EngineError::new("LIMIT",std::mem::take(path),"JSON structural value limit exceeded"));}
                ctx.charge_work_with_path(items.len(),path)?;
                for(index,item)in items.iter().enumerate(){
                    let digits=if index==0{1}else{index.ilog10() as usize+1};
                    ctx.charge_work_with_path(digits.saturating_mul(3).saturating_add(2),path)?;
                    let segment=Utf16::from(index.to_string());
                    let parent=path.push_owned_path_segment(&segment,ctx)?;
                    visit(item,depth+1,path,count,structure,ctx,observer)?;
                    path.restore_owned_path(parent,ctx)?;
                }
            },
            Value::Object(members)=>{
                if members.len()>ctx.limits().max_values.saturating_sub(*count){return Err(EngineError::new("LIMIT",std::mem::take(path),"JSON structural value limit exceeded"));}
                ctx.charge_work_with_path(members.len(),path)?;
                for(member,(key,item))in members.iter().enumerate(){
                    // Borrow prior immutable keys: no copied key store, no
                    // uncharged BTree comparison or hash/identity shortcut.
                    for(previous,_)in &members[..member]{
                        ctx.charge_work_with_path(3,path)?;
                        if previous.len()!=key.len(){continue;}
                        let mut equal=true;
                        for i in 0..key.len(){ctx.charge_work_with_path(3,path)?;if previous.units()[i]!=key.units()[i]{equal=false;break;}}
                        if equal{return Err(EngineError::new("DUPLICATE_KEY",std::mem::take(path),"Duplicate object key"));}
                    }
                    observer(member,key,item,depth,ctx)?;
                    structure.member(key,matches!(item,Value::String(_)),ctx,path)?;
                    let parent=path.push_owned_path_segment(key,ctx)?;
                    visit(item,depth+1,path,count,structure,ctx,observer)?;
                    path.restore_owned_path(parent,ctx)?;
                }
            },
        }
        structure.leave(ctx,path)
    }
    let mut structure=if collect{Builder::default()}else{Builder::disabled()};
    ctx.with_work_phase("native-core-copy",|ctx|visit(&value,0,&mut Utf16::default(),&mut 0,&mut structure,ctx,observer))?;
    let structure=structure.complete(ctx)?;
    Ok((value,structure))
}
fn admit_factory_json(value:Value,ctx:&mut Context<'_>,event:&mut dyn FnMut(&'static str))->Result<(Value,Option<std::sync::Arc<crate::schema::admitted_structure::Structure>>),EngineError>{
    crate::schema::admitted_structure::closed::with_root(|root|{
        let mut collector=PaidJsonAdmissionCollector{root,event};
        let mut tree_values=0;
        // Real original checked counter and original root buffer; metadata's
        // root/child brand cannot escape this closed complete invocation.
        ctx.with_work_phase("native-core-copy",|ctx|visit_json_with_collector(&value,ctx,JsonAdmissionPath::Owned(Utf16::from("#")),0,&mut tree_values,&mut |_,_,_,_,_|Ok(()),&mut collector,None))?;
        let structure=collector.root.complete(tree_values,ctx,collector.event)?;
        Ok((value,structure))
    })
}
// Closed private path custody. Borrowed ordinary roots are never cloned to
// enable observation. Each child is the ORIGINAL append_path result, moved
// once into this holder; original charge/error clones remain unchanged.
enum JsonAdmissionPath<'p> {Borrowed(&'p Utf16),Owned(Utf16)}
impl JsonAdmissionPath<'_> {
    fn original(&self)->&Utf16 {match self{Self::Borrowed(p)=>p,Self::Owned(p)=>p}}
    fn for_collector(&mut self)->&mut Utf16 {match self{Self::Owned(p)=>p,Self::Borrowed(_)=>unreachable!("closed collector owns actual node path")}}
}
trait JsonAdmissionCollector {
    type Node;type Summary;
    fn scalar(&mut self,count:usize,depth:usize,parent:Option<(&Self::Node,usize)>,path:&mut JsonAdmissionPath<'_>,ctx:&mut Context<'_>)->Result<Self::Summary,EngineError>;
    fn container(&mut self,count:usize,depth:usize,parent:Option<(&Self::Node,usize)>,path:&mut JsonAdmissionPath<'_>,ctx:&mut Context<'_>)->Result<Self::Node,EngineError>;
    fn member(&mut self,node:&mut Self::Node,ordinal:usize,key:&Utf16,is_string:bool,path:&mut JsonAdmissionPath<'_>,ctx:&mut Context<'_>)->Result<(),EngineError>;
    fn merge(&mut self,node:&mut Self::Node,child:Self::Summary,path:&mut JsonAdmissionPath<'_>,ctx:&mut Context<'_>)->Result<(),EngineError>;
    fn finish(&mut self,node:Self::Node,children:usize,end_count:usize,path:&mut JsonAdmissionPath<'_>,ctx:&mut Context<'_>)->Result<Self::Summary,EngineError>;
}
struct NoJsonAdmissionCollector;
impl JsonAdmissionCollector for NoJsonAdmissionCollector {
    type Node=();type Summary=();
    fn scalar(&mut self,_:usize,_:usize,_:Option<(&(),usize)>,_:&mut JsonAdmissionPath<'_>,_:&mut Context<'_>)->Result<(),EngineError>{Ok(())}
    fn container(&mut self,_:usize,_:usize,_:Option<(&(),usize)>,_:&mut JsonAdmissionPath<'_>,_:&mut Context<'_>)->Result<(),EngineError>{Ok(())}
    fn member(&mut self,_:&mut (),_:usize,_:&Utf16,_:bool,_:&mut JsonAdmissionPath<'_>,_:&mut Context<'_>)->Result<(),EngineError>{Ok(())}
    fn merge(&mut self,_:&mut (),_:(),_:&mut JsonAdmissionPath<'_>,_:&mut Context<'_>)->Result<(),EngineError>{Ok(())}
    fn finish(&mut self,_:(),_:usize,_:usize,_:&mut JsonAdmissionPath<'_>,_:&mut Context<'_>)->Result<(),EngineError>{Ok(())}
}
struct PaidJsonAdmissionCollector<'r,'e> {
    root:crate::schema::admitted_structure::closed::ClosedRoot<'r>,
    event:&'e mut dyn FnMut(&'static str),
}
impl<'r> JsonAdmissionCollector for PaidJsonAdmissionCollector<'r,'_> {
    type Node=crate::schema::admitted_structure::closed::Container<'r>;
    type Summary=crate::schema::admitted_structure::closed::Summary<'r>;
    fn scalar(&mut self,count:usize,depth:usize,parent:Option<(&Self::Node,usize)>,path:&mut JsonAdmissionPath<'_>,ctx:&mut Context<'_>)->Result<Self::Summary,EngineError>{self.root.scalar(count,depth,parent,ctx,path.for_collector(),self.event)}
    fn container(&mut self,count:usize,depth:usize,parent:Option<(&Self::Node,usize)>,path:&mut JsonAdmissionPath<'_>,ctx:&mut Context<'_>)->Result<Self::Node,EngineError>{self.root.container(count,depth,parent,ctx,path.for_collector(),self.event)}
    fn member(&mut self,node:&mut Self::Node,ordinal:usize,key:&Utf16,is_string:bool,path:&mut JsonAdmissionPath<'_>,ctx:&mut Context<'_>)->Result<(),EngineError>{self.root.member(node,ordinal,key,is_string,ctx,path.for_collector(),self.event)}
    fn merge(&mut self,node:&mut Self::Node,child:Self::Summary,path:&mut JsonAdmissionPath<'_>,ctx:&mut Context<'_>)->Result<(),EngineError>{self.root.merge(node,child,ctx,path.for_collector(),self.event)}
    fn finish(&mut self,node:Self::Node,children:usize,end_count:usize,path:&mut JsonAdmissionPath<'_>,ctx:&mut Context<'_>)->Result<Self::Summary,EngineError>{self.root.finish(node,children,end_count,ctx,path.for_collector(),self.event)}
}
fn visit_json_with_collector<F: FnMut(usize,&Utf16,&Value,usize,&mut Context<'_>)->Result<(),EngineError>,C: JsonAdmissionCollector>(
        value: &Value,
        ctx: &mut Context<'_>,
        mut path: JsonAdmissionPath<'_>,
        depth: usize,
        tree_values: &mut usize,
        observer: &mut F,
        collector: &mut C,
        parent:Option<(&C::Node,usize)>,
    ) -> Result<C::Summary, EngineError> {
        ctx.charge_work(1, path.original().clone())?;
        *tree_values = tree_values
            .checked_add(1)
            .ok_or_else(|| EngineError::new("LIMIT", path.original().clone(), "JSON value count overflow"))?;
        ctx.check_tree_value_count(*tree_values, path.original().clone())?;
        if depth > ctx.limits().max_depth {
            return Err(EngineError::new(
                "LIMIT",
                path.original().clone(),
                "JSON nesting depth exceeded",
            ));
        }
        match value {
            Value::Null | Value::Bool(_) => collector.scalar(*tree_values,depth,parent,&mut path,ctx),
            Value::Number(number) => {validate_number(*number, path.original().clone())?;collector.scalar(*tree_values,depth,parent,&mut path,ctx)},
            Value::String(text) => {ctx.charge_work(text.len(), path.original().clone())?;collector.scalar(*tree_values,depth,parent,&mut path,ctx)},
            Value::Array(items) => {
                if items.len() > ctx.limits().max_values.saturating_sub(*tree_values) {
                    return Err(EngineError::new(
                        "LIMIT",
                        path.original().clone(),
                        "JSON structural value limit exceeded",
                    ));
                }
                ctx.charge_work(items.len(), path.original().clone())?;
                let mut node=collector.container(*tree_values,depth,parent,&mut path,ctx)?;
                for (index, item) in items.iter().enumerate() {
                    let child_path=append_path(path.original(), &Utf16::from(index.to_string()));
                    let child=visit_json_with_collector(
                        item,
                        ctx,
                        JsonAdmissionPath::Owned(child_path),
                        depth + 1,
                        tree_values,observer,collector,Some((&node,index)),
                    )?;
                    collector.merge(&mut node,child,&mut path,ctx)?;
                }
                collector.finish(node,items.len(),*tree_values,&mut path,ctx)
            }
            Value::Object(members) => {
                if members.len() > ctx.limits().max_values.saturating_sub(*tree_values) {
                    return Err(EngineError::new(
                        "LIMIT",
                        path.original().clone(),
                        "JSON structural value limit exceeded",
                    ));
                }
                ctx.charge_work(members.len(), path.original().clone())?;
                let mut node=collector.container(*tree_values,depth,parent,&mut path,ctx)?;
                let mut seen = BTreeSet::new();
                for (member,(key, item)) in members.iter().enumerate() {
                    ctx.charge_work(key.len(), path.original().clone())?;
                    if !seen.insert(key.units().to_vec()) {
                        return Err(EngineError::new(
                            "DUPLICATE_KEY",
                            path.original().clone(),
                            "Duplicate object key",
                        ));
                    }
                    observer(member,key,item,depth,ctx)?;
                    collector.member(&mut node,member,key,matches!(item,Value::String(_)),&mut path,ctx)?;
                    let child_path=append_path(path.original(), key);
                    let child=visit_json_with_collector(item, ctx, JsonAdmissionPath::Owned(child_path), depth + 1, tree_values,observer,collector,Some((&node,member)))?;
                    collector.merge(&mut node,child,&mut path,ctx)?;
                }
                collector.finish(node,members.len(),*tree_values,&mut path,ctx)
            }
        }
    }
fn validate_json_at_observed(value:&Value,root:&Utf16,ctx:&mut Context<'_>,observer:&mut impl FnMut(usize,&Utf16,&Value,usize,&mut Context<'_>)->Result<(),EngineError>)->Result<(),EngineError> {
    let mut tree_values=0;
    visit_json_with_collector(value,ctx,JsonAdmissionPath::Borrowed(root),0,&mut tree_values,observer,&mut NoJsonAdmissionCollector,None)
}

fn append_path(path: &Utf16, key: &Utf16) -> Utf16 {
    let mut units = path.units().to_vec();
    units.push(b'/' as u16);
    for unit in key.units() {
        match unit {
            0x7e => units.extend([0x7e, 0x30]),
            0x2f => units.extend([0x7e, 0x31]),
            other => units.push(*other),
        }
    }
    Utf16::new(units)
}

#[cfg(test)]
mod borrowed_validation_tests {
    use super::{copy_json, validate_json, Utf16, Value};
    use crate::context::{Context, Limits, ResourceProfile};

    fn context_with_limits(limits: Limits) -> Context<'static> {
        Context::with_limits(ResourceProfile::Cooperative, limits).unwrap()
    }

    fn assert_copy_validation_parity(value: &Value, limits: Limits) {
        let mut copy_context = context_with_limits(limits);
        let mut validate_context = context_with_limits(limits);
        let copied = copy_json(value, &mut copy_context).map(|_| ());
        let validated = validate_json(value, &mut validate_context);
        assert_eq!(validated, copied);
        assert_eq!(validate_context.charged_work(), copy_context.charged_work());
    }

    #[test]
    fn borrowed_validation_matches_copy_errors_and_metering() {
        let nested = Value::Object(vec![(
            Utf16::from("a/~"),
            Value::Array(vec![Value::String(Utf16::from("text")), Value::Bool(true)]),
        )]);
        assert_copy_validation_parity(&nested, Limits::ordinary());

        let mut value_limit = Limits::ordinary();
        value_limit.max_values = 2;
        assert_copy_validation_parity(&nested, value_limit);

        let mut depth_limit = Limits::ordinary();
        depth_limit.max_depth = 1;
        assert_copy_validation_parity(&nested, depth_limit);

        let duplicate = Value::Object(vec![
            (Utf16::from("same"), Value::Null),
            (Utf16::from("same"), Value::Bool(false)),
        ]);
        assert_copy_validation_parity(&duplicate, Limits::ordinary());

        let invalid_number = Value::Array(vec![Value::Number(f64::NAN)]);
        assert_copy_validation_parity(&invalid_number, Limits::ordinary());
    }
}

#[cfg(test)]
mod owned_admission_owner_tests {
    use super::*;

    fn fixture() -> Value {
        Value::Object(vec![(Utf16::from("unknown/default"), Value::String(Utf16::from("retained")))])
    }

    #[test]
    fn owned_admission_retains_allocation_and_identical_ordinary_admission_charges() {
        let owned = fixture();
        let pointer = match &owned { Value::Object(v) => v.as_ptr(), _ => unreachable!() };
        let mut copied_charges = Vec::new();
        let mut copy_control = |n| { copied_charges.push(n); Ok(()) };
        let copied = copy_json(&fixture(), &mut Context::ordinary().with_host_control(&mut copy_control)).unwrap();
        let mut owned_charges = Vec::new();
        let mut owner_control = |n| { owned_charges.push(n); Ok(()) };
        let admitted = admit_owned_json(owned, &mut Context::ordinary().with_host_control(&mut owner_control)).unwrap();
        assert_eq!(copied, admitted);
        assert_eq!(copied_charges, owned_charges);
        assert!(matches!(&admitted, Value::Object(v) if v.as_ptr() == pointer));
    }

    #[test]
    fn owned_admission_keeps_duplicate_and_first_denial_refusals() {
        let duplicate = Value::Object(vec![(Utf16::from("x"), Value::Null), (Utf16::from("x"), Value::Null)]);
        assert_eq!(admit_owned_json(duplicate, &mut Context::ordinary()).unwrap_err().code, "DUPLICATE_KEY");
        let mut calls = 0;
        let mut stop = |_| { calls += 1; Err(EngineError::new("RESOURCE_LIMIT", Utf16::from("/first"), "first denied")) };
        let error = admit_owned_json(fixture(), &mut Context::ordinary().with_host_control(&mut stop)).unwrap_err();
        assert_eq!(calls, 1); assert_eq!(error.code, "RESOURCE_LIMIT");
        assert_eq!(error.path, Utf16::from("/first"));
    }
}

#[cfg(test)]
#[path="value_owned_core_json_independent_tests.rs"]
mod owned_core_json_independent_tests;

#[cfg(test)]
#[path="value_fused_admission_independent_tests.rs"]
mod fused_admission_independent_tests;

#[cfg(test)]
#[path="value_original_visit_independent_tests.rs"]
mod original_visit_independent_tests;

#[cfg(test)]
#[path="value_closed_metadata_independent_tests.rs"]
mod closed_metadata_independent_tests;

#[path="value_decimal_path.rs"]
pub(crate) mod decimal_path;
