"""Pinned native facet discovery; no UMF facet classification or binding acceptance."""
import io, json, decimal, warnings, hashlib
from pathlib import Path
import avro, avro.io, avro.schema, fastavro, fastavro.validation

assert (avro.__version__, fastavro.__version__) == ('1.12.0', '1.12.2')
decimal.getcontext().prec = 28
decimal.getcontext().rounding = decimal.ROUND_HALF_EVEN
fixture = 'fixtures/avro/facet-discovery-cases.json'
def datum(value):
    kind=value['kind']
    if kind=='integer':return int(value['text'])
    if kind=='float':return float(value['text'])
    if kind=='decimal':return decimal.Decimal(value['text'])
    if kind=='bytes':return bytes.fromhex(value['hex'])
    if kind in ['string','boolean']:return value['value']
    raise AssertionError(kind)
cases=[(row['id'],row['schema'],datum(row['datum'])) for row in json.loads(Path(fixture).read_text())['cases']]

def parse(engine,schema):
    text=json.dumps(schema)
    return avro.schema.parse(text) if engine=='apache' else fastavro.parse_schema(json.loads(text))

def describe(value):
    return {'type':type(value).__name__,'repr':repr(value)}

def capture(action):
    with warnings.catch_warnings(record=True) as notices:
        warnings.simplefilter('always')
        try: result={'ok':True,'result':action()}
        except Exception as e: result={'ok':False,'error':type(e).__name__,'message':str(e)}
        result['warnings']=[str(w.message) for w in notices]
    return result

rows=[]
for name,schema,value in cases:
    for engine in ['apache','fastavro']:
        row={'id':name,'schema':schema,'input':describe(value),'writer':engine}
        parsed=capture(lambda:parse(engine,schema)); row['parse']={k:v for k,v in parsed.items() if k!='result'}
        if not parsed['ok']:
            rows.append(row);continue
        native=parsed['result']
        row['validate']=capture(lambda:avro.io.validate(native,value) if engine=='apache' else fastavro.validation.validate(value,native,raise_errors=False))
        def write():
            buffer=io.BytesIO()
            if engine=='apache':avro.io.DatumWriter(native).write(value,avro.io.BinaryEncoder(buffer))
            else:fastavro.schemaless_writer(buffer,native,value,strict=True)
            return buffer.getvalue().hex()
        row['write']=capture(write)
        if row['write']['ok']:
            row['reads']={}
            for reader in ['apache','fastavro']:
                def read():
                    source=io.BytesIO(bytes.fromhex(row['write']['result']))
                    rs=parse(reader,schema)
                    decoded=avro.io.DatumReader(rs).read(avro.io.BinaryDecoder(source)) if reader=='apache' else fastavro.schemaless_reader(source,rs)
                    return {**describe(decoded),'bytesConsumed':source.tell(),'exactTypedInput':type(decoded)==type(value) and decoded==value}
                row['reads'][reader]=capture(read)
        rows.append(row)

checks=[]
indexed={(r['id'],r['writer']):r for r in rows}
def expect(name,engine,path,value):
    actual=indexed[(name,engine)]
    for part in path.split('.'):actual=actual[part]
    assert actual==value,(name,engine,path,actual,value)
    checks.append({'id':name,'engine':engine,'path':path,'expected':value})
for engine in ['apache','fastavro']:
    expect('float-0',engine,'write.result','0000803f')
    for reader in ['apache','fastavro']:
        expect('float-0',engine,'reads.'+reader+'.result.repr','1.0')
        expect('int-4',engine,'reads.'+reader+'.result.repr','1')
        expect('fixed-0-0',engine,'reads.'+reader+'.result.repr',"b''")
        expect('int-custom-width-0',engine,'reads.'+reader+'.result.repr','-1')
        expect('int-custom-width-2',engine,'reads.'+reader+'.result.repr','256')
        expect('string-max-metadata-0',engine,'reads.'+reader+'.result.repr',"'ab'")
    for i in [1,2,3]:expect('fixed-0-'+str(i),engine,'write.ok',False)
    expect('string-4',engine,'write.ok',False)
    expect('decimal-bytes-9',engine,'write.ok',False)
    expect('decimal-bytes-10',engine,'write.ok',False)
expect('int-3','apache','validate.result',False)
expect('int-3','apache','write.ok',False)
expect('int-3','fastavro','write.ok',True)
expect('int-3','fastavro','reads.fastavro.result.repr','2147483648')
expect('decimal-bytes-2','apache','validate.result',True)
expect('decimal-bytes-2','apache','write.result','020c')
expect('decimal-bytes-2','apache','reads.apache.result.repr',"Decimal('0.12')")
expect('decimal-bytes-2','fastavro','write.result','0278')
expect('decimal-bytes-2','fastavro','reads.fastavro.result.repr',"Decimal('1.20')")
expect('decimal-bytes-7','apache','validate.result',True)
expect('decimal-bytes-7','apache','write.result','0404d2')
expect('decimal-bytes-7','apache','reads.apache.result.repr',"Decimal('12.3')")
expect('decimal-bytes-7','fastavro','write.ok',False)
expect('decimal-bytes-4','apache','write.ok',False)
expect('decimal-bytes-physical-input-1','apache','write.ok',False)
expect('decimal-bytes-physical-input-1','fastavro','write.ok',True)
assert len(cases)==84 and len(rows)==168
out={'scope':'Native API facet discovery, not UMF binding acceptance, core admission or native equivalence','versions':{'apache':avro.__version__,'fastavro':fastavro.__version__},'profiles':{'apache':'schema.parse, io.validate, DatumWriter.write, DatumReader.read','fastavro':'parse_schema, validation.validate(raise_errors=False), schemaless_writer(strict=True), schemaless_reader'},'decimalContext':str(decimal.getcontext()),'cases':rows,'assertions':checks,'limitations':['Selected host API profiles only; schema declaration does not certify enforcement or exact conversion.','No UMF classification, authored projection, native schema recovery or Chromium parity is claimed here.','Physical bytes with decimal annotations can bypass logical conversion; preserve this refinement.'],'sha256':{p:hashlib.sha256(Path(p).read_bytes()).hexdigest() for p in [fixture,__file__]}}
Path('fixtures/validation/facets-avro-discovery-native.json').write_text(json.dumps(out,indent=2,ensure_ascii=True)+'\n')
print(json.dumps({'inputs':len(cases),'writerCases':len(rows),'writes':sum(r.get('write',{}).get('ok',False) for r in rows),'crossReads':sum(len(r.get('reads',{})) for r in rows),'counterexampleAssertions':len(checks)}))
