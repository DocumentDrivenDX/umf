---
ddx:
  id: umf.evidence.rust-migration.r8-nonroot-core-consumer-audit
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-default-inspector-relationship-callsite-audit
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-core-relationships-default-boundary
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-core-inspectors-installed
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
    - id: CONTRACT-041
      kind: informed_by
    - id: STP-056
      kind: informed_by
---

# R8 non-root Core Inspector and Relationship consumer audit

## Scope and source cut

This is a read-only source and fixture audit of three TypeScript consumers:
`src/model/record-type-inspection.ts`,
`src/model/record-type-journal.ts`, and
`src/compilation/admission/index.ts`. It does not qualify an installed
package, freeze a cross-host predecessor packet, change a route, or retire a
ledger row. The relationship checkpoint and other source edits were still
present in the shared worktree during this audit; the hashes below identify the
exact bytes inspected and must be refreshed if any listed file changes.

| Source | SHA-256 |
| --- | --- |
| `src/model/record-type-inspection.ts` | `f4e77062e3ebb1fd2e79191f9f68cf1a7b844754f9631e8059332df367b63b3f` |
| `src/model/record-type-journal.ts` | `d150d80371f07cbdb8e9feb9021adb6c3d344da1facf32198f6823fc5e0a0499` |
| `src/compilation/admission/index.ts` | `8fecabb0554c48548b1680f5e82e5d713e7883ba7427b64248249a351c3148ee` |
| `src/model/reference-links.ts` | `e7e3c104741d3202941973fdec14d6a25af8406dd909dbac7b60cea8e7c27853` |
| `src/model/relationships.ts` | `66b15764cb80059de8e98adb9741b9314a1966674f22ef4f114306e679d5e547` |
| `src/compilation/index.ts` | `e8b2603dfe1c5e45446fe7774dc61f0e09685ead9d8ffd680e6745ff8ef8be63` |
| `src/index.ts` | `acfc8529b437fc6daa279a6586acb25644bae4c3c0b0fe15541d07eba20658da` |
| `src/index-node-v4.ts` | `f244b124607beca2357f1aa925cae19f76a4a1fada98dd4f23ec6ade413642f9` |
| `src/index-browser-v4.ts` | `76470eaeb1bc4ac04d9930c83c117ac4dbba0d9d641adf19076495aa186c5c5c` |
| `src/access/rust-core-inspectors-default.ts` | `f4d5e2a1ca8000c5b2b2012e410aa212a44ab4aacba87b10e228bb307d4eb546` |
| `src/access/rust-relationships-default.ts` | `65664e0b981eaf24a00a1e6a1e1d1381ecbf65a25fb819427e38ece71735d0d0` |
| `src/access/rust-record-type-default.ts` | `1f2a83d305658bbc9e16817fff76b9d9938171d94840d1f729b307173f4a83c0` |
| `tools/security/record-type-owner-cases.ts` | `87955fb21b9995c45832a807423d3dbe81ca1a8fca9a210ca9ab02668845fdf6` |
| `tools/security/record-type-journal-cases.ts` | `4dcf3d0df23c8f2cd28707d23df090a743fef9b2dc159acc72a70b8b2f79c7ad` |
| `tests/compilation/access-reached-elements.e2e.ts` | `b6f10d3822133bacd34119145b51c180c3f352e217d70c760d926bd787afb40c` |

## Reachability and behavior

The three modules are not named exports from `src/index.ts`, and `package.json`
has no subpath for them or for `src/compilation/index.ts`. The V4 Node and
browser entries inherit `src/index.ts` exports, so these modules are not
reachable through the current default public package API. The record-type
inspection and journal functions have no production imports found beyond
their security case runners; they are deep internal operations used by those
fixtures. `src/compilation/admission/index.ts` is called by
`src/compilation/index.ts`, which supplies package-generation functions to
tests/internal tooling but is not re-exported by the public root.

