---
ddx:
  id: ALIGN-2026-10-02
  type: status-report
  activity: iterate
  status: complete
  authoring:
    home: repo
  links:
    - id: umf.product-vision
      kind: informed_by
    - id: umf.prd
      kind: informed_by
    - id: umf.architecture
      kind: informed_by
    - id: TP-001
      kind: informed_by
    - id: umf.implementation-plan
      kind: informed_by
---

# Alignment Review: UMF repository

**Review Date**: 2026-10-02  
**Scope**: repository  
**Status**: complete  
**Review Epic**: `umf-767cfb9c`  
**Primary Governing Artifact**: `docs/helix/01-frame/prd.md`

## Scope and Governing Artifacts

This pass covers the governed `docs/helix/` stack, public TypeScript library,
browser and native verification surfaces, package checks, and DDx work-item
coverage. The methodology catalog bound from the installed HELIX 0.14.0 source
checkout. The review started at product vision and requirements before examining
designs, tests, implementation evidence, and code.

Governing sources are `00-discover/product-vision.md`, `01-frame/prd.md`,
`01-frame/cross-cutting-requirements.md`, all seven feature specs and 46 user
stories, `02-design/architecture.md`, ADR-001 through ADR-003, CONTRACT-001
through CONTRACT-048, the technical designs, `03-test/test-plan.md`, and
`04-build/implementation-plan.md`.

## Intent Summary

- **Vision and requirements**: provide durable, tool-neutral metadata interchange
  that preserves native and unknown meaning, reports loss, and supports partial
  understanding. All 44 FRs and 50 NFRs remain desired-state obligations; delivered
  slices do not imply complete product scope.
- **Features and stories**: seven feature specs and 46 stories govern native
  interchange, projections, DDD, core ideals, authored relationships, physical
  bindings, generators, and future offline composition.
- **Architecture and decisions**: YAML/JSON plus JSON Schema bootstraps structure;
  TypeScript targets a browser-compatible library; Bun owns development and tests;
  native engines and optional WASM provide scoped independent evidence.
- **Delivered slice**: core Field through Relationship, five qualified priority
  relationship bindings, stable physical bindings, PostgreSQL and GraphQL
  generators, and SQL Server physical generation have current evidence. Native
  equivalence and unrelated product obligations remain unclaimed.

## Dimension Coverage Matrix

| Dimension | Found | Checked | Non-aligned findings | Classification | Evidence |
| --- | ---: | ---: | ---: | --- | --- |
| Capability (FR) | 44 | 44 | 1 | INCOMPLETE | `01-frame/prd.md:164`; FEAT headers use several noncanonical field forms |
| Acceptance behavior | 433 | 433 | 3 groups | INCOMPLETE | 405 stable IDs plus 28 `ACn` criteria in US-028–032; deterministic scan found 68/405 stable IDs cited and two dangling citations |
| Architecture decision | 3 | 3 | 1 | BLOCKED | ADR-001/002 accepted and honored; ADR-003 is draft while its mechanism is implemented |
| Concern practice | 7 project-local groups | 7 | 1 | UNDERSPECIFIED | `01-frame/concerns.md:23-41`; Bun/TypeScript is stated but not selected as the `language-runtime` concern |
| Concern to artifact realization | 7 | 7 | 1 | UNDERSPECIFIED | Requirements, architecture, tests, and implementation express the local concerns; canonical runtime concern impact is absent |
| Measurable NFR / budget | 50 | 50 | 1 scope group | INCOMPLETE | NFRs are qualitative desired-state constraints; the current evidence qualifies only delivered slices |
| Decomposition | 7 subsystems / 7 FEATs / 46 stories | 60 | 14 structural | INCOMPLETE | Current `ddx.links` preserve the graph, but HELIX 0.14 exact body anchors are absent |
| Slot registry | 7 slots / 4 defaults | 7 / 4 | 0 library, 1 project | UNDERSPECIFIED | Installed `slots.yml` is internally consistent; project selection omits the required runtime filler |
| Instrument integrity | package test, typecheck, schema audit, browser build, conformance | 5 | 1 | DIVERGENT | `package.json:13` uses a fuzzy Bun target that reaches a frozen test under `fixtures/validation/` |

The deterministic HELIX checker reports 16 blocking structural findings and 399
total findings. Fourteen blockers come from missing exact decomposition anchors,
although the same relationships are present in `ddx.links` or prose. The other two
are dangling `@covers` tags. Its 337 uncited stable criteria are a traceability
inventory, not proof that 337 behaviors are absent; each must be classified by
reading the exercising test before adding a citation or filing implementation work.

