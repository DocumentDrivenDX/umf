"""Conditional arithmetic refinement of Truss's actual inventory wire-size gate."""
import hashlib,json
from pathlib import Path
import z3
self_path=Path('tools/security/prove-inventory-wire-size.py')
if Path(__file__).resolve()!=self_path.resolve():raise RuntimeError('Unknown inventory size proof source')
source=Path('/Users/erik/Projects/truss/packages/umf-bun/src/catalog-complete-assertion-inventory.ts')
frozen={str(path):path.read_bytes() for path in [self_path,source]}
text=frozen[str(source)].decode()
selected=[
 'const limit=4194304;',
 "retainedWireBytes+=Buffer.byteLength(JSON.stringify(value),'utf8');",
 'for(const absence of reconciliation.absent)charge(absence);',
 'const fixedBytes=skeletonBytes+retainedWireBytes+commas-1;',
 'let serializedBytes=fixedBytes+1,previous=-1;',
 'while(previous!==serializedBytes){previous=serializedBytes;serializedBytes=fixedBytes+String(serializedBytes).length;}',
 "if(serializedBytes>limit)throw Error('Complete original inventory capacity exceeded');",
]
if any(text.count(fragment)!=1 for fragment in selected):raise RuntimeError('Selected inventory size implementation changed')
fixed=z3.Int('fixed_utf8_bytes_excluding_count_digits')
premises=[fixed>=1,fixed<=8388608]
def digits(value):
 return z3.If(value<10,1,z3.If(value<100,2,z3.If(value<1000,3,z3.If(value<10000,4,z3.If(value<100000,5,z3.If(value<1000000,6,z3.If(value<10000000,7,8)))))))
x0=fixed+1;x1=fixed+digits(x0);x2=fixed+digits(x1);x3=fixed+digits(x2)
actual=fixed+digits(x2);admitted=x2<=4194304
unbilled=z3.Int('unbilled_source_or_absence_bytes')
queries=[]
cases=[
 ('monotone_recomputations',z3.Or(x1<x0,x2<x1,x3<x2),z3.unsat),
 ('stabilizes_within_three_recomputations',x3!=x2,z3.unsat),
 ('terminal_count_equals_actual_wire_size',x2!=actual,z3.unsat),
 ('admitted_wire_cannot_exceed_limit',z3.And(admitted,actual>4194304),z3.unsat),
 ('oversized_wire_cannot_be_admitted',z3.And(actual>4194304,admitted),z3.unsat),
 ('exact_limit_is_reachable',z3.And(admitted,actual==4194304),z3.sat),
 ('next_byte_is_refused',z3.And(actual==4194305,admitted),z3.unsat),
 ('mutant_missing_repeated_source_or_absence_charge',z3.And(admitted,unbilled>0,unbilled<=4194304,actual+unbilled>4194304),z3.sat),
 ('mutant_missing_count_field_digits',z3.And(fixed<=4194304,actual>4194304),z3.sat),
]
for name,claim,expected in cases:
 solver=z3.Solver();solver.set(timeout=20000);solver.add(*premises,claim);observed=solver.check()
 if observed!=expected:raise RuntimeError(name+': '+str(observed))
 smt=solver.to_smt2();replay=z3.Solver();replay.set(timeout=20000);replay.from_string(smt);replayed=replay.check()
 if replayed!=expected:raise RuntimeError(name+': replay '+str(replayed))
 queries.append({'id':name,'result':str(observed),'replayResult':str(replayed),'smt':smt,'model':str(solver.model()) if observed==z3.sat else None})
unchanged=all(Path(path).read_bytes()==before for path,before in frozen.items())
if not unchanged:raise RuntimeError('Inventory proof sources changed during execution')
receipt={'status':'conditional-proof-passed','solverVersion':z3.get_version_string(),
 'sourceDigests':{path:hashlib.sha256(before).hexdigest() for path,before in frozen.items()},'sourcesUnchanged':unchanged,
 'selectedImplementationFragments':selected,'queries':queries,
 'premises':['Each serialized array constituent is charged exactly once in retainedWireBytes, including repeated source artifacts and each absence row',
 'skeletonBytes contains all non-array payload fields, empty array brackets and a one-digit serializedBytes placeholder; commas counts every array separator exactly once',
 'JSON encoding of each constituent is stable and agrees with its whole-payload encoding; no accessor, mutation, omission or alternate serializer behavior changes those bytes',
 'The positive fixed byte total is at most 8MiB and all JavaScript metadata arithmetic is exact; this bound is a proof premise, not established for all inputs by this script'],
 'scope':'Source-bound conditional proof of final exact integer size arithmetic, fixed-point termination and admission bound. Does not prove faithful charging/JSON encoding premises, complete process memory/work bounds, enclosing report pre-effect reservation, support meaning, native enforcement or publication.',
 'nativeImplementationQualified':False}
target=Path('docs/helix/04-build/evidence/security/inventory-wire-size-formal.json')
target.write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'status':receipt['status'],'queries':len(queries),'unsat':sum(q['result']=='unsat' for q in queries),'sat':sum(q['result']=='sat' for q in queries),'sourcesUnchanged':unchanged}))
