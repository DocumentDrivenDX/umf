---
ddx:
  id: umf.evidence.rust-migration.r7-schema-comparison-gate0
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-077
      kind: informed_by
    - id: CONTRACT-080
      kind: informed_by
    - id: ADR-006
      kind: informed_by
---

# R7 schema comparison predecessor packet — Gate 0

This packet freezes the current TypeScript predecessor for
`docs/helix/05-deploy/schema-browser/components.ts::compareDocuments` before a
Rust implementation is proposed. It is source-only evidence: no Rust source,
binding, generated metamodel output, or default consumer is changed here.

The governing boundary is CONTRACT-077: structural comparison reports
added/removed/changed pointers and original values; it does not claim
compatibility, equivalence, or native behavior. CONTRACT-080 requires unknown
content to remain visible and collision-prone conversion to preserve source or
refuse. This packet covers only the pure comparison function. It excludes DOM
rendering, `comparisonModel`, schema catalog admission, and annotation policy.

## Frozen predecessor interface and order

The interface is:

```ts
compareDocuments(before: unknown, after: unknown): DocumentChange[]
```

Each result has `path`, `status` (`created`, `removed`, or `changed`), and the
applicable optional `before`/`after` values. The function first calls
`copyJson(before)`, then `copyJson(after)`, before walking either copy. Thus,
when both arguments refuse, the first-side refusal wins. `copyJson`'s existing
exact `UmfError` code, message, and path are part of the frozen behavior.

The walker uses `JSON.stringify` equality at each node. Objects are traversed by
keys in `Object.keys(before)` order followed by keys found only in
`Object.keys(after)`; an object whose property order alone changes produces no
change record, while property changes retain that traversal order. ECMAScript
integer-index keys therefore enumerate before ordinary string keys even when
authored later. Raw JSON number spelling is not an input to this API: callers
have already parsed values before `copyJson` runs. Numeric-looking strings in
the fixture pin exact string preservation, while `1.0` and `1` parsed as JS
numbers compare equal. Unsafe integer numbers and negative zero refuse before
comparison.
If both values are arrays whose combined members are objects with unique string
`id` values, it compares them as keyed arrays: a shared-ID relative-order
difference emits `<path>/order` first, then the union of IDs is visited in
before-then-after insertion order at `<path>/id:<escaped-id>`. Duplicate IDs on
either side disable keyed handling and the arrays are compared as a whole.
Other arrays are atomic values. Pointer segments escape `~` as `~0` and `/` as
`~1`; the root path is the empty string. Returned leaf values are detached
copies, not references into either input.

The focused predecessor test is
[`gate0.test.ts`](gate0.test.ts); independent hand-authored inputs and expected
records are in [`predecessor-cases.json`](predecessor-cases.json). The existing
broader consumer test remains at
`tests/domain-packs/schema-browser-embedding.test.ts`.

## Gate 0 capture

Capture host: Bun `1.4.3`; Node `v26.12.1` was present but not used. The
predecessor source is identified by the SHA-256 table below. Hashes are exact
file bytes at packet capture; a changed predecessor or fixture requires a new
reviewed capture. The focused command is:

```sh
bun test ./docs/helix/04-build/evidence/rust-migration/r7-schema-comparison/gate0.test.ts
```

This is not Rust parity, browser/WASM, native CLI, default-consumer, or R7
completion evidence. It provides the source and expected-outcome baseline for a
later Rust candidate. No comparison implementation is retired by Gate 0.

The refreshed focused Gate 0 run passed: 9 tests, 30 assertions. It covers the
hand-authored cases plus the NUL-joined keyed-order collision, before-first
refusal, detached array values, ordinary object traversal order, and the listed
`copyJson` refusal classes. The test does not run a Rust compiler, native CLI,
browser, or WASM build.

## Proposed future boundary and retirement gate

