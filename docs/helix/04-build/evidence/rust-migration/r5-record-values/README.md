---
ddx:
  id: umf.evidence.rust-migration.r5-record-values
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: TP-001
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-002
      kind: informed_by
    - id: CONTRACT-003
      kind: informed_by
    - id: CONTRACT-004
      kind: informed_by
    - id: CONTRACT-005
      kind: informed_by
    - id: CONTRACT-006
      kind: informed_by
    - id: CONTRACT-007
      kind: informed_by
    - id: CONTRACT-008
      kind: informed_by
    - id: CONTRACT-009
      kind: informed_by
    - id: CONTRACT-010
      kind: informed_by
    - id: CONTRACT-011
      kind: informed_by
    - id: CONTRACT-049
      kind: informed_by
---

# R5 opt-in Rust core record-value check

This slice ports only the core `validateCoreRecordValues` family to the opt-in
Rust core. The live predecessor is operation `2.0.0` over core `0.10.0`;
CONTRACT-049's historical 1.0.0/0.8.0 discussion does not describe this newer
operation. The implementation checks logical Record membership, explicit
present/absent states, requiredness, the selected core Field checker and
incompleteness warnings. It applies no defaults and makes no claim about native
rows, physical storage, dataset uniqueness, key equality or relationship
enforcement. No operation schema was found at `spec/core/record-value-operation.schema.json`.

`frozen-typescript.json` is the immutable TypeScript predecessor packet captured
with Bun 1.4.3 and extended by Sol's frozen independent review cases. It includes complete result/refusal vectors and SHA-256
provenance for the TypeScript operation, its helper and field checker, the
original tests/fixture, and CONTRACT-001 through CONTRACT-011 plus CONTRACT-049.
The original eight cases cover successful values and source preservation,
required absence, invalid exact integer values, duplicate and undeclared values,
retained unknown source content, retired versions, malformed states, and complete
thrown/result envelopes. The crossed cases add unknown identity fields, empty
identities, validation precedence, source-warning order, escaped identity text,
lone-surrogate identifiers, exact refusal paths for null and array identities,
missing Field identities, and raw slash/tilde unknown keys. Resource controls
freeze a 15,000 duplicate absent-value `LIMIT` at
`/validation/diagnostics/4989/message` and a nested-source output-depth `LIMIT`
with exact `/source/...` path. `capture.ts` and
`add-sol-review-vectors.ts` explain the original capture and review extension;
do not refresh the packet as part of implementation changes.

Current packet SHA-256: `50d52bab545eae6566e8da6064c4fbec6d8880c89b4a32c9f2c5c614d4a3b5a9`.
The independent review-case input hash is retained in packet provenance as
`5f295e83d65b0e59f4e510666c539cbc642cc72ee85c3840d358d559eb8e78e1`.

The Rust implementation keeps qualified identifiers as UTF-16 through lookup,
path creation and JSON stringification. Ordered maps/sets bound duplicate and
member lookups; invocation context work is charged during scans, and the final
result passes a bounded JSON copy. Its resource-limit error path is walked in
source order to retain the TypeScript first-failure location.

Focused differential test:

```sh
RUSTC=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin/rustc \
  CARGO_TARGET_DIR=/tmp/umf-r5-record-values-target \
  /Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin/cargo \
  test -p umf-core --test r5_record_values --locked
bun test tests/core-record-values.test.ts
bun docs/helix/04-build/evidence/rust-migration/r5-record-values/verify-typescript.ts
```

The native test matches the frozen result/refusal outcomes and the separate
15,000-item and output-depth limit controls exactly. The Bun verifier replays
all frozen predecessor cases against the live implementation. At this core-only
checkpoint, bindings and installed-host behavior remained open; the subsequent
binding qualification is recorded below. Default package routing, native data
enforcement and independent native-oracle evidence remain open.

Final independent Sol review verified stable source
`02636eef58b8f31355f4c798bae0dbec77682397f9fb0ab8ae50614aa52d9b42`,
packet `50d52bab545eae6566e8da6064c4fbec6d8880c89b4a32c9f2c5c614d4a3b5a9`
and Rust test `921ae36a2fa72acb9e6da7532628dc066fff8bed1c58eaccb7ceb73547c4db22`.
The reviewer reran the focused Rust test, four Bun tests (27 assertions), and
the 24 frozen TypeScript cases plus two resource controls; no P1/P2 remained in
the operation 2.0.0/core 0.10.0 logical scope.

## Tagged-wire and opt-in binding qualification

