# Unified Python access — implementation evidence

Recorded 2026-10-18 for FEAT-033, SD-033 and CONTRACT-079. This implements the
owner's shared Python API request on UMF 0.10.0, including UUID and bits128.

## Implementation

- `src/access/` derives the description and emits typed stdlib-only Python.
  It is browser-compatible TypeScript and is exported from the core entrypoint.
- `scripts/umf-client-generate.ts` provides generate/check, reusing the existing
  atomic output writer rather than introducing another writer.
- `python/umf_access/src/umf_access/unified/` adapts the same requests to existing
  public table DSL rendering and Weft raw/related compilation. Connections,
  actions, authorization and commit policy remain host-owned callbacks.
- Weft source changes in the sibling checkout add exact UMF 0.10 admission and
  UUID/bits128 carriers to the existing PostgreSQL compiler. The isolated native
  Python extension reports Weft 0.4.43. No SQL compiler is emitted into Python.

The [usage guide](../guides/unified-python-access.md) and
[contract](../../02-design/contracts/CONTRACT-079-unified-python-access.md) show
actual application calls and the implemented transport boundary.

## Verification

Bun 1.4.3; generated runtime Python 3.11.17 under `-S`; native host Python 3.14;
PostgreSQL 18.6; isolated Weft 0.4.43.

| Check | Result |
| --- | --- |
| `bun run typecheck` | Passed both library and tools TypeScript projects |
| `bun run build` | Passed browser ESM and declaration build |
| `bun run check:access-boundaries` and `bun run check:unified-client-boundaries` | Passed compiler, host Python and generated-client boundaries |
| `bun test tests/access-unified-generation.test.ts tests/access-unified.test.ts` | Generated import isolation, exact values, typed operations, drift/refusal/rollback passed; native branch requires explicit environment |
| `bun test tests/access-unified-browser.test.ts` | Real Chromium produced identical complete file bytes/hashes to Bun; no host globals or external requests |
| mypy 2.4 strict, pyright 1.1.414, ty 0.0.88 | Generated package plus valid UUID/bits128/Decimal example passed all three; wrong UUID/Decimal types and cross-record predicate rejected by all three; no suppressions |

Additional existing regressions: core UUID, current semantic references,
existing generator and atomic writer cases passed. The existing boundary suite
passes 17 tests / 99 assertions after keeping its fixture command independent
of the newly added check. One existing CLI regression exceeded its explicit
60-second timeout twice; invoking its final invalid-profile refusal case directly
returned the expected GENERATION_REFUSED result. The same test then passed
outside the sandbox (50.6 seconds, 15 assertions). All selected checks have
passing results; the complete repository test suite was not run.

Three focused host tests also pass for dotted action identities, sole declared
keys and current field-referenced scalar action parameters. Positive and negative
type-check examples are retained in `tests/unified/typecheck_positive.py` and
`typecheck_negative.py` for regeneration checks.

The Luna build, research and verification work used the installed compiler and
cached host tools, without adding dependencies to generated Python.
[Native execution receipt](unified-access-native.json) records commands,
versions and scenario outcomes. The **same application function** executes on
an independent node/edge ontology fixture and on PostgreSQL through Weft SQL.
Additional shared assertions cover inverse traversal, get-many ordering and
missing slots, resumed ordering, injection as a bound value, typed errors and
lost action responses. UUID and exactly 16-byte bits128 values round-trip.
The test PostgreSQL cluster was stopped after verification.

## Scope and remaining feature requirements

This is the unified Python read/traversal/single-Action implementation. It does
not claim full completion of FEAT-033's broader Praxis specification. Remaining
work includes a published JSON Schema for the complete description/wire,
TypeScript emission, sync/remote transport conformance, action batches and
validation, typed business outputs/create/patch shapes, compatibility diffing,
explicit naming overrides and a reusable consumer conformance distribution.
Structured/map scalar forms and unsupported facets refuse generation; backend
unsupported meanings refuse compilation. Semantic references remain intact
metadata, not automatically enforced vocabulary validators.

The ontology host and PostgreSQL action/executor callbacks are test fixtures.
There is no production Hohfeld adoption or durable authorization/idempotency
qualification claim. Freshness and action execution require authoritative host
support; the client never invents those guarantees or retries uncertain writes.
