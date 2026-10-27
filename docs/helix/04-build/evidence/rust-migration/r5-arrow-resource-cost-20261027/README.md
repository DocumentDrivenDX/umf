---
ddx:
  id: umf.evidence.rust-migration.r5-arrow-resource-cost-20261027
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-016
      kind: informed_by
---

# Arrow schema resource-cost microbenchmark

This bounded local probe isolates the setup cost of ArrowSchemaResources from
the five schema-JSON operations. The measured document is one small UTF-8 field
schema. It is a performance diagnostic, not an acceptance or release
qualification.

The pinned source snapshot during measurement was:

| Input | SHA-256 |
| --- | --- |
| crates/umf-core/src/arrow_schema.rs | 6fd168fae979b465a90e52086c84d78209856c5592ce7876edbbbd02bb8e609d |
| crates/umf-core-wire/src/lib.rs | bcac37f705a2ad6ca7f0e64cb7b77a820b56cd567167cb1b75adb70ca9aff414 |
| bindings/core/node/index.js | 3e940d0067a22a85c3fb3331bba016017c9275862c40b110b5e6ad36b44ba855 |
| bindings/core/node/src/wire.js | 5a59889a7484b69554b628aa45c58bad6f71bb4c47679ae63d72f2e8a8e0daea |
| Node native addon loaded by the process | f636059935e789c49561a7a6ce4adc05e5a2a7fa5fbe142cb39e6fbaf3f9d213 |

The Arrow source subsequently changed to SHA-256
93d9d13a8f3ea7eb4acd0b3aea159a9029c1ec8a315ea9b87bc8da78f42863f4, then to
3eeb0f2778990729db96135d0ee2085551df13415e070da0c3a606c1c3ce688d for the
separate corrected-source direct-Rust run below. The Node results and first
direct-Rust run remain historical to the 6fd... cohort. The native addon digest
pins the loaded binary, but no source-to-binary manifest was captured; the
source hashes identify observed working-tree inputs and do not prove the
addon's complete build closure.

## Results

Node v26.12.1 loaded the addon from a private package copy at
/private/tmp/umf-arrow-perf-node/umf_core_node.node. Two calls per operation
were timed independently after an untimed import prepared the input document.
The raw samples and per-operation means are in
[node-samples.json](node-samples.json), and the executable sampler is
[node-bench.mjs](node-bench.mjs).

| Operation | Sample 1 (ms) | Sample 2 (ms) | Mean (ms) |
| --- | ---: | ---: | ---: |
| import | 4127.746 | 4132.551 | 4130.148 |
| export | 4128.558 | 4106.179 | 4117.369 |
| inspect | 4143.096 | 4109.252 | 4126.174 |
| getNode | 4141.283 | 4128.014 | 4134.648 |
| proposeNodeEdit | 4187.606 | 4098.854 | 4143.230 |

The direct Rust probe constructed ArrowSchemaResources five times, then reused
one prepared resource value across eight calls of each operation, with a fresh
Context per operation. Raw timings are in
[rust-release-samples.txt](rust-release-samples.txt) and
[rust-debug-samples.txt](rust-debug-samples.txt); the harness and locked
standalone dependency set are retained beside them.

| Build | Resource construction samples (ms) | Operation means, 8 calls each (ms) |
| --- | --- | --- |
| Rust release | 612.223, 614.302, 615.239, 610.778, 618.300 | import 1.657; export 1.673; inspect 1.667; getNode 1.614; proposeNodeEdit 3.233 |
| Rust debug | 3282.151, 3276.755, 3273.255, 3253.474, 3270.545 | import 8.731; export 9.821; inspect 8.973; getNode 9.158; proposeNodeEdit 16.967 |

The wire dispatcher constructs the resource bundle before selecting and invoking
the requested Arrow operation. The direct Rust measurements show that resource
preparation dominates this small workload. A reused resource session is
therefore the leading performance design, provided setup is explicit and
controlled.

## Current-source Rust session prototype

After the historical Node capture, a private direct-Rust harness measured a
single prepared ArrowSchemaResources value reused for 52 repetitions of all
five operations (260 calls total). Each operation used a fresh Context. This
run used the corrected live source SHA
3eeb0f2778990729db96135d0ee2085551df13415e070da0c3a606c1c3ce688d; the exact
harness and raw output are retained in rust-current-session-bench.rs,
rust-current-session-release.txt and rust-current-session-debug.txt. No shared
source file was edited for this benchmark.

| Build | Resource construction samples (ms) | Reused-session 260-operation time |
| --- | --- | ---: |
| Rust release | 638.885, 635.361, 639.669, 648.669, 658.264 | 528.207 ms |
| Rust debug | 3867.023, 3323.590, 3324.343, 3440.496, 3476.428 | 3643.307 ms |

The release and debug binaries for this corrected-source run have SHA-256
d5de7fad0ce9cae103cc9a10d08a5d00415eb77d61064447b216dcaaa7cb5b64 and
f19cb1c2c400d9782e2fad707d43930cee43a66f93afd6cad1aa1746a954d9a2,
respectively. This prototype demonstrates reuse through the existing core
resource API; it does not measure a Node/Python/WASM session wrapper and does
not change any public binding.

## Commands and limits

The Node samples were collected with Node and the pinned private package:

    UMF_ARROW_NODE_ENTRY=file:///private/tmp/umf-arrow-perf-node/index.js UMF_ARROW_ADDON_SHA256=f636059935e789c49561a7a6ce4adc05e5a2a7fa5fbe142cb39e6fbaf3f9d213 UMF_ARROW_SOURCE_PINS='crates/umf-core/src/arrow_schema.rs=6fd168fae979b465a90e52086c84d78209856c5592ce7876edbbbd02bb8e609d;crates/umf-core-wire/src/lib.rs=bcac37f705a2ad6ca7f0e64cb7b77a820b56cd567167cb1b75adb70ca9aff414;bindings/core/node/index.js=3e940d0067a22a85c3fb3331bba016017c9275862c40b110b5e6ad36b44ba855' node node-bench.mjs

The Rust binary used rustc 1.90.0 on aarch64-apple-darwin, with a private
target directory:

    CARGO_TARGET_DIR=/private/tmp/umf-arrow-perf-target RUSTC=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin/rustc /Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin/cargo run --manifest-path /private/tmp/arrow-schema-perf/Cargo.toml --release --offline
    CARGO_TARGET_DIR=/private/tmp/umf-arrow-perf-target RUSTC=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin/rustc /Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin/cargo run --manifest-path /private/tmp/arrow-schema-perf/Cargo.toml --offline

The executed Rust binaries are pinned as
ab18b82e6865c2c4141f7aef60505eb4e1c729e99136e65963b4e1d7229c13a3
(release) and
85c8d04a2ff50d4f4e10a47545d4fb354af4633d54205e5d6106743f41c5f754
(debug). Cargo.lock records the standalone dependency resolution. Build
commands ran before the later source change above; a fresh build against
current source would be a different cohort.

This probe does not measure a prepared Node or WASM session, browser execution,
the full 52-case corpus, or end-to-end parity. CPU load varied during concurrent
workspace work. No default-route claim or retirement follows from these
timings. The safe follow-up is an explicit per-engine session: prepare resources
once under visible work, cancellation and deadline controls, then execute each
operation with a fresh operation context and its own controls. Keep current
one-shot functions' per-call setup accounting unchanged, and verify concurrent
session safety before sharing a handle across threads.
