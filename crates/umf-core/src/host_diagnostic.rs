// SPDX-License-Identifier: MIT OR Apache-2.0
//! Small host-side counterpart to the constraint interpreter's `emit` guard.
//!
//! This validates the required diagnostic fields without materializing or
//! replacing the original opaque callback result. Callers retain that value
//! for later severity checks and final Selection copying.

use crate::{
    Context, EngineError, Utf16,
    host_json::{
        HostDiagnosticArrayItem, HostInvokeValue, HostJsonEvent, HostJsonReflection, HostJsonReply,
        HostOpaqueKey, HostOpaqueValue, read_host_string_value,
    },
};

const HOST_STRING_CHUNK_UNITS: usize = 8192;

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct HostEmitDiagnosticFields {
    pub(crate) severity: Utf16,
}

/// An ordered entry for the later `diagnostics.some(d => d.severity === "error")`
/// pass. Rust-owned diagnostics carry their known severity; callback entries
/// keep the original opaque object so this pass performs a fresh property read.
#[derive(Clone, Debug, PartialEq)]
pub(crate) enum SelectionDiagnosticSeverity {
    Static(Utf16),
    Callback(HostOpaqueValue),
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct OrderedSelectionDiagnostic {
    pub(crate) severity: SelectionDiagnosticSeverity,
}

/// Match `Array.prototype.some` over diagnostic severity in insertion order.
/// Callback values are read on demand and the first error stops later reads.
/// Completeness remains a separate diagnostic-count/length check.
pub(crate) fn diagnostics_have_error(
    diagnostics: &[OrderedSelectionDiagnostic],
    host: &mut dyn HostJsonReflection,
    ctx: &mut Context<'_>,
    path: &Utf16,
) -> Result<bool, EngineError> {
    for diagnostic in diagnostics {
        let severity = match &diagnostic.severity {
            SelectionDiagnosticSeverity::Static(value) => value.clone(),
            SelectionDiagnosticSeverity::Callback(original) => {
                match get_property(original, "severity", host, ctx, path)? {
                    HostOpaqueValue::String(value) => {
                        let chunks = value.units.div_ceil(HOST_STRING_CHUNK_UNITS);
                        ctx.charge_work(value.units.saturating_add(chunks), path.clone())?;
                        read_host_string_value(host, value, path)?
                    }
                    _ => continue,
                }
            }
        };
        if severity == Utf16::from("error") {
            return Ok(true);
        }
    }
    Ok(false)
}

/// Serialize ordered mixed diagnostics with the host's live `JSON.stringify`,
/// then construct the native Error carrier without reading its `message`.
/// Callback objects stay opaque and Rust-generated objects receive ordinary
/// prototypes in the host adapter. Final `UmfError` construction and host
/// error exposure remain a separate, unresolved stage.
pub(crate) fn stringify_diagnostic_array(
    items: Vec<HostDiagnosticArrayItem>,
    host: &mut dyn HostJsonReflection,
    ctx: &mut Context<'_>,
    path: &Utf16,
) -> Result<HostOpaqueValue, EngineError> {
    ctx.charge_work(items.len().saturating_add(1), path.clone())?;
    let serialized = match host.reflect(HostJsonEvent::StringifyDiagnosticArray { items })? {
        HostJsonReply::OpaqueValue(value) => value,
        _ => {
            return Err(EngineError::new(
                "HOST_JSON_PROTOCOL",
                path.clone(),
                "Host returned the wrong reply for diagnostic stringify",
            ));
        }
    };
    let error_value = host_invoke_value(&serialized, host, ctx, path)?;
    match host.reflect(HostJsonEvent::ConstructErrorCarrier { value: error_value })? {
        HostJsonReply::OpaqueValue(value @ HostOpaqueValue::Opaque { .. }) => Ok(value),
        _ => Err(EngineError::new(
            "HOST_JSON_PROTOCOL",
            path.clone(),
            "Host returned the wrong reply for Error carrier construction",
        )),
    }
}

fn malformed_diagnostic() -> EngineError {
    EngineError::new(
        "CONSTRAINT_DIAGNOSTIC",
        Utf16::default(),
        "Malformed diagnostic",
    )
}

fn host_invoke_value(
    value: &HostOpaqueValue,
    host: &mut dyn HostJsonReflection,
    ctx: &mut Context<'_>,
    path: &Utf16,
) -> Result<HostInvokeValue, EngineError> {
    Ok(match value {
        HostOpaqueValue::Undefined => HostInvokeValue::Undefined,
        HostOpaqueValue::Null => HostInvokeValue::Json(crate::Value::Null),
        HostOpaqueValue::Boolean(value) => HostInvokeValue::Json(crate::Value::Bool(*value)),
        HostOpaqueValue::Number(value) => HostInvokeValue::Json(crate::Value::Number(*value)),
        HostOpaqueValue::String(value) => {
            let chunks = value.units.div_ceil(HOST_STRING_CHUNK_UNITS);
            ctx.charge_work(value.units.saturating_add(chunks), path.clone())?;
            HostInvokeValue::Json(crate::Value::String(read_host_string_value(
                host,
                value.clone(),
                path,
            )?))
        }
        HostOpaqueValue::Opaque { handle, .. } | HostOpaqueValue::BigInt { handle, .. } => {
            HostInvokeValue::Opaque(*handle)
        }
    })
}

fn get_property(
    receiver: &HostOpaqueValue,
    key: &str,
    host: &mut dyn HostJsonReflection,
    ctx: &mut Context<'_>,
    path: &Utf16,
) -> Result<HostOpaqueValue, EngineError> {
    ctx.charge_work(1, path.clone())?;
    let receiver = host_invoke_value(receiver, host, ctx, path)?;
    match host.reflect(HostJsonEvent::GetOpaqueProperty {
        receiver,
        key: HostOpaqueKey::String(key.encode_utf16().collect()),
        semantic_catch: false,
    })? {
        HostJsonReply::OpaqueValue(value) => Ok(value),
        _ => Err(EngineError::new(
            "HOST_JSON_PROTOCOL",
            path.clone(),
            "Host returned the wrong reply for an opaque property read",
        )),
    }
}

fn as_severity_string(
    value: HostOpaqueValue,
    host: &mut dyn HostJsonReflection,
    ctx: &mut Context<'_>,
    path: &Utf16,
) -> Result<Utf16, EngineError> {
    let HostOpaqueValue::String(value) = value else {
        return Err(malformed_diagnostic());
    };
    let chunks = value.units.div_ceil(HOST_STRING_CHUNK_UNITS);
    ctx.charge_work(value.units.saturating_add(chunks), path.clone())?;
    read_host_string_value(host, value, path)
}

fn require_string(value: HostOpaqueValue) -> Result<(), EngineError> {
    if matches!(value, HostOpaqueValue::String(_)) {
        Ok(())
    } else {
        Err(malformed_diagnostic())
    }
}

/// Perform the TypeScript interpreter's diagnostic shape guard in exactly the
/// same short-circuiting order: severity, path, code, message. Only severity
/// is materialized; the remaining fields receive JavaScript `typeof` checks.
/// The original opaque diagnostic is borrowed and remains available to the caller.
pub(crate) fn validate_host_emit_diagnostic(
    diagnostic: &HostOpaqueValue,
    host: &mut dyn HostJsonReflection,
    ctx: &mut Context<'_>,
    path: &Utf16,
) -> Result<HostEmitDiagnosticFields, EngineError> {
    let severity = as_severity_string(
        get_property(diagnostic, "severity", host, ctx, path)?,
        host,
        ctx,
        path,
    )?;
    if severity != Utf16::from("error") && severity != Utf16::from("warning") {
        return Err(malformed_diagnostic());
    }
    require_string(get_property(diagnostic, "path", host, ctx, path)?)?;
    require_string(get_property(diagnostic, "code", host, ctx, path)?)?;
    require_string(get_property(diagnostic, "message", host, ctx, path)?)?;
    Ok(HostEmitDiagnosticFields { severity })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::host_json::HostStringRef;
    use std::collections::HashMap;
    use std::collections::VecDeque;

    #[derive(Default)]
    struct ScriptedHost {
        fields: HashMap<String, HostOpaqueValue>,
        strings: HashMap<u64, Vec<u16>>,
        events: Vec<String>,
        throw_on: Option<String>,
        severity_reads: VecDeque<Result<HostOpaqueValue, EngineError>>,
        stringify_items: Vec<HostDiagnosticArrayItem>,
        stringify_result: Option<Result<HostOpaqueValue, EngineError>>,
        error_carrier_result: Option<Result<HostOpaqueValue, EngineError>>,
        error_value: Option<HostInvokeValue>,
    }

    impl ScriptedHost {
        fn string(_token: u64, text: &str) -> (HostOpaqueValue, Vec<u16>) {
            let units: Vec<u16> = text.encode_utf16().collect();
            let reference = HostStringRef::fake_units(units.clone());
            (HostOpaqueValue::String(reference), units)
        }

        fn set_string(&mut self, key: &str, _token: u64, text: &str) {
            let (value, units) = Self::string(_token, text);
            let HostOpaqueValue::String(reference) = &value else {
                unreachable!()
            };
            let token = reference.token;
            self.fields.insert(key.to_owned(), value);
            self.strings.insert(token, units);
        }

        fn fail(key: &str) -> EngineError {
            EngineError::new(
                "SCRIPTED_HOST_THROW",
                Utf16::default(),
                format!("host threw at {key}"),
            )
        }

        fn string_value(&mut self, text: &str) -> HostOpaqueValue {
            let units: Vec<u16> = text.encode_utf16().collect();
            let reference = HostStringRef::fake_units(units.clone());
            self.strings.insert(reference.token, units);
            HostOpaqueValue::String(reference)
        }
    }

    impl HostJsonReflection for ScriptedHost {
        fn reflect(&mut self, event: HostJsonEvent) -> Result<HostJsonReply, EngineError> {
            match event {
                HostJsonEvent::GetOpaqueProperty {
                    receiver: HostInvokeValue::Opaque(1),
                    key: HostOpaqueKey::String(units),
                    semantic_catch: false,
                } => {
                    let key = String::from_utf16(&units).unwrap();
                    self.events.push(format!("get:{key}"));
                    if key == "severity" {
                        if let Some(value) = self.severity_reads.pop_front() {
                            return value.map(HostJsonReply::OpaqueValue);
                        }
                    }
                    if self.throw_on.as_deref() == Some(&key) {
                        return Err(Self::fail(&key));
                    }
                    self.fields
                        .get(&key)
                        .cloned()
                        .map(HostJsonReply::OpaqueValue)
                        .ok_or_else(|| {
                            EngineError::new("SCRIPTED_HOST", Utf16::default(), "missing field")
                        })
                }
                HostJsonEvent::ReadUtf16Chunk {
                    token,
                    offset,
                    max_units,
                } => {
                    self.events.push(format!("string:{token}:{offset}"));
                    let units = self.strings.get(&token).ok_or_else(|| {
                        EngineError::new("SCRIPTED_HOST", Utf16::default(), "missing string")
                    })?;
                    let end = offset.saturating_add(max_units).min(units.len());
                    Ok(HostJsonReply::Utf16Chunk {
                        offset,
                        units: units[offset..end].to_vec(),
                    })
                }
                HostJsonEvent::StringifyDiagnosticArray { items } => {
                    self.events.push("stringify-array".to_owned());
                    self.stringify_items = items;
                    self.stringify_result
                        .take()
                        .unwrap_or_else(|| Ok(self.string_value("json")))
                        .map(HostJsonReply::OpaqueValue)
                }
                HostJsonEvent::ConstructErrorCarrier { value } => {
                    self.events.push("construct-error".to_owned());
                    self.error_value = Some(value);
                    self.error_carrier_result
                        .take()
                        .unwrap_or(Ok(HostOpaqueValue::Opaque {
                            handle: 99,
                            opaque_type: crate::host_json::HostOpaqueType::Object,
                        }))
                        .map(HostJsonReply::OpaqueValue)
                }
                _ => Err(EngineError::new(
                    "SCRIPTED_HOST",
                    Utf16::default(),
                    "unexpected host event",
                )),
            }
        }

        fn release_descriptor_snapshot(&mut self, _token: u64) {}
    }

    fn valid_host() -> ScriptedHost {
        let mut host = ScriptedHost::default();
        host.set_string("severity", 11, "warning");
        host.set_string("path", 12, "/x");
        host.set_string("code", 13, "CUSTOM");
        host.set_string("message", 14, "hello");
        host
    }

    fn diagnostic() -> HostOpaqueValue {
        HostOpaqueValue::Opaque {
            handle: 1,
            opaque_type: crate::host_json::HostOpaqueType::Object,
        }
    }

    fn keys(host: &ScriptedHost) -> Vec<String> {
        host.events
            .iter()
            .filter_map(|event| event.strip_prefix("get:").map(str::to_owned))
            .collect()
    }

    #[test]
    fn emit_shape_reads_exact_order_retains_original_and_charges_context() {
        let original = diagnostic();
        let mut host = valid_host();
        let mut ctx = Context::ordinary();
        let fields =
            validate_host_emit_diagnostic(&original, &mut host, &mut ctx, &Utf16::from("/diag"))
                .unwrap();
        assert_eq!(fields.severity, Utf16::from("warning"));
        assert_eq!(keys(&host), ["severity", "path", "code", "message"]);
        let HostOpaqueValue::String(severity) = &host.fields["severity"] else {
            unreachable!()
        };
        assert_eq!(
            host.events,
            [
                "get:severity",
                &format!("string:{}:0", severity.token),
                "get:path",
                "get:code",
                "get:message",
            ]
        );
        assert_eq!(ctx.charged_work(), 12);
        assert_eq!(original, diagnostic());
    }

    #[test]
    fn emit_short_circuits_on_severity_and_first_invalid_field() {
        let mut host = valid_host();
        host.set_string("severity", 21, "fatal");
        let mut ctx = Context::ordinary();
        let error =
            validate_host_emit_diagnostic(&diagnostic(), &mut host, &mut ctx, &Utf16::default())
                .unwrap_err();
        assert_eq!(error.code, "CONSTRAINT_DIAGNOSTIC");
        assert_eq!(keys(&host), ["severity"]);

        for (invalid, expected) in [
            ("path", vec!["severity", "path"]),
            ("code", vec!["severity", "path", "code"]),
            ("message", vec!["severity", "path", "code", "message"]),
        ] {
            let mut host = valid_host();
            host.fields
                .insert(invalid.to_owned(), HostOpaqueValue::Boolean(true));
            let error = validate_host_emit_diagnostic(
                &diagnostic(),
                &mut host,
                &mut Context::ordinary(),
                &Utf16::default(),
            )
            .unwrap_err();
            assert_eq!(error.code, "CONSTRAINT_DIAGNOSTIC");
            assert_eq!(keys(&host), expected);
        }
    }

    #[test]
    fn host_property_throw_propagates_and_stops_later_reads() {
        let mut host = valid_host();
        host.throw_on = Some("code".to_owned());
        let error = validate_host_emit_diagnostic(
            &diagnostic(),
            &mut host,
            &mut Context::ordinary(),
            &Utf16::default(),
        )
        .unwrap_err();
        assert_eq!(error, ScriptedHost::fail("code"));
        assert_eq!(keys(&host), ["severity", "path", "code"]);
    }

    fn queued_string(host: &mut ScriptedHost, text: &str) -> HostOpaqueValue {
        let (value, units) = ScriptedHost::string(0, text);
        let HostOpaqueValue::String(reference) = &value else {
            unreachable!()
        };
        host.strings.insert(reference.token, units);
        value
    }

    fn callback_entry() -> OrderedSelectionDiagnostic {
        OrderedSelectionDiagnostic {
            severity: SelectionDiagnosticSeverity::Callback(diagnostic()),
        }
    }

    #[test]
    fn validity_pass_reads_mixed_diagnostics_in_order_and_stops_at_first_error() {
        let mut host = ScriptedHost::default();
        let warning = queued_string(&mut host, "warning");
        let error = queued_string(&mut host, "error");
        host.severity_reads.push_back(Ok(warning));
        host.severity_reads.push_back(Ok(error));
        host.throw_on = Some("severity".to_owned());
        let diagnostics = [
            OrderedSelectionDiagnostic {
                severity: SelectionDiagnosticSeverity::Static(Utf16::from("warning")),
            },
            callback_entry(),
            callback_entry(),
            callback_entry(),
        ];
        let mut ctx = Context::ordinary();
        assert!(
            diagnostics_have_error(
                &diagnostics,
                &mut host,
                &mut ctx,
                &Utf16::from("/diagnostics"),
            )
            .unwrap()
        );
        assert_eq!(keys(&host), ["severity", "severity"]);
        assert_eq!(ctx.charged_work(), 16);
    }

    #[test]
    fn validity_pass_propagates_callback_severity_getter_throw_identity() {
        let expected = ScriptedHost::fail("severity");
        let mut host = ScriptedHost::default();
        let warning = queued_string(&mut host, "warning");
        host.severity_reads.push_back(Ok(warning));
        host.severity_reads.push_back(Err(expected.clone()));
        let diagnostics = [callback_entry(), callback_entry()];
        let error = diagnostics_have_error(
            &diagnostics,
            &mut host,
            &mut Context::ordinary(),
            &Utf16::default(),
        )
        .unwrap_err();
        assert_eq!(error, expected);
        assert_eq!(keys(&host), ["severity", "severity"]);
    }

    #[test]
    fn refusal_serialization_keeps_mixed_item_order_and_returns_error_carrier() {
        let static_diagnostic = HostDiagnosticArrayItem::Static(crate::Value::Object(vec![
            (
                Utf16::from("code"),
                crate::Value::String(Utf16::from("STATIC")),
            ),
            (
                Utf16::from("severity"),
                crate::Value::String(Utf16::from("warning")),
            ),
        ]));
        let items = vec![static_diagnostic, HostDiagnosticArrayItem::Opaque(88)];
        let mut host = ScriptedHost::default();
        host.stringify_result = Some(Ok(host.string_value("serialized")));
        let mut ctx = Context::ordinary();
        let carrier = stringify_diagnostic_array(
            items.clone(),
            &mut host,
            &mut ctx,
            &Utf16::from("/diagnostics"),
        )
        .unwrap();
        assert_eq!(
            carrier,
            HostOpaqueValue::Opaque {
                handle: 99,
                opaque_type: crate::host_json::HostOpaqueType::Object
            }
        );
        assert_eq!(host.stringify_items, items);
        let stringify_index = host
            .events
            .iter()
            .position(|event| event == "stringify-array")
            .unwrap();
        let construction_index = host
            .events
            .iter()
            .position(|event| event == "construct-error")
            .unwrap();
        assert!(stringify_index < construction_index);
        assert_eq!(
            host.error_value,
            Some(HostInvokeValue::Json(crate::Value::String(Utf16::from(
                "serialized"
            ))))
        );
        assert_eq!(ctx.charged_work(), 14);
    }

    #[test]
    fn refusal_serialization_preserves_native_throw_identity_at_both_host_stages() {
        for stage in ["stringify", "construct-error"] {
            let expected = ScriptedHost::fail(stage);
            let mut host = ScriptedHost::default();
            if stage == "stringify" {
                host.stringify_result = Some(Err(expected.clone()));
            } else {
                host.stringify_result = Some(Ok(host.string_value("object-result")));
                host.error_carrier_result = Some(Err(expected.clone()));
            }
            let error = stringify_diagnostic_array(
                vec![HostDiagnosticArrayItem::Opaque(88)],
                &mut host,
                &mut Context::ordinary(),
                &Utf16::default(),
            )
            .unwrap_err();
            assert_eq!(error, expected);
        }
    }
}
