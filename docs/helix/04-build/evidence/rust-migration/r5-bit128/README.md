---
ddx:
  id: umf.evidence.rust-migration.r5-bit128
  type: execution-evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: evidence_for
    - id: CONTRACT-076
      kind: evidence_for
    - id: SD-005
      kind: references
---

# R5 pure `umf-128/1` Rust codec

This bounded `umf-core` slice implements eleven `Value`-based, synchronous
operations in `crates/umf-core/src/bit128.rs`: strict bits128 and UUID parsing,
bytes in/out, explicit UUID/bits128 interpretation, unsigned comparison,
signed/unsigned 64-bit words, and signed/unsigned exact integer tokens. Values
are copied into JSON-safe UMF `Value` results. Input text is admitted using its
raw UTF-16 unit count before ASCII conversion; isolated surrogates remain
observable and reject as syntax. `Context` meters work, applies caller text
limits, and polls cancellation. No engine adapter or native carrier support is
claimed.

## Frozen predecessor

Before the Rust source was added, SHA-256 values for the TypeScript predecessor,
tests, independent oracle and generated fixture were stored in
[`predecessor.sha256`](../../../../../../scripts/rust-migration/r5/bit128/predecessor.sha256).
`fixtures/validation/uuid/bit128-oracle.json` contains 387 vectors created by
the independent Python integer/struct/uuid implementation with seed 1289562.
The Rust test consumes this fixture directly and checks every operation against
its exact values, including byte order, signed halves, 128-bit signed integer
conversion, and UUID text.

`frozen-predecessor-edge-vectors.json` separately records Bun 1.4.3 outputs and
exact refusals for the exponent overflow/length cases, double-sign word syntax,
snapshot shape/member-count precedence, and malformed exponent trailing text
identified during independent review. The Rust test reads these cases and
asserts both error codes and messages. The byte tests
also compare each returned byte position directly with the independent
Python-generated hex vector, rather than relying on a round trip alone.

## Verification and limits

`cargo test -p umf-core --test r5_bit128` passes four focused tests, covering
all 387 vectors, frozen TypeScript edge outcomes, strict snapshots and grammar,
exact diagnostic codes/messages, unsigned ordering, raw UTF-16, text-bound
refusal, meter refusal and cancellation. `cargo test -p umf-core --quiet` passes
the complete current crate suite (including 116 unit tests and all integration
targets). The
focused tests run on the current Darwin arm64 development host with Cargo
1.90.0. The Rust API represents byte input/output as a 16-item `Value::Array`
at this core boundary; frontend typed-array conversion has not been implemented
or qualified. This evidence does not establish Node, Bun, Python, WASM/browser,
Field validation, key tuple, or native-adapter behavior. The 4,000,000-unit
integer-token ceiling and 20-character word bound are preserved; all other
work remains cooperatively metered rather than hard-isolated.

At this review repair, `bit128.rs` has SHA-256
`1caf4e82d9eddcf6a0a5cbd6aab65e957536943a98ef0008a5caeba3a02d4377`, the
focused Rust test has SHA-256
`a18e030ae732631cac69a2e0e6ee6bfdd80b786692908815f39df12fea494b89`, the
Bun-frozen edge packet has SHA-256
`5e029e1d866a77bbf2e1ac5ed0ff809ac96dee06ca9890409fbf7a6fa84bffd7`, and the
independent Python oracle fixture remains at
`52cab3fc2217144a0d1f2780b2a3102b09a66d04f6689ed7e918b13e2c4c3a47`.

Independent Sol rereview matched the three repaired source/fixture hashes,
replayed all twelve frozen edge cases against Bun with exact outcomes, ran the
five Bun baseline tests (6,266 assertions), and found no remaining P1/P2 in the
pure codec. Its focused Rust tests passed four of four. The independent full
crate run had passed 117 unit tests and completed integration targets while its
last integration target was still running; the complete-crate pass above is the
implementer's separate run, not a claim that the reviewer finished that run.
