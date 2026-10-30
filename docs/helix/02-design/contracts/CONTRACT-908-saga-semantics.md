---
ddx:
  id: CONTRACT-908
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-901
      kind: informed_by
    - id: CONTRACT-001
      kind: references
    - id: CONTRACT-900
      kind: references
    - id: CONTRACT-901
      kind: references
    - id: CONTRACT-904
      kind: references
  schemas:
    - id: umf.actions.saga
      version: "0.1.0"
      title: Saga declarations
      path: docs/helix/02-design/contracts/schemas/saga-0.1.0.schema.json
      schemaFormat: json-schema
    - id: umf.actions.saga.protocol
      version: "1"
      title: Saga logical protocol
      path: docs/helix/02-design/contracts/schemas/saga-runtime-1.schema.json
      schemaFormat: json-schema
    - id: umf.actions
      version: "0.1.0"
      title: Declarative actions
      path: spec/extensions/actions/schema.json
      schemaFormat: json-schema
    - id: umf.actions.tx-results
      version: "1"
      title: Transactional committed outcomes
      path: spec/extensions/actions/tx-results.schema.json
      schemaFormat: json-schema
---

# CONTRACT-908: Sequential saga declarations and coordination

**Version:** proposed `umf.actions.saga` 0.1.0, coordination profile
`umf.actions.saga.sequential/1`, logical protocol `umf.actions.saga/1`.

## Purpose

Define a portable composition of independently committed actions and the
consumer obligations for submission, original-outcome recovery, cancellation,
compensation and retirement. This is a design contract; registration, library
implementation and native execution qualification are separate deliverables.

## Scope and Boundaries

UMF owns declaration admission, inspection and capability comparison. A trusted
host owns instance custody, scheduling, current authority, installed provider
bindings and effect execution. No document selects physical resources or loads
code. Core 0.10.0, actions 0.1.0 and tx/1 retain their existing meanings.

The first executable subset uses transactional actions across one or more
trusted store bindings, finite sequential order and reverse compensation.
External calls, distributed atomicity, nested/parallel/dynamic composition,
automatic inverse actions and automatic migration of running instances are
excluded. External effects require a future compatible declaration version;
a handler/profile annotation cannot waive actions 0.1.0 single-store atomicity.

## Normative Surface

### Structural authority and packaging

The two `ddx.schemas` sources own exact JSON shapes, required members, discriminators
and structural bounds. This contract owns cross-reference, typing, state and
custody rules not expressible by those shapes. Schema success alone MUST NOT
establish semantic completeness, execution eligibility or native enforcement.

Install the extension only at module scope as the declaration schema's root
payload. The containing Document MUST declare the exact vocabulary version.
The complete dependency package is ONE supplied immutable core 0.10.0 Document:
all participating models, actions and sagas are local to its modules. Existing
CONTRACT-900 module/action references remain local; no external-document member,
URL lookup, newest-version selection or import-time ID rewriting is introduced.
Logical services may occupy different modules and host bindings without changing
reference resolution. Partial packages remain preservable but ineligible.

An executor-assigned definition revision binds the full original Document,
including order, unknown content and dependencies. Tokens MUST NOT be reused
for different bytes/meaning. Display names and hashes alone confer no identity
or authority. Submission also pins each action revision, qualified handler build,
profile and immutable host binding snapshot. Subsequent deployment MUST NOT
retarget those dependencies silently.

### Composition and types

A definition's `steps` array is the complete forward order; every step is required.
Saga/step IDs MUST be unique in their respective module/definition. Parameter
and output IDs use separate namespaces and MUST be unique within each list.
Every action input mapping and saga output mapping MUST name one declared target
parameter, with no duplicates or surplus mappings. All required inputs/outputs
MUST have a mapping; unmapped optional values remain absent, not null/defaulted.

`source.input` resolves a saga input; `source.step/output` resolves the original
committed output of a named forward step. Forward inputs may use only earlier
steps. Compensation for step N may use saga inputs and outputs from steps 1..N,
including its own retained original result. Saga completion outputs may use any
required successful step. Compensation outputs never feed later forward work.
Missing, cyclic, later, unavailable or ambiguous references prevent eligibility.

