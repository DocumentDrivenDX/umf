---
ddx:
  id: US-077
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-026
      kind: informed_by
---

# US-077: Declare a dashboard independently of its BI platform

**Feature**: FEAT-026

As a dashboard designer, I want one platform-neutral declaration of a dashboard's
pages, datasets, visuals and filters so that translators and generators can target
Lakeview, Tableau or other BI tools without re-reading each platform's format.

## Acceptance Criteria

- **US-077-AC1:** The authored marketing-campaign dashboard survives JSON/YAML with
  page order, two shared datasets, counter/line/bar/table visuals, a markdown text
  block and global filters that each name their dataset targets. Dataset queries and
  measure expressions remain incomplete interpretation. Metadata access returns copies.
- **US-077-AC2:** Wrong scope or container, a non-filter on a global-filters page,
  unlisted/duplicate/non-page page order, a missing dashboard root, dangling or non-
  dataset references, undeclared fields, aggregation contradictions, missing measure
  expressions, missing/misplaced/repeated channels, inconsistent custom sorts, invalid
  filter targets or defaults, out-of-grid positions, shared trace ids and malformed
  theme colors fail validation.
- **US-077-AC3:** Unknown fields, overlapping layout and opaque expressions remain
  recoverable and prevent conservative edits.
- **US-077-AC4:** Fully interpreted dashboard edits are atomic and reject invalid
  results; the input document is unchanged.

## Evidence and Limits

`tests/dashboard/profile.test.ts` contains authored expectations and meaningful
mutations. The fixture is authored from a deployed Lakeview dashboard's structure; it
is not a native-tool corpus and no Lakeview or Tableau oracle is claimed. CONTRACT-055
governs rule scope. Browser execution, native translators and loss reports are
follow-on work; completing this story does not make dashboards portable on its own.
