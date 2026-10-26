---
ddx:
  id: umf.evidence.rust-migration.r8-post-schema-properties-next-route-decision
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-next-route-queue
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-post-facets-family-audit
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-schema-properties-interface-decision
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-selection
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-selection-binding
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-core-record-type
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
    - id: CONTRACT-049
      kind: informed_by
    - id: CONTRACT-058
      kind: informed_by
---

# R8 next route after Schema Properties

This packet selects the next bounded default-route candidate after the four
Schema Properties operations. It is a queue/evidence decision only: it does
not select a route, change ledger dispositions, claim retirement, or qualify
an installed release. The review used the current R8 ledger, V4 roots,
contracts, R5 predecessor packets and existing opt-in Rust binding evidence.

## Recommendation: Core Element Selection

Select one public operation, `selectCoreElements`, for the next Rust-owned
default-route slice after Schema Properties. It has an existing Rust semantic
owner, Node and WASM tagged-binding support, a complete frozen TypeScript
predecessor and an established five-resource Core Model engine. It is the
smallest coherent candidate and reuses the exact shared resource family being
used by Schema Properties. This is a practical follow-on only after the
Schema Properties host-reflection interface and shared root edits settle; do
not implement both families concurrently in the same binding/root files.

The public source is `src/model/selection.ts:11`, with the Rust owner at
`crates/umf-core/src/selection.rs:310` and wire operation
`model/selectCoreElements` in `crates/umf-core-wire/src/lib.rs:2350`. Existing
opt-in wrappers are `bindings/core/node/src/core-model.js:17` and
`bindings/core/wasm/src/core-model.js:16`. The route is not selected in
`src/index-node-v4.ts` or `src/index-browser-v4.ts`; each currently selects
other operations over the common Engine. The ordinary package root resolves
to those Node/browser V4 roots, while `./reference` resolves to the TypeScript
`dist/umf.js` entry. `src/index.ts:16` exports the TypeScript selection. The
two package conditions must remain separate in any later replay.

The current ledger records one logical candidate name with no accepted Rust
operation and `bindingRouteStatus: unproven` on both V4 routes. Its maximum
potential scope is **one logical name / two default-root route rows** (Node
and browser). The ledger has 922 logical executable default-route retirement
gaps, 864 executable names without accepted opt-in Rust mappings, and 58
accepted opt-in mappings. Even a later bounded route qualification would not
change the 922 retirement count; parity and explicit retirement review remain
separate gates.

The source-controlled semantics are unusually well bounded. CONTRACT-001
requires exact filters, category-wise AND and value-wise OR, explicit
`references: none|transitive`, stable source order, cycle termination, full
copied source/query/result context and preservation of unknown scalar and
reference annotations. Traversal follows only documented core references,
item types, members and key fields; extension payload links are not discovered.
The Rust owner implements that contract and the R5 binding retains UTF-16
identity transport, complete envelopes, work accounting and cancellation.
CONTRACT-040 keeps selection a metadata view, not proof of native validity or
complete native dependency recovery.

## Inputs and established evidence

The full success fixture is
[`fixtures/validation/core-selection.json`](../../../../../../fixtures/validation/core-selection.json)
(SHA-256 `f75ba587ed078e6f042b3ad584c4ad14b876f76c10e4df591b13b4fe746c10f3`).
The actual frozen TypeScript outcome packet is
[`frozen-typescript.json`](../../../../../../scripts/rust-migration/r5/selection/frozen-typescript.json)
(SHA-256 `2fb5429888f34d6bb2684553201f652a68424fc68125a457c6b5e01aeaa7817a`);
exact refusal outcomes are in
[`frozen-refusals.json`](../../../../../../scripts/rust-migration/r5/selection/frozen-refusals.json)
(SHA-256 `7abf69091dbf3f24f69ea468436f13fcb6b567317d95f0c70a938bbb1382e49b`).
The [R5 selection binding record](../r5-selection-binding/README.md) reports
eight success and five refusal comparisons on Node 26.12.1, Bun 1.4.3 and real
Chromium 153.0.8010.12, including caller registry callback outcomes and
zero-work, cancellation and deadline controls. It explicitly describes the
default TypeScript API as still active. These are opt-in tagged-route results,
not default-root or current installed-package evidence.

The exact trusted resource set in
[`src/access/core-model-resources.ts`](../../../../../../src/access/core-model-resources.ts)
is `coreSchema`, `referenceSchema`, `packageSchema`, `constraints` and
`domainPolicy`. It is the shared Core Model set; the selection route does not
introduce a sixth trusted root resource. The complete result schema is
[`spec/core/element-selection.schema.json`](../../../../../../spec/core/element-selection.schema.json),
generated by `scripts/core-selection-schema.ts`. Treat the schema as an output
oracle for admission tests; do not infer another operation's resource
authority from it. The live Registry is a separate per-call caller input.

The R8 source cut used for this decision had these SHA-256 pins:

| Input | SHA-256 |
| --- | --- |
| `docs/helix/04-build/rust-migration-plan.md` | `1e676bf55bd5fa38f97a64b7afbfbe97e3a7a068b85a49b889919f65d8deac67` |
| `docs/helix/04-build/evidence/rust-migration/r8-symbol-inventory/gap-ledger.json` | `b569e0867e97b7e779692e0a7f7112579f3a125800490de8ce03a072c9621111` |
| `src/model/selection.ts` | `db9ff795c112df42e5db2cd1194659bb09e19422ebbd0b7997671e4faf9ae195` |
| `src/registry/registry.ts` | `3fa010311edc23c5dc74826eb7a74a8a19a9a4c41da3031bc66e6f741d1164c1` |
| `src/access/core-model-resources.ts` | `096f69a855762dd8c7c54a3cd3b080e0dadad00050e0d84ecf2cf4eac2ee4e40` |
| `spec/core/element-selection.schema.json` | `74b35be467972d71c4a3b80d056c2c691ca7cdc59fe90cb62e4f85bf2812a555` |
| `src/index-node-v4.ts` | `5167ae602cbb75117b53962a6cb50b795dbd3cff535b6ab5ffd4f45743904e5c` |
| `src/index-browser-v4.ts` | `102c38ee31035c162eed4215b28ff3a769890d119913ea91ed625afb04349774` |
| `package.json` | `7c6685a6dc61669e6e8e6af120c137051b2988c0c8949290d500c8e00e4b59ba` |

