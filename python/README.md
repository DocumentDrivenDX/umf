# Official UMF Python support

`umf-core` provides the `umf` import namespace for the current UMF language.
The authored `spec/metamodel/umf.yaml` generates the packaged JSON Schemas,
portable constraint programs and Python shape data. Pydantic provides access
models; it does not define a competing format. Consumer extensions and execution
policies remain in consumer repositories.

Build the native Rust extension from source:

```sh
rustup toolchain install 1.90.0
pip install ./python
```

Building from a checkout or source distribution requires Cargo/Rust 1.90.0 and
the locked Cargo dependencies. An installed native wheel does not require Cargo,
Node, Bun or V8. Native import failures are explicit; there is no semantic
fallback. Pydantic remains the Python access-model dependency.

The separately distributed experimental `umf_access` host adapter is not
required to read or validate UMF documents.

The current source distribution version is `0.10.4`; the UMF document/core
version is `0.10.0`. Package metadata admits Python `>=3.11,<3.15`. The native
engine refuses unsupported future minors explicitly.

The action admission API exposes `create_action_engine`,
`prepare_single_set_action`, `admit_generated_action_invocation`, and
`admit_generated_record_values`; see
[CONTRACT-906](../docs/helix/02-design/contracts/CONTRACT-906-single-set-admission.md).

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
mutable model state. Current APIs accept core 0.10.0. Structural checks and ordered core semantic
constraints use generated data through bounded generic interpreters. Python and TypeScript run the shared core conformance vectors.

Unknown vocabulary versions, labels and qualifiers remain serializable and
make interpretation incomplete. Consumers must refuse execution when their
binding cannot interpret required semantics. Exact numeric token carriers,
UUID/128-bit carriers, explicit null and omission retain their separate meanings.

Extensions register explicitly through `Registry` and `Extension` with exact
versions, permitted scopes, a JSON Schema and optional semantic callback.
Callbacks receive copies; schema references must be local. Documents never
authorize loading code or fetching schemas. `schema_validator()` is reusable
for consumer-owned schemas and honors their declared dialect.

The Rust-backed production hosts and their resource controls are described in
[bindings/core/README.md](../bindings/core/README.md). Ordinary UMF values retain
the portable safe-number/UTF-16 profile. Standalone Python consumer-schema
validation uses a separate native Python value profile.

Shared adapter operations are available through `adapter_info()` and
`execute_adapter()`. Rust supplies the available operation names and handles
validation, transformations and native import/export:

```python
from umf import adapter_info, execute_adapter

operations = adapter_info("openapi")["operations"]
source_json = '{"openapi":"3.1.0","info":{"title":"Example","version":"1"},"paths":{}}'
document = execute_adapter(
    "openapi", "import", source=source_json, id="api", format="json"
)
restored = execute_adapter("openapi", "export", document=document, format="json")
```

Request fields use the shared API's names. Calls accept `max_work`, `meter`,
`is_cancelled`, `now` and `deadline_ms` controls. Existing typed convenience
modules remain available.

The Rust compiler is available as `from umf.rust_codegen import CodegenEngine`.
Construct it with the nine explicit trusted resources described in the binding
README. Its snake_case convenience methods cover both generators, access diffing,
table deployment/migration compilation and verification, change discovery and
row-scope normalization. `call()` retains the complete semantic result envelope;
convenience methods raise `UmfCodegenError` for semantic failures. Cooperative
controls use the same operation context through admission, Rust and result copies.
The current `umf_codegen` source distribution and CLI dispatch through the
bundled Rust executable in the pinned `umf-core` wheel without MiniRacer.

Run `python -m pytest python/tests` from the repository root. Build with
`uv build --project python`. The source distribution includes the current
generated resources and supports building a wheel without the repository.
Release checks install the actual wheel in an isolated environment, compare
its packaged resource bytes and replay the shared core conformance corpus.
