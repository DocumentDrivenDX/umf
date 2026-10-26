---
ddx:
  id: umf.evidence.rust-migration.r8-python-current-source-installed-20261025
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
    - id: umf.evidence.rust-migration.r8-python-installed-replay-20261025
      kind: extends
    - id: umf.evidence.rust-migration.r8-metamodel-source-bootstrap
      kind: informed_by
    - id: ADR-006
      kind: informed_by
---

# R8 current-source Python installed closure replay — 2026-10-25

## Result

The current private source capture built all three Python source distributions
and wheels offline on macOS 27 arm64 with CPython 3.11.17. Each extracted
sdist also rebuilt its wheel offline. The codegen and access rebuilt wheels
were byte-identical; the core rebuild matched all non-native package payload
and metadata after excluding the `RECORD` index. Its separately compiled
native extension and CLI bytes differ, as expected for independent builds.

An isolated environment installed the three exact wheels and pinned Python
dependencies. With Node, Bun, Cargo and rustc absent from `PATH`, core import,
Python client generation, access catalog import and all four installed CLI
help commands passed. This is one macOS arm64 CPython 3.11 cohort. It does not
qualify the six-host release matrix, every Python API, or the full transitive
runtime closure.

## Captured source and fixed point

The captured source is based on worktree HEAD
`10aa5c41bf8825eed446bc0af9735853cf0b304b` plus its working-tree files. The
manifest covers 2,146 files and 137,446,837 bytes under `python/`, the Python,
Node and WASM bindings, `crates/`, `spec/`, the R4 build helpers, the root Cargo
inputs, and the access/conformance fixture inputs. Its canonical source SHA-256
is `890843d17e66e093cc7270a28244c1e072d87585b2331109af7621faa6928d16`; the
manifest file SHA-256 is
`8a8fd298edc8d08fecefc762060ac478b78db14d0327b4a18abbf181dbe40467`.
Per-file path, size and SHA-256 records matched after packaging and matched the
live worktree at the final check.

The capture explicitly contains all eight authored files under
`python/umf_access/src/umf_access/build/`. A negative control verified each
file in the access sdist and wheel. An earlier private attempt mistakenly
excluded every directory named `build` while capturing source; its incomplete
access wheel omitted these files and `umf-access --help` failed with
`ModuleNotFoundError: umf_access.build`. The failure was in that capture
procedure. The corrected full-source capture builds the access package without
a production packaging change. The failed cohort is retained at
`/private/tmp/umf-r8-python-closure-current-20261025/pre-fix-receipt.json`
(SHA-256 `40c19fec1c7c04c120a3c6dacca6f802f6cc6398e2f4f0e2538e81ab2735eb94`)
and is labeled there as an invalid source closure.

## Artifacts

All artifacts are retained under
`/private/tmp/umf-r8-python-closure-current-final-20261025/dist/` on the
build host. The complete private receipt is
`/private/tmp/umf-r8-python-closure-current-final-20261025/closure-receipt.json`
(SHA-256 `959b8bb1cde77da5238c9ea1c0c1f982eb14d6d65d2233e1055c37f1fc7eacc2`).

| Distribution | Source distribution SHA-256 | Wheel SHA-256 |
| --- | --- | --- |
| `umf-core` 0.11.0, `cp311-abi3-macosx_11_0_arm64` | `8481546189996d47c926cef859e73488db0c9d9e88a45c85f260389f8d64637b` | `eead9d19fc0faf2f1033c5f84b8adfc74c5ef2f7a2f10a899bfdb0d0a9a792b3` |
| `umf-codegen` 0.2.0, `py3-none-any` | `41562ca26b751e616b0706d2a9c5bac3ca7bb43a038c1c0ac217975260177e56` | `5295b68efaaf611661da45bd9400d725a9e42e29a96b3f79fb0fc69ff8fe292a` |
| `umf-access` 0.1.0.dev7, `py3-none-any` | `3a0cf5725591059829f8f1f9652cb020994b74fe647d39f2bf204998ddcf3a3b` | `a53b7f4a413736183f7aff94395af1abdfbebf142fd729442ad0276cab33bd28` |

The built metadata declares `umf-core`'s `pydantic>=2.11,<3` dependency and
the exact `umf-core==0.11.0` dependency from both codegen and access. The access
wheel additionally declares `pydantic>=2.13,<3` and
`typing-extensions>=4.16,<5`; `pglast==7.20` is its optional
`sql-containment` extra. ZIP scans found no `.js`, `.ts`, `.mjs`, `.cjs` or
`.wasm` members in any wheel. The core wheel contains the expected native
`umf/_rust_core.abi3.so` extension and `umf/_bin/umf` CLI; the other two wheels
contain no native binary.

## Reproduction and installed checks

