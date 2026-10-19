# SPDX-License-Identifier: MIT OR Apache-2.0
"""Trusted install-reference issuance and read-only current-head observation.

References are trusted host configuration, never client-supplied capabilities.
Observing a head does not admit a data operation or freeze native role catalogs.
"""
from __future__ import annotations

import hashlib
import json
import re
from typing import Any, cast

from .catalog import CatalogError, _execute, _one, _q
from .head_view import HEAD, _head_oid, _head_shape
from .ledger_schema import _history_shape
from .witness import _json_bytes

_REFERENCE_KEYS = {'version','bundleDigest','sourceDigest','configurationDigest',
                   'generation','headDigest','planDigest','headRelationOid','headShape',
                   'nativeWitness','historyShape','referenceDigest'}
_MAX_REFERENCE_BYTES = 16*1024*1024


def _normalized(value: Any) -> Any:
    raw = _json_bytes(value)
    if len(raw) > _MAX_REFERENCE_BYTES:
        raise CatalogError('installation-reference-capacity')
    return json.loads(raw)


def _issue_reference(connection: Any, source: dict[str, Any], entry: dict[str, Any]) -> dict[str, Any]:
    """Call only after full original-source native verification under install lock."""
    schema = source['configuration']['schema']
    reference = _normalized({'version':'umf.table-installation/0.1',
        'bundleDigest':source['bundleDigest'],'sourceDigest':source['sourceDigest'],
        'configurationDigest':source['configurationDigest'],'generation':entry['position'],
        'headDigest':entry['entryDigest'],'planDigest':entry['plan']['digest'],
        'headRelationOid':_head_oid(connection,schema),'headShape':_head_shape(connection,schema),
        'historyShape':_history_shape(connection,schema),
        'nativeWitness':entry['witness']})
    reference['referenceDigest'] = hashlib.sha256(_json_bytes(reference)).hexdigest()
    return reference


def _checked_reference(reference: dict[str, object], source: dict[str, Any]) -> dict[str, Any]:
    if type(reference) is not dict or set(reference) != _REFERENCE_KEYS:
        raise CatalogError('installation-reference-mismatch')
    checked = _normalized(reference)
    digest = checked.pop('referenceDigest')
    if (checked['version'] != 'umf.table-installation/0.1'
            or digest != hashlib.sha256(_json_bytes(checked)).hexdigest()
            or any(checked[key] != source[key] for key in ('bundleDigest','sourceDigest','configurationDigest'))
            or type(checked['generation']) is not int or not 1 <= checked['generation'] <= 128
            or type(checked['headRelationOid']) is not int or not 1 <= checked['headRelationOid'] < 2**32
            or any(type(checked[k]) is not str or not re.fullmatch('[a-f0-9]{64}',checked[k]) for k in ('headDigest','planDigest'))
            or type(checked['headShape']) is not dict or type(checked['nativeWitness']) is not dict
            or type(checked['historyShape']) is not dict):
        raise CatalogError('installation-reference-mismatch')
    checked['referenceDigest'] = digest
    return cast(dict[str, Any],checked)


