---
ddx:
  id: US-020
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-002
      kind: informed_by
---

# US-020: Inspect and edit Iceberg schemas without losing identity

**Feature:** FEAT-002. **Feature requirements:** NAT-01–04.
**PRD requirements:** FR-1/5/6/12/37/39/41. **Priority:** P0. **Status:** draft.

## Story

As a metadata-tool developer, I want to inspect and edit Iceberg schemas in a browser
so that names can change while field identity, native defaults and future content survive.

## Context

Architecture Phase 3 includes Iceberg. Its field identity, collection component IDs and
identifier-field semantics require a dedicated extension. An identifier does not establish
an enforced uniqueness constraint. CONTRACT-020 owns the public interface.

## Walkthrough

Import the governed nested sample, locate its nested field, rename it, serialize the UMF
model to JSON and YAML, and export a native schema. Native parsing must still find the
same field and identifier IDs. A conflicting ID edit fails without changing the original.

## Acceptance Criteria

- **US-020-AC1:** Recursive source shapes, exact numeric defaults, unknown native fields
  and type spellings survive both UMF formats. Required known shapes, duplicate identities
  and invalid known identifier references reject. Record native parser permissiveness and
  unsupported cases separately from preservation.
- **US-020-AC2:** Unknown extension/tagged-tree representation content survives UMF
  serialization and blocks native export if exporting would discard it.
- **US-020-AC3:** Pointer access returns copies; candidate edits are atomic. A nested rename
  preserves field and identifier IDs and passes native parsing. Chromium must reproduce
  round trips, diagnostics and edits without Node globals.

## Edge Cases and Test Scenarios

The authored corpus includes list/map IDs, nested required/optional structs, exact int64
values, prototype-like names, unknown object types, native-default insertion and ID collisions.
Tests and native/browser oracles are listed in the project test plan.

## Dependencies and Out of Scope

CONTRACT-001, FEAT-002 and ADR-002 supply the envelope, fidelity and runtime boundaries.
Table metadata, partition/sort specs, defaults execution, format-version checks, historical
ID allocation, upstream corpora and cross-system transforms remain required follow-on work.
These three criteria do not complete the Iceberg extension or the project goal.

- **US-020-AC4:** Pin upstream schema-bearing resources with licenses and byte hashes;
  identify extracted schemas by source path and pointer without normalizing native tokens.
  Preserve all source occurrences and report distinct-schema counts. Round-trip accepted
  fragments through both formats and verify candidate renames with independent Java and
  Python runtimes. Record disagreements on rejected source shapes rather than inserting
  native defaults. Browser behavior must match Bun. A fragment's acceptance must not imply
  that its enclosing table/view metadata is valid or supported.
