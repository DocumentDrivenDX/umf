// SPDX-License-Identifier: MIT OR Apache-2.0
//! PyO3 bridge for the opt-in related-Key JSON parser.
//!
//! Python owns the outer codec and its exception choreography. This module
//! accepts/returns Python objects only at the boundary and transports text as
//! UTF-32LE with `surrogatepass`, so no lone surrogate passes through Rust
//! `String`.

use pyo3::{
    exceptions::PyValueError,
    prelude::*,
    types::{PyBytes, PyDict, PyList, PyString},
};
use umf_core::access_related_keys::{
    parse_related_key_json, DiagnosticProfile, JsonNodeKind, ParseFailureKind,
};

pub const PROFILE_VERSION: &str = "umf-r6-related-key-json/0.1.0";

/// Return `(tree, failure_kind, diagnostic, offset)`.
///
/// Failure details are data rather than raised exceptions because the Python
/// facade must reproduce the frozen `json.loads` exception as the suppressed
/// context of its outer `CodecError`.
#[pyfunction]
pub fn related_keys_parse(
    py: Python<'_>,
    text: &Bound<'_, PyString>,
    profile: &str,
) -> PyResult<PyObject> {
    let diagnostic_profile = match profile {
        "cpython-3.11" => DiagnosticProfile::Cpython311,
        "cpython-3.14" => DiagnosticProfile::Cpython314,
        _ => {
            return Err(PyValueError::new_err(
                "unsupported related-Key parser profile",
            ))
        }
    };
    let encoded = text.call_method1("encode", ("utf-32-le", "surrogatepass"))?;
    let bytes = encoded.downcast::<PyBytes>()?.as_bytes();
    if bytes.len() % 4 != 0 {
        return Err(PyValueError::new_err(
            "invalid UTF-32LE Python text encoding",
        ));
    }
    let input = bytes
        .chunks_exact(4)
        .map(|chunk| u32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
        .collect::<Vec<_>>();

    let parsed = match parse_related_key_json(&input, diagnostic_profile) {
        Ok(value) => {
            // CPython's JSON decoder enters its recursion budget once per
            // array/object. The Rust parser stays iterative; this boundary
            // check reproduces the active interpreter's budget without native
            // Rust stack growth.
            let recursion = RecursionBudget::enter_for_json_containers(py, &input)?;
            drop(recursion);
            value
        }
        Err(failure) => {
            // Check only through the first parser refusal. Invalid trailing
            // text or later containers must not replace an earlier JSON error.
            let recursion = RecursionBudget::enter_for_json_containers(
                py,
                &input[..failure.offset.min(input.len())],
            )?;
            drop(recursion);
            let kind = match failure.kind {
                ParseFailureKind::DuplicateDecodedMember => "duplicate",
                ParseFailureKind::NumericToken => "numeric",
                ParseFailureKind::Malformed(_) => "malformed",
            };
            let diagnostic = failure.diagnostic(diagnostic_profile, &input);
            return Ok((py.None(), kind, diagnostic, failure.offset).into_py(py));
        }
    };
    let mut objects: Vec<Option<PyObject>> = std::iter::repeat_with(|| None)
        .take(parsed.nodes().len())
        .collect();
    for (index, node) in parsed.nodes().iter().enumerate().rev() {
        let value = match &node.kind {
            JsonNodeKind::Null => py.None(),
            JsonNodeKind::Bool(value) => value.into_py(py),
            JsonNodeKind::String(points) => decode_points(py, points)?,
            JsonNodeKind::Array(children) => {
                let values = PyList::empty_bound(py);
                for &index in children {
                    values.append(objects[index].as_ref().expect("children follow parents"))?;
                }
                values.into_py(py)
            }
            JsonNodeKind::Object(fields) => {
                let values = PyDict::new_bound(py);
                for (key, index) in fields {
                    values.set_item(
                        decode_points(py, key)?,
                        objects[*index].as_ref().expect("children follow parents"),
                    )?;
                }
                values.into_py(py)
            }
        };
        objects[index] = Some(value);
    }
    let root = objects[parsed.root()].take().expect("parsed root exists");
    Ok((root, py.None(), py.None(), py.None()).into_py(py))
}

fn decode_points(py: Python<'_>, points: &[u32]) -> PyResult<PyObject> {
    let mut bytes = Vec::with_capacity(points.len().saturating_mul(4));
    for point in points {
        bytes.extend_from_slice(&point.to_le_bytes());
    }
    let raw = PyBytes::new_bound(py, &bytes);
    Ok(raw
        .call_method1("decode", ("utf-32-le", "surrogatepass"))?
        .unbind())
}

struct RecursionBudget {
    entered: usize,
}

impl RecursionBudget {
    fn enter_for_json_containers(py: Python<'_>, input: &[u32]) -> PyResult<Self> {
        let mut budget = Self { entered: 0 };
        let mut containers = Vec::new();
        let mut in_string = false;
        let mut escaped = false;
        for &point in input {
            if in_string {
                if escaped {
                    escaped = false;
                } else if point == b'\\' as u32 {
                    escaped = true;
                } else if point == b'"' as u32 {
                    in_string = false;
                }
                continue;
            }
            match point {
                x if x == b'"' as u32 => in_string = true,
                x if x == b'[' as u32 => {
                    budget.enter(py, " while decoding a JSON array from a unicode string")?;
                    containers.push(b']' as u32);
                }
                x if x == b'{' as u32 => {
                    budget.enter(py, " while decoding a JSON object from a unicode string")?;
                    containers.push(b'}' as u32);
                }
                x if (x == b']' as u32 || x == b'}' as u32)
                    && containers.last().copied() == Some(x) =>
                {
                    if !containers.is_empty() {
                        unsafe { pyo3::ffi::Py_LeaveRecursiveCall() };
                        budget.entered -= 1;
                        containers.pop();
                    }
                }
                x if x == b']' as u32 || x == b'}' as u32 => break,
                _ => {}
            }
        }
        Ok(budget)
    }

    fn enter(&mut self, py: Python<'_>, where_: &str) -> PyResult<()> {
        let c_where = std::ffi::CString::new(where_).expect("static recursion context");
        let result = unsafe { pyo3::ffi::Py_EnterRecursiveCall(c_where.as_ptr()) };
        if result == 0 {
            self.entered += 1;
            Ok(())
        } else {
            Err(PyErr::fetch(py))
        }
    }
}

impl Drop for RecursionBudget {
    fn drop(&mut self) {
        for _ in 0..self.entered {
            unsafe { pyo3::ffi::Py_LeaveRecursiveCall() };
        }
    }
}

#[pyfunction]
pub fn related_keys_profile_version() -> &'static str {
    PROFILE_VERSION
}