A Rust candidate should accept already-admitted core JSON values, return the
same ordered change records, use invocation-scoped work/depth/cancellation
controls, and avoid filesystem or DOM responsibilities. The candidate must
match every frozen successful output and first refusal, including exact paths
and values, before any browser activation. Required later evidence includes
no-default-features native CLI parity, Node/Bun and real Chromium WASM parity,
resource/cancellation controls, independent review, and a fresh recursively
closed R7 inventory. Only then may the browser consumer switch and the
TypeScript semantic function be retired after review.

## Source hashes

| File | SHA-256 |
| --- | --- |
| `docs/helix/05-deploy/schema-browser/components.ts` | `d876b45527bd3f24e9a621ea0c37cd2f525ee1a616480cab3b07161f13267167` |
| `src/model/json.ts` | `d0a06bd26beb215d262b92f5c47d5cea9e85291bb4a780f0aea98b8277c15f98` |
| `gate0.test.ts` | `2dc87aa3df001ae177cc327ee672d349b35ccdf3fb2fd7d04a9a18bccf81119d` |
| `predecessor-cases.json` | `966fc66cf657dc95415d5bacb3879eca7d64b7de258b5cf15cf057b5183ce2e5` |

## Opt-in schema-browser consumer qualification

The schema-browser production consumer now has a guarded opt-in build path.
With `UMF_SCHEMA_BROWSER_RUST_COMPARISON=1`, the build requires the pinned
`wasm-bindgen 0.2.100` package outputs and binary, copies the JS glue and WASM
asset beside both package entrypoints and under `assets/`, and appends ESM
top-level initialization before the public synchronous comparison API is
used. Initialization or missing-asset failures reject module loading; there
is no silent TypeScript fallback in an opt-in artifact. Without that opt-in,
the existing TypeScript predecessor remains active. This is a consumer/build
prototype and does not establish default cutover.

Real Chromium `153.0.8010.12` installed-package runs passed 22 checks for both
the default TypeScript artifact and opt-in Rust/WASM artifact. They include
all eight frozen fixture comparisons, keyed-order NUL collision, synchronous
renderer output and pointer, unknown large-number text preservation, and the
exact before-first `copyJson` refusal, in addition to existing isolated-frame,
offline-request and package-consumer checks. Opt-in build qualification used:

```sh
UMF_SCHEMA_BROWSER_RUST_COMPARISON=1 \
UMF_R7_WASM_BINDGEN_PKG=/private/tmp/r7-wasm-bindgen-pkg \
UMF_R7_WASM_BINDGEN_BIN=/private/tmp/wasm-bindgen-cli/bin/wasm-bindgen \
bun run build:schema-browser /private/tmp/r7-schema-browser-rust-optin
bun scripts/schema-browser-package-browser.ts /private/tmp/r7-schema-browser-rust-optin
bun scripts/schema-browser-package-browser.ts /private/tmp/r7-schema-browser-default
```

The negative build check with a valid bindgen binary and empty output package
failed explicitly with `Rust comparison build is missing wasm-bindgen output
/private/tmp/r7-empty-bindgen/umf_core_wasm.js`. `bun run typecheck`,
`git diff --check`, and the focused Gate 0 test (9 tests / 30 assertions) also
passed. The broader embedding test's generated-validator case could not write
its temporary file in the managed worktree (`EPERM`); its three other cases,
including structural comparison, passed.

Exact consumer/build/test source and opt-in artifact hashes at this evidence
capture:

