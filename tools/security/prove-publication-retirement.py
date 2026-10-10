"""Conditional snapshot/retirement algebra, not SQL or runtime verification."""
import hashlib,json
from pathlib import Path
import z3
snapshot_pending,current_pending,reader_lock=z3.Bools('snapshot_pending current_pending reader_lock')
snapshot_epoch,current_epoch,next_epoch=z3.Ints('snapshot_epoch current_epoch next_epoch')
# Snapshot eligibility alone is deliberately the vulnerable negative control.
admitted=z3.And(snapshot_pending,snapshot_epoch==current_epoch)
retire=z3.And(current_pending,z3.Not(reader_lock),next_epoch==current_epoch+1)
checks=[
 ('terminal-state-requires-freshness-fence',z3.And(snapshot_pending,z3.Not(current_pending),snapshot_epoch<current_epoch,admitted),z3.And(snapshot_pending,z3.Not(current_pending),snapshot_epoch==current_epoch,admitted),z3.And(snapshot_pending,current_pending,snapshot_epoch==current_epoch,admitted)),
 ('retirement-excludes-retained-native-reader',z3.And(retire,reader_lock),z3.And(current_pending,reader_lock,next_epoch==current_epoch),retire),
 ('retirement-invalidates-older-snapshot',z3.And(retire,snapshot_epoch<=current_epoch,snapshot_pending,snapshot_epoch==next_epoch),z3.And(current_pending,snapshot_epoch==current_epoch,next_epoch==current_epoch,snapshot_pending),z3.And(retire,snapshot_epoch==current_epoch)),
 ('rolled-back-retirement-remains-closed',z3.And(snapshot_pending,snapshot_epoch==current_epoch,next_epoch>current_epoch,snapshot_epoch==next_epoch),z3.And(snapshot_pending,snapshot_epoch==current_epoch,next_epoch==current_epoch,snapshot_epoch==next_epoch),z3.And(snapshot_pending,snapshot_epoch==current_epoch,next_epoch>current_epoch)),
 ('post-retirement-old-snapshot-cannot-admit',z3.And(retire,snapshot_epoch==current_epoch,snapshot_pending,z3.And(snapshot_pending,snapshot_epoch==next_epoch)),z3.And(snapshot_pending,z3.Not(current_pending),snapshot_epoch==current_epoch),z3.And(retire,snapshot_epoch==current_epoch)),
]
cases=[]
for name,violation,negative,positive in checks:
 results=[]
 for formula,expected in [(violation,z3.unsat),(negative,z3.sat),(positive,z3.sat)]:
  solver=z3.Solver();solver.set(timeout=10000);solver.add(formula);retained_smt=solver.sexpr();result=solver.check()
  if result!=expected:raise RuntimeError(name+': '+str(result))
  replay=z3.Solver();replay.set(timeout=10000);replay.from_string(retained_smt);replayed=replay.check()
  if replayed!=expected:raise RuntimeError('Retained formula replay failed')
  results.append({'result':str(result),'smt':retained_smt,'replayResult':str(replayed),'witness':str(solver.model()) if result==z3.sat else None})
 cases.append({'id':name,'violation':results[0],'negativeControl':results[1],'positive':results[2]})
paths=[Path(__file__)]
receipt={'status':'conditional-proof-passed','solverVersion':z3.get_version_string(),'sourceDigests':{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths},'cases':cases,'scope':'Abstract single-lease retirement/snapshot algebra with arbitrary integer epochs. Retirement requires absence of retained reader locks and strictly advances the authoritative epoch. Admission checks epoch equality after shared-lock acquisition. Snapshot-visible pending state alone has a SAT counterexample after terminal retirement. A rolled-back transactional epoch with strictly advanced non-MVCC generation refuses admission, including fresh snapshots; this models conservative closure, not a recovery implementation. Premises: serialized shared/exclusive coordinator participation, truthful native snapshot epoch, non-MVCC current epoch, immutable enrolled identity, no epoch reuse, trusted publication drain before retirement, and all admission routes checking the fence. This does not prove actual SQL ordering, native isolation, compiler/runtime refinement, rollback/recovery, multi-lease custody, crashes or backend acceptance. The authored PostgreSQL 17.9 spike has separately tested scoped retirement evidence; this algebra does not verify that implementation.'}
Path('docs/helix/04-build/evidence/security/publication-retirement-formal.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'status':receipt['status'],'checks':len(cases)}))
