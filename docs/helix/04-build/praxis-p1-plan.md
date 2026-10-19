---
ddx:
  id: umf.praxis-p1-plan
  type: implementation-plan
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.praxis-lifecycle-roadmap
      kind: informed_by
    - id: SD-033
      kind: informed_by
    - id: CONTRACT-079
      kind: informed_by
---

# Praxis P1 implementation

## Scope

The owner authorized committing/pushing the remaining licensing changes and
starting P1 on 2026-10-18. Governing artifacts are the
[roadmap](../01-frame/praxis-lifecycle-roadmap.md), FEAT-033, US-092,
[SD-033](../02-design/solution-designs/SD-033-generated-ontology-access.md),
CONTRACT-068/079 and the existing generator/boundary/installed-wheel tests.
This first implementation change delivers Pydantic dependency compatibility and
a genuine generated synchronous client alongside the existing async API.
It does not claim completion of P1 or native driver/session qualification.

## Shared Constraints

Generated Python stays stdlib-only, browser generation remains deterministic,
SQL compilation stays in Weft, and hosts own execution and authorization.
Sync and async transports exchange the same wire requests; sync methods never
run or schedule a coroutine. Preserve exact values, schema custody, limits,
relationship/field ownership and unknown write outcomes without retries.
Existing async Client/Actions names remain valid. No package-index publication
or release tagging is included in this implementation start.

## Implementation Slices

| Slice | Area / governing artifacts | Depends on | Validation gate | Boundary |
| --- | --- | --- | --- | --- |
| P1-01 | License publication; roadmap WS-9 | Prior licensing audit | Four remote branch heads and clean sibling trees | UMF branch publication; sibling main publication explicitly authorized |
| P1-02 | Compatibility; roadmap gap 7, CONTRACT-068 | P1-01 | Demonstrate old-wheel resolver conflict; install candidate wheel with Pydantic 2.13.5 and 2.14.1; exercise generated models/codecs and runtime guards | Library range >=2.13,<3; exact versions remain test inputs |
| P1-03 | Typed sync API; US-092 AC1–6/8–9, CONTRACT-079 | Source boundary baseline | Isolated Python3.11 sync/async parity, real running-loop synchronous calls, spawned child, malformed transports, lost-write behavior; three checker positive/negative cases; Bun/Chromium parity | No native driver/session support inferred from portable tests |
| P1-04 | Per-call connections and native sync/async drivers; roadmap gaps 4/5 | P1-03 and driver/session contracts | Native person/batch/pool/cancellation/transaction tests | Follow-on; authentication and native authority remain host-owned |
| P1-05 | Pinned Bun-free generation, index and installed cohort; roadmap gaps 9/10 | Packaging/toolchain design and publisher availability | Complete-byte cross-generator comparison and offline vendoring from verified index | Follow-on; do not invent a working index or Bun-free CLI |

The source module map is `src/access/index.ts` (schema derivation and Python
model/action emission), `src/access/python-runtime.ts` (shared portable codecs,
request semantics and sync/async runtime emission), existing output writer in
`scripts/umf-access-generate.ts`, and host runtime `python/umf_access`.
`bun run check:unified-client-boundaries` and `bun run check:access-boundaries`
are the existing portable/host gates. Their negative controls and ownership
checks must pass; the sync addition cannot permit I/O, SQL, host imports or
executable schema hooks in generated clients. Existing boundary exceptions
remain scoped; do not expand them to hide feature dependencies.

## Execution Contract

Continue the authorized implementation through the first two functional slices
and their verification, preserving remaining P1 work explicitly. Do not publish
new runtime guarantees for untested backends. No comparable token baseline or
runtime budget enforcement is available; provisional implementation/verification
ceiling is 24,000 additional tokens for this first change, with a continuation
record required if reached. No elapsed-time delivery commitment is inferred.

## Validation Plan

Capture a failing dependency resolution and failing sync-client test before the
change. Build and install the actual candidate wheel with each pinned Pydantic
version; library metadata admits compatible versions rather than pinning one.
Generate the existing commerce fixtures to exercise real Pydantic model/codecs,
not substitute models. Check generated Python3.11 with mypy, pyright and ty,
including wrong sync/async bindings, wrong model keys and action argument types.
Run source boundaries, TypeScript checks, public build, deterministic writer
regressions and a real Chromium byte comparison. Native PostgreSQL tests require
their actual configured environment; a skipped case remains a missing native gate.

## Risks and Rollbacks

| Risk | Response | Rollback |
| --- | --- | --- |
| Sync/async implementations diverge | Derive both scheduling surfaces from the same controlled runtime template and shared codecs; compare request/outcome transcripts | Revert the sync emission slice; existing async API remains |
| Dependency range overclaims compatibility | Exercise actual installed wheels at the Praxis version and existing qualification version; preserve exact failures/limits | Revert metadata widening without rewriting historical locks |
| A fixture is mistaken for native qualification | Label portable/fake and installed-package checks separately from native engines | Withhold native support claim |

## Exit Criteria

The first change is complete when P1-01/02/03 pass their scoped gates, canonical
API/design documents match the implemented calling modes, and evidence names
remaining P1-04/05 work. Full P1 is complete only when the native connection,
Bun-free generation, distribution and consumer gates also pass.

## Continuation Evidence

Initial state: licensing is pushed to UMF `codex/praxis-p1-lifecycle`, Weft,
Truss and Hohfeld `main`. The old installed host wheel refuses Pydantic2.13.5
because it pins2.14.1. P1-02/03 now have scoped passing portable/installed evidence: the library range
and sentinel bridge, generated sync API, shared wire behavior, negative typing
sites, worker/loop calls and Pydantic2.13.5/2.14.1 runtime/model checks. P1-04/05
remain follow-on gates. This is the authorized implementation start, not full P1
completion. Execution results are recorded in
[evidence](evidence/praxis-p1.md) when available.
