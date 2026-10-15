---
ddx:
  id: FEAT-028
  type: feature-specification
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.prd
      kind: derived_from
---

# Feature Specification: FEAT-028 — Typed Python model generation

**Priority:** P0 within this proposed capability; no existing release order changes.
**Owner:** UMF maintainers.
**Covered PRD Subsystem(s):** Physical Bindings and Authored Generation.
**Covered PRD Requirements:** FR-52; supporting FR-41, FR-43 and NFR-50.

## Overview

Compile selected UMF records into inspectable Python application models and a
retained account of every interpreted or unsupported assertion. Python models of
UMF documents under CONTRACT-051 remain distinct from generated instance models.

## Ideal Future State

A maintainer regenerates a Python package from pinned models, reviews the diff,
and uses static checking and runtime validation without installing a JavaScript
runtime in the application. Unknown content remains recoverable; execution never
becomes eligible merely because source generation succeeded.

## Problem Statement

Hand-maintained application types can diverge from schema meaning. A generic
JSON Schema conversion also cannot establish physical mappings, key equality,
presence semantics or backend enforcement. The desired outcome is reproducible
source with explicit limits rather than plausible but incomplete types.

## Functional Areas

| Area | User job | Responsibility |
| --- | --- | --- |
| Admission | Select exact source and supported meaning | Resolve local references and relevant assertions conservatively |
| Generation | Use typed instance values | Emit row, create, patch, key and named projection models |
| Review | Assess regeneration and limits | Retain originals, source maps, dependency lock and support report |

## Requirements

- **PY-01:** Generation must use exact supplied versions, explicit selection and deterministic naming; missing or ambiguous meaning must refuse.
- **PY-02:** Generated models must preserve explicitly bound presence/null carriers, literal default declarations without resolving them, exact values and ordered key DTOs within the qualified subset.
- **PY-03:** Generated source must be statically inspectable, independently importable and free of a runtime compiler dependency.
- **PY-04:** Every selected assertion must have a support disposition; unknown content must survive in the generated bundle.
- **PY-05:** Regeneration must preserve user-owned source and provide atomic, reviewable replacement of generated files.
- **PY-06:** Input metadata must never cause code execution, dependency installation, network traversal or template evaluation.

### Non-Functional Requirements

The same exact inputs and profile must produce identical output bytes in Bun and
real Chromium. Zero silent rounding/coercion is permitted in the supported exact
subset. Every support claim must name exact tool/runtime versions, subset and
evidence. CONTRACT-067 defines finite resource limits.

## User Stories

- [US-080: Compile a reviewable bundle](../user-stories/US-080-compile-persistence-bundle.md).
- [US-081: Use generated Python models](../user-stories/US-081-generated-python-models.md).

## Edge Cases and Error Handling

Unknown semantics on the selected dependency closure block executable generation.
Unselected content is retained and reported. Recursive records must use finite
reference handling; unsupported recursion refuses. Identifier collisions refuse
rather than merging distinct identities. Interrupted writes leave the old bundle.

## Success Metrics

All selected assertions in the acceptance corpus have dispositions; every admitted
bundle reproduces byte-for-byte; all planned positive/negative static and native
checks pass before support is claimed. These are targets, not observed results.

## Constraints and Assumptions

ADR-002 governs TypeScript/Bun and browser portability. Canonical UMF schemas
remain authority; generated Pydantic JSON Schema is an application view. Initial
inputs are core 0.8.0 local Record/Field models; no automatic DDD conversion or
cross-document resolver is introduced. Exact target pins require the build spike.

## Dependencies

CONTRACT-001/040/041/042/049/051 and proposed CONTRACT-067/068. Existing
concerns apply; modularity adoption is scoped explicitly in architecture.

## Out of Scope

Database connections, executing migrations, dynamic model discovery at application
startup, arbitrary user validators, query-language design and universal Python/UMF
semantic equivalence.
