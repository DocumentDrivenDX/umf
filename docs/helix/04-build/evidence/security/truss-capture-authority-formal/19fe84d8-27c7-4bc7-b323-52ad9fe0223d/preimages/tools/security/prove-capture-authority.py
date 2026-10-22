"""Conditional authority predicate/serialization laws, not SQL refinement."""
import hashlib,json,sys,uuid,re
from pathlib import Path
import z3
root=Path(__file__).resolve().parents[2]
SELF='tools/security/prove-capture-authority.py'
if Path.cwd()!=root or Path(__file__).resolve()!=root/SELF or len(sys.argv)!=1:raise SystemExit('Exact root invocation required')
native='docs/helix/04-build/evidence/security/truss-protected-capture-candidate/85d31486-2f88-48e5-b492-ec15b9d730f3/native.json'
native_bytes=(root/native).read_bytes();receipt=json.loads(native_bytes)
paths=[str(Path(__file__).relative_to(root)),native,*receipt['sourceSha256']]
frozen={p:(native_bytes if p==native else (root/p).read_bytes()) for p in paths}
sha=lambda b:hashlib.sha256(b).hexdigest()
for p,h in receipt['sourceSha256'].items():
 if sha(frozen[p])!=h:raise ValueError('Native source drift')
 if sha((root/Path(native).parent/'preimages'/p.lstrip('/')).read_bytes())!=h:raise ValueError('Original preimage mismatch')
if len(receipt['observations'])!=39 or any(o['expected']!=o['observed'] for o in receipt['observations']):raise ValueError('Unknown native receipt')
sql=frozen['tools/security/truss-protected-capture-candidate.sql'].decode()
fragments=["SELECT k.* INTO a FROM protected_capture.authority k WHERE k.actor_oid=$1 FOR SHARE;", "IF NOT FOUND OR NOT a.permitted OR a.generation<>$2 THEN", "PERFORM protected_capture.check_authority(c.actor_oid,c.authority_generation);", "IF current_setting('transaction_isolation') <> 'read committed' THEN"]
if any(sql.count(f)!=1 for f in fragments):raise ValueError('Authority guard correspondence changed')
expected_check_authority=" DECLARE a protected_capture.authority%ROWTYPE;\nBEGIN\n SELECT k.* INTO a FROM protected_capture.authority k WHERE k.actor_oid=$1 FOR SHARE;\n IF NOT FOUND OR NOT a.permitted OR a.generation<>$2 THEN\n  RAISE EXCEPTION 'Protected capture unavailable' USING ERRCODE='42501';\n END IF;\nEND "
matched=re.search(r'CREATE FUNCTION protected_capture\.check_authority\([^;]*?AS \$\$(.*?)\$\$;',sql,re.S)
if matched is None or matched.group(1)!=expected_check_authority:raise ValueError('Unknown full routine body')
expected_write=" DECLARE c protected_capture.capability%ROWTYPE;\nBEGIN\n IF current_setting('transaction_isolation') <> 'read committed' THEN\n  RAISE EXCEPTION 'Protected capture unavailable' USING ERRCODE='42501';\n END IF;\n UPDATE protected_capture.capability k SET used=true\n WHERE k.token=$1 AND NOT k.used AND k.attempt=$2 AND k.payload=$3\n AND k.database_oid=(SELECT oid FROM pg_database WHERE datname=current_database())\n AND k.backend_pid=pg_backend_pid() AND k.xid=pg_current_xact_id()\n AND k.person_oid=(SELECT oid FROM pg_roles WHERE rolname=session_user)\n RETURNING k.* INTO c;\n IF NOT FOUND THEN RAISE EXCEPTION 'Protected capture unavailable' USING ERRCODE='42501'; END IF;\n PERFORM protected_capture.check_authority(c.actor_oid,c.authority_generation);\n INSERT INTO protected_capture.effect VALUES(c.attempt,c.actor_oid,c.payload);\nEND "
matched=re.search(r'CREATE FUNCTION protected_capture\.write\([^;]*?AS \$\$(.*?)\$\$;',sql,re.S)
if matched is None or matched.group(1)!=expected_write:raise ValueError('Unknown full routine body')
out=root/'docs/helix/04-build/evidence/security/truss-capture-authority-formal'/str(uuid.uuid4());out.mkdir(parents=True)
pins={p:sha(b) for p,b in frozen.items()}
for p,b in frozen.items():
 archive=out/'preimages'/p.lstrip('/');archive.parent.mkdir(parents=True,exist_ok=True);archive.write_bytes(b)
