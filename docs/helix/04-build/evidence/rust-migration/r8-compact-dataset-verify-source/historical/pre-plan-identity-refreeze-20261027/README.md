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

This current five-case packet replays the live TypeScript R5 freezer outcomes against a fresh source-built Rust V4 default route. The [current source index](index-current.json), SHA-256 `74854e253f79e5cbbdfa1d939f7271a612332b4f2cc92fafab7641de2994c0d0`, binds the cases. A private refreeze after metamodel regeneration produced byte-identical output for all five payloads; the source pins reflect the regenerated `spec/core/schema.json` and `spec/core/semantic-type-reference.schema.json`. Historical `index.json` remains intact.

The checked-in [build manifest](build-manifest.json), SHA-256 `7e22134d72023245036097ec4f110b9ddb773eb820ecb681d77a5d677b941da6`, binds the refreshed index and source closure SHA-256 `9143f872a1bb2cd3d4aa5d25da4ec0c7d7f06c3b22447f1b32b54e70d5629681` across 1,973 source inputs. It was built at `/private/tmp/umf-r8-arrow-schema-properties-refresh-20261027` using Rust/Cargo 1.90.0, wasm-bindgen 0.2.100, and Bun 1.4.3. Each replay verified the full live source closure and all six compiled artifact hashes against this immutable manifest before executing. The immediately preceding packet is retained under [`historical/pre-arrow-generated-source-20261027/`](historical/pre-arrow-generated-source-20261027/); earlier cohorts remain in their existing historical directories.

Node v26.12.1 and Bun 1.4.3 each passed all five cases with 14 Rust calls. Chromium 153.0.8010.12 passed all five cases with 14 WASM dispatches, requested the pinned WASM, and had no Node globals. Current receipt SHA-256 values are Node `51ee40086233372f6f267e9fbce2b1caa5f951c90790a60e4e958e6f37c72de9`, Bun `299f643fe901ac62efd4825bea58c5934e2539d1be6d5aedfc04c249d8db985f`, and Chromium `b7e35d2037c868abcea0cb266accb60b719ab4f10f68c35f602dd42e19a07130`. Payload and receipt hashes are recorded in [`SHA256SUMS`](SHA256SUMS). Historical cohorts remain under [`historical/`](historical/).

This is bounded source-tree evidence for the five verifier cases and stated host controls. It does not qualify an installed SDK archive, a release, every Dataset semantic, or declaration retirement.
