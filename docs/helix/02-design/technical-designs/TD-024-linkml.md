---
ddx:
  id: TD-024
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: US-024
      kind: informed_by
    - id: CONTRACT-024
      kind: informed_by
    - id: umf.architecture
      kind: informed_by
    - id: ADR-002
      kind: informed_by
---

# TD-024: LinkML browser source model

## Technical Approach

Store authoritative NativeJson plus original source and explicit metamodel selection. Vendor the
complete official JSON Schema unchanged and inspect with Ajv 2019. Do not load Python or native
normalizers in the browser. CONTRACT-024 defines the public surface and compatibility boundaries.

## Components and Integration

linkml-sources.py captures an immutable upstream release with licenses/hashes. linkml-schema.ts
materializes the package and native grammar. src/adapters/linkml handles source parsing, copied
access/edits and qualified shape diagnostics. Native tests use vendored release classes with an
isolated pinned runtime, keeping their normalization/rejection outcomes separate from source.
The fixture generator covers the complete upstream example directory plus an authored common
schema; it does not resolve imports or claim induced-model behavior.

## Validation and Risks

Compare original YAML versus exported JSON native outcomes and whole candidate values, including
loader rejection and normalized-schema disagreement. Bun checks both serialization formats,
unknown source and metamodel versions, exact numbers and lossy encoding guards. Chromium repeats
public source/candidate operations. Additional metamodel versions, closure, semantic transforms,
instance validation and generators remain required extensions of this design.


AC4 adds --metamodel to the fixture/oracle/browser harnesses and preserves the original corpus.
The ten pinned metamodel YAML files expose scalar normalization and exact-number requirements.
LinkML now requests the YAML 1.1 parser profile with PyYAML's boolean vocabulary and explicit
date-only-to-string JSON projection. Shared default YAML 1.2 behavior remains unchanged. Integer
separator decoding uses BigInt; float spelling retains exact tokens after separator removal.
Native source/archive and normalization evidence remain separate, including scalar notes arrays
and date-only source spelling. The complete metamodel corpus is a finite check, not proof of all
YAML forms or native schema evaluation. General timestamp support remains open.

AC5 adds src/adapters/linkml/imports.ts and complete context/report schemas. Explicit importer/literal
maps keep retrieval policy outside the adapter. All supplied envelopes are checked, then a visited
set bounds cyclic traversal; each declared edge retains its native pointer and optional target.
The report archives all supplied sources, including unused ones. Four authored contexts exercise
both UMF formats. Native SchemaView receives preloaded models with load_import replaced by a
retrieval guard; compare reachable sets only, never native order or merge results. Importer-scoped
aliases are explicitly excluded from that native comparison. Browser checks compare all eight
reports and recover exact source. Retrieval and semantic induction remain follow-up work.

AC6 adds class-slots.ts for copied, document-local membership reports and a complete report schema.
An iterative stack and discovery set reproduce native ancestor ordering without recursion. A map
collects first-seen slot names while retaining every slot/attribute declaration pointer. Malformed
or missing ancestry blocks the membership result rather than exposing a partial list as resolved.
The oracle compares SchemaView methods with imports=False across all classes in the pinned example
and metamodel source directories, plus authored inheritance/duplicate/attribute/cycle/missing-parent
cases. The native loader's rejected annotation example stays separate. Browser execution compares
all reports and exact source recovery. Effective slot values and imported definitions remain next work.

AC7 adds slot-values.ts, layered on local class membership, with an explicit 29-field scalar profile.
It retains source separately and records each assignment's native pointer and rule. Native truthiness
for slot inheritance differs from non-null class usage; separate stages reproduce this distinction.
Numeric bound comparison uses signed decimal digits and BigInt exponents without allocating expanded
powers or converting to JS numbers. Integer-valued fields reject fractional loader coercions. Copied
field values cannot mutate the report's source archive. The pinned native corpus exercises all
projected field names; its readonly string type was verified against generated model classes.
An independent Python oracle selects the same named fields from native induced SlotDefinitions and
stores exact encoded values for Bun comparison. Chromium repeats the reports. The projection remains
explicitly incomplete until structured fields, import merging and remaining normalization are covered.

AC8 broadens the scalar oracle to the full AC6 source list. The Python harness detaches imports on
a private normalized model and guards retrieval, since native induction helpers can re-enable
imported lookup. It records loader rejection, membership failure, induction failure and exact
encoded successful field values separately. The TS audit has explicit mismatch, native-rejected
and UMF-blocked categories; all three are absent in the checked corpus. Bun and Chromium require
310 successful comparisons, 24 matching membership failures and 13 matching induction failures.
Both UMF serializations are checked for identical documents and exact original-source recovery
before querying one reconstructed document. This expands evidence without broadening the API's
29-field scope or substituting a normalized model for source.

AC9 adds merge.ts and merge-schema.json. Native lookup (_get_dict) and merge_imports use different
collision policies, so mode is required. Explicit resource bindings supply traversal identity; a
stack with recorded duplicate visits reproduces native closure ordering. Dictionary selections
record winners and losers. Whole selected declarations receive native from_schema provenance,
including class attributes; original metadata stays in the report's complete context. The candidate
retains entry metadata and has an empty imports array. Native oracle comparisons load each candidate
and compare its entire normalized model with native lookup materialization or merge_imports output.
The fixture matrix distinguishes scoped aliases, which the native global preload map cannot model.
No silent merge policy or field-level blend is introduced, and no shared-core promotion is justified.

AC10 applies merge.ts unchanged to every pinned metamodel entry and all explicitly supplied native
dependencies. The fixture generator records file/literal/name mappings, closure, selections and
candidate outputs. The oracle translates native preload keys to resource identities and compares
whole normalized models under both policies. Raw and normalized JSON Schema checks stay separate:
all twenty raw candidates retain types.yaml's seventeen compact-notes errors; all normalized models
pass. Counts use serialized dictionaries because native assignment can introduce private container
bookkeeping that is not a schema declaration. Source hashes, unchanged context and exact candidate
outputs are asserted in Bun; Chromium checks both formats and retained shape warnings.
