---
ddx:
  id: umf.evidence.rust-migration.r8-core-facets-installed-current-20261026
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-core-facets-installed
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-core-facets
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
    - id: TP-001
      kind: informed_by
---

# Core Facets fixed-point installed replay — 2026-10-26

This cohort replays the four bounded Core Facets public operations through the
installed Node, Bun, and Chromium package routes and compares their results
with the frozen TypeScript predecessor: `inspectCoreFacets`,
`declareCoreFacets`, `verifyCoreFacetDeclaration`, and
`historicalCoreFacetPatch`. The harness also checks JSON admission and host
reflection behavior. It does not change the configured default route.

The archive is `.cache/sdk-distribution/umf-sdk.tgz`, SHA-256
`63c72d374aff9181837ef2286dd732e52626286c9b9b199a5c12b9f3b9c331d5`
(43,264,896 bytes). Its package manifest SHA-256 is
`d2cc6f364b381a4d4fbe90dc483cb7ae94c9c9850b60e249185249f91a259d30`. The
embedded closure has 3,450 live inputs and SHA-256
`5804c9072e5fa85a8c50b362ae4e4f1039a1b5f91ff44b740d2eea489a8fa78f`; the
captured and recomputed closure hashes match, with `fixed-point` status and
zero generated transforms. The independent archive preflight verified all
1,789 listed member hashes. See [preflight](preflight.json),
[member hashes](member-hashes.json), and [live source inputs](live-source.json).

The installed route artifact SHA-256 values are pinned in each host receipt.
The key artifacts are `dist/umf-node.js`
`95b61512d49f35c82e28bd0cc3225afdfa043e10adf466efa1c15522cc367069`,
`dist/umf-browser.js`
`460209a70ad2f9a6001381a124078d6a29007b9e639ccec2477ea9b2d7ac9ad6`,
`dist/umf.js`
`b95916bdb6b4791b223bd04d84b34b4ff68ad7330658468a529005cefbad68b7`, and
`dist/rust-default-manifest.json`
`9d1c53b999da56c3dc796cf5eee51e2e3892fa555701ae1c4ece5d89fb6715d9`. Both
packaged source helpers are present in the retained closure:
`bindings/core/node/src/json-schema-import-source.js` and
`bindings/core/wasm/src/json-schema-import-source.js`.

Node 26.12.1, Bun 1.4.3, and Chromium 153.0.8010.12 all passed the frozen
predecessor comparisons. Each host exercised one inspection result, three
declarations, one valid declaration verification, six historical projection
outcomes, and ten exact refusal envelopes. The vectors preserve unknown
extension and nested qualifier content, including an isolated UTF-16
surrogate, and check that inspection and declaration outputs are detached
from inputs. Historical projection refusals remain observable where the
frozen cases contain unsupported groups or schema-properties bounds.

Admission controls matched the TypeScript reference for hidden/accessor
properties, symbol keys, cycles, NaN, infinity, and negative zero. Accessor
getters were not invoked. A malformed request was refused before source
inspection, and a malformed receipt before reading the current document; both
corresponding read counters stayed at zero. Installed and reference proxy
controls had the same reflection trap order. When a proxy trap threw an Error
Proxy, each route rethrew the same object and read none of its name, code,
message, or path fields. These controls characterize this JS host boundary;
they do not establish arbitrary-object admission behavior for Rust callers.

Chromium used the installed browser route in a real browser. It confirmed that
`process` and `Buffer` were absent, the expected WASM resource was requested,
and no external requests occurred. The recorded raw receipts are [Node](current-node-20261026.json),
[Bun](current-bun-20261026.json), and [Chromium](current-chromium-20261026.json).
The harness SHA-256 is
`33d106c60eb6081251de2859fe2343bbffdcc8867f2abbda3f8b4b47a91c17d3`.
The raw receipt SHA-256 values are Node
`095414d88b627ab0bb7e578d69ad7f16e7f94ca4e8402815518fb2f77c6d3bf5`, Bun
`c2a4609a7d26255683474fb8a97058cfe726d97603fd8b6e48d2577411571c0c`, and
Chromium `233f0b49930f6582ab1a34ab1641ae5a672c71e53f033fab91507c87457b08fd`.

Reproduce the replay from the repository root with Bun and Playwright:

```sh
bun docs/helix/04-build/evidence/rust-migration/r8-core-facets-installed/replay-installed.mjs \
  .cache/sdk-distribution/umf-sdk.tgz \
  docs/helix/04-build/evidence/rust-migration/r8-core-facets-installed/current-facets-20261026 \
  63c72d374aff9181837ef2286dd732e52626286c9b9b199a5c12b9f3b9c331d5 \
  5804c9072e5fa85a8c50b362ae4e4f1039a1b5f91ff44b740d2eea489a8fa78f \
  current-fixed-point-20261026
```

Scope is limited to these operations, this archive, and the recorded hosts.
There is no `maxWork` or cancellation argument on the installed public
operations, so this cohort makes no default-route resource-budget claim.
Cooperative zero-work `RESOURCE_LIMIT` and cancellation evidence remains in
the R5 opt-in binding work. This evidence does not establish complete parity,
TypeScript retirement, a broader SDK claim, or release authorization.
