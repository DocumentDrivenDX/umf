// SPDX-License-Identifier: MIT OR Apache-2.0
const asyncRuntime = String.raw`# SPDX-License-Identifier: MIT OR Apache-2.0
"""Generated typed request builders. Standard library only; no SQL or host I/O."""
from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, fields, replace
from datetime import date
from decimal import Decimal, DecimalException
from enum import Enum
from typing import Any, Generic, Literal, Protocol, TypeVar, cast, overload
from inspect import iscoroutinefunction
from uuid import UUID
import base64
import asyncio
import math
import re

R = TypeVar('R')
K = TypeVar('K')
T = TypeVar('T')
O = TypeVar('O')
V = TypeVar('V')

class Missing(Enum):
    VALUE = 'missing'
MISSING = Missing.VALUE

class AccessError(ValueError):
    def __init__(self, code: str, field: str | None = None, *, precondition: str | None = None) -> None:
        self.code, self.field, self.precondition = code, field, precondition
        super().__init__(code)
class Unsupported(AccessError): pass
class SchemaMismatch(AccessError): pass
class PreconditionFailed(AccessError): pass
class WriteOutcomeUnknown(AccessError):
    def __init__(self, code: str = 'WRITE_OUTCOME_UNKNOWN', field: str | None = None, *, precondition: str | None = None, key: str | None = None) -> None:
        super().__init__(code, field, precondition=precondition)
        self.key = key

WIRE_ERROR_CODES = ('INVALID', 'DENIED', 'CONFLICT', 'PRECONDITION_FAILED', 'TOO_MANY_ROWS',
                    'LIMIT_EXCEEDED', 'BUSY', 'UNSUPPORTED', 'SCHEMA_MISMATCH',
                    'WRITE_OUTCOME_UNKNOWN', 'NOT_YET_CURRENT', 'INVALID_CURSOR')

def wire_error(error: Any) -> AccessError:
    if not isinstance(error, Mapping) or set(error) - {'code', 'field', 'precondition', 'message'}:
        raise AccessError('INVALID_RESPONSE')
    code = error.get('code')
    if not isinstance(code, str) or code not in WIRE_ERROR_CODES:
        raise AccessError('INVALID_RESPONSE')
    if any(key in error and (not isinstance(error[key], str) or not error[key]) for key in ('field', 'precondition')):
        raise AccessError('INVALID_RESPONSE')
    if 'message' in error and not isinstance(error['message'], str): raise AccessError('INVALID_RESPONSE')
    exception = {'UNSUPPORTED': Unsupported, 'SCHEMA_MISMATCH': SchemaMismatch,
                 'PRECONDITION_FAILED': PreconditionFailed, 'WRITE_OUTCOME_UNKNOWN': WriteOutcomeUnknown}.get(code, AccessError)
    return exception(code, error.get('field'), precondition=error.get('precondition'))

@dataclass(frozen=True)
class ExactTimestamp:
    text: str
    def __post_init__(self) -> None:
        if not re.fullmatch(r'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)', self.text):
            raise AccessError('INVALID_TIMESTAMP')
        from datetime import datetime
        try:
            datetime.fromisoformat(self.text.replace('Z', '+00:00'))
        except ValueError:
            raise AccessError('INVALID_TIMESTAMP') from None


def encode(value: Any, spec: Mapping[str, Any] | None = None) -> Any:
    if isinstance(value, Missing):
        raise AccessError('MISSING_VALUE')
    if value is None or type(value) in (str, bool): return value
    if type(value) is int: return {'integerToken': str(value)}
    if type(value) is float:
        if not math.isfinite(value): raise AccessError('INVALID_FLOAT')
        return {'floatToken': repr(value)}
    if isinstance(value, Decimal):
        exponent = value.as_tuple().exponent
        if not value.is_finite() or type(exponent) is not int or len(value.as_tuple().digits) > 10000 or abs(exponent) > 10000:
            raise AccessError('INVALID_DECIMAL')
        return {'decimalToken': str(value)}
    if isinstance(value, UUID): return {'uuid': str(value)}
    if isinstance(value, ExactTimestamp): return {'timestamp': value.text}
    if type(value) is date: return {'date': value.isoformat()}
    if type(value) is bytes: return {'bits128Hex' if spec is not None and spec.get('scalar') == 'bits128' else 'binaryHex': value.hex()}
    if isinstance(value, tuple): return [encode(v, spec.get('item') if spec is not None else None) for v in value]
    if isinstance(value, Mapping): return {k: encode(v) for k, v in value.items()}
    raise AccessError('INVALID_VALUE')


def decode(value: Any, spec: Mapping[str, Any]) -> Any:
    try:
        if isinstance(value, dict) and len(value) == 1:
            if type(next(iter(value.values()))) is not str: raise AccessError('INVALID_RESPONSE')
            if 'integerToken' in value and not re.fullmatch(r'-?(?:0|[1-9][0-9]*)', value['integerToken']): raise AccessError('INVALID_RESPONSE')
            if 'floatToken' in value and not re.fullmatch(r'-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?', value['floatToken']): raise AccessError('INVALID_RESPONSE')
            if 'decimalToken' in value and not re.fullmatch(r'-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?', value['decimalToken']): raise AccessError('INVALID_RESPONSE')
            if 'uuid' in value: value = UUID(value['uuid'])
            elif 'integerToken' in value: value = int(value['integerToken'])
            elif 'decimalToken' in value: value = Decimal(value['decimalToken'])
            elif 'floatToken' in value: value = float(value['floatToken'])
            elif 'timestamp' in value: value = ExactTimestamp(value['timestamp'])
            elif 'date' in value: value = date.fromisoformat(value['date'])
            elif 'binaryHex' in value and spec['scalar'] == 'binary': value = bytes.fromhex(value['binaryHex'])
            elif 'bits128Hex' in value and spec['scalar'] == 'bits128': value = bytes.fromhex(value['bits128Hex'])
        if spec.get('cardinality') == 'array' and isinstance(value, list):
            value = tuple(decode(item, spec['item']) for item in value)
        check(value, spec)
        return value
    except (ValueError, TypeError, KeyError, DecimalException):
        raise AccessError('INVALID_RESPONSE', spec.get('id')) from None


def check(value: Any, spec: Mapping[str, Any]) -> None:
    if isinstance(value, Missing):
        if spec.get('missing'): return
        raise AccessError('REQUIRED', spec['id'])
    if value is None:
        if spec.get('nullable'): return
        raise AccessError('NULL', spec['id'])
    kind = spec['scalar']
    if spec.get('cardinality') == 'array':
        if not isinstance(value, tuple): raise AccessError('TYPE', spec['id'])
        for item in value: check(item, spec['item'])
        return
    types: dict[str, type[Any]] = {'string': str, 'integer': int, 'decimal': Decimal, 'float': float,
        'boolean': bool, 'binary': bytes, 'bits128': bytes, 'uuid': UUID, 'date': date, 'timestamp': ExactTimestamp}
    if kind not in types or type(value) is not types[kind]: raise AccessError('TYPE', spec['id'])
    if kind == 'string':
        try: value.encode('utf-8')
        except UnicodeError: raise AccessError('INVALID_VALUE', spec['id']) from None
    if kind == 'bits128' and len(value) != 16: raise AccessError('BITS128', spec['id'])
    if kind in ('decimal','float'): encode(value)
    if 'allowed' in spec and value not in spec['allowed']: raise AccessError('ALLOWED_VALUE', spec['id'])
    if 'allowedLiterals' in spec:
        plain = {k:v for k,v in spec.items() if k not in ('allowed','allowedLiterals')}
        def candidate(item: Any) -> Any:
            if type(item) is dict and ('integerToken' in item or 'decimalToken' in item):
                number = Decimal(item['integerToken'] if 'integerToken' in item else item['decimalToken'])
                sign, digits, exponent = number.as_tuple()
                if type(exponent) is not int: raise AccessError('INVALID_VALUE', spec['id'])
                end = len(digits)
                while end and digits[end-1] == 0: end -= 1
                number = Decimal((sign, digits[:end], exponent+len(digits)-end)) if end else Decimal(0)
                result = int(number) if 'integerToken' in item else number
                check(result, plain); return result
            return decode(item.get('string', item.get('boolean', item)) if type(item) is dict else item, plain)
        candidates = [candidate(item) for item in spec['allowedLiterals']]
        if value not in candidates: raise AccessError('ALLOWED_VALUE', spec['id'])
    facets = spec.get('facets', {})
    if kind == 'decimal':
        encode(value)
        sign, digits, exponent = value.as_tuple()
        if type(exponent) is not int: raise AccessError('INVALID_DECIMAL', spec['id'])
        scale = facets.get('scale')
        if scale is not None and exponent < -scale and any(digits[len(digits) + exponent + scale:]):
            raise AccessError('SCALE', spec['id'])
        precision = facets.get('precision')
        if precision is not None and max(len(digits) + exponent, 0) > precision - (scale or 0):
            raise AccessError('PRECISION', spec['id'])
    length = facets.get('length')
    if length is not None:
        if kind not in ('string','binary') or length.get('unit') != ('unicode-scalar' if kind == 'string' else 'byte'): raise AccessError('TYPE', spec['id'])
        count = len(value)
        if 'min' in length and count < length['min'] or 'max' in length and count > length['max']: raise AccessError('CAPACITY', spec['id'])
    interval = facets.get('range')
    if interval is not None:
        if kind not in ('integer','decimal'): raise AccessError('TYPE', spec['id'])
        for end in ('min','max'):
            if end not in interval: continue
            literal = interval[end]
            bound = int(Decimal(literal['integerToken'])) if kind == 'integer' else Decimal(literal['decimalToken'])
            if (value < bound if end == 'min' else value > bound) or value == bound and interval.get(end+'Inclusive',True) is False: raise AccessError('RANGE', spec['id'])
    width = facets.get('integerWidth')
    if kind == 'integer' and width:
        bits, signed = width['bits'], width.get('signed', True)
        if not (-(2 ** (bits-1)) if signed else 0) <= value < 2 ** (bits-1 if signed else bits):
            raise AccessError('WIDTH', spec['id'])


def validate_model(value: Any, specs: Sequence[Mapping[str, Any]]) -> None:
    for spec in specs: check(getattr(value, spec['python']), spec)


@dataclass(frozen=True)
class Predicate(Generic[R]):
    owner: str
    expression: Mapping[str, Any]
    def __bool__(self) -> bool:
        raise TypeError('Use & and | for typed predicates')
    def _combine(self, op: str, other: Predicate[R]) -> Predicate[R]:
        if not isinstance(other, Predicate) or other.owner != self.owner: raise AccessError('PREDICATE_OWNER')
        return Predicate(self.owner, {'op': op, 'args': [self.expression, other.expression]})
    def __and__(self, other: Predicate[R]) -> Predicate[R]: return self._combine('and', other)
    def __or__(self, other: Predicate[R]) -> Predicate[R]: return self._combine('or', other)
    def __invert__(self) -> Predicate[R]: return Predicate(self.owner, {'op': 'not', 'args': [self.expression]})

@dataclass(frozen=True)
class Ordering(Generic[R]):
    owner: str
    field: str
    direction: str

@dataclass(frozen=True)
class Field(Generic[R, T]):
    owner: str
    spec: Mapping[str, Any]
    def _compare(self, op: str, value: T) -> Predicate[R]:
        check(value, self.spec)
        return Predicate(self.owner, {'op': op, 'field': self.spec['id'], 'value': encode(value, self.spec)})
    def eq(self, value: T) -> Predicate[R]: return self._compare('eq', value)
    def ne(self, value: T) -> Predicate[R]: return self._compare('ne', value)
    def __lt__(self, value: T) -> Predicate[R]: return self._compare('lt', value)
    def __le__(self, value: T) -> Predicate[R]: return self._compare('le', value)
    def __gt__(self, value: T) -> Predicate[R]: return self._compare('gt', value)
    def __ge__(self, value: T) -> Predicate[R]: return self._compare('ge', value)
    def starts_with(self: Field[R, str], value: str) -> Predicate[R]: return self._compare('starts_with', value)
    def is_null(self) -> Predicate[R]: return Predicate(self.owner, {'op': 'is_null', 'field': self.spec['id']})
    def asc(self) -> Ordering[R]: return Ordering(self.owner, self.spec['id'], 'asc')
    def desc(self) -> Ordering[R]: return Ordering(self.owner, self.spec['id'], 'desc')

@dataclass(frozen=True)
class Relationship(Generic[R, O, K, V]):
    owner: str
    target: str
    module: str
    identity: str
    direction: str = 'forward'
    def inverse(self) -> Relationship[O, R, V, K]:
        return Relationship(self.target, self.owner, self.module, self.identity,
                            'inverse' if self.direction == 'forward' else 'forward')

class Transport(Protocol):
    async def execute(self, request: dict[str, Any]) -> Mapping[str, Any]: ...

@dataclass(frozen=True)
class Page(Generic[R]):
    items: tuple[R, ...]
    next_cursor: str | None

@dataclass(frozen=True)
class Receipt(Generic[K, T]):
    created: tuple[K, ...]
    changed: tuple[K, ...]
    counts: Mapping[str, int]
    consistency_token: str
    output: T
    status: Literal['committed'] = 'committed'

@dataclass(frozen=True)
class ValidationResult:
    valid: Literal[True] = True

@dataclass(frozen=True)
class BatchItemOutcome(Generic[K, T]):
    status: Literal['applied', 'refused', 'rolled_back', 'unknown', 'unattempted']
    receipt: Receipt[K, T] | None = None
    error: AccessError | None = None

@dataclass(frozen=True)
class BatchReceipt(Generic[K, T]):
    items: tuple[BatchItemOutcome[K, T], ...]
    consistency_token: str

class Client:
    def __init__(self, transport: Transport, schema: str, records: Mapping[str, Any], actions: Mapping[str, Any]) -> None:
        self.transport, self.schema = transport, schema
        self.records, self.actions = records, actions
    async def request(self, body: dict[str, Any]) -> dict[str, Any]:
        request = {**body, 'contract': 'umf.access/1', 'schema': self.schema}
        writing = body['kind'] in ('apply', 'apply_batch')
        key = body.get('idempotency_key')
        try:
            response = await self.transport.execute(request)
        except asyncio.CancelledError:
            if writing: raise WriteOutcomeUnknown(key=key) from None
            raise
        except AccessError:
            if writing: raise WriteOutcomeUnknown(key=key) from None
            raise
        except Exception:
            if writing: raise WriteOutcomeUnknown(key=key) from None
            raise AccessError('TRANSPORT_FAILED') from None
        try:
            if not isinstance(response, Mapping): raise AccessError('INVALID_RESPONSE')
            if response.get('schema') != self.schema: raise SchemaMismatch('SCHEMA_MISMATCH')
            if 'error' in response:
                if set(response) - {'schema', 'error'}: raise AccessError('INVALID_RESPONSE')
                refusal = wire_error(response['error'])
            else:
                refusal = None
                if writing and response.get('status', 'committed') != 'committed': raise AccessError('INVALID_RESPONSE')
            result = dict(response)
        except Exception:
            if writing: raise WriteOutcomeUnknown(key=key) from None
            raise
        if refusal is not None:
            if isinstance(refusal, WriteOutcomeUnknown): refusal.key = key
            raise refusal
        return result
    def key(self, record: str, value: Any) -> dict[str, Any]:
        spec = self.records[record]
        if type(value) is not spec['key_type']: raise AccessError('KEY_TYPE')
        validate_model(value, spec['key'])
        return {f['id']: encode(getattr(value, f['python']), f) for f in spec['key']}
    def row(self, record: str, value: Mapping[str, Any]) -> Any:
        spec = self.records[record]
        if not isinstance(value, Mapping): raise AccessError('INVALID_RESPONSE')
        if set(value) - {f['id'] for f in spec['fields']}: raise AccessError('INVALID_RESPONSE')
        return spec['row_type'](**{f['python']: decode(value[f['id']], f) if f['id'] in value else MISSING for f in spec['fields']})
    def action_inputs(self, action: str, arguments: Mapping[str, Any]) -> dict[str, Any]:
        spec = self.actions[action]
        encoded = {}
        for p in spec['parameters']:
            value = arguments[p['python']]
            if isinstance(value, Missing):
                if p['required']: raise AccessError('REQUIRED', p['id'])
                continue
            if 'record' in p:
                encoded[p['id']] = self.key(p['record'], value)
            else:
                check(value, p['field']); encoded[p['id']] = encode(value, p['field'])
        return encoded
    def action_receipt(self, action: str, response: Mapping[str, Any]) -> Receipt[Any, Any]:
        if set(response) - {'schema', 'status', 'created', 'changed', 'counts', 'consistency_token'}:
            raise AccessError('INVALID_RESPONSE')
        if response.get('status', 'committed') != 'committed': raise AccessError('INVALID_RESPONSE')
        spec = self.actions[action]
        def keys(name: str) -> tuple[Any, ...]:
            raw = response[name]
            if not isinstance(raw, list): raise AccessError('INVALID_RESPONSE')
            result = []
            for item in raw:
                if not isinstance(item, Mapping) or set(item) != {'record', 'key'}: raise AccessError('INVALID_RESPONSE')
                record = item['record']
                if not isinstance(record, str) or record not in spec['affected']: raise AccessError('INVALID_RESPONSE')
                info = self.records[record]
                if not isinstance(item['key'], Mapping) or set(item['key']) != {f['id'] for f in info['key']}: raise AccessError('INVALID_RESPONSE')
                result.append(info['key_type'](**{f['python']: decode(item['key'][f['id']], f) for f in info['key']}))
            return tuple(result)
        token = response['consistency_token']
        if not isinstance(token, str) or not token: raise AccessError('INVALID_RESPONSE')
        counts = response['counts']
        if not isinstance(counts, Mapping) or any(not isinstance(k, str) or type(v) is not int or v < 0 for k, v in counts.items()):
            raise AccessError('INVALID_RESPONSE')
        return Receipt(keys('created'), keys('changed'), dict(counts), token, None)
    async def apply(self, action: str, arguments: Mapping[str, Any], *, idempotency_key: str | None = None) -> Receipt[Any, Any]:
        if idempotency_key is not None and (not isinstance(idempotency_key, str) or not idempotency_key): raise AccessError('INVALID')
        encoded = self.action_inputs(action, arguments)
        response = await self.request({'kind': 'apply', 'action': action, 'inputs': encoded, 'idempotency_key': idempotency_key})
        try:
            return self.action_receipt(action, response)
        except Exception:
            raise WriteOutcomeUnknown(key=idempotency_key) from None
    async def validate(self, action: str, arguments: Mapping[str, Any]) -> ValidationResult:
        encoded = self.action_inputs(action, arguments)
        response = await self.request({'kind': 'validate', 'action': action, 'inputs': encoded})
        if set(response) != {'schema', 'valid'} or response['valid'] is not True: raise AccessError('INVALID_RESPONSE')
        return ValidationResult()
    async def apply_batch(self, action: str, items: Sequence[Any], input_type: type[Any], *, atomic: bool = False, stop_on_error: bool = False, idempotency_key: str | None = None) -> BatchReceipt[Any, Any]:
        if type(atomic) is not bool or type(stop_on_error) is not bool: raise AccessError('INVALID')
        if idempotency_key is not None and (not isinstance(idempotency_key, str) or not idempotency_key): raise AccessError('INVALID')
        if not isinstance(items, Sequence) or not 1 <= len(items) <= 100: raise AccessError('LIMIT')
        snapshot: list[Any] = []
        for item in items:
            if len(snapshot) == 100: raise AccessError('LIMIT')
            snapshot.append(item)
        if not snapshot: raise AccessError('LIMIT')
        if any(type(item) is not input_type for item in snapshot): raise AccessError('TYPE')
        encoded = [self.action_inputs(action, {p['python']: getattr(item, p['python']) for p in self.actions[action]['parameters']}) for item in snapshot]
        response = await self.request({'kind': 'apply_batch', 'action': action, 'items': encoded, 'atomic': atomic, 'stop_on_error': stop_on_error, 'idempotency_key': idempotency_key})
        try:
            if set(response) - {'schema', 'status', 'items', 'consistency_token'}: raise AccessError('INVALID_RESPONSE')
            token = response['consistency_token']
            raw = response['items']
            if not isinstance(token, str) or not token or not isinstance(raw, list) or len(raw) != len(snapshot): raise AccessError('INVALID_RESPONSE')
            results: list[BatchItemOutcome[Any, Any]] = []
            stopped = False
            for item in raw:
                if not isinstance(item, Mapping): raise AccessError('INVALID_RESPONSE')
                status = item.get('status')
                receipt, error = None, None
                if stopped and status != 'unattempted': raise AccessError('INVALID_RESPONSE')
                if status == 'applied':
                    if set(item) != {'status', 'receipt'} or not isinstance(item['receipt'], Mapping) or set(item['receipt']) != {'created', 'changed', 'counts'}: raise AccessError('INVALID_RESPONSE')
                    receipt = self.action_receipt(action, {**item['receipt'], 'consistency_token': token})
                elif status == 'refused':
                    if set(item) != {'status', 'error'}: raise AccessError('INVALID_RESPONSE')
                    error = wire_error(item['error'])
                    if isinstance(error, WriteOutcomeUnknown): raise AccessError('INVALID_RESPONSE')
                elif status in ('rolled_back', 'unknown', 'unattempted'):
                    if set(item) != {'status'}: raise AccessError('INVALID_RESPONSE')
                else: raise AccessError('INVALID_RESPONSE')
                if stop_on_error and status in ('refused', 'unknown'): stopped = True
                results.append(BatchItemOutcome(status, receipt, error))
            statuses = [item.status for item in results]
            if atomic:
                if not all(status == 'applied' for status in statuses) and ('applied' in statuses or 'unknown' in statuses or 'refused' not in statuses): raise AccessError('INVALID_RESPONSE')
            elif 'rolled_back' in statuses or 'unattempted' in statuses and not stop_on_error:
                raise AccessError('INVALID_RESPONSE')
            if not atomic and 'unattempted' in statuses:
                first = statuses.index('unattempted')
                if not first or statuses[first-1] not in ('refused', 'unknown'): raise AccessError('INVALID_RESPONSE')
            return BatchReceipt(tuple(results), token)
        except Exception:
            raise WriteOutcomeUnknown(key=idempotency_key) from None

@dataclass(frozen=True)
class Query(Generic[R, K]):
    record: str
    client: Client | None = None
    predicates: tuple[Predicate[R], ...] = ()
    ordering: tuple[Ordering[R], ...] = ()
    source: Query[Any, Any] | None = None
    relationship: Relationship[Any, Any, Any, Any] | None = None
    selected_key: K | None = None
    def using(self, client: Client) -> Query[R, K]:
        if self.record not in client.records or not client.records[self.record].get('selected'):
            raise Unsupported('UNSUPPORTED')
        return replace(self, client=client, source=self.source.using(client) if self.source is not None else None)
    def filter(self, *predicates: Predicate[R]) -> Query[R, K]:
        if any(not isinstance(p, Predicate) or p.owner != self.record for p in predicates): raise AccessError('PREDICATE_OWNER')
        return replace(self, predicates=self.predicates + predicates)
    def where(self, *predicates: Predicate[R]) -> Query[R, K]:
        return self.filter(*predicates)
    async def get_many(self, keys: Sequence[K]) -> tuple[R | None, ...]:
        if self.client is None: raise AccessError('UNBOUND_QUERY')
        if len(keys) > 100: raise AccessError('LIMIT')
        if not keys: return ()
        info = self.client.records[self.record]
        predicates: list[Mapping[str, Any]] = []
        for key in keys:
            encoded = self.client.key(self.record, key)
            predicates.append({'op': 'and', 'args': [{'op': 'eq', 'field': k, 'value': v} for k, v in encoded.items()]})
        page = await self.filter(Predicate(self.record, {'op': 'or', 'args': predicates})).page(size=100)
        if page.next_cursor is not None: raise AccessError('NON_UNIQUE_KEY')
        by_key = {info['key_type'](**{f['python']: getattr(row, f['python']) for f in info['key']}): row for row in page.items}
        return tuple(by_key.get(key) for key in keys)
    async def one(self) -> R:
        page = await self.page(size=2)
        if len(page.items) != 1 or page.next_cursor is not None: raise AccessError('NOT_EXACTLY_ONE')
        return page.items[0]
    def order_by(self, *ordering: Ordering[R]) -> Query[R, K]:
        if any(o.owner != self.record for o in ordering): raise AccessError('ORDER_OWNER')
        return replace(self, ordering=ordering)
    def by_key(self, key: K) -> Query[R, K]:
        if self.client is not None: self.client.key(self.record, key)
        return replace(self, selected_key=key)
    def related(self, relationship: Relationship[R, O, K, V]) -> Query[O, V]:
        if relationship.owner != self.record: raise AccessError('RELATIONSHIP_OWNER')
        return Query(relationship.target, client=self.client, source=self, relationship=relationship)
    def document(self) -> dict[str, Any]:
        if self.client is None: raise AccessError('UNBOUND_QUERY')
        if not self.client.records[self.record].get('selected'): raise Unsupported('UNSUPPORTED')
        result: dict[str, Any] = {'record': self.record, 'filters': [dict(p.expression) for p in self.predicates],
            'order': [{'field': o.field, 'direction': o.direction} for o in self.ordering]}
        if self.selected_key is not None: result['key'] = self.client.key(self.record, self.selected_key)
        if self.source is not None and self.relationship is not None:
            result['source'] = self.source.document()
            result['relationship'] = {'module': self.relationship.module, 'id': self.relationship.identity, 'direction': self.relationship.direction}
        return result
    async def page(self, *, size: int = 100, after: str | None = None, at_least: str | None = None) -> Page[R]:
        if type(size) is not int or not 1 <= size <= 100: raise AccessError('LIMIT')
        if self.client is None: raise AccessError('UNBOUND_QUERY')
        response = await self.client.request({'kind': 'read', 'query': self.document(), 'size': size, 'after': after, 'at_least': at_least})
        raw = response.get('rows')
        if not isinstance(raw, list) or len(raw) > size: raise AccessError('INVALID_RESPONSE')
        cursor = response.get('cursor')
        if cursor is not None and (not isinstance(cursor, str) or not cursor): raise AccessError('INVALID_RESPONSE')
        return Page(tuple(cast(R, self.client.row(self.record, row)) for row in raw), cursor)
    async def all(self, *, limit: int = 100, at_least: str | None = None) -> tuple[R, ...]:
        page = await self.page(size=limit, at_least=at_least)
        if page.next_cursor is not None: raise AccessError('TOO_MANY_ROWS')
        return page.items
    async def first(self, *, at_least: str | None = None) -> R | None:
        page = await self.page(size=1, at_least=at_least)
        return page.items[0] if page.items else None
    async def get(self, key: K, *, at_least: str | None = None) -> R | None:
        page = await self.by_key(key).page(size=2, at_least=at_least)
        if len(page.items) > 1 or page.next_cursor: raise AccessError('NON_UNIQUE_KEY')
        return page.items[0] if page.items else None
`;

