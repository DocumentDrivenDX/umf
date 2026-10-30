# Combined saga protocol validation

`Protocol.tla` is the current finite coordination model for CONTRACT-908.
`Saga.tla`, `Admission.tla` and `Delivery.tla` retain their earlier boundary evidence.
The combined suite requires 40 primary source-exact expectations plus three
stronger composite reachability checks in ProtocolWitnesses.tla; completion is recorded
only when [the published report](../evidence/protocol/report.json) has allPassed:true
and `publish_protocol.py --verify` accepts its inputs, configurations and logs.

## Assurance and bounds

This is completed bounded model checking of the selected coordination abstraction,
not an arbitrary-size theorem or implementation refinement proof. All nine lifecycle
phases and their specified admission, observation, unwind and manual-closure cuts
are represented. Typed declaration admission and native enforcement are separate.

The exhaustive combined-fault cases use two ordered steps. The first disposition
is action, irreversible or qualified no-effect; the second is action. A three-step
case explores action-compensated steps with crash loss; stable progress cases also
use three steps. This does not prove arbitrary placement or all 32 permitted steps.
Each invocation slot has its own fixed action/binding identity; shared-revision
aliasing is not modeled. All model configurations are checked without depth limits,
state constraints, simulation or sampling. An unfinished search is not a pass.

Finite environment bounds are one admitted instance/namespace, two input labels,
one volatile-observation crash/restart, one lease expiry/takeover, at most one
action retirement, one action-authority revocation, one operator revocation and one
same-ticket redelivery. Two abstract elapsed-time ticks stand for deadline
exhaustion; one authoritative lookup per invocation is the selected tighter host
limit except for the three-step crash and positive crash-recovery cuts, which
allow two. They exercise the threshold/ordering rules, not real milliseconds or all
sixteen allowed lookup counts. Counters and original custody survive crashes.

Faults start after durable submission. A crash requires an actual volatile original
observation awaiting persistence and discards it. Post-terminal control changes and
retirement/revocation of already settled slots are omitted because they cannot
admit another ticket in this instance. Provider redelivery after termination is
still explored. Earlier submission/admission models cover their own pre-admission
cuts; this accepted-instance model does not replace that evidence.

## State and transition correspondence

| Model state/action | Contract meaning and atomic boundary |
| --- | --- |
| submitted, intent/originalIntent | One durable accepted definition/input/binding snapshot; a changed-intent mutation must fail IntentPinned. Full byte equality and namespace uniqueness remain native custody obligations. |
| queued / Issue | Coordinator claim and ticket issuance share a control boundary. The issued ticket stores worker/current epoch; a queued ticket is not a native transaction. |
| NativeAdmit / NativeRefuse | Current revision and independent action authority gate original provider admission. Retirement may occur after admission; action-authority revocation serializes with the native transaction. |
| stage / outcome / effects | Native transaction stage, durable original logical disposition and actual business-effect count are separate. Effect and committed outcome settle atomically. Definitive noncommit closes the whole ticket. |
| Lookup / cache / Persist | Original provider lookup, volatile response and durable coordinator observation are separate. Crash can lose cache while original provider truth survives. |
| reconciling | Missing original evidence blocks all new business admission. Lookup exhaustion may stop in intervention with that ticket pending. |
| failed forward Record / compensating | Definitive whole-ticket noncommit starts reverse unwind, retaining failed rather than inventing business rejection. Empty-prefix unwind can complete. |
| Disposition | Qualified no-effect marks recovery without a provider effect. An irreversible barrier stops before earlier compensation. |
| Cancel | Coordinator arbitration latches the first cause. Cancellation cannot replace failure-triggered unwind; a pre-cancel original ticket can settle. |
| Tick / HaltLookup / stopped | Elapsed/lookup exhaustion preserves unknowns and stops automatic work. Current phase cannot resume after durable intervention; original provider work may settle later. |
| Resolve | Current operator authority and original issuer truth permit recording a late original disposition. It does not leave intervention or create a business attempt. |
| Review / Close | Closure requires no pending ticket, original issuer evidence, current operator authority and the current history sequence. It records accepted residual effects, never compensation. |
| succeeded / compensated / cancelled / closed | Each phase has a distinct truth condition; none may hide pending custody. Closure may truthfully retain residual effects. |

The modeled gateway closes failed and refused tickets as well as business
outcomes. Base tx/1 lacks that whole-ticket guarantee after failed attempts.
CONTRACT-901/908 therefore require independent saga-provider finality qualification;
a missing native outcome row or one attempt's rollback cannot authorize unwind.
The failed-reinvoke mutant commits a late effect under a finalized failed ticket
and violates NoncommitHasNoEffect. The valid replay witness recovers the original
failed disposition after unwind with zero new effects.

## Safety properties

All full explorations check these 22 state invariants:

