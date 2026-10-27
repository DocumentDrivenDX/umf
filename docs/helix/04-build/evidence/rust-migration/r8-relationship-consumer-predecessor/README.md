---
ddx:
  id: umf.evidence.rust-migration.r8-relationship-consumer-predecessor
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-041
      kind: informed_by
---

# Relationship consumer predecessor packet

The [frozen packet](predecessor.json) records TypeScript behavior before routing
the six public relationship projection consumers through Rust operations. Its
18 cases cover one projected report, one blocked report, and one request
accessor refusal for each of Avro, TableSpec, SQL Server, Parquet, Extras, and
PostgreSQL. The accessor controls record zero getter calls and `NON_JSON`
errors. The packet SHA-256 is
`63b3192b3328eecb9d76790f8f4170e7754b17d8e25fce7bb4e690755a440ba1`.
Each case carries input, outcome, and trace hashes; the packet records source
and capture-script hashes.

Reproduce with `bun scripts/rust-migration/r8/relationship-consumer-predecessor.ts --check`
on the recorded Bun version and source closure. The capture imports the
TypeScript consumer modules directly and, for PostgreSQL, uses the existing
native AST backend. It does not test a Rust route, installed SDK, browser
bundle, or native adapter equivalence. Extras covers GraphQL only; PostgreSQL
covers two selected reports rather than its full matrix. Before any of these
consumer routes changes, add composed success/refusal and source/current
ordering cases where this packet has gaps, then replay the frozen outcomes
through the source-current installed Node, Bun, and Chromium package routes.
