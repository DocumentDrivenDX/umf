// SPDX-License-Identifier: MIT OR Apache-2.0
//! Shared, host-independent UMF core.
//!
//! This crate uses explicit owned values and capabilities. It has no ambient
//! filesystem, network, process, clock, or JavaScript runtime.
#[cfg(not(all(feature = "metamodel-compiler", not(feature = "full-core"))))]
include!("full_modules.rs");

// Source-bound metamodel compiler closure. Keep this list deliberately
// independent of adapters and runtime services, whose compile-time resources
// may be generated from the metamodel itself.
#[cfg(all(feature = "metamodel-compiler", not(feature = "full-core")))]
pub mod constraint_language;
#[cfg(all(feature = "metamodel-compiler", not(feature = "full-core")))]
pub mod context;
#[cfg(all(feature = "metamodel-compiler", not(feature = "full-core")))]
pub(crate) mod ecma_coercion;
#[cfg(all(feature = "metamodel-compiler", not(feature = "full-core")))]
pub mod error;
#[cfg(all(feature = "metamodel-compiler", not(feature = "full-core")))]
pub mod literal;
#[cfg(all(feature = "metamodel-compiler", not(feature = "full-core")))]
pub mod literal_policy;
#[cfg(all(feature = "metamodel-compiler", not(feature = "full-core")))]
pub mod native_json;
#[cfg(all(feature = "metamodel-compiler", not(feature = "full-core")))]
pub mod python_regex;
#[cfg(all(feature = "metamodel-compiler", not(feature = "full-core")))]
pub mod python_value;
#[cfg(all(feature = "metamodel-compiler", not(feature = "full-core")))]
pub mod schema;
#[cfg(all(feature = "metamodel-compiler", not(feature = "full-core")))]
pub mod serialization;
#[cfg(all(feature = "metamodel-compiler", not(feature = "full-core")))]
pub mod value;

pub use context::{Context, Limits, ResourceProfile};
#[cfg(not(all(feature = "metamodel-compiler", not(feature = "full-core"))))]
pub use engine::{Capabilities, CapabilityError, Engine, ResourceSet, SemanticContext};
pub use error::{Diagnostic, EngineError, PythonDiagnosticText, Severity, Validation};
pub use python_regex::{PythonReVersion, PythonRegex, PythonRegexError};
pub use python_value::{
    InstanceKind, InstanceNumber, InstanceText, InstanceView, PyText, PythonCompiledSchema,
    PythonConsumerValue, PythonSchemaEvaluation, PythonSchemaEvaluationMode,
    PythonSchemaPathSegment, PythonSchemaResources, PythonStructuralError,
};
#[cfg(not(all(feature = "metamodel-compiler", not(feature = "full-core"))))]
pub use registry::Registry;
pub use value::{Utf16, Value, copy_json, ecma_number_to_string};
