# Supreme Court source mirror

This is a source-only collection companion, not a published schema/catalog pack.
The separate appellate pack supports lower-court split screening. This slice
collects docket histories and linked documents for Supreme Court development.

Discovery scope: October Term 2024 and 2026 **granted/noted-list cases**. This
excludes ungranted petitions, applications not on those lists, and other cases.
Current retrievals of historical dockets are not historical point-in-time snapshots.
The collector uses POSIX file locking; the qualified local runtime is macOS/Python.
All party filing redistribution rights remain unknown; acquire with `local-use`.
Do not publish the downloaded archive as a redistributable domain pack.

## Collect and inspect

Use Python with pypdf 6.10.0 for list extraction. Use TableSpec 0.0.9
native Python for PDF acquisition and preservation;
the pinned Bun companion is retained only as a compatibility reference. Run from the repository root:

```sh
python3 scripts/domain-packs/supreme-court-mirror.py --root /tmp/umf-supreme-court-mirror --phase discover
python3 scripts/domain-packs/supreme-court-mirror.py --root /tmp/umf-supreme-court-mirror --phase inventory
python3 scripts/domain-packs/supreme-court-mirror.py --root /tmp/umf-supreme-court-mirror --phase check
python3 scripts/domain-packs/supreme-court-batches.py --root /tmp/umf-supreme-court-mirror
tablespec document-loader fetch --pack spec/domain-packs/legal-supreme-court/companion.json --inventory /tmp/umf-supreme-court-mirror/batches/0001.json --output /tmp/umf-supreme-court-mirror/pdf-state/0001 --mode backfill --rights local-use
tablespec document-loader replay --pack spec/domain-packs/legal-supreme-court/companion.json --state /tmp/umf-supreme-court-mirror/pdf-state/0001 --rights local-use
tablespec document-loader handoff --state /tmp/umf-supreme-court-mirror/pdf-state/0001 --output /tmp/umf-supreme-court-mirror/handoff/0001
tablespec document-loader verify-handoff --fetched /tmp/umf-supreme-court-mirror/handoff/0001
```

`batch-plan.json` enumerates every PDF batch and its state directory. Collect
additional batches by using the corresponding inventory and state paths. A
failed batch retains its receipt and does not publish a partially successful
snapshot. Re-run failed acquisition; successful publication can be checked with the
`document-loader replay` command and no inventory argument. Replay is offline.
Read pinned `README.md` for publication inspection and `read-publication.ts`.

Docket collection reuses successful snapshots by default. `--refresh` explicitly
fetches updated pages and retains prior raw objects and observations. After changed discovery, re-run batch preparation: newly discovered URLs append
new batches while earlier inventories retain their exact bytes and context.
Historical URLs remain in their earlier batches and are counted separately from
the current inventory. Batch identity cannot be silently repurposed. Collection is serial and respects
the Court's robots policy. No scheduling, screening, email or PACER is activated.

## Continue bulk acquisition

After preparing batches, use the TableSpec Python environment:

```sh
python3 scripts/domain-packs/supreme-court-acquire.py --root /tmp/umf-supreme-court-mirror --start 1 --count 5
```

Each successful batch is verified offline and exported as a BagIt handoff. Repeat
with a later start/count, or enumerate the entire batch plan. Already successful
batches replay without source requests. `pdf-acquisition.json` summarizes successful
publications, replay, handoff validation and fixity audits; failed batches retain
receipts. Initial acquisition covers batches 0001–0005 plus application batch 0153, not every discovered PDF.
The delivered corpus includes complete BagIt handoffs; when working from that
archive, the helper verifies already downloaded handoffs without network even
when the original acquisition state directories are absent.

## Inspect coverage

- `cases.json`: source-list identities and discovery failures.
- `dockets.json`: metadata, dated proceedings, associated PDFs and counsel source text.
- `pdf-inventory.json`: URL-deduplicated PDFs with all case associations.
- `changes.jsonl`: observed projection changes; missing entries remain uninterpreted.
- `latest.json`, `objects/`, `observations.jsonl`: exact bytes and retrieval history.
- `coverage.json`: expected, successful, failed and unattempted docket counts.
- `pdf-state/*/runs/`: acquisition outcomes; successful `current.json` publications
  establish PDF coverage separately from docket coverage.

Source HTML/PDFs are untrusted data. Counsel text is attributed public evidence;
it does not establish current representation beyond the retrieved page. Missing
links never establish withdrawal or vacatur. Parser and extraction limits remain
explicit. No complete all-case enumeration or latency claim is made.

TableSpec emits BagIt 1.0 SHA-256 handoff manifests, a scoped PREMIS 3 semantic
JSON mapping and PROV-O JSON-LD. These record fixity and provenance, not source
authenticity or legal permission. See its [document-loader guide](https://github.com/DocumentDrivenDX/tablespec/blob/main/docs/guide/document-loader.md)
for dependencies and offline DuckDB/Spark publishing. This slice does not deploy
a database or claim live Databricks qualification.

TableSpec 0.0.9 is the recommended installation, including the Spark CLI session
application-name fix. The initial corpus was acquired using the preceding local
collector source; its original provenance and software fingerprints remain
unchanged. Live Spark/Databricks publication is not qualified by this mirror.

Version identities are independent: installed TableSpec package 0.0.9, collector
engine/agent 0.0.8, and UMF companion 1.0.0. Record the installed package version
separately in operator/job receipts; do not rewrite retained engine provenance.
