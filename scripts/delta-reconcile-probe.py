import json,tempfile,hashlib
from pathlib import Path
import pyarrow as pa
import pyarrow.parquet as pq
from deltalake import DeltaTable
base=Path('fixtures/delta/history');base.mkdir(parents=True,exist_ok=True)
schema={'type':'struct','fields':[{'name':'id','type':'long','nullable':True,'metadata':{}}]}
meta={'id':'12345678-1234-1234-1234-123456789abc','format':{'provider':'parquet','options':{}},'schemaString':json.dumps(schema,separators=(',',':')),'partitionColumns':[],'configuration':{}}
adds={}
for name,value in [('a',1),('b',2)]:
 path=base/(name+'.parquet');pq.write_table(pa.table({'id':pa.array([value],type=pa.int64())}),path)
 adds[name]={'path':path.name,'partitionValues':{},'size':path.stat().st_size,'modificationTime':0,'dataChange':True,'stats':json.dumps({'numRecords':1,'minValues':{'id':value},'maxValues':{'id':value},'nullCount':{'id':0}})}
commits=[
 [{'protocol':{'minReaderVersion':1,'minWriterVersion':2}},{'metaData':meta},{'add':adds['a']},{'txn':{'appId':'job','version':9}},{'commitInfo':{'operation':'CREATE'}}],
 [{'add':adds['b']},{'remove':{'path':'a.parquet','dataChange':True,'deletionTimestamp':1}},{'txn':{'appId':'job','version':2}}],
 [{'metaData':dict(meta,name='renamed',description='metadata replaced')},{'protocol':{'minReaderVersion':1,'minWriterVersion':3}},{'add':adds['a']}],
 [{'add':dict(adds['b'],tags={'revision':'updated'},dataChange=False)},{'txn':{'appId':'other','version':9223372036854775807}}],
 [{'remove':{'path':'b.parquet','dataChange':True,'deletionTimestamp':4}}],
 [{'commitInfo':{'operation':'NO DATA CHANGE'}}]
]
results=[]
with tempfile.TemporaryDirectory(prefix='umf-history-') as work:
 path=Path(work);log=path/'_delta_log';log.mkdir()
 for file in base.glob('*.parquet'):(path/file.name).write_bytes(file.read_bytes())
 for i,actions in enumerate(commits):
  text='\n'.join(json.dumps(a,separators=(',',':')) for a in actions)+'\n';(log/f'{i:020d}.json').write_text(text);(base/f'{i:020d}.json').write_text(text)
  t=DeltaTable(path);rows=pa.RecordBatchReader.from_stream(t.scan()).read_all().to_pylist()
  results.append({'version':str(i),'paths':sorted(Path(p).name for p in t.file_uris()),'rows':sorted(rows,key=lambda r:r['id']),'job':t.transaction_version('job'),'other':t.transaction_version('other'),'name':t.metadata().name,'description':t.metadata().description,'protocol':{'minReaderVersion':t.protocol().min_reader_version,'minWriterVersion':t.protocol().min_writer_version}})
report={'runtime':'deltalake 1.6.4 DataFusion scan','results':results,'files':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in base.glob('*.parquet')}}
(base/'native-results.json').write_text(json.dumps(report,indent=2)+'\n');print({'versions':len(results),'rows':[r['rows'] for r in results],'jobVersions':[r['job'] for r in results]})