Parameter shapes, exact CoreLiteral admission and ordered entity Key tuples reuse
CONTRACT-900/040/049. Value bindings require the SAME qualified Field identity;
entity bindings require the SAME Record and Key identity. Similar scalar names
or structurally equal models do not establish compatibility. A source that may
be absent cannot supply a required destination. Null and absent remain distinct.
Every invocation re-admits actual values under the destination action's contract.
An entity tuple transferred between bindings asserts no shared native entity or
existence: the destination provider resolves and authorizes it independently.

`binding` is a logical alias. The trusted host maps aliases to preinstalled
provider identities and scoped store/epoch/deployment snapshots. Metadata supplies
no credentials, tenant, principal or arbitrary connection string. Rebinding an
alias does not update an active instance; unavailable pinned custody requires
intervention. Separate stores do not gain causal freshness from another store's
receipt. Each action's consistency and invariant boundary remains local.

### Compensation dispositions

- `action`: reference a separately qualified action and binding with typed inputs.
  It needs current independent authorization, durable invocation identity and
  original-outcome recovery. It is a new business effect, never history erasure.
- `unnecessary`: only the exact `umf.actions.saga.no-effect/1` profile is executable
  initially. It requires `writes:[]` and separately qualified attempted-access
  enforcement proving no business mutations. No-op on one observed invocation
  alone cannot establish this profile. Unknown profiles remain unchecked.
- `irreversible`: retain the stated reason and confirmed effect. When unwinding
  reaches that step, stop with intervention-required before earlier automatic
  compensation. Never claim restoration or generate an inverse action.

Unwind committed steps in descending completion order. Mark unnecessary steps
explicitly without inventing provider effects. A compensation rejection, conflict,
known failure, authority refusal or uncertain outcome prevents admission of any
earlier compensation. Compensation may fail against concurrent legitimate state.

### Portable library boundary

These are planned public operations, not currently exported implementations.
Existing `Document`, `Registry` and `Diagnostic` types retain their contracts.
Schema `$defs` own the new payload/result types referenced below.

| Operation | Exact signature and result | Behavior |
| --- | --- | --- |
| Inspect | `inspectSagas(source:Document,registry:Registry):SagaInspection` | Returns a copied source, existing Validation and ordered entries `{module,path,definition,obligations}`. Each obligation uses the declaration schema's obligation type. |
| Declare | `declareSaga(source:Document,module:string,definition:Definition,registry:Registry):Document` | Fresh stable ID; exact installed package; copy and validate before/after; no effects. |
| Edit | `editSaga(source:Document,identity:Identity,replacement:Definition,registry:Registry):Document` | Preserve stable ID, original on refusal and native/unknown content. Relevant unknown semantics block editing. |
| Assess | `assessSaga(source:Document,identity:Identity,capabilities:Capabilities,registry:Registry):Assessment` | Separate validity, completeness, declaration compatibility, coordination claims and permanently false `executionVerified`. |

Unknown declaration members MUST survive exchange. Malformed known forms are
errors; unknown relevant semantics are unchecked obligations and prevent editing
or execution eligibility. Inspect/assess MUST NOT evaluate business state, fetch
resources or invoke handlers. Claims MUST cover the exact source/identity and
all action, binding and recovery obligations. Missing or duplicate claims are
unknown, never supported by default. Evidence strings are references, not proof
validation or authorization; no portable assessment sets executionVerified true.

### Logical consumer protocol

Runtime schema `$defs` own request/result types. Operations are logical interfaces,
not HTTP routes. Trusted tenant, initiating human, service, delegation, binding
snapshot, control-attempt capability and disclosure policy are supplied out of
band. User fields cannot override them. All runtime requests are closed: refuse
unknown members. Person/service attribution preserves tx/1 meaning.

