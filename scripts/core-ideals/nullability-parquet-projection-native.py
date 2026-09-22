"""Validate generated schema files and exercise native writer behavior separately."""
import datetime, hashlib, io, json, pathlib
import pyarrow as pa
import pyarrow.parquet as pq
assert pa.__version__ == '21.0.0'
corpus = json.loads(pathlib.Path('fixtures/validation/nullability-parquet-projection-corpus.json').read_text())
values = {'boolean': True, 'int32': 7, 'int64': 9007199254740993, 'float32': 1.0000000000000002, 'float64': 1.0000000000000002, 'binary': b'\x00\xff', 'string': 'snow 雪', 'date': datetime.date(2026, 9, 22), 'time-millis': datetime.time(12, 34, 56, 123000), 'time-micros': datetime.time(12, 34, 56, 123456), 'timestamp-millis-utc': datetime.datetime(2026, 9, 22, 12, 34, 56, 123000, tzinfo=datetime.timezone.utc), 'timestamp-micros-utc': datetime.datetime(2026, 9, 22, 12, 34, 56, 123456, tzinfo=datetime.timezone.utc)}
types = {'boolean': pa.bool_(), 'int32': pa.int32(), 'int64': pa.int64(), 'float32': pa.float32(), 'float64': pa.float64(), 'binary': pa.binary(), 'string': pa.string(), 'date': pa.date32(), 'time-millis': pa.time32('ms'), 'time-micros': pa.time64('us'), 'timestamp-millis-utc': pa.timestamp('ms', tz='UTC'), 'timestamp-micros-utc': pa.timestamp('us', tz='UTC')}
checks = []
files = narrowed = 0
for row in corpus['rows']:
    if row['result']['status'] == 'blocked':
        assert 'target' not in row['result']
        continue
    raw = bytes(row['bytes'])
    assert pathlib.Path(row['path']).read_bytes() == raw
    file = pq.ParquetFile(io.BytesIO(raw))
    request = row['request']; name = request['fieldName']; kind = request['nativeType']
    assert file.metadata.num_rows == 0 and file.metadata.num_row_groups == 0
    assert file.read().num_rows == 0 and file.schema.names == [name]
    col = file.schema.column(0)
    assert col.max_repetition_level == 0
    assert col.max_definition_level == (0 if row['required'] else 1)
    field = file.schema_arrow.field(0)
    assert field.type == types[kind] and field.nullable == (not row['required'])
    files += 1
    for case in ['present', 'null', 'omitted']:
        data = {} if case == 'omitted' else {name: values[kind] if case == 'present' else None}
        expected_failure = row['required'] and case != 'present'
        table = pa.Table.from_pylist([data], schema=file.schema_arrow)
        output = io.BytesIO()
        try:
            pq.write_table(table, output)
        except pa.ArrowInvalid as error:
            assert expected_failure, (row['id'], case, str(error))
            checks.append({'id': row['id'], 'case': case, 'outcome': 'rejected', 'error': str(error)})
            continue
        assert not expected_failure, (row['id'], case)
        decoded = pq.read_table(io.BytesIO(output.getvalue())).to_pylist()[0][name]
        expected = (1.0 if kind == 'float32' else values[kind]) if case == 'present' else None
        assert decoded == expected, (row['id'], case, decoded, expected)
        narrowing = case == 'present' and kind == 'float32'
        if narrowing:
            assert decoded != values[kind]
            narrowed += 1
        # ISO serialization avoids timezone-object addresses in evidence.
        value = decoded.isoformat() if isinstance(decoded, (datetime.date, datetime.time)) else decoded.hex() if isinstance(decoded, bytes) else decoded
        checks.append({'id': row['id'], 'case': case, 'outcome': 'accepted', 'decoded': value, 'narrowed': narrowing})
paths = ['scripts/core-ideals/nullability-parquet-projection-native.py', 'fixtures/validation/nullability-parquet-projection-corpus.json']
result = {'runtime': 'PyArrow '+pa.__version__, 'scope': 'Native generated empty-file schemas; separate PyArrow row writes under those schemas. UMF projects schemas, not row values.', 'files': files, 'checks': checks, 'outcomes': len(checks), 'rejected': sum(c['outcome']=='rejected' for c in checks), 'floatNarrowings': narrowed, 'fingerprints': {p: hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest() for p in paths}}
pathlib.Path('fixtures/validation/nullability-parquet-projection-native.json').write_text(json.dumps(result, indent=2)+'\n')
print({k: v for k, v in result.items() if k not in ('checks', 'fingerprints')})
