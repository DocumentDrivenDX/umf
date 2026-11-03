// SPDX-License-Identifier: MIT OR Apache-2.0
//! Host-independent code generation and table lifecycle operations.
//!
//! This crate owns no filesystem, network, process, clock, or JavaScript
//! capability. Callers provide the compiled core engine, registries, trusted
//! schemas, and per-operation [`umf_core::Context`].

pub mod access;
pub mod actions;
pub mod canonical;
pub mod deployment;
pub mod generation;
pub(crate) mod grant_columns;
pub mod inventory;
pub mod migration;
pub mod pack_tools;
pub mod resources;
pub mod row_scope;
pub mod tables;
pub mod value;

pub use resources::{CodegenEngine, CodegenResources};
