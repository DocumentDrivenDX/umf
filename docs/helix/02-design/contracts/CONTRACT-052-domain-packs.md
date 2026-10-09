---
ddx:
  id: CONTRACT-052
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.prd
      kind: informed_by
    - id: umf.architecture
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-051
      kind: informed_by
---

# CONTRACT-052: Portable domain packs

**Type:** schema/library. **Version:** `umf.domain-pack` and `umf.dataset-source` 1.0.0. **Status:** draft.

## Purpose

Describe portable sample-domain metadata while separating UMF-owned schemas
from consumer-owned executable generators, loaders and data tests (FR-45).

## Scope and Boundaries

UMF owns canonical pack structure and tooling to generate that structure.
TableSpec owns fabricated tabular data, CSV archives and ingestion/testing.
Truss and Ashlar own ontological sample data. Pack metadata MUST NOT authorize
imports, expression execution, credential handling or network fetching.

## Normative Surface

The generated structural authority is
[domain-pack/schema.json](../../../../spec/extensions/domain-pack/schema.json),
JSON Schema Draft 2020-12. The document-scoped extension package carries the
same schema. A standalone payload MAY be consumed without a core envelope.

| Field/API | Required | Rules |
| --- | --- | --- |
| `id`, `version` | Yes | Nonempty pack identity; exact numeric three-part version. |
| `generator.id`, `.version` | For synthetic generation | Opaque implementation identity and exact version; only a trusted consumer registry can resolve them. |
| `domain_types` | Yes | Nonempty map with identifier-shaped keys and object definitions. |
| `description` | No | Descriptive text. |
| `sources` | In place of or alongside generator | Nonempty source map using `umf.dataset-source` descriptors; no retrieval implied. |
| `source_bindings` | No | Explicit `schema_id`, `source_id` and `role: rows/reference/terminology`; consumer MUST resolve local identities before execution. |
| `scale_presets` | No | Named `roots` counts and `children` parent/mean/distribution declarations; graph execution and overrides belong to TableSpec. |
| domain type `sample_generation.method` | If generation metadata present | `generate_`-prefixed identifier; consumer MUST explicitly support it before execution. |
| domain type `detection` | No | Retained object; its interpretation is consumer-specific. |
| `schemas` | No | Ordered objects with nonempty `id`, `format`, `reference`; references MUST NOT be fetched implicitly. |
| Unknown fields | Allowed | MUST remain in metadata copies and serialization; structural admission does not establish their execution semantics. |
| `generateDomainPackSchema()` | Library | Browser-compatible, deterministic, isolated schema result. |
| `domainPackSchema`, `domainPackPackage` | Library | Canonical structure and registration data. |
| `domain_pack_schema(version)` | Python | Isolated canonical schema resource; unknown versions refuse. |

### Dataset source extension

`umf.dataset-source` 1.0.0 is independently registerable at document scope.
Its structural authority is
[dataset-source/schema.json](../../../../spec/extensions/dataset-source/schema.json).
Domain packs embed the same generated definition without fetching schema resources.

| Field | Required | Rules |
| --- | --- | --- |
| `kind` | Yes | `synthetic` or `external`: provenance origin, not a claim about whether rows describe real people. |
| `data_kind` | Yes | `fabricated`, `observed`, `deidentified`, `unknown`; an authored declaration, not proof of privacy or realism. |
| `generator.id`, `.version` | Synthetic source | Exact trusted implementation reference; source parameters remain consumer-specific metadata. |
| `reference`, `format` | External source | Nonempty opaque resource reference and format identifier. No source is fetched or interpreted merely by declaration. |
| `revision`, `checksum` | No | Revision identity; checksum uses SHA-256 with a lowercase hexadecimal value. Consumers SHOULD pin source bytes before claiming reproducibility. |
| `license` | No | License identity/reference, attribution/notices and `redistribution: allowed/restricted/unknown`; missing rights MUST NOT imply clearance. |
| `provenance` | No | Publisher, retrieval timestamp text, upstream source IDs and transformation descriptions; opaque descriptions MUST NOT execute. |
| Unknown fields | Allowed | Preserve; qualify their interpretation separately. |

