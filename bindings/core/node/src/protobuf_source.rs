// SPDX-License-Identifier: MIT OR Apache-2.0
//! Node host session for async, caller-supplied Protobuf source callbacks.

use napi::{
    bindgen_prelude::Buffer, Env, JsBoolean, JsFunction, JsNumber, JsString, JsUnknown, ValueType,
};
use napi_derive::napi;

#[napi]
pub struct ProtobufSourceResponse {
    pub wire_envelope: String,
    pub binary: Buffer,
}

fn response(response: umf_core_wire::protobuf_source::Response) -> ProtobufSourceResponse {
    ProtobufSourceResponse {
        wire_envelope: response.wire_envelope,
        binary: Buffer::from(response.binary),
    }
}

#[napi]
pub struct ProtobufSourceSession {
    inner: umf_core_wire::protobuf_source::Session,
}

#[napi]
impl ProtobufSourceSession {
    #[napi(constructor)]
    pub fn new() -> Self {
        Self {
            inner: umf_core_wire::protobuf_source::Session::new(),
        }
    }

    #[napi]
    pub fn prepare_import_host(
        &mut self,
        env: Env,
        request_handle: u32,
        dispatcher: JsFunction,
        control_dispatcher: Option<JsFunction>,
    ) -> ProtobufSourceResponse {
        let mut host = super::host_json::protobuf_source_host(env.clone(), dispatcher);
        if let Some(dispatcher) = control_dispatcher {
            let mut control = super::NodeControl { env, dispatcher };
            let mut hook = |amount| control.check(amount);
            response(
                self.inner
                    .prepare_import_host(request_handle as u64, &mut host, &mut hook),
            )
        } else {
            let mut no_control = |_amount| Ok(());
            response(self.inner.prepare_import_host(
                request_handle as u64,
                &mut host,
                &mut no_control,
            ))
        }
    }

    #[napi]
    pub fn finish_import_with_id(
        &mut self,
        env: Env,
        compiler: String,
        descriptor_set: Buffer,
        id: String,
        control_dispatcher: Option<JsFunction>,
    ) -> ProtobufSourceResponse {
        if let Some(dispatcher) = control_dispatcher {
            let mut control = super::NodeControl { env, dispatcher };
            let mut hook = |amount| control.check(amount);
            response(self.inner.finish_import_with_id(
                &compiler,
                descriptor_set.as_ref(),
                &id,
                &mut hook,
            ))
        } else {
            let mut no_control = |_amount| Ok(());
            response(self.inner.finish_import_with_id(
                &compiler,
                descriptor_set.as_ref(),
                &id,
                &mut no_control,
            ))
        }
    }

    #[napi]
    pub fn begin_import_descriptor(
        &mut self,
        env: Env,
        descriptor_set: Buffer,
        id: String,
        control_dispatcher: Option<JsFunction>,
    ) -> ProtobufSourceResponse {
        if let Some(dispatcher) = control_dispatcher {
            let mut control = super::NodeControl { env, dispatcher };
            let mut hook = |amount| control.check(amount);
            response(
                self.inner
                    .begin_import_descriptor(descriptor_set.as_ref(), &id, &mut hook),
            )
        } else {
            let mut no_control = |_amount| Ok(());
            response(self.inner.begin_import_descriptor(
                descriptor_set.as_ref(),
                &id,
                &mut no_control,
            ))
        }
    }

    #[napi]
    pub fn finish_import_archive(
        &mut self,
        env: Env,
        compiler: JsUnknown,
        control_dispatcher: Option<JsFunction>,
    ) -> ProtobufSourceResponse {
        let compiler = callback_compiler_value(compiler);
        if let Some(dispatcher) = control_dispatcher {
            let mut control = super::NodeControl { env, dispatcher };
            let mut hook = |amount| control.check(amount);
            response(self.inner.finish_import_archive_value(compiler, &mut hook))
        } else {
            let mut no_control = |_amount| Ok(());
            response(
                self.inner
                    .finish_import_archive_value(compiler, &mut no_control),
            )
        }
    }

    #[napi]
    pub fn prepare_import(
        &mut self,
        env: Env,
        request_wire: String,
        id: String,
        control_dispatcher: Option<JsFunction>,
    ) -> ProtobufSourceResponse {
        if let Some(dispatcher) = control_dispatcher {
            let mut control = super::NodeControl { env, dispatcher };
            let mut hook = |amount| control.check(amount);
            response(self.inner.prepare_import(&request_wire, &id, &mut hook))
        } else {
            let mut no_control = |_amount| Ok(());
            response(
                self.inner
                    .prepare_import(&request_wire, &id, &mut no_control),
            )
        }
    }

    #[napi]
    pub fn finish_import(
        &mut self,
        env: Env,
        compiler: String,
        descriptor_set: Buffer,
        control_dispatcher: Option<JsFunction>,
    ) -> ProtobufSourceResponse {
        if let Some(dispatcher) = control_dispatcher {
            let mut control = super::NodeControl { env, dispatcher };
            let mut hook = |amount| control.check(amount);
            response(
                self.inner
                    .finish_import(&compiler, descriptor_set.as_ref(), &mut hook),
            )
        } else {
            let mut no_control = |_amount| Ok(());
            response(
                self.inner
                    .finish_import(&compiler, descriptor_set.as_ref(), &mut no_control),
            )
        }
    }

