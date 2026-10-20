# SPDX-License-Identifier: MIT OR Apache-2.0
"""Authenticated effect receipts; historical business rows are never stored."""
from __future__ import annotations

import hashlib
import hmac
import re

from .operation_values import canonical, digest, loads
from .session_policy import SessionError

_VERSION='umf.table-outcome/0.1'
_HEX=re.compile('[a-f0-9]{64}')


def outcome_invocation(secret, value):
    """Keep historical input fingerprints opaque to native receipt readers."""
    return hmac.new(secret,b'umf.table-outcome/0.1\0invocation\0'+canonical(value).encode('utf-8'),hashlib.sha256).hexdigest()


def outcome_slot(identity, principal_oid, context, operation, key):
    if type(key) is not str or not 1<=len(key.encode('utf-8'))<=256 or '\0' in key:
        raise SessionError('outcome key must contain1..256 UTF8 bytes')
    # The slot is independent of secret rotation, inputs and deployment. A
    # changed verifier or invocation must refuse the occupied slot, never miss
    # it and execute a second write. Native current-role RLS protects its scope.
    return digest([_VERSION,context['schema'],context['module'],identity.kind,
                   identity.subject,principal_oid,operation,key])


def _signature(secret, principal_oid, key_digest, row):
    if type(secret) is not bytes or len(secret)<32:
        raise ValueError('outcome root secret requires at least256 bits')
    key=hmac.new(secret,b'umf.table-outcome/0.1\0receipt-authentication',hashlib.sha256).digest()
    body={'version':_VERSION,'principalOid':principal_oid,'keyDigest':key_digest,
          **{k:row[k] for k in ('invocationDigest','scopeDigest','payload')}}
    return hmac.new(key,canonical(body).encode('utf-8'),hashlib.sha256).hexdigest()


def outcome_record(secret, principal_oid, key_digest, metadata, effects, response):
    payload={'version':_VERSION,**metadata,'effects':[{'integerToken':str(n)} for n in effects],
             'responseDigest':hmac.new(secret,b'umf.table-outcome/0.1\0response\0'+canonical(response).encode('utf-8'),hashlib.sha256).hexdigest()}
    row={'invocationDigest':metadata['invocationDigest'],'scopeDigest':metadata['scopeDigest'],
         'payload':canonical(payload)}
    if len(row['payload'].encode('utf-8'))>131072:
        raise SessionError('outcome receipt capacity exceeded')
    row['signature']=_signature(secret,principal_oid,key_digest,row)
    return row


def outcome_from_record(secret, principal_oid, key_digest, stored, metadata, *, items, max_rows):
    if type(stored) not in (tuple,list) or len(stored)!=4 or any(type(v) is not str for v in stored):
        raise SessionError('stored outcome is invalid')
    invocation,scope,payload,signature=stored
    if (any(_HEX.fullmatch(v) is None for v in (invocation,scope,signature))
            or len(payload.encode('utf-8'))>131072):
        raise SessionError('stored outcome is invalid')
    row={'invocationDigest':invocation,'scopeDigest':scope,'payload':payload}
    if not hmac.compare_digest(signature,_signature(secret,principal_oid,key_digest,row)):
        raise SessionError('stored outcome cannot be authenticated')
    value=loads(payload)
    expected={'version':_VERSION,**metadata}
    if (type(value) is not dict or set(value)!={*expected,'effects','responseDigest'}
            or any(value.get(k)!=v for k,v in expected.items())
            or invocation!=metadata['invocationDigest'] or scope!=metadata['scopeDigest']):
        raise SessionError('stored outcome differs from this invocation or authority')
    effects=value['effects']
    if (type(value['responseDigest']) is not str or _HEX.fullmatch(value['responseDigest']) is None
            or type(effects) is not list or len(effects)!=items):
        raise SessionError('stored outcome is invalid')
    for count in effects:
        if (type(count) is not dict or set(count)!={'integerToken'} or type(count['integerToken']) is not str
                or re.fullmatch('0|[1-9][0-9]{0,4}',count['integerToken']) is None
                or int(count['integerToken'])>max_rows):
            raise SessionError('stored outcome count differs from the declared bound')
    return value
