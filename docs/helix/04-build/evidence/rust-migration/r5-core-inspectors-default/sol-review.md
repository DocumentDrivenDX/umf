---
ddx:
  id: umf.evidence.rust-migration.r5-core-inspectors-default.sol-review
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.evidence.rust-migration.r5-core-inspectors-default
      kind: reviews
    - id: CONTRACT-001
      kind: informed_by
---

# Sol review of bounded core inspector source selection

I reviewed the three default binder routes, frozen predecessor replay, and
real-browser harness. The initial binder called TypeScript `copyJson` before
Rust and therefore did not make Rust the sole admission/copy owner. That call
was removed. The binder now forwards the original input references and only
translates the Rust `CORE_*` error class to the existing `UmfError` class.

I independently reran the Bun parity replay: 8 scalar-type, 9 record-member,
and 9 reference-link envelopes matched. The replay checks input reference
forwarding, representative error prototypes and copy isolation. I also ran
the repository-owned Chromium 153.0.8010.12 harness against the isolated
WASM package. All 26 frozen outcomes matched; metering, a zero-work refusal,
and repeated/unknown reference role order passed. The harness creates its
temporary binder build directory and pins the package and source hashes in
`chromium.json`. Type checking and `git diff --check` passed.

No P1/P2 remains in this bounded source-route review. It does not establish an
installed SDK cohort, general model completeness, Python exposure, or retirement
of the TypeScript implementation.
