---
ddx:
  id: umf.evidence.rust-migration.r7-codegen-host-read-v4
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: CONTRACT-079
      kind: informed_by
    - id: CONTRACT-080
      kind: informed_by
    - id: ADR-006
      kind: informed_by
    - id: umf.evidence.rust-migration.r7-codegen-host-read-v3
      kind: informed_by
    - id: umf.plan.rust-migration
      kind: informed_by
---

# R7 codegen host-read V4 candidate

This packet freezes the V3 predecessor cohort and V4 behavior differences before
implementation. V4 is an opt-in production candidate; it does not change the
default TypeScript export or authorize a release. It implements the host-read
resource profile in CONTRACT-079 and the scoped CONTRACT-080 exception.

## Frozen predecessor

The governing predecessor is the V3 ASCII-frame source cohort and evidence in
[`r7-codegen-host-read-v3`](../r7-codegen-host-read-v3/README.md), especially its
`hex-ascii-transport` receipt. Its callback checkpoints, exception identity,
bounded ASCII frame protocol, call-scoped work/constraint controls and
opt-in-only route are the starting point. The captured pre-edit hashes below
freeze this checkout's exact predecessor inputs for the V4 difference review.

| Source | SHA-256 before V4 edits |
| --- | --- |
| `src/access/rust-host-reads-v3.ts` | `f3ab136e5666d6d60d1afbf35d42feff6a591153facbfdd3bb0562fe2ea13a90` |
| `bindings/core/node/src/wire.js` | `020a58d34afaad50bc2b562d405d7ce8d052e4d0f7185444188a1d1d3e50ecd1` |
| `bindings/core/wasm/src/wire.js` | `020a58d34afaad50bc2b562d405d7ce8d052e4d0f7185444188a1d1d3e50ecd1` |
| `crates/umf-core-wire/src/codegen.rs` | `2d72cb35e651350a085ce326af2c884bfde4da69941415b59e0187af8818354a` |
| `crates/umf-codegen/src/generation/client.rs` | `d3bd015b1aa32b5dbf3d28c766f3f39f7ed733878a55a91d489f2a91ee28dca5` |
| `crates/umf-codegen/src/generation/mod.rs` | `c503df5258f40b20b1914a99787ed044998a6bbad2d6249f299b9737b8a6d923` |
| `scripts/rust-migration/r7/codegen-host-read-gate0-probe.mjs` | `59db90819127e610107b4e3a44f1e3e04f72f1a6aa493091981c099cc45bcfc7` |
| `tests/access-host-read-v3.test.ts` | `c927480f424051b4573a487b44a064831c0f26c168cda838a23310d2b7057c33` |

## Deliberate V4 differences

V3 maps or iterates caller selection arrays and constructs a deduplicated set
before Rust sees them. V4 instead captures each non-null list's identity and
length once, counts sparse positions, rejects raw lengths above 10,000 records
or 1,000 actions before reading any indexed position, and traverses only those
captured positions with indexed reads. Appends after capture are ignored;
mutations to unread positions stay visible. Each selected qualified identity is
a primitive frozen string before any meter callback can run. The cumulative
UTF-16 length across record and action identity strings is limited to 4,000,000
before deduplication. The first crossed limit returns `RESOURCE_LIMIT`, message
`V4 host-read resource limit exceeded`, at `/records` or `/actions`. This
intentionally changes duplicate-list admission and custom `map`/iterator
behavior; nothing is silently truncated.

V4 retains the V3 Rust-driven checkpoint order, original thrown-value identity,
and <=8,192 UTF-16-unit primitive ASCII response frames. Selection position
inventory is charged before reservation or indexed reads; each returned
identity is charged before deduplication. Rust sends the remaining call-local
4,000,000-unit allowance with each indexed request, and the JS host refuses an
oversized individual identity before transferring it to Rust response frames.
The start callback freezes each selection array's identity and length; each
subsequent item callback then reads exactly one captured position, so meter
callbacks between reads may mutate unread entries. Captured intrinsic helpers
avoid a later `Array.prototype.push` replacement. The closed V4 resource
descriptor is accepted only with its version tag and `/records` or `/actions`
path. HardIsolated refuses before any request callback. Host getters,
coercions, Proxy traps and JS string concatenation remain cooperative. No
blanket ceiling is added to source text or unrelated computed strings, and this
profile does not claim hard memory or preemption isolation.

## Candidate evidence

The candidate is exposed only at the opt-in package subpath
`@umf/core/rust-codegen-candidate/v4`; `package.json` root `.` remains on the
existing implementation. The build emits separate V4 Node and browser bundles.
This tests the repository package tarball and a clean extracted Node install;
the release SDK archive produced by `scripts/package-sdk.*` does not yet include
candidate subpaths and was deliberately not changed by this slice.

