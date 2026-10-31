// SPDX-License-Identifier: MIT OR Apache-2.0
//! Ordered mixed diagnostics used by Selection host materialization.
//!
//! Rust diagnostics are emitted as static ordinary-value descriptions. A
//! callback diagnostic remains an invocation-local opaque handle so unknown
//! fields, accessors, and host JSON behavior survive until the relevant stage.

use crate::{
    host_diagnostic::{
        diagnostics_have_error, stringify_diagnostic_array, OrderedSelectionDiagnostic,
        SelectionDiagnosticSeverity,
    },
    host_json::{HostDiagnosticArrayItem, HostJsonReflection, HostOpaqueType, HostOpaqueValue, HostStringRef},
    Diagnostic, EngineError, Severity, Utf16, Validation, Value,
};

/// One diagnostic in predecessor emission order.
#[derive(Clone, Debug, PartialEq)]
pub(crate) enum SelectionDiagnosticEntry {
    Static(Diagnostic),
    Callback {
        original: HostOpaqueValue,
        severity: Utf16,
    },
    HostStructure {
        code: Utf16,
        path: Utf16,
        message: HostStringRef,
        severity: Severity,
    },
}

/// The post-constraint diagnostic packet. `complete` is kept independent from
/// validity: the predecessor computes completeness from the diagnostic count
/// and validity from a later ordered severity pass.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct SelectionDiagnosticMaterialization {
    pub(crate) complete: bool,
    /// Existing Engine validation can include structural failures that are
    /// not represented by a severity diagnostic. Preserve that static result.
    pub(crate) static_valid: Option<bool>,
    pub(crate) entries: Vec<SelectionDiagnosticEntry>,
}

impl SelectionDiagnosticMaterialization {
    /// Materialize successful Selection validation while resolving only the
    /// host-owned primitive strings retained by the structure stage.
    pub(crate) fn into_host_source_value(
        &self,
        host: &mut dyn HostJsonReflection,
        ctx: &mut crate::Context<'_>,
    ) -> Result<Value, EngineError> {
        let valid = self.static_is_valid()?;
        let mut diagnostics = Vec::with_capacity(self.entries.len());
        for (index, entry) in self.entries.iter().enumerate() {
            let (code, path, message, severity) = match entry {
                SelectionDiagnosticEntry::Static(diagnostic) => (
                    diagnostic.code.clone(), diagnostic.path.clone(), diagnostic.message.clone(),
                    match diagnostic.severity { Severity::Error => "error", Severity::Warning => "warning" },
                ),
                SelectionDiagnosticEntry::HostStructure { code, path, message, severity } => {
                    let chunks = message.units.div_ceil(8192);
                    ctx.charge_text(message.units, path.clone())?;
                    ctx.charge_work(chunks, path.clone())?;
                    let message = crate::host_json::read_host_string_value(host, message.clone(), path)?;
                    (code.clone(), path.clone(), message, match severity { Severity::Error => "error", Severity::Warning => "warning" })
                }
                SelectionDiagnosticEntry::Callback { original, .. } => {
                    let diagnostic_path = Utf16::from(format!("/sourceValidation/diagnostics/{index}"));
                    let value = crate::host_json::materialize_semantic_value(
                        original.clone(), host, ctx, &diagnostic_path, 0,
                    )?;
                    diagnostics.push(value);
                    continue;
                }
            };
            diagnostics.push(Value::Object(vec![
                (Utf16::from("code"), Value::String(code)),
                (Utf16::from("path"), Value::String(path)),
                (Utf16::from("message"), Value::String(message)),
                (Utf16::from("severity"), Value::String(Utf16::from(severity))),
            ]));
        }
        Ok(Value::Object(vec![
            (Utf16::from("valid"), Value::Bool(valid)),
            (Utf16::from("complete"), Value::Bool(self.complete)),
            (Utf16::from("diagnostics"), Value::Array(diagnostics)),
        ]))
    }

