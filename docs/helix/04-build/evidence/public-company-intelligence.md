# Public-company intelligence 1.0.0 execution evidence

Executed 2026-10-09 under FEAT-027 / US-078 / TD-078 / STP-078 and CONTRACT-059. CONTRACT-052/053 own portable pack semantics; shared CONTRACT-057 owns the adopted acquisition companion. The domain profile was deliberately assigned CONTRACT-059 after discovering the shared loader already used CONTRACT-057. No existing published contract was silently repurposed.

## Delivered subset

25 selected SEC issuer identities; 340 windowed 8-K/8-K/A metadata records; 647 exact selected-concept financial observations; fourteen TableSpec 1.0 tables and one UMF core 0.8.0 ontology; 1629 total rows; two item-metadata event/signal results with separately authored, unreviewed opportunity hypotheses. Fifty scoped JSON files and fifty full-response reference pins retain lineage. The inclusive filing-date window is 2025-10-01 through 2026-09-30. No authoritative S&P membership is asserted.

The scoped-source build is offline and deterministic. The explorer discovers this pack without a pack-specific UI. Shared finite acquisition/refresh/replay code is exported with the exact canonical development release closure; no alternate downloader is added. The companion is pre-release pending its producer's final review, not verified public deployment.

## Executed gates

| Gate | Result and exact scope |
| --- | --- |
| Focused domain/loader tests | 8 tests, 167 assertions, zero failures after final companion pin refresh |
| Domain-pack regression | 55 tests across 13 files, 2567 assertions, zero failures; existing legal/medical/catalog/export/download/ontology behavior included |
| TypeScript | Both repository/library and tooling configurations pass |
| Browser library build | Browser ESM and declarations emitted; Bun-only acquisition code remains host-side |
| Package/schema audit | 62/62 extension packages and 357/357 JSON schemas pass |
| Offline rebuild | `bun scripts/domain-packs/public-company.ts --check` passes, source pins verified and generated artifacts byte-identical |
| Source/companion export | 15 schemas, 88 canonical artifacts including exact loader closure and selected source files; check mode passes; corrupt hashes, uncleared source rights refuse |
| TableSpec fixed ingestion | TableSpec `0.0.6.post6.dev0+d2ee70a`, Python 3.12.15: all 14 tables ingest with zero null, uniqueness or FK violations; no observed replay |
| Independent archive/engine | DuckDB 1.5.0 verifies all 1629 cells/rows, original scoped source and schema bytes, nullable states, Decimal equality and every FK; reviewed two-accession query passes |
| Actual Chromium | Chromium 153.0.8010.12: 8 local library checks plus pack manifest download, table navigation and ontology navigation; zero page errors; no Bun/process browser globals |
| Shared loader integration | Exact installed closure export; 50-URL dated SEC inventory; injected one-item acquisition; HTTP 403 refresh preserves prior pointer; actual exported standalone CLI replay from unrelated cwd with no User-Agent and zero requests |
| Portable pack ZIP | 89 files: 88 canonical export artifacts plus supplemental GUIDE.md; every archived byte compared with exported input and all companion hashes checked |
| Graph candidate | Direct pinned-source projection produces 1629 objects/2843 edges in a temporary candidate; not shipped as a native graph artifact |

Runtime Bun is 1.4.2. The shared bundled companion declares its compiler as Bun 1.3.14. Exact file fingerprints, archive hashes and final source revision live in [public-company-intelligence.json](public-company-intelligence.json). The domain-pack regression is a scoped regression, not whole-repository release acceptance.

## Reproduction

From the UMF checkout:

```sh
bun test tests/domain-packs
bun run typecheck
bun run test:schemas
bun scripts/domain-packs/public-company.ts --check
bun scripts/export-domain-pack.ts --pack spec/domain-packs/public-company-intelligence/pack.json --output /tmp/public-company-export --include-sources
bun run build
bun docs/helix/05-deploy/microsite/build-explorer.ts
bun scripts/public-company-browser.ts
python -m tablespec.cli sample-data ingest --pack spec/domain-packs/public-company-intelligence/pack.json --output /tmp/public-company.csv.zip
python scripts/domain-packs/verify-public-company.py --archive /tmp/public-company.csv.zip
```

