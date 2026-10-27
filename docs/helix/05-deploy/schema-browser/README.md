# UMF schema browser

A reusable, framework-neutral browser for UMF documents, TableSpec tables,
domain packs, source artifact collections and ontology diagrams. This is the
same renderer used by the UMF microsite. Version 2.0.1 ships compiled browser
ESM, TypeScript declarations and static assets. No Bun, Node runtime, framework,
public corpus or network connection to the UMF microsite is required.

## Install and embed

Install the public npm package:

```sh
npm install @documentdrivendx/umf-schema-browser@2.0.1
```

For local release review, install from the built package directory. A site
consumer must pin an exact published package and verify its installed
distribution before deployment.

Version 1.1.0 adds the [versioned host contract](HOST_CONTRACT.md), published
catalog schema, selection/navigation/error events, custom categories, annotations,
themes, bounded lazy sources, revision history and structural comparison. Reusable
property/map/diff components work directly in host DOM. JSON startup uses fixed
build-time validators under strict CSP, with lazy YAML and native recovery.
The microsite installs the exact integrity-locked release and checks the complete
runtime asset closure and workspace markup. See [changes](CHANGELOG.md).

Version 2.0.0 routes the UMF site's ontology, object reference and model catalog
through one host while keeping the standalone and embedding package surfaces.
The package uses the inventoried optional native-schema validator
cohort, which remains separately versioned from UMF core.

Copy `node_modules/@documentdrivendx/umf-schema-browser/assets/` to your static
server, for example `/schema-browser/`. Use a bundler for the exported API, or
serve the package's `index.js` directly as browser ESM.

```ts
import {mountSchemaBrowser} from '@documentdrivendx/umf-schema-browser';

const browser = mountSchemaBrowser(document.getElementById('schema-view')!, {
  assetsUrl: '/schema-browser/',
  catalogUrl: '/my-schema-catalog.json',
  assetBaseUrl: '/my-domain-packs/',
  height: '850px',
});
await browser.ready;
// When unmounting a React/Vue/Svelte component:
browser.destroy();
```

Instead of `catalogUrl`, pass `entries: Entry[]`. An entry supplies `id`, `title`,
`category` (caller-defined), `path`, exactly one `text` or lazy HTTP(S) `url`, and
`format: 'json' | 'yaml'`. Optional `pack`, `packVersion`, `schemaFormat`, `aliases`
and `assets` describe linked pack schemas and verified source downloads. The
exported types describe the complete structure. For a pack, supply its manifest,
declared table/ontology schemas and artifact-collection entries together, using
IDs `pack:<id>@<version>`, `schema:<id>@<version>:<schema-id>` and
`artifact:<id>@<version>:<collection-id>`, as the microsite catalog does.

`initialRoute` takes URLSearchParams syntax (`schema=...&definition=...`). Each
mount owns an iframe: CSS, hash routes, filters and downloads are isolated from
the parent and from other mounts. `iframe` is available on the returned handle
for host sizing/accessibility. `ready` means the catalog and UI initialized. Catalog failures reject the promise
and notify `onCatalogError`; `select(selection)` resolves after source rendering. Calling `destroy` before
load rejects `ready`, so handle that rejection during early unmount.

## Standalone

Serve `assets/` over HTTP(S) and open `assets/index.html`. Replace the empty
`assets/schema-catalog.json` with `{ "version": 1, "entries": [...] }`, or use
Open local schema. Use `?catalogUrl=<encoded-http-url>` to supply a catalog without changing package files, or use the origin-checked configure protocol in HOST_CONTRACT.md. Sources stay in the browser. Relative download URLs resolve
against the catalog host base in the standalone page, or `assetBaseUrl` in an
embed. Only explicitly supplied catalogs are fetched; source originals are
linked for user download and are not automatically acquired.

## Hosting and boundaries

Serve JavaScript as JavaScript and CSS as CSS. Host assets on the same origin,
or configure CORS for module/catalog requests. Your Content Security Policy
can use this tested strict policy for same-origin assets and catalogs (add only sources your host needs):

```text
default-src 'none'; base-uri 'none'; script-src 'self'; style-src 'self'; frame-src 'self' about:; connect-src 'self'
```

No `unsafe-eval`, inline executable script, external font or worker is required. The srcdoc mount inherits the host policy; no base element is inserted. Fixed validators are compiled during the producer build. Arbitrary native semantic compilation is qualified rather than enabled by weakening CSP. Use the standalone page as an ordinary iframe source
when your policy forbids srcdoc. The package has no external font requirement.
This policy is a tested baseline for both embedding forms, rather than a universal
minimum. Optional image display, cross-origin hosting and iframe sandbox/download
permissions are explained in [HOST_CONTRACT.md](HOST_CONTRACT.md). A browser
download does not require the Blob fetch allowance used by byte-readback tests.

