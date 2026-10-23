---
artifact_id: R5-PROTOBUF-INSPECT-CLI
artifact_type: evidence
status: captured
---

# R5 Protobuf descriptor inspector wire and CLI

This packet records an opt-in Rust core-wire and CLI entry for
`umf_core::protobuf_inspect::inspect_protobuf_document`. It does not change the
core inspector, descriptor codec, Python binding, migration plan, or the
historical predecessor packet. The source-level core behavior and limits remain
those recorded in the [descriptor codec evidence](../r5-protobuf-descriptor-codec/README.md)
and CONTRACT-003.

## Interface

The profile is `umf-r5-protobuf-inspect/0.1.0`, with the single operation
`protobuf.descriptor.inspect`. The tagged request contains `op` and `document`.
The result is the inspector's ordinary `{valid,complete,diagnostics}` value in
`umf.core-wire/1`'s normal success envelope; malformed requests and cooperative
control failures use the same protocol's error envelope. Validation findings,
including malformed descriptor representation, are returned as normal
validation results.

`umf protobuf inspect --version` and `--capabilities` expose the opt-in identity.
`--stdin-wire` reads one tagged request from standard input. Optional
`--max-work N` and `--timeout-ms N` configure the same cooperative host hook
used during tagged decode, inspection and tagged result encoding. There is no
external resource set or Python, Node, Bun, or browser runtime dependency in
this command path.

## Bounds and control semantics

The CLI caps stdin at 32 MiB before UTF-8 conversion. Core tagged transport and
ordinary document limits apply in addition. Work is admitted cooperatively at
the core's charged operations; the elapsed-time limit is checked at those same
control points and does not preempt a running operation. Omitting both controls
uses the command's ordinary cooperative budget. This is a local Rust CLI
surface, not a process-isolation or hard real-time guarantee.

## Focused verification

Run from the repository root with the recorded local Rust toolchain path:

```sh
PATH=/opt/homebrew/opt/rustup/bin:/opt/homebrew/bin:/usr/bin:/bin \
CARGO_TARGET_DIR=/private/tmp/umf-r5-protobuf-inspect-cli-target \
cargo test --locked --offline --no-default-features \
  -p umf-core-wire --test protobuf_inspect_wire \
  -p umf-cli --test protobuf_inspect_cli
```

The focused run passes ten tests with both workspace defaults and
`--no-default-features`. Wire coverage checks the source-order
unknown-wire/compiler-required result, malformed descriptor validation,
missing document and unknown operation errors, plus caller-hook failures staged
after admission during inspection and result encoding. CLI coverage checks its
version/capabilities, work/deadline refusal, an over-limit stdin request, and
inspection from a child process with `PATH` empty.
This qualifies those bounded entry paths only. It does not expand descriptor
semantics, native compiler acceptance, Python or browser binding support, or
general Protobuf conformance.

## Source hashes

The hashes below identify the Rust entrypoints and focused tests for this
capture:

| File | SHA-256 |
|---|---|
| `crates/umf-core-wire/src/lib.rs` | `bad0521114feef405e85dc4ee094eb9f4e8dcad6f5282076c9a74c6585dcd2cd` |
| `crates/umf-core-wire/tests/protobuf_inspect_wire.rs` | `e3005e293fb6c5799e8506e50de266a82ef7a7013b411f1191ed5a919640fcad` |
| `crates/umf-cli/src/main.rs` | `9603e617ea7cf5c858f1ba40e425a48982ba369d7d494ea828f45cc6effdc8ac` |
| `crates/umf-cli/tests/protobuf_inspect_cli.rs` | `6a53d1a89c6b596c5a358b05f72883b8204ec3ae3ffacf335e0f870f1fa98fec` |
