# SPDX-License-Identifier: MIT OR Apache-2.0
"""Host-owned PostgreSQL/Lakebase sync and async read targets.

Every call uses the same checked catalog program and native admission boundary.
Connections, credentials and application schema selection remain with the host.
"""

from __future__ import annotations

import hashlib
import json
import math
from collections.abc import AsyncGenerator, Generator
from dataclasses import dataclass
from datetime import timedelta
from typing import Any, TypeVar

from pydantic import BaseModel

from .adoption import TargetIdentity
from .pages import ReadObligationUnmet
from .postgres_read import (
    ReadContinuation,
    ReadPage,
    TimedOut,
    execute_page,
    execute_page_async,
    execute_read,
    execute_read_async,
    execute_stream,
    execute_stream_async,
    verify_read,
    verify_read_async,
)

# Explicit public re-export is required by static consumers.
from .protocols import AsyncReadTarget as AsyncReadTarget  # noqa: PLC0414

# Explicit public re-export is required by static consumers.
from .protocols import ReadTarget as ReadTarget  # noqa: PLC0414
from .reviewed import CatalogRead

P = TypeVar("P", bound=BaseModel)
R = TypeVar("R", bound=BaseModel)


class TargetMismatch(ValueError):
    pass


class NotCompiledForTarget(ValueError):
    pass


@dataclass(frozen=True)
class PostgresConfiguration:
    app_schema: str
    binding_sha256: str
    server_versions: tuple[int, ...]
    default_timeout: timedelta
    backend_id: str = "weft-postgresql"
    backend_version: str = "raw-read/0.1"
    target_profile: str = "weft.raw-read/0.1"

    def __post_init__(self) -> None:
        if (
            not self.app_schema
            or not self.server_versions
            or any(
                type(v) is not int or not 180000 <= v < 190000
                for v in self.server_versions
            )
        ):
            raise TargetMismatch(
                "explicit application schema and pinned PostgreSQL18 versions required"
            )
        if len(self.binding_sha256) != 64 or any(
            c not in "0123456789abcdef" for c in self.binding_sha256
        ):
            raise TargetMismatch("exact binding SHA-256 required")
        _milliseconds(self.default_timeout, self.default_timeout)


def binding_digest(binding: object) -> str:
    return hashlib.sha256(
        json.dumps(
            binding,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            allow_nan=False,
        ).encode()
    ).hexdigest()


def _milliseconds(timeout: timedelta | None, default: timedelta) -> int:
    value = default if timeout is None else timeout
    if (
        type(value) is not timedelta
        or not math.isfinite(value.total_seconds())
        or value.total_seconds() < 0
    ):
        raise ValueError("positive finite target deadline required")
    if value.total_seconds() == 0:
        raise TimedOut("deadline expired before dispatch")
    milliseconds = math.ceil(value.total_seconds() * 1000)
    if milliseconds > 2_147_483_647:
        raise ValueError("deadline exceeds native PostgreSQL timeout bound")
    return milliseconds


class _PostgresBase:
    kind = "postgresql"
    profile = "postgresql18"

    def __init__(
        self,
        connection: Any,
        configuration: PostgresConfiguration,
        catalog_entries: tuple[CatalogRead[Any, Any], ...] = (),
    ):
        self.connection, self.configuration, self.catalog_entries = (
            connection,
            configuration,
            catalog_entries,
        )

    def identity(self) -> TargetIdentity:
        version = self.connection.info.server_version
        if version not in self.configuration.server_versions:
            raise TargetMismatch(
                "native server version is outside the qualified pinned set"
            )
        return TargetIdentity(
            self.kind,
            self.configuration.backend_id,
            self.configuration.backend_version,
            self.configuration.target_profile,
            self.configuration.binding_sha256,
            (("postgresql", str(version)),),
        )

    def _admit(self, entry: CatalogRead[P, R], timeout: timedelta | None) -> int:
        milliseconds = _milliseconds(timeout, self.configuration.default_timeout)
        self.identity()
        artifact = entry.artifact()
        if (
            artifact["target"] != self.profile
            or binding_digest(artifact["binding"]) != self.configuration.binding_sha256
        ):
            raise NotCompiledForTarget(
                "entry target or binding differs from host target"
            )
        return milliseconds