| Operation | Complete allowed result types (`$defs`) | Obligation |
| --- | --- | --- |
| submit | submitted, refusal, unknown, failure | Durable scoped key admission; immutable original submitted result. |
| claim | claim, idle, refusal, unknown, failure | Current worker authority, next invocation, monotone fence and lease. |
| execute | outcome, refusal, unknown, failure | Original qualified invocation only; no caller-supplied business inputs or replacement revision. |
| status | state, refusal | Current protected observation; never execute-if-missing. |
| cancel | cancelled, refusal, unknown, failure | Serialize cancellation against further forward admission. |
| reconcile | state, refusal, unknown, failure | Observe original custody/outcomes only; no new business dispatch. |
| resolve | state, refusal, unknown, failure | Import an attributable issuer-verified original outcome; no invented truth. |
| recover-control | recovered, refusal, unknown | Recover the complete original result of its matching control attempt. |
| history | page, refusal | Protected immutable sequence, bounded page and instance-bound cursor. |

A refusal never discloses protected original inputs, history or provider state.
`failed` control results require independently confirmed control noncommit; a
missing row, timeout or expired lease cannot establish rollback. Unknown control
results retain the SAME host-issued recovery reference. Reusing a capability with
changed operation/request/context refuses without mutating original state.

### Submission equality and control custody

Before dispatch, the host durably registers the exact original request, accepted
source and binding snapshots, authenticated context and native control custody.
If registration is uncertain, dispatch is forbidden. Submit atomically retains
the instance, frozen intent, nonreuse reservation and complete submitted result
before acknowledging or scheduling. Equal concurrent submissions in the trusted
tenant/initiating-principal/key namespace return one original instance and the
same submitted result under current authorization. Status is queried separately.

Equality covers original target revision, admitted input representation INCLUDING
absence and original literal spellings, full Document and immutable trusted
binding identities. No JSON property-order dependency is introduced for input
maps: compare exact key sets and recursively exact admitted values; compare
arrays in order, without Unicode/numeric spelling normalization. Changed target,
inputs or bindings under a retained key conflict, even after termination. The
submission namespace is shared across services acting for that initiator.
Unknown admission is reconciled before another attempt; never mint a new key
as automatic recovery. Expiry disables admission/disclosure but retains a
nonreuse tombstone and unresolved obligations for the namespace's lifetime.

Claim/cancel/reconcile/resolve retain their complete original response atomically
with control changes. Equal control-attempt recovery returns that original
response, not a later status or renewed lease. A claim is not permanent authority.
All controls recheck current protected-operation authorization before lookup.

### Invocation admission, cancellation and ownership

The coordinator serializes instance control, next invocation, cancellation and
fence state. Claim increments an exact unsigned decimal fence without wrap and
uses a 60-second lease on the host clock. Expired/unconsumed claims may be replaced
under that same boundary; stale fences cannot create a new invocation ticket.
Lease expiry never proves provider noncommit or permits repeating an effect.

Before release to a worker, persist one immutable original invocation ticket,
including qualified target, inputs, attribution, provider custody and stable
internal action key. Key encoding is `saga1/<namespace>/<instance>/<ordinal>/<f|c>`:
namespace/instance use the runtime schema's restricted ASCII grammar; ordinal is
canonical unsigned decimal, zero-based step position. The encoding is injective,
within tx/1 key bounds and reserved against outside direct invocation. Internal
keys do not confer authorization. Compensation has a distinct `c` identity.

Issuing a ticket is the cancellation/ownership admission cut: a ticket issued
before cancel/takeover is already in flight and may settle later; a stale worker
cannot issue another ticket. Delivery/redelivery of an existing ticket is not
new business admission. The provider must bind every delivery to that original
custody and enforce tx/1 current authority, action revision, frame and outcome
rules at its own native admission/commit boundary. A queued coordinator ticket
DOES NOT pre-admit a retired action transaction. Checking a fence and then allowing
a worker to choose a fresh action key or target is unsupported.