An externally published synthetic fixture is `kind: external` and
`data_kind: fabricated`. A mixed pack declares multiple sources and explicit
bindings, preserving source identities rather than merging records heuristically.
No credentials, authorization headers or credential-bearing references belong in
pack metadata. Retrieval, local source binding, integrity verification, format
conversion and redistribution decisions are explicit consumer operations. Known
structural validation does not certify scientific comparability or reuse rights.
The initial TableSpec reader retains external/mixed declarations but refuses
synthetic generation for external row bindings; its explicit local CSV ingestion path
performs typed ingestion into the shared disk-backed spool without a fabricated
fallback. Before redistribution, that consumer requires pinned SHA-256 bytes
and explicit `redistribution: allowed` for every included local source. This is
an authored rights gate, not an independent legal certification. Arbitrary
retrieval and mixed-data transformation remain outside this execution subset.

## Precedence and Compatibility

Extension version 1.0.0 uses the existing bootstrap extension-package envelope
(`coreVersion: 0.1.0`); tests attach it to current core 0.8.0 documents. The
payload is additive and does not change core semantics. Pack version, extension
version and generator implementation version are distinct. Unknown implementations
or relevant execution properties MUST fail before generation, not select fallback
code. Schema references do not prove native schema validity or interoperability.

## Error Semantics

Malformed known structure is invalid. Duplicate extension registration follows
CONTRACT-001. Unknown implementation/version/method refuses consumer execution;
metadata remains available for preservation. No retry or live service is implied.

## Examples

```json
{"id":"legal","version":"1.0.0","generator":{"id":"tablespec.legal","version":"1.0.0"},"domain_types":{"client_name":{"description":"Fabricated organization","sample_generation":{"method":"generate_client_name"}}},"schemas":[{"id":"clients","format":"tablespec","reference":"clients.json"}]}
```

## Non-Normative Notes

`bun scripts/domain-pack-schema.ts` regenerates canonical artifacts;
`--check` refuses stale output. Consumers may ship a generated snapshot to avoid
requiring an unpublished UMF revision. They MUST identify UMF as its authority
and refresh from the generator, rather than independently editing the schema.
Native schema compilation and value realism are separate consumer evidence.

### Legal pack source and export tooling

UMF owns `spec/domain-packs/legal/pack.json` and its tabular schemas,
including source declarations and scale presets. `scripts/export-domain-pack.ts`
exports those caller-selected local schema artifacts and metadata; `--check`
refuses stale exports. Schema references and symlinks leaving the pack directory
refuse. Dataset references remain opaque. The first native profile is TableSpec
1.0 JSON, using the existing import/export adapter to check exact recovery.
Other format labels are preserved without claiming their compilation support.
TableSpec's bundled snapshots and examples are generated consumers of this source.


### Medical source pack and explicit local-source export

`spec/domain-packs/medical/pack.json` uses the same 1.0.0 metadata contract and
TableSpec schema profile as legal. It declares externally published example
rows without a generator. Exact source files, projected CSV rows, source hashes,
rights notices and unresolved native references remain distinct. FHIR date/time
and decimal spellings that cannot be represented without changing meaning remain
text; full original resource bytes are retained.

`export-domain-pack.ts --include-sources` explicitly copies local external
sources only when checksum-pinned and declared redistributable. Remote references
remain metadata. Source path traversal, escaping symlinks, duplicate destination
paths, stale checksums and uncleared rights refuse. The default schema-only export
remains unchanged. No new domain-pack schema version is needed for this execution
subset. TableSpec archive manifests map original source references to `inputs/`
archive members and schema references to `schemas/` members, separate from
standardized `data/` output; source metadata is
preserved without rewriting its checksums to describe derivative bytes.