## Implementation Surface Map

| Surface | Evidence | Kind | Governing artifact | Mapping rationale | Classification | Disposition |
| --- | --- | --- | --- | --- | --- | --- |
| Public browser ESM API | `src/index.ts:1`, `scripts/build.ts:1` | capability | FR-29/30/39; ADR-002; architecture | Public exports compile to browser ESM and browser-specific checks remain separate | ALIGNED | Keep scoped browser and native evidence |
| Core Field through Relationship | `src/model/`, `src/core-ideals/` | capability | FEAT-005/006; US-040–045; CONTRACT-040/041 | Versioned ideals, migrations, selection, projections, and retained recovery follow the ordered plan | ALIGNED | Native equivalence remains outside current claims |
| Physical bindings and generators | `src/extensions/binding/`, `src/projections/ddd-*`, `src/projections/binding-*` | capability | FR-43/44; FEAT-006; US-046–049 | Stable binding identity and directed generators match the authored scope | ALIGNED | Add the missing US-048-AC9 citation after behavioral review |
| Optional Protobuf WASM compiler | `scripts/build-protobuf.ts`, `scripts/browser.ts:258` | technical | ADR-003 | The implemented mechanism matches the draft decision, but the decision is not accepted | BLOCKED | Resolve ADR status before treating it as binding architecture |
| Canonical package test target | `package.json:13` | technical | ADR-002; TP-001 | Bun is the declared runner, but its fuzzy `tests` target discovers frozen evidence tests | DIVERGENT | Use an unambiguous live-suite boundary and retain archives unchanged |

## Planning Stack Findings and Gap Register

| ID | Area | Drift type | Classification | Destination type | Deliverable shape | Next mode | Evidence | Issue |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F-1 | Reproducible decomposition | stale | INCOMPLETE | PRD, feature-specification, user-stories | Add HELIX 0.14 exact `Covered PRD Subsystem(s)`, `Covered PRD Requirements`, and `Feature` fields; expose stable `**FR-n**` anchors; normalize US-028–032 criteria to `US-NNN-ACn` without changing meaning or links | frame | `01-frame/prd.md:164`; `01-frame/features/FEAT-006-authored-relationships-bindings.md:18-20`; `01-frame/user-stories/US-045-relationship.md:2-13`; `01-frame/user-stories/US-028-shacl.md:19-33` | `umf-e08bb694` |
| F-2 | Acceptance traceability | missing | INCOMPLETE | story-test-plan, test-suites | Audit 405 stable criteria and 28 noncanonical criteria against behavior; add citations only to exercising tests, add tests or reviewed exceptions for true gaps, repair two dangling tags, and cite the existing browser comparison for US-048-AC9 if it exercises the criterion | backfill | `native/tablespec/sources/tests/unit/test_umf_loader.py:5-12`; `01-frame/user-stories/US-048-ddd-postgresql.md:63-78`; HELIX checker: 68/405 cited, 337 uncited, 2 dangling | `umf-55b8b8a8` |
| F-3 | Canonical test discovery | contradictory | DIVERGENT | test-plan, implementation-plan | Define one unambiguous live-test target for package and conformance commands, prove it passes, and keep frozen acceptance snapshots outside discovery without changing archived bytes | runtime-handoff | `package.json:13`; `fixtures/validation/relationship-gate-test-baseline-1790899698673443188/tests/core-ideals/facets-evidence.test.ts` | `umf-99f73baa` |
| F-4 | Runtime concern selection | missing | UNDERSPECIFIED | concerns | Select `typescript-bun` as the single `language-runtime` filler, record the owner/ADR source, and verify its artifact-impact and practice obligations while leaving unrelated slots open | frame | `01-frame/concerns.md:35-47`; `02-design/adr/ADR-002-bun-development-runtime.md:29-44`; installed `workflows/concerns/slots.yml` | `umf-77f07550` |
| F-5 | Implemented draft decision | stale | BLOCKED | ADR | Decide whether to accept, revise, or supersede ADR-003; make frontmatter and body status agree and retain the bounded compiler/version/evidence limits | design | `02-design/adr/ADR-003-protobuf-wasm-compiler.md:6`; `02-design/adr/ADR-003-protobuf-wasm-compiler.md:20-41`; `scripts/build-protobuf.ts` | `umf-f0692349` |
| F-6 | Desired-state tracker coverage | missing | INCOMPLETE | roadmap, improvement-backlog | Select the next governed slice and create evidence-gated work coverage for its residual FR/NFR obligations; explicitly defer the remainder with owner and rationale | polish | `01-frame/prd.md:510-512`; `01-frame/prd.md:527-538`; `README.md:44-47`; DDx status: 84 closed, 0 open before this review | `umf-0b894926` |
| F-7 | Relationship and binding delivery | keep | ALIGNED | implementation-plan | Preserve the scoped final evidence and its explicit exclusions; no migration required | none | `README.md:3-40`; `04-build/implementation-plan.md:5264-5268`; `fixtures/validation/relationship-integrated-acceptance-evidence.json` | closed delivery `umf-c2ef7c2c` |

