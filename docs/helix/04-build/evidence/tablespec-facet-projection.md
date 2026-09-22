# TableSpec authored facet projection

This experimental checkpoint implements the authored projection portion of
CONTRACT-040 and TD-043. Full binding acceptance, five-system facet ideal
admission and native equivalence remain unproven.

`projectFacetsToTableSpec` accepts a verified core 0.5.0 facet declaration and an
explicit native type, consumer profile, input form and value obligation. It emits
a complete native TableSpec document. Strict mode blocks on any retained loss;
report mode can emit a valid carrier with residuals. The receipt retains the full
source, including unknown facets, native payloads and other definitions.
`recoverFacetsFromTableSpec` recomputes the operation and verifies exact native
text before restoring the ideal. This verifies receipt consistency, not source
authenticity. A verified Field-kind declaration can exercise facetless and unknown
facet cases, but does not establish authorship of existing facet members.

Supported representations depend on the selected profile:

| Facet | Representation |
| --- | --- |
| Unicode scalar length | Positive raw JSON Schema `max_length`, positive baseline GX `length`, or explicit suite length rule including zero |
| Integer width | Signed 32-bit general Spark/ingest carrier; explicit suite bounds for signed 1–32 or unsigned 1–31 |
| Decimal precision/scale | Explicit metadata; ingest decimal precision up to 38; general Spark `(10,0)`; explicit suite precision 1–10 at scale zero |

A normalized model drops `max_length`; the raw JSON projection therefore does
not claim that normalized output honors it. Unsupported byte encodings, wider
integer carriers, nonzero suite decimal scale and unknown qualifiers produce
residuals. Missing facets never become authored limits from native defaults.
Scalar carrier projection does not flatten containers or record-valued Fields.
Exact-input obligations retain conversion losses, including fractional decimal
rounding and binary64 `1.0000000000000002` narrowing to binary32 `1.0`.
Metadata declarations and direct GX checks do not establish whole-pipeline
execution or write-blocking behavior.

Evidence at this checkpoint:

- Projection Bun tests: 5 tests, 2,506 assertions over 540 cases, with strict/report
  behavior, independent native reclassification, both receipt formats, unknown
  content, stale native text, forged receipts and accessor refusal.
- Existing classification/suite regression: 10 tests, 4,868 assertions passed.
- Native TableSpec model and checked schema: all 331 emitted documents valid,
  104 consumer representation claims checked, 662 ideal recoveries verified.
- Actual emitted GX rules: 11 distinct rules, 63 value checks and two tolerance
  controls, using native-generated Spark carriers.
- Chromium public bundle: 540 cases, 331 projections, 209 blocks, 662 ideal
  recoveries and 331 forged-receipt refusals. No external requests or host globals.
- Type checks, browser build, 264 schemas and 43 package checks passed.

Native versions remain TableSpec commit
647e8e566ad78b864282ec65c0b0b2237aa63084, Pydantic 2.11.10, JSONSchema
4.25.1, Spark 4.0.1, GX 1.15.1 and Java 21.0.2. Native and browser records under
`fixtures/validation/facets-tablespec-projection*.json` retain source fingerprints.
The combined native/browser entrypoints cover classification, explicit suites and
projection. The owning bead remains in progress for full compatibility refresh
and the prior Field, Nullability and Cardinality conformance gates.
