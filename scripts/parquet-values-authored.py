import json,struct
from pathlib import Path
import thriftpy2
from thriftpy2.protocol import TCompactProtocol
from thriftpy2.transport import TMemoryBuffer
import pyarrow.parquet as pq
m=thriftpy2.load('native/parquet/sources/parquet.thrift',module_name='typed_values_parquet_thrift');base=Path('fixtures/parquet/values/authored');base.mkdir(parents=True,exist_ok=True);cases=[]
def enc(o):
 b=TMemoryBuffer();o.write(TCompactProtocol(b));return b.getvalue()
def emit(id,type,body,annotation=None,converted=None,length=None,expected='projected',value=None):
 header=enc(m.PageHeader(type=0,compressed_page_size=len(body),uncompressed_page_size=len(body),data_page_header=m.DataPageHeader(num_values=1,encoding=0,definition_level_encoding=3,repetition_level_encoding=3)));size=len(header)+len(body);cm=m.ColumnMetaData(type=type,encodings=[0,3],path_in_schema=['value'],codec=0,num_values=1,total_compressed_size=size,total_uncompressed_size=size,data_page_offset=4);e=m.SchemaElement(name='value',type=type,type_length=length,repetition_type=0,converted_type=converted,logicalType=annotation);footer=enc(m.FileMetaData(version=2,schema=[m.SchemaElement(name='schema',num_children=1),e],num_rows=1,row_groups=[m.RowGroup(columns=[m.ColumnChunk(file_offset=4,meta_data=cm)],num_rows=1,total_byte_size=size)]));p=base/(id+'.parquet');p.write_bytes(b'PAR1'+header+body+footer+struct.pack('<I',len(footer))+b'PAR1')
 try:native=pq.ParquetFile(p).read().column(0)[0];observation={'status':'readable','value':str(native.as_py()),'type':str(native.type)}
 except Exception as err:observation={'status':'rejected','message':str(err)}
 cases.append({'id':id,'path':str(p),'status':expected,'expectedValue':value,'native':observation})
def binary(v):return struct.pack('<I',len(v))+v
emit('decimal-over-precision',1,struct.pack('<i',1000),m.LogicalType(DECIMAL=m.DecimalType(precision=3,scale=1)),expected='blocked')
emit('int8-over-range',1,struct.pack('<i',128),m.LogicalType(INTEGER=m.IntType(bitWidth=8,isSigned=True)),expected='blocked')
emit('uint8-negative',1,struct.pack('<i',-1),m.LogicalType(INTEGER=m.IntType(bitWidth=8,isSigned=False)),expected='blocked')
emit('time-outside-day',2,struct.pack('<q',86400000000),m.LogicalType(TIME=m.TimeType(isAdjustedToUTC=False,unit=m.TimeUnit(MICROS=m.MicroSeconds()))),expected='blocked')
emit('invalid-utf8',6,binary(b'\xff'),m.LogicalType(STRING=m.StringType()),expected='blocked')
emit('invalid-json',6,binary(b'{bad'),m.LogicalType(JSON=m.JsonType()),expected='blocked')
emit('exact-json',6,binary(b'{"n":9007199254740993,"n":-0}'),m.LogicalType(JSON=m.JsonType()),value={'kind':'json','value':'{"n":9007199254740993,"n":-0}'})
emit('uuid',7,bytes.fromhex('00112233445566778899aabbccddeeff'),m.LogicalType(UUID=m.UUIDType()),length=16,value={'kind':'uuid','value':'00112233-4455-6677-8899-aabbccddeeff'})
emit('half-negative-zero',7,bytes.fromhex('0080'),m.LogicalType(FLOAT16=m.Float16Type()),length=2,value={'kind':'float','bits':16,'value':'-0'})
emit('bson-opaque',6,binary(bytes.fromhex('0500000000')),m.LogicalType(BSON=m.BsonType()),value={'kind':'opaque','annotation':'BSON'})
(base/'manifest.json').write_text(json.dumps({'cases':cases},indent=2)+'\n');print({'cases':len(cases)})
