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
    - id: CONTRACT-050
      kind: informed_by
---

# Shared schema properties

Owner-directed implementation on 2026-10-04 adds title, examples, aliases,
collection size, allowed values, numeric range, minimum length and explicit
literal defaults in core 0.8.0. Existing schemas remain published.
The public API supplies copied declarations and inspection, field-value checks,
default resolution, retained migration and rollback.
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

Fresh verification with Bun 1.3.14 passes 176 core tests across 27 explicitly
selected test files, with 4,565 assertions and zero failures after label removal. Both TypeScript
checks, the browser build, the 346-schema audit and the 59-package audit pass.
An initial directory-filter run unintentionally included `core-ideals` and was
terminated; it is not a completed broader-suite result. The first expanded
browser attempt exposed the recursive null-bound failure, which was corrected
before the successful replay.

Chromium 153.0.8010.12 passes 38 validation cases, six serialization recoveries,
nine operation refusals and six extension-callback observations across validation
and selection. Getter executions and external requests are both zero. The
refreshed browser record fingerprints all tested sources, including the new
regression file, and the freshly built bundle. Python 3.9.6 again agrees with all
58 independent integer64/decimal(20,2) probes. Broader native/conformance suites
were not replayed to completion; native adapter admission remains unclaimed.

Follow-up verification found that a single exclusive bound at a declared numeric
domain extreme could still describe an empty interval. The corrected validator
checks signed/unsigned integer and fixed-scale decimal extrema without expanding
the declared width or precision. Regression coverage includes one-bit integers,
inclusive and neighboring valid bounds, atomic authoring/receipt checks and
maximum-safe-integer width/precision declarations. Sixteen additional Chromium
cases cover exclusive extrema and inclusive controls. An initial worktree core
run hit two evidence-file write permissions; the complete replay above passed
with the required worktree write access.

The label-removal replay refreshes the four stale source fingerprints in the
schema-properties browser record. The schema generator now reproduces the
checked-in schemas without restoring the removed title label.

## Post-sweep evidence repair (2026-10-05)

The schema generator now reproduces the published title. A fresh Chromium replay
passes 38 cases, six recoveries, nine refusals and six extension checks, with
zero accessor executions or external requests; all 17 recorded source hashes
match the current tree. The core-only replay passes 176 tests in 27 files with
4,565 assertions. TypeScript checks, 346 schemas and 59 extension packages pass.

Regression investigation also restored 100 vendored RDF/XML and SHACL files to
the existing pinned manifest hashes. Git attributes retain upstream line endings.
Regenerated SHACL source exports pass 300 RDFLib 7.6.0 graph-isomorphism checks
and 13 native path checks. The RDF/XML, SHACL, dbt freshness and acceptance-ledger
replay passes 12 tests with 3,261 assertions. dbt Core 1.10.0 now retains the
six native target artifacts in tracked fixtures; all 14 provenance files match
their hashes, the independent oracle passes four comparisons, and Chromium
passes four serialization round trips and four edits. An independent Protobuf
7.36.2 / jsonschema 4.26.0 projection replay passes all five tests.

At this repair checkpoint, selection receipt compatibility remained an open
owner decision; the subsequent amendment below resolves it. Broader native
qualification evidence requires separate regeneration; these scoped checks
do not establish a passing full repository suite.

## Owner-directed routine API simplification (2026-10-05)

Routine selection results are metadata snapshots; element and relationship
selection verifiers have been removed. Schema-property authoring returns a
copied validated Document directly, without a declaration receipt or verifier.
Structural selection schemas remain available. Upgrade/rollback archives and
native-conversion preservation records retain their existing checks. Historical
receipt-verification and source-fingerprint evidence above describes the old API;
it is not a fresh integrated native compatibility claim for this revision.

The unknown-length-unit regression is fixed for minimum-only, zero-maximum,
combined zero bounds and positive-maximum cases. Each produces one warning and
incomplete validation, preserving the unit and refusing extension edits. Known
unicode-scalar units remain complete and editable.

Bun 1.3.14: 186 affected tests across 30 files, 4,830 assertions, no failures.
Chromium 153.0.8010.12: 38 validation cases, four serialization recoveries,
12 refusals and four unknown-unit checks; no getter execution or external requests.
The browser record fingerprints the current implementation and transition schema.

All six affected metadata browser harnesses also replay successfully in Chromium
153: relationship (28 selection recoveries), key (4), facets (4), cardinality
(24), nullability (10) and record type (12). Their committed browser records
contain refreshed fingerprints from the actual replays. Schema generation is
deterministic; final source/tool typechecks and all 346 schemas / 59 packages pass.

