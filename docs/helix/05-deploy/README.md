# Deploy

Document release readiness, deployment checks, monitoring, and operations.

## Microsite

The site source is in [microsite/dist](microsite/dist/index.html). Its live
playground imports the UMF library through [demo.ts](microsite/demo.ts).
The [design guide](../02-design/DESIGN.md) records the visual identity and voice.

[Publish microsite](../../../.github/workflows/microsite.yml) builds the
playground with Bun 1.3.14 and uploads only the static site directory. Pull
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

The four HTML pages carry Innsigle signatures using the approved
[colophon](../../../.innsigle/colo.json). The private signing key is in
1Password's Employee vault, in `Innsigle UMF signing key`. Repository files
contain public keys, attestations and a secret reference, not the private key.

After changing HTML, review any changes to the colophon and re-seal the edited
pages with Innsigle before pushing. Use `.innsigle/AGENTS.md` for the commands.
Actions verifies the signatures and copies the public keys and attestations
into `.well-known/innsigle/` in the published site. Stale or missing signatures
block publication. CI does not receive the signing key.

## Domain-pack releases

[Three component releases](domain-pack-release-notes.md) publish the shared loader,
appellate corpus and public-company intelligence corpus at 1.0.0. The website
explorer exposes their original-source assets and complete ZIPs. The Pages build
runs `scripts/build-domain-pack-releases.ts` after loader packaging and before
rebuilding the catalog; deterministic ZIP bytes keep website and release hashes
aligned. HTML and its existing signatures are unchanged.
