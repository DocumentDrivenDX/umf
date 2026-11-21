// SPDX-License-Identifier: MIT OR Apache-2.0
//! Staged host-callback packet for explicit Protobuf source import and export.

use umf_core::{
    Context, EngineError, Utf16, Value,
    context::TransportUsage,
    host_json::{HostHandle, HostJsonReflection, copy_host_json},
    protobuf_source,
};

pub const PROFILE: &str = "umf-r8-protobuf-source/0.1.0";

/// Invocation-local control selection. The host uses Uncontrolled only when
/// no callback was supplied; real callbacks retain the original cold path.
pub enum PhaseControl<'a> {
    Uncontrolled,
    Controlled(&'a mut dyn FnMut(usize) -> Result<(), EngineError>),
}
impl PhaseControl<'_> {
    fn reborrow(&mut self) -> PhaseControl<'_> {
        match self { Self::Uncontrolled => PhaseControl::Uncontrolled, Self::Controlled(control) => PhaseControl::Controlled(&mut **control) }
    }
}
impl<'a, F: FnMut(usize) -> Result<(), EngineError> + 'a> From<&'a mut F> for PhaseControl<'a> {
    fn from(control: &'a mut F) -> Self { Self::Controlled(control) }
}
impl<'a> From<&'a mut (dyn FnMut(usize) -> Result<(), EngineError> + 'a)> for PhaseControl<'a> {
    fn from(control: &'a mut (dyn FnMut(usize) -> Result<(), EngineError> + 'a)) -> Self { Self::Controlled(control) }
}


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

    pub fn prepare_import<'a>(
        &mut self,
        request_wire: &str,
        id: &str,
        control: impl Into<PhaseControl<'a>>,
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
    pub fn prepare_import_host<'a>(
        &mut self,
        request_handle: HostHandle,
        host: &mut dyn HostJsonReflection,
        control: impl Into<PhaseControl<'a>>,
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

    pub fn finish_import<'a>(
        &mut self,
        compiler: &str,
        descriptor_set: &[u8],
        control: impl Into<PhaseControl<'a>>,
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

    pub fn finish_import_with_id<'a>(
        &mut self,
        compiler: &str,
        descriptor_set: &[u8],
        id: &str,
        control: impl Into<PhaseControl<'a>>,
    ) -> Response {
        let mut control = control.into();
        let begun = self.begin_import_descriptor(descriptor_set, id, control.reborrow());
        if is_error_response(&begun.wire_envelope) {
            return begun;
        }
        self.finish_import_archive(compiler, control)
    }

    pub fn begin_import_descriptor<'a>(
        &mut self,
        descriptor_set: &[u8],
        id: &str,
        control: impl Into<PhaseControl<'a>>,
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

    pub fn finish_import_archive<'a>(
        &mut self,
        compiler: &str,
        control: impl Into<PhaseControl<'a>>,
    ) -> Response {
        self.finish_import_archive_value(Value::String(Utf16::from(compiler)), control)
    }

    pub fn finish_import_archive_value<'a>(
        &mut self,
        compiler: Value,
        control: impl Into<PhaseControl<'a>>,
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

    pub fn prepare_export<'a>(
        &mut self,
        document_wire: &str,
        control: impl Into<PhaseControl<'a>>,
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
    pub fn prepare_export_host<'a>(
        &mut self,
        document_handle: HostHandle,
        host: &mut dyn HostJsonReflection,
        control: impl Into<PhaseControl<'a>>,
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

    pub fn admit_emitter_result<'a>(
        &mut self,
        result_wire: &str,
        control: impl Into<PhaseControl<'a>>,
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
    pub fn admit_emitter_result_host<'a>(
        &mut self,
        result_handle: HostHandle,
        host: &mut dyn HostJsonReflection,
        control: impl Into<PhaseControl<'a>>,
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

    pub fn finish_export<'a>(
        &mut self,
        document_wire: &str,
        control: impl Into<PhaseControl<'a>>,
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
    pub fn finish_export_host<'a>(
        &mut self,
        document_handle: HostHandle,
        host: &mut dyn HostJsonReflection,
        control: impl Into<PhaseControl<'a>>,
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