| File | SHA-256 |
| --- | --- |
| `docs/helix/05-deploy/schema-browser/components.ts` | `c6d5f63be723eb045bfe3148cd7ae18b8fc29c8a5816f468e9240cda3b86819d` |
| `docs/helix/05-deploy/schema-browser/build.ts` | `56393ff935c09aaa7b8c3b2ce4047f804f3ff1445031cadcc697bbb0fd7b4a89` |
| `docs/helix/05-deploy/schema-browser/package.json` | `7033782aa4c38ae800914f926a3d989a54f3676759d5e92200ab51f06550d0e2` |
| `scripts/schema-browser-package-browser.ts` | `6fe026f091b10ce186e2e292d44d65b5d3e9fc9d39d8c2edbd9862ace7e04368` |
| Opt-in package `index.js` | `3aa4a41dfaf1e9b5f41c1b14d829a577d985b0f689817f3e051bc15df351fb17` |
| Opt-in package `umf_core_wasm.js` | `8a1b5dd6f45172e5947e678921209c33cb9a7d1a0236bab1c7aa9b76485ff303` |
| Opt-in package `umf_core_wasm_bg.wasm` | `95f391c1f3ed6b7ef9488f5699a64fa98879833d6f7de2a9278eaf519d3dd946` |
| Opt-in package `assets/explorer.js` | `16b475f8aee959f8f8b26ee6079eed1eb311ecd3bdddd917d7572a0a579b907a` |

The package JS/WASM asset hashes are identical under `assets/`. Default
cutover remains open for independent review and any wider host/UI acceptance
required by the migration plan; these checks qualify an opt-in installed
package only.

## Opt-in Rust candidate evidence

This section records implementation evidence for the resource-independent
`umf.schema-comparison/1` candidate. It does not activate the browser schema
viewer or retire the TypeScript predecessor.

The core operation lives in `crates/umf-core/src/structural_diff.rs`. It admits
bounded copies of both inputs, keeps ordered object members and UTF-16 strings,
meters structural equality, key and keyed-ID scans, pointer construction and
output copies, and uses fallible reservation for comparison-owned vectors.
It applies ECMAScript `Object.keys` ordering to canonical array-index keys
(ascending numeric order, followed by ordinary string keys in insertion order)
for traversal and detached output snapshots. Thus source order among numeric
keys is normalized as in the JavaScript predecessor; other member content and
ordinary-string-key order remain intact.
The wire operation in `umf-core-wire` accepts `{profile,before,after}` without
Engine resources or capabilities and returns the normal `umf.core-wire/1`
result envelope. Node and WASM expose dedicated `executeDocumentComparisonWire`
entrypoints. Public Node and WASM package constructors validate the profile,
snapshot before then after, decode ordered values, and return predecessor-shaped
plain change records. The WASM helper is source-pinned to the Node helper.

Focused implementation checks run on the current source cohort:

| Layer | Result |
| --- | --- |
| Core | Latest rerun: `cargo test -p umf-core --test structural_diff`: 13 passed; asserts complete ordered output for all 8 frozen fixture cases and covers ECMAScript numeric-key ordering in traversal and returned snapshots, predecessor NUL-join collision behavior, keyed arrays, duplicate IDs on either side, non-string/mixed-ID fallback, empty arrays, special keys, UTF-16 path units, depth/value limits, work refusal and cancellation. |
| Wire | `cargo test -p umf-core-wire document_comparison`: 3 passed; covers resource-free ordered success, profile/required-field refusal order, and host work refusal. |
| Adapter boundary | Latest rerun: Node helper and WASM public wrapper together 7 passed / 34 assertions, including per-call work budgets, repeated calls, and recovery after cancellation refusal. The Node tests import the frozen TypeScript `copyJson`; before refusal preserves `UmfError` `NON_JSON`, message and `/x` path, does not invoke the after getter, and never calls the native spy. |
| Installed-style Node/Bun package | The freshly built Node addon was placed in a temporary package copy. `document-comparison-native.mjs` passed under Node `v26.12.1` and Bun `1.4.3`; both emitted byte-identical JSON output (SHA-256 `ef966f47a25b751f8fc4ab8a7087bb0f51c9cf2ac03f16f3a4aefb431af98dad`). Metering, per-call max-work refusal/reuse, cancellation/recovery, callback failure, before-first snapshot refusal, and predecessor NUL-joined-order collision passed. |
| WASM package source | `bun scripts/rust-migration/r7/wasm-package-sources.ts --check` passed with the comparison adapter included. |
| Extracted WASM package | Fresh qualification passed for Node `v26.12.1`, Bun `1.4.3`, and real Chromium `153.0.8010.12`. The package was generated with Rust `1.90.0` target `wasm32-unknown-unknown` and `wasm-bindgen 0.2.100`; tarball SHA-256 is `7f854b3c0c9e5e96f15118960188a861ebac796907b16acd4b424fa162bdd040`. All three runtimes passed copy/round-trip checks, 389 Bit128 vectors, 50 field-value cases, all 8 frozen comparison outputs, zero NUL-collision order records, measured comparison work `1730`, and repeated per-call budget invocations. Cancellation refusal followed by same-engine recovery passed; a fixed host budget rejected a large comparison and then admitted a small comparison on that same engine. The matrix also checks depth refusal, before-first `NON_JSON:/x` with zero reads of the after-side getter, and fresh package-loader failure with a deleted/corrupt expected WASM asset, after which no comparison engine is made available. Chromium additionally runs with `process` and `Buffer` absent. |
| Package closure scanner | Uses the TypeScript AST to inventory static imports/re-exports and dynamic import calls. Qualification self-controls cover compact and same-line forms, re-exports, misleading import strings, literal imports, nonliteral variable/template imports (fail closed), external modules, package escapes, missing targets, and a valid in-package path. |

