# SPDX-License-Identifier: MIT OR Apache-2.0
"""Trusted, source-independent G11 phase policy and accounting primitives.

These are host-side building blocks only. They do not install PostgreSQL
timeouts, authorize a provider, mint ingress capabilities, or qualify native
enforcement. The concrete adapter must install and verify transaction_timeout
before BEGIN, use :class:`PhaseDeadline` before every dispatch and COMMIT, and
record the returned budget receipt in the effect transaction.
"""
from __future__ import annotations

import hashlib
import json
import time
from dataclasses import dataclass
from typing import Any, Callable

from .catalog import CatalogError

DERIVED_ADMIN_MODULE_PROFILE = 'weft.table-operation-module/0.2'
EXECUTION_POLICY_PROFILE = 'umf.g11.execution-policy/0.1'
PHASE_BUDGET_PROFILE = 'umf.g11.phase-budget-receipt/0.1'
MAX_PHASE_FILL_EFFECTS = 256
MAX_PHASE_OPERATION_ID_UTF8 = 256
_POLICY_FIELDS = {
    'phase_timeout_ms', 'aggregate_affected_rows',
    'statement_timeout_ms', 'lock_timeout_ms',
}


def _canonical_bytes(value: Any) -> bytes:
    """RFC 8785 bytes for this closed integer/string/object subset."""
    # JCS's UTF-8, lexically sorted object keys and compact separators match
    # this subset; non-finite and non-JSON values are rejected.
    return json.dumps(value, ensure_ascii=False, sort_keys=True,
                      separators=(',', ':'), allow_nan=False).encode('utf-8')


def _valid_operation_id(value: object) -> bool:
    if type(value) is not str or not value or '\x00' in value:
        return False
    try:
        return len(value.encode('utf-8')) <= MAX_PHASE_OPERATION_ID_UTF8
    except UnicodeEncodeError:
        return False


@dataclass(frozen=True, slots=True)
class FieldReplacementExecutionPolicy:
    """Immutable trusted host settings; never sourced from plan/options JSON."""

    phase_timeout_ms: int = 30_000
    aggregate_affected_rows: int = 100_000
    statement_timeout_ms: int = 30_000
    lock_timeout_ms: int = 5_000

    def __post_init__(self) -> None:
        values = (self.phase_timeout_ms, self.aggregate_affected_rows,
                  self.statement_timeout_ms, self.lock_timeout_ms)
        if any(type(value) is not int for value in values):
            raise CatalogError('phase-policy-invalid')
        if (not 1 <= self.phase_timeout_ms <= 300_000
                or not 0 <= self.aggregate_affected_rows <= 1_000_000
                or not 1 <= self.statement_timeout_ms <= self.phase_timeout_ms
                or not 1 <= self.lock_timeout_ms <= self.statement_timeout_ms):
            raise CatalogError('phase-policy-invalid')

    @classmethod
    def from_trusted_mapping(cls, value: dict[str, Any]) -> 'FieldReplacementExecutionPolicy':
        """Build from a trusted host config, with closed keys and exact ints."""
        if type(value) is not dict or set(value) - _POLICY_FIELDS:
            raise CatalogError('phase-policy-invalid')
        try:
            return cls(**value)
        except TypeError:
            raise CatalogError('phase-policy-invalid') from None

    def normal_form(self) -> dict[str, Any]:
        return {
            'version': EXECUTION_POLICY_PROFILE,
            'phaseTimeoutMs': self.phase_timeout_ms,
            'aggregateAffectedRows': self.aggregate_affected_rows,
            'statementTimeoutMs': self.statement_timeout_ms,
            'lockTimeoutMs': self.lock_timeout_ms,
            'derivedModuleProfile': DERIVED_ADMIN_MODULE_PROFILE,
        }

    def canonical_bytes(self) -> bytes:
        return _canonical_bytes(self.normal_form())

    @property
    def digest(self) -> str:
        return hashlib.sha256(self.canonical_bytes()).hexdigest()


