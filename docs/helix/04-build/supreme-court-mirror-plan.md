---
ddx:
  id: umf.build.supreme-court-mirror
  type: implementation-plan
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: US-061
      kind: references
    - id: umf.td061.supreme-court-mirror
      kind: references
    - id: CONTRACT-060
      kind: references
---

# Supreme Court mirror build plan

## Scope and Shared Constraints

Owner authorized the initial bounded mirror. Collect the historical 2024 and current 2026 granted/noted-list subsets, clearly excluding all-case completeness. Keep public party filings local with unknown redistribution rights. No live screening or email configuration is included.

## Implementation Slices

| Slice | Outcome | Validation |
| --- | --- | --- |
| S1 | Exact retained lists, source-qualified discovery inventory | pypdf identities, original hashes, duplicates |
| S2 | Every discovered docket, proceedings/counsel/PDF associations | Parser regression, live coverage and integrity checks |
| S3 | Pinned shared companion, resumable PDF batches | Acquisition/replay receipt and exact byte hashes |
| S4 | Handoff with pending coverage and continuation commands | Explicit exclusions and no production-monitor claim |

## Validation Plan

Offline parser/state tests plus live acquisition/check evidence. Collection failures remain visible and independent work continues. Shared-loader publication semantics are preserved; no custom replacement downloader.

## Risks and Rollbacks

All-case discovery unresolved; local mirror must not be advertised as all Supreme Court cases. Stop invoking the collector to stop requests. Keep prior object versions and successful publications after failures.

## Exit Criteria

All source-list identities have a docket outcome; PDF inventory is available with measured acquisition coverage; immutable originals, tests and continuation instructions are delivered. Entire historical/public archive and production freshness remain outside this first slice.


## Initial Slice Outcome

S1–S4 passed for the declared source-only subset: all 104 list-scoped dockets,
4,466 proceedings and 305 counsel sections retained; 7,775 PDF URLs inventoried,
300 acquired in six verified preservation handoffs. The remaining 7,475 PDFs
are explicitly unattempted. [Evidence](evidence/supreme-court-mirror.md) records
tests, hashes, corrected application discovery and portable handoff checks.
All-case enumeration and complete PDF backfill remain subsequent slices.
