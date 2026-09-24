"""Pin JVM metadata loss/rejection observations independently of UMF diagnostics."""
import json,os,sys
from pathlib import Path
from pyspark.java_gateway import launch_gateway
base=Path('fixtures/spark')
values=['{"x":9223372036854775807}','{"x":-9223372036854775808}','{"x":9223372036854775808}','{"x":-9223372036854775809}','{"x":9007199254740993.25}','{"x":1e400}','{"x":[1,2.5]}','{"x":[null]}','{"x":[[1]]}','{"x":[]}','{"x":null}']
cases=[{'id':str(i),'text':'{"type":"struct","fields":[{"name":"x","type":"string","nullable":true,"metadata":'+v+'}]}'} for i,v in enumerate(values)]
cases.append({'id':'11','text':'{"type":"struct","fields":[{"name":"x","type":"string","metadata":{}}]}'})
(base/'metadata-cases.json').write_text(json.dumps(cases,indent=2)+'\n')
if '--generate' in sys.argv:sys.exit()
os.environ.setdefault('SPARK_LOCAL_IP','127.0.0.1');g=launch_gateway();rows=[]
def parse(text):
 try:return {'status':'accepted','text':g.jvm.org.apache.spark.sql.types.DataType.fromJson(text).json()}
 except Exception as e:return {'status':'rejected','errorType':type(e).__name__}
try:
 for c in cases:
  output=(base/'metadata'/ (c['id']+'.json')).read_text();assert output==c['text']
  before=parse(c['text']);assert before==parse(output);rows.append({'id':c['id'],**before})
finally:
 g.shutdown()
 if g.proc:g.proc.terminate();g.proc.wait(timeout=10)
assert [r['id'] for r in rows if r['status']=='rejected']==['6','7','8','11']
def x(i):return json.loads(rows[i]['text'])['fields'][0]['metadata']['x']
assert x(0)==9223372036854775807 and x(1)==-9223372036854775808
assert x(2)==-9223372036854775808 and x(3)==9223372036854775807
assert x(4)==9007199254740994 and x(5)=='Infinity'
report={'version':'4.0.1','nativeComparisons':12,'accepted':8,'rejected':4,'results':rows}
(base/'metadata-oracle-results.json').write_text(json.dumps(report,indent=2)+'\n');print({k:v for k,v in report.items() if k!='results'})
