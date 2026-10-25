---
ddx:
  id: umf.evidence.rust-migration.r8-python-cli-closure
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
    - id: TP-001
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-011
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-python-coordinated-release
      kind: references
---

# R8 Python, CLI, binding, and package route audit

This is a source audit of the shared UMF worktree, not a build or release
qualification. The tree was moving while this audit ran. The SHA-256 values
below pin the inspected bytes for this note; they do not identify a commit or
installed artifact. The migration plan's dated census and earlier hosted
receipts are not updated by this audit.

## Runtime route inventory

| Surface | Current source route | Runtime characterization | Evidence boundary |
|---|---|---|---|
| `umf-codegen` library | `python/umf_codegen/src/umf_codegen/__init__.py` delegates its seven public operations to `_native.execute`; `_native.py` checks the installed `umf-core==0.11.0`, ABI/protocol versions, and nine pinned compiler resources, then resolves only `umf/_bin/umf`. | The generator/deployment/migration/verification/change-discovery/row-scope compiler path is Rust CLI plus Rust wire admission. The compatibility `_embedded.py` only re-exports `_native`; its name does not load a JS payload. | Source inspection proves no V8 execution in this route. Current wheel/sdist behavior still needs a source-coherent installed pair. The package is POSIX-only (`_native.py` rejects non-POSIX); Windows pair use is explicitly unsupported by the current route. |
| `umf-codegen` command | `python -m umf_codegen` and console script `umf-codegen` use `__main__.py`, call the Rust-backed generator and the Python package writer's `generate`/read-only `check` behavior. | CLI frontend and filesystem writer remain Python; semantic compilation is delegated to Rust. | Existing tests and workflow define installed CLI checks, but this audit did not run them against a newly built wheel. |
| `umf-core` Python binding | `bindings/core/python/src/lib.rs` defines PyO3 `_rust_core`; `python/src/umf/_rust.py` fails import if the extension is missing, and routes copying/validation/compiler wire operations through it. `umf-core` wheel hook builds the native extension and bundled `umf` CLI. | Native API calls use Rust. Public Python models, compatibility surfaces, host admission/serialization, and parts of `umf_access` remain Python code; this audit does not establish all Python semantics as Rust-only. | A wheel from an extracted sdist must include every native `include_str!` input and build offline. This audit read the manifests and gates but did not build an artifact. |
| Rust CLI used by Python | `crates/umf-cli/src/main.rs` owns the `umf` executable and codegen operation dispatch; `_native.py` launches only the packaged `umf/_bin/umf`, never `PATH`. | The compiler process and semantic execution are Rust. The Python parent owns process lifetime, wire encoding/decoding, resource checks, deadline/cancellation transport, and CLI file generation/check. | Existing R4 workflow has empty-`PATH` CLI and isolated installed-wheel checks. The current source cohort has not been proven by those checks in this audit. |
| Node/Bun SDK default | `package.json` maps `.` to `dist/umf-node.js`/`dist/umf-browser.js`; `scripts/build.ts` invokes the Rust-default source builder, which builds `src/index-node-v4.ts` and `src/index-browser-v4.ts`. Those roots initialize Rust Node/WASM engines and replace selected exports while `export * from './index'` keeps the TypeScript reference surface available. | Default package is mixed: named V4 operations bind to Rust; inherited exports still include TypeScript executable behavior. The explicit `./reference` export points to the TypeScript bundle. This is not a complete TypeScript retirement. | Current source route selection is visible in source, but source changes to bindings and roots are in flight. No current archive is qualified here. The default qualification workflow is a private, nonpublishable archive gate. |
| Browser WASM | `src/index-browser-v4.ts` initializes the WASM core and binds Rust-selected operation families; `bindings/core/wasm/index.js` is transport/facade glue. | Rust owns the operations routed to its WASM bindings; JS/TS performs host adaptation, transport, API assembly, and retains unported operations. | A real Chromium replay is required by the SDK qualification workflow. Current-source Chromium result is outside this audit. |

## Packaging and host gates

