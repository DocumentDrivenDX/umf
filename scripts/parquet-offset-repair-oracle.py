import json,copy,hashlib,struct
from pathlib import Path
import pyarrow.parquet as pq
import thriftpy2
from thriftpy2.protocol import TCompactProtocol
from thriftpy2.transport import TMemoryBuffer
m=thriftpy2.load('native/parquet/sources/parquet.thrift',module_name='offset_parquet_thrift')
def read(raw):
 size=struct.unpack('<I',raw[-8:-4])[0];obj=m.FileMetaData();obj.read(TCompactProtocol(TMemoryBuffer(raw[-8-size:-8])));return obj
def encode(obj):
 b=TMemoryBuffer();obj.write(TCompactProtocol(b));return b.getvalue()
base=Path('fixtures/parquet/offset-repair');results=[]
for c in json.load(open(base/'results.json'))['results']:
 assert c['result']['status']=='transformed',c['id']
 source=Path(c['path']);target=base/(c['id']+'.parquet');old=source.read_bytes();new=target.read_bytes();n=c['result']['unchangedPrefixBytes'];assert old[:n]==new[:n]
 before=read(old);after=read(new);expected=copy.deepcopy(before)
 for r in c['result']['repairs']:
  col=expected.row_groups[r['rowGroup']].columns[r['column']].meta_data;assert col.dictionary_page_offset is None and col.data_page_offset==r['oldDataOffset'];col.data_page_offset=r['dataOffset'];col.dictionary_page_offset=r['dictionaryOffset']
 assert encode(expected)==encode(after),c['id']
 a=pq.read_table(source);b=pq.read_table(target);assert a.schema.equals(b.schema,check_metadata=True) and a.equals(b),c['id']
 results.append({'id':c['id'],'rows':a.num_rows,'columnsRepaired':len(c['result']['repairs']),'unchangedPrefixSha256':hashlib.sha256(old[:n]).hexdigest(),'sourceSha256':hashlib.sha256(old).hexdigest(),'outputSha256':hashlib.sha256(new).hexdigest()})
(base/'oracle-results.json').write_text(json.dumps({'runtime':'PyArrow 21.0.0 / thriftpy2 0.5.3','results':results},indent=2)+'\n');print(results)
