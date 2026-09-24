"""Reparse UMF exports with both pinned runtimes; compare baseline outputs/outcomes."""
import json,copy,os
from pathlib import Path
from pyspark.sql import types as t
from pyspark.java_gateway import launch_gateway
os.environ.setdefault('SPARK_LOCAL_IP','127.0.0.1');base=Path('fixtures/spark')
cases=json.loads((base/'schema-cases.json').read_text());baseline={r['id']:r for r in json.loads((base/'capability-results.json').read_text())['results']}
gateway=launch_gateway();results=[]
try:
 for case in cases:
  if case['id'] in ['array-default','map-default']:continue
  exported=json.loads((base/'umf'/(case['id']+'.json')).read_text());assert exported==case['input'],case['id']
  row={'id':case['id']}
  for runtime in ['python','jvm']:
   try:
    parsed=t._parse_datatype_json_value(copy.deepcopy(exported)) if runtime=='python' else gateway.jvm.org.apache.spark.sql.types.DataType.fromJson(json.dumps(exported))
    output=json.loads(parsed.json());status='accepted'
   except Exception:status='rejected';output=None
   expected=baseline[case['id']][runtime];assert status==expected['status'],(case['id'],runtime)
   if status=='accepted':assert output==expected['output'],(case['id'],runtime)
   row[runtime]=status
  results.append(row)
 edited=json.loads((base/'umf/edited.json').read_text());expected=copy.deepcopy(next(c['input'] for c in cases if c['id']=='nested'));expected['fields'][0]['type']['elementType']['fields'][0]['type']='decimal(20,6)';assert edited==expected
 for parsed in [t._parse_datatype_json_value(copy.deepcopy(edited)),gateway.jvm.org.apache.spark.sql.types.DataType.fromJson(json.dumps(edited))]:assert json.loads(parsed.json())==expected
finally:
 gateway.shutdown()
 if gateway.proc:gateway.proc.terminate();gateway.proc.wait(timeout=10)
assert len(results)==47
(base/'umf-oracle-results.json').write_text(json.dumps({'version':'4.0.1','cases':47,'runtimeComparisons':94,'editedNativeComparisons':2,'results':results},indent=2)+'\n');print({'runtimeComparisons':94,'editedNativeComparisons':2})
