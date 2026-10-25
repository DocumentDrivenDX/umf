// SPDX-License-Identifier: MIT OR Apache-2.0
//! Browser WASM session for async, caller-supplied Protobuf source callbacks.

use js_sys::{Function, Uint8Array};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct ProtobufSourceResponse {
    wire_envelope: String,
    binary: Vec<u8>,
}

#[wasm_bindgen]
impl ProtobufSourceResponse {
    #[wasm_bindgen(getter, js_name = wireEnvelope)]
    pub fn wire_envelope(&self) -> String {
        self.wire_envelope.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn binary(&self) -> Uint8Array {
        Uint8Array::from(self.binary.as_slice())
    }
}

fn response(response: umf_core_wire::protobuf_source::Response) -> ProtobufSourceResponse {
    ProtobufSourceResponse {
        wire_envelope: response.wire_envelope,
        binary: response.binary,
    }
}

#[wasm_bindgen]
pub struct ProtobufSourceSession {
    inner: umf_core_wire::protobuf_source::Session,
}

#[wasm_bindgen]
impl ProtobufSourceSession {
    #[wasm_bindgen(constructor)]
    pub fn new() -> ProtobufSourceSession {
        ProtobufSourceSession {
            inner: umf_core_wire::protobuf_source::Session::new(),
        }
    }

