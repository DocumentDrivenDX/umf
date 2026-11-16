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
---

# CONTRACT-910 Workflow declarations

## Source and digests

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

## Values, guards and routing

Workflow values are Boolean, Unicode text, signed 128-bit integers encoded as
canonical decimal strings, exact elapsed spans and exact instants. Absence is
distinct from Boolean false and an empty string. Equality and order for elapsed
spans use nanoseconds. Instant equality and order use normalized seconds and
canonical fractions. Text compares in Unicode scalar order without normalization.
Boolean supports equality only.

Predicates have a closed function set. `and` and `or` short-circuit in author
order. Optional fields require a dominating `present` test within that predicate.
Disjunction exports only facts common to all true branches. No field-presence
fact carries over an effect or a wait. Invalid snapshots refuse before predicate
evaluation. Values admitted to the predicate profile evaluate to true or false.

Steps are an array with unique IDs. The graph uses declared successors and
requires a reachable, acyclic path structure whose maximal paths end at exits.
A branch selects the first true case or the required `else`. Presentation
`edges` is inert metadata and supplies no transitions or dependencies.

An entering record checks entry, then step, then applicable effect guards.
Within each due scope, the first true guard selects its declared suppressed
terminal exit. An entry guard sees the entry snapshot. Before claiming an effect,
the consumer supplies fresh record-local facts under `effectFacts` and rechecks
the effect guard. The guard's snapshot does not establish atomicity with the
provider call. Suppression updates from bounce or STOP events are a host
obligation: record them monotonically, idempotently and durably before event
acknowledgment. Reopening requires an explicit authenticated consumer action.

## External actions and outcome windows

An effect declares the input and outcome signature of one open-ended action
binding of kind `external`. This companion signature does not change the
transactional action or Saga profile. An emitted event must name a locally
declared event type. Typed parameters map by name from compatible record
fields. Missing optional inputs remain absent.

The effect declares an ordered identity recipe and enforcement by provider,
ledger, or both. Workflow, record and step parts are mandatory. Enrollment
scope adds the enrollment ID, making an effect distinct upon re-entry.
Record scope omits it, allowing identity to recur across enrollments.
Additional parts may name the effect or required typed record fields.
The identity is a JSON array of label/value pairs, preserving order. Field
values use the scalar profile's canonical form.

Before any provider call, a consumer durably records send intent, including
identity, declared action revision and the captured input body. Body comparison
uses SHA-256 over compact UTF-8 JSON with parameters sorted by ID and scalar
values encoded canonically. A replay requires the same captured body and pinned
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
declared bound. The original body and revision must match, and known acceptance
blocks retry. Reconcile-first requires current reconciliation. The contract
does not certify provider delivery, ordering or external atomicity.

## Waits and event correlation

Both profiles allow a plain pause with exactly one of `for` and `until`.
Relative waits add exact elapsed time to the previous step's logical completion
instant. An entry wait uses the enrollment instant. Absolute waits use the
declared instant. A caller supplies registration time and a logical ordinal
for the registration. A newly registered wait whose deadline already passed
can time out immediately. Month-scale elapsed waits can use fixed days.

The opt-in `umf.workflow.correlated/1` profile accepts early exit on a declared
event. It compares the event type, typed key and exact enrollment pin.
A record-only key without trusted enrollment provenance cannot qualify.
The consumer supplies the complete set up to a logical watermark. An event
must follow registration and precede the deadline. The least matching event
by instant, ordinal and event ID wins. Identical duplicates collapse and
conflicting duplicates fail. Event arrival order is immaterial. The deadline
wins ties. After resolution, the consumer can retain later events for audit
without changing the route. Storage, watermark formation and event delivery
remain consumer obligations.

## Record admission, version drain and intervention

Enrollment identity is scoped to workflow and record. A new enrollment
has a unique enrollment ID. The consumer allocates logical ordinals for
the enrollment's observations. A definition's stable workflow and record
IDs index history across versions. The active version reads the full
prior history for that record. Omitted re-entry policy defaults to
`never`: one lifetime admission. `once` permits one additional terminal
re-entry. `after` measures from the most recent terminal instant.
`always` permits re-entry after each terminal enrollment.

Distinct batch identities produce the same result as any permutation of
singleton admissions over the same record-local histories. A repeated record
in one batch has all its candidates dropped and reported. A duplicate
enrollment ID fails admission. `bounce` retains an active enrollment.
`reenroll` may replace a live earlier-version enrollment only through one
consumer transition that terminates it and admits a new enrollment. A
version label binds one digest. Never overwrite a label with different bytes.

Retain definition and referenced action revisions while pinned enrollments
remain live. Admission pins version and digest. Dispatch and wait preparation
require that exact pin. An authorized operator intervention can cancel or
repin a queued enrollment to a different version of the same workflow.
A dispatched enrollment drains or is cancelled. Repeating the same
intervention ID and disposition returns the original intent. A conflicting
disposition under the same ID refuses. The consumer owns atomic recording,
authorization, provider obligations of cancellation and queue scheduling.

## Evidence

`umf.workflow.evidence/1` records a property, evidence kind, tool and version,
checked profile, exact definition digest, bounds, assumptions and outcome.
A failure needs a counterexample. A different digest or profile marks the
record stale without hiding its outcome. Assessments describe compatibility.
Current evidence remains scoped to the reported model, properties,
assumptions and bounds. Runtime records identify the actual build.
