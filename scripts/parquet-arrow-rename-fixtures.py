from pathlib import Path
import pyarrow as pa,pyarrow.parquet as pq
assert pa.__version__=='21.0.0'
base=Path('fixtures/parquet/arrow-rename');base.mkdir(parents=True,exist_ok=True)
schema=pa.schema([pa.field('detail',pa.struct([pa.field('code',pa.string(),metadata={b'future.ref':b'detail.code'}),pa.field('qty',pa.int32())])),pa.field('events',pa.large_list(pa.int32())),pa.field('elapsed',pa.duration('us')),pa.field('created',pa.timestamp('us',tz='America/New_York'))],metadata={b'future.ref':b'detail.code'})
table=pa.Table.from_pylist([{'detail':{'code':'A','qty':1},'events':[1,2],'elapsed':1234,'created':0},{'detail':None,'events':None,'elapsed':None,'created':1234567},{'detail':{'code':'B','qty':None},'events':[],'elapsed':0,'created':None}],schema=schema)
for codec in ['NONE','SNAPPY','GZIP']:
 pq.write_table(table,base/(codec.lower()+'.parquet'),compression=codec,row_group_size=2,write_page_checksum=True,store_schema=True)
print({'files':3,'rowsEach':3,'rowGroupsEach':2})