Catalogs are caller-selected data; schema source strings are never injected as
HTML or executed. This is source/schema inspection, not a PDF/DICOM viewer,
collector, ontology reasoner or native execution engine. Validation and export
scope remain qualified in the UI. Unknown metadata, original source text,
license/redistribution declarations and original/derived distinctions remain
available. Declared download URLs must resolve to HTTP(S); other schemes are refused. Network fetches and local browser memory are not resource-unbounded
services; the local file picker retains its 4 MB limit.
Lazy pack manifests and ontology companions stay unloaded until selected.
Metadata-dependent details link to their source overview when it is not yet loaded.

## Build

The 2.0.1 producer uses Bun 1.4.2. Build an isolated
package directory and pack it with:

```sh
bun docs/helix/05-deploy/schema-browser/build.ts /tmp/schema-browser-a
cd /tmp/schema-browser-a
npm pack
```

The reusable package contains no sample dataset archives; users supply their
catalog and original assets.

## npm release publication

New releases use [`release-schema-browser.yml`](../../../../.github/workflows/release-schema-browser.yml)
to qualify an exact committed source with frozen dependencies and Bun 1.4.2.
It compares two clean builds, verifies the recorded source closure, installs the
packed archive into a fresh consumer, checks both TypeScript module modes and
runs the installed example in strict-CSP Chromium. Only after those gates pass
does it attach the complete archive/manifest/checksum/receipt cohort to a draft
GitHub release, publish that immutable release and dispatch the main npm
publisher with exact source and archive pins. An explicit main-branch dispatch
selects the source and new release tag; private SDKs and the site's separate
installed-browser pin are outside this route.

If promotion stops after draft creation, pass that draft's numeric
`draft_release_id` with the same tag and source. Actions reruns the complete
qualification and requires the existing draft's exact tag, source and all four
asset digests to match before publication. It does not replace draft assets.
Draft verification uses the release ID because GitHub's tag lookup does not
return the unpublished draft.

The public package `@documentdrivendx/umf-schema-browser` is published only by
the Actions workflow [`publish-schema-browser-npm.yml`](../../../../.github/workflows/publish-schema-browser-npm.yml).
Publishing verifies the exact public GitHub release, immutable tag target,
package provenance, `SHA256SUMS`, release manifest and archive bytes before
using npm OIDC. It accepts an automatic run after an immutable published release
or a default-branch manual backfill with explicit source and digest pins. Legacy
releases without GitHub's immutable flag require all manual tag, source,
`SHA256SUMS` and tarball pins. A registry version must be absent or contain the
identical tarball; an already matching version skips upload and is recorded as
existing exact bytes. A separate clean consumer installs from public npm and
imports the package entrypoint.

GitHub release immutability is enabled for future releases. Attach all assets
while a release is a draft, before publication. Existing releases retain their
original status; `schema-browser-v2.0.0` therefore uses the exact-pin manual
backfill. See [GitHub's release settings](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/establish-provenance-and-integrity/prevent-release-changes).

The main-only `npm` environment and exact package trusted publisher are now
configured, including **Allow npm publish**. The
[qualified 2.0.1 Actions publication](../evidence/schema-browser-npm-2.0.1/README.md)
passed complete producer qualification, actual OIDC upload, exact public-byte
verification and a fresh public-npm install/import. The successful upload at
2026-10-26 22:35:51 UTC validated the pending publisher before its
2026-10-28 19:22 UTC deadline. Independent npm signature and provenance checks
also passed. The historical [2.0.0 verification](../evidence/schema-browser-npm-2.0.0/README.md)
remains an unchanged matching-byte skip, not an OIDC upload claim.

The workflow's only publishing identity is the main-only GitHub `npm`
environment and the npm trusted publisher for `DocumentDrivenDX/umf`, workflow
`publish-schema-browser-npm.yml`. Enable the trusted publisher's **Allow npm
publish** permission; npm treats it separately from staged publishing. See
[npm trusted publishing](https://docs.npmjs.com/trusted-publishers/). No npm
token is stored. The private `@umf/core` development package and its GitHub SDK
archive are not part of this publication.

To reproduce a candidate, build it twice into separate output directories with
Bun 1.4.2, then compare `release-manifest.json` and `asset-manifest.json` byte
for byte. Each output's `provenance.json` records hashes for the actual source,
model, schema, lockfile and renderer inputs; it does not require a fixed source
commit hash in this documentation. Package the reviewed output with `npm pack`
and verify the archive against its `SHA256SUMS` and release manifest. This proves
reproducibility of that source candidate, not publication or a consumer pin.

## License

UMF-authored software in this distribution is available under either the MIT
license or Apache License 2.0, at your option (`MIT OR Apache-2.0`). Bundled third
party software retains its own licenses; see `THIRD_PARTY_NOTICES.md`.

Embedding controls include `hideHero`, `readOnlyLocalFiles`, `theme`, `themeVariables`, `categories`, `focus()` and `onContentHeight`. `height: '100%'` fills a container with an explicit height. Run `bun docs/helix/05-deploy/schema-browser/example-host.ts <package-directory>` for the generic executable integration host.

The installed package also ships `examples/index.html`: serve the package directory over HTTP(S) and open that page for a no-build, strict-CSP host with inline entries, selection callbacks, dark-mode following and focus controls. It contains a tiny authored schema, no public dataset.
