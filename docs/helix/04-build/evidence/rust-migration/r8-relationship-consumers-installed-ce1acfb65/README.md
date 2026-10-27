---
ddx:
  id: umf.evidence.rust-migration.r8-relationship-consumers-installed-ce1acfb65
  type: evidence
  activity: build
  status: captured
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-relationship-consumer-predecessor
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-sdk-ce1acfb65-private-package
      kind: informed_by
---

# R8 installed relationship-consumer replay: source cohort ce1acfb65

The replay used the private package recorded in the linked package provenance
evidence. Archive SHA-256
`5513efdca5ddb98fce9c5f8d9e105b07205bed1ebd8cd7cf87354e912da0a02e` and source
closure SHA-256
`4d4fcdc18399339146e5cb710521f68124833adb5cbba6b19a4543bf07aee0e7` are pinned
in [`receipt.json`](receipt.json). All 1,801 archive-manifest member hashes
were checked before execution. The 18-case frozen predecessor and relationship
fixture/source hashes matched.

Node 26.12.1 and Bun 1.4.3 each passed 18/18 selected cases; Chromium
153.0.8010.12 passed all 15 browser-capable cases with zero page errors and a
request for the archive's WASM binary. Each runtime matched frozen outcomes and
getter traces. The installed root route invoked Rust; `./reference` recorded
zero Rust calls. Accessor refusals entered neither Rust implementation.

PostgreSQL is Node-only in this replay and receives a separately supplied
backend built from the pinned runtime source and `@libpg-query/parser@17.6.10`;
the receipt records the source, schema, dependency, WASM, and backend-bundle
hashes. This does not establish self-contained PostgreSQL support in the archive.

Reproduce from the repository root with:

```sh
bun scripts/rust-migration/r8/relationship-consumers-installed.mjs \
  /private/tmp/umf-r8-sdk-ce1acfb65/umf-sdk.tgz \
  4d4fcdc18399339146e5cb710521f68124833adb5cbba6b19a4543bf07aee0e7 \
  docs/helix/04-build/evidence/rust-migration/r8-relationship-consumers-installed-ce1acfb65/receipt.json
```

This is a bounded installed-package replay of selected relationship-consumer
cases. It does not establish full adapter coverage, declaration retirement,
full-port completion, or release readiness.
