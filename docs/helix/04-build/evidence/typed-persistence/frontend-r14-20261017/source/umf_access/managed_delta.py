"""Caller-owned managed Delta mutation target. No native capability is implied.

The initial managed profile is synchronous. A qualified native owner supplies
current source/identity/role/deployment fencing and exact commit metadata; the
SDK never creates a connection, synthesizes a receipt, retries or replays.
"""

from __future__ import annotations

from collections.abc import Mapping
from contextlib import AbstractContextManager
from dataclasses import dataclass
from datetime import timedelta
from typing import Any, Protocol

from .adoption import TargetIdentity
from .bulk import AtomicBulkPlan
from .commands import CommandVariant
from .managed_actions import ManagedDeltaActionExecutor
from .managed_bulk import ManagedAtomicBulkExecutor
from .native_program import NativeProgram
from .protocols import ActionRefused, Receipt


class ManagedNativeScope(Protocol):
    store: str
    epoch: str
    authenticated: str
    effective: str
    attribution_json: str
    allowed: bool
    write_submitted: bool
    commit_submitted: bool
    rollback_confirmed: bool

    def require_exact_commit_receipt(self) -> None:
        """Refuse unless original qualified native metadata identifies this commit.

        A boolean, label, latest history version or ledger correlation is not
        evidence. The native owner retains its original capability/admission
        proof in this scope through settlement, including the human mapping.
        """
        ...

    def recheck(self) -> None: ...
    def query(
        self, sql: str, parameters: tuple[object, ...]
    ) -> list[tuple[Any, ...]]: ...
    def execute(self, sql: str, parameters: tuple[object, ...]) -> None: ...
    def commit(self, *, markers_json: str) -> Receipt: ...


class ManagedDeltaAdmission(Protocol):
    def identity(self, connection: Any) -> TargetIdentity:
        """Observe current native platform/target identity; no configured label substitute."""
        ...

    def hold(
        self,
        connection: Any,
        program: Mapping[str, Any],
        request: str,
        *,
        deadline: float,
    ) -> AbstractContextManager[ManagedNativeScope]:
        """Require idle caller connection and retain original native fence until settled.

        Entry proves original source/native table identities, current actor and
        roles, settings, Key custody and deployed lifecycle/sole-writer fence.
        Exit positively settles rollback, including validation/preview. It must
        never close, reconnect or replay the caller connection. Uncertain exit
        keeps original attempt custody and is quarantined by the executor.
        """
        ...

    def quarantine(self, original: object, error: BaseException) -> None: ...


@dataclass(frozen=True)
class UnityCatalogConfiguration:
    identity: TargetIdentity
    default_timeout: timedelta

    def __post_init__(self) -> None:
        if (
            type(self.default_timeout) is not timedelta
            or not 0 < self.default_timeout.total_seconds() <= 60
        ):
            raise ActionRefused("FINITE_MANAGED_DELTA_DEADLINE_REQUIRED")


class UnityCatalogTarget:
    """Mutation-only managed target; reads/search have distinct original profiles.

    Programs are immutable source-bound catalog artifacts. No asynchronous or
    replay capability is supplied by this target.
    """

    def __init__(
        self,
        connection: Any,
        catalog_target: UnityCatalogConfiguration,
        admission: ManagedDeltaAdmission,
        *,
        programs: tuple[NativeProgram, ...] = (),
    ):
        self.connection, self.configuration, self.admission = (
            connection,
            catalog_target,
            admission,
        )
        self._executor = ManagedDeltaActionExecutor(
            connection,
            programs,
            admission,
            default_timeout=catalog_target.default_timeout,
        )

    def identity(self) -> TargetIdentity:
        return self.admission.identity(self.connection)

    def verify(self) -> None:
        if self.identity() != self.configuration.identity:
            raise ActionRefused("MANAGED_TARGET_IDENTITY_CHANGED")

    def invoke(self, action, input, *, timeout=None):
        self.verify()
        return self._executor.invoke(action, input, timeout=timeout)

    def validate(self, action, input, *, timeout=None):
        self.verify()
        return self._executor.validate(action, input, timeout=timeout)

    def plan(
        self,
        entry: CommandVariant,
        params: Mapping[str, object],
        *,
        timeout: timedelta | None = None,
    ) -> AtomicBulkPlan:
        self.verify()
        if not entry.pin.matches(self.identity()):
            raise ActionRefused("NOT_COMPILED_FOR_TARGET")
        budget = self.configuration.default_timeout if timeout is None else timeout
        if type(budget) is not timedelta or not 0 < budget.total_seconds() <= 60:
            raise ActionRefused("FINITE_MANAGED_BULK_DEADLINE_REQUIRED")
        return ManagedAtomicBulkExecutor(
            self.connection, entry.program, entry.action, params, self.admission, budget
        ).plan()
