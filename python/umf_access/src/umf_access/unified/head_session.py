# SPDX-License-Identifier: MIT OR Apache-2.0
"""Schedule closed native-head checks through existing per-call session leases.

These observations never grant data-operation admission. No source plan SQL,
installer authority, process-global pool or caller-selected query is accepted.
"""
from __future__ import annotations

import asyncio
from typing import Any

from umf_access.lifecycle import (
    CatalogError,
    prepare_table_correspondence,
    prepare_table_head,
)

from .session_async import AsyncSession
from .session_policy import SessionError, SessionIdentity
from .session_sync import SyncSession


def _prepare(session, identity, bundle, reference, correspondence=False):
    session.policy.role(identity)  # reject unregistered subjects before source work or leases
    if not session.policy.catalog_only:
        raise SessionError('head observation requires catalog-only session resolution')
    options = {'statement_timeout_ms':session.policy.statement_timeout_ms,'lock_timeout_ms':session.policy.lock_timeout_ms}
    if correspondence:
        probe = prepare_table_correspondence(bundle,reference,principal_role=session.policy.role(identity),audience=identity.kind,**options)
    else:
        probe = prepare_table_head(bundle,reference,**options)
    if probe.schema != session.policy.schema:
        raise SessionError('head source differs from the isolated session schema')
    return probe


def _check_principal(session, identity, result):
    if result.get('observedPrincipal') != session.policy.role(identity) or result.get('lifecycleAdmission') is not False:
        raise SessionError('head observation differs from the selected principal')
    return result


def _drive(session, native, steps):
    try:
        query = next(steps)
        while True:
            with session.control_cursor(native) as cursor:
                cursor.execute(query.statement,query.parameters) if query.parameters or query.kind=='frame' else cursor.execute(query.statement)
                if query.kind == 'one':
                    value = cursor.fetchone()
                elif query.kind == 'all':
                    value = cursor.fetchall()
                elif query.kind == 'execute':
                    value = None
                elif query.kind == 'frame':
                    value = ([c[0] for c in cursor.description],cursor.fetchall())
                else:
                    raise SessionError('unknown internal observation step')
            query = steps.send(value)
    except StopIteration as result:
        return result.value
    finally:
        steps.close()


async def _drive_async(session, native, steps):
    try:
        query = next(steps)
        while True:
            async with session.control_cursor(native) as cursor:
                if query.parameters or query.kind=='frame':
                    await cursor.execute(query.statement,query.parameters)
                else:
                    await cursor.execute(query.statement)
                if query.kind == 'one':
                    value = await cursor.fetchone()
                elif query.kind == 'all':
                    value = await cursor.fetchall()
                elif query.kind == 'execute':
                    value = None
                elif query.kind == 'frame':
                    value = ([c[0] for c in cursor.description],await cursor.fetchall())
                else:
                    raise SessionError('unknown internal observation step')
            query = steps.send(value)
    except StopIteration as result:
        return result.value
    finally:
        steps.close()


def observe_table_head(session: SyncSession, identity: SessionIdentity,
                       bundle: dict[str, object], reference: dict[str, object]) -> dict[str, Any]:
    """Use one authenticated sync lease, preserving its declared TX ownership."""
    probe = _prepare(session,identity,bundle,reference)
    try:
        with session.open(identity,read_only=True) as native:
            return _check_principal(session,identity,_drive(session,native,probe.steps()))
    except (CatalogError,SessionError):
        raise
    except Exception:  # noqa: BLE001 -- sanitize optional native-driver/verifier errors at the SDK boundary
        raise SessionError('native head observation failed') from None


async def observe_table_head_async(session: AsyncSession, identity: SessionIdentity,
                                  bundle: dict[str, object], reference: dict[str, object]) -> dict[str, Any]:
    """Async counterpart; cancellation propagates after shielded lease cleanup."""
    # Source preparation invokes the synchronous native bundle verifier. Run it
    # off the event loop; it has no driver/lease access, so cancelled preparation
    # cannot later acquire a connection. All database IO stays async.
    probe = await asyncio.to_thread(_prepare,session,identity,bundle,reference)
    try:
        async with session.open(identity,read_only=True) as native:
            return _check_principal(session,identity,await _drive_async(session,native,probe.steps()))
    except (CatalogError,SessionError):
        raise
    except Exception:  # noqa: BLE001 -- sanitize optional native-driver/verifier errors at the SDK boundary
        raise SessionError('native head observation failed') from None


def verify_table_correspondence(session: SyncSession, identity: SessionIdentity,
                                bundle: dict[str, object], reference: dict[str, object]) -> dict[str, Any]:
    """Observe live roles/ACLs/table shape in one lease; never admit an operation."""
    probe = _prepare(session,identity,bundle,reference,True)
    try:
        with session.open(identity,read_only=True) as native:
            return _check_principal(session,identity,_drive(session,native,probe.steps()))
    except (CatalogError,SessionError):
        raise
    except Exception:  # noqa: BLE001 -- sanitize optional native-driver/verifier errors at the SDK boundary
        raise SessionError('native table correspondence failed') from None


async def verify_table_correspondence_async(session: AsyncSession, identity: SessionIdentity,
                                           bundle: dict[str, object], reference: dict[str, object]) -> dict[str, Any]:
    """Async live correspondence using the same fixed checks and cleanup contract."""
    probe = await asyncio.to_thread(_prepare,session,identity,bundle,reference,True)
    try:
        async with session.open(identity,read_only=True) as native:
            return _check_principal(session,identity,await _drive_async(session,native,probe.steps()))
    except (CatalogError,SessionError):
        raise
    except Exception:  # noqa: BLE001 -- sanitize optional native-driver/verifier errors at the SDK boundary
        raise SessionError('native table correspondence failed') from None
