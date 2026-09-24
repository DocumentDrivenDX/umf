import json,struct
from pathlib import Path
import thriftpy2
from thriftpy2.protocol import TCompactProtocol
from thriftpy2.transport import TMemoryBuffer
import pyarrow.parquet as pq
m=thriftpy2.load('native/parquet/sources/parquet.thrift',module_name='assembly_parquet_thrift');base=Path('fixtures/parquet/rows/authored');base.mkdir(parents=True,exist_ok=True);cases=[]
def enc(obj):
 b=TMemoryBuffer();obj.write(TCompactProtocol(b));return b.getvalue()
def stream(v):return b''.join(bytes([2,x]) for x in v)
def emit(id,repeated,columns,status='blocked',rowcount=2,flat=False):
 if flat:schema=[m.SchemaElement(name='schema',num_children=len(columns))]+[m.SchemaElement(name='c'+str(i),type=1,repetition_type=0) for i in range(len(columns))]
 else:schema=[m.SchemaElement(name='schema',num_children=1),m.SchemaElement(name='g',repetition_type=2 if repeated else 1,num_children=len(columns))]+[m.SchemaElement(name='c'+str(i),type=1,repetition_type=0) for i in range(len(columns))]
 payload=b'';chunks=[]
 for i,(rep,defs,values) in enumerate(columns):
  offset=4+len(payload);rs=stream(rep) if repeated else b'';ds=stream(defs) if not flat else b'';body=(struct.pack('<I',len(rs))+rs if repeated else b'')+(struct.pack('<I',len(ds))+ds if not flat else b'')+struct.pack('<'+'i'*len(values),*values);header=enc(m.PageHeader(type=0,compressed_page_size=len(body),uncompressed_page_size=len(body),data_page_header=m.DataPageHeader(num_values=len(defs),encoding=0,definition_level_encoding=3,repetition_level_encoding=3)));size=len(header)+len(body);cm=m.ColumnMetaData(type=1,encodings=[0,3],path_in_schema=([] if flat else ['g'])+['c'+str(i)],codec=0,num_values=len(defs),total_compressed_size=size,total_uncompressed_size=size,data_page_offset=offset);chunks.append(m.ColumnChunk(file_offset=offset,meta_data=cm));payload+=header+body
 footer=enc(m.FileMetaData(version=2,schema=schema,num_rows=rowcount,row_groups=[m.RowGroup(columns=chunks,num_rows=rowcount,total_byte_size=len(payload))]));path=base/(id+'.parquet');path.write_bytes(b'PAR1'+payload+footer+struct.pack('<I',len(footer))+b'PAR1');native=None
 if status=='assembled':native=pq.ParquetFile(path).read().to_pylist()
 cases.append({'id':id,'path':str(path),'status':status,'nativeRows':native})
emit('valid-shared-optional',False,[([0,0],[1,0],[1]),([0,0],[1,0],[2])],'assembled')
emit('optional-presence-conflict',False,[([0,0],[1,0],[1]),([0,0],[0,1],[2])])
emit('valid-repeated',True,[([0,1,0],[1,1,0],[1,2]),([0,1,0],[1,1,0],[3,4])],'assembled')
emit('repeated-cardinality-conflict',True,[([0,1,0],[1,1,0],[1,2]),([0,0],[1,0],[3])])
emit('empty-presence-conflict',True,[([0,0],[0,0],[]),([0,0],[1,0],[3])])
emit('continuation-after-empty',True,[([0,1],[0,1],[1])],rowcount=1)
emit('node-budget',False,[([0]*10000,[0]*10000,list(range(10000))) for _ in range(10)],rowcount=10000,flat=True)
(base/'manifest.json').write_text(json.dumps({'runtime':'PyArrow 21.0.0 positive shared-row cases','cases':cases},indent=2)+'\n');print({'cases':len(cases)})