The native addon was compiled with Rust `1.90.0` for Darwin arm64 using
`CARGO_INCREMENTAL=0`, two Cargo jobs, and a temporary target directory. The
rebuilt addon SHA-256 is `13944a68000e156efbbbcec2ee57ebbfdadbee1b1b45b993c87aa1c27b7061ed`.
This establishes a local addon build, not a clean independent rebuild.

Exact principal source hashes for this candidate are:

| File | SHA-256 |
| --- | --- |
| `crates/umf-core/src/structural_diff.rs` | `c4e46bd2b56d3b596231c91d42ca3dbd5843d44ead3b4ab5e96ff89c824d141f` |
| `crates/umf-core/tests/structural_diff.rs` | `6baa2327d6c1856bc9b1be35132402985b65a10243cbbba0d44e18d09a0011c4` |
| `crates/umf-core-wire/src/lib.rs` | `64b67c80fece40250d5a7c04384449789c592896a7a93fb2364529f71a2ada3b` |
| `bindings/core/node/src/document-comparison.js` and `bindings/core/wasm/src/document-comparison.js` | `f1e68fde7c5b0db957e44b790abc3d3f74866f706ea96550a3591bca266fa4c4` |
| `bindings/core/node/tests/document-comparison-native.mjs` | `4bda154b5b203c3c02e280b0adcb454b33e23f66079885041e968822d174f7a5` |
| `bindings/core/wasm/src/shared-sources.json` | `ca01704cb416c2f95ad84b30716fc44dd1ab0e151b5501b9852ccc8a6ab2d2a0` |
| `bindings/core/node/index.js` / `bindings/core/node/index.d.ts` | `b1e95dc86cdbcc1d7d73d892681e7de91e7700191e88151dc6f74453c5c79e6e` / `7c5a8487e6a229676b81d80ef7ad6e7d1471d4a5df8f5a416f39443fd6aec008` |
| `bindings/core/wasm/index.js` / `bindings/core/wasm/index.d.ts` | `fa164fb1e33981e0a47f0e24d1f1184715c2dad10a9a9cf8d24d5cbae1e9ce93` / `9277401d1af02d3316abf4c3629bf3558f1f42478dc8cf60468e16f4188033e3` |
| Node and WASM wrapper tests | `tests/rust-migration/r7/document-comparison-wrapper.test.js`: `cf105b9b6c61359161c0c27f269c057b9a28f9de72f211ac5cc4bda1bd3ced82`; `bindings/core/wasm/tests/document-comparison-wrapper.test.js`: `b9452c1a46465e4ee30b4cb40647c31363836e1e77e4b2e77b4461d25a9b7a3c`. The Node differential refusal test lives outside the binding source tree so the import census sees no predecessor fallback inside bindings. |
| Node and WASM native exports | `d1bb546e0118611a4bf99ee2ee245fa34c252ac470efae4dba23c2de4539f158` / `d11931b28f2610fef360db0f77d63e9baaac70566cd4da79df369688a5afad6c` |
| WASM package qualification runtime / browser / qualifier / packer harness | `e3c0c5c98ff96f59fbdafff74b97b4444f7699a571d57828b72be8dd8a5e13af` / `96f1202e5f5c65dbfabe34c7de82a29b3a0621c4c6f1e0a8237b44f0d43bdec7` / `cb9509a827cea4b0f490d6d52dd5d7db4bc1568f26c87318dc81be612e401b32` / `168d7871f90826eb0ec2a0f2f183d427e23ad9e197085940fe674dd02956016c` |

