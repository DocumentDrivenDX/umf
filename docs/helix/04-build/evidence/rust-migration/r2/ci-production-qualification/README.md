# Hosted R2 qualification

[index.json](index.json) binds six successful GitHub Actions jobs to their source-bound
receipts. Each receipt preserves its synthetic merge source commit; its full Git tree
equals reviewed head `06b108a03cb86c1786afead2ced7d32af55a7f14`. All six share the
439-file closure `2896e4e122cad5e2fde4b4ef04789fddfddb350e8fb054c3a5bc57ed2c83c1cd`.

The recorded synthetic CI merge commit must be available in the local Git object
store (it was fetched from `refs/pull/43/merge` during qualification). From the
repository root, with Python 3.11+, reproduce the supplied-evidence check:

```sh
python3 docs/helix/04-build/evidence/rust-migration/r2/ci-production-qualification/verify-ci-receipts.py --repo . --skip-current --expected-tree-commit 06b108a03cb86c1786afead2ced7d32af55a7f14 docs/helix/04-build/evidence/rust-migration/r2/ci-production-qualification/*-python-*.json
```

This historical replay checks committed source bytes, raw output/report consistency,
input bindings, host counts, runtimes and archive/artifact metadata relations. The
original verification also checked current bytes before the evidence-only follow-up.
The hosted Sol review separately verifies that all439 qualified source bytes remain
unchanged by that follow-up; `--skip-current` avoids requiring its entire Git tree
to equal the earlier tree merely because new evidence files were added. The
independent Sol delivery review additionally authenticates six distinct job/platform/
interpreter tuples, exact67 input bindings and raw public-suite summaries. Receipt
archive ZIP digests were compared to GitHub's artifact digests before extraction.
Production binary bytes were not downloaded; their sizes and digests are CI observations
and internal receipt relationships. No publication or platform beyond these cohorts
is established by this record.
