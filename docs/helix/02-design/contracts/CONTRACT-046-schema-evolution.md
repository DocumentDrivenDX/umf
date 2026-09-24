---
ddx:
  id: CONTRACT-046
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-007
      kind: informed_by
    - id: US-051
      kind: informed_by
    - id: CONTRACT-045
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
    - id: CONTRACT-041
      kind: informed_by
    - id: umf.architecture
      kind: informed_by
---

# CONTRACT-046: Comparison of pinned user-schema revisions

**Type:** proposed read-only library/report contract under FR-17–19. **Status:**
design proposal; no comparator, report schema or core-schema change is
implemented. **Version:** proposed `umf-schema-diff-v1`, contingent on the
revision/package contract in CONTRACT-045.

## Purpose and Boundary

Given two explicitly pinned revisions of the same user-schema document, produce
a deterministic, source-anchored change report. This compares author assertions
and known ideal value domains. It does not migrate an envelope from core 0.x to
another version, modify stored rows, decide a target's native compatibility, or
execute constraints (NFR-50). An Iceberg-native evolution operation and Avro
reader/writer resolution remain native rules, not shortcuts to a UMF-wide
`compatible` flag. Both complete source packages, including unknown fields,
extension payloads and native archives, remain recoverable.

## Inputs, Identity and Preconditions

The operation receives `(oldPin, oldPackage, newPin, newPackage, profile)`.
Each pin is `(document.id, document.revision)` verified as CONTRACT-045
requires. The two documents MUST have the same exact document ID and distinct
revision IDs. The comparator verifies each package closure independently,
without network access or choosing a nearby revision. A same-pair content
conflict, unresolved required dependency, invalid digest, unsupported core
version, or ambiguous stable identity prevents a complete semantic report; a
diagnostic retains both inputs. Resource limits apply to both packages and
their combined traversal.

Within one document lineage, module and element IDs match independently of
display names or list order. Within a Record, named keys match by stable key
ID (CONTRACT-040), not their name or position. A missing old ID and a new ID
are removal and addition; similarity is not a rename proof. Exact
revision-qualified reference targets are compared as tuples. A cross-document
target revision change is a changed assertion even if its document, module and
element IDs remain the same. Resolved cycles use visited keys containing
document ID, revision, module ID and element ID, and terminate with a cycle
record. A dependency closure that cannot be verified may still yield a
structural diff, explicitly `complete:false`, but no effect that relies on the
missing target is inferred.

## Report Shape and Classification

Every assertion entry includes `assertion` (stable vocabulary member),
`change` (`added`, `removed`, `changed`), `effect` (`widens`, `narrows`,
`reinterprets`, `unknown`), old/new revision-qualified owner identity,
old/new JSON pointers (absent side explicit), copied old/new values or their
lossless source references, rule ID, and `obligations`. A report also gives
`complete`, diagnostics, dependency/cycle inventory, coverage version and
source/package receipts. Entries sort by stable identity, assertion path and
change kind, not source list order. Never emit a partial candidate that looks
like a complete compatibility conclusion.

`widens` and `narrows` refer only to inclusion of accepted ideal instance
values under the stated assertion and unchanged relevant context. They do not
prove old rows exist, satisfy R2, or remain usable by references. `reinterprets`
means the meaning or identity of an accepted value changes, or the domains are
not ordered by the known rule. `unknown` means the available semantics do not
justify any of those three. An unchanged assertion has no change entry. A
material schema-wide label is not inferred by taking the most favorable entry:
mixed changes, unknowns and dependency failures remain explicit. A consumer
requiring an unconditional `safe-to-migrate` result must receive no such claim
for narrowing, reinterpretation, unknown effect, or incomplete coverage.

The summary distinguishes: byte-identical source; textual-only differences
with identical parsed representation; representation-only differences whose
understood ideal assertions are identical but whose native/opaque
representation changed; proven ideal equivalence within a stated coverage
profile; and material or unknown semantic differences. No claim of equivalence
extends to unavailable extension semantics or native archive content. If an
opaque payload changes, the report says `unknown`, not `compatible`.

## Initial Assertion Rules

