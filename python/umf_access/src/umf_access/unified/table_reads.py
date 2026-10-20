# SPDX-License-Identifier: MIT OR Apache-2.0
"""Declared native reads with source approval, live correspondence and scoped paging.

The host supplies authenticated identities and session leases. Neither SQL nor
compiled programs are accepted from callers. Writes require the separate durable
outcome protocol and are deliberately refused by this read-only entry point.
"""
from __future__ import annotations

import asyncio
import copy
import os
import threading
from uuid import uuid4

from .head_session import _check_principal, _drive, _drive_async, _prepare
from .operation_values import (
    canonical,
    digest,
    loads,
    native_arguments,
    result_frame,
    token_decode,
)
from .session_async import AsyncSession
from .session_policy import SessionError, SessionIdentity
from .session_sync import SyncSession


def _obligations(context, source, declaration, batch=False):
    """Closed host profile: a future obligation cannot be silently ignored."""
    module_index, module = next((i,m) for i,m in enumerate(source['modules']) if m['id']==context['module'])
    table_index, table = next((i,t) for i,t in enumerate(module['extensions']['umf.tables']['tables'])
                             if t['id']==declaration['body']['table'])
    body=declaration['body'];kind=body['kind'];read=kind=='read'
    commands=['select'] if read else ['insert'] if kind=='insertFrom' else ['insert','update','select'] if kind=='upsert' and body['onConflict']=='update' else ['insert','select'] if kind=='upsert' else [kind]
    def reads_column(predicate):
        return ('field' in predicate or 'matches' in predicate or any(reads_column(p) for p in predicate.get('args',[]))
                or 'arg' in predicate and reads_column(predicate['arg']))
    if (body.get('returning') or reads_column(body.get('where',{}))) and 'select' not in commands:
        commands.append('select')
    touched={table['id']:(table_index,table,commands)}
    if kind=='insertFrom':
        source_index,source_table=next((i,t) for i,t in enumerate(module['extensions']['umf.tables']['tables'])
                                     if t['id']==body['source']['table'])
        if source_table['id']==table['id']:
            if 'select' not in commands:commands.append('select')
        else:touched[source_table['id']]=(source_index,source_table,['select'])
    def related_tables(node):
        if node.get('op')=='related':
            index,current=next((i,t) for i,t in enumerate(module['extensions']['umf.tables']['tables']) if t['id']==node['table'])
            if current['id'] in touched:
                if 'select' not in touched[current['id']][2]:touched[current['id']][2].append('select')
            else:touched[current['id']]=(index,current,['select'])
            related_tables(node['where'])
        for child in node.get('args',[]):related_tables(child)
        if 'arg' in node:related_tables(node['arg'])
    related_tables(body.get('where',{}))
    if kind=='insertFrom':related_tables(body['source']['where'])
    ordered=list(touched.values())
    if len(ordered)>1:
        records={e['id']:e for e in module['elements'] if e['kind']=='record'}
        ordered.sort(key=lambda item:(module['namespace'],records[item[1]['record']['element']].get('name',item[1]['record']['element'])))
    return {
        'consistency':declaration['consistency'],
        'cursorScope':['operation','exact-inputs','source','deployment','ledger-head','principal','role-policy-scope'],
        'nativeExecutionQualified':False, 'nativeFunctionAndOperatorClosure':'required-before-execution',
        'replay':{'automaticRetry':False,'durableOutcomeRequired':not read,'mode':declaration['replay'],
                  'scope':['module','operation','source','deployment','ledger-head','verified-principal','ordered-exact-inputs','caller-key']},
        'transaction':{'atomic':'entire-invocation','batch':batch,'commitResponsibility':'host-caller-contract',
                       'onBoundExceeded':'rollback-entire-operation-or-batch','writeLimitClipping':False},
        'tableLifecycle':{
            'version':'umf.table-lifecycle/0.1', 'module':context['module'],
            'sourceDigest':context['sourceDigest'], 'configurationDigest':context['configurationDigest'],
            'deploymentDigest':context['bundleDigest'],
            'cursorScope':['module','sourceDigest','configurationDigest','deploymentDigest','ledgerHeadDigest','principal','roleScopeDigest'],
            'generationLock':'shared-before-admission-through-transaction',
            'installedAuthority':'approved-forward-ledger-and-source-derived-native-witness',
            'nativeExecutionQualified':False,'policy':'source-command-policy-and-native-forced-rls',
            'principal':'verified-person-or-batch','privileges':'source-grants-and-native-effective-closure',
            'roleScope':'native-transitive-current','sourceInterpretation':'original-umf-deployment-compiler',
            'tables':[{'commands':table_commands,'id':current['id'],'native':current['name'],'record':current['record'],
                       'policySourcePath':f'/modules/{module_index}/extensions/umf.tables/tables/{index}/policy'}
                      for index,current,table_commands in ordered],
        },
    }


