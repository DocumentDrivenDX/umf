---
ddx:
  id: umf.evidence.rust-migration.r8-next-route-queue
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
    - id: CONTRACT-049
      kind: informed_by
    - id: CONTRACT-056
      kind: informed_by
---

# R8 next installed-route candidates

This queue is a source and evidence review, not a change to routing or the
authority-bound ledger. It compares the current V4 roots with
`docs/helix/04-build/evidence/rust-migration/r8-symbol-inventory/gap-ledger.json`
and the existing opt-in Rust evidence. The ledger reports 922 logical
executable default-route gaps (922 per Node and browser root); its
`bindingRouteStatus` is `unproven` for the candidates below. Source selection
and opt-in evidence do not prove installed behavior or retire a logical row.

Core Relationships, Bit128 and Core Keys are left out of this queue because
they have recent installed-route replays for the pinned final archive; Core
Key tuple work is currently staged. Compact verification is also excluded from
the Dataset candidate because its cumulative `ValueWork` parity remains open.

## Recommended queue

### 1. Core Facets — four operations

Public operations are `inspectCoreFacets`, `declareCoreFacets`,
`verifyCoreFacetDeclaration`, and `historicalCoreFacetPatch`. Their Rust owner
is `umf_core::facets`; Node and browser V4 roots construct the shared
`createCoreModelRootEngine`/WASM model and bind it in
`src/access/rust-facets-default.ts` with `bindCoreFacetsRust`. The root selects
the four functions in both `src/index-node-v4.ts` and
`src/index-browser-v4.ts`.

Governing authority is CONTRACT-001 and CONTRACT-040. Existing operation
schemas are `inspect-core-facets` 5.0.0 and `declare-core-facets` 3.0.0. The
frozen predecessor sources are
[`frozen-typescript.json`](../r5-core-facets/frozen-typescript.json),
[`meaning-cases.json`](../r5-core-facets/meaning-cases.json), and
[`regression-cases.json`](../r5-core-facets/regression-cases.json); retain
[`exact-errors.json`](../r5-core-facets/exact-errors.json) for refusal shape.
The R5 packet already has tagged-wire and opt-in Node/Bun/Chromium/Edge
evidence, including unknown facet retention, malformed/stale/forged receipts,
surrogate paths and zero-work refusal. It does not establish V4 default-root
parity.

Host-order checks must preserve request admission before source inspection;
verification must reject a malformed receipt before copying `current`;
historical projection must retain its separate, explicitly bounded semantics.
The adapter currently copies host JSON in TypeScript before Rust dispatch, so
record exact accessor, hidden-field, symbol, proxy, cycle and invalid-number
error envelopes and getter counts. Do not infer arbitrary-input Rust ownership
from operation-wire tests. Four logical names (eight Node/browser rows) are the
maximum eventual ledger impact, and only after source-cohort replay and
retirement review.

### 2. Core Cardinality — three operations

Public operations are `inspectCoreCardinality`, `declareCoreCardinality`, and
`verifyCoreCardinalityDeclaration`, owned by `umf_core::cardinality`. Both V4
roots call `bindCoreCardinalityRust` from
`src/access/rust-cardinality-default.ts` around the shared core model engine.

Governing authority is CONTRACT-001 and CONTRACT-040; the frozen semantic
vectors are [`vectors.json`](../r5-cardinality/vectors.json), with capture and
independent schema comparison in [`schema-oracle.mjs`](../r5-cardinality/schema-oracle.mjs).
The operation schemas are `cardinality-operation-v6` for inspection and
`cardinality-operation-v4` for declaration. The R5 Rust core owns the
semantics, but the default-route review
[`r5-cardinality-default-route`](../r5-cardinality-default-route/README.md)
records an unresolved host boundary: `copyJson` preserves predecessor input
order, while generic `toWire` changes error class/path for hidden/accessor
members, cycles and invalid numbers. The binder's current ordering is
source-before-identity for inspection; request admission before source and
identity for declaration; receipt preparation before current-document copy
for verification. Freeze getter counts, proxy trap sequence and exact error
envelopes for each operation. Installed qualification can assess the current
compatibility route, but a fully Rust-owned host-admission claim must wait for
the opaque host-reflection seam and its exact path/order parity. Three logical
names (six Node/browser rows) are the maximum eventual ledger impact.

### 3. Compact Dataset validation — one selected operation

The selected operation is `validateCoreDatasetValuesCompact`, owned by
`umf_core::dataset_values::validate_core_dataset_values_compact`. Both roots
bind the existing engine through
`src/access/rust-dataset-values-compact-default.ts` and select only validation.
`verifyCoreDatasetValuesCompact` remains on the TypeScript reference route and
is out of scope.

Governing authority is CONTRACT-001, CONTRACT-049 and CONTRACT-056. Use the
17-case selected-root packet
[`index.json`](../r5-dataset-values-compact-default-cutover/index.json),
which preserves the earlier 15-case R5 packet
[`index.json`](../r5-dataset-values-compact/index.json) and adds crossed
source/input refusals. The packet includes commerce and supply-chain receipts,
unknown/residual content, null/absent distinction, exact decimal tokens,
duplicate keys/locators, structural/work limits, and the 349/350 boundary.

The installed probe should check complete result and refusal envelopes,
retained source/input copies, unknown content, accessor/proxy admission without
getter re-entry, and the exact 349/350 and resource-limit cases. The selected
V4 facade now gates semantic error translation on native-response provenance;
include a caller-forged `UmfCoreError` proxy negative control. Contractual
verify-before-input-access behavior does not apply to the validate operation,
but resource charging and refusal order do. CONTRACT-056 verification parity
is a known separate blocker: the Rust compact ledger has not shown the
predecessor's single cumulative `ValueWork` threshold for arbitrary dual-fault
inputs. One logical name (two Node/browser rows) is the maximum eventual ledger
impact for this validation slice.

## Queue outcome and limits

The three slices cover eight logical exports and sixteen default-root route
rows in the current ledger. That is a potential retirement scope only; private
installed receipts change none of the 922 gap dispositions on their own. Run
each family against one captured fixed-point archive, preserve the explicit
`./reference` route, compare frozen full results and host-reflection traces in
Node, Bun and real Chromium, and record Rust owner, adapter and installed
artifact pins. Keep platform support and release claims limited to the observed
archive and runtimes. This queue does not authorize ledger edits, declaration
retirement, or release publication.
