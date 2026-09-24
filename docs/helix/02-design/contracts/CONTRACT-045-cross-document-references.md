---
ddx:
  id: CONTRACT-045
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-007
      kind: informed_by
    - id: US-050
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
    - id: CONTRACT-041
      kind: informed_by
    - id: umf.architecture
      kind: informed_by
---

# CONTRACT-045: Offline cross-document references and revision identity

**Type:** proposed core schema/library successor to CONTRACT-001's local reference
surface. **Status:** design proposal; no core schema, public API or migration is
implemented. **Version:** a new experimental envelope version, assigned only
after the owner places this work and collision tests pass.

## Purpose

FR-15–17 require a model consumer to identify a schema element across documents
and revisions. NFR-11 requires deterministic offline use. This contract proposes
revision-qualified references and an explicit package resolver. It extends
CONTRACT-001; its `{role,module,element}` reference remains local forever. A
revision pin is a schema-selection claim, not an instance foreign key, semantic
compatibility claim or permission for UMF to execute a graph query (NFR-50).

## Scope and Boundaries

A successor document adds an opaque `revision` value, and may declare exact
external `dependencies`. An external reference adds a `document` qualifier.
The qualified target is `(document.id, document.revision, module.id,
element.id)`. Equal display names, namespaces or file paths do not participate
in resolution. The stable lineage identity of an element across revisions is
`(document.id, module.id, element.id)`; the revision-qualified tuple identifies
one exact definition. Keeping an ID across revisions makes it traceable but
does not assert unchanged meaning or data compatibility. Renaming an ID creates
a different element unless an explicit later migration maps it.

This design does not alter physical bindings, DDD lifecycle, native FK
enforcement, relation execution or semantic-evolution classification. It does
not authorize reinterpreting `CONTRACT-001` or `CONTRACT-040/041` documents
merely because their unknown fields happen to use `revision`, `dependencies` or
`document` as keys.

## Proposed Normative Surface

| Surface | Shape | Rule |
| --- | --- | --- |
| successor `document.revision` | nonempty opaque string | Exact, case-sensitive token issued by the document owner; immutable for the document content published under that token. It is separate from core-envelope `umf` and extension versions. |
| successor `document.dependencies` | array of `{id,revision}` | Exact external revisions the document is permitted to resolve; duplicate pairs are invalid. An unlisted external reference is invalid even if its target is incidentally present in the package. |
| local reference | existing `{role,module,element}` | Resolves in its containing document, independent of a package. It never searches dependencies. |
| external reference | `{role,document:{id,revision},module,element}` | `document` must be a declared dependency; every identity component matches exactly. A `document` with incomplete ID/revision is malformed, not a local fallback. |
| offline package | manifest with root pin and entries `{id,revision,format,sha256,content}` | `content` is the exact UTF-8 JSON/YAML document byte sequence or a packaged member carrying those bytes. `sha256` is the lowercase digest of those bytes, verified before parsing. The parsed document's `id`/`revision` must match the entry. No URI, search path or network lookup is semantic. |

Revision IDs are owner-issued immutable identities; the SHA-256 digest is an
integrity guard for one packaged byte representation, not the stable semantic
identity. Reformatting may change the digest while leaving lineage identity
unchanged. A package must contain exactly one entry for each referenced pair.
Two entries for the same `(id,revision)` are ambiguous even when their bytes
match; differing bytes additionally produce a revision-content conflict. A
digest mismatch, a parsed ID/revision mismatch, or a package with only a
different revision cannot be repaired by choosing the newest or first entry.
No external resolution occurs outside the root's transitive declared dependency
closure. Package entries outside that closure are retained but cannot satisfy
undeclared references.

### Reference-bearing core members

| Member | Cross-document rule in the successor version |
| --- | --- |
| `Element.references` | Qualified external form allowed; unqualified form stays local. Its `role` remains opaque and does not gain relationship meaning. |
| `Element.itemType` | An explicitly qualified Field target is allowed after the container/item constraints of CONTRACT-040 pass. It does not infer an instance edge. |
| `record-type` role | Qualified target may name an external Record; the role still says field value type/containment by value, not cross-document lifecycle. |
| `Record.keys` components | Must remain fields of the owning Record under CONTRACT-040. An external Field cannot become a component merely because it resolves. A relationship may separately reference an externally defined Record's named key after the key design authorizes that surface. |
| future relationship endpoints and target-key reference | A future revision may qualify endpoint Records and a named target key by document/revision. CONTRACT-041's current exact in-document endpoint rules do not change until that revision's contract and migration are published. |

Extension-owned references remain extension-owned unless that extension declares
an explicit binding to this resolver. Resolving an extension's string as a core
reference by pattern matching is forbidden. Unknown fields, payloads and native
archives remain copied without interpretation.

### Resolver and selection

Resolution is a read-only operation over a supplied package. First verify
manifest uniqueness and digests; parse and validate the root and reachable
documents; then match every qualified target against each document's declared
dependencies and package entries. Errors include a pointer into the referencing
document, the target tuple and the package-entry pointer where applicable.
Reference validity remains separate from syntax and extension semantic validity.
Without a package, a successor document's external references are structurally
preservable but unresolved (`complete:false`); operations that require their
meaning block rather than fetch.

