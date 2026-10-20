# SPDX-License-Identifier: MIT OR Apache-2.0
"""Declared atomic mutations and authenticated effect-only recovery over Weft."""
from __future__ import annotations

import asyncio
import copy
from dataclasses import dataclass

from .head_session import _drive, _drive_async
from .operation_values import (
    MAX_FRAME,
    bounded_size,
    digest,
    loads,
    native_arguments,
    native_batch_arguments,
    value_from_native,
)
from .outcome_values import (
    outcome_from_record,
    outcome_invocation,
    outcome_record,
    outcome_slot,
)
from .session_policy import SessionError, SessionIdentity
from .table_reads import _TableReader


class WriteOutcomeUnknown(SessionError):
    """Commit/lease completion failed after execution; observe this key afresh."""
    def __init__(self, key):
        super().__init__('native write outcome is unknown; observe its outcome key')
        self.key=key


@dataclass(frozen=True)
class _Frame:
    statement: str
    parameters: tuple
    kind: str = 'frame'


def _effect_frames(program):
    """Decode the same ordered item results for scalar and set-based programs."""
    outputs = program['outputs']
    names = [output['name'] for output in outputs] + [program['result']['affectedMarker']]
    count = len(program['nativeInputs'])
    batch = program.get('nativeBatch')
    batch_rows = None
    if batch is not None:
        columns, batch_rows = yield _Frame(batch['dbapiSql'], native_batch_arguments(program))
        if columns != [batch['ordinalColumn'], *names] or len(batch_rows) != count:
            raise SessionError('native batch mutation frame differs')
    effects, frames, wire_size = [], [], 0
    for index in range(count):
        if batch_rows is None:
            columns, rows = yield _Frame(program['dbapiSql'], native_arguments(program, index))
            if columns != names:
                raise SessionError('native mutation frame differs')
        else:
            row = batch_rows[index]
            if not row or type(row[0]) is not int or row[0] != index:
                raise SessionError('native batch mutation ordinal differs')
            rows = [row[1:]]
        if len(rows) > program['result']['maxRows']:
            raise SessionError('native mutation frame differs')
        decoded = []
        for row in rows:
            if len(row) != len(outputs) + 1 or type(row[-1]) is not int or row[-1] != 1:
                raise SessionError('native effect marker differs')
            if outputs:
                decoded.append({out['field']['element']: value_from_native(value, out)
                                for out, value in zip(outputs, row[:-1], strict=True)})
        frame = {'affectedCount': {'integerToken': str(len(rows))}, 'rows': decoded}
        wire_size += bounded_size(frame)
        if wire_size > MAX_FRAME:
            raise SessionError('native mutation wire bound exceeded')
        effects.append(len(rows))
        frames.append(frame)
    return effects, frames


class _TableWriter(_TableReader):
    _mutation=True

    def __init__(self, session, bundle, reference, binding, *, outcome_secret: bytes, target='postgresql18'):
        super().__init__(session,bundle,reference,binding,cursor_secret=outcome_secret,target=target)

    def _write_prepare(self, identity, operation, inputs, key, items):
        owned_inputs, owned_items = copy.deepcopy((inputs, items))
        return self._write_prepare_owned(identity, operation, owned_inputs, key, owned_items)

    def _write_prepare_owned(self, identity, operation, inputs, key, items):
        prepared=self._prepare_owned(identity,operation,inputs,None,None,key=key,items=items)
        batch = prepared[1].get('nativeBatch')
        if batch is not None and batch.get('version') != 'weft.table-insert-batch/0.1':
            raise SessionError('unsupported native batch execution profile')
        # Refuse old read-only installations before acquiring a lease.
        prepared[0].outcome_steps('read',1,'0'*64)
        return prepared

    def _steps(self, identity, prepared, observe):
        probe,program,scope,_,_=prepared
        before=yield from probe.operation_steps()
        self._before(identity,prepared,before)
        request=loads(program['requestJson']);key=request['idempotencyKey']
        principal=before['principalOid']
        slot=outcome_slot(identity,principal,scope,program['operation'],key)
        yield from probe.outcome_steps('lock',principal,slot)
        stored=yield from probe.outcome_steps('read',principal,slot)
        scope_digest=digest({k:v for k,v in scope.items() if k!='inputsDigest'})
        invocation=outcome_invocation(self._secret,[scope,program['declarationDigest'],request['call']['kind']])
        metadata={k:scope[k] for k in ('module','operation','sourceDigest','configurationDigest','bundleDigest','headDigest')}
        metadata.update(invocationDigest=invocation,scopeDigest=scope_digest)
        if stored is not None:
            receipt=outcome_from_record(self._secret,principal,slot,stored,metadata,
                                        items=len(program['nativeInputs']),max_rows=program['result']['maxRows'])
            response={'status':'recovered','receipt':receipt}
        elif observe:
            response={'status':'not-observed'}
        else:
            effects,frames=yield from _effect_frames(program)
            fresh={'module':program['module'],'operation':program['operation'],'sourceDigest':scope['sourceDigest'],'items':frames}
            bounded_size(fresh)
            record=outcome_record(self._secret,principal,slot,metadata,effects,fresh)
            yield from probe.outcome_steps('insert',principal,slot,record)
            response={'status':'applied','result':fresh,'receipt':loads(record['payload'])}
        response.update(version='umf.table-write-result/0.1',key=key,
                        commitResponsibility=self._session.transaction_owner,
                        durability='pending-caller-commit' if self._session.transaction_owner=='caller' else 'committed')
        if response['status']=='not-observed':response['durability']='not-observed'
        bounded_size(response)
        return response


