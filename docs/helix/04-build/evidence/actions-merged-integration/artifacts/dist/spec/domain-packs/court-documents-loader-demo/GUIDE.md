# court-documents-loader-demo usage


## Python loading and preservation

Install TableSpec 0.0.8 with the pinned dependencies documented in its
[document-loader guide](https://github.com/DocumentDrivenDX/tablespec/blob/main/docs/guide/document-loader.md).
Python executes the admitted inventory contract directly; the bundled Bun runner
is a compatibility reference and is not invoked by TableSpec.

```sh
tablespec document-loader fetch --pack pack.json --inventory inventory.json --output state --rights local-use
tablespec document-loader handoff --state state --output handoff
tablespec document-loader verify-handoff --fetched handoff
tablespec document-loader publish --fetched handoff --backend duckdb --target main.documents --database documents.duckdb --objects originals --mode merge
tablespec document-loader audit --state handoff
```

The handoff is a complete BagIt 1.0 directory with SHA-256 payload and tag
manifests. `preservation.json` maps PREMIS 3 objects, events, agents and inventory
rights; `provenance.jsonld` links acquisition observations and the metadata
projection to exact original revisions using PROV-O. This is a scoped semantic
mapping, not PREMIS XML. Original bytes remain authoritative; text, financial
observations and annotations retain their separately qualified derivations.
Offline publishing performs no source requests. Schedule `audit` to recheck
all retained revisions. Hashes verify fixity, not authenticity or legal rights.
OCFL storage and WARC HTTP capture are optional future adapters.

For Spark, name the exact Unity Catalog table and volume:

```sh
tablespec document-loader publish --fetched handoff --backend spark --target catalog.schema.documents --volume /Volumes/catalog/schema/originals/collection --mode merge
```

SEC acquisition requires `UMF_LOADER_USER_AGENT` with an identifying contact.
The demo inventories are empty until the operator selects sources. Existing
source pins and source-specific redistribution restrictions remain mandatory.