// Derive only the scheduling-dependent classes from the controlled template.
// Values, wire validation, fields, predicates and relationships stay shared.
const binding = `    def using(self, client: Client) -> Query[R, K]:
        if self.record not in client.records or not client.records[self.record].get('selected'):
            raise Unsupported('UNSUPPORTED')
        return replace(self, client=client, source=self.source.using(client) if self.source is not None else None)`;
const overloadedBinding = `    @overload
    def using(self, client: SyncClient) -> SyncQuery[R, K]: ...
    @overload
    def using(self, client: Client) -> Query[R, K]: ...
    def using(self, client: Client | SyncClient) -> Query[R, K] | SyncQuery[R, K]:
        if not isinstance(client, (Client, SyncClient)):
            raise AccessError('CLIENT_TYPE')
        if self.client is not None and isinstance(client, SyncClient):
            raise AccessError('CLIENT_TYPE')
        if self.record not in client.records or not client.records[self.record].get('selected'):
            raise Unsupported('UNSUPPORTED')
        if isinstance(client, SyncClient):
            return SyncQuery(self.record, client, self.predicates, self.ordering,
                             self.source.using(client) if self.source is not None else None,
                             self.relationship, self.selected_key)
        return replace(self, client=client, source=self.source.using(client) if self.source is not None else None)`;
if (!asyncRuntime.includes(binding)) throw new Error('Runtime query binding template changed');
const syncClasses = asyncRuntime.slice(asyncRuntime.indexOf('class Client:'))
 .replace(/\basync def /g, 'def ').replace(/\bawait /g, '')
 .replace(/\b(Client|Query|Transport)\b/g, name => 'Sync' + name)
 .replace('        self.transport, self.schema = transport, schema',
          `        if not callable(getattr(transport, 'execute', None)) or iscoroutinefunction(transport.execute):
            raise TypeError('SyncTransport.execute must be synchronous')
        self.transport, self.schema = transport, schema`)
 .replace('    def using(self, client: SyncClient) -> SyncQuery[R, K]:\n',
          `    def using(self, client: SyncClient) -> SyncQuery[R, K]:
        if not isinstance(client, SyncClient): raise AccessError('CLIENT_TYPE')
`);
export const pythonRuntime = asyncRuntime.replace(binding, overloadedBinding) + `
AsyncTransport = Transport

class SyncTransport(Protocol):
    def execute(self, request: dict[str, Any]) -> Mapping[str, Any]: ...

` + syncClasses;
