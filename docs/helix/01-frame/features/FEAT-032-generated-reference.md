---
ddx:
  id: FEAT-032
  type: feature-specification
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.prd
      kind: informed_by
    - id: umf.concerns
      kind: references
---

# FEAT-032: Generated reference and evidence discovery

**Owner:** UMF maintainers. **Priority:** proposed P1; no release commitment.
**Covered PRD Subsystem(s):** Extensions and Partial Participation; Native Interchange and Durable Use; Validation and Compatibility Evidence.
**Covered PRD Requirements:** FR-34, FR-29, FR-39, FR-41, FR-32.
**Cross-Subsystem Rationale:** The capability is one schema-integration evaluation workflow: find a definition, discover its available operations, inspect their evidence and try an admitted example. It exposes existing subsystem capabilities without owning their semantics or acceptance.

## Overview

Generate a versioned, machine-readable reference from UMF's schemas, extension
packages, public APIs and qualification records, and expose it through the
microsite. Supporting explanation connects definitions to executable examples.
Owner direction: the 2026-10-16 microsite evaluation and request for this design.

## Ideal Future State

A Schema Integration Maintainer can start at a core concept or native system,
find the exact version and operation needed, inspect its limitations and test
record, and run an available local example. An Extension and Translator Author
can discover registration and composition rules without treating preservation
as interpretation. Both can download the same reference consumed by the site.

## Problem Statement

Hand-authored overview pages and outbound contract links leave core structure,
extensions and tested integrations difficult to discover together. The existing
domain-pack explorer inspects user models; it does not explain UMF's definitions.
Installation guidance and examples can drift independently of the implementation.

## Functional Areas

| Area | User question | Responsibility |
| --- | --- | --- |
| Definition discovery | What does this version mean? | Core, extension and API reference with original sources |
| Evidence discovery | What has this operation demonstrated? | Version/subset-qualified declarations and recorded outcomes |
| Guided inspection | How does it behave on my example? | Explicit local operations linked to definitions and limits |

## Requirements

### Definition discovery

- REF-01: The reference must enumerate all discovered core schemas, extension
  package versions and public SDK exports, with stable identities and source
  provenance. Deliberate exclusions must be visible and mechanically checked.
- REF-02: Core reference must expose current structure, constraints and references
  without core release browsing, with explanation of native distinctions.
- REF-03: Extension reference must expose schemas, semantics, scopes, exact
  versions and available registration paths, distinguishing default registration,
  optional registration and declarations with no verified runtime registration.
- REF-04: Authored explanation must augment generated facts without overriding
  structural or evidence-derived facts; every linked example must be checked.

### Evidence discovery

- REF-05: Integration views must distinguish declared capabilities, recorded
  execution outcomes and evidence correspondence to the build's source inputs.
- REF-06: Each operation must expose native/runtime versions, direction, subset,
  exclusions and evidence. Unknown, historical, failed, skipped and conflicting
  records must remain visible; file existence alone must not establish support.

### Guided inspection

- REF-07: Readers must search and deep-link across definitions, operations,
  examples and evidence, and recover from invalid links or unavailable content.
- REF-08: Interactive tools must invoke explicitly installed portable APIs with
  selected versions and registries, preserve unknown content and exact values,
  and display diagnostics, losses and retained source separately from output.
- REF-09: Original input must remain available after an interactive refusal,
  cancellation or unsupported operation. Input must remain local to the browser.
- REF-10: Reference generation must detect drift and incomplete inventory before
  publication, preserving the existing browser-package and page-signing boundaries.

### Non-functional requirements

NFR-4/11/26 require deterministic generation from pinned local inputs and an
offline reference bundle. NFR-20/21/31/40/44 require explicit limits, exact
source preservation and disagreements. NFR-32 forbids artifact-directed code or
network execution. Browser resource limits and measured interaction budgets are
specified in CONTRACT-077; targets are acceptance requirements, not benchmarks.
The existing ADR-002 runtime and DOM/Chromium tooling apply; no new framework,
authentication provider, service or datastore is selected.

