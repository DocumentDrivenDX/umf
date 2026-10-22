// SPDX-License-Identifier: MIT OR Apache-2.0
//! Shared private primitives for the two portable Python generators.

mod client;
pub(crate) mod python;
pub(crate) mod value;

use crate::resources::CodegenEngine;
use umf_core::{Context, EngineError, Value};

impl CodegenEngine<'_> {
    /// Generate the portable stdlib Python client from one exact source string.
    pub fn generate_python_client(
        &self,
        request: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        client::generate(self, request, ctx)
    }
}
