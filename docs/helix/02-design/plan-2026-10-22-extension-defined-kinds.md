---
ddx:
  id: umf.design.extension-defined-kinds
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-001
      kind: informed_by
    - id: US-904
      kind: informed_by
    - id: umf.architecture
      kind: informed_by
    - id: CONTRACT-907
      kind: references
    - id: CONTRACT-080
      kind: references
    - id: ADR-006
      kind: references
---

# Extension-defined kinds: design and implementation handoff

## Decision and scope

Publish object-kind catalogs in versioned extension packages. Generic tools
discover registered kinds, resolve occurrences from existing payload tags and
validate them through the same extension registry used for document validation.
Core does not learn what a dashboard, table or node means.

One owner can carry several extension classifications and an independent core
structural kind. A Record defines named members; a dashboard composes data and
presentation. Dataset shapes reuse core Records/Fields when that meaning is
established, while calculation, interaction and native syntax stay extension-owned.
The contract is [CONTRACT-907](contracts/CONTRACT-907-extension-defined-kinds.md).
The journey and acceptance criteria belong to
[US-904](../01-frame/user-stories/US-904-extension-defined-kinds.md).

In scope: catalog metadata, exact kind identity, generic inspection, ordinary
validation integration, safe missing/unknown behavior, generated authority,
cross-runtime boundaries and a dashboard-shaped composition fixture.
The implementation follows this plan; execution evidence and limits are recorded
under `../04-build/evidence/extension-kinds/`.

Out of scope: rendering, database/query execution, automatic SQL/type inference,
kind inheritance, automatic promotion to core, nested payload object discovery,
and completion of a native dashboard adapter. Lakeview byte-exact reconstruction
and native behavior verification remain explicit adapter acceptance gates.

## Governing intent and observed implementation

FR-4/5/15/20/21/23/27/31/41 and NFR-1–11, 17–25, 40–43 govern coexistence,
exact identity, partial understanding, safe execution and consumer reuse.
FEAT-001 EXT-05/06 captures the owner's requested extension-kind direction.
CONTRACT-040 owns structural Field/Record meaning. CONTRACT-078 owns semantic
type references; it does not register object kinds. ADR-005/CONTRACT-080 require
authored metamodel authority, and ADR-006 assigns new shared mechanics to Rust.

| Existing source | Consequence for this design |
| --- | --- |
| `src/generated/core-model.ts`, `spec/metamodel/umf.yaml` | Core kind vocabulary is Field/Record/Group; unknown kind strings are retained with incomplete interpretation |
| `src/registry/registry.ts` | Registry already copies/freezes a full manifest and compiles its payload schema; no separate kind registry is needed |
| `src/extensions/dashboard/index.ts` | Root/module/element discriminators and contextual validation already exist, but generic tooling has no catalog |
| `spec/extensions/dashboard/schema.json` | Existing dataset fields form a separate extension-owned dictionary; classification alone does not integrate those data shapes |
| `crates/umf-core/src/registry.rs` | Full-manifest registration already exists; convenience registration synthesizes a reduced manifest |
| `crates/umf-core-wire/src/lib.rs` | Binding registry transport reconstructs reduced registrations; kind metadata would be lost unless full manifests are carried |
| `src/model/selection.ts` | Existing core metadata selection can expose declared Record members/Fields; no dashboard-specific traversal belongs there |

These are source observations, not test evidence for the proposed feature.
The retained TypeScript engine is a differential reference, not a second new
semantic owner. Rust production core/compiler qualification is scoped in the
[migration plan](../04-build/rust-migration-plan.md); it does not qualify kinds.

## Alternatives and rationale

