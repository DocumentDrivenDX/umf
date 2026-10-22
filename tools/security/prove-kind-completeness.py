"""Kind-instance completeness design laws; separate private instance matcher is conditional."""
import hashlib,json,sys
from pathlib import Path
import z3
ROOT=Path('/Users/erik/.codex/worktrees/1598/umf')
SELF=ROOT/'tools/security/prove-kind-completeness.py'
OWNER=Path('/Users/erik/Projects/weft')
if Path.cwd().resolve()!=ROOT or Path(__file__).resolve()!=SELF or len(sys.argv)!=1:
    raise RuntimeError('Unknown exact proof invocation')
paths=[SELF,ROOT/'docs/helix/02-design/spikes/security/backend-requirement-issuer-v0.2.md',OWNER/'crates/weft-core/src/security_obligation_matching.rs']
frozen={str(p):p.read_bytes() for p in paths}
admitted=z3.Bool('admitted')
codec_a,privacy_a,codec_b,privacy_b=z3.Bools('codec_a privacy_a codec_b privacy_b')
complete=z3.Or(z3.And(codec_a,privacy_a),z3.And(codec_b,privacy_b))
# Existing source-only alternatives see a Semantic atom of either kind.
source_presence=z3.Or(codec_a,privacy_a,codec_b,privacy_b)
split=z3.And(codec_a,z3.Not(privacy_a),z3.Not(codec_b),privacy_b)
a0,b0,a1,b1=z3.Bools('all_instances_scope0_a all_instances_scope0_b all_instances_scope1_a all_instances_scope1_b')
per_scope=z3.And(z3.Or(a0,b0),z3.Or(a1,b1))
global_origin=z3.Or(z3.And(a0,a1),z3.And(b0,b1))
distributed=z3.And(a0,z3.Not(b0),z3.Not(a1),b1)
native=z3.Bool('native')
checks=[
 ('same-source-kinds-cannot-fragment-across-origins',z3.And(admitted==complete,split,admitted),z3.And(admitted==source_presence,split,admitted),z3.And(admitted==complete,codec_a,privacy_a,z3.Not(codec_b),z3.Not(privacy_b),admitted)),
 ('different-scopes-may-use-different-instance-complete-origins',z3.And(admitted==per_scope,distributed,z3.Not(admitted)),z3.And(admitted==global_origin,distributed,z3.Not(admitted)),z3.And(admitted==per_scope,distributed,admitted)),
 ('instance-completeness-cannot-discharge-native-evidence',z3.And(admitted==z3.And(complete,native),codec_a,privacy_a,z3.Not(native),admitted),z3.And(admitted==complete,codec_a,privacy_a,z3.Not(native),admitted),z3.And(admitted==z3.And(complete,native),codec_a,privacy_a,native,admitted)),
]
rows = []
for name, violation, weak, population in checks:
    row = {'id': name, 'covers': ['US-056-AC7', 'US-056-AC10']}
    for kind, formula, expected in [('violation', violation, 'unsat'), ('negativeControl', weak, 'sat'), ('positivePopulation', population, 'sat')]:
        solver = z3.Solver(); solver.set(timeout=10000); solver.add(formula)
        smt = solver.sexpr(); observed = str(solver.check())
        ctx = z3.Context(); replay = z3.Solver(ctx=ctx); replay.set(timeout=10000); replay.from_string(smt)
        actual = str(replay.check())
        if observed != expected or actual != expected: raise RuntimeError(name + '/' + kind)
        row[kind] = {'smt': smt, 'result': observed, 'replayResult': actual,
                     'witness': str(solver.model()) if expected == 'sat' else None}
    rows.append(row)
if any(Path(p).read_bytes() != data for p, data in frozen.items()): raise RuntimeError('Sources changed')
receipt = {'status': 'conditional-proof-passed', 'solverVersion': z3.get_version_string(),
           'sourceDigests': {p: hashlib.sha256(data).hexdigest() for p, data in frozen.items()},
           'sourcesUnchanged': True, 'cases': rows, 'nativeImplementationQualified': False,
           'acceptanceCasesPromoted': [],
           'scope': 'Three conditional finite kind-completeness design laws. The source-only negative control models a limitation of the unchanged source-level RequiredPremise0.1. New typed owner extraction, profile issuance, implementation correspondence, arbitrary cardinality, Rust refinement and native enforcement are not proved.'}
out = ROOT / 'docs/helix/04-build/evidence/security/kind-completeness-formal.json'
if out.exists():
    previous = out.read_bytes(); archive = out.parent / 'archive'; archive.mkdir(exist_ok=True)
    (archive / ('kind-completeness-formal-' + hashlib.sha256(previous).hexdigest() + '.json')).write_bytes(previous)
out.write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps({'status': receipt['status'], 'laws': len(rows), 'formulas': len(rows) * 3}))
