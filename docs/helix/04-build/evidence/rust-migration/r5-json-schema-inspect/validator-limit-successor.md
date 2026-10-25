---
ddx:
  id: umf.evidence.rust-migration.r5-json-schema-inspect.validator-limit-successor
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
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-002
      kind: informed_by
    - id: TP-001
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-json-schema-inspect
      kind: references
    - id: umf.evidence.r5-json-schema-bindings.predecessor
      kind: references
---

# JSON Schema validator-limit successor replay

This checkpoint replays the unchanged 30-case predecessor against the current opt-in Rust inspector profile. The three cases that previously returned `JSON_SCHEMA_VALIDATOR_LIMIT` (`inspect.success`, `export.bundle`, and `copy-isolation-get-bundle-walk`) now qualify through the recursively checked validator profile and match their frozen predecessor outputs. The evaluator limits and refusal behavior were not relaxed. The predecessor remains unchanged at SHA-256 `06d1772cd53dd7d7660e9bd6e665cf4bb51a7c7439396dbd7f8e6dd8e91e1ee8`.

The host builds used a private immutable source snapshot at `/private/tmp/umf-r5-json-schema-validator-limit-build-snapshot`, captured with 1,514 files and tree SHA-256 `86b6ba53e5f1ac6e8df7a6550429f62ffa2d4e16d652b77f0189a984b86bbf12`. To run the full focused Rust test target, its single included fixture (`fixtures/json-schema/upstream/draft2020-12/type.json`, SHA-256 `4c5cbe6cbcd28af73761091367b20e07d0403847e236c06c31fc27061bd81192`) was then added to the retained snapshot. The final test snapshot has 1,515 files and tree SHA-256 `9db11c0ebcbdd6f0331e748fb51cb97733351591d7975b799bae9d6eaebe5546`; it has the same runtime/build sources as the archive cohort. The updated snapshot manifest is `/private/tmp/umf-r5-json-schema-validator-limit-build-snapshot.json`. Relevant source hashes in that snapshot were:

| Input | SHA-256 |
| --- | --- |
| `crates/umf-core/src/json_schema_inspect.rs` | `73a73f0133a547d105237fead6e0e65a03b658efc581c94ccc128754e0f2a5f9` |
| `crates/umf-core/tests/r5_json_schema_inspect.rs` | `1acba326cee4f7743a812a19f8e90f146c0f264950b9e404fbf443fb3b30d55e` |
| `crates/umf-core-wire/src/lib.rs` | `4b5aa81f987672c2f1a0e9f13231f16d5352ca2f9bfb3bbb5cdb87a519ef6e58` |
| `Cargo.lock` | `d74d138ee00f217cd0b77840d0f0262384c8e3930ed736382fd2b62ef7905fc3` |
| shared Node/WASM JSON Schema facade | `8bd803fef729c8145f087d6eac97ffb374e8d6057c0b18c72e4a2d0bb120b813` |

The extracted candidate archives were:

| Archive | SHA-256 | Extracted runtime artifact |
| --- | --- | --- |
| `/private/tmp/umf-r5-json-schema-limit-node.tgz` | `f7515383412f96528bb9e9f0b51510b03499157774e15a9993b6d4ba9e00e7ee` | Node addon `5c3c6c122540e22a02922408d7aa66d34e66bb7fed3b70431e52a456cf32ff7c` |
| `/private/tmp/umf-r5-json-schema-limit-wasm.tgz` | `702242908d102ca88a916671d0563c0e25fca70e9f90705854b7cfbfc3917d2a` | WASM `c2b92a75caae1c59b608ee2a2c61f3841b45d0d8662745229a396747885b8509`; generated glue `a529650ad33bc71fe6e319fc315b5c25ef8da223dbe59f69396b1a10ce3d45c5` |

All replays used the extracted archive and the frozen predecessor. Node native, Bun native, Bun WASM, and real Chromium Headless 153.0.8010.12 each matched all 30 cases with zero mismatches. Each host also passed all five refusal controls: work limit, cancellation, deadline, first meter-hook failure, and late meter-hook failure.

| Host receipt | SHA-256 | Control receipt | SHA-256 |
| --- | --- | --- | --- |
| `/private/tmp/umf-r5-json-schema-limit-node-extracted-replay.json` | `a70485976b041ec606dc837f3baa652cc35a4d456a6b2957baefdb2e722fa917` | `/private/tmp/umf-r5-json-schema-limit-node-extracted-controls.json` | `8fde0bd23bcbadeae6dc2f42fbcd8d9a6ab404e504de604f0956e8380b3643b5` |
| `/private/tmp/umf-r5-json-schema-limit-bun-extracted-node-replay.json` | `46b1781fd0eb303c566c05f0aeaae5140bd7b8e597d68c6d0fcf3dcdee6b2f02` | `/private/tmp/umf-r5-json-schema-limit-bun-extracted-node-controls.json` | `d09bd04bcaf084e464738c75c6dbdcda812f562e37028d8b09cdbc3548372053` |
| `/private/tmp/umf-r5-json-schema-limit-bun-extracted-wasm-replay.json` | `f18f23c63bffe609d569a98fad1fa6812a0a64b11c6640b8bcfdbec796e4b63a` | `/private/tmp/umf-r5-json-schema-limit-bun-extracted-wasm-controls.json` | `e163bde76f36340ffe1a43328c9da182bdd3fac0159a480f958cf2ccaca92c68` |
| `/private/tmp/umf-r5-json-schema-limit-chromium-extracted-results.json` | `c40498361fe8739c0edaabececa7db115cb5be7a6e347503e8ab0d5747814b2f` | `/private/tmp/umf-r5-json-schema-limit-chromium-extracted-results.json.controls.json` | `a27dcceca59abc19c25a9fb94fcad5cd21e6a96349fe657dd16390636e6cd1cb` |

The source test `frozen_validator_limit_mismatch_profile_is_complete_after_recursive_qualification` additionally exercises the nested local `$defs` schema and relative/boolean resources from the captured mismatch profile and asserts clean complete inspection without changing source bytes. The full focused Rust inspector target passed 14/14 against the retained 1,515-file test snapshot. This evidence qualifies only the current opt-in inspector subset and captured macOS arm64 Node/WASM candidate. It does not qualify the package default, other platforms, or the missing edit/parser/Registry operations. The combined source tree continued to move during this work, so these results describe the immutable snapshot and extracted archives, not a live-tree release build.

Independent Sol review checked the retained receipt against all four local host
replay files: each file's SHA-256 matched its recorded pin, each host recorded
30/30 cases and 5/5 controls, and all 30 retained Chromium outcome hashes
matched the frozen predecessor hashes. This reviews the captured evidence; it
does not substitute for a fresh integrated-source build or broaden the opt-in
support claim.
