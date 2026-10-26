# R2 final prefix IDs — one bounded implementation decision

Proceed with a fixed internal **compiler scheduler entry that assigns final IDs before transitions and prefix hashing**. Do not skip serialize's current rehash without first moving the exact rewrite. Keep the ordinary scheduleTypedInventoryEffects API and its caller-supplied IDs unchanged. No cross-boundary row cache, caller certificate, callback or generic final-ID mode is needed.

Actual run40260242553 reaches the unchanged 1M limit at inventory.ts serialize's SECOND full-prefix hash, `/prefixes/2/catalog/grants/7/identity`. The new scheduler serialization controls pass; this does not establish final cap fit. Fixed full fixture/history, all semantic recompiles/proofs, caps and deadlines stay unchanged.

## Source proof

inventory.ts146–173 currently builds final IDs from `[prepare,approval,...schedule.steps in genuine ordered business order,publication]`, rewrites completedSteps and each tableState creationStep/removalStep, then hashes the entire prefix again. The first scheduler hashes are therefore hashes of intermediate IDs and cannot simply substitute for final hashes. compileInventoryPlanCore owns both schedule and serialization synchronously. Its publication-obligation checker uses the published catalog/metadata, not raw effect IDs. The scheduler already computes the full typed DAG/topological groups before any prefix is emitted; applyTransition writes table-state creation/removal references from effect.id. This is the narrow place to make the IDs final once.

## Exact implementation batch

1. Refactor only enough shared scheduler body to offer a fixed, non-barrel internal compiler entry alongside the unchanged ordinary entry. The compiler entry takes existing source-derived effects/dependencies/catalog/initial/provenance inputs, not a caller-supplied final ID map, skip-hash flag or callback. Shared code still validates original effects/duplicates, constructs the genuine subject dependency DAG and topological ordered groups exactly once.

2. After that order is established and BEFORE transitions/first prefix hash, generate the exact existing sequence: prepare step-00001, approval step-00002, ordered business steps step-00003 onward, publication step-(businessCount+3), using the existing minimum-five-digit algorithm. Charge enumeration, old/new binding carrier retention, copies and lookups before growth. Require the original three metadata IDs to be distinct and disjoint from business IDs; compiler constants already provide this. Do not infer identity from sourceOrder, SQL, operation kind or input-array ordinal.

   Produce internal copies of ordered effect nodes with ONLY id changed; retain grouping, sourceOrder, atomicGroup, typed subjects/mutations/data binding and within-group order. Dependency resolution already used original IDs/subjects, so do not rebuild/reorder it using new IDs or rewrite arbitrary strings inside meanings. Use the final metadata IDs for phase steps. Consequently every scheduled phase, completedSteps and newly created/removed tableState reference is final by construction. Preserve the same private clone/write closure and row canonical map.

   Initial table-state non-null creation/removal references, if supported by the current compiler path, must receive the SAME old→final correspondence/refusal as the old serializer, once on the scheduler-owned initial clone before its first digest. Actual compiler initialInventoryPrefix currently supplies null local step refs. Never reinterpret an already-final emitted reference through the old-ID map again; an old identifier may itself resemble a new step ID.

3. Return a fixed internal result whose business effects, phases, prefixes and metadata IDs ALL use final IDs consistently. Do not use the ordinary ScheduledInventoryEffects contract to mix raw phase IDs and final completedSteps. The new result is inert compiler data, not proof supplied by a caller. The compiler source calls this fixed entry directly; it does not inspect an arbitrary DTO's `alreadyFinal`/`trusted` field. It is simplest to use this compiler entry for both accounted and ordinary compiler paths, while preserving the separately exported ordinary graph entry unchanged; byte-equivalence controls below are mandatory.

4. Add a final-schedule serializer that indexes the actual returned ordered effects by their final IDs, recognizes the returned final prepare/approval/publication IDs, and emits the same serializedStep fields with those IDs and their actual before/after prefix digests. Phases already have final steps; prefixes already contain final references and exact hashes. Remove the remap/re-hash pass ONLY in this fixed compiler call path. Preserve exact phase/prefix cardinality checks, all-and-only step/effect resolution, source publication catalog obligations, complete plan hash/canonicalization/capture and historical full recompilation. Keep a raw-schedule serializer only if an actual remaining caller needs it; never export an unchecked verified/finalized helper.

This eliminates the whole redundant semantic prefix traversal, not the required first final-prefix hash or final whole-plan hash. It also avoids retaining canonical catalog bytes outside their scheduler lifetime. Preserve the concurrent G04 LegacyTableMigrationOptions type-only rename/import changes in inventory.ts; this batch does not widen G04/G10 composition.

## Required affected controls

Use a test-local independent old schedule→exact old remap→ordinary full canonical rehash reference on small complete source-derived cases. Compare the NEW compiler result's complete steps/phases/prefixes and full plan digest/bytes against that reference, including zero business steps, multiple groups, typed order differing from source input order, metadata steps, CREATE/revive/remove references, cross-table provenance/order and unchanged initial refs/refusal. Do not compare only hashes or weaken existing normative per-table digest assertions. Assert each emitted final prefix digest independently with ordinary hashCanonical; every step's pre/post pair and every final reference resolves to the actual correct step.

Keep ordinary graph tests expecting their original caller IDs and alias isolation. Add an accounted comparison proving no second full prefix rehash occurs after scheduler return, without removing actual full-prefix byte charging or mirroring source text. Keep the original full Note+seeded-history+mixed G02/CREATE positive and all tamper controls. The next hosted gate must prove actual fit and unchanged bytes; source reasoning does not promise the failure will disappear.

## Exact read inputs

- `src/table-migration/inventory.ts` — `8c6d52141a3da380f763d2e81299537fc6246d8b6a06c8027e78afee992a035c`
- `src/table-migration/inventory-graph.ts` — `87348d36e1e1040ec2bdb1310fb709a308ca829b96ef38286520ab83d6c874ac`
- `src/table-migration/inventory-effects.ts` — `f9ba0e9690aa30b51c3c809f180b75bdc9a606fa5d863c5a209f7bc958cfc177`
- `tests/lifecycle/table-inventory-api.test.ts` — `856e20faa10298592998c8c9c87bb598835554a9693f81656c84047818ec70a4`

Exactly these four relevant files inspected; no runtime, imports, AST/type/schema evaluation, tests, SQL, Git or product edits. Prior scheduler row plan18fd1665 and source acceptance950ac126 remain bounded to their original scope.
