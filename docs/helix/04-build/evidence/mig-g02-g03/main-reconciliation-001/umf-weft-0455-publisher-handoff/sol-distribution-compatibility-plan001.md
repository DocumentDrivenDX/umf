# Narrow Weft distribution-name compatibility plan

PLAN ACCEPT for one two-file implementation and affected-source review; source acceptance will not admit a new cohort. Source baseline is the parent-reported clean migration checkpoint fff3d28f0a438bef693aaf04ec9eab82b9ebee53. Read only the retained consumer inventory36053da24bc43966ed6730194e6f4aa0d43a9019928a85d0a5ad9184fbc6d218 and its precise relevant source paths; no inventory repeat.

The actual publisher handoff /private/tmp/arras-pypi-extras-20261026/receipt-artifacts/umf-weft055/verified-summary.json (SHA256 acfc7f107cd4b81262a45937ff214bebdc8095f9b1c7ffed1c7815bb2b3f4886) declares public umf-weft0.4.55, tag v0.4.55/source ea0fef0209aaf8e08ef165b6afe00b408873354f, immutable release424900540, three verified public wheel byte identities and OIDC publication; no sdist. Its own scope is packaging plus selected refusal comparisons, expressly no positive-query/native PostgreSQL admission. This plan uses that actual declared distribution name; it neither repeats publication review nor promotes its limited evidence into consumer qualification. Core0.10.3 is still unpublished/unadmitted.

## Exact unblocked implementation

Luna may edit only these two files in /Users/erik/.codex/worktrees/migration-integrated-candidate/umf:

- python/umf_access/src/umf_access/build/catalog.py — current73,928 bytes/SHA256 cb2bd0b998cd151ef513acb040b2431b33976bc1d44902479e83b9f7f6154471.
- python/umf_access/tests/test_catalog_configuration.py — current6,971 bytes/SHA256 acc7ddf5e54e355ebad73bde1c41637da0477c1ce6250e9237b3af80012a4fac.

At resolve_configuration's existing full source-pinned profile guard (lines285–296), accept only exact canonical distribution strings weft-sql and umf-weft. Keep the closed {distribution,version} object and string version requirement. An explicit string-type check before the two-name membership test is appropriate. Keep the subsequent single importlib.metadata.version(pin["distribution"]) query and exact version comparison unchanged. Preserve the actual selected pin verbatim in source-pinned provenance. Do not normalize/rewrite catalog identity to the other name, try multiple installed distributions, infer selection from imports, choose by version/availability, or default a missing selection. A caller explicitly declaring the legacy name remains valid under the existing legacy contract; a caller declaring umf-weft binds only that installed distribution. Absence/version mismatch must refuse even if the other distribution exists and has the requested version.

This is metadata-name compatibility only: preserve imports weft and weft_sql, wire dialect weft-sql/0.2.0, compiler family, native/API semantics, source-document byte/digest custody, declaration-import ordering, compiler invocation and compact experimental-inline behavior. Do not add a resolver/helper/capability framework or a product minimum/version tuple. No other catalog algorithm needs changing.

## Meaningful existing-test extension

Extend ConfigurationTests in the existing test file, reusing its explicit temporary source/binding fixture and metadata mock. Retain the existing legacy positive, original-byte mutation refusal and wrong-version refusal.

1. Exercise both explicit canonical names through the same real resolve_configuration source-pinned path. Assert exact binding/model bytes, unchanged caller configuration, retained provenance distribution/version, and metadata.version called once with exactly the declared name. This is a unit compatibility assertion, not evidence of the real0.4.55 compiler.
2. For each selected name, make the selected installed version wrong while the other distribution would match: require existing CatalogBuildError and exactly one query of the selected name. This catches cross-name fallback, including when both distributions are installed.
3. Make the selected distribution raise importlib.metadata.PackageNotFoundError while the other would be available: require refusal/no alternate query. Preserve the current exception contract; do not introduce broad exception handling merely for this test.
4. Unknown/missing/extra-member or non-string distribution selections must fail before metadata lookup. Include at least an unrelated name and an alias spelling such as umf_weft or uppercase UMF-WEFT to prove this exact canonical catalog-identity boundary. Do not convert aliases to accepted names under packaging normalization. Existing source-shape/custody assertions stay active.

Use existing unittest mocks, not actual package acquisition or a new test harness. Freeze the two postimages for one affected review. No local tests/imports/AST/runtime are authorized by this source-plan task. The subsequent genuinely changed-source required qualification must run the original owning Access test suite and existing whole R3/generated-source consistency gates; do not hand-edit generated inventory identities.

## Explicitly deferred consumers and admission

Do not update the18-package template/catalog, selector versions, whole-wheel/native/source/sdist hashes, acquisition helper, workflows or native source-freeze/pin manifests yet. Do not bulk-rename historical receipts, synthetic legacy tests or development Spark0.4.42.dev0 fixtures. Existing catalog fixtures explicitly declaring weft-sql remain useful legacy controls and must not be relabeled as current0.4.55 evidence.

The retained inventory identifies real later migration sites: prepare-access-manifest-command-fixture.py and current full-profile catalog/e2e configuration producers, plus the native G02/G03/R3 report/version/installed-custody queries. These presently query weft-sql directly. Leave them unchanged in this batch: their selected production configuration and report keys must move together with the future explicitly declared umf-weft cohort and exact finalizer expectations, not learn an ambiguous auto-detection fallback now. Likewise leave native-column/manifest/source configs and the broader E2E routes for that coherent cohort transition. No arbitrary current bytes may replace expected pins.

After the actual complete Core0.10.3 public tuple and qualified Weft tuple are selected, root must authorize the separate coherent dependency/source freeze, genuine generated closure and original admission: full18 selected package closure, original37 D5 oracle cases and19 no-default checks, all four platform/interpreter cells/full union, original G02 temporal/G03/native/API gates and exact archive/native-member/installed-byte correspondence. Nothing here reduces those cases/caps or grants a positive native/support claim. Existing live Core qualification remains intact; no Praxis or new publisher/provider campaign. Root owns commits, pins and eventual dispatch; Luna implements this narrow pair, then Sol reviews the actual frozen source.
