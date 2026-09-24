"""Extract selected upstream schema constructors/literals without executing test modules."""
import ast,copy,hashlib,json,os,sys
from pathlib import Path
from pyspark.sql import types as t
from pyspark.java_gateway import launch_gateway
root=Path('native/spark/sources');manifest=json.loads((root/'manifest.json').read_text())
source=root/'test_types.py';sha=hashlib.sha256(source.read_bytes()).hexdigest()
entry=next((f for f in manifest['files'] if f['path']=='test_types.py'),None)
if entry is None:raise RuntimeError('Missing pinned source hash')
assert sha==entry['sha256']
functions={n.name:n for n in ast.walk(ast.parse(source.read_text())) if isinstance(n,ast.FunctionDef)}
allowed=['StringType','CharType','VarcharType','BinaryType','BooleanType','DecimalType','FloatType','DoubleType','ByteType','ShortType','IntegerType','LongType','DateType','TimestampType','TimestampNTZType','NullType','VariantType','YearMonthIntervalType','DayTimeIntervalType','CalendarIntervalType','ArrayType','MapType','StructType','StructField']
env={n:getattr(t,n) for n in allowed};env['_COLLATIONS_METADATA_KEY']='__COLLATIONS'
def value(n):
 if isinstance(n,ast.Constant):return n.value
 if isinstance(n,ast.Name):return env[n.id]
 if isinstance(n,ast.List):return [value(x) for x in n.elts]
 if isinstance(n,ast.Attribute) and n.attr in ['fields','YEAR','MONTH','DAY','HOUR','SECOND']:return getattr(value(n.value),n.attr)
 if isinstance(n,ast.BinOp) and isinstance(n.op,ast.Add):return value(n.left)+value(n.right)
 if isinstance(n,ast.Call) and isinstance(n.func,ast.Name) and n.func.id in allowed:return env[n.func.id](*[value(x) for x in n.args],**{k.arg:value(k.value) for k in n.keywords})
 if isinstance(n,ast.JoinedStr):return ''.join(str(value(x.value)) if isinstance(x,ast.FormattedValue) else x.value for x in n.values)
 raise ValueError(ast.dump(n))
cases=[]
def add(fn,node,label,obj):
 cases.append({'id':str(len(cases)).zfill(2)+'-'+label,'source':{'function':fn,'line':node.lineno,'sha256':sha},'input':obj.jsonValue() if isinstance(obj,t.DataType) else json.loads(obj)})
fn='test_schema_with_collations_json_ser_de'
for n in functions[fn].body:
 if isinstance(n,ast.Assign):
  result=value(n.value);env[n.targets[0].id]=result
  if isinstance(result,t.DataType):add(fn,n,n.targets[0].id,result)
fn='test_parse_datatype_json_string'
for n in functions[fn].body:
 if isinstance(n,ast.For):
  for i,x in enumerate(n.iter.elts):add(fn,x,'datatype-'+str(i),value(x))
for fn in ['test_schema_with_collations_on_non_string_types','test_schema_with_bad_collations_provider']:
 for n in functions[fn].body:
  if isinstance(n,ast.Assign):add(fn,n,n.targets[0].id,value(n.value))
assert len(cases)==42,len(cases)
base=Path('fixtures/spark');(base/'upstream-cases.json').write_text(json.dumps(cases,indent=2)+'\n')
if '--generate' in sys.argv:print({'extracted':len(cases),'commit':manifest['commit']});sys.exit()
os.environ.setdefault('SPARK_LOCAL_IP','127.0.0.1');gateway=launch_gateway();rows=[]
def parse(obj,runtime):
 try:
  parsed=t._parse_datatype_json_value(copy.deepcopy(obj)) if runtime=='python' else gateway.jvm.org.apache.spark.sql.types.DataType.fromJson(json.dumps(obj))
  return {'status':'accepted','output':json.loads(parsed.json())}
 except Exception as e:return {'status':'rejected','errorType':type(e).__name__}
try:
 for c in cases:
  exported=None if c['id']=='41-schema_json' else json.loads((base/'upstream'/ (c['id']+'.json')).read_text())
  if exported is not None:assert exported==c['input']
  row={'id':c['id']}
  for runtime in ['python','jvm']:
   before=parse(c['input'],runtime)
   if exported is not None:assert before==parse(exported,runtime),(c['id'],runtime)
   row[runtime]=before
  rows.append(row)
finally:
 gateway.shutdown()
 if gateway.proc:gateway.proc.terminate();gateway.proc.wait(timeout=10)
report={'commit':manifest['commit'],'sourceSha256':sha,'cases':len(cases),'roundTripped':41,'structureRejected':1,'nativeComparisons':82,'accepted':{r:sum(x[r]['status']=='accepted' for x in rows) for r in ['python','jvm']},'results':rows}
assert report['accepted']=={'python':37,'jvm':37},report['accepted']
assert all(row[r]['status']==('accepted' if i<37 else 'rejected') for i,row in enumerate(rows) for r in ['python','jvm'])
(base/'upstream-oracle-results.json').write_text(json.dumps(report,indent=2)+'\n');print({k:v for k,v in report.items() if k!='results'})
