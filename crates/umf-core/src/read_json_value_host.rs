// SPDX-License-Identifier: MIT OR Apache-2.0
//! Opt-in raw-host acquisition protocol for ordinary `readJsonValue`.
//!
//! This module owns ordered raw-host acquisition and hands checked UTF-16
//! source to the shared parser. Host binding adapters remain separate work.
//! Invocation scoping, token freshness, stale-handle rejection, and exact
//! parser `TypeError` constructor/message compatibility remain adapter
//! responsibilities. This protocol is not production-complete
//! until those responsibilities are implemented and qualified in each host.

use crate::{serialization::Format, Context, EngineError, ResourceProfile, Utf16, Value};

pub const ORDINARY_TEXT_LIMIT: usize = 4_000_000;
pub const HOST_STRING_CHUNK_UNITS: usize = 8192;
pub type HostThrowToken = u64;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SourceKind {
    PrimitiveString { utf16_units: usize },
    FalsyNonString,
    TruthyNonString,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Utf16Chunk {
    pub offset: usize,
    pub units: Vec<u16>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AcquiredSource {
    pub format: Format,
    /// Second raw `.length` observation. Its host-side value is intentionally
    /// opaque here: it is an ordered event, not a cached admission length.
    pub second_length_observation: (),
    pub source_kind: SourceKind,
    pub chunks: Vec<Utf16Chunk>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum AcquisitionFailure {
    Engine(EngineError),
    /// The token identifies the exact host-thrown value in the adapter's
    /// invocation-local table. Rust never stringifies it.
    HostThrow(HostThrowToken),
    ParserTypeError,
}

/// Synchronous callbacks over one opaque, invocation-local raw source handle.
/// Implementations must preserve JavaScript access/coercion order exactly.
pub trait ReadJsonValueHost {
    fn raw_length_greater_than(&mut self, limit: usize) -> Result<bool, HostThrowToken>;
    /// Host performs the strict `format === "json"` test; no coercion occurs.
    fn select_format(&mut self) -> Result<Format, HostThrowToken>;
    /// Evaluate the live `JSON.parse(rawSource)` expression. Throws are caught
    /// by the TypeScript boundary and therefore map to SYNTAX.
    fn json_preflight(&mut self) -> Result<(), HostThrowToken>;
    fn observe_second_length(&mut self) -> Result<(), HostThrowToken>;
    fn source_kind(&mut self) -> Result<SourceKind, HostThrowToken>;
    fn read_utf16_chunk(
        &mut self,
        offset: usize,
        maximum_units: usize,
    ) -> Result<Utf16Chunk, HostThrowToken>;
}

/// Variant for bindings that attach cancellation, deadline, or meter controls
/// to the operation's single Context before acquisition starts. The caller
/// must retain and reuse this same Context for all subsequent parse and rebuild
/// work; constructing a separate Context for parser handoff breaks the shared
/// accounting contract.
pub fn acquire_with_context<H: ReadJsonValueHost>(
    host: &mut H,
    context: &mut Context<'_>,
) -> Result<AcquiredSource, AcquisitionFailure> {
    if context.profile() == ResourceProfile::HardIsolated {
        return Err(AcquisitionFailure::Engine(EngineError::new(
            "RESOURCE_PROFILE_UNAVAILABLE",
            Utf16::default(),
            "HardIsolated resource profile is unavailable",
        )));
    }

    callback_checkpoint(context)?;
    if host
        .raw_length_greater_than(ORDINARY_TEXT_LIMIT)
        .map_err(AcquisitionFailure::HostThrow)?
    {
        return Err(AcquisitionFailure::Engine(EngineError::new(
            "LIMIT",
            Utf16::default(),
            "Source text exceeds limit",
        )));
    }

    callback_checkpoint(context)?;
    let format = host
        .select_format()
        .map_err(AcquisitionFailure::HostThrow)?;

    if format == Format::Json {
        callback_checkpoint(context)?;
        if host.json_preflight().is_err() {
            return Err(AcquisitionFailure::Engine(EngineError::new(
                "SYNTAX",
                Utf16::default(),
                "Invalid JSON syntax",
            )));
        }
        // Refusal after opaque engine work remains a control failure.
        callback_checkpoint(context)?;
    }

    callback_checkpoint(context)?;
    host.observe_second_length()
        .map_err(AcquisitionFailure::HostThrow)?;

    callback_checkpoint(context)?;
    let source_kind = host.source_kind().map_err(AcquisitionFailure::HostThrow)?;
    if source_kind == SourceKind::TruthyNonString {
        return Err(AcquisitionFailure::ParserTypeError);
    }

    let mut chunks = Vec::new();
    if let SourceKind::PrimitiveString { utf16_units } = source_kind {
        if utf16_units > context.limits().max_text_units {
            return Err(AcquisitionFailure::Engine(EngineError::new(
                "LIMIT",
                Utf16::default(),
                "Source text exceeds limit",
            )));
        }
        // Reserve source admission/work before requesting chunks. Concatenation
        // below and parser scanning are separate Rust operations, charged at
        // their respective boundaries.
        context
            .charge_text(utf16_units, Utf16::default())
            .map_err(AcquisitionFailure::Engine)?;
        let mut offset = 0usize;
        while offset < utf16_units {
            callback_checkpoint(context)?;
            let requested = (utf16_units - offset).min(HOST_STRING_CHUNK_UNITS);
            let chunk = host
                .read_utf16_chunk(offset, requested)
                .map_err(AcquisitionFailure::HostThrow)?;
            if chunk.offset != offset || chunk.units.is_empty() || chunk.units.len() > requested {
                return Err(protocol_error("Invalid UTF-16 chunk offset or count"));
            }
            offset = offset
                .checked_add(chunk.units.len())
                .ok_or_else(|| protocol_error("UTF-16 chunk offset overflow"))?;
            chunks.push(chunk);
        }
    }

    Ok(AcquiredSource {
        format,
        second_length_observation: (),
        source_kind,
        chunks,
    })
}

/// Acquire and parse an ordinary raw-host value using the caller's one
/// operation Context. The host callback preflight remains opaque and
/// unmetered; all Rust chunk assembly and parser work use this same Context.
pub fn execute_with_context<H: ReadJsonValueHost>(
    host: &mut H,
    context: &mut Context<'_>,
) -> Result<Value, AcquisitionFailure> {
    let acquired = acquire_with_context(host, context)?;
    let total_units = acquired
        .chunks
        .iter()
        .try_fold(0usize, |total, chunk| total.checked_add(chunk.units.len()))
        .ok_or_else(|| protocol_error("UTF-16 source length overflow"))?;
    if let SourceKind::PrimitiveString { utf16_units } = acquired.source_kind {
        if total_units != utf16_units {
            return Err(protocol_error("UTF-16 chunks do not match declared length"));
        }
    } else if total_units != 0 {
        return Err(protocol_error("Non-string source returned UTF-16 chunks"));
    }

    // Charge the concatenation copy before reserving its destination buffer.
    context
        .charge_work(total_units, Utf16::default())
        .map_err(AcquisitionFailure::Engine)?;
    let mut source = Vec::new();
    source
        .try_reserve_exact(total_units)
        .map_err(|_| protocol_error("Unable to allocate UTF-16 source buffer"))?;
    for chunk in acquired.chunks {
        source.extend_from_slice(&chunk.units);
    }

    // The parser's source protocol maps falsy nonstrings to an empty YAML
    // stream, including after an explicit JSON preflight.
    let format = if acquired.source_kind == SourceKind::FalsyNonString {
        Format::Yaml
    } else {
        acquired.format
    };
    match format {
        Format::Json => {
            crate::serialization::read_typescript_json_value_after_json_preflight(&source, context)
                .map_err(AcquisitionFailure::Engine)
        }
        Format::Yaml => crate::serialization::read_typescript_json_value(&source, None, context)
            .map_err(AcquisitionFailure::Engine),
    }
}

fn callback_checkpoint(context: &mut Context<'_>) -> Result<(), AcquisitionFailure> {
    // A zero-work charge still runs attached meter/control/cancellation/deadline
    // callbacks; it does not grow the Rust work counter.
    context
        .charge_work(0, Utf16::default())
        .map_err(AcquisitionFailure::Engine)
}

fn protocol_error(message: &str) -> AcquisitionFailure {
    AcquisitionFailure::Engine(EngineError::new("PROTOCOL", Utf16::default(), message))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::VecDeque;

    #[derive(Clone, Debug, PartialEq, Eq)]
    enum Call {
        Length(usize),
        Format,
        Preflight,
        SecondLength,
        Kind,
        Chunk(usize, usize),
    }

    struct FakeHost {
        calls: Vec<Call>,
        source: Vec<u16>,
        format: Format,
        kind: SourceKind,
        fail: Option<(Call, HostThrowToken)>,
        corrupt_chunk: bool,
        responses: VecDeque<Result<(), HostThrowToken>>,
    }

    impl FakeHost {
        fn new(source: &str, format: Format) -> Self {
            Self {
                calls: vec![],
                source: source.encode_utf16().collect(),
                format,
                kind: SourceKind::PrimitiveString {
                    utf16_units: source.encode_utf16().count(),
                },
                fail: None,
                corrupt_chunk: false,
                responses: VecDeque::new(),
            }
        }
        fn called(&mut self, call: Call) -> Result<(), HostThrowToken> {
            self.calls.push(call.clone());
            if let Some((at, token)) = &self.fail {
                if *at == call {
                    return Err(*token);
                }
            }
            self.responses.pop_front().unwrap_or(Ok(()))
        }
    }

    fn acquire_test<H: ReadJsonValueHost>(
        host: &mut H,
    ) -> Result<AcquiredSource, AcquisitionFailure> {
        let mut context = Context::ordinary();
        acquire_with_context(host, &mut context)
    }

    fn execute_test<H: ReadJsonValueHost>(host: &mut H) -> Result<Value, AcquisitionFailure> {
        let mut context = Context::ordinary();
        execute_with_context(host, &mut context)
    }

    impl ReadJsonValueHost for FakeHost {
        fn raw_length_greater_than(&mut self, limit: usize) -> Result<bool, HostThrowToken> {
            self.called(Call::Length(limit))?;
            Ok(false)
        }
        fn select_format(&mut self) -> Result<Format, HostThrowToken> {
            self.called(Call::Format)?;
            Ok(self.format)
        }
        fn json_preflight(&mut self) -> Result<(), HostThrowToken> {
            self.called(Call::Preflight)
        }
        fn observe_second_length(&mut self) -> Result<(), HostThrowToken> {
            self.called(Call::SecondLength)
        }
        fn source_kind(&mut self) -> Result<SourceKind, HostThrowToken> {
            self.called(Call::Kind)?;
            Ok(self.kind)
        }
        fn read_utf16_chunk(
            &mut self,
            offset: usize,
            maximum_units: usize,
        ) -> Result<Utf16Chunk, HostThrowToken> {
            self.called(Call::Chunk(offset, maximum_units))?;
            let end = (offset + maximum_units).min(self.source.len());
            Ok(Utf16Chunk {
                offset: if self.corrupt_chunk {
                    offset + 1
                } else {
                    offset
                },
                units: self.source[offset..end].to_vec(),
            })
        }
    }

    #[test]
    fn preserves_required_order_and_bounded_utf16_chunks() {
        let mut source = "a".repeat(HOST_STRING_CHUNK_UNITS + 2);
        source.push('🧪');
        let mut host = FakeHost::new(&source, Format::Json);
        let acquired = acquire_test(&mut host).unwrap();
        assert_eq!(
            host.calls[0..5],
            [
                Call::Length(ORDINARY_TEXT_LIMIT),
                Call::Format,
                Call::Preflight,
                Call::SecondLength,
                Call::Kind
            ]
        );
        assert_eq!(acquired.chunks.len(), 2);
        assert!(acquired
            .chunks
            .iter()
            .all(|c| c.units.len() <= HOST_STRING_CHUNK_UNITS));
        assert_eq!(
            acquired
                .chunks
                .iter()
                .flat_map(|c| c.units.iter().copied())
                .collect::<Vec<_>>(),
            source.encode_utf16().collect::<Vec<_>>()
        );
    }

    #[test]
    fn host_throw_token_survives_and_short_circuits() {
        let mut host = FakeHost::new("x", Format::Yaml);
        host.fail = Some((Call::Length(ORDINARY_TEXT_LIMIT), 0xabc));
        assert_eq!(
            acquire_test(&mut host),
            Err(AcquisitionFailure::HostThrow(0xabc))
        );
        assert_eq!(host.calls, [Call::Length(ORDINARY_TEXT_LIMIT)]);
    }

    #[test]
    fn preflight_throw_maps_to_syntax_and_skips_later_events() {
        let mut host = FakeHost::new("{", Format::Json);
        host.fail = Some((Call::Preflight, 17));
        let error = acquire_test(&mut host).unwrap_err();
        assert!(
            matches!(error, AcquisitionFailure::Engine(ref e) if e.code == "SYNTAX" && e.message.to_utf8().unwrap() == "Invalid JSON syntax")
        );
        assert_eq!(
            host.calls,
            [
                Call::Length(ORDINARY_TEXT_LIMIT),
                Call::Format,
                Call::Preflight
            ]
        );
    }

    #[test]
    fn corrupt_chunks_and_truthy_nonstring_are_refused() {
        let mut host = FakeHost::new("abc", Format::Yaml);
        host.corrupt_chunk = true;
        assert!(
            matches!(acquire_test(&mut host), Err(AcquisitionFailure::Engine(ref e)) if e.code == "PROTOCOL")
        );
        let mut host = FakeHost::new("", Format::Yaml);
        host.kind = SourceKind::TruthyNonString;
        assert_eq!(
            acquire_test(&mut host),
            Err(AcquisitionFailure::ParserTypeError)
        );
    }

    #[test]
    fn text_limit_boundary_and_control_refusal() {
        struct BoundaryHost {
            calls: Vec<Call>,
            units: usize,
        }
        impl ReadJsonValueHost for BoundaryHost {
            fn raw_length_greater_than(&mut self, n: usize) -> Result<bool, u64> {
                self.calls.push(Call::Length(n));
                Ok(false)
            }
            fn select_format(&mut self) -> Result<Format, u64> {
                self.calls.push(Call::Format);
                Ok(Format::Yaml)
            }
            fn json_preflight(&mut self) -> Result<(), u64> {
                unreachable!()
            }
            fn observe_second_length(&mut self) -> Result<(), u64> {
                self.calls.push(Call::SecondLength);
                Ok(())
            }
            fn source_kind(&mut self) -> Result<SourceKind, u64> {
                self.calls.push(Call::Kind);
                Ok(SourceKind::PrimitiveString {
                    utf16_units: self.units,
                })
            }
            fn read_utf16_chunk(&mut self, o: usize, n: usize) -> Result<Utf16Chunk, u64> {
                self.calls.push(Call::Chunk(o, n));
                Ok(Utf16Chunk {
                    offset: o,
                    units: vec![b'x' as u16; n],
                })
            }
        }
        let mut at = BoundaryHost {
            calls: vec![],
            units: ORDINARY_TEXT_LIMIT,
        };
        assert!(acquire_test(&mut at).is_ok());
        let mut over = BoundaryHost {
            calls: vec![],
            units: ORDINARY_TEXT_LIMIT + 1,
        };
        assert!(
            matches!(acquire_test(&mut over), Err(AcquisitionFailure::Engine(ref e)) if e.code == "LIMIT")
        );

        let mut control = |_n| {
            Err(EngineError::new(
                "CONTROL_REFUSED",
                Utf16::default(),
                "refused",
            ))
        };
        let mut context = Context::ordinary().with_host_control(&mut control);
        let mut untouched = FakeHost::new("x", Format::Yaml);
        assert!(
            matches!(acquire_with_context(&mut untouched, &mut context), Err(AcquisitionFailure::Engine(ref e)) if e.code == "CONTROL_REFUSED")
        );
        assert!(untouched.calls.is_empty());
    }

    #[test]
    fn parser_handoff_handles_yaml_json_and_duplicate_keys() {
        let mut yaml = FakeHost::new("name: UMF\n", Format::Yaml);
        assert_eq!(
            execute_test(&mut yaml).unwrap(),
            Value::Object(vec![(
                Utf16::from("name"),
                Value::String(Utf16::from("UMF"))
            )])
        );

        let mut json = FakeHost::new("[true, null, 3]", Format::Json);
        assert_eq!(
            execute_test(&mut json).unwrap(),
            Value::Array(vec![Value::Bool(true), Value::Null, Value::Number(3.0)])
        );
        assert!(json.calls.contains(&Call::Preflight));

        let mut duplicate = FakeHost::new("{\"a\":1,\"a\":2}", Format::Json);
        let error = execute_test(&mut duplicate).unwrap_err();
        let AcquisitionFailure::Engine(error) = error else {
            panic!("expected parser syntax diagnostic")
        };
        assert_eq!(error.code, "SYNTAX");
        assert_eq!(error.path, Utf16::default());
        assert_eq!(
            error.message.to_utf8().unwrap(),
            "Map keys must be unique at line 1, column 8:\n\n{\"a\":1,\"a\":2}\n       ^\n"
        );
    }

    #[test]
    fn execute_preserves_throw_corruption_falsy_stream_and_control_refusal() {
        let mut thrown = FakeHost::new("x", Format::Yaml);
        thrown.fail = Some((Call::SecondLength, 0x1234));
        assert_eq!(
            execute_test(&mut thrown),
            Err(AcquisitionFailure::HostThrow(0x1234))
        );

        let mut corrupt = FakeHost::new("x", Format::Yaml);
        corrupt.corrupt_chunk = true;
        assert!(
            matches!(execute_test(&mut corrupt), Err(AcquisitionFailure::Engine(ref e)) if e.code == "PROTOCOL")
        );

        let mut falsy = FakeHost::new("", Format::Json);
        falsy.kind = SourceKind::FalsyNonString;
        assert_eq!(execute_test(&mut falsy).unwrap(), Value::Null);
        assert!(falsy.calls.contains(&Call::Preflight));

        let mut control_calls = 0usize;
        let mut control = |_: usize| {
            control_calls += 1;
            if control_calls == 4 {
                Err(EngineError::new(
                    "CONTROL_REFUSED",
                    Utf16::default(),
                    "refused",
                ))
            } else {
                Ok(())
            }
        };
        let mut context = Context::ordinary().with_host_control(&mut control);
        let mut controlled = FakeHost::new("1", Format::Json);
        assert!(
            matches!(execute_with_context(&mut controlled, &mut context), Err(AcquisitionFailure::Engine(ref e)) if e.code == "CONTROL_REFUSED")
        );
        assert_eq!(control_calls, 4);
        assert!(!controlled.calls.contains(&Call::SecondLength));
    }
}