The Python commands require TableSpec/DuckDB. The companion's canonical README and the domain [GUIDE](../../../../spec/domain-packs/public-company-intelligence/GUIDE.md) explain explicit live installation/use. No credentials or real operator contact is embedded in the pack. Its live inventory is configuration, not permission to fetch.

## Attempts, corrections and limitations

- Initial dependency installation was absent; the frozen repository lockfile installed successfully. Sandbox DNS initially failed; authorized public source collection then succeeded outside the restricted network environment. This is machine-specific egress evidence.
- JSON API source selection acquired 25 submissions and 25 Company Facts responses: 133,478,771 bytes combined. Full bank submissions exceeded native browser parser budgets. A bounded exact-numeric-token selection produced about 2 MiB of local scoped source JSON. Complete response hashes and original row ordinal maps remain explicit; complete original responses are not bundled.
- Twenty-five selected primary-document requests returned HTTP 403. Those document records are unavailable; the other 315 documents were not requested. No original HTML/PDF, sections, exhibits, contract-term extraction, narrative event dates or native document citations are claimed.
- The historical shared graph archive projector rejected the current TableSpec external run descriptor. Source-CSV projection succeeds, but archive-to-graph compatibility remains unqualified; source projections are not native graph backend acceptance.
- An integration attempt initially omitted the shared `loader-inventory.ts` dependency; adding that exact shared module resolved the test import failure. The shared producer subsequently regenerated its runner after review; final pins were refreshed and focused/exported CLI/browser checks rerun.
- The first local browser-server attempt hit sandbox listen restrictions; the authorized local server/Chromium run passes.
- Full financial responses remain reference-only; selected tags preserve all their native observations in scoped JSON, while tabular output is filtered by filed date. Periods, tags, units and duplicate/restated observations remain separate. Recent-array coverage is not exhaustive historical filing coverage.
- Generated signals are filing-item metadata observations; hypotheses are authored prompts for human research, not model judgments, confirmed needs, rankings or calibrated probabilities. No model benchmark, live Databricks/Unity Catalog, config/admin application, scheduler/email, private client/conflicts join or outreach was executed.
- The shared companion has no automatic publication-to-scoped-corpus adapter. Refresh does not silently replace fixed pack pins. [Integration feedback](public-company-loader-integration.md) records precise source size/media/state/receipt considerations and the missing bridge for the producer to inspect.

## Deliverables

- [Portable pack, sources and pre-release loader ZIP](../../../../fixtures/domain-packs/public-company-intelligence-pack-1.0.0.zip).
- [TableSpec dataset ZIP](../../../../fixtures/domain-packs/public-company-intelligence-1.0.0.zip). This is an ingestion archive; it retains loader metadata but is not the companion installer.
- [Domain guide](../../../../spec/domain-packs/public-company-intelligence/GUIDE.md), canonical pack, schemas, ontology, source declarations, scenario expectations and governed documentation.

No deployment, commit, push, merge or production schema mutation was performed.

## Shared publication-reader update

The final canonical development closure now includes five artifacts, adding
`read-publication.ts` and optional enforced source checksum pins. Focused tests
exercise its exported standalone CLI, exact retained bytes and handoff into
the domain projector. The updated archive/evidence fingerprints supersede the
earlier companion snapshot. The 55-test broader regression above qualifies
the prior companion snapshot; fresh focused checks and typecheck qualify this
reader update. Original narrative availability and live-consumer limitations
remain unchanged.

Final companion refresh: pinned the producer closure with the 500 MiB aggregate publication-copy guard and linear context deduplication. Focused integration/domain tests pass (8 tests, 167 assertions), both TypeScript configurations and browser build pass, and independent TableSpec/DuckDB archive validation again confirms 1,629 rows. Portable archive contains 89 byte-compared files. Live acquisition and deployment remain unverified here.