The current coordinated Python workflow defines six cohorts: Ubuntu 24.04
x86_64 and macOS 15 arm64, each on CPython 3.11.17, 3.12.15, and 3.13.16,
with Rust 1.90.0. Each job builds both wheels and sdists, checks metadata,
verifies the core wheel and offline extracted-core-sdist rebuild, verifies the
installed pair and offline codegen-sdist rebuild, runs selected tests against
the installed pair, and uploads receipts. The aggregate gate requires all six
receipts from the same workflow run and source revision. The sibling
`r8-python-coordinated-release/README.md` records synthetic verifier tests and
older local checkpoints; it explicitly says the six real hosted artifacts
remain unrun. This audit found no six-cohort receipt set establishing the
current moving source.

The separate `access-boundaries.yml` R4 job has an older broader matrix and
builds the core and codegen packages from extracted sdists, runs offline CLI
and binary-closure checks, and performs installed codegen probes. It is useful
historical/source workflow coverage, not a substitute for a same-run current
six-cohort pair receipt. The current coordinated workflow is the release gate
for that pair.

The default Rust SDK workflow defines two native archive build hosts
(macOS 15 arm64 and Ubuntu 24.04 x86_64), pins Bun 1.4.3, Node 26.12.1, Rust
1.90.0, and wasm-bindgen 0.2.100, then requires a fixed-point private source
manifest and replays the installed archive in Node, Bun, and Chromium. Its
manifest and workflow intentionally mark output
`private-r7-default-route-qualification-not-publishable`. This is a
qualification target, not publishing evidence. The preview workflow is also
nonpublishing and uses a distinct Node 22 preview route; it does not qualify
the default archive.

The PyPI workflow is fail-closed and contains no publisher step. The coordinated
matrix workflow only uploads GitHub build artifacts. No package publication,
tag, registry hash, consumer installation, or rollback evidence is supplied
here. Windows and macOS x86_64 are outside the current six-cohort Python pair
matrix; the Python codegen bridge rejects non-POSIX. Their absence is a scoped
support limit, not a passing cohort.

## Priority-ranked actions

1. **Blocker — close the current source cohort before packaging.** Freeze Rust,
   bindings, Python manifests, and generated resource mirrors; run the
   metamodel/action-resource fixed-point checks; then build both Python
   sdists/wheels and prove extracted-sdist rebuilds. The recorded R8 Python
   packet says its prior final capture was rejected for source drift and a
   moving snapshot refused metamodel provenance. Do not reuse those local
   artifacts as current evidence.
2. **Blocker — execute the six hosted Python pair cohorts and aggregate.** Run
   `.github/workflows/python-coordinated-release.yml` at one frozen revision;
   preserve all six per-cohort receipts and the aggregate receipt. Gate tests
   alone do not qualify native wheels.
3. **Blocker — finish current SDK qualification and retirement accounting.**
   Run the private fixed-point default archive on both configured native
   hosts, confirm installed Node/Bun/Chromium replays, and recapture the R8
   source inventory after source pause. Keep all unselected TypeScript
   exports and the `./reference` surface as open retirement work.
4. **Before publication — add an explicitly reviewed publication job.** The
   existing PyPI job fails intentionally; the qualification matrix does not
   publish. A reviewed publication flow must consume the same-run aggregate
   receipt and verify registry bytes before any release claim.
5. **Support decision — define additional platform claims separately.** Add
   Windows/macOS x86_64 pair work only if those platforms are intended for
   support. The current bridge's POSIX guard means adding core wheels alone
   would not create a usable Python codegen pair.

## Source pins

The following SHA-256 values identify source files inspected for this note:

