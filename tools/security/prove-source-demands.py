"""Conditional finite source/scope composition laws, not Rust/native refinement."""
import hashlib, json, sys
from pathlib import Path
import z3

ROOT = Path('/Users/erik/.codex/worktrees/1598/umf')
SELF = ROOT / 'tools/security/prove-source-demands.py'
OWNER = Path('/Users/erik/Projects/weft')
if Path.cwd().resolve() != ROOT or Path(__file__).resolve() != SELF or len(sys.argv) != 1:
    raise RuntimeError('Unknown exact proof invocation')
paths = [SELF, ROOT / 'docs/helix/02-design/spikes/security/source-demand-binding-v0.1.md',
         OWNER / 'crates/weft-core/src/security_obligation_sources.rs',
         OWNER / 'crates/weft-core/src/security_semantic_coverage.rs']
frozen = {str(p): p.read_bytes() for p in paths}

# Two concrete source instances, two scopes, two complete candidate alternatives.
# Supplied evidence is hypothetical here; real evidence admission is unfinished.
x00, x01, x10, x11 = z3.Bools('source0_capA source0_capB source1_capA source1_capB')
whole = z3.Or(z3.And(x00, x10), z3.And(x01, x11))
fragment_union = z3.And(z3.Or(x00, x01), z3.Or(x10, x11))
diagonal = z3.And(x00, z3.Not(x01), z3.Not(x10), x11)
a0, b0, a1, b1 = z3.Bools('scope0_capA scope0_capB scope1_capA scope1_capB')
per_scope = z3.And(z3.Or(a0, b0), z3.Or(a1, b1))
global_cap = z3.Or(z3.And(a0, a1), z3.And(b0, b1))
disjoint = z3.And(a0, z3.Not(b0), z3.Not(a1), b1)
primary, original, application, admitted = z3.Bools('primary original application admitted')
r00, r01, r10, r11 = z3.Bools('required00 required01 required10 required11')
d00, d01, d10, d11 = z3.Bools('declared00 declared01 declared10 declared11')
required = z3.And(r00, z3.Not(r01), z3.Not(r10), r11)
swapped = z3.And(z3.Not(d00), d01, d10, z3.Not(d11))
exact = z3.And(r00 == d00, r01 == d01, r10 == d10, r11 == d11)
marginals = z3.And(z3.Or(r00, r01) == z3.Or(d00, d01),
                   z3.Or(r10, r11) == z3.Or(d10, d11),
                   z3.Or(r00, r10) == z3.Or(d00, d10),
                   z3.Or(r01, r11) == z3.Or(d01, d11))
native, correspondence = z3.Bools('native correspondence')
checks = [
    ('whole-capability-before-source-quantifier', z3.And(admitted == whole, diagonal, admitted),
     z3.And(admitted == fragment_union, diagonal, admitted), z3.And(admitted == whole, x00, x10, admitted)),
    ('different-scopes-may-use-different-complete-capabilities', z3.And(admitted == per_scope, disjoint, z3.Not(admitted)),
     z3.And(admitted == global_cap, disjoint, z3.Not(admitted)), z3.And(admitted == per_scope, disjoint, admitted)),
    ('original-use-needs-primary-original-and-application',
     z3.And(admitted == z3.And(primary, original, application), primary, application, z3.Not(original), admitted),
     z3.And(admitted == z3.And(primary, application), primary, application, z3.Not(original), admitted),
     z3.And(admitted == z3.And(primary, original, application), primary, original, application, admitted)),
    ('equal-marginals-cannot-substitute-scoped-edges', z3.And(admitted == exact, required, swapped, admitted),
     z3.And(admitted == marginals, required, swapped, admitted), z3.And(admitted == exact, required, d00, z3.Not(d01), z3.Not(d10), d11, admitted)),
    ('source-correspondence-cannot-discharge-native-execution',
     z3.And(admitted == z3.And(correspondence, native), correspondence, z3.Not(native), admitted),
     z3.And(admitted == correspondence, correspondence, z3.Not(native), admitted),
     z3.And(admitted == z3.And(correspondence, native), correspondence, native, admitted)),
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
           'scope': 'Five conditional finite Boolean laws: two sources/two capabilities within one scope, two scopes with disjoint complete alternatives, three original-use conjuncts, exact two-by-two scoped edges versus their marginals, and independent native execution. Exact owner extraction, arbitrary cardinality/quantifiers, profile authentication, native case sufficiency and enforcement are not proved.'}
out = ROOT / 'docs/helix/04-build/evidence/security/source-demands-formal.json'
if out.exists():
    previous = out.read_bytes(); archive = out.parent / 'archive'; archive.mkdir(exist_ok=True)
    (archive / ('source-demands-formal-' + hashlib.sha256(previous).hexdigest() + '.json')).write_bytes(previous)
out.write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps({'status': receipt['status'], 'laws': len(rows), 'formulas': len(rows) * 3}))
