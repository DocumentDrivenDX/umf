// SPDX-License-Identifier: MIT OR Apache-2.0
//! Shared private primitives for the two portable Python generators.

mod client;
pub(crate) mod python;
pub(crate) mod value;

use crate::resources::CodegenEngine;
use umf_core::{Context, EngineError, Value};

/// Closed host-read callback used only by the opt-in Python-client V3 route.
pub trait PythonClientHostReadV3 {
    fn read(&mut self, event: &str, argument: Option<&str>) -> Result<Value, EngineError>;
}

impl CodegenEngine<'_> {
    /// Generate the portable stdlib Python client from one exact source string.
    pub fn generate_python_client(
        &self,
        request: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        client::generate(self, request, ctx)
    }

    /// Generate through the synchronous, closed V3 host-read protocol.
    pub fn generate_python_client_host_v3(
        &self,
        host_read: &mut dyn PythonClientHostReadV3,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        client::generate_host_v3(self, host_read, ctx)
    }

    /// Generate through the synchronous, resource-bounded V4 host-read profile.
    pub fn generate_python_client_host_v4(
        &self,
        host_read: &mut dyn PythonClientHostReadV3,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        client::generate_host_v4(self, host_read, ctx)
    }
}
