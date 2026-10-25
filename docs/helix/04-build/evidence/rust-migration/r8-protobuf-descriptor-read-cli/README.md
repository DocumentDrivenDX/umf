---
ddx:
  id: umf.evidence.rust-migration.r8-protobuf-descriptor-read-cli
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
    - id: umf.evidence.rust-migration.r8-symbol-inventory
      kind: informed_by
---

# R8 Protobuf descriptor read CLI

This packet records an additive opt-in Rust CLI command for reading a binary
Protobuf `FileDescriptorSet`. It exposes only `protobuf.descriptor.read`; it
does not imply source compilation, source editing, default Node/browser routing,
or general Protobuf conformance. It uses the existing descriptor reader and
the standard `umf.core-wire/1` envelope for semantic outcomes.

## Contract and bounds

`umf protobuf descriptor read --input PATH [--max-work N] [--timeout-ms N]`
reads a raw descriptor set. The CLI checks file metadata and reads at most
4,000,001 bytes before refusing inputs larger than the CONTRACT-003 4,000,000
byte ceiling. It does not allocate or decode an over-limit file. Input-path,
argument, and filesystem failures follow the CLI's existing exit-2 convention;
semantic errors and cooperative control refusals are core-wire envelopes. The
core-wire operation uses one `Context` for tagged request decode, descriptor
read, and result encoding. The bounded filesystem read occurs before that
operation context; it is limited by file metadata and a second capped read.
Deadline checks are cooperative at core control points.

The immutable version/capability response identifies only
`umf.protobuf-descriptor-read-cli/0.1.0` and
`protobuf.descriptor.read`. The command has no Node, Bun, Python, or browser
runtime dependency; integration tests run the built executable with `PATH`
empty.

## Frozen predecessor provenance and vectors

The predecessor capture is `/private/tmp/protobuf-composed-capture/predecessor.json`,
SHA-256 `59969e3a12ad8c4f9fbb1354db4a82bbbb647885f2576000e8248abc842fe2d5`.
It was captured from the TypeScript predecessor with Bun 1.4.3. Its native
compiler identity is `/opt/homebrew/bin/protoc`, `libprotoc 36.2`. The captured
source closure comprised 37 files. The capture contains 93 operations; the
three exact wire vectors below are the focused tree comparisons used by the
CLI integration test. Input and result wire hashes are in
[`predecessor-vectors.json`](predecessor-vectors.json). The checked-in
[`source-closure.json`](source-closure.json) preserves the current capture's
37 source hashes and verifies that its operation outcomes and other
non-source sections equal the older checked-in full predecessor packet;
the full current capture itself remains local to `/private/tmp`.

| Case | Expected predecessor outcome |
|---|---|
| Authored descriptor fixture | Success; core-wire result hash pinned in vectors file |
| Empty descriptor input | Success; empty descriptor set |
| Unknown field 50000 | Success; unknown wire payload retained |
| Zero tag byte | `UmfError`, `PROTOBUF_BINARY`, empty path, message `Error: illegal tag: field no 0 wire type 0` |
| Exactly 4,000,000 bytes | Success |
| 4,000,001 bytes | `UmfError`, `LIMIT`, empty path, message `Descriptor input exceeds limit` |

The Rust CLI preserves the semantic status and core-wire result trees for the
three success vectors. For malformed binary and over-limit inputs, the
core-wire protocol intentionally exposes its established Rust error envelope;
its error class is not represented as TypeScript's `UmfError` class. This
opt-in CLI does not claim host-language error-class parity.

## Verification

Focused binary integration coverage lives in
`crates/umf-cli/tests/protobuf_descriptor_read_cli.rs`. It checks version and
capabilities, three frozen result-wire hashes, malformed input, 4,000,000 and
4,000,001-byte boundaries, cooperative max-work/deadline controls, and path
error ordering. A sparse over-limit file exercises pre-read refusal. The test
spawns Cargo's built executable with `PATH` empty, demonstrating that this
command does not dispatch through a JavaScript runtime. The complete
`cargo test --locked --offline -p umf-cli` run passed 46 tests across the CLI
unit and integration targets. `cargo fmt --check -p umf-cli` and
`git diff --check` passed. The release binary was built with Rust 1.90.0 and
manually read an empty descriptor file with `PATH` empty, returning a success
core-wire envelope.

Final source/build hashes are recorded below. This capture remains a bounded
CLI qualification and does not upgrade any library or binding route.

## Source and artifact hashes

| Artifact | SHA-256 |
|---|---|
| Frozen predecessor JSON | `59969e3a12ad8c4f9fbb1354db4a82bbbb647885f2576000e8248abc842fe2d5` |
| CLI source `crates/umf-cli/src/main.rs` | `8e9115a2e8bd2a08e8ee8a2c419cc1800cc82545c980d646ce176faaea714499` |
| CLI integration test | `cb862bf617b9f34cef2684122a83d240698f2156abcbdb45a13b89d93ab454f0` |
| Built CLI binary `/private/tmp/umf-r8-protobuf-cli-target/release/umf` | `9a0e138e06265f815f5fd17dbb1310f23f9467a7924d30779e9f497662e824db` |
| Authored descriptor fixture | `6d64e6f8cc8eb240d181b2715b455e62a933a19bd18112620a892ea3ae285bf6` |
| `predecessor-vectors.json` | `1c9e82ab2d9357b73a77358f5ef0c5424b1631c0626001ebe64b1a1c4e002327` |
| Current source closure and historical packet comparison | `51e2135a6f7193e925439b5e7468a151e9c84a8e4f7d56c3050cb082b67dd96c` |
