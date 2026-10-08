---
ddx:
  id: STP-054
  type: story-test-plan
  activity: test
  status: draft
  authoring:
    home: repo
  links:
    - id: US-054
      kind: informed_by
    - id: TD-054
      kind: informed_by
    - id: TP-001
      kind: references
---

# STP-054: Shared JavaScript numeric verification

## Story Reference

**User Story:** [[US-054-javascript-numeric]].
**Technical Design:** [[TD-054-javascript-numeric]].
**Project Test Plan:** [TP-001](../test-plan.md).
Architecture is the direct design parent; no separate solution design exists.

## Scope and Objective

Prove FEAT-005 IDEAL-08 under CONTRACT-049 through the public API. P0 coverage
requires all nine criteria to be exercised, cited and supported by passing
scoped evidence. Float conversion, native database behavior, downstream ports
and full repository release qualification remain outside this gate.

## Acceptance Criteria Test Mapping

The four named Bun tests below are in `tests/core/javascript-numeric.test.ts`.
Browser assertions are in `scripts/javascript-numeric-browser.ts`. Citations
are canonical metadata, not proof by themselves; assertions must exercise each row.

| AC ID | Covering test or harness | Asserted behavior | Citation | Primary layer |
| --- | --- | --- | --- | --- |
| US-054-AC1 | `safe integer admission and bigint boundaries` | Safe integer extrema recover exactly; fractions and unsafe/nonfinite/signed-zero number input refuse. | `@covers US-054-AC1` | Contract |
| US-054-AC2 | `safe integer admission and bigint boundaries` | Signed 64-bit upper bound survives bigint/token recovery; negative/out-of-range values refuse in the selected Field domain. | `@covers US-054-AC2` | Contract |
| US-054-AC3 | `constructor retains spelling and refuses malformed and over-limit input`; `decimal admission uses exact binary value rather than shortest spelling` | Trailing zeros/exponent/signed-zero spellings are retained; alternate exact spelling converts by value. | `@covers US-054-AC3` | Contract |
| US-054-AC4 | `decimal admission uses exact binary value rather than shortest spelling` | Exact dyadic inputs admit; shortest spellings for 0.1, 0.3 and subnormal/extreme controls refuse. | `@covers US-054-AC4` | Contract |
| US-054-AC5 | `decimal admission uses exact binary value rather than shortest spelling`; integer boundary test | Exact binary64 expansion and minimum-subnormal value recover; decimal rounding, overflow/underflow, unsafe integer and negative zero refuse. | `@covers US-054-AC5` | Contract |
| US-054-AC6 | `declared decimals, exclusions, unknown qualifiers and JSON/YAML carriers`; integer boundary test | Precision/scale, integer width, range/exclusive bounds and allowed values apply; unknown relevant facets and prior core version refuse. | `@covers US-054-AC6` | Integration |
| US-054-AC7 | `declared decimals, exclusions, unknown qualifiers and JSON/YAML carriers`; browser harness | Decimal spelling and integer values survive both formats; source remains unchanged and unrelated future Document content survives. | `@covers US-054-AC7` | Integration |
| US-054-AC8 | `constructor retains spelling and refuses malformed and over-limit input` | Invalid grammar, exponent/text limits, extra carrier members and hostile carrier/context getters refuse; getter sentinel stays false. | `@covers US-054-AC8` | Contract |
| US-054-AC9 | Chromium public API harness | 26 scoped checks pass on the built bundle, including numeric/Field policy, both recovery formats and absent Bun/process globals. | `@covers US-054-AC9` | Browser |

## Executable Proof

Run the focused compatibility gate:

```sh
bun test tests/core/javascript-numeric.test.ts tests/core/schema-properties.test.ts tests/core/schema-properties-review.test.ts tests/core/key-tuple.test.ts
bun run typecheck
bun run build
bun scripts/javascript-numeric-browser.ts
bun scripts/acceptance-traceability.ts --check
```

The project ledger verifies citations and dangling IDs; it is not a runtime
result recorder. Use the [implementation evidence](../../04-build/implementation-plan.md#shared-javascript-numeric-policy-2026-10-07)
for executed versions, checks and source fingerprints. Do not imply a historical
test-first red run: these criteria were formalized after the bounded implementation.

## Data and Setup

Use the locked dependencies, existing public index, synthetic current Documents
and an explicit Field identity. Tests create signed 64-bit and decimal(4,2)
domains, exact binary64 decimal expansion and a minimum-subnormal coefficient.
No database, credentials, mocks or remote service is needed. Chromium requires
the fresh browser bundle, Playwright and a permitted loopback server; a sandbox
launch failure is an environment failure, not a passing check.

## Edge Cases and Failure Modes

Cover signed zero, safe integer limits, fractional integer tokens, extreme
exponents, overflow/underflow, rounding and nonfinite input. Preserve extra
carrier content by refusing conversion rather than dropping it. Unknown relevant
Field semantics refuse while unrelated Document content can remain attached.
Record runtime versions; the observed Bun version differs from the manifest pin.

## Build Handoff

TD-054 sequences exact identity comparison, carrier conversion and reused Field
validation before public export/browser qualification. Keep Bun/Node APIs out
of portable source and add no runtime dependencies or envelope migration.

Done requires all primary criterion layers to pass, citations to resolve, both
serialization formats to recover, typechecks/build to pass and evidence to name
tested versions/subsets. Database equivalence and downstream adoption require
their own gates; removing this adapter must leave existing carriers readable.