    pub(crate) fn from_static_validation(validation: Validation) -> Self {
        let static_valid = Some(validation.valid);
        Self {
            complete: validation.complete,
            static_valid,
            entries: validation
                .diagnostics
                .into_iter()
                .map(SelectionDiagnosticEntry::Static)
                .collect(),
        }
    }

    /// Compute static validation validity independently from completeness.
    pub(crate) fn static_is_valid(&self) -> Result<bool, EngineError> {
        if let Some(valid) = self.static_valid {
            return Ok(valid);
        }
        for entry in &self.entries {
            match entry {
                SelectionDiagnosticEntry::Static(diagnostic)
                    if diagnostic.severity == Severity::Error =>
                {
                    return Ok(false)
                }
                SelectionDiagnosticEntry::Static(_) => {}
                SelectionDiagnosticEntry::Callback { severity, .. } if severity == &Utf16::from("error") => return Ok(false),
                SelectionDiagnosticEntry::Callback { .. } => {}
                SelectionDiagnosticEntry::HostStructure { severity, .. } => {
                    if *severity == Severity::Error { return Ok(false); }
                }
            }
        }
        Ok(true)
    }

    /// Consume a static packet into the public sourceValidation value. Opaque
    /// callback entries remain a strict stop until a host array materializer
    /// can place them into the successful Selection result without JSON
    /// normalization.
    pub(crate) fn into_static_source_value(self) -> Result<Value, EngineError> {
        let valid = self.static_is_valid()?;
        let complete = self.complete;
        let diagnostics = self.into_static_diagnostics()?;
        Ok(Value::Object(vec![
            (Utf16::from("valid"), Value::Bool(valid)),
            (Utf16::from("complete"), Value::Bool(complete)),
            (Utf16::from("diagnostics"), Value::Array(diagnostics)),
        ]))
    }

    pub(crate) fn into_static_diagnostics(self) -> Result<Vec<Value>, EngineError> {
        self.entries
            .into_iter()
            .map(|entry| match entry {
                SelectionDiagnosticEntry::Static(diagnostic) => {
                    let severity = match diagnostic.severity {
                        Severity::Error => "error",
                        Severity::Warning => "warning",
                    };
                    Ok(Value::Object(vec![
                        (Utf16::from("code"), Value::String(diagnostic.code)),
                        (Utf16::from("path"), Value::String(diagnostic.path)),
                        (Utf16::from("message"), Value::String(diagnostic.message)),
                        (
                            Utf16::from("severity"),
                            Value::String(Utf16::from(severity)),
                        ),
                    ]))
                }
                SelectionDiagnosticEntry::Callback { .. } => Err(EngineError::new(
                    "HOST_JSON_PROTOCOL",
                    Utf16::default(),
                    "Static Selection cannot materialize an opaque callback diagnostic",
                )),
                SelectionDiagnosticEntry::HostStructure { .. } => Err(EngineError::new(
                    "HOST_JSON_UNSUPPORTED",
                    Utf16::default(),
                    "Static Selection cannot materialize a host structure diagnostic",
                )),
            })
            .collect()
    }

    /// Perform the later `some(d => d.severity === "error")` pass over this
    /// exact ordered mixture. Callback entries trigger a fresh host property
    /// read; the first error short-circuits.
    pub(crate) fn is_valid(
        &self,
        host: &mut dyn HostJsonReflection,
        ctx: &mut crate::Context<'_>,
        path: &Utf16,
    ) -> Result<bool, EngineError> {
        if let Some(valid) = self.static_valid {
            return Ok(valid);
        }
        let ordered: Vec<_> = self
            .entries
            .iter()
            .map(|entry| match entry {
                SelectionDiagnosticEntry::Static(diagnostic) => OrderedSelectionDiagnostic {
                    severity: SelectionDiagnosticSeverity::Static(Utf16::from(
                        match diagnostic.severity {
                            Severity::Error => "error",
                            Severity::Warning => "warning",
                        },
                    )),
                },
                SelectionDiagnosticEntry::Callback { original, .. } => OrderedSelectionDiagnostic {
                    severity: SelectionDiagnosticSeverity::Callback(original.clone()),
                },
                SelectionDiagnosticEntry::HostStructure { severity, .. } => OrderedSelectionDiagnostic {
                    severity: SelectionDiagnosticSeverity::Static(Utf16::from(match severity {
                        Severity::Error => "error", Severity::Warning => "warning",
                    })),
                },
            })
            .collect();
        Ok(!diagnostics_have_error(&ordered, host, ctx, path)?)
    }

