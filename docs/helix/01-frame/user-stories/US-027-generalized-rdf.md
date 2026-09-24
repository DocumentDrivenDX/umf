---
ddx:
  id: US-027
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-002
      kind: informed_by
---

# US-027: Preserve JSON-LD generalized datasets

## Story and Context

As a metadata integration author, I need blank-node predicates retained when a JSON-LD
source uses generalized RDF. A standard RDF projection may disclose their omission, but
that projection cannot replace the generalized source model.

## Acceptance Criteria

- **US-027-AC1:** Define a versioned extension package and complete payload/native dataset
  schemas for the JSON-LD generalized subset, with local blank scope and exact JSON source.
- **US-027-AC2:** Recover JSON through both UMF formats, expose copied quads, and edit an
  existing quad atomically. Preserve unknown native content and block its interpretation;
  unknown encoding content must block native export without preventing UMF recovery.
- **US-027-AC3:** Project the two pinned generalized JSON-LD cases into this extension and
  back to JSON-LD, preserving shared blank identities across all term roles. Verify expected
  generalized datasets and independent native output, with explicit parser qualifications.
- **US-027-AC4:** Verify source/candidate recovery, edits, unknown guards and reverse projection
  in Bun and Chromium without Node globals or external retrieval. RDF 1.1 export must reject
  these envelopes rather than dropping blank predicates.

## Dependencies and Boundaries

CONTRACT-027 governs the generalized dataset representation; CONTRACT-026 governs JSON-LD
projection. This subset has node subjects/predicates and literal objects. Literal subjects,
literal predicates, reasoning, global blank identity and standard N-Quads export are outside it.
No structural similarity alone promotes these terms into UMF core.
