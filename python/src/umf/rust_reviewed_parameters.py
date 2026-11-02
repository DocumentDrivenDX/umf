# SPDX-License-Identifier: MIT OR Apache-2.0
"""Public narrow bridge to Rust's reviewed SQL placeholder scanner."""

from ._rust import _rust_core

access_reviewed_parameter_profile_version = getattr(
    _rust_core, "access_reviewed_parameter_profile_version", None
)
ReviewedParameterScanner = getattr(_rust_core, "ReviewedParameterScanner", None)

__all__ = [
    "ReviewedParameterScanner",
    "access_reviewed_parameter_profile_version",
]