    /// Convert the ordered entries for host JSON materialization. Callback
    /// objects/functions stay opaque; no unknown members are copied or lost.
    pub(crate) fn host_array_items(
        &self,
        ctx: &mut crate::Context<'_>,
        path: &Utf16,
    ) -> Result<Vec<HostDiagnosticArrayItem>, EngineError> {
        self.entries
            .iter()
            .map(|entry| {
                ctx.charge_work(1, path.clone())?;
                match entry {
                    SelectionDiagnosticEntry::Static(diagnostic) => {
                        let severity = match diagnostic.severity {
                            Severity::Error => "error",
                            Severity::Warning => "warning",
                        };
                        ctx.charge_work(
                            diagnostic
                                .code
                                .len()
                                .saturating_add(diagnostic.path.len())
                                .saturating_add(diagnostic.message.len())
                                .saturating_add(severity.len()),
                            path.clone(),
                        )?;
                        Ok(HostDiagnosticArrayItem::Static(Value::Object(vec![
                            (Utf16::from("code"), Value::String(diagnostic.code.clone())),
                            (Utf16::from("path"), Value::String(diagnostic.path.clone())),
                            (
                                Utf16::from("message"),
                                Value::String(diagnostic.message.clone()),
                            ),
                            (
                                Utf16::from("severity"),
                                Value::String(Utf16::from(severity)),
                            ),
                        ])))
                    }
                    SelectionDiagnosticEntry::Callback { original, .. } => match original {
                        HostOpaqueValue::Opaque {
                            handle,
                            opaque_type: HostOpaqueType::Object | HostOpaqueType::Function,
                        } => Ok(HostDiagnosticArrayItem::Opaque(*handle)),
                        _ => Err(EngineError::new(
                            "HOST_JSON_PROTOCOL",
                            Utf16::default(),
                            "Validated callback diagnostic lost its opaque object handle",
                        )),
                    },
                    SelectionDiagnosticEntry::HostStructure { code, path: diagnostic_path, message, severity } => {
                        ctx.charge_work(code.len().saturating_add(diagnostic_path.len()).saturating_add(8).saturating_add(message.units), path.clone())?;
                        Ok(HostDiagnosticArrayItem::Structure {
                            code: code.clone(), path: diagnostic_path.clone(), message: message.clone(),
                            severity: Utf16::from(match severity { Severity::Error => "error", Severity::Warning => "warning" }),
                        })
                    }
                }
            })
            .collect()
    }

