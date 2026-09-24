import json
from pathlib import Path
import pglast
from pglast.parser import parse_sql_json
inputs=json.loads(Path('fixtures/postgresql/oracle-input.json').read_text())
def tree(sql):
 value=json.loads(parse_sql_json(sql))
 def clean(x):
  if isinstance(x,list):return [clean(v) for v in x]
  if isinstance(x,dict):return {k:clean(v) for k,v in x.items() if k not in ['location','stmt_location','stmt_len']}
  return x
 return clean(value)
cases=[]
for row in inputs['cases']:
 a,b=tree(row['source']),tree(row['sql']);assert a==b,row['name']
 cases.append({'name':row['name'],'statements':len(a['stmts']),'nativeAstEqualExcludingOffsets':True})
original=tree(inputs['edit']['source']);edited=tree(inputs['edit']['sql']);assert original!=edited
original['stmts'][0]['stmt']['CreateStmt']['relation']['relname']='changed';assert original==edited
try:parse_sql_json('CREATE TABLE')
except Exception:invalid_rejected=True
else:raise AssertionError('Native parser accepted invalid SQL')
report={'oracle':'pglast '+pglast.__version__,'postgresqlVersion':pglast.get_postgresql_version(),'wasmParserVersion':inputs['parserVersion'],'cases':cases,'editChangesOnlySelectedName':True,'invalidSqlRejected':invalid_rejected,'scope':'Independent native C wrapper parsing original/re-exported SQL. Native PostgreSQL 17.7 versus WASM 17.4 are explicitly distinct. No catalog resolution, DDL execution or cross-system semantic equivalence claim.'}
Path('fixtures/postgresql/oracle-results.json').write_text(json.dumps(report,indent=2)+'\n')
print('PostgreSQL: two native schema round trips, isolated edit and invalid SQL rejection verified; native versions retained')
