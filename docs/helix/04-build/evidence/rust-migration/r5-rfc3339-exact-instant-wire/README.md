---
ddx:
  id: EVIDENCE-RFC3339-WIRE-R5
  type: execution_evidence
  activity: build
  status: draft
  links:
    - id: CONTRACT-065
      kind: validates
    - id: CONTRACT-001
      kind: informed_by
---

# Opt-in RFC3339 exact-instant tagged wire

This evidence adds opt-in `umf.core-wire/1` operations for `parseRfc3339ExactInstant`
and `sameRfc3339ExactInstant`, backed by the existing Rust core kernel. The frozen
Bun predecessor packet captures 16 parse/equality cases, including fractional
normalization, offset equivalence, negative epoch, `-00:00`, malformed calendar
and offset combinations, UTF-16 input type refusal, and left-first equality errors.
Four additional host-only cases record null, array, boxed-string and proxy refusal
behavior; they are deliberately excluded from Rust tagged replay because tagged
JSON cannot represent those host values. The Rust integration test replays every
representable packet case through the tagged boundary. Compact boundary receipts
record exact 1,048,576 UTF-16-unit acceptance and 1,048,577-unit refusal without
embedding megabyte tokens.

The demonstrated subset is tagged JSON consisting of strings and the JSON scalar
types used by the packet. Wire failures preserve the TypeError/RangeError class
and left-before-right parse precedence, including exact branch-specific
TypeError/RangeError messages for tagged values. Raw-host observations are frozen
only for those four cases; broad proxy,
accessor and control-flow equivalence is not claimed. No Node, WASM,
Python, package root or default route is changed; this is not an installed-host
or consumer qualification.

`bun scripts/rust-migration/r5/rfc3339-wire-capture.ts --check` regenerates in
memory and compares the receipt byte-for-byte without writing. Running the same
command without `--check` explicitly refreshes the packet. The current TypeScript
predecessor SHA-256 is recorded inside
[predecessor.json](predecessor.json). Focused verification:

```sh
bun test tests/adapters/rfc3339-exact-instant.test.ts
RUSTC=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin/rustc \
 CARGO_TARGET_DIR=/private/tmp/umf-rfc3339-target \
 /Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin/cargo test \
 -p umf-core-wire --no-default-features --test rfc3339_exact_instant_wire
```