No content migration is required. Historical checkpoint prose is deliberately
retained below explicit supersession notices, so phrases such as “next” and
“pending” in those sections are not current-state drift.

## Acceptance Criteria Status

| Scope | Criteria | Canonical citations | Status | Evidence |
| --- | ---: | ---: | --- | --- |
| US-045 Relationship | 10 | 10 | SATISFIED in the recorded delivery scope | relationship/core/native/conformance tests and final integrated record |
| US-046 Binding | 10 | 10 | SATISFIED in the recorded delivery scope | binding tests and final integrated record |
| US-047 Indexes | 10 | 10 | SATISFIED in the recorded delivery scope | binding/index/generator tests and final integrated record |
| US-048 PostgreSQL generator | 10 | 9 | UNCITED_COVERAGE candidate for AC9 | browser evidence exists; behavioral match must be recorded before adding the tag |
| US-049 GraphQL generator | 10 | 10 | SATISFIED in the recorded delivery scope | projection/native/browser tests and final integrated record |
| Remaining stable stories | 355 | 19 | INCOMPLETE traceability inventory | `umf-55b8b8a8` owns behavior-by-behavior classification |
| US-028–032 | 28 | 0 stable IDs | INCOMPLETE artifact shape | criteria use `ACn`; `umf-e08bb694` owns stable-ID normalization |

## Traceability Matrix

| Requirement | Feature / Story | Architecture / Design | Tests / Evidence | Code status | Classification |
| --- | --- | --- | --- | --- | --- |
| FR-3/42 | FEAT-005/006; US-045 | CONTRACT-040/041; TD-045 | Relationship gate and integrated acceptance | core 0.7 plus five qualified bindings delivered | ALIGNED |
| FR-43 | FEAT-006; US-046/047 | CONTRACT-042; TD-046/047 | binding suites and integrated acceptance | stable bindings and scoped generators delivered | ALIGNED |
| FR-44 | FEAT-006; US-048/049 | CONTRACT-043/044; TD-048/049 | PostgreSQL/GraphQL native and browser evidence | delivered within stated subsets | INCOMPLETE traceability only: US-048-AC9 lacks citation |
| FR-1–44 / NFR-1–50 desired state | seven FEATs / 46 stories | architecture, contracts, TDs | mixed scoped evidence | partial product implementation by explicit design | INCOMPLETE tracker coverage; select next slice without shrinking specs |

## Review and Execution Work

Review work: `umf-f1ebd983` (frame), `umf-4c9b0a7a` (design), and
`umf-7ebca645` (test/build), under review epic `umf-767cfb9c`.

Execution order:

1. `umf-e08bb694` normalizes the planning anchors and stable IDs.
2. `umf-55b8b8a8` builds the authoritative AC-to-test ledger; the US-048-AC9
   citation and dangling tag repair can land independently after behavioral review.
3. `umf-99f73baa` repairs the live-test discovery boundary.
4. `umf-77f07550` records the runtime concern slot and checks its impact.
5. `umf-f0692349` resolves ADR-003 through an owner decision.
6. `umf-0b894926` selects and decomposes the next product slice.

The first three items are the critical path to a clean deterministic alignment
check. Runtime concern alignment can proceed in parallel. ADR-003 requires an
owner decision. Product backlog selection must preserve the PRD's desired state.

