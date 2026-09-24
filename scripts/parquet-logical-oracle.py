import json,struct
from pathlib import Path
import thriftpy2
from thriftpy2.protocol import TCompactProtocol
from thriftpy2.transport import TMemoryBuffer
import pyarrow.parquet as pq
base=Path('fixtures/parquet/logical');base.mkdir(parents=True,exist_ok=True);m=thriftpy2.load('native/parquet/sources/parquet.thrift',module_name='logical_parquet_thrift');results=[]
def emit(id,type,logical=None,converted=None,length=None,precision=None,scale=None,expected='checked'):
 leaf=m.SchemaElement(name='value',type=type,repetition_type=1,logicalType=logical,converted_type=converted,type_length=length,precision=precision,scale=scale)
 obj=m.FileMetaData(version=2,schema=[m.SchemaElement(name='schema',num_children=1),leaf],num_rows=0,row_groups=[]);buf=TMemoryBuffer();obj.write(TCompactProtocol(buf));footer=buf.getvalue();path=base/(id+'.parquet');path.write_bytes(b'PAR1'+footer+struct.pack('<I',len(footer))+b'PAR1')
 try:
  p=pq.ParquetFile(path);native={'status':'accepted','logical':str(p.schema.column(0).logical_type),'arrow':str(p.schema_arrow.field(0).type)}
 except Exception as e:native={'status':'rejected','errorType':e.__class__.__name__,'message':str(e)}
 results.append({'id':id,'path':str(path),'expected':expected,'native':native})
for id,type,p,s,length,expected in [('decimal32',1,9,2,None,'checked'),('decimal32-over',1,10,2,None,'blocked'),('decimal64',2,18,2,None,'checked'),('decimal64-over',2,19,2,None,'blocked'),('decimal-fixed',7,38,9,16,'checked'),('decimal-fixed-over',7,39,9,16,'blocked'),('decimal-scale-negative',1,5,-1,None,'blocked'),('decimal-scale-over',1,5,6,None,'blocked')]:emit(id,type,m.LogicalType(DECIMAL=m.DecimalType(precision=p,scale=s)),length=length,expected=expected)
emit('decimal-legacy-default',1,converted=5,precision=5)
emit('decimal-legacy-missing',1,converted=5,expected='blocked')
emit('decimal-legacy-conflict',1,m.LogicalType(DECIMAL=m.DecimalType(precision=5,scale=2)),converted=5,precision=4,scale=1)
for id,type,bits,signed,expected in [('uint32',1,32,False,'checked'),('uint32-wrong',2,32,False,'blocked'),('int8',1,8,True,'checked'),('int-bits',1,7,True,'blocked')]:emit(id,type,m.LogicalType(INTEGER=m.IntType(bitWidth=bits,isSigned=signed)),expected=expected)
for id,kind,type,unit,adjusted,expected in [('timestamp-local','TIMESTAMP',2,'MICROS',False,'checked'),('timestamp-wrong','TIMESTAMP',1,'MILLIS',True,'blocked'),('time-ms','TIME',1,'MILLIS',False,'checked'),('time-us-wrong','TIME',1,'MICROS',True,'blocked'),('time-nanos','TIME',2,'NANOS',True,'checked')]:
 u=m.TimeUnit(**{unit:getattr(m,{'MILLIS':'MilliSeconds','MICROS':'MicroSeconds','NANOS':'NanoSeconds'}[unit])()});anno=getattr(m,'TimestampType' if kind=='TIMESTAMP' else 'TimeType')(isAdjustedToUTC=adjusted,unit=u);emit(id,type,m.LogicalType(**{kind:anno}),expected=expected)
for id,name,type,length,expected in [('string','STRING',6,None,'checked'),('string-wrong','STRING',1,None,'blocked'),('uuid','UUID',7,16,'checked'),('uuid-wrong','UUID',7,15,'blocked'),('float16','FLOAT16',7,2,'checked'),('float16-wrong','FLOAT16',7,4,'blocked'),('date','DATE',1,None,'checked'),('date-wrong','DATE',2,None,'blocked')]:emit(id,type,m.LogicalType(**{name:getattr(m,{'STRING':'StringType','UUID':'UUIDType','FLOAT16':'Float16Type','DATE':'DateType'}[name])()}),length=length,expected=expected)
emit('interval',7,converted=21,length=12)
emit('interval-wrong',7,converted=21,length=4,expected='blocked')
(base/'manifest.json').write_text(json.dumps({'runtime':'PyArrow 21.0.0 logical-to-Arrow schema observation','cases':results},indent=2)+'\n');print({'cases':len(results),'nativeAccepted':sum(r['native']['status']=='accepted' for r in results)})

assert len(results)==30
assert all((r['expected']=='checked')==(r['native']['status']=='accepted') for r in results)
