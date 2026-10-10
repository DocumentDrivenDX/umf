"""Reproducible Z3 checks; scopes and assumptions are part of every result."""
import hashlib
import json
from pathlib import Path
import z3

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[4]
results = []


def check(name, violation, assumptions, control, covers, scope, control_assumptions=None, population_constraint=None):
    solver = z3.Solver()
    solver.set(timeout=10000)
    solver.add(*assumptions, violation)
    solver_query = solver.sexpr()
    outcome = solver.check()
    mutant = z3.Solver()
    mutant.set(timeout=10000)
    mutant.add(*(assumptions if control_assumptions is None else control_assumptions), control)
    mutant_query = mutant.sexpr()
    mutant_outcome = mutant.check()
    # Assumptions must admit a positive population, independently of violation.
    population = z3.Solver()
    population.add(*assumptions)
    if population_constraint is not None: population.add(population_constraint)
    population_query = population.sexpr()
    population_outcome = population.check()
    for query, expected in [(solver_query, outcome), (mutant_query, mutant_outcome), (population_query, population_outcome)]:
        replay = z3.Solver(); replay.set(timeout=10000); replay.from_string(query)
        assert replay.check() == expected, name + ": retained formula replay"
    row = {
        "id": name, "covers": covers, "layer": "formal", "scope": scope,
        "assumptions": [str(x) for x in assumptions],
        "counterexampleQuery": solver_query, "result": str(outcome),
        "populationResult": str(population_outcome), "populationQuery": population_query,
        "weakenedControlQuery": mutant_query,
        "weakenedControlResult": str(mutant_outcome),
        "weakenedCounterexample": str(mutant.model()) if mutant_outcome == z3.sat else None,
        "status": "passed" if outcome == z3.unsat and mutant_outcome == z3.sat
        and population_outcome == z3.sat else "failed",
    }
    results.append(row)
    assert row["status"] == "passed", row


permit, required, forbidden, complete = z3.Bools("permit required forbidden complete")
allow = z3.And(permit, required, z3.Not(forbidden), complete)
check("composition-safety", z3.And(allow, z3.Or(z3.Not(required), forbidden)), [],
      z3.And(permit, z3.Not(required)), ["US-079-AC4"], "Unbounded Boolean composition")
check("incomplete-refusal", z3.And(allow, z3.Not(complete)), [],
      z3.And(permit, required, z3.Not(forbidden), z3.Not(complete)),
      ["US-079-AC6"], "Unbounded Boolean complete-cut admission")
old, new, fields, owner_change = z3.Bools("old new fields owner_change")
write = z3.And(old, new, fields, owner_change)
check("write-both-states", z3.And(write, z3.Not(new)), [],
      z3.And(old, fields, owner_change, z3.Not(new)),
      ["US-057-AC1"], "Unbounded Boolean update obligations")

# Conditional native epoch algebra. Source/clock custody and writer participation are premises.
snapshot_epoch, clock_epoch, committed_epoch = z3.Ints("snapshot_epoch clock_epoch committed_epoch")
epoch_admitted = snapshot_epoch == clock_epoch
check("epoch-stale-snapshot-refusal", z3.And(epoch_admitted, snapshot_epoch != clock_epoch),
      [snapshot_epoch >= 0, clock_epoch >= snapshot_epoch],
      z3.And(snapshot_epoch >= 0, snapshot_epoch < clock_epoch),
      ["US-057-AC3", "US-057-AC7"],
      "Unbounded integer equality admission; trusted non-MVCC clock and complete writer protocol assumed")
check("epoch-rollback-gap-refusal", z3.And(committed_epoch == clock_epoch, committed_epoch < clock_epoch),
      [committed_epoch >= 0, clock_epoch >= committed_epoch],
      z3.And(committed_epoch >= 0, committed_epoch < clock_epoch),
      ["US-057-AC7"],
      "Unbounded integer rollback-gap refusal; recovery/availability and installed helper implementation not proven")

