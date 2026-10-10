import {resolve,join} from 'node:path';
import {installSiteAssets} from './site-assets';
const repo=resolve(import.meta.dir,'../../../..'),site=resolve(import.meta.dir,'../microsite/dist'),output=resolve(process.argv[2]??join(repo,'node_modules/@documentdrivendx/umf-schema-browser'));
const pin=(await Bun.file(join(repo,'package.json')).json()).devDependencies['@documentdrivendx/umf-schema-browser'];
if(!/^\d+\.\d+\.\d+$/.test(pin))throw Error('Schema browser must have an exact release pin.');
await installSiteAssets(output,site,pin);
await Bun.write(join(site,'schema-browser.html'),`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reuse the schema browser · UMF</title><link rel="stylesheet" href="style.css"></head><body><header><a class="brand" href="index.html">umf</a><nav><a href="explorer.html">Schemas</a><a href="docs.html">Developers</a></nav></header><main><section class="page-top"><div class="eyebrow">Reusable tools</div><h1>Your schemas.<br><em>Your browser.</em></h1><p class="intro">Embed the same tables, artifacts and ontology explorer in your own application. Supply your own catalog and host the assets locally.</p></section><section class="section"><h2>Schema browser ${pin}</h2><p>Install by package name from npm. The microsite consumes this exact package version and verifies identical renderer, browser CSS and workspace markup. Framework-neutral browser ESM and TypeScript declarations, with an isolated iframe mount and a standalone page. No end-user Bun runtime, public dataset archive or connection to the UMF microsite is required.</p><p><a class="button" href="https://github.com/DocumentDrivenDX/umf/releases/tag/schema-browser-v${pin}">Download versioned package</a> <a href="schema-browser/README.md">Complete API and hosting instructions</a></p><pre>npm install @documentdrivendx/umf-schema-browser
# Reproducible version pin:
npm install @documentdrivendx/umf-schema-browser@${pin}</pre><p>Copy the installed package’s assets directory to your static server, then mount:</p><pre>import { mountSchemaBrowser } from '@documentdrivendx/umf-schema-browser';

const browser = mountSchemaBrowser(container, {
  assetsUrl: '/schema-browser/',
  catalogUrl: '/my-schema-catalog.json',
  assetBaseUrl: '/my-domain-packs/',
});
await browser.ready;
// On unmount:
browser.destroy();</pre><p>You can also supply entries directly, or use <a href="schema-browser/assets/index.html">the standalone browser</a> with local schema files. Multiple instances keep their own routes, styles and state.</p><p>UMF-authored software is dual licensed MIT / Apache-2.0, at your option. Bundled dependencies retain their <a href="schema-browser/THIRD_PARTY_NOTICES.md">original notices</a>. The package inspects schema metadata; it does not acquire or render PDF/DICOM originals, execute collectors or certify native equivalence.</p></section></main></body></html>`);
console.log('Reusable browser assets and documentation published into site build.');
