---
ddx:
  id: STP-060
  type: story-test-plan
  activity: test
  status: draft
  authoring:
    home: repo
  links:
    - id: US-060
      kind: informed_by
    - id: TD-060
      kind: informed_by
    - id: CONTRACT-057
      kind: references
---

# STP-060: Domain-pack loader companion slice

## Story Reference

[[US-060-domain-pack-catalog]], [[TD-060-domain-pack-loaders]],
[[SD-026-domain-pack-platform]] and the project test plan govern this slice.

## Scope and Objective

Prove AC8–AC12 for finite explicit inventories. Existing AC1–AC7 retain their
separate baseline; full native engines, source discovery, email and screening
are not qualified here.

## Acceptance Criteria Test Mapping

| AC | Covering test/command | Asserted behavior | Citation |
| --- | --- | --- | --- |
| US-060-AC8 | loader metadata test; loader-browser.ts | Unknown annotation retention, profile/version refusal, Bun/browser parity and no host globals | @covers US-060-AC8 |
| US-060-AC9 | runner revision test | Exact bytes and hash, unchanged rerun, changed-byte history, source URL/metadata preservation | @covers US-060-AC9 |
| US-060-AC10 | failure/recovery/lock tests | Failure leaves current intact; receipts identify missed coverage; recovery completes; concurrency refuses; interruption before commit retains current | @covers US-060-AC10 |
| US-060-AC11 | replay test | No requests, identical projection, tampered originals/history/projection refuse | @covers US-060-AC11 |
| US-060-AC12 | bounds/rights/export/clean CLI/publication bridge tests | Actual HTTP transport plus HTTPS policy refusal, request/media/size/retry bounds, cleared export, trusted standalone install, exact-byte selected projections and aggregate copy refusal | @covers US-060-AC12 |

## Executable Proof

`bun test tests/domain-packs/loader.test.ts tests/domain-packs/loader-runner.test.ts tests/domain-packs/loader-export.test.ts tests/domain-packs/loader-publication.test.ts`
`bun scripts/loader-browser.ts`
`bun scripts/build-domain-pack-loaders.ts --check`
`bun run typecheck`; `bun test tests/domain-packs`; `bun run test:schemas`.
Run independent local transport checks and clean exported CLI in temp directories.
Loopback HTTP is available only as a test-injected transport policy; production
CLI always uses HTTPS/host validation and has no bypass flag. This establishes
transport behavior without a public-source completeness claim.

## Data and Setup

Synthetic PDF/filing bytes and named inventory IDs isolate expected outcomes.
No personal information, paid source or credentials. Require original-byte
independent SHA-256 comparisons. Chromium uses the real compiled public module.

## Edge Cases and Failure Modes

Empty poll, duplicate ID, changed URL, amendments, withheld media, restricted
rights, unknown version, HTTP redirects/429/500, budget exhaustion, timed-out
stream, stale/corrupt current, tampered history, pack version drift, concurrent
lock and interruption before pointer publication all require explicit outcomes.

## Build Handoff

Build metadata then runner then bundled examples/publication. Material Astra
findings block build closeout. Record commands, versions and observed failures
in the build evidence. Live source discovery and distributed rate coordination
remain separately unqualified.
