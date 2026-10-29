# R2 scheduler prefix serialization decision 001

Source-only implementation decision. Proceed with scheduler-local **catalog-row canonical text reuse**, carried through the scheduler's own clones. Do not introduce verifier auxiliary snapshots, a public canonical-fragment handle, a cross-invocation cache, or SHA-state checkpoints. Actual resource fit remains unknown.

The measured run40257894553 exhausts the unchanged 1,000,000 work cap in snapshot's full-prefix hashing at `/prefix/catalog/tables/0/meaning/declaration/record`; owned=200798/history=799202, bytes=3476625, subjects=4. This is evidence for avoiding repeated deep catalog-row serialization, not evidence that hashing full prefix bytes may be omitted. Preserve the complete fixture, historical semantic recompilation, all proofs, caps and deadlines.

## Smallest coherent implementation

1. In `scheduleTypedInventoryEffects`, create a lexical row-object → canonical-text map only on the accounted route. A miss runs the existing `canonicalChargedMeasured` over the **entire actual row**, including unknown content, and retains its measured result only after successful serialization and all map/result charges. A hit charges its actual lookup. No input can provide text, register a row, select a cache, or claim immutability. The map and its closures never escape this synchronous scheduler invocation.

2. Replace the scheduler's own clone sites with small private clone-and-carry helpers. Each helper itself executes the existing `structuredClone`, then walks the nine corresponding catalog row arrays by actual index, charging shape/count checks, source lookups and each destination metadata retention before insertion. Carry only already-produced canonical text from source row to the exact cloned row. Never accept an arbitrary caller-supplied source/copy pair or infer equality from a digest. Initial rows acquire fragments only after the scheduler has cloned `initial`; never attach entries to caller rows. For business `structuredClone(before)` and snapshot catalog clones, preserve every existing clone/accounting operation and returned-frame alias isolation.

3. Serialize each complete prefix into incremental SHA-256 in exact JCS order, without joining a full-prefix string or retaining an array of all chunks. Fixed top-level order is `catalog,completedSteps,index,metadata,profile,seedStates,tableStates`; catalog order is `checks,columns,comments,foreignKeys,grants,indexes,keys,policies,tables`. Walk **current** catalog arrays and emit each current row's actual canonical text, with punctuation. Keep ordinary canonical serialization of completedSteps/index/metadata/profile/seedStates/tableStates; caching these smaller, partly mutable structures is unnecessary for this batch. Exclude only the existing `digest` field. Validate the fixed domain's exact collection/field shape before using the fixed serializer; unexpected shape refuses or takes the existing complete canonical path, never drops fields.

4. Add only an internal streaming text-hash leaf in `hash.ts`, using the existing `Sha256`. Each actual chunk is validated/scanned and charged before UTF-8 encoding/allocation; every full-prefix byte is fed to SHA in order. Do not expose the existing `precharged` switch as caller authority. This primitive hashes text; it does not certify canonical JSON or issue a trusted context. Keep all existing public/unaccounted hash/canonical signatures and the ordinary scheduler route unchanged. No public barrel export.

## Why row reuse is sound here

Catalog mutations in the inspected closure add, splice or replace whole row objects. `applyCatalogMutationList` handles both effect and provenance mutations; `applyTransition` covers schema grants, CREATE plus embedded rows, dependencies, defaults/requiredness/RLS, validation and validity replacement. Newly added/replaced rows have no entry and serialize fully. Removed entries are never emitted. `orderCatalogFrame` changes array order only: always emit fragment references in the **new actual order**, never reuse an old array serialization. Backfill does not change catalog rows. Table-definition refresh mutates `tableStates[].definitionDigest` in place, so tableStates deliberately remains fully serialized every snapshot. The dirty-table optimization is not authority for row-fragment reuse and remains unchanged.

The clone helper must preserve the paired-row proof by construction. Any catalog in-place write introduced during implementation must invalidate that row before the write; if an existing in-place write is discovered, either add that exact invalidation or leave the affected row uncached. No shallow equality shortcut. Caller mutations cannot interleave: scheduling is synchronous, has no caller callbacks/yields, and returns outputs only after hashing. Do not freeze formerly mutable public outputs to establish this proof.

## Accounting and boundedness

Charge first serialization, retained text/result/map slots, clone correspondence scans/slots, row lookups, array traversal/punctuation, scalar serialization and every actual subsequent UTF-8/hash input. Reusing the same retained string reference in another clone map entry does not allocate another string, but its metadata slot is charged. Never collect an uncharged `map`/chunks array or bulk uncharged carrier. Failure publishes no partial fragment entry. Existing root byte/work/subject limits bound all added retention; do not introduce a different admission cap. Omit only the deep canonical traversal/token production that no longer occurs. Initial all-table definition binding, later dirty refresh and final exact target comparisons all remain intact.

## Required controls in the existing focused graph tests

Compare every emitted digest independently with ordinary `hashCanonical` over the complete returned frame minus digest, for zero/multiple groups and prepare/approval/publication IDs. Include large unchanged table/Record content with Unicode, escaping, extension keys and reordered object keys. Exercise add/remove/replace, CREATE embedded rows, cross-table provenance, schema-global grants, local row reorder, table-state definition changes and seed confirmation. Preserve prior frame/input alias isolation and the complete normative per-table definition assertions.

Use a counting accounted context to prove an unchanged catalog row is serialized once per genuine clone lineage, changed rows serialize anew, and every later full-prefix byte is still hashed/charged. Near-limit failures must occur before string/map/encoding growth, propagate unchanged, and leave no reusable entry; retry in a fresh invocation cannot borrow prior entries. These are behavioral output/accounting controls, not source-text mirrors. Run the unchanged full mixed-history positive under the existing hosted gate before claiming fit; prior green compiler/regression/browser/reproduction evidence does not prove this changed serializer.

## Input pins

- `src/compilation/bundle/hash.ts`: `201f6f3dd5cf5b9271ff319879c905d8f5373a37abcb3a2dac5de195b7d95afa`
- `src/table-migration/inventory-graph.ts`: `61478738f17e3c593087ee574902a2066c7d4927e1968c29de8a9eaeed12e4af`
- `tests/lifecycle/table-inventory-r2-context.test.ts`: `2010e18e3052f329e4a13c80eb923ba740af59a2a7acbac871c339bd7e777cb2`
- `tests/lifecycle/table-inventory-api.test.ts`: `bb64a4f60fd5ee971b38cb0c386f55f76d43316f3226dd326109d33a5476fda9`

Only these four files were inspected for this decision. No source was edited, imported, generated, typechecked or executed. No runtime/adoption authority is added.
