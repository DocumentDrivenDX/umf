# SPDX-License-Identifier: MIT OR Apache-2.0
"""Durable fail-closed fence for interrupted nontransactional migrations.

The fixed metadata head view is the ingress for every lifecycle data call.
Revoking its exact person/batch SELECT grants prevents using old references
between phases. The administrative source proof remains independent of clients.
"""
from __future__ import annotations

from contextlib import contextmanager
from uuid import uuid4

from .catalog import CatalogError, _execute, _one, _q
from .head_view import HEAD, _create_head_view, _head_shape


def _head_grants(connection, source, enabled):
    cfg=source['configuration']
    relation=_q(cfg['schema'])+'.'+_q(HEAD)
    roles=', '.join(_q(cfg[k]) for k in ('personRole','batchRole'))
    _execute(connection,('GRANT SELECT ON TABLE '+relation+' TO ' if enabled else 'REVOKE SELECT ON TABLE '+relation+' FROM ')+roles)


def _verify_phase_head(connection, source):
    """Accept only original fixed head shape, either live or exactly fenced."""
    cfg=source['configuration'];schema=cfg['schema']
    actual=_head_shape(connection,schema)
    temporary='umf_verify_'+uuid4().hex
    _create_head_view(connection,source,temporary)
    expected=_head_shape(connection,schema,temporary)
    if actual == expected:
        _execute(connection,'DROP VIEW '+_q(schema)+'.'+_q(temporary))
        return
    ids={_one(connection,'SELECT oid FROM pg_catalog.pg_roles WHERE rolname=%s',(cfg[k],))[0] for k in ('personRole','batchRole')}
    expected['acl']=[entry for entry in expected['acl'] if entry[1] not in ids]
    if actual != expected:
        raise CatalogError('head-view-catalog-mismatch')
    _execute(connection,'DROP VIEW '+_q(schema)+'.'+_q(temporary))


@contextmanager
def _unfenced_verification(connection, source):
    """Grant only inside an always-rolled-back savepoint; other sessions stay fenced."""
    class _RollbackVerification(Exception):
        pass
    try:
        with connection.transaction():
            _head_grants(connection,source,True)
            yield
            raise _RollbackVerification
    except _RollbackVerification:
        pass
