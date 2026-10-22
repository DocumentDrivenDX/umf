---
ddx:
  id: US-060
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-009
      kind: derived_from
    - id: umf.prd
      kind: derived_from
---

# US-060: Reuse a domain pack across schema and dataset tooling

**Feature:** FEAT-009. **Feature Requirements:** PACK-01–PACK-07. **PRD Requirements:** FR-45; FR-29/41 apply to consumer reuse. **Priority:** P0 under FR-45. **Status:** Draft.

## Story

**As a** Schema Integration Maintainer, **I want** to inspect a pinned domain pack and hand its schemas to a qualified TableSpec generator, **So that** schema meaning and reproducible dataset evidence stay connected across tools.

## Context

UMF owns schemas and schema tooling; TableSpec owns records, archives, loading and data tests. The shared pack mechanism in the legal work supplies CONTRACT-052 for exact manifest and API behavior; its pack/source interfaces and schema tooling are integrated. This story governs catalog-level reuse and qualification without duplicating that interface.

## Walkthrough

1. The maintainer selects a pinned legal or commerce reference pack and reviews its scope, sources and generator requirements.
2. UMF validates and generates the schema artifacts from declared local inputs.
3. TableSpec selects a trusted generator, generates a seeded small corpus and exports a CSV ZIP.
4. A declared engine reloads it and checks independent expected values and relationships.
5. The maintainer reads the scoped evidence and determines which other consumers may safely reuse the schemas.

## Acceptance Criteria

- **US-060-AC1:** Given a pack with a declared schema revision, when inspected, then required schema/generator dependencies and support boundaries are discoverable.
- **US-060-AC2:** Given identical declared schema inputs, when generated in Bun and Chromium, then artifacts retain the same meaning without browser host globals.
- **US-060-AC3:** Given an unknown generator reference, when a consumer requests data generation, then it refuses without executing artifact-supplied code.
- **US-060-AC4:** Given native, projected and generated records, when provenance is inspected, then each origin and transformation can be traced.
- **US-060-AC5:** Given a generated archive, when reloaded under the admitted encoding, then exact values and reference identities agree.
- **US-060-AC6:** Given a support report, when reviewed, then its actual engines, versions, subset, source fingerprints and unverified paths are explicit.
- **US-060-AC7:** Given a required unresolved schema dependency, when generation is requested, then it refuses without implicit network resolution.

- **US-060-AC8:** Given a loader companion, inspection in Bun and Chromium retains unknown content and exposes exact runtime/profile dependencies without executing it; unsupported execution versions refuse.
- **US-060-AC9:** Given an explicit finite inventory, backfill and refresh retain exact originals and lineage; unchanged reruns add no duplicate document versions, while amendments remain distinct.
- **US-060-AC10:** Given collection failure or interruption, the receipt exposes incomplete coverage, the last published snapshot remains readable, and a retry safely resumes without skipping failed items. Concurrent invocations using the same state refuse.
- **US-060-AC11:** Given retained inputs, offline replay verifies hashes and regenerates the same projection without network access; source, loader, configuration and projection identities remain attributable.
- **US-060-AC12:** Given an exported companion, a clean install invokes the CLI with bounded requests, source rights policy and scheduler-visible exit status. Court-document and SEC-filing inventories exercise both profiles; arbitrary supplied code never loads.

## Edge Cases

A locally present same-named schema does not satisfy a missing revision pin. Unknown extension content survives inspection without implying execution support. Engine-specific skips must be disclosed and cannot certify the skipped behavior.

## Test Scenarios

| Scenario | AC ID | Input and expected result |
| --- | --- | --- |
| Portable schema generation | US-060-AC2 | Same small legal inputs in Bun and Chromium produce the same model meaning. |
| Untrusted reference | US-060-AC3 | An unresolved code-like generator reference executes nothing and blocks generation. |
| Archive value boundaries | US-060-AC5 | Decimal 1.2300, a large integer, Unicode, empty text and null retain their admitted distinctions. |
| Missing schema revision | US-060-AC7 | An absent dependency refuses even when a matching display name exists locally. |

## Dependencies

FEAT-009; FR-45; FR-29/41; ADR-002; CONTRACT-052 (integrated shared baseline); FEAT-007/CONTRACT-045 where external schema references are used. Exact fields and command syntax belong in the shared contract.

## Planning Handoff

Reconcile the shared legal-work manifest and schema-tooling artifacts, then author TD-060 and STP-060. Every AC needs an exercising named test with its canonical `@covers US-060-ACn` citation. UMF owns Bun/Chromium schema evidence; TableSpec owns data/archive and DuckDB/Sail/Spark evidence. Actual Databricks evidence remains operator-run and separate.

## Out of Scope

Data generation inside UMF, automatic code loading, production writes and native compatibility claims based only on fake sinks.
