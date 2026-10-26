// SPDX-License-Identifier: MIT OR Apache-2.0
//! Rust-owned guarded JSON copying over opaque host handles.
//!
//! The host retains values and performs only the closed primitive reflection
//! events declared here. Traversal order, admission, limits, paths, cycle
//! detection, and result construction belong to Rust.
use std::collections::{BTreeMap, BTreeSet};

use crate::{Context, EngineError, Utf16, Value};

const HOST_STRING_CHUNK_UNITS: usize = 8192;

/// Invocation-local identity assigned by the host to an opaque object value.
pub type HostHandle = u64;

/// Immutable invocation-local host string. The host keeps its contents and
/// serves bounded UTF-16 chunks on demand.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct HostStringRef {
    pub token: u64,
    pub units: usize,
    #[cfg(test)]
    test_units: std::sync::Arc<[u16]>,
}

/// A JavaScript property key for the opaque callback protocol. The iterator
/// variant lets Rust drive the native iterator protocol without converting a
/// Symbol to text or letting JavaScript flatten callback results.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum HostOpaqueKey {
    String(Vec<u16>),
    IteratorSymbol,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum HostOpaqueType {
    Object,
    Function,
    Symbol,
}

/// Invocation-local value crossing the opaque callback boundary. `Opaque`
/// identifies an object, function or symbol. Bigints carry a separate zero
/// bit because `0n` is falsy while nonzero bigints are truthy.
#[derive(Clone, Debug, PartialEq)]
pub enum HostOpaqueValue {
    Undefined,
    Null,
    Boolean(bool),
    Number(f64),
    String(HostStringRef),
    Opaque { handle: HostHandle, opaque_type: HostOpaqueType },
    BigInt { handle: HostHandle, is_zero: bool },
}

impl HostOpaqueValue {
    /// JavaScript ToBoolean for the closed representation.
    pub fn is_truthy(&self) -> bool {
        match self {
            Self::Undefined | Self::Null => false,
            Self::Boolean(value) => *value,
            Self::Number(value) => *value != 0.0 && !value.is_nan(),
            Self::String(value) => value.units != 0,
            Self::Opaque { .. } => true,
            Self::BigInt { is_zero, .. } => !is_zero,
        }
    }

    pub fn is_nullish(&self) -> bool {
        matches!(self, Self::Undefined | Self::Null)
    }
}

/// Receiver or argument supplied to a primitive host invocation.
#[derive(Clone, Debug, PartialEq)]
pub enum HostInvokeValue {
    Undefined,
    Opaque(HostHandle),
    Json(Value),
    /// Tagged JSON reconstructed with ordinary object prototypes. Semantic
    /// callback context records are ordinary TS object literals, while copied
    /// document/payload arguments retain the null-prototype JSON profile.
    JsonRootOrdinary(Value),
}

