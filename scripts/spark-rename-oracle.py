"""Independent native construction and dual-runtime verification of field renames."""
import copy,json,os,sys
from pathlib import Path
from pyspark.sql import types as t
from pyspark.java_gateway import launch_gateway
base=Path('fixtures/spark'); cases=[]
string=t.StringType('UTF8_LCASE')
metadata={'exact':9223372036854775807,'reference':'old.name'}
def field(name,kind):return t.StructField(name,kind,True,copy.deepcopy(metadata))
for label,kind in [('string',string),('array',t.ArrayType(string)),('map',t.MapType(string,t.ArrayType(string))),('struct',t.StructType([field('child',string)]))]:
 for name in ['new.name','','顧客','__proto__']:
  cases.append({'id':label+'-'+str(len(cases)),'input':t.StructType([field('old.name',kind)]).jsonValue(),'expected':t.StructType([field(name,kind)]).jsonValue(),'fieldPointer':'/fields/0','name':name})
for container in ['struct','array','map']:
 def wrap(name):
  inner=t.StructType([field(name,string)])
  return t.StructType([field('parent',inner if container=='struct' else t.ArrayType(inner) if container=='array' else t.MapType(t.StringType(),inner))])
 suffix='' if container=='struct' else '/elementType' if container=='array' else '/valueType'
 cases.append({'id':'nested-'+container,'input':wrap('old.name').jsonValue(),'expected':wrap('new.name').jsonValue(),'fieldPointer':'/fields/0/type'+suffix+'/fields/0','name':'new.name'})
cases.append({'id':'duplicate','input':t.StructType([field('same',string),field('same',string)]).jsonValue(),'expected':t.StructType([field('same',string),field('renamed',string)]).jsonValue(),'fieldPointer':'/fields/1','name':'renamed'})
if '--generate' in sys.argv:
 (base/'rename-cases.json').write_text(json.dumps(cases,ensure_ascii=False,indent=2)+'\n');print({'generated':len(cases)});sys.exit()
os.environ.setdefault('SPARK_LOCAL_IP','127.0.0.1');gateway=launch_gateway();results=[]
try:
 for case in cases:
  if case['id'] in ['string-1','array-5','map-9']:continue
  output=json.loads((base/'renamed'/(case['id']+'.json')).read_text());assert output==case['expected'],case['id']
  for runtime in ['python','jvm']:
   parsed=t._parse_datatype_json_value(copy.deepcopy(output)) if runtime=='python' else gateway.jvm.org.apache.spark.sql.types.DataType.fromJson(json.dumps(output))
   assert json.loads(parsed.json())==case['expected'],(case['id'],runtime)
  results.append(case['id'])
 empty=cases[5]['expected'];assert t._parse_datatype_json_value(copy.deepcopy(empty)).jsonValue()!=empty
 # Demonstrate why changing the name alone is insufficient: native parsing drops the stale collation.
 stale=copy.deepcopy(cases[0]['input']);stale['fields'][0]['name']=cases[0]['name']
 assert json.loads(t._parse_datatype_json_value(copy.deepcopy(stale)).json())!=cases[0]['expected']
finally:
 gateway.shutdown()
 if gateway.proc:gateway.proc.terminate();gateway.proc.wait(timeout=10)
report={'version':'4.0.1','cases':len(results),'blockedEmptyCollatedNames':3,'nativeComparisons':len(results)*2,'staleRenameRegression':True,'results':results}
(base/'rename-oracle-results.json').write_text(json.dumps(report,indent=2)+'\n');print(report)