The WASM target build, bindgen packaging, extracted-package Node/Bun execution,
and real Chromium qualification have passed for this candidate. The separate
opt-in schema-browser package renderer journey is qualified above. These are
candidate and opt-in results; default cutover remains open pending independent
review of the complete release matrix and the migration plan's remaining
consumer/authority gates. Independent source review found and closed the
per-invocation work-budget and NUL-joined keyed-order parity issues; the final
reviewed source cohort has no remaining R7 P1/P2 findings. Keep the Rust
operation opt-in until default cutover is explicitly reviewed.

## Full extracted-package refusal and frozen-output matrix

The qualification harness now copies the WASM package source to a temporary
workspace, runs `wasm-package-sources.ts --check` against the repository, adds
the exact bindgen outputs, and packs with Bun while preserving the package
manifest bytes. It extracts the resulting `.tgz` and points Node, Bun, and
Chromium only at that extracted package. This avoids modifying or deleting a
shared `bindings/core/wasm/pkg` directory during qualification.

The current full run passed with Node `v26.12.1`, Bun `1.4.3`, and Chrome for
Testing headless shell `153.0.8010.12`. The tarball is
`/var/folders/z0/kv_wlyps77b_txh08w55z99w0000gn/T/umf-r7-wasm-package-42eTiM/tarball/umf-core-rust-wasm-0.1.0.tgz`, SHA-256
`7f854b3c0c9e5e96f15118960188a861ebac796907b16acd4b424fa162bdd040`. Extracted
WASM JS and binary hashes remain `8a1b5dd6f45172e5947e678921209c33cb9a7d1a0236bab1c7aa9b76485ff303` and
`95f391c1f3ed6b7ef9488f5699a64fa98879833d6f7de2a9278eaf519d3dd946`.

| Runtime | Result |
| --- | --- |
| Node `v26.12.1` | Pass; all 8 frozen records, two repeated budget-limited calls, cancellation/refusal recovery, fixed-budget large-input refusal followed by same-engine small-input success, depth `RESOURCE_LIMIT`, exact `NON_JSON` before refusal with zero after getter reads. Fresh copies of the extracted package's actual bindgen glue reject when its sibling WASM file is deleted or replaced by invalid bytes; no comparison engine is created after either initialization refusal. |
| Bun `1.4.3` | Same matrix and result as Node. |
| Chromium `153.0.8010.12` | Same comparison/refusal matrix. A unique fresh bindgen module is initialized through the actual package URL loader against each asset variant; a missing asset returns 404, corrupted bytes return 200 as `application/wasm`, both reject module initialization, and comparison stays unavailable. Also confirms `process`/`Buffer` are absent. |

`bun run typecheck`, `git diff --check`, and
`bun scripts/rust-migration/r7/wasm-package-sources.ts --check` passed after
the matrix changes. These qualification runs do not select the opt-in browser
build by default.

