---
ddx:
  id: STP-090
  type: story-test-plan
  activity: test
  status: draft
  authoring:
    home: repo
  links:
    - id: US-090
      kind: informed_by
    - id: TD-090
      kind: informed_by
---

# STP-090: Core0.10 semantic references

## Story Reference

[[US-090-core-semantic-types]], [[TD-090-core-semantic-types]], [[SD-005-128-bit-uuid]]
and TP-001 govern this slice.

## Scope and Objective

Preserve exact UUID/128-bit behavior while restoring semantic pointing, explicit
registry checks, copied selection and verified migration. Native admission,
remote catalogs and other version-specific authoring expansion are excluded.

## Acceptance Criteria Test Mapping

| AC ID | Test and asserted outcome | Citation | Layer |
| --- | --- | --- | --- |
| US-090-AC1 | composition.test.ts: UUID/bits128 literals and invalid constraints retain0.9 outcomes | @covers US-090-AC1 | Unit |
| US-090-AC2 | core.test.ts and semantic-types.test.ts: exact identity, unknown/invalid/absent checks and copied values | @covers US-090-AC2 | Unit |
| US-090-AC3 | core.test.ts: collision residuals and explicit prototype migration refuse lossy conversion | @covers US-090-AC3 | Unit |
| US-090-AC4 | core.test.ts: forged/stale receipt refusals and edited rollback retain both sources | @covers US-090-AC4 | Unit |
| US-090-AC5 | composition.test.ts: old schema hashes unchanged; old receipts and unsupported authoring reject | @covers US-090-AC5 | Regression |
| US-090-AC6 | core-semantic-types-browser.ts: public bundle parity and retained selection with zero external requests | @covers US-090-AC6 | Chromium |

## Executable Proof

Commands: bun test tests/semantic-types; bun run typecheck; bun run test:schemas;
bun run build; bun scripts/core-semantic-types-browser.ts. Independent shape
comparison uses scripts/core-semantic-types-oracle.py with explicit supplied
inputs. Evidence:04-build/evidence/core-semantic-types-010/.

## Data and Setup

Synthetic namespaced semantic terms and fixed UUID/bits128 literals. No personal
data, credentials, database, external term service or remote catalog.

## Edge Cases and Failure Modes

Empty reference arrays, Unicode/identity/version mismatch, unknown qualifiers,
thrown callbacks, forged receipts, edited rollback and unsupported envelopes.

## Build Handoff

Red restored corpus precedes runtime work. Green semantic, core0.9 regression,
structural oracle and actual browser checks are required for scoped completion.
This library metadata slice has no interactive product UX or OTel integration.
