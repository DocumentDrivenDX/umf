---
ddx:
  id: CONTRACT-910
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: ADR-007
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-065
      kind: informed_by
    - id: CONTRACT-909
      kind: informed_by
  schemas:
    - id: umf.workflow
      version: "0.1.0"
      title: Workflow extension payload
      path: spec/extensions/workflow/schema.json
      schemaFormat: json-schema
    - id: umf.workflow.compile
      version: "1"
      title: Workflow compile profiles
      path: spec/extensions/workflow/workflow-1.schema.json
      schemaFormat: json-schema
    - id: umf.workflow.evidence
      version: "1"
      title: Scoped workflow conformance evidence
      path: spec/extensions/workflow/evidence-1.schema.json
      schemaFormat: json-schema
---

# CONTRACT-910 Workflow declarations

## Purpose

Describe a portable per-record workflow with typed effects, guards, pauses
and explicit exits. Consumers can inspect or prepare the same declaration.

## Scope and boundaries

UMF owns the declaration, validation and pure decisions over supplied state.
The consumer owns the authorized snapshot, runtime clocks, dispatch,
scheduling, state custody and provider integration under ADR-007.

## Normative surface

### Source and digests

The registered module payload carries the original UTF-8 JSON definition as
`source`. Compilation accepts that exact byte sequence and a selected profile.
The Rust interchange API retains original bytes and the exact native tree.
A member unknown to the selected definition grammar has a JSON Pointer finding.
Inspection accepts a valid known portion and returns it as incomplete.
Compilation of the same source refuses each unknown member. Duplicate decoded
keys, malformed known values and unpaired surrogates fail both tiers. A
caller edits by supplying new source bytes for reinspection and preparation.

The source pin is SHA-256 over exact bytes. Preparation also emits compact
canonical JSON with object keys sorted, presentation edges omitted and elapsed
operands in the `count` carrier using canonical nanoseconds and unit `ns`.
Definition evidence hashes these lowered bytes. Equivalent elapsed spellings
share a lowered digest while retaining distinct source pins.
Effects include a required action identifier and SHA-256 revision pin. All
referenced effect revisions are included transitively in this digest because
their pins are embedded in the source. Local IDs resolve within the definition,
with no network discovery or implicit revision selection. Runtime binding must
use the selected action and verify the pinned revision before dispatch. The
consumer owns availability, provenance and authenticity of bound actions.

### Values, guards and routing

Workflow values are Boolean, Unicode text, signed 128-bit integers encoded as
canonical decimal strings, exact elapsed spans and exact instants. Absence is
distinct from Boolean false and an empty string. Equality and order for elapsed
spans use nanoseconds. Instant equality and order use normalized seconds and
canonical fractions. Text compares in Unicode scalar order without normalization.
Boolean supports equality only. For orderable values, `le(a,b)` is
`not(lt(b,a))`, `gt(a,b)` is `lt(b,a)`, and `ge(a,b)` is
`not(lt(a,b))`. Consumers lower these derived forms into the closed set.

The `umf.workflow.predicates/1` profile has a closed function set. `and` and `or` short-circuit in author
order. Optional fields require a dominating `present` test within that predicate.
Disjunction exports only facts common to all true branches. No field-presence
fact carries over an effect or a wait. Invalid snapshots refuse before predicate
evaluation. Values admitted to the predicate profile evaluate to true or false.

Steps are an array with unique IDs. The graph uses declared successors and
requires a reachable, acyclic path structure whose maximal paths end at exits.
A workflow may declare enrollment-local `runState` entries. Each entry has
a unique ID and a typed literal `initial` value. Its ID cannot shadow a
record field or effect fact. New enrollments initialize all entries. Guards
and branches read the combined record and run-state snapshot. A `set` step
evaluates due guards before preparing a state update and its `next` route.
`assign` takes a same-domain literal or required field. `increment` adds
a same-domain integer operand with checked signed 128-bit arithmetic.
The host commits the update and successor as one transition against that
snapshot and reuses the committed result on retry. A suppressed or overflowing
step writes nothing. State expires with its enrollment. Effects still bind
their input and identity from the record, and waits correlate on record fields.

A branch selects the first true case or the required `else`. Presentation
`edges` is inert metadata and supplies no transitions or dependencies.

An entering record checks entry, then step, then applicable effect guards.
Within each due scope, the first true guard selects its declared suppressed
terminal exit. An entry guard sees the entry snapshot. Before claiming an effect,
the consumer supplies the declared facts under `effectFacts` and rechecks
the effect guard. A suppression fact may be a copy of an account-scoped
register with the declared maximum staleness. A lift must reach every copy
before it re-enables sends. The guard snapshot does not establish atomicity
with the provider call.

