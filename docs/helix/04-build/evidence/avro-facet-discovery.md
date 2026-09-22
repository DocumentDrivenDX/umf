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
