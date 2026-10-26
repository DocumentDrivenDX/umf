---
ddx:
  id: umf.evidence.rust-migration.r8-python-v8-closure-audit
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
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-011
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-python-cli-closure
      kind: references
---

# R8 Python package V8 closure audit

This is a bounded source and packaging audit of the current `umf-core`,
`umf_access`, and `umf_codegen` Python package trees. It does not qualify
installed wheels, release cohorts, or a complete Rust port. SHA-256 values
identify the inspected working-tree bytes, not a commit or built artifact.
The source was moving during inspection. The generated Python resource copies
and manifests below were refreshed after the metamodel fixed point; the other
listed source hashes stayed unchanged.

## Route inventory

| Package / executable | Default route and runtime dependencies | Rust boundary and remaining Python work |
|---|---|---|
| `umf-core` (`umf`) | Python package requires Python `>=3.11` and `pydantic>=2.11,<3`. Public imports expose Pydantic models and Python API/adaptation layers. `_rust.py` imports `umf._rust_core`; missing extension raises `ImportError` instead of switching to a Python semantic engine. The wheel build hook supplies the abi3 PyO3 extension and bundled `umf` CLI. | Rust is called by native APIs and compiler routes. Python still owns public models, host JSON/wire adaptation, resource bridging, and API composition. Its generated JSON schema/metamodel files are packaged data, not JS/V8 code. |
| `umf_codegen` (`umf-codegen`) | Requires Python `>=3.11,<3.15`, exact `umf-core==0.11.0`. Console script and `python -m umf_codegen` enter `__main__.py`; the Python CLI performs argument/file handling. Public operations call `_native.execute`, which validates versions/resources and starts only the installed `umf/_bin/umf` using `subprocess.Popen`. It has no `PATH` fallback and explicitly rejects non-POSIX. | Semantic compilation/verification dispatch is Rust CLI. Python owns the process/wire protocol, timeout/cleanup, filesystem operations and compatibility API. `_embedded.py` only re-exports `_native`; it contains no embedded JS. Nine pinned JSON resources are package data, not executable assets. |
| `umf_access` (`umf-access`, `umf-table`, `umf-sql-check`) | Requires Python `>=3.11,<3.15`, `umf-core==0.11.0`, Pydantic and typing-extensions. Entry points call Python modules: catalog generation, lifecycle operations, and SQL-containment checks. Optional `pglast` supports SQL parsing. | Selected catalog custody/rendering, related-key parsing and outcome-value crypto route into Rust through `umf`; lifecycle/build/query DSL, PostgreSQL integration, orchestration, and CLI host behavior remain Python. Several lifecycle operations call `umf_codegen`, which then routes semantic compilation to the Rust CLI. |

No `.js`, `.ts`, `.mjs`, `.cjs`, or `.wasm` file exists under the three
package source roots inspected. Package metadata declares no Node, Bun,
JavaScript, or V8 runtime dependency. This establishes source-level absence of
a JS runtime route in these Python packages; it does not prove runtime closure
of built distributions or every transitive dependency.

## Package inclusion rules

`python/pyproject.toml` builds only `src/umf` as the Python package. Its custom
Hatch hook builds native Rust artifacts for wheels, installs `_rust_core` and
the `umf` executable, and includes generated schema/metamodel JSON resources
plus the pinned action-runtime JSON copies. The sdist force-includes Rust
sources, binding sources, Rust manifests/lockfiles and canonical resource
inputs so an offline Rust build can produce those artifacts. The hook excludes
native binary outputs from the sdist. Thus an installed wheel is designed to
execute Rust without Cargo/Node/Bun/V8; a source build requires Rust tooling.

`python/umf_codegen/pyproject.toml` packages `src/umf_codegen` and declares
the `umf-codegen` console script. Its sdist includes package sources, metadata,
README, licenses and build hook. The hook synchronizes and checks the nine
manifest-pinned JSON resources. It does not embed JavaScript.

`python/umf_access/pyproject.toml` packages `src/umf_access`; its sdist
includes that package tree, metadata and licenses. Its three scripts are
Python entry points. The package has no JS runtime field or bundled JS asset.

## Bounded execution checks

The host has Python 3.9.6 as `python3`, below all package minimum versions.
`/Users/erik/.local/bin/python3.11` reports Python 3.11.17, but this
environment has no installed `pydantic` distribution. Under Python 3.11 with
the three source roots on `PYTHONPATH`, `python -m umf_codegen --help` passed
and printed the expected parser usage. This checks only the Python argument
parser; it does not invoke the Rust compiler. `python -m umf_access --help`
failed during package import with `ModuleNotFoundError: No module named
'pydantic'`. The `umf` import likewise cannot be exercised in this
environment. A local offline dependency install was unavailable, so no
package import/API operation, installed wheel, sdist rebuild, or Python-to-Rust
end-to-end call is claimed here.

## Remaining port and evidence blockers

The source audit finds no Node/Bun/V8 dependency in these Python package
routes. It does not close the broader plan requirement that shared executable
semantics be owned by Rust: `umf_access` still has material Python-owned DSL,
rendering, lifecycle and PostgreSQL host paths; the core Python public models
and host adaptation layers also remain Python. Their intended boundary must be
resolved against the plan/contracts before treating them as port obligations
or supported host-specific surface.

