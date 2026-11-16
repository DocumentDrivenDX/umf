---
ddx:
  id: umf.plan.workflow-dsl
  type: implementation-plan
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.prd
      kind: informed_by
    - id: umf.cross-cutting-requirements
      kind: informed_by
    - id: TP-001
      kind: informed_by
    - id: ADR-006
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-049
      kind: informed_by
    - id: CONTRACT-065
      kind: informed_by
    - id: CONTRACT-080
      kind: informed_by
    - id: CONTRACT-900
      kind: informed_by
    - id: CONTRACT-902
      kind: informed_by
---

# Workflow DSL implementation plan

## Scope

Support a portable, versioned declaration for a per-record workflow that sends
an external effect, waits for a reply or deadline, branches, and exits. UMF
owns interchange, static validation, deterministic preparation and evidence
formats. Consumers own scheduling, clocks, event ingestion, state persistence,
effect delivery and operational recovery under NFR-50.

**Governing artifacts**

- FR-3 and FR-28 distinguish shared ideal admission from replacing native forms.
  NFR-40, NFR-41 and NFR-50 govern partial support, core evolution and runtime
  ownership. [PRD](../01-frame/prd.md), [cross-cutting requirements](../01-frame/cross-cutting-requirements.md)
- The authored metamodel owns core rules. Existing exact literals and instant
  operations provide patterns for duration. [CONTRACT-049](../02-design/contracts/CONTRACT-049-schema-properties.md), [CONTRACT-065](../02-design/contracts/CONTRACT-065-rfc3339-exact-instant.md), [CONTRACT-080](../02-design/contracts/CONTRACT-080-authoritative-metamodel.md)
- The action contract governs atomic action semantics. Portable action plans
  provide a precedent for preserving source and checking compile eligibility.
  [CONTRACT-900](../02-design/contracts/CONTRACT-900-declarative-actions.md), [CONTRACT-902](../02-design/contracts/CONTRACT-902-portable-action-plan.md)
- Existing conformance gates require portable behavior and independent evidence.
  The active Rust migration targets a shared engine and retains Bun and real
  browser qualification. [TP-001](../03-test/test-plan.md), [ADR-006](../02-design/adr/ADR-006-shared-rust-implementation.md), [migration plan](rust-migration-plan.md)

## Issue review

The eight issues form one workflow proposal. The issue set supplies one consumer
use case and describes external formal models and an interpreter. Access to those
artifacts, their revision, license and runnable vectors is unconfirmed. The saga
draft cited by the issues is also an external input to obtain before deciding how
its declarations relate to workflows. Current UMF action and plan contracts
provide the baseline for the review.

