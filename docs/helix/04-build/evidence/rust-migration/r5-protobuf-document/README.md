---
artifact_id: R5-PROTOBUF-DOCUMENT-OPERATIONS
artifact_type: evidence
status: captured
---

# R5 Protobuf descriptor document operations

This packet covers an opt-in Rust core slice built on the existing descriptor
codec and inspector. It adds binary descriptor-set import into the current
`umf.protobuf` document shape, binary export, an independently copied
descriptor getter, and bundle recovery with a copied source document and
ordered diagnostics. It does not implement source compilation, source editing,
source emission, default adapter cutover, or complete Protobuf semantics.

The native bundle type keeps the descriptor bytes as `Vec<u8>` and the recovered
document as an owned `Value`. `get_descriptor_set` returns a separately copied
tree. Import and the shared document gate run the embedded UMF core validator
before Protobuf inspection, including root envelope, ID and module checks.
Export refuses unknown extension and source-archive fields that it would
otherwise discard. The shared `Context` accounts for core admission, descriptor
parsing, inspection, tree copies and writes; cooperative controls do not
preempt a currently running operation.

Focused source: `crates/umf-core/src/protobuf_document.rs` and
`crates/umf-core/tests/r5_protobuf_document.rs`. With Cargo 1.90.0 and the
locked offline workspace dependencies, the dedicated integration suite passed
5/5 tests, including empty-ID refusal, missing root fields and malformed
modules; the existing descriptor codec unit suite passed 11/11 tests. Both
runs used `CARGO_TARGET_DIR=/private/tmp/umf-r5-protobuf-document-target`:

```sh
cargo test --locked --offline -p umf-core --test r5_protobuf_document
cargo test --locked --offline -p umf-core --lib protobuf_descriptor
```

The second command's test-name filter selects the descriptor codec unit tests;
it does not select tests from integration binaries. `git diff --check` passed
for this packet's source, test, module registration, and evidence files.

Source hashes at capture:

| File | SHA-256 |
|---|---|
| `crates/umf-core/src/protobuf_document.rs` | `8934a4d46bc943653e4e94bd0a11cd65f2f14dce49db41fbf41a9ead86460f07` |
| `crates/umf-core/tests/r5_protobuf_document.rs` | `fc74fe15952ba6ed7f29e24b656434296052cdaa206f92f0d9596d1634779052` |
| `crates/umf-core/src/lib.rs` | `cae592c407aa82955266e94db28b2397557617097d54315d7dda44b20e9f3cf5` |

The established descriptor codec and inspector claims remain scoped to their
separate evidence packets. This document-operation slice adds no compiler
acceptance, binding parity, browser support, or general Protobuf conformance
claim. Next work remains source import preparation around an explicit trusted
compiler capability, then separate source editing and emission slices.
