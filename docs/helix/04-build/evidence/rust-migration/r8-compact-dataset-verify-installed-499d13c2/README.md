---
ddx:
  id: umf.evidence.rust-migration.r8-compact-dataset-verify-installed-499d13c2
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-056
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-compact-dataset-verify-source
      kind: extends
---

# Installed Compact Dataset verifier replay

The [installed receipt](installed.json), SHA-256
`ccce03bdc87c4f93910ae01268503be1ef241729399841155281bec9139a5226`, records
`qualified-pass` for the exact
private SDK archive SHA-256
`5ec44a154649cc0ddfd17279f9d686f7f87bcc92277ff113721c45d6173b4f89` and
source-closure SHA-256
`499d13c2e4a4a2373eea763ab3fe359861fb1218a24ae030bddf4f405bf18df5`. The
archive reports a zero-transform fixed point and all 1,805 packaged member
hashes verify. Its declared source closure pins this exact replay harness and
the packet index plus all five frozen case files byte-for-byte.

Node 26.12.1, Bun 1.4.3, and Chromium 153.0.8010.12 passed the five frozen
compact verifier cases and host controls. For each case, the explicit
`./reference` route made zero native/WASM calls and the default route made two.
The extracted package root identities were verified; Chromium loaded the
packaged WASM, had no Node globals, and made no external requests.

This qualifies only the listed installed compact-verifier cases and host
controls for this exact archive. It does not qualify all Dataset semantics,
retire declarations, or establish release acceptance.
