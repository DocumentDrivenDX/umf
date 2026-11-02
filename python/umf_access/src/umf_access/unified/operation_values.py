# SPDX-License-Identifier: MIT OR Apache-2.0
"""Exact native operation values, bounded frames and opaque page tokens."""
from __future__ import annotations

import json
import math
import re
import struct
from datetime import date, datetime
from decimal import Decimal, InvalidOperation, getcontext
from uuid import UUID

from .session_policy import SessionError

MAX_FRAME=8*1024*1024
_READ_FRAME_PROFILE='umf-python-read-frame/0.1.0'
_READ_FRAME_REFUSALS={
    'count_cardinality':'native count cardinality differs',
    'result_arity':'native result arity differs',
    'required_row_missing':'required row not found',
    'single_row_exceeded':'native single-row cardinality exceeded',
    'row_bound_exceeded':'native result row bound exceeded',
    'page_bound_exceeded':'native page bound exceeded',
}


def _json_input(value):
    """Serialize the explicitly supported Python JSON-like carrier for Rust."""
    def admit(item):
        kind = type(item)
        if item is None or kind in (bool, int, float, str):
            if kind is str:
                item.encode("utf-8")
            if kind is float and not math.isfinite(item):
                raise SessionError("invalid operation JSON")
            return
        if kind in (list, tuple):
            for child in item:
                admit(child)
            return
        if kind is dict:
            for key, child in item.items():
                if type(key) is not str:
                    raise SessionError("invalid operation JSON")
                key.encode("utf-8")
                admit(child)
            return
        raise SessionError("invalid operation JSON")

    try:
        admit(value)
        return json.dumps(value, ensure_ascii=False, sort_keys=True,
                          separators=(",", ":"), allow_nan=False)
    except (ValueError, TypeError, UnicodeError, RecursionError):
        raise SessionError("invalid operation JSON") from None


def _rust_values():
    from umf import rust_operation_values

    try:
        rust_operation_values.require_operation_values_profile()
    except (ImportError, AttributeError, RuntimeError) as error:
        raise SessionError("native operation-values capability unavailable") from error
    return rust_operation_values


def _native_error(error, default):
    message = str(error)
    allowed = {
        "invalid operation JSON", "native wire frame bound exceeded",
        "cursor capacity exceeded", "invalid cursor", "native cursor key is absent",
    }
    return SessionError(message if message in allowed else default)


def _native_result_classify(kind, token):
    try:
        return _rust_values().operation_native_result_classify(kind, token)
    except SessionError:
        raise
    except (AttributeError, RuntimeError) as error:
        raise SessionError('native operation-values capability unavailable') from error
    except (ValueError, TypeError, UnicodeError) as error:
        raise _native_error(error, 'native result value differs from its declared carrier') from None


def _count_token_nonnegative_rust(token):
    """Private exact-token stage; the public result_frame route is unchanged."""
    if type(token) is not str:
        raise SessionError('exact native count token required')
    try:
        from umf import rust_operation_values
    except ImportError as error:
        raise SessionError('native count-token capability unavailable') from error
    try:
        profile = rust_operation_values.operation_count_token_profile_version()
    except AttributeError as error:
        raise SessionError('native count-token capability unavailable') from error
    if profile != 'umf-operation-count-token/0.1.0':
        raise SessionError('native count-token capability profile mismatch')
    try:
        decision = rust_operation_values.operation_count_token_nonnegative(token)
    except AttributeError as error:
        raise SessionError('native count-token capability unavailable') from error
    if type(decision) is not bool:
        raise RuntimeError('invalid native count-token decision')
    return decision


def canonical(value):
    try:
        return _rust_values().operation_canonical(_json_input(value))
    except SessionError:
        raise
    except (ValueError, TypeError, UnicodeError, RecursionError) as error:
        raise _native_error(error, "invalid operation JSON") from None


def bounded_size(value, limit=MAX_FRAME):
    """Stop Rust canonical encoding as soon as the UTF-8 frame limit is crossed."""
    if type(limit) is int and limit < 0:
        raise SessionError("native wire frame bound exceeded")
    try:
        return _rust_values().operation_bounded_size(value, limit)
    except SessionError:
        raise
    except (ValueError, TypeError, UnicodeError, RecursionError) as error:
        raise _native_error(error, "invalid operation JSON") from None


def digest(value):
    try:
        return _rust_values().operation_digest(_json_input(value))
    except SessionError:
        raise
    except (ValueError, TypeError, UnicodeError, RecursionError) as error:
        raise _native_error(error, "invalid operation JSON") from None


def _unique(pairs):
    result={}
    for key,value in pairs:
        if key in result:raise SessionError('invalid operation JSON')
        result[key]=value
    return result