### Mixed legal pack 1.1.0

The eight fabricated tables retain their generator, source bindings and scale
presets. Observed `cases`, `evidence_documents` and `evidence_pages` have external
CSV row bindings and original PDF reference bindings. Evidence MUST link through
source-scoped case keys; no fabricated firm/client association is implied.
Original bytes, SHA-256 pins, publisher URLs and publication/discovery qualifiers
MUST survive metadata export. PDF page ordinals MUST NOT be represented as native
transcript page/line citations. Text extraction MUST disclose missing text layers
and its lack of OCR, layout, image and redaction interpretation.

Pack 1.1.0 is additive metadata under extension 1.0.0. Existing generated tables
remain fabricated, including the existing `documents` table and its synthetic
NDA labels. Consumers MUST refuse unsupported full-pack mixed generation rather
than fabricate the observed rows. Explicit ingestion and generation of selected
subsets belong to consumers. Full `--include-sources` export MUST refuse unknown
rights; default schema/metadata export retains those declarations.


### Carrier and terminology expansion — required, not delivered (2026-10-08)

FR-45 now includes the carrier lifecycle. The current medical 1.0.0 fixture
remains a clinical-only qualification. The following obligations govern a future
pack revision; they do not establish new field names or implemented adapters.
US payer terminology is the initial planning assumption, not a global model.

| Area | Meaning the pack MUST preserve |
| --- | --- |
| Payers, plans, enrollment and coverage | Payer versus provider organizations; subscriber versus beneficiary; plan and member identifiers; enrollment and coverage periods; benefit limits and network context. |
| Eligibility | Separate request/response identities, as-of/service dates, response outcome, coverage status and benefit details; an eligibility result MUST NOT imply authorization or payment. |
| Prior authorization | Request, decision, service scope, decision period and reference; approval MUST NOT imply a paid claim. |
| Claims | Header and stable ordered line identities, claim type/use, diagnoses and procedures, coding sequences/modifiers, service dates, quantities, currencies and submitted amounts; replacements/voids retain original links. |
| Adjudication and explanation of benefits | Line/header outcomes, adjustments and denial reasons; billed, allowed, paid and member liability remain separate. Claim, response and patient-facing explanation MUST NOT be collapsed. |
| Payment, coordination and appeals | Remittance/payment allocations, multiple coverage order, appeal decisions and event history remain independently identified; missing source facts remain unknown. |

