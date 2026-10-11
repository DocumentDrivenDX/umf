"""Conditional facet family tuple identity; no runtime refinement or enforcement theorem."""
from pathlib import Path
import hashlib,json,uuid,zipfile
import z3
ROOT=Path(__file__).resolve().parents[2]
if Path.cwd()!=ROOT:raise SystemExit('Exact root invocation required')
TRUSS=Path('/private/tmp/truss-security-main-integration')
paths=[Path(__file__),TRUSS/'packages/umf-bun/src/catalog-facet-rule-families.ts',TRUSS/'packages/umf-bun/src/catalog-core-assertion-identities.ts',TRUSS/'packages/umf-bun/src/catalog-assertion-observations.ts',TRUSS/'tests/catalog-field-shape-correspondence.test.ts']
for directory in ['/private/tmp/truss-umf-runtime-LmpSsH','/private/tmp/truss-umf-runtime-xZQtaP']:
 paths += [Path(directory)/name for name in ['producer.js','producer.ts','producer-manifest.json']]
frozen={str(p):p.read_bytes() for p in paths};sha=lambda b:hashlib.sha256(b).hexdigest()
Profile=z3.DeclareSort('CandidateProfile');Owner=z3.DeclareSort('SemanticOwnerProfile')
Occurrence=z3.DeclareSort('ExactOriginalOccurrence');Family=z3.DeclareSort('RuleFamily');Parameters=z3.DeclareSort('JointJsonParameters')
p,q=z3.Consts('profile other_profile',Profile);o,u=z3.Consts('owner other_owner',Owner)
x,y=z3.Consts('occurrence other_occurrence',Occurrence);f,g=z3.Consts('precision fixed_scale',Family)
a,b=z3.Consts('parameters other_parameters',Parameters)
Identity=z3.Datatype('FaithfulTupleIdentity');Identity.declare('rule',('identity_profile',Profile),('identity_owner',Owner),('identity_occurrence',Occurrence),('identity_family',Family));Identity=Identity.create()
identity=lambda profile,owner,occurrence,family:Identity.rule(profile,owner,occurrence,family)
left=identity(p,o,x,f);right=identity(p,o,x,g)
authority,enforcement=z3.Bools('authenticated_owner installed_enforcement')
def tuple_sort(name,fields):
 datatype=z3.Datatype(name);datatype.declare('make_'+name,*[(name+'_'+key,sort) for key,sort in fields]);return datatype.create()
Position=tuple_sort('PositionOnly',[('profile',Profile),('owner',Owner),('occurrence',Occurrence)])
Param=tuple_sort('ParametersOnly',[('parameters',Parameters)])
position=lambda profile,owner,occurrence:Position.make_PositionOnly(profile,owner,occurrence)
parameter=lambda value:Param.make_ParametersOnly(value)
base=[]
queries=[
 ('two-decimal-duties-same-position-and-parameters',[f!=g,a==b,left!=right],'sat'),
 ('full-tuple-forbids-family-collapse',[f!=g,left==right],'unsat'),
 ('position-only-collapses-two-decimal-duties',[f!=g,position(p,o,x)==position(p,o,x),a==b],'sat'),
 ('parameter-only-collapses-two-decimal-duties',[f!=g,a==b,parameter(a)==parameter(b)],'sat'),
 ('tuple-correspondence-does-not-prove-authority-or-enforcement',[f!=g,left!=right,z3.Not(authority),z3.Not(enforcement)],'sat'),
]
# Populated coordinate-erasure controls, each paired with the full faithful tuple law.
coordinates=[('candidate-profile',p!=q,identity(q,o,x,f)),('semantic-owner',o!=u,identity(p,u,x,f)),('original-occurrence',x!=y,identity(p,o,y,f))]
for name,difference,other in coordinates:
 retained={
  'candidate-profile': [('owner',Owner,o,o),('occurrence',Occurrence,x,x),('family',Family,f,f)],
  'semantic-owner': [('profile',Profile,p,p),('occurrence',Occurrence,x,x),('family',Family,f,f)],
  'original-occurrence': [('profile',Profile,p,p),('owner',Owner,o,o),('family',Family,f,f)]
 }[name]
 reduced=tuple_sort('Erased_'+name.replace('-','_'),[(key,sort) for key,sort,_,_ in retained])
 make=reduced.constructor(0)
 queries.append(('erase-'+name+'-allows-collision',[difference,make(*[a for _,_,a,_ in retained])==make(*[b for _,_,_,b in retained])],'sat'))
 queries.append(('full-tuple-forbids-'+name+'-collision',[difference,left==other],'unsat'))
out=ROOT/'docs/helix/04-build/evidence/security/facet-rule-family-identity'/str(uuid.uuid4());out.mkdir(parents=True)
checks=[]
for name,query,expected in queries:
 solver=z3.Solver();solver.set(timeout=10000);solver.add(*base,*query);formula=solver.to_smt2();(out/(name+'.smt2')).write_text(formula)
 observed=str(solver.check())
 if observed!=expected:raise RuntimeError(name+': '+observed)
 ctx=z3.Context();replay=z3.Solver(ctx=ctx);replay.set(timeout=10000);replay.add(z3.parse_smt2_string(formula,ctx=ctx));actual=str(replay.check())
 if actual!=expected:raise RuntimeError(name+': replay '+actual)
 checks.append({'id':name,'expected':expected,'observed':observed,'freshContextReplay':actual,'formulaSha256':sha(formula.encode()),'model':str(solver.model()) if observed=='sat' else None})
if any(Path(p).read_bytes()!=b for p,b in frozen.items()):raise RuntimeError('Captured source changed')
with zipfile.ZipFile(out/'sources.zip','w',zipfile.ZIP_DEFLATED) as archive:
 for i,(p,b) in enumerate(frozen.items()):archive.writestr(str(i)+'/'+Path(p).name,b)
receipt={'status':'passed','solver':z3.get_version_string(),'checks':checks,'sourcePreimages':[{'path':p,'archive':str(i)+'/'+Path(p).name,'sha256':sha(b)} for i,(p,b) in enumerate(frozen.items())], 'premises':['Faithful tuple constructor and exact original occurrence carrier are mathematical premises, not proved JSON serialization, SHA injectivity or cross-process identity','Original owner facet interpretation and the local two-family decimal mapping are assumed; the concrete host witness is independent scoped evidence','No complete family inventory, registered semantic profile, issuer authentication, JavaScript/compiler/SQL refinement or native enforcement is established','Coordinate-erasure countermodels expose missing identity information only; parameters do not identify duties','Local Z3 installation and fresh-context replay; not hermetic'],'scope':'Conditional private facet family tuple identity with distinct decimal duties at a shared occurrence and equal joint parameters' ,'acceptancePromoted':False}
(out/'proof.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'status':'passed','checks':len(checks),'receipt':str(out/'proof.json')}))
