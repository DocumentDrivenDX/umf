"""Independent Apache Thrift Compact Protocol observations, not Parquet IDL validation."""
import json,struct,math
from pathlib import Path
from thrift.Thrift import TType as T
from thrift.protocol.TCompactProtocol import TCompactProtocol
from thrift.transport.TTransport import TMemoryBuffer
base=Path('fixtures/parquet/footer');base.mkdir(parents=True,exist_ok=True)
kinds={T.BOOL:'bool',T.BYTE:'i8',T.I16:'i16',T.I32:'i32',T.I64:'i64',T.DOUBLE:'double',T.STRING:'binary',T.STRUCT:'struct',T.MAP:'map',T.SET:'set',T.LIST:'list'}
def read(p,t):
 k=kinds[t]
 if t==T.BOOL:return {'kind':k,'value':p.readBool()}
 if t in [T.BYTE,T.I16,T.I32,T.I64]:return {'kind':k,'value':str({T.BYTE:p.readByte,T.I16:p.readI16,T.I32:p.readI32,T.I64:p.readI64}[t]())}
 if t==T.DOUBLE:return {'kind':k,'bits':struct.pack('<d',p.readDouble()).hex()}
 if t==T.STRING:return {'kind':k,'hex':p.readBinary().hex()}
 if t==T.STRUCT:
  p.readStructBegin();fields=[]
  while True:
   _,ty,id=p.readFieldBegin()
   if ty==T.STOP:break
   fields.append({'id':id,'value':read(p,ty)});p.readFieldEnd()
  p.readStructEnd();return {'kind':k,'fields':fields}
 if t in [T.LIST,T.SET]:
  ty,count=(p.readListBegin() if t==T.LIST else p.readSetBegin());items=[read(p,ty) for _ in range(count)]
  (p.readListEnd() if t==T.LIST else p.readSetEnd());return {'kind':k,'elementType':kinds[ty],'items':items}
 if t==T.MAP:
  kt,vt,count=p.readMapBegin();entries=[{'key':read(p,kt),'value':read(p,vt)} for _ in range(count)];p.readMapEnd();return {'kind':k,**({'keyType':kinds[kt],'valueType':kinds[vt]} if count else {}),'entries':entries}
# Native-written fixture includes unknown/repeated field IDs, exact extremes and duplicates.
buf=TMemoryBuffer();p=TCompactProtocol(buf);p.writeStructBegin('Unknown')
def field(id,ty,fn):p.writeFieldBegin('',ty,id);fn();p.writeFieldEnd()
field(1,T.BOOL,lambda:p.writeBool(True));field(2,T.BOOL,lambda:p.writeBool(False));field(8,T.BYTE,lambda:p.writeByte(-128));field(20,T.I16,lambda:p.writeI16(-32768));field(-3,T.I16,lambda:p.writeI16(32767));field(100,T.I32,lambda:p.writeI32(-2147483648));field(99,T.I64,lambda:p.writeI64(-(1<<63)));field(101,T.I64,lambda:p.writeI64((1<<63)-1))
for id,n in [(102,-0.0),(103,math.inf),(104,math.nan)]:field(id,T.DOUBLE,lambda n=n:p.writeDouble(n))
field(105,T.STRING,lambda:p.writeBinary(bytes([0,255,128])))
def bools():
 p.writeListBegin(T.BOOL,2);p.writeBool(True);p.writeBool(False);p.writeListEnd()
field(106,T.LIST,bools)
def values():
 p.writeSetBegin(T.I16,2);p.writeI16(3);p.writeI16(3);p.writeSetEnd()
field(107,T.SET,values)
def mapping():
 p.writeMapBegin(T.STRING,T.I64,2)
 for n in [-(1<<63),(1<<63)-1]:p.writeBinary(b'duplicate');p.writeI64(n)
 p.writeMapEnd()
field(108,T.MAP,mapping)
def nested():
 p.writeStructBegin('nested');field(1,T.STRING,lambda:p.writeBinary(b'future'));field(1,T.STRING,lambda:p.writeBinary(b'repeated'));p.writeFieldStop();p.writeStructEnd()
field(109,T.STRUCT,nested)
def empty():p.writeMapBegin(T.STRING,T.I32,0);p.writeMapEnd()
field(110,T.MAP,empty)
p.writeFieldStop();p.writeStructEnd();raw=buf.getvalue();(base/'native-boundaries.parquet').write_bytes(b'PAR1'+raw+struct.pack('<I',len(raw))+b'PAR1')
corpus=json.loads(Path('fixtures/parquet/capture-results.json').read_text())['results'];cases=[{'id':c['id'],'path':c['path']} for c in corpus]+[{'id':'native-boundaries','path':str(base/'native-boundaries.parquet')}];results=[]
for c in cases:
 raw=Path(c['path']).read_bytes();length=struct.unpack('<I',raw[-8:-4])[0];footer=raw[len(raw)-8-length:-8];transport=TMemoryBuffer(footer);p=TCompactProtocol(transport);value=read(p,T.STRUCT);consumed=transport.cstringio_buf.tell();expected={'value':value,'consumedBytes':consumed,'trailingBytes':len(footer)-consumed};(base/(c['id']+'.expected.json')).write_text(json.dumps(expected,indent=2)+'\n');results.append(c)
(base/'manifest.json').write_text(json.dumps({'runtime':'Apache thrift Python 0.22.0','files':len(results),'results':results},indent=2)+'\n');print({'files':len(results)})
