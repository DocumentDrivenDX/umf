import json,struct,math
from pathlib import Path
import thriftpy2
from thriftpy2.protocol import TCompactProtocol
from thriftpy2.transport import TMemoryBuffer
import pyarrow.parquet as pq
m=thriftpy2.load('native/parquet/sources/parquet.thrift',module_name='physical_parquet_thrift');base=Path('fixtures/parquet/physical/authored');base.mkdir(parents=True,exist_ok=True);cases=[]
def enc(obj):
 b=TMemoryBuffer();obj.write(TCompactProtocol(b));return b.getvalue()
data=[('BOOLEAN',0,b'\x95\xff',9,None),('INT32',1,struct.pack('<4i',-2**31,-1,0,2**31-1),4,None),('INT64',2,struct.pack('<4q',-2**63,-1,0,2**63-1),4,None),('INT96',3,struct.pack('<QI',0,2440588)+struct.pack('<QI',1001,2440588),2,None),('FLOAT',4,struct.pack('<5I',0x80000000,0x7fc12345,0x7f800000,0xff800000,0x3fa00000),5,None),('DOUBLE',5,struct.pack('<5Q',0x8000000000000000,0x7ff8123456789abc,0x7ff0000000000000,0xfff0000000000000,0x3ff4000000000000),5,None),('BYTE_ARRAY',6,b''.join(struct.pack('<I',len(v))+v for v in [b'',b'\x00\xff',b'__proto__',b'abc']),4,None),('FIXED_LEN_BYTE_ARRAY',7,b'\x00\xff\x80\x01abcd',2,4)]
for name,typ,raw,count,length in data:
 for dictionary in ([False] if name=='BOOLEAN' else [False,True]):
  id=name.lower()+('-dictionary' if dictionary else '-plain');offset=4;payload=b''
  if dictionary:
   dh=enc(m.PageHeader(type=2,compressed_page_size=len(raw),uncompressed_page_size=len(raw),dictionary_page_header=m.DictionaryPageHeader(num_values=count,encoding=0)));payload=dh+raw;offset+=len(payload);body=bytes([(count-1).bit_length()])+b''.join(bytes([2,i]) for i in range(count));encoding=8
  else:body=raw;encoding=0
  ph=enc(m.PageHeader(type=0,compressed_page_size=len(body),uncompressed_page_size=len(body),data_page_header=m.DataPageHeader(num_values=count,encoding=encoding,definition_level_encoding=3,repetition_level_encoding=3)));payload+=ph+body;size=len(payload);cm=m.ColumnMetaData(type=typ,encodings=[0,3,8] if dictionary else [0,3],path_in_schema=['value'],codec=0,num_values=count,total_compressed_size=size,total_uncompressed_size=size,data_page_offset=offset,dictionary_page_offset=4 if dictionary else None);footer=enc(m.FileMetaData(version=2,schema=[m.SchemaElement(name='schema',num_children=1),m.SchemaElement(name='value',type=typ,type_length=length,repetition_type=0)],num_rows=count,row_groups=[m.RowGroup(columns=[m.ColumnChunk(file_offset=4,meta_data=cm)],num_rows=count,total_byte_size=size)]));path=base/(id+'.parquet');path.write_bytes(b'PAR1'+payload+footer+struct.pack('<I',len(footer))+b'PAR1');array=pq.read_table(path).column(0).combine_chunks();assert len(array)==count
  expected=[];at=0
  for i in range(count):
   if typ==0:expected.append({'type':name,'value':bool(raw[i//8]&(1<<(i%8)))})
   elif typ in [1,2]:n=4 if typ==1 else 8;expected.append({'type':name,'value':str(int.from_bytes(raw[at:at+n],'little',signed=True))});at+=n
   else:
    n={3:12,4:4,5:8,7:length}.get(typ)
    if typ==6:n=int.from_bytes(raw[at:at+4],'little');at+=4
    expected.append({'type':name,'hex':raw[at:at+n].hex()});at+=n
  if typ in [1,2,4,5]:assert array.buffers()[1].to_pybytes()==raw # Includes NaN payloads and signed zero.
  elif typ==3:assert array.cast('int64').to_pylist()==[0,1001]
  elif typ in [6,7]:assert array.to_pylist()==[bytes.fromhex(v['hex']) for v in expected]
  elif typ==0:assert array.to_pylist()==[v['value'] for v in expected]
  cases.append({'id':id,'path':str(path),'expected':expected,'plainHex':raw.hex(),'physicalType':name,'fixedLength':length,'count':count})
(base/'manifest.json').write_text(json.dumps({'runtime':'PyArrow 21.0.0 native values/buffers','cases':cases},indent=2)+'\n');print({'cases':len(cases)})
# A valid-sized compressed input can describe much larger dictionary-expanded output.
blob=b'x'*8192;dictionary=struct.pack('<I',len(blob))+blob;dh=enc(m.PageHeader(type=2,compressed_page_size=len(dictionary),uncompressed_page_size=len(dictionary),dictionary_page_header=m.DictionaryPageHeader(num_values=1,encoding=0)));body=bytes([0,0xa0,0x9c,1]);ph=enc(m.PageHeader(type=0,compressed_page_size=len(body),uncompressed_page_size=len(body),data_page_header=m.DataPageHeader(num_values=10000,encoding=8,definition_level_encoding=3,repetition_level_encoding=3)));payload=dh+dictionary+ph+body;cm=m.ColumnMetaData(type=6,encodings=[0,3,8],path_in_schema=['value'],codec=0,num_values=10000,total_compressed_size=len(payload),total_uncompressed_size=len(payload),dictionary_page_offset=4,data_page_offset=4+len(dh)+len(dictionary));footer=enc(m.FileMetaData(version=2,schema=[m.SchemaElement(name='schema',num_children=1),m.SchemaElement(name='value',type=6,repetition_type=0)],num_rows=10000,row_groups=[m.RowGroup(columns=[m.ColumnChunk(file_offset=4,meta_data=cm)],num_rows=10000,total_byte_size=len(payload))]));path=base/'expansion-limit.parquet';path.write_bytes(b'PAR1'+payload+footer+struct.pack('<I',len(footer))+b'PAR1');assert pq.ParquetFile(path).metadata.num_rows==10000
original=(base/'int32-dictionary.parquet').read_bytes();length=int.from_bytes(original[-8:-4],'little');bad=bytearray(original);bad[len(bad)-8-length-1]=255;badpath=base/'bad-dictionary-index.parquet';badpath.write_bytes(bad)
(base/'negative.json').write_text(json.dumps({'cases':[{'id':'expansion-limit','path':str(path),'expectedMessage':'64 MiB'},{'id':'bad-dictionary-index','path':str(badpath),'expectedMessage':'allowed range'}]},indent=2)+'\n')
