---
ddx:
  id: TD-027
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: US-027
      kind: informed_by
    - id: CONTRACT-027
      kind: informed_by
    - id: CONTRACT-026
      kind: informed_by
    - id: ADR-002
      kind: informed_by
---

# TD-027: JSON-LD generalized dataset preservation

## Scope and Approach

Implement the bounded generalized dataset representation from CONTRACT-027. Reuse NativeJson
for exact source/unknown content and the registry for package validation. Keep generalized data
in a separate package so RDF 1.1 serializers cannot silently erase blank predicates.

## Components

The generalized-rdf adapter validates known quad shapes and semantic term constraints, while
retaining unsupported native JSON as an uninterpreted source. Interpretation happens only after
unknown-field checks; temporary JSON decoding cannot become a lossy public result. Copied edits
replace the native root only after validation and retain originalSource.

The JSON-LD adapter selects native quad-array output for generalized projection and creates the
new envelope. Reverse projection consumes copied native quads, keeps literals typed, and uses
the existing exact RDF JSON-literal conversion hook. Full source envelopes remain in reports.
Exact shared signatures and option behavior are governed by CONTRACT-026/027.

## Validation and Risks

Exercise the pinned generalized corpus, source and candidate JSON/YAML recovery, reverse
projection and edits. Compare quads using role-aware graph isomorphism so one blank shared between
subject and predicate cannot be mistaken for two nodes. Standard N-Quads parsers require an
explicit parsing adaptation for the official generalized expected files; disclose that adaptation
separately from unmodified native JSON-LD processor output. Repeat in Chromium. NativeJson limits
and unsupported term positions remain explicit, and no global identity or entailment is inferred.


The native reverse converter originally used predicate.value directly, losing the blank-node
marker and producing an unmapped JSON-LD property. The pinned fromRdf.js patch now uses the
same node-ID conversion for predicates as for subjects. Both official generalized datasets survive
reverse projection and reprojection by term-role isomorphism after that fix. This is covered by
the existing nine-file fresh-install check; ordinary IRI predicates retain their previous values.
