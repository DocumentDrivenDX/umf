# Document research tools 1.0.0

[Download the tools and evidence](https://documentdrivendx.github.io/umf/research/document-research-tools-1.0.0.zip),
[release metadata](https://documentdrivendx.github.io/umf/research/release.json),
and [SHA-256 pins](https://documentdrivendx.github.io/umf/research/SHA256SUMS).
The bundle complements the released appellate/company domain packs and
TableSpec 0.0.9. It contains Python Supreme Court discovery, batching and
acquisition tools, a SEC acquisition qualification harness, source selection
configuration, coverage and execution evidence. Extract it and run scripts
from the extracted root after preparing the guide's pinned dependencies.

Supreme Court discovery covers 104 dockets from the October Term 2024 and 2026
granted/noted lists, with 7,775 discovered PDF URLs. The observed local acquisition
covered 300 PDFs; 7,475 remained unattempted. This is not complete Court coverage.
The retained original archive is local-use only because filing redistribution
rights are unknown. Public downloads contain tools, selections and evidence;
they do not contain the acquired original archive. Follow the source mirror
GUIDE to acquire originals into private state with explicit local-use rights.

Local qualification passed with released TableSpec 0.0.9 and umf-core 0.8.1,
Python 3.12.15, Spark 4.0.1, Delta 4.0.0 and Java 21.0.12.1: three court PDFs,
hash-pinned acquisition, unchanged refresh, replay/BagIt/fixity, Delta replace,
repeat merge, exact row/object read-back and wrong-schema refusal. Publication
blocked Python source HTTPS calls; OS-wide network isolation was not tested.
The observed Spark probe preserves temporary local paths and is an execution
record, not a portable Databricks job. Do not run it against remote destinations.

The SEC harness passed released-pack preflight and syntax checks. Its live
acquisition awaits a genuine organization/contact user agent. Databricks
authentication and read-only discovery succeeded; no live collection/publication
ran. Serverless and Unity Catalog volume behavior remain unqualified pending
caller-designated scratch destinations. No screening, model, scheduler, PACER
or email execution is claimed.

[Local Spark evidence](https://documentdrivendx.github.io/umf/research/supreme-court-spark-runtime.md)
and [SEC/Databricks preparation](https://documentdrivendx.github.io/umf/research/public-company-live-qualification.md)
are published with machine-readable JSON receipts in the same directory.
