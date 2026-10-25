---
ddx:
  id: umf.evidence.rust-migration.r5-binding-inspect
  type: execution-evidence
  activity: build
  status: captured
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: evidence_for
    - id: CONTRACT-042
      kind: verifies
    - id: ADR-006
      kind: references
---

# R5 `inspectBinding` predecessor Gate0

This packet freezes `inspectBinding(binding, logical)` from
`src/extensions/binding/index.ts` as a bounded next Rust slice. It captures the
TypeScript predecessor's complete `Validation` values, including diagnostic
order, code, severity, message and path. It does not claim a Rust port, native
storage qualification, or semantic validation for every installed logical
extension.

## Exact behavior captured

On Bun 1.4.3, the frozen set includes the existing Delta, Iceberg, Parquet,
PostgreSQL and SQL Server 0.1 binding fixtures; a stable-ID 0.2 binding; and a
0.3 bit128 binding. Every valid fixture returns `{valid:true, complete:true,
diagnostics:[]}`. Each call operates on copied binding and logical documents;
the test asserts both caller inputs remain unchanged.

The negative/crossed cases freeze these full outcomes:

- Unknown binding content alone remains valid but incomplete, with a warning at
  `/extensions/umf.binding/future`.
- An unknown index member crossed with an invalid `unique` declaration retains
  both diagnostics in order: `BINDING_UNKNOWN`, then `BINDING_INDEX`.
- A missing exact element reference returns `BINDING_REFERENCE` at the element
  array position.
- A mismatched paired logical ID and an invalid logical core document each
  return `BINDING_MODEL` at `/extensions/umf.binding/logical`.
- An unsupported binding package version is refused by document admission
  (`UNKNOWN_EXTENSION`, then `BINDING_PROFILE`) before the later pair check.
- The 0.3 dispatch path reports the exact paired-model refusal with an empty
  path, as produced by `inspectBit128Binding`.

`frozen-inspections.json` contains every complete validation object. The
capture program is `tests/rust-migration/r5-binding-inspect-capture.ts`. The
Gate0 test compares each runtime result to the frozen value and verifies
input immutability. It does not regenerate the frozen file during tests.

## Admission and activation boundary

For 0.1/0.2, `inspectBinding` first copies both inputs, then validates the
binding document with a registry containing the two published binding package
schemas and `bindingSemantics`. A structurally invalid binding returns early.
For a structurally valid binding, unknown diagnostics remain warnings; the
function then core-validates the supplied logical document, checks exact
logical document ID/core-version pairing, and checks exact element, core Field
or DDD owner/field, and profile-specific relationship references. The 0.3
vocabulary dispatches to `inspectBit128Binding`, whose additional carrier and
layout checks are separately evidenced by the binding UUID tests.

The public package root re-exports the extension API. Current direct consumers
include typed-access admission, raw table profile inspection, Delta, Iceberg,
Parquet, PostgreSQL and SQL Server binding projections, and the DDD PostgreSQL
table/relationship paths. These call sites are individually pinned in
`source-hashes.json`. Their acceptance behavior differs: some require
`complete`, some reject `BINDING_UNKNOWN`, and others require only `valid`.
This packet freezes the inspector itself and does not claim all callers have
identical unknown-content policy.

The source manifest pins the full 51-file relative import closure from
`src/extensions/binding/index.ts`, including imported JSON resources, plus the
listed activation callers, package/runtime lock, contract, representative
fixtures, capture code and frozen reports. The test walks that relative import
closure and fails if any discovered file is not pinned. It asserts exact Bun
1.4.3 and the package's declared `bun@1.4.2` manager. The test harness and this
README are intentionally excluded from the source manifest to avoid
self-hashing.

Run the focused Gate0 check with:

```sh
bun test tests/rust-migration/r5-binding-inspect-gate0.test.ts
```

Captured result on Bun 1.4.3: **4 tests passed, 168 assertions**.

## Proposed next Rust slice

Port only the generic 0.1/0.2 `Validation` projection first: caller-owned
binding and logical inputs, exact admission order, exact full diagnostics, and
no mutation. Keep compiled package/schema resources reusable and immutable, but
keep operation state per call. Treat 0.3 bit128 inspection as a separate
profile requiring its own Rust differential evidence, or reject it explicitly
until that profile is implemented. Do not activate this inspector by default
in Delta, Iceberg, typed-access, or native binding paths as part of that slice;
those consumers have different completeness and unknown-content policies.

This recommendation is a proposed bounded implementation scope, not evidence
that Rust currently matches the inspector. The source and fixture snapshot is
identified by SHA-256 in `source-hashes.json`, captured 2026-10-24.