On 2026-10-24, the following checks passed against this source cohort:

| Check | Result |
| --- | --- |
| `bun test tests/access-host-read-v4.test.ts` | 9 tests, 29 assertions passed: closed enumerable V4 refusal descriptor (including malformed shapes), sparse captured positions, raw cap before index reads, captured identity/length, unread mutation, ignored append/map/iterator behavior, duplicate pre-dedup accounting, one oversized identity, cross-event text budget, poisoned `Array.prototype.push`, and thrown-value identity. |
| `bun run typecheck` | Passed. |
| Focused Rust descriptor test | `cargo test --offline -p umf-core-wire --lib response_descriptors_are_closed_and_exact`: 1 passed, including malformed V4 tag/path/arity cases. |
| Actual Node/native addon | 6 tests, 11 assertions passed: raw cap before indexed reads, cumulative duplicate text refusal, mutation between reads via meter, successful ordinary generation, third-read unpaired-surrogate `Error('INPUT')`, and 4,000,001-unit source-text `UmfError('LIMIT', 'Source text exceeds limit')`. |
| Clean package install | Passed from `umf-core-0.5.6.tgz`, without dependency symlinks; profile, seven generated files and raw-limit refusal verified. This is repository-tarball evidence, not release-SDK archive evidence. |
| Real browser/WASM | Headless Chromium 153 passed; profile, raw-position refusal, mutation between indexed reads, `Uint16Array` poisoning and seven outputs verified, with zero external requests. |
| WASM release build | `cargo build --offline --release --target wasm32-unknown-unknown -p umf-core-wasm`: passed. |

The V4 source and generated candidate artifact hashes recorded at this run are:

| File | SHA-256 |
| --- | --- |
| `src/access/rust-host-reads-v4.ts` | `5fc9ea93013d2fa6a1ea0c2c80c535cf9dac3beb1ef142f022105c14273227d0` |
| `src/access/rust-runtime.ts` | `1ff6db147630ab57f5574c1e4b94e55b554d86859beb0922a78d396efd3b17f6` |
| `crates/umf-codegen/src/generation/client.rs` | `fd0bb48630491ef3c70436c8cafbbf8fe9d7520b1779221fa983db590207ab1b` |
| `crates/umf-core-wire/src/codegen.rs` | `db4c741b453c2478b42ba7b1516b6b602be2385f7a9d74c99d58e5527aacee61` |
| `crates/umf-core-wire/src/host_response_frames.rs` | `eeb589762d6ccc5b1c374db21eecc226ceb6342df46933a825bdc0df24e52a6e` |
| `bindings/core/node/src/wire.js` (same bytes as WASM copy) | `a6187bb3e6704eacf6b100b622888bbb1cc08fd482721f8119ab81b9719d93f8` |
| `bindings/core/node/src/lib.rs` | `38bd9fde3000de366a7d196f0833d4770cb76683d913fc1006d5dca1a2d682d0` |
| `bindings/core/wasm/src/lib.rs` | `08b8557073c3b4a78cc79b431d1da5c68a045948062aee414036afb193c5cbf5` |
| `tests/access-host-read-v4.test.ts` | `370106d115a53b8b511ef5a05083c2b2f4945ffdc90b17c1e8380b6957535308` |
| `scripts/test-rust-codegen-host-read-v4-node.ts` | `8501e3a6ba3431f02a4621f42ff6305a70515966e8d4e7dd3a1f284f35aaacb6` |
| `scripts/test-rust-codegen-host-read-v4-package.ts` | `42e4f25fb834bca984222a12fe99f7e3ebdbfd0592c00f8e91edc0756f5fd34a` |
| `scripts/test-rust-codegen-host-read-v4-browser.ts` | `f7e2d4b783f5637e09c5ed6e6e1df5dbe85e25a6cd531dafcc9b943746d6963d` |
| `package.json` | `8faccc2484e12474c3bf0882f22425bdfb258c65013552eb79a0c54cedf56355` |
| `dist/umf-rust-codegen-candidate-v4-node.js` | `a9de93b115f1f7a12ed77c02fddc1a81978b9b5f6b24957f5d0888ced3a2f4e1` |
| `dist/umf-rust-codegen-candidate-v4-browser.js` | `553d3ba0d4aa656e9c8fb74623a1cc1f7c8eaa99f684bd8d6d0b8e8013159eca` |
| `dist/umf_core_node.node` | `aaf2f33f2460ffcc41d2d5d40ffce6e4d01a8c226e206a3f70f1c63c27b3d0dc` |
| `dist/pkg/umf_core_wasm.js` | `a529650ad33bc71fe6e319fc315b5c25ef8da223dbe59f69396b1a10ce3d45c5` |
| `dist/pkg/umf_core_wasm_bg.wasm` | `a87244977f0b970d159dea70745b7348c922ec00e2a5c300ced02fa310c43dcb` |

