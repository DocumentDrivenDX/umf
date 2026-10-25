---
ddx:
  id: umf.evidence.rust-migration.r5-semantic-types-bindings
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-078
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-core-semantic-types
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-semantic-type-accessors
      kind: informed_by
---

# R5 opt-in semantic-type host bindings

Six tagged Rust operations are exposed through the opt-in Node/Bun and WASM core-model wrappers: core inspect, get, declare and verify, plus extension get and set. The wrapper decodes only the exact absent core-get sentinel to JavaScript `undefined`; present values remain JSON arrays. The live TypeScript predecessor packets for the core operations and extension accessors are pinned by `receipt.json`. No default SDK route changed.

The corrected replay script and receipt replaced an earlier Node script that completed its assertions but exited with `ReferenceError` while printing `Bun.version`. At this packet's review checkpoint, Sol checked all 16 receipt source hashes against the worktree and independently reran the six wrapper unit tests (6/6). A clean npm-pack tarball (`4fe38c6a379b921bf920745841c1c71233a6a6a093cd083a4556324f643ce3c5`) was installed under `/private/tmp/umf-semantic-node-install`; the copied replay script has the same SHA-256 (`f664ee6896528020a9106a4ad031f937122d8683d5bc4acb4841ca2df943a828`) as the receipt. Sol imported the package by name from that clean prefix and replayed all six operations successfully under Node 26.12.1 and Bun 1.4.3, including absent versus null, copy isolation, zero-work, cancellation and deadline controls. Sol also reran the real Chromium 153 WASM replay: all six operations, the absent sentinel, copy isolation and tested controls passed with no Node globals. The bound build and commands are recorded in `receipt.json` (SHA-256 `d5ac0addd829ff921515ec575c3d749c2e0048eed6e80af7487a1bf50ded8921`).

This is a bounded six-operation result. The TypeScript `setSemanticTypes` native `TypeError` for a runtime-invalid document with `vocabularies: null` is frozen but not represented by the current Rust error envelope. Trusted semantic validator callbacks, generic registry methods, Python bindings, full source-transition behavior, exact default-route replacement and release qualification remain open. The installed package replay still reads the frozen inputs and resources from this repository; it establishes installed binding resolution, not an independently packaged resource closure.
