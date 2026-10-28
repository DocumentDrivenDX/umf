# Core Evolution verifier retained-output bound

This bounded source checkpoint closes one CONTRACT-083 resource gate for the
opt-in Core Evolution Rust candidate. It covers the core `0.10.0` source
profile and the existing compatibility spelling
`core-0.8-absent-string-additions/0.1`. It does not qualify a Node, Bun, or
Chromium artifact and does not select a default route.

## Requirement and observation

[CONTRACT-083](../../../../02-design/contracts/CONTRACT-083-core-evolution.md)
limits aggregate retained input/output to 100,000 JSON values and 4,000,000
UTF-8 JSON bytes. The existing Rust inspection test measures the policy, both
sources, and full receipt together at both exact edges, then confirms one more
value or byte refuses with `LIMIT`.

The new `verifier_aggregate_bound_includes_recomputed_retained_output` test
builds a 1.4 MB retained unknown source member. Inspection succeeds and returns
a receipt below 4 MB. Receipt plus independently supplied inputs also remains
below 4 MB, while verification's recomputed complete receipt raises the
aggregate above the ceiling. Verification refuses with `LIMIT`; the test would
fail if verification bounded only the supplied objects or returned a partial
result.

The Rust budget deliberately closes a stronger contract requirement than the
current TypeScript predecessor demonstrates. The existing Bun candidate test
records that the predecessor accepts the corresponding over-limit inspection
case. That mismatch remains visible; it is not evidence of TypeScript parity.

## Evidence

Using Rust 1.90.0 and the locked offline dependency set:

```sh
CARGO_TARGET_DIR=/private/tmp/umf-core-evolution-target \
CARGO_BUILD_JOBS=2 CARGO_INCREMENTAL=0 \
cargo test --locked --offline -p umf-core --test r5_core_evolution
```

Result: 12 passed, 0 failed. The focused suite includes frozen current-TypeScript
outcomes, exact aggregate inspection limits, unknown-content preservation,
forged-receipt refusal, work metering, and the new verifier aggregate test.

## Limits

This closes only source-level retained-output accounting for the Rust inspect
and verify operations. Combined first-fault ordering across TypeScript's value
and byte checks and Rust's work meter, cancellation, deadline, and depth
controls remains unqualified. Fresh installed Node/Bun/Chromium artifacts,
current package provenance, and package-root/default-route parity remain open.
