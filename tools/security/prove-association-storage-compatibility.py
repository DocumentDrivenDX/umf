"""Conditional multiplicity and role-binding laws; not an SQL/compiler theorem."""
import hashlib,json,uuid
from pathlib import Path
import z3
ROOT=Path(__file__).resolve().parents[2]
if Path.cwd()!=ROOT:raise SystemExit('Exact root invocation required')
paths=[Path(__file__),ROOT/'docs/helix/02-design/contracts/security-association-binding.proposal.md',ROOT/'docs/helix/04-build/evidence/security/weft-handoff.json',ROOT/'docs/helix/02-design/contracts/CONTRACT-063-security-enforcement.md',Path('/private/tmp/truss-security-main-integration/docs/helix/04-build/evidence/qualified-property-layout-0.15.owner-export.sql')]
frozen={str(p):p.read_bytes() for p in paths};sha=lambda b:hashlib.sha256(b).hexdigest()
artifact=next(a for a in json.loads(frozen[str(paths[2])])['artifacts'] if a['id']=='natural-count-self-join');ontology=json.loads(artifact['request']['ontologyJson'])
if [(a['type']['elementId'],[e['role'] for e in a['endpoints']]) for a in ontology['associations']]!=[('Ownership',['resource','project']),('Assignment',['staff','project'])]:raise ValueError('Original binary roles required')
if b'UNIQUE INDEX edge_out' not in frozen[str(paths[4])] or b'(source_id, rel_type_id, target_id)' not in frozen[str(paths[4])]:raise ValueError('Captured native endpoint-pair uniqueness required')
n,maximum,minimum=z3.Ints('participation_count physical_maximum physical_minimum')
source_staff,target_staff,source_project,target_project=z3.Bools('source_is_staff target_is_staff source_is_project target_is_project')
source_match,target_match=z3.Bools('source_matches_requested_key target_matches_requested_key')
active=z3.Bool('same_witness_active')
# Distinct exact two-role selections imply one of both explicitly authored orientations.
roles=z3.And(source_staff!=target_staff,source_project!=target_project,source_staff!=source_project,target_staff!=target_project)
logical=z3.And(z3.If(source_staff,source_match,target_match),z3.If(source_project,source_match,target_match),active)
physical=z3.And(source_match,target_match,active)
assumed_staff_source=z3.And(source_staff,source_match,target_project,target_match,active)
bounded=z3.Bool('physical_has_finite_maximum')
native_accept=z3.And(n>=minimum,z3.Or(z3.Not(bounded),n<=maximum))
preserves_all=z3.ForAll(n,z3.Implies(n>=0,native_accept))
Witness=z3.DeclareSort('AssociationInstance');EndpointTuple=z3.DeclareSort('CompleteTypedEndpointTuple');Key=z3.DeclareSort('CompleteAssociationKey')
a,b=z3.Consts('instance_a instance_b',Witness);w=z3.Const('instance',Witness)
endpoints=z3.Function('complete_endpoints',Witness,EndpointTuple);key=z3.Function('authored_unique_key',Witness,Key);key_from_endpoints=z3.Function('key_determined_by_endpoints',EndpointTuple,Key)
unique_key=z3.ForAll([a,b],z3.Implies(key(a)==key(b),a==b))
key_dependency=z3.ForAll(w,key(w)==key_from_endpoints(endpoints(w)))
parallel=z3.And(a!=b,endpoints(a)==endpoints(b))
specs=[
 ('authored-endpoint-key-preserves-instance-injectivity',[unique_key,key_dependency],parallel,'unsat'),
 ('distinct-endpoint-instances-remain-admitted',[unique_key,key_dependency],z3.And(a!=b,endpoints(a)!=endpoints(b)),'sat'),
 ('independent-instance-key-can-require-parallel-edges',[unique_key],parallel,'sat'),
 ('all-count-preservation-forbids-inferred-restriction',[preserves_all],z3.Or(minimum>0,bounded),'unsat'),
 ('explicit-unrestricted-storage-preserves-all-counts',[minimum==0,z3.Not(bounded)],z3.Not(preserves_all),'unsat'),
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
receipt={'status':'pass','z3Version':z3.get_version_string(),'sourceSha256':{p:sha(b) for p,b in frozen.items()},'originalAssociations':ontology['associations'],'observations':checks,'scope':'Conditional abstract natural-count compatibility and exact binary role-orientation laws','limitations':['No native SQL or compiler semantics extraction/refinement','Logical count domain is all nonnegative integers when this profile has no semantic participation bounds','Role/key/attribute correspondence and same witness are premises, not authenticated fact coverage','Authored key uniqueness and endpoint-to-key determination are premises, not inferred from fixture rows','No native instance allocation, lifecycle, issuer, current-cut, canonical key encoding or publication theorem'],'acceptancePromoted':False}
(out/'proof.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'proof':str(out/'proof.json'),'observations':len(checks),'status':'pass'}))
