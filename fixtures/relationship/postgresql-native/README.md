# PostgreSQL native relationship counterexamples

`constraints.sql` is native DDL, not an authored UMF relationship. The pinned
PostgreSQL 17.4 oracle records a `NOT VALID` FK to an alternate UNIQUE key and
a composite `MATCH SIMPLE` FK. `oracle.json` captures catalog state and source
fingerprints; `browser.json` checks the same parse/deparse/archive behavior in
Chromium. No result claims that existing rows satisfy either relationship or
that a native FK establishes lifecycle ownership.

Regenerate with `bun scripts/relationship/postgresql-native-oracle.ts`, then
`bun run build && bun run build:postgresql && bun
scripts/relationship/postgresql-native-browser.ts`.
