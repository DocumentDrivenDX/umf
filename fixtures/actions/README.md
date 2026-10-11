# Action fixtures

Start with the [beginner guide](../../docs/helix/04-build/guides/actions/index.md).

`approve.json` declares one literal status assignment. Its `reference-roles/1` profile is opaque: portable inspection is valid but incomplete. The native tutorial explicitly copies it, selects `umf.actions.roles/1`, and provisions trusted authority; do not infer those grants from the original JSON.

`tutorial-postcondition.json` is a distinct strengthened declaration for explicit portable rule evaluation, not a new native execution qualification.

`create-link.json` creates an explicitly keyed order before linking its customer and product. `composite-key.json` preserves ordered Key components. `association-record.json` is a declaration fixture, not proof of native Association-Record execution. `ddd-binding.json` demonstrates explicit optional DDD association, not implicit action generation.

`cases.json` and `tests/actions/case-corpus.ts` define shared portable decisions. `browser.json` records the qualified 44-case browser corpus. Native foundation and graph-oracle records have their own scope; never replace native store witnesses with fixture validation.

Run `bun run docs:example` for the portable tutorial. The optional `bun run docs:example:native` owns a disposable PostgreSQL 17.9 container and synthetic authority, and removes its own container on failure or completion.
