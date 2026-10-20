# SPDX-License-Identifier: MIT OR Apache-2.0
"""Trusted install-reference issuance and read-only current-head observation.

References are trusted host configuration, never client-supplied capabilities.
Observing a head does not admit a data operation or freeze native role catalogs.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import re
from concurrent.futures import ThreadPoolExecutor
from typing import Any, cast

from .catalog import CatalogError, _q, _q_bound
from .head_view import HEAD, _head_oid, _head_oid_steps, _head_shape, _head_shape_steps
from .ledger_schema import _history_shape, _history_shape_steps
from .outcome_schema import _outcome_shape, _outcome_shape_steps
from .probe import _Query, _run
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
    outcome_shape=_outcome_shape(connection,schema)
    if outcome_shape is not None:
        reference.update(version='umf.table-installation/0.2',outcomeShape=_normalized(outcome_shape))
    reference['referenceDigest'] = hashlib.sha256(_json_bytes(reference)).hexdigest()
    return reference


def _checked_reference(reference: dict[str, object], source: dict[str, Any]) -> dict[str, Any]:
    if type(reference) is not dict or set(reference) != (_REFERENCE_KEYS | {'outcomeShape'} if reference.get('version')=='umf.table-installation/0.2' else _REFERENCE_KEYS):
        raise CatalogError('installation-reference-mismatch')
    checked = _normalized(reference)
    digest = checked.pop('referenceDigest')
    if (checked['version'] not in ('umf.table-installation/0.1','umf.table-installation/0.2')
            or checked['version']=='umf.table-installation/0.2' and type(checked['outcomeShape']) is not dict
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


class TableHeadProbe:
    """Prepared library-owned metadata checks; not a data admission capability.

    Construct with prepare_table_head. Source and expected native metadata are
    copied by their original verifiers. Drivers only schedule its fixed queries.
    """
    __slots__ = ('_expected', '_lock_timeout_ms', '_source', '_statement_timeout_ms')

    def __init__(self, source: dict[str, Any], expected: dict[str, Any], statement_timeout_ms: int, lock_timeout_ms: int):
        self._source,self._expected = source,expected
        self._statement_timeout_ms,self._lock_timeout_ms = statement_timeout_ms,lock_timeout_ms

    @property
    def schema(self) -> str:
        return self._source['configuration']['schema']

    def steps(self) -> Any:
        return _head_steps(self._source,self._expected,self._statement_timeout_ms,self._lock_timeout_ms)


def prepare_table_head(bundle: dict[str, object], reference: dict[str, object], *,
                       statement_timeout_ms: int = 30_000, lock_timeout_ms: int = 5_000) -> TableHeadProbe:
    """Reverify original source and trusted reference before any lease or query.

    The reference is trusted deployment configuration, never wire authority.
    No connection, executable callback or SQL text is accepted from a document.
    """
    for timeout in (statement_timeout_ms,lock_timeout_ms):
        if type(timeout) is not int or not 1 <= timeout <= 300_000:
            raise ValueError('head timeouts must be 1..300000 milliseconds')
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        source = _original_source(bundle)
    else:
        # A synchronous host call remains synchronous inside a running loop.
        # Only bounded CPU verification moves to a worker, never the connection;
        # no coroutine is run or scheduled by this synchronous entry point.
        with ThreadPoolExecutor(max_workers=1) as worker:
            source = worker.submit(_original_source,bundle).result()
    return TableHeadProbe(source,_checked_reference(reference,source),statement_timeout_ms,lock_timeout_ms)


def _original_source(bundle: dict[str, object]) -> dict[str, Any]:
    from umf_codegen import verify_table_deployment
    try:
        return cast(dict[str, Any],verify_table_deployment(bundle))
    except (ValueError,TypeError):
        raise CatalogError('source-mismatch') from None


def read_table_head(connection: Any, bundle: dict[str, object], reference: dict[str, object], *,
                    statement_timeout_ms: int = 30_000, lock_timeout_ms: int = 5_000) -> dict[str, object]:
    """Psycopg3 caller-transaction observer; never commit or admit data methods.

    Ordinary adapters schedule the same prepared checks through per-call leases.
    The shared lifecycle lock lasts until the caller ends this transaction.
    """
    from psycopg import Error as NativeError

    probe = prepare_table_head(bundle,reference,statement_timeout_ms=statement_timeout_ms,lock_timeout_ms=lock_timeout_ms)
    if int(connection.info.transaction_status) != 2:
        raise CatalogError('transaction-required')
    try:
        with connection.transaction():
            return _run(connection,probe.steps())
    except CatalogError:
        raise
    except (NativeError,ValueError,TypeError,KeyError,IndexError):
        raise CatalogError('head-observation-failed') from None


def _head_steps(source, expected, statement_timeout_ms, lock_timeout_ms):
    schema = source['configuration']['schema']
    previous = (yield _Query('one', "SELECT pg_catalog.current_setting('statement_timeout'),pg_catalog.current_setting('lock_timeout')", ()))
    yield _Query('one', "SELECT pg_catalog.set_config('statement_timeout',%s,true),pg_catalog.set_config('lock_timeout',%s,true)", (str(statement_timeout_ms), str(lock_timeout_ms)))
    state = (yield _Query('one', "SELECT current_user,pg_catalog.current_schemas(false),\npg_catalog.current_setting('server_version_num')::pg_catalog.int4,\npg_catalog.current_setting('row_security'),pg_catalog.current_setting('session_replication_role'),\npg_catalog.current_setting('server_encoding'),pg_catalog.current_setting('transaction_isolation')", ()))
    if state[1] != ['pg_catalog'] or state[2] // 10000 != 18 or tuple(state[3:]) != ('on', 'origin', 'UTF8', 'read committed'):
        raise CatalogError('head-context-mismatch')
    lock = int.from_bytes(hashlib.sha256(('umf.table-lifecycle/0.1\x00' + schema).encode()).digest()[:8], 'big', signed=True)
    yield _Query('one', 'SELECT pg_catalog.pg_advisory_xact_lock_shared(%s)', (lock,))
    if (yield from _head_oid_steps(schema)) != expected['headRelationOid'] or _normalized((yield from _head_shape_steps(schema))) != expected['headShape']:
        raise CatalogError('head-view-catalog-mismatch')
    if _normalized((yield from _history_shape_steps(schema))) != expected['historyShape']:
        raise CatalogError('history-catalog-mismatch')
    if _normalized((yield from _outcome_shape_steps(schema))) != expected.get('outcomeShape'):
        raise CatalogError('outcome-catalog-mismatch')
    yield _Query('execute', 'LOCK TABLE ' + _q(schema) + '.' + _q(HEAD) + ' IN ACCESS SHARE MODE', ())
    location = (yield _Query('one', 'SELECT d.oid,d.datname,n.oid,n.nspowner\nFROM pg_catalog.pg_database d,pg_catalog.pg_namespace n\nWHERE d.datname=pg_catalog.current_database() AND n.nspname=%s', (schema,)))
    witness = expected['nativeWitness']
    if location is None or list(location[:2]) != witness.get('database') or list(location[2:]) != witness.get('schema') or (state[2] != witness.get('serverVersion')):
        raise CatalogError('installation-location-mismatch')
    if (yield from _head_oid_steps(schema)) != expected['headRelationOid'] or _normalized((yield from _head_shape_steps(schema))) != expected['headShape']:
        raise CatalogError('head-view-catalog-mismatch')
    if _normalized((yield from _history_shape_steps(schema))) != expected['historyShape']:
        raise CatalogError('history-catalog-mismatch')
    if _normalized((yield from _outcome_shape_steps(schema))) != expected.get('outcomeShape'):
        raise CatalogError('outcome-catalog-mismatch')
    relation = _q(schema) + '.' + _q(HEAD)
    row = (yield _Query('one', 'SELECT generation,head_digest,plan_digest,bundle_digest,source_digest,\nconfiguration_digest,pg_catalog.octet_length(native_witness::pg_catalog.text) FROM ' + relation, ()))
    if row is None or tuple(row[:6]) != tuple(expected[k] for k in ('generation', 'headDigest', 'planDigest', 'bundleDigest', 'sourceDigest', 'configurationDigest')):
        raise CatalogError('installed-generation-mismatch')
    if type(row[6]) is not int or not 0 < row[6] <= _MAX_REFERENCE_BYTES:
        raise CatalogError('installation-reference-capacity')
    if (yield _Query('one', 'SELECT native_witness FROM ' + relation, ()))[0] != expected['nativeWitness']:
        raise CatalogError('installed-generation-mismatch')
    yield _Query('one', "SELECT pg_catalog.set_config('statement_timeout',%s,true),pg_catalog.set_config('lock_timeout',%s,true)", tuple(previous))
    return {'bundleDigest': source['bundleDigest'], 'headDigest': expected['headDigest'], 'generation': expected['generation'], 'referenceDigest': expected['referenceDigest'], 'observedPrincipal': state[0], 'lifecycleAdmission': False}


def _operation_head_steps(source, expected, principal):
    """Take the short operation observation under the shared lifecycle lock.

    The install reference is already verified and owned by this prepared probe.
    This deliberately checks only immutable head/location pins and session
    context; diagnostic ``steps()`` remains the full catalog auditor.
    """
    schema = source['configuration']['schema']
    lock = int.from_bytes(hashlib.sha256(('umf.table-lifecycle/0.1\x00' + schema).encode()).digest()[:8], 'big', signed=True)
    yield _Query('one', 'SELECT pg_catalog.pg_advisory_xact_lock_shared(%s)', (lock,))
    relation = _q_bound(schema) + '.' + _q_bound(HEAD)
    row = yield _Query('one', """SELECT current_user,pg_catalog.current_schemas(false),
