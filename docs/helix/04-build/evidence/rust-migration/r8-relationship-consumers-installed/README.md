---
ddx:
  id: umf.evidence.rust-migration.r8-relationship-consumers-installed
  type: evidence
  activity: build
  status: captured
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-relationship-consumer-predecessor
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-sdk-26aa44ca1-private-package
      kind: informed_by
---

# R8 installed relationship-consumer replay

This evidence exercises the clean installed SDK archive for selected relationship consumers. The archive is pinned by SHA-256 `8ff3aa827681d759ac7e4bf842b5aef4275d906b3ae3d7f8f433918320aa18e3` and source-closure SHA-256 `2063ba59a111da1c4812e3a18967487aadc966bed3d858e8da4b358ca97287ff`. The archive manifest and all 1,800 listed member hashes were verified before the replay. The fixture/input generators are pinned in `receipt.json` to the frozen 18-case predecessor packet.

Reproduce from the UMF repository root with:

```sh
bun scripts/rust-migration/r8/relationship-consumers-installed.mjs \
  /private/tmp/umf-r8-sdk-26aa44ca1/umf-sdk.tgz \
  2063ba59a111da1c4812e3a18967487aadc966bed3d858e8da4b358ca97287ff \
  docs/helix/04-build/evidence/rust-migration/r8-relationship-consumers-installed/receipt.json
```

The installed Node route passed 18 cases on Node v26.12.1 and Bun 1.4.3; the browser route passed its 15 browser-capable cases on Chromium 153.0.8010.12. Each route matched the frozen outcomes and getter traces. Node and Bun recorded 96 Rust addon-export calls each; `./reference` made zero addon calls in both. Chromium recorded 240 WASM-export calls for the default route, and zero WASM calls for `./reference`. Accessor refusals entered neither Rust implementation. Exact per-case call names/counts and results are in `receipt.json`.

PostgreSQL is excluded from Chromium. The installed PostgreSQL consumer requires a backend as its explicit fifth argument, so the Node replay supplies a separately Node-targeted adapter built from `native/postgresql/runtime.ts`. It normalizes that source's CommonJS `proto.js` import and externalizes the pinned `@libpg-query/parser@17.6.10` dependency. The receipt records source, schema, parser package/WASM, and generated backend bundle hashes. Consequently, this replay does not claim that the SDK archive is self-contained for Node PostgreSQL projection.

This is a bounded installed-package replay of selected consumer cases. It is not a full adapter matrix, a retirement claim, or a release qualification.