class _TableReader:
    _mutation=False
    def __init__(self, session: SyncSession | AsyncSession, bundle: dict[str, object],
                 reference: dict[str, object], binding: dict[str, object], *,
                 cursor_secret: bytes, target: str = 'postgresql18'):
        if target not in ('postgresql18', 'lakebase18'):
            raise ValueError('an explicit PostgreSQL 18 target is required')
        if type(cursor_secret) is not bytes or len(cursor_secret) < 32:
            raise ValueError('cursor root secret requires at least 256 bits')
        self._session = session
        self._bundle, self._reference, self._binding = copy.deepcopy((bundle, reference, binding))
        self._secret, self._target = cursor_secret, target
        self._source_pid = os.getpid()
        self._source_lock = threading.Lock()
        self._source_state = self._source_policy = None

    def _prepare(self, identity, operation, inputs, size, cursor, *, items=None, key=None):
        """Prepare from one private copy for internal callers that pass shared data."""
        owned_inputs, owned_items = copy.deepcopy((inputs, items))
        return self._prepare_owned(
            identity, operation, owned_inputs, size, cursor, items=owned_items, key=key
        )

    def _source_for(self, identity):
        if os.getpid() != self._source_pid:
            raise SessionError("create session factories and pools after process creation")
        policy = self._session.policy
        role = policy.role(identity)
        # The constructor owns these source/reference/binding snapshots. Cache
        # only source meaning, never a lease, principal or native observation.
        with self._source_lock:
            if self._source_state is None or self._source_policy is not policy:
                probe = _prepare(self._session, identity, self._bundle, self._reference, True)
                context = probe.binding_context
                binding = self._binding
                expected = {'version':'umf.table-lifecycle/0.1', 'module':context['module'],
                            'configurationDigest':context['configurationDigest'], 'deploymentDigest':context['bundleDigest']}
                if (binding.get('modelJson') != context['sourceUtf8']
                        or binding.get('modelSha256') != context['sourceDigest']
                        or binding.get('schema') != context['schema'] or binding.get('nativeLifecycle') != expected):
                    raise SessionError('operation binding differs from the approved source')
                source = loads(context['sourceUtf8'])
                module = next(m for m in source['modules'] if m['id'] == context['module'])
                declarations = {c['id']:c for c in module['extensions']['umf.tables'].get('commands', [])}
                self._source_state = (probe,context,source,declarations)
                self._source_policy = policy
            template,context,source,declarations = self._source_state
            probe = template.for_principal(principal_role=role,audience=identity.kind)
        return probe,context,source,declarations

    def _prepare_owned(self, identity, operation, inputs, size, cursor, *, items=None, key=None):
        probe, context, source, declarations = self._source_for(identity)
        binding = self._binding
        declaration = declarations.get(operation) if type(operation) is str else None
        if declaration is None:
            raise SessionError('operation is not declared in this module')
        read=declaration['body']['kind']=='read'
        if not read and not self._mutation:
            raise SessionError('writes require the durable outcome executor')
        if read and self._mutation:
            raise SessionError('a declared mutation is required')
        secret = self._session.policy.cursor_secret(identity, self._secret)
        scope = {key:context[key] for key in ('module','schema','sourceDigest','configurationDigest',
                                             'bundleDigest','headDigest','referenceDigest')}
        scope.update(operation=operation, target=self._target, inputsDigest=digest(inputs if items is None else items), requestedSize=size,
                     profile='python-sorted-json/0.1')
        token = token_decode(secret, cursor) if cursor is not None else None
        if token is not None and any(token['scope'].get(k) != v for k,v in scope.items()):
            raise SessionError('cursor differs from this operation scope')
        call = {'kind':'single', 'inputs':inputs}
        if items is not None:
            call={'kind':'batch','items':items}
        if size is not None:
            call['size'] = size
        if token is not None:
            call['after'] = token['after']
        request = {'version':'weft.table-operation/0.1', 'target':self._target, 'binding':binding,
                   'module':context['module'], 'operation':operation, 'call':call}
        if not read:
            if key is None and declaration['replay']=='caller-key-optional':
                key=uuid4().hex
            if key is not None:
                request['idempotencyKey']=key
        # This exact optional public compiler boundary owns all statement text,
        # parameter order, native scalar coercions and server-side frame guards.
        # This is trusted in-process compiler output. External stored programs
        # need Weft checking at their ingress; this API accepts no such program.
        from weft import compile_table_operation_json
        program = loads(compile_table_operation_json(canonical(request)))
        if program.get('status') != 'compiled':
            raise SessionError('declared read compilation refused')
        guard = {'profile':'pg18-read-frame/0.1', 'maxNativeBytes':8388608, 'sqlstate':'22012',
                 'includesLookahead':True, 'partialFrames':False}
        valid_read=(program['result']['kind'] in ('many','one','optional','page','count')
                    and program['result']['nativeReadGuard']==guard)
        valid_write=(program['result']['kind']=='mutation' and program['result']['nativeReadGuard'] is None
                     and program['result'].get('nativeWriteFrameGuard')=={**guard,'profile':'pg18-write-frame/0.1','includesLookahead':False}
                     and program['result']['nativeBoundGuard']=={'profile':'pg18-effect-count/0.1','sqlstate':'22012',
                         'excessEffects':'statement-error-and-transaction-rollback','writeLimitClipping':False})
        if (not (valid_read if read else valid_write)
                or program['version'] != 'weft.table-operation/0.1'
                or program['obligations'] != _obligations(context, source, declaration,items is not None)
                or program['transport'] != {'profile':'dbapi-percent/0.1','bindEmptyParameterTuple':True}):
            raise SessionError('unsupported declared read execution profile')
        return probe, program, scope, secret, token

    def _before(self, identity, prepared, observed):
        _check_principal(self._session, identity, observed)
        scope = prepared[2]
        scope.update(principalOid=observed['principalOid'], roleScopeDigest=observed['roleScopeDigest'])
        token = prepared[4]
        if token is not None and token['scope'] != scope:
            raise SessionError('cursor authority changed')

    @staticmethod
    def _columns(cursor, program):
        if [c[0] for c in cursor.description] != [o['name'] for o in program['outputs']]:
            raise SessionError('native read columns differ')


