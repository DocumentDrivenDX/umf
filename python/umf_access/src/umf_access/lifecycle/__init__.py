# SPDX-License-Identifier: MIT OR Apache-2.0
"""Explicit administrative table lifecycle components; no implicit pool or driver."""
from .catalog import CatalogError, verify_native_catalog

__all__ = ["CatalogError", "verify_native_catalog"]
