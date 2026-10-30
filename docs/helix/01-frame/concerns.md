---
ddx:
  id: umf.concerns
  type: concerns
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.prd
      kind: informed_by
    - id: umf.cross-cutting-requirements
      kind: informed_by
---

# Project Concerns

These project-local concerns carry the owner's explicit constraints into
downstream work. Normative wording stays in [Cross-Cutting Requirements](cross-cutting-requirements.md);
functional scope stays in the [PRD](prd.md). The groupings select relevant
context, not a technology stack or another requirements layer.

## Active Concerns

| Concern | Source | Areas | Why Active | Key Practices |
| --- | --- | --- | --- | --- |
| Rust shared execution with `typescript-bun` host tooling | Project-local owner direction; ADR-006; ADR-002 retained for JS tooling | all | Rust owns shared executable semantics; Python/Node/Bun bind the engine and browsers use WASM. | Pin Rust/Cargo and binding tools; retain strict TS/Bun checks and actual Chromium; enforce engine/host boundaries, installed artifact parity and exact/unknown preservation. |
| Fidelity and partial understanding | project-local; owner requirements | `area:model`, `area:adapters`, `area:transform` | NFR-1, NFR-2, NFR-3, NFR-23, NFR-24, NFR-25, NFR-31, NFR-40, NFR-44 | Preserve unknown/native content; distinguish safe operations from retention; compare native meaning; retain disagreement. |
| Identity and vocabulary composition | project-local; owner requirements | `area:model`, `area:extensions` | NFR-5, NFR-6, NFR-7, NFR-8, NFR-9, NFR-10, NFR-34, NFR-41, NFR-42, NFR-43 | Exercise stable identity, explicit resolution, isolated versioned vocabularies, declared authority, and conservative core promotion. |
| Reproducible portable processing | project-local; owner requirements | `area:model`, `area:transform`, `area:tooling` | NFR-4, NFR-11, NFR-12, NFR-13, NFR-14, NFR-26, NFR-27, NFR-45, NFR-47 | Pin semantic inputs, retain origins, support offline packages, and compare optimized behavior with normative outcomes. |
| Bounded processing and security | project-local; owner requirements | `area:validation`, `area:extensions`, `area:tooling` | NFR-15, NFR-16, NFR-17, NFR-18, NFR-19, NFR-32, NFR-33, NFR-46 | Treat artifacts as untrusted; separate local/global work; impose visible limits; avoid mandatory inference and full-ecosystem loading. |
| Conformance and diagnostics | project-local; owner requirements | `area:validation`, `area:adapters`, `area:tooling` | NFR-20, NFR-21, NFR-22, NFR-38, NFR-39 | Keep validation layers and strictness visible; ground claims in executable evidence and specification authority. |
| Review and composability | project-local; owner requirements | `area:model`, `area:tooling` | NFR-28, NFR-29, NFR-30, NFR-35, NFR-36, NFR-37 | Assess focused diffs, independent edits, inspectable semantics, programmatic access, and unattended multi-tool workflows. |
| Durable adoption and runtime boundary | project-local; owner requirements | `area:extensions`, `area:tooling` | NFR-48, NFR-49, NFR-50 | Permit independent implementation and long-lived artifacts; keep business-system execution outside UMF. |
| `formal-methods` | Owner-selected saga analysis | `area:extensions`, `area:tooling` | FEAT-901 submission, coordination and ticket/native admission | Finite TLA+/TLC safety/progress with explicit assumptions, mutations, witnesses and native correspondence; TD-905 owns scope. |

The owner-selected saga `formal-methods` scope is FEAT-901 submission,
coordination and ticket/native admission only. Use bounded TLA+/TLC safety and
conditional progress analysis, exact model/configuration hashes, mutation
counterexamples, positive witnesses and explicit native correspondence gaps.
TD-905 owns that specification; unrelated UMF slices gain no analyzer obligation.

## Project Overrides

