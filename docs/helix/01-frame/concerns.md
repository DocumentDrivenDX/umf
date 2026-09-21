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
| Fidelity and partial understanding | project-local; owner requirements | `area:model`, `area:adapters`, `area:transform` | NFR-1, NFR-2, NFR-3, NFR-23, NFR-24, NFR-25, NFR-31, NFR-40, NFR-44 | Preserve unknown/native content; distinguish safe operations from retention; compare native meaning; retain disagreement. |
| Identity and vocabulary composition | project-local; owner requirements | `area:model`, `area:extensions` | NFR-5, NFR-6, NFR-7, NFR-8, NFR-9, NFR-10, NFR-34, NFR-41, NFR-42, NFR-43 | Exercise stable identity, explicit resolution, isolated versioned vocabularies, declared authority, and conservative core promotion. |
| Reproducible portable processing | project-local; owner requirements | `area:model`, `area:transform`, `area:tooling` | NFR-4, NFR-11, NFR-12, NFR-13, NFR-14, NFR-26, NFR-27, NFR-45, NFR-47 | Pin semantic inputs, retain origins, support offline packages, and compare optimized behavior with normative outcomes. |
| Bounded processing and security | project-local; owner requirements | `area:validation`, `area:extensions`, `area:tooling` | NFR-15, NFR-16, NFR-17, NFR-18, NFR-19, NFR-32, NFR-33, NFR-46 | Treat artifacts as untrusted; separate local/global work; impose visible limits; avoid mandatory inference and full-ecosystem loading. |
| Conformance and diagnostics | project-local; owner requirements | `area:validation`, `area:adapters`, `area:tooling` | NFR-20, NFR-21, NFR-22, NFR-38, NFR-39 | Keep validation layers and strictness visible; ground claims in executable evidence and specification authority. |
| Review and composability | project-local; owner requirements | `area:model`, `area:tooling` | NFR-28, NFR-29, NFR-30, NFR-35, NFR-36, NFR-37 | Assess focused diffs, independent edits, inspectable semantics, programmatic access, and unattended multi-tool workflows. |
| Durable adoption and runtime boundary | project-local; owner requirements | `area:extensions`, `area:tooling` | NFR-48, NFR-49, NFR-50 | Permit independent implementation and long-lived artifacts; keep business-system execution outside UMF. |

## Project Overrides

No library concern practices are overridden. TypeScript is the preferred
implementation language, browser JavaScript is required, and ADR-002 selects Bun
for development/testing. Separate browser and tooling boundaries preserve
implementation-neutral semantics. ADR-001 retains the YAML/JSON boundary.
Frontend framework, datastore, deployment and authentication choices remain open.

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
