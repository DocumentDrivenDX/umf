"""Independent runtime process (GraphQL-core is a GraphQL.js port, not unrelated lineage)."""
import json
from pathlib import Path
from graphql import parse,print_ast,build_schema,validate_schema,graphql_sync,__version__
assert __version__=='3.2.12'
a=Path('fixtures/graphql/shop.graphql').read_text();b=Path('fixtures/graphql/round-trip.graphql').read_text()
assert a==b and print_ast(parse(a))==print_ast(parse(b))
original,returned=build_schema(a),build_schema(b)
assert not validate_schema(original) and not validate_schema(returned)
rows=[]
queries=[('{ __type(name:"Product") { name fields(includeDeprecated:true) { name isDeprecated deprecationReason type { kind name ofType { kind name } } } } }',True),('{ product(selector:{id:"p"}) { id } }',True),('{ product(selector:{id:"p",name:"x"}) { id } }',False),('{ product(selector:{id:null}) { id } }',False),('{ search(filter:{limit:"wrong"}) { __typename } }',False),('{ node { id } }',False),('{ missing }',False)]
root={'product':None,'search':[],'node':None}
for query,valid in queries:
    results=[graphql_sync(schema,query,root_value=root).formatted for schema in [original,returned]]
    assert results[0]==results[1]
    assert ('errors' not in results[0])==valid,(query,results)
    rows.append({'query':query,'accepted':valid,'sameResult':True})
basic='type Query { greet(name: String = "world"): String! }'
edited=Path('fixtures/graphql/edited.graphql').read_text()
for text,expected in [(basic,'Hello world'),(edited,'Hello friend')]:
 schema=build_schema(text);schema.get_type('Query').fields['greet'].resolve=lambda root,info,name:'Hello '+name
 assert graphql_sync(schema,'{ greet }').data=={'greet':expected}
Path('fixtures/graphql/oracle-results.json').write_text(json.dumps({'version':__version__,'lineage':'GraphQL-core is a port of GraphQL.js; independent process/runtime, shared algorithm ancestry','queries':rows,'editedDefaultBehavior':True,'scope':'Authored SDL, introspection, validation/coercion and one default-resolver behavior; no custom directive or scalar implementation'},indent=2)+'\n')
print('GraphQL-core: 7 query comparisons, source/AST retention and edited-default behavior passed')
