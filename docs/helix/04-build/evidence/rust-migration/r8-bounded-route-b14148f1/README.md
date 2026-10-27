---
ddx:
  id: umf.evidence.rust-migration.r8-bounded-route-b14148f1
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: TP-001
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-security-and-or-installed-b14148f1
      kind: references
---

# b14148f1 private installed SDK qualification

The [full installed receipt](installed-test-receipt.json), SHA-256
`0aa5990abf18238996b2888d539e5e1e33cf121e306a899756a26b874021dee7`,
records a passing macOS arm64 private archive replay. SDK archive SHA-256 is
`372f4c9d91202d904e1a1c736389563d0b023d9bf0fb9a6858e9ed902aa688ad`;
fixed-point source closure is
`b14148f15a6a3a77864c42e305857a6abb6e0b700aa21a797ed21b0751f97f9c`,
with zero generated-source transforms and 1,805 archive members. The nine
canonical archive integrity tests pass.

`bun scripts/test-sdk-rust-default.ts
.cache/sdk-distribution/cohorts/b14148f1/umf-sdk.tgz` passed package-root and
explicit reference conditions, three route tamper refusals, 31 R3 installed
cases, 27 JavaScript numeric cases and six numeric boundaries, 66 cardinality,
19 facets, 14 keys, 11 Bit128/UUID, and 19 compact Dataset validation cases.
Node v26.12.1, Bun 1.4.3, and real Chromium 153.0.8010.12 exercised the
installed package. The suite also passed missing/corrupt native addon and WASM
refusals. Its installed Security And/Or replay passed 68 cases per host with
30 valid Rust/WASM calls each; the [raw 68-case receipt](../r8-security-and-or-installed-b14148f1/security-replay.json)
preserves per-case outcomes and traces. The entire suite took 1,048,563 ms.

The b141 archive predates the later `verifyCoreDatasetValuesCompact` default
selection. These results qualify only the archive's captured source and stated
subsets. Linux x64, complete contract acceptance, the remaining 922 logical
default-route gaps, final integration, and public release remain open.