## Frozen installed root-entry preview (2026-10-24)

A separate preview archive was built from a private, retained source snapshot to
exercise the V4 generator as the archive's root runtime entry. This is a
candidate archive only: the repository `package.json` root `.` still resolves
to `dist/umf.js`, and no publish/default route change is authorized by this
receipt. The preview archive's package metadata is `private: true`; its root
entry re-exports the existing TypeScript surface while replacing only
`generatePythonClient` with the synchronously callable V4 Rust implementation
after top-level-await initialization. A production route decision still
requires Sol review and the Linux CI cohort.

The immutable archive is
`/private/tmp/umf-r7-root-candidate-final-snapshot/umf-core-0.5.6-preview.r7.darwin-aarch64.tgz`
with SHA-256
`5c045d90e7b9f43039a70a59c800e482334cc6ab5c27adfc282ffe585776b446`. Its
manifest SHA-256 is
`1d6c8e7ba4d4152d00201f46bcc88dfbaadb39909c92df90fb251ba9493633a6`; it
contains 489 hashed assets and exactly 491 package members. The archive's
source closure is SHA-256
`df211960be2b3913012093752ee88098b8e83f66f25ce1cf6ba45f7d9724c577`, covering
2,147 inputs. The retained inputs and `SOURCE-CLOSURE.json` are beside the
archive at
`/private/tmp/umf-r7-root-candidate-final-snapshot/source-inputs/df211960be2b3913`.
The machine-readable build and installed replay receipts are
`/private/tmp/umf-r7-root-candidate-final-snapshot/receipt.json` and
`/private/tmp/umf-r7-root-candidate-final-snapshot/installed-replay-receipt.json`.

The clean extracted archive passed all 31 frozen R3
`generatePythonClient` cases with Node 26.12.1 (31/31, 97.620 s), Bun 1.4.3
(31/31, 103.450 s), and real headless Chromium 153.0.8010.12 (31/31, 92.844
s). Across hosts, the replay verified synchronous output and parity with the
preserved TypeScript bundle. Node/Bun refused a missing N-API addon; Chromium
refused missing and corrupt WASM. The browser made no external requests. The
installed replay exercised raw-position refusal and an individual
over-budget identity in Node/Bun and Chromium; the focused V4 host-read suite
above separately covers the cross-event cumulative identity budget.

Sol independently recomputed all 2,147 retained source-input hashes, the
source-tree digest, all 489 asset hashes, the archive SHA-256 and its exact 491
members. Sol also reran `bun scripts/test-sdk-rust-preview.ts` against this
immutable archive: Node, Bun and Chromium each passed the 31-case replay and
the missing/corrupt-asset checks (261.792 s total). This independent replay
qualifies the stated preview archive and source snapshot only.

The snapshot contains the unified Context/codegen cohort and the then-current
R5 modules at capture time. It is not the current moving worktree: at the
installed replay receipt, nine input files had drifted, including `bindings/core/node/index.d.ts`,
`bindings/core/node/src/core-model.js`, corresponding WASM declaration/core
model files, `crates/umf-core-wire/src/lib.rs`, its semantic-types wire test,
`crates/umf-core/src/dataset_values.rs` and `semantic_type_accessors.rs`, and
the compact dataset-values test. The retained snapshot, not the moving tree,
defines the archive's source cohort. Further worktree edits do not change that
immutable cohort. This replay is consequently bounded
preview evidence rather than final all-source release qualification.

The source closure captures `Cargo.lock` and `bun.lock`, but the preview build
uses the existing workspace `node_modules` symlink for build tools; installed
dependency bytes are not pinned by the retained source archive. A clean locked
dependency installation, Linux x86_64 hosted CI replay, and a Chrome release
channel run remain outstanding. Those are release qualification gates, not
claims implied by this local macOS arm64 preview.

## Unified codegen Context follow-up — 2026-10-24

The production codegen wire routes now use one ordinary `Context` from tagged
request decode through resource construction, operation dispatch, semantic
error conversion and result encode. The tagged-wire text/value/depth allowance
is scoped around decode and encode and restores ordinary limits on error or
unwind. Catalog value allowance is similarly scoped around the nine-resource
construction. Both scopes preserve work and constraint counters and all host
control hooks. This applies to ordinary `codegen/*` dispatch and the
`execute_codegen_host_read_v3_wire_with_control` entry used by both the V3 and
V4 host-read profiles.

