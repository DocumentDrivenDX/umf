# SPDX-License-Identifier: MIT OR Apache-2.0
"""Host-neutral execution boundary for source-verified table migrations.

The host owns credentials, target identity, locks, approval custody and native
transactions. UMF owns the verified plan and ordered phase state machine. A
host must provide whole-phase transactions; per-statement receipts do not meet
this protocol.
"""
from __future__ import annotations

from contextlib import AbstractContextManager, contextmanager
from dataclasses import dataclass
import hashlib
import re
from typing import Any, Protocol, runtime_checkable

from .approval import ApprovalBinding, ApprovalReceipt, TargetIdentity
from .catalog import CatalogError


@dataclass(frozen=True, slots=True)
class HostCapabilities:
    """Verified host guarantees required by the selected migration profile."""

    exclusive_custody: bool
    authenticated_target_identity: bool
    durable_approval_custody: bool
    durable_effect_fence: bool
    whole_required_phase_atomicity: bool
    durable_phase_receipts: bool
    exact_native_observation: bool
    uncertain_outcome_observation: bool
    atomic_final_publication: bool
    concurrent_autocommit: bool

    def require(self, *, uses_concurrent: bool) -> None:
        required = (
            self.exclusive_custody,
            self.authenticated_target_identity,
            self.durable_approval_custody,
            self.durable_effect_fence,
            self.whole_required_phase_atomicity,
            self.durable_phase_receipts,
            self.exact_native_observation,
            self.uncertain_outcome_observation,
            self.atomic_final_publication,
        )
        if any(value is not True for value in required):
            raise CatalogError("host-capability-unsupported")
        if uses_concurrent and self.concurrent_autocommit is not True:
            raise CatalogError("host-capability-unsupported")


@dataclass(frozen=True, slots=True)
class MigrationRequest:
    """Plan and caller-bound predecessor data needed to open host custody."""

    plan: dict[str, Any]
    expected_head: str
    file_digest: str
    binding: ApprovalBinding | None = None


@dataclass(frozen=True, slots=True)
class PhaseReceipt:
    """Source-bound evidence of the completed contiguous phase prefix."""

    phase_index: int
    phase_digest: str
    completed_steps: tuple[str, ...]
    prefix_witness: dict[str, Any]
    state: str = "complete"

    def verify(self, phases: list[dict[str, Any]], plan: dict[str, Any]) -> None:
        from .progress import _phase_digest

        if (type(self.phase_index) is not int or not 0 <= self.phase_index <= len(phases)
                or self.state not in {"ready", "intent", "complete"}
                or type(self.completed_steps) is not tuple
                or type(self.prefix_witness) is not dict):
            raise CatalogError("progress-state-mismatch")
        expected_steps = tuple(step for phase in phases[:self.phase_index]
                               for step in phase["steps"])
        if self.completed_steps != expected_steps:
            raise CatalogError("progress-phase-mismatch")
        if self.state == "intent":
            if (self.phase_index >= len(phases)
                    or phases[self.phase_index]["transaction"] != "forbidden"
                    or self.phase_digest != _phase_digest(
                        phases[self.phase_index],
                        _steps_for_phase(plan, phases[self.phase_index]))):
                raise CatalogError("progress-phase-mismatch")
        else:
            expected = (_phase_digest(phases[self.phase_index - 1],
                                      _steps_for_phase(plan, phases[self.phase_index - 1]))
                        if self.phase_index else hashlib.sha256(b"").hexdigest())
            if self.phase_digest != expected:
                raise CatalogError("progress-phase-mismatch")


@runtime_checkable
class RequiredPhaseTransaction(Protocol):
    """Atomic effect, native witness and completion receipt for one phase."""

    def execute_statement(self, statement: str) -> None:
        """Run only the already source-verified statement for this phase."""

    def execute_data_step(self, plan: dict[str, Any], step: dict[str, Any]) -> None:
        """Execute a typed Weft-owned data operation, never caller SQL."""

    def verify_boundary(self, plan: dict[str, Any], phase: dict[str, Any],
                        prior: PhaseReceipt) -> None:
        """Lock and recheck native roles, ACLs and unaffected source prefix."""

    def observe_prefix(self, plan: dict[str, Any]) -> dict[str, Any]:
        """Return exact native witness while the phase transaction is held."""

    def record_completion(self, receipt: PhaseReceipt) -> None:
        """Persist completion in this same transaction as all phase effects."""


@runtime_checkable
class MigrationLease(Protocol):
    """Exclusive host custody spanning approval, phases, recovery and publish."""

    @property
    def target(self) -> TargetIdentity: ...

    def read_approval(self, binding: ApprovalBinding) -> ApprovalReceipt | None: ...

    def verify_predecessor(self, request: MigrationRequest) -> None: ...

    def read_progress(self, binding: ApprovalBinding) -> PhaseReceipt | None: ...

    def observe_prefix(self, plan: dict[str, Any]) -> dict[str, Any]: ...

    def begin(self, request: MigrationRequest, initial: PhaseReceipt) -> None:
        """Create selected metadata, fence the head and persist initial state atomically."""

    def fence_head(self, request: MigrationRequest) -> None:
        """Durably deny generated clients before any committed phase effect."""

    def required_phase(self, phase: dict[str, Any], *,
                       prior: PhaseReceipt | None) -> AbstractContextManager[RequiredPhaseTransaction]: ...

    def record_concurrent_intent(self, phase: dict[str, Any], *,
                                 prior: PhaseReceipt) -> PhaseReceipt: ...

    def dispatch_concurrent(self, phase: dict[str, Any]) -> None: ...

    def observe_concurrent(self, plan: dict[str, Any], phase: dict[str, Any],
                           prior: PhaseReceipt) -> tuple[str, dict[str, Any] | None]: ...

    def record_concurrent_completion(self, plan: dict[str, Any], phase: dict[str, Any], *,
                                     prior: PhaseReceipt,
                                     native_witness: dict[str, Any]) -> PhaseReceipt: ...

    def finalize(self, request: MigrationRequest,
                 approval: ApprovalReceipt) -> dict[str, Any]: ...

    def observe_final_publication(self, request: MigrationRequest,
                                  approval: ApprovalReceipt) -> dict[str, Any] | None: ...


