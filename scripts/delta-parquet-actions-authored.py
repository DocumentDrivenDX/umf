"""Native Parquet fixtures for the bounded Delta JSON action projection."""
import json
from pathlib import Path
import pyarrow as pa
import pyarrow.parquet as pq
base=Path('fixtures/delta/parquet-actions/authored');base.mkdir(parents=True,exist_ok=True)
cases=[]
def emit(name,fields,arrays,status):
 p=base/(name+'.parquet');pq.write_table(pa.Table.from_arrays(arrays,schema=pa.schema(fields)),p,compression='snappy',version='2.6')
 cases.append(dict(id=name,path=str(p),status=status))
def action(name,typ,value,status='projected',action='commitInfo'):
 emit(name,[pa.field(action,typ)],[pa.array([value],type=typ)],status)
action('exact-and-unknown',pa.struct([('exact',pa.int64()),('__proto__',pa.string()),('missing',pa.string())]),{'exact':9223372036854775807,'__proto__':'preserved','missing':None})
action('null-pointer',pa.struct([('path',pa.string()),('sizeInBytes',pa.int64()),('modificationTime',pa.int64()),('tags',pa.map_(pa.string(),pa.string()))]),{'path':'x','sizeInBytes':1,'modificationTime':0,'tags':None},action='sidecar')
action('duplicate-map',pa.struct([('tags',pa.map_(pa.string(),pa.string()))]),{'tags':[('same','a'),('same','b')]},'blocked')
action('float-needs-policy',pa.struct([('number',pa.float64())]),{'number':1.5},'blocked')
action('required-null',pa.struct([('minReaderVersion',pa.int32()),('minWriterVersion',pa.int32())]),{'minReaderVersion':None,'minWriterVersion':2},'blocked',action='protocol')
emit('multiple-actions',[pa.field('commitInfo',pa.struct([('x',pa.bool_())])),pa.field('future',pa.string())],[pa.array([{'x':True}],type=pa.struct([('x',pa.bool_())])),pa.array(['future'])],'blocked')
action('unknown-action',pa.struct([('a/b~c',pa.string())]),{'a/b~c':None},action='future')
(base/'manifest.json').write_text(json.dumps({'cases':cases},indent=2)+'\n')
# Parsed statistics use native logical annotations, including negative subsecond epochs.
import datetime
from decimal import Decimal
stats=pa.struct([('date',pa.date32()),('utc',pa.timestamp('ns',tz='UTC')),('local',pa.timestamp('us')),('decimal',pa.decimal128(30,9)),('float',pa.float64())])
add=pa.struct([('path',pa.string()),('size',pa.int64()),('modificationTime',pa.int64()),('partitionValues',pa.map_(pa.string(),pa.string())),('dataChange',pa.bool_()),('stats_parsed',stats)])
action('typed-statistics',add,{'path':'data','size':1,'modificationTime':0,'partitionValues':[],'dataChange':False,'stats_parsed':{'date':datetime.date(1969,12,31),'utc':-1,'local':-1,'decimal':Decimal('123456789012345678901.123456789'),'float':-0.0}},action='add')
action('nonfinite-statistics',add,{'path':'data','size':1,'modificationTime':0,'partitionValues':[],'dataChange':False,'stats_parsed':{'float':float('inf')}},'blocked',action='add')
(base/'manifest.json').write_text(json.dumps({'cases':cases},indent=2)+'\n')
