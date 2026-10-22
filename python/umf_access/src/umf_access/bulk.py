# SPDX-License-Identifier: MIT OR Apache-2.0
"""Bulk plan delegation; engines retain original control and attempt authority."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta
from typing import Generic, Protocol, TypeVar

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


AttemptT_contra = TypeVar("AttemptT_contra", contravariant=True)
ArtifactT_contra = TypeVar("ArtifactT_contra", contravariant=True)
RecoveryT_contra = TypeVar("RecoveryT_contra", contravariant=True)
SealT_co = TypeVar("SealT_co", covariant=True)
SubmitT_co = TypeVar("SubmitT_co", covariant=True)
ControlT_co = TypeVar("ControlT_co", covariant=True)


class ManifestBulkExecutor(
    Protocol[
        AttemptT_contra,
        ArtifactT_contra,
        RecoveryT_contra,
        SealT_co,
        SubmitT_co,
        ControlT_co,
    ]
):
    """Original engine carriers, including every refusal and unknown member.

    The engine issues attempts and artifacts, checks current authorization and
    blocks fresh mutation after an unknown acknowledgement. Recovery delegates
    to its original operation; it must never repeat seal or submit.
    """

    def preview(self, *, timeout: timedelta | None = None) -> BulkPreview: ...
    def seal(
        self, *, attempt: AttemptT_contra, timeout: timedelta | None = None
    ) -> SealT_co: ...
    def submit(
        self,
        sealed: ArtifactT_contra,
        *,
        submission_key: str,
        attempt: AttemptT_contra,
        timeout: timedelta | None = None,
    ) -> SubmitT_co: ...
    def recover_control(
        self, recovery: RecoveryT_contra, *, timeout: timedelta | None = None
    ) -> ControlT_co: ...


@dataclass(frozen=True)
class ManifestBulkPlan(
    Generic[
        AttemptT_contra,
        ArtifactT_contra,
        RecoveryT_contra,
        SealT_co,
        SubmitT_co,
        ControlT_co,
    ]
):
    """Typed view of an engine-owned plan; no control result is reconstructed.

    Host-native attempt, sealed artifact, recovery and complete result types
    remain generic so this library cannot invent authority or discard extensions.
    The host retains its original status/review/lookup/reconcile/cancel client.
    """

    executor: ManifestBulkExecutor[
        AttemptT_contra,
        ArtifactT_contra,
        RecoveryT_contra,
        SealT_co,
        SubmitT_co,
        ControlT_co,
    ]

    def preview(self, *, timeout: timedelta | None = None) -> BulkPreview:
        return self.executor.preview(timeout=timeout)

    def seal(
        self, *, attempt: AttemptT_contra, timeout: timedelta | None = None
    ) -> SealT_co:
        return self.executor.seal(attempt=attempt, timeout=timeout)

    def submit(
        self,
        sealed: ArtifactT_contra,
        *,
        submission_key: str,
        attempt: AttemptT_contra,
        timeout: timedelta | None = None,
    ) -> SubmitT_co:
        return self.executor.submit(
            sealed, submission_key=submission_key, attempt=attempt, timeout=timeout
        )

    def recover_control(
        self, recovery: RecoveryT_contra, *, timeout: timedelta | None = None
    ) -> ControlT_co:
        return self.executor.recover_control(recovery, timeout=timeout)


class AsyncManifestBulkExecutor(
    Protocol[
        AttemptT_contra,
        ArtifactT_contra,
        RecoveryT_contra,
        SealT_co,
        SubmitT_co,
        ControlT_co,
    ]
):
    async def preview(self, *, timeout: timedelta | None = None) -> BulkPreview: ...
    async def seal(
        self, *, attempt: AttemptT_contra, timeout: timedelta | None = None
    ) -> SealT_co: ...
    async def submit(
        self,
        sealed: ArtifactT_contra,
        *,
        submission_key: str,
        attempt: AttemptT_contra,
        timeout: timedelta | None = None,
    ) -> SubmitT_co: ...
    async def recover_control(
        self, recovery: RecoveryT_contra, *, timeout: timedelta | None = None
    ) -> ControlT_co: ...


@dataclass(frozen=True)
class AsyncManifestBulkPlan(
    Generic[
        AttemptT_contra,
        ArtifactT_contra,
        RecoveryT_contra,
        SealT_co,
        SubmitT_co,
        ControlT_co,
    ]
):
    """Async original-carrier delegation; cancellation never starts another call."""

    executor: AsyncManifestBulkExecutor[
        AttemptT_contra,
        ArtifactT_contra,
        RecoveryT_contra,
        SealT_co,
        SubmitT_co,
        ControlT_co,
    ]

    async def preview(self, *, timeout: timedelta | None = None) -> BulkPreview:
        return await self.executor.preview(timeout=timeout)

    async def seal(
        self, *, attempt: AttemptT_contra, timeout: timedelta | None = None
    ) -> SealT_co:
        return await self.executor.seal(attempt=attempt, timeout=timeout)

    async def submit(
        self,
        sealed: ArtifactT_contra,
        *,
        submission_key: str,
        attempt: AttemptT_contra,
        timeout: timedelta | None = None,
    ) -> SubmitT_co:
        return await self.executor.submit(
            sealed, submission_key=submission_key, attempt=attempt, timeout=timeout
        )

    async def recover_control(
        self, recovery: RecoveryT_contra, *, timeout: timedelta | None = None
    ) -> ControlT_co:
        return await self.executor.recover_control(recovery, timeout=timeout)
