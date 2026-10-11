# Schema browser 1.1.2 release — 2026-10-11

Continuation of [the reviewed follow-up](schema-browser-followup-2026-10-10.md)
and [governed UX plan](../schema-browser-ux-plan.md). The owner authorized
publication and site rollout. Concurrent main had already published 1.1.1 for
reproducible builds, without these accessibility/source-loading fixes; the owner
explicitly selected 1.1.2 after that collision was discovered. Integration
preserves the 1.1.1 identifier-minification correction and the same 64-package
fixed-validator profile, with a versioned 1.1.2 inventory. No public API/catalog
shape change or broader validator support is claimed.

## Public package

Published `@documentdrivendx/umf-schema-browser@1.1.2` to public npm and
[GitHub schema-browser-v1.1.2](https://github.com/DocumentDrivenDX/umf/releases/tag/schema-browser-v1.1.2).
Producer commit: `00755f5d2b76696b14a4750214c66f1209560939`.
Tarball: `documentdrivendx-umf-schema-browser-1.1.2.tgz`, 2,290,558 bytes.
Anonymous public npm and GitHub downloads have identical SHA-256:
`45d559a5d0d4ff22826fb7f00211ea8c320823a6f3aaf403df744c4d0086cd34`.
Attached SHA256SUMS, release.json, provenance.json and release-manifest.json
retain archive and payload custody. The [local release metadata](schema-browser-1.1.2-release.json)
records the same producer and digest. Software is MIT OR Apache-2.0 with bundled
dependency notices; no public dataset corpus is included.

Publication initially required npm login and separate browser second-factor
approval, both completed by the owner. Public version metadata preceded tarball
availability; clean consumer downloads and frozen installation returned 404
until propagation completed. The lockfile pins the public version's verified
SHA-512 integrity; final frozen installation succeeded. No release was overwritten.

## Integrated local release/deployment gates

Producer Bun 1.3.14 on macOS arm64; repository checks Bun 1.4.2; Playwright 1.63.0,
Chromium 153.0.8010.12 and axe-core 4.13.0.

- `bun run typecheck` and `git diff --check` passed.
- `bun test tests/domain-packs`: 98 tests / 26,463 assertions passed. Initial
  sandbox run reached 97 passes but could not start its loopback TLS server;
  the approved replay passed all 98.
- Pinned `scripts/schema-browser-reproducibility.ts` passed two complete clean
  builds and exact installed public runtime/API/declaration byte comparisons.
- Candidate embedding: 95 checks and shipped no-build example passed; installed
  consumer: 14 checks including strict Bundler/NodeNext declarations passed.
- Integrated [accessibility/CSP replay](schema-browser-1.1.2-audit.json): 12 scans,
  zero axe violations, zero SVG paint/obscuration failures, zero unselected-source
  fetch samples and zero page/CSP errors. Keyboard and explicit lazy pack/table/
  ontology navigation passed. Axe SVG incompletes remain supplemented by measured
  paint checks, not promoted to blanket accessibility conformance.
- Assembled site artifact browser: 37 checks across six collections/four aliases;
  no external data or corpus requests.
- After public frozen installation, all 95 embedding checks/no-build example,
  14 independent consumer checks and 37 assembled-site checks passed again.
- Medical subpack check, pinned loader companion check/site assembly and document
  research tools build passed. Tools-only archive gate found no generated ZIPs.
- Action guide build/check, all seven malformed-source/output negative controls,
  portable/refusal/rule examples and browser checks passed. Ten routes at desktop
  and mobile widths had zero page errors or external requests.
- All 16 required page signatures verified. The changed reuse page was sealed
  through the established 1Password-backed CLI with its exact published HTML URI;
  public claims were copied into the site's well-known tree.

The additional integrated audit retains 50 timing samples, but other release
checks ran concurrently; these are diagnostic samples, not a new isolated
performance benchmark. The earlier measured startup evidence retains its own
producer/environment scope and is not relabeled as this published build.

The root package/site pin is exactly 1.1.2. `publish-site.ts` copies the installed
public package and validates every served asset and workspace markup. Production
workflow and live-byte results are recorded below after rollout; local success
alone does not establish deployment.
