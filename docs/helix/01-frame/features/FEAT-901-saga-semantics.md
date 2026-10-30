---
ddx:
  id: FEAT-901
  type: feature-specification
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.prd
      kind: derived_from
    - id: umf.cross-cutting-requirements
      kind: informed_by
    - id: FEAT-900
      kind: informed_by
    - id: CONTRACT-900
      kind: informed_by
    - id: CONTRACT-901
      kind: informed_by
    - id: CONTRACT-904
      kind: informed_by
---

# FEAT-901: Declarative saga semantics

**Feature ID:** FEAT-901
**Priority:** P0 within the saga capability; release order remains owner-selected.
**Owner:** Erik LaBianca
**Covered PRD Subsystem(s):** Saga Composition and Recovery
**Covered PRD Requirements:** FR-57; supporting FR-4/5/22/27/34/39/41.
**Cross-Subsystem Rationale:** One capability: describing and assessing a recoverable composition of independently committed actions.

## Overview

UMF must represent sagas through a separately versioned companion to its action
vocabulary. A saga coordinates independently committed steps and explicitly
declared business compensation. UMF supplies portable semantics and inspection;
consuming systems supply durable execution and qualify their guarantees.

## Ideal Future State

An application developer can explain a process before deployment: which actions
run, what data flows between them, which effects can be compensated, and when
operator intervention is required. A host can assess the same declaration
against its supported profiles without weakening any referenced action contract.

## Problem Statement

Single-store actions cannot describe recovery across independently committed
services. Treating a timeout as failure can duplicate an external effect;
calling compensation rollback can hide effects that remain observable.
Consumers need shared, inspectable semantics for partial completion and recovery.

## Functional Areas

| Area | User question | Feature responsibility |
| --- | --- | --- |
| Composition | What is intended to happen? | Stable references, typed data flow, explicit order and compensations. |
| Recovery obligations | What happens after interruption or failure? | Outcome uncertainty, retries, cancellation and intervention meaning. |
| Assessment and exchange | What can this consumer actually support? | Preservation, compatibility, diagnostics and evidence separation. |

### Distinct concepts

- **Saga definition:** immutable, versioned intent; contains no execution state.
- **Saga instance:** one host-admitted execution bound to that intent and trusted scope.
- **Step:** one invocation of an existing action under an exact execution profile.
- **Compensation:** a separately authorized business action addressing an earlier
  effect. It does not erase history or promise restoration of the original state.
- **Attempt:** a dispatch/recovery observation for a stable logical invocation;
  another attempt does not automatically permit another business effect.

## Requirements

### Composition

- **SAGA-01:** Authors must declare stable saga and step identities, exact
  definition/model/action/profile dependencies, typed inputs and observable
  completion outputs. Display names must not resolve identities.
- **SAGA-02:** The initial profile must describe a finite, explicitly ordered,
  sequential composition. Every data dependency must reference saga inputs or
  an earlier completed step's declared outputs. Cycles, missing references,
  incompatible types and unavailable outputs must prevent eligibility.
- **SAGA-03:** Steps must reference exact action declarations and their declared
  recipe or inert handler bindings. Composition must preserve each action's authorization, attribution,
  frame, atomicity, result and replay obligations. It must introduce no parallel
  mutation language and must not broaden single-store action guarantees.
- **SAGA-04:** Each step must explicitly declare whether compensation is available,
  unnecessary under a stated effect profile, or unavailable because the effect
  is irreversible. Absence must not imply reversibility or safe omission.
- **SAGA-05:** A compensation must name an exact action and declare typed input
  bindings from retained saga inputs and original forward outcomes. The initial
  profile must compensate eligible committed steps in reverse completion order.
- **SAGA-06:** Declared success must mean every required forward step has its
  independently confirmed successful outcome. A compensated termination must
  preserve the original failure and completed forward/compensation history.
  Neither outcome may imply a distributed atomic commit or isolation.

### Recovery obligations

- **SAGA-07:** An executor profile must require durable saga-instance, step and
  compensation identities, pinned intent and original outcomes. Restart,
  redelivery and coordinator takeover must retain those identities and prevent
  obsolete ownership from admitting additional work.
- **SAGA-08:** Dispatch and outcome persistence boundaries must be explicit. A crash
  after an effect but before coordinator acknowledgement must remain recoverable
  without treating a missing local record as proof that the effect did not occur.
- **SAGA-09:** A lost acknowledgement, timeout or unresolved remote outcome must
  remain indeterminate until independently reconciled. The initial profile must
  block later forward steps and compensation while the relevant outcome is
  indeterminate. It must not convert elapsed time into known failure.
- **SAGA-10:** Retry policy must distinguish original-outcome recovery, safe
  redelivery of the same logical invocation, and a newly authorized business
  attempt. Profiles must require explicit finite retry/time budgets and
  supported deduplication or noncommit evidence. No exactly-once claim follows
  from coordinator persistence or caller keys alone. A definitive forward
  noncommit must unwind previously committed work without fabricating rejection;
  the first profile adds no automatic fresh business retry.
