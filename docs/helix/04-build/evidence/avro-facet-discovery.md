# Avro facet native discovery

This checkpoint supports CONTRACT-007, CONTRACT-040, US-043 and TD-043. It pins
Apache Avro Python 1.12.0 and fastavro 1.12.2 and makes no public facet binding,
ideal-admission or native-equivalence claim. The fixture is synthetic and contains
no personal data. Bun orchestrates the native Python checks.

The 84-input fixture produces 168 writer cases, 109 successful writes and 218
cross-codec read attempts. Schema parsing, validation, writing and each reader
are recorded separately, including warnings/errors, exact encoded hexadecimal
bytes, typed decoded values and consumed byte counts. Fifty-four explicit
assertions preserve the reviewed counterexamples. Decimal context is pinned to
precision 28 and ROUND_HALF_EVEN; input integers use decimal strings to avoid
JavaScript rounding. Failed reads remain failures in the evidence.

## Observations

- Both codecs narrow binary64 `1.0000000000000002` to binary32 `1.0`.
- Apache rejects integer 2147483648 for `int`; the selected fastavro writer and
  reader accept it. Both accept the Python boolean `True` as an integer and
  decode it as `1`. Host-input exactness is separate from the declared carrier.
- Custom unsigned/width metadata permits -1 and 256; string maxLength 1 permits
  `ab`. These annotations cannot certify enforcement.
- Fixed size zero accepts empty bytes and rejects the tested nonempty values.
  Nonzero fixed sizes remain exact lengths, distinct from a maximum bound.
- Apache validates decimal(3,2) `1.2`, writes coefficient 12 and reads `0.12`.
  It validates `12.34`, writes coefficient 1234 and reads `12.3`. Fastavro writes
  `1.2` with coefficient 120 and reads `1.20`, while rejecting `12.34`.
- Fastavro accepts physical bytes under a decimal annotation where Apache's
  Decimal-valued writer refuses them. Conversion profiles cannot be conflated.
- Invalid decimal annotations expose parser fallback/refusal differences. An
  accepted schema or write may still fail in a reader. Neither is a validity
  certificate for every codec or every logical value.

