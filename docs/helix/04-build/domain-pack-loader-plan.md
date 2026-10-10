---
ddx:
  id: umf.domain-pack-loader-plan
  type: implementation-plan
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: US-060
      kind: informed_by
    - id: CONTRACT-057
      kind: informed_by
    - id: SD-026
      kind: informed_by
---

# Domain-pack loader build plan

## Scope

Implement US-060-AC8–AC12 under FEAT-009 PACK-07, FR-45 and CONTRACT-057.
The first reusable companion performs finite inventory acquisition and immutable
local publication for court-document and SEC-filing profiles. This delivers the
loader mechanism with explicit discovery limits. It does not implement the full
screening/email or financial-analysis workflows in the source chats.

## Shared Constraints

ADR-002 requires portable TypeScript declarations with real Chromium evidence;
Bun/Node APIs stay in scripts. Preserve unknown meaning and original bytes.
TableSpec consumes local source datasets; no competing warehouse loader is added.
No arbitrary supplied imports, redirects, implicit network access or secrets in
packs. Local state lock, finite budgets, revision hashes and atomic checkpoint
publication protect scheduler reuse. Runtime implementation is explicitly handed
off from HELIX; governed documents stay under docs/helix.

## Implementation Slices

| Slice | Area | Dependencies | Validation gate |
| --- | --- | --- | --- |
| L1 | Portable loader schema/admission; companion export closure | Astra ultra plan review | Bun admission/refusal, existing-pack compatibility, browser schema parity |
| L2 | Trusted finite-inventory runner, bounded transport and immutable state | L1 | Actual local TLS server: original bytes, changed/repeated inputs, failure/retry, lock, interruption, rights |
| L3 | Self-contained pack-local companions and examples for two profiles | L2 | Export then run in a clean temp directory; replay with network disabled; checksum/path tampering refuses |
| L4 | Publish bundle and operator guide through existing Pages workflow | L3 | Typecheck, domain-pack regression, schema audit, browser build/check; final Astra ultra review; Actions and public download smoke |

## Issue Decomposition

L1–L4 are ordered local execution items; each has labels helix, activity:build,
kind:build, story:US-060 and spec-id CONTRACT-057. No external tracker is assumed.
Evidence and review findings belong in evidence/domain-pack-loaders.md. Update
US-060 coverage mapping there without claiming unrelated ACs complete.

## Validation Plan

Create runner tests before implementation. Cover unknown/accessor metadata,
version refusal, URLs/redirects, content type, byte/time/attempt bounds, rights,
unchanged refresh and revisions, empty success versus source failure, retained
history, exclusive locking and recovery before publication. Independent hash and
row checks must compare originals and projected metadata. Replay must regenerate
identical documents.jsonl with fetch disabled and detect tampering. Exercise
pack-local export/clean CLI install and real Chromium admission. Full repository
regression failures are reported separately from slice acceptance.

## Risks and Rollbacks

Unknown source rights remain local-use; no blanket public-data clearance.
Finite inventories establish only selected-document coverage, not court monitoring
or complete SEC history. Runner requests need DNS trust and aggregate-rate
coordination outside one process. Local atomic rename assumes one filesystem;
network filesystem lock semantics are unqualified. Restore earlier code/site to
roll back; keep state originals and publications for recovery. Pages deployment
uses existing signatures without changing HTML. Existing deployment auth must be
verified; blocked publication does not justify reporting deployment complete.

## Exit Criteria

Astra material findings resolved; tested companion export/invocation and scheduled
usage instructions; scoped Bun/Chromium and real transport evidence; downloadable
public bundle after Pages success. No production cron schedule or recurring
external acquisition is installed without source/configuration selection.

## Astra ultra plan review disposition

Resolved publication/receipt ordering, committed-snapshot replay, revision versus
observation identity, independently trusted executable closure, snapshot-byte
export and canonical-path collision checks. Add injected pre/post-commit process
interruption, original/config/projection/receipt tampering, aggregate retry-byte
bounds and native loopback TLS transport evidence before release. Explicit
inventories qualify selected documents only; discovery adapters remain deferred.
