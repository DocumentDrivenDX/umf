# TableSpec facet classification checkpoint

Execution supplement for [TD-043](../../02-design/technical-designs/TD-043-core-facets.md),
[CONTRACT-040](../../02-design/contracts/CONTRACT-040-core-ideals.md) and bead
`umf-97221618-1c44db4c`. This implements the native-to-ideal direction after
[native discovery](tablespec-facet-discovery.md). Authored down-projection and
combined binding acceptance remain unfinished.

## Implemented surface

`umf.tablespec.facets` 1.0.0 has a complete element payload schema and a complete
classification operation schema. It targets experimental core 0.5.0 and pinned
TableSpec commit `647e8e566ad78b864282ec65c0b0b2237aa63084`.

The browser API exports `classifyTableSpecFacets`,
`verifyTableSpecFacetClassification` and `recoverTableSpecFacetSource`, together
with typed requests/results and `tableSpecFacetsPackage`. Callers select a column,
consumer profile, raw/model-normalized metadata input, value-domain/exact-input
obligation and strict/report mode. Source migration and Field kind are explicit
prerequisites. Array/map and record-valued Fields require a separate item/value
mapping; this scalar-column classifier blocks them.

Consumer profiles are declared metadata, generated JSON Schema, general PySpark
schema, generated GX rules on Spark, ingest casts, and unresolved. Interpreted
bounds carry declared/inferred provenance and native paths. Defaults that cannot
establish the source declaration stay native. Length claims cover well-formed
Unicode scalar strings only; no grapheme, normalization, arbitrary-surrogate,
padding or collation behavior is claimed.

Strict mode blocks non-exact obligations. Report mode can produce a complete UMF
candidate with residuals, but cannot overwrite conflicting authored facets. An
existing facet label requires a verified author receipt. Unknown qualifiers remain
attached, native archives are retained, and a blocked result has no partial target.
Receipt verification recomputes the operation and compares the current target;
it proves consistency, not authenticity.

## Evidence

The [native classification record](../../../../fixtures/validation/facets-tablespec-classification-native.json)
checks 1,216 cases against pinned Python generators, model behavior and the native
discovery execution results. It checks the complete profile matrix and derives
expected positive claims, so silently omitting an interpretable facet also fails.
It verifies 118 interpreted facet claims, including claims on blocked results;
blocked results still emit no target. Sources must match the discovery corpus or
the pinned Providers example before generated Python is evaluated.

The corpus spans 44 declarations, all consumer/input/loss profiles, selected
exact-input cases and every column of the native Providers example. There are
721 classified results and 495 explicit blocks, with 1,442 exact native-source
recoveries through JSON/YAML operation receipts. Classification with no source
facet to interpret can succeed without inventing one; the successful-result count
is not a count of newly inferred bounds.

The [Chromium record](../../../../fixtures/validation/facets-tablespec-classification-browser.json)
repeats that matrix against the public browser build, rejects semantic receipt
forgeries across all six profiles and observes zero getter calls, host globals
or external requests. Seven Bun tests / 4,663 assertions also cover verified-author
conflicts, extension validation, unknown qualifiers, split archives and exact
numeric lexemes, including values beyond the safe-integer metadata profile.
Typechecking, 263 JSON Schemas, 43 extension packages and the browser build pass.

Reproduce with:

```sh
bun scripts/core-ideals/facets-tablespec-schema.ts
bun test ./tests/core-ideals/facets-tablespec.test.ts
bun run typecheck
bun run test:schemas
bun run build
bun scripts/core-ideals/facets-tablespec-oracle.ts
UMF_CHROMIUM_PATH=/home/erik/.local/bin/chromium bun scripts/core-ideals/facets-tablespec-classification-browser.ts
```

The native command uses the configured TableSpec Python/Java environments. Its
record explicitly sets `bindingAccepted`, `idealAdmitted` and `nativeEquivalence`
to false. The operation is experimental; a passing classification command does
not satisfy the two-direction binding acceptance criteria.

## Remaining work and qualification limits

Implement authored ideal-to-native projection with complete native candidates,
strict/report loss, retained ideal receipts and independent native reimport.
Cover zero/byte lengths, arbitrary integer width and signedness, decimal rounding,
unknown facet units/qualifiers, unclaimed defaults and item/value facets. Investigate
available native enforcement paths before treating a target limitation as a refusal.

Then run emitted artifact/value checks, both round-trip directions and browser
parity for the complete binding. Refresh the affected five-system Field,
Nullability and Cardinality evidence and gates before closing this bead. Those
prior acceptance records describe their recorded source snapshots; they have not
been requalified against this new API/bundle. No current all-five gate or full
repository regression claim is made by this checkpoint.

No full TableSpec ingestion pipeline, table DDL, Delta write, native replacement
or migration that discards native content is implemented here. The separate facet
admission/delivery gate and Key remain open.
