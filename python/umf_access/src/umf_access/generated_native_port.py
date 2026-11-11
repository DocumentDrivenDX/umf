# SPDX-License-Identifier: MIT OR Apache-2.0
"""Narrow target-owned port for verifier-issued generated native reads.

This port is the only cross-layer surface used by the generated adapter. It
keeps session leasing, lifecycle observations, result validation, and error
redaction owned by UMF's established native runtime.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from .unified.head_session import (
    _check_principal,
    _drive_async,
    _prepare_generated,
)
from .unified.operation_values import (
    bounded_size,
    digest,
    generated_read_value_from_native,
    loads,
    native_arguments,
    reason_code,
    result_frame,
)
from .unified.session_policy import (
    ROLE_SETTINGS_CHECK,
    SessionError,
    SessionIdentity,
    _effective_settings,
)
from .unified.table_reads import _supported_obligations, _TableReader


class GeneratedNativeExecutionPort:
    """Fixed operations shared by generated readers and UMF native sessions."""

    prepare_probe = staticmethod(_prepare_generated)
    check_principal = staticmethod(_check_principal)
    drive_async = staticmethod(_drive_async)
    bounded_size = staticmethod(bounded_size)
    digest = staticmethod(digest)
    read_value = staticmethod(generated_read_value_from_native)
    loads = staticmethod(loads)
    native_arguments = staticmethod(native_arguments)
    reason_code = staticmethod(reason_code)
    result_frame = staticmethod(result_frame)
    supported_obligations = staticmethod(_supported_obligations)
    validate_read_columns = staticmethod(_TableReader._columns)

    @staticmethod
    @asynccontextmanager
    async def open_request_snapshot(
        session, identity: SessionIdentity
    ) -> AsyncIterator[object]:
        """Open only the generated request's adapter-owned RR data lease."""
        async with session._open_snapshot(identity) as native:
            yield native

    @staticmethod
    async def request_settings(session, native, identity, expected=None):
        """Recheck the admitted host role and settings on one held lease."""
        async with session.control_cursor(native) as cursor:
            await cursor.execute(ROLE_SETTINGS_CHECK)
            row = await cursor.fetchone()
        observed = _effective_settings(
            row,
            session.policy.role(identity),
            expected[0] if expected is not None else None,
        )
        if expected is not None and observed != expected:
            raise SessionError("request snapshot session settings changed")
        return observed
