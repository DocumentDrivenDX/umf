# SPDX-License-Identifier: MIT OR Apache-2.0
"""Trusted host identity and connection-local policy; never supplied on the wire."""
from __future__ import annotations

import hashlib
import hmac
import json
from collections.abc import Mapping
from dataclasses import dataclass
from types import MappingProxyType
from typing import Literal


class SessionError(RuntimeError):
    """A native session could not establish or preserve its declared authority."""


def _tuple_row(cursor):
    """Psycopg3 row-factory protocol without importing an optional driver."""
    return tuple


@dataclass(frozen=True)
class SessionIdentity:
    kind: Literal["person", "batch"]
    subject: str

    def __post_init__(self) -> None:
        if self.kind not in ("person", "batch") or type(self.subject) is not str or not self.subject:
            raise ValueError("an explicit person or batch subject is required")


@dataclass(frozen=True)
class SessionPolicy:
    """Host-authenticated subject registry, isolated schema and bounded timeouts.

    Entries authorize role selection, not authentication. Construct identities
    only after host authentication, outside the generated request payload.
    Batch subjects have a separate registry and may not share person roles.
    """
    people: Mapping[str, str]
    batches: Mapping[str, str]
    schema: str
    statement_timeout_ms: int = 30_000
    lock_timeout_ms: int = 5_000
    catalog_only: bool = False

    def __post_init__(self) -> None:
        if type(self.catalog_only) is not bool:
            raise ValueError('catalog_only must be bool')
        for name in ("people", "batches"):
            entries = dict(getattr(self, name))
            if any(type(k) is not str or not k or not _identifier(v) for k, v in entries.items()):
                raise ValueError("subject registries require nonempty subjects and native role names")
            object.__setattr__(self, name, MappingProxyType(entries))
        if not _identifier(self.schema) or self.schema.startswith("pg_"):
            raise ValueError("a non-system plugin schema is required")
        if len(set(self.people.values())) != len(self.people):
            raise ValueError("each person requires a distinct native role")
        if set(self.people.values()) & set(self.batches.values()):
            raise ValueError("person and batch roles must be disjoint")
        for value in (self.statement_timeout_ms, self.lock_timeout_ms):
            if type(value) is not int or not 1 <= value <= 300_000:
                raise ValueError("session timeouts must be 1..300000 milliseconds")

    def role(self, identity: SessionIdentity) -> str:
        if not isinstance(identity, SessionIdentity):
            raise SessionError("trusted session identity required")
        registry = self.people if identity.kind == "person" else self.batches
        role = registry.get(identity.subject)
        if role is None:
            raise SessionError("subject has no grant for this session kind")
        return role

    def settings(self, identity: SessionIdentity) -> dict[str, str]:
        return {
            "role": self.role(identity),
            "search_path": 'pg_catalog' if self.catalog_only else 'pg_catalog,"' + self.schema.replace('"', '""') + '"',
            "row_security": "on",
            "statement_timeout": str(self.statement_timeout_ms),
            "lock_timeout": str(self.lock_timeout_ms),
        }

    def cursor_secret(self, identity: SessionIdentity, secret: bytes) -> bytes:
        """Bind page tokens to the authenticated authority and policy, across calls."""
        if type(secret) is not bytes or len(secret) < 32:
            raise ValueError("cursor root secret requires at least 256 bits")
        scope = json.dumps([identity.kind, identity.subject, self.settings(identity)], sort_keys=True)
        return hmac.new(secret, scope.encode(), hashlib.sha256).digest()


def _identifier(value: object) -> bool:
    return type(value) is str and bool(value) and "\x00" not in value and len(value.encode()) <= 63


# Fully qualified catalog references prevent caller search_path from changing admission.
ROLE_CHECK = """SELECT current_user, session_user, r.rolsuper, r.rolbypassrls
FROM pg_catalog.pg_roles AS r WHERE r.rolname = current_user"""
SET_LOCAL = "SELECT pg_catalog.set_config(%s, %s, true)"
GET_SETTING = "SELECT pg_catalog.current_setting(%s)"


def verify_role(row: object, expected: str, session_user: str | None = None) -> str:
    if (not isinstance(row, (tuple, list)) or len(row) != 4
            or row[0] != expected or type(row[1]) is not str
            or session_user is not None and row[1] != session_user
            or row[2] is not False or row[3] is not False):
        raise SessionError("effective role differs or bypasses native row security")
    return row[1]
