"""Raw atomic bulk plans. No durable manifest, seal, submit or retry surface."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta
from typing import Protocol

from .protocols import NativeOutcomeDetails, Receipt
from .types import StrictModel


@dataclass(frozen=True)
class BulkPreview:
    selected: tuple[StrictModel, ...]
    statement_summary: str


@dataclass(frozen=True)
class BulkOutcome:
    selected: int
    changed: int
    receipt: Receipt
    original: NativeOutcomeDetails


class AtomicBulkExecutor(Protocol):
    def preview(self, *, timeout: timedelta | None = None) -> BulkPreview: ...
    def execute(self, *, timeout: timedelta | None = None) -> BulkOutcome: ...


@dataclass(frozen=True)
class AtomicBulkPlan:
    executor: AtomicBulkExecutor

    def preview(self, *, timeout: timedelta | None = None) -> BulkPreview:
        return self.executor.preview(timeout=timeout)

    def execute(self, *, timeout: timedelta | None = None) -> BulkOutcome:
        return self.executor.execute(timeout=timeout)


class AsyncAtomicBulkExecutor(Protocol):
    async def preview(self, *, timeout: timedelta | None = None) -> BulkPreview: ...
    async def execute(self, *, timeout: timedelta | None = None) -> BulkOutcome: ...


@dataclass(frozen=True)
class AsyncAtomicBulkPlan:
    executor: AsyncAtomicBulkExecutor

    async def preview(self, *, timeout: timedelta | None = None) -> BulkPreview:
        return await self.executor.preview(timeout=timeout)

    async def execute(self, *, timeout: timedelta | None = None) -> BulkOutcome:
        return await self.executor.execute(timeout=timeout)
