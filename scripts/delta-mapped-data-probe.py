"""Construct local mapped data fixtures and test native logical renames without data rewrites."""
import json,tempfile,shutil
from pathlib import Path
import pyarrow as pa
import pyarrow.parquet as pq
from deltalake import DeltaTable
base=Path('fixtures/delta/mapped-data');base.mkdir(exist_ok=True)
def logical(name,kind,id,physical):return {'name':name,'type':kind,'nullable':True,'metadata':{'delta.columnMapping.id':id,'delta.columnMapping.physicalName':physical}}
fields=[logical('id','long',1,'col-id'),logical('region','string',2,'col-region'),logical('details',{'type':'struct','fields':[logical('amount','long',4,'col-amount')]},3,'col-details')]
def physical(name,kind,id):return pa.field(name,kind,metadata={b'PARQUET:field_id':str(id).encode()})
arrow=pa.schema([physical('col-id',pa.int64(),1),physical('col-details',pa.struct([physical('col-amount',pa.int64(),4)]),3)])
table=pa.Table.from_pylist([{'col-id':1,'col-details':{'col-amount':10}},{'col-id':2,'col-details':{'col-amount':20}}],schema=arrow)
results=[]
with tempfile.TemporaryDirectory(prefix='umf-mapped-data-') as work:
 for mode in ['name','id']:
  path=Path(work)/mode;log=path/'_delta_log';log.mkdir(parents=True);file=path/'part.parquet';pq.write_table(table,file)
  meta={'id':'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee','format':{'provider':'parquet','options':{}},'schemaString':json.dumps({'type':'struct','fields':fields}), 'partitionColumns':['region'],'configuration':{'delta.columnMapping.mode':mode,'delta.columnMapping.maxColumnId':'4'}}
  protocol={'minReaderVersion':2,'minWriterVersion':5};add={'path':'part.parquet','partitionValues':{'col-region':'east'},'size':file.stat().st_size,'modificationTime':0,'dataChange':True}
  (log/'00000000000000000000.json').write_text('\n'.join(json.dumps(a) for a in [{'protocol':protocol},{'metaData':meta},{'add':add}])+'\n')
  row={'mode':mode};target=base/mode;target.mkdir(exist_ok=True);shutil.copyfile(file,target/'part.parquet');(target/'context.json').write_text(json.dumps({'protocol':protocol,'metaData':meta},separators=(',',':')));(target/'add.json').write_text(json.dumps(add))
  try:
   row['pyarrowDatasetRows']=DeltaTable(path).to_pyarrow_table().to_pylist();before=sorted(pa.RecordBatchReader.from_stream(DeltaTable(path).scan()).read_all().to_pylist(),key=lambda r:r['id']);expected=[{'id':1,'region':'east','details':{'amount':10}},{'id':2,'region':'east','details':{'amount':20}}];assert before==expected,before
   schema=json.loads(meta['schemaString']);schema['fields'][0]['name']='order_id';schema['fields'][1]['name']='area';schema['fields'][2]['type']['fields'][0]['name']='total';changed={**meta,'schemaString':json.dumps(schema),'partitionColumns':['area']}
   (log/'00000000000000000001.json').write_text(json.dumps({'metaData':changed})+'\n');after=sorted(pa.RecordBatchReader.from_stream(DeltaTable(path).scan()).read_all().to_pylist(),key=lambda r:r['order_id']);assert after==[{'order_id':1,'area':'east','details':{'total':10}},{'order_id':2,'area':'east','details':{'total':20}}],after
   row.update(status='read-and-renamed',before=before,after=after)
  except Exception as e:row.update(status='failed',message=str(e),errorType=type(e).__name__)
  results.append(row)
assert all(r['status']=='read-and-renamed' for r in results),results
(base/'native-results.json').write_text(json.dumps({'runtime':'deltalake 1.6.4','pyarrow':pa.__version__,'results':results},indent=2)+'\n');print(results)