The provider commits its business effect and complete original tx/1 outcome in
its qualified local atomic boundary. The coordinator may learn that outcome
later; there is no atomic cross-store coordinator/provider commit. A crash in
that gap leaves reconciling state. `execute`/recover-control settle only that
original ticket and original provider result; neither may rerun a different
invocation. Already admitted native transactions may finish after retirement.

Cancel winning the coordinator lock prevents subsequent forward tickets. A
previous ticket must be reconciled before compensation. Cancel after a terminal
phase refuses. If no step committed, settled cancellation becomes cancelled;
otherwise unwind, preserving all confirmed forward and recovery facts. An
acknowledgement of cancellation never claims rollback or settled in-flight work.

### Recovery, retirement and intervention

Unknown provider outcome blocks later forward and ALL compensation admission.
`lookup` missing, HTTP success, local outbox, worker death and timeout are not
business outcomes. Reconcile reads original registered provider custody. An
original committed/rejected/conflict result is retained unchanged. A confirmed
native rollback maps to failed, not a fabricated business rejection. A refusal
before admission produces intervention with its original reason, not success.

This profile allows ONE logical forward invocation and ONE compensation per step,
with zero automatic fresh business retries. Original-outcome lookup may retry
within the budget below. No automatic `invoke` after an indeterminate or known
failed admitted attempt is permitted. Another business attempt requires separately
authorized new intent after original custody is settled; it is not a protocol
resume. Redelivery inside a qualified provider uses the same original ticket/key
and must independently prove deduplication. No exactly-once claim follows.

Retiring a saga definition forbids new instances but permits authorized original
submission recovery and active-instance progress on still-active actions.
Retiring an action revision forbids fresh provider invocation, including pending
compensation; retained lookup/replay remains authorized independently. Retirement
never substitutes a newer revision. Unavailable original interpretation or pinned
provider custody blocks continuation and preserves the obligation for intervention.

`resolve` accepts only an opaque reference to a trusted issuer-retained observation
for the original invocation. The host verifies original provider/tenant/epoch,
identity, revision, complete result and current operator authority. It MUST NOT
accept caller-written success flags, editable screenshots or a new invocation's
result as evidence of the original outcome. Append the actor/evidence and original
observation without rewriting confirmed facts. Contradictory evidence refuses.
Resolution may enrich an intervention state but does not restart automatic work;
this profile has no resume operation. Unresolved custody cannot be bypassed by
closing the instance or expiring its retention. Native reconciliation is a
provider-owned installed capability, never a document-selected URL resolver.

### State and history

`state` is a current protected projection of immutable original observations.
Invocation summaries stay in step order. `pending` lists every ticket without
a definitive original disposition, including unresolved compensations. A fresh
instance has queued phase, all forward states idle and no outcomes.

| Transition | Required condition | Result |
| --- | --- | --- |
| queued → running | First valid forward ticket | Original target/inputs/fence retained before delivery. |
| running/compensating → reconciling | An admitted invocation has unresolved custody | No later business admission. |
| reconciling → running/compensating | Authoritative original result resolves the pending invocation and automatic budget remains | Continue only the original order under current authority. |
| running → succeeded | All required forward results independently confirmed committed; no cancellation won first | Output bindings resolve original committed values. |
| running → compensating | Definitive forward rejection/conflict, or settled cancellation with committed work | Preserve original stop cause and prefix. |
| compensating → compensated | Failure-triggered unwind completes every required compensation, with no irreversible or unresolved work | Original failure and all effects remain in history. |
| queued/running/compensating → cancelled | Cancellation won, all admitted work settled and its declared recovery obligations completed | Includes committed prefix; does not imply rollback. |
| any nonterminal → intervention-required | Required action/provider/authority unavailable; known execution or compensation failure; irreversible barrier; budget exhausted | Record reason, confirmed prefix and remaining obligations. |

An intervention-required phase may retain pending unknown outcomes. Status must
not claim that provider execution has terminated merely because automatic work
stopped. No automatic admissions occur from intervention. Late observations and
attributable resolution append history while retaining that phase. Business
terminal phases succeeded/compensated/cancelled permit reads/recovery only.
Cancellation after intervention returns terminal refusal; existing original
cancel-attempt recovery remains available.

