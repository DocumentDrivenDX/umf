# Declarative typed-access binding fixtures

U-2 / CONTRACT-042, subset `typed-access-columns/0.1`, binding 0.2.0,
logical core 0.8.0. These synthetic fixtures demonstrate direct Record/Field
storage declarations for `lakebase`, `unity-catalog` and `spark-delta`.
Version strings are opaque authored identities; even numeric `17` is not a
native qualification. The `warehouse-profile-A` and `spark4-delta4` values
intentionally exercise comparison without version parsing.

Each binding pairs with `logical.json`. ColumnSet matching passes its exact
`{platform,majorVersion}` and binding module `sales` to
`inspectRawTableBinding`. Example: the Lakebase target is
`{platform:"lakebase",majorVersion:"17"}`. The profile may declare only some
physical Field columns; CONTRACT-067/070 consumers must separately verify their
selected ColumnSet coverage and native facts. No native column types, defaults,
generation, indexes, SQL or enforcement are qualified by these fixtures.

Run `bun test tests/binding/raw-profiles.test.ts` and
`bun scripts/binding/raw-profiles-browser.ts`. Evidence is under
`docs/helix/04-build/evidence/typed-persistence/raw-binding-profiles/`.
