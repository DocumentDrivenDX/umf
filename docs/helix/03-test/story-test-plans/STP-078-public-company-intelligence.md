---
ddx:
  id: STP-078
  type: story-test-plan
  activity: test
  status: draft
  authoring:
    home: repo
  links:
    - id: US-078
      kind: informed_by
    - id: TD-078
      kind: informed_by
    - id: TP-001
      kind: informed_by
---

# STP-078: Public-company intelligence fixed corpus

## Story Reference

[US-078](../../01-frame/user-stories/US-078-public-company-intelligence.md), [TD-078](../../02-design/technical-designs/TD-078-public-company-intelligence.md), TP-001 and CONTRACT-059 govern this bounded slice.

## Scope and Objective

Verify pinned source preservation, independent screen answers and source-qualified consumer portability. Live Databricks, full EDGAR coverage, model evaluation, email and native graph intake are outside this gate.

## Acceptance Criteria Test Mapping

| AC | Covering test and assertion | Citation | Layer |
| --- | --- | --- | --- |
| AC1 | `inventory`: table/field/FK closure, native recovery and ontology validation | @covers US-078-AC1 | Bun |
| AC2 | `screen`: independently parsed pinned inputs reproduce reviewed positive accessions and exclude earnings-only controls | @covers US-078-AC2 | Bun/SQLite |
| AC3 | `exact facts`: large decimal lexeme, duplicate observations, unknown fragments and absent/null/zero survive; malformed known types refuse | @covers US-078-AC3 | Bun/Chromium |
| AC4 | `rebuild`: offline generation is byte-identical, source pins unchanged | @covers US-078-AC4 | Bun |
| AC5 | `verify-public-company.py`: all ZIP rows/schema/original bytes, Decimal lexical values and FKs agree; DuckDB query matches reviewed result | @covers US-078-AC5 | Consumer/independent engine |
| AC6 | `export refusals`: altered checksum and unknown rights prevent included export | @covers US-078-AC6 | Bun |
| AC7 | `lineage`: actual source/rule/run links and separately authored hypothesis statuses; no S&P membership claims | @covers US-078-AC7 | Bun |
| AC8 | `public-company-browser.ts`: real Chromium opens pack, ontology/table and downloads manifest; local projections execute without host globals | @covers US-078-AC8 | Browser |

## Executable Proof

`bun test tests/domain-packs/public-company.test.ts`; `bun scripts/domain-packs/public-company.ts --check`; `bun scripts/public-company-browser.ts`; `python3 scripts/domain-packs/verify-public-company.py --archive <local archive>`.

## Data and Setup

25 selected company submissions/Company Facts snapshots, selected original filing documents, explicit twelve-month filing-date window and manually reviewed expected accession answers. Network runs are source selection, not routine tests. Counterexamples use clearly fabricated in-memory payloads, never observed-source replacements.

## Edge Cases and Failure Modes

Bad parallel arrays, numeric strings, unsafe numbers, duplicate source/accession identity, missing value, unrelated item, corrupt hashes, uncleared rights and unresolved structural FKs must fail or remain explicitly unknown as specified.

## Build Handoff

Projections precede corpus generation, then exact export/local ingestion, independent semantic checks and browser discovery. Record every executed gate and residual in scoped build evidence; do not reuse other packs' acceptance as this pack's evidence.

## Shared companion allocation

`tests/domain-packs/public-company-loader.test.ts` extends @covers US-078-AC6
and @covers US-078-AC7 with exact trusted companion export, a 50-URL dated
inventory, injected acquisition, failed refresh pointer preservation and actual
standalone offline replay. CONTRACT-057 owns the loader; CONTRACT-059 owns the
domain profile. No live acquisition or operator contact is inferred from the
synthetic test contact. Shared pre-release pins are recorded in build evidence.