Successful status includes the typed saga output map admitted and retained at
terminal transition. Other phases omit that map; no partial success outputs are
invented. Current status authorization must cover the complete returned payload
or refuse, rather than dropping required fields.

History sequence is an immutable, instance-local bounded integer. Record actual
initiating human and authenticated service in protected custody; exposed `actor`
is a host-assigned protected-safe identity, not document input. Events with an
invocation carry its original identity; outcome events carry its full original
result. No invented success event for a no-effect disposition. History cursors
bind issuer/instance/snapshot high-water mark/position and current disclosure
scope; later events do not rewrite an existing page snapshot. Invalid/cross-scope
cursors refuse. Pagination and status perform no business execution.

### Finite profile limits

These are protocol safety caps, not measured throughput or latency promises.
The action/provider qualification must demonstrate them BEFORE eligibility.

| Resource | Bound and exhaustion rule |
| --- | --- |
| Package/source | CONTRACT-001 ordinary 4,000,000 UTF-16 text, depth 128 and 100,000-value limits; no implicit expanded catalog scope. |
| Selected definition | 1–32 steps; at most 32 inputs/outputs/mappings per invocation; 64 saga declarations per module. |
| Original invocation values/results | At most 65,536 UTF-16 units for each encoded input map and each COMPLETE result; exact value admission still applies. |
| Instance custody | Reserve at most 16,777,216 UTF-16 units of retained package/input/result/control data and 8,192 immutable events before admitting work. |
| Recovery work | At most 16 authoritative lookup attempts per original invocation; no automatic fresh business attempts. |
| Control admission | At most 4,096 distinct mutating control attempts per instance, subject also to the tighter retained-capacity reservation. |
| Automatic duration | 900,000 ms elapsed host time after instance admission; remaining budget persists across restart; expiry stops automatic work, never proves noncommit. |
| Claim | 60,000 ms host lease; monotone exact fence; no wrap or scope reuse. |
| History page | 1–64 events; cursor and disclosure checks on every page. |
| Portable analysis | At most 4,096 obligations/diagnostics; explicit limit refusal, never eligible partial output. |

Provider result bounds must be enforced in its qualified native outcome/effect
boundary: an oversized result cannot commit an effect then lose its outcome.
The host must reserve worst-case custody/history capacity before issuing each
ticket; inability to reserve stops admission. Capacity already promised to an
in-flight ticket is not reclaimed on cancellation, retirement or budget expiry.
Before issuing a new control-attempt capability, reserve its worst-case original
response and recovery custody. If the count/storage budget cannot be reserved,
refuse capability issuance BEFORE admitting a control operation; this pre-admission
refusal has no original-operation replay promise. Previously issued capabilities
and original outcomes remain recoverable. Protected read-only lookup/status do
not consume mutation quota; outsider denials cannot exhaust another instance's
quota or alter its state. No overflowing result/history may be truncated or discarded. If a provider
violates its qualified bound after commit, preserve original custody, flag the
qualification failure and require intervention rather than claiming safe failure.

Time limits are upper bounds on automatic admission/reconciliation work, not
external business termination deadlines. A clock discontinuity may stop work
conservatively; it cannot declare rollback or extend an expired claim implicitly.
All originals, required interpretations and nonreuse protections are retained
for the trusted namespace's lifetime in this first profile. Bounded per-instance
storage does not claim bounded total tenant storage or an operational retention SLO.

## Precedence and Compatibility

The enclosing core and action contracts govern their own meaning. The saga
extension cannot widen their atomics, values, authority or receipts. Shape is
owned by the pinned schemas; behavior is owned by this contract. Exact versions
only: no ranges or unknown-version fallback. Unknown declarations remain retained
but incomplete; unknown runtime request members refuse. Semantic edits are
conservative: initial safe editing requires a fully interpreted Document, not
an inferred dependency closure through unrelated unknown metadata.