class PostgresTarget(_PostgresBase):
    def verify(self) -> None:
        self.identity()
        if not self.catalog_entries:
            raise TargetMismatch(
                "explicit catalog entries required for eager verification"
            )
        for entry in self.catalog_entries:
            try:
                verify_read(
                    self.connection,
                    entry,
                    app_schema=self.configuration.app_schema,
                    target=self.profile,
                    timeout_ms=self._admit(entry, None),
                )
            except ReadObligationUnmet as error:
                raise TargetMismatch(str(error)) from error

    def read(
        self,
        entry: CatalogRead[P, R],
        parameters: P,
        *,
        timeout: timedelta | None = None,
    ) -> list[R]:
        return execute_read(
            self.connection,
            entry,
            parameters,
            app_schema=self.configuration.app_schema,
            target=self.profile,
            timeout_ms=self._admit(entry, timeout),
        )

    def page(
        self,
        entry: CatalogRead[P, R],
        parameters: P,
        *,
        after: ReadContinuation | None = None,
        timeout: timedelta | None = None,
    ) -> ReadPage[R]:
        return execute_page(
            self.connection,
            entry,
            parameters,
            app_schema=self.configuration.app_schema,
            target=self.profile,
            after=after,
            timeout_ms=self._admit(entry, timeout),
        )

    def stream(
        self,
        entry: CatalogRead[P, R],
        parameters: P,
        *,
        max_rows: int,
        page_size: int | None = None,
        timeout: timedelta | None = None,
    ) -> Generator[R, None, None]:
        return execute_stream(
            self.connection,
            entry,
            parameters,
            app_schema=self.configuration.app_schema,
            target=self.profile,
            max_rows=max_rows,
            page_size=page_size,
            timeout_ms=self._admit(entry, timeout),
        )


class LakebaseTarget(PostgresTarget):
    kind = "lakebase"
    profile = "lakebase18"


class AsyncPostgresTarget(_PostgresBase):
    async def verify(self) -> None:
        self.identity()
        if not self.catalog_entries:
            raise TargetMismatch(
                "explicit catalog entries required for eager verification"
            )
        for entry in self.catalog_entries:
            try:
                await verify_read_async(
                    self.connection,
                    entry,
                    app_schema=self.configuration.app_schema,
                    target=self.profile,
                    timeout_ms=self._admit(entry, None),
                )
            except ReadObligationUnmet as error:
                raise TargetMismatch(str(error)) from error

    async def read(
        self,
        entry: CatalogRead[P, R],
        parameters: P,
        *,
        timeout: timedelta | None = None,
    ) -> list[R]:
        return await execute_read_async(
            self.connection,
            entry,
            parameters,
            app_schema=self.configuration.app_schema,
            target=self.profile,
            timeout_ms=self._admit(entry, timeout),
        )

    async def page(
        self,
        entry: CatalogRead[P, R],
        parameters: P,
        *,
        after: ReadContinuation | None = None,
        timeout: timedelta | None = None,
    ) -> ReadPage[R]:
        return await execute_page_async(
            self.connection,
            entry,
            parameters,
            app_schema=self.configuration.app_schema,
            target=self.profile,
            after=after,
            timeout_ms=self._admit(entry, timeout),
        )

    def stream(
        self,
        entry: CatalogRead[P, R],
        parameters: P,
        *,
        max_rows: int,
        page_size: int | None = None,
        timeout: timedelta | None = None,
    ) -> AsyncGenerator[R, None]:
        return execute_stream_async(
            self.connection,
            entry,
            parameters,
            app_schema=self.configuration.app_schema,
            target=self.profile,
            max_rows=max_rows,
            page_size=page_size,
            timeout_ms=self._admit(entry, timeout),
        )


class AsyncLakebaseTarget(AsyncPostgresTarget):
    kind = "lakebase"
    profile = "lakebase18"
