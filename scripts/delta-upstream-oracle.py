"""Compare native observations from original upstream actions and UMF exports."""
import json,tempfile
from pathlib import Path
from deltalake import Schema,DeltaTable
base=Path('fixtures/delta/upstream');report=json.loads((base/'results.json').read_text());rows=[]
def parse(kind,value,path):
 try:
  if kind=='schema':return {'status':'accepted','schema':json.loads(Schema.from_json(value).to_json())}
  log=path/'_delta_log';log.mkdir(parents=True);(log/'00000000000000000000.json').write_text(json.dumps({'protocol':value['protocol']})+'\n'+json.dumps({'metaData':value['metaData']})+'\n');table=DeltaTable(path);p=table.protocol();return {'status':'accepted','schema':json.loads(table.schema().to_json()),'configuration':table.metadata().configuration,'partitions':table.metadata().partition_columns,'protocol':{'reader':p.min_reader_version,'writer':p.min_writer_version,'readerFeatures':sorted(p.reader_features or []),'writerFeatures':sorted(p.writer_features or [])}}
 except Exception as e:return {'status':'rejected','errorType':type(e).__name__}
with tempfile.TemporaryDirectory(prefix='umf-delta-upstream-') as tmp:
 for c in report['results']:
  lines=(base/c['path']).read_text().splitlines();action=json.loads(lines[c['line']-1]);original=action['metaData']['schemaString'] if c['kind']=='schema' else {'protocol':next(json.loads(line)['protocol'] for line in lines if line.strip() and 'protocol' in json.loads(line)),'metaData':action['metaData']}
  before=parse(c['kind'],original,Path(tmp)/(c['id']+'-before'));row={'id':c['id'],'kind':c['kind'],'umf':c['status'],'native':before}
  if c['status']=='round-tripped':
   text=(base/'exports'/(c['id']+'.json')).read_text();exported=text if c['kind']=='schema' else json.loads(text);assert (json.loads(text)==json.loads(original) if c['kind']=='schema' else exported==original);after=parse(c['kind'],exported,Path(tmp)/(c['id']+'-after'));assert before==after,(c['id'],before,after)
  rows.append(row)
assert len(rows)==141
output={'runtime':'deltalake 1.6.4','cases':141,'nativeComparisons':sum(r['umf']=='round-tripped' for r in rows),'nativeAccepted':sum(r['native']['status']=='accepted' for r in rows),'results':rows};assert output['nativeComparisons']==140 and output['nativeAccepted']==134
(base/'oracle-results.json').write_text(json.dumps(output,indent=2)+'\n');print({k:v for k,v in output.items() if k!='results'})
