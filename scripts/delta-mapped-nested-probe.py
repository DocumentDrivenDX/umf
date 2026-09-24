"""Mapped array/map field renames verified with physical Parquet and DataFusion reads."""
import json,tempfile,hashlib
from pathlib import Path
import pyarrow as pa
import pyarrow.parquet as pq
from deltalake import DeltaTable
base=Path('fixtures/delta/mapped-nested');base.mkdir(exist_ok=True)
def logical(name,kind,id,physical):return {'name':name,'type':kind,'nullable':True,'metadata':{'delta.columnMapping.id':id,'delta.columnMapping.physicalName':physical}}
def physical(name,kind,id):return pa.field(name,kind,metadata={b'PARQUET:field_id':str(id).encode()})
fields=[logical('id','long',1,'col-id'),logical('items',{'type':'array','elementType':{'type':'struct','fields':[logical('count','long',3,'col-count')]},'containsNull':True},2,'col-items'),logical('attributes',{'type':'map','keyType':'string','valueType':{'type':'struct','fields':[logical('qty','long',5,'col-qty')]},'valueContainsNull':True},4,'col-attrs')]
arrow=pa.schema([physical('col-id',pa.int64(),1),physical('col-items',pa.list_(pa.struct([physical('col-count',pa.int64(),3)])),2),physical('col-attrs',pa.map_(pa.string(),pa.struct([physical('col-qty',pa.int64(),5)])),4)])
data=[{'col-id':1,'col-items':[{'col-count':9223372036854775807},None,{'col-count':None}],'col-attrs':[('a',{'col-qty':10}),('b',None)]},{'col-id':2,'col-items':[],'col-attrs':[]},{'col-id':3,'col-items':None,'col-attrs':None},{'col-id':4,'col-items':[{'col-count':-9223372036854775808}],'col-attrs':[('empty',{'col-qty':None})]}]
expected=[{'id':1,'items':[{'count':9223372036854775807},None,{'count':None}],'attributes':[('a',{'qty':10}),('b',None)]},{'id':2,'items':[],'attributes':[]},{'id':3,'items':None,'attributes':None},{'id':4,'items':[{'count':-9223372036854775808}],'attributes':[('empty',{'qty':None})]}]
results=[]
with tempfile.TemporaryDirectory(prefix='umf-mapped-nested-') as work:
 for mode in ['name','id']:
  for feature in [False,True]:
   id=mode+('-features' if feature else '-legacy');target=base/id;target.mkdir(exist_ok=True);path=Path(work)/id;log=path/'_delta_log';log.mkdir(parents=True)
   pq.write_table(pa.Table.from_pylist(data,schema=arrow),target/'part.parquet');raw=(target/'part.parquet').read_bytes();(path/'part.parquet').write_bytes(raw)
   protocol={'minReaderVersion':3,'minWriterVersion':7,'readerFeatures':['columnMapping'],'writerFeatures':['columnMapping']} if feature else {'minReaderVersion':2,'minWriterVersion':5}
   meta={'id':'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee','format':{'provider':'parquet','options':{}},'schemaString':json.dumps({'type':'struct','fields':fields}),'partitionColumns':[],'configuration':{'delta.columnMapping.mode':mode,'delta.columnMapping.maxColumnId':'5'}};context={'protocol':protocol,'metaData':meta}
   add={'path':'part.parquet','partitionValues':{},'size':len(raw),'modificationTime':0,'dataChange':True};(log/'00000000000000000000.json').write_text('\n'.join(json.dumps(a) for a in [{'protocol':protocol},{'metaData':meta},{'add':add}])+'\n')
   read=lambda:sorted(pa.RecordBatchReader.from_stream(DeltaTable(path).scan()).read_all().to_pylist(),key=lambda r:r['id'])
   before=read();assert before==expected,(id,before)
   schema=json.loads(meta['schemaString']);schema['fields'][1]['name']='lines';schema['fields'][1]['type']['elementType']['fields'][0]['name']='quantity';schema['fields'][2]['type']['valueType']['fields'][0]['name']='amount';changed={**meta,'schemaString':json.dumps(schema)}
   after_expected=[{'id':r['id'],'lines':None if r['items'] is None else [None if item is None else {'quantity':item['count']} for item in r['items']],'attributes':None if r['attributes'] is None else [(k,None if v is None else {'amount':v['qty']}) for k,v in r['attributes']]} for r in expected]
   (log/'00000000000000000001.json').write_text(json.dumps({'metaData':changed})+'\n');after=read();assert after==after_expected,(id,after)
   (target/'context.json').write_text(json.dumps(context,separators=(',',':')));(target/'add.json').write_text(json.dumps(add));results.append({'id':id,'before':before,'after':after,'parquetSha256':hashlib.sha256(raw).hexdigest()})
(base/'native-results.json').write_text(json.dumps({'runtime':'deltalake 1.6.4 DataFusion scan','cases':len(results),'results':results},indent=2)+'\n');print({'cases':len(results),'rowsPerCase':4,'renamesPerCase':3})
