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

This current five-case packet replays the live TypeScript R5 freezer outcomes against a fresh source-built Rust V4 default route. The [current source index](index-current.json), SHA-256 `475f7311eec810c84806b23ee6d0bd41c99bedc9b2bc84bd99318962d917db68`, binds the cases. A private refreeze produced byte-identical output for all five payloads; only the generated compiler-provenance pins for `spec/core/schema.json` and `spec/core/semantic-type-reference.schema.json` changed. Their model hash remains `35b72a7f6aa86c98398192e5b67d5841d77127743c671c742dd871a7baee58ca`. Historical `index.json` remains intact.

The checked-in [build manifest](build-manifest.json), SHA-256 `0faa8dc02cb0e0068af0b66c5e0cffe46a7d16c3c15d953403916c643bc6dc65`, binds the refreshed index and source closure SHA-256 `12e2975de46a4bed5749e4f93390959f2a0ebed30cf23b36940189c328451a61` across 1,969 inputs. It was built at `/private/tmp/umf-r8-copyjson-current-replay-refrozen-20261027` using Rust/Cargo 1.90.0, wasm-bindgen 0.2.100, and Bun 1.4.3. Each replay verified the full live source closure and all six compiled artifact hashes against this immutable manifest before executing. The immediately preceding manifest, receipts, and source index are retained under [`historical/pre-arrow-pointer-20261027/`](historical/pre-arrow-pointer-20261027/).

Node v26.3.0 and Bun 1.4.3 each passed all five cases with 14 Rust calls. Chromium 153.0.8010.12 passed all five cases with 14 WASM dispatches, requested the pinned WASM, and had no Node globals. Current receipt SHA-256 values are Node `3e83d2c6df3d9db394f511b5062762cde7eb78974ce6ef6a6575a263e4174005`, Bun `a11852d1aff25683d27904f29b91af2c38f231f2a6e612f1b407d593a2346cdb`, and Chromium `3579a0ffd4b0b27f2feaa038a9603d877b6d1dc2dfeb317e1bf916142facdab4`. Payload and receipt hashes are recorded in [`SHA256SUMS`](SHA256SUMS). Historical cohorts remain under [`historical/`](historical/).

This is bounded source-tree evidence for the five verifier cases and stated host controls. It does not qualify an installed SDK archive, a release, every Dataset semantic, or declaration retirement.
