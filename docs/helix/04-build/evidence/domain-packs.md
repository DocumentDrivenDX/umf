# Portable domain-pack evidence — 2026-10-08

Scope: CONTRACT-052, `umf.domain-pack` and `umf.dataset-source` 1.0.0,
attached to core 0.8.0 through the existing extension-package bootstrap envelope.
These are portable structural metadata contracts. They do not execute generators,
fetch datasets, certify reuse rights or establish data realism.

| Check | Evidence |
| --- | --- |
| TypeScript and browser build | Both TypeScript configurations and browser ESM build pass. |
| Canonical artifacts | Schema regeneration `--check` passes; 61 extension packages and 349 canonical schemas pass the existing audits. |
| Pack metadata tests | Four Bun tests with 16 assertions pass: registration, invalid known structure, unknown-field retention, synthetic/external/mixed declarations, JSON/YAML recovery, stale export refusal and local artifact boundaries without source fetching. |
| Browser metadata | Real Chromium 153.0.8010.12 passes nine checks, including standalone dataset-source registration and JSON/YAML recovery without Bun or Node globals. |
| Python | 42 source tests pass. Wheel-from-sdist builds successfully and includes both canonical extension schemas. |
| Legal source export | All eight TableSpec 1.0 JSON schema artifacts recover exactly through the existing native adapter; the generated TableSpec example export passes `--check`. |

The TableSpec consumer independently tests generator resolution, refusal of
external-row synthetic substitution, deterministic ZIP CSV output, constant SQL
literals and local Delta ingestion. These consumer tests do not establish UMF
execution semantics for other native formats or other generator implementations.

Broader UMF qualification is separate. The full Bun suite was run without lowering
checks. It exposes a baseline traceability mismatch (the committed story set has
442 criteria while its assertion expects 433), native-oracle environment failures,
and historical evidence/version mismatches. Adding exports to `src/index.ts`
also changes a file covered by broader native-evidence fingerprints; those wider
support claims need their own revalidation before acceptance. The focused passing
checks above MUST NOT be presented as full adapter requalification.

Remaining execution subsets: remote retrieval, source checksum enforcement,
source-specific conversion, mixed-source joins/transformations and redistribution
approval. References and authored license/provenance declarations are retained
without silently granting those capabilities. No workspace or source dataset was
accessed during these checks.

Consumer run results: TableSpec's existing full gate passes (3,938 passed,
111 skipped), followed by 28 focused unit cases and one deliberately skipped
opt-in warehouse case. All eight local Sail 0.6.6 / classic Spark ingestion cases
pass, including repeated Delta replacement, typed DATE/TIMESTAMP literals,
awkward-string property round trips and CSV ZIP read-back. Lint, formatting,
Pyright, documentation and source/wheel builds pass. These counts describe
overlapping runs and MUST NOT be summed as independent cases. Sail's comment
refresh is explicitly outside its qualified subset; Spark executes that path.
The live Databricks warehouse path was not run.

Full Bun result: 2,115 passed, 24 failed and one between-test error across 382
files. This run used default native-oracle interpreter resolution; the Protobuf
projection subset passes all five cases when explicitly supplied the installed
Python interpreter through `UMF_PYTHON_PATH`. That targeted rerun does not
qualify the remaining broad failures or replace a successful full gate. No
assertions, evidence thresholds or skip conditions were relaxed.

## Mixed legal corpus 1.1.0

Owner-requested scope on 2026-10-08: replace the all-fabricated legal pack with a
mixed pack under FR-45 and CONTRACT-052, retaining the original eight fabricated
firm-operation tables and their scale presets. Three observed tables add one
source-scoped case, seven original PDFs and 383 PDF-page text records.

Sources are the Department of Justice (DOJ) digital-advertising Google case,
E.D. Virginia 1:23-cv-00108:
https://www.justice.gov/atr/case/us-and-plaintiff-states-v-google-llc-2023 and
https://www.justice.gov/atr/us-and-plaintiff-states-v-google-llc-2023-trial-exhibits .
The corpus includes the 153-page complaint, 115-page memorandum opinion,
13-page Bryan Rowley deposition designations, 53-page Brian O'Kelley deposition
designations, and corporate exhibits PTX0014 (43 pages), PTX0032 (2 pages) and
PTX0110 (4 pages). It is a bounded selection, not a complete docket or discovery
production. Production history beyond the source's labels/markings is unknown.

Original source bytes are retained locally with SHA-256 pins. pypdf 6.10.0
extracts text per PDF page; no OCR, layout equivalence, image interpretation,
redaction interpretation or complete transcript reconstruction is claimed.
All 383 pages yield nonempty text, which does not prove extraction completeness.
Bates candidates occur on 40 PTX0014 pages, two PTX0032 pages and two PTX0110
pages; these remain unvalidated candidates, not inferred production ranges.
Real evidence joins only to sourced cases; it has no fictional firm/client link.

| Scoped verification | Result |
| --- | --- |
| `bun test tests/domain-packs` | 8 passed, 0 failed, 195 assertions across 4 files; source pins, mixed bindings, exact native schema recovery and rights refusal included. |
| Local projection replay | `python3 scripts/domain-packs/legal-project.py --check` passes with pypdf 6.10.0: byte-for-byte CSV and pack reproduction; original pin changes refuse. |
| CSV relational inspection | Unique page keys; all documents resolve to the retained case; every document has exactly its contiguous 1-based PDF page sequence. |
| Sample visual inspection | Original first pages of PTX0032 and Rowley designations rendered with Poppler: exhibit/Bates/confidentiality markings and transcript page/line designations remain in the authoritative PDFs. This is sample inspection, not whole-corpus rendering qualification. |
| Typecheck and browser build | `bun run typecheck` and `bun run build` pass. |
| Chromium | Chromium 153.0.8010.12 passes 16 metadata checks, including actual legal-pack validation and JSON/YAML recovery with mixed provenance/rights retained. |
| Catalog metadata export | 11 native schema artifacts plus metadata; export and `--check` pass. Snapshot provenance now names canonical UMF rather than TableSpec. |
| Full source redistribution | Expected refusal for unknown source rights; test confirms no corporate exhibit PDF reaches the export destination. |

The first Bun/build/browser attempt failed because this checkout had no installed
repository dependencies. `bun install --frozen-lockfile` restored them without a
lockfile change. The initial browser-server attempt was sandbox-blocked; the
local Chromium replay succeeded with network permission. Those failed attempts
are not corpus failures and are not counted as passing checks.

DOJ's https://www.justice.gov/legalpolicies distinguishes government information
from third-party material. Corporate exhibits, deposition documents and the
jointly authored complaint retain unknown redistribution rights; the federal
judicial opinion is authored as cleared. Public accessibility alone does not
clear rights. Metadata CSVs carry selected factual identifiers; page text
inherits uncleared document rights. The microsite snapshot contains metadata and
schemas only, with no hosted source PDFs. Full `--include-sources` refusal is
preserved rather than weakening the existing rights gate.

General mixed-source generation/ingestion orchestration and downstream consumer
snapshot adoption remain separate consumer work. No TableSpec generator was
changed or qualified by these UMF checks. The existing synthetic `documents`
NDA labels do not classify the real evidence. Remote retrieval remains an
explicit research step rather than a runtime library capability. These scoped
checks do not qualify broader adapters or establish a full-repository gate.