| Properties | Independent state being compared |
| --- | --- |
| TypeOK, IntentPinned | Finite state domains and retained original intent. |
| OutcomesSound, ProviderFinality | Coordinator observations and current provider stage agree with separately retained original disposition. |
| NoncommitHasNoEffect, NoDuplicateEffects | Actual effect counters remain zero after final noncommit and at most one per original key. |
| ForwardOrdered, ReverseRecovery, FailureStartsUnwind | Issued work and retained original observations obey dependency, unknown-outcome and reverse-prefix rules. |
| CausePinned, StopCausePresent, CancelledCause, CancelCut | Latched original cause, current projection, terminal classification and the actual forward admission cut agree. |
| ExpiryCut, NoAutomaticResume, StoppedAdmission | Ticket counts and current phase respect persisted exhaustion/intervention history. |
| TicketOwnership, NativeAdmission | Issued ticket/current epoch and native admission authority/revision snapshots agree. These are admission-boundary checks, not claims of independently proved downstream business harm. |
| HonestTermination, NoFalseRestoration | Terminal status agrees with confirmed provider/compensation truth and irreversible dispositions. |
| ClosedSettled, ClosedEvidence | Closed status has no pending custody and uses the original issuer, current operator and exact reviewed history version. |

No bad-guard flags define these safety properties. Some properties deliberately
inspect real admission/audit snapshots; the effect/finality/termination properties
separately detect actual harmful state. Atomic durable provider custody, native
transaction isolation and trusted issuer predicates are assumptions to be qualified
by native tests, not conclusions about a real provider.

## Progress assumptions

The two temporal configurations disable faults and elapsed-budget expiry and
require responsive lookup: an automatic lookup waits until provider truth exists.
They weakly fair Worker and, for every invocation, Gateway, Settlement and
Observation independently. Fairness is not attached to the entire Next relation.

The mixed-result cut checks EventuallyStopped: supported work reaches succeeded,
compensated or intervention. The all-committed cut checks EventuallySucceeded.
Provider outcome selection is finite; the mixed-result premise does not require
success. No liveness claim applies to permanently unavailable provider truth,
revoked authority, arbitrary crashes, exhausted real deadlines or production
scheduling. Safety cuts impose no fairness or eventual-availability premise.

## Required negative controls and non-vacuity

Seventeen mutants must violate their exact named invariant: changed intent,
unknown advance, duplicate effect, failed-ticket reinvocation, noncommit left
running, cancellation hiding failure, skipped irreversible barrier, timeout
fabricating failure, post-expiry admission, stale owner, retired native admission,
fabricated resolution, automatic resume, and pending/stale/foreign/unauthorized
closure. No timeout, parser error or different invariant violation is accepted.

Sixteen negative reachability assertions must exhibit all nine phases, confirmed
noncommit unwind, intervention with unknown custody, volatile crash recovery,
truthful residual closure, an irreversible barrier, no-effect recovery and a safe
late failed-ticket replay. These are expected invariant violations, not failed
safety checks. See [compact action traces](../evidence/protocol/traces.md) and the
compressed original logs referenced by the report for full states.

The three supplementary witnesses extend Protocol without replacing any initial
condition, transition, variable or assumption. They require actual forward and
compensation effects around a later confirmed noncommit, truthful closure after
failed compensation, and cancellation with a committed/compensated prefix. This
avoids treating an empty-prefix recovery witness as evidence for all three cases.

## Reproduce and verify

Use the pinned official TLC 1.7.4 jar, SHA-256
936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88.
The report pins Java, model, runner, publisher, governing requirements/contracts/
designs/test plans and schema sources, each complete configuration and
both compressed and original log bytes. Run from any directory:

```sh
python3 docs/helix/02-design/experiments/saga/formal/run_protocol.py \
  --java /path/to/java --jar /path/to/tla2tools-1.7.4.jar
python3 docs/helix/02-design/experiments/saga/formal/run_protocol_witnesses.py \
  --java /path/to/java --jar /path/to/tla2tools-1.7.4.jar
python3 docs/helix/02-design/experiments/saga/formal/publish_protocol.py
python3 docs/helix/02-design/experiments/saga/formal/publish_protocol.py --verify
```

`--case NAME` permits an individual rerun; publication refuses incomplete, failed
or stale-source caches. The runner isolates Java temporary directories, uses four workers for complete safety/progress exploration and one for exact
counterexample/witness checks, fixed seed/fingerprint parameters and fresh state storage, and treats its
timeout as incomplete. Original logs are compressed for review; local uncompressed
logs and per-case caches are ignored by Git. Publisher verification needs only the
tracked report/configurations/compressed logs and current sources.

## Residual implementation work and recheck triggers

STP-905/906 retain native and library qualification. These finite checks do not
prove wire/value/reference parsing, complete request/control-byte equality,
cryptographic issuer validation, multi-tenant policy, storage capacity, real clock
behavior, all fault counts, all 32 steps or any implementation refinement. No
production executor, installed browser binding or action provider is qualified.

Recheck the suite when any lifecycle transition, ticket/key identity, provider
finality rule, stop arbitration, lookup/deadline handling, disposition, retirement,
authority boundary, closure guard, abstraction, invariant, fairness or runner
changes. Changed native implementations additionally require independent actual
provider/custody witnesses even when this model's hashes are unchanged.
