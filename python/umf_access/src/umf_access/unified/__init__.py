# SPDX-License-Identifier: MIT OR Apache-2.0
"""Sync and async host bindings for the generated UMF access transport."""
from __future__ import annotations

import inspect
from collections.abc import Awaitable, Callable, Mapping

from ._binding import UnifiedAccessError, _TableBinding
from .head_session import (
    observe_table_head,
    observe_table_head_async,
    verify_table_correspondence,
    verify_table_correspondence_async,
)
from .native_binding import NativeTableBinding, SyncNativeTableBinding
from .session_async import AsyncSession
from .session_policy import SessionError, SessionIdentity, SessionPolicy
from .session_psycopg2 import Psycopg2Session
from .session_sqlalchemy import AsyncSQLAlchemySession, SQLAlchemySession
from .session_sync import SyncSession
from .table_reads import AsyncTableReader, SyncTableReader
from .table_writes import AsyncTableWriter, SyncTableWriter, WriteOutcomeUnknown


class WeftTableBinding(_TableBinding):
    """Async Weft compiler binding with host-owned execution callbacks."""

    def __init__(
        self,
        binding: Mapping[str, object],
        compiler: object,
        execute: Callable[[Mapping[str, object], Mapping[str, object]], Awaitable[Mapping[str, object]]],
        *,
        target: str,
        action_executor: Callable[[str, Mapping[str, object], str | None], Awaitable[Mapping[str, object]]] | None = None,
        at_least: Callable[[str], Awaitable[bool]] | None = None,
        page_size: int = 100,
        cursor_secret: bytes | None = None,
    ) -> None:
        super().__init__(binding, compiler, target=target,
                         page_size=page_size, cursor_secret=cursor_secret)
        self._execute = execute
        self._action_executor = action_executor
        self._at_least = at_least

    async def execute(self, request: Mapping[str, object]) -> Mapping[str, object]:
        """Execute one generated request; all failures use the shared response shape."""
        if not isinstance(request, Mapping):
            return UnifiedAccessError("INVALID", "request object required").as_response(self.schema)
        try:
            kind = self._check_request(request)
            if kind == "apply":
                return await self._apply(request)
            return await self._read(request)
        except UnifiedAccessError as error:
            return error.as_response(self.schema)

    async def _read(self, request: Mapping[str, object]) -> Mapping[str, object]:
        freshness = request.get("at_least")
        if freshness is not None:
            if type(freshness) is not str:
                raise UnifiedAccessError("INVALID", "freshness token must be text")
            if self._at_least is None:
                raise UnifiedAccessError("UNSUPPORTED", "host cannot establish requested freshness")
            if not await self._at_least(freshness):
                raise UnifiedAccessError("NOT_YET_CURRENT", "requested freshness was not established")
        artifact, host_request, query, size, cursor_scope = self._prepare_read(request)
        try:
            response = await self._execute(artifact, host_request)
        except UnifiedAccessError:
            raise
        except Exception:  # noqa: BLE001 -- sanitize executor errors
            raise UnifiedAccessError("BUSY", "host read execution failed") from None
        return self._finish_read(response, query, size, cursor_scope)

    async def _apply(self, request: Mapping[str, object]) -> Mapping[str, object]:
        if self._action_executor is None:
            raise UnifiedAccessError("UNSUPPORTED", "host has no trusted action executor")
        action, inputs, key = self._prepare_action(request)
        try:
            response = await self._action_executor(action, inputs, key)
        except UnifiedAccessError:
            raise
        except Exception:  # noqa: BLE001 -- no retry after dispatch
            raise UnifiedAccessError("WRITE_OUTCOME_UNKNOWN", "action response was lost after dispatch") from None
        return self._finish_action(response)


def _sync_result(value):
    if inspect.isawaitable(value):
        if inspect.iscoroutine(value):
            value.close()
        raise UnifiedAccessError("INVALID", "synchronous callback returned an awaitable")
    return value


class SyncWeftTableBinding(_TableBinding):
    """Synchronous Weft binding; never runs an event loop."""

    def __init__(
        self,
        binding: Mapping[str, object],
        compiler: object,
        execute: Callable[[Mapping[str, object], Mapping[str, object]], Mapping[str, object]],
        *,
        target: str,
        action_executor: Callable[[str, Mapping[str, object], str | None], Mapping[str, object]] | None = None,
        at_least: Callable[[str], bool] | None = None,
        page_size: int = 100,
        cursor_secret: bytes | None = None,
    ) -> None:
        if any(inspect.iscoroutinefunction(callback) or inspect.iscoroutinefunction(getattr(callback, "__call__", None))  # noqa: B004 -- inspect async __call__, not callability
               for callback in (execute, action_executor, at_least)):
            raise TypeError("synchronous callbacks required")
        super().__init__(binding, compiler, target=target,
                         page_size=page_size, cursor_secret=cursor_secret)
        self._execute = execute
        self._action_executor = action_executor
        self._at_least = at_least

    def execute(self, request: Mapping[str, object]) -> Mapping[str, object]:
        """Execute one generated request; all failures use the shared response shape."""
        if not isinstance(request, Mapping):
            return UnifiedAccessError("INVALID", "request object required").as_response(self.schema)
        try:
            kind = self._check_request(request)
            if kind == "apply":
                return self._apply(request)
            return self._read(request)
        except UnifiedAccessError as error:
            return error.as_response(self.schema)

    def _read(self, request: Mapping[str, object]) -> Mapping[str, object]:
        freshness = request.get("at_least")
        if freshness is not None:
            if type(freshness) is not str:
                raise UnifiedAccessError("INVALID", "freshness token must be text")
            if self._at_least is None:
                raise UnifiedAccessError("UNSUPPORTED", "host cannot establish requested freshness")
            if not _sync_result(self._at_least(freshness)):
                raise UnifiedAccessError("NOT_YET_CURRENT", "requested freshness was not established")
        artifact, host_request, query, size, cursor_scope = self._prepare_read(request)
        try:
            response = _sync_result(self._execute(artifact, host_request))
        except UnifiedAccessError:
            raise
        except Exception:  # noqa: BLE001 -- sanitize executor errors
            raise UnifiedAccessError("BUSY", "host read execution failed") from None
        return self._finish_read(response, query, size, cursor_scope)

    def _apply(self, request: Mapping[str, object]) -> Mapping[str, object]:
        if self._action_executor is None:
            raise UnifiedAccessError("UNSUPPORTED", "host has no trusted action executor")
        action, inputs, key = self._prepare_action(request)
        try:
            response = _sync_result(self._action_executor(action, inputs, key))
        except UnifiedAccessError:
            raise
        except Exception:  # noqa: BLE001 -- no retry after dispatch
            raise UnifiedAccessError("WRITE_OUTCOME_UNKNOWN", "action response was lost after dispatch") from None
        return self._finish_action(response)


__all__ = [
    "AsyncSQLAlchemySession",
    "AsyncSession",
    "AsyncTableReader",
    "AsyncTableWriter",
    "NativeTableBinding",
    "Psycopg2Session",
    "SQLAlchemySession",
    "SessionError",
    "SessionIdentity",
    "SessionPolicy",
    "SyncNativeTableBinding",
    "SyncSession",
    "SyncTableReader",
    "SyncTableWriter",
    "SyncWeftTableBinding",
    "UnifiedAccessError",
    "WeftTableBinding",
    "WriteOutcomeUnknown",
    "observe_table_head",
    "observe_table_head_async",
    "verify_table_correspondence",
    "verify_table_correspondence_async",
]