- **SAGA-11:** Compensation must have its own durable invocation, replay and
  reconciliation obligations. A compensation failure must remain visible. The
  initial profile must stop automatic unwinding at an unresolved or failed
  compensation and expose the remaining work for authorized intervention.
- **SAGA-12:** Cancellation must fence admission of subsequent forward work and
  reconcile in-flight effects before applying declared compensation policy.
  A cancellation acknowledgement must not claim rollback or completed recovery.
  Once failure-triggered unwind starts, cancellation must refuse without changing
  its original cause or terminal classification.
- **SAGA-13:** Irreversible effects and exhausted recovery budgets must permit an
  explicit intervention-required outcome carrying the confirmed completed prefix
  and unresolved obligations. Resolution must be attributable and evidence-based;
  an operator must not fabricate a successful external outcome. Authorized closure
  of a settled intervention may accept residual effects with attributable evidence;
  unresolved custody must prevent closure and closure must never imply compensation.
- **SAGA-14:** Current authority must independently govern submission, forward
  steps, compensation, cancellation, protected history and intervention. Queued
  work must retain authenticated initiator/service/delegation meaning. Revoked
  forward authority must not silently grant compensation authority.
- **SAGA-15:** Execution must preserve tenant, resource and provider scope from
  trusted host bindings. Definition content must not supply credentials, confer
  authority, select another tenant or install executable handlers.
- **SAGA-16:** Active instances must retain their original definition and action
  interpretations across deployment, retirement and recovery. Retention expiry
  must preserve nonreuse protections; loss of required interpretation or outcome
  evidence must block unsafe continuation. Saga-definition retirement prevents
  new instances; it does not by itself retire referenced actions or stop an
  existing instance. Referenced-action retirement retains lookup/replay of prior
  outcomes but fences every fresh forward or compensation invocation under tx/1.
  Only an already admitted action transaction may finish under that profile.
  If fresh required work is blocked, the saga must expose intervention-required
  with retained outcomes and pending obligations; it must not silently rebind to
  a newer revision or label recovery complete. Saga admission does not pre-admit
  all future steps. No automatic in-flight migration is implied.
- **SAGA-17:** Protected inspection must distinguish confirmed forward success,
  business rejection, execution failure, uncertainty, compensation progress,
  cancellation and required intervention. Audit must correlate initiator,
  service, revisions and recovery decisions while preserving disclosure policy.

### Assessment and exchange

- **SAGA-18:** JSON/YAML exchange and semantic edits must preserve native and
  unknown content. Relevant unknown semantics must block execution eligibility
  and unsafe editing; known malformed declarations must be diagnosed separately.
- **SAGA-19:** Assessment must separately report declaration validity, semantic
  completeness, action/profile support, saga coordination support and qualified
  execution evidence. Metadata validation must perform no business effects,
  artifact-driven code loading or implicit network resolution.
- **SAGA-20:** External effects require a separately versioned action declaration
  contract as well as qualified execution profiles covering effect boundaries,
  outcome discovery, retries and compensation capabilities. Actions 0.1.0 requires
  single-store atomicity for recipes and handlers; changing a handler/profile
  cannot relax that requirement. Until a compatible external-effect declaration
  contract exists, the executable saga subset must refuse external-effect steps
  and remain limited to supported transactional actions across trusted bindings.
  An HTTP success, an outbox entry or a Tether session alone must not establish
  external business completion. Unsupported profiles must refuse eligibility.
- **SAGA-21:** An executable profile must expose finite bounds for definition size,
  retained values, histories, retries and evaluation work. Limit exhaustion must
  not publish an eligible truncated definition or discard recovery obligations.
- **SAGA-22:** Independent implementations must be comparable using shared
  declaration fixtures and execution histories with independently specified
  expected outcomes. Support claims must name exact versions, subsets and
  evidence; browser inspection parity must not imply durable host execution.

- **SAGA-23:** Submission must bind a stable identity in the trusted tenant and
  initiating-principal namespace to immutable definition revision, complete typed
  inputs and trusted execution-binding identities. Concurrent equal submissions
  and acknowledgement-loss retries must resolve to one original instance;
  changed intent under the same identity must conflict without new effects.
  Admission and original submission-result custody must be durable before reply
  or dispatch. Unknown admission must be recovered, never replaced with a new
  identity automatically. Current authority governs protected recovery; expiry
  retains nonreuse protection. Step deduplication alone does not satisfy this.

### Non-Functional Requirements

- Portable inspection must follow ADR-002's TypeScript/Bun and browser boundary;
  the same supported inputs must yield equivalent diagnostics in Bun and Chromium.
  ADR-006 selects the shared Rust engine with browser WASM; TypeScript remains
  host presentation/tooling, without a separate semantic implementation.
- Preservation must exhibit zero unreported loss in the declared round-trip corpus.
- Authenticated history disclosure and runtime effect enforcement require separate
  consumer evidence under the selected security and runtime-boundary concerns.
