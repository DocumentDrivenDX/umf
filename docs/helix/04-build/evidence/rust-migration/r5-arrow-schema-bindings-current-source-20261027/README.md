---
ddx:
  id: umf.evidence.rust-migration.r5-arrow-schema-bindings-current-source-20261027
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-arrow-typescript-predecessor-20261027
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-arrow-schema-bindings-20261027
      kind: supersedes
    - id: CONTRACT-016
      kind: informed_by
---

# Arrow schema JSON current-source replay

This refreshed packet supersedes the earlier Arrow binding receipt after
current-tree changes to schema-property resources and generated metamodel
provenance. A later regeneration also changed the recorded
`src/extensions/actions/plan-identity.ts` source hash; the source manifest now
pins that current file. It is not an Arrow runtime/build dependency, so the
rerun Cargo builds correctly reused the already-built artifacts. The Node and
WASM artifact hashes are unchanged. Prior receipts are preserved under
[`historical/pre-plan-identity-regeneration-20261027/`](historical/pre-plan-identity-regeneration-20261027/)
and are not relabeled as current.

This is an opt-in five-operation Arrow schema JSON qualification only. It does
not select a default route and does not qualify native Apache Arrow, IPC,
array-data, PyArrow, Python, CLI, the package release, or complete Rust port.

The host cohorts each replay 52 authored cases across import, inspect, export,
getNode, and proposeNodeEdit (260 corpus operations), plus 17 focused cases
represented as 16 JSON-wire imports and 26 focused operations (302 exact
binding calls). Setup/call cancellation, setup/call work limits, disposal,
exact output bytes, diagnostics and source immutability are checked. The
`proxy-reflection-throw-identity` case preserves TypeScript Proxy trap thrown
object identity and cannot cross this JSON wire; it remains explicitly
unqualified. See each host receipt and the source manifest for versions,
durations, commands and hashes.

The replay harness is reused from the historical packet at
[`r5-arrow-schema-bindings-20261027/replay.mjs`](../r5-arrow-schema-bindings-20261027/replay.mjs);
the real Chromium harness remains at
[`arrow-schema-session.chromium.mjs`](../../../../../../bindings/core/wasm/tests/arrow-schema-session.chromium.mjs).
Both harness hashes are included in this packet's current source closure.

[`source-manifest.json`](source-manifest.json) pins all inputs used by these
builds and replays, including current generated provenance resources and the
schema-properties core-wire/PyO3 source additions. The build uses the separate
targets `/private/tmp/umf-arrow-refresh-node` and
`/private/tmp/umf-arrow-refresh-wasm` so it does not replace a shared addon or
interfere with other package builds. `SHA256SUMS` pins this packet.
