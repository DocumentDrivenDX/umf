**Approved for the dispatch-observer correction scope.** I found no defect in the composed changes. The Node hook observes actual calls through both entrypoints, preserves the receiver, arguments, result, thrown value, and property flags, and rejects missing or immutable methods. The browser helper finds one marker for each entrypoint and removes both breakpoints. Packet, parity, reference, resource, prototype, and asset controls remain in place; the helper and its tests are source pinned.

My read-only checks passed: 8 focused unit tests, syntax checks for the changed scripts, and inspection of the actual addon descriptors and bundle markers. The supplied direct-bundle diagnostic reports native and Chromium dispatch with zero reference calls. **Installed-archive qualification remains open** until fresh archives are rebuilt and replayed; the diagnostic does not qualify them.

SHA-256 of the reviewed composed files:

| File | SHA-256 |
|---|---|
| `scripts/package-sdk-rust-default.ts` | `55ea6bdde648feb14a2386f4a8e076e430b535c941dc981abb07eda1fd9d170b` |
| `scripts/rust-migration/r8/core-facets-dependency-installed-replay.mjs` | `4c4bea6469432516a12f1d25577cd958d5529721aa0187ff6906e61eaff3ff90` |
| `scripts/rust-migration/r8/core-facets-installed-asset-controls.mjs` | `f854fbc8c7f035a80fa24c6b9964f6168d0fc86472668cbc99834ed117b8cc60` |
| `scripts/rust-migration/r8/core-facets-dispatch-observer.mjs` | `af75a9f769ba8ef50247798faa61f5cbab5c55c13aa632fd20205898a022d198` |
| `scripts/rust-migration/r8/core-facets-dispatch-observer.test.mjs` | `e6efc04166799928c38187de3d13ca1675f18dde994634901c52a205f4fc56bb` |
| `scripts/rust-migration/r8/core-facets-dependency-installed.test.mjs` (unchanged) | `2cb6e2bd375c09ce7edcc31cedd193beb732b7cac62abbff7300533d01e63236` |