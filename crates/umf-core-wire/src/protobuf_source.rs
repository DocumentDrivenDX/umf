// SPDX-License-Identifier: MIT OR Apache-2.0
//! Staged host-callback packet for explicit Protobuf source import and export.

use umf_core::{
    Context, EngineError, Utf16, Value,
    context::TransportUsage,
    host_json::{HostHandle, HostJsonReflection, copy_host_json},
    protobuf_source,
};

pub const PROFILE: &str = "umf-r8-protobuf-source/0.1.0";

pub struct Response {
    pub wire_envelope: String,
    pub binary: Vec<u8>,
}

enum State {
    Fresh,
    ImportPrepared(protobuf_source::PreparedProtobufSourceImport),
    ImportDocumentReady {
        prepared: protobuf_source::PreparedProtobufSourceImport,
        document: Value,
    },
    ExportPrepared(protobuf_source::PreparedProtobufSourceExport),
    ExportResultAdmitted {
        prepared: protobuf_source::PreparedProtobufSourceExport,
        result: Value,
    },
    Finished,
    Poisoned,
}

/// One async host callback operation. Its Rust-owned prepared state and
/// transport counters survive the host's await between synchronous phases.
pub struct Session {
    usage: TransportUsage,
    state: State,
}

impl Default for Session {
    fn default() -> Self {
        Self::new()
    }
}

impl Session {
    pub fn new() -> Self {
        Self {
            usage: TransportUsage::default(),
            state: State::Fresh,
        }
    }

    pub fn prepare_import(
        &mut self,
        request_wire: &str,
        id: &str,
        control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
    ) -> Response {
        if !matches!(self.state, State::Fresh) {
            return self.fail_state();
        }
        let usage = &mut self.usage;
        let prepared = run_with_usage(usage, control, |context| {
            let request = decode(request_wire, context)?;
            let prepared = protobuf_source::prepare_source_import(&request, id, context)?;
            let callback_request = encode(prepared.compiler_request(), context)?;
            Ok((callback_request, Vec::new(), prepared))
        });
        match prepared {
            Ok((wire, binary, state)) => {
                self.state = State::ImportPrepared(state);
                Response {
                    wire_envelope: super::result_envelope(Ok(wire)),
                    binary,
                }
            }
            Err(error) => {
                self.state = State::Poisoned;
                Response {
                    wire_envelope: super::result_envelope(Err(error)),
                    binary: Vec::new(),
                }
            }
        }
    }

    /// Admit an opaque public request with the predecessor-compatible host
    /// reflection adapter before exposing the isolated callback request.
    pub fn prepare_import_host(
        &mut self,
        request_handle: HostHandle,
        host: &mut dyn HostJsonReflection,
        control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
    ) -> Response {
        if !matches!(self.state, State::Fresh) {
            return self.fail_state();
        }
        let result = run_with_usage(&mut self.usage, control, |context| {
            let request = copy_host_json(request_handle, host, context)?;
            let prepared = protobuf_source::prepare_source_import_request(&request, context)?;
            let callback = encode(prepared.compiler_request(), context)?;
            Ok((callback, Vec::new(), prepared))
        });
        match result {
            Ok((wire, binary, prepared)) => {
                self.state = State::ImportPrepared(prepared);
                Response {
                    wire_envelope: super::result_envelope(Ok(wire)),
                    binary,
                }
            }
            Err(error) => {
                self.state = State::Poisoned;
                Response {
                    wire_envelope: super::result_envelope(Err(error)),
                    binary: Vec::new(),
                }
            }
        }
    }

    pub fn finish_import(
        &mut self,
        compiler: &str,
        descriptor_set: &[u8],
        control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
    ) -> Response {
        let State::ImportPrepared(prepared) = std::mem::replace(&mut self.state, State::Poisoned)
        else {
            return self.fail_state();
        };
        let result = run_with_usage(&mut self.usage, control, |context| {
            let document = protobuf_source::finish_source_import_bytes(
                prepared,
                &Utf16::from(compiler),
                descriptor_set,
                context,
            )?;
            let wire = encode(&document, context)?;
            Ok((wire, Vec::new()))
        });
        self.finish_response(result)
    }

    pub fn finish_import_with_id(
        &mut self,
        compiler: &str,
        descriptor_set: &[u8],
        id: &str,
        control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
    ) -> Response {
        let begun = self.begin_import_descriptor(descriptor_set, id, control);
        if is_error_response(&begun.wire_envelope) {
            return begun;
        }
        self.finish_import_archive(compiler, control)
    }

