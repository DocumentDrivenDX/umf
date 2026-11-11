"""Execute generated schemas in both pinned codecs; never treat encoding as uniqueness."""
import io,json,decimal,hashlib
from pathlib import Path
import avro,avro.io,avro.schema,fastavro
assert (avro.__version__,fastavro.__version__)==('1.12.0','1.12.2')
fixture='fixtures/avro/key-projection-generated.json'
cases=json.loads(Path(fixture).read_text())['cases'];rows=[]
def parse(engine,schema):return avro.schema.parse(json.dumps(schema)) if engine=='apache' else fastavro.parse_schema(schema)
def pack(value):
    if isinstance(value,bytes):return {'bytesHex':value.hex()}
    if isinstance(value,decimal.Decimal):return {'decimal':str(value)}
    if isinstance(value,dict):return {k:pack(v) for k,v in value.items()}
    if isinstance(value,list):return [pack(v) for v in value]
    return value
for case in cases:
    schema=json.loads(case['schemaText']);first=schema['fields'][0]['type'];first_name=schema['fields'][0]['name'];code=schema['fields'][1]['name']
    a,b=(decimal.Decimal('1.20'),decimal.Decimal('2.20')) if isinstance(first,dict) else (True,False) if first=='boolean' else (b'\x01',b'\x02') if first=='bytes' else ('a','b') if first=='string' else (1,2)
    values=[{first_name:a,code:'a'},{first_name:a,code:'a'},{first_name:a,code:'b'},{first_name:b,code:'a'}]
    for writer in ['apache','fastavro']:
        native=parse(writer,schema);stream=io.BytesIO()
        def write(value,output):
            if writer=='apache':avro.io.DatumWriter(native).write(value,avro.io.BinaryEncoder(output))
            else:fastavro.schemaless_writer(output,native,value,strict=True)
        for value in values:write(value,stream)
        row={'case':case['name'],'writer':writer,'values':pack(values),'hex':stream.getvalue().hex(),'reads':{},'refusals':[],'coercions':[]}
        for reader in ['apache','fastavro']:
            source=io.BytesIO(stream.getvalue());rs=parse(reader,schema)
            decoded=[avro.io.DatumReader(rs).read(avro.io.BinaryDecoder(source)) if reader=='apache' else fastavro.schemaless_reader(source,rs) for _ in values]
            assert decoded==values,(case['name'],writer,reader,decoded)
            assert source.tell()==len(stream.getvalue());row['reads'][reader]=pack(decoded)
        for label,value in [('missing',{code:'a'}),('null',{first_name:None,code:'a'})]:
            output=io.BytesIO()
            try:write(value,output)
            except Exception as error:
                assert not (first=='boolean' and writer=='fastavro' and label=='null')
                row['refusals'].append({'id':label,'error':type(error).__name__})
            else:
                assert first=='boolean' and writer=='fastavro' and label=='null',(case['name'],writer,label,'unexpected acceptance')
                decoded=fastavro.schemaless_reader(io.BytesIO(output.getvalue()),native);assert decoded=={first_name:False,code:'a'}
                row['coercions'].append({'id':label,'hex':output.getvalue().hex(),'decoded':decoded})
        rows.append(row)
paths=[fixture,'scripts/core-ideals/key-avro-projection-native.py','scripts/core-ideals/key-avro-projection-oracle.ts','scripts/core-ideals/key-avro-projection-cases.ts','src/core-ideals/key-avro-projection.ts','spec/core/key-avro-projection.schema.json']
proof={'scope':'Generated scalar record schemas encode repeated whole records and repeated primary/alternate candidate values; encoding does not enforce keys. Missing writer fields refuse; fastavro boolean null input coerces to false while other tested null controls refuse. No exact-input or full binding acceptance claim.','versions':{'apache':avro.__version__,'fastavro':fastavro.__version__},'rows':rows,'sha256':{p:hashlib.sha256(Path(p).read_bytes()).hexdigest() for p in paths}}
Path('fixtures/validation/key-avro-projection-native.json').write_text(json.dumps(proof,indent=2)+'\n')
print(json.dumps({'schemas':len(cases),'writerCases':len(rows),'crossReads':len(rows)*2,'refusals':sum(len(r['refusals']) for r in rows),'coercions':sum(len(r['coercions']) for r in rows)}))