@runtime_checkable
class MigrationHost(Protocol):
    """Typed host adapter; raw database connections are not part of this API."""

    @property
    def capabilities(self) -> HostCapabilities: ...

    def acquire(self, plan: dict[str, Any], *, expected_head: str,
                file_digest: str) -> AbstractContextManager[MigrationLease]: ...

    def record_approval(self, request: MigrationRequest, *, decision: str,
                        qualification_profile: str,
                        evidence_digest: str) -> ApprovalReceipt: ...


class PsycopgMigrationHost:
    """Reference PostgreSQL adapter using one authenticated idle Psycopg session.

    The connection remains private to this adapter. Callers get no raw SQL,
    cursor, or callback surface; only source-selected plan operations can cross
    the typed lease. The caller is responsible for opening the connection as
    the installation owner and setting ``autocommit=True``.
    """

    def __init__(self, connection: Any, *, person_roles: tuple[str, ...],
                 target_profile: str, statement_timeout_ms: int = 30_000,
                 lock_timeout_ms: int = 5_000):
        self._connection = connection
        self._person_roles = person_roles
        self._target_profile = target_profile
        self._statement_timeout_ms = statement_timeout_ms
        self._lock_timeout_ms = lock_timeout_ms
        self._capabilities = HostCapabilities(*(True for _ in range(10)))

    @property
    def capabilities(self) -> HostCapabilities:
        return self._capabilities

    @contextmanager
    def acquire(self, plan: dict[str, Any], *, expected_head: str,
                file_digest: str):
        from .catalog import _one

        connection = self._connection
        if (not getattr(connection, "autocommit", False)
                or int(connection.info.transaction_status) != 0):
            raise CatalogError("idle-autocommit-required")
        source = plan["next"]
        schema = source["configuration"]["schema"]
        lock_key = int.from_bytes(hashlib.sha256(
            ("umf.table-lifecycle/0.1\0" + schema).encode()).digest()[:8],
            "big", signed=True)
        if _one(connection, "SELECT pg_catalog.pg_try_advisory_lock(%s)",
                (lock_key,)) != (True,):
            raise CatalogError("migration-busy")
        try:
            target = _target_identity(connection, source, self._target_profile)
            yield _PsycopgLease(self, plan, target, expected_head, file_digest)
        finally:
            try:
                _one(connection, "SELECT pg_catalog.pg_advisory_unlock(%s)",
                     (lock_key,))
            except Exception:
                raise CatalogError("migration-session-cleanup-failed-observe-progress") from None

    @contextmanager
    def _atomic(self):
        try:
            with self._connection.transaction():
                yield
        except Exception as error:
            if type(error).__module__.startswith("psycopg"):
                raise HostOutcomeUnknown("native-transaction-outcome-unknown") from None
            raise

    def record_approval(self, request: MigrationRequest, *, decision: str,
                        qualification_profile: str,
                        evidence_digest: str) -> ApprovalReceipt:
        from .ledger import _authorize_new_effects, _verified_plan
        from .progress import _phase_digest, _verified_phases

        plan = _verified_plan(request.plan)
        if (plan.get("version") != "umf.table-migration/0.3"
                or request.expected_head is None
                or type(request.file_digest) is not str
                or re.fullmatch(r"[a-f0-9]{64}", request.file_digest) is None):
            raise CatalogError("host-migration-profile")
        _authorize_new_effects(plan)
        phases = _verified_phases(plan)
        require_host_capabilities(self, uses_concurrent=any(
            phase["transaction"] == "forbidden" for phase in phases))
        with self.acquire(plan, expected_head=request.expected_head,
                          file_digest=request.file_digest) as lease:
            binding = _approval_binding(lease.target, plan, request.file_digest,
                                        request.expected_head, phases,
                                        qualification_profile, evidence_digest)
            if request.binding is not None and request.binding != binding:
                raise CatalogError("approval-binding-invalid")
            bound_request = MigrationRequest(plan, request.expected_head,
                                             request.file_digest, binding)
            lease.verify_predecessor(bound_request)
            with self._atomic():
                from .approval import (_record_approval,
                                       _verify_approval_relation)
                from .catalog import _installation
                with _installation(self._connection, plan["next"],
                        statement_timeout_ms=self._statement_timeout_ms,
                        lock_timeout_ms=self._lock_timeout_ms):
                    _verify_predecessor_metadata(self._connection, plan,
                                                 self._person_roles)
                    _verify_approval_relation(self._connection, plan["next"],
                                              create=True)
                    receipt = _record_approval(
                        self._connection, plan["next"], binding,
                        decision=decision,
                        qualification_profile=qualification_profile,
                        evidence_digest=evidence_digest)
            if decision == "approved":
                receipt.verify(binding)
            elif receipt.binding_digest != binding.digest:
                raise CatalogError("approval-receipt-mismatch")
            return receipt


