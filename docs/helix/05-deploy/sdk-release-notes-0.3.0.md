---
ddx:
  id: umf.sdk-release-notes-0.3.0
  type: release-notes
  activity: deploy
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.implementation-plan
      kind: informed_by
    - id: CONTRACT-067
      kind: informed_by
    - id: CONTRACT-068
      kind: informed_by
    - id: CONTRACT-069
      kind: informed_by
---

# UMF SDK 0.3.0

## Release Scope

Candidate `umf-v0.3.0`, prepared on 2026-10-16 for the bundled TypeScript SDK,
signed documentation site and attached experimental Python Typed SDK wheel.
Publication is pending final combined signatures, CI, main deployment and asset
verification. The delivery manifest accompanying the release identifies the
exact shipped main commit, asset hashes and deployment. This draft does not
claim those gates have completed.

## Audience and Channels

| Audience | Change | Channel |
| --- | --- | --- |
| TypeScript and metadata consumers | Updated bundled APIs and browser tooling | GitHub SDK archive |
| Python generator/runtime evaluators | Reviewed Typed SDK semantics and scoped execution evidence | Experimental wheel and repository guides |
| Engineers exploring UMF | Generated schema, extension, API and integration reference with local tools | Signed documentation website |

## Highlights

- Generate typed Python models, keys, codecs and action clients with exact
  source and generation binding. Build checked-in query/action catalogs through
  Weft while preserving engine-owned admission, action and publication protocols.
- Inspect schemas, extension versions, public APIs and qualified integration
  evidence through the generated reference and fixed local browser tools.
- Use the browser SQL-to-actions/store demonstration under its declared bounded
  profile. Its historical native/compiler cohorts retain their original pins.

## Required Actions Summary

TypeScript users install the attached `umf-sdk.tgz`; this release does not
publish an npm package. Python Typed SDK evaluators install the attached
`umf_access` prerelease wheel with its pinned Pydantic dependency, and regenerate
packages/catalogs for that exact runtime and source. Website readers need no
migration. Hosts retain responsibility for connections, credentials, native
admission and engine adapters.

## Changes and Fixes

| Area | Result |
| --- | --- |
| Typed source and key identity | Stale cohorts, alternate selected keys, changed action sources and mismatched catalog inputs refuse explicitly |
| Codec boundaries | Raw value graphs are revalidated; generated validators delegate to the reviewed runtime and sanitize refusals |
| Reads and catalogs | Continuation carriers/nullability, native Key equality and count/tuple provenance remain checked across current engine and raw-target APIs |
| Search and actions | Newer native/bulk/search interfaces coexist with source-bound generated clients and engine-owned execution |
| Reference publication | Portable Protobuf notices and complete pinned license inputs remove host/cache-dependent signature drift |
| Documentation | Generated assets are rebuilt together and signed over their exact published bytes |

## Breaking Changes and Required Actions

The Typed SDK remains experimental at `0.1.0.dev0`; the bundled TypeScript SDK
version is `0.3.0`. Do not mix generated packages, catalogs or persisted cursors
from different source/runtime cohorts. Regenerate and deliberately readmit them
when upgrading. Stricter checks can refuse values or artifacts that earlier
code accepted. No automatic database migration, action bypass or engine
publication/ACK protocol change is introduced.

## Migration or Rollback Guidance

Pin the release archive and wheel by the accompanying SHA-256 manifest. Keep
original UMF source documents and generation profiles, regenerate into a new
output tree, and qualify the selected target before adopting it. Preserve the
previous runtime, generated package and catalog together for rollback. A
website rollback must restore a complete signed artifact set; do not combine
pages with signatures from another build.

## Known Issues and Support

Temporal qualification remains **HELD**. Managed Lakebase/Unity Catalog service
qualification, full STP closure, and Truss/Ashlar Typed SDK adoption remain
separate obligations. Local PostgreSQL/pgvector and recorded local Delta results
are scoped evidence, not those service claims. Reference inventory counts do
not establish native support. Historical browser/native receipts are not
relabelled as fresh current-source acceptance.

Use the repository issue tracker with the release tag, target/profile versions,
exact source pins and a sanitized reproduction. Qualification and execution
limits remain documented in the linked evidence.

## References

- [Typed SDK design and build handoff](../04-build/typed-persistence-design.md)
- [Current-main SDK review evidence](../04-build/evidence/typed-persistence/pr21-d409-release-20261016/README.md)
- [Integrated non-temporal native evidence](../04-build/evidence/typed-persistence/integrated-native-20261016/README.md)
- [Action beginner and execution guide](../04-build/guides/actions/index.md)
- [Implementation plan](../04-build/implementation-plan.md)
