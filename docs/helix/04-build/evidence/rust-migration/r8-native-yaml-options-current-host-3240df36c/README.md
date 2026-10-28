---
ddx:
  id: umf.evidence.rust-migration.r8-native-yaml-options-current-host-3240df36c
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

# R8 native YAML and options current-host replay at `3240df36c`

Fresh optimized native Node and browser WASM packages built from `git archive`
of commit `3240df36c9a26661d857adeb94b99b96c31662cc` matched the frozen
TypeScript predecessor across the 24 default YAML 1.2 cases and all eight
option-predecessor cases. Node v26.12.1, Bun 1.4.3, and real headless Chromium
153.0.8010.12 each matched all 32 returned trees and errors, including exact
error codes and messages. The packet contains 15 returned trees and 17 errors.
Each host also preserved a lone UTF-16 surrogate; Chromium confirmed that
`process` and `Buffer` were absent. Per-case trees, codes, and messages are in
the host receipts: [Node](node-replay.json), [Bun](bun-replay.json), and
[Chromium](chromium-replay.json).

The option subset is exactly the eight cases in the frozen predecessor packet:
YAML 1.1 boolean words, date rejection and `dateOnly: "string"`, timestamp
rejection, the PyYAML y/n lexicon, and invalid/null/numeric version precedence
before malformed-source parsing. This does not establish general YAML 1.1
support or arbitrary YAML option/parser parity.

## Build and host provenance

The source was extracted from `git archive 3240df36c`; its Git tree is
`43f2cb886091776b32eb0103f2edf8c39b06ad49`. Both release builds used Rust
1.90.0 with locked offline dependencies, `--release`, and separate private
`/private/tmp/umf-r8-yaml-options-3240df36c` target directories. The WASM
artifact was generated with wasm-bindgen 0.2.100. The archive, material source
hashes, build commands, runtimes, and artifact hashes are recorded in
[receipt.json](receipt.json). Replay scripts are included beside the receipts.

| Artifact | SHA-256 |
| --- | --- |
| Node addon `umf_core_node.node` | `cec49caef7d1f8122fbe1804ca0c45c7345709a5978743df47faf1e1de2dec14` |
| WASM glue `umf_core_wasm.js` | `76157608e9d87455416d3ad4396c9b0632f799b2da2345132d8cdb0751f9ee2c` |
| WASM binary `umf_core_wasm_bg.wasm` | `5f03affc972745b944d7fe0e9f273ab9062e4a1b27d6164e079a7a747c31b813` |

This qualifies only these private package directories, source commit, 32-case
YAML corpus, and Darwin arm64 host versions. It does not qualify npm install or
publication, a package default route, Linux, another OS, a release, arbitrary
YAML/parser behavior, or broader JSON Schema behavior.
