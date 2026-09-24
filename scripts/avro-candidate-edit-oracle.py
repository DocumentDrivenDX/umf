import copy, hashlib, io, json, warnings
from pathlib import Path
import avro, avro.schema, avro.io, fastavro

assert (avro.__version__, fastavro.__version__) == ('1.12.0', '1.12.2')
fixture = Path('fixtures/avro/candidate-edits.json')
def render(node):
    kind = node['kind']
    if kind == 'object': return '{'+','.join(json.dumps(k)+':'+render(v) for k,v in node['members'].items())+'}'
    if kind == 'array': return '['+','.join(render(v) for v in node['items'])+']'
    if kind == 'number': return node['value']
    return json.dumps(None if kind == 'null' else node['value'])
def original(document):
    payload = document['modules'][0]['elements'][0]['extensions']['umf.avro']
    return {'schema':render(payload['root']), 'dependencies':[{'schema':render(d['root'])} for d in payload.get('dependencies',[])]}
def parse(bundle, engine):
    names = avro.schema.Names() if engine == 'apache' else {}
    parse_one = (lambda s: avro.schema.make_avsc_object(json.loads(s), names)) if engine == 'apache' else (lambda s: fastavro.parse_schema(json.loads(s), named_schemas=names))
    for dep in bundle['dependencies']: parse_one(dep['schema'])
    return parse_one(bundle['schema'])
def decode(binary, schema, engine, reader=None):
    inp=io.BytesIO(binary)
    return avro.io.DatumReader(schema, reader).read(avro.io.BinaryDecoder(inp)) if engine=='apache' else fastavro.schemaless_reader(inp,schema,reader)
results=[]
for case in json.loads(fixture.read_text())['cases']:
    # Identical unscaled 1234, microsecond count 1234567 and integer count 7.
    binary=bytes.fromhex('000004d2') if case['id']=='dependency' else bytes.fromhex('0404d28eda96010e')
    for engine in ['apache','fastavro']:
        observations=[]
        for bundle in [original(case['result']['source']), *case['exports']]:
            with warnings.catch_warnings(record=True) as notices:
                warnings.simplefilter('always')
                schema=parse(bundle,engine);row=decode(binary,schema,engine);out=io.BytesIO()
                if engine=='apache':avro.io.DatumWriter(schema).write(row,avro.io.BinaryEncoder(out))
                else:fastavro.schemaless_writer(out,schema,row)
                assert out.getvalue()==binary
                result={'values':{k:str(v) for k,v in row.items()},'types':{k:type(v).__name__ for k,v in row.items()},'hex':out.getvalue().hex()}
                if case['id']=='exact-default':
                    writer_native=json.loads(bundle['schema']);writer_native['fields']=writer_native['fields'][:-1]
                    writer=parse({'schema':json.dumps(writer_native),'dependencies':[]},engine)
                    resolved=decode(binary[:-1],writer,engine,schema)
                    result['resolvedDefault']=str(resolved['count'])
                result['warnings']=sorted(set(str(w.message) for w in notices))
            observations.append(result)
        assert observations[1]==observations[2]
        before,after=observations[:2]
        if case['id'] in ['scale','dependency']:
            assert before['values']['amount']=='12.34' and after['values']['amount']=='1.234'
        if case['id']=='exact-default':
            assert before['resolvedDefault']=='0' and after['resolvedDefault']=='9223372036854775807'
        if case['id']=='unknown':assert after['types']['created']=='int'
        results.append({'id':case['id'],'engine':engine,'original':before,'candidate':after,'candidateRecoveriesAgree':2})
output={'avro':avro.__version__,'fastavro':fastavro.__version__,'sourceSha256':hashlib.sha256(fixture.read_bytes()).hexdigest(),'cases':results,'scope':'Five explicit schema edits, two native codecs, one binary carrier per schema and exact reader-default resolution. Byte equality across decimal edits is not value equivalence; logical interpretation changes are measured. No automatic schema evolution or row migration.'}
Path('fixtures/avro/candidate-edits-oracle.json').write_text(json.dumps(output,indent=2)+'\n')
print({'cases':len(results),'candidateRecoveries':2*len(results)})
