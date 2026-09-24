import json,struct
from pathlib import Path
import thriftpy2
from thriftpy2.protocol import TCompactProtocol
from thriftpy2.transport import TMemoryBuffer
import pyarrow.parquet as pq
m=thriftpy2.load('native/parquet/sources/parquet.thrift',module_name='hybrid_parquet_thrift');base=Path('fixtures/parquet/hybrid');base.mkdir(parents=True,exist_ok=True);cases=[]
def varint(n):
 out=bytearray()
 while n>127:out.append((n&127)|128);n>>=7
 out.append(n);return bytes(out)
def rle(width,value,count):return varint(count*2)+value.to_bytes((width+7)//8,'little')
def packed(width,values,pad=0):
 padding=[pad]*((-len(values))%8);data=values+padding;bits=sum(v<<(width*i) for i,v in enumerate(data));return varint((len(data)//8)*2+1)+bits.to_bytes(len(data)*width//8,'little'),padding
def encode(obj):
 b=TMemoryBuffer();obj.write(TCompactProtocol(b));return b.getvalue()
def emit(id,width,stream,values,padding):
 size=2**width;dictionary=struct.pack('<'+'i'*size,*range(size));dh=encode(m.PageHeader(type=2,uncompressed_page_size=len(dictionary),compressed_page_size=len(dictionary),dictionary_page_header=m.DictionaryPageHeader(num_values=size,encoding=0)));data=bytes([width])+stream;ph=encode(m.PageHeader(type=0,uncompressed_page_size=len(data),compressed_page_size=len(data),data_page_header=m.DataPageHeader(num_values=len(values),encoding=8,definition_level_encoding=3,repetition_level_encoding=3)));payload=dh+dictionary+ph+data
 column=m.ColumnMetaData(type=1,encodings=[0,3,8],path_in_schema=['value'],codec=0,num_values=len(values),total_uncompressed_size=len(payload),total_compressed_size=len(payload),dictionary_page_offset=4,data_page_offset=4+len(dh)+len(dictionary))
 metadata=m.FileMetaData(version=2,schema=[m.SchemaElement(name='schema',num_children=1),m.SchemaElement(name='value',type=1,repetition_type=0)],num_rows=len(values),row_groups=[m.RowGroup(columns=[m.ColumnChunk(file_offset=4,meta_data=column)],total_byte_size=len(payload),num_rows=len(values))]);footer=encode(metadata);path=base/(id+'.parquet');path.write_bytes(b'PAR1'+payload+footer+struct.pack('<I',len(footer))+b'PAR1');actual=pq.read_table(path).column(0).to_pylist();assert actual==values
 cases.append({'id':id,'width':width,'input':stream.hex(),'values':values,'padding':padding,'path':str(path)})
for width in range(9):
 maximum=2**width-1;values=[maximum]*13;emit('rle-'+str(width),width,rle(width,maximum,13),values,[])
 values=[i%(maximum+1) for i in range(13)];stream,padding=packed(width,values,maximum);emit('packed-'+str(width),width,stream,values,padding)
 values=[maximum]*9+[i%(maximum+1) for i in range(11)];stream,padding=packed(width,values[9:],maximum);emit('mixed-'+str(width),width,rle(width,maximum,9)+stream,values,padding)
(base/'manifest.json').write_text(json.dumps({'runtime':'PyArrow 21.0.0 native dictionary reads','cases':cases},indent=2)+'\n');print({'cases':len(cases)})
