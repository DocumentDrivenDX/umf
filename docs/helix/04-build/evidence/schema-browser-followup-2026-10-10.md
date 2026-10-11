# Schema browser follow-up execution — 2026-10-10

Continuation of [the governed UX plan](../schema-browser-ux-plan.md), FEAT-009,
CONTRACT-052 and CONTRACT-061. Generic fixtures name no consuming project.
Source inspection, exact source preservation and qualified adapter behavior
remain the contract; annotations do not establish authority and structural diff
does not establish semantic compatibility.

## Changes and review

The owner authorized Astra Ultra review and execution. Astra found eager loading
of unselected pack companions, unreadable SVG relationship-number paint and
annotation/parallel-edge geometry gaps. Corrections load only the selected source,
expose unloaded pack metadata through an explicit overview link, preserve lazy
table/ontology navigation, make source panes keyboard reachable, and correct
light/dark status colors, annotation spacing and parallel badge clearance.
The final six-record fixture includes the second row that exposed the last
geometry issue. Astra's final scoped review found no remaining concrete blocker.

README/HOST_CONTRACT now share this tested same-origin policy:

```text
default-src 'none'; base-uri 'none'; script-src 'self'; style-src 'self'; frame-src 'self' about:; connect-src 'self'
```

This is a tested baseline, not a universal minimum. Optional images, external
asset/catalog origins and sandboxing need their documented permissions. Srcdoc,
standalone catalog URL and an actual source-companion download passed with no
unsafe-eval or base violation. A download event checks exact bytes without a
blob fetch. Axe alone needs inline probe styles, permitted only on its audit page.

## Checks and provenance

Root frozen dependencies installed successfully with Bun 1.4.2; initial sandbox
attempts failed EPERM in temporary directories. Browser serving also required
approved execution outside the sandbox. The lockfile did not change. Axe 4.13.0
and the release builder's Bun 1.3.14 were installed in temporary directories.
Pinned builds place Bun 1.3.14 first on PATH, including child build processes.

Passed commands (repository root):

```text
bun install --frozen-lockfile
bun run typecheck
bun test tests/domain-packs/schema-browser-embedding.test.ts tests/domain-packs/schema-browser-package.test.ts tests/domain-packs/schema-browser-site-parity.test.ts tests/domain-packs/ontology-layout.test.ts
PATH=/private/tmp/umf-bun-toolchain/node_modules/.bin:$PATH bun docs/helix/05-deploy/schema-browser/build.ts /private/tmp/umf-browser-candidate
/private/tmp/umf-bun-toolchain/node_modules/.bin/bun scripts/schema-browser-embedding-browser.ts /private/tmp/umf-browser-candidate
/private/tmp/umf-bun-toolchain/node_modules/.bin/bun scripts/schema-browser-package-browser.ts /private/tmp/umf-browser-candidate
/private/tmp/umf-bun-toolchain/node_modules/.bin/bun docs/helix/04-build/verification/schema-browser-followup.ts /private/tmp/umf-browser-candidate /private/tmp/umf-browser-candidate-final.json
bun node_modules/typescript/bin/tsc --ignoreConfig --noEmit --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --skipLibCheck --target ES2022 --module ESNext --moduleResolution Bundler --types bun docs/helix/04-build/verification/schema-browser-followup.ts
git diff --check
```

Results: 9 unit tests / 139 assertions; 95 embedding browser checks plus the
shipped no-build example; 14 installed-tarball consumer checks with Bundler and
NodeNext declaration resolution. The installed 1.1.0 embedding baseline also
passed its 95 checks. Native recovery qualification and exact bytes remain
covered by that suite, including the existing Avro limitation.

Two clean candidate builds using Bun 1.3.14 have identical complete SHA256SUMS.
The retained [candidate payload digests](schema-browser-followup-2026-10-10-SHA256SUMS)
and [machine report](schema-browser-followup-2026-10-10.json) identify tested assets.
The source version is 1.1.1 unreleased; published package/site pins remain 1.1.0.
Registry, release signing and deployment were not performed.

## Accessibility and request closure

Chromium 153.0.8010.12 / Playwright 1.63.0 / axe-core 4.13.0: 12 scans across
light, dark and automatic-dark themes, iframe table/Commerce and direct table,
map and diff components. Zero axe violation groups, zero manual SVG paint or
badge-obscuration failures, zero page/CSP errors. Mobile catalog Escape, record
keyboard activation, focus entry and Tab return to the host passed. Visual review
of the dark six-record fixture confirmed distinct badges and second-row clearance.

Axe retains incomplete SVG contrast results (15 direct / 29 Commerce nodes per
scan); browser-computed foreground/background paint checks supplement these.
This establishes the tested fixtures, not full WCAG conformance, arbitrary-graph
layout coverage or cross-engine accessibility. Custom host colors need their own
contrast verification. [Light](schema-browser-followup-2026-10-10-light-components.png),
[dark](schema-browser-followup-2026-10-10-dark-components.png) and
[automatic](schema-browser-followup-2026-10-10-auto-components.png) screenshots remain.

The retained [1.1.0 baseline](schema-browser-followup-2026-10-10-baseline.json)
reported 18 axe violation groups, six manual failures and ten table samples
fetching unselected sources. Candidate: zero of each. The pack-linked selection
requests only its selected source; explicit pack/table/record navigation then
loads the requested documents and retains cross-links. Original source strings
remain exact. Earlier audit failures included hidden mobile catalog visibility,
hash-sensitive frame lookup and axe probe-style CSP noise; the harness now checks
attached catalog content and separates probe styles from product policy tests.

## Startup measurement

Apple M5 Max, macOS arm64; headless Chromium; 1280×1000 viewport; loopback with
gzip level 9, no CPU/network throttling. Fifty samples: five fresh browser-context
mounts and five cached remounts for each fixture. Timers begin at mount **after
the host and API module have loaded**; host component CSS is already cached.
These exclude full host-page startup. Selection completion uses the initial
onSelect event, not a duplicate select call. Render timing waits two animation
frames after that event; it is a render proxy, not a browser paint metric.

| Fixture | Fresh-context ready median | Source-complete median | Render proxy median (range) | Cached remount render median (range) |
| --- | ---: | ---: | ---: | ---: |
| Tiny inline JSON | 41.6 ms | 41.8 ms | 64.3 ms (61.3–412.8) | 37.8 ms (31.4–40.0) |
| Commerce model | 56.2 ms | 56.5 ms | 62.1 ms (60.2–65.8) | 37.8 ms (35.6–39.2) |
| Claims table | 45.1 ms | 45.2 ms | 63.0 ms (55.6–65.6) | 36.6 ms (35.0–36.8) |
| Tiny YAML | 32.3 ms | 53.8 ms | 81.3 ms (80.0–194.1) | 37.5 ms (35.3–37.8) |
| Lazy JSON | 34.2 ms | 42.8 ms | 65.7 ms (63.6–75.4) | 38.6 ms (36.5–40.3) |

Retain the first-run outlier rather than deleting it. Initial JSON JavaScript
closure is 829,225 decoded bytes / 107,087 gzip bytes across 12 files; the entry
alone is 80,508 / 26,042 bytes. YAML adds lazy readers. Optional native recovery
adds a large adapter chunk (11,828,517 decoded / 955,861 gzip bytes) and related
readers; one recovery sample took 2,336.3 ms. That single sample is not a benchmark.
Compiler versions change chunk layout, so entry size alone does not establish
optimization. The consumer's older 0.85-second measurement has different scope
and environment; no comparative speedup is claimed. Further native recovery
size/latency optimization needs a separately bounded measurement and plan.
