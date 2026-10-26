---
ddx:
  id: umf.evidence.rust-migration.r8-protobuf-descriptor-write-cli
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
    - id: CONTRACT-003
      kind: informed_by
    - id: R5-PROTOBUF-DOCUMENT-OPERATIONS
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-protobuf-descriptor-read-cli
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-symbol-inventory
      kind: informed_by
---

# R8 Protobuf descriptor write CLI

This packet records one additive, opt-in pure Rust CLI operation for writing a
binary Protobuf `FileDescriptorSet` from a tagged descriptor tree. It exposes
only `protobuf.descriptor.write`. It does not qualify descriptor document
operations, source compilation or editing, the Node/Bun/browser package routes,
or general Protobuf conformance.

## Command and bounds

```text
umf protobuf descriptor write --stdin-wire [--max-work N] [--timeout-ms N]
```

The command reads one UTF-8 `umf.core-wire/1` request from stdin. The request's
`op` must equal `protobuf.descriptor.write`; the core operation requires a
`descriptorSet` member. On success, stdout contains only raw
`FileDescriptorSet` bytes. Semantic and operation errors are returned as a
JSON `umf.core-wire/1` error envelope on stdout. CLI argument, stdin-read, and
input UTF-8 failures use the CLI's exit-2 convention. As in the existing read
command, semantic refusals do not set a nonzero process exit status.

The request is capped at 32 MiB before decode. The preflight decodes the
tagged request using the core's raised tagged-transport allowance, then checks
the exact operation before calling the Protobuf document owner, which decodes
the request again. The owner and CLI bound encoded descriptor output to
4,000,000 bytes. `--max-work` and `--timeout-ms` apply cooperatively inside the
owner execution; they do not meter the initial stdin read or the preflight
decode. The route therefore does not claim end-to-end resource parity for
those controls.

`--version` and `--capabilities` identify profile
`umf.protobuf-descriptor-write-cli/0.1.0` and the single operation
`protobuf.descriptor.write`. The integration tests run the built executable
with `PATH` empty, so this route does not dispatch through Bun, Node, Python,
or another external runtime.

## Frozen predecessor evidence

The independent predecessor is the R5 TypeScript descriptor-codec capture in
[`predecessor.json`](../r5-protobuf-descriptor-codec/predecessor.json),
captured with Bun 1.4.3 and `@bufbuild/protobuf` 2.15.0. Its
`authored.pb-roundtrip-bytes` vector records 83,233 output bytes. The Rust CLI
test matches that vector's SHA-256 exactly:
`78ce5e414d52e36f6dab8cf01e9dd58ff6ed230d2a2abc486b7275096d05d5a8`.
The source fixture `fixtures/protobuf/authored.pb` is also the captured
`authored.pb` input. The test additionally matches the predecessor's
`unknown-length-field-50000` bytes exactly (`82b51804000102ff`), preserving
the unknown payload through descriptor read and write.

This is a focused vector comparison, not a replay of all 93 predecessor
operations or an independent Protobuf compiler/browser matrix. The predecessor
packet records known contract-directed differences and limitations; those
remain in force.

## Verification

On Rust 1.90.0 (`aarch64-apple-darwin`), the complete CLI suite passed:

```text
CARGO_TARGET_DIR=/private/tmp/umf-cli-write-target cargo test --locked --offline -p umf-cli
```

All 51 unit and integration tests passed, including the five descriptor-write
cases: capability/version, predecessor and unknown-field bytes, cooperative
work refusal, malformed and wrong-operation request refusals, and output above
the 4 MB ceiling. `cargo fmt --check -p umf-cli` and `git diff --check` passed.
The complete run includes slower existing codegen CLI fixtures and is scoped
to the local Darwin arm64 source checkout.

## Source pins

| Artifact | SHA-256 |
|---|---|
| `crates/umf-cli/src/main.rs` | `17630b37b241d33114bd8d98fd3d5bf126894e6fb3d109bf9219461d501a5d6d` |
| `crates/umf-cli/tests/protobuf_descriptor_write_cli.rs` | `01af164f74fd6ef36005c70d60b5662c093d088877253d745cd8b655488405d5` |
| `fixtures/protobuf/authored.pb` | `6d64e6f8cc8eb240d181b2715b455e62a933a19bd18112620a892ea3ae285bf6` |
| R5 TypeScript predecessor packet | `0fd7b1250644a07946f78c48bce88c4c77e5b3e314a691ca2dfba877a84362d4` |
| `docs/helix/02-design/contracts/CONTRACT-003-protobuf.md` | `fb0d01b950d30a44421e5d17aa8ab447b1738aee6dd687d81a9b1759712c9e4b` |

The hashes identify the inspected source and evidence bytes. They do not imply
an installed-package release or default-route selection.

## Remaining limits

The operation handles descriptor-tree encoding only. Descriptor read, import,
get, export, bundle and inspect remain their separately qualified or
unqualified operations; Protobuf source compilation remains an explicit
trusted host compiler capability. No default package route changed. The
TypeScript engine, Python binding, Node/Bun binding and real browser route do
not select this CLI operation, and Edition 2024 source operations remain
unfinished.
