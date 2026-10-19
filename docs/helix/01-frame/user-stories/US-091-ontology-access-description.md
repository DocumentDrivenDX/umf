---
ddx:
  id: US-091
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-033
      kind: derived_from
    - id: umf.prd
      kind: derived_from
---

# US-091: Derive and review an ontology access description

**Feature:** [FEAT-033](../features/FEAT-033-generated-ontology-access.md).
**Feature Requirements:** OA-01/03/04/05/06/07/08/09/11/13/19/21.
**PRD Requirements:** FR-56. **Priority:** Release priority unassigned.

## Story

**As a** Schema Integration Maintainer, **I want** to select ontology types and
actions and inspect a reproducible access description, **So that** plugins can
use a reviewed contract without hand-maintained access views or hidden losses.

## Context

The maintainer already has a UMF schema. They use it directly to generate the
API, without selecting a compatibility mode or authoring access views. The
result shows the same fields, keys, links and actions their application models.

## Walkthrough

1. The maintainer supplies their current UMF schema.
2. They optionally select exposed types/actions, such as Solution and
   ChangeCoverage, and otherwise use the generator defaults.
3. UMF checks source meaning and selection closure and emits the description or
   a complete refusal report with original sources retained.
4. The maintainer inspects field/key/link facts, action-specific write shapes,
   typed refusals, consistency obligations, limits and provenance.
5. They review the API and use it to generate the client. After a schema change,
   the comparison explains which application calls need updating.

## Acceptance Criteria

- [ ] **US-091-AC1** — Given an ontology schema using the latest UMF, when
  the maintainer generates its API, then it succeeds without an authored access
  view or compatibility/version selection.
- [ ] **US-091-AC2** — Given a schema using the current UMF's fields, keys,
  relationships and actions, when its API is inspected, then their declared
  meanings are represented without translating the schema into a legacy dialect.
- [ ] **US-091-AC3** — Given an action referencing an unexposed entity, when
  closure is computed, then its exact key dependency is represented without
  adding public reads or actions for that entity.
- [ ] **US-091-AC4** — Given explicit field/identity/link declarations, when
  the description is inspected, then cardinality, absence/null and both oriented
  link multiplicities remain attributable to their source or declared derivation.
- [ ] **US-091-AC5** — Given actions that create the same field differently,
  when write shapes are derived, then caller-supplied and engine-generated values
  remain action-specific without a misleading global create shape.
- [ ] **US-091-AC6** — Given a selected API and default settings, when its
  description is inspected, then reads, typed filters/orderings, limits, action
  refusals and consistency/batch obligations are explicit and schema-valid.
- [ ] **US-091-AC7** — Given unknown selected semantics, contradictory identity
  facts or an unknown source version, when derivation runs, then no successful
  description is emitted and diagnostics identify every bounded assessed failure.
- [ ] **US-091-AC8** — Given unknown unselected content outside the selected
  operations, when derivation completes, then exact source recovery retains it and
  the report distinguishes retention from interpretation.
- [ ] **US-091-AC9** — Given identical complete inputs, when derivation repeats
  in Bun and real Chromium, then description and provenance output bytes agree
  without external requests or browser host-runtime dependencies.
- [ ] **US-091-AC10** — Given a formatting-only source edit and a key-changing
  source edit, when descriptions are compared, then provenance drift and API
  breakage are distinguished with reasons.

SD-033 describes generation and the shared interface to specify.

## Edge Cases

- Missing inverse name: a recorded deterministic derived name is used, or a
  collision refuses; no reciprocal cardinality is guessed.
- Handler effects are opaque: refuse the selected action's unsupported write
  shape rather than asserting complete metadata.
- Source text exceeds processing limits: report bounded refusal and retain the
  original input; partial assessment is never a complete success.

## Test Scenarios

| Scenario | AC ID | Input / observation |
| --- | --- | --- |
| Initial module | US-091-AC1/6 | Current UMF catalog, Solution plus ChangeCoverage, no `umf.access`: description with default limits |
| Current model | US-091-AC2 | Current UMF catalog: generated fields, keys, links and actions match its declarations |
| Dependency-only type | US-091-AC3 | Action references UseCase while only Solution rows are exposed: UseCase key exists, UseCase list does not |
| Presence and inverse | US-091-AC4 | Optional practiceArea plus inverse link: absence/null and endpoint limits stay distinct |
| Two create forms | US-091-AC5 | One action accepts code, another generates it: two accurate create views |
| Unsupported selected effect | US-091-AC7 | Unknown effect in ChangeCoverage: refusal at its source path |
| Retained extension | US-091-AC8 | Add admitted unselected extension text: exact recovery without a support claim |
| Determinism and diff | US-091-AC9/10 | Repeat input; then change whitespace or identity component: exact bytes match on repeat, appropriate comparison on change |

## Dependencies

FEAT-033, FR-56 and [SD-033](../../02-design/solution-designs/SD-033-generated-ontology-access.md).
Tests use current UMF schemas and cite their exercised acceptance criteria.
The retained older Hohfeld source is integration research, not an acceptance input.

## Out of Scope

Package generation/use (US-092), host authorization, production transport,
Hohfeld parser changes, execution and table-SDK migration.
