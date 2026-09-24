---
ddx:
  id: CONTRACT-048
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.prd
      kind: informed_by
    - id: umf.architecture
      kind: informed_by
    - id: FEAT-005
      kind: informed_by
    - id: US-053
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
---

# CONTRACT-048: Constraint ideal triage and extension proposal

**Type:** semantic contract proposal. **Version:** design-only v0. **Status:**
draft; no schema, runtime, native oracle or FR-3 admission claim.

## Purpose and boundary

This proposal separates portable declarations about *present values* from native
constraint observations and opaque executable expressions. The consuming graph
engine may enforce declarations; UMF describes, validates their structure,
projects with fidelity reports and retains native sources. CONTRACT-040 remains
authoritative for existing facets, key equality and nullability. DDD's invariant
scope and lifecycle remain in `umf.ddd`; generic row constraints do not acquire
DDD meaning. Index availability remains exclusively physical `umf.binding`
meaning, never a logical field property.

## Triage decision

| Request | Placement proposed | Written meaning and limits | Admission status |
| --- | --- | --- | --- |
| Enumerations | Candidate core `allowedValues` on a Field | Finite, nonempty set of distinct values from one already defined exact-equality scalar domain; membership of a *present* value only. No symbol identity, order, default, collation, rounding or nullability. Initial candidates: boolean, integer, fixed-scale decimal, Unicode scalar string and byte sequence. Float/temporal wait for equality rules. | Not admitted. PostgreSQL and SQL Server CHECK mappings and a restricted Avro enum mapping appear useful, but exact value/oracle and round-trip evidence is pending. |
| Numeric range | Candidate core `range` on a Field | Optional minimum/maximum with independent inclusive flags; present exact integer or fixed-scale decimal value is ordered mathematically, not by native collation or floating representation. At least one bound; minimum must not exceed maximum, and equal exclusive bounds define an empty domain and are rejected. | Not admitted. Two SQL CHECK mappings require bounded exact-token and value-oracle proof. |
| Temporal range | Defer behind temporal-facet decision | Ordering requires a defined instant/civil distinction, unit, offset policy and exact comparator. | No admission case yet. A timestamp string or native SQL comparator cannot supply these decisions. |
| Minimum length | Candidate core addition to `facets.length`, alongside existing `max` | Nonnegative lower bound in the same unit (`unicode-scalar` for string, `byte` for binary), on a present value. If both are set, `min <= max`; absence is governed separately. No grapheme count, padding or SQL byte/UTF-16 equivalence inference. | Not admitted. PostgreSQL and SQL Server CHECK mappings need exact unit/encoding and value-oracle evidence. |
| Pattern | Proposed published `umf.constraints` extension | Opaque source, declared regex dialect and version, field reference, interpretation status. A consumer may opt in to a dialect; UMF does not claim cross-dialect equivalence. | Not core: a bare pattern has no dialect-independent match meaning; two useful *equivalent* priority mappings are unproved. |
| Record-level invariant | Proposed published `umf.constraints` extension | Opaque expression with declared language/version, Record reference, declared field dependencies and `preserved-but-uninterpreted` status. Distinct from DDD aggregate invariants. | Not core: generic cross-field expression semantics and portable enforcement are unproved. |

No candidate enters `spec/core/` merely because this table names it. The owner
sets backlog position after FEAT-005/PRD alignment; each candidate needs its own
normative versioned contract, at least two useful priority down-projections,
up-classification retaining native detail, migration/rollback and all-five
delivery work. A rejected candidate must remain representable in a published,
versioned extension with a fidelity report. This draft is not that publication.

## Proposed surface and precedence

The following names describe a prospective contract, not an active JSON Schema:

| Member | Shape | Rule |
| --- | --- | --- |
| `Field.allowedValues` | nonempty list of exact scalar values | One scalar domain; canonical equality from CONTRACT-040 where defined. Duplicate equal values reject. List order has no semantic force. |
| `Field.facets.range` | `{min?: exactValue, minInclusive?: boolean, max?: exactValue, maxInclusive?: boolean}` | At least one bound; flags default to `true` only when their bound exists; reject an unpaired flag. Exact decimal value must match declared scale without rounding. |
| `Field.facets.length.min` | nonnegative exact safe integer | Same unit as `max`; independently meaningful without `max`; no host-number rounding. |
| `umf.constraints.pattern` | `{field, source, language, version, status}` | `source` is opaque; unknown language/version is preserved, not interpreted. No implicit ECMA-262, XSD, POSIX or PCRE translation. |
| `umf.constraints.invariant` | `{record, source, language, version, fields, status}` | `fields` is an explicit dependency list, not an executable data path; status is preserved-but-uninterpreted unless a separately versioned interpreter is evidenced. |

An authored declaration MUST remain distinct from classified native evidence.
Up-classification of a native CHECK, enum or annotation MAY report a candidate
semantic interpretation with its source and qualifications; it MUST NOT invent an
authored declaration. Native constraint enabled/trusted/validated state, defaults,
collations, casts, functions, regex flags and original expression text remain in
the native extension. Unknown/future members survive unchanged. A consumer MUST
NOT use an observed constraint or index as proof of author intent or of all-row
conformance. No operation here executes an expression or inspects user rows.

## Five-system projection ledger to prove before promotion

