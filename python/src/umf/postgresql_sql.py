# SPDX-License-Identifier: MIT OR Apache-2.0
"""Feature-gated native PostgreSQL SQL parser operations."""

from __future__ import annotations

import json
from typing import Any

from . import _rust
from .rust_iceberg_schema import _controls

PROFILE = "umf.postgresql-sql-wire/1"


class PostgresqlSqlEngine:
    """Explicit Rust-owned SQL import/edit/export engine backed by libpg_query."""

    def __init__(self, *, max_work=None, meter=None, is_cancelled=None, now=None, deadline_ms=None):
        core = _rust._rust_core
        if not hasattr(core, "execute_postgresql_native_sql_wire") or not hasattr(core, "postgresql_native_sql_profile_version"):
            raise RuntimeError("umf-core was built without the native-postgresql feature")
        if core.postgresql_native_sql_profile_version() != PROFILE:
            raise RuntimeError("PostgreSQL native binding profile mismatch")
        self._core = core
        self._charge, self._host_work = _controls(max_work, meter, is_cancelled, now, deadline_ms)
        self._controls_enabled = any(value is not None for value in (max_work, meter, is_cancelled, now, deadline_ms))

    def _call(self, operation: str, **fields: Any) -> Any:
        self._host_work(1)
        request = {"profile": PROFILE, "op": f"postgresql-sql.{operation}", **fields}
        wire = json.dumps(_rust._wire(request, work=self._host_work), ensure_ascii=True, separators=(",", ":"))
        if self._controls_enabled:
            response = self._core.execute_postgresql_native_sql_wire(wire, self._charge)
        else:
            response = self._core.execute_postgresql_native_sql_wire(wire)
        self._host_work(len(response))
        result = _rust._checked_envelope(response)
        self._host_work(len(result))
        return _rust._from_wire(json.loads(result), self._host_work)

    def import_sql(self, source: str, id: str) -> Any:
        return self._call("import", source=source, id=id)

    def inspect(self, document: Any) -> Any:
        return self._call("inspect", document=document)

    def export_sql(self, document: Any) -> str:
        return self._call("export", document=document)

    def get_source(self, document: Any) -> str:
        return self._call("getSource", document=document)

    def get_node(self, document: Any, pointer: str) -> Any:
        return self._call("getNode", document=document, pointer=pointer)

    def edit_node(self, document: Any, pointer: str, text: str) -> Any:
        return self._call("editNode", document=document, pointer=pointer, text=text)

    def inspect_payload(self, payload: Any) -> Any:
        return self._call("inspectPayload", payload=payload)

    def validate_ast(self, ast: Any) -> Any:
        return self._call("validateAst", ast=ast)


def create_postgresql_sql_engine(**controls: Any) -> PostgresqlSqlEngine:
    """Create an engine available only from builds with ``native-postgresql``."""
    return PostgresqlSqlEngine(**controls)