| File | SHA-256 |
|---|---|
| `docs/helix/04-build/rust-migration-plan.md` | `3ca361f9a030e65de4df463e0bf7be1f866f4e14a07438ca6d502080aa3eb7b9` |
| `.github/workflows/python-coordinated-release.yml` | `ba8f26ce011cbcbca5546951c475780d50a3759ff51b74efe92c1ee3083381ba` |
| `.github/workflows/pypi.yml` | `49ffa0afed27bd001439e036d7e0da1669b731ec241930b8420ef66d26f1a70e` |
| `.github/workflows/access-boundaries.yml` | `690f2212de4c0bdb198054cce224310593d1e9076602122a2864b839817a0a86` |
| `.github/workflows/rust-sdk-default-qualification.yml` | `876a7f0796518a9c4b2bc2026c9fa6e454a0422854f2b132a4b884ffce034ae4` |
| `tools/verify_python_artifacts.py` | `88e2439c1430f6f5d76582a1854f09469e92488e8ba3cde2df840bcd95b1d63a` |
| `tools/verify_python_release_pair.py` | `c8a2f2d83c7aee3e468271b038faf2ee6b0d522dd11b7731adc0fb3c7357558d` |
| `tools/verify_python_release_matrix.py` | `9cbc055e2c136321d37ffdb364f4071e044996350bff4b2cd578cd06f7f9cadd` |
| `tools/_python_sdist.py` | `9c45686a7b3527c4b7e01b4c49917af0a16d4c4af1b22037f43e401a47971d78` |
| `python/pyproject.toml` | `1ae5ca30e03601b94d6f61809b2f8020c945474492b713a6dfb4d141ba663726` |
| `python/hatch_build.py` | `dc297549fd91a05d5e0e6b6f7f1875d85dfd65c30b4e9a1c50b15bee6e84d598` |
| `python/umf_codegen/pyproject.toml` | `ba11f571ba9ba8b4a039c80a58d998f17993ecf66ad53db151da2abc507bff25` |
| `python/umf_codegen/src/umf_codegen/_native.py` | `6dffae8dc59d720713be61957d08fe53dcfb4ebcef4358e911a3e4ecb7648b67` |
| `python/umf_codegen/src/umf_codegen/__init__.py` | `887cd9fc14af208af821f1a5d72413b6a39dac827bcd944a3057ba86d65d5320` |
| `python/umf_codegen/src/umf_codegen/__main__.py` | `a839c18cc28fbce5498e88a10057c6422e4c293eb719f39a17ffa039769e33a6` |
| `python/umf_codegen/src/umf_codegen/_release.py` | `6101f95aed70d0e77bc6cc0c47da66726cd36219f0aab0a3ecd10ca44013ff25` |
| `python/umf_codegen/src/umf_codegen/_embedded.py` | `6ab305d65650b9fd6dd6614e684eb986036f1f7ba35058373e540298d2fbd449` |
| `python/src/umf/rust_codegen.py` | `5fe97f60cb87257245254e5240722b80ddeaa5fe67668a3df4fbf39f902b0927` |
| `python/src/umf/_rust.py` | `f3b573f016fe6c89ac0d45da62cc49f145ea08622d9244490411248dfbb9fddf` |
| `bindings/core/python/src/lib.rs` | `6782b1e95bf216bb81445827fbc56b88a16627be744b90a9cfb3d56159527940` |
| `crates/umf-cli/src/main.rs` | `8e9115a2e8bd2a08e8ee8a2c419cc1800cc82545c980d646ce176faaea714499` |
| `package.json` | `7c6685a6dc61669e6e8e6af120c137051b2988c0c8949290d500c8e00e4b59ba` |
| `scripts/build.ts` | `1f7f0c0a983dcf4629afb9f957379dbfcc23981eb2fa9c510734b12d94b85783` |
| `scripts/package-sdk-rust-default.ts` | `64212fd7c0d00123d34ab5b86046b9d78b7e656b39a041685cc96c96d81f5731` |
| `src/index-node-v4.ts` | `1050612322e5ba33a58add2f156762c2d01f8114dba6d410c28e009160881417` |
| `src/index-browser-v4.ts` | `ca52a58aa57b0ee8e45a0e403bc49c109aa1c302e30e50fb30d7ced96edfd084` |
| `bindings/core/node/index.js` | `24cfc9b2b6b3f5a372a7943d50ba4fa16b8c3c4acc9ad35c661f0baf598725f` |
| `bindings/core/wasm/index.js` | `3203422a117f51ebf33548019d772e3542e1149e037ee123755aedbb636775a8` |

No build, installed package replay, hosted job, or publication was run for this
audit. The source tree was moving, so the pins are a captured inspection cohort
only. This record does not establish release readiness.