Outcomes below are *design hypotheses*, not qualified adapter behavior. `R`
means residual required when the target cannot state the full authored obligation;
`Q` means a useful qualified mapping is plausible after native value tests. Exact
outcomes remain unclaimed until independent oracles pass.

| Candidate | TableSpec | PostgreSQL 17 | SQL Server 2022 | Avro 1.12 | Parquet format |
| --- | --- | --- | --- | --- | --- |
| Allowed values | R unless a versioned validator suite is attached and scoped | Q: simple typed CHECK `IN` under exact comparator; native enum has extra order/name detail | Q: simple typed CHECK `IN`; collation and disabled/untrusted state qualify | Q: named string enum only for legal Avro symbols; order/default/name retained separately; otherwise R | R: ENUM annotation has no symbol set; statistics are observations, not domain bounds |
| Numeric range | R unless a scoped validation rule is proven | Q: typed `>=`/`>` and `<=`/`<` CHECK on compatible exact number | Q: same, with conversion/trust qualifications | R: schema has no standard min/max value constraint | R: page/row-group min/max statistics describe data, not allowed values |
| Minimum length | R unless a scoped validation rule is proven | Q: qualified scalar/byte length CHECK; reject padding or encoding mismatch | Q: qualified length CHECK; UTF-16, bytes, padding and trailing spaces require native proof | R: fixed is exact byte count, not general minimum; custom property unenforced | R: fixed-length binary is exact size, not a minimum; no value-domain assertion |
| Pattern | R or native extension | Native POSIX-family regex remains dialect-specific | Native LIKE/PATINDEX/other expression remains dialect-specific | R/custom metadata | R |
| Row invariant | R or native extension | Native CHECK expression and validation state retained | Native CHECK expression and trust/enabled state retained | R/custom metadata | R |

For every cell, the eventual binding MUST report exact, approximate, residual or
blocked with a path, native version/subset and independent evidence. Strict mode
MUST block any requested non-exact obligation without emitting a partial target;
report mode MAY emit a safe candidate only with a residual for every loss. The
source ideal, projection report and original native archive remain separate.
Ideal→native→ideal MUST recover author intent from retained provenance or report
its loss; native→ideal→native MUST recover native bytes outside the ideal's claim.
Neither direction authenticates author intent from a bare native artifact.

## Counterexamples and error semantics

| Condition | Required outcome |
| --- | --- |
| Avro enum `['z','a']` with default `a` | Preserve symbol order, named type and reader-resolution default. An unordered allowed-value set cannot replace the Avro type. [Avro 1.12 specification](https://avro.apache.org/docs/1.12.0/specification/). |
| Parquet ENUM annotation | Do not infer the allowed symbols; ENUM denotes an annotated UTF-8 string. [Parquet logical types](https://parquet.apache.org/docs/file-format/types/logicaltypes/). |
| PostgreSQL `CHECK ... NOT VALID` | Preserve validation state; new writes may be checked while old rows remain unverified. [PostgreSQL 17 ALTER TABLE](https://www.postgresql.org/docs/17/sql-altertable.html). |
| SQL Server disabled, untrusted or replication-exempt CHECK | Preserve all three catalog flags; do not assert existing-row conformance or unconditional new-write enforcement. [SQL Server catalog](https://learn.microsoft.com/en-us/sql/relational-databases/system-catalog-views/sys-check-constraints-transact-sql?view=sql-server-ver17). |
| SQL CHECK evaluates UNKNOWN on NULL | Do not treat CHECK as Nullability. The ideal value bounds concern present values; exact enforcement requires separate nullability evidence. [SQL Server CHECK semantics](https://learn.microsoft.com/en-us/sql/relational-databases/tables/unique-constraints-and-check-constraints?view=sql-server-ver17). |
| ECMA-262, XSD, POSIX or PCRE regex source | Preserve dialect and version. No conversion or equivalence claim without a separately evidenced translator. |
| Opaque row predicate | Report `preserved-but-uninterpreted`, including language/version and dependencies. Structural validation is not evaluation. |
| Rounded numeric literal or impossible interval | Block atomically with source path; retain original document for correction. |

## Migration, rollback and open decisions

Future core representation MUST use a new envelope version with an explicit
migration that archives any colliding unknown member before interpretation.
Rollback restores the exact old document and separately retains new assertions.
Neither an existing native enum/CHECK nor a legacy facet-shaped member silently
acquires author provenance. Extension documents require independent package
versioning and unknown-content preservation.

Open decisions for the owner and follow-on design: backlog position after the
current key/relationship gate; whether finite sets should exclude binary or
support them with a canonical JSON carrier; exact TableSpec validator-suite
scope; whether pattern needs an interpreter registry at all; how row expression
dependencies resolve across documents; and whether temporal ordering later
permits temporal ranges. Resolve each before schema or runtime work. Native
value oracles must include Unicode normalization, SQL collation, NULL/UNKNOWN,
decimal scale, integer boundaries, padding and CHECK validation-state cases.

## Validation checklist

- [x] Proposed meaning, counterexamples and extension boundary are explicit.
- [x] All five priority targets have a hypothesis or residual, with source
  recovery obligations and no false native-enforcement claim.
- [ ] Two independently evidenced priority mappings for any core candidate.
- [ ] Versioned schema, migration/rollback, native/browser oracle results and
  owner placement. These remain future work, not implied by this proposal.
