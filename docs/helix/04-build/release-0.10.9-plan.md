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

The exact production source is `9b36814d5b9eda1867d7893575e1acd718cfe4bb`
(tree `3ddb0ff850c92500818d6a0031c856bae0bd0554`), integrated through PRs
113 and 114. The native wheel qualifier now admits only this new version to the
existing completed-engine size profile; older bounds remain unchanged.
The frozen build tree contains 8,185 tracked inputs. The complete source archive
passed streaming comparison of all 70,594 Git members, including modes, symlinks
and bytes. Its uploaded draft asset digest matches the local archive.

Sol approved the separate 0.10.9 Codegen upload controller and its existing
trusted publisher workflow identity. Sixteen local policy tests passed; integrated
helper, test and workflow bytes match the reviewed/tested patch. The production
admission is filled from actual qualified artifacts and raw local receipts only.
[Current source and controller receipts](evidence/release-0.10.9/) retain these
completed checks separately from platform qualification and public publication.

## Completed Mac and browser qualification

The source-built Mac SDK is `53923b0606ee399737e32fb1836383c97e851f34d1c4fa19773563639455942a`;
its captured/live source closure is `da56e912e38fbc01b1f14155cd97d584962aaa09ebf95969e86d84bb2a357ede`
with a fixed-point transform and zero changed inputs. Native Node payload and
refusal assertions completed before an unrelated private Node WASM file-loader
probe failed; the raw exit 1 and exact passing-prefix witness remain explicit.
Bun and declaration checks passed separately. No SDK build or passing Node
payload check was repeated.

The Mac Core wheel was built once from the verified current sdist. Source,
platform, RECORD, CLI/version/resource checks passed. The pure Codegen wheel
reproduced byte-for-byte from its sdist. A private paired API probe had a function
alias typo after these completed checks; only that pending probe and unrun
metadata checks resumed. Both Python APIs now match the captured keyed output
and unkeyed refusal; all ten resource hashes pass. Raw producer exit 1 and the
actual uncoordinated approximately two-second resumption are recorded without
claiming a coordinated run, rebuild or installation.

Chromium 153 passed one exact installed-SDK request with zero external requests
or page errors. The refreshed workbench binds all sixteen compiler inputs and
its WASM bytes to that SDK. The local legal-appellate flow passed DDL/ORM/CRUD
previews, individual-download byte equality and seven-member ZIP hash/CRC checks.
[Portable receipts](evidence/release-0.10.9/) preserve the distinct scopes.

## Public microsite completion

PR116 integrated the qualified WASM and portable Mac proof. Deployment-only run
`41785909303` signed and deployed commit `836d8e5329c7cf39b2f182f26b8449a37984c8f1`.
The existing public verifier authenticated all seven site assets and the registered
build signature. The public legal-appellate flow completed generation, all three
previews and matching individual/ZIP downloads. Its final network classification
reported the known homepage stylesheet after the phase label changed. The raw
exit 1 is retained; a separate navigation-only CDP trace confirms the initiating
homepage document and stylesheet. Every external request was blocked, with zero
compiler requests or page errors. Public/local download bytes match. The
[combined proof](evidence/release-0.10.9/site-public-completion.json) keeps these
sources separate and records the release state at deployment.

## Linux installed qualification

The draft's Linux x86_64 SDK, CLI, manylinux Core wheel and Codegen wheel matched
the draft `SHA256SUMS` and were exercised from a fresh read-only directory in
linux/amd64 containers (emulated on an arm64 host). Installed Core/Codegen keyed
and unkeyed requests, ten resource hashes and `pip check` passed on CPython
3.11.18. The SDK passed Node 22 and Bun 1.4.4 keyed/unkeyed probes, the installed
consumer and declaration checks, with a Pack Tools digest identical across
Python, Node and Bun. The Linux SDK manifest declares the same source closure digest as the Mac record (read from the manifest, not recomputed). The Node
explicit WASM file-URL loader probe fails as it did on the Mac and remains an
excluded, retained failure. The CLI check covered only the `--version`/`codegen --version` handshake and byte equality with the wheel's embedded CLI. `linux-core-wheel-verification.json` was produced on macOS arm64 with Python 3.14, not on Linux. The Node image digest is recorded in the receipt. Receipts are in
[`evidence/release-0.10.9/`](evidence/release-0.10.9/linux-qualification-0109.json).

The [producer recovery](evidence/release-0.10.9/linux-producer-recovery.json)
connects the original Linux build, repair and upload to the released bytes.
The retained build source matches all 2,962 regular files from the release sdist.
The raw and repaired wheels match across 72 payload files outside `.dist-info`.
Auditwheel reported GLIBC 2.34 as the highest referenced symbol version and
repaired the wheel to `cp311-abi3-manylinux_2_34_x86_64`. The original CLI and
Node addon match the released archives. The two public SDKs share 2,074 files
byte for byte. The native addon and two manifests account for the differences.
Linux runtime qualification used amd64 emulation. The recovered producer scripts
allowed Cargo network access and configured four compiler jobs. They establish
retained inputs and outputs. Historical before/after maps and an independent
rebuild remain unverified.

## Release completion

GitHub lists immutable `umf-v0.10.9` at the frozen production commit as the
latest release. All 12 public download hashes match the staged manifest and
GitHub digests. The release supplies the full source archive, both CLIs, both platform SDKs,
two Core wheels, the Core sdist, the Codegen wheel and sdist, pins and checksums.

The trusted Core and Codegen publishers uploaded the three Core and two Codegen
archives through the locally qualified routes. A fresh local CPython 3.11 install
resolved the pinned pair from public PyPI and passed the Pack Tools and resource
checks. Node and Bun reproduced the exact keyed and unkeyed results from the
public Mac SDK. The public Mac CLI confirmed the version and resource manifest.
The signed microsite still serves the qualified WASM and provenance bytes.

The [publication receipt](evidence/release-0.10.9/public-publication.json) records
public artifact digests, upload runs, and local consumer results. The recorded
Node file-URL WASM loader failure remains outside the verified native Node/Bun
and browser/WASM paths.
