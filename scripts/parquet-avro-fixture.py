import datetime,json
from decimal import Decimal
from pathlib import Path
import pyarrow as pa,pyarrow.parquet as pq
assert pa.__version__=='21.0.0'
schema=pa.schema([
 pa.field('id',pa.int64(),nullable=False),pa.field('unsigned',pa.uint64()),pa.field('amount',pa.decimal128(20,4)),
 pa.field('profile',pa.struct([pa.field('label',pa.string(),nullable=False),pa.field('score',pa.float32())])),
 pa.field('items',pa.list_(pa.field('element',pa.int32(),nullable=True))),
 pa.field('lookup',pa.map_(pa.int32(),pa.string())),pa.field('matrix',pa.list_(pa.list_(pa.int64()))),
 pa.field('stamp',pa.timestamp('ns',tz='UTC')),pa.field('local',pa.timestamp('us')),pa.field('day',pa.date32()),
 pa.field('clock',pa.time64('ns')),pa.field('bytes',pa.binary(3)),pa.field('small',pa.int8())])
rows=[{'id':9007199254740993,'unsigned':18446744073709551615,'amount':Decimal('1234567890123456.1234'),'profile':{'label':'Snow 雪','score':1.25},'items':[1,None,-2],'lookup':[(7,'first'),(7,'last'),(8,None)],'matrix':[[1,None],None,[]],'stamp':1234567890123456789,'local':datetime.datetime(1970,1,1),'day':datetime.date(2026,9,21),'clock':123456789,'bytes':b'\x00\xffA','small':127}, {'id':-1,'items':[],'lookup':[],'matrix':[]}, {'id':0}]
Path('fixtures/parquet/avro').mkdir(exist_ok=True)
path='fixtures/parquet/avro/nested.parquet';pq.write_table(pa.Table.from_pylist(rows,schema=schema),path,compression='NONE',version='2.6',store_schema=False)
read=pq.read_table(path);assert read.num_rows==3 and read.column('unsigned')[0].as_py()==18446744073709551615
assert read.column('lookup')[0].as_py()==[(7,'first'),(7,'last'),(8,None)]
assert read.column('stamp').cast(pa.int64())[0].as_py()==1234567890123456789
assert read.column('clock').cast(pa.int64())[0].as_py()==123456789
Path('fixtures/parquet/avro/source-oracle.json').write_text(json.dumps({'pyarrow':pa.__version__,'rows':3,'schema':str(read.schema),'uint64Exact':True,'duplicateEntriesRetained':True,'nanosecondsExact':True},indent=2)+'\n')
print({'rows':3,'fields':len(schema)})