| Consumer | Direct TypeScript dependencies and work | Existing current behavior cases | Host/evidence limit |
| --- | --- | --- | --- |
| Record Type receipt inspection | `inspectCoreReferenceLinks`, `verifyCoreRecordTypeDeclaration`, copied JSON, and result-schema validation. It requires current core 0.10.0, an explicit v6 receipt, exact owner identity and exact authored Record link; its receipt says consistency verified, issuer authority unverified, enforcement none. | `runRecordTypeOwnerCases()` produces 62 passing assertions. They cover stale/current context, exact link identity/order, receipt substitution/version, old source versions, hostile accessors, copy isolation, and no authority promotion. | Bun fixture/test coverage. There is no frozen Node/Bun/Chromium installed-package packet for this composed inspector. Rust already exposes reference-link inspection and record-type verification separately; this does not prove the composed TypeScript operation is ported. |
| Record Type journal | `validateDocument`, `verifyCoreKindDeclaration` or `verifyCoreRecordTypeDeclaration` for each event, full JSON continuity comparisons, final-source `inspectCoreReferenceLinks`, copied JSON, and result-schema validation. It admits 1–32 explicit events, requires each complete source to equal the preceding target, then requires the final target to equal the supplied current document. | `runRecordTypeJournalCases()` produces 47 passing assertions. It covers multiple typed Fields, event order/indexes, complete base/final source, idempotent and 32-event positive cases, 33-event refusal, crossed contexts, omitted/reordered/duplicated transitions, final link invalidation, opaque data, getters, copy isolation, and schema limits. | Bun fixture/test coverage only. Existing Rust kind/type verifiers and reference-link inspector are composable primitives; there is no Rust journal operation or installed host replay of the complete journal behavior in the cited checkpoint. |
| Access admission | `admitAccessRequest()` calls `inspectCoreRelationships(document, {module: authoredModule.id})` directly at line 62, then records the returned relationship meaning as an informational disposition. The same function also calls TypeScript Key, Facet, Schema Property, Element Kind, action, validation, Registry and access-view operations. | `tests/compilation/access-reached-elements.e2e.ts` exercises reached-element closure with 2,000 dependency Records and 4,006 selected elements, enforcing source/value/disposition limits and exact selected roots. `tests/compilation/access-diff.test.ts` exercises compatibility classification through the compile/diff API. | Bun source tests; no installed default/reference package receipt for this internal compilation path. The direct import bypasses the Rust-selected root `inspectCoreRelationships` binding, but the consumer itself is not a current package-root export. Relationship admission here is informational; multiplicity/lifecycle enforcement remains engine-owned. |

The journal fixture runner and receipt fixture runner are deterministic assertion
code, not frozen serialized cross-host packets. Their test wrappers require at
least 30 and 45 cases respectively, while this source cut produced 47 and 62.
The relationship boundary packet in the adjacent evidence covers the public
Core Relationship operations, not these non-root compositions. Host parity,
runtime error/trace equality, generated bundle retention, and consumer
retirement remain unproven for the three consumers audited here.

## Bounded dependency-injection sequence

Use per-instance factories with explicit operation closures. Do not add
mutable module-level route selection; concurrent imports of `.` and
`./reference` must remain isolated.

1. Extract a pure `createRecordTypeInspection(operations)` factory. Inject
   `inspectCoreReferenceLinks` and `verifyCoreRecordTypeDeclaration`; keep the
   existing exported function as a TypeScript wrapper. The existing
   `bindCoreInspectorsRust` and `bindCoreRecordTypeRust` already expose those
   primitives for Node/WASM composition. Schema validation, copy behavior, and
   exact error ordering remain TypeScript until independently ported or
   explicitly retained as host glue.
2. Extract a pure `createRecordTypeJournal(operations)` factory. Inject the
   reference-link inspector, kind verifier, and record-type verifier. Preserve
   whole-document continuity, event order, opaque content, capacity and
   schema checks. A claim of Rust ownership for the journal requires a native
   journal operation or reviewed Rust composition for the remaining
   continuity/result semantics; injecting three primitive operations alone
   leaves a mixed implementation.
3. Extract a pure access-admission factory with an injected
   `inspectCoreRelationships` callback. Its reference wrapper supplies the
   current TypeScript inspector; a Rust-backed internal host can supply the
   operation from `bindCoreRelationshipsRust`. Keep all other admission
   callbacks visible in the dependency boundary rather than implying that one
   injected relationship read ports the wider admission algorithm.
4. Freeze each factory's predecessor cases before changing calls. Record exact
   JSON results, `UmfError` codes/paths, callback order, and accessor/refusal
   traces. Replay the TS reference route and actual installed Node/Bun/WASM and
   Chromium surfaces where each consumer is intentionally supported. Include
   the existing 4,006-element admission case and an error-path case.
5. Only then decide whether these remain internal helpers or gain a supported
   host route. Verify import graphs and package export conditions. Do not count
   factory wiring as an accepted Rust consumer operation or retire its
   declarations while the TypeScript semantic body remains reachable.

## Blockers and open evidence

No package-root API currently invokes these consumers. The first decision is
whether they are supported internal composition points or should remain
TypeScript-only reference/test utilities; adding them to V4 roots would create
public API policy outside this audit. The journal's end-to-end continuity and
validation behavior have no single Rust equivalent yet. The access admission
function owns many other TypeScript consumers, so relationship callback
injection alone cannot establish an all-Rust admission path. Finally, no
cross-host frozen packet for these three consumers exists. These are gates to
future implementation/retirement, not evidence of a semantic mismatch in the
current operations.