# Independent logical, flat and graph formulations. Physical mapping constraints
# are premises, not proof that any installed database satisfies them.
staff, resource = z3.Ints("staff resource")
owners = [z3.Int(f"owner_{r}") for r in range(3)]
active = [[z3.Bool(f"assignment_{s}_{p}") for p in range(2)] for s in range(2)]
flat = [[z3.Bool(f"flat_{s}_{p}") for p in range(2)] for s in range(2)]
graph_owner = [[z3.Bool(f"graph_owner_{r}_{p}") for p in range(2)] for r in range(3)]
graph_assign = [[z3.Bool(f"graph_assignment_{s}_{p}") for p in range(2)] for s in range(2)]
assumptions = [staff >= 0, staff < 2, resource >= 0, resource < 3]
assumptions += [z3.And(o >= -1, o < 2) for o in owners]  # -1 means no owner
assumptions += [flat[s][p] == active[s][p] for s in range(2) for p in range(2)]
assumptions += [graph_assign[s][p] == active[s][p] for s in range(2) for p in range(2)]
assumptions += [graph_owner[r][p] == (owners[r] == p) for r in range(3) for p in range(2)]
logical = z3.Or(*[z3.And(staff == s, resource == r, owners[r] == p, active[s][p])
                  for s in range(2) for r in range(3) for p in range(2)])
relational = z3.Or(*[z3.And(staff == s, resource == r, owners[r] == p, flat[s][p])
                     for p in range(2) for r in range(3) for s in range(2)])
graph = z3.Or(*[z3.And(resource == r, graph_owner[r][p], staff == s, graph_assign[s][p])
                for r in range(3) for p in range(2) for s in range(2)])
wrong_graph = z3.Or(*[z3.And(resource == r, graph_owner[r][p], staff == s, graph_assign[p][s])
                      for r in range(3) for p in range(2) for s in range(2)])
scope = "Finite: 2 Staff, 2 Projects, 3 resources; zero/one owner; complete exact mapped facts"
check("logical-flat-graph-correspondence", z3.Or(logical != relational, logical != graph),
      assumptions, logical != wrong_graph,
      ["US-056-AC1", "US-056-AC2", "US-056-AC10"], scope)
check("assignment-removal", z3.And(logical, z3.And(*[z3.Not(active[s][p])
      for s in range(2) for p in range(2)])), assumptions,
      z3.And(z3.Not(logical), z3.Or(*[owners[r] >= 0 for r in range(3)])),
      ["US-079-AC5", "US-057-AC3"], scope + "; only grant depends on assignment")

# Guard ordering theorem on integer event times. Actual lock realization requires
# native barriers; this theorem alone is conditional on the drain premise.
admit, release, acquire, acknowledge, later = z3.Ints("admit release acquire acknowledge later")
order = [admit < release, acquire >= release, acknowledge >= acquire, later > acknowledge]
check("revocation-drain-order", z3.And(release > acknowledge), order,
      release > acknowledge, ["US-057-AC2"],
      "Unbounded integer event ordering; shared guard release precedes exclusive acquisition",
      [admit < release, acknowledge >= acquire, later > acknowledge])

# Evaluate disclosure rules independently of database types.
protected, disposition = z3.Bools("protected disposition")
disclose = z3.And(allow, z3.Or(z3.Not(protected), disposition))
check("protected-disposition-required", z3.And(disclose, protected, z3.Not(disposition)), [],
      z3.And(allow, protected, z3.Not(disposition)), ["US-079-AC7", "US-056-AC6"],
      "Unbounded Boolean disclosure admission; no implicit protected-field original")

# Typed qualified identities cannot alias merely because their labels match.
Ref, make_ref, fields_ref = z3.TupleSort("QualifiedRef", [z3.StringSort(), z3.StringSort(), z3.StringSort()])
d1, d2, module, label = z3.Strings("doc1 doc2 module label")
left, right = make_ref(d1, module, label), make_ref(d2, module, label)
check("qualified-identity-separation", z3.And(d1 != d2, left == right), [],
      z3.And(d1 != d2, label == label), ["US-079-AC2"],
      "Unbounded SMT string tuple identity; native collation/encoding is a binding assumption")

# Tri-state composition, including scoped unknown prohibitions.
pv, rv, fv = z3.Ints("permit_truth require_truth forbid_truth")
typed = [z3.And(v >= 0, v <= 2) for v in [pv, rv, fv]]  # F=0, T=1, U=2
known = z3.And(pv != 2, rv != 2, fv != 2)
tri_allow = z3.And(known, pv == 1, rv == 1, fv == 0)
check("tri-state-scoped-unknown-refusal", z3.And(tri_allow, z3.Or(pv == 2, rv == 2, fv == 2)),
      typed, z3.And(pv == 1, rv == 1, fv == 2), ["US-079-AC6"],
      "Complete enumeration of one permit/require/forbid over F,T,U; unknown always refuses")

