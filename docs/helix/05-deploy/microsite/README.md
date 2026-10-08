# UMF microsite schema explorer

Owner direction (2026-10-08): build a browsable schema explorer for domain
packs in the existing microsite. This delivers a read-only metadata consumer
under PRD FR-39/FR-41. Domain-pack ownership and definitions remain with the
parallel pack work; this slice introduces no pack generator or backend execution.

## Build and preview

From the UMF repository root:

```sh
bun docs/helix/05-deploy/microsite/build-explorer.ts
bun docs/helix/05-deploy/microsite/serve.ts
bun docs/helix/05-deploy/microsite/verify-explorer.ts
```

The preview opens at `http://127.0.0.1:4178/explorer.html`. The last command
requires installed Playwright Chromium and the running preview. Override its
origin with `UMF_EXPLORER_URL` and Chromium with `UMF_CHROMIUM_PATH` when needed.

Catalog generation scans `domain-packs/`, `packs/`, `spec/domain-packs/`,
`examples/domain-packs/` and retained `catalog-sources/`. Explicit source
roots may be supplied as positional arguments, replacing default roots.
The build copies selected original sources into `dist/schema-catalog.json`;
browsing performs no source-directory access or external reference fetching.

Each JSON manifest with pack identity, generator and domain types contributes
its metadata and every declared
local schema reference. Canonical source roots take precedence over the same
pack/version in retained snapshots. References escaping the pack directory refuse the
build. Missing or unsupported referenced schemas fail explicitly. UMF documents
are also discovered directly. The legal snapshot contains one pack and eight
TableSpec schemas; `provenance.json` records source identity and fingerprints.
Medical and other packs must be added when their schema files are available;
planned packs are not represented as delivered content.

## Inspection contract

- Search pack/schema names, IDs, descriptions and retained source content.
- Deep links identify catalog entries and definitions; browser history works.
- UMF inspection uses the existing document reader and validator. Core references,
  members, keys, facets, relationships, defaults and unknown extensions remain
  available without asserting native execution or enforcement.
- Legacy TableSpec tables use CONTRACT-030 import/inspection. Their native
  types, column metadata, keys and declared foreign keys remain native declarations.
- Pack metadata and JSON Schema keyword views are source inspection only;
  canonical pack validation, JSON Schema evaluation and generator execution
  are not installed here. Numeric native values display as exact `numberToken`
  carriers rather than rounded JavaScript numbers.
- Local JSON/YAML schema files stay in the browser. Download returns the original
  source. Unsupported or invalid input refuses with a visible message.
- Schema text is rendered as text, never executable HTML. Generator IDs and
  schema references never trigger code execution or network fetching.

## Acceptance and evidence

`verify-explorer.ts` exercises pack links, native foreign keys, field details,
search/empty states, exact decimals, unknown extension retention, inert source
text, source download, invalid/unresolved input, deep links, mobile layout and
navigation on existing routes. Scoped results live in
`../schema-explorer-evidence.json`. These checks do not refresh library/native
conformance, certify all possible packs, or qualify data generation.

The publishing workflow rebuilds the explorer catalog from canonical pack files.
Page signatures must be renewed after published HTML changes; CI verifies them
and copies the public attestations into the site artifact.
