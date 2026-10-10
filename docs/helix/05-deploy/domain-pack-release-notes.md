---
ddx:
  id: umf.domain-pack-release-notes
  type: release-notes
  activity: deploy
  status: reviewed
  authoring:
    home: repo
  links:
    - id: CONTRACT-057
      kind: informed_by
    - id: CONTRACT-058
      kind: informed_by
    - id: CONTRACT-059
      kind: informed_by
---

# Domain-pack releases — 2026-10-09

## Release Scope

UMF publishes three independently versioned releases: `loader-v1.0.0`,
`legal-appellate-v1.0.0` and `public-company-intelligence-v1.0.0`. GitHub release
assets and the public schema explorer serve the same qualified companions and
fixed corpora. The release owner is the repository owner. These releases do not
change core document versions. TableSpec 0.0.8 separately delivers the primary
native Python document loader; court/SEC demo packs are 1.0.1.

## Audience and Channels

| Audience | Impact | Channel |
| --- | --- | --- |
| Pack builders and operators | Reusable acquisition, refresh and replay | GitHub releases and loader guide |
| Legal researchers | Source-linked appellate development corpus | Explorer, ZIP and domain guide |
| Company researchers | Selected SEC research corpus and exact financial literals | Explorer, ZIP and domain guide |

## Highlights

- Loader 1.0.0 provides finite selected-source acquisition, immutable originals,
  visible failures, atomic publications, refresh and offline replay. Its bounded
  reader hands verified source bytes to domain-owned projections.
- Appellate 1.0.0 contains 34 original PDFs, 27 cases, 10 courts, 13 issue groups,
  15 tables and 1,979 rows, with provisional annotations and labeled workflow fixtures.
- Public-company intelligence 1.0.0 contains 25 selected issuers, 14 tables,
  340 filing/document metadata records and 647 financial observations. Exact
  numeric spellings, source lineage and authored opportunity hypotheses stay distinct.

## Required Actions Summary

Download the desired release and verify SHA-256 checksums. Loader execution
uses native Python in TableSpec 0.0.8 with an explicit source inventory; the
retained compatibility runner requires Bun 1.3.14. SEC acquisition also needs
an identifying contact User-Agent. Read the domain `GUIDE.md` before using a pack.
Existing metadata consumers need no migration. Pack builders should retain the
canonical five-artifact companion rather than maintain separate downloaders.

## Changes and Fixes

Both domain packs now use the independently verified loader closure. Their local
sources, canonical companions and whole-pack ZIPs are available through the
website catalog. Packaging fixes avoid exporting a companion twice when source
metadata independently describes it, while retaining those annotations and
checking both declared hashes. Non-companion path collisions still refuse.
CONTRACT-059 uniquely identifies the public-company slice; CONTRACT-058 retains
the appellate identity after integration. No meaning or evidence was collapsed.

## Breaking Changes and Required Actions

No existing core or Python API is replaced. The exporter accepts an existing
empty output directory and refuses overwriting a populated output. Use `--check`
to verify an existing export. Loader state is bound to the exact installed pack
manifest; install a changed pack with fresh state. Preserve historical state and
original bytes before changing inventory or installation.

## Migration or Rollback Guidance

Install versioned ZIPs in separate directories. Verify artifact hashes and the
pack manifest, then use the documented reader and fixed-data ingestion route.
To roll back, select the previous installation and its corresponding state.
Reverting the integration commit on master redeploys the earlier website.

## Known Issues and Support

The loader covers finite inventories, not automatic source discovery. Appellate
labels require attorney review; live monitoring, PACER, email and Supreme Court
docket operations are outside this corpus. The selected company universe is not
licensed authoritative S&P membership. Full SEC responses and blocked primary
filing documents are not bundled; scoped original JSON and coverage limits are
explicit. Model ranking, Databricks deployment, admin UI and scheduled email are
consumer work. No native graph backend execution or full-library requalification
is claimed. Report release defects through repository issues with pack version,
manifest hash and run receipt; exclude private contact/configuration data.

## References

- [Loader operator guide](domain-pack-loaders.md)
- [Appellate evidence](../04-build/evidence/legal-appellate.md)
- [Company evidence](../04-build/evidence/public-company-intelligence.md)
- [Website deployment and rollback](README.md)
- [Public explorer](https://documentdrivendx.github.io/umf/explorer.html)
- [Loader release](https://github.com/DocumentDrivenDX/umf/releases/tag/loader-v1.0.0)
- [Appellate release](https://github.com/DocumentDrivenDX/umf/releases/tag/legal-appellate-v1.0.0)
- [Company release](https://github.com/DocumentDrivenDX/umf/releases/tag/public-company-intelligence-v1.0.0)


## Preservation support

The four loader-bearing packs declare BagIt 1.0/SHA-256 handoffs, PREMIS 3
semantic JSON mapping and PROV-O JSON-LD. Python supports network-open fetch,
offline publish, refresh and scheduled fixity audits. PREMIS XML, OCFL/WARC,
Snowflake and live Databricks serverless are not qualified by these releases.
See [preservation guidance](document-preservation.md) and the
[TableSpec release](https://github.com/DocumentDrivenDX/tablespec/releases/tag/v0.0.8).


The [document research tools 1.0.0](document-research.md) publish Supreme Court discovery,
batching/acquisition configuration, SEC qualification harness and scoped local
Spark evidence. Original local-use archives are excluded; live SEC/Databricks
qualification remains pending. CONTRACT-060 governs the source mirror.
