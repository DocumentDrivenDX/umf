---
ddx:
  id: CONTRACT-039
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: CONTRACT-038
      kind: informed_by
    - id: CONTRACT-034
      kind: informed_by
    - id: CONTRACT-032
      kind: informed_by
    - id: CONTRACT-035
      kind: informed_by
    - id: US-030
      kind: informed_by
---

# CONTRACT-039: Native source to TableSpec through Avro

`projectToTableSpecViaAvro(source,policy)` composes the existing PostgreSQL, SQL
Server or Parquet→Avro projection with Avro→TableSpec. Policy declares sourceKind,
the complete toAvro policy and complete toTableSpec policy. Each stage retains its
own explicit representation and loss decisions. The function does not guess field
bindings, execute queries or encode rows.

The result retains source, policy, both executed stage results and a combined issue
list. Every issue includes its stage, the path to that stage's source document, and
the unchanged underlying issue. Native issue paths retain their adapter-defined
meaning; the sourceDocumentPath disambiguates which source they describe. Source
database constraints, Parquet annotations/containers and unknown vocabulary remain
available even when the intermediate Avro schema cannot express them. Source-stage
losses cannot disappear merely because the second stage succeeds.

## State and validation

The complete schema is spec/projections/tablespec-via-avro.schema.json. It describes
the discriminated input policies, stage-specific result schemas, three possible
execution states and diagnostic/source-path pairing:

- First stage blocked: second stage is absent, no final target/nativeSchema.
- First stage projected, second blocked: both stage results remain inspectable,
  including intermediate Avro; no final target/nativeSchema.
- Both stages projected: final target/nativeSchema and both complete stage results.

Both policies must be valid, even when first-stage blocking prevents second-stage
execution. Duplicate target column names reject. Each adapter still performs its
own source/representation checks. Structural schema validation cannot establish
cross-document equality; executable tests check stage input/output consistency.
The returned result is copied, including repeated sources/targets, so mutations of
one view do not alter another or caller input. Existing JSON size/depth/value limits
apply to the assembled result; excessive source repetition throws without output.

No new core semantic equivalence is inferred. A chain of permitted losses remains
lossy. In particular SQL formatting choices, restricted decimal/temporal domains,
Parquet map conventions and Avro JSON text encodings still need explicit row encoders.
TableSpec native pipeline enforcement is outside this operation.

## Evidence

Four representative source captures produce valid TableSpec models:

| Source case | Columns | Source→Avro issues | Avro→TableSpec issues |
| --- | ---: | ---: | ---: |
| PostgreSQL scalar catalog | 20 | 24 | 39 |
| SQL Server scalar catalog | 30 | 32 | 50 |
| Parquet nested/logical schema | 13 | 23 | 32 |
| SQL Server indexed Items table | 4 | 9 | 5 |

The indexed case retains three source-addressable INDEX_NOT_REPRESENTED issues
through the second projection. Tests cover both UMF formats, stage-specific strict
blocking, malformed downstream policies, diagnostic path mismatch, unknown vocabulary,
copy isolation and equality of each retained issue list to its producing stage.
The pinned TableSpec Pydantic model validates all four generated schemas and eight
recoveries; its source hash is recorded. Native source/Avro evidence remains scoped
to each stage contract, not newly claimed as composed value-conversion evidence.

Reproduce with `bun scripts/tablespec-via-avro-schema.ts`,
`bun test tests/consumers/tablespec-chain.test.ts tests/avro/tablespec-projection.test.ts`,
`scripts/tablespec-chains-oracle.py` under the TableSpec Python environment and
`bun scripts/tablespec-chains-browser.ts` with Chromium configured. Evidence lives
under fixtures/validation/tablespec-chains*.json.

Validation passes: 5 focused tests / 152 assertions, type checking, 171 schema and
32 package audits, browser build and Chromium 148. Browser evidence covers four
chains, eight recoveries and eight stage-blocking checks, without external requests
or Node globals. This is focused evidence after the earlier 718-test full-suite
baseline. Broader integrations and row conversion remain required; the goal is active.
