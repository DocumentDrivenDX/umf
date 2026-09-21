---
ddx:
  id: US-031
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-002
      kind: informed_by
---

# US-031: SQL Server schema ingestion

As a schema consumer I need Microsoft SQL Server schemas ingested with usable core
column metadata and complete captured native content retained.

- AC1: Versioned extension, complete payload/capture/result schemas and exact
  recovery through both UMF serializations, including unknown content.
- AC2: Native type identities determine scalar families. Preserve alias/CLR types,
  byte lengths, collation, precision/scale, identity/computed/default definitions,
  nullability and rowversion behavior; never classify timestamp as temporal.
- AC3: Independent native catalog and representative DDL evidence; browser parity.
- AC4: Copied candidate edits synchronize metadata and make stale server correspondence
  explicit; reject conflicting core edits and loss of attached metadata.
- AC5: Robust projections among the five prioritized systems with explicit losses;
  broader DDL, constraints, indexes and system-specific semantics remain in scope.
- AC6: Versioned constraint observations preserve PK/UQ column order, foreign-key
  pairs/actions, checks, trust, disabled and replication state. Distinguish unavailable
  sections from observed empty arrays, retain unknown native content, and verify
  independent native enforcement examples plus browser recovery. Do not promote a
  physical key to domain identity or a SQL check to a portable predicate implicitly.
- AC7: Index observations preserve native type, heap identity, ordering/inclusion,
  partitioning, predicate availability, uniqueness and disabled state. Require
  versioned schemas, unknown-content recovery, browser parity and native enforcement
  counterexamples. Per-index projection loss must remain source-addressable; do not
  promote filtered or disabled uniqueness to unconditional core identity.
- AC8: Generate reviewable native DDL from captured observations under explicit loss,
  alias, physical-layout and source-state policies. Preserve the complete source,
  report unavailable/changed semantics, block unsupported cases without partial SQL,
  and independently execute representative generated schemas with native metadata
  and behavior comparisons. Keep exact capture recovery distinct from DDL lowering.
