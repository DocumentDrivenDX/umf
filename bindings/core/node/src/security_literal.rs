// SPDX-License-Identifier: MIT OR Apache-2.0
use napi::{Env, Error, JsFunction, Result};
use napi_derive::napi;
use umf_core_wire::security_functions_binding::PreparedSecurityLiteralSource;
#[napi]
pub struct PreparedSecurityLiteralSourceHandle { inner: PreparedSecurityLiteralSource }
#[napi]
impl PreparedSecurityLiteralSourceHandle {
    #[napi(constructor)]
    pub fn new(env: Env, source_wire: String, dispatcher: Option<JsFunction>) -> Result<Self> {
        let result = if let Some(dispatcher) = dispatcher {
            let mut control = super::NodeControl { env, dispatcher }; let mut hook = |n| control.check(n);
            PreparedSecurityLiteralSource::new(&source_wire, Some(&mut hook))
        } else { PreparedSecurityLiteralSource::new(&source_wire, None) };
        result.map(|inner| Self { inner }).map_err(|error| Error::from_reason(umf_core_wire::error_envelope(error)))
    }
    #[napi]
    pub fn execute(&self, env: Env, wire: String, dispatcher: Option<JsFunction>) -> String {
        if let Some(dispatcher) = dispatcher {
            let mut control = super::NodeControl { env, dispatcher }; let mut hook = |n| control.check(n);
            self.inner.execute(&wire, Some(&mut hook))
        } else { self.inner.execute(&wire, None) }
    }
}
