---
ddx:
  id: umf.evidence.rust-migration.r8-security-protection-query-properties-binding
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
    - id: CONTRACT-062
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-security-protection-query-properties
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-security-protection-parameters
      kind: informed_by
---

# R8 opt-in Rust security query-property candidate

This receipt covers the bounded core candidate in
`crates/umf-core/src/security_queries.rs` and tagged wire in
`crates/umf-core-wire/src/security_queries_binding.rs`. The profile is
`umf.security-queries/1`; the only operation is
`inspectProtectionQueryProperties`. The request is closed over `profile`,
`op`, `policy`, `catalog`, `closure`, and `use`. The source/domain/typed-parameter
stages compose the existing security candidate helpers.

The candidate exactly replays **19 of 22 operations** from the captured
[TypeScript predecessor packet](../r8-security-protection-query-properties/predecessor.json).
Replay compares every returned field, diagnostic order, and retained snapshot.
The candidate admits at most one authored range declaration, retaining its
source property as effective without comparing it to another range identity.
It refuses all required range properties and refuses a second authored range,
because equivalent exact Field/core literals can have distinct carrier text
and require qualified identity/deduplication. Three operations are excluded:
the canonical-numeric range identity case, the distinct-field range case, and
the unknown-range-Field refusal case; all require a range as a query property.
The Rust packet test asserts 19 exact replays and those three exclusions. A
separate focused wire test supplies two authored ranges with carrier texts
`10` and `1e1`, and confirms `refused`, both declarations retained in the full
`authoredProperties` snapshot, and `complete:false`, `authority:false`, with
`PROTECTION_QUERY_UNIMPLEMENTED`.

The supported comparison path covers the six atomic names (`equality`,
`order`, `length`, `format`, `nullity`, and `cardinality`), equality
implication, missing requirements, mode outcomes, and random-token
join/group refusal. One authored range may pass through as a retained effective
property, but range entailment or equivalence is not implemented. Required
range properties, multiple authored ranges, and prefix/suffix property objects
return `refused` with `PROTECTION_QUERY_UNIMPLEMENTED`. All results retain
`complete:false` and `authority:false`.

The two raw-host observations in the predecessor's separate
`host-observations.json` are not replayed here. Tagged JSON cannot carry
accessors or Proxy traps. The closed request/profile test refuses unknown
members. A host-control callback that immediately returns `CANCELLED` yields a
wire error with that code. Each compared property charges core work through
`Context`; source and JSON admission use the existing core limits. This does
not claim a total heap/CPU bound, cross-host callback parity, query lineage,
compiler admission, authorization, native enforcement, or default-route
selection.

The current fixture uses the core `0.10.0` security candidate profile. This
receipt does not resolve Core Evolution 0.8/0.10 drift. It adds no Node or WASM
binding.

Validation on Rust 1.90.0, locked/offline:

```sh
rustfmt --edition 2021 --check crates/umf-core/src/security_queries.rs crates/umf-core-wire/src/security_queries_binding.rs
cargo check --locked --offline -p umf-core-wire
cargo test --locked --offline -p umf-core-wire security_queries_binding --lib
bun scripts/rust-migration/r8/security-protection-query-properties-predecessor.ts --check
```

The three Rust test cases pass, including 19 exact packet replays, three
recorded exclusions, the multiple-authored-range refusal/snapshot assertion, closed-shape refusal and
host-control cancellation. The
workspace-wide `cargo fmt --check` reports existing formatting differences in
unrelated Rust files, so formatting was checked directly on the two new Rust
files.

The query-specific work meter charges once per accepted atomic property. The
composed parameter helper retains its existing literal-work accounting;
this receipt does not establish the TypeScript helper's shared 100,000-unit
ledger across both phases. Ordinary core JSON value/depth/text limits and the
host-control callback remain in force. Behavior at shared-ledger exhaustion is
outside the replayed subset.

Source pins at this receipt:

| File | SHA-256 |
| --- | --- |
| `crates/umf-core/src/security_queries.rs` | `d13b4f4221daa01ec4c503491e45e11a9ca6a7bffb33d1d3e8a69ec47a058e17` |
| `crates/umf-core/src/full_modules.rs` | `85f14b19862c4b0fa9e60d0c6b481cad8a8a5c6f862638c4b1790a0f9a9561d6` |
| `crates/umf-core-wire/src/security_queries_binding.rs` | `2dc53dabd1e4bdeff84373728b819a982368aeadb1e43d821760d598904ea172` |
| `crates/umf-core-wire/src/lib.rs` | `fb1d0a56acb5c38fa79d0a90b3183a07e47502c454e10b1aa0c010fc194803ab` |
