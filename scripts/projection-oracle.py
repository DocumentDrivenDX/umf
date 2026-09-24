"""Independent source and target instance expectations for the authored projection."""
import json, sys
from pathlib import Path
from google.protobuf import descriptor_pb2,descriptor_pool,message_factory
from jsonschema import Draft202012Validator
source=Draft202012Validator(json.loads(Path('fixtures/projections/constraints.schema.json').read_text()))
files=descriptor_pb2.FileDescriptorSet.FromString(Path(sys.argv[1]).read_bytes())
pool=descriptor_pool.DescriptorPool()
for file in files.file:pool.AddSerializedFile(file.SerializeToString())
Record=message_factory.GetMessageClass(pool.FindMessageTypeByName('umf.projection.Record'))
# Target assignments are explicitly authored examples, not an implicit converter.
cases=[
 ('required',{}, {},False,True),
 ('minimum',{'id':'x','count':-1},{'field_1':'x','field_2':-1},False,True),
 ('minLength',{'id':''},{'field_1':''},False,True),
 ('integer-range',{'id':'x','count':9223372036854775808},{'field_1':'x','field_2':9223372036854775808},True,False),
 ('nullability',{'id':'x','note':None},{'field_1':'x','field_3':None},True,False),
 ('uniqueItems',{'id':'x','tags':['a','a']},{'field_1':'x','field_4':['a','a']},False,True),
 ('minItems',{'id':'x','tags':[]},{'field_1':'x','field_4':[]},False,True),
 ('oneOf',{'id':'x','choice':'C'},{'field_1':'x','field_5':'C'},False,True),
 ('accepted',{'id':'x','count':7,'choice':'A'},{'field_1':'x','field_2':7,'field_5':'A'},True,True),
]
projection=json.loads(Path(sys.argv[2]).read_text())
required_reports={
 'required':('REQUIRED_NOT_ENFORCED','/required'),
 'minimum':('CONSTRAINT_NOT_ENFORCED','/properties/count/minimum'),
 'minLength':('CONSTRAINT_NOT_ENFORCED','/properties/id/minLength'),
 'integer-range':('INTEGER_DOMAIN','/properties/count/type'),
 'nullability':('NULLABILITY_LOST','/properties/note/type'),
 'uniqueItems':('CONSTRAINT_NOT_ENFORCED','/properties/tags/uniqueItems'),
 'minItems':('CONSTRAINT_NOT_ENFORCED','/properties/tags/minItems'),
 'oneOf':('CONSTRAINT_NOT_ENFORCED','/properties/choice/oneOf')
}
records=[]
for name,instance,assignments,source_expected,target_expected in cases:
 source_result=source.is_valid(instance)
 try:
  message=Record()
  for key,value in assignments.items():
   if isinstance(value,list):getattr(message,key).extend(value)
   else:setattr(message,key,value)
  message.SerializeToString();target_result=True
 except (ValueError,TypeError,OverflowError):target_result=False
 assert source_result==source_expected,(name,'source',source_result)
 assert target_result==target_expected,(name,'target',target_result)
 if source_result!=target_result:
  code,path=required_reports[name]
  assert any(issue['code']==code and issue['path']==path for issue in projection['issues']), ('Undisclosed observed mismatch',name)
 records.append({'case':name,'sourceAccepts':source_result,'targetAccepts':target_result})
empty=Record(field_1='x')
assert empty.field_2==0 and not empty.HasField('field_2')  # Annotation default 9 was not misused.
assert Record(field_1='x',field_4=[]).SerializeToString()==empty.SerializeToString()
nonfinite=Record(field_6=float('inf'));assert nonfinite.field_6==float('inf')
report={'sourceOracle':'jsonschema Draft202012Validator','targetOracle':'Python protobuf 7.36.2; protoc 36.2','records':records,'additionalChecks':['source annotation default is not a native default','absent and empty repeated fields collapse','native double admits nonfinite values'],'scope':'Explicit authored instance correspondence; projection does not implement a general data converter'}
Path('fixtures/projections/oracle-results.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
