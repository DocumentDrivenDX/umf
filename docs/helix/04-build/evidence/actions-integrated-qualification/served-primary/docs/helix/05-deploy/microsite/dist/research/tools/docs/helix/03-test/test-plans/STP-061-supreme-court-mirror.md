---
ddx:
  id: umf.stp061.supreme-court-mirror
  type: story-test-plan
  activity: test
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

# Supreme Court mirror test plan

## Scope and Objective

Qualify the 2024/2026 granted/noted-list discovery subset, exact docket retention,
lossy metadata extraction and explicit local PDF acquisition. No all-case coverage,
production latency, browser-library, legal screening or redistribution claim.

## Acceptance Criteria Test Mapping

| AC ID | Asserted behavior | Covering test / citation | Level |
| --- | --- | --- | --- |
| US-061-AC13 | Source case identity and hash refuse mismatches; live offline check recovers every retained list/case and docket | `supreme-court-mirror.test.ts` @covers US-061-AC13; collector `--phase check` | Frozen consumer + live archive |
| US-061-AC14 | Real rejected filing remains not-accepted; original petition has three associated links; counsel card preserves named party; outcome entry stays unknown filing status | `supreme-court-mirror.test.ts` @covers US-061-AC14 | Frozen real HTML |
| US-061-AC15 | Successful bytes survive failed observation; tampering refuses; markup-only change differs from semantic change; missing proceeding has no inferred withdrawal; batch URL dedupe preserves rights and context | `supreme-court-mirror.test.ts` @covers US-061-AC15 | Consumer / failure |

## Executable Proof

`bun test tests/domain-packs/supreme-court-mirror.test.ts` invokes portable Python
standard-library assertions. Frozen original `23-477.html` contains the real
not-accepted/corrected filing pair. List extraction uses pypdf 6.10.0 and is
qualified separately against the retained live lists by the offline check.

The shared TableSpec Python collector supplies acquisition, replay, complete
BagIt handoff validation and fixity audit evidence. These checks qualify the
selected PDF batches; they do not qualify every discovered URL or downstream
DuckDB/Spark publishing in this mirror.

## Edge Cases and Failure Modes

Wrong case, missing docket/proceeding structure, unknown source URLs, HTML instead
of PDF, timeout, byte limit, robots disallow, corrupt cached bytes and changed
batch context must remain visible. No missing document is inferred to be sealed,
withdrawn or vacated. Fresh all-case discovery remains unqualified.