`crates/umf-core-wire` now dispatches `model/validateCoreRecordValues` through
the accepted Rust core operation. The opt-in `createCoreModelEngine` surfaces
in Node/Bun and WASM expose `validateCoreRecordValues(source, identity, values)`;
the default TypeScript route is unchanged. Wire and wrapper checks are
`crates/umf-core-wire/tests/r5_record_values_wire.rs` and
`bindings/core/node/tests/core-model-wrapper.test.js`. The Rust wire test
replays representative frozen success, source-version refusal, lone-surrogate
and malformed-array identity cases against actual request/result envelopes.
The core Rust test and Bun verifier retain full coverage of all 24 frozen
predecessor cases and the 15,000-item and nested-output resource controls.

The packed native addon passed the same four selected cases under Node 26.12.1
and Bun 1.4.3. Both receipts also verify returned-source isolation. The addon
SHA-256 is
`9af0043c93cf0ff989497cccf69de7b779b5c2310bfe9005b2d2d20344e8506e`.
Chromium 153.0.8010.12 and Edge 155.0.4283.62 passed those cases with rebuilt
release WASM, copied-result isolation, `maxWork: 0` refusal and absent Node
globals. The WASM SHA-256 is
`a87244977f0b970d159dea70745b7348c922ec00e2a5c300ced02fa310c43dcb` (8,956,732
bytes), and the wasm-bindgen 0.2.100 glue SHA-256 is
`a529650ad33bc71fe6e319fc315b5c25ef8da223dbe59f69396b1a10ce3d45c5`.
See the [Node](node.json), [Bun](bun.json), [Chromium](chromium.json) and
[Edge](edge.json) receipts and replay scripts.

The binding cohort pins the accepted record-values source at
`02636eef58b8f31355f4c798bae0dbec77682397f9fb0ab8ae50614aa52d9b42`, the
tagged-wire source at
`c8d4dfabee385736c3b9aa1256f403e16687fdb65323f7e3ffb8952967fee7e3`, Node
wrapper at `7e301790303c4e8a769e9b10f8945dc5a2d70ef13906f9a54daa59da984e5c9d`,
and WASM wrapper at `46edf12e41c35185d278daf4be42c1cff937e695aadbb0979d354d7ab061446c`.
The predecessor packet remains pinned at
`50d52bab545eae6566e8da6064c4fbec6d8880c89b4a32c9f2c5c614d4a3b5a9`.
Python exposure, default/package cutover, TypeScript retirement, native row
enforcement, independent native-oracle evidence and broader host resource
qualification remain open.

Independent Sol binding review found no P1/P2 in this opt-in scope. It reran
the core and tagged-wire Rust tests, both wrapper tests, all 24 frozen
predecessor results/refusals in a packed Node install, and the four-case packed
Node/Bun replays. It verified the earlier Chromium/Edge receipts and exact
WASM/glue hashes; its own browser launch was denied by the macOS sandbox, so
that review adds no new browser pass. Concurrent codegen Context work changed
the shared wire source after these receipts. The final integrated cohort must
be rebuilt, repacked and replayed in installed Node/Bun and real browsers
before default or release qualification.

## Raw-host admission candidate (not a default route)

`host-admission.json` freezes raw JavaScript input admission and copy order for
a possible root-route candidate. It was captured with Bun 1.4.3 (Node
compatibility `v26.3.0`) by
`scripts/rust-migration/r5/freeze-record-values-host.ts`. The packet hashes a
42-file recursive TypeScript import closure plus CONTRACT-001 through
CONTRACT-011 and CONTRACT-049. It records 15 host-control outcomes, recursive
result prototype and key order, source → identity → values copy order,
source-version/identity semantic precedence, a 700,000-unit retained unknown
qualifier, and a 100,001-value refusal (`LIMIT` at `/99999`).
The numeric refusal cases are named `nan`, `positiveInfinity`,
`negativeInfinity`, `negativeZero`, and `unsafeInteger` in the packet.

Packet SHA-256:
`622f7a65c70a02fe039660e142b77b5fcbfee80a049c9a0627c5332e83cd3fb8`.
Freezer SHA-256:
`36634ba989ff8776a4502cef7e818e2f195de80bbcf9ac4c5d821939a41b61d4`.
The packet is reproducible with:

```sh
bun scripts/rust-migration/r5/freeze-record-values-host.ts --check
```

The frozen predecessor requires `UmfError` with argument-relative paths for
accessors, hidden/symbol members, custom prototypes, sparse arrays, cycles,
invalid numbers and non-JSON values. The current opt-in tagged-wire adapter
instead reports `AdmissionError`/`UmfCoreError`, envelope-prefixed paths, and
different admission codes; cycle input reaches a depth/resource refusal instead
of the predecessor's first `CYCLE` error. Valid result trees matched the
predecessor's null-prototype and recursive key order checks, including retained
unknown content. The initial packet preceded the admitted-path adapter; its
installed cross-host replay, error mapping, and resource-boundary comparison
remain gates. `validateCoreRecordValues` therefore remains on the TypeScript
package route.

