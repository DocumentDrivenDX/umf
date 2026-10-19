# SPDX-License-Identifier: MIT OR Apache-2.0
"""Per-call native session composition for the Weft transport boundary.

Executors must enforce every compiler obligation. These adapters manage native
identity, leases and transactions; they do not reinterpret Weft SQL or actions.
"""
from __future__ import annotations

from collections.abc import Awaitable, Callable, Mapping
from typing import Any
import copy

from . import SyncWeftTableBinding, WeftTableBinding
from .session_async import AsyncSession
from .session_policy import SessionError, SessionIdentity
from .session_sync import SyncSession

ReadExecutor = Callable[[Any, Mapping[str, object], Mapping[str, object]], Mapping[str, object]]
AsyncReadExecutor = Callable[[Any, Mapping[str, object], Mapping[str, object]], Awaitable[Mapping[str, object]]]
ActionExecutor = Callable[[Any, str, Mapping[str, object], str | None], Mapping[str, object]]
AsyncActionExecutor = Callable[[Any, str, Mapping[str, object], str | None], Awaitable[Mapping[str, object]]]


class _ResponseError(Exception):
    def __init__(self, response: Mapping[str, object]):
        self.response = response


class SyncSessionTransport:
    """Bind a trusted identity, acquiring a fresh lease for every generated call."""
    def __init__(self, session: SyncSession, identity: SessionIdentity,
                 binding: Mapping[str, object], compiler: object, read: ReadExecutor,
                 *, cursor_secret: bytes, target: str = "postgresql18",
                 action: ActionExecutor | None = None):
        self.session, self.identity = session, identity
        if binding.get("schema") not in (None, session.policy.schema):
            raise ValueError("binding schema differs from the isolated session schema")
        self.binding, self.compiler, self.read, self.action = copy.deepcopy(dict(binding)), compiler, read, action
        self.target = target
        self.secret = session.policy.cursor_secret(identity, cursor_secret)
        self.schema = SyncWeftTableBinding(binding, compiler, lambda *_: {}, target=target).schema

    def execute(self, request: Mapping[str, object]) -> Mapping[str, object]:
        if not isinstance(request, Mapping):
            return {"schema": self.schema, "error": {"code": "INVALID", "message": "request object required"}}
        try:
            with self.session.open(self.identity, read_only=request.get("kind") != "apply") as connection:
                def read(artifact, original):
                    return self.read(connection, artifact, original)

                def action(name, inputs, key):
                    return self.action(connection, name, inputs, key)

                binding = SyncWeftTableBinding(self.binding, self.compiler, read,
                                              target=self.target, cursor_secret=self.secret,
                                              action_executor=action if self.action else None)
                response = binding.execute(request)
                if "error" in response:
                    raise _ResponseError(response)  # roll back before returning a wire error
                return response
        except _ResponseError as error:
            return error.response
        except SessionError:
            return {"schema": self.schema, "error": {"code": "DENIED", "message": "native session refused"}}
        except Exception:  # noqa: BLE001 -- sanitize native connection and cleanup failures
            code = "WRITE_OUTCOME_UNKNOWN" if request.get("kind") == "apply" else "BUSY"
            return {"schema": self.schema, "error": {"code": code, "message": "native session failed"}}


class AsyncSessionTransport:
    """Async counterpart; cancellation propagates after lease cleanup completes."""
    def __init__(self, session: AsyncSession, identity: SessionIdentity,
                 binding: Mapping[str, object], compiler: object, read: AsyncReadExecutor,
                 *, cursor_secret: bytes, target: str = "postgresql18",
                 action: AsyncActionExecutor | None = None):
        self.session, self.identity = session, identity
        if binding.get("schema") not in (None, session.policy.schema):
            raise ValueError("binding schema differs from the isolated session schema")
        self.binding, self.compiler, self.read, self.action = copy.deepcopy(dict(binding)), compiler, read, action
        self.target = target
        self.secret = session.policy.cursor_secret(identity, cursor_secret)
        self.schema = SyncWeftTableBinding(binding, compiler, lambda *_: {}, target=target).schema

    async def execute(self, request: Mapping[str, object]) -> Mapping[str, object]:
        if not isinstance(request, Mapping):
            return {"schema": self.schema, "error": {"code": "INVALID", "message": "request object required"}}
        try:
            async with self.session.open(self.identity, read_only=request.get("kind") != "apply") as connection:
                async def read(artifact, original):
                    return await self.read(connection, artifact, original)

                async def action(name, inputs, key):
                    return await self.action(connection, name, inputs, key)

                binding = WeftTableBinding(self.binding, self.compiler, read,
                                          target=self.target, cursor_secret=self.secret,
                                          action_executor=action if self.action else None)
                response = await binding.execute(request)
                if "error" in response:
                    raise _ResponseError(response)
                return response
        except _ResponseError as error:
            return error.response
        except SessionError:
            return {"schema": self.schema, "error": {"code": "DENIED", "message": "native session refused"}}
        except Exception:  # noqa: BLE001 -- cancellation is a BaseException and is never retried
            code = "WRITE_OUTCOME_UNKNOWN" if request.get("kind") == "apply" else "BUSY"
            return {"schema": self.schema, "error": {"code": code, "message": "native session failed"}}
