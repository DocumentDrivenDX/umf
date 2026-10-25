---
ddx:
  id: umf.evidence.rust-migration.r5-core-facets
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
    - id: TP-001
      kind: informed_by
---

# R5 opt-in core facet operations

This checkpoint adds opt-in Rust core facet inspection, declaration,
declaration verification and historical projection over the tagged wire
protocol, Node/Bun addon and WASM bindings. It follows `src/model/facets.ts`
and CONTRACT-040 for the scoped `inspect-core-facets` 5.0.0 and
`declare-core-facets` 3.0.0 envelopes. The route stays additive: TypeScript
remains the default package implementation.

The focused Rust packet is `crates/umf-core/tests/r5_core_facets.rs`, with
TypeScript predecessor vectors in `frozen-typescript.json` and
`meaning-cases.json`, plus source hashes for `src/model/facets.ts` and
`tests/core/facet-authoring.test.ts`. It covers copied source preservation,
authored integer-width declaration, retained unknown extension and facet
content through declaration, full inspection-envelope parity for range and
collection-size facets, an uninterpreted nested qualifier, stale/forged and
malformed receipt outcomes, request-schema diagnostics, and JSON/YAML receipt
round trips. Unknown length units do not conceal invalid known bounds.
The source-before-refusal order is preserved: request shape is checked first,
then source admission, version and Field role, followed by refusal to overwrite
an unknown length unit and target admission. Inspection keeps unknown facet
groups and nested qualifiers visible in `uninterpretedPaths`.

The TypeScript predecessor remains authoritative and is exercised by
`tests/core/facet-authoring.test.ts`. The focused native Rust test passed with
Rust 1.90 using `cargo test --offline -p umf-core --test r5_core_facets`
(6 passed). The predecessor suite passes seven tests/110 assertions. The
`regression-cases.json` packet freezes complete declaration and inspection
envelopes, historical projection outcomes and source/test hashes. It closes
three independent-review findings: length declaration merges over existing
minimum and unknown qualifiers; historical projection checks the full v5
`$defs.bounds` before version refusal; identity lookup and unknown-path pointer
construction preserve lone UTF-16 units. Receipt validation and recomputation
also precede copying the current document, preserving `CORE_FACET_RECEIPT` for
malformed and forged receipts even when current contains an unsafe integer.
Unsafe integer copy still refuses with `NUMBER` before bounds validation,
matching the TypeScript copy order.
Facet diagnostic collection, unknown qualifier pointer construction, and
qualifier-retention allocation charge their bounded work before allocation;
fallible reservations map allocation refusal to `LIMIT`.
The packet checks the exact request validation diagnostic and malformed-receipt
precedence. Historical projection covers representable legacy groups and
refusals of collection-size, range, malformed nested values, and minimum-length
bounds. Full `python/tests/test_python_sdist.py` passes (10 tests). The current
`umf_core-0.11.0.tar.gz` (SHA-256
`77248e663723c768f27cf26558ed512559782f1b45e9b0cda584fb53c80b15c6`) was
extracted under `/private/tmp/umf-facets-final-extracted` and passed
`cargo check --offline -p umf-core` with Rust 1.90. This checks the production
`include_str!` closure, not integration-test fixtures or wire, Node/Bun, and
real-browser WASM parity.

The facet and related native operation schemas are in the Python sdist source
closure; the fresh extracted build above checks the production `include_str!`
closure, not integration-test fixtures.

## Tagged wire and installed-host binding qualification

`crates/umf-core-wire/tests/r5_core_facets_wire.rs` exercises the four opt-in
operations: inspection, declaration, declaration verification and historical
patch projection. Node/Bun wrappers expose the same methods on
`createCoreModelEngine`; the WASM wrapper exposes them on
`initializeCoreModelWasm`. This evidence does not switch default routing or
retire the TypeScript implementation.

The Node and Bun runs installed a locally packed `@umf/core-rust-native`
artifact. Exact predecessor cases pass for inspection, declaration, valid
verification, unknown-facet preservation, length-bound merge, surrogate
qualifier paths, stale/malformed/forged receipts, invalid request, all six
historical projection outcomes, and detached result-copy behavior. Chromium
153.0.8010.12 and Edge 155.0.4283.62 run the same cases over rebuilt
`wasm32-unknown-unknown` release WASM
with `wasm-bindgen` 0.2.100; both confirm that Node globals are absent. All four
hosts refuse an operation with cooperative `maxWork: 0` as `RESOURCE_LIMIT`.
This is a zero-budget refusal check, not a maximum-size or exhaustive allocation
failure qualification. The tagged transport continues to enforce its own
admission before core operations; broader transport and interruption limits
remain under their existing evidence.

Host receipts are [Node](node.json), [Bun](bun.json), [Chromium](chromium.json)
and [Edge](edge.json). The packed Node addon SHA-256 is
`48842bb16405f45e181e5f38f0d305d346f412924fad00e539b99a478e8a761b`; the
locally installed tarball SHA-256 is
`bdb41d7ebf22d28c22cfb000fbac81ebdafc5db59698237c1524af3df2ffc7f9`. Browser
WASM SHA-256 is
`6ccfca7696522a0e86a2cf02f7dcbcb162d8e7e096cb187926e504968bc3e0d0` (8,898,109
bytes), with glue SHA-256
`a529650ad33bc71fe6e319fc315b5c25ef8da223dbe59f69396b1a10ce3d45c5`.
The receipts pin source and predecessor packet hashes. Their source cohort
requires a fresh integrated replay if shared wire or binding files change.

Independent Sol review of the binding and installed-host cohort found no P1/P2
in the pinned opt-in scope. The reviewer verified the four source and three
predecessor packet hashes, checked archived receipt source/packet pins, and
reran six Rust core tests, one tagged-wire test, seven TypeScript predecessor
tests (110 assertions), installed Node 26.12.1/Bun 1.4.3 and real Chromium
153/Edge 155 WASM. Armed cancellation returned `CANCELLED` for all four
operations; `maxWork: 0` returned `RESOURCE_LIMIT`. The independent replay
receipts are under `/private/tmp/sol-facets-{node,bun,chromium,edge}.json` and
are not distributed release artifacts. Mid-kernel cancellation, maximum-size
and exhaustive allocation-failure checks, Python exposure, default/package
cutover and publication remain outside this slice.

Independent Sol re-review replayed all six focused Rust and seven TypeScript
predecessor tests, a fresh native scratch repro of receipt ordering, length
preservation, projection refusals and surrogate handling, and meter refusals at
1, 100, 1,000 and 10,000 units. The reviewer found no remaining P1/P2 in this
bounded core slice and made no edits. Reviewed SHA-256 pins are `facets.rs`
`7dc2068a133057a5dd6968a6baadead41594c5588409aa866d457c2590d9498b`,
Rust tests `86663fb80bb4521f0cd5e3cd40add14709424e42a52efd7477b7ab964093a456`,
and frozen packet `67094676daddad97a14ad192e6ce2a5f75abb4a45418148a0cbc268f6c7d55e3`.
At the time of this core-only review, tagged wire and Node/Bun/real-browser
WASM exposure remained open; the later binding checkpoint above addresses
those specific opt-in routes. Exhaustive allocation-failure checks, production
package/default routing and TypeScript retirement remain open. Native facet
classifiers remain separate evidence families under CONTRACT-040.
