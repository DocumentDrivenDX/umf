---
ddx:
  id: umf.evidence.rust-migration.r8-native-yaml-current-host-400590311
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-002
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-native-yaml
      kind: informed_by
---

# R8 native YAML current-host replay at `400590311`

## Result

Fresh private binding packages built from an extracted `git archive` of commit
`40059031112abc1a9d82336aaba0e09a04b546af` passed the frozen opt-in
`parseNativeYaml(source)` replay. The archive tree is
`ab8ed62f880d5c8ca71c95ab4cf84ed5a8d0434a`. On Darwin arm64, Node v26.12.1
matched all 24 default-profile predecessor cases: 12 returned trees and 12
errors, with zero tree, error-code, or exact-message mismatches. The real
Headless Chromium 153.0.8010.12 replay of the freshly built WASM package
matched the same 24 cases with zero mismatches. Both hosts preserved the tested
lone UTF-16 surrogate; Chromium also confirmed `process` and `Buffer` were
absent. The complete host receipts are [Node](node-replay.json) and
[Chromium](chromium-replay.json).

The replay scripts import the private package directories directly. These are
current-source package-path checks for the opt-in operation; they do not claim
an npm registry install or published artifact. The package facades expose
`parseNativeYaml` through `createJsonSchemaEngine()` and dispatch through the
native binding. The tested corpus is the 24-case YAML 1.2 default subset from
the [frozen predecessor evidence](../r8-native-yaml/README.md). YAML 1.1,
custom predecessor options, other YAML constructs, and unsupported-form error
precedence remain outside this result.

## Build and replay provenance

The source archive was extracted under
`/private/tmp/umf-r8-native-yaml-current-400590311/archive`. Both optimized
bindings were built from that extraction with Rust 1.90.0, locked offline
dependencies, separate target directories, and `CARGO_INCREMENTAL=0`. The
Node native addon was copied into a private package directory with the archive's
Node facade and `src/` files. The WASM artifact was generated with
wasm-bindgen 0.2.100 and placed beside the archive's WASM facade and `src/`
files. The `git archive` tree hash, material source hashes, replay script and
fixture hashes, build outputs, runtimes, and exact per-host results are recorded
in [receipt.json](receipt.json).

The package artifact hashes are:

| Artifact | SHA-256 |
| --- | --- |
| Node addon `umf_core_node.node` | `d63e8a1b7f465e68d6714a54f9300e91ad77c5406d90c096eaeb639fd6bdffa5` |
| WASM glue `umf_core_wasm.js` | `76157608e9d87455416d3ad4396c9b0632f799b2da2345132d8cdb0751f9ee2c` |
| WASM binary `umf_core_wasm_bg.wasm` | `7f331a5e8af8d2724e77cc4ee6dae32f966c2149e8376f65078493efa1672ba5` |

The 24-case fixture SHA-256 is
`d33e5b667ca89490f4e60612f78ad5713608e0c4b64668df1b32658b2f9066af`.
The Node and Chromium receipt hashes are respectively
`94947d834678b3950021ccb0a26fb55547aea9bac8d5ad29e4cf9a3fbae8d486` and
`a1e75be0d38dd1a44170c02affde8975bfb6d67fc505e1db33df0f3a5368cddc`.

## Boundary

This receipt qualifies only the opt-in string operation through these two
private package directories and the pinned source/runtime cohort. It does not
qualify the TypeScript default route, package publication, another operating
system, a release, arbitrary YAML parser parity, or broader JSON Schema
behavior. The package default remains a separate route decision.