    pub fn begin_import_descriptor(
        &mut self,
        descriptor_set: &[u8],
        id: &str,
        control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
    ) -> Response {
        let State::ImportPrepared(prepared) = std::mem::replace(&mut self.state, State::Poisoned)
        else {
            return self.fail_state();
        };
        let result = run_with_usage(&mut self.usage, control, |context| {
            let document = protobuf_source::begin_source_import_descriptor(
                descriptor_set,
                &Utf16::from(id),
                context,
            )?;
            let wire = encode(&Value::Null, context)?;
            Ok((wire, Vec::new(), prepared, document))
        });
        match result {
            Ok((wire, binary, prepared, document)) => {
                self.state = State::ImportDocumentReady { prepared, document };
                Response {
                    wire_envelope: super::result_envelope(Ok(wire)),
                    binary,
                }
            }
            Err(error) => {
                self.state = State::Poisoned;
                Response {
                    wire_envelope: super::result_envelope(Err(error)),
                    binary: Vec::new(),
                }
            }
        }
    }

    pub fn finish_import_archive(
        &mut self,
        compiler: &str,
        control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
    ) -> Response {
        self.finish_import_archive_value(Value::String(Utf16::from(compiler)), control)
    }

    pub fn finish_import_archive_value(
        &mut self,
        compiler: Value,
        control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
    ) -> Response {
        let State::ImportDocumentReady { prepared, document } =
            std::mem::replace(&mut self.state, State::Poisoned)
        else {
            return self.fail_state();
        };
        let result = run_with_usage(&mut self.usage, control, |context| {
            let value = protobuf_source::finish_source_import_document_value(
                prepared, document, compiler, context,
            )?;
            let wire = encode(&value, context)?;
            Ok((wire, Vec::new()))
        });
        self.finish_response(result)
    }

    pub fn prepare_export(
        &mut self,
        document_wire: &str,
        control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
    ) -> Response {
        if !matches!(self.state, State::Fresh) {
            return self.fail_state();
        }
        let prepared = run_with_usage(&mut self.usage, control, |context| {
            let document = decode(document_wire, context)?;
            let prepared = protobuf_source::prepare_source_export(&document, context)?;
            context.charge_work(prepared.descriptor_set().len(), Utf16::default())?;
            let bytes = prepared.descriptor_set().to_vec();
            Ok((String::new(), bytes, prepared))
        });
        match prepared {
            Ok((_wire, binary, state)) => {
                self.state = State::ExportPrepared(state);
                Response {
                    wire_envelope: super::result_envelope(Ok(String::new())),
                    binary,
                }
            }
            Err(error) => {
                self.state = State::Poisoned;
                Response {
                    wire_envelope: super::result_envelope(Err(error)),
                    binary: Vec::new(),
                }
            }
        }
    }

    /// Prepare export from an opaque document using Rust-driven host
    /// inspection and the predecessor's later ordinary property reads.
    pub fn prepare_export_host(
        &mut self,
        document_handle: HostHandle,
        host: &mut dyn HostJsonReflection,
        control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
    ) -> Response {
        if !matches!(self.state, State::Fresh) {
            return self.fail_state();
        }
        let prepared = run_with_usage(&mut self.usage, control, |context| {
            let prepared =
                protobuf_source::prepare_source_export_host(document_handle, host, context)?;
            context.charge_work(prepared.descriptor_set().len(), Utf16::default())?;
            let bytes = prepared.descriptor_set().to_vec();
            let wire = encode(&Value::Null, context)?;
            Ok((wire, bytes, prepared))
        });
        match prepared {
            Ok((wire, binary, prepared)) => {
                self.state = State::ExportPrepared(prepared);
                Response {
                    wire_envelope: super::result_envelope(Ok(wire)),
                    binary,
                }
            }
            Err(error) => {
                self.state = State::Poisoned;
                Response {
                    wire_envelope: super::result_envelope(Err(error)),
                    binary: Vec::new(),
                }
            }
        }
    }

    pub fn admit_emitter_result(
        &mut self,
        result_wire: &str,
        control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
    ) -> Response {
        let State::ExportPrepared(prepared) = std::mem::replace(&mut self.state, State::Poisoned)
        else {
            return self.fail_state();
        };
        let result = run_with_usage(&mut self.usage, control, |context| {
            let emitter_result = decode(result_wire, context)?;
            let admitted = protobuf_source::admit_source_export_result(&emitter_result, context)?;
            let wire = encode(&Value::Null, context)?;
            Ok((wire, Vec::new(), admitted))
        });
        match result {
            Ok((wire, binary, admitted)) => {
                self.state = State::ExportResultAdmitted {
                    prepared,
                    result: admitted,
                };
                Response {
                    wire_envelope: super::result_envelope(Ok(wire)),
                    binary,
                }
            }
            Err(error) => {
                self.state = State::Poisoned;
                Response {
                    wire_envelope: super::result_envelope(Err(error)),
                    binary: Vec::new(),
                }
            }
        }
    }