class SyncTableWriter(_TableWriter):
    """Sync declared writes; no automatic retry and no historical row replay."""
    def _invoke(self, identity, operation, inputs, key, items, observe):
        response=None
        try:
            owned_inputs, owned_items = copy.deepcopy((inputs, items))
            prepared=self._write_prepare_owned(identity,operation,owned_inputs,key,owned_items)
            key=loads(prepared[1]['requestJson'])['idempotencyKey']
            with self._session.open(identity,read_only=observe and self._session.transaction_owner=='adapter') as native:
                response=_drive(self._session,native,self._steps(identity,prepared,observe))
            return response
        except Exception as error:
            if response is not None:raise WriteOutcomeUnknown(key) from None
            if isinstance(error,SessionError):raise
            raise SessionError('native declared mutation failed') from None

    def write(self, identity: SessionIdentity, operation: str, inputs: dict[str, object], *, key: str | None=None):
        return self._invoke(identity,operation,inputs,key,None,False)

    def write_batch(self, identity: SessionIdentity, operation: str, items: list[dict[str, object]], *, key: str | None=None):
        return self._invoke(identity,operation,None,key,items,False)

    def observe(self, identity: SessionIdentity, operation: str, inputs: dict[str, object], *, key: str):
        return self._invoke(identity,operation,inputs,key,None,True)

    def observe_batch(self, identity: SessionIdentity, operation: str, items: list[dict[str, object]], *, key: str):
        return self._invoke(identity,operation,None,key,items,True)


class AsyncTableWriter(_TableWriter):
    """Async counterpart; cancellation propagates after shielded session cleanup."""
    async def _invoke(self, identity, operation, inputs, key, items, observe):
        response=None
        try:
            owned_inputs, owned_items = copy.deepcopy((inputs, items))
            prepared=await asyncio.to_thread(
                self._write_prepare_owned, identity, operation, owned_inputs, key, owned_items
            )
            key=loads(prepared[1]['requestJson'])['idempotencyKey']
            async with self._session.open(identity,read_only=observe and self._session.transaction_owner=='adapter') as native:
                response=await _drive_async(self._session,native,self._steps(identity,prepared,observe))
            return response
        except Exception as error:
            if response is not None:raise WriteOutcomeUnknown(key) from None
            if isinstance(error,SessionError):raise
            raise SessionError('native declared mutation failed') from None

    async def write(self, identity: SessionIdentity, operation: str, inputs: dict[str, object], *, key: str | None=None):
        return await self._invoke(identity,operation,inputs,key,None,False)

    async def write_batch(self, identity: SessionIdentity, operation: str, items: list[dict[str, object]], *, key: str | None=None):
        return await self._invoke(identity,operation,None,key,items,False)

    async def observe(self, identity: SessionIdentity, operation: str, inputs: dict[str, object], *, key: str):
        return await self._invoke(identity,operation,inputs,key,None,True)

    async def observe_batch(self, identity: SessionIdentity, operation: str, items: list[dict[str, object]], *, key: str):
        return await self._invoke(identity,operation,None,key,items,True)
