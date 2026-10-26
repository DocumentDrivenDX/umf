---
ddx:
  id: umf.evidence.rust-migration.r8-python-installed-replay-20261025
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-python-v8-closure-audit
      kind: references
    - id: ADR-006
      kind: informed_by
---

# R8 Python installed closure replay — 2026-10-25

## Result

The initial offline attempt stopped before packaging because the declared
Hatchling backend was absent from local caches. A follow-up fetched the pinned
backend into a private wheelhouse, then built all three source distributions
and wheels offline from the same captured source cohort. The bounded
installed core/codegen pair check and a three-package runtime probe passed on
macOS arm64 with CPython 3.11.17. The six-cohort hosted matrix and release
closure remain open.

The captured candidate source cohort is based on worktree HEAD
`c4afbf7cb5c0b581709230ebf6fd961fa6d7a6c3` plus its tracked and untracked
working-tree contents. The manifest covers 2,012 files and 73,575,167 bytes
under `python/`, `bindings/core/python/`, `crates/`, and `spec/`, plus root
Cargo/toolchain inputs. Its canonical SHA-256 is
`2f9e43c6169bb8c2a7b0c9e0017e6b5ccbc4aea4871b9931068acf17c6e6ee54`.
The manifest is retained privately at
`/private/tmp/umf-r8-python-closure-20261025/source-manifest.json` (file SHA-256
`3f6674eb8a8dbe9e444838ba7575e1406949893d4e541050f0dded1879a6741e`). A
second capture after the build attempts matched all 2,012 entries and the same
cohort digest.

The host interpreter is CPython 3.11.17. Its normal environment has pip and
setuptools, but no Pydantic, Hatchling, or `build`. The private preflight
wheelhouse at `/private/tmp/umf-embedder-preflight-cohort` does contain the
runtime dependencies; an isolated temporary environment installed Pydantic
2.14.1, pydantic-core 2.50.1, typing-extensions 4.16.0, typing-inspection
0.4.4, and annotated-types 0.8.0 offline. This establishes dependency
availability only.

The alternate local wheelhouse/cache check found no `hatchling-*.whl` in the
inspected project wheelhouses, the R4 artifact directories, or the local uv
tool/cache trees. The retained R4 artifacts are the UMF core/codegen wheels,
not build-backend wheels.

The source-tree `umf_codegen --help` command and the declared
`umf-access` catalog entry point's `--help` both returned zero in that
environment. They exercise argument parsing from `PYTHONPATH`; they do not
load an installed UMF wheel or invoke the Rust CLI. A source scan found no
`.js`, `.ts`, `.mjs`, `.cjs`, or `.wasm` file in the three Python package
source roots. That source observation remains separate from built distribution
closure.

## Initial blocked attempts

Each command used `UV_OFFLINE=1` and a cache rooted under
`/private/tmp/umf-r8-python-closure-20261025/`:

| Package | Result | Private log SHA-256 |
|---|---|---|
| `python/` (`umf-core`) | Exit 2; `hatchling>=1.27,<2` unavailable in cache | `4de3de566544d2440721179d421ceb1f3f85859e5433c1999ac3aa8db72f8d98` |
| `python/umf_codegen/` | Exit 2; `hatchling==1.27.0` unavailable in cache | `6ab14d31fcb9205e7a5bccdb80ebfb8da7e5ab2a86e3abfb35842bc7dd12c02e` |
| `python/umf_access/` | Exit 2; `hatchling==1.27.0` unavailable in cache | `5e74e50f143ffca63b3a6ef04718738ebafd730a2b10f3aba42b9523f5f89e5c` |

The source parser receipts are also private: codegen help log
`8e516b50716b9cb62693629937b1e6bd6dff34b61a8c28176f625165a61dbb90` and
access catalog help log
`f70161a4614fb4ff8bd9f4a40e2b2a5ca517c1c47701e7bca3df28d898213060`.
All logs and the temporary environment remain under
`/private/tmp/umf-r8-python-closure-20261025/`.