The implementation option under review is the existing Rust-owned
`umf.host-json/1` reflection protocol in `crates/umf-core/src/host_json.rs`,
which already owns descriptor admission, ordering, paths, cycle detection,
UTF-16 chunking and Context charges for a separate schema-property operation.
Record values would need an operation-specific source → identity → values
sequence and a Rust entry that consumes those admitted Values without copying
them a second time. Node and WASM host adapters would supply only opaque handles
and bounded reflection replies; Rust owns the shared admission and semantic
Context in the current opt-in implementation. Cross-host qualification remains
open.

### `umf.host-json/1` admitted-path implementation checkpoint

The opt-in binding now has an operation-specific path that asks the Rust
`HostJsonReflection` walker to admit `source`, then `identity`, then `values`
into owned `Value` snapshots using one `Context`. The record evaluator accepts
those admitted values directly, avoiding a second semantic copy. Node N-API and
the WASM adapter expose `validateCoreRecordValues` through this route; raw
reflection stays limited to the existing closed descriptor/prototype/UTF-16
protocol. No default package export changed.

The frozen packet above remains authoritative. The opt-in Node replay is
`scripts/rust-migration/r5/record-values-host-node.mjs`; it exercises the raw
admission outcomes, getter-order traces, recursive prototype/key order, the
retained 700,000-unit unknown value, and control propagation. The Node release
addon and a cleanly extracted npm package passed all 19 bounded cases under
Node 26.12.1 and Bun 1.4.3; each run reported `meteredWork=1559658`. A separately
bounded Node release-addon probe passed the frozen 100,001-item limit case
with `LIMIT` at `/99999` in 4,982 ms and peak RSS 402,764,776 bytes. Bun 1.4.3
also matched that exact refusal in 5,049 ms and reported 546,784,504 bytes
process RSS under a supervised 1 GiB limit. The high host-side snapshot memory
use remains an open cross-host resource concern; the count-limit case has not
been replayed in Chromium.

The clean extracted WASM package passed the same 19 cases in Chromium
153.0.8010.12 with `meteredWork=1559658`, `maxWork: 0` returning
`RESOURCE_LIMIT`, and no Node globals. The browser run used wasm-bindgen
0.2.100. The pinned package, addon, glue and runtime results are recorded in
[host-json-node-bun.json](host-json-node-bun.json). A prior exit-137 diagnostic
used a debug addon that recursively loaded its sibling artifact; it was not
evidence of host descriptor allocation failure.

Sol independently verified all twelve receipt-pinned implementation/test
source hashes and reran the clean installed 19-case packet by package name in
Node 26.12.1 and Bun 1.4.3. Both passed with the expected `1559658` metered
work units and zero mutable `Array.prototype.map` reads. Sol also reran the
extracted WASM package in Chromium 153.0.8010.12: all 19 cases, the zero-work
control and absent Node globals passed. The reviewed receipt is
`host-json-node-bun.json` at SHA-256
`91cb8bd489a2cb02d950e9c076bba4c9855eb911f8d983ebb48748a6c44ed27e`.
No P1/P2 remains in the bounded opt-in host-admission scope. These receipts do
not qualify default routing, a current integrated SDK archive, Chromium's
100,001-item limit, or hard memory isolation.

## Bounded V4 default-root selection

The V4 Node/Bun and browser roots now explicitly select
`validateCoreRecordValues` through the existing `umf.host-json/1` Record Values
host-input engines. The tagged-wire `model.validateCoreRecordValues` method is
not used for this raw-input boundary: the host-input path owns source → identity
→ values admission, distinguishes absent from present-null, preserves retained
unknown source members, and returns the predecessor-shaped result. The V4
export remains synchronous after root initialization and has no TypeScript
fallback.

`tests/rust-migration/r5-record-values-default.test.ts` compares the V4 Node
root with all frozen TypeScript result/refusal cases and checks accessor
preflight plus retained unknown content. Run it with
`bun test tests/rust-migration/r5-record-values-default.test.ts`. The test
passed on Bun 1.4.3 in the shared Rust worktree (24 frozen cases and two host
admission checks; 53 assertions). The installed replay harness
`scripts/rust-migration/r5/record-values-default-node.mjs` applies the same
frozen packets to a V4 Node root selected by
`UMF_R5_RECORD_VALUES_DEFAULT_ENTRY`; the source-entry smoke replay passed on
Bun 1.4.3 with all 24 frozen cases and three host cases. The fresh-WASM browser
runner `scripts/rust-migration/r5/record-values-default-chromium.mjs` passed the
same 24 frozen cases and two accessor-preflight cases in Chromium 153.0.8010.12,
with zero getter calls and no Node globals. This is evidence for the live V4
browser source entry, not an installed archive. Installed-package replay and
the broader integrated default-route qualification remain pending. This
bounded source selection does not claim native row enforcement, TypeScript
retirement, or release readiness.
