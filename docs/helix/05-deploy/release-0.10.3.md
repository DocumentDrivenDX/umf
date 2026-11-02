---
ddx:
  id: umf.release.0.10.3
  type: release-notes
  activity: deploy
  status: draft
  authoring:
    home: repo
  links:
    - id: CONTRACT-083
      kind: informed_by
    - id: CONTRACT-907
      kind: informed_by
    - id: ADR-006
      kind: informed_by
---

# UMF SDK 0.10.3 / Python 0.10.7 — release candidate

## Release Scope

The candidate adds the Lakeview 0.2.0 explicit composition adapter to the current
Rust runtime and SDK roots, fixes immutable resource publication after racing
initializers, and completes the packed native binding's JavaScript/type closure.
It also retains the genuine host-only handler timing diagnostics and independent
ontology browser assertions from outstanding work. The current Rust pack-tools
workspace is included in rebuildable Python source archives.
Core documents remain 0.10.0. Existing public archives remain unchanged.

## Audience and Channels

SDK consumers use qualified GitHub archives. Python publication requires selected,
verified wheels and the existing trusted publisher. Version reservation is not
publication: hosted, installed-artifact and platform gates must pass first.

## Highlights

Lakeview exposes explicit Record/Field declarations and retains untouched UTF-8
originals, numeric lexemes and unknown native content through direct/JSON/YAML
paths. Unsupported edits refuse. Native validator activation is caller-selected.

## Changes and Fixes

One shared primitive returns the published immutable instance when another
initializer wins. All 31 affected sites retain their admission and cache-eligibility
rules; no caller work or callbacks run under an initialization lock. A concurrent
regression rejects the prior algorithm. Product execution and cleanup limits remain unchanged. Native regression commands
use the existing isolated test runner (30-second harness default), rather than
Bun’s five-second default; explicit test and product limits remain enforced.

Current-main reconciliation evidence and hosted results remain separate from the
earlier branch's versions and subset. The November 2 owner direction authorizes
GitHub Actions for this release, superseding the completed Rust-port release's
local-only workflow for this candidate. Dependency caches and staged jobs reduce
repeated builds while retaining each required native and installed gate.

## Breaking Changes and Required Actions

Activate the Lakeview adapter with an explicit native/WASM runtime and retain the
source document. Do not treat declared dashboard shapes as executed SQL schemas,
rendering acceptance or cross-BI equivalence. Inspect incomplete diagnostics.

## Migration or Rollback Guidance

No database or infrastructure migration is performed. Retain previous archives
and source models; unknown content remains recoverable. Roll back package versions
rather than relabel or replace existing published assets.

## Known Issues and Support

Live Databricks acceptance and edited Lakeview rewrites are unqualified. Existing
adapter profiles retain their original semantic limits. Legacy broad source audits
have recorded pre-existing failures; no global audit-success claim is made. The
candidate is not released until its exact source and distribution gates pass.

## References

- [Current integration evidence](../04-build/evidence/lakeview/current-main-integration.json)
- [Lakeview contract](../02-design/contracts/CONTRACT-083-lakeview-dashboard-interchange.md)
- [Family integration audit](../04-build/evidence/stack-release-20261102/README.md)
