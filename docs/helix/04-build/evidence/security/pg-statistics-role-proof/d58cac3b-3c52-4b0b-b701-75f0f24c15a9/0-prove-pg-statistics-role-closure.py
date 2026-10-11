"""Conditional selected-function/reachable-role risk algebra, not SQL refinement."""
from pathlib import Path
import hashlib,json,uuid
from z3 import *
root=Path.cwd();paths=[Path(__file__),Path('tools/security/pg-private-diagnostics.py'),Path('tests/security/native/pg-raw-membership.py'),Path('tests/security/native/pg-raw-membership.sql')];raw={p:p.read_bytes() for p in paths}
out=root/'docs/helix/04-build/evidence/security/pg-statistics-role-proof'/str(uuid.uuid4());out.mkdir(parents=True)
Role=DeclareSort('Role');Routine=DeclareSort('Routine')
selected=Function('selected',Routine,BoolSort());usable=Function('usable',Role,BoolSort());settable=Function('settable',Role,BoolSort());admin=Function('admin',Role,BoolSort())
execute=Function('execute',Role,Routine,BoolSort());owner=Function('owner',Role,Routine,BoolSort());grant=Function('grant',Role,Routine,BoolSort())
r=Const('r',Role);f=Const('f',Routine);actor,bridge=Consts('ordinary_actor bridge',Role);getter=Const('snapshot_getter',Routine)
reach=lambda v:Or(usable(v),settable(v),admin(v));risk=lambda v,t:Or(execute(v,t),owner(v,t),grant(v,t))
closed=Not(Exists([r,f],And(selected(f),reach(r),risk(r,f))))
rows=[]
def check(name,formula,expected):
 s=Solver();s.add(formula);smt=s.to_smt2();actual=str(s.check());assert actual==expected,(name,actual)
 ctx=Context();replay=Solver(ctx=ctx);replay.add(parse_smt2_string(smt,ctx=ctx));assert str(replay.check())==expected
 rows.append({'name':name,'expected':expected,'result':actual,'smt2':smt,'freshContextReplay':expected,'witness':str(s.model()) if actual=='sat' else None})
check('closed selected family excludes reachable execution',And(closed,selected(getter),reach(bridge),execute(bridge,getter)),'unsat')
check('closed selected family excludes reachable routine ownership',And(closed,selected(getter),reach(actor),owner(actor,getter)),'unsat')
check('closed selected family excludes reachable grant restoration',And(closed,selected(getter),reach(bridge),grant(bridge,getter)),'unsat')
noRestoration=ForAll([r,f],And(Not(owner(r,f)),Not(grant(r,f))))
onlyGetter=ForAll(f,selected(f)==(f==getter))
onlyBridgeExecute=ForAll(r,execute(r,getter)==(r==bridge))
check('original actor execute alone misses SET-only bridge',And(noRestoration,onlyGetter,onlyBridgeExecute,actor!=bridge,selected(getter),Not(execute(actor,getter)),Not(usable(bridge)),settable(bridge),Not(admin(bridge)),execute(bridge,getter),Not(owner(bridge,getter)),Not(grant(bridge,getter)),Not(closed)),'sat')
check('execute-only check misses original owner restoration',And(selected(getter),usable(actor),Not(execute(actor,getter)),owner(actor,getter),grant(actor,getter),Not(closed)),'sat')
check('USAGE and SET alone miss ADMIN-only widening authority',And(noRestoration,onlyGetter,onlyBridgeExecute,actor!=bridge,selected(getter),Not(usable(bridge)),Not(settable(bridge)),admin(bridge),execute(bridge,getter),Not(owner(bridge,getter)),Not(grant(bridge,getter)),Not(execute(actor,getter)),Not(closed)),'sat')
check('populated selected family can be closed',And(closed,selected(getter),usable(actor),settable(bridge),actor!=bridge),'sat')
if any(p.read_bytes()!=b for p,b in raw.items()):raise RuntimeError('Proof source changed')
pins=[]
for i,(p,b) in enumerate(raw.items()):
 archive=str(i)+'-'+p.name;(out/archive).write_bytes(b);pins.append({'path':str(p),'archive':archive,'sha256':hashlib.sha256(b).hexdigest()})
proof={'status':'passed','z3Version':get_version_string(),'queries':rows,'sourcePreimages':pins,'scope':'First-order selected-family/reachable-role risk exclusion algebra','premises':['Selected routine and complete native usable/SET/ADMIN-option role predicates are faithful and current','Native EXECUTE, ownership and grant-option predicates are correct','Restoration/execution authority is conservatively represented by the three risk flags','Fixed fixture native controls independently demonstrate relevant populations; not a theorem connecting this model to SQL'],'excluded':['PostgreSQL privilege algorithm refinement','Owner routine source or wrappers/casts/operators closure','Complete diagnostics noninterference','Concurrent DDL/role/assignment coordination','Compiler lowering or public backend admission'],'acceptancePromoted':False}
(out/'proof.json').write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps({'status':'passed','queries':len(rows),'proof':str(out/'proof.json')}))
