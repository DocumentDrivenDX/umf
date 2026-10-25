---
ddx:
  id: umf.evidence.rust-migration.r7-codegen-candidate-v2
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: CONTRACT-067
      kind: informed_by
    - id: umf.evidence.rust-migration.r3
      kind: informed_by
    - id: umf.plan.rust-migration
      kind: informed_by
---

# Python client Rust candidate V2

This packet qualifies an opt-in Rust-backed `generatePythonClient` candidate.
The package entry is `@umf/core/rust-codegen-candidate/v2`. It is a separate,
versioned snapshot API. The default package entry and direct TypeScript
`generatePythonClient` remain unchanged. This packet does not authorize a
default cutover or claim equivalence for accessor side effects.

## API and snapshot boundary

Both host entrypoints export `createPythonClientRustCandidateV2(options?)`.
The asynchronous factory initializes the host engine and returns a synchronous
generator. Node uses the native binding; browsers initialize the packaged WASM
module before returning the generator. Both accept the same cooperative
`profile` and `controls` options (`maxWork`, `meter`, `isCancelled`, `now`, and
`deadlineMs`). The generator receives the same nine recursively frozen,
repository-owned resources in either host. The package contains no install-time
download step.

V2 snapshots top-level request properties once in this order: `text`,
`package`, `format`, `records`, `actions`. It copies `records` and `actions`
into plain data before Rust validation. This order is an explicit V2 contract;
it can change the first observed error compared with the direct TypeScript
function. For `{text: validText, package: "bad-name", get records() { throw
sentinel; }}`, the legacy function refuses `/package` without invoking the
getter. V2 invokes the getter during snapshot and throws `sentinel`. The frozen
test asserts both outcomes and getter counts. Consumers requiring legacy
accessor side-effect and first-refusal order must continue using the default
entrypoint.

The snapshot boundary also changes ordinary side-effect counts: on the frozen
stable getter fixture, the direct implementation reads `text` four times and
V2 reads it once. On the stable proxy fixture, direct performs 18 `get` traps
and V2 performs 5. Both produce equal results for those stable values, and a
throwing first `text` getter throws the same sentinel on both. These results do
not qualify dynamic accessors that return changing values.

The raw lone-surrogate case is preserved at the error boundary: Rust's
`INPUT: Source contains an unpaired UTF-16 surrogate` is translated to the
legacy plain `Error("INPUT")`. The oversized-source `LIMIT` message is also
translated to the legacy message. V2 remains opt-in while getter/proxy side
effects and first-refusal semantics differ.

## Qualification run

Host set: Bun `1.4.3`, Node `v26.12.1`, and Playwright Chromium `153.0.8010.12`.
The frozen R3 operation corpus contains 31 `generatePythonClient` requests.

- `bun run typecheck`: passed.
- `bun test tests/access-rust-facade.test.ts`: 7 tests passed, 71 assertions;
  includes default-export absence of the candidate alias, all 31 R3 expected
  envelopes, result shape/resource checks, getter/proxy controls, crossed
  first-refusal, cooperative cancellation, recovery, Unicode, and size limit.
- `bun run test:rust-codegen-candidate-package`: a temporary `npm pack` was
  extracted into a clean `node_modules/@umf/core`. The temporary test staging
  directory symlinked only the repository's existing `ajv` and `yaml` packages
  to satisfy the package's current peer/runtime resolution; those dependencies
  were not copied into the packed archive or installed from a registry. Node runtime and installed
  NodeNext TypeScript import passed; 31/31 R3 cases matched; cancellation was
  observed and the same generator recovered; sample output had seven files.
  The packed archive also retained the pre-existing `./loader-contract` source
  export and its `src/` and `spec/` dependency closure; Bun imported its public
  functions and TypeScript resolved its declarations from the extracted package.
- `bun run test:rust-codegen-candidate-browser`: real Chromium loaded the
  emitted browser bundle through the V2 import-map entry, initialized the
  copied WASM binary, matched 31/31 R3 cases, observed cancellation and
  recovered, made zero external requests, and had no `process` or `Buffer`
  globals.

The package test validates the packed package's entrypoints and retained
`loader-contract` source closure with those two local dependency symlinks; it is
not a clean registry-install test. The npm pack check used
`npm_config_cache=/private/tmp/umf-npm-cache` because
the machine's default npm cache contained root-owned files. Pack and extraction
were local and required no network access.

These checks qualify this candidate slice and package assembly. They do not
qualify getter side-effect parity, broader codegen operations, deployment or
publication, or default activation. The other access operations remain outside
this packet.

## Source hashes

SHA-256 values identify source files used for the run above.

| File | SHA-256 |
| --- | --- |
| `package.json` | `70ba1904a55cc82b42b3f4c24cd0d8d96d59401b94c54bca8cdea23a82fc7cc9` |
| `src/index.ts` | `b6d36d3db4ce65322399c9de1b2a040552b8b49f5c9286c846b517771ea4db69` |
| `scripts/build-rust-codegen-candidate.ts` | `24e7a39eb905ecb43fbf929393aa7fc9056a62c0da2ce35bd392bbfe4e376caa` |
| `scripts/test-rust-codegen-candidate-package.ts` | `1bc9c37f46be022f5d96fa1518c4bee1be3fd529858142cc5ec6f5fc56345750` |
| `scripts/test-rust-codegen-candidate-browser.ts` | `0ab03382fa350a89a2a63d8cffd5da16d26db5813a59efb20bb2d88c1e181061` |
| `src/access/codegen-resources.ts` | `85e978f08c2ff42c9347b653ed12b9205c2fd1d3c0d205617092138cdc589d14` |
| `src/access/rust-candidate.ts` | `6cfdfd4bce683dc7d4262c8934edfe75ed4dae2c08bc0f99708ca95d2392fa72` |
| `src/access/rust-runtime.ts` | `5b420ec25832ef06f16c05530138e22029cd2bb41323b973fec721c1ed9a99a0` |
| `src/node.ts` | `10a44eb2b7b19318f7df8ff006339849b316b2cd208bed90318162395c467a9b` |
| `src/browser.ts` | `c66f6948e7cf81fb1d2783758f3d50f9db23c1d8bc218d3aedf2293f6f848cb5` |
| `tests/access-rust-facade.test.ts` | `9743fda8c35d080d9e177a8803e5cfca478589f2084d0db737b531aedad48c0c` |
