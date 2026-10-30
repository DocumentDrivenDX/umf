---
ddx:
  id: umf.plan.rust-migration
  type: implementation-plan
  activity: build
  authoring:
    home: repo
  links:
    - id: umf.prd
      kind: informed_by
    - id: umf.cross-cutting-requirements
      kind: informed_by
    - id: umf.architecture
      kind: informed_by
    - id: ADR-006
      kind: informed_by
    - id: ADR-004
      kind: references
    - id: ADR-005
      kind: references
    - id: CONTRACT-080
      kind: references
    - id: TP-001
      kind: informed_by
    - id: umf.implementation-plan
      kind: references
---

# Rust library completion plan

## Scope

Complete the shared Rust implementation under ADR-006 and make the current
library build and tests pass. The owner's 2026-10-29 direction removes historical
qualification reports, installed-artifact receipts, retirement ledgers and their
enforcement machinery from this work. Executable regression inputs remain tests;
they move out of documentation archives. Contracts, authored models and native
fixture corpora remain the behavior authority.

Governing artifacts are ADR-006, the PRD, cross-cutting requirements, architecture,
the project test plan and each affected adapter contract. Core remains 0.10.0.
Current main selects the 0.10 release series. The unpublished native Python
candidate is 0.10.4, with exact dependent-package pins.

## Shared Constraints

- Rust owns shared semantics; wrappers handle their host boundary.
- Preserve exact native values, unknown content and explicit support limits.
- Use actual Engine, Registry, schema and native-tree implementations.
- Keep tests that exercise behavior. Delete historical certification bookkeeping.
- Run checks locally. GitHub Actions credits are unavailable.

## Implementation Slices

| Work | Dependency | Current gate |
| --- | --- | --- |
| Finish current RDF, DBT and Parquet corrections | Existing Rust kernels | Rust unit and integration tests |
| Integrate OpenAPI and complete missing native adapter kernels | Native JSON/YAML, schema and RDF foundations | Compile each family and test public operations |
| Relocate executable regression inputs and delete qualification archives/tools | Identify current test dependencies | All referenced inputs resolve; Cargo tests compile |
| Integrate the Rust library | Reviewed family implementations | Current library, wire, compiler and CLI tests pass |

OpenAPI and LinkML/ODCS are integrated into the current Rust module graph;
LinkML/ODCS runtime tests pass. GraphQL is integrated as `umf-graphql`, using
the current core Engine, Registry, Value and Context types. OpenAPI and GraphQL
still need successful runtime test runs after their latest source repairs. The
GraphQL wire transport and CLI now route six operations to that Rust library;
functional wire and CLI tests are written and await execution.

A current source audit identifies remaining Rust kernels in TypeSpec and Smithy,
JSON-LD/SHACL/OWL, relational and TableSpec adapters, cross-format projections,
action/security/table control operations, and the unimplemented portions of
Delta/Iceberg/Spark. These are implementation tasks, not historical certification
requirements. Do not claim the entire port is complete while these kernels still
execute only in TypeScript.

## Execution Contract

The owner authorizes implementation, cleanup, local testing, review and integration
in the existing worktree. Sol plans and reviews; Luna implements where capable.
Use one expensive local build/test job at a time. Preserve user-owned `.tmp/`.
There is no new token budget; the full remaining cost is unknown. Verification
concerns current source and behavior, without historical qualification gates.

## Validation Plan

Start with `cargo test --locked --offline -p umf-core --lib`. Then run the
current core integration tests and the `umf-core-wire`, `umf-tagged-wire`,
`umf-codegen`, `umf-metamodel`, `umf-metamodel-cli`, `umf-cli` and `umf-graphql` tests. Fix compiler
errors and failing behavior. Use focused tests during repairs and a final current
suite after integration. Do not refresh expected outputs merely to match Rust.

Keep ordinary import/resource boundary checks. Remove archival hashes,
qualification chains and retirement receipts from build eligibility. Packaging
and release checks should validate actual current artifacts when performed.

## Continuation Evidence

Main is merged through `8fc91a8ae`. The current work is on PR #61. Historical
Rust qualification archives, spike-only crates, the obsolete R2 generator and
R4 qualification runner, and receipt-based build gates are removed. Behavioral fixtures live under `tests/rust-core/fixtures`.

Current passing checks:

- Production boundary scan: 877 source modules, host and WASM dependency checks,
  nine negative controls and no findings; 11 policy unit tests pass.
- RDF integration: both tests pass, including all 759 corpus cases. Turtle/TriG
  tests check exact terms, multiplicity, deterministic stored occurrences,
  index-targeted edits and graph inventories. They do not require N3.js parser
  scheduling. Direct N-Quads order and unchanged source bytes remain exact.
- LinkML/ODCS: six native unit tests pass.
- Metamodel generation passes with the accounted validator generated normally
  from current schemas. Five structural accounting tests pass; source-hash
  adoption receipts are removed.
- SDK packaging validation: nine Python tests pass.
- Current authority policy: 18 tests and 181 assertions pass after removing
  archive-backed startup checks. Both manual workflow files parse as YAML; the
  generation workflow also passes its embedded Python and command-roster checks.

The last full core unit run reached its deadline without an assertion failure.
Repeated immutable Avro resources and the cardinality request schema are now
cached; a complete current run is still required. OpenAPI's six tests failed
while constructing the pinned schema resource set; the missing Draft 4 resource
is added and awaits rerun. GraphQL's first build exposed a missing trait import
in its vendored parser; that import is fixed and awaits rerun. These are current
source failures being repaired, not reasons to restore historical gates.

## Risks and Rollbacks

Relocating fixture data can break compile-time or runtime paths. Preserve only
inputs used by executable tests, update their references and compile all affected
test targets. Do not delete functional receipt types merely because their names
resemble historical qualification receipts. Keep source changes reviewable in Git.

## Exit Criteria

The current Rust implementation builds, its required tests pass, public behavior
is reviewed, missing required kernels are integrated, and historical qualification
machinery no longer blocks development. No old certificate or ledger count is a
substitute for a passing current library.
