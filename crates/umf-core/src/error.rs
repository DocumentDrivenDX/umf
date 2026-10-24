// SPDX-License-Identifier: MIT OR Apache-2.0
use crate::{python_value::PyText, value::Utf16};

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EngineError {
    pub code: String,
    pub path: Utf16,
    pub message: Utf16,
    /// Exact Python codepoint-origin text for trusted host-hook exceptions.
    /// This never enters the closed wire envelope.
    pub python_message_origin: Option<PyText>,
    /// Private provenance for the few Python schema exceptions which the
    /// predecessor exposes as ordered iterator terminals. Public code/message
    /// equality is not sufficient to make a host error deferable.
    pub(crate) python_schema_terminal: Option<PythonSchemaTerminal>,
    /// Trusted origin for cooperative host/control failures. Message/code text
    /// alone never determines whether a compiler may turn an error into data.
    control_failure: bool,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum PythonSchemaTerminal {
    Arithmetic,
    LocalReference,
    LegacyBooleanItems,
}

impl EngineError {
    pub fn new(code: impl Into<String>, path: Utf16, message: impl Into<Utf16>) -> Self {
        Self {
            code: code.into(),
            path,
            message: message.into(),
            python_message_origin: None,
            python_schema_terminal: None,
            control_failure: false,
        }
    }

    /// Whether this error arose from an invocation control capability. The flag
    /// is internal provenance and is not serialized into diagnostics or wire data.
    pub fn is_control_failure(&self) -> bool {
        self.control_failure
    }

    pub(crate) fn with_control_failure(mut self) -> Self {
        self.control_failure = true;
        self
    }

    pub(crate) fn with_python_schema_terminal(mut self, terminal: PythonSchemaTerminal) -> Self {
        self.python_schema_terminal = Some(terminal);
        self
    }

    pub(crate) fn is_python_schema_terminal(&self) -> bool {
        self.python_schema_terminal.is_some()
    }

    /// Host capabilities may return an error previously obtained from a
    /// semantic call. Its old evaluator provenance must not cross the host
    /// boundary and change how this operation handles the error.
    pub(crate) fn from_host(mut self) -> Self {
        self.python_schema_terminal = None;
        self.control_failure = true;
        self
    }
}

impl std::fmt::Display for EngineError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {:?}: {:?}", self.code, self.path, self.message)
    }
}

impl std::error::Error for EngineError {}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Severity {
    Error,
    Warning,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Diagnostic {
    pub code: Utf16,
    pub path: Utf16,
    /// The path contains Python source-origin markers and must be decoded
    /// with `python_path_from_internal` by a Python-facing binding. Host
    /// callback paths never set this flag.
    pub python_source_path: bool,
    pub message: Utf16,
    pub severity: Severity,
    /// Optional source-origin Python text for diagnostics returned by a
    /// trusted Python capability. This metadata is host-local and is not part
    /// of the closed core-wire or public diagnostic shape.
    pub python_text_origin: Option<PythonDiagnosticText>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PythonDiagnosticText {
    pub code: Option<PyText>,
    pub path: Option<PyText>,
    pub message: Option<PyText>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Validation {
    pub valid: bool,
    pub complete: bool,
    pub diagnostics: Vec<Diagnostic>,
}
