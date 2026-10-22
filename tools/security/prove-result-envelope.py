"""Conditional bounded envelope analysis. No Rust/SQL/native refinement claim."""
import hashlib
import importlib.util
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
SELF = ROOT / 'tools/security/prove-result-envelope.py'
if Path.cwd().resolve() != ROOT or Path(__file__).resolve() != SELF:
    raise RuntimeError('Unknown proof workspace/source')
DESIGN = ROOT / 'docs/helix/02-design/spikes/SPIKE-010-security-result-coverage.md'
OWNER = Path('/Users/erik/Projects/weft/crates/weft-core/src')
spec = importlib.util.find_spec('z3')
if spec is None or spec.origin is None:
    raise RuntimeError('Configured solver is unavailable')
solver_root = Path(spec.origin).parent
paths = [SELF, DESIGN, Path(sys.executable).resolve()]
paths += [ROOT / 'docs/helix/02-design/contracts' / name for name in
          ['CONTRACT-062-security-semantics.md', 'CONTRACT-063-security-enforcement.md']]
paths += [OWNER / (name + '.rs') for name in
          ['security_composition', 'security_literals', 'security_query_profile',
           'security_query_uses', 'security_scan_obligations', 'security_lowering']]
paths += sorted(p for p in solver_root.rglob('*')
                if p.is_file() and '__pycache__' not in p.parts)
captured = {str(p): p.read_bytes() for p in paths}
sha = lambda b: hashlib.sha256(b).hexdigest()
import z3

checks = []

def check(identity, formula, expected, scope):
    solver = z3.Solver()
    solver.set(timeout=10000)
    solver.add(formula)
    # Capture declarative input before check() can add model-converter commands.
    retained_formula = solver.sexpr()
    observed = str(solver.check())
    context = z3.Context()
    replay = z3.Solver(ctx=context)
    replay.set(timeout=10000)
    replay.from_string(retained_formula)
    replay_result = str(replay.check())
    item = {'id': identity, 'expected': expected, 'observed': observed,
            'scope': scope, 'formula': retained_formula,
            'replayResult': replay_result}
    if observed == 'sat':
        item['counterexample'] = str(solver.model())
    checks.append(item)
    if observed != expected or replay_result != expected:
        raise RuntimeError(f'{identity}: {observed}/{replay_result}, expected {expected}')

def model(n):
    # Truth 0=false, 1=true, 2=unknown. Class 0=original, 1=withheld,
    # 2..n+1=abstract, already normalized exact transform identities.
    truth = [z3.Int(f'p{i}_truth') for i in range(n)]
    present = [z3.Bool(f'p{i}_disclosure') for i in range(n)]
    kinds = [z3.Int(f'p{i}_class') for i in range(n)]
    required, forbidden = z3.Ints('require_truth forbid_truth')
    protected = z3.Bool('protected')
    bounds = z3.And(*[z3.And(t >= 0, t <= 2) for t in truth + [required, forbidden]],
                    *[z3.And(k >= 0, k <= n + 1) for k in kinds])
    unknown = z3.Or(*[t == 2 for t in truth + [required, forbidden]])
    decision = z3.And(z3.Not(unknown), z3.Or(*[t == 1 for t in truth]),
                      required == 1, forbidden == 0)
    active = [z3.And(t == 1, p) for t, p in zip(truth, present)]
    any_active = z3.Or(*active)
    withheld = z3.Or(*[z3.And(a, k == 1) for a, k in zip(active, kinds)])
    transformed = z3.Or(*[z3.And(a, k >= 2) for a, k in zip(active, kinds)])
    selected = z3.IntVal(2)
    for a, k in reversed(list(zip(active, kinds))):
        selected = z3.If(z3.And(a, k >= 2), k, selected)
    conflict = z3.And(transformed, z3.Or(*[
        z3.And(a, k >= 2, k != selected) for a, k in zip(active, kinds)]))
    release = z3.And(decision, z3.Or(any_active, z3.Not(protected)),
                     z3.Or(withheld, z3.Not(conflict)))
    outcome = z3.If(withheld, 1, z3.If(transformed, selected, 0))
    envelope = z3.Or(z3.And(outcome == 0, z3.Not(protected)), *[
        z3.And(p, k == outcome) for p, k in zip(present, kinds)])
    return locals()