Focused Rust evidence passed with the pinned 1.90.0 toolchain and an isolated
`CARGO_TARGET_DIR`:

| Check | Result |
| --- | --- |
| `cargo check --offline -p umf-core-wire --features codegen` | Passed. |
| Core wide-counter continuity test | Passed: seed near `u64::MAX`, admit catalog work, then verify the next ordinary phase hits `LIMIT / Work counter overflow`; separate fresh phase contexts would pass. |
| Core transport/catalog scope tests | Passed for limit restoration after errors and unwind, cumulative finite host work, and cancellation/deadline hook preservation. |
| Private codegen resource-admission test | Passed: the actual codegen entry carries seeded decode work into catalog copying and overflows there; it also verifies ordinary limits are restored. |
| `tests/codegen_context.rs` | 2 passed: generic codegen success and one-unit-below cumulative work refusal across the wire path; host-read entry exercised with V3 and V4 profile selection. |

The finite host-meter integration is useful route coverage, while the near-
`u64::MAX` private codegen test is the mutation-sensitive proof against the
former context resets. The latter would fail with fresh catalog/operation
contexts even if the host callback itself were shared.

Source hashes at this follow-up (complete worktree file contents):

| File | SHA-256 |
| --- | --- |
| `crates/umf-core/src/context.rs` | `49a0b8fdc3dabbff4d48fa2978537cd902b2c3e349dba9b90582ca71473b0871` |
| `crates/umf-core-wire/src/codegen.rs` | `c7084ebb647f6257343846a12b1ff01559bf53a23bb640fcae5314af4a4ffef1` |
| `crates/umf-core-wire/src/lib.rs` | `180cdcca98bca0d1909785ce5b4a973a4f15ba04a9d67396f33b06eaf88f5a22` |
| `crates/umf-core-wire/tests/codegen_context.rs` | `077554496fc4dda0045157facddce6b12fd83f3d62cb89d1f3e4486e436a0ffb` |

The focused source change closes the codegen Context blocker for this source
cohort; it does not qualify default activation. The generic non-codegen request
path still creates a separate ordinary operation Context after decode and
remains outside this follow-up. Also open are the full release SDK archive
route, a source-cohort-wide replay and independent review, Chrome release-
channel qualification (the browser evidence here is headless Chromium), and
default activation/release. No default export or release was changed.

## Qualification state

The predecessor is evidenced by its V3 packet. This focused Rust follow-up
does not requalify the V3/V4 browser artifacts or imply qualification for the
open gates listed above. No browser result is inferred from Rust or Node
results.

## Integrated candidate checkpoint — 2026-10-24

After the unified `Context` refactor, isolated Node and WASM builds were made
under `/private/tmp/umf-v4-integrated-{node,wasm}-target`, and the generated
package was tested from a clean extraction. These results belong to those
exact built artifacts:

| Check | Result |
| --- | --- |
| Frozen V3 Node/native replay | 7 tests, 44 assertions passed in 548 seconds. |
| V3 packed Node replay | Passed: 46 Gate 0 observations, 31 R3 cases, crossed-gate refusal, late UTF-16 package path, control recovery, cumulative budget boundary, and surrogate record/action behavior. |
| V3 packed Edge replay | Passed on Edge 155: 46 Gate 0 cases, 31 R3 cases, refusal/mutation controls, recovery, poisoned `Uint16Array`, surrogate record/action behavior, and zero external requests. |
| V4 actual Node/native suite | 7 tests, 12 assertions passed, including source-error compatibility and exact generated-file parity with TypeScript. |
| V4 Edge 155 and headless Chromium 153 | Both passed: profile, `RESOURCE_LIMIT`, mutation path, seven generated files, exact output parity, and zero external requests. |
| V4 clean package smoke | Passed from a clean repository-tarball extraction; profile, seven files, and raw-limit refusal verified. |
| R5 record-values packed Node and Bun | Both passed four selected cases and returned-result isolation using the packed native binding. |
| R5 record-values Chromium 153 and Edge 155 | Both passed four cases; browser run reported `RESOURCE_LIMIT` and no Node globals. |
| TypeScript typecheck | Passed. |

