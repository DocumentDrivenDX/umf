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

#[cfg(test)]
impl HostStringRef {
    fn fake(text: &str) -> Self {
        Self::fake_units(text.encode_utf16().collect())
    }
    fn fake_units(units: Vec<u16>) -> Self {
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
    let mut active = BTreeSet::new();
    let mut values = 0usize;
    visit(
        root,
        host,
        ctx,
        &Utf16::default(),
        0,
        &mut values,
        &mut active,
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
            }
        }
        fn done(&self) {
            assert!(
                self.script.is_empty(),
                "unconsumed host events: {:?}",
                self.script
            );
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
            let (expected, reply) = self.script.pop_front().expect("unexpected host event");
            assert_eq!(event, expected, "host reflection event order changed");
            Ok(reply)
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
