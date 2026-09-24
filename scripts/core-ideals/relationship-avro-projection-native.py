"""Validate emitted authored carriers with two independent pinned codecs."""
import hashlib
import io
import json
from pathlib import Path
import avro
import avro.io
import avro.schema
import fastavro
assert (avro.__version__, fastavro.__version__) == ('1.12.0', '1.12.2')
fixture = 'fixtures/avro/relationship-projection-cases.json'
rows = []
for case in json.loads(Path(fixture).read_text())['cases']:
    if case['status'] != 'projected':
        assert 'schemaText' not in case
        continue
    raw = json.loads(case['schemaText'])
    field = raw['fields'][0]
    wire = field['type']
    key = wire[1] if isinstance(wire, list) else wire['items'] if wire.get('type') == 'array' else wire
    value = {f['name']: 'account' if f['type'] == 'string' else 17 for f in key['fields']}
    values = [{field['name']: None}, {field['name']: value}] if isinstance(wire, list) else [{field['name']: []}, {field['name']: [value, value]}] if wire.get('type') == 'array' else [{field['name']: value}]
    parsed = {'apache': avro.schema.parse(case['schemaText']), 'fastavro': fastavro.parse_schema(raw)}
    for writer in parsed:
        stream = io.BytesIO()
        for datum in values:
            if writer == 'apache': avro.io.DatumWriter(parsed[writer]).write(datum, avro.io.BinaryEncoder(stream))
            else: fastavro.schemaless_writer(stream, parsed[writer], datum, strict=True)
        row = {'case': case['name'], 'writer': writer, 'hex': stream.getvalue().hex(), 'reads': {}}
        for reader in parsed:
            source = io.BytesIO(stream.getvalue())
            actual = [avro.io.DatumReader(parsed[reader]).read(avro.io.BinaryDecoder(source)) if reader == 'apache' else fastavro.schemaless_reader(source, parsed[reader]) for _ in values]
            assert actual == values and source.tell() == len(stream.getvalue())
            row['reads'][reader] = {'values': actual, 'bytesConsumed': source.tell()}
        rows.append(row)
paths = [fixture, 'scripts/core-ideals/relationship-avro-projection-native.py', 'scripts/core-ideals/relationship-avro-projection-cases.ts', 'src/core-ideals/relationship-avro-projection.ts', 'src/core-ideals/relationship-avro-carrier.ts', 'spec/core/relationship-avro-projection.schema.json']
proof = {'scope': 'Authored target-key-record carrier acceptance and value probes; no referential enforcement or full binding acceptance', 'versions': {'apache': avro.__version__, 'fastavro': fastavro.__version__}, 'cases': rows, 'sha256': {p: hashlib.sha256(Path(p).read_bytes()).hexdigest() for p in paths}}
Path('fixtures/validation/relationship-avro-projection-native.json').write_text(json.dumps(proof, indent=2)+'\n')
print(json.dumps({'carriers': len(rows)//2, 'writerRuns': len(rows), 'crossReads': sum(len(r['reads']) for r in rows)}))