    #[napi]
    pub fn prepare_export(
        &mut self,
        env: Env,
        document_wire: String,
        control_dispatcher: Option<JsFunction>,
    ) -> ProtobufSourceResponse {
        if let Some(dispatcher) = control_dispatcher {
            let mut control = super::NodeControl { env, dispatcher };
            let mut hook = |amount| control.check(amount);
            response(self.inner.prepare_export(&document_wire, &mut hook))
        } else {
            let mut no_control = |_amount| Ok(());
            response(self.inner.prepare_export(&document_wire, &mut no_control))
        }
    }

    #[napi]
    pub fn prepare_export_host(
        &mut self,
        env: Env,
        document_handle: u32,
        dispatcher: JsFunction,
        control_dispatcher: Option<JsFunction>,
    ) -> ProtobufSourceResponse {
        let mut host = super::host_json::protobuf_source_host(env.clone(), dispatcher);
        if let Some(dispatcher) = control_dispatcher {
            let mut control = super::NodeControl { env, dispatcher };
            let mut hook = |amount| control.check(amount);
            response(
                self.inner
                    .prepare_export_host(document_handle as u64, &mut host, &mut hook),
            )
        } else {
            let mut no_control = |_amount| Ok(());
            response(self.inner.prepare_export_host(
                document_handle as u64,
                &mut host,
                &mut no_control,
            ))
        }
    }

    #[napi]
    pub fn admit_emitter_result(
        &mut self,
        env: Env,
        result_wire: String,
        control_dispatcher: Option<JsFunction>,
    ) -> ProtobufSourceResponse {
        if let Some(dispatcher) = control_dispatcher {
            let mut control = super::NodeControl { env, dispatcher };
            let mut hook = |amount| control.check(amount);
            response(self.inner.admit_emitter_result(&result_wire, &mut hook))
        } else {
            let mut no_control = |_amount| Ok(());
            response(
                self.inner
                    .admit_emitter_result(&result_wire, &mut no_control),
            )
        }
    }

    #[napi]
    pub fn admit_emitter_result_host(
        &mut self,
        env: Env,
        result_handle: u32,
        dispatcher: JsFunction,
        control_dispatcher: Option<JsFunction>,
    ) -> ProtobufSourceResponse {
        let mut host = super::host_json::protobuf_source_host(env.clone(), dispatcher);
        if let Some(dispatcher) = control_dispatcher {
            let mut control = super::NodeControl { env, dispatcher };
            let mut hook = |amount| control.check(amount);
            response(self.inner.admit_emitter_result_host(
                result_handle as u64,
                &mut host,
                &mut hook,
            ))
        } else {
            let mut no_control = |_amount| Ok(());
            response(self.inner.admit_emitter_result_host(
                result_handle as u64,
                &mut host,
                &mut no_control,
            ))
        }
    }

    #[napi]
    pub fn finish_export(
        &mut self,
        env: Env,
        document_wire: String,
        control_dispatcher: Option<JsFunction>,
    ) -> ProtobufSourceResponse {
        if let Some(dispatcher) = control_dispatcher {
            let mut control = super::NodeControl { env, dispatcher };
            let mut hook = |amount| control.check(amount);
            response(self.inner.finish_export(&document_wire, &mut hook))
        } else {
            let mut no_control = |_amount| Ok(());
            response(self.inner.finish_export(&document_wire, &mut no_control))
        }
    }

    #[napi]
    pub fn finish_export_host(
        &mut self,
        env: Env,
        document_handle: u32,
        dispatcher: JsFunction,
        control_dispatcher: Option<JsFunction>,
    ) -> ProtobufSourceResponse {
        let mut host = super::host_json::protobuf_source_host(env.clone(), dispatcher);
        if let Some(dispatcher) = control_dispatcher {
            let mut control = super::NodeControl { env, dispatcher };
            let mut hook = |amount| control.check(amount);
            response(
                self.inner
                    .finish_export_host(document_handle as u64, &mut host, &mut hook),
            )
        } else {
            let mut no_control = |_amount| Ok(());
            response(self.inner.finish_export_host(
                document_handle as u64,
                &mut host,
                &mut no_control,
            ))
        }
    }
}

fn callback_compiler_value(value: JsUnknown) -> umf_core::Value {
    match value.get_type().unwrap_or(ValueType::Undefined) {
        ValueType::String => {
            let value: JsString = unsafe { value.cast() };
            let mut units = value
                .into_utf16()
                .map(|text| text.as_slice().to_vec())
                .unwrap_or_default();
            if units.last() == Some(&0) {
                units.pop();
            }
            umf_core::Value::String(umf_core::Utf16::new(units))
        }
        ValueType::Number => {
            let value: JsNumber = unsafe { value.cast() };
            umf_core::Value::Number(value.get_double().unwrap_or(f64::NAN))
        }
        ValueType::Boolean => {
            let value: JsBoolean = unsafe { value.cast() };
            umf_core::Value::Bool(value.get_value().unwrap_or(false))
        }
        _ => umf_core::Value::Null,
    }
}

#[napi(js_name = "protobufSourceProfileVersion")]
pub fn protobuf_source_profile_version() -> &'static str {
    umf_core_wire::protobuf_source::PROFILE
}
