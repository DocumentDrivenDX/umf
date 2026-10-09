# Medical subpacks — scoped execution evidence (2026-10-08)

US-055 / TD-055 / STP-055 realize a bounded first delivery of FR-45 and
CONTRACT-052. The baseline is `e3555b9a`; the committed changes include exact
content fingerprints in [the machine record](../../../../fixtures/validation/medical-subpacks-evidence.json).
Medical clinical 1.0.0 remains unchanged apart from README links to siblings.

## Delivered corpus

| Pack 1.0.0 | Tables / rows | Sources and scope |
| --- | --- | --- |
| medical-carrier | 12 / 306 | Nine unchanged official HL7 R4 4.0.1 resources, nineteen separately authored FHIR-shaped supplements and four workflow events. |
| medical-epidemiology | 2 / 14 | Twelve observed CDC/NCHS aggregate mortality records, two separate fabricated zero/suppression cases. |
| medical-imaging | 2 / 25 | One authored synthetic DICOM object, instance view and 24 recursive attribute rows, including a private sequence. |
| medical-terminology | 2 / 18 | Twelve unchanged selected ICD-10-CM FY2026 October 2025 order-file lines and six system/access descriptors. |

Carrier views distinguish plan/enrollment, coverage/benefits, eligibility,
authorization claims, claims/ordered lines, adjudication, explanation of benefits,
payments and allocations. Fabricated events exercise coordination, an appeal
history and a signed payment adjustment. Official examples do not form a coherent
longitudinal history; their amounts and unresolved references are not repaired.
Keys are namespace-local; published and supplemental resources never merge by ID.

The epidemiology source is CDC dataset bi63-dtpu (rowsUpdatedAt 1571926785),
selected with `$limit=12&$order=year,state,cause_name`. Metadata identifies age-adjusted
rates per 100000 using the 2000 US standard population. Denominators and uncertainty
are absent from these rows and remain unknown. ICD-10 mortality groups are not
relabeled ICD-10-CM diagnoses. Zero/suppression cases are fabricated supplements,
not extra CDC observations or reconstructed suppressed counts.

DICOM binary bytes and metadata are separate sources. Native DS values `1.2500`
and `2.5000` become 1.25 and 2.5 in pydicom's JSON projection; this is explicitly
reported in pack qualification, with original spelling retained in the binary.
File metadata and the preamble remain in that original. The image is a 4x4 byte
ramp with synthetic identifiers, not a patient/acquired image. No pixel decoding,
complete IOD conformance, live PACS or DICOMweb behavior is claimed.

Terminology records preserve system, release, code, billability and native lines.
The selected release is historical, not FY2027 or the April 2026 amendment. Exact
caller-local lookup keeps releases distinct, retains retired/unknown record fields
and returns source-unavailable or not-in-subset without declaring a code invalid.
No SNOMED CT/CPT dictionary, SNOMED-to-ICD map or billing equivalence is delivered.

## Source and rights evidence

[HL7 R4 licensing](https://hl7.org/fhir/R4/license.html) covers HL7-owned examples;
third-party rights remain separate. The selected carrier sources have no explicitly
identified SNOMED CT/CPT/CDT content. HL7's
[example USCLS system](https://hl7.org/fhir/R4/codesystem-service-uscls.html) identifies
its content as an example set. Unqualified native codes retain their absent system;
no clinical dictionary meaning is inferred. Project-authored supplements have
explicit redistribution notices and fabricated provenance.

CDC mortality metadata declares USGOV_WORKS. CDC attribution, lack of endorsement
and availability without charge are included in epidemiology and terminology
notices under [agency-use guidance](https://www.cdc.gov/other/agencymaterials.html).
The [ICD-10-CM public-domain publication](https://stacks.cdc.gov/view/cdc/148699)
informs the selected NCHS-file rights declaration; source ZIP/member, selection and
SHA-256 remain explicit. These declarations do not grant rights to international
ICD editions, third-party codebooks or unrelated vocabulary content.

CMS RIF/Blue Button and TCIA remain reference candidates. A trial TCIA metadata
endpoint returned non-JSON content; no TCIA metadata, images or rights clearance
were invented. SNOMED CT/CPT are reference-only until a caller supplies an entitled
local record subset and exact release. Source metadata never authorizes retrieval.

## Executed checks

- Bun 1.4.2: domain-pack and acceptance-ledger regression passed (14 tests);
  exact lexemes, duplicate keys/line sequences, namespace collisions, accessor
  refusal, suppression/zero, private sequence, source rights and tampering covered.
- TypeScript 7.0.2 portable/tooling checks and browser build passed. All 61 extension
  packages and 349 canonical JSON schemas passed their existing audits.
- Chromium 153.0.8010.12 / Playwright 1.63.0: 32 public-library metadata,
  JSON/YAML recovery and projection checks passed with no Bun/process globals.
- TableSpec Python 3.12.15: all four packs ingested, verified and archived; 18
  tables / 363 rows matched independent typed source reads. Two archives per pack
  were byte-identical; schemas, every included original and archived rows recovered.
  Tested TableSpec checkout: `6914b6ecadd363be00b32cdd2e0e11d0761c2be2`; installed
  package metadata identifies `0.0.6.post6.dev0+d2ee70a`. No consumer files changed.
- pydicom 3.0.2 / Python 3.13.16: 14 native assertions passed for UIDs, transfer
  syntax, private VR/sequence, DS spelling, raw pixel bytes and JSON projection.
- Explorer rebuilt to six packs / 41 entries; real Chromium passed the existing
  navigation suite plus all eighteen new schema selections. The new catalog is
  checked in; no website deployment occurred.
- Deterministic pack regeneration, current 448-criterion acceptance inventory and
  `git diff --check` passed. Distributables are under `fixtures/domain-packs/`.

The machine record fingerprints portable code, builder/oracle/harness code, each
pack/source/schema/row file and distributable archives. Qualification is content
and version specific; archive hashes describe archives, source hashes still describe
original source bytes.

Initial checks exposed an incorrect test expectation (`10.0` versus the source's
`10.00`) and a TypeScript test narrowing error; both were corrected without altering
native data. The first browser launch could not bind loopback inside the sandbox;
permitted local execution passed. A traceability scan exceeded Bun's default 5s
limit during concurrent verification; the 20s scoped gate passed. Locked dependencies
were installed before typechecking; no lockfile change was needed. Native ICD-10-CM line bytes use
CRLF; Git attributes preserve those pinned bytes and recognize their CR line
endings instead of normalizing them to satisfy whitespace checks.

## Usage and remaining requirements

Run `bun scripts/build-medical-subpacks.ts --check` to verify generated artifacts.
Export a selected pack through the shared `export-domain-pack.ts` with explicit
source inclusion. TableSpec owns ingestion/archive/loading; the evidence oracle
can recreate archives with `--output fixtures/domain-packs`. The native DICOM
oracle requires an explicit pydicom environment and `--dicom-only`.

The full carrier requirement remains broader: CMS native rows, licensed full
terminologies/maps, TCIA collection qualification, production adjudication,
clinical conformance and Truss/Ashlar graph-engine adoption require separate gates.
No full-repository regression, database/warehouse/Sail/Spark replay, live patient
linkage or universal native equivalence is claimed by this scoped evidence.
