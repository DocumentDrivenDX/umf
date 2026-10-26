---
ddx:
  id: umf.evidence.rust-migration.r8-security-not-direct-binding
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: ADR-006
      kind: informed_by
    - id: CONTRACT-062
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-security-not-admission-adapter
      kind: extends
    - id: umf.evidence.rust-migration.r8-security-truth-logic-binding
      kind: informed_by
---

# R8 direct `securityNot` Rust binding

## Scope and disposition

This slice adds a direct scalar call for `securityNot` to the Node N-API and
WASM bindings. The host first applies the predecessor's strict equality check
for `T`, `F`, and `U`; invalid inputs raise the predecessor `UmfError` with
code `SECURITY_TRUTH`, message `Invalid security truth`, and an empty path.
That check performs no object reflection. It therefore leaves getters and
Proxy traps untouched and runs before meter, cancellation, or clock callbacks.
For admitted tokens, Rust charges one unit through its `Context` host-control
hook and applies the existing `security_logic::security_not` decision. The
main request and result no longer pass through generic JSON tagging.

The direct operation now backs the `securityNot` export selected by both V4
package roots through `createSecurityNotRustAdapter`. The default TypeScript
source export in `src/index.ts` and internal TypeScript imports remain
unchanged; AND, OR, and composition continue through their existing routes.
This is a single-operation V4 root override, not a complete security migration.

## Parity and controls

The frozen 14-case Node 26.12.1 and Bun 1.4.3 comparisons in [`node.json`](node.json)
and [`bun.json`](bun.json) exercise the compatibility route:
`createSecurityNotRustAdapter(createSecurityLogicEngine())`. That guard rejects
invalid values with the predecessor's `UmfError` before invoking Rust and sends
valid T/F/U decisions to the direct scalar operation. Both hosts match all 14
outcomes and host-effect traces. The raw WASM factory alone is not fully
compatible: on invalid inputs it returns `UmfCoreError` instead of the
predecessor's `UmfError`, with the same `SECURITY_TRUTH` code, message, empty
path, and no getter or Proxy effects.

The fresh [Chromium route comparison](chromium.json) confirms this distinction
in Chromium 153.0.8010.12. The raw factory matches only the three valid truth
tokens (3/14); all eleven invalid cases differ only in error class/name. The
source compatibility adapter matches all 14/14 cases, including error
class/name/code/message/path and getter/Proxy effect traces. The receipt pins
the current browser source cohort, including the V4 browser root.

The [V4 root comparison](../../../../../../scripts/rust-migration/r8/security-not-v4-root-parity.mjs)
matched all 14 cases in freshly built `dist/umf-node.js` against unchanged
`dist/umf.js` under Node 26.12.1 and Bun 1.4.3. The
[installed archive replay](installed-route.json) also matched all 14 cases in
Node, Bun and Chromium while exercising the package's actual Node/browser
exports and loading its WASM asset. This receipt is provisional: the builder
manifest marks the archive
`private-r7-default-route-qualification-source-drift-not-publishable` because
the private snapshot included concurrent uncommitted capture-tail source.
Rebuild from the clean committed cohort and rerun the installed replay before
treating this as final package evidence or release qualification.

All three valid tokens reach Rust through the guard. Invalid values with meter,
cancellation and clock controls enabled call none of those callbacks. A valid
token at `maxWork: 0` still returns `RESOURCE_LIMIT`; cancellation returns
`CANCELLED`; the meter receives one unit for a successful scalar call.

Captured host results and timing summaries are in [`node.json`](node.json) and
[`bun.json`](bun.json).

The Rust wire crate test `direct_security_not_keeps_rust_truth_and_host_control`
also checks T/F/U, one-unit charging, Rust invalid-token refusal, and a host
resource refusal. The focused `security_logic_wire` suite passes 6/6. The Node
package security logic suite passes 4/4 using the freshly built release addon.

## Local timing sample

The harness used 10,000 warm-up calls and five runs of 100,000 alternating
T/F/U calls per route. Median per-call times were:

