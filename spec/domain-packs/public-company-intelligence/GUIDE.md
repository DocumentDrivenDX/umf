# Public-company intelligence

Version 1.0.0 is a fixed, offline SEC evidence corpus for public-company business-development research. It contains 25 explicitly selected issuers, 340 8-K/8-K/A filing records, 647 financial observations, two disclosed deal/exit item signals and two separately authored, unreviewed opportunity hypotheses. The filing-date window is 2025-10-01 through 2026-09-30. This is a selected research universe, with no S&P 500 membership claim.

## Use the pack

From the UMF repository root:

```sh
bun scripts/domain-packs/public-company.ts --check
bun scripts/export-domain-pack.ts --pack spec/domain-packs/public-company-intelligence/pack.json --output /tmp/public-company-pack --include-sources
bun docs/helix/05-deploy/microsite/build-explorer.ts
bun docs/helix/05-deploy/microsite/serve.ts
```

Open the explorer at `http://127.0.0.1:4178/explorer.html#schema=pack%3Apublic-company-intelligence%401.0.0`. It exposes the pack, all fourteen tables, ontology records/relationships and downloadable original manifest. This is schema inspection, not an admin application or lead-management UI.

TableSpec's explicit local consumer creates a source-preserving CSV ZIP:

```sh
python -m tablespec.cli sample-data ingest --pack spec/domain-packs/public-company-intelligence/pack.json --output /tmp/public-company-intelligence.zip
python scripts/domain-packs/verify-public-company.py --archive /tmp/public-company-intelligence.zip
```

Use a Python environment with TableSpec and DuckDB installed. Source policy remains the consumer's explicit decision; observed inputs must not be fabricated or replayed.

## Inventory

| Table | Rows | Meaning |
| --- | --- | --- |
| companies | 25 | SEC CIK identity and reported name |
| identifiers | 141 | Source-attributed CIK, ticker and exchange labels; no ticker-based identity merge |
| universes | 1 | Selected research universe and inclusive filing-date window |
| memberships | 25 | Authored selection, independently of index membership |
| source_snapshots | 100 | Fifty included scoped projections and fifty full-response reference pins |
| filings | 340 | Windowed recent-array 8-K/8-K/A metadata and exact row fragments |
| documents | 340 | Primary document references, with explicit retrieval status |
| financial_observations | 647 | Exact selected-concept tokens/context, filtered by filed date |
| business_events | 2 | Item 2.01 or 2.05 metadata assertions; event date remains unknown |
| signal_definitions | 1 | Versioned deterministic item screen |
| signal_observations | 2 | Screen results linked to events, rule and run |
| opportunity_hypotheses | 2 | Authored research prompts, unreviewed and without offering-specific fit |
| analysis_runs | 1 | Deterministic screen provenance; model and prompt are absent |
| evidence_links | 2 | Signal-to-filing/snapshot association and scoped native row locator |

All fourteen tables have TableSpec 1.0 schemas and a corresponding UMF core 0.8.0 ontology. Financial values are VARCHAR numeric tokens: no floating-point rounding, aggregation, ratio arithmetic or latest-fact deduplication. The ontology supplies schema relationships; it does not establish native graph storage, inference or enforcement.

## Sources and reproducibility

`source-selection.json` pins the selected bytes, source URLs, full-response SHA-256 hashes, original recent-row ordinal maps, selection rules and retrieval date. `sources/` contains exact-token JSON projections of selected source subtrees, **not complete original API responses**. Full responses remain remote reference declarations; their pins do not promise future availability. Numeric spelling and unknown content within the selected subtrees survive; unselected concepts/filings are outside this corpus.

The 25 issuer selections are Apple, Microsoft, Alphabet, Amazon, Meta, NVIDIA, JPMorgan Chase, Visa, Bank of America, Exxon Mobil, Chevron, Johnson & Johnson, Tesla, UnitedHealth, Procter & Gamble, Coca-Cola, Cisco, McDonald's, General Electric, Goldman Sachs, Citigroup, Berkshire Hathaway, Salesforce, American Express and Oracle. Names and aliases in the actual source snapshots remain authoritative; this list describes selection intent rather than entity-resolution equivalence.

Financial scope is `CashAndCashEquivalentsAtCarryingValue`, `LongTermDebtCurrent`, `LongTermDebtNoncurrent`, `Revenues` and `RevenueFromContractWithCustomerExcludingAssessedTax`, when present. These are independently retained concepts; revenue tags are not collapsed. Only observations filed within the window enter the table. Scoped JSON retains all dates for selected concepts. Company Facts represents entity-wide concepts and does not imply segment/custom-tag completeness. Recent submissions arrays may cover less than the window; older shards are retained references but were not fetched. Absence is not proof of no event.

