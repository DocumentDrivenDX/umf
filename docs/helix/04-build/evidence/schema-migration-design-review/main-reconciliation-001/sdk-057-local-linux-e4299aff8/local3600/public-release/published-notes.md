UMF SDK 0.5.7 adds typed same-row backfills for the selected PostgreSQL 18.6 maintenance profile. It supports filling an existing optional Field's NULL values before requiredness, or atomically adding and filling one required Field. Existing values are preserved. The closed expression subset includes typed Fields/literals, coalesce, strict text concatenation, exact integer/finite-decimal arithmetic and conditional expressions. Arbitrary callbacks, joins, casts, raw SQL and floating arithmetic are excluded.

UMF owns declarations and migration plans; Weft owns admission and SQL lowering; the host owns approval, fencing, execution limits, transaction effects and recovery. Historical operation 0.1 and migration 0.1–0.3 meanings remain unchanged. The successor uses operation 0.2 and migration/options 0.4, one table/Field and at most 10,000 selected rows.

Qualification: independently accepted SDK 139 installed cases; exact18-package offline Linux CPython 3.11.17 and 3.14.9 replay; complete PostgreSQL D5 run with 30 ordered commands, 37 cases/16 groups, 19 no-default controls, all 3 recovery scenarios, final audit and verified cleanup. The separate LOCAL_EMULATED_3600 profile took 2,006.341 seconds; the original 1,800-second attempt remains FAIL_OR_UNKNOWN. Product/API and 180-second child budgets were unchanged. Local Bun 14 tests/384 expectations and browser build passed; separate Python 3.11 syntax evidence is not Python 3.12 or a whole original CI-job pass.

Linux/amd64 client execution used OrbStack emulation on Darwin/arm64, with ARM64 Linux PostgreSQL 18.6. This is not hosted CI or a native x86_64-host qualification. GitHub Actions remains paused because credits are exhausted; no macOS CI ran. Built macOS dependency artifacts are reused from the existing immutable Core 0.10.3 and Weft 0.4.55 releases; retained macOS 15.7.9 arm64/Python 3.11 evidence is historical, with no fresh Mac migration-runtime or Mac Python 3.14 qualification. A macosx_11_0 wheel tag is a packaging minimum, not macOS 11 runtime proof.

Dependency target: Access 0.1.0.dev8, Codegen 0.1.0a5, Core distribution 0.10.3 (semantic 0.10.0), Weft 0.4.55 / weft-sql/0.2.0. No existing dependency coordinate is replaced. This release distributes exactly three GitHub package assets; no npm/PyPI publication is performed here.

| Asset | Bytes | SHA-256 |
| --- | ---: | --- |
| umf-sdk.tgz |30834843|cd851d3338b1b2af79197cbafaeefdd03a8aac3e02373a893ddd5d07a930ab26|
| umf_access-0.1.0.dev8-py3-none-any.whl |580062|1a21c1ddd59f6b23e9f0b33228280564af0e96bb4d13699b89616d5143e4fd23|
| umf_codegen-0.1.0a5-py3-none-any.whl |261296|36a6f7e0ab92feb9cb20ed8842cc3c1f073cdd3ff2c4edff137c1fcbc3ace158|

Producer P: e4299aff8e87e9d211f9d86df2f2013ab9c95945, tree 8b98c0d895983ba2b7637dd3aea567dab0943883. Normal release merge M: dce9b430422242edd135e69a7a64620d0244784e. Product bytes retain P; M additionally incorporates reviewed evidence and the main branch's manual-only microsite CI policy. Fresh post-publication public-download/install verification will be recorded separately; it is pending at publication.

Operators must retain exact predecessor/successor sources, review the source-bound plan and compatible installed cohort, and keep writers fenced until authenticated publication. After uncertain commit responses, observe authenticated progress before resuming; never repeat a committed backfill. Recovery of committed data requires a separately reviewed forward change or retained backups.

G03–G11, managed consumer adoption, broader backends and Praxis remain separate. [Detailed notes and evidence](https://github.com/DocumentDrivenDX/umf/blob/dce9b430422242edd135e69a7a64620d0244784e/docs/helix/05-deploy/sdk-release-notes-0.5.7.md).
