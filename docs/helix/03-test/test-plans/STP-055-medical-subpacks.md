---
ddx:
  id: STP-055
  type: story-test-plan
  activity: test
  status: draft
  authoring:
    home: repo
  links:
    - id: US-055
      kind: informed_by
    - id: TD-055
      kind: informed_by
    - id: TP-001
      kind: references
---

# STP-055: Medical subpack verification

## Story Reference

US-055, TD-055 and TP-001. Architecture is the direct parent; no separate solution
design is needed for the existing pack/export/ingestion path.

## Scope and Objective

Qualify selected source and supplemental records, exact retention and explicit
local execution. Broader carrier, epidemiology, DICOM and graph-engine support
remain separate claims. No historical test-first run is claimed.

## Acceptance Criteria Test Mapping

| Criterion | Harness | Required assertion and citation |
| --- | --- | --- |
| US-055-AC1 | medical-subpacks Bun test | Carrier schema inventory, native records and independent supplemental events; `@covers US-055-AC1`. |
| US-055-AC2 | medical-subpacks Bun test / Chromium | Exact decimals, sequences, unknown tags, namespaces and unresolved references recover; `@covers US-055-AC2`. |
| US-055-AC3 | medical-subpacks Bun test | CDC counts/rates preserve absent denominator; synthetic suppression differs from zero; `@covers US-055-AC3`. |
| US-055-AC4 | Bun / pydicom native check | Native UID/VR/private sequence and pixel bytes agree with retained fixture and metadata; `@covers US-055-AC4`. |
| US-055-AC5 | Bun / exporter | Exact terminology release lookup; unavailable licensed source stays unresolved; stale bytes and rights refuse; `@covers US-055-AC5`. |
| US-055-AC6 | Bun / Chromium / TableSpec | Regeneration is deterministic; all pack metadata and JSON/YAML recover, rows and archive originals read back; `@covers US-055-AC6`. |

## Executable Proof

Run `bun test tests/domain-packs`, `bun scripts/build-medical-subpacks.ts --check`,
`bun run typecheck`, `bun run test:schemas`, `bun run build` and
`bun scripts/domain-pack-browser.ts`. Native and TableSpec commands and versions
are recorded in the final evidence artifact.

## Data and Setup

Use checked-in originals and locked JavaScript dependencies. TableSpec verification
uses its existing local virtual environment; pydicom is an isolated evidence tool.
Download/access is development work, never an implicit pack operation.

## Edge Cases and Failure Modes

Require duplicate native keys, namespace collisions, negative eligibility,
uncleared source rights, hash tampering, retired/unavailable terminology,
suppression/zero/unknown, exact money and nested private DICOM content.

## Build Handoff

Follow TD-055: source qualification, projections, pack artifacts, consumer checks.
Done requires all six criteria to pass their named scoped checks, with versions and
limits recorded. Full native equivalence and live services remain unclaimed.