class _PsycopgLease:
    def __init__(self, host: PsycopgMigrationHost, plan: dict[str, Any],
                 target: TargetIdentity, expected_head: str,
                 file_digest: str):
        self.host, self.connection, self.plan = host, host._connection, plan
        self._target, self.expected_head, self.file_digest = target, expected_head, file_digest
        self.bundle = plan["next"]
        self.schema = self.bundle["configuration"]["schema"]
        self.binding: ApprovalBinding | None = None

    @property
    def target(self) -> TargetIdentity:
        return self._target

    def read_approval(self, binding: ApprovalBinding) -> ApprovalReceipt | None:
        from .approval import _approval_row, _verify_approval_relation
        from .catalog import _installation

        with self.connection.transaction(), _installation(
                self.connection, self.bundle,
                statement_timeout_ms=self.host._statement_timeout_ms,
                lock_timeout_ms=self.host._lock_timeout_ms):
            if not _verify_approval_relation(self.connection, self.bundle):
                return None
            return _approval_row(self.connection, self.schema, binding)

    def verify_predecessor(self, request: MigrationRequest) -> None:
        from .ledger import (_history_rows, _verify_installed)
        from .ledger_schema import _verify_history_schema
        from .catalog import _installation

        self.binding = request.binding
        if (self.binding is not None and self.binding.target != self.target):
            raise CatalogError("approval-target-mismatch")
        with self.host._atomic(), _installation(
                self.connection, self.bundle,
                statement_timeout_ms=self.host._statement_timeout_ms,
                lock_timeout_ms=self.host._lock_timeout_ms):
            if not _verify_history_schema(self.connection, self.bundle):
                raise CatalogError("ledger-history-missing")
            history = _history_rows(self.connection, self.schema)
            if not history:
                raise CatalogError("ledger-history-missing")
            latest = history[-1]
            if (latest["entryDigest"] != request.expected_head
                    or request.plan["predecessor"] != {
                        "id": latest["plan"]["id"],
                        "digest": latest["plan"]["digest"]}
                    or latest["plan"]["toBundleDigest"] != request.plan["fromBundleDigest"]):
                # Exact replay is handled from immutable history separately.
                if not any(entry["plan"]["digest"] == request.plan["digest"]
                           and entry.get("fileDigest") == request.file_digest
                           for entry in history):
                    raise CatalogError("ledger-head-mismatch")
            _verify_installed(self.connection, latest, self.host._person_roles,
                              self.host._statement_timeout_ms,
                              self.host._lock_timeout_ms)
            _verify_predecessor_metadata(self.connection, request.plan,
                                         self.host._person_roles)

    def read_progress(self, binding: ApprovalBinding) -> PhaseReceipt | None:
        from .progress import (_assert_progress_binding, _progress_rows,
                               _verify_progress_schema)
        from .catalog import _installation

        with self.host._atomic(), _installation(
                self.connection, self.bundle,
                statement_timeout_ms=self.host._statement_timeout_ms,
                lock_timeout_ms=self.host._lock_timeout_ms):
            if not _verify_progress_schema(self.connection, self.bundle):
                return None
            rows = _progress_rows(self.connection, self.schema)
            if not rows:
                return None
            row = rows[0]
            _assert_progress_binding(row, migration_id=self.plan["id"],
                plan_digest=self.plan["digest"], expected_head=binding.expected_head,
                file_digest=binding.file_digest)
            return _phase_receipt(row)

    def observe_prefix(self, plan: dict[str, Any]) -> dict[str, Any]:
        from .witness import _capture_witness

        return _capture_witness(self.connection, plan["next"])

    def begin(self, request: MigrationRequest, initial: PhaseReceipt) -> None:
        from .catalog import _installation
        from .mixed import (_lock_phase_tables, _verify_mixed_metadata_inventory,
                            _verify_phase_execution_boundary)
        from .phase_fence import _head_grants
        from .progress import (_create_progress, _verify_progress_schema,
                               _write_progress)

        with self.host._atomic(), _installation(
                self.connection, self.bundle,
                statement_timeout_ms=self.host._statement_timeout_ms,
                lock_timeout_ms=self.host._lock_timeout_ms):
            self._verify_bound_approval()
            if _verify_progress_schema(self.connection, self.bundle):
                raise CatalogError("progress-state-mismatch")
            _create_progress(self.connection, self.schema)
            _lock_phase_tables(self.connection, self.plan)
            _verify_phase_execution_boundary(self.connection, self.plan,
                                             self.host._person_roles)
            current = self.observe_prefix(self.plan)
            if current != initial.prefix_witness:
                raise CatalogError("progress-prefix-mismatch")
            _verify_mixed_metadata_inventory(self.connection, self.plan)
            _head_grants(self.connection, self.bundle, False)
            _write_progress(self.connection, self.schema,
                            _receipt_row(self.plan, self.expected_head,
                                         self.file_digest, initial))

    def fence_head(self, request: MigrationRequest) -> None:
        from .catalog import _installation
        from .phase_fence import _head_grants, _verify_phase_head

        with self.host._atomic(), _installation(
                self.connection, self.bundle,
                statement_timeout_ms=self.host._statement_timeout_ms,
                lock_timeout_ms=self.host._lock_timeout_ms):
            self._verify_bound_approval()
            _verify_phase_head(self.connection, self.bundle)
            _head_grants(self.connection, self.bundle, False)

    @contextmanager
    def required_phase(self, phase: dict[str, Any], *,
                       prior: PhaseReceipt | None):
        from .catalog import _installation
        from .mixed import (_lock_phase_tables, _verify_mixed_metadata_inventory,
                            _verify_phase_execution_boundary)

        with self.host._atomic(), _installation(
                self.connection, self.bundle,
                statement_timeout_ms=self.host._statement_timeout_ms,
                lock_timeout_ms=self.host._lock_timeout_ms):
            self._verify_bound_approval()
            _lock_phase_tables(self.connection, self.plan)
            _verify_phase_execution_boundary(self.connection, self.plan,
                                             self.host._person_roles)
            _verify_mixed_metadata_inventory(self.connection, self.plan)
            transaction = _PsycopgRequiredPhase(self, phase)
            transaction.verify_boundary(self.plan, phase, prior)
            yield transaction

    def record_concurrent_intent(self, phase: dict[str, Any], *,
                                 prior: PhaseReceipt) -> PhaseReceipt:
        from .catalog import _installation
        from .mixed import (_lock_phase_tables, _verify_mixed_metadata_inventory,
                            _verify_phase_execution_boundary)
        from .progress import _write_progress

        with self.host._atomic(), _installation(
                self.connection, self.bundle,
                statement_timeout_ms=self.host._statement_timeout_ms,
                lock_timeout_ms=self.host._lock_timeout_ms):
            self._verify_bound_approval()
            _lock_phase_tables(self.connection, self.plan)
            _verify_phase_execution_boundary(self.connection, self.plan,
                                             self.host._person_roles)
            _verify_mixed_metadata_inventory(self.connection, self.plan)
            if self.observe_prefix(self.plan) != prior.prefix_witness:
                raise CatalogError("progress-prefix-mismatch")
            intent = PhaseReceipt(prior.phase_index,
                _phase_hash(self.plan, phase), prior.completed_steps,
                prior.prefix_witness, "intent")
            _write_progress(self.connection, self.schema,
                _receipt_row(self.plan, self.expected_head, self.file_digest, intent))
            return intent

    def dispatch_concurrent(self, phase: dict[str, Any]) -> None:
        from .catalog import _execute, _installation
        from .mixed import _verify_phase_execution_boundary

        steps = _steps_for_phase(self.plan, phase)
        if (phase["kind"] != "concurrent-index" or len(steps) != 1
                or steps[0]["transaction"] != "forbidden"):
            raise CatalogError("mixed-phase-profile")
        try:
            with self.connection.transaction(), _installation(
                    self.connection, self.bundle,
                    statement_timeout_ms=self.host._statement_timeout_ms,
                    lock_timeout_ms=self.host._lock_timeout_ms):
                self._verify_bound_approval()
                _verify_phase_execution_boundary(self.connection, self.plan,
                                                 self.host._person_roles)
            _execute(self.connection, steps[0]["sql"])
        except Exception as error:
            if type(error).__module__.startswith("psycopg"):
                raise HostOutcomeUnknown("concurrent-dispatch-outcome-unknown") from None
            raise

    def observe_concurrent(self, plan: dict[str, Any], phase: dict[str, Any],
                           prior: PhaseReceipt) -> tuple[str, dict[str, Any] | None]:
        from .catalog import _installation
        from .mixed import (_lock_phase_tables, _verify_index_shape, _verify_mixed_metadata_inventory,
                            _verify_phase_execution_boundary, _without_concurrent_effect)
        from .witness import _capture_witness

        with self.connection.transaction(), _installation(
                self.connection, self.bundle,
                statement_timeout_ms=self.host._statement_timeout_ms,
                lock_timeout_ms=self.host._lock_timeout_ms):
            self._verify_bound_approval()
            _lock_phase_tables(self.connection, self.plan)
            _verify_phase_execution_boundary(self.connection, self.plan,
                                             self.host._person_roles)
            _verify_mixed_metadata_inventory(self.connection, self.plan)
            current = _capture_witness(self.connection, self.bundle)
            if _without_concurrent_effect(current, self.plan, phase) != prior.prefix_witness:
                raise CatalogError("progress-prefix-mismatch")
            step = _steps_for_phase(self.plan, phase)[0]
            if _verify_index_shape(self.connection, self.bundle, step):
                return "applied", current
            return "absent", None

    def record_concurrent_completion(self, plan: dict[str, Any], phase: dict[str, Any], *,
                                     prior: PhaseReceipt,
                                     native_witness: dict[str, Any]) -> PhaseReceipt:
        from .catalog import _installation
        from .mixed import (_lock_phase_tables, _verify_index_shape, _verify_mixed_metadata_inventory,
                            _verify_phase_execution_boundary, _without_concurrent_effect)
        from .progress import _write_progress
        from .witness import _capture_witness

        with self.host._atomic(), _installation(
                self.connection, self.bundle,
                statement_timeout_ms=self.host._statement_timeout_ms,
                lock_timeout_ms=self.host._lock_timeout_ms):
            self._verify_bound_approval()
            _lock_phase_tables(self.connection, self.plan)
            _verify_phase_execution_boundary(self.connection, self.plan,
                                             self.host._person_roles)
            _verify_mixed_metadata_inventory(self.connection, self.plan)
            current = _capture_witness(self.connection, self.bundle)
            if (current != native_witness
                    or _without_concurrent_effect(current, self.plan, phase)
                    != prior.prefix_witness
                    or not _verify_index_shape(self.connection, self.bundle,
                                              _steps_for_phase(self.plan, phase)[0])):
                raise CatalogError("progress-prefix-mismatch")
            completed = PhaseReceipt(prior.phase_index + 1,
                _phase_hash(self.plan, phase),
                prior.completed_steps + tuple(phase["steps"]), current, "complete")
            _write_progress(self.connection, self.schema,
                _receipt_row(self.plan, self.expected_head, self.file_digest, completed))
            return completed

    def finalize(self, request: MigrationRequest,
                 approval: ApprovalReceipt) -> dict[str, Any]:
        from .catalog import _installation
        from .ledger import _finalize_phased_migration
        from .mixed import _verify_mixed_metadata_inventory
        from .phase_fence import _head_grants, _verify_phase_head
        from .progress import (_delete_progress, _drop_progress,
                               _verify_progress_schema)
        from .witness import _capture_witness

        binding = request.binding
        if binding is None:
            raise CatalogError("approval-binding-invalid")
        approval.verify(binding)
        rows = self.read_progress(binding)
        if rows is None or rows.phase_index != len(self.plan["phases"]):
            raise CatalogError("progress-phase-mismatch")
        rows.verify(self.plan["phases"], self.plan)
        with self.host._atomic(), _installation(
                self.connection, self.bundle,
                statement_timeout_ms=self.host._statement_timeout_ms,
                lock_timeout_ms=self.host._lock_timeout_ms):
            self._verify_bound_approval(binding)
            _verify_phase_head(self.connection, self.bundle)
            if _capture_witness(self.connection, self.bundle) != rows.prefix_witness:
                raise CatalogError("progress-prefix-mismatch")
            _verify_mixed_metadata_inventory(self.connection, self.plan)
            if not _verify_progress_schema(self.connection, self.bundle):
                raise CatalogError("progress-state-mismatch")
            _head_grants(self.connection, self.bundle, True)
            _delete_progress(self.connection, self.schema, self.plan["id"])
            _drop_progress(self.connection, self.schema)
            result = _finalize_phased_migration(
                self.connection, self.plan, approved_digest=self.plan["digest"],
                expected_head=request.expected_head,
                person_roles=self.host._person_roles,
                statement_timeout_ms=self.host._statement_timeout_ms,
                lock_timeout_ms=self.host._lock_timeout_ms,
                file_digest=request.file_digest)
        return {**result, "status": "committed", "commitResponsibility": "adapter"}

    def observe_final_publication(self, request: MigrationRequest,
                                  approval: ApprovalReceipt) -> dict[str, Any] | None:
        from .catalog import _installation
        from .ledger import _history_rows, _verify_installed
        from .ledger_schema import _verify_history_schema

        if request.binding is None:
            return None
        approval.verify(request.binding)
        with self.connection.transaction(), _installation(
                self.connection, self.bundle,
                statement_timeout_ms=self.host._statement_timeout_ms,
                lock_timeout_ms=self.host._lock_timeout_ms):
            if not _verify_history_schema(self.connection, self.bundle):
                return None
            history = _history_rows(self.connection, self.schema)
            matches = [item for item in history
                       if item["plan"]["digest"] == self.plan["digest"]]
            if not matches:
                return None
            match = matches[0]
            prior_head = history[match["position"] - 2]["entryDigest"] if match["position"] > 1 else None
            if (match.get("fileDigest") != request.file_digest
                    or prior_head != request.expected_head
                    or history[-1]["plan"]["toBundleDigest"] != self.bundle["bundleDigest"]):
                raise CatalogError("ledger-digest-conflict")
            _verify_installed(self.connection, history[-1], self.host._person_roles,
                              self.host._statement_timeout_ms,
                              self.host._lock_timeout_ms)
            return {"status": "already-applied", "migrationId": self.plan["id"],
                    "entryDigest": match["entryDigest"],
                    "headDigest": history[-1]["entryDigest"],
                    "generation": len(history),
                    "installedBundleDigest": self.bundle["bundleDigest"],
                    "commitResponsibility": "adapter"}

    def _verify_bound_approval(self, binding: ApprovalBinding | None = None) -> None:
        from .approval import _approval_row, _verify_approval_relation

        selected = binding or self.binding
        if selected is None or selected.target != self.target:
            raise CatalogError("approval-binding-invalid")
        if not _verify_approval_relation(self.connection, self.bundle):
            raise CatalogError("approval-required")
        receipt = _approval_row(self.connection, self.schema, selected)
        if receipt is None:
            raise CatalogError("approval-required")
        receipt.verify(selected)