```yaml
helix_report:
  mode: align
  scope: docs/helix/
  catalog: source-checkout
  summary:
    aligned: 1
    incomplete: 3
    divergent: 1
    underspecified: 1
    stale_plan: 0
    blocked: 1
    phantom_claims: 0
  findings:
    - id: F-1
      classification: INCOMPLETE
      artifact: docs/helix/01-frame/
      lines: [164]
      claim: The planning graph exists, but current HELIX decomposition anchors and five story AC-ID sets are not parseable.
      evidence: [docs/helix/01-frame/prd.md:164, docs/helix/01-frame/user-stories/US-028-shacl.md:19]
      handoff:
        destination_type: PRD, feature-specification, user-stories
        deliverable: Exact decomposition header fields, stable FR anchors, and stable US-028 through US-032 AC IDs without semantic changes.
        next_mode: frame
        evidence: [docs/helix/01-frame/prd.md:164, docs/helix/01-frame/features/FEAT-006-authored-relationships-bindings.md:18]
    - id: F-2
      classification: INCOMPLETE
      artifact: tests/
      claim: Acceptance traceability has 337 uncited stable criteria, 28 noncanonical criteria, and two dangling citations.
      evidence: [native/tablespec/sources/tests/unit/test_umf_loader.py:5, docs/helix/01-frame/user-stories/US-048-ddd-postgresql.md:63]
      handoff:
        destination_type: story-test-plan, test-suites
        deliverable: A behavior-reviewed AC ledger with exercising citations, tests, or reviewed exceptions and no dangling tags.
        next_mode: backfill
        evidence: [native/tablespec/sources/tests/unit/test_umf_loader.py:5, docs/helix/01-frame/user-stories/US-048-ddd-postgresql.md:63]
    - id: F-3
      classification: DIVERGENT
      artifact: package.json
      lines: [13]
      claim: The canonical Bun test target can discover frozen evidence tests outside the live suite.
      evidence: [package.json:13, fixtures/validation/relationship-gate-test-baseline-1790899698673443188/tests/core-ideals/facets-evidence.test.ts]
      handoff:
        destination_type: test-plan, implementation-plan
        deliverable: An unambiguous live-test target shared by package and conformance checks, with archives retained unchanged.
        next_mode: runtime-handoff
        evidence: [package.json:13]
    - id: F-4
      classification: UNDERSPECIFIED
      artifact: docs/helix/01-frame/concerns.md
      lines: [35, 41]
      claim: TypeScript and Bun are mandatory but the HELIX language-runtime slot has no selected filler.
      evidence: [docs/helix/01-frame/concerns.md:35, docs/helix/02-design/adr/ADR-002-bun-development-runtime.md:29]
      handoff:
        destination_type: concerns
        deliverable: Select typescript-bun once, record its source, and verify its artifact and practice impact.
        next_mode: frame
        evidence: [docs/helix/01-frame/concerns.md:35]
    - id: F-5
      classification: BLOCKED
      artifact: docs/helix/02-design/adr/ADR-003-protobuf-wasm-compiler.md
      lines: [6, 20]
      claim: Production code implements a decision whose ADR remains draft and describes itself as open to review.
      evidence: [docs/helix/02-design/adr/ADR-003-protobuf-wasm-compiler.md:20, scripts/build-protobuf.ts]
      handoff:
        destination_type: ADR
        deliverable: An owner decision accepting, revising, or superseding the bounded optional WASM compiler architecture.
        next_mode: design
        evidence: [docs/helix/02-design/adr/ADR-003-protobuf-wasm-compiler.md:20]
    - id: F-6
      classification: INCOMPLETE
      artifact: docs/helix/01-frame/prd.md
      lines: [510, 538]
      claim: All 44 FRs remain obligations, while the completed relationship queue left no residual desired-state work tracked.
      evidence: [docs/helix/01-frame/prd.md:510, docs/helix/README.md:44]
      handoff:
        destination_type: roadmap, improvement-backlog
        deliverable: Select the next governed slice and cover its evidence-backed residuals while explicitly deferring the remainder.
        next_mode: polish
        evidence: [docs/helix/01-frame/prd.md:510, docs/helix/README.md:44]
    - id: F-7
      classification: ALIGNED
      artifact: docs/helix/04-build/implementation-plan.md
      lines: [5264, 5268]
      claim: The delivered relationship, binding, and generator slice matches its governing artifacts and qualified evidence.
      evidence: [docs/helix/README.md:3, docs/helix/04-build/implementation-plan.md:5264, fixtures/validation/relationship-integrated-acceptance-evidence.json]
  assumptions:
    - text: Historical checkpoint language is intentional when a later section explicitly supersedes its scoped status.
      source: docs/helix/README.md:49
    - text: Missing citations are traceability findings until behavioral inspection proves an implementation gap.
      source: HELIX align acceptance-criteria contract
  next_mode: frame
```
