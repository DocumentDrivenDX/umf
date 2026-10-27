---
ddx:
  id: umf.evidence.rust-migration.r8-compact-dataset-verify-source
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-049
      kind: informed_by
    - id: CONTRACT-056
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-dataset-values-compact-verify
      kind: extends
---

# Compact Dataset verifier V4 source replay

This current five-case packet replays the live TypeScript R5 freezer outcomes against a fresh source-built Rust V4 default route. The [current source index](index-current.json), SHA-256 `f53bd756f2ec898f4dd20489018b3cd34484d9da284e8e502fd2636ef029e86c`, binds the cases. A private refreeze produced byte-identical output for all five payloads; only the generated compiler-provenance pins for `spec/core/schema.json` and `spec/core/semantic-type-reference.schema.json` changed. Their model hash remains `35b72a7f6aa86c98398192e5b67d5841d77127743c671c742dd871a7baee58ca`; the compiler hash changed from `9bbe88d319848bb0f0cab36c5d3ae825725a17593e244511b485d191489b17b0` to `802a89ef7df5737f19fe6dc5c170e5c75a6986a7c5808ed358f7c203c9c179ab`. Historical `index.json` remains intact.

The checked-in [build manifest](build-manifest.json), SHA-256 `65bb6505f247e221f55b3e0fe7a5b998c76ef7470b390bfae33c8140add3d5aa`, binds the refreshed index and source closure SHA-256 `571569bc131aaa1a38c6d52edfd2273cec7cf13e52e01b77eb63d8b2b03c31ed` across 1,967 inputs. It was built at `/private/tmp/umf-r8-compact-current-cardinality-checkpoint-3/dist` using Rust/Cargo 1.90.0, wasm-bindgen 0.2.100, and Bun 1.4.3. Each replay verified the full live source closure and all six compiled artifact hashes against this immutable manifest before executing. The immediately preceding manifest, receipts, and source index are retained under [`historical/pre-compiler-provenance-refreeze-20261027/`](historical/pre-compiler-provenance-refreeze-20261027/).

Node 26.12.1 and Bun 1.4.3 each passed all five cases with 14 Rust calls. Chromium 153.0.8010.12 passed all five cases with 14 WASM dispatches, requested the pinned WASM, and had no Node globals. Current receipt SHA-256 values are Node `7fc79d7b3308c6ddb5ba578ee2d5b8880140e613e964fc18f4ba351d3ccf140d`, Bun `6ab251fce864f4ddb4b74d86b71a3eb672d72ff9e44b4e83d0d827543b0a7d7e`, and Chromium `786e03ba134be2f33bc0d0276e895557c7b88d2dbe29071ec3813248db301460`. Payload and receipt hashes are recorded in [`SHA256SUMS`](SHA256SUMS). Historical cohorts remain under [`historical/`](historical/).

This is bounded source-tree evidence for the five verifier cases and stated host controls. It does not qualify an installed SDK archive, a release, every Dataset semantic, or declaration retirement.
