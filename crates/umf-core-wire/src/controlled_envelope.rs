//! Outer transport only. No semantic operation or new result grammar.
use serde::Serialize;
use std::io::{self, Write};
use umf_core::{Context, EngineError, Utf16};

#[derive(Serialize)]
struct Success<'a> {
    profile: &'static str,
    status: &'static str,
    wire: &'a str,
}
#[derive(Serialize)]
struct Failure<'a> {
    code: &'a str,
    #[serde(rename = "messageUnits")]
    message: &'a [u16],
    #[serde(rename = "pathUnits")]
    path: &'a [u16],
    profile: &'static str,
    status: &'static str,
}

struct Sizer<'a, 'cap> {
    ctx: &'a mut Context<'cap>,
    size: usize,
    failure: Option<EngineError>,
}
impl Write for Sizer<'_, '_> {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        let checked = self.size.checked_add(bytes.len()).ok_or_else(|| {
            EngineError::new(
                "RESOURCE_LIMIT",
                Utf16::default(),
                "Outer envelope size overflow",
            )
        });
        let result = checked.and_then(|size| {
            self.ctx.charge_work(0, Utf16::default())?;
            self.size = size;
            Ok(())
        });
        if let Err(error) = result {
            self.failure = Some(error);
            return Err(io::Error::new(
                io::ErrorKind::Other,
                "Envelope sizing refused",
            ));
        }
        Ok(bytes.len())
    }
    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}
struct Output<'a, 'cap> {
    ctx: &'a mut Context<'cap>,
    bytes: Vec<u8>,
    maximum: usize,
    failure: Option<EngineError>,
}
impl Write for Output<'_, '_> {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        let result = self.ctx.charge_work(0, Utf16::default()).and_then(|_| {
            if bytes.len() > self.maximum.saturating_sub(self.bytes.len()) {
                return Err(EngineError::new(
                    "ENCODING",
                    Utf16::default(),
                    "Outer envelope bound differs",
                ));
            }
            Ok(())
        });
        if let Err(error) = result {
            self.failure = Some(error);
            return Err(io::Error::new(
                io::ErrorKind::Other,
                "Envelope writing refused",
            ));
        }
        // Complete output allocation/copy was charged before reserving capacity.
        // No growth/reallocation is possible; each serializer chunk polls controls.
        self.bytes.extend_from_slice(bytes);
        Ok(bytes.len())
    }
    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}
fn encode<T: Serialize>(
    value: &T,
    input_work: usize,
    ctx: &mut Context<'_>,
) -> Result<String, EngineError> {
    // Borrowed metadata/string input: no serde Value clone or resource tree copy.
    // Admit the sizing traversal before it runs; the first pass allocates no output.
    ctx.charge_work(input_work, Utf16::default())?;
    let size = {
        let mut writer = Sizer {
            ctx: &mut *ctx,
            size: 0,
            failure: None,
        };
        let result = serde_json::to_writer(&mut writer, value);
        if let Some(error) = writer.failure {
            return Err(error);
        }
        result.map_err(|_| {
            EngineError::new("ENCODING", Utf16::default(), "Outer envelope sizing failed")
        })?;
        writer.size
    };
    ctx.charge_work(size, Utf16::default())?;
    let mut writer = Output {
        ctx: &mut *ctx,
        bytes: Vec::with_capacity(size),
        maximum: size,
        failure: None,
    };
    let result = serde_json::to_writer(&mut writer, value);
    if let Some(error) = writer.failure {
        return Err(error);
    }
    result.map_err(|_| {
        EngineError::new(
            "ENCODING",
            Utf16::default(),
            "Outer envelope serialization failed",
        )
    })?;
    writer.ctx.charge_work(0, Utf16::default())?;
    String::from_utf8(writer.bytes)
        .map_err(|_| EngineError::new("ENCODING", Utf16::default(), "Outer envelope UTF-8 failed"))
}

