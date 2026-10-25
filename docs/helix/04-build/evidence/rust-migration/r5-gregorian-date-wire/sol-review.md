---
ddx:
  id: umf.evidence.rust-migration.r5-gregorian-date-wire.sol-review
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.evidence.rust-migration.r5-gregorian-date-wire
      kind: informed_by
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-066
      kind: informed_by
---

# Independent Sol review: Gregorian tagged wire

Sol independently replayed all 50 current Bun 1.4.3 predecessor cases and
reran the Rust Gregorian core (3/3) and tagged wire (5/5) suites. Review found
that the first wire test compared only seven hardcoded truncations; it now
compares every frozen representable truncation success or refusal class and
adds a date-before-unit refusal case. The current case packet SHA-256 is
`b541979548245ebe2378608036a6ad5bd5ce0ae95660a9524cc9d014644ff115`;
wire module SHA-256 is
`739c3cd4c512e7ba7548b279ea22711c4c00820b171b89ec91df5fa144034f47`;
wire test SHA-256 is
`bcfb52e1a4509a3a774b348709f77475699b50721190e553d305832db865d13f`.

This accepts an opt-in tagged JSON operation for the explicit Gregorian civil
date profile. It preserves the tested result values and TypeError/RangeError
classes, but branch-specific RangeError messages and raw JavaScript host
accessors/proxies are not covered. No Node/Bun/Chromium/Python binding,
default route, timezone semantics or retirement claim follows from this wire
test.
