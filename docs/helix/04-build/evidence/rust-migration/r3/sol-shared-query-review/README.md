# Standalone query-domain control

This immutable query control was captured from the TypeScript `inspectTableLifecycle` implementation. Its query output references an exact core Field in the owning module that is intentionally not mapped to any table. A query parameter references an exact Field in another module with unknown extension meaning. The expected diagnostics retain the source order: `TABLES_QUERY_MODULE` followed by `TABLES_OPERATION_MEANING`, both on the foreign parameter. The local standalone output produces no table-binding diagnostic.

Run it against a native replay build with:

```sh
python3 scripts/rust-migration/r3/native-replay.py --binary target/release/examples/r3_replay --fixture docs/helix/04-build/evidence/rust-migration/r3/sol-shared-query-review/query.json --report /private/tmp/umf-r3-query-review.json
```
