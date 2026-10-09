# Deploy

Document release readiness, deployment checks, monitoring, and operations.

## Microsite

The site source is in [microsite/dist](microsite/dist/index.html). Its live
playground imports the UMF library through [demo.ts](microsite/demo.ts).
The [design guide](../02-design/DESIGN.md) records the visual identity and voice.

[Publish microsite](../../../.github/workflows/microsite.yml) builds the
playground with Bun 1.4.2 and uploads only the static site directory. Pull
requests build without deploying. Pushes to `master` publish to GitHub Pages;
the workflow can also be run manually from Actions on `master`.

GitHub Pages is configured to use Actions. The publication address is
https://documentdrivendx.github.io/umf/; the first publication requires this
workflow and site source to reach `master`. The existing private Sites preview
remains separate.

To revert a site change, revert its commit on `master`; the next workflow run
publishes the previous source. Review the Actions run and the published pages
after a deployment. No repository secret or separate hosting token is required.

The [microsite evidence](microsite-evidence.json) records earlier browser checks
and private-preview deployments. These do not qualify a library release.

## Page signatures

The root and generated action-guide HTML pages carry Innsigle signatures using the approved
[colophon](../../../.innsigle/colo.json). The private signing key is in
1Password's Employee vault, in `Innsigle UMF signing key`. Repository files
contain public keys, attestations and a secret reference, not the private key.

After changing HTML, review any changes to the colophon and re-seal the edited
pages with Innsigle before pushing. Use `.innsigle/AGENTS.md` for the commands.
Actions verifies the signatures and copies the public keys and attestations
into `.well-known/innsigle/` in the published site. Stale or missing signatures
block publication. CI does not receive the signing key.

## Action guide build

Canonical guide text lives in `04-build/guides/actions`. Run `bun run build:docs`; refresh checked source excerpts explicitly with `bun scripts/actions-docs/build.ts --refresh` when changing a public API/example. `bun run test:docs:build` checks deterministic output and nonmutating SVG drift controls; `bun run test:docs:examples` checks public examples; `bun run test:docs:browser` checks all guide routes, keyboard interaction, measured text scaling, mobile/desktop label bounds, links and assets.

`microsite/dist/actions/` alone is generator-owned. Root pages remain authored sources, and the newer explorer/catalog build remains separate. Each diagram has explicit desktop/mobile SVG layouts: titles/descriptions are in source.json; topology and visible labels are authored in render-diagrams.py. HTML embeds SVG bytes and the CSS/JavaScript SHA-256 manifest, so reviewed page signatures bind those diagram bytes and declared asset digests. Browser verification must compare served assets to those bound digests; signatures alone do not fetch or verify remote asset content.

Generate, review, then seal exact final HTML using the pinned CI verifier and existing key custody. Both root and nested action routes are configured for signature verification. CI checks tracked generation before upload, verifies signatures without private keys and publishes public attestations. Preview and verify the `/umf/` base path before merging, and verify the deployed source/asset hashes after the master workflow completes. A release must follow deployment verification, not substitute for it.