    #[wasm_bindgen(js_name = prepareImportHost)]
    pub fn prepare_import_host_js(
        &mut self,
        request_handle: u32,
        dispatcher: &Function,
        control_dispatcher: Option<Function>,
    ) -> ProtobufSourceResponse {
        let mut host = super::host_json::protobuf_source_host(dispatcher);
        if let Some(dispatcher) = control_dispatcher {
            let mut control = super::WasmControl { dispatcher };
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

    #[wasm_bindgen(js_name = finishImportWithId)]
    pub fn finish_import_with_id_js(
        &mut self,
        compiler: &str,
        descriptor_set: Vec<u8>,
        id: &str,
        control_dispatcher: Option<Function>,
    ) -> ProtobufSourceResponse {
        if let Some(dispatcher) = control_dispatcher {
            let mut control = super::WasmControl { dispatcher };
            let mut hook = |amount| control.check(amount);
            response(
                self.inner
                    .finish_import_with_id(compiler, &descriptor_set, id, &mut hook),
            )
        } else {
            let mut no_control = |_amount| Ok(());
            response(self.inner.finish_import_with_id(
                compiler,
                &descriptor_set,
                id,
                &mut no_control,
            ))
        }
    }

    #[wasm_bindgen(js_name = beginImportDescriptor)]
    pub fn begin_import_descriptor_js(
        &mut self,
        descriptor_set: Vec<u8>,
        id: &str,
        control_dispatcher: Option<Function>,
    ) -> ProtobufSourceResponse {
        if let Some(dispatcher) = control_dispatcher {
            let mut control = super::WasmControl { dispatcher };
            let mut hook = |amount| control.check(amount);
            response(
                self.inner
                    .begin_import_descriptor(&descriptor_set, id, &mut hook),
            )
        } else {
            let mut no_control = |_amount| Ok(());
            response(
                self.inner
                    .begin_import_descriptor(&descriptor_set, id, &mut no_control),
            )
        }
    }

    #[wasm_bindgen(js_name = finishImportArchive)]
    pub fn finish_import_archive_js(
        &mut self,
        compiler: JsValue,
        control_dispatcher: Option<Function>,
    ) -> ProtobufSourceResponse {
        let compiler = callback_compiler_value(compiler);
        if let Some(dispatcher) = control_dispatcher {
            let mut control = super::WasmControl { dispatcher };
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

    #[wasm_bindgen(js_name = prepareImport)]
    pub fn prepare_import(
        &mut self,
        request_wire: &str,
        id: &str,
        control_dispatcher: Option<Function>,
    ) -> ProtobufSourceResponse {
        if let Some(dispatcher) = control_dispatcher {
            let mut control = super::WasmControl { dispatcher };
            let mut hook = |amount| control.check(amount);
            response(self.inner.prepare_import(request_wire, id, &mut hook))
        } else {
            let mut no_control = |_amount| Ok(());
            response(self.inner.prepare_import(request_wire, id, &mut no_control))
        }
    }

    #[wasm_bindgen(js_name = finishImport)]
    pub fn finish_import(
        &mut self,
        compiler: &str,
        descriptor_set: Vec<u8>,
        control_dispatcher: Option<Function>,
    ) -> ProtobufSourceResponse {
        if let Some(dispatcher) = control_dispatcher {
            let mut control = super::WasmControl { dispatcher };
            let mut hook = |amount| control.check(amount);
            response(
                self.inner
                    .finish_import(compiler, &descriptor_set, &mut hook),
            )
        } else {
            let mut no_control = |_amount| Ok(());
            response(
                self.inner
                    .finish_import(compiler, &descriptor_set, &mut no_control),
            )
        }
    }

    #[wasm_bindgen(js_name = prepareExport)]
    pub fn prepare_export(
        &mut self,
        document_wire: &str,
        control_dispatcher: Option<Function>,
    ) -> ProtobufSourceResponse {
        if let Some(dispatcher) = control_dispatcher {
            let mut control = super::WasmControl { dispatcher };
            let mut hook = |amount| control.check(amount);
            response(self.inner.prepare_export(document_wire, &mut hook))
        } else {
            let mut no_control = |_amount| Ok(());
            response(self.inner.prepare_export(document_wire, &mut no_control))
        }
    }

    #[wasm_bindgen(js_name = prepareExportHost)]
    pub fn prepare_export_host_js(
        &mut self,
        document_handle: u32,
        dispatcher: &Function,
        control_dispatcher: Option<Function>,
    ) -> ProtobufSourceResponse {
        let mut host = super::host_json::protobuf_source_host(dispatcher);
        if let Some(dispatcher) = control_dispatcher {
            let mut control = super::WasmControl { dispatcher };
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

    #[wasm_bindgen(js_name = admitEmitterResult)]
    pub fn admit_emitter_result(
        &mut self,
        result_wire: &str,
        control_dispatcher: Option<Function>,
    ) -> ProtobufSourceResponse {
        if let Some(dispatcher) = control_dispatcher {
            let mut control = super::WasmControl { dispatcher };
            let mut hook = |amount| control.check(amount);
            response(self.inner.admit_emitter_result(result_wire, &mut hook))
        } else {
            let mut no_control = |_amount| Ok(());
            response(
                self.inner
                    .admit_emitter_result(result_wire, &mut no_control),
            )
        }
    }

    #[wasm_bindgen(js_name = admitEmitterResultHost)]
    pub fn admit_emitter_result_host_js(
        &mut self,
        result_handle: u32,
        dispatcher: &Function,
        control_dispatcher: Option<Function>,
    ) -> ProtobufSourceResponse {
        let mut host = super::host_json::protobuf_source_host(dispatcher);
        if let Some(dispatcher) = control_dispatcher {
            let mut control = super::WasmControl { dispatcher };
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

    #[wasm_bindgen(js_name = finishExport)]
    pub fn finish_export(
        &mut self,
        document_wire: &str,
        control_dispatcher: Option<Function>,
    ) -> ProtobufSourceResponse {
        if let Some(dispatcher) = control_dispatcher {
            let mut control = super::WasmControl { dispatcher };
            let mut hook = |amount| control.check(amount);
            response(self.inner.finish_export(document_wire, &mut hook))
        } else {
            let mut no_control = |_amount| Ok(());
            response(self.inner.finish_export(document_wire, &mut no_control))
        }
    }

    #[wasm_bindgen(js_name = finishExportHost)]
    pub fn finish_export_host_js(
        &mut self,
        document_handle: u32,
        dispatcher: &Function,
        control_dispatcher: Option<Function>,
    ) -> ProtobufSourceResponse {
        let mut host = super::host_json::protobuf_source_host(dispatcher);
        if let Some(dispatcher) = control_dispatcher {
            let mut control = super::WasmControl { dispatcher };
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

fn callback_compiler_value(value: JsValue) -> umf_core::Value {
    if let Some(text) = value.as_string() {
        return umf_core::Value::String(umf_core::Utf16::from(text));
    }
    if let Some(number) = value.as_f64() {
        return umf_core::Value::Number(number);
    }
    if let Some(boolean) = value.as_bool() {
        return umf_core::Value::Bool(boolean);
    }
    umf_core::Value::Null
}

#[wasm_bindgen(js_name = protobufSourceProfileVersion)]
pub fn protobuf_source_profile_version() -> String {
    umf_core_wire::protobuf_source::PROFILE.to_owned()
}
