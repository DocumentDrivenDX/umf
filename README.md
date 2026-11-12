# UMF

UMF is a machine-readable metamodel and schema interchange fabric for complex systems built over evolving,
partly understood data shapes. Reuse metadata for transforms, visualization, generators, forms, AI context and
documentation while preserving native meaning and making translation limits explicit. Native formats and
extensions retain their source and unknown content; cross-format projections report or refuse meaning they
cannot preserve.

A Rust workspace owns document validation, registry semantics, serialization, compiler operations and the
adapters (JSON Schema, Protobuf, Avro, Arrow, Parquet, OpenAPI, PostgreSQL SQL and more). The same Rust code
is exposed as a CLI, a Python extension, a Node/Bun addon and browser WASM. The document and core format
version is **0.10.0**; releases use their own `0.10.x` version. Status: experimental, the API may change.

## Install

Python (3.11 to 3.14; Linux x86_64 and aarch64, macOS arm64):

```sh
pip install umf-core umf-codegen umf-access
```

Node, Bun and browsers: download `umf-sdk-<version>-<platform>.tgz` from the
[latest release](https://github.com/DocumentDrivenDX/umf/releases/latest) (`linux-x86_64`, `linux-aarch64`,
`macos-aarch64`) and `npm install ./umf-sdk-*.tgz` (package name `@umf/core`).
CLI: the `umf-v<version>-<target>.tar.gz` archives on the same page. Rust: depend on this repository at a
release tag, for example `umf-core = { git = "https://github.com/DocumentDrivenDX/umf", tag = "umf-v<version>" }`.
Every release asset is listed in `SHA256SUMS` and carries a build-provenance attestation.

## Quickstart

Read, validate and write a document, import and export OpenAPI and PostgreSQL SQL. CI runs this exact block
(`scripts/smoke_quickstart.py`) against the built wheels of every release.

<!-- quickstart:start -->
```python
from umf import (
    adapter_info,
    create_postgresql_sql_engine,
    execute_adapter,
    read_document,
    validate_document,
    write_document,
)

# 1. Read, validate and write a UMF document.
document = read_document('''
umf: "0.10.0"
id: orders
vocabularies: {}
modules: []
''', format="yaml")
result = validate_document(document)
assert result.valid and result.complete
text = write_document(document, format="yaml")
assert read_document(text, format="yaml").to_dict() == document.to_dict()

# 2. Import an OpenAPI description as UMF and export it again.
assert adapter_info("openapi")["operations"]
source_json = '{"openapi":"3.1.0","info":{"title":"Example","version":"1"},"paths":{}}'
api = execute_adapter("openapi", "import", source=source_json, id="api", format="json")
restored = execute_adapter("openapi", "export", document=api, format="json")

# 3. Import PostgreSQL SQL as UMF and export it again.
engine = create_postgresql_sql_engine()
sql_document = engine.import_sql("SELECT 1 AS value", "query")
restored_sql = engine.export_sql(sql_document)
```
<!-- quickstart:end -->

More: [Python distribution](python/README.md), [Rust library and CLI](crates/README.md),
[native hosts](bindings/core/README.md), [Actions guide](docs/helix/04-build/guides/actions/index.md),
[documentation map](docs/helix/README.md), [changelog](CHANGELOG.md), [roadmap](ROADMAP.md).
The microsite is at <https://documentdrivendx.github.io/umf/>.

## Develop and test

Rust 1.90.0 (`rust-toolchain.toml`), Bun 1.4.3 and Python 3.11 or newer.

```sh
cargo test --locked                                  # Rust crates
pip install ./python pytest && python -m pytest python/tests
bun install --frozen-lockfile
cargo build -p umf-core-node --features native-postgresql   # the Node addon the Bun tests load
cp target/debug/libumf_core_node.* bindings/core/node/umf_core_node.node
bun scripts/run-tests.ts --keep-going --exclude-file scripts/slow-tests.txt --exclude-file scripts/known-failures.txt
```

CI (`.github/workflows/ci.yml`, Linux) runs all of this on every pull request; slow suites (WASM, SDK packaging,
browsers) run nightly. `scripts/known-failures.txt` lists the Bun tests that currently fail, with reasons.
Releases are tag-driven (`.github/workflows/release.yml`).

## License

First-party software is dual-licensed under MIT OR Apache-2.0, at your option. See [LICENSE.md](LICENSE.md).
Third-party materials retain their original notices.