The tagged upstream sources explain where to test these boundaries:
[Apache schema validators](https://raw.githubusercontent.com/apache/avro/release-1.12.0/lang/py/avro/schema.py)
and [Apache datum codecs](https://raw.githubusercontent.com/apache/avro/release-1.12.0/lang/py/avro/io.py).
The recorded executions, rather than source inspection alone, support the
observations above. The [Avro specification](https://avro.apache.org/docs/1.12.0/specification/)
defines the declared carrier and logical-type meaning independently.

## Evidence and remaining work

Run `bun scripts/core-ideals/facets-avro-discovery.ts`. The
[native record](../../../../fixtures/validation/facets-avro-discovery-native.json)
contains all codec outcomes and assertions. The
[orchestration record](../../../../fixtures/validation/facets-avro-discovery.json)
records JSON/YAML schema-tree recovery through the existing Avro adapter and
source fingerprints. This recovery preserves native schema trees, not original
whitespace or datum wire bytes. No new browser parity is claimed.

Next implement the internal schema-domain interpreter, then complete public
schemas, classification, authored projection, strict/report losses, exact retained
native-text recovery and ideal recovery. Named dependencies, unions/defaults,
logical refinements and unknown metadata need composed fixtures. Native target
execution, Chromium parity and full binding acceptance remain required. Earlier
accepted bindings retain their historical evidence snapshots as new work begins.

## Internal declaration interpreter

`src/adapters/avro/facet-type.ts` now decodes isolated scalar declarations and
retains the complete tagged native fragment. It reports signed int/long domains,
float carrier widths, unbounded string/bytes, exact fixed-byte size including zero,
and valid decimal pairs with checked signed fixed-byte capacity. None of these
facts asserts codec enforcement, exact input conversion or whole-schema validity.
Names/unions/containers require a separate selection and resolution step.

Unknown schema metadata is listed by escaped JSON Pointer and copied. Unknown
logical meaning, invalid pairs, unsafe or non-integer lexical metadata and future
tagged representation content refuse interpretation. Integer-valued decimal or
exponent spellings are not silently normalized across native parser differences.
Fixed decimal capacity calculations are bounded to 4096 bytes; this is an explicit
interpreter resource limit, not an Avro type limit. Larger ordinary fixed sizes
remain exact declaration metadata without allocating their contents.

Seven Bun tests pass with 332 assertions. Chromium 148 agrees on 84 native fixture
inputs (78 declarations, six explicit refusals), fixed-zero interpretation, three
exact-token refusals, unknown-content copy isolation and zero getter invocations.
There are no external browser requests or Bun/Node globals. Typechecking passes.
The [browser record](../../../../fixtures/validation/facets-avro-type-browser.json)
fingerprints the isolated internal bundle. The public package is unchanged.

The Avro bead remains in progress. Next resolve selected named/union/Field syntax,
then author complete public operation and extension schemas before exporting
classification/projection. Retained ideal/native recovery, composed native target
tests, final browser parity and binding acceptance remain required.

## Native selection checkpoint

`inspectAvroFacetSelection` is internal. It selects only registered native type
paths, retains branch order and use-site fragments, and resolves named references
to separate declaration locations, including dependency identity. A decimal
definition's unknown 9007199254740993 token survives without numeric conversion.
Nullable branches do not become Field omission/default semantics. Distinct integer
widths remain separate observations; arrays/maps retain their explicit item paths.
Recursive records retain a definition link rather than being expanded as scalars.

Facet structural selection explicitly accepts fixed size zero and exact integer
size tokens. The existing Cardinality resolver keeps its earlier positive-size
profile. Tests verify that the new entrypoint does not widen the old one. Missing
references, forward references, duplicate names, default/metadata paths and
malformed numeric tokens refuse; getters never execute.

The ten-fixture corpus produces 20 pinned parser outcomes and 32 cross-codec
sample recoveries. Apache rejects duplicate int union branches while fastavro
accepts them; both reject the forward-reference fixture. UMF selection refuses
both fixtures. The integer-union writers may choose different branch tags despite
equal decoded values, so this is not a wire-byte equivalence claim. All ten native
schema trees, including refused semantic inputs, pass JSON/YAML recovery (20
recoveries). Named dependency trees and defaults remain intact.

Sixteen Bun tests pass with 613 assertions, including prior Cardinality resolver
regressions. Chromium 148 resolves eight fixtures and refuses two, matching Bun,
with no external requests or host globals. Typechecking passes. Evidence:
[native parsers and samples](../../../../fixtures/validation/facets-avro-selection-native.json),
[selection and tree recovery](../../../../fixtures/validation/facets-avro-selection-oracle.json),
[Chromium parity](../../../../fixtures/validation/facets-avro-selection-browser.json).

Next author complete public operation/extension schemas, then implement core
0.5.0 classification and authored projection with provenance, strict/report
residuals and retained original-text/ideal recovery. This checkpoint does not
close the Avro facet binding or qualify native enforcement.

## Experimental classification checkpoint

The public classifier and retained-source verifier/recovery operations now have a
closed operation schema and `umf.avro.facets` 1.0.0 package. They distinguish
declared-schema meaning from pinned writer behavior, preserve native branch and
dependency identity, and require an explicit logical scalar Field. Strict/report
outcomes retain codec limitations, unknown metadata and fixed-length refinements.
Author conflicts and stale/forged receipts refuse. Neither a matching annotation
nor a bare facet label establishes authored provenance or native enforcement.

Chromium 148 passes 148 cases: 100 classified, 48 blocked, 200 exact original
native-text recoveries across JSON/YAML receipts, forged-receipt refusal and zero
getter invocations. It uses the public browser bundle with no host globals or
external requests. The [browser record](../../../../fixtures/validation/facets-avro-classification-browser.json)
contains current fingerprints. Native discovery and selection evidence are reused;
this checkpoint does not claim a fresh independent engine run.

Twenty-six Bun tests pass with 1,548 assertions across five files. Typechecking
passes. The test and typecheck logs are
[classification tests](../../../../fixtures/validation/facets-avro-classification-tests.log)
and [typechecking](../../../../fixtures/validation/facets-avro-classification-typecheck.log).
The schema audit passes 273 schemas and 46 packages. Browser build and optional
PostgreSQL runtime build pass. Earlier accepted bindings retain historical
snapshots after the public bundle change. A full refresh remains part of final
Avro binding acceptance.

Next implement authored Avro facet projection and its complete schema, qualify
emitted schemas/values natively, compose recapture with classification and verify
ideal recovery or explicit residuals. Avro remains in progress; Parquet, the facet
admission/delivery gate and Key also remain required.

### Authored projection native and browser checkpoint

The internal authored projector now has a 558-case matrix spanning 31 carrier
and facet seeds, three writer/declaration profiles, three encodings and both
strict/report modes. It emits 388 record schemas and blocks 170 requests with
explicit residuals. Every emitted schema parses in Apache Avro Python 1.12.0
and fastavro 1.12.2. The native harness exercises 776 writes and 1,552 cross-codec
reads with complete byte consumption. Positive decimals use a coefficient scaled
to the emitted schema; mismatched-scale behavior remains a separate assertion.

The native assertions preserve float narrowing, fastavro int overflow, Apache
decimal coefficient rescaling, physical-byte input, unenforced string maxima and
fixed-length lower bounds. Apache ignores `local-timestamp-micros`: its warning
and integer result are retained alongside fastavro's datetime result. These
observations do not establish host-input conversion equivalence or complete
codec conformance. See the [native results](../../../../fixtures/validation/facets-avro-projection-native.json)
and [emitted targets](../../../../fixtures/validation/facets-avro-projection-targets.json).

Chromium verifies parity for all 558 cases using an internal browser bundle,
including 776 JSON/YAML ideal recoveries, forged-receipt rejection and zero getter
calls, host globals or external requests. See [browser evidence](../../../../fixtures/validation/facets-avro-projection-browser.json).
Typechecking passes; the schema audit passes 274 schemas and 46 packages.
Public exports and the import-only package capability remain unchanged.

Next qualify native recapture/classification composition, then integrate the
public export and refresh public-browser and compatibility evidence. Avro binding
acceptance, facet admission and native equivalence remain unclaimed.
