# Medical CSV sample archive

Graph candidate coverage is declared in [graph-candidates.json](graph-candidates.json).
Each candidate pins its original source pack, archive and ontology bytes. Retained
snapshots in `source-packs/` preserve those bytes when the current pack changes;
they are provenance inputs, not replacements for the current pack. The local
`scripts/domain-packs/verify-graph-fixtures.py` audit checks every declared candidate,
refuses missing or undeclared fixtures, and reports packs without candidate data.
Historical candidates do not qualify a newer pack revision or a native graph consumer.

[Download medical 1.0.0](medical-1.0.0.zip): 17 official HL7 FHIR R4 resources,
51 projected rows across eight tables. Original sources, hashes, schemas and
notices are included. See the [pack documentation](../../spec/domain-packs/medical/README.md)
for scope and source-specific terms. CMS rows are not bundled.

## LOINC notice

This material contains content from LOINC (http://loinc.org). LOINC is copyright
© Regenstrief Institute, Inc. and the Logical Observation Identifiers Names and
Codes (LOINC) Committee and is available at no cost under the license at
http://loinc.org/license. LOINC® is a registered United States trademark of
Regenstrief Institute, Inc.