| Issue | Finding | Allocation |
| --- | --- | --- |
| [#163](https://github.com/DocumentDrivenDX/umf/issues/163) | Waits need exact duration/instant operands, correlation and race rules. Month-scale elapsed waits and calendar-month arithmetic are distinct requirements. | W1, W6 |
| [#164](https://github.com/DocumentDrivenDX/umf/issues/164) | Explicit routing and graph termination can ship before predicate-based branching. Effect-outcome coverage depends on the effect contract. | W4, W5 |
| [#165](https://github.com/DocumentDrivenDX/umf/issues/165) | Batch equivalence concerns record-local behavior and needs a deterministic policy for duplicate identities. | W7 |
| [#166](https://github.com/DocumentDrivenDX/umf/issues/166) | Transaction-frame rules have different types and assumptions. Presence facts can expire across blocking steps. | W1, W5 |
| [#167](https://github.com/DocumentDrivenDX/umf/issues/167) | Property evidence needs its own identity and freshness rules. Existing compatibility assessments can reference records without changing their verification semantics. | W2, W8 |
| [#168](https://github.com/DocumentDrivenDX/umf/issues/168) | Interchange preservation and strict compilation can share input. Original bytes need explicit custody to meet the round-trip criterion. | W2 |
| [#169](https://github.com/DocumentDrivenDX/umf/issues/169) | Drain policy and cross-version re-entry history need distinct rules. The scope decision can precede enrollment implementation. | W2, W7 |
| [#170](https://github.com/DocumentDrivenDX/umf/issues/170) | External effects require a versioned declaration with retry identity and explicit ambiguity. Effects precede routing and waits that consume their outcomes. | W3 |

## Shared constraints

- Use an independently versioned workflow extension with explicit selection of
  its compile profile. Reuse envelope identity, references and diagnostics.
  Define resolution over caller-supplied artifacts and exact versions, offline.
- Preserve original interchange bytes in a source artifact and preserve unknown
  structural values on copied inspection. Re-emit untouched source verbatim.
  Specify edited-source behavior explicitly. Compile the same original artifact
  against a closed profile and report every blocking unknown at its source path.
  Reject duplicate members and invalid known values at both tiers.
- Establish the module and import map before new code. Keep exact values below
  workflow semantics and keep validators and preparation independent of consumer
  executors and host APIs. Reuse the authority and runtime boundary checks where
  they cover the map. Extend the project check and wire it into local and CI gates
  for uncovered edges, with allowed-import and forbidden-import controls.

## Implementation slices

| Slice | Depends on | Work and ownership | Completion evidence |
| --- | --- | --- | --- |
| **W1. Scalar duration** | — | Core/metamodel owner defines exact elapsed duration and companion deadline arithmetic. Freeze grammar, carrier, bounds, comparison and migration before integration. | Parser and arithmetic vectors, public source round trips, native semantic counterexamples, clean generation and real-browser parity. |
| **W2. Scope, interchange and evidence shape** | — | Workflow owner records the NFR-50 ADR and demonstrated-reuse bar. Define the extension package, byte custody, compile eligibility and versioned evidence record. | Same byte fixture passes interchange unchecked and fails compile at the unknown path. Evidence binds to a definition hash and preserves failed and stale findings. |
| **W3. External effects** | W2 | Define typed input and closed typed outcomes, including outcome unknown. Freeze `none`, `accepted` and `result` continuation semantics and what each mode makes available for downstream decisions. | Missing, duplicate or undeclared outcomes reject. Same-body replay retains identity. Changed body conflicts. Unknown remains distinct from acceptance and rejection. |
| **W4. Acyclic routing** | W3 | Define keyed steps, explicit successors, total effect-outcome mapping and terminal exits. Reserve presentation edges for metadata. | Reject duplicate IDs, dangling successors, unreachable steps, cycles, missing else and undeclared or unmapped outcomes. Every maximal route ends at an exit. |
| **W5. Predicates and guards** | W1, W4 | Add a separately versioned typed, total predicate profile with exact temporal operands, a closed function set and flow-sensitive presence checking. Define ordered guards at entry, before steps and before effects. | Reject unsafe optional reads across joins and waits. Exercise overlapping guards, suppressed exits and invalid inputs. Show that each route to an effect passes the guard scopes due at that point. |
| **W6. Waits and events** | W1, W4, W5 | Add exactly one deadline operand, `for` or `until`, optional typed correlation, and explicit event and timeout successors. Freeze logical clock, ordering and anchoring. | Test exactly-once resolution, early and stale events, mismatched type/key, duplicate events, ties and overflow. Replaying the same logical trace gives the same resolution. |
| **W7. Enrollment and drain** | W1, W3, W6 | Define record identity, re-entry modes and history, deterministic duplicate admission, version pinning and version retention through drain. | Compare a batch with permutations of singleton admissions and step traces for distinct identities. Exercise duplicate identities, active-version switches and cross-version re-entry. |
| **W8. Consumer conformance** | W2, W7 | Replay a complete send/wait/branch/exit scenario with the consumer interpreter and capture property-level evidence. Exercise the second reuse case defined by the scope ADR. | Match independent expected traces, detect deliberate semantic mutations and publish versioned evidence with bounds, assumptions, hashes, failures and runtime identity. |

### W1 delivery order

1. Specify the scalar before changing the core version. The proposed domain is a
   signed elapsed span with exact nanosecond resolution. Candidate inputs include
   fixed-duration spellings such as `PT1.25S` and an exact integer count with an
   explicit fixed unit. A fixed day, if admitted, is exactly 86,400 seconds.
   Require workflow delays and minimum re-entry intervals to be nonnegative.
2. Compare the proposal against native elapsed and calendar-bearing forms.
   Include Arrow's unit-qualified duration and at least one calendar-bearing
   interval as counterexamples to generic conversion. Preserve native metadata
   and source spelling or count/unit. Compile calendar years and months only if a
   later profile defines anchor, calendar and timezone semantics. Confirm that
   long fixed elapsed waits meet the consumer's initial month-scale use case.
3. Freeze the exact JSON-safe carrier and value identity. Candidate computation
   uses canonical decimal-string nanoseconds and checked integer arithmetic.
   Preserve admitted spelling independently from value identity. Cover negative
   zero, equivalent units, zero, fraction and range limits, and overflow without
   rounding. Define duration eligibility for literals, examples, defaults,
   allowed values, bounds and keys explicitly.
4. Prove reuse in workflow timing and one independent consumer or representation
   before core admission. If the scope fits only workflow, ship the named scalar
   profile inside the extension and retain the proposed core change as a separate
   gate. A core admission amends the authored metamodel and generates validators,
   public shapes and reference outputs. Provide explicit migration and rollback
   for the changed profile. Native replacement requires separate FR-28 evidence.
5. Compose with CONTRACT-065 exact instants for `until`, comparisons and
   `anchor + duration`. Specify a deadline range and retain anchor precision.
   Reject overflow explicitly. Prove equivalent offsets, sub-nanosecond anchor
   fractions and boundary crossing without native timestamp coercion.

### Decisions to ratify in workflow contracts

- **Effects and routing.** Propose effect identity scoped by workflow, record,
  enrollment and step, with stable identity across retries within an enrollment.
  Declare a body-equivalence rule and distinguish `accepted` from the final
  result. State provider delivery and ordering as consumer obligations.
- **Guards.** Propose first true in declaration order within each due scope.
  A true guard selects its declared suppressed exit. A blocking transition kills
  refinements over mutable fields. Choose a declared evaluation-failure outcome
  or a total evaluation contract over explicitly admitted input values.
- **Waits.** Propose anchoring relative waits at step entry, using the caller's
  logical clock. Events must be associated with the current enrollment and arrive
  after registration in the defined input order. Deadline wins at equal logical
  time. Define how consumers establish that order, enforce single resolution and
  represent enrollment provenance when a provider supplies only a record key.
- **Drain and admission.** Propose retaining history under stable workflow and
  record identity across versions, applying the active definition's policy to
  that history. Freeze the meaning of each re-entry mode and relevant history
  timestamp. Pin each admitted enrollment to its definition version. Propose
  rejecting all candidates for a duplicate identity within the same batch.
- **Reuse.** Propose a consumer interpreter and an independent validator or
  compiler consuming the same unchanged definition and fixtures. The ADR must
  identify the second consumer and record the observed reuse before claiming
  general interchange support.

## Execution contract

Each slice starts with its story/contract and acceptance vectors. W2's scope ADR
gates workflow-specific implementation. It can proceed alongside W1 scalar
design. Record which engine owns the affected value/validation path at build
start under ADR-006. Use one shipped implementation for each operation and
exercise relevant bindings with the same vectors. Effort, spending ceiling and
runtime metering are unknown and no execution budget has been assigned.

## Validation plan

- Use `bun run typecheck`, `bun run test:schemas`, `bun run test:conformance` and
  `bun run test:browser` for the portable release path. For a core change, run
  `bun run check:metamodel`, `bun run check:core-authority` and
  `bun run test:metamodel`. Exercise the exact public entry points in the browser.
- For each qualified Rust-backed surface, add shared vector replay through its
  public binding and record tool, engine and profile versions. Keep historical
  adapter, envelope and unknown-content regression checks in the final gate.
- Record evidence per property and kind, including static checks, bounded model
  checks, differential tests, mutation controls and runtime runs. Include tool
  and version, input digest and digest recipe, profile, bounds, assumptions,
  results and counterexamples. A changed definition digest makes earlier evidence
  stale. A bounded result supports only its stated model, assumptions and bounds.
- Use an end-to-end positive trace and independently checked negative traces
  covering ambiguous effect results, suppression, event/deadline races and version
  changes. Record actual consumer builds and exact vectors before claiming runtime
  conformance. Consumer model access and exact model-checking bounds remain open.

## Continuation evidence

Record plan revision, completed slice IDs, commands, tool and profile versions,
evidence paths, remaining decisions, blockers and the next action under
`04-build/evidence/workflow-dsl/` as slices land. Verify the recorded results
against the source and tests before resuming.

## Risks and rollbacks

| Risk | Response | Rollback |
| --- | --- | --- |
| Calendar or native duration semantics collapse into elapsed time | Use counterexamples, explicit bounds and strict loss diagnostics. | Retain native values and restore the retained prior core artifact. |
| Unknown workflow data affects the prepared result | Compile the source artifact against the exact profile and block on unknown paths. | Recover original bytes and use interchange inspection. |
| Retries, events or activation changes alter an in-flight result | Exercise identity, race and version-drain traces against the consumer. | Withdraw the new profile from admission and retain pinned definitions through drain. |
| Consumer evidence is unavailable or fails to reproduce | Record unresolved provenance and preserve failures. | Hold the consumer qualification claim and retain the independently passing static evidence. |

## Exit criteria

- The scalar profile, version, compatibility path and exactness evidence are
  recorded. Any core admission has its own passing cross-system and migration gates.
- The workflow scope ADR, contracts and story test allocations resolve the
  pending decisions and trace all eight issues to passing validation gates.
- The same source bytes survive interchange and produce path-specific compile
  diagnostics when they contain unknown content.
- The qualified browser build and named consumer pass the full scenario and
  negative controls, with source-bound evidence and documented limits.