def require_original_policy(policy: FieldReplacementExecutionPolicy,
                            original_digest: str) -> None:
    """Refuse a resume whose trusted execution policy differs from approval."""
    if (type(policy) is not FieldReplacementExecutionPolicy
            or type(original_digest) is not str
            or len(original_digest) != 64
            or any(ch not in '0123456789abcdef' for ch in original_digest)
            or policy.digest != original_digest):
        raise CatalogError('phase-policy-mismatch')


@dataclass(frozen=True, slots=True)
class DispatchTimeouts:
    statement_timeout_ms: int
    lock_timeout_ms: int


class PhaseDeadline:
    """Monotonic absolute phase deadline and per-dispatch timeout clamp.

    Injected clocks support deterministic source controls only. Native timeout
    behavior must be proven by the PostgreSQL adapter integration tests.
    """

    __slots__ = ('_policy', '_started_ns', '_deadline_ns', '_clock_ns')

    def __init__(self, policy: FieldReplacementExecutionPolicy, *,
                 clock_ns: Callable[[], int] = time.monotonic_ns):
        if type(policy) is not FieldReplacementExecutionPolicy:
            raise CatalogError('phase-policy-invalid')
        now = clock_ns()
        if type(now) is not int or now < 0:
            raise CatalogError('phase-clock-invalid')
        self._policy = policy
        self._started_ns = now
        self._deadline_ns = now + policy.phase_timeout_ms * 1_000_000
        self._clock_ns = clock_ns

    @property
    def started_ns(self) -> int:
        return self._started_ns

    @property
    def deadline_ns(self) -> int:
        return self._deadline_ns

    @property
    def native_transaction_timeout_ms(self) -> int:
        """Value the adapter must set and verify before BEGIN."""
        return self._policy.phase_timeout_ms

    def remaining_ms(self) -> int:
        now = self._clock_ns()
        if type(now) is not int or now < 0:
            raise CatalogError('phase-clock-invalid')
        remaining_ns = self._deadline_ns - now
        remaining_ms = remaining_ns // 1_000_000
        if remaining_ms <= 0:
            raise CatalogError('phase-deadline-exceeded')
        return remaining_ms

    def before_dispatch(self) -> DispatchTimeouts:
        remaining = self.remaining_ms()
        statement = min(self._policy.statement_timeout_ms, remaining)
        lock = min(self._policy.lock_timeout_ms, statement, remaining)
        if statement <= 0 or lock <= 0:
            raise CatalogError('phase-deadline-exceeded')
        return DispatchTimeouts(statement, lock)

    def before_commit(self) -> DispatchTimeouts:
        return self.before_dispatch()


@dataclass(frozen=True, slots=True)
class _ValidatedMarkerRows:
    """Private count created only after validating Weft's result marker rows."""

    count: int
    _seal: object


_MARKER_ROWS_SEAL = object()


def _validated_marker_rows(column_names: list[str], expected_marker: str,
                           rows: list[tuple[Any, ...]], max_rows: int) -> _ValidatedMarkerRows:
    """Validate the private affected marker shape and its per-fill bound."""
    if (type(expected_marker) is not str or not expected_marker
            or type(column_names) is not list or column_names != [expected_marker]
            or type(rows) is not list or type(max_rows) is not int
            or not 1 <= max_rows <= 10_000 or len(rows) > max_rows
            or any(type(row) is not tuple or len(row) != 1
                   or type(row[0]) is not int or row[0] != 1 for row in rows)):
        raise CatalogError('phase-budget-marker-invalid')
    return _ValidatedMarkerRows(len(rows), _MARKER_ROWS_SEAL)