class _PsycopgRequiredPhase:
    def __init__(self, lease: _PsycopgLease, phase: dict[str, Any]):
        self.lease, self.phase = lease, phase
        self.steps = _steps_for_phase(lease.plan, phase)
        self.cursor = 0
        self.prior: PhaseReceipt | None = None

    def verify_boundary(self, plan: dict[str, Any], phase: dict[str, Any],
                        prior: PhaseReceipt) -> None:
        from .mixed import _verify_backfill_tighten_target
        from .witness import _capture_witness

        if phase["kind"] == "backfill-tighten":
            _verify_backfill_tighten_target(plan, phase)
        if _capture_witness(self.lease.connection, plan["next"]) != prior.prefix_witness:
            raise CatalogError("progress-prefix-mismatch")
        self.prior = prior

    def execute_statement(self, statement: str) -> None:
        from .catalog import _execute

        if self.cursor >= len(self.steps):
            raise CatalogError("mixed-phase-profile")
        step = self.steps[self.cursor]
        if step.get("sql") != statement or step["transaction"] != "required":
            raise CatalogError("mixed-phase-profile")
        _execute(self.lease.connection, statement)
        self.cursor += 1

    def execute_data_step(self, plan: dict[str, Any], step: dict[str, Any]) -> None:
        if (self.cursor >= len(self.steps) or step != self.steps[self.cursor]
                or step["transaction"] != "required"):
            raise CatalogError("mixed-phase-profile")
        if step["kind"] == "backfill":
            from .backfills import _apply_backfill

            _apply_backfill(self.lease.connection, self.lease.plan, step)
        elif step["kind"] == "seed":
            from .seeds import _apply_seeds

            if (step.get("operation") != "apply-seeds"
                    or step.get("seedSets") != self.lease.plan["seedExecution"].get("sets")):
                raise CatalogError("seed-execution-profile")
            _apply_seeds(self.lease.connection, self.lease.plan,
                statement_timeout_ms=self.lease.host._statement_timeout_ms,
                lock_timeout_ms=self.lease.host._lock_timeout_ms)
        else:
            raise CatalogError("mixed-phase-profile")
        self.cursor += 1

    def observe_prefix(self, plan: dict[str, Any]) -> dict[str, Any]:
        return self.lease.observe_prefix(plan)

    def record_completion(self, receipt: PhaseReceipt) -> None:
        from .mixed import _verify_mixed_metadata_inventory
        from .mixed import _verify_phase_execution_boundary
        from .progress import _write_progress

        if (self.prior is None or self.cursor != len(self.steps)
                or receipt.phase_index != self.prior.phase_index + 1
                or receipt.state != "complete"
                or receipt.completed_steps != self.prior.completed_steps
                    + tuple(self.phase["steps"])
                or receipt.phase_digest != _phase_hash(self.lease.plan, self.phase)):
            raise CatalogError("progress-phase-mismatch")
        _verify_phase_execution_boundary(self.lease.connection,
                                         self.lease.plan,
                                         self.lease.host._person_roles)
        _verify_mixed_metadata_inventory(self.lease.connection, self.lease.plan)
        _write_progress(self.lease.connection, self.lease.schema,
            _receipt_row(self.lease.plan, self.lease.expected_head,
                         self.lease.file_digest, receipt))


