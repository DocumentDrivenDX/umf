import json,struct
from pathlib import Path
import thriftpy2
from thriftpy2.protocol import TCompactProtocol
from thriftpy2.transport import TMemoryBuffer
import pyarrow as pa
import pyarrow.parquet as pq
base=Path('fixtures/parquet/containers');base.mkdir(parents=True,exist_ok=True)
m=thriftpy2.load('native/parquet/sources/parquet.thrift',module_name='container_parquet_thrift');cases=[]
def leaf(name='element',rep=1):return m.SchemaElement(name=name,type=1,repetition_type=rep)
def group(name,rep,children,converted=None):return m.SchemaElement(name=name,repetition_type=rep,num_children=children,converted_type=converted)
def describe(t):
 if pa.types.is_list(t):return {'kind':'list','elementNullable':t.value_field.nullable,'element':describe(t.value_type)}
 if pa.types.is_map(t):return {'kind':'map','valueNullable':t.item_field.nullable,'key':describe(t.key_type),'value':describe(t.item_type)}
 if pa.types.is_struct(t):return {'kind':'struct','fields':[{'name':f.name,'nullable':f.nullable,'type':describe(f.type)} for f in t]}
 return {'kind':str(t)}
def emit(id,schema,expected='checked'):
 obj=m.FileMetaData(version=2,schema=[m.SchemaElement(name='schema',num_children=1)]+schema,num_rows=0,row_groups=[]);buf=TMemoryBuffer();obj.write(TCompactProtocol(buf));f=buf.getvalue();path=base/(id+'.parquet');path.write_bytes(b'PAR1'+f+struct.pack('<I',len(f))+b'PAR1')
 try:
  field=pq.ParquetFile(path).schema_arrow.field(0);native={'status':'accepted','nullable':field.nullable,'type':describe(field.type)}
 except Exception as e:native={'status':'rejected','message':str(e)}
 cases.append({'id':id,'path':str(path),'expected':expected,'native':native})
for name,rep in [('element',1),('renamed',0)]:emit('list-three-'+name,[group('items',1,1,3),group('list',2,1),leaf(name,rep)])
emit('list-primitive',[group('items',1,1,3),leaf('item',2)])
emit('list-tuple',[group('items',1,1,3),group('tuple',2,2),leaf('a',0),leaf('b',1)])
for name in ['array','items_tuple']:emit('list-'+name,[group('items',1,1,3),group(name,2,1),leaf('a',1)])
emit('list-nested-repeated',[group('items',1,1,3),group('array',2,1,3),leaf('array',2)])
emit('list-wrong-child-repetition',[group('items',1,1,3),leaf('element',1)],'blocked')
emit('list-two-children',[group('items',1,2,3),leaf('a',2),leaf('b',2)],'blocked')
emit('list-repeated-outer',[group('items',2,1,3),leaf('a',2)],'blocked')
for name,conv in [('canonical',1),('legacy-outer',2)]:emit('map-'+name,[group('mapping',1,1,conv),group('key_value',2,2,2),leaf('key',0),leaf('value',1)])
emit('map-renamed',[group('mapping',0,1,1),group('pairs',2,2),leaf('left',0),leaf('right',0)])
emit('map-key-only',[group('mapping',1,1,1),group('key_value',2,1),leaf('key',0)])
emit('map-nullable-key',[group('mapping',1,1,1),group('key_value',2,2),leaf('key',1),leaf('value',1)],'blocked')
emit('map-repeated-value',[group('mapping',1,1,1),group('key_value',2,2),leaf('key',0),leaf('value',2)],'blocked')
emit('map-extra-field',[group('mapping',1,1,1),group('key_value',2,3),leaf('key',0),leaf('value',1),leaf('extra',1)],'blocked')
emit('map-repeated-outer',[group('mapping',2,1,1),group('key_value',2,2),leaf('key',0),leaf('value',1)],'blocked')
(base/'manifest.json').write_text(json.dumps({'runtime':'PyArrow '+pa.__version__,'cases':cases},indent=2)+'\n')
print({'cases':len(cases),'nativeAccepted':sum(c['native']['status']=='accepted' for c in cases),'specAccepted':sum(c['expected']=='checked' for c in cases)})
