"""Pinned native discovery for Cardinality; no UMF classification is inferred."""
import hashlib, io, json, warnings
from pathlib import Path
import avro, avro.io, avro.schema, fastavro

assert avro.__version__ == '1.12.0'
assert fastavro.__version__ == '1.12.2'
fixture = 'fixtures/avro/cardinality-cases.json'
rows = json.loads(Path(fixture).read_text())['cases']
codecs = ['apache', 'fastavro']

def parse(codec, text):
    return avro.schema.parse(text) if codec == 'apache' else fastavro.parse_schema(json.loads(text))

def encode(codec, text, value):
    target = io.BytesIO()
    schema = parse(codec, text)
    if codec == 'apache':
        avro.io.DatumWriter(schema).write(value, avro.io.BinaryEncoder(target))
    else:
        fastavro.schemaless_writer(target, schema, value, strict=True)
    return target.getvalue()

def decode(codec, text, raw, reader=None):
    source = io.BytesIO(raw)
    schema = parse(codec, text)
    if codec == 'apache':
        value = avro.io.DatumReader(schema, parse(codec, reader) if reader else schema).read(avro.io.BinaryDecoder(source))
    else:
        value = fastavro.schemaless_reader(source, schema, parse(codec, reader) if reader else None)
    assert source.tell() == len(raw), 'Trailing bytes were not consumed'
    return value

checks = []
for row in rows:
    for writer in codecs:
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter('always')
            raw = encode(writer, row['schema'], row['value'])
            for reader in codecs:
                value = decode(reader, row['schema'], raw)
                assert value == row.get('expected', row['value']), (row['id'], writer, reader, value)
                checks.append({'id': row['id'], 'writer': writer, 'reader': reader, 'hex': raw.hex(), 'value': value,
                               'exactInputRecovery': value == row['value']})
        checks[-1]['warnings'] = [str(w.message) for w in caught]

# Raw block streams may differ from the language-level unique-key map.
map_schema = json.dumps({'type': 'map', 'values': 'long'})
wire_checks = []
for label, hex_value in [('positive-block', '0402610202610400'), ('negative-block', '030c02610202610400')]:
    raw = bytes.fromhex(hex_value)
    for codec in codecs:
        value = decode(codec, map_schema, raw)
        assert value == {'a': 2}, (codec, value)
        rewritten = encode(codec, map_schema, value)
        assert rewritten != raw
        wire_checks.append({'id': label, 'codec': codec, 'hex': hex_value, 'decoded': value,
                            'rewrittenHex': rewritten.hex(), 'exactByteRecovery': False})

# Native shape validation, not host-language coercion or implicit item inference.
refusals = []
for label, schema, value in [
    ('array-rejects-map', {'type': 'array', 'items': 'long'}, {'a': 2}),
    ('map-rejects-array', {'type': 'map', 'values': 'long'}, [2, 1, 2]),
    ('map-rejects-nonstring-key', {'type': 'map', 'values': 'long'}, {1: 2}),
    ('array-rejects-null-item', {'type': 'array', 'items': 'long'}, [None]),
    ('map-rejects-null-value', {'type': 'map', 'values': 'long'}, {'a': None}),
]:
    for codec in codecs:
        try:
            encode(codec, json.dumps(schema), value)
        except Exception as error:
            refusals.append({'id': label, 'codec': codec, 'error': type(error).__name__})
        else:
            raise AssertionError((label, codec, 'Unexpected acceptance'))

# Branch order is a representation detail, never discarded on up-classification.
union_checks = []
first = next(r for r in rows if r['id'] == 'nullable-array-present')['schema']
last = next(r for r in rows if r['id'] == 'array-null-last')['schema']
for writer in codecs:
    for reader in codecs:
        for label, ws, rs in [('null-first-to-last', first, last), ('null-last-to-first', last, first)]:
            for value in [None, [], [2, 1, 2]]:
                datum = {'value': value}
                raw = encode(writer, ws, datum)
                assert decode(reader, ws, raw, rs) == datum
                union_checks.append({'writer': writer, 'reader': reader, 'direction': label, 'value': datum, 'hex': raw.hex()})

output = {
    'scope': 'Native schema/value discovery for Cardinality, not binding acceptance or native equivalence',
    'versions': {'apache': avro.__version__, 'fastavro': fastavro.__version__},
    'checks': checks, 'duplicateKeyStreams': wire_checks, 'refusals': refusals, 'unionResolution': union_checks,
    'limitations': [
        'Decoded unique-key maps do not preserve arbitrary binary duplicate entries or block layout.',
        'Float item schemas narrow binary64 input; ordered shape does not prove item exactness.',
        'Unknown schema metadata remains outside native validation and does not acquire semantics.',
        'UMF classification, ideal projection, retained-source recovery and Chromium evidence are separate unfinished work.'
    ],
    'sha256': {p: hashlib.sha256(Path(p).read_bytes()).hexdigest() for p in [fixture, __file__]},
}
Path('fixtures/validation/cardinality-avro-profile-native.json').write_text(json.dumps(output, indent=2, ensure_ascii=False) + '\n')
print(json.dumps({'schemas': len(rows), 'crossCodecChecks': len(checks), 'duplicateKeyStreams': len(wire_checks), 'refusals': len(refusals), 'unionResolution': len(union_checks), 'floatNarrowings': sum(not c['exactInputRecovery'] for c in checks)}))
