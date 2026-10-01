# Parquet relationship binding acceptance

This implements `umf-803a5916` under [TD-045](../../02-design/technical-designs/TD-045-relationship.md)
and [CONTRACT-041](../../02-design/contracts/CONTRACT-041-relationship.md).
The qualified profile uses PyArrow 21.0.0 and Parquet 2.6 write/read evidence.
It does not establish relationship ideal admission, native graph enforcement,
all-five delivery or native equivalence.

`classifyParquetRelationships` observes checked physical groups and leaves,
including definition/repetition levels and original field fragments. It retains
all native bytes, physical field IDs, embedded Arrow metadata and unknown content.
It never infers target identity or authored relationship intent from nesting,
field IDs or metadata. Strict mode blocks; report mode retains the observations
and explicit semantic residuals. Uncheckable schemas and occupied extension slots
block without overwriting source content. Receipt recomputation and target checks
protect recovery from stale or inconsistent retained content.

`projectRelationshipToParquet` accepts verified core 0.7.0 relationship authoring
and an ordered target Key component mapping. The explicit `target-key-record`
profile emits a required nested group, optional group, or LIST of required groups,
with deterministic physical field IDs. Its common ASCII naming profile uses the
primitive labels boolean/int/long/float/double/bytes/string, mapped to Parquet
BOOLEAN/INT32/INT64/FLOAT/DOUBLE/BYTE_ARRAY/UTF8. Core Key validation independently
limits admissible scalar families. Namespace and named key-record labels are
explicit residuals because physical Parquet groups do not implement them.

Graph identity, target existence, reverse multiplicity, distinct-record
participation, lifecycle, presentation, facets, unknown qualifiers and complete
source content remain retained residuals. Heterogeneous endpoints, association
records and mismatched Key mappings refuse atomically. Strict mode emits no
partial target. Report mode emits an empty schema file; this API does not write
rows or convert runtime values. Verified receipt recovery returns the exact ideal
or native archive, including after a fresh native import and classification.

The 48 strict/report cases produce 16 emitted carriers and 32 blocks. PyArrow
independently reads all 16 schemas, checks component field IDs and optionality,
and writes/reads duplicate or dangling key values without a target collection.
The list and optional cases also retain empty lists and null groups. Chromium
checks all 48 cases, 32 ideal recoveries, 32 native recoveries, 32 classification
recoveries and 32 forged/stale refusals. No external browser requests or host
runtime globals are used. Native and browser evidence includes source hashes.

Evidence: [native](../../../../fixtures/validation/relationship-parquet-native.json),
[browser](../../../../fixtures/validation/relationship-parquet-browser.json),
[scoped regression log](../../../../fixtures/validation/relationship-parquet-regression.log).
The scoped regression passes 117 tests across 11 files, with 7,174 assertions
and zero failures; it includes existing Parquet Field, Nullability, Cardinality,
Facet and Key checks. The final focused suite passes 50 tests / 299 assertions.
Typechecking, browser build and the local 327-schema / 56-package audits pass. The broader repository acceptance and separate relationship
admission gate remain separate from this qualified binding result.
