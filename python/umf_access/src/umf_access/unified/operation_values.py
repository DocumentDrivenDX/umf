# SPDX-License-Identifier: MIT OR Apache-2.0
"""Exact native operation values, bounded frames and opaque page tokens."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from uuid import UUID

from .session_policy import SessionError

MAX_FRAME=8*1024*1024


def canonical(value):
    return json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':'),allow_nan=False)


def bounded_size(value, limit=MAX_FRAME):
    """Stop before assembling a potentially huge repeated-key JSON frame."""
    size=0
    encoder=json.JSONEncoder(ensure_ascii=False,sort_keys=True,separators=(',',':'),allow_nan=False)
    for chunk in encoder.iterencode(value):
        size+=len(chunk.encode('utf-8'))
        if size>limit:raise SessionError('native wire frame bound exceeded')
    return size


def digest(value):
    return hashlib.sha256(canonical(value).encode('utf-8')).hexdigest()


def _unique(pairs):
    result={}
    for key,value in pairs:
        if key in result:raise SessionError('invalid operation JSON')
        result[key]=value
    return result


def loads(raw):
    try:return json.loads(raw,object_pairs_hook=_unique,parse_constant=lambda _:(_ for _ in ()).throw(ValueError()))
    except (ValueError,TypeError,RecursionError):raise SessionError('invalid operation JSON') from None


def token_encode(secret,scope,after):
    raw=canonical({'version':'umf.table-cursor/0.1','scope':scope,'after':after}).encode('utf-8')
    encoded=base64.urlsafe_b64encode(raw).rstrip(b'=').decode('ascii')
    result=encoded+'.'+hmac.new(secret,encoded.encode('ascii'),hashlib.sha256).hexdigest()
    if len(result)>16384:raise SessionError('cursor capacity exceeded')
    return result


def token_decode(secret,token):
    if type(token) is not str or len(token)>16384:raise SessionError('invalid cursor')
    try:
        encoded,signature=token.split('.')
        if not re.fullmatch('[A-Za-z0-9_-]+',encoded) or not re.fullmatch('[a-f0-9]{64}',signature):raise ValueError()
        expected=hmac.new(secret,encoded.encode('ascii'),hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature,expected):raise ValueError()
        raw=base64.b64decode(encoded+'='*(-len(encoded)%4),altchars=b'-_',validate=True)
        parsed=loads(raw)
        if type(parsed) is not dict or set(parsed)!={'version','scope','after'} or parsed['version']!='umf.table-cursor/0.1' or type(parsed['scope']) is not dict or type(parsed['after']) is not list:raise ValueError()
        return parsed
    except (ValueError,TypeError,UnicodeError):raise SessionError('invalid cursor') from None


def native_arguments(program, item=0):
    sources={slot['id']:slot['source'] for slot in program['parameterSources']}
    result=[]
    for name in program['dbapiParameterOrder']:
        source=sources[name]
        if source['kind']=='input':value=program['nativeInputs'][item][source['parameter']]
        elif source['kind']=='after':value=program['nativeAfter'][source['index']]
        elif source['kind']=='literal':value=source['nativeValue']
        else:raise SessionError('unknown operation parameter source')
        result.append(value)
    return tuple(result)


def value_from_native(value,output):
    if value is None:
        if output['nullable']:return None
        raise SessionError('native result omitted a required value')
    kind=output['carrier']
    if kind=='boolean' and type(value) is bool:return value
    if type(value) is not str:raise SessionError('native result carrier differs')
    value.encode('utf-8')
    if kind=='string':return value
    if kind=='date':
        try:
            if re.fullmatch('[0-9]{4}-[0-9]{2}-[0-9]{2}',value) and date.fromisoformat(value).isoformat()==value:return {'date':value}
        except ValueError:pass
    if kind=='timestamp':
        try:
            if re.fullmatch(r'[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{6}Z',value):
                datetime.fromisoformat(value)
                return {'timestamp':value}
        except ValueError:pass
    if kind=='integer' and re.fullmatch(r'-?(?:0|[1-9][0-9]*)',value):return {'integerToken':value}
    if kind=='decimal' and re.fullmatch(r'-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?',value):
        try:
            if Decimal(value).is_finite():return {'decimalToken':value}
        except InvalidOperation:pass
    if kind=='uuid':
        try:
            if str(UUID(value))==value:return {'uuid':value}
        except ValueError:pass
    if kind=='bits128' and re.fullmatch('[a-f0-9]{32}',value):return {'bits128Hex':value}
    raise SessionError('native result value differs from its declared carrier')


def key_literal(value,carrier):
    if value is None:raise SessionError('native cursor key is absent')
    if carrier=='string':return {'string':value}
    if carrier=='boolean':return {'boolean':value}
    return value


def result_frame(program,rows,scope,secret):
    outputs=program['outputs'];result=program['result'];kind=result['kind'];bound=result['maxRows']
    if kind=='count':
        if len(rows)!=1 or len(rows[0])!=1:raise SessionError('native count cardinality differs')
        count=value_from_native(rows[0][0],outputs[0])
        if count['integerToken'].startswith('-'):raise SessionError('native count is negative')
        response={'kind':'count','count':count}
    else:
        if any(len(row)!=len(outputs) for row in rows):raise SessionError('native result arity differs')
        decoded=[{out['field']['element']:value_from_native(value,out) for out,value in zip(outputs,row)} for row in rows]
        if kind=='one' and not decoded:raise SessionError('required row not found')
        if kind in ('one','optional') and len(decoded)>1:raise SessionError('native single-row cardinality exceeded')
        if kind=='many' and len(decoded)>bound:raise SessionError('native result row bound exceeded')
        cursor=None
        if kind=='page' and len(decoded)>bound:
            if len(decoded)!=bound+1:raise SessionError('native page bound exceeded')
            decoded=decoded[:bound];last=decoded[-1];by_field={canonical(o['field']):o for o in outputs}
            after=[key_literal(last[ref['element']],by_field[canonical(ref)]['carrier']) for ref in result['cursor']['fields']]
            cursor=token_encode(secret,scope,after)
        response={'kind':kind,'rows':decoded,'cursor':cursor}
    response.update({'version':'umf.table-read-result/0.1','module':program['module'],'operation':program['operation'],
                     'sourceDigest':program['binding']['modelSha256']})
    bounded_size(response)
    return response
