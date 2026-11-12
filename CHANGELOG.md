# Changelog

Releases are cut by pushing a tag `umf-vX.Y.Z` (see AGENTS.md). Rust, SDK, `umf-core`, `umf-codegen` and
`umf-access` share one version. The UMF document format version (currently 0.10.0) is separate.
Earlier detail is in git history and on the GitHub Releases page.

## [0.10.12] - unreleased

- `umf-access` joins the unified release line: it now has the release version and depends on
  `umf-core>=0.10.12,<0.11` (it was `0.1.0.dev10`, pinned to an older core). It will be published to PyPI
  from the release workflow together with `umf-core` and `umf-codegen`.
- Releases run from GitHub Actions only: `release.yml` tests, builds wheels, sdists, SDK and CLI archives for
  Linux x86_64, Linux aarch64 and macOS arm64, smoke tests them in fresh environments, and publishes to PyPI
  with trusted publishing. Linux aarch64 is new in this release.
- Linux SDK/CLI/wheels are built in a manylinux_2_34 container.
- `scripts/set-version.py` moves all manifests to one version; `scripts/check-release-versions.py` gained
  `--access` and `--tag`.
- The microsite is built from source by `pages.yml` and stamped with the version; the README quickstart is
  executed in CI.
- Removed process material from the tree: committed evidence, receipts, built site output, release ceremony
  workflows, test plans and build plans (all remain in git history).

## [0.10.11] - 2026-11-11

- The Rust port is complete. Rust owns Lakeview dashboard projection, bulk action coordination and the
  remaining public SDK semantics; the browser runs the same code through WebAssembly. TypeScript provides
  host wrappers over the native Node/Bun addon and the browser WASM module.
- The pack generator produces SQL DDL, ORM models and CRUD actions from supported pack inputs. Keyless tables
  report the missing key and keep their DDL.
- Smithy preserves exact numeric tokens and refuses native assembly or export when an unknown dependency
  descriptor member would be lost.
- Assets: source, CLI archives and SDK archives for macOS arm64 and Linux x86_64, `umf-core` and
  `umf-codegen` wheels and sdists on the GitHub Release (PyPI: `umf-core` and `umf-codegen` 0.10.11).
- Known issues: 144 Bun test files fail after the Rust port and are quarantined in
  `scripts/known-failures.txt`; see that file for the reasons.

## [0.10.10] - 2026-11-11

- Fixed the default `@umf/core/runtime/wasm` initializer when Node resolves the packaged WASM module to a
  local file: the Node entry reads the file and initializes WASM from its bytes.

## [0.10.9] - 2026-11-10

- First release of the Rust engine, native CLI, Python packages, Node/Bun SDK and browser WASM runtime as one
  version cohort; pack generator for SQL DDL, SQLAlchemy models and CRUD actions.

## [0.10.8] - 2026-11-03

- Core and Codegen 0.10.8 (Python wheels, SDK, CLI, source) as one coupled release.

## [0.10.7] - 2026-11-04

- The pack generator is a public API in every host: `generatePackTools(request)` in `@umf/core`,
  `umf.generate_pack_tools(request)` / `umf_codegen.generate_pack_tools(request)` in Python, and
  `umf codegen pack-tools` in the CLI. A complete `umf.pack-tools/1` request produces PostgreSQL DDL,
  SQLAlchemy models, Python CRUD operations and a source companion.
- Corrected explicit Saga registry dispatch; aligned inventory UPDATE-column grants with deployment grants.
- The Python generator packages the complete ten-resource canonical inventory and verifies its hashes at build
  time and at runtime.

## Earlier

- 0.10.0 to 0.10.6: Rust workspace, native adapters, SDK and Python support, Actions and Saga vocabularies,
  unified generated Python access. UMF 0.10.0 is the current document and core format.
- SDK 0.3 to 0.5.x: browser-compatible TypeScript library, adapters (JSON Schema, Protobuf, Avro, Arrow,
  Parquet, OpenAPI, SQL), and the documentation microsite.
