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
