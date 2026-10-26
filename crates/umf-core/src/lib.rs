// SPDX-License-Identifier: MIT OR Apache-2.0
//! Shared, host-independent UMF core.
//!
//! This crate uses explicit owned values and capabilities. It has no ambient
//! filesystem, network, process, clock, or JavaScript runtime.
pub mod constraint_language;
pub mod constraints;
pub mod context;
pub mod document;
pub(crate) mod ecma_coercion;
pub mod engine;
pub mod error;
pub mod kinds;
pub mod literal;
pub mod literal_policy;
pub mod python_regex;
pub mod python_value;
pub mod registry;
pub mod schema;
pub mod serialization;
pub mod value;
pub use context::{Context, Limits, ResourceProfile};
pub use engine::{Capabilities, CapabilityError, Engine, ResourceSet, SemanticContext};
pub use error::{Diagnostic, EngineError, PythonDiagnosticText, Severity, Validation};
pub use python_regex::{PythonReVersion, PythonRegex, PythonRegexError};
pub use python_value::{
    InstanceKind, InstanceNumber, InstanceText, InstanceView, PyText, PythonCompiledSchema,
    PythonConsumerValue, PythonSchemaEvaluation, PythonSchemaEvaluationMode,
    PythonSchemaPathSegment, PythonSchemaResources, PythonStructuralError,
};
pub use registry::Registry;
pub use value::{copy_json, ecma_number_to_string, Utf16, Value};
