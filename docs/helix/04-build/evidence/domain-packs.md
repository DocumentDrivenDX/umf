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

## Public dataset schema packs — 2026-10-08

Owner-selected scope: FR-45 and CONTRACT-052. Four 1.0.0 packs contribute
16 authored TableSpec 1.0 JSON schemas: NYC TLC yellow trips/zones (2),
MovieLens 32M (4), NOAA GHCN Daily (3), basic GTFS Schedule (7).
The canonical artifacts live under `spec/domain-packs/`; the deterministic
generator is `scripts/public-dataset-packs.ts`. No generator registration,
row download, data ingestion or new extension version is added.

Official references were fetched explicitly for authoring. Manifest reference
sources record their SHA-256 fingerprints separately from external row inputs:
TLC yellow dictionary 2025-03-18, MovieLens ml-32m README, NOAA README 3.35
and GTFS reference commit `3c9e7b904b5035349622f03e11851e25c16d1d99`.
Fingerprints describe inspected documentation bytes; they do not pin datasets.
No upstream documentation or dataset rows are redistributed in these packs.

| Executed check | Scoped result |
| --- | --- |
| `bun scripts/public-dataset-packs.ts --check` | All four generated manifests, READMEs and 16 schemas match. |
| `bun scripts/domain-pack-schema.ts --check` | Existing canonical extension artifacts unchanged. |
| `bun test tests/domain-packs` | 9 tests, 517 assertions, zero failures across four files; schema/domain/source/FK resolution, exact recovery, semantic guardrails and export/check. |
| Native TableSpec model admission | All 16 JSON artifacts accepted by `tablespec.models.umf.UMF.model_validate`; Python 3.12.15, Pydantic 2.11.10, consumer checkout HEAD `d775dac44f0a7db49c12b4a6d0b9a5647a1b673a`. This is live checkout evidence, not a frozen native release or data execution claim. |
| `bun run typecheck`, `bun run build` | Both TypeScript configurations pass; browser ESM/declarations build. |
| `bun scripts/domain-pack-browser.ts` | Chromium 153.0.8010.12 passes 40 checks, including four manifests' JSON/YAML retention and all 16 schemas' exact native recovery. |
| Explorer build and `verify-explorer.ts` | Six total packs, 39 entries; all 17 explorer checks pass, including public manifests' source downloads and all 16 schemas. Record: `../../05-deploy/schema-explorer-evidence.json`. |
| `git diff --check` | Passes. |

The first Bun run failed to load absent Ajv/YAML dependencies. Frozen-lockfile
installation restored them; the complete focused rerun passed. Initial tooling
typecheck found an implicit array type in the added browser harness; an explicit
type fixed it. Initial explorer verification passed the new pack checks but
timed out on an existing assumption that legal was the default first pack.
An explicit legal deep link fixes that test; the full rerun passes. Restricted
shell DNS could not fetch official references; authorized read-only fetching
then succeeded. These attempts do not replace the successful results above.

Limits: GTFS has no selected agency feed; its unresolved URN is deliberate.
TLC's January 2025 file is a row reference, not an inspected Parquet snapshot.
NOAA row sources remain live/unpinned. MovieLens remains under the publisher's
research/commercial-use conditions. Conditional GTFS rules and weather unit
metadata are retained declarations, not installed instance validators.
No full repository/native requalification, row rights clearance, generated data,
source-instance conformance, cross-system equivalence or publication is claimed.

Tested SHA-256:

- Generator: `00b0e95b71d45e0e69cdd347f3d7e5e3212cb8a004b791024cc6d65272678d63`.
- Public pack tests: `a343c65d7a6f230180394f7528feadcd20bb088a86a462c7f2e08d361364de51`.
- Browser harness: `bf412dda82c02c34b54bfbddc118d22663d8220b1c3cb621d464be153a3703b6`.

### Integration onto updated master

Before pushing, master gained the sixteen-pack domain catalog through PR #9.
The public-pack commit was rebased onto `53049c71`, preserving its ontology
artifacts and documentation. Regenerated catalog: 20 packs, 256 entries.
`bun test tests/domain-packs` passes 27 tests / 1,189 assertions across five
files; typechecks and deterministic public-pack checks pass. Chromium
153.0.8010.12 passes all 18 explorer checks, including every catalog schema.
The catalog graph test now names its sixteen governed packs explicitly rather
than incorrectly requiring optional ontology profiles on every future pack.
The initial integrated run exposed that assumption; no graph checks on the
original sixteen packs were removed. Earlier six-pack counts above describe
the pre-integration checkpoint.
