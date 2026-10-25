# SPDX-License-Identifier: MIT OR Apache-2.0
"""Closed trusted policy profiles for G04 checked field conversion.

The policy binds the complete G11 phase policy and conversion resource limits.
Only trusted unsigned constructors supply defaults. Signed normal forms are
parsed as complete closed records so a resume cannot invent or raise capacity.
This module does not execute conversions or authorize a native provider.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Any

from .catalog import CatalogError
from .phase_policy import (
    DERIVED_ADMIN_MODULE_PROFILE,
    FieldReplacementExecutionPolicy,
)
from .phase_policy import (
    EXECUTION_POLICY_PROFILE as G11_EXECUTION_POLICY_PROFILE,
)

G04_EXECUTION_POLICY_01 = 'umf.g04.execution-policy/0.1'
G04_EXECUTION_POLICY_02 = 'umf.g04.execution-policy/0.2'
DEFAULT_CONVERSION_ENTRY_LIMIT = 100_000
MAX_CONVERSION_ENTRY_LIMIT = 1_000_000
DEFAULT_RETAINED_LOGICAL_BYTES_LIMIT = 67_108_864
MAX_RETAINED_LOGICAL_BYTES_LIMIT = 1_073_741_824
DEFAULT_MAX_ISSUED_INSTANCES = 1_000_000
MAX_ISSUED_INSTANCES = 1_000_000

_POLICY_01_KEYS = frozenset({
    'version', 'phasePolicy', 'conversionEntryLimit', 'retainedLogicalBytesLimit',
})
_POLICY_02_KEYS = _POLICY_01_KEYS | {'maxIssuedInstances'}
_PHASE_KEYS = frozenset({
    'version', 'phaseTimeoutMs', 'aggregateAffectedRows', 'statementTimeoutMs',
    'lockTimeoutMs', 'derivedModuleProfile',
})


def _canonical_bytes(value: Any) -> bytes:
    """Serialize the validated JSON-value subset in deterministic compact form."""
    try:
        return json.dumps(value, ensure_ascii=False, sort_keys=True,
                          separators=(',', ':'), allow_nan=False).encode('utf-8')
    except (TypeError, ValueError, UnicodeEncodeError):
        raise CatalogError('g04-execution-policy-invalid') from None


def _exact_int(value: object, minimum: int, maximum: int) -> bool:
    return type(value) is int and minimum <= value <= maximum


def _phase_policy_from_normal_form(value: object) -> FieldReplacementExecutionPolicy:
    if type(value) is not dict or set(value) != _PHASE_KEYS:
        raise CatalogError('g04-execution-policy-invalid')
    if (value['version'] != G11_EXECUTION_POLICY_PROFILE
            or value['derivedModuleProfile'] != DERIVED_ADMIN_MODULE_PROFILE):
        raise CatalogError('g04-execution-policy-invalid')
    # The G11 policy constructor enforces exact integer types (not bools),
    # complete fixed ranges and its timeout ordering.
    try:
        return FieldReplacementExecutionPolicy(
            phase_timeout_ms=value['phaseTimeoutMs'],
            aggregate_affected_rows=value['aggregateAffectedRows'],
            statement_timeout_ms=value['statementTimeoutMs'],
            lock_timeout_ms=value['lockTimeoutMs'],
        )
    except (CatalogError, TypeError):
        raise CatalogError('g04-execution-policy-invalid') from None


@dataclass(frozen=True, slots=True)
class G04ExecutionPolicy:
    """Validated immutable G04 policy; construction never supplies defaults."""

    version: str
    phase_policy: FieldReplacementExecutionPolicy
    conversion_entry_limit: int
    retained_logical_bytes_limit: int
    max_issued_instances: int | None = None

    def __post_init__(self) -> None:
        if type(self.version) is not str or type(self.phase_policy) is not FieldReplacementExecutionPolicy:
            raise CatalogError('g04-execution-policy-invalid')
        if not _exact_int(self.conversion_entry_limit, 0, MAX_CONVERSION_ENTRY_LIMIT):
            raise CatalogError('g04-execution-policy-invalid')
        if not _exact_int(self.retained_logical_bytes_limit, 0,
                          MAX_RETAINED_LOGICAL_BYTES_LIMIT):
            raise CatalogError('g04-execution-policy-invalid')
        if self.version == G04_EXECUTION_POLICY_01:
            if self.max_issued_instances is not None:
                raise CatalogError('g04-execution-policy-invalid')
        elif self.version == G04_EXECUTION_POLICY_02:
            if not _exact_int(self.max_issued_instances, 1, MAX_ISSUED_INSTANCES):
                raise CatalogError('g04-execution-policy-invalid')
        else:
            raise CatalogError('g04-execution-policy-invalid')

    @classmethod
    def trusted_nonretained(
        cls,
        *,
        phase_policy: FieldReplacementExecutionPolicy | None = None,
        conversion_entry_limit: int = DEFAULT_CONVERSION_ENTRY_LIMIT,
        retained_logical_bytes_limit: int = DEFAULT_RETAINED_LOGICAL_BYTES_LIMIT,
    ) -> G04ExecutionPolicy:
        """Construct the finite .1 profile from trusted host settings."""
        if phase_policy is None:
            phase_policy = FieldReplacementExecutionPolicy()
        return cls(
            G04_EXECUTION_POLICY_01, phase_policy, conversion_entry_limit,
            retained_logical_bytes_limit,
        )

    @classmethod
    def trusted_retained(
        cls,
        *,
        phase_policy: FieldReplacementExecutionPolicy | None = None,
        conversion_entry_limit: int = DEFAULT_CONVERSION_ENTRY_LIMIT,
        retained_logical_bytes_limit: int = DEFAULT_RETAINED_LOGICAL_BYTES_LIMIT,
        max_issued_instances: int = DEFAULT_MAX_ISSUED_INSTANCES,
    ) -> G04ExecutionPolicy:
        """Construct retained mode .2; capacity defaulting is trusted-only."""
        if phase_policy is None:
            phase_policy = FieldReplacementExecutionPolicy()
        return cls(
            G04_EXECUTION_POLICY_02, phase_policy, conversion_entry_limit,
            retained_logical_bytes_limit, max_issued_instances,
        )

    @classmethod
    def from_signed_normal_form(
        cls, value: object, *, retained_originals: bool,
    ) -> G04ExecutionPolicy:
        """Validate a decoded signed policy without filling any missing member.

        The caller verifies the enclosing owner signature and digest. This
        method validates the exact closed policy shape and mode/profile match.
        """
        if type(retained_originals) is not bool or type(value) is not dict:
            raise CatalogError('g04-execution-policy-invalid')
        version = value.get('version')
        if retained_originals:
            if version != G04_EXECUTION_POLICY_02 or set(value) != _POLICY_02_KEYS:
                raise CatalogError('g04-execution-policy-invalid')
        elif version != G04_EXECUTION_POLICY_01 or set(value) != _POLICY_01_KEYS:
            raise CatalogError('g04-execution-policy-invalid')
        phase_policy = _phase_policy_from_normal_form(value['phasePolicy'])
        return cls(
            version,
            phase_policy,
            value['conversionEntryLimit'],
            value['retainedLogicalBytesLimit'],
            value.get('maxIssuedInstances'),
        )

    def normal_form(self) -> dict[str, Any]:
        value: dict[str, Any] = {
            'version': self.version,
            'phasePolicy': self.phase_policy.normal_form(),
            'conversionEntryLimit': self.conversion_entry_limit,
            'retainedLogicalBytesLimit': self.retained_logical_bytes_limit,
        }
        if self.version == G04_EXECUTION_POLICY_02:
            value['maxIssuedInstances'] = self.max_issued_instances
        return value

    def canonical_bytes(self) -> bytes:
        return _canonical_bytes(self.normal_form())

    @property
    def digest(self) -> str:
        return hashlib.sha256(self.canonical_bytes()).hexdigest()


def require_original_policy(policy: G04ExecutionPolicy, original_digest: str) -> None:
    """Require the exact originally approved policy, including retained cap."""
    if (type(policy) is not G04ExecutionPolicy
            or type(original_digest) is not str
            or len(original_digest) != 64
            or any(ch not in '0123456789abcdef' for ch in original_digest)
            or policy.digest != original_digest):
        raise CatalogError('g04-execution-policy-mismatch')