#[cfg(test)]
impl HostStringRef {
    pub(crate) fn fake(text: &str) -> Self {
        Self::fake_units(text.encode_utf16().collect())
    }
    pub(crate) fn fake_units(units: Vec<u16>) -> Self {
        use std::sync::atomic::{AtomicU64, Ordering};
        static NEXT: AtomicU64 = AtomicU64::new(1);
        let units: std::sync::Arc<[u16]> = units.into();
        Self {
            token: NEXT.fetch_add(1, Ordering::Relaxed),
            units: units.len(),
            test_units: units,
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub enum HostJsonKind {
    Null,
    Boolean(bool),
    Number(f64),
    String(HostStringRef),
    Object(HostHandle),
    Unsupported(&'static str),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum HostPrototype {
    OrdinaryObject,
    Null,
    Array,
    Other,
}

#[derive(Clone, Debug, PartialEq)]
pub enum HostDescriptorValue {
    Null,
    Boolean(bool),
    Number(f64),
    String(HostStringRef),
    Object(HostHandle),
    Unsupported(&'static str),
}

#[derive(Clone, Debug, PartialEq)]
pub struct HostPropertyDescriptor {
    pub key: HostStringRef,
    pub enumerable: bool,
    /// False means an accessor descriptor; its getter is never called.
    pub is_data: bool,
    /// Present only for data descriptors.
    pub value: Option<HostDescriptorValue>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct HostDescriptorSnapshot {
    pub token: u64,
    pub count: usize,
}

/// Closed reflection requests. `IsArray` is deliberately repeated at each
/// predecessor checkpoint instead of caching its first answer.
#[derive(Clone, Debug, PartialEq)]
pub enum HostJsonEvent {
    /// Perform one ordinary JavaScript property read. Unlike descriptor
    /// lookup, this can invoke an inherited getter or Proxy `get` trap.
    ReadProperty {
        handle: HostHandle,
        key: Vec<u16>,
    },
    Classify {
        handle: HostHandle,
    },
    GetPrototype {
        handle: HostHandle,
    },
    IsArray {
        handle: HostHandle,
    },
    OwnSymbolCount {
        handle: HostHandle,
    },
    DescriptorSnapshot {
        handle: HostHandle,
    },
    DescriptorAt {
        token: u64,
        index: usize,
    },
    ArrayIndexAtOrPastLength {
        handle: HostHandle,
        key: HostStringRef,
    },
    ArrayIsSparseOrExtended {
        handle: HostHandle,
    },
    ReadUtf16Chunk {
        token: u64,
        offset: usize,
        max_units: usize,
    },
    /// Execute the predecessor's native Unicode carrier loop against a
    /// Rust-owned admitted copy. Hosts must not resolve this value through an
    /// original input handle.
    UnicodeCount { value: Value },
    /// Read exactly one caller-owned property and retain object/function/
    /// symbol/bigint results as opaque handles. This is distinct from
    /// `ReadProperty`, whose classifier rejects non-JSON values.
    GetOpaqueProperty {
        receiver: HostInvokeValue,
        key: HostOpaqueKey,
        semantic_catch: bool,
    },
    /// Invoke one caller-owned function with the exact receiver and ordered
    /// arguments. Only semantic callbacks may request the special catch rule.
    InvokeOpaque {
        function: HostHandle,
        receiver: HostInvokeValue,
        args: Vec<HostInvokeValue>,
        semantic_catch: bool,
    },
    /// Perform the predecessor's string-left `+` operation against one value.
    /// This delegates only ECMAScript ToPrimitive/string conversion to JS.
    StringConcat {
        prefix: Vec<u16>,
        value: HostInvokeValue,
    },
    /// Serialize the exact ordered mixture of Rust-authored diagnostics and
    /// opaque callback diagnostics with the host's live JSON.stringify.
    StringifyDiagnosticArray { items: Vec<HostDiagnosticArrayItem> },
    /// Construct the native Error carrier for a JSON.stringify result without
    /// reading its `message` property.
    ConstructErrorCarrier { value: HostInvokeValue },
    /// Complete IteratorClose for an already-thrown loop-body completion. The host suppresses any `return` failure so the original throw remains authoritative.
    CloseOpaqueIterator { iterator: HostHandle },
    /// Ask the host for the engine-native TypeError text of a semantic spread failure.
    MaterializeSpreadFailure { target: HostSpreadFailureTarget },
}

#[derive(Clone, Debug, PartialEq)]
pub enum HostSpreadFailureTarget {
    /// The callback result itself was null or undefined; no property read is repeated.
    Nullish(HostInvokeValue),
    /// The callback result's already-read Symbol.iterator value was not callable.
    IteratorMethod(HostInvokeValue),
    /// The callback result's callable Symbol.iterator method returned a primitive.
    IteratorResultPrimitive(HostInvokeValue),
    /// The acquired iterator's already-read `next` value was not callable.
    IteratorNextMethod(HostInvokeValue),
    /// A callable iterator's `next` returned this primitive iterator result.
    IteratorStepPrimitive(HostInvokeValue),
}

/// One entry in a Rust-assembled refusal diagnostics array.
#[derive(Clone, Debug, PartialEq)]
pub enum HostDiagnosticArrayItem {
    /// A Rust-owned JSON value, reconstructed by the host with ordinary object
    /// prototypes so inherited `toJSON` behavior matches the predecessor.
    Static(Value),
    /// An original callback-owned diagnostic retained by invocation-local handle.
    Opaque(HostHandle),
    /// Rust-authored structure diagnostic whose message remains a host-owned
    /// primitive string through the single aggregate JSON.stringify call.
    Structure {
        code: Utf16,
        path: Utf16,
        message: HostStringRef,
        severity: Utf16,
    },
}

#[derive(Clone, Debug, PartialEq)]
pub enum HostJsonReply {
    Kind(HostJsonKind),
    Prototype(HostPrototype),
    Boolean(bool),
    Count(usize),
    Snapshot(HostDescriptorSnapshot),
    Descriptor(HostPropertyDescriptor),
    Utf16Chunk { offset: usize, units: Vec<u16> },
    OpaqueValue(HostOpaqueValue),
    Invocation(HostOpaqueValue),
    SemanticThrow(HostStringRef),
    IteratorClosed,
    SpreadFailure(HostStringRef),
}

/// A host adapter must implement only primitive reflection for one live
/// invocation. Object handles MUST be interned by referential identity for the
/// lifetime of the invocation. Descriptor snapshots are invocation-local host
/// tokens: their full descriptor table is materialized before Rust requests
/// individual entries, then explicitly released on every path. Strings are
/// read in fixed-size UTF-16 chunks. Rust grows its output buffer incrementally
/// and reports allocator failure separately, without a text-size admission
/// limit or changes to predecessor admission/Context metering. A host must
/// return at most the requested 8,192 UTF-16 units per chunk, keep string tokens
/// immutable and invocation-local, and return descriptor metadata before any
/// string body is requested.
/// Callback exceptions are represented by an immediate error;
/// adapters keep the original thrown value locally and rethrow it after Rust
/// returns, rather than encoding it in this interface.
pub trait HostJsonReflection {
    fn reflect(&mut self, event: HostJsonEvent) -> Result<HostJsonReply, EngineError>;
    /// Infallible invocation-local cleanup. This must not call user code or
    /// affect predecessor-visible errors/event order.
    fn release_descriptor_snapshot(&mut self, token: u64);
}

/// Copy one opaque host value using the `src/model/json.ts` predecessor order.
pub fn copy_host_json(
    root: HostHandle,
    host: &mut dyn HostJsonReflection,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    copy_host_json_at_path(root, host, ctx, &Utf16::default(), 0)
}

/// Copy an opaque host value at its final-result location. Callers provide the
/// enclosing JSON path and depth so nested refusal paths and structural limits
/// match the containing result rather than treating this value as a new root.
pub(crate) fn copy_host_json_at_path(
    root: HostHandle,
    host: &mut dyn HostJsonReflection,
    ctx: &mut Context<'_>,
    path: &Utf16,
    depth: usize,
) -> Result<Value, EngineError> {
    let mut active = BTreeSet::new();
    let mut values = 0usize;
    visit(
        root,
        host,
        ctx,
        path,
        depth,
        &mut values,
        &mut active,
    )
}

/// Ask the host to execute the predecessor's native Unicode-count operation
/// against an already-admitted Rust value. The value is copied only after
/// accounting for the invocation-local wire work; this is not another JSON
/// admission and does not revisit the caller's host object.
pub(crate) fn unicode_count_host_copy(
    value: &Value,
    host: &mut dyn HostJsonReflection,
    ctx: &mut Context<'_>,
) -> Result<usize, EngineError> {
    fn charge_wire(value: &Value, ctx: &mut Context<'_>) -> Result<(), EngineError> {
        ctx.charge_work(1, Utf16::default())?;
        match value {
            Value::Null | Value::Bool(_) => {}
            Value::Number(_) => ctx.charge_work(16, Utf16::default())?,
            Value::String(text) => {
                ctx.charge_work(text.len().saturating_mul(6), Utf16::default())?;
            }
            Value::Array(items) => {
                ctx.charge_work(items.len(), Utf16::default())?;
                for item in items {
                    charge_wire(item, ctx)?;
                }
            }
            Value::Object(members) => {
                ctx.charge_work(members.len(), Utf16::default())?;
                for (key, child) in members {
                    ctx.charge_work(key.len().saturating_mul(6), Utf16::default())?;
                    charge_wire(child, ctx)?;
                }
            }
        }
        Ok(())
    }

    charge_wire(value, ctx)?;
    expect_count(
        host.reflect(HostJsonEvent::UnicodeCount {
            value: value.clone(),
        })?,
        &Utf16::default(),
    )
}

fn visit(
    handle: HostHandle,
    host: &mut dyn HostJsonReflection,
    ctx: &mut Context<'_>,
    path: &Utf16,
    depth: usize,
    values: &mut usize,
    active: &mut BTreeSet<HostHandle>,
) -> Result<Value, EngineError> {
    charge_value(ctx, path, depth, values)?;

    let kind = expect_kind(host.reflect(HostJsonEvent::Classify { handle })?, path)?;
    match kind {
        HostJsonKind::Null => return Ok(Value::Null),
        HostJsonKind::Boolean(value) => return Ok(Value::Bool(value)),
        HostJsonKind::Number(value) => return admitted_number(value, path),
        HostJsonKind::String(value) => {
            return Ok(Value::String(read_host_string_value(host, value, path)?));
        }
        HostJsonKind::Unsupported(kind) => {
            let _ = kind;
            return Err(error("NON_JSON", path, "Value is not JSON-compatible"));
        }
        HostJsonKind::Object(classified_handle) if classified_handle == handle => {}
        HostJsonKind::Object(_) => return Err(wrong_reply(path)),
    }
    if active.contains(&handle) {
        return Err(error("CYCLE", path, "Cyclic value"));
    }

    // Preserve source order: prototype lookup, IsArray, symbol check, then
    // descriptor snapshot. In particular, proxy traps from descriptor
    // snapshot occur before any child handle is visited.
    let prototype = expect_prototype(host.reflect(HostJsonEvent::GetPrototype { handle })?, path)?;
    let is_array_for_prototype =
        expect_boolean(host.reflect(HostJsonEvent::IsArray { handle })?, path)?;
    if (is_array_for_prototype && prototype != HostPrototype::Array)
        || (!is_array_for_prototype
            && !matches!(
                prototype,
                HostPrototype::OrdinaryObject | HostPrototype::Null
            ))
    {
        return Err(error("NON_JSON", path, "Custom object prototype"));
    }
    let symbols = expect_count(
        host.reflect(HostJsonEvent::OwnSymbolCount { handle })?,
        path,
    )?;
    if symbols != 0 {
        return Err(error(
            "NON_JSON",
            path,
            "Symbol keys are not JSON-compatible",
        ));
    }

    active.insert(handle);
    let snapshot = expect_snapshot(
        host.reflect(HostJsonEvent::DescriptorSnapshot { handle })?,
        path,
    )?;
    // This is the predecessor's second Array.isArray call, after the full
    // descriptor snapshot and before iterating its entries.
    let mut is_array = false;
    let mut object_members = Vec::new();
    let mut array_items = BTreeMap::new();
    let mut seen = BTreeSet::new();
    let traversal = (|| -> Result<(), EngineError> {
        is_array = expect_boolean(host.reflect(HostJsonEvent::IsArray { handle })?, path)?;
        for index in 0..snapshot.count {
            let descriptor = expect_descriptor(
                host.reflect(HostJsonEvent::DescriptorAt {
                    token: snapshot.token,
                    index,
                })?,
                path,
            )?;
            // Array.isArray(value) is evaluated for every Object.entries item,
            // even though the descriptor snapshot already classified the value.
            let array_for_length_skip =
                expect_boolean(host.reflect(HostJsonEvent::IsArray { handle })?, path)?;
            let key = read_host_string_value(host, descriptor.key.clone(), path)?;
            if array_for_length_skip && key == Utf16::from("length") {
                continue;
            }
            let property_path = append_pointer(path, &key);
            if !descriptor.enumerable || !descriptor.is_data || descriptor.value.is_none() {
                return Err(error(
                    "NON_JSON",
                    &property_path,
                    "Hidden fields and accessors cannot be serialized faithfully",
                ));
            }
            let array_for_index_check =
                expect_boolean(host.reflect(HostJsonEvent::IsArray { handle })?, path)?;
            if array_for_index_check {
                // Preserve the short-circuit expression: invalid index syntax and
                // UINT32_MAX bounds reject before reading the host array length.
                if !is_array_index(&key)
                    || index_at_or_past_uint32_max(&key)
                    || expect_boolean(
                        host.reflect(HostJsonEvent::ArrayIndexAtOrPastLength {
                            handle,
                            key: descriptor.key.clone(),
                        })?,
                        path,
                    )?
                {
                    return Err(error("NON_JSON", path, "Non-index array property"));
                }
            }
            let child = descriptor.value.expect("checked above");
            let copied =
                copy_descriptor_value(child, host, ctx, &property_path, depth + 1, values, active)?;
            if !seen.insert(key.units().to_vec()) {
                return Err(error("NON_JSON", path, "Duplicate object key"));
            }
            if is_array {
                let array_index = descriptor_index(&key)
                    .ok_or_else(|| error("NON_JSON", path, "Non-index array property"))?;
                array_items.insert(array_index, copied);
            } else {
                object_members.push((key, copied));
            }
        }
        Ok(())
    })();
    host.release_descriptor_snapshot(snapshot.token);
    traversal?;
    // The predecessor checks Array.isArray on every object before its dense
    // array expression; retain the call even for ordinary objects.
    let array_for_density_check =
        expect_boolean(host.reflect(HostJsonEvent::IsArray { handle })?, path)?;
    if array_for_density_check {
        // Exactly mirrors Object.keys(value).length !== value.length, including
        // proxy re-observation and strict comparison semantics.
        let sparse = expect_boolean(
            host.reflect(HostJsonEvent::ArrayIsSparseOrExtended { handle })?,
            path,
        )?;
        if sparse {
            return Err(error("NON_JSON", path, "Sparse arrays are not JSON values"));
        }
        if array_items
            .keys()
            .enumerate()
            .any(|(expected, actual)| expected != *actual)
        {
            return Err(error(
                "HOST_JSON_UNREPRESENTABLE",
                path,
                "Host array snapshot produced holes that the Rust JSON value cannot represent",
            ));
        }
    }
    active.remove(&handle);
    if is_array {
        Ok(Value::Array(array_items.into_values().collect()))
    } else {
        Ok(Value::Object(object_members))
    }
}

fn copy_descriptor_value(
    child: HostDescriptorValue,
    host: &mut dyn HostJsonReflection,
    ctx: &mut Context<'_>,
    path: &Utf16,
    depth: usize,
    values: &mut usize,
    active: &mut BTreeSet<HostHandle>,
) -> Result<Value, EngineError> {
    match child {
        HostDescriptorValue::Object(handle) => {
            visit(handle, host, ctx, path, depth, values, active)
        }
        scalar => {
            charge_value(ctx, path, depth, values)?;
            Ok(match scalar {
                HostDescriptorValue::Null => Value::Null,
                HostDescriptorValue::Boolean(value) => Value::Bool(value),
                HostDescriptorValue::Number(value) => return admitted_number(value, path),
                HostDescriptorValue::String(value) => {
                    Value::String(read_host_string_value(host, value, path)?)
                }
                HostDescriptorValue::Unsupported(kind) => {
                    let _ = kind;
                    return Err(error("NON_JSON", path, "Value is not JSON-compatible"));
                }
                HostDescriptorValue::Object(_) => unreachable!(),
            })
        }
    }
}

fn charge_value(
    ctx: &mut Context<'_>,
    path: &Utf16,
    depth: usize,
    values: &mut usize,
) -> Result<(), EngineError> {
    ctx.charge_work(1, path.clone())?;
    *values = values
        .checked_add(1)
        .ok_or_else(|| error("LIMIT", path, "JSON value count overflow"))?;
    if *values > ctx.limits().max_values {
        return Err(error("LIMIT", path, "JSON structural limit exceeded"));
    }
    if depth > ctx.limits().max_depth {
        return Err(error("LIMIT", path, "JSON structural limit exceeded"));
    }
    Ok(())
}

pub fn read_host_string_value(
    host: &mut dyn HostJsonReflection,
    string: HostStringRef,
    path: &Utf16,
) -> Result<Utf16, EngineError> {
    let mut units = Vec::new();
    let mut offset = 0usize;
    while offset < string.units {
        let request = (string.units - offset).min(HOST_STRING_CHUNK_UNITS);
        let reply = host.reflect(HostJsonEvent::ReadUtf16Chunk {
            token: string.token,
            offset,
            max_units: HOST_STRING_CHUNK_UNITS,
        })?;
        let HostJsonReply::Utf16Chunk {
            offset: reply_offset,
            units: chunk,
        } = reply
        else {
            return Err(wrong_reply(path));
        };
        if reply_offset != offset || chunk.len() != request {
            return Err(error(
                "HOST_JSON_PROTOCOL",
                path,
                "Host returned an invalid UTF-16 chunk",
            ));
        }
        units.try_reserve(chunk.len()).map_err(|_| {
            error(
                "HOST_JSON_TRANSPORT_ALLOC",
                path,
                "Unable to allocate the next bounded UTF-16 chunk",
            )
        })?;
        units.extend_from_slice(&chunk);
        offset += chunk.len();
    }
    Ok(Utf16::new(units))
}

/// Reuse an opaque property result as the receiver of a later property read or
/// invocation argument without coercion. Strings are fetched as exact UTF-16;
/// numbers retain their IEEE-754 bits, including negative zero and NaN.
pub(crate) fn opaque_invoke_value(
    value: HostOpaqueValue,
    host: &mut dyn HostJsonReflection,
    path: &Utf16,
) -> Result<HostInvokeValue, EngineError> {
    Ok(match value {
        HostOpaqueValue::Undefined => HostInvokeValue::Undefined,
        HostOpaqueValue::Null => HostInvokeValue::Json(Value::Null),
        HostOpaqueValue::Boolean(value) => HostInvokeValue::Json(Value::Bool(value)),
        HostOpaqueValue::Number(value) => HostInvokeValue::Json(Value::Number(value)),
        HostOpaqueValue::String(value) => {
            HostInvokeValue::Json(Value::String(read_host_string_value(host, value, path)?))
        }
        HostOpaqueValue::Opaque { handle, .. } | HostOpaqueValue::BigInt { handle, .. } => {
            HostInvokeValue::Opaque(handle)
        }
    })
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) enum HostSemanticIterableOutcome {
    Values(Vec<HostOpaqueValue>),
    SemanticThrow(Utf16),
    /// The predecessor catches these native spread TypeErrors, but exact text
    /// varies by runtime. Callers must stop rather than invent a diagnostic.
    NativeSpreadFailureUnresolved,
}

enum SemanticHostStep<T> {
    Value(T),
    Thrown(Utf16),
}

fn semantic_get(
    receiver: HostOpaqueValue,
    key: HostOpaqueKey,
    host: &mut dyn HostJsonReflection,
    path: &Utf16,
) -> Result<SemanticHostStep<HostOpaqueValue>, EngineError> {
    let receiver = opaque_invoke_value(receiver, host, path)?;
    match host.reflect(HostJsonEvent::GetOpaqueProperty {
        receiver,
        key,
        semantic_catch: true,
    })? {
        HostJsonReply::OpaqueValue(value) => Ok(SemanticHostStep::Value(value)),
        HostJsonReply::SemanticThrow(message) => Ok(SemanticHostStep::Thrown(
            read_host_string_value(host, message, path)?,
        )),
        _ => Err(wrong_reply(path)),
    }
}

fn semantic_invoke(
    function: HostHandle,
    receiver: HostOpaqueValue,
    args: Vec<HostInvokeValue>,
    host: &mut dyn HostJsonReflection,
    path: &Utf16,
) -> Result<SemanticHostStep<HostOpaqueValue>, EngineError> {
    let receiver = opaque_invoke_value(receiver, host, path)?;
    match host.reflect(HostJsonEvent::InvokeOpaque {
        function,
        receiver,
        args,
        semantic_catch: true,
    })? {
        HostJsonReply::Invocation(value) => Ok(SemanticHostStep::Value(value)),
        HostJsonReply::SemanticThrow(message) => Ok(SemanticHostStep::Thrown(
            read_host_string_value(host, message, path)?,
        )),
        _ => Err(wrong_reply(path)),
    }
}

/// Apply JavaScript's string-left `+` to one opaque value. Keeping this as one
/// host primitive preserves native ToPrimitive hint/order and exact thrown
/// identity without moving Selection branching into the dispatcher.
pub(crate) fn host_string_concat(
    prefix: &Utf16,
    value: HostOpaqueValue,
    host: &mut dyn HostJsonReflection,
    ctx: &mut Context<'_>,
    path: &Utf16,
) -> Result<Utf16, EngineError> {
    let value = opaque_invoke_value_charged(value, host, ctx, path)?;
    ctx.charge_work(prefix.len(), path.clone())?;
    ctx.charge_work(1, path.clone())?;
    match host.reflect(HostJsonEvent::StringConcat {
        prefix: prefix.units().to_vec(),
        value,
    })? {
        HostJsonReply::OpaqueValue(HostOpaqueValue::String(result)) => {
            ctx.charge_work(result.units, path.clone())?;
            read_host_string_value(host, result, path)
        }
        _ => Err(wrong_reply(path)),
    }
}

fn close_opaque_iterator_after_throw(
    iterator: HostHandle,
    host: &mut dyn HostJsonReflection,
    ctx: &mut Context<'_>,
    path: &Utf16,
) {
    // Cleanup is attempted even when the work budget is exhausted by the body
    // operation; preserving IteratorClose effects takes precedence over a new
    // Rust-side refusal. The original body error remains the returned error.
    let _ = ctx.charge_work(1, path.clone());
    let _ = host.reflect(HostJsonEvent::CloseOpaqueIterator { iterator });
}

fn is_body_host_throw(error: &EngineError) -> bool {
    error.code == "HOST_JSON_CALLBACK"
}

fn iterator_handle(iterator: &HostOpaqueValue) -> Option<HostHandle> {
    match iterator {
        HostOpaqueValue::Opaque { handle, opaque_type: HostOpaqueType::Object | HostOpaqueType::Function } => Some(*handle),
        _ => None,
    }
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct HostStructureErrorEntry {
    pub path: Utf16,
    pub message: HostOpaqueValue,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) enum HostStructureErrorsOutcome {
    Entries(Vec<HostStructureErrorEntry>),
    /// Native iterator TypeErrors are observable but not yet reproduced by
    /// Rust. Stop rather than inventing a constraint diagnostic.
    NativeIterationFailureUnresolved,
}

fn ordinary_get(
    receiver: HostOpaqueValue,
    key: HostOpaqueKey,
    host: &mut dyn HostJsonReflection,
    ctx: &mut Context<'_>,
    path: &Utf16,
) -> Result<HostOpaqueValue, EngineError> {
    let receiver = opaque_invoke_value_charged(receiver, host, ctx, path)?;
    ctx.charge_work(1, path.clone())?;
    match host.reflect(HostJsonEvent::GetOpaqueProperty {
        receiver,
        key,
        semantic_catch: false,
    })? {
        HostJsonReply::OpaqueValue(value) => Ok(value),
        _ => Err(wrong_reply(path)),
    }
}

fn ordinary_invoke(
    function: HostHandle,
    receiver: HostOpaqueValue,
    host: &mut dyn HostJsonReflection,
    ctx: &mut Context<'_>,
    path: &Utf16,
) -> Result<HostOpaqueValue, EngineError> {
    let receiver = opaque_invoke_value_charged(receiver, host, ctx, path)?;
    ctx.charge_work(1, path.clone())?;
    match host.reflect(HostJsonEvent::InvokeOpaque {
        function,
        receiver,
        args: Vec::new(),
        semantic_catch: false,
    })? {
        HostJsonReply::Invocation(value) => Ok(value),
        _ => Err(wrong_reply(path)),
    }
}

fn opaque_invoke_value_charged(
    value: HostOpaqueValue,
    host: &mut dyn HostJsonReflection,
    ctx: &mut Context<'_>,
    path: &Utf16,
) -> Result<HostInvokeValue, EngineError> {
    if let HostOpaqueValue::String(string) = &value {
        ctx.charge_work(string.units, path.clone())?;
    }
    opaque_invoke_value(value, host, path)
}

/// Read and stage the valid `structure.errors` iterable path. This mirrors
/// `errors ?? []`, native iterator order, then per-item `instancePath`, string
/// concatenation, and `message` reads. Message values stay opaque for the
/// later diagnostic emitter. Native iterator TypeErrors remain an explicit
/// unresolved outcome; user throws propagate through the host identity slot.
pub(crate) fn collect_structure_errors(
    errors: HostOpaqueValue,
    prefix: &Utf16,
    host: &mut dyn HostJsonReflection,
    ctx: &mut Context<'_>,
    path: &Utf16,
) -> Result<HostStructureErrorsOutcome, EngineError> {
    if errors.is_nullish() {
        return Ok(HostStructureErrorsOutcome::Entries(Vec::new()));
    }
    let iterator_method = ordinary_get(
        errors.clone(),
        HostOpaqueKey::IteratorSymbol,
        host,
        ctx,
        path,
    )?;
    let HostOpaqueValue::Opaque { handle: iterator_function, opaque_type: HostOpaqueType::Function } = iterator_method else {
        return Ok(HostStructureErrorsOutcome::NativeIterationFailureUnresolved);
    };
    let iterator = ordinary_invoke(iterator_function, errors, host, ctx, path)?;
    if !matches!(iterator, HostOpaqueValue::Opaque { opaque_type: HostOpaqueType::Object | HostOpaqueType::Function, .. }) {
        return Ok(HostStructureErrorsOutcome::NativeIterationFailureUnresolved);
    }
    let next_method = ordinary_get(
        iterator.clone(),
        HostOpaqueKey::String("next".encode_utf16().collect()),
        host,
        ctx,
        path,
    )?;
    let HostOpaqueValue::Opaque { handle: next_function, opaque_type: HostOpaqueType::Function } = next_method else {
        return Ok(HostStructureErrorsOutcome::NativeIterationFailureUnresolved);
    };
    let mut entries = Vec::new();
    loop {
        ctx.charge_work(1, path.clone())?;
        let step = ordinary_invoke(next_function, iterator.clone(), host, ctx, path)?;
        if !matches!(step, HostOpaqueValue::Opaque { opaque_type: HostOpaqueType::Object | HostOpaqueType::Function, .. }) {
            return Ok(HostStructureErrorsOutcome::NativeIterationFailureUnresolved);
        }
        let done = ordinary_get(
            step.clone(),
            HostOpaqueKey::String("done".encode_utf16().collect()),
            host,
            ctx,
            path,
        )?;
        if done.is_truthy() {
            break;
        }
        let item = ordinary_get(
            step,
            HostOpaqueKey::String("value".encode_utf16().collect()),
            host,
            ctx,
            path,
        )?;
        let close_handle = iterator_handle(&iterator).ok_or_else(|| wrong_reply(path))?;
        let instance_path = match ordinary_get(
            item.clone(),
            HostOpaqueKey::String("instancePath".encode_utf16().collect()),
            host,
            ctx,
            path,
        ) {
            Ok(value) => value,
            Err(error) => {
                if is_body_host_throw(&error) { close_opaque_iterator_after_throw(close_handle, host, ctx, path); }
                return Err(error);
            }
        };
        let full_path = match host_string_concat(prefix, instance_path, host, ctx, path) {
            Ok(value) => value,
            Err(error) => {
                if is_body_host_throw(&error) { close_opaque_iterator_after_throw(close_handle, host, ctx, path); }
                return Err(error);
            }
        };
        let message = match ordinary_get(
            item,
            HostOpaqueKey::String("message".encode_utf16().collect()),
            host,
            ctx,
            path,
        ) {
            Ok(value) => value,
            Err(error) => {
                if is_body_host_throw(&error) { close_opaque_iterator_after_throw(close_handle, host, ctx, path); }
                return Err(error);
            }
        };
        entries.push(HostStructureErrorEntry { path: full_path, message });
    }
    Ok(HostStructureErrorsOutcome::Entries(entries))
}

pub(crate) fn materialize_semantic_value(
    value: HostOpaqueValue,
    host: &mut dyn HostJsonReflection,
    ctx: &mut Context<'_>,
    path: &Utf16,
    depth: usize,
) -> Result<Value, EngineError> {
    if !matches!(value, HostOpaqueValue::Opaque { opaque_type: HostOpaqueType::Object, .. }) {
        ctx.charge_work(1, path.clone())?;
    }
    match value {
        HostOpaqueValue::Null => Ok(Value::Null),
        HostOpaqueValue::Boolean(value) => Ok(Value::Bool(value)),
        HostOpaqueValue::Number(value) => admitted_number(value, path),
        HostOpaqueValue::String(value) => Ok(Value::String(read_host_string_value(host, value, path)?)),
        HostOpaqueValue::Opaque { handle, opaque_type: HostOpaqueType::Object } => {
            copy_host_json_at_path(handle, host, ctx, path, depth)
        }
        HostOpaqueValue::Undefined
        | HostOpaqueValue::BigInt { .. }
        | HostOpaqueValue::Opaque { opaque_type: HostOpaqueType::Function | HostOpaqueType::Symbol, .. } => {
            Err(error("NON_JSON", path, "Value is not JSON-compatible"))
        }
    }
}

fn native_spread_failure_message(
    target: HostSpreadFailureTarget,
    host: &mut dyn HostJsonReflection,
    ctx: &mut Context<'_>,
    path: &Utf16,
) -> Result<Utf16, EngineError> {
    ctx.charge_work(1, path.clone())?;
    match host.reflect(HostJsonEvent::MaterializeSpreadFailure { target })? {
        HostJsonReply::SpreadFailure(message) => read_host_string_value(host, message, path),
        _ => Err(wrong_reply(path)),
    }
}

/// Rust-owned equivalent of the semantic callback result's array spread.
/// Iterator gets/calls request semantic catch individually. Values remain
/// opaque until the later final Selection `copyJson` stage, which is outside
/// that catch and must occur after the complete spread.
pub(crate) fn collect_semantic_iterable(
    result: HostOpaqueValue,
    host: &mut dyn HostJsonReflection,
    ctx: &mut Context<'_>,
    path: &Utf16,
) -> Result<HostSemanticIterableOutcome, EngineError> {
    if result.is_nullish() {
        let target = HostSpreadFailureTarget::Nullish(opaque_invoke_value_charged(result, host, ctx, path)?);
        let message = native_spread_failure_message(target, host, ctx, path)?;
        return Ok(HostSemanticIterableOutcome::SemanticThrow(message));
    }
    let iterator_method = match semantic_get(
        result.clone(),
        HostOpaqueKey::IteratorSymbol,
        host,
        path,
    )? {
        SemanticHostStep::Thrown(message) => return Ok(HostSemanticIterableOutcome::SemanticThrow(message)),
        SemanticHostStep::Value(value) => value,
    };
    let iterator_function = match iterator_method {
        HostOpaqueValue::Opaque { handle, opaque_type: HostOpaqueType::Function } => handle,
        method => {
            let method = opaque_invoke_value_charged(method, host, ctx, path)?;
            let message = native_spread_failure_message(HostSpreadFailureTarget::IteratorMethod(method), host, ctx, path)?;
            return Ok(HostSemanticIterableOutcome::SemanticThrow(message));
        }
    };
    let iterator = match semantic_invoke(iterator_function, result, Vec::new(), host, path)? {
        SemanticHostStep::Thrown(message) => return Ok(HostSemanticIterableOutcome::SemanticThrow(message)),
        SemanticHostStep::Value(value) => value,
    };
    if !matches!(iterator, HostOpaqueValue::Opaque { opaque_type: HostOpaqueType::Object | HostOpaqueType::Function, .. }) {
        let message = native_spread_failure_message(
            HostSpreadFailureTarget::IteratorResultPrimitive(opaque_invoke_value_charged(iterator, host, ctx, path)?),
            host,
            ctx,
            path,
        )?;
        return Ok(HostSemanticIterableOutcome::SemanticThrow(message));
    }
    let next_method = match semantic_get(
        iterator.clone(),
        HostOpaqueKey::String("next".encode_utf16().collect()),
        host,
        path,
    )? {
        SemanticHostStep::Thrown(message) => return Ok(HostSemanticIterableOutcome::SemanticThrow(message)),
        SemanticHostStep::Value(value) => value,
    };
    let HostOpaqueValue::Opaque { handle: next_function, opaque_type: HostOpaqueType::Function } = next_method else {
        let target = HostSpreadFailureTarget::IteratorNextMethod(opaque_invoke_value_charged(next_method, host, ctx, path)?);
        let message = native_spread_failure_message(target, host, ctx, path)?;
        return Ok(HostSemanticIterableOutcome::SemanticThrow(message));
    };
    let mut values = Vec::new();
    loop {
        ctx.charge_work(1, path.clone())?;
        let step = match semantic_invoke(next_function, iterator.clone(), Vec::new(), host, path)? {
            SemanticHostStep::Thrown(message) => return Ok(HostSemanticIterableOutcome::SemanticThrow(message)),
            SemanticHostStep::Value(value) => value,
        };
        if !matches!(step, HostOpaqueValue::Opaque { opaque_type: HostOpaqueType::Object | HostOpaqueType::Function, .. }) {
            let target = HostSpreadFailureTarget::IteratorStepPrimitive(opaque_invoke_value_charged(step, host, ctx, path)?);
            let message = native_spread_failure_message(target, host, ctx, path)?;
            return Ok(HostSemanticIterableOutcome::SemanticThrow(message));
        }
        let done = match semantic_get(
            step.clone(),
            HostOpaqueKey::String("done".encode_utf16().collect()),
            host,
            path,
        )? {
            SemanticHostStep::Thrown(message) => return Ok(HostSemanticIterableOutcome::SemanticThrow(message)),
            SemanticHostStep::Value(value) => value,
        };
        if done.is_truthy() {
            break;
        }
        let value = match semantic_get(
            step,
            HostOpaqueKey::String("value".encode_utf16().collect()),
            host,
            path,
        )? {
            SemanticHostStep::Thrown(message) => return Ok(HostSemanticIterableOutcome::SemanticThrow(message)),
            SemanticHostStep::Value(value) => value,
        };
        values.push(value);
    }
    Ok(HostSemanticIterableOutcome::Values(values))
}

/// Materialize deferred spread values at the final result-copy stage, after all
/// iterator effects have completed. This preserves JSON-compatible unknown
/// diagnostic fields and their own-key order through `copy_host_json`.
pub(crate) fn materialize_semantic_iterable_values(
    values: Vec<HostOpaqueValue>,
    host: &mut dyn HostJsonReflection,
    ctx: &mut Context<'_>,
    path: &Utf16,
    array_depth: usize,
) -> Result<Vec<Value>, EngineError> {
    values.into_iter().enumerate().map(|(index, value)| {
        let item_path = append_pointer(path, &Utf16::from(index.to_string()));
        materialize_semantic_value(value, host, ctx, &item_path, array_depth.saturating_add(1))
    }).collect()
}

fn admitted_number(value: f64, path: &Utf16) -> Result<Value, EngineError> {
    if !value.is_finite()
        || (value == 0.0 && value.is_sign_negative())
        || (value.fract() == 0.0 && value.abs() > 9_007_199_254_740_991.0)
    {
        return Err(error(
            "NUMBER",
            path,
            "Number outside the core interoperable numeric profile",
        ));
    }
    Ok(Value::Number(value))
}

fn is_array_index(key: &Utf16) -> bool {
    let Ok(text) = key.to_utf8() else {
        return false;
    };
    if text == "0" {
        return true;
    }
    !text.is_empty() && !text.starts_with('0') && text.bytes().all(|byte| byte.is_ascii_digit())
}

fn descriptor_index(key: &Utf16) -> Option<usize> {
    if !is_array_index(key) || index_at_or_past_uint32_max(key) {
        return None;
    }
    key.to_utf8()
        .ok()?
        .parse::<u32>()
        .ok()
        .map(|index| index as usize)
}

fn index_at_or_past_uint32_max(key: &Utf16) -> bool {
    let text = key.to_utf8().expect("validated ASCII array index");
    text.len() > 10 || (text.len() == 10 && text.as_str() >= "4294967295")
}

fn append_pointer(path: &Utf16, key: &Utf16) -> Utf16 {
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

fn error(code: &str, path: &Utf16, message: &str) -> EngineError {
    EngineError::new(code, path.clone(), message)
}

fn wrong_reply(path: &Utf16) -> EngineError {
    error(
        "HOST_JSON_PROTOCOL",
        path,
        "Host returned a reply for the wrong event",
    )
}
fn expect_kind(reply: HostJsonReply, path: &Utf16) -> Result<HostJsonKind, EngineError> {
    if let HostJsonReply::Kind(value) = reply {
        Ok(value)
    } else {
        Err(wrong_reply(path))
    }
}
fn expect_prototype(reply: HostJsonReply, path: &Utf16) -> Result<HostPrototype, EngineError> {
    if let HostJsonReply::Prototype(value) = reply {
        Ok(value)
    } else {
        Err(wrong_reply(path))
    }
}
fn expect_boolean(reply: HostJsonReply, path: &Utf16) -> Result<bool, EngineError> {
    if let HostJsonReply::Boolean(value) = reply {
        Ok(value)
    } else {
        Err(wrong_reply(path))
    }
}
fn expect_count(reply: HostJsonReply, path: &Utf16) -> Result<usize, EngineError> {
    if let HostJsonReply::Count(value) = reply {
        Ok(value)
    } else {
        Err(wrong_reply(path))
    }
}
fn expect_snapshot(
    reply: HostJsonReply,
    path: &Utf16,
) -> Result<HostDescriptorSnapshot, EngineError> {
    if let HostJsonReply::Snapshot(value) = reply {
        Ok(value)
    } else {
        Err(wrong_reply(path))
    }
}
fn expect_descriptor(
    reply: HostJsonReply,
    path: &Utf16,
) -> Result<HostPropertyDescriptor, EngineError> {
    if let HostJsonReply::Descriptor(value) = reply {
        Ok(value)
    } else {
        Err(wrong_reply(path))
    }
}

#[cfg(test)]
mod tests {
    use std::collections::VecDeque;

    use super::*;
    use crate::{Limits, ResourceProfile};

    struct ScriptedHost {
        script: VecDeque<(HostJsonEvent, HostJsonReply)>,
        seen: Vec<HostJsonEvent>,
        strings: BTreeMap<u64, Vec<u16>>,
        chunks_seen: Vec<(u64, usize, usize, usize)>,
        chunk_fault: Option<ChunkFault>,
        released: Vec<u64>,
        fault: Option<(HostJsonEvent, EngineError)>,
    }
    #[derive(Clone, Copy)]
    enum ChunkFault {
        Offset,
        Length,
    }
    impl ScriptedHost {
        fn new(script: Vec<(HostJsonEvent, HostJsonReply)>) -> Self {
            let mut strings = BTreeMap::new();
            for (event, reply) in &script {
                if let HostJsonEvent::ArrayIndexAtOrPastLength { key, .. } = event {
                    strings.insert(key.token, key.test_units.to_vec());
                }
                match reply {
                    HostJsonReply::Kind(HostJsonKind::String(value)) => {
                        strings.insert(value.token, value.test_units.to_vec());
                    }
                    HostJsonReply::OpaqueValue(HostOpaqueValue::String(value)) => {
                        strings.insert(value.token, value.test_units.to_vec());
                    }
                    HostJsonReply::Descriptor(value) => {
                        strings.insert(value.key.token, value.key.test_units.to_vec());
                        if let Some(HostDescriptorValue::String(value)) = &value.value {
                            strings.insert(value.token, value.test_units.to_vec());
                        }
                    }
                    _ => {}
                }
            }
            Self {
                script: script.into(),
                seen: Vec::new(),
                strings,
                chunks_seen: Vec::new(),
                chunk_fault: None,
                released: Vec::new(),
                fault: None,
            }
        }
        fn done(&self) {
            assert!(
                self.script.is_empty() && self.fault.is_none(),
                "unconsumed host events/fault: {:?} {:?}",
                self.script, self.fault
            );
        }
        fn with_fault(mut self, event: HostJsonEvent, error: EngineError) -> Self {
            self.fault = Some((event, error));
            self
        }
        fn with_chunk_fault(mut self, fault: ChunkFault) -> Self {
            self.chunk_fault = Some(fault);
            self
        }
    }
    impl HostJsonReflection for ScriptedHost {
        fn reflect(&mut self, event: HostJsonEvent) -> Result<HostJsonReply, EngineError> {
            if let HostJsonEvent::ReadUtf16Chunk {
                token,
                offset,
                max_units,
            } = &event
            {
                self.chunks_seen
                    .push((*token, *offset, *max_units, self.seen.len()));
                let value = self
                    .strings
                    .get(token)
                    .expect("registered fake string token");
                let end = (offset + max_units).min(value.len());
                let mut response_offset = *offset;
                let mut units = value[*offset..end].to_vec();
                match self.chunk_fault {
                    Some(ChunkFault::Offset) => response_offset += 1,
                    Some(ChunkFault::Length) if !units.is_empty() => {
                        units.pop();
                    }
                    _ => {}
                }
                return Ok(HostJsonReply::Utf16Chunk {
                    offset: response_offset,
                    units,
                });
            }
            self.seen.push(event.clone());
            if self.fault.as_ref().is_some_and(|(expected, _)| *expected == event) {
                let (_, error) = self.fault.take().expect("matching scripted fault");
                Err(error)
            } else if let Some((expected, reply)) = self.script.pop_front() {
                assert_eq!(event, expected, "host reflection event order changed");
                Ok(reply)
            } else if let Some((expected, error)) = self.fault.take() {
                assert_eq!(event, expected, "host reflection fault order changed");
                Err(error)
            } else {
                panic!("unexpected host event: {event:?}")
            }
        }
        fn release_descriptor_snapshot(&mut self, token: u64) {
            self.released.push(token);
        }
    }
    fn event(event: HostJsonEvent, reply: HostJsonReply) -> (HostJsonEvent, HostJsonReply) {
        (event, reply)
    }
    fn k(text: &str) -> Utf16 {
        Utf16::from(text)
    }
    fn hs(text: &str) -> HostStringRef {
        HostStringRef::fake(text)
    }

    #[test]
    fn opaque_truthiness_and_nullishness_match_javascript_without_coercion() {
        use HostOpaqueValue as Opaque;
        let values = [
            (Opaque::Undefined, false, true),
            (Opaque::Null, false, true),
            (Opaque::Boolean(false), false, false),
            (Opaque::Boolean(true), true, false),
            (Opaque::Number(0.0), false, false),
            (Opaque::Number(-0.0), false, false),
            (Opaque::Number(f64::NAN), false, false),
            (Opaque::Number(f64::INFINITY), true, false),
            (Opaque::String(hs("")), false, false),
            (Opaque::String(hs("x")), true, false),
            (Opaque::Opaque { handle: 3, opaque_type: HostOpaqueType::Object }, true, false),
            (Opaque::Opaque { handle: 4, opaque_type: HostOpaqueType::Function }, true, false),
            (Opaque::Opaque { handle: 6, opaque_type: HostOpaqueType::Symbol }, true, false),
            (Opaque::BigInt { handle: 4, is_zero: true }, false, false), // 0n, including -0n
            (Opaque::BigInt { handle: 5, is_zero: false }, true, false),
        ];
        for (value, truthy, nullish) in values {
            assert_eq!(value.is_truthy(), truthy, "{value:?}");
            assert_eq!(value.is_nullish(), nullish, "{value:?}");
        }
    }

    #[test]
    fn opaque_property_values_reenter_without_changing_string_units_or_number_bits() {
        let string = HostStringRef::fake_units(vec![0xd800, 0x0061]);
        let token = string.token;
        let mut host = ScriptedHost::new(Vec::new());
        host.strings.insert(token, vec![0xd800, 0x0061]);
        let value = opaque_invoke_value(
            HostOpaqueValue::String(string),
            &mut host,
            &Utf16::default(),
        )
        .unwrap();
        assert_eq!(
            value,
            HostInvokeValue::Json(Value::String(Utf16::new(vec![0xd800, 0x0061])))
        );
        host.done();

        for number in [-0.0, f64::NAN, f64::INFINITY] {
            let HostInvokeValue::Json(Value::Number(returned)) = opaque_invoke_value(
                HostOpaqueValue::Number(number),
                &mut ScriptedHost::new(Vec::new()),
                &Utf16::default(),
            )
            .unwrap()
            else {
                panic!("number should remain a tagged JSON primitive")
            };
            assert_eq!(returned.to_bits(), number.to_bits());
        }
    }

    #[test]
    fn opaque_host_events_keep_primitive_receiver_and_callback_order_explicit() {
        let receiver = HostInvokeValue::Json(Value::String(k("scope")));
        let function = 7;
        let args = vec![HostInvokeValue::Opaque(8), HostInvokeValue::Json(Value::Bool(false))];
        let mut host = ScriptedHost::new(vec![
            event(
                HostJsonEvent::GetOpaqueProperty {
                    receiver: receiver.clone(),
                    key: HostOpaqueKey::String("includes".encode_utf16().collect()),
                    semantic_catch: false,
                },
                HostJsonReply::OpaqueValue(HostOpaqueValue::Opaque { handle: 9, opaque_type: HostOpaqueType::Function }),
            ),
            event(
                HostJsonEvent::InvokeOpaque {
                    function,
                    receiver,
                    args,
                    semantic_catch: true,
                },
                HostJsonReply::SemanticThrow(HostStringRef::fake("callback failure")),
            ),
        ]);
        assert!(matches!(
            host.reflect(HostJsonEvent::GetOpaqueProperty {
                receiver: HostInvokeValue::Json(Value::String(k("scope"))),
                key: HostOpaqueKey::String("includes".encode_utf16().collect()),
                semantic_catch: false,
            }).unwrap(),
            HostJsonReply::OpaqueValue(HostOpaqueValue::Opaque { handle: 9, opaque_type: HostOpaqueType::Function })
        ));
        assert!(matches!(
            host.reflect(HostJsonEvent::InvokeOpaque {
                function,
                receiver: HostInvokeValue::Json(Value::String(k("scope"))),
                args: vec![HostInvokeValue::Opaque(8), HostInvokeValue::Json(Value::Bool(false))],
                semantic_catch: true,
            }).unwrap(),
            HostJsonReply::SemanticThrow(_)
        ));
        host.done();
    }

    #[test]
    fn host_string_concat_uses_one_native_conversion_event_and_preserves_utf16() {
        let prefix = k("/extensions/future");
        let result = HostStringRef::fake("/extensions/future/💾");
        let expected = HostJsonEvent::StringConcat {
            prefix: prefix.units().to_vec(),
            value: HostInvokeValue::Opaque(42),
        };
        let mut host = ScriptedHost::new(vec![event(
            expected.clone(),
            HostJsonReply::OpaqueValue(HostOpaqueValue::String(result)),
        )]);
        assert_eq!(
            host_string_concat(
                &prefix,
                HostOpaqueValue::BigInt { handle: 42, is_zero: false },
                &mut host,
                &mut Context::ordinary(),
                &k("/extensions/future"),
            ).unwrap(),
            k("/extensions/future/💾"),
        );
        assert_eq!(host.seen, vec![expected]);
        host.done();
    }

    #[test]
    fn structure_errors_stages_iteration_coercion_message_in_order() {
        let key = |text: &str| HostOpaqueKey::String(text.encode_utf16().collect());
        let errors = HostOpaqueValue::Opaque { handle: 1, opaque_type: HostOpaqueType::Object };
        let item = HostOpaqueValue::Opaque { handle: 6, opaque_type: HostOpaqueType::Object };
        let path_value = HostOpaqueValue::Opaque { handle: 7, opaque_type: HostOpaqueType::Object };
        let full_path = HostStringRef::fake("/extensions/future/coerced");
        let message = HostOpaqueValue::String(HostStringRef::fake("bad shape"));
        let script = vec![
            event(HostJsonEvent::GetOpaqueProperty { receiver: HostInvokeValue::Opaque(1), key: HostOpaqueKey::IteratorSymbol, semantic_catch: false }, HostJsonReply::OpaqueValue(HostOpaqueValue::Opaque { handle: 2, opaque_type: HostOpaqueType::Function })),
            event(HostJsonEvent::InvokeOpaque { function: 2, receiver: HostInvokeValue::Opaque(1), args: vec![], semantic_catch: false }, HostJsonReply::Invocation(HostOpaqueValue::Opaque { handle: 3, opaque_type: HostOpaqueType::Object })),
            event(HostJsonEvent::GetOpaqueProperty { receiver: HostInvokeValue::Opaque(3), key: key("next"), semantic_catch: false }, HostJsonReply::OpaqueValue(HostOpaqueValue::Opaque { handle: 4, opaque_type: HostOpaqueType::Function })),
            event(HostJsonEvent::InvokeOpaque { function: 4, receiver: HostInvokeValue::Opaque(3), args: vec![], semantic_catch: false }, HostJsonReply::Invocation(HostOpaqueValue::Opaque { handle: 5, opaque_type: HostOpaqueType::Object })),
            event(HostJsonEvent::GetOpaqueProperty { receiver: HostInvokeValue::Opaque(5), key: key("done"), semantic_catch: false }, HostJsonReply::OpaqueValue(HostOpaqueValue::Boolean(false))),
            event(HostJsonEvent::GetOpaqueProperty { receiver: HostInvokeValue::Opaque(5), key: key("value"), semantic_catch: false }, HostJsonReply::OpaqueValue(item.clone())),
            event(HostJsonEvent::GetOpaqueProperty { receiver: HostInvokeValue::Opaque(6), key: key("instancePath"), semantic_catch: false }, HostJsonReply::OpaqueValue(path_value.clone())),
            event(HostJsonEvent::StringConcat { prefix: k("/extensions/future").units().to_vec(), value: HostInvokeValue::Opaque(7) }, HostJsonReply::OpaqueValue(HostOpaqueValue::String(full_path))),
            event(HostJsonEvent::GetOpaqueProperty { receiver: HostInvokeValue::Opaque(6), key: key("message"), semantic_catch: false }, HostJsonReply::OpaqueValue(message.clone())),
            event(HostJsonEvent::InvokeOpaque { function: 4, receiver: HostInvokeValue::Opaque(3), args: vec![], semantic_catch: false }, HostJsonReply::Invocation(HostOpaqueValue::Opaque { handle: 8, opaque_type: HostOpaqueType::Object })),
            event(HostJsonEvent::GetOpaqueProperty { receiver: HostInvokeValue::Opaque(8), key: key("done"), semantic_catch: false }, HostJsonReply::OpaqueValue(HostOpaqueValue::Boolean(true))),
        ];
        let mut host = ScriptedHost::new(script.clone());
        let outcome = collect_structure_errors(errors, &k("/extensions/future"), &mut host, &mut Context::ordinary(), &k("/extensions/future")).unwrap();
        assert_eq!(outcome, HostStructureErrorsOutcome::Entries(vec![HostStructureErrorEntry {
            path: k("/extensions/future/coerced"),
            message,
        }]));
        assert_eq!(host.seen, script.iter().map(|(event, _)| event.clone()).collect::<Vec<_>>());
        host.done();
    }

    #[test]
    fn structure_errors_nullish_empty_and_native_iteration_failure_are_explicit() {
        for errors in [HostOpaqueValue::Undefined, HostOpaqueValue::Null] {
            let mut host = ScriptedHost::new(Vec::new());
            assert_eq!(collect_structure_errors(errors, &k("/at"), &mut host, &mut Context::ordinary(), &k("/at")).unwrap(), HostStructureErrorsOutcome::Entries(Vec::new()));
            host.done();
        }
        let mut host = ScriptedHost::new(vec![event(
            HostJsonEvent::GetOpaqueProperty { receiver: HostInvokeValue::Opaque(1), key: HostOpaqueKey::IteratorSymbol, semantic_catch: false },
            HostJsonReply::OpaqueValue(HostOpaqueValue::Undefined),
        )]);
        assert_eq!(collect_structure_errors(HostOpaqueValue::Opaque { handle: 1, opaque_type: HostOpaqueType::Object }, &k("/at"), &mut host, &mut Context::ordinary(), &k("/at")).unwrap(), HostStructureErrorsOutcome::NativeIterationFailureUnresolved);
        host.done();
    }

    #[test]
    fn structure_errors_propagate_host_throw_and_stop_before_message_read() {
        let key = |text: &str| HostOpaqueKey::String(text.encode_utf16().collect());
        let item = 6;
        let prefix = vec![
            event(HostJsonEvent::GetOpaqueProperty { receiver: HostInvokeValue::Opaque(1), key: HostOpaqueKey::IteratorSymbol, semantic_catch: false }, HostJsonReply::OpaqueValue(HostOpaqueValue::Opaque { handle: 2, opaque_type: HostOpaqueType::Function })),
            event(HostJsonEvent::InvokeOpaque { function: 2, receiver: HostInvokeValue::Opaque(1), args: vec![], semantic_catch: false }, HostJsonReply::Invocation(HostOpaqueValue::Opaque { handle: 3, opaque_type: HostOpaqueType::Object })),
            event(HostJsonEvent::GetOpaqueProperty { receiver: HostInvokeValue::Opaque(3), key: key("next"), semantic_catch: false }, HostJsonReply::OpaqueValue(HostOpaqueValue::Opaque { handle: 4, opaque_type: HostOpaqueType::Function })),
            event(HostJsonEvent::InvokeOpaque { function: 4, receiver: HostInvokeValue::Opaque(3), args: vec![], semantic_catch: false }, HostJsonReply::Invocation(HostOpaqueValue::Opaque { handle: 5, opaque_type: HostOpaqueType::Object })),
            event(HostJsonEvent::GetOpaqueProperty { receiver: HostInvokeValue::Opaque(5), key: key("done"), semantic_catch: false }, HostJsonReply::OpaqueValue(HostOpaqueValue::Boolean(false))),
            event(HostJsonEvent::GetOpaqueProperty { receiver: HostInvokeValue::Opaque(5), key: key("value"), semantic_catch: false }, HostJsonReply::OpaqueValue(HostOpaqueValue::Opaque { handle: item, opaque_type: HostOpaqueType::Object })),
        ];
        let fault_event = HostJsonEvent::GetOpaqueProperty { receiver: HostInvokeValue::Opaque(item), key: key("instancePath"), semantic_catch: false };
        let failure = EngineError::new("HOST_JSON_CALLBACK", k("/at"), "Host reflection threw");
        let mut prefix = prefix;
        prefix.push(event(HostJsonEvent::CloseOpaqueIterator { iterator: 3 }, HostJsonReply::IteratorClosed));
        let mut host = ScriptedHost::new(prefix).with_fault(fault_event, failure);
        let error = collect_structure_errors(HostOpaqueValue::Opaque { handle: 1, opaque_type: HostOpaqueType::Object }, &k("/at"), &mut host, &mut Context::ordinary(), &k("/at")).unwrap_err();
        assert_eq!(error.code, "HOST_JSON_CALLBACK");
        assert!(host.seen.iter().any(|event| matches!(event, HostJsonEvent::CloseOpaqueIterator { iterator: 3 })));
        assert!(!host.seen.iter().any(|event| matches!(event, HostJsonEvent::GetOpaqueProperty { key: HostOpaqueKey::String(units), .. } if units == &"message".encode_utf16().collect::<Vec<_>>())));
        host.done();
    }

    #[test]
    fn semantic_iterable_spread_preserves_order_and_unknown_diagnostic_members() {
        let diagnostic = 6;
        let diagnostic_keys = ["code", "path", "message", "severity", "extensionDetail"];
        let diagnostic_values = ["EXT", "/extensions/acme", "custom", "warning", "kept"];
        let key = |text: &str| HostOpaqueKey::String(text.encode_utf16().collect());
        let mut script = vec![
            event(
                HostJsonEvent::GetOpaqueProperty {
                    receiver: HostInvokeValue::Opaque(1), key: HostOpaqueKey::IteratorSymbol, semantic_catch: true,
                },
                HostJsonReply::OpaqueValue(HostOpaqueValue::Opaque { handle: 2, opaque_type: HostOpaqueType::Function }),
            ),
            event(
                HostJsonEvent::InvokeOpaque { function: 2, receiver: HostInvokeValue::Opaque(1), args: vec![], semantic_catch: true },
                HostJsonReply::Invocation(HostOpaqueValue::Opaque { handle: 3, opaque_type: HostOpaqueType::Object }),
            ),
            event(
                HostJsonEvent::GetOpaqueProperty { receiver: HostInvokeValue::Opaque(3), key: key("next"), semantic_catch: true },
                HostJsonReply::OpaqueValue(HostOpaqueValue::Opaque { handle: 4, opaque_type: HostOpaqueType::Function }),
            ),
            event(
                HostJsonEvent::InvokeOpaque { function: 4, receiver: HostInvokeValue::Opaque(3), args: vec![], semantic_catch: true },
                HostJsonReply::Invocation(HostOpaqueValue::Opaque { handle: 5, opaque_type: HostOpaqueType::Object }),
            ),
            event(
                HostJsonEvent::GetOpaqueProperty { receiver: HostInvokeValue::Opaque(5), key: key("done"), semantic_catch: true },
                HostJsonReply::OpaqueValue(HostOpaqueValue::Boolean(false)),
            ),
            event(
                HostJsonEvent::GetOpaqueProperty { receiver: HostInvokeValue::Opaque(5), key: key("value"), semantic_catch: true },
                HostJsonReply::OpaqueValue(HostOpaqueValue::Opaque { handle: diagnostic, opaque_type: HostOpaqueType::Object }),
            ),
        ];
        let snapshot_token = 20;
        let mut copy_script = vec![
            event(HostJsonEvent::Classify { handle: diagnostic }, HostJsonReply::Kind(HostJsonKind::Object(diagnostic))),
            event(HostJsonEvent::GetPrototype { handle: diagnostic }, HostJsonReply::Prototype(HostPrototype::Null)),
            event(HostJsonEvent::IsArray { handle: diagnostic }, HostJsonReply::Boolean(false)),
            event(HostJsonEvent::OwnSymbolCount { handle: diagnostic }, HostJsonReply::Count(0)),
            event(HostJsonEvent::DescriptorSnapshot { handle: diagnostic }, HostJsonReply::Snapshot(HostDescriptorSnapshot { token: snapshot_token, count: diagnostic_keys.len() })),
            event(HostJsonEvent::IsArray { handle: diagnostic }, HostJsonReply::Boolean(false)),
        ];
        for (index, (member, value)) in diagnostic_keys.iter().zip(diagnostic_values).enumerate() {
            copy_script.push(event(
                HostJsonEvent::DescriptorAt { token: snapshot_token, index },
                HostJsonReply::Descriptor(HostPropertyDescriptor {
                    key: hs(member), enumerable: true, is_data: true, value: Some(HostDescriptorValue::String(hs(value))),
                }),
            ));
            copy_script.push(event(
                HostJsonEvent::IsArray { handle: diagnostic },
                HostJsonReply::Boolean(false),
            ));
            copy_script.push(event(
                HostJsonEvent::IsArray { handle: diagnostic },
                HostJsonReply::Boolean(false),
            ));
        }
        copy_script.push(event(
            HostJsonEvent::IsArray { handle: diagnostic },
            HostJsonReply::Boolean(false),
        ));
        script.extend([
            event(
                HostJsonEvent::InvokeOpaque { function: 4, receiver: HostInvokeValue::Opaque(3), args: vec![], semantic_catch: true },
                HostJsonReply::Invocation(HostOpaqueValue::Opaque { handle: 7, opaque_type: HostOpaqueType::Object }),
            ),
            event(
                HostJsonEvent::GetOpaqueProperty { receiver: HostInvokeValue::Opaque(7), key: key("done"), semantic_catch: true },
                HostJsonReply::OpaqueValue(HostOpaqueValue::Boolean(true)),
            ),
        ]);
        script.extend(copy_script);
        let mut host = ScriptedHost::new(script);
        let mut ctx = Context::ordinary();
        let result = collect_semantic_iterable(
            HostOpaqueValue::Opaque { handle: 1, opaque_type: HostOpaqueType::Object },
            &mut host,
            &mut ctx,
            &k("/sourceValidation/diagnostics"),
        ).unwrap();
        assert_eq!(result, HostSemanticIterableOutcome::Values(vec![
            HostOpaqueValue::Opaque { handle: diagnostic, opaque_type: HostOpaqueType::Object },
        ]));
        let HostSemanticIterableOutcome::Values(deferred) = result else { unreachable!() };
        let copied = materialize_semantic_iterable_values(
            deferred,
            &mut host,
            &mut ctx,
            &k("/sourceValidation/diagnostics"),
            2,
        ).unwrap();
        assert_eq!(copied, vec![Value::Object(
            diagnostic_keys.iter().zip(diagnostic_values).map(|(key, value)| (k(key), Value::String(k(value)))).collect(),
        )]);
        let done_step = host.seen.iter().position(|event| match event {
            HostJsonEvent::GetOpaqueProperty { receiver: HostInvokeValue::Opaque(7), key: HostOpaqueKey::String(key), .. } => key == &"done".encode_utf16().collect::<Vec<_>>(),
            _ => false,
        }).unwrap();
        let final_copy = host.seen.iter().position(|event| *event == HostJsonEvent::Classify { handle: diagnostic }).unwrap();
        assert!(done_step < final_copy, "diagnostic copying must wait until the iterator is exhausted");
        host.done();
    }

    #[test]
    fn semantic_iterable_spread_stops_on_native_and_semantic_failures() {
        let null_error = hs("native null spread");
        let mut null_host = ScriptedHost::new(vec![event(
            HostJsonEvent::MaterializeSpreadFailure { target: HostSpreadFailureTarget::Nullish(HostInvokeValue::Json(Value::Null)) },
            HostJsonReply::SpreadFailure(null_error.clone()),
        )]);
        null_host.strings.insert(null_error.token, null_error.test_units.to_vec());
        assert_eq!(
            collect_semantic_iterable(HostOpaqueValue::Null, &mut null_host, &mut Context::ordinary(), &k("/diagnostics")).unwrap(),
            HostSemanticIterableOutcome::SemanticThrow(k("native null spread")),
        );
        null_host.done();

        let undefined_error = hs("native undefined spread");
        let mut undefined_host = ScriptedHost::new(vec![event(
            HostJsonEvent::MaterializeSpreadFailure { target: HostSpreadFailureTarget::Nullish(HostInvokeValue::Undefined) },
            HostJsonReply::SpreadFailure(undefined_error.clone()),
        )]);
        undefined_host.strings.insert(undefined_error.token, undefined_error.test_units.to_vec());
        assert_eq!(
            collect_semantic_iterable(HostOpaqueValue::Undefined, &mut undefined_host, &mut Context::ordinary(), &k("/diagnostics")).unwrap(),
            HostSemanticIterableOutcome::SemanticThrow(k("native undefined spread")),
        );
        undefined_host.done();

        let method_error = hs("native method spread");
        let mut method_host = ScriptedHost::new(vec![
            event(HostJsonEvent::GetOpaqueProperty { receiver: HostInvokeValue::Opaque(1), key: HostOpaqueKey::IteratorSymbol, semantic_catch: true }, HostJsonReply::OpaqueValue(HostOpaqueValue::Number(1.0))),
            event(HostJsonEvent::MaterializeSpreadFailure { target: HostSpreadFailureTarget::IteratorMethod(HostInvokeValue::Json(Value::Number(1.0))) }, HostJsonReply::SpreadFailure(method_error.clone())),
        ]);
        method_host.strings.insert(method_error.token, method_error.test_units.to_vec());
        assert_eq!(
            collect_semantic_iterable(HostOpaqueValue::Opaque { handle: 1, opaque_type: HostOpaqueType::Object }, &mut method_host, &mut Context::ordinary(), &k("/diagnostics")).unwrap(),
            HostSemanticIterableOutcome::SemanticThrow(k("native method spread")),
        );
        method_host.done();

        let message = hs("iterator getter failed");
        let mut host = ScriptedHost::new(vec![event(
            HostJsonEvent::GetOpaqueProperty {
                receiver: HostInvokeValue::Opaque(1),
                key: HostOpaqueKey::IteratorSymbol,
                semantic_catch: true,
            },
            HostJsonReply::SemanticThrow(message.clone()),
        )]);
        host.strings.insert(message.token, message.test_units.to_vec());
        assert_eq!(
            collect_semantic_iterable(
                HostOpaqueValue::Opaque { handle: 1, opaque_type: HostOpaqueType::Object },
                &mut host,
                &mut Context::ordinary(),
                &k("/diagnostics"),
            ).unwrap(),
            HostSemanticIterableOutcome::SemanticThrow(k("iterator getter failed")),
        );
        host.done();
    }

    #[test]
    fn semantic_spread_step_failures_propagate_without_iterator_close() {
        for stage in ["next", "done", "value"] {
            let message = hs(&format!("{stage} failed"));
            let mut script = vec![
                event(
                    HostJsonEvent::GetOpaqueProperty {
                        receiver: HostInvokeValue::Opaque(1),
                        key: HostOpaqueKey::IteratorSymbol,
                        semantic_catch: true,
                    },
                    HostJsonReply::OpaqueValue(HostOpaqueValue::Opaque {
                        handle: 2,
                        opaque_type: HostOpaqueType::Function,
                    }),
                ),
                event(
                    HostJsonEvent::InvokeOpaque {
                        function: 2,
                        receiver: HostInvokeValue::Opaque(1),
                        args: vec![],
                        semantic_catch: true,
                    },
                    HostJsonReply::Invocation(HostOpaqueValue::Opaque {
                        handle: 3,
                        opaque_type: HostOpaqueType::Object,
                    }),
                ),
                event(
                    HostJsonEvent::GetOpaqueProperty {
                        receiver: HostInvokeValue::Opaque(3),
                        key: HostOpaqueKey::String("next".encode_utf16().collect()),
                        semantic_catch: true,
                    },
                    HostJsonReply::OpaqueValue(HostOpaqueValue::Opaque {
                        handle: 4,
                        opaque_type: HostOpaqueType::Function,
                    }),
                ),
            ];
            if stage == "next" {
                script.push(event(
                    HostJsonEvent::InvokeOpaque {
                        function: 4,
                        receiver: HostInvokeValue::Opaque(3),
                        args: vec![],
                        semantic_catch: true,
                    },
                    HostJsonReply::SemanticThrow(message.clone()),
                ));
            } else {
                script.extend([
                    event(
                        HostJsonEvent::InvokeOpaque {
                            function: 4,
                            receiver: HostInvokeValue::Opaque(3),
                            args: vec![],
                            semantic_catch: true,
                        },
                        HostJsonReply::Invocation(HostOpaqueValue::Opaque {
                            handle: 5,
                            opaque_type: HostOpaqueType::Object,
                        }),
                    ),
                    event(
                        HostJsonEvent::GetOpaqueProperty {
                            receiver: HostInvokeValue::Opaque(5),
                            key: HostOpaqueKey::String("done".encode_utf16().collect()),
                            semantic_catch: true,
                        },
                        if stage == "done" {
                            HostJsonReply::SemanticThrow(message.clone())
                        } else {
                            HostJsonReply::OpaqueValue(HostOpaqueValue::Boolean(false))
                        },
                    ),
                ]);
                if stage == "value" {
                    script.push(event(
                        HostJsonEvent::GetOpaqueProperty {
                            receiver: HostInvokeValue::Opaque(5),
                            key: HostOpaqueKey::String("value".encode_utf16().collect()),
                            semantic_catch: true,
                        },
                        HostJsonReply::SemanticThrow(message.clone()),
                    ));
                }
            }
            let mut host = ScriptedHost::new(script);
            host.strings.insert(message.token, message.test_units.to_vec());
            assert_eq!(
                collect_semantic_iterable(
                    HostOpaqueValue::Opaque {
                        handle: 1,
                        opaque_type: HostOpaqueType::Object,
                    },
                    &mut host,
                    &mut Context::ordinary(),
                    &k("/diagnostics"),
                )
                .unwrap(),
                HostSemanticIterableOutcome::SemanticThrow(k(&format!("{stage} failed"))),
            );
            assert!(host.seen.iter().all(|event| !matches!(
                event,
                HostJsonEvent::CloseOpaqueIterator { .. }
            )));
            host.done();
        }
    }

    #[test]
    fn deferred_diagnostic_copy_reports_nested_non_json_path() {
        let diagnostic = 51;
        let snapshot = 52;
        let mut host = ScriptedHost::new(vec![
            event(object(diagnostic), HostJsonReply::Kind(HostJsonKind::Object(diagnostic))),
            event(HostJsonEvent::GetPrototype { handle: diagnostic }, HostJsonReply::Prototype(HostPrototype::Null)),
            event(HostJsonEvent::IsArray { handle: diagnostic }, HostJsonReply::Boolean(false)),
            event(HostJsonEvent::OwnSymbolCount { handle: diagnostic }, HostJsonReply::Count(0)),
            event(HostJsonEvent::DescriptorSnapshot { handle: diagnostic }, HostJsonReply::Snapshot(HostDescriptorSnapshot { token: snapshot, count: 1 })),
            event(HostJsonEvent::IsArray { handle: diagnostic }, HostJsonReply::Boolean(false)),
            event(HostJsonEvent::DescriptorAt { token: snapshot, index: 0 }, HostJsonReply::Descriptor(HostPropertyDescriptor {
                key: hs("unknown"), enumerable: true, is_data: true, value: Some(HostDescriptorValue::Unsupported("bigint")),
            })),
            event(HostJsonEvent::IsArray { handle: diagnostic }, HostJsonReply::Boolean(false)),
            event(HostJsonEvent::IsArray { handle: diagnostic }, HostJsonReply::Boolean(false)),
        ]);
        let mut ctx = Context::ordinary();
        let error = materialize_semantic_iterable_values(
            vec![HostOpaqueValue::Opaque { handle: diagnostic, opaque_type: HostOpaqueType::Object }],
            &mut host,
            &mut ctx,
            &k("/sourceValidation/diagnostics"),
            2,
        ).unwrap_err();
        assert_eq!(error.code, "NON_JSON");
        assert_eq!(error.path, k("/sourceValidation/diagnostics/0/unknown"));
        host.done();
    }

    fn object(handle: HostHandle) -> HostJsonEvent {
        HostJsonEvent::Classify { handle }
    }
    fn simple_object_script() -> Vec<(HostJsonEvent, HostJsonReply)> {
        let key = hs("x");
        vec![
            event(object(1), HostJsonReply::Kind(HostJsonKind::Object(1))),
            event(
                HostJsonEvent::GetPrototype { handle: 1 },
                HostJsonReply::Prototype(HostPrototype::OrdinaryObject),
            ),
            event(
                HostJsonEvent::IsArray { handle: 1 },
                HostJsonReply::Boolean(false),
            ),
            event(
                HostJsonEvent::OwnSymbolCount { handle: 1 },
                HostJsonReply::Count(0),
            ),
            event(
                HostJsonEvent::DescriptorSnapshot { handle: 1 },
                HostJsonReply::Snapshot(HostDescriptorSnapshot { token: 9, count: 1 }),
            ),
            event(
                HostJsonEvent::IsArray { handle: 1 },
                HostJsonReply::Boolean(false),
            ),
            event(
                HostJsonEvent::DescriptorAt { token: 9, index: 0 },
                HostJsonReply::Descriptor(HostPropertyDescriptor {
                    key,
                    enumerable: true,
                    is_data: true,
                    value: Some(HostDescriptorValue::String(hs("v"))),
                }),
            ),
            event(
                HostJsonEvent::IsArray { handle: 1 },
                HostJsonReply::Boolean(false),
            ),
            event(
                HostJsonEvent::IsArray { handle: 1 },
                HostJsonReply::Boolean(false),
            ),
            event(
                HostJsonEvent::IsArray { handle: 1 },
                HostJsonReply::Boolean(false),
            ),
        ]
    }
    fn context(limits: Limits) -> Context<'static> {
        Context::with_limits(ResourceProfile::Cooperative, limits).unwrap()
    }

    #[test]
    fn native_unicode_count_uses_the_admitted_copy_and_validates_count_reply() {
        let value = Value::Object(vec![(k("length"), Value::Object(Vec::new()))]);
        let expected = HostJsonEvent::UnicodeCount {
            value: value.clone(),
        };
        let mut host = ScriptedHost::new(vec![event(expected, HostJsonReply::Count(0))]);
        assert_eq!(
            unicode_count_host_copy(&value, &mut host, &mut Context::ordinary()).unwrap(),
            0
        );
        assert_eq!(host.seen.len(), 1);
        host.done();
    }

    #[test]
    fn descriptor_snapshot_precedes_child_visit_and_array_checks_repeat() {
        let script = simple_object_script();
        let expected_events: Vec<_> = script.iter().map(|(event, _)| event.clone()).collect();
        let mut host = ScriptedHost::new(script);
        let mut ctx = Context::ordinary();
        let copied = copy_host_json(1, &mut host, &mut ctx).unwrap();
        assert_eq!(copied, Value::Object(vec![(k("x"), Value::String(k("v")))]));
        assert_eq!(host.seen, expected_events);
        assert_eq!(host.released, vec![9]);
        host.done();
    }

    #[test]
    fn array_event_sequence_checks_index_then_child_then_density() {
        let key = hs("0");
        let script = vec![
            event(object(1), HostJsonReply::Kind(HostJsonKind::Object(1))),
            event(
                HostJsonEvent::GetPrototype { handle: 1 },
                HostJsonReply::Prototype(HostPrototype::Array),
            ),
            event(
                HostJsonEvent::IsArray { handle: 1 },
                HostJsonReply::Boolean(true),
            ),
            event(
                HostJsonEvent::OwnSymbolCount { handle: 1 },
                HostJsonReply::Count(0),
            ),
            event(
                HostJsonEvent::DescriptorSnapshot { handle: 1 },
                HostJsonReply::Snapshot(HostDescriptorSnapshot { token: 9, count: 1 }),
            ),
            event(
                HostJsonEvent::IsArray { handle: 1 },
                HostJsonReply::Boolean(true),
            ),
            event(
                HostJsonEvent::DescriptorAt { token: 9, index: 0 },
                HostJsonReply::Descriptor(HostPropertyDescriptor {
                    key: key.clone(),
                    enumerable: true,
                    is_data: true,
                    value: Some(HostDescriptorValue::Number(4.0)),
                }),
            ),
            event(
                HostJsonEvent::IsArray { handle: 1 },
                HostJsonReply::Boolean(true),
            ),
            event(
                HostJsonEvent::IsArray { handle: 1 },
                HostJsonReply::Boolean(true),
            ),
            event(
                HostJsonEvent::ArrayIndexAtOrPastLength { handle: 1, key },
                HostJsonReply::Boolean(false),
            ),
            event(
                HostJsonEvent::IsArray { handle: 1 },
                HostJsonReply::Boolean(true),
            ),
            event(
                HostJsonEvent::ArrayIsSparseOrExtended { handle: 1 },
                HostJsonReply::Boolean(false),
            ),
        ];
        let mut host = ScriptedHost::new(script);
        let mut ctx = Context::ordinary();
        assert_eq!(
            copy_host_json(1, &mut host, &mut ctx).unwrap(),
            Value::Array(vec![Value::Number(4.0)])
        );
        host.done();
    }

    #[test]
    fn number_profile_and_cycle_failures_are_rust_owned() {
        let mut number_host = ScriptedHost::new(vec![event(
            object(1),
            HostJsonReply::Kind(HostJsonKind::Number(-0.0)),
        )]);
        let mut ctx = Context::ordinary();
        assert_eq!(
            copy_host_json(1, &mut number_host, &mut ctx)
                .unwrap_err()
                .code,
            "NUMBER"
        );
        number_host.done();

        let mut script = simple_object_script();
        script[4].1 = HostJsonReply::Snapshot(HostDescriptorSnapshot { token: 9, count: 1 });
        script[6].0 = HostJsonEvent::DescriptorAt { token: 9, index: 0 };
        script[6].1 = HostJsonReply::Descriptor(HostPropertyDescriptor {
            key: hs("self"),
            enumerable: true,
            is_data: true,
            value: Some(HostDescriptorValue::Object(1)),
        });
        script.truncate(9);
        script.push(event(
            object(1),
            HostJsonReply::Kind(HostJsonKind::Object(1)),
        ));
        let mut cycle_host = ScriptedHost::new(script);
        let mut ctx = Context::ordinary();
        let error = copy_host_json(1, &mut cycle_host, &mut ctx).unwrap_err();
        assert_eq!(error.code, "CYCLE");
        assert_eq!(error.path, k("/self"));
        cycle_host.done();
    }

    #[test]
    fn depth_and_value_limits_precede_host_classification() {
        let limits = Limits {
            max_depth: 0,
            max_values: 0,
            ..Limits::ordinary()
        };
        let mut host = ScriptedHost::new(vec![]);
        let mut ctx = context(limits);
        let error = copy_host_json(1, &mut host, &mut ctx).unwrap_err();
        assert_eq!(error.code, "LIMIT");
        assert_eq!(error.message, k("JSON structural limit exceeded"));
        assert_eq!(error.path, k(""));
        host.done();

        let mut limited = simple_object_script();
        limited.truncate(9);
        let mut host = ScriptedHost::new(limited);
        let limits = Limits {
            max_depth: 0,
            ..Limits::ordinary()
        };
        let mut ctx = context(limits);
        let error = copy_host_json(1, &mut host, &mut ctx).unwrap_err();
        assert_eq!(error.code, "LIMIT");
        assert_eq!(error.path, k("/x"));
        assert_eq!(error.message, k("JSON structural limit exceeded"));
        host.done();
    }

    #[test]
    fn unsupported_value_uses_predecessor_error_message_and_path() {
        let mut host = ScriptedHost::new(vec![event(
            object(7),
            HostJsonReply::Kind(HostJsonKind::Unsupported("function")),
        )]);
        let mut ctx = Context::ordinary();
        let error = copy_host_json(7, &mut host, &mut ctx).unwrap_err();
        assert_eq!(error.code, "NON_JSON");
        assert_eq!(error.message, k("Value is not JSON-compatible"));
        assert_eq!(error.path, k(""));
        host.done();
    }

    #[test]
    fn chunk_transport_validates_offset_and_exact_unit_count() {
        for fault in [ChunkFault::Offset, ChunkFault::Length] {
            let string = hs("chunk");
            let host = ScriptedHost::new(vec![event(
                object(4),
                HostJsonReply::Kind(HostJsonKind::String(string)),
            )])
            .with_chunk_fault(fault);
            let mut host = host;
            let mut ctx = Context::ordinary();
            let error = copy_host_json(4, &mut host, &mut ctx).unwrap_err();
            assert_eq!(error.code, "HOST_JSON_PROTOCOL");
            assert_eq!(error.message, k("Host returned an invalid UTF-16 chunk"));
            assert_eq!(error.path, k(""));
            assert_eq!(host.chunks_seen.len(), 1);
            assert_eq!(host.chunks_seen[0].2, HOST_STRING_CHUNK_UNITS);
            host.done();
        }
    }

    #[test]
    fn root_string_uses_the_same_fixed_chunk_bridge() {
        let string = HostStringRef::fake_units(vec![0x61; HOST_STRING_CHUNK_UNITS + 1]);
        let token = string.token;
        let mut host = ScriptedHost::new(vec![event(
            object(5),
            HostJsonReply::Kind(HostJsonKind::String(string)),
        )]);
        let mut ctx = Context::ordinary();
        let copied = copy_host_json(5, &mut host, &mut ctx).unwrap();
        assert!(
            matches!(copied, Value::String(value) if value.len() == HOST_STRING_CHUNK_UNITS + 1)
        );
        assert_eq!(
            host.chunks_seen
                .iter()
                .map(|entry| (entry.0, entry.1, entry.2))
                .collect::<Vec<_>>(),
            vec![
                (token, 0, HOST_STRING_CHUNK_UNITS),
                (token, HOST_STRING_CHUNK_UNITS, HOST_STRING_CHUNK_UNITS)
            ]
        );
        assert_eq!(ctx.charged_work(), 1);
        host.done();
    }

    #[test]
    fn first_unsupported_child_wins_over_later_descriptor_count() {
        let script = vec![
            event(object(1), HostJsonReply::Kind(HostJsonKind::Object(1))),
            event(
                HostJsonEvent::GetPrototype { handle: 1 },
                HostJsonReply::Prototype(HostPrototype::OrdinaryObject),
            ),
            event(
                HostJsonEvent::IsArray { handle: 1 },
                HostJsonReply::Boolean(false),
            ),
            event(
                HostJsonEvent::OwnSymbolCount { handle: 1 },
                HostJsonReply::Count(0),
            ),
            event(
                HostJsonEvent::DescriptorSnapshot { handle: 1 },
                HostJsonReply::Snapshot(HostDescriptorSnapshot {
                    token: 22,
                    count: 4,
                }),
            ),
            event(
                HostJsonEvent::IsArray { handle: 1 },
                HostJsonReply::Boolean(false),
            ),
            event(
                HostJsonEvent::DescriptorAt {
                    token: 22,
                    index: 0,
                },
                HostJsonReply::Descriptor(HostPropertyDescriptor {
                    key: hs("first"),
                    enumerable: true,
                    is_data: true,
                    value: Some(HostDescriptorValue::Unsupported("undefined")),
                }),
            ),
            event(
                HostJsonEvent::IsArray { handle: 1 },
                HostJsonReply::Boolean(false),
            ),
            event(
                HostJsonEvent::IsArray { handle: 1 },
                HostJsonReply::Boolean(false),
            ),
        ];
        let expected: Vec<_> = script.iter().map(|(e, _)| e.clone()).collect();
        let mut host = ScriptedHost::new(script);
        let limits = Limits {
            max_values: 2,
            ..Limits::ordinary()
        };
        let mut ctx = context(limits);
        let error = copy_host_json(1, &mut host, &mut ctx).unwrap_err();
        assert_eq!(error.code, "NON_JSON");
        assert_eq!(error.message, k("Value is not JSON-compatible"));
        assert_eq!(error.path, k("/first"));
        assert_eq!(host.seen, expected);
        assert_eq!(host.released, vec![22]);
        host.done();
    }

    #[test]
    fn large_visible_utf16_key_and_value_are_not_semantic_limits() {
        // max_text_units is a predecessor metering input, not copy admission.
        let huge = HostStringRef::fake_units(vec![b'x' as u16; 4_000_001]);
        let token = huge.token;
        let mut script = simple_object_script();
        script[6].1 = HostJsonReply::Descriptor(HostPropertyDescriptor {
            key: huge.clone(),
            enumerable: true,
            is_data: true,
            value: Some(HostDescriptorValue::String(huge.clone())),
        });
        let mut host = ScriptedHost::new(script);
        let mut metered = 0usize;
        let mut meter = |amount| {
            metered += amount;
            Ok(())
        };
        let mut ctx = Context::ordinary().with_meter(&mut meter);
        let copied = copy_host_json(1, &mut host, &mut ctx).unwrap();
        let Value::Object(members) = copied else {
            panic!("expected object");
        };
        assert_eq!(members[0].0.len(), 4_000_001);
        assert!(matches!(&members[0].1, Value::String(value) if value.len() == 4_000_001));
        let chunks: Vec<_> = host
            .chunks_seen
            .iter()
            .filter(|entry| entry.0 == token)
            .collect();
        assert_eq!(
            chunks.len(),
            2 * (4_000_001usize.div_ceil(HOST_STRING_CHUNK_UNITS))
        );
        for (index, chunk) in chunks.iter().enumerate() {
            assert_eq!(
                chunk.1,
                (index % (chunks.len() / 2)) * HOST_STRING_CHUNK_UNITS
            );
            assert_eq!(chunk.2, HOST_STRING_CHUNK_UNITS);
            assert_eq!(chunk.3, if index < chunks.len() / 2 { 8 } else { 9 });
        }
        assert_eq!(host.released, vec![9]);
        host.done();
        assert_eq!(ctx.charged_work(), 2);
        drop(ctx);
        assert_eq!(metered, 2);
    }

    #[test]
    fn oversized_hidden_key_keeps_descriptor_error_precedence() {
        let huge = HostStringRef::fake_units(vec![b'h' as u16; 4_000_001]);
        let token = huge.token;
        let mut script = simple_object_script();
        script[6].1 = HostJsonReply::Descriptor(HostPropertyDescriptor {
            key: huge,
            enumerable: false,
            is_data: false,
            value: Some(HostDescriptorValue::String(HostStringRef::fake("deferred"))),
        });
        script.truncate(8);
        let mut host = ScriptedHost::new(script);
        let mut ctx = Context::ordinary();
        let error = copy_host_json(1, &mut host, &mut ctx).unwrap_err();
        assert_eq!(error.code, "NON_JSON");
        assert_eq!(
            error.message,
            k("Hidden fields and accessors cannot be serialized faithfully")
        );
        assert_eq!(error.path.len(), 4_000_002);
        assert_eq!(host.released, vec![9]);
        assert!(!host.chunks_seen.iter().any(|chunk| chunk.0 != token));
        host.done();
    }

    #[test]
    fn sparse_errors_precede_refusal_for_dynamic_sparse_valid_shape() {
        let key = hs("1");
        let mut script = vec![
            event(object(1), HostJsonReply::Kind(HostJsonKind::Object(1))),
            event(
                HostJsonEvent::GetPrototype { handle: 1 },
                HostJsonReply::Prototype(HostPrototype::Array),
            ),
            event(
                HostJsonEvent::IsArray { handle: 1 },
                HostJsonReply::Boolean(true),
            ),
            event(
                HostJsonEvent::OwnSymbolCount { handle: 1 },
                HostJsonReply::Count(0),
            ),
            event(
                HostJsonEvent::DescriptorSnapshot { handle: 1 },
                HostJsonReply::Snapshot(HostDescriptorSnapshot {
                    token: 12,
                    count: 1,
                }),
            ),
            event(
                HostJsonEvent::IsArray { handle: 1 },
                HostJsonReply::Boolean(true),
            ),
            event(
                HostJsonEvent::DescriptorAt {
                    token: 12,
                    index: 0,
                },
                HostJsonReply::Descriptor(HostPropertyDescriptor {
                    key: key.clone(),
                    enumerable: true,
                    is_data: true,
                    value: Some(HostDescriptorValue::Number(5.0)),
                }),
            ),
            event(
                HostJsonEvent::IsArray { handle: 1 },
                HostJsonReply::Boolean(true),
            ),
            event(
                HostJsonEvent::IsArray { handle: 1 },
                HostJsonReply::Boolean(true),
            ),
            event(
                HostJsonEvent::ArrayIndexAtOrPastLength { handle: 1, key },
                HostJsonReply::Boolean(false),
            ),
            event(
                HostJsonEvent::IsArray { handle: 1 },
                HostJsonReply::Boolean(true),
            ),
            event(
                HostJsonEvent::ArrayIsSparseOrExtended { handle: 1 },
                HostJsonReply::Boolean(true),
            ),
        ];
        let expected: Vec<_> = script.iter().map(|(e, _)| e.clone()).collect();
        let mut ordinary_host = ScriptedHost::new(script.clone());
        let mut ctx = Context::ordinary();
        let error = copy_host_json(1, &mut ordinary_host, &mut ctx).unwrap_err();
        assert_eq!(error.code, "NON_JSON");
        assert_eq!(error.message, k("Sparse arrays are not JSON values"));
        assert_eq!(error.path, k(""));
        assert_eq!(ordinary_host.seen, expected);
        assert_eq!(ordinary_host.released, vec![12]);
        ordinary_host.done();

        script.last_mut().unwrap().1 = HostJsonReply::Boolean(false);
        let mut dynamic_host = ScriptedHost::new(std::mem::take(&mut script));
        let mut ctx = Context::ordinary();
        let error = copy_host_json(1, &mut dynamic_host, &mut ctx).unwrap_err();
        assert_eq!(error.code, "HOST_JSON_UNREPRESENTABLE");
        assert_eq!(error.path, k(""));
        assert_eq!(
            error.message,
            k("Host array snapshot produced holes that the Rust JSON value cannot represent")
        );
        assert_eq!(dynamic_host.seen, expected);
        assert_eq!(dynamic_host.released, vec![12]);
        dynamic_host.done();
    }

    #[test]
    fn one_context_keeps_work_control_cumulative_across_copies() {
        let mut metered = 0usize;
        let mut meter = |amount| {
            metered += amount;
            Ok(())
        };
        let mut ctx = Context::ordinary().with_meter(&mut meter);
        for handle in [1, 2] {
            let mut host = ScriptedHost::new(vec![event(
                object(handle),
                HostJsonReply::Kind(HostJsonKind::Boolean(true)),
            )]);
            assert_eq!(
                copy_host_json(handle, &mut host, &mut ctx).unwrap(),
                Value::Bool(true)
            );
            host.done();
        }
        assert_eq!(ctx.charged_work(), 2);
        drop(ctx);
        assert_eq!(metered, 2);
    }
}
