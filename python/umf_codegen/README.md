# UMF Python client generator

Local `0.1.0a3` candidate; publication and platform qualification are pending.
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

The same wheel exposes inert deployment, migration, verification and reviewed
change discovery APIs. They call the original portable compiler in the same
bounded embedded runtime:

```python
from umf_codegen import (
    compile_table_migration,
    discover_table_migration_changes,
    verify_table_migration,
)

result = compile_table_migration(
    migration_id="001", predecessor=None,
    previous_bundle=None, next_bundle=deployment_bundle,
)
if result["status"] == "compiled":
    plan = verify_table_migration(result["plan"])

candidates = discover_table_migration_changes(previous_bundle, next_bundle)
# G03 default-change discovery is opt-in; omitting options preserves the
# historical candidate set and request shape.
default_candidates = discover_table_migration_changes(
    previous_bundle, next_bundle,
    options={"version": "umf.table-migration-discovery/0.2"},
)
reviewed_changes = [
    {key: candidate[key] for key in ("id", "kind", "path", "oldDigest", "newDigest")}
    for candidate in default_candidates
]
```

Discovery recompiles and verifies both complete deployment bundles. Candidate
`oldValue` and `newValue` fields explain the change; submit only the five marker
fields shown above. A supported type conversion additionally requires the
explicit `conversion: "pg-cast-v1"` choice. Candidates identify source changes,
but do not grant execution authority or make unsupported changes executable.

Migration plan 0.1 remains the historical bootstrap/additive profile. Migration
plan 0.2 is a bounded existing-table evolution profile requiring an installed
predecessor and stable table inventory. It uses explicit backfill, concurrent
index, validation and reviewed-change selections. Plans retain complete before
and after source bundles and require digest-bound host approval. Verification
checks source/plan consistency; it cannot authenticate a supplied predecessor,
apply DDL or establish installed ledger authority. Native application belongs to
the separately installed host runtime. See the repository's legal table
lifecycle guide for the exact supported subset and residual limits.

First-party files use MIT OR Apache-2.0. Bundled dependencies retain the notices
in `_assets/notices/`; mini-racer retains its own ISC license and V8 notices.
