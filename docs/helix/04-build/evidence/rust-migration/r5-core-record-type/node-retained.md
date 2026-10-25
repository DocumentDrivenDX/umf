---
ddx:
  id: umf.evidence.rust-migration.r5-core-record-type-node-retained
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.evidence.rust-migration.r5-core-record-type
      kind: informed_by
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
    - id: TP-001
      kind: informed_by
---

# Retained Node/Bun Core Record Type checkpoint

The opt-in `createCoreRecordTypeEngine` has a retained Rust verifier over five
explicit resources. Its public declaration still calls the tagged Rust
operation. Ordinary `createCoreModelEngine` does not construct this verifier.
The verifier compiles the v6 receipt schema once, prepares and recomputes a
receipt before reading `current`, and consumes an engine-local handle before
the Node facade serializes `current`. It carries one host work/control bridge
across both phases; Rust seeds receipt work and constraint counters before
current decoding. A direct Rust finish refuses an unseeded context. The
facade caps outstanding handles at 64, supports discard and dispose, and
releases its retained native runtime reference on dispose.

The frozen packet's three v6 declaration/verification pairs replayed against
a private release N-API package on Node 26.12.1 and Bun 1.4.3. A malformed
receipt refused before a `current` Proxy was read. Cross-engine/reused handles
refused before traversal, failed finish consumed its handle, and a work budget
that each phase would fit alone refused the combined call. Sol independently
reran the Node and Bun replay and the focused Bun suite (8/8, 26 assertions)
against the same private package. After adding the retained Record Members
binding, the combined addon still passes the complete Record Type packet and
focused suite. The staged package `index.js` and facade bytes match the current
repository source. Receipts are
[`node-retained-node.json`](node-retained-node.json) and
[`node-retained-bun.json`](node-retained-bun.json); both pin the packet, source
slice, runner and N-API binary. The combined binary SHA-256 is
`8c89050eaab0f86a9870b817b61694ff1d0143762507219188e697b9fc6d9060`.

Reproduce the focused replay after building a private N-API package with
`UMF_R5_RECORD_TYPE_NODE_PACKAGE` set to its directory:

```sh
node scripts/rust-migration/r5/core-record-type-node-parity.mjs
bun scripts/rust-migration/r5/core-record-type-node-parity.mjs
bun test ./bindings/core/node/tests/core-record-type-verification.test.js
```

These are source-slice receipts, not a full transitive installed-SDK build
attestation. The tagged declaration and retained verification have different
resource lifecycles; this evidence covers their named opt-in Node/Bun route
only. Extension callbacks, default-root selection, Python/CLI and release
qualification remain open. Subsequent shared binding edits require a combined
source-fixed replay before publication.