def loads(raw):
    try:
        raw_bytes = raw.encode("utf-8") if type(raw) is str else bytes(raw)
        validated = _rust_values().operation_loads(raw_bytes)
        return json.loads(validated, object_pairs_hook=_unique,
                          parse_constant=lambda _: (_ for _ in ()).throw(ValueError()))
    except SessionError:
        raise
    except (ValueError, TypeError, RecursionError, UnicodeError) as error:
        if isinstance(error, SessionError):
            raise
        raise _native_error(error, "invalid operation JSON") from None


def token_encode(secret,scope,after):
    try:
        return _rust_values().operation_token_encode(
            secret, _json_input(scope), _json_input(after))
    except SessionError:
        raise
    except (ValueError, TypeError, UnicodeError, RecursionError) as error:
        raise _native_error(error, "invalid operation JSON") from None


def token_decode(secret,token):
    if type(token) is not str or len(token)>16384:raise SessionError('invalid cursor')
    try:
        decoded = _rust_values().operation_token_decode(secret, token)
        return json.loads(decoded, object_pairs_hook=_unique)
    except SessionError:
        raise
    except (ValueError, TypeError, UnicodeError, RecursionError) as error:
        raise _native_error(error, "invalid cursor") from None

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


def native_batch_arguments(program):
    """Serialize admitted input slots per item and fixed literal slots once."""
    sources = {slot['id']: slot['source'] for slot in program['parameterSources']}
    ordered = [sources[name] for name in program['parameterOrder']]
    inputs = [source['parameter'] for source in ordered if source['kind'] == 'input']
    literals = [source['nativeValue'] for source in ordered if source['kind'] == 'literal']
    if any(source['kind'] not in ('input', 'literal') for source in ordered):
        raise SessionError('unsupported batch parameter source')
    values = {
        'nativeRows': canonical([[row[name] for name in inputs] for row in program['nativeInputs']]),
        'nativeLiterals': canonical(literals),
    }
    return tuple(values[name] for name in program['nativeBatch']['dbapiParameterOrder'])


def value_from_native(value,output):
    if value is None:
        if output['nullable']:return None
        raise SessionError('native result omitted a required value')
    kind=output['carrier']
    if kind=='boolean' and type(value) is bool:return value
    if type(value) is not str:raise SessionError('native result carrier differs')
    value.encode('utf-8')
    if kind=='string':return value
    if type(kind) is str and kind in ('integer','decimal','uuid','bits128'):
        try:
            decision = _rust_values().operation_native_token_classify(kind, value)
        except SessionError:
            raise
        except (AttributeError, RuntimeError) as error:
            raise SessionError('native operation-values capability unavailable') from error
        except (ValueError, TypeError, UnicodeError) as error:
            raise _native_error(error, 'native result value differs from its declared carrier') from None
        if decision == 'accepted':
            key = {'integer':'integerToken','decimal':'decimalToken','uuid':'uuid','bits128':'bits128Hex'}[kind]
            return {key:value}
        if kind == 'decimal' and decision == 'decimal-invalid-operation':
            getcontext().flags[InvalidOperation] = True
        raise SessionError('native result value differs from its declared carrier')
    if type(kind) is str and kind == 'date':
        if _native_result_classify('date', value) == 'accepted':
            return {'date':value}
        raise SessionError('native result value differs from its declared carrier')
    if type(kind) is str and kind == 'timestamp':
        if _native_result_classify('timestamp', value) == 'candidate':
            try:
                datetime.fromisoformat(value)
                return {'timestamp':value}
            except ValueError:
                pass
        raise SessionError('native result value differs from its declared carrier')
    if type(kind) is str and kind == 'float':
        native_encoding = output.get('nativeEncoding')
        if native_encoding == 'ieee754-binary64-hex':
            if _native_result_classify('float-ieee754-binary64-hex', value) == 'accepted':
                number=struct.unpack('!d',bytes.fromhex(value))[0]
                return {'floatToken':repr(number)}
            raise SessionError('native result value differs from its declared carrier')
        if _native_result_classify('float', value) == 'accepted':
            return {'floatToken':value}
        raise SessionError('native result value differs from its declared carrier')
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
    # Dynamic carrier objects keep the predecessor's Python comparison path;
    # exact built-in token kinds were decided by Rust above.
    if type(kind) is not str and kind=='integer' and re.fullmatch(r'-?(?:0|[1-9][0-9]*)',value):return {'integerToken':value}
    if type(kind) is not str and kind=='decimal' and re.fullmatch(r'-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?',value):
        try:
            if Decimal(value).is_finite():return {'decimalToken':value}
        except InvalidOperation:pass
    if kind=='float' and output.get('nativeEncoding')=='ieee754-binary64-hex':
        if re.fullmatch('[0-9a-f]{16}',value):
            number=struct.unpack('!d',bytes.fromhex(value))[0]
            if math.isfinite(number):return {'floatToken':repr(number)}
        raise SessionError('native result value differs from its declared carrier')
    if kind=='float' and re.fullmatch(r'-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?',value):
        try:
            if math.isfinite(float(value)):return {'floatToken':value}
        except ValueError:pass
    if type(kind) is not str and kind=='uuid':
        try:
            if str(UUID(value))==value:return {'uuid':value}
        except ValueError:pass
    if type(kind) is not str and kind=='bits128' and re.fullmatch('[a-f0-9]{32}',value):return {'bits128Hex':value}
    raise SessionError('native result value differs from its declared carrier')


