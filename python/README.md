# Official UMF Python support

`umf-core` provides the `umf` import namespace for the current UMF language.
The authored `spec/metamodel/umf.yaml` generates the packaged JSON Schemas,
portable constraint programs and Python shape data. Pydantic provides access
models; it does not define a competing format. Consumer extensions and execution
policies remain in consumer repositories.

Historical Core 0.10.0 pure-Python wheel:

```sh
pip install https://github.com/DocumentDrivenDX/umf/releases/download/umf-v0.5.1/umf_core-0.10.0-py3-none-any.whl
```

The URL above is a historical artifact and does not identify the current native
runtime. Core 0.10.2 is published through the [GitHub release](https://github.com/DocumentDrivenDX/umf/releases/tag/python-v0.10.2)
and [PyPI](https://pypi.org/project/umf-core/0.10.2/). Its publication path is
configured and verified; its evidence does not qualify CPython 3.14. The
development source builds a platform-specific native Rust extension instead:

```sh
rustup toolchain install 1.90.0
pip install ./python
```

Building from a checkout or source distribution requires Cargo/Rust 1.90.0 and
the locked Cargo dependencies. An installed native wheel does not require Cargo,
Node, Bun or V8. Native import failures are explicit; there is no semantic
fallback. Pydantic remains the Python access-model dependency. This development
change does not publish or replace the release linked above.

The separately distributed experimental `umf_access` host adapter is not
required to read or validate UMF documents.

Development candidate distribution version `0.10.3` is distinct from the UMF document/core version
`0.10.0`. The existing `0.10.0` pure-Python wheel linked above is metadata-only
for native execution and does not provide the single-SET action runtime. The
source package now exposes `create_action_engine`, `prepare_single_set_action`,
`admit_generated_action_invocation`, and `admit_generated_record_values`; their
bounded admission profile is specified by
[CONTRACT-906](../docs/helix/02-design/contracts/CONTRACT-906-single-set-admission.md).
No installation URL for the `0.10.3` candidate native wheel is listed until its
platform-specific release assets are published and qualified.
The `0.10.3` package metadata admits Python `>=3.11,<3.15`, matching the
versioned Python 3.11–3.14 profiles; the native engine continues to refuse
unsupported future minors explicitly.

```python
from umf import read_document, validate_document, write_document

document = read_document('''
umf: "0.10.0"
id: orders
vocabularies: {}
modules: []
''', format="yaml")
result = validate_document(document)
assert result.valid and result.complete
# Unknown or unregistered extension meaning can instead make complete false.
text = write_document(document, format="yaml")
assert read_document(text, format="yaml").to_dict() == document.to_dict()
```

Use canonical camelCase property names when constructing models. `to_dict()`
preserves unknown content and field presence; `checked_copy()` revalidates
mutable model state. Current APIs accept core 0.10.0; retired core dispatch and
upgrade/rollback paths are removed. Structural checks and ordered core semantic
constraints use generated data through bounded generic interpreters. Installed
Python and TypeScript share 139 frozen conformance vectors; this is not a claim
of parity for every TypeScript adapter or native execution API.

Unknown vocabulary versions, labels and qualifiers remain serializable and
make interpretation incomplete. Consumers must refuse execution when their
binding cannot interpret required semantics. Exact numeric token carriers,
UUID/128-bit carriers, explicit null and omission retain their separate meanings.

Extensions register explicitly through `Registry` and `Extension` with exact
versions, permitted scopes, a JSON Schema and optional semantic callback.
Callbacks receive copies; schema references must be local. Documents never
authorize loading code or fetching schemas. `schema_validator()` is reusable
for consumer-owned schemas and honors their declared dialect.

The R2 Rust-backed production hosts and their resource controls are described in
[bindings/core/README.md](../bindings/core/README.md). Ordinary UMF values retain
the portable safe-number/UTF-16 profile. Standalone Python consumer-schema
validation uses a separate native Python value profile; exact tested runtime
versions and compatibility limits belong to the R2 qualification evidence.

The additive R3 compiler is available as `from umf.rust_codegen import CodegenEngine`.
Construct it with the nine explicit trusted resources described in the binding
README. Its snake_case convenience methods cover both generators, access diffing,
table deployment/migration compilation and verification, change discovery and
row-scope normalization. `call()` retains the complete semantic result envelope;
convenience methods raise `UmfCodegenError` for semantic failures. Cooperative
controls use the same operation context through admission, Rust and result copies.
The existing `umf_codegen` default CLI and its MiniRacer dependency remain until R4.

Run `python -m pytest python/tests` from the repository root. Build with
`uv build --project python`. The source distribution includes the current
generated resources and supports building a wheel without the repository.
Release checks install the actual wheel in an isolated environment, compare
its packaged resource bytes and replay the shared core conformance corpus.