| Approach | Benefit | Cost / decision |
| --- | --- | --- |
| Add dashboard/table/node to core `Element.kind` | Simple built-in names | Couples every ecosystem to core and conflates structural shape with object classification; rejected |
| Put qualified kind references in new owner fields | Explicit even without packages | Duplicates existing payload tags and introduces synchronization, migration and document-level conflict rules; unnecessary for this slice |
| Reuse `semanticTypes` | Reuses exact reference shape | Conflates value/term annotations with object classification; misses module/document scopes and extension attachment validation; rejected |
| Infer kinds from arbitrary `payload.kind` | No package work | A property name is not a semantic declaration; unknown payloads would gain guessed meanings; rejected |
| Package catalog plus existing payload tag | One occurrence truth, existing scopes and validation | Requires an explicit package opt-in and full-manifest transport; selected |

The selected profile intentionally supports an own string `kind` at the
attachment payload root. It does not add a JSONPath/query language, branch
schemas or rule interpreter. A package with a different native representation
can continue ordinary extension participation or publish a tagged wrapper.

## Domain model and ownership

A kind definition belongs to one exact extension package. A kind occurrence is
an attachment whose payload tag resolves to that definition at the allowed
scope. Its identity includes the extension version selected by the document's
existing vocabulary declaration; there is no duplicated version on an owner.

The same dashboard owner may have both Lakeview-native and provisional generic
dashboard payloads. Discovery returns both qualified kinds. Neither takes
precedence and matching local names do not establish semantic equivalence.
The first real catalog should describe the Lakeview-native model; a generic
dashboard vocabulary remains provisional until independent adapters establish
shared meanings and qualified mappings. This mechanism does not require a
generic dashboard extension to exist first.

Core and extension classifications coexist. A core Field may carry extension
refinements, and a core Record may carry a dataset binding. Scalar/default/key
eligibility still follows actual core rules. Calling an extension kind `field`
or `record` grants no core privileges.

For the first composition fixture, explicitly author a Record `sales-row` and
Fields `channel` and `revenue`; do not infer their types from a query. A synthetic
dashboard dataset points to that Record, and a visual points to those Fields.
Its fixture-only validator verifies Record membership and reference targets.
This demonstrates reuse without freezing a premature production dashboard API.

## Interfaces and failure behavior

CONTRACT-907 owns package `kindCatalog`, exact identities, list/get/inspect
operations, ordering, coverage states, errors and version compatibility.
Ordinary `validateDocument` must reject wrong kind tags/scopes; inspection cannot
be the only place validation happens. The inspector delegates validation once
and returns sourceValidation alongside classification and coverage.

Discovery distinguishes resolution from correctness. An invalid dashboard may
still have an identifiable kind. Missing packages, absent catalogs and unknown
catalog profiles remain distinct. An available catalog does not make opaque
SQL interpreted or establish native acceptance. Document-wide errors remain
visible even when they cannot be assigned to one attachment.

Do not add a new kind-validator callback. Existing package schema validation and
the registered semantic capability own meaning. Generic catalog/tag mechanics
are shared engine behavior; diagnostic policy and package structural shapes
are generated from authored model data. No dashboard literal is allowed in
generic registry, engine, wire or binding dispatch.

## Components and dependency boundaries

The scoped architecture map is added to Architecture. Apply the existing
`modularity-and-encapsulation` baseline to the new paths; do not baseline
unrelated modules or weaken existing boundary gates.

| Owner | Changes | Forbidden coupling |
| --- | --- | --- |
| `spec/metamodel/umf.yaml`, metamodel compiler | Author catalog/definition/ref/result shapes, compatibility and diagnostics; regenerate derived resources | Hand-edited generated schema/TS/Python definitions or raw schema rules as authority |
| `crates/umf-core/src/registry.rs`, new `kinds.rs` | Atomic catalog admission/indexing; copied list/get and occurrence discovery | Dashboard adapter imports, host I/O, artifact-selected loading |
| `crates/umf-core/src/constraints.rs`, `engine.rs` | Generic extension-boundary kind checks and shared inspection; meter work through Context | Dashboard-specific branches or separate ecosystem payload schemas |
| `crates/umf-core-wire`, `bindings/core/{python,node,wasm}` | Carry complete manifests and expose operations using existing exact-value/callback protocol | Reconstructing manifests with lost kind metadata; host-owned semantic forks |
| `src/registry/`, `src/model/`, `src/index.ts` | Generated public types and thin facade for the new Rust-owned operation family | A second handwritten TypeScript kind resolver |
| Dashboard/native extension owner | Publish a new exact extension version and own dataset/Field bindings and native semantics | Treating catalog registration as data-schema inference or native support |

