# Official UMF Python support

`umf-core` provides the `umf` import namespace. The current package version is `0.10.9`, and the document/core version is `0.10.0`. The authored metamodel generates packaged JSON Schemas and portable constraint data; Pydantic provides access models. Rust owns shared validation, registry semantics and the native adapter operations exposed through Python. Consumer extension definitions and execution policies remain in consumer repositories.

Install Core from PyPI with `python -m pip install 'umf-core==0.10.9'`. Install the matching pair from PyPI with `python -m pip install 'umf-codegen==0.10.9'`. Codegen requires exactly `umf-core==0.10.9`; the same [`umf_codegen-0.10.9-py3-none-any.whl`](https://github.com/DocumentDrivenDX/umf/releases/download/umf-v0.10.9/umf_codegen-0.10.9-py3-none-any.whl) is also included in the GitHub release.

Build the native Rust extension from source with Rust 1.90.0 and the locked Cargo dependencies:

```sh
rustup toolchain install 1.90.0
pip install ./python
python -m pytest python/tests
```

An installed native wheel does not require Cargo, Node, Bun or V8. Native import failures are explicit. Pydantic remains the Python access-model dependency. For packaging details and source-distribution checks, see `python/pyproject.toml` and the [native-host guide](../bindings/core/README.md).

The action admission API exposes `create_action_engine`, `prepare_single_set_action`, `admit_generated_action_invocation`, and `admit_generated_record_values`; see [CONTRACT-906](../docs/helix/02-design/contracts/CONTRACT-906-single-set-admission.md).

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
# Unknown or unregistered extension meaning can make completeness false.
text = write_document(document, format="yaml")
assert read_document(text, format="yaml").to_dict() == document.to_dict()
```

Unknown vocabulary versions, labels and qualifiers remain serializable and make interpretation incomplete. Consumers must refuse execution when their binding cannot interpret required semantics. Exact numeric token carriers, UUID/128-bit carriers, explicit null and omission retain their distinct meanings.

Extensions register explicitly through `Registry` and `Extension` with exact versions, permitted scopes, a JSON Schema and an optional semantic callback. Callbacks receive copies; schema references must be local. Documents do not authorize loading code or fetching schemas. `schema_validator()` is available for consumer-owned schemas and honors their declared dialect.

Shared adapter operations are available through `adapter_info()` and `execute_adapter()`:

```python
from umf import adapter_info, execute_adapter

operations = adapter_info("openapi")["operations"]
source_json = '{"openapi":"3.1.0","info":{"title":"Example","version":"1"},"paths":{}}'
document = execute_adapter(
    "openapi", "import", source=source_json, id="api", format="json"
)
restored = execute_adapter("openapi", "export", document=document, format="json")
```

Pass the adapter family and operation positionally. Calls accept `max_work`, `meter`, `is_cancelled`, `now` and `deadline_ms` controls. Typed convenience modules remain available.

The native PostgreSQL engine is available through the bundled parser:

```python
from umf import create_postgresql_sql_engine

engine = create_postgresql_sql_engine()
sql_document = engine.import_sql("SELECT 1 AS value", "query")
restored_sql = engine.export_sql(sql_document)
```

The Rust compiler is available as `from umf.rust_codegen import CodegenEngine`. The source distribution includes the generated resources and supports building a wheel without the repository. Release checks install the wheel in an isolated environment, compare packaged resource bytes and run ordinary public native workflows.

## Pack code generation

`from umf import generate_pack_tools` exposes the shared Rust pack compiler. Pass
a complete `umf.pack-tools/1` request containing the manifest text, all declared
schema sources, schema/package options and `ddl`, `orm`, `crud` targets. The result
contains generated files, exact source companions, diagnostics and per-source
coverage. Unkeyed tables receive DDL without invented ORM identities.

The paired `umf-codegen==0.10.9` wheel asset in the same GitHub release exposes
`umf_codegen.generate_pack_tools(request)`, using the native CLI bundled with
`umf-core==0.10.9`. Both packages are on PyPI, with the same archives retained in the GitHub release.
