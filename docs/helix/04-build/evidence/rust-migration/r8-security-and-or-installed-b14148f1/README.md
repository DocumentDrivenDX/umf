---
ddx:
  id: umf.evidence.rust-migration.r8-security-and-or-installed-b14148f1
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

# Installed Security And/Or replay on b14148f1

The [raw installed receipt](security-replay.json), SHA-256
`62e36dbf06f794f585b836a2cdc33d6863db1b7076297df0e338400099407af4`,
pins private SDK archive SHA-256
`372f4c9d91202d904e1a1c736389563d0b023d9bf0fb9a6858e9ed902aa688ad`.
The archive declares fixed-point source closure
`b14148f15a6a3a77864c42e305857a6abb6e0b700aa21a797ed21b0751f97f9c`
with zero generated transforms. The installed harness and frozen 68-case
predecessor packet are members of that closure; packet SHA-256 is
`d5dddb6766cadd5f9e3c45ef40f7d9fc8d5d486d59d3163b236477ef6966308d`.

Node 26.12.1, Bun 1.4.3, and Chromium 153.0.8010.12 each match all 68
default and reference outcomes and reflection traces. Each default route makes
30 valid Rust/WASM calls, zero refusal calls, and zero unattributed calls. Each
reference route makes zero Rust calls. Chromium requests the installed WASM
asset and makes no external requests or use of Node globals. The Node/Bun
package-resolution check compares canonical file identities, accounting for
macOS `/var` and `/private/var` aliases while still requiring the exact
extracted executable.

Replay command from the repository root, after extracting the pinned archive
as `/private/tmp/umf-r5-installed/package`:

```sh
UMF_EXPECTED_SECURITY_ARCHIVE_SHA256=372f4c9d91202d904e1a1c736389563d0b023d9bf0fb9a6858e9ed902aa688ad \
  bun scripts/rust-migration/r8/security-and-or-installed-replay.mjs \
  /private/tmp/umf-r5-installed/package \
  .cache/sdk-distribution/cohorts/b14148f1/umf-sdk.tgz \
  docs/helix/04-build/evidence/rust-migration/r8-security-and-or-v4-source-replay/predecessor.json \
  /private/tmp/umf-security-b141-receipt.json
```

This is a bounded private macOS arm64 installed cohort. It does not qualify
Linux x64, full CONTRACT-062 acceptance, all default routes, or a release.
The 922 logical executable retirement gaps remain open.
