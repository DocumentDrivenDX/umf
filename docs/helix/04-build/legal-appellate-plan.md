---
ddx:
  id: umf.legal-appellate-plan
  type: implementation-plan
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-010
      kind: informed_by
    - id: US-061
      kind: informed_by
    - id: SD-026
      kind: informed_by
    - id: CONTRACT-052
      kind: informed_by
    - id: CONTRACT-053
      kind: informed_by
---

# Legal appellate corpus build plan

## Scope

Owner-authorized development corpus for an owned-platform appellate opportunity
screening workflow. Current associates spend 5–8 hours weekly collecting court
PDFs, followed by attorney screening in Harvey. A fixed historical pack supports
parallel solution development while a faster collector is designed separately.
FEAT-010 DOMAIN-07 and FR-45 govern this expansion. Reuse CONTRACT-052/053,
TableSpec native schemas, source export and fixed ingestion; preserve legal 1.1.0.

Target 30–50 original documents across 10–15 issue groups, including Second
Circuit decisions, other federal appellate opinions and state highest-court
material. Include explicit conflicts, comparison-based tension, dissent-only
claims, clean negatives, amendments, vacatur/rehearing, and missing counsel.
Selected issue groups need original comparison documents. Research annotations
are provisional and must not be presented as attorney-approved ground truth.
No present-day unresolved-split claim is established by a historical decision.

## Shared constraints

- Original bytes and source-qualified identities remain authoritative. Pin hashes,
  retrieval dates, source URLs and per-source rights. No fictional firm joins.
- Keep observed facts, curated/provisional annotations and fabricated replay records
  in separate sources/tables. Missing counsel is not evidence of no representation.
- Preserve page ordinals, native citations, majority/dissent attribution and
  historical status separately; text-layer extraction does not claim OCR/layout fidelity.
- Polling interval, court-site list, designated order classes, recipient and actual
  attorney prompt are unknown. No live polling, email, PACER charges or credentials.
- Supreme Court docket monitoring remains separately undefined; user expects its
  workflow next week. Supreme Court resolution documents may be comparison evidence.
- Existing UMF browser-compatible schema tooling is reused. Extraction/build scripts
  are host-only. TableSpec owns production ingestion and data testing.

## Replay policy and qualification

Temporal arrival replay is a fixed fixture under CONTRACT-052; it does not use
CONTRACT-053 component scaling. Successful notification identity is recipient +
document content hash + alert kind. Failed delivery leaves the identity eligible
for retry. A new prompt triggers re-screening but alone does not create a new
email. An amended document has new content identity and may create a new alert;
a vacatur produces a separate status alert linked to the affected decision.
Counsel enrichment is attached to the existing review item; no separate email.
Different recipients have independent receipts. Corpus records do not declare
that these application state transitions are implemented by shared pack tooling.

Expected collection windows include a successful-empty listing, failed listing,
retrieval failure, extraction failure and screening failure with explicit recovery.
Synthetic counsel enrichment uses wholly fictional cases/parties/attorneys.
Curated claims carry annotator/method/status, page evidence and historical scope.
Court levels and legal bases must prevent different state-law holdings from being
mistaken for a federal-question conflict. All supplied labels are provisional.

US-061-AC9–AC12 own this slice; schemas and fixtures realize those outcomes.
Exact table fields are governed in CONTRACT-058 before implementation.

## Implementation slices

| Slice | Changes | Depends on | Validation gate |
| --- | --- | --- | --- |
| A1 | Astra plan review; reconcile findings before implementation | Plan | Review recorded, material findings resolved |
| A2 | Curated source inventory and original PDFs in legal-appellate | A1 | 30–50 valid PDFs, 10–15 groups, hashes, rights, case/source closure |
| A3 | Fixed pack, native schemas, metadata/page/counsel/annotation CSVs | A2 | Deterministic offline regeneration; exact TableSpec recovery; source export/check |
| A4 | Separately fabricated replay input and expected review/notification/failure outputs | A3 | Independent expected duplicate, amendment, retry, vacatur and enrichment outcomes |
| A5 | Catalog/browser/native-consumer verification and evidence | A4 | Focused Bun tests, real Chromium admission, native TableSpec model admission, final Astra review |

## Issue decomposition

A1–A5 are the local execution work items for this request; no connected tracker
is assumed. Each maps to FEAT-010 DOMAIN-07 and this plan. Execution state and
measured results belong in evidence/legal-appellate.md, not in desired requirements.

## Validation plan

Tests must enforce original checksum integrity, source/reference closure, typed
CSV null/empty/Unicode preservation, row counts, page citations and separate origins.
Replay tests must demonstrate failure visibility, retry recovery, deduplication
per recipient/content hash/alert kind, and no false counsel certainty.
Real Chromium validates pack/schema admission and exact native schema recovery.
Export must retain exact PDFs; unknown rights refuse selected source export.
Attorney accuracy, production latency and email deliverability are unqualified.

## Risks and rollback

Legal classification may be uncertain: preserve evidence and provisional status,
request attorney review later. Source outages or rights uncertainty: retain recorded
failure and exclude uncleared bytes from redistributable source export. PDF extraction
may miss content: keep originals and explicit page-level extraction status. Rollback
removes this independent subpack and its builder/tests, restoring catalog discovery;
existing legal corpus is unchanged.

## Exit criteria

Deliver pinned original documents, all schema/CSV inputs, screening prompt template,
reviewable provisional annotations, replay inputs and independent expected outputs,
rebuild instructions and scoped passing evidence. No automated legal accuracy claim.

## Astra plan review — 2026-10-09

Astra high identified six corrections: explicit appellate ACs, fixed temporal
fixtures distinct from scaling, precise delivery/deduplication policy, original
comparison evidence, attributed historical labels, and coverage/counsel uncertainty.
US-061-AC9–AC12 and CONTRACT-058 incorporate those corrections before build.
Final review must check actual sources and evidence, beyond structural admission.

## Execution closure — 2026-10-09

A1–A5 are complete for this bounded development pack. [Execution evidence](evidence/legal-appellate.md)
records 34 PDFs/13 groups, deterministic projections, independent expectations,
browser/native TableSpec/CSV ZIP acceptance, catalog source assets and Astra's
final replay review. Material findings were corrected. The shared finite-inventory
loader was adopted with exact checksums and exercised on all 34 originals plus
offline archive replay. Production discovery, legal accuracy, email and PACER
remain separate work.
