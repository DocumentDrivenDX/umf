# Microsite visual rendering migration

Owner request, 2026-11-02: the existing UMF microsite embeds the independently
released umf.visual library and uses its Lini renderer for the schema browser
and other graphical renderings. No copying of schema views into the visual
catalog, core vocabulary change, or private sibling-source dependency is intended.

The installed HELIX catalog is
`helix/0.20.0/workflows/graph.yml`; no methodology files are copied here.
CONTRACT-001 governs source preservation and qualified identity. CONTRACT-077
governs the generated reference and exact released schema-browser consumption.
The sibling library's CONTRACT-089 owns presentation rendering and its loss
reports. Existing native-adapter execution evidence is unaffected by a diagram
projection and cannot qualify it.

## Execution scope

- Project records and binary relationships into umf.visual documents with
  reversible source-to-drawing identity maps. Keep full source declarations,
  annotations, direction, self references and parallel declarations distinct.
  Unresolved endpoints remain inspectable with an explicit drawing limitation.
- Replace the shared schema-browser handwritten SVG renderer. Preserve focus,
  full-model navigation, keyboard activation, annotations, structural diff,
  local-file operation and error reporting. Native WASM stays in the renderer
  dependency, outside the portable UMF library.
- Remove the ontology host's SVG geometry rewriting. Retain viewport fit,
  zoom and pan without changing native drawing coordinates.
- Replace the home-page fabric illustration and eight action-guide diagrams
  with source-bound umf.visual/Lini renderings. Retain original panel text,
  explanatory boundaries, desktop/mobile variants and source downloads.
- Pin the public visual release and renderer assets, record licenses and asset
  hashes, and include their bytes in package/reference build provenance. Do not
  patch the installed released schema browser to simulate a new release.

## Acceptance and current evidence

`tests/domain-packs/visual-model.test.ts` exercises distinct identities under
duplicate labels, parallel edges, self references, dangling endpoints, focus
changes, detached source preservation and refusal of duplicate identities.
Current run: four tests / nineteen assertions pass in Bun 1.4.3.

Completion requires the public renderer dependency, successful type/build checks
and real Chromium interaction checks under the site's CSP. Inspect dynamic
local-file rendering, escaping of untrusted labels, update/destroy races,
directed versus undirected connections and full-model size. Verify action-guide
source/render drift controls and responsive diagram containment. Regenerate
package manifests and page attestations through their existing owner workflows;
do not claim a published package or signed deployment from local previews.

## Dependency coordination

