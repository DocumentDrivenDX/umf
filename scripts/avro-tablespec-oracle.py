import io,json,warnings
from pathlib import Path
import avro,avro.schema,avro.io,fastavro
assert (avro.__version__,fastavro.__version__)==('1.12.0','1.12.2')
def decode(n):
    if n['kind']=='object':return {k:decode(v) for k,v in n['members'].items()}
    if n['kind']=='array':return [decode(v) for v in n['items']]
    if n['kind']=='null':return None
    if n['kind']=='number':return json.loads(n['value'])
    return n['value']
def payload(source):return next(e['extensions']['umf.avro'] for m in source['modules'] for e in m['elements'] if 'umf.avro' in e['extensions'])
schemas=[]
with warnings.catch_warnings(record=True) as notices:
    warnings.simplefilter('always')
    for c in json.loads(Path('fixtures/avro/tablespec-projection.json').read_text())['cases']:
        p=payload(c['source']);names=avro.schema.Names();fastnames={}
        for dep in p.get('dependencies',[]):avro.schema.make_avsc_object(decode(dep['root']),names);fastavro.parse_schema(decode(dep['root']),fastnames)
        avro.schema.make_avsc_object(decode(p['root']),names);fastavro.parse_schema(decode(p['root']),fastnames);schemas.append(c['id'])
roundtrip=json.loads(Path('fixtures/avro/tablespec-carrier-roundtrip.json').read_text());before=decode(payload(roundtrip['source'])['root']);after=json.loads(roundtrip['reverse']['nativeSchema']);assert before==after
def apache(schema,row):
    parsed=avro.schema.parse(json.dumps(schema));out=io.BytesIO();avro.io.DatumWriter(parsed).write(row,avro.io.BinaryEncoder(out));data=out.getvalue();return data,avro.io.DatumReader(parsed).read(avro.io.BinaryDecoder(io.BytesIO(data)))
def fast(schema,row):
    out=io.BytesIO();fastavro.schemaless_writer(out,schema,row,strict=True);data=out.getvalue();return data,fastavro.schemaless_reader(io.BytesIO(data),schema)
results=[]
for row in [{'title':'雪','count':-2147483648,'flag':False,'score':1.5,'optional':None},{'title':'','count':2147483647,'flag':True,'score':-2.25,'optional':'present'}]:
    outputs=[encoder(schema,row) for schema in [before,after] for encoder in [apache,fast]]
    assert all(value==row and binary==outputs[0][0] for binary,value in outputs)
    results.append({'bytes':len(outputs[0][0]),'fourCodecResultsAgree':True})
# The float family is not width equivalence: independently measure binary64 -> binary32 loss.
value=1.0000000000000002;loss=[]
for encoder in [apache,fast]:
    original=encoder({'type':'record','name':'F','fields':[{'name':'v','type':'double'}]},{'v':value})[1]['v']
    narrowed=encoder({'type':'record','name':'F','fields':[{'name':'v','type':'float'}]},{'v':value})[1]['v']
    assert original==value and narrowed==1.0 and original!=narrowed;loss.append({'before':original,'after':narrowed})
result={'avro':avro.__version__,'fastavro':fastavro.__version__,'sourceSchemas':schemas,'warnings':sorted(set(str(w.message) for w in notices)),'carrierRoundTrips':results,'floatWidthCounterexamples':loss,'scope':'Independent schema and carrier round-trip evidence; complex text, decimal and temporal row encoders are not implemented by the projection'}
Path('fixtures/avro/tablespec-oracle.json').write_text(json.dumps(result,indent=2)+'\n');print({'schemas':len(schemas),'roundTrips':len(results),'widthCounterexamples':len(loss)})
