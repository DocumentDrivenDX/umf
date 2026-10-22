# Praxis U1–U3 installed qualification

This packet qualifies the bounded PostgreSQL maintenance profile governed by
[CONTRACT-081](../../../02-design/contracts/CONTRACT-081-table-lifecycle.md),
[SD-007](../../../02-design/solution-designs/SD-007-schema-migrations.md) and the
[schema migration plan](../../schema-migration-plan.md). It is local fabricated
legal-domain evidence, not managed Praxis/Lakebase or private consumer acceptance.

[Sol review](sol-review.json) and the separate [design/native sign-off](design-review.json)
close MIG-R01–R06 for this recorded scope; merge and release remain subsequent
delivery gates.

The frozen candidates are SDK **0.5.4**, `umf_access` **0.1.0.dev6** and
`umf_codegen` **0.1.0a3**. [Installed versions](installed-environment.json) record
CPython 3.11.17, Pydantic 2.14.1, mini-racer 0.14.1 and published Weft 0.4.49.
[Package custody](package-audit.json) verifies wheel RECORDs, licenses, all 83
access and 18 codegen source files, and source-distribution correspondence.
Previously published semantic core 0.10.0 distribution bytes are reused; its
semantic model is unchanged. SDK-generated provenance comments are refreshed,
which does not publish replacement core distributions.

| Evidence | Recorded result |
| --- | --- |
| [Reviewed native shards](reviewed-shards.json) | 128 assertions; 14 native scenarios and 2 compiler refusal scenarios |
| [Mixed installed](mixed-installed.json) | 21 assertions, including published 0.5.3 upgrade, durable phase tamper/drift refusals, uncertain outcomes, exact index repair and final person/head reads |
| [Independent mixed replay](mixed-independent.json) | Separate design reviewer, actual server version and source pins; 21 assertions |
| [Independent CHECK/FK replay](constraints-independent.json) | Separate design reviewer; 40 assertions; isolated database removed |
| [Legal installed](legal-installed.json) | 42 assertions: source-bound backfill, generated data access/replay, concurrent repair and publication |
| [Owner plus via installed](owner-via-installed.json) | 10 assertions over distinct authenticated principals and business identifiers |
| [Chromium](browser.json) | Chromium 153.0.8010.12; 91 assertions; no external requests |
| [Generator](codegen-installed.json) | 30 complete-byte/refusal parity cases and writer/integrity controls, external JavaScript processes forbidden |
| [Deployment](deployment-installed.json) | 15 parity cases and 30 tamper controls |
| [Migration](migration-installed.json) | 17 parity cases, 99 tamper controls and 4 deadline controls |
| [Focused source tests](affected-tests.log) | 55 tests and 282 assertions |
| [Installed SDK](sdk-install.log) | 139 conformance cases; 1,743 manifest files and 1,749 archive files |

Installed row_scope parity also passed all six supplied/unknown/ambiguous/group/
cycle/related-SELECT cases. Public review discovery passed three parity cases and
eight malformed/source-forgery refusals. Four installed CLI tests, full TypeScript
typecheck, Python lint, 24 architecture-boundary tests (174 assertions), 71
extension-package audits and 379 JSON Schema audits passed. These are focused
checks, not a claim that every repository test or deployment target was run.

The reviewed native inventory covers actual stored-value purge, policy rewrite
before purge, rename/value preservation, finite integer/numeric widening,
NOT NULL activation/relaxation and actual-NULL refusal, exclusive writer locking,
index replacement/removal/new-ID recreation, CHECK/FK replacement/rename/removal,
new-ID FK recreation, independent primary-key replacement and invalid existing
key refusal, plus policy/grant visibility. Inbound primary-key dependencies and
unsafe narrowing refuse. Native final state, unrelated constraints and retained
rows are checked rather than inferred from generated SQL.

Each reviewed case retains its complete ordered transition chain. Shards use
separate disposable databases and principals; database-wide external-authority
checks remain enabled. [Native cohort](native-cohort.json) records actual local
PostgreSQL 18.6 and the installed source pins. A shared-database trial correctly
refused another security test's temporary executable function; final receipts use
isolated databases. Initial CHECK/FK fixture-oracle failures were corrected and
are not counted as passing receipts.

The final builder changed only shard C's selected inputs. [Exact input
equivalence](fixture-equivalence.json) binds retained A/B/D receipts and their
original builder hashes to byte-identical complete final selected fixtures.
Original receipts are unchanged. C was regenerated and replayed. Gzip files are
lossless copies of actual tested inputs; [shard custody](reviewed-shards.json)
records both compressed and uncompressed SHA-256 values.

To replay one retained shard, decompress its fixture and use the isolated
installed cohort with source-path imports disabled:

```sh
python -c "import gzip,pathlib; pathlib.Path('/tmp/reviewed.json').write_bytes(gzip.decompress(pathlib.Path('docs/helix/04-build/evidence/praxis-u123-adoption/reviewed-c-fixture.json.gz').read_bytes()))"
/path/to/candidate/python -I tests/lifecycle/reviewed_native.py \
  --dsn 'dbname=DEDICATED_DISPOSABLE_DATABASE' \
  --fixture /tmp/reviewed.json --report /tmp/reviewed-report.json
```

Run from the repository root.
Use a fresh isolated database and avoid simultaneous reuse of retained principal
names. For fresh unique fixtures, set `REVIEW_NATIVE_PREFIX` when invoking
`bun tests/lifecycle/reviewed-native-fixture.ts OUTPUT.json`.

[Published oracle custody](published-oracle.json) pins actual immutable SDK 0.5.3
access/codegen wheel hashes and RECORDs. The mixed harness requires its explicit
`--legacy-python` and `--legacy-provenance` inputs. Published access records the
initial/additive history, and current access verifies/replays it. A policy plan
emitted by that published compiler is refused for fresh unreviewed effects.
Historical verification does not grant new execution authority.

UMF owns declarations, source comparison, verified plans and DDL. Weft lowers
selected typed data operations. Host administration owns identity, approvals,
locks, durable progress/history and native publication. Review markers bind
source meaning; they do not make unsupported conversions safe or constitute a
human approval service. Reviewed drop is immediate irreversible purge; metadata
history is not a backup. MIG-G01–G11 remain explicit capability residuals in the
plan, including arbitrary transforms, existing-column fill, online reconciliation,
retention/reversal, other backends and managed consumer acceptance.
