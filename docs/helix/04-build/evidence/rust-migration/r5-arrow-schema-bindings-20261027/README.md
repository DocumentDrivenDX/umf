---
ddx:
  id: umf.evidence.rust-migration.r5-arrow-schema-bindings-20261027
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
    - id: CONTRACT-016
      kind: informed_by
---

# Arrow schema JSON opt-in binding replay

This packet records a fresh source-coherent replay of the five opt-in Arrow
schema JSON operations through the Rust core wire, Node native binding, and
real Chromium WASM binding. It uses the frozen TypeScript packet at
[`r5-arrow-typescript-predecessor-20261027`](../r5-arrow-typescript-predecessor-20261027/README.md)
and the authored 52-case corpus. It is a bounded predecessor-parity result;
it does not select a default route or qualify Apache Arrow native, IPC, array
data, PyArrow, Python, CLI, package release, or the complete Rust port.

The exact replay passed on Node 26.12.1, Bun 1.4.3, and Chromium 153.0.8010.12.
Each host ran 260 corpus operations (52 imports, inspections, exports, node
lookups, and edit proposals), then the focused refusal/unknown/edit set. Node
and Bun recorded 16 focused imports and 26 focused operations, for 302 exact
native calls. Chromium recorded 16 focused imports and 26 focused operations,
for 302 exact WASM calls. Setup/call cancellation, setup/call work budgets,
disposed-handle behavior, exact ordered diagnostics, raw JSON output, and
source immutability were checked. The Rust wire regression ran two tests.
Receipts include durations and artifact hashes.

One host behavior remains explicitly unqualified: the predecessor's
`proxy-reflection-throw-identity` case preserves the identity of an object
thrown by a Proxy trap. That object identity cannot cross the JSON wire, so the
case is present in the 17-case packet census but excluded from the 16 focused
wire imports. No parity claim is made for that host-only behavior.

The resource handle is explicit and per-engine. Setup prepares immutable Arrow
resources once; calls use fresh per-call controls. There is no process-global
cache. This packet makes no claim that its resource/setup costs are free.

## Reproduction

Build into private temporary directories with the pinned offline Rust toolchain
and the source commands in [`source-manifest.json`](source-manifest.json). Copy
the Node package wrapper files into a private package directory and place the
built addon there as `umf_core_node.node`; the replay accepts that directory as
its first argument:

```sh
node docs/helix/04-build/evidence/rust-migration/r5-arrow-schema-bindings-20261027/replay.mjs /private/tmp/umf-arrow-node-session-package
bun docs/helix/04-build/evidence/rust-migration/r5-arrow-schema-bindings-20261027/replay.mjs /private/tmp/umf-arrow-node-session-package
UMF_CHROMIUM_PORT=41742 bun bindings/core/wasm/tests/arrow-schema-session.chromium.mjs /private/tmp/umf-arrow-wasm-session/pkg
```

The Chromium harness needs a loopback server. In the captured environment it
required the approved local execution context to bind loopback. The private
generated package and pinned files are identified in the receipts and source
manifest; the ephemeral `/private/tmp` build directories are not committed.
[`SHA256SUMS`](SHA256SUMS) pins this evidence packet.
