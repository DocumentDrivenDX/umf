"""Pinned native schema-only probe. No user UDT code or serializedClass is executed."""
import copy,json,os,hashlib,inspect
from pathlib import Path
import pyspark
from pyspark.sql import types as t
from pyspark.java_gateway import launch_gateway
assert pyspark.__version__=='4.0.1'
os.environ.setdefault('SPARK_LOCAL_IP','127.0.0.1')
base=Path('fixtures/spark');base.mkdir(exist_ok=True)
cases=[{'id':'atomic-'+name,'input':name} for name in t._all_mappable_types]
for value in ['decimal(10,2)','decimal(38,18)','decimal(10,-2)','decimal(39,0)','decimal(2,3)','char(5)','varchar(20)','char(0)','string collate UTF8_LCASE','string collate UNKNOWN_COLLATION','interval year','interval year to month','interval month','interval day','interval day to second','interval hour to minute','interval second','interval month to year','future_type']:
 cases.append({'id':'spelling-'+str(len(cases)),'input':value})
for name,value in {
 'array':{'type':'array','elementType':'long','containsNull':False},
 'array-default':{'type':'array','elementType':'string'},
 'map':{'type':'map','keyType':'string','valueType':'integer','valueContainsNull':False},
 'map-default':{'type':'map','keyType':'string','valueType':'integer'},
 'atomic-object':{'type':'integer'},
 'unknown-property':{'type':'struct','fields':[],'future':{'keep':True}},
 'field-defaults':{'type':'struct','fields':[{'name':'x','type':'string'}]},
 'field-unknown':{'type':'struct','fields':[{'name':'x','type':'integer','nullable':True,'metadata':{},'future':True}]},
 'duplicate-names':{'type':'struct','fields':[{'name':'same','type':'integer','nullable':False,'metadata':{}},{'name':'same','type':'string','nullable':True,'metadata':{}}]},
 'exact-metadata':{'type':'struct','fields':[{'name':'x','type':'long','nullable':True,'metadata':{'large':9223372036854775807,'nested':{'note':'café'},'array':[1,2]}}]},
 'mixed-metadata':{'type':'struct','fields':[{'name':'x','type':'long','nullable':True,'metadata':{'mixed':[1,'a']}}]},
 'collated-field':json.loads(t.StructType([t.StructField('name',t.StringType('UTF8_LCASE'))]).json()),
 'collated-array':json.loads(t.StructType([t.StructField('values',t.ArrayType(t.StringType('UTF8_LCASE')))]).json()),
 'nested':json.loads(t.StructType([t.StructField('items',t.ArrayType(t.StructType([t.StructField('cost',t.DecimalType(18,4),False)])),False)]).json()),
}.items():cases.append({'id':name,'input':value})
(base/'schema-cases.json').write_text(json.dumps(cases,indent=2,ensure_ascii=False)+'\n')
gateway=launch_gateway();results=[]
try:
 for c in cases:
  row={'id':c['id']};source=copy.deepcopy(c['input']);argument=copy.deepcopy(source)
  try:
   parsed=t._parse_datatype_json_value(argument);output=json.loads(parsed.json());row['python']={'status':'accepted','output':output,'sourceEqual':source==output,'inputMutated':argument!=source}
  except Exception as e:row['python']={'status':'rejected','message':str(e)}
  try:
   parsed=gateway.jvm.org.apache.spark.sql.types.DataType.fromJson(json.dumps(source));output=json.loads(parsed.json());row['jvm']={'status':'accepted','output':output,'sourceEqual':source==output}
  except Exception as e:row['jvm']={'status':'rejected','message':str(e.java_exception.getMessage()) if hasattr(e,'java_exception') else str(e)}
  if row['python'].get('inputMutated'):
   try:t._parse_datatype_json_value(argument);row['python']['repeatStatus']='accepted'
   except Exception as e:row['python']['repeatStatus']='rejected';row['python']['repeatMessage']=str(e) or type(e).__name__
  results.append(row)
finally:
 gateway.shutdown()
 if gateway.proc:gateway.proc.terminate();gateway.proc.wait(timeout=10)
assert len(results)==49
assert sum(r['python']['status']=='accepted' for r in results)==45
assert sum(r['jvm']['status']=='accepted' for r in results)==37
assert [r['id'] for r in results if r['python'].get('inputMutated')]==['collated-field','collated-array']
assert all(r['python']['repeatStatus']=='rejected' for r in results if r['python'].get('inputMutated'))
(base/'capability-results.json').write_text(json.dumps({'version':pyspark.__version__,'pythonTypesSha256':hashlib.sha256(Path(inspect.getfile(t)).read_bytes()).hexdigest(),'cases':len(results),'results':results},indent=2,ensure_ascii=False)+'\n')
print({'cases':len(results),'pythonAccepted':sum(r['python']['status']=='accepted' for r in results),'jvmAccepted':sum(r['jvm']['status']=='accepted' for r in results)})
print([{'id':r['id'],'python':r['python'],'jvm':r['jvm']} for r in results if r['python']['status']!=r['jvm']['status'] or r['python'].get('inputMutated')])