- CONTRACT-908 selects finite admission, recovery and custody caps for the
  sequential profile. Throughput, latency and total tenant retention SLOs remain
  unclaimed; native qualification must pin its exact workload and environment.

## User Stories

- [US-906: Author and assess a saga](../user-stories/US-906-author-and-assess-sagas.md).
- [US-905: Assess saga recovery guarantees](../user-stories/US-905-saga-recovery-conformance.md).

## Edge Cases and Error Handling

- An irreversible notification followed by failure retains its delivered effect;
  compensation of other steps cannot label the entire process rolled back.
- Concurrent changes may make a compensation conflict with current business state;
  compensation must obey its action contract and may require intervention.
- A nondeterministic agent result must retain its original committed output for
  recovery and data binding; rerunning the model is a new effect unless its exact
  provider profile proves safe replay.
- A host that cannot discover an external outcome leaves it indeterminate and
  requires intervention; it must not guess an outcome to unblock the process.
- Failure before any effect does not invent compensation work. A failed step with
  partial external effects requires its own explicit effect/recovery profile.

## Constraints and Assumptions

The separately versioned `umf.actions.saga` 0.1.0 proposal and sequential/1
profile are specified in [CONTRACT-908](../../02-design/contracts/CONTRACT-908-saga-semantics.md).
All dependencies are packaged in one immutable current core 0.10.0 Document;
trusted aliases may bind its actions to independent stores. There is no network
resolution or cross-document identity rewriting.
No changes to core, tx/1 or bulk/1 semantics are authorized by this feature.
Compensation restores a declared business condition only when its contract and
evidence establish that condition. It provides no isolation from concurrent work.

Existing fidelity, identity/composition, reproducibility, bounded-processing,
conformance and durable runtime-boundary concerns apply. No new runtime,
datastore, queue, framework, UI or authentication provider is selected. Batten
is an intended consumer; UMF must remain independently implementable.

## Dependencies

FR-57 governs scope. FEAT-900 and CONTRACT-900/901 govern existing action and
transactional meaning; CONTRACT-904 governs bulk coordination independently.
CONTRACT-001 owns extension registration and preservation; CONTRACT-040/041/049
own model references and values. CONTRACT-908 owns the shared
surface; SD-901, TD-906/905 and STP-906/905 own design and acceptance allocation.
Schema/formal analysis is distinct from future semantic/native qualification.

## Formal validation boundary

[SPIKE-901](../../02-design/spikes/SPIKE-901-saga-recovery.md) uses TLA+ and TLC
for bounded submission, coordination and retirement analysis. The model must keep
provider truth separate from coordinator observations, check safety without
fairness, state progress assumptions separately and demonstrate counterexamples
for removed safety guards. These checks do not satisfy native executor evidence
or the unmodeled declaration, authorization and retention acceptance criteria.

## Out of Scope

Running a durable orchestrator inside UMF; distributed atomic transactions;
automatic inverse-action generation; assumed exactly-once external effects;
generic workflow language design; parallel branches, dynamic loops, nested sagas
and choreography in the initial profile; automatic migration of running instances;
choosing Batten's runtime, ux-builder screens or another consumer's deployment.

## Decisions and Qualification Boundaries

- **Initial profile:** sequential orchestration, reverse compensation and a stop
  on failed/uncertain compensation or an irreversible barrier. No automatic
  fresh business retries or automatic resume from intervention.
- **Repository/release:** actions and saga semantics remain in UMF with its shared
  types, generated schemas and engine. The SDK joins the 0.10 release series;
  vocabulary/protocol identities retain their distinct meanings.
- **Packaging:** one supplied immutable core 0.10.0 Document with local model and
  action references; host aliases select only already installed trusted bindings.
- **External effects:** ineligible under actions 0.1.0. A future compatible
  declaration contract and independently qualified provider profile are required.
- **Recovery policy:** CONTRACT-908 fixes lookup/time/custody caps and namespace-
  lifetime original retention/nonreuse. The sequential/1 profile is explicitly a
  short-running, at-most-15-minute automatic profile. Payload erasure during the
  namespace lifetime is unsupported; admission must refuse incompatible retention
  requirements. Limits are safety caps, not service SLOs.
- **First qualification target:** the existing bounded PostgreSQL reference
  consumer with isolated coordinator and two target stores. Exact sources,
  binary/driver/build and installed profile digests are required in the eventual
  native receipt; this proposal makes no native support claim.
- **Readiness:** requirements and the selected semantic design are reviewable as
  one packet. Shared runtime implementation, native authority/custody witnesses,
  external profiles, production Batten hosting and release approval are separate.

## Source of Direction

Owner request in the Batten/UMF discussion, 2026-10-29: write requirements for new
UMF saga semantics building on actions. Existing action guarantees constrain the
addition. Compensation terminology is grounded in Microsoft's
[Compensating Transaction pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/compensating-transaction).
