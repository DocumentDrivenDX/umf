# Cross-host Protobuf notice/signature repair

PR27 run38966944489 passed functional/browser checks but its seven reference seals were stale. Exact CI-vs-branch manifest comparison identified only host absolute cache paths in NOTICE and a cold-cache omitted yaml dependency license. The Go compiler/source/runtime outputs otherwise matched.

The builder now downloads the complete already version-pinned module graph, binds all license files, emits sorted portable module names/versions, rejects replacements/ambiguous flattened names, and disables ambient Go workspaces. go.mod is unchanged; go.sum adds10 missing checksum records without removing any. The notice helper is an explicit reference manifest input.

Actual cold/warm Go1.27.1 builds are byte-identical across all27 output files: compiler/WASM bootstrap/worker, NOTICE and23 licenses. Exact npm Bun1.4.2 helper controls pass3tests/10assertions. Independent Astra read-only review verifies the complete report and all current hashes,22 notice module identities,23 licenses and checksum coverage; no actionable finding remains. The reviewer runs no SQL/native compiler build or signing. Parent owns the actual cold/warm build.

Reference/browser/signature/hosted-CI results are separately retained after final combined regeneration; this packet does not replace those gates or qualify native integrations.
