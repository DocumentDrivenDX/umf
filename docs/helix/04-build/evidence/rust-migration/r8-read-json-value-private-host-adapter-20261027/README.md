---
ddx:
  id: umf.evidence.rust-migration.r8-read-json-value-private-host-adapter-20261027
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: ADR-006
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-read-json-value-production-interface-proposal-20261027
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-read-json-value-ordinary-20261027
      kind: references
---

# Private raw-host Rust binding checkpoint

The shared Rust `read_json_value_host` protocol sequences the first raw length
comparison, strict format selection, live JSON preflight, second length read,
source-kind check and bounded UTF-16 chunks through one `Context`. Host throws
travel as opaque invocation-local tokens. Seven fake-host Rust tests pass. A
private N-API adapter and JavaScript dispatcher exercise the compiled addon;
seven Node tests pass, including ordered getter observations, exact thrown-value
identity, isolated-surrogate error units, a 10,000-unit diagnostic frame and
malformed-frame refusal. The compiled addon loaded in this run has SHA-256
`b250acc9180c95c3758950af9b2735eeacb395422948c5ff2b55927cb411a84a`.

This requalification ran the seven JavaScript tests against current compiled
source addon SHA-256
`56215b6758d3e80777e0f99f3924929e490886467e64796a931ae85aac7162f0`, replacing
the earlier tested addon hash `b250acc9180c95c3758950af9b2735eeacb395422948c5ff2b55927cb411a84a`.
The seven focused Rust fake-host tests also pass against the current source
using Rust 1.90.0.

This is a private protocol spike. The N-API entry returns a tagged wire string;
it does not reconstruct the public result graph or `UmfError` class. Callback
work in JavaScript and N-API frame conversion are opaque to Rust's meter. The
adapter currently uses an ordinary `Context` with no caller controls. Parser
phase setter effects, general raw-host input parity, stale/reentrant handle
validation, catalog mode, WASM/Chromium, installed package delivery and default
selection remain open. The [ordinary dedicated-entry replay](../r8-read-json-value-ordinary-rust-repair-20261027/README.md)
is a separate primitive-string candidate and still has one mismatch.

The [inherited-setter source oracle](../r8-read-json-value-inherited-setter-source-oracle-20261027/README.md)
shows why matching a fixed number of callback calls would be insufficient:
parser-phase throw boundaries and mutations to the receiver's own index affect
the predecessor. A production callback must arise from corresponding parser
operations and feed mutation effects back into parser state, or the behavior
must remain explicitly unqualified.

## Local replay

Build `umf-core-node` with the repository's pinned Rust 1.90.0 toolchain,
copy `libumf_core_node.dylib` to a private `.node` path, and run:

```sh
UMF_READ_JSON_VALUE_PRIVATE_ADDON=/private/tmp/umf-r8-json-current-requal-20261027/umf_core_node.node \
  node --test bindings/core/node/tests/read-json-value-host-private.test.js \
  bindings/core/node/tests/read-json-value-host-private-addon.test.js
```

This passed 7/7 on Node 26.12.1, macOS arm64 with the current addon. It is a
local test, not macOS CI or release qualification. [SHA256SUMS](SHA256SUMS)
pins this description and the tested source/test files.
