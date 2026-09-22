"""Independent fastavro role checks and cross-codec authored projection samples."""
import io
import json
from datetime import date, time, datetime, timezone, timedelta
from decimal import Decimal
from pathlib import Path
import avro
import avro.schema
import avro.io
import fastavro

assert fastavro.__version__ == '1.12.2'
assert avro.__version__ == '1.12.0'
read = lambda name: json.loads(Path('fixtures/validation/' + name + '.json').read_text())

def resolved_fields(row):
    names, roots = {}, []
    for dependency in row['dependencies']:
        roots.append(fastavro.parse_schema(json.loads(dependency['schema']), named_schemas=names))
    roots.append(fastavro.parse_schema(json.loads(row['schema']), named_schemas=names))
    seen, fields, records = set(), {}, []
    def visit(schema):
        if isinstance(schema, str):
            if schema in names:
                visit(names[schema])
            return
        if isinstance(schema, list):
            for branch in schema:
                visit(branch)
            return
        kind = schema['type']
        if kind in ('record', 'error'):
            fullname = schema['name']
            if fullname in seen:
                return
            seen.add(fullname)
            records.append((fullname, [f['name'] for f in schema['fields']]))
            for field in schema['fields']:
                fields[(fullname, field['name'])] = field['type']
                visit(field['type'])
        elif kind == 'array':
            visit(schema['items'])
        elif kind == 'map':
            visit(schema['values'])
    for root in roots:
        visit(root)
    return fields, records, names

membership = []
for row in read('field-avro-corpus')['rows']:
    fields, records, _ = resolved_fields(row)
    assert list(fields) == [(f['record'], f['name']) for f in row['fields']]
    expected_records = []
    for record in row['records']:
        target = record['result']['target']
        lookup = {(m['id'], e['id']): e for m in target['modules'] for e in m['elements']}
        expected_records.append((record['fullname'], [lookup[(r['module'], r['element'])]['name'] for r in target['modules'][-1]['elements'][0]['references']]))
    assert records == expected_records
    membership.append({'id': row['id'], 'fields': len(fields), 'records': len(records)})

direct_count, blocked_count = 0, 0
for row in read('avro-record-type-corpus')['rows']:
    fields, _, names = resolved_fields(row)
    for field in row['fields']:
        native = fields[(field['record'], field['name'])]
        if isinstance(native, str):
            native = names.get(native, native)
        if isinstance(native, dict) and native.get('type') in names:
            native = names[native['type']]
        direct = isinstance(native, dict) and native.get('type') in ('record', 'error')
        result = field['result']
        assert (result['status'] == 'classified') == direct
        if direct:
            module = result['target']['modules'][-1]
            record = module['elements'][0]
            assert (module['namespace'] + '.' if module['namespace'] else '') + record['name'] == native['name']
            lookup = {(m['id'], e['id']): e for m in result['target']['modules'] for e in m['elements']}
            assert [lookup[(r['module'], r['element'])]['name'] for r in record['references']] == [f['name'] for f in native['fields']]
            direct_count += 1
        else:
            blocked_count += 1

values = {'null': None, 'boolean': True, 'int': 2147483647, 'long': 9007199254740993,
          'float': 1.0000000000000002, 'double': 1.0000000000000002,
          'bytes': b'\x00\xff', 'string': 'Unicode 雪', 'date': date(2024, 1, 2),
          'time-millis': time(12, 34, 56, 789000), 'time-micros': time(12, 34, 56, 789123),
          'timestamp-millis': datetime(2024, 1, 2, tzinfo=timezone.utc),
          'timestamp-micros': datetime(2024, 1, 2, 0, 0, 0, 123456, tzinfo=timezone.utc),
          'local-timestamp-micros': 123456789, 'decimal(38,9)': Decimal('123.450000000')}

def cross_codec(text, datum, fast_expected, apache_expected):
    apache = avro.schema.parse(text)
    fast = fastavro.parse_schema(json.loads(text))
    a, b = io.BytesIO(), io.BytesIO()
    avro.io.DatumWriter(apache).write(datum, avro.io.BinaryEncoder(a))
    fastavro.schemaless_writer(b, fast, datum)
    assert a.getvalue() == b.getvalue()
    assert fastavro.schemaless_reader(io.BytesIO(a.getvalue()), fast) == fast_expected
    assert avro.io.DatumReader(apache).read(avro.io.BinaryDecoder(io.BytesIO(b.getvalue()))) == apache_expected
    return len(a.getvalue())

samples = []
for row in read('field-avro-projection-corpus')['rows']:
    kind = row['request']['nativeType']
    value = values[kind]
    apache_value = 1.0 if kind == 'float' else value
    fast_value = datetime(1970, 1, 1) + timedelta(microseconds=value) if kind == 'local-timestamp-micros' else apache_value
    length = cross_codec(row['text'], {'value': value}, {'value': fast_value}, {'value': apache_value})
    samples.append({'nativeType': kind, 'binaryBytes': length, 'floatNarrowing': kind == 'float',
                    'readerRepresentationDiffers': kind == 'local-timestamp-micros'})
records = []
for row in read('field-avro-projection-corpus')['records']:
    if row['result']['status'] == 'blocked':
        assert 'text' not in row and 'target' not in row['result']
        continue
    datum = {} if row['variant'] == 'empty' else {'id': 42, 'label': 'Unicode 雪', 'active': 1 if row['variant'] == 'mismatch' else True}
    records.append({'variant': row['variant'], 'mode': row['request']['mode'], 'binaryBytes': cross_codec(row['text'], datum, datum, datum)})
result = {'fastavro': fastavro.__version__, 'apacheAvro': avro.__version__, 'membership': membership,
          'directRecords': direct_count, 'nonDirectTypes': blocked_count, 'fieldSamples': samples, 'recordSamples': records,
          'limitations': ['Samples establish cross-codec wire compatibility, not full value-domain equivalence.',
                         'local-timestamp-micros reads as datetime in fastavro and plain long in Apache Python; equal bytes do not imply equal logical interpretation.']}
Path('fixtures/validation/field-avro-fastavro-native.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({'membershipBundles': len(membership), 'directRecords': direct_count, 'nonDirectTypes': blocked_count, 'fieldSamples': len(samples), 'recordSamples': len(records)}))
