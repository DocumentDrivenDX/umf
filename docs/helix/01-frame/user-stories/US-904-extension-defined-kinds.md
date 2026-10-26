---
ddx:
  id: US-904
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-001
      kind: informed_by
    - id: umf.prd
      kind: informed_by
---

# US-904: Discover and validate extension-defined object kinds

**Feature:** FEAT-001, EXT-01–06. **PRD:** FR-4/5/15/20/21/23/27/31/41.

## Story

As a schema integration maintainer, I want ordinary UMF tooling to list and
inspect extension-defined kinds, so I can identify and validate a dashboard or
another native object without teaching every tool its platform vocabulary.

## Context

Core Field, Record and Group describe structure. Extension payloads already
distinguish native objects, but generic consumers cannot obtain a registered
kind catalog or distinguish a resolved kind from an arbitrary payload label.
An object may have several extension classifications while retaining its core
shape and every native payload.

## Walkthrough

1. The maintainer installs a trusted versioned extension and its validator.
2. A generic inspector lists the kinds that package declares.
3. The maintainer opens a document carrying a dashboard declaration.
4. The inspector shows the exact extension/version/kind, owner scope, definition
   and document validation diagnostics without a dashboard-specific renderer.
5. The maintainer inspects the dashboard's declared dataset Records and Fields
   using ordinary core tooling; platform calculations remain extension content.
6. A consumer lacking the package retains the document and reports its
   interpretation gap instead of guessing the kind or claiming validation.

## Acceptance Criteria

- **US-904-AC1:** Given an installed kind-aware extension, a generic inspector
  lists its kind definitions and allowed scopes without an ecosystem allowlist.
- **US-904-AC2:** Given a declared dashboard payload, generic discovery returns
  its exact kind identity and source location, alongside document validation.
- **US-904-AC3:** Given a registered kind with a wrong scope, missing tag or
  unknown tag, ordinary document validation reports an attributable error.
- **US-904-AC4:** Given an unavailable exact package or an unsupported catalog,
  inspection preserves input and reports incomplete coverage without version
  fallback or interpreting a same-named kind from another extension.
- **US-904-AC5:** Given a dataset with explicitly declared shape, core tooling
  discovers its Record and Fields and the extension validator resolves visual
  and filter bindings to those identities. Unspecified types remain unspecified.
- **US-904-AC6:** Given existing packages without kind declarations, their
  payload validation and native recovery remain unchanged by kind discovery.
- **US-904-AC7:** Given competing extension kinds on one owner, discovery keeps
  both identities without implying equivalence, inheritance or core eligibility.
- **US-904-AC8:** Given the same corpus and installed capabilities, native Rust,
  Python, Node/Bun and real-browser bindings agree on entries and diagnostics.
- **US-904-AC9:** Given hostile inputs, unknown qualifiers or mutation attempts,
  registration/discovery fails explicitly or reports incomplete interpretation,
  without executing artifact code, losing content or changing registry meaning.

## Edge Cases

Same local kind name in two extensions remains two identities. Different exact
versions coexist in a registry; the document selects one version per extension.
Missing packages do not trigger downloads. A structurally valid dashboard with
opaque SQL is discoverable while semantic completeness remains false. A kind
named `record` in an extension never becomes a core Record by its spelling.

## Test Scenarios

| Scenario | AC | Expected result |
| --- | --- | --- |
| Synthetic dashboard at document scope | AC1–3 | Discover qualified identity; reject the same kind at forbidden element scope |
| Two packages declaring `dashboard` | AC4/7 | Separate entries; no alias or fallback |
| Core Record with two declared Fields | AC5 | Generic core selection sees both; a broken widget field binding is rejected by the extension |
| Package absent, catalog unsupported, legacy package | AC4/6 | Distinct coverage states; source unchanged |
| Unknown kind called `field` | AC7/9 | No scalar/default/key privileges without actual core Field kind |
| Installed bindings and Chromium | AC8 | Exact shared corpus parity, including negative cases |

## Dependencies

CONTRACT-907 defines the package, discovery, validation and compatibility
interfaces. ADR-005 / CONTRACT-080 govern generated authority; ADR-006 governs
shared implementation. No external service is required for this story.

## Out of Scope

Dashboard rendering, query execution, automatic type inference, a universal
dashboard vocabulary, and declaring native Lakeview acceptance from synthetic
tests. A real adapter's byte-exact and native semantic round trips remain its
own qualification obligations.