These pins describe a moving source cut, not a final package closure. Recompute
them against the eventual fixed-point archive and live source before any
qualification.

## Host boundary and controls still to prove

The host boundary is the main unresolved work, not Rust selection semantics.
The TypeScript predecessor copies `source`, then `query`, validates the exact
query shape, and only then calls `validateDocument(source, registry)`. Rust
receives already tagged JSON on the existing opt-in route. Node/WASM wrapper
registry conversion and callbacks therefore cannot by themselves prove the
same reflection schedule for arbitrary live objects at the package root.

`Registry` in `src/registry/registry.ts` owns registrations and may supply
arbitrary `semantics` callbacks. `selectCoreElements` validates the entire
source with that caller Registry even when no elements match. Preserve the
callback's observed order, returned diagnostics, thrown error identity and
the registry's existing omission/unknown-extension behavior. Do not flatten
the Registry into a sixth trusted resource or silently drop semantic
callbacks. The outer V4 selection adapter will need to accept the TypeScript
Registry, stage its descriptors and callback bridge without touching it
before source/query admission reaches the predecessor checkpoint, or document
an evidence-backed incompatibility and stop the route. A direct eager
`registrations()` call risks changing observable Proxy/getter and callback
ordering.

The fixed predecessor packet does not establish every raw-host shape that the
new default route must test. Freeze/reference the exact Node, Bun and Chromium
outcomes for: source-before-query copying; malformed query before registry
reflection; source validation before registry callback; callback failure and
returned diagnostics; Proxy trap/accessor order and zero getter re-entry;
hidden, symbol, custom-prototype and cyclic members; invalid numbers and
lone-surrogate identity; no-match source validation; returned-copy isolation;
unknown extension and scalar preservation; repeated annotated edges and
cycles; work, cancellation and deadline preflight; and no partial result.
Compare complete result and refusal envelopes and validate successful output
against the current selection result schema. Public API remains synchronous;
host work/cancellation instrumentation is internal and must not add an SDK
parameter.

The operation uses the existing five resources and one per-call semantic
Context. The installed-root replay must verify their exact bytes and include
all result/host copies in one bounded operation. Existing R5 controls are
useful for designing cases but do not prove those controls on the current
default root. Keep `./reference` TypeScript as the baseline and report archive,
member and live source closure pins with Node, Bun and real Chromium outcomes.

## Candidate comparison and order

| Candidate | Logical names / default rows | Existing Rust and predecessor | Limiting seam | Queue decision |
| --- | ---: | --- | --- | --- |
| Core Element Selection | 1 / 2 | Rust core, Node/WASM opt-in; full success/refusal predecessor | Caller Registry semantic callbacks plus raw host admission order | Next after Schema Properties; narrowest coherent slice |
| Core Record Type | 2 / 4 | Rust owner and retained Node/WASM staging; 3 declaration/verify pairs and 9 refusals | `spec/core/record-type-operation-v6.schema.json` remains `authority-unresolved`; generic wire carries both receipt/current and misses raw staging order | Resolve resource authority first; parallelize authority review and predecessor host-case design only |
| Core Evolution | 2 / 4 | Rust owner and opt-in Node/WASM; frozen current-core 0.10 packet | CONTRACT-058 states 0.8.0 semantics while current implementation/evidence use core 0.10.0; duplicate CONTRACT-058 identity and incomplete control-order parity | Defer pending contract reconciliation and exact limit review |

After Schema Properties host-reflection design stabilizes, sequence Selection
as follows:

1. Freeze the live TypeScript `./reference` host-order and Registry-callback
   baseline in Node, Bun and real Chromium; preserve it independently of Rust
   builds. Review the callback/registry bridge for error identity and exact
   admission order.
2. Reuse the established Core Model five-resource loader and host-reflection
   dispatcher. Add one invocation-local synchronous selection operation with
   the Rust owner controlling each stage, one Context and bounded callback
   accounting. Keep arbitrary Registry callback behavior out of static
   resource construction.
3. Bind the single export in both V4 roots only after shared Schema Properties
   resource/binding/root changes settle. Leave `./reference` routed to
   `src/index.ts`.
4. Replay full frozen and crossed-host cases from one fixed-point archive in
   installed Node, Bun and real Chromium; verify archive/member hashes and
   current live source closure before writing family receipts.
5. Have Sol review host-order, callback and outcome parity before the route
   ledger's `bindingRouteStatus` is changed. Keep the separate 922 retirement
   gaps open until semantic parity, declaration retirement and release review.

The Record Type resource-authority review and Evolution contract reconciliation
can proceed independently of Selection's production implementation. Their
production changes would reuse the same Node/WASM model bindings and root
facades, so do not implement them in parallel with Schema Properties or
Selection until the shared host/resource interface is stable.

## Decision limits

This decision compares existing opt-in owners, root wiring, resource inputs,
frozen predecessors and declared host boundaries. It does not assert that
Schema Properties has completed, select any candidate in a V4 root, close any
of the 864 unmapped names, alter the 922 logical gaps, or qualify a package or
release. All final support claims require exact current-source/archive pins
and host-specific installed evidence.
