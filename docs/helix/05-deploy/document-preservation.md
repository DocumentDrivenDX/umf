# Python document loading and preservation

TableSpec 0.0.9 is the primary executable runtime for document domain packs.
UMF publishes declarations, source schemas, selected originals and the historical
Bun companion 1.0.0 compatibility reference. No Bun process is required by Python.
The court and SEC demos are pack 1.0.1; legal-appellate and
public-company-intelligence 1.0.0 include preservation declarations and GUIDEs.

Use the [TableSpec document-loader guide](https://github.com/DocumentDrivenDX/tablespec/blob/main/docs/guide/document-loader.md)
for dependency pins, network-open fetching, offline publishing and scheduling.

```sh
tablespec document-loader fetch --pack pack.json --inventory inventory.json --output state --rights local-use
tablespec document-loader handoff --state state --output handoff
tablespec document-loader verify-handoff --fetched handoff
tablespec document-loader audit --state handoff
```

The [BagIt 1.0](https://www.rfc-editor.org/rfc/rfc8493.html) directory is a complete
SHA-256 transfer package. Original bytes, every retained revision, inventory,
pack closure and metadata form the payload. Payload and tag manifests also
protect `preservation.json` and `provenance.jsonld`.

[PREMIS Data Dictionary 3.0](https://www.loc.gov/standards/premis/v3/) informs
Objects, Events, Agents and Rights in a scoped semantic JSON mapping. It is not
PREMIS XML. Rights remain operator-supplied assertions subject to admission;
checksums do not establish authenticity or redistribution permission.
[PROV-O](https://www.w3.org/TR/prov-o/) links URL resources, observation-specific
copies, exact original revisions and metadata projections. Domain text, labels
and financial projections keep their existing separately qualified lineage;
this loader does not extract or reinterpret their content.

[OCFL 1.1](https://ocfl.io/1.1.0/spec/) is reserved for an optional durable archive
adapter. [WARC](https://www.loc.gov/preservation/digital/formats/fdd/fdd000236.shtml)
is reserved for optional HTTP-context capture. Neither is implemented or claimed.
Source collection, preservation transfer and downstream schemas remain separate
interfaces; native Spark/Unity Catalog and DuckDB sinks implement TableSpec's
publication interface. Snowflake remains separately qualified future work.
