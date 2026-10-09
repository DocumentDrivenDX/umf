---
ddx:
  id: EVID-DOMAIN-CATALOG
  type: implementation-evidence
  activity: build
  status: active
  links:
    - id: SD-026
      kind: informed_by
    - id: CONTRACT-053
      kind: informed_by
    - id: FEAT-009
      kind: informs
---

# Domain catalog first-release evidence

The completed legal and medical implementations were integrated from origin/master
(e3555b9a). Their schemas and source rows remain the baselines. All sixteen packs
now declare a UMF 0.8.0 ontology target alongside their TableSpec tables. Fourteen
new authored synthetic packs are commerce, supply chain, cybersecurity,
manufacturing, payments, education, transit, real estate, energy, HR, MarTech,
construction, ecology/water management and archaeology.

## Delivered design and tools

CONTRACT-053 defines opt-in schema targets and trusted component replay. UMF owns
metadata, schema admission/export, ontologies and the explorer. TableSpec owns the
existing disk-backed spool, typed CSV ZIP format and sink pipeline. Replay uses
1/10/100 independent components for small/demo/large; seed/component-qualified
PK/FK identities include journals, source events and typed scientific evidence.
Reviewed domain queries execute only in tests, never from artifact-provided SQL.

The exporter retains every local schema including ontology bytes. Source selection
is explicit; mandatory row inputs remain pinned. Schema/source admission hashes
are checked during copying before atomic ZIP publication. Independently supplied
legacy generation schemas must correspond to profiled pack schemas; legacy packs
without execution profiles keep their earlier metadata-only behavior.

Graph companions project the actual generated archives, with exact archive/schema
hashes, dataset origin/seed and original/derived source metadata. Admission verifies
core schema validity and declared field/key/relationship semantics, complete
archive correspondence, included inputs and exact bounded replay derivation. It
refuses forged types, descriptors, bindings, source bytes, profiles and fixed
medical run provenance. Graph values preserve CSV lexical carriers. These are
portable schema-targeted candidates, **not** canonical UMF Value serialization,
Truss native storage IDs, Ashlar intake acceptance, OWL reasoning or native-standard
conformance. Those consumer bindings remain explicit follow-up work.

## Domain distinctions

Every authored inventory has typed fields and relationships, positive outcomes and
retained counterexamples. Scenarios include partial fulfillment/refund, split lot
shipments/temperature excursions, failed-login/new-device sequence, alarm/intervention/
resumption, partial payment return and journal imbalance, missing assessment results,
service-day times beyond midnight, sequential listing prices, meter replacement and
outage gaps, multiple applications, consent withdrawal/last-touch attribution and
approved downstream construction changes.

Ecology includes connected reaches, temperature/dissolved oxygen, benthic counts
with same-event effort, censored nitrate, non-detection, unresolved site matching,
methods/matrix/fraction, taxonomic rank and separate fishing effort. Archaeology
includes context/find/sample lineage, competing attributed dating with basis and
typed evidence, disputed stratigraphic assertions, distinct specialist denominators,
asset subject links and exact asset source/revision/hash. Media is authored text/SVG;
no original Madaba Plains content or actual excavation photography is claimed.

## Reproduction and scoped checks

UMF host commands:

```sh
bun scripts/domain-packs/build-catalog.ts
bun scripts/domain-packs/build-datasets.ts
python3 scripts/domain-packs/verify-graph-fixtures.py
bun test tests/domain-packs tests/traceability
bun run typecheck
bun run test:schemas
bun docs/helix/05-deploy/microsite/build-explorer.ts
UMF_EXPLORER_URL=http://127.0.0.1:4186 bun docs/helix/05-deploy/microsite/verify-explorer.ts
```

`build-datasets.ts` uses `TABLESPEC_PYTHON` or the local TableSpec virtualenv. Export
consumer schemas with `scripts/export-domain-pack.ts --pack ... --output ...
--include-sources`. TableSpec's `sample-data replay --domain-pack ... --scale demo
--seed 42 --output ...zip` and fixed-source `sample-data ingest --pack ... --output
...zip` use the existing packaging path.

Scoped results: 26 Bun domain/traceability tests; 61 extension-package and 349
canonical-schema audits; TypeScript/build and 42 Python package tests; all sixteen graph companions and refusal
controls; 17 Chromium checks across all sixteen packs and 236 explorer entries.
TableSpec broader no_spark unit selection passes **2029 tests** (1118 deselected), including all fixture fields,
small/demo/large counts, deterministic archives, source/schema custody, typed
readback and independently restored per-component semantic queries. All fourteen
new domain scenarios pass the final local Sail 0.6.6 run (14 cases), including
repeated replacement and native queries. The original combined Sail/classic Spark
batch was interrupted after stalling; it is not release evidence for complete
classic Spark qualification. The earlier medical Spark evidence remains scoped
to that delivered baseline.
TableSpec's comment-refresh omission on Sail remains explicitly qualified.

Astra ultra reviewed the plan before implementation and re-reviewed the resulting
contracts, fixtures and producer/consumer boundaries. Findings and corrections are
recorded in SD-026. Broader repository failures outside the domain-pack scope are
reported separately; scoped passing checks do not imply global conformance.

The full UMF Bun run completed with **2136 passed and 25 failed** (2161 tests).
Failures were outside the domain-pack tests, in source-to-target mapping,
Protobuf source operations, native evidence fingerprints and the Cardinality,
Facet, Key and Nullability evidence/admission gates. This release does not claim
that the complete repository suite passes.

UMF PR #9 merged at `53049c712cdb4377b95950454b355b1066b4b094`.
GitHub Pages deployment run `37866865323` succeeded. The public explorer at
`https://documentdrivendx.github.io/umf/explorer.html` then passed all 17 Chromium
checks, including navigation of every schema and ontology target in all sixteen
packs (236 entries).

## Remaining qualifications

Component replay scales counts, not independent topology, time span, scientific
effort or calibrated distributions. AC5 remains partial. New packs contain authored
synthetic corpora; third-party native/open corpora and realism remain unqualified,
so AC7 remains partial. Per-story STPs retain those boundaries and archaeology
AC9–11 separately. Existing official FHIR originals and medical literal preservation
remain qualified by the medical evidence. Further graph intake and domain-source
mapping work must preserve unknown native content and explicit loss diagnostics.

Final Astra ultra recheck reports no material unresolved finding within the reviewed
first-release scope; its independent three-domain subset passed 20 scenario checks
and 9 consumer tests, and the fixed-medical forgery control refused as expected.
