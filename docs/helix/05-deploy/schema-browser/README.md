# UMF schema browser

A reusable, framework-neutral browser for UMF documents, TableSpec tables,
domain packs, source artifact collections and ontology diagrams. This is the
same renderer used by the UMF microsite. Version 1.0.0 ships compiled browser
ESM, TypeScript declarations and static assets; no Bun, Node runtime, framework,
public corpus or network connection to the UMF microsite is required.

## Install and embed

Install the [versioned release tarball](https://github.com/DocumentDrivenDX/umf/releases/tag/schema-browser-v1.0.0):

```sh
npm install https://github.com/DocumentDrivenDX/umf/releases/download/schema-browser-v1.0.0/documentdrivendx-umf-schema-browser-1.0.0.tgz
```

The release includes a SHA-256 digest. This is an npm-compatible software package
distributed through GitHub Releases; npm registry publication is not claimed.
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
`category` (`domain`, `example` or `local`), `path`, exact `text`, and
`format: 'json' | 'yaml'`. Optional `pack`, `packVersion`, `schemaFormat`, `aliases`
and `assets` describe linked pack schemas and verified source downloads. The
exported types describe the complete structure. For a pack, supply its manifest,
declared table/ontology schemas and artifact-collection entries together, using
IDs `pack:<id>@<version>`, `schema:<id>@<version>:<schema-id>` and
`artifact:<id>@<version>:<collection-id>`, as the microsite catalog does.

`initialRoute` takes URLSearchParams syntax (`schema=...&definition=...`). Each
mount owns an iframe: CSS, hash routes, filters and downloads are isolated from
the parent and from other mounts. `iframe` is available on the returned handle
for host sizing/accessibility. `ready` means the document and module loaded;
catalog errors are displayed in the frame's status. Calling `destroy` before
load rejects `ready`, so handle that rejection during early unmount.

## Standalone

Serve `assets/` over HTTP(S) and open `assets/index.html`. Replace the empty
`assets/schema-catalog.json` with `{ "version": 1, "entries": [...] }`, or use
Open local schema. Sources stay in the browser. Relative download URLs resolve
against the catalog host base in the standalone page, or `assetBaseUrl` in an
embed. Only explicitly supplied catalogs are fetched; source originals are
linked for user download and are not automatically acquired.

## Hosting and boundaries

Serve JavaScript as JavaScript and CSS as CSS. Host assets on the same origin,
or configure CORS for module/catalog requests. Your Content Security Policy
must permit the frame, its module scripts and local styles; the srcdoc mount
inherits the host policy. Use the standalone page as an ordinary iframe source
when your policy forbids srcdoc. The package has no external font requirement.

Catalogs are caller-selected data; schema source strings are never injected as
HTML or executed. This is source/schema inspection, not a PDF/DICOM viewer,
collector, ontology reasoner or native execution engine. Validation and export
scope remain qualified in the UI. Unknown metadata, original source text,
license/redistribution declarations and original/derived distinctions remain
available. Declared download URLs must resolve to HTTP(S); other schemes are refused. Network fetches and local browser memory are not resource-unbounded
services; the local file picker retains its 4 MB limit.

## Build

Maintainers run `bun docs/helix/05-deploy/microsite/build-explorer.ts`, then
`bun docs/helix/05-deploy/schema-browser/build.ts`, and `npm pack` in the output
directory. Bun 1.3.14 is a build dependency only. The reusable package contains
no sample dataset archives; users supply their catalog and original assets.

## License

UMF-authored software in this distribution is available under either the MIT
license or Apache License 2.0, at your option (`MIT OR Apache-2.0`). Bundled third
party software retains its own licenses; see `THIRD_PARTY_NOTICES.md`.
