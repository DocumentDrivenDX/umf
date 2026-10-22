"""Conditional multiplicity and role-binding laws; not an SQL/compiler theorem."""
import hashlib,json,uuid
from pathlib import Path
import z3
ROOT=Path(__file__).resolve().parents[2]
if Path.cwd()!=ROOT:raise SystemExit('Exact root invocation required')
paths=[Path(__file__),ROOT/'docs/helix/02-design/contracts/security-association-binding.proposal.md',ROOT/'docs/helix/04-build/evidence/security/weft-handoff.json',ROOT/'docs/helix/02-design/contracts/CONTRACT-063-security-enforcement.md']
frozen={str(p):p.read_bytes() for p in paths};sha=lambda b:hashlib.sha256(b).hexdigest()
artifact=next(a for a in json.loads(frozen[str(paths[2])])['artifacts'] if a['id']=='natural-count-self-join');ontology=json.loads(artifact['request']['ontologyJson'])
if [(a['type']['elementId'],[e['role'] for e in a['endpoints']]) for a in ontology['associations']]!=[('Ownership',['resource','project']),('Assignment',['staff','project'])]:raise ValueError('Original binary roles required')
n,maximum,minimum=z3.Ints('participation_count physical_maximum physical_minimum')
source_staff,target_staff,source_project,target_project=z3.Bools('source_is_staff target_is_staff source_is_project target_is_project')
source_match,target_match=z3.Bools('source_matches_requested_key target_matches_requested_key')
active=z3.Bool('same_witness_active')
# Distinct exact two-role selections imply one of both explicitly authored orientations.
roles=z3.And(source_staff!=target_staff,source_project!=target_project,source_staff!=source_project,target_staff!=target_project)
logical=z3.And(z3.If(source_staff,source_match,target_match),z3.If(source_project,source_match,target_match),active)
physical=z3.And(source_match,target_match,active)
assumed_staff_source=z3.And(source_staff,source_match,target_project,target_match,active)
specs=[
 ('unbounded-zero-minimum-preserves-all-counts',[n>=0],z3.Not(z3.And(n>=0)), 'unsat'),
 ('valid-unrestricted-nonempty-population',[n>=0],n>0,'sat'),
 ('inferred-finite-maximum-loses-valid-population',[maximum>=0,n>=0],n>maximum,'sat'),
 ('inferred-positive-minimum-loses-valid-empty-population',[minimum>0,n>=0],z3.And(n==0,n<minimum),'sat'),
 ('explicit-either-orientation-preserves-same-witness-predicate',[roles],logical!=physical,'unsat'),
 ('staff-source-positive',[roles],z3.And(source_staff,logical,physical),'sat'),
 ('project-source-positive',[roles],z3.And(source_project,logical,physical),'sat'),
 ('assuming-array-order-is-native-direction-loses-valid-witness',[roles],z3.And(logical,z3.Not(assumed_staff_source)),'sat'),
]
out=ROOT/'docs/helix/04-build/evidence/security/association-storage-compatibility'/str(uuid.uuid4());out.mkdir(parents=True)
checks=[]
for name,premises,query,expected in specs:
 solver=z3.Solver();solver.set(timeout=10000);solver.add(*premises,query)
 formula=solver.to_smt2();(out/(name+'.smt2')).write_text(formula)
 observed=str(solver.check())
 if observed!=expected:raise ValueError(name+': '+observed)
 checks.append({'id':name,'expected':expected,'observed':observed,'formulaSha256':sha(formula.encode()),'model':str(solver.model()) if observed=='sat' else None})
for p,b in frozen.items():
 dest=out/'preimages'/p.lstrip('/');dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(b)
if any(Path(p).read_bytes()!=b for p,b in frozen.items()):raise ValueError('Source changed')
receipt={'status':'pass','z3Version':z3.get_version_string(),'sourceSha256':{p:sha(b) for p,b in frozen.items()},'originalAssociations':ontology['associations'],'observations':checks,'scope':'Conditional abstract natural-count compatibility and exact binary role-orientation laws','limitations':['No native SQL or compiler semantics extraction/refinement','Logical count domain is all nonnegative integers when this profile has no semantic participation bounds','Role/key/attribute correspondence and same witness are premises, not authenticated fact coverage','No lifecycle, issuer, current-cut, canonical key encoding or publication theorem'],'acceptancePromoted':False}
(out/'proof.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'proof':str(out/'proof.json'),'observations':len(checks),'status':'pass'}))
