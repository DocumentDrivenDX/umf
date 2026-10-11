"""Inductive finite-history cut laws; no native producer/refinement claim."""
import hashlib, json, uuid, zipfile
from pathlib import Path
import z3

source = Path(__file__).resolve()
truss = Path('/private/tmp/truss-security-main-integration')
paths = [source, truss/'scripts/python-catalog-cut-worker.py',
         truss/'scripts/check-python-catalog-cut-native.py',
         truss/'packages/postgresql/native/security-query-source-census-pg16.sql']
frozen = {str(path): path.read_bytes() for path in paths}
L, S, E, R, t = z3.Ints('barrier snapshot execution final_release step_time')
kind = z3.Int('step_kind')  # 0 unrelated, 1 source commit, 2 authority commit
src, auth, next_src, next_auth = z3.Ints('source authority next_source next_authority')
sg, ag, next_sg, next_ag = z3.Ints('source_generation authority_generation next_source_generation next_authority_generation')
initial_src, initial_auth = z3.Ints('captured_source captured_authority')
initial_sg, initial_ag = z3.Ints('captured_source_generation captured_authority_generation')
order = [0 <= L, L <= S, S < E, E < R, S < t, t <= E, kind >= 0, kind <= 2]
transition = [z3.Implies(kind != 1, z3.And(next_src == src, next_sg == sg)),
              z3.Implies(kind == 1, next_sg == sg + 1),
              z3.Implies(kind != 2, z3.And(next_auth == auth, next_ag == ag)),
              z3.Implies(kind == 2, next_ag == ag + 1)]
source_closed = z3.Implies(kind == 1, z3.Or(t < L, t >= R))
authority_closed = z3.Implies(kind == 2, z3.Or(t < L, t >= R))
invariant = [src == initial_src, auth == initial_auth, sg == initial_sg, ag == initial_ag]
violation = z3.Or(next_src != initial_src, next_auth != initial_auth,
                  next_sg != initial_sg, next_ag != initial_ag)
cases = []
def add(name, expected, assumptions): cases.append((name, expected, assumptions))
# Base establishes the same invariant, not merely a vacuous barrier predicate.
add('fresh-original-snapshot-base', 'unsat', invariant + [z3.Or(src != initial_src, auth != initial_auth, sg != initial_sg, ag != initial_ag)])
add('complete-source-authority-cut-inductive-step', 'unsat', order + transition + invariant + [source_closed, authority_closed, violation])
add('unrelated-steps-positive-witness', 'sat', order + transition + invariant + [source_closed, authority_closed, kind == 0, z3.Not(violation)])
add('source-only-cut-authority-counterexample', 'sat', order + transition + invariant + [source_closed, kind == 2, next_auth != auth, violation])
add('authority-only-cut-source-counterexample', 'sat', order + transition + invariant + [authority_closed, kind == 1, next_src != src, violation])
add('early-final-release-counterexample', 'sat', [0 <= L, L <= S, S < R, R <= t, t <= E, kind == 1] + transition + invariant + [source_closed, authority_closed, next_src != src, violation])
# Image equality does not establish exclusion of intervening commits/calls.
c1, c2, before, middle, after = z3.Ints('first_commit second_commit before_image middle_image after_image')
A = z3.Int('after_capture')
state_at = lambda at: z3.If(at >= c2, after, z3.If(at >= c1, middle, before))
add('aba-endpoint-image-equality-misses-intermediate-call', 'sat', [0 <= S, S < c1, c1 < E, E < c2, c2 <= A, before == after, before != middle, state_at(S) == state_at(A), state_at(E) != state_at(S)])
g0, g1, g2 = z3.Ints('before_generation middle_generation after_generation')
add('nonrewinding-generation-detects-two-commit-aba', 'unsat', [g1 == g0 + 1, g2 == g1 + 1, g0 == g2])
check, change, observed_gen, execution_gen = z3.Ints('generation_check change_commit observed_generation execution_generation')
generation_at = lambda at: z3.If(at >= change, g0 + 1, g0)
add('generation-check-without-held-cut-has-check-use-race', 'sat', [0 <= check, check < change, change < E, observed_gen == generation_at(check), execution_gen == generation_at(E), execution_gen != observed_gen])
D = z3.Int('final_disclosure')
disclosure_order = [0 <= L, L <= S, S < E, E <= D, D < R, S < t, t <= D, kind >= 0, kind <= 2]
add('complete-cut-through-final-disclosure-inductive-step', 'unsat', disclosure_order + transition + invariant + [source_closed, authority_closed, violation])
add('release-after-call-before-disclosure-counterexample', 'sat', [0 <= L, L <= S, S < E, E < R, R <= t, t <= D, kind == 2] + transition + invariant + [source_closed, authority_closed, next_auth != auth, violation])
add('fresh-base-is-required-inherited-snapshot-counterexample', 'sat', order + transition + [source_closed, authority_closed, kind == 0, src != initial_src, auth == initial_auth, sg == initial_sg, ag == initial_ag, violation])
# A truthful closed-world transition relation is independently necessary.
add('untracked-source-change-breaks-induction', 'sat', order + invariant + [kind == 0, source_closed, authority_closed, next_src != src, next_auth == auth, next_sg == sg, next_ag == ag, violation])
queries = []
for name, expected, assumptions in cases:
    solver = z3.Solver(); solver.set(timeout=10000); solver.add(*assumptions)
    smt = solver.to_smt2(); actual = str(solver.check())
    if actual != expected: raise RuntimeError(name + ': ' + actual)
    context = z3.Context(); replay = z3.Solver(ctx=context); replay.set(timeout=10000); replay.from_string(smt)
    if str(replay.check()) != expected: raise RuntimeError(name + ': replay differs')
    queries.append({'id': name, 'expected': expected, 'result': actual,
                    'smt2': smt, 'freshContextReplay': str(replay.check()),
                    'witness': str(solver.model()) if actual == 'sat' else None})
