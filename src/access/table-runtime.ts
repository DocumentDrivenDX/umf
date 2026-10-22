// SPDX-License-Identifier: MIT OR Apache-2.0
export const tableRuntime=String.raw`# SPDX-License-Identifier: MIT OR Apache-2.0
"""Generated declared-operation transport and exact result codecs. No SQL or drivers."""
from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field as dataclass_field
from typing import Any, Generic, Literal, NoReturn, TypeVar, cast
from uuid import uuid4
import re

from ._runtime import AccessError, Page, WriteOutcomeUnknown, check, decode, encode

R = TypeVar('R')
Durability = Literal['committed', 'pending-caller-commit']

@dataclass(frozen=True)
class EffectReceipt:
    module: str
    operation: str
    source_digest: str
    head_digest: str
    effects: tuple[int, ...]
    response_digest: str

@dataclass(frozen=True)
class MutationItem(Generic[R]):
    affected_count: int
    rows: tuple[R, ...]

@dataclass(frozen=True)
class Applied(Generic[R]):
    status: Literal['applied'] = dataclass_field(init=False, default='applied')
    key: str
    durability: Durability
    items: tuple[MutationItem[R], ...]
    receipt: EffectReceipt

@dataclass(frozen=True)
class Recovered:
    status: Literal['recovered'] = dataclass_field(init=False, default='recovered')
    key: str
    durability: Durability
    receipt: EffectReceipt

@dataclass(frozen=True)
class NotObserved:
    status: Literal['not-observed'] = dataclass_field(init=False, default='not-observed')
    key: str


def _count(value: Any, maximum: int | None = None) -> int:
    if (type(value) is not dict or set(value) != {'integerToken'} or type(value['integerToken']) is not str
            or not re.fullmatch('0|[1-9][0-9]*', value['integerToken']) or len(value['integerToken']) > 19):
        raise AccessError('INVALID_RESPONSE')
    number = int(value['integerToken'])
    if number > 2**63-1 or maximum is not None and number > maximum: raise AccessError('INVALID_RESPONSE')
    return number


def _row(value: Any, spec: Mapping[str, Any], row_type: Any) -> Any:
    if type(value) is not dict or set(value) != {f['id'] for f in spec['fields']} or row_type is None:
        raise AccessError('INVALID_RESPONSE')
    return row_type(**{f['python']: decode(value[f['id']], f) for f in spec['fields']})


def _build(client: Any, spec: Mapping[str, Any], value: Any, input_type: Any, *, key: str | None,
           size: int | None, cursor: str | None, observe: bool, batch: bool) -> dict[str, Any]:
    write = spec['result'] == 'mutation'
    if observe and not write: raise AccessError('INVALID')
    if write:
        if key is None and spec['replay'] == 'caller-key-optional' and not observe: key = uuid4().hex
        if type(key) is not str or not 1 <= len(key.encode('utf-8')) <= 256 or '\x00' in key: raise AccessError('INVALID')
    elif key is not None: raise AccessError('INVALID')
    def arguments(item: Any) -> dict[str, Any]:
        if type(item) is not input_type: raise AccessError('TYPE')
        result = {}
        for field in spec['parameters']:
            v = getattr(item, field['python']); check(v, field)
            native = field['native']
            if v is not None and native is not None and native['kind'] == 'varchar' and len(v) > native['length']: raise AccessError('CAPACITY', field['id'])
            bits = {'int2':16, 'int4':32, 'int8':64}.get(native['kind']) if native is not None else None
            if v is not None and bits is not None and not -(2 ** (bits-1)) <= v < 2 ** (bits-1): raise AccessError('CAPACITY', field['id'])
            result[field['id']] = {'string':v} if type(v) is str else {'boolean':v} if type(v) is bool else encode(v, field)
        return result
    call: dict[str, Any]
    if batch:
        if not write or not spec['batch'] or type(value) is not tuple or not 1 <= len(value) <= spec['batch']['maxItems']:
            raise AccessError('INVALID')
        call = {'kind':'batch', 'items':[arguments(item) for item in value]}
    else: call = {'kind':'single', 'inputs':arguments(value)}
    if size is not None:
        if spec['result'] not in ('page','many') or type(size) is not int or not 1 <= size <= spec['maxRows']: raise AccessError('INVALID')
        call['size'] = size
    if cursor is not None:
        if spec['result'] != 'page' or type(cursor) is not str or not cursor or len(cursor) > 16384: raise AccessError('INVALID_CURSOR')
        call['cursor'] = cursor
    return {'kind':'table', 'module':spec['module'], 'operation':spec['id'], 'call':call,
            'phase':'observe' if observe else 'invoke', 'mutation':write, 'idempotency_key':key}


def _receipt(value: Any, spec: Mapping[str, Any], client: Any, items: int) -> EffectReceipt:
    keys = {'version','module','operation','sourceDigest','configurationDigest','bundleDigest','headDigest',
            'invocationDigest','scopeDigest','effects','responseDigest'}
    if (type(value) is not dict or set(value) != keys or value['version'] != 'umf.table-outcome/0.1'
            or value['module'] != spec['module'] or value['operation'] != spec['id'] or value['sourceDigest'] != client.schema
            or type(value['effects']) is not list or len(value['effects']) != items): raise AccessError('INVALID_RESPONSE')
    for name in ('sourceDigest','configurationDigest','bundleDigest','headDigest','invocationDigest','scopeDigest','responseDigest'):
        if type(value[name]) is not str or not re.fullmatch('[a-f0-9]{64}',value[name]): raise AccessError('INVALID_RESPONSE')
    effects = tuple(_count(n, spec['maxRows']) for n in value['effects'])
    return EffectReceipt(value['module'],value['operation'],value['sourceDigest'],value['headDigest'],effects,value['responseDigest'])


def _finish(client: Any, spec: Mapping[str, Any], request: Mapping[str, Any], response: Mapping[str, Any], row_type: Any) -> Any:
    if set(response) != {'schema','table'} or type(response['table']) is not dict: raise AccessError('INVALID_RESPONSE')
    value = response['table']; kind = spec['result']
    if kind != 'mutation':
        expected = {'version','module','operation','sourceDigest','kind','count'} if kind == 'count' else {'version','module','operation','sourceDigest','kind','rows','cursor'}
        if (set(value) != expected or value['version'] != 'umf.table-read-result/0.1' or value['kind'] != kind
                or value['module'] != spec['module'] or value['operation'] != spec['id'] or value['sourceDigest'] != client.schema): raise AccessError('INVALID_RESPONSE')
        if kind == 'count': return _count(value['count'])
        rows = value['rows']; cap = request['call'].get('size',spec['maxRows'])
        if type(rows) is not list or len(rows) > cap: raise AccessError('INVALID_RESPONSE')
        decoded = tuple(_row(row,spec,row_type) for row in rows)
        cursor = value['cursor']
        if cursor is not None and (kind != 'page' or type(cursor) is not str or not cursor or len(cursor) > 16384 or len(rows) != cap): raise AccessError('INVALID_RESPONSE')
        if kind == 'page': return Page(decoded,cursor)
        if kind == 'one':
            if len(decoded) != 1: raise AccessError('INVALID_RESPONSE')
            return decoded[0]
        if kind == 'optional':
            if len(decoded) > 1: raise AccessError('INVALID_RESPONSE')
            return decoded[0] if decoded else None
        return decoded
    status=value.get('status');base={'version','status','key','commitResponsibility','durability'}
    expected=base if status=='not-observed' else base|{'receipt'} if status=='recovered' else base|{'receipt','result'} if status=='applied' else set()
    if (set(value) != expected or value.get('version') != 'umf.table-write-result/0.1' or value.get('key') != request['idempotency_key']
            or value.get('commitResponsibility') not in ('adapter','caller')): raise AccessError('INVALID_RESPONSE')
    if status=='not-observed':
        if request['phase']!='observe' or value['durability']!='not-observed': raise AccessError('INVALID_RESPONSE')
        return NotObserved(value['key'])
    durability: Durability='committed' if value['commitResponsibility']=='adapter' else 'pending-caller-commit'
    if value['durability']!=durability: raise AccessError('INVALID_RESPONSE')
    count=len(request['call']['items']) if request['call']['kind']=='batch' else 1
    receipt=_receipt(value['receipt'],spec,client,count)
    if status=='recovered':return Recovered(value['key'],durability,receipt)
    if request['phase']=='observe':raise AccessError('INVALID_RESPONSE')
    fresh=value['result']
    if (type(fresh) is not dict or set(fresh)!={'module','operation','sourceDigest','items'}
            or fresh['module']!=spec['module'] or fresh['operation']!=spec['id'] or fresh['sourceDigest']!=client.schema
            or type(fresh['items']) is not list or len(fresh['items'])!=count):raise AccessError('INVALID_RESPONSE')
    items=[]
    for index,raw_item in enumerate(fresh['items']):
        if type(raw_item) is not dict or set(raw_item)!={'affectedCount','rows'}:raise AccessError('INVALID_RESPONSE')
        item=cast(dict[str, Any], raw_item)
        if type(item['rows']) is not list:raise AccessError('INVALID_RESPONSE')
        affected=_count(item['affectedCount'],spec['maxRows'])
        if affected!=receipt.effects[index] or len(item['rows'])!=(affected if spec['fields'] else 0):raise AccessError('INVALID_RESPONSE')
        items.append(MutationItem(affected,tuple(_row(row,spec,row_type) for row in item['rows'])))
    return Applied(value['key'],durability,tuple(items),receipt)


def _failure(error: AccessError, request: Mapping[str, Any]) -> NoReturn:
    if request['mutation'] and request['phase']=='invoke' and error.code in ('TRANSPORT_FAILED','INVALID_RESPONSE','SCHEMA_MISMATCH','WRITE_OUTCOME_UNKNOWN'):
        unknown=WriteOutcomeUnknown('WRITE_OUTCOME_UNKNOWN')
        unknown.key=request['idempotency_key']
        raise unknown from None
    raise error


async def table_call(client: Any, spec: Mapping[str, Any], value: Any, input_type: Any, row_type: Any, *,
                     key: str | None=None, size: int | None=None, cursor: str | None=None, observe: bool=False, batch: bool=False) -> Any:
    request=_build(client,spec,value,input_type,key=key,size=size,cursor=cursor,observe=observe,batch=batch)
    try:response=await client.request(request)
    except AccessError as error:_failure(error,request)
    try:return _finish(client,spec,request,response,row_type)
    except (AccessError,ValueError,TypeError,KeyError,OverflowError):_failure(AccessError('INVALID_RESPONSE'),request)


def table_call_sync(client: Any, spec: Mapping[str, Any], value: Any, input_type: Any, row_type: Any, *,
                    key: str | None=None, size: int | None=None, cursor: str | None=None, observe: bool=False, batch: bool=False) -> Any:
    request=_build(client,spec,value,input_type,key=key,size=size,cursor=cursor,observe=observe,batch=batch)
    try:response=client.request(request)
    except AccessError as error:_failure(error,request)
    try:return _finish(client,spec,request,response,row_type)
    except (AccessError,ValueError,TypeError,KeyError,OverflowError):_failure(AccessError('INVALID_RESPONSE'),request)
`;
