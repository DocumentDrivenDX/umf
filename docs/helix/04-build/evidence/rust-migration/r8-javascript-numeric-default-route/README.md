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

This packet records one installed SDK behavior replay for the five CONTRACT-049
operations: `exactDecimal`, `integerFromBigInt`, `integerToBigInt`,
`admitJavascriptNumber`, and `numericToNumberLossless`. The test script is
`scripts/test-sdk-rust-default.ts` with SHA-256
`5397580457d6772c09ec73e8e4260cac3a395cdd5fb0c85287e5f96270a005d4`.
The immutable receipt is [`installed-replay-20261026.json`](installed-replay-20261026.json)
(SHA-256 `4d95b9b498db4cccbdce5e43556d1e1304a623b51d0be0aa66620beba271fb39`).

The receipt passed 27 Python Decimal/Fraction/IEEE-754 oracle vectors and
Rust/reference differential checks through installed Node 26.12.1, Bun 1.4.3,
and Chromium 153.0.8010.12. It also passed host refusal comparisons for
Infinity, NaN, negative zero, symbol carrier keys, extra carrier members and
accessor carriers without invoking the getter; a proxy reflection trace was
compared with the TypeScript reference; valid Field-context behavior matched.
Package condition tampering, missing/corrupt Node native assets and
missing/corrupt browser WASM assets were refused. The tests are bounded vectors
and do not prove exhaustive proxy behavior or an independent resource ceiling
for every installed facade input.

The receipt records root import times of 3,403.94 ms (Node), 3,847.61 ms
(Bun), and 2,821.60 ms (Chromium), and first numeric call times of 493.01 ms,
575.81 ms, and 475 ms respectively. These are environment-specific
measurements from this whole package cohort. The full replay took 1,050,752 ms;
that end-to-end duration includes all package operations and checks and must
not be attributed to numeric initialization or the numeric first call.

The archive SHA-256 is
`bbca7ac6ff1675136ee502686da3eb148437f968e0eebe4683664c862dbc36cb`; its
source snapshot SHA-256 is
`784ac090d9556f6da3bfc128f1775bb1ff2d84a1ff1984cb7153fd577b133be6`.
The receipt explicitly reports
`derived-private-snapshot-not-release-fixed-point` and 11 generated source
transforms; captured live source SHA-256 is
`76e20fa473a3cd5f512aa24e9aae7e7cea508462931cd1fea8a315f8311ffb6d`.
Therefore this is behavior-only evidence for that private derived archive. It
does not qualify the current checkout or a fixed-point SDK, and makes no
retirement, publishability, or release-eligibility claim. The five operations
remain source-selected-only/unproven pending a fixed-point current-source
rebuild and replay plus focused bounded-resource qualification.
