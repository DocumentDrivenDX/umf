---
ddx:
  id: CONTRACT-024
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: US-024
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: umf.architecture
      kind: informed_by
---

# CONTRACT-024: LinkML source interchange

**Type:** library/schema. **Version:** 0.1.0. **Status:** draft.

## Purpose and Scope

Preserve LinkML source with explicit metamodel selection. Pin linkml/linkml-model v1.11.0 commit
051e945bb8d64ffd60639c666615ace88d561e2f, its complete 65-definition meta.schema.json, generated
Python classes, source metamodels and all ten tests/input/examples schemas. The native loader
uses linkml-runtime 1.11.0rc2 as pinned by that model release; dependencies are frozen separately.

## Normative Surface

umf.linkml 0.1.0 MUST store {profile:"linkml-json-yaml",metamodelVersion,root:NativeJson,
originalSource,originalFormat:"json"|"yaml"} on module schema, element schema. Root MUST be
an object. importLinkmlDocument(text,{id,format,metamodelVersion?}) defaults metamodelVersion
to 1.11.0. The source schema's version field MUST NOT select the metamodel. Unknown selected
versions or conflicting native metamodel_version MUST remain preserved without interpretation.

exportLinkmlDocument(document,format?), inspectLinkmlDocument(document),
getLinkmlDocumentNode(document,pointer), proposeLinkmlDocumentNodeEdit(document,pointer,jsonText),
linkmlRegistry() and linkmlPackage provide native export, shape inspection and copied operations.
Only existing pointers are editable. Failed edits MUST NOT mutate input. Unchanged trees export
original bytes in their original format; other exports use exact JSON syntax, also valid YAML 1.2.
The original archive remains in UMF after edits; regenerated output does not preserve layout.
Core text/tree limits apply.

## Precedence and Compatibility

Pinned metamodel JSON Schema validation uses a disposable JS numeric view without format checking,
default insertion or source reconstruction. Native failures remain warnings. Unknown native fields
and values remain exact even when the native loader rejects them. No imports or CURIE mappings
are fetched, induced models built, instances validated or generators run. Source, native normalized
objects and metamodel validation outcomes are different evidence and MUST remain distinguishable.

## Error Semantics

LINKML_STRUCTURE rejects non-object roots; FORMAT rejects unsupported formats; ARCHIVE rejects
malformed stored source. DOCUMENT/PAYLOAD/EDIT identify representation/pointer failures.
LINKML_REPRESENTATION marks unknown encoding fields and LINKML_EXPORT blocks their lossy native
export. VERSION/NATIVE_SCHEMA/CONTEXT qualify incomplete interpretation; DIAGNOSTICS_TRUNCATED
marks more than 100 native shape errors. These suffixes use the LINKML_ prefix throughout.

## Examples and Validation

All ten upstream schemas and an authored inheritance/mixin/identifier/enum/recursive-reference
schema preserve source through both UMF formats. Twenty-two exports and metadata candidates
agree with Python schema and loader outcomes. All source/candidate contracts satisfy the native
JSON Schema; the native loader accepts ten and rejects the native-array-1 annotation example.
One accepted type-mappings example yields normalized output that violates the JSON Schema.
Those outcomes remain recorded in fixtures/linkml/oracle-results.json; UMF never substitutes
normalized content for source. Chromium repeats source recovery and candidate exports.

## Non-Normative Notes

