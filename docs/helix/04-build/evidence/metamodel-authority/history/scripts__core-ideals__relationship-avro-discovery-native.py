"""Pinned codec probes distinguish named schema reuse from record associations."""
import hashlib
import io
import json
from pathlib import Path
import avro
import avro.io
import avro.schema
import fastavro

assert (avro.__version__, fastavro.__version__) == ('1.12.0', '1.12.2')
fixture = 'fixtures/avro/relationship-discovery-cases.json'
cases = json.loads(Path(fixture).read_text())['cases']

def parse(engine, text):
    return avro.schema.parse(text) if engine == 'apache' else fastavro.parse_schema(json.loads(text))

rows = []
for case in cases:
    for writer in ['apache', 'fastavro']:
        row = {'case': case['id'], 'writer': writer}
        try:
            schema = parse(writer, case['schemaText'])
            row['parse'] = {'ok': True}
        except Exception as error:
            row['parse'] = {'ok': False, 'error': type(error).__name__, 'message': str(error)}
        assert row['parse']['ok'] == case['expectedParse'], row
        if row['parse']['ok']:
            stream = io.BytesIO()
            try:
                for value in case['values']:
                    if writer == 'apache':
                        avro.io.DatumWriter(schema).write(value, avro.io.BinaryEncoder(stream))
                    else:
                        fastavro.schemaless_writer(stream, schema, value, strict=True)
                row['write'] = {'ok': True, 'hex': stream.getvalue().hex()}
            except Exception as error:
                row['write'] = {'ok': False, 'error': type(error).__name__, 'message': str(error)}
            assert row['write']['ok'] == case['expectedWrite'], row
            if row['write']['ok']:
                row['reads'] = {}
                for reader in ['apache', 'fastavro']:
                    source = io.BytesIO(stream.getvalue())
                    reader_schema = parse(reader, case['schemaText'])
                    values = [avro.io.DatumReader(reader_schema).read(avro.io.BinaryDecoder(source))
                              if reader == 'apache' else fastavro.schemaless_reader(source, reader_schema)
                              for _ in case['values']]
                    assert values == case['values'], (case['id'], writer, reader, values)
                    assert source.tell() == len(stream.getvalue())
                    row['reads'][reader] = {'values': values, 'bytesConsumed': source.tell()}
        rows.append(row)

paths = [fixture, 'scripts/core-ideals/relationship-avro-discovery-native.py']
proof = {'scope': 'Named/nested/recursive schema carriers and unenforced relationship metadata; no relationship binding acceptance',
         'bindingImplemented': False, 'nativeEquivalence': False,
         'versions': {'apache': avro.__version__, 'fastavro': fastavro.__version__},
         'cases': rows, 'sha256': {p: hashlib.sha256(Path(p).read_bytes()).hexdigest() for p in paths}}
Path('fixtures/validation/relationship-avro-discovery-native.json').write_text(json.dumps(proof, indent=2)+'\n')
print(json.dumps({'cases': len(rows), 'parseRefusals': sum(not r['parse']['ok'] for r in rows),
                  'writeRefusals': sum(not r.get('write', {'ok': True})['ok'] for r in rows),
                  'crossReads': sum(len(r.get('reads', {})) for r in rows)}))
