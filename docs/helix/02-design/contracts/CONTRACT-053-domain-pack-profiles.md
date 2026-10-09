---
ddx:
  id: CONTRACT-053
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: CONTRACT-052
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
    - id: CONTRACT-041
      kind: informed_by
    - id: SD-026
      kind: informed_by
---

# CONTRACT-053: Domain pack targets and scenario replay

**Version:** domain-pack execution profile 1.0.0, additive to CONTRACT-052.

## Scope and Boundaries

UMF owns declarative schemas/profiles and authored scenario content. TableSpec
owns trusted replay, relational verification, ZIP and SQL sinks. Graph artifacts
are schema-targeted candidates; no Truss/Ashlar catalog acceptance, enforcement,
publication or native ingestion is implied. Existing OWL/SHACL adapters retain
native ontology meaning when such artifacts are explicitly included.

## Normative Surface

`execution_profile` MAY occur on a pack. Version 1.0.0 has:

- `version`: exact `1.0.0`.
- `targets`: map `tabular` and/or `graph` to arrays of declared schema IDs.
  Entries MUST resolve locally, be unique per target and have supported formats.
  TableSpec ingestion selects only `tabular` entries with format `tablespec`.
  Graph schema selection uses format `umf` and core version 0.8.0.
- `mode`: `fixed` or `scenario-replay`. Replay MUST use the trusted implementation
  `tablespec.scenario-replay` version `1.0.0`, never code supplied by a pack.
- `scales`: for replay only, named positive integer component counts, bounded
  to 10000 by this profile. `small`, `demo`, `large` default to 1, 10, 100.
- `identity_columns`: per-tabular-schema array of columns whose local strings
  identify primary keys or reference those keys. Profile 1.0 supports only
  single string primary keys and foreign keys to primary keys. An exact
  namespaced identity is JSON encoding of `[seed, componentOrdinal, nativeId]`.
  All identities and references MUST be remapped consistently, including cycles.
  Source rows/literals other than declared identities remain unchanged.
- `qualification`: text explaining replay limits, supported semantic subsets
  and unexecuted consumer targets; this is required for replay.

Replay requires pinned, rights-declared local fabricated templates. Observed,
deidentified, unknown or published clinical fixtures without this authored
execution profile MUST NOT be expanded. Consumers MUST refuse unknown profile
versions, unsupported fields affecting execution, undeclared identities, missing
capabilities, nonpositive counts, unsupported schema/key formats and unresolved
bindings before writing output. Unknown pack metadata remains preserved.
Original templates retain their own checksums and external/fabricated origin.
Derived outputs use a separate synthetic source descriptor identifying trusted
replay, exact seed, component count and input source IDs; row bindings point to
this generated source while original sources remain retained references.

`scenario_checks` is an array of authored evidence expectations. Each has `id`,
`question`, `sql`, and `expected` (ordered row arrays). SQL is inert metadata:
only explicitly trusted test tooling may execute reviewed SELECT queries against
an isolated local fixture database. It is never a generator or production command.
Fixture checks MUST compute outcomes from domain fields, not compare injected
labels with themselves. Ground-truth expectations are separate from ordinary rows.

## Graph Schema and Candidate Fixture

Each ontology document contains core Records, owner-qualified Fields, members,
Keys and directed Relationships under CONTRACT-040/041. Every table maps to a
Record named by its exact table ID; every property has an owner-qualified Field
ID `record.column`. Keys use stable `identity`; no display name is an identity.
A foreign key declares a many-to-one candidate relationship to the keyed target;
nullable references have minimum 0, required references minimum 1. Neither this
binding nor a core relationship asserts OWL inference or database enforcement.
Attributable assertions remain Records with author/evidence/status properties;
they do not silently become unconditional edges or asserted equivalence.
Unresolved references retain native reference and resolution properties, with no
fabricated object. Their nullable resolved target yields no edge when null.

A graph fixture is JSON `format: umf.domain-graph`, `version: 1.0.0`, with exact
`schema` identity/revision/SHA-256, `objects` and `edges`. Each object has `key`
(the JSON array `[documentId,moduleId,recordId,primaryKeyTuple]`), `type`
`{document,module,element}`, and `values` map of exact Field ID to source value. The primary Key tuple retains ordered CSV lexical strings, including composite keys; it is not a canonical UMF Key encoding.
Each edge has `key` (JSON array `[documentId,moduleId,relationshipId,sourceKey,targetKey]`),
`relationship` `{document,module,id}`, `source`, `target` object keys. Values are
source literals, not a replacement for UMF canonical Value carriers; native
execution requires explicit consumer value conversion and acceptance. This
candidate fixture MUST label that limitation and retain source pack provenance.
It is not a Truss/Ashlar native artifact or an ontology conformance certificate.

## Compatibility and Errors

Packs without this profile retain legal/medical behavior. Structural admission of
unknown profile content permits preservation, not execution. Same schema revision
with changed bytes is a conflict; pin updates require regenerated graph fixtures.
Local files MUST remain within the real pack directory, including symlink targets.
Sources included in an export MUST pass SHA-256 verification and declared
redistribution checks. Binary files MUST be compared as bytes, not decoded text.
Remote references remain metadata. A consumer must name a supported target and
refuse unavailable runtime bindings; graph schema visibility is not graph ingestion.

## Evidence Requirements

Schema inventory/relationships, independent domain checks, replay identities/counts,
ZIP typed readback and native engine execution are separate gates. Component count
scaling MUST NOT count as varying topology, time span, sampling frequency, scientific
effort or calibrated distributions. Those dimensions remain explicitly unqualified
unless separately exercised. Per-story STPs preserve AC IDs and record partial
coverage rather than infer all ACs from a passing general runner.

## Inclusion, Run Metadata and Budgets

`execution_profile.include_sources` is a required array of source IDs selected
for attachment inclusion. Mandatory row templates are always verified and retained;
unselected reference assets remain metadata and MUST NOT block ingestion. Selected
attachments require pin/rights/containment checks. Profile 1.0 limits are fixed:
10 MiB per schema/template, 100 MiB aggregate included bytes, 100000 template rows,
1000000 expanded rows/objects, 4000000 edges and 10000 components. Refuse before
publication when these budgets are exceeded. Consumers MAY impose smaller limits.
Mixed-target archives MUST retain exact bytes of every declared local schema with
manifest reference-to-member mappings, including graph schemas; tabular selection
must not discard them. Legacy packs without a profile retain their delivered behavior.

Replay datasets use the shared spool directly, not ImportedDataset synthetic
source admission. Archives have explicit run metadata: origin `synthetic`, exact
seed, generator identity/version, scale, components and input hashes. Medical
fixed imports remain origin `external` with no seed. TableSpec's source_metadata
presence MUST NOT override replay run origin. Graph candidate identifiers are not
UMF canonical Key bytes or native Truss/Ashlar storage/catalog IDs.

Tests resolve checks from reviewed repository code by pack/check ID. Manifest SQL
must equal the reviewed code exactly and is NEVER authorized as runtime SQL. The
fixture test database is local SQLite with an authorizer refusing writes, attach,
PRAGMA and extension functions; execution is bounded by a progress handler.
Source files, network access and arbitrary table functions are not available.
Production tools MUST NOT execute scenario_checks SQL. Qualification metadata is
not executable content. The current profile does not resolve remote dependencies.
