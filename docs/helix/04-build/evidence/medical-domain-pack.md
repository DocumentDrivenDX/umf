# Medical domain pack — scoped evidence (2026-10-08)

The medical pack extends CONTRACT-052 and the legal pack's shared export and
consumer paths. The upstream default is `origin/master` (there is no
`origin/main`); this checkout merged that branch before implementation.

## Corpus and rights

`spec/domain-packs/medical/pack.json` pins 17 unchanged HL7 FHIR R4 4.0.1 example
resources and eight CSV projections: resources, organizations, patients,
practitioners, encounters, observations, medications and resource_references.
Every local source has SHA-256, provenance, redistribution status and notices.
These are official illustrative synthetic examples, not real patient records.

HL7-owned examples are CC0; third-party terminology rights remain separate.
The curated subset excludes SNOMED CT, CPT, CDT, DICOM and proprietary RxNorm
content. LOINC attribution and UCUM notices accompany the original symbols.
See `licenses/NOTICE.txt` and source-level rights references. CMS Blue Button and
DE-SynPUF are reference-only with unknown redistribution clearance. No CMS rows
are included. Rights declarations are evidence-based metadata, not automated
legal opinions or population-comparability guarantees.

## Shared implementation and preservation

The existing exporter optionally includes rights-cleared, checksum-pinned local
sources with `--include-sources`. Default schema export remains compatible.
Traversal, escaping symlinks, missing rights and changed bytes are refused.
No download occurs implicitly. TableSpec's shared `sample-data ingest` consumes
these CSV row bindings, using the existing spool, constraints, archive, loader
and independent readback verification. Generated legal packs retain their path.

Archives contain normalized data CSV plus unchanged originals under `inputs/`;
the manifest maps source references to those paths and schema references to
`schemas/` members. Clinical time literals,
exact decimal text, coded units and resource JSON preserve native meaning.
Resource keys include type; reference rows retain native references and nullable
local targets. This selected corpus has only locally resolved references;
unresolved-reference representation is supported without fabricating targets.
Medication examples describe a resource, not an inferred order or administration.

## Validation scope

Bun domain-pack tests: 6 passed, 141 assertions. TypeScript typecheck and canonical
schema audit passed (61 packages, 349 schemas). Chromium 153.0.8010.12 passed
12 metadata and JSON/YAML preservation checks. Tests include exact original
bytes, all source hashes, native schema recovery, prohibited terminology screening,
rights refusal and changed-source refusal. TableSpec final medical/archive/engine/legal regressions passed (111 tests); local Sail
0.6.6 and Spark 4.0.1 medical load/readback/replacement passed (2 engine cases).
Ruff and Pyright passed, and governing documentation checks passed (15 tests).
The complete TableSpec `make check` gate passed: 3,976 tests and 112 skips
in 1,117.18 seconds. Final review then strengthened shared Decimal bounds,
uniqueness, foreign keys and 38-digit spool precision; final focused regressions
and repository format/lint/type gates verify those changes. Schema admission
uses UMF's existing loss-refusing reader, including duplicate-key and rounded-number
refusal. No remote warehouse was
contacted; workspace permissions, live workspace ingestion and full FHIR clinical
conformance are outside this evidence.

The generated distributable is `fixtures/domain-packs/medical-1.0.0.zip` (51
projected rows across eight tables), built through the shared TableSpec CLI.

An optional broad Bun run was stopped after 1,000+ passing tests and four
unrelated failures: the unchanged acceptance ledger expects 433 criteria but
merged upstream documents contain 442; three JSON Schema/Protobuf projection
cases require the absent `.venv/bin/python` oracle or its compiler integration.
This is not a passing full-suite claim. Native adapters and ledger files were
not changed by this pack. The complete domain-pack/type/audit/browser gates above
remain the qualification for this change.

The required LOINC Section 10 notice is bundled as
`licenses/LOINC_short_license.txt` and is visible on the archive/pack README
pages. The refreshed license was checked against its 2026-08-06 publication.