def key_literal(value,carrier):
    if value is None:raise SessionError('native cursor key is absent')
    if type(carrier) is str:
        try:
            mode = _rust_values().operation_key_literal_mode(carrier, False)
        except SessionError:
            raise
        except (AttributeError, RuntimeError) as error:
            raise SessionError('native operation-values capability unavailable') from error
        except ValueError as error:
            raise _native_error(error, 'invalid operation JSON') from None
        if mode == 'string':return {'string':value}
        if mode == 'boolean':return {'boolean':value}
        return value
    if carrier=='string':return {'string':value}
    if carrier=='boolean':return {'boolean':value}
    return value


_COUNT_RESULT_FRAME_PROFILE = 'umf-operation-count-result-frame/0.1.0'

def _count_result_frame_rust(program,integer_token):
    if type(integer_token) is not str:
        raise SessionError('exact native count token required')
    try:
        from umf import rust_operation_values
    except ImportError as error:
        raise SessionError('native count-result-frame capability unavailable') from error
    try:
        profile=rust_operation_values.operation_count_result_frame_profile_version()
    except AttributeError as error:
        raise SessionError('native count-result-frame capability unavailable') from error
    if profile!=_COUNT_RESULT_FRAME_PROFILE:
        raise SessionError('native count-result-frame capability profile mismatch')
    try:
        result=rust_operation_values.operation_count_result_frame(
            program['module'],program['operation'],program['binding']['modelSha256'],integer_token)
    except AttributeError as error:
        raise SessionError('native count-result-frame capability unavailable') from error
    except (ValueError,TypeError,UnicodeError) as error:
        message=str(error)
        if message in ('native count is negative','native result value differs from its declared carrier',
                       'native wire frame bound exceeded'):
            raise SessionError(message) from None
        raise SessionError('native count-result-frame capability refused the DTO') from None
    if type(result) is not str:
        raise SessionError('native count-result-frame capability returned an invalid result')
    return result


def result_frame(program,rows,scope,secret):
    outputs=program['outputs'];result=program['result'];kind=result['kind'];bound=result['maxRows']
    if kind=='count':
        _read_frame_shape_rust(kind,0,rows)
        count=value_from_native(rows[0][0],outputs[0])
        # Keep the predecessor's lookup/type failure order, then send only the
        # exact built-in decoded integer-token DTO across the Rust boundary.
        integer_token=count['integerToken']
        if type(count) is not dict or set(count)!={'integerToken'} or type(integer_token) is not str:
            raise SessionError('native count result DTO is unsupported')
        if not _count_token_nonnegative_rust(integer_token):
            raise SessionError('native count is negative')
        response_json=_count_result_frame_rust(program,integer_token)
        try:return json.loads(response_json)
        except (ValueError,TypeError,RecursionError):raise SessionError('native count result DTO is invalid') from None
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


def _read_frame_rust():
    try:
        from umf import rust_values
    except ImportError as error:
        raise SessionError('native read-frame capability unavailable') from error

    try:
        profile = rust_values.access_stream_read_frame_profile_version
    except AttributeError as error:
        raise SessionError('native read-frame capability unavailable') from error
    try:
        version = profile()
    except AttributeError as error:
        raise SessionError('native read-frame capability unavailable') from error
    if version != _READ_FRAME_PROFILE:
        raise SessionError('native read-frame capability profile mismatch')
    return rust_values


def _read_frame_shape_rust(kind, outputs, rows):
    """Private post-host shape seam; host row reads and failures stay in Python."""
    native = _read_frame_rust()
    try:
        operation = native.access_stream_read_frame_shape
    except AttributeError as error:
        raise SessionError('native read-frame capability unavailable') from error
    result = operation(kind, outputs, rows)
    if type(result) is not str:
        raise SessionError('native read-frame capability returned an invalid result')
    if result == 'admitted':
        return
    refusal = _READ_FRAME_REFUSALS.get(result)
    if refusal is None:
        raise SessionError('native read-frame capability returned an invalid result')
    raise SessionError(refusal)


def _read_frame_cardinality_rust(kind, row_count, bound):
    """Private post-decode seam; callers must decode all rows before invoking."""
    native = _read_frame_rust()
    try:
        operation = native.access_stream_read_frame_cardinality
    except AttributeError as error:
        raise SessionError('native read-frame capability unavailable') from error
    result = operation(kind, row_count, bound)
    if type(result) is not str:
        raise SessionError('native read-frame capability returned an invalid result')
    if result == 'admitted':
        return
    refusal = _READ_FRAME_REFUSALS.get(result)
    if refusal is None:
        raise SessionError('native read-frame capability returned an invalid result')
    raise SessionError(refusal)
