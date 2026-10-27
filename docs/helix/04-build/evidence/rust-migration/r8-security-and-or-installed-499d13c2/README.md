---
ddx:
  id: umf.evidence.rust-migration.r8-security-and-or-installed-499d13c2
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-062
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-security-and-or-v4-source-replay-current
      kind: extends
---

# Historical diagnostic: installed Security And/Or replay on 499d13c2

The [historical receipt](security-replay.json), SHA-256
`69286ff5228740aea09395493eb58f7a57b30895cce17acf240678c2bf8120f9`, records
68 behavioral cases against an extraction used with SDK archive SHA-256
`5ec44a154649cc0ddfd17279f9d686f7f87bcc92277ff113721c45d6173b4f89` and
source closure
`499d13c2e4a4a2373eea763ab3fe359861fb1218a24ae030bddf4f405bf18df5`.

This capture is diagnostic only. Its runner checked the archive bytes but did
not compare the supplied extracted package tree with the archive. Therefore the
receipt does not bind the exercised package files to that archive. It also
reported the Bun parent runtime version in the Node row, so the recorded Node
version is not reliable. The receipt is retained to preserve the original
capture and must not be used as installed-package qualification.

A later installed replay uses byte-for-byte package inventory verification,
archive/member safety checks, and child-reported runtime versions. The 499d13c2
capture does not qualify Linux x64, complete CONTRACT-062 acceptance, all
default routes, or a release.
