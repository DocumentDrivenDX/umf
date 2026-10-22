---
ddx:
  id: umf.sdk-release-notes-0.5.0
  type: release-notes
  activity: deploy
  status: reviewed
  authoring:
    home: repo
  links:
    - id: umf.implementation-plan
      kind: informed_by
    - id: ADR-005
      kind: informed_by
    - id: CONTRACT-080
      kind: informed_by
    - id: CONTRACT-079
      kind: informed_by
---

# UMF SDK 0.5.0

## Release Scope

The current-core metamodel cutover generates JSON Schema, TypeScript types,
portable validation programs, Python resources and ontology/reference data from
`spec/metamodel/umf.yaml`. Current APIs accept core 0.10.0. The SDK archive and
Python host wheel are separate release assets with exact delivery checksums.
Actual native qualification and installed-archive checks passed for the frozen
consumer. The release delivery receipt records exact asset hashes, source identity
and the separately verified HTML deployment. Official core Python 0.9.0 is also
available as a release wheel; no PyPI publication is claimed.

## Highlights

- One authored language model replaces competing core definitions and old core
  transition dispatch. Bounded generic interpreters execute generated programs.
- One Schemas entry point contains the graphical ontology, object reference and
  model catalog. Keys, required values, rules and related API members are directly
  discoverable. Examples and Workbench use YAML by default with JSON controls;
  schema and catalog disclosures start collapsed.
- The generated Python access API supports tables and ontologies through the
  same application interface. Its host adapter remains a separate experimental
  wheel; generated application packages require only Python's standard library.
- Unknown metadata and native meaning remain preserved or explicitly refused.
  Missing semantic registries do not become a claim of complete interpretation.

## Required Actions

Install the attached SDK archive and regenerate consumers for the current core.
The TypeScript SDK is distributed through GitHub assets, not npm. The reusable
schema browser is separately published as
`@documentdrivendx/umf-schema-browser@2.0.0`. Table hosts install the attached
`umf_access` 0.1.0.dev2 wheel separately and qualify their selected compiler,
transport and engine. Connections, authorization and commits remain host-owned.

## Breaking Changes

Old core resources, transition exports and version dispatch are removed. Retired
reference links report an unavailable definition and offer the current Document
entry rather than silently rewriting source identity. Native dialect and
extension versions remain independently declared.

Preserve original documents and prior runtime cohorts when retaining historical
work. Current APIs do not provide old-core upgrade/rollback support. Do not mix
schemas, generated packages, cursors or catalogs from different source cohorts.

## Validation

The final UUID model and composition campaigns completed all 18 and 15 stages
against the frozen consumer source closure. The scoped PostgreSQL catalog check
passed 93 observations, including 260 typed cells. The installed SDK replayed
139 core vectors and the public generator/actions/loader probes. The official
core wheel passed 166 installed tests and exact packaged-source checks; the
host wheel passed six identity tests and two actual installed native cases.
Release evidence records each runtime and target version separately.

## Qualification Limits

Historical evidence keeps its exact original bytes and source pins. Six older
ideal families retain current functional, native-payload and refusal tests, but
partly recovered historical artifacts do not establish current native admission.
Their affected native acceptance criteria remain untested. External Truss and
broader Weft profiles remain separately unqualified; the fresh installed unified
Weft/PostgreSQL check covers only its recorded subset. Temporal acceptance stays
HELD. Reference inventory counts and browser success do not broaden native scope.

## References

- [Authority and retirement plan](../04-build/metamodel-authority-plan.md)
- [Authoritative metamodel contract](../02-design/contracts/CONTRACT-080-authoritative-metamodel.md)
- [Unified Python access contract](../02-design/contracts/CONTRACT-079-unified-python-access.md)
- [Current native qualification dispositions](../04-build/evidence/metamodel-authority/current-native-qualification.json)
