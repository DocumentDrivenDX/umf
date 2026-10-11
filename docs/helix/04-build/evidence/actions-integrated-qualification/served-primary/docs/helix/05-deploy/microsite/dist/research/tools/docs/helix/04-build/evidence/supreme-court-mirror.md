---
ddx:
  id: umf.evidence.supreme-court-mirror
  type: implementation-evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: US-061
      kind: references
    - id: CONTRACT-060
      kind: references
    - id: umf.td061.supreme-court-mirror
      kind: references
    - id: umf.stp061.supreme-court-mirror
      kind: references
    - id: umf.build.supreme-court-mirror
      kind: references
---

# Supreme Court source mirror: initial collection evidence

Observed on 2026-10-09 America/New_York (receipts span 2026-10-10 UTC).
The source-only collection is separate from the legal/appellate catalog packs.
No core/schema adapter or browser-library behavior changed.

## Measured Collection

| Boundary | Observed result |
| --- | --- |
| Discovery | 74 identifiers in October Term 2024 granted/noted list; 30 in 2026 list |
| Dockets | 104 expected, 104 successful, zero failed/unattempted |
| Docket projections | 4,466 proceedings; 305 counsel sections, not unique attorneys |
| Retained discovery/docket sources | 107 exact objects: two lists, robots, 104 docket pages |
| Linked PDFs | 7,775 unique URLs; 300 acquired; 7,475 unattempted |
| PDF bytes | 167,363,721 bytes across successful URL rows |
| Shared acquisition batches | 0001–0005 and 0153 complete; zero failed selected batches |
| Preservation | Six complete BagIt handoffs validated; SHA-256 fixity passed |
| Portable bundle | 662 members, 153,854,840 bytes; ZIP CRC passed |

The final 104-case count supersedes the initial 101-case discovery. Auditing the
list's numeric lines caught three application dockets (`24A884`, `24A885`,
`24A886`) missed by the initial hyphen-only form. The corrected extractor has a
frozen application-form regression and all three docket pages were collected.
The first application PDF batch was acquired separately. Previously generated
inventories retained their hashes; newly discovered URLs appended batches
0153–0156, preserving earlier acquisition contexts.

The initial PDF set includes 101 Questions Presented links and 199 other linked
filings, including petitions, appendices, certificates and application materials.
Earlier acquired URL context is retained; current case/link associations are in
`dockets.json`. Downloads are not a complete set of the linked filings.

## Execution and Checks

Discovery/list extraction: Python 3.12.14, pypdf 6.10.0. Frozen parser/state/batch
tests also passed under Python 3.9.6. Acquisition: local TableSpec native Python
source for the planned 0.0.8 collector under Python 3.12.15. No Bun is invoked by
acquisition; exact canonical Bun 1.0 companion artifacts remain compatibility
references. The native source fingerprints are retained separately; this record
does not claim a new TableSpec package release.

- `bun test tests/domain-packs`: 52 passed, zero failed, 25,993 Bun assertions,
  13 files. Later Python refinements passed the focused mirror test again.
- `bun run typecheck`: passed. Python syntax compilation passed with a writable
  temporary cache; the first system-Python attempt failed because its default
  cache directory was outside the sandbox.
- Collector `--phase check`: 107 original source hashes and 104 docket
  projections recovered offline, with all 104 list identities recovered.
- Cached inventory replay before application expansion: 101 unchanged projection
  records, with no source requests. Later expansion reused those pages and added
  three actual application snapshots.
- Every selected native acquisition batch passed replay, handoff validation and
  fixity audit. The portable bundle omits duplicate acquisition states and retains
  complete BagIt handoffs. Its application batch was verified from a second root
  without source requests; all docket/list recovery also passed from that root.
- `git diff --check`: passed.

Frozen assertions cover wrong-case/layout refusal, counsel/party evidence, the
real not-accepted filing and corrected filing context, unknown outcome filing
status, PDF associations, HTTPS host refusal, corrupt source refusal, retention
of successful bytes after a failed observation, simulated processing/network
failures, markup-only versus semantic changes, missing-entry uncertainty, URL
batch deduplication and immutable batch append. Expected synthetic failures
are distinct from the observed zero-failure collection.

## Handoff and Remaining Work

Local portable archive: `/tmp/supreme-court-mirror-1.0.0.zip`.
SHA-256: `2a42bfc84b82f2911c13be3ea9295d9f7294ae61770c502d5fe4bc55f18d4b19`.
The archive contains exact original docket/list bytes, normalized JSON records,
all immutable PDF inventories, source collector scripts, acquisition companion
closure and six complete preservation handoffs. See the source-only
[guide](../../../../spec/domain-packs/legal-supreme-court/GUIDE.md).

Machine records: [coverage](supreme-court-mirror-coverage.json),
[acquisition/replay/audits](supreme-court-mirror-pdf-acquisition.json),
[software fingerprints](supreme-court-mirror-software.json),
[archive fingerprint](supreme-court-mirror-archive.json).

Pending batches are 0006–0152 and 0154–0156. Batch preparation can append new URLs
without rewriting earlier inventories; the helper verifies existing handoffs
without network and collects explicitly selected pending batches. Neither a
background job nor recurring automation is running.

The source lists omit ungranted petitions and applications outside those lists.
Historical docket retrievals are current snapshots, not historical point-in-time
captures. Sealed/unposted filings remain unavailable. Complete all-case discovery,
full linked-PDF bulk acquisition, live screening, notifications, latency targets
and production scheduling are unqualified. Party-authored filing redistribution
rights remain unknown; this is a local-use corpus, not a published domain-pack
release. No database publishing, PACER lookup or outreach occurred.


## Shared Collector Integration Follow-up

The shared collector follow-up recommends TableSpec 0.0.9 for the Spark CLI.
Local code confirms the session factory now receives the required application
name, and its guide identifies 0.0.9. The source-only mirror guide now recommends
that version. No acquisition was repeated and no historical provenance was
rewritten. The existing archive retains the guidance present when packaged;
the repository guide is the current installation recommendation.

The shared collector owner clarified that `urn:tablespec:document-loader:0.0.8`
and `agentVersion: 0.0.8` identify the collector engine, independently of the
installed TableSpec package release 0.0.9. The patch changes the Spark CLI,
typing boundaries and release publication, not the collector contract. UMF's
companion remains 1.0.0. This resolves the provenance-version question; existing
records remain unchanged. Future operator/job receipts should record the installed
TableSpec package version separately from the engine identifier. No new 0.0.9
acquisition or runtime qualification is claimed here.

Publication amendment: CONTRACT-060 is the integrated contract ID (CONTRACT-059
is already the company contract). Historical original-source probe records stay
unchanged. Public parser regression uses a separately authored, labeled HTML
fixture; the original unknown-redistribution HTML is retained privately and
is not included in the release. The authored regression passed in Python and Bun.
