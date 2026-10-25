---
ddx:
  id: umf.evidence.rust-migration.r8-host-json-core-prototype
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-049
      kind: informed_by
---

# R8 host JSON core prototype

`crates/umf-core/src/host_json.rs` defines an opt-in Rust reflection protocol
for guarded JSON copying. Host strings cross the seam as invocation-local
`HostStringRef { token, units }` metadata. Rust requests UTF-16 chunks of at
most 8,192 units and validates the exact offset and expected unit count before
appending each chunk. Root strings, descriptor keys, and descriptor string
values use the same protocol. Descriptor snapshots return metadata first;
value bodies remain deferred until the corresponding child visit. Array length
checks retain the original key token. Chunk reads do not charge the public work
meter.

Rust grows output buffers incrementally and reports allocator failure as
`HOST_JSON_TRANSPORT_ALLOC`; it has no arbitrary text-size admission cap. The
host adapter must enforce the requested chunk frame bound and keep string
tokens immutable for the invocation. Descriptor-table storage and actual
binding allocation behavior still require adapter-level validation.

Focused validation used:

```sh
CARGO_TARGET_DIR=/private/tmp/umf-host-json-target \
RUSTC=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin/rustc \
/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin/cargo \
test --offline -p umf-core --lib host_json
```

Result: 12 focused tests passed. Coverage includes root and 4,000,001-unit
visible key/value chunking, per-value (not per-chunk) work metering, deferred
hidden value bodies, malformed offset/count rejection, and the earlier
structural, array, cycle, numeric, and error-path cases. Source SHA-256:
`8e6b59c2cd8bbb4330e99736330f65efe3acf3493ff9a1581e67351675f44600`.

Independent Sol review reproduced all twelve fake-host tests at that exact
source hash in an isolated offline Cargo target. A separate temporary harness
covered UTF-16 frame splits, lone surrogates, empty text, oversized replies,
wrong offsets/reply kinds and immediate host error propagation. It found no
P1/P2 in this bounded Rust protocol. The reviewer made no repository changes.

This is Rust fake-host evidence only. No Node, Bun, WASM, or browser binding
consumes the protocol yet, so this is not cross-binding parity evidence and
does not authorize default routing. The existing Bun Gate0 packet remains
provisional; its complete source/resource closure is pending.
The adapter must itself prevent oversized reply allocation, keep string tokens
immutable, and honor infallible snapshot cleanup; the Rust trait cannot prove
those host obligations.
