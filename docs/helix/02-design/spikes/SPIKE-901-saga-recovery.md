---
ddx:
  id: SPIKE-901
  type: tech-spike
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-901
      kind: informed_by
    - id: US-906
      kind: informed_by
    - id: US-905
      kind: informed_by
    - id: CONTRACT-900
      kind: informed_by
    - id: CONTRACT-901
      kind: informed_by
---

# SPIKE-901: Saga submission and recovery semantics

**Lead:** Codex, at the owner's request, 2026-10-29.
**Time Budget:** One local session, with a 45-minute investigation ceiling.

## Objective

Can a finite TLA+ model check the saga requirements for duplicate submission,
uncertain outcomes, compensation and action retirement before the executable
contract is written?

The investigation covers FR-57, FEAT-901, US-906 and US-905. It addresses the
three review findings: missing submission identity semantics, external effects
that cannot satisfy the current action declaration, and retirement that blocks
fresh recovery work. Production execution and a complete saga protocol are
outside this spike.

## Hypothesis

Separating durable provider outcomes from coordinator observations will expose
unsafe continuation after lost acknowledgements. Scoped submission identity and
immutable intent will prevent duplicate admission. Distinct saga-definition and
action retirement will preserve existing tx/1 invocation rules while making
blocked recovery explicit.

