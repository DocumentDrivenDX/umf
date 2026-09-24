"""Independent temporal interpretation and recovery probes; no inferred conformance."""
import io, json, warnings
from pathlib import Path
import avro, avro.schema, avro.io, fastavro

assert (avro.__version__, fastavro.__version__) == ('1.12.0', '1.12.2')
fixture = Path('fixtures/avro/temporal-metadata.json')
cases = json.loads(fixture.read_text())['cases']
results = []
carrier = io.BytesIO()
avro.io.BinaryEncoder(carrier).write_long(1234567)
binary = carrier.getvalue()
for case in cases:
    for engine in ['apache', 'fastavro']:
        observations = []
        for text in [case['source'], *[e['native'] for e in case['exports']]]:
            result = {}
            with warnings.catch_warnings(record=True) as notices:
                warnings.simplefilter('always')
                try:
                    schema = avro.schema.parse(text) if engine == 'apache' else fastavro.parse_schema(json.loads(text))
                    inp = io.BytesIO(binary)
                    row = avro.io.DatumReader(schema).read(avro.io.BinaryDecoder(inp)) if engine == 'apache' else fastavro.schemaless_reader(inp, schema)
                    out = io.BytesIO()
                    if engine == 'apache':
                        avro.io.DatumWriter(schema).write(row, avro.io.BinaryEncoder(out))
                    else:
                        fastavro.schemaless_writer(out, schema, row)
                    result.update(accepted=True, valueType=type(row['value']).__name__, value=str(row['value']), hex=out.getvalue().hex())
                except Exception as error:
                    result.update(accepted=False, errorType=type(error).__name__, message=str(error))
                result['warnings'] = sorted(set(str(w.message) for w in notices))
            if result['accepted']:
                assert result['hex'] == binary.hex(), (case['id'], engine, result)
            observations.append(result)
        assert observations[0] == observations[1] == observations[2], case['id']
        if 'suffix' in case['id'] or 'wrong-carrier' in case['id']:
            assert observations[0]['accepted'] and observations[0]['valueType'] == 'int', (case['id'], engine, observations)
        results.append({'id': case['id'], 'engine': engine, 'observation': observations[0], 'recoveriesAgree': 2})
import hashlib
output = {'avro': avro.__version__, 'fastavro': fastavro.__version__, 'sourceSha256': hashlib.sha256(fixture.read_bytes()).hexdigest(), 'cases': results,
          'scope': 'Schema recovery and one native binary carrier per case. Unknown temporal spellings retain integer carriers. Native support for valid annotations differs; parser rejection and warnings are recorded. No complete temporal-range or cross-system value equivalence claim.'}
Path('fixtures/avro/temporal-metadata-oracle.json').write_text(json.dumps(output, indent=2)+'\n')
print({'cases':len(results), 'recoveries':2*len(results), 'parserRejections':sum(not r['observation']['accepted'] for r in results)})
