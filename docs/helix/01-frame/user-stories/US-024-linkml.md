---
ddx:
  id: US-024
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-002
      kind: informed_by
---

# US-024: Preserve LinkML schemas

**Feature:** FEAT-002 NAT-01–04. **PRD:** FR-1/5/6/12/37/39/41. **Priority:** P0.

## Story and Context

As a metadata-tool developer, I want editable LinkML source with explicit metamodel selection,
so native schema meaning and compact syntax survive exchange. LinkML loader normalization and
JSON Schema validity can disagree; neither can replace the original source without evidence.

## Walkthrough

Import a pinned example or synthetic schema, inspect its source under an explicit metamodel,
edit a metadata value, serialize both UMF formats and compare native shape/loader outcomes.

## Acceptance Criteria

- **US-024-AC1:** Complete package/payload schemas and unchanged native metamodel JSON Schema
  retain source values, exact numbers, compact notation, original layout and unknown content.
- **US-024-AC2:** Explicit metamodel selection is separate from the source schema's own version.
  Copied access and candidate edits preserve unrelated content; future versions and encoding
  additions receive explicit interpretation/export boundaries.
- **US-024-AC3:** Every pinned upstream example plus an authored common-model fixture round-trips
  through both UMF formats and browser/native checks, including native loader rejections and
  normalization/schema discrepancies. No import closure or generator behavior is inferred.

- **US-024-AC4:** Preserve every source schema in the pinned metamodel directory and its
  metadata candidates. Compare raw-schema validation separately from native normalization,
  including compact singleton syntax accepted by the loader but rejected by JSON Schema.

- **US-024-AC5:** Preserve an explicit context of keyed UMF schemas and importer-specific
  literal bindings. Traverse reachable imports with source pointers, retain repeated edges
  and cycles, report missing/ambiguous resources and preserve every supplied source. Verify
  native closure on comparable authored graphs without claiming retrieval or merge semantics.

- **US-024-AC6:** Inspect document-local class-slot membership with native ordered ancestry,
  mixins, attributes and declaration pointers. Preserve duplicate occurrences and source;
  compare every class in the pinned example/metamodel corpus with the native runtime. Keep
  import merging, slot_usage value induction and inheritance validity separate.

- **US-024-AC7:** Derive explicitly enumerated scalar slot values with source provenance,
  respecting attribute precedence, slot inheritance, class slot_usage, numeric bound narrowing,
  default range and identity/list implications. Verify both UMF formats against native induction
  and in the browser; retain every unprojected declaration and expose incomplete interpretation.

- **US-024-AC8:** Audit local scalar induction across every class/slot query in the pinned
  example and metamodel corpus. Preserve native failures separately, compare all successful
  projections in Bun and Chromium, and verify both UMF formats retain the original sources.
  Native imports may be detached only on a private model with that scope recorded explicitly.

- **US-024-AC9:** Materialize supplied import declarations under an explicit native lookup
  or merge_imports precedence policy. Preserve all source contexts, identify collision winners
  and shadowed declarations, inject native provenance and compare complete normalized candidates
  where the supplied graph is representable by the pinned native runtime.

- **US-024-AC10:** Use every pinned metamodel source as an import-merge entry with all
  authoritative dependencies explicitly supplied. Compare both policies with complete native
  normalized models, preserve every original source, and report raw versus normalized schema
  validity separately through Bun and browser candidate round trips.

## Boundaries and Dependencies

CONTRACT-001 and ADR-002 govern core/browser behavior. Import bundles, induced classes/slots,
instance validation, semantic transformations, generators, additional versions and projections
remain required work. LinkML classes/identifiers are not automatically DDD entities/identities.
