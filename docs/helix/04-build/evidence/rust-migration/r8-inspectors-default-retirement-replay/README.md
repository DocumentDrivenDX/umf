---
ddx:
  id: umf.evidence.rust-migration.r8-inspectors-default-retirement-replay
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
    - id: umf.evidence.rust-migration.r5-core-inspectors-default
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-core-inspectors-installed
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-default-inspector-relationship-callsite-audit
      kind: informed_by
---

# Installed Core Inspector retirement replay

This packet freezes one successful predecessor case and one accessor preflight
refusal for each default-routed inspector: `inspectCoreScalarType`,
`inspectCoreRecordMembers`, and `inspectCoreReferenceLinks`. The successful
outcomes come from the reviewed TypeScript predecessor packets. The refusal
outcomes and zero-getter traces come from the earlier installed host-shape
receipt, pinned by source path and SHA-256. The generator verifies both against
their recorded sources before writing or checking the operation packets:

```sh
bun scripts/rust-migration/r8/inspectors-default-retirement-packets.ts --check
```

The input container
[`r5-core-inspectors-default/frozen-predecessors.json`](../r5-core-inspectors-default/frozen-predecessors.json)
has SHA-256 `9563378b9fb00b213f76d6c0d09ac0c8278c0fb829c719b566b019971a0f3a7a`.
The host-shape source
[`current-5e7138383-20261026/core-inspectors-host-node-bun.json`](../r8-core-inspectors-installed/current-5e7138383-20261026/core-inspectors-host-node-bun.json)
has SHA-256 `37272801887c154c84d37838a275191db82f418b254a284f58184ebdbc217c35`;
it records archive `7e9bc9c1de4ff519d91f1fde6b0c6b30bde367a8d5c6aa5f610d018a247520b8`
and source closure `138b719c1b2e099b636de1b12b0cee7201fdec483d30d8d59d9d274fe315816e`.
These hashes belong to the frozen predecessor evidence and are not claims about
the next SDK archive.

The operation packet JSON follows the retirement validator's exact five-key
shape (`format`, `contractId`, `exportName`, `rustOwner`, `cases`). CONTRACT-001
is cited here as the envelope/admission constraint; CONTRACT-040 is the packet's
operation contract.

Each host replay compares the package default route and explicit `./reference`
route with the frozen outcome and getter trace. It wraps the installed Node
addon or browser WASM entrypoint to count calls: successful default cases must
reach Rust; accessor preflight refusals and every reference case must make zero
Rust calls. The browser harness also requires the packaged WASM request and
absence of Node globals.

The harnesses consume an extracted private SDK package and require explicit
archive and fixed-point source-closure pins. Set the following variables for
each replay:

```sh
export UMF_R8_INSPECTOR_ARCHIVE_ROOT=/path/to/extracted/package
export UMF_R8_INSPECTOR_RECEIPT_DIR=/path/to/inspector-receipts
export UMF_R8_INSPECTOR_ARCHIVE_SHA256=<archive-sha256>
export UMF_R8_INSPECTOR_SOURCE_CLOSURE_SHA256=<source-closure-sha256>
```

Run both Node and Bun, then Chromium:

```sh
node scripts/rust-migration/r8/inspectors-default-retirement-replay-node.mjs
bun scripts/rust-migration/r8/inspectors-default-retirement-replay-node.mjs
bun scripts/rust-migration/r8/inspectors-default-retirement-replay-browser.mjs
```

The 2026-10-26 archive replay in
[`r8-core-inspectors-installed`](../r8-core-inspectors-installed/README.md)
is historical and predates the current facade/source cohort. The replay
harness mechanics were smoke-tested against the older `ce1acfb65` private
archive on Node 26.12.1, Bun 1.4.3, and Chromium 153.0.8010.12: each host passed
all six packet cases, with one Rust call for each valid default case and zero
for each accessor refusal and reference case. Those temporary receipts are not
included because that archive predates the current source cohort. The pinned
4547 archive replay and its raw Node/Bun/Chromium and broader host receipts are
preserved in [current-4547-20261027](current-4547-20261027/README.md). That
fixed-point archive passes the three bounded packets and broader 26-case
installed replay, but is historical relative to subsequent source edits. The
Linux x64 cohort, complete CONTRACT-040 acceptance, and a fresh current-source
callsite review remain open. The three TypeScript predecessor modules and
non-root callers remain untouched. These packets and receipts do not mark
declarations retired, qualify all input shapes or platforms, or claim full SDK
support or release readiness.
