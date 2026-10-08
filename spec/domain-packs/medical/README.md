# Medical 1.0.0

A bounded official HL7 FHIR R4 4.0.1 sample corpus using the same domain-pack
contract and TableSpec schema profile as the legal pack. UMF owns this metadata,
the schemas and export tooling. TableSpec owns row ingestion, archive generation,
loading and data tests. This pack has external CSV row bindings and no generator
or population scale presets; fixture counts describe the published corpus.

There are 17 original resources: two patients, two practitioners, three
organizations, one encounter, eight observations and one medication. The resource
index and reference projection bring the tabular representation to eight tables.
Original JSON bytes are retained both in `sources/` and `resources.resource_json`.
Resource keys use `ResourceType/id`. Quantities and clinical date/time literals
retain source spelling; coded values and units are not converted. The selected
references resolve locally; the reference schema also represents unresolved
references with a null target, without invented resources.

Export the consumer snapshot through the shared tool:

```sh
bun scripts/export-domain-pack.ts --pack spec/domain-packs/medical/pack.json --output /path/to/tablespec/examples/medical --include-sources
```

Add `--check` to verify exact snapshot bytes. In TableSpec, use
`tablespec sample-data ingest --pack examples/medical/domain-pack.json --output /tmp/medical.zip`.
The shared CLI validates pinned inputs and all tabular constraints before output.
Archive manifests map both schema and source references to their ZIP members.

Redistribution declarations are specific to the selected examples. HL7-owned
content is CC0; embedded LOINC/UCUM content carries separate notices. See
`licenses/NOTICE.txt`, source metadata and the governing implementation evidence.
This subset excludes restricted terminology. CMS sources are reference-only
with uncleared redistribution status; their rows are not bundled. These examples
are illustrative, not a validated clinical simulation or FHIR Bundle.

## LOINC notice

This material contains content from LOINC (http://loinc.org). LOINC is copyright
© Regenstrief Institute, Inc. and the Logical Observation Identifiers Names and
Codes (LOINC) Committee and is available at no cost under the license at
http://loinc.org/license. LOINC® is a registered United States trademark of
Regenstrief Institute, Inc.