/// Same closed JSON result/error envelope as result_envelope, under the caller's
/// existing Context. Never catches a denial to encode a second error envelope.
pub fn result_envelope_with_context(
    result: Result<String, EngineError>,
    ctx: &mut Context<'_>,
) -> Result<String, EngineError> {
    const PROFILE: &str = "umf.core-wire/1";
    match result {
        Ok(wire) => {
            let input = wire
                .len()
                .saturating_add(PROFILE.len() + "profile status wire ok".len() + 3);
            encode(
                &Success {
                    profile: PROFILE,
                    status: "ok",
                    wire: &wire,
                },
                input,
                ctx,
            )
        }
        Err(error) => {
            let input = error
                .message
                .len()
                .saturating_add(error.path.len())
                .saturating_mul(6)
                .saturating_add(error.code.len())
                .saturating_add(
                    PROFILE.len() + "code messageUnits pathUnits profile status error".len() + 5,
                );
            encode(
                &Failure {
                    code: &error.code,
                    message: error.message.units(),
                    path: error.path.units(),
                    profile: PROFILE,
                    status: "error",
                },
                input,
                ctx,
            )
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        cell::{Cell, RefCell},
        rc::Rc,
    };
    fn sample() -> Result<String, EngineError> {
        Ok("{\"kind\":\"string\",\"units\":[34,92,10,55296]}".into())
    }
    fn controlled(
        value: Result<String, EngineError>,
        limit: usize,
        prefix: usize,
        deny: Option<(usize, &str)>,
    ) -> (Result<String, EngineError>, Vec<usize>, usize) {
        assert!(limit <= 1_000_000);
        let calls = Rc::new(RefCell::new(Vec::new()));
        let total = Rc::new(Cell::new(0usize));
        let captured = calls.clone();
        let charged = total.clone();
        let mut hook = move |amount: usize| {
            captured.borrow_mut().push(amount);
            charged.set(charged.get() + amount);
            if let Some((index, code)) = deny {
                if captured.borrow().len() == index {
                    return Err(EngineError::new(
                        code,
                        Utf16::from("/boundary"),
                        "first envelope denial",
                    ));
                }
            }
            if charged.get() > limit {
                return Err(EngineError::new(
                    "RESOURCE_LIMIT",
                    Utf16::default(),
                    "test allowance exceeded",
                ));
            }
            Ok(())
        };
        let result = {
            let mut ctx = Context::ordinary().with_host_control(&mut hook);
            let previous = if prefix > 0 {
                ctx.charge_work(prefix, Utf16::default())
            } else {
                Ok(())
            };
            previous.and_then(|_| result_envelope_with_context(value, &mut ctx))
        };
        let events = calls.borrow().clone();
        (result, events, total.get())
    }
    #[test]
    fn success_keeps_the_existing_closed_grammar() {
        let (actual, _, _) = controlled(sample(), 1_000_000, 0, None);
        assert_eq!(actual.unwrap(), crate::result_envelope(sample()));
    }
    #[test]
    fn errors_keep_utf16_fields_without_normalization() {
        let mut error = EngineError::new("REQUEST", Utf16::from("/x"), "invalid");
        error.message = Utf16::new(vec![0xd800, 0x20, 0xd83d, 0xde00]);
        let expected = crate::result_envelope(Err(error.clone()));
        assert_eq!(
            controlled(Err(error), 1_000_000, 0, None).0.unwrap(),
            expected
        );
    }
    #[test]
    fn exact_total_passes_and_one_below_refuses() {
        let (_, _, needed) = controlled(sample(), 1_000_000, 137, None);
        assert!(controlled(sample(), needed, 137, None).0.is_ok());
        assert_eq!(
            controlled(sample(), needed - 1, 137, None)
                .0
                .unwrap_err()
                .code,
            "RESOURCE_LIMIT"
        );
    }
    #[test]
    fn sizing_allocation_writing_and_final_poll_are_terminal() {
        let (_, events, _) = controlled(sample(), 1_000_000, 0, None);
        let allocation = events
            .iter()
            .enumerate()
            .filter(|(_, n)| **n > 0)
            .nth(1)
            .unwrap()
            .0
            + 1;
        let writing = allocation + 1;
        for code in ["CANCELLED", "DEADLINE", "METER_FAILURE"] {
            for boundary in [1, 2, allocation, writing, events.len()] {
                let (result, calls, _) = controlled(sample(), 1_000_000, 0, Some((boundary, code)));
                let failure = result.unwrap_err();
                assert_eq!(failure.code, code);
                assert_eq!(failure.path, Utf16::from("/boundary"));
                assert_eq!(failure.message, Utf16::from("first envelope denial"));
                assert_eq!(
                    calls.len(),
                    boundary,
                    "no callback/error-encoding retry after denial"
                );
            }
        }
    }
    #[test]
    fn prior_invocation_work_is_not_reset_at_envelope_entry() {
        let (result, calls, total) = controlled(sample(), 1_000_000, 1_000_000, None);
        assert_eq!(result.unwrap_err().code, "RESOURCE_LIMIT");
        assert_eq!(calls.len(), 2);
        assert_eq!(calls[0], 1_000_000);
        assert!(total > 1_000_000);
    }
    #[test]
    fn large_semantic_error_cannot_bypass_envelope_admission() {
        let error = EngineError::new(
            "REQUEST",
            Utf16::default(),
            Utf16::from("reason".repeat(40_000)),
        );
        let (result, calls, _) = controlled(Err(error), 1_000_000, 0, None);
        assert_eq!(result.unwrap_err().code, "RESOURCE_LIMIT");
        assert_eq!(
            calls.len(),
            1,
            "deny sizing before any output allocation or fallback envelope"
        );
    }
}