Existing wire convenience registrations remain legacy and advertise no catalog;
new full-manifest registrations use the Rust full-manifest API. The wire must
distinguish the two admitted forms and reject ambiguous mixed requests. Its
exact private transport shape is frozen with binding implementation; it must
preserve the public contract and full manifest, including unknown metadata.
Bindings keep callbacks explicitly supplied; they never import a validator
named in a manifest. Rust remains the only new kind semantic implementation.

## Compatibility refinement: explicit registration, unchanged core

Keep document core 0.10.0. Implementation inspection showed that the draft's
0.11.0 cutover would force unrelated adapters, embedded source documents and
native callbacks to migrate despite there being no new document field or core
structural meaning. NFR-1/7 and extension isolation favor additive package
registration over that coupling. No stored document or distributed package is
rewritten and no transition API is needed.

Kind-aware participation is explicit: `new Registry(runtime).register(package,
validator, {kinds:true})`. Default registration keeps even a well-shaped catalog
opaque; this preserves earlier unknown metadata and validator behavior. The
shared engine admits catalog definitions against the generated authored schema,
then checks tag identity and scope at the existing validation boundary. Native
Rust exposes explicit kind-package registration; full-manifest Node/WASM/Python
registration carries that opt-in without reconstructing or dropping metadata.

The retained TypeScript SDK uses an explicitly supplied shared-engine capability
for the new family. Browser hosts initialize WASM once; Node/Bun hosts initialize
the native addon. Missing runtime refuses before kind registration or inspection.
This is an operation-family adoption boundary under ADR-006, not the unrelated
full SDK migration. Ordinary legacy SDK registration and validation stay intact.

## Security, resource bounds and diagnostics

Catalogs are untrusted data. Admission must preserve unknown content, reject
malformed structures, use exact own-key/map lookup and copy before storing.
All indexing, source copying, iteration, diagnostics and output materialization
are charged through the existing Context limits. No unbounded scan or successful
partial result is permitted. Return one full source snapshot per inspection,
not one source copy per entry; callback isolation retains its existing contract.

Registered semantic callbacks remain trusted capabilities, not sandboxed code.
Classifying a kind grants no execution authorization. Unknown qualifiers disable
catalog interpretation while retaining ordinary extension validation. Error
paths distinguish source payloads from package metadata. Diagnostics follow the
existing public result objects; this offline library slice adds no service,
remote telemetry sink, credentials or new authentication surface.

## Verification strategy and handoff

The paths/commands below are required implementation checks, not claims of
currently passing tests. No tracker decomposition is required by this design.

| Product outcome / story coverage | Required implementation evidence |
| --- | --- |
| Catalogs are inspectable with no ecosystem allowlist; AC1/7/9 | `crates/umf-core/tests/extension_kinds.rs`: exact tuple identity, duplicate/atomic registration, mutation isolation, hostile keys and registration-order independence |
| Ordinary validation recognizes kind/scope errors; AC2–4 | Same corpus through Engine validation and inspection: missing/non-string/unknown tags, wrong scope, unavailable exact version, unsupported profiles and qualifiers, schema/semantic failures |
| Dashboard data shapes work with ordinary tools; AC5 | `tests/extension-kinds/composition.test.ts`: authored Record/Fields, fixture-owned bindings, broken member/reference negative controls, unchanged core selection behavior |
| Existing ecosystems remain usable; AC6 | Legacy package without catalog and opaque lookalike tests; schema/package inventory, affected native recovery suites and full regression with the unchanged current marker |
| Same model across installed bindings; AC8 | `scripts/extension-kinds-conformance.ts`: shared corpus through native Rust, installed Python, packed Node/Bun and actual Chromium WASM; exact entries, coverage and ordered diagnostics |
| Generated authority and compatible opt-in; AC6/9 | `bun run check:metamodel`, `bun run test:metamodel`, `bun run check:core-authority`, fixed-point/no-write controls; explicit opt-in and opaque-lookalike negative controls |
| No semantic fork or host dependency; AC8/9 | Extend and run `bun run check:rust-boundaries`, including negative controls for dashboard literals in generic kinds code, wrapper kind logic and dropped manifest fields |

