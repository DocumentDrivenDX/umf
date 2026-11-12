# Deploy

Document release readiness, deployment checks, monitoring, and operations.

## Releases

Releases are tag-driven: push `umf-vX.Y.Z` from `main` and `.github/workflows/release.yml` tests, builds, smoke
tests and publishes (see the repository [CHANGELOG](../../../CHANGELOG.md) and AGENTS.md). Nothing is published from a
developer machine.

## Microsite

The site is built from source by `.github/workflows/pages.yml` (`bun scripts/site/build.ts`): the hand-written pages
in `site/` plus the playground ([demo.ts](microsite/demo.ts)), the schema explorer, the reference, the Actions guide,
Pack Tools and the loader companions are assembled in `microsite/dist` (never committed) and deployed to
https://documentdrivendx.github.io/umf/. Every page footer carries the version stamp from `spec/release.json` and
`git describe`; `version.json` has the same data. The [design guide](../02-design/DESIGN.md) records the visual
identity and voice. To revert a site change, revert its commit on `main`.

## Action guide build

Canonical guide text lives in `04-build/guides/actions`. Run `bun run build:docs`; refresh checked source excerpts explicitly with `bun scripts/actions-docs/build.ts --refresh` when changing a public API/example. `bun run test:docs:build` checks deterministic output and nonmutating SVG drift controls; `bun run test:docs:examples` checks public examples; `bun run test:docs:browser` checks all guide routes, keyboard interaction, measured text scaling, mobile/desktop label bounds, links and assets.

`microsite/dist/actions/` alone is generator-owned. Root pages remain authored sources, and the newer explorer/catalog build remains separate. Each diagram has explicit desktop/mobile SVG layouts: titles/descriptions are in source.json; topology and visible labels are authored in render-diagrams.py. HTML embeds SVG bytes and the CSS/JavaScript SHA-256 manifest, so reviewed page signatures bind those diagram bytes and declared asset digests. Browser verification must compare served assets to those bound digests; signatures alone do not fetch or verify remote asset content.

## Domain-pack releases

Three component releases publish the shared loader,
appellate corpus and public-company intelligence corpus at 1.0.0. The website
explorer exposes source metadata and individual collector/qualification tools.
Pages does not build or serve generated ZIPs. Consumers invoke
`scripts/build-domain-pack-releases.ts --output DIRECTORY` to build local archives.


The [document research tools 1.0.0](document-research.md) publish Supreme Court discovery,
batching/acquisition configuration, SEC qualification harness and scoped local
Spark evidence. Original local-use archives are excluded; live SEC/Databricks
qualification remains pending. CONTRACT-060 governs the source mirror.
