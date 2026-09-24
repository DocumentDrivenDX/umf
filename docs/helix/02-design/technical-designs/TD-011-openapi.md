---
ddx:
  id: TD-011
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.architecture
      kind: informed_by
    - id: CONTRACT-011
      kind: informed_by
    - id: US-011
      kind: informed_by
---

# TD-011: OpenAPI exact native tree

Reuse the exact JSON encoding proven by JSON Schema and Avro. Move its helper to
`src/model/native-json.ts` with a compatibility export at the original adapter path;
add the shared standalone JSON Schema under core. JSON Schema, Avro and OpenAPI
embed identical node definitions for self-contained package validation. A regression
asserts definition identity, function compatibility and exact numeric behavior.
This promotes a representation helper, not API/storage/domain type equivalence.

Add a bounded YAML AST reader that converts JSON-compatible nodes and normalizes
numeric spelling without host arithmetic. Preserve original source/format separately.
Unknown representation metadata blocks export; unknown native version content stays
recoverable and explicitly incomplete. Candidate edits return validation results
because the current profile cannot establish complete semantic interpretation.

Official object schemas are pinned unchanged. A private static-anchor binding works
around Ajv's standalone dynamic resolution problem; independent Python validation
uses the original schemas. The workaround is limited to object-schema roots and
must not be extended to embedded schema dialect validation without new evidence.

Tests separate exact native retention, structural consistency, candidate changes,
numeric safety and validator limitations. Actual Chromium executes the browser
bundle. Native references never trigger implicit filesystem or network reads.


Legacy versions dispatch to pinned official Draft-04 schemas through ajv-draft-04.
Shared JSON equality hooks prevent native validators from invoking methods on data
objects or failing on null-prototype dictionaries. The native version remains
unchanged, and JSON Schema 3.1/3.2 dialect rules are not applied to legacy Schema
Objects. Python evaluates all four unmodified official schemas over the corpus.

The examples manifest includes all 46 files from the upstream example tree.
Role classification precedes import: complete descriptions are validated/round-tripped,
while eight referenced fragments remain explicit inputs for future bundle support.
The corpus oracle preserves timestamp lexical strings because JSON-compatible YAML
must not become Python date/time objects during native-content comparison.


Resources attach exact trees and source archives to absolute document URIs. Structural
schema validation requires a base URI when resources are supplied; semantic inspection
checks URL normalization/collisions and source parseability, while preserving an explicit
resource-context limitation. Literal URI/JSON Pointer lookup is bounded to the supplied
map and returns copies. It does not walk references, infer target kinds or implement
schema `$id`/anchor/dynamic scope. Root-only export rejects nonempty resource sets.

The separate-file petstore exercises four resource artifacts in each native format.
The independent oracle walks the known fixture references using Python URL joining and
JSON Pointer access; changing the Pet ID type changes Draft4 instance acceptance. This
proves selected referenced metadata affects behavior, without claiming general resolution.


Embedded schema validation uses a role-aware OpenAPI visitor, followed by a dialect-
aware schema-keyword visitor. Known nodes are checked shallowly and schema children
are traversed explicitly, so dialect changes are respected instead of applying one
recursive parent meta-schema indiscriminately. Literal instance data is never traversed
as schema. Pinned OAS vocabulary checks supplement standard 2020-12 syntax checks;
unknown dialects and custom vocabularies remain incomplete. No schema references are
followed, and resource archive roles are not inferred.

The independent Python oracle evaluates official dialect/meta resources directly for
fully known cases. Unknown dialect boundaries are excluded from that oracle rather
than forced through a known meta-schema. Standard object-schema acceptance and the
stronger combined adapter profile are recorded separately.


Typed Reference Object resolution layers declared-role validation over the supplied
URI/pointer map. Each hop records origin and original reference node. A visited
URI/pointer set rejects chains without concrete targets; a hop budget bounds work.
Concrete targets use the same standalone official-object validation helper as the
root adapter. The private dynamic-anchor workaround is shared instead of duplicated.

The API keeps chain and target separate and computes annotation overrides without
flattening native objects. Unsupported `$self` identity handling and schema/anchor
scopes fail. The complete result schema declares its incomplete status and limitations.
Native Python URL/pointer traversal and official target schemas verify the authored
chain and all seven roles, while browser tests exercise the public API.

Schema extraction reuses the role-aware schema-position visitor to authorize selection.
A host-number view is used only for structural traversal; returned schema values come
from the exact native tree, so no host numeric conversion reaches the result. The
entire copied source retains reference context and unknown dialect/vocabulary content.
Retrieval URI is labeled separately from semantic identity. No target JSON Schema
validation claim follows from extracting a fragment.

Static schema scope traverses known schema-bearing keywords from role-discovered roots.
Each location records retrieval URI, pointer, effective base URI and dialect. A separate
identity map rejects collisions and maps URI/anchor aliases to original source positions.
Only explicitly classified standalone schema resources are traversed; arbitrary object
fragments remain preserved. Lookup rebuilds the index from the source, avoiding caller
mutation of a stale index. Results are copied and remain explicitly incomplete.

Dynamic lookup reuses static identity resolution to obtain the initial target, then
checks whether the fragment was defined by a dynamic anchor. The explicitly supplied
resource stack is scanned outermost-first, respecting retrieval aliases and ignoring
ordinary anchors as override candidates. Source-resource ownership is checked at the
stack's innermost entry. No inference of evaluation paths or validator state occurs.
The independent oracle reconstructs the same resource transitions using referencing
and compares resulting native targets. Dynamic instance evaluation remains separate.
