# PostgreSQL relationship binding acceptance

This completes `umf-b89363fd` under [CONTRACT-041](../../02-design/contracts/CONTRACT-041-relationship.md)
and [TD-045](../../02-design/technical-designs/TD-045-relationship.md). The qualified
profile uses PostgreSQL 17.4 and `@libpg-query/parser` 17.6.10. It supplies useful
FK/junction projection and native classification, not the full DDD generator,
relationship ideal admission, all-five delivery or native equivalence.

`projectRelationshipsToPostgresql` consumes verified sequential relationship
declarations, the stable-ID physical binding and exact ordered layout policy.
It emits new ordinary tables with inventoried scalar columns, named Keys and
homogeneous FK/junction carriers. The association variant retains its own
identity and quantity attribute. Strict blocks; report carries explicit losses
for participation, lifecycle, NULL exemptions, domain/comparator differences,
facets, DDD context, embedded fields, indexes and other unclaimed content.
Edge/discriminator, partitioned-Key, heterogeneous and unsafe/incomplete layouts
remain explicit refusals. PostgreSQL system columns/namespaces and native
column/Key count limits are guarded before returning a candidate.

`classifyPostgresqlRelationships` retains exact original raw SQL or catalog
text, including unknown numeric tokens and unrelated native content. Captured
FK validation/deferral, actions, MATCH mode, ordered component names and native
primary/alternate constraint candidates remain observations; no authored
relationship is inferred. Unqualified table identity remains unresolved.
Every native constraint node is retained separately. Existing classification
slots refuse overwrite. Recomputed receipts and current target checks protect
both original-native and authored-ideal recovery.

Verification on 2026-10-01:

- `bun test tests/core-ideals/relationship-postgresql.test.ts`: seven tests,
  127 assertions. The combined relationship/layout/stable-binding regression
  passes 23 tests and 489 assertions, zero failures.
- `bun scripts/core-ideals/relationship-postgresql-oracle.ts`: PostgreSQL
  17.4, pinned image digest from `native/postgresql/catalog/image.json`,
  disposable container with no network or persistent volumes. Four generated
  variants pass actual table/constraint creation and 32 controlled write probes.
  Native counterexamples add nine probes: NOT VALID retains an old orphan but
  checks a new one, partial-NULL composite MATCH SIMPLE permits exemption,
  non-null orphan tuples refuse, alternate UNIQUE references resolve, and
  CASCADE/SET NULL effects match captured action/deferral observations.
- Captured native observations total 15 across the four emitted targets and
  counterexample schema. Five catalog captures retain unknown native content
  with the exact `9007199254740993` token and recover through JSON/YAML.
- `UMF_CHROMIUM_PATH=/home/erik/.local/bin/chromium bun scripts/core-ideals/relationship-postgresql-browser.ts`:
  Chromium 148.0.7778.0 matches all ten projection cases (four candidates, six
  blocks), ten strict projection blocks and five catalog classifications.
  Eight ideal recoveries and 22 native recoveries pass; no external requests or
  Bun/Node globals occur. The pinned PostgreSQL parser runs as local WASM.
- Typechecking, browser ESM/declarations and PostgreSQL WASM builds pass.
  All 58 packages and 335 schemas in this implementation worktree pass audits;
  aggregate inventories are refreshed on landing.

The [native record](../../../../fixtures/validation/relationship-postgresql-native.json)
contains source fingerprints, generated mappings, observed constraints and each
probe's SQL/result. The [browser record](../../../../fixtures/validation/relationship-postgresql-browser.json)
records portable parity and recovery. Generated SQL and original captures are
under `fixtures/postgresql/relationships/`. These observations do not certify
arbitrary existing application rows, deployment state, input-conversion fidelity,
parent/descendant behavior or semantic equivalence outside this profile.
