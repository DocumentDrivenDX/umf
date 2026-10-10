---
ddx:
  id: umf.evidence.artifact-collections
  authoring:
    home: repo
  links:
    - id: CONTRACT-061
      kind: validates
    - id: umf.plan.artifact-collections
      kind: implements
---

# Artifact collections 1.0.0 execution evidence

Implemented optional artifact_collections with versioned structural authority,
TypeScript source/schema-reference checks, unknown annotation preservation and
browser collection navigation. Python 0.8.2 packages identical canonical schema
resources; its reference checks remain structural. Core envelope remains 0.8.0.

Astra ultra reviewed the plan and final implementation. Review corrections:
source sharing permitted across collections; previous pack/schema aliases retained;
source downloads join verified asset IDs/checksums and allowed rights; unknown
collection versions refuse interpretation with raw source retained. SEC scoped
JSON remains explicitly derived, with full responses separately reference-only.
The fallback legal catalog no longer shadows canonical packs with stale versions.

Bun 1.3.14: typecheck, browser ESM/declarations build, canonical schema --check,
medical family and companion --check, public-company projection --check, pypdf
6.10.0 court projection --check. Domain suite: 86 passed, 26,312 assertions.
After the SEC description/reference correction, targeted catalog/company/artifact
suite: 29 passed, 839 assertions. Python 3.12.15: installed 0.8.2 wheel --no-deps,
with declared dependencies separately provisioned; 43 Python tests passed.

Real Playwright Chromium 153.0.8010.12 qualification passed 32 checks across six collections, rights/asset/hash
joins, two downloadable original DICOM objects, unavailable SEC narrative
originals, four historical aliases, and no data/corpus request during inspection.
Existing site font resources are excluded from data-request accounting. The
microsite workflow repeats this browser test. Native source files were not edited; all existing source checksum declarations were independently compared against the pre-change commit across eight packs and remain equal. The reviewer also independently ran the new artifact tests with global Bun 1.4.2; the reported qualification runs use the explicit pinned Bun 1.3.14 binary.

No live PACS, full DICOM series/study, pixel decoding or live Databricks claims
are added. Loader companion 1.0.0 and preservation 1.0.0 stay unchanged. Existing
loader state pins pack metadata; refreshed pack versions require fresh state.
Generated archives remain consumer-local, not release artifacts.

Publication integration: concurrent main commit e44cd15f (bounded core evolution)
was merged while preserving both exports. Integrated typecheck/build passed;
20 core-evolution/artifact tests passed (71 assertions), all 367 audited schemas
passed, and the rebuilt installed wheel again passed 43 Python tests.

Publication: feature tag artifact-collections-v1.0.0 and Python tag python-v0.8.2
pin integrated commit 953aa38c. Python build/test/twine succeeded in run
38015801432; its exact wheel/sdist are published on GitHub with SHA256SUMS.
PyPI upload refused invalid-publisher (no matching trusted publisher for
DocumentDrivenDX/umf, pypi.yml, environment pypi); account configuration remains
required for PyPI publication. GitHub installation is available independently.