class PhaseBudgetCounter:
    """Whole-phase actual marker-row accounting, in dispatch order.

    Charge only a validated private marker result after its own maxRows check.
    Counts are per fill, so a business row affected by two fills is charged
    twice. A rejected marker, identity, effect-count or aggregate check poisons
    the phase, so no receipt/dispatch/commit is available afterward. This
    bounded receipt is not authority for a selected plan: a concrete adapter
    must bind each entry to the exact reviewed step order before recording it.
    """

    __slots__ = ('_policy', '_policy_digest', '_affected_rows', '_effects',
                 '_effect_step_ids', '_deadline', '_poisoned')

    def __init__(self, policy: FieldReplacementExecutionPolicy, *,
                 clock_ns: Callable[[], int] = time.monotonic_ns):
        if type(policy) is not FieldReplacementExecutionPolicy:
            raise CatalogError('phase-policy-invalid')
        self._policy = policy
        self._policy_digest = policy.digest
        self._affected_rows = 0
        self._effects: list[dict[str, Any]] = []
        self._effect_step_ids: set[str] = set()
        self._deadline = PhaseDeadline(policy, clock_ns=clock_ns)
        self._poisoned = False

    def _require_usable(self) -> None:
        if self._poisoned:
            raise CatalogError('phase-budget-poisoned')

    def _poison(self) -> None:
        # Keep any already-observed effects in memory for diagnostics, but never
        # let a failed phase produce a receipt or continue dispatch/commit.
        self._poisoned = True

    @property
    def affected_rows(self) -> int:
        return self._affected_rows

    @property
    def policy_digest(self) -> str:
        return self._policy_digest

    @property
    def native_transaction_timeout_ms(self) -> int:
        return self._deadline.native_transaction_timeout_ms

    def before_dispatch(self) -> DispatchTimeouts:
        self._require_usable()
        try:
            return self._deadline.before_dispatch()
        except CatalogError:
            self._poison()
            raise

    def before_commit(self) -> DispatchTimeouts:
        self._require_usable()
        try:
            return self._deadline.before_commit()
        except CatalogError:
            self._poison()
            raise

    def charge_marker(self, *, step_id: str, operation: str,
                      column_names: list[str], expected_marker: str,
                      rows: list[tuple[Any, ...]], max_rows: int) -> None:
        """Validate and charge one actual marker result as one indivisible step."""
        self._require_usable()
        try:
            validated = _validated_marker_rows(
                column_names, expected_marker, rows, max_rows)
            self.charge(step_id=step_id, operation=operation,
                        validated_rows=validated)
        except CatalogError:
            self._poison()
            raise

    def charge(self, *, step_id: str, operation: str,
               validated_rows: _ValidatedMarkerRows) -> None:
        self._require_usable()
        try:
            if (type(step_id) is not str
                    or len(step_id) != 10
                    or not step_id.startswith('step-')
                    or not step_id[5:].isascii()
                    or not step_id[5:].isdigit()
                    or not _valid_operation_id(operation)
                    or type(validated_rows) is not _ValidatedMarkerRows
                    or validated_rows._seal is not _MARKER_ROWS_SEAL
                    or type(validated_rows.count) is not int
                    or validated_rows.count < 0):
                raise CatalogError('phase-budget-marker-invalid')
            if step_id in self._effect_step_ids:
                raise CatalogError('phase-budget-marker-invalid')
            if len(self._effects) >= MAX_PHASE_FILL_EFFECTS:
                raise CatalogError('phase-budget-marker-invalid')
            total = self._affected_rows + validated_rows.count
            if total > self._policy.aggregate_affected_rows:
                raise CatalogError('phase-budget-exceeded')
            self._effects.append({'stepId': step_id, 'operation': operation,
                                  'rows': validated_rows.count})
            self._effect_step_ids.add(step_id)
            self._affected_rows = total
        except CatalogError:
            self._poison()
            raise

    def receipt(self) -> dict[str, Any]:
        """Return the exact closed receipt; persist only in the effect transaction."""
        self._require_usable()
        receipt = {
            'profile': PHASE_BUDGET_PROFILE,
            'policyDigest': self._policy_digest,
            'affectedRows': self._affected_rows,
            'fillEffects': [dict(effect) for effect in self._effects],
            'nativeTransactionTimeoutMs': self._policy.phase_timeout_ms,
        }
        validate_phase_budget_receipt(receipt, self._policy)
        return receipt


