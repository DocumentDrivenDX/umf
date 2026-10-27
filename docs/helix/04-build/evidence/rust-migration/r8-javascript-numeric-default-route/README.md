---
ddx:
  id: umf.evidence.rust-migration.r8-javascript-numeric-default-route
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-049
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-javascript-numeric
      kind: informed_by
---

# R8 JavaScript numeric default-route behavior replay

This packet records an installed SDK behavior replay for the five CONTRACT-049
operations: `exactDecimal`, `integerFromBigInt`, `integerToBigInt`,
`admitJavascriptNumber`, and `numericToNumberLossless`. The replay harness is
`scripts/test-sdk-rust-default.ts`, SHA-256
`5397580457d6772c09ec73e8e4260cac3a395cdd5fb0c85287e5f96270a005d4`.

## Fixed-point source cohort

The fixed-point installed replay is
[`installed-replay-fixedpoint-20261026.json`](installed-replay-fixedpoint-20261026.json),
SHA-256 `9bdb96677c900fa1d65e157b3b2eebf7d255c9367bfffce281bdec96ca8ef37b`.
It was built from commit `ca9cda9642702cd22b5150aec5f146e41e602f9e` with
Rust 1.90.0 and wasm-bindgen 0.2.100. The archive SHA-256 is
`2bcfaa75f6a084d321364aef2ad9fed03e83ebbebddc47c2efcad60b6935898b`; the
archive manifest SHA-256 is
`2d38b9d2b3181fbe89a3db8f06c32d5282f87e4971c1e2890409e86f370a6960`. Its
3,461-input source closure and captured live tree both hash to
`1574ba33fb2e50e282ba6be18cbe215a88f8d2b54b103912cf278041eb15f084`;
generated transform status is `fixed-point` with zero transformed inputs. The
recorded SDK manifest still labels the artifact
`private-r7-default-route-qualification-not-publishable`.

The fixed-point replay passed 27 Python Decimal/Fraction/IEEE-754 oracle vectors
and Rust/reference differential checks through installed Node 26.12.1, Bun
1.4.3, and Chromium 153.0.8010.12. It passed host refusal comparisons for
Infinity, NaN, negative zero, symbol carrier keys, extra carrier members and
accessor carriers without invoking the getter; proxy reflection traces matched
the TypeScript reference; valid Field-context behavior matched. Package
condition tampering, missing/corrupt Node native assets, and missing/corrupt
browser WASM assets were refused. These are bounded controls, not exhaustive
proxy or host-object coverage.

The receipt records root import times of 3,619.45 ms (Node), 5,521.67 ms
(Bun), and 2,868.40 ms (Chromium), and first numeric-call times of 530.96 ms,
527.26 ms, and 491.30 ms respectively. These timings are specific to this
whole package cohort. The full replay took 1,087,905 ms; that end-to-end
duration includes all package operations and checks and must not be attributed
to numeric initialization or the numeric first call. R5 independently measured
400,381,003 metered setup work units and 200 for an operation; those are work
measurements, not a proof of a time, memory, or input-size ceiling for every
installed facade path. Focused package-root resource qualification remains
open.

## Earlier derived cohort

[`installed-replay-20261026.json`](installed-replay-20261026.json), SHA-256
`4d95b9b498db4cccbdce5e43556d1e1304a623b51d0be0aa66620beba271fb39`, records
the earlier behavior replay. That archive had 11 generated source transforms
and is retained as historical, non-fixed-point evidence only.

Neither replay makes a TypeScript-retirement, publishability, or release-
eligibility claim. The five operations remain source-selected pending review
and focused bounded-resource qualification; their default-route retirement
status remains unproven.
