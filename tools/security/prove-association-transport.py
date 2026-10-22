"""Actual bounded and quantified source-to-wire formula correspondence; not runtime refinement."""
import copy, hashlib, json, subprocess
from pathlib import Path
import z3
paths=[Path(__file__),Path('tools/security/association-transport-proof-input.ts'),Path('tests/security/fixture.ts')]
paths += [Path('docs/helix/02-design/spikes/security/'+name+'-v0.2.schema.json') for name in ['policy','ontology']]
paths += [p for root in ['src','spec'] for p in Path(root).rglob('*') if p.is_file()]
pins={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
packet=json.loads(subprocess.check_output(['bun','tools/security/association-transport-proof-input.ts'],text=True))
subject,resource=z3.Ints('subject resource')
functions={};fact_aliases={}
def cell(association,selector,row,boolean=False):
 key=(fact_aliases.get(association,association),selector,boolean)
 if key not in functions:functions[key]=z3.Function('cell_'+str(len(functions)),z3.IntSort(),z3.BoolSort() if boolean else z3.IntSort())
 return functions[key](row)
def presence(association,row):return cell(association,'presence',row,True)
def literal(value):
 if set(value)=={'boolean'}:return z3.BoolVal(value['boolean'])
 if set(value)=={'integerToken'}:return z3.IntVal(value['integerToken'])
 raise ValueError('Unsupported proof literal')
def intrinsic_cell(channel,field):
 return cell('intrinsic:'+channel, json.dumps(field,sort_keys=True),0,field['elementId']=='active')
def source_term(t,env):
 if t['kind'] in ['subject','resource','context']:
  if 'identity' in t:return {'subject':subject,'resource':resource}[t['kind']]
  return intrinsic_cell(t['kind'],t['field'])
 if t['kind']=='constant':return literal(t['value'])
 association,row=env[t['name']]
 return cell(association,'endpoint:'+t['endpoint'],row) if 'endpoint' in t else cell(association,'field:'+t['field']['elementId'],row,True)
def source_expr(e,env,bound):
 op=e['op']
 if op=='literal':return z3.BoolVal(e['value'])
 if op=='eq':return source_term(e['left'],env)==source_term(e['right'],env)
 if op=='and':return z3.And(*[source_expr(a,env,bound) for a in e['args']])
 if op=='or':return z3.Or(*[source_expr(a,env,bound) for a in e['args']])
 if op=='not':return z3.Not(source_expr(e['arg'],env,bound))
 association=e['association'].get('elementId',e['association'].get('relationshipId'))
 if bound is None:
  row=z3.FreshInt('source_witness');return z3.Exists([row],z3.And(presence(association,row),source_expr(e['where'],{**env,e['as']:(association,row)},None)))
 return z3.Or(*[z3.And(presence(association,i),source_expr(e['where'],{**env,e['as']:(association,i)},bound)) for i in range(bound)])
def wire_term(t,env):
 if t['kind']=='entity-term':
  selected=t['term']
  if selected['kind']=='entity-identity':return {'subject':subject,'resource':resource}[selected['context']]
  if selected['kind']=='constant':return literal(selected['value'])
  if selected['kind']=='record-attribute':return intrinsic_cell(selected['context'],selected['field'])
  if selected['kind']=='context-attribute':return intrinsic_cell('context',selected['field'])
  raise ValueError('Unsupported intrinsic proof term')
 if t['kind']=='context-term':return {'subject':subject,'resource':resource}[t['context']]
 if t['kind']=='constant-term':return z3.BoolVal(t['term']['value']['boolean'])
 association,row=env[t['occurrence']];selected=t['term']
 if selected['kind']=='entity-identity':return cell(association,'endpoint:'+selected['role'],row)
 if selected['kind']=='record-attribute':return cell(association,'field:'+selected['field']['elementId'],row,True)
 raise ValueError('Unsupported proof term')
def wire_expr(e,env,bound):
 op=e['op']
 if op=='literal':return z3.BoolVal(e['value'])
 if op=='eq':return wire_term(e['left'],env)==wire_term(e['right'],env)
 if op=='and':return z3.And(*[wire_expr(a,env,bound) for a in e['args']])
 if op=='or':return z3.Or(*[wire_expr(a,env,bound) for a in e['args']])
 if op=='not':return z3.Not(wire_expr(e['arg'],env,bound))
 plan=wire['associations'][e['association']]['checks']['plan'];association=plan['type']['elementId'] if 'type' in plan else plan['relationship']['relationshipId']
 if bound is None:
  row=z3.FreshInt('wire_witness');return z3.Exists([row],z3.And(presence(association,row),wire_expr(e['where'],{**env,e['occurrence']:(association,row)},None)))
 return z3.Or(*[z3.And(presence(association,i),wire_expr(e['where'],{**env,e['occurrence']:(association,i)},bound)) for i in range(bound)])
cases=[]
for profile in packet['profiles']:
 wire=profile['wire'];functions={}
 for bound in ([None] if profile['profile']=='intrinsic-standalone' else [1,2,3,None]):
  original=source_expr(profile['source'],{},bound);transport=wire_expr(wire['expression'],{},bound)
  changed=copy.deepcopy(wire['expression'])
  if profile['profile']=='intrinsic-standalone':changed['args'][0]['left']['term']={'kind':'context-attribute','field':changed['args'][0]['left']['term']['field']}
  else:changed['where']['args'][1]['where']['args'][1]['right']['occurrence']=1
  broken=wire_expr(changed,{},bound)
  for name,formula,expected in [('correspondence',original!=transport,'unsat'),('population',original,'sat'),('broken-context-channel' if profile['profile']=='intrinsic-standalone' else 'broken-correlation',z3.And(broken,z3.Not(original)),'sat')]:
   solver=z3.Solver();solver.set(timeout=20000);solver.add(formula);smt=solver.to_smt2();result=str(solver.check())
   if result!=expected:raise RuntimeError((bound,name,result))
   cases.append({'profile':profile['profile'],'bound':'unbounded' if bound is None else bound,'id':name,'smt':smt,'result':result,'model':str(solver.model()) if result=='sat' else None})
# Conditional common-fact mapping is explicit, not inferred native correspondence.
fact_aliases={entry['checks']['plan']['relationship']['relationshipId']:entry['checks']['plan']['witness']['type']['elementId'] for entry in packet['profiles'][1]['wire']['associations']}
functions={};wire=packet['profiles'][0]['wire'];relational=wire_expr(wire['expression'],{},None)
wire=packet['profiles'][1]['wire'];graph=wire_expr(wire['expression'],{},None)
changed=copy.deepcopy(wire['expression']);changed['where']['args'][1]['where']['args'][1]['right']['occurrence']=1
broken=wire_expr(changed,{},None)
for name,formula,expected in [('correspondence',relational!=graph,'unsat'),('population',z3.And(relational,graph),'sat'),('broken-correlation',z3.And(broken,z3.Not(relational)),'sat')]:
 solver=z3.Solver();solver.set(timeout=20000);solver.add(formula);smt=solver.to_smt2();result=str(solver.check())
 if result!=expected:raise RuntimeError(('cross-representation',name,result))
 cases.append({'profile':'cross-representation','bound':'unbounded','id':name,'smt':smt,'result':result,'model':str(solver.model()) if result=='sat' else None})
if any(hashlib.sha256(Path(p).read_bytes()).hexdigest()!=h for p,h in pins.items()):raise RuntimeError('Source changed')
receipt={'status':'passed','solverVersion':z3.get_version_string(),'sourceDigests':pins,'sourcesUnchanged':True,'input':packet,'crossRepresentationFactMapping':fact_aliases,'cases':cases,'scope':'Actual authored Staff/Project relational and independently authored directed Record-backed graph fixtures versus regenerated private transports 0.1 and intrinsic 0.2, plus a standalone resource integer comparison and Boolean context condition in intrinsic 0.2. Standalone stored-resource and trusted-context channels are independent uninterpreted inputs, and exact integer literals use mathematical integers. No arbitrary scalar domain or intrinsic descriptor induction is proved. For correlated profiles, complete finite association domains of 1, 2, and 3 candidate rows each plus quantified arbitrary subsets of integer witness domains. Arbitrary Boolean membership/active facts and integer identity tokens; shared exact identity equality, complete domains, required singleton fields and faithful source facts assumed. Quantified equivalence covers this actual expression, not general structural induction over all admitted expressions. Cross-representation equivalence additionally assumes the retained relationship-to-association mapping preserves presence, directed role values, attributes and identity equality. Graph scope is source-to-transport under faithful role facts, not physical edge correspondence. Does not prove native domain equivalence, authenticity, public compiler adoption, generator correctness or runtime enforcement.'}
Path('docs/helix/04-build/evidence/security/association-transport-formal.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'status':'passed','queries':len(cases)}))
