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

## Objective

Deliver a shared Rust library that builds and passes its current behavioral tests.
Rust owns shared semantics; Python, Node/Bun and browser wrappers handle their
host boundaries. Historical qualification reports, retirement ledgers, source
custody chains and receipt-based build gates are deleted at the owner's request.
Keep executable regression cases as ordinary fixtures.

ADR-006, the PRD, cross-cutting requirements, architecture, TP-001 and the affected
adapter contracts govern behavior. Preserve exact native values, unknown content
and explicit resource boundaries. Core is 0.10.0; the native Python candidate is
0.10.4 with matching dependent-package pins.

## Work

1. Repair the current Rust build and behavioral failures. OpenAPI and GraphQL are
   integrated into the production module graph; test their native operations and
   GraphQL wire/CLI entry points.
2. Run the complete default Cargo library and CLI suite. Compile once, run test
   executables serially, fix failures, and rerun affected tests after each repair.
3. Check production import/resource boundaries and current packaging closure.
   Generate metamodel outputs from current authored sources.
4. Review changes with Sol, integrate current main, update PR #61, and merge only
   after the required current tests pass. Run all checks locally; do not wait for
   or launch GitHub Actions.
5. Tag the tested integration commit `umf-rust-v0.1.0` and publish the complete
   repository source. Build and smoke the native macOS ARM64 CLI locally if
   attaching a binary. Rust Git dependencies use the tag; the packages are not
   published to crates.io.

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

The full default Cargo suite compiles. The 630 core unit tests are covered and
pass after the focused 11-test accounting rerun; original numeric work counts,
outcomes and the million-unit ceiling are unchanged. Forty-six native
targets completed successfully before the bounded run ended. The continuation
runs unfinished targets and doctests, preserving completed results and checking
that selected test filters execute their intended tests.

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
These are source implementation tasks and must not be represented as completed.

## Acceptance

The current Rust library builds, required behavioral tests pass, public behavior
is reviewed, and current packaging is valid. No archived certificate, historical
source hash or retirement ledger is a prerequisite. Keep actual functional
receipt types and integrity checks required by public operations.