An optional `bun test tests` run was stopped after 477 passing tests while it
continued through unrelated upstream fixtures, with no failures observed at
that point. It is not a completed full-suite result. Current native qualification
gates were not regenerated or weakened by this amendment.

## Consolidated TableSpec format session (2026-10-05)

The owner requested incorporation of the “Split TableSpec format meanings”
session into this work and PR #1. Its design is retained as CONTRACT-050 and
FEAT-005 IDEAL-07, with the CONTRACT-030 native-recovery boundary and the ordered
implementation-plan work. Documentation/examples, input parsing, output
rendering, explicit typed enumerations and dialect-qualified structural patterns
remain distinct. No portable constraint or authored intent is inferred from a
native format string. The recipe/runtime design is still separate follow-up work.

That session’s schema-generator correction, fresh browser evidence, exact
vendored source-byte restoration and durable dbt freshness provenance repairs
are already included in PR #1. Its old selection-receipt compatibility decision
is superseded by the owner-directed removal described above. Its unresolved
full-suite/native-qualification work is continued by the current replay rather
than treated as passing historical evidence.

## Completed diagnostic regression and current replay (2026-10-05)

The host `bun test tests` diagnostic run completed rather than being stopped:
2,120 passed and 12 failed, 130,698 assertions across 380 files. It ran while
verification tooling was being repaired, so it is not the immutable final
acceptance run. One failure was the absent Python projection oracle; replay
with Protobuf 7.36.2 / jsonschema 4.26.0 passed all five tests in that file.
Eleven failures concern qualification records, missing generated bundles or
historical browser/path assumptions. Current acceptance remains pending the
isolated logged native/browser inventory, unchanged-source regression and gates.

The native replay also identified a TableSpec source-byte mismatch. Restoring
`native/tablespec/sources/tests/unit/test_umf_loader.py` from the pinned TableSpec
commit restores its twelve upstream coverage annotations and the original
manifest hash. The expected hash was not changed. The source directory now has
Git text conversion disabled. Cardinality browser wrappers and facet conformance
now require the exact replayed Chromium pin, with the retained 148 default for
historical records. Current replay uses Chromium 153.0.8010.12. Failed and partial
attempts remain separate from the passing command inventory.

## Completed pre-simplification regression run

This run and its focused replays cover the implementation at `0ed68e30`,
before the concurrent API simplification commits `5a001660` through `cdd0070c`.
They do not verify those later changes.

The complete `bun test tests` run finished in 1,911.38 seconds: 2,114 passed,
18 failed, 130,636 assertions across 380 files. It began before the dbt repair
and without `UMF_PYTHON_PATH`; it is not a green run of the final checkout.
Post-fix replays clear the dbt failure, the acceptance-ledger timeout, the
projection oracle and four Protobuf failures. The Protobuf directory passes
10 tests and 103 assertions with its configured pinned Python runtime.
Eleven observed qualification-gate failures remain unrepaired: cardinality
(one), facets (four), relationship (one), key (three), field (one) and
nullability (one). They include stale fingerprints, missing generated bundles
and historical absolute-path handling. Native evidence regeneration and
portable-path follow-up remain outstanding; no gate was weakened.

After integrating the concurrent upstream changes through `cdd0070c`, a fresh
core-only replay passes 177 tests across 27 files with 4,586 assertions; both
source and tool TypeScript checks pass. This verifies the simplified core API,
not a fresh full repository or integrated native qualification run.

## Current-only key tuple correction (2026-10-06)

The owner explicitly removed previous-document support from the tuple operation.
`encodeCoreKeyTuple` now validates the actual core 0.8.0 document rather than
dispatching to 0.6.0/0.7.0 validators. The exported current operation schema and
result version 3.0.0 retain that exact source; older documents and result versions
refuse. The `umf-key-tuple-v1` byte/equality profile remains unchanged. Allowed
values, numeric ranges and both length bounds are checked for every component;
defaults never supply a missing key component.

The exact-file core run passes 178 tests / 4,616 assertions across 27 files. A
non-overlapping affected-file run passes 84 tests / 1,435 assertions across seven
files; these counts overlap the core run and must not be added. Typechecking and
all 347 schemas / 59 packages pass. Six harnesses pass in Chromium 153.0.8010.12:
tuple encoding, Key transition, public Key operations, public Relationship
operations, SQL Server encoding examples and schema properties. The tuple matrix
has 65 cases, 29 encodings, 36 refusals and 58 serialization recoveries, with no
getter execution or external requests. Actual logs and runtime pins are retained
in `fixtures/validation/current-key-tuple-fix/`.

The prior 174-command native replay qualifies its recorded earlier source only.
It does not establish current native admission after this correction. Repository
regression/evidence gates and publication still need fresh completion; system
sleep interrupted the earlier retry and caused a long elapsed-time timeout.
