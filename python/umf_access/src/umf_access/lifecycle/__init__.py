# SPDX-License-Identifier: MIT OR Apache-2.0
"""Explicit administrative table lifecycle components; no implicit pool or driver."""
from .catalog import CatalogError, verify_native_catalog
from .roles import verify_native_role_scope

__all__ = ["CatalogError", "verify_native_catalog", "verify_native_role_scope"]