The R5 native package archive SHA-256 is
`7117ece091265cbd03aff0ae317f763ff30c2902f2f189135ee117370dc461b4`; Node
and Bun receipts are under `/private/tmp/umf-v4-integrated-cohort`. The R5
browser bundle SHA-256 is
`8a4e239ff886470abb27ccb0dd96a215fe2af834281461e4cce64c6001129e2c`, with
browser receipts beside it. The clean UMF package archive used for V4 smoke
and packed V3 replay has SHA-256
`1c232b9e5c7c73e80e387d14b7da693f703cc796fbbd64e8174a1d0f54f6c493`.

| Built candidate asset | SHA-256 |
| --- | --- |
| V4 Node candidate bundle | `a9de93b115f1f7a12ed77c02fddc1a81978b9b5f6b24957f5d0888ced3a2f4e1` |
| V4 browser candidate bundle | `553d3ba0d4aa656e9c8fb74623a1cc1f7c8eaa99f684bd8d6d0b8e8013159eca` |
| Node addon | `7b7fc552e898f2093010de507484a9cddc9cf9a66d02392231d617de83f893d9` |
| WASM JS glue | `a529650ad33bc71fe6e319fc315b5c25ef8da223dbe59f69396b1a10ce3d45c5` |
| Bindgen WASM | `026da8828985a087de2ebdee20b73b0e216b388491b226bde85ca887efa54407` |

The integrated artifacts were built while relationship and dataset core
modules were being edited by their owners. The dataset owner subsequently
reported stable source, with final-copy reachability still unproven. This is
an integrated checkpoint, not a reproducible final source cohort: later shared
Rust edits may not be represented in these binaries. The next frozen-cohort
replay must pin all Rust inputs before rebuilding. Current V4 TypeScript and
test hashes are `src/access/rust-host-reads-v4.ts`
`5fc9ea93013d2fa6a1ea0c2c80c535cf9dac3beb1ef142f022105c14273227d0`,
`src/access/rust-runtime.ts`
`1ff6db147630ab57f5574c1e4b94e55b554d86859beb0922a78d396efd3b17f6`,
`scripts/test-rust-codegen-host-read-v4-node.ts`
`804a8664a622b2e3163efdcd1ef3fa2bf76b3fc0b37e3a061a3dc3f86c2d95a5`, and
`scripts/test-rust-codegen-host-read-v4-browser.ts`
`7968a6e103d26f2f2d8fca7991930b8fdb8ef138f0bc16d7811455291db456b5`.
For transparency, current post-build hashes of the concurrently maintained
core modules are `crates/umf-core/src/core_relationships.rs`
`b68b93fbefeda05debbd130f9801b49e0952634b40fbe1bed967f65664349b35` and
`crates/umf-core/src/dataset_values.rs`
`1d6729859dfd000812f16af6688089ef2ebfb7c069ca8acdcd3dac742c4f845e`; these
identify current source only and are not claimed as the build inputs.

Temporary ignored `dist` and binding replacements were restored. `diff -qr`
matched saved copies of `dist` and the WASM package, and the restored Node
addon SHA-256 (`aaf2f33f2460ffcc41d2d5d40ffce6e4d01a8c226e206a3f70f1c63c27b3d0dc`)
matches its saved pre-build copy. Chrome release-channel qualification remains
unavailable; browser evidence is Edge and headless Chromium. The full release
SDK archive route and default activation remain open.

## Nullish-only selection absence regression — 2026-10-24

Independent review found that the shared selection-start helper used a
truthiness check, allowing `false`, `0`, and `""` to act like an absent list.
V4 now treats only `null` and `undefined` as absence. Every other non-array
value raises the captured `TypeError('Selection must be an array')`; the
existing host-read abort/rethrow path preserves that error object and does not
advance beyond the failing selection checkpoint.

| Check | Result |
| --- | --- |
| Direct host-read tests | 10 tests, 49 assertions passed, covering null and all three falsy values for records and actions, abort descriptor, and TypeError rethrow. |
| Actual Node/native suite | 8 tests, 24 assertions passed, including all six falsy records/actions combinations. |
| Real browser/WASM | Headless Chromium 153 passed all six falsy combinations along with the existing V4 checks; `falsySelectionsRejected: 6`, seven exact generated files, zero external requests. |
| Restoration and whitespace | `dist` matched its pre-test backup; focused `git diff --check` passed. |

The browser regression ran the browser-tested integrated V4 bundle and WASM
cohort above, with only the selection guard in its bundled host helper changed
from `if (!refs)` to `if (refs == null)`. This isolates the source delta but is
not a fresh Rust/source-cohort rebuild. The focused-test browser bundle SHA-256
is `bc366e7c3ca2430145c26a974fd953595dbf5315357fc3f6574f82e1acd87804`;
its unmodified integrated predecessor bundle hash is
`553d3ba0d4aa656e9c8fb74623a1cc1f7c8eaa99f684bd8d6d0b8e8013159eca`, and
the paired WASM hash is
`026da8828985a087de2ebdee20b73b0e216b388491b226bde85ca887efa54407`.
Updated source hashes:

| File | SHA-256 |
| --- | --- |
| `src/access/rust-host-reads-v4.ts` | `84ad51b28f8437e438a9957205e94e91bb680608dd74a22b068a0731a264d4b6` |
| `tests/access-host-read-v4.test.ts` | `2724ffc5ee21eaf149c6ff55693b9dccf8c026d3f48f3da7464636e2e7988924` |
| `scripts/test-rust-codegen-host-read-v4-node.ts` | `ae28b4bd7b6f2605a40d219a51a5affc35fb4790977f9f78da1b147bfb0df979` |
| `scripts/test-rust-codegen-host-read-v4-browser.ts` | `741fd8f2040a987e7c3fddf490bad6093dc31f6d92cc33a66ebc0515017cd240` |

The all-source frozen rebuild and independent review remain open before any
default activation.

## Clean SDK preview archive — 2026-10-24

The preview-only packer now builds a clean archive from pinned Cargo inputs
instead of copying ignored binding outputs. It builds the N-API addon and
wasm-bindgen 0.2.100 artifacts in an isolated target directory, verifies the
source closure before/after packaging, and records hashes for every `dist`
asset. The archive contains a fresh WASM binary at `dist/umf_core_wasm_bg.wasm`
beside the browser bundle because the generated wasm-bindgen glue resolves its
relative URL from that bundle. The checked-in package root export remains the
TypeScript implementation; the Rust route is an opt-in preview subpath in the
archive only.

| Check | Result |
| --- | --- |
| Clean archive build | Passed on macOS arm64 with Rust/Cargo 1.90.0, Bun 1.4.3, and wasm-bindgen 0.2.100. |
| Source closure | 2,065 inputs, SHA-256 `2e590293c6d8475b35b67dd065129f594f1f6a277ecfbd7b999eb048632d6366`; includes Cargo/build inputs, embedded `spec/` resources, source trees, package metadata and test/build scripts; ignored native/WASM outputs excluded. |
| Installed archive | Passed from clean extraction under Node 26.12.1, Bun 1.4.3, and headless Chromium 153.0.8010.12. All routes returned seven generated files matching the TypeScript root; preview API is synchronous after import and browser made zero external requests. |
| Failure controls | Missing native addon refused for Node/Bun while TypeScript root remained usable; corrupt WASM refused during browser module initialization. |
| Archive closure | 491 members: 489 manifest-hashed `dist` assets, `dist/rust-preview-manifest.json`, and `package.json`; no unmanifested members. |
| Linux x86_64 | CI matrix job is defined, but has not run; Linux qualification remains pending. |

Archive SHA-256 is
`a2316ae2d91a3f86f90c3982dc0f4686be9d11d7ae1403728d3ba47432766bdd`; its
manifest SHA-256 is
`6b1adaebcaae967e6d184258e1eee6c5880a4e56924a4368d52f7ea9bdfc885f`.
The pinned `Cargo.lock` SHA-256 is
`e9a198c1a7b919b9046064ece584a4768c0f78786dd2977767a6297122c3b67a`. Key
built assets are:

| Asset | SHA-256 |
| --- | --- |
| `dist/umf-rust-codegen-preview-v4-node.js` | `bbe44e6dabd268bbeeb957942b5563acc029ba3ea6c811970ad21f11124b0498` |
| `dist/umf-rust-codegen-preview-v4-browser.js` | `46a17dfccd27a6f4dd31ead8adff9b5b78d278b7eda42605348c095a987bba78` |
| `dist/umf_core_node.node` | `214d710ba5dff030ba5fcee0217b7268709058e3c16da96b21a46412862abadd` |
| `dist/umf_core_wasm_bg.wasm` | `d1bfacedba5ab317b704be3286e7829affa51f7fc0a202eca65c784f0fbba33d` |
| default `dist/umf.js` (TypeScript) | `01ee34d2d2e574fbc8c30b84b2e62396760540333cb542426f258a99acd88158` |

