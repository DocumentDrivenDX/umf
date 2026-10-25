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

- `cargo test -p umf-core --lib dataset_values::compact_work_ledger_tests --locked --offline -- --test-threads=1`: 8/8 passed, including exact frozen 267/268 category maps and the incremental schema reservation LIMIT regression.
- `cargo test -p umf-core --test r5_dataset_values_compact compact_verify --locked --offline -- --test-threads=1`: 2/2 passed for canonical host order and verification refusal ordering.
- `cargo test -p umf-core --test r5_dataset_values_compact frozen_compact_verify_near_limit_pair_matches_cumulative_value_work --locked --offline -- --test-threads=1`: 1/1 passed in 22.46s. This new full-verifier regression feeds the separate verify packet's 267 accepted and 268 first-refused cases through production Rust verification and checks the complete result or exact `LIMIT` code/message/path. Test source SHA-256 is `74082ae324a9ab0650ea1a4432000c29757d624b139b01f92ea7f83fa7f73808`.
- `cargo test -p umf-core --test r5_dataset_values_compact production_compact_work_ledger_matches_near_threshold_admission --locked --offline -- --test-threads=1`: 1/1 passed after the checked-charge change, 82.46s. The separate validation 349/350 ledger pair remains covered by the compact core evidence.
- `cargo check -p umf-core --locked --offline`: passed after the incremental charging change; `bun run typecheck` passed after the freezer typing correction.

The source SHA-256 after rustfmt and the focused rerun is `92c2121a1968303c67a822e14b013a94aa65320bd0074d43f1b5ba6d7a0f1917` for `crates/umf-core/src/dataset_values.rs`; the integration-test source SHA-256 is `74082ae324a9ab0650ea1a4432000c29757d624b139b01f92ea7f83fa7f73808` for `crates/umf-core/tests/r5_dataset_values_compact.rs`. The internal ledger tests are in the core source file, and the separate frozen verify corpus now has a focused Rust integration regression.

## Qualification limits

This proves the frozen bounded core vectors and exact near-threshold result/refusal for those inputs. It does not qualify `verifyCoreDatasetValuesCompact` for default Node/browser routing. The verify path still has phase-level ledger charges in several existing loops (`reserve_source_scans`, `count`, preflight byte traversals, and the document/semantic observer); these can finish a bounded phase before the next `enforce()` rather than returning on the precise first over-limit event. Context limits and direct-Rust depth checks bound input size, but they do not establish TypeScript's exact first-refusal order for arbitrary dual-fault inputs. The prepare/verify host staging and cumulative limit behavior also need installed Node, Bun, and Chromium replay before any default route change.

The frozen static schemas in this packet do not use `patternProperties` or boolean-valued conditional/`items` keywords. The schema walker now resolves bare URI `$ref`s, recursively reserves matching pattern branches, applies `items` fallback, and uses checked incremental charges. Regex-engine equivalence and those unexercised schema keyword forms remain outside this packet. `verifyCoreDatasetValuesCompact` therefore remains inherited from TypeScript; no default-route or full-family retirement claim is made.
