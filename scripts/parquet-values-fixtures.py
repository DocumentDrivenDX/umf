import json,decimal,datetime
from pathlib import Path
import pyarrow as pa
import pyarrow.parquet as pq
base=Path('fixtures/parquet/values-trial');base.mkdir(parents=True,exist_ok=True)
D=decimal.Decimal
schema=pa.schema([pa.field('__proto__',pa.string()),pa.field('nested.decimals',pa.list_(pa.decimal128(20,4))),pa.field('ordered',pa.map_(pa.string(),pa.decimal128(20,4))),pa.field('integer.keys',pa.map_(pa.int32(),pa.list_(pa.decimal128(20,4)))),pa.field('clock',pa.struct([pa.field('local',pa.timestamp('us')),pa.field('utc',pa.timestamp('us','UTC')),pa.field('time',pa.time64('us'))])),pa.field('large',pa.uint64())])
rows=[{'__proto__':'own property','nested.decimals':[D('-9999999999999999.1234'),None,D('0.0001')],'ordered':[('same',D('1.0000')),('same',D('2.0000')),('__proto__',None),('constructor',D('-0.0001'))],'integer.keys':[(7,[D('1.0001'),None]),(7,[]),(-1,None)],'clock':{'local':datetime.datetime(2026,1,1,1,2,3,456789),'utc':datetime.datetime(2026,1,1,1,2,3,456789,tzinfo=datetime.timezone.utc),'time':datetime.time(1,2,3,456789)},'large':2**64-1},{'__proto__':'constructor','nested.decimals':[],'ordered':[],'integer.keys':[],'clock':None,'large':2**63},{'__proto__':None,'nested.decimals':None,'ordered':None,'integer.keys':None,'clock':{'local':None,'utc':None,'time':None},'large':0}]
def value(s):
 if not s.is_valid:return None
 t=s.type;v=s.as_py()
 if pa.types.is_struct(t):return {'kind':'struct','fields':[{'name':f.name,'value':value(s[i])} for i,f in enumerate(t)]}
 if pa.types.is_list(t):return {'kind':'list','items':[value(x) for x in s.values]}
 if pa.types.is_map(t):return {'kind':'map','entries':[{'key':value(s.values.field(0)[i]),'value':value(s.values.field(1)[i])} for i in range(len(s.values))]}
 if pa.types.is_decimal(t):return {'kind':'decimal','value':format(v,'f')}
 if pa.types.is_string(t):return {'kind':'string','value':v}
 if pa.types.is_timestamp(t):return {'kind':'timestamp','unit':{'ms':'MILLIS','us':'MICROS','ns':'NANOS'}[t.unit],'isAdjustedToUTC':t.tz is not None,'value':str(s.cast(pa.int64()).as_py())}
 if pa.types.is_time(t):return {'kind':'time','unit':{'ms':'MILLIS','us':'MICROS','ns':'NANOS'}[t.unit],'isAdjustedToUTC':True,'value':str(s.cast(pa.int64()).as_py())}
 if pa.types.is_integer(t):return {'kind':'uint' if pa.types.is_unsigned_integer(t) else 'int','bits':t.bit_width,'value':str(v)}
 raise ValueError(str(t))
table=pa.Table.from_pylist(rows,schema=schema);cases=[]
for page in ['1.0','2.0']:
 for dictionary in [True,False]:
  id='page-'+page+'-dict-'+str(dictionary).lower();path=base/(id+'.parquet');pq.write_table(table,path,compression='snappy',data_page_version=page,use_dictionary=dictionary,row_group_size=2,store_schema=False);native=pq.read_table(path);expected=[{'kind':'struct','fields':[{'name':f.name,'value':value(native.column(i)[j])} for i,f in enumerate(native.schema)]} for j in range(native.num_rows)];(base/(id+'.expected.json')).write_text(json.dumps(expected,indent=2)+'\n');cases.append({'id':id,'path':str(path),'rows':native.num_rows})
(base/'manifest.json').write_text(json.dumps({'runtime':'PyArrow '+pa.__version__,'cases':cases},indent=2)+'\n');print({'files':len(cases)})
