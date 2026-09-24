# LinkML native evidence

Public adapters run as browser JavaScript. The isolated Python oracle uses the generated model
classes from the pinned linkml-model release and its declared linkml-runtime 1.11.0rc2 dependency.
The loader does not resolve imports; native outcomes do not imply instance validation or generators.

```sh
uv venv .cache/linkml-venv --python python3
uv pip install --python .cache/linkml-venv/bin/python -r native/linkml/oracle-requirements.txt
python3 scripts/linkml-sources.py
bun scripts/linkml-schema.ts
bun scripts/linkml-roundtrip.ts
.cache/linkml-venv/bin/python scripts/linkml-oracle.py
bun test tests/linkml/linkml.test.ts
UMF_CHROMIUM_PATH=/home/erik/.local/bin/chromium bun scripts/linkml-browser.ts
```

The collector verifies immutable release commit 051e945bb8d64ffd60639c666615ace88d561e2f and
copies its generated classes, metamodel source/JSON Schemas, ten example schemas and license.
An authored people schema adds inheritance, mixins, identifiers, enums and recursion. Every
source and candidate passes the pinned JSON Schema. Native loading rejects native-array-1's
structured annotation; type-mappings normalization converts mappings to strings that fail the
schema. These expected disagreements are asserted and recorded, never used to overwrite source.


The metamodel itself supplies a second corpus:

```sh
bun scripts/linkml-roundtrip.ts --metamodel
.cache/linkml-venv/bin/python scripts/linkml-oracle.py --metamodel
UMF_CHROMIUM_PATH=/home/erik/.local/bin/chromium bun scripts/linkml-browser.ts --metamodel
```

All ten native source schemas load; types.yaml's scalar notes fail raw JSON Schema and become
arrays in native normalization. Exact underscored integer limits use LinkML's explicit YAML 1.1
profile. Date-only values project to lexical strings in JSON with source spelling archived;
general timestamps remain unsupported. Refresh both corpora after scalar-profile changes.

Explicit supplied import contexts:

```sh
bun scripts/linkml-import-schema.ts
bun scripts/linkml-imports.ts
.cache/linkml-venv/bin/python scripts/linkml-import-oracle.py
bun test tests/linkml/imports.test.ts
UMF_CHROMIUM_PATH=/home/erik/.local/bin/chromium bun scripts/linkml-import-browser.ts
```

These four authored graphs compare reachable sets under supplied bindings. Native retrieval is
guarded; no URI resolution or merge behavior is tested. Importer-scoped aliases have browser/Bun
evidence only because the native global preload map cannot represent that context.

Document-local class-slot membership:

```sh
bun scripts/linkml-class-slots-schema.ts
bun scripts/linkml-class-slots.ts
.cache/linkml-venv/bin/python scripts/linkml-class-slots-oracle.py
bun test tests/linkml/class-slots.test.ts
UMF_CHROMIUM_PATH=/home/erik/.local/bin/chromium bun scripts/linkml-class-slots-browser.ts
```

The corpus covers every class in the pinned example/metamodel directories and two authored
sources. Of 208 reports, 206 compare with native methods using imports=False; two belong to the
known native loader rejection. Slot membership is separate from induced slot values and import merges.

Scalar effective slot values:

```sh
bun scripts/linkml-slot-values-schema.ts
bun scripts/linkml-slot-values.ts
.cache/linkml-venv/bin/python scripts/linkml-slot-values-oracle.py
bun test tests/linkml/slot-values.test.ts
UMF_CHROMIUM_PATH=/home/erik/.local/bin/chromium bun scripts/linkml-slot-values-browser.ts
```

Fifty-four reports compare 29 explicit scalar fields with native induction. Original declarations,
unprojected metadata and assignment provenance remain separate. Source fixtures cover large exact
integer bounds; separate extreme-exponent tests exercise UMF arithmetic without a native claim.

Upstream local scalar induction audit:

```sh
.cache/linkml-venv/bin/python scripts/linkml-slot-corpus-oracle.py
bun scripts/linkml-slot-corpus.ts
bun test tests/linkml/slot-corpus.test.ts
UMF_CHROMIUM_PATH=/home/erik/.local/bin/chromium bun scripts/linkml-slot-corpus-browser.ts
```

This enumerates all local class-slot queries from the twenty-source membership corpus. Native
imports are explicitly detached from a private normalized copy and retrieval is guarded. The
310 successful projections and 37 matching failures are local evidence; the known loader-rejected
source remains separate. Each Bun/browser run recovers all sources through both UMF formats and
runs 347 queries on one reconstructed document per source. Fixtures record this scope explicitly.

Explicit import merge proposals:

```sh
bun scripts/linkml-merge-schema.ts
bun scripts/linkml-merge.ts
.cache/linkml-venv/bin/python scripts/linkml-merge-oracle.py
bun test tests/linkml/merge.test.ts
UMF_CHROMIUM_PATH=/home/erik/.local/bin/chromium bun scripts/linkml-merge-browser.ts
```

Select view or merge-imports explicitly: their collision policies differ. The native oracle checks
whole normalized candidates, including injected from_schema, for diamond and cyclic graphs. Scoped
aliases remain non-comparable through the native preload map. Original metadata and losing declarations
remain in report context; a candidate native export alone does not contain that full context.

Full metamodel import-merge corpus:

```sh
bun scripts/linkml-metamodel-merge.ts
.cache/linkml-venv/bin/python scripts/linkml-metamodel-merge-oracle.py
bun test tests/linkml/metamodel-merge.test.ts
UMF_CHROMIUM_PATH=/home/erik/.local/bin/chromium bun scripts/linkml-metamodel-merge-browser.ts
```

All ten metamodel sources act as entries under both policies. Twenty candidates match complete
normalized native models. Every raw candidate still carries seventeen types.yaml scalar-notes
schema errors; normalization makes each model schema-valid. Source, candidate and normalized
outcomes remain distinct. Native retrieval is guarded, with all dependencies explicitly preloaded.