for n in [1, 4, 16, 254]:
    m = model(n)
    scope = {'permitRules': n, 'requireRules': 1, 'forbidRules': 1,
             'literalEquality': 'assumed exact normalized class identity',
             'presence': 'not modeled', 'nativeExecution': False}
    check(f'envelope-contains-composed-{n}',
          z3.And(m['bounds'], m['release'], z3.Not(m['envelope'])), 'unsat', scope)
    check(f'unknown-never-releases-{n}',
          z3.And(m['bounds'], m['unknown'], m['release']), 'unsat', scope)
    check(f'withheld-dominates-{n}',
          z3.And(m['bounds'], m['release'], m['withheld'], m['outcome'] != 1),
          'unsat', scope)
    for outcome in [0, 1, 2]:
        check(f'nonvacuous-release-{n}-outcome-{outcome}',
              z3.And(m['bounds'], m['release'], m['outcome'] == outcome,
                     m['protected'], m['present'][0], m['truth'][0] == 1,
                     m['kinds'][0] == outcome,
                     *[t == 0 for t in m['truth'][1:]]), 'sat',
              {**scope, 'kind': 'nonvacuity witness'})

m = model(4)
scope = {'permitRules': 4, 'requireRules': 1, 'forbidRules': 1,
         'nativeExecution': False, 'kind': 'deliberate unsafe mutant'}
# A single convenient permit's disclosure cannot stand in for all sources.
check('mutant-first-permit-only-coverage', z3.And(m['bounds'], m['release'],
      m['outcome'] >= 2, m['present'][0], m['kinds'][0] != m['outcome']), 'sat', scope)
weak_decision = z3.And(z3.Or(*[t == 1 for t in m['truth']]),
                       m['required'] == 1, m['forbidden'] == 0)
check('mutant-omit-unknown-rule', z3.And(m['bounds'], weak_decision,
      m['unknown'], m['any_active'], z3.Not(m['conflict'])), 'sat', scope)
check('mutant-envelope-original-choice', z3.And(m['bounds'], m['release'],
      m['withheld'], z3.Not(m['protected'])), 'sat', scope)
check('mutant-protected-default-original', z3.And(m['bounds'], m['decision'],
      m['protected'], z3.Not(m['any_active'])), 'sat', scope)

# One abstract omission sanity check, without pretending to model scan,
# self-join, action or revision extraction from actual Rust plans.
required = [z3.Bool('required0'), z3.Bool('required1')]
supplied = [z3.BoolVal(True), z3.BoolVal(False)]
exact = z3.And(*[r == s for r, s in zip(required, supplied)])
check('mutant-abstract-inventory-omission', z3.And(*required, z3.Not(exact)), 'sat',
      {'kind': 'abstract two-coordinate omission sanity check',
       'ownerExtractionQualified': False, 'nativeExecution': False})

for path, raw in captured.items():
    if Path(path).read_bytes() != raw:
        raise RuntimeError('Proof source changed: ' + path)
receipt = {'id': 'result-envelope-proof', 'status': 'passed',
           'solver': {'name': 'Z3', 'version': z3.get_version_string()},
           'command': [sys.executable, str(SELF.relative_to(ROOT))],
           'sources': {p: sha(b) for p, b in captured.items()},
           'sourcesUnchanged': True, 'checks': checks,
           'scope': 'conditional bounded abstract composition and coverage algebra',
           'ownerImplementationQualified': False, 'nativeImplementationQualified': False,
           'acceptanceCasesPromoted': []}
destination = ROOT / 'docs/helix/04-build/evidence/security/result-envelope-proof.json'
destination.write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps({'status': 'passed', 'checks': len(checks),
                  'solver': receipt['solver'], 'acceptanceCasesPromoted': []}))
