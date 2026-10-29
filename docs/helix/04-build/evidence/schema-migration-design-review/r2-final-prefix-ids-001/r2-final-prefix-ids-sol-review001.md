# R2 final IDs — affected source review 001

Correction required for ONE definite test wiring error. Bounded plan-match review against `/private/tmp/r2-final-prefix-ids-sol-decision001.md` SHAe807e3f847c602ab2818b577b62fd6db2463fcee988cff607d496e195bfb7e72; no broad audit/runtime.

**FI-F1:** tests/lifecycle/table-inventory-api.test.ts332 passes `projected.projection.catalog.catalog` as nextCatalog. The actual catalog is already `projected.projection.catalog`, as the production compile call and existing `.catalog.tables` test access demonstrate. Extra `.catalog` is not the nine-collection catalog and prevents the new full-plan parity control from reaching the intended scheduler/serializer comparison (strict type failure or undefined at runtime). Remove that extra member access; keep the independent old remap/full canonical hash reference and all assertions.

No remaining concrete production blocker was found in the reviewed delta. The fixed compiler entry uses a module-private symbol only in its internal core, validates original effects and computes genuine topological groups first, creates the existing metadata/business/publication ID order, and copies effect IDs without rewriting arbitrary subject/meaning strings. Original graph entry retains raw caller IDs. Compiler phases, completed steps and creation/removal references are all final before each first hash; initial references are rewritten once on the owned clone and missing bindings refuse. Typed DAG/group order, clone/row-text ownership, all definition/target checks and final source publication checks remain.

The serializer is private and called directly with the fixed compiler construction, not a caller flag/certificate. It checks emitted all-and-only coverage and consumes actual before/after digests, without a second prefix traversal/remap/hash. Full plan hashing, canonical publication, history semantic recompilation, caps/fixture/deadlines remain. Type-only LegacyTableMigrationOptions changes are preserved. New carrier growth/retention has prior accounted visits; no row cache escapes the scheduler. Resource fit remains unproven.

Controls otherwise meaningfully preserve raw-ID graph behavior, compare finalized output to the independent old remap+full-hash path, test reversed input/genuine topo order, zero business effects, remove/revive and original/unbound table-state references. The new full-plan parity test retains complete steps/phases/prefixes and final canonical plan bytes, but must receive the real catalog before it can serve as evidence. All controls remain UNRUN here.

Exact three frozen inputs:
- `src/table-migration/inventory-graph.ts` — `e7b710dd0cdaa3428f19328e02216234b8faa157eaa17058c7d1ac6ac1179fc9`
- `src/table-migration/inventory.ts` — `842e3aa7a4faff73b65fc9c6d22adab0a755f03de67bc83e306df4fd6e6828bb`
- `tests/lifecycle/table-inventory-api.test.ts` — `5e8bae3ee828b0260ab105942dd3e6f6a21bf734d53e7414b29c02be7dc1fa2a`

No source edits, imports, runtime, tests, AST/type/schema execution, SQL or Git mutations. Reuse these conclusions after the one-line affected test correction; no new review chain is requested.
