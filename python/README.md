# Official UMF Python support

`umf-core` provides the `umf` import namespace. The canonical JSON Schemas in
`spec/core` are packaged unchanged; Pydantic provides access models rather than
a competing definition of the format. Consumer extension schemas and execution
policies remain in consumer repositories.

Install from an UMF checkout with `pip install ./python`, or install a built
wheel. Released wheels and source distributions are pinned in GitHub releases; PyPI publication requires a matching trusted-publisher configuration for the repository workflow.

```python
from umf import Document, read_document, validate_document, write_document

document = Document.model_validate(
    {
        "umf": "0.8.0",
        "id": "orders",
        "vocabularies": {},
        "modules": [],
    }
)
result = validate_document(document)
assert result.valid and result.complete
assert read_document(write_document(document)).to_dict() == document.to_dict()
```

Use canonical camelCase property names when constructing models. `to_dict()`
preserves unknown content and field presence; `checked_copy()` revalidates
mutable model state. Core document versions 0.1.0–0.8.0 have packaged structural
schemas. Python semantic qualification currently covers identity, references,
recognized scalar/role labels and explicit extension registration. Facets, keys,
relationships and typed literal constraints are structurally checked and report
unchecked semantics. This package does not claim full JavaScript API parity.

Unknown registered versions and qualifiers remain serializable and make
`complete` false. A consumer must refuse execution when it needs semantics that
its own binding cannot interpret. Large integers and exact decimals use string
token carriers; ordinary numeric values follow the portable JSON profile.

Extensions register explicitly through `Registry` and `Extension` with exact
versions, permitted scopes, a JSON Schema and optional semantic callback.
Callbacks receive copies; schema references must be local. Documents never
authorize loading code or fetching schemas. `schema_validator()` is reusable
for consumer-owned schemas and honors their declared dialect.

Run `python -m pytest python/tests` from the repository root. Build with
`uv build --project python`. The source distribution includes the canonical
schemas and supports building a wheel without the repository. After the Bun
browser build, `bun scripts/python-conformance.ts <python executable>` checks
the shared qualified subset in Chromium and replays Python JSON/YAML output.