## User Stories

- [US-089: Evaluate an integration through the generated reference](../user-stories/US-089-generated-reference.md).

## Edge Cases and Error Handling

Unmapped evidence is listed as unassessed, never converted to a passing claim.
Identical extension IDs at different versions coexist. New schemas and exports
must appear in the inventory or stop the build with a reviewed exclusion.
Unknown runtime semantics remain inspectable without enabling an operation.

## Success Metrics

All selected reference inputs are accounted for; no inventory item disappears
silently. Every displayed tested claim resolves to scoped evidence. The US-089
evaluation journey passes in Chromium, including unknown-content and refusal
paths, from the same bundle produced by the deterministic build.

## Constraints and Assumptions

This is a static metadata consumer under FR-41. A documentation build does not
rerun or renew native qualification. Experimental profiles remain experimental.
Existing semantic contracts and cross-cutting requirements govern every tool.

## Dependencies

FEAT-001 supplies extension participation; FEAT-002/003 supply interchange and
projection operations; FEAT-005 supplies core definitions; FEAT-009 supplies the
independently released schema browser. CONTRACT-077 owns reference interfaces.

## Out of Scope

New native adapter semantics, automatic promotion of support claims, a hosted
schema registry, database execution, cloud qualification and a replacement
domain-pack renderer. Package publishing and production deployment are separate.

## Reader organization

REF-11: Default schema navigation MUST follow the latest configured core by
concept: Document, Module, Record, Field, Group, value types and constraints.
Exact historical links remain pinned; history is secondary.
REF-12: Every documented key MUST expose meaning, shape, recognized values,
presence/applicability and unknown-key policy. Record membership and identity
Keys remain distinct. Conditional and unknown semantics MUST remain explicit.
REF-13: API navigation MUST expose tasks and distinguish functions, interfaces,
type aliases, constants, schemas and packages, with readable members/parameters,
returns and usage. Full exports remain discoverable.
REF-14: Cold search MUST find properties, recognized values and API names without
prior detail visits. Contextual relations and raw schema graphs are secondary.

REF-15: Schema examples MUST default to YAML and provide an accessible JSON
toggle over the same example values. Original schema/source views retain their
original format; API code examples retain their programming language.

## Current documentation amendment — 2026-10-18

Owner direction supersedes historical core browsing, core-profile selection and
migration-oriented reader requirements above. Document core 0.10.0 as the single
current schema: no core version picker, history catalog or version badges. Old
core links resolve to the current schema and preserve valid pointers; invalid
pointers refuse visibly. Original source inventories and native/extension evidence
keep their truthful identities and qualification; historical evidence is not
relabelled as current support.

Workbench examples use core 0.10.0 and open as YAML, with accessible YAML/JSON
buttons converting current edited values through the public interoperable
serialization API. Malformed, duplicate-key or inexact values refuse without
replacing input. Cancellation and input edits invalidate pending conversion.
Original bytes remain downloadable. Native Protobuf keeps its own syntax.
Property/default execution APIs restricted to earlier envelopes are not offered
by the current workbench; their API declarations retain their original limits.
Every schema disclosure starts collapsed, including complete examples. Explicit
user expansion and format switching remain keyboard accessible.

Acceptance: verify all supplied examples execute, format parity after edits,
conversion refusal and cancellation, current-only navigation, old-link recovery,
and zero initially open schema disclosures in Chromium at desktop/mobile widths.

## Self-description and unified Schemas workspace — 2026-10-18

Owner direction adds FR-35: publish a current UMF-for-UMF model and graphical
ontology. Expose one primary Schemas destination with Ontology, Object reference
and Model catalog views. The ontology connects readable type definitions to
valid object keys and accepted values. Keep API reference separate. Preserve
existing object/property/catalog bookmarks and collapsed disclosure defaults.
Do not present this descriptive projection as a replacement instance validator.
