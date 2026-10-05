---
ddx:
  id: EVIDENCE-SCHEMA-PROPERTIES-CORE
  type: evidence
  activity: build
  status: complete
  authoring:
    home: repo
  links:
    - id: CONTRACT-049
      kind: informed_by
    - id: FEAT-005
      kind: informed_by
    - id: TP-001
      kind: informed_by
---

# Experimental shared schema properties

Owner-directed implementation on 2026-10-04 adds title, examples, aliases,
collection size, allowed values, numeric range, minimum length and explicit
literal defaults in experimental core 0.8.0. Existing schemas remain published.
The public API supplies copied declarations and inspection, field-value checks,
default resolution, receipt verification, retained migration and rollback.
JSON/YAML document operations and metadata selection accept the new version.

Defaults require an explicit `missing`, `null` or `missing-or-null` trigger.
Resolution returns a copied result; it does not mutate importer rows or execute
native defaults. Integer and fixed-scale decimal tokens use exact arithmetic.
Allowed-value equality and default evaluation have the bounded domains stated
in CONTRACT-049. Float, temporal and record-reference evaluation remains
unimplemented; unknown relevant qualifiers refuse evaluation. Migration
archives colliding legacy content and rollback restores the original envelope.

Verification with Bun 1.3.14:

- The complete core directory passed: 147 tests in 26 files, 4,221 assertions,
  including 29 schema-property tests.
- Source and tool TypeScript checks passed, as did the browser build.
- Real Chromium 153.0.8010.12 passed 18 validation cases, six serialization
  recoveries and three operation refusals, with zero accessor executions and
  zero external requests. The [browser record](../../../../fixtures/validation/core-schema-properties-browser.json)
  fingerprints the tested implementation, schemas and bundle.
- Independent Python 3.9.6 Decimal comparisons agreed on all 58 integer64 and
  decimal(20,2) probes. The [oracle record](../../../../fixtures/validation/core-schema-properties-oracle.json)
  retains each observation and input fingerprint. This is literal-domain
  evidence, not native storage equivalence.
- JSON Schema audit passed 346/346; extension-package audit passed 59/59.
- Three historical-evidence test files now resolve their recorded Linux
  repository prefix in this macOS checkout without changing evidence hashes.
  Their focused replay passed 43 tests and 825 assertions.

An additional 371-file regression selection (excluding eight independent
native gate/evidence suites) was stopped during its lengthy TableSpec corpus,
after reaching 151 files. It is incomplete and is not a passing full-suite
claim. Its three observed failures were the historical Linux path references
described above, subsequently corrected and replayed successfully. That initial
run also predates the final unknown-qualifier guard. Review found that three
browser-record fingerprints were stale despite the previous final-replay claim;
the fresh correction replay below supersedes that record.

No new native adapter, physical default execution, native equivalence or ideal
admission is claimed. Existing version-specific authoring and native-binding
operations retain their previous version bounds; they have not all been ported
to 0.8.0. TableSpec integration remains a subsequent implementation task.

## Review correction replay

The six combined-review findings have regression coverage in
`tests/core/schema-properties-review.test.ts`: full isolated extension context,
non-null numeric bounds, independent known-range checks alongside unknown facets,
discrete interval emptiness, accessor-safe identities and atomic rejection of
malformed facet patches. A further null-bound guard covers collection literals
that reach a malformed item Field before document validation finishes.

Fresh verification with Bun 1.3.14 passes 158 core tests across 27 explicitly
selected test files, with 4,379 assertions and zero failures. Both TypeScript
checks, the browser build, the 346-schema audit and the 59-package audit pass.
An initial directory-filter run unintentionally included `core-ideals` and was
terminated; it is not a completed broader-suite result. The first expanded
browser attempt exposed the recursive null-bound failure, which was corrected
before the successful replay.

Chromium 153.0.8010.12 passes 22 validation cases, six serialization recoveries,
nine operation refusals and six extension-callback observations across validation
and selection. Getter executions and external requests are both zero. The
refreshed browser record fingerprints all tested sources, including the new
regression file, and the freshly built bundle. Python 3.9.6 again agrees with all
58 independent integer64/decimal(20,2) probes. Broader native/conformance suites
were not replayed to completion; native adapter admission remains unclaimed.
