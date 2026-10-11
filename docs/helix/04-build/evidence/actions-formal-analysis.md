# Formal action analysis — 2026-10-08

Astra Ultra reviewed the proposed analysis and recommended separate semantic
relations, a phased protocol, independent history checks, positive witnesses and
counterexample-sensitive oracles. That revised bounded plan was executed. This
record concerns design correctness and scoped conformance, not production action
acceptance or completeness of all business requirements.

## Design problems found and corrected

1. **Association observability.** Old rules/1 expressions saw only fields and
   entity existence. Two otherwise identical states differing in links were
   observationally indistinguishable, so a handler could not state its intended
   link postcondition. CONTRACT-053 now has a phase-qualified linked expression
   for directed set associations, requiring declared endpoint/relationship reads.
   Richer association/owned/undirected meanings remain unsupported.
2. **Cross-Key aliases.** Equality within a Key cannot determine that a primary
   ID and alternate email Key locate the same native entity. Canonical native
   resolution is required; unknown/ambiguous aliases and absent alternate-Key
   creation refuse. Astra's audit caught a sequencing error: native resolution
   must occur inside the invariant transaction, not before it. Stages 3–4 now
   separate tuple admission from transactional identity resolution/freezing.
3. **Hidden invariant dependencies.** Disjoint edge writes can jointly violate
   a to-one target constraint. Executor schema-invariant validation has an
   explicitly qualified predicate/conflict boundary; it cannot grant arbitrary
   handler reads outside declared frames.
4. **Underconstrained business intent.** Stock subtraction alone permits missing
   reservation creation and, without a positive-quantity precondition, negative
   reservations. Independent intended relations require positive quantity,
   sufficient stock, new identity and reserved record/status as well as subtraction.
5. **Projection stall in the analysis model.** Advancing the watermark only for
   the newly arriving next event can stall after event 2 then event 1. The corrected
   model computes the maximal complete applied prefix; the old algorithm is a
   rejected mutation. Progress is separately checked under fair stable conditions.

The earlier Astra contract corrections were also implemented: unique combined
frame IDs, explicit recipe/handler verification retained on replay, net change
versus primitive no-op accounting, and ordered fresh-failure decisions. Fourteen
[counterexample sketches](../../02-design/experiments/actions/design-counterexamples.json)
allocate future schema/runtime assertions; these are not accepted implementation
fixtures.

## Executed analysis

Sources, logs, configurations and results:
[formal experiments](../../02-design/experiments/actions/formal/).

| Analysis | Result | What it establishes |
| --- | --- | --- |
| Z3 semantic relations | 16 solver queries: 8 expected satisfiable, 8 expected unsatisfiable; plus 6 explicit relational/access checks | Successful create-link, approve/no-op and reserve are possible; selected bad states are excluded by complete intended relations. Weak relations expose missing obligations. |
| Pairwise interference | 9 structural classifications | Read/write/invariant dependency overlap for the three synthetic command categories; not a general commutativity proof. |
| TLC same-token safety | Exhausted 6,248 distinct states | Seven named invariants hold in this configuration. |
| TLC distinct-token safety | Exhausted 16,164 distinct states | Same invariants hold in the second configuration; counts are separate scopes. |
| TLC mutations | 7/7 variants produce invariant counterexamples | Duplicate commits, split commit, early ack, stale authorization, lost update, false prefix visibility and stalled watermark are discriminated. |
| Positive reachability | Success, acknowledgement and actual retained replay after crash all have saved traces | Passing safety is not merely an always-refuse execution model. |
| Finite progress | EventuallyDone and EventuallyProjected pass | Under weak fairness of client steps/event application and no crash/deployment/revocation, requests terminate and the complete outbox prefix becomes applied. |
| Fresh PostgreSQL 17.9 | 22/22 histories pass; 5 faulty variants rejected | Original synthetic executor observations, including H22 replenishment/version conflict. |
| Independent history oracle | 22/22 admit legal sequentializations; 4 incorrect non-projection variants rejected | Exact server/client payloads and final abstract state agree with the separate sequential model, with recorded real-time order respected. |

