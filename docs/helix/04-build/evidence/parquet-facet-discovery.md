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
