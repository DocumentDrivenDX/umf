"""Pinned scalar facet counterexamples; no UMF ideal/binding acceptance claim."""
import hashlib
import json
from decimal import Decimal
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq

assert pa.__version__ == '21.0.0', pa.__version__
root = Path('fixtures/parquet/facets')
fixture = root / 'discovery-cases.json'
manifest_path = Path('native/parquet/sources/manifest.json')
manifest = json.loads(manifest_path.read_text())
assert manifest['commit'] == '219e3f12a62f9476e830c21e26d030d231f7c017'
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
for item in manifest['files']:
    assert sha(manifest_path.parent / item['local']) == item['sha256']


def datum(d):
    kind, value = d['kind'], d['value']
    if kind == 'integer': return int(value)
    if kind == 'float': return float(value)
    if kind == 'decimal': return Decimal(value)
    if kind == 'bytes': return bytes.fromhex(value)
    assert kind in ['boolean', 'string']
    return value


def describe(value):
    if isinstance(value, bool): return {'kind': 'boolean', 'value': value}
    if isinstance(value, int): return {'kind': 'integer', 'value': str(value)}
    if isinstance(value, float): return {'kind': 'float', 'value': repr(value)}
    if isinstance(value, Decimal): return {'kind': 'decimal', 'value': str(value)}
    if isinstance(value, bytes): return {'kind': 'bytes', 'value': value.hex()}
    assert isinstance(value, str)
    return {'kind': 'string', 'value': value}


def arrow_type(t):
    name = t['name']
    if name == 'fixed': return pa.binary(t['size'])
    if name == 'decimal':
        return (pa.decimal128 if t['precision'] <= 38 else pa.decimal256)(t['precision'], t['scale'])
    return getattr(pa, name)()


rows, paths = [], [str(fixture), __file__, str(manifest_path)]
paths += [str(manifest_path.parent / f['local']) for f in manifest['files']]
for case in json.loads(fixture.read_text())['cases']:
    typ, value = arrow_type(case['type']), datum(case['datum'])
    row = {'id': case['id'], 'arrowType': str(typ), 'input': case['datum']}
    try:
        array = pa.array([value], type=typ, safe=True)
        row['array'] = {'accepted': True, 'output': describe(array[0].as_py())}
    except (pa.ArrowException, OverflowError, ValueError, TypeError, OSError) as error:
        row['array'] = {'accepted': False, 'errorType': type(error).__name__, 'error': str(error)}
    assert row['array']['accepted'] == case['expect']['arrayAccepted'], row
    row['files'] = []
    if row['array']['accepted']:
        field_metadata = {b'PARQUET:field_id': b'37', b'future.field': b'opaque'}
        field_metadata.update({k.encode(): v.encode() for k, v in case.get('metadata', {}).items()})
        schema = pa.schema([pa.field('v', typ, nullable=False, metadata=field_metadata)],
                           metadata={b'future.schema': b'opaque', b'future.integer': b'9007199254740993'})
        table = pa.Table.from_arrays([array], schema=schema)
        for embedded in [False, True]:
            # No partial file is retained for a refused native representation.
            sink = pa.BufferOutputStream()
            try:
                pq.write_table(table, sink, version='2.6', compression='NONE',
                               use_dictionary=False, store_schema=embedded)
                raw = sink.getvalue().to_pybytes()
                native = pq.ParquetFile(pa.BufferReader(raw))
                decoded = native.read(use_threads=False).column(0)[0].as_py()
                result = {'accepted': True, 'output': describe(decoded)}
            except (pa.ArrowException, OverflowError, ValueError, TypeError, OSError) as error:
                result = {'accepted': False, 'errorType': type(error).__name__, 'error': str(error)}
            assert result['accepted'] == case['expect']['parquetAccepted'], (case['id'], result)
            result['storeSchema'] = embedded
            if result['accepted']:
                assert result['output'] == case['expect']['output'], (case['id'], result)
                col = native.schema.column(0)
                footer_metadata = native.metadata.metadata or {}
                assert (b'ARROW:schema' in footer_metadata) == embedded
                recovered_metadata = native.schema_arrow.field(0).metadata or {}
                assert recovered_metadata.get(b'PARQUET:field_id') == b'37'
                if embedded:
                    for k, v in field_metadata.items(): assert recovered_metadata[k] == v
                    assert footer_metadata[b'future.integer'] == b'9007199254740993'
                else:
                    assert b'future.field' not in recovered_metadata
                    assert b'future.schema' not in footer_metadata
                if pa.types.is_integer(typ):
                    assert col.physical_type == ('INT64' if typ.bit_width == 64 else 'INT32')
                if pa.types.is_decimal(typ):
                    assert (col.precision, col.scale) == (typ.precision, typ.scale)
                    assert col.physical_type == 'FIXED_LEN_BYTE_ARRAY'
                path = root / (case['id'] + ('-embedded' if embedded else '-plain') + '.parquet')
                path.write_bytes(raw); paths.append(str(path))
                result.update({'path': str(path), 'sha256': sha(path), 'bytes': len(raw),
                               'physical': col.physical_type, 'logical': json.loads(col.logical_type.to_json()),
                               'converted': col.converted_type, 'precision': col.precision, 'scale': col.scale,
                               'definitionLevel': col.max_definition_level, 'repetitionLevel': col.max_repetition_level,
                               'fieldMetadata': {k.decode(): v.decode() for k, v in recovered_metadata.items()},
                               'sameTypedValue': type(value) == type(decoded) and value == decoded,
                               'sameRepresentation': case['datum'] == result['output']})
            row['files'].append(result)
    rows.append(row)

counts = {'cases': len(rows), 'arraysAccepted': sum(r['array']['accepted'] for r in rows),
          'filesWritten': sum(f['accepted'] for r in rows for f in r['files']),
          'changedTypedValues': sum(not f['sameTypedValue'] for r in rows for f in r['files'] if f['accepted'])}
assert counts['cases'] == 77
assert sum(r['id'].endswith('-fraction') and r['array']['output'] == {'kind': 'integer', 'value': '1'} for r in rows) == 8
out = {'scope': 'Scalar Arrow construction and Parquet 2.6 writer/readback discovery; custom metadata is not enforcement; no malformed-footer or arbitrary reader conformance claim',
       'runtime': 'PyArrow 21.0.0', 'formatSpecificationCommit': manifest['commit'],
       'bindingAccepted': False, 'idealAdmitted': False, 'nativeEquivalence': False,
       'counts': counts, 'cases': rows, 'sha256': {p: sha(p) for p in sorted(set(paths))}}
Path('fixtures/validation/facets-parquet-discovery-native.json').write_text(json.dumps(out, indent=2, ensure_ascii=False) + '\n')
print(json.dumps(counts))
