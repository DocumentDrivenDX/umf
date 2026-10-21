# SPDX-License-Identifier: MIT OR Apache-2.0
"""Administrative table lifecycle and head observation; no implicit pool or driver."""
from .catalog import CatalogError, verify_native_catalog
from .concurrent import apply_concurrent_indexes
from .correspondence import prepare_table_correspondence
from .head import prepare_table_head, read_table_head
from .ledger import apply_table_migration, inspect_table_history
from .mixed import apply_mixed_migration
from .privileges import verify_native_privileges
from .roles import verify_native_role_scope

__all__ = ["CatalogError", "apply_concurrent_indexes", "apply_mixed_migration", "apply_table_migration", "inspect_table_history", "prepare_table_correspondence", "prepare_table_head", "read_table_head", "verify_native_catalog", "verify_native_privileges", "verify_native_role_scope"]