Seven TLC invariants: AtMostOnce, Conservation, AtomicEvidence, AckDurable,
NoProtectedDisclosure, VisiblePrefix and WatermarkComplete. Invariants are checked
properties, not assumptions imposed on the reachable states. Their mutation logs
retain counterexample traces. Progress is an explicit separate configuration;
safety searches do not assume fairness. Positive traces are found by deliberately
checking negations of reachability claims and requiring counterexamples.

## Bounds and interpretation

Protocol: two clients, same stable token or two distinct tokens, initial stock two,
two revisions, one deployment and one revocation event, at most one crash/retry
per client. Admission, arbitration, preparation, durable commit, acknowledgement,
crash, retry and environmental events are separate transitions. The storage
transaction committing business state/outcome/outbox is assumed atomic; a split
variant tests why that premise matters. This does not prove native crash durability.
The protocol abstracts inventory decrements; reservation creation/link intent is
checked by the separate semantic relations and native history oracle.

Semantic solver: mathematical integer/boolean relations with stock 0–2, quantity
−1–2 and bounded candidate post-stock. It does not parse UMF expressions, validate
all core literals or verify a handler implementation. Association equivalence,
alias/interference and attempted-access cases are explicit concrete witnesses,
not solver-derived general alias or concurrency theorems. Corrected observations
and canonical identity separate those witnesses; native implementations remain
unqualified. Attempted outside-frame access cannot be certified from net-state
comparison, including a write subsequently restored.

History oracle: independent host Python implementation of the original PG
synthetic command/replay semantics, without importing SQL/native harness helpers.
It searches each concurrent group for a legal order respecting measured intervals,
checks exact returned/client payloads and final state, including resource versions.
It excludes projection/delivery, real process recovery and public action protocol
refinement. Lost acknowledgement is injected after observed server commit. Native
same-store projection is separately checked by the existing harness; the oracle
makes no projection-content claim. TLC checks event-prefix state, not actual
warehouse data or general projection content. Audit and arbitrary authorization,
expiry/tombstones, core Key/value semantics and sandbox enforcement are not proved.

## Reproduction and tools

Z3 solver 4.15.3.0 is installed only under `/private/tmp/umf-actions-formal-tools/python`.
`PYTHONPATH=/private/tmp/umf-actions-formal-tools/python python3 docs/helix/02-design/experiments/actions/formal/semantics.py`
runs the semantic suite. Package source: [pinned official PyPI distribution](https://pypi.org/project/z3-solver/4.15.3.0/).

TLC uses [official tlaplus release 1.7.4](https://github.com/tlaplus/tlaplus/releases/tag/v1.7.4)
(the runtime banner is TLC2 2.19, revision 5a47802). Published jar SHA-1 verified:
`bee4a54f3ee3d4afc347c3240ec2d9e93b075104`. `run_tlc.py` invokes it in the existing
network-disabled UMF replay image with Java 21.0.12.1, one TLC worker, 1 GiB heap
and a 120-second timeout per configuration. Missing completion/expected violation
fails the run; no truncated state search is accepted. Tool binaries are temporary,
not committed project dependencies; reproduction requires those pinned tools.

Create/run the existing isolated PostgreSQL harness, then run native.py and
formal/history_oracle.py. Container has no ports, mounted database volume or
network. Experiment containers are removed after checks. Source/result SHA-256
records accompany each analysis and the final manifest.

## Review and remaining proof obligations

Astra's output audit corrected replenishment resourceVersion in the independent
oracle and added H22, transactional alias-resolution ordering, liveness metadata,
projection watermark advancement and the recovered-replay witness. Earlier
failed TLA attempts (forward variable declaration and Boolean-assignment precedence)
were corrected and rerun; they are not counted as successful checks.

The design has stronger, counterexample-tested semantics. It is not certified
complete. Public-library/full-schema fixtures, rules evaluator, canonical adapter,
controlled handler gateway/sandbox, real crash recovery and general native
refinement remain separate implementation obligations. Additional domain command
catalogues may expose further missing expressiveness. Native results cannot be
promoted to those broader claims without new evidence.
