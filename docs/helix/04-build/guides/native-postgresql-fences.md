# Explicit PostgreSQL catalog and mutation fences

This guide describes the source candidate for PostgreSQL 18.6. The final installed SDK/compiler and native qualification cohort is still pending. It does not qualify Lakebase deployment or managed Delta mutations. Temporal support remains held.

[CONTRACT-072](../../02-design/contracts/CONTRACT-072-runtime-targets.md) assigns connection, configuration and deployment ownership to the host. [CONTRACT-073](../../02-design/contracts/CONTRACT-073-native-sql-action-profile.md#native-dependency-admission-and-fence) requires a native dependency fence retained through the effect transaction. Catalog hashes and a successful metadata observation alone do not supply that fence.

## Configure the original binding

For an original binding that consumes an admitted PostgreSQL text-search configuration, provide this explicit binding member to the compiler:

```json
{
  "nativeCatalogFence": {
    "version": "umf.pg-ts-fence/0.1",
    "schema": "owned_fence_schema",
    "view": "text_search_catalogs",
    "owner": "owned_fence_maintainer",
    "ownerProfile": "non-login-maintainer/0.1"
  }
}
```

This is a binding fragment, not a complete catalog configuration. Keep the original model, ColumnSets, physical bindings, source hashes and target configuration alongside it. Names must be nonempty PostgreSQL identifiers of at most 63 UTF-8 bytes, without NUL. The compiler retains the descriptor, original lock SQL, native admission and an inert `deploymentProgram` in `obligations.nativeCatalogFence`. It preserves every selected configuration origin, including declared keyword-index effects of a mutation.

The SDK does not create the schema, view, roles or grants. A host deployment owner must review and apply the **original compiler-produced** `deploymentProgram.createViewSql` and `alterOwnerSql`, satisfying its prerequisites first. Do not replace the view with a similarly named view or infer authority from its descriptor.

The approved owner profile requires a dedicated schema/view owner that is non-superuser, has no login, bypass-RLS, role/database creation or replication privileges, and owns the dedicated schema. It needs `MAINTAIN` on exactly these seven base catalogs:

- `pg_catalog.pg_namespace`
- `pg_catalog.pg_proc`
- `pg_catalog.pg_ts_config`
- `pg_catalog.pg_ts_config_map`
- `pg_catalog.pg_ts_dict`
- `pg_catalog.pg_ts_parser`
- `pg_catalog.pg_ts_template`

The application reader needs schema `USAGE` and view `MAINTAIN`, without membership in the owner role. These permissions authorize the native recursive lock; they do not grant catalog writes. Actual native admission checks the view definition, columns, options, observed rewrite dependencies, owner privileges, reader privileges and held relation locks. PostgreSQL omits pinned catalog dependencies from `pg_depend`; the admission matches the observed internal self-dependency rather than inventing seven dependency rows.

## Preserve the transaction boundary

For configuration-consuming reads and searches, the original catalog-view `SHARE NOWAIT` lock is acquired before the first transaction snapshot. Raw page/stream execution retains it for the whole original snapshot transaction, with bounded page memory. Ranked search keeps its original repeatable-read transaction.

All source-exact PostgreSQL action and bulk programs also carry `mutationIndexEffects`: the original complete table inventory, admitted Key/index inventory, native checks and an ordered early table-lock array. Before the first snapshot, the runtime executes every original `SHARE ROW EXCLUSIVE NOWAIT` table lock. The native checks prove those exact modes on the resolved native relations. Mutations retain `SERIALIZABLE`; bulk preview retains `SERIALIZABLE READ ONLY`. Callers need the actual lock privileges on every covered table. An existing `UPDATE` privilege can authorize the lock; a `SELECT`-only dependency table may require an explicit scoped `MAINTAIN` grant. The runtime neither grants nor infers these privileges.

The sequence is: begin, deadline-bounded `SET LOCAL statement_timeout` utility, optional original catalog-view lock, all original mutation table locks, preserved native resolution/context observations, then native admissions and business statements. The utility precedes the locks without assigning a snapshot. No admission `SELECT` runs between the early locks. Native `NOWAIT` failure, invalid deployment, missing privilege or changed metadata refuses or fails through the original outcome/cleanup protocol; there is no retry or silent isolation change.

Neutral bindings use the original caller connection's resolution context. Establish the intended idle session context before invocation; a host callback that changes `search_path` after the first lock cannot retroactively establish what that lock resolved. Qualified bindings retain their original explicit schemas. The SDK does not guess an application schema or rewrite owner SQL.

## Artifact and helper boundaries

Fenced raw reads/searches and all source-exact mutations use original response-family version `0.2`. Request/API versions remain unchanged. The new runtime refuses missing required fence/index proof in older serialized artifacts. The old runtime refuses new response versions; do not alter a response version or copy an obligation onto an older program to make it load.

`umf_access.reviewed.catalog_fence(artifact)` validates and returns the original fence packet. It is a metadata validator, not authentication, a deployment operation, or a statement that the native fence is held. Runtime execution and original native Boolean admissions establish the live boundary. A configuration-free read needs no catalog fence. A configuration-free mutation still requires its original early table-lock and index-effects proof.

The source controls and backward-version tests are retained under `fixtures/access/native-catalog-fence/`, with separate producer source commits and hashes. Earlier ABA witnesses are [retained separately](../evidence/typed-persistence/text-search-aba-red-20261017/). Source controls and individual native lock witnesses do not qualify a later installed application cohort; release evidence must identify its exact SDK, compiler, grants, original programs, actual outcomes and cleanup.
