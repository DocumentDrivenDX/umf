"""Conditional chunk arithmetic/correspondence; not runtime/SQL/authority refinement."""
import hashlib,json,uuid,zipfile
from pathlib import Path
import z3
truss=Path('/private/tmp/truss-security-main-integration')
paths=[Path(__file__),*[truss/p for p in ['packages/pg-runtime/src/security-source-census.ts','packages/pg-runtime/src/native-query.ts','packages/pg-runtime/src/wire.ts','packages/pg-runtime/src/journal.ts','packages/postgresql/native/security-query-source-census.sql']]]
frozen={str(p):p.read_bytes() for p in paths}
total,offset,position,left,right=z3.Ints('total_bytes offset byte_position left_chunk right_chunk')
width=z3.IntVal(32768);maximum=z3.IntVal(16777216)
end=lambda k:z3.If((k+1)*width<total,(k+1)*width,total)
valid=[total>0,total<=maximum]
step=z3.If(width<total-offset,width,total-offset)
chunk=position/width
source,received,current=[z3.Array(name,z3.IntSort(),z3.IntSort()) for name in ['source_byte','received_byte','current_source_byte']]
byte,native_chunk,local_byte=z3.Ints('byte native_chunk local_byte')
pieces=z3.Function('native_chunk_bytes',z3.IntSort(),z3.ArraySort(z3.IntSort(),z3.IntSort()))
# Native chunk identity and the assembler copy relation are separate premises.
faithful=z3.ForAll([native_chunk,local_byte],z3.Implies(z3.And(native_chunk>=0,local_byte>=0,local_byte<width,native_chunk*width+local_byte<total),pieces(native_chunk)[local_byte]==source[native_chunk*width+local_byte]))
copied=z3.ForAll([byte],z3.Implies(z3.And(byte>=0,byte<total),received[byte]==pieces(byte/width)[byte%width]))
terminal=z3.Bool('original_end_of_cursor');completed=z3.And(offset==total,terminal)
cases=[
 ('next-chunk-is-positive-and-never-overshoots','unsat',valid+[offset>=0,offset<total,z3.Or(step<=0,offset+step>total)]),
 ('distinct-native-chunks-do-not-overlap','unsat',valid+[left>=0,right>=0,left!=right,position>=left*width,position<end(left),position>=right*width,position<end(right)]),
 ('complete-native-partition-covers-every-image-byte','unsat',valid+[position>=0,position<total,z3.Or(chunk<0,chunk>=(total+width-1)/width,position<chunk*width,position>=end(chunk))]),
 ('faithful-complete-byte-correspondence','unsat',valid+[faithful,copied,completed,position>=0,position<total,received[position]!=source[position]]),
 ('prefix-or-missing-terminal-cannot-release','unsat',valid+[completed,z3.Or(offset<total,z3.Not(terminal))]),
 ('shape-and-completion-alone-allow-forged-source-bytes','sat',valid+[copied,completed,position>=0,position<total,received[position]!=source[position]]),
 ('truthful-materialized-snapshot-does-not-prove-current-execution-source','sat',valid+[faithful,copied,completed,position>=0,position<total,current[position]!=source[position]]),
 ('byte-complete-image-without-native-terminal-is-not-release','sat',valid+[offset==total,z3.Not(terminal),z3.Not(completed)]),
]
queries=[]
for name,expect,formula in cases:
 solver=z3.Solver();solver.set(timeout=10000);solver.add(*formula);smt=solver.to_smt2();outcome=str(solver.check())
 if outcome!=expect:raise RuntimeError(name+': '+outcome)
 ctx=z3.Context();replay=z3.Solver(ctx=ctx);replay.set(timeout=10000);replay.from_string(smt);again=str(replay.check())
 if again!=expect:raise RuntimeError('Replay differs: '+name)
 queries.append({'id':name,'expected':expect,'result':outcome,'freshContextReplay':again,'smt2':smt,'witness':str(solver.model()) if outcome=='sat' else None})
pins={p:hashlib.sha256(b).hexdigest() for p,b in frozen.items()}
if any(Path(p).read_bytes()!=b for p,b in frozen.items()):raise RuntimeError('Proof input changed')
folder=Path('docs/helix/04-build/evidence/security/census-chunk-transport-formal')/str(uuid.uuid4());folder.mkdir(parents=True)
(folder/'proof.json').write_text(json.dumps({'status':'conditional-proof-passed','z3Version':z3.get_version_string(),'sourceDigests':pins,'queries':queries,'scope':'Unbounded integer chunk arithmetic within16MiB/32768-byte constants and conditional byte-array correspondence. Faithful per-chunk materialized original observation, the assembler byte-copy relation, guarded completion and connection/SQL custody remain premises. Not an executable TypeScript/Buffer/TextDecoder or native cursor/SQL/journal refinement. No driver/source/issuer authentication, observer semantic completeness/injectivity, heap/CPU bound, current execution/authority cut, concurrent DDL, participating writer, Python16.15 port or graph/backend admission proof. SAT controls show complete shape permits forged bytes and a truthful materialized snapshot can differ from execution source.'},indent=2)+'\n')
with zipfile.ZipFile(folder/'sources.zip','w',zipfile.ZIP_DEFLATED) as archive:
 for i,(p,b) in enumerate(frozen.items()):archive.writestr(str(i)+'/'+Path(p).name,b)
print(json.dumps({'status':'conditional-proof-passed','queries':len(queries),'evidence':str(folder)}))
