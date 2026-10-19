# SPDX-License-Identifier: MIT OR Apache-2.0
"""Typed command catalog dispatch. Plans are supplied by the selected target."""

from __future__ import annotations

from collections.abc import Awaitable, Mapping
from dataclasses import dataclass
from datetime import timedelta
from typing import Any, Protocol, TypeVar, overload

from .adoption import TargetIdentity
from .catalog import Argument, CatalogError, NotCompiledForTarget, TargetPin
from .native_program import NativeProgram
from .types import MISSING, ActionRef

# Preserve the published generic parameter spelling and variance.
PlanT = TypeVar("PlanT", covariant=True)  # noqa: PLC0105


@dataclass(frozen=True)
class CommandVariant:
    presence: tuple[str, ...]
    pin: TargetPin
    program: NativeProgram
    action: ActionRef[Any, Any]
    parameters: tuple[tuple[str, str, str | None], ...]


class BulkTarget(Protocol[PlanT]):
    def identity(self) -> TargetIdentity: ...
    def plan(
        self,
        entry: CommandVariant,
        params: Mapping[str, object],
        *,
        timeout: timedelta | None = None,
    ) -> PlanT: ...


class AsyncBulkTarget(Protocol[PlanT]):
    def identity(self) -> TargetIdentity: ...
    async def plan(
        self, entry: CommandVariant, params: Mapping[str, object], *,
        timeout: timedelta | None = None,
    ) -> PlanT: ...


@dataclass(frozen=True)
class CommandPlan:
    name: str
    arguments: tuple[Argument, ...]
    variants: tuple[CommandVariant, ...]

    @overload
    def run(self, target: AsyncBulkTarget[PlanT], values: Mapping[str, object], *, timeout: timedelta | None = None) -> Awaitable[PlanT]: ...
    @overload
    def run(self, target: BulkTarget[PlanT], values: Mapping[str, object], *, timeout: timedelta | None = None) -> PlanT: ...
    def run(
        self,
        target: BulkTarget[PlanT] | AsyncBulkTarget[PlanT],
        values: Mapping[str, object],
        *,
        timeout: timedelta | None = None,
    ) -> PlanT | Awaitable[PlanT]:
        if set(values) != {a.name for a in self.arguments}:
            raise CatalogError("exact command argument inventory required")
        checked = {a.name: a.validate(values[a.name]) for a in self.arguments}
        presence = tuple(
            a.name
            for a in self.arguments
            if a.optional and checked[a.name] is not MISSING
        )
        identity = target.identity()
        matching = [
            v
            for v in self.variants
            if v.presence == presence and v.pin.matches(identity)
        ]
        if len(matching) != 1:
            raise NotCompiledForTarget(
                "no unique compiled command for target and presence"
            )
        entry = matching[0]
        entry.program.bind(entry.action)
        params = {
            name: (
                getattr(checked[source], component)
                if component is not None
                else checked[source]
            )
            for name, source, component in entry.parameters
        }
        return target.plan(entry, params, timeout=timeout)
