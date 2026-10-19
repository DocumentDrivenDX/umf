# SPDX-License-Identifier: MIT OR Apache-2.0
"""Administrative table lifecycle and head observation; no implicit pool or driver."""
from .catalog import CatalogError, verify_native_catalog
from .ledger import apply_table_migration, inspect_table_history
from .head import read_table_head
from .privileges import verify_native_privileges
from .roles import verify_native_role_scope

__all__ = ["CatalogError", "apply_table_migration", "inspect_table_history", "read_table_head", "verify_native_catalog", "verify_native_privileges", "verify_native_role_scope"]
