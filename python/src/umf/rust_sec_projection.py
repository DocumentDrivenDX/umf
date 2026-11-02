# SPDX-License-Identifier: MIT OR Apache-2.0
"""Explicit Rust-selected SEC projection profile 2.0.0."""

from __future__ import annotations

from . import _rust

_PROFILE = "umf-sec-projection/2.0.0"


class SecProjectionError(ValueError):
    """Projection refusal with the core error fields preserved."""

    def __init__(self, name: str, code: str | None, path: str | None, message: str) -> None:
        super().__init__(message)
        self.name = name
        self.code = code
        self.path = path
        self.message = message


def profile_version() -> str:
    """Identify this source-selected Rust projection route."""
    return _PROFILE


def _project(function, input: str, source_id: str) -> str:
    try:
        return function(input, source_id)
    except _rust._rust_core.SecProjectionError as error:
        raise SecProjectionError(
            getattr(error, "name", "Error"),
            getattr(error, "code", None),
            getattr(error, "path", None),
            getattr(error, "message", str(error)),
        ) from error


def project_sec_submissions(input: str, source_id: str) -> str:
    """Project supplied SEC submissions JSON without retrieval or shard merging."""
    return _project(_rust._rust_core.project_sec_submissions, input, source_id)


def project_sec_company_facts(input: str, source_id: str) -> str:
    """Project supplied SEC Company Facts JSON without aggregation."""
    return _project(_rust._rust_core.project_sec_company_facts, input, source_id)
