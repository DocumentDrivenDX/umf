# Public-company integration feedback for shared loader 1.0.0

The companion is a checksum-pinned pre-release development snapshot from the shared loader worktree, not verified public deployment. Public-company intelligence adopts its finite SEC inventory, trusted exporter, structural admission and standalone replay. No alternative downloader is introduced. The source selection preceding this integration is not represented as a loader acquisition publication.

## Concrete inputs and outcomes

- Selected 25 issuers and 50 JSON API URLs: 25 submissions and 25 Company Facts. The full Company Facts responses total 118,710,284 bytes; submissions total 14,768,487 bytes (133,478,771 bytes combined). The largest single selected response remains below 10 MiB. The live inventory uses 10 MiB/item, 200 MiB/run, 50 documents, 1000 ms serial spacing, 30000 ms timeout and two retries.
- Scoped offline source projections occupy about 2 MiB. Exported CSV/source corpus is about 3 MiB before companion files. Submissions banks can exceed the browser native parser's 4,000,000-character and 100,000-value limits; full API acquisition must remain byte-preserving, with a bounded exact-token selection adapter before browser projection.
- JSON APIs returned HTTP 200 in the source-selection environment. Twenty-five selected `www.sec.gov/Archives/...` HTML primary-document requests returned HTTP 403. No narrative bytes were bundled. JSON API availability does not establish filing-document or Databricks egress availability.
- Inventory entries retain CIK, source kind, dated selected-universe provenance, source policy URL and the earlier full-response checksum. That checksum is documentary metadata: refresh may legitimately produce a different revision. The loader does not enforce it as an expected content pin.
- Fixed TableSpec ingestion creates a CSV ZIP with an external run descriptor `{origin:"external",source_policy:"redistribution"}`. The existing graph archive projector currently insists fixed external archives have no run descriptor and refuses this archive. Direct source-CSV graph projection succeeds, with 1629 objects/2843 edges; no native graph acceptance is claimed.

## Missing interfaces and improvements

1. Add an explicit, separately trusted publication-to-projection bridge. It should verify current-pointer/manifest/receipt/object hashes, select source IDs and revisions, retain exact raw JSON tokens, apply bounded concept/window filters, and author a new corpus revision. The original immutable acquisition publication must remain unchanged. Current CLI output is enough to inspect manually, but the domain builder does not consume a publication directly.
2. Clarify release/development identity. The canonical 1.0.0 runner changed during review; this integration refreshed pins from release.json. A published stable version must never silently change bytes. New corpus/runner/pack hashes require new loader state, which needs explicit operator documentation for scheduled upgrades.
3. Align contract invocation prose with replay. The contract says every flag, including `--inventory`, is mandatory; the operator guide and CLI correctly permit replay without it and refuse a different supplied inventory. Replay should require pack/state/mode/rights and use the retained inventory by default.
4. Keep provenance versus enforcement distinct for inventory checksum annotations. An optional verified expected-byte pin may help historical backfill, while refresh must preserve changed revisions. Do not treat the selected snapshot hash as proof that a new fetch returned the old bytes.
5. Retain the media/profile distinction: source metadata JSON is sufficient for this first screen; HTML/PDF narrative and exhibit parsing need their own evidence/coverage stage. HTTP 403 must remain a per-source failure, not an empty document or full-coverage success.

## Exercised integration

`tests/domain-packs/public-company-loader.test.ts` validates exact trusted export closure and the 50-URL inventory. It creates one publication using injected scoped JSON fixture transport and a synthetic test contact, confirms HTTP 403 refresh preserves the prior pointer, then executes the exported standalone runner from an unrelated working directory for real offline replay with no User-Agent and zero requests. This is actual CLI/replay evidence and injected acquisition behavior, not live SEC transport qualification. Final scoped results and runner pins live in `public-company-intelligence.md` and its JSON evidence record.

## Producer follow-up incorporated

The producer added checksum-pinned `read-publication.ts` to the canonical
five-artifact closure and optional enforced inventory `expected_sha256` pins.
Replay invocation prose is clarified. The integration test now executes the
exported reader against the actual retained fixture publication, checks exact
selected bytes/provenance and passes them to `projectSecSubmissions`. This
resolves the shared verified-publication reader gap; domain concept/window
selection and new fixed-corpus revision authoring remain explicit operations.
Earlier requested improvements above describe the feedback sent for inspection,
not unresolved absence of the new reader or enforced pin.

Final companion refresh: pinned the producer closure with the 500 MiB aggregate publication-copy guard and linear context deduplication. Focused integration/domain tests pass (8 tests, 167 assertions), both TypeScript configurations and browser build pass, and independent TableSpec/DuckDB archive validation again confirms 1,629 rows. Portable archive contains 89 byte-compared files. Live acquisition and deployment remain unverified here.
