---
ddx:
  id: umf.evidence.rust-migration.r8-symbol-inventory-sol-review
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.evidence.rust-migration.r8-symbol-inventory
      kind: informed_by
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: TP-001
      kind: informed_by
---

# Independent Sol review: moving R8 inventory

Sol inspected the current V4 root selection derivation, the resource writer
chains and the five `src/model/types.ts` export dispositions. The correction
from a static 29-name list to TypeScript-checker-resolved direct exports yields
37 selected names in each Node and browser root. This changes source-selection
evidence; it does not retire the selected TypeScript declarations. The ledger
still counts 922 logical executable retirement gaps, including `./reference`.

The six newly proved TableSpec, PostgreSQL and SQL Server Field/Cardinality
projection schemas each have a direct writer and source-input chain. Sol reran
their read-only writer checks and focused tests: TableSpec/PostgreSQL 13/13,
SQL Server 4/4, TableSpec Cardinality 2/2 with 413 assertions. These are source
authority proofs, not installed archive or native acceptance proofs.

Sol found that two recorded direct `SCALAR_TYPES` callers were absent from the
model-vocabulary supplement's hash closure. They were added before review.
The four frozen arrays are generated data aliases; `scalarTypesForVersion` is
authored executable version-gating behavior. None has a proved Rust binding
route. Sol reran the full Node ledger suite after the fix: 24/24 passed. At
that moving-source checkpoint the ledger records 30 generated-authority-known,
13 authored-authority-known, 93 candidate-generated and 62 unresolved resource
files. Its SHA-256 is
`5ed4c681422756ea16835905e810e21eba739ef6623d22893e75f95a1b70f23d`.

Concurrent Rust/JS edits require a final synchronized inventory and ledger
recapture. No current installed package, retirement or release claim follows
from this review.

In a subsequent Parquet metadata resource checkpoint, Sol inspected the
two-output writer and independently reran its read-only `--check`, linked
metadata tests (3/3, 226 assertions) and complete ledger suite (26/26). The
writer reads the pinned IDL and footer-decode schema and emits only the metadata
and metadata-inspection schemas. Each output has a direct writer mapping and
source closure; imported inputs do not gain transitive authority. The moving
ledger now classifies 32 generated-known, 13 authored-known, 91
candidate-generated and 62 unresolved resource files, while the same 922
executable retirement gaps remain. This does not prove installed archive bytes
or native Parquet acceptance.

Sol also reviewed the [AST variable-declaration analysis](package-reference-variable-analysis.md).
It resolves all 167 `./reference` variable rows through the TypeScript checker.
The first evidence draft incorrectly counted `scalarTypesForVersion` among five
generated data rows; the corrected result identifies four vocabulary arrays
plus generated `CURRENT_CORE_VERSION`, with `scalarTypesForVersion` separately
classified as an authored function. Sol independently reran its generator
`--check` and focused tests (3/3). The current full metamodel `--check` fails
on stale `spec/core/schema.json`, so neither generated fixed-point nor default
retirement is claimed. The reviewed analysis JSON SHA-256 is
`3f413414860c98fa583482473cc1111257ba9d3a440c7b160637925577ec03e8`.

The follow-up source-path audit checked the three `src/model/*` inspectors
selected by both V4 roots: `inspectCoreScalarType`,
`inspectCoreRecordMembers`, and `inspectCoreReferenceLinks`. Each has an exact
Rust core owner, tagged wire operation and Node/WASM wrapper, and each has
bounded historical predecessor evidence. Those receipts pin older core or
wrapper source than the current worktree, so the audit records only current
source selection. No inspector was advanced to a current installed-host or
retired status. Schema-properties/default and Core Evolution operations have
exact opt-in Rust routes but remain TypeScript-selected; document read/write
bindings have no located exact cross-host predecessor packet. The other
unmatched model names were left unchanged rather than credited by name or a
historical source receipt.
