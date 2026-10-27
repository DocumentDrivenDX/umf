---
ddx:
  id: umf.evidence.rust-migration.r8-bounded-route-97e2325e
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
    - id: CONTRACT-041
      kind: informed_by
    - id: CONTRACT-053
      kind: informed_by
---

# Fixed-point macOS bounded route cohort, 97e2325e

The private macOS arm64 SDK archive at
`.cache/sdk-distribution/cohorts/97e2325e/umf-sdk.tgz` has SHA-256
`ff89d87351b29e9762ac5bd76370944c437a1827e8dc5c32ede2fc53b8e2591a`.
Its captured and live source closure both have SHA-256
`97e2325ecc8c630e13914027a2ca0f161f109843cb566faad0bf2fc96d254613`:
3,530 inputs, fixed point, zero generated-input changes, and 1,803 regular
archive members. The archive is an ignored private build output; its bytes
must be retained separately to reproduce archive-opening checks.

[`cohort.json`](cohort.json) pins the archive, source closure, package
metadata, member map, platform, native target, and 27 raw receipts. The
[source closure](archive-source-cohort.json),
[member map](archive-members.json), and
[package metadata](archive-package.json) are retained separately. The 27
files under `receipts/` replay four Core Relationship, three Core Inspector,
and two CSV Boolean operations through the installed default and explicit
TypeScript reference routes on Node 26.12.1, Bun 1.4.3, and Chromium
153.0.8010.12. The expanded CSV packet has 44 validation and 17 verification
cases, plus two separate TypeScript-only Record presence cases. All bounded
outcomes and traces matched; every reference case made zero Rust/WASM calls.
The six large CSV receipts are stored as deterministic `.json.gz` files;
decompression reproduces the exact uncompressed SHA-256 values in
`cohort.json` (all 27 pins verified). The other receipts remain plain JSON.

The package archive/tamper suite passed 9 tests. The complete
[installed SDK receipt](installed-test-receipt.json) passed in Node, Bun, and
Chromium on this archive (SHA-256
`8dc67c68e3633befe528eefa689b5af3538cbfd63175833ba1a745dd5d2150a9`).
It covers the installed package-root and `./reference` conditions, 31 R3
cases, missing and corrupt native/WASM refusals, and the existing Cardinality,
Facets, Keys, Bit128, Compact Dataset, and numeric packets. The separate
[security receipt](security-and-or-installed-receipt.json) (SHA-256
`834ac9c80ec9a76376700490aed7456119e9f974608ffe642632672278a517ad`)
passed 68 frozen cases in all three hosts, including 30 valid Rust/WASM calls
per host and zero refusal or reference-route Rust calls.

This source snapshot predates the V4 Record Values and Semantic Types cuts.
Those routes require a new fixed-point archive and installed replay. The
independently built Linux x64 cohort and combined hosted matrix are still
missing. `/2` packets provide bounded route evidence; the retirement
validator rejects them because full contract acceptance is open. All 922
logical default-route gaps remain open, and this bundle does not qualify a
release.