pg_catalog.current_setting('server_version_num')::pg_catalog.int4,
pg_catalog.current_setting('row_security'),pg_catalog.current_setting('session_replication_role'),
pg_catalog.current_setting('server_encoding'),pg_catalog.current_setting('transaction_isolation'),
d.oid,d.datname,n.oid,n.nspowner,c.oid,
h.generation,h.head_digest,h.plan_digest
FROM pg_catalog.pg_database d
JOIN pg_catalog.pg_namespace n ON n.nspname=%s
JOIN pg_catalog.pg_class c ON c.relnamespace=n.oid AND c.relname=%s
JOIN """ + relation + """ h ON TRUE
WHERE d.datname=pg_catalog.current_database()""", (schema, HEAD))
    if row is None:
        raise CatalogError('installed-generation-mismatch')
    if (row[0] != principal or row[1] != ['pg_catalog'] or row[2] // 10000 != 18
            or tuple(row[3:7]) != ('on', 'origin', 'UTF8', 'read committed')):
        raise CatalogError('head-context-mismatch' if row[0] == principal else 'principal-mismatch')
    witness = expected['nativeWitness']
    if (list(row[7:9]) != witness.get('database') or list(row[9:11]) != witness.get('schema')
            or row[11] != expected['headRelationOid'] or row[2] != witness.get('serverVersion')):
        raise CatalogError('installation-location-mismatch')
    if tuple(row[12:15]) != tuple(expected[k] for k in ('generation', 'headDigest', 'planDigest')):
        raise CatalogError('installed-generation-mismatch')
    return {'bundleDigest': source['bundleDigest'], 'headDigest': expected['headDigest'],
            'generation': expected['generation'], 'referenceDigest': expected['referenceDigest'],
            'observedPrincipal': row[0], 'lifecycleAdmission': False}
