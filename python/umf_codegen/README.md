# UMF Python client generator

Local `0.1.0a1` candidate; publication and platform qualification are pending.
The installed wheel runs the original portable TypeScript generator inside
embedded V8. Authors need Python and `mini-racer==0.14.1`, without Bun, Node,
a JavaScript subprocess, an SDK tarball or a network connection during generation.
Generated clients use the Python standard library only.

```sh
python -m umf_codegen generate --schema plugin.json --package plugin_client --output generated
python -m umf_codegen check --schema plugin.json --package plugin_client --output generated
```

`check` is read-only and exits nonzero for drift or refusal. `generate` refuses
hand-edited output and unsafe paths. Pin release wheel hashes and the embedded
runtime version in your build lock; a candidate wheel is not a release guarantee.

The same wheel exposes inert `compile_table_deployment` / `verify_table_deployment`
and `compile_table_migration` / `verify_table_migration` Python APIs. They call the
original portable compiler in the same bounded embedded runtime:

```python
from umf_codegen import compile_table_migration, verify_table_migration

result = compile_table_migration(
    migration_id="001", predecessor=None,
    previous_bundle=None, next_bundle=deployment_bundle,
)
if result["status"] == "compiled":
    plan = verify_table_migration(result["plan"])
```

Initial, append-table/index and declared-command revision plans retain both complete source bundles, require
digest-bound host approval and report `nativeQualified:false`. Verification
checks consistency; it cannot authenticate a supplied predecessor, apply DDL or
establish installed ledger authority. Command-only revisions have no DDL steps and still require a new approved ledger
generation. Seed execution and changes to existing columns, constraints, policies
or indexes remain explicit refusals in this plan subset.

First-party files use MIT OR Apache-2.0. Bundled dependencies retain the notices
in `_assets/notices/`; mini-racer retains its own ISC license and V8 notices.
