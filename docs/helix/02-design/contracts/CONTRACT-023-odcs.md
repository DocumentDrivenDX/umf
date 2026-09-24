---
ddx:
  id: CONTRACT-023
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: US-023
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: umf.architecture
      kind: informed_by
---

# CONTRACT-023: ODCS source contracts

**Type:** library/schema. **Version:** 0.1.0. **Status:** draft.

## Purpose and Scope

Preserve native ODCS JSON/YAML and expose copied candidate edits without claiming enforcement
of the data contract. Pin bitol-io/open-data-contract-standard v3.2.0 commit
f0bdad95346905d500be5ef4b2c2d9b1d95223b7, its 42 YAML examples and versioned native schemas
3.0.0, 3.0.1, 3.0.2, 3.1.0 and 3.2.0. Schema version names may identify different snapshots
upstream; only these captured bytes are interpreted.

## Normative Surface

umf.odcs 0.1.0 MUST retain {profile:"odcs-json-yaml",root:NativeJson,originalSource:string,
originalFormat:"json"|"yaml"} on module contract, element contract. Root MUST be an object.
importOdcsDocument(text,{id,format}), exportOdcsDocument(document,format?),
inspectOdcsDocument(document), getOdcsDocumentNode(document,pointer),
proposeOdcsDocumentNodeEdit(document,pointer,jsonText), odcsRegistry() and odcsPackage expose
source import/export, validation and copied existing-pointer edits. Core parser limits apply.

Export MUST return original bytes when the source tree is unchanged and the requested format
matches the original. Otherwise export MUST use JSON syntax, also valid YAML 1.2, retaining exact
number tokens. Original source remains in UMF; regenerated output does not preserve comments or
layout. Candidate edits MUST NOT mutate input. Candidate validity does not authorize deployment.

## Precedence and Compatibility

apiVersion selects an exact pinned native schema. Missing/unknown versions MUST be preserved
with incomplete interpretation. Native shape mismatches MUST remain warnings. The disposable
JS-number validation view ignores format annotations and MUST NOT replace the exact source.
No reference fetching, quality/SLA execution, physical mapping or parser-default insertion occurs.

## Error Semantics

ODCS_STRUCTURE rejects non-object roots; ODCS_FORMAT rejects unsupported format options;
ODCS_ARCHIVE rejects malformed archived syntax. ODCS_DOCUMENT/PAYLOAD/EDIT reject invalid
representation/pointers; failed operations preserve their inputs. ODCS_REPRESENTATION marks
unknown encoding fields, which MUST block native export through ODCS_EXPORT. Unknown native
properties remain source data. ODCS_VERSION/NATIVE_SCHEMA/CONTEXT and optional
DIAGNOSTICS_TRUNCATED qualify interpretation; at most 100 native shape failures are returned.

## Examples and Validation

The source manifest records license, immutable commit and hashes. odcs-roundtrip.ts processes
every captured YAML example and records import failures as evidence. Independent Python
JSON Schema results and whole-document comparisons, Bun regressions and Chromium checks
qualify support. A preserved document need not satisfy its native grammar.

## Non-Normative Notes