# Mask lattice for original, withheld, two typed constant transforms, missing and conflict.
m1, m2 = z3.Ints("mask1 mask2")
mask_domain = [z3.And(v >= 0, v <= 5) for v in [m1, m2]]
def merge(a,b):
    return z3.If(z3.Or(a == 1,b == 1),1,
           z3.If(a == 4,b,z3.If(b == 4,a,
           z3.If(z3.Or(a == 5,b == 5),5,
           z3.If(a == 0,b,z3.If(b == 0,a,z3.If(a == b,a,5)))))))
check("mask-order-invariance", merge(m1,m2) != merge(m2,m1), mask_domain,
      z3.And(m1 != m2, m1 == 0, m2 == 2), ["US-079-AC7"],
      "Finite abstract disclosure domain; original cannot cancel transformed/withheld")
check("withholding-dominates", z3.And(z3.Or(m1 == 1,m2 == 1),merge(m1,m2) != 1), mask_domain,
      z3.And(m1 == 1,m2 == 0,m1 != m2), ["US-079-AC7"],
      "Finite abstract disclosure domain; typed transforms are independently validated")
true_permit = z3.Bool("true_permit")
effective = z3.If(true_permit,merge(m1,m2),m1)
check("false-permit-no-obligation", z3.And(z3.Not(true_permit), effective != m1),mask_domain,
      z3.And(z3.Not(true_permit),merge(m1,m2) != m1),["US-079-AC7"],
      "Finite abstract disposition composition; only true permits contribute")

m3 = z3.Int("mask3")
check("mask-associativity", merge(merge(m1,m2),m3) != merge(m1,merge(m2,m3)),
      mask_domain + [z3.And(m3 >= 0,m3 <= 5)],
      z3.And(m1 == 2,m2 == 3,m3 == 1,merge(m1,m2) != merge(merge(m1,m2),m3)),
      ["US-079-AC7"], "Finite 6-value disclosure algebra; three or more rules via associativity")

# Compiler query-profile invariants. Authenticated source ownership, actual SQL
# use extraction and native physical enforcement remain external premises.
qt, qf = z3.Consts("query_target query_field", Ref)
qo = z3.Int("query_operator")
lookup = z3.Function("profile_original_action", Ref, Ref, z3.IntSort(), z3.StringSort())
claimed, primary = z3.Strings("claimed_original_action primary_query_action")
grant = z3.Function("action_granted", z3.StringSort(), z3.BoolSort())
expected = lookup(qt, qf, qo)
q_assumptions = [qo >= 0, qo <= 4, expected != primary, grant(expected)]
admitted_action = z3.And(claimed == expected, claimed != primary, grant(claimed))
check("query-profile-exact-original-action", z3.And(admitted_action, claimed != expected),
      q_assumptions, z3.And(claimed != expected, claimed != primary, grant(claimed)),
      ["US-079-AC8"],
      "Unbounded qualified lookup/action labels; authentic immutable profile and exact actual query-use extraction are premises, not native authentication proofs",
      population_constraint=admitted_action)

entry_t, entry_f = z3.Consts("entry_target entry_field", Ref)
entry_o = z3.Int("entry_operator")
exact_tuple = z3.And(qt == entry_t, qf == entry_f, qo == entry_o)
wrong_tuple = z3.Or(qt != entry_t, qf != entry_f, qo != entry_o)
label_only = z3.And(fields_ref[2](qt) == fields_ref[2](entry_t),
                    fields_ref[2](qf) == fields_ref[2](entry_f))
check("query-profile-qualified-use-tuple", z3.And(exact_tuple, wrong_tuple),
      [qo >= 0, qo <= 4, entry_o >= 0, entry_o <= 4],
      z3.And(label_only, wrong_tuple), ["US-079-AC2", "US-079-AC8"],
      "Unbounded document/module/element tuples and five operators; label-only or operator-omitting lookup has a satisfiable substitution control",
      population_constraint=exact_tuple)

old_source, current_source = z3.Strings("retained_source current_source")
source_digest = z3.Function("source_digest", z3.StringSort(), z3.StringSort())
same_digest = source_digest(old_source) == source_digest(current_source)
exact_custody = z3.And(same_digest, old_source == current_source)
check("query-profile-exact-source-reuse", z3.And(exact_custody, old_source != current_source),
      [z3.Length(old_source) > 0, z3.Length(current_source) > 0],
      z3.And(same_digest, old_source != current_source), ["US-056-AC10"],
      "Unbounded exact retained source strings with an unconstrained digest function; byte/string equality survives a hypothetical digest collision, but current native source authority remains a premise",
      population_constraint=exact_custody)

