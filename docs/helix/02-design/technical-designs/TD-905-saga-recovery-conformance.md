---
ddx:
  id: TD-905
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: US-905
      kind: derived_from
    - id: SD-901
      kind: informed_by
    - id: CONTRACT-908
      kind: references
    - id: SPIKE-901
      kind: informed_by
  schemas:
    - id: umf.actions.saga.protocol
      version: "1"
      title: Saga logical protocol
      path: docs/helix/02-design/contracts/schemas/saga-runtime-1.schema.json
      schemaFormat: json-schema
---

# TD-905: Qualify saga submission and recovery guarantees

**User Story:** [[US-905-saga-recovery-conformance]] | **Feature:** [[FEAT-901-saga-semantics]]
**Solution Design:** [[SD-901-saga-semantics]]

## Scope

Shared consumer-protocol conformance fixtures and independent execution witnesses.
The host implements its own coordinator under CONTRACT-908. UMF does not ship a
production scheduler or choose Batten's durable runtime in this slice.

## Technical Approach

Use original coordinator custody, original provider custody and independent
provider observations as three separately observable surfaces. Inject faults at
submission/control commit, ticket issue, native admission, provider effect/outcome
commit, coordinator observation and acknowledgement. An assertion based only on
the coordinator's own emitted history cannot qualify a provider guarantee.

The first native target is the existing bounded PostgreSQL reference consumer,
with isolated coordinator and two target stores. The harness pins actual source,
server/driver/build and installed profile digests before results. Original tx/1
outcomes must commit with business effects; coordinator updates may lag. Schema
references and host claims remain inert until independently qualified.

The host owns immutable instance intent, trusted binding snapshots, scoped key
registry, original control responses, one ticket per logical invocation, current
fences/cancellation and protected audit. Construction receives trusted provider
instances and current-authority interfaces explicitly. No fixture or Document
creates a connection, installs code, selects a tenant or bypasses revocation.

## Component Changes

Paths below are planned conformance locations. No production orchestrator is
introduced into the portable library.

| Location | Owned responsibility | Boundary |
| --- | --- | --- |
| `tests/saga/recovery-cases.json` | Shared scenario names, injected cuts and independently specified outcomes | Inert fixtures; no vendor implementation types. |
| `tests/saga/reference-consumer.py` | Qualified test-only coordinator/control registry and provider wiring | Host/native APIs here only; no import from portable library into this executor. |
| `tests/saga/native-recovery.py` | Crash/restart, cancellation, authority, retirement and provider observations | Direct original custody queries; do not replace the native subject with a mock. |
| `tests/saga/history-oracle.py` | Independently compare original requests/results and provider facts | No reuse of coordinator transition implementation to manufacture expected histories. |
| `tests/saga/protocol.test.ts` | Closed request/result unions, protected refusal and witness transport | Shared schema/types and native fixture driver only. |
| `docs/helix/02-design/experiments/saga/formal/` | Abstract coordination and two-stage admission analysis | Experiment only; no runtime provider code. |

The native test coordinator may use the existing PostgreSQL reference test
infrastructure; it is not a product delivery or an implied Batten dependency.
Consumer changes must not leak driver/queue/native types into Rust saga analysis,
core wire payloads or browser entrypoints. Extend the architecture boundary
checker before implementation and add negative controls for those imports.

## API/Interface Design

CONTRACT-908 and the runtime schema own the logical operations and full result
unions. The harness drives these exact operations through explicitly installed
host bindings. It observes original submitted/control results separately from
current status; replaying a claim is not lease renewal. It verifies all original
snapshots, keys, provider scopes and evidence identities before accepting a case.

## Security

Tests must exercise a separately authenticated initiating human and worker,
independent compensation privilege, protected status/history and current
revocation. Outsider/stale requests cannot stop another instance. Native gateway
admission checks cannot trust principal/provider claims from a Document. Manual
resolution uses issuer-retained observations, preserves conflicting facts and
never resumes automatic work in the first profile.