The exact test-harness hashes for this run are:

| File | SHA-256 |
| --- | --- |
| `scripts/rust-migration/r7/wasm-package-qualification.ts` | `7117a37153f5e46fe054ad64d360d36745497354412cc06228999f1b1875bc65` |
| `scripts/rust-migration/r7/wasm-package-runtime.mjs` | `40815729ab914de5e29481e01a7ebacd955aaef43bb79534dd5a3b08ad2e2d50` |
| `scripts/rust-migration/r7/wasm-package-browser.ts` | `6792805b1f40fe5a176ea62e0ad5aa2cf17e7b2d03609316e50dac869f69a677` |

## Default schema-browser cutover candidate (2026-10-24)

This section supersedes the earlier opt-in browser-build description above.
The normal `bun run build:schema-browser <output-directory>` path now builds
the WASM comparison module from repository sources with the pinned toolchain,
then bundles it as mandatory package content. Production
`components.ts::compareDocuments` has no TypeScript semantic fallback or
optional route; the public API remains synchronous after its ESM module's
top-level-await initialization. Missing/corrupt runtime assets reject module
initialization. The predecessor remains only in the test oracle at
`predecessor-oracle.ts`.

The source-bound build completed twice into separate directories. Both
outputs had byte-identical `release-manifest.json`, `asset-manifest.json`,
`provenance.json`, and `SHA256SUMS`. The wrapper requires Bun 1.4.3, Rust
1.90.0 with the already-installed `wasm32-unknown-unknown` target, and
`wasm-bindgen 0.2.100` on `PATH`; it performs Cargo with `--offline`, uses two
jobs and a generated target directory, and does not install or download tools.
Removing the CLI from `PATH` fails before build output with an explicit
prerequisite error. Invoking the lower-level bundler without wrapper-produced
WASM fails before output replacement; a sentinel in an existing output
directory remained intact. Real browser package initialization separately
rejected a missing and a corrupt `.wasm` in fresh module instances.

The new package was packed and installed offline from its actual tarball, then
qualified in headless Chromium `153.0.8010.12`. All 30 checks passed, including
the eight frozen predecessor records, NUL-order collision, synchronous
comparison rendering, unknown large-integer content, before-first refusal,
actual missing/corrupt package loader rejection, two isolated frames,
standalone local-source rendering, and no undeclared network requests. Bun
`1.4.3` also imported the built API and synchronously compared values. The
package typechecked under both Bundler and NodeNext resolution. Runtime import
under Node `v26.12.1` is not supported by this browser package: the generated
web-target wasm-bindgen loader uses `fetch(file://...)`, which Node does not
implement. The package remains a browser API; Node's supported R7 runtime
matrix is the extracted core WASM package recorded above, not this browser
bundle.

`bun run typecheck`, Gate 0 (`9` tests / `30` assertions),
`bun scripts/rust-migration/r7/wasm-package-sources.ts --check`,
`bun run check:core-authority`, and `git diff --check` passed. The live
`check:rust-boundaries` census ran but stopped at the expected stale
metamodel-manifest digest; root will regenerate/pin the metamodel after source
stabilizes and rerun that gate. No generated metamodel files were changed here.

