---
ddx:
  id: umf.evidence.rust-migration.r5-gregorian-date-wire
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
    - id: CONTRACT-066
      kind: informed_by
---

# Gregorian date tagged-wire candidate

This opt-in candidate extends the existing `umf-core` Gregorian profile kernel with a private `umf.core-wire/1` tagged operation for `parseGregorianDate` and `truncateGregorianDate`. The fixed profile remains data (`umf-gregorian-date/1.0.0`); no bare UMF `date` is assigned calendar semantics. The new wire module is not connected to Node, Bun, Python, WASM, package roots, or a default route.

[`cases.json`](cases.json) freezes 50 outcomes from the current TypeScript predecessor on Bun 1.4.3. It includes valid boundary/leap dates, negative/zero/five-digit years, invalid calendar days and months, non-ASCII digits, ISO week/timestamp/timezone forms, raw JSON host values, all truncation units and quarter boundaries, invalid unit values, and date-before-unit refusal ordering. `replay-frozen.ts` verifies the predecessor source SHA-256 before replaying all captured values. Result: 50/50 matched. The capture source is `src/adapters/gregorian-date.ts`, SHA-256 `af5b02baa1bdef53ee4291cccc78586d0f2162a217a4241fd9d9a8a93dba069c`.

The tagged Rust tests compare valid parse results directly against the frozen values, check all invalid parse/truncation TypeError/RangeError classes, replay every frozen truncate success/refusal, and distinguish date-type-before-unit error order, and prove host work-control refusal reaches the result before a successful operation result. The wire envelope maps Rust errors to `TYPE_ERROR` or `RANGE_ERROR`; current Rust core stores only these two classes, so the original branch-specific TypeScript RangeError messages are not preserved by this wire slice. A tagged JSON boundary cannot represent accessors, proxies, `Date` instances, boxed strings, or other raw-host distinctions. The TypeScript predecessor packet includes plain JSON wrong-type inputs only; this candidate does not claim raw JavaScript host parity.

The existing kernel has broader core tests for UTF-16 length precedence and calendar validation. The 50-case packet does not synthesize lone-surrogate strings because JSON cannot carry isolated UTF-16 units losslessly through all runtimes; those cases remain covered by core UTF-16 unit tests rather than claimed as cross-runtime oracle vectors.

Reproduction:

```sh
bun docs/helix/04-build/evidence/rust-migration/r5-gregorian-date-wire/replay-frozen.ts
RUSTC=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin/rustc \
  CARGO_TARGET_DIR=/private/tmp/umf-gregorian-target \
  /Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin/cargo \
  test -p umf-core-wire --test gregorian_date_wire --offline
```

This is a tagged opt-in codec candidate only. No installed binding, default API cutover, source retirement, timezone behavior, or broader temporal profile is qualified.

## Source and evidence SHA-256

| File | SHA-256 |
| --- | --- |
| `crates/umf-core/src/gregorian_date.rs` | `1e4db307a5bd2745746fe8cefdca26064d7df50c28fbf60a7cea82303b10d9c2` |
| `crates/umf-core-wire/src/gregorian_date_binding.rs` | `739c3cd4c512e7ba7548b279ea22711c4c00820b171b89ec91df5fa144034f47` |
| `crates/umf-core-wire/tests/gregorian_date_wire.rs` | `bfab6e7e1aa111f5e7db0e1bf465a7a02bccda2ecaaa375ba4c98465fc1b8dd3` |
| `cases.json` | `b541979548245ebe2378608036a6ad5bd5ce0ae95660a9524cc9d014644ff115` |
| `replay.ts` | `d96fb058a21e73b2bd3ffdcfd848bd7c8c0c9ee4ee930e8ce19e2ebf7eeb4047` |
| `replay-frozen.ts` | `a80eb5b6dcca6546d6bd654fd212ad74b951a7e69b6b51c48ee882c30a66bdd4` |
