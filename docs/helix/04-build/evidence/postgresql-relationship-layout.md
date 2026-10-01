---
ddx:
  id: EVIDENCE-POSTGRESQL-RELATIONSHIP-LAYOUT
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
    - id: CONTRACT-042
      kind: informed_by
---

# PostgreSQL relationship endpoint policy validation

The portable `validatePostgresqlRelationshipLayout` API validates exact
stable relationship/Key identities, ordered endpoint maps, Field ownership,
SQL type/nullability/collation and carrier/constraint namespaces. Association
Records retain their own Keys and every member Field. The result retains all
three supplied sources; successful candidates are policies, never DDL.

The corpus derives from the existing
`fixtures/projections/ddd-authored-relationships/{base,postgresql-layout-proposal}.json`.
It explicitly upgrades the authored relationship envelope and migrates the
binding, then adds the mandatory core-to-DDD `fieldLayouts` inventory and
collation qualifiers. Fixture construction knows the graph's authored naming
map; portable validation does not infer that map. The hand-authored expected
PostgreSQL DDL remains separate target evidence, not generator output.

Verification on 2026-10-01:

- `bun test tests/projections/postgresql-relationship-layout.test.ts tests/binding/stable-ids.test.ts`:
  16 tests, 362 assertions, zero failures. Nine layout tests cover 29 policy
  cases plus reordered composites, namespace collisions, exact unknown-value
  residuals, accessor refusal, complete schema representation, shared-edge
  endpoint restrictions and terminal LF/CR/U+2028/U+2029 refusal.
- Six report-mode positives: keyed association plus direct FK, stable rename,
  alternate UNIQUE target, nullable composite, anonymous junction and edge.
  Twenty-three matrix negatives refuse atomically. All 29 strict cases block
  with retained inputs because native/domain enforcement remains unverified.
- `bun run typecheck` and `bun run build`: pass.
- `bun run test:schemas`: all 56 packages and 328 schemas present in this
  implementation worktree pass. Aggregate inventories are refreshed on landing.
- `UMF_CHROMIUM_PATH=/home/erik/.local/bin/chromium bun scripts/relationship-postgresql-layout-browser.ts`:
  Chromium 148.0.7778.0 matches Bun for all 29 cases in both loss modes,
  including 174 comparisons of retained logical/binding/policy sources.
  No external requests or Bun/Node globals occur.

The [browser record](../../../../fixtures/projections/postgresql-relationship-layout/browser.json)
and [authored matrix](../../../../fixtures/projections/postgresql-relationship-layout/cases.json)
record this PostgreSQL 17.4 policy subset. No native engine runs because this
stage emits no SQL. Native FK/table generation, native constraint behavior,
relationship ideal admission and the complete DDD generator remain separate.
