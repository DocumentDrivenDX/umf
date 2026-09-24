# Avro Key binding acceptance

The Avro task under [TD-044](../../02-design/technical-designs/TD-044-core-key.md)
and [CONTRACT-040](../../02-design/contracts/CONTRACT-040-core-ideals.md) passes
qualified binding acceptance with Apache Avro **1.12.0** and fastavro **1.12.2**.
This covers Avro's portions of [US-044](../../01-frame/user-stories/US-044-core-key.md)
AC2–6, AC11 and AC13. Parquet and the separate Key admission/all-five gate remain
open. This is not native uniqueness enforcement or native equivalence.

## Classification and native recovery

`classifyAvroKeys` observes explicit record declarations in the root schema and
named dependency schemas. Each observation retains the native record/field paths
and reports collection enforcement as not expressible, author intent as unknown,
and observation provenance as inferred. It creates no core keys. Field order,
reader defaults, nullable unions, aliases and key-like metadata remain native.

The caller supplies the original root and dependency texts. The classifier checks
that their parsed native representation matches the current Avro document before
retaining them. Unknown numeric lexemes, dependency order, formatting and unrelated
UMF extensions survive. Report mode attaches observations with explicit residuals;
strict mode blocks unmet identity/enforcement obligations without a partial target.
Recovery verifies the receipt and current target before returning the exact native
archive. This establishes consistency, not source authentication.

## Authored projection and ideal recovery

`projectKeysToAvro` consumes core 0.6.0 explicit Record membership and verified
named-key declarations. Explicit column mappings select required singular scalar
carriers: boolean, int, long, bytes, string, float, double or decimal-annotated bytes.
Core validation independently excludes undefined key comparator families. Other
Field shapes require separate bindings and block this projection atomically.

Every primary and alternate key has its own outcome and source residual, retaining
stable ID, name, ordered tuple and primary intent. Avro receives field types, not
invented key annotations. Native field positions are physical mappings, not key
identity. Verified renames and key-list reorder preserve IDs; changed tuples,
missing/cross-record membership, altered IDs and malformed mappings refuse.

Report mode retains the complete authored source, unknown qualifiers and every
unexpressed key obligation. Strict mode emits no native candidate because Avro
cannot enforce collection uniqueness or carry the authored identity contract.
`recoverKeysAvroIdeal` recomputes the projection and checks the current imported
native representation before restoring the retained source. Reimport without that
report cannot reconstruct authored keys.

## Native limits and counterexamples

The discovery oracle runs 24 writer cases across both codecs. Four missing/null
controls refuse; forty cross-reader checks preserve encoded values. Four object
container reads retain duplicate records, and four reader-resolution checks
synthesize equal defaulted values. Custom key metadata, sort order and nullable
unions do not establish uniqueness. Binary64 `1.0000000000000002` narrows to
binary32 `1.0`; that case remains a permanent counterexample.

Twenty authored projection cases produce sixteen schemas and four explicit blocks.
The generated-schema oracle runs 32 writer cases and 64 cross-reader checks.
Repeated complete records, primary candidate values and alternate candidate values
all encode successfully. Sixty-three missing/null controls refuse. One distinct
counterexample is retained: **fastavro's strict boolean writer coerces null to
false**. The projector reports that input-validation loss explicitly.

Native widths, facet enforcement, decimal conversions and full ideal domains remain
residual obligations. Neither successful schema parsing nor encoding proves exact
input conversion, required-input validation or collection identity.

## Verification

The [acceptance record](../../../../fixtures/validation/key-avro-acceptance-evidence.json)
records the scoped core/Avro compatibility counts and current evidence fingerprints.
Its [command record](../../../../fixtures/validation/key-avro-compatibility-command.json)
selects all Avro-named tests and core tests explicitly, including existing cross-system
transforms. This is not a full repository run or a refresh of prior all-system gates.

Chromium agrees with Bun on thirteen classification cases, including a named
bundle with unknown UMF metadata: 26 exact native archive recoveries, thirteen
strict blocks and thirteen forged-identity refusals. The projection browser checks
all twenty cases, 32 ideal recoveries and 32 altered-receipt refusals. Both harnesses
prohibit external requests and require no Bun/Node globals. Typechecking, the public
browser build, and 303-schema / 52-package audits pass.

Run `bun scripts/core-ideals/key-avro-oracle.ts` for both discovery and generated
schema checks. Run `key-avro-browser.ts` and `key-avro-projection-browser.ts` under
`scripts/core-ideals/` with `UMF_CHROMIUM_PATH` pointing to installed Chromium.
