# Core Cardinality per-case packet sources

These three `/2` all-Rust packets preserve every operation case separately:
`inspectCoreCardinality`, `declareCoreCardinality`, and
`verifyCoreCardinalityDeclaration`. Expected outcomes and ordered traces derive
from the frozen TypeScript reference capture at
`docs/helix/04-build/evidence/rust-migration/r5-model-bindings/frozen-cardinality-typescript.json`.

`expectedDefaultRustCalls: 1` is an observed case-level expectation from the
installed Node, Bun, and Chromium bridge captures. The reference route must
observe zero calls. The host trap and refusal-shaped cases remain in the
packet even though the host-input Rust bridge is called before those cases
refuse; this packet does not claim a default-route preflight zero-call case.

Run `core-cardinality-case-capture.mjs` separately for each runtime and host
cohort. Its host receipt is `status: pass` only after exact packet outcome,
ordered trace, and call-count assertions pass. Cohort and member sidecars bind
the result to the input archive. Capture outputs alone do not establish
ledger retirement.

The capture runner also requires the archive's fixed-point `sourceClosure.liveInputs`
to contain exact hashes for itself, this focused test, the `/2` retirement
validator, and all three packet files. Historical archives created before those
files entered the source closure fail closed and cannot emit `/2` pass receipts.

## Running a capture

Install the repository's pinned `playwright` package and make Chromium available
for browser captures. Extract the target SDK archive so the directory passed as
`<package-root>` contains `package.json` and `dist/`. Run once per runtime on a
host matching the archive cohort:

```sh
bun scripts/rust-migration/r8/core-cardinality-case-capture.mjs node \
  <package-root> <sdk.tgz> <archive-sha256> <darwin-arm64|linux-x86_64> \
  <source-closure-sha256> <output-directory>
bun scripts/rust-migration/r8/core-cardinality-case-capture.mjs bun \
  <package-root> <sdk.tgz> <archive-sha256> <darwin-arm64|linux-x86_64> \
  <source-closure-sha256> <output-directory>
bun scripts/rust-migration/r8/core-cardinality-case-capture.mjs chromium \
  <package-root> <sdk.tgz> <archive-sha256> <darwin-arm64|linux-x86_64> \
  <source-closure-sha256> <output-directory>
```

`UMF_CHROMIUM_PATH` may select a specific Chromium executable. Node and Bun
resolve `@umf/core` and `@umf/core/reference` through the archive package
conditions; Chromium uses an import map built from the verified `browser` and
`./reference` export paths. The runner independently hashes the gzip/tar,
compares every extracted member byte, pins the archived package manifest and
Rust source manifest, checks the requested platform/cohort, and writes a full
member-map sidecar plus three raw `/2` host receipts. The browser instrumentation
wraps the actual `WebAssembly.Instance.exports.executeCoreCardinalityHostJson`
export; Node/Bun wrap the actual N-API `executeCoreCardinalityHostJson` export.