# Stable eligibility and disclosed values are premises. Hidden multiplicities
# and payloads may change arbitrarily; filter BEFORE aggregation/page selection.
eligibility = z3.Bools('collection_e0 collection_e1 collection_e2')
ma = z3.Ints('collection_ma0 collection_ma1 collection_ma2')
mb = z3.Ints('collection_mb0 collection_mb1 collection_mb2')
va = z3.Ints('collection_va0 collection_va1 collection_va2')
vb = z3.Ints('collection_vb0 collection_vb1 collection_vb2')
bag_assumptions = [m >= 0 for m in ma + mb] + [
    z3.Implies(eligibility[i], z3.And(ma[i] == mb[i], va[i] == vb[i])) for i in range(3)]
count_a = z3.Sum([z3.If(eligibility[i], ma[i], 0) for i in range(3)])
count_b = z3.Sum([z3.If(eligibility[i], mb[i], 0) for i in range(3)])
sum_a = z3.Sum([z3.If(eligibility[i], ma[i] * va[i], 0) for i in range(3)])
sum_b = z3.Sum([z3.If(eligibility[i], mb[i] * vb[i], 0) for i in range(3)])
check('collection-aggregate-hidden-noninterference', z3.Or(count_a != count_b, sum_a != sum_b),
      bag_assumptions,
      z3.Or(z3.Sum(ma) != z3.Sum(mb), z3.Sum([ma[i]*va[i] for i in range(3)]) != z3.Sum([mb[i]*vb[i] for i in range(3)])),
      ['US-056-AC1'],
      'Three ordered carrier identities, unbounded nonnegative bag multiplicities and mathematical integer payloads; stable complete eligibility and equal eligible payloads/multiplicities imply COUNT/SUM noninterference. Native arithmetic overflow, NULL and masked operator domains remain separate obligations',
      population_constraint=z3.And(eligibility[0], ma[0] > 0, z3.Not(eligibility[1]), ma[1] > 0))
pa = z3.Bools('page_pa0 page_pa1 page_pa2')
pb = z3.Bools('page_pb0 page_pb1 page_pb2')
page_index = z3.Int('page_index')
page_assumptions = [page_index >= 0, page_index < 3] + [z3.Implies(eligibility[i], pa[i] == pb[i]) for i in range(3)]
def page(presence, before_filter):
    output = z3.IntVal(-1)
    for i in reversed(range(3)):
        eligible = z3.And(presence[i], eligibility[i])
        rank = z3.Sum([z3.If(presence[j] if before_filter else z3.And(presence[j], eligibility[j]), 1, 0) for j in range(i)]) if i else z3.IntVal(0)
        output = z3.If(z3.And(eligible, rank == page_index), i, output)
    return output
check('collection-page-hidden-noninterference', page(pa,False) != page(pb,False),
      page_assumptions, page(pa,True) != page(pb,True), ['US-056-AC1'],
      'Three unique publicly ordered identities and any selected eligible rank 0..2; stable complete eligibility/order makes eligibility-before-page invariant to hidden presence. A LIMIT/OFFSET-before-filter control admits changed/empty authorized pages. Native ordering/collation, cursor provenance and current authority remain premises',
      population_constraint=z3.And(z3.Not(eligibility[0]),eligibility[1],pa[0],z3.Not(pb[0]),pa[1],pb[1]))

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

sources = [HERE / "prove.py", ROOT / "docs/helix/02-design/contracts/CONTRACT-062-security-semantics.md",
           ROOT / "docs/helix/02-design/contracts/CONTRACT-063-security-enforcement.md"]
receipt = {"solver": "Z3", "solverVersion": z3.get_version_string(),
           "command": "/private/tmp/umf-security-proof-venv/bin/python3 docs/helix/02-design/spikes/security/prove.py",
           "sourceDigests": {str(p.relative_to(ROOT)): digest(p) for p in sources},
           "cases": results, "nativeInstallationProven": False,
           "scope": "Conditional formal proofs, not complete extension/backend acceptance"}
out = ROOT / "docs/helix/04-build/evidence/security/formal.json"
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(receipt, indent=2) + "\n")
print(json.dumps({"passed": len(results), "solver": receipt["solverVersion"], "receipt": str(out)}))
