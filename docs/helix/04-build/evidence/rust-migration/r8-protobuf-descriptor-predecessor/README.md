---
ddx:
  id: umf.evidence.rust-migration.r8-protobuf-descriptor-predecessor
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
    - id: CONTRACT-003
      kind: informed_by
    - id: ADR-006
      kind: informed_by
---

# R8 Protobuf descriptor/document TypeScript predecessor packet

This packet freezes the current TypeScript predecessor for the next Rust
descriptor/document tranche. Its declared scope is exactly seven pure
operations: `readDescriptorSet`, `writeDescriptorSet`,
`importProtobufDescriptorSet`, `exportProtobufDescriptorSet`,
`getProtobufDescriptorSet`, `inspectProtobuf`, and `exportProtobufBundle`.
It does not alter routing or qualify source compiler callbacks, edited-source
operations, Edition 2024, or broader Protobuf adapters.

`predecessor.json` is a direct Bun 1.4.3 capture from the checked-out
`src/adapters/protobuf` implementation, made 2026-10-28. It includes the exact
authored descriptor fixture bytes and digest, empty and unknown-wire bytes,
structured success/error observations for each operation, inspection
diagnostics, and mutation/copy observations. Malformed descriptor bytes,
malformed documents, invalid unknown-wire representation, unknown descriptor
representation, and the 4,000,001-byte ceiling case are explicit vectors.
Unknown field 50000 retains its original wire payload `04000102ff` and exports
the exact eight original bytes.

`source-cohort.json` pins the repository HEAD, runtime, Buf runtime version,
and SHA-256 values for the TypeScript implementation and its validation/copy
dependencies. The bytes were captured before this evidence-only addition; no
product source was changed for this packet.

The raw-host cases freeze behavior at the existing TypeScript boundary for
`Uint8Array`, Node `Buffer`, offset views, empty/non-empty `DataView`,
`Uint16Array`, `Int16Array`, `Float32Array`, array-like input, and null. They
show that empty `DataView` succeeds accidentally, while non-empty `DataView`
and non-byte typed arrays flow into Buf's index-based reader and fail as
`UmfError(PROTOBUF_BINARY, ...)`. This is an observed host behavior, not a
recommended Rust input profile. The packet also records that
`importProtobufDescriptorSet` evaluates `options.id` before reading binary, so
a throwing `id` getter wins over an oversized input. Preserve this ordering or
record a reviewed compatibility change.

The capture is reproducible with:

```sh
bun run scripts/rust-migration/r8/capture-protobuf-descriptor-predecessor.ts /private/tmp/protobuf-descriptor-predecessor.json
```

Focused packet assertions run with:

```sh
bun test tests/rust-migration/r8-protobuf-descriptor-predecessor.test.mjs
```

That run passed 4 tests and 34 assertions on Bun 1.4.3. The script can emit to
`/private/tmp` so routine reproduction does not rewrite the frozen evidence.
The test checks the packet digest and key output observations against the
current TypeScript predecessor. It intentionally does not test Rust behavior;
the existing R8 descriptor/document binding packet remains the candidate-side
evidence.

Parity risks for the next comparison are concrete. The current Rust binding
packet records malformed semantic bytes as `UmfCoreError(PROTOBUF_BINARY)`
where the predecessor throws public `UmfError`; malformed diagnostic messages
also differ. Its raw-byte admission intentionally restricts non-empty inputs
to `Uint8Array` views, whereas the TypeScript predecessor has the accidental
host-type behavior above. Its object-descriptor admission also checks hostile
option properties before binary work, while the TypeScript `id` getter runs
first. These differences must remain visible in differential results and
must not be erased by regenerating this predecessor packet.

Frozen artifact hashes (SHA-256):

| Artifact | SHA-256 |
|---|---|
| `predecessor.json` | `226eb9fb46781b45e82789e5efaf80a2d22c298c5fa0893a81d7a91cd5852f41` |
| `source-cohort.json` | `dbf92e9724f786a82869935328bdea3cb80c832cf915ad4e6a77fae2ee65d56f` |
| `scripts/rust-migration/r8/capture-protobuf-descriptor-predecessor.ts` | `8c6ff389e77f5939be31cb78196a17b49189af01b0d416ff73ec35bf4e131d47` |
| `tests/rust-migration/r8-protobuf-descriptor-predecessor.test.mjs` | `273515bac8666c43286c83eb0b222566e5ebf617f140654aa843aa08b8f03728` |
| `fixtures/protobuf/authored.pb` | `6d64e6f8cc8eb240d181b2715b455e62a933a19bd18112620a892ea3ae285bf6` |
