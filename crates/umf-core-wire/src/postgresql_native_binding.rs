//! Opt-in synchronous host backend for PostgreSQL raw SQL operations.
//! The browser uses `postgresql_parser_binding` and an asynchronous host call.

use crate::postgresql_sql_binding;
use umf_core::{pg_query_native_ffi::NativePgQueryBackend, EngineError};

pub const PROFILE: &str = postgresql_sql_binding::PROFILE;

pub fn execute_wire(wire: &str) -> String {
    execute_wire_with_control(wire, &mut |_| Ok(()))
}

pub fn execute_wire_with_control(
    wire: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    let backend = NativePgQueryBackend;
    postgresql_sql_binding::execute_wire_with_backend(wire, &backend, control)
}

/// Native PostgreSQL catalog operations share the parser kernel while preserving
/// the ordinary family wire profile and control accounting.
pub fn execute_catalog_wire(wire: &str) -> String {
    execute_catalog_wire_with_control(wire, &mut |_| Ok(()))
}

pub fn execute_catalog_wire_with_control(
    wire: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    let backend = NativePgQueryBackend;
    crate::postgresql_catalog_binding::execute_wire_with_parser_backend(wire, &backend, control)
}
