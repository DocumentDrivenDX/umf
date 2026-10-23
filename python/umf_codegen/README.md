# UMF Python client generator

`umf-codegen` exposes the seven Python code generation, deployment, migration,
verification, change discovery, and row-scope operations through the native
Rust compiler in `umf-core==0.11.0`. The package requires that exact core
release and checks its native ABI and codegen protocol before use. It has no
JavaScript or V8 runtime dependency.

```sh
python -m umf_codegen generate --schema plugin.json --package plugin_client --output generated
python -m umf_codegen check --schema plugin.json --package plugin_client --output generated
```

`check` is read-only and exits nonzero for drift or refusal. `generate` refuses
hand-edited output and unsafe paths. At build and runtime, the package checks a
pinned manifest covering exactly nine compiler resources. Five shared core
resources are also byte-compared with the installed `umf-core` wheel; an
incoherent package pair fails with `ENGINE_UNAVAILABLE` and has no fallback.

Each public compiler call uses the `umf` CLI binary packaged inside the pinned
`umf-core` wheel. The package resolves that exact resource and checks the CLI
capability protocol, input and output wire protocols, and all nine resource
hashes before compiling. Missing binaries and mismatched identities fail with
`ENGINE_UNAVAILABLE`; it never searches `PATH` or the current directory.

The parent enforces one monotonic deadline across request validation and
serialization, CLI startup, compilation, and result decoding. It bounds JSON
stdin to 32 MiB and stdout to 64 MiB, kills and reaps a timed-out process, and
returns no partial result. The native CLI caps its live Rust-managed
allocations at 512 MiB. That allocator budget does not cap Python memory or
total process RSS. The 64 MiB wire response limit is a serialized-byte bound;
Python's JSON parser and result objects may use more memory while decoding it.
JSON parsing cannot be interrupted, so an expired deadline is reported
immediately after parsing and throughout result conversion.
Calls accept timeouts greater than zero and up to 60 seconds. The native
binary must be present and pass the installed-wheel qualification before the
platform is considered supported.

The same package exposes inert deployment, migration, verification, and
reviewed change discovery APIs:

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
reviewed_changes = [
    {key: candidate[key] for key in ("id", "kind", "path", "oldDigest", "newDigest")}
    for candidate in candidates
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
index, validation, and reviewed-change selections. Plans retain complete before
and after source bundles and require digest-bound host approval. Verification
checks source/plan consistency; it cannot authenticate a supplied predecessor,
apply DDL, or establish installed ledger authority. Native application belongs
to the separately installed host runtime.

First-party files use MIT OR Apache-2.0. The native core wheel retains its own
license and third-party notices.
