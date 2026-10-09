# Legal mixed pack 1.1.0

Eight existing tables describe fabricated firm operations. Three added tables
(`cases`, `evidence_documents`, `evidence_pages`) contain observed public
litigation material from U.S. and Plaintiff States v. Google LLC, the digital
advertising case, E.D. Virginia 1:23-cv-00108. They have no invented link to the
fictional firm's clients or matters. The existing synthetic `documents` and
`nda_issues` remain demonstration data, not labels for real evidence.

The bounded corpus contains seven unmodified original PDFs and 383 PDF pages:
a complaint, memorandum opinion, Bryan Rowley and Brian O'Kelley deposition
designations, and exhibits PTX0014, PTX0032 and PTX0110. `corpus.json` records the
curated selection; `pack.json` pins actual bytes and identifies row/reference
bindings. Publisher case and exhibit listings are recorded per document.
Deposition designations are selected testimony, not complete depositions.
Corporate exhibits retain production-style Bates markings, but production
history is not independently verified. Historic confidentiality markings do not
establish current sealing status. No sealed-only document was retrieved.

`data/*.csv` uses UTF-8, headers and `\N` for null. Original PDFs are authoritative.
Page text is extracted with pypdf 6.10.0, without OCR, and may omit scanned content,
layout, images, handwriting and redaction meaning. PDF page ordinals are distinct
from transcript page/line numbering. Bates candidates are extraction aids, not
validated production ranges. Empty extraction is explicit and never replaced
with generated text. Public allegations and testimony are not fact labels.

Rebuild from pinned local originals (no network):

```sh
python3 scripts/domain-packs/legal-project.py
bun test tests/domain-packs
bun scripts/export-domain-pack.ts --pack spec/domain-packs/legal/pack.json --output /tmp/legal-metadata
```

Full source export with `--include-sources` deliberately refuses: corporate
exhibits, deposition material and the jointly authored complaint retain unknown
redistribution rights. The judicial opinion is cleared as a federal judicial
work. Metadata CSVs contain selected factual identifiers; extracted text inherits
source rights. DOJ's policy distinguishes its public-domain information from
third-party material: https://www.justice.gov/legalpolicies . No license clearance
is inferred from public access. The microsite export excludes source PDFs;
repository research fixtures retain their explicit uncleared-rights declarations.

The legacy synthetic-generation path for the full mixed pack must refuse external row bindings.
Consumers may explicitly select the original eight fabricated schemas for
synthetic generation or bind the three observed CSVs for local ingestion. TableSpec implements explicit assembly with `ingest --mixed`; the pack does not authorize
retrieval, legal interpretation or automatic cross-source joins.


The execution profile selects all eleven tabular tables and retains the existing
ontology target, which describes only fabricated operations. TableSpec's mixed
consumer must keep observed rows fixed and synthetic scale/seed separate. An
explicit local-use source policy permits private workspace processing while
retaining unknown rights; it does not clear redistribution.