class SyncTableReader(_TableReader):
    """Synchronous declared reads through a per-call native session factory."""
    def read(self, identity: SessionIdentity, operation: str, inputs: dict[str, object], *,
             size: int | None = None, cursor: str | None = None) -> dict[str, object]:
        try:
            owned_inputs = copy.deepcopy(inputs)
            prepared = self._prepare_owned(identity, operation, owned_inputs, size, cursor)
            probe, program, scope, secret, _ = prepared
            with self._session.open(identity, read_only=True) as native:
                before = _drive(self._session, native, probe.operation_steps())
                self._before(identity, prepared, before)
                with self._session.control_cursor(native) as result:
                    result.execute(program['dbapiSql'], native_arguments(program))
                    self._columns(result, program)
                    rows = result.fetchall()
                response = result_frame(program, rows, scope, secret)
            return response
        except SessionError:
            raise
        except Exception:  # noqa: BLE001 -- sanitize optional native-driver/verifier errors at the SDK boundary
            raise SessionError('native declared read failed') from None


class AsyncTableReader(_TableReader):
    """Async declared reads; cancellation propagates after session cleanup."""
    async def read(self, identity: SessionIdentity, operation: str, inputs: dict[str, object], *,
                   size: int | None = None, cursor: str | None = None) -> dict[str, object]:
        try:
            owned_inputs = copy.deepcopy(inputs)
            prepared = await asyncio.to_thread(
                self._prepare_owned, identity, operation, owned_inputs, size, cursor
            )
            probe, program, scope, secret, _ = prepared
            async with self._session.open(identity, read_only=True) as native:
                before = await _drive_async(self._session, native, probe.operation_steps())
                self._before(identity, prepared, before)
                async with self._session.control_cursor(native) as result:
                    await result.execute(program['dbapiSql'], native_arguments(program))
                    self._columns(result, program)
                    rows = await result.fetchall()
                response = result_frame(program, rows, scope, secret)
            return response
        except SessionError:
            raise
        except Exception:  # noqa: BLE001 -- sanitize optional native-driver/verifier errors at the SDK boundary
            raise SessionError('native declared read failed') from None
