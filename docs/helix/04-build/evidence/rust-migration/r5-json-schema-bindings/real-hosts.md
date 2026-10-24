---
ddx:
  id: umf.evidence.r5-json-schema-bindings.real-hosts
  type: execution-evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: CONTRACT-002
      kind: informed_by
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: umf.evidence.r5-json-schema-bindings.predecessor
      kind: informed_by
    - id: umf.evidence.r5-json-schema-bindings.host-shard
      kind: informed_by
---

# R5 JSON Schema real-host qualification

This receipt records source-bound host execution for the opt-in
`umf-r5-json-schema/0.1.0` profile against the frozen 30-case predecessor
packet. It qualifies the captured cohort at commit
`26a96c807a7becbb6c0f598596b861d1c83c5e57`; it does not qualify later source
changes or establish profile parity.

## Frozen replay

The host replay used `predecessor.json` (SHA-256
`06d1772cd53dd7d7660e9bd6e665cf4bb51a7c7439396dbd7f8e6dd8e91e1ee8`) and
compared complete returned/refused outcomes with ordered JSON serialization.
The comparison includes ordered envelope fields, UTF-16 strings, captured error
name, code and message, and copied-output snapshots. The frozen predecessor
packet did not capture error `path`, so path parity remains unqualified. Full
expected and actual outcomes are retained in
[real-hosts-results.json](real-hosts-results.json).

| Host path | Runtime | Exact predecessor matches |
| --- | --- | ---: |
| Native addon | Node v26.12.1 | 25 / 30 |
| Native addon | Bun 1.4.3 (Node v26.3.0) | 25 / 30 |
| Freshly packed and extracted WASM package | Bun 1.4.3 (Node v26.3.0) | 25 / 30 |
| Freshly packed and extracted WASM package | Chromium 156 | 25 / 30 |

All four hosts returned byte-identical ordered result arrays (SHA-256
`0161c2a71593b2841e37dc2cb3ffa5304fc53a609ba1d295b0510d6ba016ef0a`). The
same five cases differ on each host:

| Case | Captured difference |
| --- | --- |
| `import.invalid-native-schema` | Both sides refuse with `JSON_SCHEMA_INVALID`; Rust diagnostic wording/details differ from the predecessor validator diagnostic. |
| `inspect.success` | Rust reports `complete: false` with `JSON_SCHEMA_VALIDATOR_LIMIT`; predecessor reports `complete: true`. |
| `export.bundle` | Rust bundle contains the validator-limit diagnostic and corresponding incomplete capability result. |
| `inspect-unknown-keyword-and-exact-unsafe-number` | `JSON_SCHEMA_NUMERIC` diagnostic wording differs. |
| `copy-isolation-get-bundle-walk` | Bundle snapshot contains the same validator-limit diagnostic. |

The two diagnostic compatibility differences and the three incomplete-result
differences are preserved exactly in the result bundle. The latter are one
honest capability delta; no source or expected packet was changed to force
parity. This `0.1.0` profile is therefore **non-parity** with the frozen
predecessor. The initial synchronous Chromium replay's UI observation timed
out while the renderer was busy; the persisted browser POST receipt later
contained all 30 case outcomes and is the evidence reported above. The timeout
is retained as an inconclusive attempt, not counted as a passing run.

## Build and package identity

The native addon and WASM were built offline with pinned Rust 1.90.0 into
isolated temporary target directories. The WASM package was generated with
pinned `wasm-bindgen-cli 0.2.100`, checked with
`bun scripts/rust-migration/r7/wasm-package-sources.ts --check`, packed using
`bun pm pack --ignore-scripts`, and tested after fresh extraction. Chromium
loaded that extracted package from the local replay harness. Recorded SHA-256
identities are:

| Artifact | SHA-256 |
| --- | --- |
| Native addon dylib | `d9f4733feecd31c1adc7d2e2c61faf952366a02d5c8426c1ac60e4531aa372c0` |
| WASM `wasm-bindgen` input | `fecd9cf7eeb5364332f316ecb0c65dd7ed77c402c09c1b3cd07e573199438f59` |
| Generated web WASM module | `d47573ae7d7a7e50bc90214d6dfc68e52eb5972c6abc01201ea5ed7a7338688c` |
| Fresh package tarball | `0b9ccce6f3a8ef8e836b5dfe5cdf9b0fe0ced87cb4a296413e2857f3ca567d90` |

The result JSON includes the pre-repair source hashes and replay harness
hashes. In particular, `crates/umf-core/src/json_schema_inspect.rs` was
`e17b4d6e742c6dd5865d6b72192983a1a813bd15e6c5cb774b9fb792e0fb3e71` in the
tested cohort. A subsequent inspector wording repair is a successor source
cohort and requires a fresh build and replay before its behavior is qualified.

## Public-engine controls

Five probes were also executed through the public engine in each of the four
host paths: work-budget preflight, cancellation preflight, deadline preflight,
first meter-hook failure, and a late meter-hook failure during bundle export.
Each host returned the expected refusal code and envelope for all five probes
(5/5); the four ordered control arrays are byte-identical (SHA-256
`20d41a72e82981cb2d0ebddb8593a2a75daa7b9ec5bd05ea5c24621787cb4985`). The
late failure was observed on meter call 4 as `METER_FAILURE`. Exact calls and
envelopes are in the linked result JSON. These probes cover the exercised
control paths only; they do not establish exhaustive cancellation or timing
behavior.

## Boundary

This is local host reachability and behavior evidence for the captured source
and artifacts. It is not a release, installed-package matrix, full Draft
2020-12 qualification, upstream corpus result, native-oracle agreement, or
predecessor-parity claim. The adapter remains opt-in and must not become a
default cutover on this evidence. Any successor source or artifact must be
identified separately and replayed before inheriting these claims.
