---
ddx:
  id: umf.plan.release-0-10-9
  type: implementation-plan
  activity: build
  authoring:
    home: repo
  links:
    - {id: umf.plan.release-0-10-7, kind: informed_by}
    - {id: umf.plan.rust-migration, kind: informed_by}
    - {id: ADR-006, kind: informed_by}
    - {id: FEAT-009, kind: informed_by}
    - {id: CONTRACT-080, kind: informed_by}
    - {id: CONTRACT-081, kind: informed_by}
    - {id: TP-001, kind: informed_by}
---

# Complete latest UMF release

## Scope

Publish one complete **0.10.9** successor containing all 0.10.8 capabilities and
all 0.10.7 platform deliveries. The immutable 0.10.8 release contains the 0.10.7
source changes, both Python Core wheels, both Rust CLIs, the generator companion
and browser runtime, but its only SDK archive is Linux x86_64. Its macOS Node/Bun
SDK delivery is missing. Preserve both existing immutable releases.

Artifact versions advance together. Semantic Core remains 0.10.0, metamodel 1.3
and vocabulary/operation profiles retain their independent identities. This is a
version and distribution correction; no new semantic implementation is selected.
The same worktree follows remote main; unpublished changes in other worktrees
are not imported.

## Implementation slices and validation

1. Align first-party package/Cargo/native versions and exact companion Core pin;
   admit only the new Core publisher cohort and skip automatic hosted tests.
   Regenerate canonical assets normally, then require a checked-in fixed point.
2. Freeze exact Git source and lockfiles. Build current Mac and Linux native
   artifacts with pinned cached tools, locked/offline Cargo, one compiler job per
   worker and at most two heavy workers. Both workers retain before/after input
   maps; join Linux provenance to the actual canonical SDK closure after it exists.
3. Build the Mac wheel once from an isolated verified current sdist with warm
   dependencies. Preserve strict sdist source inventory and wheel/source/RECORD
   verification. Do not claim a second fresh-target rebuild or feed invented
   receipt fields into the older coordinated verifier.
4. Build the pure companion, check its canonical source inventory, reproduce its
   wheel cheaply from its sdist and test its exact Core dependency/resource
   handshake. Publish the same archives on GitHub and PyPI. Preserve the exact admitted
   0.10.8 publisher and add a separate source/digest-pinned 0.10.9 local qualification
   admission through the existing trusted publisher workflow identity.
5. Ship a complete explicit roster: full source, two CLI archives, **two separately
   named platform SDK archives**, two Core wheels, common Core sdist, companion
   wheel/sdist, release pins and checksums. Source/core/vocabulary identities
   remain explicit. Review exact asset names, platform manifests and digests.
6. Reuse prior semantic evidence for unchanged implementation bytes. Run only
   current-version source/package checks and small installed keyed/unkeyed,
   resource and host-binding probes. Do not repeat the closed 28-pack, fourteen
   Rust or PostgreSQL grant campaigns. Compare source fingerprints to justify reuse.
7. Publish immutable GitHub 0.10.9 and exact Core and Codegen PyPI archives through
   locally-qualified upload routes. Verify public metadata, byte identity and one
   fresh installed pack-generator request. All builds and behavioral tests stay local.
8. Keep the already verified microsite live. Refresh its focused WASM/provenance
   from the new released SDK if compiler/version inputs change; check its strict
   source/asset guards and one public preview/download flow for the changed bytes.

## Execution contract

Root owns official writes, Git, source freezes, launches and publication. GPT-6.1
Sol plans/reviews; GPT-6 Luna prepares implementation and packaging work. Every
heavy launch uses the existing audited shared coordinator with escalation for its
process-ownership checks. The approved allowance extension preserves all prior
usage and charges. Preserve user-owned `.tmp/` and foreign caches/containers.

## Continuation evidence

The 0.10.7 release record supplies current compiler semantics, both host cohorts
and public generation/download evidence. Actual 0.10.8 source and public SDK
metadata establish the missing Mac SDK platform. Private build receipts are
collected under `/private/tmp/umf-0109-release/`; final portable public evidence
belongs under this activity's `evidence/release-0.10.9/` directory.

## Risks and rollback

- Immutable releases cannot be amended: publish the complete successor without
  relabeling an older binary or changing existing tags.
- Resource/version drift: normal canonical producers and source closure checks
  remain mandatory; no private generated-source transformation is accepted.
- Missing platform or false provenance: inspect actual native targets, retain
  original build receipts and validate both named SDK archives before publication.
- Qualification sprawl: retain unchanged semantic proofs and execute only the
  changed version, package and installed boundaries.

## Exit criteria

The latest release has both Rust/CLI, Python Core and Node/Bun platform cohorts,
the browser/WASM resources, the repaired exact-version generator companion and a
working microsite. All selected artifact versions agree, public hashes match the
reviewed candidates, actual installed generation passes, and final evidence and
this plan are reviewed and merged. No hosted behavioral tests are required.

## Source preparation evidence

Sol approved the version, documentation and narrowly extended Core publisher policy.
All 332 external Cargo dependency identities/checksums remain unchanged. The normal
canonical producer and fixed-point/self checks passed; 25 release policy checks
passed. Generated enforcement differs only in compiler provenance, preserving the
existing semantic baseline. Remote main advanced with Codegen 0.10.8 public PyPI
proof, so the successor now includes both Python distributions on PyPI. The
0.10.8 admission remains unchanged; 0.10.9 receives its own exact local admission.
