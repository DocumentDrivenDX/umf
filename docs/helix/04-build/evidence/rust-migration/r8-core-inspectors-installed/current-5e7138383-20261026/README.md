---
ddx:
  id: umf.evidence.rust-migration.r8-core-inspectors-installed-current-5e7138383
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-core-inspectors-installed
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
---

# R8 installed Core Inspector and raw-profile replay — 2026-10-26

This evidence is pinned to clean source commit
`5e7138383e0e613a63b093b895835432c0570ebd`. The private SDK archive is
`/private/tmp/umf-r8-sdk-5e7138383/umf-sdk.tgz`, SHA-256
`7e9bc9c1de4ff519d91f1fde6b0c6b30bde367a8d5c6aa5f610d018a247520b8`. Its
captured-live and recorded source-closure hashes both equal
`138b719c1b2e099b636de1b12b0cee7201fdec483d30d8d59d9d274fe315816e`, with
3,476 files and a fixed-point transform with zero generated-input changes.
The archive manifest SHA-256 is
`272aad9da356997301ee2ca4d31ce86644772e45b02a6007dcf751c65d93932f`; it
records all 1,794 verified archive members in `archive-manifest.json`.

The installed Core Inspector replay passed all 26 frozen cases: 8 scalar type,
9 record member, and 9 reference-link cases. Installed default and explicit
`./reference` routes agreed in Node 26.12.1, Bun 1.4.3, and Chromium 153.0.8010.12.
Chromium requested the packaged WASM. Missing and corrupt native-addon controls
were refused. The bounded root host-shape replay covered four accessor/hidden/
symbol refusals and a forged-proxy case per inspector in Node, Bun, and
Chromium; default/reference outcomes matched. For missing-addon package imports,
Node reports `Error` and Bun `ResolveMessage`, both with `MODULE_NOT_FOUND`.
Corrupt-addon imports report `ERR_DLOPEN_FAILED` in both runtimes.

The installed raw-profile replay passed 9 fixture cases across Lakebase,
Unity Catalog, and Spark Delta: one authored profile, one missing-members
control, and one target-version mismatch per system. Default and `./reference`
outcomes matched in Node, Bun, and Chromium. A root accessor admission control
returned the same result without invoking its getter. Chromium requested the
packaged WASM and had no Node globals. Missing/corrupt addon imports were
refused with the same runtime error-class difference described above. This is
bounded package behavior evidence; it does not establish native execution for
those data systems.

Receipts are `core-inspectors-main.json`, `core-inspectors-host-node-bun.json`,
`core-inspectors-host-browser.json`, and `raw-profile-installed.json`. The
raw-profile harness is
`scripts/rust-migration/r8/raw-profile-current-installed.mjs`; the receipt pins
its SHA-256. The archive copy and full member manifest are retained under
`/private/tmp/umf-r8-sdk-5e7138383/`.

This evidence qualifies only the pinned clean source cohort and the stated
cases. Subsequent source changes are outside this capture; the current dirty
consumer source has not been qualified by these receipts. These results do not
claim Inspector retirement, complete adapter support, full SDK qualification,
native Lakebase/Unity Catalog/Spark behavior, platform coverage, or release
readiness.