TLA+ is a specification language; TLC explores a configured finite state model
and checks its safety and temporal properties. The
[official TLC documentation](https://docs.tlapl.us/using%3Atlc%3Astart) describes
its supported finite-model subset. This experiment supplies model evidence,
not a proof for all sizes or a refinement proof of executable code.

## Approach

Use a bounded model with two and three sequential, explicitly compensable steps,
a single trusted submission namespace, two possible intents, two submissions,
one crash/restart and one coordinator takeover. Provider outcome settlement,
coordinator observation and acknowledgement are separate transitions. Retirement
and cancellation race admission. State databases are temporary; original logs,
configurations, hashes and counterexample traces are retained.

| Check | Requirements | Assertion or witness |
| --- | --- | --- |
| Submission uniqueness | SAGA-23; US-905-AC21/22 | One instance per submission identity; original intent never changes. |
| Uncertain effects | SAGA-08/09 | No later forward or compensation admission while an outcome is unknown. |
| Stable invocation | SAGA-07/10/11 | At most one provider commit per logical forward/compensation invocation, under the modeled provider contract. |
| Compensation order | SAGA-05/11 | Reverse committed-step order; failed compensation blocks earlier unwinding. |
| Cancellation | SAGA-12 | No forward admission after cancellation wins. |
| Takeover | SAGA-07 | A superseded owner cannot admit a fresh invocation. |
| Retirement | SAGA-16; US-905-AC23/24 | Fresh retired-action invocation refuses; active instances may dispatch active actions after saga-definition retirement. |
| External eligibility | SAGA-20; US-906-AC15 | Current declaration refuses external-effect admission. |
| Honest results | SAGA-06/17 | Known success agrees with provider truth; terminal success/recovery hides no unknown outcomes. |
| Progress | Conditional environment cut | Weakly fair execution in a stable available environment eventually terminates. |

Eight mutations independently remove submission deduplication, immutable-intent
protection, the unknown-outcome barrier, action retirement fencing, owner fencing,
cancellation fencing, reverse compensation ordering or external-effect refusal.
Each must violate its exact corresponding invariant. Six positive reachability
checks must exhibit success, changed-intent conflict, intervention, blocked
compensation, actual continuation after saga-definition retirement and actual
recovery of an unobserved committed forward outcome after a crash. Witnesses use
negative assertions whose named violations are the expected result.

The progress cut excludes crashes, retirement, cancellation and takeover. It
fixes supported active providers and requires weak fairness of the remaining
finite work. It promises eventual termination, including compensation failure
with intervention, rather than eventual business success. The unrestricted
safety configurations make no fairness or eventual-availability assumption.

## Findings

The final run and exact state counts are recorded in
[results.json](../experiments/saga/evidence/results.json). A result is accepted
only after complete safety/progress exploration or its exact expected
counterexample; a timeout or unexpected failure is not a pass.

The final run passed all 18 expected outcomes: four complete safety/progress
checks, eight deliberately faulty variants and six positive reachability witnesses.

| Complete exploration | Distinct states | Result |
| --- | ---: | --- |
| Two-step safety with fault scheduling | 759,552 | No invariant violation; queue exhausted. |
| Three-step safety with fault scheduling | 6,677,760 | No invariant violation; queue exhausted. |
| External-effect refusal | 192 | Unsupported declaration never admitted. |
| Three-step stable-environment progress | 83 | Eventual terminal state under the stated fairness assumptions. |

**FINDING 1**: Submission replay is a separate obligation from step replay.
The duplicate-submission mutation violates `OneSubmission`; changed-intent
overwrite violates `IntentPinned`. FEAT-901 now requires durable scoped admission,
original-result custody, conflict detection and nonreuse after expiry. US-905
adds original-admission acknowledgement-loss and changed-intent criteria.

**FINDING 2**: Existing action declarations cannot represent arbitrary external
effects through a handler/profile change. CONTRACT-900 requires single-store
atomicity for both recipes and handlers. SAGA-20 and US-906 now require a versioned
compatible declaration contract as well as provider qualification before external
execution eligibility. The model checks this refusal gate; it supplies no new
external-effect schema or provider protocol. The external-admission mutation
violates `ExternalEligibility`.

**FINDING 3**: Retaining an original interpretation does not grant fresh invocation
rights after referenced-action retirement. The revised SAGA-16 distinguishes
saga-definition retirement, retained outcome lookup/replay and fresh forward or
compensation admission. US-905 now requires intervention when retired action
revisions block required work. The retired-action mutation violates
`RetirementFence`; positive witnesses require blocked compensation and actual
active-action dispatch after saga-definition retirement.

**FINDING 4**: The recovery properties need a provider contract beneath the
coordinator. The model maintains provider truth separately and detects an
unknown-outcome barrier violation, but assumes atomic durable provider outcomes,
stable invocation identity and unavoidable admission fencing. Neither coordinator
persistence nor this model establishes those properties for a real executor.

### Detailed admission-boundary follow-up

The completed protocol separates coordinator ticket issue from provider native
transaction admission. A focused `Admission.tla` model passes seven additional
expected checks: 52 reachable safety states, three targeted guard counterexamples
and three positive witnesses. [Admission results](../experiments/saga/evidence/admission-results.json)
record exact inputs/tools and original traces. In-flight ticket settlement after
cancel and already admitted transaction settlement after retirement are reachable;
fresh native admission after retirement is refused. This model does not compose
the full Saga.tla state space or establish native authority/custody enforcement.

## Analysis

The revised requirements support a bounded sequential safety model without
changing core, actions 0.1.0, tx/1 or bulk/1. Formal modeling complements the
existing declaration and consumer acceptance stories. It does not replace them.

History instrumentation records unsafe admission preconditions independently of
the dispatch guards. Removed guards must produce counterexamples, and positive
witnesses prevent claiming success solely because useful execution is unreachable.
The original reviewed packet was imported into this worktree from the
Batten Helix worktree; its pre-edit hashes are recorded in
[reviewed-packet.json](../experiments/saga/evidence/reviewed-packet.json).
Governing CONTRACT-900/901/904 matched between the two worktrees. The authoring story was explicitly migrated from US-904 to US-906 because
current main assigns US-904 to extension-defined kinds. All acceptance IDs and
links for that saga story were migrated together; reviewed-packet.json retains
the original source hashes. Other saga IDs and unknown frontmatter were retained.

## Conclusions

TLA+ with TLC is suitable for validating the bounded coordination design before
implementation. The evidence is conditional on explicit provider and admission
assumptions and the configured state bounds. No arbitrary-size theorem, native
execution claim or implementation refinement follows.

Unmodeled areas remain: full reference/type validation, multiple tenants,
current authorization and delegation, provider binding changes, retention expiry,
retry/time budgets, irreversible or partial external effects, manual resolution,
unbounded crashes, parallel composition and nested sagas. These remain governed
by the feature and acceptance stories; they are not waived by the model.

## Documentation verification

Local Markdown links, imported frontmatter preservation, source/configuration/log
hashes and `git diff --check` were checked separately from TLC. The initial local
HELIX validator attempt lacked PyYAML. The completed review uses isolated pinned
PyYAML 6.0.3/jsonschema 4.25.1 tooling and records catalog checks in
[catalog-validation.json](../experiments/saga/evidence/catalog-validation.json).
No product dependency was added.

## Recommendations

**RECOMMENDATION**: Use this model while drafting the exact saga contract, and
update the model when protocol decisions change. Keep independent native
execution histories as the next qualification layer.

Specify exact submission equality and original-result recovery, action/reference
packaging, invocation admission and outcome discovery before implementing an
executor. Retain the existing tx/1 retirement boundary. Select a separately
versioned external-effect declaration before claiming external-provider support.
Later native tests must exercise the assumed atomicity, outcome custody,
fencing and authority boundaries, with independent provider observations.
No runtime, datastore, queue or new concern selection follows from this spike.

## Artifacts

- [Model and reproduction instructions](../experiments/saga/formal/README.md).
- [Saga.tla](../experiments/saga/formal/Saga.tla).
- [Runner](../experiments/saga/formal/run_tlc.py) and adjacent configurations.
- [Machine-readable results](../experiments/saga/evidence/results.json), versions,
  hashes and adjacent logs with counterexample traces.
- [Feature requirements](../../01-frame/features/FEAT-901-saga-semantics.md),
  [authoring criteria](../../01-frame/user-stories/US-906-author-and-assess-sagas.md)
  and [recovery criteria](../../01-frame/user-stories/US-905-saga-recovery-conformance.md).
