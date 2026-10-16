---
ddx:
  id: US-080
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-028
      kind: informed_by
---

# US-080: Generate and drift-check the typed package

**Feature:** [[FEAT-028]]. **Feature Requirements:** TM-01, TM-02, TM-05, TM-06.
**PRD Requirements:** FR-52. **Priority:** P0 within the proposal.

## Story

**As a** Schema Integration Maintainer,
**I want** to generate the typed Python package from pinned UMF documents and check it into version control with a drift check in CI,
**So that** application developers get types that match the authored schema exactly, and any interpretation, loss or refusal is reviewable before it reaches them.

## Context

This is stage one of the two-stage build in ADR-004. The portable TypeScript
generator (CONTRACT-067) reads exact source texts, the `umf.access` extension
(CONTRACT-070) and a trusted installed profile, and returns files as data. The
host tool `umf-access generate` writes them; `umf-access check` regenerates in
memory and fails CI on any byte difference.

A generated package is a candidate, not execution authority. It contains no SQL
and selects no target platform. Every selected assertion is reported with a
disposition, and unknown content is kept in `_umf/sources.json` so nothing the
authors wrote is lost. US-081 covers what the generated types and codecs do;
this story covers producing, writing and checking them.

## Walkthrough

1. The maintainer authors a `umf.access` RecordView for each Record to generate,
   plus ColumnSets for the bound targets, and pins the profile version.
2. The maintainer runs `umf-access generate` with the request (sources, selected
   Records and actions, projections, package name, `names` overrides, mode).
3. The tool returns either a candidate package or a refusal. In both cases the
   maintainer reviews dispositions, obligations and diagnostics.
4. On a candidate, the tool verifies the existing checked-in package against its
   manifest and swaps in the new one; the maintainer reviews the diff and the
   per-symbol compatibility classification, then commits.
5. CI runs `umf-access check` on every change and fails if the checked-in
   package differs from what the pinned sources and profile generate.

## Acceptance Criteria

- [ ] **US-080-AC1** — Given identical source texts and an identical profile (including `codeSha256`) in Bun and in Chromium, when I generate twice in each runtime, then every file byte, `inputDigest`, source map, disposition and diagnostic is identical, and changing any source text, profile metadata field or code digest changes `inputDigest`.
- [ ] **US-080-AC2** — Given `umf.access` fixtures with a selected Record that has no RecordView, a view that omits or duplicates a reached Field, a missing/foreign selectedKey, a Record with explicitly selected alternate/composite Keys, nullable and non-null nested item/value Fields and incompatible reused occurrence views, one fixture for each refusing row of the CONTRACT-070 conflict table, and a ColumnSet whose native type widens, narrows or changes the precision of its Field, when I generate, then each invalid fixture refuses with `ACCESS` carrying the retained `ACCESS_REFERENCE`, `ACCESS_COVERAGE`, `ACCESS_CONFLICT` or `ACCESS_NATIVE` code and a JSON Pointer, returns no files, and repairs nothing, while each allowed row's fixture, valid explicit selected Key and valid nested occurrence generates.
- [ ] **US-080-AC3** — Given an unknown member on a selected Record, an unknown extension on an unselected Record and a selected assertion whose disposition is not `exact`, when I generate in `strict` and in `report` mode, then the unknown selected member refuses with `UNKNOWN_RELEVANT` in both modes, the unselected content is kept verbatim in `_umf/sources.json` with an `unselected` disposition, every selected known assertion is enumerated (including those that emit no code), both `strict` and `report` refuse non-exact selected or dependency meaning with `LOSS` under the initial exact-only profile, with every obligation listed with an owner and never as discharged.
- [ ] **US-080-AC4** — Given an authored ID that is not a valid Python identifier and has no `names` override, a case-folded path or symbol collision, a reserved name (`c`, `objects`, a `model_` attribute or a profile reserved name), a package name that shadows an imported module, hostile metadata strings or a request over a resource bound, when I generate, then generation refuses with `NAME` or `LIMIT` without truncating output, metadata appears only as escaped literals, and no artifact content locates or loads a profile, template, plugin or dependency.
- [ ] **US-080-AC5** — Given a checked-in package in which a file was edited, added or removed after generation, when I run `umf-access generate`, then it refuses with `OUTPUT_CHANGED` and writes nothing; and given an injected failure before the directory swap, then the previous package remains byte-identical, while a failure after the swap reports the new package as written; a failed second rename restores the complete old package or explicitly reports unresolved filesystem state with the recoverable backup retained, build operations are serialized, and all four reserved stage-two files survive byte-for-byte without regeneration.
- [ ] **US-080-AC6** — Given a checked-in package and a pinned source or profile that has changed since it was generated, when CI runs `umf-access check`, then the command exits non-zero and names each differing path; with unchanged inputs it exits zero; and a deliberate regeneration reports each public symbol as source-compatible, value-compatible or breaking.

## Edge Cases

- A Record reached only through a relationship or an entity parameter gets a
  Key DTO, not a row model, unless it is also selected.
- Two module-qualified Fields with equal bare IDs in one Record refuse in 0.1.
- An action whose bindings, conditions or authorization reference an unselected
  and unreached element refuses; external document references refuse.
- Unknown relevant semantics refuse in `report` mode as well as `strict` mode.
- A host write failure after the swap is reported as written, never as a
  silent rollback.
- Admission failure before a valid request exists throws a typed diagnostic
  rather than returning a partial result.

## Test Scenarios

| Scenario | AC ID | Input / State | Expected Result |
| --- | --- | --- | --- |
| generation_is_deterministic | US-080-AC1 | Same sources and profile in Bun and Chromium; then one changed byte in a source, profile field and code digest | Identical outputs; each change alters `inputDigest` |
| access_views_validated | US-080-AC2 | Missing view; coverage gaps and duplicates; every conflict-table row; incompatible native types | `ACCESS` with the specific retained code and pointer; no files; allowed rows generate |
| census_unknown_and_modes | US-080-AC3 | Unknown selected member; unknown unselected extension; unsupported selected semantics in both exact-only modes | `UNKNOWN_RELEVANT`; unselected content retained; complete census; both modes refuse non-exact relevant meaning with `LOSS`; future approximation profiles require separate qualification |
| unsafe_names_and_limits_refuse | US-080-AC4 | Invalid ID without override, collisions, reserved names, shadowing package, hostile strings, over-limit request | `NAME` / `LIMIT`; escaped literals; no truncation; no artifact-driven loading |
| writer_refuses_changed_output | US-080-AC5 | Hand edit, added file, removed file; injected pre-swap and post-swap failures | `OUTPUT_CHANGED` with nothing written; prior package intact; post-swap reported written |
| ci_drift_check | US-080-AC6 | Changed source; unchanged source; deliberate regeneration | Non-zero with paths; zero; per-symbol compatibility classes |

## Dependencies

CONTRACT-001/040/042/049; CONTRACT-067 (generator, writer, drift check);
CONTRACT-070 (`umf.access` views and ColumnSets); CONTRACT-900 for selected
actions; ADR-002 and ADR-004. Feature requirements TM-01, TM-02, TM-05, TM-06;
PRD FR-52. TD-080 owns implementation detail; STP-080 owns the test mapping.

## Out of Scope

The behavior of generated models and codecs (US-081), query declarations and the
catalog (US-082 to US-084), any SQL or target selection, database connections,
migrations, and installing dependencies or profiles. A candidate package does not
qualify any target or authorize execution.
