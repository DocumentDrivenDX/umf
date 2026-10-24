# SPDX-License-Identifier: MIT OR Apache-2.0
"""Compatibility entrypoints backed by the Rust constraint engine."""

from ._rust import check_constraint_program as _check_program
from ._rust import run_core_constraints

__all__ = ["_check_program", "run_core_constraints"]
