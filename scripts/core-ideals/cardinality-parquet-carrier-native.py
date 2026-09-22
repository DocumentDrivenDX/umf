"""Independent native read/write checks for generated nested schema carriers."""
import datetime
import hashlib
import io
import json
from pathlib import Path
import pyarrow as pa
import pyarrow.parquet as pq

assert pa.__version__ == '21.0.0'
corpus = 'fixtures/validation/cardinality-parquet-carrier-corpus.json'
rows = json.loads(Path(corpus).read_text())['rows']
types = {'boolean': pa.bool_(), 'int32': pa.int32(), 'int64': pa.int64(),
         'float32': pa.float32(), 'float64': pa.float64(), 'binary': pa.binary(),
         'string': pa.string(), 'date': pa.date32(), 'time-millis': pa.time32('ms'),
         'time-micros': pa.time64('us'), 'timestamp-millis-utc': pa.timestamp('ms', tz='UTC'),
         'timestamp-micros-utc': pa.timestamp('us', tz='UTC')}
values = {'boolean': True, 'int32': 7, 'int64': 9007199254740993,
          'float32': 1.0000000000000002, 'float64': 1.0000000000000002,
          'binary': b'\x00\xff', 'string': '雪', 'date': datetime.date(2026, 9, 22),
          'time-millis': datetime.time(12, 34, 56, 123000),
          'time-micros': datetime.time(12, 34, 56, 123456),
          'timestamp-millis-utc': datetime.datetime(2026, 9, 22, 12, 34, 56, 123000, tzinfo=datetime.timezone.utc),
          'timestamp-micros-utc': datetime.datetime(2026, 9, 22, 12, 34, 56, 123456, tzinfo=datetime.timezone.utc)}


def field(name, node):
    kind = node['kind']
    if kind == 'scalar':
        typ = types[node['nativeType']]
    elif kind == 'array':
        typ = pa.list_(field('element', node['item']))
    elif kind == 'map':
        typ = pa.map_(types[node['keyType']], field('value', node['value']))
    else:
        typ = pa.struct([field(f['name'], f['type']) for f in node['fields']])
    return pa.field(name, typ, nullable=node['nullable'])


def sample(node, narrowed=False):
    kind = node['kind']
    if kind == 'scalar':
        return 1.0 if narrowed and node['nativeType'] == 'float32' else values[node['nativeType']]
    if kind == 'array':
        v = sample(node['item'], narrowed)
        return ([None] if node['item']['nullable'] else []) + [v, v]
    if kind == 'map':
        key = 'a' if node['keyType'] == 'string' else 1
        v = sample(node['value'], narrowed)
        return [(key, None if node['value']['nullable'] else v), (key, v)]
    return {f['name']: sample(f['type'], narrowed) for f in node['fields']}


checks = []
for row in rows:
    raw = Path(row['path']).read_bytes()
    assert hashlib.sha256(raw).hexdigest() == row['sha256']
    native = pq.ParquetFile(io.BytesIO(raw))
    expected_field = field('value', row['carrier'])
    assert native.schema_arrow.field(0).equals(expected_field, check_metadata=False), row['id']
    assert native.schema_arrow.field(0).metadata[b'PARQUET:field_id'] == b'37'
    assert native.metadata.num_rows == native.metadata.num_row_groups == 0
    assert native.read(use_threads=False).num_rows == 0
    value = sample(row['carrier'])
    expected = sample(row['carrier'], True)
    records = [{'value': value}]
    if row['carrier']['nullable']:
        records.insert(0, {'value': None})
    if row['carrier']['kind'] in ('array', 'map'):
        records.append({'value': []})
    table = pa.Table.from_pylist(records, schema=native.schema_arrow)
    out = io.BytesIO()
    pq.write_table(table, out)
    back = pq.ParquetFile(io.BytesIO(out.getvalue())).read(use_threads=False).to_pylist()
    expected_records = [dict(r) for r in records]
    expected_records[1 if row['carrier']['nullable'] else 0] = {'value': expected}
    assert back == expected_records, (row['id'], back, expected_records)
    checks.append({'id': row['id'], 'rows': len(back), 'floatNarrowing': value != expected,
                   'physicalColumns': len(native.schema), 'schema': str(native.schema_arrow)})

paths = [corpus, __file__, 'src/core-ideals/parquet-cardinality-carrier.ts',
         'scripts/core-ideals/cardinality-parquet-carrier-cases.ts',
         'scripts/core-ideals/cardinality-parquet-carrier-oracle.ts']
record = {'runtime': 'PyArrow ' + pa.__version__, 'scope': 'Explicit generated native schema carriers and independent native row writes, not ideal projection or native equivalence',
          'checks': checks, 'files': len(checks), 'rows': sum(c['rows'] for c in checks),
          'floatNarrowings': sum(c['floatNarrowing'] for c in checks),
          'sha256': {p: hashlib.sha256(Path(p).read_bytes()).hexdigest() for p in paths}}
Path('fixtures/validation/cardinality-parquet-carrier-native.json').write_text(json.dumps(record, indent=2) + '\n')
print(json.dumps({k: record[k] for k in ['runtime', 'files', 'rows', 'floatNarrowings']}))
