---
ddx:
  id: CONTRACT-042
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-006
      kind: informed_by
    - id: US-046
      kind: informed_by
    - id: US-047
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-005
      kind: informed_by
    - id: CONTRACT-041
      kind: informed_by
    - id: CONTRACT-015
      kind: informed_by
---

# CONTRACT-042: Independent physical binding and indexes

**Type:** extension schema/library. **Vocabulary:** `umf.binding` 0.1.0.
**Status:** draft semantic authority before package/schema publication.

## Purpose

Bind an independently versioned logical model to one physical target without
changing logical identity or meaning. Store target-shaped layout and index
choices in a published extension with explicit fidelity, not in core or DDD.
One logical model may have several binding documents.

## Scope and Boundaries

A binding is a separate UMF document whose document-scoped `umf.binding`
extension payload references exactly one supplied logical document. The binder
does not fetch that document over a network. The caller supplies it explicitly;
the binding's declared identity/version must match before interpretation.
The binding document's own `id` and vocabulary version evolve independently
from the logical document. It may contain ordinary unknown content, which must
survive JSON/YAML read/write. The extension package permits document scope only.

## Normative Surface

| Member | Shape | Required | Rule |
| --- | --- | --- | --- |
| `profile` | `umf-binding-1` | yes | Selects the 0.1.0 payload profile. |
| `logical` | `{documentId, coreVersion}` | yes | Exact match to supplied logical document `id` and `umf`; no name/namespace inference. |
| `target` | `{system, version, subset}` | yes | Nonempty target identifiers; one binding payload chooses one target. |
| `elements` | ordered array of element bindings | yes | Each entry has exact `{module,element}`, optional `partition` family name or explicit `null`, optional `table` name; duplicates invalid. |
| `fields` | ordered array of field bindings | yes | Each has exact `{module,element}` for a logical Field and `storage` of `column` or `embedded`; `embedded` also requires a containing document column and nonempty declared path. |
| `relationships` | ordered array of relationship bindings | yes | Each has exact `{module,name}` for CONTRACT-041 and `storage` of `edge`, `foreign_key`, `junction` or `inline`. |
| `indexes` | ordered array of index declarations | yes | Physical capability declarations described below; duplicate names within the binding target/table scope invalid. |

An empty array means no authored choice, not a target default. Logical IDs are
exact; target names are separate names and never replace them. An element with
no table override requires an explicit generator naming policy; it cannot
silently take a display name. A partition family names a physical layout
choice; target-specific partition syntax and keys require an additional
target binding or remain a residual. Embedded paths use an ordered array of
nonempty string segments; no implicit JSONPath execution is permitted. A
`column` field has no embedded path. `edge` means one association row in a
shared adjacency table with relationship-name discriminator; it is not a core
relationship kind. `inline` requires a target-specific definition. Physical
choices do not alter DDD aggregate/equality or CONTRACT-041 endpoint meaning.

### Index declaration

| Member | Shape | Required | Rule |
| --- | --- | --- | --- |
| `name` | nonempty string | yes | Unique in its target table scope. |
| `kind` | `btree`, `hash`, `gin`, `gist`, `expression`, `partial`, `unique`, `clustering` | yes | Target-shaped kind; no logical field implication. |
| `on` | nonempty ordered array | yes | Each entry is either `{field:{module,element}}` for a storage column or `{documentPath:{field:{module,element},path:[segments]}}` for an embedded field. Duplicate ordered entries are invalid. |
| `predicate` | `{language,version,expression}` | no | Required for `partial`; forbidden otherwise. Text is opaque, declared and unenforced by UMF. |
| `unique` | boolean | yes | `kind:unique` requires `true`; `true` with another kind requests unique enforcement under that access method and needs target proof. `clustering` cannot be unique. |
| `include` | ordered array of field references | no | Included fields must have column storage in this binding; no duplicate or overlap with `on`. Target support is separate. |

