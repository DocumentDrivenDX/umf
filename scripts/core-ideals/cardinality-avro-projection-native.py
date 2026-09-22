"""Cross-codec reads of generated projection candidates, including explicit binary/integer fixture tags."""
import io,json,hashlib
from pathlib import Path
import avro,avro.schema,avro.io,fastavro
assert avro.__version__=='1.12.0' and fastavro.__version__=='1.12.2'
fixture='fixtures/validation/cardinality-avro-projection-candidates.json'
rows=json.loads(Path(fixture).read_text())['rows']
def value(v):
 if isinstance(v,dict):
  if set(v)=={'$bytes'}:return bytes.fromhex(v['$bytes'])
  if set(v)=={'$integer'}:return int(v['$integer'])
  return {k:value(x) for k,x in v.items()}
 return [value(x) for x in v] if isinstance(v,list) else v
checks=[]
for row in rows:
 if row['status']=='blocked':continue
 bundle=row['bundle'];names=avro.schema.Names();fast_names={}
 for d in bundle['dependencies']:
  avro.schema.make_avsc_object(json.loads(d['schema']),names)
  fastavro.parse_schema(json.loads(d['schema']),fast_names)
 schemas={'apache':avro.schema.make_avsc_object(json.loads(bundle['schema']),names),'fastavro':fastavro.parse_schema(json.loads(bundle['schema']),fast_names)}
 for writer,ws in schemas.items():
  out=io.BytesIO();datum=value(row['sample']);expected=value(row['expectedValue'])
  if writer=='apache':avro.io.DatumWriter(ws).write(datum,avro.io.BinaryEncoder(out))
  else:fastavro.schemaless_writer(out,ws,datum,strict=True)
  raw=out.getvalue()
  for reader,rs in schemas.items():
   stream=io.BytesIO(raw)
   decoded=avro.io.DatumReader(rs).read(avro.io.BinaryDecoder(stream)) if reader=='apache' else fastavro.schemaless_reader(stream,rs)
   assert decoded==expected,(row['id'],writer,reader,decoded,expected)
   assert stream.tell()==len(raw)
   checks.append({'id':row['id'],'writer':writer,'reader':reader,'hex':raw.hex(),'exactInputRecovery':decoded==datum})
output={'versions':{'apache':avro.__version__,'fastavro':fastavro.__version__},'checks':checks,'floatNarrowings':sum(not c['exactInputRecovery'] for c in checks),'sha256':{p:hashlib.sha256(Path(p).read_bytes()).hexdigest() for p in [fixture,__file__]}}
Path('fixtures/validation/cardinality-avro-projection-native.json').write_text(json.dumps(output,indent=2)+'\n')
print(json.dumps({'nativeCrossCodecChecks':len(checks),'floatNarrowings':output['floatNarrowings']}))
