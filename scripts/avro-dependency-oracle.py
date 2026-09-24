"""Explicit shared-name environments, with native behavior after dependency edits."""
import io,json
from pathlib import Path
import avro.schema,avro.io,avro,fastavro
assert avro.__version__=='1.12.0' and fastavro.__version__=='1.12.2'
bundles=json.loads(Path('fixtures/avro/dependency-bundle.json').read_text())
base=Path('fixtures/avro/upstream/lang/java/avro/src/test/resources/multipleFile')
native={'schema':(base/'ApplicationEvent.avsc').read_text(),'dependencies':[{'id':'DocumentInfo.avsc','schema':(base/'DocumentInfo.avsc').read_text()}]}
def apache(bundle):
 names=avro.schema.Names()
 for dep in bundle['dependencies']:avro.schema.make_avsc_object(json.loads(dep['schema']),names)
 return avro.schema.make_avsc_object(json.loads(bundle['schema']),names)
def fast(bundle):
 names={}
 for dep in bundle['dependencies']:fastavro.parse_schema(json.loads(dep['schema']),names)
 return fastavro.parse_schema(json.loads(bundle['schema']),names)
def encode(schema,data,tool):
 out=io.BytesIO()
 if tool=='apache':avro.io.DatumWriter(schema).write(data,avro.io.BinaryEncoder(out))
 else:fastavro.schemaless_writer(out,schema,data,strict=True)
 return out.getvalue()
def decode(schema,binary,tool):
 return avro.io.DatumReader(schema).read(avro.io.BinaryDecoder(io.BytesIO(binary))) if tool=='apache' else fastavro.schemaless_reader(io.BytesIO(binary),schema)
rows=[]
for tool,parser in [('apache',apache),('fastavro',fast)]:
 original,returned,edited=[parser(b) for b in [native,bundles['original'],bundles['edited']]]
 data={'applicationId':'a','status':'READY','documents':[{'documentId':'d','filePath':'snow-雪'}]}
 before=encode(original,data,tool);after=encode(returned,data,tool)
 assert before==after and decode(returned,after,tool)==data
 newdata={'applicationId':'a','status':'READY','documents':[{'documentId':'d','filePath':b'\x00\xff'}]}
 changed=encode(edited,newdata,tool);assert decode(edited,changed,tool)==newdata
 try:encode(edited,data,tool)
 except Exception: pass
 else:raise AssertionError('Edited bytes dependency accepted stale string value')
 rows.append({'tool':tool,'roundTrip':True,'dependencyEdit':True,'staleValueRejected':True})
Path('fixtures/avro/dependency-oracle-results.json').write_text(json.dumps({'versions':{'avro':avro.__version__,'fastavro':fastavro.__version__},'results':rows},indent=2)+'\n')
print('Avro dependency oracle: both native runtimes preserve original and enforce edited type')
