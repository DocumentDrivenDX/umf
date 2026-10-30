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

GraphQL and LinkML/ODCS implementations are currently scratch candidates. Their
presence does not establish supported library APIs until they compile, pass tests
and are integrated. Remaining adapter and projection code must be assessed by
actual implementation, not old per-symbol retirement counts.

## Execution Contract

The owner authorizes implementation, cleanup, local testing, review and integration
in the existing worktree. Sol plans and reviews; Luna implements where capable.
Use one expensive local build/test job at a time. Preserve user-owned `.tmp/`.
There is no new token budget; the full remaining cost is unknown. Verification
concerns current source and behavior, without historical qualification gates.

## Validation Plan

Start with `cargo test --locked --offline -p umf-core --lib`. Then run the
current core integration tests and the `umf-core-wire`, `umf-tagged-wire`,
`umf-codegen`, `umf-metamodel`, `umf-metamodel-cli` and `umf-cli` tests. Fix compiler
errors and failing behavior. Use focused tests during repairs and a final current
suite after integration. Do not refresh expected outputs merely to match Rust.

Keep ordinary import/resource boundary checks. Remove archival hashes,
qualification chains and retirement receipts from build eligibility. Packaging
and release checks should validate actual current artifacts when performed.

## Continuation Evidence

Main is merged through `056a31cd4`; integration commit is `2366000dc` on
`codex/rust-full-port`, pushed to PR #61. The latest adapter corrections remain
working changes. Current source review found no remaining actionable issue in
the repaired RDF list ordering or Parquet host conversion paths. Runtime tests
are still required. The current core unit suite needs a rerun after fixture relocation and Avro
resource reuse. No passing-suite claim is made.

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
