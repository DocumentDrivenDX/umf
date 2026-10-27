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

This current five-case packet replays the live TypeScript R5 freezer outcomes against a fresh source-built Rust V4 default route. The [current source index](index-current.json), SHA-256 `a5bc998f18c0d26cc62ee0eb64e0765235ad5e7e5d62484cd1ebceaceb43a31c`, binds the cases. A private refreeze produced byte-identical output for all five payloads; only the generated compiler-provenance pins for `spec/core/schema.json` and `spec/core/semantic-type-reference.schema.json` changed. Their model hash remains `35b72a7f6aa86c98398192e5b67d5841d77127743c671c742dd871a7baee58ca`. Historical `index.json` remains intact.

The checked-in [build manifest](build-manifest.json), SHA-256 `1dfb786e44d32a22ed7595bf7f3b4a6be0692b5932c3b9de87ad2da894996ae4`, binds the refreshed index and source closure SHA-256 `45133a5eab727481d7ee30d0cfaa1e00ccf2b10ea9d0117a9952887f17e00f2c` across 1,969 inputs. It was built at `/private/tmp/umf-r8-compact-security-final-20261027-refrozen/dist` using Rust/Cargo 1.90.0, wasm-bindgen 0.2.100, and Bun 1.4.3. Each replay verified the full live source closure and all six compiled artifact hashes against this immutable manifest before executing. The immediately preceding manifest, receipts, and source index are retained under [`historical/pre-arrow-copyjson-source-20261027/`](historical/pre-arrow-copyjson-source-20261027/).

Node v26.3.0 and Bun 1.4.3 each passed all five cases with 14 Rust calls. Chromium 153.0.8010.12 passed all five cases with 14 WASM dispatches, requested the pinned WASM, and had no Node globals. Current receipt SHA-256 values are Node `3fdef9935f8266c6e253f487883f1fba9ea7cfc0a66062face23ee01cbffcb3b`, Bun `664206c3396eafacd9406f578e9f1238ae6e228eda5617b41cc9a47a2598a780`, and Chromium `ca24a1ca84a283bd00eb911ca08a348a23f70906ddfe4db4a732fe0a23b6f792`. Payload and receipt hashes are recorded in [`SHA256SUMS`](SHA256SUMS). Historical cohorts remain under [`historical/`](historical/).

This is bounded source-tree evidence for the five verifier cases and stated host controls. It does not qualify an installed SDK archive, a release, every Dataset semantic, or declaration retirement.
