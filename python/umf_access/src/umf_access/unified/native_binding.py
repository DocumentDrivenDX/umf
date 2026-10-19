# SPDX-License-Identifier: MIT OR Apache-2.0
"""Closed generated-module wire transport; authenticated identity stays outside it."""
from __future__ import annotations

import copy
from dataclasses import dataclass
from typing import Any

from .operation_values import loads
from .session_async import AsyncSession
from .session_policy import SessionError, SessionIdentity
from .session_sync import SyncSession
from .table_reads import AsyncTableReader, SyncTableReader
from .table_writes import AsyncTableWriter, SyncTableWriter, WriteOutcomeUnknown

_REQUEST={'contract','schema','kind','module','operation','call','phase','mutation','idempotency_key'}


def _reason(error):
    if isinstance(error,WriteOutcomeUnknown):return 'WRITE_OUTCOME_UNKNOWN'
    current=error;seen=set()
    for _ in range(8):
        if current is None or id(current) in seen:break
        seen.add(id(current))
        code=getattr(current,'sqlstate',None) or getattr(current,'pgcode',None)
        if code=='42501':return 'DENIED'
        if code in ('23505','23503'):return 'CONFLICT'
        if code in ('23502','22001','22003','22P02'):return 'INVALID'
        if code=='23514':return 'PRECONDITION_FAILED'
        if code=='22012':return 'LIMIT_EXCEEDED'
        message=str(current)
        if 'cursor' in message:return 'INVALID_CURSOR'
        if message in ('required row not found','native single-row cardinality exceeded'):return 'PRECONDITION_FAILED'
        if message=='native result row bound exceeded':return 'TOO_MANY_ROWS'
        if 'subject has no grant' in message:return 'DENIED'
        if message.endswith('-mismatch') or message in ('native write authority changed during execution','native write authority changed while waiting'):
            return 'SCHEMA_MISMATCH'
        if message in ('declared read compilation refused','declared read source check refused','operation is not declared in this module'):
            return 'INVALID'
        current=getattr(current,'orig',None) or getattr(current,'__cause__',None) or getattr(current,'__context__',None)
    return 'BUSY'


class _NativeBinding:
    def __init__(self,session,bundle,reference,binding,*,cursor_secret: bytes,outcome_secret: bytes,target='postgresql18'):
        expected=SyncSession if self._reader_type is SyncTableReader else AsyncSession
        if not isinstance(session,expected):raise SessionError("native binding session mode mismatch")
        bundle,reference,binding=copy.deepcopy((bundle,reference,binding))
        self.schema=bundle['sourceDigest'];self.module=bundle['configuration']['module']
        if bundle['source']['format']!='json':raise SessionError('native operation binding requires JSON source')
        document=loads(bundle['source']['utf8'])
        module=next(m for m in document['modules'] if m['id']==self.module)
        self._operations={op['id']:op for op in module['extensions']['umf.tables']['commands']}
        self._reader=self._reader_type(session,bundle,reference,binding,cursor_secret=cursor_secret,target=target)
        self._writer=self._writer_type(session,bundle,reference,binding,outcome_secret=outcome_secret,target=target)

    def _parse(self,request,identity):
        self._reader._session.policy.role(identity)
        if type(request) is not dict or set(request)!=_REQUEST or request['contract']!='umf.access/1' or request['kind']!='table':
            raise SessionError('invalid generated table request')
        if request['schema']!=self.schema or request['module']!=self.module:
            raise SessionError('generated table schema-mismatch')
        operation=self._operations.get(request['operation']) if type(request['operation']) is str else None
        if operation is None:raise SessionError('operation is not declared in this module')
        write=operation['body']['kind']!='read'
        if type(request['mutation']) is not bool or request['mutation']!=write or request['phase'] not in ('invoke','observe'):
            raise SessionError('invalid generated table request')
        call=request['call']
        if type(call) is not dict or call.get('kind') not in ('single','batch'):
            raise SessionError('invalid generated table request')
        if write:
            expected={'kind','inputs'} if call['kind']=='single' else {'kind','items'}
            if set(call)!=expected or (call['kind']=='single' and type(call['inputs']) is not dict) or (call['kind']=='batch' and type(call['items']) is not list):
                raise SessionError('invalid generated table request')
            if request['phase']=='observe' and type(request['idempotency_key']) is not str:
                raise SessionError('invalid generated table request')
        elif (call['kind']!='single' or not {'kind','inputs'}<=set(call)<= {'kind','inputs','size','cursor'}
              or type(call['inputs']) is not dict or request['phase']!='invoke' or request['idempotency_key'] is not None):
            raise SessionError('invalid generated table request')
        return write,call

    def _error(self,error):
        code='INVALID' if isinstance(error,SessionError) and str(error)=='invalid generated table request' else _reason(error)
        return {'schema':self.schema,'error':{'code':code}}


@dataclass(frozen=True)
class _SyncAuthenticated:
    binding: SyncNativeTableBinding
    identity: SessionIdentity

    def execute(self,request: dict[str,Any]) -> dict[str,Any]:return self.binding.execute(request,identity=self.identity)


@dataclass(frozen=True)
class _AsyncAuthenticated:
    binding: NativeTableBinding
    identity: SessionIdentity

    async def execute(self,request: dict[str,Any]) -> dict[str,Any]:return await self.binding.execute(request,identity=self.identity)


class SyncNativeTableBinding(_NativeBinding):
    """One plugin module; factories and current identity are host-owned per call."""
    _reader_type=SyncTableReader
    _writer_type=SyncTableWriter

    def for_identity(self,identity: SessionIdentity) -> _SyncAuthenticated:
        self._reader._session.policy.role(identity)
        return _SyncAuthenticated(self,identity)

    def execute(self,request: dict[str,Any],*,identity: SessionIdentity) -> dict[str,Any]:
        try:
            write,call=self._parse(request,identity)
            if not write:
                value=self._reader.read(identity,request['operation'],call['inputs'],size=call.get('size'),cursor=call.get('cursor'))
            else:
                method=('observe' if request['phase']=='observe' else 'write')+('_batch' if call['kind']=='batch' else '')
                value=getattr(self._writer,method)(identity,request['operation'],call.get('inputs',call.get('items')),key=request['idempotency_key'])
            return {'schema':self.schema,'table':value}
        except Exception as error:  # noqa: BLE001 -- closed wire returns only fixed SDK error codes
            return self._error(error)


class NativeTableBinding(_NativeBinding):
    """Async module wire transport; cancellation propagates after native cleanup."""
    _reader_type=AsyncTableReader
    _writer_type=AsyncTableWriter

    def for_identity(self,identity: SessionIdentity) -> _AsyncAuthenticated:
        self._reader._session.policy.role(identity)
        return _AsyncAuthenticated(self,identity)

    async def execute(self,request: dict[str,Any],*,identity: SessionIdentity) -> dict[str,Any]:
        try:
            write,call=self._parse(request,identity)
            if not write:
                value=await self._reader.read(identity,request['operation'],call['inputs'],size=call.get('size'),cursor=call.get('cursor'))
            else:
                method=('observe' if request['phase']=='observe' else 'write')+('_batch' if call['kind']=='batch' else '')
                value=await getattr(self._writer,method)(identity,request['operation'],call.get('inputs',call.get('items')),key=request['idempotency_key'])
            return {'schema':self.schema,'table':value}
        except Exception as error:  # noqa: BLE001 -- sanitize all native diagnostics; BaseException cancellation is preserved
            return self._error(error)