| Assertion | Stable comparison and justified effect | Obligation or limit |
| --- | --- | --- |
| `Element.kind` | Same token is unchanged; changing field/record/group `reinterprets`. Addition/removal is `unknown` without a closed-record policy. | Review stored record shape and dependent references. |
| `scalarType` | Same family is unchanged; family change `reinterprets`. Missing versus present is `unknown`. | Consumer/native mapping and existing-value check; no implicit coercion. |
| `nullability` | `required` → `absent-allowed` `widens`; reverse `narrows`. Any transition involving `unspecified` is `unknown`. | Narrowing requires a missing-value scan or explicit migration; present null remains separately native. |
| `cardinality` | Same token unchanged; `one`/`array`/`map` changes `reinterprets`; any transition involving `unspecified` is `unknown`. | No inferred graph-edge or record-relationship multiplicity. |
| `facets.length.max` | Same unit, scalar family and all other context fixed: larger max `widens`, smaller max `narrows`; unit change `reinterprets`. | Tightening requires a value-length scan in the stated unit. |
| `facets.precision` | At fixed scale and scalar family, larger precision `widens`, smaller `narrows`; changing scale `reinterprets`. | Check exact decimal coefficients; no rounding. |
| `facets.integerWidth` | At fixed signedness, larger bits `widens`, smaller `narrows`; signedness change is `reinterprets` unless separately proven. | Check integer bounds, not a host-number approximation. |
| named `Record.keys` | Match by key ID. Same ordered fields and marker unchanged; component/order/identity change `reinterprets`. New key generally `narrows` uniqueness assertion; removed key `widens` that assertion, but any dependent reference or default-primary change makes aggregate impact `unknown` until checked. | New/tightened key requires duplicate/absence checks. Never infer an authored key from a native unique index. |
| `Element.references` | Compare exact role and revision-qualified target tuples, preserving repeated entries. A changed target or role `reinterprets`; addition/removal has `unknown` data effect. | Resolve both sides independently. `references` remains a schema link, not a relationship. |
| understood extension assertion | Use only the exact version's declared comparator and its own proof/coverage; otherwise `unknown`. | Never silently apply a comparator from another version. |
| opaque/unknown extension payload | JSON-value change, addition or removal is `unknown`; identical retained payload has no entry. | Copy both original payloads. No generated compatibility claim. |

The rules above apply per assertion, not by guessing a record-level conjunction.
For a newly added required Field, report its addition with `unknown` overall
record acceptance plus a mandatory existing-row completeness check; for a
removed Field, preserve both source definitions and report dependent references.
Neither operation assumes a closed-world record shape. An absent field value
and a present empty string remain distinct; the former cannot satisfy a key.
Relationship assertions from CONTRACT-041 enter coverage only after their
target-key/multiplicity revision is settled and delivered. Until then, changed
relationship content is retained with `unknown` effect.

## Strict/Report Use, Diagnostics and Recovery

Comparison itself is observational and always returns its report when both
sources are parseable; it does not create a migrated document. In `strict` use,
an operation that requires complete proven acceptance MUST block on any
`narrows`, `reinterprets`, `unknown`, unverified dependency or unrecognized
assertion it relies on. In `report` use, it may return a proposed target plan
only with residuals and obligations for every unsupported assertion; no
implicit substitute revision or partially migrated candidate is emitted.
Both modes retain the old and new source bytes, parsed documents, packages and
native archives. Report paths locate the old and new values separately.

Diagnostics distinguish `DIFF_DOCUMENT_ID_MISMATCH`, `DIFF_REVISION_CONFLICT`,
`DIFF_DEPENDENCY_UNRESOLVED`, `DIFF_UNSUPPORTED_PROFILE`,
`DIFF_IDENTITY_AMBIGUOUS` and `DIFF_UNKNOWN_SEMANTICS`; CONTRACT-045 package
diagnostics remain intact. A changed element ID is not silently mapped; a
removed target key leaves a dependent relationship unresolved rather than
retargeting the primary key. A cycle is reported but is not itself an error.

## Evidence, Migration and Open Decisions

The fixture corpus MUST include the R1/R2 sales and shared-reference package,
formatting-only edits, equivalent representation, old/new ID changes, changed
cross-document target pin, a dependency cycle, missing and mismatched pins,
required↔absent-allowed, max length 50→20 and reverse, precision and scale,
integer width, scalar family and cardinality changes, key tuple/primary changes,
and changed unknown extension bytes. Each result pins report order, paths,
effect rules, obligations, full source recovery, Bun/Chromium parity, and an
explicit native-rule nonclaim. Add optional native oracle examples only to
show where Avro/Iceberg/PostgreSQL conclusions differ; never use them as the
comparator's authority.

Envelope migration and rollback remain governed by CONTRACT-045 and each core
ideal's version transition. The comparator operates only after each source is
decoded under its own declared profile; it cannot migrate old opaque members
by matching their spelling to a new ideal. Rollback of any downstream migration
retains the diff receipt and both original inputs. The owner must place this
proposal after revision identity, decide whether the first delivery compares
all listed assertions or a smaller explicitly incomplete profile, define
extension comparator registration and bounds, and settle relationship coverage
after its target-key design. No `spec/core/` or `src/` change follows from this
proposal alone.