def validate_phase_budget_receipt(receipt: dict[str, Any],
                                  policy: FieldReplacementExecutionPolicy) -> None:
    """Verify the exact durable phase receipt shape and actual-count sum."""
    if (type(policy) is not FieldReplacementExecutionPolicy
            or type(receipt) is not dict
            or set(receipt) != {'profile', 'policyDigest', 'affectedRows',
                                'fillEffects', 'nativeTransactionTimeoutMs'}
            or receipt.get('profile') != PHASE_BUDGET_PROFILE
            or receipt.get('policyDigest') != policy.digest
            or type(receipt.get('affectedRows')) is not int
            or not 0 <= receipt['affectedRows'] <= policy.aggregate_affected_rows
            or receipt.get('nativeTransactionTimeoutMs') != policy.phase_timeout_ms
            or type(receipt.get('nativeTransactionTimeoutMs')) is not int
            or type(receipt.get('fillEffects')) is not list
            or len(receipt['fillEffects']) > MAX_PHASE_FILL_EFFECTS):
        raise CatalogError('phase-budget-receipt-invalid')
    total = 0
    step_ids: set[str] = set()
    for item in receipt['fillEffects']:
        if (type(item) is not dict or set(item) != {'stepId', 'operation', 'rows'}
                or type(item.get('stepId')) is not str
                or len(item['stepId']) != 10
                or not item['stepId'].startswith('step-')
                or not item['stepId'][5:].isascii()
                or not item['stepId'][5:].isdigit()
                or item['stepId'] in step_ids
                or not _valid_operation_id(item.get('operation'))
                or type(item.get('rows')) is not int or item['rows'] < 0):
            raise CatalogError('phase-budget-receipt-invalid')
        step_ids.add(item['stepId'])
        total += item['rows']
    if total != receipt['affectedRows']:
        raise CatalogError('phase-budget-receipt-invalid')


def require_retry_after_confirmed_abort(policy: FieldReplacementExecutionPolicy,
                                       original_policy_digest: str,
                                       native_abort_proof: object, *,
                                       phase_binding_digest: str | None = None,
                                       target_identity_digest: str | None = None,
                                       attempt_id: str | None = None) -> None:
    """Require a private native proof before a caller creates a fresh retry budget.

    The proof issuer is intentionally not defined in this source slice. A real
    provider must mint it only after positively observing rollback and absence
    of the committed phase-completion record for the same original phase/target.
    READY progress may remain after a known abort and must not be deleted or
    treated as evidence of a completed phase. Dictionaries, booleans and
    process-local errors are never proofs.
    """
    require_original_policy(policy, original_policy_digest)
    if type(native_abort_proof) is not _ConfirmedAbortProof:
        raise CatalogError('phase-retry-native-proof-required')
    if (native_abort_proof._seal is not _ABORT_PROOF_SEAL
            or native_abort_proof.phase_binding_digest != phase_binding_digest
            or native_abort_proof.target_identity_digest != target_identity_digest
            or native_abort_proof.attempt_id != attempt_id
            or native_abort_proof.policy_digest != policy.digest
            or native_abort_proof.rollback_confirmed is not True
            or native_abort_proof.phase_completion_absent is not True):
        raise CatalogError('phase-retry-native-proof-required')


class _ConfirmedAbortProof:
    __slots__ = ('_seal', 'phase_binding_digest', 'target_identity_digest',
                 'attempt_id', 'policy_digest', 'rollback_confirmed',
                 'phase_completion_absent')

    def __init__(self, seal: object, *, phase_binding_digest: str,
                 target_identity_digest: str, attempt_id: str,
                 policy_digest: str, rollback_confirmed: bool,
                 phase_completion_absent: bool):
        if seal is not _ABORT_PROOF_SEAL:
            raise TypeError('native abort proof is provider-issued')
        digests = (phase_binding_digest, target_identity_digest, policy_digest)
        if (any(type(value) is not str or len(value) != 64
                or any(ch not in '0123456789abcdef' for ch in value)
                for value in digests)
                or type(attempt_id) is not str or not attempt_id
                or type(rollback_confirmed) is not bool
                or type(phase_completion_absent) is not bool):
            raise TypeError('invalid provider abort observation')
        for name, value in (
                ('_seal', seal), ('phase_binding_digest', phase_binding_digest),
                ('target_identity_digest', target_identity_digest),
                ('attempt_id', attempt_id), ('policy_digest', policy_digest),
                ('rollback_confirmed', rollback_confirmed),
                ('phase_completion_absent', phase_completion_absent)):
            object.__setattr__(self, name, value)

    def __setattr__(self, name: str, value: object) -> None:
        raise AttributeError('native abort proof is immutable')


_ABORT_PROOF_SEAL = object()
