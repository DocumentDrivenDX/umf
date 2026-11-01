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

## Objective and decisions

Implement UMF-owned executable semantics once in Rust. The Rust library and CLI,
native Python, Node/Bun and browser WebAssembly interfaces call that implementation.
Wrappers admit host values, transport explicit capabilities and present results;
they do not contain a second UMF interpreter. ADR-006, the PRD, cross-cutting
requirements, architecture, TP-001 and the affected contracts govern behavior.

Core stays at 0.10.0. SDK 0.10.2, Python 0.10.6 and the Rust source/CLI
ship together in one GitHub release, `umf-rust-v0.1.0`, subject to any newer
release on main. Rust
crates remain `publish = false`; distribute the source library and built CLI
without claiming crates.io publication. Preserve exact native values, unknown
content, functional receipts and integrity checks needed by current APIs. Historical
qualification reports and retirement ledgers are not release gates.

Use the existing `codex/rust-full-port` worktree. Luna agents implement and test
independent capabilities in parallel. Sol plans, reviews and integrates their
source cuts. One expensive native/browser build or test job runs at a time;
source implementation continues while that slot is occupied. Preserve user `.tmp/`.
Run CI locally and publish release assets directly; do not wait for GitHub Actions.

## Implementation and test discipline

Give each lane a concrete public operation, its existing contract and one ordinary
normal/refusal workflow, including recovery where relevant. Compile actual affected
Rust host libraries before an optimized native build. Batch source-ready independent
capabilities into one build. A passing case leaves the repair queue unless its
behavior or dependency changes. Repair actual failures, not hypothetical edge cases.
Do not expand fixtures into conformance campaigns or run old passing matrices after
each change. Source review and compilation do not substitute for executing the
specific new public capability.

## Current implementation

The following families have Rust owners and passing focused public workflows:

- Core/model/registry operations; native formats and schema adapters; RDF,
  JSON-LD, SHACL/OWL; TypeSpec and Smithy compiler capability routes.
- All core-ideal classifiers for Avro, Parquet, SQL Server, TableSpec and
  PostgreSQL, with verification and available native/source recovery.
- Authored Field/Record, Cardinality/Nullability, Keys/Facets and Relationship
  targets for those formats; Extra Relationship GraphQL/RDF/LinkML projections.
- Binding target/index composition, DDD projections, physical SQL composers,
  Bit128 carrier/model/file operations, medical operations and dataset examples.
- Actions, prepared plans, manifests, selectors, rules and bulk outcomes; Saga
  authoring/assessment; security policy, evaluation, authority and disclosure.
- Dashboard, catalog, table lifecycle, table inventory/migration compilers,
  row-scope and canonical digest operations.
- Common classification/projection reports; Arrow IPC inspection/consistency
  and embedded Parquet Arrow reading; Delta checkpoint reconciliation,
  Protobuf descriptor editing and Relationship Extra archive import.

PostgreSQL authored Keys/Facets now also passes the pure native Rust projection,
recovery and refusal workflow without JavaScript parser values. The latest public
batch passes six cases across five independent capabilities: PostgreSQL Keys and
Facets, Delta checkpoint reconciliation, Protobuf descriptor edit and Relationship
Extra import. These cases are closed for implementation repair testing.

Native Arrow schema export, IPC rename and coordinated Parquet/Arrow rename now
pass their ordinary public workflows, including explicit encoder use, retained
source, recovery/refusal and unchanged-data checks. Arrow observation and all ten
registry factories use native package/core validation and Rust payload owners;
their focused cases pass. Public document validation always invokes Rust even
with explicitly supplied legacy Registry storage. Both affected Action callback
cases pass, including retention of caller and non-Action semantic owners.

## Implementation closure

Sol's final targeted source review confirms that the eleven identified public
callables and shared validation fallback are closed in both Node and browser
roots. The generated default barrel no longer reexports their legacy callables.
The final seven new/repaired cases pass, along with the two affected Action cases;
the last Arrow registry fix only corrected host forwarding and reused the compiled
Rust payload route. Actual Rust host-library compilation, TypeScript and source
resource closure pass. Passing capability cases are out of the repair queue.

Host-only resource copying/registration, explicit Smithy compiler/worker factories
and pointer formatting remain host boundaries. Generic Registry storage does not
import ecosystem semantics. Caller callback identity/order and configured controls
are preserved through the existing bridge. Each Rust operation uses its passed
Context; one literal Context does not cross the JavaScript boundary.

Rust library/CLI capability tests and the affected ordinary integration cases pass.
The SHACL implementation now handles family target extraction, per-value nested
logical constraints, nested sequence paths, deactivated shapes and regex flags.
Current fixtures retain exact source metadata, bytes, unknown content and actual
framing options; the final framing and affected SHACL wire checks pass. Generated
resources, TypeScript, source/import boundaries, negative controls, release versions
and SDK packaging checks also pass.

Installed artifact checks and publication below remain. Publication closes the goal.

## Integration and release

Release preparation and verification:

1. Retire public reference/candidate executable exports and SDK bundles. Update
   coupled SDK/Python versions and dependent pins while retaining current archive
   integrity and functional receipt behavior. Refresh main and integrate incoming work.
2. Run source boundaries, TypeScript, generated sources, resource closure and
   ordinary release-version/packaging checks for the completed source.
3. Run shipping Rust library/CLI tests and ordinary capability baselines, including
   the native PostgreSQL bridge and an independent Rust consumer. Retain completed
   results and retry actual failures or affected portions. Full predecessor parity
   campaigns are excluded from release acceptance; an interrupted unfiltered run
   is never reported as a full-suite pass.
4. Build the source SDK once from a fresh private source snapshot. Reuse its actual
   native and WASM artifacts for installed Node/Bun and real Chromium ordinary
   public workflows. Build the Linux addon in the existing Linux wheel/CLI Cargo
   graph and assemble a separate Linux SDK from identical common assets. Verify
   the same fixed-point source inputs, retain both build provenances and use the
   unchanged archive verifier. Test public package entry points and explicit caller
   capabilities; do not reopen the historical Bun edge corpus.
5. Build and install the native Python wheel and sdist; run ordinary public API
   workflows with JavaScript absent from PATH. Check the supported CPython
   versions using the approved cached local Linux images. Fresh macOS C and Rust
   release builds use `MACOSX_DEPLOYMENT_TARGET=11.0` consistently.
6. Obtain Sol's final review, refresh main, update PR61 with the actual resulting
   implementation and local validation, merge, and publish the complete source,
   SDK, Python and native CLI assets in the single Rust GitHub release directly.
   Use the existing Rust-tag dispatcher exclusion to avoid Actions publication.
   No PyPI or crates.io publication is claimed. Verify published revision,
   assets and installed consumers. Do not publish a partial port or overwrite an
   existing release.

## Acceptance

Every UMF-owned executable operation exposed by the current public interfaces has
a Rust owner and passes its capability baseline. Supported library, CLI, Python,
Node/Bun and browser entry points execute that owner, preserving current meaning,
unknown content, caller callbacks and controls. Shipping Rust and final installed-host
checks pass, review is resolved, main is integrated, and the released artifacts
contain the completed port. The goal stays active until publication and verification.