Import closure, induced-model semantics, value validation, source graph transformations and
cross-system generators remain unfinished. No concept is promoted to core from structural
similarity alone. Authority: [pinned LinkML model](https://github.com/linkml/linkml-model/tree/051e945bb8d64ffd60639c666615ace88d561e2f).


## Metamodel source corpus and YAML scalar profile (US-024-AC4)

All ten source schemas under the pinned linkml_model/model/schema directory now have independent
round-trip/candidate evidence, in addition to the original eleven examples. Their native loader
accepts every source; nine raw schemas satisfy the published JSON Schema. types.yaml uses scalar
notes where the JSON Schema expects arrays, producing 17 Python top-level diagnostics. Native
normalization wraps those singletons and its output satisfies the schema. UMF retains the raw
scalar source and its warnings, not a normalized substitute.

LinkML YAML import MUST use the JSON-compatible subset of the native loader's YAML 1.1 scalar
profile: underscored integers remain numeric and exact, and the PyYAML boolean vocabulary leaves
single-letter y/n as strings. The default shared YAML parser profile remains 1.2 for other
adapters. The shared parser exposes version plus optional booleanLexicon:'pyyaml' and
 dateOnly:'string' choices for this adapter; this is syntax support, not semantic core promotion.
Date-only implicit YAML scalars become lexical strings in the JSON tree, matching the observed
native JSON serialization; original spelling remains archived and LINKML_CONTEXT discloses this
projection. General timestamps, explicit tags, aliases and other non-JSON values remain outside
the supported profile. No arbitrary YAML/native-scalar equivalence is claimed.

This corrects an observed mismatch in extended_types.yaml: int64/uint64 bounds written with
underscores previously became strings under the default YAML 1.2 parser. Their new exact JSON
integers agree with the native loader after export. Tests assert signed/unsigned 64-bit limits,
PyYAML boolean spellings and explicit date-only handling, alongside default YAML 1.2 behavior.
Twenty metamodel source/candidate comparisons now agree with native outcomes; Chromium repeats
both this corpus and the original 22-format example corpus. Native import closure, induced
semantics, instance validation, generators and additional scalar forms remain required work.

## Explicit supplied import context (US-024-AC5)

inspectLinkmlImportContext({entry,schemas:[{key,document}],bindings:[{from,import,target}]})
MUST return a copied context, status resolved/blocked, complete:false, visited nodes, declared
edges and diagnostics. import-context-schema.json and import-report-schema.json describe these
surfaces. Context/resource/binding unknown fields remain preserved. Every supplied document must
be a valid UMF LinkML envelope, including unreachable resources. Keys and binding strings have
1–4096 characters, contexts have 1–128 resources and at most 4096 bindings. Core copy limits apply.
Duplicate keys or importer/literal bindings, absent binding resources and absent entry block
traversal. Invalid outer options throw LINKML_IMPORT_CONTEXT.

Traversal MUST use supplied literal bindings only, with breadth-first node discovery and source
array order for edges. Repeated edges retain distinct /imports/N pointers; cycles terminate
without implying cycle legality. Missing bindings produce unresolved edges and blocked status.
Unrecognized metamodel/representation and non-array imports block interpretation of that resource.
Unreachable resources remain in context. Native shape warnings alone do not prohibit traversal of
an otherwise usable import list. No paths, CURIEs, merge precedence or induced semantics are guessed.

Four authored contexts cover diamonds, repeated/cyclic edges, missing imports and importer-scoped
aliases. The pinned SchemaView runtime, supplied with parsed models and a retrieval guard, agrees
on two reachable sets and one missing-import outcome. Its global preload map cannot represent the
scoped alias case; that case has Bun/browser evidence only. Eight UMF-format reports agree in
Chromium. Native retrieval, closure ordering, merging and induced models remain unfinished.

## Local class-slot membership (US-024-AC6)

inspectLinkmlClassSlots(document,className) MUST return a copied source, className, scope:document,
status resolved/blocked, complete:false, ordered ancestors, slots with all declaration pointers,
and diagnostics. class-slots-schema.json describes the complete report. Class names have 1–4096
characters; invalid query names throw LINKML_CLASS_NAME. Malformed source/version/representation,
missing local ancestors and unsupported membership shapes produce blocked reports with no slots.
Ancestor discovery remains available as partial diagnostic context when blocked.

Traversal matches pinned SchemaView.class_ancestors(imports=False): append mixins then is_a to
the discovery list and process pending classes on a stack. Membership iterates that ancestor list,
then each class's slots followed by attributes, retaining first-name order and every source
occurrence. Cycles terminate without asserting inheritance validity. Only explicit class dictionaries,
name arrays and attribute dictionaries are interpreted; attribute nulls retain compact declarations.
Class dictionary keys must agree with explicit names. Slot existence, slot_usage, constraints,
range/default inheritance and import overrides are not inferred. Unused and unknown source content
remains in the report. This operation is not an induced-class or instance-validation result.

The pinned corpus plus authored people and inheritance fixtures supply 20 sources and 208 reports
through both UMF formats. Native comparison establishes ordered memberships or missing-parent
failures for 206 reports. One native loader rejection prevents comparison for the remaining two;
those retain source and browser evidence. Chromium repeats all 208 reports. No core promotion follows
from this membership algorithm.

## Scalar effective slot values (US-024-AC7)

inspectLinkmlSlotValues(document,className,slotName) MUST return copied source, query names,
scope:document-scalar-slot-values, status resolved/blocked, complete:false, fields, derivations
and diagnostics. slot-values-schema.json defines the report; LINKML_SCALAR_SLOT_FIELDS enumerates
29 interpreted fields and their types. Fields cover scalar inherited metaslots plus description;
structured_pattern, equals_string_in, array, computed aliases, owner and domain_of are not projected.
Unset fields are omitted. The complete original source retains all excluded/unknown metadata.

The query MUST require resolved local class membership. An ancestor attribute takes precedence over
a global slot and skips slot-ancestor propagation. Otherwise, reverse native ancestor order applies
truthy inheritable scalar values; false, zero and empty strings do not overwrite at this stage.
Description is copied from the base declaration but is not inherited through slot ancestors.
Reverse class ancestor order then applies non-null slot_usage values, including false and empty
strings. minimum_value takes the maximum and maximum_value the minimum of numeric usage bounds.
Exact decimal comparison MUST avoid floating-point rounding and exponent expansion. Equal bounds
retain the earlier token. Schema default_range fills an unset range. identifier/key imply required;
inlined_as_list implies inlined. These rules do not validate instances or prove consistent constraints.

Selected fields MUST have their declared scalar type, with exact integer values for equals_number
and cardinality fields. In particular, readonly is a string in the pinned model. Loader coercions
are not applied. Missing declarations, malformed projected fields or ancestry and unsupported
versions block derivation; blocked reports contain no effective fields or derivation records.
LINKML_SLOT_VALUES explains failures and LINKML_SLOT_CONTEXT lists interpretation limits. Query
slot names have 1–4096 characters; invalid names throw LINKML_SLOT_NAME. Source pointers and rule
names accompany assignments, and effective/derivation values MUST be copied separately from source.

The authored six-class corpus supplies 54 reports across both UMF formats. All agree with pinned
SchemaView.induced_slot for the 29 projected scalar fields, including attribute overrides, inherited
false/zero behavior, usage narrowing and integers beyond JS precision. Chromium repeats all 54.
Separate exact-decimal tests cover huge positive/negative exponents; these are UMF arithmetic tests,
not additional native compatibility evidence. Imported induction, structured constraints, native
normalization, aliases, instance validation and generators remain unfinished.

## Upstream local induction audit (US-024-AC8)

The scalar induction corpus now extends beyond the authored AC7 model to the twenty sources used
for AC6 membership. scripts/linkml-slot-corpus-oracle.py parses each source with the pinned native
loader, copies the normalized model and explicitly detaches imports before local induction. This
is necessary because some native helper calls use imported lookup internally even when the entry
method receives imports=False. The retrieval guard MUST remain active. Original source and native
model with detached imports MUST never be conflated; this audit proves local behavior only.

Every native class is enumerated, and every locally available class-slot pair is queried. The
corpus yields 310 successful scalar projections, 24 missing-ancestor membership failures and 13
induction failures from missing local slots/ancestors. UMF matches all successful projections and
blocks all 37 failing queries. One source is rejected by the native loader before enumeration and
remains excluded from induction evidence. It still has exact source-preservation checks.

Both UMF formats reconstruct identical documents and recover all twenty original sources. Each
of the 347 queries is evaluated once on the reconstructed JSON document in Bun and Chromium;
this is not a claim of 694 independently executed inductions. Native output values are encoded
as JSON text and parsed to exact NativeJson values for comparison. Source metadata outside the
29-field projection, imported semantics, structured induction, full normalization and generators
remain outside this audit. No additional core equivalence follows from the passing corpus.

## Explicit import merge candidates (US-024-AC9)

proposeLinkmlImportMerge(context,{mode}) MUST require mode:view or mode:merge-imports. An omitted
or unknown mode throws LINKML_MERGE_MODE. The policies are intentionally distinct: native dictionary
lookup overwrites earlier declarations with later ones; native merge_imports begins with the entry
schema and copies only missing declarations in closure order. No default policy is inferred.

merge-schema.json defines the complete report: copied context, mode, status:candidate/blocked,
complete:false, ordered closure, selections with winner/shadowed resource keys, optional candidate
Document and diagnostics. A blocked report MUST NOT contain a candidate or partial selections.
The source context includes unused resources and every original archive, unknown field and losing
declaration. Core input/copy/text limits continue to apply.

Closure reproduces the pinned stack traversal over explicit bindings: push declared imports in
order, record each popped resource, expand each resource once, reverse the recorded sequence and
retain first occurrences. Self-target edges do not expand. No URI/CURIE/path resolution occurs.
The merger handles prefixes, classes, slots, enums, subsets and types as complete dictionaries;
it MUST NOT combine fields inside colliding definitions. Definition/attribute compact nulls become
objects as necessary to carry native from_schema. Selected definitions and class attributes receive
the winning source schema's string id as from_schema, matching native provenance injection. The
original supplied value of from_schema remains recoverable in context.

The candidate retains entry top-level metadata and clears imports. Imported top-level metadata and
shadowed declarations remain in context, not in candidate native output; LINKML_MERGE_CONTEXT MUST
disclose this distinction. Unknown fields inside selected definitions remain in the candidate.
Malformed collection/definition/attribute shapes or missing string schema ids block candidate
creation with LINKML_MERGE diagnostics. This is a source-preserving proposal report, not an assertion
that exporting the candidate alone retains the complete source context or that all execution
semantics are equivalent.

Four authored contexts cover diamond collisions, cyclic/repeated imports, missing imports and
importer-scoped aliases. Two policies and two UMF formats yield sixteen reports and twelve candidates.
The native runtime agrees on eight complete normalized candidates and four missing-import failures.
Its global preload map cannot represent the scoped-alias context, whose four candidates have only
Bun/browser evidence. Chromium reproduces all sixteen reports and twelve candidate exports. These
checks do not establish arbitrary URI resolution, generator equivalence or instance behavior.

## Complete metamodel import corpus (US-024-AC10)

Every one of the ten pinned metamodel sources now acts as an entry schema with all ten sources
supplied and literal linkml: import bindings mapped to their corresponding files. File stems and
native names are not assumed identical: array.yaml names its schema arrays, and validation.yaml
names its schema reporting. Native preload keys retain import literals; oracle closure comparison
explicitly translates those keys to supplied resource identities. Retrieval remains guarded.

Both merge policies produce twenty candidates that agree with complete native normalized models.
Forty candidate UMF-format round trips reproduce native-compared output exactly. Original source
hashes match the pinned manifest, and all supplied contexts remain unchanged. Chromium repeats
both policies for all ten entries in both formats and recovers all twenty source-format inputs.
The main meta entry reaches six schemas and selects 333 source declarations across six dictionaries.

All twenty raw candidates retain seventeen published-JSON-Schema errors inherited from scalar notes
in types.yaml. Native loading normalizes these compact values to arrays, and every normalized
candidate passes the published schema. This is accepted-native-source evidence, not raw-schema
validity; native shape warnings MUST remain visible. Normalization is never written back over the
original declarations. Definition counts are taken from serialized native models, excluding runtime
container bookkeeping. URI retrieval and broader execution/generator equivalence remain unproven.
