"""Compare GraphQL input coercion and independent JSON Schema validation."""
import copy,json
from importlib.metadata import version
assert version('graphql-core')=='3.2.12' and version('jsonschema')=='4.26.0'
from pathlib import Path
from graphql import build_schema,coerce_input_value
from jsonschema import Draft202012Validator
result=json.loads(Path('fixtures/graphql/input-projection.json').read_text());schema=build_schema(Path('fixtures/graphql/input-projection.graphql').read_text());input_type=schema.get_type('Filter');target=Draft202012Validator(json.loads(result['nativeSchema']))
vectors=[('minimal',{'required':'x'},True,True),('nested',{'required':'x','nested':{'required':'y'},'list':[1,2]},True,True),('missing-required',{},False,False),('null-required',{'required':None},False,False),('null-defaulted',{'required':'x','defaulted':None},False,False),('null-element',{'required':'x','list':[None]},False,False),('singleton-list',{'required':'x','list':1},True,False),('id-coercion',{'required':'x','id':7},True,True),('oneof-empty',{'required':'x','selector':{}},False,False),('oneof-null',{'required':'x','selector':{'id':None}},False,False),('oneof-many',{'required':'x','selector':{'id':'a','name':'b'}},False,False),('oneof-id',{'required':'x','selector':{'id':'a'}},True,True),('extra-field',{'required':'x','unknown':1},False,False)]
rows=[]
for name,value,g_expected,j_expected in vectors:
 errors=[];coerced=coerce_input_value(value,input_type,on_error=lambda path,invalid,error:errors.append(str(error)))
 accepted=not errors;json_accepted=target.is_valid(value)
 assert (accepted,json_accepted)==(g_expected,j_expected),(name,errors,json_accepted)
 required=[]
 if accepted!=json_accepted:required.append(('LIST_COERCION','/types/Filter/fields/list'))
 if accepted and 'defaulted' not in value:
  assert coerced['defaulted']==7;required.append(('INPUT_DEFAULT','/types/Filter/fields/defaulted/default'))
 if name=='id-coercion':
  assert coerced['id']=='7';required.append(('ID_COERCION','/types/Filter/fields/id'))
 rows.append({'name':name,'graphqlAccepted':accepted,'jsonSchemaAccepted':json_accepted,'requiredIssues':required})
def accounted(issues):
 return all(any(i['code']==code and i['path']==path for i in issues) for row in rows for code,path in row['requiredIssues'])
assert accounted(result['issues'])
for code in ['LIST_COERCION','INPUT_DEFAULT','ID_COERCION']:
 assert not accounted([i for i in result['issues'] if i['code']!=code])
Path('fixtures/graphql/input-projection-oracle-results.json').write_text(json.dumps({'versions':{'graphql-core':version('graphql-core'),'jsonschema':version('jsonschema')},'vectors':rows,'negativeControls':['Removing '+c+' fails observed-difference accounting' for c in ['LIST_COERCION','INPUT_DEFAULT','ID_COERCION']],'scope':'Selected input binding; coercion differences are disclosed, not implemented'},indent=2)+'\n')
print('GraphQL input projection: 13 native/JSON comparisons and 3 missing-loss controls passed')
upstream=build_schema(Path('fixtures/graphql/upstream/benchmark/github-schema.graphql').read_text())
corpus=json.loads(Path('fixtures/graphql/input-projection-corpus.json').read_text());corpus_rows=[]
for sample in corpus['results']:
 validator=Draft202012Validator(json.loads(sample['nativeSchema']));type_=upstream.get_type(sample['type'])
 for name,value,expected in [('valid',sample['valid'],True),('missing',{},False),('extra',{**sample['valid'],'extra':'unknown'},False)]:
  errors=[];coerce_input_value(value,type_,on_error=lambda path,invalid,error:errors.append(str(error)))
  assert (not errors)==validator.is_valid(value)==expected
  corpus_rows.append({'type':sample['type'],'case':name,'accepted':expected})
Path('fixtures/graphql/input-projection-corpus-oracle.json').write_text(json.dumps({'scope':corpus['scope'],'comparisons':corpus_rows},indent=2)+'\n')
print('GraphQL pinned GitHub inputs: 9 native/JSON comparisons passed')
