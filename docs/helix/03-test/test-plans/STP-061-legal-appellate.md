---
ddx:
  id: STP-061
  type: story-test-plan
  activity: test
  status: draft
  authoring:
    home: repo
  links:
    - id: US-061
      kind: informed_by
    - id: TD-061
      kind: informed_by
    - id: TP-001
      kind: references
---

# STP-061: Appellate fixture verification

## Story Reference

[[US-061-legal-domain-pack]], [[TD-061-legal-appellate]], SD-026 and TP-001.
This plan covers the expanded appellate AC9–AC12 slice. AC1–AC8 concern the
existing legal operations/generator slice and remain under its prior evidence;
this build does not assert their broader consumer/scale acceptance.

## Scope and Objective

Prove original integrity, explicit interpretation/counsel uncertainty and portable
fixed inputs. Attorney screening accuracy, live latency, mail delivery and PACER
are outside this scoped qualification. No historical test-first run is claimed.

## Acceptance Criteria Test Mapping

| Criterion | Covering test / citation | Observable assertion |
| --- | --- | --- |
| US-061-AC9 | `appellate originals, schema recovery and all row references retain provenance`; `@covers US-061-AC9` | Hashes, full PDF inventory, state-highest levels, exact schema recovery, cited excerpts, provisional status and reference closure. Export test refuses tampering/unknown rights and preserves original bytes. |
| US-061-AC10 | `fixed replay checks independent expected receipts, recovery and missing coverage`; `@covers US-061-AC10` | Every authored event matches independent expected action/key/count; same bytes deduplicate across prompt changes, recipients remain independent, amendment/vacatur alerts and failed-delivery retry agree. |
| US-061-AC11 | Same replay test; `@covers US-061-AC11` | Empty listing differs from listing failure; retrieval/extraction/screening recover; final two failures and unattempted expected window remain visible. Actual source acquisition failures are retained separately. |
| US-061-AC12 | `counsel has party/page/as-of evidence and absent differs from unattempted`; `@covers US-061-AC12` | Eight selected counsel entries have source excerpts, party scope and date; absent versus not-assessed stays distinct; failed fictional enrichment retains null counsel. |

## Executable Proof

`bun test tests/domain-packs/legal-appellate.test.ts` is the blocking scoped gate.
Run the offline projector with `--check`, `bun run typecheck`, `bun run build`,
and `bun scripts/legal-appellate-browser.ts`. Native TableSpec model admission
and catalog/export evidence are recorded in the build evidence artifact.

## Data and Setup

Checked-in originals, independent curation and replay inputs; pypdf 6.10.0;
locked Bun dependencies and installed Chromium. Native schema checks use the
pinned TableSpec model and local Pydantic environment. Tests send no email.

## Edge Cases and Failure Modes

Changed original hash, uncleared rights, dangling links, incomplete comparators,
disputed dissent signal, different state statutory questions, successful-empty versus
unattempted coverage, failed-delivery retry, prompt rerun, amendment, vacatur,
and unknown counsel. Text extraction is not OCR or printed-page fidelity.

## Build Handoff

Follow plan A1–A5: reviewed policy, source inventory, deterministic projections,
independent expected results, schema/browser/native/export qualification and final
Astra review. Done means all four scoped criteria have passing measured evidence;
legal ground truth and production workflow remain explicitly unqualified.