def read_table_head(connection: Any, bundle: dict[str, object], reference: dict[str, object], *,
                    statement_timeout_ms: int = 30_000, lock_timeout_ms: int = 5_000) -> dict[str, object]:
    """Observe a trusted installation's current head as an ordinary Psycopg3 role.

    The host persists the administrative reference after commit and supplies it
    with the expected original bundle. A hash is consistency, not authentication.
    Requires an active READ COMMITTED transaction, including read-only ones.
    Holds the shared lifecycle lock until the caller ends that transaction;
    failure rolls back only this function's savepoint. No data admission occurs.
    """
    from psycopg import Error as NativeError
    from umf_codegen import verify_table_deployment

    for timeout in (statement_timeout_ms,lock_timeout_ms):
        if type(timeout) is not int or not 1 <= timeout <= 300_000:
            raise ValueError('head timeouts must be 1..300000 milliseconds')
    try:
        source = cast(dict[str, Any],verify_table_deployment(bundle))
    except (ValueError,TypeError):
        raise CatalogError('source-mismatch') from None
    expected = _checked_reference(reference,source)
    if int(connection.info.transaction_status) != 2:
        raise CatalogError('transaction-required')
    schema = source['configuration']['schema']
    try:
        with connection.transaction():
            previous = _one(connection,"SELECT pg_catalog.current_setting('statement_timeout'),pg_catalog.current_setting('lock_timeout')")
            _one(connection,"SELECT pg_catalog.set_config('statement_timeout',%s,true),pg_catalog.set_config('lock_timeout',%s,true)",(str(statement_timeout_ms),str(lock_timeout_ms)))
            state = _one(connection,"""SELECT current_user,pg_catalog.current_schemas(false),
pg_catalog.current_setting('server_version_num')::pg_catalog.int4,
pg_catalog.current_setting('row_security'),pg_catalog.current_setting('session_replication_role'),
pg_catalog.current_setting('server_encoding'),pg_catalog.current_setting('transaction_isolation')""")
            if state[1] != ['pg_catalog'] or state[2]//10000 != 18 or tuple(state[3:]) != ('on','origin','UTF8','read committed'):
                raise CatalogError('head-context-mismatch')
            lock = int.from_bytes(hashlib.sha256(('umf.table-lifecycle/0.1\0'+schema).encode()).digest()[:8],'big',signed=True)
            _one(connection,'SELECT pg_catalog.pg_advisory_xact_lock_shared(%s)',(lock,))
            # Refuse unknown targets before LOCK traverses view dependencies.
            # Recheck after locking, before executing any view expression.
            if (_head_oid(connection,schema) != expected['headRelationOid']
                    or _normalized(_head_shape(connection,schema)) != expected['headShape']):
                raise CatalogError('head-view-catalog-mismatch')
            if _normalized(_history_shape(connection,schema)) != expected['historyShape']:
                raise CatalogError('history-catalog-mismatch')
            _execute(connection,'LOCK TABLE '+_q(schema)+'.'+_q(HEAD)+' IN ACCESS SHARE MODE')
            location = _one(connection,'''SELECT d.oid,d.datname,n.oid,n.nspowner
FROM pg_catalog.pg_database d,pg_catalog.pg_namespace n
WHERE d.datname=pg_catalog.current_database() AND n.nspname=%s''',(schema,))
            witness = expected['nativeWitness']
            if (location is None or list(location[:2]) != witness.get('database')
                    or list(location[2:]) != witness.get('schema')
                    or state[2] != witness.get('serverVersion')):
                raise CatalogError('installation-location-mismatch')
            if (_head_oid(connection,schema) != expected['headRelationOid']
                    or _normalized(_head_shape(connection,schema)) != expected['headShape']):
                raise CatalogError('head-view-catalog-mismatch')
            if _normalized(_history_shape(connection,schema)) != expected['historyShape']:
                raise CatalogError('history-catalog-mismatch')
            relation = _q(schema)+'.'+_q(HEAD)
            row = _one(connection,'''SELECT generation,head_digest,plan_digest,bundle_digest,source_digest,
configuration_digest,pg_catalog.octet_length(native_witness::pg_catalog.text) FROM '''+relation)
            if row is None or tuple(row[:6]) != tuple(expected[k] for k in ('generation','headDigest','planDigest','bundleDigest','sourceDigest','configurationDigest')):
                raise CatalogError('installed-generation-mismatch')
            if type(row[6]) is not int or not 0 < row[6] <= _MAX_REFERENCE_BYTES:
                raise CatalogError('installation-reference-capacity')
            if _one(connection,'SELECT native_witness FROM '+relation)[0] != expected['nativeWitness']:
                raise CatalogError('installed-generation-mismatch')
            _one(connection,"SELECT pg_catalog.set_config('statement_timeout',%s,true),pg_catalog.set_config('lock_timeout',%s,true)",tuple(previous))
            return {'bundleDigest':source['bundleDigest'],'headDigest':expected['headDigest'],
                    'generation':expected['generation'],'referenceDigest':expected['referenceDigest'],
                    'observedPrincipal':state[0],'lifecycleAdmission':False}
    except CatalogError:
        raise
    except (NativeError,ValueError,TypeError,KeyError,IndexError):
        raise CatalogError('head-observation-failed') from None
