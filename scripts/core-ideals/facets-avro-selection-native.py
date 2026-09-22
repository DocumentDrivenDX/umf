"""Pinned parser and sample-codec evidence for facet type selection fixtures."""
import io,json,hashlib,decimal,warnings
from pathlib import Path
import avro,avro.schema,avro.io,fastavro
assert (avro.__version__,fastavro.__version__)==('1.12.0','1.12.2')
decimal.getcontext().prec=28
decimal.getcontext().rounding=decimal.ROUND_HALF_EVEN
fixture='fixtures/avro/facet-selection-cases.json'
rows=json.loads(Path(fixture).read_text())['cases']
def parse(engine,row):
    names=avro.schema.Names() if engine=='apache' else {}
    for text in [*[d['schema'] for d in row.get('dependencies',[])],row['schema']]:
        root=avro.schema.make_avsc_object(json.loads(text),names) if engine=='apache' else fastavro.parse_schema(json.loads(text),named_schemas=names)
    return root
def datum(value):
    kind=value['kind']
    if kind=='null':return None
    if kind=='integer':return int(value['text'])
    if kind=='decimal':return decimal.Decimal(value['text'])
    if kind=='bytes':return bytes.fromhex(value['hex'])
    if kind=='array':return [datum(x) for x in value['items']]
    if kind=='record':return {k:datum(v) for k,v in value['fields'].items()}
    raise AssertionError(kind)
parses=[];recoveries=[]
for row in rows:
    for writer in ['apache','fastavro']:
        with warnings.catch_warnings(record=True) as notices:
            warnings.simplefilter('always')
            try:schema=parse(writer,row);record={'id':row['id'],'engine':writer,'accepted':True}
            except Exception as e:record={'id':row['id'],'engine':writer,'accepted':False,'error':type(e).__name__,'message':str(e)}
            record['warnings']=[str(n.message) for n in notices]
        assert record['accepted']==row['nativeParses'][writer],record
        parses.append(record)
        if not row.get('selectionResolves'):continue
        value=datum(row['sample']);out=io.BytesIO()
        if writer=='apache':avro.io.DatumWriter(schema).write(value,avro.io.BinaryEncoder(out))
        else:fastavro.schemaless_writer(out,schema,value,strict=True)
        raw=out.getvalue()
        for reader in ['apache','fastavro']:
            source=io.BytesIO(raw);rs=parse(reader,row)
            decoded=avro.io.DatumReader(rs).read(avro.io.BinaryDecoder(source)) if reader=='apache' else fastavro.schemaless_reader(source,rs)
            assert decoded==value,(row['id'],writer,reader,value,decoded)
            assert source.tell()==len(raw),(row['id'],'trailing bytes')
            recoveries.append({'id':row['id'],'writer':writer,'reader':reader,'hex':raw.hex(),'value':repr(decoded),'bytesConsumed':source.tell()})
assert len(parses)==20 and len(recoveries)==32
result={'scope':'Native parser outcomes and sample datum recovery for selected structural fixtures; no core facet enforcement or arbitrary byte reconstruction','versions':{'apache':avro.__version__,'fastavro':fastavro.__version__},'parses':parses,'sampleRecoveries':recoveries,'limits':['Duplicate union branches are refused by Apache and UMF selection but accepted by fastavro; no universal parser agreement claimed.','Integer union branch choice may differ while decoded value agrees; original branch tags are native representation.','Declared defaults and unknown metadata are not executed or interpreted as constraints.'],'sha256':{p:hashlib.sha256(Path(p).read_bytes()).hexdigest() for p in [fixture,__file__]}}
Path('fixtures/validation/facets-avro-selection-native.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'parserCases':len(parses),'sampleRecoveries':len(recoveries),'parserRefusals':sum(not r['accepted'] for r in parses)}))
