"""Conditional physical correspondence laws. No implementation/native refinement."""
import hashlib,json,sys
from pathlib import Path
import z3
SELF=Path('tools/security/prove-record-home-correspondence.py')
ROOT=Path('/Users/erik/.codex/worktrees/1598/umf')
if Path.cwd().resolve()!=ROOT or Path(__file__).resolve()!=SELF.resolve() or len(sys.argv)!=1:
 raise RuntimeError('Unknown exact proof invocation')
paths=[SELF,Path('docs/helix/02-design/spikes/SPIKE-010-security-result-coverage.md'),Path('docs/helix/02-design/spikes/security/record-homes-v0.1.schema.json'),Path('/Users/erik/Projects/weft/crates/weft-core/src/security_requirements.rs')]
frozen={str(p):p.read_bytes() for p in paths}
Ref=z3.Datatype('QualifiedRef');Ref.declare('ref',('document',z3.StringSort()),('revision',z3.StringSort()),('module',z3.StringSort()),('element',z3.StringSort()));Ref=Ref.create()
a,b=z3.Consts('a b',Ref)
full=a==b;local=z3.And(Ref.module(a)==Ref.module(b),Ref.element(a)==Ref.element(b))
foreign=Ref.revision(a)!=Ref.revision(b)
I=z3.IntSort();i,j,n=z3.Ints('i j n')
owner,bound=z3.Consts('owner bound',z3.ArraySort(I,Ref))
ordered=z3.And(n>0,z3.ForAll(i,z3.Implies(z3.And(i>=0,i<n),owner[i]==bound[i])))
seteq=z3.And(z3.ForAll(i,z3.Implies(z3.And(i>=0,i<n),z3.Exists(j,z3.And(j>=0,j<n,owner[i]==bound[j])))),z3.ForAll(i,z3.Implies(z3.And(i>=0,i<n),z3.Exists(j,z3.And(j>=0,j<n,bound[i]==owner[j])))))
swapped=z3.And(n==2,a!=b,owner[0]==a,owner[1]==b,bound[0]==b,bound[1]==a)
roleA,roleB,keyA,keyB=z3.Strings('roleA roleB keyA keyB')
endpoint=z3.And(roleA==roleB,a==b,keyA==keyB,ordered)
Key=z3.DeclareSort('Key');k,k0,k1=z3.Consts('k k0 k1',Key)
source_count=z3.Function('authoritative_selected_key_count',Key,I);carrier_count=z3.Function('carrier_selected_key_count',Key,I)
nonneg=z3.ForAll(k,z3.And(source_count(k)>=0,carrier_count(k)>=0))
source_unique=z3.ForAll(k,source_count(k)<=1)
exact_population=z3.ForAll(k,carrier_count(k)==source_count(k))
forward=z3.ForAll(k,z3.Implies(source_count(k)==1,carrier_count(k)>=1))
base_pop=z3.And(nonneg,source_unique,k0!=k1,source_count(k0)==1,source_count(k1)==0)
Domain=z3.DeclareSort('Field');f,f0=z3.Consts('f f0',Domain)
needed=z3.Function('actual_required_field',Domain,z3.BoolSort())
source_value=z3.Function('authoritative_normalized_value',Key,Domain,z3.StringSort());carrier_value=z3.Function('carrier_normalized_value',Key,Domain,z3.StringSort())
coherent=z3.ForAll([k,f],z3.Implies(z3.And(source_count(k)==1,needed(f)),source_value(k,f)==carrier_value(k,f)))
reused=z3.And(a==b,roleA==roleB) # roleA/B stand for canonical source selection here.
partition=z3.Or(reused,z3.And(a!=b,roleA!=roleB)) # unequal images are native canonical values, not raw metadata.
Literal=z3.DeclareSort('Literal');l,l0=z3.Consts('l l0',Literal)
known=z3.Function('owner_known_literal',Literal,z3.BoolSort());live=z3.Function('current_branch_live',Literal,z3.BoolSort());image=z3.Function('selected_native_image',Literal,z3.BoolSort())
all_images=z3.ForAll(l,z3.Implies(known(l),image(l)));live_images=z3.ForAll(l,z3.Implies(z3.And(known(l),live(l)),image(l)))
chars,bytes_=z3.Ints('identifier_unicode_scalars identifier_utf8_bytes')
utf8=z3.And(chars>0,chars<=bytes_,bytes_<=4*chars)
DomainTuple=z3.Datatype('NormalizedDomain');DomainTuple.declare('domain',('scalar',z3.StringSort()),('cardinality',z3.StringSort()),('nullability',z3.StringSort()),('facets',z3.StringSort()),('allowedValues',z3.StringSort()));DomainTuple=DomainTuple.create()
da,db=z3.Consts('da db',DomainTuple)
domain_equal=da==db; scalar_equal=DomainTuple.scalar(da)==DomainTuple.scalar(db)
refinement_changed=DomainTuple.facets(da)!=DomainTuple.facets(db)
checks=[
 ('endpoint-domain-retains-refinements',z3.And(domain_equal,refinement_changed),z3.And(scalar_equal,refinement_changed),z3.And(domain_equal,scalar_equal)),
 ('qualified-reference-injective',z3.And(full,foreign),z3.And(local,foreign),z3.And(full,z3.Not(foreign))),
 ('unbounded-ordered-key-correspondence',z3.And(ordered,z3.Exists(i,z3.And(i>=0,i<n,owner[i]!=bound[i]))),z3.And(swapped,seteq,z3.Not(ordered)),z3.And(n>0,owner==bound,ordered)),
 ('endpoint-role-target-selected-key-ordered-members',z3.And(endpoint,z3.Or(roleA!=roleB,a!=b,keyA!=keyB,z3.Not(ordered))),z3.And(ordered,roleA!=roleB,a!=b,keyA!=keyB),z3.And(n==2,owner==bound,roleA==roleB,a==b,keyA==keyB,endpoint)),
 ('same-type-source-reuse-versus-distinct-type-partition',z3.And(partition,a!=b,roleA==roleB),z3.And(a!=b,roleA==roleB),z3.And(reused,partition)),
 ('bidirectional-carrier-population-rejects-extra-key',z3.And(base_pop,exact_population,carrier_count(k1)>0),z3.And(base_pop,forward,carrier_count(k1)==1),z3.And(base_pop,exact_population)),
 ('carrier-multiplicity-rejects-duplicate-key',z3.And(base_pop,exact_population,carrier_count(k0)>1),z3.And(base_pop,forward,carrier_count(k0)==2),z3.And(base_pop,exact_population)),
 ('key-population-alone-does-not-prove-field-coherence',z3.And(base_pop,exact_population,coherent,needed(f0),source_value(k0,f0)!=carrier_value(k0,f0)),z3.And(base_pop,exact_population,needed(f0),source_value(k0,f0)!=carrier_value(k0,f0)),z3.And(base_pop,exact_population,coherent,needed(f0))),
 ('utf8-byte-limit-is-not-character-limit',z3.And(utf8,bytes_<=63,bytes_>63),z3.And(utf8,chars==16,bytes_==64,chars<=63),z3.And(utf8,chars==15,bytes_==60,bytes_<=63)),
 ('known-native-images-cannot-prune-dead-branch',z3.And(all_images,known(l0),z3.Not(live(l0)),z3.Not(image(l0))),z3.And(live_images,known(l0),z3.Not(live(l0)),z3.Not(image(l0))),z3.And(all_images,known(l0),z3.Not(live(l0)),image(l0))),
]
cases=[]
for name,violation,control,positive in checks:
 case={'id':name,'covers':['US-056-AC6','US-056-AC7']}
 for kind,formula,expected in [('violation',violation,'unsat'),('negativeControl',control,'sat'),('positivePopulation',positive,'sat')]:
  solver=z3.Solver();solver.set(timeout=10000);solver.add(formula);smt=solver.sexpr();result=str(solver.check())
  if result!=expected:raise RuntimeError(name+'/'+kind+': '+result)
  replay=z3.Solver();replay.set(timeout=10000);replay.from_string(smt);replayed=str(replay.check())
  if replayed!=expected:raise RuntimeError(name+'/'+kind+' replay: '+replayed)
  case[kind]={'result':result,'replayResult':replayed,'smt':smt,'witness':str(solver.model()) if result=='sat' else None}
 cases.append(case)
if any(Path(p).read_bytes()!=v for p,v in frozen.items()):raise RuntimeError('Sources changed')
receipt={'status':'conditional-proof-passed','solverVersion':z3.get_version_string(),'sourceDigests':{p:hashlib.sha256(v).hexdigest() for p,v in frozen.items()},'sourcesUnchanged':True,'cases':cases,'scope':'Qualified Ref datatype and unbounded ordered component, selected-Key population and field/literal quantification. Endpoint and codec image meanings are modeled premises. Finite weakened controls witness foreign revisions, swapped components, extra/duplicate carriers, incoherent values and UTF8 four-byte scalars. Same-type reuse/distinct-type partition is this conservative PostgreSQL profile, not a universal UMF law. Does not establish schema-to-Rust refinement, domain normalization, native collation, authentic source mappings, authenticated subject, current authority, installed enforcement or release.','nativeImplementationQualified':False,'acceptanceCasesPromoted':[]}
Path('docs/helix/04-build/evidence/security/record-home-correspondence-formal.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'status':receipt['status'],'laws':len(cases),'formulas':3*len(cases)}))
