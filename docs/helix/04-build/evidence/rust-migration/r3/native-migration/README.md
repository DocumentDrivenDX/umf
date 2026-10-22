# R3 native migration replay

This checkpoint applies retained Rust-produced migration plans to an isolated local PostgreSQL 18.6 instance. The initial `umf.table-migration/0.1` plan has 84 steps; the forward `umf.table-migration/0.2` plan has 10 steps in three phases, including the `backfill_review` Weft operation. The replay commits both plans and confirms two fixture rows now contain `review_state = 'restricted'`.

`plans.json` is the exact runtime input. `rust-output.json.gz` preserves the two complete native operation envelopes used to extract it. `producer-report.json` identifies the native binary, immutable supplement fixture, operation case count, and exact replay matches. `native-replay.json` records the PostgreSQL result, plan and bundle digests, runtime versions, wheel hash, and source-manifest hash. `source-sha256.json` pins the Rust producer source files and Python lifecycle runtime source closure used by this checkpoint.

The exact runner invocation was:

```sh
PYTHONPATH=python/umf_access/src:/private/tmp/umf-r3-pydeps:/private/tmp/umf-current010-host-20261019/lib/python3.11/site-packages \
  python3.11 scripts/rust-migration/r3/native-postgres-replay.py \
  --dsn 'host=127.0.0.1 port=55439 dbname=postgres' \
  --plans docs/helix/04-build/evidence/rust-migration/r3/native-migration/plans.json \
  --report docs/helix/04-build/evidence/rust-migration/r3/native-migration/native-replay.json
```

The test used cached `umf_codegen` 0.1.0a4 as the installed Python host verifier and Weft 0.4.48 from the wheel hash in the receipt. This qualifies the Rust-produced plan through the existing Python lifecycle and Weft runtime on the recorded PostgreSQL version; it does not qualify a Rust Python binding or broader deployment profiles. The runner refuses existing fixture roles/schema and drops only the objects it created.
