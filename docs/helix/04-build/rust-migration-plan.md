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
   outputs, and verify source packaging and an independent Rust consumer. Use
   this evidence to support the following kernel and host-activation work; the
   complete port and release remain the objective.
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

The focused Rust wire and CLI checks now pass for OpenAPI, JSON-LD, TableSpec,
SQL Server and the shared adapter routes. The corrected JSON-LD RDF direction
and TableSpec opaque-extension core baselines also pass. A built Node addon
passed the GraphQL callback edit and OpenAPI public-facade flows; the Python
native-family transport passed two cases. The corrected LinkML/ODCS payload-inspector tests and the ordinary Python
GraphQL roundtrip now pass. The current WASM target check also passes with the
JSON-LD dependency graph. The actual Node public-root flows for LinkML, ODCS, TableSpec and SQL Server
now pass, as do the static package exports and generated default-facade check.

| Capability | Present source and checked behavior | Next action |
| --- | --- | --- |
| OpenAPI, LinkML and ODCS | Rust wire and CLI routes are integrated; OpenAPI wire, native payload inspector and actual Node facade flows pass. LinkML/ODCS wire and CLI flows pass. | Actual Node public-root flow passes; complete shared Registry structural ownership and browser activation. |
| GraphQL | Rust pre/post-validation host callback and Node/WASM default route are integrated; the actual Node callback edit/export and prevalidation refusal pass. | Continue browser host integration. |
| JSON-LD | Source operations, expand, flatten, compact and both ordinary RDF conversions are wired; corrected RDF direction and current wire/CLI baselines pass. | Activate and test the prepared compound-literal, generalized-input and framing operations; complete remaining processing semantics. |
| TableSpec | All nine public operations are wired; corrected getter/edit preservation and split-bundle wire roundtrip pass. | Actual Node public-root flow passes; complete browser activation. |
| SQL Server | Catalog and three facet kernels and wire/CLI routes are integrated; focused catalog, facet and payload-inspector checks pass. | Actual Node public-root flow passes; complete remaining host activation. |
| Python native transport | Shared family dispatch passes two actual extension cases. | Ordinary GraphQL wire roundtrip passes; continue public Python activation as remaining families land. |
| Saga browser SDK subpath | Runtime source and default SDK asset integration are present. | Run one representative host baseline at the next host integration point. |

## Remaining Port Work

The current library is not the entire TypeScript port. Remaining kernels include
TypeSpec and Smithy; the remaining JSON-LD conversions and framing, SHACL and
OWL; other relational adapters; cross-format projections;
action/security/table control operations; and portions of Delta/Iceberg/Spark.
The remaining implementation tasks need Python, Node/Bun and browser WASM
activation through the public defaults. Existing source and wire candidates must pass their
own baseline operations before they are counted as implemented.

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
