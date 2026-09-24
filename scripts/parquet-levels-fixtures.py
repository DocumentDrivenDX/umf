import json,struct,math
from pathlib import Path
import thriftpy2
from thriftpy2.protocol import TCompactProtocol
from thriftpy2.transport import TMemoryBuffer
import pyarrow.parquet as pq
m=thriftpy2.load('native/parquet/sources/parquet.thrift',module_name='level_parquet_thrift');base=Path('fixtures/parquet/levels/authored');base.mkdir(parents=True,exist_ok=True);cases=[]
def enc(obj):
 b=TMemoryBuffer();obj.write(TCompactProtocol(b));return b.getvalue()
def stream(values,max):return b''.join(bytes([2,v]) for v in values) if max else b''
layouts={
 'required':([0,0,0,0],[0,0,0,0],0,0,[10,20,30,40],[10,20,30,40]),
 'optional':([0,0,0,0],[0,1,0,1],0,1,[10,20],[None,10,None,20]),
 'repeated':([0,0,1,0,0],[0,1,1,1,0],1,1,[10,20,30],[[],[10,20],[30],[]]),
 'nullable-list':([0,0,0,1,1,0],[0,1,2,3,3,3],1,3,[10,20,30],[None,[],[None,10,20],[30]])}
def emit(layout,version,id=None,mutate=None):
 rep,defs,mr,md,physical,expected=layouts[layout];rep=rep.copy();defs=defs.copy();rs=stream(rep,mr);ds=stream(defs,md);rows=4;nulls=len(defs)-len(physical)
 if mutate=='definition-domain':ds=bytes([2,4])+ds[2:]
 if mutate=='repetition-domain':rs=bytes([2,2])+rs[2:]
 if mutate=='truncated-stream':ds=ds[:-1]
 if mutate=='rle-overrun':ds=bytes([254,1])+ds[2:]
 if mutate=='first-row':rs=bytes([2,1])+rs[2:]
 if mutate=='null-count':nulls=0
 if mutate=='row-count':rows=3
 if layout=='nullable-list':schema=[m.SchemaElement(name='schema',num_children=1),m.SchemaElement(name='value',num_children=1,repetition_type=1,converted_type=3),m.SchemaElement(name='list',num_children=1,repetition_type=2),m.SchemaElement(name='element',type=1,repetition_type=1)];path=['value','list','element']
 else:schema=[m.SchemaElement(name='schema',num_children=1),m.SchemaElement(name='value',type=1,repetition_type={'required':0,'optional':1,'repeated':2}[layout])];path=['value']
 data=struct.pack('<'+'i'*len(physical),*physical)
 if version==1:
  body=(struct.pack('<I',len(rs))+rs if mr else b'')+(struct.pack('<I',len(ds))+ds if md else b'')+data;header=m.PageHeader(type=0,compressed_page_size=len(body),uncompressed_page_size=len(body),data_page_header=m.DataPageHeader(num_values=len(defs),encoding=0,definition_level_encoding=3,repetition_level_encoding=3))
 else:body=rs+ds+data;header=m.PageHeader(type=3,compressed_page_size=len(body),uncompressed_page_size=len(body),data_page_header_v2=m.DataPageHeaderV2(num_values=len(defs),num_nulls=nulls,num_rows=rows,encoding=0,definition_levels_byte_length=len(ds),repetition_levels_byte_length=len(rs),is_compressed=False))
 ph=enc(header);size=len(ph)+len(body);column=m.ColumnMetaData(type=1,encodings=[0,3],path_in_schema=path,codec=0,num_values=len(defs),total_uncompressed_size=size,total_compressed_size=size,data_page_offset=4);metadata=m.FileMetaData(version=2,schema=schema,num_rows=4,row_groups=[m.RowGroup(columns=[m.ColumnChunk(file_offset=4,meta_data=column)],total_byte_size=size,num_rows=4)]);footer=enc(metadata);id=id or layout+'-v'+str(version);p=base/(id+'.parquet');p.write_bytes(b'PAR1'+ph+body+footer+struct.pack('<I',len(footer))+b'PAR1')
 native=None
 if mutate is None:native=pq.read_table(p).column(0).to_pylist();assert native==expected
 cases.append({'id':id,'path':str(p),'status':'blocked' if mutate else 'decoded','repetition':rep,'definition':defs,'valuesOffset':len(body)-len(data),'nonNullValues':len(physical),'rowStarts':4,'nativeRows':native})
for layout in layouts:
 for version in [1,2]:emit(layout,version)
for mutation in ['definition-domain','repetition-domain','truncated-stream','rle-overrun','first-row']:emit('nullable-list',1,'invalid-'+mutation,mutation)
for mutation in ['null-count','row-count']:emit('nullable-list',2,'invalid-'+mutation,mutation)
(base/'manifest.json').write_text(json.dumps({'runtime':'PyArrow 21.0.0 valid authored-page reads','cases':cases},indent=2)+'\n');print({'cases':len(cases)})