def require_host_capabilities(host: MigrationHost, *, uses_concurrent: bool) -> None:
    capabilities = host.capabilities
    if not isinstance(capabilities, HostCapabilities):
        raise CatalogError("host-capability-unsupported")
    capabilities.require(uses_concurrent=uses_concurrent)


def verify_host_approval(lease: MigrationLease,
                         binding: ApprovalBinding) -> ApprovalReceipt:
    receipt = lease.read_approval(binding)
    if receipt is None:
        raise CatalogError("approval-required")
    receipt.verify(binding)
    return receipt


class HostOutcomeUnknown(RuntimeError):
    """A dispatched native phase must be observed before its next action."""


def _steps_for_phase(plan: dict[str, Any], phase: dict[str, Any]) -> list[dict[str, Any]]:
    by_id = {step["id"]: step for step in plan["steps"]}
    try:
        return [by_id[step_id] for step_id in phase["steps"]]
    except (KeyError, TypeError):
        raise CatalogError("mixed-phase-profile") from None


def apply_migration_on_host(host: MigrationHost, plan: dict[str, Any], *,
                            expected_head: str, file_digest: str,
                            qualification_profile: str, evidence_digest: str,
                            statement_timeout_ms: int = 30_000,
                            lock_timeout_ms: int = 5_000) -> dict[str, Any]:
    """Apply a current source-verified 0.3 plan through host custody.

    The host supplies trusted identity, database custody and native transactions;
    this function owns ordered phases, approval binding and recovery decisions.
    No raw driver connection or host decision callback crosses this API.
    """
    from .ledger import _authorize_new_effects, _verified_plan
    from .progress import _phase_digest, _verified_phases

    source_plan = _verified_plan(plan)
    if (source_plan.get("version") != "umf.table-migration/0.3"
            or source_plan.get("options", {}).get("version") != "umf.table-migration-options/0.3"
            or source_plan.get("approvalProfile") != {
                "version": "umf.table-migration-approval/0.1",
                "relation": "umf_lifecycle_approvals", "ownerOnly": True}):
        raise CatalogError("host-migration-profile")
    if (type(expected_head) is not str or re.fullmatch(r"[a-f0-9]{64}", expected_head) is None
            or type(file_digest) is not str or re.fullmatch(r"[a-f0-9]{64}", file_digest) is None):
        raise CatalogError("migration-binding-invalid")
    _authorize_new_effects(source_plan)
    phases = _verified_phases(source_plan)
    uses_concurrent = any(phase["transaction"] == "forbidden" for phase in phases)
    require_host_capabilities(host, uses_concurrent=uses_concurrent)

    with host.acquire(source_plan, expected_head=expected_head,
                      file_digest=file_digest) as lease:
        target = lease.target
        binding = ApprovalBinding(
            target=target,
            migration_id=source_plan["id"],
            plan_digest=source_plan["digest"],
            file_digest=file_digest,
            source_bundle_digest=source_plan["toBundleDigest"],
            expected_head=expected_head,
            phase_digests=tuple(_phase_digest(phase, _steps_for_phase(source_plan, phase))
                                for phase in phases),
            qualification_profile=qualification_profile,
            evidence_digest=evidence_digest,
        )
        request = MigrationRequest(source_plan, expected_head, file_digest, binding)
        lease.verify_predecessor(request)
        approval = verify_host_approval(lease, binding)
        published = lease.observe_final_publication(request, approval)
        if published is not None:
            return published
        receipt = lease.read_progress(binding)
        if receipt is None:
            initial = PhaseReceipt(0, hashlib.sha256(b"").hexdigest(), (),
                                   lease.observe_prefix(source_plan), "ready")
            try:
                lease.begin(request, initial)
            except HostOutcomeUnknown:
                observed = lease.read_progress(binding)
                if observed != initial:
                    raise CatalogError("migration-outcome-unknown-observe-progress") from None
            receipt = initial
        else:
            receipt.verify(phases, source_plan)
            if receipt.state != "intent":
                lease.fence_head(request)

        while receipt.phase_index < len(phases):
            index = receipt.phase_index
            phase = phases[index]
            phase_digest = binding.phase_digests[index]
            if receipt.state == "intent":
                state, witness = lease.observe_concurrent(source_plan, phase, receipt)
                if state == "applied":
                    if type(witness) is not dict:
                        raise CatalogError("migration-outcome-unknown-observe-progress")
                    try:
                        receipt = lease.record_concurrent_completion(
                            source_plan, phase, prior=receipt, native_witness=witness)
                    except HostOutcomeUnknown:
                        observed = lease.read_progress(binding)
                        expected_steps = receipt.completed_steps + tuple(phase["steps"])
                        if (observed is None or observed.phase_index != index + 1
                                or observed.phase_digest != binding.phase_digests[index]
                                or observed.completed_steps != expected_steps):
                            raise CatalogError("migration-outcome-unknown-observe-progress") from None
                        observed.verify(phases, source_plan)
                        receipt = observed
                    continue
                if state != "absent":
                    raise CatalogError("migration-outcome-unknown-observe-progress")
                # A fresh exact absence observation permits a new dispatch; an
                # unobserved dispatch is never retried in the same call.
                prior_digest = (_phase_digest(phases[index - 1],
                                              _steps_for_phase(source_plan, phases[index - 1]))
                                if index else hashlib.sha256(b"").hexdigest())
                receipt = PhaseReceipt(receipt.phase_index, prior_digest,
                                       receipt.completed_steps, receipt.prefix_witness, "ready")
            if phase["transaction"] == "forbidden":
                try:
                    receipt = lease.record_concurrent_intent(phase, prior=receipt)
                except HostOutcomeUnknown:
                    observed = lease.read_progress(binding)
                    if (observed is None or observed.state != "intent"
                            or observed.phase_index != index
                            or observed.phase_digest != phase_digest):
                        raise CatalogError("migration-outcome-unknown-observe-progress") from None
                    receipt = observed
                try:
                    lease.dispatch_concurrent(phase)
                except HostOutcomeUnknown:
                    state, witness = lease.observe_concurrent(source_plan, phase, receipt)
                    if state != "applied" or type(witness) is not dict:
                        raise CatalogError("migration-outcome-unknown-observe-progress") from None
                else:
                    state, witness = lease.observe_concurrent(source_plan, phase, receipt)
                if state != "applied" or type(witness) is not dict:
                    raise CatalogError("migration-outcome-unknown-observe-progress")
                try:
                    receipt = lease.record_concurrent_completion(
                        source_plan, phase, prior=receipt, native_witness=witness)
                except HostOutcomeUnknown:
                    observed = lease.read_progress(binding)
                    expected_steps = receipt.completed_steps + tuple(phase["steps"])
                    if (observed is None or observed.phase_index != index + 1
                            or observed.phase_digest != phase_digest
                            or observed.completed_steps != expected_steps):
                        raise CatalogError("migration-outcome-unknown-observe-progress") from None
                    observed.verify(phases, source_plan)
                    receipt = observed
                continue

            try:
                with lease.required_phase(phase, prior=receipt) as transaction:
                    transaction.verify_boundary(source_plan, phase, receipt)
                    if transaction.observe_prefix(source_plan) != receipt.prefix_witness:
                        raise CatalogError("progress-prefix-mismatch")
                    for step in _steps_for_phase(source_plan, phase):
                        if step["kind"] in {"backfill", "seed"}:
                            transaction.execute_data_step(source_plan, step)
                        else:
                            transaction.execute_statement(step["sql"])
                    witness = transaction.observe_prefix(source_plan)
                    completed = receipt.completed_steps + tuple(phase["steps"])
                    next_receipt = PhaseReceipt(index + 1, phase_digest, completed,
                                                witness, "complete")
                    transaction.record_completion(next_receipt)
            except HostOutcomeUnknown:
                observed = lease.read_progress(binding)
                if (observed is None or observed.state != "complete"
                        or observed.phase_index != index + 1
                        or observed.phase_digest != phase_digest
                        or observed.completed_steps != receipt.completed_steps + tuple(phase["steps"])):
                    raise CatalogError("migration-outcome-unknown-observe-progress") from None
                observed.verify(phases, source_plan)
                receipt = observed
                continue
            receipt = next_receipt

        try:
            return lease.finalize(request, approval)
        except HostOutcomeUnknown:
            observed = lease.observe_final_publication(request, approval)
            if observed is None:
                raise CatalogError("migration-outcome-unknown-observe-history") from None
            return observed


