"""Conditional commit-time ordering, not SQL/driver/writer-barrier refinement."""
import hashlib,json,uuid,zipfile
from pathlib import Path
import z3
truss=Path('/private/tmp/truss-security-main-integration')
paths=[Path(__file__),truss/'scripts/python-catalog-cut-worker.py',truss/'scripts/check-python-catalog-cut-native.py',truss/'packages/postgresql/native/security-query-source-census-pg16.sql']
frozen={str(p):p.read_bytes() for p in paths}
lock,snapshot,execution,write,unlock,commit,release,old,new=z3.Ints('lock snapshot execution write catalog_unlock commit release old_source new_source')
at=lambda time:z3.If(time>=commit,new,old)
valid=[lock>=0,snapshot>=0,execution>snapshot,write>=0,unlock>=0,commit>=0,release>=0,old!=new]
held=[lock<=snapshot,execution<release]
commit_closed=z3.Or(commit<lock,commit>=release)
writer_started_before=[write<unlock,unlock<lock,write<commit]
fact_commit=z3.Int('authorization_fact_commit')
fact_at=lambda time:time<fact_commit
cases=[
 ('fresh-snapshot-plus-complete-commit-barrier-prevents-source-drift','unsat',valid+held+[commit_closed,at(snapshot)!=at(execution)]),
 ('old-repeatable-read-snapshot-survives-held-commit-barrier','sat',valid+[snapshot<commit,commit<lock,lock<execution,execution<release,commit_closed,at(snapshot)!=at(execution)]),
 ('catalog-statement-locks-do-not-drain-uncommitted-writer','sat',valid+held+writer_started_before+[snapshot<commit,commit<execution,at(snapshot)!=at(execution)]),
 ('release-before-execution-allows-late-commit','sat',valid+[lock<=snapshot,snapshot<release,release<=commit,commit<execution,at(snapshot)!=at(execution)]),
 ('held-source-cut-alone-does-not-hold-authorization-facts','sat',valid+held+[commit_closed,snapshot<fact_commit,fact_commit<execution,at(snapshot)==at(execution),fact_at(snapshot)!=fact_at(execution)]),
 ('fresh-data-authority-and-source-commit-cuts-prevent-stale-release','unsat',valid+held+[commit_closed,z3.Or(fact_commit<lock,fact_commit>=release),z3.Or(at(snapshot)!=at(execution),fact_at(snapshot)!=fact_at(execution))]),
]
queries=[]
for name,expected,formula in cases:
 solver=z3.Solver();solver.set(timeout=10000);solver.add(*formula);smt=solver.to_smt2();result=str(solver.check())
 if result!=expected:raise RuntimeError(name+': '+result)
 ctx=z3.Context();again=z3.Solver(ctx=ctx);again.set(timeout=10000);again.from_string(smt);replay=str(again.check())
 if replay!=expected:raise RuntimeError('Fresh replay differs')
 queries.append({'id':name,'expected':expected,'result':result,'freshContextReplay':replay,'smt2':smt,'witness':str(solver.model()) if result=='sat' else None})
if any(Path(p).read_bytes()!=b for p,b in frozen.items()):raise RuntimeError('Inputs changed')
folder=Path('docs/helix/04-build/evidence/security/catalog-cut-ordering-formal')/str(uuid.uuid4());folder.mkdir(parents=True)
(folder/'proof.json').write_text(json.dumps({'status':'conditional-proof-passed','z3Version':z3.get_version_string(),'sourceDigests':{p:hashlib.sha256(b).hexdigest() for p,b in frozen.items()},'queries':queries,'scope':'Single committed source transition and one authorization-fact transition over unbounded integer times. Truthful observation at snapshot, current native execution semantics, complete commit-time exclusion until final release and fresh post-barrier snapshot are explicit premises. No physical all-writer/advisory-key/SQL/driver refinement, arbitrary multiple-transition/ABA proof, provider authentication, completeness/injectivity, inherited-snapshot detection, operation handback or backend acceptance. Native PostgreSQL16.15 retained controls separately exercise old snapshots, pending catalog writer commit, finite DDL blocking and cooperative advisory drain.'},indent=2)+'\n')
with zipfile.ZipFile(folder/'sources.zip','w',zipfile.ZIP_DEFLATED) as archive:
 for p,b in frozen.items():archive.writestr(p.lstrip('/'),b)
print(json.dumps({'status':'conditional-proof-passed','queries':len(queries),'evidence':str(folder)}))
