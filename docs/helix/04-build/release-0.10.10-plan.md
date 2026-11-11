---
ddx:
  id: umf.plan.release-0-10-10
  type: implementation-plan
  activity: build
  authoring:
    home: repo
  links:
    - {id: umf.plan.release-0-10-9, kind: informed_by}
    - {id: ADR-006, kind: informed_by}
    - {id: ADR-002, kind: informed_by}
---

# UMF 0.10.10 WASM loader release

## Scope

Release the complete coupled 0.10.10 cohort with a working Node local-file WASM initializer. The maintenance source derives from the qualified 0.10.9 source at `9b36814d5b9eda1867d7893575e1acd718cfe4bb`, its reviewed qualification corrections, and the loader, version and necessary packaging changes selected for this release. Freeze its exact resulting commit and tree as source S. The default-branch publisher source is controller Q and has its own reviewed commit and tree. Integrate the loader fix into current main separately.

The governing prior release plan is `docs/helix/04-build/release-0.10.9-plan.md`. ADR-006 assigns shared executable semantics to Rust and loading to host wrappers. ADR-002 retains Bun development and real-browser verification as qualified by ADR-006. The existing public Node/Bun and browser operations keep their contracts.

## Shared Constraints

- Advance first-party SDK, Rust, Node, WASM, Python Core and Codegen artifact versions together to 0.10.10. Keep semantic Core, vocabularies and wire profiles at their independently specified versions.
- Fix the built-in loader at `bindings/core/wasm/index.js`, which supplies the installed `@umf/core/runtime/wasm` entry. Read local WASM bytes in the Node conditional package entry and pass them to the generated initializer. Browser HTTP initialization and supplied loader hooks follow their existing contracts.
- Build genuine version 0.10.10 native and WASM artifacts once using pinned warm caches, locked Cargo inputs and retained source maps. Preserve source and output provenance through packaging. Generated sources use their established canonical producers and fixed-point checks.
- Reuse semantic evidence only after comparing its relevant implementation inputs with S. Preserve the exact version, subset and original evidence scope of each reused claim. Run completed checks again only when a changed input, failed check or unresolved concern requires it.
- Perform behavioral qualification locally. Hosted trusted publishers perform authenticated metadata, archive, digest, collision, upload and public-byte checks.

## Implementation Slices

| Slice | Area | Depends on | Verification gate |
|---|---|---|---|
| B-001 | Confirm maintenance source and loader boundary | Existing 0.10.9 evidence | Identify every built-in initializer, injected loader contract, installed export and browser bundle consumer. Record S candidate changes and evidence reuse map. |
| B-002 | Implement loader fix and focused regression | B-001 | Actual Node public `initializeWasm()` succeeds from local files and executes one operation. Bun initialization and supplied loader behavior pass. Focused real Chromium initialization passes with browser globals and request behavior recorded. |
| B-003 | Align versions and canonical package resources | B-002 | Exact cohort version checks, generated-source checks and resource manifests agree. External dependency identities remain pinned. Admit only this version to the established native wheel qualification bounds. Freeze S commit, tree and full input inventory. |
| B-004 | Build Mac and Linux distributions | B-003 | One source-built CLI, native addon and Core wheel per platform, common Core sdist, pure Codegen wheel/sdist and genuine WASM. Retain tool versions, platform, source maps, archive inventories and hashes. Build Codegen from the exact matching Core resource cohort. |
| B-005 | Qualify packaged candidates locally | B-004 | Source/archive inventory, wheel RECORD and metadata, installed version and resource handshakes, exact Core dependency, SDK declarations and changed loader/public browser boundary pass. Reuse prior unchanged semantic proofs with recorded source joins. |
| B-006 | Prepare exact local publisher admissions | B-005 | Sol reviews Q, frozen S/tree, committed admission digests, original local qualification receipts, archive/resource maps and immutable release roster. Focused local publisher regressions pass. |
| B-007 | Publish complete release and Python pair | B-006 | All twelve assets and hashes are verified before making GitHub release latest. Core public bytes match first. One local public Core install supplies the Codegen prerequisite. Codegen public bytes match. |
| B-008 | Close public verification and documentation | B-007 | Public SDK and CLI digests match the locally tested bytes. Fresh public Python install provenance, exact registry digests, and latest release status pass. Record portable evidence and completed scope in the build activity. |

## Execution Contract

The user authorizes the loader fix, complete successor release and local qualification. Root owns official changes, source freeze, Git and publication. Sol 6.1 plans and reviews. Luna implements and prepares packaging. Continue through recoverable failures and retain raw partial results. Budget and token estimate are unknown because no new numeric ceiling was supplied. Existing runtime resource controls and any recorded session allowance remain applicable.

Portable evidence is retained under `docs/helix/04-build/evidence/release-0.10.10/`.

## Exact Local Publication Route