def _target_identity(connection: Any, source: dict[str, Any],
                     profile: str) -> TargetIdentity:
    from .catalog import _one

    row = _one(connection, "SELECT d.oid,d.datname,s.system_identifier "
                "FROM pg_catalog.pg_database d CROSS JOIN pg_catalog.pg_control_system() s "
                "WHERE d.datname=pg_catalog.current_database()")
    cfg = source["configuration"]
    if (row is None or type(profile) is not str or not profile
            or type(cfg.get("module")) is not str or not cfg["module"]):
        raise CatalogError("approval-target-identity-invalid")
    return TargetIdentity("postgresql", profile, str(row[2]), row[0], row[1],
                          cfg["schema"], cfg["module"], cfg["ownerRole"])


def _approval_binding(target: TargetIdentity, plan: dict[str, Any],
                      file_digest: str, expected_head: str,
                      phases: list[dict[str, Any]], qualification_profile: str,
                      evidence_digest: str) -> ApprovalBinding:
    from .progress import _phase_digest

    return ApprovalBinding(target, plan["id"], plan["digest"], file_digest,
        plan["toBundleDigest"], expected_head,
        tuple(_phase_digest(phase, _steps_for_phase(plan, phase)) for phase in phases),
        qualification_profile, evidence_digest)


def _phase_hash(plan: dict[str, Any], phase: dict[str, Any]) -> str:
    from .progress import _phase_digest

    return _phase_digest(phase, _steps_for_phase(plan, phase))