fn run_with_usage<'a, T>(
    usage: &mut TransportUsage,
    control: impl Into<PhaseControl<'a>>,
    operation: impl FnOnce(&mut Context<'_>) -> Result<T, EngineError>,
) -> Result<T, EngineError> {
    let mut context = match control.into() {
        PhaseControl::Uncontrolled => Context::ordinary_construction(),
        PhaseControl::Controlled(control) => Context::ordinary().with_host_control(control),
    };
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

#[cfg(test)]
mod source_session_control_tests {
    use super::*;
    use std::cell::Cell;
    fn document() -> Value {
        umf_core::protobuf_document::import_descriptor_set(include_bytes!("../../../fixtures/protobuf/authored.pb"), "before", &mut Context::ordinary()).unwrap()
    }
    fn envelope(response: &Response) -> serde_json::Value { serde_json::from_str(&response.wire_envelope).unwrap() }
    fn wire(value: &Value) -> String { super::super::encode(value, &mut Context::ordinary()).unwrap() }
    fn emitted() -> String {
        wire(&umf_core::serialization::read_json_value(&r#"{"compiler":"oracle","printer":"fixture","files":{"main.proto":"syntax = \"proto3\";"},"future":{"kept":true}}"#.encode_utf16().collect::<Vec<_>>(),umf_core::serialization::Format::Json,&mut Context::ordinary()).unwrap())
    }
    #[test]
    fn controlled_and_uncontrolled_phases_match_without_resetting_usage() {
        let source=document(); let before=source.clone(); let request=wire(&source);
        let run=|uncontrolled:bool| {
            let mut session=Session::new(); let work=Cell::new(0u64); let mut meter=|amount:usize|{work.set(work.get()+amount as u64);Ok(())};
            let first=if uncontrolled{session.prepare_export(&request,PhaseControl::Uncontrolled)}else{session.prepare_export(&request,&mut meter)};
            assert_eq!(envelope(&first)["status"],"ok"); let a=session.usage.charged_work();assert!(a>0);if !uncontrolled{assert_eq!(a,work.get());}
            let result=emitted();let second=if uncontrolled{session.admit_emitter_result(&result,PhaseControl::Uncontrolled)}else{session.admit_emitter_result(&result,&mut meter)};
            assert_eq!(envelope(&second)["status"],"ok");let b=session.usage.charged_work();assert!(b>a);if !uncontrolled{assert_eq!(b,work.get());}
            let mut current=source.clone();if let Value::Object(fields)=&mut current{fields.iter_mut().find(|(key,_)|key==&Utf16::from("id")).unwrap().1=Value::string_utf8("after");}
            let current_wire=wire(&current);
            let final_response=if uncontrolled{session.finish_export(&current_wire,PhaseControl::Uncontrolled)}else{session.finish_export(&current_wire,&mut meter)};
            let final_envelope=envelope(&final_response);assert_eq!(final_envelope["status"],"ok");let c=session.usage.charged_work();assert!(c>b);if !uncontrolled{assert_eq!(c,work.get());}
            let decoded=super::super::decode(final_envelope["wire"].as_str().unwrap(),&mut Context::ordinary()).unwrap();
            let Value::Object(fields)=&decoded else{panic!("report expected")};assert_eq!(fields.iter().find(|(key,_)|key==&Utf16::from("source")).unwrap().1,current);
            assert_eq!(envelope(&session.finish_export(&current_wire,PhaseControl::Uncontrolled))["code"],"SOURCE_SESSION");
            (first.binary,second.wire_envelope,final_response.wire_envelope)
        };
        assert_eq!(run(true),run(false));assert_eq!(run(true),run(false));assert_eq!(source,before);
    }
    #[test]
    fn a_late_host_refusal_poisoned_session_cannot_publish_or_resume() {
        let source=wire(&document());let mut session=Session::new();
        assert_eq!(envelope(&session.prepare_export(&source,PhaseControl::Uncontrolled))["status"],"ok");
        assert_eq!(envelope(&session.admit_emitter_result(&emitted(),PhaseControl::Uncontrolled))["status"],"ok");
        let usage=session.usage.charged_work();let mut calls=0;let mut stop=|_:usize|{calls+=1;Err(EngineError::new("CANCELLED",Utf16::from("/host"),"stop"))};
        let rejected=session.finish_export(&source,&mut stop);let result=envelope(&rejected);assert_eq!(result["code"],"CANCELLED");assert!(result.get("wire").is_none());assert!(rejected.binary.is_empty());assert_eq!(calls,1);assert!(session.usage.charged_work()>=usage);
        assert_eq!(envelope(&session.finish_export(&source,PhaseControl::Uncontrolled))["code"],"SOURCE_SESSION");
    }
}
