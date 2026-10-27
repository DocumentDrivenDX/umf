---
ddx:
  id: umf.evidence.rust-migration.r8-v4-default-facade-slice
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-v4-default-barrel-separation-plan
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-symbol-inventory
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-core-inspectors-installed
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
---

# R8 V4 default facade source slice

This slice replaces the Node and browser V4 roots' runtime star edge to
`src/index.ts` with a generated explicit facade. The reference source barrel
and `./reference` route remain unchanged. This changes default V4 bundle
reachability; it does not delete TypeScript declarations or mark mappings as
retired.

The generator resolves exports with the TypeScript checker, follows aliases to
declaration origins, compares local Node/browser override names, and emits
separate type-only and runtime bindings where required. It preserves 1,886
export names and exact type/value facets in `src/index.ts`, `src/index-node-v4.ts`,
and `src/index-browser-v4.ts`: 1,120 runtime facets and 771 type facets. The
five merged type/value names retain both facets. All 76 V4 local overrides
remain selected. The 33 shadowed Inspector and Relationship values are omitted
from the generated facade.

The focused generator test also builds Node and browser metafiles. Both exclude
`src/index.ts` and all 11 targeted TypeScript operation modules, while
retaining Rust host bindings and the six relationship factory modules. The
same generator check is run from `scripts/package-sdk-rust-default.ts`; its
generator and test are included in that builder's immutable source-input
closure. The test does not run a new SDK package build and does not alter the
sealed 26aa archive.

Frozen relationship behavior checks against the current source roots:

- Node: 18/18 cases pass: six projected, six blocked, and six `NON_JSON`.
- Real Chromium: 15/15 cases pass: five projected, five blocked, and five
  `NON_JSON`; output, trace, and error parity pass with zero page errors.
- Both preserve the recorded predecessor outcomes. The reference route remains
  a separate TypeScript entry and is not changed by the facade.

The first Chromium attempt used checked-in WASM glue that lacked the required
`securityNotScalar` export and failed during harness setup. The successful
replay used untracked artifacts under `/private/tmp/umf-v4-facade-slice`, built
with Rust 1.90.0 and wasm-bindgen 0.2.100:

| Artifact | SHA-256 |
| --- | --- |
| WASM glue `umf_core_wasm.js` | `ea57d12a681ac63b7ccd6109c217afab539044bbd57488fdac0edf7d94ec9329` |
| WASM binary `umf_core_wasm_bg.wasm` | `cdc53f9cfb35856b1715b00d360be866978bc799c5e46034225dc96892114a14` |
| Chromium replay bundle | `2970b01d2db5906b96d29278b0a1482f27072fd3bf93b1b7d4793b1b03d1f4b2` |

The replay receipts pin the case hashes and replay-input source hashes,
including the generated facade and action-plan identity:
[`relationship-node.json`](relationship-node.json) and
[`relationship-browser.json`](relationship-browser.json). The installed
26aa capture and its receipts remain immutable.

The replay manifests pin both newly discovered runtime inputs and the relevant
generated evidence hashes at this checkpoint:

| Source or generated evidence | SHA-256 |
| --- | --- |
| `src/index-v4-default.ts` | `09ea62d2cee97b1d2a271417e19c3d559171cc34bb83835a02db0f3b41759a81` |
| `src/extensions/actions/plan-identity.ts` | `eb7c17d8c553da06098807daca49ef8ecec39f7d7791f69826148eb5eff611b4` |
| `scripts/rust-migration/r8/v4-default-facade.mjs` | `204da6d1c99d5040e06445837ba177b8db7112e416bfa53a9135baf1bc8e4373` |
| `src/index-node-v4.ts` | `85a0f80d04353627eec968cf0a5650011141b2b719d4f9057ee5fb5e60b040ee` |
| `src/index-browser-v4.ts` | `dc381f1a7ce61862d4775c35b8bab419571b1c42dad4157391ff475a4a00a2f8` |
| R8 runtime inventory | `159ed518151d3eab681b28f97d542c9c51a2017ab78efcbe11aa00695bfe9b7c` |
| R8 gap ledger | `383ede15de7b95d297e488ad8eb342bfdd308ede116b1eca549f03604b1c5010` |

The recaptured inventory has 3,375 route-specific runtime declaration rows
across 509 source files. The ledger remains at 922 logical default-route
retirement gaps: 77 accepted opt-in Rust operations, 845 without accepted
Rust mappings, and zero declarations retired on either V4 route. Its 100
source-selected declaration rows count direct root declarations with exact
Rust ownership mappings; this is not the accepted operation count or a
retirement count.

No retirement claim follows from bundle exclusion. TS source declarations,
non-root callsites, and `./reference` behavior remain governed separately.
The generated facade cannot establish that every exported behavior has been
ported to Rust, and this slice does not claim it has.
