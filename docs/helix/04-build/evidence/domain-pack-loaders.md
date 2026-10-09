---
ddx:
  id: umf.domain-pack-loader-evidence
  type: execution-evidence
  activity: build
  status: reviewed
  authoring:
    home: repo
  links:
    - id: CONTRACT-057
      kind: references
    - id: TD-060
      kind: references
    - id: STP-060
      kind: references
    - id: US-060
      kind: informed_by
---

# Domain-pack loader execution evidence

## Delivered scope

Companion 1.0.0 admits finite court-PDF and SEC-document/API inventories, acquires
original bytes, records revisions and observations, publishes local immutable
snapshots atomically, refreshes and replays offline. Portable metadata admission
stays browser compatible; the Bun runner and bounded publication reader are host
companions. Domain builders own discovery, legal/financial projection and
TableSpec integration. The two shipped demo inventories are intentionally empty.
No cron schedule or external acquisition service is installed.

## Astra ultra review

Plan, implementation and integration-feedback slices were reviewed by a
`gpt-6-astra` subagent at `ultra`. Material findings were resolved: receipt before
commit, committed-inventory replay, independent canonical executable trust,
bounded snapshot exports and regular-file reads, canonical entrypoints, exhausted
transport budgets, SEC fixtures and generic/medical catalog wiring. The feedback
slice added a pre-allocation 500 MiB selected-copy limit counting each retained
context and linear deduplication. Its 501-context regression refuses before
cloning. Final reviewer disposition: no remaining material findings, conditional
on running tests and regenerated five-artifact closure checks, both passed.

## Final slice verification, 2026-10-09

Bun 1.3.14 compiled and checked the five canonical artifacts and both pack-local
copies. Strict library and tools TypeScript checks passed. Final domain-pack plus
acceptance-ledger run: **69 passed, zero failed, 3,294 assertions, 16 files**.
Coverage includes native loopback TLS, retries, stream deadlines, aggregate budgets,
original/configuration/projection/receipt corruption, SIGKILL before and after
publication, preservation after failed refresh, source pins, clean standalone
court/SEC execution and selected exact-byte handoff. The acceptance ledger was
regenerated and its gate passed.

Chromium **153.0.8010.12** passed eight checks using the public portable module;
this does not qualify acquisition in browsers. Extension audit: **62/62**;
JSON Schema audit: **359/359**. Two catalog integrations covered a generic loader
without an inventory and a medical pack with a loader, exposing only actual assets.

A full repository regression was also attempted at an earlier implementation
checkpoint. It has unrelated JSON Schema-to-Protobuf failures: a 5-second compiler
timeout and a missing `.venv/bin/python` independent oracle. Its stale acceptance
ledger failure was introduced by this slice and is resolved by the final gate.
The full repository run is not claimed clean; slice acceptance rests on the final
scoped checks above.

## Consumer feedback and adoption

“Find appellate opinion sources” adopted the canonical loader and reported all
34 selected PDFs acquired with matching original hashes and successful offline
archive replay. Its legal projections remain domain owned.

“Research public-data S&P 500 pack” adopted the companion for its explicit SEC
inventory. Feedback identified the missing verified publication-to-projection
bridge, stable release/upgrade guidance and ambiguous documentary checksum fields.
Implemented a shared bounded reader/export CLI, release instructions and explicit
`expected_sha256` enforcement; documentary annotations remain untouched. The
session verified exact selected bytes through its company projector and reported
eight focused tests, typechecks, schema audits, DuckDB readback and Chromium passing.
It explicitly has not qualified live SEC acquisition through the companion.
Both sessions were instructed to refresh the final five-artifact closure and use
this mechanism, with further material feedback incorporated before closeout.

## Publication

Pending the authorized master deployment and public-download smoke below.