    /// Admit the callback result through host JSON reflection before any
    /// post-callback document access occurs.
    pub fn admit_emitter_result_host(
        &mut self,
        result_handle: HostHandle,
        host: &mut dyn HostJsonReflection,
        control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
    ) -> Response {
        let State::ExportPrepared(prepared) = std::mem::replace(&mut self.state, State::Poisoned)
        else {
            return self.fail_state();
        };
        let result = run_with_usage(&mut self.usage, control, |context| {
            let emitter_result = copy_host_json(result_handle, host, context)?;
            let admitted = protobuf_source::admit_source_export_result(&emitter_result, context)?;
            let wire = encode(&Value::Null, context)?;
            Ok((wire, Vec::new(), admitted))
        });
        match result {
            Ok((wire, binary, admitted)) => {
                self.state = State::ExportResultAdmitted {
                    prepared,
                    result: admitted,
                };
                Response {
                    wire_envelope: super::result_envelope(Ok(wire)),
                    binary,
                }
            }
            Err(error) => {
                self.state = State::Poisoned;
                Response {
                    wire_envelope: super::result_envelope(Err(error)),
                    binary: Vec::new(),
                }
            }
        }
    }

    pub fn finish_export(
        &mut self,
        document_wire: &str,
        control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
    ) -> Response {
        let State::ExportResultAdmitted { prepared, result } =
            std::mem::replace(&mut self.state, State::Poisoned)
        else {
            return self.fail_state();
        };
        let response = run_with_usage(&mut self.usage, control, |context| {
            let document = decode(document_wire, context)?;
            let output = protobuf_source::finish_source_export_admitted(
                prepared, &document, result, context,
            )?;
            let wire = encode(&output, context)?;
            Ok((wire, Vec::new()))
        });
        self.finish_response(response)
    }

    /// Admit the post-callback document only after emitter-result success.
    pub fn finish_export_host(
        &mut self,
        document_handle: HostHandle,
        host: &mut dyn HostJsonReflection,
        control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
    ) -> Response {
        let State::ExportResultAdmitted {
            prepared: _,
            result,
        } = std::mem::replace(&mut self.state, State::Poisoned)
        else {
            return self.fail_state();
        };
        let response = run_with_usage(&mut self.usage, control, |context| {
            let document = copy_host_json(document_handle, host, context)?;
            let output =
                protobuf_source::finish_source_export_host_admitted(document, result, context)?;
            let wire = encode(&output, context)?;
            Ok((wire, Vec::new()))
        });
        self.finish_response(response)
    }

    fn finish_response(&mut self, result: Result<(String, Vec<u8>), EngineError>) -> Response {
        self.state = if result.is_ok() {
            State::Finished
        } else {
            State::Poisoned
        };
        match result {
            Ok((wire, binary)) => Response {
                wire_envelope: super::result_envelope(Ok(wire)),
                binary,
            },
            Err(error) => Response {
                wire_envelope: super::result_envelope(Err(error)),
                binary: Vec::new(),
            },
        }
    }

    fn fail_state(&mut self) -> Response {
        self.state = State::Poisoned;
        Response {
            wire_envelope: super::result_envelope(Err(EngineError::new(
                "SOURCE_SESSION",
                Utf16::default(),
                "Protobuf source operation is out of order or already finished",
            ))),
            binary: Vec::new(),
        }
    }
}

fn is_error_response(envelope: &str) -> bool {
    envelope.contains("\"status\":\"error\"")
}

fn run_with_usage<T>(
    usage: &mut TransportUsage,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
    operation: impl FnOnce(&mut Context<'_>) -> Result<T, EngineError>,
) -> Result<T, EngineError> {
    let mut context = Context::ordinary().with_host_control(control);
    usage.seed(&mut context);
    let result = operation(&mut context);
    usage.capture(&context);
    result
}

fn decode(wire: &str, context: &mut Context<'_>) -> Result<Value, EngineError> {
    context.with_tagged_transport_limit(|transport| super::decode(wire, transport))
}

fn encode(value: &Value, context: &mut Context<'_>) -> Result<String, EngineError> {
    context.with_tagged_transport_limit(|transport| super::encode(value, transport))
}