## Performance

CONTRACT-908 fixes safety caps and zero automatic fresh business retries. The
harness verifies reservation of result/history capacity before dispatch and
recovery limits after restart. No load, latency or total tenant retention claim
follows from bounded case execution. Runtime claims name their exact resource
subset and observed environment.

## Testing

US-905-AC1 through US-905-AC24 govern this slice; STP-905 maps all 24 ACs. Cover original submit/claim/cancel response loss as well
as forward/compensation acknowledgement loss. Pin original action/binding custody
through deployment and retirement. Test outcome/retention bounds without
truncation and refuse unknown external-effect profiles. The independent oracle
must reject histories that omit a provider effect, invent noncommit, duplicate
an invocation or import an unrelated success as manual resolution.

## Formal Specification

Chosen rigor is finite executable analysis for saga coordination, not an
unbounded theorem or implementation refinement proof. `Saga.tla` models one
submission key, two intents, two/three ordered compensable steps, one crash and
one takeover. It separates durable provider truth from coordinator observation.
Safety has no fairness; stable-environment progress weakly fairs finite work.
The preserved 18-case result records exact model/configuration/tool hashes.

The detailed protocol additionally separates coordinator ticket issue from
provider native admission. `Admission.tla` checks that cut: cancel/takeover fence
new tickets while already issued work can settle; retirement blocks a native
transaction not yet admitted while an already admitted transaction may finish.
Its own pinned configurations, mutants and reachability witnesses are recorded
separately. It is a focused boundary model, not the product of both state spaces.

| Model element/property | Contract obligation | Planned enforcing boundary/test | Residual |
| --- | --- | --- | --- |
| Submit / OneSubmission / IntentPinned | Scoped immutable admission and original result | Coordinator uniqueness/serialization plus STP-905 AC21/22 | Equality encoding, crash durability and multiple tenants need native witnesses. |
| Dispatch / NoUnknownAdvance | Original custody before dependent work | Coordinator pending-ticket barrier; AC4/5/7/10 | Real provider lookup/termination cannot be assumed. |
| Provider outcomes / NoDuplicateEffects | One logical effect per original key | Native atomic effect/outcome and reserved keys; AC6 | Provider deduplication is assumed in the abstract model. |
| Compensation / ReverseCompensation | Descending committed-step unwind, stop on failure | Original-prefix scheduler; AC3/9 | Business compensation effectiveness is action-specific. |
| Ownership/CancellationFence | New ticket admission cut | Serialized ticket registry; AC11/15 | Cross-process enforcement needs independent provider evidence. |
| RetirementFence and admission model | Definition/action retirement are distinct; queued ticket is not native admission | Provider revision gate; AC14/23/24 | Deployment custody and current authorization remain native obligations. |
| HonestTermination / OutcomesSound | No invented success or hidden unknown | Original-provider observation oracle; AC1/2/16/18 | Irreversible actions and manual resolution are not in the abstract model. |

Formal recheck triggers: change submission equality, ticket/native admission cut,
ordering, compensation/cancellation/retirement transitions, retry semantics,
fence rules or any safety/progress assumption. Native correspondence checks
must be rerun when a provider/driver/authority/custody implementation changes.

## Migration & Rollback

No automatic instance migration, resume or fresh business retry. Disable new
admissions on rollback; retain the exact original provider/control/outcome
custody and nonreuse protections. Missing interpretation blocks unsafe work.

## Schema Basis

Reuse current-core exact values, local action identities and tx/1 results.
The runtime schema supplies only coordinator/control shapes. No generic receipt,
entity identity or permission system replaces provider-native meaning.

## Risks

The coordinator's transactional lock cannot make a separate provider store atomic.
Durable tickets and provider outcomes bridge that gap through reconciliation,
not a distributed commit claim. A successful model or schema run does not prove
that any planned consumer or native witness already exists.
