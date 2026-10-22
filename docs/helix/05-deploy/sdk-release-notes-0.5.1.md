---
ddx:
  id: umf.sdk-release-notes-0.5.1
  type: release-notes
  activity: deploy
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-033
      kind: informed_by
    - id: CONTRACT-079
      kind: informed_by
    - id: CONTRACT-080
      kind: informed_by
---

# UMF SDK 0.5.1

## Release Scope

Published release: SDK 0.5.1, official core Python 0.10.0 and experimental
`umf_access` 0.1.0.dev3. Current source admission is UMF 0.10.0. The SDK archive,
core wheel and host wheel have separate identities and delivery checksums.
The frozen candidate passes its recorded installed and local native checks with
Weft 0.4.46. Scoped qualification is recorded in the [candidate evidence](../04-build/evidence/unified-sdk-051-release-qualification.md). Publication
and final release-asset delivery verification are complete; the final public
cohort uses Weft 0.4.47. See the [published release](https://github.com/DocumentDrivenDX/umf/releases/tag/umf-v0.5.1)
and the delivery section of that qualification record.

## Audience and Channels

Generated-client consumers receive the SDK and Python wheels as separate release
assets. Table-host maintainers must qualify their compiler, driver, connection
and transaction policy; generated application packages require only Python's
standard library.

## Highlights

- Generated `SyncClient`/`SyncActions` join the existing async `Client`/`Actions`
  API, with explicit `AsyncClient`/`AsyncActions` aliases. Both modes share typed
  models, exact codecs and wire requests; sync execution does not run an event
  loop. Cross-mode bindings refuse explicitly.
- The host supports Pydantic `>=2.13,<3`, with installed compatibility evidence
  for 2.13.5 and 2.14.1. Its actual MISSING sentinel preserves absence separately
  from explicit null.
- Current Praxis-derived declarations generate six record APIs and all 20 typed
  handler-action methods. Known `hohfeld.view` presentation metadata is retained
  opaquely. Handler implementations, connections, authorization and commits
  remain consumer-owned.
- MIT OR Apache-2.0 licensing is included in source and package metadata.

## Changes and Fixes

Generated requests omit optional MISSING arguments, retain named precondition
failures and sanitize transport errors. A lost or cancelled write remains an
unknown outcome and is not retried. Generated names cannot shadow public runtime
exports, including exception classes. Current Weft admission fixes cover optional
authored names and the narrowly declared opaque metadata subset; source bytes
and pins remain exact.

## Breaking Changes and Required Actions

Regenerate application packages with SDK 0.5.1 before using the sync API. Hosts
install the separate dev3 wheel and select a synchronous or asynchronous
transport explicitly. Existing async names remain available.

Current APIs accept only UMF 0.10.0. Earlier source formats require explicit
authoring conversion outside the runtime; old installation upgrades are not
provided. Independently versioned backend and codec identifiers do not imply
admission of an older UMF source format.

## Migration or Rollback Guidance

Keep the exact source, generated package, compiler and host cohort together.
Preserve prior artifacts for rollback; do not combine source digests, cursors or
consistency tokens from different cohorts. Release assets must retain their
published bytes and hashes.

## Validation

The frozen SDK passes 139 installed SDK conformance cases with all 1,709 package files
checked. Focused generator, sync/async and boundary tests, both TypeScript
projects and generated-source identity checks pass. Bun and Chromium generation
agree for commerce and the derived current Praxis fixture. All three Python
checkers accept the positive corpus and reject its 11 distinct negative sites.
The P1 evidence separately records installed Pydantic compatibility; the core
and host components retain their recorded installed checks.

The final three-test access campaign passes the independent ontology-host case
and both actual commerce/Praxis-derived table cases through the installed host,
Weft 0.4.46 and PostgreSQL. The Praxis case exercises generated list, cursor and
by-key reads, one consumer-owned ChangeCoverageLevel handler and read-after-write
with the returned consistency token. Separately, Truss's Pizza, Northwind and
catalog native real-schema checks pass against the same compiler candidate.

**Pending:** publication and final release-asset delivery verification. Truss's
full stress matrix is a separate pending qualification; these focused results do
not establish its performance envelope. No production Praxis or Hohfeld adoption
is claimed.

## Known Issues and Support

The table host currently admits only to-one relationship bindings. The actual
Praxis fixture contains many-valued relationships; those bindings must refuse
explicitly. The fixture does not qualify broader relationship projection or
sparse-record absence through nullable SQL tables. Its action contracts describe
external handlers; generating a method does not implement that handler.

This release covers the implemented CONTRACT-079 cut. Broader batches,
TypeScript output, naming overrides, API diff and native connection lifecycle
remain separately scoped work. Unknown semantic meaning is preserved or refused,
not silently interpreted.

## References

- [Unified Python access contract](../02-design/contracts/CONTRACT-079-unified-python-access.md)
- [Generate and use the client](../04-build/guides/unified-python-access.md)
- [P1 implementation evidence](../04-build/evidence/praxis-p1.md)
- [Current Praxis fixture, migration and provenance](../04-build/evidence/unified-praxis-current010/README.md)
- [SDK 0.5.1 candidate qualification](../04-build/evidence/unified-sdk-051-release-qualification.md)
- [Stack licensing evidence](../04-build/evidence/stack-licensing.md)
