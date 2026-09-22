# TableSpec explicit suite facet classification

This is a classification checkpoint under CONTRACT-040 and TD-043. Authored
projection, complete binding acceptance, ideal admission and native equivalence
are not established by this checkpoint.

The `gx-suite-spark` profile interprets canonical unconditional rules from the
native unified expectation suite on the general PySpark carrier. It is separate
from `gx-spark`, which interprets baseline-generated rules. Explicit suite rules
can express a zero maximum string length; the baseline generator ignores zero.

The qualified subset covers well-formed Unicode scalar string lengths, canonical
signed widths 1–32 and unsigned widths 1–31 within the signed-32-bit carrier,
and decimal precision 1–10 at scale zero on DecimalType(10,0). Wider and other
encodings need separate evidence. GX skips nulls, so these bounds establish no
nullability claim. Unknown, conditional, tolerant, duplicate and conflicting
rules remain residuals; strict mode blocks. The library never evaluates rule
expressions. Exact-input obligations retain conversion losses, including decimal
rounding and the binary64-to-binary32 narrowing counterexample.

Native evidence in `fixtures/validation/facets-tablespec-suite-native.json`
records TableSpec commit 647e8e566ad78b864282ec65c0b0b2237aa63084, Pydantic
2.11.10, JSONSchema 4.25.1, Spark 4.0.1, GX 1.15.1 and Java 21.0.2.
The Python oracle validates native model/schema parsing, converts rules using
native `to_gx_dict`, generates the Spark carrier and runs actual GX validation:
10 cases, 61 value checks and two tolerance controls. This does not execute the
whole ingestion pipeline or establish write-blocking behavior.

Validation at this checkpoint:

- Focused Bun tests: 10 passed, 4,868 assertions, including the prior 1,216-case
  classification matrix and both JSON/YAML receipt recovery forms.
- Public bundle in Chromium: 80 suite-profile cases, 60 classified, 20 blocked,
  120 native source recoveries and 60 forged-profile refusals; no external
  requests or host runtime globals. Fingerprints are recorded in
  `fixtures/validation/facets-tablespec-suite-browser.json`.
- Type checks, browser build, 263 JSON Schema checks and 43 package checks passed.

Earlier acceptance records continue to qualify their recorded snapshots. The
TableSpec facet bead remains in progress until authored projection, both round
trips, emitted-native checks and the prior Field/Nullability/Cardinality gates
have been refreshed against the complete binding.
