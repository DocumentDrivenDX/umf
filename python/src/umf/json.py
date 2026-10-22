# SPDX-License-Identifier: MIT OR Apache-2.0
"""Rust-owned JSON admission matching UMF's interoperable numeric boundary."""

from ._rust import copy_json

__all__ = ["MAX_DEPTH", "MAX_SAFE_INTEGER", "MAX_TEXT_LENGTH", "MAX_VALUES", "copy_json"]

MAX_DEPTH = 128
MAX_VALUES = 100_000
MAX_TEXT_LENGTH = 4_000_000
MAX_SAFE_INTEGER = 2**53 - 1
