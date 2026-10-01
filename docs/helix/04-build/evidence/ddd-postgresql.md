---
ddx:
  id: EVIDENCE-DDD-POSTGRESQL
  type: evidence
  activity: build
  status: complete
  authoring:
    home: repo
  links:
    - id: CONTRACT-043
      kind: informed_by
    - id: TD-048
      kind: informed_by
    - id: US-048
      kind: informed_by
---

# Complete DDD PostgreSQL generator evidence

This record covers CONTRACT-043 / TD-048 / US-048 and bead `umf-a1a0db05`.
The browser-portable `ddd-postgresql-1` profile targets PostgreSQL17.4 and
core0.7 authored DDD with stable-ID binding0.2. It generates reviewable SQL;
it does not execute a production deployment or prove native/ideal equivalence.

The original shared keyed order/customer/product fixture produces exactly
`fixtures/projections/ddd-authored-relationships/expected-postgresql-relationships.sql`.
Four bound tables, embedded JSONB/object checks, four authored Keys, three FKs
and five supported indexes appear. The remaining GIN/GiST scalar/clustering
choices retain their binding-path residuals. DDD aggregate and opaque invariant,
Field/domain/null/comparator and embedded path losses remain explicit.

Additional cases exercise alternate UNIQUE, nullable composite references,
anonymous junctions, keyed association attributes, homogeneous edge/shared
edge tables, inline residuals, cyclic references, explicit text comparator
collation, eligible LIST/default partitioning and exact-Key refusal. Invalid
IDs, stale binding, reordered/missing maps, unsafe fragments, association loss
and default-partition/backing-Key/index/carrier collisions block atomically.
Heterogeneous endpoint sets and edge association Record layouts remain refused.

The full receipt preserves logical source, binding, policy, output archive and
original values at each residual path. Tests resolve every successful mapping
and residual against its own retained source, check every emitted statement is
mapped, and reject altered receipts/native archives. Version migration and
rollback compose with generation and both recovery paths. Unknown native DDL
and source comments remain exact in the native archive without relationship
inference.

Reproduce with Bun:

```sh
bun scripts/projections/ddd-postgresql-schema.ts
bun test tests/projections/ddd-postgresql.test.ts
bun run typecheck
bun scripts/projections/ddd-postgresql-oracle.ts
bun run build
bun run build:postgresql
UMF_CHROMIUM_PATH=/home/erik/.local/bin/chromium bun scripts/projections/ddd-postgresql-browser.ts
```

The native oracle starts the digest-pinned image in an isolated networkless
container, verifies server version170004, compares the generated and independent
hand-target catalogs, and probes actual insert/update behavior. Chromium uses
local compiled browser code and local WASM only; it compares complete Bun
receipts, strict/refusal outcomes and JSON/YAML directed recoveries without
Bun/process globals or external requests. Machine records live in
`fixtures/validation/ddd-postgresql-{native,browser}.json` and carry source
SHA-256 fingerprints. Generated positive SQL fixtures are under
`fixtures/projections/ddd-postgresql/`.

Final acceptance: 41 Bun tests / 2,160 assertions, TypeScript checks, 59 extension
packages and 340 schemas pass. Parent independently reran the final 41 tests and
typecheck, PostgreSQL17.4 oracle (12 candidates / 93 write probes) and Chromium
(39 cases: 12 projected, 26 blocked, one malformed-policy refusal; 48 directed
recoveries). The two-schema partition case verifies exact qualified provenance
when default partitions share a basename. Native/browser source fingerprints
match the final implementation. The machine acceptance record is
`fixtures/validation/ddd-postgresql-acceptance.json`.
