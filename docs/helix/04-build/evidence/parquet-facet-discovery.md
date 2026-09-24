# Parquet facet native discovery

This checkpoint supports CONTRACT-007, CONTRACT-040, US-043 and TD-043. It uses
synthetic inputs, PyArrow 21.0.0, Parquet writer version 2.6 and the existing
Apache parquet-format specification pin
`219e3f12a62f9476e830c21e26d030d231f7c017`. The runner verifies the vendored
specification fingerprints before execution. No facet binding acceptance,
ideal admission or native equivalence is claimed.

Run `bun scripts/core-ideals/facets-parquet-discovery.ts`. Bun runs the pinned
Python checks and then checks the existing Parquet adapter. `bun run typecheck`
also passes. The [77 authored cases](../../../../fixtures/parquet/facets/discovery-cases.json)
produce 42 accepted Arrow arrays and 80 Parquet files, with embedded Arrow metadata
both enabled and disabled. The files total 39,936 bytes; the evidence refers to
their paths and hashes instead of duplicating encoded file contents.

The [native results](../../../../fixtures/validation/facets-parquet-discovery-native.json)
assert expected acceptance and decoded values separately for Arrow construction
and Parquet writing/readback. The [UMF results](../../../../fixtures/validation/facets-parquet-discovery.json)
verify 160 JSON/YAML recoveries of the original file bytes and native field
metadata. This qualifies existing capture/scalar metadata behavior on this corpus,
not a new facet classifier or author projection.

## Observed boundaries

- Signed and unsigned 8/16/32/64-bit arrays accept the tested endpoints and reject
  adjacent out-of-range integers. Python booleans are rejected. With `safe=True`,
  fractional input `1.5` becomes integer `1` for every tested integer type.
- Binary64 `1.0000000000000002` becomes binary32 `1.0`; `1e40` becomes infinity.
  Binary64 retains the first value. Twenty emitted files have changed typed
  values: eight truncation cases and two float cases, each in two metadata modes.
- Fixed binary length two accepts two bytes and rejects shorter/longer inputs.
  Arrow accepts an empty value at fixed width zero, but Parquet writing refuses
  that representation. Exact fixed length is not an ideal maximum length.
- Decimal(3,2) accepts `1.2` and `1.200`, returning `1.20` without changing the
  mathematical value. It rejects lossy rescaling and precision overflow in the
  tested cases. Decimal128 and Decimal256 boundaries remain explicit.
- Arrow decimal(3,-1) accepts `1000`, but Parquet writing refuses negative scale.
  An Arrow schema is therefore not proof of an expressible Parquet schema.
- Custom maximum-length metadata permits overlength strings and binary values.
  Its retention is not enforcement. Supplementary Unicode is included.
- Physical integer carriers and decimal precision/scale agree with the emitted
  annotations in the tested files. Field ID 37 survives both metadata modes.
  Unknown field/schema metadata survives through embedded Arrow metadata; its
  loss when that metadata is disabled is recorded, not silently reconstructed.

The original file bytes remain attached to the UMF capture in both modes. The
adapter does not invent unknown metadata that the native writer omitted.

## Remaining binding work

Implement qualified facet interpretation and up-classification without inventing
author intent; then authored strict/report projection and both retained recovery
directions. Add malformed/conflicting annotation, unknown refinement, exact numeric
token and container-item selection cases. Run the binding in Chromium and refresh
its compatibility/conformance evidence before acceptance. These scalar writer
examples do not establish arbitrary malformed-file reader behavior, general value
conversion, enforcement by all Parquet readers or full Parquet support.


## Internal declaration interpreter checkpoint

`src/adapters/parquet/facet-type.ts` now interprets isolated decoded scalar
SchemaElements. It identifies signed/unsigned widths, binary32/binary64 carriers,
string, variable/exact binary length and decimal precision/scale with carrier
capacity. Logical and converted annotations must agree; unsupported tokens,
unknown logical parameters, unknown Thrift members and contradictory carriers
refuse. Legacy-only supported annotations remain explicit. The native fragment
is copied intact and unclaimed fields are listed by escaped JSON pointer.

This helper does not select a repeated item, assign core facets, certify a whole
file or prove enforcement. It is internal and is not exported by the public
entrypoint. Declared results always state `enforcement: unverified`.

Four Bun tests pass with 663 assertions, including every scalar declaration in
the native corpus, width/carrier boundaries, decimal capacity, conflicts,
unknown retention, source isolation and getter refusal. Typechecking passes.
`bun scripts/core-ideals/facets-parquet-type-browser.ts` builds the internal
browser module and verifies 90 Chromium cases: 80 declared and 10 unsupported,
with matching outcomes, no host globals, no external requests and zero getter
calls. See the [browser evidence](../../../../fixtures/validation/facets-parquet-type-browser.json).
Public classification, author projection, both facet-level round trips and full
binding qualification remain unfinished.


## Experimental public classification checkpoint

The public API now exposes `classifyParquetFacets`,
`verifyParquetFacetClassification` and `recoverParquetFacetSource`, with a closed
operation schema and the `umf.parquet.facets` extension package. Its current
capability is import/classification only; authored projection is not implemented.
The request requires an explicit schema index, present-non-null-leaf scope,
logical scalar Field identity, strict/report mode, profile and obligation.

Declared-schema classification publishes width or decimal facts while retaining
the native representation. A fixed binary maximum is accompanied by an explicit
residual for its exact lower bound. Unknown key/value metadata, including embedded
Arrow schemas, stays attached and residualized without an enforcement claim.
A PyArrow input profile does not authenticate the producer of a captured file.
Fractional integer truncation and binary32 narrowing cannot satisfy arbitrary
input exactness. Unresolved profiles do not publish interpreted facets.

Array containers and physical wrappers do not become scalars; an explicitly
selected scalar item may be classified in its retained container context.
Existing author facets require a valid source-bound declaration receipt.
Conflicting assertions block both modes; unsupported obligations block strict
mode and remain explicit in report mode. Native byte recovery recomputes the
receipt and rejects forged or stale targets.

Nine Bun tests pass with 744 assertions across the interpreter and public
classification suites. Typechecking, 276 schema/47 package audits and public plus
optional PostgreSQL browser builds pass. Browser verification is recorded in the
subsequent checkpoint when complete. This public-bundle change makes earlier
conformance evidence historical until the required compatibility refresh runs.
No full Parquet facet acceptance or ideal admission is claimed.


The public Chromium classification matrix passes 180 cases: 101 classified,
79 blocked and 202 byte-exact JSON/YAML native recoveries. Forged receipts refuse;
getter calls and external requests are zero. The
[classification browser record](../../../../fixtures/validation/facets-parquet-classification-browser.json)
contains current source/schema/bundle fingerprints and the selected native cases.
This completes the experimental classification checkpoint only. Authored
projection, ideal recovery, composed native/ideal evidence and full compatibility
acceptance remain required.
