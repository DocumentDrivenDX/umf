# medical-carrier 1.1.0

9 unchanged official HL7 carrier resources and 19 authored supplemental FHIR-shaped resources, plus four workflow events; 13 unchanged CMS DE-SynPUF native CSV records (three beneficiaries, five inpatient and five carrier claims).

Illustrative sources are not a validated FHIR Bundle or carrier simulation. Native official examples do not form a coherent history. CMS coverage is DE-SynPUF Sample 1, 2008 beneficiaries and 2008–2010 claims; ICD-9 remains native. Numeric CPT/Level I HCPCS carrier rows are excluded. These are synthetic public samples, not real beneficiaries. X12 services are not implemented. Reference resolution is namespace-local; no patient matching.

Use the shared `export-domain-pack.ts --include-sources` command with this pack, then TableSpec `sample-data ingest`. Sources and schemas are local and checksum-pinned. Remote/licensed references remain metadata.

See `licenses/NOTICE.txt`, source provenance and [governed evidence](../../../docs/helix/04-build/evidence/medical-subpacks.md).