The actual package tarball SHA-256 is
`ab892a4ad80c4f6adf8a280850fe263652792056d913d04badc24e1f57a0ed9a`;
the build output `index.js` SHA-256 is
`84c8084278ac001ea1e0530621f15368c1bfe819a0dbd6dfb240dee3a0853331`,
`assets/explorer.js` is
`bd81e7795eb547e13ca1cc4b452a5687cea8e1448a390cf9636e57c633856cf8`, the
wasm-bindgen JS loader is
`8a1b5dd6f45172e5947e678921209c33cb9a7d1a0236bab1c7aa9b76485ff303`, and
the `.wasm` is
`1105f64d5b8269788393fae7e8071f9bc0f2c392bf6d9c6eed5ce19ff1c9632e`.
`provenance.json` revision is `7f9d2710506942b6cddbb2246dc2a4349b34238a`;
its input hashes include the wrapper (`5aa3f7cbadb836758467f1b1f395cf58814e696dcb38bcf127d9db1d877ba88c`), browser bundler (`7fd7b8524212c946dd04bddc1d80bb8c7dbe03ec0614b0c0650c3f58409ce6d8`), production consumer (`2fcf22b7fbb0c6fdae0136df0dbf400a187fca83001a21d6021736ecb4109ab1`), structural diff core (`c4e46bd2b56d3b596231c91d42ca3dbd5843d44ead3b4ab5e96ff89c824d141f`), WASM comparison adapter (`f1e68fde7c5b0db957e44b790abc3d3f74866f706ea96550a3591bca266fa4c4`), and Cargo lockfile (`82adcd46f08ad8e9589b3724e5a7a68efcb38c621092ace49dad0316ccbfeea4`).

This qualifies a default-cutover candidate for the schema-browser package and
consumer, not the broader R7 migration or full workspace. Independent review
of this final default source/build cohort and root's post-regeneration
authority/boundary gates remain required before release.

### Provenance closure review follow-up

The provenance input list now includes the complete local Cargo source
closure used by the WASM target: `umf-core-wasm`, `umf-core-wire`,
`umf-codegen`, `umf-core`, and vendored `saphyr-parser`. It hashes each local
crate manifest and every file under its `src/` tree, plus literal
`include_str!` and `include_bytes!` resources resolved relative to the Rust
source. This adds the previously omitted `umf-codegen` sources and the vendored
parser sources; the collector returned 155 local crate/resource paths, while
the final package provenance contains 1,368 total inputs.

`bun test tests/rust-migration/r7/schema-browser-provenance.test.ts` passed
2/2 tests (9 assertions). One test asserts the codegen runtime, parser and
included schema resources are present. A negative control substitutes altered
bytes for `crates/umf-codegen/src/lib.rs` through the same collector reader,
then verifies both the production provenance JSON hash and deterministic
release-manifest digest change. The control does not edit repository sources.

Two fresh source-bound builds after this change again produced identical
`release-manifest.json`, `asset-manifest.json`, `provenance.json`, and
`SHA256SUMS`. The first build's actual packed and offline-installed package
passed the same 30 Chromium checks. Final candidate npm tarball SHA-256 is
`067bfb01d6c83ad2ed906cf96b0de0571712b22d7f60bf2b4ad0fc418d583552`;
`provenance.json` SHA-256 is
`49bedae81f5df7d1c68be6e9d8e2236a8a81a004631f35b53afee2d75ba5de59`, and
`release-manifest.json` SHA-256 is
`77cd7031fbf1b2055e814bee5ffd78f167bbe47ed9c6c52ac200a0ff931269a4`.
The codegen library, codegen resource index, vendored parser source, and
included tables-operation schema are pinned in provenance as
`7aff17fc96ca5d6c156759132f3cd6eb27341a4bfcf0e50906d7acb9ef59f134`,
`ced1d618760796fb66a527a58592dc730c3176e4c87a70881c343a5be24f2c89`,
`e68710adf11a92c613c57458a151580bf807b01dd315baa4c311ac6668846f8c`, and
`af217abc87d2f4a5205d82c2146040ef986d29252c78a4ec76d59787828578cc`.
The collector source SHA-256 is
`beaa349c0a5c1b042ba0446b488aa1f99e2fcf20a6c00afd5b2bdf42da10db98`, its
control test is
`0edea080f9a2cb195f0e99154963b7899e9f6987e3abd87a38bfea6ff2b2a421`, and
the browser build source is
`f8a57c83d11ae4c7ab3b81e1301c02173004348640366f81a04ea9021967d02f`.
