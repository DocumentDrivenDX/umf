"""Independent pinned codec checks: accepted records do not establish uniqueness."""
import io, json, hashlib
from pathlib import Path
import avro, avro.io, avro.schema, avro.datafile, fastavro
assert (avro.__version__,fastavro.__version__)==('1.12.0','1.12.2')
fixture='fixtures/avro/key-discovery-cases.json'
cases=json.loads(Path(fixture).read_text())['cases']
rows=[]
def parse(engine,text):
    return avro.schema.parse(text) if engine=='apache' else fastavro.parse_schema(json.loads(text))
for case in cases:
    for writer in ['apache','fastavro']:
        schema=parse(writer,case['schemaText']);stream=io.BytesIO()
        row={'id':case['id'],'writer':writer,'expectedWrite':case['expectedWrite']}
        try:
            for value in case['values']:
                if writer=='apache':avro.io.DatumWriter(schema).write(value,avro.io.BinaryEncoder(stream))
                else:fastavro.schemaless_writer(stream,schema,value,strict=True)
            row['write']={'ok':True,'hex':stream.getvalue().hex()}
        except Exception as e:row['write']={'ok':False,'error':type(e).__name__,'message':str(e)}
        assert row['write']['ok']==case['expectedWrite'],row
        if case['expectedWrite']:
            row['reads']={}
            for reader in ['apache','fastavro']:
                rs=parse(reader,case['schemaText']);source=io.BytesIO(bytes.fromhex(row['write']['hex']))
                values=[]
                for _ in case['values']:
                    values.append(avro.io.DatumReader(rs).read(avro.io.BinaryDecoder(source)) if reader=='apache' else fastavro.schemaless_reader(source,rs))
                expected=[{'value':1.0},{'value':1.0}] if case['id']=='float-narrowing' else case['values']
                assert values==expected,(case['id'],writer,reader,values)
                assert source.tell()==len(bytes.fromhex(row['write']['hex']))
                row['reads'][reader]={'values':values,'bytesConsumed':source.tell(),'count':len(values)}
        rows.append(row)
# Object containers are collections too. Neither writer rejects duplicate records.
containers=[]
for writer in ['apache','fastavro']:
    case=cases[0];stream=io.BytesIO();schema=parse(writer,case['schemaText'])
    if writer=='apache':
        output=avro.datafile.DataFileWriter(stream,avro.io.DatumWriter(),schema,codec='null')
        for value in case['values']:output.append(value)
        output.flush();raw=stream.getvalue();output.close()
    else:
        fastavro.writer(stream,schema,case['values'],codec='null',strict=True);raw=stream.getvalue()
    decoded={}
    for reader in ['apache','fastavro']:
        source=io.BytesIO(raw)
        values=list(avro.datafile.DataFileReader(source,avro.io.DatumReader())) if reader=='apache' else list(fastavro.reader(source))
        assert values==case['values'];decoded[reader]=values
    containers.append({'writer':writer,'count':2,'bytes':len(raw),'reads':decoded})
# Reader defaults synthesize equal fields during schema resolution, not identity.
ws={'type':'record','name':'Resolved','fields':[{'name':'id','type':'long'}]}
rs={**ws,'fields':ws['fields']+[{'name':'code','type':'string','default':'same'}]}
resolution=[]
for writer in ['apache','fastavro']:
    stream=io.BytesIO();native=parse(writer,json.dumps(ws))
    for value in [{'id':1},{'id':2}]:
        if writer=='apache':avro.io.DatumWriter(native).write(value,avro.io.BinaryEncoder(stream))
        else:fastavro.schemaless_writer(stream,native,value,strict=True)
    for reader in ['apache','fastavro']:
        source=io.BytesIO(stream.getvalue());writer_schema=parse(reader,json.dumps(ws));reader_schema=parse(reader,json.dumps(rs));values=[]
        for _ in range(2):values.append(avro.io.DatumReader(writer_schema,reader_schema).read(avro.io.BinaryDecoder(source)) if reader=='apache' else fastavro.schemaless_reader(source,writer_schema,reader_schema))
        assert values==[{'id':1,'code':'same'},{'id':2,'code':'same'}]
        resolution.append({'writer':writer,'reader':reader,'values':values})
paths=[fixture,'scripts/core-ideals/key-avro-discovery-native.py']
proof={'scope':'Native schema acceptance, sequential encoding, object-container duplicate retention and reader-default counterexamples; no ideal Key binding acceptance','versions':{'apache':avro.__version__,'fastavro':fastavro.__version__},'references':['https://avro.apache.org/docs/1.12.0/specification/'],'cases':rows,'containers':containers,'resolution':resolution,'sha256':{p:hashlib.sha256(Path(p).read_bytes()).hexdigest() for p in paths}}
Path('fixtures/validation/key-avro-discovery-native.json').write_text(json.dumps(proof,indent=2,ensure_ascii=False)+'\n')
print(json.dumps({'cases':len(rows),'refusals':sum(not r['write']['ok'] for r in rows),'crossReads':sum(len(r.get('reads',{})) for r in rows),'containerReads':4,'resolutionReads':4}))
