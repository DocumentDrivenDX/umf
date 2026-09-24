from pathlib import Path
import pyarrow as pa,pyarrow.parquet as pq
assert pa.__version__=='21.0.0'
base=Path('fixtures/parquet/arrow-nested');base.mkdir(parents=True,exist_ok=True)
record=pa.struct([pa.field('code',pa.string()),pa.field('qty',pa.int32())])
schema=pa.schema([pa.field('items',pa.large_list(pa.field('item',record))),pa.field('lookup',pa.map_(pa.string(),record))],metadata={b'future.ref':b'items.item.code'})
rows=[{'items':[{'code':'A','qty':1},None],'lookup':[('x',{'code':'X','qty':2}),('x',{'code':'Y','qty':3})]},{'items':[],'lookup':[]},{'items':None,'lookup':None},{'items':[{'code':None,'qty':None}],'lookup':[('z',None)]}]
pq.write_table(pa.Table.from_pylist(rows,schema),base/'nested.parquet',compression='SNAPPY',row_group_size=2,store_schema=True,write_page_checksum=True)
print({'rows':4,'rowGroups':2})