ODCS logical/physical types, relationships, quality, team and SLA terms remain extension-owned.
The initial package does not establish equivalence to DDD entities, database columns or executable
constraints. Further semantic operations, projections and version snapshots remain open.
Authority: [ODCS repository](https://github.com/bitol-io/open-data-contract-standard/tree/f0bdad95346905d500be5ef4b2c2d9b1d95223b7).


Observed corpus evidence: all 42 examples preserve original source through both UMF formats.
The declared versions are v3.2.0 (28), v3.0.2 (12), v3.0.0 (1) and v3.1.0 (1). The included
v3.0.1 schema has no example in this release subtree; inclusion is not exercised conformance.
Python jsonschema 4.25.1 agrees with the browser inspector on 39 valid and three invalid source
contracts, with the same counts after metadata edits. PyYAML 6.0.3 agrees with the parsed JSON
values on this corpus; this does not assert YAML 1.1/1.2 equivalence for arbitrary inputs.
The failures are all-data-types (older logical-type options/types), column-completeness (missing
quality rule), and basic-four-dpo (object team versus required array). Their original contents
and diagnostics remain intact. Chromium repeats 84 source/84 candidate comparisons. Bun adds
future exact numbers, copied access, invalid native shapes and lossy-encoding export guards.


## Local reference lookup (US-023-AC4)

resolveOdcsReference(document,{reference,usage}) MUST return a copied-source result described
by reference-schema.json. usage MUST be element or foreignKey; reference MUST be a nonempty
string of at most 4,096 characters. Invalid options raise ODCS_REFERENCE_OPTIONS. The result
contains source, reference, usage, status (resolved/blocked), complete:false and diagnostics.
A resolved result alone contains target:{path,notation,node}; path is a JSON Pointer into the
native root, notation is id or name, and node is a copied exact NativeJson subtree.

Interpretation is pinned to apiVersion v3.2.0. Fully qualified schema/id[/properties/id] paths
MUST match id strings in each containing array, never positions or names. Stable IDs may include
colons; forbidden characters and whitespace follow the pinned reference prose/schema. Optional
leading slash and a same-contract # anchor are accepted in this lookup API, following the prose;
this does not assert that every native reference regex accepts the optional local anchor.
Foreign-key shorthand MUST use dot-separated names and MUST be explicitly selected by usage.
Foreign-key lookups MUST target a property, not merely a schema object. element usage only
accepts ID notation. Names and IDs are never interchanged; percent escapes are not decoded.

Every traversal step MUST have exactly one matching element. Missing, malformed or ambiguous
steps return blocked with ODCS_REFERENCE_MISSING/STRUCTURE/AMBIGUOUS. Unsupported versions,
notation/usage/target mismatches and external references return ODCS_REFERENCE_VERSION/SYNTAX/
USAGE/TARGET/EXTERNAL. No external resource is fetched. External resource bundles and full
relationship checking remain future work. These errors apply to the lookup result and do not
remove source content or modify the document. The resolved target and copied source do not
alias the input. ODCS_REFERENCE_CONTEXT qualifies lookup: no type, uniqueness, composite-key
cardinality, physical-name or data-constraint enforcement is established.

The source collector now pins docs/references.md as authority. Thirteen specification-derived
vectors exercise the release relationship example and explicit boundaries through both UMF
formats (26 comparisons), repeated in Chromium. Additional Bun cases cover nested IDs, colon
IDs, rename/reordering stability, duplicates, copied outputs and unknown versions. These expected
vectors are authored from source elements, not a claim of agreement with a separate ODCS runtime.
The upstream example's addresses.address_street is unresolved: the actual name is street and
id is address_street_prop. Its fully qualified ID path resolves. UMF does not silently repair
that name mismatch or reinterpret it as an ID. Relationship validation and projections remain open.


## Relationship endpoint pairing (US-023-AC5)

inspectOdcsRelationships(document,{maxRelationships?}?) MUST return the copied source and a
report described by relationship-schema.json. maxRelationships defaults to 256 and MUST be an
integer from 1 through 2,048; invalid options raise ODCS_RELATIONSHIP_OPTIONS. Interpretation
is pinned to v3.2.0. The report has status checked/blocked, complete:false, relationships and
diagnostics. Every relationship row contains its native path, schema/property scope, status
resolved/blocked, ordered {fromPath,toPath} pairs and diagnostics. Blocked rows MUST expose no
partial pair list. A checked report establishes endpoint pairing only, never foreign-key validity.

Traversal processes a schema object's own relationships before recursively visiting properties.
Omitted type means foreignKey without inserting a source default; other types are retained but
blocked. IDs, when supplied, follow the pinned stable-ID restrictions and MUST be unique within
the containing relationship array. Schema-level from/to MUST both be nonempty strings or both
nonempty arrays with equal length. Composite positions pair in order, not as a Cartesian product.
A property-level from MUST be absent; its source path is implicit. Only scalar property-level to
is interpreted. The official grammar permits array to there, so such arrays are explicitly
unsupported by this pairing profile, not declared grammar-invalid or silently flattened.

Local endpoints use AC4 lookup. A failed endpoint blocks its entire row, retaining source and
reference-location diagnostics. Shape/from/to/arity/ID/type problems emit ODCS_RELATIONSHIP_*
errors; unknown versions and malformed collections block the report. At the relationship limit,
remaining traversal stops with ODCS_RELATIONSHIP_LIMIT and full source retained. Composite keys
over 128 columns likewise remain preserved but uninterpreted. No type compatibility, primary-key
uniqueness, row validation, physical binding or external lookup is performed. Default inspector
warnings and ODCS_RELATIONSHIP_CONTEXT remain in the report.

Nine cases derive from the official relationship example: original unresolved names, an explicitly
labeled corrected copy, unequal composite arity, forbidden property from, mixed endpoint shapes,
duplicate IDs, property-level array to, unknown type and an external target. Eighteen format
reports agree in Bun and Chromium. Python's official JSON Schema accepts six of the nine cases,
including arity/duplicate/reference cases that need more than shape validation. It also accepts
property-level arrays; UMF's explicit unsupported outcome is recorded separately. Native grammar
outcomes do not serve as proof of endpoint or data-level validity. Further external-resource and
relationship semantics remain required work.


## ID-selected rename candidates (US-023-AC6)

proposeOdcsElementRename(document,{reference,name}) MUST select an existing named schema element
using AC4 element/ID notation. name MUST be shorthand-compatible (ASCII letter/underscore first,
then letters/digits/underscore/hyphen), at most 256 characters. Invalid names raise
ODCS_RENAME_OPTIONS; reference option failures follow AC4. rename-schema.json fully describes
{source,status,complete:false,candidate?,changes,diagnostics}. Only candidate status includes
candidate; blocked status MUST expose neither a candidate nor partial changes. Each change
records an exact native pointer and before/after string values. Source and candidates are copies.

The operation MUST block sibling-name collisions, native shape/representation uncertainty,
unsupported reference versions and any known relationship that AC5 cannot fully pair within
its default limits. It MUST change the selected name and affected local foreign-key shorthand
segments, including references to descendants of a renamed object. ID-based references, IDs,
physical names, unrelated fields and the original archive MUST remain unchanged. The operation
MUST verify the resulting native shapes and the same ordered endpoint paths for every known
relationship before exposing the candidate. Failed verification emits ODCS_RENAME_VERIFICATION.
Other blockers use ODCS_RENAME_SOURCE/NAME/COLLISION/RELATIONSHIPS with original source retained.
A same-name operation MAY return an unchanged candidate and empty change list.

ODCS_RENAME_CONTEXT MUST explain the interpretation limit: SQL expressions, quality rules,
unknown metadata and external consumers are neither rewritten nor proven equivalent. The
candidate is a reviewable edit preserving known local relationships, not a globally safe domain
rename or deployment action. Original source archival and regenerated layout follow AC2.

Four authored cases extend the paired relationship fixture with a nested object, an ID-based
foreign key and expression-like custom metadata. Object, target-property, nested-object and
source-property renames yield eight native-schema/whole-value comparisons and eight browser
exports. Tests assert exact change paths, unchanged ordered endpoint pairs, retained ID references,
untouched custom metadata, collisions, unresolved upstream relationships and atomic failure.
No core promotion or global semantic-equivalence claim follows from these transformations.
