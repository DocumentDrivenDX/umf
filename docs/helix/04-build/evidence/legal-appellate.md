# Legal appellate pack evidence — 2026-10-09

Scope: FEAT-010 DOMAIN-07; US-061-AC9–AC12; TD-061; STP-061;
CONTRACT-052/053/058. The shared loader is a separately invoked host runtime.
Existing legal 1.1.0 and core adapters remain separately qualified.

## Delivered subset

Pack 1.0.0 contains 34 original PDFs, 1,689 PDF pages, 27 source-scoped cases,
10 courts and 13 issue groups. Fifteen native schemas describe 1,979 total rows.
Eighteen provisional annotations retain 38 evidence excerpts. Eight selected
named counsel entries retain party/source/as-of evidence; the rest remain absent
or not assessed. Two entirely fictional review/lookup pairs exercise found/failed
enrichment. Thirty fabricated events have independently authored expectations.
Actual acquisition attempts, failures and three unavailable metadata-only
reference candidates remain distinct from fabricated workflow state.

## Review and verification

| Check | Measured evidence |
| --- | --- |
| Astra plan review | Corrected acceptance criteria, temporal expectations, notification policy, original comparison evidence, opinion voice, coverage and counsel uncertainty before build. |
| Astra final review | Fixed actual vacatur state mutation and typed fictional enrichment linkage; strengthened four issue excerpts; clarified proposed transport outcomes. Follow-up confirms duplicate eligibility precedes transport failure and no blockers remain in reviewed replay scope. Shared loader code was outside this review. |
| Offline rebuild | pypdf 6.10.0 projector `--check` passes. No OCR/network or automatic labeling. |
| Bun regression | `bun test tests/domain-packs`: 51 pass, 0 fail, 25,990 assertions across 12 files. Four appellate tests cover expanded criteria and tampering/rights refusal. |
| TypeScript/build | `bun run typecheck` and `bun run build` pass with Bun 1.4.2 and locked dependencies. No broad adapter requalification inferred. |
| Browser | Chromium 153.0.8010.12: 20 checks; all 15 schemas recover exactly; loader-bearing manifest JSON/YAML recovers without Bun/Node globals. |
| Native schema | Pydantic 2.11.10 admits 15 schemas against pinned TableSpec model SHA-256 `ad82c596c9276823e5c71435198d8e419bc5c1abb0a71bdc0adf03f1060a2f2b`. |
| Native ingestion/ZIP | TableSpec ImportedDataset reads all 1,979 typed rows; batches match native CSV reading. ZIP recovers all 34 PDF hashes. Details: `legal-appellate-tablespec.json`. No database sink run. |
| Catalog | Explorer discovers 25 packs/289 entries; appellate has 15 schemas and 61 downloadable sources (34 PDFs). Local build only, no public deployment. |
| PDF inspection | PDFium rendered Cobra amendment and Chatrie first pages; citation correction and en banc/certiorari stamp agree. Poppler was stopped because bundled fontconfig was unavailable. No text-extraction visual fidelity claim. |

## Shared loader integration and feedback

Exact companion bytes from the parallel worktree's canonical
`spec/loader-companion/1.0.0/` release are retained with artifact checksums.
Run artifact hash: `78d174cab9e8ca8a8e23670d920ad51759bbaaa33ce1e03a2f931d0debda1c27`.
Acquisition/replay manifest snapshot hash: `4e7bd8090ba602386871ff130d35c0adf23b9c3f3af0dfce4347b1afd38c2fe8`.

Full `backfill --rights redistribute` passed: 34/34 acquisitions, every revision
hash matches its original seed. `replay --rights redistribute` then passed without
network. Receipts: `legal-appellate-loader-backfill.json` and
`legal-appellate-loader-replay.json`. This archive replay is distinct from the
notification fixture replay. The verified read-publication bridge also returned all 34 selected originals with
matching byte hashes, native docket metadata and retained rights; receipt is
`legal-appellate-loader-bridge.json`. No alternate downloader is part of the build.
The current five-file canonical companion layout requires its generic README at
the pack root, so domain instructions are preserved separately in `GUIDE.md`.

No observed shared-loader blocker for this inventory, including three judicial
mirrors. Future discovery must preserve document versions and legal status;
inventory absence must not mean vacatur. Entries now declare `expected_sha256`, so changed bytes refuse the pinned
historical selection. A later refresh inventory can remove that explicit constraint
and collect new revisions for review; the metadata checksum alone is documentary. Rights remain per-entry assertions. Pack-manifest changes require
new state; freeze installed bytes while inventory selections evolve. Court-site
discovery, PACER, email and distributed polling are outside this qualification.

## Consumer artifact

TableSpec archive: `/tmp/legal-appellate-1.0.0.zip`, 14,535,118 bytes;
SHA-256 `306135e6a03a107d488ac5255e7aeeae4d4ea28fce0f20d6edb52c8527a9e0a0`.
Contains CSVs, native schemas, metadata, original PDFs and fixed inputs.
Reading this archive does not authorize host-code execution.

## Remaining limits

AI-authored labels require attorney review. Current treatment and filing deadlines
were not comprehensively researched. Graham/Cobra opposing merits opinions and
the old Chatrie panel are not bundled. Counsel extraction is partial. No production
schedule, real recipient, mail delivery or PACER request was configured. Supreme
Court docket monitoring remains separate and undefined pending its later workflow.

## Final shared-reader refresh

The final canonical closure refresh changes only `read-publication.ts` and its
README; acquisition runner hash remains unchanged. Reader SHA-256 is
`2da3e35038d1b27c34d86b8cc2abe94d10c110ac2df9d573d09af266740fd25b`. The current
pack manifest hash is `404a523d513442e67c28271d660e1eeb40f8da1182ec6ec3ccd976a4da4bcd6e`.
The final reader was exercised against the retained publication: all 34 selected
original byte hashes, docket metadata and rights agree. The bridge receipt was
updated. Focused four-test export/replay/rights/hash checks and native typed
readback/archive recovery pass after the refresh; the catalog was rebuilt.
Earlier backfill/replay receipts remain tied to their exact historical manifest.
No new source acquisition was needed because the runner and original inventory
are unchanged. A new installation must use fresh state for the new manifest.
