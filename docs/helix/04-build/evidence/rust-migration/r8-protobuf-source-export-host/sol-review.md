---
ddx:
  id: R8-PROTOBUF-SOURCE-EXPORT-HOST-SOL-REVIEW
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: R8-PROTOBUF-SOURCE-EXPORT-HOST
      kind: informed_by
    - id: CONTRACT-003
      kind: informed_by
    - id: umf.plan.rust-migration
      kind: informed_by
---

# Sol review of Protobuf source-export host packet

I independently checked the frozen Node/WASM package hashes and nine selected
source, wrapper and harness hashes in the packet. I reran the focused
Rust 1.90.0 source-export integration target: 5/5 passed. I then ran the
isolated native-addon Bun suite: 9 tests, 35 assertions passed, including
14 outcomes paired live with the TypeScript predecessor. Its packet test took
158.4 seconds and the suite 177.2 seconds. That latency is a material concern
for default routing, separate from the behavioral comparison.

I independently ran the source-bound WASM package in Chromium
153.0.8010.12. All 14 frozen predecessor outcomes matched; the output SHA-256
was `dd7f81411403f2cfffead27d7245a9d1f17529d395320805e41fdcbf7b4cb6fc`,
identical to the implementing agent's captured receipt. The comparison
normalizes only the browser-specific wording of the null-result native
`TypeError`, while retaining its null code/path and failure phase. The
source-export callback is an explicit host capability and the package remains
opt-in.

This accepts the scoped packet at its recorded source and artifact hashes. It
does not establish a default route: replaced `Array.prototype.find` behavior
differs, arbitrary proxy mutations are outside the event subset, the 14-case
packet is not full Protobuf support, and installed SDK route/performance and
the R8 retirement gates remain open. The subsequent numeric binding edits
will form a different integrated source cohort.