The sibling main checkout is an older extraction with concurrent integration
work. Its coordination note identifies `/private/tmp/umf-visual-review` as the
newer presentation implementation. The `UMF Visuals` chat has been asked, with
explicit owner authorization, for a public browser renderer API and release if
needed. The renderer is merged upstream at
`049caab921ee61e551f992562b06d37f3eef9a3f`, published as [v0.5.0](https://github.com/DocumentDrivenDX/umf-visual/releases/tag/v0.5.0).
The public `/renderers/lini` API returns SVG, native version, identity maps and
projection diagnostics; `/renderers/lini/assets/*` supplies verified runtime
bytes and their license. Explicit visual model 1.3.0 supports undirected edges;
UMF documents retain core 0.10.0. The native engine remains Lini 1.1.0. A local
copy of built package artifacts was used for candidate checks while publication
was pending. Final checks install the public archive through the committed
Bun 1.4.2 lockfile, not that candidate. The public renderer entry SHA-256 is
`3502f2ca6ac802f0c3db513b18455362536179178c388446a4e3d0ea736d2f2f`.
No private source import or private package pin is committed.


## Observed verification

- Both TypeScript configurations pass. Reference source boundaries pass.
- Domain-pack regression: 107 tests passed in the initial run. Its one loopback
  TLS failure was a sandbox listener restriction; the complete 11-test loader
  file passed with the required listener permission. The subsequent identity
  test adds the prototype-named case recorded above.
- Focused Chromium 153.0.8010.12: 17 checks cover source identity, untrusted
  labels, directed/headless/self/parallel edges, native endpoint/arrowhead
  correspondence, focus/full model, 32 records, asynchronous update/destroy,
  mobile containment and strict parent CSP without eval or inline styles.
- Packed schema-browser 2.1.0 candidate: 17 installed-browser checks pass.
- Embedding harness: 96 checks pass, including selection completion after native
  drawing, separate worker CSP, independent SVG fragments, revisions, annotations,
  local files and original native-download fixity. The no-build example passes.
- Candidate reference: 17 journeys pass at 1440/1280/798/390 pixels, including
  all 15 metamodel records and 17 connections, native geometry, keyboard routes,
  focus/history, zoom/pan, YAML/JSON download correspondence, workbench and
  tampered-source refusal. This is source inspection, not native enforcement.
- Action guide: all ten pages pass at 1440/390 pixels, including bounds,
  descriptions, responsive figures, zoom and local links; no external requests
  or page errors. Render-drift control rejects changed SVG without repair.

Raw browser receipts/screenshots remain local ignored run output under the
existing repository policy. Reproduce with `bun run test:visuals:browser`,
`bun scripts/schema-browser-package-browser.ts dist/schema-browser`,
`bun scripts/schema-browser-embedding-browser.ts dist/schema-browser`, and
`bun scripts/reference/ontology-browser.ts`. Reference builds require the
repository's Bun 1.4.2 and Go 1.27.1 toolchains; renderer checks above used Bun
1.4.3. No broad browser, graph-size or native-format equivalence is claimed.
The public renderer's 250,000 UTF-16-unit payload limit refuses explicitly;
source projection does not truncate to fit it.

## Release boundary

The current microsite still pins the published schema browser 2.0.0. Its existing
layout remains in an explicitly gated compatibility path. The 2.1.0 source
candidate uses native Lini geometry exclusively. Publishing that package and
updating the exact microsite pin is a separate release gate; an installed package
is never patched to simulate it. Candidate preview uses:

```sh
bun docs/helix/05-deploy/schema-browser/build.ts
bun docs/helix/05-deploy/schema-browser/preview-site.ts dist/schema-browser
bun scripts/reference/build.ts --candidate dist/schema-browser
```

The last command must run with pinned Bun 1.4.2. The normal build retains exact
published-package verification. CI separately builds and tests the new source
candidate. No public schema-browser release, site deployment or renewed page
attestation is claimed by these local results.


The final public-package run passes both TypeScript configurations, eight
focused source/embedding tests (76 assertions), and 17 focused Chromium checks.
The normal installed-2.0 reference build and its 17 browser journeys also pass;
compatibility behavior is preserved until the independent browser release.
The source candidate is built with Bun 1.4.2. Pinned native font/icon license
texts and their upstream manifest travel with the runtime in both package asset
locations and the reference host, in addition to the Lini license.

## 2.1 publication integration — 2026-11-02

The owner explicitly requested schema-browser 2.1 publication, an exact microsite
pin update and deployment. The renderer port is integrated on current main
`22e24acfd921958c08d723c8370959a26558ba08`, preserving the Rust/WASM-owned
structural comparison runtime and the 2.0.1 license/publication fixes. The parent
CSP permits WebAssembly compilation while continuing to deny JavaScript eval;
Lini's same-origin worker has its separate execution policy. Both native runtime
asset families are copied from the verified package by the reference host.

The release driver uses the source-bound Rust producer, Rust 1.90.0,
wasm-bindgen 0.2.100, Bun 1.4.2 and frozen Cargo/npm dependency locks. Transitive
local Cargo and patched vendor source inventories are included; bounded parallel
reads preserve their deterministic ordering. The generated WASM loader remains
an external, packaged runtime resource rather than an unresolved generated source
input. Immutable release source qualification and trusted npm OIDC publishing
remain separate from the subsequent consumer pin and signed site deployment.

Integrated checks so far: 20 package/projection/embedding/integrity tests with
138 assertions; two Rust provenance controls with 16 assertions; 17 focused Lini
Chromium checks; and all ten action-guide pages at 1440 and 390 pixels, with zero
external requests or page errors. These checks do not yet claim successful
publication or deployment. The full source-bound package/browser qualification
and public receipt will establish those later milestones.

The integrated source-bound package assembled with Bun 1.4.2 and verified all
113 packaged files without unresolved generated-source inventory entries.
Strict-CSP Chromium embedding then passed 96 checks plus the installed no-build
example. WASM initialization exposed early-click/file-upload races: controls now
remain disabled until initialization is ready, and standalone file qualification
waits for the actual initialized control. The deployment workflow builds the
native binding required by current domain schema graph tests. Reference API
extraction explicitly maps the newly declared `./runtime/wasm` entrypoint to its
binding declarations, retaining unassessed runtime support status.