The reproducible packer and extracted-archive harness are
`scripts/package-sdk-rust-preview.ts` and
`scripts/test-sdk-rust-preview.ts`; the Linux/macOS workflow is
`.github/workflows/rust-sdk-preview.yml`. This preview does not change
`scripts/package-sdk.*`, the installed production root, or release routing.
Independent Sol review verified the archive's 491-file allowlist and all 489
declared asset hashes, reproduced the clean extracted-package test on Node
26.12.1, Bun 1.4.3 and Chromium 153.0.8010.12, and checked both missing-addon
and corrupt-WASM refusals. The browser test needed a localhost server; the
review used the authorized local test environment. No P1/P2 remains in this
preview-only installed macOS arm64 scope. Linux x86_64 CI, a frozen all-source
cohort replay, Chrome release-channel coverage, and the default-route decision
remain open.

## Production root-entry preparation — 2026-10-24

Sol approved preserving the synchronous `generatePythonClient(request)` call
after ESM import. This bounded prep adds separate Node/Bun and browser root
entry sources. Each uses top-level await to initialize the V4 Rust generator,
then explicitly overrides only the generator value over the existing root
barrel. Initialization rejection propagates from module evaluation; a missing
or incompatible engine cannot route to the TypeScript implementation. The
fixed nine repository resources and the V4 resource limits are unchanged.
`package.json` root `.` and both SDK packers remain untouched; these are not
installed production routes.

| Check | Result |
| --- | --- |
| Bun host test | 3 tests, 4 assertions passed: Node/Bun root function matches exact TypeScript output and is synchronous; synthetic top-level initialization rejection preserves the same error object; malformed initializer result is refused. |
| Packed-style Node entry smoke | Node 26.12 passed: synchronous result, seven generated files, and import rejection when adjacent native addon is absent. |
| Packed-style Bun entry smoke | Bun passed the same checks. |
| Real browser root entry | Headless Chromium 153 passed exact TypeScript output parity with seven files, synchronous call after import, zero external requests, and rejection of a second root-module import with deliberately corrupt WASM. |
| Whitespace | Focused `git diff --check` passed. |

The Node/browser smoke bundles were built only under `/private/tmp` using the
prior integrated checkpoint's Node addon and WASM pair; no ignored worktree
assets were copied or changed. The browser bundle pinned the paired
wasm-bindgen glue with a build plugin because the checked-in ignored WASM glue
is older and lacks the host-read export. This tests the new root entry sources
against the prior integrated artifact pair; it is not a fresh all-source
qualification or installed SDK test.

| Prep source or built artifact | SHA-256 |
| --- | --- |
| `src/access/rust-default-v4.ts` | `4e1993d70d0afd447e48845e9cda880c4b4a60c5f0096563a2e96d687262275b` |
| `src/index-node-v4.ts` | `94d6a3a901fab1949c2ec2fc0e029e090671026c0833449666744e5c0c49ad0e` |
| `src/index-browser-v4.ts` | `66c17fe0c490a03811e9624d49b85a597caca36405326531819b11f7865c4494` |
| `tests/rust-codegen-default-v4.test.ts` | `0047f95f2439732048e34c18fe4367c8a7aefa4eeb44886606f2008ab72e4099` |
| `tests/fixtures/rust-codegen-default-v4-init-failure.ts` | `89bcd38ea88eee1e24ef96e518578393bf336f275876f85d47d27d76f04cd8ea` |
| `scripts/test-rust-codegen-default-v4-node.mjs` | `08ab0656d28101b5a14dcb837c19bdd54709eacf1a3a94ee7b4d7ffe7b1def38` |
| `scripts/test-rust-codegen-default-v4-browser.ts` | `4052dfc575fc42aa6e913ed0778d93b6d7e4c81d3d8aa9bba5b4f40985546fd8` |
| Isolated Node root bundle | `bbe44e6dabd268bbeeb957942b5563acc029ba3ea6c811970ad21f11124b0498` |
| Paired Node addon | `7b7fc552e898f2093010de507484a9cddc9cf9a66d02392231d617de83f893d9` |
| Isolated browser root bundle | `46ef6ce7d84c3dc1f56559c55015596da01c185c0ecaf46f93d589bec6050027` |
| Paired WASM JS glue | `a529650ad33bc71fe6e319fc315b5c25ef8da223dbe59f69396b1a10ce3d45c5` |
| Paired WASM binary | `026da8828985a087de2ebdee20b73b0e216b388491b226bde85ca887efa54407` |

The preview packer and CI route above now cover macOS arm64 locally and define
Linux x86_64 qualification. Production root export conditions, complete
all-source retirement and frozen-cohort replay remain separate release gates.

