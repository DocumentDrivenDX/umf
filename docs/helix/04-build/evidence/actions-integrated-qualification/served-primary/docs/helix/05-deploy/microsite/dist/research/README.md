# Document research tools 1.0.1

UMF distributes tools, configuration and evidence. Generated dataset and tool
ZIPs are consumer outputs and are not published release assets.

Use a [source checkout](https://github.com/DocumentDrivenDX/umf/tree/main), or
inspect the [individual tool checksums](https://documentdrivendx.github.io/umf/research/release.json).
TableSpec 0.0.9 remains the installable native Python collector wheel.

```sh
git clone --branch main https://github.com/DocumentDrivenDX/umf.git
cd umf
# Produce fixed-corpus archives in your own directory, with Bun 1.3.14:
bun scripts/build-domain-pack-releases.ts --output /absolute/path/local-pack-archives
# Optional authored research-tools archive; contains no acquired originals:
python3 scripts/build-document-research-release.py --archive /absolute/path/document-research-tools.zip
```

For a directory export, use `bun scripts/export-domain-pack.ts --pack
spec/domain-packs/public-company-intelligence/pack.json --output
/absolute/path/company-export --include-sources`. The appellate pack has the same
export interface. Inventory-driven source acquisition uses `tablespec
document-loader fetch`; read each pack's GUIDE for bounds and rights.

[Supreme Court discovery](https://documentdrivendx.github.io/umf/research/tools/scripts/domain-packs/supreme-court-mirror.py),
[batch preparation](https://documentdrivendx.github.io/umf/research/tools/scripts/domain-packs/supreme-court-batches.py),
[acquisition](https://documentdrivendx.github.io/umf/research/tools/scripts/domain-packs/supreme-court-acquire.py),
and [SEC qualification](https://documentdrivendx.github.io/umf/research/tools/scripts/domain-packs/qualify-sec-acquisition.py)
are available as individual Python files; use the source checkout for their
configuration and dependencies.

Supreme Court discovery covers 104 dockets from the October Term 2024 and 2026
granted/noted lists, with 7,775 discovered PDF URLs. The observed local acquisition
covered 300 PDFs; 7,475 remained unattempted. This is not complete Court coverage.
Acquired filing originals remain local-use because redistribution rights are
unknown; the source mirror GUIDE documents acquisition into private state.

Local qualification passed with TableSpec 0.0.9 and umf-core 0.8.1, Python 3.12.15,
Spark 4.0.1, Delta 4.0.0 and Java 21.0.12.1: three court PDFs, hash-pinned acquisition,
unchanged refresh, replay/BagIt/fixity, Delta replace and merge, exact read-back and
wrong-schema refusal. Python source HTTPS calls were blocked during publication;
OS-wide isolation was not tested. The observed probe preserves temporary local
paths and must not run unchanged against remote destinations.

The SEC harness passed preflight and syntax checks; live acquisition needs a
genuine contact user agent. Databricks authentication/read-only discovery passed;
live serverless collection and Unity Catalog volume behavior remain pending
caller-designated scratch targets. No screening, scheduler, PACER or email claim.

[Local Spark evidence](https://documentdrivendx.github.io/umf/research/supreme-court-spark-runtime.md)
and [SEC/Databricks preparation](https://documentdrivendx.github.io/umf/research/public-company-live-qualification.md)
retain machine-readable JSON receipts in the same directory.
