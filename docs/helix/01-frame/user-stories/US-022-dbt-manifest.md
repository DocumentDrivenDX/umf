---
ddx:
  id: US-022
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-002
      kind: informed_by
---

# US-022: Preserve dbt manifest metadata

**Feature:** FEAT-002 NAT-01–04. **PRD:** FR-1/5/6/12/37/39/41. **Priority:** P0.

## Story and Context

As a metadata-tool developer, I want dbt manifest resources, descriptions, dependencies and
native configuration in an editable browser model so that downstream documentation and agent
context do not discard dbt-specific meaning. CONTRACT-022 defines the interface.

## Walkthrough

Build the synthetic local DuckDB project with pinned dbt, import its manifest, edit a model
description, export through UMF JSON/YAML and compare independent artifact validation. No SQL
execution occurs during library import or edit.

## Acceptance Criteria

- **US-022-AC1:** Package and source schemas preserve the complete manifest v12 representation,
  exact JSON tokens and unknown content. Interpretation limits are explicit.
- **US-022-AC2:** Copied metadata access and atomic description edits preserve all other content;
  unknown representation fields block lossy native export. Native schema disagreements remain data.
- **US-022-AC3:** A real local dbt-generated manifest and edited variants have independent schema
  validation and Bun/browser evidence. Future versions remain preserved without interpretation.

- **US-022-AC4:** A second native project exercises sources, exposures, groups, semantic
  models, metrics, saved queries, unit tests, snapshots, analyses, hooks, selectors, custom
  docs/macros and disabled resources. Preserve all populated collections and validate copied
  edits independently. Distinguish executed build results from metadata no-ops.

- **US-022-AC5:** Inspect explicit active resource/macro dependencies with copied IDs and
  source pointers. Report unresolved/ambiguous/wrong-kind targets and inconsistent redundant
  parent/child maps without changing the source. Compare native map builders and browser
  results; retain duplicate occurrences and avoid an implicit cycle-legality claim.

- **US-022-AC6:** Select bounded upstream context from explicit root IDs with optional macro
  traversal. Keep the full source alongside selected pointers and report depth/node/macro
  boundaries. Native graph reachability, copied-source recovery and browser behavior agree;
  selection does not masquerade as a runnable dbt manifest subset.

- **US-022-AC7:** Preserve run-results v6 and catalog v1 in a separate generated-artifact
  package with complete pinned native schemas. Native message/comment candidate edits retain
  all unrelated observations/outcomes. Keep declared types distinct from observed types and
  qualify native/parser/browser evidence without claiming changed warehouse or execution state.

- **US-022-AC8:** Preserve sources v3 freshness outcomes, criteria, ages and diagnostic
  branches. Use native pass/warn/stale-error/runtime-error examples and keep emitted artifacts
  distinct from runner-result reconstruction when the native emitter omits a result.

- **US-022-AC9:** Native failing-build fixtures cover SQL error, failed/warning/passing tests,
  successful models and skipped dependents. Round trips and candidate message edits retain
  statuses, failure counts, timing, adapter responses and dependency context without treating
  a skipped result as success or a metadata edit as a rerun.

- **US-022-AC10:** A separate semantic-manifest package preserves DSI-versioned semantic
  models, metrics, time spines and saved queries. Publish the complete serialized shape schema
  with explicit derivation from native nullable fields; retain raw generator discrepancies.
  Native parser and browser checks compare round trips and independent description edits.
  Unknown versions/fields remain recoverable and semantic execution is not inferred.

- **US-022-AC11:** Native examples cover every metric type in pinned DSI 0.8.5.
  Parameter-edit candidates preserve all unrelated fields through both UMF formats.
  Independently distinguish shape validation, native parsing, semantic-rule validation and
  unexecuted query behavior; retain invalid candidates and their expected discrepancies.

- **US-022-AC12:** Validate serialized boundary values from every pinned native semantic
  model field against the derived JSON Schema using independent native and browser runtimes.
  Preserve parser coercion and exception observations separately from source-shape validity;
  field evidence must not imply complete-document or semantic-rule equivalence.

## Boundaries and Dependencies

CONTRACT-001 and ADR-002 govern the envelope/browser runtime. Manifest source validation does
not establish compilation, SQL semantics, dependency consistency, execution or warehouse access.
Other dbt artifacts, project YAML/Jinja, manifest versions and cross-system projections remain
required inventory work beyond this initial story.