Independent Sol review checked both entry sources, the initializer helper and
the preserved root request/result type shape against the current public
`generatePythonClient` signature. Sol reran the Bun source test (3/3) and the
V4 direct host-read suite (10/10); the agent's typecheck passed before a
concurrent R5 semantic-value freezer was added. The explicit
generator export overrides the barrel export after top-level initialization;
the initializer propagates import failure and rejects a non-function engine.
No P1/P2 remains in this opt-in entrypoint-preparation scope. The root barrel
still reaches TypeScript executable exports, and the existing default bundle
is still TypeScript; this review does not approve default routing or retirement
until the fresh all-source build and installed archive gates above pass.

## Final retained root-entry archive replay (2026-10-24)

The final clean extracted archive replay for this preview cohort is recorded at
`/private/tmp/umf-r7-root-candidate-final-snapshot/installed-replay-receipt.json`
(SHA-256 `7d6156a0c974722a865b097b1acf53c42ba9b9bb279849e7e30ccd6b54df83ef`).
The archive is
`/private/tmp/umf-r7-root-candidate-final-snapshot/umf-core-0.5.6-preview.r7.darwin-aarch64.tgz`
(SHA-256 `5c045d90e7b9f43039a70a59c800e482334cc6ab5c27adfc282ffe585776b446`);
its manifest hash is `1d6c8e7ba4d4152d00201f46bcc88dfbaadb39909c92df90fb251ba9493633a6`.
It contains 489 manifest-hashed assets and 491 total package members. The
retained 2,147-file source snapshot is
`/private/tmp/umf-r7-root-candidate-final-snapshot/source-inputs/df211960be2b3913`
with closure hash
`df211960be2b3913012093752ee88098b8e83f66f25ce1cf6ba45f7d9724c577`; the
build receipt is `/private/tmp/umf-r7-root-candidate-final-snapshot/receipt.json`.

Node 26.12.1, Bun 1.4.3, and headless Chromium 153.0.8010.12 each passed all 31
frozen R3 `generatePythonClient` cases. Durations were 97.620 s, 103.450 s,
and 92.844 s (293.914 s total). The extracted archive also passed checks for
synchronous root API and TypeScript output parity, raw-position caps,
single-identity 4M-budget refusal, missing native addon refusal on Node/Bun,
missing and corrupt WASM refusal in Chromium, and zero external browser
requests. Cross-event cumulative budget behavior is covered by the focused V4
host-read suite above; it is not claimed as an installed package assertion.

The captured build and replay harness hashes are respectively
`8e3c42607b875d369cbed68e44fffc04046b67952d6bc49756735919e66699e7` and
`789dad6b54894763b584cca263173673b723be5e535a15deec85a2daacc0b6e7`. Captured
Rust inputs include `context.rs`
(`49a0b8fdc3dabbff4d48fa2978537cd902b2c3e349dba9b90582ca71473b0871`),
`core_relationships.rs`
(`b68b93fbefeda05debbd130f9801b49e0952634b40fbe1bed967f65664349b35`),
`codegen.rs`
(`c7084ebb647f6257343846a12b1ff01559bf53a23bb640fcae5314af4a4ffef1`), and
`dataset_values.rs`
(`48524a158da7fc3ca0204a6917135c63222819f339c66c65b14a4a341b1d92e2`). Nine
captured input files drifted after snapshot, listed with both hashes in the
machine-readable replay receipt. In particular, live `dataset_values.rs` is
`525158fe8f1e1c4d9464505778a7abb9e3ec055660cc0665de47895dac249886` at receipt
capture time. The receipt's live hashes are a point-in-time comparison and may
be superseded by further worktree edits. The immutable snapshot—not the moving
worktree—defines the tested cohort.

The archive is `private: true` and remains preview-only. The repository's root
`package.json` export and production SDK packers were not changed by this
cohort. The source snapshot pins Cargo and Bun lockfiles but the build used a
symlink to workspace `node_modules`, so installed dependency bytes are not
captured. Linux x86_64 CI, a clean locked dependency install, and Chrome
release-channel coverage remain pending; this evidence is not a default-route
or release qualification.

## Captured intrinsic invocation follow-up (2026-10-25)

The V4 host-read adapter now captures `Reflect.apply` and the RegExp/String
intrinsics at module initialization, then invokes those captured functions
without `Function.call.bind`. This preserves the pinned method identity while
removing three `Function` hook tokens flagged by the unified-client boundary
checker. Sol independently reran `bun test tests/access-host-read-v4.test.ts`
(10 tests, 49 expectations) and `bun run typecheck`; both passed. Source
SHA-256 is
`c933bbd60a7cdf9557692198ce103b1debe068d884c51a1aac9c7794e408088b`.
The historic installed archive above predates this source edit; its replay
does not qualify the new byte cohort. The unified-client boundary checker
still flags existing Rust facade imports and requires a separate design
decision that preserves explicit coverage.