| Concern | Practice | Override | Authority |
| --- | --- | --- | --- |
| `typescript-bun` | Prefer Bun-native file, process, environment, and service APIs throughout implementation. | Bun-native and Node-compatible host APIs are permitted only in development scripts, tests, native oracles, and CLI boundaries. Browser-facing `src/` modules receive data and dependencies explicitly and must build and run without host globals. | ADR-002; FR-39 |
| `typescript-bun` | Use Bun workspaces and split code into concern-specific packages. | ADR-006 permits a Cargo workspace and native Python/npm/WASM distributions sharing the same Rust engine. The existing private TS package can remain for host tooling during cutover. | ADR-006; ADR-002 tooling boundary |
| `typescript-bun` | Require Biome linting/formatting and its prescribed formatting profile. | Biome is not an accepted gate for the current repository. Review, strict TypeScript checks, focused/full Bun tests, schema/package audits, browser builds, and actual Chromium runs are the recorded gates. Adopting a formatter or linter requires an explicit tooling decision and a repository-wide baseline. | ADR-002; TP-001 |
| `typescript-bun` | Require `verbatimModuleSyntax` and prohibit every explicit `any`. | The accepted compiler boundary is the checked-in strict `tsconfig.json`, including `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. Module preservation and stronger source-style restrictions are not claimed until separately enabled and validated across the existing adapter corpus. | ADR-002; checked-in TypeScript configuration |

These overrides keep the selected runtime concern consistent with UMF's shipped
browser boundary and current single-package delivery. ADR-001 retains the
YAML/JSON boundary. Frontend framework, datastore, deployment and authentication
choices remain open.

DDD is modeled as an extension under FR-40, not selected as UMF's implementation
architecture. Its context, aggregate, identity and terminology distinctions feed
fidelity and composition checks. FR-41 adds metadata-selection and consumer-output
checks: preserve relevant dependencies and provenance, distinguish unknown or
inferred semantics, and never imply unsupported enforcement or execution.

## Area Labels

- `area:model` — common representation, identity, composition, and evolution.
- `area:extensions` — vocabulary registration, compatibility, and isolation.
- `area:adapters` — native import/export and equivalence.
- `area:transform` — projections, normalization, fidelity, and provenance.
- `area:validation` — structure, semantics, references, and conformance.
- `area:tooling` — automation, diagnostics, packaging, and ecosystem use.

## Concern Conflicts

| Conflict | Resolution |
| --- | --- |
| Readability versus fidelity | Preserve meaning; expose critical semantics for inspection rather than hiding them only in blobs. |
| Partial understanding versus safe edits | Preserve unknown content, but do not certify operations that depend on uninterpreted semantics. |
| Normalization versus native independence | Keep normalization explicit and reproducible; use the FR-3 ideal admission gate separately from FR-28 native-equivalence graduation. |
| Offline resolution versus external references | Package declared dependencies; diagnose missing/ambiguous inputs instead of guessing or traversing arbitrary networks. |
| Resource limits versus complete validation | Report incomplete/limited evaluation; never label partial analysis as complete conformance. |


## Domain-pack application

FEAT-009 and FEAT-010–FEAT-025 reuse the selected concerns and ADR-002 runtime
slot. No new UI/authentication/datastore slot is selected for this schema-library
slice. Fidelity requires retaining native scientific/business distinctions;
identity requires source-qualified IDs and explicit matching; reproducibility
requires pinned schema/generator/source inputs; bounded processing prohibits
artifact-driven code execution and implicit network traversal; conformance
separates schema, data, native-engine and realism evidence; review requires
independently releasable pack scopes; runtime boundaries keep dataset execution
in TableSpec. Ecology additionally preserves sampling effort, taxonomy revisions,
censoring, coordinate uncertainty and source-specific reuse restrictions.
## Shared security concern application (2026-10-08)

FEAT-008 retains the selected fidelity, qualified identity, bounded processing, conformance, browser portability and durable runtime-boundary concerns. Policy metadata is untrusted input; authenticated attributes and current authority are host obligations. No account UI or authentication-provider slot is added to this library. Unknown policy meaning may be retained but cannot authorize execution.

## Typed data access SDK application

FEAT-028 to FEAT-031 adopt the existing fidelity, identity, reproducibility,
bounded-processing, conformance and consumer-runtime concerns. ADR-006 moves the
stage-one generator to Rust, retaining ADR-002 for JavaScript tooling and browser
verification. ADR-004 adds the
`umf_access` Python distribution for the DSL, catalog build and runtime; Python
is a target and runtime language for this capability only. No UI or
authentication provider is selected; datastores are host-selected targets, not
UMF dependencies.

Select `modularity-and-encapsulation` for `src/compilation/` and
`python/umf_access/`. Architecture owns the module map; CONTRACT-067 to
CONTRACT-074 own public boundaries. Semantic review checks include relevant-
assertion closure, codec invariants, absence of runtime SQL assembly and absence
of engine storage access.

## Generated reference application

FEAT-032 reuses the selected fidelity, identity, reproducibility, bounded
processing, conformance and consumer-runtime concerns. ADR-002's strict
TypeScript/Bun and real-browser constraints remain applicable with the existing
project overrides. No new frontend framework, authentication, datastore or
environment/configuration service is introduced for this static consumer.
Apply `modularity-and-encapsulation` to the proposed reference model, build,
browser and runtime modules mapped in Architecture. CONTRACT-077 owns shared
surfaces; TD-089 requires boundary-checker adoption and negative controls before
dependent implementation. This selection does not claim an existing checker
already enforces those new paths.

## Generated ontology access

FEAT-033 follows the existing fidelity, identity, reproducibility, bounded
processing and consumer-runtime constraints. ADR-006 governs the shared generator;
generated Python uses only the standard library. Future generator/codec modules
retain the existing encapsulation requirements. Developers need no extra setup.

The owner's shared-API clarification makes stdlib-only generated models and
runtime expression composition common to table and ontology access. Compilation,
preparation and optional runtime dependencies belong inside consumer bindings;
mandatory `@query`/`Param` application scaffolding is superseded by ADR-004.

## Shared Rust execution application

ADR-006 overrides the TypeScript shared-engine preference while retaining Bun/TS
host development. Apply `modularity-and-encapsulation` to Rust core, compiler,
adapters and each binding. Cargo graphs and cross-language import controls must
prevent host I/O and semantic forks in wrappers. TP-001 requires installed
native/Python/Node/Bun/browser parity. Native dependencies and consumer-owned
execution retain explicit capability boundaries; generated Python stays stdlib-only.

## Extension-defined kinds application

FEAT-001 EXT-05/06 and US-904 reuse the selected fidelity, exact identity,
bounded-processing, conformance and runtime-boundary concerns. Apply the
`modularity-and-encapsulation` source baseline (`baseline-policy`) to the new
Rust registry/kind mechanics and their binding/facade paths. Architecture owns
the scoped map; CONTRACT-907 owns exact interfaces. Implementation readiness
requires boundary-checker adoption and its negative controls. Generic discovery
does not infer ecosystem equivalence or confer core Field/Record semantics.
This library design adds no UI framework, service, datastore or telemetry sink.
