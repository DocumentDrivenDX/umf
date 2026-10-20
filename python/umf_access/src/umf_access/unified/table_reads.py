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


def _supported_obligations(value):
    """Recognize the compiler ABI without re-deriving its trusted source proof."""
    return (type(value) is dict and set(value)=={
        'consistency','cursorScope','nativeExecutionQualified','nativeFunctionAndOperatorClosure',
        'replay','transaction','tableLifecycle'}
        and value['consistency'] in ('statement','transaction')
        and value['nativeExecutionQualified'] is False
        and value['nativeFunctionAndOperatorClosure']=='required-before-execution'
        and type(value['tableLifecycle']) is dict and set(value['tableLifecycle'])=={
            'version','module','sourceDigest','configurationDigest','deploymentDigest','cursorScope',
            'generationLock','installedAuthority','nativeExecutionQualified','policy','principal',
            'privileges','roleScope','sourceInterpretation','tables'}
        and value['tableLifecycle']['version']=='umf.table-lifecycle/0.1'
        and value['tableLifecycle']['policy']=='source-command-policy-and-native-forced-rls'
        and value['tableLifecycle']['principal']=='verified-person-or-batch'
        and value['tableLifecycle']['privileges']=='source-grants-and-native-effective-closure'
        and value['tableLifecycle']['roleScope']=='native-transitive-current'
        and value['tableLifecycle']['sourceInterpretation']=='original-umf-deployment-compiler')


class _TableReader:
    _mutation=False
    def __init__(self, session: SyncSession | AsyncSession, bundle: dict[str, object],
                 reference: dict[str, object], binding: dict[str, object], *,
                 cursor_secret: bytes, target: str = 'postgresql18', _source_owner=None):
        if target not in ('postgresql18', 'lakebase18'):
            raise ValueError('an explicit PostgreSQL 18 target is required')
        if type(cursor_secret) is not bytes or len(cursor_secret) < 32:
            raise ValueError('cursor root secret requires at least 256 bits')
        self._session = session
        self._source_owner = self if _source_owner is None else _source_owner
        if _source_owner is None:
            self._bundle, self._reference, self._binding = copy.deepcopy((bundle, reference, binding))
        else:
            self._bundle, self._reference, self._binding = (_source_owner._bundle, _source_owner._reference, _source_owner._binding)
        self._secret, self._target = cursor_secret, target
        self._source_pid = os.getpid()
        self._source_lock = threading.Lock()
        self._source_state = self._source_policy = None
        self._queries = {}
        self._operation_module = None
        self._operations = {}
        self._descriptions = {}

    def _prepare(self, identity, operation, inputs, size, cursor, *, items=None, key=None):
        """Prepare from one private copy for internal callers that pass shared data."""
        owned_inputs, owned_items = copy.deepcopy((inputs, items))
        return self._prepare_owned(
            identity, operation, owned_inputs, size, cursor, items=owned_items, key=key
        )

    def _source_for(self, identity):
        if self._source_owner is not self:
            return self._source_owner._source_for(identity)
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
                # Query ASTs are lazy: unused/unsupported declarations do not
                # block independent CRUD or multiply first-use schema work.
                self._queries = {}
                self._operation_module = None
                self._operations = {}
                self._descriptions = {}
                self._source_state = (probe,context,source,declarations)
                self._source_policy = policy
            template,context,source,declarations = self._source_state
            probe = template.for_principal(principal_role=role,audience=identity.kind)
        return probe,context,source,declarations

    def _prepared_for(self, context, operation, *, query=False):
        owner = self._source_owner
        with owner._source_lock:
            cache = owner._queries if query else owner._operations
            prepared = cache.get(operation)
            if prepared is None:
                try:
                    if owner._operation_module is None:
                        from weft import prepare_table_operation_module_json
                        owner._operation_module = prepare_table_operation_module_json(canonical({
                            'version':'weft.table-operation-module/0.1','target':self._target,
                            'binding':owner._binding,'module':context['module']}))
                    prepared = (owner._operation_module.prepare_query(operation) if query
                                else owner._operation_module.prepare(operation))
                except ValueError as error:
                    raise SessionError('declared read compilation refused') from error
                if query:
                    prepared = (prepared, loads(prepared.program_json()))
                cache[operation] = prepared
            return prepared

    def _prepare_owned(self, identity, operation, inputs, size, cursor, *, items=None, key=None):
        probe, context, source, declarations = self._source_for(identity)
        declaration = declarations.get(operation) if type(operation) is str else None
        if declaration is None:
            raise SessionError('operation is not declared in this module')
        query=declaration['body']['kind']=='query'
        read=query or declaration['body']['kind']=='read'
        if query and (size is not None or cursor is not None or items is not None):
            raise SessionError('fixed queries do not accept paging or batches')
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
        invocation = {'call':call}
        if not read:
            if key is None and declaration['replay']=='caller-key-optional':
                key=uuid4().hex
            if key is not None:
                invocation['idempotencyKey']=key
        # This exact optional public compiler boundary owns all statement text,
        # parameter order, native scalar coercions and server-side frame guards.
        # This is trusted in-process compiler output. External stored programs
        # need Weft checking at their ingress; this API accepts no such program.
        if query:
            prepared,template=self._prepared_for(context,operation,query=True)
            bound=loads(prepared.bind_json(canonical({'inputs':inputs})))
            if type(bound) is not dict or set(bound)!={'nativeInputs'}:
                raise SessionError('declared read compilation refused')
            program={**template,'nativeInputs':bound['nativeInputs']}
        else:
            prepared=self._prepared_for(context,operation)
            program=loads(prepared.bind_json(canonical(invocation)))
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
                or not _supported_obligations(program['obligations'])
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

    def _needs_description(self, program):
        with self._source_lock:
            return program['operation'] in self._queries and program['operation'] not in self._descriptions

    def _accept_description(self, cursor, program):
        # OIDs here describe the original typed SELECT, before wire formatting.
        # No nullability/domain guarantee is inferred from native OIDs.
        allowed={'boolean':{16},'integer':{20,21,23},'decimal':{1700},
                 'string':{25,1042,1043},'float':{701},'date':{1082},
                 'timestamp':{1184},'uuid':{2950},'bits128':{17}}
        description=getattr(cursor,'native_description',None)
        if description is None:description=cursor.description
        if len(description)!=len(program['outputs']):
            raise SessionError('declared query result type differs')
        metadata=[]
        for column,output in zip(description,program['outputs']):
            if (len(column)<2 or column[0]!=output['name']
                    or column[1] not in allowed.get(output['carrier'],())):
                raise SessionError('declared query result type differs')
            metadata.append((column[0],column[1]))
        # A concurrent first call may describe the same immutable query. Never
        # hold a Python lock over driver I/O or cache a connection/authorization.
        with self._source_lock:self._descriptions[program['operation']]=tuple(metadata)

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
                if self._needs_description(program):
                    with self._session.control_cursor(native) as description:
                        description.execute(program['nativeDescriptionSql'], native_arguments(program))
                        self._accept_description(description,program)
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
                if self._needs_description(program):
                    async with self._session.control_cursor(native) as description:
                        await description.execute(program['nativeDescriptionSql'], native_arguments(program))
                        self._accept_description(description,program)
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
