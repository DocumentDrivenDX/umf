# Deploy

Document release readiness, deployment checks, monitoring, and operations.

## Microsite

The site source is in [microsite/dist](microsite/dist/index.html). Its live
playground imports the UMF library through [demo.ts](microsite/demo.ts).
The [design guide](../02-design/DESIGN.md) records the visual identity and voice.

[Publish microsite](../../../.github/workflows/microsite.yml) builds the
playground with Bun 1.4.2 and uploads only the static site directory. Pull
requests build without deploying. Pushes to `main` publish to GitHub Pages;
the workflow can also be run manually from Actions on `main`.

GitHub Pages is configured to use Actions. The publication address is
https://documentdrivendx.github.io/umf/; the first publication requires this
workflow and site source to reach `main`. The existing private Sites preview
remains separate.

To revert a site change, revert its commit on `main`; the next workflow run
publishes the previous source. Review the Actions run and the published pages
after a deployment. No separate hosting token is required; the existing
`INNSIGLE_BUILD_KEY` Actions secret signs the site during publication.

The [microsite evidence](microsite-evidence.json) records earlier browser checks
and private-preview deployments. These do not qualify a library release.

## Page signatures

All first-party HTML in the root, Actions and Reference signing inventory is
model-primary content. CI signs every page with the existing build-role key from
`INNSIGLE_BUILD_KEY`. No human-role signature, 1Password session or manual
re-sealing is required. The private key is never committed or printed.

The inventory in `.innsigle/generated-pages.json` must exactly match the HTML
files and configured content globs. `bun scripts/generated-page-seals.ts
--inventory` checks coverage without a secret. CI seals exact final bytes,
publishes public claims into `.well-known/innsigle/`, then checks content digests,
model-primary colophons, the registered build signer and cryptographic signatures.
Missing keys, missing pages, stale bytes or wrong signer roles block publication.
Legacy public human keys/endorsements remain for historical verification only.
See [.innsigle/AGENTS.md](../../../.innsigle/AGENTS.md) for commands.

## Action guide build

Canonical guide text lives in `04-build/guides/actions`. Run `bun run build:docs`; refresh checked source excerpts explicitly with `bun scripts/actions-docs/build.ts --refresh` when changing a public API/example. `bun run test:docs:build` checks deterministic output and nonmutating SVG drift controls; `bun run test:docs:examples` checks public examples; `bun run test:docs:browser` checks all guide routes, keyboard interaction, measured text scaling, mobile/desktop label bounds, links and assets.

`microsite/dist/actions/` alone is generator-owned. Root pages remain authored sources, and the newer explorer/catalog build remains separate. Each diagram has explicit desktop/mobile SVG layouts: titles/descriptions are in source.json; topology and visible labels are authored in render-diagrams.py. HTML embeds SVG bytes and the CSS/JavaScript SHA-256 manifest, so reviewed page signatures bind those diagram bytes and declared asset digests. Browser verification must compare served assets to those bound digests; signatures alone do not fetch or verify remote asset content.

Generate and validate exact final HTML. The pinned CI signer seals all configured root and nested routes with the build environment key, verifies the resulting public signatures and publishes the attestations. Preview and verify the `/umf/` base path before merging, and verify the deployed source/asset hashes after the main workflow completes. A release must follow deployment verification, not substitute for it.
## Domain-pack releases

[Three component releases](domain-pack-release-notes.md) publish the shared loader,
appellate corpus and public-company intelligence corpus at 1.0.0. The website
explorer exposes source metadata and individual collector/qualification tools.
Pages does not build or serve generated ZIPs. Consumers invoke
`scripts/build-domain-pack-releases.ts --output DIRECTORY` to build local archives. HTML and its existing signatures are unchanged.


The [document research tools 1.0.0](document-research.md) publish Supreme Court discovery,
batching/acquisition configuration, SEC qualification harness and scoped local
Spark evidence. Original local-use archives are excluded; live SEC/Databricks
qualification remains pending. CONTRACT-060 governs the source mirror.
