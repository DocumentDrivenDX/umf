"""Pinned Apache schema corpus: independent native parsing and binary probes."""
import json, io, hashlib, datetime, warnings
from pathlib import Path
from decimal import Decimal
import avro, avro.schema, avro.io, fastavro
assert avro.__version__=='1.12.0' and fastavro.__version__=='1.12.2'
root=Path('fixtures/avro/upstream')
manifest=json.loads((root/'manifest.json').read_text())
returned=json.loads(Path('fixtures/avro/corpus-results.json').read_text())
assert returned['commit']==manifest['commit']
assert [x['path'] for x in returned['files']]==[x['path'] for x in manifest['files']]

def datum(s,active=()):
    logical=getattr(s,'logical_type',None)
    if logical=='decimal': return Decimal(0)
    if logical=='date': return datetime.date(2026,1,1)
    if logical in ['time-millis','time-micros']: return datetime.time(1,2,3)
    if logical in ['timestamp-millis','timestamp-micros']: return datetime.datetime(2026,1,1,tzinfo=datetime.timezone.utc)
    if logical=='uuid': return '123e4567-e89b-12d3-a456-426614174000'
    t=s.type
    if t=='null': return None
    if t=='boolean': return True
    if t in ['int','long']: return 7
    if t in ['float','double']: return 1.25
    if t=='bytes': return b'\x00\xff'
    if t=='string': return 'snow-雪'
    if t=='enum': return s.symbols[-1]
    if t=='fixed': return bytes(s.size)
    if t=='array': return [] if id(s.items) in active else [datum(s.items,active+(id(s),))]
    if t=='map': return {} if id(s.values) in active else {'key':datum(s.values,active+(id(s),))}
    if t in ['union','error_union']:
        errors=[]
        for branch in s.schemas:
            try: return datum(branch,active)
            except ValueError as e: errors.append(str(e))
        raise ValueError('No finite union datum: '+str(errors))
    if t in ['record','error']:
        if id(s) in active: raise ValueError('No finite datum for required recursive record')
        return {f.name:datum(f.type,active+(id(s),)) for f in s.fields}
    raise ValueError('Unsupported datum generator type '+t)

def encode(s,value):
    buf=io.BytesIO();avro.io.DatumWriter(s).write(value,avro.io.BinaryEncoder(buf));return buf.getvalue()
def decode(s,binary): return avro.io.DatumReader(s).read(avro.io.BinaryDecoder(io.BytesIO(binary)))

rows=[]
for source,output in zip(manifest['files'],returned['files']):
    text=(root/source['path']).read_text();after=output['exported']
    assert hashlib.sha256(text.encode()).hexdigest()==source['sha256']==output['sha256']
    assert json.loads(text)==json.loads(after)
    row={'path':source['path'],'retained':True,'browserComplete':output['complete']}
    for name,parser in [('apache',avro.schema.parse),('fastavro',lambda text:fastavro.parse_schema(json.loads(text)))]:
        outcomes=[];parsed=[]
        for native in [text,after]:
            try:
                with warnings.catch_warnings(record=True) as caught:
                    warnings.simplefilter('always');parsed.append(parser(native))
                    outcomes.append({'accepted':True,'warnings':[str(w.message) for w in caught]})
            except Exception as e: parsed.append(None);outcomes.append({'accepted':False,'error':str(e)})
        assert outcomes[0]==outcomes[1], (source['path'],name,outcomes)
        row[name]=outcomes[0]
        if name=='apache' and parsed[0] is not None:
            try: sample=datum(parsed[0])
            except ValueError as e: row['binary']={'status':'unavailable','reason':str(e)};continue
            a=encode(parsed[0],sample);b=encode(parsed[1],sample)
            assert a==b
            assert decode(parsed[0],a)==decode(parsed[1],b)==sample
            row['binary']={'status':'passed','bytes':len(a),'sha256':hashlib.sha256(a).hexdigest()}
    rows.append(row)
report={'commit':manifest['commit'],'versions':{'avro':avro.__version__,'fastavro':fastavro.__version__},'files':len(rows),'metadataRetained':sum(r['retained'] for r in rows),'apacheAccepted':sum(r['apache']['accepted'] for r in rows),'fastavroAccepted':sum(r['fastavro']['accepted'] for r in rows),'binaryPassed':sum(r.get('binary',{}).get('status')=='passed' for r in rows),'results':rows,'limits':['One generated finite datum per independently parsed schema, not exhaustive instance conformance','Multi-file schema references have no external resolver in this profile','Parser rejections and logical-type warnings remain recorded']}
assert report['files']==report['metadataRetained']==20
assert report['apacheAccepted']==report['fastavroAccepted']==report['binaryPassed']==19
Path('fixtures/avro/corpus-oracle-results.json').write_text(json.dumps(report,indent=2)+'\n')
print({k:v for k,v in report.items() if k not in ['results','limits']})
