---
ddx:
  id: TD-089
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: US-089
      kind: informed_by
    - id: FEAT-032
      kind: informed_by
    - id: SD-032
      kind: informed_by
    - id: CONTRACT-077
      kind: references
    - id: umf.architecture
      kind: references
    - id: umf.design-system
      kind: references
    - id: ADR-002
      kind: references
---

# TD-089: Generated reference model and microsite expansion

**Story:** [[US-089-generated-reference]]. **Feature:** [[FEAT-032-generated-reference]].
**Parent:** [[SD-032-generated-reference]]. **Shared interface:**
[CONTRACT-077](../contracts/CONTRACT-077-generated-reference.md).

## Scope

Implement the maintainer's definition → extension → scoped evidence → local
example journey over a generated reference bundle. All public reference records,
routes, build commands and worker messages are owned by CONTRACT-077. This design
does not change native support, core semantics or the reusable browser package.
The scope includes generated core/extension/API reference, integration evidence,
supporting guides, workbench tools, publication integrity and rollback.

## Technical Approach

Build a source census before rendering. Discover schemas and manifests locally;
resolve the public export graph with the already pinned `typescript-api` compiler
API, including star exports, aliases, type-only exports and overloads. Never load
an artifact-named module or use regex export counts as completeness evidence.
Schema extraction preserves original keywords and exact source; schema-valued
positions follow the declared dialect, with unsupported references visibly
unresolved. Do not dereference native resource IDs through the network.

Join the census with reviewed profile, registration, operation and evidence
mappings. Use public APIs to test registration against the exact manifests;
do not assume every shipped package is in the default registry. Verify core
profile mappings against the public validation dispatch and canonical schemas.
Keep SDK package version, core profile and extension version separate.
This realizes US-089-AC1–3 without treating code discovery as semantic proof.

Evidence readers retain source records and extract only their documented facts.
One reader owns one recognized record family and a negative-control fixture.
Its required dependency closure is reviewed alongside the operation allocation.
Absent closure yields unknown correspondence; changed bytes yield historical
correspondence. Explicit same-scope supersession is separate from date sorting.
Templates never derive support from a green count or an evidence filename.
This realizes US-089-AC4/5, including honest display of matching failures.

Generate static HTML, lazy detail records and exact-source downloads from the
same validated model. Build a metadata search index, then render loaded definition
text locally. Authored guides supply motivations, distinctions and recipes through
checked overlay links. They cannot overwrite generated structural/evidence facts.
All failure states retain the source needed for inspection and recovery.

## Component Changes

