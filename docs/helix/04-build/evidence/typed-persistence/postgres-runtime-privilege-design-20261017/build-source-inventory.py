from pathlib import Path
import ast,hashlib,json,re,shlex,subprocess
repo=Path('/Users/erik/.codex/worktrees/typed-sdk-recovery/umf');out=Path('/private/tmp/sdk-pg-runtime-privileges-source-r2');out.mkdir()
paths=['postgres_read.py','targets.py','verification.py','postgres_search.py','native_actions.py','build/privileges.py'];sources={}
for rel in paths:
 p=repo/'python/umf_access/src/umf_access'/rel;s=p.read_text();sources[rel]={'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'text':s,'ast':ast.parse(s)}
bki=Path('/opt/homebrew/opt/postgresql@18/share/postgresql/postgres.bki');tables={};schemas={};current=None;reading=False
for line in bki.read_text().splitlines():
 m=re.match(r'(?:create|open) (\w+)',line)
 if m:
  current=m[1];tables.setdefault(current,[])
  if line.startswith('create '):schemas[current]=[];reading=True
 elif reading and line.strip()==')':reading=False
 elif reading and '=' in line:schemas[current].append(line.strip().split(' = ')[0])
 elif line.startswith('insert ( '):
  row=shlex.split(line[len('insert ( '):-len(' )')]);tables[current].append(dict(zip(schemas[current],row,strict=True)))
 elif line.startswith('close '):current=None
T={r['oid']:r for r in tables['pg_type']};P={r['oid']:r for r in tables['pg_proc']};O={r['oid']:r for r in tables['pg_operator']}
def typeid(oid):
 if oid=='0':return None
 r=T.get(oid);return {'schema':'pg_catalog' if not r or r['typnamespace']=='11' else 'namespaceOid:'+r['typnamespace'],'name':r['typname'] if r else 'oid:'+oid,'oid':int(oid)}
def proc(r):return {'schema':'pg_catalog','name':r['proname'],'arguments':[typeid(v) for v in r['proargtypes'].split()],'result':typeid(r['prorettype']),'oid':int(r['oid']),'kind':r['prokind'],'variadicType':typeid(r['provariadic'])}
def function(name,args):
 rows=[r for r in P.values() if r['pronamespace']=='11' and r['proname']==name and r['proargtypes'].split()==[str(v) for v in args]];assert len(rows)==1,(name,args);return proc(rows[0])
functions={
 'set_config':function('set_config',[25,25,16]),'pg_has_role':function('pg_has_role',[19,26,25]),'unnest':function('unnest',[2277]),'jsonb_build_object':function('jsonb_build_object',[2276]),'jsonb_build_array':function('jsonb_build_array',[2276]),'jsonb_agg':function('jsonb_agg',[2283]),'to_jsonb':function('to_jsonb',[2283]),'current_database':function('current_database',[]),'current_schemas':function('current_schemas',[16]),'pg_control_system':function('pg_control_system',[]),'quote_ident':function('quote_ident',[25]),'to_regclass':function('to_regclass',[25])}
stmt={};raw=sources['postgres_read.py'];tree=raw['ast'];named={n.value.value:n.targets[0].id for n in tree.body if isinstance(n,ast.Assign) and len(n.targets)==1 and isinstance(n.targets[0],ast.Name) and isinstance(n.value,ast.Constant) and isinstance(n.value.value,str)}
for n in ast.walk(tree):
 if isinstance(n,ast.Constant) and isinstance(n.value,str) and re.match(r'^(?:SELECT |WITH |SET TRANSACTION )',n.value):
  text=n.value;identifier=named.get(text) or 'inline-'+hashlib.sha256(text.encode()).hexdigest()[:12];item=stmt.setdefault(identifier,{'id':identifier,'sql':text,'sha256':hashlib.sha256(text.encode()).hexdigest(),'sourceLines':[]});item['sourceLines'].append(n.lineno)
# SQL namespace relations and exact explicit column/full-row use. CTE/unnest aliases are not catalog relations.
for item in stmt.values():
 sqltext=item['sql'];alias={m[1]:m[0] for m in re.findall(r'(?:FROM|JOIN)\s+pg_catalog\.(\w+)\s+(\w+)',sqltext,re.I)};rels={}
 for a,t in alias.items():
  columns=sorted(set(re.findall(r'\b'+re.escape(a)+r'\.(\w+)',sqltext)));whole=bool(re.search(r'pg_catalog\.to_jsonb\('+re.escape(a)+r'\)',sqltext));rels[t]={'schema':'pg_catalog','relation':t,'privilege':'SELECT','columns':sorted(set(rels.get(t,{}).get('columns',[])+columns)),'wholeRow':whole or rels.get(t,{}).get('wholeRow',False)}
 for t,r in rels.items():
  if r['wholeRow']:r['expandedWholeRowColumns']=schemas[t];r['columnBasis']='all PG18 bootstrap columns; native version/column inventory must match before grant sufficiency'
 
 if item['id']=='_RESOLUTION':rels['pg_database']={'schema':'pg_catalog','relation':'pg_database','privilege':'SELECT','columns':['datname','oid'],'wholeRow':False}
 item['catalogRelations']=list(rels.values());names=sorted(set(re.findall(r'pg_catalog\.(\w+)\s*\(',sqltext)));item['directFunctions']=[functions[n] for n in names];item['sqlValueFunctions']=[x for x in ['current_user','session_user'] if re.search(r'\b'+x+r'\b',sqltext)];item['explicitCastTargets']=sorted(set(re.findall(r'::(?:pg_catalog\.)?(\w+(?:\[\])?)',sqltext)));item['operatorSymbolsLexical']=sorted(set(re.findall(r'(?<!:)(?:<=|>=|<>|!=|\|\||=|>|<|\+|-)',re.sub(r"'(?:''|[^'])*'",'',sqltext))))
 item['identityStatus']='source-and-bootstrap-proven direct function signatures; complete analyzed expression/implementation closure UNRESOLVED'
# Decompose operation incidence and phase precisely from fixed runtime program.
incidence={
 '_ROLE':{'read':['before locks','after closing admissions/shape'],'page':['before locks','after closing admissions/shape'],'stream':['same per-page phases; one RR read-only outer transaction'],'verify':['before locks only; _verify_only returns at verified event']},
 '_TABLE':{'all':['before each bound relation; also on shape-cache hit']},'_COLUMNS':{'all':['cache miss/no schemaBinding shape cache only']},'_KEYS':{'all':['cache miss/no schemaBinding shape cache only']},'_SHAPE':{'read/page':['before validation or cache hit; after compiler closing admissions'],'stream':['same per page under outer RR snapshot'],'verify':['before validation/cache hit only'],'selection':'only explicit schemaBinding native_context present'},'_RESOLUTION':{'read/page':['before search_path setup','after compiler closing admissions'],'stream':['same per-page phases'],'verify':['before only'],'selection':'only explicit qualified/search-path schemaBinding'},
}
for k,v in incidence.items():stmt[k]['operationScope']=v
inline_by_sql={x['sql']:x for x in stmt.values()}
for s,i in inline_by_sql.items():
 if 'set_config' in s:i['operationScope']={'all':['initial configuration and deadline refresh before each executed statement'],'gucs':re.findall(r"set_config\('([^']+)'",s),'nativeGucContext':'USERSET for these three names; execution ACL/native grant proof separate'}
 elif 'to_regclass' in s and i['id']!='_RESOLUTION':i['operationScope']={'all':['per bound table before metadata cache lookup; search_path resolution check']}
 elif s.startswith('SET TRANSACTION'):i['operationScope']={'sync/async read/page':['read-only, and RR when original readIsolation requires'],'stream':['always RR read-only outer transaction'],'driver':'connection.transaction owns BEGIN/COMMIT/ROLLBACK; driver protocol not SQL function'}
# Resolver must retain schemaqualified stable identities and distinguish function entrypoints from internal implementation references.
aggregate=P[str(functions['jsonb_agg']['oid'])];aggs=[a for a in tables['pg_aggregate'] if a['aggfnoid']==aggregate['oid']];assert len(aggs)==1
helpers={}
for field in ['aggtransfn','aggfinalfn','aggcombinefn','aggserialfn','aggdeserialfn','aggmtransfn','aggminvtransfn','aggmfinalfn']:
 value=aggs[0][field]
 if value not in ['-','0']:helpers[field]=proc(P[value])
# Explicit operator candidate sets are retained for native parameter-protocol resolution; never represented as actual grant requirements.
type_domain={'18','19','20','21','23','25','26','2205'}
operator_candidates=[]
for r in O.values():
 if r['oprnamespace']=='11' and r['oprname'] in ['=','<','>','<=','-','||'] and r['oprleft'] in type_domain and r['oprright'] in type_domain:
  operator_candidates.append({'schema':'pg_catalog','symbol':r['oprname'],'left':typeid(r['oprleft']),'right':typeid(r['oprright']),'oid':int(r['oid']),'implementation':proc(P[r['oprcode']]),'status':'CANDIDATE_NOT_GRANT_PROPOSAL'})
extra={}
for rel in ['postgres_search.py','native_actions.py']:
 extra[rel]=[{'line':n.lineno,'sql':n.value,'sha256':hashlib.sha256(n.value.encode()).hexdigest()} for n in ast.walk(sources[rel]['ast']) if isinstance(n,ast.Constant) and isinstance(n.value,str) and re.match(r'^(?:SELECT |BEGIN ISOLATION|SET TRANSACTION)',n.value)]
result={'version':'umf.sdk-pg-runtime-inventory-source/0.1','status':'SOURCE_INVENTORY; NATIVE_OVERLOAD_CLOSURE_PENDING','inventoryComplete':False,'temporal':'HELD','sourceCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip(),'sources':{n:{'sha256':r['sha256']} for n,r in sources.items()},'bootstrap':{'path':str(bki),'sha256':hashlib.sha256(bki.read_bytes()).hexdigest(),'scope':'local PG18 bootstrap identities, not native installed ACL/extension/version evidence'},'statements':list(stmt.values()),'aggregateImplementationReferences':{'pg_catalog.jsonb_agg(pg_catalog.anyelement)':helpers},'operatorCandidates':operator_candidates,'operatorCandidatesScope':'finite source type-domain candidates only; analyzed native query must select actual identities, never blanket grant these','extrasOutsideRawReadScope':extra,'hostOnlyNoSql':['targets.py server_version/target/binding/deadline checks','verification.py bounded process cache, no SQL','result/cursor/key/vector/Decimal validation and continuation hashes','libpq/Psycopg own transaction BEGIN/COMMIT/ROLLBACK and cancel protocol; independently pin driver behavior'],'unresolved':['native analyzed operator/sort/cast exact identity closure per SQL template and parameter adaptation variant','whole-row catalog scalar/array serializer and type-I/O internal implementation closure','pg_roles view expansion security owner context and native ACL behavior','independent constrained-principal grants/revocations proving sufficient and necessary selected-operation privileges','compiler original business/LOCK/admission privilege closure remains owner incomplete and separate']}
(out/'source-inventory.json').write_text(json.dumps(result,indent=2)+'\n')
for n,r in sources.items():p=out/'source'/n;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(r['text'])
print(json.dumps({'statements':len(stmt),'functionIdentities':len(functions),'operatorCandidates':len(operator_candidates),'output':str(out)}))
