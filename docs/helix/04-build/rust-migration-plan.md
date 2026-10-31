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

# Shared Rust port plan

## Objective

Move UMF-owned executable semantics to one shared Rust implementation and expose
them through the Rust CLI, native Python, Node/Bun and browser WebAssembly
interfaces. The current passing Rust library is an implementation milestone, not
completion of the port. Wrappers handle host admission and presentation; Rust owns
model, validation, adapter, projection and generator decisions under ADR-006.
Delete historical qualification reports, retirement ledgers, source custody
chains and receipt-based build gates at the owner's request. Keep executable
regression cases as ordinary fixtures.

ADR-006, the PRD, cross-cutting requirements, architecture, TP-001 and the affected
adapter contracts govern behavior. Preserve exact native values, unknown content
and explicit resource boundaries. Core is 0.10.0; the native Python candidate is
0.10.4 with matching dependent-package pins.

## Implementation slices

1. Complete the current Rust foundation. Run the default Cargo library and CLI
   suite under the stable test profile (`opt-level = 1`, debug assertions and
   overflow checks enabled), check production boundaries and generated metamodel
   outputs, and verify source packaging and an independent Rust consumer. Merge
   PR #61 after the current suite passes. The source tag `umf-rust-v0.1.0` is a
   usable milestone; it does not imply that every public adapter is ported.
2. Activate existing native kernels through tagged wire and CLI routes, starting
   with OpenAPI and LinkML/ODCS. Keep exact UTF-16/value transport, unknown
   content and caller controls. For each new route, run one end-to-end operation
   and one malformed-request refusal before broader integration tests. Add the
   GraphQL host callback bridge so Rust completes edit prevalidation before the
   host callback runs.
3. Implement the remaining semantic families in reviewable cuts. Start parallel
   RDF semantic work (JSON-LD, then SHACL and OWL) on the existing RDF core and
   relational/TableSpec work on the existing core-ideal kernels. Complete the
   remaining Delta/Iceberg/Spark behavior, cross-format projections, action and
   security operations, and TypeSpec/Smithy compiler-backed operations. A source
   archive or parser alone is not completion of compiler or assembly semantics.
4. Activate every implemented family through the shared Rust API, CLI where
   applicable, Python, Node/Bun and browser WASM. Replace wrapper-side semantic
   execution rather than retaining a hidden JavaScript or Python fallback.
   Generate language-specific clients from the Rust-owned compiler and rules.
5. At integration points, run the affected functional baselines and complete
   current Rust, binding, packaging and real-browser suites. Test additions
   target new capabilities and failures; do not repeat broad historical
   qualification matrices after each small edit. Run checks locally without
   GitHub Actions.

Use the existing worktree. Luna handles implementation; Sol plans and reviews.
Use one expensive build/test job at a time. Preserve user-owned `.tmp/`.

## Current State

Main is integrated through `8fc91a8ae`. RDF's two integration tests pass, including
759 corpus cases. LinkML/ODCS's six native tests pass. Production boundary checks,
authority-policy tests, metamodel generation, SDK packaging tests and Python sdist
closure tests pass.

OpenAPI's eight native tests pass. GraphQL's twelve native tests, three wire
tests and two CLI tests pass, including edited AST round trips, exact metadata,
closed request validation and resource controls.

The full default Cargo suite compiles. A fresh full run under the stable optimized
test profile remains required; earlier partial runs and reused test binaries do not
count toward completion.

Current source-policy checks pass (16 tests); the rewritten Python scanner tests
pass with all 17 behavior vectors. Source-distribution tests (14), SDK packaging
tests (9), descriptor generation and all 26 portable WASM source checks pass.
Metamodel generation passes; regenerated code and schemas differ only in compiler
provenance. Production source and host/WASM dependency inspection passes for 877
modules with nine negative controls and no findings.

The current target-pin fixture contains all 13 behavior cases directly, including
duplicate-name rejection. Optional report-capture branches are removed; active
regression assertions remain. The independent Ajv fixture check passes.
Vendored parser dependencies resolve by explicit path for external Rust consumers;
the independent consumer build and round trips are part of the final local gate.

## Remaining Port Work

The current library is not the entire TypeScript port. Remaining kernels include
TypeSpec and Smithy; JSON-LD/SHACL/OWL; relational and TableSpec adapters;
cross-format projections; action/security/table control operations; and portions
of Delta/Iceberg/Spark. GraphQL's host-default activation is also unfinished.
These are implementation tasks, followed by Python, Node/Bun and browser WASM
activation. Existing source and wire candidates must pass their own baseline
operations before they are counted as implemented.

## Acceptance

The full port is complete when every UMF-owned shared semantic operation in the
public TypeScript and Python surfaces has a Rust owner, its native behavior and
loss boundaries are tested, and supported Rust CLI, Python, Node/Bun and browser
WASM entry points invoke that owner. The complete current Cargo, binding,
packaging and real-browser suites pass, and the released artifacts execute
without a hidden JavaScript or Python engine. A passing library milestone alone
does not satisfy this acceptance. No archived certificate, historical source
hash or retirement ledger is a prerequisite. Keep actual functional receipt
types and integrity checks required by public operations.
