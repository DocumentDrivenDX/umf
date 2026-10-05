---
ddx:
  id: umf.current-state-inventory-ecosystem
  type: current-state-inventory
  activity: discover
  status: draft
  authoring:
    home: repo
  links: []
---

# Current-State Inventory: UMF ecosystem

## Scope and Boundary

- Estate: local UMF, TableSpec, Truss and Ashlar repositories, assessed against
  the owner's shared-schema/import/query workflow.
- Surveyed: 2026-10-04; source and existing evidence inspection only.
- Excluded: fresh execution, exhaustive implementation audit, production
  environments, real datasets, performance qualification and external research.
- Owner: project owner Erik; component maintainers own their native contracts.

Repository documents and checked-in tests attest scoped behavior; this survey
does not refresh their test results. Root READMEs and AGENTS.md contain historical
status in places. Ashlar's current framing is further along than those summaries.

## Evidence Grades

| Grade | Meaning |
| --- | --- |
| Evidenced | Named source attests existence and scoped behavior; no fresh execution implied. |
| Partial | Exists, with a design-defining integration fact unrecorded. |
| Assumed | Claimed without a supporting source. |
| Aspirational | Requested or planned capability without implemented evidence. |
| Spike-open | Unknown blocks a design decision. |

## Inventory

All sources below were inspected on 2026-10-04. Grouping is by capability.

| Component | Supplier / incumbent | Grade | Evidence and boundary |
| --- | --- | --- | --- |
| Logical schema authoring | UMF | Evidenced | [README](../README.md), [CONTRACT-040](../02-design/contracts/CONTRACT-040-core-ideals.md), [CONTRACT-041](../02-design/contracts/CONTRACT-041-relationship.md): core 0.7.0 includes fields, nullability, cardinality, facets, keys and authored relationships; no universal native equivalence. |
| Physical binding metadata | UMF | Evidenced | [CONTRACT-042](../02-design/contracts/CONTRACT-042-physical-binding.md): `umf.binding` 0.2.0 references stable relationship IDs and separates logical identity from physical choices; a binding declaration does not establish executable target storage. |
| Selected schema conversion | UMF | Evidenced | [Architecture](../02-design/architecture.md), [implementation evidence](../04-build/implementation-plan.md): scoped native adapters and directed projections, with retained meaning and strict/report losses. PostgreSQL 17.4, SQL Server 2022 and GraphQL generators have separate evidence; arbitrary source/target conversion is unclaimed. |
| Native TableSpec bridge | UMF | Evidenced | [CONTRACT-030](../02-design/contracts/CONTRACT-030-tablespec.md): monolithic/split import, copied edits and retained native recovery; native pipeline execution and arbitrary core-to-TableSpec lowering are separate. |
| UMF-native TableSpec compiler | TableSpec / no native port | Aspirational | Compiler (tablespec: src/tablespec/e2e/compile.py) consumes `tablespec.models.umf.UMF`; that model (tablespec: src/tablespec/models/umf.py) is the legacy table format. The owner selected a native port as the first integration goal in [vision input](vision-input.md#owner-clarification-tablespec-becomes-umf-native-first). |
| Compiled table pipeline | TableSpec | Evidenced | Manifest (tablespec: src/tablespec/e2e/manifest.py), backbone (tablespec: src/tablespec/e2e/backbone.py), matrix tests (tablespec: tests/e2e/test_e2e_matrix_spark.py): native table-format inputs compile ingestion, validation and gold artifacts; execution adapters have differing capabilities. |
| Ordinary Delta ingestion artifacts | TableSpec | Evidenced | Incremental fixture (tablespec: tests/golden/ingest_sql/incremental_pk.expected.sql), backbone (tablespec: src/tablespec/e2e/backbone.py): Delta DDL/MERGE and classic Spark Delta writes exist. Sail's local path executes a materialized SELECT instead of Delta MERGE; remote evidence must be qualified independently. |
| Mutable property-graph runtime | Truss / no implemented runtime | Aspirational | Project state (truss: docs/helix/README.md), instructions (truss: AGENTS.md): accepted portable TypeScript/Bun and generic PostgreSQL storage ADRs; no framed PRD, graph runtime or query API. |
| Warehouse graph schema/query package | Ashlar / no implemented package | Aspirational | Project state (ashlar: docs/helix/README.md), PRD (ashlar: docs/helix/01-frame/prd.md): draft UMF graph profile, gold Delta schema package and bounded graph query requirements; physical contract and native execution evidence absent. |
| Immutable graph publication | Ashlar / no implemented contract | Aspirational | Owner direction in [vision input](vision-input.md); Ashlar PRD Q3 leaves history, deletion and snapshot visibility open. Storage in Delta does not establish immutable graph revisions. |
| TableSpec graph sinks | No incumbent | Aspirational | TableSpec's inspected manifest/backbone define table execution paths; no Truss/Ashlar importer contract or implementation was identified in this survey. The destination APIs do not yet exist. |
| Shared three-backend query generation | No incumbent | Aspirational | [FEAT-006](../01-frame/features/FEAT-006-authored-relationships-bindings.md) excludes query execution; Truss leaves its language open and Ashlar FR-3 awaits design. No common query representation/compiler or three-target result evidence was identified. |

## Totals

| Grade | Count | Share |
| --- | --- | --- |
| Evidenced | 6 | 50% |
| Partial | 0 | 0% |
| Assumed | 0 | 0% |
| Aspirational | 6 | 50% |
| Spike-open | 0 | 0% |

Six of twelve surveyed capabilities have no evidence of implementation.
These counts grade capabilities, not total code completeness or test coverage.

## Open Questions

| ID | Question | Blocks | Owner |
| --- | --- | --- | --- |
| Q1 | Which external source and synthetic relationship model anchor the first proof? | Native source contract and corpus | Erik |
| Q2 | How are source keys reconciled into node and association identities, including parallel edges? | Imports and result comparison | Erik with graph maintainers |
| Q3 | What does immutable Ashlar publication guarantee for updates, deletion, revision visibility and retention? | Publication/read consistency | Erik with Ashlar maintainer |
| Q4 | Which query subset, multiplicity and null/absence rules are common across targets? | Portable query contract | UMF and consumer maintainers |
| Q5 | Which TableSpec version, UMF revision/vocabularies, PostgreSQL version and Databricks runtime/Delta profile are supported? | Reproducible native evidence | Component maintainers |
| Q6 | Where does the portable query compiler live, and how do Python TableSpec and TypeScript UMF exchange retained receipts? | Packaging and executable integration | Component maintainers |
| Q7 | Does the owner want the same query executed separately per backend, or eventual cross-backend federation? | Query scope | Erik |
| Q8 | What versioned semantic subset, public API and conformance evidence constitute UMF finalization for the native TableSpec port? | First integration milestone | Erik with UMF/TableSpec maintainers |

The [owner direction](vision-input.md#owner-direction-shared-schema-ingestion-and-backend-queries)
contains the requested future workflow and a proposed first proof, separate from
this inventory of current capability.
