---
ddx:
  id: umf.evidence.rust-migration.r8-protobuf-document-export-cli
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: ADR-006
      kind: informed_by
    - id: TP-001
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-003
      kind: informed_by
    - id: R5-PROTOBUF-DOCUMENT-OPERATIONS
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-protobuf-descriptor-write-cli
      kind: informed_by
---

# R8 Protobuf document export CLI

This packet records one additive, opt-in Rust CLI route for the existing
`protobuf.document.export` owner. It accepts a UMF document in a tagged
`umf.core-wire/1` request and writes raw binary `FileDescriptorSet` bytes to
stdout. It does not change the core document operation, the TypeScript,
Python, Node/Bun or browser routes, or any default package selection.

## Command and bounds

```text
umf protobuf descriptor export --stdin-wire [--max-work N] [--timeout-ms N]
```

The request operation must equal `protobuf.document.export` and contain a
`document`. The CLI reads no more than 32 MiB from stdin. It performs an
operation preflight decode, then calls the Rust core-wire document owner, which
repeats tagged admission and performs document validation, Protobuf inspection
and binary export under one cooperative `Context`. The preflight decode and
stdin read are outside that cooperative control. The owner and CLI bound binary
output to 4,000,000 bytes. Work and elapsed-time checks are cooperative and do
not preempt an in-progress operation.

Success stdout contains only raw descriptor bytes. Semantic refusals, including
wrong operation, malformed document and cooperative control failures, use the
`umf.core-wire/1` JSON error envelope on stdout. An invalid owner response is
closed with `OUTPUT_PROTOCOL`. Argument, stdin-read and UTF-8 failures retain
the CLI exit-2 convention. `--version` and `--capabilities`
identify `umf.protobuf-document-export-cli/0.1.0` and exactly one operation.
The integration test runs the built executable with an empty `PATH`.

## Frozen TypeScript predecessor

[`predecessor.ts`](predecessor.ts) calls the current TypeScript
`importProtobufDescriptorSet` and then `exportProtobufDescriptorSet` on
`fixtures/protobuf/authored.pb`, with document id `schema`. Its captured output
is recorded in [`predecessor.json`](predecessor.json), SHA-256
`78ce5e414d52e36f6dab8cf01e9dd58ff6ed230d2a2abc486b7275096d05d5a8`, at
83,233 bytes. The CLI test independently constructs the equivalent imported
document with the existing Rust owner and matches this frozen TypeScript
output hash. This is one exact round-trip vector, not a replay of all
descriptor/document cases or independent compiler/browser qualification.

## Verification

On Rust 1.90.0 (`aarch64-apple-darwin`), the focused integration suite passes
three tests: exact frozen TypeScript output hash from the Rust CLI with empty
`PATH`, capability identity and output limit, and wrong-operation plus
cooperative-work refusals. The complete offline `umf-cli` suite also passes all
54 tests across 13 active unit/integration targets. `cargo fmt --check -p
umf-cli` and `git diff --check` pass. No Node, Bun, Python, compiler or other
external runtime is dispatched by the CLI operation.

## Source pins

| Artifact | SHA-256 |
|---|---|
| `crates/umf-cli/src/main.rs` | `bfee55b03854863a19575651806a57bd87e1c81b020cbcc2d304543314745d45` |
| `crates/umf-cli/tests/protobuf_document_export_cli.rs` | `21218fa7cce6a0eb78f9f7b7bc39d35418f7b9f006c4a0a59b63e1038c53ca1c` |
| `docs/helix/04-build/evidence/rust-migration/r8-protobuf-document-export-cli/predecessor.ts` | `7f135e0b8916e39da0b03d7039e3045374551f0a6d23a3ec12f5bad34f096b26` |
| `docs/helix/04-build/evidence/rust-migration/r8-protobuf-document-export-cli/predecessor.json` | `7a64ee47259ba4d820ca640995fc8de014abeb87d1224a4ba4397d0b5b853e6e` |
| `fixtures/protobuf/authored.pb` | `6d64e6f8cc8eb240d181b2715b455e62a933a19bd18112620a892ea3ae285bf6` |
| `docs/helix/02-design/contracts/CONTRACT-003-protobuf.md` | `fb0d01b950d30a44421e5d17aa8ab447b1738aee6dd687d81a9b1759712c9e4b` |

This is local Darwin arm64 source-checkout evidence only. It does not establish
Node/Bun/Python/browser binding support, native compiler validation, source
operations, Edition 2024 behavior or general Protobuf conformance.