Every event requires a disposition. It either has no write or monotonically sets a
named suppression store. The compiler resolves the store, checks its key
type, and requires a distinct required Boolean effect fact. Every store's
fact must have an effect-scope guard that directly suppresses on true or
contains that check in a disjunction. The portable write intent names the
scope, store, fact, typed key and declared staleness. The host resolves the
store key from authenticated context for the declared scope and supplies that
key on the event. On reads the host resolves the same scoped identity before
populating the effect fact. Consumers must not infer a store key from a
recipient or any other record field. Use the declared event type ID as the
portable suppression reason and the source event ID for audit and idempotency.
A matched guard is identified by the pinned definition digest and its
zero-based index in `guards`. Hard bounce may be
emitted by an effect and inbound STOP can use the same suppression rule.
Record the write idempotently and durably before event acknowledgment.
Only an explicit authenticated consumer action can lift suppression.

### External actions and outcome windows

The `umf.workflow.external-effect/1` companion profile declares the input and
outcome signature of an open-ended action binding of kind `external`. This companion signature does not change the
transactional action or Saga profile. An emitted event must name a locally
declared event type. Typed parameters map by name from compatible record
fields. Missing optional inputs remain absent.

The effect declares an ordered identity recipe and enforcement by provider,
ledger, or both. Workflow, record and step parts are mandatory. Enrollment
scope adds the enrollment ID, making an effect distinct upon re-entry.
Record scope omits it, allowing identity to recur across enrollments.
Additional parts may name the effect or required typed record fields.
The identity is a JSON array of label/value pairs, preserving order. Field
values use domain/value pairs with the scalar profile's canonical form.

Before any provider call, a consumer durably records send intent, including
identity, declared action revision and the captured input body. Body comparison
uses SHA-256 over compact UTF-8 JSON with parameters sorted by ID and scalar
values encoded as canonical domain/value pairs. A replay requires the same captured body and pinned
action revision. A conflicting body under the same identity refuses. The
consumer owns the ledger and its pending, retryable, accepted and held states.

An unawaited effect follows its single `next` after durable dispatch admission.
Its reported outcomes have no workflow routes. Acceptance mode waits for typed
acceptance, definitive failure, retriable failure, unknown, or engine timeout
as declared. Result mode may observe acceptance while continuing to await a
typed final outcome. Each awaited declared outcome has one explicit successor.
Engine timeout is a distinct text outcome generated at the deadline measured
from durable intent time. Deadline wins a tie. An accepted result-mode effect
can time out without turning its acceptance into rejection. A window resolves
once. The consumer records late observations without revising resolution.

Unknown remains a separately routed outcome. An engine timeout proves only
that the observation window elapsed. Neither authorizes an automatic resend.
A consumer may propose a retry after an eligible retriable, unknown, or timeout
outcome under a declared idempotent or reconcile-first class, within its
declared bound. Idempotent retry requires provider enforcement. The original body and revision must match, and known acceptance
blocks retry. Reconcile-first requires current reconciliation. The contract
does not certify provider delivery, ordering or external atomicity. The
consumer owns send permission and per-contact and per-account caps. A cap
is atomic only within the consumer group whose store enforces it.

### Waits and event correlation

Both profiles allow a plain pause with exactly one of `for` and `until`.
Relative waits add exact elapsed time to the previous step's logical completion
instant. An entry wait uses the enrollment instant. Absolute waits use the
declared instant. A caller supplies registration time and a logical ordinal
for the registration. A newly registered wait whose deadline already passed
can time out immediately. The workflow source's elapsed-text carrier accepts
`PT` time components. Consumer authoring can lower `PnD` and `PnW` to the
count carrier with `fixed-day` or `fixed-week`. Raw workflow source refuses
those text forms with a lowering diagnostic. A standalone CONTRACT-909
scalar helper can read them explicitly as fixed spans. Calendar years and
months require a separate profile.

The opt-in `umf.workflow.correlated/1` profile accepts early exit on a declared
event. It compares the event type, typed key and exact enrollment pin.
A record-only key without trusted enrollment provenance cannot qualify.
The consumer supplies the complete set up to a logical watermark. An event
must follow registration and precede the deadline. The least matching event
by instant, ordinal and event ID wins. Within an enrollment, repeated
observations with the same event ID and identical kind, typed key and
provider instant collapse to the earliest observation ordinal. If the kind,
typed key or provider instant differs, the resolver reports
the ID for audit and excludes that ID from the unresolved candidate set.
Other events and the deadline stay eligible. Event arrival order is
immaterial. The deadline wins ties. After resolution, the consumer can retain later events for audit
without changing the route. Storage, watermark formation and event delivery
remain consumer obligations. The selected event changes routing only.
Event payload writes and branches on event content are outside these profiles.
The next step reads a validated host-supplied snapshot. A record field such
as `response` has no declared causal connection to the selected event.

