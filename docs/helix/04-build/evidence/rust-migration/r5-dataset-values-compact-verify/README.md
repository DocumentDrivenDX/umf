---
ddx:
  id: umf.evidence.rust-migration.r5-dataset-values-compact-verify
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
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-056
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-dataset-values-compact
      kind: informed_by
---

# Compact Dataset verification ValueWork checkpoint

This packet adds verify-only boundary and ordering vectors without changing the earlier frozen compact validate/verify predecessor packet. The live predecessor freezer is `scripts/rust-migration/r5/freeze-dataset-values-compact-verify.ts`; its current script SHA-256 is `956cd1ad68524d068f35c4b09940b2cdb06ec6a6d73a220e1108ad0473c97023`. The frozen index SHA-256 is `2e0b9bff1fc85e3f5a37702debbbde80f94dbaee70ea0631bdde4bcca0bb297b`.

The natural near-threshold verification pair matches the predecessor's cumulative 1,000,000-unit `ValueWork` ledger: 267 records are accepted at 997,426 units, with the complete result, and 268 records refuse at exactly 1,000,000 with `LIMIT` / `Compact dataset JSON traversal/copy/semantic budget exceeded` / empty path. The packet file hashes are `fa8c8b01572fdf9ee5880845916215966fd64fef65c7b003fcff0e7b0482889b` (267 accepted) and `98f0b7c0733d4edf1325112f8b501cf139f743e5b5b5a708b95069ed240e57e8` (268 refused). The packet also retains commerce, stale-source short-circuit, and expected-input copy-limit controls.

Rust verification evidence on the current source:

- `cargo test -p umf-core --lib dataset_values::compact_work_ledger_tests --locked --offline -- --test-threads=1`: 11/11 passed. This includes exact frozen 267/268 category maps, a 1,000,000-unit exact boundary with immediate refusal on the next charge, cumulative verification accounting through recomputation and receipt comparison, and a fallible constraint observer that returns LIMIT at the crossing charge.
- `cargo test -p umf-core --test r5_dataset_values_compact production_compact_work_ledger_matches_near_threshold_admission --locked --offline -- --test-threads=1`: 1/1 passed, preserving selected validation's predecessor outcomes for the 349/350 pair.
- `cargo test -p umf-core --test r5_dataset_values_compact frozen_compact_verify_near_limit_pair_matches_cumulative_value_work --locked --offline -- --test-threads=1`: 1/1 passed. Production Rust verification accepts the separate packet's 267-record case and returns the exact LIMIT code/message/path at the 268-record first refusal. Test source SHA-256 is `74082ae324a9ab0650ea1a4432000c29757d624b139b01f92ea7f83fa7f73808`.
- `cargo check -p umf-core --lib --locked --offline`: passed.
- Full workspace gate passed with exit 0: `PATH=/opt/homebrew/opt/rustup/bin:$PATH CARGO_TARGET_DIR=/private/tmp/umf-r8-compact-valuework-target cargo test --workspace --locked --offline`. This integrated-source checkpoint included 364 `umf-core` unit tests, 9 full dataset wire tests, 3 compact dataset wire tests, all 55 `umf-core-wire` unit tests, and all other workspace tests and doc tests. The compact wire replay took 440.56s; the full dataset wire replay took 291.94s. No failures were reported.

Current source hashes at the integrated-source checkpoint: `crates/umf-core/src/dataset_values.rs` `af4e4d0792f28e551803a2571edfa9c32844ab417e2664da7866f85c5f57941b`; `crates/umf-core/src/engine.rs` `b78a9c092feac6eb457d764c7001c400e7d9fc760dc4b487b4b6e596d30de928`; `crates/umf-core/src/constraints.rs` `41e47dd8411c86507e257976b7213ce3b32489c9449408857ec3545bdffa2f4d`; and `crates/umf-core/tests/r5_dataset_values_compact.rs` `74082ae324a9ab0650ea1a4432000c29757d624b139b01f92ea7f83fa7f73808`.

## Qualification limits

This closes the known cumulative `ValueWork` parity gap in the Rust verify implementation: one invocation-local ledger now spans receipt admission, current validation/recomputation, expected input, and receipt comparison, and the observer can propagate LIMIT immediately at its charge point. Observer-free selected validation retains its existing behavior and is covered by the 349/350 regression. The current evidence remains scoped to these Rust tests and does not qualify `verifyCoreDatasetValuesCompact` for default Node/browser routing; installed Node, Bun, and Chromium replay is still required before any default route change.

Maintenance limitation: checked and unchecked helper variants still duplicate some traversal work, notably preflight-byte traversal, aggregate-byte traversal, and source-scan reservation. They were kept separate to preserve the fallible verify charge points while leaving selected validation's behavior unchanged. This duplication increases maintenance risk and should be considered for a later shared-mode refactor with order-preserving tests; it was not refactored during this source-freeze checkpoint. Repository-wide `cargo fmt --all -- --check` is not a passing gate at this checkpoint because it reports extensive pre-existing formatting drift across many untouched files; no workspace-wide formatter was run.

The frozen static schemas in this packet do not use `patternProperties` or boolean-valued conditional/`items` keywords. The schema walker now resolves bare URI `$ref`s, recursively reserves matching pattern branches, applies `items` fallback, and uses checked incremental charges. Regex-engine equivalence and those unexercised schema keyword forms remain outside this packet. No default-route or full-family retirement claim is made.