if any(Path(path).read_bytes() != raw for path, raw in frozen.items()):
    raise RuntimeError('Sources changed during proof')
folder = Path('docs/helix/04-build/evidence/security/catalog-cut-history-formal') / str(uuid.uuid4())
folder.mkdir(parents=True)
receipt = {'status': 'conditional-induction-passed', 'z3Version': z3.get_version_string(),
           'sourceDigests': {path: hashlib.sha256(raw).hexdigest() for path, raw in frozen.items()}, 'queries': queries,
           'induction': {'base': 'At the truthful fresh snapshot, captured and actual source/authority values and generations agree.',
                         'step': 'For an arbitrary next event in (snapshot, execution], the complete commit barrier excludes source/authority commits. The closed transition relation preserves both values and generations.',
                         'conclusion': 'By mathematical induction, every finite number of ordered events in that interval preserves the invariant. No bound on the number of events is imposed. A separate arbitrary-step query instantiates the interval through final_disclosure, requiring execution <= final_disclosure < final_release; the same induction preserves the state through that event. Disclosure using that state remains a premise.'},
           'scope': 'Conditional abstract finite-event history with arbitrary integer source/authority values and nonrewinding integer generations. Snapshot freshness, truthful state/transition coverage, atomic commit-time barriers covering both source and authority until final release, event ordering and execution using that actual state are premises. Induction is over the stated closed transition relation; SMT checks base and arbitrary step, not a native implementation. No SQL/MVCC/advisory/driver refinement, all-writer coverage, generation authenticity/overflow behavior, provider authentication, physical lifecycle/handback or backend acceptance. Endpoint equality ABA and generation check/use race are independent SAT counterexamples.'}
(folder/'proof.json').write_text(json.dumps(receipt, indent=2)+'\n')
with zipfile.ZipFile(folder/'sources.zip','w',zipfile.ZIP_DEFLATED) as archive:
    for path, raw in frozen.items(): archive.writestr(path.lstrip('/'), raw)
print(json.dumps({'status': receipt['status'], 'queries': len(queries), 'evidence': str(folder)}))
