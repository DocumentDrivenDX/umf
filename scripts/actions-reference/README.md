# Transactional action reference consumer

This is host-only qualification tooling, not a browser library, production service or public HTTP API. Read the [execution guide](../../docs/helix/04-build/guides/actions/execution.md) and [CONTRACT-057](../../docs/helix/02-design/contracts/CONTRACT-057-transactional-action-profile.md).

## Run a safe first example

From the repository root, install with `bun install --frozen-lockfile`, use Bun 1.4.2, start Docker, then run:

```sh
bun run docs:example:native
```

The example creates only its own UUID-named PostgreSQL 17.9 container, binds localhost, validates the server version and initializes store.sql. All issuer data is synthetic. It does not accept a user database URL. Cleanup closes its store and removes its own container in finally. Readiness/version failures are fatal, not skipped.

## Qualification

`bun test --timeout 600000 tests/actions-reference` runs actual native witnesses through the same owned-store harness. Docker/Linux handler isolation requires its separately fingerprinted runtime and a local Unix Docker endpoint; the full campaign includes process/fault witnesses and can be slow. `bun test ./tests/actions/*.test.ts` is portable and does not qualify native execution.

The store serializes its invariant, membership and commit boundary. Raw SQL, external writers, new triggers or ambient handler capabilities fall outside that qualification. Original revisions and outcomes are immutable; do not “reset” by deleting tokens. Restore with uncertain history fences invocation; epoch changes alone are not recovery. Shut down owned tutorial stores, not other developers' containers.

Logical invoke, lookup, preview and readAtLeast are consumer operations. Authentication and replay-discovery authority are explicitly provisioned by trusted host code, separately from request inputs. Follow current scoped evidence in the action acceptance certificate; the guide does not replace native qualification.