| Host | TypeScript predecessor | Direct Rust binding | Guarded Rust adapter | Earlier generic-wire Rust |
| --- | ---: | ---: | ---: | ---: |
| Node 26.12.1 | 7.45 ns | 168.85 ns | 173.35 ns | 10.08 µs |
| Bun 1.4.3 | 3.70 ns | 184.76 ns | 185.79 ns | 9.81 µs |

The prior generic-wire values come from the same-host sample in the preceding
[`r8-security-not-admission-adapter`](../r8-security-not-admission-adapter/README.md)
receipt. These are local microbenchmarks, not a release performance claim.
They show that the direct route removes nearly all of the generic tagged-JSON
binding cost while retaining the required Rust call and host controls. The V4
root selects the guarded adapter and accepts the measured small-call cost over
the raw binding to preserve the established admission contract: about 4.5 ns
per call on the Node sample and 1.0 ns on Bun. These remain local
microbenchmarks, not a release performance claim.

## WASM qualification

Rust 1.90.0 built the release `wasm32-unknown-unknown` target with wasm-bindgen
0.2.100. The NodeJS WASM smoke check returned T/F/U, invoked a successful
control callback once with amount 1, and preserved a `CANCELLED` refusal. The
fresh Chromium receipt adds browser source parity for the guarded route;
`installed-route.json` records provisional installed Node/Bun and Chromium
package-root parity. This does not change `src/index.ts` or internal TypeScript
callers and does not establish complete security support. Reproduce the
source-level browser cohort with:

```sh
bun scripts/rust-migration/r8/security-not-browser.mjs docs/helix/04-build/evidence/rust-migration/r8-security-not-direct-binding/chromium.json
```

## Source pins

The table below is the original direct-binding slice's source cohort.
[`chromium.json`](chromium.json) pins the fresh browser comparison and the
installed archive manifest pins its compiled source closure. The V4 root files
in that provisional archive were `src/index-node-v4.ts`
(`931fd947592cda93687e9a967f8a19614046b609c82b0f4885c19ede82f86aee`) and
`src/index-browser-v4.ts`
(`2b0514befb028aa7410b27a9638d606d0b5e59560353517844a10842aded4c1d`). A
clean-source rebuild and replay will supersede these installed-route pins.

| File | SHA-256 |
| --- | --- |
| `crates/umf-core-wire/src/security_logic_binding.rs` | `d94fc1e66dca1d571fe24c76a8e3a5050b695bffa0dd8f29374020eb9fe05087` |
| `crates/umf-core-wire/tests/security_logic_wire.rs` | `dc68377b1fb728d53f273512dfc72854b90cb4c5fdb569c3d99f1724efafd3bf` |
| `bindings/core/node/src/lib.rs` | `b08e4ed50b6a3637acf92704eb378931406f85be82afa86a8d4b15bc416d6e5b` |
| `bindings/core/wasm/src/lib.rs` | `37bac28e7c9c4eae099144e1a32a7002c3dae6588110a7d5fa1c9997e9452aac` |
| `bindings/core/node/index.js` | `889b5ccd763b496d531eaf330de3ff7b47aba4e6ee6de6daeebea3319535b638` |
| `bindings/core/wasm/index.js` | `478fd28093117f314496e790450433af3083e124884474d49621b2ee1352473b` |
| `bindings/core/node/src/security-logic.js` | `5d2f5e273b38a271b3ab7c771073da23db2c5b422065a095be79d374533468f0` |
| `bindings/core/wasm/src/security-logic.js` | `5d2f5e273b38a271b3ab7c771073da23db2c5b422065a095be79d374533468f0` |
| `scripts/rust-migration/r8/security-not-adapter-parity.mjs` | `74b995e9f6b8b42f8c145ee01212700915b25df3c9635c63cd5d5dcc399a7760` |

The Chromium receipt carries exact hashes for its current execution cohort,
including the guarded adapter and browser harness. The installed-route receipt
records the archive and package-manifest hashes plus host/runtime versions. A
clean-source rebuild and replay remain required for final package qualification.