Profile retirement and schema evolution create new revisions for new admission.
Disable new saga admission to roll back deployment; preserve unresolved custody,
original results and nonreuse protections. There is no in-flight migration or
conversion that drops saga meaning to manufacture a plain atomic action.

## Error Semantics

Portable diagnostics retain CONTRACT-001 severity/path/message conventions.
`UmfError` refusals apply to unsafe semantic edits; inspection returns diagnostics.
Runtime refusal `code` is protected-safe and never embeds original values.

| Condition | Code / result | Retry and recovery |
| --- | --- | --- |
| Known malformed declaration | SAGA_STRUCTURE, error | Correct authored data before admission. |
| Closed runtime request has unknown/malformed members | SAGA_STRUCTURE, unsupported | No execution, inferred defaults or ignored fields. |
| Ambiguous/missing/late reference | SAGA_REFERENCE, error | Supply complete local package/correct order. |
| Field/Key identity or presence mismatch | SAGA_TYPE, error | Correct mapping; no coercion. |
| Relevant unfamiliar meaning | SAGA_UNCHECKED, warning/unsupported | Retain source; install exact trusted interpretation. |
| Missing profile/provider proof | SAGA_PROFILE, unsupported | No eligibility inferred from metadata. |
| Resource limit | SAGA_LIMIT, error/unsupported | No truncation or dropping prior obligations. |
| Scoped key with changed intent | TOKEN_REUSE, conflict | Recover original; never overwrite it. |
| Expired protected namespace/key | TOKEN_EXPIRED, expired | No fresh effects under expired identity. |
| Missing current permission | AUTHORIZATION, denied | Current independent grant required; no implicit undo right. |
| Retired/unavailable action | REVISION, unsupported | Lookup originals; blocked fresh work requires intervention. |
| Wrong owner/order/cancelled/terminal | SAGA_FENCE / SAGA_ORDER / SAGA_CANCELLED / SAGA_TERMINAL, unsupported | Do not mutate valid instance controls for an outsider/stale request. |
| Lost original custody/acknowledgement | indeterminate with recovery reference | Reconcile the same original; no execute-if-missing. |
| Known original control rollback | SAGA_CONTROL_NONCOMMIT, failed with recovery reference | New authorized control attempt only after independently confirmed noncommit. |
| Unverified resolution/cursor | SAGA_EVIDENCE / SAGA_CURSOR, unsupported | No caller-fabricated facts or cross-instance access. |

A valid original subject's loss of required authority records intervention under
its own qualified control boundary. An unauthorized outsider or stale worker
must not stop another valid instance. Control settlement uncertainty remains
indeterminate rather than fabricating a durable stop.

## Examples

[allocation.json](../examples/saga/allocation.json) is a fabricated complete core
Document with inert action handlers and a saga that reserves, allocates and
releases through trusted aliases. It asserts no provider support.
[submit.json](../examples/saga/submit.json) demonstrates the closed logical request.
The adjacent validation recipe checks structural shapes and existing referenced
action shapes; STP-906/905 allocate semantic/native tests separately.

## Schema Basis

Reuse inspected core 0.10.0 Document/Field/Key/CoreLiteral concepts and existing
actions 0.1.0 Parameter, ActionRef and binding semantics. Reuse tx/1 committed
results from the pinned local source rather than inventing another business
receipt. Local additions are saga ordering/data bindings, compensation disposition,
coordinator controls and protected history. Existing domain packs do not define
portable submission/recovery custody; no domain-specific ontology is imposed.
The proposal schemas are explicit design sources under docs/helix, not registered
production packages or hand-edited outputs of the metamodel compiler. Their
promotion into authored metamodel/package generation must pass ADR-005/006 gates.

## Non-Normative Notes

SD-901 owns the architecture and alternatives. TD-906/905 own portable and consumer
conformance slices. The finite model abstracts several real custody transitions;
it neither selects a production orchestrator nor proves native enforcement.