`selectCoreElements(source, query, registry?, package?)` gains a successor
`documentBoundary` choice when `references:transitive` is requested:

| Choice | Selection result |
| --- | --- |
| `stop` | Follow local references as CONTRACT-001 does. Return each external edge in `boundaryReferences`, with source/target revision tuple and reason `document_boundary`; do not include target elements. Resolution status is explicit, not assumed. |
| `follow` | Require a verified closed package. Follow permitted external and local references; include each selected element with its document/revision-qualified identity, source document copy and provenance. Report missing/ambiguous/mismatched targets instead of a partial successful result. |

An old query without `documentBoundary` retains its local behavior (`stop`),
and `references:none` never follows either kind. New authored transitive queries
must choose `stop` or `follow` explicitly. Traversal keys its visited set by
the full revision-qualified tuple; repeated edges remain reportable. Cycles
across documents are legal and terminate on the visited key, with the closing
edge reported as a cycle. A cycle is not a missing dependency. The full source
package and unknown/native content remain recoverable even when selection
returns a subset. A selection result is a metadata view, never a destructive
rewrite or a proof of native dependencies inside unknown extensions.

## Strict, Report and Recovery Rules

Invalid structure or a wrong digest rejects package resolution atomically.
For a projection requiring an external target, `strict` emits no candidate on
any unresolved, ambiguous, mismatched or unsupported crossing. `report` may
emit a complete safe candidate only if it attaches a source-qualified residual
for every unexpressed or unverified reference; it must not substitute a target
revision. Both modes retain the original document, package manifest and native
archives. Ideal→native→ideal with a retained report recovers the qualified
author assertion or an explicit non-recovery residual. Native→ideal→native
recovers bytes outside the claimed ideal; native references observed on import
do not become authored external references without a declaration.

## Diagnostics

| Code | Trigger | Required result |
| --- | --- | --- |
| `EXTERNAL_REFERENCE_UNDECLARED` | Ref pair not in owning document's dependencies | Reject resolution; do not search package extras. |
| `DEPENDENCY_MISSING` | Declared pair absent from package | Reject required resolution; retain source. |
| `REVISION_MISMATCH` | Document ID present only at other revisions, or parsed revision differs from manifest | Reject; list expected and observed revisions. |
| `PACKAGE_AMBIGUOUS` | More than one entry has the same exact pair | Reject regardless of entry order or equal bytes. |
| `REVISION_CONTENT_CONFLICT` | Duplicate pair has differing bytes/digests | Reject and preserve both entries for diagnosis. |
| `PACKAGE_DIGEST_MISMATCH` | Entry SHA-256 differs from its bytes | Reject before using content. |
| `EXTERNAL_TARGET_MISSING` | Verified document lacks exact module/element or permitted named key | Reject; no name-based fallback. |
| `CROSSING_NOT_ALLOWED` | Core member uses external form outside its permitted rule | Reject with member path. |
| `DEPENDENCY_CYCLE` | Traversal revisits a revision-qualified target | Report closing edge; terminate traversal without treating the cycle as invalid. |

Resource limits and JSON/YAML safety rules from CONTRACT-001 apply per document
and to the package as a whole under a published bounded profile. Exceeding a
limit publishes no partial result.

## Precedence, Migration and Rollback

CONTRACT-001 governs older envelopes and local references. A migration to the
successor version archives any pre-existing unknown `revision`, `dependencies`
or reference `document` member before reserving those names. It never guesses
an external target from names or from an old reference's role. The migration
receipt records exact original document bytes/representation, each newly
authored revision/dependency/reference and package pin. Rollback restores the
old envelope and local references exactly while retaining new external claims
in an explicit sidecar/residual; it cannot silently convert them to local
references. Unknown extension content and native archives are copied in both
directions. A changed target revision requires an explicit rebind and a later
FR-18/19 comparison; the resolver does not infer compatibility.

## Example and Counterexamples

Sales revision `s2` declares a dependency on ReferenceData revision `r4`.
`Order.currency` names `{document:{id:"reference-data",revision:"r4"},
module:"catalog",element:"Currency"}`. A packaged `r5` does not satisfy it,
even if `Currency` has the same name and element ID. A bare
`{role:"currency",module:"catalog",element:"Currency"}` remains a local
reference and fails if Sales lacks that local element. An external `itemType`
may name an external Field, but a key in `Order.keys` may not borrow a field of
ReferenceData. A foreign key or imported native `$ref` remains observed native
evidence, not proof that the author declared an external UMF reference.

## Acceptance Evidence and Open Decisions

Before publication, fixtures must pin missing, duplicate, conflicting and
mismatched revisions; digest tampering; same-named cross-document elements;
local/external reference coexistence; every crossing-member rule; a dependency
cycle; stop/follow selection; migration/rollback; unknown/native recovery; and
Bun/Chromium parity. Evidence must name envelope/package versions and bounds.
This proposal has no implementation or native-equivalence claim.

Owner decisions remain: ordered backlog placement; exact public package
serialization (embedded bytes versus bundled members) and resource bounds;
revision-token grammar beyond nonempty exact strings; whether initial delivery
includes all proposed crossing members; and how named key identity from the
key design is embedded in future relationship targets. None may be resolved by
silently changing CONTRACT-001 or releasing a schema before a versioned
migration and rollback contract exists.
