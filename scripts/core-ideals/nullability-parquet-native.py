"""Native Parquet availability counterexamples, pinned to PyArrow 21.0.0."""
import json,hashlib
from pathlib import Path
import pyarrow as pa,pyarrow.parquet as pq
assert pa.__version__=='21.0.0'
root=Path('fixtures/parquet/nullability');root.mkdir(parents=True,exist_ok=True)
cases=[]
metadata={b'future.meaning':b'unclassified',b'future.exact':b'9007199254740993'}
def native_availability(schema):
 result=[]
 def visit(field,ancestor=False,repeated=False):
  optional=ancestor or field.nullable
  if pa.types.is_struct(field.type):
   for child in field.type:visit(child,optional,repeated)
  elif pa.types.is_list(field.type):visit(field.type.value_field,False,True)
  elif pa.types.is_map(field.type):
   visit(field.type.key_field,False,True);visit(field.type.item_field,False,True)
  else:result.append({'row':'unspecified' if repeated else 'absent-allowed' if optional else 'required','element':('absent-allowed' if optional else 'required') if repeated else 'unspecified'})
 for field in schema:visit(field)
 return result
def add(kind,parent,member,label,input,field,expected,rejected=False,array=None,hidden=None):
 expected=json.loads(json.dumps(expected))
 for embedded in [False,True]:
  id=f'{kind}-{int(parent)}-{int(member)}-{label}-{int(embedded)}';schema=pa.schema([field],metadata=metadata);stage='construct'
  record={'id':id,'kind':kind,'parentNullable':parent,'memberNullable':member,'case':label,'storeSchema':embedded,'input':input,'expectedOutput':expected,'expectedRejected':rejected}
  try:
   table=pa.Table.from_arrays([array],schema=schema) if array is not None else pa.Table.from_pylist([input],schema=schema)
   record['arrowInput']=table.to_pylist();record['construction']='explicit-mask-and-child-buffers' if array is not None else 'from-pylist'
   if hidden is not None:record['hiddenChildValues']=hidden
   stage='write'
   path=root/(id+'.parquet');pq.write_table(table,path,compression='NONE',use_dictionary=False,version='2.6',store_schema=embedded);stage='read';file=pq.ParquetFile(path);back=file.read().to_pylist()
   # JSON normalizes map pair tuples solely in the evidence representation.
   assert not rejected,(id,'Unexpected native acceptance');assert json.loads(json.dumps(back))==[expected],(id,back,expected)
   payload=path.read_bytes();record.update({'outcome':'accepted','path':str(path),'bytes':len(payload),'sha256':hashlib.sha256(payload).hexdigest(),'output':back,'physicalSchema':'\n'.join(str(file.schema).splitlines()[1:]),'columns':[{'name':file.schema.column(i).name,'path':file.schema.column(i).path,'definitionLevel':file.schema.column(i).max_definition_level,'repetitionLevel':file.schema.column(i).max_repetition_level} for i in range(len(file.schema))],'footerMetadata':{k.decode():v.decode() for k,v in (file.metadata.metadata or {}).items() if k!=b'ARROW:schema'},'embeddedArrow':b'ARROW:schema' in (file.metadata.metadata or {})})
   record['leafAvailability']=native_availability(file.schema_arrow)
   assert len(record['leafAvailability'])==len(record['columns'])
   assert record['embeddedArrow']==embedded
   assert record['footerMetadata']==({k.decode():v.decode() for k,v in metadata.items()} if embedded else {})
  except AssertionError:raise
  except Exception as error:
   assert rejected and stage=='write',(id,stage,type(error).__name__,str(error))
   assert type(error).__name__=='ArrowInvalid' and 'non-nullable' in str(error),(id,type(error).__name__,str(error))
   if 'path' in locals() and path.exists():path.unlink()
   record.update({'outcome':'rejected','stage':stage,'error':type(error).__name__,'message':str(error)})
  cases.append(record)
for parent in [False,True]:
 for label,input in [('null',{'value':None}),('omitted',{}),('present',{'value':7})]:
  add('scalar',parent,False,label,input,pa.field('value',pa.int32(),nullable=parent),{'value':input.get('value')},not parent and label!='present')
 for member in [False,True]:
  field=pa.field('parent',pa.struct([pa.field('value',pa.int32(),nullable=member)]),nullable=parent)
  for label,input in [('parent-null',{'parent':None}),('child-null',{'parent':{'value':None}}),('child-omitted',{'parent':{}}),('present',{'parent':{'value':7}})]:
   expected={'parent':None if parent else {'value':0}} if label=='parent-null' else {'parent':{'value':7 if label=='present' else None}}
   add('struct',parent,member,label,input,field,expected,not member and label in ['child-null','child-omitted'])
  for kind in ['list','map']:
   typ=pa.list_(pa.field('element',pa.int32(),nullable=member)) if kind=='list' else pa.map_(pa.string(),pa.field('value',pa.int32(),nullable=member))
   field=pa.field('value',typ,nullable=parent)
   for label,value in [('null',None),('empty',[]),('null-member',[None] if kind=='list' else [('a',None)]),('present',[7] if kind=='list' else [('a',7)])]:
    expected={'value':[] if label=='null' and not parent else value}
    add(kind,parent,member,label,{'value':value},field,expected,not member and label=='null-member')
# The parent mask must not be mistaken for a native default-as-execution rule.
masked=[('struct',pa.StructArray.from_arrays([pa.array([99],pa.int32())],fields=[pa.field('value',pa.int32(),nullable=False)],mask=pa.array([True])),{'value':99}),('list',pa.ListArray.from_arrays(pa.array([0,2],pa.int32()),pa.array([7,9],pa.int32()),mask=pa.array([True])),[7,9]),('map',pa.MapArray.from_arrays(pa.array([0,1],pa.int32()),pa.array(['a']),pa.array([99],pa.int32()),mask=pa.array([True])),[['a',99]])]
for kind,array,hidden in masked:
 for nullable in [False,True]:
  add(kind,nullable,False,'masked-buffers',{'value':None},pa.field('value',array.type,nullable=nullable),{'value':None if nullable else hidden},array=array,hidden=hidden)
record={'runtime':'PyArrow 21.0.0','writer':{'formatVersion':'2.6','compression':'NONE','useDictionary':False},'cases':cases,'summary':{'cases':len(cases),'accepted':sum(r['outcome']=='accepted' for r in cases),'rejected':sum(r['outcome']=='rejected' for r in cases)},'scope':'Native input/value/nullability counterexamples; not a UMF classification or projection','sourceSchemaMetadata':{k.decode():v.decode() for k,v in metadata.items()},'limits':['PyArrow 21.0.0 behavior, not all Parquet writers.','Required container writes can expose hidden child values; no defaulting or omission equivalence is inferred.','store_schema=False omits source schema metadata in this writer; only metadata actually present in each file can be recovered.','Physical definition/repetition levels, Arrow parent masks and core ideals remain distinct.'],'fingerprints':{'scripts/core-ideals/nullability-parquet-native.py':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}}
Path('fixtures/validation/nullability-parquet-native.json').write_text(json.dumps(record,indent=2)+'\n');print(record['summary'])