Implement generated package/result shapes and corpus first. Then
implement atomic registry/discovery and ordinary validation in Rust, transport
complete manifests, wire the thin public facade, and qualify composition and
installed bindings before claiming kind support. Qualification requires all explicit-registration
and legacy-package gates; isolated catalog tests are not sufficient. A native dashboard adapter is qualified separately using direct
original-byte comparisons through UMF JSON/YAML and an independent native
endpoint for semantic behavior. Pending native access must remain explicit.

## Design review and residual risks

The three defining choices are package-owned catalogs, reuse of root payload
tags and Rust-owned generic validation. Existing full-manifest registration,
payload-tag schemas and explicit callback capability boundaries establish their
integration points. No new external library/provider is selected. The explicit registration API and catalog profile are reversible design choices;
they are not compatibility evidence. Their implementation gate is the shared
corpus, fixed point, manifest-transport negative controls and installed parity.

The main integration risk is loss of full manifest metadata or opt-in across
bindings. Transport and legacy-lookalike negative controls guard that boundary. Root-only tags are a deliberate subset;
nested discovery requires a future profile, not silent recursive interpretation.
Actual Lakeview catalog/version and dataset-binding design remain adapter work.

This design resolves the generic mechanism without deciding dashboard-specific
semantics. Architecture owns module boundaries, CONTRACT-907 owns interfaces,
US-904 owns acceptance, and the implementation must supply passing evidence.

## Design verification — 2026-10-22

Frontmatter parsing, new artifact identity uniqueness, trace-link resolution,
the new design's relative links and `git diff --check` pass. Existing modified
artifacts retain their original frontmatter verbatim.

`bun scripts/acceptance-traceability.ts --check` passes with 837 criteria after
regeneration. All nine US-904 criteria are UNTESTED. Regeneration also refreshes
pre-existing stale citations and previously omitted criteria; the larger ledger
diff is generated traceability data, not newly executed acceptance evidence.
`bun test tests/traceability/acceptance-ledger.test.ts` passes five tests with
1,244 assertions under Bun 1.4.3, using the existing workspace dependencies.

These checks validate the documentation and ledger. No kind implementation,
installed binding parity, browser execution or native dashboard qualification
is claimed by this design-only verification.

## Implementation — 2026-10-23

The generic catalog, exact lookup, occurrence checks and inspection operations
are implemented in `umf-core`. Wire, Node/Bun, WASM and Python bindings transport
complete manifests and explicit kind activation. The TypeScript facade requires
an initialized shared engine for this operation family; existing ordinary
registrations retain their previous path.

Implementation refined the proposed compatibility mechanism: document and
package core markers remain 0.10.0, because this capability introduces no new
document members or core meanings. Explicit registration activates catalog
profile 1.0.0. Ordinary registration preserves even catalog-shaped metadata as
opaque. This avoids migrating unrelated adapters and makes interpretation an
explicit consumer capability. CONTRACT-907 records the implemented interface.

The synthetic dashboard example attaches dataset meaning to a core Record and
references its core Fields from visuals and filters. Its validator is fixture
code; generic production code contains no dashboard discriminator. Execution
commands, outcomes and support limits are recorded in
[the implementation evidence](../04-build/evidence/extension-kinds/README.md).
