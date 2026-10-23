// SPDX-License-Identifier: MIT OR Apache-2.0
//! Shared, host-independent UMF core.
//!
//! This crate uses explicit owned values and capabilities. It has no ambient
//! filesystem, network, process, clock, or JavaScript runtime.
pub mod constraint_language;
pub mod constraints;
pub mod context;
pub mod document;
pub mod edit_extension;
pub(crate) mod ecma_coercion;
pub mod engine;
pub mod error;
pub mod access_temporal;
pub mod access_constraints;
pub mod access_stream;
pub mod access_values;
pub mod access_related_keys;
pub mod avro_fields;
pub mod operation_values;
pub mod outcome_values;
pub mod protobuf_descriptor;
pub mod protobuf_document;
pub mod protobuf_inspect;
pub mod bit128;
pub mod cardinality;
pub mod core_kind;
pub mod gregorian_date;
pub mod javascript_numeric;
pub mod literal;
pub mod literal_policy;
pub mod nullability;
pub mod native_json;
pub mod json_schema_adapter;
pub mod json_schema_inspect;
pub mod iceberg_schema;
pub mod python_regex;
pub mod python_value;
pub mod registry;
pub mod rfc3339_exact_instant;
pub mod selection;
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