(out/'start.json').write_text(json.dumps({'sourceSha256':pins},indent=2)+'\n')
found,permitted,held=z3.Bools('row_found permitted shared_lock_held')
generation,captured,next_generation=z3.Ints('generation captured_generation next_generation')
domain=z3.And(generation>0,captured>0,next_generation>0)
guard=z3.And(found,permitted,generation==captured)
checks=[
 ('revoked-refuses',z3.And(domain,z3.Not(permitted),guard),'unsat'),
 ('stale-generation-refuses',z3.And(domain,generation!=captured,guard),'unsat'),
 ('missing-authority-refuses',z3.And(domain,z3.Not(found),guard),'unsat'),
 ('current-authority-nonvacuity',z3.And(domain,guard),'sat'),
 ('erase-permission-accepts-revoked',z3.And(domain,found,z3.Not(permitted),generation==captured),'sat'),
 ('erase-generation-accepts-stale',z3.And(domain,found,permitted,captured<generation),'sat'),
 ('participating-revoker-cannot-advance-held-row',z3.And(domain,held,z3.Implies(held,next_generation==generation),next_generation>generation),'unsat'),
 ('erase-serialization-permits-advance',z3.And(domain,held,next_generation>generation),'sat')]
results=[]
for name,formula,expected in checks:
 solver=z3.Solver();solver.add(formula);data=solver.to_smt2().encode();(out/(name+'.smt2')).write_bytes(data)
 replay=z3.Solver();replay.add(z3.parse_smt2_string(data.decode()));actual=str(replay.check())
 if actual!=expected:raise ValueError('Formal result mismatch')
 results.append({'id':name,'expected':expected,'observed':actual,'smt2Sha256':sha(data),'model':str(replay.model()) if actual=='sat' else None})
for result in results:
 if sha((out/(result['id']+'.smt2')).read_bytes())!=result['smt2Sha256']:raise ValueError('Saved formula drift')
if any((root/p).read_bytes()!=b for p,b in frozen.items()):raise ValueError('Formal source drift')
(out/'proof.json').write_text(json.dumps({'status':'conditional-proof-passed','solver':z3.get_version_string(),'sourceSha256':pins,'nativeReceiptSha256':sha(frozen[native]),'recognizedSourceFragments':fragments,'recognizedCompleteBodies':['check_authority','write'],'queries':results,'scope':'Unbounded positive generation integers and Boolean found/permitted predicate model corresponding by exact complete-body recognition to the fixed native guard. Serialization is an explicit mathematical premise, not a derived PostgreSQL semantics theorem.','premises':['Truthful complete current authority row and original captured generation','Correct SQL Boolean/FOUND interpretation and atomic exception rollback','Participating exclusive revocation conflicts with held shared row lock','Same transaction retains lock until completion; savepoint rollback releases it','Actual owner subject mapping, full callable closure and policy source/current-cut binding remain unqualified'],'limitations':['No automatic SQL/Python/compiler refinement proof','No ontology policy resolution, publication-buffer drain or deadlock/liveness theorem','Native lock-timeout schedule is separate evidence; abstract serialization law assumes conflict semantics'],'acceptancePromoted':False},indent=2)+'\n')
print(json.dumps({'run':out.name,'queries':len(results),'unsat':4,'sat':4}))
