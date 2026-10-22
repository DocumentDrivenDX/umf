# UUID/128-bit mixed models, containers and associations — 2026-10-16

CONTRACT-076 / SD-005 / FEAT-005 govern the explicit `uuid-model2` composition
profile. This adds a qualified composition boundary alongside uuid-model1; it
never silently reinterprets older bindings. The execution sequence is mixed
flat Records, finite containers/groups, then association Records and endpoint
alternatives. Qualification status is recorded in the closeout below.

## Implementation

Mixed Record fields share exact carrier/value and Key/FK lowering. Boolean,
bounded integer (including integer128), decimal, string and binary use existing
portable value semantics. Float/temporal typed tokens retain exact lexical text,
including negative zero and fractional/timezone spelling, without inventing
arithmetic or validity semantics. SQL native types retain explicit unimplemented
facet/equality/order residuals. File/model scalar fallback is explicitly text.

Containers resolve existing item/value Field identities. Groups resolve explicit
binding group membership and a record-type Field reference. Recursive values use
array/map wrappers and explicit group member values; finite acyclic type shapes
are bounded before expansion. Empty, absent and present-with-absent-child values
remain distinct. Array order/duplicates and exact map keys survive. SQL uses
JSON storage; Avro/Parquet use native arrays/maps/structs with complete word-pair
children; TableSpec uses JSON text. Composite mappings publish tagged member,
array-item and map-value paths without confusing a wildcard with a literal key.
Complete-row/file codecs reject missing/extra group members, partial pairs,
duplicate JSON members, invalid domains and violated collection bounds. SQL/CSV
absence is distinct from a present JSON-text null.

Association layouts preserve their keyed association Record, attributes and
explicit mappings to named endpoint Keys. Endpoint sets are alternatives; each
association instance selects one source and one target type. Native SQL emits
reference and exclusive-choice constraints. Finite dataset validation checks
complete populations, all Keys/unique indexes, reference integrity, endpoint
selection and distinct-endpoint multiplicity, including zero-degree instances.
Two association rows connecting the same endpoints do not count twice. Inverse
presentation and authored lifecycle remain source meaning, not invented native
cascades or deployed navigation. File/model enforcement remains explicit residuals.

## Qualification design and retained retries

`qualify-composition.ts` captures actual command exits and logs in an isolated run
directory, stopping on the first failure. It covers20 stage/target cases: mixed,
containers, associations and polymorphic associations for each of five targets.
Native SQL scripts execute generated DDL, exact mixed values, keys/FKs, malformed
writes and rollback; file scripts use actual Apache Avro/fastavro/PyArrow writers
and readers; TableSpec uses its installed model/schema/generator and Spark CSV/
Parquet execution. Native-returned values feed the public portable decoders and
complete dataset validator. Existing native preservation adapters recover both
JSON/YAML envelopes; Chromium executes the actual public bundle. Qualification
checks current source/schema/proof hashes, native input and DDL correspondence,
versions, both recovery directions and missing/stale/falsified-evidence controls.
Source hashes are correspondence evidence, not authentication.

Early tooling attempts exposed a TypeScript Node-hash ArrayBuffer typing mismatch
and Spark's default CSV escape character, which differs from the CSV writer's
doubled quotes. Hash inputs now use byte views; Spark ingestion explicitly selects
quote escaping. A first successful composition run preceded final source review;
its result is not treated as the final source qualification. Final review added
strict JSON-null handling, tagged mapping recovery, bounded scalar index budgets,
unsigned nested Parquet pairs, integer128 mixed values and native-accepted invalid
value counterexamples. Final qualification reruns the frozen implementation.

## Boundaries

This profile supports finite acyclic shapes and explicitly selected carriers and
layouts for the recorded versions. It does not add recursive schema cycles,
partitioning, document-expression indexes, cross-carrier FK coercion, UUID
generation, performance optimality, physical migration/cutover, lifecycle
execution or Truss/Weft deployment. SQL JSON and TableSpec strings do not enforce
recursive domains. Float/temporal tokens remain lexical rather than a newly
qualified arithmetic/calendar domain. Strict blocks all residual obligations;
report retains them with complete sources. Native equivalence and deployed
consumer execution remain false. Scoped replay is not a full repository test.

## Reproduction

The existing native environment described in `native/uuid/README.md` supplies
UMF_UUID_PYTHON, UMF_TABLESPEC_PYTHON, JAVA_HOME, SPARK_LOCAL_IP and
UMF_CHROMIUM_PATH. Run `bun scripts/uuid/qualify-composition.ts` for fresh owned
fixtures and actual command receipts, or its `--verify-only` mode for retained
source-bound evidence. The original `qualify.ts` separately refreshes model1.
No dependency installation, external service deployment or third-party data is
performed. All fixtures are synthetic. No subagents were used; spending metering
and an enforced token ceiling are unavailable in this runtime.

## Final qualification closeout

The frozen-source14-phase composition runner passed every command. All20
target/stage cases pass: PostgreSQL17.9, SQL Server2022 (16.x), Apache Avro1.12.0 /
fastavro1.12.2, PyArrow21.0.0 / Parquet2.11 target, and installed source-bound
TableSpec model1.0 / Spark4.0.1. The final corpus includes mixed unsigned integer128
maximum, exact signed64 minimum/decimal/binary values, float negative-zero text,
timestamp fractional/timezone spelling, unsigned nested Parquet pairs, absent/empty
containers, duplicate array entries, group attributes, repeated association
instances and exclusive polymorphic endpoint alternatives.

Native-returned data passes72 complete row decodes and24 dataset duplicate-Key
refusals. Sixteen actual native file/Spark invalid scalar values are refused by
the portable decoder. SQL JSON shape counterexamples additionally demonstrate
that native JSON syntax checks do not enforce nested word pairs. All116 authored
and native-source recoveries pass through JSON/YAML envelopes and existing native
adapters. Actual Chromium public-bundle execution passes20 cases /60 row recoveries
and40 duplicate/stale refusals, with no host globals or external requests.

The isolated composition/model suite passes19 tests; its new domain cases are
8 tests /78 assertions. The separate composition-gate suite passes2 tests, including
missing, falsified, stale and unsafe evidence controls. Both TypeScript configs,
browser build and421-schema/69-package audits pass. The original17-phase model1
qualification separately passes all native/browser phases,38 UUID/model tests,
65 binding regressions and2 conformance tests against the same shared source.
These are115 distinct scoped tests, not a full-repository test campaign. Observed
final Bun runtime is1.4.3; actual command paths/versions remain in the run logs.

[composition-qualification.json](../../../../fixtures/validation/uuid/composition-qualification.json)
records `fiveTargetCompositionDelivery:true`, with native equivalence and consumer
runtime adoption false. Current source/schema, generated bundle, native artifacts,
actual command logs and native input/DDL correspondence are checked; deleting
required proof entries cannot bypass freshness verification. The final runner
receipt is retained with the evidence; copied logs normalize whitespace only.
Earlier failed/tooling and pre-review attempts above do not establish the final
claim. Both profile verification commands pass against the retained final source.

### Main integration — 2026-10-16

Implementation `6aea0792` was merged with50 newer main commits at `5e7a4670`.
Both execution-log entries were retained. Conflicting generated identity and
qualification receipts were regenerated against the merged source. Fresh model1
17-phase and model2 14-phase runs passed all commands, including native databases,
file/Spark values, source recovery, public browser execution and both gate suites.
Normalized retained logs and both source-bound verification commands pass. The
later `902c9f71` commit changes only security test documentation; it does not
change the qualified source or schemas. This remains115 distinct scoped tests,
not a full-repository regression claim.
