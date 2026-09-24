import json,decimal,datetime
from pathlib import Path
import pyarrow as pa
import pyarrow.parquet as pq
base=Path('fixtures/parquet/rename');base.mkdir(parents=True,exist_ok=True)
field=lambda name,t,id,nullable=True:pa.field(name,t,nullable=nullable,metadata={b'PARQUET:field_id':str(id).encode()})
schema=pa.schema([field('order',pa.int64(),1,False),field('detail',pa.struct([field('item.name',pa.string(),3),field('price',pa.decimal128(12,3),4)]),2),field('tags',pa.list_(pa.field('element',pa.string())),5),field('attributes',pa.map_(pa.string(),pa.int32()),6),field('events',pa.list_(pa.struct([field('at',pa.timestamp('us'),8),field('value',pa.int32(),9)])),7)])
rows=[{'order':i,'detail':None if i==1 else {'item.name':'注文 '+str(i),'price':decimal.Decimal('12.345')},'tags':None if i==2 else ([] if i==3 else ['a',None,'b']),'attributes':None if i==4 else ([] if i==5 else [('first',i),('second',None)]),'events':[] if i%2 else [{'at':datetime.datetime(2026,1,1,12,0,i),'value':i},None]} for i in range(8)]
table=pa.Table.from_pylist(rows,schema=schema);cases=[]
for codec in ['NONE','SNAPPY','GZIP']:
 path=base/(codec.lower()+'.parquet');pq.write_table(table,path,compression=codec,store_schema=False,row_group_size=3,write_page_index=True,write_page_checksum=True);cases.append({'id':codec.lower(),'path':str(path),'rows':8,'rowGroups':3})
path=base/'embedded-schema.parquet';pq.write_table(table,path,store_schema=True);cases.append({'id':'embedded-schema','path':str(path),'rows':8,'expected':'blocked'})
(base/'manifest.json').write_text(json.dumps({'runtime':'PyArrow '+pa.__version__,'cases':cases},indent=2)+'\n');print({'files':len(cases),'rows':len(rows)})