Paths below are proposed implementation locations. Architecture's
[module map](../architecture.md#generated-reference-consumer-boundaries) governs
owned types, imports and construction; CONTRACT-077 governs shared surfaces.

| Component | Concrete changes / ownership |
| --- | --- |
| `docs/helix/05-deploy/reference/model/` | `types.ts`, `joins.ts`, `search.ts`, `structural-diff.ts`, `index.ts`: inert reference records, stable IDs, closure joins and bounded structural comparison |
| `scripts/reference/extract/` | `schemas.ts`, `extensions.ts`, `exports.ts`: census, schema graph and public API signatures; source-root containment and raw hashes |
| `scripts/reference/evidence/` | Family readers, closure profiles and conflict aggregation; no test execution or evidence rewriting |
| `scripts/reference/build.ts`, `render.ts`, `integrity.ts` | Staging, checked overlays, static pages, fixed-validator/tool bundles and manifests; exact nonmutating check |
| `docs/helix/05-deploy/reference/` | Contract schemas, reviewed mappings, `overlays/`, `examples/`; supporting content and executable expectations |
| `docs/helix/05-deploy/microsite/reference/` | `index.ts`, `routes.ts`, `views.ts`, `workbench.ts`, `style.css`: DOM rendering, base-aware routes, search, accessible status and cancellable jobs |
| `docs/helix/05-deploy/reference/runtime/` | `index.ts`, `protocol.ts`, `core.ts`, `extensions.ts`, `projections.ts`: fixed public-API operation bridges and worker entry |
| Existing root HTML and `microsite/demo.ts` | Link to Reference, add current-profile guided examples and preserve existing demo routes and preservation example |
| Existing `.github/workflows/microsite.yml` | Build/check reference, exercise browser journey, include source/mapping/evidence triggers, verify signatures and complete asset closure before upload |
| `scripts/reference/check-boundaries.ts` | Compiler-based module/import ownership and portable transitive-closure enforcement, with hostile import/cycle controls |

Cross-module imports use public barrels. Model imports are pure; UI code never
imports UMF internals. The runtime bridges use `src/index.ts` exports; build tooling
owns any fixed-validator bundler substitution. That substitution must preserve
the canonical equality behavior and is tested against the unmodified public API.
No new SDK export or npm package is required. Existing schema-browser release
assets and workspace parity checks remain owned by their present producer.

## API/Interface Design

| Surface | Governing contract | Local use |
| --- | --- | --- |
| Reference records, mappings, evidence readers, CLI and worker protocol | CONTRACT-077 | Model, generator and renderer share compiled types plus checked JSON Schemas |
| Document parsing/serialization, registration and diagnostics | CONTRACT-001 | Core and extension bridges reuse public functions and explicit registries |
| Field/Record/nullability/cardinality/facets/Keys | CONTRACT-040, CONTRACT-049 | Versioned definitions and metadata inspection; no duplicate rule evaluator |
| Relationships, bindings and numeric profiles | CONTRACT-041/042/049/076 | Linked reference and examples retain exact profile qualifications |
| JSON Schema/Protobuf source and projection | CONTRACT-002/003/004 | Bounded examples retain source, compiler identity and loss/refusal diagnostics |
| Reusable schema browser | Existing `schema-browser/HOST_CONTRACT.md` and CONTRACT-054 | Link or mount released public assets; no copied renderer internals |

## Content and Integration Coverage

Core landing content explains envelope and reference identity before semantic
concepts; each concept exposes definition, property table, related schema graph,
public API and checked example. Initial document profiles span the discovered
0.1–0.9 series. Profile differences are structural; migration/rollback guidance
links to existing public operations and their semantic contracts.

All discovered extension versions and exported API names appear at first
publication. Registration and runtime classification may be explicitly unmapped;
their absence cannot hide the entry. Initial explanatory guides cover DDD as an
optional semantic vocabulary, logical/physical binding separation, declarative
actions versus execution, security declarations versus authority, and access,
dashboard and domain-pack metadata. Native vocabularies get generated manifest
reference plus operation-specific supporting text.

The initial evidence allocation must cover the JSON Schema upstream/native
oracle records; Protobuf descriptor, source compiler, emission and behavior
records; and the six Field/nullability/cardinality/facets/Key/relationship
conformance records in `fixtures/validation/`. Preserve their qualified five-system
results and historical scope. Add explicit entries for UUID/128-bit completion,
actions certification, typed reporting and installed non-temporal SDK evidence.
Map machine-readable companion records where available; Markdown-only claims
remain unassessed until a reviewed reader can establish their facts. Other
evidence paths remain discoverable in the unassessed inventory.

The implementation must not satisfy AC4 by leaving all required families
unassessed: machine-readable positive and negative results from JSON Schema,
Protobuf and all five priority systems must be mapped and verified. Current-source
matching is not required when an honest historical/unknown label is warranted.
Core ideal admission, binding delivery, native equivalence and consumer adoption
remain separate observations. Live Databricks/Lakebase or broader engine support
cannot be inferred from local database/compiler checks.

## Interactive Tooling

Core tools expose current-profile validation, JSON/YAML serialization, copied
metadata selection, exact literals/default inspection and a reference graph.
Extension tooling lets the reader choose from trusted registration profiles,
inspect recognized/unknown content and retain the original. Structural schema
comparison is read-only and explicitly distinguished from semantic compatibility.
The integration view opens checked examples with the exact operation selected.

Start native demonstration with the bounded JSON Schema-to-Protobuf fixture,
its explicit field mapping and strict/report outcomes. The optional compiler is
the existing pinned WASM implementation, packaged as verified local assets; no
new native converter is written. Keep source inspection available when semantic
validation or compilation is unavailable. An unavailable execution path cannot
be described as a completed projection. Native grammars outside the fixed
validator inventory refuse or report the existing incomplete interpretation.

Fixed core validators must include 0.8 and 0.9 before those profiles are shown
as runnable. Dynamic native instance validation is outside this fixed browser
profile. Full Bun/Chromium parity applies to admitted operations; runtime-specific
limits must be recorded for unavailable paths instead of hidden by a fallback.
Protobuf source compilation is a separately explicit optional profile, not an
automatic side effect of opening a schema or extension entry.

## Security and Resource Behavior

Sources and overlays are untrusted data: escape source text, reject executable
markup/unsafe links, check realpath containment and preserve exact numeric text.
Never execute a command found in an evidence record. Only reviewed build code
reads local files; only fixed operation bridges run in the browser. Local source
does not enter URLs, telemetry, storage or remote requests. No authentication or
authorization service is added. Source redistribution follows recorded rights;
restricted originals receive provenance links, not copied public assets.

Inspect-only pages retain the existing fixed-validator Content Security Policy
(CSP) baseline. Workbench scripts/workers are same-origin and fixed; optional
WebAssembly requirements are isolated to its declared execution profile. A
missing CSP permission refuses the operation without weakening the reference
page policy. Workers do not resolve external references. Cancellation/timeout
terminate the worker; stale results cannot overwrite later requests.

CONTRACT-077 owns hard size/time bounds. Proposed measured browser targets on a
recorded Chromium/host profile are: loaded-index search p95 ≤100ms and cancellation
feedback ≤250ms over 20 trials. First reference load requires no native runtime
bundle; workers and source shards load only on selection. Record payload sizes,
load time, main-thread long tasks, layout shift and page errors during browser
qualification. These are local measurements, not field Web Vitals/RUM claims;
no remote analytics collector is introduced.

## Testing

Use `bun:test`, the existing pinned TypeScript configs and actual Playwright
Chromium. Proposed tests live in `tests/reference/`; the full browser journey
lives in `scripts/reference/browser.ts`. Covering tests cite `@covers US-089-ACn`.
The later story test plan owns exact test-to-criterion allocation.

- **AC1–3:** inventory additions/exclusions, embedded/standalone mismatch,
  re-export aliases/overloads, exact registry mappings, core-version dispatch,
  recursive schema references and structural diffs without semantic claims.
- **AC4/5:** reader fixtures from real named records; mutated source/dependency
  hashes, incomplete closure, same-scope contradictory results, different subsets,
  invalid selectors and cyclic supersession. A passing test-file existence audit
  must not become native conformance.
- **AC6–8:** same checked input through public Bun APIs and compiled browser
  bridges; exact token/unknown payload recovery, visible projection loss, unsupported
  grammar, original download, limit/cancellation and late-response controls.
- **AC9/11:** real /umf/ static host, direct nested links, refresh/history,
  keyboard focus and live status, 375px and desktop layouts, source escaping,
  offline reference inspection, CSP refusal and released browser asset parity.
- **AC10/11:** two isolated builds, nonmutating check, tampered/missing/extra
  assets, broken links and signed-manifest closure. Serve deliberately mismatched
  shard/tool bytes and require integrity refusal before rendering/execution.

Boundary verification runs against actual source imports and emitted browser
closures. Inject forbidden host imports, UI-to-runtime internals and cycles to
prove the checker rejects them. A schema-valid reference alone cannot pass.

## Migration & Rollback

Generate the new owned tree first and preview it with the existing site. Update
root navigation and conflicting installation text only after the bundle and
journey pass. Installation instructions derive from checked package/release
inputs; private package status does not imply absence of downloadable SDKs.
Retain existing demo, explorer, action-guide and reusable-browser URLs.

The reference manifest binds all data/tool/source assets to signed HTML without
a self-hash cycle. Extend the existing Innsigle page coverage to nested reference
routes, then generate, review and seal exact final bytes under existing custody.
The deployment job verifies signatures and served asset digests; it cannot
create new private-key attestations. This design requires no secret access.

Rollback restores the previous signed site artifact and matching assets as one
unit; for source changes, revert navigation/generation inputs and regenerate then
reseal before publication. Do not remove reference inputs, evidence or browser
package assets to make a drift check pass. Core documents require no migration.

## Implementation Sequence

This is a dependency sequence, not a new assigned work queue or delivery claim.

1. Add contract schemas, model and boundary checker; verify discovery and hostile
   import controls with `tests/reference/inventory.test.ts` and `boundaries.test.ts`.
2. Implement extraction, reviewed profile/registration mappings and evidence
   readers; verify original-source joins, correspondence and conflict controls.
3. Generate reference HTML/data, authored guides, examples and shared navigation;
   verify deterministic ownership, source downloads and all links.
4. Add the fixed core/extension workers and bounded projection profile; verify
   public API parity, current-core validators, preservation and refusal behavior.
5. Exercise the complete browser journey, measured budgets, base-path and asset
   integrity; integrate CI checks and signature coverage before publication.

**Prerequisites:** implement the CONTRACT-077 schemas and readers; preserve the
existing schema-browser release pin; satisfy recorded compiler/CSP requirements
for each enabled tool. Native qualification is consumed, never refreshed by
this sequence. No implementation or browser test is claimed by this document.

## Risks and Remaining Decisions

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Evidence formats or closures vary | Misleading support summary | Typed family readers, exact allocation and conservative correspondence |
| Schema annotations omit explanation | Technically complete but unusable reference | Required concept guides with checked examples and source links |
| Large inventories slow the site | Unresponsive evaluation flow | Metadata index, lazy shards, bounded rendering and measured browser budgets |
| Fixed validators lag public APIs | False semantic completeness | Explicit runtime inventory, parity tests and unavailable-profile state |
| Independent generators overwrite assets | Publication drift or broken signatures | Strict subtree ownership and signed manifest closure |

No owner-only decision blocks the draft. Future cross-browser qualification,
new evidence-reader families and additional live tools require their own measured
scope. They do not defer the initial census or required integration coverage.

## Reader layer

The build emits CONTRACT-077's reader companion and API detail shards. Numeric
core-version ordering selects latest. Model-owned pure schema-reader helpers
resolve local references with cycle guards and preserve conditional branches.
Trusted reader content supplies explanations and examples; the TypeScript
compiler supplies symbol kind, parameters, return types and members. UI modules
consume public model exports and integrity-verified companion assets. Preserve
entry/pointer routes; add concept selection as a presentation coordinate. Search
is independent of loaded entry state. Use the existing boundary checker before
feature code; no alternate validator or renderer-package fork is introduced.

### Schema example formats

Generate the complete example YAML through the public serializer during the
reference build. Load its manifest-verified text alongside the reader companion.
Render YAML/JSON buttons with pressed state for complete and inline examples;
format switching changes presentation only. No YAML runtime dependency is added
to the reference UI.
