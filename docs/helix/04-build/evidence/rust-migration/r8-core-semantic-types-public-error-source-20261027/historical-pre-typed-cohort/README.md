---
ddx:
  id: umf.evidence.rust-migration.r8-core-semantic-types-public-error-source-20261027
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-078
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-core-semantic-types
      kind: extends
---

# Source-built V4 semantic-type public error replay

The [Chromium receipt](browser-run.json), SHA-256
`c3dac14af5b2c90e70269f0052450518fd05a0758d8ec709e7920566a6a9331a`,
records 16 passing cases on Chromium 153.0.8010.12 using the fresh private
source build pinned by the [compact build manifest](../r8-compact-dataset-verify-source/build-manifest.json),
SHA-256 `cc64757207ebe4416ae6e06d8da15c7286cf14ef8746c024b1229a2062e8ec49`.
The build's expanded source-closure SHA-256 is
`fe43b2381febcef45413b0b2d4dd218cdd983f513c8493f1b4605f81ebd2d12d`.

The replay used `scripts/rust-migration/r5/replay-core-semantic-types-default-browser.mjs`
(SHA-256 `f3b9ecc9bddaf1ed715867aea45b20ee0ad1fdd998be5a1c150ca6184abd69ab`)
with `UMF_R5_BROWSER_BUNDLE` and `UMF_R5_WASM_PATH` set to the manifest's
`umf-browser.js` and `umf_core_wasm_bg.wasm`. It asserted that raw model failures
are translated to the public `UmfError` class, preserved unknown qualifiers,
and observed no Node globals. This qualifies the bounded source route and
public error surface. It does not establish installed-archive acceptance or
retire the remaining TypeScript route.
