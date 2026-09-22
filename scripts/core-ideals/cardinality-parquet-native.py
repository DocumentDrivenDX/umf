"""Pinned native Cardinality discovery; not a UMF binding acceptance test."""
import hashlib
import json
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq

assert pa.__version__ == '21.0.0'
root = Path('fixtures/parquet/cardinality')
root.mkdir(parents=True, exist_ok=True)
metadata = {b'future.meaning': b'unclassified', b'future.exact': b'9007199254740993'}
cases = []


def normalized(value):
    # Preserve maps as ordered pairs, including duplicate/non-string keys.
    return json.loads(json.dumps(value, ensure_ascii=False))


def add(label, typ, values, expected=None, **observations):
    expected = values if expected is None else expected
    for embedded in [False, True]:
        identity = f'{label}-{int(embedded)}'
        field = pa.field('value', typ, nullable=True,
                         metadata={b'PARQUET:field_id': b'37', b'future.field': b'opaque'})
        schema = pa.schema([field], metadata=metadata)
        table = pa.Table.from_arrays([pa.array(values, type=typ)], schema=schema)
        path = root / (identity + '.parquet')
        pq.write_table(table, path, compression='NONE', use_dictionary=False,
                       version='2.6', store_schema=embedded)
        native = pq.ParquetFile(path)
        output = native.read(use_threads=False).column('value').to_pylist()
        assert normalized(output) == normalized(expected), (identity, output, expected)
        raw = path.read_bytes()
        back_type = native.schema_arrow.field('value').type
        if pa.types.is_map(typ):
            assert not back_type.keys_sorted, (identity, back_type)
        if pa.types.is_large_list(typ):
            assert pa.types.is_large_list(back_type) == embedded
        if pa.types.is_fixed_size_list(typ):
            assert pa.types.is_fixed_size_list(back_type) == embedded
        footer = native.metadata.metadata or {}
        assert (b'ARROW:schema' in footer) == embedded
        visible = {k.decode(): v.decode() for k, v in footer.items() if k != b'ARROW:schema'}
        assert visible == ({k.decode(): v.decode() for k, v in metadata.items()} if embedded else {})
        cases.append({
            'id': identity, 'path': str(path), 'storeSchema': embedded,
            'input': normalized(values), 'output': normalized(output),
            'exactInputRecovery': normalized(values) == normalized(output),
            'authoredArrowType': str(typ), 'readArrowType': str(back_type),
            'physicalSchema': '\n'.join(str(native.schema).splitlines()[1:]),
            'columns': [{'path': native.schema.column(i).path,
                         'definitionLevel': native.schema.column(i).max_definition_level,
                         'repetitionLevel': native.schema.column(i).max_repetition_level}
                        for i in range(len(native.schema))],
            'footerMetadata': visible, 'embeddedArrow': embedded,
            'observations': observations, 'bytes': len(raw),
            'sha256': hashlib.sha256(raw).hexdigest(),
        })


add('scalar', pa.int32(), [None, 0, 7], shape='one')
add('array-duplicates', pa.list_(pa.int64()), [None, [], [2, 1, 2]], shape='array')
add('array-null-members', pa.list_(pa.int64()), [None, [], [None, 7, None]], shape='array')
add('array-nested', pa.list_(pa.list_(pa.int64())),
    [None, [], [None, [], [1, None, 2]]], shape='array')
add('array-record-members', pa.list_(pa.struct([pa.field('member', pa.int32())])),
    [None, [], [None, {'member': None}, {'member': 7}]], shape='array')
add('map-unique-strings', pa.map_(pa.string(), pa.int64()),
    [None, [], [('e\u0301', 1), ('é', 2), ('__proto__', 3), ('constructor', 4)]],
    shape='map', exactStringKeys=True, sampleUniqueKeys=True, schemaEnforcesUniqueKeys=False)
add('map-duplicate-strings', pa.map_(pa.string(), pa.int64()),
    [None, [], [('a', 1), ('a', 2)]], shape='map', sampleUniqueKeys=False,
    idealUniqueKeyMap=False)
add('map-integer-keys', pa.map_(pa.int64(), pa.int64()),
    [None, [], [(1, 3), (1, 4)]], shape='map', exactStringKeys=False,
    idealUniqueKeyMap=False)
add('map-null-values', pa.map_(pa.string(), pa.int64()),
    [None, [], [('a', None), ('b', 7)]], shape='map')
add('map-array-values', pa.map_(pa.string(), pa.list_(pa.int64())),
    [None, [], [('a', None), ('b', []), ('c', [1, None, 1])]], shape='map')
add('array-map-members', pa.list_(pa.map_(pa.string(), pa.int64())),
    [None, [], [None, [], [('a', 1), ('a', 2)]]], shape='array')
add('map-sorted-flag', pa.map_(pa.string(), pa.int64(), keys_sorted=True),
    [None, [], [('z', 1), ('a', 2)]], shape='map', authoredKeysSorted=True,
    sortedInput=False, flagEnforced=False, readKeysSorted=False)
add('array-large-offsets', pa.large_list(pa.int64()), [None, [], [1, 2]],
    shape='array', offsetWidthIsNativeRefinement=True)
add('array-fixed-length', pa.list_(pa.int64(), 2), [[1, 2], [3, None]],
    shape='array', fixedLengthIsNativeRefinement=True)
add('array-float-narrowing', pa.list_(pa.float32()), [[1.0000000000000002]],
    expected=[[1.0]], shape='array', exactItemValues=False)

refusals = []
for label, typ, values in [
    ('map-null-key', pa.map_(pa.string(), pa.int64()), [[(None, 7)]]),
    ('fixed-list-wrong-size', pa.list_(pa.int64(), 2), [[1]]),
]:
    try:
        pa.array(values, type=typ)
    except (pa.ArrowInvalid, pa.ArrowTypeError) as error:
        refusals.append({'id': label, 'stage': 'construct', 'error': type(error).__name__,
                         'message': str(error)})
    else:
        raise AssertionError((label, 'Unexpected native acceptance'))

record = {
    'runtime': 'PyArrow ' + pa.__version__,
    'writer': {'formatVersion': '2.6', 'compression': 'NONE', 'useDictionary': False},
    'scope': 'Native schema/value discovery, not UMF classification, projection or equivalence',
    'cases': cases, 'refusals': refusals,
    'summary': {'cases': len(cases), 'refusals': len(refusals),
                'floatNarrowings': sum(not c['exactInputRecovery'] for c in cases)},
    'limits': [
        'A unique-key sample does not establish schema-enforced map uniqueness.',
        'PyArrow reads maps as ordered pairs; do not silently collapse duplicates or coerce keys.',
        'keys_sorted input metadata neither rejects unsorted pairs nor survives as a read type flag here.',
        'Physical LIST and embedded large/fixed-list declarations are separate retained meanings.',
        'Empty containers, absent containers and absent members are distinct observations.',
        'Only PyArrow 21.0.0 output is generated; legacy/malformed layouts need the existing wire corpus.',
        'UMF source-byte recovery, classification/projection and real-browser checks remain separate work.',
    ],
    'sha256': {__file__: hashlib.sha256(Path(__file__).read_bytes()).hexdigest()},
}
Path('fixtures/validation/cardinality-parquet-profile-native.json').write_text(
    json.dumps(record, indent=2, ensure_ascii=False) + '\n')
print(json.dumps(record['summary']))