    /// Run the Rust-owned invalid-source branch through ordered severity
    /// validation, live host JSON serialization, and native Error-carrier
    /// construction. The caller still owns final `UmfError` construction and
    /// exposure; this does not create a complete Selection route.
    pub(crate) fn refusal_carrier(
        &self,
        host: &mut dyn HostJsonReflection,
        ctx: &mut crate::Context<'_>,
        path: &Utf16,
    ) -> Result<Option<HostOpaqueValue>, EngineError> {
        if self.static_is_valid()? {
            return Ok(None);
        }
        stringify_diagnostic_array(self.host_array_items(ctx, path)?, host, ctx, path).map(Some)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct NoHost;
    impl HostJsonReflection for NoHost {
        fn reflect(
            &mut self,
            _event: crate::host_json::HostJsonEvent,
        ) -> Result<crate::host_json::HostJsonReply, EngineError> {
            panic!("static diagnostics must not call the host")
        }
        fn release_descriptor_snapshot(&mut self, _token: u64) {}
    }

    #[derive(Default)]
    struct RefusalHost {
        items: Option<Vec<HostDiagnosticArrayItem>>,
        events: Vec<&'static str>,
    }
    impl HostJsonReflection for RefusalHost {
        fn reflect(
            &mut self,
            event: crate::host_json::HostJsonEvent,
        ) -> Result<crate::host_json::HostJsonReply, EngineError> {
            match event {
                crate::host_json::HostJsonEvent::StringifyDiagnosticArray { items } => {
                    self.events.push("stringify");
                    self.items = Some(items);
                    Ok(crate::host_json::HostJsonReply::OpaqueValue(
                        HostOpaqueValue::Undefined,
                    ))
                }
                crate::host_json::HostJsonEvent::ConstructErrorCarrier {
                    value: crate::host_json::HostInvokeValue::Undefined,
                } => {
                    self.events.push("construct-error");
                    Ok(crate::host_json::HostJsonReply::OpaqueValue(
                        HostOpaqueValue::Opaque {
                            handle: 91,
                            opaque_type: HostOpaqueType::Object,
                        },
                    ))
                }
                other => panic!("unexpected host event: {other:?}"),
            }
        }
        fn release_descriptor_snapshot(&mut self, _token: u64) {}
    }

    fn static_diagnostic(code: &str, severity: Severity) -> SelectionDiagnosticEntry {
        SelectionDiagnosticEntry::Static(Diagnostic {
            code: Utf16::from(code),
            path: Utf16::from("/p"),
            python_source_path: false,
            message: Utf16::from("message"),
            severity,
            python_text_origin: None,
        })
    }

    #[test]
    fn mixed_materialization_preserves_order_and_callback_identity() {
        let entries = vec![
            static_diagnostic("STATIC_FIRST", Severity::Warning),
            SelectionDiagnosticEntry::Callback {
                original: HostOpaqueValue::Opaque {
                    handle: 77,
                    opaque_type: HostOpaqueType::Object,
                },
                severity: Utf16::from("warning"),
            },
            static_diagnostic("STATIC_LAST", Severity::Error),
        ];
        let packet = SelectionDiagnosticMaterialization {
            complete: false,
            static_valid: None,
            entries,
        };
        let items = packet
            .host_array_items(&mut crate::Context::ordinary(), &Utf16::default())
            .unwrap();
        assert_eq!(items.len(), 3);
        let HostDiagnosticArrayItem::Static(first) = &items[0] else {
            panic!("first diagnostic must remain static")
        };
        let Value::Object(first_fields) = first else {
            panic!("static diagnostic object")
        };
        assert_eq!(first_fields[0].0, Utf16::from("code"));
        assert_eq!(first_fields[1].0, Utf16::from("path"));
        assert_eq!(first_fields[2].0, Utf16::from("message"));
        assert_eq!(first_fields[3].0, Utf16::from("severity"));
        assert_eq!(items[1], HostDiagnosticArrayItem::Opaque(77));
        let HostDiagnosticArrayItem::Static(last) = &items[2] else {
            panic!("last diagnostic must remain static")
        };
        assert!(
            matches!(last, Value::Object(fields) if fields[0].1 == Value::String(Utf16::from("STATIC_LAST")))
        );
        assert!(!packet.complete);
    }

    #[test]
    fn host_structure_message_stays_tokenized_in_mixed_refusal_items() {
        let packet = SelectionDiagnosticMaterialization {
            complete: false,
            static_valid: None,
            entries: vec![
                static_diagnostic("BEFORE", Severity::Warning),
                SelectionDiagnosticEntry::HostStructure {
                    code: Utf16::from("EXTENSION_STRUCTURE"),
                    path: Utf16::from("/extensions/future/bad"),
                    message: HostStringRef::fake("host message"),
                    severity: Severity::Error,
                },
            ],
        };
        let items = packet.host_array_items(&mut crate::Context::ordinary(), &Utf16::default()).unwrap();
        assert!(matches!(
            &items[1],
            HostDiagnosticArrayItem::Structure { code, path, message, severity }
                if code == &Utf16::from("EXTENSION_STRUCTURE")
                    && path == &Utf16::from("/extensions/future/bad")
                    && message.units == "host message".encode_utf16().count()
                    && severity == &Utf16::from("error")
        ));
        assert!(!packet.static_is_valid().unwrap());
    }

    #[test]
    fn callback_diagnostic_materialization_rejects_lost_handles() {
        let packet = SelectionDiagnosticMaterialization {
            complete: true,
            static_valid: None,
            entries: vec![SelectionDiagnosticEntry::Callback {
                original: HostOpaqueValue::String(crate::host_json::HostStringRef::fake("bad")),
                severity: Utf16::from("warning"),
            }],
        };
        let error = packet
            .host_array_items(&mut crate::Context::ordinary(), &Utf16::default())
            .unwrap_err();
        assert_eq!(error.code, "HOST_JSON_PROTOCOL");
        assert_eq!(
            error.message,
            Utf16::from("Validated callback diagnostic lost its opaque object handle")
        );
    }

    #[test]
    fn completeness_is_not_derived_from_validity() {
        let mut host = NoHost;
        let mut ctx = crate::Context::ordinary();
        let warning = SelectionDiagnosticMaterialization {
            complete: false,
            static_valid: None,
            entries: vec![static_diagnostic("WARNING", Severity::Warning)],
        };
        assert!(warning
            .is_valid(&mut host, &mut ctx, &Utf16::default())
            .unwrap());
        assert!(!warning.complete);

        let error = SelectionDiagnosticMaterialization {
            complete: true,
            static_valid: None,
            entries: vec![static_diagnostic("ERROR", Severity::Error)],
        };
        assert!(!error
            .is_valid(&mut host, &mut ctx, &Utf16::default())
            .unwrap());
        assert!(error.complete);
    }

    #[test]
    fn static_packet_preserves_engine_invalidity_without_error_severity() {
        let validation = Validation {
            valid: false,
            complete: true,
            diagnostics: vec![Diagnostic {
                code: Utf16::from("STRUCTURE_WARNING"),
                path: Utf16::from("/structure"),
                python_source_path: false,
                message: Utf16::from("structural failure emitted as warning"),
                severity: Severity::Warning,
                python_text_origin: None,
            }],
        };
        let packet = SelectionDiagnosticMaterialization::from_static_validation(validation);
        assert!(!packet.static_is_valid().unwrap());
        assert!(packet.complete);
        assert!(matches!(
            packet.into_static_source_value().unwrap(),
            Value::Object(fields)
                if fields[0].1 == Value::Bool(false)
                    && fields[1].1 == Value::Bool(true)
        ));
    }

    #[test]
    fn invalid_source_runs_ordered_refusal_stages_and_valid_source_stops_early() {
        let mut ctx = crate::Context::ordinary();
        let valid = SelectionDiagnosticMaterialization {
            complete: false,
            static_valid: None,
            entries: vec![static_diagnostic("WARNING", Severity::Warning)],
        };
        let mut untouched = RefusalHost::default();
        assert!(valid
            .refusal_carrier(&mut untouched, &mut ctx, &Utf16::from("/diagnostics"))
            .unwrap()
            .is_none());
        assert!(untouched.events.is_empty());

        let invalid = SelectionDiagnosticMaterialization {
            complete: true,
            static_valid: None,
            entries: vec![static_diagnostic("ERROR", Severity::Error)],
        };
        let mut host = RefusalHost::default();
        assert_eq!(
            invalid
                .refusal_carrier(&mut host, &mut ctx, &Utf16::from("/diagnostics"))
                .unwrap(),
            Some(HostOpaqueValue::Opaque {
                handle: 91,
                opaque_type: HostOpaqueType::Object,
            })
        );
        assert_eq!(host.events, ["stringify", "construct-error"]);
        assert!(matches!(
            host.items.as_deref(),
            Some([HostDiagnosticArrayItem::Static(_)])
        ));
    }
}
