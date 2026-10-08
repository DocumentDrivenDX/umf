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
