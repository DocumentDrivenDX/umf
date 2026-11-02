---
ddx:
  id: umf.evidence.rust-migration.r8-avro-field-classifier-sol-review
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.evidence.rust-migration.r8-avro-field-classifier
      kind: informed_by
    - id: CONTRACT-007
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
    - id: TP-001
      kind: informed_by
---

# Independent Sol review: bounded Avro Field classification

Sol reviewed the new Rust operation against `src/core-ideals/avro-field.ts`
and the exact request/result schema. Review found that the initial existing-kind
test modified a different field than the selected identity, and that the
archive comparison needed to precede field derivation and identity lookup.
The test and refusal order were corrected. A second review found that the
classifier imported `avro_document` without the matching
`embedded-adapters` feature gate; the module registration now shares that
gate. `cargo check --locked --offline -p umf-core --no-default-features`
passes.

Sol independently reran the final Rust 1.90.0 locked/offline integration
suite: 3/3 passed for a declared field with retained native fragment, an
existing unproven kind, and root/dependency archive mismatches. The updated
unit test also passed 1/1 for verified Field, conflicting Record, stale and
wrong-identity author receipts. Reviewed module SHA-256 is
`64c484b0a4b3fac7d4dc0eaa0e594226c15febd40449622d0f8585e2cdd13348`;
integration test SHA-256 is
`e065da99bfd690c2e2d5427011464200c254dadf55c696eff406122c10691ba5`.

This is a bounded, opt-in core classifier for declared record/error field
membership. It does not implement `recoverAvroFieldBundle`, replay the full
TypeScript packet, qualify raw getter order or select an installed host route.
It therefore does not retire either public Avro Field export.

## Classified-bundle recovery follow-up

Sol reviewed the recovery implementation against the TypeScript
`recoverAvroFieldBundle` order. Review removed a second native JSON parse
after successful classifier recomputation, which otherwise added an unrelated
failure and budget phase. It also corrected a blocked-receipt test that had
edited the first element rather than the selected Field and required work
charging before allocating the recovered dependency list and string copies.
The final module is formatted; Sol independently reran all four Rust 1.90.0
locked/offline focused tests. Source SHA-256 at review is
`88ab1206644ffc08db80cc19a7047334c47dbbfe2f722320607658449e7172de`.

The four tests cover exact original root/dependency text, tampered receipt,
stale current target and blocked status. Canonical comparison uses admitted
Rust number values, and no complete TypeScript packet, Node/Bun, browser,
Python or default-route replay has been performed. The public Field exports
remain unretired.