def _phase_receipt(row: dict[str, Any]) -> PhaseReceipt:
    if (type(row.get("phaseIndex")) is not int
            or type(row.get("completedSteps")) is not list
            or any(type(step) is not str for step in row["completedSteps"])
            or type(row.get("prefixWitness")) is not dict):
        raise CatalogError("progress-state-mismatch")
    return PhaseReceipt(row["phaseIndex"], row["phaseDigest"],
                        tuple(row["completedSteps"]), row["prefixWitness"],
                        row["state"])


def _receipt_row(plan: dict[str, Any], expected_head: str | None,
                 file_digest: str | None, receipt: PhaseReceipt) -> dict[str, Any]:
    return {"migrationId": plan["id"], "planDigest": plan["digest"],
            "expectedHead": expected_head, "fileDigest": file_digest,
            "phaseIndex": receipt.phase_index, "state": receipt.state,
            "phaseDigest": receipt.phase_digest,
            "completedSteps": list(receipt.completed_steps),
            "prefixWitness": receipt.prefix_witness}


def _verify_predecessor_metadata(connection: Any, plan: dict[str, Any],
                                 person_roles: tuple[str, ...]) -> None:
    from .catalog import _all, verify_native_catalog
    from .head_view import HEAD
    from .ledger_schema import HISTORY, _verify_history_schema
    from .outcome_schema import OUTCOMES, _verify_outcomes
    from .phase_fence import _verify_phase_head
    from .privileges import verify_native_privileges

    source = plan["previous"] or plan["next"]
    schema = source["configuration"]["schema"]
    if (not _verify_history_schema(connection, source)
            or not _verify_outcomes(connection, source)):
        raise CatalogError("ledger-history-missing")
    verify_native_catalog(connection, source)
    verify_native_privileges(connection, source, person_roles=person_roles)
    _verify_phase_head(connection, source)
    rows = _all(connection, "SELECT c.relname,c.relkind FROM pg_catalog.pg_class c "
        "JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace "
        "WHERE n.nspname=%s AND c.relkind IN ('r','p','v','m','S','f') ORDER BY c.relname",
        (schema,))
    allowed = {table["name"]: "r" for table in source["expectedCatalog"]["tables"]}
    allowed.update({HISTORY: "r", OUTCOMES: "r", HEAD: "v"})
    from .progress import PROGRESS, _verify_progress_schema
    allowed.update({"umf_lifecycle_approvals": "r"})
    if _verify_progress_schema(connection, plan["next"]):
        allowed[PROGRESS] = "r"
    if any((name not in allowed)
           or (name in allowed and kind != allowed[name]) for name, kind in rows):
        raise CatalogError("progress-inventory-mismatch")
    if "umf_lifecycle_approvals" in {name for name, _ in rows}:
        from .approval import _verify_approval_relation

        _verify_approval_relation(connection, plan["next"])


def _verify_approval_available(connection: Any, bundle: dict[str, Any]) -> None:
    from .approval import _verify_approval_relation

    if not _verify_approval_relation(connection, bundle):
        raise CatalogError("approval-required")

