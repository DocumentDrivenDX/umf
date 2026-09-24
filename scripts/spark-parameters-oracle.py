"""Python/JVM parameterized schema outcomes and explicit negative-scale configuration."""
import json,os,sys
from pathlib import Path
from pyspark.sql import types as t
from pyspark.java_gateway import launch_gateway
base=Path('fixtures/spark');types=['decimal(38,38)','decimal(39,0)','decimal(2,3)','decimal(10,-2)','decimal(0,0)','decimal(2147483648,0)','decimal(10,-2147483649)','decimal( 10 , 2 )','char(0)','char(2147483647)','char(2147483648)','varchar(2147483648)','interval year to month','interval month to year','interval day to second','interval second to day','interval day to day','interval month to day']
cases=[{'id':str(i),'input':value} for i,value in enumerate(types)];(base/'parameter-cases.json').write_text(json.dumps(cases,indent=2)+'\n')
if '--generate' in sys.argv:sys.exit()
os.environ.setdefault('SPARK_LOCAL_IP','127.0.0.1');g=launch_gateway();rows=[]
def parse(text,runtime):
 try:
  obj=t._parse_datatype_json_string(text) if runtime=='python' else g.jvm.org.apache.spark.sql.types.DataType.fromJson(text)
  return {'status':'accepted','output':json.loads(obj.json())}
 except Exception as e:return {'status':'rejected','errorType':type(e).__name__}
try:
 for c in cases:
  text=json.dumps(c['input']);output=(base/'parameters'/(c['id']+'.json')).read_text();assert json.loads(output)==c['input'];row={'id':c['id']}
  for runtime in ['python','jvm']:
   before=parse(text,runtime);assert before==parse(output,runtime);row[runtime]=before
  rows.append(row)
 conf=g.jvm.org.apache.spark.sql.internal.SQLConf.get();key='spark.sql.legacy.allowNegativeScaleOfDecimal';original=conf.getConfString(key)
 try:
  conf.setConfString(key,'true');enabled=parse(json.dumps('decimal(10,-2)'),'jvm');assert enabled=={'status':'accepted','output':'decimal(10,-2)'}
 finally:conf.setConfString(key,original)
finally:
 g.shutdown()
 if g.proc:g.proc.terminate();g.proc.wait(timeout=10)
assert all(r['python']['status']=='accepted' for r in rows)
assert [i for i,r in enumerate(rows) if r['jvm']['status']=='accepted']==[0,4,7,8,9,12,14]
report={'version':'4.0.1','nativeComparisons':36,'negativeScaleEnabled':enabled,'results':rows};(base/'parameter-oracle-results.json').write_text(json.dumps(report,indent=2)+'\n');print([(types[i],r['python']['status'],r['jvm']['status']) for i,r in enumerate(rows)])