The build environment used `build==1.3.0` and `hatchling==1.27.0` installed
from the pinned local wheelhouse at
`/private/tmp/umf-r8-python-closure-20261025/wheelhouse`. `CARGO_NET_OFFLINE=true`,
`UV_OFFLINE=1` and `PIP_NO_INDEX=1` were set. The core build used pinned Rust
1.90.0 through `/opt/homebrew/opt/rustup/bin/cargo`. From the captured source
root, the package commands used the private build interpreter and artifact
directories:

```sh
cd /private/tmp/umf-r8-python-closure-current-final-20261025/source
PATH=/opt/homebrew/opt/rustup/bin:/usr/bin:/bin:/usr/sbin:/sbin CARGO=/opt/homebrew/opt/rustup/bin/cargo CARGO_TARGET_DIR=/private/tmp/umf-r8-python-closure-current-final-20261025/cargo-target CARGO_NET_OFFLINE=true UV_OFFLINE=1 PIP_NO_INDEX=1 /private/tmp/umf-r8-python-closure-current-20261025/build-env/bin/python -m build --no-isolation --sdist --wheel --outdir /private/tmp/umf-r8-python-closure-current-final-20261025/dist/core /private/tmp/umf-r8-python-closure-current-final-20261025/source/python
UV_OFFLINE=1 PIP_NO_INDEX=1 /private/tmp/umf-r8-python-closure-current-20261025/build-env/bin/python -m build --no-isolation --sdist --wheel --outdir /private/tmp/umf-r8-python-closure-current-final-20261025/dist/codegen /private/tmp/umf-r8-python-closure-current-final-20261025/source/python/umf_codegen
UV_OFFLINE=1 PIP_NO_INDEX=1 /private/tmp/umf-r8-python-closure-current-20261025/build-env/bin/python -m build --no-isolation --sdist --wheel --outdir /private/tmp/umf-r8-python-closure-current-final-20261025/dist/access /private/tmp/umf-r8-python-closure-current-final-20261025/source/python/umf_access
```

The core wheel was rebuilt from its extracted sdist with a fresh private Cargo
target directory. The codegen and access wheels were rebuilt from their own
extracted sdists. Codegen and access matched their original wheel bytes
exactly. The core wheel's metadata and non-native payload matched; only its
native binaries and the resulting `RECORD` index differed.

The extracted wheel builds used the same private build interpreter. The core
rebuild set `CARGO_TARGET_DIR` to
`/private/tmp/umf-r8-python-closure-current-final-20261025/cargo-target-rebuild`
and set the same offline Cargo variables as the source build. The codegen and
access rebuild commands were:

```sh
UV_OFFLINE=1 PIP_NO_INDEX=1 /private/tmp/umf-r8-python-closure-current-20261025/build-env/bin/python -m build --no-isolation --wheel --outdir /private/tmp/umf-r8-python-closure-current-final-20261025/dist/rebuilt-codegen /private/tmp/umf-r8-python-closure-current-final-20261025/extracted/codegen/umf_codegen-0.2.0
UV_OFFLINE=1 PIP_NO_INDEX=1 /private/tmp/umf-r8-python-closure-current-20261025/build-env/bin/python -m build --no-isolation --wheel --outdir /private/tmp/umf-r8-python-closure-current-final-20261025/dist/rebuilt-access /private/tmp/umf-r8-python-closure-current-final-20261025/extracted/access/umf_access-0.1.0.dev7
```

The installed environment used the three exact wheels plus offline cached
dependencies: Pydantic 2.14.1, pydantic-core 2.50.1, typing-extensions 4.16.0,
typing-inspection 0.4.4 and annotated-types 0.8.0. `pip check` reported no
broken requirements. The smoke input was the captured
`tests/unified/commerce.json`, SHA-256
`19c018888066d391599d4bc8079ec8f3479266e6ecc55237c57825bc33c3003d`.
Installed `umf.current_core_version()` returned `0.10.0`, and
`umf_codegen.generate_python_client` generated seven files with source digest
`19c018888066d391599d4bc8079ec8f3479266e6ecc55237c57825bc33c3003d`.
`umf_access.build.catalog` imported successfully. `umf-codegen --help`,
`umf-access --help`, `umf-table --help` and `umf-sql-check --help` each exited
zero with Node, Bun, Cargo and rustc unavailable on `PATH`.

## Comparison with the 2026-10-25 installed evidence

The earlier private cohort in
[the installed replay](installed-replay-20261025.md) used source digest
`2f9e43c6169bb8c2a7b0c9e0017e6b5ccbc4aea4871b9931068acf17c6e6ee54`, 2,012
files and 73,575,167 bytes. This capture uses a newer source state with 2,146
files and 137,446,837 bytes, including the dedicated metamodel compiler
bootstrap and shared tagged-wire source. All three wheel hashes differ from
the prior cohort. The prior installed probe already passed its scoped
core/codegen generation and CLI checks; this replay adds the complete access
distribution closure check, all three extracted-sdist rebuilds, and the
current-source fixed point. Both records remain one-host evidence and leave
the six-host release matrix open.