The index declaration also binds to exactly one physical table through its
referenced element binding; targets spanning tables are invalid. Its `on`
order is semantically significant. A document path projects to an expression
index only when the target adapter can prove the expression's type, quoting,
collation and path behavior for the declared subset. An opaque predicate's
syntax may be checked by the target oracle, but UMF does not execute it or
prove its business rule. **Index availability is physical capability. It MUST
NOT appear in or be inferred from a field's logical definition.** Consumers
MUST inspect the selected binding and its support report before calling a
field filterable or sortable.

The operation result carries copied logical and binding sources, provenance,
target/version/subset, exact/approximated/not-expressible/unknown outcomes,
source paths, residuals and optional complete candidate. Strict blocks a
requested non-exact choice with no candidate. Report may emit a complete safe
candidate only with every loss residualized. A binding→native→binding cycle
with the retained report recovers each authored choice or its residual;
native→binding→native recovers all unclaimed original text/bytes and unknown
content. A native catalog observation MUST NOT create authored binding intent.

### Target profiles

| Target | Initial index/layout support | Residuals and limits |
| --- | --- | --- |
| PostgreSQL 17 | Declared btree/hash/gin/gist access methods, expression, partial and unique forms, subject to parsed DDL and isolated native verification; JSONB path can use a verified expression. | `clustering` is residual; arbitrary expression semantics, partition key and collation are not assumed. |
| SQL Server | Scoped rowstore btree/unique and filtered predicate form under declared catalog/DDL profile. | gin/gist and PostgreSQL-specific expression/path syntax residual; native disabled/filter/trust details stay native. |
| Delta | Explicit supported liquid-clustering columns under pinned Delta version. | Other index kinds residual; embedded struct/variant paths need their own target evidence. |
| Iceberg | Explicit sort-order analogue under pinned Iceberg version. | Sort order is an approximation to clustering, not index enforcement; other kinds residual. |
| Parquet | No declared index enforcement in the initial file schema profile. | Every index kind and most physical layout choices residual, not dropped. |

PostgreSQL/SQL Server are first generator targets. Delta/Iceberg/Parquet
profiles require their own versioned evidence before direction claims. A
PostgreSQL catalog index captured by CONTRACT-015 is observed native evidence
even when its spelling matches an authored declaration; classification retains
its original source and never invents author intent.

## Precedence and Compatibility

Core and `umf.ddd` govern logical identity/meaning; this extension governs
only physical choices for its declared target. A changed logical ID/version,
unresolved field or relationship, duplicate target assignment or conflicting
binding blocks interpretation rather than reassigning by name. The binding
document can be migrated independently with an original-content receipt;
rollback retains choices unsupported by an older package as explicit residuals.
No binding removes native archives or overrides an authored ideal. Unknown
future kinds remain recoverable but cannot be safely projected by 0.1.0.

## Error Semantics

| Condition | Outcome | Recovery |
| --- | --- | --- |
| Logical document mismatch, unresolved exact ID or stale version | Block with binding/source paths, no candidate | Supply matching model or explicit migration |
| Duplicate table/index target or invalid path/ordered list | Invalid binding, original untouched | Correct binding |
| Unsupported physical kind/path | Strict block; report residual if complete safe candidate exists | Change target or retain report |
| Unknown extension content affecting output | Preserve, mark incomplete and block unsafe operation | Install exact package or use read/write recovery |
| Unsafe SQL expression or unverified target behavior | Block even in report mode | Use declared safe subset and native oracle |

## Examples

An Order field `details` can be bound to PostgreSQL JSONB column `payload`
at path `["customer","region"]`, with an expression index over that path.
The same logical field may be bound to a Delta struct with clustering on an
independent column. Neither binding changes Order's identity or the field's
logical definition. Hohfeld reported a planner estimate of one row against
300,000 actual rows and a 21-minute query versus 1.7 seconds with a pinned
partition key; this consumer-supplied observation motivates inspectable index
metadata, not a UMF query-planning or performance guarantee.

## Validation Checklist

- [x] Separate versioned attachment, target scope and logical-reference rules are explicit.
- [x] Index declarations and the physical-only capability rule are explicit.
- [x] Strict/report, recovery, migration and native-observation boundaries are explicit.
- [ ] Each target profile requires fresh versioned native/browser evidence before support claims.