Historical R4 wheels and sdists were not reused: their source cohort predates
the captured files above.

## Offline build and installed follow-up

Pinned Hatchling 1.27.0 and its four declared dependencies were downloaded to
`/private/tmp/umf-r8-python-closure-20261025/wheelhouse`; the release
workflow's `build==1.3.0` frontend and its dependency were added there too.
The Hatchling wheel SHA-256 is
`d3a2f3567c4f926ea39849cdf924c7e99e6686c9c8e288ae1037c8fa2a5d937b`;
the `build` wheel SHA-256 is
`7145f0b5061ba90a1500d60bd1b13ca0a8a4cebdd0cc16ed8adf1c0e739f43b4`.
All subsequent sdist and wheel builds used `--offline --no-index` with that
private wheelhouse and Rust 1.90.0. The 2,012-file captured source manifest
still matched the worktree byte for byte after the builds.

| Distribution | Sdist SHA-256 | Wheel SHA-256 |
| --- | --- | --- |
| `umf-core` 0.11.0, `cp311-abi3-macosx_11_0_arm64` | `e89171448137c144881f72a7b84590e7df856de9e975a58f47d0759e4be196f8` | `653445e08b0d3be500d972ac7c229b022f87a7a7e160d617491dd298ac90840e` |
| `umf-codegen` 0.2.0, `py3-none-any` | `3aba01584618ce2402661cc64eaf0fbf76729dd7359d525bfe48b281610a70e5` | `ebf0a574df4931f10adb78ad4a0108d58a456f82e387c83aeb078e5df1319945` |
| `umf-access` 0.1.0.dev7, `py3-none-any` | `f1a78fa1d568d60a40718568de1e22468d8d92f3b96a361c544d4b9f420ff7fc` | `6d8c1131969ab710769ba7f1c37d312ca2e1e2b432cec1782fe0dbbe3a904c0e` |

The core artifact verifier receipt at
`/private/tmp/umf-r8-python-closure-20261025/core-receipt.json` (SHA-256
`12e2618aaaa286ad24817173f3fc7ea6c7287155da3530224dac185a401da638`)
passed exact source payload and independently rebuilt the extracted core
sdist. Non-native package payload, version, platform tag and METADATA bytes
matched; the separately compiled native binary bytes differed and are recorded
as such. The non-publishing core/codegen pair verifier receipt at
`/private/tmp/umf-r8-python-closure-20261025/pair-receipt.json` (SHA-256
`efa077d290b9dc716db42b52ec150e11f513fb3b88b965a62aea684e32c9bc69`)
passed its extracted codegen sdist rebuild with byte-identical wheel output,
exact core version dependency, isolated installed import/generation, and CLI
help. Its `sourceRevision` is `local-unpinned` and `workflowRun` is null: this
private worktree receipt is not a hosted release-matrix result.

A separate isolated environment installed all three exact wheels with cached
Python dependencies. With `node`, `bun`, `cargo` and `rustc` absent from PATH,
`umf.current_core_version()` returned `0.10.0`, and
`umf_codegen.generate_python_client` generated seven files from the checked-in
minimal document. Installed `umf-codegen`, `umf-table` and `umf-sql-check`
`--help` commands returned zero. Inspection of all three wheel ZIP member
lists found no `.js`, `.ts`, `.mjs`, `.cjs` or `.wasm` assets. The core wheel
contains `umf/_rust_core.abi3.so` and `umf/_bin/umf`; the other wheels contain
no native binary. This qualifies one macOS arm64 CPython 3.11 installed
operation subset without a JS toolchain in PATH, not every API or transitive
runtime dependency.

The six required Ubuntu/macOS × CPython 3.11/3.12/3.13 hosted cohorts,
complete access behavior, release archive selection and publication remain
open. The initial backend-resolution failure above was an environment gap,
now resolved only for this local private cohort.