SEC explicitly permits reuse of public EDGAR filing content in its [webmaster FAQ](https://www.sec.gov/about/webmaster-frequently-asked-questions). Company-authored filings are not described as government-authored works. Authored configuration/hypotheses are labeled separately; reuse declarations are source-specific. Collection must comply with the [SEC developer guidance](https://www.sec.gov/about/developer-resources), including a declared User-Agent and the shared ten-request-per-second maximum. Offline tests make no network calls.

## Evidence question and negative controls

The reviewed screen returns:

- Exxon Mobil CIK `0000034088`, accession `0001193125-26-291986`.
- Cisco CIK `0000858877`, accession `0000858877-26-000075`.

It matches exact comma-delimited 8-K items 2.01 (completion of acquisition/disposition) or 2.05 (exit/disposal costs). Earnings-only item 2.02 is excluded. The SQL in metadata is inert; tests execute a fixed, reviewed repository SELECT. Assertions say what filing metadata disclosed, without inferring transaction terms or demand for a service. Expected accessions are pinned separately in `scenarios/deal-signals.expected.json`.

## Availability and future consumers

Twenty-five selected original primary-document requests returned HTTP 403. Those references have `unavailable-http-403`; the other 315 were not requested. No HTML narrative, filing sections, exhibits, contract clauses or model-written briefs are bundled. The JSON APIs succeeded from the source-selection environment; this does not verify Databricks egress.

A downstream application may implement incremental remote collection, Databricks/Unity Catalog tables, typed research tools, a config/admin UI, evaluated model routing and a scheduled email digest. The pack grants none of those permissions and implements no deployed service. S&P licensing, GLEIF mappings, FTC/DOJ material, court corpora and CUAD/MAUD benchmark rights remain separate source-selection work. Private client/conflicts data and outreach are excluded.

Scoped build evidence: [public-company-intelligence](../../../docs/helix/04-build/evidence/public-company-intelligence.md).

## Shared acquisition companion

The pack includes the exact checksum-pinned `umf.document-loader` 1.0.0 closure
from CONTRACT-057. `README.md` contains its canonical operator guide; this
`GUIDE.md` describes the domain corpus. `inventory.json` explicitly selects the
50 full submissions/Company Facts API URLs with CIKs, dated selection, rights,
and original snapshot hashes. The inventory permits 200 MiB/run because the
full financial responses exceed the smaller offline pack export budget.

Use the trusted installed companion with an operator-supplied organization and
contact email in `UMF_LOADER_USER_AGENT`. From the repository root:

```sh
bun spec/domain-packs/public-company-intelligence/run.ts \
  --pack spec/domain-packs/public-company-intelligence/pack.json \
  --inventory spec/domain-packs/public-company-intelligence/inventory.json \
  --state /tmp/public-company-loader-state --mode backfill --rights redistribute
```

Refresh uses the same flags with `--mode refresh`; offline replay uses
`--mode replay` and omits `--inventory`. Serial spacing is at least one second;
aggregate SEC requests across state directories/machines need external coordination.
No real operator contact is embedded or invented for live runs. The source
selection performed before companion integration is not represented as a loader
publication. Integration tests use injected transport and a synthetic test contact.

The companion publishes immutable full-response bytes and revision-qualified
JSONL metadata. The existing offline builder consumes selected, reviewed source
files; `read-publication.ts` now exports verified selected originals and provenance
into a new input directory. Applying concept/window filters and authoring a
new fixed corpus revision remain explicit domain-adapter operations. A refresh must not silently overwrite fixed 1.0.0 pins.
The standalone CLI receives real offline replay coverage after a fixture-backed
publication; live SEC acquisition through this companion is unrun.

Select a retained publication revision before projecting it:

```sh
bun spec/domain-packs/public-company-intelligence/read-publication.ts \
  --state /tmp/public-company-loader-state --selection /tmp/selected-sources.json \
  --output /tmp/new-public-company-inputs
```

The selection file is an array of `{id, revision?}` objects. The reader verifies
publication, receipt, inventory, projection and historical object hashes and
retains rights/provenance. Optional inventory `expected_sha256` enforces an
exact response pin during acquisition; hashes inside metadata remain documentary.
Integration coverage feeds selected bytes into the public-company projector.


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
