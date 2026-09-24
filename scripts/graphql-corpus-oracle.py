"""GraphQL-core comparison over pinned upstream schema and grammar fixtures."""
import json,hashlib
from pathlib import Path
import graphql
assert graphql.__version__=='3.2.12'
base=Path('fixtures/graphql')
manifest=json.loads((base/'upstream/manifest.json').read_text())
for entry in manifest['files']:
 assert hashlib.sha256((base/'upstream'/entry['path']).read_bytes()).hexdigest()==entry['sha256']
a=(base/'upstream/benchmark/github-schema.graphql').read_text();b=(base/'github-round-trip.graphql').read_text()
assert a==b
assert graphql.print_ast(graphql.parse(a))==graphql.print_ast(graphql.parse(b))
left,right=[graphql.build_schema(text) for text in [a,b]]
assert not graphql.validate_schema(left) and not graphql.validate_schema(right)
query=graphql.get_introspection_query(descriptions=True,specified_by_url=True,directive_is_repeatable=True,schema_description=True,input_value_deprecation=True,input_object_one_of=True)
def introspect(schema):
 result=graphql.graphql_sync(schema,query)
 assert not result.errors
 return result.data
original=introspect(left);returned=introspect(right);assert original==returned
assert len(left.type_map)==552
# Negative control changes an actual output contract, detected by full introspection.
right.query_type.fields['viewer'].type=graphql.GraphQLString
assert introspect(right)!=original
rows=[]
for entry in json.loads((base/'parser-cases.json').read_text())['cases']:
 try:graphql.parse(entry['text']);accepted=True;error=None
 except Exception as e:accepted=False;error=str(e)
 rows.append({'line':entry['line'],'graphqlJsSyntaxValid':entry['syntaxValid'],'graphqlCoreSyntaxValid':accepted,'agrees':accepted==entry['syntaxValid'],'error':error})
assert [(r['line'],r['graphqlJsSyntaxValid'],r['graphqlCoreSyntaxValid']) for r in rows if not r['agrees']]==[(1110,True,False)]
report={'commit':manifest['commit'],'version':graphql.__version__,'typeCount':len(left.type_map),'fullIntrospectionEqual':True,'exactSourceAndAst':True,'negativeControl':'Changing Query.viewer output type changes introspection','parserCases':rows,'parserAgreement':sum(r['agrees'] for r in rows),'limitations':['GraphQL-core shares GraphQL.js ancestry','SDL parser cases may be incomplete standalone models; grammar acceptance is separate from schema validity','GraphQL.js 17 grammar additions may exceed the Python runtime profile']}
(base/'corpus-oracle-results.json').write_text(json.dumps(report,indent=2)+'\n')
print('GraphQL upstream: 552 types retain full introspection; parser agreement',report['parserAgreement'],'/',len(rows))
