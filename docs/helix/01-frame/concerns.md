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
| `typescript-bun` | HELIX library; `language-runtime` slot; owner-selected and recorded by ADR-002 | all | TypeScript is the implementation language, Bun is the pinned development/package/test runtime, and the shipped library must execute as browser JavaScript. | Pin Bun and TypeScript; keep strict type checks (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`); use `bun:test`; confine Bun/host APIs to scripts, tests, and CLI boundaries; require a host-global-free browser build and actual Chromium checks. |
| Fidelity and partial understanding | project-local; owner requirements | `area:model`, `area:adapters`, `area:transform` | NFR-1, NFR-2, NFR-3, NFR-23, NFR-24, NFR-25, NFR-31, NFR-40, NFR-44 | Preserve unknown/native content; distinguish safe operations from retention; compare native meaning; retain disagreement. |
| Identity and vocabulary composition | project-local; owner requirements | `area:model`, `area:extensions` | NFR-5, NFR-6, NFR-7, NFR-8, NFR-9, NFR-10, NFR-34, NFR-41, NFR-42, NFR-43 | Exercise stable identity, explicit resolution, isolated versioned vocabularies, declared authority, and conservative core promotion. |
| Reproducible portable processing | project-local; owner requirements | `area:model`, `area:transform`, `area:tooling` | NFR-4, NFR-11, NFR-12, NFR-13, NFR-14, NFR-26, NFR-27, NFR-45, NFR-47 | Pin semantic inputs, retain origins, support offline packages, and compare optimized behavior with normative outcomes. |
| Bounded processing and security | project-local; owner requirements | `area:validation`, `area:extensions`, `area:tooling` | NFR-15, NFR-16, NFR-17, NFR-18, NFR-19, NFR-32, NFR-33, NFR-46 | Treat artifacts as untrusted; separate local/global work; impose visible limits; avoid mandatory inference and full-ecosystem loading. |
| Conformance and diagnostics | project-local; owner requirements | `area:validation`, `area:adapters`, `area:tooling` | NFR-20, NFR-21, NFR-22, NFR-38, NFR-39 | Keep validation layers and strictness visible; ground claims in executable evidence and specification authority. |
| Review and composability | project-local; owner requirements | `area:model`, `area:tooling` | NFR-28, NFR-29, NFR-30, NFR-35, NFR-36, NFR-37 | Assess focused diffs, independent edits, inspectable semantics, programmatic access, and unattended multi-tool workflows. |
| Durable adoption and runtime boundary | project-local; owner requirements | `area:extensions`, `area:tooling` | NFR-48, NFR-49, NFR-50 | Permit independent implementation and long-lived artifacts; keep business-system execution outside UMF. |

## Project Overrides

| Concern | Practice | Override | Authority |
| --- | --- | --- | --- |
| `typescript-bun` | Prefer Bun-native file, process, environment, and service APIs throughout implementation. | Bun-native and Node-compatible host APIs are permitted only in development scripts, tests, native oracles, and CLI boundaries. Browser-facing `src/` modules receive data and dependencies explicitly and must build and run without host globals. | ADR-002; FR-39 |
| `typescript-bun` | Use Bun workspaces and split code into concern-specific packages. | UMF remains one private package while its portable source, tooling, schemas, fixtures, and extension packages are developed together. A workspace split requires a later decision backed by a concrete independent-release or dependency-boundary need. | ADR-002; current package boundary |
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
