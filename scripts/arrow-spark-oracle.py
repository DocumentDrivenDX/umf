"""Independently parse every emitted Spark schema in Python and JVM."""
import json,copy,os
from pathlib import Path
from pyspark.sql import types as t
from pyspark.java_gateway import launch_gateway
base=Path('fixtures/projections/spark-arrow');report=json.loads((base/'native-results.json').read_text());os.environ.setdefault('SPARK_LOCAL_IP','127.0.0.1');g=launch_gateway();count=0
try:
 for row in report['results']:
  if row['status']!='converted':continue
  for recovery in row['recovery']:
   text=(base/(row['id']+'.reverse-'+str(int(recovery['prefer_timestamp_ntz']))+'.spark.json')).read_text();assert json.loads(text)==recovery['schema']
   for parsed in [t._parse_datatype_json_string(text),g.jvm.org.apache.spark.sql.types.DataType.fromJson(text)]:assert json.loads(parsed.json())==recovery['schema']
   count+=1
finally:
 g.shutdown()
 if g.proc:g.proc.terminate();g.proc.wait(timeout=10)
assert count==376
(base/'reverse-oracle-results.json').write_text(json.dumps({'schemas':count,'nativeComparisons':count*2,'spark':'4.0.1'},indent=2)+'\n');print({'schemas':count,'nativeComparisons':count*2})
