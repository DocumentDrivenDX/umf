"""Native evidence for field-local annotation loss and rejection; no UDT evaluation."""
import copy,json,os,sys
from pathlib import Path
from pyspark.sql import types as t
from pyspark.java_gateway import launch_gateway
base=Path('fixtures/spark');cases=[]
def add(id,name,kind,annotations):
 cases.append({'id':id,'input':{'type':'struct','fields':[{'name':name,'type':kind,'nullable':True,'metadata':{'__COLLATIONS':annotations}}]}})
add('valid','x','string',{'x':'spark.UTF8_LCASE'})
add('stale','x','string',{'old':'spark.UTF8_LCASE'})
add('non-string','x','integer',{'x':'spark.UTF8_LCASE'})
add('value-number','x','string',{'x':1})
add('map-null','x','string',None)
add('map-array','x','string',[])
add('bad-provider','x','string',{'x':'vendor.UTF8_LCASE'})
add('missing-provider','x','string',{'x':'UTF8_LCASE'})
add('unknown-name','x','string',{'x':'spark.NOT_A_COLLATION'})
array={'type':'array','elementType':'string','containsNull':True}
add('empty-generated','',array,{'.element':'spark.UTF8_LCASE'})
add('empty-parser','',array,{'element':'spark.UTF8_LCASE'})
add('dotted','a.b',array,{'a.b.element':'spark.UTF8_LCASE'})
add('array-target','x',array,{'x':'spark.UTF8_LCASE'})
add('child-owned','parent',{'type':'struct','fields':[{'name':'child','type':'string','nullable':True,'metadata':{}}]},{'parent.child':'spark.UTF8_LCASE'})
(base/'collation-cases.json').write_text(json.dumps(cases,indent=2)+'\n')
if '--generate' in sys.argv:sys.exit()
os.environ.setdefault('SPARK_LOCAL_IP','127.0.0.1');g=launch_gateway();rows=[]
def parse(obj,runtime):
 try:
  parsed=t._parse_datatype_json_value(copy.deepcopy(obj)) if runtime=='python' else g.jvm.org.apache.spark.sql.types.DataType.fromJson(json.dumps(obj))
  return {'status':'accepted','output':json.loads(parsed.json())}
 except Exception as e:return {'status':'rejected','errorType':type(e).__name__}
try:
 for c in cases:
  exported=json.loads((base/'collations'/(c['id']+'.json')).read_text());assert exported==c['input'];row={'id':c['id']}
  for runtime in ['python','jvm']:
   before=parse(c['input'],runtime);assert before==parse(exported,runtime);row[runtime]=before
  rows.append(row)
finally:
 g.shutdown()
 if g.proc:g.proc.terminate();g.proc.wait(timeout=10)
expected=[('accepted','accepted'),('accepted','accepted'),('rejected','rejected'),('rejected','accepted'),('rejected','accepted'),('rejected','accepted'),('rejected','rejected'),('rejected','rejected'),('accepted','rejected'),('accepted','accepted'),('accepted','accepted'),('accepted','accepted'),('rejected','rejected'),('accepted','accepted')]
assert [(r['python']['status'],r['jvm']['status']) for r in rows]==expected
for i in [1,9,13]:
 for runtime in ['python','jvm']:assert '__COLLATIONS' not in rows[i][runtime]['output']['fields'][0]['metadata']
for i in [3,4,5]:assert '__COLLATIONS' not in rows[i]['jvm']['output']['fields'][0]['metadata']
report={'version':'4.0.1','cases':len(cases),'nativeComparisons':2*len(cases),'results':rows}
(base/'collation-oracle-results.json').write_text(json.dumps(report,indent=2)+'\n');print([(r['id'],r['python']['status'],r['jvm']['status']) for r in rows])
