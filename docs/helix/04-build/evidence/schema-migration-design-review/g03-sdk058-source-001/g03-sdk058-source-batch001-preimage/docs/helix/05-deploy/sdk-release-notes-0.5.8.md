---
ddx:
  id: umf.sdk-release-notes-0.5.8
  type: release-notes
  activity: deploy
  status: draft
  authoring:
    home: repo
  links:
    - id: CONTRACT-081
      kind: informed_by
    - id: SD-007
      kind: informed_by
    - id: TD-085
      kind: informed_by
    - id: STP-085
      kind: informed_by
    - id: umf.plan.schema-migrations
      kind: informed_by
---

# UMF SDK 0.5.8 — candidate preparation, not released

## Release Scope

SDK 0.5.8 is a candidate coordinate for the proposed G03 successor. No release
date, producer commit, merge, tag, GitHub release ID, archive digest, or public
download is established yet. This draft records intended scope and current
qualification limits; it is not a release announcement. The existing immutable
SDK 0.5.7 release remains unchanged.

The candidate dependency tuple is Access 0.1.0.dev8, Codegen 0.1.0a5,
`umf-core` distribution 0.10.3 (semantic Core 0.10.0), and Weft 0.4.56. The
final selected 18-wheel cohort uses Core wheel SHA-256
`cd35f255900ec122e5e2d47d1fbac658cc127d3f16ba82e643e199b7d8cebd75` and Weft
0.4.56. The whole cohort requires glibc 2.34 even though the x86_64 and aarch64
Weft wheels are individually tagged manylinux2_17. Functional qualification
currently covers the selected Linux CPython 3.11 cohort.

## Audience and Channels

| Audience | Why they care | Delivery channel |
| --- | --- | --- |
| SDK consumers | A successor package is being prepared for a new compiler dependency cohort; it is not available for installation yet. | This candidate note and a future immutable GitHub release, if approved |
| Migration operators | G03 support remains bounded by the selected final Linux cohort and the recorded native evidence. | G03 evidence packet and the migration plan |
| Internal reviewers | Source, package, browser, dependency and public-proof gates must close before release. | HELIX build evidence and reviewed release metadata |

## Highlights

- Candidate metadata targets the accepted Weft 0.4.56 cohort without changing any of the other 17 selected distributions.
- A narrow test adapter now targets the installed SDK public entrypoint in Chromium using the existing G03 discovery/plan corpus.
- Existing native observations and source-accepted macOS static evidence retain their original qualification boundaries.

## Required Actions Summary

- Users: no action; this candidate is not published or installable.
- Operators: do not use the candidate for a migration until all inherited gates, reviews, merge, publication and fresh public proof pass.
- Support: do not describe this draft as a completed G03 release.

## Changes and Fixes

### New or Improved

| Area | What changed | Who is affected |
| --- | --- | --- |
| SDK release metadata | Candidate package version is 0.5.8; the SDK archive and consumer proof have not yet been generated. | SDK release reviewers |
| Installed SDK browser parity | Added a source adapter that compares the installed public entrypoint with the shared G03 discovery/plan corpus in real Chromium. It has not been executed. | Qualification reviewers |

### Fixes

No shipped fixes are claimed in this candidate draft.

## Breaking Changes and Required Actions

No compatibility change is claimed. The candidate must not be treated as a
replacement for SDK 0.5.7 until the selected artifact set and its exact
qualification are reviewed and published.

| Change | Impact | Required action | Deadline or trigger |
| --- | --- | --- | --- |
| Candidate successor to SDK 0.5.7 | The candidate targets Weft 0.4.56; SDK 0.5.7 remains bound to Weft 0.4.55. | Wait for the exact successor package, cohort, review and publication proof. | Before any G03 use |

## Migration or Rollback Guidance

### Upgrade or Migration

1. Do not install this candidate from the repository metadata; no SDK archive or public release exists yet.
2. After an approved release exists, use only the exact published asset hashes and the compatible selected dependency cohort recorded in the final notes.
3. Follow the source-bound migration plan and host approval, fencing, transaction and recovery requirements.

### Rollback or Hold Guidance

- Pause any rollout if the installed SDK, Weft wheel, cohort lock, source identity or reviewed release asset differs from the final published pins.
- Keep the existing SDK 0.5.7 release immutable; resolve successor issues through a new reviewed version.
- Follow the host's authenticated recovery procedure for any migration already dispatched; never repeat an uncertain committed operation.

## Known Issues and Support

| Issue | Who is affected | Workaround or next step |
| --- | --- | --- |
| Candidate SDK build and 139-case installed-consumer proof are pending. | SDK consumers and reviewers | Root must run the bounded standard SDK producer route after source review. |
| G03 installed-SDK Chromium parity adapter is source-only and unexecuted. | Qualification reviewers | Execute only after independent source review using the exact installed candidate archive and pinned local Chromium. |
| Final table and Truss inherited lanes, release review, merge, immutable publication and fresh public proof remain gates. | All prospective G03 users | Keep publication and support claims held until each exact gate has accepted evidence. |
| ARM64 and macOS Weft evidence is build/static-only; macOS runtime/native/browser support is not established. | ARM64/macOS users | Do not infer functional compatibility from wheel tags or static inspection. |

## References

- [Schema migration plan and G03 continuation](../04-build/schema-migration-plan.md)
- [G03 final 0.4.56 local qualification checkpoint](../04-build/evidence/schema-migration-design-review/g03-final-056-local-qualification-001/README.md)
- [Installed SDK G03 browser parity adapter](../../../scripts/g03-sdk-browser.ts)
- [Prior immutable SDK 0.5.7 notes](sdk-release-notes-0.5.7.md)
