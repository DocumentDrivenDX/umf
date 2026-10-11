---
ddx:
  id: CONTRACT-060
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: US-061
      kind: references
---

# Supreme Court mirror contract 1.0.0

## Purpose

Govern the explicit consumer collector and local archive, separately from UMF library/schema inspection.

## Scope and Boundaries

Initial discovery: all case numbers extracted from the Court's October Term 2024 and 2026 granted/noted lists. This MUST be labeled a merits-list subset; denied petitions, applications and original jurisdiction outside those lists are not covered. Historical docket snapshots are current retrievals, not snapshots as they existed in 2024.

## Normative Surface

`scripts/domain-packs/supreme-court-mirror.py` accepts `--root DIRECTORY`, `--phase discover|inventory|check`, and optional `--refresh`. Discover retrieves robots and both list PDFs, extracts case numbers and emits `cases.json`. Inventory fetches each case docket and emits `dockets.json` and `pdf-inventory.json`. Check verifies retained object hashes and parser recovery without network. Default reuse is offline for already successful sources; refresh explicitly requests fresh observations.

Objects MUST use SHA-256 content identity in `objects/`; `observations.jsonl` MUST retain URL, retrieval time, object hash, byte length and success/failure. A failure MUST NOT replace the latest successful snapshot. `latest.json` maps URLs to successful observations. `coverage.json` MUST declare discovery scope, successful/failed case counts, excluded populations and PDF acquisition as separate coverage.

Each docket projection MUST retain case number, source URL/hash, metadata, dated proceeding text and associated PDF links, counsel source text and all discovered PDF links. Unknown status MUST NOT become filed. The exact HTML is authoritative; normalized text is a lossy derivative.

`changes.jsonl` MUST distinguish initial snapshots, unchanged normalized projections and semantic changes. Added and missing proceedings are observed differences, not legal-status inferences. Collector execution MUST use a nonblocking exclusive local lock.

`scripts/domain-packs/supreme-court-batches.py --root DIRECTORY [--size N]` prepares immutable numbered inventories, appending newly discovered URLs to new batches and retaining historical URL contexts and `batch-plan.json` containing each inventory SHA-256. `scripts/domain-packs/supreme-court-acquire.py --root DIRECTORY --start N --count N` MUST verify those hashes and robots policy, acquire explicit batches through TableSpec Python, replay successful states offline, validate BagIt handoffs and audit fixity. `pdf-acquisition.json` MUST retain per-batch outcomes. Existing successful batches MAY be replayed without re-fetching.

PDF acquisition MUST use the pinned shared companion's explicit local-use inventory. Party-authored filings MUST declare redistribution unknown. Discovery MUST NOT trigger PDF download, screening, notification, PACER or code from source documents. Inventory identifiers use URL SHA-256, distinct from content versions; duplicate URLs have one acquisition entry and retain all case associations.

Transport MUST require HTTPS on www.supremecourt.gov, honor robots exclusions and at least one second between requests, reject redirects outside scope, enforce timeout and byte bounds, record errors and continue independent cases. No authentication or restriction bypass.

## Precedence and Compatibility

Version 1.0.0; raw bytes govern over extraction. Prior objects and observations remain retained. No changes to existing appellate manifests or core adapters.

## Error Semantics

Network, limit, robots or parse failures yield explicit incomplete coverage and a nonzero exit. A changed snapshot retains both versions. Missing links do not establish withdrawal, vacatur or not-accepted status. Shared acquisition publication requires every selected entry to succeed; failure receipts remain separate from last successful publication.

## Examples

`python3 scripts/domain-packs/supreme-court-mirror.py --root /tmp/supreme-court-mirror --phase discover`

`python3 scripts/domain-packs/supreme-court-mirror.py --root /tmp/supreme-court-mirror --phase inventory`

## Non-Normative Notes

Official sources: https://www.supremecourt.gov/orders/grantednotedlists.aspx, https://www.supremecourt.gov/docket/docket.aspx, https://www.supremecourt.gov/robots.txt. Public access does not settle third-party redistribution rights. Operator-selected local-use collection is separate from publication of a domain pack.