Use the existing trusted PyPI workflow identities and a distinct explicit 0.10.10 local qualification selection. Bind the official repository, default branch, exact tag `umf-v0.10.10`, frozen S commit/tree, reviewed Q commit/tree, committed admission digest, release-pins digest and SHA256SUMS digest. The ordinary parked 0.10.10 candidate selection continues to enforce its original owner receipts and validators. The local selection has mutually exclusive job conditions and passes only its own exact validated admission.

The Core admission binds the three original Core archives and original local source, native, installed/resource and SDK/browser evidence. Validate receipt content and identity against actual retained schemas and archive contents. Authenticate public tag, commit/tree and full GitHub asset roster, then stage only the exact three original Core archives. Preserve collision refusal and exact registry-byte verification before and after OIDC upload.

The Codegen admission binds its two original archives, matching Core files, exact Core dependency, resource/protocol maps and local qualification evidence. Adapt the proven 0.10.9 local validator with separately fixed 0.10.10 admission and source identities. After Core publication, validate its exact public archive hashes and original local installed Core receipt before Codegen upload. Stage only the two admitted Codegen archives. Authenticate public Codegen bytes after upload.

Automatic release dispatch excludes this manually qualified cohort. Only the explicitly selected local route skips hosted unit/installed-consumer testing. Run its changed publisher policy checks locally once. Authenticated hosted upload receipts and local consumer receipts retain their actual provenance and scopes.

## Validation Plan

Retain the exact earlier failing probe importing `initializeWasm` from `@umf/core/runtime/wasm` as the Node regression entry. Cover the helper shared by the other built-in initializers, supplied loaders and browser bundling. Validate the installed successor package after packaging. A prior passing source probe closes only its recorded source state.

Use the established archive/source and metadata/resource validators for the new cohort. Record exact commands, tool versions, input identities, outcomes and evidence paths. New version/package verification applies to the new artifacts. Semantic behavior campaigns already passing for identical implementation inputs are reused with explicit source joins.

## Risks and Rollbacks

| Risk | Response | Recovery |
|---|---|---|
| Deferred Node loading enters the browser bundle incorrectly | Inspect browser build and run focused Chromium probe | Correct the wrapper before freezing S |
| New package version causes canonical resource drift | Run canonical producer and verify fixed point and manifest identities | Repair source inputs and regenerate before build |
| Platform artifacts diverge from S | Compare captured source inventories and actual payloads | Repair only failed producer output and requalify affected boundary |
| Publisher job selects the wrong profile or both profiles | Test mutually exclusive selection and exact source/admission rejection | Repair Q before dispatch |
| Partial registry upload or existing different bytes | Preserve collision refusal and inspect exact public state | Retry only matching or absent archives through the authenticated route |

## Exit Criteria

The loader fix is integrated on the maintenance source and current main. The full latest immutable release supplies source, two platform CLI archives, two platform SDK archives, two Core wheels, common Core sdist, Codegen wheel/sdist, release pins and checksums. These are the established twelve release assets. Every shipped artifact identifies the 0.10.10 cohort and matches its reviewed public digest. Public exact Python installation, Node/Bun local WASM loading and the qualified browser path pass within their recorded scopes. Sol review and portable build evidence close all required slices.

## Continuation Evidence

At each interruption, record S/Q identities, completed slices and exact passing evidence, pending slices, genuine failures and the next action. Reconcile source and archive identity before resuming. The frozen maintenance source is `85504b0913261c208a53010a5a67aa6fa54c3a59`
(tree `4770fa46ef6a0b7f7d45758daab73af74d47f061`). The reviewed controller is
`03dc0fc35d71fe51171e796f606695364f8ecb63` (PR136). The loader and dependency
copy fixes are integrated on main through PR134 and PR135.

[Local qualification](evidence/release-0.10.10/qualification.json) binds the
complete product roster. Node and Bun on both platforms initialized local WASM
with zero fetch calls. Chromium 153 initialized the HTTP runtime and browser
root with no page errors or external requests. The Python pair passed on both
platforms, with an exact native CLI and ten-resource handshake. Linux ran
under amd64 emulation with glibc 2.34. The exact draft twelve-asset roster matches
the local checksums.

The SDK source checks exposed two stale generated attestations after the package
export change. The normal metamodel and action identity writers corrected them.
Generated runtime resources remained identical across the attestation refresh.
The refreshed Mac wheel contains byte-identical native members. The final
[sdist source join](evidence/release-0.10.10/native-s4-source-join.json) records
the exact common native input archive and the action identity path outside it.

[Public verification](evidence/release-0.10.10/public-publication.json)
closes B-007 and B-008. GitHub serves the immutable 12-asset release at the
frozen source tag and identifies it as latest. The public asset roster and
downloaded checksum manifest match the locally qualified products.

The Core admission merged in PR138 and the Codegen admission merged in PR139.
The existing trusted publishers uploaded and verified the exact three Core and
two Codegen archives in runs `42944416034` and `42945408207`. A clean local
CPython 3.11 environment installed the published pair from PyPI. Its Core wheel,
native CLI, ten resources and Codegen wheel match the qualified products.
Codegen pins the exact matching Core version. Behavioral qualification ran
locally, with GitHub Actions used for publishing and registry byte verification.
