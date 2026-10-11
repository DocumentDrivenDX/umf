"""Conditional fresh archive-cut algebra; never SQL/host refinement proof."""
import hashlib,json,sys,uuid
from pathlib import Path
import z3
root=Path.cwd();truss=Path('/private/tmp/truss-security-main-integration')
paths=[Path(__file__),truss/'packages/postgresql/native/catalog-report/release-selection.sql',
       truss/'packages/python/tests/test_catalog_report_release_native.py',
       truss/'scripts/check-python-catalog-report-release-native.py']
raw={str(p.resolve()):p.read_bytes() for p in paths}
folder=root/'docs/helix/04-build/evidence/security/catalog-release-archive-cut-formal'/str(uuid.uuid4())
folder.mkdir(parents=True)
read,actual,next_actual=z3.Ints('observed_matches actual_matches next_actual_matches')
fresh,held,own_writer=z3.Bools('fresh_snapshot archive_guard_held same_writer')
base=[read>=0,actual>=0,next_actual>=0,z3.Implies(fresh,read==actual)]
# This is an explicit exclusion premise, not a derivation of PostgreSQL lock semantics.
external_step=z3.Implies(z3.And(held,z3.Not(own_writer)),next_actual==actual)
admits=read==1
queries=[
 ('fresh-admission-is-current-unique','unsat',base+[fresh,admits,actual!=1]),
 ('external-guard-step-preserves-uniqueness','unsat',base+[fresh,admits,held,z3.Not(own_writer),external_step,next_actual!=1]),
 ('fresh-unique-positive','sat',base+[fresh,admits,held,actual==1,next_actual==1]),
 ('fresh-duplicate-refusal-positive','sat',base+[fresh,actual==2,z3.Not(admits)]),
 ('stale-snapshot-hides-committed-duplicate','sat',base+[z3.Not(fresh),admits,actual==2,held]),
 ('unguarded-external-insert-breaks-uniqueness','sat',base+[fresh,admits,z3.Not(held),z3.Not(own_writer),external_step,next_actual==2]),
 ('same-writer-can-change-under-own-lock','sat',base+[fresh,admits,held,own_writer,external_step,next_actual==2]),
 ('rollback-releases-cut-with-same-parent-identity','sat',base+[fresh,admits,z3.Not(held),z3.Not(own_writer),external_step,next_actual==2]),
]
results=[]
for name,expected,constraints in queries:
    solver=z3.Solver();solver.add(*constraints)
    text=solver.to_smt2();(folder/(name+'.smt2')).write_text(text)
    outcome=str(solver.check())
    if outcome!=expected:raise RuntimeError(name+': '+outcome)
    replay=z3.Solver(ctx=z3.Context());replay.from_string(text)
    if str(replay.check())!=expected:raise RuntimeError('Fresh-context replay failed')
    results.append({'id':name,'expected':expected,'observed':outcome,'freshContextReplay':expected,
                    'model':str(solver.model()) if outcome=='sat' else None})
if any(Path(p).read_bytes()!=b for p,b in raw.items()):raise RuntimeError('Analysis source changed')
for index,(p,b) in enumerate(raw.items()):(folder/('source-'+str(index)+Path(p).suffix)).write_bytes(b)
receipt={'status':'conditional-analysis-passed','z3':z3.get_version_string(),'python':sys.version,
 'sourceDigests':{p:hashlib.sha256(b).hexdigest() for p,b in raw.items()},'queries':results,
 'scope':'Arbitrary nonnegative archive match counts; fresh observation and held external-write exclusion are premises. Unique fresh base plus each excluded external step preserves uniqueness by induction over finite such histories. Four unsafe/rollback/same-writer states and two positive states remain satisfiable. Original authentication, exact installation/resource mapping, byte correspondence, all-source and current-authority cut, original driver and final disclosure are not established. This specifies admission algebra, not PostgreSQL isolation/locking or Python/SQL refinement; native controls must independently exercise freshness and exclusion. Parent transaction identity imposes no lock-lifetime constraint in the rollback control.'}
(folder/'proof.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'status':receipt['status'],'queries':len(results),'evidence':str(folder)}))
