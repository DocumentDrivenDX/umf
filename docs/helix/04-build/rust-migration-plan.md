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

The current Rust adapter checkpoint passes its focused new wire tests: SHACL/OWL
2/2 and PostgreSQL catalog/raw-SQL 12/12. The tests use the present default
Rust graph; PostgreSQL's pinned native C parser is not yet enabled. Fresh Node
public-root tests pass for the retained-model Registry, document read/write,
SHACL validation and OWL views, and RDF import/edit/export with its native
payload inspector. A public `umf.adapters` Python test passes from a staged
package and fresh extension with no PATH tools; the fresh CLI advertises the
SHACL, OWL and PostgreSQL routes. These are current capability baselines, not
a release wheel or release-profile browser build.

| Capability | Present source and checked behavior | Next implementation |
| --- | --- | --- |
| OpenAPI, LinkML, ODCS, TableSpec and SQL Server | Rust wire/CLI routes and actual Node public-root flows pass. TableSpec's nine operations and SQL Server's catalog/facet routes are callable. | Finish browser and Python public activation for the remaining operations. |
| Shared Registry and documents | Default Registry admits packages and validates extension structure through the retained Rust model; native read/write keeps the public YAML default. Actual Node public-root validation, callbacks, YAML roundtrip and refusal pass. | Exercise the same default path in the final browser and package integration. |
| GraphQL | Rust pre/post-validation host callback and Node/WASM default routes are integrated; actual Node callback edit/export and prevalidation refusal pass. | Complete browser host integration. |
| JSON-LD | Source, expansion, flattening, compaction, RDF conversion, compound literals, generalized input, framing and payload inspection are wired. Focused wire, Node public-root, Python extension, CLI and development WASM Chromium baselines pass. | Implement the remaining frame option semantics without losing graph identity, then check the release-profile browser build. |
| RDF and generalized RDF | Seventeen existing Rust operations now drive the Node/browser default roots. Actual Node import/edit/export, native Registry inspection and refusal pass. | Verify the browser public root and complete Python public activation. |
| SHACL and OWL | New Rust wire tests pass 2/2; actual Node public-root SHACL validation, OWL view and refusal pass. SHACL reports its real `umf-shacl-native-subset/2` identity and incomplete evidence for unsupported constraints. | Continue supported SHACL semantics and complete browser/Python activation. |
| PostgreSQL | Catalog capture, supplement inspectors, resolved predicates and parser-session raw SQL routes pass 12/12 new wire tests; CLI catalog route is present. | Integrate and test the pinned native C parser behind a host-only feature, then activate public Node/Python raw SQL paths. |
| Python native transport | The public `umf.adapters` family dispatcher passes a staged-package roundtrip, refusal and resource-limit baseline with a fresh extension. | Include new adapter resources and verify the final wheel/sdist. |
| Saga browser SDK subpath | Runtime source and default SDK asset integration are present. | Run one representative host baseline at the next SDK integration point. |

## Remaining Port Work

The current library is not the entire TypeScript port. Remaining work includes
TypeSpec and Smithy; JSON-LD frame options; SHACL constraint coverage; the
PostgreSQL native parser and other relational adapters; cross-format
projections; action/security/table control operations; and portions of
Delta/Iceberg/Spark. New kernels also need Python, Node/Bun and browser WASM
activation through the public defaults. A source or wire draft counts as
implemented only after its callable operation passes a current baseline.

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