Current installed-package closure remains unverified here. The Python
coordinated wheel/sdist matrix, extracted-sdist rebuilds, and installed-pair
operations must provide same-source receipts. Existing
`r8-python-cli-closure` evidence is a separate source audit and does not turn
this note into an artifact qualification. No package was published and no
release claim follows.

## Inspected hashes

| File | SHA-256 |
|---|---|
| `python/pyproject.toml` | `e8ccdac61d89be7d91d258019fee1f120a42c52a9872e24b02fda76b90e15b49` |
| `python/hatch_build.py` | `fb81aedc5269778f6239a83fe87b024d341a4b89539a41eb2c01e41f67bd6660` |
| `python/src/umf/_rust.py` | `f3b573f016fe6c89ac0d45da62cc49f145ea08622d9244490411248dfbb9fddf` |
| `python/src/umf/generated_resources.py` | `9b473cf89f7d9ff5486d741282d590f5cc115e83b831d5b9090464e127e8e7f8` |
| `python/src/umf/action_runtime.py` | `ba3e8ebe46d748d0130709ec147b9543ba712086025d64c17b95493e7dd0e9af` |
| `python/src/umf/action_runtime_resource_manifest.json` | `064c4215c1c619f3503c196a0bb9a0ba2a71f4d2c34b7d36bbce3d9b0eb75b36` |
| `python/umf_access/pyproject.toml` | `3fd107c0ad3b89530dfa3156b6e21875f928e35e43796cfe9d9f647f7396658e` |
| `python/umf_access/src/umf_access/__init__.py` | `f644bef73ad6ad86d77a26cef93597e2d44204610f595d55b5f2cb51e701a5c9` |
| `python/umf_access/src/umf_access/build/catalog.py` | `cb2bd0b998cd151ef513acb040b2431b33976bc1d44902479e83b9f7f6154471` |
| `python/umf_access/src/umf_access/lifecycle/cli.py` | `b6c150517c2c90496c60c40d0b442f694305dd02c0fb3f3e5ffb1a210e1a516b` |
| `python/umf_access/src/umf_access/lifecycle/sql_containment_cli.py` | `d169146d0b21dc422ddc5660dae78371276ab0cec2b5825eee4012a749a6b276` |
| `python/umf_codegen/pyproject.toml` | `ba11f571ba9ba8b4a039c80a58d998f17993ecf66ad53db151da2abc507bff25` |
| `python/umf_codegen/src/umf_codegen/_native.py` | `6dffae8dc59d720713be61957d08fe53dcfb4ebcef4358e911a3e4ecb7648b67` |
| `python/umf_codegen/src/umf_codegen/__main__.py` | `a839c18cc28fbce5498e88a10057c6422e4c293eb719f39a17ffa039769e33a6` |
| `python/umf_codegen/src/umf_codegen/_resources/manifest.json` | `14619be938583f373cfb71c8e7efc13d1a4417e79f1752b408fa41f7aa3574f1` |
| `bindings/core/python/src/lib.rs` | `d59826d918e774b8346ea271b3ecf0ba2e38cddf1e0535755254e806e1f8713f` |
| `crates/umf-cli/src/main.rs` | `8e9115a2e8bd2a08e8ee8a2c419cc1800cc82545c980d646ce176faaea714499` |

The codegen resource manifest pins these nine JSON resources:

| Resource | SHA-256 |
|---|---|
| `actions.json` | `b77e7cee2ac6ad9d482122a63d0ab6044c341b2757135a0c896213c3fa596d62` |
| `binding.json` | `f3326533dcf3d2227955bae2261ab005eaf8692e289c7461f2015fd40565a78f` |
| `constraints.json` | `4399de83cdffc503b3729a3d3fed29b75bb2bea987edf833d1fda2698cd11fdf` |
| `domain-policy.json` | `c75441171ef9a746ca5fbdbcf2aba1548b95b58cd5c20fe60870607b6e59e185` |
| `package.schema.json` | `7bdb5bf9a432cfde0ca416235d081ea94fa0432da4c644a75d83ba737bdd29a7` |
| `reference.schema.json` | `3ec85c0d892d505d758ff82369f517db0a20fbc0987f28d505432a37933c12d5` |
| `schema.json` | `9060f66bba81dc7cefb20d6212251fa32a6e6c0499e73d0a2c258d79e2b8bcb4` |
| `stable-binding.json` | `0550ae86d0cf07f9e61fb78bbb3a2eeb370838681a1483b1088409ddaeb0631e` |
| `tables.json` | `beeb8749216b20d98211700c0a81cdd210b1eaea4060f7ae81b8a91f061da18d` |

The [CPython 3.13 successful-verifier follow-up](cpython-3.13-successful-verifiers-20261026.md)
now records successful installed `verify_table_deployment`, migration compilation,
and `verify_table_migration` calls with runtime tooling absent from `PATH`. It is
limited to the recorded Darwin arm64 wheel pair and does not establish ledger,
database or release qualification.