### Record admission, version drain and intervention

Enrollment identity is scoped to workflow and record. A new enrollment
has a unique enrollment ID. The consumer allocates logical ordinals for
the enrollment's observations. A definition's stable workflow and record
IDs index history across versions. The active version reads the full
prior history for that record. Omitted re-entry policy defaults to
`never`: one lifetime admission. `once` permits one additional terminal
re-entry. `after` measures from the most recent terminal instant.
`always` permits re-entry after each terminal enrollment. Consumer
`after_duration` lowers to `after`.

The consumer selects the audience or source, applies any per-record
`where` filter and resolves stable record keys before handing candidates
to admission. The definition's `entry` declares the first step.

Distinct batch identities produce the same result as any permutation of
singleton admissions over the same record-local histories. Consumers may
validate distinct record keys at the boundary and reject the entire batch
before any admissions. When a batch with a repeated record key is accepted
for processing, all candidates for that key are dropped and reported. A duplicate
enrollment ID fails admission. `bounce` retains an active enrollment.
`reenroll` may replace a live earlier-version enrollment only through one
consumer transition that terminates it and admits a new enrollment. A
version label binds one digest. Never overwrite a label with different bytes.

Retain definition and referenced action revisions while pinned enrollments
remain live. Admission pins version and digest. Dispatch and wait preparation
require that exact pin. A definition can declare allowed operator dispositions
`cancel` and `repin` under `interventions`. Each intervention ID is
`id@key` and scoped to workflow and record key. An authorized operator
can repin a queued enrollment to a different version of the same workflow.
Queued means entry has never started. There is no pending deadline, open
effect window or committed run-state update to carry across a repin. Initialize
the target version's state when it starts. A started enrollment drains or is
cancelled. Cancellation atomically retires routing eligibility and invalidates
pending wait deadlines and effect continuations. Retain durable effect intent
and late receipts for reconciliation. Cancellation alone supplies no evidence
that an in-flight effect was unapplied. Repeating the same
intervention ID and intent is idempotent. A changed target, original
enrollment or disposition under the same scoped ID conflicts. The consumer owns atomic recording,
authorization, provider obligations of cancellation and queue scheduling.

### Evidence

`umf.workflow.evidence/1` records a property, evidence kind, tool and version,
checked profile, exact definition digest, bounds, assumptions and outcome.
A `failed` verdict needs a counterexample. Use `inconclusive` with a reason
when a cap, timeout, unsupported semantics or tool error prevents a verdict.
A completed bounded check can pass within its declared assumptions and
bounds. Record the actual model or interpreter revision in `toolVersion`.
A different digest or profile marks the record stale without hiding its outcome. Assessments describe compatibility.
Current evidence remains scoped to the reported model, properties,
assumptions and bounds. Runtime records identify the actual build.


## Precedence and compatibility

An explicit compile-profile selection controls preparation. A source profile
or metadata field cannot choose another runtime. The correlated profile adds
event correlation to the same plain-pause syntax. Embedded action revision
pins resolve before provider dispatch. The workflow profile is independently
versioned from the transactional Action, Saga, predicate and duration profiles.

### Rust consumers

Use `umf_core::workflow::inspect_source` and `compile_source` to pass the
original bytes and select a typed `WorkflowProfile` with standard limits.
Callers supplying their own resource limits can use `inspect` and `compile`.
The workflow module is available with Cargo default features disabled.
The supported toolchain baseline for this change is Rust 1.90.0. The workflow
profiles and Rust interfaces in this draft are subject to review. Definition
and evidence versions are separate from the crate version, and consumers
should check the profile in addition to the crate version. Incompatible
changes to qualified wire semantics require a new profile identifier.
Core's unpatched workflow dependencies use Cargo-compatible version ranges.
Registry companion dependencies that carry UMF compatibility patches retain
their qualified versions.

The source tree currently uses the 0.10.12 version line. The existing
0.10.12 registry release predates this workflow API. A workflow-bearing
registry version must be assigned and qualified through the release pipeline.

## Error semantics

Inspection labels each unknown member unchecked at its JSON Pointer.
Compilation refuses those findings. A source or shape error stops preparation.
A semantic finding identifies the offending step, member or obligation.
Runtime helpers refuse malformed inputs without changing admitted state. An
already resolved window records later observations as late. A wait rejects
a second resolution attempt. The consumer owns durable audit records.

## Examples

The [Follow-up reply declaration](../../../../crates/umf-core/tests/fixtures/workflow/reply.json)
contains an accepted external send, a 90-fixed-day correlated wait and a
branch that guards an optional reply before sampling it. Its timeout,
unknown, suppression and stale-event cases are allocated in [STP-910](../../03-test/test-plans/STP-910-workflow-declarations.md).