FHIR (Fast Healthcare Interoperability Resources) R4 4.0.1 is a reference
vocabulary for Coverage, InsurancePlan, CoverageEligibilityRequest/Response,
Claim, ClaimResponse, ExplanationOfBenefit and payment resources. It is not
proof that a selected corpus covers the lifecycle or that UMF implements an
X12 transaction adapter. Native extensions and unresolved references MUST survive.
See [R4 eligibility](https://hl7.org/fhir/R4/coverageeligibilityresponse.html)
and [R4 claims](https://hl7.org/fhir/R4/claim.html).

#### Source selection and access

Evaluate these sources before inventing parallel fixture datasets. Each selected
file MUST have its own revision, byte checksum, provenance, rights review and
rows/reference/terminology binding under the existing source contract. Public
availability MUST NOT imply permission to redistribute embedded terminology.

| Source | Intended use and qualification |
| --- | --- |
| [CMS synthetic Medicare RIF](https://data.cms.gov/sites/default/files/2023-05/d51e1218-68c3-4c7c-9598-0b81f22fe903/User%20Guide%20-%20CMS%20Synthetic%20RIF%20Files%20May%202023_AM508_v2.pdf) | First candidate for enrollment and claims fixtures; the May 2023 guide identifies ICD-10-CM, HCPCS and NDC content. Select exact files and inspect embedded rights before bundling. Synthetic population does not establish commercial payer realism. |
| [CMS DE-SynPUF](https://www.cms.gov/data-research/statistics-trends-and-reports/medicare-claims-synthetic-public-use-files) | Historical 2008–2010 synthetic claims; retain ICD-9-era semantics. MUST NOT relabel as ICD-10 or silently apply a crosswalk. |
| [CMS Blue Button sandbox](https://bluebutton.cms.gov/data/understanding-the-data/) | Synthetic enrollment/claims examples; evaluate as a FHIR-oriented source separately from R4 resource examples. Pin actual payload versions; access and retrieval are explicit consumer work. |
| [CDC ICD-10-CM](https://www.cdc.gov/nchs/icd/icd-10-cm/files.html) and [CMS ICD-10-PCS](https://www.cms.gov/medicare/coding-billing/icd-10-codes) | Diagnosis classification versus inpatient procedure classification; retain release and effective dates. Neither is an alias for international ICD-10. |
| [CMS HCPCS Level II](https://www.cms.gov/medicare/coding-billing/healthcare-common-procedure-system/quarterly-update) | Quarterly alphanumeric code files; retain modifiers and effective periods. Level II MUST NOT be conflated with CPT/Level I. |
| [NLM SNOMED CT US Edition](https://www.nlm.nih.gov/healthit/snomedct/us_edition.html) | Licensed clinical terminology and published SNOMED-to-ICD-10-CM map; consumer-local source by default until redistribution rights are established. Territory and edition matter. |
| [AMA CPT](https://www.ama-assn.org/about/cpt-editorial-panel/faq-editorial-panel-cpt-overview) | Licensed procedure terminology; public CMS references do not grant unrestricted reuse. Consumer-local licensed binding MUST remain possible without bundling descriptors. |

Terminology projections MUST preserve code system identity, edition/release,
code spelling, display provenance, effective/inactive status where supplied,
multiple codings and original bytes. Graph projections MUST retain native
relationships and mapping direction, release pair, conditions and provenance.
Classification membership, clinical subsumption and billing mappings MUST NOT
be treated as the same relation. Unmapped/ambiguous codes MUST remain explicit;
absence from an unavailable licensed dictionary MUST NOT mark a code invalid.
Existing LOINC and UCUM notices and source preservation remain binding.

Exact selected releases, CPT entitlement, SNOMED territory/distribution rights,
source coverage for eligibility/authorization/appeals, and graph binding surfaces
remain unresolved. No licensed content or new CMS rows are bundled by this
requirement amendment. A future versioned pack design must settle these details
before implementation claims or source-inclusive export.


### Epidemiology and imaging/PACS — required, not delivered (2026-10-08)

Treat epidemiology/public health and imaging as composable medical subpacks with
independent versions and source manifests. This is a scope decision, not a new
extension version or delivered pack identity. Their differing units of analysis
justify separate schemas; shared terminology references permit composition.
Splitting epidemiology into a top-level domain remains possible if later consumers
require independent ownership; no duplicate medical terminology is required.

Epidemiological projections MUST retain measure definition (incidence, prevalence,
mortality or other authored measure), case/cohort criteria, geography and boundary
vintage, observation and publication periods, population denominator or person-time,
rate unit, demographic strata, crude versus adjusted method and standard population,
uncertainty and revision provenance where supplied. Suppressed, unavailable,
not-applicable and zero values MUST remain distinct. Aggregates MUST NOT imply
individual clinical records; claims utilization MUST NOT imply disease incidence.
Cross-source joins require compatible definitions and explicit mappings rather
than inferred comparability. Evaluate [CDC WONDER](https://wonder.cdc.gov/wonder/help/faq.html)
first for a bounded public aggregate fixture, recording the query and export bytes.
Its [mortality documentation](https://wonder.cdc.gov/wonder/help/mcd.html) qualifies
denominators and suppression; its [data-use policy](https://wonder.cdc.gov/datause.html)
prohibits identification attempts. Broader surveillance, survey weights and
international sources remain separate qualification work.

PACS is a system category; DICOM (Digital Imaging and Communications in Medicine)
is the native imaging standard. A pack MUST distinguish patient/study/series/SOP
instance identifiers, modality, acquisition metadata, ordered sequences and frame
context. Preserve value representations, multiplicity, transfer syntax, private
and unknown tags and original object bytes through retained sources; a flattened
CSV cannot stand in for the original object. Binary objects use explicit local
source descriptors/checksums or opaque references, never implicit downloads.
DICOM JSON is a metadata projection with native rules, not ordinary arbitrary JSON;
see [DICOM Part 18 Annex F](https://dicom.nema.org/medical/dicom/current/output/chtml/part18/chapter_F.html).
Pin the exact DICOM edition when selecting fixtures rather than claiming the
moving current publication as a tested version.

Evaluate a small open-access [TCIA collection](https://www.cancerimagingarchive.net/data-usage-policies-and-restrictions/)
for metadata and unchanged binary fixtures, retaining collection DOI/version,
collection-specific license and citation. Deidentification is a source declaration,
not proof: private tags and burned-in pixels require separate evaluation before
redistribution. The current medical pack's exclusion of DICOM content remains
binding until the selected source's rights and preservation checks qualify it.
Metadata retention, DICOM parsing, pixel decoding, image rendering, DICOMweb and
live PACS integration are separate support claims; none is established here.
Clinical/claim/imaging links MUST retain source namespace and linkage provenance;
unavailable patient linkage stays unresolved rather than matching on demographics.

Exact epidemiology dataset/query, imaging collection/edition/object subset,
binary archive policy and downstream graph bindings remain design unknowns.

## Medical projection surface — US-055, library 1.0.0

The public index exports the following pure, browser-compatible operations.
These interpret selected metadata only; they MUST NOT fetch references, read
native binary objects, infer clinical coding equivalence or execute source content.
The generated TableSpec schemas under each `spec/domain-packs/medical-*/umf/`
are the structural authority for emitted fixture tables. Pack identity/version
and projection/library profile remain distinct from extension 1.0.0.

| Operation | Input | Result and rules |
| --- | --- | --- |
| `projectMedicalFhir(inputs, namespace)` | Ordered `{source_id,text}` resources; identifier-shaped namespace. | `MedicalTables`: named arrays of scalar/text/null `MedicalRow` views. R4 resource IDs and source identities MUST be unique within this call. Original text stays in `resources.resource_json`; numeric tokens and temporal spellings are text. |
| `projectCdcMortality(text, sourceId)` | Exact selected CDC bi63-dtpu JSON row array; nonempty source ID. | Measure rows preserve native fields/fragments. Population denominator and uncertainty stay unavailable; adjusted rates MUST NOT be used to reconstruct them. This specific dataset profile is not a generic epidemiology parser. |
| `projectDicomMetadata(text, sourceId)` | One DICOM JSON dataset object and nonempty source ID. | Instance and recursive attribute views preserve original text, tag/VR, ordered sequence paths, exact fragments, InlineBinary and opaque BulkDataURI. Required single study/series/SOP UIDs MUST exist. No binary parsing or pixel interpretation. |
| `lookupMedicalTerminology(query, records?)` | Exact `{system,release,code}` query; optional caller-supplied array of records with those identities. | Copied matching records with `matched`, `not-in-subset` or `source-unavailable`. Unknown record fields survive. Missing source or unmatched code MUST NOT imply invalidity. No release guessing, dictionary download or inferred mapping. |

`MedicalTables` maps table names to ordered row arrays; `MedicalRow` values are
strings, booleans or null. Missing projected native fields become null, while the
retained original keeps native absence distinct from explicit null. Native JSON
fragments are exact rendered trees, not host-number conversions. Resource keys
use `namespace::ResourceType/id`; references resolve only exact relative native
keys within that call. Absolute URLs, contained-resource fragments and absent
local targets remain unresolved with their native spelling retained. Resource
and line source paths are view identities, not durable identity across edits.

Nested Claim/ExplanationOfBenefit lines and ClaimResponse details retain ordered
sequence and parent paths; line and adjudication fragments keep unprojected meaning.
Top-level totals, benefits, insurance and native relationships retain full fragments.
Unknown resource types remain in resources/codings/references without gaining
specialized table semantics. Nonconforming known selected shapes refuse; broader
FHIR, DICOM IOD/VR semantics and source comparability remain unvalidated.

Malformed JSON, duplicate keys, invalid required identities, invalid selected
array/scalar shapes, duplicate line sequences and malformed local terminology
records MUST refuse without returning a partial projection. Shared native JSON
limits apply. Terminology inputs use the accessor-safe core copier; callbacks,
getters and executable metadata MUST NOT be invoked. Empty lookup releases refuse.

Example: an exact local lookup for ICD-10-CM `A00` in
`FY2026-2025-10-01` succeeds only against matching supplied records. A query for
another release yields `not-in-subset`; an absent dictionary yields
`source-unavailable`. Neither outcome is a code-validation judgment.

US-055 delivers independent carrier, epidemiology, imaging and terminology 1.0.0
packs. Medical clinical 1.0.0 remains byte-stable. Supplemental carrier resources
are FHIR-shaped authored examples, not full native-conformance evidence. CMS
claims rows, complete terminology dictionaries/maps, TCIA images, live PACS/X12
and native graph-engine consumers remain separately required and unimplemented.
See [scoped execution evidence](../../04-build/evidence/medical-subpacks.md).
### Public dataset schema profiles

The first public packs use the same 1.0.0 metadata contract and authored
TableSpec 1.0 JSON schema format:

| Pack | Declared profile | Schemas |
| --- | --- | --- |
| `nyc-tlc` | Yellow dictionary 2025-03-18; January 2025 row reference | Yellow trips and taxi-zone lookup |
| `movielens` | Fixed `ml-32m` release generated 2023-10-13 | Movies, links, ratings, tags |
| `noaa-ghcn-daily` | GHCN-Daily documentation 3.35 | Stations, monthly `.dly` records, inventory |
| `gtfs-schedule` | Basic fixed-stop Schedule fields at commit `3c9e7b904b5035349622f03e11851e25c16d1d99` | Agency, stops, routes, trips, stop times, calendar, calendar dates |

Each pack retains `profile` as descriptive consumer metadata. Documentation
sources have SHA-256 fingerprints and `role: reference`; row sources and their
bindings remain separate. Documentation checksums MUST NOT be interpreted as
row-data pins. No source bytes are bundled. GTFS's unresolved feed URN MUST NOT
be treated as a selected agency dataset or executable loader reference.

Pack schemas describe authored carriers, not automatically derived Parquet
physical types or complete source-instance validators. Taxi trip identities
are not invented; nullability is explicitly permissive. MovieLens identifiers
retain text where leading zeros matter, and no user entity is fabricated.
GHCN retains all 31 monthly slots, source integers, missing sentinels and flags.
GTFS retains service-day times and dates as text; conditional and union
references remain explicit profile descriptions instead of false foreign keys.
Unlisted source fields/files MUST remain in retained input or produce explicit
loss reporting. No source parser, cross-system equivalence or row rights
clearance follows from structural admission or native schema recovery.

`scripts/public-dataset-packs.ts` deterministically generates the four packs;
`--check` refuses stale artifacts. Existing export/check and microsite catalog
tooling consume them without a new extension version or generator registry.


Private workspace processing is distinct from redistributable archive export.
A consumer MAY admit checksum-pinned sources with unknown redistribution rights
when the operator explicitly selects local-use processing; it MUST retain rights
status and record that policy in run evidence. Restricted sources MUST refuse.
This selection MUST NOT mark rights cleared or permit redistributable source ZIP
export. Mixed processing MUST generate only synthetic bindings through a trusted
generator, ingest observed bindings unchanged and refuse unresolved bindings or
cross-boundary references before target writes.
